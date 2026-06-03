# Phase 6: Safety review + Sepolia 48h soak + multisig promotion — Research

**Researched:** 2026-06-03
**Domain:** Smart contract safety verification, Foundry fork testing, Safe multisig, Sepolia soak orchestration, pre-mainnet gates
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 — Hybrid money-path validation (b+c):**
- Mainnet-fork Foundry suite (CI; real USDC + Pyth) extending `SettlementManagerForkTest.sol`
- AND live public Sepolia money via Circle Sepolia USDC `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`
- USDC.sol gets `USDC_ARB_SEPOLIA` + `resolveUsdc()` returning canonical on chainid 42161, Circle on 421614, reverting on any other chain
- Each money contract constructor asserts `_usdc == resolveUsdc()`
- CI grep guard moves from single-literal to 2-address allowlist {mainnet canonical, Circle Sepolia}
- Full Sepolia cluster redeploy with Circle USDC baked in; re-wire addresses.ts + subgraph.yaml + relayer env
- Security review via `/gsd-secure-phase` + `/gsd-code-review` before the redeploy is trusted
- The mainnet unfakeable-USDC invariant (SAFETY-13) is preserved — only the chainid gate is added

**D-02 — Solo 2-of-3 Safe:**
- Operator holds all 3 keys (hardware wallet + 2 backups)
- 3 concrete signer addresses are an execution-time input

**D-03 — Rehearse on Sepolia, stand up production Safe on Arbitrum One:**
- (a) Deploy matching 2-of-3 Safe on Sepolia; run full transferOwnership → acceptOwnership on redeployed Sepolia cluster; prove multisig-executed pause and proxy upgrade
- (b) Deploy production Safe on Arbitrum One ready for Phase 7
- Real mainnet ownership transfer happens at Phase 7 using this proven runbook

**D-04 — Scripted seeding bot for bulk on-chain soak counts:**
- Uses Circle Sepolia faucet + live relayer
- Drives ≥10 calls / ≥30 follow-fade / ≥3 settles-per-type / caller-exit / challenge cycle / owner-resolved dispute on schedule
- Emits evidence logs
- Mainnet-fork money-path suite runs in CI alongside
- 5 folded Phase-4 UAT items verified manually through UI (human judgment required)

**D-05 — Telegram alerts + evidence log:**
- Wire settlement-stuck, paymaster cap, Stylus-fallback alerts reusing `stylus-deactivation-watcher.ts` alert path
- Evidence log maps every SAFETY-29–43 item + every PITFALLS 38-item to tx hash / screenshot

**D-06 — Keep Phase 6 whole:**
- If planner finds context budget exceeded, return `## PHASE SPLIT RECOMMENDED` with concrete groupings; natural seam is 6a safety+soak / 6b multisig promotion

**D-07 — Budget approval deferred to Phase 7:**
- ~$175/mo recurring + $150-300 upfront ops spend is mainnet-only; Sepolia soak runs on free infra

### Claude's Discretion
- Security-review mechanism: GSD's `/gsd-secure-phase` + `/gsd-code-review` over USDC.sol / constructor / CI-guard / redeploy diff
- Exact redeploy set: redeploying CallRegistry forces FFM+CE+SM (immutable refs); ProfileRegistry only if constructor must change; reuse DeployPhase5_1.s.sol's full-cluster + consistency-assertion pattern
- Fork RPC + faucet ops: Alchemy Arbitrum One RPC for fork; Circle Sepolia faucet rate-limits handled inside seeding script (multiple funded wallets, throttling)
- Evidence-log format + monitoring depth specifics: planner picks, anchored to SAFETY-29–43 + PITFALLS-38 mapping and existing relayer alert hooks

### Deferred Ideas (OUT OF SCOPE)
- Real mainnet contract deploy + real mainnet ownership transfer (Phase 7)
- Recurring ops budget approval (Phase 7 entry item)
- Post-deploy 20-minute smoke test SAFETY-44 (Phase 7.5)
- External / professional security audit (post-hackathon)
- Distributed (multi-party) multisig signers (v1.1)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SAFETY-02 | TVL cap $5,000 aggregated across all contracts holding funds | TVL aggregation patterns; TvlAggregation.t.sol extension |
| SAFETY-03 | setTvlCap owner-only, capped at MAX_ALLOWED_CAP $100K | Owner-only guard verification; Cast read pattern |
| SAFETY-19 | StylusScoreEngine only upgradable contract; pause → upgrade → unpause | Proxy upgrade via multisig on Sepolia; destruction drill |
| SAFETY-20 | Proxy admin key rotates to multisig before v1.1 / before TVL > $5K | Safe deploy on Arbitrum One; Ownable2Step rehearsal |
| SAFETY-21 | Sepolia staging gate ≥48h — non-optional | Seeding bot design; Circle faucet rate limits |
| SAFETY-22 | ≥10 seeded calls covering each call type | Seeding bot orchestration |
| SAFETY-23 | ≥30 follow/fade positions | Seeding bot orchestration |
| SAFETY-24 | ≥3 settled calls per type — verify outcome words, payouts, rep | Soak evidence log |
| SAFETY-25 | ≥1 caller-exit triggered with broadcast verified | Soak evidence log |
| SAFETY-26 | ≥1 challenge cycle settled | Soak evidence log |
| SAFETY-27 | ≥1 dispute raised and resolved via owner path | Soak evidence log |
| SAFETY-28 | Pyth confidence retry exercised with SettlementDelayed verified | Soak evidence log; relayer Pyth worker |
| SAFETY-29 | All Phase 6 safety tests pass on Sepolia before mainnet | Full matrix execution |
| SAFETY-30 | Emergency pause buttons work on every state-changing function | CallRegistrySafety.t.sol extension |
| SAFETY-31 | TVL cap boundary $4,999 OK / $5,001 reverts | TvlAggregation.t.sol — ChallengeEscrow extension |
| SAFETY-32 | Max stake $100 OK / $101 reverts | Boundary fixture |
| SAFETY-33 | Min position $1 OK / $0.99 reverts | Boundary fixture |
| SAFETY-34 | All withdraw/claim paths work while paused | Pause carve-out test |
| SAFETY-35 | Caller-exit 24h lock + penalty math at all decay points | Decay fixture |
| SAFETY-36 | Follower/fader 4h cooldown and 10% slash math | Cooldown fixture |
| SAFETY-37 | Duplicate-hash UTC-day-boundary edge cases | UTC edge fixture |
| SAFETY-38 | Slippage minSharesOut reverts when AMM moves between quote and execution | Slippage fixture |
| SAFETY-39 | Settlement idempotency — second settle reverts cleanly | Idempotency fixture |
| SAFETY-40 | Self-challenge gate — caller cannot challenge themselves | SelfChallenge revert |
| SAFETY-41 | Reentrancy guard with USDC mock callback attempt | CallRegistrySafety.t.sol MaliciousReentrantUSDC |
| SAFETY-42 | Stylus runtime fallback — deploy RevertingStylusEngine, verify RepCalculatedFallback fires | Destruction drill plan |
| SAFETY-43 | Owner-only functions — non-owner cannot pause/setTvlCap/setSettlementManager/etc. | Owner guard tests |
</phase_requirements>

---

## Summary

Phase 6 is the pre-mainnet safety gate. It produces seven verifiable deliverables — none of which are new product features — all of which gate Phase 7. The work is tightly sequential: USDC chainid-gate change → security review → full cluster redeploy with Circle USDC → re-wire all downstream systems → relayer go-live → safety matrix verification → 48h soak with evidence log → multisig ownership transfer rehearsal on Sepolia → production Safe deployment on Arbitrum One.

The existing codebase is in excellent shape for this phase. `RevertingStylusEngine.sol` is already built (SAFETY-42 drill is mechanical). `SettlementManagerForkTest.sol` is the mainnet-fork harness scaffold. `TvlAggregation.t.sol`, `CallRegistrySafety.t.sol`, and `FollowFadeMarketInterference.t.sol` cover large portions of SAFETY-29–43 already — the matrix work is extension, not greenfield. `DeployPhase5_1.s.sol` is the cluster redeploy template with consistency assertions. The key NEW work is: the `resolveUsdc()` chainid gate in USDC.sol + constructor changes, the CI-guard allowlist expansion, a `DeployPhase6.s.sol` that extends 5_1's pattern with the new USDC, a Safe deploy + Ownable2Step rehearsal script, and the seeding bot.

