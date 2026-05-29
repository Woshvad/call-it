// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions"
// Spec: CALL_IT_SPEC1.md §12.5 — ProfileRegistry function signatures + events + reverts
// Requirement: AUTH-39, AUTH-40, AUTH-41, AUTH-42, REP-01, REP-02, REP-17, REP-18

/// @title IProfileRegistry
/// @notice Public interface for the ProfileRegistry contract.
///         Consumed by CallRegistry (Gate 6.3 — settledCalls read) and frontend wagmi hooks.
///
///         The ProfileRegistry is NON-UPGRADEABLE (SAFETY-18, D-14).
///         Owner rotation is via onlyOwner setters (setSettlementManager, setRelayer).
interface IProfileRegistry {
    // ─── Events ───────────────────────────────────────────────────────────────

    /// @notice Emitted when a user's profile counters are updated after settlement.
    event ProfileUpdated(address indexed user, uint32 totalCalls, uint16 settledCalls);

    /// @notice Emitted when a user sets or updates their display handle.
    event HandleSet(address indexed user, string handle);

    /// @notice Emitted when owner rotates the settlementManager role.
    event SettlementManagerSet(address indexed newManager);

    /// @notice Emitted when owner rotates the relayer role.
    event RelayerSet(address indexed newRelayer);

    /// @notice Emitted when a rep writer is authorized or revoked. D-04.
    event RepWriterSet(address indexed writer, bool authorized);

    /// @notice Emitted when applyRepDelta modifies a user's globalRep. D-05.
    event RepDeltaApplied(address indexed user, int256 delta, uint128 newRep);

    /// @notice Emitted when the relayer links a social identity for a user.
    /// @param kind 0 = Twitter, 1 = Farcaster
    event SocialLinked(address indexed user, uint8 kind, string handle, bytes32 proofHash);

    /// @notice Emitted when a user unlinks their own social identity.
    /// @param kind 0 = Twitter, 1 = Farcaster
    event SocialUnlinked(address indexed user, uint8 kind);

    // ─── Errors ───────────────────────────────────────────────────────────────

    /// @notice Reverts when bytes(handle).length > MAX_HANDLE_LENGTH (50). AUTH-42.
    error HandleTooLong();

    /// @notice Reverts when msg.sender != settlementManager on restricted calls.
    error NotSettlementManager();

    /// @notice Reverts when msg.sender != relayer on social-link calls.
    error NotRelayer();

    /// @notice Reverts when msg.sender is not in authorizedRepWriters. D-04.
    error NotAuthorizedWriter();

    // ─── View functions ───────────────────────────────────────────────────────

    /// @notice Returns the number of settled calls for a user.
    ///         Returns 0 for uninitialized users.
    ///         Read by CallRegistry Gate 6.3 (high-conviction floor).
    /// @param user The address to query
    /// @return The count of settled calls
    function settledCalls(address user) external view returns (uint16);

    // ─── Mutation functions ───────────────────────────────────────────────────

    /// @notice Called by SettlementManager after a call is settled.
    ///         Phase 1 body is a no-op skeleton; full implementation in Phase 4.
    ///         Reverts NotSettlementManager if msg.sender != settlementManager.
    function updateAfterSettlement(address user, bool isWinner, uint8 category) external;

    /// @notice Owner-only: rotate the settlementManager address. AUTH-39.
    function setSettlementManager(address newManager) external;

    /// @notice Owner-only: rotate the relayer address. AUTH-40.
    function setRelayer(address newRelayer) external;

    /// @notice Set or update the caller's display handle (AUTH-35).
    ///         Empty string is valid. Reverts HandleTooLong if bytes(handle).length > 50.
    ///         Lazily initializes the profile to globalRep=100 on first touch (REP-01).
    function setDisplayHandle(string calldata handle) external;

    /// @notice Relayer-only: link a Twitter identity to a user's profile.
    ///         Reverts NotRelayer if msg.sender != relayer. Phase 1.5 wires the relayer.
    function linkTwitter(address user, string calldata handle, bytes32 proofHash) external;

    /// @notice Relayer-only: link a Farcaster identity to a user's profile.
    ///         Reverts NotRelayer if msg.sender != relayer. Phase 1.5 wires the relayer.
    function linkFarcaster(address user, string calldata handle, bytes32 proofHash) external;

    /// @notice User-callable: remove the caller's own Twitter social link. AUTH-41.
    ///         Zeroes twitterHandle and twitterProofHash. Emits SocialUnlinked(msg.sender, 0).
    function unlinkTwitter() external;

    /// @notice User-callable: remove the caller's own Farcaster social link. AUTH-41.
    ///         Zeroes farcasterHandle and farcasterProofHash. Emits SocialUnlinked(msg.sender, 1).
    function unlinkFarcaster() external;

    /// @notice Authorized rep writers only: apply a signed integer delta to globalRep. D-05.
    ///         Floor at 0 (REP-02). Reverts NotAuthorizedWriter if not authorized.
    function applyRepDelta(address user, int256 delta) external;

    /// @notice Owner-only: authorize or revoke a rep writer address. D-04.
    function setAuthorizedRepWriter(address writer, bool authorized) external;
}
