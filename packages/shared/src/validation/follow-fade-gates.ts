/**
 * FollowFadeMarket AMM parity stubs — D-29 anti-drift pattern.
 *
 * CROSS-LANGUAGE COUPLING (D-29 anti-drift):
 * The math functions below MUST mirror the Solidity implementations in
 * FollowFadeMarket.sol (created in Plan 02) exactly. Any divergence creates
 * silent frontend drift — users see different numbers than the contract computes.
 *
 * Formulas derived from:
 *   - 02-RESEARCH.md Pattern 2 (share minting)
 *   - 02-RESEARCH.md Pattern 3 (frontend minSharesOut computation)
 *   - 02-RESEARCH.md Pattern 4 (penalty split)
 *   - 02-RESEARCH.md Pattern 5 (caller exit penalty math)
 *   - 02-RESEARCH.md Pattern 6 (caller exit rep delta)
 *
 * Requirement: SOCIAL-05, SOCIAL-06, SOCIAL-13, SOCIAL-14, SOCIAL-18, SOCIAL-19, SOCIAL-26
 *
 * These are pure functions with no external dependencies.
 * All arithmetic uses BigInt to match Solidity integer precision.
 *
 * THREAT: T-02-W0-02 — Vitest fixture matrix cross-checks TS vs expected values
 * from contract formula; D-29 parity CI gate verifies no drift.
 */

// ─── Constants (single source of truth — must match FollowFadeMarket.sol) ─────

/** Minimum position per call: $1 USDC (6 decimals) — SOCIAL-03 */
export const MIN_POSITION = 1_000_000n as const;

/** Maximum cumulative position per user per call: $100 USDC (6 decimals) — SOCIAL-04 */
export const MAX_POSITION = 100_000_000n as const;

/** Position exit penalty: 10% of position value — SOCIAL-13 */
export const POSITION_EXIT_PENALTY_PCT = 10n as const;

/** Position exit cooldown: 4 hours in seconds — SOCIAL-12 */
export const POSITION_EXIT_COOLDOWN = 14400n as const;

/** Caller exit lock duration: 24 hours in seconds — SOCIAL-17 */
export const CALLER_EXIT_LOCK_DURATION = 86400n as const;

/** Caller exit base penalty: 15% floor — SOCIAL-18 */
export const CALLER_EXIT_BASE_PCT = 15n as const;

/** Caller exit variable penalty: 35% at earliest exit — SOCIAL-18 */
export const CALLER_EXIT_VARIABLE_PCT = 35n as const;

/** Rep delta at earliest exit (24h after creation): -45 — SOCIAL-26 */
export const CALLER_EXIT_REP_MAX_DELTA = -45 as const;

/** Rep delta floor (at or after expiry): -10 — SOCIAL-26 */
export const CALLER_EXIT_REP_MIN_DELTA = -10 as const;

/** Slippage tolerance in basis points: 100 = 1% — SOCIAL-06 */
export const SLIPPAGE_TOLERANCE_BPS = 100n as const;

// ─── AMM Share Math ───────────────────────────────────────────────────────────

/**
 * Compute the number of shares minted for a deposit into a pool.
 *
 * Formula (constant-product AMM):
 *   sharesOut = totalShares * amountIn / (reserve + amountIn)
 *
 * Mirrors FollowFadeMarket._mintShares() exactly.
 * Uses BigInt division (rounds down, matching Solidity truncation).
 *
 * @param totalShares - Current total shares in the pool (18-decimal units)
 * @param reserve - Current pool reserve in USDC (6-decimal units)
 * @param amountIn - Deposit amount in USDC (6-decimal units)
 * @returns Shares minted (18-decimal units), or 0n if reserve + amountIn is 0
 */
export function computeMinSharesOut(
  totalShares: bigint,
  reserve: bigint,
  amountIn: bigint
): bigint {
  const denominator = reserve + amountIn;
  if (denominator === 0n) return 0n;
  // sharesOut = totalShares * amountIn / (reserve + amountIn)
  // BigInt division truncates (matches Solidity)
  return (totalShares * amountIn) / denominator;
}

/**
 * Compute the minSharesOut param for the frontend with 1% slippage tolerance.
 *
 * Per SOCIAL-06: minSharesOut = expected * 99 / 100 (1% tolerance).
 * This is the value to pass to follow() / fade() to protect against front-running.
 *
 * @param totalShares - Current total shares in the pool (18-decimal)
 * @param reserve - Current pool reserve in USDC (6-decimal)
 * @param amountIn - Deposit amount in USDC (6-decimal)
 * @returns minSharesOut with 1% slippage tolerance applied
 */
export function computeMinSharesOutWithSlippage(
  totalShares: bigint,
  reserve: bigint,
  amountIn: bigint
): bigint {
  const expected = computeMinSharesOut(totalShares, reserve, amountIn);
  // Apply 1% tolerance: expected * (10000 - SLIPPAGE_TOLERANCE_BPS) / 10000
  return (expected * (10000n - SLIPPAGE_TOLERANCE_BPS)) / 10000n;
}

