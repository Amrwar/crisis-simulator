import { beforeEach, describe, expect, it } from 'vitest';

import { GET as leaderboard } from '@/app/api/leaderboard/route';
import type { LeaderboardPayload } from '@/lib/leaderboard';
import { resetDatabase, seedCompletedSimulation, seedSimulation, signIn, signOut } from '../helpers/db';
import { getRequest, readJson } from '../helpers/http';
import type { ApiResponse } from '@/types';

async function board(query = ''): Promise<{ status: number; body: ApiResponse<LeaderboardPayload> }> {
  const response = await leaderboard(getRequest(`/api/leaderboard${query}`));
  return { status: response.status, body: await readJson<ApiResponse<LeaderboardPayload>>(response) };
}

/** Unwraps a successful envelope, failing the test if the route refused. */
async function payload(query = ''): Promise<LeaderboardPayload> {
  const { status, body } = await board(query);
  expect(status).toBe(200);
  if (!body.success) throw new Error(`expected success, got ${body.error}`);
  return body.data;
}

let me: { id: string; email: string };
let rival: { id: string; email: string };

beforeEach(async () => {
  await resetDatabase();
  rival = await signIn('rival@example.com', 'Rival Runner');
  me = await signIn('me@example.com', 'Me');
});

describe('GET /api/leaderboard — access', () => {
  it('answers 401 for an anonymous visitor', async () => {
    signOut();
    const { status, body } = await board();

    expect(status).toBe(401);
    expect(body).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('answers the envelope on success', async () => {
    const { status, body } = await board();

    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});

describe('GET /api/leaderboard — ranking', () => {
  it('returns an empty board before anybody has finished a run', async () => {
    const data = await payload();

    expect(data.page.items).toEqual([]);
    expect(data.totalRuns).toBe(0);
    expect(data.yourBest).toBeNull();
  });

  it('ignores runs that are still in progress', async () => {
    await seedSimulation(me.id, { currentTurn: 4 });
    const data = await payload();

    expect(data.totalRuns).toBe(0);
  });

  it('orders every completed run by score, best first', async () => {
    await seedCompletedSimulation(me.id, { performanceScore: 44, companyName: 'Low' });
    await seedCompletedSimulation(rival.id, { performanceScore: 91, companyName: 'High' });
    await seedCompletedSimulation(rival.id, { performanceScore: 67, companyName: 'Mid' });

    const data = await payload();

    expect(data.page.items.map((e) => e.companyName)).toEqual(['High', 'Mid', 'Low']);
    expect(data.page.items.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it('shows other players runs, not only the caller own', async () => {
    await seedCompletedSimulation(rival.id, { performanceScore: 80 });
    const data = await payload();

    expect(data.totalRuns).toBe(1);
    expect(data.page.items[0].isCurrentUser).toBe(false);
  });

  it('flags the caller own rows', async () => {
    await seedCompletedSimulation(me.id, { performanceScore: 80, companyName: 'Mine' });
    await seedCompletedSimulation(rival.id, { performanceScore: 90, companyName: 'Theirs' });

    const data = await payload();
    const mine = data.page.items.find((e) => e.companyName === 'Mine');
    const theirs = data.page.items.find((e) => e.companyName === 'Theirs');

    expect(mine?.isCurrentUser).toBe(true);
    expect(theirs?.isCurrentUser).toBe(false);
  });

  it('breaks a score tie on the better ending', async () => {
    await seedCompletedSimulation(me.id, {
      performanceScore: 70,
      endingType: 'survival',
      companyName: 'Survived',
      endedAt: new Date('2025-03-01T00:00:00.000Z'),
    });
    await seedCompletedSimulation(rival.id, {
      performanceScore: 70,
      endingType: 'growth_win',
      companyName: 'Grew',
      endedAt: new Date('2025-03-01T00:00:00.000Z'),
    });

    const data = await payload();
    expect(data.page.items.map((e) => e.companyName)).toEqual(['Grew', 'Survived']);
  });

  it('bands each score', async () => {
    await seedCompletedSimulation(me.id, { performanceScore: 92 });
    await seedCompletedSimulation(rival.id, { performanceScore: 12 });

    const data = await payload();
    expect(data.page.items.map((e) => e.scoreBand)).toEqual(['exceptional', 'critical']);
    expect(data.page.items[0].scoreLabel).toBe('Exceptional');
  });
});

describe('GET /api/leaderboard — what it discloses', () => {
  it('names a player by their display name', async () => {
    await seedCompletedSimulation(rival.id, { performanceScore: 80 });
    const data = await payload();

    expect(data.page.items[0].playerName).toBe('Rival Runner');
  });

  it('gives a player with no display name a stable anonymous label', async () => {
    const nameless = await signIn('nameless@example.com');
    await seedCompletedSimulation(nameless.id, { performanceScore: 80 });
    await signIn('back@example.com', 'Back');

    const data = await payload();
    expect(data.page.items[0].playerName).toBe(`Player ${nameless.id.slice(-4).toUpperCase()}`);
  });

  it('never leaks an email, a seed, a decision or a narrative', async () => {
    await seedCompletedSimulation(rival.id, { performanceScore: 80, seed: 424_242 });
    const data = await payload();
    const serialized = JSON.stringify(data);

    expect(serialized).not.toContain('rival@example.com');
    expect(serialized).not.toContain('424242');
    expect(serialized).not.toContain('Cairo warehouse');
    expect(serialized).not.toContain('negotiate_supplier');
  });

  it('exposes exactly the board columns and nothing else', async () => {
    await seedCompletedSimulation(rival.id, { performanceScore: 80 });
    const data = await payload();

    expect(Object.keys(data.page.items[0]).sort()).toEqual(
      [
        'rank',
        'tied',
        'simulationId',
        'companyName',
        'industry',
        'difficulty',
        'companySize',
        'endingType',
        'performanceScore',
        'scoreBand',
        'scoreLabel',
        'turnsCompleted',
        'maxTurns',
        'playerName',
        'isCurrentUser',
        'endedAt',
      ].sort()
    );
  });

  it('falls back to the industry when the generator never named the company', async () => {
    await seedCompletedSimulation(rival.id, { companyName: '', industry: 'Healthcare' });
    const data = await payload();

    expect(data.page.items[0].companyName).toBe('Healthcare');
  });
});

describe('GET /api/leaderboard — filtering', () => {
  beforeEach(async () => {
    await seedCompletedSimulation(me.id, {
      industry: 'Retail',
      difficulty: 'Easy',
      endingType: 'survival',
      performanceScore: 50,
    });
    await seedCompletedSimulation(rival.id, {
      industry: 'SaaS',
      difficulty: 'Hard',
      endingType: 'growth_win',
      performanceScore: 90,
    });
    await seedCompletedSimulation(rival.id, {
      industry: 'SaaS',
      difficulty: 'Easy',
      endingType: 'bankruptcy',
      performanceScore: 20,
    });
  });

  it('narrows to one industry', async () => {
    const data = await payload('?industry=SaaS');

    expect(data.totalRuns).toBe(2);
    expect(data.page.items.every((e) => e.industry === 'SaaS')).toBe(true);
  });

  it('narrows to one difficulty', async () => {
    const data = await payload('?difficulty=Hard');

    expect(data.totalRuns).toBe(1);
    expect(data.page.items[0].difficulty).toBe('Hard');
  });

  it('narrows to one ending', async () => {
    const data = await payload('?ending=bankruptcy');

    expect(data.totalRuns).toBe(1);
    expect(data.page.items[0].endingType).toBe('bankruptcy');
  });

  it('combines filters', async () => {
    const data = await payload('?industry=SaaS&difficulty=Easy');

    expect(data.totalRuns).toBe(1);
    expect(data.page.items[0].endingType).toBe('bankruptcy');
  });

  it('renumbers the ranks within the filtered board', async () => {
    const data = await payload('?industry=SaaS');
    expect(data.page.items.map((e) => e.rank)).toEqual([1, 2]);
  });

  it('echoes the filters it applied', async () => {
    const data = await payload('?industry=SaaS&ending=growth_win');
    expect(data.filters).toEqual({ industry: 'SaaS', ending: 'growth_win' });
  });

  it('reports no filters when none were sent', async () => {
    expect((await payload()).filters).toEqual({});
  });

  it('answers 400 for an industry outside the supported list', async () => {
    const { status, body } = await board('?industry=Aerospace');

    expect(status).toBe(400);
    expect(body).toMatchObject({ success: false, error: 'Invalid input' });
  });

  it('answers 400 for an unsupported difficulty or ending', async () => {
    expect((await board('?difficulty=Nightmare')).status).toBe(400);
    expect((await board('?ending=alien_invasion')).status).toBe(400);
  });
});

describe('GET /api/leaderboard — the caller standing', () => {
  it('reports the rank and percentile of the caller best run', async () => {
    for (let i = 0; i < 4; i++) {
      await seedCompletedSimulation(rival.id, { performanceScore: 90 - i });
    }
    await seedCompletedSimulation(me.id, { performanceScore: 40 });

    const data = await payload();
    expect(data.yourBest?.rank).toBe(5);
    expect(data.yourBest?.percentile).toBe(0);
  });

  it('reports the best of several runs, not the most recent', async () => {
    await seedCompletedSimulation(me.id, { performanceScore: 30, companyName: 'Weak' });
    await seedCompletedSimulation(me.id, { performanceScore: 88, companyName: 'Strong' });

    const data = await payload();
    expect(data.yourBest?.performanceScore).toBe(88);
  });

  it('reports nothing when the caller has no run on the filtered board', async () => {
    await seedCompletedSimulation(me.id, { industry: 'Retail' });
    expect((await payload('?industry=SaaS')).yourBest).toBeNull();
  });

  it('points at the run so the UI can link to it', async () => {
    const sim = await seedCompletedSimulation(me.id, { performanceScore: 70 });
    expect((await payload()).yourBest?.simulationId).toBe(sim.id);
  });
});

describe('GET /api/leaderboard — paging', () => {
  beforeEach(async () => {
    for (let i = 0; i < 7; i++) {
      await seedCompletedSimulation(rival.id, { performanceScore: 90 - i, companyName: `Run ${i}` });
    }
  });

  it('windows the board', async () => {
    const data = await payload('?page=1&pageSize=3');

    expect(data.page.items).toHaveLength(3);
    expect(data.page.total).toBe(7);
    expect(data.page.pageCount).toBe(3);
    expect(data.page.hasNext).toBe(true);
  });

  it('keeps ranks absolute across pages', async () => {
    const data = await payload('?page=2&pageSize=3');
    expect(data.page.items.map((e) => e.rank)).toEqual([4, 5, 6]);
  });

  it('reports the whole board size regardless of the window', async () => {
    expect((await payload('?page=1&pageSize=2')).totalRuns).toBe(7);
  });

  it('ranks the caller standing against the whole board, not the page', async () => {
    await seedCompletedSimulation(me.id, { performanceScore: 10 });
    const data = await payload('?page=1&pageSize=2');

    expect(data.yourBest?.rank).toBe(8);
  });

  it('falls back to the last page when asked past the end', async () => {
    expect((await payload('?page=99&pageSize=3')).page.page).toBe(3);
  });
});
