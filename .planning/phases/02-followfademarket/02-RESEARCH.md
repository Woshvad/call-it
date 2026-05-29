# Phase 2: FollowFadeMarket - Research

**Researched:** 2026-05-29
**Domain:** Constant-product AMM (per-callId sub-state), single-custodian contract redeploy, caller/position exits, Live Receipt page, OG card variant 1, in-app notification center
**Confidence:** HIGH (all formulas derived from locked spec §8, §11.2, §12.2; contract patterns verified against deployed Phase 1 source; pitfalls cross-referenced with PITFALLS.md)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Contract custody + integration (the redeploy)**
- D-01: Single-custodian redeploy. `createCall` forwards caller's stake into FollowFadeMarket and initializes the per-call follow pool. ALL real market USDC lives in FollowFadeMarket.
- D-02: Phase-4-ready authorization surface on redeployed CallRegistry. Owner setters `setFollowFadeMarket(addr)` + `setSettlementManager(addr)`; stake-forwarding in `createCall`; guarded status transitions — `markCallerExited(callId)` callable only by FollowFadeMarket, `markSettled(callId, outcome)` callable only by SettlementManager.
- D-03: TVL aggregated now (2 of 3 contracts). `follow`/`fade` enforce the $5K cap against `CallRegistry.currentTvl + FollowFadeMarket` pool totals on every deposit.
- D-04: Redeploy ProfileRegistry with a generic `mapping(address => bool) authorizedRepWriters`, owner-managed. FollowFadeMarket is authorized so caller-exit writes the rep slash directly.
- D-05: Caller-exit rep slash computed in FollowFadeMarket. Calls `profileRegistry.applyRepDelta(caller, delta)` inside the caller-exit tx.
- D-06: FollowFadeMarket ownership/pause mirrors Phase 1. Single deployer key, Ownable2Step, emergency `pause()`; `exitPosition` + `claimPayout` are pause carve-outs.

**Live Receipt liveness**
- D-07: Live numeric state via direct contract reads + poll + optimistic. wagmi `useReadContract` ~5s interval + on window focus + optimistic own-follow before confirmation.
- D-08: Activity feed via subgraph events, polled. Reuses Phase 1 D-24 800ms-race + polled-events fallback; refetched on ~5s cadence.
- D-09: OG cache-bust on status change + throttled activity. `og:image?v={statusVersion}` bumps ALWAYS on status transitions; throttled bump on follow/fade activity (~once per few minutes).

**Slippage + exit UX**
- D-10: SlippageExceeded → refresh + explicit retry. No silent auto-retry. `minSharesOut` = expected + 1% per SOCIAL-06.
- D-11: Exit-modal friction proportional to consequence. Caller exit = type-to-confirm. Position exit = single confirm button.
- D-12: Caller-exit modal surfaces decay context: "Exit now: X% penalty · drops toward 15% as expiry nears."

**Notifications**
- D-13: Full in-app notification center (polled, no push). `notifications` table in Fly Postgres; relayer worker watches `CallerExited` events; resolves followers/faders via subgraph; writes one row per affected user.
- D-14: Generic, reusable notifications schema. `event_type` column (`caller_exited` now; extensible for Phase 3/4).

**Quote-calls**
- D-15: Quote-call FADING/FOLLOWING = explicit stance picked at quote time. Stored off-chain (relayer DB / subgraph) keyed to on-chain `CallQuoted` relationship.

### Claude's Discretion
- Pool / share-balance storage shape (nested mappings keyed by `callId` per §11.2), AMM rounding/precision, share decimals.
- Exact shape of the caller-exit rep-slash decay (linear vs curved between -45 and -10).
- Notification inbox UI placement, polling interval specifics, unread-count semantics.
- Subgraph schema extension details for FollowFadeMarket events.
- Relayer endpoint shapes for the live-state proxy and notification fan-out worker.

### Deferred Ideas (OUT OF SCOPE)
- ChallengeEscrow TVL into the aggregate + full 3-contract boundary fuzz → Phase 6.
- Trending Duel auto-promotion, Duel King badge, Duels tab → Phase 3.
- `claimPayout` end-to-end (requires settlement) → Phase 4.
- Settled-state Receipt rendering + Settled/CallerExited OG variants → Phase 4 / Phase 7.
- Model B creator-fee application at settlement → Phase 4.
- Push / email notifications + real-time SSE/WebSocket → v1.1.
- "From your X / Farcaster" feed sections + VERIFIED badges → Phase 1.5.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SOCIAL-01 | Follow any live call via AMM, receive FOLLOW shares | AMM math §8.1; §Standard Stack / Pattern 1 |
| SOCIAL-02 | Fade any live call via AMM, receive FADE shares | Same |
| SOCIAL-03 | Min $1 USDC per position, revert `PositionBelowMinimum` | Constant + gate in `follow`/`fade` |
| SOCIAL-04 | Max $100 USDC cumulative per user per call, revert `PositionAboveMaximum` | Cumulative check in `positionSize[callId][user]` |
| SOCIAL-05 | `minSharesOut` slippage param; revert `SlippageExceeded` | Slippage math §Don't Hand-Roll + §Common Pitfalls |
| SOCIAL-06 | Frontend computes expected + 1% tolerance as `minSharesOut` | Slippage computation pattern §Code Examples |
| SOCIAL-07 | Post-expiry gate — revert `CallPastExpiry` when `block.timestamp >= call.expiry` | Strict `<` comparison per Pitfall 10 |
| SOCIAL-08 | `follow`/`fade` accept Live OR CallerExited status | Status gate in function guards |
| SOCIAL-09 | TVL cap aggregated across CallRegistry + FollowFadeMarket | D-03; getTvl() canonical view §Architecture Patterns |
| SOCIAL-10 | `positionEntryTime[callId][user][side] = block.timestamp`, reset on additive deposit | Storage shape §Architecture Patterns |
| SOCIAL-11 | AMM penalty injection: slashed USDC → receiving pool reserve, no phantom shares | §Penalty Injection Pattern |
| SOCIAL-12 | 4h cooldown on exitPosition; revert `ExitCooldownActive(unlocksAt)` | Constant + timestamp check |
| SOCIAL-13 | Follower/fader exit: 10% slash, 90% returned | Flat-rate slash + CEI pattern |
| SOCIAL-14 | 10% slash splits 50/40/10 (opposite/same/treasury) | Split formula §Common Pitfalls §Code Examples |
| SOCIAL-15 | `exitPosition` works while paused (carve-out) | Pause carve-out via modifier exemption |
| SOCIAL-16 | `exitPosition` on settled call → revert `CallNotLive` | Status gate |
| SOCIAL-17 | Caller cannot exit during first 24h; revert `CallerExitLocked(unlocksAt)` | Constant + timestamp check |
| SOCIAL-18 | Caller exit penalty: `15% + (35% × time_remaining_ratio)`, floor 15% | §Caller Exit Math |
| SOCIAL-19 | Caller exit slash: 50/40/10 (follow/fade/treasury) | §Code Examples |
| SOCIAL-20 | Snapshot `callerVolumeAtExit = followPool + fadePool` | Storage field + snapshotting at exit |
| SOCIAL-21 | `call.status = CallerExited` single source of truth; `callerExitedAt = now` | D-02 markCallerExited + status write |
| SOCIAL-22 | `CallerExited(callId, caller, timeElapsed, penaltyPaid, stakeReturned, reputationDelta)` event | Event shape §Code Examples |
| SOCIAL-23 | Public broadcast entry in global feed | Off-chain relayer writes global broadcast row |
| SOCIAL-24 | Notification to every current follower/fader on caller exit | D-13 notification worker + fan-out via subgraph |
| SOCIAL-25 | Permanent "CALLER EXITED" amber banner from exit onward | Frontend reads `call.status == CallerExited` |
| SOCIAL-26 | Rep slash via ProfileRegistry; applied immediately in same tx | D-05 `applyRepDelta` in caller-exit tx |
| SOCIAL-27 | Exited callers receive NO rep delta at settlement | Phase 4 settlement skips; tracked via `callerExitedAt != 0` |
| SOCIAL-28 | No separate "cancel" mechanic | Only callerExit + normal settlement |
| SOCIAL-43 | Quote-call stored with `parent_call_id` reference | On-chain `CallQuoted` event; off-chain stance (D-15) |
| SOCIAL-44 | Live activity feed (left column): follows/fades with real-time entries | D-08 subgraph events + 5s poll |
| SOCIAL-45 | Quote-calls right column with FADING/FOLLOWING tag | D-15 off-chain stance + subgraph query |
| UI-06 | Live Receipt page (`/call/[id]`) full layout | §Live Receipt architecture pattern |
| UI-07 | Sticky caller header, 4-stat row, positioning bar, 3 action buttons, exit links | §Live Receipt component map |
| SHARE-04 | Live-state OG card variant 1 at `/og/[callId]` | §OG Card variant 1 pattern |
</phase_requirements>

