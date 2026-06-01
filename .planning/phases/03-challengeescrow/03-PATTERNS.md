# Phase 3: ChallengeEscrow - Pattern Map

**Mapped:** 2026-06-01
**Files analyzed:** 18 new/modified files
**Analogs found:** 17 / 18

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/contracts/src/ChallengeEscrow.sol` | contract | CRUD + event-driven | `packages/contracts/src/FollowFadeMarket.sol` | exact |
| `packages/contracts/src/interfaces/IChallengeEscrow.sol` | interface | — | `packages/contracts/src/interfaces/IFollowFadeMarket.sol` | exact |
| `packages/contracts/test/ChallengeEscrow.t.sol` | test | CRUD | `packages/contracts/test/TvlAggregation.t.sol` | role-match |
| `packages/contracts/test/ChallengeEscrowGates.t.sol` | test | CRUD | `packages/contracts/test/TvlAggregation.t.sol` | role-match |
| `packages/contracts/test/ChallengeEscrowParity.t.sol` | test | CRUD | `packages/contracts/test/TvlAggregation.t.sol` | role-match |
| `packages/contracts/test/helpers/CeTestHelper.sol` | test-helper | — | `packages/contracts/test/helpers/FfmTestHelper.sol` | exact |
| `packages/contracts/script/DeployPhase3.s.sol` | config | — | `packages/contracts/script/DeployPhase2.s.sol` | exact |
| `packages/shared/src/constants/addresses.ts` | config | — | same file (modification) | exact |
| `packages/subgraph/src/challenge-escrow.ts` | service | event-driven | `packages/subgraph/src/follow-fade-market.ts` | exact |
| `packages/subgraph/schema.graphql` | config | — | same file (modification, entities already scaffolded) | exact |
| `packages/subgraph/subgraph.yaml` | config | — | same file (modification) | exact |
| `apps/relayer/src/db/schema.ts` | model | CRUD | same file (modification) | exact |
| `apps/relayer/src/routes/duel-live-state.ts` | route | request-response | `apps/relayer/src/routes/live-state.ts` | exact |
| `apps/relayer/src/routes/duels.ts` | route | request-response | `apps/relayer/src/routes/live-state.ts` | role-match |
| `apps/relayer/src/workers/duel-trending-worker.ts` | worker | event-driven | `apps/relayer/src/workers/notification-fanout.ts` | role-match |
| `apps/relayer/src/workers/duel-king-worker.ts` | worker | batch | `apps/relayer/src/workers/notification-fanout.ts` | role-match |
| `apps/web/app/duel/[challengeId]/page.tsx` | component | request-response | `apps/web/app/call/[id]/page.tsx` | role-match |
| `apps/web/app/og/duel/[challengeId]/route.ts` | route | request-response | `apps/web/app/og/[callId]/route.ts` | exact |

---

## Pattern Assignments

### `packages/contracts/src/ChallengeEscrow.sol` (contract, CRUD + event-driven)

**Analog:** `packages/contracts/src/FollowFadeMarket.sol`

**Imports pattern** (FollowFadeMarket.sol lines 1–29):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions" + "Pinned Addresses"
// Spec: CALL_IT_SPEC1.md §11.3, §12.3 — ChallengeEscrow responsibilities + function signatures
// Requirement: SOCIAL-29..39, SAFETY-01/04..11/14/18
//
// USDC MANDATE (§10.5): ALL transfer paths use USDC_ARB_NATIVE from ./constants/USDC.sol.
// Never paste the literal address in this file. The CI grep guard will catch it.
//
// NON-UPGRADEABLE BY DESIGN (D-14, SAFETY-18):
// No proxy, no UUPS, no initialize(). Deploy via DeployPhase3.s.sol.
//
// CEI ORDER (SAFETY-05..09): State writes ALWAYS precede safeTransfer/safeTransferFrom.
// Any reviewer: if you see safeTransfer BEFORE a state write, that is a bug.
//
// PAUSE CARVE-OUTS (§10.3): claimDuelPayout and claimOverage are NOT guarded by whenNotPaused.
// proposeChallenge and acceptChallenge ARE guarded by whenNotPaused.

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { USDC_ARB_NATIVE } from "./constants/USDC.sol";
import { ICallRegistry } from "./interfaces/ICallRegistry.sol";
import { IFollowFadeMarket } from "./interfaces/IFollowFadeMarket.sol";
import { IChallengeEscrow } from "./interfaces/IChallengeEscrow.sol";
```

**Contract declaration pattern** (FollowFadeMarket.sol line 51):
```solidity
contract ChallengeEscrow is Ownable2Step, ReentrancyGuard, Pausable, IChallengeEscrow {
    using SafeERC20 for IERC20;
```

**Constructor pattern** (FollowFadeMarket.sol lines 150–161):
```solidity
// From FollowFadeMarket constructor — ChallengeEscrow adds callRegistry + followFadeMarket refs:
constructor(
    address _callRegistry,
    address _followFadeMarket,
    address _usdc,          // must equal USDC_ARB_NATIVE (assert this)
    address _treasury,
    uint256 _tvlCap
) Ownable(msg.sender) {
    require(_callRegistry != address(0), "invalid-registry");
    require(_followFadeMarket != address(0), "invalid-ffm");
    require(_usdc == USDC_ARB_NATIVE, "wrong-usdc");
    require(_treasury != address(0) && _treasury != address(this), "invalid-treasury");
    require(_tvlCap <= MAX_ALLOWED_CAP, "cap-too-high");
    callRegistry = ICallRegistry(_callRegistry);
    followFadeMarket = IFollowFadeMarket(_followFadeMarket);
    treasury = _treasury;
    tvlCap = _tvlCap;
    nextChallengeId = 1; // burn challengeId 0
}
```

