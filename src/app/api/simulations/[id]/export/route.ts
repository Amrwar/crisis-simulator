import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { guardFailed, requireOwnedSimulation } from '@/lib/api/guards';
import { notFound, validationFailed } from '@/lib/api/respond';
import { prisma } from '@/lib/db';
import { contentDisposition, safeFilename } from '@/lib/export/csv';
import { buildCsvExport, buildJsonExport } from '@/lib/export/run-export';

/**
 * GET /api/simulations/[id]/export?format=json|csv
 *
 * Downloads one run. Unlike every other endpoint added here this one does not
 * answer with the envelope: the body is the file, and wrapping it would mean
 * the downloaded `.csv` was not a CSV. Refusals still use the envelope, since
 * those are read by the page rather than saved.
 */

const QuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const owned = await requireOwnedSimulation(params.id);
  if (guardFailed(owned)) return owned.response;

  const parsed = QuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return validationFailed(parsed.error);

  const run = await prisma.simulation.findUnique({
    where: { id: owned.value.simulationId },
    include: {
      turns: { orderBy: { turnNumber: 'asc' } },
      achievements: { orderBy: { unlockedAt: 'asc' } },
      tags: { orderBy: { label: 'asc' } },
    },
  });

  if (!run) return notFound('Simulation not found');

  const source = {
    run,
    turns: run.turns,
    achievements: run.achievements,
    tags: run.tags,
  };

  const base = `crisissim-${run.companyName || run.industry}-${run.id.slice(-6)}`;

  if (parsed.data.format === 'csv') {
    return new NextResponse(buildCsvExport(source), {
      status: 200,
      headers: {
        // The charset matters: company names and narrative are not ASCII.
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': contentDisposition(safeFilename(base, 'csv')),
        'cache-control': 'no-store',
      },
    });
  }

  return new NextResponse(JSON.stringify(buildJsonExport(source), null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': contentDisposition(safeFilename(base, 'json')),
      'cache-control': 'no-store',
    },
  });
}
