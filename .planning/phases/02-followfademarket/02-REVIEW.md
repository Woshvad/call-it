---
phase: 02-followfademarket
reviewed: 2026-05-29T00:00:00Z
depth: standard
files_reviewed: 43
files_reviewed_list:
  - packages/contracts/src/FollowFadeMarket.sol
  - packages/contracts/src/CallRegistry.sol
  - packages/contracts/src/ProfileRegistry.sol
  - packages/contracts/src/interfaces/IFollowFadeMarket.sol
  - packages/contracts/src/interfaces/ICallRegistry.sol
  - packages/contracts/src/interfaces/IProfileRegistry.sol
  - packages/contracts/script/DeployPhase2.s.sol
  - packages/contracts/test/FollowFadeMarket.t.sol
  - packages/contracts/test/FollowFadeMarketGates.t.sol
  - packages/contracts/test/FollowFadeMarketInterference.t.sol
  - packages/contracts/test/TvlAggregation.t.sol
  - packages/contracts/test/CallRegistry.t.sol
  - packages/contracts/test/CallRegistryGates.t.sol
  - packages/contracts/test/CallRegistryParity.t.sol
  - packages/contracts/test/ProfileRegistry.t.sol
  - packages/contracts/test/helpers/FfmTestHelper.sol
  - packages/shared/src/validation/follow-fade-gates.ts
  - packages/shared/test/follow-fade-gates.test.ts
  - packages/shared/src/constants/addresses.ts
  - packages/shared/src/index.ts
  - apps/relayer/src/db/schema.ts
  - apps/relayer/src/db/migrations/0001_even_vertigo.sql
  - apps/relayer/src/routes/live-state.ts
  - apps/relayer/src/routes/quote-stance.ts
  - apps/relayer/src/routes/notifications.ts
  - apps/relayer/src/workers/notification-fanout.ts
  - apps/relayer/src/workers/alerts.ts
  - apps/relayer/src/index.ts
  - apps/web/app/call/[id]/page.tsx
  - apps/web/app/call/[id]/layout.tsx
  - apps/web/app/og/[callId]/route.ts
  - apps/web/app/components/NotificationBell.tsx
  - apps/web/app/components/NotificationInbox.tsx
  - apps/web/app/components/GlobalNav.tsx
  - apps/web/app/layout.tsx
  - apps/web/lib/abis/index.ts
  - packages/ui/src/compound/FollowFadeModal.tsx
  - packages/ui/src/compound/CallerExitModal.tsx
  - packages/ui/src/compound/PositionExitModal.tsx
  - packages/ui/src/compound/MarketPositioningBar.tsx
  - packages/subgraph/src/follow-fade-market.ts
  - packages/subgraph/schema.graphql
  - packages/subgraph/subgraph.yaml
findings:
  critical: 4
  warning: 9
  info: 6
  total: 19
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-05-29
**Depth:** standard
**Files Reviewed:** 43
**Status:** issues_found

## Summary

Phase 2 ships the `FollowFadeMarket` constant-product AMM, the `CallRegistry`/`ProfileRegistry` v2 wiring, the relayer notification/live-state surface, the live-receipt UI, and the OG card. The solid foundations are present: exact `=0.8.30` pragma everywhere, canonical native USDC via the `USDC_ARB_NATIVE` constant (no inline addresses), `nonReentrant` on every USDC transfer path, correct CEI ordering in `follow`/`fade`/`exitPosition`/`callerExit`/`createCall`, pause carve-outs on exit paths, and the virtual fade seed kept as accounting-only (never transferred).

