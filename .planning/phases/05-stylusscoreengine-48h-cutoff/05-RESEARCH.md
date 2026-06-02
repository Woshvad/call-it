# Phase 5: StylusScoreEngine + 48h Cutoff — Research

**Researched:** 2026-06-02
**Domain:** Rust/Stylus smart contracts, Solidity↔Stylus ABI boundary, transparent proxy patterns, cargo-stylus build/deploy
**Confidence:** HIGH (ABI boundary verified from SDK source; type mappings verified from alloy-rs source; selector arithmetic verified via `cast sig`)

---

## Summary

Phase 5 deploys the Rust reputation scoring engine (StylusScoreEngine) behind a Solidity `TransparentUpgradeableProxy`, wires it into the SettlementManager try/catch seam, and stages the 48h-before-demo fallback path as a mechanical single-command swap. The research confirms four make-or-break findings:

1. **ABI selector mismatch is the #1 silent failure mode.** The `#[public]` macro converts Rust `snake_case` to `camelCase` by default (`compute_rep_change` → `computeRepChange`, selector `0xfe7606ba`). The locked interface requires `compute_rep_change` (selector `0xff540eb6`). These differ — every call would silently hit the `catch` branch. The override `#[selector(name = "compute_rep_change")]` MUST be applied.

2. **Solidity `TransparentUpgradeableProxy` delegatecall → Stylus WASM is supported** at the ArbOS level. The engine is stateless and `view` — no storage-layout collision can occur. The `SettlementManager` seam uses a regular external `CALL` (not delegatecall) to the proxy address; the proxy then delegatecalls to the Stylus impl. Both hops work.

3. **Phase 5 MUST deploy a standalone `SolidityScoreEngine.sol`** implementing `IStylusScoreEngine.compute_rep_change` at full baseline fidelity (mirroring `_solidityBaselineRepDelta` exactly). Without this, the "48h cutoff = one cast call" claim is false — there is no contract address to point the proxy at.

4. **The reputation math constants are partially specified.** The spec (§7.3, §12.6) gives structure but deliberately leaves exact multiplier curves as suggestions ("suggested: 10", "~0.5 at 50%", "~0.7 when 80% agreed"). Phase 5 must pick exact integer-arithmetic constants and publish them as named `const`s. The planner should treat the exact values as an Open Question requiring user sign-off.

**Primary recommendation:** Lead with the selector override (`#[selector(name = "compute_rep_change")]`) — it is the single most dangerous point of failure — then proxy architecture, then standalone Solidity baseline deployment, then math constants.

---

## Critical Risks and Decisions (Questions #1–#3)

### Risk 1: ABI Selector Mismatch — THE MAKE-OR-BREAK RISK

**Verified from SDK source code:** `stylus-proc/src/macros/public/mod.rs` line ~457:

```rust
let name = selector_override.unwrap_or(name.to_case(Case::Camel));
```

This means:
- Without override: `compute_rep_change` → `computeRepChange` → selector `0xfe7606ba`
- Locked interface requires: `compute_rep_change` → selector `0xff540eb6`
- Difference confirmed via `cast sig`:

```bash
cast sig "compute_rep_change(uint128,uint8,uint8,bool,uint256)"
# 0xff540eb6 — REQUIRED

cast sig "computeRepChange(uint128,uint8,uint8,bool,uint256)"
# 0xfe7606ba — WRONG (default camelCase behavior)
```

The `#[selector(name = "compute_rep_change")]` attribute **MUST** be applied. This is proven in `stylus-proc/src/macros/public/attrs.rs`:

```rust
/// Selector name overloading for public functions.
/// Used for the `#[selector(name = "...")]` attribute.
pub struct Selector {
    _name: kw::name,
    _eq_token: Token![=],
    pub value: syn::LitStr,
}
```

**Exact minimal correct Rust skeleton** — selector- and type-compatible with `IStylusScoreEngine`:

```rust
use stylus_sdk::prelude::*;
use stylus_sdk::alloy_primitives::{U128, U256};

// Engine is stateless — no sol_storage! needed for the scoring function.
// sol_storage! is still required for the struct definition (even if empty)
// so that sol_storage! macro compiles.
#[storage]
pub struct StylusScoreEngine;

#[public]
impl StylusScoreEngine {
    // MANDATORY: #[selector(name = "compute_rep_change")] to match the locked interface.
    // Without this, the default camelCase conversion produces selector 0xfe7606ba
    // instead of the required 0xff540eb6, and every SettlementManager call silently
    // falls back to the Solidity baseline.
    #[selector(name = "compute_rep_change")]
    pub fn compute_rep_change(
        &self,
        current_rep: U128,
        conviction:   u8,
        consensus_pct: u8,
        is_winner:    bool,
        base_value:   U256,
    ) -> i32 {
        // Full-fidelity implementation here.
        // Returns i32 — ABI-encodes as Solidity int32 via alloy Int<32>.
        todo!()
    }
}
```

**Type mapping table** (verified from alloy-rs/core source and stylus-by-example docs):

| Solidity type | Rust type | Notes |
|---|---|---|
| `uint128` | `U128` | alloy_primitives::U128 |
| `uint8` | `u8` | native Rust; U8 also works |
| `bool` | `bool` | native Rust |
| `uint256` | `U256` | alloy_primitives::U256 |
| `int32` return | `i32` | alloy Int<32> roundtrips as i32 |

**State mutability:** `&self` (not `&mut self`) → ABI-encodes as `view`. The SettlementManager seam uses `try IStylusScoreEngine(addr).compute_rep_change(...)` — Solidity `try` on an `external view` function issues a `STATICCALL`. The Stylus WASM runtime correctly responds to staticcall for `view` functions.

**Verification command** (add to CI):

```bash
# After building, verify the exported ABI matches the locked interface
cargo stylus export-abi 2>/dev/null | grep "compute_rep_change"
# Expected output line:
#   function compute_rep_change(uint128 currentRep, uint8 conviction, ...) external view returns (int32);
```

---

### Risk 2: TransparentUpgradeableProxy → Stylus WASM Delegatecall

**Verdict: SUPPORTED, but architecture requires clarity.**

**Evidence:** ArbOS handles EVM↔WASM interoperability at the opcode level. When a Solidity `TransparentUpgradeableProxy` delegatecalls to a Stylus impl address:
- The ArbOS router sees DELEGATECALL targeting a Stylus-registered WASM program
- The WASM runtime executes in the proxy's storage context (normal delegatecall semantics)
- This is the pattern used by Superposition (Longtail AMM) and documented in the Stylus Saturdays proxy post

**However:** The engine is **stateless and view** — it reads no storage at all. Storage-layout collision is impossible by construction. This makes it safe even if delegatecall semantics were subtly different from regular call semantics for WASM.

**What `SettlementManager.setStylusScoreEngine(addr)` should point at:** The **proxy address**, not the impl. The seam calls `IStylusScoreEngine(stylusAddr).compute_rep_change(...)` as a regular external view call. The call hits the proxy (Solidity TransparentUpgradeableProxy). The proxy's fallback delegatecalls to the Stylus impl. This is the standard transparent proxy pattern.

```
SettlementManager
    └─ CALL → TransparentUpgradeableProxy (EVM, Solidity 0.8.30)
                  └─ DELEGATECALL → StylusScoreEngine (WASM impl)
                                       └─ compute_rep_change() → i32
