# Phase 2: FollowFadeMarket - Pattern Map

**Mapped:** 2026-05-29
**Files analyzed:** 18 new/modified files
**Analogs found:** 16 / 18

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/contracts/src/FollowFadeMarket.sol` | contract (AMM) | CRUD + event-driven | `packages/contracts/src/CallRegistry.sol` | role-match (same CEI/ReentrancyGuard/SafeERC20/Ownable2Step/Pausable stack) |
| `packages/contracts/src/interfaces/IFollowFadeMarket.sol` | interface | N/A | `packages/contracts/src/interfaces/ICallRegistry.sol` | exact |
| `packages/contracts/src/CallRegistry.sol` (redeploy) | contract | CRUD | `packages/contracts/src/CallRegistry.sol` | exact (diff only) |
| `packages/contracts/src/interfaces/ICallRegistry.sol` (update) | interface | N/A | `packages/contracts/src/interfaces/ICallRegistry.sol` | exact |
| `packages/contracts/src/ProfileRegistry.sol` (redeploy) | contract | CRUD | `packages/contracts/src/ProfileRegistry.sol` | exact (diff only) |
| `packages/contracts/src/interfaces/IProfileRegistry.sol` (update) | interface | N/A | `packages/contracts/src/interfaces/IProfileRegistry.sol` | exact |
| `packages/contracts/script/DeployPhase2.s.sol` | deploy script | batch | `packages/contracts/script/DeployPhase1.s.sol` | exact |
| `packages/contracts/test/FollowFadeMarket.t.sol` | test (unit) | CRUD | `packages/contracts/test/CallRegistry.t.sol` | exact |
| `packages/contracts/test/FollowFadeMarketGates.t.sol` | test (fuzz/invariant) | CRUD | `packages/contracts/test/CallRegistryGates.t.sol` | exact |
| `packages/contracts/test/FollowFadeMarketInterference.t.sol` | test (invariant) | CRUD | `packages/contracts/test/CallRegistryGates.t.sol` | role-match |
| `packages/contracts/test/TvlAggregation.t.sol` | test (unit) | CRUD | `packages/contracts/test/CallRegistryGates.t.sol` | role-match |
| `packages/contracts/test/helpers/FfmTestHelper.sol` | test helper | N/A | `packages/contracts/test/CallRegistry.t.sol` setUp() | role-match |
| `packages/shared/src/constants/addresses.ts` (update) | config | N/A | `packages/shared/src/constants/addresses.ts` | exact |
| `packages/subgraph/subgraph.yaml` (update) | config | event-driven | `packages/subgraph/subgraph.yaml` | exact |
| `packages/subgraph/src/follow-fade-market.ts` | subgraph mapping | event-driven | `packages/subgraph/src/call-registry.ts` | role-match |
| `apps/relayer/src/db/schema.ts` (update) | model (Drizzle) | CRUD | `apps/relayer/src/db/schema.ts` | exact |
| `apps/relayer/src/routes/live-state.ts` | route | request-response | `apps/relayer/src/routes/feed.ts` | role-match |
| `apps/relayer/src/routes/quote-stance.ts` | route | request-response | `apps/relayer/src/routes/feed.ts` | role-match |
| `apps/relayer/src/workers/notification-fanout.ts` | worker | event-driven | `apps/relayer/src/workers/polled-events-fallback.ts` | role-match |
| `apps/web/app/call/[id]/page.tsx` | page component | request-response | `apps/web/app/new/page.tsx` + `packages/ui/src/compound/Receipt.tsx` | role-match |
| `apps/web/app/og/[callId]/route.ts` | OG image route | request-response | `apps/web/app/api/og/[callId]/route.ts` | exact |

---

## Pattern Assignments

### `packages/contracts/src/FollowFadeMarket.sol` (contract, CRUD + event-driven)

**Analog:** `packages/contracts/src/CallRegistry.sol`

**Imports pattern** (lines 23–32):
```solidity
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { USDC_ARB_NATIVE } from "./constants/USDC.sol";
import { IProfileRegistry } from "./interfaces/IProfileRegistry.sol";
import { ICallRegistry } from "./interfaces/ICallRegistry.sol";
```
Copy this block verbatim; replace `ICallRegistry` with `IFollowFadeMarket`, add `import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";` for `Math.mulDiv`.

**File header comment pattern** (lines 1–21): Copy the full SPDX + pragma + comment block from CallRegistry.sol lines 1–21. Update spec references to §8.1, §8.7.1, §8.7.2, §11.2, §12.2. Keep the USDC MANDATE comment and CEI ORDER comment verbatim.

**Contract declaration pattern** (line 46):
```solidity
contract FollowFadeMarket is Ownable2Step, ReentrancyGuard, Pausable, IFollowFadeMarket {
    using SafeERC20 for IERC20;
```

**Auth guard pattern for caller-only functions** (lines 370–374):
```solidity
// From CallRegistry.sol setSettlementManager() — copy the onlyOwner + event pattern:
function setFollowFadeMarket(address newMarket) external onlyOwner {
    followFadeMarket = newMarket;
    emit FollowFadeMarketSet(newMarket);
}
```
For `markCallerExited` on CallRegistry: copy the auth-check shape from CallRegistry.sol line 371 (`setSettlementManager`), replacing `onlyOwner` with an explicit `msg.sender` check:
```solidity
function markCallerExited(uint256 callId) external {
    if (msg.sender != followFadeMarket) revert NotAuthorized();
    _calls[callId].status = CallStatus.CallerExited;
    _calls[callId].callerExitedAt = uint64(block.timestamp);
}
```

