// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions" + "Pinned Addresses"
// Spec: CALL_IT_SPEC1.md §11.5, §12.5 — ProfileRegistry responsibilities + storage shape
// Requirement: AUTH-39, AUTH-40, AUTH-41, AUTH-42, REP-01, REP-02, REP-17, REP-18, SAFETY-18
//
// NON-UPGRADEABLE BY DESIGN (D-14, SAFETY-18):
// This contract has NO proxy, NO UUPS, NO TransparentUpgradeableProxy, NO initialize().
// Role rotation is via onlyOwner setters. Schema changes require a V2 deploy.
// If you see proxy/upgradeability code appear here, that is a bug — REMOVE IT.
//
// SLOT STABILITY CONTRACT:
// The Profile struct layout is reserved for Phase 4/5 extension.
// NEVER reorder or remove existing fields. Only append after challengerRep.
// See RESEARCH.md Pattern 8 for the reasoning.

import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { IProfileRegistry } from "./interfaces/IProfileRegistry.sol";

/// @title ProfileRegistry
/// @notice Stores user reputation, display handles, and social identity slots.
///
///         Phase 1 ships storage + handle + social setters + lazy-init at 100 rep (REP-01).
///         Phase 4 wires updateAfterSettlement with actual rep math.
///         Phase 5 (Stylus) upgrades the rep scoring engine behind the same proxy slot.
///
///         NON-UPGRADEABLE: No proxy. Owner rotation via setSettlementManager / setRelayer.
///
/// @dev Inherits Ownable2Step (two-step ownership transfer; acceptOwnership pattern).
///      Ownable2Step is safer than Ownable for single-owner-key v1 (SAFETY-18 / D-14).
contract ProfileRegistry is Ownable2Step, IProfileRegistry {
    // ─── Constants ─────────────────────────────────────────────────────────────

    /// @notice Maximum display handle byte length (AUTH-42).
    ///         Enforced in setDisplayHandle and social link setters.
    uint8 public constant MAX_HANDLE_LENGTH = 50;

    // ─── Storage structs ───────────────────────────────────────────────────────

    /// @notice Per-user reputation and activity counters.
    ///
    ///         SLOT STABILITY CONTRACT — never reorder or remove fields.
    ///         Only append new fields after challengerRep for Phase 4/5.
    ///
    ///         Slot 1 (32 bytes):
    ///           globalRep(128) + lastActiveAt(64) + totalCalls(32) + settledCalls(16) = 240 bits
    ///         Slot 2 (32 bytes):
    ///           wins(32) + losses(32) + streak(32) + categoryRep_Majors(32) +
    ///           categoryRep_DeFi(32) + categoryRep_Other(32) + callerRep(32) + challengerRep(32)
    ///           = 256 bits exactly
    struct Profile {
        // slot 1
        uint128 globalRep;          // Phase 5 Stylus math: int32 score stored as uint128; floor=0
        uint64  lastActiveAt;
        uint32  totalCalls;
        uint16  settledCalls;       // read by CallRegistry Gate 6.3; max 65k calls per user

        // slot 2
        uint32  wins;
        uint32  losses;
        uint32  streak;
        uint32  categoryRep_Majors;
        uint32  categoryRep_DeFi;
        uint32  categoryRep_Other;
        uint32  callerRep;
        uint32  challengerRep;
        // Phase 4/5: append here — do not insert above
    }

    /// @notice Social identity proof hashes and linked handles.
    ///         Set by relayer (linkTwitter/linkFarcaster); unset by user (unlink*).
    struct SocialIdentity {
        bytes32 twitterProofHash;
        bytes32 farcasterProofHash;
        uint64  twitterLinkedAt;
        uint64  farcasterLinkedAt;
        string  twitterHandle;      // ≤50 bytes enforced at link time
        string  farcasterHandle;    // ≤50 bytes enforced at link time
    }

    // ─── State ─────────────────────────────────────────────────────────────────

    /// @notice Stores Profile structs keyed by user address.
    mapping(address => Profile) internal _profiles;

    /// @notice Public display handle; can differ from social handles. AUTH-35 / D-11.
    mapping(address => string) public displayHandle;

    /// @notice Social identity proofs and handles.
    mapping(address => SocialIdentity) internal _socials;

    /// @notice True once a user's profile has been lazily initialized. REP-01.
    mapping(address => bool) public profileExists;

    /// @notice Address authorized to call updateAfterSettlement. AUTH-39.
    ///         Set to address(0) at deploy; updated by owner before Phase 4 settlement wiring.
    address public settlementManager;

    /// @notice Address authorized to call linkTwitter / linkFarcaster. AUTH-40.
    ///         Set to address(0) at deploy; updated by owner before Phase 1.5 social linking.
    address public relayer;

    /// @notice Generic authorized rep-writers set. D-04.
    ///         FollowFadeMarket authorized at Phase 2 deploy.
    ///         SettlementManager authorized in Phase 4 — no third redeploy needed.
    mapping(address => bool) public authorizedRepWriters;

    // ─── Constructor ───────────────────────────────────────────────────────────

    /// @notice Deploys a non-upgradeable ProfileRegistry owned by msg.sender.
    ///         settlementManager and relayer are address(0) at deploy — owner rotates them
    ///         via setSettlementManager and setRelayer before Phase 4 / Phase 1.5 wiring.
    constructor() Ownable(msg.sender) {}

    // ─── Owner-only role setters ────────────────────────────────────────────────

    /// @inheritdoc IProfileRegistry
    function setSettlementManager(address newManager) external onlyOwner {
        settlementManager = newManager;
        emit SettlementManagerSet(newManager);
    }

    /// @inheritdoc IProfileRegistry
    function setRelayer(address newRelayer) external onlyOwner {
        relayer = newRelayer;
        emit RelayerSet(newRelayer);
    }

    /// @inheritdoc IProfileRegistry
    function setAuthorizedRepWriter(address writer, bool authorized) external onlyOwner {
        authorizedRepWriters[writer] = authorized;
        emit RepWriterSet(writer, authorized);
    }

    // ─── View functions ─────────────────────────────────────────────────────────

    /// @inheritdoc IProfileRegistry
    /// @dev Returns 0 for uninitialized users (profile not yet created).
    function settledCalls(address user) external view returns (uint16) {
        return _profiles[user].settledCalls;
    }

    /// @notice Returns the full Profile struct for a user.
    ///         Returns a zero-initialized struct for uninitialized users.
    function getProfile(address user) external view returns (Profile memory) {
        return _profiles[user];
    }

    // ─── User-callable mutations ─────────────────────────────────────────────

    /// @inheritdoc IProfileRegistry
    function setDisplayHandle(string calldata handle) external {
        if (bytes(handle).length > MAX_HANDLE_LENGTH) revert HandleTooLong();
        _initIfNeeded(msg.sender);
        displayHandle[msg.sender] = handle;
        emit HandleSet(msg.sender, handle);
    }

    /// @inheritdoc IProfileRegistry
    /// @dev AUTH-41: user unlinks their own Twitter. No auth check beyond msg.sender == user.
    function unlinkTwitter() external {
        delete _socials[msg.sender].twitterHandle;
        delete _socials[msg.sender].twitterProofHash;
        delete _socials[msg.sender].twitterLinkedAt;
        emit SocialUnlinked(msg.sender, 0);
    }

    /// @inheritdoc IProfileRegistry
    /// @dev AUTH-41: user unlinks their own Farcaster. No auth check beyond msg.sender == user.
    function unlinkFarcaster() external {
        delete _socials[msg.sender].farcasterHandle;
        delete _socials[msg.sender].farcasterProofHash;
        delete _socials[msg.sender].farcasterLinkedAt;
        emit SocialUnlinked(msg.sender, 1);
    }

    // ─── Relayer-only mutations ────────────────────────────────────────────────

    /// @inheritdoc IProfileRegistry
    function linkTwitter(
        address user,
        string calldata handle,
        bytes32 proofHash
    ) external {
        if (msg.sender != relayer) revert NotRelayer();
        if (bytes(handle).length > MAX_HANDLE_LENGTH) revert HandleTooLong();
        _initIfNeeded(user);
        _socials[user].twitterHandle = handle;
        _socials[user].twitterProofHash = proofHash;
        _socials[user].twitterLinkedAt = uint64(block.timestamp);
        emit SocialLinked(user, 0, handle, proofHash);
    }

    /// @inheritdoc IProfileRegistry
    function linkFarcaster(
        address user,
        string calldata handle,
        bytes32 proofHash
    ) external {
        if (msg.sender != relayer) revert NotRelayer();
        if (bytes(handle).length > MAX_HANDLE_LENGTH) revert HandleTooLong();
        _initIfNeeded(user);
        _socials[user].farcasterHandle = handle;
        _socials[user].farcasterProofHash = proofHash;
        _socials[user].farcasterLinkedAt = uint64(block.timestamp);
        emit SocialLinked(user, 1, handle, proofHash);
    }

    // ─── SettlementManager-only mutations ────────────────────────────────────

    /// @inheritdoc IProfileRegistry
    /// @dev Phase 2: auth guard updated to use authorizedRepWriters (D-04).
    ///      Phase 4 wires actual rep delta math here.
    function updateAfterSettlement(address user, bool /*isWinner*/, uint8 /*category*/) external {
        if (!authorizedRepWriters[msg.sender]) revert NotAuthorizedWriter();
        // Phase 4 will implement full logic:
        // _profiles[user].settledCalls += 1;
        // if (isWinner) _profiles[user].wins += 1; else _profiles[user].losses += 1;
        // Phase 5 Stylus engine computes globalRep delta.
        emit ProfileUpdated(user, _profiles[user].totalCalls, _profiles[user].settledCalls);
    }

    /// @inheritdoc IProfileRegistry
    /// @dev D-05: apply a signed rep delta to globalRep, floor at 0 (REP-02).
    ///      Lazily initializes the profile if not yet created.
    function applyRepDelta(address user, int256 delta) external {
        if (!authorizedRepWriters[msg.sender]) revert NotAuthorizedWriter();
        _initIfNeeded(user);
        int256 current = int256(uint256(_profiles[user].globalRep));
        int256 newRep = current + delta;
        // REP-02: floor at 0.
        if (newRep < 0) newRep = 0;
        // WR-08: explicit upper clamp so a future positive-delta writer cannot
        // silently truncate via the uint128 cast and corrupt the reputation score.
        int256 maxRep = int256(uint256(type(uint128).max));
        if (newRep > maxRep) newRep = maxRep;
        _profiles[user].globalRep = uint128(uint256(newRep));
        emit RepDeltaApplied(user, delta, _profiles[user].globalRep);
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    /// @notice Lazily initialize a user's profile on first interaction. REP-01.
    ///         Sets globalRep = 100, profileExists = true.
    ///         Safe to call multiple times — subsequent calls are no-ops.
    function _initIfNeeded(address user) internal {
        if (!profileExists[user]) {
            _profiles[user].globalRep = 100; // REP-01: new users start at 100 rep
            profileExists[user] = true;
        }
    }
}