```

**Proxy admin key:** Deployer key at Phase 5 (per REP-21). Promoted to multisig in Phase 6 per SAFETY-20.

**48h cutoff:** `cast send $PROXY_ADMIN "upgrade(address,address)" $PROXY_ADDR $SOLIDITY_BASELINE_ADDR` — one call. OPS-16 runbook already documents this command.

---

### Risk 3: Standalone `SolidityScoreEngine.sol` Is Required

**The gap:** Today the baseline lives in `SettlementManager._solidityBaselineRepDelta()` — a `private pure` function. There is NO contract address implementing `IStylusScoreEngine` that the proxy can be upgraded to.

**Phase 5 MUST deliver `SolidityScoreEngine.sol`:**

```solidity
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;

import "./interfaces/IStylusScoreEngine.sol";

/// @title SolidityScoreEngine
/// @notice 48h-cutoff fallback: deploys to the same transparent proxy slot as the
///         Stylus engine. Implements IStylusScoreEngine with the SAME math as
///         SettlementManager._solidityBaselineRepDelta (REP-22, REP-24).
///         No storage — stateless, view-only.
contract SolidityScoreEngine is IStylusScoreEngine {
    /// @inheritdoc IStylusScoreEngine
    function compute_rep_change(
        uint128 /*currentRep*/,
        uint8   conviction,
        uint8   /*consensusPct*/,       // fixed contrarian=1.0 (baseline fidelity)
        bool    isWinner,
        uint256 baseValue
    ) external view override returns (int32 delta) {
        // MUST be byte-for-byte identical to SettlementManager._solidityBaselineRepDelta:
        //   scaled = (baseValue * conviction * 2) / 100; floor 1.
        uint256 scaled = (baseValue * uint256(conviction) * 2) / 100;
        if (scaled < 1) scaled = 1;
        if (isWinner) {
            delta = int32(int256(scaled));
        } else {
            delta = -int32(int256(scaled));
        }
        // REP-02: floor at 0 is applied by applyRepDelta in ProfileRegistry, not here.
    }
}
```

**Deploy sequence for 48h cutoff:**
1. Deploy `SolidityScoreEngine.sol` to Sepolia → get `$SOLIDITY_BASELINE_ADDR`
2. Deploy `TransparentUpgradeableProxy` pointing at Stylus impl
3. If cutoff fires: `cast send $PROXY_ADMIN "upgrade(address,address)" $PROXY_ADDR $SOLIDITY_BASELINE_ADDR --rpc-url ... --private-key ...`
4. Verify: `cast call $PROXY_ADDR "implementation()(address)"` returns `$SOLIDITY_BASELINE_ADDR`

**Math parity check (REP-24):** Add a Solidity test asserting:
```solidity
assertEq(
    solidityEngine.compute_rep_change(currentRep, conviction, consensusPct, isWinner, 10),
    settlementManager.exposed_solidityBaselineRepDelta(conviction, consensusPct, isWinner)
);
```
The `_solidityBaselineRepDelta` is `private` — expose via a test harness or inline the math in the assertion.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Reputation scoring computation | Stylus WASM (off-chain compile, on-chain execute) | Solidity baseline (fallback) | Compute-heavy math; Rust saves gas vs Solidity at scale |
| Proxy admin / upgradeability | Solidity `TransparentUpgradeableProxy` | — | OZ Stylus only ships UUPS natively; Solidity proxy in front of Stylus impl is the standard pattern |
| Selector routing to engine | `SettlementManager` (try/catch seam) | — | Phase 4 sealed this seam; Phase 5 wires a real engine address |
| 365-day reactivation alerts | Relayer `stylus-deactivation-watcher.ts` + Google Calendar | — | Two independent belts prevent missed reactivation |
| 48h/72h/24h demo-cutoff alerts | New: extend relayer + calendar script | — | Reuse deactivation-watcher pattern; add demo date thresholds |

---

## Standard Stack

All versions are PINNED per CLAUDE.md. Do not change.

### Core

| Library | Version | Purpose | Authority |
|---|---|---|---|
| `stylus-sdk` | `=0.10.7` | Rust Stylus contract SDK | CLAUDE.md "Smart Contracts (Rust / Stylus)" [VERIFIED: CLAUDE.md] |
| `cargo-stylus` | `0.6.3` | Build/check/deploy CLI | CLAUDE.md [VERIFIED: CLAUDE.md] |
| `openzeppelin-stylus` | `=0.3.0` | OZ Stylus primitives (alpha; pin with `=`) | CLAUDE.md [VERIFIED: CLAUDE.md] |
| `@openzeppelin/contracts` | `5.6.1` | `TransparentUpgradeableProxy`, `ProxyAdmin` | CLAUDE.md [VERIFIED: CLAUDE.md] |
| Solidity | `=0.8.30` | `SolidityScoreEngine.sol`, proxy admin contract | CLAUDE.md [VERIFIED: CLAUDE.md] |
| Motsu | latest from OZ repo | Rust unit tests for engine math | CLAUDE.md [VERIFIED: crates.io listing] |
| arbos-foundry | Feb 2026 release | Optional: Stylus+Foundry cross-VM tests | CLAUDE.md [VERIFIED: CLAUDE.md] |

### Rust toolchain setup

```bash
# Install Rust stable (no nightly needed for Stylus)
rustup target add wasm32-unknown-unknown

# Install cargo-stylus (pinned version)
cargo install --force --version 0.6.3 cargo-stylus

# Verify
cargo stylus --version
# → cargo-stylus 0.6.3
```

### Cargo.toml (real implementation replacing the Phase 0 stub)

```toml
[package]
name = "stylus-score-engine"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]

[dependencies]
stylus-sdk = { version = "=0.10.7", default-features = false }
# Uncomment if any OZ Stylus primitives needed:
# openzeppelin-stylus = { version = "=0.3.0" }

[dev-dependencies]
motsu = { git = "https://github.com/OpenZeppelin/motsu" }
# OR: motsu from crates.io once stable release ships

[profile.release]
codegen-units = 1
strip = true
lto = true
panic = "abort"
opt-level = "z"
```

---

## Architecture Patterns

### System Architecture Diagram

```
[SettlementManager.settle() step 8]
          |
          | CALL (external view)
          v
