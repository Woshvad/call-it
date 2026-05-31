---
phase: 02-followfademarket
plan: 06
subsystem: subgraph
status: complete
completed: 2026-05-30
tags: [the-graph, subgraph-studio, assemblyscript, arbitrum-sepolia, indexing]

requires:
  - phase: 02-followfademarket
    provides: deployed FollowFadeMarket + CallRegistry v2 + ProfileRegistry v2 addresses (plan 02-04)

provides:
  - schema.graphql extensions (Position, CallerExit, PositionExit) for Phase 2
  - follow-fade-market.ts — 5 AssemblyScript event handlers
  - subgraph.yaml FollowFadeMarket data source (5 eventHandlers)
  - PUBLISHED call-it-sepolia subgraph on Subgraph Studio (query endpoint live)

affects: [02-07-notification-fanout, 02-08-activity-feed, 02-09-quote-column]

key-files:
  created:
    - packages/subgraph/src/follow-fade-market.ts
  modified:
    - packages/subgraph/schema.graphql
    - packages/subgraph/subgraph.yaml
    - packages/shared/src/constants/addresses.ts

key-decisions:
  - "Published version label v0.0.1; Studio user id 1754389; IPFS QmRyZoED61CDfVVg6BAz6ZairKh1mnY8vRbeydLmfu3xej."
  - "SUBGRAPH_URL_SEPOLIA in @call-it/shared updated from PLACEHOLDER to the live version-pinned query endpoint."
  - "Phase 3/4 data sources (ChallengeEscrow, SettlementManager) remain zero-address placeholders with blockHandlers — they compile but index nothing until those phases deploy."
---

# 02-06 — Subgraph extension + Studio publish

## What shipped

The subgraph extension that indexes FollowFadeMarket events (the data source for
the Live Receipt activity feed and the notification fan-out worker), now built
against the real Phase 2 deployed addresses and published live to Subgraph Studio.

**Task 1 — schema + handlers** (committed `d03057c`):
- `schema.graphql`: extended Position (callId/user/side/usdcDeposited/sharesHeld/entryTime/exitedAt),
  CallerExit (penaltyPaid/stakeReturned/reputationDelta/callerVolumeAtExit), PositionExit; correct
  `@entity(immutable:...)` flags.
- `follow-fade-market.ts`: 5 handlers — handleFollowed, handleFaded, handlePositionExited,
  handleCallerExited, handlePoolInitialized (no closures, no null-for-value-types).

**Task 2 — subgraph.yaml + Studio deploy** (yaml `5bca56b`; addresses wired in `82a7cd8`):
- FollowFadeMarket data source uses 5 eventHandlers (not blockHandlers).
- After plan 02-04 deployed the contracts, subgraph.yaml was pointed at the live
  v2 addresses + startBlocks (CallRegistry 272458669, ProfileRegistry 272458667,
  FollowFadeMarket 272458674).
- `graph auth` + `pnpm run build` + `graph deploy call-it-sepolia --version-label v0.0.1`
  succeeded (exit 0).

## Deployment result (verbatim from `graph deploy`, exit 0)

```
Build completed: QmRyZoED61CDfVVg6BAz6ZairKh1mnY8vRbeydLmfu3xej
Deployed to https://thegraph.com/studio/subgraph/call-it-sepolia
Queries (HTTP): https://api.studio.thegraph.com/query/1754389/call-it-sepolia/v0.0.1
```

All 5 data sources compiled to WASM and uploaded to IPFS (CallRegistry, ProfileRegistry,
FollowFadeMarket active; ChallengeEscrow, SettlementManager are Phase 3/4 placeholders).
graph-cli 0.98.1.

## Config wired

- `packages/shared/src/constants/addresses.ts` — `SUBGRAPH_URL_SEPOLIA` updated from
  PLACEHOLDER to the live version-pinned query endpoint. Shared build green.

## Notes / deviations

- Deploy key stored in gitignored `.env` (`SUBGRAPH_STUDIO_DEPLOY_KEY`); never committed.
  The key was shared in chat during setup — recommend rotating it in Studio post-publish.
- The published subgraph will begin indexing from the Phase 2 deploy blocks; the
  activity feed / notification fan-out become live as the indexer syncs.
- Relayer `RELAYER_SUBGRAPH_URL` / `NEXT_PUBLIC_SUBGRAPH_URL` should be set to the new
  query endpoint in the relayer + web env (Fly/Vercel) for production reads — operator task.

## Self-Check: PASSED
- [x] follow-fade-market.ts has 5 exported handlers
- [x] subgraph.yaml FollowFadeMarket uses eventHandlers + real deployed address
- [x] graph build succeeded (all data sources -> WASM)
- [x] graph deploy to Studio succeeded (exit 0, query endpoint returned)
- [x] SUBGRAPH_URL_SEPOLIA updated to live endpoint; shared build green
