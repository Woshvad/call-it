// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;

import { Test } from "forge-std/Test.sol";
import { SettlementManager } from "../src/SettlementManager.sol";

/// @dev DIAGNOSTIC / REGRESSION (fork-only; skips in CI when no RPC is set).
///
/// Documents the live Arbitrum-Sepolia settlement blocker found during the
/// Phase-6 soak: settle() reverts with NO error data because the deployed
/// Phase-2 ProfileRegistry (0xAfe239a3..., preserved across every phase and
/// never redeployed) lacks the `globalRep(address)` getter that the Phase-6
/// SettlementManager calls in `_computeRepDelta` (SettlementManager.sol:282) —
/// and that call sits OUTSIDE the Stylus try/catch seam, so the fallback can't
/// save it. `applyRepDelta` DOES exist on the deployed PR (which is why call
/// creation / seeding worked), so it's a partial-version mismatch.
///
/// Mocks Pyth so `_settlePyth` cleanly returns CallerWon and execution reaches
/// the failing `globalRep` staticcall. Found via `forge test -vvvv` (the trace
/// pinpoints `ProfileRegistry::globalRep → [Revert]`).
///
/// FIX: redeploy the cluster (ProfileRegistry + FFM/CE/SM — the immutable PR
/// refs cascade) from current source, where the PR exposes globalRep(). This
/// test will then FAIL (settle no longer reverts) — that is the signal the fix
/// has landed. Mainnet is safe IFF its ProfileRegistry is deployed from current
/// source; the SM↔PR globalRep coupling must be verified at deploy time.
contract SettleTraceTest is Test {
    address constant SM = 0x998CC092E69f4D2bebb0852eF69CC1F04038c7D4;
    address constant PYTH = 0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DAF;

    function test_settle_reverts_PR_globalRep_versionMismatch() public {
        string memory rpc = vm.envOr("ARBITRUM_SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return; // skip in CI (no fork RPC)
        vm.createSelectFork(rpc);

        // Mock Pyth so _settlePyth proceeds past the price read into _computeRepDelta.
        vm.mockCall(PYTH, abi.encodeWithSignature("getUpdateFee(bytes[])"), abi.encode(uint256(0)));
        vm.mockCall(PYTH, abi.encodeWithSignature("updatePriceFeeds(bytes[])"), bytes(""));
        // PythStructs.Price { int64 price; uint64 conf; int32 expo; uint publishTime }
        vm.mockCall(
            PYTH,
            abi.encodeWithSignature("getPriceNoOlderThan(bytes32,uint256)"),
            abi.encode(int64(300000000000), uint64(1000000), int32(-8), block.timestamp)
        );

        bytes[] memory upd = new bytes[](0);
        uint256[] memory ch = new uint256[](0);

        // Current live behavior: reverts in ProfileRegistry.globalRep (selector absent).
        vm.expectRevert();
        SettlementManager(payable(SM)).settle(1, upd, ch);
    }
}
