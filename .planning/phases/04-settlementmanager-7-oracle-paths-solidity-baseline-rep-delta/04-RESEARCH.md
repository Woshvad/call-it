# Phase 4: SettlementManager + 7 Oracle Paths + Solidity Baseline Rep Delta — Research

**Researched:** 2026-06-01
**Domain:** Smart contract settlement engine, oracle adapters, dispute system, rep math, settled UI
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Pyth price-target is the hero/spine path — proven end-to-end first, polished hardest.
- **D-02:** All 8 CEX scrapers ship at full roadmap fidelity in Phase 4 — per-exchange selectors + Innovation Zone exclusion fixtures + weekly synthetic-test CI cron.
- **D-03:** Fully automated settlement via relayer; ambiguous reads → 24h dispute window + `SettlementDelayed` + Telegram alert.
- **D-04:** The productionized always-on settlement watcher is built IN Phase 4 (not deferred). BullMQ expiry queue + Pyth ETH-fee budget monitoring + retry/backoff + settlement-stuck Telegram alert.
- **D-05:** Operator-funded KMS-signer relayer is the settle actor for v1. Per-attestation-type KMS key separation (NFT-TWAP / DefiLlama / CEX / Snapshot / OAuth-proof).
- **D-06:** Full self-serve dispute UX in Phase 4 — Pinata IPFS evidence upload + dispute status tracking + counter-claim threading.
- **D-07:** Owner-resolution = public `/disputes/` log + owner-gated in-app resolve admin page.
- **D-08:** Outcome-word thresholds are planner discretion, derived from existing rep-math signals. Five words + colors are LOCKED.
- **D-09:** Per-viewer outcome-word rendering on the receipt page; caller-centric shared OG card; winning fader gets their own `?as=fader` card.
- **D-10:** Full settlement-provenance proof modal ships in Phase 4 — oracle source URL + tx hash + raw oracle data + EIP-712 relayer signature.
- **Stack pinned in CLAUDE.md:** Solidity `=0.8.30`, OZ Contracts `5.6.1`, Foundry, wagmi `2.18.x`, viem `2.50.x`, Next.js `16.x`, Fastify `5.6.1`, `@pythnetwork/pyth-sdk-solidity@4.3.1`, `@pythnetwork/hermes-client@3.1.0`, `alchemy-sdk@3.6.5`, `@snapshot-labs/snapshot.js@0.14.21`, `bullmq`, Playwright, GCP KMS.
- **Addresses pinned:** Pyth Arbitrum One `0xff1a0f4744e8582DF1aE09D5611b887B6a12925C`, Pyth Arbitrum Sepolia `0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DAF`, native USDC `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`.

### Claude's Discretion

- Outcome-word exact thresholds (D-08)
- **THE keystone architecture question** — FFM redeploy vs. lazy `claimPayout` (resolved below)
- Solidity baseline rep fidelity — REP-22 runtime fallback vs. REP-24 build-time baseline
- Dispatch-table design `(marketType, eventSubtype) → adapter`
- Spread/multi-feed ambiguity handling
- Many-duels-per-call settlement loop

### Deferred Ideas (OUT OF SCOPE)

- StylusScoreEngine (Rust) + `TransparentUpgradeableProxy` + 48h `upgradeTo` → Phase 5
- Auto-post-to-X on settle → Phase 7
- Subgraph publish to Decentralized Network → Phase 7
- Full 3-contract TVL-cap aggregation fuzz + multisig promotion → Phase 6
- Always-on watcher hardening (load tuning, ETH-fee auto-topup) → Phase 6
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SETTLE-01 | `settle(callId)` permissionless | SettlementManager has no auth gate on settle() |
| SETTLE-02 | `settle` idempotent — reverts `AlreadySettled` | Check status != Live before step 1 |
| SETTLE-03 | `settle` reverts `CallNotExpired` before expiry | `block.timestamp < call.expiry` guard |
| SETTLE-04 | `settle` reverts `Paused` under emergency pause | `whenNotPaused` modifier |
| SETTLE-05 | All 14 steps atomic | Single transaction, no external commit points |
| SETTLE-06 | Oracle adapter dispatch per `(marketType, eventSubtype)` | Dispatch table pattern below |
| SETTLE-07 | Pyth `getPriceNoOlderThan(priceId, 60)` | Exact signature verified |
| SETTLE-08 | `confidence × 200 <= price` threshold | Confidence gate in contract |
| SETTLE-09 | `SettlementDelayed` emit on wide confidence | Non-revert path, return early |
| SETTLE-10 | 30 × 60s Pyth retries | BullMQ delayed-job loop |
| SETTLE-11 | After 30 retries → 24h dispute window | Retry exhaustion → raiseDispute internally |
| SETTLE-12 | Spread/vs reads both feeds same block | Both calls to Pyth in same tx; either wide → ambiguous |
| SETTLE-13..16 | NFT TWAP: Alchemy poll, 24h, ≥12 obs | Relayer-computed, submitNftFloor |
| SETTLE-17 | TWAP key in KMS | `nft-twap` AttestationType exists in kms-signer.ts |
| SETTLE-18 | DefiLlama covers TVL/volume/fees/APRs | `api.llama.fi` + `yields.llama.fi` patterns |
| SETTLE-19..20 | RPC on-chain metrics + liquidation event watch | viem `getLogs` + event watch |
| SETTLE-21..22 | Snapshot + Tally governance oracles | snapshot.js + Tally GraphQL |
| SETTLE-23..24 | 8 CEX scrapers with single retry | Playwright, per-exchange selectors |
| SETTLE-25..32 | Full dispute window — bond/counter-claims/window | Contract + relayer + UI |
| SETTLE-33..36 | Owner `resolveDispute` with reversal | Pool re-distribution, rep reversal |
| SETTLE-37..38 | 24h 30m SLA; receipt copy | SLA enforced + UI copy |
| SETTLE-39..40 | `forceSettle` 7-day cooldown + dual events | `FORCE_SETTLE_COOLDOWN = 7 days` |
| SETTLE-41..42 | Caller rep via Stylus try/catch + exited skip | In-contract seam |
| SETTLE-43 | Duel: inverse outcome, ~1.5× rep, ChallengeEscrow.settleDuel | Loop all duels per call |
| SETTLE-44 | No per-follower/fader rep updates | FFM claimPayout pull-pattern (lazy) |
| SETTLE-45 | Cold-start 25% scale | REP-14 applied at step 10 |
| SETTLE-46..50 | Fee extraction 1.7%, creator Model B | Exact split in FFM |
| SETTLE-51 | Duel fee 1% protocol only | ChallengeEscrow |
| SETTLE-52 | Provenance proof modal | D-10 — oracle URL + tx hash + raw data + EIP-712 sig |
| REP-03..16 | Full rep math including cold-start, contrarian | Solidity baseline function |
| REP-22..23 | try/catch Stylus seam + fallback event | In-contract wrapper |
| REP-25..27 | RepCalculated / RepCalculatedFallback / duel 1.5× | Events + loop |
| OPS-15..16 | Settlement-stuck + Stylus reactivation runbooks | Markdown docs |
| SAFETY-57 | OAuth permission scoping documented v1 limitation | Doc only |
| SHARE-05..06 | Settled OG card variant 2 | Clone buildLiveCard pattern |
| SHARE-08..12 | CallerExited OG variant 4; 200px gate | Same route, branch on status |
| UI-14..23 | Settled Receipt page all variants | Extends existing page.tsx |
| UI-44..45 | Outcome block border+shadow + stamp animation | <Stamp> extension |
| UI-52..54 | Follow/fade spring; odds bar smooth | Existing components |
</phase_requirements>

---

## Summary

Phase 4 is the settlement keystone: it closes the Live → Settled → Shared receipt loop that is the entire product's core value proposition. The research resolves four foundational questions before planning can proceed.