**Settlement authorization pattern** (CallRegistry.sol lines 410–448):
```solidity
// From CallRegistry.sol — EXACT pattern for settleDuel authorization seam:
address public settlementManager; // set to address(0) at deploy; Phase 4 rotates

modifier onlySettlementManager() {
    if (msg.sender != settlementManager) revert NotSettlementManager();
    _;
}

function setSettlementManager(address newManager) external onlyOwner {
    settlementManager = newManager;
    emit SettlementManagerSet(newManager);
}

// markSettled pattern (lines 442–449) — mirror exactly for settleDuel:
function markSettled(uint256 callId, Outcome outcome) external {
    if (msg.sender != settlementManager) revert NotSettlementManager();
    require(callId != 0 && callId < _calls.length, "bad-callId");
    require(_calls[callId].status != CallStatus.Settled, "already-settled");
    _calls[callId].status = CallStatus.Settled;
    _calls[callId].outcome = outcome;
}
```

**TVL cap check pattern** (FollowFadeMarket.sol lines 254–260):
```solidity
// From FollowFadeMarket._deposit() — 2-way cap. ChallengeEscrow extends to 3-way:
uint256 combinedTvl = callRegistry.currentTvl() + getTvl();
if (combinedTvl + amountIn > callRegistry.tvlCap()) {
    revert TvlCapReached(amountIn, callRegistry.tvlCap() - combinedTvl);
}
// ChallengeEscrow version adds followFadeMarket.getTvl():
//   combined = callRegistry.currentTvl() + followFadeMarket.getTvl() + totalEscrow
//   Note: ChallengeEscrow uses totalEscrow counter (NOT USDC.balanceOf) per Pitfall B
```

**CEI pattern** (FollowFadeMarket.sol lines 278–294):
```solidity
// EFFECTS: ALL state writes before any USDC transfer (CEI)
followReserve[callId]              += amountIn;
followTotalShares[callId]          += sharesOut;
followShares[callId][msg.sender]   += sharesOut;
followPosition[callId][msg.sender] += amountIn;
followEntryTime[callId][msg.sender] = uint64(block.timestamp);

// INTERACTIONS: USDC transfer LAST (CEI, SAFETY-05, SAFETY-14)
IERC20(USDC_ARB_NATIVE).safeTransferFrom(msg.sender, address(this), amountIn);
```

**Pause pattern** (FollowFadeMarket.sol lines 553–562):
```solidity
// Carve-out comment is mandatory per §10.3 — copy the comment pattern:
/// @dev Pause carve-out: NOT guarded by whenNotPaused (§10.3).
function claimDuelPayout(uint256 challengeId) external nonReentrant { ... }
function claimOverage(uint256 challengeId) external nonReentrant { ... }

// Paused functions:
function proposeChallenge(...) external nonReentrant whenNotPaused { ... }
function acceptChallenge(...) external nonReentrant whenNotPaused { ... }

function pause() external onlyOwner { _pause(); }
function unpause() external onlyOwner { _unpause(); }
```

**getTvl pattern** (FollowFadeMarket.sol lines 487–491):
```solidity
// FollowFadeMarket uses balanceOf (correct for single-custodian).
// ChallengeEscrow must use a totalEscrow counter instead (Pitfall B):
// DO NOT use: return IERC20(USDC_ARB_NATIVE).balanceOf(address(this));
// USE: return totalEscrow; // maintained counter, prevents double-counting in 3-way cap

function getTvl() public view returns (uint256) {
    return totalEscrow; // counter decremented on settle/refund/reject, incremented on accept
}
```

---

### `packages/contracts/src/interfaces/IChallengeEscrow.sol` (interface)

**Analog:** `packages/contracts/src/interfaces/IFollowFadeMarket.sol`

**Structure pattern** (IFollowFadeMarket.sol lines 1–161 — copy structure exactly):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions"
// Spec: CALL_IT_SPEC1.md §11.3, §12.3 — ChallengeEscrow interface (LOCKED)
// Requirement: SOCIAL-29..39, SOCIAL-48

/// @title IChallengeEscrow
/// @notice Public interface for the ChallengeEscrow contract.
///         Declares ChallengeStatus enum, Challenge struct, events, errors, function signatures.
///         Consumed by the frontend wagmi hooks, relayer, test helpers, and Phase 4 SettlementManager.
interface IChallengeEscrow {
    // ─── Enums ──────────────────────────────────────────────────────────────
    enum ChallengeStatus { Proposed, Accepted, Rejected, Refunded, Settled }

    // ─── Structs ─────────────────────────────────────────────────────────────
    struct Challenge { ... } // per §12.3 + RESEARCH.md Pattern 1

    // ─── Events ──────────────────────────────────────────────────────────────
    // Follow IFollowFadeMarket.sol pattern: event per operation, indexed callId/user

    // ─── Custom errors ───────────────────────────────────────────────────────
    // One error per gate condition; named for the condition, not the function

    // ─── Core mutation functions ──────────────────────────────────────────────
    // Carve-out comment on claimDuelPayout + claimOverage (§10.3 pause carve-out)

