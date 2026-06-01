---
phase: 03-challengeescrow
reviewed: 2026-06-01T00:00:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - packages/contracts/src/ChallengeEscrow.sol
  - packages/contracts/src/interfaces/IChallengeEscrow.sol
  - packages/contracts/script/DeployPhase3.s.sol
  - packages/contracts/test/ChallengeEscrow.t.sol
  - packages/contracts/test/ChallengeEscrowGates.t.sol
  - packages/contracts/test/ChallengeEscrowParity.t.sol
  - packages/contracts/test/helpers/CeTestHelper.sol
  - packages/shared/src/constants/addresses.ts
  - packages/shared/src/index.ts
  - apps/relayer/src/db/schema.ts
  - apps/relayer/src/routes/duel-live-state.ts
  - apps/relayer/src/routes/duels.ts
  - apps/relayer/src/workers/duel-king-worker.ts
  - apps/relayer/src/workers/duel-trending-worker.ts
  - apps/relayer/src/workers/notification-fanout.ts
  - apps/relayer/src/index.ts
  - apps/web/app/call/[id]/page.tsx
  - apps/web/app/components/ChallengeFormModal.tsx
  - apps/web/app/duel/[challengeId]/page.tsx
  - apps/web/app/og/duel/[challengeId]/route.ts
  - apps/web/app/page.tsx
  - apps/web/tests/challenge-gates.test.ts
  - packages/subgraph/src/challenge-escrow.ts
  - packages/subgraph/schema.graphql
  - packages/subgraph/subgraph.yaml
findings:
  critical: 6
  warning: 11
  info: 5
  total: 22
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-06-01T00:00:00Z
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

This review covers the ChallengeEscrow money contract, its deploy script and test suite, the relayer duel routes and workers, the subgraph handlers, and the Phase 3 frontend surfaces. The contract implementation is fundamentally sound on its core invariants: CEI ordering is maintained throughout, `ReentrancyGuard` is applied on all USDC paths, the `min(callerInputStake, challengerStake)` accept formula is correctly computed from `callRegistry.getCall(ch.callId)` (not `min(x,x)`), the 3-way TVL cap sums all three protocol buckets, `claimDuelPayout` and `claimOverage` are correctly excluded from `whenNotPaused`, and `claimDuelPayout` is idempotent via per-side claimed flags.

Six blockers require fixes before this code ships:

1. `settleDuel` lacks `nonReentrant`, making it susceptible to reentrancy via the `IERC20.transfer` call inside `_pushOverage`.
2. `setSettlementManager` accepts `address(0)`, which permanently bricks `settleDuel`.
3. The OG route ABI has wrong field names — `createdAt`/`resolvedAt` instead of `proposedAt`/`callerClaimed` — causing all RPC reads to silently decode to zero values.
4. The pot display on the Duel page renders `callerStake + challengerStake` (the raw escrowed total) rather than `min(callerStake, challengerStake) * 2` (the actual prize pot), which is wrong in asymmetric duels.
5. The `duels.ts` route query fetches the Duel King with an ascending sort on `weekAnchor`, returning the oldest king instead of the current week's king.
6. The subgraph `startBlock: 1` for the zero-address ChallengeEscrow placeholder will cause The Graph to scan from block 1 on every deploy, producing enormous sync time and potential indexer exhaustion.

---

## Critical Issues

### CR-01: `settleDuel` missing `nonReentrant` — reentrancy via `_pushOverage`

**File:** `packages/contracts/src/ChallengeEscrow.sol:279-297`

**Issue:** `settleDuel` calls `_pushOverage`, which calls `IERC20(USDC_ARB_NATIVE).transfer(overcommitter, overage)` (line 428 — the bool-return variant intentionally used to avoid griefing). However, `settleDuel` itself has no `nonReentrant` guard. A malicious overcommitter whose address is an ERC-777 or a contract with a fallback can reenter `settleDuel` or `claimDuelPayout` during the transfer call. The effects for `_pushOverage` are written before the external call (overageClaimed=true, totalEscrow decremented), but because `settleDuel` is not guarded, a second call to `settleDuel` on the same challengeId could pass the `ch.status != ChallengeStatus.Accepted` gate if the status write on line 290 has not yet been committed in that call's storage snapshot (same tx, nested call stack). More concretely: if USDC itself is upgraded to support hooks or the overcommitter is a contract, the reentrancy window is the gap between the `ch.status = ChallengeStatus.Settled` write and the external call return.

