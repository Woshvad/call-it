---
phase: quick
id: 260611-scj
status: complete
commits:
  - "6d18153: feat(quick-260611-scj): wallet pill popover — click balance → own address (copy) + profile snapshot + quick links"
key-files:
  created:
    - apps/web/app/components/WalletPill.tsx
    - apps/web/tests/wallet-popover.test.ts
  modified:
    - apps/web/app/components/AppShell.tsx
    - apps/web/app/globals.css
completed: 2026-06-11
---

# Quick 260611-scj: Wallet Pill Popover Summary

Header balance pill is now a click-anchored popover exposing the viewer's OWN wallet address (copyable) + profile snapshot + VIEW PROFILE / SETTINGS quick links — extracted into its own WalletPill.tsx component.

## What Changed

- **apps/web/app/components/WalletPill.tsx (NEW):** WalletPill extracted verbatim from AppShell (same hooks, same profileAddr derivation, same null-until-ready gate, same 2dp balance format, same AUTH-44 source !== 'truncated' handle rule), then upgraded:
  - Pill face is now a button (className="wallet-pill", aria-haspopup="dialog", aria-expanded) — face content (balance + ccy + optional handle) unchanged; no address on the face, ever.
  - Anchored panel rendered ONLY inside the open && profileAddr gate — 300px right-aligned, brutal chrome (2px var(--border-strong), 4px 4px hard shadow, radius 0, bg-secondary, padding 14).
  - Panel contents: identity headline (as-stored handle Archivo 800 18px + VERIFIED · X / VERIFIED · FC .pill chips, OR truncated-address JBM headline when no real handle); address row with COPY→COPIED(2s) via navigator.clipboard.writeText(profileAddr) (fund-page pattern); balance row; D-07-gated stats line with singular/plural + Number.isFinite rep gate; stacked VIEW PROFILE → / SETTINGS → links that setOpen(false) on navigate.
  - Close behavior: one useEffect gated on open — Escape keydown + outside mousedown with the contains check on the WRAPPER (pill re-click passes contains, only the button toggle runs — no close-then-reopen race). Listeners attach only while open; cleanup removes both.
- **apps/web/app/components/AppShell.tsx:** inline WalletPill function deleted; now-unused imports removed (usePrivy, useAccount, useUsdcBalance, useProfile); added the named import from './WalletPill'. C10 search block byte-stable (presentation-sweep pin green).
- **apps/web/app/globals.css:** button.wallet-pill reset (cursor/color/font/appearance) + button.wallet-pill:hover (border-color var(--border-strong)) added directly after the .wallet-pill .handle rule; div recipe untouched.
- **apps/web/tests/wallet-popover.test.ts (NEW):** 8 source-assertion tests in the presentation-sweep style covering all 6 plan groups — extraction (file exists, AppShell import + no useUsdcBalance, button/ARIA), copy (writeText/COPIED/2000), close handlers (keydown/Escape/mousedown/.contains), quick-link template strings, AUTH-44 gate (index-order proof that every profileAddr.slice( occurs after the open && profileAddr && gate), as-stored casing (textTransform: 'none', no uppercase).

## Decisions

- **AUTH-44 nuance (user decision 2026-06-11):** the pill FACE never shows an address (handle + balance only — contract unchanged); the popover shows the viewer's OWN address only after a deliberate click — standard wallet UX, not an identity-display regression. The address never exists in the DOM while the popover is closed (panel is conditionally rendered, not hidden).
- **AppShell extraction:** WalletPill moved to its own file so AppShell sheds the wallet hooks entirely; the test pins AppShell.tsx as containing the named import and NOT useUsdcBalance. C10 search block kept byte-stable per D-15.
- **Handle casing:** as-stored, textTransform: 'none' (user decision 2026-06-11; ProfileHeader precedent).
- **D-07 degrade:** profile undefined → panel shows address + balance + links only (no headline handle, no stats, no verified chips).

## Gates

- pnpm --filter @call-it/web build → exit 0
- pnpm --filter @call-it/web exec vitest run → 28 files / 257 passed, 0 failed (baseline 249 + 8 new wallet-popover tests; presentation-sweep C10 pin green, 17/17)
- git show --stat HEAD → exactly 4 files (WalletPill.tsx new, AppShell.tsx, globals.css, wallet-popover.test.ts new); no deletions
- Unrelated dirty files (docs/, 'call it frontend/', evidence/, .planning/, .gitignore, openzeppelin submodule, parallel-session FeedList/CallCard edits) untouched and unstaged
- Not pushed (orchestrator pushes)

## Deviations

None — plan executed exactly as written.

## Self-Check: PASSED

- apps/web/app/components/WalletPill.tsx — FOUND
- apps/web/tests/wallet-popover.test.ts — FOUND
- Commit 6d18153 — FOUND on master
