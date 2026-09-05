import { guardFailed, requireUserId } from '@/lib/api/guards';
import { ok } from '@/lib/api/respond';
import { prisma } from '@/lib/db';
import {
  achievementCatalog,
  buildProgress,
  type AchievementsPayload,
  type PlayerBests,
} from '@/lib/game/achievement-catalog';
import { parseFlags } from '@/lib/json';

/**
 * GET /api/achievements
 *
 * The whole catalogue with the caller's state against it: what they hold, when
 * they first earned it, and how close they are to the ones they do not.
 */

export async function GET() {
  const auth = await requireUserId();
  if (guardFailed(auth)) return auth.response;

  const unlocks = await prisma.achievement.findMany({
    where: { simulation: { userId: auth.value } },
    select: { type: true, unlockedAt: true, simulationId: true },
    orderBy: { unlockedAt: 'asc' },
  });

  const bests = await playerBests(auth.value);
  const progress = buildProgress(unlocks, bests);
  const catalog = achievementCatalog();

  const payload: AchievementsPayload = {
    catalog,
    progress,
    unlockedCount: progress.filter((p) => p.unlocked).length,
    totalCount: catalog.length,
    bests,
  };

  return ok(payload);
}

/**
 * The high-water marks a progress bar is measured against.
 *
 * Reputation, morale and market share are read from the per-turn snapshots
 * rather than the simulation row, because the row only holds where a run ended
 * — a player who peaked at 90 reputation and finished at 40 has still been to
 * 90, and the achievement asks whether they ever got there.
 */
async function playerBests(userId: string): Promise<PlayerBests> {
  const [snapshots, runs] = await Promise.all([
    prisma.turn.aggregate({
      where: { simulation: { userId } },
      _max: { reputationAfter: true, moraleAfter: true, marketShareAfter: true },
    }),
    prisma.simulation.findMany({
      where: { userId },
      select: { currentTurn: true, flags: true },
    }),
  ]);

  return {
    bestReputation: snapshots._max.reputationAfter ?? 0,
    bestMorale: snapshots._max.moraleAfter ?? 0,
    bestMarketShare: snapshots._max.marketShareAfter ?? 0,
    longestRun: runs.reduce((longest, run) => Math.max(longest, run.currentTurn), 0),
    mostNegotiationsInARun: runs.reduce((most, run) => {
      const count = parseFlags(run.flags)['negotiation_count_num'];
      return typeof count === 'number' ? Math.max(most, count) : most;
    }, 0),
  };
}