    // ─── View functions ───────────────────────────────────────────────────────
    function getTvl() external view returns (uint256);
    function getChallenge(uint256 challengeId) external view returns (Challenge memory);
}
```

**Event structure pattern** (IFollowFadeMarket.sol lines 20–60):
```solidity
// Mirror this indexed-params event pattern:
event Followed(uint256 indexed callId, address indexed user, uint256 amountIn, uint256 sharesOut);
// For ChallengeEscrow:
event ChallengeProposed(uint256 indexed challengeId, uint256 indexed callId, address indexed challenger, uint96 challengerStake);
event ChallengeAccepted(uint256 indexed challengeId, address indexed caller, uint96 callerStake);
event ChallengeRejected(uint256 indexed challengeId, address indexed caller);
event ChallengeRefunded(uint256 indexed challengeId, address indexed challenger, uint96 amount);
event ChallengeSettled(uint256 indexed challengeId, address indexed winner);
event PayoutClaimed(uint256 indexed challengeId, address indexed winner, uint256 payout, uint256 protocolFee);
event OveragePushed(uint256 indexed challengeId, address indexed recipient, uint256 amount);
event UnclaimedOverageCreated(uint256 indexed challengeId, address indexed beneficiary, uint256 amount);
event SettlementManagerSet(address indexed newManager);
```

**Error pattern** (IFollowFadeMarket.sol lines 64–96):
```solidity
// One-line named errors; consistent with existing contract vocabulary:
error CallerNotOpenToChallenges();   // SOCIAL-29
error SelfChallenge();               // SOCIAL-32
error CallNotChallengeable();        // SOCIAL-33
error AcceptanceWindowExpired();     // SOCIAL-34
error ClaimRefundNotAvailable();
error NotDuelWinner();               // SOCIAL-39
error AlreadyClaimed();              // SOCIAL-38
error ChallengeNotAccepted();
error ChallengeNotSettled();
error NotOverageRecipient();
error StakeBelowMinimum();
error StakeAboveMaximum();
error TvlCapReached(uint256 requested, uint256 available);
error NotSettlementManager();
error NotAuthorized();
```

---

### `packages/contracts/test/helpers/CeTestHelper.sol` (test-helper)

**Analog:** `packages/contracts/test/helpers/FfmTestHelper.sol` (full file, 196 lines)

**Extension pattern** (FfmTestHelper.sol lines 38–131):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
// Copy FfmTestHelper.sol header comments verbatim, update for ChallengeEscrow.

import { TestBase } from "forge-std/Base.sol";
import { StdAssertions } from "forge-std/StdAssertions.sol";
import { StdChains } from "forge-std/StdChains.sol";
import { StdCheats } from "forge-std/StdCheats.sol";
import { StdUtils } from "forge-std/StdUtils.sol";
// Import FfmTestHelper (inherits the 3-contract stack):
import { FfmTestHelper } from "./FfmTestHelper.sol";
import { ChallengeEscrow } from "../../src/ChallengeEscrow.sol";
import { IChallengeEscrow } from "../../src/interfaces/IChallengeEscrow.sol";
import { ICallRegistry } from "../../src/interfaces/ICallRegistry.sol";
import { IFollowFadeMarket } from "../../src/interfaces/IFollowFadeMarket.sol";

abstract contract CeTestHelper is FfmTestHelper {
    // Constants matching ChallengeEscrow.sol
    uint96 internal constant MIN_STAKE = 5e6;   // $5 USDC
    uint96 internal constant MAX_STAKE = 100e6; // $100 USDC
    uint256 internal constant CHALLENGE_ACCEPTANCE_WINDOW = 24 hours;

    ChallengeEscrow internal ce;
    address internal challenger; // test actor distinct from alice/bob/owner/treasury

    function setUp() public virtual override {
        super.setUp(); // boots 3-contract stack + MockUSDC etch + funds alice+bob

        challenger = makeAddr("challenger");
        usdc.mint(challenger, 1000e6);

        vm.startPrank(owner);
        ce = new ChallengeEscrow(
            address(registry),
            address(ffm),
            USDC_ARB_NATIVE,
            treasury,
            5_000e6 // $5K TVL cap
        );
        vm.stopPrank();

        vm.prank(challenger);
        usdc.approve(address(ce), type(uint256).max);
        vm.prank(alice);
        usdc.approve(address(ce), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(ce), type(uint256).max);
    }

    // _seedPool() is inherited from FfmTestHelper — use it to create Live+openToChallenges calls

    /// @notice Propose a challenge from `from` against `callId` with `stake`.
    function _proposeChallenge(address from, uint256 callId, uint96 stake)
        internal returns (uint256 challengeId)
    {
        vm.prank(from);
        challengeId = ce.proposeChallenge(callId, stake);
    }
}
```

---

### `packages/contracts/script/DeployPhase3.s.sol` (config/deploy)

**Analog:** `packages/contracts/script/DeployPhase2.s.sol` (full file, 284 lines)

**Deploy structure pattern** (DeployPhase2.s.sol lines 56–283):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
// Copy DEPLOYMENT SAFETY CHECKLIST header from DeployPhase2.s.sol; update for Phase 3.
// Post-deploy verification commands:
//   cast call <ChallengeEscrow> "getTvl()(uint256)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   cast call <ChallengeEscrow> "settlementManager()(address)" ...
//     -> 0x0000000000000000000000000000000000000000

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { ChallengeEscrow } from "../src/ChallengeEscrow.sol";
import { ICallRegistry } from "../src/interfaces/ICallRegistry.sol";
import { IFollowFadeMarket } from "../src/interfaces/IFollowFadeMarket.sol";

contract DeployPhase3 is Script {
    // Deployed Phase 2 addresses (from addresses.ts):
    address constant CALL_REGISTRY    = 0x7DAd732764abfC935aD5bf8e5CFF9BEA7B2C234D;
    address constant FOLLOW_FADE_MARKET = 0x12aafa5a70c3aD8Bd3a52252744f9F7Aa073E362;

    uint256 public constant INITIAL_TVL_CAP = 5_000_000_000; // $5,000 USDC

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address treasuryAddress = vm.envAddress("TREASURY_ADDRESS");

        vm.startBroadcast(deployerKey);

        ChallengeEscrow ce = new ChallengeEscrow(
            CALL_REGISTRY,
            FOLLOW_FADE_MARKET,
            0xaf88d065e77c8cC2239327C5EDb3A432268e5831, // USDC_ARB_NATIVE — asserted in constructor
            treasuryAddress,
            INITIAL_TVL_CAP
        );
        console.log("ChallengeEscrow deployed at:", address(ce));
        console.log("Deploy block: use for subgraph.yaml startBlock");

        vm.stopBroadcast();

        // Post-deploy assertions (mirror DeployPhase2.s.sol lines 215–281):
        require(ce.getTvl() == 0, "TVL should be 0 post-deploy");
        require(ce.settlementManager() == address(0), "settlementManager should be address(0)");
        require(ce.tvlCap() == INITIAL_TVL_CAP, "tvlCap mismatch");

        console.log("REQUIRED NEXT STEPS:");
        console.log("1. Update packages/shared/src/constants/addresses.ts");
        console.log("   CHALLENGE_ESCROW_ARBITRUM_SEPOLIA =", address(ce));
        console.log("2. Update packages/subgraph/subgraph.yaml:");
        console.log("   ChallengeEscrow address + startBlock");
        console.log("   Remove block handler; add event handlers");
        console.log("3. Run graph build + graph deploy:sepolia");
    }
}
```

---

### `packages/shared/src/constants/addresses.ts` (config — modification)

**Analog:** Same file (modification), existing pattern (addresses.ts lines 119–178)

**Addition pattern** (addresses.ts lines 119–127):
```typescript
// Copy FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA export style exactly:

/**
 * ChallengeEscrow on Arbitrum Sepolia (Phase 3 deploy).
 *
 * DEPLOYED [DATE] via DeployPhase3.s.sol. Deploy block: [BLOCK].
 * Constructor: (CallRegistry v2, FollowFadeMarket, USDC, treasury, 5_000e6).
 *
 * Post-deploy verification (on-chain, all green):
 *   getTvl()             -> 0                                             ✓
 *   settlementManager()  -> 0x0000000000000000000000000000000000000000   ✓
 *   tvlCap()             -> 5000000000                                    ✓
 */
export const CHALLENGE_ESCROW_ARBITRUM_SEPOLIA =
  '0x0000000000000000000000000000000000000000' as const; // populate after deploy

export const CHALLENGE_ESCROW_ARBITRUM_ONE =
  '0x0000000000000000000000000000000000000000' as const;

// Update CHALLENGE_ESCROW_ADDRESSES (already scaffolded as EMPTY_ADDRESSES in addresses.ts line 178):
export const CHALLENGE_ESCROW_ADDRESSES: AddressRecord = {
  [ARBITRUM_MAINNET_CHAIN_ID]: CHALLENGE_ESCROW_ARBITRUM_ONE,
  [ARBITRUM_SEPOLIA_CHAIN_ID]: CHALLENGE_ESCROW_ARBITRUM_SEPOLIA,
};
```

---

### `packages/subgraph/src/challenge-escrow.ts` (service, event-driven)

**Analog:** `packages/subgraph/src/follow-fade-market.ts` (full file, 171 lines)

**Header + imports pattern** (follow-fade-market.ts lines 1–23):
```typescript
// Phase 3 real handlers replacing the Phase 0 stub.
// Pitfall E: Remove the handleBlock export (stub is gone); this file now exports only event handlers.
// Pitfall E: subgraph.yaml must remove the blockHandlers entry for ChallengeEscrow.
//
// AssemblyScript constraints (same as FFM handlers):
//   - No closures
//   - No null for value types (BigInt.fromI32(0), '', false)
//   - @graphprotocol/graph-ts BigInt helpers required
//   - @entity(immutable: false) on Challenge (status transitions); immutable: true on ChallengePayout

import { BigInt } from '@graphprotocol/graph-ts';

import {
  ChallengeProposed,
  ChallengeAccepted,
  ChallengeRejected,
  ChallengeRefunded,
  ChallengeSettled,
  PayoutClaimed,
  UnclaimedOverageCreated,
} from '../generated/ChallengeEscrow/ChallengeEscrow';

import {
  Challenge,
  ChallengePayout,
  UnclaimedOverage,
  TvlSnapshot,
} from '../generated/schema';
```

**Entity load-or-create pattern** (follow-fade-market.ts lines 28–66):
```typescript
// Follow ensurePosition() / ensureCallerExit() pattern — lazy init with zero defaults:
function ensureChallenge(challengeId: string): Challenge {
  let challenge = Challenge.load(challengeId);
  if (challenge == null) {
    challenge = new Challenge(challengeId);
    challenge.call = '';           // set from event.params.callId
    challenge.challenger = new Bytes(0);
    challenge.stake = BigInt.fromI32(0);
    challenge.status = 'Proposed';
    challenge.winner = null;
    challenge.proposedAt = BigInt.fromI32(0);
    challenge.acceptedAt = null;
    challenge.settledAt = null;
  }
  return challenge as Challenge;
}
```

**Handler pattern** (follow-fade-market.ts lines 73–83):
```typescript
// Mirror handleFollowed() structure exactly:
export function handleChallengeProposed(event: ChallengeProposed): void {
  let challengeId = event.params.challengeId.toString();
  let callId = event.params.callId.toString();
  let challenge = ensureChallenge(challengeId);
  challenge.call = callId;
  challenge.challenger = event.params.challenger;
  challenge.stake = event.params.challengerStake;
  challenge.status = 'Proposed';
  challenge.proposedAt = event.block.timestamp;
  challenge.save();
}

export function handleChallengeAccepted(event: ChallengeAccepted): void { ... }
export function handleChallengeRejected(event: ChallengeRejected): void { ... }
export function handleChallengeRefunded(event: ChallengeRefunded): void { ... }
export function handleChallengeSettled(event: ChallengeSettled): void { ... }
export function handlePayoutClaimed(event: PayoutClaimed): void { ... }   // immutable ChallengePayout
export function handleUnclaimedOverageCreated(event: UnclaimedOverageCreated): void { ... }
```

**TvlSnapshot pattern** (follow-fade-market.ts lines 156–170):
```typescript
// From handlePoolInitialized — reuse for TvlSnapshot after ChallengeEscrow state changes:
let id = event.transaction.hash.toHexString() + '-' + event.logIndex.toString();
let snapshot = new TvlSnapshot(id);
snapshot.blockNumber = event.block.number;
snapshot.callRegistryTvl = BigInt.fromI32(0);
snapshot.followFadeMarketTvl = BigInt.fromI32(0);
snapshot.challengeEscrowTvl = event.params.amount; // new escrow deposit
snapshot.totalTvl = snapshot.challengeEscrowTvl;
snapshot.timestamp = event.block.timestamp;
snapshot.save();
```

---

### `packages/subgraph/subgraph.yaml` (config — modification)

**Analog:** Same file (modification), existing ChallengeEscrow data source stub (subgraph.yaml lines 138–158)

**Data source replacement pattern** (subgraph.yaml lines 138–158 — replace the stub):
```yaml
# REPLACE the existing stub block handler entry with real event handlers:
- kind: ethereum/contract
  name: ChallengeEscrow
  network: arbitrum-sepolia
  source:
    address: "0x<CHALLENGE_ESCROW_ADDR>"   # populated post-deploy
    abi: ChallengeEscrow
    startBlock: <DEPLOY_BLOCK>             # populated post-deploy
  mapping:
    kind: ethereum/events
    apiVersion: 0.0.9
    language: wasm/assemblyscript
    file: ./src/challenge-escrow.ts
    entities:
      - Challenge
      - ChallengePayout
      - UnclaimedOverage
      - TvlSnapshot
    abis:
      - name: ChallengeEscrow
        file: ./abis/ChallengeEscrow.json
    # REMOVE blockHandlers entirely (Pitfall E)
    eventHandlers:
      - event: ChallengeProposed(indexed uint256,indexed uint256,indexed address,uint96)
        handler: handleChallengeProposed
      - event: ChallengeAccepted(indexed uint256,indexed address,uint96)
        handler: handleChallengeAccepted
      - event: ChallengeRejected(indexed uint256,indexed address)
        handler: handleChallengeRejected
      - event: ChallengeRefunded(indexed uint256,indexed address,uint96)
        handler: handleChallengeRefunded
      - event: ChallengeSettled(indexed uint256,indexed address)
        handler: handleChallengeSettled
      - event: PayoutClaimed(indexed uint256,indexed address,uint256,uint256)
        handler: handlePayoutClaimed
      - event: UnclaimedOverageCreated(indexed uint256,indexed address,uint256)
        handler: handleUnclaimedOverageCreated
