// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack -- Pinned Versions"
// Spec: CALL_IT_SPEC1.md ss12.4 -- SettlementManager function signatures (LOCKED)
// Requirement: SETTLE-01..52, REP-03..27, SAFETY-57
//
// ACCEPT-CHALLENGE IDs NOTE (SETTLE-43):
//   settle() third param acceptedChallengeIds is an off-chain relayer-supplied list from the
//   subgraph. Each ID is validated on-chain via IChallengeEscrow.getChallenge().
//   CallRegistry and ChallengeEscrow are UNCHANGED (no enumerator added to either contract).
//
// +---------------------------------------------------------------------------+
// |  LOCKED -- DO NOT MODIFY AFTER PLAN 04-02 COMMIT.                        |
// |  Downstream plans (04-03 deploy, 04-04 oracle adapters, subgraph ABI,    |
// |  relayer ABI) import types from this file. Any modification breaks all   |
// |  downstream. See T-04-02-01..09 threat register.                         |
// +---------------------------------------------------------------------------+

interface ISettlementManager {
    // ---- Enums ---------------------------------------------------------------

    /// @notice Oracle adapter type for settlement dispatch. SETTLE-06.
    enum OracleAdapter {
        Pyth,       // 0 -- PriceTarget + SpreadVs (on-chain pull VAA)
        NftTwap,    // 1 -- NFT floor 24h TWAP via Alchemy (relayer-attested)
        DefiLlama,  // 2 -- TVL/volume/fees/APRs via DefiLlama API (relayer-attested)
        RpcMetrics, // 3 -- on-chain metrics + liquidation events (relayer-attested)
        Snapshot,   // 4 -- governance proposal state via Snapshot (relayer-attested)
        Tally,      // 5 -- on-chain governance via Tally (relayer-attested)
        CexScraper  // 6 -- CEX listing events via Playwright scrapers (relayer-attested)
    }

    /// @notice Dispute lifecycle status. SETTLE-25.
    enum DisputeStatus { Open, Resolved }

    // ---- Structs -------------------------------------------------------------

    /// @notice On-chain dispute record. Dispute status lives in SettlementManager.disputes
    ///         mapping ONLY -- CallRegistry is UNCHANGED (no markDisputed function).
    ///         The subgraph reads DisputeRaised events to update Call.status='Disputed'.
    struct DisputeRecord {
        address disputer;           // initial disputer
        bytes32 evidenceHash;       // IPFS evidence hash
        uint256 bondAmount;         // USDC bond held in SM
        uint256 windowCloseAt;      // block.timestamp + 24h
        DisputeStatus status;       // Open or Resolved
        uint8 counterClaimCount;    // increments on each counterClaim(); max 3
        address[] counterClaimers;  // ordered list of counter-claimers
    }

    // ---- Events --------------------------------------------------------------

    /// @notice Settlement completed successfully. SETTLE-01.
    /// @param callId  The settled call ID.
    /// @param outcome ICallRegistry.Outcome enum value (1=CallerWon, 2=CallerLost).
    /// @param priceDelta Price difference vs target; 0 for non-Pyth adapters.
    event CallSettled(
        uint256 indexed callId,
        uint8           outcome,
        int256          priceDelta
    );

    /// @notice Dispute raised after settlement. SETTLE-25.
    event DisputeRaised(
        uint256 indexed callId,
        address indexed disputer,
        bytes32         evidenceHash
    );

    /// @notice Owner resolved a dispute -- may have reversed outcome. SETTLE-34.
    event DisputeResolved(
        uint256 indexed callId,
        uint8           finalOutcome,
        address indexed resolver
    );

    /// @notice Owner triggered forceSettle after 7-day cooldown. SETTLE-39/40.
    event CallForceSettled(
        uint256 indexed callId,
        uint8           outcome
    );

    /// @notice Pyth confidence wide (or other adapter ambiguous) -- settlement deferred.
    ///         settle() returns without reverting; call stays Live. SETTLE-09.
    event SettlementDelayed(
        uint256 indexed callId,
        string          reason,
        uint256         retryAt
    );

    /// @notice Reputation delta computed on-chain. REP-25.
    event RepCalculated(
        uint256 indexed callId,
        address indexed caller,
        uint128         currentRep,
        uint8           conviction,
        uint8           consensusPct,
        bool            isWinner,
        uint256         baseValue,
        int256          delta
    );

