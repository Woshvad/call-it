// Phase 4 real handlers. Replaces Phase 0 stub. Pitfall E: handleBlock removed.
//
// Requirements: SETTLE-02, SETTLE-09, SETTLE-31, SETTLE-32, SETTLE-33,
//               SETTLE-37, SETTLE-38, REP-25, REP-26, REP-27
// Spec: CALL_IT_SPEC1.md §12.4 — SettlementManager event schema
//
// AssemblyScript constraints (same as all mapping files):
//   - No closures
//   - No null for value types (BigInt.fromI32(0), '', false, new Bytes(0))
//   - @graphprotocol/graph-ts BigInt helpers required
//   - @entity(immutable: false) on Settlement, Dispute (status transitions)
//   - @entity(immutable: true) on RepEvent, ForceSettlement (append-only records)
//
// Dispute status path:
//   SM.raiseDispute() → DisputeRaised event → handleDisputeRaised → Call.status='Disputed' → frontend
//   CallRegistry has NO markDisputed function and is UNCHANGED (Blocker-6 fix / T-04-05-04).

import { BigInt, Bytes } from '@graphprotocol/graph-ts';

import {
  CallSettled,
  DisputeRaised,
  DisputeResolved,
  CallForceSettled,
  SettlementDelayed,
  RepCalculated,
  RepCalculatedFallback,
} from '../generated/SettlementManager/SettlementManager';

import {
  Settlement,
  Dispute,
  DisputeResolution,
  ForceSettlement,
  SettlementDelayed as SettlementDelayedEntity,
  RepEvent,
  RepCalculatedFallback as RepCalculatedFallbackEntity,
  Profile,
  Call,
} from '../generated/schema';

// ── Helper: lazy-init a Settlement entity ─────────────────────────────────────
// id = callId.toString()
// AssemblyScript: no null for value types — use zero defaults for scalars

function ensureSettlement(callId: string): Settlement {
  let settlement = Settlement.load(callId);
  if (settlement == null) {
    settlement = new Settlement(callId);
    settlement.call = callId;     // Call entity id = callId string
    settlement.outcome = 'Pending';
    settlement.priceDelta = null; // nullable BigInt — null OK
    settlement.settledAt = BigInt.fromI32(0);
    settlement.finalPrice = null; // nullable BigInt — null OK
  }
  return settlement as Settlement;
}

// ── Helper: lazy-init a Dispute entity ────────────────────────────────────────
// id = callId.toString()
// AssemblyScript: no null for value types — use zero defaults for scalars

function ensureDispute(callId: string): Dispute {
  let dispute = Dispute.load(callId);
  if (dispute == null) {
    dispute = new Dispute(callId);
    dispute.call = callId;        // Call entity id = callId string
    dispute.disputer = new Bytes(0);
    dispute.evidenceHash = new Bytes(0);
    dispute.bondAmount = BigInt.fromI32(0);
    dispute.status = 'Open';
    dispute.raisedAt = BigInt.fromI32(0);
    dispute.resolvedAt = null;    // nullable BigInt — null OK
  }
  return dispute as Dispute;
}

// ── Helper: lazy-init a Profile entity ────────────────────────────────────────
// id = caller.toHexString()
// Mirrors call-registry.ts ensureProfile cold-start defaults.

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

// ── handleCallSettled ─────────────────────────────────────────────────────────
// event CallSettled(uint256 indexed callId, uint8 outcome, int256 priceDelta)
// outcome: 1 = CallerWon, 2 = CallerLost (per spec §12.4)
// Updates Settlement entity + Call.status='Settled' + Call.outcome.
// T-04-05-01: Call.outcome updated here; handleCallForceSettled also fires on forceSettle —
//   both handlers correctly update Call to prevent stale outcome.

export function handleCallSettled(event: CallSettled): void {
  let callId = event.params.callId.toString();

  let settlement = ensureSettlement(callId);
  // outcome enum: 1 = CallerWon, 2 = CallerLost
  settlement.outcome = event.params.outcome == 1 ? 'CallerWon' : 'CallerLost';
  settlement.priceDelta = event.params.priceDelta;
  settlement.settledAt = event.block.timestamp;
  settlement.save();

  // Update Call entity status + outcome — SETTLE-02
  let call = Call.load(callId);
  if (call != null) {
    call.status = 'Settled';
    call.outcome = settlement.outcome;
    call.settledAt = event.block.timestamp;
    call.save();
  }
}

// ── handleDisputeRaised ───────────────────────────────────────────────────────
// event DisputeRaised(uint256 indexed callId, address indexed disputer, bytes32 evidenceHash)
//
// SINGLE SOURCE OF TRUTH for Call.status='Disputed' — T-04-05-04 mitigation.
// SM.raiseDispute() → DisputeRaised event → this handler → Call.status='Disputed' → frontend.
// CallRegistry has NO markDisputed function and MUST NOT be modified.
// SettlementManager stores dispute state locally in disputes[callId] mapping.

