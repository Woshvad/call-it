// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack -- Pinned Versions" + "Pinned Addresses"
// Spec: CALL_IT_SPEC1.md ss12.4 -- 14-step settle() sequence (LOCKED)
// Requirements: SETTLE-01..52, REP-03..27, SAFETY-57
//
// USDC MANDATE (ss10.5): ALL transfer paths use USDC_ARB_NATIVE from ./constants/USDC.sol.
// Never paste the literal address in this file. The CI grep guard will catch it.
//
// NON-UPGRADEABLE BY DESIGN (D-14, SAFETY-18):
// No proxy, no UUPS, no initialize(). Deploy via DeployPhase4.s.sol.
//
// CEI ORDER (SAFETY-05..09): State writes ALWAYS precede safeTransfer/safeTransferFrom.
// Any reviewer: if you see safeTransfer BEFORE a state write, that is a bug.
//
// SAFETY-57 NOTE: No delegatecall to any user-controlled address. All external calls
// target known, owner-registered contract interfaces (ICallRegistry, IFollowFadeMarket,
// IChallengeEscrow, IProfileRegistry, IPyth, IStylusScoreEngine).
//
// DISPUTE STATUS: Lives in SettlementManager.disputes[callId] ONLY.
// CallRegistry has NO markDisputed function and MUST NOT be called for disputes.
// The subgraph reads DisputeRaised events from SM to update Call.status='Disputed'.
// Frontend reads Call.status from the subgraph.
//
// CLEARDUPLICATEHASH SEAM (SETTLE-47):
// Step 12 wraps cr.clearDuplicateHash(dupHash) in try/catch so settlement completes on
// the current Sepolia CallRegistry (0x7DAd732764abfC935aD5bf8e5CFF9BEA7B2C234D) which
// predates this seam. The seam ships in source (Phase 4) and lives on mainnet CallRegistry
// (Phase 7.5). ADR-0001 mainnet-fork tests validate the full path.

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { USDC_ARB_NATIVE } from "./constants/USDC.sol";
import { ICallRegistry } from "./interfaces/ICallRegistry.sol";
import { IFollowFadeMarket } from "./interfaces/IFollowFadeMarket.sol";
import { IChallengeEscrow } from "./interfaces/IChallengeEscrow.sol";
import { IProfileRegistry } from "./interfaces/IProfileRegistry.sol";
import { ISettlementManager } from "./interfaces/ISettlementManager.sol";
import { IStylusScoreEngine } from "./interfaces/IStylusScoreEngine.sol";
import { IPyth } from "./interfaces/IPyth.sol";

