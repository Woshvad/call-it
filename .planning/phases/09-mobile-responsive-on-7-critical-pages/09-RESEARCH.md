# Phase 9: Mobile responsive on 7 critical pages - Research

**Researched:** 2026-06-09 (force-refresh re-research; supersedes earlier 09-RESEARCH.md)
**Domain:** Responsive retrofit of an inline-style Next.js 16 App Router frontend (no Tailwind layout utilities, no CSS media queries in components) via a `useIsMobile()` JS hook
**Confidence:** HIGH (all page/file/line claims verified against live code this session)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Responsiveness via a **`useIsMobile()` client hook + conditional inline style objects** (`isMobile ? mobileStyle : desktopStyle`). Rejected: `@media` in `globals.css` (needs `!important`); full Tailwind migration (rewrite risk).
- **D-02:** **Mobile-first first paint.** Hook defaults to `isMobile = true` so SSR/first paint renders mobile and only widens to desktop on the client. Serves the SC3 share-visitor (almost always on a phone).
- **D-03:** **44×44px touch targets enforced at the mobile breakpoint only** (`isMobile`). Desktop keeps current dense neobrutalist density.
- **D-04:** **Reach = the 7 pages PLUS the modals/shared components they render at 375px.** In scope: Follow/Fade/CallerExit/PositionExit modals, `ChallengeFormModal`, dispute/provenance modals, and `@call-it/ui` pieces (`CallCard`, `Receipt`, `ProfileHeader`) where a critical page shows them.
- **D-05:** **Add a hamburger drawer** (mobile only) on the left of `GlobalNav`. No left sidebar exists today. Desktop nav unchanged.
- **D-06:** Drawer = **auth-aware destinations** (Feed, Leaderboard, Profile, New Call, Sign in / Sign out; New Call + Profile gated to authenticated). **Notification bell stays pinned in the top bar** on mobile.
- **D-07:** Hamburger **stays active on the 3 desktop-only-banner pages** (satisfies SC2 "banner does not block return navigation or sign-out").
- **D-08:** **Warn but allow use.** On Duel/New Call (and resolved Quote surface), at mobile width show the banner at top with the non-responsive page still rendering/interactive below. Non-blocking.
- **D-09:** Banner is **dismissible for the session**. Copy: "Best viewed on desktop" + subtext + `[×]`. Neobrutalist styling.
- **D-10:** **Hybrid validation.** (a) Automated Playwright responsive specs at 375px + 390px (no horizontal scroll, single-column, ≥44px touch targets, outcome-word legibility). (b) Operator human-verify checkpoint on real iPhone (Safari) + Android (Chrome) for the SC3 share→receipt flow.
- **D-11:** **BOTH are hard gates** — Playwright suite AND operator real-device sign-off must pass before Phase 9 is complete.

### Claude's Discretion
- Exact `isMobile` threshold — single breakpoint (`< 768px` ⇒ mobile) unless research surfaces a reason for a tablet tier; tablet falls into desktop bucket.
- Per-page layout restructuring details (how each two-column `flexDirection:'row'` block stacks; where full-width buttons apply).
- Reuse existing `NotificationInbox` slide-over/overlay pattern for the drawer; close on link-tap / backdrop / Esc.
- One shared `<DesktopOnlyBanner>` reused across banner pages, rendered only when `isMobile`, pushing content (not overlaying).
- Hook implementation detail (`matchMedia` + `useSyncExternalStore` vs `useState`/resize listener) — pick the SSR-safe option honoring the D-02 mobile-first default.

### Deferred Ideas (OUT OF SCOPE)
- Full responsive pass on the 3 non-critical pages (Duel, Quote, New Call) — v1.1+. Phase 9 ships only the banner for them.
- Tablet-specific (768–1024px) layout tier — collapses into desktop bucket for v1.
- Migrating inline-style architecture to Tailwind — rejected for this phase (regression risk).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UI-48 | 375px breakpoint on 7 critical pages — Feed, Live Receipt, Profile, Settled Receipt, Sign-in, Onboarding, Leaderboard (§19 Phase 9) | Verified file/line shapes of all 7 pages + 5 onboarding subroutes (Per-Page Layout Inventory); `useIsMobile()` hook pattern (Code Examples); container-clamp + row→column stacking pattern. |
| UI-49 | Single-column layouts, full-width action buttons, left sidebar collapsed behind hamburger (§19 Phase 9) | GlobalNav has no sidebar today — hamburger is additive (D-05); `NotificationInbox` slide-over is the exact mirror pattern (verified, full source read); per-page button-stack targets identified. |
| UI-50 | Non-critical pages (Duel, Quote composer, New Call) get desktop-only banner "Best viewed on desktop" (§19 Phase 9) | Quote composer resolved: it is the `?quote=` mode of `app/new/page.tsx`, NOT a standalone route → banner mounts on exactly **2 files** (`/new`, `/duel/[challengeId]`). |
</phase_requirements>

## Summary

This is a **responsive retrofit**, not a greenfield design — the neobrutalist system (§14.6) is shipped and LOCKED, and an approved 09-UI-SPEC.md already specifies the per-page mobile adaptation layer. My job here is to (1) re-verify the live code against that spec, (2) surface the SSR-safe hook implementation, and (3) flag every place where the live code materially diverges from the approved UI-SPEC so the planner can reconcile the three documents (CONTEXT + UI-SPEC + RESEARCH).

