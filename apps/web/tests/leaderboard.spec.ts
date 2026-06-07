/**
 * Leaderboard Playwright tests — Plan 07-05 Task 1 (UI-12/13, D-06)
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
 *   5. The D-06 v1-limitation note for 7d/30d is present.
 *   6. Title "The Tape" + "Top of book", the 7D/30D/ALL-TIME toggle, the category chips.
 *   7. D-27 — no Subgraph Studio key in the leaderboard sources.
 *   8. No CSS grid in the leaderboard sources (flexbox only).
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

  test('Test 6: title, time toggle, and category chips render', () => {
    const source = readFile('app/leaderboard/LeaderboardClient.tsx');
    expect(source).toContain('The Tape');
    expect(source).toContain('Top of book');
    expect(source).toContain('ALL-TIME');
    expect(source).toContain('7D');
    expect(source).toContain('30D');
    expect(source).toContain('Majors');
    expect(source).toContain('DeFi');
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
    await expect(page.getByText('The Tape')).toBeVisible();
    await expect(page.getByText('Top of book')).toBeVisible();
  });
});
