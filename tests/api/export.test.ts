import { beforeEach, describe, expect, it } from 'vitest';

import { GET as exportRun } from '@/app/api/simulations/[id]/export/route';
import { prisma } from '@/lib/db';
import { CSV_HEADERS, EXPORT_FORMAT_VERSION } from '@/lib/export/run-export';
import {
  resetDatabase,
  seedCompletedSimulation,
  signIn,
  signOut,
  type SignedInUser,
} from '../helpers/db';
import { getRequest, readJson } from '../helpers/http';

let user: SignedInUser;

beforeEach(async () => {
  await resetDatabase();
  user = await signIn('exporter@example.com', 'Exporter');
});

function download(id: string, query = '') {
  return exportRun(getRequest(`/api/simulations/${id}/export${query}`), { params: { id } });
}

/** Parses a CSV document into rows of already-unescaped fields. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r' && text[i + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
    } else field += char;
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

describe('GET /api/simulations/[id]/export — access', () => {
  it('answers 401 for an anonymous visitor', async () => {
    const sim = await seedCompletedSimulation(user.id);
    signOut();

    const response = await download(sim.id);
    expect(response.status).toBe(401);
    expect(await readJson(response)).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('answers 404 for a simulation that does not exist', async () => {
    expect((await download('no-such-id')).status).toBe(404);
  });

  it('answers 403 for somebody else run', async () => {
    const owner = await signIn('owner@example.com');
    const sim = await seedCompletedSimulation(owner.id);
    await signIn('intruder@example.com');

    const response = await download(sim.id);
    expect(response.status).toBe(403);
    expect(await readJson(response)).toEqual({ success: false, error: 'Forbidden' });
  });

  it('answers 400 for a format it does not produce', async () => {
    const sim = await seedCompletedSimulation(user.id);
    const response = await download(sim.id, '?format=pdf');

    expect(response.status).toBe(400);
    expect(await readJson(response)).toMatchObject({ success: false, error: 'Invalid input' });
  });
});

describe('GET /api/simulations/[id]/export — JSON', () => {
  it('defaults to JSON when no format is asked for', async () => {
    const sim = await seedCompletedSimulation(user.id);
    const response = await download(sim.id);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('offers the file as a download with a name', async () => {
    const sim = await seedCompletedSimulation(user.id, { companyName: 'Nile Home Goods' });
    const disposition = (await download(sim.id, '?format=json')).headers.get('content-disposition');

    expect(disposition).toContain('attachment');
    expect(disposition).toContain('.json');
    expect(disposition).toContain('Nile-Home-Goods');
  });

  it('is not wrapped in the response envelope, because it is a file', async () => {
    const sim = await seedCompletedSimulation(user.id);
    const body = await readJson<Record<string, unknown>>(await download(sim.id));

    expect(body).not.toHaveProperty('success');
    expect(body).not.toHaveProperty('data');
    expect(body.formatVersion).toBe(EXPORT_FORMAT_VERSION);
  });

  it('carries the run setup and its outcome', async () => {
    const sim = await seedCompletedSimulation(user.id, {
      industry: 'SaaS',
      difficulty: 'Hard',
      endingType: 'growth_win',
      performanceScore: 84,
    });

    const body = await readJson<{ simulation: Record<string, unknown> }>(await download(sim.id));
    expect(body.simulation).toMatchObject({
      id: sim.id,
      industry: 'SaaS',
      difficulty: 'Hard',
      endingType: 'growth_win',
      performanceScore: 84,
    });
  });

  it('carries the seed, so the owner can replay their own run', async () => {
    const sim = await seedCompletedSimulation(user.id, { seed: 424_242 });
    const body = await readJson<{ simulation: { seed: number } }>(await download(sim.id));

    expect(body.simulation.seed).toBe(424_242);
  });

  it('carries every turn with its decision and metrics', async () => {
    const sim = await seedCompletedSimulation(user.id, {
      turnsCompleted: 3,
      decisionTags: [['cut_costs'], ['layoffs'], ['take_loan']],
    });

    const body = await readJson<{ turns: Array<Record<string, unknown>> }>(await download(sim.id));
    expect(body.turns).toHaveLength(3);
    expect(body.turns[1]).toMatchObject({ turnNumber: 2 });
    expect((body.turns[1].decision as { tags: string[] }).tags).toEqual(['layoffs']);
  });

  it('carries the final report and the achievements', async () => {
    const sim = await seedCompletedSimulation(user.id);
    await prisma.achievement.create({ data: { simulationId: sim.id, type: 'crisis_manager' } });

    const body = await readJson<{
      finalReport: { overallScore: number } | null;
      achievements: Array<{ type: string }>;
    }>(await download(sim.id));

    expect(body.finalReport?.overallScore).toBe(60);
    expect(body.achievements.map((a) => a.type)).toEqual(['crisis_manager']);
  });

  it('carries the owner notes and tags', async () => {
    const sim = await seedCompletedSimulation(user.id, { notes: 'Should have cut earlier.' });
    await prisma.runTag.create({ data: { simulationId: sim.id, label: 'practice' } });

    const body = await readJson<{ simulation: { notes: string; tags: string[] } }>(
      await download(sim.id)
    );

    expect(body.simulation.notes).toBe('Should have cut earlier.');
    expect(body.simulation.tags).toEqual(['practice']);
  });

  it('survives a run whose stored report is not valid JSON', async () => {
    const sim = await seedCompletedSimulation(user.id);
    await prisma.simulation.update({ where: { id: sim.id }, data: { finalReport: 'broken{' } });

    const body = await readJson<{ finalReport: unknown }>(await download(sim.id));
    expect(body.finalReport).toBeNull();
  });
});

describe('GET /api/simulations/[id]/export — CSV', () => {
  it('answers with a CSV content type and a .csv filename', async () => {
    const sim = await seedCompletedSimulation(user.id);
    const response = await download(sim.id, '?format=csv');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-type')).toContain('charset=utf-8');
    expect(response.headers.get('content-disposition')).toContain('.csv');
  });

  it('writes the header row the exporter declares', async () => {
    const sim = await seedCompletedSimulation(user.id, { turnsCompleted: 1 });
    const rows = parseCsv(await (await download(sim.id, '?format=csv')).text());

    expect(rows[0]).toEqual([...CSV_HEADERS]);
  });

  it('writes one row per turn, in turn order', async () => {
    const sim = await seedCompletedSimulation(user.id, { turnsCompleted: 4 });
    const rows = parseCsv(await (await download(sim.id, '?format=csv')).text());

    expect(rows).toHaveLength(5);
    expect(rows.slice(1).map((row) => row[0])).toEqual(['1', '2', '3', '4']);
  });

  it('writes the metric snapshot of each turn', async () => {
    const sim = await seedCompletedSimulation(user.id, {
      turnsCompleted: 1,
      trajectory: [{ cash: 812_345, reputation: 44 }],
    });

    const rows = parseCsv(await (await download(sim.id, '?format=csv')).text());
    const cash = rows[0].indexOf('cash');
    const reputation = rows[0].indexOf('reputation');

    expect(rows[1][cash]).toBe('812345');
    expect(rows[1][reputation]).toBe('44');
  });

  it('writes the decision tags of each turn', async () => {
    const sim = await seedCompletedSimulation(user.id, {
      turnsCompleted: 1,
      decisionTags: [['cut_costs', 'layoffs']],
    });

    const rows = parseCsv(await (await download(sim.id, '?format=csv')).text());
    expect(rows[1][rows[0].indexOf('decision_tags')]).toBe('cut_costs layoffs');
  });

  it('does not let a comma in a note become a column break', async () => {
    const sim = await seedCompletedSimulation(user.id, { turnsCompleted: 1 });
    await prisma.turn.updateMany({
      where: { simulationId: sim.id },
      data: { note: 'Cut costs, then hired again, which cost more' },
    });

    const rows = parseCsv(await (await download(sim.id, '?format=csv')).text());

    expect(rows[1]).toHaveLength(CSV_HEADERS.length);
    expect(rows[1][rows[0].indexOf('note')]).toBe('Cut costs, then hired again, which cost more');
  });

  it('does not let a newline in a note become a row break', async () => {
    const sim = await seedCompletedSimulation(user.id, { turnsCompleted: 2 });
    await prisma.turn.updateMany({
      where: { simulationId: sim.id, turnNumber: 1 },
      data: { note: 'First line\r\nSecond line' },
    });

    const rows = parseCsv(await (await download(sim.id, '?format=csv')).text());

    expect(rows).toHaveLength(3);
    expect(rows[1][rows[0].indexOf('note')]).toBe('First line\r\nSecond line');
  });

  it('writes a header-only document for a run with no turns', async () => {
    const sim = await seedCompletedSimulation(user.id, { turnsCompleted: 0 });
    const text = await (await download(sim.id, '?format=csv')).text();

    expect(parseCsv(text)).toHaveLength(1);
  });
});
