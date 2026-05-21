/**
 * Fee schedule constants for Call It v1.
 *
 * All basis-point (BPS) values: 1 bps = 0.01%.
 * All bigint USDC amounts: 6 decimal places (1 USDC = 1_000_000n).
 *
 * Source: CALL_IT_SPEC1.md §11.2 (fee schedule)
 * Spec: §8.4 safety caps, §10.7 paymaster cap
 */

// ---------------------------------------------------------------------------
// Settlement fee schedule (Model B — exited callers)
// Total extraction at settlement: 1.7%
// ---------------------------------------------------------------------------

/** Protocol fee: 1.0% of settlement amount */
export const PROTOCOL_FEE_BPS = 100 as const;

/** Creator fee: 0.4% of settlement amount (Model B: exited callers) */
export const CREATOR_FEE_BPS = 40 as const;

/** LP (liquidity provider) fee: 0.3% of settlement amount */
export const LP_FEE_BPS = 30 as const;

/** Total extraction at settlement: 1.7% (PROTOCOL + CREATOR + LP) */
export const TOTAL_SETTLEMENT_EXTRACTION_BPS = 170 as const;

// Invariant check (evaluated at module load time in dev):
if (PROTOCOL_FEE_BPS + CREATOR_FEE_BPS + LP_FEE_BPS !== TOTAL_SETTLEMENT_EXTRACTION_BPS) {
  throw new Error(
    `Fee BPS invariant violated: ${PROTOCOL_FEE_BPS} + ${CREATOR_FEE_BPS} + ${LP_FEE_BPS} !== ${TOTAL_SETTLEMENT_EXTRACTION_BPS}`,
  );
}

// ---------------------------------------------------------------------------
// USDC amounts (bigint, 6 decimal places)
// ---------------------------------------------------------------------------

/** Market creation fee: $10 USDC flat (§11.2) */
export const CALL_CREATION_FEE_USDC = 10_000_000n as const;

/** Minimum stake per call: $5 USDC (§8.4, Gate 6.1) */
export const MIN_STAKE_USDC = 5_000_000n as const;

/** Maximum stake per call: $100 USDC (§8.4, §10.1) */
export const MAX_STAKE_USDC = 100_000_000n as const;

/** Minimum follow/fade position: $1 USDC (§8.4) */
export const MIN_POSITION_USDC = 1_000_000n as const;

/** Initial TVL cap: $5,000 USDC (owner-raisable up to $100K via setTvlCap) */
export const TVL_CAP_INITIAL_USDC = 5_000_000_000n as const;

// ---------------------------------------------------------------------------
// Pyth oracle confidence gate (§13.1)
// ---------------------------------------------------------------------------

/** Pyth confidence multiplier: price.confidence * 200 must be ≤ price.price */
export const PYTH_CONFIDENCE_MULTIPLIER = 200 as const;

/** Pyth settlement retries: 30 × 60s = 30 minutes before dispute window opens */
export const PYTH_SETTLEMENT_RETRIES = 30 as const;

/** Pyth retry interval in seconds */
export const PYTH_RETRY_INTERVAL_SECONDS = 60 as const;