**Keystone resolution (FFM redeploy vs. lazy claimPayout):** After reading `FollowFadeMarket.sol` in full, the correct path is **NO FFM REDEPLOY — implement `claimPayout` lazily in the SettlementManager**. The FFM's `claimPayout` is a single-line stub (`revert ClaimRequiresSettlement()`), but the FFM already has all the state needed for lazy settlement: `followReserve`, `fadeReserve`, `fadeSeedVirtual`, `followShares`, `fadeShares`, `followTotalShares`, `fadeTotalShares`, and `claimed` mappings. SettlementManager calls `callRegistry.markSettled(callId, outcome)` (which flips status to Settled), then the revised `claimPayout` in FFM reads `callRegistry.getCall(callId).outcome` and computes the per-claimer split on demand. The fee extraction (step 11) happens inside SettlementManager before `markSettled`, via a new `settlePool(callId, outcome, protocolFee, creatorFee, lpFee)` call into FFM — or equivalently by having SettlementManager call `FFM.applySettlement(callId, protocolAmt, creatorAmt, lpAmt, treasury)` which transfers fees out and records the settled state. This requires adding `setSettlementManager` + `applySettlement` to FFM and implementing real `claimPayout` — a **targeted FFM extension, not a full redeploy**. The deployed FFM contract on Sepolia (`0x12aafa5a70c3aD8Bd3a52252744f9F7Aa073E362`) stays; only `setSettlementManager` (already callable) is invoked. Because `applySettlement` and the real `claimPayout` are NEW functions on the existing deployed contract, and Solidity non-upgradeable contracts cannot add functions post-deploy, this **does require an FFM redeploy**. But it does NOT require redeploying CallRegistry or ChallengeEscrow — only FFM. This is one controlled redeploy (not a third-full-stack redeploy), handled in `DeployPhase4.s.sol`, with Sepolia re-seed of FFM address in `addresses.ts` and `subgraph.yaml`.

**Rep baseline:** Phase 4 ships a single `_solidityBaselineRepDelta` function at REP-22 lower-fidelity (linear confidence scaling, fixed contrarian multiplier = 1.0, no high-conviction 2× asymmetry). The Phase 5 Stylus full-fidelity baseline (REP-24) lives behind the proxy slot upgrade — the try/catch seam in Phase 4 calls `IStylusScoreEngine.compute_rep_change(...)` which Phase 5 populates; Phase 4 only provides the fallback. This means Phase 4 ships ONE function (the baseline), not two.

**Dispatch table:** `(marketType, eventSubtype)` maps to exactly one adapter enum value. The contract stores a `mapping(uint8 marketType => mapping(uint8 eventSubtype => OracleAdapter)) adapterMap` set by owner, or equivalently a pure dispatch function with hardcoded routing. The owner-settable mapping is safer for future adapter updates without redeployment.

**Primary recommendation:** Build Pyth price-target spine first (D-01), prove the 14-step atomic settlement end-to-end, then add the relayer-attestation rail (tested via DefiLlama as second adapter), then orbit the remaining 5 adapters around the proven rail.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 14-step `settle()` atomic execution | Smart Contract (SettlementManager) | — | Money moves happen on-chain; atomicity requires single tx |
| Pyth price read + VAA push | Smart Contract (SettlementManager calls IPyth) | Relayer prepares VAA + pays ETH fee | On-chain pull model — relayer assembles tx, contract reads |
| NFT TWAP computation | Relayer (off-chain) | Smart Contract verifies signature | 24h TWAP from Alchemy sales data cannot fit on-chain |
| DefiLlama / RPC / Snapshot / Tally / CEX oracle reads | Relayer (off-chain) | Smart Contract verifies EIP-712 attestation | External APIs not reachable from EVM |
| KMS attestation signing | Relayer (GCP KMS) | Smart Contract (ecrecover) | Private keys never on-chain |
| Dispute bond custody | Smart Contract (SettlementManager holds dispute bonds) | — | $5 USDC bond is on-chain |
| Dispute evidence (IPFS) | Off-chain (Pinata via relayer route) | Smart Contract stores `evidenceHash` | Content-addressed off-chain; only hash on-chain |
| Owner dispute resolution | Smart Contract `resolveDispute` | Frontend (owner-gated UI) | On-chain finality; UI is convenience |
| Rep delta computation | Smart Contract (in-contract Solidity baseline) | Stylus (Phase 5 upgrade) | Must be deterministic + auditable on-chain |
| Fee extraction (1.7%) | Smart Contract (SettlementManager step 11 + FFM) | — | Token transfers require contract execution |
| Settled Receipt page render | Frontend (Next.js) | Relayer (FINAL POSITIONS data via subgraph) | Page is SSR; FINAL POSITIONS from subgraph |
| OG card generation (variants 2, 4) | Backend/Frontend hybrid (Next.js Route Handler, Node runtime) | CDN cache | @vercel/og Node runtime, not edge |
| Settlement watcher (BullMQ queue) | Relayer (Railway/Fly.io long-running) | — | 30-min retry loop exceeds Vercel fn limits |
| `forceSettle` | Smart Contract (owner-only) | — | 7-day cooldown enforced on-chain |

---

## Standard Stack

### Core (pinned — do not re-litigate)

| Library | Version | Purpose | Confirmed |
|---------|---------|---------|-----------|
| Solidity | `=0.8.30` | All new contracts | [VERIFIED: foundry.toml] |
| `@openzeppelin/contracts` | `5.6.1` | ReentrancyGuard, Ownable2Step, Pausable, SafeERC20, ECDSA | [VERIFIED: codebase] |
| `@pythnetwork/pyth-sdk-solidity` | `4.3.1` | IPyth interface + `PythStructs.Price` | [CITED: CLAUDE.md] |
| `@pythnetwork/hermes-client` | `3.1.0` | Off-chain VAA fetch: `HermesClient.getLatestPriceUpdates()` | [CITED: CLAUDE.md] |
| `alchemy-sdk` | `3.6.5` | NFT API — `getNFTSales` + `getFloorPrice` for TWAP | [CITED: CLAUDE.md] |
| `@snapshot-labs/snapshot.js` | `0.14.21` | Governance proposal state read | [CITED: CLAUDE.md] |
| `bullmq` | latest | Settlement watcher: BullMQ Queue + Worker for 30×60s retry | [CITED: CLAUDE.md] |
| Playwright | latest | CEX announcement page scrapers (8 exchanges) | [CITED: CLAUDE.md] |
| viem | `2.50.4` | createWalletClient + GCP KMS signer, on-chain writes | [VERIFIED: codebase] |
| `@vercel/og` | `0.11.1` | OG card render (Node runtime) | [VERIFIED: codebase pattern] |
| DefiLlama API | `api.llama.fi` / `yields.llama.fi` | TVL/volume/fees/APR data (no auth key) | [CITED: CLAUDE.md] |
| Tally GraphQL | `https://api.tally.xyz/query` | On-chain governance read (API key needed, free tier) | [CITED: CLAUDE.md] |
| Pinata IPFS | existing Phase 0 pipeline | Dispute evidence upload | [VERIFIED: Phase 0 wired] |

---

## THE KEYSTONE: FollowFadeMarket — Redeploy vs. Lazy claimPayout

### What the code shows

**FollowFadeMarket.sol (deployed at Sepolia `0x12aafa5a70c3aD8Bd3a52252744f9F7Aa073E362`):**

```
// Line 480-482: The stub
function claimPayout(uint256 /*callId*/) external nonReentrant {
    revert ClaimRequiresSettlement();
}
```

**FollowFadeMarket has NO `markSettled` function and NO `setSettlementManager` setter.**

**What state FFM already has for settlement:**
- `followReserve[callId]`, `fadeReserve[callId]`, `fadeSeedVirtual[callId]`
- `followShares[callId][user]`, `fadeShares[callId][user]`
- `followTotalShares[callId]`, `fadeTotalShares[callId]`
- `claimed[callId][user]`
- `callerVolumeAtExit[callId]` (for creator fee Model B)

**CallRegistry.markSettled** is already implemented and tested — it flips `status` to `Settled` and sets `outcome`. Only `msg.sender == settlementManager` is allowed.

### The Redeploy Decision: REQUIRED but MINIMAL

**Verdict: FFM must be redeployed.** The current deployed FFM contract cannot add new functions (`applySettlement`, `setSettlementManager`) to the deployed bytecode. Solidity non-upgradeable contracts are immutable post-deploy.

