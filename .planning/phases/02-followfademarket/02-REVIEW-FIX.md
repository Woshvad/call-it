---
phase: 02-followfademarket
fixed_at: 2026-05-29T00:00:00Z
review_path: .planning/phases/02-followfademarket/02-REVIEW.md
iteration: 1
findings_in_scope: 13
fixed: 13
skipped: 0
status: all_fixed
---

# Phase 2: Code Review Fix Report

**Fixed at:** 2026-05-29
**Source review:** .planning/phases/02-followfademarket/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 13 (4 critical + 9 warning; 6 info findings out of scope)
- Fixed: 13
- Skipped: 0

All fixes were applied in an isolated git worktree, each verified, and committed
atomically. After all contract edits the targeted Foundry suite stays green
(109 passed / 0 failed / 2 skipped). The relayer (`@call-it/relayer`) was
type-checked per modified file (no new errors vs the 3 pre-existing, unrelated
errors in `withdraw-authorize.ts` / `paymaster-confirmer.ts`), and the web app
(`@call-it/web`) builds clean (exit 0).

## Fixed Issues

### CR-01: Notification mark-read authorization bypass — session not bound to userAddress

**Files modified:** `apps/relayer/src/routes/notifications.ts`
**Commit:** bf5a36b
**Applied fix:** The mark-read handler now resolves the owner address SERVER-SIDE
from the verified Privy session (`getPrivyClient().getUser(privyUserId)` →
embedded Ethereum wallet from `linkedAccounts`, preferring `walletClientType ===
'privy'`). The attacker-controllable `?user=` query param is ignored entirely.
Added a `resolveSessionWalletAddress` helper mirroring the existing
`withdraw-authorize.ts` Privy pattern; returns 403 when no Ethereum wallet is
linked and 502 on a Privy resolution error. The WHERE clause is now bound to the
session-derived address.

### CR-02: `markCallerExited` / `markSettled` lack status guard and range check

**Files modified:** `packages/contracts/src/CallRegistry.sol`
**Commit:** a8b5d6b
**Applied fix:** Added `require(callId != 0 && callId < _calls.length, "bad-callId")`
to both functions; `markCallerExited` now requires `status == Live` (SOCIAL-27 —
a Settled/already-exited call can no longer be re-flipped), and `markSettled`
requires `status != Settled` (one-shot outcome guard). Verified the FFM
integration tests that drive these via Live calls still pass.
**Note:** requires human verification — the status-transition logic is a state
invariant; confirm the Phase 4 SettlementManager wiring expects these guards.

### CR-03: Notification mark-read functionally broken — client omits required param / token

**Files modified:** `apps/web/app/components/NotificationInbox.tsx`,
`apps/web/app/components/NotificationBell.tsx`
**Commit:** 27b3199
**Applied fix:** Both the auto-mark-on-open effect and `handleMarkAllRead` now
POST with `Authorization: Bearer <privy access token>` (via `usePrivy().getAccessToken`)
through a shared `postMarkRead` helper. Because CR-01 resolves the owner address
from the session, the client no longer sends a `?user=` param; the now-unused
`userAddress` prop was removed from the component interface and from the
`NotificationBell` call site.

### CR-04: `/live-state` missing every field its consumers read

**Files modified:** `apps/relayer/src/routes/live-state.ts`
**Commit:** cf4e9cf
**Applied fix:** `/live-state` now reads `CallRegistry.getCall` from the deployed
Sepolia CallRegistry (`0xC61deC55…`) and joins the real on-chain call metadata
(`id, caller, category, stake, conviction, expiry, createdAt, criteriaHash,
status, callerExitedAt`) into the response, plus `statusVersion` from the Redis
`status_version:{callId}` key (the same key the fan-out worker bumps) so the OG
cache-bust `/og/{id}?v={statusVersion}` works (D-09). Enum ordinals were mapped
exactly to the on-chain definitions (CallStatus: Live=0, Settled=1, Disputed=2,
CallerExited=3; Category: Majors=0, DeFi=1, Other=2). The existing graceful
`?? default` reads in `page.tsx#fetchCallData` and `layout.tsx#fetchCallMeta`
now receive real values; subgraph/IPFS-only display fields (handle, marketLine,
reasoning, criteriaText, repScore) are documented as Phase 7 subgraph wiring
(consistent with IN-03) and intentionally fall back to defaults.

### WR-01: Frontend treats raw 18-decimal shares as a 6-decimal USDC position value