---

## Summary

Phase 2 is the financial mechanics phase. It ships the `FollowFadeMarket` contract — a single Solidity contract that holds all follow/fade pool reserves for every active call via nested per-`callId` sub-state — plus redeployed `CallRegistry` and `ProfileRegistry` contracts that wire in the single-custodian model and authorized-rep-writer surface, respectively. The Live Receipt page at `/call/[id]` binds directly to on-chain reads (wagmi `useReadContract`, ~5s poll) and subgraph event history; the two columns (activity feed + quote-calls) + the market positioning bar + the exit modals complete the social prediction experience. An in-app notification center backed by Fly Postgres serves caller-exit notifications; the `notifications` table schema is intentionally generic so Phase 3/4 can extend it without migration.

The **hardest implementation decisions** are in the AMM math (correct cold-start share bootstrapping, slippage protection, penalty injection that grows `k` without phantom shares) and the TVL aggregation strategy (the canonical `getTvl()` view that FollowFadeMarket exports, read by itself AND by the redeployed CallRegistry for the D-03 cap check). These are not ambiguous in the spec but are easy to implement incorrectly at the boundary conditions. Foundry property-based fuzz tests on the k-invariant, the penalty-injection semantics, and the empty-pool LP-fee path are first-class CI gates — not optional.

The redeployed contracts must be Phase-4-ready: `setSettlementManager` and `markSettled` on CallRegistry, `authorizedRepWriters` on ProfileRegistry. SettlementManager then becomes a pure plug-in in Phase 4 with no third redeploy.

**Primary recommendation:** Build FollowFadeMarket as a single contract with all pool sub-state keyed by `callId` in nested mappings; export a canonical `getTvl()` view; implement AMM math with a fixed 18-decimal internal share precision (USDC is 6-decimal, shares are 18-decimal so dust is contained); use strict CEI + ReentrancyGuard on every USDC path; wire Foundry invariant fuzz (AMM k + penalty injection + interference + empty-pool) as CI gates from day one.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| AMM share pricing / minting | Contract (FollowFadeMarket) | — | Money movement; must be deterministic on-chain |
| TVL cap enforcement | Contract (FollowFadeMarket, CallRegistry) | — | Capital safety; cannot be off-chain |
| Slippage gate (`minSharesOut`) | Contract (FollowFadeMarket) | Frontend (pre-compute) | Revert must be on-chain; frontend only pre-computes for UX |
| Caller-exit penalty math | Contract (FollowFadeMarket) | Frontend (display) | Computed on-chain at exit time; frontend reads for modal display |
| Rep slash at caller exit | Contract (FollowFadeMarket → ProfileRegistry) | — | Same tx; applyRepDelta must be atomic with the exit |
| Live pool state (follow%, share price) | Frontend (wagmi direct reads) | — | ~5s freshness from RPC; subgraph lag unacceptable for positioning bar |
| Activity feed (who followed/faded) | Relayer → Subgraph | Polled-events fallback | Append-only history; indexer sufficient; Phase 1 D-24 pattern reused |
| Notification fan-out | Relayer (BullMQ worker) | Fly Postgres | Off-chain; no on-chain loops; resolves followers via subgraph |
| Notification inbox | Frontend (polled HTTP) | Fly Postgres | No push in Phase 2; poll interval ~30s acceptable |
| OG card variant 1 render | Relayer / Vercel OG (Node runtime) | CDN cache | Satori rendering; flexbox-only; Node runtime per CLAUDE.md |
| Quote-call stance (FADING/FOLLOWING) | Relayer DB + Subgraph | — | Off-chain annotation; keyed to on-chain `CallQuoted` event |
| Call status (Live/CallerExited) | Contract (CallRegistry, single source) | — | Single source of truth per D-02/SOCIAL-21 |
| Contract address routing after redeploy | packages/shared addresses.ts | — | Single source; CI grep guards; subgraph.yaml + frontend must be updated |

---

## Standard Stack

### Core (unchanged from Phase 1)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Solidity compiler | `=0.8.30` | FollowFadeMarket, redeployed CallRegistry/ProfileRegistry | CLAUDE.md pin; avoids 0.8.28–0.8.33 IR bug; CI grep guard enforced |
| @openzeppelin/contracts | `5.6.1` | ReentrancyGuard, Ownable2Step, Pausable, SafeERC20, IERC20 | Phase 1 already installed; same lib; v5 post-2023 modernized line |
| Foundry | nightly (v1.x, May 2026) | AMM fuzz tests, invariant tests, deploy scripts | Phase 1 already wired; `[profile.ci] fuzz.runs = 1000` |
| wagmi | `2.18.0` | `useReadContract` for live pool state | Phase 1 already installed |
| viem | `2.50.4` | ABI encoding, `getLogs` fallback | Phase 1 already installed |
| @tanstack/react-query | `5.100.11` | Caching for contract reads | Phase 1 peer dep |
| @graphprotocol/graph-cli | `0.98.1` | Subgraph extension + redeploy | Phase 1 already installed |
| @graphprotocol/graph-ts | `0.38.2` | AssemblyScript helpers | Phase 1 peer dep |
| fastify | `5.6.1` | Relayer new endpoints (notification fan-out worker, live-state proxy) | Phase 1 already installed |
| bullmq | latest | Notification fan-out job queue | Phase 0 already installed |
| pino | `9.x` | Structured logging | Phase 0 already installed |
| @vercel/og | `0.11.1` | OG card variant 1 rendering (Node runtime) | Phase 0 OG fallback already installed |

### Supporting (new in Phase 2)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| drizzle-orm | (Phase 1 already installed) | `notifications` table DDL + typed queries | Adding `notifications` table to Fly Postgres |
| pg (postgres driver) | (Phase 1 already installed) | Fly Postgres connection for notification writes | Notification fan-out worker |

No new npm dependencies are required for Phase 2. All toolchain dependencies already ship in the Phase 1 monorepo.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Fixed 18-decimal share precision | 6-decimal (USDC precision) | 6-decimal causes dust loss on first share mint; 18-decimal is standard AMM practice |
| Direct `USDC.balanceOf(this)` for getTvl | Manual counter variable | `balanceOf` is always accurate (no drift); counter drifts on fee injections unless meticulously maintained |
| Linear rep-slash decay | Exponential/stepped decay | Spec says "decay curve -45 day 1 → -10 floor" without specifying shape; linear is correct and most auditable |

---

## AMM Math — Critical Formulas

This section is the most load-bearing research output. All formulas are derived from spec §8.1, §8.2, §8.7.1, §8.7.2, §11.2, §12.2.

[CITED: CALL_IT_SPEC1.md §8.1, §8.2, §8.7.1, §8.7.2, §11.2, §12.2]

### Share Precision Decision
USDC is 6 decimals. Shares must be 18 decimals internally to avoid catastrophic rounding on small pool sizes. Store reserves as 6-decimal USDC amounts; store share balances and `totalShares` as 18-decimal integers.

```solidity
// Precision constants
uint256 constant SHARE_PRECISION = 1e18; // shares stored at 18 decimals
// USDC at 6 decimals — amounts in usdc are uint96/uint256 with 6-decimal values
```

### Pattern 1: Pool Bootstrap (Cold-Start)

The first `follow` (or `fade`) on a call must handle `totalShares == 0` gracefully.