The central constraint holds: the **7 critical pages are styled with inline `style={{}}` objects** for all *layout* (widths, `flexDirection`, gaps, button widths). Inline styles cannot carry `@media`, so D-01's `useIsMobile()` JS hook is the correct mechanism. **However, the "zero Tailwind utility classes" claim is not literally true** — two of the real critical-page client surfaces (`ProfileClient.tsx`, `LeaderboardClient.tsx`) mix Tailwind **typography** classes (`font-mono`, `text-xs`, `text-brand-muted`, `uppercase`, `tracking-wide`) with inline layout styles. Crucially, **none of those classNames are layout or responsive (`sm:`/`md:`/`lg:`) variants** — so D-01's hook still governs all responsive layout; the planner just needs to know the typography lives in classNames on those two files.

**Primary recommendation:** Build a single SSR-safe `useIsMobile()` hook in `apps/web/app/hooks/` using `useSyncExternalStore` with a server snapshot of `true` (D-02), then apply the per-page `isMobile ? mobile : desktop` style swaps exactly as the approved UI-SPEC specifies — with three reconciliations noted below (Leaderboard column count, CallerExit/PositionExit modals already clamped, signin frame width).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Breakpoint detection (`isMobile`) | Browser / Client | — | `matchMedia` is a browser API; `'use client'` hook. Must NOT live in `packages/ui` (would pull `matchMedia` into the Satori/OG build — Pitfall 2). |
| Mobile layout stacking (row→column, full-width buttons) | Browser / Client (page components) | — | All layout is inline `style={{}}` on `'use client'` pages; swapped conditionally on `isMobile`. |
| First-paint layout (SSR snapshot = mobile) | Frontend Server (SSR) | Browser | `layout.tsx` is a Server Component with `dynamic='force-dynamic'`; the server renders the client tree once. D-02 mobile-first default lives in the hook's server snapshot. |
| Hamburger drawer + nav | Browser / Client | — | New `MobileDrawer.tsx` + `GlobalNav` edit; auth state via Privy client hooks. |
| Desktop-only banner | Browser / Client | — | Conditional render on `isMobile`, per-session dismiss via `useState`. |
| OG card rendering (200px legibility) | API / Backend (Satori) | — | Out of scope for layout edits — OG path is separate; only the regression guard touches it. |
| Responsive verification | Build / CI (Playwright) | Operator (manual) | D-10 hybrid: headless Chromium viewport specs + real-device operator sign-off. |

## Divergence from approved UI-SPEC / CONTEXT (PLANNER MUST RECONCILE)

These are places where my live-code verification differs from claims in 09-UI-SPEC.md or 09-CONTEXT.md. None invalidate the locked decisions (D-01..D-11); they correct factual layout details the planner will otherwise plan around incorrectly.