USDC on Arbitrum is a native token with no hooks, so this is not currently exploitable, but the spec mandate (SAFETY-05..09) requires `nonReentrant` on all transfer paths, and the contract header comment explicitly states "ReentrancyGuard on USDC transfer paths". `settleDuel` transfers USDC and must be guarded.

**Fix:**
```solidity
function settleDuel(uint256 challengeId, address winner)
    external
    onlySettlementManager
    nonReentrant   // add this
{
```

---

### CR-02: `setSettlementManager(address(0))` permanently bricks `settleDuel`

**File:** `packages/contracts/src/ChallengeEscrow.sol:374-377`

**Issue:** `setSettlementManager` accepts any address including `address(0)`. If the owner calls `setSettlementManager(address(0))` (accidental or malicious), `settleDuel` becomes permanently uncallable because the `onlySettlementManager` modifier checks `msg.sender != settlementManager`, which is always true when `settlementManager == address(0)`. Since `ChallengeEscrow` is non-upgradeable, all active duels would be permanently frozen — users could never claim payouts. `claimRefund` and `claimOverage` are unaffected, but winners of accepted duels lose their funds.

**Fix:**
```solidity
function setSettlementManager(address newManager) external onlyOwner {
    require(newManager != address(0), "invalid-manager");
    settlementManager = newManager;
    emit SettlementManagerSet(newManager);
}
```

Note: The deploy-time zero address (`settlementManager = address(0)` in the constructor) is intentional per D-01 and is fine. Only the setter needs the guard.

---

### CR-03: OG route ABI has wrong field names — all challenge reads return zero values

**File:** `apps/web/app/og/duel/[challengeId]/route.ts:51-75`

**Issue:** The inline ABI for `getChallenge` at lines 51-75 specifies a `tuple` with fields `createdAt` (uint64) and `resolvedAt` (uint64) in positions 8 and 9. The actual `IChallengeEscrow.Challenge` struct (defined in `packages/contracts/src/interfaces/IChallengeEscrow.sol:37-49`) has fields `proposedAt` (uint64 at position 6), `winner` (address at position 7), `status` (ChallengeStatus at position 8), `callerClaimed` (bool), `challengerClaimed` (bool), `overageClaimed` (bool). There is no `createdAt` or `resolvedAt` field.

Additionally, the OG ABI omits `proposedAt` entirely and lists only 9 tuple components vs. the 11 in the actual struct. viem decodes ABI tuples positionally; mismatched names cause field references to resolve to wrong values. The `challenge.caller` and `challenge.challenger` values will decode correctly (positions 1 and 2 match), but `challenge.callerStake` may decode from the wrong position depending on how missing fields are handled. The pot computation at line 541 (`matchedStake * 2n`) will produce incorrect values.

**Fix:** Replace the inline ABI to match the real struct field order and names exactly:
```typescript
const challengeEscrowAbi = [
  {
    type: 'function',
    name: 'getChallenge',
    inputs: [{ name: 'challengeId', type: 'uint256' }],
    outputs: [{
      name: '',
      type: 'tuple',
      components: [
        { name: 'callId', type: 'uint256' },
        { name: 'caller', type: 'address' },
        { name: 'challenger', type: 'address' },
        { name: 'callerStake', type: 'uint96' },
        { name: 'challengerStake', type: 'uint96' },
        { name: 'proposedAt', type: 'uint64' },
        { name: 'winner', type: 'address' },
        { name: 'status', type: 'uint8' },
        { name: 'callerClaimed', type: 'bool' },
        { name: 'challengerClaimed', type: 'bool' },
        { name: 'overageClaimed', type: 'bool' },
      ],
    }],
    stateMutability: 'view',
  },
] as const;
```