```

---

### `apps/relayer/src/db/schema.ts` (model — modification)

**Analog:** Same file (modification), existing `notifications` table (schema.ts lines 119–160)

**New table pattern** (schema.ts lines 29–43 for addressBook + 119–160 for notifications — combine both patterns):
```typescript
// Copy the import line — drizzle/pg-core already imported:
import { pgTable, serial, varchar, text, timestamp, integer, index, uniqueIndex, jsonb, boolean } from 'drizzle-orm/pg-core';

// trending_duels table — follows addressBook index pattern + notifications uniqueIndex pattern:
export const trendingDuels = pgTable(
  'trending_duels',
  {
    id: serial('id').primaryKey(),
    /** On-chain challengeId */
    challengeId: integer('challenge_id').notNull(),
    /** ISO timestamp when the trending pin expires (trending_until = now() + 4h) */
    trendingUntil: timestamp('trending_until').notNull(),
    /** Pot in USDC micro-units at time of pin */
    potUsdc: varchar('pot_usdc', { length: 30 }).notNull().default('0'),
    /** Follow + fade backer count at time of pin */
    backerCount: integer('backer_count').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    trendingDuelsChallengeIdx: uniqueIndex('trending_duels_challenge_id_idx').on(table.challengeId),
    // clean up expired pins: WHERE trending_until < now()
    trendingDuelsTrendingUntilIdx: index('trending_duels_trending_until_idx').on(table.trendingUntil),
  }),
);

// duel_kings table — single-row or one-per-week pattern:
export const duelKings = pgTable(
  'duel_kings',
  {
    id: serial('id').primaryKey(),
    /** Winner address (Ethereum 0x+40) */
    winnerAddress: varchar('winner_address', { length: 42 }).notNull(),
    /** Consecutive win streak within trailing 7d */
    winStreak: integer('win_streak').notNull().default(0),
    /** Highest pot in trailing 7d (for tie-break) */
    highestPotUsdc: varchar('highest_pot_usdc', { length: 30 }).notNull().default('0'),
    /** Most recent win timestamp (for tie-break) */
    lastWinAt: timestamp('last_win_at'),
    /** Week anchor (ISO date of Monday 00:00 UTC for this week's computation) */
    weekAnchor: timestamp('week_anchor').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    duelKingsWeekIdx: uniqueIndex('duel_kings_week_anchor_idx').on(table.weekAnchor),
  }),
);
```

---

### `apps/relayer/src/routes/duel-live-state.ts` (route, request-response)

**Analog:** `apps/relayer/src/routes/live-state.ts` (full file, 386 lines)

**Route structure pattern** (live-state.ts lines 34–44, 130–175, 196–384):
```typescript
// EXACT copy of live-state.ts structure — only the ABIs and business logic differ:

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { getRedis } from '../lib/redis.js';
import { getLogger } from '../lib/logger.js';
import {
  CHALLENGE_ESCROW_ARBITRUM_SEPOLIA,
  FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA,
  CALL_REGISTRY_ARBITRUM_SEPOLIA,
} from '@call-it/shared';

// Minimal ABI slice for ChallengeEscrow.getChallenge():
const CHALLENGE_ESCROW_ABI = [
  {
    type: 'function',
    name: 'getChallenge',
    inputs: [{ name: 'challengeId', type: 'uint256' }],
    outputs: [{ name: '', type: 'tuple', components: [/* Challenge struct */] }],
    stateMutability: 'view',
  },
] as const;

const CACHE_TTL_SECONDS = 4; // shorter than 5s frontend poll — mirrors live-state.ts line 134

function cacheKey(challengeId: bigint): string {
  return `duel_livestate:${challengeId.toString()}`; // different prefix from `livestate:`
}

export async function duelLiveStateRoute(app: FastifyInstance, _opts: FastifyPluginOptions): Promise<void> {
  app.get<{ Params: { id: string } }>(
    '/api/duels/:id/live-state',
    { schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } } },
    async (request, reply) => {
      // Same cache-check → RPC-fetch → cache-write pattern as live-state.ts lines 210–384
      // Reads: ChallengeEscrow.getChallenge() + FFM.followReserve + FFM.fadeReserve + CR.getCall().expiry
      // Redis cache 4s TTL
      // Structured error: logger.error({ event: 'duel_live_state_error', ... })
    }
  );
}
```

---

### `apps/relayer/src/routes/duels.ts` (route, request-response)

**Analog:** `apps/relayer/src/routes/live-state.ts` (same Fastify plugin structure)

**Fastify route plugin pattern** (live-state.ts lines 179–196):
```typescript
// GET /api/duels — Duels tab feed
// Same export-async-function-with-FastifyInstance signature:
export async function duelsRoute(app: FastifyInstance, _opts: FastifyPluginOptions): Promise<void> {
  app.get<{ Querystring: { status?: string; sort?: string; limit?: string } }>(
    '/api/duels',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' }, // 'active' | 'settled' | 'trending'
            sort: { type: 'string' },
            limit: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const logger = getLogger();
      // 1. Query subgraph for active challenges (GraphQL, paginated at 100 — T-02-07-03 pattern)
      // 2. Query Postgres trending_duels WHERE trending_until > now() (Drizzle pattern from schema.ts)
      // 3. Merge: trending duels first, then active by pot desc
      // Log events: { event: 'duels_route_*' } — mirror notification-fanout.ts log event naming
    }
  );
}
```

---

### `apps/relayer/src/workers/duel-trending-worker.ts` (worker, event-driven)

**Analog:** `apps/relayer/src/workers/notification-fanout.ts` (full file, 502 lines)

**Worker config + handle pattern** (notification-fanout.ts lines 86–104):
```typescript
// Same exported config interface + handle pattern:
export interface DuelTrendingWorkerConfig {
  /** Subgraph URL for querying active duel pot + backer count */
  subgraphUrl: string;
  /** Drizzle ORM database client */
  db: DrizzleDb;
  /** Redis client for cache invalidation (not currently used but consistent with other workers) */
  intervalMs?: number; // default: 60_000 (60s check cadence)
}

