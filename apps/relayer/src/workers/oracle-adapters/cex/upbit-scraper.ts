/**
 * Upbit CEX listing scraper — per-exchange modular isolation (D-02, Pitfall 10).
 *
 * Scrapes https://upbit.com/service_center/notice?code=notice for token listings.
 * - Multi-signal confirm: matches BOTH full tokenName AND tokenSymbol in post title (Pitfall 19)
 * - Korean-market-specific exclusions: '유의 종목' (caution), 'KRW Market Only' (Pitfall 19)
 * - testWithFixture: static HTML injection for weekly CI synthetic test (Pitfall 10)
 *
 * Note: Upbit is a Korean exchange. Announcement pages may be in Korean.
 * Listings of 'KRW Market Only' or '유의 종목' (caution-listed) are excluded.
 *
 * Spec: CALL_IT_SPEC1.md §13.6
 * Requirements: SETTLE-23, SETTLE-24
 */

import { getLogger } from '../../../lib/logger.js';

// ── In-file constants (Pitfall 10: isolated per-exchange) ─────────────────────

/** Upbit service center notice URL */
export const ANNOUNCE_URL = 'https://upbit.com/service_center/notice?code=notice';

/**
 * Upbit exclusion patterns (Pitfall 19).
 * Korean-specific exclusion terms for caution-listed or KRW-only listings.
 */
export const EXCLUSION_PATTERNS: string[] = ['유의 종목', 'KRW Market Only'];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UpbitScraperResult {
  detected: boolean;
  matchedTitle?: string;
  exclusionReason?: string;
}

// ── Core detection logic ──────────────────────────────────────────────────────

function extractTitlesFromHtml(html: string): string[] {
  const titles: string[] = [];
  const patterns = [
    /<[^>]+class="[^"]*notice-title[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/gi,
    /<[^>]+class="[^"]*list-title[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/gi,
    /<h2[^>]*>([\s\S]*?)<\/h2>/gi,
    /<h3[^>]*>([\s\S]*?)<\/h3>/gi,
    // Upbit may use data-v-* Vue attributes — match broad li/a elements with title-like text
    /<a[^>]+class="[^"]*notice[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
  ];
  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(html)) !== null) {
      const text = match[1]!.replace(/<[^>]+>/g, '').trim();
      if (text && !titles.includes(text)) titles.push(text);
    }
  }
  return titles;
}

function isMultiSignalMatch(title: string, tokenSymbol: string, tokenName: string): boolean {
  const t = title.toLowerCase();
  return t.includes(tokenSymbol.toLowerCase()) && t.includes(tokenName.toLowerCase());
}

function getExclusionPattern(title: string): string | null {
  for (const pattern of EXCLUSION_PATTERNS) {
    // Handle both Korean and ASCII exclusion patterns
    if (title.includes(pattern) || title.toLowerCase().includes(pattern.toLowerCase())) {
      return pattern;
    }
  }
  return null;
}

// ── UpbitScraper class ────────────────────────────────────────────────────────

export class UpbitScraper {
  constructor() {}

  parseHtmlForListing(html: string, tokenSymbol: string, tokenName: string): UpbitScraperResult {
    const titles = extractTitlesFromHtml(html);
    for (const title of titles) {
      if (!isMultiSignalMatch(title, tokenSymbol, tokenName)) continue;
      const exclusion = getExclusionPattern(title);
      if (exclusion) return { detected: false, matchedTitle: title, exclusionReason: exclusion };
      return { detected: true, matchedTitle: title };
    }
    return { detected: false };
  }

  private async scrapeWithPlaywright(): Promise<string> {
    const logger = getLogger();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { chromium } = await import('playwright') as any;
    let browser: { close: () => Promise<void> } | undefined;
    try {
      browser = await chromium.launch({ headless: true });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const page = (await (browser as any).newPage()) as any;
      await page.goto(ANNOUNCE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      // Upbit is a Vue SPA — wait for content to render
      await page.waitForTimeout(2000);
      const html = await page.content();
      logger.info({ event: 'upbit_scraper_page_loaded' }, 'Upbit page loaded');
      return html as string;
    } catch (err) {
      logger.error({ event: 'upbit_scraper_playwright_error', error: String(err) }, 'Upbit Playwright failed');
      return '';
    } finally {
      if (browser) await browser.close();
    }
  }

  async detectListing(params: { tokenSymbol: string; tokenName: string; expiryTimestamp: number }): Promise<UpbitScraperResult> {
    const logger = getLogger();
    logger.info({ event: 'upbit_scraper_attempt', ...params }, 'Upbit scraper started');
    const html = await this.scrapeWithPlaywright();
    const result = this.parseHtmlForListing(html, params.tokenSymbol, params.tokenName);
    logger.info({ event: 'upbit_scraper_result', detected: result.detected }, `Upbit scraper: ${result.detected ? 'FOUND' : 'NOT FOUND'}`);
    return result;
  }
}

// ── Standalone exports ────────────────────────────────────────────────────────

export async function scrape(tokenSymbol: string, tokenName: string, expiryTimestamp: number): Promise<boolean> {
  const scr = new UpbitScraper();
  const result = await scr.detectListing({ tokenSymbol, tokenName, expiryTimestamp });
  return result.detected;
}

export function testWithFixture(staticHtml: string): boolean {
  const scr = new UpbitScraper();
  return scr.parseHtmlForListing(staticHtml, 'TKX', 'TokenX').detected;
}
