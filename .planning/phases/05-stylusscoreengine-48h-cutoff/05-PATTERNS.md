# Phase 5: StylusScoreEngine + 48h Cutoff — Pattern Map

**Mapped:** 2026-06-02
**Files analyzed:** 12 new/modified files
**Analogs found:** 10 / 12 (2 flagged greenfield-Rust with semantic Solidity analogs)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/contracts/stylus/src/lib.rs` | contract (engine entrypoint) | request-response (view) | `packages/contracts/stylus/src/lib.rs` (Phase-0 stub) + `packages/contracts/src/interfaces/IStylusScoreEngine.sol` | stub-replace |
| `packages/contracts/stylus/src/math.rs` | utility (pure math module) | transform | `packages/contracts/src/SettlementManager.sol` lines 731–748 (`_solidityBaselineRepDelta`) | semantic analog (Solidity→Rust port) |
| `packages/contracts/stylus/tests/test_math.rs` | test (Motsu unit) | transform | `apps/relayer/test/stylus-deactivation-watcher.test.ts` (mock+assert pattern) | role-match (test structure) |
| `packages/contracts/stylus/Cargo.toml` | config | — | `packages/contracts/stylus/Cargo.toml` (Phase-0 stub) | exact (modify existing) |
| `packages/contracts/src/SolidityScoreEngine.sol` | contract (interface impl) | request-response (view) | `packages/contracts/src/interfaces/IStylusScoreEngine.sol` (interface) + `packages/contracts/src/constants/USDC.sol` (minimal stateless contract shape) | role-match |
| `packages/contracts/src/RevertingStylusEngine.sol` | contract (test fixture) | request-response (reverting) | `packages/contracts/src/SolidityScoreEngine.sol` (same interface family) | role-match |
| `packages/contracts/test/SolidityScoreEngine.t.sol` | test (Foundry parity) | CRUD | `packages/contracts/test/CallRegistryParity.t.sol` + `packages/contracts/test/SettlementManagerTest.sol` | role-match (numeric parity pattern) |
| `packages/contracts/script/DeployPhase5Stylus.s.sol` | config (deploy script) | CRUD | `packages/contracts/script/DeployPhase4.s.sol` | exact |
| `packages/contracts/script/CutoffFallback.s.sol` | config (deploy script) | CRUD | `packages/contracts/script/DeployPhase4.s.sol` | role-match (same family) |
| `apps/relayer/src/workers/stylus-deactivation-watcher.ts` | worker (timer/alert) | event-driven | `apps/relayer/src/workers/stylus-deactivation-watcher.ts` (modify existing) | exact |
| `scripts/repoint-calendar.ts` | utility (CLI script) | batch | `scripts/repoint-calendar.ts` (already exists — no modification needed) | exact (pre-existing) |
| `packages/shared/src/constants/stylus-calendar.json` | config | — | `packages/shared/src/constants/stylus-calendar.json` (already exists — populate null fields) | exact (pre-existing) |

---

## Pattern Assignments

---

### `packages/contracts/stylus/src/lib.rs` (contract entrypoint, view)

**Analog:** Phase-0 stub at same path + `packages/contracts/src/interfaces/IStylusScoreEngine.sol`

**Situation:** The Phase-0 stub uses `#[no_mangle] extern "C"` — not a real Stylus contract. Phase 5 replaces it wholesale with `#[storage]` + `#[public]` scaffolding. The locked Solidity interface (`IStylusScoreEngine.sol`) is the authoritative spec; the Rust struct must satisfy it exactly.

**Current stub to REPLACE entirely** (`packages/contracts/stylus/src/lib.rs` lines 1–31):
```rust
// Phase 0 stub uses #[no_mangle] — NOT the Stylus pattern. Replace fully.
#![cfg_attr(not(any(test, feature = "export-abi")), no_std)]
extern crate alloc;

#[no_mangle]
pub extern "C" fn stub_ping() -> u32 { 0 }
```

**Locked interface to satisfy** (`packages/contracts/src/interfaces/IStylusScoreEngine.sol` lines 48–54):
```solidity
function compute_rep_change(
    uint128 currentRep,
    uint8   conviction,
    uint8   consensusPct,
    bool    isWinner,
    uint256 baseValue
) external view returns (int32 delta);
```

