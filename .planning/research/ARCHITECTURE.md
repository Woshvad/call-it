# Architecture Research — Call It

**Domain:** Onchain social prediction product (Arbitrum mainnet, USDC, person-first reputation, off-chain OG receipts, Stylus/Rust scoring engine)
**Researched:** 2026-05-21
**Confidence:** HIGH — the locked spec at `CALL_IT_SPEC1.md` plus the validated stack in `STACK.md` together fully determine the architecture. This document does not propose a new shape; it makes the spec's shape concretely buildable.

**Scope discipline.** This is not a redesign. The 6-contract topology, the Solidity↔Stylus split, the relayer-as-attestation-bus role, and the off-chain OG receipt are all locked. The job here is: (a) draw the component boundaries explicit enough that Claude Code can build them without ambiguity, (b) trace every data flow UI → contract → indexer → UI, (c) sequence the build with shared infrastructure as first-class nodes, (d) name every trust boundary, and (e) propose a monorepo layout.

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Vercel · Next.js 16 App Router · React 19)          │
│                                                                                       │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐         │
│  │ /feed (The │ │ /new       │ │ /call/[id] │ │ /u/[handle]│ │ /duels     │         │
│  │  Tape)     │ │  Call      │ │ live+settld│ │  profile   │ │  /lead     │         │
│  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └─────┬──────┘         │
│        │              │              │              │              │                  │
│  ┌─────┴──────────────┴──────────────┴──────────────┴──────────────┴──────┐         │
│  │   <PrivyProvider> → <QueryClientProvider> → <WagmiProvider> (@privy-io/wagmi)│   │
│  │   wagmi 2.18 hooks · viem 2.50 · siwe 3.0 · @farcaster/auth-kit              │   │
│  └─────────────────────────┬─────────────────────┬─────────────────────────────┘    │
└────────────────────────────│─────────────────────│──────────────────────────────────┘
                             │ tx (write)          │ GraphQL (read)
                             ▼                     ▼
            ┌────────────────────────┐   ┌──────────────────────────────┐
            │  Arbitrum One (RPC)    │   │  The Graph — Decentralized   │
            │  via Alchemy           │   │  Network (subgraph queries)  │
            └────┬────────────────┬──┘   └──────────────┬───────────────┘
                 │                │                     │ indexes events
                 │ reads          │ writes              │
                 ▼                ▼                     │
┌────────────────────────────────────────────────────────────────────────────────────┐
│                       ARBITRUM MAINNET — 6 CONTRACTS                                 │
│                                                                                       │
│   ┌─────────────────┐    ┌─────────────────┐    ┌──────────────────┐                │
│   │  CallRegistry   │◀──▶│ FollowFadeMarket│    │ ChallengeEscrow  │                │
│   │  (call state    │    │ (AMM, sub-state │    │ (1v1 escrow)     │                │
│   │   gates, exit)  │    │  per callId)    │    │                  │                │
│   └────────┬────────┘    └────────┬────────┘    └────────┬─────────┘                │
│            │ reads everything     │ pays out             │ pays out                  │
│            │                      │                      │                            │
│            ▼                      ▼                      ▼                            │
│   ┌──────────────────────────────────────────────────────────────────┐               │
│   │                      SettlementManager                            │               │
│   │   - dispatches oracle adapter per (marketType, eventSubtype)      │               │
│   │   - try/catch Stylus → Solidity baseline (RepCalculatedFallback)  │               │
│   │   - dispute window 24h, $5 USDC bond, max 3 counter-claims        │               │
│   │   - forceSettle owner-only at expiry + 7d                         │               │
│   └────────┬─────────────────────────────────────────┬─────────────┬─┘               │
│            │ writes rep                              │ delegatecall│ pays winner      │
│            ▼                                         ▼             ▼                  │
│   ┌──────────────────┐         ┌────────────────────────────┐    (Challenge/Market)   │
│   │ ProfileRegistry  │◀──reads─│  TransparentUpgradeableProxy│                        │
│   │ (rep, social ID) │         │     ↓ delegatecall          │                        │
│   └──────────────────┘         │  StylusScoreEngine (Rust)   │                        │
│            ▲                   │  + Solidity baseline (swap) │                        │
│            │ writes social     └────────────────────────────┘                         │
│            │                                                                           │
│   ┌────────┴────────────────┐                                                          │
│   │  Relayer signer key     │       USDC (native, hardcoded)                          │
│   │  (linkTwitter,Farcaster)│       0xaf88d065e77c8cC2239327C5EDb3A432268e5831         │
│   └─────────────────────────┘                                                          │
└──────────────────────────────────────────────────────────────────────────────────────┘
       ▲              ▲                       ▲                ▲                ▲
       │ events       │ events                │ submits        │ reads          │ reads
       │ (subgraph)   │ (state changes        │ signed         │ rep, social    │ all
       │              │  trigger OG regen)    │ attestations   │ for OG         │ events
       │              │                       │                │                │
       │     ┌────────┴───────────────────────┴────────────────┴────────────────┴──┐
       │     │                  RELAYER (Fastify + BullMQ + Redis)                 │
       │     │                  Fly.io or Railway, Node 22 LTS                     │
       │     │                                                                     │
       │     │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
       │     │  │ Pyth Hermes  │  │ Alchemy NFT  │  │  DefiLlama   │               │
       │     │  │ pull + push  │  │  TWAP comp.  │  │  TVL/vol/fee │               │
       │     │  │ updatePrice  │  │  signed sub. │  │  signed sub. │               │
       │     │  │ Feeds()      │  │              │  │              │               │
       │     │  └──────────────┘  └──────────────┘  └──────────────┘               │
       │     │                                                                     │
       │     │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
       │     │  │ Snapshot     │  │ Tally GQL    │  │ CEX scrapers │               │
       │     │  │  read +      │  │  read +      │  │ Playwright   │               │
       │     │  │  signed sub  │  │  signed sub  │  │ 8 exchanges  │               │
       │     │  └──────────────┘  └──────────────┘  └──────────────┘               │
       │     │                                                                     │
       │     │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
       │     │  │ OAuth proof  │  │ settle() cron│  │ Alerts:      │               │
       │     │  │ verifier     │  │  + retry     │  │ Telegram bot │               │
       │     │  │ (Twitter,FC) │  │  + dispute   │  │ paymaster,   │               │
       │     │  │              │  │  trigger     │  │ settle stuck │               │
       │     │  └──────────────┘  └──────────────┘  └──────────────┘               │
       │     │                                                                     │
       │     │  ┌──────────────────────────────────────────────────────────────┐   │
       │     │  │ OG image service (@vercel/og + Satori, Node runtime, 5 variants│ │
       │     │  │ Live · Settled · DuelSettled · CallerExited · Fallback)       │   │
       │     │  └──────────────────────────────────────────────────────────────┘   │
       │     └─────────────────────────────────────────────────────────────────────┘
       │
       │     ┌────────────────────────────┐
       └─────┤  The Graph Subgraph        │  ───── publishes 60s freshness data to UI
             │  (Arbitrum One mapping)    │
             │  entities: Call, Position, │
             │  Challenge, Settlement,    │
             │  Profile, RepEvent, Dispute│
             └────────────────────────────┘

External: Privy (OAuth + embedded wallets + paymaster) · Coinbase Onramp · Pinata (IPFS) ·
          Safe multisig (Arbitrum) · Cloudflare/Vercel CDN (OG cache) · Vercel (web hosting)
