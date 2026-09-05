import type { NextRequest } from 'next/server';

import { guardFailed, requireOwnedSimulation } from '@/lib/api/guards';
import { badRequest, conflict, notFound, ok, readJsonBody, validationFailed } from '@/lib/api/respond';
import { LabelSchema, MAX_LABELS_PER_RUN, normalizeLabel } from '@/lib/annotations';
import { prisma } from '@/lib/db';

/**
 * Labels a player attaches to a run, for grouping and for filtering the
 * dashboard: `practice`, `for-class`, `risky-strategy`.
 *
 * Labels are normalised before they are stored, so `Practice`, `practice ` and
 * `PRACTICE` are one label rather than three — which is what makes both the
 * uniqueness constraint and the dashboard's filter list mean anything.
 */

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const owned = await requireOwnedSimulation(params.id);
  if (guardFailed(owned)) return owned.response;

  const tags = await prisma.runTag.findMany({
    where: { simulationId: owned.value.simulationId },
    select: { label: true, createdAt: true },
    orderBy: { label: 'asc' },
  });

  return ok({ tags: tags.map((tag) => tag.label) });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const owned = await requireOwnedSimulation(params.id);
  if (guardFailed(owned)) return owned.response;

  const body = await readJsonBody(req);
  if (body === undefined) return badRequest('Expected a JSON body');

  const parsed = LabelSchema.safeParse(body);
  if (!parsed.success) return validationFailed(parsed.error);

  const label = normalizeLabel(parsed.data.label);

  const existing = await prisma.runTag.count({ where: { simulationId: owned.value.simulationId } });
  if (existing >= MAX_LABELS_PER_RUN) {
    return conflict(`A run can carry at most ${MAX_LABELS_PER_RUN} labels`);
  }

  // Adding a label a run already carries is the outcome the caller wanted, so
  // it succeeds rather than 409-ing on the unique constraint.
  await prisma.runTag.upsert({
    where: { simulationId_label: { simulationId: owned.value.simulationId, label } },
    create: { simulationId: owned.value.simulationId, label },
    update: {},
  });

  const tags = await prisma.runTag.findMany({
    where: { simulationId: owned.value.simulationId },
    select: { label: true },
    orderBy: { label: 'asc' },
  });

  return ok({ label, tags: tags.map((tag) => tag.label) });
}

/** DELETE /api/simulations/[id]/tags?label=practice */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const owned = await requireOwnedSimulation(params.id);
  if (guardFailed(owned)) return owned.response;

  const raw = req.nextUrl.searchParams.get('label');
  if (raw === null) return badRequest('A label to remove is required');

  const label = normalizeLabel(raw);
  if (label === '') return badRequest('A label needs at least one letter or digit');

  const removed = await prisma.runTag.deleteMany({
    where: { simulationId: owned.value.simulationId, label },
  });

  if (removed.count === 0) return notFound('This run does not carry that label');

  const tags = await prisma.runTag.findMany({
    where: { simulationId: owned.value.simulationId },
    select: { label: true },
    orderBy: { label: 'asc' },
  });

  return ok({ removed: label, tags: tags.map((tag) => tag.label) });
}
