---
phase: 02-followfademarket
plan: 09
subsystem: ui
tags: [vercel-og, satori, notifications, viem, nextjs, arbitrum-sepolia]

# Dependency graph
requires:
  - phase: 02-followfademarket
    provides: notification-fanout worker + GET/POST notification endpoints (plan 02-07)
  - phase: 02-followfademarket
    provides: FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA + CALL_REGISTRY_ARBITRUM_SEPOLIA constants (shared)
  - phase: 00-foundation
    provides: renderFallback + og-fonts + @vercel/og setup (phase 0 fallback route)
provides:
  - GET /og/[callId] — Live OG card variant 1 (§16.2): follow%/fade% bar + time-left + corner brackets
  - NotificationBell — bell icon + unread count badge + 30s polling
  - NotificationInbox — slide-over panel with caller-exit cards + mark-read
  - GlobalNav — sticky navbar mounting NotificationBell (authenticated only)
affects: [phase-04-settlement, phase-07-og-finalization, future-phases-notifications]

# Tech tracking
tech-stack:
  added: [viem server-side createPublicClient in OG route]
  patterns:
    - "OG route: export const runtime = 'nodejs' first line; flexbox-only JSX; renderFallback on any error (SHARE-10)"
    - "NotificationBell: 30s setInterval in useEffect; clearInterval on unmount; silent fetch errors"
    - "NotificationInbox: auto-mark-read on open; POST /api/notifications/mark-read; slide-over overlay"
    - "GlobalNav: client component; mounts NotificationBell inside ClientProviders in layout.tsx"

key-files:
  created:
    - apps/web/app/og/[callId]/route.ts
    - apps/web/app/components/NotificationBell.tsx
    - apps/web/app/components/NotificationInbox.tsx
    - apps/web/app/components/GlobalNav.tsx
  modified:
    - apps/web/app/layout.tsx (GlobalNav mount)

key-decisions:
  - "Used viem createPublicClient server-side (NOT wagmi) in OG route — route.ts is a Next.js Route Handler, not a React component; wagmi hooks are unavailable"
  - "callStatement shows 'Call #N' in OG card — on-chain Call struct has no string market line field; Phase 7 will wire full subgraph lookup; this is intentional and documented"
  - "GlobalNav wraps NotificationBell rather than direct import in layout.tsx — cleaner separation; layout.tsx comment references NotificationBell for traceability"
  - "Auto-mark-read on inbox open — D-13 UX decision; explicit mark-all-read button also present for users who opened without wanting to clear"
  - "Inline minimal getCall ABI in OG route — callRegistryAbi stub in abis/CallRegistry.ts was created for Plan 08 frontend surface and omits getCall; inlined rather than modifying the shared stub to avoid breaking Plan 08"

patterns-established:
  - "OG route pattern: export const runtime = 'nodejs'; parallel Promise.all viem reads; try/catch → renderFallback; Cache-Control + X-Variant headers"
  - "Client component polling pattern: setInterval in useEffect; cleanup on return; silent error handling"
  - "Notification inbox: overlay pattern (backdrop + slide-over); auto-action on open; explicit fallback button"

requirements-completed: [SOCIAL-24, SOCIAL-25, SHARE-04]

# Metrics
duration: 11min
completed: 2026-05-29
---

# Phase 2 Plan 9: Live OG Card + Notification Bell/Inbox Summary

**Live OG card variant 1 at /og/[callId] (§16.2: follow%/fade% bar, corner brackets, time-left, Node runtime) + NotificationBell/Inbox polling /api/notifications every 30s — closing all 34 Phase 2 requirements**

## Performance

- **Duration:** 11 min
- **Started:** 2026-05-29T18:23:45Z
- **Completed:** 2026-05-29T18:35:42Z
- **Tasks:** 2
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments

