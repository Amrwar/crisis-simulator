import { checkAchievements, checkEnding, type EndingResult } from './endings';
import { applyRules, type CompetitorState, type HiddenState, type MetricsState } from './rules-engine';
import type { DecisionTag } from './tags';

/**
 * Advancing a simulation by one turn.
 *
 * This is the whole deterministic half of a turn: the rules engine, the flag
 * bookkeeping around it, the ending check and the achievement check. It was
 * spelled out inline in `POST /api/simulations/[id]/turn`, interleaved with the
 * database writes and the provider calls it also has to do.
 *
 * Pulling it out changes nothing about how a turn resolves — the order of the
 * steps and every threshold are as they were — but it gives the deterministic
 * part a name, a signature, and a second caller: the replay endpoint, which
 * can only claim to verify a run if it re-runs the same code the run used.
 */

/** Everything a turn needs to know about where the simulation stands. */
export interface SimulationState {
  metrics: MetricsState;
  hidden: HiddenState;
  competitor: CompetitorState;
  flags: Record<string, unknown>;
  /** The turn being resolved. */
  currentTurn: number;
  maxTurns: number;
  difficulty: string;
  seed: number;
  /**
   * Cash the company opened on, which every proportional threshold is measured
   * against. The route reads it from the first turn's snapshot.
   */
  startingCash: number;
}

export interface AdvanceResult {
  /** Visible metrics after the turn resolved. */
  metrics: MetricsState;
  /** Hidden variables after the turn resolved. */
  hidden: HiddenState;
  /** Per-metric change this turn, as stored on the turn row. */
  deltas: Partial<MetricsState>;
  /** Flags after this turn's bookkeeping, ready to be stored. */
  flags: Record<string, unknown>;
  /** Flags the rules engine raised this turn. */
  newFlags: string[];
  /** Prose describing what the competitor did, for the next prompt. */
  competitorAction: string;
  ending: EndingResult;
  /** Achievements unlocked by this turn, excluding ones already held. */
  newAchievements: string[];
}

/**
 * Resolves one turn's decision.
 *
 * Pure: it reads `state` and returns a new one, and never touches the database
 * or the model provider. Given the same state and tags it always produces the
 * same result, which is what makes a replay meaningful.
 */
export function advanceTurn(
  state: SimulationState,
  tags: DecisionTag[],
  existingAchievements: readonly string[] = []
): AdvanceResult {
  const rules = applyRules({
    metrics: state.metrics,
    hidden: state.hidden,
    competitor: state.competitor,
    tags,
    difficulty: state.difficulty,
    simSeed: state.seed,
    turnNumber: state.currentTurn,
    flags: state.flags,
  });

  // Flags are stored as a loose map so they can hold counters as well as
  // booleans; the rules engine only ever raises booleans.
  const flags: Record<string, unknown> = { ...state.flags };
  for (const flag of rules.newFlags) flags[flag] = true;

  // Having once been near the floor is what the turnaround achievement asks
  // about, so it is recorded the moment it happens rather than inferred later.
  if (rules.metrics.cash < state.startingCash * 0.2) flags['was_in_crisis'] = true;

  if (tags.includes('negotiate_supplier')) {
    const previous = flags['negotiation_count_num'];
    flags['negotiation_count_num'] = (typeof previous === 'number' ? previous : 0) + 1;
  }

  const ending = checkEnding(
    rules.metrics,
    state.currentTurn,
    state.maxTurns,
    flags,
    state.startingCash
  );

  const negotiationCount = flags['negotiation_count_num'];

  return {
    metrics: rules.metrics,
    hidden: rules.hidden,
    deltas: rules.deltas,
    flags,
    newFlags: rules.newFlags,
    competitorAction: rules.competitorAction,
    ending,
    newAchievements: checkAchievements(
      rules.metrics,
      state.currentTurn,
      state.maxTurns,
      flags,
      state.startingCash,
      [...existingAchievements],
      typeof negotiationCount === 'number' ? negotiationCount : 0
    ),
  };
}

/** The state after a turn, ready to be fed back in for the next one. */
export function nextState(state: SimulationState, result: AdvanceResult): SimulationState {
  return {
    ...state,
    metrics: result.metrics,
    hidden: result.hidden,
    flags: result.flags,
    currentTurn: state.currentTurn + 1,
  };
}
