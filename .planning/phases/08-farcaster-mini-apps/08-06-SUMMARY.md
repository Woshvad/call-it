---
phase: 08-farcaster-mini-apps
plan: 06
subsystem: web-miniapp
tags: [farcaster, miniapp, sdk, ready, splash, gap-closure, read-only-receipt, webview]
gap_closure: true

# Dependency graph
requires:
  - phase: 08-farcaster-mini-apps
    provides: fc:miniapp launch_miniapp action + launch button + manifest (plan 08-02)
  - phase: 08-farcaster-mini-apps
    provides: settled receipt renders TRUE outcome word — page.tsx now outcome-correct (plan 08-05)
  - phase: 02-followfademarket
    provides: /call/[id] live + settled receipt page (plan 02-08/02-09)
provides:
  - "@farcaster/miniapp-sdk@0.3.0 dependency in apps/web"
  - "MiniAppReady client component: calls sdk.actions.ready() once after mount (fail-safe outside a host)"
  - "ready() signalled on ALL three /call/[id] render branches (loading / settled / live) so the Mini App host dismisses the splash"
  - "documented confirmation that the read-only receipt renders without blocking on Privy/wagmi wallet init"
  - "signalReady pure helper + node-env regression test (ready-once + 3 fail-safe paths)"
affects: [phase-08-verification, phase-10-mainnet-transact, future-miniapp-flows]

# Tech tracking
tech-stack:
  added: ["@farcaster/miniapp-sdk@0.3.0"]
  patterns:
    - "MiniAppReady: 'use client' null-render component; dynamic-imports the SDK inside a once-guarded useEffect so the bundle stays out of the page top-level graph"
    - "signalReady(loader) pure helper: calls loader().actions.ready() once, NEVER throws (host absent / loader rejects / ready throws) — node-env unit-testable without React/browser"
    - "ready() mounted on every status branch; enabled={!!callData} reveals real content, enabled on the loading skeleton so a slow relayer never leaves a blank splash"

key-files:
  created:
    - apps/web/app/call/[id]/MiniAppReady.tsx
    - apps/web/tests/miniapp-ready.test.ts
  modified:
    - apps/web/package.json
    - apps/web/app/call/[id]/page.tsx
    - pnpm-lock.yaml

decisions:
  - "Extracted the ready-invocation into a pure signalReady(loader) helper so it is testable in apps/web's node-env vitest (no jsdom/testing-library — matches tests/**/*.test.ts convention) without rendering React or touching the real browser SDK"
  - "Dynamic import('@farcaster/miniapp-sdk') INSIDE the effect (not a top-level import) so the SDK bundle is not pulled into the page module's server/top-level graph and the non-host browser path stays cheap"
  - "ready() enabled UNCONDITIONALLY on the loading skeleton (enabled) but enabled={!!callData} on settled/live — so the host reveals real content when present, yet a slow/absent relayer fetch never leaves a blank splash up"
  - "useRef once-guard so ready() fires at most once even under React StrictMode double-invoke"
  - "No SSR-ification of the 'use client' page (larger refactor, regression risk per plan) — the blank screen is fixed by (a) ready() dismissing the splash + (b) the read-only receipt already rendering from relayer/subgraph data without waiting on wallet init"

requirements-completed: [SHARE-19]

# Metrics
duration: ~12min
completed: 2026-06-09
---

# Phase 8 Plan 06: Mini App Read-Only Render + ready() (GAP 2) Summary

**Closes UAT 08 GAP 2 (severity: major): tapping "View on Call It" (`launch_miniapp`) opened a BLANK white Mini App page. Root cause was no Farcaster Mini App SDK and no `sdk.actions.ready()` call anywhere — a Mini App stays on the host splash until ready() is signalled. This plan adds `@farcaster/miniapp-sdk@0.3.0` + a fail-safe `MiniAppReady` component mounted on every `/call/[id]` render branch, and confirms the read-only receipt renders without blocking on Privy/wagmi wallet init. In-app tap-to-transact stays out of scope (Phase 10, D-01).**

## What changed