However, adversarial review surfaced real defects. The most serious is an **authorization bypass in the notification mark-read endpoint**: the relayer authenticates a Privy session but then trusts an attacker-controllable `?user=` query param for the ownership `WHERE` clause, with no binding between the verified session and the address — any authenticated user can mark any other user's notifications read. Coupled with that, the `NotificationInbox` client omits the `?user=` param entirely, so the mark-read flow is also functionally broken (always 400). There is a **state-corruption bug in `CallRegistry.markCallerExited` / `markSettled`** (no status guard, no callId range check — a settled or already-exited call can be re-flipped, and an out-of-range callId path differs from `getCall`). The on-chain caller-exit penalty `int256(-int256(absDelta))` and TVL-cap-vs-penalty-injection interaction were examined and found correct, but several lower-severity correctness and data-contract gaps remain (the `/live-state` endpoint does not return the fields its own consumers read, frontend "position value" uses raw shares as USDC, alert dispatch can crash the fan-out worker).

## Critical Issues

### CR-01: Notification mark-read authorization bypass — session not bound to userAddress

**File:** `apps/relayer/src/routes/notifications.ts:151-198`
**Issue:** The `POST /api/notifications/mark-read` route runs `privySessionPreHandler` (which only proves *some* valid Privy session exists and sets `request.privyUserId`), then reads the target address from an unauthenticated query param: `const userAddress = (request.query as { user?: string }).user;`. The `WHERE` clause filters on this attacker-supplied `userAddress`, NOT on the verified session identity. The code comment claims "WHERE clause enforces ownership via userAddress match (T-02-07-02)" but the value being matched is fully attacker-controlled. Any authenticated user can pass `?user=<victimAddress>` and mark another user's notifications as read. `request.privyUserId` is logged but never compared to the address.
**Fix:** Resolve the wallet address from the verified Privy session server-side and ignore the client value:
```ts
const privy = getPrivyClient();
const fullUser = await privy.getUser(request.privyUserId!); // or your DID→wallet resolver
const sessionAddress = resolveEmbeddedWallet(fullUser).toLowerCase();
// use sessionAddress in the WHERE clause; reject/ignore any client-supplied `user`
await db.update(notifications).set({ readAt: now })
  .where(and(
    eq(notifications.userAddress, sessionAddress),
    inArray(notifications.id, ids),
    isNull(notifications.readAt),
  ));
```
Until the DID→wallet mapping is wired, do not accept an arbitrary `user` param under the guise of an auth gate.

### CR-02: `CallRegistry.markCallerExited` and `markSettled` lack status guard and range check — state corruption / replay

**File:** `packages/contracts/src/CallRegistry.sol:427-440`
**Issue:** Neither function checks the current `status` nor that `callId` is in range:
```solidity
function markCallerExited(uint256 callId) external {
    if (msg.sender != followFadeMarket) revert NotAuthorized();
    _calls[callId].status = CallStatus.CallerExited;
    _calls[callId].callerExitedAt = uint64(block.timestamp);
}
function markSettled(uint256 callId, Outcome outcome) external {
    if (msg.sender != settlementManager) revert NotSettlementManager();
    _calls[callId].status = CallStatus.Settled;
    _calls[callId].outcome = outcome;
}
```
Consequences: (1) `markSettled` can overwrite a `Settled` call's outcome (the SettlementManager in Phase 4 can flip CallerWon↔CallerLost with no one-shot guard), and `markCallerExited` could re-flip a `Settled` call back to `CallerExited`, re-opening it for follow/fade deposits (since `_deposit` accepts `CallerExited`). The intended SOCIAL-27 invariant ("settled call must not be re-exited") is not enforced here. (2) An out-of-range `callId` reverts with a raw array-OOB panic rather than a defined error — inconsistent with `getCall`'s graceful zero-struct return and a poor surface for the Phase 4 caller. These guards are cheap and must exist before the Phase 4 SettlementManager is wired against this contract.
**Fix:**
```solidity
function markCallerExited(uint256 callId) external {
    if (msg.sender != followFadeMarket) revert NotAuthorized();
    require(callId != 0 && callId < _calls.length, "bad-callId");
    require(_calls[callId].status == CallStatus.Live, "not-live");
    _calls[callId].status = CallStatus.CallerExited;
    _calls[callId].callerExitedAt = uint64(block.timestamp);
}
function markSettled(uint256 callId, Outcome outcome) external {
    if (msg.sender != settlementManager) revert NotSettlementManager();
    require(callId != 0 && callId < _calls.length, "bad-callId");
    require(_calls[callId].status != CallStatus.Settled, "already-settled");
    _calls[callId].status = CallStatus.Settled;
    _calls[callId].outcome = outcome;
}
```