The single highest-risk item is the USDC.sol change: it touches a LOCKED safety invariant and requires passing the security review gates before the redeploy is trusted. The Foundry safety tests are largely additive to existing fixtures and can be pipelined in parallel with the USDC change work. The multisig promotion is the final gate — nothing promotes to Phase 7 until `cast call <contract> "owner()"` returns the multisig address on the Sepolia rehearsal cluster.

**Primary recommendation:** Sequence work as: (1) USDC gate + security review + cluster redeploy [unblocks relayer go-live + soak start], (2) safety matrix test extensions [can run in parallel with soak], (3) 48h soak window [time-locked — starts after relayer go-live], (4) multisig promotion [final gate]. The mainnet-fork CI suite runs continuously throughout.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| resolveUsdc() chainid gate | Solidity contracts (USDC.sol + constructors) | CI grep guard | On-chain enforcement is the root; CI is the build-time signal |
| Full-cluster Sepolia redeploy | Deploy scripts (Foundry) | addresses.ts + subgraph.yaml + relayer env | Contracts are source of truth; all downstream re-point to new addresses |
| Mainnet-fork money-path suite | Foundry test (fork) | CI pipeline | Real USDC + Pyth, deterministic, no external dependency |
| SAFETY-29–43 matrix tests | Foundry test (unit + mock USDC) | Sepolia live verification | Unit tests catch regressions; Sepolia confirms live behavior |
| Stylus destruction drill | Sepolia live (proxy.upgradeTo + settle) | Foundry unit for catch branch | Must be live — proves the actual deployed proxy's try/catch |
| 48h soak seeding | Seeding bot (Node.js script) | Circle Sepolia faucet | Bot drives volume; faucet supplies USDC to test wallets |
| Soak evidence log | Seeding bot + operator | — | Bot emits tx hashes; operator annotates PITFALLS checklist |
| Pre-deploy ritual checks | CI grep + relayer ETH check + Pyth bytes32 CI | Manual operator diff | CI automates the durable checks; operator runs diff ritual once |
| Safe 2-of-3 multisig deploy | Script (TypeScript via Safe protocol-kit v7 or Foundry cast) | Sepolia rehearsal | Deploy then rehearse; promote to mainnet readiness |
| Ownable2Step transfer rehearsal | Foundry script + cast calls | Safe UI | Script encodes all 7 transferOwnership calls; cast verifies |
| Telegram soak alerts | Relayer workers (existing stylus-deactivation-watcher.ts pattern) | — | Reuse existing alert infrastructure |

---

## Standard Stack

### Core (Contracts + Testing)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Foundry (forge/cast/anvil) | 1.7.1 [VERIFIED: local] | Build, test, fork, deploy | Project-pinned; all existing tests use it |
| Solidity | 0.8.30 [VERIFIED: foundry.toml] | All contract source | Exact pin in foundry.toml; cannot change |
| OpenZeppelin Contracts | 5.6.1 [ASSUMED] | ReentrancyGuard, Ownable2Step, ERC1967Proxy | Already in project; provides Ownable2Step used by all contracts |
| forge-std | ≥1.9.5 [ASSUMED] | Test helpers: vm.deal, vm.prank, makeAddr | Already in project |

### Safe Multisig

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @safe-global/protocol-kit | 7.2.0 [VERIFIED: npm registry] | Deploy Safe + create/sign/execute transactions | Current Safe TypeScript SDK; v7 is the active line |
| @safe-global/api-kit | 4.2.0 [VERIFIED: npm registry] | Propose transactions to Safe Transaction Service (Arbitrum supported) | Companion to protocol-kit for multi-signer coordination |
| @safe-global/safe-contracts | 1.4.1-2 [VERIFIED: npm registry] | ABI + addresses for Safe singletons on Arbitrum | Contains the canonical Safe contract factory addresses |
| safe-cli | 1.4.10 [VERIFIED: local npm] | Optional: command-line Safe interaction | Useful for one-off transaction proposals from shell |

### Pyth Hermes (fork test VAA fetch)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @pythnetwork/hermes-client | 3.1.0 [CITED: CLAUDE.md] | Fetch price update VAAs for Pyth pull oracle | Required for realistic fork settle(); Hermes returns bytes[] for updatePriceFeeds |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| viem | 2.50.4 [CITED: CLAUDE.md] | Cast-replacement for TypeScript scripts (seeding bot, Safe deploy) | Wherever TypeScript makes sense over cast commands |
| @pythnetwork/pyth-sdk-solidity | 4.3.1 [CITED: CLAUDE.md] | IPyth interface for fork tests | Already in contracts |
| bullmq / redis | latest / 7.x [CITED: CLAUDE.md] | Seeding bot job queue (rate-limited faucet calls) | Rate-limit faucet requests across multiple wallets |

**Version verification note:** `@safe-global/protocol-kit@7.2.0`, `safe-cli@1.4.10`, `forge 1.7.1` verified locally. Other versions cited from CLAUDE.md or ASSUMED from training knowledge and should be confirmed at execution time with `npm view <package> version`.

---

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ WAVE 1: USDC GATE + SECURITY REVIEW + REDEPLOY                  │
│                                                                   │
│  USDC.sol (add resolveUsdc())                                     │
│       │ constructor assert _usdc == resolveUsdc()                │
│       ▼                                                           │
│  Security Review (/gsd-secure-phase + /gsd-code-review)         │
│       │ passes                                                    │
│       ▼                                                           │
│  DeployPhase6.s.sol (extends DeployPhase5_1.s.sol pattern)       │
│    CR v4 → FFM v4 → CE v3 → SM v5                                │
│    [Circle USDC baked in on Sepolia; resolveUsdc() asserted]     │
│       │                                                           │
│  ┌────┴─────────────────────────────────┐                        │
│  │ addresses.ts + subgraph.yaml + relayer env                    │
│  │ CI grep guard (2-address allowlist)                           │
│  └───────────────────────────────────────────────────────────── │
└─────────────────────────────────────────────────────────────────┘
         │ relayer go-live (05.1-OPERATOR-HANDOFF 5-step retargeted)
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ WAVE 2: SAFETY MATRIX TESTS (CI + Sepolia)                      │
│                                                                   │
│  Foundry fork suite (ARB_ONE_RPC_URL)                            │
│   SettlementManagerForkTest — extend:                            │
│     • full create→follow/fade→settle→exit→dispute loop           │
│     • real USDC deal/impersonate                                 │
│     • Pyth VAA from Hermes (or vm.mockCall for CI)               │
│     • fee extraction assertions                                  │
│                                                                   │
│  SAFETY-29–43 unit matrix (extends existing .t.sol files)        │
│   CallRegistrySafety.t.sol → pause/reentrancy/owner guards      │
│   TvlAggregation.t.sol → ChallengeEscrow included in TVL        │
│   FollowFadeMarketInterference.t.sol → slippage/cooldown        │
│   New: SettlementSafetyMatrix.t.sol → idempotency/decay/dup     │
│   New: RevertingStylusEngineDrill.t.sol → SAFETY-42 unit        │
└─────────────────────────────────────────────────────────────────┘
         │ concurrent with Wave 2
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ WAVE 3: 48h SOAK (SAFETY-21–28 + PITFALLS 38-item checklist)   │
│                                                                   │
│  Seeding bot (Node.js + viem)                                    │
│   Circle faucet → 10+ funded wallets                             │
│   Throttled: 20 USDC per wallet per 2h                           │
│   Drives: calls / follows-fades / settles / exits / challenges  │
│                                                                   │
│  Live relayer (05.1 5-step go-live, retargeted)                  │
│   Settlement watcher → settle() calls                            │
│   Oracle workers → Pyth / non-Pyth attestations                 │
│                                                                   │
│  Stylus destruction drill                                         │
│   proxy.upgradeTo(RevertingStylusEngine)                        │
│   settle() → catch → RepCalculatedFallback + Telegram           │
│   proxy.upgradeTo(realStylusEngine) → resume                    │
│                                                                   │
│  Evidence log: tx hash per SAFETY-29–43 + PITFALLS 38 items     │
│  Telegram alerts: settlement-stuck / paymaster / fallback       │
│                                                                   │
│  Manual UAT (5 deferred Phase-4 items via browser):             │
│   live settlement E2E / dispute flow / provenance modal          │
│   OG 200px readability / live OG render                          │
└─────────────────────────────────────────────────────────────────┘
         │ soak passes all success criteria
         ▼
