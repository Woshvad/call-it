# Phase 6: Safety Review + Sepolia 48h Soak + Multisig Promotion — Pattern Map

**Mapped:** 2026-06-03
**Files analyzed:** 12 new/modified files
**Analogs found:** 12 / 12

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/contracts/src/constants/USDC.sol` | config | transform | self (extend in place) | exact |
| `packages/contracts/script/DeployPhase6.s.sol` | script/deploy | request-response | `packages/contracts/script/DeployPhase5_1.s.sol` | exact |
| `packages/contracts/script/TransferOwnershipToSafe.s.sol` | script/admin | request-response | `packages/contracts/script/CutoffFallback.s.sol` + `DeployPhase5Stylus.s.sol` | role-match |
| `packages/contracts/test/SettlementManagerForkTest.sol` (EXTEND) | test | request-response | self (extend in place) | exact |
| `packages/contracts/test/SettlementSafetyMatrix.t.sol` | test | CRUD | `packages/contracts/test/CallRegistrySafety.t.sol` | exact |
| `packages/contracts/test/TvlAggregation.t.sol` (EXTEND) | test | CRUD | self (extend in place) | exact |
| `packages/contracts/test/CallRegistrySafety.t.sol` (EXTEND) | test | CRUD | self (extend in place) | exact |
| `packages/contracts/test/RevertingStylusEngineDrill.t.sol` | test | request-response | `packages/contracts/script/CutoffFallback.s.sol` + `SettlementManagerForkTest.sol` | role-match |
| `apps/relayer/src/scripts/soak-seeder.ts` | script/worker | batch | `apps/relayer/src/scripts/backfill-criteria.ts` + `apps/relayer/src/workers/stylus-deactivation-watcher.ts` | role-match |
| `apps/scripts/deploy-safe.ts` | script/utility | request-response | `apps/relayer/src/scripts/backfill-criteria.ts` | role-match |
| `apps/scripts/rehearse-ownership.ts` | script/utility | request-response | `apps/relayer/src/scripts/backfill-criteria.ts` | role-match |
| `.github/workflows/grep-guards.yml` (EXTEND) | config/CI | transform | self (extend in place) | exact |
| `packages/shared/src/constants/addresses.ts` (EXTEND) | config | transform | self (extend in place) | exact |
| `packages/subgraph/subgraph.yaml` (EXTEND) | config | transform | self (extend in place) | exact |

---

## Pattern Assignments

---

### `packages/contracts/src/constants/USDC.sol` (config, extend in place)

**Analog:** Self — the existing file is the only source of truth. Read before editing.

**Current content** (lines 1–19):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
// Source: CLAUDE.md "Pinned Addresses (Arbitrum One Mainnet)"
// Spec: CALL_IT_SPEC1.md ss10.5 -- USDC mandate; hardcoded address contract
// Requirement: SAFETY-13, OPS-22
//
// This is the SINGLE SOURCE OF TRUTH for the USDC address in Solidity.
// WARNING: Do NOT use 0xFF970A61...DB5CC8 (bridged USDC.e)
// The CI grep guard (usdc-paste in .github/workflows/grep-guards.yml) will fail
// the build if the bridged address appears anywhere except the TypeScript fixture file.

// Native USDC address on Arbitrum One (Circle canonical deployment).
// ERC-2612 permit supported. Redeemable 1:1 with Circle via CCTP.
// Network: Arbitrum One (chain ID 42161)
address constant USDC_ARB_NATIVE = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;
```

**Extension to add** (after the existing constant, per D-01 / ADR-0001):
```solidity
/// @notice Official Circle USDC on Arbitrum Sepolia (testnet). Chain ID 421614.
/// @dev 6 decimals — same parity as mainnet. Faucetable via faucet.circle.com.
///      Source: ADR-0001; cast code 0x75faf114... verified bytecode, decimals()=6.
address constant USDC_ARB_SEPOLIA = 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d;

/// @notice Returns the canonical USDC address for the current chain.
/// @dev SAFETY-13 invariant preserved: on mainnet (42161) only USDC_ARB_NATIVE.
///      On Sepolia (421614) only USDC_ARB_SEPOLIA.
///      Reverts on any other chain — prevents accidental deploy to wrong network.
function resolveUsdc() view returns (address) {
    if (block.chainid == 42161)  return USDC_ARB_NATIVE;
    if (block.chainid == 421614) return USDC_ARB_SEPOLIA;
    revert("USDC: unsupported chain");
}
```

**Constructor assertion pattern** (how each money contract must change):
```solidity
// Before (Phase 5.1 pattern in DeployPhase5_1.s.sol lines 185-192, 200-208):
ChallengeEscrow ce = new ChallengeEscrow(..., USDC_ARB_NATIVE, ...);
SettlementManager sm = new SettlementManager(..., USDC_ARB_NATIVE, ...);

// After (Phase 6 pattern):
ChallengeEscrow ce = new ChallengeEscrow(..., resolveUsdc(), ...);
SettlementManager sm = new SettlementManager(..., resolveUsdc(), ...);
// Constructor require inside each contract:
//   require(_usdc == resolveUsdc(), "wrong USDC");  // chainid-gated
```

---

### `packages/contracts/script/DeployPhase6.s.sol` (script/deploy, request-response)

**Analog:** `packages/contracts/script/DeployPhase5_1.s.sol` — copy the full structure verbatim, change only what the USDC gate and Phase-6 version comments require.

