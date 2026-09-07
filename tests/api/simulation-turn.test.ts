import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as submitTurn } from '@/app/api/simulations/[id]/turn/route';
import { generateFinalReport, generateNextTurn, suggestTags } from '@/lib/llm';
import { prisma } from '@/lib/db';
import { computePerformanceScore } from '@/lib/game/rules-engine';
import {
  resetDatabase,
  seedSimulation,
  signIn,
  signOut,
  type SignedInUser,
  type SimulationSeed,
} from '../helpers/db';
import { finalReportFixture, nextTurnFixture } from '../helpers/fixtures';
import { jsonRequest, rawRequest, readJson } from '../helpers/http';

vi.mock('@/lib/llm', () => ({
  generateInitialTurn: vi.fn(),
  generateNextTurn: vi.fn(),
  generateFinalReport: vi.fn(),
  suggestTags: vi.fn(),
}));

const nextTurnMock = vi.mocked(generateNextTurn);
const finalReportMock = vi.mocked(generateFinalReport);
const suggestTagsMock = vi.mocked(suggestTags);

function submit(id: string, body: unknown) {
  return submitTurn(jsonRequest(`/api/simulations/${id}/turn`, body), { params: { id } });
}

/** A simulation whose burn dwarfs its cash, so the next turn ends in bankruptcy. */
const DOOMED: SimulationSeed = { cash: 50_000, monthlyRevenue: 10_000, burnRate: 5_000_000 };

let owner: SignedInUser;
let simulationId: string;

beforeEach(async () => {
  await resetDatabase();
  nextTurnMock.mockImplementation(async (input) => nextTurnFixture(input.turnNumber));
  finalReportMock.mockResolvedValue(finalReportFixture());
  suggestTagsMock.mockRejectedValue(new Error('provider not configured for this test'));

  owner = await signIn('owner@example.com', 'Owner');
  simulationId = (await seedSimulation(owner.id)).id;
});

describe('POST /api/simulations/[id]/turn — access control', () => {
  it('answers 401 for an anonymous visitor', async () => {
    signOut();
    const response = await submit(simulationId, { optionId: 'A' });
    expect(response.status).toBe(401);
    expect(await readJson<{ error: string }>(response)).toEqual({ error: 'Unauthorized' });
  });

  it('answers 404 for a simulation that does not exist', async () => {
    const response = await submit('no-such-simulation', { optionId: 'A' });
    expect(response.status).toBe(404);
    expect(await readJson<{ error: string }>(response)).toEqual({ error: 'Not found' });
  });

  it('answers 403 for somebody else simulation and leaves it untouched', async () => {
    await signIn('intruder@example.com');
    const response = await submit(simulationId, { optionId: 'A' });

    expect(response.status).toBe(403);
    expect(await readJson<{ error: string }>(response)).toEqual({ error: 'Forbidden' });

    const untouched = await prisma.simulation.findUniqueOrThrow({ where: { id: simulationId } });
    expect(untouched.currentTurn).toBe(1);
    expect(untouched.cash).toBe(1_000_000);
  });
});

