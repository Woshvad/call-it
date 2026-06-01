# Phase 4: SettlementManager + 7 oracle paths + Solidity baseline rep delta - Context

**Gathered:** 2026-06-01
**Status:** Ready for planning

<domain>
## Phase Boundary

The settlement engine — the keystone that closes the receipt loop (Live → Settled → Shared). A new `SettlementManager.sol` (none exists yet; only seams in the other contracts) implements the 14-step atomic, idempotent, permissionless `settle(callId)` (§12.4) that dispatches per `(marketType, eventSubtype)` to **7 oracle adapters**, applies the **1.7% fee extraction** + **Solidity-baseline reputation deltas** (in-contract this phase, NOT a Phase-5 fallback — so the 48h Stylus cutoff is a mechanical `upgradeTo`), runs the **dispute window** ($5 bond / 24h / max 3 / owner-resolved), exposes **`forceSettle`** (7-day cooldown), and renders the **Settled Receipt page** + Settled/CallerExited OG cards (variants 2 & 4).

**In scope:**
- `SettlementManager.sol` + `ISettlementManager.sol` (new) — 14-step `settle(callId)` (atomic, idempotent, permissionless), oracle dispatch, fee extraction, rep write, dispute window, `forceSettle`. Wires into the existing `setSettlementManager` setters on CallRegistry / FollowFadeMarket(?) / ChallengeEscrow / ProfileRegistry + joins `ProfileRegistry.authorizedRepWriters`.
- **7 oracle adapters**: Pyth (on-chain pull — `bytes[] pythUpdateData` multicall + `getPriceNoOlderThan(priceId,60)` + ETH fee), Alchemy NFT 24h TWAP (relayer-computed, ≥12 obs, `submitNftFloor`), DefiLlama (TVL/volume/fees/APRs), direct RPC (on-chain metrics + liquidation events), Snapshot, Tally, **8 Playwright CEX scrapers**. All relayer-attestation paths land via KMS-signed EIP-712 with chainId binding + per-attestation-type key separation.
- **In-contract Solidity baseline rep math** (`_solidityBaselineRepDelta`) + the try/catch seam that will wrap the Phase-5 Stylus call; `RepCalculatedFallback` event; cold-start 25% scaling (REP-14); exited-caller rep skip (§8.7.3).
- **Dispute system (full self-serve)**: in-app raise (bond + IPFS evidence upload + status tracking + counter-claim threading), public `/disputes/` log, owner-gated in-app resolve admin page.
- **Settled Receipt page** (`/call/[id]` when Settled/Disputed): outcome-word hero (per-viewer), FINAL POSITIONS, Caller-Exited variant, Disputed variant, stamp animation, full provenance proof modal, 200px readability.
- **Settled (variant 2) + Caller-Exited (variant 4) OG cards** with cache-busting; fill the settled-field stubs in the existing duel OG variant-3 route.
- Subgraph `settlement-manager.ts` real handlers (replace Phase-0 stub) + Sepolia Studio redeploy; settlement-stuck (OPS-15) + Stylus-reactivation (OPS-16) runbooks.
- **Closes Phase-3's deferred settled-state UAT** (duel settlement produces real winners → Duel King + recently-settled surfaces light up).

**Out of scope:**
- StylusScoreEngine (Rust full-fidelity rep) + the `TransparentUpgradeableProxy` + 48h mechanical `upgradeTo` → **Phase 5**. Phase 4 ships only the in-contract Solidity baseline + the try/catch seam.
- Auto-post-to-X on settle + Twitter Card Validator pre-flight + 200px readability QA *gate* → **Phase 7** (cache-warm-verified). Phase 4 renders the cards; Phase 7 finalizes + auto-posts.
- Subgraph publish to The Graph Decentralized Network → **Phase 7** (Phase 4 stays on Sepolia Studio).
- Full 3-contract TVL-cap aggregation boundary fuzz + multisig promotion + ≥48h Sepolia load gate → **Phase 6**.
- Always-on watcher *hardening* (load tuning, ETH-fee auto-topup) → **Phase 6** load-validation (the watcher itself is built in Phase 4 — D-04).