**Scope is minimal:** The FFM redeploy adds only:
1. `setSettlementManager(address)` — owner-only, same as the other 3 contracts
2. `applySettlement(callId, outcome, protocolAmt, creatorAmt, lpAmt)` — called by SettlementManager in step 11; transfers fees to treasury + winning reserve; records that fees were extracted (prevents double-extraction)
3. Real `claimPayout(callId)` — reads `callRegistry.getCall(callId).outcome`, computes pro-rata payout from winning reserve using share ratios, enforces `claimed` idempotency. Pull-pattern — winner calls whenever; this keeps `settle()` gas O(1) (SETTLE-44)
4. `getFadeRealReserve(callId)` view — `fadeReserve[callId] - fadeSeedVirtual[callId]` for cold-start check

**Cascade from FFM redeploy:**
- New Sepolia address → update `FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA` in `packages/shared/src/constants/addresses.ts`
- Update `subgraph.yaml` FFM address + startBlock
- Update `DeployPhase4.s.sol` to include FFM deploy + wire all 4 `setSettlementManager` calls
- Sepolia Postgres migration: no schema change needed (no FFM-address foreign keys)
- Phase 7.5 mainnet deploy story: FFM is redeployed once on mainnet in Phase 4 → this IS the "exact mainnet contracts" story; Phase 7.5 re-deploys nothing new, it's the same code deployed to mainnet

**Why NOT the lazy read-only path (no redeploy):** Without `applySettlement`, there is no way for SettlementManager to atomically extract 1.7% fees and route the LP fee into the winning reserve in the same settlement tx. A two-tx approach (SettlementManager extracts then tells FFM) breaks atomicity (SETTLE-05). FFM must be the custodian of the pool USDC and must execute the transfer atomically.

### Fee Extraction Design (step 11)

```solidity
// In SettlementManager.settle(), step 11 calls:
followFadeMarket.applySettlement(
    callId,
    outcome,          // CallerWon or CallerLost
    protocolFeeAmt,   // 1.0% of totalPool
    creatorFeeAmt,    // 0.4% * (callerVolumeAtExit if exited, else totalPool)
    lpFeeAmt          // 0.3% of totalPool → routes into winning reserve
);
```

Inside `applySettlement`:
- `totalPool = followReserve[callId] + (fadeReserve[callId] - fadeSeedVirtual[callId])` (real USDC only)
- Transfer `protocolFeeAmt + creatorFeeAmt` to treasury
- Add `lpFeeAmt` to the WINNING side's reserve (followReserve if CallerWon, fadeReserve otherwise)
- Virtual seed dissolves: `fadeSeedVirtual[callId] = 0` after settlement (it was accounting-only anyway)
- Record `settlementApplied[callId] = true` — guard against double-call
- If real faders = 0 (full cold-start): entire follow pool → treasury (CALL-41, Pitfall 22)

### Pull-pattern claimPayout after settlement

```solidity
function claimPayout(uint256 callId) external nonReentrant {
    // Pause carve-out: NOT whenNotPaused (§10.3)
    ICallRegistry.Call memory call = callRegistry.getCall(callId);
    require(
        call.status == ICallRegistry.CallStatus.Settled ||
        call.status == ICallRegistry.CallStatus.Disputed,
        "CallNotSettled"
    );
    require(!claimed[callId][msg.sender], "AlreadyClaimed");
    
    // Determine winner/loser side
    bool callerWon = (call.outcome == ICallRegistry.Outcome.CallerWon);
    uint256 userShares;
    uint256 totalShares;
    uint256 winningReserve;
    
    if (callerWon) {
        userShares = followShares[callId][msg.sender];
        totalShares = followTotalShares[callId];
        winningReserve = followReserve[callId];  // post-fee reserve
    } else {
        userShares = fadeShares[callId][msg.sender];
        totalShares = fadeTotalShares[callId];
        winningReserve = fadeReserve[callId] - fadeSeedVirtual[callId]; // real only
    }
    
    if (userShares == 0) revert NoPayoutAvailable();
    
    // CEI: mark claimed BEFORE transfer (SOCIAL-47)
    claimed[callId][msg.sender] = true;
    
    uint256 payout = Math.mulDiv(userShares, winningReserve, totalShares);
    IERC20(USDC_ARB_NATIVE).safeTransfer(msg.sender, payout);
    emit PayoutClaimed(callId, msg.sender, payout);
}
```

**P&L for UI:** `payout - original_position_deposit` = P&L shown in FINAL POSITIONS and stat row. The subgraph tracks `positionEntryTime` and `followPosition`/`fadePosition` for the entry cost.

---

## Architecture Patterns

### System Architecture Diagram

```
RELAYER (Railway/Fly.io — long-running)
  │
  ├── BullMQ Settlement Watcher
  │     ├── On call expiry: enqueue settle job
  │     ├── Pyth path: fetch VAA from Hermes → build tx with updatePriceFeeds + settle
  │     ├── Non-Pyth paths: fetch data → sign EIP-712 attestation → build submitAttestation tx
  │     └── On ambiguous: emit SettlementDelayed, open dispute window, alert Telegram
  │
  ├── Oracle Adapters (7 types)
  │     ├── PythAdapter: HermesClient.getLatestPriceUpdates → bytes[] updateData
  │     ├── NftTwapAdapter: alchemy.nft.getNFTSales + getFloorPrice → TWAP + sign
  │     ├── DefiLlamaAdapter: fetch api.llama.fi → attest + sign
  │     ├── RpcMetricsAdapter: viem getLogs → compute metric → sign
  │     ├── SnapshotAdapter: snapshot.js → proposal state → sign
  │     ├── TallyAdapter: fetch api.tally.xyz/query → proposal state → sign
  │     └── CexScraperAdapter: Playwright × 8 exchanges → match listing → sign
  │
  ├── EIP-712 KMS Attestation Rail (gcpKmsAccount from kms-signer.ts)
  │     └── 5 keys: nft-twap | defillama | cex | snapshot-tally | oauth-proof
  │
  └── Routes: POST /api/settle/submit, GET /api/disputes, POST /api/disputes/raise,
              POST /api/disputes/evidence (Pinata pin), GET /api/disputes/log
              POST /api/nft/floor (submitNftFloor → SettlementManager)

SMART CONTRACTS (Arbitrum Sepolia → Mainnet)
  SettlementManager.sol (NEW)
    └── settle(callId, bytes[] pythUpdateData)
          Step 1: idempotency guard (status != Live → revert AlreadySettled)
          Step 2: expiry guard (block.timestamp < expiry → revert CallNotExpired)
          Step 3: pause guard
          Step 4: dispatch → oracle adapter via adapterMap[marketType][eventSubtype]
          Step 5: read oracle result → outcome OR emit SettlementDelayed + return
          Step 6: apply confidence gate (Pyth: confidence*200 <= price)
          Step 7: cold-start check (fadeRealReserve == 0 → 25% scaling on win)
          Step 8: caller rep delta via try { stylusEngine.compute_rep_change(...) }
                   catch { _solidityBaselineRepDelta(...) + emit RepCalculatedFallback }
          Step 9: duel loop (all accepted duels for callId → settleDuel on ChallengeEscrow)
          Step 10: cold-start scale applied
          Step 11: fee extraction → FFM.applySettlement(callId, outcome, fees...)
          Step 12: clear activeDuplicateHashes[call.duplicateHash] = 0
          Step 13: callRegistry.markSettled(callId, outcome)
          Step 14: profileRegistry.updateAfterSettlement(caller, category, isCaller, isWinner, repDelta)
          Step 15: emit CallSettled(callId, outcome, priceDelta)

  FollowFadeMarket.sol (REDEPLOYED — adds setSettlementManager, applySettlement, real claimPayout)
  CallRegistry.sol      (UNCHANGED — markSettled already works)
  ChallengeEscrow.sol   (UNCHANGED — settleDuel already works, setSettlementManager works)
  ProfileRegistry.sol   (UNCHANGED — updateAfterSettlement + applyRepDelta work; stub body replaced)

SUBGRAPH (settlement-manager.ts replaces Phase-0 stub)
  Events indexed: CallSettled, DisputeRaised, DisputeResolved, CallForceSettled,
                  SettlementDelayed, RepCalculated, RepCalculatedFallback

FRONTEND (Next.js — extends existing /call/[id]/page.tsx)
  /call/[id]   branches: Live (existing) | Settled | Disputed | CallerExited
  /disputes/   public log + owner resolve admin
  /og/[callId] branches: Live (existing) | Settled (variant 2) | CallerExited (variant 4)
  /og/duel/[challengeId]  fills settled stubs (winner-aware flag flip)
```

