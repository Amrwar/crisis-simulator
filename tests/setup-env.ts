import { vi } from 'vitest';

import { installNetworkGuard } from './helpers/network-guard';

// Must be set before `src/lib/db.ts` constructs its Prisma client, and before
// iron-session validates the session password length. These are throwaway test
// values: no real credential is read or needed anywhere in the suite.
process.env.TEST_DATABASE_URL ??= 'file:./test.db';
process.env.SESSION_SECRET ??= 'test-session-secret-value-at-least-32-characters-long';

installNetworkGuard();

// `cookies()` only exists inside a Next.js request scope. Handing the app an
// in-memory jar lets the real iron-session encryption run against a store the
// test controls.
vi.mock('next/headers', async () => {
  const { activeCookieJar } = await import('./helpers/cookie-jar');
  return {
    cookies: () => activeCookieJar(),
  };
});
