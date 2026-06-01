// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions"
// Spec: CALL_IT_SPEC1.md §12.3 — ChallengeEscrow interface (LOCKED)
// Requirement: SOCIAL-29..39, SOCIAL-48
//
// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  LOCKED — DO NOT MODIFY AFTER PLAN 03-01 COMMIT.                           ║
// ║  Downstream plans (03-02 contract, 03-03 deploy, 03-04 subgraph ABI,       ║
// ║  03-05 relayer ABI) import types from this file.  Any modification here    ║
// ║  breaks all downstream.  See T-3-01-01 threat register.                    ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

/// @title IChallengeEscrow
/// @notice Public interface for the ChallengeEscrow contract.
///         Declares ChallengeStatus enum, Challenge struct, events, errors,
///         and all function signatures per §12.3.
///         Consumed by the frontend wagmi hooks, relayer, test helpers,
///         and the Phase 4 SettlementManager.
interface IChallengeEscrow {
    // ─── Enums ──────────────────────────────────────────────────────────────

    /// @notice Lifecycle state of a challenge. §12.3 LOCKED.
    enum ChallengeStatus {
        Proposed,  // 0 — challenger has staked; awaiting caller accept/reject
        Accepted,  // 1 — caller matched stake; duel is live
        Rejected,  // 2 — caller rejected; challenger refunded immediately
        Refunded,  // 3 — 24h window expired; challenger claimed refund
        Settled    // 4 — settleDuel() called; winner decided
    }

    // ─── Structs ─────────────────────────────────────────────────────────────

    /// @notice On-chain record for a single 1v1 challenge.
    ///         Layout per RESEARCH.md Pattern 1 (optimised for slot packing).
    struct Challenge {
        uint256 callId;           // parent call being challenged
        address caller;           // the call creator being challenged
        address challenger;       // initiator of the challenge
        uint96  callerStake;      // USDC matched by caller (= min(callerInput, challengerStake))
        uint96  challengerStake;  // USDC deposited by challenger at propose time
        uint64  proposedAt;       // block.timestamp when proposed (for 24h window)
        address winner;           // populated by settleDuel(); address(0) until then
        ChallengeStatus status;
        bool    callerClaimed;    // true after caller claims payout (SOCIAL-38)
        bool    challengerClaimed;// true after challenger claims payout or refund
        bool    overageClaimed;   // true after overcommitter claims leftover (D-03)
    }

    // ─── Events ──────────────────────────────────────────────────────────────

    /// @notice Challenger proposed a duel; stake escrowed. SOCIAL-29..33.
    event ChallengeProposed(
        uint256 indexed challengeId,
        uint256 indexed callId,
        address indexed challenger,
        uint96  challengerStake
    );

    /// @notice Caller accepted; matching stake escrowed. Duel is live. SOCIAL-34..36.
    event ChallengeAccepted(
        uint256 indexed challengeId,
        address indexed caller,
        uint96  callerStake
    );

    /// @notice Caller rejected; challenger stake returned immediately. SOCIAL-35.
    event ChallengeRejected(
        uint256 indexed challengeId,
        address indexed caller
    );

    /// @notice Challenger claimed refund after 24h acceptance window expired. SOCIAL-34.
    event ChallengeRefunded(
        uint256 indexed challengeId,
        address indexed challenger,
        uint96  amount
    );

    /// @notice SettlementManager set winner; ready for payout claims. SOCIAL-36.
    event ChallengeSettled(
        uint256 indexed challengeId,
        address indexed winner
    );

    /// @notice Winner claimed their duel payout. SOCIAL-38..39.
    event PayoutClaimed(
        uint256 indexed challengeId,
        address indexed winner,
        uint256 payout,
        uint256 protocolFee
    );

    /// @notice Loser's overage was pushed successfully to overcommitter. D-03.
    event OveragePushed(
        uint256 indexed challengeId,
        address indexed recipient,
        uint256 amount
    );

    /// @notice Push failed; overcommitter must call claimOverage(). D-03.
    event UnclaimedOverageCreated(
        uint256 indexed challengeId,
        address indexed beneficiary,
        uint256 amount
    );

    /// @notice Owner rotated the settlement manager address. D-01.
    event SettlementManagerSet(address indexed newManager);

    // ─── Custom errors ───────────────────────────────────────────────────────

    /// @notice proposeChallenge: call.openToChallenges is false. SOCIAL-29.
    error CallerNotOpenToChallenges();

    /// @notice proposeChallenge: challenger == call.caller. SOCIAL-32.
    error SelfChallenge();

    /// @notice proposeChallenge: call is not Live or is past expiry. SOCIAL-33.
    error CallNotChallengeable();

    /// @notice acceptChallenge: 24h acceptance window has elapsed. SOCIAL-34.
    error AcceptanceWindowExpired();

    /// @notice claimRefund: challenge is not in a refundable state.
    error ClaimRefundNotAvailable();

    /// @notice claimDuelPayout: caller is not the recorded winner. SOCIAL-39.
    error NotDuelWinner();

    /// @notice claimDuelPayout / claimOverage: already claimed. SOCIAL-38.
    error AlreadyClaimed();

