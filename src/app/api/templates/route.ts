import type { NextRequest } from 'next/server';

import { guardFailed, requireUserId } from '@/lib/api/guards';
import { badRequest, conflict, created, ok, readJsonBody, validationFailed } from '@/lib/api/respond';
import { prisma } from '@/lib/db';
import {
  BUILT_IN_TEMPLATES,
  MAX_TEMPLATES_PER_USER,
  TemplateSchema,
  type MetricModifiers,
  type StoredTemplate,
  type TemplatesPayload,
} from '@/lib/game/scenario-templates';
import { parseJsonObject } from '@/lib/json';

/**
 * The presets a player can launch a run from: the ones the product ships with,
 * plus any the player has saved.
 */

export async function GET() {
  const auth = await requireUserId();
  if (guardFailed(auth)) return auth.response;

  const mine = await prisma.scenarioTemplate.findMany({
    where: { userId: auth.value },
    orderBy: [{ usageCount: 'desc' }, { name: 'asc' }],
  });

  const payload: TemplatesPayload = {
    builtIn: [...BUILT_IN_TEMPLATES],
    mine: mine.map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      industry: template.industry,
      difficulty: template.difficulty,
      companySize: template.companySize,
      metricModifiers: parseJsonObject<MetricModifiers>(template.metricModifiers, {}),
      usageCount: template.usageCount,
      createdAt: template.createdAt.toISOString(),
    })),
  };

  return ok(payload);
}

export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (guardFailed(auth)) return auth.response;

  const body = await readJsonBody(req);
  if (body === undefined) return badRequest('Expected a JSON body');

  const parsed = TemplateSchema.safeParse(body);
  if (!parsed.success) return validationFailed(parsed.error);

  const existing = await prisma.scenarioTemplate.count({ where: { userId: auth.value } });
  if (existing >= MAX_TEMPLATES_PER_USER) {
    return conflict(`You can keep at most ${MAX_TEMPLATES_PER_USER} templates`);
  }

  const duplicate = await prisma.scenarioTemplate.findFirst({
    where: { userId: auth.value, name: parsed.data.name },
    select: { id: true },
  });
  if (duplicate) return conflict('You already have a template with that name');

  const template = await prisma.scenarioTemplate.create({
    data: {
      userId: auth.value,
      name: parsed.data.name,
      description: parsed.data.description,
      industry: parsed.data.industry,
      difficulty: parsed.data.difficulty,
      companySize: parsed.data.companySize,
      metricModifiers: JSON.stringify(parsed.data.metricModifiers),
    },
  });

  return created({
    id: template.id,
    name: template.name,
    description: template.description,
    industry: template.industry,
    difficulty: template.difficulty,
    companySize: template.companySize,
    metricModifiers: parsed.data.metricModifiers,
    usageCount: 0,
    createdAt: template.createdAt.toISOString(),
  } satisfies StoredTemplate);
}
