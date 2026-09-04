import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { deriveSqliteSchema } from '../../scripts/prepare-test-db.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const productionSchema = fs.readFileSync(path.join(root, 'prisma', 'schema.prisma'), 'utf8');

/**
 * The suite runs on SQLite while the deployed app runs on PostgreSQL. That is
 * only safe if the SQLite schema is derived from the production one rather
 * than maintained by hand, and if deriving it never touches the file the app
 * and `prisma generate` actually use.
 */
describe('test schema derivation', () => {
  const derived = deriveSqliteSchema(productionSchema);

  it('leaves the production schema on PostgreSQL', () => {
    expect(productionSchema).toContain('provider  = "postgresql"');
    expect(productionSchema).toContain('env("DATABASE_URL")');
    expect(productionSchema).toContain('directUrl');
  });

  it('switches the derived datasource to sqlite', () => {
    expect(derived).toContain('provider = "sqlite"');
    expect(derived).not.toContain('postgresql');
  });

  it('points the derived datasource at a test-only connection string', () => {
    expect(derived).toContain('env("TEST_DATABASE_URL")');
    expect(derived).not.toContain('env("DATABASE_URL")');
    expect(derived).not.toContain('DIRECT_URL');
  });

  it('emits the derived client somewhere of its own', () => {
    expect(derived).toContain('.prisma-test-client');
  });

  it('drops the PostgreSQL-only native type attributes', () => {
    expect(productionSchema).toContain('@db.Text');
    expect(derived).not.toContain('@db.');
  });

  it('keeps every model, with the same fields', () => {
    const models = (schema: string) => (schema.match(/^model\s+(\w+)/gm) ?? []).sort();
    expect(models(derived)).toEqual(models(productionSchema));
    expect(models(derived)).toHaveLength(4);

    const fields = (schema: string) =>
      (schema.match(/^\s{2}\w+\s+\w+/gm) ?? []).map((line) => line.trim().split(/\s+/)[0]);
    expect(fields(derived).length).toBe(fields(productionSchema).length);
  });

  it('refuses to produce a schema it could not fully convert', () => {
    expect(() => deriveSqliteSchema('model User {\n  id String @id\n}\n')).toThrow(
      /datasource was not switched to sqlite/
    );
  });
});
