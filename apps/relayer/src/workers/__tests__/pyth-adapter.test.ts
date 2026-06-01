/**
 * pyth-adapter.test.ts — RED-gate Vitest scaffold for the Pyth oracle adapter.
 *
 * Spec: CALL_IT_SPEC1.md §13.1 — Pyth pull oracle + 30×60s retry loop
 * Requirements: SETTLE-08, SETTLE-10, SETTLE-11
 * Research: 04-RESEARCH.md §Adapter 1 Pyth, §BullMQ Settlement Watcher Pattern
 *
 * RED GATE: This file WILL fail with "Cannot find module" until Plan 04-03 creates
 *   apps/relayer/src/workers/oracle-adapters/pyth-adapter.ts
 * That module-not-found error is the expected Wave 0 RED gate. Do not fix the import.
 *
 * D-08: HermesClient.getLatestPriceUpdates responses use binary.data (string[] hex).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// RED GATE: these modules do not exist yet — created in Plan 04-03
import {
  PythAdapter,
  PythAdapterResult,
  PythAdapterStatus,
} from '../oracle-adapters/pyth-adapter.js'; // <-- RED GATE: module does not exist yet

// Mock the @pythnetwork/hermes-client package
vi.mock('@pythnetwork/hermes-client', () => ({
  HermesClient: vi.fn().mockImplementation(() => ({
    getLatestPriceUpdates: vi.fn(),
  })),
}));

import { HermesClient } from '@pythnetwork/hermes-client';

describe('PythAdapter', () => {
  let adapter: PythAdapter;
  let mockHermesClient: { getLatestPriceUpdates: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockHermesClient = {
      getLatestPriceUpdates: vi.fn(),
    };

    // PythAdapter constructor accepts a HermesClient instance
    adapter = new PythAdapter(mockHermesClient as unknown as HermesClient, {
      maxRetries: 30,
      retryIntervalMs: 60_000,
      confidenceThresholdNumerator: 200, // confidence * 200 <= price (SETTLE-08)
    });

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /**
   * testWideConfidenceRetry (SETTLE-08, SETTLE-10):
   * When confidence * 200 > price, adapter returns SettlementDelayed status.
   * The Pyth confidence gate: confidence interval must be ≤ 0.5% of price.
   */
  it('returns SettlementDelayed when confidence * 200 > price (wide confidence gate SETTLE-08)', async () => {
    // price=1000, conf=6 → 6*200=1200 > 1000 → WIDE confidence
    const wideConfidenceUpdate = {
      binary: {
        data: ['0xdeadbeef01'], // hex-encoded VAA bytes
      },
      parsed: [
        {
          price: {
            price: '1000',
            conf: '6',      // 6 * 200 = 1200 > 1000 → WIDE
            expo: -8,
            publish_time: Math.floor(Date.now() / 1000),
          },
          id: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', // ETH/USD
        },
      ],
    };

    mockHermesClient.getLatestPriceUpdates.mockResolvedValue(wideConfidenceUpdate);

    const result: PythAdapterResult = await adapter.fetchAndVerify({
      priceId: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
      callId: BigInt(1),
    });

    expect(result.status).toBe(PythAdapterStatus.SettlementDelayed);
    expect(result.reason).toMatch(/confidence/i);
    expect(result.updateData).toBeUndefined();
  });

  /**
   * testRetryExhausted (SETTLE-11):
   * After 30 failed retries (all returning wide confidence), adapter
   * calls openDisputeWindow (returns DisputeWindowOpened status).
   */
  it('calls openDisputeWindow after 30 retries exhausted (SETTLE-11)', async () => {
    // All retries return wide confidence
    const wideUpdate = {
      binary: { data: ['0xdeadbeef02'] },
      parsed: [
        {
          price: {
            price: '1000',
            conf: '6',  // WIDE
            expo: -8,
            publish_time: Math.floor(Date.now() / 1000),
          },
          id: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
        },
      ],
    };

    mockHermesClient.getLatestPriceUpdates.mockResolvedValue(wideUpdate);

    // Run 30 retries — adapter should exhaust and open dispute window
    const result: PythAdapterResult = await adapter.fetchWithRetry({
      priceId: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
      callId: BigInt(1),
    });

    expect(result.status).toBe(PythAdapterStatus.DisputeWindowOpened);
    expect(mockHermesClient.getLatestPriceUpdates).toHaveBeenCalledTimes(30);
  });

  /**
   * testSuccessfulPythFetch:
   * Valid price with narrow confidence → returns updateData array + feeWei.
   */
  it('returns updateData and feeWei on successful Pyth fetch', async () => {
    // price=100_000_00 (= $100,000), conf=10 → 10*200=2000 < 100_000_00 → NARROW
    const validUpdate = {
      binary: {
        data: ['0xabcdef1234'], // hex-encoded VAA
      },
      parsed: [
        {
          price: {
            price: '100000000', // 1_000_000.00 USD in 8-decimal Pyth form
            conf: '10',         // 10 * 200 = 2000 << 100_000_000 → narrow confidence
            expo: -8,
            publish_time: Math.floor(Date.now() / 1000),
          },
          id: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', // BTC/USD
        },
      ],
    };

    mockHermesClient.getLatestPriceUpdates.mockResolvedValue(validUpdate);

    const result: PythAdapterResult = await adapter.fetchAndVerify({
      priceId: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
      callId: BigInt(2),
    });

    expect(result.status).toBe(PythAdapterStatus.Success);
    expect(result.updateData).toBeDefined();
    expect(Array.isArray(result.updateData)).toBe(true);
    expect(result.updateData!.length).toBeGreaterThan(0);
    // binary.data format: string[] hex — each entry is a `0x...` hex string
    expect(result.updateData![0]).toMatch(/^0x/);
    expect(result.feeWei).toBeDefined();
    expect(typeof result.feeWei).toBe('bigint');
  });
});
