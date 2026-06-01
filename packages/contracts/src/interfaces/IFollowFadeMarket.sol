// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions"
// Spec: CALL_IT_SPEC1.md §11.2, §12.2 — FollowFadeMarket architecture + function signatures
// Requirement: SOCIAL-01..28, SOCIAL-09

/// @title IFollowFadeMarket
/// @notice Public interface for the FollowFadeMarket AMM contract.
///         Declares the Side enum, events, errors, and function signatures.
///         Consumed by the frontend wagmi hooks, the relayer, and test helpers.
interface IFollowFadeMarket {
    // ─── Enums ────────────────────────────────────────────────────────────────

    /// @notice Which side of the market a position belongs to. SOCIAL-01/02.
    enum Side { Follow, Fade }

    // ─── Events ───────────────────────────────────────────────────────────────

    /// @notice Emitted on every successful follow deposit. SOCIAL-01.
    event Followed(
        uint256 indexed callId,
        address indexed user,
        uint256 amountIn,
        uint256 sharesOut
    );

    /// @notice Emitted on every successful fade deposit. SOCIAL-02.
    event Faded(
        uint256 indexed callId,
        address indexed user,
        uint256 amountIn,
        uint256 sharesOut
    );

    /// @notice Emitted when a follower or fader exits their position. SOCIAL-12/13/14.
    event PositionExited(
        uint256 indexed callId,
        address indexed user,
        Side side,
        uint256 usdcReturned,
        uint256 slashAmount
    );

    /// @notice Emitted when a caller voluntarily exits before expiry. SOCIAL-17..22.
    event CallerExited(
        uint256 indexed callId,
        address indexed caller,
        uint64  timeElapsed,
        uint256 penaltyPaid,
        uint256 stakeReturned,
        int256  reputationDelta
    );

    /// @notice Emitted when CallRegistry initializes a per-call pool. D-01.
    event PoolInitialized(
        uint256 indexed callId,
        uint256 stakeAmount,
        uint256 virtualFadeSeed
    );

    /// @notice Emitted when SettlementManager applies settlement fees. SETTLE-46.
    event SettlementApplied(
        uint256 indexed callId,
        uint8           outcome,
        uint256         totalPool
    );

    /// @notice Emitted when a winner claims their payout. SOCIAL-46.
    event PayoutClaimed(
        uint256 indexed callId,
        address indexed recipient,
        uint256         amount
    );

    // ─── Custom errors ────────────────────────────────────────────────────────

    /// @notice Slippage protection: actual shares received < minSharesOut. SOCIAL-05.
    error SlippageExceeded(uint256 minOut, uint256 actualOut);

    /// @notice Follow/fade attempted after call.expiry. SOCIAL-07 (strict <).
    error CallPastExpiry();

    /// @notice exitPosition attempted within POSITION_EXIT_COOLDOWN (4h). SOCIAL-12.
    error ExitCooldownActive(uint64 unlocksAt);

    /// @notice callerExit attempted within CALLER_EXIT_LOCK_DURATION (24h). SOCIAL-17.
    error CallerExitLocked(uint64 unlocksAt);

    /// @notice Deposit would push combined TVL past the cap. SOCIAL-09 / D-03.
    error TvlCapReached(uint256 requested, uint256 available);

    /// @notice Position size < MIN_POSITION ($1 USDC). SOCIAL-03.
    error PositionBelowMinimum();

    /// @notice Cumulative position size > MAX_POSITION ($100 USDC). SOCIAL-04.
    error PositionAboveMaximum();

    /// @notice Caller of a guarded function is not authorized. D-02.
    error NotAuthorized();

    /// @notice exitPosition/callerExit called on a non-Live/non-CallerExited call. SOCIAL-16.
    error CallNotLive();

    /// @notice callerExit called by non-caller of the call. SOCIAL-17.
    error NotCallerOfCall();

    /// @notice claimPayout stub: full claim logic wired by Phase 4 SettlementManager.
    error ClaimRequiresSettlement();

    /// @notice applySettlement called again after settlement already applied.
    error SettlementAlreadyApplied();

    /// @notice claimPayout called with no winning shares for msg.sender.
    error NoPayoutAvailable();

    /// @notice claimPayout called by an address that already claimed. SOCIAL-47.
    error AlreadyClaimed();

    // ─── Core mutation functions ───────────────────────────────────────────────

    /// @notice Initialize a per-call pool. Called only by CallRegistry on createCall. D-01.
    /// @param callId       The call ID assigned by CallRegistry.
    /// @param stakeAmount  Caller's USDC stake (already transferred by CallRegistry).
    /// @param virtualFadeSeed  Virtual fade reserve seed (accounting-only; never transferred).
    function initPool(
        uint256 callId,
        uint256 stakeAmount,
        uint256 virtualFadeSeed
    ) external;

