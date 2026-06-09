---
phase: 09-mobile-responsive-on-7-critical-pages
plan: 03
subsystem: web-frontend
tags: [responsive, mobile, receipt, settled, live, useIsMobile, playwright, flexbox]

# Dependency graph
requires:
  - phase: 09-mobile-responsive-on-7-critical-pages
    provides: "apps/web/app/hooks/useIsMobile.ts (09-01) + responsive.spec.ts [data-outcome-word]/[data-receipt-action-row] gate"
provides:
  - "375px-responsive Settled Receipt (#1 share-landing): clamped container, 52px outcome hero + data-outcome-word hook, 2x2 flexWrap stat stack, full-width stacked action row"
  - "375px-responsive Live Receipt: clamped container, two-column→single-column stack (feed first), full-width Follow/Fade/Challenge stack, 2x2 live stat stack"
  - "Inline DisputeModal (480px) + ProvenanceModal (560px) clamped to calc(100vw - 32px) at mobile (D-04)"
affects: [phase-09-08-verification, phase-09-04, phase-09-05, phase-09-06, phase-09-07]

# Tech tracking
tech-stack:
  added: []  # zero new runtime deps — consumes the 09-01 useIsMobile() hook
  patterns:
    - "isMobile ? mobileStyle : desktopStyle inline-object swap (D-01/D-02); single hook drives both receipt branches + the 2 inline modals"
    - "4-cell stat row → 2x2 via flexWrap:'wrap' + flex:'1 1 45%' (NOT display:grid); inter-cell dividers preserved by index-parity borderRight + top-row borderBottom"
    - "action rows: flexDirection row→column at mobile, each button width:100% ≥44px tall, hard-offset shadows + fill/outline treatments preserved"
    - "inline modal clamp: maxWidth: isMobile ? 'calc(100vw - 32px)' : <desktop> — useIsMobile() called per-component (Rules of Hooks)"

key-files:
  created: []
  modified:
    - apps/web/app/call/[id]/page.tsx

decisions:
  - "Three useIsMobile() calls (CallPage + DisputeModal + ProvenanceModal) — the two modals are separate top-level component functions, not inline JSX in CallPage, so Rules of Hooks require each to call the hook itself. The plan's 'exactly one const isMobile' acceptance text assumed inline modals; documented as a correctness deviation (Rule 3)."
  - "Live 4-stat row (CURRENT SPREAD/TIME LEFT/STAKE/CONVICTION) also stacked 2x2 at mobile to match the settled stat-stack treatment — 4 cells × ~85px is cramped at 343px; UI-SPEC common rule + Pitfall 4 spirit."
  - "Sticky caller headers (settled + live) flexWrap at mobile so the back/handle/rep group + Share button never force horizontal scroll on the 343px inner width (AUTH-44 handle-only render unchanged)."

# Metrics
duration: 14min
completed: 2026-06-09
requirements-completed: [UI-48, UI-49]
---

# Phase 9 Plan 03: Mobile-Responsive Settled + Live Receipt Summary

**The #1 share-landing slice taken to 375px-green: the Settled Receipt renders single-column with a legible 52px outcome hero (`data-outcome-word` hook), a 2×2 `flexWrap` stat stack (no `display:grid`), and full-width stacked Share/Frame/View-All buttons; the Live Receipt stacks its activity-feed + quote-calls two-column block to a single column (feed first) with full-width Follow/Fade/Challenge buttons; and the inline ProvenanceModal (560px) + DisputeModal (480px) clamp to `calc(100vw - 32px)` so neither overflows the phone. Zero new dependencies — all swaps consume the 09-01 `useIsMobile()` hook.**

## Accomplishments