**Phase 2 pool initial state at `createCall` (after D-01 stake forward):**
- `followPool.reserve = stake` (caller's USDC, e.g. $50 = 50_000_000)
- `fadePool.reserve = virtualFadeSeed` (= $7 accounting-only, never transferred; set as `fadeSeedVirtual` flag)
- `followPool.totalShares = stake * SHARE_PRECISION / INITIAL_SHARE_PRICE`
- Recommended `INITIAL_SHARE_PRICE = 1e12` (= $0.000001 per share at 18-decimal; gives clean bootstrap math)

Bootstrap shares for caller:
```solidity
// At createCall, bootstrap the follow-side for the caller
uint256 callerShares = (uint256(stake) * SHARE_PRECISION) / INITIAL_SHARE_PRICE;
followShares[callId][caller] = callerShares;
followTotalShares[callId] = callerShares;
followReserve[callId] = stake; // real USDC
fadeSeedVirtual[callId] = virtualFadeSeed; // accounting-only, no real USDC transferred
fadeReserve[callId] = virtualFadeSeed; // virtual; marks k
fadeTotalShares[callId] = (uint256(virtualFadeSeed) * SHARE_PRECISION) / INITIAL_SHARE_PRICE;
// k is followReserve * fadeReserve at init
```

**IMPORTANT:** The $7 virtual fade seed is **never transferred to FollowFadeMarket**. It is an accounting fiction to prevent zero-denominator AMM math. `USDC.balanceOf(FollowFadeMarket)` for a brand-new call contains only the caller's stake. The `getTvl()` view must use only **real** USDC balances.

### Pattern 2: Follow/Fade Share Minting (AMM Formula)

For a deposit of `amountIn` USDC into the follow pool:

```
// Standard constant-product: followReserve × fadeReserve = k
// Adding amountIn to followReserve gives new_follow = followReserve + amountIn
// Shares minted proportional to new reserve contribution:
//   sharesOut = totalShares × (amountIn / (reserve + amountIn))
//   sharesOut = totalShares × amountIn / (reserve + amountIn)   [integer math]
```

In Solidity (avoiding overflow with mulDiv pattern):
```solidity
// Source: spec §8.1, §12.2 step 3
function _mintShares(
    uint256 amountIn,
    uint256 reserve,       // current pool reserve (USDC, 6 dec)
    uint256 totalShares    // current total shares (18 dec)
) internal pure returns (uint256 sharesOut) {
    // sharesOut = totalShares * amountIn / (reserve + amountIn)
    // Use MulDiv from OZ to avoid uint256 overflow
    sharesOut = Math.mulDiv(totalShares, amountIn, reserve + amountIn);
    require(sharesOut > 0, "ZERO_SHARES");
}
```

**Note on cold-start when `totalShares == 0`:** This only applies to the very first depositor on a side AFTER the virtual seed is wiped (e.g., first real fader). If `totalShares > 0` (because virtual seed was used to initialize), the formula works. The virtual seed initializes `fadeTotalShares` at pool creation so the formula never sees `totalShares == 0` for a real deposit.

**Slippage protection:**
```solidity
// SOCIAL-05, SOCIAL-06
if (sharesOut < minSharesOut) revert SlippageExceeded(minSharesOut, sharesOut);
```

### Pattern 3: Frontend `minSharesOut` Computation

The frontend reads fresh reserves, computes expected shares, applies 1% tolerance:

```typescript
// Source: spec §12.2, SOCIAL-06
async function computeMinSharesOut(
  callId: bigint,
  amountIn: bigint,    // USDC, 6-decimal
  side: 'follow' | 'fade'
): Promise<bigint> {
  const [reserve, totalShares] = await Promise.all([
    readContract({ address: FFM, abi, functionName: side === 'follow' ? 'followReserve' : 'fadeReserve', args: [callId] }),
    readContract({ address: FFM, abi, functionName: side === 'follow' ? 'followTotalShares' : 'fadeTotalShares', args: [callId] }),
  ]);
  // sharesExpected = totalShares * amountIn / (reserve + amountIn)
  const sharesExpected = (totalShares * amountIn) / (reserve + amountIn);
  // minSharesOut = sharesExpected * 99 / 100 (1% tolerance)
  return (sharesExpected * 99n) / 100n;
}
```

Both values must be read in a single `eth_call` block or via `multicall3` to avoid stale-reserve race. Wagmi `useReadContracts` batches them.

### Pattern 4: Penalty Injection Semantics (SOCIAL-11, §11.2)

**CRITICAL: No phantom shares minted. Pool reserve grows; `k` increases. Existing shares appreciate pro-rata.**

When a position exit slashes 10% (`amountSlashed`):
- 50% of slash → opposite pool reserve: `opposite.reserve += amountSlashed * 50 / 100`
- 40% of slash → same-side pool reserve: `same.reserve += amountSlashed * 40 / 100`
- 10% → treasury: `safeTransfer(treasury, amountSlashed * 10 / 100)`

```solidity
// Source: spec §8.7.1, §11.2, §12.2 step 7
// SAFETY: apply penalty injection BEFORE transferring back to user (CEI)
uint256 slash = (positionUsdcValue * POSITION_EXIT_PENALTY_PCT) / 100;
uint256 userReceives = positionUsdcValue - slash;

uint256 toOpposite = (slash * 50) / 100;
uint256 toSameSide = (slash * 40) / 100;
uint256 toTreasury = slash - toOpposite - toSameSide; // avoids rounding dust

// Inject into reserves (NO new shares, k grows)
// EFFECTS before INTERACTIONS
if (side == Side.Follow) {
    fadeReserve[callId] += toOpposite;    // follow exits → inject into fade
    followReserve[callId] += toSameSide;  // 40% to same-side
} else {
    followReserve[callId] += toOpposite;  // fade exits → inject into follow
    fadeReserve[callId] += toSameSide;
}
// INTERACTIONS: transfer user's 90% and treasury 10%
IERC20(USDC_ARB_NATIVE).safeTransfer(msg.sender, userReceives);
IERC20(USDC_ARB_NATIVE).safeTransfer(treasury, toTreasury);
```

**Note on virtual fade seed and penalty injection:** Virtual fade reserve (`fadeSeedVirtual`) counts in the AMM accounting but NOT in real USDC balance. When penalty injects into the fade reserve where only virtual liquidity exists, that USDC is real and increases the real fade reserve — this is safe and correct behavior; existing virtual shareholders appreciate but cannot claim real USDC beyond what was actually deposited (virtual shares dissolve at settlement per §8.2).

### Pattern 5: Caller-Exit Penalty Math (SOCIAL-18)

**Formula:** `penalty = 15% + (35% × time_remaining_ratio)` with floor 15%

```
time_remaining_ratio = (call.expiry - block.timestamp) / (call.expiry - call.createdAt)
```

If `block.timestamp >= call.expiry` (expired but unsettled), `time_remaining_ratio = 0`, so `penalty = 15%`.
If `block.timestamp = call.createdAt + 24h` (earliest possible exit), ratio is close to 1.0, penalty ≈ 50%.

```solidity
// Source: spec §8.7.2, §12.1, SOCIAL-18
// Caller can only exit after CALLER_EXIT_LOCK_DURATION (24h)
uint64 constant CALLER_EXIT_LOCK_DURATION = 24 hours;
uint256 constant CALLER_EXIT_BASE_PCT = 15;        // 15% floor
uint256 constant CALLER_EXIT_VARIABLE_PCT = 35;    // 35% variable

function _callerExitPenaltyPct(uint256 callId) internal view returns (uint256 penaltyPct) {
    uint64 expiry = callRegistry.getCall(callId).expiry;
    uint64 createdAt = callRegistry.getCall(callId).createdAt;
    
    if (block.timestamp >= expiry) {
        return CALLER_EXIT_BASE_PCT; // floor, call already expired
    }
    
    uint256 totalDuration = expiry - createdAt;
    uint256 remaining = expiry - block.timestamp;
    
    // penalty = 15 + 35 * remaining / totalDuration
    // Integer safe: multiply first to preserve precision
    uint256 variable = (CALLER_EXIT_VARIABLE_PCT * remaining) / totalDuration;
    penaltyPct = CALLER_EXIT_BASE_PCT + variable;
    // penaltyPct is in range [15, 50] — no need to clamp further
}
```

Caller-exit slash split: 50% follow pool / 40% fade pool / 10% treasury (same injection semantics as position exit, different split per SOCIAL-19).

### Pattern 6: Caller-Exit Rep Slash (SOCIAL-26, D-05)

**Decay curve:** `-45 rep day 1 → -10 rep floor` (spec §8.7.3)

This is a parallel but distinct calculation from the exit penalty %. The rep delta applies immediately in the caller-exit tx.

**Recommended shape: linear decay over call lifetime.**

```
time_elapsed_ratio = (block.timestamp - call.createdAt) / (call.expiry - call.createdAt)
delta = -45 + (35 × time_elapsed_ratio)    // from -45 toward -10 as time passes
delta = max(delta, -10)                     // floor at -10 per spec
delta = min(delta, -10)                     // can't be less negative than -10 — wait
// Correct: at day 1 (ratio=0), delta=-45; at expiry (ratio=1), delta=-10
// delta = -45 + 35 * elapsed_ratio => range [-45, -10], floor -10 applied as:
delta = max(delta, -45) // can only be more negative toward -45
// Actually: more time elapsed = less severe penalty
// delta = -(45 - 35 * elapsed_ratio) = -(45 - 35 * elapsed_ratio)
// At elapsed_ratio=0 (exit at 24h): delta = -45
// At elapsed_ratio=1 (exit at expiry): delta = -10
// -45 + 35 * elapsed_ratio where elapsed_ratio ∈ [0, 1]
```

```solidity
// Source: spec §8.7.3, SOCIAL-26, D-05
// Called from callerExit(); result passed to profileRegistry.applyRepDelta(caller, delta)
function _callerExitRepDelta(uint256 callId) internal view returns (int256 delta) {
    uint64 createdAt = callRegistry.getCall(callId).createdAt;
    uint64 expiry    = callRegistry.getCall(callId).expiry;
    uint256 elapsed  = block.timestamp - createdAt;
    uint256 duration = expiry - createdAt;
    
    // Scale: -45 at elapsed=0 to -10 at elapsed=duration
    // delta = -(45 - 35 * elapsed / duration)
    // To keep integer precision: (45 * duration - 35 * elapsed) / duration
    uint256 numerator = 45 * duration - 35 * elapsed;
    uint256 absDelta  = numerator / duration;  // range [10, 45] USDC-aligned uint
    // Floor at 10 (handles rounding if elapsed slightly > duration):
    if (absDelta < 10) absDelta = 10;
    delta = -int256(absDelta);
}
```

`applyRepDelta` on ProfileRegistry (new function required by D-04/D-05) must clamp `globalRep` floor to 0 (REP-02).

### Pattern 7: TVL Aggregation (D-03, SOCIAL-09, Pitfall 3)

**Canonical `getTvl()` on FollowFadeMarket:**

```solidity
/// @notice Returns the total real USDC held across all per-call pools.
/// @dev Uses USDC.balanceOf(address(this)) for accuracy.
///      Virtual fade seed is never transferred — not counted in real TVL.
///      Treasury address is a SEPARATE wallet address — never address(this).
function getTvl() external view returns (uint256) {
    return IERC20(USDC_ARB_NATIVE).balanceOf(address(this));
}
```

**TVL cap check in `follow`/`fade`:**
```solidity
uint256 combinedTvl = callRegistry.currentTvl() + this.getTvl();
if (combinedTvl + amountIn > tvlCap) revert TvlCapReached(amountIn, tvlCap - combinedTvl);
```

**IMPORTANT:** `treasury` must NEVER be `address(this)` or `address(callRegistry)`. It must be a separate EOA or Safe wallet. Otherwise penalty-injection outflows don't reduce the TVL count, and the cap is under-enforced.

`callRegistry.currentTvl()` tracks only the caller stakes forwarded to FollowFadeMarket at call creation (these are the only USDC ever held by CallRegistry transiently — for one block during `createCall`, then forwarded). After the redeploy, CallRegistry holds $0 USDC permanently; `currentTvl` tracks the running total of forwarded stakes for cap math, NOT `USDC.balanceOf(callRegistry)`.

**Revised CallRegistry TVL accounting after D-01 stake-forward:**
- `createCall` calls `followFadeMarket.initPool(callId, stake, virtualFadeSeed)` via `safeTransferFrom` + `safeTransfer(followFadeMarket, stake)`.
- CallRegistry increments `currentTvl += stake` as a counter (NOT a balance — it just tracks what was sent for cap math).
- `currentTvl` is read by FollowFadeMarket for the combined cap check.
- `callRegistry.currentTvl` never reflects the $10 creation fee (which goes $5 to treasury + $5 virtual — neither held in CallRegistry after the tx).

### Pattern 8: Per-Call Sub-State Storage Shape

[CITED: CALL_IT_SPEC1.md §11.2]

```solidity
// Per-callId pool state (keyed by callId — single contract per §11.2)
mapping(uint256 => uint256) public followReserve;      // real USDC (6 dec)
mapping(uint256 => uint256) public fadeReserve;        // real + virtual USDC (6 dec)
mapping(uint256 => bool)    public fadeSeedVirtual;    // true while virtual seed is still "in" fade pool
mapping(uint256 => uint256) public followTotalShares;  // 18-dec share units
mapping(uint256 => uint256) public fadeTotalShares;    // 18-dec share units
mapping(uint256 => uint256) public callerVolumeAtExit; // snapshot for Model B (SOCIAL-20)
mapping(uint256 => uint64)  public callerExitedAt;     // 0 until callerExit

// Per-callId per-user per-side position state
mapping(uint256 => mapping(address => uint256)) public followShares;   // user's follow shares (18 dec)
mapping(uint256 => mapping(address => uint256)) public fadeShares;     // user's fade shares (18 dec)
mapping(uint256 => mapping(address => uint256)) public followPosition; // cumulative USDC deposited (6 dec) for MAX_POSITION cap
mapping(uint256 => mapping(address => uint256)) public fadePosition;   // cumulative USDC deposited (6 dec)
mapping(uint256 => mapping(address => uint64))  public followEntryTime; // SOCIAL-10
mapping(uint256 => mapping(address => uint64))  public fadeEntryTime;   // SOCIAL-10
mapping(uint256 => mapping(address => bool))    public claimed;         // claimPayout idempotency (SOCIAL-46)
```

This is flat per-callId storage — no structs in mappings to keep AssemblyScript subgraph mapping straightforward.

---

## Architecture Patterns

### System Architecture Diagram (Phase 2)

```
User wallet
    │
    │  createCall (USDC stake + $10 fee)
    ▼
CallRegistry (redeployed)
    │ safeTransfer(followFadeMarket, stake)  [D-01 single custodian]
    │ initPool(callId, stake, virtualSeed)
    ▼
FollowFadeMarket ←─── ALL real USDC lives here ───►  Treasury wallet
    │  follow(callId, amountIn, minSharesOut)              ▲ 10% slash outflows
    │  fade(callId, amountIn, minSharesOut)                │
    │  exitPosition(callId, side)                          │
    │  callerExit(callId)                                  │
    │    └── applyRepDelta(caller, delta) ─────► ProfileRegistry (redeployed)
    │    └── markCallerExited(callId) ──────────► CallRegistry.call.status = CallerExited
    │
    │  emit Followed / Faded / PositionExited / CallerExited
    ▼
The Graph Subgraph (extended, redeployed to Sepolia Studio)
    │  Followed / Faded / CallerExited / PositionExited events indexed
    ▼
Relayer (apps/relayer)
    ├── GET /api/calls/:id/live-state  (proxies wagmi reads for SSR)
    ├── POST /api/follow-fade-market/quote-stance  (stores D-15 stance)
    └── Worker: notification-fanout
             watches CallerExited events from subgraph
             resolves current followers/faders via subgraph query
             INSERT INTO notifications (user_address, event_type, payload, call_id)
    
Frontend (apps/web)
    /call/[id]  ←── useReadContract (followReserve, fadeReserve, totalShares, userShares) @ 5s
                ←── /api/feed (subgraph activity @ 5s)
                ←── GET /api/notifications?user=X (polled @ 30s)
    /og/[callId] ── @vercel/og Node runtime, flexbox-only, ?v={statusVersion}
```

### Recommended Project Structure Additions

```
packages/contracts/src/
├── FollowFadeMarket.sol         # New: single-contract AMM
├── interfaces/
│   └── IFollowFadeMarket.sol    # New: §12.2 interface
├── CallRegistry.sol             # REDEPLOYED with D-01/D-02 authorization surface
└── ProfileRegistry.sol          # REDEPLOYED with D-04 authorizedRepWriters

packages/contracts/script/
└── DeployPhase2.s.sol           # Deploys FFM, redeployed CR/PR, wires setters

packages/contracts/test/
├── FollowFadeMarket.t.sol       # Unit tests: follow/fade/exit gates
├── FollowFadeMarketGates.t.sol  # Property fuzz: k-invariant, penalty injection
├── FollowFadeMarketInterference.t.sol  # Multi-call interference (Pitfall 9)
└── TvlAggregation.t.sol         # TVL cap across CR + FFM

apps/relayer/src/
├── routes/
│   ├── live-state.ts            # New: proxies live pool reads
│   └── quote-stance.ts          # New: stores D-15 stance
└── workers/
    └── notification-fanout.ts   # New: CallerExited → per-user notifications

apps/web/app/
└── call/[id]/
    └── page.tsx                 # Live Receipt page (D-07/D-08)

apps/web/app/og/
└── [callId]/
    └── route.ts                 # OG variant 1 (Node runtime)

packages/shared/src/constants/
└── addresses.ts                 # Add FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA entry

packages/subgraph/
├── subgraph.yaml                # Update FFM address + startBlock
├── abis/FollowFadeMarket.json   # New ABI
└── src/follow-fade-market.ts    # Extend event handlers
```

### Anti-Patterns to Avoid

- **Storing TVL as a hand-maintained counter in FollowFadeMarket:** Use `USDC.balanceOf(address(this))` — never drift from reality on fee injection.
- **Treasury as `address(this)` or a sub-key of FollowFadeMarket:** Treasury USDC outflows must leave the contract entirely for TVL accounting to be correct.
- **Minting shares on penalty injection (Pitfall 9 §11.2 violation):** Inject USDC into reserve, zero shares. `k` grows. Existing shares appreciate. Period.
- **`block.timestamp <= call.expiry` in the follow/fade gate (Pitfall 10):** Must be strict `<` (not `<=`). At exact expiry second, deposits are closed.
- **Resetting `positionEntryTime` to 0 on `claimPayout`:** The entry time is a one-way set. Do NOT clear it. (Pitfall 9c — cross-call aliasing bug.) Only set it on first deposit or reset on additive deposit; never clear.
- **Using `totalShares` division when all shares are virtual (Pitfall 22):** If `realWinningShares == 0`, LP fee routes to treasury, not a divide-by-zero.
- **`display: grid` in OG card templates (Pitfall 15):** Satori is flexbox-only; grid silently misrenders.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Overflow-safe `mulDiv` | Custom integer scaling | `@openzeppelin/contracts` `Math.mulDiv` | OZ v5.6.1 already installed; handles 256-bit overflow correctly |
| USDC safe transfers | Manual IERC20 calls | `SafeERC20.safeTransfer` + `safeTransferFrom` | Already in Phase 1; handles non-standard ERC20 return values |
| Reentrancy protection | Manual lock booleans | `ReentrancyGuard` from OZ | Already in Phase 1; audited, correct, standard |
| Pause + carve-out | Custom pause logic | `Pausable` from OZ + `whenNotPaused` modifier exemption for exit/claim | Phase 1 pattern; carve-out = simply don't apply `whenNotPaused` to `exitPosition`/`claimPayout` |
| OG image rendering | Canvas/sharp | `@vercel/og` + satori (already Phase 0 skeleton) | Already installed; Node runtime; flexbox-only rule already documented |
| Job queue for notification fan-out | Cron in fastify | `bullmq` + Redis | Already Phase 0 installed; handles retry, concurrency, delayed jobs |
| Notification storage | In-memory Map | Fly Postgres `notifications` table via drizzle-orm | Already Phase 1 database; persistent, queryable |
| Frontend AMM preview math | Custom Solidity re-implementation in TS | Pure TypeScript bigint math mirroring the contract formula | Must match exactly; no library needed; bigint arithmetic is sufficient |

**Key insight:** The AMM math for this product (constant-product single-formula) is simple enough to implement from scratch in ~50 lines of Solidity. The risk is NOT the math itself — it's the boundary conditions (cold-start, virtual seed, penalty injection, empty pool). Foundry fuzz at 1000 runs per `[profile.ci]` is the defense; not library selection.

---

## Redeploy Mechanics (D-01/D-02/D-04)

### What Changes in Redeployed CallRegistry

**New state:**
```solidity
address public followFadeMarket;  // settable by owner (setFollowFadeMarket)
// settlementManager already exists in Phase 1
```

**Modified `createCall` (D-01 stake forward):**
```solidity
// After Gate 6.2 duplicate check and TVL cap check (gates remain identical):
// EFFECTS first (CEI)
callId = _calls.length;
// ... all the same state writes as Phase 1 ...
// NEW: forward stake to FollowFadeMarket
IERC20(USDC_ARB_NATIVE).safeTransferFrom(msg.sender, address(this), stake + CREATION_FEE);
IERC20(USDC_ARB_NATIVE).safeTransfer(treasury, TREASURY_PORTION);  // $5 treasury
// $5 virtual portion stays in accounting (virtualFadeSeed = BASE_VIRTUAL_FADE + VIRTUAL_FADE_PORTION = $7)
// Forward caller stake to FollowFadeMarket
IERC20(USDC_ARB_NATIVE).safeTransfer(followFadeMarket, stake);
IFollowFadeMarket(followFadeMarket).initPool(callId, stake, virtualFadeSeed);
```

**New guarded status transitions (D-02):**
```solidity
/// @notice Called by FollowFadeMarket to mark a call as CallerExited. D-02.
function markCallerExited(uint256 callId) external {
    if (msg.sender != followFadeMarket) revert NotAuthorized();
    _calls[callId].status = CallStatus.CallerExited;
    _calls[callId].callerExitedAt = uint64(block.timestamp);
}

/// @notice Called by SettlementManager to mark a call as Settled. D-02.
function markSettled(uint256 callId, Outcome outcome) external {
    if (msg.sender != settlementManager) revert NotSettlementManager();
    _calls[callId].status = CallStatus.Settled;
    _calls[callId].outcome = outcome;
}
```

**`computeCallerExitPenalty(callId)` stub becomes real:**
```solidity
function computeCallerExitPenalty(uint256 callId) external view returns (uint256 penaltyPct) {
    // Reads call.createdAt and call.expiry; computes the current penalty percentage
    // Returns the penalty pct (e.g., 32 for 32%)
    return _callerExitPenaltyPct(callId);  // same formula as FollowFadeMarket uses internally
}
```

### What Changes in Redeployed ProfileRegistry

**New state (D-04):**
```solidity
mapping(address => bool) public authorizedRepWriters;
// replaces the single settlementManager address for rep writes
// FollowFadeMarket authorized at deploy; SettlementManager authorized in Phase 4
```

**New function (D-05):**
```solidity
function applyRepDelta(address user, int256 delta) external {
    if (!authorizedRepWriters[msg.sender]) revert NotAuthorizedWriter();
    _initIfNeeded(user);
    int256 current = int256(uint256(_profiles[user].globalRep));
    int256 newRep = current + delta;
    _profiles[user].globalRep = uint128(newRep < 0 ? 0 : uint256(newRep)); // REP-02: floor 0
    emit RepDeltaApplied(user, delta, _profiles[user].globalRep);
}

function setAuthorizedRepWriter(address writer, bool authorized) external onlyOwner {
    authorizedRepWriters[writer] = authorized;
    emit RepWriterSet(writer, authorized);
}
```

**Existing `updateAfterSettlement` is retained but with the new auth check:**
```solidity
function updateAfterSettlement(address user, bool isWinner, uint8 category) external {
    if (!authorizedRepWriters[msg.sender]) revert NotAuthorizedWriter();
    // Phase 4 will implement full logic here; Phase 2 only exercises caller-exit path
}
```

### Deploy Script Shape (`DeployPhase2.s.sol`)

```solidity
// 1. Deploy new ProfileRegistry (with authorizedRepWriters)
// 2. Deploy new CallRegistry (pointing to new ProfileRegistry, with setFollowFadeMarket)
// 3. Deploy FollowFadeMarket (pointing to new CallRegistry + ProfileRegistry)
// 4. callRegistry.setFollowFadeMarket(address(followFadeMarket))
// 5. callRegistry.setTvlCap(5000e6) — re-set (new contract)
// 6. callRegistry.addAsset(...) × 25 — re-populate allowlist
// 7. callRegistry.addNFTCollection(...) × 6
// 8. profileRegistry.setAuthorizedRepWriter(address(followFadeMarket), true)
// 9. Update packages/shared/src/constants/addresses.ts
// 10. Update packages/subgraph/subgraph.yaml (all 3 addresses + startBlock)
// 11. Re-seed test data on Sepolia
```

---

## Live Receipt Architecture

### Component Map (UI-06, UI-07, §15.3)

```
/call/[id]
├── StickyCallerHeader
│   ├── handle + VERIFIED badges
│   ├── rep score
│   ├── "CALLER EXITED" amber banner (if status == CallerExited)
│   └── [Exit your call · current penalty: X%] link (caller-only, after 24h lock)
│
├── TheCallHero
│   ├── market type + asset + target
│   ├── conviction bar (ConvictionBar component from packages/ui)
│   └── VERIFIED CRITERIA badge (if criteriaHash != 0)
│
├── FourStatRow
│   ├── Current Spread (follow% / fade%) ← useReadContract ~5s
│   ├── Time Left ← client-side countdown from call.expiry
│   ├── Stake ($X USDC) ← from subgraph (static)
│   └── Conviction (N%) ← from subgraph (static)
│
├── MarketPositioningBar
│   ├── Follow % (yellow-green) | Fade % (dark)
│   └── Live reserves → followReserve / (followReserve + fadeReserve) ← useReadContract
│
├── ActionButtons (3 buttons)
│   ├── [FOLLOW] (filled accent) — opens follow modal
│   ├── [FADE] (outline dark) — opens fade modal
│   └── [CHALLENGE] (orange outline) — links to /new?challenge=callId (Phase 3)
│
├── FollowModal / FadeModal
│   ├── amount input ($1–$100, cumulative enforcement)
│   ├── expected shares display
│   ├── "Price moved — you'll now get ~X shares" (on SlippageExceeded, D-10)
│   └── [Confirm] button → useWriteContract(follow/fade)
│
├── TwoColumnContent
│   ├── ActivityFeed (left)
│   │   ├── Followed/Faded events (subgraph, 5s poll, Phase 1 D-24 pattern)
│   │   ├── CallerExited event entry
│   │   ├── avatar + handle + VERIFIED badge + amount + relative time
│   │   └── "updating" live pulse indicator
│   │
│   └── QuoteCallsColumn (right)
│       ├── CallQuoted events (subgraph) + stance from relayer
│       ├── FADING tag (orange) / FOLLOWING tag (green)
│       └── quote call card (CallCard from packages/ui)
│
├── ReasoningBlock + optional ResolutionCriteria (collapsible)
│
└── ExitPositionLink (position-holder only, after 4h cooldown)
    └── ExitPositionModal (D-11: single confirm, shows math)
```

### wagmi Hooks for Live State (D-07)

```typescript
// Read all live state in one batched call via useReadContracts
const { data } = useReadContracts({
  contracts: [
    { address: FFM_ADDR, abi: ffmAbi, functionName: 'followReserve', args: [callId] },
    { address: FFM_ADDR, abi: ffmAbi, functionName: 'fadeReserve', args: [callId] },
    { address: FFM_ADDR, abi: ffmAbi, functionName: 'followTotalShares', args: [callId] },
    { address: FFM_ADDR, abi: ffmAbi, functionName: 'fadeTotalShares', args: [callId] },
    { address: FFM_ADDR, abi: ffmAbi, functionName: 'followShares', args: [callId, userAddress] },
    { address: FFM_ADDR, abi: ffmAbi, functionName: 'fadeShares', args: [callId, userAddress] },
    { address: FFM_ADDR, abi: ffmAbi, functionName: 'followEntryTime', args: [callId, userAddress] },
    { address: FFM_ADDR, abi: ffmAbi, functionName: 'fadeEntryTime', args: [callId, userAddress] },
  ],
  query: {
    refetchInterval: 5000,        // 5s poll
    refetchOnWindowFocus: true,   // refetch on tab focus
    staleTime: 4000,
  }
});
```

Optimistic update on own follow/fade: mutate the react-query cache immediately on tx submission, revert on error. `useOptimistic` in React 19 or `queryClient.setQueryData`.

---

## OG Card Variant 1 (Live State)

[CITED: CALL_IT_SPEC1.md §16 variant 1, D-09, Pitfall 8]

### Card Layout (1200×630, flexbox-only)

```
┌──────────────────────────────────────────────────────────────────┐  corner brackets
│ [LIVE]  handle · rep                              Call It · ARB  │
│                                                                    │
│   BTC > $120,000 by June 30                                       │
│                                                                    │
│   ████████████████████░░░░░░░░░░░░   72% Following  28% Fading   │  <— progress bar
│                                                                    │
│   $50 staked   84% conviction   3d 14h left                      │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

All flexbox. No grid. Font: Syne for headers, Inter for body. Color tokens from CLAUDE.md design system.

### Route Shape (`/og/[callId]/route.ts` — Next.js App Router, Node runtime)

```typescript
// Source: @vercel/og Node runtime pattern; spec §16 variant 1; D-09
export const runtime = 'nodejs'; // CRITICAL: not 'edge'

export async function GET(req: Request, { params }: { params: { callId: string } }) {
  const { callId } = params;
  const v = new URL(req.url).searchParams.get('v') ?? '0';

  // Read live state from contract (RPC, not subgraph — for freshness)
  const [call, followReserve, fadeReserve] = await Promise.all([
    readCallFromRpc(callId),
    readFollowReserveFromRpc(callId),
    readFadeReserveFromRpc(callId),
  ]);

  const followPct = (followReserve * 100n) / (followReserve + fadeReserve);
  const timeLeft = formatTimeLeft(call.expiry);

  return new ImageResponse(
    <LiveOgCard call={call} followPct={Number(followPct)} timeLeft={timeLeft} />,
    { width: 1200, height: 630 }
  );
}
// Cache-Control: 'public, s-maxage=60, stale-while-revalidate=300'
```

**`statusVersion` bump strategy (D-09):**
- Always bump on: Live → CallerExited → Settled status transitions
- Throttled bump on: follow/fade activity (once per ~3 minutes max; prevent CDN churn)
- `statusVersion` stored in Fly Postgres `calls` table (or relayer Redis with TTL)
- Receipt page server-renders `<meta property="og:image" content="/og/{callId}?v={statusVersion}" />`

---

## Notification Center Architecture (D-13/D-14)

### Database Schema

```sql
-- Fly Postgres notifications table (drizzle-orm schema)
CREATE TABLE notifications (
  id           SERIAL PRIMARY KEY,
  user_address VARCHAR(42) NOT NULL,        -- recipient (lowercase hex)
  event_type   VARCHAR(50) NOT NULL,        -- 'caller_exited' | 'settlement_ready' | ...
  call_id      INTEGER NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}', -- event-specific data
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at      TIMESTAMPTZ,                 -- NULL = unread
  INDEX (user_address, read_at),
  INDEX (user_address, created_at DESC)
);
```

### Fan-Out Worker (BullMQ, `apps/relayer/src/workers/notification-fanout.ts`)

```typescript
// Triggered by CallerExited event indexed by subgraph
// Query subgraph for all current followers/faders of callId
// Write one notification row per affected user
// NO on-chain loops — all off-chain via subgraph query