1. **Leaderboard is a 4-column row in live code, NOT the 6-column table the UI-SPEC describes.** `[VERIFIED: apps/web/app/leaderboard/LeaderboardClient.tsx:220-279]`
   - UI-SPEC §"5. Leaderboard" says the desktop table has `# / CALLER / REP / ACC / BEST category / Δ7D sparkline` (lines 218–276) and instructs dropping `ACC`, `BEST`, and the sparkline at mobile.
   - **Live code has only 4 cells:** `#` (`width:48px`) · `Caller` (`flex:1`) · `Rep` (`width:80px`) · `Calls` (`width:72px`). There is **no `ACC`, no `BEST category`, no `Δ7D sparkline` column** in `LeaderboardTableRow` (lines 247–282) or the header (lines 220–223). UI-13 in REQUIREMENTS.md still *specifies* those columns, but they were not implemented in the shipped surface.
   - **Reconciliation for planner:** The mobile task should clamp the existing 4-column row to fit 343px (48 + flex + 80 + 72 = ~200px of fixed width + flex; this already fits 343px without dropping columns). The "drop ACC/BEST/sparkline" instruction is **moot** — those columns do not exist. Keep the row as `flexDirection:'row'`, ensure each row ≥44px tall (it's an `<a>` to `/profile/{addr}`), and **preserve the viewer-row accent** (`borderLeft: 3px solid #E8F542` + `backgroundColor: #1A1A24`, lines 257–258) through the mobile path. Do NOT introduce `display:grid`.

2. **`CallerExitModal` and `PositionExitModal` ALREADY have the `calc(100vw - 32px)` clamp.** `[VERIFIED: packages/ui/src/compound/CallerExitModal.tsx:110; PositionExitModal.tsx:103; FollowFadeModal.tsx:185]`
   - UI-SPEC's modal table says to "Add the `calc(100vw - 32px)` clamp" to CallerExit/PositionExit. Live code already has it on all three. **Reconciliation:** these three modals need only a *verification* task (confirm internal `flexDirection:'row'` button rows stack and buttons are ≥44px tall), not a clamp-add. Real clamp-add work is needed only on the inline `ProvenanceModal` (560px, overflows — `call/[id]/page.tsx:818`) and possibly `DisputeModal` (480px, `call/[id]/page.tsx:600`) and `ChallengeFormModal` (480px panel, `ChallengeFormModal.tsx:337`).

3. **Sign-in inner column is `maxWidth:400px`, not 480px.** `[VERIFIED: apps/web/app/signin/page.tsx:168]`
   - UI-SPEC §"6. Sign-in" and UI-24 reference a 480px frame; live code's centered button column is `maxWidth:400px`. The 480px likely refers to the corner-bracket frame (UI-24, not yet implemented per REQUIREMENTS.md UI-24 = Pending). **Reconciliation:** at 375px, 400px already overflows by 25px — clamp the column to `maxWidth:'calc(100vw - 32px)'` at mobile. The 480px corner-bracket frame is a *separate unbuilt requirement* (UI-24); do not assume it exists.

4. **"Zero Tailwind utility classes in `apps/web/app`" is inaccurate.** `[VERIFIED: 212 className= occurrences; ProfileClient.tsx:125-238, LeaderboardClient.tsx:78-279]`
   - The claim holds for the 4 pure-inline pages (`page.tsx`, `call/[id]/page.tsx`, `signin/*`, `onboarding/*`) but NOT for `ProfileClient.tsx` (11 classNames) and `LeaderboardClient.tsx` (18 classNames). The classes are **typography only** (`font-mono`, `font-display`, `text-xs`, `text-brand-muted`, `uppercase`, `tracking-wide`) and **layout stays inline**. **Reconciliation:** D-01's hook is still correct for all responsive *layout*. Do not touch the typography classNames; swap only the inline layout styles on these two files. There are also Tailwind-heavy files in `app/new/components/*` and `app/dev/design-system` — both OUT of the critical-7 scope (new/ gets a banner; dev/ is internal).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | `16.2.6` (App Router) | Frontend framework; `force-dynamic` SSR | Already in repo; layout.tsx is a Server Component rendering the client tree once. `[CITED: CLAUDE.md stack table]` |
| React | `19.x` | Components + `useSyncExternalStore` for the SSR-safe hook | Bundled with Next 16; `useSyncExternalStore` ships with React 18+ and has a dedicated server-snapshot arg designed for exactly this. `[VERIFIED: react docs — useSyncExternalStore]` |
| @playwright/test | `1.60` (in repo) | Mechanical responsive gate (D-10a) | Already in `apps/web` (`playwright.config.ts`); `testMatch: ['**/*.spec.ts']` auto-picks up `responsive.spec.ts`. `[VERIFIED: apps/web/playwright.config.ts]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@privy-io/react-auth` | `3.27.0` | `usePrivy()` for drawer auth-state (`authenticated`, `ready`, `logout`) | Drawer destination gating (D-06) + Sign out. Mirror `NotificationInbox` usage. `[VERIFIED: NotificationInbox.tsx:28]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `useSyncExternalStore` hook | `useState` + `useEffect` resize listener | Works, but two pitfalls: (1) initial `useState(true)` then a `useEffect` flip causes the same one reflow but with a higher risk of hydration warnings if the initial state is read from `window`; (2) you must debounce resize. `useSyncExternalStore` is purpose-built with a `getServerSnapshot` arg → cleaner D-02 compliance, no hydration mismatch. **Recommend `useSyncExternalStore`.** |
| `useSyncExternalStore` | `@media` CSS + `!important` | Rejected by D-01 — inline styles win specificity, would need `!important` everywhere. |
| JS hook | Full Tailwind migration | Rejected by D-01/Deferred — 2000+-line file rewrite, desktop-regression risk. |

**Installation:** None. This phase adds **zero new runtime dependencies** — React 19, Next 16, Privy, and `@playwright/test` are all already in the repo.

## Package Legitimacy Audit

> Not applicable — Phase 9 installs **no external packages**. All capabilities use libraries already present in the repo (`react@19`, `next@16.2.6`, `@privy-io/react-auth@3.27.0`, `@playwright/test@1.60`). Registry vetting gate is moot. `[VERIFIED: 09-UI-SPEC.md Registry Safety section; no new deps in any plan]`

## Architecture Patterns

### System Architecture Diagram

```
                         RootLayout (Server Component, force-dynamic)
                                    │  renders client tree once (SSR snapshot)
                                    ▼
                         <ClientProviders>  (Privy + wagmi + react-query)
                                    │
                    ┌───────────────┴────────────────┐
                    ▼                                 ▼
              <GlobalNav>  (client)            {children}  (the page)
                    │                                 │
        ┌───────────┼───────────┐                    │
        ▼           ▼           ▼                     ▼
   [hamburger]  wordmark   NotificationBell    useIsMobile()  ──► isMobile (bool)
   (mobile only)            (stays in bar)            │
        │                                             ▼
        ▼                              isMobile ? mobileStyle : desktopStyle
   <MobileDrawer>                      applied to every layout style{{}} on page
   (mirrors NotificationInbox              │
    slide-over, LEFT side)                 ▼
        │                       ┌──────────┴───────────┐
        ▼                       ▼                      ▼
   backdrop + panel       7 critical pages       3 banner pages (new, duel)
   close: Esc/backdrop/    (stack to 1 col,      <DesktopOnlyBanner> at top
   link-tap                full-width btns,      (isMobile && !dismissed),
                           ≥44px targets)        page renders interactive below

   useIsMobile() store:
     getSnapshot()        → matchMedia('(max-width: 767px)').matches   (client)
     getServerSnapshot()  → true   (D-02 mobile-first first paint)
     subscribe(cb)        → mql.addEventListener('change', cb)
```

### Pattern 1: SSR-safe `useIsMobile()` with `useSyncExternalStore`
**What:** A `'use client'` hook returning `isMobile`, defaulting to `true` on the server/first-paint snapshot (D-02), converging to the real `matchMedia` value after mount.
**When to use:** Every critical page, the drawer trigger in GlobalNav, and the banner mount condition.
**Example:**
```typescript
// apps/web/app/hooks/useIsMobile.ts  — lives in apps/web ONLY, never packages/ui (Pitfall 2)
// Source pattern: React useSyncExternalStore docs (server-snapshot arg) [CITED: react.dev/reference/react/useSyncExternalStore]
'use client';
import { useSyncExternalStore } from 'react';

const QUERY = '(max-width: 767px)'; // < 768px ⇒ mobile (Claude's-discretion single breakpoint)

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getSnapshot(): boolean {
  // client value — real viewport
  return typeof window !== 'undefined' && !!window.matchMedia
    ? window.matchMedia(QUERY).matches
    : true;
}

function getServerSnapshot(): boolean {
  return true; // D-02: mobile-first first paint (server + hydration baseline)
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```
**Why this is hydration-safe:** React uses `getServerSnapshot()` for the SSR HTML *and* for the first client render (the hydration pass), so server and client markup match → no hydration warning. After hydration commits, React reads `getSnapshot()` and, if the desktop viewport disagrees, re-renders once (the "one quiet reflow" D-02 accepts). This is the documented, intended use of the third argument.

### Pattern 2: Per-page container clamp + row→column stack
**What:** Each critical page wraps content in a container whose fixed `maxWidth` (680/760/1024px) is overridden at mobile to `width:'100%'` + `padding:'0 16px'`, and every `flexDirection:'row'` block flips to `'column'`.
**Example:**
```typescript
// Inside a 'use client' page:
const isMobile = useIsMobile();
const container = isMobile
  ? { width: '100%', padding: '0 16px', maxWidth: '100%', margin: '0 auto' }
  : { maxWidth: '1024px', margin: '0 auto', padding: '32px 24px' }; // existing desktop
// ...
<div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '12px' }}>
```

### Pattern 3: MobileDrawer mirroring NotificationInbox
**What:** New `apps/web/app/components/MobileDrawer.tsx` that is a structural mirror of `NotificationInbox.tsx` but anchored LEFT.
**Verified reference values to mirror** `[VERIFIED: NotificationInbox.tsx:236-265, 169-175, 215-222]`:
- Backdrop: `position:'fixed', inset:0, zIndex:50, background:'rgba(9,9,14,0.6)'`, `onClick` closes if click is outside panel ref.
- Panel: `position:'fixed', top:0, height:'100vh'` — change `right:0`→`left:0`, `width:380`→`'min(300px,85vw)'`, `boxShadow:'-4px 0 0 0 #E8F542'`→`'4px 0 0 0 #E8F542'`, `border:'3px solid #E8F542'` with `borderLeft`/`borderRight` adjusted so only the inner edge shows accent.
- Esc-to-close: `useEffect` adding `keydown` listener for `e.key === 'Escape'` → `onClose()` (copy verbatim from lines 169-175).
- Close on link-tap: each `<Link onClick={onClose}>`.

### Anti-Patterns to Avoid
- **Putting `useIsMobile` / `matchMedia` in `packages/ui`** — pulls a browser API into the Satori/OG (`@vercel/og`) build path which runs in a Node/serverless context. Hook lives in `apps/web` only. `[VERIFIED: 09-UI-SPEC.md Pitfall 2; matchMedia not present anywhere in packages/ui (grep)]`
- **`display: grid`** — banned project-wide (Pitfall 15, Satori OG cards don't support grid; `quote-composer.spec.ts:83-84` actively asserts no grid). All stacking is `flexDirection:'row'`→`'column'`. The Settled-receipt 2×2 stat layout must use `flexWrap:'wrap'` + `flex:'1 1 45%'`, NOT grid.
- **Reading `window` during render to seed `useState`** — causes hydration mismatch under `force-dynamic`. Use `useSyncExternalStore`'s server snapshot instead.
- **Editing shared `@call-it/ui` internals for mobile** — they feed the OG/Satori path; wrap at the page level or pass mobile styles via props (D-04 note, UI-SPEC modal table).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSR-safe viewport detection | Custom `useState`+resize+debounce with manual hydration guards | React `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)` | Purpose-built server-snapshot arg eliminates hydration-mismatch boilerplate. `[CITED: react.dev]` |
| Slide-over drawer (backdrop, fixed panel, Esc/backdrop/link close) | New overlay from scratch | Mirror `NotificationInbox.tsx` (full working pattern, verified) | Already battle-tested in repo; same z-index/backdrop tokens; consistent UX. |
| Media-query string parsing | Manual `window.innerWidth` math | `window.matchMedia('(max-width: 767px)')` | Native, event-driven (no resize polling), matches CSS semantics. |
| Outcome-word legibility gate | Eyeballing | Playwright bounding-box assertion (`right <= innerWidth`, `fontSize >= 36`) + `data-outcome-word` hook | Repeatable mechanical gate per D-10a. |

**Key insight:** Almost everything this phase needs already exists in the repo (the slide-over pattern, the inline-style register, Playwright infra). The only genuinely new primitive is the hook, and React ships the exact tool for it.

## Per-Page Layout Inventory (VERIFIED against live code)

> The planner needs the real layout shape of each surface. All line numbers verified this session. **Where the real client surface differs from the route `page.tsx`, the real surface is named.**

### 1. Feed — `apps/web/app/page.tsx`  `[VERIFIED]`
- Container `maxWidth:'680px'` (line 727) — already narrow; clamp to `width:'100%', padding:'0 16px'` at mobile.
- **`DuelRowCard`** (lines 232-249): a `flexDirection:'row'` main row with two `minWidth:'120px'` cells (caller cell line 246; challenger cell symmetric). 2×120 + gaps overflows 343px → stack to `column`, drop `minWidth`, cells `width:'100%'`.
- Filter chips: already `flexWrap:'wrap'`; ensure ≥44px tall at mobile.
- 1 stray `className=` on this file — verify it is not layout; the rest is inline.

### 2 & 3. Live + Settled Receipt — `apps/web/app/call/[id]/page.tsx` (2675 lines)  `[VERIFIED]`
- Container `maxWidth:'1024px'` appears at both the settled branch (line 1475) and live branch (line 1936) → clamp to `width:'100%', padding:'0 16px'` at mobile.
- **Settled outcome hero:** `fontSize:'96px'` Syne 800 at **line 1511** → `52px` at mobile (UI-SPEC target; Playwright floor 36px). Add `data-outcome-word` attr to the `<p>` (~1509-1518) for the legibility assertion.
- **Settled 4-stat row (line 1566-1593):** 4 cells each `flex:1`, `1px solid #2E2E42` inter-cell `borderRight`, `2px solid #2E2E42` outer border (line 1568), `marginBottom:'32px'`. At mobile → 2×2 via `flexWrap:'wrap'` + each cell `flex:'1 1 45%'`. Preserve borders. NO grid.
- **Settled action row (line 1596):** `flexDirection:'row', gap:'12px'`, 3 buttons (`SHARE THE RECEIPT →` filled accent w/ `boxShadow:'4px 4px 0 0 #09090E'` line 1600; Share as Frame; View All), each `flex:1`. → stack `column`, each `width:'100%'`, gap 12px, ≥44px tall.
- **Live two-column block (line 1656):** `flexDirection:'row', alignItems:'flex-start'` (activity feed + quote-calls DISPLAY column). → `column` at mobile (activity feed first). This quote column is **read-only display, NOT the composer** — stays in scope, NO banner.
- Many other `flexDirection:'row'` blocks (lines 614, 715, 833, 907, 916, 1449, 1667, 1691, 1757, 1859, 1989, 2309, 2397, 2531, etc.) — header rows, stat blocks, provenance line, FINAL POSITIONS, Caller-Exited/Disputed variants. Each must be audited; stack the ones that hold ≥2 sizable cells.
- **Inline modals on this page:** `DisputeModal` (`width:'100%', maxWidth:'480px'`, line 600) and `ProvenanceModal` (`maxWidth:'560px'`, line 818 — **overflows 375px, MUST clamp to `calc(100vw - 32px)`**).