[TransparentUpgradeableProxy] ← upgradeTo($SOLIDITY_BASELINE) if cutoff
          |                              ^
          | DELEGATECALL                 |
          v                             |
  [StylusScoreEngine.wasm]    OR   [SolidityScoreEngine.sol]
  compute_rep_change(...)           compute_rep_change(...)
          |                                   |
          v                                   v
        i32 delta ─────────────────────────── i32 delta
          |
          v
  [ProfileRegistry.applyRepDelta(caller, delta)]
          |
          v
  RepCalculated event fired (or RepCalculatedFallback on catch)
```

### Recommended Project Structure

```
packages/contracts/
├── src/
│   ├── interfaces/
│   │   └── IStylusScoreEngine.sol      # LOCKED — do not modify
│   ├── SolidityScoreEngine.sol         # NEW: Phase 5 standalone baseline
│   ├── SettlementManager.sol           # Phase 4 — setStylusScoreEngine wired
│   └── ...
├── stylus/
│   ├── Cargo.toml                      # Replaces Phase 0 stub
│   ├── src/
│   │   ├── lib.rs                      # Engine entrypoint + #[selector] attribute
│   │   └── math.rs                     # Scoring logic (testable in isolation)
│   └── tests/                          # Motsu unit tests
├── test/
│   ├── SolidityScoreEngine.t.sol       # Math parity + interface compliance
│   └── StylusProxy.t.sol               # Proxy wiring tests
└── script/
    ├── DeployPhase5Stylus.s.sol        # Deploy proxy + impl + wire SM
    └── CutoffFallback.s.sol            # Documents upgrade() command
```

### Pattern 1: Selector Override for Snake_Case ABI Name

**What:** Apply `#[selector(name = "compute_rep_change")]` to force the 4-byte selector to match the locked Solidity interface.
**When to use:** Any time the Rust fn name contains underscores and the Solidity interface preserves them (non-standard but spec-locked here).

```rust
// Source: stylus-proc/src/macros/public/attrs.rs (verified from SDK source)
#[public]
impl StylusScoreEngine {
    #[selector(name = "compute_rep_change")]  // forces selector 0xff540eb6
    pub fn compute_rep_change(
        &self,
        current_rep:   U128,
        conviction:    u8,
        consensus_pct: u8,
        is_winner:     bool,
        base_value:    U256,
    ) -> i32 {
        // ... implementation
    }
}
```

**Verification after build:**

```bash
cargo build --release --target wasm32-unknown-unknown
cargo stylus export-abi | grep compute_rep_change
# Must output: function compute_rep_change(...) external view returns (int32);
# Cross-check: cast sig "compute_rep_change(uint128,uint8,uint8,bool,uint256)"
# Expected: 0xff540eb6
```

### Pattern 2: Math Isolation for Testability

Separate scoring logic from Stylus scaffolding so Motsu tests (and future arbos-foundry cross-VM tests) can test the math independently.

```rust
// packages/contracts/stylus/src/math.rs
pub fn compute_rep_delta(
    current_rep:   u128,
    conviction:    u8,
    consensus_pct: u8,
    is_winner:     bool,
    base_value:    u64,
) -> i32 {
    // pure Rust — no Stylus host calls; fully unit-testable
    // ...
}

// packages/contracts/stylus/src/lib.rs
#[public]
impl StylusScoreEngine {
    #[selector(name = "compute_rep_change")]
    pub fn compute_rep_change(&self, current_rep: U128, conviction: u8,
        consensus_pct: u8, is_winner: bool, base_value: U256) -> i32 {
        math::compute_rep_delta(
            current_rep.to::<u128>(),
            conviction,
            consensus_pct,
            is_winner,
            base_value.to::<u64>(), // base_value is always 10 in Phase 5
        )
    }
}
```

### Anti-Patterns to Avoid

- **Using `#[public]` on `compute_rep_change` WITHOUT `#[selector(name = ...)]`:** Silently produces the wrong selector; every SettlementManager call hits the catch branch.
- **`display: grid` in any OG card templates:** Not applicable to this phase (no UI work).
- **Storing state in StylusScoreEngine:** The engine is stateless; all reputation state lives in ProfileRegistry. Adding storage to the engine breaks the proxy upgrade path.
- **Pointing `setStylusScoreEngine` at the impl address:** Must point at the proxy. If the engine is later upgraded, the SM address is unchanged because the proxy is the stable address.
- **Using `&mut self` instead of `&self`:** Changes ABI state mutability from `view` to `nonpayable`. The Solidity `try` statement on a `view` function uses `STATICCALL`; mismatching mutability will cause unexpected behavior.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Proxy admin + upgradeability | Custom admin contract | `TransparentUpgradeableProxy` + `ProxyAdmin` from OZ 5.6.1 | Storage layout, selector collision, admin separation already handled |
| ABI encoding/decoding | Manual byte encoding | alloy_primitives types + stylus-sdk `#[public]` macro | Alloy handles ABI compliance; hand-rolling produces subtle encoding bugs |
| Unit test harness | Custom WASM mock runner | Motsu (`#[motsu::test]`) | Intercepts Stylus host functions without spinning up a chain |
| Cross-VM integration test | Custom Foundry extension | arbos-foundry `arbos-forge test` | Native Stylus WASM activation + Foundry test runner |
| Selector computation | `keccak256(...)` in deploy script | `cast sig "compute_rep_change(uint128,uint8,uint8,bool,uint256)"` | Computed correctly via `0xff540eb6`; verify CI step catches regressions |

**Key insight:** The ABI boundary is where custom solutions introduce the most risk. Every layer of the stack (alloy types, `#[public]` macro, Motsu, arbos-foundry) exists because hand-rolling EVM↔WASM ABI interop is error-prone in ways that are invisible until mainnet.

---

## Reputation Math — Full-Fidelity Engine (REP-20)

### What the spec specifies (§7.3, §7.4, §12.6)

**Winning call:**
```
rep_gain = base_gain × confidence_multiplier × contrarian_multiplier
```
- `base_gain`: "suggested 10" — Phase 5 uses `base_value` param (always passed as 10 by SM)
- `confidence_multiplier`: "~0.5 at 50% conviction to ~2.0 at 100% conviction (linear or curved)"
- `contrarian_multiplier`: "~2.0+ when 85% disagreed, ~0.7 when 80% agreed" (winners only)
- If conviction ≥ 85: apply **2× multiplier** on the total gain (§7.4)

**Losing call:**
```
rep_loss = base_loss × confidence_multiplier   (no contrarian multiplier)
```
- If conviction ≥ 85: apply **2× multiplier** on the total loss