**Core Stylus pattern to copy from RESEARCH.md** (verified from SDK source):
```rust
// FILE: packages/contracts/stylus/src/lib.rs
// CRITICAL: #[selector(name = "compute_rep_change")] is MANDATORY.
// Without it, #[public] converts compute_rep_change → computeRepChange (camelCase)
// → selector 0xfe7606ba. The locked interface requires selector 0xff540eb6.
// Verified via: cast sig "compute_rep_change(uint128,uint8,uint8,bool,uint256)" → 0xff540eb6
//               cast sig "computeRepChange(uint128,uint8,uint8,bool,uint256)"   → 0xfe7606ba

#![no_std]
#![no_main]
extern crate alloc;

use stylus_sdk::prelude::*;
use stylus_sdk::alloy_primitives::{U128, U256};

#[storage]
pub struct StylusScoreEngine;

#[public]
impl StylusScoreEngine {
    #[selector(name = "compute_rep_change")]  // forces selector 0xff540eb6
    pub fn compute_rep_change(
        &self,                    // &self (not &mut self) → view state mutability
        current_rep:   U128,      // Solidity uint128
        conviction:    u8,        // Solidity uint8
        consensus_pct: u8,        // Solidity uint8
        is_winner:     bool,      // Solidity bool
        base_value:    U256,      // Solidity uint256
    ) -> i32 {                    // Solidity int32
        crate::math::compute_rep_delta(
            current_rep.to::<u128>(),
            conviction,
            consensus_pct,
            is_winner,
            base_value.to::<u64>(),
        )
    }
}
```

**Type mapping table** (alloy-rs verified):
| Solidity | Rust |
|---|---|
| `uint128` | `U128` (alloy_primitives) |
| `uint8` | `u8` (native) |
| `bool` | `bool` (native) |
| `uint256` | `U256` (alloy_primitives) |
| `int32` return | `i32` (native) |

---

### `packages/contracts/stylus/src/math.rs` (utility, pure math transform)

**Analog:** `packages/contracts/src/SettlementManager.sol` lines 731–748 (`_solidityBaselineRepDelta`)

**Semantic source — the Solidity baseline to port to Rust** (lines 731–748):
```solidity
function _solidityBaselineRepDelta(
    uint8 conviction,
    uint8 /*consensusPct*/,
    bool  isWinner
) internal pure returns (int256 delta) {
    uint256 BASE = 10;
    // Linear conviction scale: at conviction=50 → 1.0x; at 100 → 2.0x
    uint256 scaled = (BASE * uint256(conviction) * 2) / 100;
    if (scaled < 1) scaled = 1; // floor: any action earns at least 1 rep
    if (isWinner) {
        delta = int256(scaled);
    } else {
        delta = -int256(scaled);
    }
    // REP-02: applyRepDelta caller handles floor at 0
}
```

**Rust math module pattern** — pure function, no Stylus host calls, fully unit-testable:
```rust
// FILE: packages/contracts/stylus/src/math.rs
// No Stylus imports needed — this is pure Rust.
// Called by lib.rs after converting alloy types to native Rust types.

pub fn compute_rep_delta(
    _current_rep:  u128,   // unused in Phase 5; _prefix suppresses warning
    conviction:    u8,
    consensus_pct: u8,
    is_winner:     bool,
    base_value:    u64,    // always 10 in Phase 5 (passed from SM)
) -> i32 {
    // Phase 5 full-fidelity implementation:
    // Step 1: baseline conviction multiplier (matches _solidityBaselineRepDelta exactly)
    // Step 2: contrarian multiplier (winners only) — OPEN QUESTION: constants need user sign-off
    // Step 3: high-conviction 2× at conviction >= 85
    // Use checked_mul/checked_add to prevent integer overflow (WASM threat mitigation)
    todo!("implement after user sign-off on multiplier constants")
}
```

**Parity anchor** — the Rust engine at `conviction=50, consensusPct=0, isWinner=true, baseValue=10` MUST return `10` to match the Solidity baseline:
```
(10 * 50 * 2) / 100 = 10  ← Solidity baseline
Rust must equal 10 for this input (REP-24 parity test)
```

---

### `packages/contracts/stylus/tests/test_math.rs` (Motsu unit test, greenfield)

**Analog:** `apps/relayer/test/stylus-deactivation-watcher.test.ts` (mock/assert pattern) and RESEARCH.md Motsu skeleton

**No Rust test file exists in this repo yet.** The closest structural analog is the TypeScript test pattern (named cases, per-case assertions, early isolation). Mirror the Motsu skeleton from RESEARCH.md.

