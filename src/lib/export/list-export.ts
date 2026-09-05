import { formatIsoDate } from '@/lib/format';
import type { SearchQuery } from '@/lib/simulations/filters';
import type { SimulationSearchResult } from '@/lib/simulations/results';

import { objectsToCsv } from './csv';

/**
 * Projecting a filtered run list into something a player can take away.
 *
 * The single-run export answers "give me everything about this one run". Once
 * the dashboard could narrow fifty runs down to the eight that matter, the
 * missing half of that became obvious: there was no way to get the list back
 * out except by exporting its rows one at a time.
 *
 * This builds from `SimulationSearchResult` — the same projection the search
 * endpoint already returns and the dashboard already renders — rather than
 * from the stored row. A cohort exported and a cohort on screen are then the
 * same numbers by construction, and neither can start carrying a column the
 * other does not.
 */

/** Bumped when the shape below changes in a way a reader would notice. */
export const LIST_EXPORT_FORMAT_VERSION = 1;

/**
 * One run, flattened for a spreadsheet.
 *
 * `tags` collapses to a space-joined string and `hasNotes` to a boolean: a
 * cell holds one value, so the array and the marker both have to become text
 * before they can be a column.
 */
export interface ListExportRow {
  id: string;
  company: string;
  industry: string;
  difficulty: string;
  company_size: string;
  status: string;
  ending: string;
  score: number;
  turn: number;
  max_turns: number;
  cash: number;
  reputation: number;
  market_share: number;
  labels: string;
  has_notes: boolean;
  created_at: string;
  ended_at: string;
}

/** Column order of the CSV export. Named here so a test can pin it. */
export const LIST_CSV_COLUMNS: ReadonlyArray<{ key: keyof ListExportRow; header: string }> = [
  { key: 'id', header: 'id' },
  { key: 'company', header: 'company' },
  { key: 'industry', header: 'industry' },
  { key: 'difficulty', header: 'difficulty' },
  { key: 'company_size', header: 'company_size' },
  { key: 'status', header: 'status' },
  { key: 'ending', header: 'ending' },
  { key: 'score', header: 'score' },
  { key: 'turn', header: 'turn' },
  { key: 'max_turns', header: 'max_turns' },
  { key: 'cash', header: 'cash' },
  { key: 'reputation', header: 'reputation' },
  { key: 'market_share', header: 'market_share' },
  { key: 'labels', header: 'labels' },
  { key: 'has_notes', header: 'has_notes' },
  { key: 'created_at', header: 'created_at' },
  { key: 'ended_at', header: 'ended_at' },
];

/** The headers the CSV writes, in order. Convenient for a test to assert on. */
export const LIST_CSV_HEADERS = LIST_CSV_COLUMNS.map((column) => column.header);

/**
 * Flattens one search result into its export row.
 *
 * A run still in progress has no ending and no end date; both become an empty
 * cell rather than the string "null", which a spreadsheet would show as a
 * word rather than a blank.
 */
export function toListExportRow(result: SimulationSearchResult): ListExportRow {
  return {
    id: result.id,
    company: result.companyName,
    industry: result.industry,
    difficulty: result.difficulty,
    company_size: result.companySize,
    status: result.status,
    ending: result.endingType,
    score: result.performanceScore,
    turn: result.currentTurn,
    max_turns: result.maxTurns,
    cash: result.cash,
    reputation: result.reputation,
    market_share: result.marketShare,
    labels: result.tags.join(' '),
    has_notes: result.hasNotes,
    created_at: formatIsoDate(result.createdAt),
    ended_at: result.endedAt === null ? '' : formatIsoDate(result.endedAt),
  };
}

/**
 * The CSV export: one row per run.
 *
 * Every value goes through the shared escaper, because a company name is
 * generated free text and routinely contains a comma.
 */
export function buildListCsvExport(results: readonly SimulationSearchResult[]): string {
  return objectsToCsv(LIST_CSV_COLUMNS, results.map(toListExportRow));
}

/** What the JSON export records about the query that produced the cohort. */
export interface ListExportSource {
  results: readonly SimulationSearchResult[];
  /** The filters that were actually applied, as the search echoes them. */
  filters: Record<string, string>;
  sort: { field: SearchQuery['sort']; direction: SearchQuery['direction'] };
  /** How many runs matched, which exceeds `results.length` when capped. */
  total: number;
  /** Whether the cap trimmed the cohort, so a reader is not misled by a short file. */
  truncated: boolean;
}

/**
 * The JSON export.
 *
 * Unlike the CSV this keeps the query alongside the rows. A file of forty runs
 * is much less useful six months later if nobody can tell which forty it was,
 * so the filters and the sort travel with the data.
 */
export function buildListJsonExport(source: ListExportSource): Record<string, unknown> {
  return {
    formatVersion: LIST_EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    query: {
      filters: source.filters,
      sort: source.sort,
    },
    total: source.total,
    exported: source.results.length,
    truncated: source.truncated,
    runs: source.results.map(toListExportRow),
  };
}