**Floor at 0:** The spec says "clamping handled by caller" (IStylusScoreEngine docstring). `ProfileRegistry.applyRepDelta` applies the floor. The engine does NOT clamp — it returns potentially large negative deltas.

### Exact constants — OPEN QUESTION (see Open Questions #1)

The spec deliberately says "suggested" and "~approximately". Phase 5 must nail down exact integer arithmetic. Proposed implementation anchor (planner should confirm with user before locking):

```rust
// Proposed constants — confirm with user before final commit
const BASE_VALUE: i32 = 10;

// confidence_multiplier: linear, scaled to avoid float
// At conviction=50: 1.0x (50*2/100=1.0)
// At conviction=100: 2.0x (100*2/100=2.0)
// At conviction=0: 0.0x (but min floor of 1 applied)
fn confidence_multiplier_scaled(conviction: u8, base: i32) -> i32 {
    let scaled = (base * conviction as i32 * 2) / 100;
    if scaled < 1 { 1 } else { scaled }
}

// contrarian_multiplier (winners only):
// consensus_pct = fade/(follow+fade) real at settle time
// Higher consensus_pct = more contrarian = higher multiplier
// Proposed: linear from 0.7× at consensus_pct=20 to 2.0× at consensus_pct=85
// Using integer arithmetic: multiplier = 700 + (consensus_pct * 13 * 100 / 65) scaled /1000
// OPEN: exact formula not specified in spec — user sign-off required

// high-conviction asymmetry (conviction >= 85):
const HIGH_CONVICTION_THRESHOLD: u8 = 85;
// Apply 2× to the total after all multipliers
```

**Worked example (proposed — subject to user sign-off):**

| Scenario | currentRep | conviction | consensusPct | isWinner | Proposed delta |
|---|---|---|---|---|---|
| Bold correct call | 100 | 90 | 80 | true | +(10 × 1.8 × ~1.8) × 2 = ~+65 |
| Obvious correct call | 100 | 50 | 20 | true | +(10 × 1.0 × ~0.7) = ~+7 |
| Wrong low-conviction | 100 | 30 | 50 | false | -(10 × 0.6) = ~-6 |
| Wrong high-conviction | 100 | 90 | 50 | false | -(10 × 1.8) × 2 = ~-36 |
| Cold-start win (SM applies 25%) | 100 | 50 | 0 | true | engine returns +7 → SM scales to +2 |

**Note on floor:** The engine returns the full delta. If delta=-150 and currentRep=100, ProfileRegistry.applyRepDelta clamps to 0 (REP-02). The engine does not need to know currentRep for clamping.

**Note on currentRep parameter:** Passed in but primarily useful for future category-weighted routing that reads the profile. In Phase 5, the scoring logic may use `base_value` and the multipliers only.

---

## cargo-stylus 0.6.3 Build and Deploy Workflow

### Build commands (REP-19, REP-21)

```bash
# 1. Check: verifies WASM compiles and passes Stylus validity checks
#    Checks WASM size (<128KB uncompressed, <24KB compressed)
cargo stylus check --endpoint $SEPOLIA_RPC_URL

# 2. Export ABI: verify selector matches locked interface
cargo stylus export-abi
# grep for: compute_rep_change(uint128,...) external view returns (int32)

# 3. Deploy to Sepolia (--no-verify skips Sourcify; --locked uses Cargo.lock for reproducibility)
cargo stylus deploy \
  --no-verify \
  --endpoint $SEPOLIA_RPC_URL \
  --private-key $DEPLOYER_KEY

# 4. Activate (separate step — activation costs ~0.1 ETH)
cargo stylus activate \
  --address $STYLUS_IMPL_ADDR \
  --endpoint $SEPOLIA_RPC_URL \
  --private-key $DEPLOYER_KEY

# 5. Verify build hash (reproducible builds)
cargo stylus deploy --verify \
  --address $STYLUS_IMPL_ADDR \
  --endpoint $SEPOLIA_RPC_URL
```

**WASM size budget:** The release profile already applies `opt-level="z"` + `lto = true` + `strip = true` (from Phase 0 Cargo.toml). Scoring logic with no storage reads should compress to well under 24KB. Run `cargo stylus check` early — if WASM exceeds budget, remove dead code before adding more.

**Reproducible build note:** `cargo stylus deploy` runs in a Docker container by default for reproducibility. `--no-verify` skips this; the resulting build hash may differ between machines. For Sepolia testing, `--no-verify` is acceptable. For mainnet, use the default Docker path for a reproducible hash.

**Sepolia vs mainnet:** Same commands; only `--endpoint` changes. No Pyth-style address swap needed (the engine is purely computational, no oracle calls).

---

## Testing Strategy (REP-19, REP-20, REP-21, REP-24)

### Layer 1: Rust unit tests with Motsu

```rust
// packages/contracts/stylus/tests/test_score_engine.rs
#[cfg(test)]
mod tests {
    use motsu::prelude::*;
    use super::math::compute_rep_delta;

    #[test]
    fn test_winner_high_conviction() {
        let delta = compute_rep_delta(100, 90, 80, true, 10);
        assert!(delta > 0, "winner should gain rep");
        // Add exact expected value once constants locked
    }

    #[test]
    fn test_loser_no_contrarian() {
        let delta_high_consensus = compute_rep_delta(100, 50, 80, false, 10);
        let delta_low_consensus  = compute_rep_delta(100, 50, 20, false, 10);
        assert_eq!(delta_high_consensus, delta_low_consensus,
            "losses should not scale with contrarian (REP-06)");
    }

    #[test]
    fn test_high_conviction_2x() {
        let normal  = compute_rep_delta(100, 84, 50, true, 10);
        let highcon = compute_rep_delta(100, 85, 50, true, 10);
        // 85% triggers 2× — not a smooth gradation
        assert!(highcon > normal * 2 - 5 && highcon < normal * 2 + 5,
            "high conviction should roughly double the gain");
    }

    #[test]
    fn test_parity_with_solidity_baseline() {
        // Parity check: Rust engine vs Solidity baseline for standard inputs
        // At conviction=50, consensusPct=anything, isWinner=true, baseValue=10:
        // Solidity baseline: (10 * 50 * 2) / 100 = 10
        // Rust baseline path (no contrarian): should equal 10
        let delta = compute_rep_delta(100, 50, 0, true, 10);
        assert_eq!(delta, 10, "baseline parity at conviction=50, no contrarian");
    }
}
```

### Layer 2: Selector compatibility CI check

Add to `.github/workflows/contracts.yml` or `Makefile`:

```bash
# CI step: verify selector before any deployment
cast sig "compute_rep_change(uint128,uint8,uint8,bool,uint256)"
# Must output: 0xff540eb6

# Cross-check via cargo stylus export-abi
cargo stylus export-abi 2>/dev/null | grep "compute_rep_change"
# Must contain: function compute_rep_change(uint128,uint8,uint8,bool,uint256) external view returns (int32)
```

### Layer 3: Solidity parity tests (Foundry)

```bash
# packages/contracts/test/SolidityScoreEngine.t.sol
# Tests that SolidityScoreEngine.compute_rep_change outputs match
# SettlementManager._solidityBaselineRepDelta for all conviction/isWinner combos
forge test --match-contract SolidityScoreEngineTest -vv
```

### Layer 4: Proxy wiring test (Sepolia integration)

```bash
# After deploy: verify the seam works end-to-end
# 1. Deploy StylusScoreEngine (proxy + impl) to Sepolia
# 2. setStylusScoreEngine($PROXY_ADDR) on Sepolia SM
# 3. Trigger a test settlement (fake call), observe RepCalculated (not RepCalculatedFallback)
# 4. Deploy RevertingStylusEngine to same proxy slot
# 5. Verify RepCalculatedFallback fires on next settlement
```

### Layer 5: arbos-foundry (optional, if cross-VM testing bottleneck)

```bash
# Install arbos-foundry (Feb 2026 iosiro release)
# arbos-forge test runs Stylus WASM natively without a fork
arbos-forge test --match-test testStylusEngine -vv
```

---

## RevertingStylusEngine Fixture (Pitfall 2)

**Recommendation: Build as a tiny Solidity stub, NOT a Stylus crate.**

**Rationale:** The Phase 6 drill tests the SettlementManager try/catch behavior, not Stylus execution. A Solidity stub is:
- Trivially correct (no WASM compilation risk)
- Immediately deployable (no cargo-stylus activation)
- More faithful to the runtime fallback scenario (any reverting address — WASM or EVM — triggers the catch)

```solidity
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;

import "./interfaces/IStylusScoreEngine.sol";

/// @notice Phase 5 test fixture: intentionally reverts on compute_rep_change.
///         Used in Phase 6 SAFETY-42 drill to verify SettlementManager try/catch fires.
contract RevertingStylusEngine is IStylusScoreEngine {
    function compute_rep_change(
        uint128, uint8, uint8, bool, uint256
    ) external view override returns (int32) {
        revert("RevertingStylusEngine: intentional revert for Phase 6 drill");
    }
}
```

**Alternative (if Phase 6 drill must specifically test Stylus WASM path):** Build a minimal Stylus crate that panics unconditionally:

```rust
#[public]
impl RevertingEngine {
    #[selector(name = "compute_rep_change")]
    pub fn compute_rep_change(&self, ...) -> i32 {
        panic!("intentional revert")
    }
}
```

Both approaches make the try/catch fire. The Solidity stub is faster and lower-risk for Phase 5.

**Deploy fixture to Sepolia in Phase 5 so Phase 6 drill is mechanical.**

---

## Reactivation + Cutoff Calendar (Pitfall 17)

**Do NOT duplicate Phase 0 infra.** Extend it.

### What already exists

- `apps/relayer/src/workers/stylus-deactivation-watcher.ts`: polls `arbitrumActivationExpiry()` every 24h, fires Telegram alerts at T-30/15/7/1 days via Redis idempotency locks
- `packages/shared/src/constants/stylus-calendar.json`: Google Calendar event IDs (all `null` until Phase 5)
- `scripts/seed-calendar.ts` + `scripts/repoint-calendar.ts`: creates/updates Google Calendar events
- `docs/runbooks/OPS-16-stylus-reactivation.md` + `docs/runbooks/stylus-reactivation.md`: complete operator runbooks

### Phase 5 integration tasks (not a rewrite)

1. **Wire the deploy date:** After Sepolia/mainnet Stylus deploy, run:
   ```bash
   pnpm tsx scripts/repoint-calendar.ts --stylus-deploy-date $(date +%Y-%m-%d)
   ```
   This populates `stylus-calendar.json` with real Google Calendar event IDs.

2. **Wire `STYLUS_SCORE_ENGINE_ADDRESS` env var:** Update Fly secrets after deploy:
   ```bash
   fly secrets set STYLUS_SCORE_ENGINE_ADDRESS=$PROXY_ADDR --app call-it-relayer-sepolia
   ```
   The deactivation-watcher immediately begins polling; previously `stylusAddress: null` was a no-op.

3. **Add demo-cutoff alerts to deactivation-watcher:** Extend the existing watcher to also fire 72h/48h/24h alerts before a configured demo date:

   ```typescript
   // Extend StylusDeactivationWatcherOpts
   export interface StylusDeactivationWatcherOpts {
     // ... existing fields ...
     /** Demo date (Unix timestamp). If set, fires cutoff alerts at T-72h/T-48h/T-24h. */
     demoCutoffTimestamp?: number;
   }

   // Add to the tick() function AFTER the reactivation threshold checks:
   if (opts.demoCutoffTimestamp) {
     const demoThresholds = [72, 48, 24] as const; // hours
     const hoursUntilDemo = (opts.demoCutoffTimestamp - nowSeconds) / 3600;
     for (const h of demoThresholds) {
       if (hoursUntilDemo <= h && hoursUntilDemo > 0) {
         const lockKey = `stylus:demo-cutoff:T-${h}h:${dateKey}`;
         const acquired = await redis.set(lockKey, '1', 'EX', 86400, 'NX');
         if (acquired === 'OK') {
           await sendAlert('stylus_demo_cutoff', {
             hoursRemaining: Math.floor(hoursUntilDemo),
             threshold: h,
             demoCutoffTimestamp: opts.demoCutoffTimestamp,
             stylusAddress,
             message: h <= 48
               ? 'DECISION REQUIRED: Run cargo stylus check. If Stylus not working, execute proxy upgrade to Solidity baseline NOW.'
               : 'Pre-demo check: Verify Stylus engine is activated and compute_rep_change works.',
           });
         }
         break;
       }
     }
   }
   ```

4. **Populate `DEMO_CUTOFF_TIMESTAMP` env var** (or hard-code per deploy cycle in config).

---

## Common Pitfalls

### Pitfall 1: Default camelCase conversion silently breaks the seam
**What goes wrong:** `#[public]` converts `compute_rep_change` → `computeRepChange` → selector `0xfe7606ba`. SettlementManager calls `compute_rep_change` selector `0xff540eb6`. No match → catch branch always fires → `RepCalculatedFallback` on every settle.
**Why it happens:** The SDK's `verify_sol_name` function always applies `Case::Camel` unless `selector_override` is set.
**How to avoid:** `#[selector(name = "compute_rep_change")]` on the function definition. Verify with `cargo stylus export-abi`.
**Warning signs:** `RepCalculatedFallback` events firing for every settlement, never `RepCalculated`.

