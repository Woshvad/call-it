/**
 * Call-related enums, type unions, and integer maps — shared across frontend + relayer.
 *
 * CROSS-LANGUAGE COUPLING (D-29 anti-drift):
 * These integer maps MUST stay in sync with the Solidity enum order in
 * packages/contracts/src/interfaces/ICallRegistry.sol.
 *
 *   enum MarketType  { PriceTarget=0, SpreadVs=1, Event=2 }
 *   enum EventSubtype{ None=0, TvlMilestone=1, VolumeFees=2, OnchainMetric=3,
 *                      CexListing=4, TokenLaunch=5, Governance=6, ProtocolMilestone=7 }
 *   enum Category    { Majors=0, DeFi=1, Other=2 }
 *   enum CallStatus  { Live=0, Settled=1, Disputed=2, CallerExited=3 }
 *
 * The Plan 03 Vitest parity test asserts these integer values match the contract.
 * Any change here MUST be mirrored in the Solidity enums (or the parity CI gate fires).
 *
 * Source: RESEARCH "Common Operation 4" + ICallRegistry.sol enum order
 * Requirement: CALL-22, CALL-23, CALL-24, D-29
 */

// ─── Market type ──────────────────────────────────────────────────────────────

/** Tuple of all valid market type strings (preserves Solidity enum order). */
export const MARKET_TYPES = ['priceTarget', 'spreadVs', 'event'] as const;

/** Union of all valid market type strings. */
export type MarketType = (typeof MARKET_TYPES)[number];

/**
 * Map from TS market type string → Solidity enum integer value.
 * MUST match ICallRegistry.sol: PriceTarget=0, SpreadVs=1, Event=2
 */
export const MARKET_TYPE_TO_UINT: Record<MarketType, number> = {
  priceTarget: 0,
  spreadVs: 1,
  event: 2,
} as const;

/**
 * Map from Solidity enum integer → TS market type string (inverse of above).
 */
export const UINT_TO_MARKET_TYPE: Record<number, MarketType> = {
  0: 'priceTarget',
  1: 'spreadVs',
  2: 'event',
} as const;

// ─── Event subtype ────────────────────────────────────────────────────────────

/** Tuple of all valid event subtype strings (preserves Solidity enum order). */
export const EVENT_SUBTYPES = [
  'none',
  'tvlMilestone',
  'volumeFees',
  'onchainMetric',
  'cexListing',
  'tokenLaunch',
  'governance',
  'protocolMilestone',
] as const;

/** Union of all valid event subtype strings. */
export type EventSubtype = (typeof EVENT_SUBTYPES)[number];

/**
 * Map from TS event subtype string → Solidity enum integer value.
 * MUST match ICallRegistry.sol: None=0, TvlMilestone=1, VolumeFees=2, OnchainMetric=3,
 * CexListing=4, TokenLaunch=5, Governance=6, ProtocolMilestone=7
 */
export const EVENT_SUBTYPE_TO_UINT: Record<EventSubtype, number> = {
  none: 0,
  tvlMilestone: 1,
  volumeFees: 2,
  onchainMetric: 3,
  cexListing: 4,
  tokenLaunch: 5,
  governance: 6,
  protocolMilestone: 7,
} as const;

/**
 * Map from Solidity enum integer → TS event subtype string (inverse of above).
 */
export const UINT_TO_EVENT_SUBTYPE: Record<number, EventSubtype> = {
  0: 'none',
  1: 'tvlMilestone',
  2: 'volumeFees',
  3: 'onchainMetric',
  4: 'cexListing',
  5: 'tokenLaunch',
  6: 'governance',
  7: 'protocolMilestone',
} as const;

/** Event subtypes that require a resolution criteria text (CALL-15/16, CALL-49). */
export const CRITERIA_REQUIRED_EVENT_SUBTYPES: ReadonlySet<EventSubtype> = new Set([
  'cexListing',
  'tokenLaunch',
  'governance',
  'protocolMilestone',
] as const);

// ─── Category ─────────────────────────────────────────────────────────────────

/** Tuple of all valid category strings (preserves Solidity enum order). */
export const CATEGORIES = ['majors', 'defi', 'other'] as const;

/** Union of all valid category strings. */
export type Category = (typeof CATEGORIES)[number];

/**
 * Map from TS category string → Solidity enum integer value.
 * MUST match ICallRegistry.sol: Majors=0, DeFi=1, Other=2
 */
export const CATEGORY_TO_UINT: Record<Category, number> = {
  majors: 0,
  defi: 1,
  other: 2,
} as const;

/**
 * Map from Solidity enum integer → TS category string (inverse of above).
 */
export const UINT_TO_CATEGORY: Record<number, Category> = {
  0: 'majors',
  1: 'defi',
  2: 'other',
} as const;

// ─── Call status ──────────────────────────────────────────────────────────────

/** Tuple of all valid call status strings (preserves Solidity enum order). */
export const CALL_STATUSES = ['live', 'settled', 'disputed', 'callerExited'] as const;

/** Union of all valid call status strings. */
export type CallStatus = (typeof CALL_STATUSES)[number];

/**
 * Map from TS call status string → Solidity enum integer value.
 * MUST match ICallRegistry.sol: Live=0, Settled=1, Disputed=2, CallerExited=3
 */
export const CALL_STATUS_TO_UINT: Record<CallStatus, number> = {
  live: 0,
  settled: 1,
  disputed: 2,
  callerExited: 3,
} as const;

/**
 * Map from Solidity enum integer → TS call status string (inverse of above).
 */
export const UINT_TO_CALL_STATUS: Record<number, CallStatus> = {
  0: 'live',
  1: 'settled',
  2: 'disputed',
  3: 'callerExited',
} as const;
