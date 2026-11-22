import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    // Node's built-in SQLite powers the repository integration tests.
    pool: 'forks',
    // A shared PostgreSQL database can't be reset by several files at once.
    fileParallelism: !process.env.TEST_DATABASE_URL,
  },
});