**CEI pattern for USDC transfer functions** (lines 246–281 — `_executeCreate`):
```solidity
// EFFECTS: state writes before interaction (CEI strict -- SAFETY-05)
// ... all state mutations ...
currentTvl += incoming;

// INTERACTIONS: token pull LAST (CEI, SAFETY-05, SAFETY-14)
IERC20(USDC_ARB_NATIVE).safeTransferFrom(msg.sender, address(this), incoming);
```
In FollowFadeMarket, every function that touches USDC must: (1) do all reserve/share accounting FIRST, (2) then call `safeTransfer` or `safeTransferFrom` LAST. See Research Pattern 4 for the exact penalty-injection ordering.

**Pause carve-out pattern**: `createCall` uses `whenNotPaused` (line 174). For FollowFadeMarket, `follow` and `fade` use `whenNotPaused`; `exitPosition` and `claimPayout` do NOT — they are pause carve-outs (D-06, §10.3). Simply omit the modifier from those functions.

**Constructor pattern** (lines 121–126):
```solidity
constructor(IProfileRegistry _profileRegistry, uint256 _tvlCap) Ownable(msg.sender) {
    require(_tvlCap <= MAX_ALLOWED_CAP, "cap-too-high");
    profileRegistry = _profileRegistry;
    tvlCap = _tvlCap;
    _calls.push(); // burn slot 0
}
```
FollowFadeMarket constructor receives `ICallRegistry _callRegistry`, `IProfileRegistry _profileRegistry`, `address _treasury` — same `Ownable(msg.sender)` pattern.

**View function pattern** (lines 287–310 — `getCall`):
```solidity
function getCall(uint256 callId) external view returns (Call memory) {
    if (callId >= _calls.length) {
        return Call({ ... zero-initialized ... });
    }
    return _calls[callId];
}
```
Copy the bounds-check-then-return pattern for `getPool(callId)` view function.

**Error declaration pattern** (lines 74–106 in ICallRegistry.sol):
```solidity
/// @notice Gate 6.1: stake < MIN_STAKE ($5 USDC). CALL-20.
error StakeBelowMinimum();
```
All FollowFadeMarket errors follow the same NatSpec `/// @notice` + `error` declaration pattern. New errors: `SlippageExceeded(uint256 minOut, uint256 actualOut)`, `CallPastExpiry()`, `ExitCooldownActive(uint64 unlocksAt)`, `CallerExitLocked(uint64 unlocksAt)`, `TvlCapReached(uint256 requested, uint256 available)`, `PositionBelowMinimum()`, `PositionAboveMaximum()`, `NotAuthorized()`, `NotAuthorizedWriter()`, `CallNotLive()`.

---

### `packages/contracts/src/interfaces/IFollowFadeMarket.sol` (interface)

**Analog:** `packages/contracts/src/interfaces/ICallRegistry.sol`

**File header pattern** (lines 1–7):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions"
// Spec: CALL_IT_SPEC1.md §11.2, §12.2 — FollowFadeMarket architecture + function signatures
// Requirement: SOCIAL-01..28, SOCIAL-09
```

**Enum pattern** (lines 14–47 of ICallRegistry.sol): Declare `enum Side { Follow, Fade }` following the same single-value-per-line, zero-indexed pattern. Avoids string-based side parameters.

**Event signature pattern** (lines 49–70 of ICallRegistry.sol):
```solidity
/// @notice Emitted on every successful createCall. CALL-69.
event CallCreated(uint256 indexed id, address indexed caller, MarketType marketType, uint96 stake);
```
Follow the same `/// @notice Emitted ...` NatSpec and `indexed` keyword placement. Indexed fields: `callId` and `user` on Followed/Faded/PositionExited/CallerExited. Non-indexed: amounts, shares.

**Struct declaration pattern** (lines 111–137 of ICallRegistry.sol, `Call` struct):
```solidity
struct Call {
    // slot 1
    address caller;           // 20 bytes
    uint96  stake;            // 12 bytes
    // slot 2
    ...
}
```
The slot-packing comment convention is required; follow it for any structs in IFollowFadeMarket. The per-callId state is stored in flat mappings (not structs in mappings — per Research Pattern 8), but pool-info view return types may use a struct.

---

### `packages/contracts/src/CallRegistry.sol` (redeploy diff)

**Analog:** `packages/contracts/src/CallRegistry.sol` (current)

The redeployed version is the current file plus these concrete diffs:

**New state additions** (insert after line 110, before constructor):
```solidity
/// @notice FollowFadeMarket address; set by owner after Phase 2 deploy. D-02.
address public followFadeMarket;

/// @notice callerExitedAt timestamp per call — set by markCallerExited(). SOCIAL-21.
// NOTE: stored in the Call struct, not a separate mapping. Add to the Call struct below.
```