### Pitfall 2: RevertingStylusEngine not deployed before Phase 6
**What goes wrong:** Phase 6 drill (SAFETY-42) needs a reverting engine at a real address. If it's not pre-deployed, the drill blocks Phase 6.
**How to avoid:** Deploy `RevertingStylusEngine.sol` (or Stylus crate) to Sepolia as part of Phase 5 deploy script. Record address in `deployments/`.
**Warning signs:** Phase 6 planner has no `$REVERTING_ENGINE_ADDR` to work with.

### Pitfall 3: Missing standalone `SolidityScoreEngine.sol`
**What goes wrong:** The "48h cutoff = one cast call" pitch is false. `upgradeTo($SOLIDITY_BASELINE_ADDR)` fails because `$SOLIDITY_BASELINE_ADDR` is `address(0)` — no contract was deployed.
**How to avoid:** Deploy `SolidityScoreEngine.sol` to Sepolia and mainnet. Record address. Include in `CutoffFallback.s.sol` script.
**Warning signs:** `OPS-16-stylus-reactivation.md` Step 4 has `export SOLIDITY_BASELINE_ADDRESS=<phase-4-deployed-address>` but Phase 4 never deployed one.

### Pitfall 4: Engine state mutability mismatch
**What goes wrong:** Using `&mut self` makes the function `nonpayable`, not `view`. The Solidity `try` seam issues a `STATICCALL` (because the interface marks it `view`). A `nonpayable` function in a staticcall context reverts.
**How to avoid:** Use `&self` only. The engine reads no storage — pure computation.
**Warning signs:** `RepCalculatedFallback` fires with an empty `lowLevelError` bytes (staticcall to nonpayable = revert with no reason string).

### Pitfall 5: 48h cutoff path not tested on Sepolia before demo
**What goes wrong:** The upgrade command is written but never verified. Under demo pressure, the command fails (wrong proxy admin address, insufficient ETH, wrong ABI).
**How to avoid:** Execute the full upgrade round-trip on Sepolia during Phase 5: upgrade proxy to `SolidityScoreEngine`, verify `implementation()` returns it, upgrade back to Stylus.
**Warning signs:** `cast send $PROXY_ADMIN "upgrade(...)"` fails or returns unexpected value.

### Pitfall 17: Stylus reactivation deadline missed
**What goes wrong:** 365 days after activation, WASM stops executing. Every rep calculation falls to baseline. Alerting was wired to a stale date.
**How to avoid:** Run `repoint-calendar.ts` after every reactivation. Wire `STYLUS_SCORE_ENGINE_ADDRESS` to the deactivation-watcher immediately after Phase 5 deploy.
**Warning signs:** `stylus_watcher_inactive` log events still firing (stylusAddress still `null`) after deploy.

---

## Code Examples

### Full Engine Skeleton (selector-compatible, type-safe)

```rust
// packages/contracts/stylus/src/lib.rs
// Source: stylus-sdk 0.10.7 docs + SDK source verification (2026-06-02)

#![no_std]
#![no_main]

extern crate alloc;

use stylus_sdk::prelude::*;
use stylus_sdk::alloy_primitives::{U128, U256};

// The engine is stateless — no storage fields needed.
// `#[storage]` is still required for the struct declaration.
#[storage]
pub struct StylusScoreEngine;

