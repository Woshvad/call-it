/**
 * Shared Arbitrum-Sepolia RPC transport factory (quick-260613-r3u).
 *
 * This is the SINGLE source of Arbitrum-Sepolia RPC resolution for the relayer.
 * Every Sepolia viem client (notification fan-out, settlement poller, live-state,
 * duel-live-state, profile, call enrichment, oauth-proof submitter) builds its
 * transport through this helper so that RPC resolution + failover order live in
 * exactly one place.
 *
 * Canonical resolution order (matches every other Sepolia call site):
 *   RPC_URL_ARBITRUM_SEPOLIA (Fly/GCP secret in prod)
 *     ?? ARBITRUM_SEPOLIA_RPC_URL (local .env.local, matches foundry/web)
 *
 * Fallback rung order:
 *   1. `override` (if truthy) — pre-resolved RPC URL. Used by oauth-proof-submitter
 *      which already resolves a local `rpcUrl` arg before calling.
 *   2. Primary keyed rung — canonical resolution above. If BOTH env vars are unset
 *      no keyed rung is pushed, so the array falls through to the single bare public
 *      rung below (preserves today's "unset => public RPC" behavior without ever
 *      emitting two bare http() rungs).
 *   3. Optional 2nd keyed rung — `RPC_URL_ARBITRUM_SEPOLIA_2`, operator-optional.
 *      A second keyed provider survives one provider's mid-month 429 capacity wall
 *      (ref quick-260611-co5 / the 2026-06-11 Alchemy capacity outage that silently
 *      degraded every read to throttled public RPC). Set it with one Fly secret.
 *   4. Always-last bare public rung — viem's default public RPC, pushed exactly once.
 *
 * `httpOpts` (when provided) is applied to EVERY rung so throttled callers can pass
 * `{ timeout: 5_000, retryCount: 1 }` (call-enrichment, profile) and have it cover
 * the keyed AND public legs.
 *
 * NOTE: ens-resolver.ts is intentionally NOT a consumer — it targets Ethereum
 * mainnet ENS (a different chain), so it owns its own mainnet RPC resolution.
 */

import { fallback, http, type Transport } from 'viem';

export function makeSepoliaTransport(
  override?: string,
  httpOpts?: Parameters<typeof http>[1],
): Transport {
  const rungs: ReturnType<typeof http>[] = [];

  // 1. Optional pre-resolved override rung.
  if (override) {
    rungs.push(http(override, httpOpts));
  }

  // 2. Primary keyed rung (canonical resolution). Skip when both are unset so we
  //    never emit two bare public http() rungs.
  const primary =
    process.env.RPC_URL_ARBITRUM_SEPOLIA ?? process.env.ARBITRUM_SEPOLIA_RPC_URL;
  if (primary) {
    rungs.push(http(primary, httpOpts));
  }

  // 3. Optional 2nd keyed rung (operator-optional second provider).
  if (process.env.RPC_URL_ARBITRUM_SEPOLIA_2) {
    rungs.push(http(process.env.RPC_URL_ARBITRUM_SEPOLIA_2, httpOpts));
  }

  // 4. Always-last bare public rung (exactly once).
  rungs.push(http(undefined, httpOpts));

  return fallback(rungs);
}