**Call struct addition** (add `uint64 callerExitedAt` to the struct in ICallRegistry.sol, slot 2, after `openToChallenges`).

**createCall interaction block** (lines 272–278 — replace the single `safeTransferFrom` with stake-forward):
```solidity
// INTERACTIONS: token pull LAST (CEI, SAFETY-05, SAFETY-14)
// D-01: single-custodian — pull stake + fee, forward stake to FollowFadeMarket
IERC20(USDC_ARB_NATIVE).safeTransferFrom(msg.sender, address(this), incoming);
// Forward caller stake to FollowFadeMarket; $5 treasury; $2 virtual stays as accounting
uint256 virtualFadeSeed = BASE_VIRTUAL_FADE + VIRTUAL_FADE_PORTION;
IERC20(USDC_ARB_NATIVE).safeTransfer(treasury, TREASURY_PORTION);
IERC20(USDC_ARB_NATIVE).safeTransfer(followFadeMarket, p.stake);
IFollowFadeMarket(followFadeMarket).initPool(callId, p.stake, virtualFadeSeed);
```

**New guarded status transitions** (add after `setSettlementManager`, lines 371–374):
```solidity
/// @notice Called by FollowFadeMarket to mark a call as CallerExited. D-02.
function markCallerExited(uint256 callId) external {
    if (msg.sender != followFadeMarket) revert NotAuthorized();
    _calls[callId].status = CallStatus.CallerExited;
    _calls[callId].callerExitedAt = uint64(block.timestamp);
}

/// @notice Called by SettlementManager to mark a call as Settled. D-02.
function markSettled(uint256 callId, Outcome outcome) external {
    if (msg.sender != settlementManager) revert NotSettlementManager();
    _calls[callId].status = CallStatus.Settled;
    _calls[callId].outcome = outcome;
}

/// @notice Owner-only: set FollowFadeMarket address after Phase 2 deploy.
function setFollowFadeMarket(address newMarket) external onlyOwner {
    followFadeMarket = newMarket;
    emit FollowFadeMarketSet(newMarket);
}
```

**`computeCallerExitPenalty` implementation** (lines 343–346 — replace stub `return 0` with real formula from Research Pattern 5).

---

### `packages/contracts/src/ProfileRegistry.sol` (redeploy diff)

**Analog:** `packages/contracts/src/ProfileRegistry.sol` (current)

**New state additions** (insert after `address public relayer`, line 102):
```solidity
/// @notice Generic authorized rep-writers set. D-04.
///         FollowFadeMarket authorized at Phase 2 deploy.
///         SettlementManager authorized in Phase 4 — no third redeploy.
mapping(address => bool) public authorizedRepWriters;
```

**New functions** (insert after `setRelayer`, around line 123):
```solidity
/// @notice Owner-only: authorize or revoke a rep writer. D-04.
function setAuthorizedRepWriter(address writer, bool authorized) external onlyOwner {
    authorizedRepWriters[writer] = authorized;
    emit RepWriterSet(writer, authorized);
}

/// @notice Authorized writers only: apply a signed integer delta to globalRep. D-05.
///         Caller MUST be in authorizedRepWriters. Applies immediately, floor 0 (REP-02).
function applyRepDelta(address user, int256 delta) external {
    if (!authorizedRepWriters[msg.sender]) revert NotAuthorizedWriter();
    _initIfNeeded(user);
    int256 current = int256(uint256(_profiles[user].globalRep));
    int256 newRep = current + delta;
    _profiles[user].globalRep = uint128(newRep < 0 ? 0 : uint256(newRep));
    emit RepDeltaApplied(user, delta, _profiles[user].globalRep);
}
```

**`updateAfterSettlement` auth migration** (line 198): Replace `if (msg.sender != settlementManager)` with `if (!authorizedRepWriters[msg.sender])` — same function body, updated guard. This makes it compatible with Phase 4 SettlementManager registration via `setAuthorizedRepWriter` without another redeploy.

**`_initIfNeeded` is unchanged** (lines 211–217) — reuse verbatim.

---

### `packages/contracts/script/DeployPhase2.s.sol` (deploy script)

**Analog:** `packages/contracts/script/DeployPhase1.s.sol`

**File header pattern** (lines 1–24): Copy the full SPDX + pragma + comment block. Update checklist items: add `setFollowFadeMarket`, `setAuthorizedRepWriter(ffm, true)`, asset re-population (25 assets + 6 NFT collections), addresses.ts update note.

**Script structure pattern** (lines 43–95):
```solidity
contract DeployPhase2 is Script {
    uint256 public constant INITIAL_TVL_CAP = 5_000_000_000;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        // 1. Deploy new ProfileRegistry (authorizedRepWriters)
        ProfileRegistry profileRegistry = new ProfileRegistry();
        console.log("ProfileRegistry (v2) deployed at:", address(profileRegistry));

        // 2. Deploy new CallRegistry (points at new ProfileRegistry; has setFollowFadeMarket)
        CallRegistry callRegistry = new CallRegistry(
            IProfileRegistry(address(profileRegistry)),
            INITIAL_TVL_CAP
        );
        console.log("CallRegistry (v2) deployed at:", address(callRegistry));

        // 3. Deploy FollowFadeMarket
        // 4. Wire setFollowFadeMarket on CallRegistry
        // 5. Re-populate asset allowlist (25 coins + 6 collections)
        // 6. setAuthorizedRepWriter(ffm, true) on ProfileRegistry
        vm.stopBroadcast();

        // Post-deploy assertions (copy from DeployPhase1 lines 82–93)
        require(callRegistry.tvlCap() == INITIAL_TVL_CAP, "tvlCap mismatch");
        require(callRegistry.currentTvl() == 0, "currentTvl nonzero");
    }
}
```