**Header/imports pattern** (lines 1–76 of DeployPhase5_1.s.sol):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack -- Pinned Versions"
// ...
import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { CallRegistry } from "../src/CallRegistry.sol";
import { ChallengeEscrow } from "../src/ChallengeEscrow.sol";
import { FollowFadeMarket } from "../src/FollowFadeMarket.sol";
import { ProfileRegistry } from "../src/ProfileRegistry.sol";
import { SettlementManager } from "../src/SettlementManager.sol";
import { ICallRegistry } from "../src/interfaces/ICallRegistry.sol";
import { IChallengeEscrow } from "../src/interfaces/IChallengeEscrow.sol";
import { IProfileRegistry } from "../src/interfaces/IProfileRegistry.sol";
import { ISettlementManager } from "../src/interfaces/ISettlementManager.sol";
// Phase 6 CHANGE: import both constants + the new resolver
import { USDC_ARB_NATIVE, USDC_ARB_SEPOLIA, resolveUsdc } from "../src/constants/USDC.sol";
```

**Address constants block** (lines 93–134 of DeployPhase5_1.s.sol — KEEP the unchanged contracts, UPDATE the comment headers):
```solidity
contract DeployPhase6 is Script {
    // Phase 5.1 deployed addresses — unchanged by Phase 6 USDC redeploy
    // NOTE: these are the Phase 05.1 addresses being SUPERSEDED by this redeploy.
    // Record new Phase 6 addresses in addresses.ts after broadcast.
    address public constant PROFILE_REGISTRY     = 0xAfe239a3606b89Ef65DbBcDb1b87a920052c359E;
    address public constant STYLUS_SCORE_ENGINE_PROXY = 0xe7e15980C40db52BFC6dcaBb21B3d90edFB27c14;
    address public constant PROXY_ADMIN          = 0xAeA5a279DDF1625490c5F4284eF0D735BB56044a;

    address public constant PYTH_ARBITRUM_SEPOLIA = 0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DAF;

    uint256 public constant TVL_CAP = 5_000_000_000;    // $5,000 USDC
    uint256 public constant PYTH_ETH_BUDGET = 0.05 ether;
```

**Core deploy block pattern** (lines 136–364 of DeployPhase5_1.s.sol — key change is the USDC argument):
```solidity
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address treasuryAddress = vm.envAddress("TREASURY_ADDRESS");
        address kmsNftTwap       = vm.envAddress("KMS_ADDRESS_NFT_TWAP");
        address kmsDefiLlama     = vm.envAddress("KMS_ADDRESS_DEFILLAMA");
        address kmsSnapshotTally = vm.envAddress("KMS_ADDRESS_SNAPSHOT_TALLY");
        address kmsCex           = vm.envAddress("KMS_ADDRESS_CEX");

        vm.startBroadcast(deployerKey);

        // 1. Deploy CallRegistry v4 (USDC constructor change requires new bytecode)
        CallRegistry cr = new CallRegistry(IProfileRegistry(PROFILE_REGISTRY), TVL_CAP);

        // 2. Redeploy FFM v4 (immutable CR ref)
        FollowFadeMarket ffm = new FollowFadeMarket(address(cr), PROFILE_REGISTRY, treasuryAddress);

        // 3. Redeploy ChallengeEscrow v3 (immutable CR+FFM refs)
        // Phase 6 KEY CHANGE: resolveUsdc() instead of USDC_ARB_NATIVE
        // On Sepolia broadcast: resolveUsdc() == USDC_ARB_SEPOLIA (Circle testnet)
        // On mainnet broadcast (Phase 7): resolveUsdc() == USDC_ARB_NATIVE
        ChallengeEscrow ce = new ChallengeEscrow(
            address(cr), address(ffm),
            resolveUsdc(),        // <-- was USDC_ARB_NATIVE in Phase 5.1
            treasuryAddress, TVL_CAP
        );

        // 4. Deploy SettlementManager v5
        SettlementManager sm = new SettlementManager(
            address(cr), address(ffm), address(ce),
            PROFILE_REGISTRY,
            resolveUsdc(),        // <-- was USDC_ARB_NATIVE in Phase 5.1
            treasuryAddress,
            PYTH_ARBITRUM_SEPOLIA
        );
        // ... wire setSettlementManager, setAdapterMap, setAttestationSigner
        // ... same as DeployPhase5_1.s.sol steps 3-8 (identical wiring)
```

**Post-deploy assertion pattern** (lines 366–595 of DeployPhase5_1.s.sol — extend with USDC gate assertion):
```solidity
        // After vm.stopBroadcast() — run identical assertions as DeployPhase5_1.s.sol PLUS:
        // Phase 6 USDC gate assertion — must pass before redeploy is trusted (ADR-0001)
        require(
            address(sm.usdc()) == resolveUsdc(),
            "DeployPhase6: sm.usdc() != resolveUsdc() -- USDC gate failure"
        );
        require(
            address(ce.usdc()) == resolveUsdc(),
            "DeployPhase6: ce.usdc() != resolveUsdc() -- USDC gate failure"
        );
        // ... all other assertions from DeployPhase5_1.s.sol verbatim
```

---

### `packages/contracts/script/TransferOwnershipToSafe.s.sol` (script/admin, request-response)

**Analog 1:** `packages/contracts/script/CutoffFallback.s.sol` — env-var pattern for addresses, vm.startBroadcast + ProxyAdmin interaction, post-op assertions.

**Analog 2:** `packages/contracts/script/DeployPhase5Stylus.s.sol` lines 128–138 — how to read the EIP-1967 admin slot and verify ProxyAdmin.owner():
```solidity
// From DeployPhase5Stylus.s.sol lines 131-138:
bytes32 adminSlot = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;
address proxyAdminAddr = address(uint160(uint256(vm.load(address(proxy), adminSlot))));
require(
    ProxyAdmin(proxyAdminAddr).owner() == vm.addr(deployerKey),
    "DeployPhase5: ProxyAdmin.owner() mismatch"
);
```

**CutoffFallback env + broadcast pattern** (lines 55–93):
```solidity
// From CutoffFallback.s.sol lines 55-93:
import { ProxyAdmin } from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import { ITransparentUpgradeableProxy } from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

contract CutoffFallback is Script {
    address public constant PROXY_ADMIN_ADDR       = 0xAeA5a279DDF1625490c5F4284eF0D735BB56044a;
    address public constant PROXY_ADDR             = 0xe7e15980C40db52BFC6dcaBb21B3d90edFB27c14;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        ProxyAdmin(PROXY_ADMIN_ADDR).upgradeAndCall(
            ITransparentUpgradeableProxy(payable(PROXY_ADDR)),
            SOLIDITY_BASELINE_ADDR, ""
        );

        vm.stopBroadcast();
        // post-op require assertions follow
    }
}
```

**TransferOwnershipToSafe core pattern** (new file built from above):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { ProxyAdmin } from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { CallRegistry } from "../src/CallRegistry.sol";
// ... other contract imports

contract TransferOwnershipToSafe is Script {
    // Addresses from Phase 6 redeploy (fill from addresses.ts after DeployPhase6.s.sol broadcast)
    // These constants are the Phase-6 addresses, set at execution time.
    address public constant PROXY_ADMIN_ADDR = ...; // from addresses.ts PROXY_ADMIN_ARBITRUM_SEPOLIA

    function run() external {
        address safe = vm.envAddress("SAFE_ADDRESS");
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        // 5 Ownable2Step contracts (transferOwnership — step 1 of 2):
        CallRegistry(CR).transferOwnership(safe);
        FollowFadeMarket(FFM).transferOwnership(safe);
        ChallengeEscrow(CE).transferOwnership(safe);
        SettlementManager(SM).transferOwnership(safe);
        ProfileRegistry(PR).transferOwnership(safe);

        // ProxyAdmin for StylusScoreEngine (plain Ownable — single-step):
        // OZ 5.x auto-created ProxyAdmin uses plain Ownable (not Ownable2Step)
        // transferOwnership is final for ProxyAdmin — Safe becomes admin immediately
        ProxyAdmin(PROXY_ADMIN_ADDR).transferOwnership(safe);

        vm.stopBroadcast();

        // Post-transfer verification: pendingOwner() == safe on all 5 Ownable2Step contracts
        require(CallRegistry(CR).pendingOwner() == safe, "CR pendingOwner mismatch");
        require(FollowFadeMarket(FFM).pendingOwner() == safe, "FFM pendingOwner mismatch");
        require(ChallengeEscrow(CE).pendingOwner() == safe, "CE pendingOwner mismatch");
        require(SettlementManager(SM).pendingOwner() == safe, "SM pendingOwner mismatch");
        require(ProfileRegistry(PR).pendingOwner() == safe, "PR pendingOwner mismatch");
        // ProxyAdmin: owner() == safe (single-step, no pendingOwner)
        require(ProxyAdmin(PROXY_ADMIN_ADDR).owner() == safe, "ProxyAdmin owner mismatch");

        console.log("All 6 ownership transfers initiated. Safe:", safe);
        console.log("NEXT: Safe must execute acceptOwnership() on 5 Ownable2Step contracts.");
        console.log("ProxyAdmin ownership is immediately transferred (Ownable, not Ownable2Step).");
    }
}
```