export function handleDisputeRaised(event: DisputeRaised): void {
  let callId = event.params.callId.toString();

  let dispute = ensureDispute(callId);
  dispute.disputer = event.params.disputer;
  dispute.evidenceHash = event.params.evidenceHash;
  // bondAmount not emitted in DisputeRaised event — leave as BigInt.fromI32(0)
  // (on-chain DISPUTE_BOND constant; not needed for subgraph display)
  dispute.status = 'Open';
  dispute.raisedAt = event.block.timestamp;
  dispute.save();

  // Set Call.status='Disputed' — SETTLE-31, SETTLE-32; ONLY path for disputed status
  let call = Call.load(callId);
  if (call != null) {
    call.status = 'Disputed';
    call.save();
  }
}

// ── handleDisputeResolved ─────────────────────────────────────────────────────
// event DisputeResolved(uint256 indexed callId, uint8 finalOutcome, address indexed resolver)
// finalOutcome: 1 = CallerWon, 2 = CallerLost
// Updates Dispute.status='Resolved'; creates immutable DisputeResolution record.
// Call.outcome updated to post-dispute final outcome.

export function handleDisputeResolved(event: DisputeResolved): void {
  let callId = event.params.callId.toString();
  let finalOutcomeStr = event.params.finalOutcome == 1 ? 'CallerWon' : 'CallerLost';

  // Update Dispute entity
  let dispute = ensureDispute(callId);
  dispute.status = 'Resolved';
  dispute.resolvedAt = event.block.timestamp;
  dispute.save();

  // Create immutable DisputeResolution record
  // id = txHash + '-' + logIndex (unique append-only)
  let resolutionId = event.transaction.hash.toHexString() + '-' + event.logIndex.toString();
  let resolution = new DisputeResolution(resolutionId);
  resolution.dispute = callId;  // Dispute entity id = callId
  resolution.finalOutcome = finalOutcomeStr;
  resolution.resolverNote = null; // not in event — nullable String OK
  resolution.resolvedAt = event.block.timestamp;
  resolution.save();

  // Update Call.outcome to post-dispute final outcome
  let call = Call.load(callId);
  if (call != null) {
    call.outcome = finalOutcomeStr;
    call.save();
  }
}

// ── handleCallForceSettled ────────────────────────────────────────────────────
// event CallForceSettled(uint256 indexed callId, uint8 outcome)
// Fires BEFORE CallSettled when forceSettle() is called (per spec flow).
// Both handlers update Call correctly — idempotent status/outcome writes.
// Creates immutable ForceSettlement record.

export function handleCallForceSettled(event: CallForceSettled): void {
  let callId = event.params.callId.toString();
  let outcomeStr = event.params.outcome == 1 ? 'CallerWon' : 'CallerLost';

  // Create immutable ForceSettlement record
  // id = txHash + '-' + logIndex (unique append-only)
  let forceId = event.transaction.hash.toHexString() + '-' + event.logIndex.toString();
  let force = new ForceSettlement(forceId);
  force.call = callId;
  // forcedBy: not in event; use transaction origin (tx.from) as the forcer
  force.forcedBy = event.transaction.from;
  force.forcedAt = event.block.timestamp;
  force.finalOutcome = outcomeStr;
  force.save();

  // Update Call entity — CallSettled fires after this in the same tx; both are idempotent
  let call = Call.load(callId);
  if (call != null) {
    call.status = 'Settled';
    call.outcome = outcomeStr;
    call.settledAt = event.block.timestamp;
    call.save();
  }
}

// ── handleSettlementDelayed ───────────────────────────────────────────────────
// event SettlementDelayed(uint256 indexed callId, string reason, uint256 retryAt)
// Creates immutable SettlementDelayed record.
// id = txHash + '-' + logIndex (unique append-only — multiple delays possible per call)

export function handleSettlementDelayed(event: SettlementDelayed): void {
  let callId = event.params.callId.toString();

  let delayId = event.transaction.hash.toHexString() + '-' + event.logIndex.toString();
  let delay = new SettlementDelayedEntity(delayId);
  delay.call = callId;
  // attempts: not in event — schema field; default to 1 (each event = 1 attempt)
  delay.attempts = 1;
  delay.lastError = event.params.reason;
  delay.lastAttemptAt = event.block.timestamp;
  delay.save();
}

