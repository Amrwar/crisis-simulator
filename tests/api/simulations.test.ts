import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as listSimulations, POST as createSimulation } from '@/app/api/simulations/route';
import { generateInitialTurn } from '@/lib/llm';
import { prisma } from '@/lib/db';
import { getStartingMetrics } from '@/lib/game/starting-metrics';
import { resetDatabase, signIn, signOut, type SignedInUser } from '../helpers/db';
import { initialTurnFixture } from '../helpers/fixtures';
import { jsonRequest, readJson } from '../helpers/http';

// The provider boundary is replaced wholesale: no key, no request, no network.
vi.mock('@/lib/llm', () => ({
  generateInitialTurn: vi.fn(),
  generateNextTurn: vi.fn(),
  generateFinalReport: vi.fn(),
  suggestTags: vi.fn(),
}));

const generateInitialTurnMock = vi.mocked(generateInitialTurn);

let user: SignedInUser;

beforeEach(async () => {
  await resetDatabase();
  generateInitialTurnMock.mockResolvedValue(initialTurnFixture());
  user = await signIn('owner@example.com', 'Owner');
});

describe('POST /api/simulations', () => {
  const validBody = { industry: 'Retail', difficulty: 'Medium', companySize: 'Small' };

  it('answers 401 for an anonymous visitor', async () => {
    signOut();
    const response = await createSimulation(jsonRequest('/api/simulations', validBody));
    expect(response.status).toBe(401);
    expect(await readJson<{ error: string }>(response)).toEqual({ error: 'Unauthorized' });
    expect(await prisma.simulation.count()).toBe(0);
  });

  it('answers 201 with the new simulation id', async () => {
    const response = await createSimulation(jsonRequest('/api/simulations', validBody));

    expect(response.status).toBe(201);
    const body = await readJson<{ id: string }>(response);
    const stored = await prisma.simulation.findUniqueOrThrow({ where: { id: body.id } });
    expect(stored.userId).toBe(user.id);
  });

  it('stores the company profile the generator returned', async () => {
    const response = await createSimulation(jsonRequest('/api/simulations', validBody));
    const { id } = await readJson<{ id: string }>(response);
    const stored = await prisma.simulation.findUniqueOrThrow({ where: { id } });

    expect(stored.companyName).toBe('Nile Home Goods');
    expect(stored.companyLocation).toBe('Cairo, Egypt');
    expect(stored.competitorName).toBe('Delta Living');
    expect(stored.competitorStrategy).toBe('price_war');
    expect(stored.startingSituation.length).toBeGreaterThan(30);
  });

  it('seeds the simulation with the metrics for that industry, difficulty and size', async () => {
    const expected = getStartingMetrics('Restaurant', 'Hard', 'Medium');
    const response = await createSimulation(
      jsonRequest('/api/simulations', {
        industry: 'Restaurant',
        difficulty: 'Hard',
        companySize: 'Medium',
      })
    );
    const { id } = await readJson<{ id: string }>(response);
    const stored = await prisma.simulation.findUniqueOrThrow({ where: { id } });

    expect(stored.cash).toBe(expected.cash);
    expect(stored.monthlyRevenue).toBe(expected.monthlyRevenue);
    expect(stored.burnRate).toBe(expected.burnRate);
    expect(stored.reputation).toBe(expected.reputation);
    expect(stored.morale).toBe(expected.morale);
    expect(stored.churn).toBe(expected.churn);
    expect(stored.legalRisk).toBe(expected.legalRisk);
    expect(stored.marketShare).toBe(expected.marketShare);
    expect(stored.supplierReliability).toBe(expected.supplierReliability);
    expect(stored.employeeLoyalty).toBe(expected.employeeLoyalty);
    expect(stored.demandVolatility).toBe(expected.demandVolatility);
    expect(stored.competitorAggression).toBe(expected.competitorAggression);
    expect(stored.competitorStrength).toBe(expected.competitorStrength);
  });

  it('passes those same starting metrics to the scenario generator', async () => {
    await createSimulation(jsonRequest('/api/simulations', validBody));

    expect(generateInitialTurnMock).toHaveBeenCalledTimes(1);
    expect(generateInitialTurnMock).toHaveBeenCalledWith({
      industry: 'Retail',
      difficulty: 'Medium',
      companySize: 'Small',
      metrics: getStartingMetrics('Retail', 'Medium', 'Small'),
    });
  });

  it('opens the simulation on turn one, still active, with a seed', async () => {
    const { id } = await readJson<{ id: string }>(
      await createSimulation(jsonRequest('/api/simulations', validBody))
    );
    const stored = await prisma.simulation.findUniqueOrThrow({ where: { id } });

    expect(stored.currentTurn).toBe(1);
    expect(stored.maxTurns).toBe(10);
    expect(stored.status).toBe('active');
    expect(stored.endingType).toBe('');
    expect(stored.endedAt).toBeNull();
    expect(Number.isInteger(stored.seed)).toBe(true);
    expect(stored.seed).toBeGreaterThanOrEqual(0);
  });

  it('writes the opening turn as an undecided turn one', async () => {
    const { id } = await readJson<{ id: string }>(
      await createSimulation(jsonRequest('/api/simulations', validBody))
    );
    const turns = await prisma.turn.findMany({ where: { simulationId: id } });

    expect(turns).toHaveLength(1);
    const [turn] = turns;
    expect(turn.turnNumber).toBe(1);
    expect(turn.title).toBe('Customs Delay Bites');
    expect(turn.decidedAt).toBeNull();
    expect(turn.optionId).toBe('');
    expect(JSON.parse(turn.options)).toHaveLength(4);
    expect(JSON.parse(turn.characterMessages)).toHaveLength(3);
    expect(JSON.parse(turn.newsOrSocial).type).toBe('news');
  });

  it('snapshots the starting metrics onto turn one', async () => {
    const expected = getStartingMetrics('Retail', 'Medium', 'Small');
    const { id } = await readJson<{ id: string }>(
      await createSimulation(jsonRequest('/api/simulations', validBody))
    );
    const turn = await prisma.turn.findFirstOrThrow({ where: { simulationId: id } });

    expect(turn.cashAfter).toBe(expected.cash);
    expect(turn.revenueAfter).toBe(expected.monthlyRevenue);
    expect(turn.reputationAfter).toBe(expected.reputation);
    expect(turn.marketShareAfter).toBe(expected.marketShare);
  });

  it('gives each simulation its own seed', async () => {
    const ids = [] as string[];
    for (let i = 0; i < 5; i++) {
      ids.push((await readJson<{ id: string }>(await createSimulation(jsonRequest('/api/simulations', validBody)))).id);
    }
    const seeds = (await prisma.simulation.findMany({ where: { id: { in: ids } } })).map((s) => s.seed);
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  it('answers 400 for an industry outside the supported list', async () => {
    const response = await createSimulation(
      jsonRequest('/api/simulations', { ...validBody, industry: 'Aerospace' })
    );
    expect(response.status).toBe(400);
    expect((await readJson<{ error: string }>(response)).error).toBe('Invalid input');
    expect(generateInitialTurnMock).not.toHaveBeenCalled();
    expect(await prisma.simulation.count()).toBe(0);
  });

  it('answers 400 for an unsupported difficulty or company size', async () => {
    expect(
      (await createSimulation(jsonRequest('/api/simulations', { ...validBody, difficulty: 'Nightmare' })))
        .status
    ).toBe(400);
    expect(
      (await createSimulation(jsonRequest('/api/simulations', { ...validBody, companySize: 'Huge' })))
        .status
    ).toBe(400);
  });

  it('answers 500 and stores nothing when the scenario generator fails', async () => {
    generateInitialTurnMock.mockRejectedValue(new Error('provider unavailable'));

    const response = await createSimulation(jsonRequest('/api/simulations', validBody));
    expect(response.status).toBe(500);
    expect((await readJson<{ error: string }>(response)).error).toBe('Failed to create simulation');
    expect(await prisma.simulation.count()).toBe(0);
    expect(await prisma.turn.count()).toBe(0);
  });
});

describe('GET /api/simulations', () => {
  it('answers 401 for an anonymous visitor', async () => {
    signOut();
    const response = await listSimulations();
    expect(response.status).toBe(401);
    expect(await readJson<{ error: string }>(response)).toEqual({ error: 'Unauthorized' });
  });

  it('returns an empty list for a user with no simulations', async () => {
    const response = await listSimulations();
    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual([]);
  });

  it('returns only the caller own simulations', async () => {
    await createSimulation(
      jsonRequest('/api/simulations', { industry: 'Retail', difficulty: 'Medium', companySize: 'Small' })
    );

    const other = await signIn('other@example.com');
    await createSimulation(
      jsonRequest('/api/simulations', { industry: 'SaaS', difficulty: 'Easy', companySize: 'Medium' })
    );

    const response = await listSimulations();
    const body = await readJson<Array<{ industry: string }>>(response);
    expect(body).toHaveLength(1);
    expect(body[0].industry).toBe('SaaS');

    const stored = await prisma.simulation.findMany({ where: { userId: other.id } });
    expect(stored).toHaveLength(1);
  });

  it('lists the newest simulation first', async () => {
    for (const industry of ['Retail', 'SaaS', 'Healthcare']) {
      await createSimulation(
        jsonRequest('/api/simulations', { industry, difficulty: 'Medium', companySize: 'Small' })
      );
      // createdAt has second-level ties in SQLite; nudge them apart explicitly.
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const body = await readJson<Array<{ industry: string; createdAt: string }>>(
      await listSimulations()
    );
    expect(body.map((s) => s.industry)).toEqual(['Healthcare', 'SaaS', 'Retail']);
  });

  it('exposes only the dashboard fields, never the simulation seed', async () => {
    await createSimulation(
      jsonRequest('/api/simulations', { industry: 'Retail', difficulty: 'Medium', companySize: 'Small' })
    );
    const [summary] = await readJson<Array<Record<string, unknown>>>(await listSimulations());

    expect(Object.keys(summary).sort()).toEqual(
      [
        'id',
        'industry',
        'difficulty',
        'companySize',
        'companyName',
        'status',
        'endingType',
        'currentTurn',
        'maxTurns',
        'cash',
        'reputation',
        'marketShare',
        'createdAt',
        'endedAt',
      ].sort()
    );
    expect(summary).not.toHaveProperty('seed');
    expect(summary).not.toHaveProperty('flags');
  });
});
