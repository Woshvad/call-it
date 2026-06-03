// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions" + "Pinned Addresses"
// Spec: CALL_IT_SPEC1.md §8.1, §8.7.1, §8.7.2, §11.2, §12.2 — FollowFadeMarket AMM
// Requirement: SOCIAL-01..28, D-01..D-06
//
// USDC MANDATE (§10.5 / ADR-0001): ALL transfer paths use the chainid-resolved `usdc` immutable
// (= resolveUsdc(): 42161 -> USDC_ARB_NATIVE, 421614 -> USDC_ARB_SEPOLIA) from ./constants/USDC.sol.
// Never paste the literal address in this file. The CI grep guard will catch it.
//
// NON-UPGRADEABLE BY DESIGN (D-14, SAFETY-18):
// No proxy, no UUPS, no initialize(). Deploy via DeployPhase2.s.sol.
//
// CEI ORDER (SAFETY-05..09): State writes ALWAYS precede safeTransfer/safeTransferFrom.
// Any reviewer: if you see safeTransfer BEFORE a state write, that is a bug.
//
// PAUSE CARVE-OUTS (§10.3): exitPosition and claimPayout are NOT guarded by whenNotPaused.
// Users must always be able to exit their positions regardless of pause state.

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { resolveUsdc } from "./constants/USDC.sol";
import { IProfileRegistry } from "./interfaces/IProfileRegistry.sol";
import { ICallRegistry } from "./interfaces/ICallRegistry.sol";
import { IFollowFadeMarket } from "./interfaces/IFollowFadeMarket.sol";

