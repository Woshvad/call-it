---
phase: 09-mobile-responsive-on-7-critical-pages
plan: 02
subsystem: web-frontend
tags: [responsive, mobile-nav, hamburger, slide-over, privy, neobrutalist]

# Dependency graph
requires:
  - phase: 09-mobile-responsive-on-7-critical-pages
    provides: "apps/web/app/hooks/useIsMobile.ts — SSR-safe useIsMobile() hook (09-01)"
  - phase: 02-followfademarket
    provides: "apps/web/app/components/NotificationInbox.tsx + GlobalNav.tsx + NotificationBell.tsx (02-09 slide-over + nav analog)"
provides:
  - "apps/web/app/components/MobileDrawer.tsx — left-anchored auth-aware slide-over nav drawer (UI-49/D-05/D-06)"
  - "apps/web/app/components/GlobalNav.tsx (modified) — mobile-only hamburger trigger + drawer open-state; NotificationBell still pinned (D-06)"
affects: [phase-09-04-banner, phase-09-03..07-page-retrofits]

# Tech tracking
tech-stack:
  added: []  # zero new runtime deps — react@19, next/link, @privy-io/react-auth, wagmi all present
  patterns:
    - "Left-anchored slide-over mirrors NotificationInbox: Esc-close useEffect + panelRef backdrop-click + zIndex:50 rgba(9,9,14,0.6) backdrop; panel left:0, width 'min(300px,85vw)', boxShadow '4px 0 0 0 #E8F542'"
    - "Auth-aware nav gating: Profile + New Call inside (authenticated && ready) (Pitfall 5 — no auth-flicker); Sign in/Sign out toggled on authenticated; logout() = existing Privy teardown"
    - "Parent (GlobalNav) owns isMobile gate + drawer open-state; drawer is pure (no useIsMobile import) and self-gates on open so it is safe to always mount"

key-files:
  created:
    - apps/web/app/components/MobileDrawer.tsx
  modified:
    - apps/web/app/components/GlobalNav.tsx

decisions:
  - "Profile href resolves the connected address via useAccount() from wagmi — the exact source NotificationBell already uses (NotificationBell.tsx:24,68); no new fetch invented. Profile link suppressed when address is undefined even while authenticated && ready (defensive)."
  - "Drawer imports NO useIsMobile (kept pure per the plan); visibility/mobile-gate is owned by GlobalNav. Drawer renders null when !open."
  - "Hamburger uses transparent background, no border (UI-SPEC accent-reservation: the glyph is the only accent addition); marginLeft:-10 offsets the 44px hit-area padding so the glyph aligns with the wordmark edge."

requirements-completed: [UI-49]

# Metrics
duration: 4min
completed: 2026-06-09
---

# Phase 9 Plan 02: Mobile Navigation Drawer Summary

**Left-anchored auth-aware `MobileDrawer` (structural mirror of `NotificationInbox`, anchored left with `boxShadow:'4px 0 0 0 #E8F542'`) plus a mobile-only `☰` hamburger trigger in `GlobalNav` that owns the drawer open-state — the only global mobile-navigation surface (UI-49), with the NotificationBell left pinned in the top bar (D-06) and zero new runtime dependencies.**

## Accomplishments

- **`apps/web/app/components/MobileDrawer.tsx`** (new) — `'use client'`, exports `MobileDrawer({ open, onClose })`; renders `null` when `!open`. Reuses verbatim from `NotificationInbox`: the Esc-close `useEffect` (`e.key === 'Escape' → onClose()`), the `panelRef` + `handleBackdropClick` (close when click target is outside the panel), and the backdrop tokens `position:'fixed', inset:0, zIndex:50, background:'rgba(9,9,14,0.6)'`. Panel deltas vs NotificationInbox per 09-PATTERNS: `left:0` (was `right:0`), `width:'min(300px, 85vw)'` (was 380), `borderRight:'3px solid #E8F542'` via `border:'3px solid #E8F542'` + `borderLeft/Top/Bottom:'none'`, `boxShadow:'4px 0 0 0 #E8F542'` (was `'-4px 0 0 0 #E8F542'`), `background:'#09090E'`, `display:'flex', flexDirection:'column', padding:'20px'`. Auth-aware destinations (D-06) via `usePrivy()` reading `authenticated, ready, logout`: Feed (`/`) + Leaderboard (`/leaderboard`) ALWAYS; Profile (`/profile/{address}`) + New Call (`/new`) ONLY inside `authenticated && ready` (Pitfall 5); `Sign in` (`/signin` Link) when `!authenticated`, `Sign out` (calls `logout()` then `onClose()`) when `authenticated`. Each destination is a `<Link onClick={onClose}>` (or the Sign-out button), neobrutalist (monospace/uppercase, `2px` border + `3px 3px 0 0` hard offset shadow), `minHeight:44` (D-03). Profile address resolved via `useAccount()` (same source NotificationBell uses).
- **`apps/web/app/components/GlobalNav.tsx`** (modified) — imports `useIsMobile` (`../hooks/useIsMobile`) and `MobileDrawer` (`./MobileDrawer`); `const isMobile = useIsMobile()` + `const [drawerOpen, setDrawerOpen] = useState(false)`. A `<button aria-label="Open menu">` (glyph `☰`, color `#E8F542`, `minWidth:44, minHeight:44`, transparent, no border) renders to the LEFT of the wordmark ONLY when `isMobile`, wrapped with the wordmark in a flex row. `<MobileDrawer open={drawerOpen} onClose={…} />` is always mounted (self-gates on `open`). `NotificationBell` stays pinned right. The `height:52` bar and wordmark are untouched — desktop layout unchanged.

