/**
 * CEX scraper heartbeat stubs (OPS-17).
 *
 * 8 named exchange stubs, each emitting a cex_scraper_alive Pino log event
 * every 60s when the scraper worker is healthy.
 *
 * Phase 0: STUBS ONLY — real Playwright scrapers land in Phase 4.
 * Each stub just logs the heartbeat; no actual scraping happens.
 *
 * Per-exchange stubs are MODULAR (separate functions) because exchange
 * announcement page structures change without warning — isolate selectors
 * per exchange (see CLAUDE.md "playwright per-exchange scrapers must be modular").
 *
 * Interface exported for Plan 00-04 CI cron:
 *   export const CEX_EXCHANGES: readonly string[]
 *   export function emitAllHeartbeats(): Promise<void>
 */

import { getLogger } from '../lib/logger.js';

/** The 8 CEX exchanges tracked in Phase 4 (OPS-17) */
export const CEX_EXCHANGES = [
  'binance',
  'coinbase',
  'okx',
  'bybit',
  'kraken',
  'bitget',
  'kucoin',
  'upbit',
] as const;

export type CexExchange = typeof CEX_EXCHANGES[number];

export interface CexScraperStub {
  exchange: CexExchange;
  /** Emit the heartbeat log for this exchange. Phase 4 replaces this with real scraping. */
  emitHeartbeat(): void;
}

/**
 * Create a stub scraper for a single exchange.
 *
 * Phase 4 replaces the body of emitHeartbeat() with actual Playwright scraping.
 * The heartbeat log is the observable contract for OPS-17 monitoring.
 */
function createStub(exchange: CexExchange): CexScraperStub {
  return {
    exchange,
    emitHeartbeat() {
      // OPS-17: each exchange emits cex_scraper_alive with exchange name in structured field
      getLogger().info(
        { event: 'cex_scraper_alive', exchange, phase: '00-stub' },
        `CEX scraper alive: ${exchange} (Phase 0 stub — real scraper lands in Phase 4)`,
      );
    },
  };
}

// The 8 exchange stubs
export const scraperStubs: readonly CexScraperStub[] = CEX_EXCHANGES.map(createStub);

// Individual stubs for named access (Phase 4 replaces these with real scrapers)
export const binanceScraper = scraperStubs[0]!;
export const coinbaseScraper = scraperStubs[1]!;
export const okxScraper = scraperStubs[2]!;
export const bybitScraper = scraperStubs[3]!;
export const krakenScraper = scraperStubs[4]!;
export const bitgetScraper = scraperStubs[5]!;
export const kucoinScraper = scraperStubs[6]!;
export const upbitScraper = scraperStubs[7]!;

/**
 * Emit heartbeat logs for all 8 exchange stubs.
 *
 * Called by the BullMQ worker every 60s (wired in index.ts).
 * Unit tests call this directly to assert exactly 8 log lines.
 */
export async function emitAllHeartbeats(): Promise<void> {
  for (const stub of scraperStubs) {
    stub.emitHeartbeat();
  }
}
