import type { NextRequest } from 'next/server';

import { guardFailed, requireOwnedSimulation } from '@/lib/api/guards';
import { notFound, ok } from '@/lib/api/respond';
import { buildRunAnalytics } from '@/lib/analytics/run-report';
import { prisma } from '@/lib/db';

/**
 * GET /api/simulations/[id]/analytics
 *
 * One run's metric trajectories, decision log and turning point. Available for
 * a run in progress as well as a finished one — a player mid-run wants to see
 * where the cash line is heading.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const owned = await requireOwnedSimulation(params.id);
  if (guardFailed(owned)) return owned.response;

  const run = await prisma.simulation.findUnique({
    where: { id: owned.value.simulationId },
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
      turns: {
        orderBy: { turnNumber: 'asc' },
        select: {
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
        },
      },
    },
  });

  // The guard already established that the row exists and is the caller's;
  // reaching here without it means it was deleted between the two reads.
  if (!run) return notFound('Simulation not found');

  return ok(buildRunAnalytics(run, run.turns));
}