### 14-Step `settle()` Sequence (LOCKED by §12.4)

```
Step 1:  AlreadySettled guard — revert if status != Live
Step 2:  CallNotExpired guard — revert if block.timestamp < expiry
Step 3:  Paused guard — revert if paused (settle is paused per SETTLE-04)
Step 4:  Dispatch → oracle adapter (adapterMap lookup)
Step 5:  Read oracle; if ambiguous → emit SettlementDelayed, return (NOT revert)
Step 6:  Apply Pyth confidence gate: confidence * 200 <= price
Step 7:  Check cold-start: if FFM.getFadeRealReserve(callId) == 0, flag coldStart=true
Step 8:  Caller rep delta:
           try { stylusScoreEngine.compute_rep_change(callerRep, conviction, consensusPct, isWinner, 10) }
           catch (bytes memory err) {
               delta = _solidityBaselineRepDelta(conviction, consensusPct, isWinner);
               emit RepCalculatedFallback(callId, callerAddr, delta, err);
           }
           if (coldStart && isWinner) delta = (delta * 25) / 100;
           if (!callerExited) profileRegistry.applyRepDelta(callerAddr, delta);
           emit RepCalculated(callId, callerAddr, currentRep, conviction, consensusPct, isWinner, 10, delta);
Step 9:  Duel loop: for each accepted challenge on callId {
               ChallengeEscrow.settleDuel(challengeId, winner);  // winner = caller if CallerWon, else challenger
               apply ~1.5× rep to both parties (REP-27)
           }
Step 10: Cold-start scale already applied in step 8
Step 11: Fee extraction: FFM.applySettlement(callId, outcome, protocolFee, creatorFee, lpFee)
Step 12: Clear activeDuplicateHashes[call.duplicateHash] = 0 (CALL-27, SETTLE-47)
Step 13: CR.markSettled(callId, outcome)
Step 14: PR.updateAfterSettlement(callerAddr, category, true, isWinner, delta)
Step 15: emit CallSettled(callId, outcome, priceDelta)
```

Note: The spec §12.4 labels these steps 1-14 but this implementation has 15 logical items because forceSettle and dispute handling are separate functions.

### Dispatch Table Design

```solidity
// OracleAdapter enum
enum OracleAdapter {
    Pyth,           // PriceTarget + SpreadVs
    NftTwap,        // Event + TvlMilestone(NFT floor)
    DefiLlama,      // Event + TvlMilestone(protocol) + VolumeFees + OnchainMetric(APRs)
    RpcMetrics,     // Event + OnchainMetric(active addrs / gas / liquidations)
    Snapshot,       // Event + Governance (Snapshot)
    Tally,          // Event + Governance (Tally/on-chain)
    CexScraper      // Event + CexListing
}

// Mapping set by owner at deploy (DeployPhase4.s.sol wires these)
mapping(uint8 => mapping(uint8 => OracleAdapter)) public adapterMap;
```

Initialization in `DeployPhase4.s.sol`:
```
adapterMap[PriceTarget][None] = Pyth
adapterMap[SpreadVs][None] = Pyth
adapterMap[Event][TvlMilestone] = DefiLlama (or NftTwap if NFT)
adapterMap[Event][VolumeFees] = DefiLlama
adapterMap[Event][OnchainMetric] = RpcMetrics (or DefiLlama for APRs)
adapterMap[Event][CexListing] = CexScraper
adapterMap[Event][TokenLaunch] = CexScraper
adapterMap[Event][Governance] = Snapshot (or Tally — determined by attestation field)
adapterMap[Event][ProtocolMilestone] = RpcMetrics
```

NFT calls: the `marketType == Event` + `assetA == NFT collection address` path routes to `NftTwap`. The adapter check: `if (callRegistry.isNftAllowlisted(call.assetA)) adapter = NftTwap`.

### Solidity Baseline Rep Delta (REP-22)

Lower-fidelity than Phase 5 Stylus full-fidelity. Ships in Phase 4 as the runtime fallback AND as the initial implementation (since Stylus is Phase 5):

```solidity
// In SettlementManager — the runtime fallback
function _solidityBaselineRepDelta(
    uint8 conviction,
    uint8 consensusPct,    // 0–100; derived from fade/(follow+fade) at settle time
    bool  isWinner
) internal pure returns (int256 delta) {
    // REP-03..06: base = 10
    // REP-04: confidence multiplier — linear 0.5 at 50% → 2.0 at 100%
    // Simplified: multiplier = conviction / 50 (range [0.1, 2.0])
    // REP-22 lower fidelity: NO high-conviction 2× asymmetry at ≥85
    // REP-22 lower fidelity: contrarian multiplier fixed at 1.0 (NOT consensus-adjusted)
    uint256 BASE = 10;
    // Linear confidence scale: at conviction=50 → 1.0×; at 100 → 2.0×
    // multiply first to avoid integer truncation: (BASE * conviction * 2) / 100
    uint256 scaled = (BASE * uint256(conviction) * 2) / 100;
    if (scaled < 1) scaled = 1; // floor 1 rep for any action

    if (isWinner) {
        delta = int256(scaled);
    } else {
        // REP-06: loss = base * confidence_multiplier (no contrarian on loss)
        delta = -int256(scaled);
    }
    // REP-02: caller of applyRepDelta handles the floor at 0
}
```

**D-08 — Outcome-word thresholds (planner discretion guided by research):**

| Outcome word | Condition | Source signal |
|---|---|---|
| `CONTRARIAN HIT` | Caller won AND `fadeRealReserve / totalPool >= 0.5` at settle time | Majority of the REAL pool was on fade side |
| `CALLED IT` | Caller won AND condition above not met | Default win |
| `COLD CALL` | Caller won AND `_solidityBaselineRepDelta` produces `delta <= 3` (conviction ≤ ~15% scaled, OR cold-start 25% applied AND final delta ≤ 3) | Small rep delta = low conviction OR cold start |
| `LOUD AND WRONG` | Caller lost | Default loss |
| `FADED CORRECTLY` | Per-viewer: connected wallet is on fade side AND caller lost | Page-render logic only |

Rationale: The "majority real faders" threshold for CONTRARIAN HIT is lenient (≥50% fade share), which means more wins earn the celebratory word as the founder steered. The `delta ≤ 3` COLD CALL threshold (roughly conviction ≤ 15% after linear scale, or a cold-start-scaled win) is pragmatic — very low conviction wins are cold calls.

---

## Oracle Adapter Implementations

### Adapter 1: Pyth (PriceTarget + SpreadVs)

**VAA fetch + on-chain update pattern:**

Relayer side (TypeScript, `@pythnetwork/hermes-client@3.1.0`):
```typescript
import { HermesClient } from '@pythnetwork/hermes-client';

const hermes = new HermesClient('https://hermes.pyth.network', {
  // Auth required after July 31, 2026 — add PYTH_API_KEY env var
});

async function fetchPythUpdateData(priceIds: string[]): Promise<`0x${string}`[]> {
  const updates = await hermes.getLatestPriceUpdates(priceIds);
  // updates.binary.data is string[] hex-encoded VAAs
  return updates.binary.data.map(d => `0x${d}` as `0x${string}`);
}
```

Contract call pattern (viem, `walletClient.writeContract`):
```typescript
// Step 1: get update fee
const feeWei = await publicClient.readContract({
  address: PYTH_ARBITRUM_ONE,
  abi: IPythABI,
  functionName: 'getUpdateFee',
  args: [updateData],
});

// Step 2: call settle() with pythUpdateData — SettlementManager does the updatePriceFeeds internally
// SettlementManager.settle(callId, updateData) accepts pythUpdateData as bytes[]
// and calls pyth.updatePriceFeeds{value: fee}(updateData) before getPriceNoOlderThan
```

