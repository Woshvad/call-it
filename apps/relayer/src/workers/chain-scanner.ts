/**
 * Shared chain scanner — quick-260611-o5b (Alchemy CU burn fix).
 *
 * ONE single-cursor scan loop replacing the three independent per-worker getLogs
 * loops (notification-fanout, social-unlink-watcher, auto-post-worker — the last
 * issued TWO getLogs per window). Per window it issues exactly ONE merged
 * multi-address / multi-event eth_getLogs covering every registered subscription,
 * then dispatches each returned log ONLY to the registrations whose
 * (address, event) pair matches exactly (T-o5b-01 — cross-product noise from the
 * OR'd filter, e.g. a CallSettled-shaped topic emitted by the FFM address, is
 * silently dropped).
 *
 * Steady state on Arbitrum Sepolia (~250ms blocks ≈ 120 new blocks per 30s tick):
 * 1 eth_getBlockNumber + 1 merged eth_getLogs per tick — versus the previous
 * ceil(120/9)=14 windows × 4 getLogs streams ≈ 56 getLogs + 3 getBlockNumber.
 *
 * ── Tunables and env fallback ladder ──────────────────────────────────────────
 *   blockSpan:         config.blockSpan ?? CHAIN_SCANNER_BLOCK_SPAN
 *                        ?? NOTIFICATION_FANOUT_BLOCK_SPAN ?? 500n
 *   maxWindowsPerTick: config.maxWindowsPerTick ?? CHAIN_SCANNER_MAX_WINDOWS_PER_TICK
 *                        ?? NOTIFICATION_FANOUT_MAX_WINDOWS_PER_TICK ?? 50
 *
 * Why 500 (was 9n): the old 9-block span came from a WRONG belief that the
 * Alchemy free tier caps eth_getLogs at "10 blocks per request" on Arbitrum.
 * The actual free-tier constraint is a 10,000-block RANGE for filtered
 * (address-scoped) queries — 500 is conservatively 20× under that cap and covers
 * ~4 Sepolia ticks of chain per window. The legacy per-worker envs
 * AUTO_POST_BLOCK_SPAN and SOCIAL_UNLINK_BLOCK_SPAN are RETIRED by this module
 * (the per-worker scan loops they tuned no longer exist); use
 * CHAIN_SCANNER_BLOCK_SPAN / CHAIN_SCANNER_MAX_WINDOWS_PER_TICK instead.
 *
 * ── Invariants ported from the per-worker loops ───────────────────────────────
 *   - WR-05 init guard (T-o5b-04): if getBlockNumber fails at init the scanner
 *     NEVER scans from block 0/1 — it re-seeds from head on the next tick and
 *     skips scanning until seeded (a genesis-anchored getLogs would replay every
 *     historical event and be rejected by the provider anyway).
 *   - getLogs failure does NOT advance the cursor — the same window is retried
 *     next tick.
 *   - A throwing onLog handler is logged via pino and NEVER rethrown — later logs
 *     in the same window still dispatch and the window still advances.
 *   - onTick callbacks run at the end of every initialized tick, INCLUDING the
 *     per-tick get_head-failure path (they are time-windowed, e.g. the fanout's
 *     challenge-notification pass, and independent of block ranges). They do NOT
 *     run while the scanner is un-seeded.
 *
 * Kept pure of worker concerns: publicClient + pino only — no DB, no Redis,
 * no subgraph imports.
 */

import type { PublicClient, Address, Log, AbiEvent } from 'viem';
import { logger } from '../lib/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChainScannerConfig {
  /** viem PublicClient for getBlockNumber + the merged getLogs. */
  publicClient: PublicClient;
  /** Tick interval in ms. Default 30_000. */
  intervalMs?: number;
  /** Explicit window span — takes precedence over the env ladder. */
  blockSpan?: bigint;
  /** Explicit per-tick window cap — takes precedence over the env ladder. */
  maxWindowsPerTick?: number;
}

export interface LogSubscription {
  /** Diagnostic name carried into error logs (e.g. 'auto-post:settled'). */
  name: string;
  /** Contract address the subscription is scoped to. */
  address: Address;
  /** Decoded event the subscription is scoped to (matched by eventName). */
  event: AbiEvent;
  /** Per-log handler — exceptions are caught, logged, and never rethrown. */
  onLog: (log: Log) => Promise<void>;
}

