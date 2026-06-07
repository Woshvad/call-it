/**
 * receipt-meta.spec.ts — SHARE-14 / SHARE-21 (Plan 07-06 Task 1)
 *
 * Asserts the receipt page (`/call/[id]`) share loop:
 *   - SHARE-14: the server-rendered `og:image` references `/og/{id}?v=` (the
 *     statusVersion cache-buster, D-09) and a `twitter:card` meta is present.
 *   - SHARE-21: the receipt route is in the middleware PUBLIC_PREFIXES carve-out
 *     so an UNAUTHENTICATED (incognito, no Privy session cookie) visitor gets a
 *     200 — NOT a bounce to /signin. The new `/leaderboard` route is also covered.
 *
 * Strategy mirrors og-fallback.spec.ts + profile-shell.spec.ts:
 *   - Tier-1 (static source assertions) — ALWAYS run. These are the authoritative
 *     CI gate for this plan: they prove generateMetadata injects `?v={statusVersion}`
 *     and that middleware.ts carves out /call + /leaderboard, with NO live infra.
 *   - Tier-2 (browser, incognito public-load) — SKIPPED unless PLAYWRIGHT_BASE_URL
 *     points at a deployed (or locally-served + mocked-relayer) origin. The live
 *     200-no-auth load is the operator's post-deploy gate (Task 2), so it is
 *     env-gated here rather than fabricated.
 *
 * Run with: pnpm --filter @call-it/web exec playwright test receipt-meta.spec.ts
 */

import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const WEB_ROOT = join(process.cwd());

function readFile(relativePath: string): string {
  const fullPath = join(WEB_ROOT, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`File not found: ${fullPath}`);
  }
  return readFileSync(fullPath, 'utf-8');
}

// A representative receipt id for the Tier-2 incognito load.
const SAMPLE_CALL_ID = process.env['RECEIPT_TEST_CALL_ID'] ?? '1';

test.describe('RECEIPT-META: server-render og:image + public carve-out (Tier-1)', () => {
  test('Test 1 (SHARE-14): generateMetadata injects /og/{id}?v={statusVersion} cache-buster', () => {
    const source = readFile('app/call/[id]/layout.tsx');
    // The OG image URL must be the /og/{id} route with the ?v= cache-buster.
    expect(source).toContain('generateMetadata');
    expect(source).toMatch(/\/og\/\$\{id\}\?v=\$\{statusVersion\}/);
    // statusVersion must be derived from live-state (D-09), not hardcoded.
    expect(source).toContain('statusVersion');
  });

  test('Test 2 (SHARE-14): twitter:card summary_large_image is declared', () => {
    const source = readFile('app/call/[id]/layout.tsx');
    // Next.js Metadata maps `twitter.card` -> <meta name="twitter:card">.
    expect(source).toMatch(/card:\s*['"]summary_large_image['"]/);
    // The og:image and twitter image both reference the cache-busted OG URL.
    expect(source).toContain('ogImageUrl');
  });

  test('Test 3 (SHARE-14): openGraph image is 1200x630 (SHARE-01 dimension contract)', () => {
    const source = readFile('app/call/[id]/layout.tsx');
    expect(source).toMatch(/width:\s*1200/);
    expect(source).toMatch(/height:\s*630/);
  });

  test('Test 4 (SHARE-21): /call is in middleware PUBLIC_PREFIXES (no-auth receipt)', () => {
    const source = readFile('middleware.ts');
    // The receipt prefix must be carved out so logged-out visitors are not bounced.
    expect(source).toMatch(/PUBLIC_PREFIXES\s*=\s*\[/);
    expect(source).toMatch(/['"]\/call['"]/);
  });

  test('Test 5 (SHARE-21): /leaderboard (new route) is in middleware PUBLIC_PREFIXES', () => {
    const source = readFile('middleware.ts');
    expect(source).toMatch(/['"]\/leaderboard['"]/);
  });

  test('Test 6 (SHARE-21): /profile and /duel public read surfaces are carved out', () => {
    const source = readFile('middleware.ts');
    expect(source).toMatch(/['"]\/profile['"]/);
    expect(source).toMatch(/['"]\/duel['"]/);
  });
});

test.describe('RECEIPT-META: incognito public load + live meta (Tier-2, env-gated)', () => {
  const isTier2Enabled = !!process.env['PLAYWRIGHT_BASE_URL'];

  test.beforeEach(({ }, testInfo) => {
    if (!isTier2Enabled) {
      // The live 200-no-auth load needs a deployed origin (Task 2, operator-gated).
      // Skipping here keeps the CI gate to the Tier-1 source assertions; the live
      // assertion is NOT fabricated as passing.
      testInfo.skip();
    }
  });

  test('Tier-2 (SHARE-21): receipt loads 200 with NO Privy session cookie (incognito)', async ({ browser, baseURL }) => {
    // A fresh context with no cookies models an unauthenticated visitor.
    const context = await browser.newContext();
    const page = await context.newPage();
    const response = await page.goto(`${baseURL}/call/${SAMPLE_CALL_ID}`, {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(200);
    // Must NOT have been redirected to /signin.
    expect(page.url()).not.toContain('/signin');
    await context.close();
  });

  test('Tier-2 (SHARE-14): rendered og:image meta references /og/{id}?v=', async ({ browser, baseURL }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${baseURL}/call/${SAMPLE_CALL_ID}`, { waitUntil: 'domcontentloaded' });

    const ogImage = await page
      .locator('meta[property="og:image"]')
      .first()
      .getAttribute('content');
    expect(ogImage).toBeTruthy();
    expect(ogImage).toContain(`/og/${SAMPLE_CALL_ID}`);
    expect(ogImage).toContain('?v=');

    const twitterCard = await page
      .locator('meta[name="twitter:card"]')
      .first()
      .getAttribute('content');
    expect(twitterCard).toBe('summary_large_image');
    await context.close();
  });

  test('Tier-2 (SHARE-21): /leaderboard loads 200 with no auth (incognito)', async ({ browser, baseURL }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const response = await page.goto(`${baseURL}/leaderboard`, {
      waitUntil: 'domcontentloaded',
    });
    expect(response?.status()).toBe(200);
    expect(page.url()).not.toContain('/signin');
    await context.close();
  });
});
