// Phase 2 mapping handlers for FollowFadeMarket events.
// Replaces the Phase 0 placeholder stub — blockHandler removed; real event handlers wired.
//
// Requirements: SOCIAL-23, SOCIAL-44
// Spec: CALL_IT_SPEC1.md §8.1, §8.7.1, §8.7.2 — FollowFadeMarket AMM events
//
// AssemblyScript constraints:
//   - No closures
//   - No null for value types (use BigInt.fromI32(0) / '' / false)
//   - @graphprotocol/graph-ts BigInt helpers required for uint256
//   - Side enum: 0 = Follow, 1 = Fade (matches IFollowFadeMarket.Side)

import { BigInt } from '@graphprotocol/graph-ts';

import {
  Followed,
  Faded,
  PositionExited,
  CallerExited,
  PoolInitialized,
} from '../generated/FollowFadeMarket/FollowFadeMarket';

import { Position, PositionExit, CallerExit, TvlSnapshot } from '../generated/schema';

// ── Helper: lazy-init a Position entity ─────────────────────────────────────
// id = callId + '-' + userHex + '-' + side ('follow' | 'fade')

function ensurePosition(id: string, callId: string, userHex: string, side: string): Position {
  let position = Position.load(id);
  if (position == null) {
    position = new Position(id);
    position.call = null;
    position.callId = callId;
    position.user = userHex;
    position.side = side;
    position.usdcDeposited = BigInt.fromI32(0);
    position.sharesHeld = BigInt.fromI32(0);
    position.entryTime = BigInt.fromI32(0);
    position.exitedAt = null;
    // Legacy fields — zero-init for FFM-created positions
    position.stake = BigInt.fromI32(0);
    position.shares = BigInt.fromI32(0);
    position.claimed = false;
  }
  return position as Position;
}

// ── Helper: lazy-init a CallerExit entity ────────────────────────────────────
// id = callId string

function ensureCallerExit(callId: string): CallerExit {
  let callerExit = CallerExit.load(callId);
  if (callerExit == null) {
    callerExit = new CallerExit(callId);
    callerExit.call = null;
    callerExit.callId = callId;
    callerExit.exitedAt = BigInt.fromI32(0);
    callerExit.penaltyApplied = BigInt.fromI32(0);
    callerExit.penaltyPaid = BigInt.fromI32(0);
    callerExit.stakeReturned = BigInt.fromI32(0);
    callerExit.reputationDelta = BigInt.fromI32(0);
    callerExit.callerVolumeAtExit = BigInt.fromI32(0);
    callerExit.timestamp = BigInt.fromI32(0);
  }
  return callerExit as CallerExit;
}

// ── handleFollowed ────────────────────────────────────────────────────────────
// event Followed(uint256 indexed callId, address indexed user, uint256 amountIn, uint256 sharesOut)
// Updates: load/create Position at id = callId+'-'+userHex+'-follow';
//          accumulate usdcDeposited + sharesHeld; set entryTime.

export function handleFollowed(event: Followed): void {
  let callId = event.params.callId.toString();
  let userHex = event.params.user.toHexString();
  let positionId = callId + '-' + userHex + '-follow';

  let position = ensurePosition(positionId, callId, userHex, 'follow');
  position.usdcDeposited = position.usdcDeposited.plus(event.params.amountIn);
  position.sharesHeld = position.sharesHeld.plus(event.params.sharesOut);
  position.entryTime = event.block.timestamp;
  position.save();
}

// ── handleFaded ───────────────────────────────────────────────────────────────
// event Faded(uint256 indexed callId, address indexed user, uint256 amountIn, uint256 sharesOut)
// Updates: load/create Position at id = callId+'-'+userHex+'-fade';
//          accumulate usdcDeposited + sharesHeld; set entryTime.

