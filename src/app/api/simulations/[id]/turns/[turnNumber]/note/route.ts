import type { NextRequest } from 'next/server';

import { guardFailed, requireOwnedSimulation } from '@/lib/api/guards';
import { badRequest, notFound, ok, readJsonBody, validationFailed } from '@/lib/api/respond';
import { NoteSchema, normalizeNote } from '@/lib/annotations';
import { prisma } from '@/lib/db';

/**
 * PATCH /api/simulations/[id]/turns/[turnNumber]/note
 *
 * A note on one turn, written while reviewing a run. The turn is addressed by
 * its number within the run rather than its row id: that is what the reader
 * sees, and it keeps the URL meaningful.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; turnNumber: string } }
) {
  const owned = await requireOwnedSimulation(params.id);
  if (guardFailed(owned)) return owned.response;

  const turnNumber = Number(params.turnNumber);
  if (!Number.isInteger(turnNumber) || turnNumber < 1) {
    return badRequest('Turn number must be a positive whole number');
  }

  const body = await readJsonBody(req);
  if (body === undefined) return badRequest('Expected a JSON body');

  const parsed = NoteSchema.safeParse(body);
  if (!parsed.success) return validationFailed(parsed.error);

  const turn = await prisma.turn.findFirst({
    where: { simulationId: owned.value.simulationId, turnNumber },
    select: { id: true },
  });

  if (!turn) return notFound('Turn not found');

  const note = normalizeNote(parsed.data.note);
  await prisma.turn.update({ where: { id: turn.id }, data: { note } });

  return ok({ turnNumber, note });
}