**Motsu test file structure to copy:**
```rust
// FILE: packages/contracts/stylus/tests/test_math.rs
#[cfg(test)]
mod tests {
    use crate::math::compute_rep_delta;

    #[motsu::test]
    fn test_winner_gains_rep() {
        let delta = compute_rep_delta(100, 50, 50, true, 10);
        assert!(delta > 0);
    }

    #[motsu::test]
    fn test_loser_loses_rep() {
        let delta = compute_rep_delta(100, 50, 50, false, 10);
        assert!(delta < 0);
    }

    #[motsu::test]
    fn test_contrarian_not_applied_to_losses() {
        // REP-06: no contrarian multiplier on losses
        let low_consensus  = compute_rep_delta(100, 50, 10, false, 10);
        let high_consensus = compute_rep_delta(100, 50, 90, false, 10);
        assert_eq!(low_consensus, high_consensus,
            "losses must not scale with contrarian (REP-06)");
    }

    #[motsu::test]
    fn test_high_conviction_threshold() {
        // REP-07: 2× at conviction >= 85
        let below = compute_rep_delta(100, 84, 50, true, 10);
        let above = compute_rep_delta(100, 85, 50, true, 10);
        assert!(above > below, "conviction=85 must exceed conviction=84");
    }

    #[motsu::test]
    fn test_parity_with_solidity_baseline() {
        // REP-24: Rust engine at baseline inputs must match Solidity baseline
        // _solidityBaselineRepDelta(50, 0, true) = (10*50*2)/100 = 10
        let delta = compute_rep_delta(100, 50, 0, true, 10);
        assert_eq!(delta, 10, "Rust baseline parity at conviction=50");
    }
}
```

---

### `packages/contracts/stylus/Cargo.toml` (config, modify existing)

**Analog:** `packages/contracts/stylus/Cargo.toml` (Phase-0 stub — modify in place)

**Current Phase-0 state to modify** (lines 1–47, read in full above):
- `version = "0.0.1"` → update to `"0.1.0"`
- `stylus-sdk` dependency already pinned correctly: `version = "=0.10.7"`
- `openzeppelin-stylus` is commented out — uncomment only if needed
- `dev-dependencies` motsu is commented out → UNCOMMENT for Phase 5

**Exact diff to apply:**
```toml
# Change version
version = "0.1.0"

# Uncomment motsu in [dev-dependencies]:
[dev-dependencies]
motsu = { git = "https://github.com/OpenZeppelin/motsu" }

# Keep [profile.release] unchanged (already optimal)
```

---

### `packages/contracts/src/SolidityScoreEngine.sol` (contract, interface implementation)

**Analog:** `packages/contracts/src/constants/USDC.sol` (minimal stateless Solidity file shape) + `packages/contracts/src/interfaces/IStylusScoreEngine.sol` (interface to satisfy)

**Header/pragma pattern** (copy from any existing contract, e.g. `IStylusScoreEngine.sol` lines 1–5):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack -- Pinned Versions"
```

**Import pattern** (how existing contracts import interfaces — from `SettlementManager.sol`):
```solidity
import { IStylusScoreEngine } from "./interfaces/IStylusScoreEngine.sol";
```

**Full contract skeleton** (math must match `_solidityBaselineRepDelta` exactly for REP-24):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack -- Pinned Versions"
// Spec: CALL_IT_SPEC1.md §11.6 -- 48h cutoff fallback baseline
// Requirement: REP-22, REP-24, OPS-16
//
// MATH MUST MATCH SettlementManager._solidityBaselineRepDelta EXACTLY (REP-24).
// Any divergence means the proxy-upgrade fallback produces different rep deltas
// than the runtime try/catch fallback. Parity is verified in test/SolidityScoreEngine.t.sol.

import { IStylusScoreEngine } from "./interfaces/IStylusScoreEngine.sol";

/// @title SolidityScoreEngine
/// @notice 48h-cutoff fallback: standalone contract implementing IStylusScoreEngine
///         with the same math as SettlementManager._solidityBaselineRepDelta.
///         No storage -- stateless, view-only. Deployable behind TransparentUpgradeableProxy.
contract SolidityScoreEngine is IStylusScoreEngine {
    /// @inheritdoc IStylusScoreEngine
    function compute_rep_change(
        uint128 /*currentRep*/,
        uint8   conviction,
        uint8   /*consensusPct*/,
        bool    isWinner,
        uint256 baseValue
    ) external view override returns (int32 delta) {
        // MUST be identical to SettlementManager._solidityBaselineRepDelta:
        uint256 scaled = (baseValue * uint256(conviction) * 2) / 100;
        if (scaled < 1) scaled = 1;
        if (isWinner) {
            delta = int32(int256(scaled));
        } else {
            delta = -int32(int256(scaled));
        }
        // REP-02: floor at 0 applied by ProfileRegistry.applyRepDelta, not here.
    }
}
```