┌─────────────────────────────────────────────────────────────────┐
│ WAVE 4: MULTISIG PROMOTION                                       │
│                                                                   │
│  Safe Sepolia:                                                    │
│   Deploy 2-of-3 Safe on Arbitrum Sepolia (3 signer addrs)       │
│   7× transferOwnership(safeAddress) on CR/FFM/CE/SM/PR + proxy │
│   7× Safe-multisig acceptOwnership execution                    │
│   cast call owner() == safeAddress on all 7 surfaces           │
│   Prove: Safe-executed pause() + proxy.upgradeTo()             │
│                                                                   │
│  Pre-deploy rituals (all pass on Sepolia cluster):              │
│   grep -r "arbitrum-sepolia" dist/ = 0                           │
│   grep hardcoded chainId in relayer EIP-712 domain = 42161      │
│   relayer ETH balance ≥ 0.5 ETH                                  │
│   Pyth bytes32 CI vs Hermes API                                  │
│                                                                   │
│  Safe Arbitrum One (production):                                 │
│   Deploy 2-of-3 Safe on Arbitrum One (same signer addrs)        │
│   Ownership transfer → Phase 7 runbook ready                    │
└─────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure (new files this phase)

```
packages/contracts/
├── src/constants/
│   └── USDC.sol                      # EXTEND: add USDC_ARB_SEPOLIA + resolveUsdc()
├── script/
│   ├── DeployPhase6.s.sol            # NEW: clone of DeployPhase5_1 + resolveUsdc() + USDC_ARB_SEPOLIA
│   └── TransferOwnershipToSafe.s.sol # NEW: 7× transferOwnership calls (takes Safe address as arg)
├── test/
│   ├── SettlementManagerForkTest.sol # EXTEND: full create→follow→settle→exit→dispute loop
│   ├── TvlAggregation.t.sol          # EXTEND: ChallengeEscrow included in TVL boundary
│   ├── CallRegistrySafety.t.sol      # EXTEND: owner-only guards, SAFETY-43
│   ├── SettlementSafetyMatrix.t.sol  # NEW: idempotency / decay / UTC dup / slippage / self-challenge
│   └── RevertingStylusEngineDrill.t.sol # NEW: SAFETY-42 unit drill (extends fork setup)
apps/
├── relayer/src/scripts/
│   └── soak-seeder.ts                # NEW: seeding bot, multi-wallet, Circle faucet rate-limit aware
└── scripts/
    ├── deploy-safe.ts                # NEW: Safe protocol-kit v7 deploy script
    └── rehearse-ownership.ts         # NEW: Ownable2Step transfer + accept via Safe
.github/workflows/
└── grep-guards.yml                   # EXTEND: usdc-paste guard → 2-address allowlist
evidence/
└── phase-6-soak/                     # NEW: tx hash log per SAFETY-21–43 + PITFALLS-38
```

---

## Pattern 1: resolveUsdc() Chainid Gate

**What:** `USDC.sol` extended with a `resolveUsdc()` function that returns the correct USDC address based on `block.chainid`. Each money contract constructor calls `require(_usdc == resolveUsdc())`.

**When to use:** Everywhere USDC address is needed in constructor arguments.

**Example:**

```solidity
// packages/contracts/src/constants/USDC.sol
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;

// Source: ADR-0001, D-01 — chainid-gated USDC selection
// SAFETY-13: mainnet invariant preserved — chainid 42161 still returns canonical only

/// @notice Native USDC on Arbitrum One (mainnet). Chain ID 42161.
address constant USDC_ARB_NATIVE = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;

/// @notice Official Circle USDC on Arbitrum Sepolia (testnet). Chain ID 421614.
/// @dev 6 decimals — same parity as mainnet. Faucetable via faucet.circle.com.
///      Source: cast code 0x75faf114... → verified bytecode, symbol()="USDC", decimals()=6
address constant USDC_ARB_SEPOLIA = 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d;

/// @notice Returns the canonical USDC address for the current chain.
/// @dev SAFETY-13 invariant preserved: on mainnet (42161) only the native Circle
///      USDC address passes. On Sepolia (421614) only Circle's official testnet USDC.
///      Reverts on any other chain — prevents accidental deploy to wrong network.
function resolveUsdc() view returns (address) {
    if (block.chainid == 42161)  return USDC_ARB_NATIVE;
    if (block.chainid == 421614) return USDC_ARB_SEPOLIA;
    revert("USDC: unsupported chain");
}
```

**Constructor pattern (each money contract):**

```solidity
// Before (Phase 5.1):
constructor(..., address _usdc, ...) {
    require(_usdc == USDC_ARB_NATIVE, "wrong USDC");
    ...
}

// After (Phase 6):
constructor(..., address _usdc, ...) {
    require(_usdc == resolveUsdc(), "wrong USDC");  // chainid-gated
    ...
}
```

**Deploy script change:**

```solidity
// DeployPhase6.s.sol — constructors receive resolveUsdc() result
// On Sepolia broadcast: resolveUsdc() == USDC_ARB_SEPOLIA (Circle testnet)
// On mainnet broadcast: resolveUsdc() == USDC_ARB_NATIVE (canonical)
ChallengeEscrow ce = new ChallengeEscrow(
    address(cr), address(ffm),
    resolveUsdc(),   // <-- was USDC_ARB_NATIVE
    treasuryAddress, TVL_CAP
);
```

[VERIFIED: USDC.sol file read; ADR-0001 read; Circle Sepolia USDC address 0x75faf114... verified in ADR-0001 via `cast code` probe]

---

## Pattern 2: CI Grep Guard — 2-Address Allowlist

**What:** The existing usdc-paste grep guard in `.github/workflows/grep-guards.yml` currently fails if any USDC address other than the one mainnet literal appears. Phase 6 expands the allowlist to exactly two literals.

**Example (`grep-guards.yml` change):**

```yaml
# Before:
- name: usdc-paste guard
  run: |
    ! grep -rEi "0xff970a61" --include="*.sol" --include="*.ts" --include="*.js" .

# After (D-01: 2-address allowlist — neither is USDC.e):
- name: usdc-paste guard (2-address allowlist)
  run: |
    # Forbid USDC.e (bridged) absolutely
    ! grep -rEi "0xff970a61" --include="*.sol" --include="*.ts" --include="*.js" \
      --exclude-dir=node_modules --exclude-dir=out .
    # Forbid any USDC address that is NOT in the allowlist {mainnet, Circle Sepolia}
    # Grep for USDC-like addresses (42-char 0x hex) and assert they are only the two allowed
    USDC_MAINNET="0xaf88d065e77c8cc2239327c5edb3a432268e5831"
    USDC_SEPOLIA="0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d"
    FOUND=$(grep -rEio "0x[a-f0-9]{40}" --include="*.sol" --include="*.ts" --include="*.js" \
      --exclude-dir=node_modules --exclude-dir=out . \
      | grep -iv "$USDC_MAINNET" | grep -iv "$USDC_SEPOLIA" \
      | grep -i "usdc\|75faf\|af88d0" || true)
    if [ -n "$FOUND" ]; then echo "USDC address outside allowlist: $FOUND"; exit 1; fi
```

**Note:** The exact grep logic should be adjusted at implementation time. The intent is: any address that looks like USDC but is neither of the two allowlisted literals fails the build. USDC.e is always forbidden. [ASSUMED — CI grep implementation is project-specific; the above is a pattern, not final code]

---

## Pattern 3: Mainnet-Fork Money-Path Suite Extension

**What:** Extend `SettlementManagerForkTest.sol` to cover the full flow including Pyth VAA injection, follow/fade, duel, exit, and dispute. Uses `vm.deal` + USDC whale impersonation for funding.

**Pyth VAA in fork test:**

