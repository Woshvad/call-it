// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions"
// Spec: CALL_IT_SPEC1.md §12.4 — SettlementManager oracle attestation rail (gap-closure)
// Requirements: SETTLE-06, SETTLE-09, SAFETY-57, T-04-04-01
//
// Tests for the EIP-712 relayer-attestation rail on SettlementManager.
// Covers: happy path, wrong signer, replay (wrong domain), cross-type mismatch,
//         pending outcome rejection, callId mismatch, and the defer (bug-fix) path.
//
// Run: forge test --match-contract SettlementAttestationTest -vv
//      (no fork RPC required — all unit tests using SmTestHelper mocks)

import { Test } from "forge-std/Test.sol";
import { SmTestHelper } from "./helpers/SmTestHelper.sol";
import { ICallRegistry } from "../src/interfaces/ICallRegistry.sol";
import { ISettlementManager } from "../src/interfaces/ISettlementManager.sol";

/// @title SettlementAttestationTest
/// @notice Foundry tests for submitAttestation() + setAttestationSigner() on SettlementManager.
///
///         EIP-712 domain: name="CallIt-Oracle", version="1", chainId=block.chainid,
///                         verifyingContract=address(sm)
///         Struct:         OracleAttestation(uint256 callId, uint8 oracleType, uint8 outcome,
///                                          int256 priceDelta, uint256 timestamp)
///
/// Test coverage:
///   1. testAttestationHappyPathSettles        — valid sig → settle() succeeds CallerWon
///   2. testAttestationWrongSignerReverts      — wrong key → InvalidAttestation
///   3. testAttestationReplayWrongDomainReverts — wrong domain → recovered addr != signer
///   4. testAttestationCrossTypeReverts        — oracleType != configured adapter → InvalidAttestation
///   5. testAttestationPendingOutcomeReverts   — outcome=0 → InvalidAttestation
///   6. testAttestationCallIdMismatchReverts   — payload callId != param → InvalidAttestation
///   7. testUnattestedNonPythDefers            — no attestation → Pending + SettlementDelayed (BUG FIX)
contract SettlementAttestationTest is SmTestHelper {

    // ─── EIP-712 constants (must match SettlementManager exactly) ────────────
    bytes32 private constant ORACLE_ATTESTATION_TYPEHASH = keccak256(
        "OracleAttestation(uint256 callId,uint8 oracleType,uint8 outcome,int256 priceDelta,uint256 timestamp)"
    );

    // Oracle adapter types matching ISettlementManager.OracleAdapter enum
    uint8 private constant ADAPTER_PYTH        = 0;
    uint8 private constant ADAPTER_NFT_TWAP    = 1;
    uint8 private constant ADAPTER_DEFI_LLAMA  = 2;
    uint8 private constant ADAPTER_RPC_METRICS = 3;
    uint8 private constant ADAPTER_SNAPSHOT    = 4;
    uint8 private constant ADAPTER_TALLY       = 5;
    uint8 private constant ADAPTER_CEX_SCRAPER = 6;

    // Outcome values matching ICallRegistry.Outcome enum
    uint8 private constant OUTCOME_PENDING    = 0;
    uint8 private constant OUTCOME_CALLER_WON  = 1;
    uint8 private constant OUTCOME_CALLER_LOST = 2;

    // ─── Test key pairs (deterministic from vm.createAccount) ─────────────────
    uint256 private signerPrivKey;
    address private signerAddr;
    uint256 private wrongPrivKey;
    address private wrongSignerAddr;

    // ─── setUp ────────────────────────────────────────────────────────────────

    function setUp() public virtual override {
        // Boot full SmTestHelper stack (PR + CR + FFM + CE + SM + mocks)
        super.setUp();

        // Create deterministic test key pairs
        signerPrivKey    = 0xA11CE;
        signerAddr       = vm.addr(signerPrivKey);
        wrongPrivKey     = 0xBAD1D;
        wrongSignerAddr  = vm.addr(wrongPrivKey);

        // Register the DefiLlama adapter for the Event market type so non-Pyth calls can be set up.
        // MarketType.Event=2, EventSubtype.TvlMilestone=1 → OracleAdapter.DefiLlama=2
        vm.prank(owner);
        sm.setAdapterMap(
            uint8(ICallRegistry.MarketType.Event),
            uint8(ICallRegistry.EventSubtype.TvlMilestone),
            ISettlementManager.OracleAdapter.DefiLlama
        );

        // Register signerAddr as the attestation signer for the DefiLlama oracle type
        vm.prank(owner);
        sm.setAttestationSigner(ADAPTER_DEFI_LLAMA, signerAddr);
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    /// @dev Compute the EIP-712 domain separator for SettlementManager.
    ///      Replicates the domain used by OZ EIP712("CallIt-Oracle", "1") with
    ///      block.chainid and address(sm) as verifyingContract.
    function _domainSeparator() internal view returns (bytes32) {
        bytes32 TYPE_HASH = keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );
        return keccak256(
            abi.encode(
                TYPE_HASH,
                keccak256(bytes("CallIt-Oracle")),
                keccak256(bytes("1")),
                block.chainid,
                address(sm)
            )
        );
    }

    /// @dev Build the EIP-712 digest for an OracleAttestation struct.
    function _buildDigest(
        uint256 callId,
        uint8   oracleType,
        uint8   outcome,
        int256  priceDelta,
        uint256 timestamp
    ) internal view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                ORACLE_ATTESTATION_TYPEHASH,
                callId,
                oracleType,
                outcome,
                priceDelta,
                timestamp
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
    }

    /// @dev Sign a digest with the given private key and return the 65-byte signature.
    function _sign(uint256 privKey, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privKey, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @dev Encode an OracleAttestation payload (the attestationData bytes param).
    function _encodePayload(
        uint256 callId,
        uint8   oracleType,
        uint8   outcome,
        int256  priceDelta,
        uint256 timestamp
    ) internal pure returns (bytes memory) {
        return abi.encode(callId, oracleType, outcome, priceDelta, timestamp);
    }

    /// @dev Create a non-Pyth Event call (MarketType.Event, EventSubtype.TvlMilestone)
    ///      that maps to OracleAdapter.DefiLlama.
    ///      Uses _seedPool pattern adapted for Event market type.
    function _seedEventCall(address caller, uint96 stake, uint64 expiry)
        internal
        returns (uint256 callId)
    {
        vm.prank(caller);
        callId = registry.createCall(
            ICallRegistry.MarketType.Event,          // marketType
            ICallRegistry.EventSubtype.TvlMilestone, // eventSubtype
            ICallRegistry.Category.DeFi,             // category
            uint256(ETH_FEED),                       // assetA (Pyth feedId key)
            0,                                       // assetB
            5000e8,                                  // targetValue
            expiry,                                  // expiry
            stake,                                   // stake
            50,                                      // conviction
            bytes32(0),                              // criteriaHash (not required for TvlMilestone)
            false,                                   // openToChallenges
            0                                        // parentCallId
        );
    }

    // ─── 1. Happy path: valid attestation → settle() → CallerWon ─────────────

    /// @notice testAttestationHappyPathSettles (SETTLE-06, SAFETY-57)
    ///         setAttestationSigner(DefiLlama, signerAddr);
    ///         submit a valid CallerWon attestation for a DefiLlama-mapped call;
    ///         then settle() → outcome CallerWon, priceDelta propagated.
    function testAttestationHappyPathSettles() public {
        uint256 callId = _seedEventCall(alice, 50e6, uint64(block.timestamp + 1));
        vm.warp(block.timestamp + 2);

        int256  priceDelta = 500e8;
        uint256 timestamp  = block.timestamp;

        // Build attestation data and sign it
        bytes memory payload = _encodePayload(
            callId, ADAPTER_DEFI_LLAMA, OUTCOME_CALLER_WON, priceDelta, timestamp
        );
        bytes32 digest = _buildDigest(
            callId, ADAPTER_DEFI_LLAMA, OUTCOME_CALLER_WON, priceDelta, timestamp
        );
        bytes memory sig = _sign(signerPrivKey, digest);

        // Expect AttestationSubmitted event
        vm.expectEmit(true, false, false, true);
        emit ISettlementManager.AttestationSubmitted(
            callId, ADAPTER_DEFI_LLAMA, OUTCOME_CALLER_WON, priceDelta
        );

        // Submit attestation (anyone can call — permissionless relayer path)
        sm.submitAttestation(callId, payload, sig);

        // Settle (non-Pyth path now reads from attestation)
        vm.expectEmit(true, false, false, true);
        emit ISettlementManager.CallSettled(callId, OUTCOME_CALLER_WON, priceDelta);
        sm.settle(callId, new bytes[](0), new uint256[](0));

        // Verify call is Settled with CallerWon outcome
        ICallRegistry.Call memory settled = registry.getCall(callId);
        assertEq(
            uint8(settled.outcome),
            OUTCOME_CALLER_WON,
            "Happy path: outcome must be CallerWon"
        );
        assertEq(
            uint8(settled.status),
            uint8(ICallRegistry.CallStatus.Settled),
            "Happy path: call must be Settled"
        );
    }

    // ─── 2. Wrong signer → InvalidAttestation ────────────────────────────────

    /// @notice testAttestationWrongSignerReverts (T-04-04-01)
    ///         Signature from a DIFFERENT key than attestationSigner[type] → revert.
    function testAttestationWrongSignerReverts() public {
        uint256 callId = _seedEventCall(alice, 50e6, uint64(block.timestamp + 1));

        uint256 timestamp = block.timestamp;
        bytes memory payload = _encodePayload(
            callId, ADAPTER_DEFI_LLAMA, OUTCOME_CALLER_WON, 100e8, timestamp
        );
        bytes32 digest = _buildDigest(
            callId, ADAPTER_DEFI_LLAMA, OUTCOME_CALLER_WON, 100e8, timestamp
        );

        // Sign with the WRONG key (wrongPrivKey) — should not match attestationSigner[DefiLlama]
        bytes memory badSig = _sign(wrongPrivKey, digest);

        vm.expectRevert(ISettlementManager.InvalidAttestation.selector);
        sm.submitAttestation(callId, payload, badSig);
    }

    // ─── 3. Wrong domain → recovered signer != expected → revert ─────────────

    /// @notice testAttestationReplayWrongDomainReverts
    ///         A signature whose digest used a different verifyingContract/chainId.
    ///         The recovered signer will not match attestationSigner[oracleType].
    function testAttestationReplayWrongDomainReverts() public {
        uint256 callId = _seedEventCall(alice, 50e6, uint64(block.timestamp + 1));

        uint256 timestamp = block.timestamp;
        bytes memory payload = _encodePayload(
            callId, ADAPTER_DEFI_LLAMA, OUTCOME_CALLER_WON, 100e8, timestamp
        );

        // Build digest with a DIFFERENT domain (wrong verifyingContract = address(0xDEAD))
        bytes32 wrongDomainSep = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("CallIt-Oracle")),
                keccak256(bytes("1")),
                block.chainid,
                address(0xDEAD)  // wrong verifyingContract
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                ORACLE_ATTESTATION_TYPEHASH,
                callId,
                ADAPTER_DEFI_LLAMA,
                OUTCOME_CALLER_WON,
                int256(100e8),
                timestamp
            )
        );
        bytes32 wrongDigest = keccak256(
            abi.encodePacked("\x19\x01", wrongDomainSep, structHash)
        );

        // Sign with the correct key but against the wrong domain
        bytes memory wrongDomainSig = _sign(signerPrivKey, wrongDigest);

        // ECDSA.recover will recover a DIFFERENT address (not signerAddr) → InvalidAttestation
        vm.expectRevert(ISettlementManager.InvalidAttestation.selector);
        sm.submitAttestation(callId, payload, wrongDomainSig);
    }

    // ─── 4. Cross-type: oracleType != call's configured adapter → revert ──────

    /// @notice testAttestationCrossTypeReverts (SAFETY-57)
    ///         A signature valid for oracleType=DefiLlama submitted with attestationData
    ///         claiming oracleType=Snapshot (which is not the configured adapter for
    ///         this call) → revert InvalidAttestation.
    function testAttestationCrossTypeReverts() public {
        // The call has MarketType.Event + EventSubtype.TvlMilestone → DefiLlama(2)
        uint256 callId = _seedEventCall(alice, 50e6, uint64(block.timestamp + 1));

        // Register a Snapshot signer (not used for this call's adapter)
        vm.prank(owner);
        sm.setAttestationSigner(ADAPTER_SNAPSHOT, signerAddr);

        uint256 timestamp = block.timestamp;

        // Payload claims oracleType=Snapshot(4), but the call is configured for DefiLlama(2)
        bytes memory payload = _encodePayload(
            callId, ADAPTER_SNAPSHOT, OUTCOME_CALLER_WON, 0, timestamp
        );
        bytes32 digest = _buildDigest(
            callId, ADAPTER_SNAPSHOT, OUTCOME_CALLER_WON, 0, timestamp
        );
        bytes memory sig = _sign(signerPrivKey, digest);

        // adapterMap for this call says DefiLlama(2), but payload says Snapshot(4) → mismatch
        vm.expectRevert(ISettlementManager.InvalidAttestation.selector);
        sm.submitAttestation(callId, payload, sig);
    }

    // ─── 5. Pending outcome → revert ─────────────────────────────────────────

    /// @notice testAttestationPendingOutcomeReverts
    ///         outcome=0 (Pending) → revert InvalidAttestation.
    ///         Pending is ambiguous and must never be attested on-chain.
    function testAttestationPendingOutcomeReverts() public {
        uint256 callId = _seedEventCall(alice, 50e6, uint64(block.timestamp + 1));

        uint256 timestamp = block.timestamp;
        bytes memory payload = _encodePayload(
            callId, ADAPTER_DEFI_LLAMA, OUTCOME_PENDING, 0, timestamp
        );
        bytes32 digest = _buildDigest(
            callId, ADAPTER_DEFI_LLAMA, OUTCOME_PENDING, 0, timestamp
        );
        bytes memory sig = _sign(signerPrivKey, digest);

        vm.expectRevert(ISettlementManager.InvalidAttestation.selector);
        sm.submitAttestation(callId, payload, sig);
    }

    // ─── 6. callId mismatch → revert ─────────────────────────────────────────

    /// @notice testAttestationCallIdMismatchReverts
    ///         attestationData.callId != param callId → revert InvalidAttestation.
    ///         Prevents an attester from reusing a payload signed for callId=X
    ///         to attest callId=Y.
    function testAttestationCallIdMismatchReverts() public {
        uint256 callId = _seedEventCall(alice, 50e6, uint64(block.timestamp + 1));
        uint256 wrongCallId = callId + 99; // deliberately wrong

        uint256 timestamp = block.timestamp;

        // Payload encodes wrongCallId but we call submitAttestation(callId, ...)
        bytes memory payload = _encodePayload(
            wrongCallId, ADAPTER_DEFI_LLAMA, OUTCOME_CALLER_WON, 0, timestamp
        );
        bytes32 digest = _buildDigest(
            wrongCallId, ADAPTER_DEFI_LLAMA, OUTCOME_CALLER_WON, 0, timestamp
        );
        bytes memory sig = _sign(signerPrivKey, digest);

        vm.expectRevert(ISettlementManager.InvalidAttestation.selector);
        sm.submitAttestation(callId, payload, sig); // param callId != payload callId
    }

    // ─── 7. Unattested non-Pyth → DEFERS (BUG FIX regression guard) ──────────

    /// @notice testUnattestedNonPythDefers (SETTLE-09 regression guard)
    ///         A non-Pyth call with NO attestation → settle() does NOT revert and does
    ///         NOT settle (status stays Live, no CallSettled) and emits SettlementDelayed.
    ///
    ///         This is the regression guard for the security blocker fixed by this gap-closure:
    ///         the old code returned (CallerLost, 0) by default, mis-settling every unattested
    ///         non-Pyth call. The fix: return (Pending, 0) + emit SettlementDelayed.
    function testUnattestedNonPythDefers() public {
        uint256 callId = _seedEventCall(alice, 50e6, uint64(block.timestamp + 1));
        vm.warp(block.timestamp + 2);

        // No submitAttestation() call — test the unattested path

        // Expect SettlementDelayed with reason "attestation-pending"
        vm.expectEmit(true, false, false, false); // only check indexed callId
        emit ISettlementManager.SettlementDelayed(callId, "attestation-pending", block.timestamp);

        // settle() must NOT revert — returns early because outcome is Pending
        sm.settle(callId, new bytes[](0), new uint256[](0));

        // Call must still be Live — settlement did NOT proceed
        ICallRegistry.Call memory call = registry.getCall(callId);
        assertEq(
            uint8(call.status),
            uint8(ICallRegistry.CallStatus.Live),
            "Unattested non-Pyth: call must remain Live (defer, not settle)"
        );
        assertEq(
            uint8(call.outcome),
            OUTCOME_PENDING,
            "Unattested non-Pyth: outcome must remain Pending"
        );

        // Explicitly check: CallSettled must NOT have been emitted.
        // (If CallSettled had been emitted, the call status above would be Settled, which
        //  the assertEq above already caught. This comment documents the intent.)
    }

    // ─── 8. setAttestationSigner owner guard ─────────────────────────────────

    /// @notice testSetAttestationSignerOnlyOwner
    ///         Non-owner calling setAttestationSigner() → reverts with OwnableUnauthorizedAccount.
    function testSetAttestationSignerOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        sm.setAttestationSigner(ADAPTER_DEFI_LLAMA, alice);
    }

    /// @notice testSetAttestationSignerInvalidType
    ///         oracleType > CexScraper(6) → require("invalid-oracle-type") reverts.
    function testSetAttestationSignerInvalidType() public {
        vm.prank(owner);
        vm.expectRevert(bytes("invalid-oracle-type"));
        sm.setAttestationSigner(7, signerAddr);
    }

    /// @notice testSetAttestationSignerEmitsEvent
    ///         setAttestationSigner emits AttestationSignerSet event.
    function testSetAttestationSignerEmitsEvent() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit ISettlementManager.AttestationSignerSet(ADAPTER_NFT_TWAP, signerAddr);
        sm.setAttestationSigner(ADAPTER_NFT_TWAP, signerAddr);
        assertEq(sm.attestationSigner(ADAPTER_NFT_TWAP), signerAddr);
    }

    // ─── 9. Pyth-type oracleType in payload → revert ─────────────────────────

    /// @notice testAttestationPythTypeReverts
    ///         oracleType=0 (Pyth) cannot be submitted via attestation — it has
    ///         its own on-chain VAA path. Attempting it → InvalidAttestation.
    function testAttestationPythTypeReverts() public {
        // Configure adapter for this call as Pyth (the default for PriceTarget calls)
        // We need a call whose adapter is Pyth, but the attestation path gates oracleType=0.
        // Use a DefiLlama call but pass oracleType=Pyth in payload.
        uint256 callId = _seedEventCall(alice, 50e6, uint64(block.timestamp + 1));

        uint256 timestamp = block.timestamp;
        bytes memory payload = _encodePayload(
            callId, ADAPTER_PYTH, OUTCOME_CALLER_WON, 0, timestamp
        );
        bytes32 digest = _buildDigest(
            callId, ADAPTER_PYTH, OUTCOME_CALLER_WON, 0, timestamp
        );
        bytes memory sig = _sign(signerPrivKey, digest);

        vm.expectRevert(ISettlementManager.InvalidAttestation.selector);
        sm.submitAttestation(callId, payload, sig);
    }

    // ─── 10. CallerLost happy path ────────────────────────────────────────────

    /// @notice testAttestationCallerLostSettles
    ///         Valid CallerLost attestation → settle() → outcome CallerLost.
    function testAttestationCallerLostSettles() public {
        uint256 callId = _seedEventCall(alice, 50e6, uint64(block.timestamp + 1));
        vm.warp(block.timestamp + 2);

        int256  priceDelta = -200e8;
        uint256 timestamp  = block.timestamp;

        bytes memory payload = _encodePayload(
            callId, ADAPTER_DEFI_LLAMA, OUTCOME_CALLER_LOST, priceDelta, timestamp
        );
        bytes32 digest = _buildDigest(
            callId, ADAPTER_DEFI_LLAMA, OUTCOME_CALLER_LOST, priceDelta, timestamp
        );
        bytes memory sig = _sign(signerPrivKey, digest);

        sm.submitAttestation(callId, payload, sig);

        vm.expectEmit(true, false, false, true);
        emit ISettlementManager.CallSettled(callId, OUTCOME_CALLER_LOST, priceDelta);
        sm.settle(callId, new bytes[](0), new uint256[](0));

        ICallRegistry.Call memory settled = registry.getCall(callId);
        assertEq(
            uint8(settled.outcome),
            OUTCOME_CALLER_LOST,
            "CallerLost happy path: outcome must be CallerLost"
        );
    }
}
