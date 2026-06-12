---
phase: quick-260612-8wk
plan: 260612-8wk
slug: how-it-works-modal
subsystem: web-frontend
tags: [explainer-modal, tape-header, d13-cream, copy-canon, a11y]
requires: []
provides:
  - "HowItWorksModal — static Polymarket-style explainer on the D-13 cream template"
  - "HOW IT WORKS ghost trigger in the tape page-header, both auth states"
  - "Copy-canon lockstep drift guard between modal and signin sources"
affects: [apps/web]
tech-stack:
  added: []
  patterns: [d13-cream-modal-panel, source-assertion-vitest, copy-canon-lockstep]
key-files:
  created:
    - apps/web/app/components/HowItWorksModal.tsx
    - apps/web/tests/how-it-works-modal.test.ts
  modified:
    - apps/web/app/page.tsx
decisions:
  - "Source-order pin uses indexOf('+ NEW CALL', i) anchored after the trigger — plain indexOf hits the pre-existing EmptyTape CTA (~line 105) before the header"
  - "Modal header comment reworded ('chain hooks' not 'wagmi') so the static-honesty not.toContain('wagmi') pin holds"
metrics:
  duration: ~6m
  completed: 2026-06-12
  tasks: 3
  commits: 1
---

# Quick 260612-8wk: HOW IT WORKS on the Tape Summary

Static Polymarket-style explainer modal on the D-13 cream template (ChallengeFormModal chrome mirrored), triggered by a btn ghost HOW IT WORKS button left of the auth-aware CTA in the tape header, with the signin landing copy duplicated verbatim and a lockstep vitest guarding drift.

## Tasks

| # | Task | Commit |
|---|------|--------|
| 1 | HowItWorksModal.tsx — D-13 cream template, landing copy verbatim | 6a3d792 |
| 2 | page.tsx header trigger + modal mount (4 surgical edits) | 6a3d792 |
| 3 | Source-assertion test + gates + atomic commit | 6a3d792 |

(Quick mode: single atomic commit per orchestrator instruction.)

## What Was Built

- apps/web/app/components/HowItWorksModal.tsx (249 lines): 'use client' named export, props { open, onClose, onPrimaryCta }, renders null when closed. Overlay: fixed inset-0, z-200, rgba(0,0,0,0.82) + blur(4px), flex-centered, currentTarget backdrop close. Panel: var(--bg-inverse) cream, #000 text, 3px black border, var(--shadow-brutal-lg), role="dialog" + aria-modal + aria-label, stopPropagation guard. Content: "· HOW IT WORKS" mono overline → "Three steps. One receipt." contiguous 900-weight display heading → 3 numbered steps (bodies byte-identical to signin HOW_IT_WORKS, local duplicate with copy-canon comment) → "$5 MIN · $100 MAX PER CALL · 1.7% SETTLEMENT FEE" mono footnote over a divider → full-width black "MAKE YOUR FIRST CALL ▸" CTA. Escape always closes (no in-flight guard — static). 44px close ✕ touch target. Zero data primitives — the only useEffect is the Escape listener.
- apps/web/app/page.tsx: import, howOpen state, HOW IT WORKS ghost button inside the existing flex-gap-12 right-side container BEFORE the auth ternary (both auth states see it), modal mount as last child wiring onPrimaryCta → close + handleNewCallClick (the exact existing auth branch). Tabs/chips/duels/feed regions byte-identical.
- apps/web/tests/how-it-works-modal.test.ts (9 tests): modal content + a11y pins, copy-canon lockstep (3 step bodies asserted verbatim in BOTH modal and signin sources), page wiring + header source-order pin, static-honesty pin (no fetch(/useReadContract/useWriteContract/wagmi).

## Gates

| Gate | Result |
|------|--------|
| pnpm --filter @call-it/web build | exit 0 |
| pnpm --filter @call-it/web exec vitest run | 366/366 green (357 baseline + 9 new), 35 files |
| git show --stat HEAD | exactly 3 files, 376 insertions |
| git diff HEAD -- apps/web/app/signin/page.tsx | empty (copy canon untouched) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Source-order pin matched the wrong + NEW CALL occurrence**
- **Found during:** Task 3 (first vitest run — 1 failure)
- **Issue:** The plan's pin src.indexOf('+ NEW CALL') hits the pre-existing EmptyTape CTA (~line 105), which precedes the page header — so i < j failed (5716 vs 4308) even though the header order was correct.
- **Fix:** Pin anchored to the header intent: s.indexOf('+ NEW CALL', i) must be > i (a NEW CALL follows the trigger), with an explanatory comment.
- **Files modified:** apps/web/tests/how-it-works-modal.test.ts
- **Commit:** 6a3d792

**2. [Rule 3 - Blocking] Modal header comment contained the literal "wagmi"**
- **Found during:** Task 3 authoring (caught before the gate run)
- **Issue:** The static-honesty pin not.toContain('wagmi') would have failed on the modal's own doc comment ("no wagmi").
- **Fix:** Reworded the comment to "no chain hooks".
- **Files modified:** apps/web/app/components/HowItWorksModal.tsx
- **Commit:** 6a3d792

## Known Stubs

None — the modal is intentionally static content (explainer copy + constants); the CTA reuses the real handleNewCallClick auth branch.

## Self-Check: PASSED

- apps/web/app/components/HowItWorksModal.tsx — FOUND
- apps/web/app/page.tsx (howOpen + mount) — FOUND
- apps/web/tests/how-it-works-modal.test.ts — FOUND
- Commit 6a3d792 — FOUND (3 files, no push)
