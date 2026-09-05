import { beforeEach, describe, expect, it } from 'vitest';

import { PATCH as patchNotes } from '@/app/api/simulations/[id]/notes/route';
import { PATCH as patchTurnNote } from '@/app/api/simulations/[id]/turns/[turnNumber]/note/route';
import {
  DELETE as deleteTag,
  GET as listTags,
  POST as addTag,
} from '@/app/api/simulations/[id]/tags/route';
import { MAX_LABELS_PER_RUN } from '@/lib/annotations';
import { prisma } from '@/lib/db';
import {
  resetDatabase,
  seedCompletedSimulation,
  signIn,
  signOut,
  type SignedInUser,
} from '../helpers/db';
import { getRequest, jsonRequest, rawRequest, readJson } from '../helpers/http';
import type { ApiResponse } from '@/types';

let user: SignedInUser;
let simId: string;

beforeEach(async () => {
  await resetDatabase();
  user = await signIn('annotator@example.com', 'Annotator');
  simId = (await seedCompletedSimulation(user.id, { turnsCompleted: 3 })).id;
});

const notes = (id: string, body: unknown) =>
  patchNotes(jsonRequest(`/api/simulations/${id}/notes`, body, 'PATCH'), { params: { id } });

const turnNote = (id: string, turnNumber: string, body: unknown) =>
  patchTurnNote(
    jsonRequest(`/api/simulations/${id}/turns/${turnNumber}/note`, body, 'PATCH'),
    { params: { id, turnNumber } }
  );

const tags = {
  list: (id: string) => listTags(getRequest(`/api/simulations/${id}/tags`), { params: { id } }),
  add: (id: string, body: unknown) =>
    addTag(jsonRequest(`/api/simulations/${id}/tags`, body), { params: { id } }),
  remove: (id: string, label: string) =>
    deleteTag(
      getRequest(`/api/simulations/${id}/tags?label=${encodeURIComponent(label)}`),
      { params: { id } }
    ),
};

async function data<T>(response: Response): Promise<T> {
  const body = await readJson<ApiResponse<T>>(response);
  if (!body.success) throw new Error(body.error);
  return body.data;
}

describe('PATCH /api/simulations/[id]/notes', () => {
  it('answers 401 for an anonymous visitor', async () => {
    signOut();
    const response = await notes(simId, { note: 'x' });

    expect(response.status).toBe(401);
    expect(await prisma.simulation.findUniqueOrThrow({ where: { id: simId } })).toMatchObject({
      notes: '',
    });
  });

  it('answers 404 for a simulation that does not exist', async () => {
    expect((await notes('no-such-id', { note: 'x' })).status).toBe(404);
  });

  it('answers 403 for somebody else run', async () => {
    const other = await prisma.user.create({
      data: { email: 'other@example.com', passwordHash: 'x' },
    });
    const theirs = await seedCompletedSimulation(other.id);

    expect((await notes(theirs.id, { note: 'mine now' })).status).toBe(403);
    expect(
      (await prisma.simulation.findUniqueOrThrow({ where: { id: theirs.id } })).notes
    ).toBe('');
  });

  it('stores the note', async () => {
    const response = await notes(simId, { note: 'Should have cut costs earlier.' });

    expect(response.status).toBe(200);
    expect(await data<{ notes: string }>(response)).toEqual({
      notes: 'Should have cut costs earlier.',
    });
    expect((await prisma.simulation.findUniqueOrThrow({ where: { id: simId } })).notes).toBe(
      'Should have cut costs earlier.'
    );
  });

  it('trims the note', async () => {
    await notes(simId, { note: '   padded   ' });
    expect((await prisma.simulation.findUniqueOrThrow({ where: { id: simId } })).notes).toBe(
      'padded'
    );
  });

  it('keeps newlines the player wrote', async () => {
    await notes(simId, { note: 'One\nTwo' });
    expect((await prisma.simulation.findUniqueOrThrow({ where: { id: simId } })).notes).toBe(
      'One\nTwo'
    );
  });

  it('clears the note when an empty one is sent', async () => {
    await notes(simId, { note: 'something' });
    await notes(simId, { note: '' });

    expect((await prisma.simulation.findUniqueOrThrow({ where: { id: simId } })).notes).toBe('');
  });

  it('answers 400 for a note past the limit', async () => {
    const response = await notes(simId, { note: 'x'.repeat(5_000) });

    expect(response.status).toBe(400);
    expect(await readJson(response)).toMatchObject({ success: false, error: 'Invalid input' });
  });

  it('answers 400 for a body that is not JSON', async () => {
    const response = await patchNotes(
      rawRequest(`/api/simulations/${simId}/notes`, 'not json', 'PATCH'),
      { params: { id: simId } }
    );

    expect(response.status).toBe(400);
  });

  it('answers 400 for a body with no note field', async () => {
    expect((await notes(simId, { text: 'wrong key' })).status).toBe(400);
  });
});