async function fanOutCallerExitNotifications(callId: number, exitEvent: CallerExitedEvent) {
  // 1. Query subgraph for Position entities with callId and unredeemed shares
  const positions = await querySubgraph(`
    query {
      positions(where: { callId: "${callId}", exitedAt: null }) {
        user { id }
        side
        usdcValue
      }
    }
  `);

  // 2. Batch-insert notifications
  const rows = positions.map(p => ({
    userAddress: p.user.id,
    eventType: 'caller_exited',
    callId,
    payload: {
      callerHandle: exitEvent.caller,
      penaltyPaid: exitEvent.penaltyPaid.toString(),
      stakeReturned: exitEvent.stakeReturned.toString(),
      reputationDelta: exitEvent.reputationDelta.toString(),
    },
  }));
  await db.insert(notifications).values(rows);
}
```

### Frontend Inbox API Pattern

```
GET /api/notifications?user={address}&since={cursor}
→ { notifications: [...], unreadCount: N }

POST /api/notifications/mark-read
body: { ids: [1, 2, 3] }
→ { ok: true }
```

Frontend polls `/api/notifications` on a ~30s interval. Bell icon shows unread count badge. Inbox list in a slide-over panel (Radix Dialog).

---

## Subgraph Extension

### New Event Handlers Required

The FollowFadeMarket data source in `subgraph.yaml` already has a placeholder (address `0x000...`, startBlock 1). Phase 2 updates:
1. Address → new FollowFadeMarket Sepolia address
2. startBlock → deploy block
3. Remove the generic `blockHandlers` (only needed if no event handlers; add specific event handlers)

**Events to index:**
```yaml
eventHandlers:
  - event: Followed(indexed uint256,indexed address,uint256,uint256)   # callId, user, amountIn, sharesOut
    handler: handleFollowed
  - event: Faded(indexed uint256,indexed address,uint256,uint256)
    handler: handleFaded
  - event: PositionExited(indexed uint256,indexed address,uint8,uint256,uint256) # callId,user,side,usdcReturned,slashAmount
    handler: handlePositionExited
  - event: CallerExited(indexed uint256,indexed address,uint64,uint256,uint256,int256)
    handler: handleCallerExited
  - event: PoolInitialized(indexed uint256,uint256,uint256)
    handler: handlePoolInitialized
