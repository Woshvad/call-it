---
phase: 07-og-service-final-variants-subgraph-final-mappings
plan: 05
subsystem: web
tags: [web, nextjs-app-router, leaderboard, profile-overview, quote-composer, share-button, subgraph-read, playwright, ui-spec]

# Dependency graph
requires:
  - phase: 07-og-service-final-variants-subgraph-final-mappings
    provides: "07-01 pure share-text builders (twitterIntentUrl/buildShareText) — relocated to @call-it/shared in 07-04, re-exported from apps/web/lib/share-text.ts"
  - phase: 07-og-service-final-variants-subgraph-final-mappings
    provides: "07-02 subgraph Profile.globalRep field (D-06 leaderboard sort source)"
  - phase: 1
    provides: "ProfileHeader/ProfileTabs profile shell; relayer-client getProfile/getMarketLine; @call-it/ui primitives (Card/CallCard/Button/Stamp)"
provides:
  - "NEW /leaderboard route (server-fetch -> client renderer): The Tape title, 7D/30D/ALL-TIME toggle, category chips, #1 Hero card, viewer-row-highlighted table (UI-12/13)"
  - "leaderboard-client.ts getLeaderboard() — Profile.globalRep DESC at read time (D-06); no LeaderboardEntry dependency; Studio key server-side (D-27)"
  - "Profile Overview tab (UI-09): 5-stat row + CATEGORY REPUTATION + RECENT CALLS (filter chips) + MOST FOLLOWED BY + NOTABLE RECEIPTS"
  - "Quote Composer ?quote= mode (UI-26/27): parent context card + thesis-above-buttons composer + Post quote/Cancel CTAs"
  - "Quote success screen (UI-28): stacked thread preview + Share button"
  - "Reusable ShareButton component (SHARE-15) -> twitter.com/intent/tweet via the shared share-text builder"
affects: [07-06-operator-deploy, phase-8-farcaster-mini-app, phase-9-mobile-responsive]

# Tech tracking
tech-stack:
  added: []  # zero new runtime deps — all from @call-it/ui + existing wagmi/RHF/@call-it/shared
  patterns:
    - "Server-fetch page -> client renderer split (leaderboard mirrors profile/[address] page.tsx + ProfileClient.tsx)"
    - "Dedicated lib module (leaderboard-client.ts) instead of overloading relayer-client.ts — avoids Wave-2 file-overlap with Plan 07-03"
    - "Subgraph read sorts Profile.globalRep DESC at READ time (D-06); the requested window is accepted for API parity but all windows return All-time data + a windowedDataAvailable:false flag that drives the visible v1-limitation note"
    - "Two-tier Playwright specs (Tier-1 static source assertions always run / Tier-2 browser tests gated on PLAYWRIGHT_BASE_URL) — mirrors profile-shell.spec.ts + feed-shell.spec.ts; CI-safe without a running server"
    - "Reusable ShareButton renders an anchor with href=twitterIntentUrl(...) so the intent is a real URL (no-JS shareable + assertable) using the canonical @call-it/shared builders the relayer auto-post worker also uses"
    - "Flexbox-only page layouts (no CSS grid anywhere) — consistency with OG + Pitfall 15"

key-files:
  created:
    - apps/web/app/leaderboard/page.tsx
    - apps/web/app/leaderboard/LeaderboardClient.tsx
    - apps/web/lib/leaderboard-client.ts
    - apps/web/app/new/components/QuoteParentCard.tsx
    - apps/web/app/new/components/QuoteSuccess.tsx
    - apps/web/components/ShareButton.tsx
    - apps/web/tests/leaderboard.spec.ts
    - apps/web/tests/profile-overview.spec.ts
    - apps/web/tests/quote-composer.spec.ts
  modified:
    - apps/web/app/profile/[address]/ProfileClient.tsx
    - apps/web/app/new/page.tsx

