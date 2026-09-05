import type { NextResponse } from 'next/server';

import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import type { ApiFailure } from '@/types';

import { conflict, forbidden, notFound, unauthorized } from './respond';

/**
 * Route-level access checks, factored out of the handlers.
 *
 * Each guard returns either the thing the handler asked for or the response it
 * should send instead. Handlers stay linear:
 *
 *     const auth = await requireUserId();
 *     if ('response' in auth) return auth.response;
 *
 * The ordering of the refusals matches `/api/simulations/[id]`, the route the
 * MVP established the convention on: 401 before anything is read, then 404 for
 * a row that does not exist, then 403 for a row owned by somebody else.
 */

/** Either the value a guard produced, or the response that replaces it. */
export type Guarded<T> = { value: T } | { response: NextResponse<ApiFailure> };

export function guardFailed<T>(result: Guarded<T>): result is { response: NextResponse<ApiFailure> } {
  return 'response' in result;
}

/** Resolves the signed-in user's id, or a 401. */
export async function requireUserId(): Promise<Guarded<string>> {
  const session = await requireAuth();
  if (!session?.userId) return { response: unauthorized() };
  return { value: session.userId };
}

/** Loads the signed-in user's own row, or a 401 if the session is stale. */
export async function requireUser(): Promise<
  Guarded<{ id: string; email: string; name: string | null }>
> {
  const auth = await requireUserId();
  if (guardFailed(auth)) return auth;

  const user = await prisma.user.findUnique({
    where: { id: auth.value },
    select: { id: true, email: true, name: true },
  });

  // The session names a user that has since been deleted: treat it as signed
  // out rather than 500-ing on the missing row.
  if (!user) return { response: unauthorized() };
  return { value: user };
}

export interface OwnedSimulation {
  id: string;
  userId: string;
}

/**
 * Resolves a simulation the caller owns.
 *
 * Ownership is checked against a two-column read before the caller's real
 * query runs, so a handler never has to remember to compare `userId` itself.
 */
export async function requireOwnedSimulation(
  simulationId: string
): Promise<Guarded<{ userId: string; simulationId: string }>> {
  const auth = await requireUserId();
  if (guardFailed(auth)) return auth;

  const sim = await prisma.simulation.findUnique({
    where: { id: simulationId },
    select: { id: true, userId: true },
  });

  if (!sim) return { response: notFound('Simulation not found') };
  if (sim.userId !== auth.value) return { response: forbidden() };

  return { value: { userId: auth.value, simulationId: sim.id } };
}

/**
 * Same as `requireOwnedSimulation`, but additionally refuses a run that is
 * still in progress. Replay and comparison read a finished run and would
 * otherwise report on a half-played game. The refusal is a 409, not a 404: the
 * row exists and the caller may retry once the run ends.
 */
export async function requireCompletedSimulation(
  simulationId: string
): Promise<Guarded<{ userId: string; simulationId: string }>> {
  const owned = await requireOwnedSimulation(simulationId);
  if (guardFailed(owned)) return owned;

  const sim = await prisma.simulation.findUnique({
    where: { id: simulationId },
    select: { status: true },
  });

  if (sim?.status !== 'ended') {
    return { response: conflict('Simulation is still in progress') };
  }

  return owned;
}