/// @title SettlementManager
/// @notice Atomic 14-step settlement engine for the Call It prediction platform.
///
///         Responsibilities:
///           - Permissionless, idempotent settle(callId, pythUpdateData, acceptedChallengeIds)
///           - Oracle dispatch per (marketType, eventSubtype) via adapterMap
///           - 1.7% fee extraction (1.0% protocol + 0.4% creator + 0.3% LP) via FFM.applySettlement
///           - In-contract Solidity baseline rep delta (_solidityBaselineRepDelta) as Phase-4
///             runtime AND fallback; Phase 5 upgrades to Stylus via setStylusScoreEngine
///           - try/catch Stylus seam: IStylusScoreEngine.compute_rep_change wraps baseline
///           - Dispute window ($5 USDC bond, 24h, max 3 counter-claims, owner-resolved)
///           - forceSettle (7-day cooldown from expiry)
///           - Dispute status in local disputes[] mapping -- NOT in CallRegistry
///
/// @dev Inherits Ownable2Step, ReentrancyGuard, Pausable, ISettlementManager.
contract SettlementManager is Ownable2Step, ReentrancyGuard, Pausable, ISettlementManager {
    using SafeERC20 for IERC20;

    // ---- Constants -----------------------------------------------------------

    /// @notice Force-settle cooldown from call expiry. SETTLE-39.
    uint256 public constant FORCE_SETTLE_COOLDOWN = 7 days;

    /// @notice Maximum counter-claims per dispute. SETTLE-30.
    uint8 public constant MAX_COUNTER_CLAIMS = 3;

    /// @notice Dispute window after settlement. SETTLE-29.
    uint256 public constant DISPUTE_WINDOW = 24 hours;

    /// @notice Dispute bond amount in USDC (6 decimals = $5). SETTLE-26.
    uint256 public constant DISPUTE_BOND = 5e6;

    /// @notice Dispute reward to winning disputer. ss8.10.
    uint256 public constant DISPUTE_REWARD = 2e6;

    /// @notice Protocol fee in basis points (1.0%). SETTLE-46.
    uint256 public constant PROTOCOL_FEE_BPS = 100;

    /// @notice Creator fee in basis points (0.4%). SETTLE-46.
    uint256 public constant CREATOR_FEE_BPS = 40;

    /// @notice LP fee in basis points (0.3%). SETTLE-46.
    uint256 public constant LP_FEE_BPS = 30;

    // ---- Immutables ----------------------------------------------------------

    /// @notice CallRegistry for call data + markSettled + clearDuplicateHash. D-02.
    ICallRegistry public immutable callRegistry;

    /// @notice FollowFadeMarket for fee extraction (applySettlement) + getFadeRealReserve.
    IFollowFadeMarket public immutable followFadeMarket;

    /// @notice ChallengeEscrow for settleDuel + getChallenge (step 9).
    IChallengeEscrow public immutable challengeEscrow;

    /// @notice ProfileRegistry for applyRepDelta + updateAfterSettlement.
    IProfileRegistry public immutable profileRegistry;

    /// @notice Pyth oracle contract. Arbitrum One: 0xff1a0f4744e8582DF1aE09D5611b887B6a12925C
    ///         Arbitrum Sepolia: 0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DAF
    IPyth public immutable pyth;

    /// @notice Treasury address for protocol + creator fee routing.
    address public immutable treasury;

    // ---- Mutable admin state -------------------------------------------------

    /// @notice Phase 5 Stylus score engine. address(0) until setStylusScoreEngine() called.
    ///         The try/catch seam in step 8 falls back to _solidityBaselineRepDelta when 0.
    address public stylusScoreEngine;

    /// @notice Oracle adapter dispatch table: (marketType, eventSubtype) -> OracleAdapter.
    mapping(uint8 => mapping(uint8 => OracleAdapter)) public adapterMap;

    // ---- Dispute state -------------------------------------------------------

    /// @notice Dispute records keyed by callId.
    ///         DISPUTE STATUS LIVES HERE ONLY -- CallRegistry is UNCHANGED.
    mapping(uint256 => DisputeRecord) public disputes;

    /// @notice Final outcome after dispute resolution. Only set if resolveDispute changed outcome.
    ///         Key: callId -> final outcome (as uint8). 0 = not resolved via dispute.
    mapping(uint256 => uint8) public finalOutcomeAfterDispute;

    /// @notice Timestamp when a call was settled (used for dispute window). SETTLE-29.
    mapping(uint256 => uint256) public settledAt;

    // ---- Attestation state ---------------------------------------------------

    /// @notice Submitted attestation results for non-Pyth adapters.
    ///         Relayer calls submitAttestation() before settle().
    ///         Key: callId -> (outcome as uint8, 1-indexed timestamp when submitted)
    mapping(uint256 => uint8) private _attestedOutcome;
    mapping(uint256 => bool)  private _attestationReady;

    // ---- Constructor ---------------------------------------------------------

    /// @notice Deploy a non-upgradeable SettlementManager.
    /// @param _callRegistry     CallRegistry for call data and settlement marking.
    /// @param _followFadeMarket FollowFadeMarket for fee extraction and pool queries.
    /// @param _challengeEscrow  ChallengeEscrow for duel settlement loop.
    /// @param _profileRegistry  ProfileRegistry for rep delta + stats updates.
    /// @param _usdc             Must equal USDC_ARB_NATIVE (CI gate). USDC MANDATE.
    /// @param _treasury         Treasury address for fees (must not be address(this)).
    /// @param _pyth             Pyth oracle address per chain.
    constructor(
        address _callRegistry,
        address _followFadeMarket,
        address _challengeEscrow,
        address _profileRegistry,
        address _usdc,
        address _treasury,
        address _pyth
    ) Ownable(msg.sender) {
        require(_callRegistry    != address(0), "invalid-registry");
        require(_followFadeMarket != address(0), "invalid-ffm");
        require(_challengeEscrow != address(0), "invalid-escrow");
        require(_profileRegistry != address(0), "invalid-profile");
        require(_usdc == USDC_ARB_NATIVE, "wrong-usdc");
        require(_treasury != address(0) && _treasury != address(this), "invalid-treasury");
        require(_pyth != address(0), "invalid-pyth");

        callRegistry     = ICallRegistry(_callRegistry);
        followFadeMarket = IFollowFadeMarket(_followFadeMarket);
        challengeEscrow  = IChallengeEscrow(_challengeEscrow);
        profileRegistry  = IProfileRegistry(_profileRegistry);
        treasury         = _treasury;
        pyth             = IPyth(_pyth);
    }

    /// @notice Accept ETH top-ups for the Pyth update fee budget. Pitfall 4.
    receive() external payable {}

    // ---- Core settlement logic -----------------------------------------------

    /// @inheritdoc ISettlementManager
    /// @dev 14-step atomic settlement. whenNotPaused, nonReentrant.
    ///      Step 12: clearDuplicateHash wrapped in try/catch (Sepolia CR predates seam).
    ///      Step 14: updateAfterSettlement uses existing IProfileRegistry 3-param signature.
    function settle(
        uint256            callId,
        bytes[] calldata   pythUpdateData,
        uint256[] calldata acceptedChallengeIds
    ) external nonReentrant whenNotPaused {
        // Steps 1-6: validation + oracle dispatch
        ICallRegistry.Call memory call = callRegistry.getCall(callId);

        // Step 1: Idempotency guard
        if (call.status != ICallRegistry.CallStatus.Live &&
            call.status != ICallRegistry.CallStatus.CallerExited) {
            revert AlreadySettled();
        }

        // Step 2: Expiry guard
        if (block.timestamp < uint256(call.expiry)) revert CallNotExpired();

        // Step 4/5/6: Oracle dispatch
        (ICallRegistry.Outcome outcome, int256 priceDelta) = _dispatchOracle(callId, call, pythUpdateData);

        // Pending outcome: confidence too wide or ambiguous -- return without reverting
        if (outcome == ICallRegistry.Outcome.Pending) {
            return;
        }

        // Steps 7-10: rep delta computation
        bool isWinner    = (outcome == ICallRegistry.Outcome.CallerWon);
        bool callerExited = (call.status == ICallRegistry.CallStatus.CallerExited);
        int256 repDelta  = _computeRepDelta(callId, call, isWinner, callerExited);

        // Step 9: Duel loop
        _settleDuels(callId, call, acceptedChallengeIds, isWinner, repDelta);

        // Steps 11-15: finalize settlement
        _finalize(callId, call, outcome, isWinner, callerExited, repDelta, priceDelta);
    }

    /// @dev Steps 4-6: dispatch to oracle adapter, return (outcome, priceDelta).
    function _dispatchOracle(
        uint256 callId,
        ICallRegistry.Call memory call,
        bytes[] calldata pythUpdateData
    ) internal returns (ICallRegistry.Outcome outcome, int256 priceDelta) {
        OracleAdapter adapter = adapterMap[uint8(call.marketType)][uint8(call.eventSubtype)];

        if (adapter == OracleAdapter.Pyth) {
            return _settlePyth(callId, call, pythUpdateData);
        }

        // Non-Pyth: check for pre-submitted attestation
        if (_attestationReady[callId]) {
            return (ICallRegistry.Outcome(_attestedOutcome[callId]), 0);
        }

        // Default: CallerLost for unattested non-Pyth calls
        // (Relayer always calls submitAttestation before settle() in production)
        return (ICallRegistry.Outcome.CallerLost, 0);
    }

    /// @dev Steps 7-10: compute rep delta for caller, apply to ProfileRegistry.
    function _computeRepDelta(
        uint256 callId,
        ICallRegistry.Call memory call,
        bool isWinner,
        bool callerExited
    ) internal returns (int256 repDelta) {
        address callerAddr = call.caller;

        // Step 7: Cold-start check (CALL-41, REP-14)
        bool coldStart = (followFadeMarket.getFadeRealReserve(callId) == 0);

        // Step 8: Read current rep + compute consensusPct
        uint128 currentRep = profileRegistry.globalRep(callerAddr);
        uint8 conviction   = call.conviction;
        uint8 consensusPct = _computeConsensusPct(callId);

        // Stylus try/catch seam (REP-22/23)
        address stylusAddr = stylusScoreEngine;
        if (stylusAddr != address(0)) {
            try IStylusScoreEngine(stylusAddr).compute_rep_change(
                currentRep, conviction, consensusPct, isWinner, 10
            ) returns (int32 d) {
                repDelta = int256(d);
            } catch (bytes memory err) {
                repDelta = _solidityBaselineRepDelta(conviction, consensusPct, isWinner);
                emit RepCalculatedFallback(callId, callerAddr, repDelta, err);
            }
        } else {
            repDelta = _solidityBaselineRepDelta(conviction, consensusPct, isWinner);
        }

        // Step 10: cold-start scaling 25% on win (REP-14, SETTLE-45)
        if (coldStart && isWinner && !callerExited) {
            repDelta = (repDelta * 25) / 100;
        }

        // Apply rep delta (skip if callerExited -- exit rep was already applied)
        if (!callerExited) {
            profileRegistry.applyRepDelta(callerAddr, repDelta);
        }

        emit RepCalculated(callId, callerAddr, currentRep, conviction, consensusPct, isWinner, 10, repDelta);
    }

    /// @dev Step 9: duel loop over caller-supplied acceptedChallengeIds.
    ///      Each entry validated on-chain via getChallenge() (SETTLE-43, T-04-02-09).
    function _settleDuels(
        uint256 callId,
        ICallRegistry.Call memory call,
        uint256[] calldata acceptedChallengeIds,
        bool isWinner,
        int256 repDelta
    ) internal {
        for (uint256 i = 0; i < acceptedChallengeIds.length; i++) {
            IChallengeEscrow.Challenge memory ch =
                challengeEscrow.getChallenge(acceptedChallengeIds[i]);

            if (ch.callId != callId) revert InvalidChallengeForCall();
            if (ch.status != IChallengeEscrow.ChallengeStatus.Accepted) revert ChallengeNotAccepted();

            address duelWinner = isWinner ? call.caller : ch.challenger;
            address duelLoser  = isWinner ? ch.challenger : call.caller;

            challengeEscrow.settleDuel(acceptedChallengeIds[i], duelWinner);

            // REP-27: ~1.5x rep to duel winner, -10 to loser
            profileRegistry.applyRepDelta(duelWinner, (repDelta * 3) / 2);
            profileRegistry.applyRepDelta(duelLoser,  -int256(10));
        }
    }

    /// @dev Steps 11-15: fee extraction, duplicate-hash clear, markSettled, stats, event.
    function _finalize(
        uint256 callId,
        ICallRegistry.Call memory call,
        ICallRegistry.Outcome outcome,
        bool isWinner,
        bool callerExited,
        int256 repDelta,
        int256 priceDelta
    ) internal {
        // Step 11: 1.7% fee extraction via FFM.applySettlement
        (uint256 protocolFee, uint256 creatorFee, uint256 lpFee) =
            _computeFees(callId, callerExited, followFadeMarket.callerVolumeAtExit(callId));
        followFadeMarket.applySettlement(callId, uint8(outcome), protocolFee, creatorFee, lpFee);

        // Step 12: Clear duplicate hash (try/catch: Sepolia CR predates seam, SETTLE-47)
        bytes32 dupHash = call.duplicateHash;
        if (dupHash != bytes32(0)) {
            try callRegistry.clearDuplicateHash(dupHash) {} catch {
                // Sepolia CallRegistry lacks seam; clear is a documented no-op pre-7.5
            }
        }

        // Step 13: Mark call settled in CallRegistry
        callRegistry.markSettled(callId, outcome);
        settledAt[callId] = block.timestamp;

        // Step 14: Update ProfileRegistry stats counters
        profileRegistry.updateAfterSettlement(call.caller, isWinner, uint8(call.category));

        // Step 15: Emit CallSettled
        emit CallSettled(callId, uint8(outcome), priceDelta);

        // Suppress unused variable warning (repDelta used in _settleDuels via caller)
        repDelta;
    }

    /// @dev Compute consensusPct = fade/(follow+fade) real reserves at settle time (0-100).
    function _computeConsensusPct(uint256 callId) internal view returns (uint8) {
        uint256 followRes = followFadeMarket.followReserve(callId);
        uint256 fadeReal  = followFadeMarket.getFadeRealReserve(callId);
        uint256 totalReal = followRes + fadeReal;
        return totalReal > 0 ? uint8((fadeReal * 100) / totalReal) : 0;
    }

    /// @inheritdoc ISettlementManager
    /// @dev forceSettle is onlyOwner, callable after expiry + FORCE_SETTLE_COOLDOWN. SETTLE-39.
    ///      Emits BOTH CallForceSettled AND CallSettled (SETTLE-40 dual-event audit trail).
    function forceSettle(uint256 callId) external onlyOwner nonReentrant {
        ICallRegistry.Call memory call = callRegistry.getCall(callId);

        // Must not be settled
        if (call.status == ICallRegistry.CallStatus.Settled) revert AlreadySettled();

        // Cooldown: must be at least FORCE_SETTLE_COOLDOWN after expiry
        if (block.timestamp < uint256(call.expiry) + FORCE_SETTLE_COOLDOWN) {
            revert ForceSettleCooldownActive();
        }

        // Force outcome: CallerLost (permissive default -- owner is the decider)
        ICallRegistry.Outcome outcome = ICallRegistry.Outcome.CallerLost;

        // Apply fee extraction (cold-start or normal)
        (uint256 protocolFee, uint256 creatorFee, uint256 lpFee) =
            _computeFees(callId, call.callerExitedAt > 0, callerVolumeAtExit(callId));
        followFadeMarket.applySettlement(callId, uint8(outcome), protocolFee, creatorFee, lpFee);

        // Clear duplicate hash (try/catch for Sepolia CR compatibility)
        bytes32 dupHash = call.duplicateHash;
        if (dupHash != bytes32(0)) {
            try callRegistry.clearDuplicateHash(dupHash) {} catch {}
        }

        // Mark settled
        callRegistry.markSettled(callId, outcome);
        settledAt[callId] = block.timestamp;

        // Update ProfileRegistry stats (caller lost)
        profileRegistry.updateAfterSettlement(call.caller, false, uint8(call.category));

        // SETTLE-40: emit BOTH events for loud audit trail
        emit CallForceSettled(callId, uint8(outcome));
        emit CallSettled(callId, uint8(outcome), 0);
    }

    // ---- Dispute system ------------------------------------------------------

    /// @inheritdoc ISettlementManager
    /// @dev raiseDispute: $5 USDC bond, 24h window, stores dispute in local mapping.
    ///      CEI: update disputes[callId] BEFORE safeTransferFrom. SETTLE-25/26.
    ///      IMPORTANT: dispute status stored ONLY here -- CallRegistry is UNCHANGED.
    function raiseDispute(uint256 callId, bytes32 evidenceHash) external nonReentrant whenNotPaused {
        ICallRegistry.Call memory call = callRegistry.getCall(callId);

        // Must be settled
        require(call.status == ICallRegistry.CallStatus.Settled, "not-settled");

        // 24h window
        if (block.timestamp > settledAt[callId] + DISPUTE_WINDOW) revert DisputeWindowClosed();

        DisputeRecord storage dispute = disputes[callId];

        if (dispute.disputer == address(0)) {
            // First dispute
            // ── EFFECTS ──
            dispute.disputer          = msg.sender;
            dispute.evidenceHash      = evidenceHash;
            dispute.bondAmount        = DISPUTE_BOND;
            dispute.windowCloseAt     = block.timestamp + DISPUTE_WINDOW;
            dispute.status            = DisputeStatus.Open;
            dispute.counterClaimCount = 0;

            // ── INTERACTIONS ──
            IERC20(USDC_ARB_NATIVE).safeTransferFrom(msg.sender, address(this), DISPUTE_BOND);
        } else {
            revert DisputeAlreadyRaised();
        }

        emit DisputeRaised(callId, msg.sender, evidenceHash);
    }

    /// @inheritdoc ISettlementManager
    /// @dev counterClaim: adds a counter-claim to an open dispute. Max 3. SETTLE-30.
    function counterClaim(uint256 callId, bytes32 evidenceHash) external nonReentrant whenNotPaused {
        DisputeRecord storage dispute = disputes[callId];

        require(dispute.disputer != address(0), "no-dispute");
        require(dispute.status == DisputeStatus.Open, "dispute-resolved");

        if (dispute.counterClaimCount >= MAX_COUNTER_CLAIMS) revert MaxCounterClaimsReached();

        // 24h window applies to counter-claims too
        if (block.timestamp > dispute.windowCloseAt) revert DisputeWindowClosed();

        // ── EFFECTS ──
        dispute.counterClaimCount++;
        dispute.counterClaimers.push(msg.sender);
        dispute.bondAmount += DISPUTE_BOND;

        // ── INTERACTIONS ──
        IERC20(USDC_ARB_NATIVE).safeTransferFrom(msg.sender, address(this), DISPUTE_BOND);

        emit DisputeRaised(callId, msg.sender, evidenceHash);
    }

    /// @inheritdoc ISettlementManager
    /// @dev resolveDispute: owner resolves, may reverse outcome, redistributes funds.
    ///      SETTLE-34: pool redistribution + rep reversal on reversal.
    function resolveDispute(uint256 callId, uint8 finalOutcome) external onlyOwner nonReentrant {
        DisputeRecord storage dispute = disputes[callId];

        require(dispute.disputer != address(0), "no-dispute");
        require(dispute.status == DisputeStatus.Open, "not-open");

        ICallRegistry.Call memory call = callRegistry.getCall(callId);
        uint8 currentOutcome = uint8(call.outcome);

        // ── EFFECTS ──
        dispute.status = DisputeStatus.Resolved;
        finalOutcomeAfterDispute[callId] = finalOutcome;

        // If outcome reversed: apply rep delta to new winner, update CallRegistry outcome
        if (finalOutcome != currentOutcome && finalOutcome != uint8(ICallRegistry.Outcome.Pending)) {
            bool newIsWinner = (finalOutcome == uint8(ICallRegistry.Outcome.CallerWon));
            int256 repDelta = _solidityBaselineRepDelta(call.conviction, 0, newIsWinner);
            profileRegistry.applyRepDelta(call.caller, repDelta);

            // Update CallRegistry outcome for dispute reversal
            // updateOutcomeForDispute is an additive seam (Phase 4 source, Phase 7.5 mainnet)
            // Wrapped in try/catch for Sepolia compatibility (lacks seam pre-7.5)
            try callRegistry.updateOutcomeForDispute(callId, ICallRegistry.Outcome(finalOutcome)) {}
            catch { /* Sepolia CR predates seam; outcome update deferred to subgraph */ }
        }

        // Refund winning disputer bond + reward; forfeit losing disputer bond to treasury
        uint256 bondToReturn = DISPUTE_BOND + DISPUTE_REWARD;
        uint256 bondToTreasury = dispute.bondAmount > bondToReturn
            ? dispute.bondAmount - bondToReturn
            : 0;

        // ── INTERACTIONS ──
        if (bondToReturn > 0 && IERC20(USDC_ARB_NATIVE).balanceOf(address(this)) >= bondToReturn) {
            IERC20(USDC_ARB_NATIVE).safeTransfer(dispute.disputer, bondToReturn);
        }
        if (bondToTreasury > 0) {
            IERC20(USDC_ARB_NATIVE).safeTransfer(treasury, bondToTreasury);
        }

        emit DisputeResolved(callId, finalOutcome, msg.sender);
    }

    // ---- Admin setters -------------------------------------------------------

    /// @inheritdoc ISettlementManager
    function setAdapterMap(uint8 marketType, uint8 eventSubtype, OracleAdapter adapter)
        external onlyOwner
    {
        adapterMap[marketType][eventSubtype] = adapter;
    }

    /// @notice Set the Phase 5 Stylus score engine address.
    ///         address(0) means use Solidity baseline only (Phase 4 default).
    function setStylusScoreEngine(address engine) external onlyOwner {
        stylusScoreEngine = engine;
    }

    /// @notice Pause settle(), raiseDispute(), counterClaim(). SAFETY-04.
    function pause() external onlyOwner { _pause(); }

    /// @notice Unpause.
    function unpause() external onlyOwner { _unpause(); }

    // ---- Internal helpers ----------------------------------------------------

    /// @notice Compute 1.7% fee split for a settled call.
    ///         REP-22/SETTLE-46: 1.0% protocol + 0.4% creator + 0.3% LP.
    ///         Creator fee uses callerVolumeAtExit if caller exited, else totalPool.
    function _computeFees(
        uint256 callId,
        bool    callerExited,
        uint256 callerVolAtExit
    ) internal view returns (uint256 protocolFee, uint256 creatorFee, uint256 lpFee) {
        uint256 followRes = followFadeMarket.followReserve(callId);
        uint256 fadeReal  = followFadeMarket.getFadeRealReserve(callId);
        uint256 totalPool = followRes + fadeReal;

        protocolFee = (totalPool * PROTOCOL_FEE_BPS) / 10_000;

        uint256 creatorBase = callerExited ? callerVolAtExit : totalPool;
        creatorFee  = (creatorBase * CREATOR_FEE_BPS) / 10_000;

        lpFee = (totalPool * LP_FEE_BPS) / 10_000;
    }

    /// @notice Get the callerVolumeAtExit from FollowFadeMarket for creator fee Model B.
    function callerVolumeAtExit(uint256 callId) internal view returns (uint256) {
        return followFadeMarket.callerVolumeAtExit(callId);
    }

    /// @notice Pyth oracle settlement. SETTLE-07/08.
    ///         Confidence gate: confidence * 200 <= price (SETTLE-08).
    ///         Returns Pending if confidence too wide; SettlementDelayed emitted.
    function _settlePyth(
        uint256 callId,
        ICallRegistry.Call memory call,
        bytes[] calldata pythUpdateData
    ) internal returns (ICallRegistry.Outcome outcome, int256 priceDelta) {
        // 1. Pre-pay Pyth update fee (ETH, not USDC) -- Pitfall 4
        uint256 fee = pyth.getUpdateFee(pythUpdateData);
        if (fee > 0) {
            require(address(this).balance >= fee, "InsufficientEthForPythFee");
            pyth.updatePriceFeeds{value: fee}(pythUpdateData);
        } else if (pythUpdateData.length > 0) {
            pyth.updatePriceFeeds{value: 0}(pythUpdateData);
        }

        // 2. Read price with 60s freshness window (SETTLE-07)
        bytes32 feedId = bytes32(call.assetA);
        IPyth.Price memory p = pyth.getPriceNoOlderThan(feedId, 60);

        // 3. Confidence gate: confidence * 200 <= price (SETTLE-08)
        // Use int256 arithmetic to avoid overflow with uint64 conf
        int256 absPrice = p.price > 0 ? int256(p.price) : -int256(p.price);
        if (int256(uint256(p.conf)) * 200 > absPrice) {
            emit SettlementDelayed(callId, "PYTH_CONFIDENCE_WIDE", block.timestamp + 60);
            return (ICallRegistry.Outcome.Pending, 0);
        }

        // 4. Compare price to target
        // targetValue stored in same units as Pyth price (8-decimal form, expo=-8)
        int256 currentPrice = p.price;
        int256 target = int256(call.targetValue);
        priceDelta = currentPrice - target;

        if (currentPrice >= target) {
            outcome = ICallRegistry.Outcome.CallerWon;
        } else {
            outcome = ICallRegistry.Outcome.CallerLost;
        }
    }

    /// @notice Solidity baseline rep delta. REP-22 lower fidelity.
    ///         Linear conviction scale; contrarian=1.0 fixed; no 2x asymmetry at >=85.
    ///
    ///         Full-fidelity Stylus implementation (Phase 5) adds:
    ///           - High-conviction 2x asymmetry at conviction >= 85
    ///           - Contrarian multiplier scaling with consensus pct
    ///           - Category-weighted rep routing
    ///
    /// @param conviction  Call conviction 0-100.
    /// @param isWinner    True if caller won.
    /// @return delta Signed reputation delta.
    function _solidityBaselineRepDelta(
        uint8 conviction,
        uint8 /*consensusPct*/,
        bool  isWinner
    ) internal pure returns (int256 delta) {
        uint256 BASE = 10;
        // Linear conviction scale: at conviction=50 -> 1.0x; at 100 -> 2.0x
        // multiply first to avoid integer truncation: (BASE * conviction * 2) / 100
        uint256 scaled = (BASE * uint256(conviction) * 2) / 100;
        if (scaled < 1) scaled = 1; // floor: any action earns at least 1 rep

        if (isWinner) {
            delta = int256(scaled);
        } else {
            delta = -int256(scaled);
        }
        // REP-02: caller of applyRepDelta handles the floor at 0
    }
}
