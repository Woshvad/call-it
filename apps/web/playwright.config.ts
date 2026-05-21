import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for OG image route tests.
 *
 * Test suites:
 *   - og-fallback.spec.ts: SHARE-09 Fallback card layout, cache headers, visual snapshot
 *   - og-fallback-routing.spec.ts: SHARE-10 catch-all routes to Fallback on unknown callId
 *   - og-fallback-bench.spec.ts: SHARE-11 warm render p95 < 100ms over 100 requests
 *
 * Requires: `pnpm --filter @call-it/web dev` running OR webServer auto-start.
 * Set PLAYWRIGHT_BASE_URL env var to override (e.g., for CI against deployed Vercel preview).
 */
export default defineConfig({
  testDir: './tests',
  testMatch: ['**/*.spec.ts'],
  fullyParallel: false,  // OG bench tests must run sequentially for accurate timing
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env['PLAYWRIGHT_BASE_URL']
    ? undefined
    : {
        command: 'pnpm dev',
        port: 3000,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
