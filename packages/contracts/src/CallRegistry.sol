// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions" + "Pinned Addresses"
// Spec: CALL_IT_SPEC1.md §11.1, §12.1 — CallRegistry responsibilities + function signatures
// Requirement: CALL-01..70, SAFETY-01/04..11/14/18, AUTH-39
//
// USDC MANDATE (§10.5): ALL transfer paths use USDC_ARB_NATIVE from ./constants/USDC.sol.
// Never paste the literal address in this file. The CI grep guard will catch it.
//
// NON-UPGRADEABLE BY DESIGN (D-14, SAFETY-18):
// No proxy, no UUPS, no initialize(). Deploy via DeployPhase1.s.sol.
//
// CEI ORDER (SAFETY-05..09): State writes ALWAYS precede safeTransferFrom.
// Any reviewer: if you see safeTransferFrom BEFORE a state write, that is a bug.
//
// TVL NOTE (Pitfall 3): Phase 1 only tracks CallRegistry-local TVL.
// Phase 6 will aggregate across FollowFadeMarket + ChallengeEscrow.
//
// WARNING: AUTH-27 / AUTH-29 are amended per Phase 1 D-06 (Circle USDC Paymaster).
// See REQUIREMENTS.md AUTH-27 for the active requirement text.

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { USDC_ARB_NATIVE } from "./constants/USDC.sol";
import { IProfileRegistry } from "./interfaces/IProfileRegistry.sol";
import { ICallRegistry } from "./interfaces/ICallRegistry.sol";
import { DuplicateHashLib } from "./libraries/DuplicateHashLib.sol";

