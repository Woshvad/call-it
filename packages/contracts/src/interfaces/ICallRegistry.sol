// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions"
// Spec: CALL_IT_SPEC1.md §11.1, §12.1 — CallRegistry responsibilities + function signatures
// Requirement: CALL-01..70, SAFETY-01/04..11/14/18

/// @title ICallRegistry
/// @notice Public interface for the CallRegistry contract.
///         Declares all enums, events, errors, and function signatures.
///         Consumed by the frontend wagmi hooks and the relayer preflight endpoint.
interface ICallRegistry {
    // ─── Enums ────────────────────────────────────────────────────────────────

    /// @notice Call market type. CALL-01/02/03.
    enum MarketType {
        PriceTarget, // 0 — price target (most common)
        SpreadVs,    // 1 — relative outperformance vs another asset
        Event        // 2 — binary event outcome
    }

    /// @notice Event subtype for Event calls. CALL-03/15/16.
    enum EventSubtype {
        None,             // 0 — no subtype (used for PriceTarget/SpreadVs)
        TvlMilestone,     // 1 — TVL threshold event
        VolumeFees,       // 2 — volume/fees threshold event
        OnchainMetric,    // 3 — generic on-chain metric event
        CexListing,       // 4 — CEX listing event (requires criteriaHash)
        TokenLaunch,      // 5 — token launch event (requires criteriaHash)
        Governance,       // 6 — governance vote outcome (requires criteriaHash)
        ProtocolMilestone // 7 — protocol milestone event (requires criteriaHash)
    }

    /// @notice Call status lifecycle.
    enum CallStatus {
        Live,         // 0 — active, accepting follows/fades
        Settled,      // 1 — settled by SettlementManager
        Disputed,     // 2 — under dispute resolution (Phase 4)
        CallerExited  // 3 — caller exited early (Phase 2)
    }

    /// @notice Call category for reputation routing. CALL-62/63, REP-28/29.
    enum Category {
        Majors, // 0 — major crypto assets (BTC, ETH, etc.) + NFT collections
        DeFi,   // 1 — DeFi protocols and tokens
        Other   // 2 — everything else (events, small caps, etc.)
    }

    // ─── Events ───────────────────────────────────────────────────────────────

    /// @notice Emitted on every successful createCall. CALL-69.
    event CallCreated(uint256 indexed id, address indexed caller, MarketType marketType, uint96 stake);

    /// @notice Emitted when a call is created with parentCallId != 0. CALL-70 / CALL-57..61.
    event CallQuoted(uint256 indexed parentId, uint256 indexed quoteId);

    /// @notice Emitted when conviction is auto-capped (does NOT revert). CALL-30/31.
    event ConvictionCapped(address indexed caller, uint8 requested, uint8 applied);

    /// @notice Emitted when owner adds an asset to the allowlist. CALL-06/10.
    event AssetAllowlisted(string symbol, bytes32 feedId);

    /// @notice Emitted when owner adds an NFT collection to the allowlist. CALL-07/11.
    event NftCollectionAllowlisted(address indexed collection);

    /// @notice Emitted when owner updates the TVL cap. CALL-34.
    event TvlCapSet(uint256 newCap);

    /// @notice Emitted when owner rotates the settlementManager address.
    event SettlementManagerSet(address indexed newManager);

    /// @notice Emitted when owner sets the FollowFadeMarket address. D-02.
    event FollowFadeMarketSet(address indexed newMarket);

    // ─── Custom errors ────────────────────────────────────────────────────────

    /// @notice Gate 6.1: stake < MIN_STAKE ($5 USDC). CALL-20.
    error StakeBelowMinimum();

    /// @notice Gate 6.1: stake > MAX_STAKE ($100 USDC). CALL-21.
    error StakeAboveMaximum();

    /// @notice CALL-32: expiry <= block.timestamp.
    error ExpiryNotInFuture();

    /// @notice CALL-33: category enum value >= CATEGORY_COUNT (3).
    error CategoryInvalid();

    /// @notice CALL-13: asset not in the allowlist.
    error AssetNotAllowlisted();

    /// @notice CALL-15/16: criteriaHash required for certain event subtypes but is bytes32(0).
    error CriteriaRequired(MarketType marketType, EventSubtype subtype);

    /// @notice Gate 6.2: duplicate call exists in the same UTC day bucket. CALL-22/23/24.
    error DuplicateCall(uint256 existingCallId);

    /// @notice CALL-34: stake + fee would push currentTvl past tvlCap.
    error TvlCapReached(uint256 requested, uint256 available);

