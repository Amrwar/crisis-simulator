import { beforeEach, describe, expect, it } from 'vitest';

import { GET as search } from '@/app/api/simulations/search/route';
import { prisma } from '@/lib/db';
import type { SimulationSearchPayload } from '@/lib/simulations/results';
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
  user = await signIn('searcher@example.com', 'Searcher');
});

function request(query = '') {
  return search(getRequest(`/api/simulations/search${query}`));
}

async function results(query = ''): Promise<SimulationSearchPayload> {
  const response = await request(query);
  expect(response.status).toBe(200);
  const body = await readJson<ApiResponse<SimulationSearchPayload>>(response);
  if (!body.success) throw new Error(body.error);
  return body.data;
}

const names = (payload: SimulationSearchPayload) => payload.page.items.map((r) => r.companyName);

describe('GET /api/simulations/search — access and shape', () => {
  it('answers 401 for an anonymous visitor', async () => {
    signOut();
    const response = await request();

    expect(response.status).toBe(401);
    expect(await readJson(response)).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns an empty page for an account with no runs', async () => {
    const payload = await results();

    expect(payload.page.items).toEqual([]);
    expect(payload.page.total).toBe(0);
    expect(payload.availableTags).toEqual([]);
  });

  it('returns only the caller runs', async () => {
    const other = await prisma.user.create({
      data: { email: 'other@example.com', passwordHash: 'x' },
    });
    await seedCompletedSimulation(other.id, { companyName: 'Theirs' });
    await seedCompletedSimulation(user.id, { companyName: 'Mine' });

    expect(names(await results())).toEqual(['Mine']);
  });

  it('never exposes the seed, the flags or the narrative in a list row', async () => {
    await seedCompletedSimulation(user.id, { seed: 424_242 });
    const serialized = JSON.stringify(await results());

    expect(serialized).not.toContain('424242');
    expect(serialized).not.toContain('Cairo warehouse');
    expect(serialized).not.toContain('negotiation_count_num');
  });

  it('exposes exactly the list columns', async () => {
    await seedCompletedSimulation(user.id);
    const [row] = (await results()).page.items;

    expect(Object.keys(row).sort()).toEqual(
      [
        'id',
        'industry',
        'difficulty',
        'companySize',
        'companyName',
        'status',
        'endingType',
        'performanceScore',
        'currentTurn',
        'maxTurns',
        'cash',
        'reputation',
        'marketShare',
        'hasNotes',
        'tags',
        'createdAt',
        'endedAt',
      ].sort()
    );
  });

  it('answers 400 for a facet outside its vocabulary', async () => {
    expect((await request('?industry=Aerospace')).status).toBe(400);
    expect((await request('?sort=seed')).status).toBe(400);
    expect((await request('?from=yesterday')).status).toBe(400);
  });
});

describe('GET /api/simulations/search — filtering', () => {
  beforeEach(async () => {
    await seedCompletedSimulation(user.id, {
      companyName: 'Nile Home Goods',
      industry: 'Retail',
      difficulty: 'Easy',
      endingType: 'survival',
      performanceScore: 55,
    });
    await seedCompletedSimulation(user.id, {
      companyName: 'Delta Cloud',
      industry: 'SaaS',
      difficulty: 'Hard',
      endingType: 'growth_win',
      performanceScore: 88,
    });
    await seedSimulation(user.id, { currentTurn: 3 });
  });

  it('lists everything when nothing is filtered', async () => {
    expect((await results()).page.total).toBe(3);
  });

  it('narrows by status', async () => {
    expect((await results('?status=active')).page.total).toBe(1);
    expect((await results('?status=ended')).page.total).toBe(2);
  });

  it('narrows by industry', async () => {
    expect(names(await results('?industry=SaaS'))).toEqual(['Delta Cloud']);
  });

  it('narrows by difficulty', async () => {
    expect(names(await results('?difficulty=Hard'))).toEqual(['Delta Cloud']);
  });

  it('narrows by ending', async () => {
    expect(names(await results('?ending=growth_win'))).toEqual(['Delta Cloud']);
  });

  it('combines facets', async () => {
    expect((await results('?industry=SaaS&difficulty=Easy')).page.total).toBe(0);
  });

  it('searches the company name', async () => {
    expect(names(await results('?q=Delta Cloud'))).toEqual(['Delta Cloud']);
  });

  it('matches every run whose company name contains the search', async () => {
    // The in-progress run seeded above is also called Nile Home Goods.
    expect((await results('?q=Nile')).page.total).toBe(2);
  });

  it('searches the competitor name', async () => {
    // Every seeded run names Delta Living as the competitor.
    expect((await results('?q=Delta Living')).page.total).toBe(3);
  });

  it('returns nothing for a search that matches nothing', async () => {
    expect((await results('?q=nonexistent-company')).page.total).toBe(0);
  });

  it('echoes the filters it applied', async () => {
    expect((await results('?industry=SaaS&status=ended')).filters).toEqual({
      industry: 'SaaS',
      status: 'ended',
    });
  });

  it('reports no filters when none were sent', async () => {
    expect((await results()).filters).toEqual({});
  });
});