---

### CR-04: Duel page renders wrong pot — `callerStake + challengerStake` instead of `min(callerStake, challengerStake) * 2`

**File:** `apps/web/app/duel/[challengeId]/page.tsx:499`

**Issue:** Line 499 computes `const potTotal = displayCallerStake + displayChallengerStake`. This is the total USDC held in escrow, not the prize pot. The prize pot is `min(callerStake, challengerStake) * 2` per SOCIAL-31 and the contract's `claimDuelPayout` formula. In an asymmetric duel where challenger stakes $100 and caller stakes $5, `potTotal` would display as $105, but the winner actually receives approximately $9.90 (pot = $10, 1% fee). The overage ($95) belongs to the challenger regardless of outcome. This misdescribes the stakes to users and could constitute a misleading financial display.

The relayer `duel-live-state.ts` correctly computes `pot = matchedStake * 2n` (line 360). The frontend should use the `pot` field from the relayer response rather than recomputing it incorrectly.

**Fix:** In `apps/web/app/duel/[challengeId]/page.tsx`, replace line 499:
```typescript
// Wrong: const potTotal = displayCallerStake + displayChallengerStake;
// Correct: use min * 2 (matches contract formula and relayer pot field)
const matchedStake = displayCallerStake < displayChallengerStake
  ? displayCallerStake
  : displayChallengerStake;
const potTotal = matchedStake * 2n;
```

The `DuelLiveState` type should also expose the `pot` field (string) from the relayer, which already computes this correctly.

---

### CR-05: `duels.ts` Duel King query sorts ascending — returns oldest king, not current week

**File:** `apps/relayer/src/routes/duels.ts:291`

**Issue:** Line 291 queries the `duelKings` table with `.orderBy(duelKings.weekAnchor)` — Drizzle's default sort direction is ascending. This returns the row with the earliest `weekAnchor`, i.e., the oldest recorded Duel King, not the current week's king. For a feed that surfaces a live "Duel King" badge, this is incorrect once multiple weeks have been computed. The correct query is `orderBy(desc(duelKings.weekAnchor))`.

**Fix:**
```typescript
import { gt, desc } from 'drizzle-orm';
// ...
const kingRows = await db
  .select()
  .from(duelKings)
  .orderBy(desc(duelKings.weekAnchor))  // descending: current week first
  .limit(1);
```

---

### CR-06: Subgraph ChallengeEscrow `startBlock: 1` — will scan entire chain history on deploy

**File:** `packages/subgraph/subgraph.yaml:146`

**Issue:** The ChallengeEscrow data source uses `startBlock: 1` as a placeholder (with a TODO comment on line 145). When the subgraph is deployed to The Graph with a live ChallengeEscrow address but without updating `startBlock`, the indexer will attempt to scan from block 1 on Arbitrum Sepolia (millions of blocks) before reaching the deploy block. This produces multi-hour or multi-day sync times, may exhaust indexer memory, and can cause the Studio deployment to fail or timeout. The deploy script at `DeployPhase3.s.sol:169` explicitly instructs the operator to update `startBlock` from the broadcast output, but the placeholder value is dangerous — an operator could forget.

A safer default is `startBlock: 999999999` (far-future block that forces an error if not updated) or a comment-only reminder in the address field. The zero address at line 143 at least prevents event matching, but `startBlock: 1` causes unnecessary block scanning overhead even for a zero-address source.

**Fix:** Change `startBlock: 1` to a value that makes the accidental-deploy consequence obvious:
```yaml
# TODO: replace with real deploy block from `forge script DeployPhase3` broadcast output.
# Using 999999999 as a safe sentinel — must be replaced before ChallengeEscrow address is set.
startBlock: 999999999
```

---

## Warnings

### WR-01: `rejectChallenge` missing `nonReentrant`

**File:** `packages/contracts/src/ChallengeEscrow.sol:222-245`