### 4. Profile — `apps/web/app/profile/[address]/ProfileClient.tsx` (real surface; `page.tsx` is the server shell)  `[VERIFIED]`
- Container `maxWidth:'680px'` (line 57) → `width:'100%', padding:'0 16px'`.
- Stat row (~line 114) already `flexWrap:'wrap'`.
- **CATEGORY REPUTATION grid (~lines 128-133):** 3 cards `flex:'1 1 0'` `minWidth:160px` → 3×160=480 > 343 → force `flexDirection:'column'`, drop `minWidth`, cards `width:'100%'`.
- Uses Tailwind **typography** classNames (lines 125-238) — do NOT touch; swap inline layout only.
- `ProfileTabs.tsx` (NOTE: lives at `apps/web/components/ProfileTabs.tsx`, NOT `app/components/`): tab row `flexDirection:'row'` at line 36 → tabs ≥44px tall at mobile; `flexWrap:'wrap'` if needed.

### 5. Leaderboard — `apps/web/app/leaderboard/LeaderboardClient.tsx` (real surface)  `[VERIFIED — see Divergence #1]`
- Container `maxWidth:'760px'` (line 68) → `width:'100%', padding:'0 16px'`.
- **Live row is 4-column** (`#`/`Caller`/`Rep`/`Calls`, lines 220-279), NOT 6-column. The "drop ACC/BEST/sparkline" instruction is moot. Clamp to fit 343px; keep `flexDirection:'row'`.
- **Viewer-row accent** (lines 257-258: `backgroundColor:'#1A1A24'` via `ROW_HIGHLIGHT_BG` + `borderLeft:'3px solid #E8F542'`) MUST survive mobile.
- Each row is an `<a href="/profile/...">` (line 249) → ≥44px tall.
- Uses Tailwind typography classNames — layout stays inline.