key-decisions:
  - "Leaderboard data sourced ONLY from subgraph Profile.globalRep (D-06): the All-time board sorts globalRep DESC at read time; the 7D/30D toggles ship wired but are backed by the same All-time data with a visible v1-limitation note. The unpopulated LeaderboardEntry entity is deliberately NOT queried."
  - "getLeaderboard lives in a DEDICATED apps/web/lib/leaderboard-client.ts (not relayer-client.ts) per the plan note to avoid a Wave-2 file-overlap with Plan 07-03. It reads the public Studio query URL (NEXT_PUBLIC_SUBGRAPH_URL) server-side — the privileged Studio key never enters NEXT_PUBLIC_* (D-27, T-07-05-01)."
  - "Quote success screen is gated on the existing usePublishCall step==='success'; the publish hook already redirects to /profile on success in production, so the inline success screen is the dogfood/preview path. The quote_stance write stays keyed to the on-chain CallQuoted event (existing route, unchanged)."
  - "Profile Overview 5-stat row renders Accuracy (derived wins/settledCalls) + Streak from the live relayer ProfileResponse; Calibration/ROI/Contrarian-hits show a safe em-dash until those aggregates are surfaced by the relayer (documented stub). RECENT CALLS / MOST FOLLOWED BY / NOTABLE RECEIPTS render their UI-SPEC empty states (hydrated client-side post-deploy, D-04)."
  - "ShareButton placed in apps/web/components/ (not new/) so the receipt + profile pages can reuse the same affordance — it takes receiptUrl + outcomeWord + handle + optional statement and produces the Twitter intent."

patterns-established:
  - "Public read surface (leaderboard/profile) carries no session; reads the public Studio query URL server-side; the privileged key stays relayer-side (D-27)"
  - "Two-tier (source-assertion + browser) Playwright specs keep UI verification CI-safe while leaving deploy-time hydration to the operator gate (D-04, Plan 07-06)"

requirements-completed: [UI-09, UI-12, UI-13, UI-26, UI-27, UI-28, SHARE-15]

# Metrics
duration: ~12min
completed: 2026-06-07
---

# Phase 7 Plan 05: Share-Loop Surfaces (Leaderboard / Profile Overview / Quote Composer) Summary

**The three net-new/built-out share-loop surfaces that close critical-path step 10 (new user loops back) at the UI layer: a NEW /leaderboard ("The Tape") sorted from subgraph `Profile.globalRep` at read time with the #1 Hero card + viewer-row-highlighted table (UI-12/13, D-06 — windowed toggles wired but All-time-backed with a documented limitation, no `LeaderboardEntry` dependency), the built-out Profile Overview tab (5-stat row + CATEGORY REPUTATION + RECENT CALLS + MOST FOLLOWED BY + NOTABLE RECEIPTS, UI-09), and the Quote Composer `?quote=` mode (parent context card + thesis-above-buttons + success thread, UI-26/27/28) with a reusable Twitter-intent Share button (SHARE-15) — all from `@call-it/ui` primitives, flexbox-only, with CI-safe two-tier Playwright specs.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-06-07
- **Tasks:** 2 (both `type="auto"`)
- **Files:** 11 (9 created, 2 modified)

## Accomplishments

### Task 1 — Leaderboard (UI-12/13, D-06) + Profile Overview tab (UI-09) — commit `2a54836`

- **`/leaderboard` route** — Server Component `page.tsx` (`try data = await getLeaderboard('all') catch fetchError`) → `LeaderboardClient` renderer, mirroring the `profile/[address]` server-fetch→client split.
- **`leaderboard-client.ts getLeaderboard()`** — queries the subgraph `profiles(orderBy: globalRep, orderDirection: desc, where: { globalRep_gt: 0 })`, maps to ranked rows with a resolved handle (handle → displayHandle → truncated address). The `window` arg is accepted for API parity but ALL windows return the same All-time `globalRep` rows + `windowedDataAvailable: false` (D-06). **No `LeaderboardEntry` query.** Reads the public `NEXT_PUBLIC_SUBGRAPH_URL` server-side; the privileged Studio key never enters the bundle (D-27).
- **`LeaderboardClient.tsx`** — "The Tape" (Syne 28px) + "Top of book" subtitle; 7D/30D/ALL-TIME segmented toggle (active = accent); category chips All/Majors/DeFi/Other (active = accent); a visible **D-06 v1-limitation note** when off ALL-TIME; the **#1 Hero `<Card accent>`** with a giant low-opacity (0.08) accent "01" Syne watermark behind content (UI-12); a table on `brand-surface` with rank+rep in mono bold, handle in mono, and the **viewer's own row highlighted** with an accent left border + `#1A1A24` bg (UI-13, via `useAccount()`). Empty state "Nothing on the tape yet" + error state "Couldn't load the tape…" per the UI-SPEC copy tables.
- **Profile Overview tab** (built into `ProfileClient.tsx`) — a flex 5-stat row (Accuracy/Calibration/ROI/Contrarian hits/Streak — labels `text-xs brand-muted`, values mono bold); CATEGORY REPUTATION (3 `<Card>`s in a flex row, NOT grid); RECENT CALLS (`CallCard` list + All/Open/Settled filter chips, active=accent) with the "No calls yet" empty state; MOST FOLLOWED BY ("No followers yet"); NOTABLE RECEIPTS ("No receipts yet"). Flexbox-only.

