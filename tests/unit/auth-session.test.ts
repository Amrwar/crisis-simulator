import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { getSession, requireAuth } from '@/lib/auth';
import { createCookieJar, useCookieJar, type CookieJar } from '../helpers/cookie-jar';
import { NETWORK_BLOCKED_MESSAGE } from '../helpers/network-guard';

const COOKIE_NAME = 'crisis-sim-session';

describe('password hashing', () => {
  it('verifies a password against its own hash', async () => {
    const hash = await bcrypt.hash('correct horse battery', 12);
    expect(await bcrypt.compare('correct horse battery', hash)).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await bcrypt.hash('correct horse battery', 12);
    expect(await bcrypt.compare('correct horse batteries', hash)).toBe(false);
    expect(await bcrypt.compare('', hash)).toBe(false);
  });

  it('never stores the password in the clear', async () => {
    const hash = await bcrypt.hash('cairo-2026', 12);
    expect(hash).not.toContain('cairo-2026');
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
  });

  it('salts, so the same password hashes differently every time', async () => {
    const first = await bcrypt.hash('same-password', 12);
    const second = await bcrypt.hash('same-password', 12);
    expect(first).not.toBe(second);
    expect(await bcrypt.compare('same-password', first)).toBe(true);
    expect(await bcrypt.compare('same-password', second)).toBe(true);
  });

  it('treats passwords as case sensitive', async () => {
    const hash = await bcrypt.hash('Ramses', 12);
    expect(await bcrypt.compare('ramses', hash)).toBe(false);
  });
});

describe('session helpers', () => {
  let jar: CookieJar;

  beforeEach(() => {
    jar = useCookieJar(createCookieJar());
  });

  it('starts empty when the request carries no cookie', async () => {
    const session = await getSession();
    expect(session.userId).toBeUndefined();
    expect(session.email).toBeUndefined();
  });

  it('round-trips the signed-in identity through the cookie', async () => {
    const session = await getSession();
    session.userId = 'user-1';
    session.email = 'hana@example.com';
    session.name = 'Hana';
    await session.save();

    const restored = await getSession();
    expect(restored.userId).toBe('user-1');
    expect(restored.email).toBe('hana@example.com');
    expect(restored.name).toBe('Hana');
  });

  it('does not write the identity into the cookie in readable form', async () => {
    const session = await getSession();
    session.userId = 'user-1';
    session.email = 'hana@example.com';
    await session.save();

    const cookie = jar.raw(COOKIE_NAME);
    expect(cookie).toBeTruthy();
    expect(cookie).not.toContain('hana@example.com');
    expect(cookie).not.toContain('user-1');
  });

  it('clears the cookie on destroy', async () => {
    const session = await getSession();
    session.userId = 'user-1';
    await session.save();
    expect(jar.raw(COOKIE_NAME)).toBeTruthy();

    const live = await getSession();
    live.destroy();

    expect(jar.raw(COOKIE_NAME)).toBe('');
    expect((await getSession()).userId).toBeUndefined();
  });

  it('grants no identity when the sealed cookie has been tampered with', async () => {
    const session = await getSession();
    session.userId = 'user-1';
    session.email = 'hana@example.com';
    await session.save();
    const sealed = jar.raw(COOKIE_NAME)!;

    // Same shape, altered payload: the integrity check must reject it.
    jar.set(COOKIE_NAME, `${sealed.slice(0, -4)}0000`);
    const tampered = await getSession();
    expect(tampered.userId).toBeUndefined();
    expect(tampered.email).toBeUndefined();
    expect(await requireAuth()).toBeNull();
  });

  it('grants no identity for a cookie that is not a seal at all', async () => {
    jar.set(COOKIE_NAME, 'userId=admin');
    expect((await getSession()).userId).toBeUndefined();
    expect(await requireAuth()).toBeNull();
  });

  it('keeps sessions in separate jars independent', async () => {
    const alice = useCookieJar(createCookieJar());
    const aliceSession = await getSession();
    aliceSession.userId = 'alice';
    await aliceSession.save();

    useCookieJar(createCookieJar());
    expect((await getSession()).userId).toBeUndefined();

    useCookieJar(alice);
    expect((await getSession()).userId).toBe('alice');
  });
});

describe('requireAuth', () => {
  beforeEach(() => {
    useCookieJar(createCookieJar());
  });

  it('returns null when no session cookie is present', async () => {
    expect(await requireAuth()).toBeNull();
  });

  it('returns null for a session that carries no user id', async () => {
    const session = await getSession();
    session.email = 'ghost@example.com';
    await session.save();
    expect(await requireAuth()).toBeNull();
  });

  it('returns the session once a user id is stored', async () => {
    const session = await getSession();
    session.userId = 'user-42';
    session.email = 'omar@example.com';
    await session.save();

    const authed = await requireAuth();
    expect(authed).not.toBeNull();
    expect(authed?.userId).toBe('user-42');
    expect(authed?.email).toBe('omar@example.com');
  });
});

describe('test isolation guarantees', () => {
  it('blocks outbound network requests so no provider can be called', async () => {
    await expect(fetch('https://provider.example/v1/messages')).rejects.toThrow(
      NETWORK_BLOCKED_MESSAGE
    );
    await expect(fetch('https://provider.example/v1/completions')).rejects.toThrow(
      NETWORK_BLOCKED_MESSAGE
    );
    await expect(fetch(new URL('https://provider.example/v1/models'))).rejects.toThrow(
      NETWORK_BLOCKED_MESSAGE
    );
  });
});