export interface ChainScannerHandle {
  /** Add a (address, event) subscription. Returns its unregister function. */
  register(sub: LogSubscription): () => void;
  /**
   * Add an end-of-tick callback (runs every initialized tick, including the
   * get_head-failure path). Returns its unregister function.
   */
  onTick(name: string, fn: () => Promise<void>): () => void;
  /** Idempotent: kicks the init seed and starts the interval. */
  start(): void;
  /** Stops the interval; subsequent ticks are no-ops. */
  stop(): void;
  getStats(): {
    lastBlockSeen: bigint;
    initialized: boolean;
    errors: number;
    subscriptions: number;
  };
  /** Test seam — runs one tick deterministically (respects the stopped guard). */
  tickNow(): Promise<void>;
}

// ── Env ladder parse guards (mirrors notification-fanout's style) ─────────────

/** Parse an env var as a positive integer; undefined → fall through the ladder. */
function parsePositiveInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}

function resolveBlockSpan(explicit: bigint | undefined): bigint {
  if (explicit !== undefined) return explicit;
  const fromScanner = parsePositiveInt(process.env['CHAIN_SCANNER_BLOCK_SPAN']);
  if (fromScanner !== undefined) return BigInt(fromScanner);
  const fromFanout = parsePositiveInt(process.env['NOTIFICATION_FANOUT_BLOCK_SPAN']);
  if (fromFanout !== undefined) return BigInt(fromFanout);
  return 500n;
}

