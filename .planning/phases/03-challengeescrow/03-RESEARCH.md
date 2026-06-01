# Phase 3: ChallengeEscrow - Research

**Researched:** 2026-06-01
**Domain:** Solidity escrow contract (1v1 duels), subgraph extension, BullMQ/Postgres relayer workers, Next.js duel page + OG card variant 3
**Confidence:** HIGH — all stack pieces are deployed and established; ChallengeEscrow is a new contract extending a working 3-contract system.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: `settleDuel(challengeId, winner)` mirrors Phase 2's `markSettled`. Guarded `onlySettlementManager`; owner `setSettlementManager(addr)` setter deployed at `address(0)`. Phase 4 plugs in with NO ChallengeEscrow redeploy.
- D-02: Per-`challengeId` settlement is the unit. Phase 4 loops over accepted duels per call.
- D-03: Hybrid push-then-claim overage. `settleDuel` pushes overage to overcommitter; on failure records `UnclaimedOverage`; `claimOverage(challengeId)` fallback.
- D-04: ChallengeEscrow enforces 3-way aggregated TVL cap on `proposeChallenge` and `acceptChallenge`. Constructor refs CallRegistry + FollowFadeMarket. Exposes own `getTvl()`.
- D-05: Full symmetric closure (FFM/CR also counting ChallengeEscrow) deferred to Phase 6.
- D-06: "Riding" = existing follow/fade participants on the parent call. No new staking layer.
- D-07: Trending-pin + Duel King computed by BullMQ repeatable worker + Fly Postgres.
- D-08: Full duel-meta machinery ships now; settled-dependent parts (Duel King output, recently-settled) inert until Phase 4.
- D-09: Many accepted duels per call; route `/duel/[challengeId]`. No one-accepted-per-call guard.
- D-10: Duel page liveness reuses Phase 2 D-07/D-08. ~5s poll + window-focus + subgraph 800ms race/polled fallback.
- D-11: Full variant-3 OG route now, settled fields stubbed (winner highlight, rep deltas) until Phase 4.

### Claude's Discretion
- Duel King "win streak" = consecutive duel wins within trailing 7 days, recomputed weekly; tie-break by most recent win then highest pot.
- Challenge/overage storage shape (mappings keyed by `challengeId`, escrow accounting), `getTvl()` computation precision.
- Trending re-pin / pin-extension when duel keeps qualifying past 4h; exact relayer endpoint + Postgres schema for trending/king state.
- Duels-tab filter-chip wiring and feed-merge logic for pinned trending duels.
- `openToChallenges` feed badge (⚔ OPEN) + challengeable-only feed filter — render from existing on-chain `call.openToChallenges`.
- Challenge form: pre-fill to match caller's stake exactly with override; Phase 1 preflight/zod pattern.

### Deferred Ideas (OUT OF SCOPE)
- Full symmetric 3-contract TVL aggregation (FFM/CR reading ChallengeEscrow) + boundary fuzz → Phase 6.
- Actual duel settlement + payout execution + ~1.5× rep delta → Phase 4.
- Real Duel King output + recently-settled Duels-tab section → exercisable Phase 4.
- Auto-post-to-X on duel resolution + Twitter Card Validator + 200px QA → Phase 7.
- Duel page mobile-responsive pass → Phase 9 ships "Best viewed on desktop" banner.
- Duel King "win streak" precise semantics confirmation → Phase 4.
- Telegram alert for trending-duel events → optional v1.1.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SOCIAL-29 | `proposeChallenge(callId, stake)` reverts `CallerNotOpenToChallenges` when toggled off | §12.3 Step 1 gate; reads `callRegistry.getCall().openToChallenges` |
| SOCIAL-30 | Challenge form pre-fills stake to match caller's stake; challenger can override | Frontend reads `call.stake` from live-state route; D-10 poll |
| SOCIAL-31 | Asymmetric duels: pot = min(caller, challenger) × 2; overage returned at settlement | D-03 push-then-claim; §12.3 pot formula |
| SOCIAL-32 | `proposeChallenge` reverts `SelfChallenge` when `msg.sender == call.caller` | §12.3 Step 2 gate; hardcoded address check |
| SOCIAL-33 | `proposeChallenge` reverts `CallNotChallengeable` when status != Live or past expiry | §12.3 Step 3 gate |
| SOCIAL-34 | 24h `CHALLENGE_ACCEPTANCE_WINDOW`; `acceptChallenge` reverts `AcceptanceWindowExpired` after; `claimRefund` returns stake after timeout | §12.3 Accept + Refund logic |
| SOCIAL-35 | Caller can `rejectChallenge` during window to immediately refund challenger | §12.3 Reject logic |
| SOCIAL-36 | Stakes escrowed in ChallengeEscrow; winner takes pot minus 1% protocol fee | §8.9; D-01 settleDuel seam |
| SOCIAL-37 | ~1.5× rep movement applied to both parties at duel settlement | Phase 4 wires; Phase 3 ships seam only |
| SOCIAL-38 | `claimDuelPayout` idempotent — reverts `AlreadyClaimed` on second attempt | §12.3 CEI claim; `claimed` mapping |
| SOCIAL-39 | `claimDuelPayout` reverts `NotDuelWinner` for non-winner | §12.3 winner check |
| SOCIAL-40 | Trending Duel auto-promotion: pot ≥ $500 OR ≥50 Riding backers → 4h pin; "TRENDING DUEL" | BullMQ worker + Postgres `trending_duels` table |
| SOCIAL-41 | Duel King badge: highest 7-day win streak, refreshed weekly | BullMQ repeatable worker; placeholder until Phase 4 |
| SOCIAL-42 | Duels tab: Active (pot desc), Trending pinned, Recently settled (last 7d); filter chips | Relayer endpoints + subgraph query |
| SOCIAL-46 | `claimPayout` idempotency: `CallNotSettled`, `AlreadyClaimed`, `NoPayoutAvailable` | FollowFadeMarket contract exists; exercised Phase 4 |
| SOCIAL-47 | `claimPayout` CEI: marks claimed BEFORE transfer | FollowFadeMarket contract exists |
| SOCIAL-48 | Full event set including all Challenge* events | ChallengeEscrow event definitions |
| SOCIAL-49 | Receipt page caller-only exit link after 24h | Phase 2 delivered |
| SOCIAL-50 | Receipt page position-holder exit link after 4h | Phase 2 delivered |
| SOCIAL-51 | Duel-settled share card: two-avatar, winner highlighted, loser 40% opacity | Phase 3 builds variant-3 route with placeholders for settled fields |
| UI-11 | Duel page `/duel/[challengeId]`: THE MARKET hero, two-column duel card, MARKET CONSENSUS bar, Riding sections, Side-with CTAs | Full page implementation per §15.5 |
| SHARE-07 | Duel Settled OG card variant 3 | `/og/duel/[challengeId]/route.ts` per §16.4; settled fields stubbed |
</phase_requirements>

---

## Summary

Phase 3 delivers the `ChallengeEscrow` contract and all duel social surfaces. The contract follows the exact same authorization/pause/TVL-cap patterns established in Phases 1 and 2, with two additional complexities: (1) the asymmetric-overage push-then-claim invariant that must prevent stranding a losing overcommitter's funds, and (2) the 3-way TVL aggregation where ChallengeEscrow queries both CallRegistry and FollowFadeMarket to guard its own deposits without requiring those contracts to be redeployed.

