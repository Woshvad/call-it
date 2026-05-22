// Phase 1 mapping handlers for CallRegistry events.
// Extends the Phase 0 stub — block handler removed; real event handlers wired.
//
// Requirements: OPS-01, OPS-03, OPS-04 (D-24 subgraph-primary feed, 30s indexing SLA)
// Pitfall C closure: schema is aligned with Phase 1 real ABI (CallCreated/ConvictionCapped).
//
// AssemblyScript constraints:
//   - No closures
//   - No null for value types (use 0 / empty string / Bytes.empty())
//   - @graphprotocol/graph-ts BigInt / Bytes helpers required for uint256 / bytes32

import { BigInt, Bytes } from '@graphprotocol/graph-ts';

import {
  CallCreated,
  CallQuoted,
  ConvictionCapped,
  AssetAllowlisted,
  NftCollectionAllowlisted,
  TvlCapSet,
  SettlementManagerSet,
} from '../generated/CallRegistry/CallRegistry';

import { Call, Profile, ConvictionCap } from '../generated/schema';

// ── Helper: lazy-init a Profile entity ──────────────────────────────────────

function ensureProfile(id: string): Profile {
  let profile = Profile.load(id);
  if (profile == null) {
    profile = new Profile(id);
    // REP-01 mirror: cold-start globalRep = 100
    profile.globalRep = 100;
    profile.totalCalls = 0;
    profile.settledCalls = 0;
    profile.wins = 0;
    profile.losses = 0;
    profile.twitterHandle = null;
    profile.farcasterHandle = null;
    profile.handle = null;
    profile.displayHandle = null;
    profile.tagline = null;
    profile.lastActiveAt = BigInt.fromI32(0);
  }
  return profile as Profile;
}

// ── CallCreated ───────────────────────────────────────────────────────────────
// event CallCreated(uint256 indexed id, address indexed caller, uint8 marketType, uint96 stake)
// Updates: creates Call entity + lazy-inits Profile + increments totalCalls

export function handleCallCreated(event: CallCreated): void {
  let callId = event.params.id.toString();
  let callerHex = event.params.caller.toHexString();

  // Lazy-init caller profile
  let profile = ensureProfile(callerHex);
  profile.totalCalls = profile.totalCalls + 1;
  profile.lastActiveAt = event.block.timestamp;
  profile.save();

  // Create Call entity
  let call = new Call(callId);
  call.caller = event.params.caller;
  call.callerProfile = callerHex;
  call.marketType = event.params.marketType as i32;
  call.eventSubtype = 0; // not in event; default None
  call.asset = ''; // asset symbol not in event; populated by relayer or future enrichment
  call.stake = event.params.stake;
  call.expiry = BigInt.fromI32(0); // not in event; relayer enriches
  call.conviction = 50; // default; not in event
  call.status = 'Live';
  call.outcome = null;
  call.reasoning = null;
  call.createdAt = event.block.timestamp;
  call.settledAt = null;
  call.quoteOf = null;
  call.save();
}

// ── CallQuoted ────────────────────────────────────────────────────────────────
// event CallQuoted(uint256 indexed parentId, uint256 indexed quoteId)
// Updates: sets quoteOf reference on the child call

export function handleCallQuoted(event: CallQuoted): void {
  let quoteId = event.params.quoteId.toString();
  let parentId = event.params.parentId.toString();

  let quoteCall = Call.load(quoteId);
  if (quoteCall == null) {
    // Child call may not have been indexed yet — create a stub for forward-compat
    quoteCall = new Call(quoteId);
    quoteCall.caller = Bytes.empty();
    quoteCall.callerProfile = null;
    quoteCall.marketType = 0;
    quoteCall.eventSubtype = 0;
    quoteCall.asset = '';
    quoteCall.stake = BigInt.fromI32(0);
    quoteCall.expiry = BigInt.fromI32(0);
    quoteCall.conviction = 50;
    quoteCall.status = 'Live';
    quoteCall.outcome = null;
    quoteCall.reasoning = null;
    quoteCall.createdAt = event.block.timestamp;
    quoteCall.settledAt = null;
  }
  quoteCall.quoteOf = parentId;
  quoteCall.save();
}

// ── ConvictionCapped ─────────────────────────────────────────────────────────
// event ConvictionCapped(address indexed caller, uint8 requested, uint8 applied)
// Updates: creates immutable ConvictionCap record; no Profile update (rep logic is Phase 5)

export function handleConvictionCapped(event: ConvictionCapped): void {
  // Use tx hash + log index for unique immutable ID
  let id = event.transaction.hash.toHexString() + '-' + event.logIndex.toString();
  let cap = new ConvictionCap(id);
  cap.user = event.params.caller;
  cap.attempted = event.params.requested as i32;
  cap.capped = event.params.applied as i32;
  cap.timestamp = event.block.timestamp;
  cap.save();
}

// ── AssetAllowlisted ─────────────────────────────────────────────────────────
// event AssetAllowlisted(string symbol, bytes32 feedId)
// No schema entity for this in Phase 1 — indexed for forward-compat query support.
// Phase 5 enrichment will read these to populate call.asset from the allowlist map.

export function handleAssetAllowlisted(event: AssetAllowlisted): void {
  // Intentional no-op in Phase 1. The event is indexed by The Graph for queryability.
  // The call.asset field will be enriched via a separate lookup map in Phase 5.
  // Logging: event.params.symbol, event.params.feedId are available for future use.
}

// ── NftCollectionAllowlisted ──────────────────────────────────────────────────
// event NftCollectionAllowlisted(address indexed collection)
// No schema entity for this in Phase 1 — indexed for forward-compat.

export function handleNftCollectionAllowlisted(event: NftCollectionAllowlisted): void {
  // Intentional no-op in Phase 1. Indexed for queryability.
}

// ── TvlCapSet ─────────────────────────────────────────────────────────────────
// event TvlCapSet(uint256 newCap)
// No schema entity for this in Phase 1 — indexed for forward-compat.

export function handleTvlCapSet(event: TvlCapSet): void {
  // Intentional no-op in Phase 1. Indexed for queryability.
}

// ── SettlementManagerSet ──────────────────────────────────────────────────────
// event SettlementManagerSet(address indexed newManager)
// No schema entity for this in Phase 1 — indexed for forward-compat.

export function handleSettlementManagerSet(event: SettlementManagerSet): void {
  // Intentional no-op in Phase 1. Indexed for queryability.
}
