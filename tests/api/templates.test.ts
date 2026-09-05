import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as listTemplates, POST as createTemplate } from '@/app/api/templates/route';
import {
  DELETE as deleteTemplate,
  GET as getTemplate,
  PATCH as patchTemplate,
} from '@/app/api/templates/[id]/route';
import { POST as createSimulation } from '@/app/api/simulations/route';
import { prisma } from '@/lib/db';
import {
  MAX_TEMPLATES_PER_USER,
  applyTemplate,
  builtInTemplate,
  type StoredTemplate,
  type TemplatesPayload,
} from '@/lib/game/scenario-templates';
import { getStartingMetrics } from '@/lib/game/starting-metrics';
import { generateInitialTurn } from '@/lib/llm';
import { resetDatabase, signIn, signOut, type SignedInUser } from '../helpers/db';
import { initialTurnFixture } from '../helpers/fixtures';
import { getRequest, jsonRequest, readJson } from '../helpers/http';
import type { ApiResponse } from '@/types';

vi.mock('@/lib/llm', () => ({
  generateInitialTurn: vi.fn(),
  generateNextTurn: vi.fn(),
  generateFinalReport: vi.fn(),
  suggestTags: vi.fn(),
}));

let user: SignedInUser;

const VALID = {
  name: 'Week 3 exercise',
  description: 'A tight-cash retail scenario',
  industry: 'Retail',
  difficulty: 'Medium',
  companySize: 'Small',
  metricModifiers: { cash: -200_000 },
};

beforeEach(async () => {
  await resetDatabase();
  vi.mocked(generateInitialTurn).mockResolvedValue(initialTurnFixture());
  user = await signIn('teacher@example.com', 'Teacher');
});

const create = (body: unknown) => createTemplate(jsonRequest('/api/templates', body));
const detail = (id: string) => getTemplate(getRequest(`/api/templates/${id}`), { params: { id } });
const update = (id: string, body: unknown) =>
  patchTemplate(jsonRequest(`/api/templates/${id}`, body, 'PATCH'), { params: { id } });
const remove = (id: string) =>
  deleteTemplate(getRequest(`/api/templates/${id}`), { params: { id } });

async function data<T>(response: Response): Promise<T> {
  const body = await readJson<ApiResponse<T>>(response);
  if (!body.success) throw new Error(body.error);
  return body.data;
}

describe('GET /api/templates', () => {
  it('answers 401 for an anonymous visitor', async () => {
    signOut();
    expect((await listTemplates()).status).toBe(401);
  });

  it('always offers the built-in presets', async () => {
    const payload = await data<TemplatesPayload>(await listTemplates());

    expect(payload.builtIn.length).toBeGreaterThan(0);
    expect(payload.builtIn.every((t) => t.key.startsWith('builtin:'))).toBe(true);
  });

  it('lists no saved templates for a new account', async () => {
    expect((await data<TemplatesPayload>(await listTemplates())).mine).toEqual([]);
  });

  it('lists the caller saved templates, not anybody else', async () => {
    const other = await prisma.user.create({
      data: { email: 'other@example.com', passwordHash: 'x' },
    });
    await prisma.scenarioTemplate.create({
      data: { userId: other.id, name: 'Theirs', industry: 'SaaS', difficulty: 'Easy', companySize: 'Small' },
    });
    await create(VALID);

    const payload = await data<TemplatesPayload>(await listTemplates());
    expect(payload.mine.map((t) => t.name)).toEqual(['Week 3 exercise']);
  });

  it('orders the most-used template first', async () => {
    await create({ ...VALID, name: 'Rarely used' });
    const popular = await data<StoredTemplate>(await create({ ...VALID, name: 'Often used' }));
    await prisma.scenarioTemplate.update({
      where: { id: popular.id },
      data: { usageCount: 9 },
    });

    const payload = await data<TemplatesPayload>(await listTemplates());
    expect(payload.mine[0].name).toBe('Often used');
  });
});

