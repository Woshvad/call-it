/**
 * Polled-events fallback worker.
 *
 * Polls a contract via viem getLogs at a configurable interval (default 5s).
 * Used as a fallback during subgraph indexer-sync gaps (OPS-02).
 *
 * Phase 0: stub wired against a test contract for Sepolia smoke test.
 * Phase 1+: wire against deployed CallRegistry (update address + events after Phase 1 deploy).
 *
 * Security (T-00-22): Worker is read-only against public RPC; no auth required.
 * Structured Pino logging surfaces anomalies; the worker is a FALLBACK — the subgraph
 * is the source of truth. Drift between the two is detectable.
 *
 * OPS-02 requirement: polls every 5 seconds (default intervalMs).
 */

import type { PublicClient, AbiEvent, Log, Address } from 'viem';
import { logger } from '../lib/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PolledEventsConfig {
  /** viem PublicClient to use for getLogs calls */
  publicClient: PublicClient;
  /** Contract address to filter logs for */
  address: Address;
  /** ABI event signatures to filter (empty array = all events from the address) */
  events: AbiEvent[];
  /** Polling interval in milliseconds. Default: 5000 (5s) per OPS-02. */
  intervalMs: number;
  /** Callback invoked for each log emitted by the contract */
  onLog: (log: Log) => Promise<void> | void;
  /** Starting block number. If omitted, resolved to current head at startup. */
  fromBlock?: bigint;
}

export interface PolledEventsHandle {
  /** Stop polling — clears the interval, no further getLogs calls */
  stop(): void;
  /** Returns diagnostic stats for monitoring */
  getStats(): { lastBlockSeen: bigint; totalLogs: number; errors: number };
}

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Start polling a contract for logs at the configured interval.
 *
 * @param config - polling configuration
 * @returns handle with stop() and getStats()
 */
export function startPolledEventsFallback(config: PolledEventsConfig): PolledEventsHandle {
  const { publicClient, address, events, intervalMs = 5000, onLog } = config;

  let lastBlockSeen: bigint = config.fromBlock ?? 0n;
  let totalLogs = 0;
  let errors = 0;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  // Initialize lastBlockSeen: if fromBlock not provided, resolve current head.
  // We kick off the initial resolution asynchronously so we don't block startup.
  const initPromise = (async () => {
    if (config.fromBlock === undefined) {
      try {
        lastBlockSeen = await publicClient.getBlockNumber();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ event: 'polled_events_fallback_error', error: message, address, phase: 'init' });
        errors++;
        lastBlockSeen = 0n;
      }
    }
  })();

  /**
   * One polling tick: fetch logs from lastBlockSeen+1 to 'latest'.
   * Wraps in try/catch — errors increment counter and log but do NOT throw (interval keeps running).
   */
  async function tick(): Promise<void> {
    if (stopped) return;

    // Wait for init to complete before first tick
    await initPromise;

    try {
      const fromBlock = lastBlockSeen === 0n ? 1n : lastBlockSeen + 1n;
      const logs = await publicClient.getLogs({
        address,
        events: events.length > 0 ? events : undefined,
        fromBlock,
        toBlock: 'latest',
      } as Parameters<typeof publicClient.getLogs>[0]);

      for (const log of logs) {
        if (stopped) break;
        await onLog(log);
        totalLogs++;

        // Track the highest block seen across all logs in this batch
        if (log.blockNumber !== null && log.blockNumber !== undefined) {
          if (log.blockNumber > lastBlockSeen) {
            lastBlockSeen = log.blockNumber;
          }
        }
      }

      // If no logs were returned, we still need to advance lastBlockSeen
      // to avoid re-scanning the same block range on every tick.
      // We do this by fetching the current block number.
      if (logs.length === 0) {
        try {
          const currentBlock = await publicClient.getBlockNumber();
          if (currentBlock > lastBlockSeen) {
            lastBlockSeen = currentBlock;
          }
        } catch {
          // Non-fatal — we'll try again next tick
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({
        event: 'polled_events_fallback_error',
        error: message,
        address,
        lastBlockSeen: lastBlockSeen.toString(),
      });
      errors++;
      // Do NOT throw — the interval must keep running through transient RPC errors
    }
  }

  // Start the polling interval
  intervalId = setInterval(() => {
    tick().catch((err) => {
      // tick() already catches all errors internally; this is a safety net
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ event: 'polled_events_fallback_error', error: message, address, phase: 'interval-catch' });
      errors++;
    });
  }, intervalMs);

  return {
    stop(): void {
      stopped = true;
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },

    getStats(): { lastBlockSeen: bigint; totalLogs: number; errors: number } {
      return { lastBlockSeen, totalLogs, errors };
    },
  };
}

/**
 * Convenience wrapper — stop a running handle (alias for handle.stop()).
 * Exported per the plan's interface spec (acceptance criteria: exports stopPolledEventsFallback).
 */
export function stopPolledEventsFallback(handle: PolledEventsHandle): void {
  handle.stop();
}