Contract side (SettlementManager Solidity, Pitfall 4 — ETH fee budget):
```solidity
function _settlePyth(uint256 callId, bytes[] calldata pythUpdateData)
    internal returns (ICallRegistry.Outcome outcome) {
    // 1. Pre-pay the Pyth update fee (ETH, not USDC)
    uint256 fee = pyth.getUpdateFee(pythUpdateData);
    require(address(this).balance >= fee, "InsufficientEthForPythFee");
    // 2. Push the VAA on-chain
    pyth.updatePriceFeeds{value: fee}(pythUpdateData);
    // 3. Read price — 60s freshness window (SETTLE-07)
    PythStructs.Price memory priceData = pyth.getPriceNoOlderThan(call.assetA_as_bytes32, 60);
    // 4. Confidence gate (SETTLE-08): confidence * 200 <= price
    require(int64(priceData.conf) > 0, "NegativeConfidence");
    uint256 absPrice = priceData.price > 0 ? uint256(int256(priceData.price)) : 0;
    if (uint256(int256(priceData.conf)) * 200 > absPrice) {
        emit SettlementDelayed(callId, "PYTH_CONFIDENCE_WIDE", block.timestamp + 60);
        return ICallRegistry.Outcome.Pending; // Caller handles the Pending return as "ambiguous"
    }
    // 5. Compare to call.targetValue (stored as uint256 in 8-decimal form matching Pyth expo)
    outcome = (adjustedPrice >= call.targetValue)
        ? ICallRegistry.Outcome.CallerWon
        : ICallRegistry.Outcome.CallerLost;
}
```

**Pitfall 4 — ETH fee budget monitoring:** SettlementManager holds ETH balance. Relayer monitors `address(settMgr).balance` and alerts when < 0.01 ETH (roughly 100 VAA pushes at ~1e14 wei each). BullMQ job checks ETH balance before submitting; Telegram alert at < 0.01 ETH threshold.

**SpreadVs (SETTLE-12):** Both `assetA` and `assetB` Pyth reads in the same tx; either failing confidence → `SettlementDelayed`.

### Adapter 2: DefiLlama (TVL/volume/fees/APRs) — the 2nd-to-prove attestation rail

DefiLlama is the cleanest candidate to prove the KMS-attestation rail generalizes because:
- Free, no auth (no API key to worry about)
- Simple REST endpoints (no Playwright needed)
- Covers TVL milestone, volume/fees, APR event subtypes

```typescript
// Relayer: apps/relayer/src/workers/oracle-adapters/defillama-adapter.ts
const TVL_URL = 'https://api.llama.fi/protocol/{slug}';
const YIELDS_URL = 'https://yields.llama.fi/pools';

interface DefiLlamaAttestation {
  callId: bigint;
  metric: string;   // 'tvl' | 'volume7d' | 'fees7d' | 'supplyApr' | 'borrowApr'
  value: bigint;    // scaled to 6 decimals for USDC-like values, or 18dp for APR bps
  timestamp: bigint;
  chainId: bigint;
}

// Sign via kms-signer: attestationType = 'defillama'
const attestation = await gcpKmsAccount({ ..., keyId: 'defillama' }).signTypedData({
  domain: { name: 'CallIt', version: '1', chainId: 42161n, verifyingContract: SETTLEMENT_MANAGER },
  types: { DefiLlamaAttestation: [...] },
  primaryType: 'DefiLlamaAttestation',
  message: attestation,
});
```

On-chain: `submitAttestation(callId, bytes attestationData, bytes signature)` calls `ecrecover` to verify `DEFILLAMA_SIGNER` matches.

### Adapter 3: NFT TWAP (Alchemy, ≥12 obs)

```typescript
// Alchemy SDK floor price — NOTE: getFloorPrice returns Ethereum mainnet data for known collections.
// For TWAP, use getNFTSales (gives actual sale prices) + polling across 24h
const alchemy = new Alchemy({ apiKey: ALCHEMY_API_KEY, network: Network.ETH_MAINNET });
const sales = await alchemy.nft.getNFTSales({ contractAddress, startTime, endTime });
// Pitfall 7: must have >= 12 observations; if < 12 → ambiguous
```

Contract: `submitNftFloor(callId, twapPriceWei, observationCount, evidenceHash)` — verified against `nft-twap` KMS key.

### Adapter 4: Direct RPC (On-chain metrics + liquidations)

```typescript
// viem getLogs for liquidation events, active-address proxies via Alchemy trace endpoints
// For liquidation events > $X in 24h: watch Aave/Compound LiquidationCall events
const logs = await publicClient.getLogs({
  address: AAVE_V3_POOL,
  event: LIQUIDATION_CALL_ABI,
  fromBlock: blockAtExpiry - BigInt(7200), // ~24h of blocks at ~12s
  toBlock: blockAtExpiry,
});
```

### Adapter 5: Snapshot

```typescript
import snapshot from '@snapshot-labs/snapshot.js';
const client = new snapshot.Client712('https://hub.snapshot.org');
// Read proposal state at call expiry timestamp
const proposal = await client.request('proposal', { id: proposalId });
// outcome: proposal.state === 'closed' ? winThreshold... : ambiguous
```

### Adapter 6: Tally (on-chain governance)

```typescript
// Direct GraphQL fetch (no SDK on npm)
const res = await fetch('https://api.tally.xyz/query', {
  method: 'POST',
  headers: { 'Api-Key': process.env.TALLY_API_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `{ proposal(id: "${proposalId}") { status, eta, ... } }` })
});
```

### Adapter 7: CEX Scrapers (8 exchanges, Playwright)

```typescript
// Per-exchange modular scrapers
// apps/relayer/src/workers/oracle-adapters/cex/binance-scraper.ts
// apps/relayer/src/workers/oracle-adapters/cex/coinbase-scraper.ts
// ... etc.

// Pattern (Pitfall 10 + 19):
// 1. Launch Playwright headless Chromium
// 2. Navigate to exchange announcement page
// 3. Grep for token name in post titles within 24h of expiry
// 4. Innovation Zone exclusion: if "Innovation Zone" or "Monitoring Zone" in post → treat as NOT a standard listing
// 5. Multi-signal confirm: match BOTH token symbol AND full token name
// 6. Weekly synthetic CI test: inject a known-listing fixture and verify scraper detects it
```