---

### `packages/contracts/src/RevertingStylusEngine.sol` (test fixture, reverting)

**Analog:** Same interface family as `SolidityScoreEngine.sol` — identical header/pragma/import pattern, minimal body.

**Pattern** (identical header, minimal implementation):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack -- Pinned Versions"
// Requirement: SAFETY-42 (Phase 6 drill fixture)
//
// Phase 5 test fixture: intentionally reverts on compute_rep_change.
// Pre-deployed to Sepolia so Phase 6 SAFETY-42 drill is mechanical.
// Verifies SettlementManager try/catch fires RepCalculatedFallback.

import { IStylusScoreEngine } from "./interfaces/IStylusScoreEngine.sol";

/// @notice Intentionally reverts on compute_rep_change.
///         Used in Phase 6 SAFETY-42 drill to verify SM try/catch.
contract RevertingStylusEngine is IStylusScoreEngine {
    function compute_rep_change(
        uint128, uint8, uint8, bool, uint256
    ) external view override returns (int32) {
        revert("RevertingStylusEngine: intentional revert for Phase 6 drill");
    }
}
```

---

### `packages/contracts/test/SolidityScoreEngine.t.sol` (Foundry parity test)

**Analog:** `packages/contracts/test/CallRegistryParity.t.sol` (standalone setUp + numeric assertion pattern) and `packages/contracts/test/SettlementManagerTest.sol` (SmTestHelper harness for accessing SM internals)

**Key challenge:** `_solidityBaselineRepDelta` is `private pure` in `SettlementManager.sol` (line 731). The parity test cannot call it directly. Use ONE of:
1. A thin test-harness contract that inherits `SettlementManager` and exposes the function as `public` (standard Foundry pattern).
2. Inline the arithmetic directly in the test assertion.

**Option 2 is simpler and avoids constructor complexity** — the math is 3 lines.

**Header pattern** (copy from `packages/contracts/test/CallRegistryParity.t.sol` lines 1–6):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack -- Pinned Versions"
// Spec: CALL_IT_SPEC1.md §11.6 -- SolidityScoreEngine parity with SM baseline (REP-24)
// Requirement: REP-24
```

**Standalone setUp pattern** (copy from `packages/contracts/test/CallRegistryParity.t.sol` lines 47–60 — no SmTestHelper needed since SolidityScoreEngine is stateless):
```solidity
import { Test } from "forge-std/Test.sol";
import { SolidityScoreEngine } from "../src/SolidityScoreEngine.sol";
import { IStylusScoreEngine } from "../src/interfaces/IStylusScoreEngine.sol";

contract SolidityScoreEngineTest is Test {
    SolidityScoreEngine internal engine;

    function setUp() public {
        engine = new SolidityScoreEngine();
    }

    // Parity helper: inline of _solidityBaselineRepDelta math
    // (private in SM — inlined here to avoid harness constructor complexity)
    function _baseline(uint8 conviction, bool isWinner) internal pure returns (int32) {
        uint256 scaled = (uint256(10) * uint256(conviction) * 2) / 100;
        if (scaled < 1) scaled = 1;
        return isWinner ? int32(int256(scaled)) : -int32(int256(scaled));
    }

    // REP-24: parity across all conviction × isWinner combinations
    function test_parity_conviction50_winner() public view {
        assertEq(
            engine.compute_rep_change(0, 50, 0, true, 10),
            _baseline(50, true),
            "REP-24: conviction=50 winner parity"
        );
    }

    function test_parity_conviction100_winner() public view {
        assertEq(
            engine.compute_rep_change(0, 100, 0, true, 10),
            _baseline(100, true)
        );
    }

    function test_parity_conviction50_loser() public view {
        assertEq(
            engine.compute_rep_change(0, 50, 0, false, 10),
            _baseline(50, false)
        );
    }

    function test_parity_conviction1_floor() public view {
        // conviction=1: (10*1*2)/100 = 0 → floor to 1
        assertEq(engine.compute_rep_change(0, 1, 0, true, 10), int32(1));
    }

    // Interface compliance: function must be callable via IStylusScoreEngine
    function test_interface_compliance() public view {
        IStylusScoreEngine iface = IStylusScoreEngine(address(engine));
        int32 delta = iface.compute_rep_change(100, 50, 50, true, 10);
        assertTrue(delta > 0, "IStylusScoreEngine view call must return positive delta for winner");
    }

    // RevertingStylusEngine: verify it reverts (SAFETY-42 pre-check)
    function test_reverting_engine_reverts() public {
        // Import and deploy RevertingStylusEngine — import at file top
        // vm.expectRevert() pattern (from ChallengeEscrowGates.t.sol)
        vm.expectRevert();
        // RevertingStylusEngine(address(revertingEngine)).compute_rep_change(0,50,50,true,10);
    }
}
```

