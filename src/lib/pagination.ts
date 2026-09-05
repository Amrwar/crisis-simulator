import type { Page } from '@/types';

/**
 * Page-window arithmetic, kept away from the routes that use it.
 *
 * Every list endpoint takes `page` (1-based) and `pageSize`, and answers with
 * the `Page<T>` envelope so a client can render "page 2 of 7" without a second
 * request.
 */

export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 100;
export const MIN_PAGE_SIZE = 1;

export interface PageRequest {
  page: number;
  pageSize: number;
}

/**
 * Coerces whatever arrived on the query string into a usable window.
 *
 * Anything unparseable, negative, fractional or absurdly large falls back to a
 * sane value instead of failing the request: a bad `?page=` should not stop
 * somebody seeing their simulations.
 */
export function resolvePageRequest(
  page: unknown,
  pageSize: unknown,
  defaultPageSize = DEFAULT_PAGE_SIZE
): PageRequest {
  return {
    page: coerceInteger(page, 1, 1, Number.MAX_SAFE_INTEGER),
    pageSize: coerceInteger(pageSize, defaultPageSize, MIN_PAGE_SIZE, MAX_PAGE_SIZE),
  };
}

function coerceInteger(raw: unknown, fallback: number, min: number, max: number): number {
  const parsed =
    typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;

  if (!Number.isFinite(parsed)) return fallback;

  const truncated = Math.trunc(parsed);
  if (truncated < min) return min;
  if (truncated > max) return max;
  return truncated;
}

/** The Prisma `skip`/`take` pair for a window. */
export function toSkipTake({ page, pageSize }: PageRequest): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

/** How many pages `total` rows occupy. Zero rows is still one (empty) page. */
export function pageCountFor(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * Wraps a slice of rows with the counts a pager needs.
 *
 * `page` is clamped to the last page that actually exists, so asking for page
 * 99 of a 3-page list reports page 3 rather than an impossible position.
 */
export function buildPage<T>(items: T[], total: number, request: PageRequest): Page<T> {
  const pageCount = pageCountFor(total, request.pageSize);
  const page = Math.min(Math.max(1, request.page), pageCount);

  return {
    items,
    total,
    page,
    pageSize: request.pageSize,
    pageCount,
    hasPrevious: page > 1,
    hasNext: page < pageCount,
  };
}

/** Pages an already-loaded array. Used where the rows are computed, not queried. */
export function paginateArray<T>(rows: readonly T[], request: PageRequest): Page<T> {
  const pageCount = pageCountFor(rows.length, request.pageSize);
  const page = Math.min(Math.max(1, request.page), pageCount);
  const start = (page - 1) * request.pageSize;

  return buildPage(rows.slice(start, start + request.pageSize), rows.length, {
    ...request,
    page,
  });
}

/**
 * The page numbers a pager should offer, with `null` standing for an ellipsis.
 *
 * Always includes the first and last page plus a window around the current one,
 * so the control keeps a stable width however many pages there are.
 */
export function pageWindow(current: number, pageCount: number, radius = 1): Array<number | null> {
  if (pageCount <= 1) return [1];

  const clamped = Math.min(Math.max(1, current), pageCount);
  const wanted = new Set<number>([1, pageCount]);
  for (let p = clamped - radius; p <= clamped + radius; p++) {
    if (p >= 1 && p <= pageCount) wanted.add(p);
  }

  const sorted = Array.from(wanted).sort((a, b) => a - b);
  const out: Array<number | null> = [];
  let previous = 0;

  for (const p of sorted) {
    if (previous !== 0 && p - previous > 1) out.push(null);
    out.push(p);
    previous = p;
  }

  return out;
}
