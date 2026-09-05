import type { NextRequest } from 'next/server';

import { guardFailed, requireOwnedSimulation } from '@/lib/api/guards';
import { notFound, ok } from '@/lib/api/respond';
import { prisma } from '@/lib/db';
import { replaySimulation } from '@/lib/game/replay';
import { getStartingMetrics } from '@/lib/game/starting-metrics';
import type { CompanySize, Difficulty, Industry } from '@/types';

/**
 * GET /api/simulations/[id]/replay
 *
 * Re-runs a stored simulation from its seed and its recorded decisions, and
 * reports turn by turn whether it lands on the numbers that were stored.
 *
 * The opening state is not read back from the database: turn one's snapshot
 * columns are overwritten when turn one is decided. It is recomputed with
 * `getStartingMetrics`, which is the same deterministic function the create
 * route seeded the run with — so the replay genuinely starts where the run did.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const owned = await requireOwnedSimulation(params.id);
  if (guardFailed(owned)) return owned.response;

  const run = await prisma.simulation.findUnique({
    where: { id: owned.value.simulationId },
    select: {
      id: true,
      seed: true,
      industry: true,
      difficulty: true,
      companySize: true,
      maxTurns: true,
      endingType: true,
      competitorStrategy: true,
      turns: {
        orderBy: { turnNumber: 'asc' },
        select: {
          turnNumber: true,
          tags: true,
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

  if (!run) return notFound('Simulation not found');

  const opening = getStartingMetrics(
    run.industry as Industry,
    run.difficulty as Difficulty,
    run.companySize as CompanySize
  );

  const result = replaySimulation(
    {
      simulationId: run.id,
      seed: run.seed,
      difficulty: run.difficulty,
      maxTurns: run.maxTurns,
      storedEnding: run.endingType,
      competitorStrength: opening.competitorStrength,
      competitorStrategy: run.competitorStrategy,
      openingMetrics: {
        cash: opening.cash,
        monthlyRevenue: opening.monthlyRevenue,
        burnRate: opening.burnRate,
        reputation: opening.reputation,
        morale: opening.morale,
        churn: opening.churn,
        legalRisk: opening.legalRisk,
        marketShare: opening.marketShare,
      },
      openingHidden: {
        supplierReliability: opening.supplierReliability,
        employeeLoyalty: opening.employeeLoyalty,
        demandVolatility: opening.demandVolatility,
        competitorAggression: opening.competitorAggression,
      },
    },
    run.turns
  );

  return ok(result);
}