```

**Extended entities (already in schema.graphql from Phase 0):**
- `Position` — add `callId`, `user`, `side`, `usdcDeposited`, `sharesHeld`, `entryTime`, `exitedAt`
- `PositionExit` — `callId`, `user`, `side`, `usdcReturned`, `slashAmount`, `timestamp`
- `CallerExit` — already stub-present; add `penaltyPaid`, `stakeReturned`, `reputationDelta`, `callerVolumeAtExit`
- `TvlSnapshot` — updated on follow/fade/exit events

---

## Common Pitfalls

### Pitfall 1: Virtual fade seed counted in real TVL
**What goes wrong:** `getTvl()` reads `USDC.balanceOf(this)` and all is fine — UNLESS `initPool` is called with `safeTransfer(FFM, virtualSeed)`, which would deposit real USDC for accounting-only liquidity. The virtual seed must NEVER be transferred. Only stake is transferred. Virtual seed is a number stored in `fadeSeedVirtual[callId]` state.
**How to avoid:** `initPool(callId, realStake, virtualSeed)` receives `realStake` as real USDC (already transferred by `safeTransfer` in `createCall`) and `virtualSeed` as a pure accounting parameter stored in state, never touching USDC transfer.
**Warning sign:** `USDC.balanceOf(FFM)` equals `sum(stakes) + N × 7e6` instead of just `sum(stakes)`.

### Pitfall 2: `markCallerExited` callable by anyone
**What goes wrong:** If the `NotAuthorized` guard in `markCallerExited` is forgotten, anyone can flip any call to `CallerExited` status, destroying the market.
**How to avoid:** `require(msg.sender == followFadeMarket, "NotAuthorized")` hardcoded; the address is set via `setFollowFadeMarket(addr)` in the constructor equivalent (or via owner setter wired in `DeployPhase2.s.sol`).

### Pitfall 3: Penalty dust from integer division left in contract
**What goes wrong:** `slash = 1e4` (very small), `toOpposite = slash * 50 / 100 = 5000`, `toSameSide = slash * 40 / 100 = 4000`, `toTreasury = slash - toOpposite - toSameSide = 1000`. Sum is exact when using subtraction for the last split — this IS the right pattern to avoid dust.
**How to avoid:** Always compute `toTreasury = slash - toOpposite - toSameSide` (not `slash * 10 / 100`) to eliminate rounding dust.

### Pitfall 4: `positionEntryTime` reset to 0 on claim (cross-call aliasing, Pitfall 9c)
**What goes wrong:** `claimPayout(callId)` zeroes `followEntryTime[callId][user]`. User then follows a different callId. On `exitPosition(newCallId)`, the 4h cooldown check reads `followEntryTime[newCallId][user] = block.timestamp` (set at follow time) — but if somehow (storage collision) the new entry is 0, the cooldown check `if (block.timestamp < entryTime + 4h)` passes immediately (0 + 4h is in the past for any current timestamp). Entry times are set by `follow`/`fade`, cleared by nothing. `claimPayout` must NOT touch `entryTime` mappings.

### Pitfall 5: Slippage computed off stale reserves (frontend)
**What goes wrong:** Frontend reads `followReserve` and `followTotalShares` as two separate `eth_call`s at different block heights. A follow tx between the two reads means the `minSharesOut` computed from inconsistent data over-protects, causing unexpected reverts.
**How to avoid:** Use `useReadContracts` (wagmi batches these into one `eth_call` block) or `multicall3` to read both in one call.

### Pitfall 6: OG card `statusVersion` not bumped on CallerExited transition
**What goes wrong:** User shares the receipt URL after callerExit. The CDN serves the old "LIVE" OG card because `statusVersion` wasn't bumped. Twitter preview shows the old pool bar.
**How to avoid:** The notification fan-out worker that watches `CallerExited` events ALSO bumps `statusVersion` in Redis/Postgres for that `callId`. The relayer's `CallerExited` event watcher is the single place that does both (D-09).

### Pitfall 7: `callerVolumeAtExit` snapshot includes virtual fade reserves
**What goes wrong:** `callerVolumeAtExit = followPool + fadePool` where `fadePool = fadeReserve[callId]` which includes the $7 virtual seed component. This inflates the Model B creator fee baseline.
**How to avoid:** The spec says "followPool + fadePool" — use real reserves only. Exclude virtual seed from the snapshot. `callerVolumeAtExit = followReserve[callId] + (fadeReserve[callId] - fadeSeedVirtual[callId])`. Better: at point of caller exit, the virtual seed value is simply subtracted from the fade reserve snapshot.

---

## Validation Architecture

**nyquist_validation: true** — full section required.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Foundry (forge test), Vitest (packages/shared parity) |
| Config file | `packages/contracts/foundry.toml` — `[profile.ci] fuzz.runs = 1000` |
| Quick run command | `forge test --match-contract FollowFadeMarket -v` |
| Full suite command | `forge test --profile ci` |
| Parity tests | `pnpm --filter @call-it/shared test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SOCIAL-01/02 | AMM follow/fade mints correct shares | unit | `forge test --match-test testFollowSharesMinted -v` | ❌ Wave 0 |
| SOCIAL-03/04 | Min/max position enforcement | unit | `forge test --match-test testPositionBounds -v` | ❌ Wave 0 |
| SOCIAL-05/06 | SlippageExceeded fires; frontend 1% tolerance | unit + TS | `forge test --match-test testSlippage -v` | ❌ Wave 0 |
| SOCIAL-07 | Post-expiry follow reverts `CallPastExpiry` | unit | `forge test --match-test testPostExpiryGate -v` | ❌ Wave 0 |
| SOCIAL-09 | TVL cap aggregation across CR + FFM | unit | `forge test --match-test testTvlAggregation -v` | ❌ Wave 0 |
| SOCIAL-11 | Penalty injection grows k, no phantom shares | **invariant** | `forge test --match-contract FollowFadeMarketGates -v` | ❌ Wave 0 |
| SOCIAL-12/13/14 | 4h cooldown + 10% slash + 50/40/10 split | unit | `forge test --match-test testPositionExit -v` | ❌ Wave 0 |
| SOCIAL-17/18 | 24h lock + penalty decay formula | unit (fuzz over time param) | `forge test --match-test testCallerExitPenalty -v` | ❌ Wave 0 |
| SOCIAL-19 | Caller exit 50/40/10 split | unit | `forge test --match-test testCallerExitSplit -v` | ❌ Wave 0 |
| SOCIAL-21 | `call.status = CallerExited` after callerExit | unit | `forge test --match-test testCallerExitStatus -v` | ❌ Wave 0 |
| SOCIAL-26 | Rep slash applied via applyRepDelta in same tx | unit | `forge test --match-test testRepSlash -v` | ❌ Wave 0 |
| Pitfall 9 | AMM k-invariant holds across multi-call interference | **invariant fuzz** | `forge test --match-contract FollowFadeMarketInterference -v` | ❌ Wave 0 |
| Pitfall 22 | Empty-pool LP-fee routes to treasury | unit | `forge test --match-test testEmptyPoolLpFee -v` | ❌ Wave 0 |
| Pitfall 3 | TVL aggregation boundary $4999/$5001 | unit | `forge test --match-test testTvlBoundary -v` | ❌ Wave 0 |
| Pitfall 10 | Strict `<` expiry gate (off-by-one) | unit | `forge test --match-test testExpiryGate -v` | ❌ Wave 0 |
| D-01 | `createCall` forwards stake to FFM, not holds | integration | `forge test --match-test testCreateCallForwards -v` | ❌ Wave 0 |
| SHARE-04 | OG card renders follow/fade bar correctly | visual/smoke | Playwright OG smoke test | ❌ Wave 0 |

