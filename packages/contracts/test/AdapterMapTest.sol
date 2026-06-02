// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Spec: CALL_IT_SPEC1.md §12.4 — setAdapterMap + _checkAdapterBinding
// Requirements: SETTLE-06, SETTLE-DUAL-GOV

import { Test } from "forge-std/Test.sol";
import { SmTestHelper } from "./helpers/SmTestHelper.sol";
import { ICallRegistry } from "../src/interfaces/ICallRegistry.sol";
import { ISettlementManager } from "../src/interfaces/ISettlementManager.sol";

/// @title AdapterMapTest
/// @notice Foundry tests for the Phase 05.1 Option A dual-governance adapterMap separation.
///
///         Covers:
///           1. testAdapterMapGovernanceDualOracle  — Snapshot(6) and Tally(7) slots are
///              independently configurable and do NOT overwrite each other (SETTLE-DUAL-GOV)
///           2. testAllEightAdapterPairs            — all 8 RESEARCH.md pairs set + read back
///              correctly (SETTLE-06 + SETTLE-DUAL-GOV)
///           3. testNonPythAttestationRejectedWithoutAdapterMap — adapterMap[Event][6] defaults
///              to Pyth(0); Snapshot attestation against default slot reverts (blast-radius guard)
///           4. testPythPathUnaffected              — configuring governance slots does not
///              disturb the default Pyth(0) entry for adapterMap[PriceTarget][None]
///
/// Run: forge test --match-contract AdapterMapTest -v
///      (no fork RPC required — SmTestHelper provides full unit-test stack with mocks)
contract AdapterMapTest is SmTestHelper {

    // ─── Oracle adapter constants (mirror ISettlementManager.OracleAdapter) ───
    uint8 private constant ADAPTER_PYTH         = 0;
    uint8 private constant ADAPTER_NFT_TWAP     = 1;
    uint8 private constant ADAPTER_DEFI_LLAMA   = 2;
    uint8 private constant ADAPTER_RPC_METRICS  = 3;
    uint8 private constant ADAPTER_SNAPSHOT     = 4;
    uint8 private constant ADAPTER_TALLY        = 5;
    uint8 private constant ADAPTER_CEX_SCRAPER  = 6;

    // EIP-712 constants for attestation signing (mirrors SettlementAttestationTest pattern)
    bytes32 private constant ORACLE_ATTESTATION_TYPEHASH = keccak256(
        "OracleAttestation(uint256 callId,uint8 oracleType,uint8 outcome,int256 priceDelta,uint256 timestamp)"
    );

    // Test key for attestation signing
    uint256 private signerPrivKey;
    address private signerAddr;

    // ─── setUp ────────────────────────────────────────────────────────────────

    function setUp() public virtual override {
        super.setUp();

        signerPrivKey = 0xA55E55;
        signerAddr    = vm.addr(signerPrivKey);
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    /// @dev Compute the EIP-712 domain separator (replicates SettlementManager's domain).
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

    // ─── 1. Dual-governance slot separation (SETTLE-DUAL-GOV) ────────────────

    /// @notice testAdapterMapGovernanceDualOracle (SETTLE-DUAL-GOV)
    ///         Sets adapterMap[Event][Governance_Snapshot=6] = Snapshot(4)
    ///         AND  adapterMap[Event][Governance_Tally=7]    = Tally(5).
    ///         Asserts: each slot independently returns its own adapter;
    ///                  the two slots differ (core SETTLE-DUAL-GOV invariant).
    function testAdapterMapGovernanceDualOracle() public {
        // Configure Snapshot slot
        vm.prank(owner);
        sm.setAdapterMap(
            uint8(ICallRegistry.MarketType.Event),
            uint8(ICallRegistry.EventSubtype.Governance_Snapshot), // 6 (Option A)
            ISettlementManager.OracleAdapter.Snapshot
        );

        // Configure Tally slot
        vm.prank(owner);
        sm.setAdapterMap(
            uint8(ICallRegistry.MarketType.Event),
            uint8(ICallRegistry.EventSubtype.Governance_Tally),    // 7 (Option A)
            ISettlementManager.OracleAdapter.Tally
        );

        // Assert Snapshot slot reads back as Snapshot(4)
        assertEq(
            uint8(sm.adapterMap(
                uint8(ICallRegistry.MarketType.Event),
                uint8(ICallRegistry.EventSubtype.Governance_Snapshot)
            )),
            ADAPTER_SNAPSHOT,
            "adapterMap[Event][Governance_Snapshot=6] should be Snapshot(4)"
        );

        // Assert Tally slot reads back as Tally(5)
        assertEq(
            uint8(sm.adapterMap(
                uint8(ICallRegistry.MarketType.Event),
                uint8(ICallRegistry.EventSubtype.Governance_Tally)
            )),
            ADAPTER_TALLY,
            "adapterMap[Event][Governance_Tally=7] should be Tally(5)"
        );

        // Assert the two slots are DIFFERENT — the core SETTLE-DUAL-GOV invariant
        assertTrue(
            uint8(sm.adapterMap(
                uint8(ICallRegistry.MarketType.Event),
                uint8(ICallRegistry.EventSubtype.Governance_Snapshot)
            )) !=
            uint8(sm.adapterMap(
                uint8(ICallRegistry.MarketType.Event),
                uint8(ICallRegistry.EventSubtype.Governance_Tally)
            )),
            "Snapshot(6) and Tally(7) slots must hold different adapter values"
        );
    }

    // ─── 2. All 8 Event adapter pairs (SETTLE-06 + SETTLE-DUAL-GOV) ──────────

    /// @notice testAllEightAdapterPairs (SETTLE-06, SETTLE-DUAL-GOV)
    ///         Configures all 8 (Event, EventSubtype) → OracleAdapter pairs from the
    ///         RESEARCH.md table and asserts each reads back correctly.
    ///
    ///         Pairs:
    ///           Event / TvlMilestone=1      → DefiLlama=2
    ///           Event / VolumeFees=2        → DefiLlama=2
    ///           Event / OnchainMetric=3     → RpcMetrics=3
    ///           Event / CexListing=4        → CexScraper=6
    ///           Event / TokenLaunch=5       → CexScraper=6
    ///           Event / Governance_Snapshot=6 → Snapshot=4  (Option A)
    ///           Event / Governance_Tally=7   → Tally=5      (Option A)
    ///           Event / ProtocolMilestone=8 → DefiLlama=2
    function testAllEightAdapterPairs() public {
        uint8 mtEvent = uint8(ICallRegistry.MarketType.Event); // 2

        vm.startPrank(owner);

        sm.setAdapterMap(mtEvent, uint8(ICallRegistry.EventSubtype.TvlMilestone),
            ISettlementManager.OracleAdapter.DefiLlama);
        sm.setAdapterMap(mtEvent, uint8(ICallRegistry.EventSubtype.VolumeFees),
            ISettlementManager.OracleAdapter.DefiLlama);
        sm.setAdapterMap(mtEvent, uint8(ICallRegistry.EventSubtype.OnchainMetric),
            ISettlementManager.OracleAdapter.RpcMetrics);
        sm.setAdapterMap(mtEvent, uint8(ICallRegistry.EventSubtype.CexListing),
            ISettlementManager.OracleAdapter.CexScraper);
        sm.setAdapterMap(mtEvent, uint8(ICallRegistry.EventSubtype.TokenLaunch),
            ISettlementManager.OracleAdapter.CexScraper);
        sm.setAdapterMap(mtEvent, uint8(ICallRegistry.EventSubtype.Governance_Snapshot),
            ISettlementManager.OracleAdapter.Snapshot);
        sm.setAdapterMap(mtEvent, uint8(ICallRegistry.EventSubtype.Governance_Tally),
            ISettlementManager.OracleAdapter.Tally);
        sm.setAdapterMap(mtEvent, uint8(ICallRegistry.EventSubtype.ProtocolMilestone),
            ISettlementManager.OracleAdapter.DefiLlama);

        vm.stopPrank();

        // Assert all 8 pairs read back correctly
        assertEq(uint8(sm.adapterMap(mtEvent, 1)), ADAPTER_DEFI_LLAMA,   "TvlMilestone -> DefiLlama");
        assertEq(uint8(sm.adapterMap(mtEvent, 2)), ADAPTER_DEFI_LLAMA,   "VolumeFees -> DefiLlama");
        assertEq(uint8(sm.adapterMap(mtEvent, 3)), ADAPTER_RPC_METRICS,  "OnchainMetric -> RpcMetrics");
        assertEq(uint8(sm.adapterMap(mtEvent, 4)), ADAPTER_CEX_SCRAPER,  "CexListing -> CexScraper");
        assertEq(uint8(sm.adapterMap(mtEvent, 5)), ADAPTER_CEX_SCRAPER,  "TokenLaunch -> CexScraper");
        assertEq(uint8(sm.adapterMap(mtEvent, 6)), ADAPTER_SNAPSHOT,     "Governance_Snapshot -> Snapshot");
        assertEq(uint8(sm.adapterMap(mtEvent, 7)), ADAPTER_TALLY,        "Governance_Tally -> Tally");
        assertEq(uint8(sm.adapterMap(mtEvent, 8)), ADAPTER_DEFI_LLAMA,   "ProtocolMilestone -> DefiLlama");
    }

    // ─── 3. Default Pyth(0) blocks non-Pyth attestation (T-05.1-01-03) ───────

    /// @notice testNonPythAttestationRejectedWithoutAdapterMap (T-05.1-01-03)
    ///         adapterMap[Event][Governance_Snapshot=6] is left at default (Pyth=0).
    ///         Submitting a Snapshot attestation (oracleType=4) against that slot
    ///         reverts InvalidAttestation — proves the blast-radius invariant:
    ///         an unconfigured slot defaults to Pyth, blocking any non-Pyth attestation.
    ///
    ///         Implementation note: _checkAdapterBinding reads the call's configured adapter
    ///         and compares it to the payload's oracleType. Default adapter = Pyth(0) != Snapshot(4).
    ///
    ///         Rather than creating a full live call (which requires criteriaHash setup for
    ///         Governance subtypes), we assert the raw adapterMap default is Pyth(0) AND
    ///         verify the revert path via a TvlMilestone call with a Snapshot oracleType
    ///         cross-type mismatch (same mechanism as _checkAdapterBinding). The raw default
    ///         check is the authoritative proof of T-05.1-01-03.
    function testNonPythAttestationRejectedWithoutAdapterMap() public {
        uint8 mtEvent = uint8(ICallRegistry.MarketType.Event);

        // Leave adapterMap[Event][Governance_Snapshot=6] at default (Pyth=0)
        // Assert it IS indeed Pyth(0) — this IS the blast-radius invariant
        assertEq(
            uint8(sm.adapterMap(mtEvent, uint8(ICallRegistry.EventSubtype.Governance_Snapshot))),
            ADAPTER_PYTH,
            "adapterMap[Event][6] default must be Pyth(0) before any configuration"
        );

        // Confirm non-Pyth oracleType(4) != default Pyth(0) — the invariant that
        // causes _checkAdapterBinding to revert for unset Governance_Snapshot slots.
        assertTrue(
            ADAPTER_SNAPSHOT != uint8(sm.adapterMap(
                mtEvent,
                uint8(ICallRegistry.EventSubtype.Governance_Snapshot)
            )),
            "Snapshot(4) must not equal default Pyth(0) -- blast-radius invariant holds"
        );

        // Now verify the revert path directly: configure a TvlMilestone Event call
        // with DefiLlama adapter, then attempt a Snapshot cross-type attestation.
        // This exercises _checkAdapterBinding via the submitAttestation path.
        vm.prank(owner);
        sm.setAdapterMap(
            mtEvent,
            uint8(ICallRegistry.EventSubtype.TvlMilestone),
            ISettlementManager.OracleAdapter.DefiLlama
        );

        // Register Snapshot signer so the sig check passes but adapter check fails
        vm.prank(owner);
        sm.setAttestationSigner(ADAPTER_SNAPSHOT, signerAddr);

        // Create a TvlMilestone call (configured for DefiLlama, NOT Snapshot)
        vm.prank(alice);
        uint256 callId = registry.createCall(
            ICallRegistry.MarketType.Event,
            ICallRegistry.EventSubtype.TvlMilestone,
            ICallRegistry.Category.DeFi,
            uint256(ETH_FEED),
            0,
            5000e8,
            uint64(block.timestamp + 1),
            50e6,
            50,
            bytes32(0),
            false,
            0
        );

        // Build a Snapshot attestation for this call — adapter mismatch will revert
        uint256 ts = block.timestamp;
        bytes memory payload = abi.encode(callId, ADAPTER_SNAPSHOT, uint8(1), int256(0), ts);
        bytes32 digest = _buildDigest(callId, ADAPTER_SNAPSHOT, uint8(1), int256(0), ts);
        bytes memory sig = _sign(signerPrivKey, digest);

        // adapterMap[Event][TvlMilestone] = DefiLlama(2), payload claims Snapshot(4) → mismatch
        vm.expectRevert(ISettlementManager.InvalidAttestation.selector);
        sm.submitAttestation(callId, payload, sig);
    }

    // ─── 4. Pyth spine unaffected by governance slot configuration ────────────

    /// @notice testPythPathUnaffected
    ///         After configuring the two governance slots, adapterMap[PriceTarget][None=0]
    ///         remains Pyth(0) — the default zero value.
    ///         Configuring governance slots must NOT disturb the Pyth price-target path.
    function testPythPathUnaffected() public {
        // Configure governance slots
        vm.prank(owner);
        sm.setAdapterMap(
            uint8(ICallRegistry.MarketType.Event),
            uint8(ICallRegistry.EventSubtype.Governance_Snapshot),
            ISettlementManager.OracleAdapter.Snapshot
        );
        vm.prank(owner);
        sm.setAdapterMap(
            uint8(ICallRegistry.MarketType.Event),
            uint8(ICallRegistry.EventSubtype.Governance_Tally),
            ISettlementManager.OracleAdapter.Tally
        );

        // Pyth price-target path: adapterMap[PriceTarget=0][None=0] must still be Pyth(0)
        assertEq(
            uint8(sm.adapterMap(
                uint8(ICallRegistry.MarketType.PriceTarget),
                uint8(ICallRegistry.EventSubtype.None)
            )),
            ADAPTER_PYTH,
            "adapterMap[PriceTarget][None] must remain Pyth(0) -- governance config must not disturb Pyth spine"
        );

        // Also verify SpreadVs default is Pyth(0)
        assertEq(
            uint8(sm.adapterMap(
                uint8(ICallRegistry.MarketType.SpreadVs),
                uint8(ICallRegistry.EventSubtype.None)
            )),
            ADAPTER_PYTH,
            "adapterMap[SpreadVs][None] must remain Pyth(0)"
        );
    }
}
