import type { Page } from '@/types';

import type { SortDirection, SortField } from './filters';

/**
 * The row shape the dashboard renders, and the envelope the search endpoint
 * wraps it in.
 *
 * Deliberately a projection rather than the stored row: the seed, the flags
 * and the generated narrative have no business travelling to a list view, and
 * a `select` that names its columns cannot start leaking a new one when the
 * schema grows.
 */

export interface SimulationSearchResult {
  id: string;
  industry: string;
  difficulty: string;
  companySize: string;
  companyName: string;
  status: string;
  endingType: string;
  performanceScore: number;
  currentTurn: number;
  maxTurns: number;
  cash: number;
  reputation: number;
  marketShare: number;
  /** Whether the owner has written a note on this run, for a marker. */
  hasNotes: boolean;
  tags: string[];
  createdAt: string;
  endedAt: string | null;
}

export interface SimulationSearchPayload {
  page: Page<SimulationSearchResult>;
  /** The filters that were actually applied, echoed for the UI. */
  filters: Record<string, string>;
  sort: { field: SortField; direction: SortDirection };
  /** Every label the caller uses on any run, so the filter can offer them. */
  availableTags: string[];
}
