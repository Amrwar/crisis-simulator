import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { getStartingMetrics } from '@/lib/game/starting-metrics';
import {
  applyTemplate,
  builtInTemplate,
  isBuiltInKey,
  type MetricModifiers,
} from '@/lib/game/scenario-templates';
import { parseJsonObject } from '@/lib/json';
import { generateInitialTurn } from '@/lib/llm';

const CreateSimSchema = z.object({
  industry: z.enum(['Retail', 'Restaurant', 'SaaS', 'Construction', 'Healthcare']),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']),
  companySize: z.enum(['Small', 'Medium']),
  /**
   * Optional preset to launch from: a built-in key, or a saved template's id.
   * The industry, difficulty and size above still decide the base position —
   * the form sends the template's own triple in them — so a template only ever
   * layers starting-metric modifiers on top.
   */
  templateKey: z.string().max(64).optional(),
});

/**
 * Resolves a preset into its metric modifiers.
 *
 * An unknown key, or one belonging to somebody else, yields no modifiers
 * rather than an error: the run is still a perfectly good run at that
 * industry, difficulty and size, and failing the creation would lose the
 * player's turn-one generation over a stale bookmark.
 */
async function modifiersFor(
  templateKey: string | undefined,
  userId: string
): Promise<MetricModifiers> {
  if (!templateKey) return {};

  if (isBuiltInKey(templateKey)) {
    return builtInTemplate(templateKey)?.metricModifiers ?? {};
  }

  const template = await prisma.scenarioTemplate.findFirst({
    where: { id: templateKey, userId },
    select: { id: true, metricModifiers: true },
  });

  if (!template) return {};

  // Usage is what orders the template list, so it is counted on launch.
  await prisma.scenarioTemplate.update({
    where: { id: template.id },
    data: { usageCount: { increment: 1 } },
  });

  return parseJsonObject<MetricModifiers>(template.metricModifiers, {});
}

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

    const { industry, difficulty, companySize, templateKey } = parsed.data;

    // Generate deterministic starting metrics. A preset layers modifiers on
    // top of the same base position; without one this is getStartingMetrics
    // exactly as before.
    const modifiers = await modifiersFor(templateKey, session.userId!);
    const startingMetrics =
      Object.keys(modifiers).length === 0
        ? getStartingMetrics(industry, difficulty, companySize)
        : applyTemplate(industry, difficulty, companySize, modifiers);

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
        // Recorded even if the template is later renamed or deleted: the run
        // really was launched from it.
        templateKey: templateKey ?? '',
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