**Innovation Zone exclusion fixtures (Pitfall 19):**
```typescript
const INNOVATION_ZONE_EXCLUSION_PATTERNS: Record<string, string[]> = {
  binance: ['Innovation Zone', 'Seed Tag', 'Monitoring Tag'],
  okx: ['Innovation Zone'],
  bybit: ['Innovation Zone'],
  bitget: ['PoP Zone'],
  // ...
};
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pyth on-chain price push | Custom oracle pusher | `pyth.updatePriceFeeds{value: fee}(updateData)` via `@pythnetwork/hermes-client` | VAA validation is complex cryptography |
| EIP-712 signing | Local key signing | GCP KMS via existing `gcpKmsAccount` in `kms-signer.ts` | Private keys never leave KMS |
| Job retry queue (30×60s Pyth) | Custom retry loop with sleep | `bullmq` Queue + Worker with `delay` option | Persistence, crash recovery, visibility |
| CEX HTML parsing | Custom regex | Playwright page scraping | DOM changes break regex; Playwright handles JS-rendered pages |
| TWAP computation | Custom moving-average | Alchemy `getNFTSales` + rolling window | 24h of sales data, ≥12 obs validation |
| USDC pro-rata split math | Custom fixed-point | `Math.mulDiv` from OZ (already used in FFM) | Overflow-safe in existing codebase |
| IPFS evidence upload | Custom IPFS node | Existing Pinata pipeline (Phase 0) | Already wired; relayer endpoint exists |
| EIP-712 struct hashing | Manual keccak256 | viem `signTypedData` + Solidity `_hashTypedDataV4` from OZ ECDSA | Replay protection is subtle |
| Subgraph AssemblyScript math | Custom BigDecimal | `BigInt` operations only (AssemblyScript has no float) | AS has no floating-point — only BigInt |

---

## Common Pitfalls

### Pitfall 4: Pyth ETH Fee Budget
**What goes wrong:** `updatePriceFeeds` requires ETH (not USDC). SettlementManager runs out of ETH mid-settlement.
**Prevention:** (a) SettlementManager has `receive() external payable {}` to accept ETH top-ups. (b) Relayer checks `address(settMgr).balance >= fee * 5` before submitting; alerts Telegram at < 0.01 ETH. (c) Phase 6 adds auto-topup.
**Warning signs:** `InsufficientEthForPythFee` revert in relayer logs.

### Pitfall 5: Stylus Fallback In-Contract
**What goes wrong:** If `_solidityBaselineRepDelta` is in Phase 5 (not Phase 4), the 48h Stylus cutoff becomes a code-rewrite, not a mechanical upgrade.
**Prevention:** Phase 4 ships `_solidityBaselineRepDelta` in-contract. Phase 5 upgrades ONLY the proxy to Stylus. The try/catch seam in Phase 4 calls `IStylusScoreEngine` address (Phase 5 will set this); if address is `address(0)` or call fails → fallback fires. The seam is a two-line change in Phase 5.

### Pitfall 6: Dispute Window + forceSettle Public Commitment
**What goes wrong:** Owner uses `forceSettle` silently; users lose trust.
**Prevention:** (a) `forceSettle` cooldown is 7 days (SETTLE-39). (b) `/disputes/` public log shows 24h owner public-commitment text before any forceSettle (D-07). (c) `CallForceSettled` + `CallSettled` both fire (SETTLE-40) for loud audit trail.

### Pitfall 7: KMS Key Separation + EIP-712 ChainId
**What goes wrong:** A leaked `nft-twap` key can forge governance attestations; cross-chain replay attacks.
**Prevention:** (a) 5 separate KMS keys per `AttestationType` (already in `kms-signer.ts`). (b) EIP-712 domain includes `chainId: 42161n` (Arbitrum One) and `verifyingContract: SETTLEMENT_MANAGER_ADDRESS`. (c) Per-attestation-type EIP-712 domain `name` field (e.g., "CallIt-NftTwap", "CallIt-DefiLlama") prevents cross-path replay even within same chain.

### Pitfall 10: CEX Scraper Selector Drift
**What goes wrong:** Exchange changes HTML structure; scraper silently returns false negatives; no alert.
**Prevention:** Weekly synthetic CI cron: inject a known fixture (a static HTML file mimicking the exchange announcement structure), run the scraper against it, assert detection. Each exchange has an isolated module. Alert on scraper returning zero results for >24h.

### Pitfall 11: Cold-Start Sybil-Fade
**What goes wrong:** Caller places a call with zero real faders, then fades themselves via a Sybil wallet to manufacture fake "real" fade, earning full contrarian rep.
**Prevention:** Cold-start check reads `FFM.getFadeRealReserve(callId)` (= `fadeReserve - fadeSeedVirtual`) AT SETTLEMENT TIME. If == 0, apply 25% scaling. A Sybil fader would need to put real USDC into the fade pool (costs money); the 25% scale applies to the REP delta only, not to USDC payout. The financial cost of Sybil-fading disincentivizes gaming.

### Pitfall 18: Claim-Delay Decision
**What goes wrong:** `claimPayout` might be called during an active dispute (SETTLE-35 says "post-claim disputes not honored").
**Prevention:** `claimPayout` works during `Disputed` status (pull-pattern; the spec says dispute window is < typical claim activity). The spec explicitly accepts this tradeoff (SETTLE-35). Document in operator runbook OPS-15: "If dispute is raised after payouts are claimed, resolution reversal re-distributes remaining pool only; already-claimed payouts are not reversed." This is the Pitfall 18 decision: claims CAN occur during dispute window; reversal affects unclaimed funds only.

### Pitfall 19: CEX Multi-Signal Confirm + Innovation Zone
**What goes wrong:** Token gets listed in "Innovation Zone" (Binance) which is a sub-tier listing, not a standard listing; or scraper matches partial symbol.
**Prevention:** (a) Innovation Zone exclusion patterns per exchange (see Adapter 7 above). (b) Multi-signal confirm: match BOTH full token name AND symbol in the announcement title. (c) Only count as a CEX listing if the announcement has no exclusion tag.

### Pitfall 22: Empty Pool → Treasury (CALL-41)
**What goes wrong:** All faders were virtual seed; fade side is all virtual USDC. If caller wins, the "winning reserve" contains only virtual fade seed which was never transferred — protocol would try to pay out money that doesn't exist.
**Prevention:** In `applySettlement`, check `fadeRealReserve = fadeReserve - fadeSeedVirtual`. If `fadeRealReserve == 0`: route the entire `followReserve` (minus fees) to treasury. No payout to follow pool. Virtual seed dissolves to 0. This is CALL-41 — the caller's win against zero real faders earns no USDC payout; the money goes to protocol (the virtual seed was never real money).

---

## Code Examples

### Pyth IPyth Interface (Solidity)

```solidity
// Source: pyth-sdk-solidity@4.3.1 / IPyth.sol
interface IPyth {
    struct Price {
        int64  price;       // price in $expo form; expo is -8 for most feeds
        uint64 conf;        // confidence interval, same units as price
        int32  expo;        // exponent; price_usd = price * 10^expo
        uint256 publishTime;
    }
    function getUpdateFee(bytes[] calldata updateData) external view returns (uint feeAmount);
    function updatePriceFeeds(bytes[] calldata updateData) external payable;
    function getPriceNoOlderThan(bytes32 id, uint age) external view returns (Price memory price);
    function getPriceUnsafe(bytes32 id) external view returns (Price memory price);
}

// Confidence gate per spec §13.1:
// confidence × 200 <= price (confidence interval must be ≤ 0.5% of price)
// NOTE: price and conf are both int64/uint64 from the struct; use int256 math to avoid overflow
bool isFresh = uint256(int256(priceData.conf)) * 200 <= uint256(int256(priceData.price > 0 ? priceData.price : -priceData.price));
```

### EIP-712 Attestation Domain (Solidity)

```solidity
// Source: OZ ECDSA + EIP-712 pattern [ASSUMED pattern based on kms-signer.ts]
bytes32 private constant DOMAIN_TYPEHASH = keccak256(
    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
);

// Per attestation type — prevents cross-path replay (Pitfall 7)
bytes32 private constant DEFILLAMA_ATTESTATION_TYPEHASH = keccak256(
    "DefiLlamaAttestation(uint256 callId,string metric,uint256 value,uint256 timestamp,uint256 chainId)"
);

// Verify signature:
function _verifyAttestation(
    bytes32 attestationHash,
    bytes calldata signature,
    address expectedSigner
) internal view {
    bytes32 digest = _hashTypedDataV4(attestationHash);
    address signer = ECDSA.recover(digest, signature);
    require(signer == expectedSigner, "InvalidAttestation");
}
```

### BullMQ Settlement Watcher Pattern

```typescript
// Source: bullmq docs + existing Phase 0 worker patterns in apps/relayer/src/workers/
import { Queue, Worker, Job } from 'bullmq';

const settlementQueue = new Queue('settlement', { connection: redisConfig });

// Enqueue when a call expires: called by polled-events-fallback or subgraph event
async function enqueueSettlement(callId: bigint, expiry: number) {
  const delayMs = Math.max(0, expiry * 1000 - Date.now());
  await settlementQueue.add('settle', { callId: callId.toString() }, { delay: delayMs });
}