describe('POST /api/simulations/[id]/turn — request validation', () => {
  it('answers 400 when neither an option nor free text is given', async () => {
    const response = await submit(simulationId, {});
    expect(response.status).toBe(400);
    expect((await readJson<{ error: string }>(response)).error).toBe('Invalid input');
  });

  it('answers 400 for free text shorter than five characters', async () => {
    expect((await submit(simulationId, { freeText: 'cut' })).status).toBe(400);
  });

  it('answers 400 for free text longer than a thousand characters', async () => {
    expect((await submit(simulationId, { freeText: 'a'.repeat(1001) })).status).toBe(400);
  });

  it('answers 400 for an option id outside A to D', async () => {
    expect((await submit(simulationId, { optionId: 'Z' })).status).toBe(400);
  });

  it('answers 400 for an option the current turn does not offer', async () => {
    // The seeded turn offers A, B and C only.
    const response = await submit(simulationId, { optionId: 'D' });
    expect(response.status).toBe(400);
    expect(await readJson<{ error: string }>(response)).toEqual({ error: 'Invalid option' });
  });

  it('answers 400 once the simulation has ended', async () => {
    const ended = await seedSimulation(owner.id, { status: 'ended' });
    const response = await submit(ended.id, { optionId: 'A' });
    expect(response.status).toBe(400);
    expect(await readJson<{ error: string }>(response)).toEqual({
      error: 'Simulation already ended',
    });
  });

  it('answers 400 when the current turn has already been decided', async () => {
    await submit(simulationId, { optionId: 'A' });
    const stale = await prisma.simulation.update({
      where: { id: simulationId },
      data: { currentTurn: 1 },
    });
    const response = await submit(stale.id, { optionId: 'A' });

    expect(response.status).toBe(400);
    expect(await readJson<{ error: string }>(response)).toEqual({ error: 'Turn already decided' });
  });

  it('answers 500 rather than crashing on a body that is not JSON', async () => {
    const response = await submitTurn(
      rawRequest(`/api/simulations/${simulationId}/turn`, '<<<not json>>>'),
      { params: { id: simulationId } }
    );
    expect(response.status).toBe(500);
    expect((await readJson<{ error: string }>(response)).error).toBe('Failed to process turn');
  });
});

describe('POST /api/simulations/[id]/turn — resolving a decision', () => {
  it('applies the chosen option and returns the new metrics', async () => {
    const response = await submit(simulationId, { optionId: 'B' });
    expect(response.status).toBe(200);

    const body = await readJson<{
      newMetrics: { cash: number; burnRate: number };
      deltas: Record<string, number>;
      tags: string[];
      competitorAction: string;
    }>(response);

    // Option B is the bridging loan: a million in, a bigger burn rate out.
    expect(body.tags).toEqual(['take_loan']);
    expect(body.newMetrics.cash).toBe(1_000_000 + 300_000 - 200_000 + 1_000_000);
    expect(body.newMetrics.burnRate).toBe(200_000 + 55_000);
    expect(body.deltas.cash).toBe(1_100_000);
    expect(body.competitorAction).toMatch(/price war/i);
  });

  it('writes the decision and the resulting snapshot onto the turn', async () => {
    const body = await readJson<{ newMetrics: { cash: number; reputation: number } }>(
      await submit(simulationId, { optionId: 'C' })
    );

    const turn = await prisma.turn.findFirstOrThrow({
      where: { simulationId, turnNumber: 1 },
    });
    expect(turn.optionId).toBe('C');
    expect(turn.freeText).toBe('');
    expect(JSON.parse(turn.tags)).toEqual(['cut_costs']);
    expect(turn.decidedAt).not.toBeNull();
    expect(turn.cashAfter).toBe(body.newMetrics.cash);
    expect(turn.reputationAfter).toBe(body.newMetrics.reputation);
    expect(JSON.parse(turn.metricDeltas)).toHaveProperty('cash');
  });

  it('persists the new state onto the simulation and advances the turn', async () => {
    const body = await readJson<{ newMetrics: Record<string, number> }>(
      await submit(simulationId, { optionId: 'A' })
    );

    const simulation = await prisma.simulation.findUniqueOrThrow({ where: { id: simulationId } });
    expect(simulation.currentTurn).toBe(2);
    expect(simulation.status).toBe('active');
    expect(simulation.cash).toBe(body.newMetrics.cash);
    expect(simulation.reputation).toBe(body.newMetrics.reputation);
    expect(simulation.marketShare).toBe(body.newMetrics.marketShare);
  });

  it('records the flags a decision sets', async () => {
    await submit(simulationId, { optionId: 'B' });
    const simulation = await prisma.simulation.findUniqueOrThrow({ where: { id: simulationId } });
    expect(JSON.parse(simulation.flags)).toMatchObject({ took_loan: true });
  });

  it('is deterministic — the same seed and decision give the same metrics', async () => {
    const first = await readJson<{ newMetrics: Record<string, number> }>(
      await submit(simulationId, { optionId: 'A' })
    );

    const twin = await seedSimulation(owner.id, { seed: 987_654 });
    const second = await readJson<{ newMetrics: Record<string, number> }>(
      await submit(twin.id, { optionId: 'A' })
    );

    expect(second.newMetrics).toEqual(first.newMetrics);
  });

  it('produces different outcomes for different simulation seeds', async () => {
    const first = await readJson<{ newMetrics: Record<string, number> }>(
      await submit(simulationId, { optionId: 'A' })
    );
    const other = await seedSimulation(owner.id, { seed: 12_345 });
    const second = await readJson<{ newMetrics: Record<string, number> }>(
      await submit(other.id, { optionId: 'A' })
    );

    expect(second.newMetrics).not.toEqual(first.newMetrics);
  });
});