**Post-deploy assertion pattern** (lines 82–93): Copy `require(callRegistry.tvlCap() == ...)` pattern. Add assertions for `callRegistry.followFadeMarket() == address(followFadeMarket)` and `profileRegistry.authorizedRepWriters(address(followFadeMarket)) == true`.

**console.log output pattern** (lines 59–79): Follow the same summary block format — log all 3 deployed addresses and instruct operator to update addresses.ts + subgraph.yaml.

---

### `packages/contracts/test/FollowFadeMarket.t.sol` (unit tests)

**Analog:** `packages/contracts/test/CallRegistry.t.sol`

**File header + pragma pattern** (lines 1–13):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions"
// Spec: CALL_IT_SPEC1.md §12.2 — FollowFadeMarket function signatures + events + reverts
// Requirement: SOCIAL-01..28

import { Test } from "forge-std/Test.sol";
import { FollowFadeMarket } from "../src/FollowFadeMarket.sol";
import { CallRegistry } from "../src/CallRegistry.sol";
import { ProfileRegistry } from "../src/ProfileRegistry.sol";
import { MockUSDC } from "./mocks/MockUSDC.sol";
```

**setUp pattern** (lines 35–70): Copy the full `setUp()` structure — `makeAddr`, `vm.startPrank(owner)`, deploy contracts, `addAsset`, `vm.stopPrank()`, `vm.etch(USDC_ARB_NATIVE, ...)`, `usdc.mint(alice, ...)`, `usdc.approve(address(registry), type(uint256).max)`. For FollowFadeMarket tests, also deploy FFM and wire `callRegistry.setFollowFadeMarket(address(ffm))`.

**Helper function pattern** (lines 73–96 — `_createEthCall`):
```solidity
function _createEthCall(
    address caller,
    uint96 stake,
    uint8 conviction,
    uint256 assetKey
) internal returns (uint256 callId) {
    vm.prank(caller);
    callId = registry.createCall(...);
}
```
Add analogous `_follow(address user, uint256 callId, uint256 amountIn, uint256 minSharesOut)` and `_fade(...)` helpers.

**Test naming pattern**: `/// @notice CALL-37: ...` → `/// @notice SOCIAL-01: AMM follow mints shares proportionally`. Function names: `test_followSharesMinted`, `test_fadePastExpiry_reverts`, etc.

**vm.expectRevert pattern** (used in CallRegistryGates.t.sol lines 65–75):
```solidity
vm.expectRevert(ICallRegistry.StakeBelowMinimum.selector);
registry.createCall(...);
```
Copy for FFM: `vm.expectRevert(IFollowFadeMarket.SlippageExceeded.selector)`.

---

### `packages/contracts/test/FollowFadeMarketGates.t.sol` (invariant fuzz)

**Analog:** `packages/contracts/test/CallRegistryGates.t.sol`

**Contract + setUp pattern** (lines 19–48): Copy the full fuzz test class structure with `setUp()`. Increase TVL cap to `100_000e6` (same as CallRegistryGates) so fuzz inputs aren't TVL-gated.

**Fuzz test pattern** (lines 52–100):
```solidity
/// @notice Gate 6.1: fuzz stake from 1..200e6.
function test_fuzz_stake_bounds(uint96 stake) public {
    stake = uint96(bound(stake, 1, 200e6));
    ...
}
```
Copy the `bound()` pattern for AMM fuzz: `amountIn = uint96(bound(amountIn, 1e6, 100e6))`. For invariant tests, use Foundry's `invariant_` prefix (not `test_fuzz_`).

**Invariant test format** (from RESEARCH.md lines 972–998):
```solidity
contract FollowFadeMarketInvariantTest is Test {
    function invariant_kNeverShrinks() public view { ... }
    function invariant_usdcBalanceMatchesReserves() public view { ... }
}
```

---

### `packages/contracts/test/helpers/FfmTestHelper.sol` (test helper)

**Analog:** `packages/contracts/test/CallRegistry.t.sol` setUp()

Copy the full `setUp()` pattern from CallRegistry.t.sol lines 35–70 and extract it into a `FfmTestHelper` contract that `FollowFadeMarket.t.sol`, `FollowFadeMarketGates.t.sol`, and `TvlAggregation.t.sol` all inherit. Add `_seedPool(uint256 callId, address caller, uint96 stake)` helper that does `createCall` + asserts pool is initialized.

---

### `packages/shared/src/constants/addresses.ts` (update)

**Analog:** `packages/shared/src/constants/addresses.ts` (current)

