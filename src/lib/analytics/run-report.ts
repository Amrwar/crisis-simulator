import { parseMetricDeltas, parseTags } from '@/lib/json';
import type { VisibleMetricKey } from '@/types';

import {
  buildTrajectories,
  pivotalTurn,
  summarizeDirection,
  type MetricTrajectory,
  type TurnSnapshot,
} from './trajectories';
import { tagFrequency } from './user-stats';

/**
 * Assembling one run's analytics: the metric trajectories, what was decided
 * each turn, and where the run actually turned.
 */

/** A stored turn as the run report needs it. */
export interface TurnRecord extends TurnSnapshot {
  title: string;
  optionId: string;
  freeText: string;
  tags: string;
  metricDeltas: string;
  coachFeedback: string;
  note: string;
  decidedAt: Date | null;
}

export interface DecisionRecord {
  turnNumber: number;
  title: string;
  /** What the player chose: the option letter, or their own words. */
  decision: string;
  /** True when the player typed a decision rather than picking an option. */
  wasFreeText: boolean;
  tags: string[];
  deltas: Record<string, number>;
  coachFeedback: string;
  note: string;
  decided: boolean;
}

export interface RunAnalytics {
  simulationId: string;
  companyName: string;
  industry: string;
  difficulty: string;
  status: string;
  endingType: string;
  performanceScore: number;
  turnsCompleted: number;
  maxTurns: number;
  turnNumbers: number[];
  trajectories: Record<VisibleMetricKey, MetricTrajectory>;
  decisions: DecisionRecord[];
  tagCounts: Array<{ tag: string; count: number }>;
  /** The turn that moved the most metrics the furthest. */
  pivotalTurn: { turnNumber: number; score: number } | null;
  direction: { improved: VisibleMetricKey[]; worsened: VisibleMetricKey[]; unchanged: VisibleMetricKey[] };
}

/** The simulation columns the run report needs. */
export interface RunHeader {
  id: string;
  companyName: string;
  industry: string;
  difficulty: string;
  status: string;
  endingType: string;
  performanceScore: number;
  currentTurn: number;
  maxTurns: number;
}

export function buildRunAnalytics(run: RunHeader, turns: readonly TurnRecord[]): RunAnalytics {
  const ordered = [...turns].sort((a, b) => a.turnNumber - b.turnNumber);

  // A run in progress ends on an undecided turn; its snapshot repeats the
  // previous turn's numbers and would flatten the tail of every trajectory.
  const decided = ordered.filter((turn) => turn.decidedAt !== null);
  const trajectorySource = decided.length > 0 ? decided : ordered;
  const trajectories = buildTrajectories(trajectorySource);

  const decisions: DecisionRecord[] = ordered.map((turn) => {
    const freeText = turn.freeText.trim();

    return {
      turnNumber: turn.turnNumber,
      title: turn.title,
      decision: freeText !== '' ? freeText : turn.optionId === '' ? '' : `Option ${turn.optionId}`,
      wasFreeText: freeText !== '',
      tags: parseTags(turn.tags),
      deltas: parseMetricDeltas(turn.metricDeltas),
      coachFeedback: turn.coachFeedback,
      note: turn.note,
      decided: turn.decidedAt !== null,
    };
  });

  return {
    simulationId: run.id,
    companyName: run.companyName || run.industry,
    industry: run.industry,
    difficulty: run.difficulty,
    status: run.status,
    endingType: run.endingType,
    performanceScore: run.performanceScore,
    turnsCompleted: decided.length,
    maxTurns: run.maxTurns,
    turnNumbers: trajectories.turnNumbers,
    trajectories: trajectories.byMetric,
    decisions,
    tagCounts: tagFrequency(decisions.filter((d) => d.decided).map((d) => d.tags)),
    pivotalTurn: pivotalTurn(trajectories),
    direction: summarizeDirection(trajectories),
  };
}
