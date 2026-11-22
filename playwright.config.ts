import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests build and run the production server against a fresh SQLite
 * database with no login. Locally you can reuse an installed Chrome with
 * PW_CHANNEL=chrome; CI installs Playwright's Chromium.
 */
const PORT = Number(process.env.E2E_PORT ?? 3300);
const db = `${process.cwd()}/data/e2e-${process.pid}.db`;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    channel: process.env.PW_CHANNEL || undefined,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL || undefined },
    },
  ],
  webServer: {
    command: 'bun run build:server && bun run start',
    url: `http://127.0.0.1:${PORT}/api/health/`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      AUTH_MODE: 'none',
      DATABASE_URL: `sqlite:${db}`,
      STORAGE_DIR: `${process.cwd()}/data/e2e-media`,
      PORT: String(PORT),
      HOSTNAME: '127.0.0.1',
    },
  },
});
