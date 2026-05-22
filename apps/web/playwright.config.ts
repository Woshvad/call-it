import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for all web e2e tests.
 *
 * Test suites:
 *   - og-fallback.spec.ts: SHARE-09 Fallback card layout, cache headers, visual snapshot
 *   - og-fallback-routing.spec.ts: SHARE-10 catch-all routes to Fallback on unknown callId
 *   - og-fallback-bench.spec.ts: SHARE-11 warm render p95 < 100ms over 100 requests
 *   - signin.spec.ts: AUTH-01..04 sign-in flow (Connect Wallet, Google, Twitter) — Plan 05
 *
 * The webServer uses `pnpm start` (production build) for Playwright tests.
 * CI workflow: builds first (`pnpm build`) then runs `playwright test`.
 * NEXT_PUBLIC_* env vars are baked in at build time.
 *
 * Set PLAYWRIGHT_BASE_URL to skip webServer and point at a deployed URL.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: ['**/*.spec.ts'],
  fullyParallel: false,  // OG bench tests must run sequentially for accurate timing
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
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
        // Use `next start` (production server) for Playwright tests.
        // Requires a prior `pnpm build --webpack` (or `pnpm build` which uses --webpack flag).
        // CI workflow: build first, then playwright test.
        // Dev: run `pnpm build` before `playwright test` locally.
        command: 'pnpm start',
        port: 3000,
        reuseExistingServer: !process.env['CI'],
        timeout: 30_000,
      },
});