### CR-03: Notification mark-read is functionally broken — client omits required `user` param

**File:** `apps/web/app/components/NotificationInbox.tsx:178-189` (and `206-219`)
**Issue:** The relayer route hard-requires `request.query.user` and returns `400 missing_param` when absent (`notifications.ts:162-165`). Both the auto-mark-on-open effect and `handleMarkAllRead` POST to `${relayerUrl}/api/notifications/mark-read` with only `{ ids }` in the body and `credentials: 'include'` — no `?user=` query string and no `Authorization: Bearer` header. The route's `privySessionPreHandler` requires `Authorization: Bearer <token>` (it does not read cookies), so this request fails the 401 gate first and the 400 missing-param second. Mark-read can never succeed from the UI; unread badges will never clear server-side. (The `userAddress` prop is passed into the component but never used in the fetch.)
**Fix:** Send the Privy access token and the address:
```ts
const token = await getAccessToken(); // from usePrivy()
fetch(`${relayerUrl}/api/notifications/mark-read?user=${encodeURIComponent(userAddress)}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ ids: unreadIds }),
});
```
Note this still requires CR-01 to be fixed server-side so the address is not the trust boundary.

### CR-04: `/live-state` response is missing every field its own consumers read — call page and OG meta render permanent placeholders

**File:** `apps/relayer/src/routes/live-state.ts:165-171` vs `apps/web/app/call/[id]/page.tsx:125-152` and `apps/web/app/call/[id]/layout.tsx:27-55`
**Issue:** `GET /api/calls/:id/live-state` returns only `{ followReserve, fadeReserve, followTotalShares, fadeTotalShares, followPct }`. But `fetchCallData()` in `page.tsx` calls the *same* endpoint and reads `id, caller, handle, marketLine, category, stake, conviction, expiry, createdAt, reasoning, criteriaText, criteriaHash, status, repScore, callerExitedAt, callerExitedPenalty` — none of which exist in the response. Every one falls back to its default, so the live receipt page shows `marketLine='Call'`, `stake=0`, `status='Live'`, `expiry=now+24h`, etc. — never the real call. Likewise `layout.tsx`'s `fetchCallMeta()` reads `statusVersion`, `marketLine`, `handle` from this endpoint; all are absent, so `statusVersion` is permanently `0` and the OG cache-bust (`/og/{id}?v={statusVersion}`) never invalidates on status transitions — defeating the D-09 mechanism the notification worker bumps Redis for. This is a correctness/data-loss defect for the core user-facing receipt, not a styling nit.
**Fix:** Either (a) have `/live-state` join the subgraph/CallRegistry call metadata (caller, handle, marketLine, status, expiry, createdAt, conviction, stake, statusVersion from the Redis `status_version:{callId}` key) into the response, or (b) point `fetchCallData`/`fetchCallMeta` at the correct metadata endpoint (e.g. `/api/feed?callId=` or a dedicated `/api/calls/:id`) and keep `/live-state` for reserves only. The two sides of this contract must be reconciled.

## Warnings

### WR-01: Frontend treats raw 18-decimal shares as a 6-decimal USDC position value

**File:** `apps/web/app/call/[id]/page.tsx:283-285, 373-374, 1057-1059`
**Issue:** `userPositionValue = userIsFollower ? followShares : fadeShares;` uses raw share balances (18-decimal) directly as a USDC position value, then computes `positionSlash = userPositionValue * 10 / 100` and passes `positionValue`/`slash`/`userReceives` to `PositionExitModal`, which renders them with `formatUsdc` (÷1e6). The displayed "position value" and "you receive" will be wildly wrong (off by ~1e12 in scale, and conceptually wrong — shares are not USDC). The inline comment even admits "simplified; real value from reserve share." For a money UI that shows a user what they will receive on exit, this is misleading.
**Fix:** Compute position value as `userShares * reserve / totalShares` (mirror the contract's `exitPosition`), using the live `followReserve`/`followTotalShares` already read, then apply the 10% slash to that USDC value.

### WR-02: Caller-exit modal shows a hardcoded `repDelta={-35}` regardless of decay

**File:** `apps/web/app/call/[id]/page.tsx:1048`
**Issue:** `repDelta={-35} // approximate` is passed to `CallerExitModal`, but `@call-it/shared` already exports `computeCallerExitRepDelta(createdAt, expiry, now)` (the exact parity function). The modal therefore always shows "-35 rep" even though the real on-chain delta ranges [-45, -10] by decay. Users are shown an incorrect, irreversible consequence before signing a high-friction, rep-slashing transaction.
**Fix:** `repDelta={callData ? computeCallerExitRepDelta(callData.createdAt, callData.expiry, nowSec) : -35}` and import the function (it is already exported alongside `computeCallerExitPenaltyPct`).