### Task 1 — @farcaster/miniapp-sdk + fail-safe MiniAppReady (commit `227f810`)
- `apps/web/package.json`: added `"@farcaster/miniapp-sdk": "0.3.0"` (pinned exact, `[LEGIT]` per the plan's package-legitimacy audit — official `farcasterxyz/miniapps`, MIT, GitHub OIDC publish; supersedes the legacy `@farcaster/frame-sdk` name). `pnpm install` updated the lockfile; verified `node -e "require('@farcaster/miniapp-sdk/package.json').version"` → `0.3.0` from apps/web.
- `apps/web/app/call/[id]/MiniAppReady.tsx` (NEW): `'use client'` component that renders `null` and, in a once-guarded `useEffect`, dynamic-imports the SDK and calls `sdk.actions.ready()`. Properties:
  - **Dynamic import inside the effect** (`import('@farcaster/miniapp-sdk').then(m => m.sdk)`) so the SDK bundle is not pulled into the page's top-level/server graph.
  - **Fail-safe** via the extracted pure `signalReady(loader)` helper — wrapped in try/catch + a `void`-ed async path so a non-host browser (loader rejects, or `ready()` throws) is a harmless swallowed no-op; the normal-browser render is unaffected.
  - **`useRef` once-guard** so ready() fires at most once even under StrictMode double-invoke.
  - **`enabled?: boolean` prop** (default true) so the page can defer ready() until `callData` is present (reveal real content, not a bare skeleton).
- `apps/web/tests/miniapp-ready.test.ts` (NEW, vitest node env): asserts `signalReady` (1) invokes the injected `ready()` exactly once, (2) resolves WITHOUT throwing when the loader REJECTS (host absent), (3) resolves WITHOUT throwing when `ready()` throws synchronously, (4) resolves WITHOUT throwing when `ready()` rejects asynchronously.

### Task 2 — mount MiniAppReady on all /call/[id] branches + confirm wallet-decoupled render (commit `c799fe3`)
- `apps/web/app/call/[id]/page.tsx`:
  - Imported `MiniAppReady` (with a scope/boundary comment block citing GAP 2 + D-01 Phase-10).
  - Mounted `<MiniAppReady>` as a sibling at the top of all THREE returned trees:
    - **loading skeleton** (`enabled` — fire even while loading so a slow/absent relayer never leaves a blank splash),
    - **settled / CallerExited branch** (`enabled={!!callData}`),
    - **live receipt branch** (`enabled={!!callData}`).
  - **Confirmed the read-only render path does NOT block on wallet init:** the only early-return before the render branches is the relayer-keyed loading gate `if (isLoadingCall && !callData)` (page.tsx:1325) — it does NOT depend on `authenticated`/`useAccount`/Privy `ready`. `CallPage` reads `authenticated` + `userAddress` (page.tsx:960-961) but never early-returns on them; those values gate ONLY the interactive controls (Follow/Fade/Challenge buttons, modals, pending-challenge fetch). So a logged-out Mini App webview renders the public receipt body (handle, market line, outcome word/stats, FINAL POSITIONS) from relayer/subgraph data; transacting stays Phase-10. No restructuring was needed — the existing gate was already wallet-decoupled.

## Why no SSR refactor
The plan explicitly scoped OUT SSR-ifying the `'use client'` page (larger refactor, regression risk to the wallet flows). The blank screen is fixed by the two minimum changes: (a) `ready()` dismisses the host splash, and (b) the read-only receipt already paints from the relayer/subgraph data without waiting on wallet init. No hard SSR-bailout on a wallet-only top-level dependency was hit — the read-only body renders on the client from `callData` regardless of Privy/wagmi readiness, so no additional dynamic-import move was needed.

## Scope boundary (D-01 / Phase 10)
In-app tap-to-transact / live broadcast on mainnet 42161 is NOT added here. This plan ONLY makes the Mini App RENDER the read-only receipt + signal `ready()`. Interactive Follow/Fade/Challenge controls stay wallet-gated (deep-link / Phase-10). Arbitrum Sepolia 421614 is not in Warpcast's chainList, so a live in-client transact preview is unavailable on testnet — documented as the Phase-10 boundary.

## Deviations from Plan
None — both tasks executed exactly as written. No bugs, missing critical functionality, or blocking issues encountered (Rules 1-3 not triggered); no architectural decisions required (Rule 4 not triggered).

## Verification
- `node -e "require('@farcaster/miniapp-sdk/package.json').version"` from apps/web → `0.3.0`.
- `grep "MiniAppReady" apps/web/app/call/[id]/page.tsx` → import + 3 mount sites (loading L1340, settled L1431, live L1819).
- `grep "actions.ready" apps/web/app/call/[id]/MiniAppReady.tsx` → `sdk.actions.ready()` present.
- `pnpm exec vitest run tests/miniapp-ready.test.ts` → 4 passed.
- Full web suite: `pnpm exec vitest run` → 97 passed / 13 files (was 93 + 4 new). No regressions to 08-05's outcome-truth, the manifest, embed meta, frame-tx wire, or CR-01 hardening tests.
- `pnpm --filter @call-it/web build` → exit 0; `/call/[id]` compiles.
- MANUAL/TOOL (cannot be CI-driven — note for verifier): paste a deployed Sepolia `/call/{id}` into the Farcaster Mini App embed debugger / a real cast and tap "View on Call It" — the read-only receipt renders (splash dismissed via ready()), not a blank page. Live mainnet tap-to-transact remains Phase 10 (D-01).

## Threat surface
All within the plan's threat model — no new endpoints or trust boundaries beyond the documented ones.
- T-08-06-01 (blank-UX DoS) — MITIGATED: `sdk.actions.ready()` called once after mount on every render branch; fail-safe try/catch via `signalReady` so non-host browsers still render.
- T-08-06-02 (EoP — read-only decoupled from wallet) — MITIGATED: read-only receipt renders without a wallet (loading gate is relayer-keyed); INTERACTIVE controls stay gated behind `authenticated`/`userAddress`; no transact path added (D-01, Phase-10).
- T-08-06-SC (supply chain — new install) — MITIGATED: `@farcaster/miniapp-sdk@0.3.0` is `[LEGIT]` (official farcasterxyz/miniapps, MIT, GitHub OIDC publish, latest 0.3.0); pinned exact; no `[ASSUMED]`/`[SUS]`/`[SLOP]` packages.

## Known Stubs
None. The `enabled` prop and the read-only render path are fully wired; no placeholder/empty-data flows were introduced.

## Self-Check: PASSED
- [x] apps/web/app/call/[id]/MiniAppReady.tsx exists on disk
- [x] apps/web/tests/miniapp-ready.test.ts exists on disk
- [x] apps/web/package.json modified (@farcaster/miniapp-sdk@0.3.0)
- [x] apps/web/app/call/[id]/page.tsx modified (import + 3 mount sites)
- [x] Commit 227f810 exists (Task 1)
- [x] Commit c799fe3 exists (Task 2)
- [x] @farcaster/miniapp-sdk resolves to 0.3.0 from apps/web
- [x] web 97/97 green; web build exit 0