// ─── Caller Exit Penalty Math ─────────────────────────────────────────────────

/**
 * Compute the caller exit penalty percentage.
 *
 * Formula: penalty = 15% + (35% * time_remaining_ratio)
 * where time_remaining_ratio = (expiry - now) / (expiry - createdAt)
 *
 * Range: [15, 50] where 50 is the maximum at the earliest exit (24h after creation)
 * and 15 is the floor at or after expiry.
 *
 * Mirrors FollowFadeMarket._callerExitPenaltyPct() exactly.
 * Uses BigInt integer math — truncates toward zero (matching Solidity).
 *
 * @param createdAt - Call creation timestamp in seconds (BigInt)
 * @param expiry - Call expiry timestamp in seconds (BigInt)
 * @param now - Current timestamp in seconds (BigInt)
 * @returns Integer penalty percentage in range [15, 50]
 */
export function computeCallerExitPenaltyPct(
  createdAt: bigint,
  expiry: bigint,
  now: bigint
): number {
  // If call has expired or at expiry: floor penalty
  if (now >= expiry) {
    return Number(CALLER_EXIT_BASE_PCT);
  }

  const totalDuration = expiry - createdAt;
  if (totalDuration === 0n) {
    // Edge case: zero-duration call — return floor
    return Number(CALLER_EXIT_BASE_PCT);
  }

  const remaining = expiry - now;
  // variable = CALLER_EXIT_VARIABLE_PCT * remaining / totalDuration (integer division)
  const variable = (CALLER_EXIT_VARIABLE_PCT * remaining) / totalDuration;
  const penaltyPct = CALLER_EXIT_BASE_PCT + variable;

  return Number(penaltyPct);
}

// ─── Caller Exit Rep Delta ─────────────────────────────────────────────────────

/**
 * Compute the reputation delta applied when a caller exits early.
 *
 * Formula (linear decay):
 *   delta = -(45 - 35 * elapsed_ratio)
 *   where elapsed_ratio = (now - createdAt) / (expiry - createdAt)
 *   Range: [-45, -10], floor at -10
 *
 * Mirrors FollowFadeMarket._callerExitRepDelta() exactly.
 * Integer math: truncates toward zero.
 *
 * @param createdAt - Call creation timestamp in seconds (BigInt)
 * @param expiry - Call expiry timestamp in seconds (BigInt)
 * @param now - Current timestamp in seconds (BigInt)
 * @returns Integer rep delta in range [-45, -10] (always negative)
 */
export function computeCallerExitRepDelta(
  createdAt: bigint,
  expiry: bigint,
  now: bigint
): number {
  const totalDuration = expiry - createdAt;
  if (totalDuration === 0n) {
    // Edge: zero-duration call — return floor
    return CALLER_EXIT_REP_MIN_DELTA;
  }

  // Clamp elapsed to [0, totalDuration]
  const rawElapsed = now - createdAt;
  const elapsed = rawElapsed < 0n ? 0n : rawElapsed > totalDuration ? totalDuration : rawElapsed;

  // absDelta = (45 * totalDuration - 35 * elapsed) / totalDuration
  // At elapsed=0: absDelta = 45; at elapsed=totalDuration: absDelta = 10
  const numerator = 45n * totalDuration - 35n * elapsed;
  let absDelta = Number(numerator / totalDuration);

  // Floor at 10 (handles rounding if elapsed slightly > totalDuration)
  if (absDelta < 10) absDelta = 10;
  // Ceiling at 45
  if (absDelta > 45) absDelta = 45;

  return -absDelta;
}

// ─── Position Slash Split ─────────────────────────────────────────────────────

/**
 * Compute the 50/40/10 split for a position exit slash.
 *
 * Per SOCIAL-14 (position exit) and SOCIAL-19 (caller exit):
 *   50% → opposite pool reserve (toOpposite)
 *   40% → same-side pool reserve (toSameSide)
 *   10% → treasury (toTreasury = slash - toOpposite - toSameSide)
 *
 * Uses subtraction for the last term to avoid rounding dust (T-02-W0-03).
 * Mirrors the Solidity split exactly.
 *
 * @param slash - Total slashed USDC amount (6-decimal units)
 * @returns Split amounts in USDC (6-decimal)
 */
export function computePositionSlashSplit(slash: bigint): {
  toOpposite: bigint;
  toSameSide: bigint;
  toTreasury: bigint;
} {
  const toOpposite = (slash * 50n) / 100n;
  const toSameSide = (slash * 40n) / 100n;
  // Last term uses subtraction to capture any rounding dust (Pitfall: avoid triple-multiply)
  const toTreasury = slash - toOpposite - toSameSide;

  return { toOpposite, toSameSide, toTreasury };
}