### Task 1 — Settled Receipt branch (`664d08e`)
- Added `import { useIsMobile }` + a single `const isMobile = useIsMobile();` at the top of `CallPage`.
- **Container clamp:** settled page-content `maxWidth:'1024px'` → `{ width:'100%', maxWidth:'100%', padding:'24px 16px' }` at mobile (Pattern 2 — 16px gutter).
- **Outcome hero:** `fontSize: isMobile ? '52px' : '96px'` (UI-SPEC target; Playwright floor 36px). Added `data-outcome-word={outcomeWord}` to the hero `<p>` (the stable hook `responsive.spec.ts` targets). `lineHeight:1.0`, `letterSpacing:'-0.02em'`, the border, hard offset shadow, `<Stamp>`, and the 5 LOCKED outcome colors are all unchanged.
- **4-stat row (FINAL VALUE/TARGET/CONVICTION/P&L):** `flexWrap:'wrap'` at mobile, each cell `flex:'1 1 45%'` → 2×2. Dividers preserved without `display:grid`: left cell of each pair keeps `borderRight` (index parity `i % 2 === 0`), the top pair keeps `borderBottom` (`i < 2`); the 2px outer border is retained.
- **Action row:** `flexDirection: isMobile ? 'column' : 'row'`, each of Share / Share-as-Frame / View-All `width:'100%'` at mobile, ≥44px tall (padding 16px ⇒ ~48px). Primary's `boxShadow:'4px 4px 0 0 #09090E'` + the outline treatments preserved. Added the `data-receipt-action-row` marker the spec asserts on.
- **Audited settled-half row blocks:** FINAL POSITIONS two-column block flips to column at mobile (FOLLOWERS first, its `borderRight` divider becomes a `borderBottom`); sticky caller header `flexWrap`s at mobile with reduced 16px side padding. Provenance line already `flexWrap:'wrap'`.

### Task 2 — Live Receipt branch + inline modals (`8306d9c`)
- **Live container clamp:** `maxWidth:'1024px'` → `{ width:'100%', maxWidth:'100%', padding:'0 16px' }` at mobile.
- **Two-column block (activity feed + quote-calls):** `flexDirection: isMobile ? 'column' : 'row'`, activity feed FIRST and full-width, quote-calls below and full-width. The quote-calls column stays in scope as a READ-ONLY display surface and gets NO desktop-only banner (it is not the composer).
- **Follow/Fade/Challenge action row:** stacks `flexDirection:'column'` full-width at mobile, each button ≥44px, the filled-accent / red-outline / orange-outline treatments + hard-offset shadows preserved.
- **Live 4-stat row:** same 2×2 `flexWrap` treatment as the settled stat row (decision above).
- **Sticky live header** `flexWrap`s + 16px padding at mobile; the caller-only **pending-challenge accept/reject row** stacks full-width column at mobile (Approve/Accept + Reject each `width:'100%'`, padding bumped to 12px for ≥44px).
- **Inline DisputeModal (line ~464):** `useIsMobile()` added; panel `maxWidth: isMobile ? 'calc(100vw - 32px)' : '480px'`; Cancel/Submit action row stacks full-width column at mobile.
- **Inline ProvenanceModal (line ~788):** `useIsMobile()` added (called before the `if (!open) return null` early-return — Rules of Hooks); panel `maxWidth: isMobile ? 'calc(100vw - 32px)' : '560px'` (the one inline modal that genuinely overflows 375px).

## Task Commits

1. **Task 1: Settled Receipt branch** — `664d08e` (feat)
2. **Task 2: Live Receipt branch + inline modal clamps** — `8306d9c` (feat)

## Verification

- **`cd apps/web && pnpm build` exits 0** — both after Task 1 and after Task 2 (the binding automated gate in this environment).
- `playwright test tests/responsive.spec.ts -g "outcome word legible|no horizontal scroll|touch target|server snapshot|no display:grid|single column"` → **3 Tier-1 source assertions passed, viewport (Tier-2) tests SKIPPED.** The Tier-2 `no horizontal scroll`/`touch target`/`outcome word legible`/`single column` tests for `/call/14` are gated on a real `NEXT_PUBLIC_PRIVY_APP_ID` + a running app (the same env gate documented in 09-01); no real Privy app id is present in this environment, so they skip rather than run. They auto-flip to hard assertions once an operator runs with a real Privy id + seeded settled call (Open Question 1 / D-10b operator real-device sign-off).
- `playwright test tests/quote-composer.spec.ts -g "no grid|no CSS grid|Tier-1"` → **5/5 passed** (no-grid regression guard intact).
- `grep -c "display: 'grid'" apps/web/app/call/[id]/page.tsx` → **0**.
- `data-outcome-word` present on the outcome hero; `data-receipt-action-row` marker present.
- No file deletions in either commit (`git diff --diff-filter=D` empty).

## Decisions Made

