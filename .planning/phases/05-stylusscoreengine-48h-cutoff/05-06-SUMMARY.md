---
phase: 05-stylusscoreengine-48h-cutoff
plan: 06
subsystem: contracts
tags: [stylus, cargo-stylus, foundry, proxy, openzeppelin, arbitrum-sepolia, deploy, live]

# Dependency graph
requires:
  - phase: 05-stylusscoreengine-48h-cutoff
    provides: Stylus engine (05-02), Solidity engines (05-03), deploy scripts + addresses stubs (05-04)
  - phase: 04-settlementmanager
    provides: SettlementManager with setStylusScoreEngine + try/catch seam (deployed Sepolia 0xAc37a0e4...)

provides:
  - StylusScoreEngine WASM deployed + activated on Arbitrum Sepolia (0xdbe23df8ff832e09f2d8f52c3ec8a32b3d714755)
  - StylusScoreEngine TransparentUpgradeableProxy (0xe7e15980C40db52BFC6dcaBb21B3d90edFB27c14) wired into SettlementManager
  - Auto-created ProxyAdmin (0xAeA5a279DDF1625490c5F4284eF0D735BB56044a) owned by deployer
  - SolidityScoreEngine 48h-cutoff fallback (0xfD2E6270f915797B1524e13a88BC73960e1D04e5) + RevertingStylusEngine drill fixture (0x8492faD7eF45a213E498daaA88986f97Fb22b6e1)
  - Live proof that the Solidity-proxy -> Stylus-WASM delegatecall path works (compute_rep_change returns exact D-2 values on-chain)
  - addresses.ts + CutoffFallback.s.sol filled with real Sepolia addresses; relayer fly secret staged

affects: [phase-05-cutoff-rehearsal, phase-06-safety-drill, phase-07.5-mainnet]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stylus deploy on Windows: cargo stylus deploy --no-verify --wasm-file <prebuilt.wasm> (bypasses the cargo-run constructor-introspection that needs a bin target; --no-verify avoids the Docker reproducible build unsupported on Windows/non-WSL)"
    - "Stateless Stylus impl behind OZ 5.6 proxy: custom StatelessTransparentProxy overriding _unsafeAllowUninitialized()=true to permit empty init data"
    - "OZ 5.x proxy admin discovery: read the ERC-1967 admin slot (0xb531...6103) of the deployed proxy; the admin is auto-created from initialOwner"

key-files:
  created:
    - packages/contracts/src/StatelessTransparentProxy.sol
    - packages/contracts/stylus/rust-toolchain.toml
  modified:
    - packages/contracts/stylus/src/lib.rs
    - packages/contracts/script/DeployPhase5Stylus.s.sol
    - packages/contracts/script/CutoffFallback.s.sol
    - packages/shared/src/constants/addresses.ts

key-decisions:
  - "Deployer wallet had 0.0386 ETH; the plan's >=0.2 ETH was a conservative mainnet figure. Actual Sepolia deploy+activate cost < 0.001 ETH (wasm data fee 0.00009 ETH + ~2.83M gas @ 0.02 gwei). Funding was not a blocker."
  - "Deployed via --wasm-file because cargo stylus deploy's constructor introspection (cargo run) needs a bin target the cdylib+lib crate lacks; --wasm-file with no --constructor-signature deploys the prebuilt wasm with no constructor."
  - "Stateless engine deployed behind a custom StatelessTransparentProxy (empty init data) — OZ 5.6 ERC1967Proxy rejects empty data by default (ERC1967ProxyUninitialized)."

patterns-established:
  - "Live Stylus+Solidity-proxy deploy sequence on Windows/MSVC without WSL or Docker"

requirements-completed: [REP-19, REP-21]

# Metrics
duration: live-operator-session
completed: 2026-06-02
---

# Phase 05 Plan 06: Live Sepolia Deployment Summary

**The full Phase 5 stack is deployed, activated, and verified on Arbitrum Sepolia. The Solidity-proxy -> Stylus-WASM delegatecall path works on-chain — `compute_rep_change` returns exact D-2 values (7 / 68 / -36) through the proxy, so the production `RepCalculated` path is live (not the fallback).**

## Deployed Addresses (Arbitrum Sepolia, chainId 421614, 2026-06-02)

| Contract | Address | Notes |
|---|---|---|
| Stylus WASM impl | `0xdbe23df8ff832e09f2d8f52c3ec8a32b3d714755` | deployed + **activated** (10.8 KiB) |
| **StylusScoreEngine proxy** | `0xe7e15980C40db52BFC6dcaBb21B3d90edFB27c14` | SM points here |
| ProxyAdmin (auto-created) | `0xAeA5a279DDF1625490c5F4284eF0D735BB56044a` | owner = deployer |
| SolidityScoreEngine | `0xfD2E6270f915797B1524e13a88BC73960e1D04e5` | 48h-cutoff fallback |
| RevertingStylusEngine | `0x8492faD7eF45a213E498daaA88986f97Fb22b6e1` | Phase 6 SAFETY-42 fixture |
| SettlementManager (unchanged) | `0xAc37a0e4A3e575EF21684c28a5b820dB44654595` | Phase 4; not redeployed |
| Deployer / admin owner | `0xDa8c5726f596E8dae99e6dDEBa8AEa1c8bE9A4a5` | SM owner |

