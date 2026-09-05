import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as createSimulation } from '@/app/api/simulations/route';
import { POST as submitTurn } from '@/app/api/simulations/[id]/turn/route';
import { GET as replay } from '@/app/api/simulations/[id]/replay/route';
import { prisma } from '@/lib/db';
import type { ReplayResult } from '@/lib/game/replay';
import { generateFinalReport, generateInitialTurn, generateNextTurn } from '@/lib/llm';
import { resetDatabase, seedCompletedSimulation, signIn, signOut, type SignedInUser } from '../helpers/db';
import { finalReportFixture, initialTurnFixture, nextTurnFixture } from '../helpers/fixtures';
import { getRequest, jsonRequest, readJson } from '../helpers/http';
import type { ApiResponse } from '@/types';

vi.mock('@/lib/llm', () => ({
  generateInitialTurn: vi.fn(),
  generateNextTurn: vi.fn(),
  generateFinalReport: vi.fn(),
  suggestTags: vi.fn(),
}));

const initialMock = vi.mocked(generateInitialTurn);
const nextMock = vi.mocked(generateNextTurn);
const reportMock = vi.mocked(generateFinalReport);

let user: SignedInUser;

beforeEach(async () => {
  await resetDatabase();
  initialMock.mockResolvedValue(initialTurnFixture());
  nextMock.mockImplementation(async ({ turnNumber }) => nextTurnFixture(turnNumber));
  reportMock.mockResolvedValue(finalReportFixture());
  user = await signIn('replayer@example.com', 'Replayer');
});

async function replayOf(id: string) {
  const response = await replay(getRequest(`/api/simulations/${id}/replay`), { params: { id } });
  return { status: response.status, body: await readJson<ApiResponse<ReplayResult>>(response) };
}

async function replayData(id: string): Promise<ReplayResult> {
  const { status, body } = await replayOf(id);
  expect(status).toBe(200);
  if (!body.success) throw new Error(body.error);
  return body.data;
}

/** Plays a real simulation through the real routes, deciding `turns` turns. */
async function playThrough(
  turns: number,
  setup = { industry: 'Retail', difficulty: 'Medium', companySize: 'Small' }
): Promise<string> {
  const created = await createSimulation(jsonRequest('/api/simulations', setup));
  const { id } = await readJson<{ id: string }>(created);

  for (let i = 0; i < turns; i++) {
    const sim = await prisma.simulation.findUniqueOrThrow({ where: { id } });
    if (sim.status !== 'active') break;
    await submitTurn(jsonRequest(`/api/simulations/${id}/turn`, { optionId: 'A' }), {
      params: { id },
    });
  }

  return id;
}

describe('GET /api/simulations/[id]/replay — access', () => {
  it('answers 401 for an anonymous visitor', async () => {
    const sim = await seedCompletedSimulation(user.id);
    signOut();

    expect((await replayOf(sim.id)).status).toBe(401);
  });

  it('answers 404 for a simulation that does not exist', async () => {
    const { status, body } = await replayOf('no-such-id');

    expect(status).toBe(404);
    expect(body).toEqual({ success: false, error: 'Simulation not found' });
  });

  it('answers 403 for somebody else run', async () => {
    const owner = await signIn('owner@example.com');
    const sim = await seedCompletedSimulation(owner.id);
    await signIn('intruder@example.com');

    const { status, body } = await replayOf(sim.id);
    expect(status).toBe(403);
    expect(body).toEqual({ success: false, error: 'Forbidden' });
  });
});