**CRITICAL NOTE — Dual ownership mechanism:**
- The 5 protocol contracts (CR/FFM/CE/SM/PR) inherit `Ownable2Step` — `transferOwnership` sets `pendingOwner` only; `owner()` does NOT change until the Safe executes `acceptOwnership()`.
- The ProxyAdmin (auto-created by OZ 5.x `TransparentUpgradeableProxy`) inherits plain `Ownable` — `transferOwnership` is immediate and final.
- Source of truth: `DeployPhase5Stylus.s.sol` line 103: `new StatelessTransparentProxy(stylusImplAddr, vm.addr(deployerKey))` — the `initialOwner_` becomes the ProxyAdmin owner. `StatelessTransparentProxy` extends OZ's `TransparentUpgradeableProxy` which auto-creates `ProxyAdmin(initialOwner)` in OZ 5.x (confirmed in `StatelessTransparentProxy.sol` NatDoc lines 23–25).

---

### `packages/contracts/test/SettlementManagerForkTest.sol` (test, extend in place)

**Analog:** Self — the existing file is the mainnet-fork harness. Extend rather than replace.

**Fork setUp pattern** (lines 67–144 — reuse verbatim for new test methods):
```solidity
// From SettlementManagerForkTest.sol lines 67-144:
function setUp() public {
    vm.createSelectFork(vm.envString("ARB_ONE_RPC_URL"));
    // ... deploy fresh cluster against the fork using USDC_ARB_NATIVE
    // Fund alice + bob from USDC_WHALE = 0x489ee077994B6658eAfA855C308275EAd8097C4A
    vm.prank(USDC_WHALE);
    IERC20(USDC_ARB_NATIVE).transfer(alice, 1000e6);
    // Fund SM with ETH for Pyth fees
    vm.deal(address(sm), 0.1 ether);
}
```

