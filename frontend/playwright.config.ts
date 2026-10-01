import { defineConfig, devices } from '@playwright/test';

/**
 * Phase 5 browser E2E skeleton — no live runs by default.
 * - testDir e2e/, baseURL http://localhost:5173
 * - webServer boots Vite dev (frontend `npm run dev`) for local runs.
 * - Every spec self-skips unless E2E_BASE_URL is set, so CI unit stays green.
 * - Synthetic data only: never real emails, never prod. See docs/E2E.md.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