### Task 2 — Quote Composer + success (UI-26/27/28) + Share button (SHARE-15) — commit `3ae8b29`

- **`/new?quote=` mode** in `new/page.tsx` — a "Quote this call" heading, the read-only **`QuoteParentCard`** (QUOTING label + parent statement in italic Syne 20px + "view original" link, **NO corner brackets** per UI-26; fetches the statement via `getMarketLine`, falls back to `Call #N`, and renders the "Call unavailable" empty state on fetch failure), the **YOUR THESIS textarea ABOVE the MarketTypeSwitcher** (UI-27 — verified by source order), the full call sub-form below, and `Post quote` (accent) + `Cancel` (ghost) CTAs. The quote-submit error state uses the UI-SPEC copy.
- **`QuoteSuccess`** (UI-28) — "Quote posted" heading + a **stacked thread preview** (the `QuoteParentCard` + the user's quote `<Card accent>`) + the Share affordance. Shown when `usePublishCall` reports `step === 'success'`.
- **`ShareButton`** (SHARE-15, `apps/web/components/`) — a reusable anchor whose `href = twitterIntentUrl(receiptUrl, buildShareText({ outcomeWord, handle, statement }))` from the shared `share-text.ts` (the same canonical `@call-it/shared` builders the relayer auto-post worker uses). Renders the accent CTA treatment; reusable by the receipt/profile pages.
- The quote stance continues to persist via the existing `quote_stance` route (keyed to the on-chain `CallQuoted` event) — unchanged.

## Verification Results

- `pnpm --filter @call-it/web build` — exits 0 (both tasks); `/leaderboard` route registered in the build manifest.
- `pnpm --filter @call-it/web exec playwright test leaderboard.spec.ts profile-overview.spec.ts quote-composer.spec.ts --reporter=line` — **18 passed / 3 skipped (Tier-2, no server) / 0 failed**.
  - leaderboard.spec.ts: 8 Tier-1 (server-component+getLeaderboard, globalRep sort + no LeaderboardEntry, viewer-row highlight #1A1A24, #1 Hero accent+"01", D-06 note, title/toggle/chips, D-27 no Studio key, no grid).
  - profile-overview.spec.ts: 5 Tier-1 (UI primitives, 5 named stats, 4 section headings, empty-state copy, no grid).
  - quote-composer.spec.ts: 5 Tier-1 (thesis-before-switcher source order, parent card QUOTING/view-original/no-brackets/empty-state, success thread + ShareButton, ShareButton twitterIntentUrl/buildShareText, no grid).
- Grep: no `display:'grid'` in any new `apps/web/app/**/*.tsx`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Quote success screen gated on usePublishCall step, not a publish() return value**
- **Found during:** Task 2.
- **Issue:** The plan implied capturing the new quote-call id from the submit result, but `usePublishCall.publish()` returns `Promise<void>` and already `router.push('/profile/...')`es on success — there is no callId to read.
- **Fix:** Gate the inline `QuoteSuccess` on the hook's `step === 'success'` and anchor the success thread on the parent call id (the quote_stance write remains keyed to the on-chain CallQuoted event). The inline success screen is the dogfood/preview path; production redirects as before.
- **Files:** `apps/web/app/new/page.tsx`.
- **Commit:** `3ae8b29`.

**2. [Rule 1 - Bug] Tightened my own leaderboard test's LeaderboardEntry assertion**
- **Found during:** Task 1 verification (the first spec run failed Test 2).
- **Issue:** A literal `expect(source).not.toContain('LeaderboardEntry')` tripped on the source file's documentation comment, which legitimately NAMES the entity to explain the deliberate non-dependency.
- **Fix:** Assert no GraphQL query against it instead — `not.toMatch(/leaderboardEntr(y|ies)\s*\(/i)` + `not.toContain('leaderboardEntries(')`. The D-06 intent (don't depend on the unpopulated entity) is preserved; the false positive on the explanatory comment is removed.
- **Files:** `apps/web/tests/leaderboard.spec.ts`.
- **Commit:** `2a54836`.

### Additive (Rule 2)

- **Removed the unused `Stamp` import** from `ProfileClient.tsx` (NOTABLE RECEIPTS renders its empty state in v1, so `Stamp` isn't yet referenced) to keep the build/lint clean. When receipts data lands, `Stamp` re-enters with the trophy cards.

**Total deviations:** 2 auto-fixed (1 blocking, 1 test bug) + 1 additive. **Impact:** none change scope or the UI-SPEC contract.

## Authentication Gates

None encountered. The leaderboard/profile reads are public (no session, D-04 boundary); the quote submit reuses the existing Privy-gated publish flow unchanged.

## Known Stubs

- **Profile Overview — Calibration / ROI / Contrarian hits** render a safe em-dash because the relayer `ProfileResponse` does not yet surface those aggregates (Accuracy + Streak ARE wired from the live response). Not blocking the UI-09 goal (the 5-stat row renders with the named labels per UI-SPEC); the values hydrate when the relayer adds the fields.
- **Profile Overview — RECENT CALLS / MOST FOLLOWED BY / NOTABLE RECEIPTS** render their documented UI-SPEC empty states; the lists are hydrated client-side post-deploy (D-04 / Plan 07-06). The empty-state copy is the intended v1 state for a caller with no data, so this is correct behavior, not a blocking stub.
- **Leaderboard 7D/30D windows** intentionally serve All-time `globalRep` data with a visible v1-limitation note (D-06) — a documented, intended limitation, not a defect.

## Threat Surface Scan

All surfaces are within the plan `<threat_model>`:

- **T-07-05-01** (Studio key in frontend bundle) — mitigated: `getLeaderboard` reads `NEXT_PUBLIC_SUBGRAPH_URL` server-side from the Leaderboard Server Component; no `SUBGRAPH_STUDIO_API_KEY` anywhere in the new sources (asserted by leaderboard.spec Test 7).
- **T-07-05-02** (CORS `*` exposing the relayer) — unchanged: pages assume the deploy-time origin allowlist (D-04, Plan 07-06); no `*` introduced here.
- **T-07-05-03** (untrusted statement in quote/share render) — mitigated: the statement is treated as text and URL-encoded by the pure `buildShareText`/`twitterIntentUrl` builders; the parent statement renders as React text (auto-escaped).
- **T-07-05-SC** (npm installs) — holds: zero new packages (all primitives from `@call-it/ui`, builders from `@call-it/shared`, tests from existing Playwright).

No new network endpoints, auth paths, or trust boundaries beyond the plan threat model.

## Next Phase Readiness

- **07-06 (operator deploy)** verifies the D-04 cross-origin hydration of the leaderboard/profile/quote surfaces against the deployed Sepolia relayer + the published subgraph (`Profile.globalRep`), and applies any pending relayer migration.
- The reusable `ShareButton` is ready for the receipt + profile pages to adopt the same affordance.
- Profile Overview Calibration/ROI/Contrarian-hits + the RECENT CALLS/followers/receipts lists activate when the relayer surfaces those aggregates (no UI change required beyond swapping the em-dash/empty-state for live data).

---
*Phase: 07-og-service-final-variants-subgraph-final-mappings*
*Completed: 2026-06-07*

## Self-Check: PASSED

- [x] `apps/web/app/leaderboard/page.tsx` exists on disk
- [x] `apps/web/app/leaderboard/LeaderboardClient.tsx` exists on disk
- [x] `apps/web/lib/leaderboard-client.ts` exists on disk
- [x] `apps/web/app/new/components/QuoteParentCard.tsx` exists on disk
- [x] `apps/web/app/new/components/QuoteSuccess.tsx` exists on disk
- [x] `apps/web/components/ShareButton.tsx` exists on disk
- [x] `apps/web/tests/{leaderboard,profile-overview,quote-composer}.spec.ts` exist on disk
- [x] Commit `2a54836` (Task 1) exists in git log
- [x] Commit `3ae8b29` (Task 2) exists in git log
- [x] `@call-it/web build` exits 0; leaderboard route registered
- [x] All three specs: 18 passed / 3 skipped (Tier-2) / 0 failed
- [x] No `display:'grid'` in any new apps/web/app source (flexbox only)
