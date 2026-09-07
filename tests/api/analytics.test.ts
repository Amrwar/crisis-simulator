import { beforeEach, describe, expect, it } from 'vitest';

import { GET as myAnalytics } from '@/app/api/analytics/me/route';
import { GET as runAnalytics } from '@/app/api/simulations/[id]/analytics/route';
import type { RunAnalytics } from '@/lib/analytics/run-report';
import type { UserAnalyticsPayload } from '@/lib/analytics/user-stats';
import { prisma } from '@/lib/db';
import {
  resetDatabase,
  seedCompletedSimulation,
  seedSimulation,
  signIn,
  signOut,
  type SignedInUser,
} from '../helpers/db';
import { getRequest, readJson } from '../helpers/http';
import type { ApiResponse } from '@/types';

let user: SignedInUser;

beforeEach(async () => {
  await resetDatabase();
  user = await signIn('analyst@example.com', 'Analyst');
});

async function mine(): Promise<UserAnalyticsPayload> {
  const response = await myAnalytics();
  expect(response.status).toBe(200);
  const body = await readJson<ApiResponse<UserAnalyticsPayload>>(response);
  if (!body.success) throw new Error(body.error);
  return body.data;
}

async function forRun(id: string) {
  const response = await runAnalytics(getRequest(`/api/simulations/${id}/analytics`), {
    params: { id },
  });
  return {
    status: response.status,
    body: await readJson<ApiResponse<RunAnalytics>>(response),
  };
}

async function runData(id: string): Promise<RunAnalytics> {
  const { status, body } = await forRun(id);
  expect(status).toBe(200);
  if (!body.success) throw new Error(body.error);
  return body.data;
}

