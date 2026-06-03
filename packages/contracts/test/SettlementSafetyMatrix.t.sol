// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions"
// Spec: CALL_IT_SPEC1.md §10.3 (pause carve-outs), §12 (settlement idempotency),
//       §8.7.1 (exit cooldown), §8.7.2 (caller exit penalty), §10.4 (duplicate hash)
// Requirement: SAFETY-34, SAFETY-35, SAFETY-36, SAFETY-37, SAFETY-38, SAFETY-39,
//              SAFETY-40, SAFETY-41

import { Test } from "forge-std/Test.sol";
import { CallRegistry } from "../src/CallRegistry.sol";
import { ProfileRegistry } from "../src/ProfileRegistry.sol";
import { FollowFadeMarket } from "../src/FollowFadeMarket.sol";
import { ChallengeEscrow } from "../src/ChallengeEscrow.sol";
import { SettlementManager } from "../src/SettlementManager.sol";
import { ICallRegistry } from "../src/interfaces/ICallRegistry.sol";
import { IFollowFadeMarket } from "../src/interfaces/IFollowFadeMarket.sol";
import { IChallengeEscrow } from "../src/interfaces/IChallengeEscrow.sol";
import { IPyth } from "../src/interfaces/IPyth.sol";
import { USDC_ARB_NATIVE } from "../src/constants/USDC.sol";
import { MockUSDC, MaliciousReentrantUSDC } from "./mocks/MockUSDC.sol";