**Real USDC settle try/catch pattern** (lines 181–194 — extend with deterministic Pyth mock path):
```solidity
// Existing pattern (lines 181-194):
try sm.settle(callId, new bytes[](0), new uint256[](0)) {
    // Settlement completed
    uint256 treasuryBalAfter = IERC20(USDC_ARB_NATIVE).balanceOf(treasury);
    assertGt(treasuryBalAfter, treasuryBalBefore, "Treasury should receive fees from real USDC settle");
} catch (bytes memory err) {
    // Stale price on fork — expected in CI without real Hermes VAA
    emit log_bytes(err);
}

// Phase 6 extension — add deterministic Pyth mock path for full suite:
// vm.mockCall allows settle() to complete regardless of Pyth staleness:
vm.mockCall(
    PYTH_ARBITRUM_ONE,
    abi.encodeWithSelector(IPyth.getPriceNoOlderThan.selector, feedId, 60),
    abi.encode(PythStructs.Price({price: 3000e6, conf: 100, expo: -6, publishTime: block.timestamp}))
);
sm.settle(callId, new bytes[](0), new uint256[](0));
// Now assert fee extraction + claimPayout + rep update deterministically
```

**New test methods to add** (full loop per RESEARCH.md Wave 2 plan):
- `test_fullLoop_createFollowSettleClaimPayout()` — create → follow → mock-Pyth settle → claimPayout; assert fee extraction + winner USDC receipt
- `test_fullLoop_createFadeSettleClaimPayout()` — same with fade side winning
- `test_fullLoop_callerExit()` — create → follow → warp 24h+1s → callerExit → assert penalty + payouts
- `test_fullLoop_duel_settleChallenge()` — create → proposeChallenge → acceptChallenge → settle → claimPayout from ChallengeEscrow
- `test_fullLoop_dispute_ownerResolve()` — create → stake → settle → raiseDispute → resolveDispute (owner) → payout

---

### `packages/contracts/test/SettlementSafetyMatrix.t.sol` (test, CRUD — new file)

**Primary analog:** `packages/contracts/test/CallRegistrySafety.t.sol` — header, setUp style, owner-only / pause / reentrancy assertion pattern.

**Header + setUp pattern** (lines 1–59 of CallRegistrySafety.t.sol):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack — Pinned Versions"
// Spec: CALL_IT_SPEC1.md §10.3 — pause + withdraw carve-out; §12 settlement idempotency
// Requirement: SAFETY-34, SAFETY-37, SAFETY-39 (+ SAFETY-30 FFM/CE/SM pause gaps)

import { Test } from "forge-std/Test.sol";
import { CallRegistry } from "../src/CallRegistry.sol";
import { ProfileRegistry } from "../src/ProfileRegistry.sol";
import { FollowFadeMarket } from "../src/FollowFadeMarket.sol";
import { ChallengeEscrow } from "../src/ChallengeEscrow.sol";
import { SettlementManager } from "../src/SettlementManager.sol";
import { ICallRegistry } from "../src/interfaces/ICallRegistry.sol";
import { MockUSDC } from "./mocks/MockUSDC.sol";