**Issue:** `rejectChallenge` performs a `safeTransfer` to the challenger at line 242 without `nonReentrant`. The effects (status = Rejected, totalEscrow -= amount) are written before the transfer (CEI satisfied), so there is no reentrancy exploit path against state. However, CLAUDE.md specifies "ReentrancyGuard on USDC transfer paths" broadly. For consistency with every other external-transfer function in the contract (`proposeChallenge`, `acceptChallenge`, `claimRefund`, `claimDuelPayout`, `claimOverage` all have `nonReentrant`), `rejectChallenge` should also be guarded. Inconsistency is a maintenance liability — a future code change might shift the state write after the transfer.

**Fix:**
```solidity
function rejectChallenge(uint256 challengeId)
    external
    nonReentrant
    whenNotPaused
{
```

---

### WR-02: `claimDuelPayout` totalEscrow underflow on asymmetric duels when overage not yet claimed

**File:** `packages/contracts/src/ChallengeEscrow.sol:333`

**Issue:** `claimDuelPayout` decrements `totalEscrow -= pot` where `pot = min(callerStake, challengerStake) * 2` (line 323). In an asymmetric duel where `challengerStake > callerStake`, `totalEscrow` holds `challengerStake + callerStake` worth of USDC (both deposited). The push-overage path in `settleDuel._pushOverage` already decrements `totalEscrow -= overage` (line 425) when the push succeeds or is pre-marked. If the overage push failed (fallback path, `overageClaimed = false`), `totalEscrow` still holds the full `challengerStake + callerStake`. In that case, after `claimDuelPayout` subtracts `pot = 2 * min(callerStake, challengerStake)`, `totalEscrow` will still hold the overage amount, which is correct. However when the overage push succeeded, `totalEscrow` was already decremented by `overage`; after `claimDuelPayout` subtracts `pot`, the final `totalEscrow` is:

```
Before settleDuel: totalEscrow = callerStake + challengerStake
After _pushOverage (success): totalEscrow = callerStake + challengerStake - overage
  = callerStake + challengerStake - (challengerStake - callerStake)  [assuming challengerS > callerS]
  = 2 * callerStake = pot
After claimDuelPayout: totalEscrow = pot - pot = 0  [correct for this duel]
```

This math works out correctly. The concern is specifically the `protocolFee` deduction: `totalEscrow -= pot` removes the full pot including the protocol fee share. The fee is then transferred out to treasury from the contract balance. This is consistent — `totalEscrow` is decremented by the full pot at claim time and the fee is paid from the same USDC. No underflow path was found; this is a WARNING to document the invariant explicitly in code comments for future maintainers.

**Fix:** Add a comment above line 333:
```solidity
// CEI: decrement totalEscrow by full pot (payout + protocolFee) before transfers.
// totalEscrow accounting: if overage was pushed successfully in _pushOverage,
// totalEscrow == pot at this point. If push failed, totalEscrow == pot + overage;
// the remaining overage will be decremented when claimOverage() is called.
totalEscrow -= pot;
```

---

### WR-03: `claimOverage` reverts with `AlreadyClaimed` on symmetric duels but error message is confusing

**File:** `packages/contracts/src/ChallengeEscrow.sol:359`

**Issue:** When `overage == 0` (symmetric stakes), `claimOverage` reverts with `AlreadyClaimed` (line 359: `if (overage == 0) revert AlreadyClaimed()`). This is the wrong error: there was never an overage to claim — the correct error would be `NoOverageForSymmetricDuel` or similar. A caller who tries `claimOverage` on a symmetric duel receives an error that implies they already claimed something, which is misleading for debugging and for frontend error handling.

This is not a security issue but affects developer experience and frontend error rendering.

**Fix:** Add a dedicated error in `IChallengeEscrow.sol`:
```solidity
/// @notice claimOverage: no overage exists (symmetric stakes or overage was zero).
error NoOverageAvailable();
```
Then in `ChallengeEscrow.sol:359`:
```solidity
if (overage == 0) revert NoOverageAvailable();
```

---

### WR-04: Notification fan-out `processChallengeNotifications` uses only `proposedAt` as recency proxy — misses Accepted/Rejected status updates

**File:** `apps/relayer/src/workers/notification-fanout.ts:370`

