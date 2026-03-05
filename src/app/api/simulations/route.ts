import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { getStartingMetrics } from '@/lib/game/starting-metrics';
import { generateInitialTurn } from '@/lib/llm';

const CreateSimSchema = z.object({
  industry: z.enum(['Retail', 'Restaurant', 'SaaS', 'Construction', 'Healthcare']),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']),
  companySize: z.enum(['Small', 'Medium']),
});

// GET /api/simulations — list user's simulations
export async function GET() {
  const session = await requireAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sims = await prisma.simulation.findMany({
    where: { userId: session.userId! },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      industry: true,
      difficulty: true,
      companySize: true,
      companyName: true,
      status: true,
      endingType: true,
      currentTurn: true,
      maxTurns: true,
      cash: true,
      reputation: true,
      marketShare: true,
      createdAt: true,
      endedAt: true,
    },
  });

  return NextResponse.json(sims);
}

// POST /api/simulations — create new simulation
export async function POST(req: NextRequest) {
  const session = await requireAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const parsed = CreateSimSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { industry, difficulty, companySize } = parsed.data;

    // Generate deterministic starting metrics
    const startingMetrics = getStartingMetrics(industry, difficulty, companySize);

    // Generate a random seed for this simulation
    const seed = Math.floor(Math.random() * 2147483647);

    // Call AI to generate company profile + first turn
    const initialData = await generateInitialTurn({
      industry,
      difficulty,
      companySize,
      metrics: startingMetrics,
    });

    const { companyProfile, competitor, turn } = initialData;

    // Create simulation in DB
    const sim = await prisma.simulation.create({
      data: {
        userId: session.userId!,
        industry,
        difficulty,
        companySize,
        companyName: companyProfile.name,
        companyLocation: companyProfile.location,
        startingSituation: companyProfile.startingSituation,
        competitorName: competitor.name,
        competitorStrategy: competitor.strategy,
        competitorStrength: startingMetrics.competitorStrength,
        cash: startingMetrics.cash,
        monthlyRevenue: startingMetrics.monthlyRevenue,
        burnRate: startingMetrics.burnRate,
        reputation: startingMetrics.reputation,
        morale: startingMetrics.morale,
        churn: startingMetrics.churn,
        legalRisk: startingMetrics.legalRisk,
        marketShare: startingMetrics.marketShare,
        supplierReliability: startingMetrics.supplierReliability,
        employeeLoyalty: startingMetrics.employeeLoyalty,
        demandVolatility: startingMetrics.demandVolatility,
        competitorAggression: startingMetrics.competitorAggression,
        seed,
        currentTurn: 1,
      },
    });

    // Store the first turn (no decision yet)
    await prisma.turn.create({
      data: {
        simulationId: sim.id,
        turnNumber: 1,
        title: turn.title,
        narrative: turn.narrative,
        characterMessages: JSON.stringify(turn.characterMessages),
        newsOrSocial: turn.newsOrSocial ? JSON.stringify(turn.newsOrSocial) : '',
        options: JSON.stringify(turn.options),
        // snapshots = starting metrics
        cashAfter: startingMetrics.cash,
        revenueAfter: startingMetrics.monthlyRevenue,
        burnRateAfter: startingMetrics.burnRate,
        reputationAfter: startingMetrics.reputation,
        moraleAfter: startingMetrics.morale,
        churnAfter: startingMetrics.churn,
        legalRiskAfter: startingMetrics.legalRisk,
        marketShareAfter: startingMetrics.marketShare,
      },
    });

    return NextResponse.json({ id: sim.id }, { status: 201 });
  } catch (e) {
    console.error('[create-sim]', e);
    return NextResponse.json(
      { error: 'Failed to create simulation', details: String(e) },
      { status: 500 }
    );
  }
}
