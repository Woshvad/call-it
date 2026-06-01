/**
 * Call creation Zod schemas + gate constants — single source of truth for both
 * the New Call form (Plan 08 RHF resolver) and the relayer preflight endpoint
 * (Plan 07 POST /api/calls/preflight).
 *
 * CROSS-LANGUAGE COUPLING (D-29 anti-drift):
 * The named constants below MUST match the Solidity constants in CallRegistry.sol:
 *
 *   MIN_STAKE           → CallRegistry.MIN_STAKE         = 5_000_000 (5 USDC)
 *   MAX_STAKE           → CallRegistry.MAX_STAKE         = 100_000_000 (100 USDC)
 *   CREATION_FEE        → CallRegistry.CREATION_FEE      = 10_000_000 (10 USDC)
 *   HIGH_CONVICTION_THRESHOLD → CallRegistry.HIGH_CONVICTION_THRESHOLD = 85
 *   CONVICTION_AUTOCAP  → CallRegistry.CONVICTION_AUTOCAP = 84
 *   CONVICTION_FLOOR_MIN_CALLS → CallRegistry.CONVICTION_FLOOR_MIN_CALLS = 10
 *   MAX_HANDLE_LENGTH   → ProfileRegistry.MAX_HANDLE_LENGTH = 50
 *
 * The Plan 03 parity test asserts these integer values match the deployed contract.
 * Any change here MUST be mirrored in the Solidity source (or the parity CI gate fires).
 *
 * Gate sequence follows CallRegistry.sol _executeCreate order:
 *   Gate 6.1: Stake bounds (StakeBelowMinimum / StakeAboveMaximum)
 *   Gate 6.2: Duplicate hash (DuplicateCall — relayer-side pre-check; schema passes)
 *   Gate 6.3: Conviction floor (ConvictionCapped — auto-cap, not revert)
 *   CALL-32: Expiry in future (ExpiryNotInFuture)
 *   CALL-33: Category valid (CategoryInvalid)
 *   CALL-13: Asset allowlisted (AssetNotAllowlisted — relayer-side; schema passes)
 *   CALL-15/16: Criteria required (CriteriaRequired)
 *   CALL-34: TVL cap (TvlCapReached — relayer-side; schema passes)
 *   CALL-35/36: USDC pre-checks (relayer-side; schema passes)
 *
 * Source: RESEARCH "Common Operation 4" lines 1384-1430; ICallRegistry.sol
 * Requirement: CALL-13, CALL-15, CALL-16, CALL-22..26, CALL-29..33, CALL-46, CALL-48, CALL-49
 */

import { z } from 'zod';
import { MARKET_TYPES, EVENT_SUBTYPES, CATEGORIES } from '../types/call';

// ─── Constants (single source of truth — must match Solidity contract) ────────

/** Minimum stake per call: $5 USDC (Gate 6.1, §8.4) */
export const MIN_STAKE = 5_000_000n as const;

/** Maximum stake per call: $100 USDC (Gate 6.1, §10.1) */
export const MAX_STAKE = 100_000_000n as const;

/** Market creation fee: $10 USDC flat (§11.2) */
export const CREATION_FEE = 10_000_000n as const;

/**
 * High-conviction threshold: conviction >= 85 triggers the floor check (Gate 6.3).
 * CALL-29/31: callers with < CONVICTION_FLOOR_MIN_CALLS settled calls are capped.
 */
export const HIGH_CONVICTION_THRESHOLD = 85 as const;

/**
 * Auto-cap value: conviction >= 85 with < 10 settled calls is capped to 84.
 * This is NOT a revert — the contract emits ConvictionCapped and continues.
 */
export const CONVICTION_AUTOCAP = 84 as const;

/**
 * Minimum settled calls required to use high conviction (Gate 6.3).
 * If settledCalls < 10 AND conviction >= 85, conviction is capped to 84.
 */
export const CONVICTION_FLOOR_MIN_CALLS = 10 as const;

/**
 * Maximum display handle length in ProfileRegistry.
 * Used by forms to validate handle input length (AUTH-35).
 */
export const MAX_HANDLE_LENGTH = 50 as const;

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

/**
 * Stake validation: must be [MIN_STAKE, MAX_STAKE] in USDC base units (6 decimals).
 * Mirrors Gate 6.1: StakeBelowMinimum / StakeAboveMaximum reverts.
 */
export const stakeSchema = z
  .bigint()
  .min(MIN_STAKE, { message: 'Stake must be at least $5 USDC (5,000,000 base units)' })
  .max(MAX_STAKE, { message: 'Stake cannot exceed $100 USDC (100,000,000 base units)' });

/**
 * Conviction validation: integer 1–100.
 * Note: high-conviction floor (Gate 6.3) is handled in superRefine, not here.
 */
export const convictionSchema = z
  .number()
  .int({ message: 'Conviction must be an integer' })
  .min(1, { message: 'Conviction must be at least 1' })
  .max(100, { message: 'Conviction cannot exceed 100' });

// ─── createCallSchema (form input — mirrors contract gate sequence) ────────────

