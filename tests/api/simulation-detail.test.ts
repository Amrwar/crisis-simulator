import { beforeEach, describe, expect, it } from 'vitest';

import { GET as getSimulation } from '@/app/api/simulations/[id]/route';
import { prisma } from '@/lib/db';
import { resetDatabase, seedSimulation, signIn, signOut, type SignedInUser } from '../helpers/db';
import { getRequest, readJson } from '../helpers/http';

function detail(id: string) {
  return getSimulation(getRequest(`/api/simulations/${id}`), { params: { id } });
}

let owner: SignedInUser;
let simulationId: string;

beforeEach(async () => {
  await resetDatabase();
  owner = await signIn('owner@example.com', 'Owner');
  const simulation = await seedSimulation(owner.id, { currentTurn: 3 });
  simulationId = simulation.id;
});

describe('GET /api/simulations/[id]', () => {
  it('answers 401 for an anonymous visitor', async () => {
    signOut();
    const response = await detail(simulationId);
    expect(response.status).toBe(401);
    expect(await readJson<{ error: string }>(response)).toEqual({ error: 'Unauthorized' });
  });

  it('answers 404 for a simulation that does not exist', async () => {
    const response = await detail('no-such-simulation');
    expect(response.status).toBe(404);
    expect(await readJson<{ error: string }>(response)).toEqual({ error: 'Not found' });
  });

  it('answers 403 for a simulation belonging to somebody else', async () => {
    await signIn('intruder@example.com');
    const response = await detail(simulationId);
    expect(response.status).toBe(403);
    expect(await readJson<{ error: string }>(response)).toEqual({ error: 'Forbidden' });
  });

  it('distinguishes a missing simulation from a forbidden one', async () => {
    await signIn('intruder@example.com');
    expect((await detail('no-such-simulation')).status).toBe(404);
    expect((await detail(simulationId)).status).toBe(403);
  });

  it('returns the simulation to its owner', async () => {
    const response = await detail(simulationId);
    expect(response.status).toBe(200);

    const body = await readJson<{ id: string; userId: string; companyName: string; status: string }>(
      response
    );
    expect(body.id).toBe(simulationId);
    expect(body.userId).toBe(owner.id);
    expect(body.companyName).toBe('Nile Home Goods');
    expect(body.status).toBe('active');
  });

  it('returns every turn in ascending order', async () => {
    const body = await readJson<{ turns: Array<{ turnNumber: number }> }>(await detail(simulationId));
    expect(body.turns.map((t) => t.turnNumber)).toEqual([1, 2, 3]);
  });

  it('parses the JSON columns so the client does not have to', async () => {
    const body = await readJson<{
      turns: Array<{
        characterMessagesParsed: Array<{ from: string; message: string }>;
        newsOrSocialParsed: { type: string; text: string } | null;
        optionsParsed: Array<{ id: string; tags: string[] }>;
        tagsParsed: string[];
        metricDeltasParsed: Record<string, number>;
      }>;
      flags: Record<string, unknown>;
      finalReport: unknown;
    }>(await detail(simulationId));

    const [firstTurn] = body.turns;
    expect(firstTurn.characterMessagesParsed[0].from).toBe('CFO');
    expect(firstTurn.newsOrSocialParsed?.type).toBe('news');
    expect(firstTurn.optionsParsed.map((o) => o.id)).toEqual(['A', 'B', 'C']);
    expect(firstTurn.tagsParsed).toEqual(['negotiate_supplier']);
    expect(firstTurn.metricDeltasParsed).toEqual({ cash: -1000 });
    expect(body.flags).toEqual({});
    expect(body.finalReport).toBeNull();
  });

  it('reports the flags a simulation has accumulated', async () => {
    const flagged = await seedSimulation(owner.id, {
      flags: { took_loan: true, layoffs_done: true },
    });
    const body = await readJson<{ flags: Record<string, unknown> }>(await detail(flagged.id));
    expect(body.flags).toEqual({ took_loan: true, layoffs_done: true });
  });

  it('returns a null news item when the turn carried none', async () => {
    const bare = await seedSimulation(owner.id);
    await prisma.turn.updateMany({ where: { simulationId: bare.id }, data: { newsOrSocial: '' } });

    const body = await readJson<{ turns: Array<{ newsOrSocialParsed: unknown }> }>(
      await detail(bare.id)
    );
    expect(body.turns[0].newsOrSocialParsed).toBeNull();
  });

  it('parses a stored final report', async () => {
    const finished = await seedSimulation(owner.id, { status: 'ended' });
    await prisma.simulation.update({
      where: { id: finished.id },
      data: { endingType: 'survival', finalReport: JSON.stringify({ overallScore: 71 }) },
    });

    const body = await readJson<{ finalReport: { overallScore: number } | null; endingType: string }>(
      await detail(finished.id)
    );
    expect(body.finalReport).toEqual({ overallScore: 71 });
    expect(body.endingType).toBe('survival');
  });

  it('includes the achievements unlocked so far', async () => {
    await prisma.achievement.create({
      data: { simulationId, type: 'crisis_manager' },
    });
    const body = await readJson<{ achievements: Array<{ type: string }> }>(await detail(simulationId));
    expect(body.achievements.map((a) => a.type)).toEqual(['crisis_manager']);
  });
});
