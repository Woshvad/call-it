// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions"
// Spec: CALL_IT_SPEC1.md §12.3 — ChallengeEscrow test helper
// Requirement: SOCIAL-29..39, SOCIAL-48
//
// Wave 1 test helper — abstract base for all ChallengeEscrow test contracts.
// CeTestHelper extends FfmTestHelper (3-contract stack) by deploying ChallengeEscrow
// on top and adding the `challenger` test actor.
//
// NOTE: Do NOT inherit StdInvariant here — same C3 linearization rule as FfmTestHelper.
// Any invariant test contract should use `is CeTestHelper, StdInvariant` explicitly.

// forge-std: import components individually so CeTestHelper does NOT inherit StdInvariant.
import { FfmTestHelper } from "./FfmTestHelper.sol";
import { ChallengeEscrow } from "../../src/ChallengeEscrow.sol";
import { IChallengeEscrow } from "../../src/interfaces/IChallengeEscrow.sol";

/// @title CeTestHelper
/// @notice Abstract helper that extends FfmTestHelper with a deployed ChallengeEscrow
///         and a fourth test actor (`challenger`).
///
///         Boot order:
///           1. super.setUp() → ProfileRegistry + CallRegistry + FollowFadeMarket + MockUSDC
///           2. challenger = makeAddr("challenger"); mint 1000 USDC
///           3. Deploy ChallengeEscrow as owner (args: registry, ffm, USDC_ARB_NATIVE, treasury, 5_000e6)
///           4. Max-approve ChallengeEscrow for alice, bob, challenger
///
///         Exposes:
///           - ce ChallengeEscrow — the deployed contract
///           - challenger address — fourth test actor
///           - MIN_STAKE / MAX_STAKE / CHALLENGE_ACCEPTANCE_WINDOW constants
///           - _proposeChallenge(from, callId, stake) helper
abstract contract CeTestHelper is FfmTestHelper {
    // ─── Constants matching ChallengeEscrow.sol (Plan 03-02) ─────────────────
    uint96  internal constant MIN_STAKE                 = 5e6;     // $5 USDC
    uint96  internal constant MAX_STAKE                 = 100e6;   // $100 USDC
    uint256 internal constant CHALLENGE_ACCEPTANCE_WINDOW = 24 hours;
    uint256 internal constant INITIAL_CE_TVL_CAP        = 5_000e6; // $5,000 USDC

    // ─── Deployed contract ────────────────────────────────────────────────────
    ChallengeEscrow internal ce;

    // ─── Additional test actor ────────────────────────────────────────────────
    address internal challenger; // distinct from alice/bob/owner/treasury (T-3-01-02)

    // ─── setUp ────────────────────────────────────────────────────────────────

    function setUp() public virtual override {
        // Pin chainid to Arbitrum One before deploying contracts with resolveUsdc() guards.
        // resolveUsdc() reverts on Foundry's default chainid (31337) -- must be 42161 or 421614.
        // (ADR-0001 Phase 6 regression fix)
        vm.chainId(42161);

        // Step 1: boot the 3-contract stack + MockUSDC etch + fund alice+bob
        super.setUp();

        // Step 2: create and fund the challenger actor
        challenger = makeAddr("challenger");
        usdc.mint(challenger, 1000e6);

        // Step 3: deploy ChallengeEscrow as owner
        vm.startPrank(owner);
        ce = new ChallengeEscrow(
            address(registry),
            address(ffm),
            USDC_ARB_NATIVE,
            treasury,
            INITIAL_CE_TVL_CAP
        );
        vm.stopPrank();

        // Step 4: max-approve ChallengeEscrow for all three actors
        vm.prank(challenger);
        usdc.approve(address(ce), type(uint256).max);

        vm.prank(alice);
        usdc.approve(address(ce), type(uint256).max);

        vm.prank(bob);
        usdc.approve(address(ce), type(uint256).max);
    }

    // ─── Helper ───────────────────────────────────────────────────────────────

    /// @notice Propose a challenge from `from` against `callId` with `stake` USDC.
    /// @param from    The address proposing (prank'd).
    /// @param callId  The call to challenge.
    /// @param stake   USDC stake in micro-units (must be [MIN_STAKE, MAX_STAKE]).
    /// @return challengeId The newly created challenge ID.
    function _proposeChallenge(address from, uint256 callId, uint96 stake)
        internal
        returns (uint256 challengeId)
    {
        vm.prank(from);
        challengeId = ce.proposeChallenge(callId, stake);
    }
}
