import type { NextRequest } from 'next/server';

import { guardFailed, requireUserId } from '@/lib/api/guards';
import { ok, validationFailed } from '@/lib/api/respond';
import { normalizeLabel } from '@/lib/annotations';
import { prisma } from '@/lib/db';
import { buildPage, clampPageRequest, resolvePageRequest, toSkipTake } from '@/lib/pagination';
import {
  SearchQuerySchema,
  appliedFilters,
  buildOrderBy,
  buildWhere,
} from '@/lib/simulations/filters';
import type { SimulationSearchPayload, SimulationSearchResult } from '@/lib/simulations/results';

/**
 * GET /api/simulations/search
 *
 * The dashboard's list, narrowed. `GET /api/simulations` still answers with
 * the bare array it always did — several things read it — so the filtered,
 * sorted and paged view lives here rather than changing that contract.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (guardFailed(auth)) return auth.response;

  const parsed = SearchQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return validationFailed(parsed.error);

  const query = parsed.data;
  // A label typed into the filter box arrives in whatever form the player
  // wrote it; it is stored normalised, so it has to be matched normalised.
  if (query.tag) query.tag = normalizeLabel(query.tag);

  const where = buildWhere(query, auth.value);

  // The count comes first because the window depends on it: a page past the
  // end has to be pulled back before the rows are fetched, or the query skips
  // past every row and the envelope reports a last page with nothing on it.
  const [total, labels] = await Promise.all([
    prisma.simulation.count({ where }),
    // Every label the player uses anywhere, so the filter can offer them.
    prisma.runTag.findMany({
      where: { simulation: { userId: auth.value } },
      select: { label: true },
      distinct: ['label'],
      orderBy: { label: 'asc' },
    }),
  ]);

  const pageRequest = clampPageRequest(
    resolvePageRequest(query.page, query.pageSize),
    total
  );

  const rows = await prisma.simulation.findMany({
    where,
    orderBy: buildOrderBy(query),
    ...toSkipTake(pageRequest),
    select: {
      id: true,
      industry: true,
      difficulty: true,
      companySize: true,
      companyName: true,
      status: true,
      endingType: true,
      performanceScore: true,
      currentTurn: true,
      maxTurns: true,
      cash: true,
      reputation: true,
      marketShare: true,
      notes: true,
      createdAt: true,
      endedAt: true,
      tags: { select: { label: true }, orderBy: { label: 'asc' } },
    },
  });

  const items: SimulationSearchResult[] = rows.map((row) => ({
    id: row.id,
    industry: row.industry,
    difficulty: row.difficulty,
    companySize: row.companySize,
    companyName: row.companyName,
    status: row.status,
    endingType: row.endingType,
    performanceScore: row.performanceScore,
    currentTurn: row.currentTurn,
    maxTurns: row.maxTurns,
    cash: row.cash,
    reputation: row.reputation,
    marketShare: row.marketShare,
    hasNotes: row.notes.trim() !== '',
    tags: row.tags.map((tag) => tag.label),
    createdAt: row.createdAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
  }));

  const payload: SimulationSearchPayload = {
    page: buildPage(items, total, pageRequest),
    filters: appliedFilters(query),
    sort: { field: query.sort, direction: query.direction },
    availableTags: labels.map((label) => label.label),
  };

  return ok(payload);
}