    /// @notice Deposit USDC into the follow pool and receive FOLLOW shares. SOCIAL-01.
    /// @param callId       The call to follow.
    /// @param amountIn     USDC amount to deposit (6 decimals).
    /// @param minSharesOut Minimum acceptable shares; reverts SlippageExceeded if not met.
    function follow(uint256 callId, uint256 amountIn, uint256 minSharesOut) external;

    /// @notice Deposit USDC into the fade pool and receive FADE shares. SOCIAL-02.
    /// @param callId       The call to fade.
    /// @param amountIn     USDC amount to deposit (6 decimals).
    /// @param minSharesOut Minimum acceptable shares; reverts SlippageExceeded if not met.
    function fade(uint256 callId, uint256 amountIn, uint256 minSharesOut) external;

    /// @notice Exit an existing follow or fade position. SOCIAL-12/13/14.
    ///         Pause carve-out (§10.3): works even when contract is paused.
    /// @param callId The call ID.
    /// @param side   Follow or Fade side to exit.
    function exitPosition(uint256 callId, Side side) external;

    /// @notice Caller voluntarily exits a call early, slashing their stake. SOCIAL-17..22.
    /// @param callId The call ID.
    function callerExit(uint256 callId) external;

    /// @notice Claim USDC payout after settlement. SOCIAL-46.
    ///         Phase 2 stub: always reverts ClaimRequiresSettlement.
    ///         Full implementation wired by Phase 4 SettlementManager.
    ///         Pause carve-out (§10.3): works even when contract is paused.
    function claimPayout(uint256 callId) external;

    /// @notice Set the SettlementManager address. onlyOwner. Phase 4.
    function setSettlementManager(address newManager) external;

    /// @notice Called by SettlementManager in settle() step 11 to extract fees and
    ///         finalize pool accounting. onlySettlementManager. Idempotent (reverts
    ///         SettlementAlreadyApplied on repeat). SETTLE-46/CALL-41.
    ///
    ///         Invariant: protocolFeeAmt + creatorFeeAmt transferred to treasury.
    ///         lpFeeAmt injected into winning reserve. fadeSeedVirtual dissolved to 0.
    ///         CALL-41: if fadeRealReserve==0 (cold-start), entire followReserve -> treasury.
    ///
    /// @param callId         The call being settled.
    /// @param outcome        ICallRegistry.Outcome (1=CallerWon, 2=CallerLost).
    /// @param protocolFeeAmt 1.0% of totalPool (pre-computed by SettlementManager).
    /// @param creatorFeeAmt  0.4% of pool or callerVolumeAtExit for exited callers.
    /// @param lpFeeAmt       0.3% of totalPool; routed to winning reserve.
    function applySettlement(
        uint256 callId,
        uint8   outcome,
        uint256 protocolFeeAmt,
        uint256 creatorFeeAmt,
        uint256 lpFeeAmt
    ) external;

    /// @notice Real fade USDC = fadeReserve - fadeSeedVirtual. CALL-41 / REP-14.
    ///         Returns 0 when no real faders (cold-start scenario).
    function getFadeRealReserve(uint256 callId) external view returns (uint256);

    // ─── View functions ───────────────────────────────────────────────────────

    /// @notice Total real USDC held across all per-call pools. D-03.
    ///         Uses USDC.balanceOf(address(this)) — never a counter.
    function getTvl() external view returns (uint256);

    /// @notice Snapshot of combined pool volume at caller exit time. SOCIAL-20.
    ///         Returns 0 if caller has not exited. Used by SettlementManager for Model B creator fee.
    function callerVolumeAtExit(uint256 callId) external view returns (uint256);

    /// @notice Current follow-side reserve (real USDC) for a call. SOCIAL-01.
    function followReserve(uint256 callId) external view returns (uint256);

    /// @notice Current fade-side reserve (real + virtual USDC) for a call. SOCIAL-02.
    function fadeReserve(uint256 callId) external view returns (uint256);

    /// @notice Total follow shares outstanding for a call. SOCIAL-01.
    function followTotalShares(uint256 callId) external view returns (uint256);

    /// @notice Total fade shares outstanding for a call. SOCIAL-02.
    function fadeTotalShares(uint256 callId) external view returns (uint256);

    /// @notice Follow shares held by a user for a call. SOCIAL-01.
    function followShares(uint256 callId, address user) external view returns (uint256);

    /// @notice Fade shares held by a user for a call. SOCIAL-02.
    function fadeShares(uint256 callId, address user) external view returns (uint256);
}