### Foundry Invariant Test Shape (Pitfall 9)

```solidity
// packages/contracts/test/FollowFadeMarketGates.t.sol
contract FollowFadeMarketInvariantTest is Test {
    FollowFadeMarket ffm;

    // Invariant: for every callId, if real shares > 0, k can only grow
    function invariant_kNeverShrinks() public view {
        for (uint256 i = 1; i <= maxCallId; i++) {
            uint256 newK = ffm.followReserve(i) * ffm.fadeReserve(i);
            assertGe(newK, lastK[i], "k decreased");
        }
    }

    // Invariant: USDC.balanceOf(ffm) == sum of all real pool reserves
    function invariant_usdcBalanceMatchesReserves() public view {
        uint256 sumReserves = 0;
        for (uint256 i = 1; i <= maxCallId; i++) {
            sumReserves += ffm.followReserve(i);
            sumReserves += ffm.fadeReserve(i) - ffm.fadeSeedVirtual(i); // exclude virtual
        }
        assertEq(IERC20(USDC).balanceOf(address(ffm)), sumReserves, "balance!=reserves");
    }

    // Invariant: no user can claim more than they contributed pro-rata
    function invariant_noOverClaim() public view {
        // ... per-user share accounting
    }
}
```

### Wave 0 Gaps
- [ ] `packages/contracts/test/FollowFadeMarket.t.sol` — covers SOCIAL-01..28 unit tests
- [ ] `packages/contracts/test/FollowFadeMarketGates.t.sol` — AMM k-invariant + penalty injection invariant fuzz
- [ ] `packages/contracts/test/FollowFadeMarketInterference.t.sol` — multi-call interference fixtures (Pitfall 9)
- [ ] `packages/contracts/test/TvlAggregation.t.sol` — TVL cap boundary tests (Pitfall 3)
- [ ] `packages/contracts/test/helpers/FfmTestHelper.sol` — shared bootstrap helper (deploy FFM + seed 3 calls)
- [ ] ABI export: `packages/contracts/out/FollowFadeMarket.sol/FollowFadeMarket.json` → `packages/subgraph/abis/`