describe('POST /api/simulations/[id]/turn — free-text decisions', () => {
  it('extracts tags from the wording when the suggester is unavailable', async () => {
    const body = await readJson<{ tags: string[] }>(
      await submit(simulationId, { freeText: 'We will announce layoffs and start cost cutting' })
    );
    expect(body.tags).toContain('layoffs');
    expect(body.tags).toContain('cut_costs');
  });

  it('merges the suggester tags with the ones found in the wording', async () => {
    suggestTagsMock.mockResolvedValue({ tags: ['upgrade_tech'], notes: 'modernisation' });

    const body = await readJson<{ tags: string[] }>(
      await submit(simulationId, { freeText: 'We will take a loan to fund the rebuild' })
    );
    expect(body.tags).toContain('take_loan');
    expect(body.tags).toContain('upgrade_tech');
  });

  it('discards suggested tags the rules engine does not recognise', async () => {
    suggestTagsMock.mockResolvedValue({
      tags: ['sell_the_building', 'cut_costs'],
      notes: 'mixed',
    });

    const body = await readJson<{ tags: string[] }>(
      await submit(simulationId, { freeText: 'Reduce spending everywhere we can' })
    );
    expect(body.tags).not.toContain('sell_the_building');
    expect(body.tags).toContain('cut_costs');
  });

  it('never applies more than five tags at once', async () => {
    suggestTagsMock.mockResolvedValue({
      tags: ['upgrade_tech', 'hire_staff', 'improve_quality'],
      notes: 'many',
    });

    const body = await readJson<{ tags: string[] }>(
      await submit(simulationId, {
        freeText:
          'Take a loan, run an ad campaign, start employee training, negotiate supplier terms and pay on time',
      })
    );
    expect(body.tags.length).toBeLessThanOrEqual(5);
  });

  it('falls back to a cost-cutting decision when nothing can be extracted', async () => {
    const body = await readJson<{ tags: string[] }>(
      await submit(simulationId, { freeText: 'I will think about it over the weekend' })
    );
    expect(body.tags).toEqual(['cut_costs']);
  });

  it('stores the wording the player used', async () => {
    await submit(simulationId, { freeText: 'We will announce layoffs immediately' });
    const turn = await prisma.turn.findFirstOrThrow({ where: { simulationId, turnNumber: 1 } });
    expect(turn.freeText).toBe('We will announce layoffs immediately');
    expect(turn.optionId).toBe('');
  });
});