**Issue:** `processChallengeNotifications` queries challenges with `proposedAt_gt: $since` (line 370-384) to find recently updated challenges. This means an `Accepted` or `Rejected` status change is only caught within 60 seconds of when the challenge was originally proposed. If a caller accepts or rejects a challenge after more than 60 seconds (which is normal — the window is 24 hours), the `challenge_accepted` and `challenge_rejected` notifications are never generated.

The fix is to also query by `acceptedAt_gt` for Accepted status, but the subgraph schema only exposes `proposedAt` and `acceptedAt` on the Challenge entity. A better proxy would be `max(proposedAt, acceptedAt)` or a separate `updatedAt` field. The simplest fix is to widen the lookback to `2 * intervalMs * 2` (e.g. 120s) for accepted/rejected notifications as well, but that still misses late accepts.

**Fix:** Add a second subgraph query for `acceptedAt_gt` / status changes, or add an `updatedAt` field to the Challenge schema. At minimum, widen the lookback for Accepted/Rejected status:
```typescript
// For status=Accepted, query by acceptedAt_gt; for Proposed, use proposedAt_gt
const cutoffSec = Math.floor((Date.now() - 60_000) / 1000).toString();
// Additional query: challenges(where: { acceptedAt_gt: $since, status_in: ["Accepted", "Rejected"] })
```

---

### WR-05: `duel-trending-worker` uses `parseInt(c.id, 10)` — loses precision for large challengeIds

**File:** `apps/relayer/src/workers/duel-trending-worker.ts:205`

**Issue:** `challengeIdNum = parseInt(c.id, 10)` converts the subgraph challenge ID to a JS `number`. JavaScript `number` can only represent integers exactly up to 2^53 - 1 (9_007_199_254_740_991). The `trending_duels.challengeId` column is Postgres `integer` (signed 32-bit, max ~2.1 billion), so the column itself limits precision. However, the subgraph `id` field for a Challenge entity is the on-chain `challengeId.toString()`. ChallengeEscrow uses a `uint256` counter. While in practice a 1v1 challenge system is unlikely to exceed 2 billion challenges, using `parseInt` for this conversion is fragile. The bigger practical issue is that if `c.id` is a non-numeric string (e.g., includes a tx hash prefix or some subgraph version produces a compound ID), `parseInt` silently returns `NaN`, which Postgres will reject at insert time, causing the upsert to throw and the worker tick to fail.

**Fix:** Validate the ID before parsing:
```typescript
const challengeIdNum = parseInt(c.id, 10);
if (isNaN(challengeIdNum) || challengeIdNum <= 0) {
  logger.warn({ event: 'duel_trending_worker_invalid_id', challengeId: c.id }, 'Non-numeric challenge ID — skipping');
  continue;
}
```

---

### WR-06: `challenge-escrow.ts` subgraph handler: `handleChallengeAccepted` sets `caller` from the event but the `caller` field defaults to `new Bytes(0)` if the entity was not created on `ChallengeProposed`

**File:** `packages/subgraph/src/challenge-escrow.ts:76-97`

**Issue:** `handleChallengeAccepted` calls `ensureChallenge(challengeId)` which lazy-creates the Challenge entity if it does not exist. If for any reason `ChallengeProposed` was missed (e.g., re-indexing from a block after the propose event, a reorganization, or subgraph upgrade with wrong startBlock), the entity will be created by `handleChallengeAccepted` with `challenge.challenger = new Bytes(0)` and `challenge.call = ''`. These defaults are invalid: a Challenge entity with `challenger = 0x0` and `call = ''` will produce broken subgraph data that downstream queries (notification fan-out, trending worker) cannot recover from.

The `caller` field is correctly populated in `handleChallengeAccepted` (line 80: `challenge.caller = event.params.caller`). The issue is the `challenger` and `call` fields remain zero if propose was missed. This is an inherent limitation of the lazy-init pattern when events are processed out of order.

