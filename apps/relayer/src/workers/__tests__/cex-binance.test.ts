/**
 * cex-binance.test.ts — RED-gate Vitest scaffold for the Binance CEX scraper adapter.
 *
 * Spec: CALL_IT_SPEC1.md §13.6 — 8 CEX scrapers with multi-signal confirm
 * Requirements: SETTLE-23, SETTLE-24
 * Research: 04-RESEARCH.md §Adapter 7 CEX, §Pitfall 10 (selector drift), §Pitfall 19 (Innovation Zone)
 *
 * RED GATE: This file WILL fail with "Cannot find module" until Plan 04-03 creates
 *   apps/relayer/src/workers/oracle-adapters/cex/binance-scraper.ts
 * That module-not-found error is the expected Wave 0 RED gate. Do not fix the import.
 *
 * Pitfall 10 (CEX selector drift): Each exchange has an isolated scraper module.
 *   Weekly synthetic CI cron: inject known fixture, assert detection.
 * Pitfall 19 (Innovation Zone exclusion):
 *   Binance Innovation Zone / Seed Tag / Monitoring Tag posts → return false (not a standard listing).
 * Multi-signal confirm: match BOTH token symbol AND full token name in the post title.
 *
 * Uses static HTML fixture: apps/relayer/src/workers/__tests__/fixtures/binance-listing.html
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

// RED GATE: these modules do not exist yet — created in Plan 04-03
import {
  BinanceScraper,
  BinanceScraperResult,
  BinanceScraperOptions,
} from '../oracle-adapters/cex/binance-scraper.js'; // <-- RED GATE: module does not exist yet

// Load the static HTML fixture for tests
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_PATH = join(__dirname, 'fixtures', 'binance-listing.html');
const fixtureHtml = readFileSync(FIXTURE_PATH, 'utf-8');

describe('BinanceScraper', () => {
  let scraper: BinanceScraper;

  const DEFAULT_OPTIONS: BinanceScraperOptions = {
    // testWithFixture: inject static HTML instead of launching Playwright
    testWithFixture: true,
    fixtureHtml,
    // Lookback window for listing detection (24h from expiry)
    lookbackHours: 24,
  };

  beforeEach(() => {
    scraper = new BinanceScraper(DEFAULT_OPTIONS);
  });

  /**
   * testDetectsListing (Pitfall 10):
   * Static HTML fixture contains a standard listing post for "TokenX (TKX)".
   * Scraper must detect it and return true.
   */
  it('detects TokenX (TKX) listing in fixture (Pitfall 10 weekly synthetic test)', async () => {
    const result: BinanceScraperResult = await scraper.detectListing({
      tokenSymbol: 'TKX',
      tokenName: 'TokenX',
      expiryTimestamp: Math.floor(Date.now() / 1000),
    });

    expect(result.detected).toBe(true);
    expect(result.matchedTitle).toContain('TokenX');
    expect(result.matchedTitle).toContain('TKX');
  });

  /**
   * testInnovationZoneExclusion (Pitfall 19):
   * A listing post with "Innovation Zone" in the title should return false.
   * Binance Innovation Zone is a sub-tier listing, NOT a standard listing.
   * Same exclusion applies to "Seed Tag" and "Monitoring Tag".
   */
  it('excludes Innovation Zone listing from detection (Pitfall 19)', async () => {
    // SomeCoin (SMC) appears in the fixture but is listed in "Innovation Zone"
    const result: BinanceScraperResult = await scraper.detectListing({
      tokenSymbol: 'SMC',
      tokenName: 'SomeCoin',
      expiryTimestamp: Math.floor(Date.now() / 1000),
    });

    expect(result.detected).toBe(false);
    expect(result.exclusionReason).toContain('Innovation Zone');
  });

  /**
   * testMultiSignalConfirm:
   * A post that contains the symbol (TKX) but NOT the full name (TokenX)
   * must return false. Multi-signal confirm requires BOTH symbol AND name.
   *
   * Prevents false positives from ambiguous post titles like "TKX Trading Competition".
   */
  it('returns false when only symbol matches without full token name (multi-signal confirm)', async () => {
    // "TKX Trading Competition" contains symbol TKX but not "TokenX" full name
    const result: BinanceScraperResult = await scraper.detectListing({
      tokenSymbol: 'TKX',
      tokenName: 'TokenXWithLongNameNotInFixture', // Different name → no full-name match
      expiryTimestamp: Math.floor(Date.now() / 1000),
    });

    // Symbol matches but full name doesn't → should NOT detect
    // (The trading competition post has TKX but not "TokenXWithLongNameNotInFixture")
    expect(result.detected).toBe(false);
  });
});
