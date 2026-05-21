// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;

import {Test} from "forge-std/Test.sol";
import {USDC_ARB_NATIVE} from "../src/constants/USDC.sol";

/// @title USDC constant test
/// @notice Asserts that the USDC_ARB_NATIVE constant equals the canonical native USDC
///         address on Arbitrum One and is NOT the bridged USDC.e address.
///
///         If these tests fail, USDC transfer paths in the product will route funds
///         to the wrong address (SAFETY-13, OPS-22, T-00-01).
///
///         Source: CLAUDE.md "Pinned Addresses (Arbitrum One Mainnet)"
///         Spec:   CALL_IT_SPEC1.md §10.5
contract USDCConstantTest is Test {
    /// @notice The canonical native USDC address on Arbitrum One.
    ///         Must match USDC_ARB_NATIVE exactly.
    address constant EXPECTED_NATIVE_USDC = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;

    /// @notice The bridged USDC.e address — must NOT equal USDC_ARB_NATIVE.
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
}