/// @title CallRegistry
/// @notice Manages call creation with anti-spam gates, USDC staking, and event emission.
///
///         Gate sequence in createCall (CALL-13..36):
///           6.1 stake bounds -> CALL-32 expiry -> CALL-33 category -> CALL-13 allowlist ->
///           CALL-15/16 criteria -> Gate 6.3 conviction-cap -> Gate 6.2 duplicate ->
///           CALL-34 TVL -> CALL-35/36 USDC pre-checks -> Effects -> Interactions
///
///         USDC transfer path wraps ReentrancyGuard + SafeERC20.safeTransferFrom.
///         All effects (state writes) precede the interaction (safeTransferFrom). CEI strict.
///
/// @dev Inherits Ownable2Step, ReentrancyGuard, Pausable.
///      callId 0 is burned; active IDs start at 1.
contract CallRegistry is Ownable2Step, ReentrancyGuard, Pausable, ICallRegistry {
    using SafeERC20 for IERC20;

    // ─── Constants ─────────────────────────────────────────────────────────────

    /// @notice Minimum stake per call. CALL-20, SAFETY-01.
    uint96 public constant MIN_STAKE = 5e6;       // $5 USDC (6 decimals)

    /// @notice Maximum stake per call. CALL-21, SAFETY-01.
    uint96 public constant MAX_STAKE = 100e6;     // $100 USDC

    /// @notice Flat creation fee pulled alongside stake. CALL-37/38.
    uint96 public constant CREATION_FEE = 10e6;   // $10 USDC

    /// @notice Protocol portion of the creation fee routed to treasury. CALL-38.
    uint96 public constant TREASURY_PORTION = 5e6;

    /// @notice Virtual fade seed portion of creation fee. CALL-38.
    uint96 public constant VIRTUAL_FADE_PORTION = 5e6;

    /// @notice Base virtual fade pool seed (always $2 minimum). CALL-39.
    uint96 public constant BASE_VIRTUAL_FADE = 2e6;

    /// @notice Settled calls required for high-conviction threshold to apply. CALL-29.
    uint8 public constant CONVICTION_FLOOR_MIN_CALLS = 10;

    /// @notice Conviction value at or above which the floor check activates. CALL-30.
    uint8 public constant HIGH_CONVICTION_THRESHOLD = 85;

    /// @notice Value to cap conviction to if caller has < CONVICTION_FLOOR_MIN_CALLS. CALL-31.
    uint8 public constant HIGH_CONVICTION_AUTOCAP = 84;

    /// @notice Number of valid Category enum values (0=Majors, 1=DeFi, 2=Other). CALL-33.
    uint8 public constant CATEGORY_COUNT = 3;

    /// @notice Hard upper bound on tvlCap (owner-raisable to max $100K). CALL-34.
    uint256 public constant MAX_ALLOWED_CAP = 100_000e6; // $100,000 USDC

    // ─── State ─────────────────────────────────────────────────────────────────

    /// @notice Packed call storage. _calls[0] is burned; real IDs start at 1.
    Call[] internal _calls;

    /// @notice Deduplication mapping from hash -> existing callId (0 = none). Gate 6.2.
    mapping(bytes32 => uint256) public activeDuplicateHashes;

    /// @notice Per-user call ID list for pagination. CALL-67.
    mapping(address => uint256[]) internal _userCalls;

    /// @notice Coin allowlist: symbol -> Pyth feed ID (for frontend display). CALL-06/10.
    mapping(string => bytes32) public allowlistedAssets;

    /// @notice feedId -> allowlisted. O(1) lookup in _assertAllowlisted. CALL-13.
    mapping(bytes32 => bool) public allowlistedFeedKeys;

    /// @notice NFT collection allowlist: collection address -> allowed. CALL-07/11/13.
    mapping(address => bool) public allowlistedNftCollections;

    /// @notice The ProfileRegistry consulted for Gate 6.3 (conviction floor). CALL-29..31.
    IProfileRegistry public immutable profileRegistry;

    /// @notice Phase 4 settlement manager address. Settable by owner. CALL-27.
    address public settlementManager;

    /// @notice Current TVL tracked locally. Phase 6 aggregates across contracts. CALL-34.
    uint256 public currentTvl;

    /// @notice Maximum TVL this contract will hold. Raisable by owner up to MAX_ALLOWED_CAP.
    uint256 public tvlCap;

    // ─── Constructor ───────────────────────────────────────────────────────────

    /// @notice Deploy a non-upgradeable CallRegistry.
    /// @param _profileRegistry The ProfileRegistry for Gate 6.3 settledCalls reads.
    /// @param _tvlCap          Initial TVL cap (must be <= MAX_ALLOWED_CAP = $100K).
    constructor(IProfileRegistry _profileRegistry, uint256 _tvlCap) Ownable(msg.sender) {
        require(_tvlCap <= MAX_ALLOWED_CAP, "cap-too-high");
        profileRegistry = _profileRegistry;
        tvlCap = _tvlCap;
        _calls.push(); // burn callId 0 -- a callId of 0 in activeDuplicateHashes means "no duplicate"
    }

    // ─── Transient call input (stored temporarily to avoid stack overflow) ─────
    //
    // Because Solidity 0.8.30 without via_ir has a hard 16-slot stack limit,
    // createCall's 12 parameters + local variables exceed it.
    // We store the call input in contract storage transiently (set at start, cleared at end).
    // This is gas-equivalent to using memory structs but avoids the stack limit.
    // SAFETY: nonReentrant ensures _pendingInput is never overwritten by a re-entrant call.

    struct PendingInput {
        MarketType   marketType;
        EventSubtype eventSubtype;
        Category     category;
        uint256      assetA;
        uint256      assetB;
        uint256      targetValue;
        uint64       expiry;
        uint96       stake;
        uint8        appliedConviction;
        bytes32      criteriaHash;
        bool         openToChallenges;
        uint256      parentCallId;
    }

    PendingInput private _pendingInput;

    // ─── Core mutation ─────────────────────────────────────────────────────────

    /// @inheritdoc ICallRegistry
    /// @notice Create a new call. CALL-37 / Gate sequence 6.1-6.3 + CALL-32..36.
    ///
    ///         CEI ORDER (SAFETY-05): Effects (state writes) precede Interactions (safeTransferFrom).
    ///         ReentrancyGuard (SAFETY-14) wraps the entire function.
    ///         whenNotPaused (SAFETY-04) blocks createCall while paused.
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
    ) external nonReentrant whenNotPaused returns (uint256 callId) {
        // Gate 6.1: stake bounds
        if (stake < MIN_STAKE) revert StakeBelowMinimum();
        if (stake > MAX_STAKE) revert StakeAboveMaximum();

        // CALL-32: expiry must be in the future
        if (expiry <= block.timestamp) revert ExpiryNotInFuture();

        // CALL-33: category enum must be valid
        if (uint8(category) >= CATEGORY_COUNT) revert CategoryInvalid();

        // CALL-13: asset/collection must be allowlisted
        _assertAllowlisted(marketType, assetA);

        // CALL-15/16: criteria required for specific event subtypes
        if (_criteriaRequired(marketType, eventSubtype) && criteriaHash == bytes32(0)) {
            revert CriteriaRequired(marketType, eventSubtype);
        }

        // Gate 6.3: high-conviction floor auto-cap (NO revert; caps + emits ConvictionCapped)
        uint8 appliedConviction = conviction;
        if (conviction >= HIGH_CONVICTION_THRESHOLD) {
            if (profileRegistry.settledCalls(msg.sender) < CONVICTION_FLOOR_MIN_CALLS) {
                appliedConviction = HIGH_CONVICTION_AUTOCAP;
                emit ConvictionCapped(msg.sender, conviction, appliedConviction);
            }
        }

        // Store params to transient slot (nonReentrant guarantees single-write safety)
        // This avoids the Solidity 16-slot stack limit in the sub-functions below.
        _pendingInput.marketType = marketType;
        _pendingInput.eventSubtype = eventSubtype;
        _pendingInput.category = category;
        _pendingInput.assetA = assetA;
        _pendingInput.assetB = assetB;
        _pendingInput.targetValue = targetValue;
        _pendingInput.expiry = expiry;
        _pendingInput.stake = stake;
        _pendingInput.appliedConviction = appliedConviction;
        _pendingInput.criteriaHash = criteriaHash;
        _pendingInput.openToChallenges = openToChallenges;
        _pendingInput.parentCallId = parentCallId;

        callId = _executeCreate();
    }

    /// @dev Execute the validated call creation: Gate 6.2 + TVL + USDC + effects + interactions.
    ///      Reads params from _pendingInput (set by createCall above).
    ///      CEI: ALL state writes happen before safeTransferFrom (SAFETY-05).
    function _executeCreate() internal returns (uint256 callId) {
        PendingInput storage p = _pendingInput;

        // Gate 6.2: duplicate hash check
        bytes32 dupHash = DuplicateHashLib.compute(
            uint8(p.marketType),
            p.assetA,
            uint256(p.eventSubtype),
            p.targetValue,
            DuplicateHashLib.dayBucketUtc(p.expiry)
        );
        uint256 existing = activeDuplicateHashes[dupHash];
        if (existing != 0) revert DuplicateCall(existing);

        // CALL-34: TVL cap
        uint256 incoming = uint256(p.stake) + uint256(CREATION_FEE);
        if (currentTvl + incoming > tvlCap) revert TvlCapReached(incoming, tvlCap - currentTvl);

        // CALL-35/36: USDC pre-checks
        uint256 allowance = IERC20(USDC_ARB_NATIVE).allowance(msg.sender, address(this));
        if (allowance < incoming) revert InsufficientUsdcAllowance(incoming, allowance);
        uint256 balance = IERC20(USDC_ARB_NATIVE).balanceOf(msg.sender);
        if (balance < incoming) revert InsufficientUsdcBalance(incoming, balance);

        // EFFECTS: state writes before interaction (CEI strict -- SAFETY-05)
        callId = _calls.length;
        _calls.push();
        Call storage c = _calls[callId];
        c.caller           = msg.sender;
        c.stake            = p.stake;
        c.virtualFadeSeed  = BASE_VIRTUAL_FADE + VIRTUAL_FADE_PORTION;
        c.createdAt        = uint64(block.timestamp);
        c.expiry           = p.expiry;
        c.marketType       = p.marketType;
        c.eventSubtype     = p.eventSubtype;
        c.category         = p.category;
        c.status           = CallStatus.Live;
        c.conviction       = p.appliedConviction;
        c.openToChallenges = p.openToChallenges;
        c.duplicateHash    = dupHash;
        c.criteriaHash     = p.criteriaHash;
        c.assetA           = p.assetA;
        c.assetB           = p.assetB;
        c.targetValue      = p.targetValue;
        c.parentCallId     = p.parentCallId;

        activeDuplicateHashes[dupHash] = callId;
        _userCalls[msg.sender].push(callId);
        currentTvl += incoming;

        // INTERACTIONS: token pull LAST (CEI, SAFETY-05, SAFETY-14)
        IERC20(USDC_ARB_NATIVE).safeTransferFrom(msg.sender, address(this), incoming);

        // Events
        emit CallCreated(callId, msg.sender, p.marketType, p.stake);
        if (p.parentCallId != 0) emit CallQuoted(p.parentCallId, callId);

        // Clear the transient pending input slot
        delete _pendingInput;
    }

    // ─── View functions ─────────────────────────────────────────────────────────

    /// @inheritdoc ICallRegistry
    function getCall(uint256 callId) external view returns (Call memory) {
        if (callId >= _calls.length) {
            // Return zero-initialized struct for out-of-range IDs (including callId 0)
            return Call({
                caller: address(0),
                stake: 0,
                virtualFadeSeed: 0,
                createdAt: 0,
                expiry: 0,
                marketType: MarketType.PriceTarget,
                eventSubtype: EventSubtype.None,
                category: Category.Majors,
                status: CallStatus.Live,
                conviction: 0,
                openToChallenges: false,
                duplicateHash: bytes32(0),
                criteriaHash: bytes32(0),
                assetA: 0,
                assetB: 0,
                targetValue: 0,
                parentCallId: 0
            });
        }
        return _calls[callId];
    }

    /// @inheritdoc ICallRegistry
    function getCallsByUser(
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory result) {
        uint256[] storage ids = _userCalls[user];
        uint256 total = ids.length;
        if (offset >= total || limit == 0) return new uint256[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        result = new uint256[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = ids[i];
        }
    }

    /// @inheritdoc ICallRegistry
    function computeDuplicateHash(
        MarketType marketType,
        uint256    assetA,
        uint256    metric,
        uint256    targetValue,
        uint64     expiry
    ) external pure returns (bytes32) {
        uint64 deadlineDay = DuplicateHashLib.dayBucketUtc(expiry);
        return DuplicateHashLib.compute(uint8(marketType), assetA, metric, targetValue, deadlineDay);
    }

    /// @inheritdoc ICallRegistry
    /// @dev Phase 2 implements the decay formula. Phase 1 stub always returns 0.
    function computeCallerExitPenalty(uint256 /*callId*/) external pure returns (uint256) {
        return 0;
    }

    // ─── Owner-only admin functions ─────────────────────────────────────────────

    /// @inheritdoc ICallRegistry
    function addAsset(string calldata symbol, bytes32 feedId) external onlyOwner {
        allowlistedAssets[symbol] = feedId;
        allowlistedFeedKeys[feedId] = true;
        emit AssetAllowlisted(symbol, feedId);
    }

    /// @inheritdoc ICallRegistry
    function addNFTCollection(address collection) external onlyOwner {
        allowlistedNftCollections[collection] = true;
        emit NftCollectionAllowlisted(collection);
    }

    /// @inheritdoc ICallRegistry
    function setTvlCap(uint256 newCap) external onlyOwner {
        if (newCap > MAX_ALLOWED_CAP) revert CapTooHigh();
        tvlCap = newCap;
        emit TvlCapSet(newCap);
    }

    /// @notice Owner-only: rotate the settlementManager address.
    function setSettlementManager(address newManager) external onlyOwner {
        settlementManager = newManager;
        emit SettlementManagerSet(newManager);
    }

    /// @inheritdoc ICallRegistry
    function pause() external onlyOwner {
        _pause();
    }

    /// @inheritdoc ICallRegistry
    function unpause() external onlyOwner {
        _unpause();
    }

    // ─── Internal helpers ───────────────────────────────────────────────────────

    /// @notice Assert that the asset for a given marketType is in the allowlist. CALL-13.
    ///         For PriceTarget/SpreadVs: assetA is a Pyth feed ID (bytes32 as uint256).
    ///         For Event: assetA is either a Pyth feed ID or an NFT collection address.
    function _assertAllowlisted(
        MarketType marketType,
        uint256 assetA
    ) internal view {
        if (marketType == MarketType.Event) {
            // Event calls: assetA might be an NFT collection address or a coin feed key
            address nftAddr = address(uint160(assetA));
            if (allowlistedNftCollections[nftAddr]) return;
            if (allowlistedFeedKeys[bytes32(assetA)]) return;
            revert AssetNotAllowlisted();
        } else {
            // PriceTarget and SpreadVs: assetA is a Pyth feed ID packed as uint256
            if (!allowlistedFeedKeys[bytes32(assetA)]) revert AssetNotAllowlisted();
        }
    }

    /// @notice Check if criteriaHash is required for an event subtype. CALL-15/16.
    ///         Subtypes CexListing(4), TokenLaunch(5), Governance(6), ProtocolMilestone(7)
    ///         require a non-zero criteriaHash.
    function _criteriaRequired(
        MarketType marketType,
        EventSubtype eventSubtype
    ) internal pure returns (bool) {
        if (marketType != MarketType.Event) return false;
        uint8 st = uint8(eventSubtype);
        return st >= 4 && st <= 7; // CexListing, TokenLaunch, Governance, ProtocolMilestone
    }
}