The Phase-4-readiness of the settlement seam is the keystone. `settleDuel(challengeId, winner)` is guarded `onlySettlementManager` with the manager initially `address(0)`, and the `claimDuelPayout` winner-pull flow uses strict CEI, exactly mirroring how CallRegistry's `markSettled` + FollowFadeMarket's `claimPayout` were designed. Phase 4's SettlementManager plugs in via one `setSettlementManager(addr)` call — no ChallengeEscrow redeploy.

The off-chain stack (BullMQ worker for Trending/Duel King, Postgres tables, relayer endpoints, duel live-state route, duel page, OG card variant 3) all reuse the architectural patterns from Phase 2. The subgraph extension replaces the Phase 0 stub handlers with real event handlers and three new entities (Challenge, ChallengePayout, UnclaimedOverage). The "Riding" mechanic is a pure UI/aggregation concern that reads existing FollowFadeMarket data — no new contract layer needed.

**Primary recommendation:** Build ChallengeEscrow as a standalone non-upgradeable contract; resolve the asymmetric overage problem at the `settleDuel` level (push + fallback `claimOverage`); drive the frontend entirely from the same dual-source pattern (RPC reads + subgraph activity) already working in Phase 2.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Propose/accept/reject/refund challenge | Solidity (ChallengeEscrow) | — | Money in escrow; all logic must be on-chain and auditable |
| Overage push + claimOverage fallback | Solidity (ChallengeEscrow) | Off-chain subgraph for observability | Push at settleDuel; fallback pull; never stranded in winner-only path |
| 3-way TVL cap enforcement | Solidity (ChallengeEscrow) reads CR + FFM | — | ChallengeEscrow reads from deployed contracts; no redeploy needed |
| Settlement seam (settleDuel) | Solidity (ChallengeEscrow) | Phase 4 SettlementManager calls it | Phase 4 plugs in; winner claims via separate claimDuelPayout |
| Duel live state (pot, spread, countdown) | Relayer live-state route (RPC reads) | Subgraph for activity history | ~5s poll + window-focus; same pattern as Phase 2 |
| Trending-pin calculation | Relayer BullMQ worker (repeatable) | Postgres trending_duels table | Requires wall-clock cron for 4h pin expiry; subgraph-only rejected (D-07) |
| Duel King calculation | Relayer BullMQ worker (weekly) | Postgres duel_kings table | Requires consecutive-win streak query over settled history |
| Riding sections (follower/fader lists) | Frontend reads subgraph follow/fade events | FollowFadeMarket existing data | D-06: pure aggregation, no new mechanic |
| Challenge notifications | Relayer notification-fanout worker | Existing notifications table | Reuses Phase 2 D-13/D-14 infra with new event_type values |
| Duel OG card variant 3 | Next.js Route Handler (Node runtime) | Vercel CDN cache | Flexbox-only per Pitfall 15; settled fields stubbed per D-11 |
| Subgraph indexing | AssemblyScript handlers replacing Phase 0 stub | Sepolia Studio | Challenge, ChallengePayout, UnclaimedOverage entities |

---

## Standard Stack

### Core (all pre-established; no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Solidity | `=0.8.30` | ChallengeEscrow contract | Exact pin per foundry.toml; avoids 0.8.28–0.8.33 IR bug [VERIFIED: foundry.toml line 13] |
| OpenZeppelin Contracts | `5.6.1` | ReentrancyGuard, Ownable2Step, Pausable, SafeERC20 | Same imports used in CallRegistry.sol and FollowFadeMarket.sol [VERIFIED: existing contracts] |
| USDC_ARB_NATIVE | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | All transfer paths | Single source: packages/contracts/src/constants/USDC.sol [VERIFIED: codebase] |
| Foundry | nightly | Test + fuzz + deploy | foundry.toml; fuzz `ci` profile = 1000 runs [VERIFIED: foundry.toml] |
| @graphprotocol/graph-cli | `0.98.1` | Subgraph build + deploy | Pre-established Phase 0 [VERIFIED: codebase] |
| @graphprotocol/graph-ts | `0.38.2` | Subgraph mapping types | Paired with graph-cli 0.98.1 [VERIFIED: CLAUDE.md] |
| Fastify | `5.6.1` | Relayer HTTP server | Pre-established Phase 0 [VERIFIED: codebase] |
| BullMQ | latest | Job queue (Trending worker, notification fanout) | Pre-established Phase 2 patterns [VERIFIED: ARCHITECTURE.md] |
| Redis | `7.x` | BullMQ backing store + cache | Pre-established [VERIFIED: apps/relayer/src/lib/redis.ts] |
| Drizzle ORM + Fly Postgres | existing schema | Trending_duels, duel_kings tables | Pre-established pattern [VERIFIED: apps/relayer/src/db/schema.ts] |
| @vercel/og | `0.11.1` | OG card variant 3 | Pre-established Phase 2; Node runtime [VERIFIED: apps/web/app/og/[callId]/route.ts] |
| viem | `2.50.4` | Server-side RPC reads in OG route + relayer | Pre-established pattern [VERIFIED: codebase] |
| wagmi | `2.18.0` | Frontend contract reads/writes | Pre-established Phase 1 |
| Next.js App Router | `16.2.6` | Duel page route | Pre-established Phase 0 |

### No New Dependencies
Phase 3 introduces **zero new npm or Solidity library dependencies**. All building blocks are established. The only new artifact is `ChallengeEscrow.sol` itself plus new Drizzle table definitions and subgraph entity handlers.

---

## Architecture Patterns

### System Architecture Diagram