describe('GET /api/simulations/search — dates and labels', () => {
  it('narrows to a date window, inclusive of both days', async () => {
    const early = await seedCompletedSimulation(user.id, { companyName: 'Early' });
    const late = await seedCompletedSimulation(user.id, { companyName: 'Late' });

    await prisma.simulation.update({
      where: { id: early.id },
      data: { createdAt: new Date('2025-01-05T08:00:00.000Z') },
    });
    await prisma.simulation.update({
      where: { id: late.id },
      data: { createdAt: new Date('2025-06-20T20:00:00.000Z') },
    });

    expect(names(await results('?from=2025-01-01&to=2025-01-31'))).toEqual(['Early']);
    expect(names(await results('?from=2025-06-01'))).toEqual(['Late']);
    expect((await results('?from=2025-01-05&to=2025-06-20')).page.total).toBe(2);
  });

  it('narrows to runs carrying a label', async () => {
    const labelled = await seedCompletedSimulation(user.id, { companyName: 'Labelled' });
    await seedCompletedSimulation(user.id, { companyName: 'Plain' });
    await prisma.runTag.create({ data: { simulationId: labelled.id, label: 'practice' } });

    expect(names(await results('?tag=practice'))).toEqual(['Labelled']);
  });

  it('matches a label typed in any form, since labels are stored normalised', async () => {
    const labelled = await seedCompletedSimulation(user.id, { companyName: 'Labelled' });
    await prisma.runTag.create({ data: { simulationId: labelled.id, label: 'for-class' } });

    expect(names(await results('?tag=For Class'))).toEqual(['Labelled']);
  });

  it('offers every label the caller uses, once each', async () => {
    const first = await seedCompletedSimulation(user.id);
    const second = await seedCompletedSimulation(user.id);
    await prisma.runTag.createMany({
      data: [
        { simulationId: first.id, label: 'practice' },
        { simulationId: second.id, label: 'practice' },
        { simulationId: second.id, label: 'for-class' },
      ],
    });

    expect((await results()).availableTags).toEqual(['for-class', 'practice']);
  });

  it('does not offer another player labels', async () => {
    const other = await prisma.user.create({
      data: { email: 'other@example.com', passwordHash: 'x' },
    });
    const theirs = await seedCompletedSimulation(other.id);
    await prisma.runTag.create({ data: { simulationId: theirs.id, label: 'secret' } });

    expect((await results()).availableTags).toEqual([]);
  });

  it('carries a run labels on its row', async () => {
    const sim = await seedCompletedSimulation(user.id);
    await prisma.runTag.create({ data: { simulationId: sim.id, label: 'practice' } });

    expect((await results()).page.items[0].tags).toEqual(['practice']);
  });

  it('marks a run that carries a note', async () => {
    await seedCompletedSimulation(user.id, { companyName: 'Annotated', notes: 'Cut earlier' });
    await seedCompletedSimulation(user.id, { companyName: 'Bare' });

    const rows = (await results()).page.items;
    expect(rows.find((r) => r.companyName === 'Annotated')?.hasNotes).toBe(true);
    expect(rows.find((r) => r.companyName === 'Bare')?.hasNotes).toBe(false);
  });

  it('does not count a whitespace-only note as a note', async () => {
    await seedCompletedSimulation(user.id, { notes: '   ' });
    expect((await results()).page.items[0].hasNotes).toBe(false);
  });
});