</domain>

<decisions>
## Implementation Decisions

### Oracle build order & sequencing
- **D-01: Pyth price-target is the hero/spine path.** Proven end-to-end first, polished hardest, showcased in the demo. Rationale: largest share of calls, cleanest on-chain pull path (VAA multicall + `getPriceNoOlderThan`), 250ms-block fast, most demo-reliable. The other 6 (relayer-attestation) paths are built around proving this spine works.
- **D-02: All 8 CEX scrapers ship at full roadmap fidelity in Phase 4** — per-exchange selectors + Innovation-Zone exclusion fixtures + weekly synthetic-test CI cron (Binance, Coinbase, OKX, Bybit, Kraken, Bitget, KuCoin, Upbit). NOT a reduced subset. Scrapers are accepted as best-effort; **ambiguous/missed reads → 24h dispute window is the backstop**, not scraper perfection. Phase 6 load-validates under the seeded ≥48h cycle.

### Settlement trigger & automation
- **D-03: Fully automated settlement.** The relayer auto-settles every call as expiry hits; ambiguous reads (Pyth confidence-wide after 30×60s retries; non-Pyth single +5min retry fail) → 24h dispute window + `SettlementDelayed` + Telegram alert. Operator intervenes ONLY via `pause` / `forceSettle` (7d) / `resolveDispute`. Matches the "settles automatically from [oracle]" receipt promise (SETTLE-38) and the permissionless `settle()` design.
- **D-04: The productionized always-on settlement watcher is built IN Phase 4** (not deferred). BullMQ expiry queue + Pyth ETH-fee budget monitoring (Pitfall 4) + retry/backoff + settlement-stuck Telegram alert (the Phase-0 `settlement-stuck-25m` hook already exists). Rationale: Phase 6's ≥48h Sepolia-load gate needs ≥3 auto-settled calls per type, so a working watcher is a Phase-6 prerequisite.
- **D-05: Operator-funded KMS-signer relayer is the settle actor for v1** (documented default — not separately asked). It fetches/signs/pushes oracle data, pays gas + Pyth update-VAA ETH fees from its KMS wallet (existing `apps/relayer/src/lib/kms-signer.ts`). `settle()` stays permissionless, but the operator relayer is the reliable trigger. Per-attestation-type KMS key separation (NFT-TWAP / DefiLlama / CEX / Snapshot / OAuth-proof) per spec §13.2/§10.7 + Pitfall 7.