/// @title FollowFadeMarket
/// @notice Constant-product AMM with per-callId sub-state for follow/fade positions.
///
///         Architecture:
///           - Single contract holds ALL real USDC across every active call (§11.2).
///           - Per-call state keyed by callId in flat mappings (not per-call proxies).
///           - Follow pool: caller's stake + follower deposits.
///           - Fade pool: virtual seed (accounting-only) + fader deposits.
///           - k-invariant: followReserve * fadeReserve can only grow after deposits + penalty injection.
///
///         Key invariants:
///           - getTvl() = USDC.balanceOf(this) = sum of all real USDC across all pools.
///           - Virtual fade seed is NEVER transferred — only an accounting entry.
///           - Penalty injection grows k; ZERO new shares minted (SOCIAL-11).
///           - Treasury address MUST NOT be address(this) (TVL accounting invariant).
///
///         Pause carve-outs: exitPosition and claimPayout work while paused (§10.3).
///         follow, fade, callerExit, initPool are blocked by whenNotPaused.
///
/// @dev Inherits Ownable2Step, ReentrancyGuard, Pausable.
contract FollowFadeMarket is Ownable2Step, ReentrancyGuard, Pausable, IFollowFadeMarket {
    using SafeERC20 for IERC20;

    // ─── Constants ─────────────────────────────────────────────────────────────

    /// @notice Minimum per-position size ($1 USDC). SOCIAL-03.
    uint256 public constant MIN_POSITION = 1e6;

    /// @notice Maximum cumulative position per user per call ($100 USDC). SOCIAL-04.
    uint256 public constant MAX_POSITION = 100e6;

    /// @notice Flat 10% exit slash for follower/fader exits. SOCIAL-13.
    uint256 public constant POSITION_EXIT_PENALTY_PCT = 10;

    /// @notice Exit cooldown (4 hours). SOCIAL-12.
    uint256 public constant POSITION_EXIT_COOLDOWN = 4 hours;

    /// @notice Caller cannot exit during first 24h. SOCIAL-17.
    uint256 public constant CALLER_EXIT_LOCK_DURATION = 24 hours;

    /// @notice Floor percentage for caller exit penalty. SOCIAL-18.
    uint256 public constant CALLER_EXIT_BASE_PCT = 15;

    /// @notice Variable component of caller exit penalty. SOCIAL-18.
    uint256 public constant CALLER_EXIT_VARIABLE_PCT = 35;

    /// @notice Internal share price at pool bootstrap (= $0.000001 per share at 18-decimal).
    uint256 public constant INITIAL_SHARE_PRICE = 1e12;

    /// @notice Share precision: 18 decimals internally (USDC is 6 decimals).
    uint256 public constant SHARE_PRECISION = 1e18;

    // ─── Immutable state ───────────────────────────────────────────────────────

    /// @notice CallRegistry address — read for call data + TVL cap; called for markCallerExited.
    ICallRegistry public immutable callRegistry;

    /// @notice ProfileRegistry — called for applyRepDelta on callerExit (SOCIAL-26, D-05).
    IProfileRegistry public immutable profileRegistry;

    /// @notice Chainid-resolved USDC token (= resolveUsdc()). ADR-0001 hybrid money-path:
    ///         mainnet 42161 -> USDC_ARB_NATIVE, Sepolia 421614 -> USDC_ARB_SEPOLIA. All real
    ///         USDC the AMM holds/moves flows through this immutable (getTvl reads it too).
    address public immutable usdc;

    // ─── Mutable admin state ───────────────────────────────────────────────────

    /// @notice Treasury address for fee routing. MUST NOT be address(this).
    address public treasury;

    /// @notice Phase 4 SettlementManager address. Set by owner via setSettlementManager.
    address public settlementManager;

    /// @notice Guards against double-extraction of fees. Set to true in applySettlement.
    mapping(uint256 => bool) public settlementApplied;

    // ─── Per-callId pool state (keyed by callId) — Research Pattern 8 ──────────

    /// @notice Real follow-side USDC reserve (6 decimals).
    mapping(uint256 => uint256) public followReserve;

    /// @notice Fade-side reserve (real + virtual USDC, 6 decimals).
    mapping(uint256 => uint256) public fadeReserve;

    /// @notice Virtual fade seed amount (accounting-only; used to compute real fade USDC).
    ///         Real fade USDC = fadeReserve - fadeSeedVirtual.
    mapping(uint256 => uint256) public fadeSeedVirtual;

    /// @notice Total follow shares outstanding (18 decimals).
    mapping(uint256 => uint256) public followTotalShares;

    /// @notice Total fade shares outstanding (18 decimals).
    mapping(uint256 => uint256) public fadeTotalShares;

    /// @notice Snapshot of combined pool volume at caller exit time (SOCIAL-20).
    ///         = followReserve + (fadeReserve - fadeSeedVirtual) at exit.
    mapping(uint256 => uint256) public callerVolumeAtExit;

    /// @notice Timestamp when caller exited. 0 until callerExit. SOCIAL-21.
    mapping(uint256 => uint64)  public callerExitedAt;

    // ─── Per-callId per-user position state ────────────────────────────────────

    /// @notice User's follow shares (18 decimals). SOCIAL-01.
    mapping(uint256 => mapping(address => uint256)) public followShares;

    /// @notice User's fade shares (18 decimals). SOCIAL-02.
    mapping(uint256 => mapping(address => uint256)) public fadeShares;

    /// @notice Cumulative USDC deposited on follow side (6 dec); MAX_POSITION cap. SOCIAL-04.
    mapping(uint256 => mapping(address => uint256)) public followPosition;

    /// @notice Cumulative USDC deposited on fade side (6 dec); MAX_POSITION cap. SOCIAL-04.
    mapping(uint256 => mapping(address => uint256)) public fadePosition;

    /// @notice Entry timestamp for follow position. SOCIAL-10 (reset on additive deposit).
    mapping(uint256 => mapping(address => uint64))  public followEntryTime;

    /// @notice Entry timestamp for fade position. SOCIAL-10 (reset on additive deposit).
    mapping(uint256 => mapping(address => uint64))  public fadeEntryTime;

    /// @notice Whether a user has claimed their payout for a call. SOCIAL-46.
    mapping(uint256 => mapping(address => bool))    public claimed;

    // ─── Constructor ───────────────────────────────────────────────────────────

    /// @notice Deploy a non-upgradeable FollowFadeMarket.
    /// @param _callRegistry    The CallRegistry to read call data from and call markCallerExited.
    /// @param _profileRegistry The ProfileRegistry to call applyRepDelta on caller exit.
    /// @param _treasury        Treasury address for fee routing (MUST NOT be address(this)).
    constructor(
        address _callRegistry,
        address _profileRegistry,
        address _treasury
    ) Ownable(msg.sender) {
        require(_callRegistry != address(0), "invalid-registry");
        require(_profileRegistry != address(0), "invalid-profile-registry");
        require(_treasury != address(0) && _treasury != address(this), "invalid-treasury");
        callRegistry = ICallRegistry(_callRegistry);
        profileRegistry = IProfileRegistry(_profileRegistry);
        treasury = _treasury;
        usdc = resolveUsdc(); // ADR-0001 chainid gate; reverts on unsupported chain (fail-fast at deploy)
    }

    // ─── Core pool initialization ──────────────────────────────────────────────

    /// @inheritdoc IFollowFadeMarket
    /// @dev Called only by CallRegistry on createCall (D-01). Caller stake is already
    ///      transferred before this function is called.
    ///      whenNotPaused: initPool is paused to prevent new pools during emergency.
    function initPool(
        uint256 callId,
        uint256 stakeAmount,
        uint256 virtualSeed
    ) external nonReentrant whenNotPaused {
        if (msg.sender != address(callRegistry)) revert NotAuthorized();
        // Validate amounts are within safe range (max USDC = $100K = 1e11 units).
        // This prevents arithmetic overflow in invariant fuzz tests when the fuzzer
        // impersonates callRegistry address with extreme values.
        require(stakeAmount <= 100_000e6, "stake-too-large");
        require(virtualSeed <= 100_000e6, "seed-too-large");

        // Bootstrap follow side: caller's stake at INITIAL_SHARE_PRICE
        // Use Math.mulDiv to prevent overflow for large values in fuzz tests
        uint256 callerShares = Math.mulDiv(stakeAmount, SHARE_PRECISION, INITIAL_SHARE_PRICE);
        ICallRegistry.Call memory call = callRegistry.getCall(callId);

        // Initialize caller's profile lazily (REP-01: globalRep=100 on first touch).
        // Uses applyRepDelta(0) to trigger _initIfNeeded without changing rep.
        profileRegistry.applyRepDelta(call.caller, 0);

        // EFFECTS: initialize per-callId state
        followReserve[callId]      = stakeAmount;
        followTotalShares[callId]  = callerShares;
        followShares[callId][call.caller] = callerShares;
        followPosition[callId][call.caller] = stakeAmount;
        followEntryTime[callId][call.caller] = uint64(block.timestamp);

        // Bootstrap fade side: virtual seed (accounting-only; USDC never transferred)
        // Use Math.mulDiv to prevent overflow for large values in fuzz tests
        uint256 fadeSeedShares = Math.mulDiv(virtualSeed, SHARE_PRECISION, INITIAL_SHARE_PRICE);
        fadeReserve[callId]     = virtualSeed;
        fadeSeedVirtual[callId] = virtualSeed;
        fadeTotalShares[callId] = fadeSeedShares;

        emit PoolInitialized(callId, stakeAmount, virtualSeed);
    }

    // ─── Core AMM operations ───────────────────────────────────────────────────

    /// @inheritdoc IFollowFadeMarket
    function follow(
        uint256 callId,
        uint256 amountIn,
        uint256 minSharesOut
    ) external nonReentrant whenNotPaused {
        _deposit(callId, amountIn, minSharesOut, Side.Follow);
    }

    /// @inheritdoc IFollowFadeMarket
    function fade(
        uint256 callId,
        uint256 amountIn,
        uint256 minSharesOut
    ) external nonReentrant whenNotPaused {
        _deposit(callId, amountIn, minSharesOut, Side.Fade);
    }

    /// @dev Internal deposit logic for follow and fade. SOCIAL-01/02.
    function _deposit(
        uint256 callId,
        uint256 amountIn,
        uint256 minSharesOut,
        Side    side
    ) internal {
        // ── Gates ──
        ICallRegistry.Call memory call = callRegistry.getCall(callId);

        // SOCIAL-08: accept Live OR CallerExited
        if (call.status != ICallRegistry.CallStatus.Live &&
            call.status != ICallRegistry.CallStatus.CallerExited) {
            revert CallNotLive();
        }

        // SOCIAL-07: strict < (Pitfall 10 — NOT <=)
        if (block.timestamp >= call.expiry) revert CallPastExpiry();

        // SOCIAL-03: minimum position
        if (amountIn < MIN_POSITION) revert PositionBelowMinimum();

        // SOCIAL-04: maximum cumulative position
        uint256 current = side == Side.Follow
            ? followPosition[callId][msg.sender]
            : fadePosition[callId][msg.sender];
        if (current + amountIn > MAX_POSITION) revert PositionAboveMaximum();

        // SOCIAL-09 / D-03: TVL cap check (combined CR + FFM)
        uint256 combinedTvl = callRegistry.currentTvl() + getTvl();
        if (combinedTvl + amountIn > callRegistry.tvlCap()) {
            revert TvlCapReached(amountIn, callRegistry.tvlCap() - combinedTvl);
        }

        // ── AMM share computation ──
        uint256 reserve;
        uint256 totalShares;
        if (side == Side.Follow) {
            reserve     = followReserve[callId];
            totalShares = followTotalShares[callId];
        } else {
            reserve     = fadeReserve[callId];
            totalShares = fadeTotalShares[callId];
        }

        // sharesOut = totalShares * amountIn / (reserve + amountIn)  [Research Pattern 2]
        uint256 sharesOut = Math.mulDiv(totalShares, amountIn, reserve + amountIn);

        // SOCIAL-05: slippage protection
        if (sharesOut < minSharesOut) revert SlippageExceeded(minSharesOut, sharesOut);

        // ── EFFECTS: ALL state writes before any USDC transfer (CEI) ──
        if (side == Side.Follow) {
            followReserve[callId]              += amountIn;
            followTotalShares[callId]          += sharesOut;
            followShares[callId][msg.sender]   += sharesOut;
            followPosition[callId][msg.sender] += amountIn;
            followEntryTime[callId][msg.sender] = uint64(block.timestamp); // SOCIAL-10: reset on additive
        } else {
            fadeReserve[callId]              += amountIn;
            fadeTotalShares[callId]          += sharesOut;
            fadeShares[callId][msg.sender]   += sharesOut;
            fadePosition[callId][msg.sender] += amountIn;
            fadeEntryTime[callId][msg.sender] = uint64(block.timestamp);   // SOCIAL-10: reset on additive
        }

        // ── INTERACTIONS: USDC transfer LAST (CEI, SAFETY-05, SAFETY-14) ──
        IERC20(usdc).safeTransferFrom(msg.sender, address(this), amountIn);

        if (side == Side.Follow) {
            emit Followed(callId, msg.sender, amountIn, sharesOut);
        } else {
            emit Faded(callId, msg.sender, amountIn, sharesOut);
        }
    }

    // ─── Position exit ─────────────────────────────────────────────────────────

    /// @inheritdoc IFollowFadeMarket
    /// @dev Pause carve-out: NOT guarded by whenNotPaused (§10.3).
    function exitPosition(uint256 callId, Side side) external nonReentrant {
        // ── Gates ──
        ICallRegistry.Call memory call = callRegistry.getCall(callId);

        // SOCIAL-16: only Live or CallerExited — not Settled/Disputed
        if (call.status != ICallRegistry.CallStatus.Live &&
            call.status != ICallRegistry.CallStatus.CallerExited) {
            revert CallNotLive();
        }

        // SOCIAL-12: 4-hour exit cooldown
        uint64 entryTime = side == Side.Follow
            ? followEntryTime[callId][msg.sender]
            : fadeEntryTime[callId][msg.sender];
        if (block.timestamp < uint256(entryTime) + POSITION_EXIT_COOLDOWN) {
            revert ExitCooldownActive(uint64(uint256(entryTime) + POSITION_EXIT_COOLDOWN));
        }

        // ── Compute position USDC value ──
        uint256 userShares;
        uint256 totalShrs;
        uint256 reserve;
        if (side == Side.Follow) {
            userShares = followShares[callId][msg.sender];
            totalShrs  = followTotalShares[callId];
            reserve    = followReserve[callId];
        } else {
            userShares = fadeShares[callId][msg.sender];
            totalShrs  = fadeTotalShares[callId];
            reserve    = fadeReserve[callId];
        }

        require(userShares > 0, "no-position");

        // positionValue = userShares * reserve / totalShares
        uint256 positionValue = Math.mulDiv(userShares, reserve, totalShrs);

        // ── Slash computation (SOCIAL-13/14) ──
        uint256 slash        = (positionValue * POSITION_EXIT_PENALTY_PCT) / 100;
        uint256 userReceives = positionValue - slash;

        // 50/40/10 split — subtraction for last term avoids dust (Pitfall 3, §12.2)
        uint256 toOpposite = (slash * 50) / 100;
        uint256 toSameSide = (slash * 40) / 100;
        uint256 toTreasury = slash - toOpposite - toSameSide;

        // ── EFFECTS: ALL state writes before transfers (CEI) ──
        // Burn user's shares
        if (side == Side.Follow) {
            followShares[callId][msg.sender]   = 0;
            followTotalShares[callId]          -= userShares;
            followReserve[callId]              -= positionValue;
            followPosition[callId][msg.sender]  = 0;
            // Inject: 50% → opposite (fade), 40% → same (follow)
            fadeReserve[callId]   += toOpposite;  // SOCIAL-11: reserve only, NO new shares
            followReserve[callId] += toSameSide;  // SOCIAL-11: reserve only, NO new shares
        } else {
            fadeShares[callId][msg.sender]   = 0;
            fadeTotalShares[callId]          -= userShares;
            fadeReserve[callId]              -= positionValue;
            fadePosition[callId][msg.sender]  = 0;
            // Inject: 50% → opposite (follow), 40% → same (fade)
            followReserve[callId] += toOpposite; // SOCIAL-11: reserve only, NO new shares
            fadeReserve[callId]   += toSameSide; // SOCIAL-11: reserve only, NO new shares
        }

        // ── INTERACTIONS: transfers LAST (CEI) ──
        IERC20(usdc).safeTransfer(msg.sender, userReceives);
        IERC20(usdc).safeTransfer(treasury, toTreasury);

        emit PositionExited(callId, msg.sender, side, userReceives, slash);
    }

    // ─── Caller exit ───────────────────────────────────────────────────────────

    /// @inheritdoc IFollowFadeMarket
    function callerExit(uint256 callId) external nonReentrant whenNotPaused {
        _callerExitImpl(callId);
    }

    /// @dev Implementation split into sub-function to avoid stack-too-deep (Solidity 16-slot limit).
    function _callerExitImpl(uint256 callId) internal {
        ICallRegistry.Call memory call = callRegistry.getCall(callId);

        // SOCIAL-17: only the original caller can exit
        if (msg.sender != call.caller) revert NotCallerOfCall();

        // SOCIAL-17: 24h lock — STRICT > (must be after lock expires)
        if (block.timestamp <= uint256(call.createdAt) + CALLER_EXIT_LOCK_DURATION) {
            revert CallerExitLocked(uint64(uint256(call.createdAt) + CALLER_EXIT_LOCK_DURATION));
        }

        // ── Compute caller's stake value + penalty (sub-function to save stack) ──
        (uint256 callerShares, uint256 callerValue, uint256 slash, uint256 userReceives) =
            _computeCallerExitAmounts(callId, call);

        // ── Rep delta (SOCIAL-26, Research Pattern 6) ──
        int256 repDelta = _callerExitRepDelta(callId, call);

        // ── SOCIAL-27: snapshot callerVolumeAtExit (BEFORE burning shares, Pitfall 7) ──
        callerVolumeAtExit[callId] = followReserve[callId]
            + (fadeReserve[callId] - fadeSeedVirtual[callId]);

        // ── EFFECTS: ALL state writes before external calls and transfers (CEI) ──
        _applyCallerExitEffects(callId, call.caller, callerShares, callerValue, slash);

        // ── INTERACTIONS: external calls + transfers LAST (CEI) ──
        callRegistry.markCallerExited(callId);                          // D-02
        profileRegistry.applyRepDelta(call.caller, repDelta);           // D-05 SOCIAL-26

        if (userReceives > 0) {
            IERC20(usdc).safeTransfer(msg.sender, userReceives);
        }
        // 10% of slash → treasury (subtraction already applied in _computeCallerExitAmounts)
        uint256 toTreasury = slash - (slash * 50) / 100 - (slash * 40) / 100;
        IERC20(usdc).safeTransfer(treasury, toTreasury);

        uint64 timeElapsed = uint64(block.timestamp) - call.createdAt;
        emit CallerExited(callId, call.caller, timeElapsed, slash, userReceives, repDelta);
    }

    /// @dev Compute caller exit amounts (separate function to reduce stack depth).
    function _computeCallerExitAmounts(
        uint256 callId,
        ICallRegistry.Call memory call
    ) internal view returns (
        uint256 callerShares,
        uint256 callerValue,
        uint256 slash,
        uint256 userReceives
    ) {
        callerShares = followShares[callId][call.caller];
        uint256 totalShrs = followTotalShares[callId];
        uint256 fReserve  = followReserve[callId];

        callerValue = totalShrs > 0
            ? Math.mulDiv(callerShares, fReserve, totalShrs)
            : 0;

        uint256 penaltyPct = _callerExitPenaltyPct(callId, call);
        slash        = (callerValue * penaltyPct) / 100;
        userReceives = callerValue - slash;
    }

    /// @dev Apply all state effects for callerExit (separate function to reduce stack depth).
    function _applyCallerExitEffects(
        uint256 callId,
        address caller,
        uint256 callerShares,
        uint256 callerValue,
        uint256 slash
    ) internal {
        // Burn caller's follow shares + deduct from reserve
        followShares[callId][caller] = 0;
        followTotalShares[callId] -= callerShares;
        followReserve[callId]     -= callerValue;
        followPosition[callId][caller] = 0;

        // Inject 50% of slash → follow pool, 40% → fade pool (SOCIAL-11: NO new shares)
        uint256 toFollow = (slash * 50) / 100;
        uint256 toFade   = (slash * 40) / 100;
        followReserve[callId] += toFollow;
        fadeReserve[callId]   += toFade;

        // Record exit timestamp (SOCIAL-21, SOCIAL-27)
        callerExitedAt[callId] = uint64(block.timestamp);
    }

    // ─── Settlement Manager modifier ──────────────────────────────────────────

    modifier onlySettlementManager() {
        require(msg.sender == settlementManager, "not-settlement-manager");
        _;
    }

    // ─── Settlement Manager setter ─────────────────────────────────────────────

    /// @notice Set the SettlementManager address. onlyOwner. Phase 4.
    function setSettlementManager(address newManager) external onlyOwner {
        require(newManager != address(0), "invalid-manager");
        settlementManager = newManager;
    }

    // ─── Phase 4: getFadeRealReserve ───────────────────────────────────────────

    /// @inheritdoc IFollowFadeMarket
    function getFadeRealReserve(uint256 callId) external view returns (uint256) {
        uint256 fadeAmt = fadeReserve[callId];
        uint256 seed    = fadeSeedVirtual[callId];
        return fadeAmt > seed ? fadeAmt - seed : 0;
    }

    // ─── Phase 4: applySettlement ──────────────────────────────────────────────

    /// @inheritdoc IFollowFadeMarket
    /// @dev Phase 4: Called by SettlementManager in settle() step 11.
    ///      CEI: settlementApplied[callId] = true BEFORE all USDC transfers.
    ///      CALL-41: if fadeRealReserve == 0, entire followReserve -> treasury.
    function applySettlement(
        uint256 callId,
        uint8   outcome,
        uint256 protocolFeeAmt,
        uint256 creatorFeeAmt,
        uint256 lpFeeAmt
    ) external onlySettlementManager nonReentrant {
        // ── Gates ──
        if (settlementApplied[callId]) revert SettlementAlreadyApplied();

        uint256 fadeReal = fadeReserve[callId] > fadeSeedVirtual[callId]
            ? fadeReserve[callId] - fadeSeedVirtual[callId]
            : 0;
        uint256 totalPool = followReserve[callId] + fadeReal;

        // ── EFFECTS: state writes BEFORE transfers (CEI) ──
        settlementApplied[callId] = true;

        if (fadeReal == 0) {
            // CALL-41: empty fade pool (cold-start) -- route entire followReserve to treasury.
            // Virtual seed never held real USDC; protocol claims the follow pool.
            uint256 followAmt = followReserve[callId];
            followReserve[callId] = 0;
            fadeReserve[callId] = 0;    // dissolve virtual seed entirely
            fadeSeedVirtual[callId] = 0;

            // ── INTERACTIONS ──
            if (followAmt > 0) {
                IERC20(usdc).safeTransfer(treasury, followAmt);
            }
        } else {
            // Normal path: extract protocol + creator fees; LP fee into winning reserve.
            // Virtual seed dissolves: fadeSeedVirtual = 0 (accounting-only; no transfer).
            fadeSeedVirtual[callId] = 0;

            // Route LP fee into the winning reserve (outcome: 1=CallerWon, 2=CallerLost).
            if (outcome == uint8(1)) { // CallerWon
                followReserve[callId] += lpFeeAmt;
            } else { // CallerLost
                fadeReserve[callId] += lpFeeAmt;
            }

            // ── INTERACTIONS ──
            uint256 totalFees = protocolFeeAmt + creatorFeeAmt;
            if (totalFees > 0) {
                IERC20(usdc).safeTransfer(treasury, totalFees);
            }
        }

        emit SettlementApplied(callId, outcome, totalPool);
    }

    // ─── Claim payout (Phase 4 -- real pull-pattern implementation) ───────────

    /// @inheritdoc IFollowFadeMarket
    /// @dev Pause carve-out: NOT guarded by whenNotPaused (§10.3).
    ///      Pull-pattern: winners call after settlement. CEI enforced. SOCIAL-46.
    function claimPayout(uint256 callId) external nonReentrant {
        // ── Gates ──
        ICallRegistry.Call memory call = callRegistry.getCall(callId);

        // Must be Settled or Disputed (Pitfall 18: claims allowed during dispute window)
        require(
            call.status == ICallRegistry.CallStatus.Settled ||
            call.status == ICallRegistry.CallStatus.Disputed,
            "call-not-settled"
        );

        // Idempotency guard (AlreadyClaimed error per test expectation)
        if (claimed[callId][msg.sender]) revert AlreadyClaimed();

        // Determine winner side (outcome 1=CallerWon, 2=CallerLost)
        bool callerWon = (call.outcome == ICallRegistry.Outcome.CallerWon);

        uint256 userShares;
        uint256 totalShares;
        uint256 winningReserve;

        if (callerWon) {
            userShares     = followShares[callId][msg.sender];
            totalShares    = followTotalShares[callId];
            winningReserve = followReserve[callId];
        } else {
            userShares     = fadeShares[callId][msg.sender];
            totalShares    = fadeTotalShares[callId];
            // Post-settlement: fadeSeedVirtual is 0; fadeReserve is real.
            // But use the same safe subtraction in case applySettlement hasn't run yet
            uint256 fadeReal = fadeReserve[callId] > fadeSeedVirtual[callId]
                ? fadeReserve[callId] - fadeSeedVirtual[callId]
                : fadeReserve[callId];
            winningReserve = fadeReal;
        }

        if (userShares == 0) revert NoPayoutAvailable();
        if (totalShares == 0) revert NoPayoutAvailable();
        if (winningReserve == 0) revert NoPayoutAvailable(); // CALL-41: pool was empty (cold-start)

        // ── EFFECTS: claimed BEFORE transfer (CEI, SOCIAL-47) ──
        claimed[callId][msg.sender] = true;

        // ── Compute pro-rata payout ──
        uint256 payout = Math.mulDiv(userShares, winningReserve, totalShares);
        if (payout == 0) revert NoPayoutAvailable(); // Dust: rounding produced 0

        // ── INTERACTIONS ──
        IERC20(usdc).safeTransfer(msg.sender, payout);

        emit PayoutClaimed(callId, msg.sender, payout);
    }

    // ─── View functions ────────────────────────────────────────────────────────

    /// @inheritdoc IFollowFadeMarket
    /// @dev Uses USDC.balanceOf(address(this)) — never a counter to avoid drift.
    ///      Virtual fade seed is never transferred so it is not counted.
    function getTvl() public view returns (uint256) {
        return IERC20(usdc).balanceOf(address(this));
    }

    /// @notice Compute the current caller exit penalty percentage for a call.
    ///         Public so tests and frontend can preview the penalty before calling callerExit.
    ///         Research Pattern 5: 15 + 35 * remaining / totalDuration.
    function computeCallerExitPenaltyPct(uint256 callId) external view returns (uint256) {
        ICallRegistry.Call memory call = callRegistry.getCall(callId);
        return _callerExitPenaltyPct(callId, call);
    }

    // ─── Internal math helpers ─────────────────────────────────────────────────

    /// @dev Compute caller exit penalty % (SOCIAL-18, Research Pattern 5).
    ///      penalty = 15% + 35% * (remaining / totalDuration), floor 15%.
    function _callerExitPenaltyPct(
        uint256 /*callId*/,
        ICallRegistry.Call memory call
    ) internal view returns (uint256 penaltyPct) {
        if (block.timestamp >= uint256(call.expiry)) {
            return CALLER_EXIT_BASE_PCT; // floor: call already expired
        }
        uint256 totalDuration = uint256(call.expiry) - uint256(call.createdAt);
        uint256 remaining     = uint256(call.expiry) - block.timestamp;
        // Multiply first to preserve precision
        uint256 variable = (CALLER_EXIT_VARIABLE_PCT * remaining) / totalDuration;
        penaltyPct = CALLER_EXIT_BASE_PCT + variable;
        // penaltyPct is in [15, 50] — no further clamp needed
    }

    /// @dev Compute rep delta for caller exit (SOCIAL-26, Research Pattern 6).
    ///      delta = -(45 - 35 * elapsed / duration), floor -10.
    ///      At elapsed=0 (24h in): delta = -45.
    ///      At elapsed=duration (expiry): delta = -10.
    function _callerExitRepDelta(
        uint256 /*callId*/,
        ICallRegistry.Call memory call
    ) internal view returns (int256 delta) {
        uint256 elapsed  = block.timestamp - uint256(call.createdAt);
        uint256 duration = uint256(call.expiry) - uint256(call.createdAt);

        // absDelta = 45 - 35 * elapsed / duration  (range [10, 45])
        // To preserve precision: (45 * duration - 35 * elapsed) / duration
        uint256 absDelta;
        if (elapsed >= duration) {
            absDelta = 10; // floor at -10
        } else {
            uint256 numerator = 45 * duration - 35 * elapsed;
            absDelta = numerator / duration;
            if (absDelta < 10) absDelta = 10; // floor at 10 (handles rounding)
        }
        delta = -int256(absDelta);
    }

    // ─── Owner-only admin functions ────────────────────────────────────────────

    /// @notice Update the treasury address.
    ///         MUST NOT be address(this) (TVL accounting invariant).
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0) && _treasury != address(this), "invalid-treasury");
        treasury = _treasury;
    }

    /// @notice Pause follow, fade, callerExit, initPool. Carve-outs remain active. SAFETY-04.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause.
    function unpause() external onlyOwner {
        _unpause();
    }
}