    /// @notice CALL-35: USDC allowance < stake + fee.
    error InsufficientUsdcAllowance(uint256 needed, uint256 actual);

    /// @notice CALL-36: USDC balance < stake + fee.
    error InsufficientUsdcBalance(uint256 needed, uint256 actual);

    /// @notice Thrown if tvlCap set above MAX_ALLOWED_CAP ($100K).
    error CapTooHigh();

    /// @notice Thrown if a restricted function is called by non-settlementManager.
    error NotSettlementManager();

    /// @notice Thrown if a restricted function is called by an unauthorized address. D-02.
    error NotAuthorized();

    // ─── Call struct (returned by getCall) ───────────────────────────────────

    /// @notice Full call data structure returned by getCall(). CALL-67.
    struct Call {
        // slot 1
        address caller;           // 20 bytes
        uint96  stake;            // 12 bytes

        // slot 2
        uint96  virtualFadeSeed;  // 12 bytes
        uint64  createdAt;        // 8 bytes
        uint64  expiry;           // 8 bytes
        MarketType   marketType;  // 1 byte
        EventSubtype eventSubtype;// 1 byte
        Category     category;    // 1 byte
        CallStatus   status;      // 1 byte
        uint8   conviction;       // 1 byte (1–100)
        bool    openToChallenges; // 1 byte

        // slot 3+
        bytes32 duplicateHash;
        bytes32 criteriaHash;     // bytes32(0) if no criteria

        uint256 assetA;           // Pyth feed key (coin) or address(uint160) (NFT)
        uint256 assetB;           // 0 for single-asset; secondary asset for SpreadVs
        uint256 targetValue;
        uint256 parentCallId;     // 0 for non-quote
    }

    // ─── Core mutation ────────────────────────────────────────────────────────

    /// @notice Create a new call. CALL-37 / Gate sequence 6.1-6.3.
    /// @return callId The newly assigned call ID (starts at 1; _calls[0] is burned)
    function createCall(
        MarketType   marketType,
        EventSubtype eventSubtype,
        Category     category,
        uint256      assetA,
        uint256      assetB,
        uint256      targetValue,
        uint64       expiry,
        uint96       stake,
        uint8        conviction,
        bytes32      criteriaHash,
        bool         openToChallenges,
        uint256      parentCallId
    ) external returns (uint256 callId);

    // ─── View functions ───────────────────────────────────────────────────────

    /// @notice Retrieve a call by ID. Returns zero-initialized struct for callId 0. CALL-67.
    function getCall(uint256 callId) external view returns (Call memory);

    /// @notice Current TVL tracked in CallRegistry (stake counter). D-03.
    ///         Read by FollowFadeMarket for combined TVL cap check.
    function currentTvl() external view returns (uint256);

    /// @notice Maximum TVL cap. Read by FollowFadeMarket for combined TVL cap check. D-03.
    function tvlCap() external view returns (uint256);

    /// @notice Paginated list of callIds for a given user. CALL-67.
    function getCallsByUser(address user, uint256 offset, uint256 limit)
        external view returns (uint256[] memory);

    /// @notice Compute the duplicate hash for given inputs. CALL-68.
    function computeDuplicateHash(
        MarketType marketType,
        uint256    assetA,
        uint256    metric,
        uint256    targetValue,
        uint64     expiry
    ) external pure returns (bytes32);

    /// @notice Phase 2 exit penalty stub. Returns 0 in Phase 1. CALL-68.
    function computeCallerExitPenalty(uint256 callId) external pure returns (uint256);

    // ─── Owner-only admin functions ────────────────────────────────────────────

    /// @notice Add a coin to the asset allowlist with its Pyth feed ID. CALL-10.
    function addAsset(string calldata symbol, bytes32 feedId) external;

    /// @notice Add an NFT collection address to the allowlist. CALL-11.
    function addNFTCollection(address collection, string calldata symbol) external;

    /// @notice Update the TVL cap (must be <= MAX_ALLOWED_CAP). CALL-34.
    function setTvlCap(uint256 newCap) external;

    /// @notice Rotate the settlementManager address.
    function setSettlementManager(address newManager) external;

    /// @notice Owner-only: set FollowFadeMarket address after Phase 2 deploy. D-02.
    function setFollowFadeMarket(address newMarket) external;

    /// @notice Called by FollowFadeMarket to mark a call as CallerExited. D-02.
    function markCallerExited(uint256 callId) external;

    /// @notice Pause createCall. SAFETY-04.
    function pause() external;

    /// @notice Unpause createCall.
    function unpause() external;
}