### Dispute flow
- **D-06: Full self-serve dispute UX in Phase 4** (founder's explicit choice over leaner options — disputes are a first-class trust mechanism). "Dispute this settlement" on the Settled receipt → modal that pulls the $5 USDC bond + an **in-app IPFS evidence-upload pipeline** (Pinata, already wired Phase 0) + dispute status tracking + counter-claim threading on the receipt.
- **D-07: Owner-resolution = public `/disputes/` log + owner-gated in-app resolve admin page.** Public `/disputes/` page shows open/resolved disputes + evidence + the Pitfall-6 24h owner public-commitment (before `forceSettle`). The owner resolves via an in-app, owner-wallet-gated `resolveDispute(callId, finalOutcome)` action with the reversal preview (rep deltas reversed + pool USDC re-distributed old-winner→new-winner). Symmetric with the rich raising flow.

### Settled Receipt (the core product artifact)
- **D-08: Outcome-word ASSIGNMENT thresholds are planner discretion, derived from existing rep-math signals** (founder explicitly delegated — see Claude's Discretion). The 5 words + colors are **LOCKED** by §15.7/§16.3 (do not change). Recommended assignment: **CONTRARIAN HIT** when the fade side held the *majority* of real positions at settlement (lenient — more wins earn the celebratory word, drives shares); **COLD CALL** when the win produced a *small rep delta* (low conviction AND/OR zero real fade → cold-start 25% scaling, REP-14); **CALLED IT / LOUD AND WRONG** are the default win/loss words.
- **D-09: Per-viewer outcome-word rendering on the receipt PAGE; caller-centric shared OG card + separate fader card.** The page computes the word per-viewer: caller sees CALLED IT / LOUD AND WRONG / CONTRARIAN HIT / COLD CALL; a *winning fader* sees **FADED CORRECTLY** (accent + FADER WIN lozenge) per §15.7. The default shared OG card is **caller-centric** (the 4 caller words only); a winning fader can generate their OWN "FADER WIN" share card. Honors the spec's viewer-dependence without making the single shared image ambiguous.
- **D-10: Full settlement-provenance proof modal ships in Phase 4** (SETTLE-52 — founder chose the rich option; "unfakeable + verifiable" is the core value). "SETTLED FROM [oracle URL] at [timestamp] UTC · view oracle proof ↗" → modal with oracle source URL + settle tx hash (Arbiscan link) + raw oracle data (Pyth price+confidence / signed attestation payload / scraped announcement) + the EIP-712 relayer signature. Strongest demo beat ("here's the cryptographic proof").

### Claude's Discretion
The user said "you decide" on outcome-word thresholds and trusts the team on architecture. These are open for the researcher/planner:
- **Outcome-word exact thresholds (D-08)** — the % cutoffs for CONTRARIAN HIT vs CALLED IT and the "cold" definition. Derive from the consensus + rep-delta signals already computed; do not invent a new signal. Lean toward more wins earning the celebratory word.
- **⚠ THE keystone architecture question — settlement money movement + FollowFadeMarket redeploy** (see `<code_context>` Integration Points). `FollowFadeMarket.claimPayout` is a hard `revert ClaimRequiresSettlement()` STUB and FFM has no `markSettled`. Resolve before planning: does enabling the real pool-split/fee/pull-payout require an **FFM redeploy** (which collides with the Phase 2/3 "no third redeploy" + "ship exact mainnet contracts in Phase 7.5" goals), or can a fresh `claimPayout` read `CallRegistry.outcome` and compute a per-claimer split lazily? Cascades into Sepolia re-seed, `addresses.ts`/`subgraph.yaml`, and the Phase-7.5 deploy story.
- **Solidity baseline rep fidelity** — REP-22 specifies the *runtime* fallback is lower fidelity (linear confidence, fixed contrarian 1.0, no high-conviction asymmetry); reconcile against the Phase-5 *build-time* full-fidelity proxy-swap baseline (REP-24). Decide whether Phase 4 ships one function or anticipates both.
- **Dispatch-table design** `(marketType, eventSubtype) → adapter`; the shared KMS-attestation rail abstraction; which attestation path is built 2nd to prove the rail generalizes (DefiLlama is the cleanest candidate).
- **Spread/vs multi-feed reads** — SETTLE-12 (assetA + assetB same block, either wide → ambiguous); the Volume/Market-cap/TVL-rank/Fees-rank metrics route to DefiLlama, not Pyth.
- **Many-duels-per-call settlement loop** (Phase 3 D-09) — `settle()` loops over ALL accepted duels per call, stacks ~1.5× rep each (REP-27), pushes overage at settlement (Phase 3 D-03).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec source-of-truth (LOCKED) — `CALL_IT_SPEC1.md`
- §7.3–7.8 — Reputation math: confidence × contrarian multipliers, high-conviction 2× asymmetry (≥85), 3 categories (Majors/DeFi/Other), no rep gating, freeze-on-inactivity
- §8.3 — Cold-start adjustment (25% scaling when zero real fade; not on losses)
- §8.6, §8.8, §8.9, §8.11 — Fees: 1.7% total = 1.0% protocol + 0.4% creator (Model B `callerVolumeAtExit` for exited callers) + 0.3% LP into winning reserve; duel = 1% protocol only
- §10.2 — TVL cap aggregation · §10.3 — Pause carve-out (`claimPayout`/withdraw work while paused; `settle()` IS paused) · §10.8 — Non-upgradeable money contracts (pause+redeploy)
- §11.4 — SettlementManager responsibilities (calls into ChallengeEscrow to trigger payouts) · §11.6 — Stylus + Solidity baseline runtime AND build-time fallback
- §12.4 — **14-step `settle()` (LOCKED)** + dispute logic + `forceSettle` · §12.5 — ProfileRegistry `updateAfterSettlement`/`applyRepDelta` write-auth · §12.6 — `compute_rep_change` signature (Phase 5, but settle step 7 calls it)
- §13.1 — Pyth pull (`getPriceNoOlderThan(priceId,60)`, `confidence × 200 <= price`, 30×60s retries) · §13.2 — Alchemy NFT 24h TWAP (≥12 obs, `submitNftFloor(callId, twapPriceWei, observationCount, evidenceHash)`) · §13.3 — DefiLlama · §13.4 — RPC metrics + liquidation events · §13.5 — Snapshot/Tally · §13.6 — 8 CEX scrapers
- §13.7–13.8 — Dispute window ($5 bond, $2 reward, `MAX_COUNTER_CLAIMS=3`, owner-resolve, reversal) · §8.10 — bond/reward economics
- §15.7 — **Settled Receipt page layout** (outcome hero, FINAL POSITIONS, Caller-Exited + Disputed variants, provenance line, NO wallet address) · §16.3 — Settled OG card variant 2 · §16.5 — Caller-Exited OG card variant 4
- §19.10 — Phase-6 Sepolia staging gate (downstream consumer of settlement)

### Requirements — `.planning/REQUIREMENTS.md`
- **SETTLE-01..52** (the full settlement surface — settle/idempotency/atomicity, all 7 oracle paths, dispute, forceSettle, fees, SLA, provenance)
- **REP-03..16, REP-22, REP-23, REP-25, REP-26, REP-27** (rep math, cold-start, in-contract baseline + try/catch fallback, `RepCalculated`/`RepCalculatedFallback`, `updateAfterSettlement`, ~1.5× duel rep)
- **UI-14..23, UI-44, UI-45, UI-52, UI-54** (Settled Receipt page, outcome variants, FINAL POSITIONS, Caller-Exited + Disputed variants, stamp animation)
- **SHARE-05, SHARE-06, SHARE-08, SHARE-12** (Settled + Caller-Exited OG cards, outcome-color mapping, 200px readability QA)
- **OPS-15** (settlement-stuck runbook), **OPS-16** (Stylus reactivation runbook), **SAFETY-57** (per-auth-method permission scoping — documented v1 limitation)

### Roadmap + prior phase context
- `.planning/ROADMAP.md` Phase 4 — Goal, 6 success criteria, 9 pitfalls mitigated (4, 5, 6, 7, 10, 11, 18, 19, 22)
- `.planning/phases/03-challengeescrow/03-CONTEXT.md` — **D-01** `settleDuel(challengeId, winner)` seam, **D-03** overage push-then-claim, **D-09 MANY duels per call → settle loops + stacks ~1.5× rep** (carry loudly), **D-08** Duel King / recently-settled now exercisable
- `.planning/phases/02-followfademarket/02-CONTEXT.md` — **D-01** single-custodian FFM (settlement = local pool split incl. caller stake), **D-02** CallRegistry `markSettled`/`markCallerExited` seams, **D-04** ProfileRegistry `authorizedRepWriters`, **D-05** caller-exit rep slash (distinct from win/loss math), **D-09** OG cache-bust on state change
- `.planning/STATE.md` — accumulated decisions + blockers (ops budget, Stylus alpha risk, ADR-0001) · `.planning/PROJECT.md` — Key Decisions table

### Decisions / ADRs
- `.planning/decisions/0001-sepolia-staging-usdc.md` — **settlement money-paths validate via mainnet-fork** (mandated mainnet USDC has no Sepolia code → live-Sepolia stake transfers revert). Critical for testing the settle money movement.

### Research (read before planning)
- `.planning/research/STACK.md` — `@pythnetwork/pyth-sdk-solidity@4.3.1` + `@pythnetwork/hermes-client@3.1.0`, `alchemy-sdk@3.6.5`, DefiLlama (`api.llama.fi`/`yields.llama.fi`), `@snapshot-labs/snapshot.js@0.14.21`, Tally GraphQL, Playwright, `bullmq`, viem `createWalletClient` + KMS; Pyth contract `0xff1a0f47…925C` (Arbitrum One) / `0x4374e5a8…5DAF` (Sepolia); feed IDs catalogue (BTC/ETH/SOL/…); native USDC `0xaf88d065…e5831`
- `.planning/research/ARCHITECTURE.md` — relayer-cluster + oracle-adapter boundaries
- `.planning/research/PITFALLS.md` — **4** (Pyth pull multicall + ETH fee budget), **6** (public dispute log + 24h owner commitment), **7** (KMS key separation + EIP-712 chainId + on-chain TWAP sanity-check), **10** (CEX weekly CI), **11** (cold-start sybil-fade), **18** (claim-delay decision), **19** (CEX exclusion fixtures + multi-signal confirm), **22** (LP empty-pool → treasury)

### Deployed contracts + code (read the source before extending)
- `packages/contracts/src/CallRegistry.sol` — Sepolia `0x7DAd732764abfC935aD5bf8e5CFF9BEA7B2C234D`; `markSettled(callId, outcome)` (status flip ONLY, `onlySettlementManager`, one-shot guard), `setSettlementManager` (at `0x0` — rotate this phase), `getCall`, `currentTvl`, `computeCallerExitPenalty`
- `packages/contracts/src/FollowFadeMarket.sol` — Sepolia `0x12aafa5a70c3aD8Bd3a52252744f9F7Aa073E362`; ⚠ **`claimPayout` is `revert ClaimRequiresSettlement()` STUB; NO `markSettled`** — the money-movement gap (see Discretion + Integration Points)
- `packages/contracts/src/ChallengeEscrow.sol` — Sepolia `0x59eb7C8000f0bC4C0e32d2060f304d9b5655bec2`; `settleDuel(challengeId, winner)` (`onlySettlementManager`, `nonReentrant`), `setSettlementManager`, `claimDuelPayout` (CEI, idempotent), overage push (D-03)
- `packages/contracts/src/ProfileRegistry.sol` — Sepolia `0xAfe239a3606b89Ef65DbBcDb1b87a920052c359E`; `updateAfterSettlement` (Phase-4 STUB — only emits `ProfileUpdated`; implement `settledCalls++`/wins/losses), `applyRepDelta` (works, floors at 0), `authorizedRepWriters`, `setSettlementManager`
- `packages/contracts/src/interfaces/` — has ICallRegistry/IChallengeEscrow/IFollowFadeMarket/IProfileRegistry; **add `ISettlementManager.sol` (none exists)**
- `packages/contracts/src/constants/USDC.sol` — every transfer path (CI grep guard) · `packages/contracts/foundry.toml` — `=0.8.30` pin + `ci` fuzz profile (1000 runs)
- `packages/contracts/script/` — DeployPhase1/2/3 exist; **add `DeployPhase4.s.sol`** (wire `setSettlementManager` on CallRegistry/FollowFadeMarket(?)/ChallengeEscrow/ProfileRegistry + authorize in `ProfileRegistry.authorizedRepWriters`)
- `packages/subgraph/src/settlement-manager.ts` — Phase-0 STUB (no-op block handler); replace with real handlers: `CallSettled`, `DisputeRaised`, `DisputeResolved`, `CallForceSettled`, `SettlementDelayed`, `RepCalculated`, `RepCalculatedFallback`
- `apps/relayer/src/lib/kms-signer.ts` (KMS EIP-712 signer — exists), `der-to-viem-hex.ts`, `subgraph-client.ts`, `telegram.ts` · `apps/relayer/src/workers/` (`cex-heartbeat.ts`, `synthetic-event-handler.ts`, `polled-events-fallback.ts`, `alerts.ts` exist — add settlement watcher + oracle adapters) · `apps/relayer/src/routes/` (`live-state.ts`/`duel-live-state.ts` patterns — add settle/oracle/dispute routes)
- `apps/web/app/call/[id]/page.tsx` + `layout.tsx` — Live Receipt (Phase 2); extend for Settled/Disputed/CallerExited states
- `apps/web/app/og/[callId]/route.ts` — Live OG variant 1 (Node runtime, flexbox-only, `renderFallback`, `?v={statusVersion}`); clone for Settled (variant 2) + CallerExited (variant 4) · `apps/web/app/og/duel/[challengeId]/route.ts` — variant 3 with settled-field stubs (D-11) → Phase 4 fills them
- `packages/shared/src/constants/{usdc,networks,addresses,pyth-feeds}.ts` — single source of truth; add `SETTLEMENT_MANAGER_*` after deploy

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **The full settlement-seam surface is pre-wired across all 4 contracts** — `setSettlementManager` setters (deployed at `address(0)`, owner rotates this phase), `onlySettlementManager` guards on `markSettled`/`settleDuel`, `ProfileRegistry.authorizedRepWriters` + `applyRepDelta`. SettlementManager plugs into these setters with **no redeploy of CallRegistry/ChallengeEscrow/ProfileRegistry** (the keystone goal from Phase 2 D-01/02 + Phase 3 D-01).
- **Phase-0 ops infra**: Telegram alert dispatcher (already includes `settlement-stuck-25m`, `RepCalculatedFallback`, `CallForceSettled`, dispute-raised events), KMS signer, polled-events fallback, **Pinata IPFS** (for D-06 evidence upload).
- **Phase-2 OG route pattern + Live Receipt page + Receipt UI primitive** (`<Receipt mode>` variants), ConvictionBar, CornerBrackets, Stamp animation — the Settled/Disputed/CallerExited states + OG variants 2/4 extend these.
- **Phase-2/3 subgraph extension + redeploy-to-Studio pattern**; **Foundry test scaffolds + Vitest parity gate (D-29)** — extend for settlement/rep/dispute/fee invariants.
- **Duel OG variant-3 route with settled-field stubs (D-11)** — ready to fill once duel settlement produces winners.

### Established Patterns
- Single source of truth in `packages/shared`; never inline addresses/networks/fees (CI grep guards).
- viem-only on the server; `createWalletClient` + GCP-KMS signer for any onchain write (settlement is the primary new write path).
- CEI + ReentrancyGuard on every USDC path; Ownable2Step + `pause()` with `claimPayout`/withdraw carve-outs (§10.3); `settle()` itself IS paused (SETTLE-04).
- Foundry `=0.8.30`; property-fuzz invariants; Foundry↔Vitest parity for any shared math (rep deltas, fee splits, outcome determination).
- OG routes: `export const runtime = 'nodejs'` first line, **flexbox-only (no `display:grid`** — Pitfall 15 + grep guard), `renderFallback` on error, `?v={statusVersion}` cache-bust on state change.

### Integration Points
- **⚠ KEYSTONE — FollowFadeMarket money movement / redeploy.** `claimPayout` is a `revert` stub and FFM has no `markSettled`. Settlement must split winning-pool-over-losing-pool USDC (incl. caller stake per Phase 2 D-01), extract 1.7% fees (§8.6), route LP fee into the winning reserve, handle the empty-pool→treasury case (Pitfall 22, CALL-41), and unlock pull-pattern `claimPayout`. **Open: does this force an FFM redeploy** (colliding with "no third redeploy" + Phase-7.5 "ship exact mainnet contracts"), or can a fresh `claimPayout` read `CallRegistry.outcome` + compute per-claimer split lazily? Researcher must resolve **before** planning — it dictates Sepolia re-seed, `addresses.ts`/`subgraph.yaml` churn, and the deploy story.
- **ProfileRegistry.updateAfterSettlement is a stub** — implement `settledCalls++`/wins/losses + invoke the rep engine (Solidity baseline now via the try/catch seam; Stylus joins in Phase 5). SettlementManager joins `authorizedRepWriters`.
- **ChallengeEscrow.settleDuel** — settle() loops over ALL accepted duels per call (Phase 3 D-09), sets winner + status, pushes overage, stacks ~1.5× rep per duel (REP-27).
- **New SettlementManager.sol + ISettlementManager.sol**; `DeployPhase4.s.sol` rotates `setSettlementManager` on the 4 contracts + authorizes it in `ProfileRegistry.authorizedRepWriters`; updates `addresses.ts` + `subgraph.yaml` + Sepolia Studio redeploy.
- **Relayer**: new settlement watcher (BullMQ) + 7 oracle adapter modules + dispute routes; reuse `kms-signer`, `subgraph-client`, `telegram`, polled-events fallback.
- **Web**: extend `/call/[id]` for Settled/Disputed/CallerExited; add `/disputes/` public log + owner resolve admin; OG variants 2/4; fill duel variant-3 settled fields.

</code_context>

<specifics>
## Specific Ideas

- **The verifiability + trust surfaces ARE the product — build them FULLY.** The founder chose the *richest* option on both trust-critical questions: full self-serve dispute system (in-app raise + IPFS evidence + public log + owner admin resolve, D-06/07) AND the full provenance proof modal (raw oracle data + EIP-712 attestation, D-10), over leaner alternatives. **Do not trim these to manage Phase-4 size** — they are the "unfakeable, verifiable receipt" core value made tangible, and the strongest demo beats.
- **Pyth price-target is the demo spine (D-01)** — it must be flawless end-to-end; every other oracle path orbits proving that spine. The live demo settles a BTC/ETH price-target call and shows the proof modal.
- **The receipt is per-viewer (D-09).** A caller's loss is a winning fader's "FADED CORRECTLY" win — faders get their own win moment + their own share card. The receipt's emotional payload is asymmetric by viewer, not a single global outcome.
- **Outcome-word thresholds: the founder explicitly delegated (D-08).** Don't over-engineer — derive from the rep-math signals already computed; lean toward more receipts earning the celebratory word (CONTRARIAN HIT for majority-faded wins).
- **Close Phase-3's deferred settled-state UAT here** — real duel settlement is the first time Duel King + recently-settled + paired rep deltas produce live data (Phase 3 D-08).

</specifics>

<deferred>
## Deferred Ideas

- **Always-on watcher hardening** (load tuning, ETH-fee auto-topup, backoff calibration) → **Phase 6** load-validation. The watcher is *built* in Phase 4 (D-04); Phase 6 stress-tests it under the ≥48h seeded cycle.
- **StylusScoreEngine** (Rust full-fidelity rep) + `TransparentUpgradeableProxy` + the 48h mechanical `upgradeTo` → **Phase 5**. Phase 4 ships the in-contract Solidity baseline + the try/catch seam only.
- **Auto-post-to-X on settle + Twitter Card Validator pre-flight + 200px readability QA gate** → **Phase 7** (cache-warm-verified). Phase 4 renders the OG cards; Phase 7 finalizes + auto-posts.
- **Subgraph publish to The Graph Decentralized Network** → **Phase 7**. Phase 4 stays on Sepolia Studio.
- **Full 3-contract TVL-cap aggregation boundary fuzz + multisig promotion** → **Phase 6**.
- **Symmetric duel rep / Duel King real output under load** → **Phase 6** seeded settle cycle (functional in Phase 4, load-validated Phase 6).
- **Outcome-word exact % thresholds** → planner discretion (D-08), derived from rep-math signals.

</deferred>

---

*Phase: 4-SettlementManager + 7 oracle paths + Solidity baseline rep delta*
*Context gathered: 2026-06-01*