---

### `packages/contracts/script/DeployPhase5Stylus.s.sol` (deploy script)

**Analog:** `packages/contracts/script/DeployPhase4.s.sol` — exact structural match

**Copy these patterns verbatim from `DeployPhase4.s.sol`:**

**Header/pragma/imports block** (lines 1–56):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack -- Pinned Versions"
// Spec: CALL_IT_SPEC1.md §11.4, §11.6 -- StylusScoreEngine proxy + impl deploy
// Requirement: REP-19, REP-21, REP-24, OPS-16
//
// DEPLOYMENT SAFETY CHECKLIST (§19.11):
// 1. DEPLOYER_PRIVATE_KEY ...
// 2. cargo stylus deploy + activate BEFORE running this script (impl addr needed)
// ...

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { TransparentUpgradeableProxy } from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import { ProxyAdmin } from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import { SolidityScoreEngine } from "../src/SolidityScoreEngine.sol";
import { RevertingStylusEngine } from "../src/RevertingStylusEngine.sol";
import { ISettlementManager } from "../src/interfaces/ISettlementManager.sol";
```

**Phase 4 previously deployed addresses block** (copy pattern from lines 72–96 of DeployPhase4):
```solidity
contract DeployPhase5Stylus is Script {
    // ─── Phase 4 deployed addresses (Arbitrum Sepolia, UNCHANGED) ─────────────
    // Source: packages/shared/src/constants/addresses.ts
    address public constant SETTLEMENT_MANAGER = 0xAc37a0e4A3e575EF21684c28a5b820dB44654595;
    address public constant CALL_REGISTRY       = 0x7DAd732764abfC935aD5bf8e5CFF9BEA7B2C234D;
    // ... other Phase 4 addresses
```

**`run()` pattern** (copy structure from `DeployPhase4.s.sol` lines 105–184):
```solidity
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address stylusImplAddr = vm.envAddress("STYLUS_IMPL_ADDRESS"); // from cargo stylus deploy

        vm.startBroadcast(deployerKey);

        // 1. Deploy SolidityScoreEngine (48h cutoff fallback)
        SolidityScoreEngine solidityEngine = new SolidityScoreEngine();
        console.log("SolidityScoreEngine deployed at:", address(solidityEngine));

        // 2. Deploy RevertingStylusEngine (Phase 6 SAFETY-42 drill fixture)
        RevertingStylusEngine revertingEngine = new RevertingStylusEngine();
        console.log("RevertingStylusEngine deployed at:", address(revertingEngine));

        // 3. Deploy ProxyAdmin
        ProxyAdmin proxyAdmin = new ProxyAdmin(vm.addr(deployerKey));
        console.log("ProxyAdmin deployed at:", address(proxyAdmin));

        // 4. Deploy TransparentUpgradeableProxy pointing at Stylus impl
        // initData = "" (engine is stateless, no initialize() needed)
        TransparentUpgradeableProxy proxy = new TransparentUpgradeableProxy(
            stylusImplAddr,
            address(proxyAdmin),
            ""
        );
        console.log("StylusScoreEngine proxy deployed at:", address(proxy));

        // 5. Wire proxy address into SettlementManager
        ISettlementManager(SETTLEMENT_MANAGER).setStylusScoreEngine(address(proxy));
        console.log("SettlementManager.setStylusScoreEngine ->", address(proxy));

        vm.stopBroadcast();

        // ─── Post-deploy assertions (copy pattern from DeployPhase4.s.sol lines 186–259) ─
        require(
            ISettlementManager(SETTLEMENT_MANAGER).stylusScoreEngine() == address(proxy),
            "DeployPhase5: SM.stylusScoreEngine() mismatch"
        );

        // ─── Deployment summary + REQUIRED NEXT STEPS (copy console.log pattern) ─
        console.log("---");
        console.log("DEPLOYMENT SUMMARY (Arbitrum Sepolia)");
        console.log("SolidityScoreEngine:     ", address(solidityEngine));
        console.log("RevertingStylusEngine:   ", address(revertingEngine));
        console.log("ProxyAdmin:              ", address(proxyAdmin));
        console.log("StylusScoreEngine proxy: ", address(proxy));
        console.log("---");
        console.log("REQUIRED NEXT STEPS:");
        console.log("1. Update packages/shared/src/constants/addresses.ts (see addresses pattern)");
        console.log("2. fly secrets set STYLUS_SCORE_ENGINE_ADDRESS=", address(proxy), "--app call-it-relayer-sepolia");
        console.log("3. pnpm tsx scripts/repoint-calendar.ts --stylus-deploy-date $(date +%Y-%m-%d)");
        console.log("4. Run CutoffFallback.s.sol upgrade round-trip on Sepolia (REP-21)");
        console.log("---");
        console.log("OPERATOR VERIFICATION (cast commands):");
        console.log("  cast call", SETTLEMENT_MANAGER, '"stylusScoreEngine()(address)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL');
        console.log("  cast call", address(proxy), '"compute_rep_change(uint128,uint8,uint8,bool,uint256)" 100 50 50 true 10 --rpc-url $ARBITRUM_SEPOLIA_RPC_URL');
        console.log("  cast call", address(proxyAdmin), '"owner()(address)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL');
    }
}
```

---

### `packages/contracts/script/CutoffFallback.s.sol` (deploy script, upgrade-only)

**Analog:** `packages/contracts/script/DeployPhase4.s.sol` (same family — lighter version, documents one cast command)

**Pattern:** Same header/pragma/import structure. Shorter `run()` that executes only the proxy upgrade:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// OPS-16 RUNBOOK: 48h-before-demo cutoff — execute if cargo stylus check fails.
// Usage: forge script script/CutoffFallback.s.sol --rpc-url arbitrum_sepolia --broadcast
//   OR:  cast send $PROXY_ADMIN "upgradeAndCall(address,address,bytes)" $PROXY_ADDR $SOLIDITY_BASELINE "" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --private-key $DEPLOYER_KEY
//
// Verifies: cast call $PROXY_ADMIN "getProxyImplementation(address)(address)" $PROXY_ADDR
//   -> $SOLIDITY_BASELINE_ADDR

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { ProxyAdmin } from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";

contract CutoffFallback is Script {
    // Populated from addresses.ts after DeployPhase5Stylus.s.sol broadcast
    address public constant PROXY_ADMIN_ADDR       = address(0); // FILL AFTER DEPLOY
    address public constant PROXY_ADDR             = address(0); // FILL AFTER DEPLOY
    address public constant SOLIDITY_BASELINE_ADDR = address(0); // FILL AFTER DEPLOY

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        ProxyAdmin(PROXY_ADMIN_ADDR).upgradeAndCall(
            payable(PROXY_ADDR),
            SOLIDITY_BASELINE_ADDR,
            ""
        );
        console.log("Proxy upgraded to SolidityScoreEngine at:", SOLIDITY_BASELINE_ADDR);
        vm.stopBroadcast();
        // Verify
        require(
            ProxyAdmin(PROXY_ADMIN_ADDR).getProxyImplementation(payable(PROXY_ADDR)) == SOLIDITY_BASELINE_ADDR,
            "CutoffFallback: implementation mismatch after upgrade"
        );
        console.log("[OK] implementation() returns SolidityScoreEngine address");
    }
}
```

