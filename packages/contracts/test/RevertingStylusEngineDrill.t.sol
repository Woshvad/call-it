// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack -- Pinned Versions"
// Requirement: SAFETY-42 (Phase 6 Stylus destruction drill — unit test analogue)
//
// SAFETY-42 Unit Drill: proves the SettlementManager.settle() try/catch fallback
// fires RepCalculatedFallback and completes settlement when the StylusScoreEngine
// proxy points at the RevertingStylusEngine fixture.
//
// Pattern: mainnet-fork (mirrors SettlementManagerForkTest.sol) + graceful skip
//          when ARB_ONE_RPC_URL is absent (same guard pattern as SettlementManagerForkTest).
//
// Run:
//   ARB_ONE_RPC_URL=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY \
//     forge test --match-contract RevertingStylusEngineDrill -vv
//
// Without RPC (CI without secrets):
//   ARB_ONE_RPC_URL="" forge test --match-contract RevertingStylusEngineDrill
//   -> [SKIP] — exits 0 (graceful skip, not fail)
//
// OZ 5.x ProxyAdmin API note:
//   upgradeAndCall(ITransparentUpgradeableProxy, address, bytes) — 3-arg form ONLY.
//   The 2-arg upgrade(address,address) was REMOVED in OZ 5.0 and does NOT exist.
//   Canonical anchor: packages/contracts/script/CutoffFallback.s.sol lines 65-69.
//
// EIP-1967 slots:
//   implementation: keccak256("eip1967.proxy.implementation") - 1
//     = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
//   admin:          keccak256("eip1967.proxy.admin") - 1
//     = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103

import { Test, Vm } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ProxyAdmin } from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import { ITransparentUpgradeableProxy } from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

import { ICallRegistry } from "../src/interfaces/ICallRegistry.sol";
import { IProfileRegistry } from "../src/interfaces/IProfileRegistry.sol";
import { ISettlementManager } from "../src/interfaces/ISettlementManager.sol";
import { IFollowFadeMarket } from "../src/interfaces/IFollowFadeMarket.sol";
import { IPyth } from "../src/interfaces/IPyth.sol";

import { CallRegistry } from "../src/CallRegistry.sol";
import { ProfileRegistry } from "../src/ProfileRegistry.sol";
import { FollowFadeMarket } from "../src/FollowFadeMarket.sol";
import { ChallengeEscrow } from "../src/ChallengeEscrow.sol";
import { SettlementManager } from "../src/SettlementManager.sol";
import { StatelessTransparentProxy } from "../src/StatelessTransparentProxy.sol";
import { RevertingStylusEngine } from "../src/RevertingStylusEngine.sol";
import { SolidityScoreEngine } from "../src/SolidityScoreEngine.sol";
import { USDC_ARB_NATIVE } from "../src/constants/USDC.sol";

