import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { guardFailed, requireOwnedSimulation } from '@/lib/api/guards';
import { badRequest, notFound, ok, validationFailed } from '@/lib/api/respond';
import { compareRuns } from '@/lib/analytics/compare';
import { buildRunAnalytics, type RunHeader, type TurnRecord } from '@/lib/analytics/run-report';
import { prisma } from '@/lib/db';

/**
 * GET /api/simulations/compare?a=<id>&b=<id>
 *
 * Puts two of the caller's runs side by side. Both are ownership-checked
 * independently, so naming one of your own runs and one of somebody else's is
 * a 403 rather than a way to read theirs.
 *
 * The route sits at /api/simulations/compare, which cannot collide with
 * /api/simulations/[id]: a literal segment wins over a dynamic one in the App
 * Router, and no simulation id is the string "compare" in any case.
 */

const QuerySchema = z.object({
  a: z.string().min(1, 'Name the first run to compare'),
  b: z.string().min(1, 'Name the second run to compare'),
});

const TURN_SELECT = {
  turnNumber: true,
  title: true,
  optionId: true,
  freeText: true,
  tags: true,
  metricDeltas: true,
  coachFeedback: true,
  note: true,
  decidedAt: true,
  cashAfter: true,
  revenueAfter: true,
  burnRateAfter: true,
  reputationAfter: true,
  moraleAfter: true,
  churnAfter: true,
  legalRiskAfter: true,
  marketShareAfter: true,
} as const;

export async function GET(req: NextRequest) {
  const parsed = QuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return validationFailed(parsed.error);

  const { a, b } = parsed.data;
  if (a === b) return badRequest('Pick two different runs to compare');

  // Checked one at a time so the refusal names the run that failed, and so a
  // caller cannot read somebody else's run by pairing it with their own.
  for (const id of [a, b]) {
    const owned = await requireOwnedSimulation(id);
    if (guardFailed(owned)) return owned.response;
  }

  const [runA, runB] = await Promise.all([loadRun(a), loadRun(b)]);
  if (!runA || !runB) return notFound('Simulation not found');

  return ok(compareRuns(runA, runB));
}

async function loadRun(id: string) {
  const run = await prisma.simulation.findUnique({
    where: { id },
    select: {
      id: true,
      companyName: true,
      industry: true,
      difficulty: true,
      status: true,
      endingType: true,
      performanceScore: true,
      currentTurn: true,
      maxTurns: true,
      turns: { orderBy: { turnNumber: 'asc' }, select: TURN_SELECT },
    },
  });

  if (!run) return null;
  return buildRunAnalytics(run satisfies RunHeader, run.turns satisfies TurnRecord[]);
}
