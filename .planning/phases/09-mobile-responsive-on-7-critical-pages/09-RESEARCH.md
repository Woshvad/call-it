# Phase 9: Mobile responsive on 7 critical pages - Research

**Researched:** 2026-06-09
**Domain:** Responsive retrofit of an inline-styled Next.js App Router frontend (375px breakpoint) + Playwright viewport gating
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Add responsiveness via a **`useIsMobile()` client hook + conditional inline style objects** (`isMobile ? mobileStyle : desktopStyle`). The entire frontend is inline `style={{}}` — inline styles cannot carry `@media`; external CSS cannot override inline without `!important`. (Rejected: `@media` in `globals.css`; full Tailwind migration.)
- **D-02:** **Mobile-first first paint.** Hook defaults to `isMobile = true` so SSR/first paint renders the mobile layout; widens to desktop on the client only when the viewport is large. Serves the SC3 share-visitor (almost always on a phone).
- **D-03:** **44×44px touch targets enforced at the mobile breakpoint only** (`isMobile`). Desktop keeps current dense neobrutalist density.
- **D-04:** **Reach = the 7 pages PLUS the modals/shared components they render at 375px.** In scope: Follow/Fade/CallerExit/PositionExit modals, `ChallengeFormModal`, dispute/provenance modals, and `@call-it/ui` pieces (`CallCard`, `Receipt`, `ProfileHeader`) where a critical page shows them.
- **D-05:** **Add a hamburger drawer** (mobile only) on the left of `GlobalNav`. App has no left sidebar today — `GlobalNav` is just wordmark + bell — so this satisfies UI-49 literally AND fills the real no-global-mobile-nav gap. Desktop nav unchanged.
- **D-06:** Drawer = **auth-aware destinations**: Feed, Leaderboard, Profile, New Call, Sign in / Sign out (New Call + Profile gated to authenticated). **Notification bell stays pinned in the top bar** on mobile. Drawer = navigation; top bar = identity + alerts.
- **D-07:** Hamburger **stays active on the 3 desktop-only-banner pages** → directly satisfies SC2 ("banner does not block return navigation or sign-out").
- **D-08:** **Warn but allow use.** On Duel/New Call (and the resolved Quote surface), at mobile width show the banner at top with the (non-responsive) page still rendering and interactive below. Non-blocking, honest, satisfies SC2.
- **D-09:** Banner is **dismissible for the session**. Copy: "Best viewed on desktop" + short subtext, `[×]` to dismiss. Neobrutalist styling (accent border, hard offset shadow). No extra CTA needed (hamburger provides exit/sign-out).
- **D-10:** **Hybrid validation.** (a) Automated **Playwright responsive specs** at 375px + 390px assert mechanical criteria — no horizontal scroll, single-column, ≥44px touch targets, outcome-word legibility. (b) An **operator human-verify checkpoint** on a real iPhone (Safari) + Android (Chrome) signs off the SC3 share→receipt landing flow.
- **D-11:** **BOTH are hard gates** — Playwright suite AND operator real-device sign-off must pass before Phase 9 is complete. (User diverged from "operator check deferrable" — they want a genuine real-device sign-off.)

