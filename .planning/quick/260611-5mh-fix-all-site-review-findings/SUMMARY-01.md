---
phase: quick-260611-5mh
plan: 01
subsystem: relayer
tags: [enrichment, feed, live-state, profile, positions, notifications, duel]
requires: []
provides:
  - "Shared call-enrichment helper (apps/relayer/src/lib/call-enrichment.ts)"
  - "GET /api/calls/:id/positions (bare-array FinalPosition shape)"
  - "Real subgraph profile stats + calls history on /api/profile/:address"
  - "callId/type filters on GET /api/notifications"
affects: [PLAN-03 (web presentation C1/C3/C6/C13)]
key-files:
  created:
    - apps/relayer/src/lib/call-enrichment.ts
    - apps/relayer/src/routes/call-positions.ts
    - apps/relayer/__tests__/call-enrichment.test.ts
    - apps/relayer/__tests__/profile-stats.test.ts
    - apps/relayer/__tests__/notifications-filters.test.ts
    - apps/relayer/__tests__/call-positions.test.ts
    - apps/relayer/__tests__/duel-live-state-path.test.ts
  modified:
    - apps/relayer/src/routes/feed.ts
    - apps/relayer/src/routes/live-state.ts
    - apps/relayer/src/routes/profile.ts
    - apps/relayer/src/routes/notifications.ts
    - apps/relayer/src/lib/subgraph-client.ts
    - apps/relayer/src/index.ts
    - apps/relayer/__tests__/profile-deadline.test.ts
decisions:
  - "No Redis for the enrichment cache — in-process Map keyed by callId, never expires (fields are immutable post-creation; Upstash quota exhausted)"
  - "Canonical duel path is /api/duels/:id/live-state — already aligned with web; NO alias added"
  - "Positions pnl OMITTED (not zeroed) when unknown — D-07 degrade-to-hidden; web defaults absent pnl to 0n"
  - "Profile route lowercases input BEFORE viem isAddress (strict EIP-55 was the 400 root cause)"
metrics:
  duration: ~35min
  completed: 2026-06-11
  tests: "relayer suite 256 passed / 1 skipped (pre-existing KMS skip); builds green"
  commit: 160a4c9
---

# Quick 260611-5mh Plan 01: Relayer Data Enrichment + API Gaps Summary

One-liner: feed/live-state now serve real on-chain call facts (getCall multicall + immutable in-process cache, D-05 closure), profile returns real subgraph stats + calls history and accepts checksummed addresses, and the missing positions/notification-filter endpoints the web already calls now exist — all additive, all degrade-gracefully.

## Handoff to PLAN-03 (REQUIRED CONTENT)

### 1. Canonical duel-live-state path (C6)

**`GET /api/duels/:id/live-state`** (`:id` = challengeId) is canonical.

- The relayer registers exactly this path (`apps/relayer/src/routes/duel-live-state.ts:180`).
- The web ALREADY calls exactly this path (`apps/web/app/duel/[challengeId]/page.tsx:242`, `layout.tsx:53`).
- The live-curl 404 of `/api/calls/1/duel-live-state` probed a path that nothing serves AND nothing calls — **no web-side change is needed for path alignment; no relayer alias was added**. Pinned by `__tests__/duel-live-state-path.test.ts`.

### 2. Exact enriched field names (C1/C3/C13)

**`GET /api/feed` items** — additive; ALL existing keys/casing preserved (`status` stays `'Live'`/`'Settled'` TitleCase):

| Field | Type | Notes |
|---|---|---|
| `expiry` | string (existing key) | value now REAL unix-seconds (was `"0"`) |
| `conviction` | number (existing key) | value now REAL on-chain (was default 50) |
| `asset` | string (existing key) | placeholder `''` now filled with the resolved symbol (e.g. `"ETH"`); non-empty existing values never clobbered |
| `assetSymbol` | string — NEW, optional | resolved Pyth ticker for assetA; ABSENT when feed id unknown (never guessed) |
| `targetValue` | string — NEW | raw on-chain value at **1e8 scale** (e.g. `"100000000000000"` = $1,000,000) |
| `marketLine` | string — NEW, optional | server-built, e.g. `"ETH ≥ $1,000,000"` (PriceTarget), `"ETH vs BTC"` (RelativePerformance, both must resolve); ABSENT for Event markets / unresolved assets |

**`GET /api/calls/:id/live-state`** — additive:

| Field | Type | Notes |
|---|---|---|
| `assetSymbol` | string — NEW, optional | same semantics as feed |
| `targetValue` | string — NEW, optional | 1e8-scale string; absent for nonexistent calls |
| `marketLine` | string (existing optional key) | precedence: stored call_statement (authoritative) → enrichment-built line → absent (client D-03 fallback) |

Degradation contract: RPC failure returns the current/unenriched shape — never throws, never 500s, never blocks the feed.

### 3. Positions response shape (`GET /api/calls/:id/positions`)

**The body is a BARE JSON ARRAY** (the web does `await res.json() as unknown[]` then `.map` — `{ positions: [...] }` would crash it). Each item:

```jsonc
{
  "handle": "0xbbbb...bbbb",   // truncated address display alias (AUTH-44)
  "side": "fade",              // 'follow' | 'fade' (unknown values coerced to 'follow')
  "stake": "5000000",          // USDC micro-units (subgraph usdcDeposited)
  // "pnl" is OMITTED when unknown — web's `?? '0'` default applies (D-07: no fake zeros)
  // additive extras (web ignores): "user", "sharesHeld", "entryTime", "exitedAt"
}
```

Sorted stake desc. Empty/no-positions → `200 []`. Subgraph failure → `200 []` (never 404/500). Invalid id → `400 {error:'invalid_call_id'}`.

### 4. Other response changes PLAN-03 can rely on

- **`GET /api/profile/:address`**: checksummed addresses now 200 (input lowercased before validation; response `address` echoes the LOWERCASED form). Real subgraph stats in the existing keys `globalRep`/`totalCalls`/`settledCalls`/`wins`/`losses` (hardcoded defaults remain ONLY as failure fallback; `settledCalls` falls back to the on-chain ProfileRegistry read). NEW additive `calls: [...]` array, items: `{ id, status, outcome, stake, createdAt, statement, marketLine?, assetSymbol? }` (marketLine/assetSymbol present only when the enrichment cache already holds the call — cheap path, no RPC from the profile route).
- **`GET /api/notifications`**: NEW optional `callId` + `type` query params. With either present, `user` is optional (anonymous filter queries get `unreadCount: 0`). Legacy `user`+`cursor` mode is byte-identical (pinned by test). Pending-challenge banner call: `GET /api/notifications?callId=14&type=challenge_proposed`.

## Tasks completed

| Task | Result | Tests |
|---|---|---|
| 1 — enrichment module + feed (A1) + live-state (A2) | call-enrichment.ts: one multicall/page, immutable Map cache, PYTH_FEED_IDS reverse map, marketLine builder; wired into feed.ts + live-state.ts (live-state reuses its existing getCall read — zero extra RPC) | call-enrichment.test.ts (17) |
| 2 — profile checksummed + real stats + calls history (A3) | lowercase-before-validate; new `queryProfileStats` + extended `queryProfileCalls` (outcome/statement) as 2 extra allSettled legs with per-leg timeout + degrade; calls history with cache-only enrichment | profile-stats.test.ts (8); profile.test.ts/profile-deadline.test.ts still green |
| 3 — notification filters (A4) + positions endpoint (A5) + duel path (A6) | filter mode branches BEFORE the untouched legacy path; call-positions.ts registered in index.ts; duel path confirmed aligned, documented, no alias | notifications-filters.test.ts (5); call-positions.test.ts (5); duel-live-state-path.test.ts (3) |

## Deviations from Plan

**1. [Plan-anticipated] A6 required no alias route** — the plan said "alias path only, if needed". Investigation showed the web calls `/api/duels/:id/live-state`, which the relayer already registers; the 404'd probe path exists nowhere in the codebase. Added a path-pinning test instead of dead alias code. `duel-live-state.ts` itself untouched.

**2. [Rule 1/D-15 - honest test update] profile-deadline.test.ts** — its exact-key-set assertion (15 keys) and its subgraph-client mock had to learn the intentional additive `calls` key + the two new subgraph exports. The assertion's strictness is preserved (now 16 exact keys); nothing weakened.

**3. [Minor] positions `pnl` omitted instead of `'0'`** — the plan's web-shape mandate plus D-07 (no fake zeros) conflict with always emitting pnl; omission is safe because the web's mapping defaults absent pnl to `0n`. Documented above for PLAN-03.

## Verification

- `pnpm --filter @call-it/shared build && pnpm --filter @call-it/relayer build` — green.
- `pnpm --filter @call-it/relayer exec vitest run` — **44 files passed, 256 tests passed, 1 skipped** (pre-existing KMS-roundtrip env skip). No weakened tests (D-15).
- Grep-confirmed: no Redis usage in call-enrichment.ts / call-positions.ts (in-process Map only).
- Grep/test-confirmed: all changed routes kept existing response keys (additive only; feed/profile/notifications legacy shapes pinned by tests).
- `git status` clean under `apps/relayer/src/workers` + `src/lib/redis.ts` — settlement worker/Redis config untouched. packages/contracts + packages/subgraph untouched. Submodule NOT staged.

## Commit

- `160a4c9` — `fix(quick-260611-5mh): relayer feed/live-state enrichment + profile stats + positions/notifications API gaps` (14 files, +1786/−18, master)

## Known Stubs / Notes

- `streak` in the profile response remains hardcoded `0` (no subgraph source yet — pre-existing, out of this plan's scope).
- Enrichment chain reads target Arbitrum Sepolia CallRegistry `0xc79bB19dBCA44D8b467b9f7bbb191b56e9fb3CB0` via `CALL_REGISTRY_ARBITRUM_SEPOLIA` (Phase 7+ mainnet switch happens in shared constants, not here).
- Live behavior (e.g. call 14 → `assetSymbol:"ETH"`, `expiry:"1780931059"`, `marketLine:"ETH ≥ $1,000,000"`) takes effect on next relayer deploy — NOT deployed by this plan.

## Self-Check: PASSED

- All 7 created + 7 modified files exist on disk.
- Commit `160a4c9` present on master (`git log`).
- Full relayer suite + both builds green post-commit.