// ── handleRepCalculated ───────────────────────────────────────────────────────
// event RepCalculated(uint256 indexed callId, address indexed caller, uint128 currentRep,
//                     uint8 conviction, uint8 consensusPct, bool isWinner,
//                     uint256 baseValue, int256 delta)
// Creates immutable RepEvent record.
// id = txHash + '-' + logIndex (unique append-only)
// Updates Profile: increment settledCalls; increment wins or losses based on isWinner.
// SETTLE-37, SETTLE-38, REP-25, REP-26, REP-27

export function handleRepCalculated(event: RepCalculated): void {
  let callId = event.params.callId.toString();
  let callerHex = event.params.caller.toHexString();

  // Create immutable RepEvent record
  let repId = event.transaction.hash.toHexString() + '-' + event.logIndex.toString();
  let repEvent = new RepEvent(repId);
  repEvent.user = event.params.caller;
  // delta is int256 in ABI; schema field is Int! (i32) — use toI32() for schema compat
  repEvent.delta = event.params.delta.toI32();
  // reason: encode key rep-context fields as a structured string for queryability
  // format: "conviction:<v>,consensus:<c>,winner:<w>" — all from event params
  let reasonStr = 'conviction:' + event.params.conviction.toString()
    + ',consensus:' + event.params.consensusPct.toString()
    + ',winner:' + (event.params.isWinner ? 'true' : 'false');
  repEvent.reason = reasonStr;
  repEvent.callId = callId;
  repEvent.fallback = false;
  repEvent.timestamp = event.block.timestamp;
  repEvent.save();

  // Update Profile: increment settledCalls; wins/losses
  let profile = ensureProfile(callerHex);
  profile.settledCalls = profile.settledCalls + 1;
  if (event.params.isWinner) {
    profile.wins = profile.wins + 1;
  } else {
    profile.losses = profile.losses + 1;
  }
  // globalRep is NOT written here (quick-260611-sof): RepCalculated.currentRep is
  // the PRE-update rep read at SettlementManager.sol:282 BEFORE applyRepDelta —
  // persisting it was the v0.9.1 staleness bug (losers showed unpunished at 100).
  // Profile.globalRep is mirrored exclusively from ProfileRegistry.RepDeltaApplied
  // in profile-registry.ts, which fires EARLIER in the same settle tx (logIndex
  // order: RepDeltaApplied → RepCalculated) — writing currentRep here would
  // clobber the correct post-apply value.
  profile.lastActiveAt = event.block.timestamp;
  profile.save();
}

// ── handleRepCalculatedFallback ───────────────────────────────────────────────
// event RepCalculatedFallback(uint256 indexed callId, address indexed caller,
//                              int256 baselineDelta, bytes lowLevelError)
// Fires when Stylus StylusScoreEngine call fails — baseline rep applied instead.
// Creates immutable RepCalculatedFallbackEntity.
// Also creates a RepEvent with fallback=true so the frontend can show the fallback indicator.
// Telegram P0 alert is triggered by the relayer watching for this event (not in subgraph).
// T-04-05-03 mitigation: event is indexed and queryable.
// REP-27

export function handleRepCalculatedFallback(event: RepCalculatedFallback): void {
  // Rep application in the Stylus-fallback path is also covered by RepDeltaApplied + the
  // subsequent unconditional RepCalculated (SM:293-311); this handler records the fallback
  // artifact entities only — no globalRep logic here (quick-260611-sof).
  let callId = event.params.callId.toString();
  let callerHex = event.params.caller.toHexString();

  // Create immutable RepCalculatedFallbackEntity
  let fallbackId = event.transaction.hash.toHexString() + '-' + event.logIndex.toString();
  let fallback = new RepCalculatedFallbackEntity(fallbackId);
  fallback.call = callId;
  fallback.user = event.params.caller;
  // baselineDelta is int256 in ABI; schema field is Int! (i32) — use toI32()
  fallback.baselineDelta = event.params.baselineDelta.toI32();
  // lowLevelError is bytes — convert to hex string for schema String field
  fallback.lowLevelError = event.params.lowLevelError.toHexString();
  fallback.timestamp = event.block.timestamp;
  fallback.save();

  // Also create a RepEvent with fallback=true for frontend "Stylus fallback fired" indicator
  let repId = event.transaction.hash.toHexString() + '-' + event.logIndex.toString() + '-fb';
  let repEvent = new RepEvent(repId);
  repEvent.user = event.params.caller;
  repEvent.delta = event.params.baselineDelta.toI32();
  repEvent.reason = 'fallback';
  repEvent.callId = callId;
  repEvent.fallback = true;
  repEvent.timestamp = event.block.timestamp;
  repEvent.save();

  // Update Profile for fallback: increment settledCalls (call was settled, just rep via fallback)
  let profile = ensureProfile(callerHex);
  profile.settledCalls = profile.settledCalls + 1;
  profile.lastActiveAt = event.block.timestamp;
  profile.save();
}