## Task Commits

1. **Task 1: MobileDrawer.tsx — left-anchored auth-aware slide-over** — `d21fda6` (feat)
2. **Task 2: GlobalNav.tsx — hamburger trigger (mobile only), bell stays pinned** — `3a66dca` (feat)

## Verification

- **Task 1** — `cd apps/web && pnpm exec tsc --noEmit -p tsconfig.json`: no errors in `MobileDrawer.tsx`. The only `tsc` errors are the two pre-existing out-of-scope test files (`farcaster-embed.test.ts` TS2345, `farcaster-manifest.test.ts` TS6307) documented in 09-01-SUMMARY (predate this plan at commit `0236f3d`).
- **Task 2** — `cd apps/web && pnpm build` exits **0** (full route table built, including `/`, `/leaderboard`, `/new`, `/profile/[address]`, `/signin`).
- **Regression** — `playwright test tests/responsive.spec.ts -g "touch target"`: **18 skipped, 0 failed**. The touch-target assertions are Tier-2 viewport tests gated on a real `NEXT_PUBLIC_PRIVY_APP_ID` + running server (per 09-01 design); they skip in CI. No regression introduced — the new hamburger carries `minWidth:44, minHeight:44` so it satisfies the gate when run live.

## Decisions Made

1. **Profile address from `useAccount()` (wagmi)** — the Profile href reuses the exact address source `NotificationBell` already uses (`NotificationBell.tsx:24` `import { useAccount }`, `:68` `const { address } = useAccount()`); no new resolver invented. The Profile link is additionally suppressed when `address` is undefined (defensive; `authenticated && ready` can briefly precede wallet hydration).
2. **Drawer stays pure (no `useIsMobile`)** — per the plan, all mobile-gating lives in the parent `GlobalNav`. `MobileDrawer` renders `null` on `!open` and is mounted unconditionally; only the hamburger trigger is `isMobile`-gated.
3. **Hamburger is borderless transparent with the accent glyph only** — UI-SPEC accent-reservation lists the hamburger glyph as the single accent addition; the button has no accent border. `marginLeft:-10` offsets the 44px hit-area so the glyph optically aligns with the wordmark.

## Deviations from Plan

None — plan executed exactly as written. (The defensive `address &&` guard on the Profile link and the `marginLeft:-10` optical offset are within the plan's "Claude's-discretion" latitude on styling and href resolution; neither changes scope or the auth-gating contract.)

## Threat Surface Scan

No new network endpoint, input, auth path, or schema change. The drawer reads existing `usePrivy()` / `useAccount()` state and exposes only the existing `logout()` teardown. Per the plan threat model: T-09-02-01 (destination gating) mitigated — Profile/New Call/Sign-out render ONLY inside `authenticated && ready`; T-09-02-02 (Privy spoofing) accepted — no new auth path; T-09-02-SC (supply-chain) moot — zero installs. The UX gate is NOT the security boundary (server-side route auth + the Phase-8 CR-01 fix remain unchanged).

## Known Stubs

None. The drawer's data is live (`usePrivy`/`useAccount`); all destinations route to real pages.

## Self-Check: PASSED

- [x] `apps/web/app/components/MobileDrawer.tsx` exists on disk
- [x] `apps/web/app/components/GlobalNav.tsx` modified (hamburger + MobileDrawer mount)
- [x] Commit `d21fda6` (Task 1) exists in git log
- [x] Commit `3a66dca` (Task 2) exists in git log
- [x] MobileDrawer imports `usePrivy` from `@privy-io/react-auth`; reads `authenticated, ready, logout`
- [x] Panel left-anchored (`left: 0`, `boxShadow: '4px 0 0 0 #E8F542'`); backdrop `rgba(9,9,14,0.6)` `zIndex:50`
- [x] Profile + New Call inside `authenticated && ready`; `Sign out` calls `logout()`
- [x] GlobalNav imports `useIsMobile` + `MobileDrawer`; hamburger `aria-label="Open menu"` gated on `isMobile`, ≥44×44; `NotificationBell` still rendered
- [x] `cd apps/web && pnpm build` exits 0

---
*Phase: 09-mobile-responsive-on-7-critical-pages*
*Completed: 2026-06-09*