describe('POST /api/templates', () => {
  it('answers 401 for an anonymous visitor', async () => {
    signOut();
    expect((await create(VALID)).status).toBe(401);
    expect(await prisma.scenarioTemplate.count()).toBe(0);
  });

  it('answers 201 and stores the template', async () => {
    const response = await create(VALID);

    expect(response.status).toBe(201);
    const created = await data<StoredTemplate>(response);
    expect(created.name).toBe('Week 3 exercise');
    expect(created.metricModifiers).toEqual({ cash: -200_000 });
    expect(await prisma.scenarioTemplate.count({ where: { userId: user.id } })).toBe(1);
  });

  it('defaults the description and the modifiers', async () => {
    const created = await data<StoredTemplate>(
      await create({ name: 'Bare', industry: 'SaaS', difficulty: 'Hard', companySize: 'Medium' })
    );

    expect(created.description).toBe('');
    expect(created.metricModifiers).toEqual({});
  });

  it('answers 400 for a setup outside the supported list', async () => {
    expect((await create({ ...VALID, industry: 'Aerospace' })).status).toBe(400);
    expect(await prisma.scenarioTemplate.count()).toBe(0);
  });

  it('answers 400 for a modifier on something that is not a startable metric', async () => {
    const response = await create({ ...VALID, metricModifiers: { cheatMode: 1 } });

    expect(response.status).toBe(400);
    expect(await readJson(response)).toMatchObject({ success: false, error: 'Invalid input' });
  });

  it('answers 400 for a modifier past its limit', async () => {
    expect((await create({ ...VALID, metricModifiers: { reputation: 400 } })).status).toBe(400);
  });

  it('answers 409 for a name the caller already used', async () => {
    await create(VALID);
    const response = await create(VALID);

    expect(response.status).toBe(409);
    expect(await prisma.scenarioTemplate.count()).toBe(1);
  });

  it('lets a different user reuse the same name', async () => {
    await create(VALID);
    await signIn('another@example.com');

    expect((await create(VALID)).status).toBe(201);
  });

  it('refuses more templates than a user may keep', async () => {
    for (let i = 0; i < MAX_TEMPLATES_PER_USER; i++) {
      expect((await create({ ...VALID, name: `Preset ${i}` })).status).toBe(201);
    }

    expect((await create({ ...VALID, name: 'One too many' })).status).toBe(409);
  });
});

describe('/api/templates/[id]', () => {
  let templateId: string;

  beforeEach(async () => {
    templateId = (await data<StoredTemplate>(await create(VALID))).id;
  });

  it('answers 401 for an anonymous visitor', async () => {
    signOut();
    expect((await detail(templateId)).status).toBe(401);
    expect((await update(templateId, VALID)).status).toBe(401);
    expect((await remove(templateId)).status).toBe(401);
  });

  it('answers 404 for a template that does not exist', async () => {
    expect((await detail('no-such-id')).status).toBe(404);
    expect((await remove('no-such-id')).status).toBe(404);
  });

  it('answers 403 for somebody else template', async () => {
    await signIn('intruder@example.com');

    expect((await detail(templateId)).status).toBe(403);
    expect((await update(templateId, VALID)).status).toBe(403);
    expect((await remove(templateId)).status).toBe(403);
    expect(await prisma.scenarioTemplate.count()).toBe(1);
  });

  it('returns the template to its owner', async () => {
    const template = await data<StoredTemplate>(await detail(templateId));

    expect(template.id).toBe(templateId);
    expect(template.metricModifiers).toEqual({ cash: -200_000 });
  });

  it('updates the template', async () => {
    const response = await update(templateId, {
      ...VALID,
      name: 'Renamed',
      metricModifiers: { morale: 15 },
    });

    expect(response.status).toBe(200);
    const updated = await data<StoredTemplate>(response);
    expect(updated.name).toBe('Renamed');
    expect(updated.metricModifiers).toEqual({ morale: 15 });
  });

  it('answers 409 when renaming onto another template name', async () => {
    await create({ ...VALID, name: 'Taken' });
    const response = await update(templateId, { ...VALID, name: 'Taken' });

    expect(response.status).toBe(409);
  });

  it('lets a template keep its own name through an update', async () => {
    expect((await update(templateId, { ...VALID, description: 'Reworded' })).status).toBe(200);
  });

  it('deletes the template', async () => {
    expect((await remove(templateId)).status).toBe(200);
    expect(await prisma.scenarioTemplate.count()).toBe(0);
  });
});