describe('POST /api/simulations/[id]/turn — the next turn', () => {
  it('creates the next turn from the generated scenario', async () => {
    const body = await readJson<{ nextTurn: { turn: { turnNumber: number; title: string } } }>(
      await submit(simulationId, { optionId: 'A' })
    );
    expect(body.nextTurn.turn.turnNumber).toBe(2);

    const turns = await prisma.turn.findMany({
      where: { simulationId },
      orderBy: { turnNumber: 'asc' },
    });
    expect(turns).toHaveLength(2);
    expect(turns[1].turnNumber).toBe(2);
    expect(turns[1].decidedAt).toBeNull();
    expect(JSON.parse(turns[1].options)).toHaveLength(4);
  });

  it('attaches the coach feedback to the turn it is about', async () => {
    await submit(simulationId, { optionId: 'A' });

    const decided = await prisma.turn.findFirstOrThrow({ where: { simulationId, turnNumber: 1 } });
    expect(decided.coachFeedback).toBe(nextTurnFixture().coach.feedback);
    expect(decided.coachWhyMatters).toBe(nextTurnFixture().coach.whyItMatters);

    const upcoming = await prisma.turn.findFirstOrThrow({ where: { simulationId, turnNumber: 2 } });
    expect(upcoming.coachFeedback).toBe('');
  });

  it('tells the generator what actually happened', async () => {
    await submit(simulationId, { optionId: 'B' });

    expect(nextTurnMock).toHaveBeenCalledTimes(1);
    const input = nextTurnMock.mock.calls[0][0];
    expect(input.turnNumber).toBe(2);
    expect(input.companyName).toBe('Nile Home Goods');
    expect(input.lastTags).toEqual(['take_loan']);
    expect(input.lastDecision).toBe('Take a bridging loan');
    expect(input.competitorAction).toMatch(/price war/i);
    expect(input.flags).toContain('took_loan');
  });

  it('answers 500 and does not advance the turn when generation fails', async () => {
    nextTurnMock.mockRejectedValue(new Error('provider unavailable'));

    const response = await submit(simulationId, { optionId: 'A' });
    expect(response.status).toBe(500);

    const simulation = await prisma.simulation.findUniqueOrThrow({ where: { id: simulationId } });
    expect(simulation.currentTurn).toBe(1);
    expect(simulation.status).toBe('active');
    expect(await prisma.turn.count({ where: { simulationId } })).toBe(1);
  });
});

describe('POST /api/simulations/[id]/turn — endings', () => {
  it('ends the simulation in bankruptcy once the cash is gone', async () => {
    const doomed = await seedSimulation(owner.id, DOOMED);
    const body = await readJson<{
      ending: { ended: boolean; endingType: string; reason: string } | null;
      nextTurn: unknown;
      finalReport: { overallScore: number };
    }>(await submit(doomed.id, { optionId: 'A' }));

    expect(body.ending?.ended).toBe(true);
    expect(body.ending?.endingType).toBe('bankruptcy');
    expect(body.nextTurn).toBeNull();

    const simulation = await prisma.simulation.findUniqueOrThrow({ where: { id: doomed.id } });
    expect(simulation.status).toBe('ended');
    expect(simulation.endingType).toBe('bankruptcy');
    expect(simulation.endedAt).not.toBeNull();
    expect(simulation.cash).toBe(0);
  });

  it('does not generate another turn once the game is over', async () => {
    const doomed = await seedSimulation(owner.id, DOOMED);
    await submit(doomed.id, { optionId: 'A' });

    expect(nextTurnMock).not.toHaveBeenCalled();
    expect(await prisma.turn.count({ where: { simulationId: doomed.id } })).toBe(1);
  });

  it('stores the generated final report', async () => {
    const doomed = await seedSimulation(owner.id, DOOMED);
    const body = await readJson<{ finalReport: { summary: string } }>(
      await submit(doomed.id, { optionId: 'A' })
    );

    expect(finalReportMock).toHaveBeenCalledTimes(1);
    expect(body.finalReport.summary).toBe(finalReportFixture().summary);

    const simulation = await prisma.simulation.findUniqueOrThrow({ where: { id: doomed.id } });
    expect(JSON.parse(simulation.finalReport).summary).toBe(finalReportFixture().summary);
  });

  it('falls back to a locally computed report when generation fails', async () => {
    finalReportMock.mockRejectedValue(new Error('provider unavailable'));
    const doomed = await seedSimulation(owner.id, DOOMED);

    const response = await submit(doomed.id, { optionId: 'A' });
    expect(response.status).toBe(200);

    const body = await readJson<{
      newMetrics: Parameters<typeof computePerformanceScore>[0];
      finalReport: { overallScore: number; endingType: string; summary: string };
    }>(response);

    expect(body.finalReport.endingType).toBe('bankruptcy');
    expect(body.finalReport.overallScore).toBe(
      computePerformanceScore(body.newMetrics, 50_000)
    );
    expect(body.finalReport.summary).toContain('bankruptcy');

    const simulation = await prisma.simulation.findUniqueOrThrow({ where: { id: doomed.id } });
    expect(simulation.status).toBe('ended');
  });

  it('ends the game with survival after the final turn', async () => {
    const finishing = await seedSimulation(owner.id, { currentTurn: 10, maxTurns: 10 });
    const body = await readJson<{ ending: { endingType: string } | null }>(
      await submit(finishing.id, { optionId: 'A' })
    );

    expect(body.ending?.endingType).toBe('survival');
    const simulation = await prisma.simulation.findUniqueOrThrow({ where: { id: finishing.id } });
    expect(simulation.status).toBe('ended');
    expect(simulation.currentTurn).toBe(10);
  });

  it('refuses any further decision once the game has ended', async () => {
    const finishing = await seedSimulation(owner.id, { currentTurn: 10, maxTurns: 10 });
    await submit(finishing.id, { optionId: 'A' });

    const again = await submit(finishing.id, { optionId: 'A' });
    expect(again.status).toBe(400);
    expect(await readJson<{ error: string }>(again)).toEqual({ error: 'Simulation already ended' });
  });
});