```

**Three planes of data movement:**

1. **Write plane (left side):** UI → wallet → contract. All money-bearing actions, gated by Privy auth and ReentrancyGuard on USDC paths.
2. **Read plane (right side):** Contract events → subgraph → UI. Every feed, profile, leaderboard, and receipt reads from the subgraph (with 5s-polling fallback during deploy gaps).
3. **Attestation plane (bottom):** Relayer → contract. Signed off-chain data (oracle TWAPs, OAuth proofs, settle cron triggers) flows in. This is the trust surface that gets the most scrutiny in §5 below.

---

## 2. Component Boundary Map

### 2.1 CallRegistry

| Aspect | Specification |
|---|---|
| **Owns** | `mapping(uint256 => Call) calls`, `mapping(bytes32 => uint256) activeDuplicateHashes`, `mapping(bytes32 => bool) allowlistedAssets`, `mapping(bytes32 => bool) allowlistedNFTs`, `tvlCap`, `paused`, `nextCallId` counter, `owner`. |
| **Reads from** | **ProfileRegistry** (`getProfile(caller).settledCalls` for Gate 6.3 high-conviction floor at step 11 of `createCall`). **FollowFadeMarket** (queries follow/fade pool totals at `callerExit` step 8 to snapshot `callerVolumeAtExit` for Model B creator fee). **USDC ERC-20** (`allowance`, `balanceOf`, `safeTransferFrom`). |
| **Written by** | Users directly (`createCall`, `callerExit`); **SettlementManager** (status transition Live→Settled at step 13 of `settle`; clears `activeDuplicateHashes` at step 12); **Owner** (`addAsset`, `addNFTCollection`, `pause`, `setTvlCap`). |
| **Events emitted** | `CallCreated(id, caller, marketType, stake)`, `CallSettled(id, outcome)` *(also emitted by SettlementManager — duplication is intentional for indexer convenience; both contracts emit on settlement)*, `CallQuoted(parentId, quoteId)`, `ConvictionCapped(caller, requested, applied)`, `CallerExited(callId, caller, timeElapsed, penaltyPaid, stakeReturned, reputationDelta)`. |
| **Events consumed (off-chain)** | None at contract layer; subgraph reads `CallCreated` to seed `Call` entity. |
| **Trust boundary** | None inbound (anyone can call `createCall`). Owner-gated for allowlist + pause + cap. |

### 2.2 FollowFadeMarket

| Aspect | Specification |
|---|---|
| **Owns** | Per-call AMM state keyed by `callId`: `followPool[callId]`, `fadePool[callId]`, `userFollowShares[callId][user]`, `userFadeShares[callId][user]`, `positionEntryTime[callId][user][side]`, `claimed[callId][user]`, `virtualFadeSeed[callId]` (initialized to `VIRTUAL_FADE_SEED + CREATION_FEE_TO_VIRTUAL = $7` at call creation). Single contract holds all sub-state per §11.2 lock. |
| **Reads from** | **CallRegistry** (`getCall(callId)` for `status`, `expiry`, `caller`). **USDC ERC-20** (transfer paths). |
| **Written by** | Users directly (`follow`, `fade`, `exitPosition`, `claimPayout`); **CallRegistry** (callerExit slash injects USDC into pool reserves via internal call); **SettlementManager** (`settle` triggers fee routing into LP pool — 0.3% LP fee added to winning pool reserve at step 11). |
| **Events emitted** | `Followed(callId, user, stake, shares)`, `Faded(callId, user, stake, shares)`, `PayoutClaimed(callId, user, amount)`, `PositionExited(callId, user, isFollow, penaltyAmount, amountReturned)`. |
| **Events consumed (off-chain)** | Subgraph reads all four for `Position` entity tracking. OG service watches `Followed`/`Faded`/`PositionExited` for state-change invalidation of the Live receipt card. |
| **Trust boundary** | None inbound. **Critical gate:** `block.timestamp < call.expiry` (step 5 of `follow`/`fade`) prevents post-expiry sniping. |

### 2.3 ChallengeEscrow

| Aspect | Specification |
|---|---|
| **Owns** | `mapping(uint256 => Challenge) challenges` (challengeId → struct with callId, challenger, stake, proposedAt, status, winner), `nextChallengeId`, `claimed[challengeId]`. |
| **Reads from** | **CallRegistry** (`getCall(callId)` for `status`, `openToChallenges`, `caller`, `expiry`). **USDC ERC-20**. |
| **Written by** | Users directly (`proposeChallenge`, `acceptChallenge`, `rejectChallenge`, `claimRefund`, `claimDuelPayout`); **SettlementManager** (sets `challenge.status = Settled` and `winner` at step 8 of `settle`). |
| **Events emitted** | `ChallengeProposed(challengeId, callId, challenger)`, `ChallengeAccepted(challengeId)`, `ChallengeRejected(challengeId)`, `ChallengeRefunded(challengeId)`, `ChallengeSettled(challengeId, winner, payout)`. |
| **Events consumed (off-chain)** | Subgraph reads all five for `Challenge` entity. OG service watches `ChallengeSettled` to regenerate DuelSettled card. |
| **Trust boundary** | None inbound. **Critical gates:** `msg.sender != call.caller` (self-challenge ban) and `call.openToChallenges` (contract-level, not just UI). |

### 2.4 SettlementManager

| Aspect | Specification |
|---|---|
| **Owns** | `mapping(uint256 => uint8) retryCount[callId]` (Pyth confidence retries, max 30), `mapping(uint256 => Dispute) disputes`, `counterClaimCount[callId]`, `mapping(uint256 => uint64) settledAt[callId]`, the authorized `stylusScoreEngine` address (set at deploy, immutable), the `treasury` address, `owner`. |
| **Reads from** | **CallRegistry** (`getCall(callId)`), **Pyth** (`IPyth.getPriceNoOlderThan(priceId, 60)`), **StylusScoreEngine** (via proxy, `compute_rep_change`). **Signed relayer attestations** (verified via ecrecover against the configured relayer pubkey) for NFT TWAP, DefiLlama TVL/Vol/Fees, Snapshot snapshots, CEX listing claims. **Tally** (direct on-chain governance read; no relayer signature needed). **Arbitrum RPC** (for on-chain metric subtypes — read in same tx via static calls). |
| **Written by** | Users / relayer (`settle`, `raiseDispute`); **Owner** (`resolveDispute`, `forceSettle`). |
| **Writes to** | **CallRegistry** (`call.status = Settled`, `call.outcome`, clear `activeDuplicateHashes`); **FollowFadeMarket** (LP fee injection); **ChallengeEscrow** (set duel winner); **ProfileRegistry** (`updateAfterSettlement` for caller; same for challenger if duel). |
| **Events emitted** | `CallSettled(callId, outcome, priceDelta)`, `SettlementDelayed(callId, reason, retryAfter)`, `DisputeRaised(callId, challenger, evidenceHash)`, `DisputeResolved(callId, finalOutcome, resolver)`, `RepCalculated(callId, user, currentRep, conviction, consensusPct, isWinner, baseValue, delta)`, `RepCalculatedFallback(callId, user, baselineDelta, lowLevelError)`, `CallForceSettled(callId, outcome, owner)`. |
| **Events consumed (off-chain)** | Subgraph reads `CallSettled`, `RepCalculated`, `RepCalculatedFallback` for `Settlement` and `RepEvent` entities. OG service watches `CallSettled` to regenerate Settled card. Alert bot watches `SettlementDelayed`, `RepCalculatedFallback`, `CallForceSettled`. |
| **Trust boundary** | **The biggest trust surface in the system.** Inbound signed attestations from relayer for non-Pyth oracle data. Owner is the dispute resolver and the only `forceSettle` caller. See §5 for the full trust inventory. |

### 2.5 ProfileRegistry

| Aspect | Specification |
|---|---|
| **Owns** | `mapping(address => Profile) profiles` (globalRep, categoryRep[3], callerRep, challengerRep, streak, totalCalls, settledCalls, wins, losses, lastActiveAt), `mapping(address => SocialIdentity) socials` (twitterHandle, farcasterHandle, proof hashes, linkedAt), `currentSettlementManager`, `currentRelayer`, `owner`. |
| **Reads from** | None — terminal state store. (Owner reads `currentSettlementManager` only to rotate it.) |
| **Written by** | **SettlementManager** (`updateAfterSettlement` — restricted via `NotAuthorizedSettlementManager`); **Relayer** (`linkTwitter`, `linkFarcaster` — restricted via `NotAuthorizedRelayer`); **Users directly** (`unlinkTwitter`, `unlinkFarcaster` — no relayer required); **Owner** (`setSettlementManager`, `setRelayer`). |
| **Events emitted** | `ProfileUpdated(user, newGlobalRep)`, `SocialLinked(user, platform, handle)`, `SocialUnlinked(user, platform)`, `SettlementManagerUpdated`, `RelayerUpdated`. |
| **Events consumed (off-chain)** | Subgraph reads all for `Profile` entity. |
| **Trust boundary** | Inbound: Relayer key. Compromise → forged `VERIFIED · X` / `VERIFIED · FC` badges. See §5. |

### 2.6 StylusScoreEngine

| Aspect | Specification |
|---|---|
| **Owns** | No storage — pure function. **The implementation is stateless reputation math** (confidence × contrarian × asymmetry × floor-clamp). State lives in ProfileRegistry. |
| **Reads from** | None — inputs are passed in (currentRep, conviction, consensusPct, isWinner, baseValue). |
| **Written by** | N/A (no storage). Called via `try/catch` from SettlementManager at step 7 of `settle`. |
| **Events emitted** | None (the engine returns `int32`; SettlementManager emits `RepCalculated` / `RepCalculatedFallback`). |
| **Deployment** | Solidity `TransparentUpgradeableProxy` at a fixed address; implementation slot points to: (a) Stylus Rust implementation (primary, via cargo-stylus deploy), or (b) Solidity baseline implementation (fallback, deployed at all times alongside Stylus). **Proxy admin** is the deployer key initially; rotated to Safe multisig pre-v1.1. |
| **Trust boundary** | Proxy admin (= owner key in v1) controls upgrade. Compromise → arbitrary rep math substitution. Mitigation: multisig promotion before v1.1. |

### 2.7 Relayer Subsystems (off-chain, Fastify + BullMQ + Redis)

Single Node process orchestrating multiple cron jobs and per-oracle adapters. Single deployment (not split) for v1 — fewer moving parts to operate. Splits noted below for v1.1.

| Subsystem | Responsibility | Inputs | Outputs | Crons / Triggers |
|---|---|---|---|---|
| **Settle scheduler** | Identifies calls past expiry, attempts `settle()` via standard tx submission | Subgraph query for `Call where expiry < now AND status = Live` | `settle(callId)` tx | Every 60s |
| **Pyth retry worker** | Re-attempts settle for calls in `SettlementDelayed` state (BullMQ delayed job) | `SettlementDelayed` events from subgraph | `settle(callId)` retry | Per-event, 60s delay, max 30 retries |
| **Pyth Hermes pull** | Fetches update VAA before each settle, calls `IPyth.updatePriceFeeds()` with ETH fee | Hermes WebSocket / REST | On-chain Pyth price feed updated | Just-in-time before each `settle` |
| **Alchemy NFT TWAP** | Polls `getFloorPrice` + `getNFTSales` every 5 min per collection; accumulates 24h observations; signs TWAP at settle time | Alchemy NFT API (Ethereum mainnet) | `submitNftFloor(callId, twapPriceWei, observationCount, evidenceHash)` tx (signed by relayer key) | Every 5 min for active calls |
| **DefiLlama adapter** | Polls TVL/volume/fees/APR at deadline; signs and submits | `api.llama.fi`, `yields.llama.fi`, `coins.llama.fi` | `submitDefillamaData(callId, value, evidenceHash)` tx | At each event-call deadline |
| **Snapshot adapter** | Polls proposal state at deadline; signs and submits | `@snapshot-labs/snapshot.js` | `submitSnapshotResult(callId, passed, evidenceHash)` tx | At each governance-call deadline |
| **Tally adapter** | Reads proposal state via Tally GraphQL OR via direct on-chain call to the Governor contract | Tally GraphQL endpoint OR Arbitrum RPC | Direct contract read (no signature needed when via RPC); else signed submission | At each governance-call deadline |
| **CEX scrapers** | 8 Playwright headless scrapers (Binance, Coinbase, OKX, Bybit, Kraken, Bitget, KuCoin, Upbit). Each polls its exchange's listing announcement page. Modular per-exchange selectors. | Public HTML pages | `submitCexListing(callId, listed, evidenceHash, exchange)` tx | Every 5 min for active CEX-listing calls |
| **OAuth proof verifier** | Receives signed message from frontend authorizing a Twitter/Farcaster link; verifies OAuth proof server-side via @privy-io/server-auth or @farcaster/auth-client; submits `linkTwitter`/`linkFarcaster` tx to ProfileRegistry | Frontend POST `/api/social/link` | `linkTwitter(user, handle, proofHash)` or `linkFarcaster(user, handle, proofHash)` tx | Per-user-request |
| **OG image service** | Renders 5 card variants (Live, Settled, DuelSettled, CallerExited, Fallback) via @vercel/og + Satori. Pure flexbox (no grid). Node runtime. Cached on CDN with state-change invalidation triggered by event watchers. | Subgraph query + on-chain reads for outcome data | PNG response, CDN-cached | On-demand HTTP GET; invalidation triggered by event watcher on state changes |
| **Twitter follow-graph cache** | Fetches `users/:id/following` via X API Basic tier; caches per-user 1h; cross-references with `ProfileRegistry.socials.twitterHandle` for "From your X" feed | X API + ProfileRegistry | JSON response to frontend `/api/feed/from-your-x` | Lazy (on user feed open), 1h TTL |
| **Paymaster gating** | Server-side counter per user (5 sponsored tx max), global daily cap ($50/day at launch), routes 6th+ tx to "fund your wallet" UX | Frontend tx requests | Allow/deny + paymaster signing or rejection | Per-tx-attempt |
| **Alert bot** | Listens to subgraph + RPC events; pages operator via Telegram on `SettlementDelayed`, `RepCalculatedFallback`, `CallForceSettled`, `Paused`, paymaster 80% cap, TVL >= 90% of cap, settle stuck >25min, dispute raised | Subgraph + event filters | Telegram messages | Continuous |
| **Subgraph mapper** | (Indirect — not a relayer subsystem; runs on The Graph indexers.) Compiles WASM mappings from AssemblyScript that translate events into the subgraph schema entities | All contract events | Subgraph entity inserts/updates | Per-block |
| **Metrics exporter** | Pino structured logs → Better Stack (or Grafana Cloud + Prometheus). Dashboards for TVL, calls/hr, settlement latency, dispute rate, failed-tx rate. | All other subsystems via Pino | Time-series metrics | Continuous |

**Split for v1.1, not v1:** OG service can split out to its own Vercel deployment (it's already idempotent and stateless). CEX scrapers can split out to their own region (closer to exchange origin). Both stay co-hosted in v1.

### 2.8 Frontend (Next.js 16 App Router)

| Aspect | Specification |
|---|---|
| **Owns** | All UI state; no canonical data ownership. |
| **Reads from** | **Subgraph** (primary read path for feed, profile, leaderboard, receipt page). **Direct contract reads via viem** (for live position queries, pending tx state, fresh allowances/balances — anything that needs <30s freshness). **Relayer HTTP API** (`/api/social/link` for OAuth posting, `/api/feed/from-your-x` for follow-graph, `/og/[callId]` for OG cards). **Privy** (auth state, embedded wallet). |
| **Writes to** | Contracts via wagmi `useWriteContract` (createCall, follow, fade, claimPayout, exitPosition, callerExit, proposeChallenge, acceptChallenge, etc.). |
| **Server-rendered routes** | `/call/[id]` server-renders OG meta tags (og:image points to `api.callitapp.xyz/og/[id]`). All other routes are client-side after initial paint. |
| **Client provider tree (load-bearing order)** | `<PrivyProvider>` → `<QueryClientProvider>` → `<WagmiProvider from @privy-io/wagmi>` → `<AuthKitProvider from @farcaster/auth-kit>` → children. All inside an `app/providers.tsx` with `'use client'` at line 1. |

### 2.9 Subgraph (The Graph)

| Aspect | Specification |
|---|---|
| **Owns** | Indexed entity store: `Call`, `Position`, `Challenge`, `Settlement`, `Profile`, `RepEvent`, `Dispute`, `Aggregates` (per-user roll-ups for leaderboard). |
| **Reads from** | Arbitrum One block data via the indexer's archive node. |
| **Writes to** | Its own Postgres store (managed by indexers). |
| **Consumed by** | Frontend (via The Graph GraphQL endpoint, with API key from Subgraph Studio). |
| **Deployed to** | Subgraph Studio (dev/staging on Arbitrum Sepolia) → Decentralized Network (production on Arbitrum One). |
| **Fallback** | If subgraph is behind during deploy: viem `getLogs` polling at 5s interval against CallRegistry/FollowFadeMarket/SettlementManager. Client-side aggregation. Leaderboard queries return "data loading" placeholder for 48-72h post-publish. |

---

## 3. Data Flow Traces

Each trace is end-to-end: UI → contract → indexer → UI. Off-chain components annotated inline.

### 3.1 Call Creation

```
[1] User on /new (frontend)
        │  fills form: marketType, asset(s), targetValue, expiry, conviction (1-100),
        │  stake ($5-$100), reasoningText, criteriaText (req for events 3-6),
        │  parentCallId (0 if not quote), category, openToChallenges
        ▼