### 6. Sign-in — `apps/web/app/signin/page.tsx` + `SignInButtons.tsx`  `[VERIFIED — see Divergence #3]`
- Centered column `maxWidth:'400px'` (line 168), `width:'100%'` (line 167). At 375px, 400px overflows by ~25px → clamp `maxWidth:'calc(100vw - 32px)'` at mobile.
- The 3 sign-in CTAs already `width:'100%'` — ensure ≥44px tall.
- The 480px corner-bracket frame from UI-24 is **not yet built** (UI-24 = Pending in REQUIREMENTS.md) — do not assume it exists.

### 7. Onboarding — `apps/web/app/onboarding/layout.tsx` + 5 subroutes  `[VERIFIED]`
- Layout inner frame `maxWidth:'480px'` (line 110), `width:'100%'` (line 109), `padding:'1.5rem'` (line 114); outer padding `2rem 1rem` (line 52). The `1rem` (16px) side padding + 480px clamp means at 375px the frame is already constrained by `width:'100%'`; just confirm no inner fixed widths overflow.
- 5 subroutes verified to exist as `flexDirection:'column'` forms: `handle` (7 inline styles), `socials` (4), `follow-graph` (7), `fund` (23 — heaviest), `tagline` (5). Confirm inputs + advance buttons ≥44px tall; tagline commitment line wraps.

