/**
 * Polled-events fallback worker unit tests.
 *
 * Test 1: Worker polls every 5000ms and invokes onLog callback for each log
 * Test 2: Worker tracks lastBlockSeen and passes monotonically increasing fromBlock
 * Test 3: Worker survives transient getLogs errors and continues polling
 * Test 4: stop() clears the interval; no further getLogs calls after stop
 *
 * Requirements: OPS-02
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Log } from 'viem';
import type { PolledEventsConfig, PolledEventsHandle } from '../src/workers/polled-events-fallback.js';
import { startPolledEventsFallback } from '../src/workers/polled-events-fallback.js';

// Helper: flush promise queue (equivalent to multiple microtask flushes)
async function flushPromises(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

// Minimal mock log factory
function makeLog(blockNumber: bigint, index: number): Log {
  return {
    address: '0x0000000000000000000000000000000000000001',
    topics: [],
    data: '0x',
    blockHash: '0x0000000000000000000000000000000000000000000000000000000000000001',
    blockNumber,
    transactionHash: '0x0000000000000000000000000000000000000000000000000000000000000001',
    transactionIndex: 0,
    logIndex: index,
    removed: false,
  } as unknown as Log;
}

describe('polled-events fallback worker', () => {
  let mockGetLogs: ReturnType<typeof vi.fn>;
  let mockGetBlockNumber: ReturnType<typeof vi.fn>;
  let mockPublicClient: PolledEventsConfig['publicClient'];
  let handle: PolledEventsHandle;

  beforeEach(() => {
    vi.useFakeTimers();

    // Default: getLogs returns 2 logs per call
    mockGetLogs = vi.fn().mockResolvedValue([makeLog(100n, 0), makeLog(100n, 1)]);
    mockGetBlockNumber = vi.fn().mockResolvedValue(100n);

    mockPublicClient = {
      getLogs: mockGetLogs,
      getBlockNumber: mockGetBlockNumber,
    } as unknown as PolledEventsConfig['publicClient'];
  });

  afterEach(() => {
    handle?.stop();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('Test 1: polls every 5000ms and invokes onLog callback for each log', async () => {
    const onLogCalls: Log[] = [];

    handle = startPolledEventsFallback({
      publicClient: mockPublicClient,
      address: '0x0000000000000000000000000000000000000001',
      events: [],
      intervalMs: 5000,
      onLog: (log) => { onLogCalls.push(log); },
      fromBlock: 1n,
    });

    // Advance 3 polling cycles (3 × 5000ms = 15000ms) + flush promises
    await vi.advanceTimersByTimeAsync(5_000);
    await flushPromises();

    await vi.advanceTimersByTimeAsync(5_000);
    await flushPromises();

    await vi.advanceTimersByTimeAsync(5_000);
    await flushPromises();

    // Each cycle returns 2 logs, 3 cycles = 6 total
    expect(onLogCalls).toHaveLength(6);
    expect(mockGetLogs).toHaveBeenCalledTimes(3);
  });

  it('Test 2: tracks lastBlockSeen and passes monotonically increasing fromBlock', async () => {
    // Return logs at different block numbers to verify advancement
    mockGetLogs
      .mockResolvedValueOnce([makeLog(10n, 0), makeLog(15n, 1)]) // cycle 1: max block 15
      .mockResolvedValueOnce([makeLog(20n, 0), makeLog(25n, 1)]) // cycle 2: max block 25
      .mockResolvedValueOnce([makeLog(30n, 0), makeLog(35n, 1)]); // cycle 3: max block 35

    handle = startPolledEventsFallback({
      publicClient: mockPublicClient,
      address: '0x0000000000000000000000000000000000000001',
      events: [],
      intervalMs: 5000,
      onLog: vi.fn(),
      fromBlock: 1n,
    });

    // Cycle 1
    await vi.advanceTimersByTimeAsync(5_000);
    await flushPromises();

    // Cycle 2
    await vi.advanceTimersByTimeAsync(5_000);
    await flushPromises();

    // Cycle 3
    await vi.advanceTimersByTimeAsync(5_000);
    await flushPromises();

    // Verify monotonically increasing fromBlock
    const calls = mockGetLogs.mock.calls;
    expect(calls).toHaveLength(3);

    const fromBlocks = calls.map((call) => (call[0] as { fromBlock?: bigint }).fromBlock ?? 0n);
    // Each fromBlock should be greater than the previous
    for (let i = 1; i < fromBlocks.length; i++) {
      expect(fromBlocks[i]).toBeGreaterThan(fromBlocks[i - 1]);
    }

    // Verify getStats tracks lastBlockSeen
    const stats = handle.getStats();
    expect(stats.lastBlockSeen).toBe(35n);
  });

  it('Test 3: survives getLogs errors, logs polled_events_fallback_error, continues polling', async () => {
    // Cycle 1: throws; cycles 2 and 3: return 2 logs each
    mockGetLogs
      .mockRejectedValueOnce(new Error('RPC timeout')) // cycle 1 throws
      .mockResolvedValueOnce([makeLog(100n, 0), makeLog(100n, 1)]) // cycle 2: 2 logs
      .mockResolvedValueOnce([makeLog(100n, 0), makeLog(100n, 1)]); // cycle 3: 2 logs

    const onLog = vi.fn();

    handle = startPolledEventsFallback({
      publicClient: mockPublicClient,
      address: '0x0000000000000000000000000000000000000001',
      events: [],
      intervalMs: 5000,
      onLog,
      fromBlock: 1n,
    });

    // 3 cycles
    await vi.advanceTimersByTimeAsync(5_000);
    await flushPromises();

    await vi.advanceTimersByTimeAsync(5_000);
    await flushPromises();

    await vi.advanceTimersByTimeAsync(5_000);
    await flushPromises();

    // cycles 2 and 3 each returned 2 logs = 4 total (cycle 1 threw)
    expect(onLog).toHaveBeenCalledTimes(4);

    // Worker should have recorded 1 error
    const stats = handle.getStats();
    expect(stats.errors).toBe(1);
    expect(stats.totalLogs).toBe(4);
  });

  it('Test 4: stop() clears the interval; no further getLogs calls after stop', async () => {
    handle = startPolledEventsFallback({
      publicClient: mockPublicClient,
      address: '0x0000000000000000000000000000000000000001',
      events: [],
      intervalMs: 5000,
      onLog: vi.fn(),
      fromBlock: 1n,
    });

    // One cycle
    await vi.advanceTimersByTimeAsync(5_000);
    await flushPromises();
    expect(mockGetLogs).toHaveBeenCalledTimes(1);

    // Stop the worker
    handle.stop();

    // Advance more time — should NOT trigger more getLogs calls
    await vi.advanceTimersByTimeAsync(20_000);
    await flushPromises();

    // Still only 1 call — stop prevented further polling
    expect(mockGetLogs).toHaveBeenCalledTimes(1);
  });
});