contract SettlementSafetyMatrixTest is Test {
    // Use FfmTestHelper stack or declare full stack here (like ForkTest)
    // Use MockUSDC (etched at USDC_ADDR) + MockPyth for deterministic tests
    address internal constant USDC_ADDR = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;
```

**Pause/withdraw carve-out pattern** (SAFETY-34 — adapted from CallRegistrySafety.t.sol lines 64–78):
```solidity
// From CallRegistrySafety.t.sol lines 64-78 (pause-blocks-createCall):
function test_pause_blocks_createCall_revert_EnforcedPause() public {
    vm.prank(owner);
    registry.pause();
    vm.prank(alice);
    vm.expectRevert(); // EnforcedPause()
    registry.createCall(...);
}

// Extend pattern for SAFETY-34: withdraw/claim MUST NOT revert when paused:
function test_withdraw_while_paused_succeeds() public {
    // 1. Seed call + follow (USDC locked)
    // 2. pause()
    vm.prank(owner);
    sm.pause();
    // 3. claimPayout/exitPosition should still succeed (pause has a carve-out)
    vm.prank(alice);
    ffm.exitPosition(callId, IFollowFadeMarket.Side.Follow); // must NOT revert
}
```

**Owner-only guard pattern** (SAFETY-43 — lines 184–217 of CallRegistrySafety.t.sol):
```solidity
// Template to copy for each guarded function:
function test_only_owner_<functionName>() public {
    vm.prank(alice);
    vm.expectRevert(
        abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice)
    );
    <contract>.<functionName>(<args>);
}
```

**UTC dup-hash edge pattern** (SAFETY-37 — new, use vm.warp):
```solidity
// SAFETY-37: Two calls with the same hash but in different UTC-day windows
// must not trip the activeDuplicateHashes guard on the second day.
function test_duplicateHash_utcDayBoundary() public {
    bytes32 hash = keccak256(abi.encode("test-hash"));
    // Call 1: created just before midnight UTC
    vm.warp(86400 - 1);  // 23:59:59 UTC day 0
    uint256 id1 = registry.createCall(..., hash, ...);
    // Settle id1 — clears activeDuplicateHashes[hash]
    // Call 2: created just after midnight UTC (day 1)
    vm.warp(86400 + 1);  // 00:00:01 UTC day 1
    uint256 id2 = registry.createCall(..., hash, ...);  // must NOT revert
    assertGt(id2, 0);
}
```

**Settlement idempotency pattern** (SAFETY-39):
```solidity
// SAFETY-39: second settle() call on an already-settled callId must revert cleanly.
function test_settle_idempotency() public {
    // Settle once (succeed with mock Pyth)
    sm.settle(callId, ...);
    // Settle again — must revert (not panic, not corrupt state)
    vm.expectRevert(); // InvalidCallStatus or similar
    sm.settle(callId, ...);
}
```

---

### `packages/contracts/test/TvlAggregation.t.sol` (EXTEND in place)

**Analog:** Self — copy the existing `test_tvlBoundary5001Reverts` pattern and add a `ChallengeEscrow` variant.

**Existing boundary pattern** (lines 100–116):
```solidity
// From TvlAggregation.t.sol lines 100-116:
function test_tvlBoundary5001Reverts() public {
    uint256 callId = _seedPool(alice, 100e6);
    uint256 currentCombined = registry.currentTvl() + ffm.getTvl();
    vm.prank(owner);
    registry.setTvlCap(currentCombined);
    vm.prank(bob);
    vm.expectRevert(); // TvlCapReached
    ffm.follow(callId, 1e6, 0);
}
```

**SAFETY-31 extension** (new method — add ChallengeEscrow USDC balance to aggregate):
```solidity
// SAFETY-31: TVL cap must aggregate CR + FFM + ChallengeEscrow USDC balance.
// Pitfall 3 explicitly flags that ChallengeEscrow is NOT currently in the aggregate.
// This test verifies that $5,001 split across CR+FFM+CE reverts TvlCapReached.
function test_tvlBoundary_includesChallengeEscrow() public {
    // Seed call + follow to $4,800 across CR+FFM
    // Add $200 to ChallengeEscrow via proposeChallenge + acceptChallenge
    // Total = $5,000 — at cap
    // Next $1 follow must revert TvlCapReached
    vm.expectRevert(); // TvlCapReached
    ffm.follow(callId, 1e6, 0);
}
```

---

### `packages/contracts/test/CallRegistrySafety.t.sol` (EXTEND in place)

**Analog:** Self — add `test_only_owner_*` variants for SAFETY-43 gaps (FFM/CE/SM pause + owner guards not yet covered).

**Existing owner-guard pattern** (lines 184–217 — exact template to replicate for new contracts):
```solidity
// Template from CallRegistrySafety.t.sol lines 184-217:
function test_only_owner_pause() public {
    vm.prank(alice);
    vm.expectRevert(
        abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice)
    );
    registry.pause();
}

function test_only_owner_setSettlementManager() public {
    vm.prank(alice);
    vm.expectRevert(
        abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice)
    );
    registry.setSettlementManager(alice);
}
```

---

### `packages/contracts/test/RevertingStylusEngineDrill.t.sol` (test, new file — SAFETY-42 unit)

**Primary analog:** `packages/contracts/test/SettlementManagerForkTest.sol` — fork setUp, vm.deal for ETH, MockUSDC, settle() call structure.

**Secondary analog:** `packages/contracts/script/CutoffFallback.s.sol` — ProxyAdmin.upgradeAndCall pattern and EIP-1967 slot verification.

**ProxyAdmin upgrade pattern** (from CutoffFallback.s.sol lines 64–83):
```solidity
// CutoffFallback.s.sol lines 64-83:
ProxyAdmin(PROXY_ADMIN_ADDR).upgradeAndCall(
    ITransparentUpgradeableProxy(payable(PROXY_ADDR)),
    SOLIDITY_BASELINE_ADDR,
    ""
);
bytes32 implSlotValue = vm.load(PROXY_ADDR, IMPL_SLOT);
address impl = address(uint160(uint256(implSlotValue)));
require(impl == SOLIDITY_BASELINE_ADDR, "CutoffFallback: implementation mismatch");
```

**Drill test structure** (new file):
```solidity
// SAFETY-42 unit drill — mirrors live Sepolia drill in Foundry test environment
// Uses vm.prank(proxyAdminOwner) + ProxyAdmin.upgradeAndCall to swap in RevertingStylusEngine
// then settles a call and asserts RepCalculatedFallback event fires.
function test_stylus_fallback_fires_RepCalculatedFallback() public {
    // 1. Upgrade proxy to RevertingStylusEngine
    vm.prank(proxyAdminOwner);
    ProxyAdmin(PROXY_ADMIN_ADDR).upgradeAndCall(
        ITransparentUpgradeableProxy(payable(STYLUS_PROXY)), REVERTING_ENGINE, ""
    );
    // 2. Settle a call
    vm.expectEmit(true, true, false, false);
    emit RepCalculatedFallback(callId, alice, <baseline_delta>, <error_bytes>);
    sm.settle(callId, ...);
    // 3. Assert sm.usdc() balance routing is correct (fees still land in treasury)
    // 4. Assert Call.status == Settled
    // 5. Restore real engine
    vm.prank(proxyAdminOwner);
    ProxyAdmin(PROXY_ADMIN_ADDR).upgradeAndCall(
        ITransparentUpgradeableProxy(payable(STYLUS_PROXY)), REAL_ENGINE, ""
    );
}
```

---

### `apps/relayer/src/scripts/soak-seeder.ts` (script/worker, batch — new file)

**Primary analog:** `apps/relayer/src/scripts/backfill-criteria.ts` — script bootstrap pattern, env loading, main() + process.exit, sequential-action loop with error tracking.

**Bootstrap pattern** (lines 1–56 of backfill-criteria.ts):
```typescript
// From backfill-criteria.ts lines 1-56:
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvIfNeeded(): void {
  if (!process.env.POSTGRES_URL) {
    const envCandidates = [
      resolve(__dirname, '../../../.env.local'),
      resolve(__dirname, '../../../../.env'),
    ];
    for (const envPath of envCandidates) {
      if (existsSync(envPath)) {
        try { process.loadEnvFile(envPath); if (process.env.X) break; } catch { }
      }
    }
  }
}
loadEnvIfNeeded();