```
Challenger Browser                  Caller Browser
       │                                  │
       │ proposeChallenge(callId, stake)   │ acceptChallenge(challengeId)
       ▼                                  ▼
┌─────────────────────────────────────────────────────────────┐
│  ChallengeEscrow (new, Phase 3)                             │
│                                                             │
│  proposeChallenge ──reads──► CallRegistry.getCall()         │
│  acceptChallenge  ──reads──► CR.currentTvl + FFM.getTvl()   │
│  rejectChallenge  ──push──►  challenger USDC                 │
│  claimRefund      ──push──►  challenger USDC (after 24h)     │
│  settleDuel(id, winner) [onlySettlementManager]             │
│    ├──push overage──► overcommitter wallet (D-03)            │
│    └──on fail: record UnclaimedOverage                      │
│  claimDuelPayout  ──push──►  winner USDC (CEI)              │
│  claimOverage     ──push──►  overcommitter USDC (fallback)  │
│  getTvl()         ◄── USDC.balanceOf(address(this))         │
└───────────────┬─────────────────────────────────────────────┘
                │ events: ChallengeProposed, ChallengeAccepted,
                │         ChallengeRejected, ChallengeRefunded,
                │         ChallengeSettled, PayoutClaimed,
                │         OveragePushed, UnclaimedOverageCreated
                │
         ┌──────┴────────────────────────────────────────────────┐
         │  Subgraph (replaces Phase 0 stub)                     │
         │  Entities: Challenge, ChallengePayout,                │
         │            UnclaimedOverage, TvlSnapshot              │
         └──────┬────────────────────────────────────────────────┘
                │ GraphQL queries
         ┌──────┴────────────────────────────────────────────────┐
         │  Relayer (Fastify + BullMQ)                           │
         │  ┌─────────────────────────────────────────────────┐  │
         │  │ GET /api/duels/:id/live-state                   │  │
         │  │   RPC reads: ChallengeEscrow.getChallenge()     │  │
         │  │              FFM.followReserve + fadeReserve     │  │
         │  │              CR.getCall() expiry                │  │
         │  │   Redis cache 4s TTL                            │  │
         │  ├─────────────────────────────────────────────────┤  │
         │  │ GET /api/duels  (Duels tab)                     │  │
         │  │   Subgraph query: active duels + trending       │  │
         │  │   Postgres: trending_duels pins                 │  │
         │  ├─────────────────────────────────────────────────┤  │
         │  │ BullMQ repeatable: duel-trending-worker         │  │
         │  │   Reads: subgraph duel pot + backer count       │  │
         │  │   Writes: trending_duels.trending_until         │  │
         │  ├─────────────────────────────────────────────────┤  │
         │  │ BullMQ repeatable (weekly): duel-king-worker    │  │
         │  │   Reads: subgraph settled duels (last 7d)       │  │
         │  │   Writes: duel_kings.winner_address             │  │
         │  ├─────────────────────────────────────────────────┤  │
         │  │ notification-fanout: challenge_proposed,        │  │
         │  │   challenge_accepted, challenge_rejected        │  │
         │  └─────────────────────────────────────────────────┘  │
         └──────┬────────────────────────────────────────────────┘
                │ REST / polling
         ┌──────┴────────────────────────────────────────────────┐
         │  Frontend  /duel/[challengeId]                        │
         │  ┌─────────────────────────────────────────────────┐  │
         │  │ THE MARKET hero (asset pair, pot, countdown)    │  │
         │  │ Two-column duel card (CALLER / VS / CHALLENGER) │  │
         │  │ MARKET CONSENSUS bar (followReserve/fadeReserve)│  │
         │  │ Riding sections (follow list / fade list)       │  │
         │  │ "Side with [X]" → follow/fade on parent call    │  │
         │  └─────────────────────────────────────────────────┘  │
         │  /feed Duels tab (Active / Trending / Settled 7d)    │
         │  /og/duel/[challengeId]  (Node runtime, flexbox)     │
         └───────────────────────────────────────────────────────┘
```

### Recommended Project Structure (new files only)

```
packages/contracts/
├── src/
│   ├── ChallengeEscrow.sol          # new — 1v1 duel escrow
│   └── interfaces/
│       └── IChallengeEscrow.sol     # new — LOCKED per §12.3
├── test/
│   ├── ChallengeEscrow.t.sol        # new — propose/accept/reject/refund/claim matrix
│   ├── ChallengeEscrowGates.t.sol   # new — self-challenge, stake bounds, window, cap
│   ├── ChallengeEscrowParity.t.sol  # new — Foundry↔Vitest gate parity (D-29)
│   └── helpers/
│       └── CeTestHelper.sol         # new — extends FfmTestHelper with CE deploy
├── script/
│   └── DeployPhase3.s.sol           # new — deploy ChallengeEscrow; update addresses.ts

packages/shared/src/constants/
└── addresses.ts                     # modified — add CHALLENGE_ESCROW_ARBITRUM_SEPOLIA

packages/subgraph/
├── src/
│   └── challenge-escrow.ts          # modified — replace Phase 0 stub with real handlers
├── schema.graphql                   # modified — Challenge, ChallengePayout, UnclaimedOverage, TvlSnapshot entities
└── subgraph.yaml                    # modified — add ChallengeEscrow data source + startBlock

apps/relayer/src/
├── db/
│   └── schema.ts                    # modified — trending_duels + duel_kings tables
├── routes/
│   ├── duel-live-state.ts           # new — GET /api/duels/:id/live-state
│   └── duels.ts                     # new — GET /api/duels (Duels tab)
└── workers/
    ├── duel-trending-worker.ts      # new — BullMQ repeatable, checks pot + backer count
    └── duel-king-worker.ts          # new — BullMQ repeatable weekly

apps/web/app/
├── duel/
│   └── [challengeId]/
│       └── page.tsx                 # new — Duel page per §15.5
└── og/
    └── duel/
        └── [challengeId]/
            └── route.ts             # new — OG variant 3 per §16.4 (Node runtime, flexbox)
```

### Pattern 1: ChallengeEscrow Storage Shape

The `challengeId` counter is independent from `callId`. One call can have multiple accepted challenges (D-09).

```solidity
// Source: §12.3 + D-09 design — ASSUMED structure (within spec bounds)
enum ChallengeStatus { Proposed, Accepted, Rejected, Refunded, Settled }

struct Challenge {
    uint256 callId;           // parent call
    address caller;           // the call's caller (one side of duel)
    address challenger;       // msg.sender of proposeChallenge
    uint96  callerStake;      // locked from caller at acceptChallenge
    uint96  challengerStake;  // locked from challenger at proposeChallenge
    uint64  proposedAt;       // block.timestamp at propose (acceptance window starts)
    address winner;           // populated by settleDuel()
    ChallengeStatus status;
    bool    callerClaimed;    // CEI idempotency for claimDuelPayout
    bool    challengerClaimed; // CEI idempotency for claimDuelPayout
    bool    overageClaimed;   // claimOverage fallback idempotency
}

// keyed by auto-incrementing challengeId
mapping(uint256 => Challenge) internal _challenges;
uint256 public nextChallengeId; // starts at 1 (0 burned)

// Track per-call active escrow to support getTvl() and N-duel caller stake lockup
uint256 public totalEscrow; // incremented on accept, decremented on settle/refund/reject
```

### Pattern 2: TVL Cap — 3-Way Aggregation in ChallengeEscrow

```solidity
// Source: D-04 + Pitfall 3 — [ASSUMED within D-04 decision]
// proposeChallenge: challenger's stake comes in
// acceptChallenge: caller's matching stake (min) comes in
// Both gates read the 3-way combined total

uint256 public constant TVL_CAP_MAX = 100_000e6; // mirrors CR constant

function _checkTvlCap(uint256 incoming) internal view {
    uint256 combined = callRegistry.currentTvl()
                     + followFadeMarket.getTvl()
                     + totalEscrow  // own escrow (not USDC.balanceOf — avoids double-count with FFM)
                     + incoming;
    if (combined > tvlCap) revert TvlCapReached(incoming, tvlCap - (combined - incoming));
}
```

**Critical note:** `getTvl()` on ChallengeEscrow must return `totalEscrow` (a maintained counter), NOT `USDC.balanceOf(address(this))`. The latter would double-count with the balance-based approach if any other USDC accidentally lands here. `totalEscrow` is incremented/decremented precisely on USDC moves. [ASSUMED — within D-04 bounds]

### Pattern 3: `settleDuel` Authorization Surface

Mirrors Phase 2's `markSettled` in CallRegistry.sol (line 442):