```solidity
// Option A: vm.mockCall to bypass Pyth staleness in CI (no external dependency)
// Use when ARB_ONE_RPC_URL is not set or Hermes is unavailable
vm.mockCall(
    PYTH_ARBITRUM_ONE,
    abi.encodeWithSelector(IPyth.getPriceNoOlderThan.selector, feedId, 60),
    abi.encode(PythStructs.Price({price: 3000e6, conf: 100, expo: -6, publishTime: block.timestamp}))
);

// Option B: Real Hermes VAA fetched off-chain, passed as bytes[] in fork test env var
// Use in integration CI where HERMES_VAA_ETH_USD is set from a pre-run script
bytes[] memory updateData = new bytes[](1);
updateData[0] = vm.envBytes("HERMES_VAA_ETH_USD");  // pre-fetched hex
uint256 fee = IPyth(PYTH_ARBITRUM_ONE).getUpdateFee(updateData);
vm.deal(address(sm), fee);
sm.settle{value: fee}(callId, updateData, new uint256[](0));
```

**Note on current `SettlementManagerForkTest.sol`:** The existing file correctly scaffolds the fork setup (whale impersonation, deal USDC, setUp) but `settle()` uses a `try/catch` that gracefully handles `StalePrice`. Phase 6 should add test cases that mock Pyth to return a valid price so settle completes deterministically. The existing approach is correct for the money-path-only validation but needs augmentation for the full invariant suite. [VERIFIED: SettlementManagerForkTest.sol read; existing pattern confirmed]

---

## Pattern 4: Safe 2-of-3 Deploy + Ownable2Step Rehearsal

**What:** Deploy a Safe with 3 signers, threshold=2, on Arbitrum Sepolia. Then run all 7 `transferOwnership` + `acceptOwnership` calls.

**Safe deploy (TypeScript via @safe-global/protocol-kit v7):**

```typescript
// apps/scripts/deploy-safe.ts
import Safe, { SafeAccountConfig } from '@safe-global/protocol-kit'

const safeAccountConfig: SafeAccountConfig = {
  owners: [
    process.env.SIGNER_1!,   // hardware wallet address
    process.env.SIGNER_2!,   // backup key 1
    process.env.SIGNER_3!,   // backup key 2
  ],
  threshold: 2,
}

const protocolKit = await Safe.init({
  provider: process.env.ARBITRUM_SEPOLIA_RPC_URL!,
  signer: process.env.DEPLOYER_PRIVATE_KEY!,
  predictedSafe: { safeAccountConfig },
})

const safeAddress = await protocolKit.getAddress()
const deploymentTx = await protocolKit.createSafeDeploymentTransaction()
// ... send deploymentTx, wait for receipt, log safeAddress
```

[CITED: docs.safe.global/sdk/protocol-kit — v7 Safe.init + createSafeDeploymentTransaction pattern]

**Ownable2Step transfer via Foundry script:**

```solidity
// packages/contracts/script/TransferOwnershipToSafe.s.sol
contract TransferOwnershipToSafe is Script {
    // Takes SAFE_ADDRESS from env — works for both Sepolia rehearsal and mainnet (Phase 7)
    function run() external {
        address safe = vm.envAddress("SAFE_ADDRESS");
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        // 6 contracts (Ownable2Step.transferOwnership):
        CallRegistry(CR).transferOwnership(safe);
        FollowFadeMarket(FFM).transferOwnership(safe);
        ChallengeEscrow(CE).transferOwnership(safe);
        SettlementManager(SM).transferOwnership(safe);
        ProfileRegistry(PR).transferOwnership(safe);

        // StylusScoreEngine TransparentUpgradeableProxy admin:
        // ProxyAdmin(PROXY_ADMIN).transferOwnership(safe);
        // NOTE: For Stylus proxy, the proxy admin ownership transfer may differ
        // depending on whether ERC1967Proxy or TransparentUpgradeableProxy is in use.
        // Research the exact pattern based on the deployed proxy type before implementing.

        vm.stopBroadcast();

        // Post-transfer: pendingOwner() == safe on each contract
        require(CallRegistry(CR).pendingOwner() == safe, "CR pendingOwner mismatch");
        require(FollowFadeMarket(FFM).pendingOwner() == safe, "FFM pendingOwner mismatch");
        // ... (all 6)
    }
}
```

**Ownable2Step acceptOwnership (Safe multisig execution):**

The Safe must execute `acceptOwnership()` on each contract. Pattern:

```typescript
// apps/scripts/rehearse-ownership.ts
// For each contract address:
// 1. Encode acceptOwnership() calldata
// 2. Create Safe transaction: {to: contractAddr, data: encodedAcceptOwnership}
// 3. Sign with signer 1 + signer 2 (2-of-3 threshold)
// 4. Execute via protocol-kit
const acceptOwnershipData = encodeFunctionData({
  abi: OWNABLE2STEP_ABI,
  functionName: 'acceptOwnership',
})
// Create Safe tx batch (all 6 contracts in one Safe batch tx)
const safeTransactionData = contracts.map(addr => ({
  to: addr,
  value: '0',
  data: acceptOwnershipData,
}))
```

**Critical Ownable2Step nuance:** `transferOwnership` sets `pendingOwner` (not `owner` yet). `owner()` only changes AFTER the new owner calls `acceptOwnership()`. This means:

1. After `transferOwnership(safeAddress)`: `owner()` still = deployer, `pendingOwner()` = safeAddress
2. After Safe executes `acceptOwnership()`: `owner()` = safeAddress, `pendingOwner()` = zero address
3. Verification: `cast call <contract> "owner()(address)"` must return safeAddress

[VERIFIED: Ownable2Step is already inherited by all contracts per CONTEXT.md code_context section]

---

## Pattern 5: Stylus Destruction Drill

**What:** On the redeployed Sepolia cluster, call `proxy.upgradeTo(RevertingStylusEngine)`, settle a live call, verify the catch branch fires end-to-end, then restore the real engine.

**Drill sequence (Sepolia live):**

```bash
# Step 1: Deploy RevertingStylusEngine (already in repo at packages/contracts/src/RevertingStylusEngine.sol)
forge create packages/contracts/src/RevertingStylusEngine.sol:RevertingStylusEngine \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY

# Step 2: Upgrade proxy to RevertingStylusEngine via ProxyAdmin
# OZ 5.6.1 ONLY exposes upgradeAndCall(address,address,bytes) — 3 arguments.
# The 2-arg upgrade(address,address) was REMOVED in OZ 5.0 and is absent from this codebase.
# Use 0x as the empty bytes data argument (no init call needed).
cast send $PROXY_ADMIN_ADDR "upgradeAndCall(address,address,bytes)" \
  $STYLUS_PROXY_ADDR $REVERTING_ENGINE_ADDR 0x \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL

# Step 3: Settle a seeded call (relayer does this, or cast directly)
cast send $SM_ADDR "settle(uint256,bytes[],uint256[])" $CALL_ID "[]" "[]" \
  --private-key $RELAYER_KEY \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL

# Step 4: Assert RepCalculatedFallback event fired
cast logs --from-block latest --address $SM_ADDR \
  "RepCalculatedFallback(uint256,address,int32,bytes)" \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL

# Step 5: Check ProfileRegistry globalRep updated (baseline, not Stylus value)
cast call $PR_ADDR "getProfile(address)" $CALLER_ADDR \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL

# Step 6: Restore real Stylus engine (same 3-arg OZ 5.x form required)
cast send $PROXY_ADMIN_ADDR "upgradeAndCall(address,address,bytes)" \
  $STYLUS_PROXY_ADDR $REAL_STYLUS_ENGINE_ADDR 0x \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
```

**Assertions (all 5 must pass per Pitfall 2 / SAFETY-42):**
1. Tx succeeds (does not revert — the try/catch absorbs the revert)
2. `RepCalculatedFallback(callId, user, baselineDelta, lowLevelError)` event present with non-empty error bytes
3. `ProfileRegistry.getProfile(caller).globalRep` advanced by the Solidity baseline delta (not zero, not Stylus value)
4. Fees paid into FollowFadeMarket and treasury per step 11 of settle()
5. `Call.status == Settled` and `activeDuplicateHashes[hash] == 0` (step 12 cleared)

[VERIFIED: RevertingStylusEngine.sol exists; its `compute_rep_change` reverts intentionally; verified its import structure and IStylusScoreEngine interface. SAFETY-42 drill is mechanical — no new contract code needed]

---

## Pattern 6: TVL Aggregation Extension (SAFETY-31)