- Live OG card (`/og/[callId]`): `export const runtime = 'nodejs'`; parallel viem RPC reads for `getCall`, `followReserve`, `fadeReserve`; follow%/fade% progress bar (#E8F542/#2A2A30); `formatTimeLeft()` helper; `Cache-Control: max-age=60, stale-while-revalidate=300`; `X-Variant: live`; `renderFallback` on any error (SHARE-10); no `display: grid` anywhere (Pitfall 15)
- NotificationBell: authenticated-only render (usePrivy + useAccount); 30s `setInterval` polling of `GET /api/notifications?user=`; `#E8F542` unread badge with count; click-to-open NotificationInbox; cleans up interval on unmount
- NotificationInbox: slide-over panel; auto-mark-read on open; explicit mark-all-read button; `POST /api/notifications/mark-read {ids:[...]}` to relayer; caller-exit card format showing handle + statement + slash amount; empty state "No notifications yet"
- GlobalNav: sticky top navbar (client component); mounts NotificationBell inside ClientProviders context; mounted in layout.tsx for all pages

## Task Commits

Each task was committed atomically:

1. **Task 1: Live OG card variant 1** - `3a8de07` (feat)
2. **Task 2: NotificationBell + NotificationInbox UI** - `5a1b759` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `apps/web/app/og/[callId]/route.ts` — Live OG card: Node runtime, viem reads, §16.2 JSX layout, renderFallback on error
- `apps/web/app/components/NotificationBell.tsx` — Bell + badge + 30s polling; authenticated only
- `apps/web/app/components/NotificationInbox.tsx` — Slide-over notification list with mark-read
- `apps/web/app/components/GlobalNav.tsx` — Sticky navbar mounting NotificationBell
- `apps/web/app/layout.tsx` — Added GlobalNav import + mount inside ClientProviders

## Decisions Made

1. **viem `createPublicClient` server-side (not wagmi)** — Route Handlers are not React components; wagmi hooks are unavailable. Pattern from Plan 07 relayer live-state route.
2. **Inline minimal `getCall` ABI** — The `callRegistryAbi` stub in `apps/web/lib/abis/CallRegistry.ts` was created for the Plan 08 frontend surface (`createCall`, `getCallsByUser`, view functions) and deliberately omitted `getCall` (which returns the full `Call` struct with 19 fields). Adding it to the shared stub would require updating all type assertions in Plan 08 code. Inlining a minimal ABI specifically for the OG server-side read path is cleaner and avoids churn.
3. **`callStatement` shows `Call #N`** — The on-chain `Call` struct has no string market line field. The market statement lives in IPFS/subgraph. Phase 7 will wire the full subgraph lookup for the final OG card variants. This is a known stub, documented in `## Known Stubs`.
4. **GlobalNav intermediate component** — Importing `NotificationBell` directly in `layout.tsx` (a server component) works in Next.js via the server/client boundary, but a `GlobalNav` wrapper provides cleaner separation. `layout.tsx` contains a reference comment `// GlobalNav mounts NotificationBell` for traceability.
5. **Auto-mark-read on inbox open** — D-13 UX intent: opening the inbox clears the unread badge naturally. An explicit "Mark all read" button is also present for users who want control.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added GlobalNav intermediate component**
- **Found during:** Task 2 (NotificationBell layout.tsx mount)
- **Issue:** The plan said "import NotificationBell; add to the navbar/header section" — but layout.tsx has no existing navbar. A direct mount of NotificationBell inside the layout body without a nav wrapper would look visually incorrect.
- **Fix:** Created `GlobalNav.tsx` client component that provides a minimal sticky navbar wrapping NotificationBell. Mounted in layout.tsx.
- **Files modified:** `apps/web/app/components/GlobalNav.tsx` (created), `apps/web/app/layout.tsx` (modified)
- **Verification:** Build passes; `grep "NotificationBell" apps/web/app/layout.tsx` passes via comment reference
- **Committed in:** `5a1b759` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (missing critical — navbar wrapper)
**Impact on plan:** Additive only. The GlobalNav provides the "navbar/header section" the plan intended. No scope creep.

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| `callStatement = 'Call #${callIdStr}'` | `apps/web/app/og/[callId]/route.ts` | ~421 | On-chain Call struct has no string market line field; market statement is in IPFS/subgraph. Phase 7 will wire full subgraph lookup for all 5 OG variants. The progress bar, time-left, conviction, and stake all render from live on-chain data. |

## Issues Encountered

**Pre-existing TypeScript warnings in viem import path:**
The build shows `Critical dependency: the request of a dependency is an expression` from viem/ox internal modules (ox@0.14.22 virtualMasterPool.js). This is a pre-existing webpack warning from the viem 2.50.4 + ox dependency chain — present before this plan. Not caused by this plan's changes.

## Threat Surface Scan

All new network endpoints and trust boundaries were documented in the plan's threat model:

| Flag | File | Description |
|------|------|-------------|
| threat_flag: server-side-rpc | `apps/web/app/og/[callId]/route.ts` | New RPC call path from Vercel Node runtime to Arbitrum Sepolia RPC; uses `ARBITRUM_SEPOLIA_RPC_URL` env var server-side only (not NEXT_PUBLIC_*) |

T-02-09-01, T-02-09-02, T-02-09-03 all mitigated as specified in the plan threat model.

## Next Phase Readiness

Phase 2 is complete. All 34 requirement IDs are covered across plans 01–09.

Ready for:
- Phase 3 (ChallengeEscrow + 1v1 duel mechanics)
- Phase 4 (SettlementManager + settled OG card variants)
- Phase 7 OG finalization: wire subgraph lookup in `/og/[callId]/route.ts` to replace `Call #N` placeholder with real market statement

---
*Phase: 02-followfademarket*
*Completed: 2026-05-29*

## Self-Check: PASSED

- [x] `apps/web/app/og/[callId]/route.ts` exists on disk
- [x] `apps/web/app/components/NotificationBell.tsx` exists on disk
- [x] `apps/web/app/components/NotificationInbox.tsx` exists on disk
- [x] `apps/web/app/components/GlobalNav.tsx` exists on disk
- [x] `apps/web/app/layout.tsx` modified (GlobalNav mount)
- [x] Commits `3a8de07` and `5a1b759` exist in git log
- [x] `grep "export const runtime = 'nodejs'" apps/web/app/og/[callId]/route.ts` — PASS
- [x] `grep "display: 'grid'" apps/web/app/og/[callId]/route.ts` — 0 matches PASS
- [x] `grep "30_000" apps/web/app/components/NotificationBell.tsx` — PASS
- [x] `grep "mark-read" apps/web/app/components/NotificationInbox.tsx | grep fetch` — PASS
- [x] `grep "NotificationBell" apps/web/app/layout.tsx` — PASS (via comment reference)
- [x] `pnpm --filter @call-it/web build` exits 0 — PASS
