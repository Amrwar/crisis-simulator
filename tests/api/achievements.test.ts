import { beforeEach, describe, expect, it } from 'vitest';

import { GET as achievements } from '@/app/api/achievements/route';
import { prisma } from '@/lib/db';
import type { AchievementsPayload } from '@/lib/game/achievement-catalog';
import { ACHIEVEMENT_META } from '@/lib/game/endings';
import {
  resetDatabase,
  seedCompletedSimulation,
  signIn,
  signOut,
  type SignedInUser,
} from '../helpers/db';
import { readJson } from '../helpers/http';
import type { ApiResponse } from '@/types';

let user: SignedInUser;

beforeEach(async () => {
  await resetDatabase();
  user = await signIn('collector@example.com', 'Collector');
});

async function payload(): Promise<AchievementsPayload> {
  const response = await achievements();
  expect(response.status).toBe(200);
  const body = await readJson<ApiResponse<AchievementsPayload>>(response);
  if (!body.success) throw new Error(body.error);
  return body.data;
}

describe('GET /api/achievements', () => {
  it('answers 401 for an anonymous visitor', async () => {
    signOut();
    const response = await achievements();

    expect(response.status).toBe(401);
    expect(await readJson(response)).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns the whole catalogue even for a player with no runs', async () => {
    const data = await payload();

    expect(data.catalog.length).toBe(Object.keys(ACHIEVEMENT_META).length);
    expect(data.totalCount).toBe(data.catalog.length);
    expect(data.unlockedCount).toBe(0);
  });

  it('returns a progress entry for every catalogue entry', async () => {
    const data = await payload();

    expect(data.progress.map((p) => p.type).sort()).toEqual(
      data.catalog.map((c) => c.type).sort()
    );
  });

  it('marks the achievements the player has unlocked', async () => {
    const sim = await seedCompletedSimulation(user.id);
    await prisma.achievement.create({ data: { simulationId: sim.id, type: 'crisis_manager' } });

    const data = await payload();
    expect(data.unlockedCount).toBe(1);
    expect(data.progress.find((p) => p.type === 'crisis_manager')?.unlocked).toBe(true);
    expect(data.progress.find((p) => p.type === 'brand_guardian')?.unlocked).toBe(false);
  });

  it('points at the run the achievement was earned in', async () => {
    const sim = await seedCompletedSimulation(user.id);
    await prisma.achievement.create({ data: { simulationId: sim.id, type: 'negotiator' } });

    const negotiator = (await payload()).progress.find((p) => p.type === 'negotiator');
    expect(negotiator?.simulationId).toBe(sim.id);
    expect(negotiator?.unlockedAt).not.toBeNull();
  });

  it('does not count another player unlocks', async () => {
    const other = await prisma.user.create({
      data: { email: 'other@example.com', passwordHash: 'x' },
    });
    const theirs = await seedCompletedSimulation(other.id);
    await prisma.achievement.create({
      data: { simulationId: theirs.id, type: 'crisis_manager' },
    });

    expect((await payload()).unlockedCount).toBe(0);
  });

  it('counts the same achievement earned in two runs', async () => {
    const first = await seedCompletedSimulation(user.id);
    const second = await seedCompletedSimulation(user.id);
    await prisma.achievement.createMany({
      data: [
        { simulationId: first.id, type: 'crisis_manager' },
        { simulationId: second.id, type: 'crisis_manager' },
      ],
    });

    const data = await payload();
    expect(data.unlockedCount).toBe(1);
    expect(data.progress.find((p) => p.type === 'crisis_manager')?.timesUnlocked).toBe(2);
  });
});

describe('GET /api/achievements — progress towards a locked one', () => {
  it('reports zeroes for a player with no turns', async () => {
    const data = await payload();

    expect(data.bests.bestReputation).toBe(0);
    expect(data.bests.bestMorale).toBe(0);
    expect(data.bests.longestRun).toBe(0);
  });

  it('reads the peak from the turn snapshots, not from where the run ended', async () => {
    // Peaks at 92 reputation on turn 2, then collapses to 30 by the end.
    await seedCompletedSimulation(user.id, {
      turnsCompleted: 3,
      reputation: 30,
      trajectory: [{ reputation: 55 }, { reputation: 92 }, { reputation: 30 }],
    });

    expect((await payload()).bests.bestReputation).toBe(92);
  });

  it('takes the peak across every run, not just the latest', async () => {
    await seedCompletedSimulation(user.id, {
      turnsCompleted: 1,
      trajectory: [{ marketShare: 44 }],
    });
    await seedCompletedSimulation(user.id, {
      turnsCompleted: 1,
      trajectory: [{ marketShare: 12 }],
    });

    expect((await payload()).bests.bestMarketShare).toBe(44);
  });

  it('reports the longest run reached', async () => {
    await seedCompletedSimulation(user.id, { turnsCompleted: 4 });
    await seedCompletedSimulation(user.id, { turnsCompleted: 9 });

    expect((await payload()).bests.longestRun).toBe(9);
  });

  it('reads the negotiation count out of the run flags', async () => {
    await seedCompletedSimulation(user.id, { flags: { negotiation_count_num: 2 } });
    expect((await payload()).bests.mostNegotiationsInARun).toBe(2);
  });

  it('survives a run whose flag column is not valid JSON', async () => {
    const sim = await seedCompletedSimulation(user.id);
    await prisma.simulation.update({ where: { id: sim.id }, data: { flags: 'broken{' } });

    expect((await payload()).bests.mostNegotiationsInARun).toBe(0);
  });

  it('turns a peak into a fraction of the target', async () => {
    await seedCompletedSimulation(user.id, {
      turnsCompleted: 1,
      trajectory: [{ reputation: 40 }],
    });

    const guardian = (await payload()).progress.find((p) => p.type === 'brand_guardian');
    expect(guardian?.best).toBe(40);
    expect(guardian?.fraction).toBeCloseTo(0.5, 5);
  });
});
