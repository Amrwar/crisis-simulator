import { beforeEach, describe, expect, it } from 'vitest';

import { GET as compare } from '@/app/api/simulations/compare/route';
import type { RunComparison } from '@/lib/analytics/compare';
import { prisma } from '@/lib/db';
import {
  resetDatabase,
  seedCompletedSimulation,
  signIn,
  signOut,
  type SignedInUser,
} from '../helpers/db';
import { getRequest, readJson } from '../helpers/http';
import type { ApiResponse } from '@/types';

let user: SignedInUser;

beforeEach(async () => {
  await resetDatabase();
  user = await signIn('comparer@example.com', 'Comparer');
});

function request(a: string, b: string) {
  return compare(
    getRequest(`/api/simulations/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`)
  );
}

async function comparison(a: string, b: string): Promise<RunComparison> {
  const response = await request(a, b);
  expect(response.status).toBe(200);
  const body = await readJson<ApiResponse<RunComparison>>(response);
  if (!body.success) throw new Error(body.error);
  return body.data;
}

describe('GET /api/simulations/compare — access', () => {
  it('answers 401 for an anonymous visitor', async () => {
    const first = await seedCompletedSimulation(user.id);
    const second = await seedCompletedSimulation(user.id);
    signOut();

    const response = await request(first.id, second.id);
    expect(response.status).toBe(401);
  });

  it('answers 404 when either run does not exist', async () => {
    const mine = await seedCompletedSimulation(user.id);

    expect((await request(mine.id, 'no-such-id')).status).toBe(404);
    expect((await request('no-such-id', mine.id)).status).toBe(404);
  });

  it('answers 403 when either run belongs to somebody else', async () => {
    const other = await prisma.user.create({
      data: { email: 'other@example.com', passwordHash: 'x' },
    });
    const theirs = await seedCompletedSimulation(other.id);
    const mine = await seedCompletedSimulation(user.id);

    expect((await request(mine.id, theirs.id)).status).toBe(403);
    expect((await request(theirs.id, mine.id)).status).toBe(403);
  });

  it('does not leak somebody else run by pairing it with your own', async () => {
    const other = await prisma.user.create({
      data: { email: 'other@example.com', passwordHash: 'x' },
    });
    const theirs = await seedCompletedSimulation(other.id, { companyName: 'Their Secret Co' });
    const mine = await seedCompletedSimulation(user.id);

    const response = await request(mine.id, theirs.id);
    expect(await response.text()).not.toContain('Their Secret Co');
  });

  it('answers 400 when a run id is missing', async () => {
    const mine = await seedCompletedSimulation(user.id);
    const response = await compare(getRequest(`/api/simulations/compare?a=${mine.id}`));

    expect(response.status).toBe(400);
  });

  it('answers 400 when both ids are the same run', async () => {
    const mine = await seedCompletedSimulation(user.id);
    const response = await request(mine.id, mine.id);

    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      success: false,
      error: 'Pick two different runs to compare',
    });
  });
});