[2] Frontend pre-checks (UX only, NOT trust):
        │  - allowlisted asset? (read CallRegistry.allowlistedAssets via viem)
        │  - computeDuplicateHash(...) view call → existing collision? warn user
        │  - settledCalls < 10 && conviction >= 85? show ConvictionCapped preview
        │  - USDC.allowance(user, CallRegistry) >= stake + $10? else prompt approve
        │  - upload reasoningText + criteriaText to IPFS via Pinata → get hashes
        ▼
[3] Two-step publish UI: review modal → wallet confirm
        ▼
[4] wagmi useWriteContract → CallRegistry.createCall(...) via Privy embedded wallet
        │  paymaster sponsors if user.sponsoredTxCount < 5 && dailyCap not hit
        ▼
[5] CallRegistry.createCall — atomic, all 16 contract-level checks per §12.1:
        │   1. !paused                                           (revert Paused)
        │   2. expiry > now                                      (revert ExpiryNotInFuture)
        │   3. category < CATEGORY_COUNT                         (revert CategoryInvalid)
        │   4. stake >= $5                                       (revert StakeBelowMinimum)
        │   5. stake <= $100                                     (revert StakeAboveMaximum)
        │   6. tvl + stake + $5 virtual <= tvlCap                (revert TvlCapReached)
        │   7. assetA, assetB (if non-zero) allowlisted          (revert AssetNotAllowlisted)
        │   8. For event subtypes 3-6: criteriaHash != 0         (revert CriteriaRequired)
        │   9. compute duplicateHash from params (UTC floor)
        │  10. activeDuplicateHashes[hash] == 0                  (revert DuplicateCall)
        │  11. Read ProfileRegistry.getProfile(caller).settledCalls
        │      if < 10 && conviction >= 85: set conviction=84, emit ConvictionCapped
        │  12. USDC.allowance(caller, this) >= stake + $10       (revert InsufficientUsdcAllowance)
        │  13. USDC.balanceOf(caller) >= stake + $10             (revert InsufficientUsdcBalance)
        │  14. USDC.safeTransferFrom(caller, this, stake + $10)
        │  15. Route $5 to treasury; $5 to FollowFadeMarket's virtualFadeSeed[callId]
        │      virtualFadeSeed[callId] = $7 ($5 from fee + $2 base)
        │  16. Store call, activeDuplicateHashes[hash] = callId
        ▼
[6] CallCreated event emitted (id, caller, marketType, stake)
        ▼
[7] Tx mined on Arbitrum (~250ms block)
        ▼
[8] Subgraph indexer picks up CallCreated within ~30s (Decentralized Network SLA)
        │  → creates Call entity with all fields, including reasoningHash, criteriaHash
        │  → joins Profile entity for caller
        ▼
[9] Frontend listens via wagmi useWaitForTransactionReceipt → on success:
        │  - optimistically inserts call into local feed cache
        │  - navigates to /call/[newCallId]
        │  - triggers OG service warm: GET api.callitapp.xyz/og/[newCallId]
        ▼
[10] /call/[newCallId] (Live receipt page) — reads from subgraph (or polled-events fallback)
        │  - renders live activity feed (empty initially)
        │  - renders pool bars (just the $7 virtual fade seed visible on the fade side)
        │  - server-rendered <meta property="og:image" content="...og/[id]"> serves Live card
        ▼
[11] Subgraph fresh data propagates to /feed (The Tape) for all other users within 30-60s
```

**Key invariants:** $10 creation fee always moves ($5 treasury + $5 virtual fade). Duplicate hash always cleared by SettlementManager on settle. Conviction cap is silent — auto-applied at conviction=84, no revert, ConvictionCapped event lets UI show "you wanted 90%, we capped at 84%; settle 10 calls to unlock high-conviction".

### 3.2 Follow / Fade

```
[1] User on /call/[id] taps FOLLOW (or FADE)
        ▼
[2] Frontend computes expected sharesOut from current pool state:
        │  expectedShares = followPool * stake / (followPool + stake) (or fade variant)
        │  minSharesOut = expectedShares * 0.99   (1% slippage tolerance)
        ▼
[3] Pre-check USDC.allowance via viem; if insufficient, prompt approve first
        ▼
[4] wagmi useWriteContract → FollowFadeMarket.follow(callId, stake, minSharesOut)
        ▼
[5] FollowFadeMarket.follow — atomic, all 11 contract checks per §12.2:
        │   1. !paused
        │   2. stake >= $1 MIN_POSITION
        │   3. stake <= $100 MAX_POSITION (cumulative per user per pool)
        │   4. call.status == Live || CallerExited
        │   5. block.timestamp < call.expiry                  ★ critical post-expiry gate
        │   6. tvl + stake <= tvlCap                          (aggregate across all pools)
        │   7. compute sharesMinted from AMM curve
        │   8. sharesMinted >= minSharesOut                   ★ sandwich protection
        │   9. USDC.safeTransferFrom(user, this, stake)
        │  10. positionEntryTime[callId][user][FOLLOW] = now   (resets on add-to-position)
        │  11. mint shares, update pool reserve
        ▼
[6] Followed (or Faded) event emitted (callId, user, stake, shares)
        ▼
[7] Subgraph creates Position entity (user, callId, side, shares, entryTime, stake)
        │  also updates Call.followPool/fadePool roll-up fields
        ▼
[8] Frontend useWaitForTransactionReceipt → success:
        │  - optimistic update to live activity feed: "X just followed with $50"
        │  - pool bars animate (5-second polling for hackathon; WebSocket is v1.1)
        ▼
[9] OG service detects state change (subgraph poll OR event watcher),
        │  invalidates CDN cache for /og/[callId]
        │  next share-link request regenerates Live card with new pool ratio
        ▼
[10] All other users viewing /call/[id] see updated pools within ~5s (polling) or ~30s (subgraph)
```

**Edge cases:**
- User adds to existing position → entry timestamp resets to current → 4h cooldown restarts. Documented in spec to prevent partial-exit gaming.
- `CallerExited` status still allows new follows/fades (call continues for everyone else per §8.7.2). UI shows amber banner.

### 3.3 Settlement (the hub — orchestrates all 6 contracts)

```
[1] Cron in relayer (every 60s): query subgraph for { calls(where: { expiry_lt: now, status: Live }) }
        ▼
[2] For each candidate callId, dispatch to oracle adapter based on (marketType, eventSubtype):

    ┌────────────────┬─────────────────────────────────────────────────────────────┐
    │ marketType     │ Oracle path                                                   │
    ├────────────────┼─────────────────────────────────────────────────────────────┤
    │ PriceTarget    │ Pyth Hermes pull → updatePriceFeeds → getPriceNoOlderThan(60)│
    │ SpreadVs       │ Same as above, both assetA + assetB in same block             │
    │ EventBinary 0  │ DefiLlama TVL adapter → relayer signs → submit               │
    │ EventBinary 1  │ DefiLlama volume/fees adapter → relayer signs → submit       │
    │ EventBinary 2  │ Direct RPC + DefiLlama Liquidations adapter                  │
    │ EventBinary 3  │ CEX scraper (Playwright, 8 exchanges) → relayer signs        │
    │ EventBinary 4  │ Pyth (token launch price) OR DefiLlama (TVL of new protocol) │
    │ EventBinary 5  │ Snapshot read OR Tally direct RPC                            │
    │ EventBinary 6  │ Direct RPC + DefiLlama Yields                                │
    └────────────────┴─────────────────────────────────────────────────────────────┘
        ▼
[3] For Pyth-backed reads: relayer fetches update VAA from Hermes, includes in tx
        ▼
[4] Submit: SettlementManager.settle(callId)
        │  (anyone can call; relayer is paying gas in normal operation;
        │   permissionless settlement means UI also offers a "Settle" button
        │   on overdue calls as backup)
        ▼
[5] SettlementManager.settle — atomic, 14 steps per §12.4:
        │   1. !paused                                          (settle IS paused under emergency)
        │   2. call.status == Live                              (idempotency: AlreadySettled)
        │   3. block.timestamp >= call.expiry                   (CallNotExpired)
        │   4. dispatch to oracle adapter
        │   5. Pyth confidence check: confidence × 200 <= price
        │      If not: emit SettlementDelayed(callId, "PYTH_CONFIDENCE_WIDE", 60s)
        │              increment retryCount[callId]; if >30, open dispute window
        │              return early (does NOT revert tx — different from other reverts)
        │   6. Compute outcome deterministically from oracle data
        │   7. try StylusScoreEngine.compute_rep_change(...) returns delta:
        │           ProfileRegistry.updateAfterSettlement(caller, category, true, isWinner, delta)
        │           emit RepCalculated(...)
        │      catch (bytes err):
        │           baselineDelta = _solidityBaselineRepDelta(...)
        │           ProfileRegistry.updateAfterSettlement(caller, category, true, isWinner, baselineDelta)
        │           emit RepCalculatedFallback(callId, caller, baselineDelta, err)
        │      (skip entirely if caller exited per §8.7.3)
        │   8. For duels: same try/catch for challenger; ChallengeEscrow.setWinner;
        │      apply ~1.5× rep movement to both parties
        │   9. For followers/faders: NO per-user rep updates; just mark settled
        │      claimPayout pull-pattern unlocks
        │  10. Cold-start: if call won AND real fade pool (excl. $7 virtual) == 0,
        │      scale caller's delta to 25% before applying
        │  11. Pay fees: 1.0% protocol → treasury; 0.4% creator → caller (Model B if exited);
        │      0.3% LP → winning pool reserve in FollowFadeMarket
        │  12. activeDuplicateHashes[call.duplicateHash] = 0    (CallRegistry call)
        │  13. CallRegistry: call.status = Settled, call.outcome = outcome
        │  14. emit CallSettled(callId, outcome, priceDelta)
        ▼
[6] If step 5 returned early with SettlementDelayed:
        │  BullMQ delayed job re-runs settle in 60s
        │  Loop up to 30 times = 30 minutes total Pyth retry window
        │  After 30 fails, dispute window opens (24h)
        ▼
[7] Tx mined, all events emitted
        ▼
[8] Subgraph picks up CallSettled, RepCalculated/Fallback, ChallengeSettled (if dup)
        │  → updates Call.status, Call.outcome, Profile.globalRep, Profile.settledCalls++
        │  → creates Settlement entity, RepEvent entity
        ▼
[9] ProfileRegistry.updateAfterSettlement triggers ProfileUpdated event
        │  → subgraph updates Profile rep aggregates
        ▼
[10] OG service event watcher detects CallSettled → invalidates CDN cache for /og/[callId]
        │  → next share-link click regenerates Settled card with outcome word as hero
        ▼