**Constant naming pattern** (lines 89–113): Copy the exact export pattern for new constants:
```typescript
/**
 * FollowFadeMarket on Arbitrum Sepolia (Phase 2 deploy).
 *
 * DEPLOYED {date} via DeployPhase2.s.sol ...
 * Deploy block: {block}. Deployer/owner: {addr}.
 *
 * Post-deploy smoke test (§19.11) — all green:
 *   cast call <addr> "getTvl()"  -> 0  ✓
 */
export const FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA =
  '0x...' as const;

export const FOLLOW_FADE_MARKET_ARBITRUM_ONE =
  '0x0000000000000000000000000000000000000000' as const;
```

**AddressRecord map pattern** (lines 119–141): Update `FOLLOW_FADE_MARKET_ADDRESSES` (already declared as `EMPTY_ADDRESSES` placeholder at line 140) to use real constants. Update `CALL_REGISTRY_ADDRESSES` and `PROFILE_REGISTRY_ADDRESSES` to point at new v2 addresses after redeploy.

**Deprecation comment pattern** (lines 119–126): Keep `@deprecated` JSDoc comment on old address records; the new individual constants are the canonical form.

---

### `packages/subgraph/subgraph.yaml` (update)

**Analog:** `packages/subgraph/subgraph.yaml` (current)

**Data source update pattern** (lines 102–125 — FollowFadeMarket placeholder block):
```yaml
  - kind: ethereum/contract
    name: FollowFadeMarket
    network: arbitrum-sepolia
    source:
      # Phase 2: Deployed FollowFadeMarket on Arbitrum Sepolia (2026-05-XX).
      address: "0x<REAL_ADDRESS>"
      abi: FollowFadeMarket
      startBlock: <DEPLOY_BLOCK>
    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      file: ./src/follow-fade-market.ts
      entities: [Call, Position, PositionExit, CallerExit, TvlSnapshot]
      abis:
        - name: FollowFadeMarket
          file: ./abis/FollowFadeMarket.json
      eventHandlers:
        - event: Followed(indexed uint256,indexed address,uint256,uint256)
          handler: handleFollowed
        - event: Faded(indexed uint256,indexed address,uint256,uint256)
          handler: handleFaded
        - event: PositionExited(indexed uint256,indexed address,uint8,uint256,uint256)
          handler: handlePositionExited
        - event: CallerExited(indexed uint256,indexed address,uint64,uint256,uint256,int256)
          handler: handleCallerExited
        - event: PoolInitialized(indexed uint256,uint256,uint256)
          handler: handlePoolInitialized
```
Replace the placeholder `blockHandlers` block with these `eventHandlers`. Also update `CallRegistry` and `ProfileRegistry` addresses + `startBlock` values to match redeploy.

---

### `packages/subgraph/src/follow-fade-market.ts` (subgraph mapping)

**Analog:** `packages/subgraph/src/call-registry.ts`

**File header + imports pattern** (lines 1–24 of call-registry.ts):
```typescript
// AssemblyScript constraints:
//   - No closures
//   - No null for value types (use 0 / empty string / Bytes.empty())
//   - @graphprotocol/graph-ts BigInt / Bytes helpers required for uint256 / bytes32

import { BigInt, Bytes } from '@graphprotocol/graph-ts';
import {
  Followed, Faded, PositionExited, CallerExited, PoolInitialized
} from '../generated/FollowFadeMarket/FollowFadeMarket';
import { Position, PositionExit, CallerExit, TvlSnapshot } from '../generated/schema';
```

**Helper function pattern** (lines 27–46 of call-registry.ts — `ensureProfile`):
```typescript
function ensureProfile(id: string): Profile {
  let profile = Profile.load(id);
  if (profile == null) {
    profile = new Profile(id);
    profile.globalRep = 100;
    // ... zero-init all fields ...
  }
  return profile as Profile;
}
```
Add analogous `ensurePosition(id: string): Position` and `ensureCallerExit(callId: string): CallerExit` helpers.

**Event handler pattern** (lines 52–76 of call-registry.ts — `handleCallCreated`):
```typescript
export function handleFollowed(event: Followed): void {
  let callId = event.params.callId.toString();
  let userHex = event.params.user.toHexString();
  let positionId = callId + '-' + userHex + '-follow';

  let position = ensurePosition(positionId);
  position.callId = callId;
  position.user = userHex;
  position.side = 'follow';
  position.usdcDeposited = position.usdcDeposited.plus(event.params.amountIn);
  position.sharesHeld = position.sharesHeld.plus(event.params.sharesOut);
  position.entryTime = event.block.timestamp;
  position.save();
}
```
Copy the load-or-create + field-set + save pattern for all 5 handlers.

---

### `apps/relayer/src/db/schema.ts` (update — add notifications + quote_stance tables)

**Analog:** `apps/relayer/src/db/schema.ts` (current, lines 17–91)

**Import additions** (line 17 — current):
```typescript
import { pgTable, serial, varchar, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
```
Add `jsonb, pgEnum` to this import line for the notifications table.