1. **Three `useIsMobile()` calls, not one.** `DisputeModal` and `ProvenanceModal` are separate top-level component functions (defined above `CallPage`), not inline JSX, so each must call the hook itself — Rules of Hooks forbid passing `isMobile` across component boundaries via closure here. The plan's "exactly one `const isMobile`" acceptance text assumed inline modals; the correct implementation has one per component. Documented under Deviations (Rule 3 — blocking correctness requirement).
2. **Live 4-stat row also 2×2.** The UI-SPEC §2 Live Receipt section doesn't itemize the live stat row, but the common rule (every ≥2-sizable-cell row stacks) + the cramping math (4 × ~85px > 343px) made the settled 2×2 treatment the consistent choice. Dividers preserved identically.
3. **Sticky headers flexWrap rather than column-stack.** Keeping the header a wrapping row (back/handle/rep + Share) preserves the desktop visual register while guaranteeing no horizontal scroll at 343px; full column-stack would have pushed the receipt body down unnecessarily.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking/Correctness] Per-component `useIsMobile()` calls (3 total, not 1)**
- **Found during:** Task 2 (clamping the inline modals).
- **Issue:** `DisputeModal` (line ~464) and `ProvenanceModal` (line ~788) are standalone component functions, not inline JSX inside `CallPage`. The plan said "reuse the `const isMobile` added in Task 1 — do not declare twice" and the acceptance criterion asked for "exactly one `const isMobile = useIsMobile();`". A single shared declaration is impossible across React component boundaries (Rules of Hooks); the modals can't read `CallPage`'s `isMobile`.
- **Fix:** Added a dedicated `const isMobile = useIsMobile();` inside each modal component (called before `ProvenanceModal`'s early `if (!open) return null` to satisfy hook ordering). `CallPage` keeps exactly one. Net: one per component (3 total).
- **Files modified:** `apps/web/app/call/[id]/page.tsx`
- **Verification:** Build exits 0; quote-composer no-grid guard intact.
- **Committed in:** `8306d9c` (Task 2 commit)

**2. [Rule 2 - Missing critical responsiveness] Live 4-stat row + pending-challenge button row + sticky headers**
- **Found during:** Tasks 1 & 2 (the plan's "audit every flexDirection:'row' holding ≥2 sizable cells" instruction).
- **Issue:** Beyond the explicitly-named blocks, the live 4-stat row (4 cells), the caller-only pending-challenge accept/reject button row, and both sticky caller headers would force horizontal scroll / cramping at 343px.
- **Fix:** Live 4-stat row → 2×2 flexWrap; accept/reject buttons → full-width column stack; both sticky headers → flexWrap + 16px padding.
- **Files modified:** `apps/web/app/call/[id]/page.tsx`
- **Committed in:** `664d08e` (settled header), `8306d9c` (live blocks)

---

**Total deviations:** 2 auto-fixed (1 correctness/Rules-of-Hooks, 1 additional responsive coverage from the explicit audit instruction). No architectural changes; no new dependencies; no scope creep beyond the receipt surface.

## Known Stubs

None. This plan adds no data sources — it is a pure inline-style layout swap on the existing JSX tree.

## Threat Flags

None new. Per the plan threat model:
- **T-09-03-01 (info disclosure, mitigate):** the mobile path changes only inline `style` objects (container width, `flexDirection`, `fontSize`, `maxWidth`, divider borders) on the SAME JSX tree — no conditionally-rendered new content, no owner-only control surfaced. AUTH-44 (handle-only, never wallet address) is untouched; caller-only "Exit your call" / accept-reject controls remain behind their existing condition gates.
- **T-09-03-02 (`data-outcome-word`, accept):** a static test-only attribute carrying only the already-public outcome word.
- **T-09-03-SC (supply chain, mitigate):** zero new packages — N/A.

## Self-Check: PASSED

- [x] `apps/web/app/call/[id]/page.tsx` exists on disk (modified)
- [x] Commit `664d08e` (Task 1) exists in git log
- [x] Commit `8306d9c` (Task 2) exists in git log
- [x] `grep "display: 'grid'" apps/web/app/call/[id]/page.tsx` → 0 matches
- [x] `data-outcome-word` present on the outcome hero `<p>`
- [x] `data-receipt-action-row` marker present on the settled action row
- [x] `maxWidth: isMobile ? 'calc(100vw - 32px)'` on both DisputeModal (480px) + ProvenanceModal (560px)
- [x] `pnpm build` exits 0
- [x] quote-composer no-grid regression guard 5/5 green

---
*Phase: 09-mobile-responsive-on-7-critical-pages*
*Completed: 2026-06-09*