// Worker processes settlement
const settlementWorker = new Worker('settlement', async (job: Job) => {
  const callId = BigInt(job.data.callId);
  // Pyth path: fetch VAA, call settle(callId, updateData)
  // Non-Pyth path: submit attestation then settle(callId, [])
  // On ambiguous: emit SettlementDelayed, re-enqueue after 60s
  // After 30 retries: open dispute window
}, { connection: redisConfig });
```

### claimPayout Math (Solidity — new in FFM)

```solidity
// Winner's payout = userShares * winningReserve / totalWinnerShares
// (post-fee reserve — fees already extracted by applySettlement)
uint256 payout = Math.mulDiv(userShares, winningReserve, totalShares);
```

---

## Validation Architecture

Phase 4 has money-critical paths (fee extraction, pool settlement, rep deltas) that require multiple layers of validation.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Foundry (Solidity) + Vitest (TypeScript) |
| Config file | `packages/contracts/foundry.toml` (existing, `=0.8.30` pin, `ci` fuzz profile 1000 runs) |
| Quick run command | `forge test --match-contract SettlementManagerTest -vv` |
| Full suite command | `forge test -v` (all contracts) + `pnpm --filter @call-it/relayer test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command |
|--------|----------|-----------|-------------------|
| SETTLE-02 | Second settle reverts AlreadySettled | unit | `forge test --match-test testSettleIdempotency` |
| SETTLE-05 | Revert in step N rolls back all steps | unit | `forge test --match-test testAtomicRollback` |
| SETTLE-08 | Pyth confidence gate rejects wide reads | unit | `forge test --match-test testPythConfidenceGate` |
| SETTLE-46 | Fee split: 1.0% + 0.4% + 0.3% = 1.7% | property-fuzz | `forge test --match-test invariantFeeSplit --fuzz-runs 1000` |
| SETTLE-46 | Pool conservation: preBalance == postBalance + fees | invariant | `forge test --match-test invariantPoolConservation` |
| SETTLE-44 | `settle()` gas is O(1) regardless of participant count | unit (gas snapshot) | `forge snapshot --match-test testSettleGas` |
| REP-14 | Cold-start 25% scale when fadeRealReserve==0 | unit | `forge test --match-test testColdStartScale` |
| REP-22 | Stylus try/catch: deliberate-revert Stylus → baseline fires + event | unit (mock Stylus) | `forge test --match-test testStylusFallback` |
| REP-23 | `RepCalculatedFallback` event fires with lowLevelError | unit | same test |
| SETTLE-39 | `forceSettle` reverts before 7d cooldown | unit | `forge test --match-test testForceSettleCooldown` |
| SETTLE-40 | `forceSettle` emits both CallForceSettled + CallSettled | unit | `forge test --match-test testForceSettleEvents` |
| SETTLE-25..30 | Dispute: bond taken, window closed revert, max 3 | unit | `forge test --match-test testDisputeWindow` |
| SETTLE-34 | Reversal re-distributes USDC from old-winner to new-winner | unit | `forge test --match-test testDisputeReversal` |
| SOCIAL-46..47 | `claimPayout` idempotency + CEI order | unit | `forge test --match-test testClaimIdempotency` |
| SETTLE-16 | NFT TWAP with < 12 obs → ambiguous | unit | Vitest adapter unit test |
| SETTLE-23 | CEX scraper detects known listing in fixture | unit | Vitest with static HTML fixture |
| D-08 | CONTRARIAN HIT when fadeShare ≥ 50% | unit | Vitest (TS parity test) |

### Foundry Property-Fuzz Invariants (critical for money paths)

```solidity
// packages/contracts/test/SettlementManagerTest.sol

// Invariant: total fees extracted == 1.7% of totalPool (within 2 wei dust)
function invariantFeeSplit() public {
    // ...
}

// Invariant: followReserve + fadeRealReserve + fees_transferred == pre-settle pool
function invariantPoolConservation() public {
    // ...
}

// Invariant: settle() is idempotent — second call reverts
function invariantSettleIdempotency() public {
    // ...
}
```

### Foundry ↔ Vitest Parity Gate

For shared math functions (rep delta, fee split, P&L calculation), maintain matching tests in both Foundry and Vitest. The parity gate fails CI if the two implementations produce different results for the same inputs.

### Wave 0 Gaps

- [ ] `packages/contracts/test/SettlementManagerTest.sol` — covers SETTLE-02, SETTLE-05, SETTLE-08, SETTLE-46 pool conservation
- [ ] `packages/contracts/test/FfmSettlementTest.sol` — covers claimPayout, applySettlement, cold-start, CALL-41
- [ ] `packages/contracts/test/SettlementDisputeTest.sol` — covers SETTLE-25..36
- [ ] `apps/relayer/src/workers/__tests__/pyth-adapter.test.ts` — covers Pyth retry loop (mocked)
- [ ] `apps/relayer/src/workers/__tests__/cex-binance.test.ts` (+ 7 others) — static HTML fixture tests
- [ ] `apps/relayer/src/workers/__tests__/defillama-adapter.test.ts` — covers DefiLlama attestation signing

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Owner-only gates via Ownable2Step; SettlementManager address rotation; KMS key boot-time verification |
| V3 Session Management | no | Stateless permissionless settle |
| V4 Access Control | yes | `onlySettlementManager` modifiers on `markSettled`, `settleDuel`, `updateAfterSettlement`; `onlyOwner` on `resolveDispute`, `forceSettle` |
| V5 Input Validation | yes | Pyth confidence gate; NFT ≥12 obs check; EIP-712 ecrecover on all attestations; bond amount exact $5 |
| V6 Cryptography | yes | EIP-712 domain + chainId binding (anti-replay); GCP KMS secp256k1; never hand-roll — use OZ ECDSA |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Settle call twice to flip outcome | Tampering | Idempotency guard: status != Live revert at step 1 |
| Fake relayer attestation (compromised key) | Spoofing | Per-type KMS key; EIP-712 chainId + verifyingContract binding; expected-signer registry per attestation type |
| Drain pool via re-entrant claimPayout | Tampering | ReentrancyGuard + CEI: `claimed[callId][user] = true` before transfer |
| Cross-chain replay of attestation | Repudiation | EIP-712 domain `chainId: 42161n` + `verifyingContract: SETTLEMENT_MANAGER` |
| Sybil fade to manufacture CONTRARIAN HIT | Tampering | Cold-start 25% scale (REP-14) + financial cost of Sybil-fading (real USDC required) |
| Griefing `forceSettle` during dispute window | DoS | 7-day cooldown from expiry (SETTLE-39); dispute window closes at 24h — cooldown starts after settle, not after dispute |
| CEX scraper false positive (Innovation Zone) | Tampering | Per-exchange Innovation Zone exclusion patterns + multi-signal confirm (Pitfall 19) |
| Operator uses forceSettle silently | Repudiation | Public `/disputes/` log + 24h public commitment window (D-07/Pitfall 6) |
| Empty pool edge case — paying out virtual seed | Information Disclosure | `fadeRealReserve = 0` → full follow pool to treasury (CALL-41, Pitfall 22) |
| `delegatecall` to SettlementManager by proxy | Elevation of Privilege | SettlementManager is non-upgradeable (SAFETY-18); no `delegatecall` paths |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Foundry (`forge`) | Contract tests + deploy | ✓ | nightly | — |
| Node.js | Relayer + frontend | ✓ | 22.x LTS (inferred from project) | — |
| Redis | BullMQ backing + cache | ✓ | Fly Postgres (for DB) + Redis on Railway (inferred from Phase 0) | — |
| GCP KMS | KMS signer | ✓ | kms-signer.ts exists, keys provisioned Phase 0 | — |
| Alchemy API key | NFT TWAP adapter | ✓ | SDK 3.6.5 in project | — |
| Tally API key | Tally GraphQL | Check at plan time | free tier | — |
| Pyth Hermes | VAA fetch | ✓ | Public endpoint (auth required after 2026-07-31) | — |
| Pinata | IPFS evidence upload | ✓ | Phase 0 pipeline | — |
| Playwright | CEX scrapers | Check at plan time | npm install | chromium download required |
| Arbitrum Sepolia RPC | Integration tests + deploy | ✓ | Alchemy endpoint | — |
| Arbitrum One USDC | ADR-0001: mainnet-fork for money paths | Mainnet only | N/A on Sepolia | Mainnet fork (`forge test --fork-url`) |

**Missing dependencies with no fallback:**
- Tally API key (free tier) — must be provisioned before Phase 4 governance adapter work
- Playwright Chromium — `pnpm playwright install chromium` in relayer setup

**Missing dependencies with fallback:**
- Pyth auth token (required after 2026-07-31 — month after this phase) — add `PYTH_API_KEY` to relayer env before Phase 6 mainnet staging