## On-Chain Verification (all GREEN)

- `compute_rep_change(100,50,0,true,10)` via proxy = **7** (Rust contrarian) ✅
- `compute_rep_change(100,90,80,true,10)` via proxy = **68** (D-2 bold-correct) ✅
- `compute_rep_change(100,90,50,false,10)` on impl = **-36** (D-2 wrong, hi-conv) ✅
- `SM.stylusScoreEngine()` == proxy ✅
- `ProxyAdmin.owner()` == deployer ✅
- proxy ERC-1967 impl slot == Stylus impl ✅
- `cast sig "compute_rep_change(uint128,uint8,uint8,bool,uint256)"` == `0xff540eb6` (D-1 selector) ✅
- RevertingStylusEngine reverts ("RevertingStylusEngine: intentional revert...") ✅

## Accomplishments

1. **Deployed + activated the Stylus WASM** on Arbitrum Sepolia (`cargo stylus deploy --no-verify --wasm-file ... --max-fee-per-gas-gwei 1`). `cargo stylus check` passed first (10.8 KiB, under the 24KB limit).
2. **Deployed the Solidity stack + wired SM** via `forge script DeployPhase5Stylus.s.sol --broadcast` — SolidityScoreEngine, RevertingStylusEngine, StatelessTransparentProxy(+auto ProxyAdmin), and `SM.setStylusScoreEngine(proxy)`. Script post-deploy assertions passed.
3. **Proved the proxy -> WASM delegatecall** (the RESEARCH.md MEDIUM-confidence risk): `compute_rep_change` returns exact D-2 values through the proxy. The stateless engine delegatecalls cleanly.
4. **Filled real addresses** into `addresses.ts` (4 constants) and `CutoffFallback.s.sol` (3 constants).
5. **Staged the relayer secret** `STYLUS_SCORE_ENGINE_ADDRESS=<proxy>` on `call-it-relayer-sepolia` (fly, --stage — applies on next relayer deploy).

## Deviations from Plan (deployability fixes — none of these were catchable by local cargo test/check/build)

These were discovered by running `cargo stylus check`/`deploy` and the live `forge script` for the first time; they were latent gaps in the crate/script structure delivered by 05-02 and 05-04.

1. **[Blocker] Added `rust-toolchain.toml`** — cargo-stylus requires a pinned specific channel (rejects generic "stable"). Pinned `1.96.0` + wasm32. (commit `0336e20`)
2. **[Blocker] Added `#[entrypoint]` to `StylusScoreEngine`** — it was missing, so the SDK stripped the contract as dead code (wasm was 86 B; activation failed "missing an entrypoint"). With it: 10.8 KiB, activatable. Host `cargo test` still 9/9 (entrypoint is in the wasm32-gated mod). (commit `0336e20`)
3. **[Blocker] OZ 5.6.1 proxy API** — 05-04's script used OZ 4.x idioms:
   - empty init data reverts `ERC1967ProxyUninitialized()` on OZ 5.6 -> added `StatelessTransparentProxy` overriding `_unsafeAllowUninitialized()` (safe: engine is provably stateless).
   - OZ 5.x auto-creates the ProxyAdmin from `initialOwner` -> removed the manual `new ProxyAdmin(...)`; read the auto-created admin from the ERC-1967 admin slot.
   (commit `33d6adc`)
4. **[Tooling] `--wasm-file` deploy** — `cargo stylus deploy` runs `cargo run` to introspect a constructor, which needs a bin target the crate lacks; `--wasm-file` with no `--constructor-signature` bypasses it (engine has no constructor).
5. **[Transient] `--max-fee-per-gas-gwei 1`** — cargo-stylus's default max fee briefly landed under the block base fee; set explicit headroom.

## Acknowledged Deferrals (env-blocked — same pattern as Phase 4 live UAT)

1. **Calendar repoint** (`repoint-calendar.ts`) — requires Google Calendar OAuth (`GOOGLE_CLIENT_ID/SECRET/OAUTH_TOKEN` absent) and pre-seeded event IDs (`stylus-calendar.json` event_t* are all null; `seed-calendar.ts` never run). The deactivation watcher (05-05, Test 5 GREEN) is the documented **independent second belt** and does not depend on the calendar.
2. **Live relayer secret application** — `STYLUS_SCORE_ENGINE_ADDRESS` is **staged** on `call-it-relayer-sepolia` (app status "pending"); it applies when the relayer is deployed. Live Telegram demo-cutoff alert verification belongs to that soak (see 05-07).

## Threat Surface Scan

- `DEPLOYER_PRIVATE_KEY` handled via env only; never echoed, never committed (key value redacted from all command output).
- ProxyAdmin owner = deployer EOA (Phase 5 invariant); Phase 6 promotes to multisig (SAFETY-20).
- Selector gate (`0xff540eb6`) confirmed live, closing the D-1 spoofing risk on-chain.

## Next Phase Readiness

- Plan 05-07 (cutoff round-trip rehearsal) executed in the same session — see 05-07-SUMMARY.md.
- Phase 6 SAFETY-42 drill: RevertingStylusEngine is deployed and confirmed reverting.

---
*Phase: 05-stylusscoreengine-48h-cutoff*
*Completed: 2026-06-02*