**New table pattern** (copy `addressBook` table structure lines 29–43):
```typescript
// ---------------------------------------------------------------------------
// notifications
// ---------------------------------------------------------------------------

/**
 * Per-user in-app notifications. D-13/D-14.
 * Generic event_type column — 'caller_exited' in Phase 2; extensible for Phase 3/4.
 * Never deleted; read_at NULL = unread.
 * Index: (user_address, read_at) for inbox queries; (user_address, created_at DESC) for pagination.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userAddress: varchar('user_address', { length: 42 }).notNull(),
    eventType: varchar('event_type', { length: 50 }).notNull(),
    callId: integer('call_id').notNull(),
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    /** NULL = unread */
    readAt: timestamp('read_at'),
  },
  (table) => ({
    notificationsUserReadIdx: index('notifications_user_read_idx').on(table.userAddress, table.readAt),
    notificationsUserTimeIdx: index('notifications_user_time_idx').on(table.userAddress, table.createdAt),
  }),
);

// ---------------------------------------------------------------------------
// quote_stance
// ---------------------------------------------------------------------------

/**
 * Off-chain quote-call stance annotation. D-15.
 * Keyed to on-chain CallQuoted event (parentCallId + quoteCallId pair).
 */
export const quoteStance = pgTable(
  'quote_stance',
  {
    id: serial('id').primaryKey(),
    callId: integer('call_id').notNull(),
    quoteCallId: integer('quote_call_id').notNull(),
    stance: varchar('stance', { length: 10 }).notNull(), // 'following' | 'fading'
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    quoteStanceQuoteIdx: index('quote_stance_quote_idx').on(table.quoteCallId),
  }),
);
```
Note: `jsonb` from drizzle-orm/pg-core follows the same `pgTable(name, columns, indexes)` three-arg shape as `addressBook`.

---

### `apps/relayer/src/routes/live-state.ts` (new route)

**Analog:** `apps/relayer/src/routes/feed.ts`

**File header + Fastify plugin pattern** (lines 1–59 of feed.ts):
```typescript
/**
 * GET /api/calls/:id/live-state — proxies live FollowFadeMarket reads for SSR.
 *
 * Security:
 *   - No auth gate (public read — spec §18.1)
 *   - RPC URL held server-side only
 *
 * Requirements: D-07, D-08
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getLogger } from '../lib/logger.js';

export async function liveStateRoute(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  app.get<{ Params: { id: string } }>(
    '/api/calls/:id/live-state',
    { schema: { params: { type: 'object', properties: { id: { type: 'string' } } } } },
    async (request, reply) => {
      const logger = getLogger();
      const callId = BigInt(request.params.id);
      // ... viem readContracts for followReserve, fadeReserve, totalShares ...
    },
  );
}
```

**Redis cache pattern** (lines 81–97 of feed.ts — first-page cache check): Copy the `redis.get(cacheKey)` + `JSON.parse` + `reply.header('x-source', 'cache')` pattern. Use `livestate:{callId}` as key with a 4s TTL (shorter than the 5s poll interval).

**Pino log event naming** (lines 135–140 of feed.ts):
```typescript
logger.warn({ event: 'feed_fallback_engaged', cursor }, '...');
```
Use the same `{ event: 'live_state_...' }` structured-log format for live-state route events.

---

### `apps/relayer/src/routes/quote-stance.ts` (new route)

**Analog:** `apps/relayer/src/routes/feed.ts`

Same Fastify plugin pattern. POST endpoint writing to `quoteStance` Drizzle table; GET endpoint reading by `quoteCallId`. Copy the try/catch + `reply.send(responseData)` pattern from feed.ts lines 164–196.

---

### `apps/relayer/src/workers/notification-fanout.ts` (new worker)

**Analog:** `apps/relayer/src/workers/polled-events-fallback.ts`

**File header + interface pattern** (lines 1–35 of polled-events-fallback.ts):
```typescript
/**
 * Notification fan-out worker.
 *
 * Watches CallerExited events via subgraph polling.
 * Resolves current followers/faders via subgraph query.
 * Writes one notification row per affected user into Fly Postgres.
 * NO on-chain loops — all off-chain (gas/DoS safety). D-13, D-14.
 *
 * Security (T-00-22): Worker is read-only against public RPC for event detection;
 * subgraph query is server-side only.
 */

import type { PublicClient } from 'viem';
import { logger } from '../lib/logger.js';
```

**Config interface pattern** (lines 23–35 of polled-events-fallback.ts — `PolledEventsConfig`):
```typescript
export interface NotificationFanoutConfig {
  publicClient: PublicClient;
  ffmAddress: Address;
  db: DrizzleDb;       // Fly Postgres connection
  subgraphUrl: string;
  intervalMs: number;  // default 30_000 (30s)
}
```

**Handle interface pattern** (lines 37–43 — `PolledEventsHandle`): Copy the `stop()` + `getStats()` return shape.

**Polling loop pattern** (lines 52–142):
```typescript
export function startNotificationFanout(config: NotificationFanoutConfig): NotificationFanoutHandle {
  // ... same stopped / intervalId / errors state as polled-events-fallback.ts ...

  async function tick(): Promise<void> {
    if (stopped) return;
    // 1. getLogs for CallerExited since lastBlockSeen (same viem getLogs pattern lines 88–93)
    // 2. For each CallerExited event: query subgraph for current holders
    // 3. db.insert(notifications).values(rows) — Drizzle insert
    // 4. Bump statusVersion in Redis for OG cache-bust (D-09)
  }

  intervalId = setInterval(() => { tick().catch(...) }, intervalMs);
  return { stop() {...}, getStats() {...} };
}
```