### In-scope modals (D-04) — verified maxWidths
| Component | File:line | Live maxWidth | Action |
|-----------|-----------|---------------|--------|
| FollowFadeModal | `packages/ui/src/compound/FollowFadeModal.tsx:185` | `calc(100vw - 32px)` ✓ | Already clamped — verify internal button rows stack. |
| CallerExitModal | `packages/ui/src/compound/CallerExitModal.tsx:110` | `calc(100vw - 32px)` ✓ | Already clamped — verify only (UI-SPEC "add" is moot). |
| PositionExitModal | `packages/ui/src/compound/PositionExitModal.tsx:103` | `calc(100vw - 32px)` ✓ | Already clamped — verify only. |
| ChallengeFormModal | `apps/web/app/components/ChallengeFormModal.tsx:337` | `480px` | Add overlay h-padding / clamp; stack internal `row` rows. |
| DisputeModal | `apps/web/app/call/[id]/page.tsx:600` | `480px` | Add `calc(100vw - 32px)` clamp. |
| ProvenanceModal | `apps/web/app/call/[id]/page.tsx:818` | `560px` | **Overflows 375px — MUST clamp.** |

## Common Pitfalls

### Pitfall 1: Hydration mismatch under `force-dynamic`
**What goes wrong:** Seeding `useState` from `window.innerWidth`/`matchMedia` makes the first client render differ from the SSR HTML → React hydration warning + visible flicker.
**Why:** `layout.tsx` is a Server Component with `dynamic='force-dynamic'` (verified) — it renders the client tree's HTML on the server with no `window`.
**How to avoid:** `useSyncExternalStore` with a `getServerSnapshot()` returning `true`. Server HTML and first client render both use the server snapshot → match.
**Warning signs:** Console "Text content did not match" / "Hydration failed"; mobile layout briefly flashing desktop.

### Pitfall 2: Hook leaking into the OG/Satori build
**What goes wrong:** Importing `useIsMobile` (with `matchMedia`) from `packages/ui` breaks the `@vercel/og` Node-runtime render.
**How to avoid:** Hook lives in `apps/web/app/hooks/` ONLY. Shared components receive mobile state via props, not by importing the hook.

### Pitfall 3: Breaking existing Playwright/OG snapshot specs
**What goes wrong:** Layout edits or accidental `display:grid` break `quote-composer.spec.ts` (asserts no grid, line 83-84), `og-thumbnail-200px.spec.ts`, `og-fallback*.spec.ts`, `signin.spec.ts`, `leaderboard.spec.ts`, `profile-*.spec.ts`.
**How to avoid:** Run the full `apps/web` suite before `/gsd-verify-work`. Never introduce grid. Don't change OG card sources.
**Warning signs:** Snapshot diff failures; "no grid" assertion red.

### Pitfall 4: Outcome word clipping at 375px
**What goes wrong:** `LOUD AND WRONG` / `FADED CORRECTLY` (longest variants) at 96px clip or wrap on a 343px inner width.
**How to avoid:** 52px mobile target; Playwright floor 36px + bounding-box-fits-viewport assertion; `data-outcome-word` test hook. Note this is the **in-page hero at 375px** — distinct from the **OG-card 200px-downscale** legibility concern (`og-thumbnail-200px.spec.ts`, env-gated `OG_200PX_BASELINES=1`), which is NOT in this phase's edit surface but shares the legibility principle (the carry-over from Phase 7).

### Pitfall 5: Auth-flicker in the drawer
**What goes wrong:** Logged-out users briefly see authenticated links (New Call, Profile) before Privy resolves.
**How to avoid:** Gate those destinations on `authenticated && ready` (both from `usePrivy()`).

### Pitfall 6: Playwright config has no mobile project
**What goes wrong:** The single `chromium` project uses `devices['Desktop Chrome']` — a responsive spec written without explicit viewport runs at desktop width and passes vacuously.
**How to avoid:** In `responsive.spec.ts`, set viewport per-describe with `test.use({ viewport: { width: 375, height: 812 } })` (and a 390px variant), or add `devices['iPhone 13']`. `testMatch:['**/*.spec.ts']` already includes the new file; no config change strictly required, but viewport must be set in-spec. `[VERIFIED: playwright.config.ts]`

## Runtime State Inventory

> Not a rename/refactor/migration phase. This is a frontend layout retrofit — no stored data, service config, OS state, secrets, or build artifacts carry layout state.
- **Stored data:** None — no datastore keys involve layout. (Verified: phase touches only React components + one Playwright spec.)
- **Live service config:** None.
- **OS-registered state:** None.
- **Secrets/env vars:** None new. (`responsive.spec.ts` reuses existing Playwright env conventions; operator gate uses no secrets.)
- **Build artifacts:** Playwright requires a `pnpm build` before `pnpm start` for E2E runs (existing convention) — no new artifacts. `[VERIFIED: playwright.config.ts webServer comment]`

## Code Examples

### `useIsMobile()` — see Pattern 1 above (full verified implementation)

### Per-session dismissible banner
```typescript
// apps/web/app/components/DesktopOnlyBanner.tsx
'use client';
import { useState } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';

export function DesktopOnlyBanner() {
  const isMobile = useIsMobile();
  const [dismissed, setDismissed] = useState(false);
  if (!isMobile || dismissed) return null;
  return (
    <div style={{
      border: '3px solid #E8F542', boxShadow: '4px 4px 0 0 #E8F542',
      background: '#13131D', padding: '12px 14px', margin: '12px 16px',
      display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px',
    }}>
      <div>
        <strong style={{ color: '#E8F542', fontFamily: 'monospace', textTransform: 'uppercase' }}>Best viewed on desktop</strong>
        <p style={{ color: '#94A3B8', fontSize: '13px', margin: '4px 0 0' }}>
          This page isn&apos;t optimized for small screens yet. Use the menu to navigate away.
        </p>
      </div>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss"
        style={{ minWidth: 44, minHeight: 44, background: 'transparent', border: 'none', color: '#E8F542', fontSize: 20, cursor: 'pointer' }}>
        ×
      </button>
    </div>
  );
}
```

