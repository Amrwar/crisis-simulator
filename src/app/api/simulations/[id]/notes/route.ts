import type { NextRequest } from 'next/server';

import { guardFailed, requireOwnedSimulation } from '@/lib/api/guards';
import { badRequest, ok, readJsonBody, validationFailed } from '@/lib/api/respond';
import { NoteSchema, normalizeNote } from '@/lib/annotations';
import { prisma } from '@/lib/db';

/**
 * PATCH /api/simulations/[id]/notes
 *
 * The player's own note on a run — what they would tell themselves before
 * playing it again. Sending an empty note clears it, which is how the UI
 * deletes one; there is no separate DELETE.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const owned = await requireOwnedSimulation(params.id);
  if (guardFailed(owned)) return owned.response;

  const body = await readJsonBody(req);
  if (body === undefined) return badRequest('Expected a JSON body');

  const parsed = NoteSchema.safeParse(body);
  if (!parsed.success) return validationFailed(parsed.error);

  const notes = normalizeNote(parsed.data.note);

  await prisma.simulation.update({
    where: { id: owned.value.simulationId },
    data: { notes },
  });

  return ok({ notes });
}
