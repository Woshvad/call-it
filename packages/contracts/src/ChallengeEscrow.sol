// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions" + "Pinned Addresses"
// Spec: CALL_IT_SPEC1.md §11.3, §12.3 — ChallengeEscrow responsibilities + function signatures
// Requirement: SOCIAL-29..39, SAFETY-01/04..11/14/18
//
// USDC MANDATE (§10.5 / ADR-0001): ALL transfer paths use the chainid-resolved `usdc` immutable
// (= resolveUsdc(): 42161 -> USDC_ARB_NATIVE, 421614 -> USDC_ARB_SEPOLIA) from ./constants/USDC.sol.
// Never paste the literal address in this file. The CI grep guard will catch it.
//
// NON-UPGRADEABLE BY DESIGN (D-14, SAFETY-18):
// No proxy, no UUPS, no initialize(). Deploy via DeployPhase3.s.sol.
//
// CEI ORDER (SAFETY-05..09): State writes ALWAYS precede safeTransfer/safeTransferFrom.
// Any reviewer: if you see safeTransfer BEFORE a state write, that is a bug.
//
// PAUSE CARVE-OUTS (§10.3): claimDuelPayout and claimOverage are NOT guarded by whenNotPaused.
// proposeChallenge and acceptChallenge ARE guarded by whenNotPaused.

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { resolveUsdc } from "./constants/USDC.sol";
import { ICallRegistry } from "./interfaces/ICallRegistry.sol";
import { IFollowFadeMarket } from "./interfaces/IFollowFadeMarket.sol";
import { IChallengeEscrow } from "./interfaces/IChallengeEscrow.sol";

