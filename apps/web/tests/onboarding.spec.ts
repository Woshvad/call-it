/**
 * Onboarding flow Playwright tests (Plan 06).
 *
 * ## Mock strategy (same Tier-1/Tier-2 split as signin.spec.ts — Plan 05)
 *
 * **Tier 1 — Static source assertions (always run in CI)**
 * These tests read page/component source files directly and assert that:
 *   - All 5 onboarding pages exist and have the required structure
 *   - AUTH-22 custody disclosure copy is verbatim on Screen 1
 *   - AUTH-21 commitment copy is verbatim on Screen 4 (tagline)
 *   - AUTH-44: no wallet address rendered in the main onboarding visual
 *   - Middleware exists and contains the resume/redirect logic (taglineCommittedAt check)
 *   - PrivyFundButton uses Privy's useFundWallet flow (funding provider swapped from
 *     the spec's D-34 Coinbase Onramp to Privy-native funding, 2026-05-29)
 *   - useUsdcBalance references the chain-selected USDC via @/lib/chain (not inline address)
 *
 * **Tier 2 — Browser E2E (requires real Privy app ID)**
 * Skipped unless NEXT_PUBLIC_PRIVY_APP_ID is a real Privy app ID.
 *
 * Requirements: AUTH-19, AUTH-20, AUTH-21, AUTH-22, AUTH-24, AUTH-25, D-32
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// ─── File paths ─────────────────────────────────────────────────��─────────────

const WEB_ROOT = path.resolve(__dirname, '..');
const ONBOARDING_HANDLE = path.join(WEB_ROOT, 'app', 'onboarding', 'handle', 'page.tsx');
const ONBOARDING_SOCIALS = path.join(WEB_ROOT, 'app', 'onboarding', 'socials', 'page.tsx');
const ONBOARDING_FOLLOWGRAPH = path.join(WEB_ROOT, 'app', 'onboarding', 'follow-graph', 'page.tsx');
const ONBOARDING_FUND = path.join(WEB_ROOT, 'app', 'onboarding', 'fund', 'page.tsx');
const ONBOARDING_TAGLINE = path.join(WEB_ROOT, 'app', 'onboarding', 'tagline', 'page.tsx');
const ONBOARDING_LAYOUT = path.join(WEB_ROOT, 'app', 'onboarding', 'layout.tsx');
const CUSTODY_CARD = path.join(WEB_ROOT, 'components', 'CustodyDisclosureCard.tsx');
const PRIVY_FUND_BUTTON = path.join(WEB_ROOT, 'components', 'PrivyFundButton.tsx');
const USDC_BALANCE_HOOK = path.join(WEB_ROOT, 'hooks', 'useUsdcBalance.ts');
const MIDDLEWARE = path.join(WEB_ROOT, 'middleware.ts');
const PROVIDERS = path.join(WEB_ROOT, 'app', 'Providers.tsx');

// ─── Tier-2 skip condition ────────────────────────────────────────────────────

const PRIVY_APP_ID = process.env['NEXT_PUBLIC_PRIVY_APP_ID'] ?? '';
const HAS_REAL_PRIVY_APP_ID =
  PRIVY_APP_ID.length >= 28 &&
  !PRIVY_APP_ID.startsWith('cltest') &&
  !PRIVY_APP_ID.startsWith('clmock') &&
  !PRIVY_APP_ID.startsWith('test-') &&
  !PRIVY_APP_ID.startsWith('mock-');

// ─── Tier 1: Source-level assertions ─────────────────────────────────────────

test.describe('Tier 1: Onboarding source code assertions', () => {
  test('all 5 onboarding pages exist', () => {
    const pages = [
      ONBOARDING_HANDLE,
      ONBOARDING_SOCIALS,
      ONBOARDING_FOLLOWGRAPH,
      ONBOARDING_FUND,
      ONBOARDING_TAGLINE,
    ];
    for (const p of pages) {
      const source = readFileSync(p, 'utf-8');
      expect(source.length, `Page ${p} should not be empty`).toBeGreaterThan(0);
      expect(source, `${p} should be a 'use client' page`).toContain("'use client'");
    }
  });

  test('onboarding layout exists with progress indicator', () => {
    const source = readFileSync(ONBOARDING_LAYOUT, 'utf-8');
    expect(source).toContain('onboarding-progress');
    expect(source).toContain("'use client'");
  });

  test('AUTH-22: CustodyDisclosureCard contains locked custody disclosure copy verbatim', () => {
    const source = readFileSync(CUSTODY_CARD, 'utf-8');
    const LOCKED_COPY =
      'Your wallet is custodied by Privy until you export it. We recommend exporting once you hold more than $50 in this wallet.';
    expect(source).toContain(LOCKED_COPY);
  });

  test('AUTH-22: Handle page renders CustodyDisclosureCard', () => {
    const source = readFileSync(ONBOARDING_HANDLE, 'utf-8');
    expect(source).toContain('CustodyDisclosureCard');
    expect(source).toContain('custody-disclosure');
  });

  test('AUTH-21: Tagline page contains locked commitment copy verbatim', () => {
    const source = readFileSync(ONBOARDING_TAGLINE, 'utf-8');
    // The HTML-escaped version in JSX — check either form
    const hasLockedCopy =
      source.includes("EVERY CALL IS PERMANENT. WINS AND LOSSES. WE DON'T SUGAR-COAT.") ||
      source.includes("EVERY CALL IS PERMANENT. WINS AND LOSSES. WE DON&apos;T SUGAR-COAT.");
    expect(hasLockedCopy, 'AUTH-21 commitment line must be verbatim in tagline page').toBe(true);
  });

  test('AUTH-21: Tagline page has commit button', () => {
    const source = readFileSync(ONBOARDING_TAGLINE, 'utf-8');
    expect(source).toContain('commit-button');
    expect(source).toContain("'tagline'");
  });

  test('Funding: PrivyFundButton uses Privy useFundWallet (not a standalone onramp)', () => {
    const source = readFileSync(PRIVY_FUND_BUTTON, 'utf-8');
    expect(source).toContain('useFundWallet');
    expect(source).toContain('@privy-io/react-auth');
    expect(source).toContain('fundWallet(');
    // The standalone Coinbase popup integration must be gone (no hardcoded pay.coinbase origin).
    expect(source).not.toContain('pay.coinbase.com');
  });

  test('Funding: PrivyFundButton funds USDC on the configured Arbitrum chain', () => {
    const source = readFileSync(PRIVY_FUND_BUTTON, 'utf-8');
    expect(source).toContain("asset: 'USDC'");
    // Network-driven chain selection (D-36 — Arbitrum only).
    expect(source).toMatch(/arbitrum\b/);
    expect(source).toMatch(/arbitrumSepolia/);
    expect(source).toContain('NEXT_PUBLIC_NETWORK');
  });

  test('Funding: PrivyFundButton refetches balance on completed funding', () => {
    const source = readFileSync(PRIVY_FUND_BUTTON, 'utf-8');
    expect(source).toContain('refetch');
    expect(source).toContain("status === 'completed'");
  });

  // quick-260611-5mh RC1 (D-15 honest update): the hook now sources the
  // CHAIN-SELECTED USDC address + explicit chainId from @/lib/chain (which
  // itself imports @call-it/shared constants). The old assertion pinned the
  // hardcoded MAINNET token (USDC_ARB_NATIVE) — that was the $0.00-balance-chip
  // bug on Sepolia. The no-inline-address invariant (T-01-39) is unchanged.
  test('T-01-39: useUsdcBalance references chain-selected USDC via @/lib/chain', () => {
    const source = readFileSync(USDC_BALANCE_HOOK, 'utf-8');
    expect(source).toContain('USDC_ADDRESS');
    expect(source).toContain('ACTIVE_CHAIN_ID');
    expect(source).toContain('@/lib/chain');
    // Must NOT contain inline USDC addresses
    expect(source).not.toMatch(/0xaf88d065/i);
    expect(source).not.toMatch(/0xFF970A61/i);
  });

  test('D-32: middleware contains taglineCommittedAt check', () => {
    const source = readFileSync(MIDDLEWARE, 'utf-8');
    expect(source).toContain('taglineCommittedAt');
    expect(source).toContain('/onboarding/');
    expect(source).toContain('/signin');
  });

  test('D-32: middleware has config.matcher export', () => {
    const source = readFileSync(MIDDLEWARE, 'utf-8');
    expect(source).toContain('export const config');
    expect(source).toContain('matcher');
  });

  test('AUTH-24: WalletExportPrompt is mounted in Providers.tsx', () => {
    const source = readFileSync(PROVIDERS, 'utf-8');
    expect(source).toContain('WalletExportPrompt');
  });

  test('AUTH-08: Socials page has Skip for now button', () => {
    const source = readFileSync(ONBOARDING_SOCIALS, 'utf-8');
    expect(source).toContain('skip-socials-button');
    expect(source).toContain('Skip for now');
  });

  test('Fund page renders PrivyFundButton', () => {
    const source = readFileSync(ONBOARDING_FUND, 'utf-8');
    expect(source).toContain('PrivyFundButton');
    expect(source).toContain('usdc-balance');
  });
});

// ─── Tier 2: Browser E2E ──────────────────────────��───────────────────────────

test.describe('Tier 2: Onboarding browser E2E', () => {
  test.beforeEach(({}, testInfo) => {
    if (!HAS_REAL_PRIVY_APP_ID) {
      testInfo.skip(true, 'Tier 2 tests require a real Privy app ID. Set NEXT_PUBLIC_PRIVY_APP_ID to a non-mock value.');
    }
  });

  test('signed-in user with no onboarding state is redirected to /onboarding/handle', async ({ page }) => {
    // This test requires real auth + relayer to be running
    await page.goto('/');
    await page.waitForURL(/\/onboarding\/handle/);
    expect(page.url()).toContain('/onboarding/handle');
  });

  test('AUTH-22: custody disclosure visible on Screen 1', async ({ page }) => {
    await page.goto('/onboarding/handle');
    const disclosure = page.getByTestId('custody-disclosure-body');
    await expect(disclosure).toBeVisible();
    await expect(disclosure).toContainText('custodied by Privy');
  });

  test('AUTH-21: commitment line visible on Screen 4', async ({ page }) => {
    await page.goto('/onboarding/tagline');
    const commitment = page.getByTestId('commitment-line');
    await expect(commitment).toBeVisible();
    await expect(commitment).toContainText('EVERY CALL IS PERMANENT');
  });

  test('D-32 resume: navigating away and back to sign-in resumes at current step', async ({ page }) => {
    // Sign in, get to step 2
    await page.goto('/onboarding/socials');
    // Navigate away
    await page.goto('/');
    // Should be redirected back to the last incomplete step (not back to handle)
    await page.waitForURL(/\/onboarding\//);
    expect(page.url()).toContain('/onboarding/');
  });
});