### Responsive Playwright spec skeleton
```typescript
// apps/web/tests/responsive.spec.ts
import { test, expect } from '@playwright/test';

const PAGES = ['/', '/leaderboard', '/signin', '/onboarding/handle' /*, settled receipt via seeded id */];

for (const width of [375, 390]) {
  test.describe(`@${width}px`, () => {
    test.use({ viewport: { width, height: 812 } });
    for (const path of PAGES) {
      test(`no horizontal scroll — ${path}`, async ({ page }) => {
        await page.goto(path);
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth > document.documentElement.clientWidth);
        expect(overflow).toBe(false);
      });
      test(`touch targets >=44px — ${path}`, async ({ page }) => {
        await page.goto(path);
        const small = await page.$$eval('button, a[href], [role="button"]', els =>
          els.filter(el => { const r = el.getBoundingClientRect();
            return r.width > 0 && (r.width < 44 || r.height < 44); }).length);
        expect(small).toBe(0);
      });
    }
    test(`outcome word legible — settled receipt`, async ({ page }) => {
      await page.goto('/call/14'); // seeded settled call (confirm id — Open Question 1)
      const el = page.locator('[data-outcome-word]');
      const box = await el.boundingBox();
      const fs = await el.evaluate(n => parseFloat(getComputedStyle(n).fontSize));
      expect(fs).toBeGreaterThanOrEqual(36);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    });
  });
}
```
*(Tier-1 source assertions — banner presence on `/new` + `/duel/[id]`, hook server-snapshot = `true` — can mirror `signin.spec.ts`/`quote-composer.spec.ts` `readFileSync` style for the parts that can't render without a real Privy app ID.)*

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `useState` + resize listener for breakpoints | `useSyncExternalStore` with `getServerSnapshot` | React 18 (2022) | SSR-safe, hydration-correct, no debounce boilerplate — the canonical pattern for external-store reads like `matchMedia`. |
| CSS media queries / Tailwind responsive variants | JS hook + conditional inline styles | This codebase's architecture | Forced by the inline-style register (D-01); not an industry trend, a repo-specific constraint. |

**Deprecated/outdated:** Nothing in this phase relies on deprecated APIs. `matchMedia.addListener` (deprecated) is avoided in favor of `addEventListener('change', …)`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The settled-receipt Playwright test can hit a seeded settled call at `/call/14` (the Phase-7 seeded CallerLost call) | Code Examples / Validation | Low — if the id differs, the spec's outcome-word test needs the correct seeded id; mechanical scroll/touch tests don't depend on it. Planner should confirm the live seeded settled call id. |
| A2 | The 768px breakpoint covers all target devices (iPhone 375/390, Android ~360-412) as "mobile" | Hook / Discretion | Low — D-spec and UI-SPEC both lock `<768px`; standard phone widths are all below it. |
| A3 | No critical page has an inner fixed-width element wider than 343px beyond those inventoried | Per-Page Inventory | Medium — I read the key blocks but did not exhaustively audit every `width:'NNNpx'` in the 2675-line `call/[id]/page.tsx`. Executor must grep each page for `width: '` / `minWidth:` during implementation. |

## Open Questions

1. **Exact seeded settled-call id for the outcome-word Playwright assertion.**
   - What we know: Phase 7 seeded a CallerLost call (#14 per MEMORY) for 200px baselines.
   - What's unclear: whether #14 is still settled+available on the test/staging target and renders all 5 outcome variants.
   - Recommendation: planner adds a Wave-0 task to confirm a stable seeded settled id, or have the spec navigate via a fixture.

2. **Should the Leaderboard mobile task also implement the missing UI-13 columns (ACC/BEST/sparkline)?**
   - What we know: UI-13 specifies 6 columns; live code has 4; UI-13 is marked Complete (Phase 7) in REQUIREMENTS.md despite the gap.
   - What's unclear: whether the missing columns are an accepted descope or a Phase-7 regression.
   - Recommendation: **Treat as out of scope for Phase 9** — Phase 9 is responsive retrofit, not feature completion. Flag the UI-13/code mismatch to the user separately. Do not expand Phase 9 scope.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node + pnpm | Build/test | ✓ (repo standard) | per repo | — |
| `@playwright/test` + Chromium | D-10a mechanical gate | ✓ | 1.60 | — |
| Real iPhone (Safari) + Android (Chrome) | D-10b/D-11 operator sign-off | Operator-dependent | — | **None — D-11 makes this a HARD GATE with no fallback. Phase completion is intentionally coupled to operator device availability.** |
| Privy app ID (real) | Tier-2 browser specs only | Build-time env | — | Tier-1 source assertions run without it (mirror `signin.spec.ts`). |

**Missing dependencies with no fallback:** Operator real-device access (D-11) — the orchestrator must surface a `checkpoint:human-verify` and cannot auto-complete the phase without it.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `@playwright/test` 1.60 (Chromium project) |
| Config file | `apps/web/playwright.config.ts` (single `chromium` / Desktop Chrome project; `testMatch:['**/*.spec.ts']`; `webServer: pnpm start` after a build) |
| Quick run command | `cd apps/web && pnpm exec playwright test tests/responsive.spec.ts` |
| Full suite command | `cd apps/web && pnpm build && pnpm exec playwright test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UI-48 | No horizontal scroll at 375/390px on each of 7 pages | e2e (viewport) | `playwright test tests/responsive.spec.ts -g "no horizontal scroll"` | ❌ Wave 0 |
| UI-49 | Single-column + full-width buttons; hamburger drawer; bell pinned | e2e (viewport) | `playwright test tests/responsive.spec.ts -g "single column|full-width|drawer"` | ❌ Wave 0 |
| UI-49 | Touch targets ≥44×44 at mobile (D-03) | e2e (viewport) | `playwright test tests/responsive.spec.ts -g "touch target"` | ❌ Wave 0 |
| UI-50 | Banner present on `/new` (+`?quote=`) and `/duel/[id]`; absent on critical pages + at desktop | e2e + source | `playwright test tests/responsive.spec.ts -g "desktop-only banner"` | ❌ Wave 0 |
| SC3 | Outcome word fits viewport + `fontSize>=36` on settled receipt @375px | e2e (bounding box) | `playwright test tests/responsive.spec.ts -g "outcome word legible"` | ❌ Wave 0 |
| D-01/02 | `useIsMobile` server snapshot = `true` (no hydration mismatch) | source/unit | `playwright test tests/responsive.spec.ts -g "server snapshot"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm exec playwright test tests/responsive.spec.ts -g "<page under edit>"`
- **Per wave merge:** `cd apps/web && pnpm build && pnpm exec playwright test tests/responsive.spec.ts`
- **Phase gate:** Full `apps/web` Playwright suite green (regression guard: `quote-composer.spec.ts` "no grid", OG snapshots, `signin.spec.ts`, `leaderboard.spec.ts`, `profile-*.spec.ts`) **AND** operator real-device sign-off (D-11, hard gate).

### Wave 0 Gaps
- [ ] `apps/web/app/hooks/useIsMobile.ts` — foundational; every page depends on it (Wave 1 task 1).
- [ ] `apps/web/tests/responsive.spec.ts` — covers UI-48/49/50/SC3 at 375/390px (set viewport in-spec; config has no mobile project — Pitfall 6).
- [ ] `data-outcome-word` attribute on the outcome hero `<p>` (`call/[id]/page.tsx` ~1509-1518) for the legibility assertion.
- [ ] (Optional) Source assertion that `useIsMobile` `getServerSnapshot` returns `true` (D-02 lock), mirroring `signin.spec.ts` Tier-1.
- [ ] Confirm a stable seeded settled-call id for the outcome-word test (Open Question 1).
- Framework install: none — Playwright already present.

## Security Domain

> This is a pure frontend layout phase with **no new data-fetching, auth, input, or crypto surfaces**. The only behavioral change is `Sign out` (reuses Privy `logout()`).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No new auth; drawer reads existing Privy `authenticated`/`ready`. |
| V3 Session Management | no | `logout()` is existing Privy session teardown. |
| V4 Access Control | yes (minor) | Drawer destinations gated on `authenticated && ready` (Pitfall 5) — prevents flashing authenticated links, but is UX, not a security boundary (server still enforces per CR-01). |
| V5 Input Validation | no | Phase adds no inputs. |
| V6 Cryptography | no | None. |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Authenticated links visible to logged-out user (route info disclosure) | Information disclosure | `authenticated && ready` gate; server-side route auth remains the real boundary (unchanged). |
| Banner overlay blocking sign-out/navigation (DoS of exit) | Denial (UX) | D-08 banner pushes content (not overlay); D-07 keeps hamburger active on banner pages → exit always reachable. |

## Sources

### Primary (HIGH confidence)
- Live codebase (read this session): `apps/web/app/layout.tsx`, `components/GlobalNav.tsx`, `components/NotificationInbox.tsx`, `app/page.tsx`, `app/call/[id]/page.tsx`, `app/profile/[address]/ProfileClient.tsx`, `app/leaderboard/LeaderboardClient.tsx`, `app/signin/page.tsx`, `app/onboarding/layout.tsx` + 5 subroutes, `components/ProfileTabs.tsx`, `packages/ui/src/compound/{FollowFade,CallerExit,PositionExit}Modal.tsx`, `app/components/ChallengeFormModal.tsx`, `playwright.config.ts`, `tests/{signin,quote-composer,outcome-word,og-thumbnail-200px}.spec.ts`.
- `09-CONTEXT.md` (D-01..D-11), `09-UI-SPEC.md` (approved), `09-VALIDATION.md`, `.planning/REQUIREMENTS.md` (UI-13/20/24/48/49/50), `CLAUDE.md` (stack).
- React docs — `useSyncExternalStore` (server-snapshot argument for SSR-safe external store reads).

### Secondary (MEDIUM confidence)
- MEMORY.md (Phase 7 seeded settled call #14) — used only for the Playwright outcome-word test seed assumption (A1).

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Per-page layout inventory: HIGH — every file/line read this session against live code.
- Hook pattern: HIGH — `useSyncExternalStore` server-snapshot is the documented SSR-safe approach; matches D-02 exactly.
- Divergences from UI-SPEC: HIGH — each backed by a verified line reference.
- Seeded-call id for outcome test: MEDIUM — from MEMORY, not re-verified on the live target.

**Research date:** 2026-06-09
**Valid until:** 2026-07-09 (stable — internal codebase + React core API; no fast-moving external deps).
