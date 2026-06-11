---
phase: quick-260611-ust
plan: 260611-ust
slug: duels-surface
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/lib/duels-client.ts
  - apps/web/hooks/useDuelEnrichment.ts
  - apps/web/components/DuelCard.tsx
  - apps/web/app/duels/page.tsx
  - apps/web/app/page.tsx
  - apps/web/tests/duels-surface.test.ts
  - apps/web/tests/feed-tabs-chips.test.ts
  - apps/web/tests/presentation-sweep.test.ts
autonomous: true
requirements: [QUICK-260611-UST]
must_haves:
  truths:
    - "The /duels page has 'Live duels' / 'Settled duels' tabs like the tape (app/page.tsx .tabs recipe: role=tab, aria-selected, min-height 44, .count chip ONLY post-fetch-success — D-07 null while loading/failed), settled tab fed by a SEPARATE fetchDuels('Settled') with independent error handling — a settled-fetch failure never kills the live tab"
    - "Every duel card (BOTH /duels and the feed Duels tab) is at-a-glance rich: status chip (LIVE DUEL pulsing / AWAITING ACCEPT / SETTLED / muted others + TRENDING), market line subject when enrichment has it, challenger-vs-caller matchup with handles + per-side stakes, POT, status-dependent clock (24h accept window cited from ChallengeEscrow.sol:59 CHALLENGE_ACCEPTANCE_WINDOW; ticking CALL CLOSES IN; amber AWAITING SETTLEMENT), follow/fade consensus split bar (caller/challenger variant children), and a Settled-only WINNER row — every element real wire or live-state data, absence = hidden (D-07, never fake)"
    - "The duelKing wire field (currently dropped by the web) is surfaced as a DUEL KING banner above the tabs on /duels — handle via useFeedHandles fallback truncated, WIN STREAK + HIGHEST POT + last-win timeAgo — hidden entirely when null (D-07)"
    - "Per-duel enrichment (/api/duels/:id/live-state → callId/winner/expiry/reserves + getMarketLine(callId)) is ONE-SHOT per id-set, capped at the first 20 duels, ZERO polling — the only setInterval anywhere is DuelCard's 1s countdown tick; failures degrade the card to wire-only fields (D-07)"
    - "D-14 honored: duel purple #A855F7 stays confined to duel surfaces (DuelCard, duels page, Duels tab); caller side uses #E8F542"
    - "D-15 test-pin migration is HONEST: feed-tabs-chips.test.ts ~42 ('/api/duels') and ~46 (/\\/duel\\/\\$\\{/) and presentation-sweep C7 ~55 ('/api/duels') are RELOCATED to point at duels-client.ts / DuelCard.tsx with same-contract assertions + one-line comments citing quick-260611-ust — never simply deleted; 'NO LIVE DUELS IN YOUR GRAPH.' (page.tsx) and 'NO DUELS YET' (duels page live tab) copy preserved verbatim so their pins stay satisfied untouched"
    - "Gates green: pnpm --filter @call-it/web build exit 0; pnpm --filter @call-it/web exec vitest run ALL green (baseline 303 + migrated pins + new duels-surface suite); single atomic 8-file commit, no push, web-only — apps/relayer/**, packages/**, 'call it frontend/', docs/, evidence/ never touched"
  artifacts:
    - path: "apps/web/lib/duels-client.ts"
      provides: "single duels wire source — DuelEntry/DuelKing/DuelsResponse types, fetchDuels(status?), DuelEnrichment + fetchDuelEnrichment (live-state + getMarketLine merge), shared formatUsdc/truncateAddress/gradFor lifted from duels/page.tsx"
      contains: "/api/duels"
    - path: "apps/web/hooks/useDuelEnrichment.ts"
      provides: "one-shot capped (20) Promise.all enrichment Map keyed on sorted challengeIds — no polling"
      exports: ["useDuelEnrichment"]
    - path: "apps/web/components/DuelCard.tsx"
      provides: "shared rich duel card — status chips, market line, VS matchup, pot + status clocks (accept window / call closes / awaiting settlement), consensus split bar, settled winner row; whole card a Link to /duel/:id"
      contains: "ACCEPT WINDOW"
    - path: "apps/web/app/duels/page.tsx"
      provides: "tabbed duels page — Live/Settled tabs, DUEL KING banner, DuelCard list per tab, brutal-table deleted, 'NO DUELS YET' kept + 'NO SETTLED DUELS YET.' added"
      contains: "DUEL KING"
    - path: "apps/web/app/page.tsx"
      provides: "feed Duels tab rendering DuelCard via duels-client (local DuelTabRow/fetchDuels/DuelRowLink deleted); count chip logic + 'NO LIVE DUELS IN YOUR GRAPH.' byte-preserved"
      contains: "NO LIVE DUELS IN YOUR GRAPH."
    - path: "apps/web/tests/duels-surface.test.ts"
      provides: "source-assertion + cheap real-module pins for the client, card honesty/gating, page wiring, enrichment cap/no-polling"
    - path: "apps/web/tests/feed-tabs-chips.test.ts"
      provides: "pins ~42/~46 relocated to duels-client/DuelCard (same contract, new location, quick-260611-ust comments); line ~50 untouched"
    - path: "apps/web/tests/presentation-sweep.test.ts"
      provides: "C7 '/api/duels' pin relocated to duels-client indirection; 'NO DUELS YET' pin untouched"
  key_links:
    - from: "apps/web/lib/duels-client.ts"
      to: "relayer GET /api/duels and /api/duels/:id/live-state"
      via: "fetchDuels(status?) + fetchDuelEnrichment(challengeId), 8s aborts, null-on-failure"
      pattern: "live-state"
    - from: "apps/web/lib/duels-client.ts"
      to: "apps/web/lib/relayer-client.ts"
      via: "getMarketLine(callId) merged into DuelEnrichment.marketLine"
      pattern: "getMarketLine"
    - from: "apps/web/components/DuelCard.tsx"
      to: "/duel/[id]"
      via: "whole-card next/link Link (typedRoutes as any)"
      pattern: "/duel/\\$\\{"
    - from: "apps/web/app/duels/page.tsx"
      to: "apps/web/components/DuelCard.tsx"
      via: "per-tab duels.map with enrichment + handles maps"
      pattern: "DuelCard"
    - from: "apps/web/app/page.tsx"
      to: "apps/web/lib/duels-client.ts"
      via: "fetchDuels import replacing the local copy (feed-tabs-chips migrated pin)"
      pattern: "duels-client"
    - from: "apps/web/app/duels/page.tsx"
      to: "apps/web/hooks/useFeedMarketData.ts"
      via: "useFeedHandles over challenger/caller/winner/duelKing addresses"
      pattern: "useFeedHandles"
