/**
 * Prepares an isolated SQLite database for the automated test suite.
 *
 * The production datasource (prisma/schema.prisma) stays untouched: it remains
 * PostgreSQL and is what `prisma generate`, `prisma migrate` and the deployed
 * app use. For tests we derive a second schema from it, mechanically, so the
 * two can never drift:
 *
 *   1. the datasource provider becomes `sqlite`, pointed at a throwaway file;
 *   2. PostgreSQL-only native type attributes (`@db.Text`, ...) are dropped;
 *   3. the client is emitted to its own output directory so it does not clash
 *      with the PostgreSQL client used by the app.
 *
 * The derived schema, the generated client and the database file are all
 * disposable build artefacts and are never committed.
 *
 * Run directly (`node scripts/prepare-test-db.mjs`) or via `npm run test:db`.
 * The vitest global setup invokes it automatically before any test runs.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const SOURCE_SCHEMA = path.join(ROOT, 'prisma', 'schema.prisma');
const TEST_DIR = path.join(ROOT, 'prisma', '.test');
const TEST_SCHEMA = path.join(TEST_DIR, 'schema.prisma');
const STAMP_FILE = path.join(TEST_DIR, '.generated');

/** Where the SQLite Prisma client is emitted, relative to the derived schema. */
export const TEST_CLIENT_RELATIVE = '../../node_modules/.prisma-test-client';
export const TEST_CLIENT_DIR = path.join(ROOT, 'node_modules', '.prisma-test-client');

/** SQLite connection string, resolved by Prisma relative to the schema file. */
export const TEST_DATABASE_URL = 'file:./test.db';
export const TEST_DATABASE_FILE = path.join(TEST_DIR, 'test.db');

/**
 * Rewrite the production schema into an equivalent SQLite schema.
 * Exported so the transform itself can be unit tested.
 */
export function deriveSqliteSchema(source) {
  let out = source;

  out = out.replace(
    /datasource\s+db\s*\{[\s\S]*?\n\}/,
    ['datasource db {', '  provider = "sqlite"', '  url      = env("TEST_DATABASE_URL")', '}'].join(
      '\n'
    )
  );

  out = out.replace(
    /generator\s+client\s*\{[\s\S]*?\n\}/,
    [
      'generator client {',
      '  provider = "prisma-client-js"',
      `  output   = "${TEST_CLIENT_RELATIVE}"`,
      '}',
    ].join('\n')
  );

  // Native database type attributes are PostgreSQL-specific and are rejected by
  // the SQLite connector. The underlying Prisma scalar type is unchanged.
  out = out.replace(/[ \t]*@db\.[A-Za-z]+(\([^)]*\))?/g, '');

  const problems = [];
  if (!/provider\s*=\s*"sqlite"/.test(out)) problems.push('datasource was not switched to sqlite');
  if (/postgresql/.test(out)) problems.push('a postgresql reference survived the rewrite');
  if (/@db\./.test(out)) problems.push('a native type attribute survived the rewrite');
  if (/directUrl/.test(out)) problems.push('directUrl survived the rewrite');

  const models = (s) => (s.match(/^model\s+\w+/gm) ?? []).map((m) => m.split(/\s+/)[1]).sort();
  const before = models(source);
  const after = models(out);
  if (before.join(',') !== after.join(',')) {
    problems.push(`model list changed: ${before.join(',')} -> ${after.join(',')}`);
  }

  if (problems.length > 0) {
    throw new Error(`Could not derive a SQLite test schema: ${problems.join('; ')}`);
  }

  return out;
}

function runPrisma(args) {
  execFileSync(process.execPath, [path.join(ROOT, 'node_modules', 'prisma', 'build', 'index.js'), ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, TEST_DATABASE_URL, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
  });
}

/**
 * Derive the schema, generate the SQLite client and create an empty database.
 * The client is regenerated only when the derived schema actually changed.
 */
export function prepareTestDatabase({ force = false } = {}) {
  const source = fs.readFileSync(SOURCE_SCHEMA, 'utf8');
  const derived = deriveSqliteSchema(source);
  const hash = createHash('sha256').update(derived).digest('hex');

  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.writeFileSync(TEST_SCHEMA, derived);

  const stamped = fs.existsSync(STAMP_FILE) ? fs.readFileSync(STAMP_FILE, 'utf8').trim() : '';
  const clientPresent = fs.existsSync(path.join(TEST_CLIENT_DIR, 'index.js'));
  const needsGenerate = force || !clientPresent || stamped !== hash;

  if (needsGenerate) {
    runPrisma(['generate', '--schema', TEST_SCHEMA]);
  }

  // Always start from an empty database so a run never inherits stale rows.
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const file = `${TEST_DATABASE_FILE}${suffix}`;
    if (fs.existsSync(file)) fs.rmSync(file);
  }
  runPrisma(['db', 'push', '--schema', TEST_SCHEMA, '--skip-generate']);

  fs.writeFileSync(STAMP_FILE, hash);

  return { schema: TEST_SCHEMA, client: TEST_CLIENT_DIR, database: TEST_DATABASE_FILE };
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const result = prepareTestDatabase({ force: process.argv.includes('--force') });
  process.stdout.write(`test database ready at ${path.relative(ROOT, result.database)}\n`);
}
