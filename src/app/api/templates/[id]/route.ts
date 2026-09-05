import type { NextRequest } from 'next/server';

import { guardFailed, requireUserId } from '@/lib/api/guards';
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  ok,
  readJsonBody,
  validationFailed,
} from '@/lib/api/respond';
import { prisma } from '@/lib/db';
import {
  TemplateSchema,
  type MetricModifiers,
  type StoredTemplate,
} from '@/lib/game/scenario-templates';
import { parseJsonObject } from '@/lib/json';

/**
 * One saved template. Built-in presets are not addressable here: they have no
 * row, and they are not the caller's to change.
 */

function project(template: {
  id: string;
  name: string;
  description: string;
  industry: string;
  difficulty: string;
  companySize: string;
  metricModifiers: string;
  usageCount: number;
  createdAt: Date;
}): StoredTemplate {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    industry: template.industry,
    difficulty: template.difficulty,
    companySize: template.companySize,
    metricModifiers: parseJsonObject<MetricModifiers>(template.metricModifiers, {}),
    usageCount: template.usageCount,
    createdAt: template.createdAt.toISOString(),
  };
}

/**
 * Resolves a template the caller owns, refusing the same way the simulation
 * routes do: 404 for a row that is not there, 403 for one that is somebody
 * else's.
 */
async function requireOwnTemplate(id: string, userId: string) {
  const template = await prisma.scenarioTemplate.findUnique({ where: { id } });
  if (!template) return { response: notFound('Template not found') } as const;
  if (template.userId !== userId) return { response: forbidden() } as const;
  return { template } as const;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUserId();
  if (guardFailed(auth)) return auth.response;

  const found = await requireOwnTemplate(params.id, auth.value);
  if ('response' in found) return found.response;

  return ok(project(found.template));
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUserId();
  if (guardFailed(auth)) return auth.response;

  const found = await requireOwnTemplate(params.id, auth.value);
  if ('response' in found) return found.response;

  const body = await readJsonBody(req);
  if (body === undefined) return badRequest('Expected a JSON body');

  const parsed = TemplateSchema.safeParse(body);
  if (!parsed.success) return validationFailed(parsed.error);

  // Renaming onto another template's name would violate the unique constraint;
  // report it as the conflict it is rather than letting the write throw.
  const clash = await prisma.scenarioTemplate.findFirst({
    where: { userId: auth.value, name: parsed.data.name, id: { not: params.id } },
    select: { id: true },
  });
  if (clash) return conflict('You already have a template with that name');

  const updated = await prisma.scenarioTemplate.update({
    where: { id: params.id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      industry: parsed.data.industry,
      difficulty: parsed.data.difficulty,
      companySize: parsed.data.companySize,
      metricModifiers: JSON.stringify(parsed.data.metricModifiers),
    },
  });

  return ok(project(updated));
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUserId();
  if (guardFailed(auth)) return auth.response;

  const found = await requireOwnTemplate(params.id, auth.value);
  if ('response' in found) return found.response;

  await prisma.scenarioTemplate.delete({ where: { id: params.id } });

  // Runs launched from this template keep their templateKey: the run really
  // was played from it, and rewriting finished history to tidy up a deletion
  // would be worse than a key that no longer resolves.
  return ok({ deleted: params.id });
}