**Fix:** Add a log warning when `ensureChallenge` creates a new entity from a non-propose handler:
```typescript
export function handleChallengeAccepted(event: ChallengeAccepted): void {
  let challengeId = event.params.challengeId.toString();
  let challenge = Challenge.load(challengeId);
  if (challenge == null) {
    // Warn: ChallengeProposed was missed; entity created with missing challenger/callId
    log.warning('ChallengeAccepted before ChallengeProposed for id {}', [challengeId]);
    challenge = ensureChallenge(challengeId);
  }
  // ...
}
```

---

### WR-07: `duel-live-state.ts` status label fallback returns `'Proposed'` for unknown status ordinals

**File:** `apps/relayer/src/routes/duel-live-state.ts:138-140`

**Issue:** `challengeStatusLabel(status)` at line 138 returns `'Proposed'` as the fallback for any unknown status ordinal (`?? 'Proposed'`). If the contract is upgraded with new ChallengeStatus values (ordinals 5+) or if an unexpected value is returned from the RPC, the API will silently report the status as `'Proposed'` instead of an error. A downstream consumer (frontend, subgraph) treating `status: 'Proposed'` will incorrectly render a settled or refunded duel as pending a caller response.

**Fix:**
```typescript
function challengeStatusLabel(status: number): string {
  return CHALLENGE_STATUS_LABELS[status] ?? `Unknown(${status})`;
}
```

---

### WR-08: `call/[id]/page.tsx` pending challenge fetch passes `userAddress` to server but does not auth-gate the notifications endpoint

**File:** `apps/web/app/call/[id]/page.tsx:272-293`

**Issue:** `fetchPendingChallenge` fetches from `/api/notifications?callId=...&type=challenge_proposed` without any authentication header. The comment on the route states "spec §18.1 public read" but the notifications endpoint elsewhere in the relayer is described as "Privy-gated mark-read." If the notifications endpoint for this query is truly unauthenticated, any user can poll for all `challenge_proposed` notifications for any `callId`, leaking the information that a challenge exists for that call to unauthenticated parties. The `challenge_proposed` notification contains the `challengeId` and `challengerHandle`.

This is a privacy consideration: challenge existence is onchain and thus public, but the off-chain notification may contain additional payload fields. The code at line 422 in `notification-fanout.ts` sets `payload = { challengeId: challengeIdStr }` which is already public. However the architecture should be explicit about whether this endpoint is intended to be public.

**Fix:** Document the intentional public-read design in the route handler, or add an auth check if the payload contains non-public data. At minimum, verify the notifications route does not expose private user data when called without auth.

---

### WR-09: `ChallengeFormModal` approve step uses exact allowance instead of `type(uint256).max`

**File:** `apps/web/app/components/ChallengeFormModal.tsx:247-257`

**Issue:** The USDC approval in `handleApprove` sets allowance to exactly `stakeValue` (the entered stake amount). If the user changes the stake input after approving but before sending the challenge, the approval will be insufficient, causing the `proposeChallenge` transaction to revert with an ERC-20 allowance error rather than a clear message. A common pattern is to approve `type(uint256).max` or a slightly padded amount. The stale approval is also not reset between modal opens (the `useEffect` on line 148 resets the stake input but not the on-chain allowance state).

This also means a user who approved $50 and then changes to $51 will see the "Approve USDC" button again (since `currentAllowance < stakeValue` re-triggers), requiring a second transaction — acceptable UX but worth noting.

**Fix:** The current design is acceptable; the primary fix is to show a clear warning in the modal UI when the entered stake exceeds the current allowance. Alternatively, approve `stakeValue + buffer` or `type(uint256).max`. The code comment should document the exact-allowance intentional choice if it is intentional.

---

### WR-10: `duel/[challengeId]/page.tsx` callerMatchingStake computed from stale `liveState` (pre-accept state)

**File:** `apps/web/app/duel/[challengeId]/page.tsx:313-317`