async function main(): Promise<void> {
  // ... sequential action loop
  let inserted = 0, errors = 0;
  for (const row of ITEMS) {
    try { /* action */ inserted++; }
    catch (err) { console.error(...); errors++; }
  }
  if (errors > 0) { process.exit(1); }
  process.exit(0);
}
main().catch((err) => { console.error('fatal:', err); process.exit(1); });
```

**Alert send pattern** (from stylus-deactivation-watcher.ts lines 162–169 — reuse for soak alerts):
```typescript
// From stylus-deactivation-watcher.ts lines 162-169:
await sendAlert('stylus_reactivation', {
  daysRemaining: Math.floor(daysRemaining),
  threshold: thresholdDays,
  expiryTimestamp,
  stylusAddress,
  runbookUrl: '...',
});
// Use sendAlertSafe from alerts.ts for non-crashing variant in loops (WR-03)
import { sendAlertSafe } from '../workers/alerts.js';
```

**Redis idempotency lock pattern** (from stylus-deactivation-watcher.ts lines 155–158):
```typescript
// From stylus-deactivation-watcher.ts lines 155-158:
const lockKey = `stylus:alert-fired:T-${thresholdDays}d:${dateKey}`;
const acquired = await redis.set(lockKey, '1', 'EX', 86400, 'NX');
if (acquired === 'OK') {
  // Fire once per day — idempotent
}
```

**Evidence log pattern** (new in soak-seeder.ts — JSON append per action):
```typescript
// Evidence log emit — one entry per soak action (D-05)
interface EvidenceEntry {
  action: 'callCreated' | 'followed' | 'faded' | 'settled' | 'callerExited'
        | 'challengeProposed' | 'challengeAccepted' | 'challengeSettled'
        | 'disputeRaised' | 'disputeResolved' | 'settlementDelayed';
  txHash: `0x${string}`;
  callId?: number;
  walletIndex?: number;
  timestamp: number;
  block?: number;
}
// Write to evidence/phase-6-soak/evidence-${Date.now()}.jsonl (append-only)
```

---

### `apps/scripts/deploy-safe.ts` (script/utility, request-response — new file)

**Analog:** `apps/relayer/src/scripts/backfill-criteria.ts` — script bootstrap + main() + process.exit pattern.

**New file structure** (combine bootstrap pattern with Safe protocol-kit v7 API from RESEARCH.md Pattern 4):
```typescript
// apps/scripts/deploy-safe.ts
import Safe, { SafeAccountConfig } from '@safe-global/protocol-kit';

loadEnvIfNeeded();

async function main(): Promise<void> {
  const safeAccountConfig: SafeAccountConfig = {
    owners: [
      process.env.SIGNER_1!,   // hardware wallet address
      process.env.SIGNER_2!,   // backup key 1
      process.env.SIGNER_3!,   // backup key 2
    ],
    threshold: 2,
  };

  const protocolKit = await Safe.init({
    provider: process.env.RPC_URL!,           // ARBITRUM_SEPOLIA_RPC_URL or ARBITRUM_ONE_RPC_URL
    signer: process.env.DEPLOYER_PRIVATE_KEY!,
    predictedSafe: { safeAccountConfig },
  });

  const safeAddress = await protocolKit.getAddress();
  const deploymentTx = await protocolKit.createSafeDeploymentTransaction();
  // send tx, wait for receipt, log safeAddress
  console.log('Safe deployed at:', safeAddress);
  process.exit(0);
}
main().catch((err) => { console.error('fatal:', err); process.exit(1); });
```

---

### `apps/scripts/rehearse-ownership.ts` (script/utility, request-response — new file)

**Analog:** `apps/relayer/src/scripts/backfill-criteria.ts` — script bootstrap + sequential action loop.

**Core pattern** (Safe protocol-kit v7 batch transaction from RESEARCH.md Pattern 4):
```typescript
// apps/scripts/rehearse-ownership.ts
import { encodeFunctionData } from 'viem';

const OWNABLE2STEP_ABI = [
  { name: 'acceptOwnership', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] }
] as const;

// Create Safe batch tx: acceptOwnership on all 5 Ownable2Step contracts
const acceptOwnershipData = encodeFunctionData({
  abi: OWNABLE2STEP_ABI,
  functionName: 'acceptOwnership',
});