#[public]
impl StylusScoreEngine {
    /// Compute the reputation delta for a settled call outcome.
    ///
    /// LOCKED INTERFACE: matches IStylusScoreEngine.compute_rep_change exactly.
    /// selector 0xff540eb6 = keccak256("compute_rep_change(uint128,uint8,uint8,bool,uint256)")[0:4]
    ///
    /// #[selector(name = "compute_rep_change")] is MANDATORY.
    /// Without it, the SDK converts to computeRepChange (0xfe7606ba) — wrong selector.
    #[selector(name = "compute_rep_change")]
    pub fn compute_rep_change(
        &self,
        current_rep:   U128,   // uint128 in Solidity
        conviction:    u8,     // uint8
        consensus_pct: u8,     // uint8 (0-100: fade/(follow+fade) at settle time)
        is_winner:     bool,   // bool
        base_value:    U256,   // uint256 (always 10 in Phase 5)
    ) -> i32 {                 // int32 in Solidity (i32 ABI-encodes as int32 via alloy Int<32>)
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

### Verifying ABI Export Matches Locked Interface

```bash
# Build (debug OK for ABI export)
cargo build --target wasm32-unknown-unknown 2>/dev/null

# Export ABI and check
EXPORTED=$(cargo stylus export-abi 2>/dev/null)
echo "$EXPORTED" | grep "compute_rep_change"

# Expected (must match IStylusScoreEngine.sol exactly):
# function compute_rep_change(uint128 currentRep, uint8 conviction, uint8 consensusPct, bool isWinner, uint256 baseValue) external view returns (int32 delta);

# 4-byte selector verification
cast sig "compute_rep_change(uint128,uint8,uint8,bool,uint256)"
# Must output: 0xff540eb6
```

### Motsu Unit Test Skeleton

```rust
// packages/contracts/stylus/tests/test_math.rs
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
        assert_eq!(low_consensus, high_consensus);
    }

    #[motsu::test]
    fn test_high_conviction_threshold() {
        // REP-07, CALL-30: 2× at conviction >= 85
        let below = compute_rep_delta(100, 84, 50, true, 10);
        let above = compute_rep_delta(100, 85, 50, true, 10);
        // above should be roughly 2× below (exact depends on multiplier curve)
        assert!(above > below);
    }

    #[motsu::test]
    fn test_parity_with_solidity_baseline() {
        // At conviction=50, no contrarian, isWinner=true, base=10:
        // Solidity baseline: (10 * 50 * 2) / 100 = 10
        let delta = compute_rep_delta(100, 50, 0, true, 10);
        assert_eq!(delta, 10, "Rust baseline parity at conviction=50");
    }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| OZ Stylus UUPS proxy as primary | Solidity TransparentUpgradeableProxy in front of Stylus impl | Phase 0 research | UUPS puts upgrade logic in Rust impl (riskier for v1); transparent proxy separates admin |
| `#[public]` default camelCase naming | `#[selector(name = "...")]` for snake_case selectors | SDK 0.10.x feature | Required for locked interface compatibility |
| arbos-foundry not available | arbos-foundry Feb 2026 (iosiro) provides native Stylus+Foundry testing | Feb 2026 | Optional but eliminates need for Sepolia fork for cross-VM tests |
| Reservoir NFT API | Alchemy NFT API | Oct 2025 (Reservoir sunset) | Not relevant to Phase 5 |

**Deprecated in this context:**
- `--verify` flag on `cargo stylus deploy` (still works, just slower; `--no-verify` acceptable for Sepolia)
- Stylus SDK < 0.10.x: workspace support + type-safe traits required 0.10.x

---

## Validation Architecture

> `workflow.nyquist_validation` is enabled (absent = enabled per config).

### Test Framework

| Property | Value |
|---|---|
| Framework (Rust) | Motsu (OZ Stylus test framework, latest from github.com/OpenZeppelin/motsu) |
| Framework (Solidity) | Foundry forge (existing project test suite) |
| Framework (cross-VM) | arbos-foundry (optional) |
| Config file | `packages/contracts/stylus/Cargo.toml` (dev-dependencies: motsu) |
| Quick run (Rust) | `cd packages/contracts/stylus && cargo test` |
| Full suite | `cd packages/contracts && forge test -vv && cd stylus && cargo test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| REP-19 | `compute_rep_change(uint128,uint8,uint8,bool,uint256) → i32` callable from SettlementManager | Sepolia integration | `cast call $PROXY_ADDR "compute_rep_change(uint128,uint8,uint8,bool,uint256)" 100 50 50 true 10` | ❌ Wave 0 |
| REP-19 | 4-byte selector matches 0xff540eb6 | CI selector check | `cast sig "compute_rep_change(uint128,uint8,uint8,bool,uint256)"` (must output `0xff540eb6`) | ❌ Wave 0 |
| REP-19 | ABI export matches IStylusScoreEngine | cargo check | `cargo stylus export-abi \| grep compute_rep_change` | ❌ Wave 0 |
| REP-20 | confidence multiplier: ~0.5 at conviction=50, ~2.0 at conviction=100 | Rust unit | `cargo test test_confidence_multiplier` | ❌ Wave 0 |
| REP-20 | contrarian multiplier winners only, no contrarian on losses | Rust unit | `cargo test test_contrarian_not_applied_to_losses` | ❌ Wave 0 |
| REP-20 | high-conviction 2× at conviction ≥ 85 | Rust unit | `cargo test test_high_conviction_threshold` | ❌ Wave 0 |
| REP-21 | proxy + impl deployed, deployer key admin | Sepolia integration | `cast call $PROXY_ADMIN "owner()(address)"` returns deployer | ❌ Wave 0 |
| REP-21 | upgradeTo() changes implementation | Sepolia integration | upgrade round-trip to SolidityScoreEngine + back | ❌ Wave 0 |
| REP-24 | SolidityScoreEngine.compute_rep_change matches _solidityBaselineRepDelta | Solidity unit | `forge test --match-test test_solidity_baseline_parity -vv` | ❌ Wave 0 |
| REP-24 | 48h cutoff command works on Sepolia | Sepolia integration | `cast send $PROXY_ADMIN "upgrade(address,address)" $PROXY $SOLIDITY_BASELINE` completes | ❌ Wave 0 |
| SAFETY-42 | RevertingStylusEngine causes RepCalculatedFallback to fire | Sepolia integration | deploy reverting engine, trigger settle, check event log | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `cargo test` (Rust unit) + `forge test --match-contract SolidityScoreEngineTest` (parity test)
- **Per wave merge:** Full `forge test -vv` + `cargo test` + selector CI check
- **Phase gate:** All Sepolia integration tests green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/contracts/stylus/src/lib.rs` — real engine (currently Phase 0 stub)
- [ ] `packages/contracts/stylus/src/math.rs` — scoring logic module
- [ ] `packages/contracts/stylus/tests/test_math.rs` — Motsu unit tests
- [ ] `packages/contracts/src/SolidityScoreEngine.sol` — standalone baseline (REP-24)
- [ ] `packages/contracts/src/RevertingStylusEngine.sol` — Phase 6 drill fixture
- [ ] `packages/contracts/test/SolidityScoreEngine.t.sol` — parity tests (forge)
- [ ] `packages/contracts/script/DeployPhase5Stylus.s.sol` — proxy + impl + SM wire
- [ ] `.github/workflows/` selector CI check step

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | No | N/A — engine is view-only, no auth surface |
| V3 Session Management | No | N/A |
| V4 Access Control | Yes | `setStylusScoreEngine` is `onlyOwner` (Phase 4, SettlementManager:641) |
| V5 Input Validation | Yes | Inputs bounded by uint128/uint8/bool/uint256; overflow protection in Rust (saturating or checked arithmetic) |
| V6 Cryptography | No | No key material in engine |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Selector mismatch → silent fallback | Spoofing | `#[selector(name = "...")]` + CI selector check |
| Wrong proxy admin key → unauthorized upgrade | Elevation of privilege | `onlyOwner` on `setStylusScoreEngine`; Phase 6 promotes to multisig (SAFETY-20) |
| Replay of old Solidity baseline via proxy downgrade | Tampering | Proxy admin key restricted; upgrade emits `Upgraded` event (loud audit trail) |
| WASM integer overflow in rep math | Tampering | Use Rust's checked arithmetic (`checked_mul`, `checked_add`) for all multiplier ops |
| Deactivation-watcher `stylusAddress` still null after deploy | Denial of service | Phase 5 deploy checklist includes `fly secrets set STYLUS_SCORE_ENGINE_ADDRESS` |

---

## Open Questions

1. **Exact reputation multiplier constants** [ASSUMED values proposed]
   - What we know: spec says "suggested 10" for base, "~0.5 at 50% to ~2.0 at 100%", "~2.0+ at 85% disagreement, ~0.7 at 80% agreement"
   - What's unclear: exact integer-arithmetic formula for contrarian_multiplier — linear? piecewise? what are the anchoring points?
   - Recommendation: Planner must request user sign-off on specific constants before implementing. Propose a linear function anchored at (consensusPct=0, mult=0.7) and (consensusPct=85, mult=2.0) as a starting point.
   - Risk if wrong: Rep scores differ from user expectation; may require proxy upgrade to fix math post-launch.

2. **`currentRep` parameter — is it used in the Phase 5 computation?** [ASSUMED: not used for scoring, only passed for future compatibility]
   - What we know: IStylusScoreEngine passes `currentRep: uint128`; spec §12.6 mentions "current rep state" as input
   - What's unclear: Does Phase 5 full-fidelity engine use currentRep (e.g. for diminishing returns at high rep), or is it future-reserved?
   - Recommendation: Treat as unused in Phase 5 (pass-through); document as `_current_rep` to suppress unused warnings.

3. **Delegatecall from TransparentUpgradeableProxy to Stylus WASM — MEDIUM confidence** [CITED: Stylus Saturdays proxy article, Superposition audit, ArbOS docs; not confirmed via explicit official Arbitrum statement]
   - What we know: ArbOS handles EVM↔WASM interop; delegatecall to Stylus works per community reports and Longtail production usage
   - What's unclear: Whether any edge cases exist for delegatecall to a `view` stateless Stylus function specifically
   - Recommendation: Test the full proxy→Stylus delegatecall path on Sepolia FIRST (before mainnet). If it fails, use a thin Solidity forwarder contract instead of a transparent proxy.

4. **arbos-foundry maturity for this project** [ASSUMED: MEDIUM — new tool]
   - What we know: Released Feb 2026 by iosiro; eliminates Sepolia fork for cross-VM Stylus tests
   - What's unclear: Does it support `#[selector(name = "...")]` override in 0.10.7?
   - Recommendation: Use Motsu for unit tests (proven) and Sepolia integration for cross-VM tests. arbos-foundry is optional speedup.

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 5 |
|---|---|
| Solidity pinned to `=0.8.30` | `SolidityScoreEngine.sol` and proxy admin contract must use `pragma solidity =0.8.30;` |
| `stylus-sdk = "=0.10.7"` | Exact pin in Cargo.toml; do not float |
| `openzeppelin-stylus = "=0.3.0"` | Alpha line; pin with `=`; uncomment in Cargo.toml when needed |
| `@openzeppelin/contracts@5.6.1` | `TransparentUpgradeableProxy`, `ProxyAdmin` from this version |
| `cargo-stylus 0.6.3` | CLI commands use this version; `cargo install --force --version 0.6.3 cargo-stylus` |
| No delegatecall to user-controlled addresses (§10.5) | StylusScoreEngine is owner-controlled; proxy upgrade is owner-only. Compliant. |
| Checks-Effects-Interactions (§10.5) | Engine is pure view — no state changes, no CEI concern |
| USDC hardcoded address gate | Engine does no USDC transfers — not applicable |
| Phase 5 is contracts/ops only — NO UI/frontend work | Confirmed by phase description |
| Sepolia staging gate ≥48h before mainnet (§19.10) | Phase 5 Sepolia deploy + proxy wire-up + 48h soak required |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | `delegatecall` from Solidity `TransparentUpgradeableProxy` to Stylus WASM is supported on ArbOS | Risk 2, Architecture Diagram | Proxy pattern breaks; need thin Solidity forwarder instead |
| A2 | Exact contrarian multiplier formula is linear between (0, 0.7) and (85, 2.0) | Rep Math section | User may have different anchoring in mind; math constants need sign-off |
| A3 | `currentRep` parameter is unused in Phase 5 engine computation | Open Questions #2 | If rep should diminish at high values, formula changes materially |
| A4 | Motsu is available from `github.com/OpenZeppelin/motsu` at a usable version for stylus-sdk 0.10.7 | Testing section | May need to pin a specific git SHA or use crates.io release |
| A5 | `SolidityScoreEngine` math matches `_solidityBaselineRepDelta` byte-for-byte (as shown in skeleton) | Risk 3 | Any divergence means the cutoff fallback produces different rep deltas than the runtime fallback |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Rust stable + wasm32-unknown-unknown | cargo build | Likely (Cargo.toml present from Phase 0) | Unknown — verify | `rustup target add wasm32-unknown-unknown` |
| cargo-stylus 0.6.3 | deploy/check | Unknown | — | `cargo install --force --version 0.6.3 cargo-stylus` |
| Foundry forge | Solidity tests | Yes (project uses Foundry) | nightly | — |
| cast (Foundry) | Selector verification | Yes (Foundry) | nightly | — |
| Arbitrum Sepolia RPC | Integration tests | Yes (Alchemy key in env) | — | — |
| ETH on Sepolia (deployer) | Stylus activation (~0.1 ETH) | Unknown — check deployer balance | — | Faucet or Alchemy |
| Redis | stylus-deactivation-watcher | Yes (Railway/Fly) | 7.x | — |

**Missing with no fallback:**
- ETH on Sepolia for Stylus activation. Check deployer balance before deployment wave. If insufficient, top up from Alchemy faucet or Fly secrets `PYTH_ETH_BUDGET` topup pattern (see Phase 4 note).

---

## Sources

### Primary (HIGH confidence)

- `stylus-proc/src/macros/public/mod.rs` (SDK source, verified via GitHub API) — confirms `Case::Camel` default and `selector_override` mechanism
- `stylus-proc/src/macros/public/attrs.rs` (SDK source) — confirms `Selector { value: syn::LitStr }` struct for `#[selector(name = "...")]`
- `alloy-rs/core: crates/sol-types/src/types/data_type.rs` — confirms `Int<32>` roundtrips as `i32`
- `cast sig "compute_rep_change(uint128,uint8,uint8,bool,uint256)"` → `0xff540eb6` (verified locally)
- `cast sig "computeRepChange(uint128,uint8,uint8,bool,uint256)"` → `0xfe7606ba` (verified locally)
- `packages/contracts/src/interfaces/IStylusScoreEngine.sol` — locked interface, read in full
- `packages/contracts/src/SettlementManager.sol` lines 270-310, 641, 731-748 — try/catch seam verified
- `packages/contracts/stylus/Cargo.toml` — Phase 0 pin stub verified
- CLAUDE.md "Smart Contracts (Rust / Stylus)" table — authoritative pinned versions
- CALL_IT_SPEC1.md §7.3, §7.4, §11.6, §12.6 — reputation formula and engine spec

### Secondary (MEDIUM confidence)

- stylus-by-example.org/basic_examples/primitive_data_types — type mapping table (U128, U8, bool, I8, etc.)
- docs.arbitrum.io/stylus/reference/rust-sdk-guide — view function `&self` → `view` mutability
- Stylus Saturdays "Writing proxies in Arbitrum Stylus" — delegatecall pattern recommendations
- [arbos-foundry announcement (iosiro, Feb 2026)](https://www.iosiro.com/blog/introducing-arbos-foundry-native-stylus-testing-with-foundry)
- [Motsu OZ Stylus testing](https://www.openzeppelin.com/news/test-your-stylus-contracts-with-motsu)

### Tertiary (LOW confidence / ASSUMED)

- Delegatecall from Solidity proxy to Stylus WASM: supported per community reports; not explicitly documented in official Arbitrum docs

---

## Metadata

**Confidence breakdown:**

- ABI selector mechanism: HIGH — verified from SDK source code + `cast sig` arithmetic
- Type mappings: HIGH — verified from alloy-rs source + stylus-by-example docs
- Proxy→Stylus delegatecall: MEDIUM — supported per community/audit evidence, not explicit official docs
- Reputation math constants: LOW — spec says "suggested"; exact values require user sign-off
- Reactivation/cutoff wiring: HIGH — existing infra verified from source files

**Research date:** 2026-06-02
**Valid until:** 2026-07-02 (stable Stylus SDK, 30-day window)