describe('POST /api/simulations/[id]/turn — achievements', () => {
  it('unlocks crisis_manager for surviving the final turn', async () => {
    const finishing = await seedSimulation(owner.id, { currentTurn: 10, maxTurns: 10 });
    const body = await readJson<{ newAchievements: string[] }>(
      await submit(finishing.id, { optionId: 'A' })
    );

    expect(body.newAchievements).toContain('crisis_manager');
    const stored = await prisma.achievement.findMany({ where: { simulationId: finishing.id } });
    expect(stored.map((a) => a.type)).toContain('crisis_manager');
  });

  it('unlocks negotiator on the third supplier negotiation', async () => {
    const negotiating = await seedSimulation(owner.id, {
      currentTurn: 4,
      flags: { negotiation_count_num: 2 },
    });
    const body = await readJson<{ newAchievements: string[] }>(
      await submit(negotiating.id, { optionId: 'A' })
    );

    expect(body.newAchievements).toContain('negotiator');
    const simulation = await prisma.simulation.findUniqueOrThrow({ where: { id: negotiating.id } });
    expect(JSON.parse(simulation.flags).negotiation_count_num).toBe(3);
  });

  it('unlocks nothing on an unremarkable early turn', async () => {
    const body = await readJson<{ newAchievements: string[] }>(
      await submit(simulationId, { optionId: 'C' })
    );
    expect(body.newAchievements).toEqual([]);
    expect(await prisma.achievement.count({ where: { simulationId } })).toBe(0);
  });

  it('marks a simulation as having been in crisis when cash collapses', async () => {
    const collapsing = await seedSimulation(owner.id, {
      cash: 1_000_000,
      monthlyRevenue: 10_000,
      burnRate: 900_000,
    });
    await submit(collapsing.id, { optionId: 'A' });

    const simulation = await prisma.simulation.findUniqueOrThrow({ where: { id: collapsing.id } });
    expect(JSON.parse(simulation.flags).was_in_crisis).toBe(true);
  });
});

describe('POST /api/simulations/[id]/turn — what a failure tells the caller', () => {
  it('does not put the thrown message in the response', async () => {
    nextTurnMock.mockRejectedValue(
      new Error('401 Incorrect API key provided: sk-live-abcdef. Check your account.')
    );

    const response = await submit(simulationId, { optionId: 'A' });
    const serialized = JSON.stringify(await readJson(response));

    expect(response.status).toBe(500);
    expect(serialized).not.toContain('sk-live-abcdef');
    expect(serialized).not.toContain('Incorrect API key');
  });

  it('answers with the failure and nothing else', async () => {
    nextTurnMock.mockRejectedValue(new Error('provider exploded'));

    const response = await submit(simulationId, { optionId: 'A' });

    expect(await readJson(response)).toEqual({ error: 'Failed to process turn' });
  });

  it('still describes a rejected body, which is the caller own doing', async () => {
    const response = await submit(simulationId, { optionId: 'Z' });

    expect(response.status).toBe(400);
    expect((await readJson<{ error: string }>(response)).error).toBe('Invalid input');
  });
});
