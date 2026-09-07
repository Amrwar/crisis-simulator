import { guardFailed, requireUserId } from '@/lib/api/guards';
import { ok } from '@/lib/api/respond';
import {
  buildScoreHistory,
  summarizeRuns,
  tagFrequency,
  type UserAnalyticsPayload,
} from '@/lib/analytics/user-stats';
import { parseJsonArray } from '@/lib/json';
import { prisma } from '@/lib/db';

/**
 * GET /api/analytics/me
 *
 * Everything the analytics page shows about the caller's own history: the
 * headline counts, the per-industry and per-difficulty breakdowns, streaks,
 * and which decisions they reach for most often.
 */

export async function GET() {
  const auth = await requireUserId();
  if (guardFailed(auth)) return auth.response;

  const runs = await prisma.simulation.findMany({
    where: { userId: auth.value },
    select: {
      id: true,
      industry: true,
      difficulty: true,
      companySize: true,
      status: true,
      endingType: true,
      performanceScore: true,
      currentTurn: true,
      maxTurns: true,
      createdAt: true,
      endedAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  // Only decided turns carry a decision; the turn a player is currently
  // looking at has an empty tag array and would dilute the counts.
  const decidedTurns = await prisma.turn.findMany({
    where: { simulation: { userId: auth.value }, decidedAt: { not: null } },
    select: { tags: true },
  });

  const payload: UserAnalyticsPayload = {
    stats: summarizeRuns(runs),
    favouriteDecisions: tagFrequency(
      decidedTurns.map((turn) => parseJsonArray<string>(turn.tags, (v) => typeof v === 'string'))
    ),
    scoreHistory: buildScoreHistory(runs),
  };

  return ok(payload);
}