/// @title ChallengeEscrow
/// @notice 1v1 duel escrow for the "Call It" prediction platform.
///
///         Each challenge is a symmetric or asymmetric stake between a challenger and
///         the creator of an on-chain call (caller). The contract:
///           - Holds USDC for all active duels in a single escrow.
///           - Uses a totalEscrow counter (NOT balanceOf) to avoid double-counting
///             against the 3-way TVL cap (CallRegistry + FollowFadeMarket + ChallengeEscrow).
///           - Protects claimDuelPayout and claimOverage from the pause gate (§10.3).
///           - Uses IERC20.transfer (bool return) for _pushOverage so a griefing
///             wallet cannot block settleDuel (Pitfall C, D-03).
///
///         Phase 4 wires the Phase-3 settleDuel seam (D-01): set settlementManager once
///         via setSettlementManager; no ChallengeEscrow redeploy required.
///
/// @dev Inherits Ownable2Step, ReentrancyGuard, Pausable.
contract ChallengeEscrow is Ownable2Step, ReentrancyGuard, Pausable, IChallengeEscrow {
    using SafeERC20 for IERC20;

    // ─── Constants ─────────────────────────────────────────────────────────────

    /// @notice Minimum stake per challenge ($5 USDC). SOCIAL-03.
    uint96 public constant MIN_STAKE = 5e6;

    /// @notice Maximum stake per challenge ($100 USDC). SOCIAL-04.
    uint96 public constant MAX_STAKE = 100e6;

    /// @notice 24-hour window within which caller must accept or reject. SOCIAL-34.
    uint256 public constant CHALLENGE_ACCEPTANCE_WINDOW = 24 hours;

    /// @notice Hard cap on the tvlCap that owner may set.
    uint256 public constant MAX_ALLOWED_CAP = 100_000e6; // $100,000 USDC

    // ─── Immutable state ───────────────────────────────────────────────────────

    /// @notice CallRegistry: reads call data + currentTvl + tvlCap.
    ICallRegistry public immutable callRegistry;

    /// @notice FollowFadeMarket: reads getTvl() for 3-way TVL cap.
    IFollowFadeMarket public immutable followFadeMarket;

    /// @notice Chainid-resolved USDC token (= resolveUsdc(), validated in constructor). ADR-0001
    ///         hybrid money-path: mainnet 42161 -> USDC_ARB_NATIVE, Sepolia 421614 -> USDC_ARB_SEPOLIA.
    address public immutable usdc;

    // ─── Mutable admin state ───────────────────────────────────────────────────

    /// @notice Treasury address for fee routing. MUST NOT be address(this).
    address public treasury;

    /// @notice Phase 4 SettlementManager; address(0) at deploy (D-01).
    address public settlementManager;

    /// @notice Owner-set TVL cap for ChallengeEscrow's portion of the 3-way cap.
    uint256 public tvlCap;

    // ─── Escrow accounting ─────────────────────────────────────────────────────

    /// @notice Total USDC held in escrow across all active challenges.
    ///         Counter maintained on accept/settle/refund/reject — NOT balanceOf (Pitfall B).
    uint256 public totalEscrow;

    /// @notice Monotonic challenge ID counter. Starts at 1 (0 is burned).
    uint256 public nextChallengeId;

    // ─── Challenge storage ─────────────────────────────────────────────────────

    /// @notice All challenges keyed by challengeId.
    mapping(uint256 => Challenge) internal _challenges;

    // ─── Modifiers ─────────────────────────────────────────────────────────────

    /// @notice Guards settleDuel: only the Phase 4 SettlementManager may call.
    modifier onlySettlementManager() {
        if (msg.sender != settlementManager) revert NotSettlementManager();
        _;
    }

    // ─── Constructor ───────────────────────────────────────────────────────────

    /// @notice Deploy a non-upgradeable ChallengeEscrow.
    /// @param _callRegistry    CallRegistry for call data + TVL reads.
    /// @param _followFadeMarket FollowFadeMarket for TVL reads.
    /// @param _usdc            Must equal resolveUsdc() for the current chain (ADR-0001).
    /// @param _treasury        Treasury address for protocol fees.
    /// @param _tvlCap          Initial TVL cap for ChallengeEscrow's escrow portion.
    constructor(
        address _callRegistry,
        address _followFadeMarket,
        address _usdc,
        address _treasury,
        uint256 _tvlCap
    ) Ownable(msg.sender) {
        require(_callRegistry != address(0), "invalid-registry");
        require(_followFadeMarket != address(0), "invalid-ffm");
        require(_usdc == resolveUsdc(), "wrong USDC");
        require(_treasury != address(0) && _treasury != address(this), "invalid-treasury");
        require(_tvlCap <= MAX_ALLOWED_CAP, "cap-too-high");
        callRegistry   = ICallRegistry(_callRegistry);
        followFadeMarket = IFollowFadeMarket(_followFadeMarket);
        usdc           = _usdc; // validated == resolveUsdc() above (ADR-0001 chainid gate)
        treasury       = _treasury;
        tvlCap         = _tvlCap;
        nextChallengeId = 1; // burn challengeId 0
    }

    // ─── Core mutation functions ───────────────────────────────────────────────

    /// @inheritdoc IChallengeEscrow
    /// @dev whenNotPaused (new duels blocked during emergency).
    function proposeChallenge(uint256 callId, uint96 stake)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 challengeId)
    {
        ICallRegistry.Call memory c = callRegistry.getCall(callId);

        // ── Gates (SOCIAL-29, SOCIAL-32, SOCIAL-33, SOCIAL-03/04) ──

        // SOCIAL-29: caller must be open to challenges
        if (!c.openToChallenges) revert CallerNotOpenToChallenges();

        // SOCIAL-32: challenger cannot challenge their own call
        if (msg.sender == c.caller) revert SelfChallenge();

        // SOCIAL-33: call must be Live and not past expiry
        if (c.status != ICallRegistry.CallStatus.Live || block.timestamp >= c.expiry) {
            revert CallNotChallengeable();
        }

        // Stake bounds
        if (stake < MIN_STAKE) revert StakeBelowMinimum();
        if (stake > MAX_STAKE) revert StakeAboveMaximum();

        // D-04: 3-way TVL cap check (challenger's stake as incoming)
        _checkTvlCap(stake);

        // ── EFFECTS ──
        challengeId = nextChallengeId++;
        totalEscrow += stake;

        Challenge storage ch = _challenges[challengeId];
        ch.callId          = callId;
        ch.caller          = c.caller;
        ch.challenger      = msg.sender;
        ch.challengerStake = stake;
        ch.proposedAt      = uint64(block.timestamp);
        ch.status          = ChallengeStatus.Proposed;

        // ── INTERACTIONS ──
        IERC20(usdc).safeTransferFrom(msg.sender, address(this), stake);

        emit ChallengeProposed(challengeId, callId, msg.sender, stake);
    }

    /// @inheritdoc IChallengeEscrow
    /// @dev whenNotPaused (new accepted duels blocked during emergency).
    ///      callerMatchingStake = min(call.stake, challengerStake) — per SOCIAL-31.
    ///      The caller's original call stake is their "input" stake for the duel.
    ///      Overage = challengerStake - callerMatchingStake is handled at settlement.
    function acceptChallenge(uint256 challengeId)
        external
        nonReentrant
        whenNotPaused
    {
        Challenge storage ch = _challenges[challengeId];

        // ── Gates ──
        if (msg.sender != ch.caller) revert NotAuthorized();
        if (ch.status != ChallengeStatus.Proposed) revert ChallengeNotAccepted();
        if (block.timestamp > ch.proposedAt + CHALLENGE_ACCEPTANCE_WINDOW) {
            revert AcceptanceWindowExpired();
        }

        // Compute the caller's matching stake: min(caller's call stake, challengerStake).
        // The caller's call stake is read from CallRegistry — this is the caller's
        // "input stake" for the duel (per SOCIAL-31 asymmetric stake logic and the
        // CRITICAL BUG fix: must NOT use min(challengerStake, challengerStake)).
        ICallRegistry.Call memory call = callRegistry.getCall(ch.callId);
        uint96 callerInputStake = call.stake;
        uint96 callerMatchingStake = _min(callerInputStake, ch.challengerStake);

        // D-09: TVL cap check for caller's matching stake (prevents bypass via many-accepted-duels)
        _checkTvlCap(callerMatchingStake);

        // ── EFFECTS ──
        totalEscrow       += callerMatchingStake;
        ch.callerStake     = callerMatchingStake;
        ch.status          = ChallengeStatus.Accepted;

        // ── INTERACTIONS ──
        IERC20(usdc).safeTransferFrom(msg.sender, address(this), callerMatchingStake);

        emit ChallengeAccepted(challengeId, msg.sender, callerMatchingStake);
    }

    /// @inheritdoc IChallengeEscrow
    function rejectChallenge(uint256 challengeId)
        external
        nonReentrant
        whenNotPaused
    {
        Challenge storage ch = _challenges[challengeId];

        // ── Gates ──
        if (msg.sender != ch.caller) revert NotAuthorized();
        if (ch.status != ChallengeStatus.Proposed) revert ChallengeNotAccepted();

        address challenger_ = ch.challenger;
        uint96  amount      = ch.challengerStake;

        // ── EFFECTS: ALL state writes before USDC transfer (CEI) ──
        ch.status = ChallengeStatus.Rejected;
        totalEscrow -= amount;

        // ── INTERACTIONS ──
        IERC20(usdc).safeTransfer(challenger_, amount);

        emit ChallengeRejected(challengeId, msg.sender);
    }

    /// @inheritdoc IChallengeEscrow
    /// @dev Pause carve-out: NOT guarded by whenNotPaused (§10.3).
    ///      Challenger can always reclaim stake after window expires, even while paused.
    function claimRefund(uint256 challengeId)
        external
        nonReentrant
    {
        Challenge storage ch = _challenges[challengeId];

        // ── Gates ──
        if (ch.status != ChallengeStatus.Proposed) revert ClaimRefundNotAvailable();
        if (block.timestamp <= ch.proposedAt + CHALLENGE_ACCEPTANCE_WINDOW) {
            revert ClaimRefundNotAvailable();
        }

        address challenger_ = ch.challenger;
        uint96  amount      = ch.challengerStake;

        // ── EFFECTS: ALL state writes before USDC transfer (CEI) ──
        ch.status   = ChallengeStatus.Refunded;
        totalEscrow -= amount;

        // ── INTERACTIONS ──
        IERC20(usdc).safeTransfer(challenger_, amount);

        emit ChallengeRefunded(challengeId, challenger_, amount);
    }

    /// @inheritdoc IChallengeEscrow
    /// @dev Only callable by the Phase 4 SettlementManager (D-01).
    ///      Pushes overage via IERC20.transfer (bool return) so push failure
    ///      does NOT revert settleDuel (Pitfall C, D-03).
    function settleDuel(uint256 challengeId, address winner)
        external
        onlySettlementManager
        nonReentrant
    {
        Challenge storage ch = _challenges[challengeId];

        // ── Gates ──
        if (ch.status != ChallengeStatus.Accepted) revert ChallengeNotAccepted();

        // ── EFFECTS ──
        ch.winner = winner;
        ch.status = ChallengeStatus.Settled;

        // Push overage to overcommitter (if any); on failure, record UnclaimedOverage.
        // Must happen AFTER status update so _pushOverage reads correct ch state.
        _pushOverage(challengeId, ch);

        emit ChallengeSettled(challengeId, winner);
    }

    /// @inheritdoc IChallengeEscrow
    ///
    /// @dev Pause carve-out (§10.3): NOT guarded by whenNotPaused.
    ///      Winners must be able to claim even during an emergency pause.
    ///      CEI: marks claimed flag BEFORE safeTransfer (T-3-02-01).
    function claimDuelPayout(uint256 challengeId)
        external
        nonReentrant
    {
        Challenge storage ch = _challenges[challengeId];

        // ── Gates ──
        if (ch.status != ChallengeStatus.Settled) revert ChallengeNotSettled();
        if (msg.sender != ch.winner) revert NotDuelWinner();

        // Determine which side the winner is to check the per-side claimed flag
        bool isCallerWinner = (ch.winner == ch.caller);
        if (isCallerWinner) {
            if (ch.callerClaimed) revert AlreadyClaimed();
        } else {
            if (ch.challengerClaimed) revert AlreadyClaimed();
        }

        // §8.9 payout formula: pot = min(callerStake, challengerStake) * 2; fee = 1%
        uint256 pot        = uint256(_min(ch.callerStake, ch.challengerStake)) * 2;
        uint256 payout     = pot * 99 / 100;
        uint256 protocolFee = pot - payout;

        // ── EFFECTS: ALL state writes BEFORE transfers (CEI, T-3-02-01) ──
        if (isCallerWinner) {
            ch.callerClaimed = true;
        } else {
            ch.challengerClaimed = true;
        }
        totalEscrow -= pot;

        // ── INTERACTIONS ──
        IERC20(usdc).safeTransfer(ch.winner, payout);
        IERC20(usdc).safeTransfer(treasury, protocolFee);

        emit PayoutClaimed(challengeId, ch.winner, payout, protocolFee);
    }

    /// @inheritdoc IChallengeEscrow
    ///
    /// @dev Pause carve-out (§10.3): NOT guarded by whenNotPaused.
    ///      Overcommitter must be able to reclaim overage even while paused.
    ///      CEI: marks overageClaimed BEFORE safeTransfer.
    function claimOverage(uint256 challengeId)
        external
        nonReentrant
    {
        Challenge storage ch = _challenges[challengeId];

        // ── Gates ──
        if (ch.status != ChallengeStatus.Settled) revert ChallengeNotSettled();
        if (ch.overageClaimed) revert AlreadyClaimed();

        // Determine overcommitter and overage amount
        (address overcommitter, uint256 overage) = _computeOverage(ch);
        if (overage == 0) revert AlreadyClaimed(); // symmetric stakes — no overage

        if (msg.sender != overcommitter) revert NotOverageRecipient();

        // ── EFFECTS: ALL state writes BEFORE transfer (CEI) ──
        ch.overageClaimed = true;
        totalEscrow      -= overage;

        // ── INTERACTIONS ──
        IERC20(usdc).safeTransfer(overcommitter, overage);
    }

    // ─── Admin functions ───────────────────────────────────────────────────────

    /// @inheritdoc IChallengeEscrow
    function setSettlementManager(address newManager) external onlyOwner {
        require(newManager != address(0), "invalid-manager");
        settlementManager = newManager;
        emit SettlementManagerSet(newManager);
    }

    /// @inheritdoc IChallengeEscrow
    function pause() external onlyOwner { _pause(); }

    /// @inheritdoc IChallengeEscrow
    function unpause() external onlyOwner { _unpause(); }

    // ─── View functions ────────────────────────────────────────────────────────

    /// @inheritdoc IChallengeEscrow
    /// @dev Returns totalEscrow counter — NOT USDC.balanceOf(this) (Pitfall B).
    ///      Using balanceOf would double-count against the 3-way TVL cap.
    function getTvl() external view returns (uint256) {
        return totalEscrow;
    }

    /// @inheritdoc IChallengeEscrow
    function getChallenge(uint256 challengeId) external view returns (Challenge memory) {
        return _challenges[challengeId];
    }

    // ─── Internal helpers ──────────────────────────────────────────────────────

    /// @dev 3-way TVL cap check (D-04, T-3-02-05).
    ///      combined = callRegistry.currentTvl() + followFadeMarket.getTvl() + totalEscrow + incoming
    ///      Uses callRegistry.tvlCap() as the global cap — same as FollowFadeMarket._deposit().
    function _checkTvlCap(uint256 incoming) internal view {
        uint256 cap = callRegistry.tvlCap();
        uint256 combined = callRegistry.currentTvl() + followFadeMarket.getTvl() + totalEscrow + incoming;
        if (combined > cap) {
            uint256 already = combined - incoming;
            revert TvlCapReached(incoming, cap > already ? cap - already : 0);
        }
    }

    /// @dev Push overage to overcommitter during settleDuel.
    ///      Uses IERC20.transfer (bool return, NOT safeTransfer) so a griefing
    ///      wallet cannot revert settleDuel (Pitfall C, D-03).
    ///      If push fails: rollback state + emit UnclaimedOverageCreated for fallback.
    function _pushOverage(uint256 challengeId, Challenge storage ch) internal {
        (address overcommitter, uint256 overage) = _computeOverage(ch);

        // No overage (symmetric stakes) — nothing to push
        if (overage == 0) return;

        // ── EFFECTS: pre-mark claimed (optimistic) ──
        ch.overageClaimed = true;
        totalEscrow      -= overage;

        // ── INTERACTIONS: bool return — must NOT revert on failure (Pitfall C) ──
        bool ok = IERC20(usdc).transfer(overcommitter, overage);

        if (!ok) {
            // Rollback: push failed; record for claimOverage() fallback
            ch.overageClaimed = false;
            totalEscrow      += overage;
            emit UnclaimedOverageCreated(challengeId, overcommitter, overage);
        } else {
            emit OveragePushed(challengeId, overcommitter, overage);
        }
    }

    /// @dev Compute the overcommitter address and overage amount.
    ///      Overcommitter is whichever side staked more.
    ///      overage = larger stake - smaller stake.
    ///      Returns (address(0), 0) for symmetric stakes.
    function _computeOverage(Challenge storage ch)
        internal
        view
        returns (address overcommitter, uint256 overage)
    {
        uint96 callerS     = ch.callerStake;
        uint96 challengerS = ch.challengerStake;

        if (callerS > challengerS) {
            overcommitter = ch.caller;
            overage       = uint256(callerS) - uint256(challengerS);
        } else if (challengerS > callerS) {
            overcommitter = ch.challenger;
            overage       = uint256(challengerS) - uint256(callerS);
        } else {
            // Symmetric stakes — no overage
            overcommitter = address(0);
            overage       = 0;
        }
    }

    /// @dev Returns the smaller of two uint96 values.
    function _min(uint96 a, uint96 b) internal pure returns (uint96) {
        return a < b ? a : b;
    }
}