**What:** The existing `TvlAggregation.t.sol` tests TVL boundary across CR + FFM. Phase 6 must extend it to include ChallengeEscrow USDC balance in the aggregate.

**Key extension needed:**

```solidity
// Test that $5,001 with USDC split across CR+FFM+CE reverts TvlCapReached
function test_tvlBoundary_includesChallengeEscrow() public {
    // Seed call + follow to $4,800 across CR+FFM
    // Add $200 in ChallengeEscrow (propose + accept challenge)
    // Total = $5,000 — at cap
    // Next $1 follow must revert TvlCapReached
    ...
    vm.expectRevert(); // TvlCapReached
    ffm.follow(callId, 1e6, 0);
}
```

[VERIFIED: TvlAggregation.t.sol exists; confirmed it uses FfmTestHelper; confirmed ChallengeEscrow is NOT included in current TVL boundary test (only CR + FFM). PITFALL-3 explicitly flags this gap]

---

## Pattern 7: Seeding Bot Design

**What:** A Node.js / TypeScript script that drives the 48h soak counts. Must handle Circle faucet rate limits: 20 USDC per wallet per 2 hours.

**Rate limit math:**

- Circle Sepolia faucet: 20 USDC per wallet per 2 hours [VERIFIED: faucet.circle.com rate limit confirmation]
- Soak needs: ≥10 calls × $5 min stake = $50 minimum, plus follow/fade positions ($30 min at $1 each), plus challenge escrow ($10 min), plus creation fees ($10 × $10 = $100)
- Total USDC needed: ~$300–500 across all test wallets for a full 48h soak with headroom
- With 10 wallets: 10 × 20 = 200 USDC per 2h cycle — sufficient if pre-funded before soak start
- **Recommendation:** Pre-fund 10–15 wallets via Circle faucet during the day before soak starts (accumulate balance). Do not rely on just-in-time faucet requests during soak.

**Bot architecture:**

```typescript
// apps/relayer/src/scripts/soak-seeder.ts
// Phases:
// 1. Pre-flight: verify all test wallets have ≥$30 USDC each
// 2. Seed calls: createCall() for each type (PriceTarget, Spread, Event × 3 subtypes)
// 3. Seed positions: follow/fade with 15+ different wallets
// 4. Trigger exits: callerExit on 1 call after 24h lock
// 5. Trigger challenge: proposeChallenge + acceptChallenge on 1 call
// 6. Trigger dispute: raiseDispute on 1 settled call + owner resolveDispute
// 7. Trigger Pyth confidence delay: simulate by using a near-expiry call during
//    a window when Pyth confidence is historically wide (or mock at Anvil level)
// Evidence emitter: write JSON evidence log {action, txHash, timestamp, callId}
```

**BullMQ integration for rate-limiting:**

```typescript
// Each faucet request goes through a BullMQ queue with:
// - concurrency: 1 (avoid parallel faucet calls from same IP)
// - rateLimit: { max: 1, duration: 7200000 } // 1 per wallet per 2h
```

---

## Pattern 8: Pre-Deploy Rituals

**Env diff ritual:**

```bash
# Required: verify no Sepolia strings in prod bundle
grep -r "arbitrum-sepolia\|421614\|SEPOLIA" apps/web/.next/static/ | grep -v "test\|spec"
# Must return 0 results

# Check hardcoded chainId in relayer EIP-712 domain
grep -r "chainId" apps/relayer/src/ | grep "421614"
# Must return 0 results (mainnet uses 42161)

# Relayer ETH balance check
cast balance $RELAYER_WALLET_ADDR --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --ether
# Must be ≥ 0.5 ETH
```

**Pyth bytes32 CI verification:**

```bash
# Verify each feed ID in addresses.ts matches Hermes API (no stale/renamed feeds)
# MATIC→POL, RNDR→RENDER, MKR→SKY renames already caught in Phase 1 — re-verify
curl -s "https://hermes.pyth.network/v2/price_feeds?query=BTC&asset_type=crypto" \
  | jq '.[0].id'
# Compare against CLAUDE.md "Pyth Feed Catalogue" entry
```

[VERIFIED: Hermes API endpoint from CLAUDE.md; feed IDs verified in CLAUDE.md Pyth Feed Catalogue. Authentication optional through July 31, 2026 per Hermes docs]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Safe multisig deployment | Custom multisig contract | @safe-global/protocol-kit v7 | Battle-tested; $100B+ TVL secured; Arbitrum Sepolia + One both supported |
| Safe transaction signing | Custom ECDSA orchestration | protocol-kit + api-kit | Handles nonce, signature ordering, threshold enforcement |
| Pyth price update fetching | Custom Hermes HTTP client | @pythnetwork/hermes-client 3.1.0 | Official SDK with correct VAA binary format for updatePriceFeeds |
| Ownable2Step 2-step ownership | Custom admin transfer pattern | OpenZeppelin Ownable2Step (already inherited) | Already in all contracts; prevents zero-address mistakes |
| TVL aggregation across contracts | Custom cross-contract accounting | Read balances from USDC.balanceOf() per contract | Simplest correct implementation; canonical getTvl() is the pattern |

---

## Don't Hand-Roll (Security)

Never build custom implementations for:
- Proxy admin key management — use the Safe's `upgrade` function through multisig
- ECDSA signature verification for oracle attestations — use OpenZeppelin ECDSA
- USDC transfer paths — use SafeERC20 (already in all contracts)

---

## Common Pitfalls

### Pitfall A: Ownable2Step two-step confusion — declaring success after transferOwnership only

**What goes wrong:** `transferOwnership(safeAddress)` succeeds and `pendingOwner()` returns the Safe. The script marks "ownership transferred." But `owner()` still returns the deployer. Any onlyOwner call by the Safe fails until `acceptOwnership()` is executed.

**Why it happens:** `Ownable2Step` intentionally uses a two-step process. Step 1 (`transferOwnership`) sets the pending owner. Step 2 (`acceptOwnership`, called BY the new owner) finalizes the transfer. Verification must check `owner()` not `pendingOwner()`.

**How to avoid:** After the Safe executes `acceptOwnership()` via multisig, run `cast call <contract> "owner()(address)"` and assert it equals the Safe address. `pendingOwner()` should return `address(0)`.

**Warning signs:** `cast call <contract> "owner()(address)"` returns the deployer address after you believe transfer is complete.

[VERIFIED: Ownable2Step is in all contracts per CONTEXT.md code_context. Two-step pattern is OpenZeppelin standard]

---

### Pitfall B: Proxy admin vs owner — distinct roles on the StylusScoreEngine proxy

**What goes wrong:** The Stylus proxy has TWO separate authority roles: (1) the **proxy admin** (controls `upgradeTo`/`upgradeToAndCall` — the only upgradable surface), and (2) the **owner** of the implementation contract (controls `pause`, `setScoreParams`, etc.). Transferring `owner()` of the implementation to the Safe does NOT transfer the proxy admin role.

**Why it happens:** `TransparentUpgradeableProxy` uses a separate ProxyAdmin contract or maps admin to a specific address in the ERC-1967 admin slot. This is distinct from the business logic `Ownable` inheritance.

**How to avoid:** Identify the exact proxy type deployed in Phase 5:

```bash
cast storage $STYLUS_PROXY_ADDR \
  0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103 \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
# This is the EIP-1967 admin slot — returns the ProxyAdmin address (or EOA if no ProxyAdmin contract)
```

Then transfer the ProxyAdmin ownership to the Safe separately. The destruction drill (proxy.upgradeTo) must go through the ProxyAdmin, not a direct call.

**Warning signs:** `proxy.upgradeTo()` from the Safe reverts with "not admin."

[VERIFIED: CONTEXT.md mentions `TransparentUpgradeableProxy` + StylusScoreEngine proxy at 0xe7e15980...; proxy admin slot is standard EIP-1967]

---

### Pitfall C: Circle faucet pre-funding vs just-in-time

**What goes wrong:** Seeding bot requests USDC from Circle faucet just-in-time during the soak run. With 10 wallets × 20 USDC per 2h = 200 USDC available per 2h cycle, a burst of soak actions drains all wallets simultaneously, creating a 2h wait.