---

### `apps/relayer/src/workers/stylus-deactivation-watcher.ts` (modify existing worker)

**Analog:** `apps/relayer/src/workers/stylus-deactivation-watcher.ts` (self-referential — extend in place)

**Existing patterns to preserve:**

**Interface extension pattern** (lines 57–70 — add `demoCutoffTimestamp` field):
```typescript
// EXISTING (lines 57–70):
export interface StylusDeactivationWatcherOpts {
  publicClient: { readContract(...): Promise<unknown> };
  stylusAddress: string | null;
  intervalMs?: number;
  redis: { set(key: string, value: string, ...args: (string | number)[]): Promise<string | null> };
}

// ADD to interface:
  /** Demo date (Unix timestamp). If set, fires cutoff alerts at T-72h/T-48h/T-24h. */
  demoCutoffTimestamp?: number;
```

**Redis idempotency lock pattern** (lines 147–151 — copy exactly for cutoff thresholds):
```typescript
// EXISTING pattern (lines 147–151):
const lockKey = `stylus:alert-fired:T-${thresholdDays}d:${dateKey}`;
const acquired = await redis.set(lockKey, '1', 'EX', 86400, 'NX');
if (acquired === 'OK') {
  await sendAlert('stylus_reactivation', { ... });
}
break; // Only fire highest triggered threshold
```