export function handleFaded(event: Faded): void {
  let callId = event.params.callId.toString();
  let userHex = event.params.user.toHexString();
  let positionId = callId + '-' + userHex + '-fade';

  let position = ensurePosition(positionId, callId, userHex, 'fade');
  position.usdcDeposited = position.usdcDeposited.plus(event.params.amountIn);
  position.sharesHeld = position.sharesHeld.plus(event.params.sharesOut);
  position.entryTime = event.block.timestamp;
  position.save();
}

// ── handlePositionExited ──────────────────────────────────────────────────────
// event PositionExited(uint256 indexed callId, address indexed user, uint8 side, uint256 usdcReturned, uint256 slashAmount)
// Updates: set exitedAt on the Position; create immutable PositionExit record.
// Side: 0 = Follow, 1 = Fade (matches IFollowFadeMarket.Side enum)

export function handlePositionExited(event: PositionExited): void {
  let callId = event.params.callId.toString();
  let userHex = event.params.user.toHexString();
  let sideInt = event.params.side as i32;
  let side = sideInt == 0 ? 'follow' : 'fade';
  let positionId = callId + '-' + userHex + '-' + side;

  // Update Position.exitedAt
  let position = Position.load(positionId);
  if (position != null) {
    position.exitedAt = event.block.timestamp;
    position.save();
  }

  // Create immutable PositionExit record; id = callId+'-'+userHex+'-'+timestamp
  let exitId = callId + '-' + userHex + '-' + event.block.timestamp.toString();
  let positionExit = new PositionExit(exitId);
  positionExit.position = positionId;
  positionExit.callId = callId;
  positionExit.user = userHex;
  positionExit.side = side;
  positionExit.usdcReturned = event.params.usdcReturned;
  positionExit.slashAmount = event.params.slashAmount;
  positionExit.returnedAmount = event.params.usdcReturned;
  positionExit.timestamp = event.block.timestamp;
  positionExit.exitedAt = event.block.timestamp;
  positionExit.save();
}

// ── handleCallerExited ────────────────────────────────────────────────────────
// event CallerExited(uint256 indexed callId, address indexed caller, uint64 timeElapsed, uint256 penaltyPaid, uint256 stakeReturned, int256 reputationDelta)
// Updates: load/create CallerExit at id = callId; set all fields; save.
// Note: reputationDelta is int256 — stored as BigInt (two's-complement safe via graph-ts).

export function handleCallerExited(event: CallerExited): void {
  let callId = event.params.callId.toString();

  let callerExit = ensureCallerExit(callId);
  callerExit.exitedAt = event.block.timestamp;
  callerExit.penaltyApplied = event.params.penaltyPaid;
  callerExit.penaltyPaid = event.params.penaltyPaid;
  callerExit.stakeReturned = event.params.stakeReturned;
  callerExit.reputationDelta = event.params.reputationDelta;
  callerExit.callerVolumeAtExit = BigInt.fromI32(0);
  callerExit.timestamp = event.block.timestamp;
  callerExit.save();
}

// ── handlePoolInitialized ─────────────────────────────────────────────────────
// event PoolInitialized(uint256 indexed callId, uint256 stakeAmount, uint256 virtualFadeSeed)
// Updates: creates TvlSnapshot record to track new pool's stake contribution to FFM TVL.

export function handlePoolInitialized(event: PoolInitialized): void {
  // Use tx hash + log index for unique immutable ID (same pattern as ConvictionCap in call-registry.ts)
  let id = event.transaction.hash.toHexString() + '-' + event.logIndex.toString();
  let snapshot = new TvlSnapshot(id);
  snapshot.blockNumber = event.block.number;
  snapshot.callRegistryTvl = BigInt.fromI32(0);
  snapshot.followFadeMarketTvl = event.params.stakeAmount;
  snapshot.challengeEscrowTvl = BigInt.fromI32(0);
  snapshot.totalTvl = event.params.stakeAmount;
  snapshot.timestamp = event.block.timestamp;
  snapshot.save();
}