**Error handling pattern** (lines 121–130 of polled-events-fallback.ts):
```typescript
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error({
    event: 'notification_fanout_error',
    error: message,
    lastBlockSeen: lastBlockSeen.toString(),
  });
  errors++;
  // Do NOT throw — the interval must keep running through transient errors
}
```

**Telegram alert integration** (from `apps/relayer/src/workers/alerts.ts` line 126): Call `sendAlert('caller_exited_broadcast', { callId, caller })` after fan-out succeeds. Add `'caller_exited_broadcast'` to the `AlertEvent` union as a P1 event (informational, per D-13 public broadcast).

---

### `apps/web/app/call/[id]/page.tsx` (Live Receipt page)

**Analog:** `apps/web/app/new/page.tsx` (lines 1–60) + `packages/ui/src/compound/Receipt.tsx`

**File header + 'use client' pattern** (line 1 of new/page.tsx):
```typescript
'use client';
```
The Live Receipt page is a client component for the wagmi hooks. Any static data (call metadata from subgraph) can be server-fetched in a parent `layout.tsx` or via `generateStaticParams`, but the live-state portion must be client-side.

**Privy + wagmi import pattern** (lines 3–18 of new/page.tsx):
```typescript
import { usePrivy } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import { useReadContracts } from 'wagmi';
import type { Address } from 'viem';
```

**useReadContracts live-state pattern** (from RESEARCH.md lines 719–737):
```typescript
const { data } = useReadContracts({
  contracts: [
    { address: FFM_ADDR, abi: ffmAbi, functionName: 'followReserve', args: [callId] },
    { address: FFM_ADDR, abi: ffmAbi, functionName: 'fadeReserve', args: [callId] },
    // ... (8 reads total per RESEARCH.md)
  ],
  query: {
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    staleTime: 4000,
  }
});
```
This is the primary pattern for the MarketPositioningBar and FourStatRow. Import `ffmAbi` from `@/lib/abis` (same pattern as `callRegistryAbi` in `usePublishCall.ts` line 15).

**Receipt component reuse** (`packages/ui/src/compound/Receipt.tsx` line 74):
```typescript
<Receipt mode="live" data={{ handle, marketLine, conviction, deadline, stake }} />
```
The Live Receipt page renders `<Receipt mode="live" ...>` as the hero. `ReceiptData` type at lines 29–51 already has the `live` mode defined.

**useToast + error display pattern** (new/page.tsx uses `useToast` from `@call-it/ui`): Copy the same `show: showToast` pattern for slippage-exceeded feedback (D-10).

**Modal state pattern** (lines 39–41 of new/page.tsx):
```typescript
const [isModalOpen, setIsModalOpen] = useState(false);
```
Copy for `isFollowModalOpen`, `isFadeModalOpen`, `isCallerExitModalOpen`, `isPositionExitModalOpen`.

**OG meta tag pattern**: Server component or layout must render `<meta property="og:image" content={`/og/${callId}?v=${statusVersion}`} />` — follow the existing `og:image` pattern established in the Phase 0 fallback route header.

---

### `apps/web/app/og/[callId]/route.ts` (OG card variant 1)

**Analog:** `apps/web/app/api/og/[callId]/route.ts`

**Runtime declaration** (line 24 of analog):
```typescript
export const runtime = 'nodejs'; // CRITICAL: not 'edge'
```
Copy verbatim. This is the most critical single line — wrong runtime breaks `@vercel/og`.

**Route handler signature** (lines 35–38 of analog):
```typescript
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ callId: string }> }
) {
  const { callId } = await params;
```
Copy this exact async params-unwrap pattern (Next.js 16 App Router requires `await params`).

**`?v` query param extraction** (line 44 of analog):
```typescript
const url = new URL(req.url);
const handle = (url.searchParams.get('handle') ?? '').slice(0, 32);
```
For Live variant: `const v = url.searchParams.get('v') ?? '0';` — the cache-bust version param (D-09).

**Cache-Control pattern** (line 68 of analog):
```typescript
imageResponse.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
imageResponse.headers.set('X-Variant', 'fallback');
```
For Live variant, set `X-Variant: live` and `max-age=60, stale-while-revalidate=300` (D-09: CDN re-served within 60s of cache-bust).

**`renderFallback` import origin**: The `renderFallback` import at line 27 of analog comes from `@/lib/og-fallback-render`. Add `renderLiveVariant` to the same file or a new `@/lib/og-live-render.ts`. The Live variant's JSX must be flexbox-only — no `display: grid`.

**Error fallback pattern** (lines 55–58 of analog TODO comment): Implement the TODO — on subgraph lookup failure, fall through to `renderFallback` (SHARE-10 contract).

---

## Shared Patterns

### CEI (Checks-Effects-Interactions) — USDC Transfer Order
**Source:** `packages/contracts/src/CallRegistry.sol` lines 246–278
**Apply to:** `FollowFadeMarket.sol` every function with USDC transfer (`follow`, `fade`, `exitPosition`, `callerExit`, `initPool`)
```solidity
// EFFECTS: ALL state writes (reserves, shares, positions, statuses) FIRST
followReserve[callId] += amountIn;
followTotalShares[callId] += sharesOut;
followShares[callId][msg.sender] += sharesOut;

// INTERACTIONS: token movement LAST
IERC20(USDC_ARB_NATIVE).safeTransferFrom(msg.sender, address(this), amountIn);
```