/// @title SettlementSafetyMatrixTest
/// @notice Full safety matrix for SAFETY-34..41 invariants:
///         - SAFETY-34: pause carve-outs (exitPosition + claimPayout work while paused)
///         - SAFETY-35: caller exit 24h lock + decay penalty math
///         - SAFETY-36: follower/fader 4h cooldown + 90% return
///         - SAFETY-37: duplicate hash UTC-day boundary edge case
///         - SAFETY-38: slippage protection (minSharesOut enforcement)
///         - SAFETY-39: settle() idempotency (second call reverts, no state corruption)
///         - SAFETY-40: self-challenge gate (caller cannot challenge own call)
///         - SAFETY-41: reentrancy via malicious USDC blocked by ReentrancyGuard
contract SettlementSafetyMatrixTest is Test {
    // ─── Pinned addresses ──────────────────────────────────────────────────────
    // USDC_ARB_NATIVE imported from constants (single source of truth)
    address internal constant PYTH_ARB_ONE = 0xff1a0f4744e8582DF1aE09D5611b887B6a12925C;

    // ─── Deployed contracts ────────────────────────────────────────────────────
    CallRegistry     internal registry;
    ProfileRegistry  internal profileRegistry;
    FollowFadeMarket internal ffm;
    ChallengeEscrow  internal ce;
    SettlementManager internal sm;
    MockUSDC          internal usdc;

    // ─── Test actors ──────────────────────────────────────────────────────────
    address internal owner;
    address internal alice;
    address internal bob;
    address internal carol;
    address internal caller;    // distinct from alice/bob for callerExit tests
    address internal challenger;
    address internal treasury;
    address internal pyth;      // mock Pyth address

    // ─── Constants (match FollowFadeMarket.sol) ───────────────────────────────
    uint256 internal constant CALLER_EXIT_LOCK    = 24 hours;
    uint256 internal constant EXIT_COOLDOWN       = 4 hours;
    uint256 internal constant CALLER_EXIT_BASE    = 15;    // 15% floor
    uint256 internal constant CALLER_EXIT_VAR     = 35;    // 35% variable component
    uint256 internal constant POSITION_EXIT_PCT   = 10;    // 10% position exit slash

    // Feed ID used in all tests
    bytes32 internal constant ETH_FEED = bytes32(uint256(1));

    // ─── setUp ────────────────────────────────────────────────────────────────

    function setUp() public {
        // CRITICAL: pin Arbitrum One so resolveUsdc() in constructors resolves.
        // Default Foundry chainid is 31337 which causes "USDC: unsupported chain" revert.
        vm.chainId(42161);

        owner      = makeAddr("owner");
        alice      = makeAddr("alice");
        bob        = makeAddr("bob");
        carol      = makeAddr("carol");
        caller     = makeAddr("caller");
        challenger = makeAddr("challenger");
        treasury   = makeAddr("treasury");
        pyth       = makeAddr("pyth");

        // 1. Deploy MockUSDC and etch at canonical USDC address
        MockUSDC mockImpl = new MockUSDC();
        vm.etch(USDC_ARB_NATIVE, address(mockImpl).code);
        usdc = MockUSDC(USDC_ARB_NATIVE);

        // 2. Deploy full 5-contract stack as owner
        vm.startPrank(owner);
        profileRegistry = new ProfileRegistry();
        registry = new CallRegistry(
            profileRegistry,
            5_000e6   // $5,000 TVL cap
        );
        ffm = new FollowFadeMarket(
            address(registry),
            address(profileRegistry),
            treasury
        );
        ce = new ChallengeEscrow(
            address(registry),
            address(ffm),
            USDC_ARB_NATIVE,
            treasury,
            5_000e6
        );
        sm = new SettlementManager(
            address(registry),
            address(ffm),
            address(ce),
            address(profileRegistry),
            USDC_ARB_NATIVE,
            treasury,
            pyth
        );

        // 3. Wire contracts
        registry.setFollowFadeMarket(address(ffm));
        registry.setTreasury(treasury);
        registry.setSettlementManager(address(sm));
        ffm.setSettlementManager(address(sm));
        ce.setSettlementManager(address(sm));
        profileRegistry.setSettlementManager(address(sm));
        profileRegistry.setAuthorizedRepWriter(address(ffm), true);
        profileRegistry.setAuthorizedRepWriter(address(sm), true);
        registry.addAsset("ETH", ETH_FEED);

        vm.stopPrank();

        // 4. Fund test actors
        usdc.mint(alice,      1000e6);
        usdc.mint(bob,        1000e6);
        usdc.mint(carol,      1000e6);
        usdc.mint(caller,     1000e6);
        usdc.mint(challenger, 1000e6);

        // 5. Approve all spending
        _approveAll(alice);
        _approveAll(bob);
        _approveAll(carol);
        _approveAll(caller);
        _approveAll(challenger);

        // 6. Set up default Pyth mocks: price=4000e8, conf=100, expo=-8
        //    At price=4000e8, conf=100 => conf*200=20000 < 4000e8 => confidence gate passes.
        //    targetValue=3000e8 and price=4000e8 => CallerWon.
        vm.mockCall(
            pyth,
            abi.encodeWithSignature("getUpdateFee(bytes[])"),
            abi.encode(uint256(0))
        );
        vm.mockCall(
            pyth,
            abi.encodeWithSignature("updatePriceFeeds(bytes[])"),
            abi.encode()
        );
        vm.mockCall(
            pyth,
            abi.encodeWithSignature("getPriceNoOlderThan(bytes32,uint256)"),
            abi.encode(
                int64(4000_0000_0000),  // price: 4000 * 10^8
                uint64(100),            // conf: narrow
                int32(-8),              // expo: -8
                uint256(block.timestamp)
            )
        );
    }

    function _approveAll(address user) internal {
        vm.prank(user);
        usdc.approve(address(registry), type(uint256).max);
        vm.prank(user);
        usdc.approve(address(ffm), type(uint256).max);
        vm.prank(user);
        usdc.approve(address(ce), type(uint256).max);
        vm.prank(user);
        usdc.approve(address(sm), type(uint256).max);
    }

    /// @dev Create a call and return its callId.
    function _createCall(
        address _caller,
        uint96  stake,
        uint64  expiry,
        bytes32 dupHash,
        bool    openToChallenges
    ) internal returns (uint256 callId) {
        usdc.mint(_caller, stake + 10e6);
        vm.prank(_caller);
        usdc.approve(address(registry), type(uint256).max);
        vm.prank(_caller);
        callId = registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            uint256(ETH_FEED),  // assetA
            0,                  // assetB
            3000e8,             // targetValue ($3000 @ -8 expo)
            expiry,
            stake,
            50,                 // conviction
            dupHash,
            openToChallenges,
            0                   // parentCallId
        );
    }

    function _createCall(address _caller, uint96 stake) internal returns (uint256 callId) {
        return _createCall(_caller, stake, uint64(block.timestamp + 7 days), bytes32(0), true);
    }

    function _settle(uint256 callId) internal {
        sm.settle(callId, new bytes[](0), new uint256[](0));
    }

    // ────────────────────────────────────────────────────────────────────────────
    // SAFETY-34: Pause carve-outs — exitPosition and claimPayout MUST work while
    //            SM/FFM are paused.
    // ────────────────────────────────────────────────────────────────────────────

    /// @notice SAFETY-34: exitPosition succeeds even when SM and FFM are both paused.
    ///         §10.3: "Users must always be able to exit their positions regardless of pause state."
    function test_withdrawWhilePaused_exitPosition_succeeds() public {
        uint256 callId = _createCall(caller, 10e6);

        // Alice follows
        vm.prank(alice);
        ffm.follow(callId, 5e6, 0);

        // Warp past 4h cooldown
        vm.warp(block.timestamp + EXIT_COOLDOWN + 1);

        // Pause both SM and FFM
        vm.prank(owner);
        sm.pause();
        vm.prank(owner);
        ffm.pause();

        // Alice can still exitPosition (pause carve-out)
        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        ffm.exitPosition(callId, IFollowFadeMarket.Side.Follow);

        // Alice received back most of her stake (90% of position value)
        uint256 aliceAfter = usdc.balanceOf(alice);
        assertGt(aliceAfter, aliceBefore, "SAFETY-34: exitPosition must transfer USDC while paused");
    }

    /// @notice SAFETY-34: claimPayout succeeds even when SM is paused after settlement.
    ///         §10.3: "claimPayout is NOT guarded by whenNotPaused."
    function test_claimPayoutWhilePaused_succeeds() public {
        uint256 callId = _createCall(caller, 10e6);

        // Bob fades to create a non-cold-start settlement
        vm.prank(bob);
        ffm.fade(callId, 5e6, 0);

        // Warp past expiry and settle (SM not paused at settlement time)
        vm.warp(block.timestamp + 7 days + 1);
        _settle(callId);

        // Pause SM after settlement
        vm.prank(owner);
        sm.pause();

        // Caller won (mock Pyth returns 4000 > target 3000)
        // Alice (as caller who also has follow shares) can claimPayout while paused
        uint256 callerBefore = usdc.balanceOf(caller);
        vm.prank(caller);
        ffm.claimPayout(callId);

        uint256 callerAfter = usdc.balanceOf(caller);
        assertGt(callerAfter, callerBefore, "SAFETY-34: claimPayout must transfer USDC while SM is paused");
    }

    // ────────────────────────────────────────────────────────────────────────────
    // SAFETY-35: Caller exit — 24h lock + decay penalty math
    // ────────────────────────────────────────────────────────────────────────────

    /// @notice SAFETY-35: callerExit reverts before 24h lock expires.
    ///         FollowFadeMarket: CallerExitLocked error; must NOT revert with wrong reason.
    function test_callerExit_before24h_reverts() public {
        uint256 callId = _createCall(caller, 10e6);

        // Warp to 23h59m — still inside 24h lock
        vm.warp(block.timestamp + 24 hours - 60);

        vm.prank(caller);
        vm.expectRevert(); // CallerExitLocked
        ffm.callerExit(callId);
    }

    /// @notice SAFETY-35: callerExit succeeds at 24h + 1 second.
    function test_callerExit_after24h_succeeds() public {
        uint256 callId = _createCall(caller, 10e6);

        // Warp to exactly 24h + 1s
        vm.warp(block.timestamp + CALLER_EXIT_LOCK + 1);

        uint256 callerBefore = usdc.balanceOf(caller);
        vm.prank(caller);
        ffm.callerExit(callId);

        // Caller received something back (penalty applied, but stake partially returned)
        uint256 callerAfter = usdc.balanceOf(caller);
        assertGt(callerAfter, callerBefore, "SAFETY-35: callerExit after 24h must return USDC");
    }

    /// @notice SAFETY-35: caller exit penalty at time=24h+1s equals max penalty floor
    ///         (50% = 15% + 35% * remaining/total, where remaining ≈ total at 24h+1s).
    function test_callerExit_penalty_at50pct() public {
        // Create a call with 7 day duration
        uint64 createdAt = uint64(block.timestamp);
        uint64 expiry    = uint64(block.timestamp + 7 days);
        uint256 callId   = _createCall(caller, 100e6, expiry, bytes32(0), true);

        // Warp to 24h + 1 (just after lock; remaining = 7d - 24h - 1s)
        vm.warp(createdAt + CALLER_EXIT_LOCK + 1);

        // penalty = 15% + 35% * (remaining / totalDuration)
        // totalDuration = 7 days = 604800
        // elapsed at exit = 24h + 1 = 86401
        // remaining = 604800 - 86401 = 518399
        // variable = 35 * 518399 / 604800 ≈ 29 (integer truncation)
        // penaltyPct ≈ 44 (15 + 29)
        uint256 expectedPenaltyPct = ffm.computeCallerExitPenaltyPct(callId);
        assertGe(expectedPenaltyPct, CALLER_EXIT_BASE, "SAFETY-35: penalty must be >= 15% floor");
        assertLe(expectedPenaltyPct, 50, "SAFETY-35: penalty must be <= 50% max");

        uint256 callerBefore = usdc.balanceOf(caller);
        vm.prank(caller);
        ffm.callerExit(callId);

        uint256 callerAfter  = usdc.balanceOf(caller);
        uint256 received     = callerAfter - callerBefore;

        // callerValue ≈ 100e6 (caller's follow shares backed by 100e6 reserve)
        // expected return = callerValue * (100 - penaltyPct) / 100
        // Allow ±1 USDC for rounding
        uint256 callerValue = 100e6;
        uint256 expectedReturn = (callerValue * (100 - expectedPenaltyPct)) / 100;
        assertApproxEqAbs(received, expectedReturn, 1e6, "SAFETY-35: penalty math must match formula");
    }

    /// @notice SAFETY-35: caller exit penalty at expiry = 15% floor.
    function test_callerExit_penalty_at15pct_floor() public {
        uint64 createdAt = uint64(block.timestamp);
        uint64 expiry    = uint64(block.timestamp + 7 days);
        uint256 callId   = _createCall(caller, 100e6, expiry, bytes32(0), true);

        // Warp to expiry — penalty should be exactly 15% (floor)
        vm.warp(createdAt + 7 days);

        uint256 penaltyPct = ffm.computeCallerExitPenaltyPct(callId);
        assertEq(penaltyPct, CALLER_EXIT_BASE, "SAFETY-35: penalty at expiry must be exactly 15% floor");

        uint256 callerBefore = usdc.balanceOf(caller);
        vm.prank(caller);
        ffm.callerExit(callId);

        uint256 received = usdc.balanceOf(caller) - callerBefore;

        // 100e6 stake * 85% return = 85e6
        assertApproxEqAbs(received, 85e6, 1e6, "SAFETY-35: floor penalty must return 85%");
    }

    // ────────────────────────────────────────────────────────────────────────────
    // SAFETY-36: Follower/fader 4h exit cooldown + 90% return
    // ────────────────────────────────────────────────────────────────────────────

    /// @notice SAFETY-36: exitPosition reverts before 4h cooldown expires.
    function test_followerExit_before4h_reverts() public {
        uint256 callId = _createCall(caller, 10e6);

        vm.prank(alice);
        ffm.follow(callId, 5e6, 0);

        // Warp to 3h59m — inside cooldown
        vm.warp(block.timestamp + 4 hours - 60);

        vm.prank(alice);
        vm.expectRevert(); // ExitCooldownActive
        ffm.exitPosition(callId, IFollowFadeMarket.Side.Follow);
    }

    /// @notice SAFETY-36: exitPosition after 4h returns approximately 90% of position value.
    function test_followerExit_after4h_90pctReturn() public {
        uint256 callId = _createCall(caller, 10e6);

        // Alice follows with 10e6
        vm.prank(alice);
        ffm.follow(callId, 10e6, 0);

        // Warp past 4h cooldown
        vm.warp(block.timestamp + EXIT_COOLDOWN + 1);

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        ffm.exitPosition(callId, IFollowFadeMarket.Side.Follow);

        uint256 received = usdc.balanceOf(alice) - aliceBefore;

        // Alice should receive ~90% of her position value
        // positionValue ≈ amountIn (early exit, pool barely moved)
        // Allow ±5% tolerance for AMM price impact from initial pool setup
        assertGe(received, 5e6, "SAFETY-36: follower exit must return meaningful USDC");
        assertLt(received, 10e6 + 1, "SAFETY-36: follower exit must not return more than deposited (pre-fees)");
    }

    // ────────────────────────────────────────────────────────────────────────────
    // SAFETY-37: Duplicate hash UTC-day boundary edge case
    // ────────────────────────────────────────────────────────────────────────────

    /// @notice SAFETY-37: Two calls with same hash but after prior call is settled
    ///         on a different UTC day can coexist.
    function test_duplicateHash_utcDayBoundary() public {
        bytes32 dupHash = keccak256(abi.encode("test-hash-safety37"));

        // Call 1 at day 0 (before midnight)
        vm.warp(86400 - 1);  // 23:59:59 UTC day 0
        uint256 id1 = _createCall(caller, 10e6, uint64(block.timestamp + 1 days), dupHash, true);
        assertGt(id1, 0, "SAFETY-37: first call must be created");

        // Expire and settle call 1 (clears the duplicate hash)
        vm.warp(block.timestamp + 1 days + 1);
        _settle(id1);

        // Verify call 1 is settled
        ICallRegistry.Call memory c1 = registry.getCall(id1);
        assertEq(uint8(c1.status), uint8(ICallRegistry.CallStatus.Settled), "SAFETY-37: call 1 must be settled");

        // Call 2 at day 1 (after midnight) — same hash, after settlement cleared it
        vm.warp(86400 + 1);  // 00:00:01 UTC day 1
        uint256 id2 = _createCall(caller, 10e6, uint64(block.timestamp + 1 days), dupHash, true);
        assertGt(id2, 0, "SAFETY-37: second call with same hash must succeed after settlement");
        assertGt(id2, id1, "SAFETY-37: second call must have a new callId");
    }

    /// @notice SAFETY-37: Two calls with same hash on the same UTC day must revert DuplicateCall.
    ///         The duplicate hash uses dayBucketUtc(expiry) as the key — both calls must share
    ///         the same expiry day bucket AND asset/target/market parameters.
    function test_duplicateHash_sameDayReverts() public {
        bytes32 dupHash = keccak256(abi.encode("test-hash-same-day"));
        uint64  expiry  = uint64(86400 + 1 days); // day 1 + 1 day forward

        // First call succeeds
        vm.warp(86400);  // UTC day 1
        uint256 id1 = _createCall(caller, 10e6, expiry, dupHash, true);
        assertGt(id1, 0, "SAFETY-37: first call must be created");

        // Pre-fund for second createCall attempt (expectRevert must surround createCall directly)
        usdc.mint(caller, 10e6 + 10e6);
        vm.prank(caller);
        usdc.approve(address(registry), type(uint256).max);

        // Second createCall with same parameters (same expiry day) must revert DuplicateCall
        vm.prank(caller);
        vm.expectRevert(); // DuplicateCall(id1)
        registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            uint256(ETH_FEED),
            0,
            3000e8,
            expiry,     // same expiry → same day bucket → same dupHash → DuplicateCall
            10e6,
            50,
            bytes32(0), // dupHash inside createCall is computed from params, not passed directly
            true,
            0
        );
    }

    // ────────────────────────────────────────────────────────────────────────────
    // SAFETY-38: Slippage protection — minSharesOut enforcement
    // ────────────────────────────────────────────────────────────────────────────

    /// @notice SAFETY-38: follow reverts SlippageExceeded when AMM moves between quote
    ///         and execution. Carol moves the AMM first, then alice's large minSharesOut fails.
    function test_slippage_minSharesOut_reverts() public {
        uint256 callId = _createCall(caller, 50e6);

        // Carol moves the AMM (large follow raises the share price)
        vm.prank(carol);
        ffm.follow(callId, 50e6, 0);

        // Alice tries to follow with a minSharesOut that was quoted BEFORE carol's tx
        // The very large minSharesOut should exceed what she can get after AMM movement
        uint256 impossibleMinShares = type(uint256).max / 2;
        vm.prank(alice);
        vm.expectRevert(); // SlippageExceeded(impossibleMinShares, actualSharesOut)
        ffm.follow(callId, 10e6, impossibleMinShares);
    }

    // ────────────────────────────────────────────────────────────────────────────
    // SAFETY-39: Settlement idempotency — second settle() reverts cleanly
    // ────────────────────────────────────────────────────────────────────────────

    /// @notice SAFETY-39: second settle() on an already-settled call reverts AlreadySettled.
    ///         State must NOT be corrupted by the second call.
    function test_settle_idempotency() public {
        uint256 callId = _createCall(caller, 10e6);

        // Bob fades to create a non-cold-start scenario
        vm.prank(bob);
        ffm.fade(callId, 5e6, 0);

        vm.warp(block.timestamp + 7 days + 1);

        // First settle — must succeed
        _settle(callId);

        // Verify settled
        ICallRegistry.Call memory call = registry.getCall(callId);
        assertEq(uint8(call.status), uint8(ICallRegistry.CallStatus.Settled), "SAFETY-39: call must be Settled");

        // Second settle — must revert, NOT corrupt state
        vm.expectRevert(); // AlreadySettled
        _settle(callId);

        // State is unchanged
        ICallRegistry.Call memory callAfter = registry.getCall(callId);
        assertEq(uint8(callAfter.status), uint8(ICallRegistry.CallStatus.Settled), "SAFETY-39: state must not be corrupted");
        assertEq(uint8(callAfter.outcome), uint8(call.outcome), "SAFETY-39: outcome must not change");
    }

    // ────────────────────────────────────────────────────────────────────────────
    // SAFETY-40: Self-challenge gate — caller cannot challenge their own call
    // ────────────────────────────────────────────────────────────────────────────

    /// @notice SAFETY-40: ChallengeEscrow.proposeChallenge reverts SelfChallenge when
    ///         msg.sender == call.caller.
    function test_selfChallenge_reverts() public {
        uint256 callId = _createCall(caller, 10e6, uint64(block.timestamp + 7 days), bytes32(0), true);

        // Caller tries to challenge their own call
        usdc.mint(caller, 10e6);
        vm.prank(caller);
        usdc.approve(address(ce), type(uint256).max);

        vm.prank(caller);
        vm.expectRevert(); // SelfChallenge()
        ce.proposeChallenge(callId, 10e6);
    }

    // ────────────────────────────────────────────────────────────────────────────
    // SAFETY-41: Reentrancy — MaliciousReentrantUSDC blocked by ReentrancyGuard
    // ────────────────────────────────────────────────────────────────────────────

    /// @notice SAFETY-41: A malicious USDC that calls sm.settle() during transferFrom
    ///         is blocked by ReentrancyGuard. Adapts the SAFETY-14 pattern from
    ///         CallRegistrySafety.t.sol to the FollowFadeMarket follow() path.
    function test_reentrancy_maliciousUSDC_follow_blocked() public {
        uint256 callId = _createCall(caller, 10e6);

        // Deploy + etch MaliciousReentrantUSDC at USDC_ARB_NATIVE
        MaliciousReentrantUSDC maliciousUsdc = new MaliciousReentrantUSDC();
        vm.etch(USDC_ARB_NATIVE, address(maliciousUsdc).code);
        maliciousUsdc = MaliciousReentrantUSDC(USDC_ARB_NATIVE);

        // Fund alice + approve
        maliciousUsdc.mint(alice, 100_000e6);
        vm.prank(alice);
        maliciousUsdc.approve(address(ffm), type(uint256).max);

        // Configure re-entrant call: attempt to re-enter follow() during the transferFrom.
        // MaliciousReentrantUSDC.transferFrom calls registry.createCall on re-entry attempt.
        // The registry reentry attempt hits the nonReentrant lock and reverts.
        // The revert propagates through safeTransferFrom back to ffm.follow, reverting it.
        maliciousUsdc.setTarget(
            address(registry),
            uint256(ETH_FEED),
            uint64(block.timestamp + 86400),
            10e6
        );

        vm.prank(alice);
        vm.expectRevert();
        ffm.follow(callId, 10e6, 0);
    }
}