*(No new test framework install needed — Foundry and Vitest already installed)*

### Sampling Rate
- **Per task commit:** `forge test --match-contract FollowFadeMarket -v` (single file, fast)
- **Per wave merge:** `forge test --profile ci` (1000 fuzz runs)
- **Phase gate:** Full suite green before `/gsd-verify-work`

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A (Phase 1) |
| V3 Session Management | no | N/A (Phase 1) |
| V4 Access Control | yes | `msg.sender == followFadeMarket` guard on `markCallerExited`; `authorizedRepWriters` on ProfileRegistry |
| V5 Input Validation | yes | `MinPositionBelowMinimum`, `PositionAboveMaximum`, `SlippageExceeded`, `TvlCapReached`, `CallPastExpiry`, `ExitCooldownActive`, `CallerExitLocked` |
| V6 Cryptography | no | No new signing in Phase 2; notification fan-out is DB-only |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Post-expiry free-roll deposit | Tampering | `block.timestamp < call.expiry` strict `<`; Pitfall 10 |
| Reentrancy via USDC callback | Tampering | `ReentrancyGuard` on all USDC-handling functions |
| TVL cap bypass via split deposits | Tampering | Cap check inside `nonReentrant`; `combinedTvl` read atomically |
| Rep farming via self-fade (Pitfall 11) | Elevation | Observability only in v1; `applyRepDelta` slashes properly regardless |
| Unauthorized `markCallerExited` | Spoofing | `require(msg.sender == followFadeMarket)` |
| Malicious `applyRepDelta` caller | Elevation | `authorizedRepWriters` mapping; only FFM authorized in Phase 2 |
| Dust/rounding attacks on slash split | Tampering | Use subtraction for last split (`toTreasury = slash - toOpposite - toSameSide`) |
| OG card shows stale pool state after CallerExit | Repudiation | `statusVersion` bump in notification fan-out worker (D-09) |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-call proxy contracts for AMM | Single contract with per-callId sub-state | Phase 2 design (§11.2 lock) | Saves ~50k gas/call, simplifies TVL aggregation |
| Push-notification via WebSocket | Polled in-app notification (Phase 2) | Phase 2 scope (push = v1.1) | Acceptable for low-frequency events (callerExit is rare) |
| Subgraph as single data source | Subgraph + direct RPC reads (D-07) | Phase 2 design | Live receipt freshness; slippage accuracy |
| Global `settlementManager` setter | `authorizedRepWriters` mapping (D-04) | Phase 2 redeploy | Phase 4 SettlementManager is a plug-in; no third redeploy |