```solidity
// Source: CallRegistry.sol markSettled() + D-01
address public settlementManager; // set to address(0) at deploy; Phase 4 rotates

modifier onlySettlementManager() {
    if (msg.sender != settlementManager) revert NotSettlementManager();
    _;
}

function setSettlementManager(address newManager) external onlyOwner {
    settlementManager = newManager;
    emit SettlementManagerSet(newManager);
}

function settleDuel(uint256 challengeId, address winner) external onlySettlementManager {
    Challenge storage c = _challenges[challengeId];
    // checks
    if (c.status != ChallengeStatus.Accepted) revert ChallengeNotAccepted();
    // effects
    c.winner = winner;
    c.status = ChallengeStatus.Settled;
    // push overage (D-03): fire-and-forget push, record if fails
    _pushOverage(challengeId, c);
    emit ChallengeSettled(challengeId, winner);
}
```

### Pattern 4: Asymmetric Overage Push-Then-Claim (D-03, Pitfall 21)

```solidity
// Source: D-03 + Pitfall 21 — [ASSUMED structure within locked design]
function _pushOverage(uint256 challengeId, Challenge storage c) internal {
    uint256 potPerSide = _min(c.callerStake, c.challengerStake);
    address overcommitter;
    uint256 overage;

    if (c.callerStake > c.challengerStake) {
        overcommitter = c.caller;
        overage = c.callerStake - potPerSide;
    } else if (c.challengerStake > c.callerStake) {
        overcommitter = c.challenger;
        overage = c.challengerStake - potPerSide;
    } else {
        return; // symmetric — no overage
    }

    if (overage == 0) return;

    // CEI: mark before transfer
    c.overageClaimed = true;
    totalEscrow -= overage;

    // Push attempt (fire-and-forget)
    bool ok = IERC20(USDC_ARB_NATIVE).transfer(overcommitter, overage);
    if (!ok) {
        // Rollback and record for pull fallback
        c.overageClaimed = false;
        totalEscrow += overage;
        emit UnclaimedOverageCreated(challengeId, overcommitter, overage);
    } else {
        emit OveragePushed(challengeId, overcommitter, overage);
    }
}

// Fallback pull (D-03)
function claimOverage(uint256 challengeId) external nonReentrant {
    Challenge storage c = _challenges[challengeId];
    if (c.status != ChallengeStatus.Settled) revert ChallengeNotSettled();
    if (c.overageClaimed) revert AlreadyClaimed();

    address overcommitter = c.callerStake > c.challengerStake ? c.caller : c.challenger;
    if (msg.sender != overcommitter) revert NotOverageRecipient();

    uint256 potPerSide = _min(c.callerStake, c.challengerStake);
    uint256 overage = (c.callerStake > c.challengerStake)
        ? c.callerStake - potPerSide
        : c.challengerStake - potPerSide;

    c.overageClaimed = true; // CEI
    totalEscrow -= overage;
    IERC20(USDC_ARB_NATIVE).safeTransfer(overcommitter, overage);
    emit OveragePushed(challengeId, overcommitter, overage); // reuse same event for UI
}
```

**Why `transfer` not `safeTransfer` in the push path:** `safeTransfer` reverts on failure; we want a bool return to handle push failure gracefully. Use low-level `IERC20.transfer` which returns bool, then handle the false case. [ASSUMED — safe alternative is a try/catch wrapping safeTransfer]

### Pattern 5: `claimDuelPayout` — CEI, Idempotent, Winner-Only

```solidity
// Source: §12.3 CEI claim logic + SOCIAL-38 + SOCIAL-39
function claimDuelPayout(uint256 challengeId) external nonReentrant {
    Challenge storage c = _challenges[challengeId];

    // Checks
    if (c.status != ChallengeStatus.Settled) revert ChallengeNotSettled();
    if (msg.sender != c.winner) revert NotDuelWinner();

    bool isCaller = (msg.sender == c.caller);
    if (isCaller) {
        if (c.callerClaimed) revert AlreadyClaimed();
    } else {
        if (c.challengerClaimed) revert AlreadyClaimed();
    }

    // Pot = min(callerStake, challengerStake) × 2 (§12.3)
    uint256 pot = uint256(_min(c.callerStake, c.challengerStake)) * 2;
    // Payout = pot × 99/100 (1% protocol fee per §8.9)
    uint256 payout = pot * 99 / 100;
    uint256 protocolFee = pot - payout;

    // Effects (CEI — SAFETY-09)
    if (isCaller) c.callerClaimed = true;
    else c.challengerClaimed = true;
    totalEscrow -= pot; // pot exits escrow

    // Interactions
    IERC20(USDC_ARB_NATIVE).safeTransfer(c.winner, payout);
    IERC20(USDC_ARB_NATIVE).safeTransfer(treasury, protocolFee);

    emit PayoutClaimed(challengeId, c.winner, payout, protocolFee);
}
```

**Key insight:** The 1% protocol fee (§8.9) on the pot, NOT on the full escrowed amount (which includes potential overage). Overage is already separated before pot math. [CITED: §8.9 "1.0% protocol only, no creator fee, no LP fee"]

### Pattern 6: Subgraph — Real Handlers Replacing Phase 0 Stub

```typescript
// Source: challenge-escrow.ts Phase 0 stub + Phase 0 graphql schema pattern
// [ASSUMED: mirrors the FollowFadeMarket subgraph handler patterns]
import { Challenge, ChallengePayout, UnclaimedOverage, TvlSnapshot } from '../generated/schema'
import {
  ChallengeProposed,
  ChallengeAccepted,
  ChallengeRejected,
  ChallengeRefunded,
  ChallengeSettled,
  PayoutClaimed,
  UnclaimedOverageCreated
} from '../generated/ChallengeEscrow/ChallengeEscrow'

export function handleChallengeProposed(event: ChallengeProposed): void {
  let c = new Challenge(event.params.challengeId.toString())
  c.callId = event.params.callId
  c.challenger = event.params.challenger.toHexString()
  c.caller = event.params.caller.toHexString()
  c.challengerStake = event.params.challengerStake
  c.status = 'Proposed'
  c.proposedAt = event.block.timestamp
  c.save()
}
// ... handleChallengeAccepted, handleChallengeSettled, handlePayoutClaimed, handleUnclaimedOverageCreated
```

**graph-cli@0.98.1 requires `@entity(immutable: true/false)` explicitly** — known from Phase 0. Set all Challenge entities as `immutable: false` (they transition through statuses). [VERIFIED: STATE.md accumulated decisions]

### Pattern 7: Relayer — Duel Live-State Route (mirrors live-state.ts)

```typescript
// Source: apps/relayer/src/routes/live-state.ts — mirror pattern
// GET /api/duels/:id/live-state
// Reads: ChallengeEscrow.getChallenge() + FFM.followReserve/fadeReserve + CR.getCall().expiry
// Redis cache 4s TTL (shorter than 5s frontend poll)

const CHALLENGE_ESCROW_ABI = [
  {
    type: 'function',
    name: 'getChallenge',
    inputs: [{ name: 'challengeId', type: 'uint256' }],
    outputs: [{ /* Challenge struct */ }],
    stateMutability: 'view',
  },
] as const;
```

### Pattern 8: Trending Duel Worker

