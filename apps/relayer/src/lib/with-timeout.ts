/**
 * withTimeout — dependency-free promise timeout helper (quick-260610-sr0).
 *
 * Exists to bound the profile route's upstream legs (Arbitrum RPC, mainnet ENS
 * RPC, subgraph, Redis) so GET /api/profile/:address can NEVER hang
 * indefinitely. The deployed Sepolia relayer's public-RPC fallback tarpit-
 * throttles, leaving viem readContract promises unsettled forever; racing each
 * leg (and the whole resolution block) against a timer guarantees a bounded
 * response.
 *
 * Behavior contract:
 *   - Resolves/rejects with the underlying promise's value/error if it settles
 *     before the timeout (original error propagates UNCHANGED).
 *   - Rejects with `TimeoutError("${label} timed out after ${ms}ms")` if the
 *     timer fires first — callers can `instanceof TimeoutError` to distinguish
 *     a timeout from a real upstream error (CR-01: the profile route skips its
 *     60s cache write when any leg timed out).
 *   - The setTimeout handle is ALWAYS cleared when the race settles (no leaked
 *     handles in vitest), and unref()'d where available so it never keeps the
 *     process alive.
 */

/**
 * Dedicated error class for withTimeout deadline expiry, so consumers can
 * reliably distinguish "the timer fired" from "the upstream rejected".
 */
export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(label, ms));
    }, ms);
    // Don't keep the process alive for this timer (guarded — mocked
    // environments may not provide unref on the handle).
    (timer as { unref?: () => void }).unref?.();
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