**How to avoid:** Pre-fund all test wallets 24h before soak start. Each wallet should hold ≥50 USDC before the soak begins. The faucet can then top up throughout the 48h window as a background process.

[VERIFIED: Circle faucet rate limit 20 USDC/wallet/2h confirmed via faucet.circle.com]

---

### Pitfall D: Pyth confidence interval simulation for SAFETY-28

**What goes wrong:** The requirement to exercise the Pyth confidence retry (`SettlementDelayed` + 30×60s) is hard to trigger on Sepolia naturally — Pyth's confidence intervals for BTC/ETH are almost always tight.

**How to avoid:** Use the `forceSettle`-adjacent approach: create a call for a less-liquid asset in the allowlist (ezETH or RDNT tend to have wider confidence intervals). Alternatively, use `vm.mockCall` in a fork test to simulate a `StalePrice` or wide confidence return. For the Sepolia live evidence requirement, document that `SettlementDelayed` was triggered on a specific call and show the tx hash.

**Alternative:** The seeding bot can call `settle()` on a just-expired call before the relayer's Pyth update VAA is pushed, triggering `StalePrice` (which the relayer's retry loop will catch). This is the natural production scenario.

[ASSUMED — Pyth Sepolia confidence interval behavior is inferred from production patterns; not directly verified this session]

---

### Pitfall E: Sepolia Pyth contract address differs from mainnet

**What goes wrong:** `DeployPhase6.s.sol` inherits the pattern from `DeployPhase5_1.s.sol`, which already uses the correct Sepolia Pyth address. But any new test that hardcodes `PYTH_ARBITRUM_ONE` from the fork test file will fail on Sepolia (wrong address).

**Correct addresses:**
- Arbitrum One mainnet: `0xff1a0f4744e8582DF1aE09D5611b887B6a12925C` [CITED: CLAUDE.md]
- Arbitrum Sepolia: `0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DAF` [VERIFIED: DeployPhase5_1.s.sol constant `PYTH_ARBITRUM_SEPOLIA`]

**How to avoid:** Reuse `DeployPhase5_1.s.sol`'s `PYTH_ARBITRUM_SEPOLIA` constant in `DeployPhase6.s.sol`. Never inline Pyth addresses.

---

### Pitfall F: Immutable-ref cluster coupling — partial redeploy orphans FFM and CE

**What goes wrong (Phase 05.1 lesson):** Redeploying only `CallRegistry` leaves `FollowFadeMarket` and `ChallengeEscrow` orphaned because their `callRegistry` immutable references point to the OLD CR address. Also, `ChallengeEscrow.followFadeMarket` is immutable — if FFM is redeployed without CE, CE is also orphaned.

**Mandatory redeploy set for Phase 6 (USDC change touches all constructors):**
- MUST redeploy: `CallRegistry`, `FollowFadeMarket`, `ChallengeEscrow`, `SettlementManager`
- ProfileRegistry: redeploy only if its constructor changes (it holds `USDC_ARB_NATIVE` only if constructor takes it — verify the constructor signature)
- StylusScoreEngine proxy: NOT redeployed (proxy admin rotation is separate from USDC change)

**How to avoid:** Follow `DeployPhase5_1.s.sol`'s consistency-assertion pattern. Add the `resolveUsdc()` call to ALL 4 money contract constructors. Run all assertions after deploy.

[VERIFIED: DeployPhase5_1.s.sol read; immutable coupling confirmed; first deploy superseded event documented in 05.1-OPERATOR-HANDOFF.md]

---

### Pitfall G: CI grep guard weakened — 2-address allowlist must still forbid arbitrary addresses

**What goes wrong:** The allowlist expansion makes it easy to accidentally allow a third USDC address (e.g., a mock USDC in a test file that happens to match a pattern). The guard should only allow the two canonical addresses — not "any hex address that looks like USDC."

**How to avoid:** The guard should positive-check that any address matching `USDC|usdc` context appears only as one of the two known addresses. The current single-literal grep guards against USDC.e by address; keep that. The new guard adds Circle Sepolia to the allowlist by checking that it too is the known constant.

---

## Runtime State Inventory

This phase involves a **full Sepolia cluster redeploy** — the USDC change makes all current Sepolia contract addresses invalid.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Sepolia test calls/positions/profiles on-chain at current cluster addresses (CR v3: `0x9E3E4...`, FFM v3: `0x5Aa7b...`, CE v2: `0xf0D65...`, SM: `0x765f6...`) | Code edit — new DeployPhase6.s.sol; old Sepolia data is test data, can be abandoned |
| Live service config | addresses.ts (4 contract addrs), subgraph.yaml (4 datasources + startBlocks), relayer env (SM addr, CR addr, KMS grants), Subgraph Studio query URL | Code edit + re-deploy subgraph + restart relayer with new addresses |
| OS-registered state | GCP KMS IAM bindings: relayer service account needs `roles/cloudkms.signerVerifier` re-granted on same keys but for new SM address (only if SM address changes which key grants are needed) | `gcloud kms keys add-iam-policy-binding` for new SM (Step 3 in 05.1-OPERATOR-HANDOFF.md) |
| Secrets/env vars | Fly secrets: `SETTLEMENT_MANAGER_ADDRESS`, `CALL_REGISTRY_ADDRESS` | Update Fly secrets to new addresses after redeploy |
| Build artifacts | No stale egg-info or built artifacts for Solidity contracts — Foundry compiles fresh each run | None |

**Nothing found in category:** Build artifacts — none; OS task scheduler — none; SOPS keys — KMS key names do not change (only the contracts referencing signers change).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Foundry (forge) 1.7.1 |
| Config file | `packages/contracts/foundry.toml` |
| Quick run command | `forge test --match-contract Safety --no-match-contract Fork -C packages/contracts` |
| Full suite command | `ARB_ONE_RPC_URL=<url> forge test -C packages/contracts --profile ci` |
| Fork suite command | `ARB_ONE_RPC_URL=<url> forge test --match-contract ForkTest -C packages/contracts` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SAFETY-02 | TVL cap $5,000 aggregated across CR+FFM+CE | unit | `forge test --match-test test_tvlBoundary -C packages/contracts` | ✅ TvlAggregation.t.sol (partial — needs CE extension) |
| SAFETY-03 | setTvlCap owner-only, MAX_ALLOWED_CAP enforced | unit | `forge test --match-test test_setTvlCap -C packages/contracts` | ✅ CallRegistrySafety.t.sol |
| SAFETY-19 | StylusScoreEngine upgradable via pause→upgrade→unpause | live Sepolia | Cast commands + destruction drill script | ✅ RevertingStylusEngine.sol (fixture exists) |
| SAFETY-20 | Proxy admin rotates to multisig before TVL > $5K | live Sepolia | `cast call <proxy> "admin()"` == safeAddress | ❌ Wave 0: need TransferOwnershipToSafe.s.sol |
| SAFETY-21 | Sepolia ≥48h staging gate | live Sepolia | Evidence log timestamp delta ≥ 172800s | ❌ Wave 0: need soak-seeder.ts + evidence log |
| SAFETY-22 | ≥10 seeded calls covering each type | live Sepolia | `grep "callCreated" evidence/*.json | wc -l` ≥ 10 | ❌ Wave 0: need soak-seeder.ts |
| SAFETY-23 | ≥30 follow/fade positions | live Sepolia | `grep "followFade" evidence/*.json | wc -l` ≥ 30 | ❌ Wave 0: need soak-seeder.ts |
| SAFETY-24 | ≥3 settles per type + outcome words + rep | live Sepolia | Evidence log settle entries per type | ❌ Wave 0: need soak-seeder.ts |
| SAFETY-25 | ≥1 caller-exit triggered | live Sepolia | Evidence log callerExit entry | ❌ Wave 0: need soak-seeder.ts |
| SAFETY-26 | ≥1 challenge cycle settled | live Sepolia | Evidence log challengeSettled entry | ❌ Wave 0: need soak-seeder.ts |
| SAFETY-27 | ≥1 dispute resolved via owner | live Sepolia | Evidence log disputeResolved entry | ❌ Wave 0: need soak-seeder.ts |
| SAFETY-28 | Pyth confidence retry + SettlementDelayed verified | live Sepolia | Cast logs SettlementDelayed + retry evidence | ❌ Wave 0: seeder or manual |
| SAFETY-29 | All Phase 6 safety tests pass | unit + live | `forge test -C packages/contracts --profile ci` green | ✅ (partial — extensions needed) |
| SAFETY-30 | Pause blocks every state-changing function | unit | `forge test --match-test test_pause_blocks -C packages/contracts` | ✅ CallRegistrySafety.t.sol (CR only — needs FFM/CE/SM extension) |
| SAFETY-31 | TVL cap $4,999 OK / $5,001 reverts (CE included) | unit | `forge test --match-contract TvlAggregation -C packages/contracts` | ✅ (partial — needs CE in aggregate) |
| SAFETY-32 | Max stake $100 OK / $101 reverts | unit | `forge test --match-test test_maxStake -C packages/contracts` | ✅ CallRegistryGates.t.sol |
| SAFETY-33 | Min position $1 OK / $0.99 reverts | unit | `forge test --match-test test_minPosition -C packages/contracts` | ✅ FollowFadeMarketGates.t.sol |
| SAFETY-34 | Withdraw/claim work while paused | unit | `forge test --match-test test_withdraw_while_paused -C packages/contracts` | ❌ Wave 0: need SettlementSafetyMatrix.t.sol |
| SAFETY-35 | Caller-exit 24h lock + decay curve | unit | `forge test --match-test test_callerExit -C packages/contracts` | ✅ FollowFadeMarket.t.sol |
| SAFETY-36 | 4h cooldown + 10% slash | unit | `forge test --match-test test_positionExit -C packages/contracts` | ✅ FollowFadeMarket.t.sol |
| SAFETY-37 | Duplicate-hash UTC-day boundary | unit | `forge test --match-test test_duplicateHash_utcBoundary -C packages/contracts` | ❌ Wave 0: need SettlementSafetyMatrix.t.sol |
| SAFETY-38 | Slippage minSharesOut reverts | unit | `forge test --match-test test_slippage -C packages/contracts` | ✅ FollowFadeMarketGates.t.sol |
| SAFETY-39 | Settlement idempotency | unit | `forge test --match-test test_settleIdempotent -C packages/contracts` | ❌ Wave 0: need SettlementSafetyMatrix.t.sol |
| SAFETY-40 | Self-challenge gate | unit | `forge test --match-test test_selfChallenge -C packages/contracts` | ✅ ChallengeEscrowGates.t.sol |
| SAFETY-41 | Reentrancy guard vs USDC mock callback | unit | `forge test --match-test test_reentrancy -C packages/contracts` | ✅ CallRegistrySafety.t.sol (MaliciousReentrantUSDC exists) |
| SAFETY-42 | Stylus destruction drill + RepCalculatedFallback | live Sepolia | Cast logs RepCalculatedFallback + tx hash evidence | ✅ RevertingStylusEngine.sol exists; drill is Sepolia live |
| SAFETY-43 | Owner-only guards — non-owner reverts | unit | `forge test --match-test test_nonOwner -C packages/contracts` | ✅ CallRegistrySafety.t.sol (partial) |

