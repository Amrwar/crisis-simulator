import { beforeEach, describe, expect, it } from 'vitest';

import { GET as exportList } from '@/app/api/simulations/search/export/route';
import { prisma } from '@/lib/db';
import { LIST_CSV_HEADERS } from '@/lib/export/list-export';
import {
  resetDatabase,
  seedCompletedSimulation,
  seedSimulation,
  signIn,
  signOut,
  type SignedInUser,
} from '../helpers/db';
import { getRequest, readJson } from '../helpers/http';

let user: SignedInUser;

beforeEach(async () => {
  await resetDatabase();
  user = await signIn('cohort@example.com', 'Cohort');
});

function download(query = '') {
  return exportList(getRequest(`/api/simulations/search/export${query}`));
}

/** The CSV body, split into non-empty rows of raw text. */
async function csvRows(query: string): Promise<string[]> {
  const response = await download(query);
  expect(response.status).toBe(200);
  return (await response.text()).split('\r\n').filter((line) => line !== '');
}

/** The parsed JSON body of a download. */
async function jsonBody(query = ''): Promise<Record<string, unknown>> {
  const response = await download(query);
  expect(response.status).toBe(200);
  return readJson<Record<string, unknown>>(response);
}

const companies = (body: Record<string, unknown>) =>
  (body.runs as Array<{ company: string }>).map((run) => run.company);

describe('GET /api/simulations/search/export — access', () => {
  it('answers 401 for an anonymous visitor', async () => {
    await seedCompletedSimulation(user.id);
    signOut();
    const response = await download();

    expect(response.status).toBe(401);
    expect(await readJson(response)).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('never exports another account runs', async () => {
    const other = await prisma.user.create({
      data: { email: 'stranger@example.com', passwordHash: 'x' },
    });
    await seedCompletedSimulation(other.id, { companyName: 'Theirs' });
    await seedCompletedSimulation(user.id, { companyName: 'Mine' });

    expect(companies(await jsonBody())).toEqual(['Mine']);
  });
});

describe('GET /api/simulations/search/export — the file', () => {
  it('defaults to JSON and offers it as a download', async () => {
    await seedCompletedSimulation(user.id);
    const response = await download();

    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('content-disposition')).toContain('attachment;');
    expect(response.headers.get('content-disposition')).toContain('.json');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('serves CSV when asked, as a download', async () => {
    await seedCompletedSimulation(user.id);
    const response = await download('?format=csv');

    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toContain('.csv');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects a format it cannot write', async () => {
    const response = await download('?format=pdf');

    expect(response.status).toBe(400);
  });

  it('writes the CSV header row even when nothing matched', async () => {
    const rows = await csvRows('?format=csv');

    expect(rows).toEqual([LIST_CSV_HEADERS.join(',')]);
  });

  it('writes one CSV row per matching run', async () => {
    await seedCompletedSimulation(user.id, { companyName: 'Alpha' });
    await seedCompletedSimulation(user.id, { companyName: 'Beta' });

    expect(await csvRows('?format=csv')).toHaveLength(3);
  });

  it('escapes a company name containing a comma', async () => {
    await seedCompletedSimulation(user.id, { companyName: 'Nile Goods, Cairo' });
    const rows = await csvRows('?format=csv');

    expect(rows[1]).toContain('"Nile Goods, Cairo"');
  });

  it('carries the labels and the note marker into the row', async () => {
    const sim = await seedCompletedSimulation(user.id, { notes: 'Worth revisiting' });
    await prisma.runTag.create({ data: { simulationId: sim.id, label: 'risky' } });

    const runs = (await jsonBody()).runs as Array<Record<string, unknown>>;
    expect(runs[0].labels).toBe('risky');
    expect(runs[0].has_notes).toBe(true);
  });
});

describe('GET /api/simulations/search/export — the cohort', () => {
  it('exports exactly the runs the filters select', async () => {
    await seedCompletedSimulation(user.id, { companyName: 'Retailer', industry: 'Retail' });
    await seedCompletedSimulation(user.id, { companyName: 'Software', industry: 'SaaS' });

    expect(companies(await jsonBody('?industry=SaaS'))).toEqual(['Software']);
  });

  it('narrows by free text the same way the search does', async () => {
    await seedCompletedSimulation(user.id, { companyName: 'Cairo Textiles' });
    await seedCompletedSimulation(user.id, { companyName: 'Alexandria Foods' });

    expect(companies(await jsonBody('?q=Cairo'))).toEqual(['Cairo Textiles']);
  });

  it('narrows by status, so an in-progress run can be left out', async () => {
    await seedCompletedSimulation(user.id, { companyName: 'Finished' });
    await seedSimulation(user.id);

    expect(companies(await jsonBody('?status=ended'))).toEqual(['Finished']);
  });

  it('matches a label however the filter typed it', async () => {
    const sim = await seedCompletedSimulation(user.id, { companyName: 'Tagged' });
    await prisma.runTag.create({ data: { simulationId: sim.id, label: 'cash-crunch' } });
    await seedCompletedSimulation(user.id, { companyName: 'Untagged' });

    expect(companies(await jsonBody('?tag=Cash%20Crunch'))).toEqual(['Tagged']);
  });

  it('honours the sort it was given', async () => {
    await seedCompletedSimulation(user.id, { companyName: 'Low', performanceScore: 20 });
    await seedCompletedSimulation(user.id, { companyName: 'High', performanceScore: 90 });

    expect(companies(await jsonBody('?sort=performanceScore&direction=desc'))).toEqual([
      'High',
      'Low',
    ]);
    expect(companies(await jsonBody('?sort=performanceScore&direction=asc'))).toEqual([
      'Low',
      'High',
    ]);
  });

  it('ignores paging, so the file holds the whole cohort rather than one page', async () => {
    for (let i = 0; i < 15; i++) {
      await seedCompletedSimulation(user.id, { companyName: `Run ${i}` });
    }

    const body = await jsonBody('?page=1&pageSize=2');
    expect(body.exported).toBe(15);
    expect(body.total).toBe(15);
  });

  it('echoes the filters and the sort that produced the cohort', async () => {
    await seedCompletedSimulation(user.id, { industry: 'Retail' });
    const body = await jsonBody('?industry=Retail&status=ended&sort=performanceScore&direction=asc');

    expect(body.query).toEqual({
      filters: { industry: 'Retail', status: 'ended' },
      sort: { field: 'performanceScore', direction: 'asc' },
    });
  });

  it('reports an untruncated cohort as such', async () => {
    await seedCompletedSimulation(user.id);
    const response = await download();

    expect(response.headers.get('x-export-truncated')).toBe('false');
    expect((await jsonBody()).truncated).toBe(false);
  });

  it('rejects a filter value it does not recognise', async () => {
    const response = await download('?industry=Sorcery');

    expect(response.status).toBe(400);
  });
});
