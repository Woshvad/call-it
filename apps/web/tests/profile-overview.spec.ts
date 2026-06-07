/**
 * Profile Overview tab Playwright tests — Plan 07-05 Task 1 (UI-09)
 *
 * Strategy: Tier-1 (static source assertions) — always run.
 *           Tier-2 (browser tests) — skipped without PLAYWRIGHT_BASE_URL.
 *
 * Tier-1 verifies the Overview tab (UI-SPEC §Profile Overview) renders from
 * @call-it/ui primitives:
 *   1. ProfileClient imports @call-it/ui primitives (Card / CallCard / ProfileHeader).
 *   2. The 5 named stats render: Accuracy / Calibration / ROI / Contrarian hits / Streak.
 *   3. The section headings render: CATEGORY REPUTATION / RECENT CALLS / MOST FOLLOWED BY /
 *      NOTABLE RECEIPTS.
 *   4. Every list defines its empty-state copy (UI-SPEC empty-states table).
 *   5. No CSS grid (flexbox only, Pitfall 15).
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
    expect(source).toContain('CallCard');
  });

  test('Test 2: the 5 named stats render', () => {
    const source = readFile(SRC);
    expect(source).toContain('Accuracy');
    expect(source).toContain('Calibration');
    expect(source).toContain('ROI');
    expect(source).toContain('Contrarian hits');
    expect(source).toContain('Streak');
  });

  test('Test 3: the Overview section headings render', () => {
    const source = readFile(SRC);
    expect(source).toContain('CATEGORY REPUTATION');
    expect(source).toContain('RECENT CALLS');
    expect(source).toContain('MOST FOLLOWED BY');
    expect(source).toContain('NOTABLE RECEIPTS');
  });

  test('Test 4: empty-state copy is present for the lists', () => {
    const source = readFile(SRC);
    expect(source).toContain('No calls yet');
    expect(source).toContain('No followers yet');
    expect(source).toContain('No receipts yet');
  });

  test('Test 5: no CSS grid (flexbox only)', () => {
    const source = readFile(SRC);
    expect(source).not.toMatch(/display:\s*['"]grid['"]/);
    expect(source).not.toContain("display: 'grid'");
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

  test('Tier-2: Overview tab renders the 5-stat row + section headings', async ({ page, baseURL }) => {
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
    await expect(page.getByText('Accuracy')).toBeVisible();
    await expect(page.getByText('CATEGORY REPUTATION')).toBeVisible();
    await expect(page.getByText('RECENT CALLS')).toBeVisible();
  });
});