### WR-03: `sendAlert` re-throws; alert failure or missing Telegram env can crash a fan-out tick

**File:** `apps/relayer/src/workers/alerts.ts:128-148` consumed by `apps/relayer/src/workers/notification-fanout.ts:255-270`
**Issue:** `sendAlert` re-throws on send failure, and `getBot()` throws if `TELEGRAM_BOT_TOKEN`/chat IDs are unset. In `processCallerExitedEvent`, the alert call is wrapped in try/catch (good), but `getBot()` throwing synchronously inside `sendAlert` is also caught there — so the fan-out itself survives. However, the same `sendAlert('caller_exited_broadcast', …)` pattern is the only alert path, and the broader risk is in `index.ts:193` where the BullMQ-compat path calls `sendAlert('tvl_approach', …)` — if Telegram env is missing in staging, this throws and is only saved by an inline `.catch`. The contract "worker error handling must not throw (keep interval alive)" is met for the fan-out loop specifically, but the re-throw design is fragile: any new caller that forgets the try/catch will take down its loop.
**Fix:** Make `sendAlert` swallow-and-log by default (it already logs the failure), or provide a `sendAlertSafe` wrapper used by all worker paths. At minimum, document that every caller MUST wrap `sendAlert` in try/catch.

### WR-04: `quote-stance` GET returns a single `{ stance }` object but the frontend expects an array

**File:** `apps/relayer/src/routes/quote-stance.ts:74-80` vs `apps/web/app/call/[id]/page.tsx:175-194`
**Issue:** `GET /api/calls/quote-stance?quoteCallId=X` returns `{ stance: rows[0].stance }` (a single string or null). `fetchQuoteCalls()` does `const raw = await res.json() as unknown[]; return raw.map(...)` — it expects a JSON array of quote entries. `{ stance: 'following' }.map` is not a function; `raw.map` throws, is caught by the surrounding try/catch, and `fetchQuoteCalls` silently returns `[]`. The Quote Calls column will always render "No quote-calls yet." even when stances exist. Data-contract mismatch between producer and consumer.
**Fix:** Align the shapes — either return an array of quote-call objects from the endpoint, or change the frontend to call the correct quote-list endpoint and parse `{ stance }` only where a single stance is expected.

### WR-05: `notification-fanout` from-block reset to `1n` can replay the entire chain on RPC failure