### Claude's Discretion
- Exact `isMobile` threshold — use a single breakpoint (`< 768px` ⇒ mobile) unless research surfaces a reason for a tablet tier; tablet falls into the desktop bucket.
- Per-page layout restructuring details (how each page's two-column `flexDirection: 'row'` blocks stack, where full-width buttons apply).
- Reuse the existing `NotificationInbox` slide-over/overlay pattern for the drawer; close on link-tap / backdrop / Esc.
- One shared `<DesktopOnlyBanner>` component reused across the banner pages, rendered only when `isMobile`, pushing content (not overlaying).
- Hook implementation detail (`matchMedia` + `useSyncExternalStore` vs `useState`/resize) — pick the SSR-safe option that honors the mobile-first default (D-02).

### Deferred Ideas (OUT OF SCOPE)
- Full responsive pass on the 3 non-critical pages (Duel, Quote composer, New Call) — v1.1+. Phase 9 ships only the banner for them.
- Tablet-specific (768–1024px) layout tier — collapses into desktop for v1.
- Migrating the inline-style architecture to Tailwind — rejected for this phase (regression risk).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UI-48 | 375px breakpoint on 7 critical pages (Feed §15.1, Live Receipt §15.3, Profile §15.4, Settled Receipt §15.7, Sign-in §15.8, Onboarding §15.9, Leaderboard §15.6) | File inventory (§ File Inventory) confirms all 7 page paths incl. 5 onboarding subroutes; per-page landmine map gives exact restructure targets |
| UI-49 | Single-column layouts, full-width action buttons, left sidebar → hamburger | Hamburger drawer mirrors `NotificationInbox` slide-over (§ Hamburger Drawer); no left sidebar exists today (drawer is net-new); two-column→stack landmines mapped per page |
| UI-50 | Non-critical pages (Duel §15.5, Quote composer §15.10, New Call §15.2) get "Best viewed on desktop" banner | **Quote composer resolved** = `/new?quote=[parentCallId]` (same `/new` route, query-param mode) → banner on `/new` covers it automatically. Only TWO physical files need a banner: `new/page.tsx` and `duel/[challengeId]/page.tsx` |
</phase_requirements>

## Summary

Phase 9 is a **responsive retrofit**, not net-new UI. The frontend is styled exclusively with inline `style={{}}` objects (zero Tailwind utility classes, zero `sm:`/`md:` variants in `apps/web/app` — confirmed by grep). This is the load-bearing constraint that already drove **D-01** (a JS `useIsMobile()` hook gating `isMobile ? mobileStyle : desktopStyle`) instead of CSS/Tailwind. There is **no existing responsive hook anywhere** in `apps/web` or `packages/ui` (verified — no `matchMedia`, `useMediaQuery`, `useSyncExternalStore`, or `useIsMobile`), so the hook is genuinely greenfield and must be authored.

The single most important technical decision is the **SSR-safe implementation of `useIsMobile()` honoring D-02 (mobile-first default `true`)**. Root `layout.tsx` is `export const dynamic = 'force-dynamic'` and all providers are client-only (`ssr: false`), so the server paints the client tree once. The hook must (a) return `true` on the server snapshot AND on the very first client render during hydration to avoid a hydration mismatch, then (b) converge to the real `matchMedia` value after mount. The recommended implementation is `useSyncExternalStore` with `getServerSnapshot → true` plus a `getSnapshot` that returns `true` until a mount flag flips — concretely the cleanest pattern is a `useState(true)` + `useEffect(matchMedia listener)` hook, because it *guarantees* `true` on first paint and reflows once on the client, which is exactly D-02's intended "one quiet desktop reflow." Both are documented below; the `useState`+effect form is recommended for D-02 specifically.

**Critical unresolved item — RESOLVED:** The "Quote composer" (§15.10) has **no standalone route**. It is `/new?quote=[parentCallId]` — the New Call page (`app/new/page.tsx`) rendered in a query-param mode (`useSearchParams().get('quote')`). Therefore the desktop-only banner on `app/new/page.tsx` automatically covers the quote composer. There is no third banner file. The on-receipt "quote-calls section" on `call/[id]` is a *display* column (read-only quote stances), not the composer, and it stays in scope as part of the responsive Live Receipt page (NOT a banner target).

**Primary recommendation:** Build one `useIsMobile()` hook (in `apps/web/app/hooks/`, NOT `packages/ui` — the OG/Satori build in `packages/ui` must not pull in `matchMedia`) defaulting to `true`; one shared `<DesktopOnlyBanner>` and one `<MobileDrawer>` (mirroring `NotificationInbox`); then retrofit each of the 7 pages + in-scope modals to stack their `flexDirection: 'row'` blocks to `column`, make action buttons full-width, and scale the 96px outcome hero down at mobile. Gate with a Playwright responsive spec at 375/390px asserting `scrollWidth <= clientWidth`, single-column, ≥44px targets, and outcome-word visibility.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Viewport detection (`isMobile`) | Browser / Client | — | `matchMedia` is a browser API; must run client-side. SSR returns the D-02 default. |
| Responsive layout switching | Browser / Client | — | Inline-style conditional objects evaluated in the rendered client tree. |
| First-paint layout (SSR snapshot) | Frontend Server (SSR) | Browser | `force-dynamic` server render emits the mobile-first tree (D-02); client hydrates then may reflow. |
| Mobile navigation drawer | Browser / Client | — | Auth state (Privy) is client-only; drawer destinations are auth-aware (D-06). |
| Desktop-only banner gating | Browser / Client | — | Banner visibility is `isMobile`-gated, evaluated client-side. |
| Share-link landing (Settled Receipt) | Frontend Server (SSR) | Browser | OG meta + first paint server-rendered; #1 share-landing priority (SC3). |
| Responsive validation (mechanical) | CI (Playwright/Chromium) | — | Repeatable gate at 375/390px viewports. |
| Real-device share-flow sign-off | Operator (manual) | — | iOS Safari + Android Chrome (D-10b, D-11) — not automatable in CI. |

## Standard Stack

This phase adds **no new runtime dependencies**. Everything needed is already in the stack.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | `19.x` (bundled w/ Next 16) | `useSyncExternalStore` / `useState` + `useEffect` for the hook | `useSyncExternalStore` is React's first-class primitive for SSR-safe external-source subscriptions (media queries) `[CITED: react.dev / tkdodo.eu]` |
| Next.js | `16.2.6` (App Router) | `'use client'` pages; `force-dynamic` root layout | Already the project framework `[VERIFIED: codebase — layout.tsx]` |
| `@playwright/test` | already installed (`playwright.config.ts` present) | Responsive viewport specs (D-10a) | Already in stack — `signin.spec.ts`, `og-thumbnail-200px.spec.ts` (uses `setViewportSize`) `[VERIFIED: codebase]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `next/navigation` `useSearchParams` | bundled | Detect quote mode on `/new` | Already used in `app/new/page.tsx:44` to read `?quote=` `[VERIFIED: codebase]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `useState(true)` + resize/matchMedia effect | `useSyncExternalStore(subscribe, ()=>matchMedia(...).matches, ()=>true)` | `useSyncExternalStore` is more "correct" for concurrent React and avoids stale closures, BUT its client `getSnapshot` runs synchronously on first hydration render → if it reads `matchMedia` immediately it returns the *real* value, which on a desktop is `false` and **mismatches the `true` server snapshot**. To honor D-02 you must still defer the real read until after mount. The `useState(true)` + `useEffect` form makes the "true-until-mounted" guarantee explicit and is simpler to reason about for this exact requirement. **Recommended: `useState`+effect.** |
| Single `< 768px` breakpoint | Tablet tier (768–1024) | Deferred per CONTEXT — tablet collapses into desktop bucket for v1. |
| New hook in `apps/web` | Hook in `packages/ui` | `packages/ui` is consumed by the Satori/OG render path; pulling `matchMedia`/browser APIs into shared package risks the OG build. Keep the hook in `apps/web/app/hooks/`. |

**Installation:** None. No `npm install` required.

## Package Legitimacy Audit

> Not applicable — this phase installs **zero** external packages. All capabilities use libraries already present and verified in the repo (React 19, Next 16, @playwright/test). Slopcheck/registry verification gate is moot.

## Architecture Patterns

### System Architecture Diagram

```
                         ┌──────────────────────────────────────────────┐
   Twitter/Farcaster     │  Next.js App Router (force-dynamic root)      │
   share click  ───────► │                                              │
   (mobile viewport)     │  layout.tsx                                   │
                         │   └─ ClientProviders (Privy/wagmi, ssr:false) │
                         │       ├─ GlobalNav ──► [+ MobileDrawer (D-05)]│
                         │       │     ├─ hamburger (isMobile only)       │
                         │       │     ├─ wordmark                        │
                         │       │     └─ NotificationBell (pinned, D-06) │
                         │       └─ {page}                                │
                         │                                              │
                         │  useIsMobile()  ◄── window.matchMedia         │
                         │     │  SSR snapshot = TRUE  (D-02)            │
                         │     │  client: TRUE until mount, then real    │
                         │     ▼                                         │
                         │  isMobile ? mobileStyle : desktopStyle        │
                         │     │                                         │
                         │     ├─ 7 critical pages → single-column,      │
                         │     │     full-width buttons, stacked rows,    │
                         │     │     scaled outcome hero (SC1/SC3)        │
                         │     │                                         │
                         │     ├─ in-scope modals → calc(100vw-32px)     │
                         │     │     width, stacked button rows (D-04)    │
                         │     │                                         │
                         │     └─ 2 banner files (/new, /duel) →         │
                         │           <DesktopOnlyBanner> on top (D-08)   │
                         └──────────────────────────────────────────────┘
                                            │
                         ┌──────────────────┴──────────────────┐
                         ▼                                      ▼
            Playwright @375/390px                     Operator real device
            scrollWidth<=clientWidth,                 iOS Safari + Android
            single-col, ≥44px, outcome                Chrome share→receipt
            legible  (D-10a, hard gate)               sign-off (D-10b, hard gate)
```

### Recommended Project Structure (additions only)
```
apps/web/app/
├── hooks/
│   └── useIsMobile.ts          # NEW — SSR-safe, default true (D-01/D-02)
├── components/
│   ├── GlobalNav.tsx           # EDIT — add hamburger (isMobile) + MobileDrawer
│   ├── MobileDrawer.tsx        # NEW — mirrors NotificationInbox slide-over (D-05/06/07)
│   └── DesktopOnlyBanner.tsx   # NEW — shared banner, isMobile-gated (D-08/09)
└── tests/
    └── responsive.spec.ts      # NEW — 375/390px mechanical gate (D-10a)
```

### Pattern 1: SSR-safe `useIsMobile()` — mobile-first default (D-01 + D-02) — RECOMMENDED
**What:** A client hook returning `true` on the server and on first client paint, converging to the real viewport after mount.
**When to use:** Every page/modal that needs to switch between `mobileStyle` and `desktopStyle`.
**Why this form:** Guarantees `isMobile === true` at hydration → no hydration mismatch warning; desktop users absorb exactly one reflow (D-02's "one quiet reflow").

```typescript
// apps/web/app/hooks/useIsMobile.ts
// Source pattern: tkdodo.eu/blog/avoiding-hydration-mismatches-with-use-sync-external-store
//                 + D-02 mobile-first default (return true until client mount)
'use client';
import { useEffect, useState } from 'react';

const MOBILE_QUERY = '(max-width: 767px)'; // < 768px ⇒ mobile (Claude's-discretion threshold)

/**
 * Returns true on the server and on first client paint (D-02 mobile-first),
 * then reflects the real viewport after mount. One reflow on desktop only.
 */
export function useIsMobile(): boolean {
  // Default TRUE so SSR + first hydration render emit the mobile layout (D-02).
  const [isMobile, setIsMobile] = useState(true);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mql.matches);
    update(); // converge to real value after mount
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, []);

  return isMobile;
}
```

**Alternative `useSyncExternalStore` form (only if a reason emerges to prefer it):**
```typescript
'use client';
import { useSyncExternalStore } from 'react';
const MOBILE_QUERY = '(max-width: 767px)';
let mounted = false; // module flag flips after first client commit

function subscribe(cb: () => void) {
  mounted = true;
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}
// getSnapshot returns true until subscribed (first paint) to match server snapshot.
function getSnapshot() { return mounted ? window.matchMedia(MOBILE_QUERY).matches : true; }
function getServerSnapshot() { return true; } // D-02

export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```
*Note: the `mounted` module flag is a small wart; the `useState`+effect form is cleaner for this exact D-02 requirement. `[ASSUMED]` that the `useState` form has no measurable perf downside at this app's scale — both run one client-side reflow.*

### Pattern 2: Mobile drawer mirroring `NotificationInbox` (D-05/06/07)
**What:** A left slide-over overlay (backdrop + fixed panel) reusing the exact `NotificationInbox` structure (lines 236–490 of `components/NotificationInbox.tsx`): fixed backdrop `rgba(9,9,14,0.6)` zIndex 50, fixed panel, close on Esc + backdrop-click + link-tap.
**When to use:** Mobile hamburger nav. Render the hamburger button in `GlobalNav` only when `isMobile`; keep `<NotificationBell />` in the bar always (D-06).
**Example (skeleton mirroring NotificationInbox):**
```typescript
// Source: apps/web/app/components/NotificationInbox.tsx (slide-over pattern), left-anchored
'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';

export function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { authenticated, login, logout, user } = usePrivy();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const addr = user?.wallet?.address;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(9,9,14,0.6)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        position: 'fixed', top: 0, left: 0, width: 'min(300px, 85vw)', height: '100vh',
        background: '#09090E', borderRight: '3px solid #E8F542', boxShadow: '4px 0 0 0 #E8F542',
        display: 'flex', flexDirection: 'column', padding: '20px',
      }}>
        {/* D-06 destinations; New Call + Profile gated to authenticated */}
        <Link href="/" onClick={onClose}>Feed</Link>
        <Link href="/leaderboard" onClick={onClose}>Leaderboard</Link>
        {authenticated && addr && <Link href={`/profile/${addr}`} onClick={onClose}>Profile</Link>}
        {authenticated && <Link href="/new" onClick={onClose}>New Call</Link>}
        {authenticated
          ? <button onClick={() => { logout(); onClose(); }}>Sign out</button>
          : <button onClick={() => { login(); onClose(); }}>Sign in</button>}
      </div>
    </div>
  );
}
```
*(Neobrutalist styling on links/buttons per the project tokens — accent borders, monospace, uppercase, hard offset shadow — mirror `NotificationInbox`'s button styles. Auth-aware gating matches the feed's existing CTA logic.)*

### Pattern 3: Shared `<DesktopOnlyBanner>` (D-08/09)
**What:** One reusable component rendered at the top of the banner pages, only when `isMobile`, pushing content down (not overlaying). Dismissible for the session (`useState`).
```typescript
'use client';
import { useState } from 'react';
import { useIsMobile } from '@/app/hooks/useIsMobile';

export function DesktopOnlyBanner() {
  const isMobile = useIsMobile();
  const [dismissed, setDismissed] = useState(false);
  if (!isMobile || dismissed) return null;
  return (
    <div style={{
      border: '3px solid #E8F542', boxShadow: '4px 4px 0 0 #E8F542', background: '#13131D',
      padding: '12px 14px', margin: '12px 16px', display: 'flex', flexDirection: 'row',
      alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
    }}>
      <div>
        <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#E8F542', letterSpacing: 1 }}>
          Best viewed on desktop
        </div>
        <div style={{ fontSize: 12, color: '#94A3B8' }}>
          This page isn’t optimized for small screens yet. Use the menu to navigate away.
        </div>
      </div>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss" style={{ color: '#94A3B8', background: 'transparent', border: '2px solid #2A2A30', width: 28, height: 28 }}>×</button>
    </div>
  );
}
```
**Mount sites:** `app/new/page.tsx` (covers both New Call AND `?quote=` composer) and `app/duel/[challengeId]/page.tsx`. Place at the very top of the page's returned tree so content is pushed, not overlaid (D-08). Session dismiss is per-mount; if a single persistent dismiss across both pages is wanted, lift to `sessionStorage` — but per-page `useState` satisfies D-09 ("dismissible for the session" on that surface).

### Anti-Patterns to Avoid
- **`display: grid` for stacking.** Project-wide convention avoids grid (Pitfall 15 — Satori OG cards don't support it; flexbox is the house style). Stack two-column rows by flipping `flexDirection: 'row'` → `'column'`, NOT by introducing grid. Existing Playwright tests (`quote-composer.spec.ts`) assert "No CSS grid (flexbox only, Pitfall 15)" — a grid addition could trip a sibling test.
- **Reading `matchMedia` synchronously on first render** (mismatch with the `true` server snapshot). Always default to `true` until mount.
- **Putting the hook in `packages/ui`** (pollutes the Satori/OG build with browser APIs).
- **Softening the neobrutalist register on mobile** (§14.6 "no slop" still applies — keep borders, hard offset shadows, accent, Syne/Space Grotesk/JetBrains Mono).
- **Overlaying the banner** instead of pushing content (D-08 says non-blocking, page interactive below).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSR-safe media-query detection | A custom `window.innerWidth` read in render | `useIsMobile()` hook (Pattern 1) defaulting to `true` | Reading `innerWidth` in render is undefined on server → hydration crash. The hook is the single sanctioned source. |
| Slide-over drawer (backdrop, Esc, click-out) | A new overlay from scratch | Mirror `NotificationInbox.tsx` (already does backdrop + Esc + click-out) | Battle-tested in-repo pattern; consistent z-index (50) and tokens. |
| Per-page banner duplication | Inline banner markup on each page | One `<DesktopOnlyBanner>` (Claude's-discretion) | DRY; one place to tune copy/dismiss. |
| Responsive viewport assertions | Manual eyeballing only | Playwright `setViewportSize` + `scrollWidth<=clientWidth` (Pattern in Validation Architecture) | D-10a mandates a repeatable mechanical gate; manual-only fails D-11. |

**Key insight:** The retrofit's complexity is NOT in any one mechanism (the hook is ~15 lines, the drawer mirrors an existing component). It is in the **per-page surgery** across very large files (`call/[id]/page.tsx` is 2,675 lines; `page.tsx` is 1,111). Plan the work page-by-page with the landmine map below, not as a single sweeping change.

## Runtime State Inventory

> Greenfield-adjacent: this is a UI retrofit with no stored data, services, OS state, secrets, or build artifacts to migrate.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — verified: phase touches only React render layer, no DB/datastore keys | None |
| Live service config | None — verified: no relayer/subgraph/external-service config carries layout state | None |
| OS-registered state | None — verified: no OS-level registrations involved in a frontend responsive pass | None |
| Secrets/env vars | None — verified: no secret or env-var name changes; `NEXT_PUBLIC_*` unchanged | None |
| Build artifacts | `apps/web/.next/` is a build artifact and will rebuild; no stale-name risk (no rename in this phase) | None — normal `pnpm build` regenerates |

## File Inventory (verified paths)

### 7 critical pages (IN SCOPE — make responsive)
| # | Page | File | Structure note |
|---|------|------|----------------|
| 1 | Feed (§15.1) | `apps/web/app/page.tsx` (1,111 ln, `'use client'`) | `<main maxWidth:680px>` — already narrow. **`DuelRowCard`** has two `minWidth:120px` cells (lines 246, 353) inside a `flexDirection:'row'` (line 235) → overflow risk at 375px (120+120+gap+padding > 343 inner). Filter chips already `flexWrap:'wrap'`. |
| 2 | Live Receipt (§15.3) | `apps/web/app/call/[id]/page.tsx` live branch (2,675 ln) | `maxWidth:1024px` container (line 1475 is the settled branch; live branch similar). **Two-column FINAL POSITIONS / activity+quote columns** `flexDirection:'row'` (line ~1656) must stack. Action buttons row `flexDirection:'row'` → full-width stacked. |
| 3 | Settled Receipt (§15.7) — **#1 share-landing** | `apps/web/app/call/[id]/page.tsx` settled branch | `maxWidth:1024px` (line 1475). **96px outcome hero** (line 1511) must scale down (see Outcome-Word Legibility). 4-stat row `flexDirection:'row'` (line 1567, `flex:1` cells) — narrow but 4 cells × ~85px is borderline; consider 2×2 stack at mobile. Action row (line 1596) `flexDirection:'row'` with `flex:1` buttons → stack full-width per UI-20 ("full-width stacked on mobile"). |
| 4 | Profile (§15.4) | `apps/web/app/profile/[address]/page.tsx` (Server Component, 53 ln) → **`apps/web/app/profile/[address]/ProfileClient.tsx`** (241 ln, the real edit surface) | `maxWidth:680px` (line 57). Stat row `flexDirection:'row' flexWrap:'wrap'` (line 114) — already wraps. **CATEGORY REPUTATION grid**: `flexDirection:'row'` with 3 cards `flex:'1 1 0' minWidth:160px` (lines 128–130) → 3×160=480 > 343, will wrap awkwardly; force `column` at mobile. Also `apps/web/components/ProfileTabs.tsx` (94 ln) tab row. |
| 5 | Leaderboard (§15.6) | `apps/web/app/leaderboard/page.tsx` (Server Component, 34 ln) → **`apps/web/app/leaderboard/LeaderboardClient.tsx`** (282 ln, the real edit surface) | `maxWidth:760px` (line 68). **Table header/rows** are fixed-width columns: `width:48/80/72px` cells in `flexDirection:'row'` (lines 218–223, 253) → at 375px the row total may exceed width; reduce columns or allow horizontal-scroll-free stacking. The viewer's-own-row accent must survive. |
| 6 | Sign-in (§15.8) | `apps/web/app/signin/page.tsx` (198 ln, `'use client'`) + `apps/web/app/signin/SignInButtons.tsx` | Already centered `flexDirection:'column' maxWidth:400px minHeight:100vh` (lines 128–170) — **mostly mobile-ready**. Verify 4px corner brackets + 480px frame (UI-24) don't overflow at 375px; buttons already `width:100%`. Lightest page. |
| 7 | Onboarding (§15.9) | layout: `apps/web/app/onboarding/layout.tsx` (`maxWidth:480px`, line 110) + 5 subroutes: `onboarding/{handle,socials,follow-graph,fund,tagline}/page.tsx` | Layout already `flexDirection:'column' maxWidth:480px` — close to mobile-ready. Per-screen forms use `flexDirection:'column'` + `width:100%` inputs (handle/page.tsx lines 124–136). Verify each of the **5** subroutes individually; 480px > 375px so the layout frame needs `width:100%`/padding clamp. |

### Banner pages (IN SCOPE — banner only, NOT responsive)
| Page | File | Note |
|------|------|------|
| New Call (§15.2) | `apps/web/app/new/page.tsx` (380 ln) | Split layout form-left/preview-right (`flexDirection:'row'`). Banner at top. |
| Quote composer (§15.10) | **SAME FILE** `apps/web/app/new/page.tsx` in `?quote=` mode | **RESOLVED:** no standalone route. `useSearchParams().get('quote')` (line 45) drives `isQuoteMode`. Banner on `/new` covers it — **no separate banner file.** |
| Duel (§15.5) | `apps/web/app/duel/[challengeId]/page.tsx` (1,053 ln) | Two-column duel card. Banner at top. |

**Net banner mount sites: TWO files** — `app/new/page.tsx` and `app/duel/[challengeId]/page.tsx`.

### In-scope modals / shared components (D-04)
| Component | File | Mobile-readiness |
|-----------|------|------------------|
| FollowFadeModal | `packages/ui/src/compound/FollowFadeModal.tsx` | **Already mobile-safe** — `width:440px, maxWidth:'calc(100vw - 32px)'` (lines 184–185). Verify internal button rows stack. |
| CallerExitModal | `packages/ui/src/compound/CallerExitModal.tsx` | Verify width clamp matches FollowFadeModal pattern. |
| PositionExitModal | `packages/ui/src/compound/PositionExitModal.tsx` | Verify width clamp. |
| ChallengeFormModal | `apps/web/app/components/ChallengeFormModal.tsx` | Panel `width:100% maxWidth:480px` (lines 336–337). 100% width is fine but ensure the fixed overlay has horizontal padding so 480px doesn't touch edges; internal `flexDirection:'row'` rows (line 614 etc.) stack. |
| DisputeModal | inline in `call/[id]/page.tsx` (line 463) | Panel `maxWidth:480px` (line 600). Same clamp guidance. |
| ProvenanceModal | inline in `call/[id]/page.tsx` (line 784) | Panel `maxWidth:560px` (line 818) → **overflows 375px** (560 > 343 inner). Add `maxWidth:'calc(100vw - 32px)'` clamp. |
| CallCard / Receipt / ProfileHeader | `packages/ui/src/compound/*` | In scope where a critical page renders them. NOTE: these also feed the OG/Satori path — keep responsive logic out of the shared component internals; pass mobile styles via props or wrap at the page level to avoid touching the OG render. |

## Common Pitfalls

### Pitfall 1: Hydration mismatch from reading viewport during render
**What goes wrong:** A hook that reads `matchMedia`/`innerWidth` synchronously returns the desktop value on a desktop client's first render, mismatching the server's `true` snapshot → React hydration warning / DOM thrash.
**Why it happens:** `force-dynamic` + `ssr:false` providers still server-render once; the snapshot must equal the first client render.
**How to avoid:** Default the hook to `true` until `useEffect`/`subscribe` runs (Pattern 1). Never branch layout on a render-time viewport read.
**Warning signs:** "Hydration failed because the initial UI does not match" in console; layout flashing on every desktop load beyond the single intended reflow.

### Pitfall 2: `packages/ui` shared components break the OG/Satori build
**What goes wrong:** Adding `useIsMobile`/`matchMedia` inside `CallCard`/`Receipt`/`ProfileHeader` (which the OG image path renders) introduces browser APIs into the Satori render → build/runtime error.
**Why it happens:** Satori renders React to SVG server-side; `window` is undefined.
**How to avoid:** Keep the hook in `apps/web`. Apply mobile styling at the page level or via props, not inside shared `packages/ui` internals. (Also recall Satori supports flexbox only — Pitfall 15 — so no grid creeps in via shared components.)
**Warning signs:** OG snapshot tests (`og-thumbnail-200px.spec.ts`, `og-fallback.spec.ts`) failing after a `packages/ui` edit.

### Pitfall 3: Horizontal scroll from fixed-width inner cells
**What goes wrong:** `DuelRowCard` (feed) two `minWidth:120px` cells, Leaderboard fixed `width:48/80/72px` columns, ProvenanceModal `maxWidth:560px`, Profile CATEGORY grid `3 × minWidth:160px` — each can exceed the 343px inner width at 375px → page horizontal scroll → SC1 fail.
**Why it happens:** `minWidth`/fixed `width` ignore the viewport.
**How to avoid:** At `isMobile`, stack to `column`, drop/reduce `minWidth`, or clamp with `maxWidth:'calc(100vw - 32px)'`. Assert `document.documentElement.scrollWidth <= clientWidth` in Playwright (catches all of these mechanically).
**Warning signs:** Playwright `scrollWidth` assertion fails on a specific page.

### Pitfall 4: 96px outcome hero clips at 375px (SC3 + §14.6)
**What goes wrong:** Syne 96px "LOUD AND WRONG" (the longest word) overflows 375px; auto-shrink or wrap could kill legibility — and SC3 requires the outcome word legible (ties to Phase 7's 200px-readability gate, SHARE-12/UI-18).
**Why it happens:** Hero font is hard-coded `fontSize:'96px'` (line 1511, `call/[id]/page.tsx`).
**How to avoid:** At `isMobile`, reduce hero to a size that fits the longest variant ("FADED CORRECTLY"/"LOUD AND WRONG") within 343px while staying legible — recommend `clamp`-style fixed mobile value (e.g., 40–52px) chosen by measuring the longest word; keep the 3px border + hard offset shadow + accent color (neobrutalist register preserved). The existing 200px OG snapshot test is a reference for "what legible looks like small." Validate with a Playwright bounding-box assertion (outcome element width ≤ viewport, fontSize ≥ a floor).
**Warning signs:** Outcome word wraps to 2+ lines or its bounding box exceeds viewport in the 375px Playwright run.

### Pitfall 5: Drawer auth-state flicker / wrong destinations
**What goes wrong:** Privy `authenticated` is `false` during the brief un-ready window → drawer shows "Sign in" then flips, or shows New Call/Profile to logged-out users.
**Why it happens:** Privy hooks resolve async (`ready` flag).
**How to avoid:** Gate New Call + Profile on `authenticated && ready`; match the feed's existing auth-aware CTA logic. Keep the bell pinned regardless (D-06).
**Warning signs:** Logged-out user briefly sees authenticated links.

## Code Examples

### Setting mobile viewports in Playwright (D-10a)
```typescript
// Source: apps/web/tests/og-thumbnail-200px.spec.ts:121 (setViewportSize) + Playwright docs
import { test, expect, devices } from '@playwright/test';

// Option A — explicit sizes (375 = iPhone SE/“critical” breakpoint; 390 = iPhone 12/13/14)
for (const width of [375, 390]) {
  test(`no horizontal scroll at ${width}px on settled receipt`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/call/14'); // seeded CallerLost settled call (Phase 7 baseline)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(overflow).toBe(true);
  });
}
```

### Mechanical assertions (single-column, ≥44px, outcome legible)
```typescript
// No horizontal scroll (applies to every critical page)
const noHScroll = await page.evaluate(
  () => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
expect(noHScroll).toBe(true);

// Touch targets ≥ 44×44 (D-03) — sample interactive elements
const small = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll('button, a[href], [role="button"]'));
  return els
    .map(el => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height, vis: r.width > 0 && r.height > 0 }; })
    .filter(b => b.vis && (b.h < 44 || b.w < 44)).length;
});
expect(small).toBe(0);

// Action buttons full-width stacked: same x, full width (UI-49/UI-20)
// Compare bounding boxes of the two action buttons — equal left, ~equal width near viewport.

// Outcome word legible (SC3): element fits viewport, font not below floor
const ok = await page.evaluate(() => {
  const el = document.querySelector('[data-outcome-word]'); // add this test hook to the hero
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const fs = parseFloat(getComputedStyle(el).fontSize);
  return r.right <= window.innerWidth && r.left >= 0 && fs >= 36; // floor TBD by design
});
expect(ok).toBe(true);
```
*Recommend adding a `data-outcome-word` attribute to the outcome hero `<p>` (line 1509, `call/[id]/page.tsx`) so the legibility assertion is stable.*

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `useState` + manual `resize` listener for breakpoints | `useSyncExternalStore` with `getServerSnapshot` for SSR-safety | React 18 (2022) | For D-02's "default true" requirement, the `useState`+effect form is still the simplest correct option; `useSyncExternalStore` is the more general primitive. Both are current and acceptable. `[CITED: tkdodo.eu, react.dev]` |
| CSS `@media` breakpoints | (Not applicable here) | — | Blocked by the inline-style architecture (D-01). Documented for completeness only. |

**Deprecated/outdated:** Nothing in this phase relies on deprecated APIs.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `useState(true)`+effect has no measurable perf downside vs `useSyncExternalStore` at this app's scale | Standard Stack / Alternatives | Low — both reflow once; if concurrent-rendering tearing ever matters, switch to the `useSyncExternalStore` form (already provided). |
| A2 | Outcome-hero mobile font floor (~36–52px) keeps all 5 variants legible at 375px | Pitfall 4 / Code Examples | Medium — the exact size must be tuned by the operator/design against the longest variant; the Playwright floor is a guard, not a design decision. Confirm with the SC3 real-device check. |
| A3 | Per-page `useState` session-dismiss satisfies D-09 "dismissible for the session" | Pattern 3 | Low — if the user expects a single cross-page dismiss, lift to `sessionStorage` (trivial change). |
| A4 | Leaderboard fixed-width columns can be made no-horizontal-scroll by reducing/stacking columns without losing required data (UI-13 columns) | File Inventory / Pitfall 3 | Medium — UI-13 specifies columns (#/CALLER/REP/ACC/BEST/Δ7D sparkline); at 375px some may need to drop or compress. Planner should decide which columns survive mobile vs. desktop. |
| A5 | The 375px breakpoint device target maps to the Playwright 375/390 viewports adequately for the CI gate | Validation Architecture | Low — 375 (iPhone SE / spec breakpoint) + 390 (modern iPhone) cover the stated targets; real-device gate (D-11) backstops anything CI misses. |

## Open Questions

1. **Leaderboard mobile column set (UI-13)**
   - What we know: Desktop has #/CALLER/REP/ACC/BEST-category/Δ7D-sparkline (fixed-width cells, lines 218–276 `LeaderboardClient.tsx`).
   - What's unclear: Which columns survive at 375px (sparkline + BEST category likely drop or move to a second line).
   - Recommendation: Planner picks a mobile column subset; keep #, CALLER, REP at minimum; stack the rest or hide behind expand. Preserve viewer's-own-row accent.

2. **Settled Receipt 4-stat row at 375px (UI-19)**
   - What we know: 4 cells `flex:1` in a `flexDirection:'row'` (line 1567). 4 × ~85px ≈ borderline at 343px inner.
   - What's unclear: 1×4 row vs 2×2 stack at mobile.
   - Recommendation: 2×2 flex-wrap at mobile (preserves dividers, avoids cramped single-row). Validate no-overflow in Playwright.

3. **Exact outcome-hero mobile font size (Pitfall 4 / A2)**
   - What we know: 96px desktop; longest variants are "LOUD AND WRONG" / "FADED CORRECTLY".
   - What's unclear: The legible-but-fitting mobile size.
   - Recommendation: Operator/design tunes against the longest word at 375px during the D-10b real-device check; Playwright enforces a floor + no-overflow.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@playwright/test` + Chromium | D-10a responsive specs | ✓ | installed (`playwright.config.ts`) | — |
| Real iPhone (Safari) | D-10b / D-11 SC3 sign-off | Operator-provided | — | **None — hard gate (D-11).** Phase completion is intentionally coupled to operator device availability. |
| Real Android (Chrome) | D-10b / D-11 SC3 sign-off | Operator-provided | — | **None — hard gate (D-11).** |
| Deployed Sepolia web (Vercel) | Real-device share→receipt landing | ✓ (`call-it-web-sepolia`, from MEMORY) | live | Local `pnpm start` + tunnel if device can't reach localhost |
| Seeded settled call (#14 CallerLost) | Settled Receipt mobile validation | ✓ (Phase 7 seeded) | — | Seed another settled call if #14 state changes |

**Missing dependencies with no fallback:** Real iOS + Android devices for the D-11 operator gate. This is by design (D-11) — automated Playwright is NOT a substitute for the device sign-off.
**Missing dependencies with fallback:** None blocking the CI-safe code; all code work proceeds without the devices, but Phase 9 cannot be marked complete until the operator runs the device check.

## Validation Architecture

> nyquist_validation is not disabled in `.planning/config.json` (key absent ⇒ enabled).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `@playwright/test` (Chromium project) |
| Config file | `apps/web/playwright.config.ts` |
| Quick run command | `cd apps/web && pnpm exec playwright test tests/responsive.spec.ts` |
| Full suite command | `cd apps/web && pnpm build && pnpm exec playwright test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UI-48 | Each of 7 pages renders without horizontal scroll at 375/390px | e2e (viewport) | `playwright test tests/responsive.spec.ts -g "no horizontal scroll"` | ❌ Wave 0 |
| UI-49 | Single-column + full-width action buttons; hamburger drawer present at mobile; bell pinned | e2e (viewport) | `playwright test tests/responsive.spec.ts -g "single column\|full-width\|drawer"` | ❌ Wave 0 |
| UI-49 | Touch targets ≥ 44×44 at mobile (D-03) | e2e (viewport) | `playwright test tests/responsive.spec.ts -g "touch target"` | ❌ Wave 0 |
| UI-50 | Banner renders at mobile on `/new` (+`?quote=`) and `/duel/[id]`; absent on critical pages; absent at desktop | e2e + source | `playwright test tests/responsive.spec.ts -g "desktop-only banner"` | ❌ Wave 0 |
| SC3 | Outcome word legible (fits viewport, ≥ font floor) on settled receipt at 375px | e2e (bounding box) | `playwright test tests/responsive.spec.ts -g "outcome word legible"` | ❌ Wave 0 |
| D-01/D-02 | `useIsMobile` returns true on server snapshot (no hydration mismatch) | unit/source | `playwright test tests/responsive.spec.ts -g "hydration\|server snapshot"` (or a Vitest source assertion) | ❌ Wave 0 |
| SC3 (manual) | iOS Safari + Android Chrome share→receipt landing flow | manual-only (D-10b/D-11) | `checkpoint:human-verify` — operator runs on device | n/a |

### Sampling Rate
- **Per task commit:** `pnpm exec playwright test tests/responsive.spec.ts -g "<page under edit>"` (scoped to the page being retrofit).
- **Per wave merge:** `cd apps/web && pnpm build && pnpm exec playwright test tests/responsive.spec.ts` (full responsive suite).
- **Phase gate:** Full `apps/web` Playwright suite green (regression guard — must not break `quote-composer.spec.ts` "no grid", OG snapshots, signin) **AND** operator real-device sign-off (D-11, both hard gates).

### Wave 0 Gaps
- [ ] `apps/web/tests/responsive.spec.ts` — covers UI-48/UI-49/UI-50/SC3 mechanical assertions at 375/390px
- [ ] `apps/web/app/hooks/useIsMobile.ts` — must exist before any page can be retrofit (foundational; Wave 1 task 1)
- [ ] `data-outcome-word` test hook on the outcome hero `<p>` (`call/[id]/page.tsx` ~line 1509) for the legibility assertion
- [ ] (Optional) A source/unit assertion that `useIsMobile` `getServerSnapshot`/default is `true` (D-02 lock), mirroring how `signin.spec.ts` does Tier-1 source assertions
- Framework install: none — Playwright already present.

## Security Domain

> `security_enforcement` not set to `false` — section included. This is a presentation-layer responsive retrofit; security surface is minimal.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth changes; drawer reuses Privy `usePrivy()` login/logout — no new auth path. |
| V3 Session Management | no | No session changes. |
| V4 Access Control | minimal | Drawer destinations are auth-gated *for UX only* (D-06); real access control remains server/contract-side (e.g., relayer `privySessionPreHandler`). Do NOT treat hiding a link as access control. |
| V5 Input Validation | no | No new inputs; banner/drawer take no user data. |
| V6 Cryptography | no | None. |

### Known Threat Patterns for {Next.js client responsive retrofit}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client-side "hidden" New Call/Profile links mistaken for access control | Elevation of Privilege | Authorization stays server-side (relayer session auth, contract gates). Drawer gating is cosmetic only. |
| Drawer exposing logout that doesn't fully clear session | Spoofing | Use Privy `logout()` (same as existing flows); do not hand-roll session teardown. |
| `dangerouslySetInnerHTML` / unescaped strings in new components | XSS | None introduced — banner/drawer render static copy + Privy-provided handle/address (already rendered elsewhere safely). |

## Sources

### Primary (HIGH confidence)
- Codebase (verified via Read/Grep): `apps/web/app/layout.tsx` (force-dynamic), `components/GlobalNav.tsx`, `components/NotificationInbox.tsx` (slide-over pattern), `app/page.tsx` (feed/DuelRowCard landmines), `app/call/[id]/page.tsx` (outcome hero 96px, modals, two-column), `app/profile/[address]/ProfileClient.tsx`, `app/leaderboard/LeaderboardClient.tsx`, `app/signin/page.tsx`, `app/onboarding/*`, `app/new/page.tsx` (`?quote=` resolution), `packages/ui/src/compound/FollowFadeModal.tsx` (calc(100vw-32px)), `apps/web/playwright.config.ts`, `tests/og-thumbnail-200px.spec.ts` (setViewportSize), `tests/quote-composer.spec.ts` (no-grid assertion).
- `.planning/phases/09-.../09-CONTEXT.md` (D-01..D-11), `.planning/REQUIREMENTS.md` (UI-48/49/50, UI-20/24), `.planning/ROADMAP.md` (Phase 9 SC1–3).
- React `useSyncExternalStore` SSR semantics — [tkdodo.eu: Avoiding Hydration Mismatches with useSyncExternalStore](https://tkdodo.eu/blog/avoiding-hydration-mismatches-with-use-sync-external-store)

### Secondary (MEDIUM confidence)
- [ReactUse: SSR-Safe React Hooks](https://reactuse.com/blog/ssr-safe-react-hooks/) — patterns for media-query SSR safety (cross-checked against tkdodo).

### Tertiary (LOW confidence)
- None required — hook pattern is verified against an authoritative source AND the existing in-repo SSR architecture.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; all libs verified present in repo.
- Architecture (hook, drawer, banner): HIGH — hook pattern cross-verified (tkdodo + React docs) and grounded in the verified `force-dynamic`/`ssr:false` setup; drawer mirrors an existing, read component.
- File inventory / landmines: HIGH — every path and landmine line number read directly from source.
- Quote-composer resolution: HIGH — confirmed `/new?quote=` via `useSearchParams` in `app/new/page.tsx`.
- Pitfalls: HIGH — derived from concrete code (96px hero, fixed-width cells, OG/Satori shared-component coupling).
- Outcome-hero exact mobile size: MEDIUM — needs design/operator tuning (A2), guarded by a Playwright floor.

**Research date:** 2026-06-09
**Valid until:** 2026-07-09 (stable — inline-style architecture + React/Next versions are pinned; no fast-moving external dependency).
