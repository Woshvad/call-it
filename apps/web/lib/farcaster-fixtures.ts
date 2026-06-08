/**
 * Farcaster Mini App — shared status fixtures (Phase 8, Wave 0).
 *
 * Single source-of-truth for:
 *   1. the per-status Frame button set (D-02 context-aware buttons / D-06 settled triplet)
 *   2. a few representative seeded Sepolia callId strings used by every Phase-8 slice
 *
 * PURITY CONTRACT: this module reads no environment variables and performs no network
 * calls. Both the
 * web tests and the Frame route code import the button-selection table from here so
 * the wire endpoint (Plan 03) and its RED scaffold (frame-tx.test.ts) agree by
 * construction. Keep it side-effect free.
 *
 * Button semantics (D-02 / D-06 / D-06a):
 *   - Live call          → [Follow, Fade, Challenge]   (Fade is only meaningful pre-settlement)
 *   - Settled / Disputed / CallerExited → [Follow, Challenge, Quote]
 *     (Fade is gone post-settlement; Quote replaces it — D-06 settled triplet)
 *
 * One-tap vs deep-link (D-06a / D-07): on a Live call only the Challenge button is a
 * one-tap on-chain tx in v1 wire scope; Follow at the min stake ($1, 1_000_000 in
 * 6-dp USDC) is one-tap too. Follow/Quote on a SETTLED call are deep-links (off-chain
 * / not one-tap). This module only owns the *button set*; the per-button action policy
 * is asserted by frame-tx.test.ts against the Plan-03 route.
 */

/** Status labels the relayer `/api/calls/:id/live-state` can return. */
export type FarcasterCallStatus = 'Live' | 'Settled' | 'Disputed' | 'CallerExited';

/** A Frame button label. */
export type FarcasterButton = 'Follow' | 'Fade' | 'Challenge' | 'Quote';

/**
 * Canonical per-status button set (D-02 / D-06).
 * `as const` so the tuples are readonly + literal-typed for exact-match assertions.
 */
export const STATUS_BUTTON_SETS = {
  Live: ['Follow', 'Fade', 'Challenge'],
  Settled: ['Follow', 'Challenge', 'Quote'],
  Disputed: ['Follow', 'Challenge', 'Quote'],
  CallerExited: ['Follow', 'Challenge', 'Quote'],
} as const satisfies Record<FarcasterCallStatus, readonly FarcasterButton[]>;

/**
 * Pure selector: the button set for a given status.
 * Wire route (Plan 03) and frame-tx.test.ts both call this — no divergence possible.
 */
export function buttonsForStatus(status: FarcasterCallStatus): readonly FarcasterButton[] {
  return STATUS_BUTTON_SETS[status];
}

/**
 * Min one-tap follow stake in 6-dp USDC base units = $1.00 (D-07).
 * The Frame `follow(callId, amount, side)` wire uses this as the default amount;
 * larger stakes route to the full web app via deep-link.
 */
export const MIN_FOLLOW_STAKE_USDC_6DP = 1_000_000n;

/**
 * Representative seeded Sepolia callId fixtures for the Wave-1/2 slices.
 *
 * These ids exist on the canonical Phase-6 owner-key-recovery cluster
 * (CallRegistry 0xc79bB19d…, subgraph call-it-sepolia v0.9.0):
 *   - calls 1–12 seeded during the SAFETY-22/23/24 soak (6 of them settled "CALLED IT")
 *   - call #12 was caller-exited (SAFETY-25 drill, 2026-06-07)
 *   - call #14 is a seeded guaranteed-CallerLost call (Phase 7 SC1 baseline, quick 260608-lwe)
 *
 * If a slice needs a freshly-seeded id, re-seed and update here — these are documented
 * placeholders for the testnet wire path, NOT load-bearing mainnet values.
 */
export const SEEDED_CALL_IDS = {
  /** A live (un-settled) seeded call — Follow/Fade/Challenge button set. */
  live: '7',
  /** A settled "CALLED IT" seeded call — Follow/Challenge/Quote button set. */
  settled: '1',
  /** Caller-exited drill call #12 (SAFETY-25). */
  callerExited: '12',
  /** Seeded guaranteed-CallerLost call #14 (Phase 7 SC1 baseline). */
  callerLost: '14',
} as const;