const safeTransactionData = OWNABLE2STEP_CONTRACTS.map(addr => ({
  to: addr,
  value: '0',
  data: acceptOwnershipData,
}));
// Sign with signer 1 + signer 2 (2-of-3 threshold) via protocol-kit
// Execute via protocolKit.executeTransaction()
// Verify: viem publicClient.readContract(contract, 'owner') == safeAddress
```

---

### `.github/workflows/grep-guards.yml` (CI config, extend in place)

**Analog:** Self — the `usdc-paste` job (lines 25–76) is the direct target for extension.

**Current guard pattern** (lines 43–59 — USDC.e bridged address check):
```yaml
# From grep-guards.yml lines 43-59:
- name: Check for bridged USDC.e address (0xff970a61)
  run: |
    if rg --hidden --no-ignore \
        --type ts --type js \
        --glob '**/*.rs' \
        --glob '!packages/shared/src/constants/usdc.ts' \
        --glob '!**/node_modules/**' \
        --glob '!**/out/**' \
        --glob '!**/.next/**' \
        --glob '!**/target/**' \
        --glob '!**/.turbo/**' \
        --glob '!**/dist/**' \
        --ignore-case '0xff970a61' \
        .; then
      echo "::error::Bridged USDC.e address found outside fixture." && exit 1
    fi
```

**Extension needed** — add a second step inside the `usdc-paste` job after the existing `.sol` check (line 76), implementing the 2-address allowlist described in D-01:
```yaml
# Phase 6 addition: 2-address allowlist check
# Forbid any USDC-like canonical address that is NOT in {USDC_ARB_NATIVE, USDC_ARB_SEPOLIA}
# Note: the existing USDC.e guard (0xff970a61) REMAINS UNCHANGED — still forbidden absolutely.
- name: USDC address allowlist (mainnet + Circle Sepolia only)
  run: |
    USDC_MAINNET="af88d065e77c8cc2239327c5edb3a432268e5831"
    USDC_SEPOLIA="75faf114eafb1bdbe2f0316df893fd58ce46aa4d"
    # Find any address in USDC.sol, addresses.ts, or deploy scripts that matches
    # the two known USDC address prefixes but is NOT one of the two allowed addresses.
    # Grep for addresses starting with af88 or 75faf and reject any that don't match exactly.
    VIOLATIONS=$(rg --hidden --no-ignore \
        --glob '**/*.sol' --glob '**/*.ts' \
        --glob '!**/node_modules/**' --glob '!**/out/**' \
        --glob '!**/target/**' --glob '!**/.next/**' \
        --ignore-case "(af88d065|75faf114)" \
        -o \
        | grep -iv "$USDC_MAINNET" | grep -iv "$USDC_SEPOLIA" || true)
    if [ -n "$VIOLATIONS" ]; then
      echo "::error::USDC address outside 2-address allowlist: $VIOLATIONS"; exit 1
    fi
    echo "PASS: All USDC addresses are in the 2-address allowlist."
```

---

### `packages/shared/src/constants/addresses.ts` (config, extend in place)

**Analog:** Self — copy the existing constant pattern exactly. Each constant has a JSDoc block with deploy block, tx, and threat note.

**Existing constant pattern** (lines 87–88 — copy format for 4 new Phase-6 addresses):
```typescript
// Template from addresses.ts lines 87-88:
export const CALL_REGISTRY_ARBITRUM_SEPOLIA =
  '0x9E3E467e5D1F1266354444CEaC67651c7e9CACEc' as const;
  // Phase 05.1 cluster redeploy 2026-06-02 (block 273493950); supersedes ...
```

**Circle Sepolia USDC constant to add** (new, at top of file near USDC section):
```typescript
/**
 * Circle official USDC on Arbitrum Sepolia (testnet). Chain ID 421614.
 * 6 decimals — same parity as mainnet USDC. Faucetable via faucet.circle.com.
 * Source: ADR-0001; verified via cast code + decimals() == 6.
 * Matches USDC_ARB_SEPOLIA in packages/contracts/src/constants/USDC.sol.
 */
export const USDC_ARB_SEPOLIA =
  '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d' as const;
```

**Safe addresses to add** (after Phase 6 redeploy):
```typescript
export const SAFE_ARBITRUM_SEPOLIA = '<2-of-3 Safe on Sepolia after deploy>' as const;
export const SAFE_ARBITRUM_ONE     = '<2-of-3 Safe on Arbitrum One after deploy>' as const;
```

---

### `packages/subgraph/subgraph.yaml` (config, extend in place)

**Analog:** Self — the existing datasource block pattern (lines 6–16) is the template.

**Existing datasource pattern** (lines 6–16):
```yaml
dataSources:
  - kind: ethereum/contract
    name: CallRegistry
    network: arbitrum-sepolia
    source:
      # Phase 6 v4: Redeployed CallRegistry on Arbitrum Sepolia (Phase 6 redeploy).
      # Matches CALL_REGISTRY_ARBITRUM_SEPOLIA in packages/shared/src/constants/addresses.ts.
      address: "0x9E3E467e5D1F1266354444CEaC67651c7e9CACEc"  # <-- UPDATE to Phase 6 address
      abi: CallRegistry
      startBlock: 273493950    # <-- UPDATE to Phase 6 deploy block