---

<objective>
Upgrade the duels surface (user request 2026-06-11: "touch up the duel page and the duel section it looks too basic — let each card have more data what people can easily understand what's up at a look... and on the duel page there should be different sections like live duels and settled duels like we have on the tape").

Two deliverables: (1) a shared rich DuelCard replacing the bare 4-column brutal-table on /duels AND the compact DuelRowLink on the feed Duels tab — status chip, market line, VS matchup with handles and stakes, pot, status-dependent clocks, consensus bar, winner row, all wired to REAL data (the /api/duels wire + per-duel /api/duels/:id/live-state enrichment + getMarketLine), degrade-to-hidden when a source is absent (D-07); (2) /duels gets Live/Settled tabs mirroring the tape's .tabs recipe plus a DUEL KING banner surfacing the wire field the web currently drops.

PARALLEL-SESSION CONSTRAINT: a second Claude session shares this tree (currently clean in apps/web, but that can change). RE-READ apps/web/app/page.tsx immediately before editing it and COMPOSE with any changes found.

Purpose: at-a-glance duel comprehension without opening each duel; tape-parity sectioning.
Output: 3 new modules (duels-client, useDuelEnrichment, DuelCard) + 2 page reworks + 1 new test suite + 2 honest pin migrations. Web-only; single atomic 8-file commit; no push; relayer routes are READ-ONLY references.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@apps/web/app/duels/page.tsx                   — REWORK target. Today: page-header, loading skeletons, error/retry card, 'NO DUELS YET' empty block, bare 4-column brutal-table; local fetchDuels (lines 62-86 defensive mapping) + formatUsdc + gradFor + truncateAddress helpers (these LIFT into duels-client)
@apps/web/app/page.tsx                         — Duels-tab region only (~55-130 DuelTabRow type + fetchDuels copy + DuelRowLink; ~475-490 rows render + dashed 'NO LIVE DUELS IN YOUR GRAPH.' empty; ~294 count chip `duels !== null ? duels.length : null`). RE-READ LIVE FILE before editing; touch NOTHING outside the Duels-tab region
@apps/web/lib/relayer-client.ts                — getMarketLine(callId) at line 216 (hits /api/calls/:id/live-state, returns string|null, never throws) — IMPORT it; also the RELAYER_URL pattern to mirror. Do NOT build a client-side market-line builder, do NOT add ABI fragments
@apps/web/hooks/useFeedMarketData.ts           — useFeedHandles(addresses): ProfileRegistry displayHandle multicall, chainId-pinned, staleTime 60s — REUSE for challenger/caller/winner/duelKing handles; fallback stays truncated address
@apps/web/components/LiveCallCard.tsx          — formatCountdown replica source ('D HH:MM:SS', 1s setInterval tick, suppressHydrationWarning) — replicate locally in DuelCard, do NOT import its internals
@apps/web/app/globals.css                      — VERIFIED recipes, NO CSS changes: .tabs/.tab/.tab .count (755/761/777), .chip-row/.chip (827/830), .btn (484) + .btn.cream/.fade/.duel, .pill.tag (654), .pill.duel (already used by duels page), .brutal-bar (661) + .brutal-bar.split (673) with .follow/.gap/.fade (674-676) AND duel-specific .caller (accent-win)/.challenger (accent-duel) (677-678), .label-overline (617), .avatar + .avatar-grad-a..f (717-738), .row/.col (982-983), .spread (984), .mono (985), .muted (986), .brutal-card + .brutal-table
@apps/relayer/src/routes/duels.ts              — READ ONLY, NEVER EDIT. GET /api/duels → { duels: DuelEntry[], count, duelKing }. DuelEntry: challengeId, challengerStake, callerStake, pot (min(stakes)*2, USDC 6dp string), status ('Proposed'|'Accepted' default; ?status=<single> filter), proposedAt (unix s string), acceptedAt|null, challenger, caller, isTrending, trendingUntil. duelKing: { winnerAddress, winStreak, highestPotUsdc, lastWinAt, weekAnchor } | null
@apps/relayer/src/routes/duel-live-state.ts    — READ ONLY (lines 154-171): { challengeId, callId, caller, challenger, callerStake, challengerStake, pot, status, winner: string|null, followReserve, fadeReserve, expiry (PARENT CALL unix-s string), deferred: boolean }. 4s relayer cache
@packages/subgraph/src/challenge-escrow.ts     — READ ONLY: status values Proposed/Accepted/Rejected/Refunded/Settled → settled tab = `/api/duels?status=Settled`
@packages/contracts/src/ChallengeEscrow.sol    — READ ONLY: line 59 CHALLENGE_ACCEPTANCE_WINDOW = 24 hours — cite in a comment wherever 24*60*60 is used
@apps/web/tests/feed-tabs-chips.test.ts        — pins to migrate: ~42 page.tsx contains '/api/duels'; ~46 page.tsx matches /\/duel\/\$\{/; ~50 page.tsx contains 'NO LIVE DUELS IN YOUR GRAPH.' (stays satisfied — copy remains)
@apps/web/tests/presentation-sweep.test.ts     — C7 (~49-56): duels/page.tsx contains 'NO DUELS YET' (stays satisfied — copy kept as LIVE tab empty) and '/api/duels' (migrates)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create apps/web/lib/duels-client.ts — single source for the duels wire</name>
  <files>apps/web/lib/duels-client.ts</files>
  <action>
New module, the single source for the duels wire (quick-260611-ust). Exports:

1. `export type DuelEntry` — challengeId, challengerStake, callerStake, pot, status, proposedAt, acceptedAt: string | null, challenger, caller (all string except acceptedAt), isTrending: boolean.
2. `export type DuelKing` — winnerAddress: string, winStreak: string, highestPotUsdc: string, lastWinAt: string | null.
3. `export type DuelsResponse` — `{ duels: DuelEntry[]; duelKing: DuelKing | null }`.
4. `export async function fetchDuels(status?: string): Promise<DuelsResponse | null>` — URL `${RELAYER_URL}/api/duels` + optional `?status=${encodeURIComponent(status)}` when status provided; `AbortSignal.timeout(8_000)`; `res.ok` guard; defensive per-field String()/Boolean() mapping EXACTLY like the existing duels/page.tsx fetchDuels (lines 62-86 — lift that mapping); duelKing mapped defensively too (null when absent/malformed); return null on ANY failure (whole body in try/catch → null, never throws).
5. Shared helpers `formatUsdc`, `truncateAddress`, `gradFor` — lift VERBATIM from apps/web/app/duels/page.tsx so both consumers share one copy.
6. `export type DuelEnrichment` — `{ callId?: string; winner?: string; expiry?: number; followReserve?: bigint; fadeReserve?: bigint; marketLine?: string }`.
7. `export async function fetchDuelEnrichment(challengeId: string): Promise<DuelEnrichment | null>` — GET `${RELAYER_URL}/api/duels/${challengeId}/live-state` (8s AbortSignal.timeout, res.ok guard); if body `deferred === true` → return null; map callId/winner/expiry (Number) / followReserve+fadeReserve (BigInt with try/catch per field — omit field on parse failure) from the wire (apps/relayer/src/routes/duel-live-state.ts:154-171 shape); then if callId present, `await getMarketLine(callId)` (import from './relayer-client') and merge `marketLine` only when non-null. Entire function never throws (try/catch → null).

RELAYER_URL: mirror however relayer-client.ts derives it (import/reuse if exported, else replicate the env read identically). Header comment: single duels wire source — /api/duels list + per-duel live-state enrichment; D-07 degrade contract (null = consumer hides/degrades, never fakes); quick-260611-ust.
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && grep -q '/api/duels' apps/web/lib/duels-client.ts && grep -q '?status=' apps/web/lib/duels-client.ts && grep -q 'live-state' apps/web/lib/duels-client.ts && grep -q 'getMarketLine' apps/web/lib/duels-client.ts && grep -q 'fetchDuelEnrichment' apps/web/lib/duels-client.ts</automated>
  </verify>
  <done>duels-client.ts exports DuelEntry/DuelKing/DuelsResponse/DuelEnrichment types, fetchDuels (optional status filter, defensive mapping, null-on-failure), fetchDuelEnrichment (live-state + getMarketLine merge, deferred→null, never throws), and the lifted formatUsdc/truncateAddress/gradFor helpers.</done>
</task>

<task type="auto">
  <name>Task 2: Create apps/web/hooks/useDuelEnrichment.ts — one-shot capped enrichment</name>
  <files>apps/web/hooks/useDuelEnrichment.ts</files>
  <action>
New 'use client' hook module. `export function useDuelEnrichment(duels: DuelEntry[] | null): Map<string, DuelEnrichment>` (types from '@/lib/duels-client').

One-shot useEffect keyed on the joined SORTED challengeIds (stable string key — new array identities must not refire): `Promise.all` over the FIRST 20 duels calling `fetchDuelEnrichment(duel.challengeId)` per duel; merge successes into a Map state keyed by challengeId; failures simply absent from the Map (cards degrade to wire-only, D-07). Cap literal `20` with a comment: list is ≤50 by route limit, ≤20 enriched keeps the burst bounded; failures are silent by design — this comment documents the cap and the degrade contract.

NO polling, NO refetch — single shot per id-set (the relayer caches live-state at 4s; this is a browse surface). ZERO setInterval / refetchInterval in this file. Guard duels === null / empty → empty Map, effect no-ops. Header comment cites quick-260611-ust.
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && grep -q 'useDuelEnrichment' apps/web/hooks/useDuelEnrichment.ts && grep -qE '\b20\b' apps/web/hooks/useDuelEnrichment.ts && ! grep -q 'setInterval' apps/web/hooks/useDuelEnrichment.ts && ! grep -qE 'refetchInterval' apps/web/hooks/useDuelEnrichment.ts</automated>
  </verify>
  <done>Hook returns a Map of successful enrichments only; one-shot per sorted-id-set key; cap 20 with documenting comment; no polling primitives anywhere in the file.</done>
</task>

<task type="auto">
  <name>Task 3: Create apps/web/components/DuelCard.tsx — shared rich at-a-glance duel card</name>
  <files>apps/web/components/DuelCard.tsx</files>
  <action>
New 'use client' component, the shared rich duel card for BOTH /duels and the feed Duels tab. Props `{ duel: DuelEntry; enrichment?: DuelEnrichment; handles?: Map<string, string> }` (types from '@/lib/duels-client'; helpers formatUsdc/truncateAddress/gradFor imported from there).

SHELL: whole card is a next/link `Link` to `/duel/${duel.challengeId}` (typedRoutes: cast `as any` like the existing DuelRowLink in page.tsx), styled as a brutal card matching the LiveCallCard root idiom: block, textDecoration none, bg var(--bg-secondary), border-2 var(--border-subtle), rounded-none, p-5 or p-6, hover: border-white + 4px shadow (4px_4px_0_0_#000) + slight -translate.

Local constants: `DUEL_ACCENT = '#A855F7'`, `CALLER_ACCENT = '#E8F542'` (D-14: duel purple confined to duel surfaces — OK here). Local helpers: `timeAgo(unixS)` — coarse honest buckets ("just now" under 60s, "Nm ago", "Nh ago", "Nd ago", NaN-guard to "just now"); a ticking countdown replica of LiveCallCard's formatCountdown ('D HH:MM:SS', 1s setInterval tick, suppressHydrationWarning) — local replica, do NOT import LiveCallCard internals.

CONTENT top→bottom (every element real; absence = hidden, D-07):

(a) HEADER ROW (className="spread"): LEFT — status chip: status==='Accepted' → `<span className="pill duel">` with a pulsing dot + 'LIVE DUEL'; 'Proposed' → muted-style pill 'AWAITING ACCEPT'; 'Settled' → pill 'SETTLED'; Rejected/Refunded → muted pill with the status uppercased. Plus `{duel.isTrending && <span className="pill duel">TRENDING</span>}`. RIGHT — mono tertiary `#${challengeId} · proposed {timeAgo(proposedAt)}`.

(b) MARKET LINE (ONLY when enrichment?.marketLine): the duel's subject — font-display font-extrabold ~20px ('ARB vs OP' / 'ETH ≥ $4,000'). This is the at-a-glance "what's this duel about".

(c) VS ROW (.spread or flex): challenger side — `.avatar` sm `avatar-grad-{gradFor(...)}` + handle (`handles?.get(duel.challenger.toLowerCase()) ?? truncateAddress(duel.challenger)`, rendered AS STORED, color DUEL_ACCENT, fontWeight 700, mono 13px) + under it mono 10.5px tertiary `STAKED {formatUsdc(challengerStake)}`; center mono tertiary 'VS'; caller side mirrored (color CALLER_ACCENT) + `STAKED {formatUsdc(callerStake)}`.

(d) POT + CLOCK ROW (.spread): LEFT mono bold 14px `POT {formatUsdc(pot)}`. RIGHT (mono 11px), status-dependent: 'Accepted' + enrichment?.expiry → ticking `CALL CLOSES IN {D HH:MM:SS}` (1s tick, suppressHydrationWarning); expiry passed → amber (var(--accent-warning)) 'AWAITING SETTLEMENT'; 'Proposed' → accept-window countdown from `Number(proposedAt) + 24 * 60 * 60` (comment MUST cite: ChallengeEscrow.sol:59 CHALLENGE_ACCEPTANCE_WINDOW = 24 hours): `ACCEPT WINDOW {HH:MM:SS}`, expired → muted 'ACCEPT WINDOW EXPIRED'; 'Settled'/other → nothing.

(e) CONSENSUS BAR (ONLY when enrichment has BOTH followReserve AND fadeReserve and follow+fade > 0n): thin `.brutal-bar split` using the DUEL-VARIANT children (globals.css 677-678): `<div className="caller" style={{flexBasis:`${pct}%`}}/><div className="gap"/><div className="challenger" style={{flexBasis:`${100-pct}%`}}/>` where `const total = follow + fade;` and `pct = total === 0n ? 50 : Number((follow * 100n) / total)`; plus a .spread mono 10px tertiary caption `RIDING CALLER {pct}%` / `RIDING CHALLENGER {100-pct}%` (follow reserve = backing the caller, fade = backing the challenger — same semantic as the duel detail's consensus).

(f) WINNER ROW (ONLY when status==='Settled' AND enrichment?.winner is a non-zero address — zero address or absent → row hidden ENTIRELY, D-07 never guess): .spread with `<span className="pill">` win-accent styled 'WINNER' + winner handle (handles map, fallback truncated; highlight color by side: winner===caller → CALLER_ACCENT, ===challenger → DUEL_ACCENT) + mono `TOOK {formatUsdc(pot)}`.

HEADER COMMENT must document: at-a-glance duel card (quick-260611-ust, user request 2026-06-11); the honest-data map — wire fields always (challengeId/stakes/pot/status/proposedAt/parties/isTrending); callId/winner/expiry/reserves/marketLine via per-duel live-state enrichment, degrade-to-hidden when absent (D-07); D-14 duel purple confined here. NO hardcoded handles, NO fake counts anywhere.
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && grep -q '/duel/${' apps/web/components/DuelCard.tsx && grep -q 'ACCEPT WINDOW' apps/web/components/DuelCard.tsx && grep -q 'CALL CLOSES IN' apps/web/components/DuelCard.tsx && grep -q 'AWAITING SETTLEMENT' apps/web/components/DuelCard.tsx && grep -q 'ChallengeEscrow' apps/web/components/DuelCard.tsx && grep -q 'WINNER' apps/web/components/DuelCard.tsx</automated>
  </verify>
  <done>DuelCard renders all six content zones with the exact gating rules (market line / consensus / winner enrichment-gated; clocks status-dependent; accept window cites ChallengeEscrow.sol:59); whole card Links to /duel/:id; consensus uses .caller/.challenger split children with the === 0n ? 50 guard; handles fall back to truncated addresses.</done>
</task>

<task type="auto">
  <name>Task 4: Rework apps/web/app/duels/page.tsx — Live/Settled tabs, DUEL KING banner, DuelCard list</name>
  <files>apps/web/app/duels/page.tsx</files>
  <action>
KEEP: page-header, error/retry card, loading skeletons. REPLACE the bare brutal-table with the card list (the table was the "too basic" thing).

1. DELETE the local fetchDuels/formatUsdc/gradFor/truncateAddress copies; import them (and DuelEntry/DuelsResponse types) from '@/lib/duels-client'.
2. TWO fetches on mount (parallel): `live = fetchDuels()` (route default Proposed+Accepted) and `settled = fetchDuels('Settled')` (subgraph status value, packages/subgraph/src/challenge-escrow.ts). SEPARATE state per tab INCLUDING independent error handling — a settled fetch failure degrades only the settled tab to its error/empty state, never the live tab (and vice versa).
3. TAB ROW like the tape: mirror the prototype .tabs recipe used in app/page.tsx (button, role="tab", aria-selected, min-height 44 markup) — 'Live duels' / 'Settled duels', each with `<span className="count">` ONLY post-fetch-success (null while loading/failed — D-07, same rule as the feed tabs).
4. DUEL KING banner (NEW — wire field currently dropped): when `liveResponse?.duelKing` non-null, render ABOVE the tabs a brutal banner card: `.label-overline` accent-duel 'DUEL KING', winner handle via useFeedHandles (fallback truncated), mono `WIN STREAK {winStreak}` + `HIGHEST POT {formatUsdc(highestPotUsdc)}` + `{lastWinAt && 'last win {timeAgo}'}`. Hidden entirely when null (D-07).
5. CARD LIST per tab: `duels.map → <DuelCard duel={d} enrichment={enrichMap.get(d.challengeId)} handles={handlesMap} />` with `useDuelEnrichment(activeTabDuels)` (from '@/hooks/useDuelEnrichment') and `useFeedHandles` (from '@/hooks/useFeedMarketData') over ALL challenger/caller/winner(from enrichMap)/duelKing addresses (lowercased, deduped). React hook rules: ALL hooks called unconditionally at component top, BEFORE any early return — pass empty arrays when data absent.
6. EMPTY STATES: live tab keeps the EXISTING 'NO DUELS YET' brutal block VERBATIM (presentation-sweep C7 pin); settled tab → same structure with 'NO SETTLED DUELS YET.' + sub 'Finished duels land here with their receipts.' (no CTA link needed).

Header comment: tabbed duels surface (live/settled like the tape) + duel-king banner + rich cards; quick-260611-ust.
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && grep -q 'duels-client' apps/web/app/duels/page.tsx && grep -q 'DuelCard' apps/web/app/duels/page.tsx && grep -q 'DUEL KING' apps/web/app/duels/page.tsx && grep -q 'NO DUELS YET' apps/web/app/duels/page.tsx && grep -q 'NO SETTLED DUELS YET.' apps/web/app/duels/page.tsx && grep -q "'Settled'" apps/web/app/duels/page.tsx</automated>
  </verify>
  <done>Duels page has tape-style Live/Settled tabs with post-success-only count chips, independent per-tab fetch/error state, the duelKing banner (null-gated), DuelCard lists with enrichment + handles, both empty states (existing copy preserved verbatim), and zero remaining local copies of the lifted helpers; brutal-table gone.</done>
</task>

<task type="auto">
  <name>Task 5: apps/web/app/page.tsx Duels-tab region — DuelCard via duels-client, byte-preserve everything else</name>
  <files>apps/web/app/page.tsx</files>
  <action>
RE-READ the LIVE file immediately before editing (a parallel Claude session shares this tree — compose with any changes found; as of planning the tree was clean in apps/web).

1. DELETE the local DuelTabRow type + fetchDuels copy + DuelRowLink component (~lines 55-130). Import `{ fetchDuels, type DuelEntry }` from '@/lib/duels-client', `DuelCard` from '@/components/DuelCard', `useDuelEnrichment` from '@/hooks/useDuelEnrichment'; reuse the existing useFeedHandles import if present, else add it from '@/hooks/useFeedMarketData'.
2. Duels state becomes `DuelEntry[] | null` with the SAME one-shot fetch + null-on-failure semantics (fetchDuels() returns DuelsResponse | null → map to `result ? result.duels : null`). Count chip logic at ~294 UNCHANGED: `duels !== null ? duels.length : null`.
3. Duels tab body (~475-490): `duels.map → <DuelCard duel={d} enrichment={enrichMap.get(d.challengeId)} handles={handlesMap} />` — useDuelEnrichment + useFeedHandles hooks at component top, called unconditionally (empty arrays when duels null). KEEP the dashed 'NO LIVE DUELS IN YOUR GRAPH.' empty block VERBATIM (feed-tabs-chips pin ~line 50).
4. Touch NOTHING else in page.tsx — tabs/chips/Live/Settled/Following wiring stays byte-identical; lowercase status comparisons preserved (status-normalization pin, D-15).
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && grep -q 'duels-client' apps/web/app/page.tsx && grep -q 'DuelCard' apps/web/app/page.tsx && grep -q 'NO LIVE DUELS IN YOUR GRAPH.' apps/web/app/page.tsx && pnpm --filter @call-it/web build</automated>
  </verify>
  <done>Build exits 0; feed Duels tab renders DuelCard from the shared modules; local DuelTabRow/fetchDuels/DuelRowLink deleted; count chip logic + empty-state copy + all non-duels wiring byte-preserved.</done>
</task>

<task type="auto">
  <name>Task 6: New duels-surface.test.ts + honest pin migrations + full gates + atomic 8-file commit</name>
  <files>apps/web/tests/duels-surface.test.ts, apps/web/tests/feed-tabs-chips.test.ts, apps/web/tests/presentation-sweep.test.ts</files>
  <action>
(a) NEW apps/web/tests/duels-surface.test.ts — source-assertion style like presentation-sweep (node fs readFileSync + join(process.cwd(), ...), cwd = apps/web; substring/regex/index-order checks), plus real-module unit pins where cheap. Assertions:
- duels-client.ts: contains '/api/duels', '?status=', 'live-state'; imports getMarketLine; defensive mapping present (String( / Boolean( ); never-throw pattern (try/catch — `catch` appears in fetchDuels and fetchDuelEnrichment regions).
- DuelCard.tsx: matches /\/duel\/\$\{/; 'WINNER' gated behind Settled (index-order: the `'Settled'` check appears BEFORE 'WINNER' in source, or a single gate expression pins both); contains `24 * 60 * 60` (or 86_400) AND a 'ChallengeEscrow' citation comment; contains 'ACCEPT WINDOW' + 'CALL CLOSES IN' + 'AWAITING SETTLEMENT'; consensus children 'caller'/'challenger' class literals + the /===\s*0n\s*\?\s*50/ guard; NO hardcoded handles, NO fake counts (no /FOLLOW · \d/-style literals).
- duels/page.tsx: imports duels-client + DuelCard; contains 'Live duels' + 'Settled duels' + 'count'; contains the 'Settled' fetch arg; contains 'DUEL KING' + a duelKing null-gate (e.g. /duelKing\s*(&&|\?)/ or equivalent); keeps 'NO DUELS YET'; contains 'NO SETTLED DUELS YET.'
- page.tsx: imports DuelCard + duels-client; keeps 'NO LIVE DUELS IN YOUR GRAPH.'
- useDuelEnrichment.ts: cap literal 20 + its comment; NO polling — no refetchInterval and no setInterval in the hook file (the ONLY setInterval allowed in this feature is DuelCard's 1s countdown tick).

(b) MIGRATE existing pins — HONEST relocation (D-15: same contract, new location, NEVER simply delete an assertion; one-line comments citing quick-260611-ust on each changed assertion):
- feed-tabs-chips.test.ts ~line 42: the page.tsx-contains-'/api/duels' assertion → assert page.tsx imports/references 'duels-client' AND read duels-client.ts contains '/api/duels'.
- feed-tabs-chips.test.ts ~line 46: the page.tsx /\/duel\/\$\{/ assertion → assert page.tsx imports DuelCard AND DuelCard.tsx source matches /\/duel\/\$\{/.
- feed-tabs-chips.test.ts ~line 50 ('NO LIVE DUELS IN YOUR GRAPH.'): UNTOUCHED — still satisfied by page.tsx.
- presentation-sweep.test.ts C7 ~line 55: the duels/page.tsx-contains-'/api/duels' assertion → assert duels/page.tsx contains 'duels-client' AND duels-client.ts contains '/api/duels'.
- presentation-sweep.test.ts ~line 54 ('NO DUELS YET'): UNTOUCHED — copy kept on the live tab.

GATES (ALL must pass before commit):
- `cd "C:/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/web build` → exit 0
- `pnpm --filter @call-it/web exec vitest run` → ALL green (baseline 303; migrated feed-tabs-chips + presentation-sweep pins green; new duels-surface suite green; all other suites stay green)

COMMIT (single atomic; Git Bash on this Windows box; NO push — orchestrator pushes). Stage ONLY these 8 explicit paths via individual `git add`:
- `git add apps/web/lib/duels-client.ts`
- `git add apps/web/hooks/useDuelEnrichment.ts`
- `git add apps/web/components/DuelCard.tsx`
- `git add apps/web/app/duels/page.tsx`
- `git add apps/web/app/page.tsx`
- `git add apps/web/tests/duels-surface.test.ts`
- `git add apps/web/tests/feed-tabs-chips.test.ts`
- `git add apps/web/tests/presentation-sweep.test.ts`
- `git commit -m "feat(quick-260611-ust): duels surface upgraded — live/settled tabs, duel-king banner, rich at-a-glance cards (matchup/market line/pot/clock/consensus/winner — all real wire + live-state data)"`

NEVER `git add -A` / `git add .` / `git add -u`. NEVER stage or touch: apps/relayer/**, packages/**, packages/contracts/lib/openzeppelin-contracts, 'call it frontend/', docs/, evidence/, .planning/config.json, any .gitignore files, .claude/.
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/web exec vitest run</automated>
  </verify>
  <done>All gates green (build exit 0; full vitest run green — 303 baseline + migrated pins + new suite); `git show --stat HEAD` lists EXACTLY the 8 files; no push; relayer/packages/docs/evidence untouched.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @call-it/web build` → exit 0 (typed routes + tsc clean).
- `pnpm --filter @call-it/web exec vitest run` → ALL green: 303 baseline intact, feed-tabs-chips with migrated ~42/~46 pins, presentation-sweep with migrated C7 pin, new duels-surface suite.
- `git show --stat HEAD` → exactly the 8 staged files (3 new modules, 2 page reworks, 3 test files).
- Source spot-checks: duels-client.ts contains '/api/duels' + 'live-state' + getMarketLine import; DuelCard.tsx contains '/duel/${' + 'ACCEPT WINDOW' + 'CALL CLOSES IN' + 'AWAITING SETTLEMENT' + 'ChallengeEscrow' citation; duels/page.tsx contains 'DUEL KING' + 'Live duels' + 'Settled duels' + 'NO DUELS YET' + 'NO SETTLED DUELS YET.'; page.tsx keeps 'NO LIVE DUELS IN YOUR GRAPH.'; useDuelEnrichment.ts has no setInterval/refetchInterval.
- `git status` → apps/relayer/**, packages/**, 'call it frontend/', docs/, evidence/ untouched and unstaged.
</verification>

<success_criteria>
- [ ] /duels has tape-parity 'Live duels' / 'Settled duels' tabs (separate fetches, independent error states, post-success-only count chips) and the brutal-table is replaced by rich DuelCard lists
- [ ] Every duel card answers "what's up" at a glance: status chip + trending, market-line subject, challenger-vs-caller matchup with handles + stakes, pot, status-dependent clock (24h accept window cited from ChallengeEscrow.sol:59; ticking call-close; amber awaiting-settlement), consensus split bar, settled winner row — all real data, absence hidden (D-07)
- [ ] DUEL KING banner surfaces the previously-dropped duelKing wire field, null-gated
- [ ] Feed Duels tab shares the same DuelCard + duels-client modules; count chip logic and 'NO LIVE DUELS IN YOUR GRAPH.' empty state byte-preserved; everything else in page.tsx untouched
- [ ] Enrichment is one-shot, capped at 20, zero polling; handles via existing useFeedHandles; market line via existing getMarketLine (no client-side builder, no new ABI fragments)
- [ ] Test pins migrated honestly per D-15 (relocated with same contract + quick-260611-ust comments, never deleted); both gates green; single atomic 8-file commit; no push; web-only
</success_criteria>

<output>
Create `.planning/quick/260611-ust-duels-surface/SUMMARY.md` when done (quick-task summary: what shipped, gate results before/after test counts, commit hash, any deviations — especially what page.tsx looked like at edit time and how parallel-session changes were composed).
</output>