function resolveMaxWindowsPerTick(explicit: number | undefined): number {
  if (explicit !== undefined) return explicit;
  return (
    parsePositiveInt(process.env['CHAIN_SCANNER_MAX_WINDOWS_PER_TICK']) ??
    parsePositiveInt(process.env['NOTIFICATION_FANOUT_MAX_WINDOWS_PER_TICK']) ??
    50
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function createChainScanner(config: ChainScannerConfig): ChainScannerHandle {
  const { publicClient, intervalMs = 30_000 } = config;
  const blockSpan = resolveBlockSpan(config.blockSpan);
  const maxWindowsPerTick = resolveMaxWindowsPerTick(config.maxWindowsPerTick);

  let lastBlockSeen = 0n;
  // WR-05: tracks whether lastBlockSeen has been seeded from a real head. If init
  // fails we must NOT default to scanning from block 1 (a multi-million-block
  // getLogs range that providers reject and that would replay every historical
  // event). The tick re-attempts seeding before any scan.
  let initialized = false;
  let errors = 0;
  let stopped = false;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let initPromise: Promise<void> | null = null;

  const subscriptions: LogSubscription[] = [];
  const tickCallbacks: Array<{ name: string; fn: () => Promise<void> }> = [];

  async function runTickCallbacks(): Promise<void> {
    for (const cb of tickCallbacks) {
      if (stopped) break;
      try {
        await cb.fn();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(
          { event: 'chain_scanner_error', error: message, phase: 'on_tick', callback: cb.name },
          'onTick callback threw — isolated, interval keeps running',
        );
        errors++;
      }
    }
  }

  async function tick(): Promise<void> {
    if (stopped) return;
    if (initPromise) await initPromise;

    // WR-05: if init failed, retry seeding the head before scanning. Until we
    // have a real head we cannot safely choose a fromBlock, so skip this tick
    // entirely (onTick callbacks included — same as the per-worker semantics).
    if (!initialized) {
      try {
        lastBlockSeen = await publicClient.getBlockNumber();
        initialized = true;
        logger.info(
          { event: 'chain_scanner_init_recovered', lastBlockSeen: lastBlockSeen.toString() },
          'Re-seeded lastBlockSeen after failed init — skipping this tick to avoid full-chain scan',
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(
          { event: 'chain_scanner_error', error: message, phase: 'init_retry' },
          'getBlockNumber still failing — skipping tick (will retry next interval)',
        );
        errors++;
      }
      return;
    }

    // Empty-subscription guard: zero RPC when nothing is registered, but the
    // time-windowed onTick callbacks still run.
    if (subscriptions.length === 0) {
      await runTickCallbacks();
      return;
    }

    // Read current head once per tick. On failure, skip the scan but STILL run
    // the onTick callbacks (they are block-range-independent — mirrors the
    // fanout's get_head-failure path).
    let head: bigint;
    try {
      head = await publicClient.getBlockNumber();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        { event: 'chain_scanner_error', error: message, phase: 'get_head' },
        'getBlockNumber failed — skipping scan this tick',
      );
      errors++;
      await runTickCallbacks();
      return;
    }

    logger.info(
      { event: 'chain_scanner_tick', lastBlockSeen: lastBlockSeen.toString(), head: head.toString() },
      'Chain scanner tick',
    );

    let windows = 0;
    while (lastBlockSeen < head && windows < maxWindowsPerTick && !stopped) {
      const from = lastBlockSeen + 1n;
      const to = from + blockSpan - 1n > head ? head : from + blockSpan - 1n;

      // Merged filter: unique addresses + unique events across ALL current
      // subscriptions — ONE getLogs per window, never one per registration.
      const addresses: Address[] = [];
      const seenAddr = new Set<string>();
      const events: AbiEvent[] = [];
      const seenEvent = new Set<string>();
      for (const sub of subscriptions) {
        const a = sub.address.toLowerCase();
        if (!seenAddr.has(a)) {
          seenAddr.add(a);
          addresses.push(sub.address);
        }
        if (!seenEvent.has(sub.event.name)) {
          seenEvent.add(sub.event.name);
          events.push(sub.event);
        }
      }

      let logs: Log[];
      try {
        logs = (await publicClient.getLogs({
          address: addresses,
          events,
          fromBlock: from,
          toBlock: to,
        })) as Log[];
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(
          {
            event: 'chain_scanner_error',
            error: message,
            phase: 'get_logs',
            fromBlock: from.toString(),
            toBlock: to.toString(),
          },
          'merged getLogs failed — will retry same window next tick',
        );
        errors++;
        break; // do NOT advance lastBlockSeen — retry this window next tick
      }

      // Dispatch each log ONLY to exact (address, event) matches (T-o5b-01).
      // Logs are in chain order (block, logIndex) interleaved across addresses;
      // subscribers are documented as order-independent + idempotent.
      for (const log of logs) {
        if (stopped) break;
        const logAddress = (log.address ?? '').toLowerCase();
        const eventName = (log as { eventName?: string }).eventName;
        let dispatched = false;
        for (const sub of subscriptions) {
          if (sub.address.toLowerCase() !== logAddress || sub.event.name !== eventName) continue;
          dispatched = true;
          try {
            await sub.onLog(log);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger.error(
              { event: 'chain_scanner_error', error: message, phase: 'dispatch', subscription: sub.name },
              'Subscription handler threw — isolated, scan continues',
            );
            errors++;
            // NEVER rethrow — later logs/handlers still run, window still advances.
          }
        }
        if (!dispatched) {
          // Cross-product noise from the OR'd multi-address/multi-event filter
          // (e.g. event topic X emitted by contract Y) — dropped by design.
          logger.debug(
            { event: 'chain_scanner_log_dropped', address: logAddress, eventName: eventName ?? null },
            'Log matched no (address, event) registration — dropped',
          );
        }
      }

      lastBlockSeen = to;
      windows++;
    }

    // Window cap hit with a remaining gap: visible-but-not-alarming backlog log.
    if (lastBlockSeen < head && windows >= maxWindowsPerTick) {
      logger.info(
        {
          event: 'chain_scanner_catching_up',
          remaining: (head - lastBlockSeen).toString(),
          windowsThisTick: windows,
        },
        'Window cap reached — backlog will drain across future ticks',
      );
    }

    await runTickCallbacks();
  }

  return {
    register(sub: LogSubscription): () => void {
      subscriptions.push(sub);
      return () => {
        const idx = subscriptions.indexOf(sub);
        if (idx >= 0) subscriptions.splice(idx, 1);
      };
    },

    onTick(name: string, fn: () => Promise<void>): () => void {
      const entry = { name, fn };
      tickCallbacks.push(entry);
      return () => {
        const idx = tickCallbacks.indexOf(entry);
        if (idx >= 0) tickCallbacks.splice(idx, 1);
      };
    },

    start(): void {
      if (intervalId !== null || stopped) return; // idempotent
      if (!initPromise) {
        initPromise = (async () => {
          try {
            lastBlockSeen = await publicClient.getBlockNumber();
            initialized = true;
            logger.info(
              {
                event: 'chain_scanner_started',
                lastBlockSeen: lastBlockSeen.toString(),
                blockSpan: blockSpan.toString(),
                maxWindowsPerTick,
                subscriptions: subscriptions.length,
              },
              'Chain scanner started',
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger.error({ event: 'chain_scanner_error', error: message, phase: 'init' });
            errors++;
            // Leave initialized=false — the tick re-seeds (WR-05).
          }
        })();
      }
      intervalId = setInterval(() => {
        tick().catch((err) => {
          // tick() catches all errors internally; this is a final safety net.
          const message = err instanceof Error ? err.message : String(err);
          logger.error({ event: 'chain_scanner_error', error: message, phase: 'interval-catch' });
          errors++;
        });
      }, intervalMs);
    },

    stop(): void {
      stopped = true;
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },

    getStats() {
      return {
        lastBlockSeen,
        initialized,
        errors,
        subscriptions: subscriptions.length,
      };
    },

    async tickNow(): Promise<void> {
      await tick();
    },
  };
}