**Issue:** The `callerMatchingStake` for the USDC approve preflight is computed as:
```typescript
const callerMatchingStake =
  liveState
    ? liveState.callerStake < liveState.challengerStake
      ? liveState.callerStake
      : liveState.challengerStake
    : 0n;
```
When the challenge is `Proposed` (not yet accepted), `liveState.callerStake` is `0n` (the caller has not yet deposited). This means `callerMatchingStake = 0n` for all proposed challenges, making `callerNeedsApproval` always `false` (since `0n < 0n` is false), and the Approve button is never shown. The caller is sent directly to `acceptChallenge` without being prompted to approve USDC. The `acceptChallenge` transaction will then fail with an ERC-20 allowance error.

The correct matching stake for the pre-accept approve is `min(callerInputStake, challengerStake)` where `callerInputStake` comes from the parent call's stake (i.e., what `callRegistry.getCall(callId).stake` returns). The relayer live-state response does not currently expose the parent call stake.

**Fix:** The Duel page needs to know the caller's call stake (`callRegistry.getCall(callId).stake`) to compute the pre-accept matching stake. Either (a) include `callerCallStake` in the relayer `/api/duels/:id/live-state` response, or (b) add a separate useReadContract read for `callRegistry.getCall(callId).stake` when `isProposed && userIsCaller`. Until this is fixed, the approve step for the caller accept path on the Duel page is broken.

---

### WR-11: `testAsymmetricPot` fuzz test reads `balChallengerBefore` before `settleDuel` but checks final balance after `claimDuelPayout` — overage timing inconsistency

**File:** `packages/contracts/test/ChallengeEscrow.t.sol:186-211`

**Issue:** The `testAsymmetricPot` test captures `balChallengerBefore` at line 186 (before `settleDuel`). After `settleDuel`, the overage is pushed immediately to the challenger (via `_pushOverage`). Then `claimDuelPayout` is called for the challenger (who also won). The final assertion at line 211 checks `received == pot - fee + overage`. The `received` is `balFinal - balChallengerBefore`, which correctly captures both the overage push and the payout claim. However, the test relies on the overage push succeeding (MockUSDC happy path). If the MockUSDC returns `false` from `transfer`, the `UnclaimedOverageCreated` path is triggered, and the test would fail because the overage would not be included in `balFinal`. The test currently does not cover the fallback path.

More critically: `testOveragePushFail` (line 214-242) acknowledges the test "does not actually simulate a push failure" — the MockUSDC does not reject. This means the `_pushOverage` failure-rollback path (lines 431-434 in the contract) has zero test coverage.

**Fix:** Add a test that uses a mock USDC that returns `false` on the first `transfer` call, verifying that:
1. `UnclaimedOverageCreated` is emitted.
2. `ch.overageClaimed` remains `false`.
3. `claimOverage()` succeeds and transfers the correct amount.
4. Double-calling `claimOverage()` reverts with `AlreadyClaimed`.

---

## Info

### IN-01: `_pushOverage` optimistic pre-mark with rollback is unusual — consider documenting the invariant more explicitly

**File:** `packages/contracts/src/ChallengeEscrow.sol:417-438`

**Issue:** `_pushOverage` pre-marks `ch.overageClaimed = true` and decrements `totalEscrow` before calling `transfer`. On failure it rolls back both. This is the correct pattern for a non-reverting transfer path (Pitfall C), but it is the opposite of the standard CEI pattern used everywhere else in the contract (write state, then transfer). The rollback creates a brief window where the state is inconsistent (overageClaimed=true, totalEscrow decremented) if the contract is somehow re-entered between the pre-mark and the transfer. Given `USDC_ARB_NATIVE` is non-reentrant and `settleDuel` is called by `onlySettlementManager`, this is not exploitable, but the pattern deserves a code comment explaining why rollback is safe here.

**Fix:** Add a comment:
```solidity
// Optimistic pre-mark (not standard CEI): we pre-mark overageClaimed=true and
// decrement totalEscrow before the transfer so that a bool-false return can be
// detected and rolled back atomically. This is safe because: (1) settleDuel is
// only callable by onlySettlementManager (not user-controlled), and (2) USDC
// on Arbitrum is non-reentrant. The rollback on lines 432-433 restores invariants.
```

---

### IN-02: `duels.ts` `fetchActiveChallenges` has no subgraph URL validation — silently returns empty on missing env

