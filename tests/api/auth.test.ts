import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as me } from '@/app/api/auth/me/route';
import { POST as register } from '@/app/api/auth/register/route';
import { prisma } from '@/lib/db';
import { createCookieJar, useCookieJar, type CookieJar } from '../helpers/cookie-jar';
import { resetDatabase } from '../helpers/db';
import { jsonRequest, rawRequest, readJson } from '../helpers/http';

const COOKIE_NAME = 'crisis-sim-session';

let jar: CookieJar;

beforeEach(async () => {
  await resetDatabase();
  jar = useCookieJar(createCookieJar());
});

describe('POST /api/auth/register', () => {
  it('creates the account and signs the new user in', async () => {
    const response = await register(
      jsonRequest('/api/auth/register', {
        email: 'nour@example.com',
        password: 'sup3rsecret',
        name: 'Nour',
      })
    );

    expect(response.status).toBe(200);
    const body = await readJson<{ id: string; email: string; name: string | null }>(response);
    expect(body.email).toBe('nour@example.com');
    expect(body.name).toBe('Nour');
    expect(body.id).toBeTruthy();

    const stored = await prisma.user.findUnique({ where: { email: 'nour@example.com' } });
    expect(stored).not.toBeNull();
    expect(jar.raw(COOKIE_NAME)).toBeTruthy();
  });

  it('never returns or stores the password', async () => {
    const response = await register(
      jsonRequest('/api/auth/register', { email: 'nour@example.com', password: 'sup3rsecret' })
    );
    const body = await readJson(response);
    expect(JSON.stringify(body)).not.toContain('sup3rsecret');

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'nour@example.com' } });
    expect(stored.passwordHash).not.toBe('sup3rsecret');
    expect(await bcrypt.compare('sup3rsecret', stored.passwordHash)).toBe(true);
  });

  it('stores a null name when none is supplied', async () => {
    await register(
      jsonRequest('/api/auth/register', { email: 'anon@example.com', password: 'sup3rsecret' })
    );
    const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'anon@example.com' } });
    expect(stored.name).toBeNull();
  });

  it('answers 409 when the email is already registered', async () => {
    await register(
      jsonRequest('/api/auth/register', { email: 'dup@example.com', password: 'sup3rsecret' })
    );
    const second = await register(
      jsonRequest('/api/auth/register', { email: 'dup@example.com', password: 'different1' })
    );

    expect(second.status).toBe(409);
    expect(await readJson<{ error: string }>(second)).toEqual({ error: 'Email already registered' });
    expect(await prisma.user.count({ where: { email: 'dup@example.com' } })).toBe(1);
  });

  it('answers 400 for a malformed email', async () => {
    const response = await register(
      jsonRequest('/api/auth/register', { email: 'not-an-email', password: 'sup3rsecret' })
    );
    expect(response.status).toBe(400);
    expect(await prisma.user.count()).toBe(0);
  });

  it('answers 400 for a password shorter than six characters', async () => {
    const response = await register(
      jsonRequest('/api/auth/register', { email: 'short@example.com', password: '12345' })
    );
    expect(response.status).toBe(400);
    const body = await readJson<{ error: string; details: unknown }>(response);
    expect(body.error).toBe('Invalid input');
    expect(JSON.stringify(body.details)).toContain('at least 6 characters');
    expect(await prisma.user.count()).toBe(0);
  });

  it('answers 400 for a one-character name', async () => {
    const response = await register(
      jsonRequest('/api/auth/register', { email: 'x@example.com', password: 'sup3rsecret', name: 'A' })
    );
    expect(response.status).toBe(400);
  });

  it('answers 500 rather than crashing on a body that is not JSON', async () => {
    const response = await register(rawRequest('/api/auth/register', 'not json at all'));
    expect(response.status).toBe(500);
    expect(await readJson<{ error: string }>(response)).toEqual({ error: 'Internal server error' });
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await register(
      jsonRequest('/api/auth/register', {
        email: 'omar@example.com',
        password: 'sup3rsecret',
        name: 'Omar',
      })
    );
    jar = useCookieJar(createCookieJar());
  });

  it('signs in with the right credentials', async () => {
    const response = await login(
      jsonRequest('/api/auth/login', { email: 'omar@example.com', password: 'sup3rsecret' })
    );

    expect(response.status).toBe(200);
    const body = await readJson<{ email: string; name: string }>(response);
    expect(body.email).toBe('omar@example.com');
    expect(body.name).toBe('Omar');
    expect(jar.raw(COOKIE_NAME)).toBeTruthy();
  });

  it('answers 401 for the wrong password and leaves no session behind', async () => {
    const response = await login(
      jsonRequest('/api/auth/login', { email: 'omar@example.com', password: 'wrong-password' })
    );

    expect(response.status).toBe(401);
    expect(await readJson<{ error: string }>(response)).toEqual({
      error: 'Invalid email or password',
    });
    expect(jar.raw(COOKIE_NAME)).toBeUndefined();
  });

  it('answers 401 for an unknown account', async () => {
    const response = await login(
      jsonRequest('/api/auth/login', { email: 'nobody@example.com', password: 'sup3rsecret' })
    );
    expect(response.status).toBe(401);
  });

  it('does not reveal whether the email exists', async () => {
    const unknown = await login(
      jsonRequest('/api/auth/login', { email: 'nobody@example.com', password: 'sup3rsecret' })
    );
    const wrongPassword = await login(
      jsonRequest('/api/auth/login', { email: 'omar@example.com', password: 'wrong-password' })
    );

    expect(unknown.status).toBe(wrongPassword.status);
    expect(await readJson(unknown)).toEqual(await readJson(wrongPassword));
  });

  it('answers 400 for a malformed request', async () => {
    const response = await login(
      jsonRequest('/api/auth/login', { email: 'not-an-email', password: 'sup3rsecret' })
    );
    expect(response.status).toBe(400);
    expect(await readJson<{ error: string }>(response)).toEqual({ error: 'Invalid input' });
  });

  it('answers 400 for an empty password', async () => {
    const response = await login(
      jsonRequest('/api/auth/login', { email: 'omar@example.com', password: '' })
    );
    expect(response.status).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  it('answers 401 for an anonymous visitor', async () => {
    const response = await me();
    expect(response.status).toBe(401);
    expect(await readJson<{ error: string }>(response)).toEqual({ error: 'Not authenticated' });
  });

  it('returns the signed-in identity', async () => {
    const created = await register(
      jsonRequest('/api/auth/register', {
        email: 'hana@example.com',
        password: 'sup3rsecret',
        name: 'Hana',
      })
    );
    const { id } = await readJson<{ id: string }>(created);

    const response = await me();
    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({
      userId: id,
      email: 'hana@example.com',
      name: 'Hana',
    });
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the session so the next request is anonymous again', async () => {
    await register(
      jsonRequest('/api/auth/register', { email: 'bye@example.com', password: 'sup3rsecret' })
    );
    expect((await me()).status).toBe(200);

    const response = await logout();
    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ ok: true });
    expect(jar.raw(COOKIE_NAME)).toBe('');
    expect((await me()).status).toBe(401);
  });

  it('is safe to call without a session', async () => {
    const response = await logout();
    expect(response.status).toBe(200);
    expect(await readJson(response)).toEqual({ ok: true });
  });
});
