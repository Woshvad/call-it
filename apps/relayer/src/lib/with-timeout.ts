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
 *   - Rejects with `Error("${label} timed out after ${ms}ms")` if the timer
 *     fires first.
 *   - The setTimeout handle is ALWAYS cleared when the race settles (no leaked
 *     handles in vitest), and unref()'d where available so it never keeps the
 *     process alive.
 */

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    // Don't keep the process alive for this timer (guarded — mocked
    // environments may not provide unref on the handle).
    (timer as { unref?: () => void }).unref?.();
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}
