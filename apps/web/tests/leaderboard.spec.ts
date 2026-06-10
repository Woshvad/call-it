/**
 * Leaderboard Playwright tests — Plan 07-05 Task 1 (UI-12/13, D-06)
 * Updated in lockstep for Phase 09.2 plan 04 (prototype design adoption, D-15).
 *
 * Strategy: Tier-1 (static source assertions) — always run.
 *           Tier-2 (browser tests) — skipped without PLAYWRIGHT_BASE_URL.
 *
 * Tier-1 verifies:
 *   1. leaderboard/page.tsx is a Server Component (no 'use client') using getLeaderboard.
 *   2. leaderboard-client.ts exports getLeaderboard, sorts Profile.globalRep, and does
 *      NOT depend on the unpopulated LeaderboardEntry entity (D-06).
 *   3. The viewer-row highlight uses an accent left border + #1A1A24 bg (UI-13).
 *   4. The #1 Hero has the accent Card border + a low-opacity "01" watermark (UI-12).
 *   5. The D-06 v1-limitation note (All-time data only) is present.
 *   6. Prototype page header renders; dead prototype controls are CUT (D-08).
 *   7. D-27 — no Subgraph Studio key in the leaderboard sources.
 *   8. No CSS grid in the leaderboard sources (flexbox only).
 *   9. Prototype markup contract: .brutal-table + .your-row-tint + watermark/numeral
 *      clamps; no-source stats are hidden, never faked (D-07).
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

test.describe('LEADERBOARD: source assertions (Tier-1)', () => {
  test('Test 1: leaderboard/page.tsx is a Server Component using getLeaderboard', () => {
    const source = readFile('app/leaderboard/page.tsx');
    const lines = source.split('\n');
    const firstContentLine = lines.find(
      (l) =>
        l.trim().length > 0 &&
        !l.startsWith('//') &&
        !l.startsWith('*') &&
        !l.startsWith('/*'),
    );
    expect(firstContentLine).not.toBe("'use client'");
    expect(firstContentLine).not.toBe('"use client"');
    expect(source).toContain('getLeaderboard');
  });

  test('Test 2: leaderboard-client.ts exports getLeaderboard, sorts globalRep, no LeaderboardEntry (D-06)', () => {
    const source = readFile('lib/leaderboard-client.ts');
    expect(source).toContain('export async function getLeaderboard');
    expect(source).toContain('globalRep');
    expect(source).toContain('orderBy: globalRep');
    // D-06: must NOT query the unpopulated LeaderboardEntry entity. (The doc comment
    // may NAME the entity to explain the deliberate non-dependency — what matters is
    // that no GraphQL query selects it.)
    expect(source).not.toMatch(/leaderboardEntr(y|ies)\s*\(/i);
    expect(source).not.toContain('leaderboardEntries(');
  });

  test('Test 3: viewer-row highlight uses accent left border + #1A1A24 bg (UI-13)', () => {
    const source = readFile('app/leaderboard/LeaderboardClient.tsx');
    expect(source).toContain('#1A1A24');
    expect(source).toMatch(/borderLeft.*ACCENT|ACCENT.*borderLeft|isViewer/);
  });

  test('Test 4: #1 Hero has accent Card border + low-opacity "01" watermark (UI-12)', () => {
    const source = readFile('app/leaderboard/LeaderboardClient.tsx');
    expect(source).toContain('<Card accent');
    expect(source).toContain('01');
    expect(source).toContain('opacity');
  });

  test('Test 5: D-06 v1-limitation note for windowed data is present', () => {
    const source = readFile('app/leaderboard/LeaderboardClient.tsx');
    expect(source.toLowerCase()).toContain('v1 limitation');
  });

  test('Test 6: prototype page header renders; dead controls are CUT (D-08)', () => {
    // Updated in lockstep with the 09.2-04 prototype port (D-15 — updated, never
    // deleted): the 7D/30D/ALL-TIME period toggles never refetched (data is All-time
    // only, D-06) and the category chips never filtered the rows — D-08 cuts both,
    // along with NEXT-10 pagination and row click navigation. This test now asserts
    // the new .page-header markup AND that the dead controls are NOT rendered.
    const source = readFile('app/leaderboard/LeaderboardClient.tsx');
    expect(source).toContain('The Tape');
    expect(source).toContain('Top of book');
    expect(source).toContain('page-header');
    // D-08: period toggle + category chip state must be gone.
    expect(source).not.toContain('setActiveWindow');
    expect(source).not.toContain('setActiveCategory');
    expect(source).not.toContain('ALL-TIME');
    expect(source).not.toContain('TIME_WINDOWS');
    expect(source).not.toContain('CATEGORY_CHIPS');
    // D-08: NEXT-10 pagination is cut.
    expect(source).not.toContain('NEXT 10');
  });

  test('Test 7: D-27 — no Subgraph Studio key in leaderboard sources', () => {
    const page = readFile('app/leaderboard/page.tsx');
    const client = readFile('app/leaderboard/LeaderboardClient.tsx');
    const lib = readFile('lib/leaderboard-client.ts');
    for (const src of [page, client, lib]) {
      expect(src).not.toContain('SUBGRAPH_STUDIO_API_KEY');
    }
  });

  test('Test 8: no CSS grid in leaderboard sources (flexbox only)', () => {
    const client = readFile('app/leaderboard/LeaderboardClient.tsx');
    expect(client).not.toMatch(/display:\s*['"]grid['"]/);
    expect(client).not.toContain("display: 'grid'");
  });

  test('Test 9: prototype markup contract — brutal table, your-row-tint, clamps, D-07 hides', () => {
    // Added with the 09.2-04 prototype port (D-15).
    const source = readFile('app/leaderboard/LeaderboardClient.tsx');
    // New prototype recipes.
    expect(source).toContain('brutal-table');
    expect(source).toContain('your-row-tint');
    expect(source).toContain('stat-block');
    // Pinned display clamps: hero rep numeral + "01" watermark.
    expect(source).toContain('clamp(64px, 18vw, 132px)');
    expect(source).toContain('clamp(160px, 48vw, 360px)');
    // D-07: stats with no live source are HIDDEN, never faked.
    expect(source).not.toMatch(/sparkline/i);
    expect(source).not.toMatch(/calibration/i);
    expect(source).not.toMatch(/trajectory/i);
    expect(source).not.toMatch(/bestCategory/i);
    // AUTH-44: no wallet-address formatting in render paths.
    expect(source).not.toContain('address.slice');
    expect(source).not.toContain('formatAddress');
  });
});

test.describe('LEADERBOARD: browser tests (Tier-2)', () => {
  const isTier2Enabled = !!process.env['PLAYWRIGHT_BASE_URL'];

  test.beforeEach(({}, testInfo) => {
    if (!isTier2Enabled) {
      testInfo.skip();
    }
  });

  test('Tier-2: leaderboard renders title + hero + table', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/leaderboard`);
    // 09.2-04 (D-15 lockstep): the title is now a single .page-header h1
    // "The Tape · Top of book"; "Top of book" also appears in the hero overline,
    // so target the heading role to stay strict-mode safe.
    await expect(page.getByRole('heading', { name: /The Tape · Top of book/i })).toBeVisible();
  });
});