export interface DuelTrendingWorkerHandle {
  stop(): void;
  getStats(): { lastRun: number; duelsChecked: number; duelsPromoted: number; errors: number };
}
```

**Tick pattern** (notification-fanout.ts lines 368–476):
```typescript
// Same setInterval → async tick() pattern; same error containment (do NOT throw from tick):
export function startDuelTrendingWorker(config: DuelTrendingWorkerConfig): DuelTrendingWorkerHandle {
  let lastRun = 0;
  let duelsChecked = 0;
  let duelsPromoted = 0;
  let errors = 0;
  let stopped = false;

  async function tick(): Promise<void> {
    if (stopped) return;
    logger.info({ event: 'duel_trending_worker_tick' }, 'Duel trending worker tick');
    try {
      // 1. Query subgraph: active challenges with pot + parent call backer count
      //    (followTotalShares + fadeTotalShares proxies for backer count)
      //    Paginated at 100 per batch (T-02-07-03)
      // 2. For each: if (pot >= 500_000_000n || backers >= 50) → upsert trending_duels
      //    ON CONFLICT (challenge_id) DO UPDATE SET trending_until = now() + 4h, pot_usdc, backer_count
      //    (Drizzle .onConflictDoUpdate — mirrors notification-fanout.ts .onConflictDoNothing)
      // 3. DELETE FROM trending_duels WHERE trending_until < now() (Drizzle .delete().where())
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ event: 'duel_trending_worker_error', error: message });
      errors++;
      // Do NOT throw — interval keeps running
    }
  }

  const intervalId = setInterval(() => {
    tick().catch((err) => {
      logger.error({ event: 'duel_trending_worker_error', error: String(err), phase: 'interval-catch' });
      errors++;
    });
  }, config.intervalMs ?? 60_000);

  return {
    stop() { stopped = true; clearInterval(intervalId); },
    getStats() { return { lastRun, duelsChecked, duelsPromoted, errors }; },
  };
}
```

---

### `apps/relayer/src/workers/duel-king-worker.ts` (worker, batch)

**Analog:** `apps/relayer/src/workers/notification-fanout.ts` (same worker scaffold)

**Weekly repeatable pattern** (same setInterval scaffold but 7-day cadence):
```typescript
// Same export shape as duel-trending-worker.ts.
// intervalMs default: 7 * 24 * 3600 * 1000 (weekly).
// Or: run once on startup then schedule; cron-via-BullMQ is the intended pattern.
//
// Tick logic:
//   1. Query subgraph: settled challenges in last 7d with winner address
//   2. Group by winner, count consecutive wins (ordered by settledAt desc)
//      Streak = longest consecutive run where wins are within 7d window
//   3. Tie-break: most recent win → then highest pot
//   4. Upsert INTO duel_kings (week_anchor = Monday 00:00 UTC)
//      ON CONFLICT (week_anchor) DO UPDATE SET winner_address, win_streak, highest_pot_usdc, last_win_at
//
// Produces placeholder output until Phase 4 settlement creates real settled duels (D-08).
```

---

### `apps/web/app/duel/[challengeId]/page.tsx` (component, request-response)

**Analog:** `apps/web/app/call/[id]/page.tsx` (full file — live receipt page)

**Data fetching + liveness pattern** (call/[id]/page.tsx lines 27–153):
```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount, useReadContracts, useWriteContract } from 'wagmi';
// Add ChallengeEscrow imports:
import { CHALLENGE_ESCROW_ARBITRUM_SEPOLIA, FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA } from '@call-it/shared';

const RELAYER_URL = process.env['NEXT_PUBLIC_RELAYER_URL'] ?? '';

// Live state pattern — mirror fetchCallData() → fetchDuelLiveState():
async function fetchDuelLiveState(challengeId: string): Promise<DuelLiveState | null> {
  if (!RELAYER_URL) return null;
  try {
    const res = await fetch(`${RELAYER_URL}/api/duels/${challengeId}/live-state`);
    if (!res.ok) return null;
    const raw = await res.json() as Record<string, unknown>;
    return { /* map raw fields */ };
  } catch {
    return null;
  }
}

// 5s poll pattern — mirrors call/[id]/page.tsx useEffect with 5s setInterval:
useEffect(() => {
  fetchDuelLiveState(challengeId).then(setLiveState);
  const interval = setInterval(() => fetchDuelLiveState(challengeId).then(setLiveState), 5_000);
  const onFocus = () => fetchDuelLiveState(challengeId).then(setLiveState);
  window.addEventListener('focus', onFocus);
  return () => { clearInterval(interval); window.removeEventListener('focus', onFocus); };
}, [challengeId]);

