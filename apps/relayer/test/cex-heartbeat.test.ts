/**
 * Task 3 TDD — CEX scraper heartbeat tests (OPS-17)
 *
 * Tests that each of the 8 exchange stubs emits exactly one heartbeat log
 * when emitAllHeartbeats() is invoked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the logger so we can capture log calls
const loggedEvents: Array<{ event: string; exchange: string }> = [];
vi.mock('../src/lib/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn((obj: { event: string; exchange: string }) => {
      loggedEvents.push(obj);
    }),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
  logger: {
    info: vi.fn((obj: { event: string; exchange: string }) => {
      loggedEvents.push(obj);
    }),
    warn: vi.fn(),
    error: vi.fn(),
  },
  setLogger: vi.fn(),
  REDACT_PATHS: [],
  createLogger: vi.fn(),
}));

import { emitAllHeartbeats, CEX_EXCHANGES } from '../src/workers/cex-heartbeat.js';

const EXPECTED_EXCHANGES = ['binance', 'coinbase', 'okx', 'bybit', 'kraken', 'bitget', 'kucoin', 'upbit'] as const;

describe('CEX scraper heartbeats', () => {
  beforeEach(() => {
    loggedEvents.length = 0;
  });

  it('exports exactly 8 exchange stubs', () => {
    expect(CEX_EXCHANGES).toHaveLength(8);
    for (const name of EXPECTED_EXCHANGES) {
      expect(CEX_EXCHANGES).toContain(name);
    }
  });

  it('emitAllHeartbeats() emits exactly 8 cex_scraper_alive log lines', async () => {
    await emitAllHeartbeats();

    const heartbeatLogs = loggedEvents.filter((e) => e.event === 'cex_scraper_alive');
    expect(heartbeatLogs).toHaveLength(8);

    // Each exchange appears exactly once
    for (const name of EXPECTED_EXCHANGES) {
      const matchingLogs = heartbeatLogs.filter((e) => e.exchange === name);
      expect(matchingLogs).toHaveLength(1);
    }
  });
});