```typescript
// Source: D-07 + D-08 [ASSUMED BullMQ repeatable pattern]
// Repeatable job every 60s:
//   1. Query subgraph: active duels with pot + backer count (followCount + fadeCount)
//   2. For each duel: if (pot >= 500_000_000 || backers >= 50) && !already_pinned:
//        INSERT INTO trending_duels (challenge_id, trending_until = now() + 4h)
//        ON CONFLICT (challenge_id) DO UPDATE SET trending_until = now() + 4h
//   3. DELETE FROM trending_duels WHERE trending_until < now()

// Backers = follow_count + fade_count on the parent call (D-06: "Riding" = follow/fade)
```

### Anti-Patterns to Avoid

- **Overage inside `claimDuelPayout` only (§12.3 step 8 as written):** The spec's step 8 buries overage inside `claimDuelPayout`. Per D-03, this strands a losing overcommitter. Always push overage at `settleDuel` time instead.
- **`getTvl()` using `USDC.balanceOf(address(this))`:** Unlike FollowFadeMarket (which IS the single-custodian), ChallengeEscrow must use its own `totalEscrow` counter so the 3-way cap math doesn't create double-counting pathways.
- **`revert` inside the push path for overage:** Using `safeTransfer` in `_pushOverage` would revert the entire `settleDuel` call if the push fails. Use `transfer` (bool return) or a try/catch pattern so `settleDuel` always succeeds and the failure falls into the `claimOverage` path.
- **`display: grid` in `/og/duel/[challengeId]/route.ts`:** Satori silently misrenders CSS Grid. The two-column duel card (§16.4) must be `display: flex; flex-direction: row` with two 50% flex-children. [CITED: PITFALLS.md Pitfall 15]
- **Single-accepted-per-call guard:** Do NOT add `require(activeChallengersPerCall[callId] == 0)`. Per D-09, many accepted duels per call are allowed.
- **Staking caps that apply to challengerStake per call (vs per challenge):** MAX_STAKE applies per challenge, not per "total challenger exposure." One challenger can propose multiple duels on different calls, each up to $100. The spec's per-call max stake ($100 in CallRegistry/FollowFadeMarket) is a separate constraint.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ReentrancyGuard | Custom mutex | `@openzeppelin/contracts/utils/ReentrancyGuard` | Audited; already imported everywhere in the project |
| Ownable2Step | Custom admin pattern | `@openzeppelin/contracts/access/Ownable2Step` | 2-step transfer prevents accidental ownership loss; pattern established |
| Pausable + carve-outs | Custom paused flag | `@openzeppelin/contracts/utils/Pausable` with explicit NOT wrapping claim/withdraw | Already the pattern in FFM |
| SafeERC20 | Raw USDC.transfer() | `SafeERC20.safeTransfer` / `safeTransferFrom` | Handles non-standard return values; already the pattern |
| Subgraph entity schema | Hand-write GraphQL types | `@entity(immutable:true/false)` + `@graphprotocol/graph-ts` native types | graph-cli enforces schema validity; quirks already documented (no closures, no null, explicit immutable) |
| BullMQ job scheduling | Raw cron/setInterval | `BullMQ` repeatable jobs | Pre-established in Phase 0; handles retries + Redis persistence + distributed dedup |
| Postgres schema migration | Raw SQL | Drizzle ORM + `db:migrate` via Fly proxy | Pattern established in Phase 2; 0002_rich_blur migration example |
| Viem server-side reads | Custom fetch of eth_call | `createPublicClient` with `readContracts` | Pattern established in relayer live-state.ts and OG route |
| CDN cache invalidation signal | Manual URL version tracking | `?v={statusVersion}` Redis-key pattern | Pattern established in Phase 2 D-09 |

---

## Runtime State Inventory

> Phase 3 deploys a new contract — no rename/refactor. This section notes the new runtime state being introduced.

| Category | Items Created | Action Required |
|----------|-------------|------------------|
| Stored contract state | ChallengeEscrow deployed to Arbitrum Sepolia; address written to addresses.ts + subgraph.yaml | Update `packages/shared/src/constants/addresses.ts` with `CHALLENGE_ESCROW_ARBITRUM_SEPOLIA` post-deploy |
| Live service config | Subgraph Studio: new data source must be added to subgraph.yaml before deploying | Set `startBlock` = ChallengeEscrow deploy block number |
| OS-registered state | None | — |
| Secrets/env vars | No new env vars required; relayer reads `CHALLENGE_ESCROW_ARBITRUM_SEPOLIA` from shared constants | None |
| Build artifacts | New `out/ChallengeEscrow.sol/ChallengeEscrow.json` ABI generated by `forge build` | Commit ABI to `packages/shared/src/abis/` or inline in relayer |

**Postgres migrations:** Two new tables (`trending_duels`, `duel_kings`) require a new Drizzle migration file (`0003_*`). Run via `fly proxy 5433:5432` tunnel per Phase 2 pattern. [VERIFIED: STATE.md "02-05 Fly Postgres migration"]

**SubgraphStudio:** The Phase 0 `challenge-escrow.ts` stub registered a block handler. After replacing with real event handlers, `graph build` must pass before `graph deploy:sepolia`. The stub's `handleBlock` export must be removed from `subgraph.yaml` when the real data source is added. [VERIFIED: packages/subgraph/src/challenge-escrow.ts]

---

## Common Pitfalls

### Pitfall A: Overage stranded in winner-only `claimDuelPayout` (Pitfall 21 manifestation)

**What goes wrong:** If the overage refund logic only lives inside `claimDuelPayout` (as the spec's §12.3 step 8 implies), the loser never calls `claimDuelPayout` (they can't — it reverts `NotDuelWinner`). Their overage stays in escrow permanently.

**Why it happens:** The spec is written from a winner's perspective in §12.3. The loser's overage path requires a separate function.

**How to avoid:** Push overage at `settleDuel` time (D-03). Provide `claimOverage(challengeId)` as a fallback. `UnclaimedOverageCreated` event allows the subgraph to track any outstanding amounts.

**Warning signs:** `totalEscrow` grows monotonically after many settled duels — indicates push failures accumulating.

### Pitfall B: 3-way TVL cap double-counting

**What goes wrong:** If ChallengeEscrow's `getTvl()` returns `USDC.balanceOf(address(this))` instead of `totalEscrow`, and the cap check also reads `callRegistry.currentTvl + followFadeMarket.getTvl()`, the overage that's been pushed out (or the 1% fee transferred to treasury) may be inconsistently counted.

**Why it happens:** `USDC.balanceOf(this)` changes the moment any USDC arrives; `totalEscrow` changes only on intended deposits/withdrawals. Using balance for ChallengeEscrow creates the same drift problem Pitfall 3 describes for FollowFadeMarket. [CITED: PITFALLS.md Pitfall 3]