// Layout: flexbox column — NO display:grid anywhere (Pitfall 15 applies here too).
// Section order (§15.5):
//   1. THE MARKET hero (asset pair, pot, settles-in countdown)
//   2. Two-column duel card — display:flex; flex-direction:row (CALLER / VS / CHALLENGER)
//   3. MARKET CONSENSUS bar (followReserve/fadeReserve ratio from live-state)
//   4. Riding sections — both sides (query subgraph follow/fade positions on parent call)
//   5. "Side with [X]" CTAs → follow/fade on parent FollowFadeMarket call
```

**Contract address constant pattern** (call/[id]/page.tsx lines 92–93):
```typescript
// Never inline addresses — always import from @call-it/shared:
const CE_ADDR = CHALLENGE_ESCROW_ARBITRUM_SEPOLIA as `0x${string}`;
const FFM_ADDR = FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA as `0x${string}`;
```

---

### `apps/web/app/og/duel/[challengeId]/route.ts` (route, request-response)

**Analog:** `apps/web/app/og/[callId]/route.ts` (full file, 477 lines)

**Critical runtime declaration** (og/[callId]/route.ts line 25):
```typescript
// FIRST LINE after imports — this is mandatory and must not be moved:
export const runtime = 'nodejs';
// NOT 'edge'. Pitfall 15 + CLAUDE.md constraint. The existing route.ts enforces this.
```

**viem public client pattern** (og/[callId]/route.ts lines 84–87):
```typescript
// Copy exactly — only the env var name may differ:
const publicClient = createPublicClient({
  chain: arbitrumSepolia,
  transport: http(process.env['ARBITRUM_SEPOLIA_RPC_URL'] ?? 'https://sepolia-rollup.arbitrum.io/rpc'),
});
```

**GET handler structure** (og/[callId]/route.ts lines 336–476):
```typescript
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ challengeId: string }> }
) {
  const { challengeId: challengeIdStr } = await params;
  const url = new URL(req.url);
  void url.searchParams.get('v'); // CDN cache-bust (D-09 pattern)
  const footerBrand = process.env['NEXT_PUBLIC_BRAND_FOOTER'] ?? 'callitapp.xyz · Be right in public.';

  let challengeId: bigint;
  try {
    challengeId = BigInt(challengeIdStr);
    if (challengeId === 0n) throw new Error('challengeId 0 is burned');
  } catch {
    // Invalid → fallback (mirrors SHARE-10 pattern from og/[callId]/route.ts lines 357–362)
    const resp = renderFallback({ handle: 'someone', footerBrand });
    resp.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    resp.headers.set('X-Variant', 'duel-fallback');
    return resp;
  }

  try {
    // RPC reads: ChallengeEscrow.getChallenge() + ProfileRegistry for caller/challenger handles
    // ...
    const imageResponse = new ImageResponse(cardJsx, {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Syne', data: syneBold, style: 'normal', weight: 700 },
        { name: 'SpaceGrotesk', data: spaceGrotesk, style: 'normal', weight: 400 },
        { name: 'JetBrainsMono', data: jetBrainsMono, style: 'normal', weight: 400 },
      ],
    });
    imageResponse.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    imageResponse.headers.set('X-Variant', 'duel-active'); // 'duel-settled' after Phase 4
    return imageResponse;
  } catch {
    // SHARE-10: any error → renderFallback — same as og/[callId]/route.ts lines 468–475
    const resp = renderFallback({ handle: 'someone', footerBrand });
    resp.headers.set('X-Variant', 'duel-fallback');
    return resp;
  }
}
```

**Two-column layout pattern** (og/[callId]/route.ts lines 145–323 — adapt for two-column duel card):
```typescript
// CRITICAL (Pitfall F): Two-column CALLER / VS / CHALLENGER layout must be flex, NOT grid:
function buildDuelCard(props: DuelCardProps): ReactElement {
  return h('div', {
    style: {
      width: '1200px',
      height: '630px',
      background: '#09090E',
      display: 'flex',          // outer container: column
      flexDirection: 'column',
      position: 'relative',
      border: '3px solid #E8F542',
    },
  },
    // ... corner brackets (copy cornerBracket() from route.ts lines 112–122) ...

    // Two-column duel row — MUST be flex row, never grid:
    h('div', {
      style: {
        display: 'flex',        // flex row for two columns
        flexDirection: 'row',
        flex: 1,
      },
    },
      // CALLER column (flex: 1, yellow-green accent #E8F542)
      h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, padding: '24px 32px' } },
        // name, REP, stake, ACCURACY, STREAK stats
      ),
      // VS divider (fixed width, centered)
      h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', width: 80 } },
        // "VS" or "WINS" (stubbed as "VS" until Phase 4 settlement — D-11)
      ),
      // CHALLENGER column (flex: 1, orange accent)
      h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, padding: '24px 32px' } },
        // name, REP, stake, ACCURACY, STREAK stats
      ),
    ),
    // Footer: pot amount
  );
}
// DO NOT USE: display: 'grid', gridTemplateColumns, etc. — Satori silently misrenders.
```

---

## Shared Patterns

### Solidity Pragma + USDC Mandate
**Source:** `packages/contracts/src/FollowFadeMarket.sol` lines 1–29 + `packages/contracts/src/constants/USDC.sol`
**Apply to:** `ChallengeEscrow.sol`, `IChallengeEscrow.sol`, `CeTestHelper.sol`, `DeployPhase3.s.sol`
```solidity
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
import { USDC_ARB_NATIVE } from "./constants/USDC.sol";
// address constant USDC_ARB_NATIVE = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;
// Never paste the literal address. The CI grep guard will catch it.
```

### Ownable2Step + Pausable + ReentrancyGuard inheritance
**Source:** `packages/contracts/src/FollowFadeMarket.sol` line 51
**Apply to:** `ChallengeEscrow.sol`
```solidity
contract ChallengeEscrow is Ownable2Step, ReentrancyGuard, Pausable, IChallengeEscrow {
    using SafeERC20 for IERC20;
```

### setSettlementManager Authorization Seam
**Source:** `packages/contracts/src/CallRegistry.sol` lines 410–414
**Apply to:** `ChallengeEscrow.sol` — exact mirror:
```solidity
address public settlementManager;
modifier onlySettlementManager() {
    if (msg.sender != settlementManager) revert NotSettlementManager();
    _;
}
function setSettlementManager(address newManager) external onlyOwner {
    settlementManager = newManager;
    emit SettlementManagerSet(newManager);
}
```

### CEI Order Enforcement
**Source:** `packages/contracts/src/FollowFadeMarket.sol` lines 278–294 (comment pattern)
**Apply to:** All USDC transfer paths in `ChallengeEscrow.sol`
```solidity
// EFFECTS: ALL state writes before any USDC transfer (CEI)
// INTERACTIONS: USDC transfer LAST (CEI, SAFETY-05, SAFETY-14)
IERC20(USDC_ARB_NATIVE).safeTransferFrom(msg.sender, address(this), amountIn);
```

### SafeERC20 + bool-return exception for push path
**Source:** `packages/contracts/src/FollowFadeMarket.sol` (safeTransfer everywhere except `_pushOverage`)
**Apply to:** `ChallengeEscrow.sol` — use `safeTransfer` everywhere EXCEPT `_pushOverage`, where `IERC20.transfer()` (bool return) is used so push failure does not revert `settleDuel` (Pitfall C, D-03):
```solidity
// Normal paths (claimDuelPayout, claimOverage, rejectChallenge, claimRefund):
IERC20(USDC_ARB_NATIVE).safeTransfer(recipient, amount); // reverts on failure — correct

// Push path only (_pushOverage called from settleDuel):
bool ok = IERC20(USDC_ARB_NATIVE).transfer(overcommitter, overage); // bool, does NOT revert
if (!ok) {
    // rollback + record UnclaimedOverage
    emit UnclaimedOverageCreated(challengeId, overcommitter, overage);
}
```

### Redis Cache + Structured Logging
**Source:** `apps/relayer/src/routes/live-state.ts` lines 130–145, 210–230
**Apply to:** `duel-live-state.ts`, `duels.ts`
```typescript
import { getRedis } from '../lib/redis.js';
import { getLogger } from '../lib/logger.js';
const CACHE_TTL_SECONDS = 4;
function cacheKey(id: bigint): string { return `duel_livestate:${id}`; }
// Log events follow snake_case namespacing: 'duel_live_state_cache_hit', 'duel_live_state_error'
```

### Subgraph GraphQL Pagination
**Source:** `apps/relayer/src/workers/notification-fanout.ts` lines 139–194
**Apply to:** `duel-trending-worker.ts`, `duels.ts`, `duel-king-worker.ts`
```typescript
// Always paginate at 100 per batch (T-02-07-03):
let skip = 0;
const first = 100;
while (true) {
  const query = `query { challenges(first: $first, skip: $skip, ...) { ... } }`;
  const response = await fetch(subgraphUrl, { method: 'POST', ... });
  const positions = json.data?.challenges ?? [];
  allResults.push(...positions);
  if (positions.length < first) break;
  skip += first;
}
```

### Drizzle ON CONFLICT idempotency
**Source:** `apps/relayer/src/workers/notification-fanout.ts` lines 272–282
**Apply to:** `duel-trending-worker.ts` (upsert trending_duels), `duel-king-worker.ts` (upsert duel_kings)
```typescript
// ON CONFLICT DO UPDATE for upsert (trending_duels extends the pin on re-qualification):
await config.db
  .insert(trendingDuels)
  .values({ challengeId, trendingUntil: newExpiry, potUsdc, backerCount })
  .onConflictDoUpdate({
    target: [trendingDuels.challengeId],
    set: { trendingUntil: newExpiry, potUsdc, backerCount, updatedAt: new Date() },
  });
// Compare with notification-fanout.ts which uses onConflictDoNothing (idempotent insert-only)
```

### AssemblyScript no-null pattern
**Source:** `packages/subgraph/src/follow-fade-market.ts` lines 28–46
**Apply to:** `packages/subgraph/src/challenge-escrow.ts`
```typescript
// No null for value types in AssemblyScript — use zero defaults:
position.usdcDeposited = BigInt.fromI32(0);   // not null
position.exitedAt = null;                      // OK for nullable entity fields (Bytes, BigInt as option)
challenge.winner = null;                       // nullable Bytes in schema — OK
challenge.acceptedAt = null;                   // nullable BigInt in schema — OK
```

### OG card fallback contract
**Source:** `apps/web/app/og/[callId]/route.ts` lines 357–362, 468–475
**Apply to:** `apps/web/app/og/duel/[challengeId]/route.ts`
```typescript
// SHARE-10: any error → renderFallback — identical header response shape:
const resp = renderFallback({ handle: handleHint || 'someone', footerBrand });
resp.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
resp.headers.set('X-Variant', 'duel-fallback');
resp.headers.set('X-Reason', 'rpc-error-or-not-found');
return resp;
```

### Addresses single source of truth
**Source:** `packages/shared/src/constants/addresses.ts` lines 92–120
**Apply to:** All new files that need contract addresses (`duel-live-state.ts`, `duels.ts`, `og/duel/[challengeId]/route.ts`, `duel/[challengeId]/page.tsx`)
```typescript
// NEVER inline 0x addresses. Import from @call-it/shared:
import { CHALLENGE_ESCROW_ARBITRUM_SEPOLIA } from '@call-it/shared';
const CE_ADDR = CHALLENGE_ESCROW_ARBITRUM_SEPOLIA as `0x${string}`;
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | All Phase 3 files have strong analogs in the existing codebase. |

The one partial gap is `duel/[challengeId]/page.tsx` which requires composing the two-column duel card UI (CALLER / VS / CHALLENGER) from scratch using the `@call-it/ui` primitives (ConvictionBar, CornerBrackets, MarketPositioningBar) that Phase 1 shipped. The call/[id]/page.tsx provides the data-fetching, liveness, and wagmi read patterns; the two-column layout itself is new but constrained to flexbox-only per Pitfall 15.

---

## Metadata

**Analog search scope:** `packages/contracts/src/`, `packages/contracts/test/`, `packages/contracts/script/`, `packages/subgraph/src/`, `packages/subgraph/schema.graphql`, `packages/subgraph/subgraph.yaml`, `apps/relayer/src/routes/`, `apps/relayer/src/workers/`, `apps/relayer/src/db/`, `apps/web/app/og/`, `apps/web/app/call/`, `packages/shared/src/constants/`

**Files scanned:** 18 analog files read (CallRegistry.sol, FollowFadeMarket.sol, IFollowFadeMarket.sol, ICallRegistry.sol, FfmTestHelper.sol, TvlAggregation.t.sol, DeployPhase2.s.sol, challenge-escrow.ts stub, follow-fade-market.ts, schema.graphql, subgraph.yaml, schema.ts, live-state.ts, notification-fanout.ts, addresses.ts, og/[callId]/route.ts, call/[id]/page.tsx, USDC.sol)

**Pattern extraction date:** 2026-06-01