    /// @notice Stylus engine reverted -- Solidity baseline fired. REP-22/23.
    event RepCalculatedFallback(
        uint256 indexed callId,
        address indexed caller,
        int256          baselineDelta,
        bytes           lowLevelError
    );

    // ---- Errors --------------------------------------------------------------

    /// @notice settle() called on a call that is not Live (already settled / exited).
    error AlreadySettled();

    /// @notice settle() called before call.expiry. SETTLE-03.
    error CallNotExpired();

    /// @notice settle() called while contract is paused (whenNotPaused). SETTLE-04.
    error CallNotLive();

    /// @notice raiseDispute() called after the 24h dispute window closed. SETTLE-29.
    error DisputeWindowClosed();

    /// @notice raiseDispute() called when a dispute is already open for this call.
    error DisputeAlreadyRaised();

    /// @notice counterClaim() called when MAX_COUNTER_CLAIMS (3) already reached. SETTLE-30.
    error MaxCounterClaimsReached();

    /// @notice forceSettle() called before expiry + 7 days. SETTLE-39.
    error ForceSettleCooldownActive();

    /// @notice SettlementManager ETH balance < Pyth update fee. Pitfall 4.
    error InsufficientEthForPythFee();

    /// @notice Submitted attestation signature does not match expected signer. Pitfall 7.
    error InvalidAttestation();

    /// @notice Caller is not the SettlementManager (used in other contracts).
    error NotSettlementManager();

    /// @notice raiseDispute() USDC allowance/balance insufficient for bond. SETTLE-26.
    error DisputeBondInsufficient();

    /// @notice settle() duel loop: supplied challengeId.callId != settling callId. SETTLE-43.
    error InvalidChallengeForCall();

    /// @notice settle() duel loop: supplied challengeId.status != Accepted. SETTLE-43.
    error ChallengeNotAccepted();

    /// @notice settle() called on call with non-PriceTarget market -- Pyth N/A.
    error InvalidChallengeId();

    // ---- Functions -----------------------------------------------------------

    /// @notice Atomic 14-step settlement. Permissionless. Idempotent (reverts AlreadySettled
    ///         on repeat). Non-reverting on ambiguous oracle (emits SettlementDelayed).
    ///         Guarded: whenNotPaused.
    ///
    /// @param callId              The call to settle.
    /// @param pythUpdateData      Pyth VAA bytes[] from Hermes (empty for non-Pyth adapters).
    /// @param acceptedChallengeIds Off-chain relayer-supplied list of accepted challenge IDs.
    ///                            Each entry validated on-chain via IChallengeEscrow.getChallenge():
    ///                            challenge.callId must equal callId AND status must be Accepted.
    ///                            CallRegistry and ChallengeEscrow are UNCHANGED (no enumerator
    ///                            added to either contract).
    function settle(
        uint256            callId,
        bytes[] calldata   pythUpdateData,
        uint256[] calldata acceptedChallengeIds
    ) external;

    /// @notice Emergency settle after expiry + FORCE_SETTLE_COOLDOWN (7 days). onlyOwner.
    ///         Emits both CallForceSettled and CallSettled (SETTLE-40 dual-event audit trail).
    function forceSettle(uint256 callId) external;

    /// @notice Raise a dispute within 24h of settlement. Posts $5 USDC bond. SETTLE-25.
    ///         Dispute status stored ONLY in SettlementManager.disputes[callId] --
    ///         CallRegistry has NO markDisputed function and MUST NOT be called for disputes.
    function raiseDispute(uint256 callId, bytes32 evidenceHash) external;

    /// @notice Add a counter-claim to an open dispute. Max 3. SETTLE-30.
    function counterClaim(uint256 callId, bytes32 evidenceHash) external;

    /// @notice Owner resolves an open dispute. May reverse outcome. SETTLE-34.
    ///         On reversal: redistributes unclaimed USDC; reverses rep deltas; re-settles CR.
    function resolveDispute(uint256 callId, uint8 finalOutcome) external;

    /// @notice Owner-only: set the oracle adapter for a (marketType, eventSubtype) pair.
    function setAdapterMap(uint8 marketType, uint8 eventSubtype, OracleAdapter adapter) external;

    /// @notice Accept ETH top-ups for the Pyth update fee budget. Pitfall 4.
    receive() external payable;
}
