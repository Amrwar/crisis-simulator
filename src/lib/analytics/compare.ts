import { VISIBLE_METRIC_KEYS, isLowerBetter, type VisibleMetricKey } from '@/types';

import type { DecisionRecord, RunAnalytics } from './run-report';

/**
 * Putting two finished runs side by side.
 *
 * The interesting question is not "which scored higher" — the leaderboard says
 * that — but where the two diverged: which metric each run ended better on,
 * which decisions they shared, and which turn they stopped agreeing.
 */

export interface MetricComparison {
  metric: VisibleMetricKey;
  aFirst: number;
  aLast: number;
  bFirst: number;
  bLast: number;
  /** `aLast - bLast`. */
  difference: number;
  /** Which run ended better on this metric, accounting for direction. */
  winner: 'a' | 'b' | 'tie';
  /** Both trajectories, for a two-line chart. */
  aValues: number[];
  bValues: number[];
}

export interface DecisionComparison {
  turnNumber: number;
  aDecision: string | null;
  bDecision: string | null;
  aTags: string[];
  bTags: string[];
  /** Tags both runs used on this turn. */
  sharedTags: string[];
  /** True when the two runs took a materially different line here. */
  diverged: boolean;
}

export interface RunComparison {
  a: RunSummary;
  b: RunSummary;
  metrics: MetricComparison[];
  decisions: DecisionComparison[];
  /** Metrics each run ended ahead on. */
  metricsWonByA: VisibleMetricKey[];
  metricsWonByB: VisibleMetricKey[];
  /** Decision tags used in both runs, most-shared first. */
  sharedTags: string[];
  /** Tags used in one run and not the other. */
  onlyInA: string[];
  onlyInB: string[];
  /** The first turn where the two runs took different decisions. */
  firstDivergentTurn: number | null;
  /** Turns both runs played. */
  comparableTurns: number;
}

export interface RunSummary {
  simulationId: string;
  companyName: string;
  industry: string;
  difficulty: string;
  endingType: string;
  performanceScore: number;
  turnsCompleted: number;
}

/** Reduces one run's analytics to the header a comparison column shows. */
export function summarizeForComparison(run: RunAnalytics): RunSummary {
  return {
    simulationId: run.simulationId,
    companyName: run.companyName,
    industry: run.industry,
    difficulty: run.difficulty,
    endingType: run.endingType,
    performanceScore: run.performanceScore,
    turnsCompleted: run.turnsCompleted,
  };
}

/**
 * Compares two runs.
 *
 * The runs need not be the same length: a run that ended on turn 6 and one
 * that went the distance are still worth comparing, so the decision table
 * covers the union of their turns and marks the missing side as absent rather
 * than truncating to the shorter run.
 */
export function compareRuns(a: RunAnalytics, b: RunAnalytics): RunComparison {
  const metrics = VISIBLE_METRIC_KEYS.map((metric) => compareMetric(metric, a, b));

  const decisions = compareDecisions(a.decisions, b.decisions);
  const aTags = new Set(a.tagCounts.map((t) => t.tag));
  const bTags = new Set(b.tagCounts.map((t) => t.tag));

  return {
    a: summarizeForComparison(a),
    b: summarizeForComparison(b),
    metrics,
    decisions,
    metricsWonByA: metrics.filter((m) => m.winner === 'a').map((m) => m.metric),
    metricsWonByB: metrics.filter((m) => m.winner === 'b').map((m) => m.metric),
    sharedTags: Array.from(aTags).filter((tag) => bTags.has(tag)).sort(),
    onlyInA: Array.from(aTags).filter((tag) => !bTags.has(tag)).sort(),
    onlyInB: Array.from(bTags).filter((tag) => !aTags.has(tag)).sort(),
    firstDivergentTurn: decisions.find((d) => d.diverged)?.turnNumber ?? null,
    comparableTurns: Math.min(a.turnsCompleted, b.turnsCompleted),
  };
}

function compareMetric(
  metric: VisibleMetricKey,
  a: RunAnalytics,
  b: RunAnalytics
): MetricComparison {
  const at = a.trajectories[metric];
  const bt = b.trajectories[metric];
  const difference = at.last - bt.last;

  // A rise is not automatically better: on churn, burn and legal risk, the
  // lower final number is the stronger position.
  const aAhead = isLowerBetter(metric) ? difference < 0 : difference > 0;

  return {
    metric,
    aFirst: at.first,
    aLast: at.last,
    bFirst: bt.first,
    bLast: bt.last,
    difference,
    winner: difference === 0 ? 'tie' : aAhead ? 'a' : 'b',
    aValues: at.values,
    bValues: bt.values,
  };
}

/**
 * Lines the two decision logs up by turn number.
 *
 * Two runs are "divergent" on a turn when both decided it and they share no
 * decision tag. Comparing the option letters would be meaningless — the same
 * letter is a different option in each run, because the scenarios differ.
 */
export function compareDecisions(
  aDecisions: readonly DecisionRecord[],
  bDecisions: readonly DecisionRecord[]
): DecisionComparison[] {
  const turnNumbers = Array.from(
    new Set([...aDecisions.map((d) => d.turnNumber), ...bDecisions.map((d) => d.turnNumber)])
  ).sort((x, y) => x - y);

  return turnNumbers.map((turnNumber) => {
    const a = aDecisions.find((d) => d.turnNumber === turnNumber && d.decided);
    const b = bDecisions.find((d) => d.turnNumber === turnNumber && d.decided);

    const aTags = a?.tags ?? [];
    const bTags = b?.tags ?? [];
    const sharedTags = aTags.filter((tag) => bTags.includes(tag));

    return {
      turnNumber,
      aDecision: a?.decision ?? null,
      bDecision: b?.decision ?? null,
      aTags,
      bTags,
      sharedTags,
      // A turn only one run reached is not a divergence in strategy; it is a
      // difference in how far each got, which the summary already reports.
      diverged: a !== undefined && b !== undefined && sharedTags.length === 0,
    };
  });
}

/** A one-line verdict for the top of the comparison. */
export function comparisonHeadline(comparison: RunComparison): string {
  const { a, b } = comparison;

  if (a.performanceScore === b.performanceScore) {
    return `Both runs scored ${a.performanceScore}.`;
  }

  const [winner, loser] =
    a.performanceScore > b.performanceScore ? [a, b] : [b, a];
  const gap = Math.abs(a.performanceScore - b.performanceScore);

  return `${winner.companyName} scored ${gap} ${gap === 1 ? 'point' : 'points'} higher than ${loser.companyName}.`;
}
