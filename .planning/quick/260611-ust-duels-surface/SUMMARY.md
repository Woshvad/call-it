---
phase: quick-260611-ust
plan: 260611-ust
slug: duels-surface
subsystem: web
tags: [duels, feed, tabs, duel-king, enrichment, d-07, d-14, d-15]
dependency-graph:
  requires:
    - relayer GET /api/duels (list + duelKing wire)
    - relayer GET /api/duels/:id/live-state (per-duel enrichment)
    - lib/relayer-client.ts getMarketLine
    - hooks/useFeedMarketData.ts useFeedHandles
  provides:
    - apps/web/lib/duels-client.ts (single duels wire source)
    - apps/web/hooks/useDuelEnrichment.ts (one-shot capped enrichment)
    - apps/web/components/DuelCard.tsx (shared rich duel card)
  affects:
    - /duels page (tabbed, banner, card list)
    - feed Duels tab (app/page.tsx)
tech-stack:
  added: []
  patterns:
    - one-shot capped enrichment hook keyed on sorted id-set (no polling)
    - D-15 honest pin relocation (same contract, new home, cited comments)
key-files:
  created:
    - apps/web/lib/duels-client.ts
    - apps/web/hooks/useDuelEnrichment.ts
    - apps/web/components/DuelCard.tsx
    - apps/web/tests/duels-surface.test.ts
  modified:
    - apps/web/app/duels/page.tsx
    - apps/web/app/page.tsx
    - apps/web/tests/feed-tabs-chips.test.ts
    - apps/web/tests/presentation-sweep.test.ts
decisions:
  - "RELAYER_URL in duels-client: NEXT_PUBLIC_RELAYER_URL preferred (the duels surfaces' working precedent) with NEXT_PUBLIC_RELAYER_BASE_URL fallback (relayer-client's var) — both set identically in .env.local/Vercel"
  - "DuelCard 1s tick gated on needsClock (Accepted-with-expiry or Proposed) — no idle intervals on Settled/Rejected/Refunded cards"
metrics:
  duration: ~35m
  completed: 2026-06-11
  tasks: 6
  files: 8
  commit: fdac4fe
---

# Quick 260611-ust: Duels Surface Upgrade Summary

**Rich at-a-glance duel cards (status chip / market line / VS matchup / pot / status clocks / consensus bar / winner row) shared by /duels and the feed Duels tab, plus tape-parity Live/Settled tabs and a DUEL KING banner — all real wire + live-state data, D-07 degrade-to-hidden.**

## What Shipped