### Sampling Rate

- **Per task commit:** `forge test --match-contract Safety --no-match-contract Fork -C packages/contracts`
- **Per wave merge:** `ARB_ONE_RPC_URL=<url> forge test -C packages/contracts --profile ci`
- **Phase gate:** Full suite green + all evidence log entries present + Sepolia `cast call owner()` == safeAddress on all 7 surfaces

### Wave 0 Gaps

The following files must be created before implementation can complete the matrix:

- [ ] `packages/contracts/test/SettlementSafetyMatrix.t.sol` — covers SAFETY-34 (withdraw/claim while paused), SAFETY-37 (UTC dup edge), SAFETY-39 (settle idempotency), and any SAFETY-30 gaps for FFM/CE/SM pause behavior
- [ ] `packages/contracts/script/DeployPhase6.s.sol` — Phase 6 cluster redeploy with `resolveUsdc()` in all constructors; extends DeployPhase5_1.s.sol
- [ ] `packages/contracts/script/TransferOwnershipToSafe.s.sol` — 7× transferOwnership to Safe address
- [ ] `apps/relayer/src/scripts/soak-seeder.ts` — seeding bot with multi-wallet, Circle faucet rate limit awareness, evidence log
- [ ] `apps/scripts/deploy-safe.ts` — Safe protocol-kit v7 deploy + verify
- [ ] `apps/scripts/rehearse-ownership.ts` — Safe-executed acceptOwnership on all 7 surfaces
- [ ] `evidence/phase-6-soak/` — evidence log directory and schema

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (owner-only gates) | Ownable2Step; not standard web auth |
| V3 Session Management | no | Not applicable to this phase |
| V4 Access Control | yes (onlyOwner, proxy admin) | Ownable2Step; Safe multisig |
| V5 Input Validation | yes (resolveUsdc chainid, constructor requires) | require(_usdc == resolveUsdc()); revert on wrong chain |
| V6 Cryptography | yes (KMS signing, Safe ECDSA threshold) | KMS (GCP us-east1 HSM); Safe ECDSA threshold-2 |

### Security Review Checklist for USDC.sol Change (D-01 / ADR-0001)

Per CONTEXT.md Claude's Discretion: security review via `/gsd-secure-phase` + `/gsd-code-review` must confirm all 3 items before the redeploy is trusted:

1. **No code path lets a non-canonical USDC reach mainnet:** `resolveUsdc()` on chainid 42161 returns ONLY `USDC_ARB_NATIVE`. The function reverts on any chainid other than 42161 or 421614. Constructor `require(_usdc == resolveUsdc())` blocks any other address. CI grep guard allows only the two known addresses.

2. **Decimals parity:** Both `USDC_ARB_NATIVE` (mainnet) and `USDC_ARB_SEPOLIA` (Circle testnet) return `decimals() = 6`. [VERIFIED: ADR-0001 confirms this via `cast decimals`]

3. **Chainid gate cannot be bypassed:** `block.chainid` in Solidity reflects the network's actual chainId. On Arbitrum One this is always 42161. There is no msg.sender-accessible path to change chainid in EVM. The revert-on-other-chain path prevents accidental deployment to a non-supported network.

### Known Threat Patterns for This Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Single deployer key compromise pre-multisig | Elevation of Privilege | Pitfall 6 — hardware wallet for deployer from day 1; multisig promotion is this phase's deliverable |
| Proxy admin different from owner — partially transferred ownership | Elevation of Privilege | Verify EIP-1967 admin slot separately; TransferOwnershipToSafe.s.sol handles ProxyAdmin |
| Replay of Ownable2Step `acceptOwnership` from wrong Safe | Spoofing | Safe contract requires threshold signatures; acceptOwnership only callable by pendingOwner |
| USDC.sol resolveUsdc() returns wrong address on wrong-chainid deploy | Tampering | revert("USDC: unsupported chain") is the safeguard; post-deploy assert resolveUsdc() |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded single USDC literal in all constructors | resolveUsdc() chainid-gated function | Phase 6 (this phase) | Enables live Sepolia money flows without weakening mainnet guard |
| Deployer EOA owns all contracts | Safe 2-of-3 multisig owner | Phase 6 (this phase) | Eliminates single-key risk; required before v1.1 / TVL > $5K |
| Phase 5.1 cluster addresses (pre-USDC-change) | Phase 6 cluster addresses | Phase 6 (this phase) | All downstream systems (addresses.ts, subgraph, relayer) must re-point |
| Single-owner proxy admin | Safe-owned ProxyAdmin | Phase 6 (this phase) | Controls StylusScoreEngine upgrades; critical for SAFETY-19 |

**Current cluster (active Sepolia addresses as of 2026-06-02, to be superseded by Phase 6 redeploy):**

| Contract | Current Sepolia Address |
|----------|------------------------|
| CallRegistry v3 | `0x9E3E467e5D1F1266354444CEaC67651c7e9CACEc` |
| FollowFadeMarket v3 | `0x5Aa7bC9ee202AD9197CB109e7EcF3d7d99C72a48` |
| ChallengeEscrow v2 | `0xf0D65BFd5dFa4e40c81d198DD7ED78423a26Fdea` |
| SettlementManager | `0x765f6ecd85059CF8eF59286DF578AEC0B13230fC` |
| ProfileRegistry | `0xAfe239a3606b89Ef65DbBcDb1b87a920052c359E` (unchanged) |
| StylusScoreEngine proxy | `0xe7e15980C40db52BFC6dcaBb21B3d90edFB27c14` (unchanged) |

