// Phase 3 real handlers. Replaces Phase 0 stub. Pitfall E: handleBlock removed.
//
// Requirements: SOCIAL-40, SOCIAL-41, SOCIAL-42, SOCIAL-48, SOCIAL-49, SOCIAL-50, SOCIAL-51
// Spec: CALL_IT_SPEC1.md §12.3 — ChallengeEscrow event schema
//
// AssemblyScript constraints (same as FFM handlers):
//   - No closures
//   - No null for value types (BigInt.fromI32(0), '', false, new Bytes(0))
//   - @graphprotocol/graph-ts BigInt helpers required
//   - @entity(immutable: false) on Challenge + UnclaimedOverage (status transitions)
//   - @entity(immutable: true) on ChallengePayout (append-only payout record)

import { BigInt, Bytes } from '@graphprotocol/graph-ts';

import {
  ChallengeProposed,
  ChallengeAccepted,
  ChallengeRejected,
  ChallengeRefunded,
  ChallengeSettled,
  PayoutClaimed,
  UnclaimedOverageCreated,
} from '../generated/ChallengeEscrow/ChallengeEscrow';

import {
  Challenge,
  ChallengePayout,
  UnclaimedOverage,
  TvlSnapshot,
} from '../generated/schema';

// ── Helper: lazy-init a Challenge entity ─────────────────────────────────────
// id = challengeId.toString()
// AssemblyScript: no null for value types — use zero defaults for scalars

function ensureChallenge(challengeId: string): Challenge {
  let challenge = Challenge.load(challengeId);
  if (challenge == null) {
    challenge = new Challenge(challengeId);
    challenge.call = '';                         // set from event.params.callId on propose
    challenge.challenger = new Bytes(0);         // set from event.params.challenger on propose
    challenge.caller = new Bytes(0);             // set from event.params.caller on accept
    challenge.challengerStake = BigInt.fromI32(0); // set from event.params.challengerStake
    challenge.callerStake = BigInt.fromI32(0);   // set from event.params.callerStake on accept
    challenge.status = 'Proposed';
    challenge.winner = null;                     // nullable Bytes — null OK
    challenge.proposedAt = BigInt.fromI32(0);
    challenge.acceptedAt = null;                 // nullable BigInt — null OK
    challenge.settledAt = null;                  // nullable BigInt — null OK
    challenge.overageClaimed = false;
  }
  return challenge as Challenge;
}

// ── handleChallengeProposed ───────────────────────────────────────────────────
// event ChallengeProposed(uint256 indexed challengeId, uint256 indexed callId, address indexed challenger, uint96 challengerStake)
// Creates the Challenge entity with status='Proposed'.

export function handleChallengeProposed(event: ChallengeProposed): void {
  let challengeId = event.params.challengeId.toString();
  let callId = event.params.callId.toString();

  let challenge = ensureChallenge(challengeId);
  challenge.call = callId;
  challenge.challenger = event.params.challenger;
  challenge.challengerStake = event.params.challengerStake;
  challenge.status = 'Proposed';
  challenge.proposedAt = event.block.timestamp;
  challenge.save();
}

// ── handleChallengeAccepted ───────────────────────────────────────────────────
// event ChallengeAccepted(uint256 indexed challengeId, address indexed caller, uint96 callerStake)
// Updates Challenge status to 'Accepted'; records callerStake + acceptedAt.

export function handleChallengeAccepted(event: ChallengeAccepted): void {
  let challengeId = event.params.challengeId.toString();

  let challenge = ensureChallenge(challengeId);
  challenge.caller = event.params.caller;
  challenge.callerStake = event.params.callerStake;
  challenge.status = 'Accepted';
  challenge.acceptedAt = event.block.timestamp;
  challenge.save();

  // Record TvlSnapshot: new escrow contribution from the matched duel stake
  let snapshotId = event.transaction.hash.toHexString() + '-' + event.logIndex.toString();
  let snapshot = new TvlSnapshot(snapshotId);
  snapshot.blockNumber = event.block.number;
  snapshot.callRegistryTvl = BigInt.fromI32(0);
  snapshot.followFadeMarketTvl = BigInt.fromI32(0);
  // callerStake is the new deposit entering escrow on accept
  snapshot.challengeEscrowTvl = event.params.callerStake;
  snapshot.totalTvl = event.params.callerStake;
  snapshot.timestamp = event.block.timestamp;
  snapshot.save();
}

// ── handleChallengeRejected ───────────────────────────────────────────────────
// event ChallengeRejected(uint256 indexed challengeId, address indexed caller)
// Updates Challenge status to 'Rejected' (challenger stake returned off-chain).

export function handleChallengeRejected(event: ChallengeRejected): void {
  let challengeId = event.params.challengeId.toString();

  let challenge = ensureChallenge(challengeId);
  challenge.caller = event.params.caller;
  challenge.status = 'Rejected';
  challenge.save();
}

// ── handleChallengeRefunded ───────────────────────────────────────────────────
// event ChallengeRefunded(uint256 indexed challengeId, address indexed challenger, uint96 amount)
// Updates Challenge status to 'Refunded' (24h window expired; challenger claimed stake back).

export function handleChallengeRefunded(event: ChallengeRefunded): void {
  let challengeId = event.params.challengeId.toString();

  let challenge = ensureChallenge(challengeId);
  challenge.status = 'Refunded';
  challenge.save();
}

// ── handleChallengeSettled ────────────────────────────────────────────────────
// event ChallengeSettled(uint256 indexed challengeId, address indexed winner)
// Updates Challenge status to 'Settled'; records winner + settledAt.

export function handleChallengeSettled(event: ChallengeSettled): void {
  let challengeId = event.params.challengeId.toString();

  let challenge = ensureChallenge(challengeId);
  challenge.winner = event.params.winner;
  challenge.status = 'Settled';
  challenge.settledAt = event.block.timestamp;
  challenge.save();
}

// ── handlePayoutClaimed ───────────────────────────────────────────────────────
// event PayoutClaimed(uint256 indexed challengeId, address indexed winner, uint256 payout, uint256 protocolFee)
// Creates immutable ChallengePayout record; id = txHash + '-' + logIndex (unique append-only).

export function handlePayoutClaimed(event: PayoutClaimed): void {
  let payoutId = event.transaction.hash.toHexString() + '-' + event.logIndex.toString();
  let payout = new ChallengePayout(payoutId);
  payout.challengeId = event.params.challengeId;
  payout.winner = event.params.winner;
  payout.payout = event.params.payout;
  payout.protocolFee = event.params.protocolFee;
  payout.timestamp = event.block.timestamp;
  payout.save();
}

// ── handleUnclaimedOverageCreated ─────────────────────────────────────────────
// event UnclaimedOverageCreated(uint256 indexed challengeId, address indexed beneficiary, uint256 amount)
// Creates UnclaimedOverage entity; id = challengeId (one overage per challenge, D-03).
// claimed=false until claimOverage() — Phase 4 will add a handler to flip this.

export function handleUnclaimedOverageCreated(event: UnclaimedOverageCreated): void {
  let overId = event.params.challengeId.toString();
  let overage = new UnclaimedOverage(overId);
  overage.challengeId = event.params.challengeId;
  overage.beneficiary = event.params.beneficiary;
  overage.amount = event.params.amount;
  overage.claimed = false;
  overage.timestamp = event.block.timestamp;
  overage.save();
}
