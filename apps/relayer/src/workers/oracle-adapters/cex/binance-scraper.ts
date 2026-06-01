/**
 * Binance CEX listing scraper — per-exchange modular isolation (D-02, Pitfall 10).
 *
 * Scrapes https://www.binance.com/support/announcement/new-listings for token listings.
 * - Multi-signal confirm: matches BOTH full tokenName AND tokenSymbol in post title (Pitfall 19)
 * - Innovation Zone exclusion: filters 'Innovation Zone', 'Seed Tag', 'Monitoring Tag' (Pitfall 19)
 * - testWithFixture: static HTML injection for weekly CI synthetic test (Pitfall 10)
 *
 * Per-exchange isolation: each exchange in its own file because announcement page structures
 * change without warning — isolating selectors per exchange prevents cascading failures.
 *
 * Spec: CALL_IT_SPEC1.md §13.6
 * Requirements: SETTLE-23, SETTLE-24
 */

import { getLogger } from '../../../lib/logger.js';

// ── In-file constants (Pitfall 10: isolated per-exchange) ─────────────────────

/** Binance announcement page URL */
export const ANNOUNCE_URL = 'https://www.binance.com/support/announcement/new-listings';

/**
 * Binance Innovation Zone exclusion patterns (Pitfall 19).
 * Posts containing these strings indicate non-standard listings — exclude from detection.
 */
export const EXCLUSION_PATTERNS: string[] = ['Innovation Zone', 'Seed Tag', 'Monitoring Tag'];

/** CSS selectors for announcement title extraction (Binance page structure).
 * Used as reference for Playwright page.evaluate() in the live scrape path.
 * Exported for documentation/CI reference — not currently used in the regex parser. */