**Files modified:** `apps/web/app/call/[id]/page.tsx`
**Commit:** d726bc2
**Applied fix:** `userPositionValue` is now computed as
`userShares * reserve / totalShares` (mirroring the contract's `exitPosition`),
using the live `followReserve`/`followTotalShares` (or fade) already read, with a
zero-`totalShares` guard. The 10% slash applies to that USDC value.

### WR-02: Caller-exit modal shows a hardcoded `repDelta={-35}`

**Files modified:** `apps/web/app/call/[id]/page.tsx`
**Commit:** d726bc2
**Applied fix:** Imported `computeCallerExitRepDelta` from `@call-it/shared` and
pass `repDelta={callData ? computeCallerExitRepDelta(callData.createdAt,
callData.expiry, nowSec) : -35}` so the modal shows the real decayed [-45, -10]
delta.

### WR-03: `sendAlert` re-throws; alert/Telegram-env failure can crash a worker tick

**Files modified:** `apps/relayer/src/workers/alerts.ts`,
`apps/relayer/src/workers/notification-fanout.ts`
**Commit:** 6c2722c
**Applied fix:** Added an exported `sendAlertSafe(event, payload): Promise<boolean>`
wrapper that swallows-and-logs BOTH `sendAlert` send failures AND `getBot()`
throwing on missing Telegram env. The fan-out worker now calls `sendAlertSafe`
(removing the manual try/catch), so a missing-env path can never take down the
loop. The re-throwing `sendAlert` is retained for callers that need to react.

### WR-04: `quote-stance` GET returns a single `{ stance }` but the frontend expects an array

**Files modified:** `apps/relayer/src/routes/quote-stance.ts`,
`apps/web/app/call/[id]/page.tsx`
**Commits:** df74ba2 (relayer), d726bc2 (web)
**Applied fix:** Added a list mode to the GET route — `?parentCallId=X` returns a
JSON ARRAY of quote-call entries (`{ id, quoteCallId, parentCallId, stance,
timestamp }`) queried by `callId` (parent). The single-stance `?quoteCallId=`
path is retained for backward compatibility. `fetchQuoteCalls` now queries
`?parentCallId=` so its `.map()` receives an array instead of throwing on a
single object.

### WR-05: `notification-fanout` from-block reset to `1n` can replay the entire chain

**Files modified:** `apps/relayer/src/workers/notification-fanout.ts`
**Commit:** 6c2722c
**Applied fix:** On init failure the worker no longer defaults `lastBlockSeen` to
a state that scans from block 1. An `initialized` flag is left false; the next
tick re-seeds `getBlockNumber()` and skips that tick rather than performing a
full-chain `getLogs`. The per-tick scan window is also capped at
`MAX_BLOCK_RANGE_PER_TICK` (10,000 blocks) — catch-up advances in bounded
windows so the RPC provider never receives an oversized range.
**Partial scope note:** the review also suggested a unique index +
`onConflictDoNothing()` for insert idempotency as defense-in-depth. That requires
a new DB migration + DB-level test and is out of safe auto-fix scope; it is NOT
applied here. The primary replay vector (full-chain scan that would re-insert
duplicates) is eliminated by the above, so the duplicate risk it described no
longer triggers in normal operation. Recommend adding the unique constraint as a
follow-up hardening task.

### WR-06: Fan-out notifies the caller themselves and uses raw 0x address as `callerHandle`

**Files modified:** `apps/relayer/src/workers/notification-fanout.ts`
**Commit:** 6c2722c
**Applied fix:** The caller's own address is filtered out of the holder set
before insert (`recipientHolders`), so a caller holding their own position is no
longer told "you exited your own call". `callerHandle` is resolved via
`ProfileRegistry.displayHandle(caller)` from the deployed Sepolia ProfileRegistry
(`0x4dCdE524…`), falling back to the address when no handle is set or the read
fails (never throws). The broadcast alert's `holderCount` uses the filtered set.

### WR-07: `getCallsByUser` pagination does not guard `offset + limit` overflow

**Files modified:** `packages/contracts/src/CallRegistry.sol`
**Commit:** a8b5d6b
**Applied fix:** Replaced `uint256 end = offset + limit; if (end > total) end = total;`
with `uint256 end = limit > total - offset ? total : offset + limit;`
(`offset < total` already established), so an adversarial `limit` near
`type(uint256).max` can no longer overflow `end` and trigger an `end - offset`
underflow revert.

### WR-08: `ProfileRegistry.applyRepDelta` can silently truncate above `uint128` max

**Files modified:** `packages/contracts/src/ProfileRegistry.sol`
**Commit:** 1686bac
**Applied fix:** Added an explicit upper clamp after the REP-02 zero-floor:
`if (newRep > int256(uint256(type(uint128).max))) newRep = maxRep;` before the
`uint128` cast, eliminating the silent-truncation hazard in the reputation field.

### WR-09: `live-state` and OG route do not short-circuit the known-zero FFM address

**Files modified:** `apps/relayer/src/routes/live-state.ts`,
`apps/web/app/og/[callId]/route.ts`
**Commits:** cf4e9cf (live-state), 02633b2 (OG route)
**Applied fix:** Both endpoints now check whether
`FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA` is the zero placeholder and skip the FFM
reserve reads entirely when it is (treating reserves as empty → 50/50 split),
logging the deferred-deploy state. The deployed CallRegistry read still runs for
real metadata. This removes the guaranteed-useless RPC round trip per request
and, for OG, removes the reliance on a revert to trip the fallback path.

## Skipped Issues

None — all 13 in-scope findings were fixed. (The 6 INFO findings IN-01..IN-06
were out of scope per the requested `critical_warning` scope.)

---

_Fixed: 2026-05-29_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
