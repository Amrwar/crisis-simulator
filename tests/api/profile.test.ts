import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { DELETE as deleteAccount, GET as getProfile, PATCH as patchProfile } from '@/app/api/profile/route';
import { POST as changePassword } from '@/app/api/profile/password/route';
import { GET as me } from '@/app/api/auth/me/route';
import { prisma } from '@/lib/db';
import { DELETE_CONFIRMATION, type ProfilePayload } from '@/lib/profile';
import {
  resetDatabase,
  seedCompletedSimulation,
  signIn,
  signOut,
  type SignedInUser,
} from '../helpers/db';
import { jsonRequest, rawRequest, readJson } from '../helpers/http';
import type { ApiResponse } from '@/types';

let user: SignedInUser;

const PASSWORD = 'password123';

beforeEach(async () => {
  await resetDatabase();
  user = await signIn('member@example.com', 'Member');
});

const patch = (body: unknown) => patchProfile(jsonRequest('/api/profile', body, 'PATCH'));
const password = (body: unknown) => changePassword(jsonRequest('/api/profile/password', body));
const remove = (body: unknown) => deleteAccount(jsonRequest('/api/profile', body, 'DELETE'));

async function data<T>(response: Response): Promise<T> {
  const body = await readJson<ApiResponse<T>>(response);
  if (!body.success) throw new Error(body.error);
  return body.data;
}

describe('GET /api/profile', () => {
  it('answers 401 for an anonymous visitor', async () => {
    signOut();
    const response = await getProfile();

    expect(response.status).toBe(401);
    expect(await readJson(response)).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns the account, never the password hash', async () => {
    const profile = await data<ProfilePayload>(await getProfile());

    expect(profile.email).toBe('member@example.com');
    expect(profile.name).toBe('Member');
    expect(JSON.stringify(profile)).not.toContain('$2a$');
    expect(profile).not.toHaveProperty('passwordHash');
  });

  it('reports no preference until one is set', async () => {
    const profile = await data<ProfilePayload>(await getProfile());

    expect(profile.preferredIndustry).toBe('');
    expect(profile.preferredDifficulty).toBe('');
    expect(profile.preferredCompanySize).toBe('');
  });

  it('counts what deleting the account would take with it', async () => {
    await seedCompletedSimulation(user.id);
    const active = await seedCompletedSimulation(user.id);
    await prisma.simulation.update({ where: { id: active.id }, data: { status: 'active' } });
    await prisma.achievement.create({ data: { simulationId: active.id, type: 'crisis_manager' } });

    const profile = await data<ProfilePayload>(await getProfile());
    expect(profile.stats).toEqual({
      simulations: 2,
      completedRuns: 1,
      achievements: 1,
      templates: 0,
    });
  });

  it('counts only the caller own rows', async () => {
    const other = await prisma.user.create({
      data: { email: 'other@example.com', passwordHash: 'x' },
    });
    await seedCompletedSimulation(other.id);

    expect((await data<ProfilePayload>(await getProfile())).stats.simulations).toBe(0);
  });
});

describe('PATCH /api/profile', () => {
  it('answers 401 for an anonymous visitor', async () => {
    signOut();
    expect((await patch({ name: 'Hacker' })).status).toBe(401);
  });

  it('changes the display name', async () => {
    const response = await patch({ name: 'New Name' });

    expect(response.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe('New Name');
  });

  it('moves the name into the session, so the header follows', async () => {
    await patch({ name: 'Renamed' });

    const identity = await readJson<{ name: string }>(await me());
    expect(identity.name).toBe('Renamed');
  });

  it('trims the name', async () => {
    await patch({ name: '  Spaced  ' });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe('Spaced');
  });

  it('clears the name back to anonymous when an empty one is sent', async () => {
    await patch({ name: '' });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBeNull();
  });

  it('stores the simulation preferences', async () => {
    const response = await patch({
      name: 'Member',
      preferredIndustry: 'SaaS',
      preferredDifficulty: 'Hard',
      preferredCompanySize: 'Medium',
    });

    expect(await data<Record<string, string>>(response)).toMatchObject({
      preferredIndustry: 'SaaS',
      preferredDifficulty: 'Hard',
      preferredCompanySize: 'Medium',
    });
  });

  it('accepts an empty preference, which means no preference', async () => {
    await patch({ preferredIndustry: 'SaaS' });
    await patch({ preferredIndustry: '' });

    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).preferredIndustry
    ).toBe('');
  });

  it('answers 400 for a preference outside the supported list', async () => {
    const response = await patch({ preferredIndustry: 'Aerospace' });

    expect(response.status).toBe(400);
    expect(await readJson(response)).toMatchObject({ success: false, error: 'Invalid input' });
  });

  it('answers 400 for a name past the limit', async () => {
    expect((await patch({ name: 'x'.repeat(200) })).status).toBe(400);
  });

  it('answers 400 for a body that is not JSON', async () => {
    const response = await patchProfile(rawRequest('/api/profile', 'not json', 'PATCH'));
    expect(response.status).toBe(400);
  });

  it('cannot touch another account', async () => {
    const other = await prisma.user.create({
      data: { email: 'other@example.com', passwordHash: 'x', name: 'Theirs' },
    });

    await patch({ name: 'Mine' });

    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).name).toBe('Theirs');
  });
});

