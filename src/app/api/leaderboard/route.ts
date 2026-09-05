import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { guardFailed, requireUserId } from '@/lib/api/guards';
import { ok, validationFailed } from '@/lib/api/respond';
import { prisma } from '@/lib/db';
import {
  buildLeaderboardEntries,
  standingFor,
  type LeaderboardPayload,
} from '@/lib/leaderboard';
import { DEFAULT_PAGE_SIZE, paginateArray, resolvePageRequest } from '@/lib/pagination';
import { DIFFICULTIES, ENDING_TYPES, INDUSTRIES } from '@/types';

/**
 * GET /api/leaderboard
 *
 * Ranks every completed run in the product, best first, optionally narrowed to
 * one industry, difficulty or ending. The caller's own runs are flagged rather
 * than filtered out, so a player can see where they sit among everybody else.
 */

const FilterSchema = z.object({
  industry: z.enum(INDUSTRIES).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  ending: z.enum(ENDING_TYPES).optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (guardFailed(auth)) return auth.response;

  const parsed = FilterSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return validationFailed(parsed.error);

  const { industry, difficulty, ending, page, pageSize } = parsed.data;

  const rows = await prisma.simulation.findMany({
    where: {
      status: 'ended',
      ...(industry ? { industry } : {}),
      ...(difficulty ? { difficulty } : {}),
      ...(ending ? { endingType: ending } : {}),
    },
    select: {
      id: true,
      userId: true,
      companyName: true,
      industry: true,
      difficulty: true,
      companySize: true,
      endingType: true,
      performanceScore: true,
      currentTurn: true,
      maxTurns: true,
      endedAt: true,
      user: { select: { name: true } },
    },
  });

  const entries = buildLeaderboardEntries(rows, auth.value);

  const payload: LeaderboardPayload = {
    page: paginateArray(entries, resolvePageRequest(page, pageSize, DEFAULT_PAGE_SIZE)),
    yourBest: standingFor(entries),
    filters: {
      ...(industry ? { industry } : {}),
      ...(difficulty ? { difficulty } : {}),
      ...(ending ? { ending } : {}),
    },
    totalRuns: entries.length,
  };

  return ok(payload);
}
