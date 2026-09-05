import { parseTags } from '@/lib/json';
import { VISIBLE_METRIC_KEYS, type VisibleMetricKey } from '@/types';

import { filterValidTags } from './tags';
import { advanceTurn, nextState, type SimulationState } from './turn-engine';
import type { MetricsState } from './rules-engine';

/**
 * Replaying a finished run from its seed.
 *
 * The simulation's randomness is a seeded Mulberry32 keyed on the seed and the
 * turn number, and `advanceTurn` is pure, so a run is fully determined by its
 * seed, its opening state and the decisions taken. Replaying it means feeding
 * the stored decisions back through the same function and checking that every
 * turn lands on the numbers that were stored at the time.
 *
 * That is worth doing for its own sake — it is the audit trail behind a
 * leaderboard position — and it is a live regression test: if a change to the
 * rules engine silently alters an outcome, replaying an old run says so.
 */

/** The stored turn a replay is checked against. */
export interface StoredTurn {
  turnNumber: number;
  tags: string;
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

export interface MetricMismatch {
  metric: VisibleMetricKey;
  computed: number;
  stored: number;
  difference: number;
}

export interface ReplayStep {
  turnNumber: number;
  tags: string[];
  computed: MetricsState;
  stored: MetricsState;
  /** True when every metric matched to the stored precision. */
  matches: boolean;
  mismatches: MetricMismatch[];
  /** Prose describing the competitor's move, regenerated from the seed. */
  competitorAction: string;
  /** Flags this turn raised. */
  newFlags: string[];
  /** Whether this turn ended the run, and why. */
  ended: boolean;
  endingType: string | null;
}

export interface ReplayResult {
  simulationId: string;
  seed: number;
  /** True when every turn reproduced exactly. */
  reproduced: boolean;
  turnsReplayed: number;
  steps: ReplayStep[];
  /** The ending the replay arrived at. */
  computedEnding: string | null;
  /** The ending that was stored. */
  storedEnding: string;
  endingMatches: boolean;
  /** Total metric comparisons that disagreed, across all turns. */
  mismatchCount: number;
}

/** The opening state of a run, and what it was played with. */
export interface ReplaySource {
  simulationId: string;
  seed: number;
  difficulty: string;
  maxTurns: number;
  storedEnding: string;
  competitorStrength: number;
  competitorStrategy: string;
  /** Metrics as they stood before turn one resolved. */
  openingMetrics: MetricsState;
  openingHidden: {
    supplierReliability: number;
    employeeLoyalty: number;
    demandVolatility: number;
    competitorAggression: number;
  };
}

/**
 * Stored snapshots are rounded before they are written, so a comparison uses
 * the same tolerance the storage does rather than demanding bit equality of
 * two floating-point paths.
 */
const TOLERANCE = 0.05;

/**
 * Re-runs a stored simulation and reports where, if anywhere, it diverged.
 *
 * Only decided turns are replayed: an undecided turn has no decision to feed
 * back in, and its snapshot is a copy of the previous turn's.
 */
export function replaySimulation(
  source: ReplaySource,
  turns: readonly StoredTurn[]
): ReplayResult {
  const decided = [...turns]
    .filter((turn) => turn.decidedAt !== null)
    .sort((a, b) => a.turnNumber - b.turnNumber);

  let state: SimulationState = {
    metrics: source.openingMetrics,
    hidden: source.openingHidden,
    competitor: {
      competitorStrength: source.competitorStrength,
      competitorStrategy: source.competitorStrategy,
    },
    flags: {},
    currentTurn: decided[0]?.turnNumber ?? 1,
    maxTurns: source.maxTurns,
    difficulty: source.difficulty,
    seed: source.seed,
    // Every proportional threshold is measured against this. The live route
    // reads it from turn one's snapshot column, which still holds the opening
    // cash while turn one is being resolved and holds turn one's *result* from
    // turn two onwards. Replaying faithfully means moving the baseline the
    // same way — see the reassignment after the first step below.
    startingCash: source.openingMetrics.cash,
  };

  const steps: ReplayStep[] = [];
  const held: string[] = [];
  let computedEnding: string | null = null;

  for (const turn of decided) {
    // Keep the replay's turn counter on the stored turn, so a gap in the
    // stored history cannot silently shift the per-turn RNG.
    state = { ...state, currentTurn: turn.turnNumber };

    const tags = filterValidTags(parseTags(turn.tags));
    const outcome = advanceTurn(state, tags, held);
    held.push(...outcome.newAchievements);

    const stored = snapshotOf(turn);
    const mismatches = compareMetrics(outcome.metrics, stored);

    steps.push({
      turnNumber: turn.turnNumber,
      tags,
      computed: outcome.metrics,
      stored,
      matches: mismatches.length === 0,
      mismatches,
      competitorAction: outcome.competitorAction,
      newFlags: outcome.newFlags,
      ended: outcome.ending.ended,
      endingType: outcome.ending.endingType,
    });

    if (outcome.ending.ended) {
      computedEnding = outcome.ending.endingType;
      break;
    }

    state = nextState(state, outcome);

    // From turn two onwards the live route's baseline is turn one's stored
    // result. Taking it from the replay's own turn one rather than from the
    // stored column keeps a divergence visible instead of papering over it.
    if (steps.length === 1) state = { ...state, startingCash: steps[0].computed.cash };
  }

  const mismatchCount = steps.reduce((sum, step) => sum + step.mismatches.length, 0);

  return {
    simulationId: source.simulationId,
    seed: source.seed,
    reproduced: mismatchCount === 0 && steps.every((step) => step.matches),
    turnsReplayed: steps.length,
    steps,
    computedEnding,
    storedEnding: source.storedEnding,
    // A run still in progress stored no ending, so there is nothing to disagree
    // with; the metric comparison is what carries the verdict there.
    endingMatches: source.storedEnding === '' || computedEnding === source.storedEnding,
    mismatchCount,
  };
}

/** The eight visible metrics as a stored turn recorded them. */
export function snapshotOf(turn: StoredTurn): MetricsState {
  return {
    cash: turn.cashAfter,
    monthlyRevenue: turn.revenueAfter,
    burnRate: turn.burnRateAfter,
    reputation: turn.reputationAfter,
    morale: turn.moraleAfter,
    churn: turn.churnAfter,
    legalRisk: turn.legalRiskAfter,
    marketShare: turn.marketShareAfter,
  };
}

/** Every metric on which two states disagree by more than the stored precision. */
export function compareMetrics(computed: MetricsState, stored: MetricsState): MetricMismatch[] {
  const mismatches: MetricMismatch[] = [];

  for (const metric of VISIBLE_METRIC_KEYS) {
    const difference = computed[metric] - stored[metric];
    if (Math.abs(difference) > TOLERANCE) {
      mismatches.push({
        metric,
        computed: computed[metric],
        stored: stored[metric],
        difference: Math.round(difference * 100) / 100,
      });
    }
  }

  return mismatches;
}
