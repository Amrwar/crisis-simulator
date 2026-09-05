import { formatIsoDate } from '@/lib/format';
import { parseFlags, parseJsonOrNull, parseMetricDeltas, parseTags } from '@/lib/json';

import { toCsv } from './csv';

/**
 * Projecting a run into something a player can take away.
 *
 * Two shapes, one source: JSON for anything that will be read back by a
 * program, and CSV for the turn-by-turn table people actually open in a
 * spreadsheet. Both are built here so the two can never describe different
 * numbers.
 */

/** The columns an export reads from a stored run. */
export interface ExportableRun {
  id: string;
  industry: string;
  difficulty: string;
  companySize: string;
  companyName: string;
  companyLocation: string;
  startingSituation: string;
  competitorName: string;
  competitorStrategy: string;
  status: string;
  endingType: string;
  performanceScore: number;
  currentTurn: number;
  maxTurns: number;
  seed: number;
  flags: string;
  finalReport: string;
  notes: string;
  cash: number;
  monthlyRevenue: number;
  burnRate: number;
  reputation: number;
  morale: number;
  churn: number;
  legalRisk: number;
  marketShare: number;
  createdAt: Date;
  endedAt: Date | null;
}

export interface ExportableTurn {
  turnNumber: number;
  title: string;
  narrative: string;
  optionId: string;
  freeText: string;
  tags: string;
  metricDeltas: string;
  coachFeedback: string;
  coachWhyMatters: string;
  note: string;
  cashAfter: number;
  revenueAfter: number;
  burnRateAfter: number;
  reputationAfter: number;
  moraleAfter: number;
  churnAfter: number;
  legalRiskAfter: number;
  marketShareAfter: number;
  decidedAt: Date | null;
}

export interface ExportableAchievement {
  type: string;
  unlockedAt: Date;
}

export interface RunExportSource {
  run: ExportableRun;
  turns: readonly ExportableTurn[];
  achievements: readonly ExportableAchievement[];
  tags: ReadonlyArray<{ label: string }>;
}

/** The version stamp on a JSON export, so a later reader knows the shape. */
export const EXPORT_FORMAT_VERSION = 1;

/**
 * The JSON export.
 *
 * The seed is included deliberately: it is what makes a run reproducible, and
 * an export the owner cannot replay from is not a real export. It is the
 * owner's own run — this endpoint is ownership-checked — which is exactly the
 * case the shared leaderboard is not, and why the seed is withheld there.
 */
export function buildJsonExport(source: RunExportSource): Record<string, unknown> {
  const { run, turns, achievements, tags } = source;

  return {
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    simulation: {
      id: run.id,
      companyName: run.companyName,
      companyLocation: run.companyLocation,
      startingSituation: run.startingSituation,
      industry: run.industry,
      difficulty: run.difficulty,
      companySize: run.companySize,
      competitor: { name: run.competitorName, strategy: run.competitorStrategy },
      status: run.status,
      endingType: run.endingType,
      performanceScore: run.performanceScore,
      turnsCompleted: turns.filter((turn) => turn.decidedAt !== null).length,
      currentTurn: run.currentTurn,
      maxTurns: run.maxTurns,
      seed: run.seed,
      notes: run.notes,
      tags: tags.map((tag) => tag.label),
      createdAt: formatIsoDate(run.createdAt),
      endedAt: run.endedAt === null ? null : formatIsoDate(run.endedAt),
    },
    finalMetrics: {
      cash: run.cash,
      monthlyRevenue: run.monthlyRevenue,
      burnRate: run.burnRate,
      reputation: run.reputation,
      morale: run.morale,
      churn: run.churn,
      legalRisk: run.legalRisk,
      marketShare: run.marketShare,
    },
    flags: parseFlags(run.flags),
    finalReport: parseJsonOrNull<unknown>(run.finalReport),
    achievements: achievements.map((achievement) => ({
      type: achievement.type,
      unlockedAt: formatIsoDate(achievement.unlockedAt),
    })),
    turns: turns.map((turn) => ({
      turnNumber: turn.turnNumber,
      title: turn.title,
      narrative: turn.narrative,
      decision: {
        optionId: turn.optionId,
        freeText: turn.freeText,
        tags: parseTags(turn.tags),
        decidedAt: turn.decidedAt === null ? null : formatIsoDate(turn.decidedAt),
      },
      metricDeltas: parseMetricDeltas(turn.metricDeltas),
      metricsAfter: {
        cash: turn.cashAfter,
        monthlyRevenue: turn.revenueAfter,
        burnRate: turn.burnRateAfter,
        reputation: turn.reputationAfter,
        morale: turn.moraleAfter,
        churn: turn.churnAfter,
        legalRisk: turn.legalRiskAfter,
        marketShare: turn.marketShareAfter,
      },
      coach: { feedback: turn.coachFeedback, whyItMatters: turn.coachWhyMatters },
      note: turn.note,
    })),
  };
}

/** Column order of the CSV export. Named here so a test can pin it. */
export const CSV_HEADERS = [
  'turn',
  'title',
  'decision_option',
  'decision_text',
  'decision_tags',
  'decided_at',
  'cash',
  'monthly_revenue',
  'burn_rate',
  'reputation',
  'morale',
  'churn',
  'legal_risk',
  'market_share',
  'cash_delta',
  'reputation_delta',
  'coach_feedback',
  'note',
] as const;

/**
 * The CSV export: one row per turn.
 *
 * Every value goes through the escaper, because a company name, a typed
 * decision and a note are all free text that routinely contains commas.
 */
export function buildCsvExport(source: RunExportSource): string {
  const rows = [...source.turns]
    .sort((a, b) => a.turnNumber - b.turnNumber)
    .map((turn) => {
      const deltas = parseMetricDeltas(turn.metricDeltas);

      return [
        turn.turnNumber,
        turn.title,
        turn.optionId,
        turn.freeText,
        parseTags(turn.tags).join(' '),
        turn.decidedAt === null ? '' : formatIsoDate(turn.decidedAt),
        turn.cashAfter,
        turn.revenueAfter,
        turn.burnRateAfter,
        turn.reputationAfter,
        turn.moraleAfter,
        turn.churnAfter,
        turn.legalRiskAfter,
        turn.marketShareAfter,
        deltas.cash ?? '',
        deltas.reputation ?? '',
        turn.coachFeedback,
        turn.note,
      ];
    });

  return toCsv(CSV_HEADERS, rows);
}