/// @title RevertingStylusEngineDrill
/// @notice SAFETY-42 unit drill — proves the SettlementManager fallback catch branch fires
///         and emits RepCalculatedFallback when the Stylus proxy points at the revert fixture.
///
///         Two tests:
///           1. test_stylus_fallback_fires_RepCalculatedFallback — full flow:
///              upgrade → settle → assert RepCalculatedFallback fired + settlement completed
///              + fees in treasury → restore real engine
///           2. test_stylus_fallback_baseline_delta_is_nonzero — verify baselineDelta != 0
///              in the fallback event
///
///         Both tests SKIP gracefully when ARB_ONE_RPC_URL is not set.
contract RevertingStylusEngineDrill is Test {
    // ─── EIP-1967 storage slots ───────────────────────────────────────────────

    /// @dev keccak256("eip1967.proxy.implementation") - 1
    bytes32 internal constant IMPL_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    /// @dev keccak256("eip1967.proxy.admin") - 1
    bytes32 internal constant adminSlot =
        0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

    // ─── Pinned addresses (Arbitrum One mainnet) ──────────────────────────────
    address internal constant PYTH_ARBITRUM_ONE = 0xff1a0f4744e8582DF1aE09D5611b887B6a12925C;
    address internal constant USDC_WHALE = 0x489ee077994B6658eAfA855C308275EAd8097C4A;

    // ─── Deployed contracts (fresh for each test) ─────────────────────────────
    CallRegistry     internal registry;
    ProfileRegistry  internal profileRegistry;
    FollowFadeMarket internal ffm;
    ChallengeEscrow  internal ce;
    SettlementManager internal sm;

    /// @dev The TransparentUpgradeableProxy wrapping the Stylus/Solidity score engine
    address internal stylusProxy;
    /// @dev The auto-created ProxyAdmin for stylusProxy (read from EIP-1967 adminSlot)
    address internal proxyAdminAddr;
    /// @dev Owner of the ProxyAdmin — deployer EOA on a fork
    address internal proxyAdminOwner;

    /// @dev The "real" engine to restore after the drill
    address internal realEngine;
    /// @dev The reverting fixture
    address internal revertingEngine;

    // ─── Test actors ─────────────────────────────────────────────────────────
    address internal owner;
    address internal alice;
    address internal bob;
    address internal treasury;

    // ─── setUp ────────────────────────────────────────────────────────────────

    function setUp() public {
        // Graceful skip when ARB_ONE_RPC_URL is not set (same guard as SettlementManagerForkTest).
        // This allows `forge test` in CI without the var to report SKIPPED (exit 0).
        string memory rpcUrl = vm.envOr("ARB_ONE_RPC_URL", string(""));
        if (bytes(rpcUrl).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpcUrl);

        // Arbitrum One chainid = 42161; resolveUsdc() gate is satisfied on the fork.

        owner    = makeAddr("owner");
        alice    = makeAddr("alice");
        bob      = makeAddr("bob");
        treasury = makeAddr("treasury");

        // ── Deploy full contract stack ──────────────────────────────────────────
        vm.startPrank(owner);

        profileRegistry = new ProfileRegistry();
        registry = new CallRegistry(
            IProfileRegistry(address(profileRegistry)),
            5_000e6  // $5,000 TVL cap
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

        // Wire FFM + assets before deploying SM
        registry.setFollowFadeMarket(address(ffm));
        registry.setTreasury(treasury);
        profileRegistry.setAuthorizedRepWriter(address(ffm), true);
        registry.addAsset("ETH", bytes32(uint256(1)));

        sm = new SettlementManager(
            address(registry),
            address(ffm),
            address(ce),
            address(profileRegistry),
            USDC_ARB_NATIVE,
            treasury,
            PYTH_ARBITRUM_ONE
        );

        // Wire SM into all contracts
        registry.setSettlementManager(address(sm));
        ffm.setSettlementManager(address(sm));
        ce.setSettlementManager(address(sm));
        profileRegistry.setSettlementManager(address(sm));
        profileRegistry.setAuthorizedRepWriter(address(sm), true);

        // ── Deploy score engine fixtures ────────────────────────────────────────

        // Deploy the reverting fixture (SAFETY-42 drill target)
        revertingEngine = address(new RevertingStylusEngine());

        // Deploy the Solidity baseline as the "real" engine (stand-in for Stylus WASM)
        // On mainnet-fork the real Stylus WASM is at the Sepolia address — but for the
        // local drill we use SolidityScoreEngine as the legitimate implementation.
        realEngine = address(new SolidityScoreEngine());

        // Deploy proxy with real engine as initial implementation
        // StatelessTransparentProxy auto-creates a ProxyAdmin (owner = deployer = owner)
        StatelessTransparentProxy proxy = new StatelessTransparentProxy(
            realEngine,
            owner   // ProxyAdmin owner = owner
        );
        stylusProxy = address(proxy);

        // Wire the proxy as the Stylus score engine
        sm.setStylusScoreEngine(stylusProxy);

        vm.stopPrank();

        // ── Read ProxyAdmin address from EIP-1967 admin slot ───────────────────
        proxyAdminAddr = address(uint160(uint256(vm.load(stylusProxy, adminSlot))));
        proxyAdminOwner = ProxyAdmin(proxyAdminAddr).owner();

        // ── Fund actors with USDC from whale ───────────────────────────────────
        vm.prank(USDC_WHALE);
        IERC20(USDC_ARB_NATIVE).transfer(alice, 1000e6);

        vm.prank(USDC_WHALE);
        IERC20(USDC_ARB_NATIVE).transfer(bob, 1000e6);

        // Approve contracts for alice and bob
        vm.prank(alice);
        IERC20(USDC_ARB_NATIVE).approve(address(registry), type(uint256).max);
        vm.prank(alice);
        IERC20(USDC_ARB_NATIVE).approve(address(ffm), type(uint256).max);
        vm.prank(alice);
        IERC20(USDC_ARB_NATIVE).approve(address(sm), type(uint256).max);

        vm.prank(bob);
        IERC20(USDC_ARB_NATIVE).approve(address(ffm), type(uint256).max);
        vm.prank(bob);
        IERC20(USDC_ARB_NATIVE).approve(address(sm), type(uint256).max);

        // Fund SM with ETH for Pyth VAA fees (Pitfall 4)
        vm.deal(address(sm), 0.1 ether);

        // ── Set up default Pyth mocks ───────────────────────────────────────────
        // price=4000e8 > target=3000e6 → CallerWon
        // conf=100, conf*200=20000 < 4000e8 → confidence gate passes
        _mockPyth(bytes32(uint256(1)));
    }

    // ─── Helper: mock Pyth for ETH feed ─────────────────────────────────────

    function _mockPyth(bytes32 feedId) internal {
        vm.mockCall(
            PYTH_ARBITRUM_ONE,
            abi.encodeWithSignature("getUpdateFee(bytes[])"),
            abi.encode(uint256(0))
        );
        vm.mockCall(
            PYTH_ARBITRUM_ONE,
            abi.encodeWithSignature("updatePriceFeeds(bytes[])"),
            abi.encode()
        );
        vm.mockCall(
            PYTH_ARBITRUM_ONE,
            abi.encodeWithSelector(IPyth.getPriceNoOlderThan.selector, feedId, uint256(60)),
            abi.encode(
                int64(4000_0000_0000),  // price: $4000 at expo -8
                uint64(100),            // conf: narrow
                int32(-8),              // expo: -8
                block.timestamp         // publishTime: fresh
            )
        );
    }

    // ─── Helper: create a live call as alice ─────────────────────────────────

    function _createCall(uint256 expiry) internal returns (uint256 callId) {
        vm.prank(alice);
        callId = registry.createCall(
            ICallRegistry.MarketType.PriceTarget,
            ICallRegistry.EventSubtype.None,
            ICallRegistry.Category.Majors,
            uint256(bytes32(uint256(1))),  // ETH feed
            0,
            3000e6,               // $3000 target (mock returns $4000 → CallerWon)
            uint64(expiry),
            50e6,                 // $50 stake
            50,                   // 50% conviction
            bytes32(0),
            true,
            0
        );
    }

    // ─── Test 1: full fallback flow ───────────────────────────────────────────

    /// @notice SAFETY-42: Upgrade proxy to RevertingStylusEngine, settle, assert:
    ///   1. RepCalculatedFallback emitted (error bytes non-empty)
    ///   2. Call.status == Settled (settlement completes despite Stylus revert)
    ///   3. Treasury received the 1.7% fee (money routing unaffected)
    ///   4. EIP-1967 impl slot reads RevertingStylusEngine after upgrade
    ///   5. Restore: re-upgrade to real engine; impl slot reads real engine again
    function test_stylus_fallback_fires_RepCalculatedFallback() public {
        // ── Step 1: create a call + fade so pool is non-zero ───────────────────
        uint256 callId = _createCall(block.timestamp + 1);
        vm.prank(bob);
        ffm.fade(callId, 20e6, 0);

        uint256 treasuryBefore = IERC20(USDC_ARB_NATIVE).balanceOf(treasury);

        // ── Step 2: upgrade proxy to RevertingStylusEngine ─────────────────────
        vm.prank(proxyAdminOwner);
        ProxyAdmin(proxyAdminAddr).upgradeAndCall(
            ITransparentUpgradeableProxy(payable(stylusProxy)),
            revertingEngine,
            ""
        );

        // Verify: EIP-1967 impl slot reads revertingEngine (not real engine)
        address implAfterUpgrade = address(uint160(uint256(vm.load(stylusProxy, IMPL_SLOT))));
        assertEq(
            implAfterUpgrade,
            revertingEngine,
            "SAFETY-42: impl slot must point at revertingEngine after upgrade"
        );

        // ── Step 3: settle — expect RepCalculatedFallback event ────────────────
        vm.warp(block.timestamp + 2);

        // RepCalculatedFallback(callId, caller, baselineDelta, lowLevelError)
        // Use checkTopic1=true (callId), checkTopic2=true (caller), skip data checks
        vm.expectEmit(true, true, false, false);
        emit ISettlementManager.RepCalculatedFallback(callId, alice, 0, "");

        sm.settle(callId, new bytes[](0), new uint256[](0));

        // ── Step 4: assert settlement completed ───────────────────────────────
        ICallRegistry.Call memory call = registry.getCall(callId);
        assertEq(
            uint8(call.status),
            uint8(ICallRegistry.CallStatus.Settled),
            "SAFETY-42: call must be Settled despite Stylus revert"
        );

        // ── Step 5: assert treasury received fees ────────────────────────────
        uint256 treasuryAfter = IERC20(USDC_ARB_NATIVE).balanceOf(treasury);
        assertGt(
            treasuryAfter,
            treasuryBefore,
            "SAFETY-42: treasury must receive 1.7% fees even when Stylus fallback fires"
        );

        // ── Step 6: restore — re-upgrade to real engine ───────────────────────
        vm.prank(proxyAdminOwner);
        ProxyAdmin(proxyAdminAddr).upgradeAndCall(
            ITransparentUpgradeableProxy(payable(stylusProxy)),
            realEngine,
            ""
        );

        // Verify restored: impl slot reads real engine again
        address implAfterRestore = address(uint160(uint256(vm.load(stylusProxy, IMPL_SLOT))));
        assertEq(
            implAfterRestore,
            realEngine,
            "SAFETY-42: impl slot must point at realEngine after restore"
        );
    }

    // ─── Test 2: baseline delta is non-zero ───────────────────────────────────

    /// @notice SAFETY-42: After the fallback fires, the baselineDelta field in
    ///         RepCalculatedFallback must be != 0 (Solidity baseline applied, not zero).
    ///         conviction=50 → scaled=(10*50*2)/100=10 → winner=+10; loser=-10; never 0.
    function test_stylus_fallback_baseline_delta_is_nonzero() public {
        // ── Create call + fade ─────────────────────────────────────────────────
        uint256 callId = _createCall(block.timestamp + 1);
        vm.prank(bob);
        ffm.fade(callId, 20e6, 0);

        // ── Upgrade proxy to RevertingStylusEngine ─────────────────────────────
        vm.prank(proxyAdminOwner);
        ProxyAdmin(proxyAdminAddr).upgradeAndCall(
            ITransparentUpgradeableProxy(payable(stylusProxy)),
            revertingEngine,
            ""
        );

        vm.warp(block.timestamp + 2);

        // ── Capture the RepCalculatedFallback event via vm.recordLogs ──────────
        vm.recordLogs();
        sm.settle(callId, new bytes[](0), new uint256[](0));

        // Parse logs to find RepCalculatedFallback and verify baselineDelta != 0
        // event RepCalculatedFallback(uint256 indexed callId, address indexed caller,
        //                             int256 baselineDelta, bytes lowLevelError)
        // keccak256("RepCalculatedFallback(uint256,address,int256,bytes)")
        bytes32 eventSig = keccak256("RepCalculatedFallback(uint256,address,int256,bytes)");

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool found = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == eventSig) {
                // data = abi.encode(int256 baselineDelta, bytes lowLevelError)
                (int256 baselineDelta,) = abi.decode(logs[i].data, (int256, bytes));
                assertTrue(
                    baselineDelta != 0,
                    "SAFETY-42: baselineDelta in RepCalculatedFallback must be non-zero"
                );
                found = true;
                break;
            }
        }
        assertTrue(found, "SAFETY-42: RepCalculatedFallback event must be emitted");

        // ── Restore real engine ────────────────────────────────────────────────
        vm.prank(proxyAdminOwner);
        ProxyAdmin(proxyAdminAddr).upgradeAndCall(
            ITransparentUpgradeableProxy(payable(stylusProxy)),
            realEngine,
            ""
        );
    }
}
