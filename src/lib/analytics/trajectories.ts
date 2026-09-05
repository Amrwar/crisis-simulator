import { VISIBLE_METRIC_KEYS, isLowerBetter, type VisibleMetricKey } from '@/types';

/**
 * Turning a run's stored turns into per-metric series.
 *
 * Every turn carries a snapshot of the eight visible metrics as they stood
 * after it resolved, under column names that do not match the metric keys the
 * rest of the app uses (`revenueAfter` for `monthlyRevenue`, and so on). This
 * module owns that mapping, so nothing downstream has to know about it.
 */

/** The snapshot columns a Turn row carries. */
export interface TurnSnapshot {
  turnNumber: number;
  cashAfter: number;
  revenueAfter: number;
  burnRateAfter: number;
  reputationAfter: number;
  moraleAfter: number;
  churnAfter: number;
  legalRiskAfter: number;
  marketShareAfter: number;
}

/** Snapshot column for each metric. */
const SNAPSHOT_COLUMN: Record<VisibleMetricKey, keyof Omit<TurnSnapshot, 'turnNumber'>> = {
  cash: 'cashAfter',
  monthlyRevenue: 'revenueAfter',
  burnRate: 'burnRateAfter',
  reputation: 'reputationAfter',
  morale: 'moraleAfter',
  churn: 'churnAfter',
  legalRisk: 'legalRiskAfter',
  marketShare: 'marketShareAfter',
};

export interface MetricTrajectory {
  metric: VisibleMetricKey;
  /** One value per turn, in turn order. */
  values: number[];
  first: number;
  last: number;
  min: number;
  max: number;
  /** `last - first`. */
  change: number;
  /** Change as a share of the opening value, or null when it opened at zero. */
  changePercent: number | null;
  /**
   * Whether the run ended better than it started on this metric, accounting
   * for the metrics where a rise is a worsening.
   */
  improved: boolean;
  /** The largest single-turn fall (or rise, when lower is better). */
  worstTurn: { turnNumber: number; delta: number } | null;
  /** The largest single-turn improvement. */
  bestTurn: { turnNumber: number; delta: number } | null;
  /** Mean of the per-turn absolute changes — how eventful the run was. */
  volatility: number;
}

/** The eight trajectories of one run, plus the turn axis they share. */
export interface RunTrajectories {
  turnNumbers: number[];
  byMetric: Record<VisibleMetricKey, MetricTrajectory>;
}

/**
 * Builds every metric's trajectory from a run's turns.
 *
 * Turns are sorted defensively: the callers all order by `turnNumber`, but a
 * trajectory read out of order would silently produce nonsense deltas.
 */
export function buildTrajectories(turns: readonly TurnSnapshot[]): RunTrajectories {
  const ordered = [...turns].sort((a, b) => a.turnNumber - b.turnNumber);
  const turnNumbers = ordered.map((t) => t.turnNumber);

  const byMetric = {} as Record<VisibleMetricKey, MetricTrajectory>;
  for (const metric of VISIBLE_METRIC_KEYS) {
    byMetric[metric] = buildTrajectory(
      metric,
      ordered.map((turn) => turn[SNAPSHOT_COLUMN[metric]]),
      turnNumbers
    );
  }

  return { turnNumbers, byMetric };
}

/** One metric's trajectory from its already-extracted values. */
export function buildTrajectory(
  metric: VisibleMetricKey,
  values: number[],
  turnNumbers: number[]
): MetricTrajectory {
  if (values.length === 0) {
    return {
      metric,
      values: [],
      first: 0,
      last: 0,
      min: 0,
      max: 0,
      change: 0,
      changePercent: null,
      improved: false,
      worstTurn: null,
      bestTurn: null,
      volatility: 0,
    };
  }

  const first = values[0];
  const last = values[values.length - 1];
  const change = last - first;
  const lowerBetter = isLowerBetter(metric);

  // Deltas are attributed to the turn they landed on, so index 0 has none.
  const deltas = values.slice(1).map((value, index) => ({
    turnNumber: turnNumbers[index + 1] ?? index + 2,
    delta: value - values[index],
  }));

  const signed = (delta: number) => (lowerBetter ? -delta : delta);

  const best = deltas.reduce<{ turnNumber: number; delta: number } | null>(
    (bestSoFar, candidate) =>
      bestSoFar === null || signed(candidate.delta) > signed(bestSoFar.delta) ? candidate : bestSoFar,
    null
  );

  const worst = deltas.reduce<{ turnNumber: number; delta: number } | null>(
    (worstSoFar, candidate) =>
      worstSoFar === null || signed(candidate.delta) < signed(worstSoFar.delta)
        ? candidate
        : worstSoFar,
    null
  );

  const volatility =
    deltas.length === 0
      ? 0
      : deltas.reduce((sum, d) => sum + Math.abs(d.delta), 0) / deltas.length;

  return {
    metric,
    values,
    first,
    last,
    min: Math.min(...values),
    max: Math.max(...values),
    change,
    changePercent: first === 0 ? null : (change / Math.abs(first)) * 100,
    improved: lowerBetter ? change < 0 : change > 0,
    worstTurn: worst,
    bestTurn: best,
    volatility: Math.round(volatility * 100) / 100,
  };
}

/**
 * The turn where the run's fortunes turned hardest, over all metrics.
 *
 * Percentage metrics and cash live on wildly different scales, so each metric's
 * deltas are normalised by its own range before they are compared; otherwise a
 * cash movement would always win.
 */
export function pivotalTurn(trajectories: RunTrajectories): { turnNumber: number; score: number } | null {
  const { turnNumbers } = trajectories;
  if (turnNumbers.length < 2) return null;

  const scores = new Map<number, number>();

  for (const metric of VISIBLE_METRIC_KEYS) {
    const trajectory = trajectories.byMetric[metric];
    const range = trajectory.max - trajectory.min;
    if (range === 0) continue;

    for (let i = 1; i < trajectory.values.length; i++) {
      const turnNumber = turnNumbers[i];
      const normalised = Math.abs(trajectory.values[i] - trajectory.values[i - 1]) / range;
      scores.set(turnNumber, (scores.get(turnNumber) ?? 0) + normalised);
    }
  }

  let bestTurn: { turnNumber: number; score: number } | null = null;
  // Iterated in ascending turn order so an exact tie resolves to the earlier
  // turn — the one that actually set the run's direction.
  for (const turnNumber of turnNumbers) {
    const score = scores.get(turnNumber);
    if (score === undefined) continue;
    if (bestTurn === null || score > bestTurn.score) {
      bestTurn = { turnNumber, score: Math.round(score * 1000) / 1000 };
    }
  }

  return bestTurn;
}

/** Which metrics ended better than they started, and which ended worse. */
export function summarizeDirection(trajectories: RunTrajectories): {
  improved: VisibleMetricKey[];
  worsened: VisibleMetricKey[];
  unchanged: VisibleMetricKey[];
} {
  const improved: VisibleMetricKey[] = [];
  const worsened: VisibleMetricKey[] = [];
  const unchanged: VisibleMetricKey[] = [];

  for (const metric of VISIBLE_METRIC_KEYS) {
    const trajectory = trajectories.byMetric[metric];
    if (trajectory.change === 0) unchanged.push(metric);
    else if (trajectory.improved) improved.push(metric);
    else worsened.push(metric);
  }

  return { improved, worsened, unchanged };
}