**File:** `apps/relayer/src/workers/notification-fanout.ts:302, 321`
**Issue:** If `getBlockNumber()` fails during init, `lastBlockSeen` is set to `0n`, and the first `tick` computes `fromBlock = lastBlockSeen === 0n ? 1n : ...` → scans `getLogs` from block 1 to latest on Arbitrum Sepolia. That is a massive range that most RPC providers reject (block-range cap), and on success it would re-process and re-insert duplicate `caller_exited` notifications for every historical event (no idempotency key on insert). The duplicate-notification risk is real because `notifications` has no unique constraint on `(userAddress, callId, eventType)`.
**Fix:** On init failure, retry `getBlockNumber()` before serving traffic rather than defaulting to `0n`; cap `getLogs` ranges (e.g. ≤10k blocks per tick); and/or add a unique index and `onConflictDoNothing()` on notification inserts so replays are idempotent.

### WR-06: Notification fan-out inserts notify the caller themselves and use raw 0x address as `callerHandle`

**File:** `apps/relayer/src/workers/notification-fanout.ts:202-214`
**Issue:** Holders are fetched from the subgraph by `callId`; if the caller also holds a follow/fade position they will receive a "you exited your own call" notification. Separately, `payload.callerHandle = caller` is the lowercased 0x address, and the UI renders `@{handle}` directly (`NotificationInbox.tsx:130`) — users see `@0xabc…` instead of a display handle. Minor data-quality issues but they degrade the core "person-first" notification UX.
**Fix:** Exclude the caller's own address from the holder set before insert; resolve `callerHandle` via ProfileRegistry `displayHandle`/subgraph before writing the payload.

### WR-07: `getCallsByUser` pagination computes `end - offset` after clamping but does not guard `offset + limit` overflow

**File:** `packages/contracts/src/CallRegistry.sol:339-353`
**Issue:** `uint256 end = offset + limit;` can overflow if a caller passes `limit` near `type(uint256).max`, wrapping `end` to a small value; the subsequent `if (end > total) end = total;` then would not trigger and `new uint256[](end - offset)` underflow-reverts. It is a view function (no funds at risk) and 0.8 reverts rather than corrupts, so impact is limited to a confusing revert, but the bounds handling is not robust against adversarial inputs.
**Fix:** `uint256 end = limit > total - offset ? total : offset + limit;` (offset already checked `< total`), or use `Math.min`.

### WR-08: `ProfileRegistry.applyRepDelta` can silently truncate a rep above `uint128` max and trusts `int256→uint128` cast

**File:** `packages/contracts/src/ProfileRegistry.sol:227-234`
**Issue:** `_profiles[user].globalRep = uint128(newRep < 0 ? 0 : uint256(newRep));` floors at 0 (REP-02 — correct) but does not clamp the upper bound. If a future positive-delta writer pushes `newRep` above `type(uint128).max` (2^128-1), the `uint128(...)` cast silently truncates, corrupting the score. For Phase 2 the only writer is FFM applying negative deltas, so it is not currently exploitable, but the slot is documented as the Phase 5 Stylus score sink and the unchecked cast is a latent correctness hazard in a reputation-critical field.
**Fix:** Add an explicit upper clamp (`if (newRep > int256(uint256(type(uint128).max))) newRep = int256(uint256(type(uint128).max));`) or document and `require` the bound.

### WR-09: `live-state` and OG route do not short-circuit the known-zero FFM address — every request does a guaranteed-useless RPC round trip

**File:** `apps/relayer/src/routes/live-state.ts:142-153`, `apps/web/app/og/[callId]/route.ts:368-387`
**Issue:** `FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA` is the tracked zero placeholder (deferred deploy — not itself a bug per the review brief). But both endpoints read against `0x000…000` on every request: live-state will multicall the zero address (returns 0s, then caches a 50/50 result), and the OG route reads three contracts and relies on the catch→fallback. This wastes an RPC round trip per request and, for OG, depends on a revert to trigger the fallback path. Not a security issue, but the code should guard the zero address to avoid burning RPC quota and to make the deferred-state behavior explicit.
**Fix:** Early-return a deterministic empty/fallback response when the FFM address is `0x000…000`, with a log line indicating the deferred-deploy state.

## Info

### IN-01: `DeployPhase2.s.sol` registers 5 known-placeholder Pyth feeds as `bytes32(0)` — deploy blocker reminder