**File:** `apps/relayer/src/routes/duels.ts:77-144`

**Issue:** `fetchActiveChallenges` returns `[]` when `subgraphUrl` is empty (line 81: `if (!subgraphUrl) return []`). This is handled gracefully, but if `RELAYER_SUBGRAPH_URL` is not set in production, the duels feed will always appear empty with no log event indicating the misconfiguration. The existing logging at line 248 (`duels_route_subgraph_failed`) only fires on a thrown error; an empty URL produces no error log.

**Fix:** Add a startup check or log a warning when subgraph URL is empty:
```typescript
if (!subgraphUrl) {
  logger.warn({ event: 'duels_route_no_subgraph_url' }, 'RELAYER_SUBGRAPH_URL not set — duels feed will be empty');
  return [];
}
```

---

### IN-03: `challenge-gates.test.ts` `isWindowExpired` logic has an off-by-one vs contract — test asserts wrong boundary

**File:** `apps/web/tests/challenge-gates.test.ts:158-163`

**Issue:** The contract's `acceptChallenge` at `ChallengeEscrow.sol:196` checks `block.timestamp > ch.proposedAt + CHALLENGE_ACCEPTANCE_WINDOW`. The TypeScript gate at `challenge-gates.test.ts:75` checks `nowTs > proposedAt + CHALLENGE_ACCEPTANCE_WINDOW_SECS`. These are identical. The boundary test at line 158 asserts that `nowTs == proposedAt + CHALLENGE_ACCEPTANCE_WINDOW_SECS` (exactly at 24h) returns `false` (window still open). This matches the contract's `>` (strict greater-than) check. However, the Foundry test `testWindowExpired` in `ChallengeEscrowGates.t.sol:99` warps to `CHALLENGE_ACCEPTANCE_WINDOW + 1`, confirming the boundary semantics. The TS test is correct. This is documentation-only — worth noting that the boundary test correctly covers the edge case, and no code change is needed.

---

### IN-04: TODO comment in subgraph.yaml for ChallengeEscrow address will not be caught by CI

**File:** `packages/subgraph/subgraph.yaml:145`

**Issue:** The TODO on line 145 instructs the operator to replace the zero address and startBlock after deploy. There is no CI check that prevents deploying the subgraph with the zero address or `startBlock: 1`. The deploy script `DeployPhase3.s.sol:169` prints instructions, but those are advisory. Consider adding a `graph deploy` pre-check script that aborts if the ChallengeEscrow address is still `0x000...000`.

**Fix:** Add a pre-deploy script check:
```bash
# In package.json deploy:sepolia script:
node -e "
  const yaml = require('js-yaml');
  const fs = require('fs');
  const sg = yaml.load(fs.readFileSync('subgraph.yaml'));
  const ce = sg.dataSources.find(d => d.name === 'ChallengeEscrow');
  if (ce.source.address === '0x0000000000000000000000000000000000000000') {
    console.error('ERROR: ChallengeEscrow address is still the zero placeholder');
    process.exit(1);
  }
"
```

---

### IN-05: Inline `USDC_ADDR` literal in `call/[id]/page.tsx` and `duel/[challengeId]/page.tsx`

**File:** `apps/web/app/call/[id]/page.tsx:117`, `apps/web/app/duel/[challengeId]/page.tsx:40`

**Issue:** Both files hardcode `USDC_ADDR = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'` as an inline literal instead of importing from `@call-it/shared`. The `CLAUDE.md` CI grep guard explicitly forbids literal USDC address paste to prevent accidentally using the bridged USDC.e. The guard may not be configured to catch frontend files, but the pattern is inconsistent with the rest of the codebase. `ChallengeFormModal.tsx` at line 34 also hardcodes the address.

**Fix:** In `@call-it/shared`, export `USDC_ARB_NATIVE` (already exists) and import it in these files:
```typescript
import { USDC_ARB_NATIVE } from '@call-it/shared';
const USDC_ADDR = USDC_ARB_NATIVE as `0x${string}`;
```

---

_Reviewed: 2026-06-01T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
