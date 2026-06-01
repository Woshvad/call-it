# Phase 4: SettlementManager + 7 oracle paths + Solidity baseline rep delta - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-01
**Phase:** 4-SettlementManager + 7 oracle paths + Solidity baseline rep delta
**Areas discussed:** Oracle build order, Settle trigger model, Dispute flow scope, Settled Receipt

---

## Oracle build order

### Hero / spine path

| Option | Description | Selected |
|--------|-------------|----------|
| Pyth price-target | Largest share of calls, cleanest on-chain pull path (VAA multicall + getPriceNoOlderThan), most demo-reliable | ✓ |
| CEX listing | Highest narrative drama but most brittle (8 Playwright scrapers) | |
| NFT floor (TWAP) | Visually rich but relayer-computed 24h TWAP + ≥12-obs gate | |

**User's choice:** Pyth price-target
**Notes:** Proven end-to-end first, polished hardest, demo showcase. All other paths built around proving this spine.

### CEX scraper fidelity bar in Phase 4

| Option | Description | Selected |
|--------|-------------|----------|
| All 8 now, dispute-backed | All 8 wired + per-exchange selectors + Innovation-Zone exclusion + weekly synthetic CI per roadmap; ambiguous → dispute window backstop; Phase 6 load-validates | ✓ |
| Rail + top-3 deep, rest wired | Build rail + Binance/Coinbase/OKX deeply now; other 5 lightly tested; harden all 8 in Phase 6 | |
| You decide | Planner picks the split | |

**User's choice:** All 8 now, dispute-backed
**Notes:** Full roadmap fidelity; scrapers accepted as best-effort with the 24h dispute window as the real backstop.

---

## Settle trigger model

### Automation posture

| Option | Description | Selected |
|--------|-------------|----------|
| Fully automated | BullMQ watcher auto-settles on expiry; ambiguous → dispute window; operator only via pause/forceSettle/resolveDispute | ✓ |
| Hybrid: auto clean, hold ambiguous | Auto-settle confident reads; operator glances at low-confidence before submit | |
| Operator-gated | Operator approves each settlement | |

**User's choice:** Fully automated
**Notes:** Matches the "settles automatically from [oracle]" receipt promise (SETTLE-38) + the permissionless settle() design.

### Where the watcher is built

| Option | Description | Selected |
|--------|-------------|----------|
| Build it in Phase 4 | Always-on BullMQ watcher + Pyth ETH-fee monitoring + retry/backoff + stuck-alerts; Phase 6's load gate depends on it; Phase-0 alert hooks exist | ✓ |
| E2E now, harden in Phase 6 | Phase 4 = settlement E2E + relayer-drivable; productionize cron + monitoring in Phase 6 | |
| You decide | Planner decides from relayer-architecture findings | |

**User's choice:** Build it in Phase 4
**Notes:** Operator-funded KMS-signer relayer is the settle actor (documented default, Pyth ETH-fee monitored per Pitfall 4).

---

## Dispute flow scope

### User-facing dispute UX depth

| Option | Description | Selected |
|--------|-------------|----------|
| Functional-but-lean | Raise button + $5 bond + plain evidence-URL/hash field; Disputed receipt; no in-app upload pipeline | |
| Full self-serve | The above + in-app IPFS/Pinata evidence-upload pipeline + dispute status tracking + counter-claim threading | ✓ |
| Display-only in P4 | Contract mechanics + Disputed receipt only; raising via relayer/cast | |

**User's choice:** Full self-serve
**Notes:** Disputes are a first-class trust mechanism — chose the richest option over the leaner ones. Bumps Phase-4 size; deliberate.

### Owner resolution surface

| Option | Description | Selected |
|--------|-------------|----------|
| Public log + owner admin page | Public /disputes/ log + owner-wallet-gated in-app resolveDispute action with reversal preview | ✓ |
| Public log + CLI resolve | Public log, owner resolves via cast/script | |
| You decide | Planner chooses from effort + OPS-15 runbook | |

