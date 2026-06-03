# Phase 6: Safety review + Sepolia ≥48h + multisig promotion - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 6 is the **pre-mainnet safety gate**. It must prove — under real load on a live/forked staging environment for ≥48 hours — that every safety invariant holds, then stand up the multisig that owns the protocol before mainnet promotion. Concretely it delivers:

1. **Hybrid money-path validation** — a chainid-gated Circle Sepolia USDC redeploy (live public Sepolia money) **and** a mainnet-fork money-path suite (highest fidelity, real USDC + Pyth).
2. **≥48h Sepolia soak** with seeded activity (≥10 calls/all types, ≥30 follow/fade, ≥3 settles per type, ≥1 caller-exit, ≥1 challenge cycle, ≥1 owner-resolved dispute, Pyth confidence-retry / `SettlementDelayed`) — SAFETY-21–28.
3. **Contract-level safety verification matrix** — pause coverage, TVL-cap aggregation boundary across CR+FFM+CE, max-stake/min-position bounds, exit lock + decay, cooldown + slash, dup-hash UTC edges, slippage `minSharesOut`, settlement idempotency, self-challenge gate, reentrancy guard, owner-only guards — SAFETY-29–43.
4. **Stylus destruction drill** — deploy `RevertingStylusEngine` behind the proxy, settle, prove the Solidity baseline fallback runs + `RepCalculatedFallback` + Telegram alert fire (Pitfall 2 closed) — SAFETY-42.
5. **Pre-deploy rituals** — env diff, `arbitrum-sepolia` grep in the prod bundle, hardcoded chain-ID in the relayer EIP-712 domain, relayer ETH balance ≥0.5 ETH, Pyth-feed `bytes32` CI verification against Hermes.
6. **Safe 2-of-3 multisig promotion** — deploy the production Arbitrum One Safe, **rehearse** the full Ownable2Step ownership transfer on the redeployed Sepolia cluster, prove a multisig-executed pause/upgrade — SAFETY-19/20 (HARD GATE before mainnet; Risk #2).
7. **Folded-in debt** — the 5 deferred Phase-4 live-UAT items (`04-HUMAN-UAT.md`) + the Phase-05.1 relayer go-live (`05.1-OPERATOR-HANDOFF.md`), both retargeted to the redeployed cluster.
8. **PITFALLS.md 38-item "Looks Done But Isn't" checklist** — each item checked on Sepolia or in CI; any failure blocks Phase 7.

**NOT in this phase:** the actual mainnet contract deploy + real mainnet ownership transfer (Phase 7), the 20-minute post-deploy smoke test (SAFETY-44, Phase 7.5), and the recurring ops budget approval (deferred to Phase 7 per D-07).

</domain>

<decisions>
## Implementation Decisions

### Money-Path Validation Strategy (resolves ADR 0001)
- **D-01:** **Hybrid (option b + c).** Validate money flows on an **Arbitrum One mainnet-fork** suite (CI; real USDC + Pyth; builds on the existing `SettlementManagerForkTest.sol`) **AND** enable **live public Sepolia money** via Circle's official Sepolia USDC `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`. This requires, per ADR 0001's "Safe design for (b)":
  - `packages/contracts/src/constants/USDC.sol`: add `USDC_ARB_SEPOLIA` + a `resolveUsdc()` that returns the canonical native USDC on `block.chainid == 42161`, the Circle Sepolia USDC on `421614`, and **reverts on any other chain**. Each money contract's constructor asserts `_usdc == resolveUsdc()` (mainnet stays unfakeable — chainid-gated).
  - **Full Sepolia cluster redeploy** with the Circle USDC baked in; re-wire `addresses.ts` + `subgraph.yaml` startBlocks + relayer env to the new addresses.
  - **CI grep guard** moves from "exactly one mainnet literal" → a **2-address allowlist** {mainnet canonical, Circle Sepolia} — still forbids arbitrary addresses.
  - A **security review** before the redeploy is trusted (see Claude's Discretion for mechanism).
  - **The mainnet unfakeable-USDC invariant (D-04/SAFETY-13) is preserved** — only the chainid gate is added; this is the explicit reason the LOCKED-invariant change is acceptable.

### Multisig Promotion (SAFETY-19/20)
- **D-02:** **Solo 2-of-3 Safe** — the operator holds all 3 keys (e.g., a hardware wallet + 2 backups). 2-of-3 protects against losing one key; it is not multi-party. The transfer runbook is built for this model; the 3 concrete signer addresses are an **execution-time input** (provided when the deploy runs).
- **D-03:** **Rehearse the ownership transfer on Sepolia, stand up the production Safe on Arbitrum One.** Phase 6 (a) deploys a matching 2-of-3 Safe on **Sepolia**, runs the full `transferOwnership` → `acceptOwnership` (Ownable2Step) on the **redeployed** Sepolia cluster, and proves a **multisig-executed pause and a proxy upgrade** work end-to-end; and (b) deploys the **production Safe on Arbitrum One** ready for Phase 7. The real mainnet ownership transfer happens at the mainnet deploy (Phase 7) using this proven runbook. Satisfies SC4's `cast call <contract> "owner()"` == multisig literally (on the rehearsed Sepolia cluster) and matches the phase's "prove it's real, not theoretical" ethos.

### 48h Soak Orchestration (SAFETY-21–28)
- **D-04:** **Scripted seeding bot for the bulk on-chain counts** — a repeatable script using test wallets funded via the **Circle Sepolia faucet** + the **live relayer**, driving the ≥10 calls / ≥30 follow-fade / ≥3 settles-per-type / caller-exit / challenge cycle / owner-resolved dispute on a schedule, emitting evidence logs. The **mainnet-fork money-path suite runs in CI** alongside. The **5 folded Phase-4 UAT items are verified manually** through the UI (provenance modal D-10, OG 200px readability SHARE-12/UI-18, live OG render for settled/exited) — these need human judgment.
- **D-05:** **Telegram alerts + a checked evidence log.** Wire the spec's Telegram operator alerts (settlement-stuck, paymaster cap, Stylus-fallback fired — reusing the `stylus-deactivation-watcher.ts` alert path) and capture an **evidence log mapping every SAFETY-29–43 item + every PITFALLS 38-item to a tx hash / screenshot**. "Passed" = every item checked off with evidence.

### Phase Scope & Promotion Gate
- **D-06:** **Keep Phase 6 whole.** The work is tightly coupled and sequential (USDC change → cluster redeploy → relayer go-live → safety verification → soak → ownership transfer of *that* cluster), so a premature split risks fragmenting it. If the planner finds it exceeds the context budget, it returns `## PHASE SPLIT RECOMMENDED` with concrete groupings and the split is decided then (the natural seam is 6a safety+soak / 6b multisig promotion).
- **D-07:** **Budget approval deferred to Phase 7.** The ~$175/mo recurring + $150-300 upfront ops spend (X API, Graph GRT, Pinata, Redis, Better Stack, Pyth VAA ETH) is overwhelmingly mainnet-only; the Sepolia soak runs on free infra (Circle faucet, Sepolia, existing RPC/relayer ETH). Record as a **Phase-7 entry item**, not a Phase-6 gate task.

### Claude's Discretion
- **Security-review mechanism for the (b) USDC change** → use GSD's own gates: run `/gsd-secure-phase` + `/gsd-code-review` over the `USDC.sol` / constructor / CI-guard / redeploy diff. This is a solo build — not an external professional audit. The review must confirm: no code path lets a non-canonical USDC reach mainnet, decimals parity (both 6), and the chainid gate cannot be bypassed (ADR 0001 checklist).
- **Exact redeploy set** for the Circle-USDC change → planner/research determines. Per the Phase-05.1 lesson, redeploying `CallRegistry` forces `FollowFadeMarket` + `ChallengeEscrow` + `SettlementManager` (immutable refs); `ProfileRegistry` only if the constructor must change. The redeploy must reuse `DeployPhase5_1.s.sol`'s full-cluster + consistency-assertion pattern.
- **Fork RPC + faucet ops** → Alchemy Arbitrum One RPC for the fork; Circle Sepolia faucet rate-limits handled inside the seeding script (multiple funded wallets, throttling).
- **Evidence-log format + monitoring depth specifics** → planner picks, anchored to the SAFETY-29–43 + PITFALLS-38 mapping and the existing relayer alert hooks.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Money-path / USDC change (D-01)
- `.planning/decisions/0001-sepolia-staging-usdc.md` — **the money-path strategy ADR.** Phase 6 adopts the **hybrid (b+c)** path; follow the "Safe design for (b)" section verbatim (`resolveUsdc()` chainid-gate, CI-guard 2-address allowlist, redeploy + security-review checklist). MUST read.
- `packages/contracts/src/constants/USDC.sol` — the LOCKED USDC constant to extend with `USDC_ARB_SEPOLIA` + `resolveUsdc()`.
- `packages/shared/src/constants/addresses.ts` — add `USDC_ARB_SEPOLIA` (Circle testnet USDC) + re-wire the redeployed cluster addresses.
- `packages/contracts/script/DeployPhase5_1.s.sol` — full-cluster redeploy + consistency-assertion pattern to reuse for the Circle-USDC redeploy.

### Safety spec + requirements (SAFETY-02/03/19–43)
- `CALL_IT_SPEC1.md` §19.10 (Sepolia staging gate), §19 Phase 6 (contract-safety verifications), §10.2 (TVL cap), §10.3 (pause + withdraw/claim carve-out), §10.8 (proxy + multisig rotation).
- `.planning/REQUIREMENTS.md` — SAFETY-02, 03, 19–43 (Phase-6 requirement IDs + spec traceability).
- `.planning/research/PITFALLS.md` — the 38-item "Looks Done But Isn't" checklist that gates promotion to Phase 7.

### Soak, folded debt, relayer go-live (SAFETY-21–28)
- `.planning/phases/04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta/04-HUMAN-UAT.md` — the 5 folded live-UAT items (status: deferred → closed by this soak).
- `.planning/phases/04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta/04-VERIFICATION.md` — "Acknowledged Gaps A" (live UAT) + "Acknowledged Gaps B" (non-Pyth rail).
- `.planning/phases/05.1-non-pyth-oracle-rail-activation/05.1-OPERATOR-HANDOFF.md` — relayer go-live 5-step checklist; **retarget all 5 steps to the redeployed cluster addresses**, not the current 05.1 addresses.

### Multisig, drill, existing test assets (SAFETY-19/20, 29–43)
- `packages/contracts/src/RevertingStylusEngine.sol` — the destruction-drill contract (**already built**); Phase 6 deploys it to Sepolia behind the proxy and proves the fallback.
- `packages/contracts/test/SettlementManagerForkTest.sol` — existing mainnet-fork harness; basis for the option-(c) fork money-path suite.
- `packages/contracts/test/TvlAggregation.t.sol`, `packages/contracts/test/CallRegistrySafety.t.sol`, `packages/contracts/test/FollowFadeMarketInterference.t.sol` — existing safety / TVL-boundary / multi-call-interference tests to extend for the SAFETY-29–43 matrix.
- `.planning/phases/03-challengeescrow/03-SECURITY.md`, `.planning/phases/04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta/04-SECURITY.md`, `.planning/phases/05-stylusscoreengine-48h-cutoff/05-SECURITY.md` — prior threat models + residual follow-ups to fold into the Phase-6 security review.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`RevertingStylusEngine.sol`** — destruction-drill contract already exists; the drill is a deploy + `proxy.upgradeTo` + settle + assert-fallback exercise, not new contract work.
- **`SettlementManagerForkTest.sol`** — mainnet-fork harness already exists; extend it into the full create→follow/fade→duel→settle→exit→dispute fork suite (real USDC via `deal`/impersonate).
- **`TvlAggregation.t.sol` / `CallRegistrySafety.t.sol` / `FollowFadeMarketInterference.t.sol`** — boundary, safety, and Pitfall-9 interference tests already exist; the SAFETY-29–43 matrix mostly extends these rather than starting fresh.
- **`DeployPhaseN.s.sol` pattern** (`DeployPhase1`…`DeployPhase5_1`, `CutoffFallback`) — Phase-6 redeploy + multisig-transfer scripts follow this convention; `DeployPhase5_1.s.sol` is the full-cluster redeploy template.
- **`apps/relayer/src/workers/stylus-deactivation-watcher.ts`** — existing Telegram alert path to reuse for soak alerting (D-05).
- **`apps/relayer/src/scripts/backfill-criteria.ts`** — criteria backfill for seeded non-Pyth calls (relayer go-live step 4).
- **`Ownable2Step`** is already inherited by CR/FFM/CE/SM/PR — the transfer/accept-ownership pattern is in place; multisig promotion uses the existing `transferOwnership`/`acceptOwnership` surface.

### Established Patterns
- **Immutable-ref cluster coupling** — redeploying `CallRegistry` forces redeploying `FollowFadeMarket` + `ChallengeEscrow` + `SettlementManager` (their refs are immutable). The Circle-USDC redeploy must redeploy the full money cluster with consistency assertions (Phase-05.1 lesson).
- **KMS-derived relayer signer EOAs** (NFT_TWAP/DEFILLAMA/SNAPSHOT_TALLY/CEX) are on-chain in SM; the redeploy must re-set adapterMap + signers and the relayer must re-grant KMS signerVerifier on the new addresses (05.1 handoff).

### Integration Points
- New USDC chainid gate touches every money-contract constructor + the CI grep guard + `addresses.ts` + `subgraph.yaml` + relayer env.
- Multisig (Sepolia rehearsal Safe) becomes `owner()` of the redeployed CR/FFM/CE/SM/PR + the StylusScoreEngine `TransparentUpgradeableProxy` admin role.

</code_context>

<specifics>
## Specific Ideas

- **Circle Sepolia USDC:** `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` — official Circle token, 6-decimals (matches mainnet), faucetable. **Mainnet native USDC:** `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` (chainid 42161 only).
- **Chain IDs:** Arbitrum One `42161`, Arbitrum Sepolia `421614` — the `resolveUsdc()` gate keys on these.
- **Boundary values to verify:** TVL cap $4,999 OK / $5,001 reverts (aggregated across CR+FFM+CE); max stake $100 OK / $101 reverts; min position $1 OK / $0.99 reverts; caller-exit 24h lock (24h cannot exit, 24h+1s can) + 50→15% decay; follower/fader 4h cooldown + flat 10% slash; Pyth confidence retry → `SettlementDelayed` (30×60s).
- **Multisig:** Safe 2-of-3, Ownable2Step `acceptOwnership`, over CallRegistry + FollowFadeMarket + ChallengeEscrow + SettlementManager + ProfileRegistry + StylusScoreEngine proxy admin.

</specifics>

<deferred>
## Deferred Ideas

- **Real mainnet contract deploy + real mainnet ownership transfer** — Phase 7 (this phase only rehearses on Sepolia + stands up the production Arbitrum One Safe).
- **Recurring ops budget approval** (~$175/mo + $150-300 upfront) — Phase 7 entry item (D-07).
- **Post-deploy 20-minute smoke test** (SAFETY-44) — Phase 7.5.
- **External / professional security audit** (beyond the GSD `/gsd-secure-phase` + `/gsd-code-review` self-gates) — post-hackathon, if pursued.
- **Distributed (multi-party) multisig signers** — v1.1 upgrade from the solo 2-of-3 (PROJECT.md: multisig before TVL > $5K / v1.1).

</deferred>

---

*Phase: 06-safety-review-sepolia-48h-multisig-promotion*
*Context gathered: 2026-06-03*