**Deprecated/outdated patterns NOT used in Phase 2:**
- Per-call proxy pattern (rejected per §11.2)
- `balanceOf` as TVL counter (use `balanceOf(this)` for FollowFadeMarket; counter-only for CallRegistry cap math)
- Enum-based side (`0=follow, 1=fade`) should be a named constant to avoid off-by-one in storage (use explicit `Side` enum)

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Foundry forge | AMM fuzz tests | ✓ | Phase 1 installed | — |
| Arbitrum Sepolia RPC | Redeploy + subgraph startBlock | ✓ | Phase 1 configured | — |
| Fly Postgres (iad) | `notifications` table | ✓ | Phase 1 provisioned | — |
| Redis (Upstash) | BullMQ notification fan-out | ✓ | Phase 0 provisioned | — |
| Subgraph Studio (Sepolia) | FollowFadeMarket event indexing | ✓ | Phase 1 deployed | Polled-events fallback |
| graph-cli@0.98.1 | Subgraph redeploy | ✓ | Phase 1 installed | — |
| @vercel/og@0.11.1 | OG card variant 1 | ✓ | Phase 0 installed | — |

No new infrastructure is needed for Phase 2.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `INITIAL_SHARE_PRICE = 1e12` gives clean bootstrap math with no overflow at $100 max stake | AMM Math Pattern 1 | If wrong, first-follow mints 0 shares; caught by `require(sharesOut > 0)` in CI test |
| A2 | Linear decay (not curved/stepped) is acceptable for caller-exit rep delta | Pattern 6 | Spec says "decay curve" without specifying shape; linear is auditable; can be changed without redeploy |
| A3 | `fadeSeedVirtual` is stored as a separate mapping (not inferred from reserve vs. balance) | Pattern 7/8 | If not tracked separately, `callerVolumeAtExit` snapshot and real-TVL calculation both error |
| A4 | The `notifications` polling interval is ~30s (not spec-defined) | Notification Center | If too slow, user misses exit notification urgency; acceptable for v1; push = v1.1 |
| A5 | `statusVersion` stored in Fly Postgres (not Redis with TTL) for durability across relayer restarts | OG Card | Redis with TTL could lose version on restart, serving stale OG card; Postgres is safer |

---

## Open Questions

1. **`applyRepDelta` signature on redeployed ProfileRegistry**
   - What we know: D-05 says "calls `profileRegistry.applyRepDelta(caller, delta)`" but the current IProfileRegistry has no such method; needs to be added.
   - What's unclear: Does the planner add this to IProfileRegistry.sol in the same PR as the ProfileRegistry redeploy, or is it a separate interface extension?
   - Recommendation: Add `applyRepDelta(address user, int256 delta)` and `setAuthorizedRepWriter(address writer, bool authorized)` to IProfileRegistry in the same wave as the ProfileRegistry redeploy.

2. **`callerExitedAt` field in CallRegistry**
   - What we know: SOCIAL-21 requires `call.callerExitedAt = now`; the current `Call` struct (ICallRegistry.sol) has no such field.
   - What's unclear: Adding it to the struct means the `Call` struct changes, which changes the ABI, which requires updating any downstream consumer of `getCall()`.
   - Recommendation: Add `uint64 callerExitedAt` to the `Call` struct in the redeployed CallRegistry. This is acceptable since it's a redeploy not an upgrade. Ensure `computeCallerExitPenalty` reads from it.

3. **Quote stance storage location**
   - What we know: D-15 says stored off-chain in "relayer DB / subgraph" keyed to on-chain `CallQuoted` event.
   - What's unclear: Is the stance stored in Fly Postgres (new `quote_stance` table) or as a subgraph entity annotation via a relayer-signed event replay?
   - Recommendation: Simpler = Fly Postgres `quote_stance` table: `(call_id, quote_call_id, stance ENUM('following','fading'))`, indexed by `quote_call_id`. Relayer writes on quote-call creation webhook; frontend reads via `/api/quote-stance?callId=X`.

---

## Sources

### Primary (HIGH confidence)
- `CALL_IT_SPEC1.md` §8.1, §8.2, §8.4, §8.7.1, §8.7.2, §8.7.3, §8.8, §10.2, §10.3, §10.8, §11.2, §12.2 — locked spec for all AMM formulas and architecture
- `packages/contracts/src/CallRegistry.sol` — deployed Phase 1 source; redeploy diff anchored here
- `packages/contracts/src/ProfileRegistry.sol` — deployed Phase 1 source; redeploy diff anchored here
- `packages/contracts/src/interfaces/ICallRegistry.sol` — interface for ABI compatibility
- `packages/contracts/src/interfaces/IProfileRegistry.sol` — interface for ABI compatibility
- `packages/shared/src/constants/addresses.ts` — deployed Sepolia addresses to update
- `packages/subgraph/subgraph.yaml` — data source addresses + placeholder for FollowFadeMarket
- `.planning/research/PITFALLS.md` — Pitfall 3 (TVL), 8 (OG cache), 9 (AMM k-invariant), 10 (post-expiry gate), 22 (empty-pool LP-fee)
- `.planning/research/STACK.md` — pinned versions; all constraints verified
- `.planning/phases/01-core-contracts-auth-frontend-skeleton/01-CONTEXT.md` — D-07 Fly Postgres, D-21 Receipt component, D-24 feed pattern, D-29 parity-test pattern
- `packages/contracts/foundry.toml` — `[profile.ci] fuzz.runs = 1000`

### Secondary (MEDIUM confidence)
- Standard constant-product AMM share-minting formula (Uniswap V2 whitepaper pattern; widely reproduced in AMM literature) [ASSUMED] — adapted to this specific product's cold-start and penalty-injection semantics
- `Math.mulDiv` from OZ 5.6.1 for overflow-safe integer multiplication [VERIFIED: OZ docs, already installed]
- BullMQ job queue patterns for event-driven notification fan-out [ASSUMED] — standard usage, Phase 0 already uses BullMQ

### Tertiary (LOW confidence)
- Optimal share precision (18 decimals) vs. 6 decimals for AMM with $1 minimum position [ASSUMED] — industry standard; risk: verified in Foundry fuzz test for rounding dust

---

## Metadata

**Confidence breakdown:**
- AMM formulas: HIGH — derived directly from locked spec §8.1/§8.2/§11.2/§12.2; cross-referenced with Uniswap V2 pattern
- Contract redeploy diff: HIGH — derived from deployed Phase 1 source (verified via Read) + CONTEXT.md D-01/D-02/D-04 decisions
- TVL aggregation: HIGH — Pitfall 3 fully researched; canonical getTvl() pattern clear
- Penalty injection: HIGH — spec §11.2 is explicit; "no phantom shares" is unambiguous
- Live Receipt architecture: HIGH — spec §15.3 layouts + Phase 1 D-24 feed pattern reused
- Notification center: MEDIUM — schema and fan-out pattern are standard; Fly Postgres DDL is an assumption
- Share precision (18 decimal): ASSUMED — standard AMM practice; needs fuzz verification

**Research date:** 2026-05-29
**Valid until:** 2026-07-01 (stable domain; AMM math won't change; Foundry and OZ versions are stable)
