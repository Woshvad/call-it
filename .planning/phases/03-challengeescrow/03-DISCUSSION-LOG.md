# Phase 3: ChallengeEscrow - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-01
**Phase:** 3-ChallengeEscrow
**Areas discussed:** Settlement seam + overage, TVL cap across 3 contracts, Trending + Duel King, Duel page + OG card scope

---

## Settlement seam + overage

### Q1 — SettlementManager seam

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror Phase 2 markSettled | settleDuel(challengeId, winner) onlySettlementManager + setSettlementManager setter; settle sets winner+status, winner pulls via locked CEI claimDuelPayout; no Phase 4 redeploy | ✓ |
| Defer exact shape to Phase 4 | Deploy without the hook; design later — risks a ChallengeEscrow redeploy D-01/D-02 avoided | |

**User's choice:** Mirror Phase 2 markSettled
**Notes:** Keystone pattern carried from Phase 2 D-01/D-02. Per-challengeId seam later proved to also support the many-duels-per-call decision (D-09).

### Q2 — Asymmetric overage (Pitfall 21)

| Option | Description | Selected |
|--------|-------------|----------|
| Push at settlement | Proactively transfer overage to overcommitter in settle tx; UnclaimedOverage entity as observability net | |
| Dedicated pull claimOverage | Separate claimOverage callable by overcommitter regardless of outcome; entity tracks owed-until-claimed | |
| Hybrid: push, fall back to claim | Try push at settlement; on failure record UnclaimedOverage pullable via claimOverage | ✓ |

**User's choice:** Hybrid: push, fall back to claim
**Notes:** Chose the most robust option. Closes the strand-on-loser-overcommit hole in §12.3 step 8. Subgraph UnclaimedOverage entity already scaffolded in Phase 0.

---

## TVL cap across 3 contracts

### Q1 — Cap enforcement scope

| Option | Description | Selected |
|--------|-------------|----------|
| Good-citizen 3-way, no redeploy | proposeChallenge/acceptChallenge check CR + FFM.getTvl() + own escrow; FFM/CR keep 2-way; full closure + fuzz in Phase 6 | ✓ |
| Full symmetric closure now | Redeploy CR + FFM so all 3 read the aggregate; accepts the third redeploy + circular wiring | |
| Defer entirely to Phase 6 | ChallengeEscrow enforces no cap in Phase 3 (original D-03 plan) | |

**User's choice:** Good-citizen 3-way, no redeploy
**Notes:** ChallengeEscrow gets constructor refs to CR + FFM + its own getTvl() view (feeds subgraph TvlSnapshot). Edge case captured: cap filling between propose and accept reverts acceptChallenge; challenger recovers via claimRefund after 24h.

---

## Trending + Duel King

### Q1 — "Riding backer" semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Existing follow/fade on the call | Riding = followers + faders on the parent call; Side-with-caller = Follow, Side-with-challenger = Fade; no new layer | ✓ |
| New duel side-bet layer | Separate staking on duel outcome — new surface + contract; scope creep | |

**User's choice:** Existing follow/fade on the call
**Notes:** Scope guard held — no new betting contract. Trending "≥50 backers" = follower + fader counts.

### Q2 — Compute home

| Option | Description | Selected |
|--------|-------------|----------|
| Relayer worker + Postgres | BullMQ repeatable job + Fly Postgres, reusing D-13/D-14 fan-out infra; read via relayer endpoints | ✓ |
| Subgraph-derived only | No wall-clock cron / temporal windows — poor fit | |
| Client-side on feed load | Inconsistent, can't drive stable 4h pin / weekly king | |

**User's choice:** Relayer worker + Postgres
**Notes:** Reuses Phase 2 notification-fanout infra.

### Q3 — Phase 3 vs Phase 4 exercise boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Build machinery, settled parts inert | Full worker + schema + endpoints + UI now; settled-dependent parts placeholder until Phase 4 | ✓ |
| Defer settled-dependent parts to Phase 4 | Ship only active-duel Trending now; Duel King + recently-settled later | |

**User's choice:** Build machinery, settled parts inert
**Notes:** Active-duel Trending fully live in Phase 3; Duel King + recently-settled validated under load in Phase 6. Win-streak definition is documented planner-discretion flagged for Phase 4.

---

## Duel page + OG card scope

### Q1 — Duel multiplicity + routing key

| Option | Description | Selected |
|--------|-------------|----------|
| Many propose, one accepted/call | Multiple proposals, contract enforces one Accepted duel per call; route /duel/[challengeId] | |
| Many accepted duels per call | No one-accepted guard; caller accepts several; route /duel/[challengeId]; N× stake lockup, settlement fan-out | ✓ |
| One duel per call (key by callId) | Single challenge slot; route /duel/[callId] | |

**User's choice:** Many accepted duels per call
**Notes:** Deliberate divergence from the spec's singular "a duel attached" framing. Implications flagged: one call locks N× caller stake (all TVL-counted); Phase 4 settlement must loop over all accepted duels + stack ~1.5× rep delta per duel; per-challengeId settleDuel seam supports it.

### Q2 — Duel Settled OG card (variant 3) scope

| Option | Description | Selected |
|--------|-------------|----------|
| Full route now, settled fields stubbed | /og/duel/[challengeId] + full §16.4 layout, settled-only fields placeholder until Phase 4 | ✓ |
| Layout component only, no route | Build the Satori-ready component but defer the route to Phase 4 | |
| Defer entirely to Phase 7 | No duel OG card in Phase 3 — contradicts roadmap SC#6 | |

**User's choice:** Full route now, settled fields stubbed
**Notes:** Mirrors Phase 2's variant-1-with-stub precedent; flexbox-only (Pitfall 15); active-duel shares fall back to parent call's Live card or fallback. Auto-post + Card Validator + 200px QA finalize in Phase 4/7.

---

## Claude's Discretion

- Duel King "win streak" definition (consecutive wins in trailing 7 days, weekly refresh, tie-break) — documented assumption, confirm in Phase 4.
- Challenge/overage storage shape, getTvl() precision (within §12.3).
- Trending re-pin/extension behavior; relayer endpoint + Postgres schema shapes (reuse Phase 2 conventions).
- Duels-tab filter-chip wiring + pinned-trending feed-merge logic.
- ⚔ OPEN feed badge + challengeable-only feed filter placement.
- Challenge form matched-stake pre-fill + override; reuse Phase 1 preflight/zod gate pattern.
- Duel page liveness reuses Phase 2 D-07/D-08 (live reads + subgraph activity) — captured as reuse, not separately asked.

## Deferred Ideas

- Full symmetric 3-contract TVL aggregation + boundary fuzz → Phase 6.
- Actual duel settlement + payout + ~1.5× rep delta → Phase 4.
- Real Duel King output + recently-settled tab section → Phase 4 / load-validated Phase 6.
- Auto-post-to-X on resolution + Twitter Card Validator + 200px QA → Phase 7.
- Duel page mobile-responsive → out of scope; Phase 9 desktop-only banner.
- Telegram trending-duel alert → optional v1.1.
