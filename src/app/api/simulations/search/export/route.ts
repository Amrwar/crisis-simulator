import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { guardFailed, requireUserId } from '@/lib/api/guards';
import { validationFailed } from '@/lib/api/respond';
import { normalizeLabel } from '@/lib/annotations';
import { prisma } from '@/lib/db';
import { contentDisposition, safeFilename } from '@/lib/export/csv';
import {
  MAX_LIST_EXPORT_ROWS,
  buildListCsvExport,
  buildListJsonExport,
} from '@/lib/export/list-export';
import {
  SearchQuerySchema,
  appliedFilters,
  buildOrderBy,
  buildWhere,
} from '@/lib/simulations/filters';
import type { SimulationSearchResult } from '@/lib/simulations/results';

/**
 * GET /api/simulations/search/export?format=json|csv&<the search filters>
 *
 * Downloads the whole filtered cohort rather than one page of it. It takes the
 * same query as `/api/simulations/search` — deliberately the same schema, so
 * the dashboard can hand its current filters straight to a download link and
 * get exactly the runs it is showing, not a differently-filtered set.
 *
 * Like the single-run export the body is the file rather than the envelope;
 * refusals still use the envelope, since a page reads those.
 */

const ExportQuerySchema = SearchQuerySchema.extend({
  format: z.enum(['json', 'csv']).default('json'),
});

export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (guardFailed(auth)) return auth.response;

  const parsed = ExportQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return validationFailed(parsed.error);

  const query = parsed.data;
  // Stored labels are normalised, so a label typed into the filter has to be
  // matched normalised — the same rule the search endpoint follows.
  if (query.tag) query.tag = normalizeLabel(query.tag);

  const where = buildWhere(query, auth.value);

  const [total, rows] = await Promise.all([
    prisma.simulation.count({ where }),
    prisma.simulation.findMany({
      where,
      orderBy: buildOrderBy(query),
      // One past the cap, so a full page can be told from an exact fit.
      take: MAX_LIST_EXPORT_ROWS + 1,
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
    }),
  ]);

  const truncated = rows.length > MAX_LIST_EXPORT_ROWS;
  const results: SimulationSearchResult[] = rows.slice(0, MAX_LIST_EXPORT_ROWS).map((row) => ({
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

  const base = `crisissim-runs-${new Date().toISOString().slice(0, 10)}`;

  if (query.format === 'csv') {
    return new NextResponse(buildListCsvExport(results), {
      status: 200,
      headers: {
        // The charset matters: company names and labels are not ASCII.
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': contentDisposition(safeFilename(base, 'csv')),
        // The cap is invisible in a CSV, which has nowhere to record it.
        'x-export-truncated': truncated ? 'true' : 'false',
        'cache-control': 'no-store',
      },
    });
  }

  const payload = buildListJsonExport({
    results,
    filters: appliedFilters(query),
    sort: { field: query.sort, direction: query.direction },
    total,
    truncated,
  });

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': contentDisposition(safeFilename(base, 'json')),
      'x-export-truncated': truncated ? 'true' : 'false',
      'cache-control': 'no-store',
    },
  });
}