/**
 * Zod schema for raw form input for creating a call.
 *
 * D-29: This schema must produce the same pass/revert outcomes as CallRegistry.sol
 * for every case in packages/contracts/test/fixtures/gate-matrix.json.
 *
 * Intentional divergences from the contract (noted):
 * - DuplicateCall (Gate 6.2): NOT checked here — relayer dup-check endpoint handles it
 *   (Plan 07 POST /api/calls/dup-check). Schema always passes this gate locally.
 * - AssetNotAllowlisted (CALL-13): NOT checked here — relayer pre-checks the allowlist.
 *   Schema always passes locally (asset field is a freeform string).
 * - TvlCapReached (CALL-34): NOT checked here — relayer pre-checks TVL headroom.
 * - InsufficientUsdcAllowance/Balance (CALL-35/36): NOT checked here — relayer only.
 * - CategoryInvalid (CALL-33): Handled implicitly — Zod enum rejects values outside
 *   CATEGORIES tuple, so this maps to a 'category' Zod issue (not an explicit revert).
 *
 * These intentional mismatches are labeled "pass-for-zod-revert-for-contract" in
 * gate-matrix.json and are explicitly excluded from the parity diff (Plan 03 Task 3).
 */
export const createCallSchema = z
  .object({
    /** Market type: 'priceTarget' | 'spreadVs' | 'event' */
    marketType: z.enum(MARKET_TYPES),
    /** Event subtype (only meaningful when marketType === 'event') */
    eventSubtype: z.enum(EVENT_SUBTYPES),
    /** Category: 'majors' | 'defi' | 'other' */
    category: z.enum(CATEGORIES),
    /** Primary asset identifier (symbol or Pyth feed ID) */
    assetA: z.string().min(1, { message: 'Asset is required' }),
    /** Secondary asset identifier (only for spreadVs) */
    assetB: z.string().optional(),
    /** Target price or milestone value (bigint, positive) */
    targetValue: z.bigint().positive({ message: 'Target value must be positive' }),
    /**
     * Expiry timestamp (UNIX seconds, bigint).
     * Must be strictly greater than current time (CALL-32).
     */
    expiry: z.bigint(),
    /** Stake in USDC base units (Gate 6.1) */
    stake: stakeSchema,
    /** Conviction 1–100 (Gate 6.3 auto-caps to 84 if >= 85 and settled < 10) */
    conviction: convictionSchema,
    /**
     * Resolution criteria text — required for certain event subtypes (CALL-15/16/49).
     * The relayer hashes this to bytes32 (keccak256) before submitting to the contract.
     */
    criteriaText: z.string().optional(),
    /** Whether this call is open to challenges */
    openToChallenges: z.boolean(),
    /** Parent call ID for quote-calls (0 = no parent) */
    parentCallId: z.bigint().optional(),
    /**
     * Number of caller's settled calls — read from ProfileRegistry.settledCalls(user).
     * Used for Gate 6.3 conviction floor check.
     * Plan 08 provides this from wagmi useReadContract on /new mount.
     */
    callerSettledCalls: z.number().int().nonnegative(),
  })
  .superRefine((data, ctx) => {
    // ─── CALL-32: Expiry must be in the future ──────────────────────────────
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    if (data.expiry <= nowSeconds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiry'],
        message: 'Deadline must be in the future',
      });
    }

    // ─── CALL-15/16/49: Criteria required for event subtypes ────────────────
    // Contract reverts CriteriaRequired if criteriaHash is bytes32(0) for these subtypes.
    // TS equivalent: criteriaText must be non-empty and >= 50 chars.
    const criteriaRequiredSubtypes = new Set([
      'cexListing',
      'tokenLaunch',
      'governance',
      'protocolMilestone',
    ] as const);

    if (
      data.marketType === 'event' &&
      criteriaRequiredSubtypes.has(data.eventSubtype as 'cexListing' | 'tokenLaunch' | 'governance' | 'protocolMilestone')
    ) {
      if (!data.criteriaText || data.criteriaText.length < 50) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['criteriaText'],
          message:
            'Resolution Criteria is required (≥50 characters) for this event type',
        });
      }
    }

    // ─── Gate 6.3: Conviction auto-cap warning ──────────────────────────────
    // The CONTRACT auto-caps (emits ConvictionCapped, does NOT revert).
    // The SCHEMA also succeeds but emits a custom warning issue so the form
    // can display inline "will be capped to 84" feedback (D-31).
    // This is an INFORMATIONAL issue only — success is still true.
    if (
      data.conviction >= HIGH_CONVICTION_THRESHOLD &&
      data.callerSettledCalls < CONVICTION_FLOOR_MIN_CALLS
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['conviction'],
        message: `Conviction will be auto-capped to ${CONVICTION_AUTOCAP} (CALL-30/31): you need ${CONVICTION_FLOOR_MIN_CALLS} settled calls to use conviction ≥${HIGH_CONVICTION_THRESHOLD}`,
        params: { isWarning: true, appliedConviction: CONVICTION_AUTOCAP },
      });
    }
  });

/**
 * createCallSchema with the conviction auto-cap applied to parsed data.
 *
 * After parse, `conviction` is set to CONVICTION_AUTOCAP if the cap fired.
 * This matches the contract's behavior: ConvictionCapped emitted, call proceeds with 84.
 *
 * Use this schema where you need the settled output conviction value
 * (e.g., displaying the receipt preview with the capped value).
 */
export const createCallSchemaStrict = createCallSchema.transform((data) => {
  if (
    data.conviction >= HIGH_CONVICTION_THRESHOLD &&
    data.callerSettledCalls < CONVICTION_FLOOR_MIN_CALLS
  ) {
    return { ...data, conviction: CONVICTION_AUTOCAP };
  }
  return data;
});

/** TypeScript type inferred from createCallSchema input. */
export type CreateCallInput = z.input<typeof createCallSchema>;

/** TypeScript type inferred from createCallSchemaStrict output (post-transform). */
export type CreateCallOutput = z.output<typeof createCallSchemaStrict>;
