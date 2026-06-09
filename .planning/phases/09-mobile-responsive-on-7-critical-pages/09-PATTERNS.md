# Phase 9: Mobile responsive on 7 critical pages - Pattern Map

**Mapped:** 2026-06-09
**Files analyzed:** 24 (3 new components/hook + 1 new spec + 20 modified surfaces)
**Analogs found:** 24 / 24 (every surface has an in-repo analog — this is a retrofit, zero greenfield)

> House style (the single most important constraint): **all layout is inline `style={{}}` objects** with per-file `COLORS`-style consts and hardcoded hex tokens. There are zero CSS media queries and zero Tailwind layout/responsive variants in `apps/web/app`. Responsiveness is delivered ONLY by `isMobile ? mobileStyle : desktopStyle` swaps (D-01). `display: grid` is BANNED (Satori OG coupling + `quote-composer.spec.ts` asserts no grid). Stacking is always `flexDirection: 'row'` → `'column'`. Replicate this register exactly; do not introduce className-based layout, CSS modules, or `@media`.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| **NEW** `apps/web/app/hooks/useIsMobile.ts` | hook | event-driven (matchMedia) | React `useSyncExternalStore` docs pattern (no in-repo hook analog) | role-match (no existing custom hook; pattern from research) |
| **NEW** `apps/web/app/components/MobileDrawer.tsx` | component | event-driven (open/close) | `apps/web/app/components/NotificationInbox.tsx` | exact (slide-over mirror) |
| **NEW** `apps/web/app/components/DesktopOnlyBanner.tsx` | component | request-response (render-gate) | `NotificationInbox` card styling + research skeleton | role-match |
| **NEW** `apps/web/tests/responsive.spec.ts` | test | e2e/source | `apps/web/tests/signin.spec.ts` + `playwright.config.ts` | exact (Tier-1 source + Tier-2 viewport) |
| **MOD** `apps/web/app/components/GlobalNav.tsx` | component | — (mount point) | self (add hamburger left, keep bell) | exact |
| **MOD** `apps/web/app/layout.tsx` | config/layout | — (mount point) | self (Server Component, force-dynamic) | exact |
| **MOD** `apps/web/app/page.tsx` (Feed) | page | request-response | self + container/row-stack pattern | exact |
| **MOD** `apps/web/app/call/[id]/page.tsx` (Live + Settled) | page | request-response | self (2675 lines — targeted edits) | exact |
| **MOD** `apps/web/app/profile/[address]/ProfileClient.tsx` | component | request-response | self (Tailwind typography classNames stay) | exact |
| **MOD** `apps/web/app/leaderboard/LeaderboardClient.tsx` | component | request-response | self (4-col row, see Divergence #1) | exact |
| **MOD** `apps/web/app/signin/page.tsx` | page | request-response | self (maxWidth 400px clamp) | exact |
| **MOD** `apps/web/app/onboarding/layout.tsx` + 5 subroutes | page/layout | request-response | self (column forms) | exact |
| **MOD** `apps/web/components/ProfileTabs.tsx` | component | — | self (tab row → 44px) | exact |
| **MOD** `packages/ui/src/compound/FollowFadeModal.tsx` | component | — (verify only) | self (already clamped) | exact |
| **MOD** `packages/ui/src/compound/CallerExitModal.tsx` | component | — (verify only) | self (already clamped) | exact |
| **MOD** `packages/ui/src/compound/PositionExitModal.tsx` | component | — (verify only) | self (already clamped) | exact |
| **MOD** `apps/web/app/components/ChallengeFormModal.tsx` | component | — | FollowFadeModal clamp | role-match |
| **MOD** `DisputeModal` (inline in `call/[id]/page.tsx`) | component | — | FollowFadeModal clamp | role-match |
| **MOD** `ProvenanceModal` (inline in `call/[id]/page.tsx`) | component | — | FollowFadeModal clamp (MUST clamp — overflows) | role-match |
| **MOD** `apps/web/app/new/page.tsx` (incl `?quote=`) | page | — (banner mount) | DesktopOnlyBanner mount | exact |
| **MOD** `apps/web/app/duel/[challengeId]/page.tsx` | page | — (banner mount) | DesktopOnlyBanner mount | exact |

---

## Pattern Assignments

### `apps/web/app/hooks/useIsMobile.ts` (hook, event-driven) — NEW

**Analog:** No in-repo custom hook exists. Use the verified `useSyncExternalStore` pattern from 09-RESEARCH.md Pattern 1 (React docs server-snapshot arg). Lives in `apps/web` ONLY — never `packages/ui` (Pitfall 2: would pull `matchMedia` into the Satori/OG Node build).

**Core pattern (copy verbatim — verified in RESEARCH.md:151-179):**
```typescript
'use client';
import { useSyncExternalStore } from 'react';

const QUERY = '(max-width: 767px)'; // < 768px ⇒ mobile (single breakpoint, Claude's discretion)

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}
function getSnapshot(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia
    ? window.matchMedia(QUERY).matches : true;
}
function getServerSnapshot(): boolean { return true; } // D-02 mobile-first first paint

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```
**Why hydration-safe:** server HTML and first client render both use `getServerSnapshot()` → match → one quiet reflow on desktop after mount (D-02). Use `addEventListener('change')`, never deprecated `addListener`.

---

### `apps/web/app/components/MobileDrawer.tsx` (component, event-driven) — NEW

**Analog:** `apps/web/app/components/NotificationInbox.tsx` — structural mirror, anchored LEFT instead of right.

**Esc-close pattern** (copy verbatim from `NotificationInbox.tsx:169-175`):
```typescript
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, [onClose]);
```

**Backdrop-click-close pattern** (copy from `NotificationInbox.tsx:215-222`):
```typescript
const panelRef = useRef<HTMLDivElement>(null);
const handleBackdropClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
  if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
}, [onClose]);
```

**Backdrop + panel JSX** (mirror `NotificationInbox.tsx:236-266`, flip to LEFT). Backdrop unchanged; panel changes marked:
```typescript
{/* Backdrop — copy exactly */}
<div onClick={handleBackdropClick} style={{
  position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(9,9,14,0.6)',
}}>
  {/* Panel — LEFT-anchored mobile drawer */}
  <div ref={panelRef} style={{
    position: 'fixed', top: 0,
    left: 0,                              // was right: 0
    width: 'min(300px, 85vw)',           // was width: 380
    height: '100vh', background: '#09090E',
    border: '3px solid #E8F542',
    borderLeft: 'none', borderTop: 'none', borderBottom: 'none',  // was borderRight: 'none'
    boxShadow: '4px 0 0 0 #E8F542',      // was '-4px 0 0 0 #E8F542'
    display: 'flex', flexDirection: 'column', overflowY: 'hidden',
  }}>
```

**Auth-aware destinations (D-06)** — mirror Privy usage from `NotificationInbox.tsx:28,166`:
```typescript
import { usePrivy } from '@privy-io/react-auth';
const { authenticated, ready, logout } = usePrivy();
// Feed + Leaderboard always; Profile + New Call gated on (authenticated && ready) (Pitfall 5);
// Sign in / Sign out toggles on authenticated. Each <Link onClick={onClose}>, each ≥44px tall.
```

---

### `apps/web/app/components/DesktopOnlyBanner.tsx` (component, render-gate) — NEW

**Analog:** Neobrutalist card styling from `NotificationInbox` + verified skeleton in RESEARCH.md:316-345.

**Core pattern (copy from RESEARCH.md:316-345):**
```typescript
'use client';
import { useState } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';

export function DesktopOnlyBanner() {
  const isMobile = useIsMobile();
  const [dismissed, setDismissed] = useState(false);
  if (!isMobile || dismissed) return null;   // absent at desktop, per-session dismiss (D-09)
  return (
    <div style={{
      border: '3px solid #E8F542', boxShadow: '4px 4px 0 0 #E8F542',
      background: '#13131D', padding: '12px 14px', margin: '12px 16px',
      display: 'flex', flexDirection: 'row', justifyContent: 'space-between',
      alignItems: 'flex-start', gap: '12px',
    }}>
      {/* heading "Best viewed on desktop" + subtext (UI-SPEC Copywriting) */}
      <button onClick={() => setDismissed(true)} aria-label="Dismiss"
        style={{ minWidth: 44, minHeight: 44, background: 'transparent',
                 border: 'none', color: '#E8F542', fontSize: 20, cursor: 'pointer' }}>×</button>
    </div>
  );
}
```
Mount at the VERY TOP of `/new` and `/duel/[challengeId]` returned tree (pushes content down, not overlay — D-08).

---

### `apps/web/tests/responsive.spec.ts` (test, e2e + source) — NEW

**Analog:** `apps/web/tests/signin.spec.ts` (Tier-1 source assertions via `readFileSync`) + `playwright.config.ts`.

**Critical config fact** (`playwright.config.ts:34-39`): the ONLY project is `chromium` / `devices['Desktop Chrome']`. `testMatch: ['**/*.spec.ts']` auto-picks the new file, BUT a viewport-less spec runs at desktop width and passes vacuously (Pitfall 6). **Viewport MUST be set in-spec:**
```typescript
test.describe(`@${width}px`, () => {
  test.use({ viewport: { width, height: 812 } }); // 375 + 390 variants
```

**Mechanical assertions** (from RESEARCH.md:348-383): no horizontal scroll (`document.documentElement.scrollWidth <= clientWidth`); all `button, a[href], [role="button"]` ≥44×44px; outcome word `fontSize >= 36` AND bounding box within viewport via `[data-outcome-word]` hook.

**Tier-1 source-assertion pattern** (mirror `signin.spec.ts:38-83`) for parts that can't render without a real Privy app ID (banner presence on `/new`+`/duel`, `useIsMobile` getServerSnapshot returns `true`):
```typescript
import { readFileSync } from 'node:fs';
import path from 'node:path';
const HOOK_PATH = path.resolve(__dirname, '../app/hooks/useIsMobile.ts');
expect(readFileSync(HOOK_PATH, 'utf-8')).toContain('getServerSnapshot');
// ... assert returns true (D-02 lock)
```
Note: full E2E browser tests need a real `NEXT_PUBLIC_PRIVY_APP_ID` + `pnpm build` (gating logic copyable from `signin.spec.ts:46-52`). Seeded settled-call id for the outcome test = `/call/14` (MEMORY; planner confirm — Open Question 1).

---

### `apps/web/app/components/GlobalNav.tsx` (component) — MODIFIED

**Analog:** self (`GlobalNav.tsx:18-56`). Bar is wordmark (left) + `NotificationBell` (right) at `height: 52`. Add a hamburger button to the LEFT of the wordmark, rendered ONLY when `isMobile` (glyph `☰`, accent `#E8F542`, `aria-label="Open menu"`, ≥44px). Keep `NotificationBell` pinned in the bar (D-06). Manage drawer-open state here (`useState`) and render `<MobileDrawer>`.

---

### Per-page container clamp + row→column stack (Feed, Receipt, Profile, Leaderboard, Sign-in, Onboarding)

**Pattern 2 (from RESEARCH.md:183-194)** — applies to every critical page:
```typescript
const isMobile = useIsMobile();
const container = isMobile
  ? { width: '100%', padding: '0 16px', maxWidth: '100%', margin: '0 auto' }
  : { maxWidth: '1024px', margin: '0 auto', padding: '32px 24px' }; // EXISTING desktop value
// every two-column block:
<div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '12px' }}>
```

Per-surface targets (all verified, see RESEARCH.md Per-Page Inventory §221-261):
- **Feed `page.tsx`:** container `maxWidth:680px`→clamp; `DuelRowCard` (lines 232-249) two `minWidth:120px` cells → stack column + drop minWidth; filter chips ≥44px.
- **`call/[id]/page.tsx`:** settled+live containers `maxWidth:1024px` (lines 1475/1936)→clamp; outcome hero `96px`→`52px` at line ~1511 + add `data-outcome-word` attr; 4-stat row (1566-1593) → 2×2 via `flexWrap:'wrap'` + `flex:'1 1 45%'` (NO grid, preserve borders); action row (1596) 3 buttons `flex:1` → stack `width:100%`; live two-column (1656) → column. Audit each `flexDirection:'row'` at lines 614/715/833/907/1449/1667/1691/1757/1859/1989/2309/2397/2531.
- **`ProfileClient.tsx`:** container `maxWidth:680px` (57)→clamp; CATEGORY REPUTATION 3 cards `minWidth:160px` (128-133) → column. **Tailwind typography classNames stay untouched** (Divergence #4) — swap inline layout only.
- **`LeaderboardClient.tsx`:** container `maxWidth:760px` (68)→clamp. **Live row is 4-col** `#`/`Caller`/`Rep`/`Calls` (220-279), NOT 6-col — "drop ACC/BEST/sparkline" is MOOT (Divergence #1). Clamp existing row to fit 343px, keep `flexDirection:'row'`, each row ≥44px, **preserve viewer-row accent** `borderLeft:3px solid #E8F542` + `backgroundColor:#1A1A24` (257-258). Tailwind typography stays.
- **`signin/page.tsx`:** column `maxWidth:400px` (168) overflows 375px by ~25px → clamp `maxWidth:'calc(100vw - 32px)'` (Divergence #3). 480px corner-bracket frame (UI-24) NOT built — don't assume.
- **`onboarding/layout.tsx` + 5 subroutes:** frame `maxWidth:480px` (110) → add `width:100%`,`padding:0 16px`. Confirm each subroute (`handle`/`socials`/`follow-graph`/`fund`/`tagline`) inputs+buttons ≥44px.

---

### Modals (D-04)

**Universal rule:** panel `maxWidth:'calc(100vw - 32px)'`, overlay horizontal padding, internal `flexDirection:'row'` button rows → `column` full-width, buttons ≥44px.

| Component | File:line | Action |
|-----------|-----------|--------|
| FollowFadeModal | `packages/ui/src/compound/FollowFadeModal.tsx:185` | Already clamped (Divergence #2) — VERIFY button rows stack only. Apply mobile via props/wrapper, NOT inside shared component (Pitfall 2). |
| CallerExitModal | `packages/ui/src/compound/CallerExitModal.tsx:110` | Already clamped — VERIFY only. |
| PositionExitModal | `packages/ui/src/compound/PositionExitModal.tsx:103` | Already clamped — VERIFY only. |
| ChallengeFormModal | `apps/web/app/components/ChallengeFormModal.tsx:337` | `480px` → add overlay h-padding, stack rows. |
| DisputeModal (inline) | `apps/web/app/call/[id]/page.tsx:600` | `480px` → add `calc(100vw - 32px)` clamp. |
| ProvenanceModal (inline) | `apps/web/app/call/[id]/page.tsx:818` | `560px` — **OVERFLOWS, MUST clamp** to `calc(100vw - 32px)`. |

---

## Shared Patterns

### Slide-over overlay (drawer)
**Source:** `apps/web/app/components/NotificationInbox.tsx:169-175` (Esc), `:215-222` (backdrop click), `:236-266` (backdrop+panel JSX). Backdrop tokens `zIndex:50` / `rgba(9,9,14,0.6)` and panel `border:3px solid #E8F542` + accent `boxShadow` are the house slide-over treatment.
**Apply to:** `MobileDrawer.tsx`.

### Inline-style + hardcoded-hex layout register
**Source:** every file in `apps/web/app`. No className-based layout; tokens are inline hex (`#09090E` bg, `#E8F542` accent, `#13131D`/`#18181B` surfaces, `#2A2A30`/`#2E2E42` borders).
**Apply to:** all 24 surfaces. Conditional swap is `isMobile ? mobile : desktop`. NEVER `display:grid`; NEVER `@media` in component styles; NEVER touch Tailwind typography classNames on `ProfileClient.tsx`/`LeaderboardClient.tsx`.

### Privy auth-state read
**Source:** `NotificationInbox.tsx:28` (`import { usePrivy }`), `:166` (`usePrivy()`).
**Apply to:** `MobileDrawer.tsx` — read `authenticated`, `ready`, `logout`; gate New Call + Profile on `authenticated && ready` (Pitfall 5).

### Playwright test scaffolding
**Source:** `playwright.config.ts` (single Desktop-Chrome project, `testMatch:['**/*.spec.ts']`, `webServer: pnpm start` after build) + `signin.spec.ts:38-83` (Tier-1 `readFileSync` source assertions, Tier-2 real-Privy gate at `:46-52`).
**Apply to:** `responsive.spec.ts` — set viewport in-spec (Pitfall 6), Tier-1 source assertions where browser render is impossible.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `apps/web/app/hooks/useIsMobile.ts` | hook | event-driven | No custom hook exists in `apps/web` today; this is the first. Pattern comes from React `useSyncExternalStore` docs (RESEARCH.md Pattern 1), not an in-repo file. Otherwise fully specified — treat as high-confidence. |

---

## Metadata

**Analog search scope:** `apps/web/app/components/`, `apps/web/app/` (pages + onboarding), `apps/web/components/`, `apps/web/tests/`, `packages/ui/src/compound/`.
**Files scanned this session:** NotificationInbox.tsx, GlobalNav.tsx, signin.spec.ts, playwright.config.ts (read directly); all per-page/per-modal line refs inherited verified from 09-RESEARCH.md (HIGH confidence, same session).
**Pattern extraction date:** 2026-06-09