describe('GET /api/analytics/me', () => {
  it('answers 401 for an anonymous visitor', async () => {
    signOut();
    const response = await myAnalytics();

    expect(response.status).toBe(401);
    expect(await readJson(response)).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('reports an empty history for a new account', async () => {
    const data = await mine();

    expect(data.stats.totalRuns).toBe(0);
    expect(data.stats.winRate).toBeNull();
    expect(data.favouriteDecisions).toEqual([]);
    expect(data.scoreHistory).toEqual([]);
  });

  it('counts the caller runs and nobody else', async () => {
    // A second account, created without touching the session the caller holds.
    const other = await prisma.user.create({
      data: { email: 'other@example.com', passwordHash: 'x' },
    });
    await seedCompletedSimulation(other.id);
    await seedCompletedSimulation(user.id);

    const data = await mine();
    expect(data.stats.totalRuns).toBe(1);
    expect(await prisma.simulation.count()).toBe(2);
  });

  it('counts only the caller decided turns in the decision totals', async () => {
    const other = await prisma.user.create({
      data: { email: 'noisy@example.com', passwordHash: 'x' },
    });
    await seedCompletedSimulation(other.id, {
      turnsCompleted: 5,
      decisionTags: [['layoffs'], ['layoffs'], ['layoffs'], ['layoffs'], ['layoffs']],
    });
    await seedCompletedSimulation(user.id, { turnsCompleted: 1, decisionTags: [['cut_costs']] });

    expect((await mine()).favouriteDecisions).toEqual([{ tag: 'cut_costs', count: 1 }]);
  });

  it('separates active from completed runs', async () => {
    await seedSimulation(user.id, { currentTurn: 3 });
    await seedCompletedSimulation(user.id);

    const stats = (await mine()).stats;
    expect(stats.activeRuns).toBe(1);
    expect(stats.completedRuns).toBe(1);
  });

  it('reports the win rate and best score', async () => {
    await seedCompletedSimulation(user.id, { endingType: 'growth_win', performanceScore: 88 });
    await seedCompletedSimulation(user.id, { endingType: 'bankruptcy', performanceScore: 22 });

    const stats = (await mine()).stats;
    expect(stats.winRate).toBe(0.5);
    expect(stats.bestScore).toBe(88);
    expect(stats.bestEnding).toBe('growth_win');
  });

  it('breaks the history down by industry and difficulty', async () => {
    await seedCompletedSimulation(user.id, { industry: 'SaaS', difficulty: 'Hard' });
    await seedCompletedSimulation(user.id, { industry: 'SaaS', difficulty: 'Easy' });
    await seedCompletedSimulation(user.id, { industry: 'Retail', difficulty: 'Easy' });

    const stats = (await mine()).stats;
    expect(stats.byIndustry.map((g) => [g.key, g.runs])).toEqual([
      ['SaaS', 2],
      ['Retail', 1],
    ]);
    expect(stats.byDifficulty.map((g) => [g.key, g.runs])).toEqual([
      ['Easy', 2],
      ['Hard', 1],
    ]);
  });

  it('counts the decisions the player reaches for most often', async () => {
    await seedCompletedSimulation(user.id, {
      turnsCompleted: 3,
      decisionTags: [['cut_costs'], ['cut_costs', 'layoffs'], ['take_loan']],
    });

    const favourites = (await mine()).favouriteDecisions;
    expect(favourites[0]).toEqual({ tag: 'cut_costs', count: 2 });
    expect(favourites.map((f) => f.tag).sort()).toEqual(['cut_costs', 'layoffs', 'take_loan']);
  });

  it('leaves the undecided turn out of the decision counts', async () => {
    // seedSimulation leaves the current turn undecided with an empty tag list.
    await seedSimulation(user.id, { currentTurn: 1 });
    expect((await mine()).favouriteDecisions).toEqual([]);
  });

  it('lists the score of each completed run, oldest first', async () => {
    await seedCompletedSimulation(user.id, {
      performanceScore: 40,
      endedAt: new Date('2025-02-01T00:00:00.000Z'),
    });
    await seedCompletedSimulation(user.id, {
      performanceScore: 70,
      endedAt: new Date('2025-01-01T00:00:00.000Z'),
    });

    expect((await mine()).scoreHistory.map((p) => p.score)).toEqual([70, 40]);
  });

  it('leaves an unfinished run out of the score history', async () => {
    await seedSimulation(user.id, { currentTurn: 5 });
    expect((await mine()).scoreHistory).toEqual([]);
  });

  /**
   * `endedAt` is nullable and nothing in the schema ties it to the status, so
   * an ended run can carry no finish time. The chart and the streak have to
   * read such a run the same way round; they once did not.
   */
  it('puts an ended run with no recorded finish at the end of the line', async () => {
    await seedCompletedSimulation(user.id, {
      performanceScore: 40,
      endedAt: new Date('2025-02-01T00:00:00.000Z'),
    });
    const undated = await seedCompletedSimulation(user.id, { performanceScore: 70 });
    await prisma.simulation.update({ where: { id: undated.id }, data: { endedAt: null } });

    const history = (await mine()).scoreHistory;

    expect(history.map((p) => p.score)).toEqual([40, 70]);
    expect(history[history.length - 1].endedAt).toBeNull();
  });

  it('survives a turn whose tag column is not valid JSON', async () => {
    const sim = await seedCompletedSimulation(user.id, { turnsCompleted: 2 });
    await prisma.turn.updateMany({
      where: { simulationId: sim.id, turnNumber: 1 },
      data: { tags: 'not json' },
    });

    const favourites = (await mine()).favouriteDecisions;
    expect(favourites).toEqual([{ tag: 'negotiate_supplier', count: 1 }]);
  });
});

describe('GET /api/simulations/[id]/analytics — access', () => {
  it('answers 401 for an anonymous visitor', async () => {
    const sim = await seedCompletedSimulation(user.id);
    signOut();

    expect((await forRun(sim.id)).status).toBe(401);
  });

  it('answers 404 for a simulation that does not exist', async () => {
    const { status, body } = await forRun('no-such-id');

    expect(status).toBe(404);
    expect(body).toEqual({ success: false, error: 'Simulation not found' });
  });

  it('answers 403 for somebody else run', async () => {
    const owner = await signIn('owner@example.com');
    const sim = await seedCompletedSimulation(owner.id);
    await signIn('intruder@example.com');

    const { status, body } = await forRun(sim.id);
    expect(status).toBe(403);
    expect(body).toEqual({ success: false, error: 'Forbidden' });
  });

  it('answers 200 for the owner', async () => {
    const sim = await seedCompletedSimulation(user.id);
    expect((await forRun(sim.id)).status).toBe(200);
  });
});

describe('GET /api/simulations/[id]/analytics — content', () => {
  it('returns a trajectory for every visible metric', async () => {
    const sim = await seedCompletedSimulation(user.id, { turnsCompleted: 4 });
    const data = await runData(sim.id);

    expect(Object.keys(data.trajectories).sort()).toEqual(
      [
        'cash',
        'monthlyRevenue',
        'burnRate',
        'reputation',
        'morale',
        'churn',
        'legalRisk',
        'marketShare',
      ].sort()
    );
  });

  it('charts one point per decided turn', async () => {
    const sim = await seedCompletedSimulation(user.id, {
      turnsCompleted: 3,
      trajectory: [{ cash: 100 }, { cash: 200 }, { cash: 300 }],
    });

    const data = await runData(sim.id);
    expect(data.turnNumbers).toEqual([1, 2, 3]);
    expect(data.trajectories.cash.values).toEqual([100, 200, 300]);
  });

  it('leaves the undecided turn of a run in progress out of the trajectory', async () => {
    // seedSimulation writes turns 1..currentTurn, with only the last undecided.
    const sim = await seedSimulation(user.id, { currentTurn: 4 });
    const data = await runData(sim.id);

    expect(data.turnsCompleted).toBe(3);
    expect(data.turnNumbers).toEqual([1, 2, 3]);
  });

  it('still lists every turn in the decision log, decided or not', async () => {
    const sim = await seedSimulation(user.id, { currentTurn: 4 });
    const data = await runData(sim.id);

    expect(data.decisions).toHaveLength(4);
    expect(data.decisions.map((d) => d.decided)).toEqual([true, true, true, false]);
  });

  it('records what was chosen each turn', async () => {
    const sim = await seedCompletedSimulation(user.id, {
      turnsCompleted: 2,
      decisionTags: [['cut_costs'], ['take_loan']],
    });

    const data = await runData(sim.id);
    expect(data.decisions[0].decision).toBe('Option A');
    expect(data.decisions[0].wasFreeText).toBe(false);
    expect(data.decisions[0].tags).toEqual(['cut_costs']);
  });

  it('shows a typed decision in the player own words', async () => {
    const sim = await seedCompletedSimulation(user.id, { turnsCompleted: 1 });
    await prisma.turn.updateMany({
      where: { simulationId: sim.id },
      data: { optionId: '', freeText: 'Renegotiate every supplier contract at once' },
    });

    const data = await runData(sim.id);
    expect(data.decisions[0].decision).toBe('Renegotiate every supplier contract at once');
    expect(data.decisions[0].wasFreeText).toBe(true);
  });

  it('counts the decision tags used across the run', async () => {
    const sim = await seedCompletedSimulation(user.id, {
      turnsCompleted: 3,
      decisionTags: [['cut_costs'], ['cut_costs'], ['layoffs']],
    });

    expect((await runData(sim.id)).tagCounts).toEqual([
      { tag: 'cut_costs', count: 2 },
      { tag: 'layoffs', count: 1 },
    ]);
  });

  it('names the turning point of the run', async () => {
    const sim = await seedCompletedSimulation(user.id, {
      turnsCompleted: 4,
      trajectory: [
        { reputation: 60 },
        { reputation: 59 },
        { reputation: 15 },
        { reputation: 14 },
      ],
    });

    expect((await runData(sim.id)).pivotalTurn?.turnNumber).toBe(3);
  });

  it('sorts the metrics by whether they ended better or worse', async () => {
    const sim = await seedCompletedSimulation(user.id, {
      turnsCompleted: 2,
      trajectory: [{ reputation: 30 }, { reputation: 80 }],
    });

    const data = await runData(sim.id);
    expect(data.direction.improved).toContain('reputation');
    expect(data.direction.worsened).not.toContain('reputation');
  });

  it('carries the run header so the page needs one request', async () => {
    const sim = await seedCompletedSimulation(user.id, {
      companyName: 'Nile Home Goods',
      industry: 'Retail',
      difficulty: 'Hard',
      endingType: 'growth_win',
      performanceScore: 84,
    });

    const data = await runData(sim.id);
    expect(data.companyName).toBe('Nile Home Goods');
    expect(data.difficulty).toBe('Hard');
    expect(data.endingType).toBe('growth_win');
    expect(data.performanceScore).toBe(84);
    expect(data.maxTurns).toBe(10);
  });

  it('survives a turn whose delta column is not valid JSON', async () => {
    const sim = await seedCompletedSimulation(user.id, { turnsCompleted: 1 });
    await prisma.turn.updateMany({
      where: { simulationId: sim.id },
      data: { metricDeltas: '{oh no' },
    });

    expect((await runData(sim.id)).decisions[0].deltas).toEqual({});
  });
});