### ReentrancyGuard Usage
**Source:** `packages/contracts/src/CallRegistry.sol` line 174 (`nonReentrant`)
**Apply to:** All public/external functions in `FollowFadeMarket.sol` that touch USDC (`follow`, `fade`, `exitPosition`, `callerExit`, `initPool`)
```solidity
function follow(uint256 callId, uint256 amountIn, uint256 minSharesOut)
    external nonReentrant whenNotPaused { ... }
```

### onlyOwner Admin Setters
**Source:** `packages/contracts/src/CallRegistry.sol` lines 350–385
**Apply to:** `FollowFadeMarket.sol` admin setters (`setTreasury`, `setTvlCap`, `pause`, `unpause`), `CallRegistry.sol` v2 (`setFollowFadeMarket`, `setSettlementManager`), `ProfileRegistry.sol` v2 (`setAuthorizedRepWriter`)
```solidity
function setTreasury(address newTreasury) external onlyOwner {
    treasury = newTreasury;
    emit TreasurySet(newTreasury);
}
```

### Solidity Pragma + USDC Constant
**Source:** `packages/contracts/src/CallRegistry.sol` lines 2–9
**Apply to:** Every new .sol file in `packages/contracts/src/`
```solidity
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// USDC MANDATE (§10.5): ALL transfer paths use USDC_ARB_NATIVE from ./constants/USDC.sol.
// Never paste the literal address in this file. The CI grep guard will catch it.
```

### Pino Structured Logging
**Source:** `apps/relayer/src/routes/feed.ts` lines 78–140
**Apply to:** `live-state.ts`, `quote-stance.ts`, `notification-fanout.ts`
```typescript
import { getLogger } from '../lib/logger.js';
// Usage:
logger.info({ event: 'notification_fanout_started', callId }, 'Fan-out worker started');
logger.error({ event: 'notification_fanout_error', error: message }, 'Fan-out error');
```
Always use `{ event: '<snake_case_name>', ...context }` as the first arg to pino methods. Never log sensitive data (wallet private keys, TELEGRAM_BOT_TOKEN).

### Fastify Plugin Pattern
**Source:** `apps/relayer/src/routes/feed.ts` lines 56–198
**Apply to:** `live-state.ts`, `quote-stance.ts`
```typescript
export async function myRoute(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  app.get<{ Params: ..., Querystring: ... }>(
    '/api/path',
    { schema: { ... } },
    async (request, reply) => { ... },
  );
}
```

### MockUSDC + vm.etch Test Setup
**Source:** `packages/contracts/test/CallRegistry.t.sol` lines 35–70
**Apply to:** `FollowFadeMarket.t.sol`, `FollowFadeMarketGates.t.sol`, `TvlAggregation.t.sol`
```solidity
address USDC_ARB_NATIVE = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;
vm.etch(USDC_ARB_NATIVE, address(usdc).code);
usdc = MockUSDC(USDC_ARB_NATIVE);
usdc.mint(alice, 1000e6);
vm.prank(alice);
usdc.approve(address(ffm), type(uint256).max);
```

### Drizzle Table Declaration
**Source:** `apps/relayer/src/db/schema.ts` lines 29–43 (`addressBook`)
**Apply to:** `notifications` and `quote_stance` new tables
```typescript
export const myTable = pgTable(
  'my_table',
  {
    id: serial('id').primaryKey(),
    // ... column definitions
  },
  (table) => ({
    myIdx: index('my_idx').on(table.colA, table.colB),
  }),
);
```

### AssemblyScript Mapping Handler
**Source:** `packages/subgraph/src/call-registry.ts` lines 52–90
**Apply to:** `packages/subgraph/src/follow-fade-market.ts` all 5 handlers
```typescript
export function handleFollowed(event: Followed): void {
  let id = event.params.id.toString();
  let entity = Entity.load(id);
  if (entity == null) {
    entity = new Entity(id);
  }
  entity.field = event.params.field;
  entity.save();
}
```
No closures, no null for value types, always `.toString()` on BigInt IDs, always `.toHexString()` on address params.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `apps/web/app/og/[callId]/route.ts` (Live variant rendering) | OG image renderer | request-response | The Phase 0 analog (`api/og/[callId]/route.ts`) exists but only renders fallback — the live-state data fetch + JSX flexbox card layout is genuinely new. Route structure is an exact analog; the JSX render function has no codebase precedent. |
| `packages/contracts/test/FollowFadeMarketInterference.t.sol` | invariant test | N/A | Multi-call interference fixture is a new test pattern — no existing multi-contract invariant tests in the repo. Use `CallRegistryGates.t.sol` fuzz structure but no direct analog for the AMM k-invariant property across call IDs. |

---

## Metadata

**Analog search scope:** `packages/contracts/src/`, `packages/contracts/test/`, `packages/contracts/script/`, `apps/relayer/src/`, `apps/web/app/`, `packages/ui/src/`, `packages/shared/src/`, `packages/subgraph/`
**Files scanned:** 32
**Pattern extraction date:** 2026-05-29