1. **apps/web/lib/duels-client.ts** — single duels wire source: DuelEntry/DuelKing/DuelsResponse/DuelEnrichment types, fetchDuels(status?) (8s abort, defensive per-field mapping lifted from duels/page.tsx, duelKing mapped defensively, null-on-any-failure), fetchDuelEnrichment(challengeId) (live-state -> callId/winner/expiry/reserves with per-field BigInt try/catch, deferred:true -> null, merges getMarketLine(callId) when non-null), and the lifted formatUsdc/truncateAddress/gradFor helpers.
2. **apps/web/hooks/useDuelEnrichment.ts** — one-shot Promise.all enrichment Map keyed on joined SORTED challengeIds, capped at the first 20 duels (documented), zero polling primitives; failures silently absent (cards degrade to wire-only).
3. **apps/web/components/DuelCard.tsx** — whole-card Link to /duel/:id; status chip (LIVE DUEL pulsing / AWAITING ACCEPT / SETTLED / muted others + TRENDING); enrichment-gated market line; challenger-vs-caller matchup with handles (AS STORED, truncated fallback) + per-side stakes; POT; status-dependent clock (Accepted: ticking CALL CLOSES IN -> amber AWAITING SETTLEMENT; Proposed: 24h ACCEPT WINDOW countdown citing ChallengeEscrow.sol:59 -> ACCEPT WINDOW EXPIRED); .brutal-bar split consensus with .caller/.challenger duel-variant children and the === 0n ? 50 guard; Settled-only WINNER row gated on non-zero winner. The 1s countdown setInterval is the feature's only interval.
4. **apps/web/app/duels/page.tsx** — Live duels / Settled duels tabs (tape .tabs recipe: role=tab, aria-selected, min-height 44, .count chip ONLY post-fetch-success), TWO independent fetches (fetchDuels() + fetchDuels('Settled')) with per-tab error/loading state, null-gated DUEL KING banner (handle via useFeedHandles, WIN STREAK + HIGHEST POT + last-win timeAgo from the ISO wire value), DuelCard lists with enrichment + handles, brutal-table deleted, 'NO DUELS YET' live-tab copy preserved verbatim + 'NO SETTLED DUELS YET.' added.
5. **apps/web/app/page.tsx** — Duels-tab region only: local DuelTabRow/fetchDuels/DuelRowLink deleted; shared fetchDuels/DuelCard/useDuelEnrichment/useFeedHandles wired in; count chip logic (duels !== null ? duels.length : null) and 'NO LIVE DUELS IN YOUR GRAPH.' empty block byte-preserved; all non-duels wiring untouched.
6. **Tests** — new duels-surface.test.ts (23 tests: client wire/never-throw, card gating/index-order WINNER pin/no-fake-data, page wiring, hook cap/no-polling, real-module helper pins); D-15 honest pin relocations in feed-tabs-chips.test.ts (~42 '/api/duels' and ~46 /duel template-literal pins now assert page->duels-client/DuelCard indirection + the contract at its new home, with quick-260611-ust comments; ~50 'NO LIVE DUELS...' untouched) and presentation-sweep.test.ts C7 ('/api/duels' relocated to duels-client; 'NO DUELS YET' untouched).

## Gates

| Gate | Result |
|---|---|
| pnpm --filter @call-it/web build | exit 0 (typed routes + tsc clean) |
| pnpm --filter @call-it/web exec vitest run | 33 files / 335 tests, ALL green (312 pre-existing + 23 new; migrated pin suites 35/35 green) |
| git show --stat HEAD | exactly the 8 plan files (fdac4fe), no push |
| Untouched | apps/relayer/**, packages/**, 'call it frontend/', docs/, evidence/, .planning/config.json, .gitignore |

## Commit

- fdac4fe feat(quick-260611-ust): duels surface upgraded — live/settled tabs, duel-king banner, rich at-a-glance cards (matchup/market line/pot/clock/consensus/winner — all real wire + live-state data)

## Deviations

1. **page.tsx at edit time:** byte-identical to the planning snapshot (git-clean in apps/web; md5 verified immediately before editing) — parallel-session composition was a no-op. The now-unused `import Link from 'next/link'` was removed alongside the deleted DuelRowLink (its only consumer; noUnusedLocals would have failed the build gate otherwise).
2. **RELAYER_URL derivation:** plan said to mirror relayer-client.ts (NEXT_PUBLIC_RELAYER_BASE_URL), but the working duels surfaces (duels page, duel detail) use NEXT_PUBLIC_RELAYER_URL. duels-client prefers NEXT_PUBLIC_RELAYER_URL with NEXT_PUBLIC_RELAYER_BASE_URL fallback — both are set to the same Fly URL in .env.local; documented in the module comment.
3. **useDuelEnrichment comment wording:** the header documents "no polling" without the literal word setInterval — the plan's Task 2 verify greps for the literal's absence anywhere in the file, comments included.
4. **Baseline drift:** plan cited a 303-test baseline; at execution the pre-existing suite was 312 (parallel sessions landed tests between planning and execution). All 335 green.
5. **DuelCard typing:** ReactNode imported explicitly from 'react' instead of relying on the React. UMD namespace.

## Self-Check: PASSED

- All 8 files exist on disk and in commit fdac4fe (3 new modules + 1 new suite created, 2 pages + 2 suites modified).
- Commit fdac4fe present on master; no deletions of unrelated files in the diff; no push performed.
- Verification greps from the plan (Tasks 1-5) all pass; both gates green post-commit.