**New demo-cutoff block to add inside `tick()` AFTER the reactivation threshold loop** (lines 174–176 region):
```typescript
// ADD after the reactivation threshold loop in tick():
if (opts.demoCutoffTimestamp) {
  const demoThresholds = [72, 48, 24] as const;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const hoursUntilDemo = (opts.demoCutoffTimestamp - nowSeconds) / 3600;
  for (const h of demoThresholds) {
    if (hoursUntilDemo <= h && hoursUntilDemo > 0) {
      const dateKey = new Date().toISOString().slice(0, 10);
      const lockKey = `stylus:demo-cutoff:T-${h}h:${dateKey}`;
      const acquired = await redis.set(lockKey, '1', 'EX', 86400, 'NX');
      if (acquired === 'OK') {
        await sendAlert('stylus_demo_cutoff', {
          hoursRemaining: Math.floor(hoursUntilDemo),
          threshold: h,
          demoCutoffTimestamp: opts.demoCutoffTimestamp,
          stylusAddress,
          message: h <= 48
            ? 'DECISION REQUIRED: Run cargo stylus check. If Stylus not working, execute CutoffFallback.s.sol NOW.'
            : 'Pre-demo check: Verify Stylus engine is activated and compute_rep_change works.',
        });
      }
      break; // Only fire highest triggered threshold (mirrors reactivation pattern line 174)
    }
  }
}
```

**Test file to extend** (`apps/relayer/test/stylus-deactivation-watcher.test.ts` — add Test 5 mirroring the existing Test 2 idempotency pattern):

Test 5 structure: `demoCutoffTimestamp` set to `nowPlusDays(1) as seconds` → `hoursUntilDemo ≤ 24` → `sendAlert('stylus_demo_cutoff')` fires. Uses `makeMockRedis('OK')` pattern from line 43.

---

### `scripts/repoint-calendar.ts` (utility script — already exists, no modification)

**Analog:** `scripts/repoint-calendar.ts` — already fully implemented (read above, lines 1–225)

**Phase 5 integration task:** Run after deploy, not modify. Command:
```bash
pnpm tsx scripts/repoint-calendar.ts --stylus-deploy-date $(date +%Y-%m-%d)
```

The script reads `packages/shared/src/constants/stylus-calendar.json`, computes `deploy + 365 days`, calls `calendar.events.update()` for all 4 event IDs, then writes `reactivation_deadline` back to the JSON.

**Invocation prerequisite:** `seed-calendar.ts` must have been run first (Phase 0 task) to populate the 4 `event_t*` IDs. The script throws if they are still `null` (line 101–108).

---

### `packages/shared/src/constants/stylus-calendar.json` (config — populate nulls)

**Analog:** `packages/shared/src/constants/addresses.ts` — same pattern of populating null placeholders after deploy

**Current state** (all nulls — lines 1–10):
```json
{
  "event_t30": null,
  "event_t15": null,
  "event_t7": null,
  "event_t1": null,
  "placeholder_deploy_date": null,
  "created_at": null,
  "last_updated_via": null,
  "_note": "..."
}
```

**After Phase 5 deploy:** `repoint-calendar.ts` writes `placeholder_deploy_date` (the reactivation deadline = deploy + 365d) and `last_updated_via: "phase-5-repoint"`. The 4 event IDs were populated by `seed-calendar.ts` (Phase 0). No manual edit needed — scripts handle it.

---

### `packages/shared/src/constants/addresses.ts` (append Phase 5 entries)

**Analog:** `packages/shared/src/constants/addresses.ts` — copy the Phase 4 address entry pattern exactly (lines 87–196)