[VERIFIED: 05.1-OPERATOR-HANDOFF.md canonical addresses]

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Foundry (forge/cast) | All contract testing + deploy | ✓ | 1.7.1 | — |
| Node.js / npm | Seeding bot, Safe scripts | ✓ | [ASSUMED 22.x per CLAUDE.md] | — |
| Arbitrum Sepolia RPC | Redeploy + soak | ✓ (via Alchemy, in foundry.toml) | — | Public Sepolia RPC (rate-limited) |
| Arbitrum One RPC | Fork tests | ✓ (ARBITRUM_ONE_RPC_URL configured) | — | — |
| Circle Sepolia USDC faucet | Seeding bot USDC | ✓ (public, no auth) | — | Pre-fund wallets from another source |
| GCP KMS (us-east1 HSM) | Relayer oracle attestations | ✓ (provisioned in Phase 05.1) | — | — |
| Fly.io relayer | Non-Pyth oracle workers | ✓ (pending go-live per 05.1-OPERATOR-HANDOFF.md) | — | — |
| @safe-global/protocol-kit | Safe deploy | npm install needed | 7.2.0 | safe-cli (already at 1.4.10) |
| Pyth Hermes API | Fork test VAA + Pyth bytes32 CI | ✓ (public, no auth until 2026-07-31) | — | vm.mockCall for CI |

**Missing dependencies with no fallback:** None identified.

**Missing dependencies with fallback:** `@safe-global/protocol-kit` (npm install at execution time; safe-cli available as fallback for manual Safe operations).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Node.js 22.x LTS is available on the dev machine | Environment Availability | Script execution fails; install Node.js 22.x |
| A2 | ProfileRegistry constructor does NOT take a USDC address parameter | Pitfall F / redeploy set | ProfileRegistry may also need redeploying; verify constructor signature |
| A3 | The deployed StylusScoreEngine proxy uses `TransparentUpgradeableProxy` with a separate ProxyAdmin contract (vs UUPS or raw ERC1967) | Pattern 5 / Pitfall B | Proxy upgrade call syntax differs; verify EIP-1967 admin slot |
| A4 | Pyth Sepolia confidence intervals are normally tight for BTC/ETH (making SAFETY-28 hard to trigger naturally) | Pitfall D | Easy to trigger naturally; no workaround needed |
| A5 | CI grep guard implementation in `.github/workflows/grep-guards.yml` uses ripgrep-compatible syntax | Pattern 2 | CI guard fails silently or with wrong error; adjust syntax |
| A6 | The ForceSettle 7-day cooldown and proxy admin setup were correctly deployed in Phase 5.1 (assumed from operator verification notes) | Standard Stack | Wrong deployment would mean additional fix work before Phase 6 tests run |

---

## Open Questions

1. **ProfileRegistry constructor — does it accept USDC address?**
   - What we know: ProfileRegistry stores social links + rep data, not financial balances
   - What's unclear: Whether its constructor takes `_usdc` (unlikely based on purpose, but not verified this session)
   - Recommendation: `grep -n "USDC\|usdc" packages/contracts/src/ProfileRegistry.sol` before writing DeployPhase6.s.sol. If it doesn't reference USDC, it's NOT in the redeploy set.

2. **Exact proxy type for StylusScoreEngine — TransparentUpgradeableProxy vs UUPS?**
   - What we know: Phase 5 deployed the proxy at `0xe7e15980...`; CLAUDE.md notes OZ Stylus ships UUPS but spec says Transparent; the project may have used a Solidity TransparentUpgradeableProxy in front of the Stylus impl
   - What's unclear: Whether there is a separate ProxyAdmin contract, and what address it's at
   - Recommendation: `cast storage 0xe7e15980C40db52BFC6dcaBb21B3d90edFB27c14 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103 --rpc-url $ARBITRUM_SEPOLIA_RPC_URL` to read EIP-1967 admin slot before implementing TransferOwnershipToSafe.s.sol

3. **Relayer Sepolia ETH balance — is 0.5 ETH available?**
   - What we know: SM was funded with 0.05 ETH in Phase 5.1 for Pyth fees; relayer wallet is separate
   - What's unclear: Current relayer EOA ETH balance on Sepolia
   - Recommendation: `cast balance <DEPLOYER_ADDR> --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --ether` before soak start; top up from Alchemy/QuickNode Sepolia faucet if needed

---

## Sources

### Primary (HIGH confidence)
- `packages/contracts/src/constants/USDC.sol` — current USDC constant to extend [VERIFIED: file read]
- `packages/contracts/script/DeployPhase5_1.s.sol` — cluster redeploy pattern with consistency assertions [VERIFIED: file read in full]
- `packages/contracts/src/RevertingStylusEngine.sol` — drill fixture already built [VERIFIED: file read]
- `packages/contracts/test/SettlementManagerForkTest.sol` — fork harness scaffold [VERIFIED: file read]
- `packages/contracts/test/TvlAggregation.t.sol` — TVL boundary tests [VERIFIED: file read]
- `packages/contracts/test/CallRegistrySafety.t.sol` — safety matrix base [VERIFIED: file read]
- `packages/contracts/test/FollowFadeMarketInterference.t.sol` — multi-call interference [VERIFIED: file read]
- `.planning/phases/06-safety-review-sepolia-48h-multisig-promotion/06-CONTEXT.md` — locked decisions D-01..D-07 [VERIFIED: file read]
- `.planning/decisions/0001-sepolia-staging-usdc.md` — ADR-0001 "Safe design for (b)" [VERIFIED: file read]
- `.planning/research/PITFALLS.md` — 38-item "Looks Done But Isn't" checklist (Pitfalls 1–22) [VERIFIED: file read in full]
- `.planning/phases/05.1-non-pyth-oracle-rail-activation/05.1-OPERATOR-HANDOFF.md` — canonical deployed addresses + 5-step relayer go-live checklist [VERIFIED: file read]
- `.planning/phases/04-.../04-HUMAN-UAT.md` — 5 deferred live-UAT items [VERIFIED: file read]
- `packages/contracts/foundry.toml` — Foundry profile + fuzz config + RPC endpoints [VERIFIED: file read]
- `apps/relayer/src/workers/stylus-deactivation-watcher.ts` — Telegram alert pattern to reuse [VERIFIED: file read]
- `.planning/REQUIREMENTS.md` — SAFETY-02/03/19–43 definitions [VERIFIED: file read]
- CLAUDE.md — Pinned addresses (Pyth, USDC), stack versions, Pyth feed catalogue [VERIFIED: file read via system prompt]

### Secondary (MEDIUM confidence)
- `@safe-global/protocol-kit@7.2.0`, `@safe-global/api-kit@4.2.0`, `@safe-global/safe-contracts@1.4.1-2` — verified via `npm view` locally
- `safe-cli@1.4.10` — verified via local npm
- `forge 1.7.1` / `cast 1.7.1` — verified via local shell
- docs.safe.global/sdk/protocol-kit — Safe.init + createSafeDeploymentTransaction API [CITED: WebFetch]
- faucet.circle.com — 20 USDC per wallet per 2h rate limit [VERIFIED: WebFetch]
- docs.pyth.network/price-feeds/core/fetch-price-updates — Hermes VAA binary format; API key optional until 2026-07-31 [CITED: WebFetch]

### Tertiary (LOW confidence)
- Pyth Sepolia confidence interval behavior (Pitfall D) — inferred from production patterns [ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all key versions verified locally or cited from project CLAUDE.md
- Architecture: HIGH — based on thorough reading of all existing deploy scripts, test files, and ADR-0001
- Pitfalls: HIGH — drawn from the project's own PITFALLS.md (Phase 5.1 lesson verified), ADR-0001, and operator handoff notes
- Seeding bot design: MEDIUM — Circle faucet rate limits verified; bot architecture is ASSUMED design pattern
- Safe multisig: MEDIUM — protocol-kit v7 API cited from docs; exact Ownable2Step orchestration is ASSUMED pattern

**Research date:** 2026-06-03
**Valid until:** 2026-07-03 (30 days; Safe SDK, Pyth Hermes auth deadline are the moving parts)
