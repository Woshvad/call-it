/**
 * WalletExportPrompt Playwright tests (Plan 06).
 *
 * ## Mock strategy (Tier-1/Tier-2)
 *
 * **Tier 1 — Static source assertions (always run)**
 * Verify the WalletExportPrompt component has the correct structure:
 *   - $50 threshold = 50_000_000n (6-decimal USDC)
 *   - Toast message contains "over $50" copy
 *   - Action button labeled "Export" calls exportWallet()
 *   - localStorage flag prevents spam (STORAGE_KEY usage)
 *   - 30000ms duration
 *
 * **Tier 2 — Browser E2E with mocked balance (requires real Privy)**
 * Mocks the USDC balance RPC call via `page.route()` to return 51 USDC.
 * Asserts the export toast appears with the Export button.
 *
 * Requirements: AUTH-23, AUTH-24, T-01-38
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const WEB_ROOT = path.resolve(__dirname, '..');
const EXPORT_PROMPT = path.join(WEB_ROOT, 'components', 'WalletExportPrompt.tsx');
const USDC_BALANCE_HOOK = path.join(WEB_ROOT, 'hooks', 'useUsdcBalance.ts');

// Tier-2 skip condition
const PRIVY_APP_ID = process.env['NEXT_PUBLIC_PRIVY_APP_ID'] ?? '';
const HAS_REAL_PRIVY_APP_ID =
  PRIVY_APP_ID.length >= 28 &&
  !PRIVY_APP_ID.startsWith('cltest') &&
  !PRIVY_APP_ID.startsWith('clmock') &&
  !PRIVY_APP_ID.startsWith('test-') &&
  !PRIVY_APP_ID.startsWith('mock-');

// ─── Tier 1: Source-level assertions ─────────────────────────────────────────

test.describe('Tier 1: WalletExportPrompt source assertions', () => {
  test('AUTH-24: threshold is 50_000_000n (6-decimal $50 USDC)', () => {
    const source = readFileSync(EXPORT_PROMPT, 'utf-8');
    expect(source).toContain('50_000_000n');
  });

  test('AUTH-24: toast message contains "over $50" copy', () => {
    const source = readFileSync(EXPORT_PROMPT, 'utf-8');
    expect(source).toContain('over $50');
    expect(source).toContain('Export it to self-custody');
  });

  test('AUTH-24: action button is labeled "Export" and calls exportWallet()', () => {
    const source = readFileSync(EXPORT_PROMPT, 'utf-8');
    expect(source).toContain("label: 'Export'");
    expect(source).toContain('exportWallet');
  });

  test('T-01-38: localStorage flag prevents spam (STORAGE_KEY)', () => {
    const source = readFileSync(EXPORT_PROMPT, 'utf-8');
    expect(source).toContain('STORAGE_KEY');
    expect(source).toContain('localStorage');
  });

  test('AUTH-24: toast duration is 30000ms (30 seconds)', () => {
    const source = readFileSync(EXPORT_PROMPT, 'utf-8');
    expect(source).toContain('30000');
  });

  test('useUsdcBalance has 5000ms polling interval', () => {
    const source = readFileSync(USDC_BALANCE_HOOK, 'utf-8');
    expect(source).toContain('refetchInterval: 5000');
  });

  test('useUsdcBalance subscribes to Transfer events (AUTH-26)', () => {
    const source = readFileSync(USDC_BALANCE_HOOK, 'utf-8');
    expect(source).toContain('useWatchContractEvent');
    expect(source).toContain("eventName: 'Transfer'");
  });

  test('useUsdcBalance has enabled guard preventing null subscription (T-01-40)', () => {
    const source = readFileSync(USDC_BALANCE_HOOK, 'utf-8');
    expect(source).toContain('enabled: !!address');
  });
});

// ─── Tier 2: Browser E2E ─────────────────────────────────────��───────────────

test.describe('Tier 2: WalletExportPrompt browser E2E', () => {
  test.beforeEach(({}, testInfo) => {
    if (!HAS_REAL_PRIVY_APP_ID) {
      testInfo.skip(true, 'Tier 2 tests require a real Privy app ID. Set NEXT_PUBLIC_PRIVY_APP_ID to a non-mock value.');
    }
  });

  test('mock USDC balance $51 triggers export toast with Export button', async ({ page }) => {
    // Mock eth_call for USDC balanceOf to return 51,000,000 (51 USDC in 6 decimals)
    // 51_000_000 in hex = 0x309F070 = 51000000
    const mockBalanceHex = '0x' + BigInt(51_000_000).toString(16).padStart(64, '0');

    await page.route('**/eth_call*', async (route) => {
      const req = route.request();
      const postData = req.postData();

      if (postData && postData.includes('balanceOf')) {
        // Return mocked USDC balance
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 1, jsonrpc: '2.0', result: mockBalanceHex }),
        });
      } else {
        await route.continue();
      }
    });

    // Clear the localStorage flag to ensure toast fires
    await page.addInitScript(() => {
      localStorage.removeItem('call_it_export_prompt_fired');
    });

    await page.goto('/');

    // Wait for the export toast to appear
    const toast = page.locator('[data-toast-status="info"]');
    await expect(toast).toBeVisible({ timeout: 10000 });
    await expect(toast).toContainText('over $50');

    // Export action button should be clickable
    const exportButton = page.locator('[data-toast-action]');
    await expect(exportButton).toBeVisible();
    await expect(exportButton).toContainText('Export');
  });
});
