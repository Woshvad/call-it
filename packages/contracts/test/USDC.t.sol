// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;

import {Test} from "forge-std/Test.sol";
import {USDC_ARB_NATIVE, USDC_ARB_SEPOLIA, resolveUsdc} from "../src/constants/USDC.sol";
import {ChallengeEscrow} from "../src/ChallengeEscrow.sol";
import {SettlementManager} from "../src/SettlementManager.sol";
import {ProfileRegistry} from "../src/ProfileRegistry.sol";
import {CallRegistry} from "../src/CallRegistry.sol";
import {FollowFadeMarket} from "../src/FollowFadeMarket.sol";
import {IProfileRegistry} from "../src/interfaces/IProfileRegistry.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

/// @dev Thin wrapper so vm.expectRevert() catches the revert at sub-call depth.
///      resolveUsdc() is a free function; calling it inline in a test reverts at the
///      test frame depth, not a lower depth. This wrapper forces an external call.
contract ResolveUsdcCaller {
    function call() external view returns (address) {
        return resolveUsdc();
    }
}

/// @title USDC constant + resolveUsdc() test
/// @notice Asserts that the USDC constants equal the canonical native addresses and
///         that resolveUsdc() returns the correct address per chainid.
///
///         New in Phase 6 (ADR-0001): resolveUsdc() tests + constructor-revert tests
///         for ChallengeEscrow and SettlementManager.
///
///         If these tests fail, USDC transfer paths in the product will route funds
///         to the wrong address (SAFETY-13, OPS-22, T-00-01).
///
///         Source: CLAUDE.md "Pinned Addresses (Arbitrum One Mainnet)"
///         Spec:   CALL_IT_SPEC1.md §10.5
///         ADR:    .planning/decisions/0001-sepolia-staging-usdc.md
contract USDCConstantTest is Test {
    /// @notice The canonical native USDC address on Arbitrum One.
    ///         Must match USDC_ARB_NATIVE exactly.
    address constant EXPECTED_NATIVE_USDC = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;

    /// @notice Circle's official USDC on Arbitrum Sepolia.
    ///         Must match USDC_ARB_SEPOLIA exactly (ADR-0001).
    address constant EXPECTED_SEPOLIA_USDC = 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d;

    /// @notice The bridged USDC.e address -- must NOT equal USDC_ARB_NATIVE.
    ///         Listed here only for the negative-test assertion.
    ///         See CLAUDE.md "What NOT to Use" for context.
    address constant BRIDGED_USDC_E_DO_NOT_USE = 0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8;

    /// @notice Asserts USDC_ARB_NATIVE is exactly the canonical native USDC address.
    function test_USDC_ARB_NATIVE_matches_native_address() public pure {
        assertEq(
            USDC_ARB_NATIVE,
            EXPECTED_NATIVE_USDC,
            "USDC_ARB_NATIVE must equal 0xaf88d065e77c8cC2239327C5EDb3A432268e5831 (native USDC on Arbitrum One)"
        );
    }

    /// @notice Asserts USDC_ARB_NATIVE is NOT the bridged USDC.e address.
    function test_USDC_ARB_NATIVE_is_not_bridged() public pure {
        assertTrue(
            USDC_ARB_NATIVE != BRIDGED_USDC_E_DO_NOT_USE,
            "USDC_ARB_NATIVE must not equal 0xFF970A61...DB5CC8 (bridged USDC.e - not redeemable 1:1 with Circle)"
        );
    }

    // ─── Phase 6 / ADR-0001: resolveUsdc() branch tests ─────────────────────────

    /// @notice resolveUsdc() on chainid 42161 (Arbitrum One mainnet) returns USDC_ARB_NATIVE.
    /// @dev SAFETY-13 invariant: mainnet branch is first and unconditional.
    function test_resolveUsdc_mainnet_returns_native() public {
        vm.chainId(42161);
        address resolved = resolveUsdc();
        assertEq(
            resolved,
            USDC_ARB_NATIVE,
            "resolveUsdc() on chainid 42161 must return USDC_ARB_NATIVE"
        );
    }

    /// @notice resolveUsdc() on chainid 421614 (Arbitrum Sepolia) returns USDC_ARB_SEPOLIA.
    function test_resolveUsdc_sepolia_returns_sepolia() public {
        vm.chainId(421614);
        address resolved = resolveUsdc();
        assertEq(
            resolved,
            EXPECTED_SEPOLIA_USDC,
            "resolveUsdc() on chainid 421614 must return USDC_ARB_SEPOLIA (Circle testnet USDC)"
        );
    }

    /// @notice resolveUsdc() reverts with "USDC: unsupported chain" on any other chainid.
    /// @dev Uses ResolveUsdcCaller wrapper because vm.expectRevert() requires the revert to
    ///      occur in a sub-call (lower depth than the cheatcode call). resolveUsdc() is a
    ///      free function; calling it inline would revert at test frame depth.
    function test_resolveUsdc_unsupported_chain_reverts() public {
        vm.chainId(1); // Ethereum mainnet
        ResolveUsdcCaller caller = new ResolveUsdcCaller();
        vm.expectRevert("USDC: unsupported chain");
        caller.call();
    }

    /// @notice resolveUsdc() also reverts on chainid 137 (Polygon) -- belt-and-suspenders.
    function test_resolveUsdc_polygon_reverts() public {
        vm.chainId(137); // Polygon
        ResolveUsdcCaller caller = new ResolveUsdcCaller();
        vm.expectRevert("USDC: unsupported chain");
        caller.call();
    }

    /// @notice resolveUsdc() also reverts on Foundry default chainid 31337.
    /// @dev This is the key regression guard: without vm.chainId(42161) in setUp(),
    ///      any test that deploys ChallengeEscrow or SettlementManager would revert.
    function test_resolveUsdc_foundry_default_chainid_reverts() public {
        vm.chainId(31337); // Foundry default
        ResolveUsdcCaller caller = new ResolveUsdcCaller();
        vm.expectRevert("USDC: unsupported chain");
        caller.call();
    }

    // ─── Phase 6 / ADR-0001: Constructor-revert tests ────────────────────────────

    /// @notice ChallengeEscrow constructor reverts when passed a wrong USDC address.
    /// @dev Confirms require(_usdc == resolveUsdc(), "wrong USDC") fires.
    function test_ChallengeEscrow_constructor_reverts_wrong_usdc() public {
        vm.chainId(42161);
        // Etch MockUSDC at USDC_ARB_NATIVE so the constructor can find it
        MockUSDC mockImpl = new MockUSDC();
        vm.etch(USDC_ARB_NATIVE, address(mockImpl).code);

        // Deploy supporting contracts
        ProfileRegistry pr = new ProfileRegistry();
        CallRegistry cr = new CallRegistry(IProfileRegistry(address(pr)), 5_000e6);
        FollowFadeMarket ffm = new FollowFadeMarket(address(cr), address(pr), address(0xBEEF));

        address wrongUsdc = address(0xdead);
        vm.expectRevert("wrong USDC");
        new ChallengeEscrow(address(cr), address(ffm), wrongUsdc, address(0xBEEF), 5_000e6);
    }

    /// @notice SettlementManager constructor reverts when passed a wrong USDC address.
    /// @dev Confirms require(_usdc == resolveUsdc(), "wrong USDC") fires.
    function test_SettlementManager_constructor_reverts_wrong_usdc() public {
        vm.chainId(42161);
        // Etch MockUSDC at USDC_ARB_NATIVE
        MockUSDC mockImpl = new MockUSDC();
        vm.etch(USDC_ARB_NATIVE, address(mockImpl).code);

        // Deploy supporting contracts
        ProfileRegistry pr = new ProfileRegistry();
        CallRegistry cr = new CallRegistry(IProfileRegistry(address(pr)), 5_000e6);
        FollowFadeMarket ffm = new FollowFadeMarket(address(cr), address(pr), address(0xBEEF));
        ChallengeEscrow ce = new ChallengeEscrow(
            address(cr), address(ffm), USDC_ARB_NATIVE, address(0xBEEF), 5_000e6
        );

        address wrongUsdc = address(0xdead);
        address mockPyth = makeAddr("pyth");
        vm.expectRevert("wrong USDC");
        new SettlementManager(
            address(cr), address(ffm), address(ce), address(pr),
            wrongUsdc, address(0xBEEF), mockPyth
        );
    }
}