describe('POST /api/profile/password', () => {
  const change = (overrides: Record<string, string> = {}) =>
    password({
      currentPassword: PASSWORD,
      newPassword: 'a-much-longer-secret',
      confirmPassword: 'a-much-longer-secret',
      ...overrides,
    });

  it('answers 401 for an anonymous visitor', async () => {
    signOut();
    expect((await change()).status).toBe(401);
  });

  it('changes the password when the current one is right', async () => {
    const response = await change();
    expect(response.status).toBe(200);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await bcrypt.compare('a-much-longer-secret', stored.passwordHash)).toBe(true);
  });

  it('no longer accepts the old password', async () => {
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash;
    await change();
    const after = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash;

    expect(after).not.toBe(before);
    expect(await bcrypt.compare(PASSWORD, after)).toBe(false);
  });

  it('stores a hash, never the password itself', async () => {
    await change();
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });

    expect(stored.passwordHash).not.toContain('a-much-longer-secret');
    expect(stored.passwordHash.startsWith('$2')).toBe(true);
  });

  it('refuses when the current password is wrong, and changes nothing', async () => {
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash;
    const response = await change({ currentPassword: 'not-the-password' });

    expect(response.status).toBe(400);
    expect(await readJson(response)).toEqual({
      success: false,
      error: 'That password is not correct',
    });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash).toBe(
      before
    );
  });

  it('refuses when the confirmation does not match', async () => {
    const response = await change({ confirmPassword: 'something-else' });

    expect(response.status).toBe(400);
    expect(await bcrypt.compare(PASSWORD, (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash)).toBe(true);
  });

  it('refuses a new password that is too short', async () => {
    expect(
      (await change({ newPassword: 'abc', confirmPassword: 'abc' })).status
    ).toBe(400);
  });

  it('refuses a new password identical to the current one', async () => {
    const response = await change({
      newPassword: PASSWORD,
      confirmPassword: PASSWORD,
    });

    expect(response.status).toBe(400);
  });

  it('leaves the session signed in, since the owner just proved who they are', async () => {
    await change();
    expect((await me()).status).toBe(200);
  });
});

describe('DELETE /api/profile', () => {
  const confirmDelete = (overrides: Record<string, string> = {}) =>
    remove({ password: PASSWORD, confirm: DELETE_CONFIRMATION, ...overrides });

  it('answers 401 for an anonymous visitor', async () => {
    signOut();
    expect((await confirmDelete()).status).toBe(401);
    expect(await prisma.user.count()).toBe(1);
  });

  it('deletes the account', async () => {
    const response = await confirmDelete();

    expect(response.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
  });

  it('takes every simulation, turn, achievement and label with it', async () => {
    const sim = await seedCompletedSimulation(user.id, { turnsCompleted: 3 });
    await prisma.achievement.create({ data: { simulationId: sim.id, type: 'crisis_manager' } });
    await prisma.runTag.create({ data: { simulationId: sim.id, label: 'practice' } });
    await prisma.scenarioTemplate.create({
      data: {
        userId: user.id,
        name: 'Preset',
        industry: 'Retail',
        difficulty: 'Medium',
        companySize: 'Small',
      },
    });

    await confirmDelete();

    expect(await prisma.simulation.count()).toBe(0);
    expect(await prisma.turn.count()).toBe(0);
    expect(await prisma.achievement.count()).toBe(0);
    expect(await prisma.runTag.count()).toBe(0);
    expect(await prisma.scenarioTemplate.count()).toBe(0);
  });

  it('leaves another account and its runs untouched', async () => {
    const other = await prisma.user.create({
      data: { email: 'other@example.com', passwordHash: 'x' },
    });
    await seedCompletedSimulation(other.id, { turnsCompleted: 2 });

    await confirmDelete();

    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.simulation.count({ where: { userId: other.id } })).toBe(1);
    expect(await prisma.turn.count()).toBe(2);
  });

  it('ends the session', async () => {
    await confirmDelete();
    expect((await me()).status).toBe(401);
  });

  it('refuses without the right password, and deletes nothing', async () => {
    await seedCompletedSimulation(user.id);
    const response = await confirmDelete({ password: 'wrong' });

    expect(response.status).toBe(400);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.simulation.count()).toBe(1);
  });

  it('refuses without the typed confirmation', async () => {
    expect((await confirmDelete({ confirm: 'delete' })).status).toBe(400);
    expect((await remove({ password: PASSWORD })).status).toBe(400);
    expect(await prisma.user.count()).toBe(1);
  });
});
