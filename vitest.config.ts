import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

/**
 * The app is generated against PostgreSQL; the suite runs against a disposable
 * SQLite database with a client of its own (see scripts/prepare-test-db.mjs).
 * Aliasing `@prisma/client` here lets `src/lib/db.ts` stay exactly as shipped
 * while every query in a test lands in the throwaway file.
 */
const testPrismaClient = path.join(root, 'node_modules', '.prisma-test-client');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@prisma\/client$/, replacement: testPrismaClient },
      { find: /^@\//, replacement: `${path.join(root, 'src')}/` },
    ],
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    globalSetup: ['tests/global-setup.ts'],
    setupFiles: ['tests/setup-env.ts'],
    // Every suite shares one SQLite file, so test files must not overlap.
    fileParallelism: false,
    restoreMocks: true,
    testTimeout: 20_000,
  },
});