    /// @notice claimDuelPayout: challenge not yet accepted.
    error ChallengeNotAccepted();

    /// @notice claimDuelPayout / claimOverage: challenge not yet settled.
    error ChallengeNotSettled();

    /// @notice claimOverage: msg.sender is not the recorded overcommitter.
    error NotOverageRecipient();

    /// @notice proposeChallenge / acceptChallenge: stake < MIN_STAKE ($5 USDC). SOCIAL-03.
    error StakeBelowMinimum();

    /// @notice proposeChallenge / acceptChallenge: stake > MAX_STAKE ($100 USDC). SOCIAL-04.
    error StakeAboveMaximum();

    /// @notice Combined 3-way TVL would exceed the global cap. SOCIAL-09 / D-04.
    error TvlCapReached(uint256 requested, uint256 available);

    /// @notice settleDuel: caller is not the settlement manager. D-01.
    error NotSettlementManager();

    /// @notice Generic authorization failure.
    error NotAuthorized();

    // ─── Core mutation functions ──────────────────────────────────────────────

    /// @notice Propose a 1v1 duel against the creator of `callId`.
    ///         Challenger stakes `stake` USDC into escrow.
    ///         Reverts: CallerNotOpenToChallenges, SelfChallenge, CallNotChallengeable,
    ///                  StakeBelowMinimum, StakeAboveMaximum, TvlCapReached.
    ///         Guarded: whenNotPaused.
    /// @param callId  The on-chain call to challenge.
    /// @param stake   USDC stake amount (6 decimals, must be [5e6, 100e6]).
    /// @return challengeId The newly created challenge ID (starts from 1; 0 is burned).
    function proposeChallenge(uint256 callId, uint96 stake) external returns (uint256 challengeId);

    /// @notice Accept an incoming challenge.  Caller matches the stake (or their
    ///         own lower amount — min is used as pot base per SOCIAL-31).
    ///         Reverts: AcceptanceWindowExpired, ChallengeNotAccepted (wrong status),
    ///                  StakeBelowMinimum, StakeAboveMaximum, TvlCapReached.
    ///         Guarded: whenNotPaused.
    /// @param challengeId The challenge to accept.
    function acceptChallenge(uint256 challengeId) external;

    /// @notice Reject an incoming challenge during the 24h window.
    ///         Immediately refunds the challenger's stake.
    ///         Reverts if challenge is not in Proposed status or window already elapsed.
    /// @param challengeId The challenge to reject.
    function rejectChallenge(uint256 challengeId) external;

    /// @notice After the 24h acceptance window expires on a Proposed challenge,
    ///         the challenger may claim their stake back.
    ///         Reverts: ClaimRefundNotAvailable.
    /// @param challengeId The challenge to refund.
    function claimRefund(uint256 challengeId) external;

    /// @notice Called only by the SettlementManager to declare a winner.
    ///         Pushes overage to overcommitter (D-03); on push failure records
    ///         UnclaimedOverage for claimOverage() fallback.
    ///         Reverts: NotSettlementManager, ChallengeNotAccepted.
    /// @param challengeId The challenge to settle.
    /// @param winner      Address of the winning party (caller or challenger).
    function settleDuel(uint256 challengeId, address winner) external;

    /// @notice Winner pulls their payout after settlement.
    ///         CEI: marks claimed BEFORE transfer.
    ///         Reverts: ChallengeNotSettled, NotDuelWinner, AlreadyClaimed.
    ///
    /// @dev Pause carve-out (§10.3): NOT guarded by whenNotPaused.
    ///      This function must remain callable while the contract is paused so
    ///      that winners can retrieve funds even during an emergency pause.
    /// @param challengeId The settled challenge to claim payout from.
    function claimDuelPayout(uint256 challengeId) external;

    /// @notice Overcommitter pulls their returned overage if the push in
    ///         settleDuel() failed (D-03 fallback).
    ///         CEI: marks overageClaimed BEFORE transfer.
    ///         Reverts: ChallengeNotSettled, NotOverageRecipient, AlreadyClaimed.
    ///
    /// @dev Pause carve-out (§10.3): NOT guarded by whenNotPaused.
    ///      Same reasoning as claimDuelPayout — must remain callable while paused.
    /// @param challengeId The settled challenge whose overage to claim.
    function claimOverage(uint256 challengeId) external;

    /// @notice Rotate the settlement manager. Initially address(0) at deploy.
    ///         Phase 4 sets this once; requires no redeploy of ChallengeEscrow (D-01).
    /// @param newManager The Phase 4 SettlementManager address.
    function setSettlementManager(address newManager) external;

    /// @notice Emergency pause — blocks proposeChallenge and acceptChallenge.
    ///         Claim functions remain callable (§10.3 carve-out).
    function pause() external;

    /// @notice Lift emergency pause.
    function unpause() external;

    // ─── View functions ───────────────────────────────────────────────────────

    /// @notice Total USDC held in escrow across all active challenges.
    ///         Uses an internal counter (NOT balanceOf) — Pitfall B.
    function getTvl() external view returns (uint256);

    /// @notice Retrieve the full challenge record.
    /// @param challengeId The challenge ID to look up.
    function getChallenge(uint256 challengeId) external view returns (Challenge memory);
}