**How to avoid:** ChallengeEscrow uses `totalEscrow` counter for its TVL contribution. FollowFadeMarket uses `USDC.balanceOf(this)` (correct — it's the single custodian). These are different patterns for different contracts.

### Pitfall C: `settleDuel` reverting on push-failure breaks the settlement

**What goes wrong:** Using `safeTransfer` in `_pushOverage` will revert the entire `settleDuel` call if the receiving address reverts on ERC-20 receive. Phase 4's SettlementManager calls `settleDuel` as part of a larger settlement sequence; a revert here would strand all settlements for the affected call.

**Why it happens:** `safeTransfer` uses `require(success)`. A malicious or broken wallet that reverts on token receipt will cause `settleDuel` to fail.

**How to avoid:** Use `IERC20(USDC).transfer(overcommitter, overage)` (bool return) in `_pushOverage`. Handle `false` return by recording `UnclaimedOverage`. This is the push-pull pattern per D-03. [CITED: D-03 + Pitfall 21]

### Pitfall D: Many accepted duels multiplying caller stake lockup silently

**What goes wrong:** With D-09 (many accepted duels per call), the caller who accepts N challengers at max stake ($100 each) can lock up N × $100 in ChallengeEscrow, all counted toward the $5K TVL cap. If the `acceptChallenge` function doesn't check the TVL cap, the 3-way aggregated TVL can silently exceed the cap.

**Why it happens:** The TVL cap check in `proposeChallenge` happens when there's only one challenger's stake. The cap can change between propose and accept.

**How to avoid:** `acceptChallenge` MUST also call `_checkTvlCap` with the caller's matching stake as `incoming`. If the cap fills between propose and accept, `acceptChallenge` reverts `TvlCapReached`; the challenger recovers via `claimRefund` after the 24h window (D-05 edge case, explicitly documented in context).

### Pitfall E: Phase 0 stub block handler conflicting with real event handlers

**What goes wrong:** The Phase 0 `challenge-escrow.ts` exports `handleBlock` and `subgraph.yaml` may have a block-handler data source for ChallengeEscrow. When the real contract is deployed and real event handlers are added, having a block handler alongside event handlers can cause `graph deploy` to fail or create duplicate processing.

**Why it happens:** The Phase 0 stub was a no-op block handler to satisfy graph-cli validation. It must be explicitly replaced.

**How to avoid:** Remove the `handleBlock` export and the block-handler data source entry from `subgraph.yaml` entirely when adding the real ChallengeEscrow data source with event handlers. [VERIFIED: packages/subgraph/src/challenge-escrow.ts]

### Pitfall F: `display: grid` in variant-3 OG card for two-column duel layout

**What goes wrong:** The two-column CALLER / VS / CHALLENGER layout is the natural CSS Grid use case. Using `display: grid` or `gridTemplateColumns` in the JSX template causes Satori to silently drop those elements. The card renders at full 1200×630 with missing elements. [CITED: PITFALLS.md Pitfall 15]

**How to avoid:** Use `display: flex; flex-direction: row` for the outer two-column container. Each column is a `flex: 1` flex child. The VS divider is an absolutely-positioned or flex-gap element. **Lint rule:** `grep -r "display.*grid\|gridTemplate" apps/web/app/og/duel/` must return 0 results.

---

## Code Examples

### ChallengeEscrow Constructor Shape

```solidity
// Source: D-04 + existing contract patterns in codebase [ASSUMED structure]
constructor(
    ICallRegistry _callRegistry,
    IFollowFadeMarket _followFadeMarket,
    address _usdc,          // must equal USDC_ARB_NATIVE (asserted)
    address _treasury,
    uint256 _tvlCap
) Ownable(msg.sender) {
    require(_usdc == USDC_ARB_NATIVE, "wrong-usdc");
    require(_tvlCap <= MAX_ALLOWED_CAP, "cap-too-high");
    callRegistry = _callRegistry;
    followFadeMarket = _followFadeMarket;
    treasury = _treasury;
    tvlCap = _tvlCap;
    nextChallengeId = 1; // burn 0
}
```

### `/og/duel/[challengeId]/route.ts` skeleton

```typescript
// Source: apps/web/app/og/[callId]/route.ts — mirror pattern [VERIFIED codebase]
export const runtime = 'nodejs'; // CRITICAL — NOT 'edge'. Pitfall 15 + T-02-09-02 mirror.

// Two-column layout — ALL flex, NEVER grid (Satori limitation per Pitfall 15)
// Layout:
//   Row: [ CALLER column | VS divider | CHALLENGER column ]
//   Each column: flexbox column with name, rep, stake, accuracy, streak
//   WINS (Syne font) centered in VS divider — populated only when settled (D-11 stub)
//   Footer: pot amount, corner brackets

// Settled fields stubbed until Phase 4 (D-11):
//   winner highlight (full opacity) vs loser (40% opacity) — stub: both full opacity
//   rep deltas (±N REP) — stub: "? REP"
//   "WINS" text — stub: "VS" (same as pre-settle)
```

### CeTestHelper — extending FfmTestHelper

```solidity
// Source: FfmTestHelper.sol pattern [ASSUMED extension]
abstract contract CeTestHelper is FfmTestHelper {
    ChallengeEscrow internal ce;

    function setUp() public virtual override {
        super.setUp();
        vm.startPrank(owner);
        ce = new ChallengeEscrow(
            ICallRegistry(address(registry)),
            IFollowFadeMarket(address(ffm)),
            USDC_ARB_NATIVE,
            treasury,
            5_000e6
        );
        vm.stopPrank();
    }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Spec §12.3 step 8 overage inside `claimDuelPayout` | D-03 push-then-claim at `settleDuel` | Phase 3 design (2026-06-01) | Prevents losing-overcommitter stake stranding; Pitfall 21 mitigated |
| Spec assumed singular "a duel" per call | D-09 many accepted duels per call | Phase 3 design (2026-06-01) | Multiplies caller stake exposure; Phase 4 settlement must loop; TVL cap must be checked at accept |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `getTvl()` uses `totalEscrow` counter (not `USDC.balanceOf(this)`) | Standard Stack, Pattern 2 | Double-counting in 3-way cap could let TVL exceed $5K silently |
| A2 | `_pushOverage` uses `IERC20.transfer()` (bool) not `safeTransfer` (revert) | Pattern 4 | If wrong: push-failure would revert `settleDuel` entirely, blocking Phase 4 settlement |
| A3 | `claimed` flags split per-side (`callerClaimed`, `challengerClaimed`) vs. single `claimed` | Pattern 5 | A single `claimed` flag would allow winner to claim once and block the overage/fallback accounting |
| A4 | `nextChallengeId` starts at 1, burns 0 | Pattern 1 | If 0 is a valid challengeId, mappings that return 0 for missing keys would be ambiguous |
| A5 | Trending worker pins/extends on every qualifying check (4h from NOW, not from first pin) | Pattern 8 | If a duel that keeps qualifying gets reset to 4h every minute, it pins longer than 4h; acceptable per D-07 |
| A6 | `duel_kings` Postgres table stores a single row (or one row per week) | Relayer section | If wrong: king display could be ambiguous; low risk, easily fixed |
| A7 | Overage push uses `emit UnclaimedOverageCreated` as the failure signal; subgraph watches this event | Subgraph section | If event name changes in implementation, subgraph handler must be updated |

---

## Open Questions

1. **`callerStake` locking at `acceptChallenge` — where is it pulled from?**
   - What we know: The caller accepts a challenge; their matching stake (up to the challenger's stake) must be pulled at `acceptChallenge` time, NOT at `proposeChallenge` time (they haven't agreed yet).
   - What's clear: `acceptChallenge` calls `safeTransferFrom(caller, address(this), callerStake)` — caller must have approved ChallengeEscrow before accepting.
   - Planner action: Include an `approve` step in the accept flow; document in the frontend challenge form that accepting requires a USDC approval transaction.

2. **`tvlCap` storage in ChallengeEscrow — same as CR's or separate?**
   - What we know: D-04 says ChallengeEscrow enforces the $5K cap; the cap is a system-wide parameter. CR's `tvlCap` is owner-settable.
   - Recommendation: ChallengeEscrow reads `callRegistry.tvlCap` as the canonical cap rather than storing its own copy. This avoids the race condition where the owner sets different caps on different contracts. [ASSUMED — planner should confirm]

3. **Subgraph data source `startBlock` for ChallengeEscrow**
   - What we know: Must be the exact Arbitrum Sepolia block number of the ChallengeEscrow deployment (determined during DeployPhase3.s.sol execution).
   - What's unclear: The block number is not known until deploy runs.
   - Recommendation: DeployPhase3.s.sol should print the deploy block; update `subgraph.yaml` immediately after deploy; commit as part of the deploy plan wave.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Foundry (forge) | ChallengeEscrow.t.sol tests | ✓ (pre-established) | nightly | — |
| Arbitrum Sepolia RPC | `DeployPhase3.s.sol` | ✓ (env var ARBITRUM_SEPOLIA_RPC_URL) | Alchemy | — |
| Fly Postgres | New `trending_duels` + `duel_kings` migration | ✓ (deployed Phase 2) | `call-it-pg-sepolia` via `fly proxy 5433:5432` | — |
| Redis | BullMQ trending worker | ✓ (pre-established) | 7.x | — |
| Subgraph Studio deploy key | `graph deploy:sepolia` | ✗ — SUBGRAPH_DEPLOY_KEY not set (Phase 2 plan 02-06 still open) | — | Close 02-06 first, then reuse same key |
| graph-cli | `graph build` + `graph deploy` | ✓ (pre-established, 0.98.1) | 0.98.1 | — |

**Missing dependencies with no fallback:**
- Subgraph Studio deploy key (`SUBGRAPH_STUDIO_DEPLOY_KEY`) — Phase 2 plan 02-06 is the one remaining open plan. Phase 3 subgraph deploy REQUIRES this key. The planner must include "close 02-06 first OR verify key is available" as a Wave 0 prerequisite.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Foundry (forge) + Vitest (parity gate) |
| Config file | `packages/contracts/foundry.toml` (fuzz ci = 1000 runs) |
| Quick run command | `forge test --match-contract ChallengeEscrow -v` |
| Full suite command | `forge test --match-contract 'ChallengeEscrow\|TvlAggregation' --profile ci -v` |
| Vitest parity | `pnpm --filter @call-it/web test --run challenge-gates` |

### Success Criteria → Test Map

| Success Criterion | Req IDs | Test Type | Tool | Observable Signal |
|-------------------|---------|-----------|------|-------------------|
| 1. proposeChallenge against Live+openToChallenges; SelfChallenge revert; asymmetric pot | SOCIAL-29..33 | Foundry unit | `forge test --match-contract ChallengeEscrowGates` | All reverts fire on correct conditions; pot = min(a,b)*2 verified |
| 2. 24h window; claimRefund; overage push + fallback; UnclaimedOverage subgraph entity | SOCIAL-34..36, Pitfall 21 | Foundry unit + subgraph assertion | `forge test --match-contract ChallengeEscrow -v` | `UnclaimedOverageCreated` event fires on push failure; `claimOverage` succeeds |
| 3. claimDuelPayout idempotent + NotDuelWinner; CEI; subgraph events | SOCIAL-38..39, SOCIAL-48 | Foundry unit + Vitest parity | `forge test --match-function testClaimPayout` | AlreadyClaimed on second call; NotDuelWinner for non-winner |
| 4. Duel page /duel/[id]: hero, two-column card, MARKET CONSENSUS bar, Riding, Side-with CTAs | UI-11 | Visual / manual Sepolia smoke | Browser + local dev | Page renders all sections; live stats update on ~5s poll |
| 5. Trending Duel auto-promotion; Duel King badge machinery; Duels tab filter chips | SOCIAL-40..42 | Relayer integration | Manual Sepolia seed + DB query | `trending_duels` row created; badge shows placeholder on profile |
| 6. Duel Settled OG card variant 3 (stubbed settled fields) | SOCIAL-51, SHARE-07 | Visual + Node runtime | `curl /og/duel/[id]` | 200 response; `X-Variant: duel-active`; no `display:grid` in source |

### Phase Requirements → Test Map (Foundry automated)

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SOCIAL-29 | proposeChallenge reverts CallerNotOpenToChallenges | unit | `forge test --match-test testProposeRevertsNotOpen` | ❌ Wave 0 |
| SOCIAL-32 | SelfChallenge revert | unit | `forge test --match-test testSelfChallengeBanned` | ❌ Wave 0 |
| SOCIAL-33 | CallNotChallengeable when not Live or past expiry | unit | `forge test --match-test testChallengeNotLive` | ❌ Wave 0 |
| SOCIAL-34 | AcceptanceWindowExpired after 24h | unit | `forge test --match-test testWindowExpired` | ❌ Wave 0 |
| SOCIAL-35 | rejectChallenge refunds immediately | unit | `forge test --match-test testRejectRefunds` | ❌ Wave 0 |
| SOCIAL-38 | AlreadyClaimed on second claimDuelPayout | unit | `forge test --match-test testClaimIdempotent` | ❌ Wave 0 |
| SOCIAL-39 | NotDuelWinner for non-winner | unit | `forge test --match-test testClaimNotWinner` | ❌ Wave 0 |
| D-04 TVL cap | TvlCapReached on proposeChallenge + acceptChallenge | unit | `forge test --match-test testTvlCap3Way` | ❌ Wave 0 |
| D-03 overage | UnclaimedOverageCreated on push failure | unit | `forge test --match-test testOveragePushFail` | ❌ Wave 0 |
| Pitfall 21 | claimOverage returns correct overage to loser-overcommitter | unit | `forge test --match-test testClaimOverageLosing` | ❌ Wave 0 |

**Property fuzz invariants (Foundry fuzz, ci profile = 1000 runs):**
- Overage conservation: `callerStake + challengerStake == pot + overage` always holds
- Escrow accounting: after every operation, `totalEscrow == sum(all active challenge stakes)`
- Payout ceiling: `payout <= pot * 99 / 100` (never exceeds 99% of pot)
- No zero-value overage: `claimOverage` is a no-op if stakes were equal

### Vitest Parity (D-29) — Challenge Gate Parity

Per D-29 (Phase 1), Foundry gates have Vitest equivalents for the challenge-specific gates:

```
packages/contracts/test/ChallengeEscrowParity.t.sol  → Foundry
packages/web/src/__tests__/challenge-gates.test.ts    → Vitest (Wave 0 gap)
```

Parity covers: stake bounds (MIN_STAKE $5 / MAX_STAKE $100), self-challenge ban, acceptance window check, `openToChallenges` flag.

### Sampling Rate
- Per task commit: `forge test --match-contract ChallengeEscrow -v`
- Per wave merge: `forge test --match-contract 'ChallengeEscrow|TvlAggregation' --profile ci`
- Phase gate: Full suite green + `/duel/[id]` Sepolia smoke + OG card 200 response before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/contracts/src/ChallengeEscrow.sol` — the contract itself
- [ ] `packages/contracts/src/interfaces/IChallengeEscrow.sol` — LOCKED interface per §12.3
- [ ] `packages/contracts/test/ChallengeEscrow.t.sol` — full test matrix
- [ ] `packages/contracts/test/ChallengeEscrowGates.t.sol` — gate + parity tests
- [ ] `packages/contracts/test/helpers/CeTestHelper.sol` — extends FfmTestHelper
- [ ] `apps/web/src/__tests__/challenge-gates.test.ts` — Vitest parity
- [ ] Drizzle migration `0003_*` — trending_duels + duel_kings tables
- [ ] Framework install: none needed — all pre-established

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | ChallengeEscrow is permissionless propose/accept; settlement guarded by `onlySettlementManager` |
| V3 Session Management | No | On-chain contract; no sessions |
| V4 Access Control | Yes | `onlySettlementManager` for `settleDuel`; `onlyOwner` for `setSettlementManager`; winner-only `claimDuelPayout`; overcommitter-only `claimOverage` |
| V5 Input Validation | Yes | Stake bounds (MIN/MAX_STAKE); callId validity; challengeId validity; status checks at every function entry |
| V6 Cryptography | No | No signing in ChallengeEscrow itself; USDC transfer uses established SafeERC20 |

### Known Threat Patterns for ChallengeEscrow + Duel UI

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Griefing via revert-on-receive in `_pushOverage` | Denial of Service | `transfer()` bool return + `claimOverage` fallback (D-03) |
| Self-challenge rep farming / Duel King gaming | Spoofing | `SelfChallenge` revert: `require(msg.sender != call.caller)` |
| Double-claim via re-entrancy in `claimDuelPayout` | Tampering | ReentrancyGuard + CEI (mark claimed BEFORE transfer) |
| TVL cap bypass by proposing then accepting multiple duels | Elevation of Privilege | `acceptChallenge` must call `_checkTvlCap` for caller's matching stake |
| Stale challenge after call expires but status stays Live | Tampering | `proposeChallenge` gate: `require(call.status == Live && block.timestamp < call.expiry)` |
| Phase 0 stub block handler conflicting with real handlers | Denial of Service | Remove block handler from subgraph.yaml when adding real data source |
| `display:grid` in OG card | Tampering (receipt integrity) | Lint rule + grep guard: `grep -r "display.*grid" apps/web/app/og/duel/` must return 0 |
| Wrong USDC address in ChallengeEscrow constructor | Tampering | Constructor asserts `_usdc == USDC_ARB_NATIVE`; CI grep guard blocks USDC.e address |

---

## Sources

### Primary (HIGH confidence)
- `packages/contracts/src/CallRegistry.sol` — `markSettled` authorization pattern (lines 410–449), `setSettlementManager`, constructor shape
- `packages/contracts/src/FollowFadeMarket.sol` — TVL pattern, `getTvl()`, Ownable2Step + Pausable + ReentrancyGuard imports, pause carve-outs
- `packages/contracts/src/interfaces/IFollowFadeMarket.sol` — interface structure to mirror for `IChallengeEscrow`
- `packages/contracts/test/helpers/FfmTestHelper.sol` — test helper base to extend for `CeTestHelper`
- `packages/contracts/test/TvlAggregation.t.sol` — TVL boundary test patterns (lines 1–173)
- `packages/contracts/foundry.toml` — `=0.8.30` pin + fuzz profile
- `apps/relayer/src/db/schema.ts` — Drizzle schema patterns (notifications table, WR-05 uniqueIndex)
- `apps/relayer/src/routes/live-state.ts` — duel live-state route pattern
- `apps/web/app/og/[callId]/route.ts` — OG route pattern (Node runtime, flexbox, renderFallback)
- `packages/subgraph/src/challenge-escrow.ts` — Phase 0 stub (to be replaced)
- `.planning/phases/03-challengeescrow/03-CONTEXT.md` — all D-01..D-11 locked decisions
- `.planning/research/PITFALLS.md` — Pitfall 3 (TVL aggregation), Pitfall 15 (Satori grid), Pitfall 21 (overage push)
- `.planning/STATE.md` — accumulated decisions (Solidity pin, USDC constant, Phase 2 deploy addresses)
- `CLAUDE.md` — full stack with pinned versions, USDC address, constraints

### Secondary (MEDIUM confidence)
- `.planning/research/ARCHITECTURE.md` — component boundaries, relayer architecture diagram
- `.planning/REQUIREMENTS.md` — SOCIAL-29..51, UI-11, SHARE-07 text (authoritative requirement IDs)

### Tertiary (LOW confidence)
- None — all research findings are grounded in the existing codebase or locked CONTEXT.md decisions.

---

## Project Constraints (from CLAUDE.md)

- **Solidity pin:** `=0.8.30` exact (NOT `^0.8.24`). CI grep guard enforces.
- **USDC address:** `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` hardcoded, never inline literals. CI grep guard blocks USDC.e.
- **Non-upgradeable by design (SAFETY-18):** ChallengeEscrow must NOT use a proxy or `initialize()`.
- **CEI order (SAFETY-05..09):** State writes ALWAYS precede safeTransferFrom/safeTransfer.
- **Pause carve-outs (§10.3):** `claimDuelPayout` and `claimOverage` must NOT be guarded by `whenNotPaused`. `proposeChallenge` and `acceptChallenge` ARE guarded.
- **No delegatecall to user-controlled addresses (§10.5).**
- **`export const runtime = 'nodejs'` in every OG route file** — NOT 'edge'.
- **No `display: grid` in any Satori/OG template** — flexbox only.
- **Single source of truth for addresses** in `packages/shared/src/constants/addresses.ts`. Never inline contract addresses in route files.
- **Ownable2Step over Ownable** for all new contracts.
- **ReentrancyGuard on all USDC transfer paths.**
- **The Graph Decentralized Network** (not Hosted Service) — Subgraph Studio → Sepolia Studio deploy.
- **Sepolia staging gate (SAFETY-21): ≥48h on Arbitrum Sepolia** with seeded duels before mainnet.
- **Network: Arbitrum mainnet only** (hardcoded in v1). Phase 3 deploys to Arbitrum Sepolia as staging.

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all libraries pre-established in codebase; no new dependencies
- Architecture: HIGH — ChallengeEscrow mirrors established Solidity patterns; off-chain mirrors Phase 2 patterns
- Contract patterns (overage, TVL cap, CEI): HIGH for design decisions (locked in CONTEXT.md); MEDIUM for exact struct shapes (discretion area marked as ASSUMED)
- Subgraph: HIGH — Phase 0 stub already anticipated the exact entities and event names
- Frontend/OG: HIGH — direct mirror of Phase 2 patterns; Pitfall 15 flexbox constraint well-established
- Pitfalls: HIGH — Pitfalls 3, 15, 21 directly apply; all documented with exact mitigations

**Research date:** 2026-06-01
**Valid until:** 2026-07-01 (stable stack; no fast-moving external dependencies added)
