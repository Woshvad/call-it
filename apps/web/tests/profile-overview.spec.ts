/**
 * Profile Overview Playwright tests — Plan 07-05 Task 1 (UI-09),
 * lockstep-updated for the Phase 09.2 plan 05 prototype retheme (D-15).
 *
 * Strategy: Tier-1 (static source assertions) — always run.
 *           Tier-2 (browser tests) — skipped without PLAYWRIGHT_BASE_URL.
 *
 * Tier-1 verifies the restyled profile renders from @call-it/ui primitives
 * and honors D-07 (data with no live source is HIDDEN, never faked):
 *   1. ProfileClient imports @call-it/ui primitives (ProfileHeader / Card).
 *   2. Real-source stats render: Accuracy / W/L record / Streak / Calls.
 *   3. No-source stat blocks are ABSENT (D-07) — the old em-dash stubs are gone.
 *   4. RECENT CALLS section renders; removed no-source sections are ABSENT.
 *   5. Honest empty state replaces the old list copy; the fake fill bars are gone.
 *   6. No CSS grid (flexbox only, Pitfall 15).
 *   7. Prototype markup contract: hero clamp, primitive classes, AUTH-44.
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

const SRC = 'app/profile/[address]/ProfileClient.tsx';

test.describe('PROFILE-OVERVIEW: source assertions (Tier-1)', () => {
  test('Test 1: ProfileClient imports @call-it/ui primitives', () => {
    const source = readFile(SRC);
    expect(source).toMatch(/from ['"]@call-it\/ui['"]/);
    expect(source).toContain('ProfileHeader');
    expect(source).toContain('Card');
    // CallCard left the file with the always-empty RECENT CALLS list — the
    // list is now an honest empty state (D-07); the import assert tracks the
    // markup it serves (D-15: updated in lockstep, not deleted).
    expect(source).not.toContain('CallCard');
  });

  test('Test 2: real-source stats render (D-07: only stats with live data)', () => {
    const source = readFile(SRC);
    expect(source).toContain('Accuracy');
    expect(source).toContain('W/L record');
    expect(source).toContain('Streak');
    expect(source).toContain('Calls');
    expect(source).toContain('Global reputation');
  });

  test('Test 3: no-source stat blocks are ABSENT (D-07: hidden, never faked)', () => {
    // These stats have no relayer source — the old markup rendered em-dash
    // stubs for them. D-07: they are now hidden entirely, not faked.
    const source = readFile(SRC);
    expect(source).not.toMatch(/calibration/i);
    expect(source).not.toMatch(/roi/i);
    expect(source).not.toMatch(/contrarian hits/i);
    expect(source).not.toMatch(/sparkline/i);
  });

  test('Test 4: RECENT CALLS renders; removed no-source sections are ABSENT (D-07)', () => {
    const source = readFile(SRC);
    expect(source).toContain('RECENT CALLS');
    // The category bars were HARDCODED fake data (the one active D-07
    // violation); followers + receipts showcases had no source. All removed.
    expect(source).not.toContain('CATEGORY REPUTATION');
    expect(source).not.toContain('MOST FOLLOWED BY');
    expect(source).not.toContain('NOTABLE RECEIPTS');
  });

  test('Test 5: honest empty state present; fake fill bars gone (D-07)', () => {
    const source = readFile(SRC);
    expect(source).toContain('No calls on record yet.');
    // The fake category bars rendered a hardcoded 60% width — gone for good.
    expect(source).not.toMatch(/width:\s*['"]60%['"]/);
  });

  test('Test 6: no CSS grid (flexbox only)', () => {
    const source = readFile(SRC);
    expect(source).not.toMatch(/display:\s*['"]grid['"]/);
    expect(source).not.toContain("display: 'grid'");
  });

  test('Test 7: prototype markup contract (hero clamp, primitives, AUTH-44)', () => {
    const source = readFile(SRC);
    // Hero rep numeral display clamp (prototype hero recipe)
    expect(source).toContain('clamp(64px, 18vw, 132px)');
    // Primitive class recipes from the 09.2-01 token layer
    expect(source).toContain('stat-block');
    expect(source).toContain('section-divider');
    expect(source).toContain('label-overline');
    // AUTH-44 (T-09.2-12): no address formatting anywhere in the renderer —
    // the address prop is a lookup key only and is never rendered.
    expect(source).not.toMatch(/address\.slice|formatAddress/);
  });
});

test.describe('PROFILE-OVERVIEW: browser tests (Tier-2)', () => {
  const isTier2Enabled = !!process.env['PLAYWRIGHT_BASE_URL'];
  const TEST_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';

  test.beforeEach(({}, testInfo) => {
    if (!isTier2Enabled) {
      testInfo.skip();
    }
  });

  test('Tier-2: profile renders real stats + RECENT CALLS empty state', async ({ page, baseURL }) => {
    await page.route(`**/api/profile/${TEST_ADDRESS}`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          address: TEST_ADDRESS,
          handle: 'veda.eth',
          source: 'ens',
          displayHandle: '',
          ensName: 'veda.eth',
          twitterHandle: null,
          farcasterHandle: null,
          totalCalls: 12,
          settledCalls: 5,
          wins: 3,
          losses: 2,
          streak: 1,
          globalRep: 100,
          verifiedX: false,
          verifiedFc: false,
        }),
      });
    });

    await page.goto(`${baseURL}/profile/${TEST_ADDRESS}`);
    // Profile data is fetched in the Server Component — the page.route mock
    // above never intercepts that request. Against a local server the SSR
    // fetch degrades to the error banner (bounded 8s timeout), so skip unless
    // real profile data rendered (deployed env with a resolvable address).
    if ((await page.getByText('load the tape').count()) > 0) {
      test.skip(true, 'SSR profile fetch not mockable via page.route — needs deployed env with resolvable address');
    }
    await expect(page.getByText('Accuracy')).toBeVisible();
    await expect(page.getByText('RECENT CALLS')).toBeVisible();
    await expect(page.getByText('No calls on record yet.')).toBeVisible();
    // D-07: removed no-source sections must not render
    await expect(page.getByText('CATEGORY REPUTATION')).toHaveCount(0);
  });
});