**User's choice:** Public log + owner admin page
**Notes:** Symmetric with the rich self-serve raising flow.

---

## Settled Receipt

### CONTRARIAN HIT vs CALLED IT threshold

| Option | Description | Selected |
|--------|-------------|----------|
| Lenient — majority faded | CONTRARIAN HIT whenever the fade side held the majority of real positions; more receipts earn the celebratory word | |
| Strict — heavy disagreement only | CONTRARIAN HIT only at ~≥85% faded (REP-05's 2× band); rarer, more prestigious | |
| You decide | Planner chooses the threshold from the rep-math consensus signal | ✓ |

**User's choice:** You decide
**Notes:** Delegated to planner. Recommended approach documented in CONTEXT.md D-08: derive from the consensus signal, lean toward "majority faded."

### COLD CALL definition

| Option | Description | Selected |
|--------|-------------|----------|
| Small rep gain (low-conv OR uncontested) | COLD CALL when the win produced a small rep delta (low conviction AND/OR zero real fade / cold-start 25%) | |
| Low conviction only | COLD CALL strictly when conviction was low (<50%) | |
| You decide | Planner defines "cold" from settlement signals | ✓ |

**User's choice:** You decide
**Notes:** Delegated to planner. Recommended approach documented in CONTEXT.md D-08: small rep delta → COLD CALL.

### Viewer-dependent rendering + shared OG card

| Option | Description | Selected |
|--------|-------------|----------|
| Per-viewer page, caller-centric OG + fader card | Page computes word per-viewer (winning fader → FADED CORRECTLY); shared OG caller-centric; fader can generate own FADER-WIN card | ✓ |
| Caller-centric only in P4 | Page + OG both caller-centric; FADED CORRECTLY page state + fader card deferred to Phase 7 | |
| You decide | Planner resolves the per-viewer rendering | |

**User's choice:** Per-viewer page, caller-centric OG + fader card
**Notes:** Honors the spec's viewer-dependence (§15.7) without making the single shared image ambiguous.

### Provenance proof depth (SETTLE-52)

| Option | Description | Selected |
|--------|-------------|----------|
| Full proof modal | Oracle source URL + settle tx hash + raw oracle data + EIP-712 relayer signature, in Phase 4 | ✓ |
| Lean line + tx link | "SETTLED FROM [oracle] at [time]" line + tx-hash link only; full modal in Phase 7 | |
| You decide | Planner scopes depth against effort + available data | |

**User's choice:** Full proof modal
**Notes:** "Unfakeable + verifiable" is the core value; strongest demo beat. Chose the rich option.

---

## Claude's Discretion

- **Outcome-word thresholds** (CONTRARIAN HIT, COLD CALL) — user delegated both; derive from rep-math signals (recommended: majority-faded → CONTRARIAN HIT; small rep delta → COLD CALL).
- **⚠ FollowFadeMarket money-movement / redeploy** — claimPayout is a `revert` stub + FFM has no markSettled; researcher must resolve whether settlement requires an FFM redeploy. (Flagged loudly in CONTEXT.md.)
- **Solidity baseline rep fidelity** (REP-22 runtime vs REP-24 build-time) — reconcile in research.
- **Dispatch-table design, shared attestation rail, 2nd-path choice, Spread/vs multi-feed reads, many-duels-per-call settlement loop** — implementation detail for researcher/planner.

## Deferred Ideas

- Always-on watcher hardening → Phase 6 (built in Phase 4, load-validated Phase 6).
- StylusScoreEngine + proxy + 48h mechanical upgradeTo → Phase 5.
- Auto-post-to-X + Twitter Card Validator + 200px QA gate → Phase 7.
- Subgraph publish to Decentralized Network → Phase 7.
- Full 3-contract TVL boundary fuzz + multisig promotion → Phase 6.
- Symmetric duel rep / Duel King real output under load → Phase 6 seeded settle cycle.
