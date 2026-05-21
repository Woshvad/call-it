/**
 * stylus-deactivation-watcher.ts — Second belt for Pitfall 17 (Stylus 365-day reactivation)
 *
 * Purpose (D-13, D-16):
 *   Stylus contracts deactivate after 365 days from activation. If the operator misses
 *   reactivation, the StylusScoreEngine silently stops executing (critical failure).
 *   This watcher is the INDEPENDENT second belt:
 *   - Belt 1: Google Calendar invites at T-30d/T-15d/T-7d/T-1d (via scripts/seed-calendar.ts)
 *   - Belt 2: This BullMQ-integrated daily interval worker (T-00-29 mitigation)
 *
 * Behavior:
 *   - Polls `arbitrumActivationExpiry(stylusAddress)` once per intervalMs (default: 24h)
 *   - At each of the 4 thresholds [30, 15, 7, 1] days:
 *     - Acquires Redis lock `stylus:alert-fired:T-{N}d:YYYY-MM-DD` (SET NX EX 86400)
 *     - If acquired: fires P0 `stylus_reactivation` alert via sendAlert()
 *     - If not acquired: idempotent — another instance already fired today
 *   - On readContract error (common in Phase 0 — no Stylus contract deployed yet):
 *     - Logs `stylus_watcher_skipped` Pino event
 *     - Does NOT crash; does NOT spam alerts
 *   - On null stylusAddress (Phase 0 default):
 *     - Logs `stylus_watcher_inactive` Pino event once per day
 *     - Does NOT call readContract
 *
 * Phase 0 note:
 *   `stylusAddress: null` in Phase 0 (no Stylus contract deployed). The watcher
 *   is started but silently skips all checks until Phase 5 wires the real address.
 *
 * Phase 5 integration:
 *   After Stylus contract activation, update `STYLUS_SCORE_ENGINE_ADDRESS` in env
 *   and restart the relayer — the watcher will begin polling immediately.
 *
 * Exports:
 *   startStylusDeactivationWatcher(opts): { stop(): void }
 */

import { sendAlert } from './alerts.js';
import { getLogger } from '../lib/logger.js';

// ABI for the Stylus activation expiry query
// `arbitrumActivationExpiry()` returns uint256 (Unix timestamp of expiry)
const STYLUS_ACTIVATION_EXPIRY_ABI = [
  {
    name: 'arbitrumActivationExpiry',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

/** Alert thresholds in days — ordered descending (highest first) */
const ALERT_THRESHOLDS_DAYS = [30, 15, 7, 1] as const;

/** Default polling interval: 24 hours */
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface StylusDeactivationWatcherOpts {
  /** viem publicClient (or mock in tests) */
  publicClient: {
    readContract(opts: { address: string; abi: readonly unknown[]; functionName: string }): Promise<unknown>;
  };
  /** Stylus contract address. null in Phase 0 (no contract deployed yet). */
  stylusAddress: string | null;
  /** Polling interval in ms. Default: 24h. */
  intervalMs?: number;
  /** ioredis client (or mock) — used for idempotency locks */
  redis: {
    set(key: string, value: string, ...args: (string | number)[]): Promise<string | null>;
  };
}

export interface StylusDeactivationWatcherHandle {
  stop(): void;
}

/**
 * Start the Stylus deactivation watcher.
 *
 * Returns a handle with a stop() method to clear the interval.
 */
export function startStylusDeactivationWatcher(
  opts: StylusDeactivationWatcherOpts,
): StylusDeactivationWatcherHandle {
  const { publicClient, stylusAddress, redis } = opts;
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const logger = getLogger();

  // Run immediately, then repeat on interval
  let stopped = false;

  async function tick(): Promise<void> {
    if (stopped) return;

    // Phase 0: null address — skip with informational log
    if (!stylusAddress) {
      logger.info(
        {
          event: 'stylus_watcher_inactive',
          message: 'No Stylus contract address configured — watcher inactive (Phase 0 expected)',
        },
        'Stylus deactivation watcher inactive: stylusAddress is null',
      );
      return;
    }

    let expiryTimestamp: number;
    try {
      const raw = await publicClient.readContract({
        address: stylusAddress,
        abi: STYLUS_ACTIVATION_EXPIRY_ABI,
        functionName: 'arbitrumActivationExpiry',
      });
      // readContract returns bigint
      expiryTimestamp = Number(raw as bigint);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.info(
        {
          event: 'stylus_watcher_skipped',
          stylusAddress,
          error: errMsg,
        },
        'Stylus deactivation watcher skipped — readContract failed (Phase 0: contract may not be deployed)',
      );
      return;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const daysRemaining = (expiryTimestamp - nowSeconds) / (24 * 60 * 60);

    logger.info(
      {
        event: 'stylus_watcher_tick',
        stylusAddress,
        expiryTimestamp,
        daysRemaining: Math.floor(daysRemaining),
      },
      `Stylus activation expiry in ${Math.floor(daysRemaining)} days`,
    );

    // Check each threshold
    for (const thresholdDays of ALERT_THRESHOLDS_DAYS) {
      // Fire alert when daysRemaining crosses INTO this threshold zone
      // i.e., daysRemaining <= thresholdDays AND daysRemaining > 0
      if (daysRemaining <= thresholdDays && daysRemaining > 0) {
        const dateKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const lockKey = `stylus:alert-fired:T-${thresholdDays}d:${dateKey}`;

        // Idempotency lock — one alert per threshold per calendar day
        const acquired = await redis.set(lockKey, '1', 'EX', 86400, 'NX');

        if (acquired === 'OK') {
          // Lock acquired — fire the alert
          await sendAlert('stylus_reactivation', {
            daysRemaining: Math.floor(daysRemaining),
            threshold: thresholdDays,
            expiryTimestamp,
            stylusAddress,
            runbookUrl: 'https://github.com/call-it-xyz/call-it/blob/main/docs/runbooks/stylus-reactivation.md',
          });

          logger.info(
            {
              event: 'stylus_reactivation_alert_sent',
              threshold: thresholdDays,
              daysRemaining: Math.floor(daysRemaining),
              stylusAddress,
            },
            `Stylus reactivation P0 alert sent at T-${thresholdDays}d threshold`,
          );
        }
        // Only fire the highest triggered threshold (first match in descending order)
        break;
      }
    }
  }

  // Run the first tick immediately
  tick().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ event: 'stylus_watcher_tick_error', error: msg }, 'Stylus deactivation watcher tick error');
  });

  // Schedule repeating ticks
  const handle = setInterval(() => {
    if (stopped) return;
    tick().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ event: 'stylus_watcher_tick_error', error: msg }, 'Stylus deactivation watcher tick error');
    });
  }, intervalMs);

  return {
    stop() {
      stopped = true;
      clearInterval(handle);
    },
  };
}