export const TITLE_SELECTORS: string[] = [
  '.announcement-title',
  'h3.css-1w8xkr1',
  'h3[class*="css-"]',
  '.bn-news-title',
  '[data-testid="title"]',
  'h3',
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BinanceScraperOptions {
  /** If true, use fixtureHtml instead of launching Playwright (Pitfall 10 weekly CI) */
  testWithFixture: boolean;
  /** Static HTML to parse when testWithFixture=true */
  fixtureHtml?: string;
  /** Lookback window in hours for listing detection (default: 24) */
  lookbackHours?: number;
}

export interface BinanceScraperDetectParams {
  tokenSymbol: string;
  tokenName: string;
  expiryTimestamp: number;
}

export interface BinanceScraperResult {
  detected: boolean;
  matchedTitle?: string;
  exclusionReason?: string;
}

// ── Core detection logic (shared between live + fixture modes) ────────────────

/**
 * Extract announcement titles from HTML string.
 * Used by both the Playwright path (page HTML) and the fixture path (static HTML).
 */
function extractTitlesFromHtml(html: string): string[] {
  const titles: string[] = [];

  // Try each selector pattern with a simple regex parser
  // (No DOM in Node.js without playwright/jsdom — use regex for both paths)

  // Match h3 elements with various class patterns (Binance announcement structure)
  const h3Regex = /<h3[^>]*class="announcement-title"[^>]*>([\s\S]*?)<\/h3>/gi;
  let match;
  while ((match = h3Regex.exec(html)) !== null) {
    const text = match[1]!.replace(/<[^>]+>/g, '').trim();
    if (text) titles.push(text);
  }

  // Also try generic h3 (fixture HTML may use simpler markup)
  const genericH3 = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  while ((match = genericH3.exec(html)) !== null) {
    const text = match[1]!.replace(/<[^>]+>/g, '').trim();
    if (text && !titles.includes(text)) titles.push(text);
  }

  return titles;
}

/**
 * Check if a title matches both the token symbol AND full name (multi-signal confirm, Pitfall 19).
 * Returns true only if BOTH match — symbol-only matches are rejected.
 */
function isMultiSignalMatch(title: string, tokenSymbol: string, tokenName: string): boolean {
  const titleLower = title.toLowerCase();
  const symbolLower = tokenSymbol.toLowerCase();
  const nameLower = tokenName.toLowerCase();
  return titleLower.includes(symbolLower) && titleLower.includes(nameLower);
}

/**
 * Check if a title contains an Innovation Zone exclusion pattern (Pitfall 19).
 * Returns the matched exclusion pattern string, or null if clean.
 */
function getExclusionPattern(title: string): string | null {
  for (const pattern of EXCLUSION_PATTERNS) {
    if (title.toLowerCase().includes(pattern.toLowerCase())) {
      return pattern;
    }
  }
  return null;
}

// ── BinanceScraper class ──────────────────────────────────────────────────────

/**
 * BinanceScraper detects token listings on Binance announcement page.
 *
 * Supports two modes:
 * - testWithFixture=true: parse static HTML (weekly CI synthetic test, Pitfall 10)
 * - testWithFixture=false: launch Playwright headless Chromium
 */
export class BinanceScraper {
  private readonly options: BinanceScraperOptions;

  constructor(options: BinanceScraperOptions) {
    this.options = options;
  }

  /**
   * Detect if a token listing appeared in Binance announcements.
   *
   * @param params - tokenSymbol, tokenName, expiryTimestamp
   * @returns BinanceScraperResult with detected flag + matched/excluded details
   */
  async detectListing(params: BinanceScraperDetectParams): Promise<BinanceScraperResult> {
    const logger = getLogger();
    const { tokenSymbol, tokenName, expiryTimestamp } = params;

    logger.info(
      {
        event: 'binance_scraper_attempt',
        tokenSymbol,
        tokenName,
        expiryTimestamp,
        testWithFixture: this.options.testWithFixture,
      },
      'Binance scraper: detectListing started',
    );

    let html: string;

    if (this.options.testWithFixture) {
      // Fixture mode: use injected static HTML (Pitfall 10 weekly CI synthetic test)
      html = this.options.fixtureHtml ?? '';
    } else {
      // Live mode: Playwright headless Chromium
      html = await this.scrapeWithPlaywright();
    }

    const result = this.parseHtmlForListing(html, tokenSymbol, tokenName);

    logger.info(
      {
        event: 'binance_scraper_result',
        tokenSymbol,
        tokenName,
        detected: result.detected,
        matchedTitle: result.matchedTitle,
        exclusionReason: result.exclusionReason,
      },
      `Binance scraper result: ${result.detected ? 'FOUND' : 'NOT FOUND'}`,
    );

    return result;
  }

  /**
   * Parse HTML for a token listing (shared logic for live + fixture modes).
   */
  parseHtmlForListing(
    html: string,
    tokenSymbol: string,
    tokenName: string,
  ): BinanceScraperResult {
    const titles = extractTitlesFromHtml(html);

    for (const title of titles) {
      if (!isMultiSignalMatch(title, tokenSymbol, tokenName)) {
        continue; // Symbol-only or name-only match — reject (Pitfall 19 multi-signal)
      }

      // Multi-signal match found — check Innovation Zone exclusion
      const exclusion = getExclusionPattern(title);
      if (exclusion) {
        return {
          detected: false,
          matchedTitle: title,
          exclusionReason: exclusion,
        };
      }

      // Clean match — both symbol + name, no exclusion
      return {
        detected: true,
        matchedTitle: title,
      };
    }

    return { detected: false };
  }

  /**
   * Launch Playwright headless Chromium and return page HTML.
   * Runs only in live mode (testWithFixture=false).
   */
  private async scrapeWithPlaywright(): Promise<string> {
    const logger = getLogger();

    // Dynamic import of playwright to avoid issues in test environments
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { chromium } = await import('playwright') as any;
    let browser: { close: () => Promise<void>; newPage: () => Promise<unknown> } | undefined;

    try {
      browser = await chromium.launch({ headless: true });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const page = (await (browser as any).newPage()) as any;
      await page.goto(ANNOUNCE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      const html = await page.content();

      logger.info(
        { event: 'binance_scraper_page_loaded', url: ANNOUNCE_URL },
        'Binance announcement page loaded',
      );

      return html as string;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        { event: 'binance_scraper_playwright_error', error: message },
        'Binance Playwright scrape failed — returning empty HTML',
      );
      return '';
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}

// ── Standalone scrape function ────────────────────────────────────────────────

/**
 * Scrape Binance for a token listing.
 * Used by cex-adapter.ts in the parallel scraper pool.
 *
 * @param tokenSymbol - token ticker (e.g., 'BTC')
 * @param tokenName - full token name (e.g., 'Bitcoin')
 * @param expiryTimestamp - call expiry Unix timestamp
 * @returns true if clean listing found, false otherwise
 */
export async function scrape(
  tokenSymbol: string,
  tokenName: string,
  expiryTimestamp: number,
): Promise<boolean> {
  const scr = new BinanceScraper({ testWithFixture: false });
  const result = await scr.detectListing({ tokenSymbol, tokenName, expiryTimestamp });
  return result.detected;
}

/**
 * testWithFixture: check if static HTML contains a clean listing for the given token.
 * Used by weekly CI synthetic test (Pitfall 10, D-02).
 *
 * @param staticHtml - HTML string to parse (no browser needed)
 * @returns true if a clean listing match is found
 */
export function testWithFixture(staticHtml: string): boolean {
  // Default test: detect any listing in the HTML (symbol='TKX', name='TokenX')
  // The weekly CI cron provides known-listing HTML and asserts true
  const scr = new BinanceScraper({ testWithFixture: true, fixtureHtml: staticHtml });
  return scr.parseHtmlForListing(staticHtml, 'TKX', 'TokenX').detected;
}