[11] Frontend /call/[id]:
        │  - subgraph push (or 5s poll) flips Live → Settled view
        │  - stamp animation triggers on outcome word reveal (§17.2)
        │  - Share button switches to Settled OG URL
        │  - auto-post to Twitter if user opted in (relayer hits Twitter API with caller's OAuth token)
        ▼
[12] Dispute window (24h) opens; if any user files dispute, status goes Settled → Disputed
```

**Atomicity guarantee:** All 14 steps in single tx. Any revert = full rollback. The only intentional non-revert is step 5's `SettlementDelayed` early-return (so retry can reschedule).

### 3.4 Caller Exit

```
[1] User on /call/[id] (caller view) — sees "EXIT THIS CALL" button only if:
        │  - msg.sender == call.caller
        │  - now >= call.createdAt + 24h (lock)
        │  - call.status == Live
        ▼
[2] Frontend calls CallRegistry.computeCallerExitPenalty(callId) view function
        │  → displays: "Exit now: 32% penalty ($16 of $50 stake forfeited). Rep -28."
        ▼
[3] Two-step UI: review modal showing penalty math → wallet confirm
        ▼
[4] wagmi useWriteContract → CallRegistry.callerExit(callId)
        ▼
[5] CallRegistry.callerExit — 12 steps per §12.1:
        │   1. !paused
        │   2. msg.sender == call.caller                        (NotCaller)
        │   3. now >= call.createdAt + 24h                      (CallerExitLocked)
        │   4. call.status == Live                              (CallerAlreadyExited or Settled)
        │   5. penaltyPct = 15 + (35 × time_remaining_ratio)
        │   6. penaltyAmount = call.stake × penaltyPct / 100
        │   7. Split penalty: 50% to follow pool, 40% to fade pool, 10% treasury
        │      (added to FollowFadeMarket pool reserves — k grows, shares appreciate)
        │   8. callerVolumeAtExit = followPool + fadePool       (Model B snapshot)
        │   9. call.callerExitedAt = now
        │      call.status = CallerExited
        │  10. Apply reputation slash via ProfileRegistry.updateAfterSettlement
        │      (the exit IS the settlement for the caller per §8.7.3;
        │       eventual settle() will NOT apply additional rep changes to caller)
        │  11. USDC.safeTransfer(caller, stake - penaltyAmount)
        │  12. emit CallerExited(callId, caller, timeElapsed, penaltyPaid, stakeReturned, repDelta)
        ▼
[6] Subgraph picks up CallerExited → Call.status = CallerExited, Profile.globalRep updated
        ▼
[7] OG service event watcher → regenerates CallerExited card (amber theme)
        ▼
[8] Alert bot fans out broadcast:
        │  - Telegram alert to operator
        │  - "From your X" feed gets prepended with caller's exit (drama post)
        │  - All followers/faders see notification on next feed open
        │  - Caller's auto-post-to-X fires with the CallerExited share card
        ▼
[9] /call/[id] now shows amber "CALLER EXITED" header; pools continue to accept
        │  follow/fade until expiry (call settles normally for everyone else)
        ▼
[10] At expiry, SettlementManager.settle(callId) runs:
         │  - oracle resolves outcome
         │  - followers/faders payouts via claimPayout pull pattern
         │  - challenger rep moves (if any duel)
         │  - caller skipped entirely in step 7 of settle (per §8.7.3)
```

**Asymmetry to remember:** `CallerExited` is the only call status where the *caller* is finalized (rep already moved) but the call *itself* still settles later. This split-finality is why the spec distinguishes `status == CallerExited` (caller out, call live for others) from `status == Settled` (everyone out).

### 3.5 Challenge (1v1 Duel)

```
[1] User on /call/[id] (not the caller) taps "CHALLENGE THIS CALLER"
        │  - UI checks: call.openToChallenges == true, call.status == Live, now < expiry
        ▼
[2] User picks counter-stake (default: match caller's stake)
        │  - UI pre-checks USDC.allowance, prompts approve if needed
        ▼
[3] wagmi useWriteContract → ChallengeEscrow.proposeChallenge(callId, stake)
        ▼
[4] ChallengeEscrow.proposeChallenge — 11 steps per §12.3:
        │   1. !paused
        │   2. read call from CallRegistry
        │   3. call.status == Live                              (CallNotChallengeable)
        │   4. call.openToChallenges                            (CallerNotOpenToChallenges)
        │   5. msg.sender != call.caller                        ★ self-challenge ban
        │   6. now < call.expiry                                (CallNotChallengeable)
        │   7. stake in [$5, $100]                              (same bounds as call stake)
        │   8. USDC pre-checks (allowance, balance)
        │   9. USDC.safeTransferFrom(challenger, this, stake)
        │  10. record Challenge { callId, challenger, stake, proposedAt=now, status=Proposed }
        │  11. emit ChallengeProposed(challengeId, callId, challenger)
        ▼
[5] Subgraph: creates Challenge entity (status=Proposed, callId, challenger, stake)
        ▼
[6] Original caller sees notification on /feed: "X wants to duel you for $50"
        │  - 24h window starts ticking
        ▼
[7] Three paths:

    Path A — Caller accepts:
        ChallengeEscrow.acceptChallenge(challengeId)
          1. !paused
          2. msg.sender == call.caller                          (NotOriginalCaller)
          3. challenge.status == Proposed                        (WrongChallengeStatus)
          4. now <= challenge.proposedAt + 24h                   (AcceptanceWindowExpired)
          5. USDC.safeTransferFrom(caller, this, matchingStake)
          6. challenge.status = Accepted
          7. emit ChallengeAccepted

    Path B — Caller rejects:
        ChallengeEscrow.rejectChallenge(challengeId)
          → refunds challenger immediately, status = Rejected

    Path C — 24h expires, no action:
        ChallengeEscrow.claimRefund(challengeId)
          → after expiry, challenger pulls back stake, status = Refunded

        ▼
[8] On accept: subgraph updates Challenge.status = Accepted
        │  → /duels tab and /call/[id] show "DUEL ACCEPTED · POT $100"
        │  → DuelKing badge tracking updates (7d streak)
        ▼
[9] When call.expiry hits, SettlementManager.settle(callId):
        │  - step 6 computes call.outcome (caller's side wins / loses)
        │  - step 8 (duel-specific): inverse outcome for challenger, ~1.5× rep deltas to both,
        │    ChallengeEscrow.setSettled(challengeId, winner)
        │  - emit ChallengeSettled(challengeId, winner, payout)
        ▼
[10] Winner calls ChallengeEscrow.claimDuelPayout(challengeId):
         │  pot = min(callerStake, challengerStake) × 2
         │  payout = pot × 99 / 100 (1% protocol fee per §8.9)
         │  overage (if asymmetric) returned to overcommitter regardless of outcome
         ▼
[11] OG service regenerates DuelSettled card (two-avatar WINS layout per §16.4)
         │  → auto-post to X if either party opted in
```

### 3.6 Dispute

```
[1] Settled call /call/[id] shows "DISPUTE" button to any logged-in user during
        24h post-settlement window
        ▼
[2] User clicks DISPUTE → modal:
        │  - text area for evidence (uploaded to IPFS via Pinata → evidenceHash)
        │  - $5 USDC bond explanation
        │  - "If your dispute is upheld, you receive bond back + $2 reward.
        │     If rejected, bond is forfeit to treasury."
        ▼
[3] Frontend uploads evidence text to IPFS, gets CID, converts to bytes32 hash
        ▼
[4] wagmi useWriteContract → SettlementManager.raiseDispute(callId, evidenceHash)
        │  (function is `payable` per spec but bond is USDC — implementation does
        │   safeTransferFrom for the $5 bond rather than msg.value;
        │   the `payable` interface annotation is for the calling convention only)
        ▼
[5] SettlementManager.raiseDispute — 7 steps per §12.4:
        │   1. USDC.safeTransferFrom(user, this, $5)            (DisputeBondInsufficient)
        │   2. call.status in {Settled, Disputed}
        │   3. now <= settledAt[callId] + 24h                   (DisputeWindowClosed)
        │   4. counterClaimCount[callId] < 3                    (CounterClaimLimitReached)
        │   5. Record dispute { disputer, evidenceHash, bondAmount, raisedAt }
        │   6. If first dispute against Settled call: call.status = Disputed
        │   7. emit DisputeRaised(callId, challenger, evidenceHash)
        ▼
[6] Subgraph creates Dispute entity, Call.status = Disputed
        ▼
[7] Alert bot pings operator (Telegram)
        ▼
[8] Operator reviews evidence (IPFS CID rendered in dashboard):
        │  - if dispute valid → SettlementManager.resolveDispute(callId, newOutcome)
        │  - if dispute invalid → SettlementManager.resolveDispute(callId, originalOutcome)
        ▼
[9] SettlementManager.resolveDispute — 7 steps per §12.4:
        │   1. msg.sender == owner                              (NotOwner)
        │   2. call.status == Disputed                          (WrongCallStatus)
        │   3. If finalOutcome != call.outcome (FLIP):
        │      - Reverse rep deltas via Stylus/baseline with negation flag
        │      - Re-distribute pool USDC: clawback shareholders who already claimed
        │        the wrong outcome (in v1: post-claim disputes are NOT honored;
        │        dispute window is shorter than typical claim activity to make this rare)
        │   4. If disputer wins: refund bond + $2 reward from treasury
        │   5. Else: forfeit bond to treasury
        │   6. call.status = Settled, call.outcome = finalOutcome
        │   7. emit DisputeResolved(callId, finalOutcome, msg.sender)
        ▼
[10] Subgraph updates Call.status = Settled, Call.outcome flipped if applicable
         │  → Profile.globalRep updated for the rep reversal
         ▼
[11] OG service event watcher → regenerates Settled card (which may now show a different
         outcome word) and tags it with "DISPUTE RESOLVED · [date]" subline
```

**Operational discipline:** the spec acknowledges that post-claim disputes ("rep already flowed, shareholders already pulled") are operationally hard. v1 mitigation = 24h dispute window kicks in *immediately* on settle, before most users would claim (typical claim activity is in the 24-72h window after settle). Realistic edge cases get owner-discretion handling.

---

## 4. Build-Order Dependency DAG

The spec's Phase 1-9 is the canonical order. This DAG explicitly includes shared-infra nodes and identifies one tightening opportunity (subgraph + OG service can land earlier than Phase 7).

```
                            ┌──────────────────────────────────────┐
                            │  Phase 0 — Foundation (always live)  │
                            └──────────────────────────────────────┘
                                            │
   ┌────────────────────────────────────────┼────────────────────────────────────────┐
   ▼                ▼                ▼      ▼      ▼                ▼                ▼
┌──────┐      ┌─────────┐      ┌──────┐ ┌──────┐ ┌─────────┐  ┌──────────┐    ┌──────────┐
│Repo  │      │Multisig │      │IPFS  │ │CDN   │ │Subgraph │  │Relayer   │    │Monitoring│
│mono- │      │Safe     │      │Pinata│ │Cloud-│ │schema   │  │skeleton  │    │stack     │
│repo  │      │2-of-3   │      │acct  │ │flare │ │+ entities│  │Fastify+  │    │BetterSt+ │
│pnpm  │      │         │      │      │ │      │ │+ first  │  │BullMQ+   │    │Telegram  │
│Turbo │      │         │      │      │ │      │ │mappings │  │Redis+    │    │bot       │
│      │      │         │      │      │ │      │ │stubbed  │  │viem      │    │          │
└──┬───┘      └────┬────┘      └──┬───┘ └──┬───┘ └────┬────┘  └────┬─────┘    └────┬─────┘
   │ all phases    │ owner-key    │       │ OG card  │ event ingest │             │ all phases
   │ depend on     │ rotation     │       │ cache    │              │             │
   │ this          │ pre-v1.1     │       │          │              │             │
   ▼               │              │       │          │              │             │
┌────────────────────────────────────────────────────────────────────────────────────┐
│  Phase 1 — Core contracts + auth + frontend skeleton                                │
│  ┌──────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌─────────────────┐│
│  │ ProfileRegistry  │  │  CallRegistry  │  │ Privy provider │  │ Onboarding flow ││
│  │  (Sepolia)       │  │  (Sepolia)     │  │  3 sign-in     │  │  + Sign-in (15.8││
│  │  Solidity 0.8.30 │  │  reads Profile │  │  paths +       │  │  + Custody      ││
│  │                  │  │  for Gate 6.3  │  │  embedded wlt  │  │   disclosure    ││
│  └────────┬─────────┘  └────────┬───────┘  └────────┬───────┘  └─────────────────┘│
│           │                     │                   │                              │
│           │  Coinbase Onramp · Address book · SIWE re-sign · Paymaster $50/day cap │
│           └─────────────────────┴───────────────────┘                              │
│                                  │                                                 │
│   (Phase 1.5 social linking runs in parallel below)                                │
└────────────────────────────────────┬──────────────────────────────────────────────┘
                                     │
            ┌────────────────────────┼────────────────────────┐
            ▼                                                 ▼
┌────────────────────────────────┐              ┌──────────────────────────────┐
│ Phase 1.5 — Social linking      │              │ Phase 2 — FollowFadeMarket   │
│ (parallel to Phase 2)           │              │ - single contract sub-state  │
│ Relayer OAuth proof verifier    │              │ - slippage protection        │
│ ProfileRegistry.linkTwitter     │              │ - post-expiry gate           │
│ ProfileRegistry.linkFarcaster   │              │ - position exit (4h, 10%)    │
│ VERIFIED · X / FC badges        │              │ - TVL aggregation boundary   │
│ 24h cooldown on new auth links  │              │ - reads CallRegistry         │
└──────────────┬──────────────────┘              └──────────────┬───────────────┘
               │                                                │
               │                  ┌─────────────────────────────┘
               │                  ▼
               │      ┌──────────────────────────────┐
               │      │ Phase 3 — ChallengeEscrow    │
               │      │ - reads CallRegistry         │
               │      │ - reads openToChallenges     │
               │      │ - self-challenge gate        │
               │      └──────────────┬───────────────┘
               │                     │
               ▼                     ▼
    ┌──────────────────────────────────────────────────────────────┐
    │ Phase 4 — SettlementManager + oracle adapters                │
    │ (the integration hub — depends on all 4 prior contracts)     │
    │                                                              │
    │  Pyth Hermes pull/push · Alchemy NFT TWAP · DefiLlama        │
    │  Snapshot · Tally · CEX scrapers (8) · OAuth proof           │
    │  try/catch placeholder (Stylus not yet deployed)              │
    │  Solidity baseline rep delta IN-CONTRACT (always shipped)    │
    │  Dispute window 24h + $5 bond                                │
    │  ForceSettle owner-only at expiry+7d                         │
    └──────────────────────────────┬───────────────────────────────┘
                                   │
                                   ▼
                ┌────────────────────────────────────┐
                │ Phase 5 — StylusScoreEngine        │
                │ (Rust + transparent proxy)         │
                │                                    │
                │ ★ 48h-before-demo cutoff:           │
                │   if Stylus path broken, swap to    │
                │   Solidity baseline at same proxy   │
                │   slot. Pitch becomes "Stylus in    │
                │   production roadmap."              │
                └──────────────┬─────────────────────┘
                               │
                               ▼
              ┌────────────────────────────────┐
              │ Phase 6 — Safety review        │
              │ (MOVED EARLIER per spec)       │
              │ - All Phase 6 checklist (13)   │
              │ - Sepolia ≥48h staging gate    │
              └──────────────┬─────────────────┘
                             │
                             ▼
        ┌──────────────────────────────────────────────┐
        │ Phase 7 — OG service + Subgraph (parallel)   │
        │                                              │
        │ ★ TIGHTENING OPPORTUNITY:                     │
        │   Both can land earlier (alongside Phase 4)  │
        │   - Subgraph schema + first mappings stubbed │
        │     in Phase 0, populated incrementally as   │
        │     each contract deploys                    │
        │   - OG service Fallback variant in Phase 0;  │
        │     other 4 variants land alongside the      │
        │     events that drive them                   │
        │   - This avoids a "blackout" period where    │
        │     contracts work but UI cannot read or     │
        │     share. See §4.2 below for rationale.     │
        └──────────────┬───────────────────────────────┘
                       │
                       ▼
          ┌────────────────────────────────┐
          │ Mainnet deploy (gated by §19.10│
          │ 48h Sepolia + 20-min smoke test│
          └──────────────┬─────────────────┘
                         │
            ┌────────────┴────────────┐
            ▼                         ▼
   ┌─────────────────┐       ┌─────────────────┐
   │ Phase 8         │       │ Phase 9         │
   │ Farcaster       │       │ Mobile          │
   │ Mini Apps       │       │ responsive      │
   │ (time-permitting)│       │ (7 pages)       │
   └─────────────────┘       └─────────────────┘
```

### 4.1 Strict ordering rules

- **CallRegistry blocks everything.** No follow/fade, challenge, settle, or quote without it.
- **ProfileRegistry deploys before or alongside CallRegistry** because Gate 6.3 (high-conviction floor) reads `settledCalls` from ProfileRegistry at call creation time. Spec correctly groups both in Phase 1.
- **FollowFadeMarket depends on CallRegistry storage layout** (callId, expiry, status). Cannot deploy independently.
- **ChallengeEscrow depends on CallRegistry.openToChallenges field.** Contract-level enforcement, not just UI.
- **SettlementManager is the integration hub** — depends on all four prior contracts plus oracle adapter wiring. Solidity baseline rep delta is shipped in-contract from day one (it's the fallback path).
- **StylusScoreEngine** is the only contract with a build-time cutoff. 48h before demo, if not working, swap to Solidity baseline at same proxy slot.
- **Phase 6 must precede mainnet promotion** — moved earlier than original spec for this reason.

### 4.2 Tightening opportunity — subgraph and OG service should start in Phase 0, not Phase 7

The spec puts subgraph + OG service in Phase 7. Strict reading: they are gated until contracts are stable. But there's a smoother path:

| Spec sequencing | Proposed sequencing | Why |
|---|---|---|
| Subgraph deploy in Phase 7 | Subgraph **schema + scaffolding** in Phase 0; mappings added incrementally as each contract deploys (Phase 1, 2, 3, 4) | Mappings are AssemblyScript files compiled per-contract. There is no reason to wait until all contracts exist before defining the first mapping. The schema can be drafted from the spec's event signatures alone. **Polled-events fallback** (per App.A.1) lets the UI work in Phase 1-3 even before the subgraph is live; it then transitions to subgraph reads when each mapping deploys. |
| OG service in Phase 7 | OG service **skeleton + Fallback variant** in Phase 0; Live variant in Phase 1; Settled in Phase 4; DuelSettled in Phase 3; CallerExited in Phase 4 alongside the CallerExited event | Without the OG service, the share loop is dark. Even in Phase 1 (just CallRegistry live), demo screenshots and stakeholder check-ins benefit from real share previews. The Fallback variant has zero contract dependencies and serves whenever the real card cannot. |
| Relayer skeleton in Phase 4 | Relayer skeleton in Phase 0; oracle adapters land incrementally per Phase 4 | Same logic — the Fastify shell with BullMQ + Pino + alert bot scaffolding is plumbing, not feature work. It can be operational from day one with health-check endpoints. |

**Net effect:** Phase 0 ships a working subgraph stub, OG service skeleton, and relayer skeleton. Each subsequent contract phase wires its events into the already-running indexer and OG cache. The share loop is partially functional from Phase 1 onward, not gated until Phase 7.

This is a tightening, not a re-ordering — the dependency chain is preserved. It just removes idle time.

### 4.3 Acyclicity check

The DAG above contains no cycles. Cross-contract reads (CallRegistry ↔ FollowFadeMarket for `callerVolumeAtExit` snapshot, CallRegistry ↔ ProfileRegistry for `settledCalls` lookup) flow in only one direction per call — there's no circular write dependency. The Stylus engine is pure (no state), so it does not introduce a cycle even though SettlementManager calls into it. ProfileRegistry is terminal (no outbound calls).

---

## 5. Trust Boundary Inventory

Every off-chain → onchain crossing where a signature creates trust risk. Each row has a compromise impact and a mitigation.

| Boundary | Trust model | Compromise impact (v1) | Mitigation |
|---|---|---|---|
| **Pyth pull (price feeds)** | Trustless from our side. We pull update VAAs from Hermes; Pyth's publishers are the actual trust anchor. We just call `IPyth.updatePriceFeeds()` with the VAA and pay the ETH fee. | Pyth publisher collusion (universal trust failure for any Pyth consumer; outside our control) | Per-asset confidence threshold (0.5% of price). Retry 30× before opening dispute window. ForceSettle escape hatch at expiry + 7d. |
| **Alchemy NFT TWAP** | Relayer key signs the computed 24h TWAP from off-chain observations. Submitted via `submitNftFloor(callId, twapPriceWei, observationCount, evidenceHash)`. | Compromise of relayer key → attacker can forge any NFT settlement outcome | Per-call $100 cap and $5K TVL cap bound the loss. Observer-count requirement (≥12 in 24h window) blocks single-observation manipulation. Operator runbook re-computes TWAP from on-chain transfer logs to detect mismatches. Multisig promotion before v1.1 / >$5K TVL. |
| **DefiLlama TVL/volume/fees** | Relayer key signs the data point and submits. | Compromise → forged TVL/volume/fees outcomes (Event subtypes 0, 1, 2, 6) | Same caps as above. Detectable via independent DefiLlama snapshot cross-reference in operator runbook. |
| **CEX listing scrape** | Relayer key signs after Playwright scraper confirms listing announcement. 8 modular scrapers. | Compromise → forged CEX listing claims (Event subtype 3) | Same caps. Highest-trust path per §13.6 — gets the tightest dispute window for this reason. Per-exchange scraper modularity means one broken scraper doesn't taint others. Operator can spot-check via the exchange's official announcement RSS. |
| **Snapshot read** | Relayer signs the snapshot result and submits. | Compromise → forged governance outcomes for Snapshot-resolved events | Caps + dispute window. Snapshot itself is public — verifiable by any disputer in the 24h window. |
| **Tally / on-chain governance read** | **Trustless** — SettlementManager reads proposal state directly via Governor contract's standard interface. No relayer signature. | None (provided Tally's underlying Governor is honest, which is the Governor's own trust model, not ours) | The trustless path. Always preferred over Snapshot when the same proposal exists on both. |
| **OAuth proof verification (Twitter/Farcaster)** | Frontend sends signed message → relayer verifies OAuth proof server-side (@privy-io/server-auth for X, @farcaster/auth-client for FC) → relayer signs and submits `linkTwitter`/`linkFarcaster` to ProfileRegistry. | Compromise → attacker can grant fake `VERIFIED · X` / `VERIFIED · FC` badges to any address | Bounded — VERIFIED badge has no mechanical effect per §9.5; it's pure social signal. User can `unlinkTwitter`/`unlinkFarcaster` directly without relayer to remove a compromised link. Multisig promotion of the relayer key pre-v1.1. |
| **Settlement triggering (permissionless)** | Anyone can call `SettlementManager.settle(callId)`. The relayer does it as the gas payer in normal operation, but the function is open. | Trustless — outcome is deterministic from oracle data. Frontrunning the relayer just means the frontrunner pays the gas; outcome is the same. | None needed. |
| **ForceSettle owner key** | Owner can call `forceSettle(callId, outcome)` after expiry + 7 days. Bypasses oracle entirely. | Compromise of owner key after the 7d cooldown → arbitrary outcome override for any stuck call | The 7d cooldown is the primary mitigation — gives the community time to dispute. Both `CallForceSettled` and `CallSettled` emit loudly so the override is visible to all users + Etherscan. **Multisig promotion of the owner key before v1.1** is mandatory. |
| **Pause / setTvlCap owner key** | Owner can pause the protocol and adjust TVL cap. | Compromise → adversarial pause (denial of service); cap reduction below current TVL (deposit lockout, but withdraw/claim still work). | Withdraw/claim are NOT paused per §10.3 — funds always recoverable. Multisig promotion pre-v1.1. `setTvlCap` is bounded by hardcoded `MAX_ALLOWED_CAP = $100K`. |
| **Stylus proxy admin** | Owner key (= deployer in v1) controls `upgradeTo()` on TransparentUpgradeableProxy. | Compromise → arbitrary rep math substitution; could grant attacker infinite rep, or zero everyone | Pause → upgrade → unpause sequence required (paused system blocks new settlements during upgrade window). Runtime fallback (`RepCalculatedFallback`) emits visibly if Stylus reverts. Multisig promotion of proxy admin pre-v1.1 is mandatory. |
| **Privy custodial wallets** | Privy custodies internal wallets for OAuth users via MPC key shards. We don't sign transactions on their behalf; they sign through Privy's SDK. | Privy compromise / acquisition / shutdown → affected users lose access until export | One-time disclosure card during onboarding (§10.6). $50 USDC balance threshold triggers export prompt. SIWE re-sign on new withdrawal addresses + 24h cooldown on new auth links. |
| **Coinbase Onramp** | Coinbase signs and delivers USDC to user's Privy embedded wallet via Onramp webhook. | Coinbase compromise → funds delivered to wrong address (outside our trust model; their custody) | Webhook signature verification on receipt. No on-chain trust crossing — Coinbase is the off-ramp gateway only. |
| **Paymaster** | Privy + Alchemy paymaster sponsors first 5 tx per user. | Sybil drain (millions of accounts × 5 tx) → treasury exhaustion | $50/day global cap + 80% Telegram alert + per-account 5-tx counter + 24h auto-disable at cap. Converts financial attack into observable DoS. CAPTCHA is the v1.1 fallback. |

**The compounded threat:** if the *single owner key in v1* is compromised, the attacker controls pause + TVL cap + force-settle + Stylus proxy upgrade + ProfileRegistry settlement manager rotation + relayer rotation. **This is the single largest risk surface in v1.** Multisig promotion before v1.1 (and definitely before TVL exceeds $5K) is the spec's locked mitigation. Recommend 2-of-3 Safe multisig at minimum, with operator + auditor + founder as signers.

---

## 6. Hidden Infrastructure — Things the Spec Assumes But Doesn't Fully Name

Each of these is required for v1 ship but lives outside the 6-contract diagram.

| Infrastructure | Decision | Justification |
|---|---|---|
| **IPFS pinning service** | **Pinata** (paid tier ~$20/mo) | Three competitors: Pinata, Web3.Storage, Lighthouse. Pinata wins on (a) reliability (uptime SLA), (b) free tier sufficient for hackathon (1GB), (c) the dedicated gateway makes evidence + reasoning text fetchable from the dispute UI without CORS issues. Web3.Storage rebranded to "web3.storage" with Filecoin-anchored persistence — overkill for our 50-char text blobs. Lighthouse has the best pricing but newer ops story. Pin reasoningText, criteriaText, dispute evidence. |
| **CDN for OG cache** | **Vercel Edge Network** (free, included with Vercel deployment) | The OG service is a Next.js API route hosted alongside the web app on Vercel. Edge Network caches automatically. Adding Cloudflare Workers KV is premature optimization — Vercel's edge cache already provides global edge caching with `stale-while-revalidate` semantics out of the box. If we later split OG to its own service (v1.1), Cloudflare Workers KV becomes a real consideration. |
| **Address book** (withdrawal destinations) | **Off-chain (relayer DB — Postgres on Railway/Fly.io, or Redis with persistence)** | Storing the address book on-chain in ProfileRegistry would (a) cost gas every time a user adds a destination, (b) require SIWE re-sign at withdrawal anyway (the validation logic lives off-chain), (c) bloat the contract. Off-chain is correct. Schema: `(user_address, destination_address, added_at, siwe_signature_hash)`. Withdrawal gate: `now > added_at + 24h` AND `siwe signature valid for current nonce`. |
| **Coinbase Onramp** | **Onramp embedded widget + webhook handler in relayer** | Webhook signature verification via Coinbase's published JWKS endpoint. On webhook receipt: record fulfilment in Postgres, emit in-app notification to user, refresh USDC balance display. No on-chain action required (Onramp delivers USDC directly to user's Privy wallet). |
| **Privy funding plumbing** | **Direct USDC transfer detection via wagmi `useWatchContractEvent` + chain block watcher** | When user is on the "fund your wallet" page, watch USDC `Transfer` events with `to == user.address`. Refresh balance display on hit. Show "received $X USDC, ready to call" toast. |
| **Twitter API tier** | **X API Basic tier ($200/mo, 2026 pricing)** | The Free tier's per-endpoint 24h windows are too restrictive for "From your X" follow-graph cache + auto-post-on-settle. Basic tier gives `users/:id/following` access plus higher write limits. Document as a budget line item. Tokens managed via Privy custom OAuth scopes (`follows.read` + `tweet.write`). Stored encrypted in relayer Postgres. |
| **Multisig** | **Safe (Arbitrum), 2-of-3 to start** | Signers: operator (founder), backup operator (co-founder or trusted ops), advisor or auditor. Safe is the dominant multisig on Arbitrum (Squads is Solana-only). 2-of-3 is the minimum for fault tolerance without operational drag. Promoted from single-owner-key when first of: (a) v1.1 begins, or (b) TVL exceeds $5K, or (c) 7 days post-mainnet. **Owner-key rotation steps:** deploy Safe → transfer ownership on all 6 contracts + Stylus proxy admin → verify via on-chain reads → publish announcement. |
| **Sepolia faucet plumbing** | **Manual seeding script** (Foundry script: `forge script ScriptSeedSepolia.s.sol`) | Mints Sepolia test USDC via direct transfer from a pre-funded faucet wallet, creates 10-15 seed calls covering each call type, executes 30+ follow/fade positions, settles 3+ per call type. Run as part of Sepolia staging gate per §19.10. Can be re-run on every Sepolia redeploy. |
| **Monitoring stack** | **Better Stack ($25/mo) + Telegram bot (free)** | Better Stack covers structured logs + uptime monitoring + dashboards + alerts in one place. Cheaper than Grafana Cloud for our scale, less ops than self-hosted Prometheus. Highlight.io is another contender but Better Stack's log search + Pino integration is smoother. Telegram bot for ops paging (cheap, reliable, operator already has Telegram). Five dashboard panels per App.A.1: TVL, calls/hr, settlement latency, dispute rate, failed-tx rate. |
| **Sentry / error tracking** | **Sentry (free tier sufficient for hackathon)** | For frontend JS errors + Fastify uncaught exceptions. Already included in Vercel's default Next.js template. Self-hosted later if scale demands. |
| **Block-explorer verification** | **Arbiscan + Sourcify** via `forge verify-contract` | Arbiscan is the dominant UI. Sourcify is the IPFS-anchored backup that survives explorer downtime. Both verifications happen automatically via Foundry's `--verify` flag during deploy. **Get an Arbiscan API key before mainnet deploy.** |
| **Frontend env var management** | **Vercel project envs**, separate for Preview vs Production | Per-environment: `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_USDC_ADDRESS`, `NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_ALCHEMY_RPC_URL`, `NEXT_PUBLIC_SUBGRAPH_URL`, `NEXT_PUBLIC_OG_BASE_URL`, contract addresses (CallRegistry, FollowFadeMarket, etc.). Server-only vars stay in relayer (Privy server key, Alchemy NFT key, X API key, Pinata JWT, relayer signing private key). **Never put a private key in `NEXT_PUBLIC_*`.** |
| **Sentinel: a deployed test contract on Sepolia for ABI codegen** | **Always-on Sepolia deployment of all 6 contracts** | The frontend's TypeScript types (auto-generated from contract ABIs via wagmi-cli or similar) need a stable target. Sepolia deployments stay up indefinitely; frontend dev/preview points at Sepolia; production points at mainnet via env-flipping. |

---

## 7. Repo Layout — pnpm + Turborepo Monorepo

### 7.1 Why a monorepo

Five reasons specific to this build:

1. **Atomic refactors across contract ABI changes.** When `CallRegistry.createCall` adds a new parameter, the change must propagate to (a) Foundry tests, (b) Solidity baseline rep delta in SettlementManager, (c) Stylus engine Rust struct, (d) `packages/shared` TypeScript types regenerated from ABI, (e) frontend forms, (f) subgraph schema + mappings. A polyrepo would require coordinated PRs across 4-5 repos; a monorepo lands them in one commit.
2. **Shared TypeScript types from contract ABIs.** wagmi-cli generates types directly from ABI JSON. Co-located ABIs + types + frontend means zero copy-paste.
3. **Shared zod schemas for relayer ↔ frontend contract.** OG service input validation, follow-graph response shapes, dispute evidence shape — all defined once in `packages/shared`, consumed by both.
4. **Turborepo's incremental build cache.** Solidity compiles, Rust compiles, Next.js builds, and subgraph builds are all independently cacheable. CI runs only the affected slice.
5. **Single source of truth for tooling.** ESLint, Prettier, TypeScript configs, lint-staged hooks live in one place. New dev (or Claude Code in a fresh session) clones one repo and `pnpm i` once.

### 7.2 Directory tree

```
call-it/
├── apps/
│   ├── web/                              # Next.js 16 frontend (Vercel)
│   │   ├── app/
│   │   │   ├── layout.tsx                # root layout, theme
│   │   │   ├── providers.tsx             # 'use client' — Privy/QueryClient/Wagmi/AuthKit stack
│   │   │   ├── feed/page.tsx             # /feed (The Tape)
│   │   │   ├── new/page.tsx              # /new (Create Call)
│   │   │   ├── call/[id]/
│   │   │   │   ├── page.tsx              # SSR with og:image meta tags
│   │   │   │   ├── live.tsx              # Live state UI
│   │   │   │   └── settled.tsx           # Settled state UI (stamp animation)
│   │   │   ├── u/[handle]/page.tsx       # Profile (ENS→Twitter→FC→addr resolution)
│   │   │   ├── duels/page.tsx            # Duels tab
│   │   │   ├── leaderboard/page.tsx      # 7d/30d/All-time
│   │   │   ├── signin/page.tsx           # §15.8
│   │   │   ├── onboarding/page.tsx       # §15.9 (4 screens)
│   │   │   ├── quote/page.tsx            # Quote composer (§15.10)
│   │   │   └── api/
│   │   │       ├── og/[callId]/route.ts  # OG image API (Node runtime, @vercel/og)
│   │   │       └── og/fallback/route.ts  # Fallback card
│   │   ├── components/                   # Shared UI (Loading, Toast, Receipt, Bracket)
│   │   ├── hooks/                        # Custom wagmi hooks (useCallRegistry, useFollowFade, useSettle)
│   │   ├── lib/
│   │   │   ├── wagmi-config.ts           # @privy-io/wagmi createConfig — Arbitrum One + Sepolia
│   │   │   ├── subgraph-client.ts        # GraphQL client w/ Studio API key
│   │   │   ├── privy-config.ts
│   │   │   └── og/templates/             # The 5 Satori JSX templates (flexbox only)
│   │   ├── public/                       # Static assets, fonts (Syne, Space Grotesk, JetBrains Mono)
│   │   ├── tailwind.config.ts            # Color tokens (#09090E, #E8F542, etc.) + neobrutalist
│   │   ├── next.config.ts
│   │   ├── tsconfig.json                 # extends ../../packages/config/tsconfig.base.json
│   │   └── package.json
│   │
│   ├── relayer/                          # Fastify backend (Fly.io / Railway)
│   │   ├── src/
│   │   │   ├── index.ts                  # Fastify app, route registration
│   │   │   ├── routes/
│   │   │   │   ├── og.ts                 # Mirror of /api/og (if not co-hosted in web)
│   │   │   │   ├── social-link.ts        # OAuth proof verification → linkTwitter/Farcaster
│   │   │   │   └── follow-graph.ts       # /api/feed/from-your-x
│   │   │   ├── workers/
│   │   │   │   ├── settle-cron.ts        # 60s loop: query subgraph, settle eligible
│   │   │   │   ├── pyth-retry.ts         # BullMQ delayed-job worker
│   │   │   │   ├── nft-twap.ts           # 5min Alchemy polling per active NFT call
│   │   │   │   ├── defillama.ts          # On-demand at deadlines
│   │   │   │   ├── snapshot.ts           # On-demand at deadlines
│   │   │   │   ├── tally.ts              # Direct RPC read (no signature)
│   │   │   │   ├── cex-scrapers/
│   │   │   │   │   ├── binance.ts
│   │   │   │   │   ├── coinbase.ts
│   │   │   │   │   ├── okx.ts
│   │   │   │   │   ├── bybit.ts
│   │   │   │   │   ├── kraken.ts
│   │   │   │   │   ├── bitget.ts
│   │   │   │   │   ├── kucoin.ts
│   │   │   │   │   └── upbit.ts          # Playwright per-exchange selectors
│   │   │   │   └── alerts.ts             # Telegram bot
│   │   │   ├── lib/
│   │   │   │   ├── viem-client.ts        # Server-side viem walletClient with relayer key
│   │   │   │   ├── pinata.ts             # IPFS pinning helpers
│   │   │   │   ├── hermes.ts             # Pyth Hermes client
│   │   │   │   ├── alchemy.ts            # Alchemy SDK wrapper
│   │   │   │   ├── paymaster.ts          # Per-account counter + daily cap
│   │   │   │   └── address-book.ts       # Postgres queries
│   │   │   └── config/                   # Env loading, addresses per network
│   │   ├── prisma/                       # OR drizzle-orm/ — relayer DB schema
│   │   │   └── schema.prisma             # addressBook, paymasterCounter, dailyCapState
│   │   ├── tsconfig.json
│   │   ├── package.json                  # tsx for dev, tsc for build
│   │   └── Dockerfile                    # for Fly.io / Railway
│   │
│   └── og/                               # OPTIONAL — only if OG splits out of web
│       └── (mirrors apps/web/app/api/og structure)
│
├── packages/
│   ├── contracts/                        # Foundry + Stylus
│   │   ├── src/                          # Solidity contracts
│   │   │   ├── CallRegistry.sol
│   │   │   ├── FollowFadeMarket.sol
│   │   │   ├── ChallengeEscrow.sol
│   │   │   ├── SettlementManager.sol     # Contains Solidity baseline rep delta
│   │   │   ├── ProfileRegistry.sol
│   │   │   ├── proxy/
│   │   │   │   └── StylusProxy.sol       # TransparentUpgradeableProxy wrapper
│   │   │   ├── score-engine/
│   │   │   │   └── SolidityBaselineScoreEngine.sol  # Fallback impl
│   │   │   ├── interfaces/               # ICallRegistry, IFollowFadeMarket, etc.
│   │   │   └── lib/                      # Constants, errors, math helpers
│   │   ├── stylus/                       # Rust crate — StylusScoreEngine
│   │   │   ├── Cargo.toml                # stylus-sdk = "=0.10.7", openzeppelin-stylus = "=0.3.0"
│   │   │   ├── src/
│   │   │   │   └── lib.rs                # #[public] fn compute_rep_change(...)
│   │   │   └── tests/                    # Motsu unit tests
│   │   ├── test/                         # Forge tests (Solidity + invariant + fuzz)
│   │   │   ├── CallRegistry.t.sol
│   │   │   ├── FollowFadeMarket.t.sol
│   │   │   ├── ChallengeEscrow.t.sol
│   │   │   ├── SettlementManager.t.sol
│   │   │   ├── ProfileRegistry.t.sol
│   │   │   ├── integration/              # Multi-contract scenarios
│   │   │   └── invariants/               # TVL invariant, claimed-only-once, etc.
│   │   ├── script/                       # Foundry scripts
│   │   │   ├── DeployAll.s.sol           # Sepolia / mainnet deploy w/ CREATE2
│   │   │   ├── SeedSepolia.s.sol         # 10-15 seed calls for staging gate
│   │   │   └── PromoteToMultisig.s.sol   # Owner-key rotation
│   │   ├── deployments/                  # JSON of deployed addresses per network
│   │   │   ├── arbitrum-one.json
│   │   │   └── arbitrum-sepolia.json
│   │   ├── foundry.toml                  # solc = "0.8.30" pinned
│   │   └── remappings.txt
│   │
│   ├── subgraph/                         # The Graph
│   │   ├── schema.graphql                # Call, Position, Challenge, Settlement, Profile, RepEvent, Dispute
│   │   ├── subgraph.yaml                 # network: arbitrum-one (or arbitrum-sepolia)
│   │   ├── src/
│   │   │   ├── call-registry.ts          # AssemblyScript mappings
│   │   │   ├── follow-fade-market.ts
│   │   │   ├── challenge-escrow.ts
│   │   │   ├── settlement-manager.ts
│   │   │   └── profile-registry.ts
│   │   ├── abis/                         # Symlinks to packages/contracts/out/*.json
│   │   └── package.json
│   │
│   ├── shared/                           # Cross-app types and validators
│   │   ├── src/
│   │   │   ├── types/                    # Generated from ABIs via wagmi-cli
│   │   │   │   ├── CallRegistry.ts
│   │   │   │   ├── FollowFadeMarket.ts
│   │   │   │   └── ...
│   │   │   ├── schemas/                  # zod validators
│   │   │   │   ├── og-input.ts
│   │   │   │   ├── follow-graph.ts
│   │   │   │   ├── dispute-evidence.ts
│   │   │   │   └── social-link.ts
│   │   │   ├── constants/
│   │   │   │   ├── addresses.ts          # Per-network contract addresses
│   │   │   │   ├── allowlist.ts          # 25 coins + 6 NFT collections
│   │   │   │   ├── pyth-feed-ids.ts      # The 25 verified feed IDs
│   │   │   │   └── fees.ts               # 1.0% / 0.4% / 0.3% / $10 creation
│   │   │   └── utils/
│   │   │       ├── duplicate-hash.ts     # UTC-floor day computation
│   │   │       └── format.ts             # USDC <-> dollar display
│   │   └── package.json
│   │
│   └── config/                           # Shared tooling
│       ├── eslint/
│       │   └── base.js
│       ├── prettier/
│       │   └── base.js
│       ├── tsconfig/
│       │   ├── base.json
│       │   ├── next.json                 # extends base for Next.js apps
│       │   └── node.json                 # extends base for Node services
│       └── package.json
│
├── docs/
│   ├── runbooks/
│   │   ├── settlement-stuck.md           # forceSettle invocation criteria
│   │   ├── paymaster-cap-hit.md
│   │   ├── relayer-key-rotation.md
│   │   └── owner-multisig-promotion.md
│   ├── architecture/                     # Mermaid diagrams (rendered from this doc)
│   └── postmortems/                      # Empty until incidents happen
│
├── .github/
│   └── workflows/
│       ├── ci.yml                        # Turborepo: lint + test + build per affected
│       ├── deploy-web.yml                # Vercel auto-deploys preview + prod
│       ├── deploy-relayer.yml            # Fly.io deploy on tag
│       ├── deploy-subgraph.yml           # Studio publish on tag
│       └── contracts-test.yml            # Foundry + Stylus on every contracts/ change
│
├── .planning/                            # GSD project artifacts
├── CALL_IT_SPEC1.md                      # Source of truth
├── turbo.json                            # Pipeline: build → test → lint
├── pnpm-workspace.yaml                   # workspace globs
├── package.json                          # root devDeps: turbo, prettier, pnpm
├── tsconfig.json                         # references all packages
├── .env.example                          # All required env vars with comments
└── README.md
```

### 7.3 Notes on the layout

- **`apps/og/` is provisional.** Default is OG co-hosted in `apps/web/app/api/og/` because it's a Next.js API route by design (uses `@vercel/og` + Satori). Splitting only happens if the OG endpoint's traffic profile diverges materially from web (likely never in v1).
- **Stylus crate lives inside `packages/contracts/stylus/`.** It's a peer of the Solidity contracts, not a separate package, because they ship together and deploy together. The Solidity proxy in `packages/contracts/src/proxy/StylusProxy.sol` points at the deployed Stylus implementation address; the address is written to `deployments/*.json` after each network deploy.
- **`packages/contracts/test/integration/` is where multi-contract scenarios live.** The single most important integration test is the full settlement loop: create call → follow → fade → expire → settle → claim. If that test passes end-to-end on Sepolia, the core product works.
- **`packages/shared/` is the type pipeline endpoint.** wagmi-cli generates ABIs → types here on every contract change. Both web and relayer consume from here.
- **`packages/config/` is a workspace package.** Avoids the npm pattern of publishing a `@my-org/config` package; pnpm workspace `workspace:*` does this for free.
- **CI is per-affected via Turborepo.** Touching `apps/web/` doesn't trigger Foundry tests. Touching `packages/contracts/` triggers everything downstream (subgraph, shared types, web, relayer).
- **`pnpm` not npm.** pnpm's hoisting + workspace handling is materially better for monorepos. Don't use yarn (the Berry transition is its own ops headache).

---

## 8. Architectural Patterns

### Pattern 1: Signed Off-Chain Attestation (relayer-bound oracles)

**What:** For non-Pyth oracle data (NFT TWAP, DefiLlama metrics, Snapshot, CEX listings), the relayer reads off-chain, signs with its key, and submits on-chain. The contract verifies the signature against the configured relayer pubkey before accepting.

**When to use:** Any data source that is (a) not natively on-chain, (b) not Pyth, (c) requires aggregation or scraping. This is the standard pattern for non-fungible asset oracles in 2026.

**Trade-offs:**
- **Pro:** Cheap on-chain footprint; flexible (relayer can use any data source); doesn't require an indexer-side oracle network.
- **Con:** Relayer key compromise = forged settlements. Mitigated by per-call caps, dispute window, and multisig promotion.

**Example call shape:**

```solidity
function submitNftFloor(
    uint256 callId,
    uint256 twapPriceWei,
    uint8 observationCount,
    bytes32 evidenceHash,
    bytes calldata relayerSig
) external {
    bytes32 messageHash = keccak256(abi.encode(callId, twapPriceWei, observationCount, evidenceHash));
    address signer = ECDSA.recover(messageHash.toEthSignedMessageHash(), relayerSig);
    if (signer != relayer) revert NotAuthorizedRelayer(signer);
    if (observationCount < 12) revert ObservationCountTooLow(observationCount);
    // ... use the signed data in settle()
}
```

### Pattern 2: try/catch with Solidity Baseline Fallback

**What:** Cross-contract calls into the Stylus engine are wrapped in `try/catch`. On revert, fall back to a Solidity baseline implementation that produces a lower-fidelity answer rather than freezing the call.

**When to use:** Any non-critical computation that lives in a separate contract and could revert for transient reasons (out-of-gas, transient state, paused proxy). NOT for money-handling code — that should propagate the revert.

**Trade-offs:**
- **Pro:** A Stylus revert never freezes settlement permanently. Operator gets a `RepCalculatedFallback` event with the low-level error for investigation.
- **Con:** Fallback path has lower fidelity (no contrarian multiplier, no high-conviction asymmetry). Acceptable for the rep math because rep is social signal, not money.

**Example:**

```solidity
try IStylusScoreEngine(stylusProxy).compute_rep_change(
    currentRep, conviction, consensusPct, isWinner, baseValue
) returns (int32 delta) {
    profileRegistry.updateAfterSettlement(user, category, true, isWinner, delta);
    emit RepCalculated(callId, user, currentRep, conviction, consensusPct, isWinner, baseValue, delta);
} catch (bytes memory lowLevelError) {
    int32 baselineDelta = _solidityBaselineRepDelta(currentRep, conviction, consensusPct, isWinner, baseValue);
    profileRegistry.updateAfterSettlement(user, category, true, isWinner, baselineDelta);
    emit RepCalculatedFallback(callId, user, baselineDelta, lowLevelError);
}
```

### Pattern 3: Single-Contract Sub-State (FollowFadeMarket)

**What:** Instead of one minimal proxy per call (the "per-market contract" pattern from Uniswap V2 etc.), a single FollowFadeMarket contract holds all per-call state in nested mappings keyed by `callId`.

**When to use:** When (a) per-call gas cost matters more than blast-radius isolation, (b) cross-market aggregation (TVL caps) is a first-class requirement, (c) Stylus / cross-contract invocation simplicity matters.

**Trade-offs:**
- **Pro:** ~50k gas saved per call creation (no proxy deploy); TVL-cap aggregation is trivial (`sum(followPool + fadePool) across all callIds`); cleaner Stylus integration.
- **Con:** A bug in the single contract affects all markets. Mitigated by the $5K TVL cap, pause + carve-out, and fresh-redeploy rollback policy (per §10.8).

### Pattern 4: Pull-Pattern Payouts

**What:** Settlement does NOT iterate over followers/faders to pay them out. Instead, `settle()` marks the call as Settled (O(1) gas) and each user pulls their own payout via `claimPayout(callId)`.

**When to use:** Whenever the participant count is unbounded and a per-user loop would risk gas-griefing the settlement transaction.

**Trade-offs:**
- **Pro:** Gas cost of `settle()` is O(1) regardless of participant count. No griefing vector.
- **Con:** Users must manually claim. Unclaimed funds sit in the contract indefinitely (acceptable — they're still owned by the user; idempotency check `claimed[callId][user]` prevents double-claim).

### Pattern 5: Pyth Pull + JIT Update

**What:** Before each settle that depends on Pyth, the relayer fetches an update VAA from Hermes and calls `IPyth.updatePriceFeeds()` with a small ETH fee. Then SettlementManager reads `getPriceNoOlderThan(priceId, 60)`. Both happen in the same transaction via multicall (or sequential txs if multicall isn't viable).

**When to use:** Any Pyth-backed read. This is the only way Pyth's pull oracle model works.

**Trade-offs:**
- **Pro:** Always-fresh price at the moment of settle; sub-cent ETH cost per update (~$0.01); no on-chain push subscription required.
- **Con:** Hermes is rate-limited and not authoritative under heavy load. For redundancy at growth scale, run a paid Pyth Lazer endpoint.

### Pattern 6: Server-Rendered OG Meta Tags (share loop)

**What:** Receipt page (`/call/[id]`) is server-rendered with `<meta property="og:image" content="https://api.callitapp.xyz/og/[id]">`. The og:image URL points to the OG API route which serves the cached PNG (or generates it on first request, then caches).

**When to use:** Any page whose social-share preview matters.

**Trade-offs:**
- **Pro:** Twitter Card Validator and equivalent scrapers see the og:image tag and fetch the cached PNG. Works without JS.
- **Con:** Cache-invalidation logic must be tight — when call state changes, OG cache must invalidate or the share preview is stale.

### Anti-Pattern 1: Putting the address book on-chain

**What people do:** Store withdrawal destination addresses in ProfileRegistry to make them "verifiable on-chain."

**Why it's wrong:** SIWE re-sign validation logic lives off-chain (signature verification + 24h cooldown timestamp check). Putting addresses on-chain costs gas every time a user adds a destination and provides no on-chain enforcement (since the contract can't see the SIWE signature anyway).

**Do this instead:** Off-chain Postgres table in the relayer DB. Gate withdrawals on `(now > added_at + 24h) AND (siwe signature valid)` before the relayer signs any withdrawal-authorization message.

### Anti-Pattern 2: Using `display: grid` in OG card templates

**What people do:** Use CSS Grid for layout in Satori templates (because it's the modern default).

**Why it's wrong:** Satori only supports flexbox. Grid silently fails / misrenders. Verified via Satori docs (it's the most-cited gotcha in @vercel/og issue tracker).

**Do this instead:** Pure flexbox. All 5 card variants are flex-only.

### Anti-Pattern 3: Reading social-link state from the subgraph for the VERIFIED badge

**What people do:** Render `VERIFIED · X` badge based on subgraph data because subgraph is the read source.

**Why it's wrong:** Subgraph indexing lag (~30s) means a user just-linked their Twitter sees their badge appear with a delay. Bad UX.

**Do this instead:** Render VERIFIED badge from local optimistic state immediately after the linkTwitter tx is mined. Reconcile with subgraph on next page load.

### Anti-Pattern 4: Storing the relayer signing key in `NEXT_PUBLIC_*` env vars

**What people do:** Put the relayer private key in `NEXT_PUBLIC_*` because "it needs to sign on the frontend."

**Why it's wrong:** `NEXT_PUBLIC_*` ships to the client. Compromise is instant and global.

**Do this instead:** Relayer key lives only on the Fastify backend. Frontend never sees it. All signed attestations come from the relayer's POST endpoints, not from the client.

### Anti-Pattern 5: Deploying Stylus engine without the Solidity baseline ready

**What people do:** "We'll write the Solidity baseline later if Stylus has problems."

**Why it's wrong:** The 48h-before-demo cutoff requires the baseline to be ready to swap in. The runtime fallback in SettlementManager requires the baseline to live as a function inside SettlementManager itself (per the try/catch pattern in §3.3 step 7). Building the baseline at the moment of crisis is unacceptable.

**Do this instead:** The Solidity baseline rep delta function (`_solidityBaselineRepDelta`) ships in SettlementManager from Phase 4. The Stylus engine adds the high-fidelity path on top, but the baseline is the foundation.

---

## 9. Scaling Considerations

| Scale | Architecture Adjustments |
|---|---|
| **0-1k users (hackathon)** | Single-instance relayer on Fly.io ($25/mo). Single Redis. Postgres on Railway ($5/mo). Subgraph free tier. Vercel hobby. Single owner key. **Total infrastructure: ~$100/mo + X API + Pinata + Better Stack.** |
| **1k-10k users (post-mainnet)** | Multisig promoted. Subgraph published to Decentralized Network (~$200 GRT curation). OG cache moves to dedicated CDN tier if Vercel egress costs spike. Relayer scaled to 2 instances for HA. Backup Pyth Lazer endpoint considered. |
| **10k+ users (v1.1+)** | CEX scrapers split into their own deployment (per-exchange region). Subgraph hosting moves to Goldsky or self-hosted Graph Node if Decentralized Network query costs ($4/100K queries) exceed budget. Relayer DB upgraded with read replicas. CAPTCHA on sign-up. |
| **First bottleneck (probably)** | The 5-second polling interval in the frontend. At 10K concurrent users, 10K req/s on the subgraph endpoint. Mitigation: WebSocket migration (v1.1 priority) or aggressive subgraph response caching at the CDN. |
| **Second bottleneck** | Relayer settle-cron concurrency. If 100 calls all expire at the same minute, sequential settling drags. Mitigation: parallel BullMQ workers with per-Pyth-feed locking. |

---

## 10. Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---|---|---|
| **Privy** | React provider + server SDK; OAuth + embedded wallets + paymaster | Provider order is load-bearing (Privy → QueryClient → Wagmi). `@privy-io/wagmi` NOT `@privy-io/wagmi-connector`. |
| **Alchemy** | RPC endpoint for chain reads/writes + NFT API for floor + (optional) bundler/paymaster | Single vendor for chain + NFT data. Free tier sufficient for hackathon. |
| **Pyth Hermes** | REST/WebSocket pull of update VAAs; on-chain `updatePriceFeeds` | Hermes is rate-limited; budget Lazer fallback for growth. |
| **DefiLlama** | REST GET, no auth | Base URLs: `api.llama.fi`, `yields.llama.fi`, `coins.llama.fi`. Free tier generous. |
| **Snapshot** | `@snapshot-labs/snapshot.js` GraphQL client | Trustless for read; relayer signs the result. |
| **Tally** | GraphQL via direct fetch + Arbitrum RPC | No npm SDK. Prefer direct RPC read of Governor when available (trustless). |
| **The Graph** | GraphQL via Studio (dev) → Decentralized Network (prod) | Network: `arbitrum-one`. Free tier covers 100K queries/mo; $4 per 100K thereafter. |
| **Coinbase Onramp** | Embedded widget + webhook | Webhook signature verification via Coinbase JWKS. |
| **Twitter / X** | OAuth via Privy + X API Basic tier | Custom scope `follows.read` + `tweet.write`. $200/mo budget. |
| **Farcaster** | `@farcaster/auth-kit` (client) + `@farcaster/auth-client` (server) | Auth Kit needs OP-mainnet RPC + `domain` + `siweUri`. |
| **Pinata** | Pinning API for IPFS | $20/mo. JWT auth. |
| **Vercel** | Frontend host + OG runtime + edge cache | Node runtime for OG (not edge). |
| **Fly.io or Railway** | Relayer host | Either works; Fly.io for global regions, Railway for simpler ops. |
| **Safe (Arbitrum)** | Multisig for owner-key promotion | 2-of-3 to start. Promote pre-v1.1. |
| **Better Stack** | Logs + uptime + dashboards | $25/mo. Pino-compatible. |
| **Telegram** | Bot API for ops paging | Free. Bot token in relayer env. |

### Internal Boundaries

| Boundary | Communication | Notes |
|---|---|---|
| **Frontend ↔ Subgraph** | GraphQL queries via `@apollo/client` or `urql` | Read path for feed, profile, leaderboard, receipt. |
| **Frontend ↔ Contracts** | wagmi `useReadContract`/`useWriteContract`/`useWaitForTransactionReceipt` | Write path + freshness-critical reads. |
| **Frontend ↔ Relayer** | REST POST to `/api/social/link`, GET `/api/feed/from-your-x`, GET `/api/og/[id]` | OAuth proof submission + off-chain reads. |
| **Relayer ↔ Contracts** | viem `walletClient` server-side; signing with relayer private key | Settles, NFT TWAP submission, OAuth-verified social links. |
| **Relayer ↔ Subgraph** | GraphQL queries from server | Settle cron reads `Call where expiry_lt: now AND status: Live`. |
| **Subgraph ↔ Contracts** | The Graph indexer reads events from Arbitrum archive node | AssemblyScript mappings transform events → entities. |
| **Contracts ↔ Contracts** | Direct interface calls + try/catch for Stylus | CallRegistry ↔ FollowFadeMarket ↔ SettlementManager ↔ ProfileRegistry ↔ StylusProxy. |

---

## Sources

- `CALL_IT_SPEC1.md` — sections 9, 10, 11, 12, 13, 16, 19, 20, Appendix A, A.1 (locked spec; source of truth) — HIGH
- `.planning/research/STACK.md` — versions, addresses, gotchas — HIGH
- `.planning/research/FEATURES.md` — feature dependency graph and critical-path analysis — HIGH
- [Pyth Network EVM contract addresses](https://docs.pyth.network/price-feeds/contract-addresses/evm) — HIGH
- [OpenZeppelin Stylus UUPS Proxy](https://docs.openzeppelin.com/contracts-stylus/uups-proxy) — MEDIUM (alpha-ish line)
- [Privy wagmi integration](https://docs.privy.io/wallets/connectors/ethereum/integrations/wagmi) — HIGH
- [The Graph Hosted Service sunset notice](https://thegraph.com/blog/sunsetting-hosted-service/) — HIGH
- [Subgraph Studio billing docs](https://thegraph.com/docs/en/subgraphs/billing/) — HIGH
- [Vercel OG Node vs Edge runtime guidance](https://github.com/vercel/next.js/discussions/60003) — HIGH
- [Satori CSS support — flexbox only](https://github.com/vercel/satori) — HIGH (the most-cited gotcha)
- [Safe on Arbitrum](https://safe.global/) — HIGH
- [Pinata vs Web3.Storage vs Lighthouse — 2026 comparison](https://blog.pinata.cloud/) — MEDIUM
- [Alchemy NFT API getFloorPrice](https://docs.alchemy.com/reference/getfloorprice) — HIGH (Ethereum mainnet only)

---

*Architecture research for: Call It — onchain social prediction product on Arbitrum One*
*Researched: 2026-05-21*
*Spec source: `CALL_IT_SPEC1.md` v1.0 (3,088 lines, locked)*
*Stack source: `.planning/research/STACK.md`*
*Features source: `.planning/research/FEATURES.md`*
