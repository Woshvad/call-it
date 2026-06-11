// Phase 1 mapping handlers for ProfileRegistry events.
// Extends the Phase 0 stub — block handler removed; real event handlers wired.
//
// Requirements: OPS-01, OPS-03, AUTH-39, AUTH-40, AUTH-41
// Pitfall C closure: ProfileRegistry events now produce real handler calls.
//
// AssemblyScript note: handler names must be globally unique across all mapping files.
// The SettlementManagerSet event appears in both CallRegistry and ProfileRegistry;
// this file uses the name handleProfileRegistrySettlementManagerSet to avoid collision
// (matching the subgraph.yaml eventHandlers entry).

import { BigInt } from '@graphprotocol/graph-ts';

import {
  ProfileUpdated,
  HandleSet,
  SettlementManagerSet,
  RelayerSet,
  SocialLinked,
  SocialUnlinked,
  RepDeltaApplied,
} from '../generated/ProfileRegistry/ProfileRegistry';

import { Profile } from '../generated/schema';

// ── Helper: lazy-init a Profile entity ──────────────────────────────────────
// Mirrors call-registry.ts helper — AssemblyScript cannot import between mapping files.

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

// ── ProfileUpdated ────────────────────────────────────────────────────────────
// event ProfileUpdated(address indexed user, uint32 totalCalls, uint16 settledCalls)
// Updates: totalCalls + settledCalls counters on the Profile entity.
// Phase 1 body is forward-compat — ProfileRegistry.updateAfterSettlement is a no-op
// skeleton in Phase 1 (full implementation Phase 4), but the handler wires the
// subgraph for when it becomes active.

export function handleProfileUpdated(event: ProfileUpdated): void {
  let id = event.params.user.toHexString();
  let profile = ensureProfile(id);
  profile.totalCalls = event.params.totalCalls.toI32();
  profile.settledCalls = event.params.settledCalls as i32;
  profile.lastActiveAt = event.block.timestamp;
  profile.save();
}

// ── HandleSet ─────────────────────────────────────────────────────────────────
// event HandleSet(address indexed user, string handle)
// Updates: displayHandle on the Profile entity.

export function handleHandleSet(event: HandleSet): void {
  let id = event.params.user.toHexString();
  let profile = ensureProfile(id);
  profile.displayHandle = event.params.handle;
  profile.handle = event.params.handle; // keep legacy field in sync
  profile.lastActiveAt = event.block.timestamp;
  profile.save();
}

// ── SettlementManagerSet (ProfileRegistry variant) ───────────────────────────
// event SettlementManagerSet(address indexed newManager)
// Bookkeeping no-op — indexed for forward-compat (Phase 4 cross-reference).
// Handler name must differ from CallRegistry's handleSettlementManagerSet.

export function handleProfileRegistrySettlementManagerSet(event: SettlementManagerSet): void {
  // Intentional no-op in Phase 1. Indexed for queryability.
  // Phase 4 will cross-reference the active settlementManager for settlement routing.
}

// ── RelayerSet ────────────────────────────────────────────────────────────────
// event RelayerSet(address indexed newRelayer)
// Bookkeeping no-op — indexed for forward-compat (Phase 1.5 social linking).

export function handleRelayerSet(event: RelayerSet): void {
  // Intentional no-op in Phase 1. Indexed for queryability.
  // Phase 1.5 will cross-reference the active relayer for social-link routing.
}

// ── SocialLinked ──────────────────────────────────────────────────────────────
// event SocialLinked(address indexed user, uint8 kind, string handle, bytes32 proofHash)
// Updates: twitterHandle or farcasterHandle on the Profile entity.
// kind: 0 = Twitter, 1 = Farcaster (per IProfileRegistry.sol §31)

export function handleSocialLinked(event: SocialLinked): void {
  let id = event.params.user.toHexString();
  let profile = ensureProfile(id);
  let kind = event.params.kind as i32;
  if (kind == 0) {
    profile.twitterHandle = event.params.handle;
  } else if (kind == 1) {
    profile.farcasterHandle = event.params.handle;
  }
  profile.lastActiveAt = event.block.timestamp;
  profile.save();
}

// ── RepDeltaApplied ───────────────────────────────────────────────────────────
// event RepDeltaApplied(address indexed user, int256 delta, uint128 newRep)
// THE single source of truth for Profile.globalRep (quick-260611-sof; 09.2 UAT
// finding 1: leaderboard showed losers unpunished at 100).
//
// newRep carries the POST-apply globalRep — the REP-02 floor-at-0 and the WR-08
// uint128 clamp are already applied on-chain inside ProfileRegistry.applyRepDelta
// (ProfileRegistry.sol:239-252), the ONLY globalRep mutator. The event is emitted
// by EVERY applyRepDelta path:
//   - settlement (SettlementManager.sol:308)
//   - caller exit (FollowFadeMarket.sol:428)
//   - duel winner/loser deltas (SettlementManager.sol:336-337)
//   - dispute reversal (SettlementManager.sol:506)
// so mirroring newRep here reproduces on-chain rep exactly with zero subgraph-side
// arithmetic — including the exited-caller skip (SM:307: no applyRepDelta → no
// event → rep stays at the exit-time value, exact mirror by construction).
//
// Deliberately does NOT touch lastActiveAt: on-chain applyRepDelta does not record
// activity, and lazy-init delta=0 emissions (e.g. FFM initializePool) would
// otherwise skew activity timestamps.

export function handleRepDeltaApplied(event: RepDeltaApplied): void {
  let id = event.params.user.toHexString();
  let profile = ensureProfile(id);
  // newRep is uint128 (codegen BigInt) → toI32() is safe at rep scale (0..~200).
  profile.globalRep = event.params.newRep.toI32();
  profile.save();
}

// ── SocialUnlinked ────────────────────────────────────────────────────────────
// event SocialUnlinked(address indexed user, uint8 kind)
// Updates: clears twitterHandle or farcasterHandle on the Profile entity.
// kind: 0 = Twitter, 1 = Farcaster

export function handleSocialUnlinked(event: SocialUnlinked): void {
  let id = event.params.user.toHexString();
  let profile = Profile.load(id);
  if (profile == null) {
    // Profile not in store — nothing to unlink.
    return;
  }
  let kind = event.params.kind as i32;
  if (kind == 0) {
    profile.twitterHandle = null;
  } else if (kind == 1) {
    profile.farcasterHandle = null;
  }
  profile.lastActiveAt = event.block.timestamp;
  profile.save();
}
