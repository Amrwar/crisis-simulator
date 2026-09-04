import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/**
 * Runs once, before any test file, in the vitest main process: derives the
 * SQLite test schema, generates its Prisma client and creates an empty
 * database. Running it as a child process keeps the Prisma CLI's own module
 * graph out of the test workers.
 */
export function setup(): void {
  execFileSync(process.execPath, [path.join(root, 'scripts', 'prepare-test-db.mjs')], {
    cwd: root,
    stdio: 'inherit',
  });
}