describe('launching a simulation from a template', () => {
  const launch = (body: unknown) => createSimulation(jsonRequest('/api/simulations', body));

  it('opens at the plain starting position when no template is named', async () => {
    const { id } = await readJson<{ id: string }>(
      await launch({ industry: 'Retail', difficulty: 'Medium', companySize: 'Small' })
    );

    const stored = await prisma.simulation.findUniqueOrThrow({ where: { id } });
    expect(stored.cash).toBe(getStartingMetrics('Retail', 'Medium', 'Small').cash);
    expect(stored.templateKey).toBe('');
  });

  it('applies a built-in preset modifiers', async () => {
    const preset = builtInTemplate('builtin:cash-crunch');
    if (!preset) throw new Error('preset missing');

    const { id } = await readJson<{ id: string }>(
      await launch({
        industry: preset.industry,
        difficulty: preset.difficulty,
        companySize: preset.companySize,
        templateKey: preset.key,
      })
    );

    const expected = applyTemplate(
      preset.industry,
      preset.difficulty,
      preset.companySize,
      preset.metricModifiers
    );
    const stored = await prisma.simulation.findUniqueOrThrow({ where: { id } });

    expect(stored.cash).toBe(expected.cash);
    expect(stored.cash).toBeLessThan(getStartingMetrics(preset.industry, preset.difficulty, preset.companySize).cash);
  });

  it('records which template the run was launched from', async () => {
    const { id } = await readJson<{ id: string }>(
      await launch({
        industry: 'Retail',
        difficulty: 'Medium',
        companySize: 'Small',
        templateKey: 'builtin:cash-crunch',
      })
    );

    expect(
      (await prisma.simulation.findUniqueOrThrow({ where: { id } })).templateKey
    ).toBe('builtin:cash-crunch');
  });

  it('applies a saved template modifiers', async () => {
    const template = await data<StoredTemplate>(
      await create({ ...VALID, metricModifiers: { reputation: -25 } })
    );

    const { id } = await readJson<{ id: string }>(
      await launch({
        industry: 'Retail',
        difficulty: 'Medium',
        companySize: 'Small',
        templateKey: template.id,
      })
    );

    const base = getStartingMetrics('Retail', 'Medium', 'Small');
    const stored = await prisma.simulation.findUniqueOrThrow({ where: { id } });
    expect(stored.reputation).toBe(base.reputation - 25);
  });

  it('counts the launch against the template', async () => {
    const template = await data<StoredTemplate>(await create(VALID));

    await launch({
      industry: 'Retail',
      difficulty: 'Medium',
      companySize: 'Small',
      templateKey: template.id,
    });

    expect(
      (await prisma.scenarioTemplate.findUniqueOrThrow({ where: { id: template.id } })).usageCount
    ).toBe(1);
  });

  it('ignores another user template rather than applying it', async () => {
    const other = await prisma.user.create({
      data: { email: 'other@example.com', passwordHash: 'x' },
    });
    const theirs = await prisma.scenarioTemplate.create({
      data: {
        userId: other.id,
        name: 'Theirs',
        industry: 'Retail',
        difficulty: 'Medium',
        companySize: 'Small',
        metricModifiers: JSON.stringify({ cash: 5_000_000 }),
      },
    });

    const { id } = await readJson<{ id: string }>(
      await launch({
        industry: 'Retail',
        difficulty: 'Medium',
        companySize: 'Small',
        templateKey: theirs.id,
      })
    );

    const stored = await prisma.simulation.findUniqueOrThrow({ where: { id } });
    expect(stored.cash).toBe(getStartingMetrics('Retail', 'Medium', 'Small').cash);
  });

  it('still creates the run when the template key is stale', async () => {
    const response = await launch({
      industry: 'Retail',
      difficulty: 'Medium',
      companySize: 'Small',
      templateKey: 'deleted-long-ago',
    });

    expect(response.status).toBe(201);
    expect(await prisma.simulation.count()).toBe(1);
  });
});