describe('PATCH /api/simulations/[id]/turns/[turnNumber]/note', () => {
  it('answers 401 for an anonymous visitor', async () => {
    signOut();
    expect((await turnNote(simId, '1', { note: 'x' })).status).toBe(401);
  });

  it('answers 403 for a turn of somebody else run', async () => {
    const other = await prisma.user.create({
      data: { email: 'other@example.com', passwordHash: 'x' },
    });
    const theirs = await seedCompletedSimulation(other.id, { turnsCompleted: 2 });

    expect((await turnNote(theirs.id, '1', { note: 'x' })).status).toBe(403);
  });

  it('stores the note against that turn', async () => {
    const response = await turnNote(simId, '2', { note: 'This is where it went wrong.' });

    expect(response.status).toBe(200);
    const stored = await prisma.turn.findFirstOrThrow({
      where: { simulationId: simId, turnNumber: 2 },
    });
    expect(stored.note).toBe('This is where it went wrong.');
  });

  it('leaves the other turns alone', async () => {
    await turnNote(simId, '2', { note: 'only here' });

    const others = await prisma.turn.findMany({
      where: { simulationId: simId, turnNumber: { not: 2 } },
    });
    expect(others.every((turn) => turn.note === '')).toBe(true);
  });

  it('answers 404 for a turn the run does not have', async () => {
    const response = await turnNote(simId, '9', { note: 'x' });

    expect(response.status).toBe(404);
    expect(await readJson(response)).toEqual({ success: false, error: 'Turn not found' });
  });

  it('answers 400 for a turn number that is not a positive whole number', async () => {
    expect((await turnNote(simId, 'abc', { note: 'x' })).status).toBe(400);
    expect((await turnNote(simId, '0', { note: 'x' })).status).toBe(400);
    expect((await turnNote(simId, '-1', { note: 'x' })).status).toBe(400);
  });

  it('does not reach into another run turn of the same number', async () => {
    const other = await prisma.user.create({
      data: { email: 'other@example.com', passwordHash: 'x' },
    });
    const theirs = await seedCompletedSimulation(other.id, { turnsCompleted: 3 });

    await turnNote(simId, '1', { note: 'mine' });

    const theirTurn = await prisma.turn.findFirstOrThrow({
      where: { simulationId: theirs.id, turnNumber: 1 },
    });
    expect(theirTurn.note).toBe('');
  });
});

describe('run labels', () => {
  it('answers 401 for an anonymous visitor', async () => {
    signOut();
    expect((await tags.list(simId)).status).toBe(401);
    expect((await tags.add(simId, { label: 'practice' })).status).toBe(401);
    expect((await tags.remove(simId, 'practice')).status).toBe(401);
  });

  it('answers 403 for somebody else run', async () => {
    const other = await prisma.user.create({
      data: { email: 'other@example.com', passwordHash: 'x' },
    });
    const theirs = await seedCompletedSimulation(other.id);

    expect((await tags.add(theirs.id, { label: 'practice' })).status).toBe(403);
    expect(await prisma.runTag.count()).toBe(0);
  });

  it('starts with no labels', async () => {
    expect(await data<{ tags: string[] }>(await tags.list(simId))).toEqual({ tags: [] });
  });

  it('adds a label and returns the run whole list', async () => {
    const response = await tags.add(simId, { label: 'practice' });

    expect(response.status).toBe(200);
    expect(await data<{ label: string; tags: string[] }>(response)).toEqual({
      label: 'practice',
      tags: ['practice'],
    });
  });

  it('normalises the label before storing it', async () => {
    await tags.add(simId, { label: '  For Class  ' });

    const stored = await prisma.runTag.findFirstOrThrow({ where: { simulationId: simId } });
    expect(stored.label).toBe('for-class');
  });

  it('treats a re-added label as already done rather than a conflict', async () => {
    await tags.add(simId, { label: 'practice' });
    const second = await tags.add(simId, { label: 'PRACTICE' });

    expect(second.status).toBe(200);
    expect(await prisma.runTag.count({ where: { simulationId: simId } })).toBe(1);
  });

  it('lists labels alphabetically', async () => {
    await tags.add(simId, { label: 'zebra' });
    await tags.add(simId, { label: 'apple' });

    expect((await data<{ tags: string[] }>(await tags.list(simId))).tags).toEqual([
      'apple',
      'zebra',
    ]);
  });

  it('answers 400 for a label with nothing usable in it', async () => {
    expect((await tags.add(simId, { label: '!!!' })).status).toBe(400);
    expect((await tags.add(simId, { label: '' })).status).toBe(400);
    expect(await prisma.runTag.count()).toBe(0);
  });

  it('refuses more labels than a run may carry', async () => {
    for (let i = 0; i < MAX_LABELS_PER_RUN; i++) {
      expect((await tags.add(simId, { label: `label-${i}` })).status).toBe(200);
    }

    const response = await tags.add(simId, { label: 'one-too-many' });
    expect(response.status).toBe(409);
    expect(await prisma.runTag.count({ where: { simulationId: simId } })).toBe(MAX_LABELS_PER_RUN);
  });

  it('removes a label', async () => {
    await tags.add(simId, { label: 'practice' });
    const response = await tags.remove(simId, 'practice');

    expect(response.status).toBe(200);
    expect(await data<{ tags: string[] }>(response)).toEqual({
      removed: 'practice',
      tags: [],
    });
  });

  it('removes a label given in any form', async () => {
    await tags.add(simId, { label: 'for class' });
    expect((await tags.remove(simId, 'For Class')).status).toBe(200);
    expect(await prisma.runTag.count()).toBe(0);
  });

  it('answers 404 when removing a label the run does not carry', async () => {
    const response = await tags.remove(simId, 'never-added');

    expect(response.status).toBe(404);
    expect(await readJson(response)).toEqual({
      success: false,
      error: 'This run does not carry that label',
    });
  });

  it('answers 400 when no label is named', async () => {
    const response = await deleteTag(getRequest(`/api/simulations/${simId}/tags`), {
      params: { id: simId },
    });

    expect(response.status).toBe(400);
  });

  it('does not remove the same label from another run', async () => {
    const second = await seedCompletedSimulation(user.id);
    await tags.add(simId, { label: 'practice' });
    await tags.add(second.id, { label: 'practice' });

    await tags.remove(simId, 'practice');

    expect(await prisma.runTag.count({ where: { simulationId: second.id } })).toBe(1);
  });
});
