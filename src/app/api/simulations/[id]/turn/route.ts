import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { extractTagsFromKeywords, filterValidTags, type DecisionTag } from '@/lib/game/tags';
import { applyRules, computePerformanceScore } from '@/lib/game/rules-engine';
import { checkEnding, checkAchievements } from '@/lib/game/endings';
import { generateNextTurn, generateFinalReport, suggestTags } from '@/lib/llm';

const DecisionSchema = z.object({
  optionId: z.enum(['A', 'B', 'C', 'D']).optional(),
  freeText: z.string().min(5).max(1000).optional(),
}).refine((d) => d.optionId || d.freeText, {
  message: 'Provide either optionId or freeText',
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAuth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const parsed = DecisionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 });
    }

    const { optionId, freeText } = parsed.data;

    // Fetch simulation with current state
    const sim = await prisma.simulation.findUnique({
      where: { id: params.id },
      include: {
        turns: { orderBy: { turnNumber: 'asc' } },
        achievements: true,
      },
    });

    if (!sim) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (sim.userId !== session.userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (sim.status !== 'active') return NextResponse.json({ error: 'Simulation already ended' }, { status: 400 });

    const currentTurnRecord = sim.turns.find((t) => t.turnNumber === sim.currentTurn);
    if (!currentTurnRecord) return NextResponse.json({ error: 'Turn not found' }, { status: 400 });
    if (currentTurnRecord.decidedAt) return NextResponse.json({ error: 'Turn already decided' }, { status: 400 });

    // ── 1. Resolve tags ────────────────────────────────────────────────────────
    let tags: DecisionTag[] = [];
    let decisionText = '';

    if (optionId) {
      const options: Array<{ id: string; text: string; risk: string; tags: string[] }> =
        JSON.parse(currentTurnRecord.options);
      const chosen = options.find((o) => o.id === optionId);
      if (!chosen) return NextResponse.json({ error: 'Invalid option' }, { status: 400 });
      tags = filterValidTags(chosen.tags);
      decisionText = chosen.text;
    } else if (freeText) {
      decisionText = freeText;
      // Keyword extraction
      const kwTags = extractTagsFromKeywords(freeText);

      // AI tag suggestion (with fallback)
      let aiTags: DecisionTag[] = [];
      try {
        const suggestResult = await suggestTags({ freeText });
        aiTags = filterValidTags(suggestResult.tags);
      } catch {
        // fallback to keyword only
      }

      // Merge, dedup, limit to 5
      const merged = Array.from(new Set([...kwTags, ...aiTags])).slice(0, 5);
      tags = merged.length > 0 ? merged : kwTags.slice(0, 3);

      // Final fallback if no tags found
      if (tags.length === 0) tags = ['cut_costs'];
    }

    // ── 2. Apply rules engine ──────────────────────────────────────────────────
    const flags: Record<string, unknown> = JSON.parse(sim.flags);

    const rulesOutput = applyRules({
      metrics: {
        cash: sim.cash,
        monthlyRevenue: sim.monthlyRevenue,
        burnRate: sim.burnRate,
        reputation: sim.reputation,
        morale: sim.morale,
        churn: sim.churn,
        legalRisk: sim.legalRisk,
        marketShare: sim.marketShare,
      },
      hidden: {
        supplierReliability: sim.supplierReliability,
        employeeLoyalty: sim.employeeLoyalty,
        demandVolatility: sim.demandVolatility,
        competitorAggression: sim.competitorAggression,
      },
      competitor: {
        competitorStrength: sim.competitorStrength,
        competitorStrategy: sim.competitorStrategy,
      },
      tags,
      difficulty: sim.difficulty,
      simSeed: sim.seed,
      turnNumber: sim.currentTurn,
      flags,
    });

    const newMetrics = rulesOutput.metrics;
    const newHidden = rulesOutput.hidden;

    // Update flags — stored as Record<string, unknown> to allow numeric counters
    const updatedFlags: Record<string, unknown> = { ...flags };
    for (const f of rulesOutput.newFlags) updatedFlags[f] = true;

    // Track if company was ever in crisis (for turnaround achievement)
    const firstTurnCash = sim.turns[0]?.cashAfter ?? sim.cash;
    if (newMetrics.cash < firstTurnCash * 0.2) updatedFlags['was_in_crisis'] = true;

    // Track negotiation count (for negotiator achievement)
    if (tags.includes('negotiate_supplier')) {
      const prevCount = (updatedFlags['negotiation_count_num'] as number) ?? 0;
      updatedFlags['negotiation_count_num'] = prevCount + 1;
    }

    // ── 3. Check endings ──────────────────────────────────────────────────────
    const ending = checkEnding(
      newMetrics,
      sim.currentTurn,
      sim.maxTurns,
      updatedFlags,
      firstTurnCash
    );

    const nextTurnNumber = sim.currentTurn + 1;
    const isEnded = ending.ended;

    // ── 4. Update current turn record ────────────────────────────────────────
    await prisma.turn.update({
      where: { id: currentTurnRecord.id },
      data: {
        optionId: optionId ?? '',
        freeText: freeText ?? '',
        tags: JSON.stringify(tags),
        metricDeltas: JSON.stringify(rulesOutput.deltas),
        cashAfter: newMetrics.cash,
        revenueAfter: newMetrics.monthlyRevenue,
        burnRateAfter: newMetrics.burnRate,
        reputationAfter: newMetrics.reputation,
        moraleAfter: newMetrics.morale,
        churnAfter: newMetrics.churn,
        legalRiskAfter: newMetrics.legalRisk,
        marketShareAfter: newMetrics.marketShare,
        decidedAt: new Date(),
      },
    });

    // ── 5. Generate next turn OR final report ──────────────────────────────
    let nextTurnData = null;
    let finalReportData = null;

    if (!isEnded) {
      // Build history for AI context
      const history = sim.turns
        .filter((t) => t.decidedAt)
        .slice(-3)
        .map((t) => ({
          turn: t.turnNumber,
          title: t.title,
          decision: t.freeText || t.optionId,
          coachNote: t.coachFeedback,
        }));

      const nextTurnResponse = await generateNextTurn({
        turnNumber: nextTurnNumber,
        companyName: sim.companyName,
        industry: sim.industry,
        difficulty: sim.difficulty,
        metrics: newMetrics,
        competitor: {
          name: sim.competitorName,
          strategy: sim.competitorStrategy,
          strength: sim.competitorStrength,
          action: rulesOutput.competitorAction,
        },
        lastDecision: decisionText,
        lastTags: tags,
        competitorAction: rulesOutput.competitorAction,
        flags: Object.keys(updatedFlags).filter((k) => updatedFlags[k] === true),
        history,
      });

      // Update current turn's coach feedback
      await prisma.turn.update({
        where: { id: currentTurnRecord.id },
        data: {
          coachFeedback: nextTurnResponse.coach.feedback,
          coachWhyMatters: nextTurnResponse.coach.whyItMatters,
        },
      });

      // Create next turn record
      const nt = nextTurnResponse.turn;
      await prisma.turn.create({
        data: {
          simulationId: sim.id,
          turnNumber: nextTurnNumber,
          title: nt.title,
          narrative: nt.narrative,
          characterMessages: JSON.stringify(nt.characterMessages),
          newsOrSocial: nt.newsOrSocial ? JSON.stringify(nt.newsOrSocial) : '',
          options: JSON.stringify(nt.options),
          cashAfter: newMetrics.cash,
          revenueAfter: newMetrics.monthlyRevenue,
          burnRateAfter: newMetrics.burnRate,
          reputationAfter: newMetrics.reputation,
          moraleAfter: newMetrics.morale,
          churnAfter: newMetrics.churn,
          legalRiskAfter: newMetrics.legalRisk,
          marketShareAfter: newMetrics.marketShare,
        },
      });

      nextTurnData = {
        turn: nextTurnResponse.turn,
        coach: nextTurnResponse.coach,
      };
    } else {
      // Generate final report
      const performanceScore = computePerformanceScore(newMetrics, firstTurnCash);
      const allDecisions = [
        ...sim.turns
          .filter((t) => t.decidedAt)
          .map((t) => ({
            turn: t.turnNumber,
            decision: t.freeText || `Option ${t.optionId}`,
            tags: JSON.parse(t.tags) as string[],
          })),
        // Add current turn decision
        { turn: sim.currentTurn, decision: decisionText, tags },
      ];

      try {
        const report = await generateFinalReport({
          companyName: sim.companyName,
          industry: sim.industry,
          difficulty: sim.difficulty,
          companySize: sim.companySize,
          endingType: ending.endingType!,
          finalMetrics: newMetrics,
          startingCash: firstTurnCash,
          turnsCompleted: sim.currentTurn,
          flags: Object.keys(updatedFlags).filter((k) => Boolean(updatedFlags[k])),
          decisionHistory: allDecisions,
          performanceScore,
        });
        finalReportData = report;
      } catch {
        finalReportData = {
          overallScore: performanceScore,
          skillScores: { finance: 50, leadership: 50, risk: 50, communication: 50, ethics: 50 },
          endingType: ending.endingType,
          strengths: ['Completed the simulation'],
          improvements: ['Review each decision and its consequences'],
          learningPath: ['Study business case studies', 'Practice financial analysis'],
          summary: `You completed ${sim.currentTurn} turns with the outcome: ${ending.endingType}. ${ending.reason}`,
        };
      }
    }

    // ── 6. Check achievements ─────────────────────────────────────────────────
    const existingAchievements = sim.achievements.map((a) => a.type);
    const negotiationCount = (updatedFlags['negotiation_count_num'] as number) ?? 0;
    const newAchievements = checkAchievements(
      newMetrics,
      isEnded ? sim.currentTurn : nextTurnNumber - 1,
      sim.maxTurns,
      updatedFlags,
      firstTurnCash,
      existingAchievements,
      negotiationCount
    );

    if (newAchievements.length > 0) {
      await prisma.achievement.createMany({
        data: newAchievements.map((type) => ({ simulationId: sim.id, type })),
      });
    }

    // ── 7. Update simulation state ────────────────────────────────────────────
    await prisma.simulation.update({
      where: { id: sim.id },
      data: {
        cash: newMetrics.cash,
        monthlyRevenue: newMetrics.monthlyRevenue,
        burnRate: newMetrics.burnRate,
        reputation: newMetrics.reputation,
        morale: newMetrics.morale,
        churn: newMetrics.churn,
        legalRisk: newMetrics.legalRisk,
        marketShare: newMetrics.marketShare,
        supplierReliability: newHidden.supplierReliability,
        employeeLoyalty: newHidden.employeeLoyalty,
        demandVolatility: newHidden.demandVolatility,
        competitorAggression: newHidden.competitorAggression,
        flags: JSON.stringify(updatedFlags),
        currentTurn: isEnded ? sim.currentTurn : nextTurnNumber,
        status: isEnded ? 'ended' : 'active',
        endingType: isEnded ? ending.endingType! : '',
        endedAt: isEnded ? new Date() : null,
        finalReport: isEnded && finalReportData ? JSON.stringify(finalReportData) : '',
      },
    });

    return NextResponse.json({
      newMetrics,
      deltas: rulesOutput.deltas,
      tags,
      competitorAction: rulesOutput.competitorAction,
      newAchievements,
      ending: isEnded ? ending : null,
      nextTurn: nextTurnData,
      finalReport: finalReportData,
    });
  } catch (e) {
    console.error('[submit-turn]', e);
    return NextResponse.json(
      { error: 'Failed to process turn', details: String(e) },
      { status: 500 }
    );
  }
}
