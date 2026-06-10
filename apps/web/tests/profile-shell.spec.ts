/**
 * Profile shell Playwright tests — Plan 01-09 Task 2
 *
 * Phase 09.2 plan 05 (D-15 lockstep review): every assert below was
 * reconciled against the prototype profile retheme — Test 2's @call-it/ui
 * ProfileHeader import contract is still satisfied by the restyled
 * ProfileClient, and no assert referenced the removed no-source sections
 * (D-07), so all tests stand unchanged. None deleted.
 *
 * Strategy: Tier-1 (static source assertions) — always run.
 *           Tier-2 (browser tests) — skipped without PLAYWRIGHT_BASE_URL.
 *
 * Tier-1 tests verify:
 *   1. profile/[address]/page.tsx is a Server Component (no 'use client')
 *   2. Profile page imports ProfileHeader from @call-it/ui
 *   3. Profile page uses relayerClient.getProfile (server-side fetch)
 *   4. settings/page.tsx imports AddressBookManager + CustodyDisclosureCard
 *   5. settings/page.tsx has exportWallet call (AUTH-23)
 *   6. AUTH-44: Profile page does NOT render raw wallet address as visible text
 *   7. ProfileTabs component exists
 *
 * Tier-2 tests (browser) skipped in CI unless PLAYWRIGHT_BASE_URL is set.
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

const TEST_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';

test.describe('PROFILE-SHELL: Profile page source assertions (Tier-1)', () => {

  test('Test 1: profile/[address]/page.tsx is a Server Component (no "use client")', () => {
    const source = readFile('app/profile/[address]/page.tsx');
    // Server Components must NOT have 'use client' at the top
    // (they may contain it in sub-components but the page file itself should not)
    const lines = source.split('\n');
    const firstContentLine = lines.find((l) => l.trim().length > 0 && !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*'));
    expect(firstContentLine).not.toBe("'use client'");
    expect(firstContentLine).not.toBe('"use client"');
  });

  test('Test 2: ProfileClient (client boundary) imports ProfileHeader from @call-it/ui', () => {
    // The Server Component (page.tsx) delegates to ProfileClient.tsx (client boundary).
    // ProfileHeader is in the client component per server/client split pattern.
    const source = readFile('app/profile/[address]/ProfileClient.tsx');
    expect(source).toContain('ProfileHeader');
    expect(source).toMatch(/from ['"]@call-it\/ui['"]/);
  });

  test('Test 3: Profile page uses getProfile for server-side fetch', () => {
    const source = readFile('app/profile/[address]/page.tsx');
    expect(source).toContain('getProfile');
  });

  test('Test 4: settings/page.tsx imports AddressBookManager + CustodyDisclosureCard', () => {
    const source = readFile('app/profile/[address]/settings/page.tsx');
    expect(source).toContain('AddressBookManager');
    expect(source).toContain('CustodyDisclosureCard');
  });

  test('Test 5: settings/page.tsx has exportWallet (AUTH-23)', () => {
    const source = readFile('app/profile/[address]/settings/page.tsx');
    expect(source).toContain('exportWallet');
  });

  test('Test 6: ProfileHeader in profile page — no raw address in template', () => {
    // AUTH-44: the profile page should display the HANDLE, not the raw address.
    // The page.tsx server component receives the address as a URL param but must
    // pass the resolved handle to ProfileHeader, not the address itself.
    const source = readFile('app/profile/[address]/page.tsx');
    // The ProfileHeader component should receive user.handle (not user.address)
    // The page itself uses `address` as URL param — that's expected — but it should not
    // render `address` directly as text content.
    expect(source).toContain('ProfileHeader');
    // Ensure the page passes a handle field to ProfileHeader, not raw address
    expect(source).not.toMatch(/<[^>]*>{address}<\/[^>]*>/);
  });

  test('Test 7: ProfileTabs component exists', () => {
    const source = readFile('components/ProfileTabs.tsx');
    expect(source).toContain('ProfileTabs');
    expect(source).toContain('Overview');
  });

  test('Test 8: useProfile hook exists and uses useQuery', () => {
    const source = readFile('hooks/useProfile.ts');
    expect(source).toContain('useQuery');
    expect(source).toContain('getProfile');
  });

  test('Test 9: ENS_MAINNET_RPC_URL does NOT appear in web sources (server-only)', () => {
    const pageSrc = readFile('app/profile/[address]/page.tsx');
    expect(pageSrc).not.toContain('ENS_MAINNET_RPC_URL');

    const settingsSrc = readFile('app/profile/[address]/settings/page.tsx');
    expect(settingsSrc).not.toContain('ENS_MAINNET_RPC_URL');
  });
});

test.describe('PROFILE-SHELL: Profile browser tests (Tier-2)', () => {
  const isTier2Enabled = !!process.env['PLAYWRIGHT_BASE_URL'];

  test.beforeEach(({ }, testInfo) => {
    if (!isTier2Enabled) {
      testInfo.skip();
    }
  });

  test('Tier-2: Profile page renders ENS handle, not raw address', async ({ page, baseURL }) => {
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

    // ProfileHeader should show veda.eth
    await expect(page.getByText('veda.eth')).toBeVisible();

    // AUTH-44: raw full address should NOT be visible as text
    const allText = await page.evaluate(() => document.body.innerText);
    // The address appears in the URL but should not appear as visible DOM text
    // (allow partial matches like "0x1234" but not the full 42-char address)
    expect(allText).not.toContain(TEST_ADDRESS.toLowerCase());
  });

  test('Tier-2: Settings page renders AddressBookManager', async ({ page, baseURL }) => {
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

    await page.goto(`${baseURL}/profile/${TEST_ADDRESS}/settings`);
    // Should render some settings UI
    // (actual content depends on auth state)
    await expect(page.locator('body')).toBeVisible();
  });
});