describe('GET /api/simulations/[id]/replay — reproducing a real run', () => {
  it('reproduces a run played through the real turn route, turn for turn', async () => {
    const id = await playThrough(4);
    const result = await replayData(id);

    expect(result.turnsReplayed).toBe(4);
    expect(result.mismatchCount).toBe(0);
    expect(result.reproduced).toBe(true);
  });

  it('reproduces every metric of every turn, not just the last', async () => {
    const id = await playThrough(5);
    const result = await replayData(id);

    for (const step of result.steps) {
      expect(step.mismatches, `turn ${step.turnNumber}`).toEqual([]);
      expect(step.matches, `turn ${step.turnNumber}`).toBe(true);
    }
  });

  it('reproduces a run played to its ending, and agrees on the ending', async () => {
    const id = await playThrough(12);
    const stored = await prisma.simulation.findUniqueOrThrow({ where: { id } });
    expect(stored.status).toBe('ended');

    const result = await replayData(id);
    expect(result.reproduced).toBe(true);
    expect(result.computedEnding).toBe(stored.endingType);
    expect(result.endingMatches).toBe(true);
  });

  it('reproduces a Hard run, where the difficulty multipliers differ', async () => {
    const id = await playThrough(5, {
      industry: 'Construction',
      difficulty: 'Hard',
      companySize: 'Medium',
    });

    expect((await replayData(id)).reproduced).toBe(true);
  });

  it('reproduces an Easy run too', async () => {
    const id = await playThrough(5, {
      industry: 'Healthcare',
      difficulty: 'Easy',
      companySize: 'Small',
    });

    expect((await replayData(id)).reproduced).toBe(true);
  });

  it('is stable: replaying twice gives the same answer', async () => {
    const id = await playThrough(4);

    const first = await replayData(id);
    const second = await replayData(id);

    expect(second.steps.map((s) => s.computed)).toEqual(first.steps.map((s) => s.computed));
  });

  it('replays only the decided turns, leaving the one in play alone', async () => {
    const id = await playThrough(3);
    const turnCount = await prisma.turn.count({ where: { simulationId: id } });

    // Three decided turns plus the one the player is now looking at.
    expect(turnCount).toBe(4);
    expect((await replayData(id)).turnsReplayed).toBe(3);
  });

  it('reports the seed it replayed from', async () => {
    const id = await playThrough(2);
    const stored = await prisma.simulation.findUniqueOrThrow({ where: { id } });

    expect((await replayData(id)).seed).toBe(stored.seed);
  });

  it('records what was decided each turn', async () => {
    const id = await playThrough(2);
    const result = await replayData(id);

    // Option A in the fixture carries the negotiate_supplier tag.
    expect(result.steps[0].tags).toEqual(['negotiate_supplier']);
  });

  it('regenerates the competitor move from the seed', async () => {
    const id = await playThrough(2);
    const result = await replayData(id);

    expect(result.steps[0].competitorAction.length).toBeGreaterThan(10);
  });
});

describe('GET /api/simulations/[id]/replay — detecting a divergence', () => {
  it('reports a mismatch when a stored snapshot has been altered', async () => {
    const id = await playThrough(3);
    await prisma.turn.updateMany({
      where: { simulationId: id, turnNumber: 2 },
      data: { reputationAfter: 3 },
    });

    const result = await replayData(id);
    expect(result.reproduced).toBe(false);
    expect(result.mismatchCount).toBeGreaterThan(0);
  });

  it('names the metric, the turn and both values', async () => {
    const id = await playThrough(3);
    await prisma.turn.updateMany({
      where: { simulationId: id, turnNumber: 2 },
      data: { reputationAfter: 3 },
    });

    const result = await replayData(id);
    const step = result.steps.find((s) => s.turnNumber === 2);
    const mismatch = step?.mismatches.find((m) => m.metric === 'reputation');

    expect(step?.matches).toBe(false);
    expect(mismatch?.stored).toBe(3);
    expect(mismatch?.computed).toBeGreaterThan(3);
  });

  it('leaves the untouched turns matching', async () => {
    const id = await playThrough(3);
    await prisma.turn.updateMany({
      where: { simulationId: id, turnNumber: 2 },
      data: { reputationAfter: 3 },
    });

    const result = await replayData(id);
    expect(result.steps.find((s) => s.turnNumber === 1)?.matches).toBe(true);
  });

  it('reports a mismatch when the recorded decision has been changed', async () => {
    const id = await playThrough(3);
    await prisma.turn.updateMany({
      where: { simulationId: id, turnNumber: 1 },
      data: { tags: JSON.stringify(['layoffs']) },
    });

    expect((await replayData(id)).reproduced).toBe(false);
  });

  it('replays an empty result for a run with no decided turns', async () => {
    const created = await createSimulation(
      jsonRequest('/api/simulations', {
        industry: 'Retail',
        difficulty: 'Medium',
        companySize: 'Small',
      })
    );
    const { id } = await readJson<{ id: string }>(created);

    const result = await replayData(id);
    expect(result.turnsReplayed).toBe(0);
    expect(result.steps).toEqual([]);
    expect(result.reproduced).toBe(true);
  });
});