describe('GET /api/simulations/search — sorting and paging', () => {
  beforeEach(async () => {
    const scores = [30, 90, 60];
    for (let index = 0; index < scores.length; index++) {
      await seedCompletedSimulation(user.id, {
        companyName: `Run ${index}`,
        performanceScore: scores[index],
        turnsCompleted: index + 1,
      });
      // createdAt ties at second resolution in SQLite; nudge them apart.
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  });

  it('sorts newest first by default', async () => {
    expect(names(await results())).toEqual(['Run 2', 'Run 1', 'Run 0']);
  });

  it('sorts oldest first on request', async () => {
    expect(names(await results('?sort=createdAt&direction=asc'))).toEqual([
      'Run 0',
      'Run 1',
      'Run 2',
    ]);
  });

  it('sorts by score', async () => {
    expect(names(await results('?sort=performanceScore&direction=desc'))).toEqual([
      'Run 1',
      'Run 2',
      'Run 0',
    ]);
  });

  it('sorts by how far the run got', async () => {
    expect(names(await results('?sort=currentTurn&direction=desc'))).toEqual([
      'Run 2',
      'Run 1',
      'Run 0',
    ]);
  });

  it('sorts by company name', async () => {
    expect(names(await results('?sort=companyName&direction=asc'))).toEqual([
      'Run 0',
      'Run 1',
      'Run 2',
    ]);
  });

  it('echoes the sort it applied', async () => {
    expect((await results('?sort=performanceScore&direction=asc')).sort).toEqual({
      field: 'performanceScore',
      direction: 'asc',
    });
  });

  it('windows the results', async () => {
    const payload = await results('?pageSize=2&page=1');

    expect(payload.page.items).toHaveLength(2);
    expect(payload.page.total).toBe(3);
    expect(payload.page.pageCount).toBe(2);
    expect(payload.page.hasNext).toBe(true);
  });

  it('returns the remainder on the last page', async () => {
    const payload = await results('?pageSize=2&page=2');

    expect(payload.page.items).toHaveLength(1);
    expect(payload.page.hasNext).toBe(false);
    expect(payload.page.hasPrevious).toBe(true);
  });

  it('counts every match, not just the page', async () => {
    expect((await results('?pageSize=1')).page.total).toBe(3);
  });

  it('shows no row twice across the pages', async () => {
    const first = await results('?pageSize=2&page=1');
    const second = await results('?pageSize=2&page=2');
    const ids = [...first.page.items, ...second.page.items].map((r) => r.id);

    expect(new Set(ids).size).toBe(3);
  });

  it('counts only the filtered rows', async () => {
    expect((await results('?q=Run 1')).page.total).toBe(1);
  });

  // A stale bookmark or a filter that just narrowed the list both ask for a
  // page that no longer exists. The envelope already reported the last page in
  // that case; the rows have to come from that page too, or the dashboard
  // renders an empty table under a "page 2 of 2" pager.
  it('serves the last page when asked for one past the end', async () => {
    const payload = await results('?pageSize=2&page=99');

    expect(payload.page.page).toBe(2);
    expect(payload.page.items).toHaveLength(1);
    expect(payload.page.hasNext).toBe(false);
    expect(payload.page.hasPrevious).toBe(true);
  });

  it('serves the same rows for a page past the end as for the last page', async () => {
    const last = await results('?pageSize=2&page=2');
    const beyond = await results('?pageSize=2&page=99');

    expect(names(beyond)).toEqual(names(last));
  });

  it('still answers the first page when a filter matches nothing', async () => {
    const payload = await results('?q=nonexistent-company&page=99');

    expect(payload.page.page).toBe(1);
    expect(payload.page.items).toEqual([]);
    expect(payload.page.total).toBe(0);
  });
});