```

**Update rule:** Replace `address` and `startBlock` for all 4 redeployed contracts (CR/FFM/CE/SM). ProfileRegistry and StylusScoreEngine proxy are NOT redeployed — their entries are unchanged.

---

## Shared Patterns

### Solidity Pragma Pin
**Source:** Every existing `.sol` file in `packages/contracts/`
**Apply to:** ALL new/modified Solidity files
```solidity
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack -- Pinned Versions"
```

### Environment Variable Loading (Foundry scripts)
**Source:** `packages/contracts/script/DeployPhase5_1.s.sol` lines 141–156
**Apply to:** `DeployPhase6.s.sol`, `TransferOwnershipToSafe.s.sol`
```solidity
// NEVER hardcode private keys or KMS addresses — always from env
uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
address treasuryAddress = vm.envAddress("TREASURY_ADDRESS");
address kmsNftTwap = vm.envAddress("KMS_ADDRESS_NFT_TWAP");
// ...
```

### Post-Deploy Assertions (Foundry scripts)
**Source:** `packages/contracts/script/DeployPhase5_1.s.sol` lines 366–595
**Apply to:** `DeployPhase6.s.sol` (extend with USDC gate assertion), `TransferOwnershipToSafe.s.sol` (pendingOwner assertions)
```solidity
// Run AFTER vm.stopBroadcast() -- view calls cost no gas.
// If any require fails, the script exits non-zero and deployment is flagged.
require(condition, "DeployPhaseN: description mismatch");
```

### Deployment Summary Console Log
**Source:** `packages/contracts/script/DeployPhase5_1.s.sol` lines 558–636
**Apply to:** `DeployPhase6.s.sol`, `TransferOwnershipToSafe.s.sol`
```solidity
console.log("---");
console.log("DEPLOYMENT SUMMARY (Arbitrum Sepolia -- Phase 6)");
console.log("CallRegistry v4:      ", address(cr));
// ... all new addresses
console.log("REQUIRED NEXT STEPS:");
console.log("1. Update packages/shared/src/constants/addresses.ts:");
// ... with new addresses
```

### Telegram Alert (TypeScript workers/scripts)
**Source:** `apps/relayer/src/workers/alerts.ts` — `sendAlertSafe()` (line 165) for loops, `sendAlert()` (line 128) for critical paths
**Apply to:** `apps/relayer/src/scripts/soak-seeder.ts` (soak event alerts)
```typescript
import { sendAlertSafe } from '../workers/alerts.js';
// In worker loops — use sendAlertSafe (swallows + logs, does not crash loop):
await sendAlertSafe('settle_stuck_25m', { callId, elapsed: Date.now() - startTime });
```

### OZ 5.x ProxyAdmin EIP-1967 Admin Slot Read
**Source:** `packages/contracts/script/DeployPhase5Stylus.s.sol` lines 131–138
**Apply to:** `TransferOwnershipToSafe.s.sol` (to find ProxyAdmin address at runtime)
```solidity
// EIP-1967 admin slot = keccak256("eip1967.proxy.admin") - 1
bytes32 adminSlot = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;
address proxyAdminAddr = address(uint160(uint256(vm.load(address(proxy), adminSlot))));
```

### OZ 5.x ProxyAdmin upgradeAndCall
**Source:** `packages/contracts/script/CutoffFallback.s.sol` lines 64–83
**Apply to:** `RevertingStylusEngineDrill.t.sol` (upgrade to RevertingStylusEngine + restore)
```solidity
ProxyAdmin(PROXY_ADMIN_ADDR).upgradeAndCall(
    ITransparentUpgradeableProxy(payable(PROXY_ADDR)),
    NEW_IMPL_ADDR,
    ""   // no initialize() call for stateless engine
);
```

---

## No Analog Found

All files have close analogs. No greenfield patterns required.

| File | Role | Notes |
|------|------|-------|
| `evidence/phase-6-soak/` directory | artifact | No code analog — plain JSON/JSONL evidence log directory. Create as empty dir with a `.gitkeep` and a schema comment file. |

---

## Metadata

**Analog search scope:** `packages/contracts/script/`, `packages/contracts/test/`, `packages/contracts/src/constants/`, `apps/relayer/src/workers/`, `apps/relayer/src/scripts/`, `.github/workflows/`, `packages/shared/src/constants/`, `packages/subgraph/`

**Files scanned:** 23 source files read in full or in targeted sections

**Key observations for planner:**
1. `DeployPhase5_1.s.sol` is the exact template for `DeployPhase6.s.sol` — the diff is minimal: import `resolveUsdc()`, replace two `USDC_ARB_NATIVE` args in constructors with `resolveUsdc()`, add USDC gate assertions, update version comments.
2. `TransferOwnershipToSafe.s.sol` has a dual mechanism: 5 contracts use `Ownable2Step` (two-step), while `ProxyAdmin` uses plain `Ownable` (single-step, immediate). The script must document and assert both behaviors distinctly.
3. `SettlementManagerForkTest.sol` extension: the existing `try/catch` pattern gracefully handles stale Pyth — Phase 6 must add a `vm.mockCall` path to achieve deterministic test completion for the full loop assertions.
4. `TvlAggregation.t.sol` extension: SAFETY-31 requires adding `ChallengeEscrow` to the TVL aggregate. The existing `test_tvlBoundary5001Reverts` uses `registry.setTvlCap(currentCombined)` as the trigger — the CE extension should follow the same pattern by seeding a ChallengeEscrow balance first.
5. `soak-seeder.ts` should inherit the `sendAlertSafe` (not `sendAlert`) pattern from `alerts.ts` — using the safe variant prevents a Telegram failure from crashing the soak loop.
6. `grep-guards.yml` extension: the USDC.e absolute-forbid guard (lines 43–76) must remain unchanged. The Phase 6 addition is a separate step, not a modification of the existing step.

**Pattern extraction date:** 2026-06-03
