---
id: quick-260611-5mh-03
phase: quick-260611-5mh
plan: 03
type: execute
wave: 2
depends_on: [quick-260611-5mh-01, quick-260611-5mh-02]
files_modified:
  - apps/web/lib/relayer-client.ts
  - apps/web/app/page.tsx
  - apps/web/components/FeedList.tsx
  - packages/shared/src/share/share-text.ts
  - packages/ui/src/compound/CallCard.tsx
  - packages/ui/src/compound/ProfileHeader.tsx
  - apps/web/app/call/[id]/page.tsx
  - apps/web/app/duel/[challengeId]/page.tsx
  - apps/web/app/duels/page.tsx (new)
  - apps/web/app/components/Sidebar.tsx
  - apps/web/app/not-found.tsx (new)
  - apps/web/lib/leaderboard-client.ts
  - apps/web/app/leaderboard/LeaderboardClient.tsx
  - apps/web/app/components/AppShell.tsx
  - apps/web/app/profile/[address]/** (profile page consuming new payload)
  - apps/web/components/ProfileTabs.tsx
  - apps/web/app/components/SocialLinkControls.tsx
  - apps/web/app/og/[callId]/route.ts
  - apps/web/app/globals.css
  - apps/web + packages/ui colocated tests; visual snapshots ONLY if honestly regenerated
autonomous: true
must_haves:
  truths:
    - "SETTLED tab shows settled calls and LIVE tab excludes them — relayer TitleCase statuses normalized to lowercase canonical ONCE at the relayer-client boundary"
    - "Expired-but-unsettled calls render an amber AWAITING SETTLEMENT tag, never pulsing LIVE + 'Closes in EXPIRED'"
    - "Feed cards, receipt headline, document title, and share text use the enriched marketLine (e.g. 'ETH >= $1,000,000') — never bare 'Call' or 'Price target call #14'; share text never emits @undefined/@0x1234-style handles"
    - "Receipt TARGET values display at 1e8 scale; VERIFIED CRITERIA badge hidden when criteria absent or criteriaHash is the 0x...0001 sentinel; oracle-proof and dispute buttons work or show inline errors — never a silent no-op"
    - "Final positions section renders from GET /api/calls/:id/positions or degrades to hidden"
    - "Duel page: truncated-address fallbacks, zero stats hidden (D-07), 'duel #{id}', ARBITRUM SEPOLIA badge, aligned live-state path"
    - "/duels index page exists with rows linking to /duel/:id, a brutal empty state, and a DUELS sidebar entry"
    - "Branded 404 page; leaderboard sorted rep/settled/wins desc in JS with REP+ACC visible at 375px; search input visibly de-emphasized with SOON tag"
    - "Profile page renders real stats + call history from the enriched profile payload; SocialLinkControls reflects the CURRENT wallet's on-profile link state"
    - "OG settled-loss card shows stake-based P&L (-$5.00), not the -$998,306.55 price-delta; footer domain is the real host; D-04 fonts untouched"
  artifacts:
    - path: "apps/web/app/duels/page.tsx"
      provides: "Duels index page backed by relayer GET /api/duels"
    - path: "apps/web/app/not-found.tsx"
      provides: "Branded 404 server component"
  key_links:
    - from: "apps/web/lib/relayer-client.ts"
      to: "lowercase canonical statuses"
      via: "single normalization at response-parse boundary (wire format unchanged)"
    - from: "apps/web/components/FeedList.tsx"
      to: "item.marketLine (PLAN-01 enrichment)"
      via: "marketLine -> statement -> 'Open Call' fallback chain"
    - from: "apps/web/app/call/[id]/page.tsx fetchFinalPositions"
      to: "GET /api/calls/:id/positions (PLAN-01 A5)"
      via: "fetch wiring + degrade-to-hidden"
    - from: "apps/web/app/og/[callId]/route.ts"
      to: "live-state marketLine + outcome (PLAN-01 A2)"
      via: "card title + stake-based P&L"
---

<objective>
Fix all web presentation defects now that the data layer is real: status normalization (the settled-call-in-LIVE-tab bug), AWAITING SETTLEMENT state, real market-line titles, receipt fixes (1e8 targets, sentinel criteria badge, dead buttons), positions section, duel page polish + new /duels index, branded 404, leaderboard sorting + mobile columns, search de-emphasis, profile history + social-link state, OG card P&L semantics, and the 375px wordmark wrap.

Purpose: After PLAN-01 (relayer enrichment) and PLAN-02 (chain/money correctness), the remaining review findings are presentation truthfulness — cards claiming LIVE on expired calls, settled tabs empty, OG cards showing a -$998,306.55 loss on a $5 stake.
Output: Corrected web presentation across feed, call receipt, duel, leaderboard, profile, OG.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
</execution_context>

<context>
@.planning/quick/260611-5mh-fix-all-site-review-findings/SUMMARY-01.md
@.planning/quick/260611-5mh-fix-all-site-review-findings/SUMMARY-02.md
@apps/web/lib/relayer-client.ts
@apps/web/components/FeedList.tsx
@packages/ui/src/compound/CallCard.tsx
@packages/ui/src/compound/ProfileHeader.tsx
@packages/shared/src/share/share-text.ts
@apps/web/app/og/[callId]/route.ts
</context>

## Wave-2 Preconditions (read first)

This plan runs AFTER PLAN-01 and PLAN-02. Before editing:
1. Read `SUMMARY-01.md` for: the canonical duel-live-state path (C6), the exact enriched field names on feed/live-state (`marketLine`, `assetSymbol`, `targetValue`, real `expiry`), and the positions response shape (C5).
2. Read `SUMMARY-02.md` for: which lines of `apps/web/app/call/[id]/page.tsx` and `apps/web/app/duel/[challengeId]/page.tsx` PLAN-02 already touched (read-hook chainIds, button expiry-gating, FollowFadeModal balance prop) — build on that state, do not revert it. Cited line numbers below are from the pre-PLAN-02 investigation and may have drifted slightly; locate by code shape, not blind line number.

## Verified Live Findings (2026-06-11 — TRUST THESE, do not re-derive)

- Relayer feed returns `status` as TitleCase 'Live'/'Settled' but `apps/web/app/page.tsx:120-121` tab filters compare `item.status === 'settled'` — NEVER matches → settled call shows in LIVE tab, SETTLED tab empty.
- `packages/ui/src/compound/CallCard.tsx:107` — `isLive` stays true after the deadline passes → pulsing LIVE + "Closes in EXPIRED" contradiction. (After PLAN-01, feed expiry is REAL, so cards stop being universally expired.)
- Call #14's `criteriaHash` is literally the sentinel `0x0000...0001` — yet the VERIFIED CRITERIA badge renders.
- "view oracle proof" (~line 1837) + "Dispute this settlement" (~1876) buttons are wired (`handleOpenProvenance` / `setIsDisputeModalOpen`) but appeared dead in live testing — likely silent fetch failure of `/api/settle/:id` leaving no modal, or a modal mount/z-index issue.
- Relayer `GET /api/duels` live response today: `{"duels":[],"count":0,"duelKing":null}`.
- Subgraph `totalCalls` currently DECREMENTS on settle (display-side consistency fix only — DO NOT touch subgraph mappings).
- The Graph `orderBy` is single-field — multi-field sort must happen in JS after fetch.
- OG route footer defaults to 'callitapp.xyz' (NEXT_PUBLIC_BRAND_FOOTER fallbacks ~lines 65, 484, 737); settled CallerLost card renders the PRICE-DELTA as P&L (-$998,306.55 on a $5 stake); formatters at lines 106-141 are already 1e8-correct.
- ProfileHeader renders truncated 0x addresses uppercased ("0X7304..." reads as OX) and avatar initials use the '0' of '0x'.

## Global Constraints (binding)

- **D-15:** never weaken tests to pass — update expectations only where behavior intentionally changed, with honest reasoning in the SUMMARY. If CallCard/AppShell changes break visual baselines, regenerate ONLY the affected snapshots honestly and note it in the SUMMARY.
- **D-07:** degrade-to-hidden (absent data hidden, never zeros/fakes).
- **D-27:** subgraph Studio key stays server-side; no subgraph URLs into client code.
- **D-04 FONT FREEZE:** do NOT touch OG fonts.
- **DO NOT TOUCH:** packages/contracts, packages/subgraph mappings, settlement worker Redis config.
- **Do NOT change the relayer wire format** — status normalization happens on the WEB side only.
- Direct master commit, atomic, ONE commit for this whole plan: `fix(quick-260611-5mh): web presentation — status normalization, market lines, duels index, leaderboard, OG P&L`. ALWAYS check `git status` for the `packages/contracts/lib/openzeppelin-contracts` submodule and NEVER stage it.
- pnpm on Windows via Git Bash (use the Bash tool for pnpm).

<tasks>

<task type="auto">
  <name>Task 1: Status normalization (C1) + titles/marketLine + share-text guards (C3)</name>
  <files>apps/web/lib/relayer-client.ts, apps/web/app/page.tsx, apps/web/components/FeedList.tsx, packages/shared/src/share/share-text.ts, apps/web/app/call/[id]/page.tsx (headline/title/share/header only), colocated tests</files>
  <action>
    **C1 — status normalization:** in `apps/web/lib/relayer-client.ts`, map relayer status ('Live'/'Settled'/'Disputed'/'CallerExited') → lowercase canonical ('live'/'settled'/'disputed'/'callerExited') ONCE at the boundary where feed/live-state responses are parsed. Fix `apps/web/app/page.tsx:120-121` tab filters (the `item.status === 'settled'` never-matches bug). Then sweep ALL web status comparisons (e.g. `apps/web/app/call/[id]/page.tsx` checks like `=== 'Live'`) to the canonical lowercase consistently — grep apps/web for quoted status literals ('Live', 'Settled', 'Disputed', 'CallerExited') and migrate every comparison that consumes relayer-client output. Do NOT change the relayer wire format.

    **C3 — titles:**
    - `apps/web/components/FeedList.tsx:30-38` — marketLine derivation becomes: `item.marketLine` (the new PLAN-01 enriched field) → `item.statement` → 'Open Call'.
    - Receipt headline + document title + share text on `apps/web/app/call/[id]/page.tsx` use the SAME marketLine (no more bare "Call").
    - `packages/shared/src/share/share-text.ts:58` — guard empty/address handles: never emit "@call"/"@undefined"/"@0x1234..."; OMIT the @segment entirely when no real handle exists (truncated addresses are NOT handles). Add unit tests for: real handle, undefined handle, 0x-address handle, empty string.
    - Receipt header: show caller handle + rep fetched from `/api/profile/:caller` (real data after PLAN-01 A3) — degrade-to-hidden per D-07 when absent.
  </action>
  <verify>
    <automated>cd "/c/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/shared build && pnpm --filter @call-it/web build && pnpm --filter @call-it/shared exec vitest run && pnpm --filter @call-it/web exec vitest run</automated>
  </verify>
  <done>Settled calls appear in SETTLED tab and not in LIVE; all status comparisons use lowercase canonical sourced from one boundary mapping; feed/receipt/share use marketLine fallback chain; share text never emits fake handles; tests green.</done>
</task>

<task type="auto">
  <name>Task 2: AWAITING SETTLEMENT (C2) + receipt fixes (C4) + positions wiring (C5)</name>
  <files>packages/ui/src/compound/CallCard.tsx, apps/web/app/call/[id]/page.tsx, colocated tests</files>
  <action>
    **C2 — AWAITING SETTLEMENT state:** `packages/ui/src/compound/CallCard.tsx:107` — `isLive` must be false when the deadline has passed; expired+unsettled renders an amber "AWAITING SETTLEMENT" tag (use existing Tag/pill primitives, accent-warning color) instead of the current pulsing LIVE + "Closes in EXPIRED" contradiction. Mirror the same state on the call/[id] receipt header.

    **C4 — call/[id]/page.tsx:**
    - Any TARGET value display ÷1e8 (NOT 1e6) — consistent with PLAN-02's composer fix; canonical scale per SettlementManager.sol:714.
    - VERIFIED CRITERIA badge (~line 2075): render ONLY when REAL criteria exist — hide when criteriaText is absent OR criteriaHash is the sentinel `0x0000000000000000000000000000000000000000000000000000000000000001` (call #14's criteriaHash is literally that sentinel).
    - "view oracle proof" (~1837) + "Dispute this settlement" (~1876): the handlers (`handleOpenProvenance` / `setIsDisputeModalOpen`) are wired but appeared DEAD in live testing. Investigate the root cause (likely a silent fetch failure of `/api/settle/:id` leaving no modal, or a modal mount/z-index issue), FIX it, AND add loading/error feedback so a failed fetch NEVER yields a silent no-op (inline error text is fine).

    **C5 — positions section:** wire `fetchFinalPositions` (~lines 335-350) to the new `/api/calls/:id/positions` endpoint (PLAN-01 A5 — confirm path + shape from SUMMARY-01) — render the final-positions block, or degrade-to-hidden when empty/unavailable (D-07).

    Respect PLAN-02's edits in this file (chainId hook args, expiry-gated buttons, FollowFadeModal balance prop) — extend, never revert.
  </action>
  <verify>
    <automated>cd "/c/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/ui build && pnpm --filter @call-it/web build && pnpm --filter @call-it/ui exec vitest run && pnpm --filter @call-it/web exec vitest run</automated>
  </verify>
  <done>Expired unsettled cards/receipts show amber AWAITING SETTLEMENT; targets render ÷1e8; criteria badge hidden for sentinel/absent criteria; oracle-proof + dispute actions work with visible loading/error states; positions section renders or hides; tests green.</done>
</task>

<task type="auto">
  <name>Task 3: Duel page polish (C6) + /duels index (C7) + branded 404 (C8)</name>
  <files>apps/web/app/duel/[challengeId]/page.tsx, apps/web/app/duels/page.tsx (new), apps/web/app/components/Sidebar.tsx, apps/web/app/not-found.tsx (new), colocated tests</files>
  <action>
    **C6 — duel page (apps/web/app/duel/[challengeId]/page.tsx):**
    - Handle fallbacks 'caller'/'challenger' (~lines 250,259) → truncated addresses when no handle exists.
    - REP/ACCURACY rendered as zeros → HIDE those stat blocks when 0/absent (D-07; ~lines 853-871 caller side, ~948-965 challenger side).
    - Header 'duel #d/{id}' (~line 660) → 'duel #{id}'.
    - Badge text 'arbitrum' → 'ARBITRUM SEPOLIA'.
    - Align the duel-live-state fetch path (~line 239) with the canonical path PLAN-01 A6 documented in SUMMARY-01.
    - Do not revert PLAN-02's allowance-read chainId edit (~line 417).

    **C7 — NEW /duels index (apps/web/app/duels/page.tsx):** list duels via relayer `GET /api/duels` (live response today: `{"duels":[],"count":0,"duelKing":null}`) with a brutal empty state ("NO DUELS YET — challenge a call to start one."), rows (challenger vs caller, stakes, status) linking to `/duel/:id`. Add a DUELS entry to `apps/web/app/components/Sidebar.tsx` (~lines 74-99 nav arrays, the '// TAPE' section; icon reuse is fine).

    **C8 — apps/web/app/not-found.tsx (new):** branded 404 — app-shell typography/btn classes, copy "NO SUCH CALL ON THE TAPE." + a cream btn link home. Keep it a simple SERVER component consistent with layout fonts (no 'use client', no hooks).
  </action>
  <verify>
    <automated>cd "/c/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/web build && pnpm --filter @call-it/web exec vitest run</automated>
  </verify>
  <done>Duel page shows truncated addresses, hides zero stats, 'duel #{id}', ARBITRUM SEPOLIA badge, fetches the canonical live-state path; /duels lists or shows the empty state with a sidebar entry; branded 404 builds as a server component; tests green.</done>
</task>

<task type="auto">
  <name>Task 4: Leaderboard (C9) + search de-emphasis (C10) + ProfileHeader (C11) + profile page/social link (C12)</name>
  <files>apps/web/lib/leaderboard-client.ts, apps/web/app/leaderboard/LeaderboardClient.tsx, apps/web/app/components/AppShell.tsx, packages/ui/src/compound/ProfileHeader.tsx, packages/ui/src/compound/CallCard.tsx (avatar initials), apps/web/app/profile/[address]/**, apps/web/components/ProfileTabs.tsx, apps/web/app/components/SocialLinkControls.tsx, colocated tests</files>
  <action>
    **C9 — leaderboard:** in `apps/web/lib/leaderboard-client.ts`, AFTER fetch, sort rows in JS: globalRep desc, then settledCalls desc, then wins desc (The Graph orderBy is single-field — do NOT attempt multi-field orderBy in GraphQL). In `apps/web/app/leaderboard/LeaderboardClient.tsx` hero card: accuracy shows "X of N settled" while CALLS shows totalCalls, but subgraph totalCalls currently DECREMENTS on settle — DISPLAY consistency fix only: show a settledCalls-based count or `max(totalCalls, settledCalls)`; label honestly. Mobile 375px: REP + ACC columns MUST stay visible — hide/sacrifice lesser columns or allow horizontal scroll instead.

    **C10 — search input (apps/web/app/components/AppShell.tsx:138-143):** de-emphasize — dimmed/40% opacity treatment, cursor-not-allowed, and a small "SOON" mono tag inside the field; KEEP readOnly and the aria-label.

    **C11 — ProfileHeader + avatar initials:**
    - `packages/ui/src/compound/ProfileHeader.tsx:139`: `overflowWrap: 'anywhere'` → 'break-word'/normal so handles don't wrap mid-word.
    - When the handle is a truncated 0x address, do NOT apply uppercase (currently renders "0X7304..." reading as OX) — conditionally drop textTransform for handles starting '0x'.
    - Avatar initials (`packages/ui/src/compound/CallCard.tsx:132` + the ProfileHeader avatar + any other avatar-initial site — grep packages/ui and apps/web for the initial-derivation pattern): skip the '0x' prefix — use the first character AFTER 0x for addresses, or the first alpha char of real handles. Consider a tiny shared helper inside packages/ui to avoid three divergent copies.

    **C12 — profile page (apps/web/app/profile/[address]/ + ProfileTabs):** consume the enriched profile payload (real globalRep/totalCalls/settledCalls/wins + the `calls` history array from PLAN-01 A3 — shape in SUMMARY-01): render a call-history list (marketLine/statement, status, outcome tag, stake, date, link to /call/:id) replacing the perpetual "NO CALLS ON RECORD YET" when history exists; keep degrade-to-hidden when truly empty (D-07). Settings `apps/web/app/components/SocialLinkControls.tsx`: linked-state must reflect the CURRENT wallet's profile state (`GET /api/profile/:address` → twitterHandle), not only Privy linkedAccounts — when Privy says linked but the current wallet's profile has no twitterHandle, show a "Linked to a different wallet — link to this wallet" action that triggers the EXISTING `POST /api/social/link` flow for the current address. Do not regress the existing working link flow (it linked @woshvad successfully).
  </action>
  <verify>
    <automated>cd "/c/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/ui build && pnpm --filter @call-it/web build && pnpm --filter @call-it/ui exec vitest run && pnpm --filter @call-it/web exec vitest run</automated>
  </verify>
  <done>Leaderboard multi-key sorted in JS with honest call counts and REP+ACC visible at 375px; search visibly inert with SOON tag; handles never wrap mid-word nor render 0X-uppercased; avatar initials skip 0x; profile shows real stats + history; social-link state is wallet-accurate with a relink path; tests green.</done>
</task>

<task type="auto">
  <name>Task 5: OG card P&L + domain + title (C13), wordmark nowrap (C14), final verification</name>
  <files>apps/web/app/og/[callId]/route.ts, apps/web/app/globals.css, colocated tests, affected visual snapshots only</files>
  <action>
    **C13 — OG route (apps/web/app/og/[callId]/route.ts):**
    - Footer domain: replace the 'callitapp.xyz' default (NEXT_PUBLIC_BRAND_FOOTER fallbacks ~lines 65, 484, 737) — prefer deriving from the incoming request URL host, fallback literal 'call-it-web-sepolia.vercel.app'.
    - P&L semantics on settled cards: for CallerLost show STAKE-BASED P&L (−stake → "−$5.00"), NOT the price-delta (current card renders −$998,306.55 on a $5 stake). The price-delta may appear as a secondary "MISSED BY $X" line (÷1e8 — the formatters at lines 106-141 are already 1e8-correct).
    - Card title: use the enriched `marketLine` from live-state (PLAN-01 A2; confirm field name in SUMMARY-01) when available; degrade to current behavior otherwise.
    - **D-04 FONT FREEZE: do NOT touch OG fonts** (no changes to font loading, og-fonts.ts, or font files).
    - Relayer responses are consumed by this route — PLAN-01 changes were additive, so existing parsing must keep working; only ADD reads of new fields.

    **C14 — wordmark:** `.brand` in `apps/web/app/globals.css:219-236` — add `white-space: nowrap` so "CALL IT" never wraps next to the hamburger at 375px.

    **Final verification for the whole plan:** run the full web build + vitest. Visual snapshot suites are win32-gated locally — run them (`pnpm --filter @call-it/web exec vitest run` and/or the playwright visual suite) ONLY if baselines are unaffected; if CallCard/AppShell changes break visual baselines, regenerate ONLY the affected snapshots honestly and note exactly which in the SUMMARY (D-15 — no blanket regeneration).
  </action>
  <verify>
    <automated>cd "/c/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/shared build && pnpm --filter @call-it/ui build && pnpm --filter @call-it/web build && pnpm --filter @call-it/web exec vitest run</automated>
  </verify>
  <done>OG settled-loss card shows -$5.00 stake P&L with optional MISSED BY secondary line; footer shows the real host; card title uses marketLine; fonts untouched; wordmark never wraps at 375px; full build + web vitest green; any regenerated snapshots enumerated in SUMMARY.</done>
</task>

</tasks>

<verification>
- Full build chain green: shared, ui, web.
- Web + ui vitest suites pass; no weakened tests (D-15); regenerated visual snapshots (if any) limited to components actually changed and listed in SUMMARY.
- Grep gate: no remaining `=== 'Live'` / `=== 'Settled'` TitleCase comparisons against relayer-client output in apps/web (TitleCase may legitimately remain only inside the relayer-client normalization map itself).
- D-04: `git status` shows no changes to OG font files or og-fonts.ts. D-27: no subgraph URLs added to client code.
- packages/contracts, packages/subgraph mappings, settlement worker Redis config untouched.
</verification>

<success_criteria>
- All 14 review findings (C1-C14) addressed: truthful statuses and settlement states, real market-line titles everywhere, working receipt actions with visible error states, positions rendered, duel page + duels index + 404 shipped, leaderboard/search/profile-header/profile-page corrected, OG P&L honest, wordmark stable at 375px.
- ONE atomic commit: `fix(quick-260611-5mh): web presentation — status normalization, market lines, duels index, leaderboard, OG P&L` — submodule `packages/contracts/lib/openzeppelin-contracts` NOT staged.
</success_criteria>

<output>
Create `.planning/quick/260611-5mh-fix-all-site-review-findings/SUMMARY-03.md` when done. MUST include: which visual snapshots (if any) were regenerated and why, the final canonical duel-live-state path used by the web, and any C4 dead-button root cause found.
</output>
