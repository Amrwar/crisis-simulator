import { percentileFor, rankRuns, scoreBand } from '@/lib/game/scoring';
import type { Page } from '@/types';

/**
 * Assembling the shared leaderboard.
 *
 * The board shows runs belonging to every player, so what it projects matters:
 * only the parts of a run that are public in spirit — the company name the
 * generator invented, the setup, the score and the ending. Nothing about the
 * decisions, the narrative, the seed or the owner's email leaves this module.
 */

/** The columns the board needs from a stored simulation. */
export interface LeaderboardSource {
  id: string;
  userId: string;
  companyName: string;
  industry: string;
  difficulty: string;
  companySize: string;
  endingType: string;
  performanceScore: number;
  currentTurn: number;
  maxTurns: number;
  endedAt: Date | null;
  user: { name: string | null };
}

export interface LeaderboardEntry {
  rank: number;
  /** True when at least one other run shares this exact position. */
  tied: boolean;
  simulationId: string;
  companyName: string;
  industry: string;
  difficulty: string;
  companySize: string;
  endingType: string;
  performanceScore: number;
  scoreBand: string;
  scoreLabel: string;
  turnsCompleted: number;
  maxTurns: number;
  /** Display name of the player, or a stable anonymous label. */
  playerName: string;
  /** True for a run belonging to the caller — the row the UI highlights. */
  isCurrentUser: boolean;
  endedAt: string | null;
}

export interface LeaderboardStanding {
  rank: number;
  percentile: number | null;
  simulationId: string;
  performanceScore: number;
}

export interface LeaderboardPayload {
  page: Page<LeaderboardEntry>;
  /** Where the caller's best qualifying run sits on this filtered board. */
  yourBest: LeaderboardStanding | null;
  filters: LeaderboardFilters;
  /** Completed runs on the board before paging. */
  totalRuns: number;
}

export interface LeaderboardFilters {
  industry?: string;
  difficulty?: string;
  ending?: string;
}

/**
 * What to call a player on a shared board.
 *
 * A user who set a display name is shown by it. A user who never did is shown
 * as "Player" plus the tail of their id: stable across page loads, so two rows
 * from the same anonymous player read as the same person, while revealing
 * nothing that was not already an opaque identifier. An email is never used,
 * even as a fallback.
 */
export function displayNameFor(name: string | null, userId: string): string {
  const trimmed = (name ?? '').trim();
  if (trimmed !== '') return trimmed;
  return `Player ${userId.slice(-4).toUpperCase()}`;
}

/** Ranks the rows and projects each into a board entry. */
export function buildLeaderboardEntries(
  rows: readonly LeaderboardSource[],
  currentUserId: string
): LeaderboardEntry[] {
  const ranked = rankRuns(rows.map((row) => ({ ...row, turnsCompleted: row.currentTurn })));

  return ranked.map(({ rank, tied, run }) => {
    const band = scoreBand(run.performanceScore);

    return {
      rank,
      tied,
      simulationId: run.id,
      // A run whose generated profile never named the company falls back to
      // its industry rather than showing an empty cell.
      companyName: run.companyName || run.industry,
      industry: run.industry,
      difficulty: run.difficulty,
      companySize: run.companySize,
      endingType: run.endingType,
      performanceScore: run.performanceScore,
      scoreBand: band.band,
      scoreLabel: band.label,
      turnsCompleted: run.turnsCompleted,
      maxTurns: run.maxTurns,
      playerName: displayNameFor(run.user.name, run.userId),
      isCurrentUser: run.userId === currentUserId,
      endedAt: run.endedAt ? run.endedAt.toISOString() : null,
    };
  });
}

/**
 * The caller's standing on a board they may not appear on.
 *
 * Entries are already ranked best-first, so the first one belonging to the
 * caller is their best run under the active filter.
 */
export function standingFor(
  entries: readonly LeaderboardEntry[],
  total = entries.length
): LeaderboardStanding | null {
  const mine = entries.find((entry) => entry.isCurrentUser);
  if (!mine) return null;

  return {
    rank: mine.rank,
    percentile: percentileFor(mine.rank, total),
    simulationId: mine.simulationId,
    performanceScore: mine.performanceScore,
  };
}