**Pattern to copy for each new address** (e.g., lines 186–196 for SettlementManager):
```typescript
/**
 * StylusScoreEngine proxy on Arbitrum Sepolia (Phase 5 deploy).
 *
 * DEPLOYED <date> via DeployPhase5Stylus.s.sol. Deploy block: <block>.
 * TransparentUpgradeableProxy → StylusScoreEngine WASM impl (cargo-stylus 0.6.3).
 * 48h cutoff: upgrade proxy to SolidityScoreEngine via CutoffFallback.s.sol.
 *
 * Post-deploy verification:
 *   sm.stylusScoreEngine()       -> this address                       ✓
 *   proxy.implementation()       -> Stylus impl address                ✓
 *   compute_rep_change(...)      -> non-zero int32                     ✓
 */
export const STYLUS_SCORE_ENGINE_PROXY_ARBITRUM_SEPOLIA =
  '0x0000000000000000000000000000000000000000' as const; // FILL AFTER DEPLOY

export const SOLIDITY_SCORE_ENGINE_ARBITRUM_SEPOLIA =
  '0x0000000000000000000000000000000000000000' as const; // FILL AFTER DEPLOY

export const REVERTING_STYLUS_ENGINE_ARBITRUM_SEPOLIA =
  '0x0000000000000000000000000000000000000000' as const; // FILL AFTER DEPLOY

export const PROXY_ADMIN_ARBITRUM_SEPOLIA =
  '0x0000000000000000000000000000000000000000' as const; // FILL AFTER DEPLOY
```

Then update the `AddressRecord`-style export (copy the `SETTLEMENT_MANAGER_ADDRESSES` pattern at lines 242–245).

---

## Shared Patterns

### Pragma pin guard — apply to ALL new Solidity files
**Source:** Every existing `.sol` file (e.g. `IStylusScoreEngine.sol` line 2, `DeployPhase4.s.sol` line 2)
```solidity
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack -- Pinned Versions"
```

### SPDX header — apply to ALL new Solidity files
**Source:** Every existing `.sol` file (line 1)
```solidity
// SPDX-License-Identifier: MIT
```

### Redis SET NX idempotency — apply to demo-cutoff alert block
**Source:** `apps/relayer/src/workers/stylus-deactivation-watcher.ts` lines 147–174
```typescript
const lockKey = `stylus:alert-fired:T-${threshold}...:${dateKey}`;
const acquired = await redis.set(lockKey, '1', 'EX', 86400, 'NX');
if (acquired === 'OK') {
  await sendAlert('event_name', { ...payload });
}
break; // only highest triggered threshold fires per tick
```

### Forge deploy script structure — apply to both new scripts
**Source:** `packages/contracts/script/DeployPhase4.s.sol` lines 105–301
1. `vm.envUint("DEPLOYER_PRIVATE_KEY")` — never hardcode
2. `vm.startBroadcast(deployerKey)` → deploy → `vm.stopBroadcast()`
3. Post-deploy `require()` assertions (all run AFTER stopBroadcast — view only)
4. `console.log()` deployment summary with addresses
5. `console.log("REQUIRED NEXT STEPS:")` with addresses.ts update instruction

### Test helper pattern — Forge standalone tests without SmTestHelper
**Source:** `packages/contracts/test/CallRegistryParity.t.sol` lines 29–60
```solidity
contract SomeTest is Test {
    ContractUnderTest internal cut;
    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");

    function setUp() public {
        cut = new ContractUnderTest(...);
    }
}
```

### Pino structured logging — apply to any new TS watcher code
**Source:** `apps/relayer/src/workers/stylus-deactivation-watcher.ts` lines 131–138
```typescript
logger.info(
  {
    event: 'event_name_snake_case',
    field1: value1,
    field2: value2,
  },
  'Human-readable message string',
);
```

---

## No Analog Found

Files with no close Rust match in the codebase. Planner should use RESEARCH.md code examples directly.

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `packages/contracts/stylus/src/lib.rs` (Phase 5 replacement) | contract (Rust) | request-response | No existing Rust/Stylus contract beyond the Phase-0 no-op stub. Use RESEARCH.md "Full Engine Skeleton" verbatim. |
| `packages/contracts/stylus/src/math.rs` | utility (Rust) | transform | No existing Rust module in this repo. Semantic analog is `_solidityBaselineRepDelta` (Solidity). Port to Rust using RESEARCH.md "Pattern 2: Math Isolation" skeleton. |
| `packages/contracts/stylus/tests/test_math.rs` | test (Motsu/Rust) | transform | No Rust test files in repo. Use RESEARCH.md "Motsu Unit Test Skeleton" directly. Structural analog is the TypeScript test pattern (`describe/it`, per-case mocks). |

---

## Metadata

**Analog search scope:** `packages/contracts/src/`, `packages/contracts/test/`, `packages/contracts/script/`, `packages/contracts/stylus/`, `apps/relayer/src/workers/`, `apps/relayer/test/`, `packages/shared/src/constants/`, `scripts/`
**Files read:** 22
**Pattern extraction date:** 2026-06-02
**Key constraint confirmed:** All Solidity files use `pragma solidity =0.8.30` (exact pin, not `^`). CI grep guard enforces this. Phase 5 files must follow the same pattern.
