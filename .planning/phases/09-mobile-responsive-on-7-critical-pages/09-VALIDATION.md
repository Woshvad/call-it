---
phase: 09
slug: mobile-responsive-on-7-critical-pages
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-09
---

# Phase 09 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `09-RESEARCH.md` § Validation Architecture. Per-task rows are filled
> during planning once PLAN.md task IDs exist.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `@playwright/test` (Chromium project) — already in stack |
| **Config file** | `apps/web/playwright.config.ts` |
| **Quick run command** | `cd apps/web && pnpm exec playwright test tests/responsive.spec.ts` |
| **Full suite command** | `cd apps/web && pnpm build && pnpm exec playwright test` |
| **Estimated runtime** | ~30–60s (quick, responsive-only); full suite longer (includes build + OG snapshots) |

---

## Sampling Rate

- **After every task commit:** `pnpm exec playwright test tests/responsive.spec.ts -g "<page under edit>"` (scoped to the page being retrofit)
- **After every plan wave:** `cd apps/web && pnpm build && pnpm exec playwright test tests/responsive.spec.ts` (full responsive suite)
- **Before `/gsd-verify-work`:** Full `apps/web` Playwright suite green (regression guard — must not break `quote-composer.spec.ts` "no grid", OG snapshots, `signin.spec.ts`) **AND** operator real-device sign-off (D-11)
- **Max feedback latency:** ~60 seconds (quick run)

---

## Per-Task Verification Map

> Filled during planning. Each retrofit task maps to a `-g` filter on `tests/responsive.spec.ts`.
> The foundational hook + spec scaffold (Wave 0) must exist before page tasks can verify.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-XX-XX | TBD | 0 | UI-48/49/50 | — | N/A (scaffold) | e2e | `playwright test tests/responsive.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Requirement → Test Map (from RESEARCH.md)

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UI-48 | Each of 7 pages renders without horizontal scroll at 375/390px | e2e (viewport) | `playwright test tests/responsive.spec.ts -g "no horizontal scroll"` | ❌ Wave 0 |
| UI-49 | Single-column + full-width action buttons; hamburger drawer at mobile; bell pinned | e2e (viewport) | `playwright test tests/responsive.spec.ts -g "single column\|full-width\|drawer"` | ❌ Wave 0 |
| UI-49 | Touch targets ≥ 44×44 at mobile (D-03) | e2e (viewport) | `playwright test tests/responsive.spec.ts -g "touch target"` | ❌ Wave 0 |
| UI-50 | Banner at mobile on `/new` (+`?quote=`) and `/duel/[id]`; absent on critical pages; absent at desktop | e2e + source | `playwright test tests/responsive.spec.ts -g "desktop-only banner"` | ❌ Wave 0 |
| SC3 | Outcome word legible (fits viewport, ≥ font floor) on settled receipt at 375px | e2e (bounding box) | `playwright test tests/responsive.spec.ts -g "outcome word legible"` | ❌ Wave 0 |
| D-01/D-02 | `useIsMobile` returns true on server snapshot (no hydration mismatch) | unit/source | `playwright test tests/responsive.spec.ts -g "hydration\|server snapshot"` | ❌ Wave 0 |

---

## Wave 0 Requirements

- [ ] `apps/web/tests/responsive.spec.ts` — covers UI-48/UI-49/UI-50/SC3 mechanical assertions at 375/390px
- [ ] `apps/web/app/hooks/useIsMobile.ts` — must exist before any page can be retrofit (foundational; Wave 1 task 1)
- [ ] `data-outcome-word` test hook on the outcome hero `<p>` (`call/[id]/page.tsx` ~line 1509) for the legibility assertion
- [ ] (Optional) source/unit assertion that `useIsMobile` server-snapshot default is `true` (D-02 lock), mirroring `signin.spec.ts` Tier-1 source assertions
- Framework install: none — Playwright already present.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| iOS Safari + Android Chrome share→receipt landing flow | SC3 (D-10b / D-11) | Real-device touch, rendering, and Twitter Card landing cannot be faithfully emulated headless | Operator opens a Twitter/Farcaster share link to a settled receipt on a real iPhone (Safari) + Android (Chrome): outcome word legible, share/view-all buttons stack and are tappable, Sign-in CTA visible for unauthenticated viewers. **Hard gate — no fallback (D-11).** |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`responsive.spec.ts`, `useIsMobile.ts`, `data-outcome-word` hook)
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
