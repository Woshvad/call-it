---
phase: 01-core-contracts-auth-frontend-skeleton
plan: 09
subsystem: apps/web, apps/relayer
tags: [feed-shell, profile-shell, ens-resolver, 800ms-race, slice-g, auth-11, auth-44]
decisions:
  - Server/Client split for profile: page.tsx (Server Component) + ProfileClient.tsx (client boundary). Avoids createContext error from @call-it/ui barrel in Server Component.
  - Phase 1 feed empty: CallRegistry not deployed. Fallback returns [] until Phase 2.
  - Subgraph Pitfall C: schema id/caller/asset/stake/expiry/conviction/status/createdAt/outcome confirmed.
metrics:
  duration: 35 minutes
  started: 2026-05-22T15:47:12Z
  completed: 2026-05-22T16:22:06Z
  tasks: 2
  files_created: 17
  files_modified: 3
---

# Phase 1 Plan 09: Feed Shell + Profile Shell + Profile Settings Summary

Vertical slice G. 800ms subgraph race (D-24), 10s Redis first-page cache (D-26), ENS 24h cache (D-13), AUTH-11 handle priority chain. Studio key server-side only (D-27).

## Task Commits

| Task | Commit |
|------|--------|
| Task 1 relayer | 84ac4e1 |
| Task 2 frontend | 2bb16df |

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| ens-resolver.test.ts | 6 | PASSED |
| feed.test.ts | 6 | PASSED |
| profile.test.ts | 7 | PASSED |
| Relayer total | 96/96 | PASSED |
| feed-shell.spec.ts Tier-1 | 6/6 | PASSED |
| profile-shell.spec.ts Tier-1 | 9/9 | PASSED |
| Tier-2 browser tests | 4 | SKIPPED |

## Deviations

**[Rule 2] Server/Client split**: Added ProfileClient.tsx client boundary because @call-it/ui barrel includes createContext-based hooks. Server Component (page.tsx) fetches data, ProfileClient.tsx renders UI.

**[Environment] ENOSPC**: build fails after TypeScript. TypeScript compilation passes (15.8s). Machine disk issue, not code error.

## Security Verification

- SUBGRAPH_STUDIO_API_KEY in apps/web/ non-test: 0 matches (D-27 OK)
- ENS_MAINNET_RPC_URL in apps/web/: 0 matches

## Known Stubs

- queryPolledEvents() returns empty (Phase 2 wires real CallRegistry events)
- Social handles null (Phase 1.5 wires onchain linking)
- Overview tab empty (Phase 7)
- Social toggles stubs in settings (Phase 1.5)

## Self-Check: PASSED

All 17 created files: FOUND. Commits 84ac4e1 + 2bb16df: FOUND. 96/96 relayer tests: VERIFIED. 15/15 Playwright Tier-1: VERIFIED. TypeScript: PASSED. D-27 key check: VERIFIED.