**File:** `packages/contracts/script/DeployPhase2.s.sol:94-102, 180-190`
**Issue:** `FEED_UNI/LINK/AAVE/MKR/DOGE` are `bytes32(0)`. `addAsset("UNI", bytes32(0))` sets `allowlistedFeedKeys[bytes32(0)] = true`, which makes `_assertAllowlisted` accept `assetA == 0` for any PriceTarget/SpreadVs call (a zero feed key passes the allowlist). This is a documented/tracked item (operator must replace before Sepolia/mainnet), so it is flagged as a deploy-time reminder, not a new finding. The script header already warns "DO NOT DEPLOY without replacing these placeholders."
**Fix:** Operator action: replace the 5 placeholders with verified Hermes feed IDs before running the script. Optionally `require(feedId != bytes32(0))` in `addAsset` to fail closed.

### IN-02: `MarketPositioningBar` renders fade width as `flex:1` not the computed `fadePct`, and `followPct` can show stale split during penalty injection

**File:** `packages/ui/src/compound/MarketPositioningBar.tsx:71-89`
**Issue:** The follow segment uses `width: ${followPct}%` while the fade segment uses `flex: 1` to fill the remainder. This renders correctly visually, but the `fadePct` label (computed as `100 - followPct`) and the bar can diverge by a rounding integer. Cosmetic; flexbox-only constraint is respected (good — no `display:grid`).
**Fix:** Optional — render fade as `width: ${fadePct}%` for label/bar consistency.

### IN-03: OG card `callStatement` is a hardcoded `Call #{id}` placeholder

**File:** `apps/web/app/og/[callId]/route.ts:420-422`
**Issue:** The hero text on the Live OG card is `Call #${callIdStr}` because the market line is not in on-chain `Call` data. Documented as Phase 7 subgraph wiring. The card otherwise renders real reserves/conviction/stake. Runtime is correctly `'nodejs'` and all layout is flexbox (Pitfall 15 respected).
**Fix:** Wire the market line from subgraph/relayer when available; acceptable as a Phase 2 placeholder.

### IN-04: `addNFTCollection` ignores the `symbol` parameter

**File:** `packages/contracts/src/CallRegistry.sol:396-399`
**Issue:** `addNFTCollection(address collection, string calldata /*symbol*/)` discards `symbol` (only the address bool is set, and the event emits no symbol). The symbol is purely a frontend display nicety not stored anywhere, so callers may assume it is persisted when it is not.
**Fix:** Either store/emit the symbol or remove the param from the signature to avoid the false impression that it is recorded.

### IN-05: `processCallerExitedEvent` continues to status-version bump even after a DB insert failure

**File:** `apps/relayer/src/workers/notification-fanout.ts:227-235`
**Issue:** When the batch insert throws, the code logs and falls through to the Redis `statusVersion` bump (intentional per comment). Net effect: the OG card is cache-busted (correct) but holders never get their notification row, and there is no retry/dead-letter for the failed insert — the event is consumed and `lastBlockSeen` advances past it. Silent notification loss on transient DB errors.
**Fix:** On insert failure, do NOT advance `lastBlockSeen` past this event (allow re-processing next tick) or push the failed batch to a retry queue.

### IN-06: `quote-stance` POST has no auth and no dedupe — anyone can spam/overwrite stance annotations

**File:** `apps/relayer/src/routes/quote-stance.ts:90-134`
**Issue:** `POST /api/calls/quote-stance` has no auth gate (documented as "authenticated at the transaction layer") and no uniqueness on `(quoteCallId)`, so repeated POSTs insert duplicate rows; the GET `limit(1)` then returns an arbitrary one. Low impact (off-chain annotation only, no funds), but an unauthenticated write endpoint that the public feed reads is an integrity/spam vector.
**Fix:** Add a unique constraint on `quoteCallId` with upsert semantics, and consider a lightweight auth or rate limit on the write.

---

_Reviewed: 2026-05-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
