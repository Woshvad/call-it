/**
 * @call-it/shared — barrel export
 *
 * Re-exports all constants, schemas, and types so consumers can:
 *   import { USDC_ARB_NATIVE } from '@call-it/shared'
 *
 * IMPORTANT (2026-05-29): these are EXPLICIT named re-exports, NOT `export *`.
 *   The relayer runs under tsx with `moduleResolution: NodeNext`, and Node's ESM
 *   linker cannot statically resolve NAMED imports through an `export *` barrel
 *   across a workspace-package boundary (namespace imports work, named imports
 *   throw "does not provide an export named X"). esbuild/tsx emit explicit
 *   `export { ... } from` as statically-linkable named exports, so this form works
 *   for the relayer (tsx) AND bundlers (web/webpack) AND vitest alike.
 *   Keep this explicit. If you add an export to a module below, add it here too.
 */

// ── Constants — USDC ──────────────────────────────────────────────────────────
export { USDC_ARB_NATIVE, USDC_DECIMALS, USDC_E_BRIDGED_DO_NOT_USE } from './constants/usdc.js';

// ── Constants — networks ──────────────────────────────────────────────────────
export { ARBITRUM_MAINNET_CHAIN_ID, ARBITRUM_SEPOLIA_CHAIN_ID, NETWORKS } from './constants/networks.js';
export type { NetworkName, NetworkRecord } from './constants/networks.js';

// ── Constants — addresses ─────────────────────────────────────────────────────
export {
  CIRCLE_PAYMASTER_ARBITRUM_ONE,
  CIRCLE_PAYMASTER_ARBITRUM_SEPOLIA,
  PYTH_ARBITRUM_ONE,
  PYTH_ARBITRUM_SEPOLIA,
  CALL_REGISTRY_ARBITRUM_SEPOLIA,
  PROFILE_REGISTRY_ARBITRUM_SEPOLIA,
  CALL_REGISTRY_ARBITRUM_ONE,
  PROFILE_REGISTRY_ARBITRUM_ONE,
  FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA,
  FOLLOW_FADE_MARKET_ARBITRUM_ONE,
  CALL_REGISTRY_ADDRESSES,
  PROFILE_REGISTRY_ADDRESSES,
  FOLLOW_FADE_MARKET_ADDRESSES,
  CHALLENGE_ESCROW_ADDRESSES,
  SETTLEMENT_MANAGER_ADDRESSES,
  SUBGRAPH_URL_SEPOLIA,
  SUBGRAPH_URL_MAINNET,
} from './constants/addresses.js';

// ── Constants — Pyth feed IDs ─────────────────────────────────────────────────
export {
  PYTH_BTC_USD,
  PYTH_ETH_USD,
  PYTH_SOL_USD,
  PYTH_UNI_USD_TODO_VERIFY,
  PYTH_LINK_USD_TODO_VERIFY,
  PYTH_AAVE_USD_TODO_VERIFY,
  PYTH_MKR_USD_TODO_VERIFY,
  PYTH_DOGE_USD_TODO_VERIFY,
  PYTH_ARB_USD,
  PYTH_OP_USD,
  PYTH_POL_USD,
  PYTH_MNT_USD,
  PYTH_GMX_USD,
  PYTH_PENDLE_USD,
  PYTH_RDNT_USD,
  PYTH_ONDO_USD,
  PYTH_EIGEN_USD,
  PYTH_ETHFI_USD,
  PYTH_EZETH_USD,
  PYTH_PEPE_USD,
  PYTH_WIF_USD,
  PYTH_BONK_USD,
  PYTH_RENDER_USD,
  PYTH_FET_USD,
  PYTH_FEED_IDS,
  PYTH_FEED_IDS_TODO_VERIFY,
} from './constants/pyth-feed-ids.js';

// ── Constants — fees ──────────────────────────────────────────────────────────
export {
  PROTOCOL_FEE_BPS,
  CREATOR_FEE_BPS,
  LP_FEE_BPS,
  TOTAL_SETTLEMENT_EXTRACTION_BPS,
  CALL_CREATION_FEE_USDC,
  MIN_STAKE_USDC,
  MAX_STAKE_USDC,
  MIN_POSITION_USDC,
  TVL_CAP_INITIAL_USDC,
  PYTH_CONFIDENCE_MULTIPLIER,
  PYTH_SETTLEMENT_RETRIES,
  PYTH_RETRY_INTERVAL_SECONDS,
} from './constants/fees.js';

// ── Schemas — env config ──────────────────────────────────────────────────────
export { EnvConfigSchema } from './schemas/env-config.js';
export type { EnvConfig } from './schemas/env-config.js';

// ── Types — call ──────────────────────────────────────────────────────────────
export {
  MARKET_TYPES,
  MARKET_TYPE_TO_UINT,
  UINT_TO_MARKET_TYPE,
  EVENT_SUBTYPES,
  EVENT_SUBTYPE_TO_UINT,
  UINT_TO_EVENT_SUBTYPE,
  CRITERIA_REQUIRED_EVENT_SUBTYPES,
  CATEGORIES,
  CATEGORY_TO_UINT,
  UINT_TO_CATEGORY,
  CALL_STATUSES,
  CALL_STATUS_TO_UINT,
  UINT_TO_CALL_STATUS,
} from './types/call.js';
export type { MarketType, EventSubtype, Category, CallStatus } from './types/call.js';

// ── Validation — call gates ───────────────────────────────────────────────────
export {
  MIN_STAKE,
  MAX_STAKE,
  CREATION_FEE,
  HIGH_CONVICTION_THRESHOLD,
  CONVICTION_AUTOCAP,
  CONVICTION_FLOOR_MIN_CALLS,
  MAX_HANDLE_LENGTH,
  stakeSchema,
  convictionSchema,
  createCallSchema,
  createCallSchemaStrict,
} from './validation/call-gates.js';
export type { CreateCallInput, CreateCallOutput } from './validation/call-gates.js';

// ── Hashing — duplicate hash ──────────────────────────────────────────────────
export { dayBucketUtc, computeDuplicateHash } from './hashing/duplicate-hash.js';
export type { DuplicateHashInput } from './hashing/duplicate-hash.js';

// ── Validation — follow-fade-gates (D-29 parity stubs) ────────────────────────
export {
  MIN_POSITION,
  MAX_POSITION,
  POSITION_EXIT_PENALTY_PCT,
  POSITION_EXIT_COOLDOWN,
  CALLER_EXIT_LOCK_DURATION,
  CALLER_EXIT_BASE_PCT,
  CALLER_EXIT_VARIABLE_PCT,
  CALLER_EXIT_REP_MAX_DELTA,
  CALLER_EXIT_REP_MIN_DELTA,
  SLIPPAGE_TOLERANCE_BPS,
  computeMinSharesOut,
  computeMinSharesOutWithSlippage,
  computeCallerExitPenaltyPct,
  computeCallerExitRepDelta,
  computePositionSlashSplit,
} from './validation/follow-fade-gates.js';