describe('GET /api/simulations/compare — the comparison', () => {
  it('carries a header for each run', async () => {
    const first = await seedCompletedSimulation(user.id, {
      companyName: 'Alpha',
      performanceScore: 80,
      endingType: 'growth_win',
    });
    const second = await seedCompletedSimulation(user.id, {
      companyName: 'Beta',
      performanceScore: 40,
      endingType: 'bankruptcy',
    });

    const result = await comparison(first.id, second.id);
    expect(result.a).toMatchObject({ companyName: 'Alpha', performanceScore: 80 });
    expect(result.b).toMatchObject({ companyName: 'Beta', endingType: 'bankruptcy' });
  });

  it('compares every visible metric', async () => {
    const first = await seedCompletedSimulation(user.id);
    const second = await seedCompletedSimulation(user.id);

    expect((await comparison(first.id, second.id)).metrics).toHaveLength(8);
  });

  it('names the run that finished ahead where higher is better', async () => {
    const first = await seedCompletedSimulation(user.id, {
      turnsCompleted: 2,
      trajectory: [{ reputation: 50 }, { reputation: 80 }],
    });
    const second = await seedCompletedSimulation(user.id, {
      turnsCompleted: 2,
      trajectory: [{ reputation: 50 }, { reputation: 30 }],
    });

    const result = await comparison(first.id, second.id);
    expect(result.metrics.find((m) => m.metric === 'reputation')?.winner).toBe('a');
    expect(result.metricsWonByA).toContain('reputation');
  });

  it('names the run that finished ahead where lower is better', async () => {
    const first = await seedCompletedSimulation(user.id, { turnsCompleted: 1, churn: 45 });
    const second = await seedCompletedSimulation(user.id, { turnsCompleted: 1, churn: 12 });

    const result = await comparison(first.id, second.id);
    expect(result.metrics.find((m) => m.metric === 'churn')?.winner).toBe('b');
    expect(result.metricsWonByB).toContain('churn');
  });

  it('calls a metric a tie when both runs finished level', async () => {
    const first = await seedCompletedSimulation(user.id, { turnsCompleted: 1, reputation: 60 });
    const second = await seedCompletedSimulation(user.id, { turnsCompleted: 1, reputation: 60 });

    const result = await comparison(first.id, second.id);
    expect(result.metrics.find((m) => m.metric === 'reputation')?.winner).toBe('tie');
  });

  it('carries both trajectories so they can be charted together', async () => {
    const first = await seedCompletedSimulation(user.id, {
      turnsCompleted: 3,
      trajectory: [{ cash: 100 }, { cash: 200 }, { cash: 300 }],
    });
    const second = await seedCompletedSimulation(user.id, {
      turnsCompleted: 3,
      trajectory: [{ cash: 500 }, { cash: 400 }, { cash: 100 }],
    });

    const cash = (await comparison(first.id, second.id)).metrics.find((m) => m.metric === 'cash');
    expect(cash?.aValues).toEqual([100, 200, 300]);
    expect(cash?.bValues).toEqual([500, 400, 100]);
  });

  it('lines the decisions up by turn', async () => {
    const first = await seedCompletedSimulation(user.id, {
      turnsCompleted: 3,
      decisionTags: [['cut_costs'], ['layoffs'], ['take_loan']],
    });
    const second = await seedCompletedSimulation(user.id, {
      turnsCompleted: 3,
      decisionTags: [['cut_costs'], ['hire_staff'], ['take_loan']],
    });

    const result = await comparison(first.id, second.id);
    expect(result.decisions).toHaveLength(3);
    expect(result.decisions[1].aTags).toEqual(['layoffs']);
    expect(result.decisions[1].bTags).toEqual(['hire_staff']);
  });

  it('marks the turns where the two runs took a different line', async () => {
    const first = await seedCompletedSimulation(user.id, {
      turnsCompleted: 3,
      decisionTags: [['cut_costs'], ['layoffs'], ['take_loan']],
    });
    const second = await seedCompletedSimulation(user.id, {
      turnsCompleted: 3,
      decisionTags: [['cut_costs'], ['hire_staff'], ['take_loan']],
    });

    const result = await comparison(first.id, second.id);
    expect(result.decisions.map((d) => d.diverged)).toEqual([false, true, false]);
    expect(result.firstDivergentTurn).toBe(2);
  });

  it('reports no divergence when both runs took the same line throughout', async () => {
    const tags = [['cut_costs'], ['cut_costs']];
    const first = await seedCompletedSimulation(user.id, { turnsCompleted: 2, decisionTags: tags });
    const second = await seedCompletedSimulation(user.id, { turnsCompleted: 2, decisionTags: tags });

    expect((await comparison(first.id, second.id)).firstDivergentTurn).toBeNull();
  });

  it('records the tags the two runs shared on a turn', async () => {
    const first = await seedCompletedSimulation(user.id, {
      turnsCompleted: 1,
      decisionTags: [['cut_costs', 'layoffs']],
    });
    const second = await seedCompletedSimulation(user.id, {
      turnsCompleted: 1,
      decisionTags: [['cut_costs', 'take_loan']],
    });

    expect((await comparison(first.id, second.id)).decisions[0].sharedTags).toEqual(['cut_costs']);
  });

  it('compares runs of different lengths without truncating the longer one', async () => {
    const short = await seedCompletedSimulation(user.id, { turnsCompleted: 2 });
    const long = await seedCompletedSimulation(user.id, { turnsCompleted: 6 });

    const result = await comparison(short.id, long.id);
    expect(result.decisions).toHaveLength(6);
    expect(result.comparableTurns).toBe(2);
  });

  it('marks a turn only one run reached as absent, not as a divergence', async () => {
    const short = await seedCompletedSimulation(user.id, { turnsCompleted: 1 });
    const long = await seedCompletedSimulation(user.id, { turnsCompleted: 3 });

    const result = await comparison(short.id, long.id);
    const beyond = result.decisions.find((d) => d.turnNumber === 3);

    expect(beyond?.aDecision).toBeNull();
    expect(beyond?.diverged).toBe(false);
  });

  it('separates the decision types each run used from the ones they shared', async () => {
    const first = await seedCompletedSimulation(user.id, {
      turnsCompleted: 2,
      decisionTags: [['cut_costs'], ['layoffs']],
    });
    const second = await seedCompletedSimulation(user.id, {
      turnsCompleted: 2,
      decisionTags: [['cut_costs'], ['hire_staff']],
    });

    const result = await comparison(first.id, second.id);
    expect(result.sharedTags).toEqual(['cut_costs']);
    expect(result.onlyInA).toEqual(['layoffs']);
    expect(result.onlyInB).toEqual(['hire_staff']);
  });

  it('reverses the comparison when the two runs are swapped', async () => {
    const first = await seedCompletedSimulation(user.id, { turnsCompleted: 1, reputation: 80 });
    const second = await seedCompletedSimulation(user.id, { turnsCompleted: 1, reputation: 30 });

    const forward = await comparison(first.id, second.id);
    const backward = await comparison(second.id, first.id);

    expect(forward.metricsWonByA).toEqual(backward.metricsWonByB);
    expect(forward.metricsWonByB).toEqual(backward.metricsWonByA);
  });
});