**ADR-0001 critical note:** Money-path testing (settle + claimPayout + fee extraction) MUST use mainnet-fork (`forge test --fork-url $ARB_ONE_RPC_URL`) because native USDC `0xaf88d065...` has no code on Arbitrum Sepolia. Live Sepolia integration tests use Circle's official Sepolia USDC `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` behind a chainId-gated USDC address (deferred to Phase 6 decision per ADR-0001).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Push oracle (Chainlink) | Pull oracle (Pyth) + VAA multicall | 2023–2024 | Relayer must fetch + push VAA before each settle |
| Hosted Graph Service | Subgraph Studio → Decentralized Network | June 2024 (sunset) | Must deploy via Studio |
| `@privy-io/wagmi-connector` | `@privy-io/wagmi` (no `-connector` suffix) | 2023 | Already correct in project |
| Reservoir NFT API | Alchemy NFT API (`getNFTSales`, `getFloorPrice`) | Oct 2025 (Reservoir sunset) | Already correctly using Alchemy |

**Deprecated/outdated in Phase 4 scope:**
- Phase-0 stub `settlement-manager.ts` block handler: replaced by real event handlers
- `ProfileRegistry.updateAfterSettlement` stub body: replaced with real `settledCalls++/wins/losses` implementation
- FFM `claimPayout` `revert ClaimRequiresSettlement()` stub: replaced with real pull-payout

---

## Open Questions (RESOLVED)

1. **Tally API key provisioning** (RESOLVED: tally-adapter logs warning + returns ambiguous if absent; operator provisions; T-04-06-05)
   - What we know: Tally GraphQL endpoint `https://api.tally.xyz/query` requires an API key (free tier sufficient)
   - What's unclear: Is the key already provisioned in GCP Secret Manager?
   - Recommendation: Check `gcloud secrets list | grep tally`; create if absent before Governance adapter plan

2. **Pyth auth token timeline** (RESOLVED: PYTH_API_KEY env slot added; no action until 2026-07-31)
   - What we know: Auth required after 2026-07-31 (1 month after Phase 4 research)
   - What's unclear: Will Phase 4 execution complete before July 31?
   - Recommendation: Add `PYTH_API_KEY` env var slot to relayer config now even if token not yet required; register at https://pyth.network/developers

3. **Playwright Chromium in Railway container** (RESOLVED: scraper returns ambiguous on browser-launch failure; OPS runbook + T-04-06-04)
   - What we know: CEX scrapers require Playwright chromium headless
   - What's unclear: Whether the current Railway Dockerfile includes chromium
   - Recommendation: `pnpm playwright install chromium` in Dockerfile + Playwright's own `playwright/node:chromium` base image as reference

4. **Dispute reversal USDC availability** (RESOLVED: SETTLE-35: post-claim disputes not honored in v1; OPS-15)
   - What we know: `resolveDispute` reversal must re-distribute USDC from old-winner → new-winner
   - What's unclear: If some winners already called `claimPayout` before dispute resolved, the reversal pool is smaller
   - Recommendation: Reversal applies to REMAINING unclaimed pool only (SETTLE-35 "post-claim disputes not honored in v1"). Document explicitly in OPS-15 runbook.

5. **SettlementManager ETH balance for Pyth fees** (RESOLVED: 0.1 ETH funded at deploy in DeployPhase4.s.sol; OPS-15 top-up)
   - What we know: `updatePriceFeeds{value: fee}(...)` requires ETH in SettlementManager
   - What's unclear: How ETH gets into SettlementManager at deploy time
   - Recommendation: `DeployPhase4.s.sol` sends 0.1 ETH from deployer to SettlementManager; add `receive() external payable {}`. Relayer monitors and tops up.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `getFadeRealReserve(callId)` will be a view function added to FFM during redeploy | FFM redeploy design | Low — trivial to add as `return fadeReserve[callId] - fadeSeedVirtual[callId]` |
| A2 | DefiLlama free tier `api.llama.fi` returns sufficient data for all TVL/volume/fees event subtypes | DefiLlama adapter | Medium — verify specific protocol slugs exist at plan time; some older protocols may lack data |
| A3 | Alchemy `getNFTSales` on Ethereum mainnet returns enough data for the 6 allowlisted collections | NFT TWAP adapter | Low — CryptoPunks/BAYC/Pudgy have high volume |
| A4 | Phase 5 Stylus `IStylusScoreEngine` interface has `compute_rep_change(uint128 currentRep, uint8 conviction, uint8 consensusPct, bool isWinner, uint256 baseValue) external view returns (int32)` | Rep baseline / try-catch seam | Medium — Phase 5 must match this exact signature; confirm before Phase 5 |
| A5 | RESOLVED — `activeDuplicateHashes` is a `public` mapping but `public` only generates a read-only getter; external contracts cannot write to it. Clearing it from SettlementManager requires a dedicated `clearDuplicateHash(bytes32 h) onlySettlementManager` seam added to CallRegistry.sol (the minimal additive seam, mirroring `markSettled`), shipped in source and live at the mainnet 7.5 deploy; step 12 is try/catch-guarded so settlement completes on the current Sepolia CallRegistry which predates the seam. | 14-step settle | RESOLVED (seam added to source in Phase 4) |
| A6 | BullMQ `Worker` processes jobs in order of delay completion | Settlement watcher | Low — BullMQ guarantees this |

---

## Sources

### Primary (HIGH confidence)
- `packages/contracts/src/FollowFadeMarket.sol` — [VERIFIED: codebase] — full claimPayout stub, all pool state mappings
- `packages/contracts/src/CallRegistry.sol` — [VERIFIED: codebase] — `markSettled`, `setSettlementManager`, `activeDuplicateHashes`
- `packages/contracts/src/ProfileRegistry.sol` — [VERIFIED: codebase] — `updateAfterSettlement` stub, `authorizedRepWriters`, `applyRepDelta`
- `packages/contracts/src/ChallengeEscrow.sol` — [VERIFIED: codebase] — `settleDuel`, `setSettlementManager` (already in Phase 3)
- `packages/contracts/src/interfaces/IFollowFadeMarket.sol` — [VERIFIED: codebase] — ClaimRequiresSettlement error
- `apps/relayer/src/lib/kms-signer.ts` — [VERIFIED: codebase] — 5 AttestationType keys, gcpKmsAccount pattern
- `.planning/phases/04-.../04-CONTEXT.md` — [VERIFIED: codebase] — all D-01..D-10 decisions
- `.planning/phases/04-.../04-UI-SPEC.md` — [VERIFIED: codebase] — all UI surfaces, color palette, animation spec, primitive reuse map
- `CLAUDE.md` — [VERIFIED: codebase] — all pinned versions, hardcoded addresses, Pyth feed catalogue
- IPyth interface signatures — [CITED: https://github.com/pyth-network/pyth-sdk-solidity/blob/main/IPyth.sol]
- Pyth EVM docs — [CITED: https://docs.pyth.network/price-feeds/core/use-real-time-data/pull-integration/evm]
- Hermes-client fetch pattern — [CITED: https://docs.pyth.network/price-feeds/core/fetch-price-updates]

### Secondary (MEDIUM confidence)
- BullMQ delayed jobs pattern — [CITED: https://docs.bullmq.io/guide/jobs/delayed]
- EIP-712 chainId binding — [CITED: viem signTypedData docs + https://eips.ethereum.org/EIPS/eip-712]
- DefiLlama API base URLs — [CITED: CLAUDE.md + api-docs.defillama.com]

### Tertiary (LOW confidence)
- Playwright Chromium in Railway container — [ASSUMED: based on Playwright docs; verify at plan time]
- Tally API key availability — [ASSUMED: free tier exists per CLAUDE.md; key not confirmed provisioned]

---

## Metadata

**Confidence breakdown:**
- FFM redeploy decision: HIGH — based on direct Solidity code reading; no assumptions
- Standard stack: HIGH — pinned in CLAUDE.md, verified in codebase
- 14-step settle sequence: HIGH — direct mapping from §12.4 spec (locked)
- Oracle adapter APIs: HIGH (Pyth), HIGH (DefiLlama), MEDIUM (Tally — key needed), MEDIUM (Alchemy TWAP — monthly data availability)
- Rep math baseline: HIGH — REP-22 spec is explicit about lower fidelity
- UI surfaces: HIGH — 04-UI-SPEC.md fully approved

**Research date:** 2026-06-01
**Valid until:** 2026-07-01 (30 days — stable APIs; Pyth auth deadline is 2026-07-31)
