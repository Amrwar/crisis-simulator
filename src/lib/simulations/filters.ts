import { z } from 'zod';

import { DIFFICULTIES, ENDING_TYPES, INDUSTRIES, SIMULATION_STATUSES } from '@/types';

/**
 * Narrowing a player's run list.
 *
 * The dashboard's original list was every run the player had ever started,
 * newest first. That is fine for five runs and unusable at fifty, so this adds
 * a text search, the obvious facets, a date window, sorting and paging.
 *
 * Building the Prisma `where` and `orderBy` here rather than in the route
 * keeps the translation testable, and keeps a filter from quietly becoming a
 * way to read somebody else's rows: the owner clause is applied by this module
 * and cannot be overridden by a query parameter.
 */

export const SORT_FIELDS = ['createdAt', 'endedAt', 'performanceScore', 'currentTurn', 'companyName'] as const;
export type SortField = (typeof SORT_FIELDS)[number];

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export const MAX_SEARCH_LENGTH = 100;

export const SearchQuerySchema = z.object({
  /** Free text, matched against the company name and the competitor's. */
  q: z.string().max(MAX_SEARCH_LENGTH).optional(),
  industry: z.enum(INDUSTRIES).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  status: z.enum(SIMULATION_STATUSES).optional(),
  ending: z.enum(ENDING_TYPES).optional(),
  /** Inclusive date window on when the run was started, as YYYY-MM-DD. */
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must be YYYY-MM-DD').optional(),
  /** A run label, as normalised by the annotations module. */
  tag: z.string().max(24).optional(),
  sort: z.enum(SORT_FIELDS).default('createdAt'),
  direction: z.enum(SORT_DIRECTIONS).default('desc'),
  page: z.string().optional(),
  pageSize: z.string().optional(),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

/** The Prisma filter shape, kept structural so this module needs no client import. */
export interface SimulationWhere {
  userId: string;
  industry?: string;
  difficulty?: string;
  status?: string;
  endingType?: string;
  createdAt?: { gte?: Date; lte?: Date };
  tags?: { some: { label: string } };
  OR?: Array<Record<string, { contains: string }>>;
}

/**
 * Translates a validated query into a Prisma `where`.
 *
 * `userId` is always present and is taken from the session, never from the
 * query, so no combination of filters can widen the result past the caller's
 * own runs.
 */
export function buildWhere(query: SearchQuery, userId: string): SimulationWhere {
  const where: SimulationWhere = { userId };

  if (query.industry) where.industry = query.industry;
  if (query.difficulty) where.difficulty = query.difficulty;
  if (query.status) where.status = query.status;
  if (query.ending) where.endingType = query.ending;
  if (query.tag) where.tags = { some: { label: query.tag } };

  const createdAt = dateWindow(query.from, query.to);
  if (createdAt) where.createdAt = createdAt;

  const search = (query.q ?? '').trim();
  if (search !== '') {
    where.OR = [
      { companyName: { contains: search } },
      { competitorName: { contains: search } },
      { startingSituation: { contains: search } },
    ];
  }

  return where;
}

/**
 * The inclusive day window.
 *
 * `to` is pushed to the end of its day: a player asking for runs up to the
 * 12th means the whole of the 12th, not the instant it began. An unparseable
 * or inverted range yields no window rather than an empty result, so a
 * mistyped date does not silently hide everything.
 */
export function dateWindow(
  from: string | undefined,
  to: string | undefined
): { gte?: Date; lte?: Date } | null {
  const start = from ? startOfDay(from) : null;
  const end = to ? endOfDay(to) : null;

  if (start === null && end === null) return null;
  if (start !== null && end !== null && start > end) return null;

  return {
    ...(start === null ? {} : { gte: start }),
    ...(end === null ? {} : { lte: end }),
  };
}

function startOfDay(day: string): Date | null {
  const date = new Date(`${day}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function endOfDay(day: string): Date | null {
  const date = new Date(`${day}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The Prisma `orderBy`.
 *
 * Every sort is followed by `createdAt desc` as a tie-break, so paging is
 * stable: without it two runs sharing a score could swap places between page
 * one and page two and one of them would never be seen.
 */
export function buildOrderBy(query: SearchQuery): Array<Record<string, SortDirection>> {
  if (query.sort === 'createdAt') return [{ createdAt: query.direction }];
  return [{ [query.sort]: query.direction }, { createdAt: 'desc' }];
}

/** Which filters are actually narrowing the list, for the "clear" control. */
export function activeFilterCount(query: SearchQuery): number {
  return [
    (query.q ?? '').trim() === '' ? null : query.q,
    query.industry,
    query.difficulty,
    query.status,
    query.ending,
    query.from,
    query.to,
    query.tag,
  ].filter((value) => value !== undefined && value !== null && value !== '').length;
}

/** Echoes back the filters that were applied, for the UI to render. */
export function appliedFilters(query: SearchQuery): Record<string, string> {
  const applied: Record<string, string> = {};

  const search = (query.q ?? '').trim();
  if (search !== '') applied.q = search;
  if (query.industry) applied.industry = query.industry;
  if (query.difficulty) applied.difficulty = query.difficulty;
  if (query.status) applied.status = query.status;
  if (query.ending) applied.ending = query.ending;
  if (query.from) applied.from = query.from;
  if (query.to) applied.to = query.to;
  if (query.tag) applied.tag = query.tag;

  return applied;
}
