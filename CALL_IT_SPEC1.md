# Call It — Product Specification

**Version:** 1.0 — Hackathon MVP
**Network:** Arbitrum Mainnet
**Tagline:** Be right in public.

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [The User](#2-the-user)
3. [Core Mechanics](#3-core-mechanics)
4. [Call Types](#4-call-types)
5. [Social Actions](#5-social-actions)
6. [Anti-Spam Gates](#6-anti-spam-gates)
7. [Reputation System](#7-reputation-system)
8. [Market Mechanics, Exits & Fees](#8-market-mechanics-exits--fees)
9. [Authentication & Identity](#9-authentication--identity)
10. [Mainnet Safety](#10-mainnet-safety)
11. [Smart Contract Architecture](#11-smart-contract-architecture)
12. [Contract Interfaces](#12-contract-interfaces)
13. [Settlement & Oracles](#13-settlement--oracles)
14. [Design System](#14-design-system)
15. [Page Specifications](#15-page-specifications)
16. [Receipt Card (Share Asset)](#16-receipt-card-share-asset)
17. [Animation & Micro-interactions](#17-animation--micro-interactions)
18. [Distribution & Virality](#18-distribution--virality)
19. [Build Order](#19-build-order)
20. [Open Gaps](#20-open-gaps)

---

## 1. Product Vision

Call It is a social prediction product for crypto-native users who want to build a public, permanent, and verifiable reputation for being right. Users make calls on markets — price targets, relative performance, future events — stake USDC, and receive a permanent onchain receipt. Other users can follow the call (bet with it), fade it (bet against it), challenge the caller to a 1v1 duel, or quote-call it (reference it in their own thesis).

When calls settle, winners receive a shareable "CALLED IT" or "CONTRARIAN HIT" receipt; losers carry a "LOUD AND WRONG" record. All outcomes update a reputation score that is permanent, public, and cannot be edited or hidden.

The product fills a gap: Crypto Twitter is a prediction machine with zero accountability. Polymarket is a market-first product where positions are anonymous. Call It is **person-first** — every call is a public commitment tied to a named reputation.

### Core Insight

The cultural tension between "I called it" and "where's the receipt?" is real, persistent, and currently unsolved. Call It makes the receipt permanent, beautiful, and shareable — and makes the failed call equally permanent.

---

## 2. The User

**Primary persona:** Crypto-native traders, analysts, and degens who post predictions publicly (mostly on X) and want a way to prove their track record beyond screenshots that can be deleted or cherry-picked.

**Secondary persona:** Followers and fans of these callers who want to bet with or against named individuals based on track record, not anonymous markets.

**Tone of voice the product adopts:**
- Sharp, intelligent, slightly intimidating
- Does not coddle
- Respects user intelligence
- Borrows trading-floor language ("The Tape", "Top of book", "Go on record")
- Sample empty state copy: "No calls yet. Be the first to go on record."

---

## 3. Core Mechanics

### The flow

1. **Make a call.** User selects a market type, asset(s), direction, target, expiry, conviction %, and stake amount.
2. **Receive a receipt.** A permanent onchain artifact is minted with all call parameters and a shareable card representation.
3. **Others interact.** Other users follow, fade, challenge, or quote the call.
4. **Time passes.** Live price/event data updates the call's current state. Followers and faders accumulate positions.
5. **Settlement.** When the expiry hits, the SettlementManager checks the resolution condition and pays out winners. Reputation scores update for all parties involved (caller, followers, faders, challengers).
6. **The receipt becomes permanent history.** The final outcome — CALLED IT, LOUD AND WRONG, CONTRARIAN HIT, COLD CALL, FADED CORRECTLY — is stamped onto the receipt forever and added to all participants' public records.

### Why Arbitrum

- **Sub-cent transaction fees** make micro-stakes ($1–$100) economically viable. A $2 follow would cost more than the stake on mainnet.
- **Stylus** enables the reputation scoring engine to run complex math (confidence calibration, contrarian weighting, time decay) in Rust at near-native speed — impossible to express affordably in Solidity.
- **250ms block finality** gives the product real-time feel. Calls publish instantly. Settlements feel immediate. Live activity feeds update in near-real-time.

---

## 4. Call Types

Three top-level market types are supported in v1. The third, Event / Binary, contains seven subtypes covering the most common crypto predictions.

### 4.1 Price Target

A directional call on a single asset hitting a specific price by a deadline.

**Examples:**
- "BTC closes above $98k by Friday EOW"
- "ETH reclaims $4,200 before Friday close"
- "Pudgy Penguins floor > 20 ETH by Friday" (NFT floor uses 24h TWAP computed by the relayer from Alchemy NFT API — see §13.2)

**Resolution:** Pyth price feed at the expiry timestamp for coins. For NFT floors: a 24-hour time-weighted average computed by the relayer from Alchemy NFT API sales/listings data, then signed and submitted on-chain (see §13.2 — Reservoir is sunset). Deterministic in both cases when the underlying data is fresh.

### 4.2 Spread / Versus (Relative Performance)

A call on one asset outperforming another, OR one asset's ranking versus another, within a window. v1 supports five metrics: Price (default), Market cap, Volume rank (7d), TVL rank, Fees rank (7d).

**Examples:**
- "ARB outperforms OP by >5% in the next 7 days" — Price metric
- "SOL flips ETH in market cap by Dec 31" — Market cap metric
- "Aerodrome flips Aave in TVL by end of year" — TVL rank metric
- "Hyperliquid stays ahead of dYdX in 7d perp volume" — Volume rank metric

**Resolution:**
- Price metric: Pyth feeds for both assets at start and end; percentage spread computed and compared to target.
- Market cap / Volume rank / TVL rank / Fees rank: snapshot from the designated aggregator (CoinGecko for market cap, DefiLlama for TVL / Volume / Fees) at the deadline timestamp.

**Why this matters:** Spread calls reduce broad market noise. If BTC dumps 20% and your call is "ARB beats OP by 5%," your position is unaffected by the macro move. Adding ranking metrics covers the "X flips Y" predictions that fill Crypto Twitter daily.

### 4.3 Event / Binary

A call on a discrete future event. v1 supports seven event subtypes, each with cleanly automated resolution.

#### 4.3.1 TVL milestone

A protocol's or chain's Total Value Locked crossing a threshold by a deadline.

**Examples:**
- "Pendle TVL crosses $9B by end of this month"
- "Arbitrum chain TVL > $20B on Dec 31"

**Resolution:** DefiLlama API at the deadline timestamp. Reads the protocol/chain's `tvl` field.

#### 4.3.2 Volume / fees comparison

Weekly or monthly trading volume / fees / revenue compared to a threshold or prior period.

**Examples:**
- "GMX weekly fees beat last week"
- "Hyperliquid 7d perp volume > $20B"
- "Uniswap 30d revenue > $50M"

**Resolution:** DefiLlama API at the deadline timestamp. Reads the protocol's volume / fees / revenue with the specified rolling window.

#### 4.3.3 On-chain metric thresholds

Block-level numeric thresholds. v1 supports the following metrics:
- Active addresses (24h or 7d)
- Holders count
- Gas burned (24h)
- Validator count
- Supply APR
- Borrow APR
- Staking APR
- Liquidation events > $X threshold (24h or 7d)

**Examples:**
- "Arbitrum daily active addresses > 1M by month end"
- "Aave USDC supply APR > 8% by end of week"
- "Any single liquidation > $50M happens on Hyperliquid in the next 7 days"
- "ETH supply turns deflationary for 30 consecutive days"

**Resolution:** On-chain RPC queries (active addresses, gas burned, validator count) or DefiLlama Yields API (APRs) or DefiLlama Liquidations API. Resolution at the deadline timestamp; for liquidation events, resolution is true as soon as any qualifying event occurs within the window.

#### 4.3.4 CEX listing

An exchange lists or delists a specific token by a deadline.

**Examples:**
- "Binance lists POPCAT spot by end of this month"
- "Coinbase adds ARB perps by Q2"
- "OKX delists $WIF before EOY"

**Resolution:** Scrape of the exchange's official listing announcements page, verified by a backend relayer. Supported exchanges: Binance, Coinbase, OKX, Bybit, Kraken, Bitget, KuCoin, Upbit.

#### 4.3.5 Token launch

A protocol launches a token (TGE), mainnet, airdrop, or related event by a deadline.

**Examples:**
- "Berachain mainnet launches before March 31"
- "LayerZero airdrop allocation announced by end of Q2"
- "Linea TGE happens before Aug 1"

**Resolution:** Hybrid — on-chain token deployment check + first CEX listing for TGE-type events; on-chain chain launch for mainnet events; official announcement verification for airdrop-related events.

#### 4.3.6 Governance outcomes

A DAO proposal passes, fails, or executes by a deadline.

**Examples:**
- "Arbitrum DAO STIP renewal passes by July 1"
- "Uniswap fee switch activated on Mainnet before EOY"
- "MakerDAO endgame phase 2 approved this month"

**Resolution:** Snapshot or Tally proposal state read at the deadline timestamp. "Passes" = proposal state is `Succeeded` or `Executed`. "Fails" = proposal state is `Defeated` or `Expired`. "Executes" = proposal state is `Executed`.

#### 4.3.7 Protocol / chain milestones

A protocol ships a feature, mainnet upgrade activates, audit completes, or roadmap milestone hits by a deadline.

**Examples:**
- "Ethereum Pectra upgrade activates by April 30"
- "Arbitrum Stylus mainnet activation before March 1"
- "EigenLayer slashing live by Q3"

**Resolution:** Hybrid — on-chain hard fork block check for upgrades, on-chain contract deployment check for new features, official announcement verification for everything else.

### 4.4 v1 Asset & NFT Allowlist

To guarantee clean automated resolution, v1 supports calls on a curated allowlist of assets and NFT collections. All assets have reliable Pyth feeds (pre-deployment verified per §4.4 note); all NFTs have deep Alchemy NFT API coverage with sufficient sales depth for the relayer-computed TWAP (§13.2).

**Coins (Price target + Spread/vs):**

- **Majors:** BTC, ETH, SOL
- **L2s:** ARB, OP, MATIC (POL), MNT
- **DeFi blue chips:** UNI, LINK, AAVE, SKY (was MKR — Pyth delisted MKR/USD after the MakerDAO→Sky rebrand; see CLAUDE.md Pyth Feed Catalogue)
- **Restaking / LSTs:** EIGEN, ETHFI, ezETH
- **Memes:** PEPE, WIF, BONK, DOGE
- **Arbitrum ecosystem:** GMX, PENDLE, RDNT
- **AI / RWA:** RNDR, FET, ONDO

(BASE was previously listed as an L2 but has no spot token and no Pyth feed; removed from the allowlist.)

**Pre-deployment verification:** Every ticker above must be confirmed against the [Pyth Network feed catalogue](https://docs.pyth.network/price-feeds/price-feeds) before mainnet deploy. Tickers at higher risk of missing or renamed feeds (verify first): MNT (Mantle), ETHFI, ezETH, RDNT, MATIC (now POL on Pyth). Any ticker without a verified feed is removed from the allowlist or paired with a documented secondary oracle path before launch.

**NFT collections (Price target only):**

- CryptoPunks
- Bored Ape Yacht Club (BAYC)
- Pudgy Penguins
- Milady
- Azuki
- DeGods

NFT floor calls resolve using 24-hour time-weighted average floor price computed off-chain by the relayer from Alchemy NFT API data (see §13.2) to prevent end-of-window manipulation.

**Expanding the allowlist:** Both lists are stored as a contract-level config and can be expanded by the owner via `addAsset(symbol, feedId)` and `addNFTCollection(contractAddress)`. Protocol-sponsored campaigns (Section 17.4) include adding the sponsor's token to the allowlist as part of the sponsorship.

### 4.5 Deferred to v2

The following call types are intentionally not supported in v1 — they require dedicated infrastructure that doesn't fit in the hackathon scope:

- **Macro / regulatory events** (SEC ETF approvals, Fed rate decisions, political outcomes) — needs a dedicated human-curated oracle
- **Multi-condition compound calls** ("BTC > $100k AND ETH > $5k") — needs composite resolution logic
- **Range / band predictions** ("ETH stays between $3,500 and $4,200 all month") — needs path-dependent settlement
- **First-to-X / race events** ("Berachain mainnet launches before Monad") — needs tracking of two events against each other
- **NFT mint outcomes** ("X collection sells out in first 24h") — needs mint-specific oracle integration

### 4.6 Explicitly cut

The following will not be supported in any version of Call It:

- **Social engagement events** (tweet likes, follower counts, cast recasts) — trivially manipulable via botting; fundamentally incompatible with a credibility-based product
- **Personal / interpersonal predictions** ("@person subtweets @other_person this month") — subjective and unverifiable

### 4.7 Resolution Criteria

Every call may include a **Resolution Criteria** free-text field where the caller defines exactly what counts as the call being correct. The criteria is hashed and stored onchain at publish; it cannot be edited.

**Purpose:**

Structured fields (Subject, Metric, Target, Deadline) handle automated resolution deterministically. But for event-based calls especially, ambiguity creeps in: what counts as "mainnet launch"? Does a Binance Innovation Zone listing count as "Binance lists"? Multi-choice governance proposals — what does "passes" mean?

Resolution Criteria lets the caller pre-specify their own standard, on record, before they publish. This:

- Forces the caller to think through ambiguity before going on record
- Gives a clear standard for human dispute reviewers to judge against
- Signals call quality to followers and faders
- Creates a self-curating effect — careful callers write careful criteria

**Optionality rules:**

| Call type | Criteria field |
|---|---|
| Price target | Optional |
| Spread / vs | Optional |
| Event/binary — TVL milestone | Optional |
| Event/binary — Volume/fees | Optional |
| Event/binary — On-chain metric | Optional |
| **Event/binary — CEX listing** | **Required (≥50 chars)** |
| **Event/binary — Token launch** | **Required (≥50 chars)** |
| **Event/binary — Governance** | **Required (≥50 chars)** |
| **Event/binary — Protocol milestone** | **Required (≥50 chars)** |

For required event types, the Publish button is disabled until the field has ≥50 characters of content.

**Binding behavior in resolution:**

Resolution Criteria is **advisory, not binding**, in disputes. The structured fields (Subject, Metric, Target, Deadline) are the legal anchor — they're what the auto-resolver queries and what the dispute reviewer ultimately judges against. Criteria provides supporting context for human review.

This is the right balance: it pulls callers toward thoughtfulness without letting them rewrite mechanics. A caller who writes criteria that contradicts their structured fields will lose disputes (because structured fields win), so the incentive is to make criteria *match* the structured intent — which is exactly what we want.

**Verified Criteria badge:**

Calls with criteria ≥50 characters earn a **"VERIFIED CRITERIA"** badge displayed:
- Next to the caller's handle on the call card in the feed
- On the receipt page
- On the shareable receipt card

No mechanical effects in v1 (no rep boost, no fee discount). Pure quality signal. The market rewards quality calls organically via follow/fade activity.

**Example criteria for each required event type:**

For **CEX listing:**
> "Binance must list POPCAT for spot trading on the main exchange (binance.com, not US/region-restricted). The listing must appear on binance.com/en/listing-announcements with an active trading pair (POPCAT/USDT or POPCAT/USDC at minimum). Innovation Zone-only listings or futures-only listings do not count. Token contract must match 0x... (Solana mainnet)."

For **Token launch:**
> "Berachain mainnet must produce block #1 AND ≥100 unique non-genesis transactions AND an official announcement from @berachain verified Twitter account. Testnet, devnet, or alphanet launches do not count. The block #1 timestamp must be before the deadline."

For **Governance:**
> "Arbitrum DAO STIP renewal proposal must reach 'Executed' state on Tally before the deadline. Multi-choice proposals: the option I'm betting on must be the single highest-voted option. If the proposal is split into multiple sub-proposals, the original proposal ID I selected at call creation is the authoritative one."

For **Protocol milestone:**
> "Stylus mainnet activation means: the Stylus precompile is deployed and active on Arbitrum mainnet AND there is at least one user-deployed Stylus contract with verifiable interactions on Arbiscan AND official announcement from Arbitrum Foundation. Testnet-only activation does not count."

---

## 5. Social Actions

Four actions can be taken on any live call.

### 5.1 Follow

The user bets the call is correct. They stake USDC into the FollowFadeMarket AMM, receiving FOLLOW shares priced by the current market. If the call settles correctly, FOLLOW shares pay out.

- AMM pricing model with dynamic odds
- Liquidity provided by the AMM mechanism
- The follow count and total follow pool are publicly visible on the call

### 5.2 Fade

The user bets the call is incorrect. They stake USDC into the FollowFadeMarket AMM, receiving FADE shares.

- Same AMM as Follow but opposite side
- If the call settles incorrectly, FADE shares pay out
- The fade count and total fade pool are publicly visible

### 5.3 Challenge

A 1v1 duel between the caller and a challenger. Challenges are one of the most viral surfaces of the product — "I publicly called you wrong and put money on it" is inherently dramatic, inherently shareable, and creates concrete narrative tension that the rest of the product orbits around.

**Flow:**
1. Challenger proposes a duel by submitting a counter-position and a stake
2. The original caller has 24 hours to accept (auto-rejects after timeout, challenger refunded)
3. On acceptance, both stakes are escrowed in ChallengeEscrow
4. At expiry, SettlementManager pays the entire pot (minus 1% protocol fee) to the winning side
5. Both sides receive **larger reputation impact** than regular call outcomes — duels carry roughly 1.5× the reputation movement of a comparable follow/fade settlement

**Default matched stakes:**

When a user clicks Challenge on a call, the challenge form pre-fills the challenger's stake to **match the caller's stake exactly**. The challenger can override this default, but the social signal is "I match your bet exactly." Matched stakes communicate equal conviction without negotiation.

If the challenger sets a different stake, the duel is asymmetric — the lower-stake side risks less but also wins less. The pot is `min(caller_stake, challenger_stake) × 2` plus the difference held by whichever side overcommitted; that overage is returned to its source at settlement, regardless of outcome.

**Open to Challenge — caller opt-in:**

Callers must explicitly enable "Open to 1v1 challenges" in the Advanced Settings of their call. By default, the toggle is **ON** for all new calls (encourages duel volume). If the caller disables it, no one can challenge — only follow/fade is available.

Calls with this enabled display a small **⚔ OPEN** badge on their card in the feed, indicating they accept challengers. Other users can filter the feed to show only challengeable calls.

**Trending Duels:**

Duels that hit activity thresholds get auto-promoted in the global feed:
- **Threshold:** Combined pot ≥ $500 USDC OR ≥50 "Riding" backers across both sides
- **Promotion:** The duel is pinned to the top of the global feed for 4 hours with a "TRENDING DUEL" label
- **Visibility:** Drives attention to duels that already have momentum, accelerating the meta-betting layer

**Duel King badge:**

In addition to the per-user challenger reputation score (Section 7.5), the **single user with the highest 7-day duel win streak** displays a "DUEL KING" badge on their profile. Updated weekly. Visible on:
- Profile page header
- Leaderboard row
- Call cards in the feed (next to handle)
- Receipt cards

Creates an aspirational target. Being the Duel King is a public status, refreshed every week.

**Duel-specific share card:**

When a duel resolves, the share card is uniquely dramatic — designed for the "I beat them" share moment:
- Two avatars facing off (one large, the loser's slightly dimmed)
- Outcome word in massive Syne type: **"VEDA WINS"** or the loser's "**LOUD AND WRONG**"
- The pot size in display type
- Reputation delta for each side (e.g., "veda +28 rep · degen_oracle -28 rep")
- The market and target underneath
- Call It branding bottom-left, Arbitrum branding bottom-right

Engineered for X virality. The visual is unique to duels — different layout from a regular settled receipt.

**Duels tab in the feed:**

A dedicated **Duels** tab in the global feed (between "Following" and the search) shows:
- **Active duels** (top section): all ongoing 1v1 duels, sorted by pot size descending. Each row: both callers' avatars + handles, market, pot, time remaining, market consensus split
- **Recently settled duels** (bottom section): last 7 days of completed duels, with the outcome and rep deltas
- Filter chips: All / Active / Just settled / High-stakes (>$500 pot)

This is the discovery surface for challenges — users who want to challenge but don't know where to start can browse pending duels here, see what others are doing, and find calls to challenge.

### 5.4 Quote-call

A new call that references a parent call as context. The quoting user expresses their own thesis (agreeing, disagreeing, adding nuance) and makes their own independent call with their own stake.

- Stored on CallRegistry with a `parent_call_id` reference
- Renders in the UI as a threaded reply with the parent call's summary
- Does not affect the parent call's pool or settlement — it is a separate call
- Creates a visible "thesis tree" around important calls

---

## 6. Anti-Spam Gates

To keep the feed credible and reputation meaningful, three hardcoded gates apply at call creation. These prevent spam, joke calls, duplicate calls, and unearned high-conviction posturing.

### 6.1 Minimum Stake Floor

Every call requires a minimum stake of **$5 USDC**.

- Hardcoded at the CallRegistry contract level
- Applies to all market types and event subtypes
- Calls with stake < $5 USDC revert at the contract
- Combined with the 1% protocol fee on settlement, this makes spam economically infeasible — 50 spam calls cost $250 minimum to publish

### 6.2 Duplicate Detection

Two identical calls cannot exist as Live at the same time, regardless of caller.

**Hash computation:**

At call creation, the CallRegistry computes a deterministic hash of the call's identifying fields:

```
duplicateHash = keccak256(
    market_type,
    subject,        // protocol/asset/DAO/exchange/etc.
    metric,         // for spread/event modes
    target_value,
    deadline_day_utc  // see rounding semantics below
)
```

**Deadline rounding semantics (locked):**

- **Timezone:** UTC. The contract has no concept of local time — all rounding is against UTC for determinism and to avoid DST surprises.
- **Direction:** Floor (truncate to the start of the UTC day).
- **Day length:** Exactly 86,400 seconds. Never a calendar day.

In Solidity: `deadline_day_utc = (deadline_timestamp / 86400) * 86400`.

**Implication:** A call with deadline `2026-05-21 14:32 UTC` and another with deadline `2026-05-21 23:59 UTC` both hash into the same `2026-05-21 00:00 UTC` bucket and are duplicates. A call with deadline `2026-05-22 00:01 UTC` is a separate hash. Users authoring near a UTC day boundary may find their intended deadline collides with a neighbouring slot — the frontend should surface the rounded UTC day next to the chosen deadline so this is never a surprise.

Note: the hash deliberately excludes `caller`, `conviction`, `stake`, and `reasoning`. Two different users cannot both publish "Pendle TVL > $9B by end of month" — the second attempt is rejected. The same user cannot republish their own call.

**Rejection behavior:**

When a duplicate is detected at publish time:
- The transaction reverts with reason `DuplicateCall(existingCallId)`
- The frontend catches the error and shows an inline message: "A nearly identical call already exists — quote it instead?" with a button linking to the existing call's receipt page
- The user can then quote-call the existing call (which references it via `parent_call_id`) rather than duplicating

**Settlement clears the hash:**

Once a call settles, its duplicate hash is freed. A new call with the same hash can then be created (e.g. "Pendle TVL > $9B by next month" after the previous one resolved).

### 6.3 High-Conviction Floor

Calls at conviction ≥85% (which trigger the 2× payout/penalty asymmetry) require the caller to have **≥10 previously settled calls**.

**Rationale:** Prevents brand-new accounts from posting high-conviction garbage to either fish for whales or build fake credibility. High conviction is a claim about your own track record — you need a track record to make it.

**Enforcement:**

- Checked at call creation against `ProfileRegistry.totalCalls` (the `settledCalls` count specifically — not just total)
- If caller has < 10 settled calls AND conviction ≥ 85%: the call publishes at **84% conviction** (the maximum allowed without the floor)
- The contract auto-caps the conviction value — no revert, the call still goes through

**UI behavior:**

When a user with < 10 settled calls moves the conviction slider past 85%:
- The slider visually allows the position (user can drag to any value)
- A warning callout appears below the slider in amber:
  > "⚡ High conviction unlocks after 10 settled calls. You have N. Your call will publish at 84% conviction — the highest available to you."
- The Publish button label updates to reflect the actual conviction that will be saved: "Publish call · 84% conviction · stake $XX"

Once the user has 10+ settled calls, the floor disappears and conviction operates normally (1-100%).

### 6.4 What These Gates Do NOT Restrict

Deliberately not gated in v1:

- **Rate limiting per caller.** Users can publish as many calls as they want (subject to gate 6.2 duplicate detection). No daily caps.
- **Minimum movement threshold.** Users can set targets very close to current values. The follow/fade market handles this — if the call is trivially-easy, the odds reflect that and the user earns minimal rewards.
- **Mandatory reasoning.** Reasoning is optional at all stake levels. Some calls don't need explanation.
- **Category quotas.** Users can post all their calls in one category. The reputation system surfaces this naturally — global score vs category sub-score reveals their actual edge.

These were considered and explicitly skipped. The three gates above are sufficient to prevent spam while preserving permissionless behavior.

---

## 7. Reputation System

The reputation system is the strategic moat of the product. Every mechanical decision below is locked.

### 7.1 Starting Score

Every user begins at **100 reputation**. Neutral baseline — not prestigious, not shameful.

### 7.2 Floor

Reputation can never go below **0**. If a loss would take a score from 8 to -7, it caps at 0.

### 7.3 Scoring Formula

Reputation changes scale with two multipliers applied together on every settled call.

**Winning call gain:**
```
rep_gain = base_gain × confidence_multiplier × contrarian_multiplier
```

Where:
- `base_gain` is a constant tuned for desired score velocity (suggested: 10)
- `confidence_multiplier` scales from ~0.5 at 50% conviction to ~2.0 at 100% conviction (linear or curved scaling)
- `contrarian_multiplier` scales based on the market consensus at the time of the call — if 85% of users went the other way and you were right, multiplier ≈ 2.0+; if 80% agreed with you and you were right, multiplier ≈ 0.7

**Result:** Maximum gain is a bold, lonely, correct call. Minimum gain is a timid, obvious, correct call.

**Losing call cost:**
```
rep_loss = base_loss × confidence_multiplier
```

- High confidence wrong call loses the most
- Low confidence wrong call loses less but still costs
- No contrarian multiplier on losses (being wrong is being wrong regardless of consensus)
- Result is capped at 0 floor

### 7.4 High Conviction Asymmetry

Calls made at **≥85% conviction** are subject to a 2× multiplier on both payout and penalty.

- Correct call at 85%+ conviction: 2× payout + 2× rep gain
- Incorrect call at 85%+ conviction: 2× stake loss + 2× rep loss

This creates a felt tension when the user moves the conviction slider past the threshold — the stakes physically double.

### 7.5 Structure — Three Layers

**Layer 1: Global score**
- Single number on every profile (e.g. 1,428)
- Page hero on profile view
- The number that appears on leaderboards, in receipts, and on call cards

**Layer 2: Category sub-scores**
- v1 ships with **three categories: Majors, DeFi, Other** (down from the eight originally explored — at hackathon volume eight categories produce statistical noise; three keeps the signal meaningful from day one)
- Each call belongs to exactly one category and only affects that sub-score plus the global
- Category assignment rules:
  - **Majors:** BTC, ETH, SOL, and any NFT calls (blue-chip collections behave as majors for reputation purposes)
  - **DeFi:** All other coins on the v1 allowlist (UNI, LINK, AAVE, SKY [was MKR — Pyth delisted MKR/USD post Maker→Sky rebrand], GMX, PENDLE, RDNT, EIGEN, ETHFI, ezETH, ONDO, RNDR, FET, ARB, OP, MATIC, MNT) and all DeFi-protocol event calls (TVL milestones, volume/fees, on-chain metrics, governance)
  - **Other:** Memes (PEPE, WIF, BONK, DOGE), CEX listings, token launches, protocol milestones, and any call that doesn't cleanly fit Majors or DeFi
- Reveals where a caller's edge actually is
- Categories are stored as an enum and can be split further in v2 (Memecoins, Layer 2s, Restaking, etc.) without a contract redeploy as long as new enum values are appended at the end

**Layer 3: Action-type scores**
- Caller score: accuracy and impact of own published calls
- Challenger score: win rate and impact in 1v1 duels
- Separate because skill profiles differ — someone can be a sharp challenger but mediocre caller, or vice versa

### 7.6 Following and Fading Do Not Affect Reputation

Only **making calls** moves your reputation. Following a winning caller does not earn you rep. Fading a losing caller does not earn you rep. This prevents leeching off others' reputation and forces users to publish to climb.

Following and fading still pay out financially via the FollowFadeMarket — but they do not move the reputation number.

### 7.7 Inactivity

All scores **freeze** at their last value on inactivity. No decay. No reset.

- A user who grinds to 500 and goes silent for 6 months returns at 500
- The score is a permanent record of what the user did, not a subscription
- Applies to both global and category sub-scores

### 7.8 Gating

**v1: None.** Reputation is purely social signal. There are no mechanical gates based on score.

The $100 max stake per call and the $5,000 TVL cap apply equally to all users regardless of reputation.

**v2 consideration (post-hackathon):** Reputation-gated stake limits (higher rep = higher per-call ceiling) are the most natural mechanical extension.

---

## 8. Market Mechanics, Exits & Fees

This section defines the complete economic engine of Call It: how positions are priced, how cold-start liquidity works, how exits function with time-decay penalties, and the full fee structure across every interaction.

### 8.1 Pricing Model — Parimutuel AMM

Call It uses a **parimutuel pool-split AMM** with constant-product invariant. Not an orderbook (Polymarket) and not a bonding curve (Melee). The choice is deliberate: it gives automatic liquidity from caller stakes, produces a clean probability signal (no growth-speculation distortion), and is the simplest model that supports identity-first prediction.

**How the AMM works:**

Each call has two pools — a **follow pool** (USDC betting the call is correct) and a **fade pool** (USDC betting the call is wrong). The constant-product invariant `follow_shares × fade_shares = k` governs share pricing.

When a user follows or fades, they deposit USDC into the corresponding pool and receive shares. Share price moves along the AMM curve — larger deposits relative to the pool generate worse prices (slippage). At settlement, the winning pool's holders split the losing pool's USDC proportional to their share ownership.

**Implied probability at any moment:**

```
P(follow wins) = fade_pool_USDC / (follow_pool_USDC + fade_pool_USDC)
P(fade wins)   = follow_pool_USDC / (follow_pool_USDC + fade_pool_USDC)
```

**Payout multipliers at any moment:**

```
follow_payout_multiplier = (follow_pool + fade_pool) / follow_pool
fade_payout_multiplier   = (follow_pool + fade_pool) / fade_pool
```

The bigger one side grows, the worse its payout becomes — drawing rebalancing flow from the opposite side.

### 8.2 Cold-Start Liquidity — Virtual Fade Seed

When a call is created, the caller's stake auto-enters the **follow pool**. The protocol seeds **$2 of virtual fade liquidity** on the opposite side as a pure accounting device.

**Why virtual liquidity exists:**

Without it, a brand-new call would have `fade_pool = $0`, making the AMM math undefined (division by zero) and the first fader's price impossibly favorable. The $2 virtual seed prevents both failures while costing nothing in real treasury outflow (it's not transferred — it's accounting only).

**How the virtual liquidity behaves:**

- At creation: `follow_pool = caller_stake`, `fade_pool = $2 virtual`
- As real faders deposit, the virtual $2 stays as a phantom alongside their real USDC
- The virtual portion does not pay out to anyone at settlement — it dissolves
- If fade wins and the only fade liquidity is the virtual $2, the entire follow pool transfers to the protocol treasury (recovering the caller's losing stake)

**This means:** if you're right about a call but nobody fades, you get your stake back (minus fees) — no profit, only reputation. If you're wrong and nobody fades, your stake goes entirely to the treasury. There is **no path** where the protocol pays callers more than they staked when no real counterparty exists. This blocks the "spam to extract from treasury" attack identified during design.

### 8.3 Cold-Start Reputation Adjustment

To prevent reputation farming via uncontested calls, the reputation gain for a **correct call with zero real fade activity** is reduced to **25% of the normal calculated gain**.

The full reward returns when real opposition exists:

| Outcome | No real faders | Real faders |
|---|---|---|
| **Caller right** | Stake returned minus fees, **25% rep gain** | Normal AMM payout, **full rep gain** |
| **Caller wrong** | Full stake to treasury, **full rep loss** | Real faders split pool, **full rep loss** |

The asymmetry is intentional. Being right alone deserves *some* reputation credit (you went on record and were correct), but not the same as being right against real opposition. Reputation losses always apply at full magnitude — being wrong is being wrong, regardless of who was watching.

### 8.4 Stake Limits

All stakes are in **USDC on Arbitrum**.

- **Minimum stake per call:** $5 USDC (anti-spam Gate 6.1)
- **Maximum stake per call (v1):** $100 USDC (mainnet safety cap)
- **Minimum follow/fade position:** $1 USDC
- **Maximum follow/fade position per user per call:** $100 USDC (matches caller cap)

The $5 minimum applies only to call creation. Followers and faders can take positions as small as $1 because they aren't introducing new calls into the feed.

### 8.5 Market Creation Fee

Every new call costs **$10 USDC** to publish, paid by the caller at the moment of creation.

The fee is split:
- **$5 to the protocol treasury** — funds operations and dispute rewards
- **$5 seeded into the call's virtual fade liquidity** — bringing the virtual fade seed from $2 to $7 for the lifetime of the call

This second portion is also accounting (not transferred to anyone), but it improves cold-start economics: a fader entering early sees a slightly more attractive position than they would with only $2 virtual.

The $10 creation fee is **separate from and in addition to** the caller's stake. A caller publishing a $50 stake call pays $60 total at creation ($10 fee + $50 stake).

### 8.6 Settlement Fee Structure

When a call settles, the following fees are deducted from the **losing pool** before the winning pool's holders are paid:

| Fee | Rate | Destination |
|---|---|---|
| **Protocol fee** | 1.0% | Treasury |
| **Creator fee** | 0.4% | Caller (Model B — see 8.8 for exit handling) |
| **LP fee** | 0.3% | Stays in the winning pool, distributed proportionally to all winning shareholders |
| **Total settlement extraction** | **1.7%** | |

**Why this matters:**

Total extraction at settlement is 1.7%, significantly lower than:
- Polymarket (historically 2% per trade × many trades over a position's life)
- Pump.fun (1% per trade × every buy/sell)
- Melee (estimated 3-5% per trade × bonding curve activity)

Call It charges only once at creation ($10 fee) and once at settlement (1.7%). No per-interaction trading fees. This is product-aligned: the product is about commitment, not trading.

### 8.7 Position Exits

Both callers and follow/fade participants can exit positions before settlement, with different penalty structures.

#### 8.7.1 Follower/Fader Exit

Followers and faders can exit any position they hold mid-call, subject to:

- **Cooldown:** 4 hours after entering the position. No exit possible during cooldown. Prevents bots from front-running news events.
- **Penalty:** Flat **10%** of the exiting party's stake.

**Slash distribution (10% of exiter's stake):**
- **50%** to the opposite side of the pool (rewards the doubters of the exiter's position)
- **40%** to the remaining same-side pool (rewards holders who didn't bail)
- **10%** to protocol treasury

The exiter receives the remaining 90% of their stake back immediately. Their shares are burned.

#### 8.7.2 Caller Exit

The caller can exit their own call after the first 24 hours, with a time-decaying penalty:

- **Hour 0–24 (hard lock):** Caller **cannot exit at all.** Any exit attempt reverts. This prevents instant regret exits that would confuse followers/faders who just opened positions.
- **Hour 24 onward:** Exit available with time-decay penalty.

**Penalty formula:**

```
penalty_pct = 15% + (35% × time_remaining_ratio)
time_remaining_ratio = (expiry_timestamp - now) / (expiry_timestamp - created_timestamp)
```

Examples for a 30-day call (after the 24-hour lock expires):

| Time elapsed | Time remaining ratio | Penalty |
|---|---|---|
| Day 1 (just after lock) | 0.97 | ~49% |
| Day 7 | 0.77 | ~42% |
| Day 15 (halfway) | 0.50 | ~32.5% |
| Day 22 | 0.27 | ~24% |
| Day 29 (1 day left) | 0.03 | ~16% |
| Final hour | 0.00 | **15% floor** |

The 15% floor ensures even last-minute exits cost meaningfully — preventing callers from bailing right before known losses.

**Slash distribution for caller exits:**
- **50%** to the follow pool (compensates followers, the most affected party — they trusted the caller's conviction)
- **40%** to the fade pool (rewards faders, validated by the caller's loss of confidence)
- **10%** to protocol treasury

The caller receives the remainder of their stake back. The call continues normally for all other participants — settlement proceeds at expiry as if the caller had never been in.

#### 8.7.3 Caller Exit — Broadcast & Reputation Slash

When a caller exits, the system generates a **public broadcast event** visible across the product:

- An entry appears in the global feed: `⚠ [caller] exited their own call · "[call statement]" · [time elapsed] in · -$X slashed`
- A notification fires to every current follower and fader on the call
- The call's receipt page displays a permanent "CALLER EXITED" badge in the header for the remainder of its lifetime
- The receipt at settlement shows the exit as part of the call's history

**Reputation slash on caller exit:**

In addition to the financial penalty, the caller takes a reputation hit. The rep slash follows a similar decay curve to the financial penalty:

- **Day 1 exit:** -45 rep
- **Halfway exit:** -25 rep
- **Late exit (last 10% of duration):** -10 rep (floor)

The rep slash is independent of whether the call later settles correct or wrong. The act of exiting itself is the social offense — abandoning a position you publicly staked on.

**Exited callers receive NO additional reputation change at the eventual settlement of the call.** The exit slash IS their settlement, regardless of how the call eventually resolves. This is intentional and locks the incentive surface: a caller who knows they're going to lose cannot reduce their net rep hit by exiting (because the exit slash already accounted for their abandonment), and a caller whose call eventually resolves *correctly* after they bailed doesn't get to claim credit for it. Once you exit, you are removed from the call's reputation accounting.

(Followers and faders continue to receive payouts at settlement; their reputation, per §7.6, is unaffected regardless.)

#### 8.7.4 No Cancellation Mechanic

There is no separate "cancel the call" path. The caller cannot void a call they've published.

The only ways out:
1. **First 24 hours:** Locked. Wait it out.
2. **After 24 hours:** Exit with time-decay slash (call continues for everyone else).
3. **At expiry:** Normal settlement.

This is intentional. "Be right in public" doesn't include "and you can undo it if you regret it." Publishing is a commitment.

### 8.8 Creator Fee Treatment — Model B

The caller's 0.4% creator fee at settlement is calculated as follows:

**If the caller stayed in the call until settlement:**
- Fee = 0.4% × total settled volume (follow_pool + fade_pool at settlement)
- Paid to caller's wallet automatically

**If the caller exited mid-call:**
- The contract snapshots `total_volume_at_exit` when the caller exits
- Fee = 0.4% × `total_volume_at_exit`
- Volume that accumulated *after* the caller's exit does not earn them fees
- Fee is calculated and paid at settlement (not at the moment of exit)

This is "Model B" — exited callers earn fees only on activity they were present for. Rewards them for creating the call (which has lasting value) but doesn't reward them for volume that came after they bailed.

### 8.9 Challenge Settlement (1v1 Duels)

Challenge duels use **fixed-odds escrow**, not the AMM. Both parties stake matching positions; on settlement, the winner takes the full pot.

**Fee structure for duels:**

- **Protocol fee:** 1.0% on the total pot
- **No creator fee** (the challenger is not "creating" a public call in the AMM sense)
- **No LP fee** (no AMM pool to compensate)

Both parties' reputations update at settlement, with the larger reputation impact than regular call wins/losses (duels are higher-stakes social commitments).

### 8.10 Dispute Bonds

When a settled call enters a dispute window, any user can submit a counter-claim by posting a **$5 USDC bond**.

- **If the disputer wins the dispute** (counter-claim accepted): bond returned + $2 USDC reward from treasury
- **If the disputer loses:** bond forfeited to treasury

This prevents spam disputes while keeping legitimate disputes economically viable. See Section 13.8 for the full dispute resolution flow.

### 8.11 Complete Fee Summary Table

| Fee | Rate | Paid By | Paid To | Trigger |
|---|---|---|---|---|
| **Market creation** | $10 flat | Caller at creation | $5 treasury / $5 virtual fade liquidity | At call creation |
| **Protocol fee** | 1.0% | All settled volume | Treasury | At settlement |
| **Creator fee** | 0.4% | All settled volume (or pre-exit volume per Model B) | Caller | At settlement |
| **LP fee** | 0.3% | All settled volume | Winning pool holders (proportional) | At settlement |
| **Follower/fader exit slash** | 10% flat | Exiting party | 50% opposite / 40% same / 10% treasury | On voluntary exit |
| **Caller exit slash** | 50% → 15% time-decay | Exiting caller | 50% followers / 40% faders / 10% treasury | On caller exit (after 24h lock) |
| **Dispute bond** | $5 USDC | Disputer | Returned + $2 reward (if win) / treasury (if lose) | At dispute submission |
| **Challenge protocol fee** | 1.0% | Total duel pot | Treasury | At duel settlement |

**Total extraction on a normal happy-path settled call:** **1.7%** (1.0% protocol + 0.4% creator + 0.3% LP-into-pool)

This is the headline number to communicate. It's lower than every comparable platform.

---

## 9. Authentication & Identity

Call It uses a hybrid authentication model that meets users where they are — crypto-natives can use their wallet directly, newcomers can sign in with Google or Twitter and get an embedded wallet auto-created behind the scenes. After sign-in, every user can optionally link their Twitter and Farcaster accounts to display on their profile and receipts.

### 9.1 Sign-in Options

Three entry paths, all leading to the same authenticated state:

**1. Connect Wallet** — Standard EOA wallet connection (MetaMask, Rabby, WalletConnect, Coinbase Wallet, etc.). User signs a SIWE (Sign-In With Ethereum) message to authenticate. No embedded wallet created — they use their existing one.

**2. Sign in with Google** — OAuth flow via Privy. Privy auto-creates an embedded wallet keyed to the Google account. The user never sees a seed phrase. Funds in this wallet are recoverable via Google.

**3. Sign in with Twitter** — OAuth flow via Privy. Same embedded wallet pattern as Google. Twitter handle is automatically captured and pre-linked (no separate "Connect Twitter" step required for this path).

All three paths produce the same authenticated session — an Arbitrum address with USDC capability and full access to every product action.

### 9.2 Embedded Wallet Provider

**Privy** is the chosen provider for embedded wallets.

Rationale:
- Polished UX with first-class Google, Twitter, Farcaster, and email login flows
- Free tier covers hackathon scale
- React SDK integrates cleanly with the existing frontend stack
- Handles key management, recovery, and progressive Web3 disclosure (user can "export" to a real wallet later)
- Strong documentation and active maintenance

Privy integrates as a single React provider wrapper around the app. The frontend calls `usePrivy()` to access auth state, wallet, and linking methods.

### 9.3 Optional Social Linking

After sign-in, every user is encouraged (but not required) to link Twitter and Farcaster.

**Flow:**
- New users (via any sign-in path) land on the Profile setup screen
- A "Connect socials" card displays two CTAs: "Connect Twitter" and "Connect Farcaster"
- Each is optional and can be skipped
- Users who skip can return later via Profile → Settings → Connect socials
- Users who sign in via Twitter have Twitter pre-linked automatically; the prompt shows only Farcaster

**Why encouraged:**
- Social proof: callers with verified socials are more credible to followers
- Distribution: shared receipts auto-tag connected handles, multiplying reach
- Discovery: other users can find a caller by their Twitter/Farcaster handle

### 9.4 Verification & Display

Linked socials display as a small **VERIFIED** badge next to the handle:

- VERIFIED · X — Twitter linked and verified via OAuth
- VERIFIED · FC — Farcaster linked and verified via Farcaster Auth Kit
- VERIFIED · X · FC — both linked

The badge appears:
- Next to the handle on the profile page header
- Next to the handle on call cards in the feed
- Next to the caller's handle on receipt cards (both live and settled)
- Next to the caller's handle on the duel page
- Next to the caller's handle in leaderboard rows

### 9.5 No Mechanical Effect on Reputation

Connected socials are **display-only**. They do not:
- Boost reputation score
- Unlock higher stake limits
- Grant access to special leagues or features
- Affect call payouts in any way

The badge signals credibility to other users (who decide whether to follow/fade based partly on it), but the protocol itself treats verified and unverified accounts identically. This keeps the reputation system pure — your number is earned by your calls, not by your X following.

### 9.6 Handle Resolution

User handles in the UI follow this priority order:

1. **ENS name** (if the user's wallet has a primary ENS record) — e.g. `jaxon.eth`
2. **Twitter handle** (if linked) — e.g. `@jaxonresearch`
3. **Farcaster handle** (if linked) — e.g. `@jaxon`
4. **Truncated address** as fallback — e.g. `0xa3f...91d2`

The user can manually set a preferred display handle in profile settings, overriding the priority.

### 9.7 Privacy & Data

- Privy stores OAuth tokens server-side; the frontend only receives the resulting authenticated session
- Twitter and Farcaster linking stores only the public handle and the verification proof onchain (in ProfileRegistry)
- No private social data (DMs, follower lists, email addresses) is collected
- Users can unlink socials at any time via Profile → Settings — this removes the badge and the handle reference but does not delete onchain history (calls and receipts remain permanent)

### 9.8 Onchain Identity Storage

The ProfileRegistry contract stores a minimal identity blob per user:

```solidity
struct SocialIdentity {
    string twitterHandle;    // empty string if not linked
    string farcasterHandle;  // empty string if not linked
    bytes32 twitterProofHash; // hash of OAuth verification, for audit
    bytes32 farcasterProofHash;
    uint64 twitterLinkedAt;
    uint64 farcasterLinkedAt;
}
```

This is updated via authenticated calls from the frontend through a relayer pattern: the user signs a message authorizing the link, the backend verifies the OAuth proof, and a relayer posts the update onchain. Gas is sponsored by the protocol for social linking actions to remove friction.

### 9.9 Twitter Follow-Graph Integration

When a user connects their Twitter account (either via "Sign in with Twitter" at registration or via "Connect Twitter" later), the product can leverage their existing Twitter follow graph to surface relevant calls — solving the cold-start problem for new users.

**The mechanic:**

When a user has Twitter connected, a backend service:
1. Queries Twitter's API to fetch the list of accounts the user follows on X
2. Cross-references this list against `ProfileRegistry.SocialIdentity.twitterHandle` to find Call It users the viewer follows on X
3. Surfaces those users' active and recently settled calls in a dedicated **"From your X"** section of the feed

**Feed integration:**

The "From your X" section appears between the pinned Top Conviction card and the global Live calls feed:

```
[ Pinned: Top conviction in your follow graph ]
[ "From your X" — calls from people you follow on X ]
   → veda's call on ETH (you follow her on X)
   → @cobie's call on PEPE (you follow him on X)
   → @degen_oracle's duel with @jaxon.eth (you follow degen on X)
[ Live calls feed (global) ]
```

**Scope and limits in v1:**

- **Max 10 calls shown** in the "From your X" section at any time
- Ordered by **recency** (most recently created first), not by ranking algorithm — keep v1 simple
- Includes both active calls and active duels involving followed accounts
- Excludes settled calls (those go to the dedicated "Settled" tab)
- Updates whenever the user opens the feed, with a 1-hour cache on the underlying Twitter graph query

**Opt-in flow:**

During first-time onboarding (after Twitter connect), the user sees a clear opt-in:

> **Show calls from people you follow on X?**
>
> We'll surface calls from X accounts you follow that have Call It profiles. This makes your feed instantly more relevant.
>
> [ Yes, show me ] [ No thanks ]

If declined, the section never appears. The user can re-enable later via Settings.

**Privacy notes:**

- The Twitter follow graph is **read-only** — Call It never modifies, comments, or posts to the user's X account
- The graph data is held server-side, not stored onchain
- The list of "Call It users you follow on X" is **visible only to the viewer themselves** — no one else can see who you follow on X via Call It
- Users can disconnect Twitter at any time, which clears the cached graph data

**Farcaster equivalent:**

The same mechanic applies for Farcaster — if a user has Farcaster connected, their Farcaster following list is queried via Farcaster Hub API, and a parallel "From your Farcaster" section appears below "From your X" (or replaces it if Twitter isn't connected).

If both are connected, both sections appear separately. Users can collapse either section if they prefer one network's signal over the other.

**Why this matters:**

Cold-start is the hardest problem for a social product. A new user with zero Call It follows sees a generic feed and bounces. With Twitter graph integration, the same user sees calls from people they already trust on another platform — the feed is relevant from minute one. This is the single biggest unlock for onboarding and retention.

---

## 10. Mainnet Safety

The product launches on **Arbitrum mainnet with real USDC** from day one. The following safety mechanisms are non-negotiable and hardcoded into every state-changing contract.

### 10.1 Max Stake Cap

```solidity
uint256 public constant MAX_STAKE_PER_CALL = 100 * 1e6; // $100 USDC (6 decimals)
```

Hardcoded constant. Cannot be changed without a redeploy. Any deposit attempt exceeding this reverts.

### 10.2 Total Value Locked Cap

```solidity
uint256 public tvlCap = 5_000 * 1e6; // $5,000 USDC initial

function setTvlCap(uint256 newCap) external onlyOwner {
    tvlCap = newCap;
}
```

The TVL cap is set to **$5,000 USDC** at launch. It is adjustable by the owner via `setTvlCap()` so it can be raised progressively after the contracts have been live and proven stable. The cap applies across all contracts holding funds in aggregate.

### 10.3 Emergency Pause

Every state-changing function on every contract is wrapped in a `whenNotPaused` modifier.

```solidity
bool public paused;

modifier whenNotPaused() {
    require(!paused, "paused");
    _;
}

function pause() external onlyOwner { paused = true; }
function unpause() external onlyOwner { paused = false; }
```

**Critically: withdraw and claim functions are NOT paused.** Even when the system is frozen, users can always exit their positions and pull out funds. This is the difference between "a bug we can recover from" and "drained users' funds."

### 10.4 Owner Functions

The deployer wallet has authority over:
- `pause()` / `unpause()`
- `setTvlCap(uint256)`
- Emergency withdraw of stuck tokens (only to a multisig, never directly to deployer)

The deployer cannot:
- Modify call outcomes
- Modify reputation scores
- Modify stake balances
- Modify fee structure

### 10.5 Audit-Ready Patterns

- All contracts use the Checks-Effects-Interactions pattern
- All external calls happen at the end of functions
- No `delegatecall` to user-controlled addresses
- Solidity version pinned to **`^0.8.24`** (not `0.8+`) — locks in checked arithmetic, transient storage, and a stable ABI surface
- USDC address is **hard-coded** at deploy: `require(token == USDC_ARB)` on every transfer path. Adding any other ERC20 in the future requires an explicit code change and audit, not a config flip — this blocks fee-on-transfer, rebasing, and callback tokens from sneaking in
- ReentrancyGuard on all functions that handle USDC transfers

### 10.6 Privy Custody Disclosure

Internal wallets used by OAuth sign-in paths are managed by Privy via MPC key shards. Functionally, this is a **third-party custodial relationship** — if Privy is acquired, restructured, or experiences a regional shutdown, affected users may lose access until they have completed wallet export.

Users are encouraged to **export the internal wallet to self-custody** once they hold a meaningful balance (the in-app prompt fires at balance ≥ $50 USDC). Export is a one-way operation: after export, the user holds the raw private key and Privy's MPC recovery + paymaster + multi-auth-linking benefits are lost for that wallet.

For the v1 hackathon launch this is an accepted limitation. Users see a one-time disclosure card during onboarding:

> "Your wallet is custodied by Privy until you export it. We recommend exporting once you hold more than $50 in this wallet. [Learn more]"

At growth scale (post-hackathon), regulatory considerations around money transmitter / VASP licensing are surfaced via this same path; user education is the v1 mitigation.

### 10.7 Paymaster Budget Caps

The protocol sponsors the first 5 transactions per user via Privy's Alchemy-backed paymaster (Section 9.2). Three layers of caps protect the protocol treasury from drain attacks:

1. **Per-account cap (hardcoded in the relayer):** Exactly 5 sponsored transactions per user. The 6th transaction requires user-provided ETH. Enforced server-side at the paymaster gating layer, not just in the contract.
2. **Global daily cap (configurable):** Hackathon launch budget is **$50/day**. If reached, the paymaster auto-disables for the rest of the UTC day and users are routed to the "fund your wallet to continue" flow. Post-launch budget grows as revenue justifies — owner-tunable via `setPaymasterDailyCap(uint256)` on the off-chain relayer config (not a contract function — paymaster pricing changes are operational, not consensus).
3. **Alert at 80% of cap:** Telegram bot pings the operator when the daily spend hits 80% of the cap, giving manual intervention time before exhaustion.

**Anti-sybil note:** Privy's free OAuth sign-in path means an attacker can create accounts at near-zero cost. The per-account cap of 5 transactions × ~$0.01 Arbitrum gas × Privy markup = ~$0.05-$0.10/account. 1M sybil accounts = ~$50K-$100K extraction without caps. The daily cap converts this into a denial-of-service-against-honest-users attack rather than a financial drain — preferable, and visible to operators within minutes.

CAPTCHA on sign-up is **deferred to v1.1** pending real abuse signal; the daily cap is the primary defense at hackathon scale.

### 10.8 Stylus Contract Upgradability

The StylusScoreEngine is deployed behind a **minimal transparent proxy** with the deployer wallet as the proxy admin. This enables in-place upgrade of the Rust scoring logic if a bug is discovered post-launch without forcing a migration of ProfileRegistry.

**Proxy admin restrictions:**
- The proxy admin is owned by the same deployer key that controls `pause()` and `setTvlCap()`
- Upgrades require pause → upgrade → unpause sequence (a paused system cannot have its scoring rules silently changed mid-call)
- The proxy admin key is rotated to a multisig before any v1.1 promotion (post-hackathon, before user balance exceeds $5K)

**Other contracts (CallRegistry, FollowFadeMarket, ChallengeEscrow, SettlementManager, ProfileRegistry) are NOT upgradable in v1.** A bug in any of these requires the documented rollback policy: pause → fund-stuck-acceptable for $5K-cap TVL → redeploy fresh contracts → broadcast migration instructions. This is intentional — upgradability on the money-handling contracts is its own attack surface, and the $5K cap makes redeploy a tolerable recovery path.

---

## 11. Smart Contract Architecture

Six contracts comprise the system. Each has a clearly bounded responsibility.

### 11.1 CallRegistry

The source of truth for all calls.

**Responsibilities:**
- Stores call structs (caller, market type, asset(s), direction, target, expiry, conviction, stake, reasoning text hash, parent_call_id for quotes)
- Emits events on creation, follow, fade, challenge, quote, settle
- Maintains call lifecycle state (Live, Settled, Disputed)
- Acts as the registry queried by all other contracts

### 11.2 FollowFadeMarket

The AMM-based market for follow/fade positions on each call.

**Architecture decision (locked):** A **single FollowFadeMarket contract** holds sub-state for all calls, keyed by `callId`. Per-call minimal proxies were considered and rejected — single-contract storage costs less gas per call creation (~50k saved), makes TVL-cap aggregation trivial, and integrates more cleanly with Stylus cross-contract invocation. The blast-radius concern (a bug in the single contract affects all markets) is mitigated by the v1 $5K TVL cap, the emergency pause, and the withdraw/claim carve-out from pause.

**Responsibilities:**
- Holds the per-call follow pool, fade pool, and per-user share balances as nested mappings keyed by `callId`
- Constant-product AMM (`follow_shares × fade_shares = k`) — chosen over LMSR for simplicity and gas
- Mints FOLLOW and FADE shares to users in exchange for USDC deposits
- Tracks per-user position entry timestamps for the 4-hour exit cooldown
- Burns shares and pays out USDC on settlement via a pull pattern (`claimPayout`)
- Enforces post-expiry deposit gate, slippage protection, and TVL-cap aggregation across all open calls

**AMM penalty-injection semantics (locked):** When a caller-exit or position-exit slash distributes USDC into a pool, the USDC is **added directly to the pool reserve**, and `k` grows accordingly. Existing shareholders on the receiving side see their share value increase pro-rata. No phantom shares are minted. This keeps the math one-sided and intuitive: the pool got richer, every existing share is worth more.

### 11.3 ChallengeEscrow

The fixed-odds escrow contract for 1v1 duels.

**Responsibilities:**
- Receives the challenger's stake and counter-position
- Manages the 24h acceptance window
- Auto-refunds if the original caller does not accept within the window
- Holds both stakes during the duel
- Releases full pot to winner on settlement

### 11.4 SettlementManager

The contract that resolves calls and triggers payouts.

**Responsibilities:**
- Reads price data from Pyth at expiry
- For event calls, reads from designated oracle/data source
- Calls into FollowFadeMarket and ChallengeEscrow to trigger payouts
- Calls into ProfileRegistry and StylusScoreEngine to update reputations
- Manages the 24h dispute window for event calls

### 11.5 ProfileRegistry

User profile and reputation state.

**Responsibilities:**
- Maps user address → profile struct (global rep, category sub-scores, action-type scores, streak counter, total calls, accuracy, calibration)
- Stores social identity (Twitter handle, Farcaster handle, verification proofs) per user
- Read-only for the frontend
- Write access restricted to SettlementManager for reputation updates, and to a relayer with verified OAuth proofs for social linking

### 11.6 StylusScoreEngine

Reputation math engine, written in Rust and compiled to Stylus.

**Responsibilities:**
- Takes call outcome data as input (caller address, win/loss, conviction %, market consensus at call time, category, current rep state)
- Computes the new reputation values across all three layers (global, category, action-type)
- Returns updated values to SettlementManager
- Handles confidence × contrarian math, high-conviction asymmetry, floor clamping
- Runs in Rust for near-native speed; the same logic in Solidity would cost prohibitive gas

**Deployment & upgradability:** Deployed behind a minimal transparent proxy per Section 10.8, so the Rust logic can be patched without migrating ProfileRegistry state.

**Runtime fallback (not just build-time):** SettlementManager wraps its call to StylusScoreEngine in a try/catch. If the Stylus call reverts at runtime — out-of-gas, unforeseen panic, paused proxy mid-settle — SettlementManager falls back to a built-in Solidity baseline calculation that approximates the same formula at lower fidelity (linear confidence scaling, fixed contrarian multiplier of 1.0, no high-conviction asymmetry). The settlement completes; a `RepCalculatedFallback(callId, user, baselineDelta)` event fires so the operator can investigate and (if needed) compensate the user manually. **Without this runtime fallback, a Stylus revert would freeze settlement permanently** — unacceptable for a real-money product.

**Build-time fallback (hackathon decision):** If the Rust + Stylus build path is not working by **48 hours before demo**, the StylusScoreEngine is replaced with a Solidity implementation of the same scoring formula at full fidelity, deployed to the same proxy slot. The Stylus migration becomes a v1.1 priority. Judges are pitched on "Stylus in production roadmap" rather than the fallback being a fail.

---

## 12. Contract Interfaces

Solidity function signatures for each contract. These are the canonical interfaces — implementations may add internal helpers.

### 12.1 CallRegistry

```solidity
interface ICallRegistry {
    enum MarketType { PriceTarget, SpreadVs, EventBinary }
    enum CallStatus { Live, Settled, Disputed, CallerExited }

    struct Call {
        uint256 id;
        address caller;
        MarketType marketType;
        bytes32 assetA;
        bytes32 assetB;            // address(0) for single-asset calls
        int256 targetValue;        // signed for direction
        uint64 createdAt;
        uint64 expiry;
        uint8 conviction;          // 1-100, auto-capped at 84 if caller has <10 settled calls
        uint256 stake;             // USDC amount, minimum $5 (5_000_000 with 6 decimals)
        bytes32 reasoningHash;     // IPFS or off-chain ref
        bytes32 criteriaHash;      // Resolution Criteria hash (Section 4.7); zero if optional and unfilled
        uint256 parentCallId;      // 0 if not a quote
        uint8 category;            // enum index
        bytes32 duplicateHash;     // hash for duplicate detection
        CallStatus status;
        bool outcome;              // valid only when status == Settled
        bool openToChallenges;     // §5.3 — when false, ChallengeEscrow rejects proposeChallenge
        // Caller exit tracking
        uint64 callerExitedAt;     // 0 if not exited; presence-tested via status == CallerExited
                                   // (the redundant `bool callerExited` was removed — one source of truth)
        uint256 callerVolumeAtExit; // total volume snapshot at exit (for Model B creator fee)
    }

    // Anti-spam constants
    uint256 public constant MIN_STAKE = 5 * 1e6;                  // $5 USDC
    uint256 public constant MAX_STAKE = 100 * 1e6;                // $100 USDC (mainnet cap)
    uint256 public constant CREATION_FEE = 10 * 1e6;              // $10 USDC market creation fee
    uint256 public constant CREATION_FEE_TO_TREASURY = 5 * 1e6;   // half of creation fee to treasury
    uint256 public constant CREATION_FEE_TO_VIRTUAL = 5 * 1e6;    // half to virtual fade liquidity
    uint256 public constant VIRTUAL_FADE_SEED = 2 * 1e6;          // $2 base virtual fade
    uint8 public constant HIGH_CONVICTION_THRESHOLD = 85;
    uint8 public constant HIGH_CONVICTION_FLOOR_CAP = 84;
    uint32 public constant SETTLED_CALLS_FOR_HIGH_CONVICTION = 10;
    uint64 public constant CALLER_EXIT_LOCK_DURATION = 24 hours;
    uint256 public constant CRITERIA_MIN_LENGTH = 50;             // characters for binary event types

    // Duplicate hash → active call ID (0 if cleared)
    mapping(bytes32 => uint256) public activeDuplicateHashes;

    event CallCreated(uint256 indexed id, address indexed caller, MarketType marketType, uint256 stake);
    event CallSettled(uint256 indexed id, bool outcome);
    event CallQuoted(uint256 indexed parentId, uint256 indexed quoteId);
    event ConvictionCapped(address indexed caller, uint8 requested, uint8 applied);
    event CallerExited(
        uint256 indexed callId,
        address indexed caller,
        uint64 timeElapsed,
        uint256 penaltyPaid,
        uint256 stakeReturned,
        int32 reputationDelta
    );

    error StakeBelowMinimum(uint256 attempted, uint256 minimum);
    error StakeAboveMaximum(uint256 attempted, uint256 maximum);
    error DuplicateCall(uint256 existingCallId);
    error CriteriaRequired(MarketType marketType, uint8 subtype);
    error CallerExitLocked(uint64 unlocksAt);
    error CallerAlreadyExited();
    error NotCaller();
    error ExpiryNotInFuture(uint64 expiry, uint64 now_);
    error TvlCapReached(uint256 requested, uint256 available);
    error AssetNotAllowlisted(bytes32 asset);
    error CategoryInvalid(uint8 category);
    error UsdcTransferFailed();             // wraps ERC20 revert with context
    error InsufficientUsdcAllowance(uint256 needed, uint256 actual);
    error InsufficientUsdcBalance(uint256 needed, uint256 actual);
    error Paused();                          // explicit, surfaces nicer than "paused"

    function createCall(
        MarketType marketType,
        uint8 eventSubtype,        // for event/binary, 0-6; for other types, 0
        bytes32 assetA,
        bytes32 assetB,
        int256 targetValue,
        uint64 expiry,
        uint8 conviction,
        uint256 stake,
        bytes32 reasoningHash,
        bytes32 criteriaHash,      // required for event subtypes 3-6 (CEX, Token, Gov, Protocol)
        uint256 parentCallId,
        uint8 category,
        bool openToChallenges      // §5.3 "Open to 1v1 challenges" toggle, default true at the UI layer
    ) external returns (uint256 callId);

    function callerExit(uint256 callId) external returns (uint256 amountReturned);

    function getCall(uint256 callId) external view returns (Call memory);

    // Paginated; pre-built for v1 even though hackathon volumes are small,
    // so v2 expansion doesn't require a redeploy.
    function getCallsByUser(address user, uint256 offset, uint256 limit) external view returns (uint256[] memory);
    function getCallCountByUser(address user) external view returns (uint256);

    // Helper: compute the duplicate hash for given call parameters (for frontend pre-check).
    // `deadlineDayUtc` MUST equal `(deadlineTimestamp / 86400) * 86400` (UTC, floor) per §6.2.
    function computeDuplicateHash(
        MarketType marketType,
        bytes32 assetA,
        bytes32 assetB,
        int256 targetValue,
        uint64 deadlineDayUtc
    ) external pure returns (bytes32);

    // Helper: compute the current caller-exit penalty for a call (for frontend display)
    function computeCallerExitPenalty(uint256 callId) external view returns (
        uint256 penaltyAmount,
        uint256 amountReturned,
        bool exitAvailable
    );
}
```

**Anti-spam enforcement happens inside `createCall`, in order:**

1. `require(!paused, Paused)` — emergency pause carve-out per §10.3
2. `require(expiry > block.timestamp, ExpiryNotInFuture)` — cannot publish a call already expired
3. `require(category < CATEGORY_COUNT, CategoryInvalid)` — three categories in v1 per §7.5
4. `require(stake >= MIN_STAKE, StakeBelowMinimum)` — Gate 6.1
5. `require(stake <= MAX_STAKE, StakeAboveMaximum)` — Mainnet safety
6. `require(currentTvl + stake + CREATION_FEE_TO_VIRTUAL <= tvlCap, TvlCapReached)` — §10.2 aggregate cap
7. `require(_isAllowlisted(assetA), AssetNotAllowlisted)` and same for assetB if non-zero — §4.4 allowlist
8. For event subtypes 3-6 (CEX listing, Token launch, Governance, Protocol milestone): `require(criteriaHash != bytes32(0), CriteriaRequired)` — Section 4.7
9. Compute `duplicateHash` from the call parameters using the UTC-floor day rounding per §6.2. **Note:** the hash is computed from the *requested* conviction. The auto-cap from Gate 6.3 happens after hashing, so two callers with different requested convictions but otherwise identical parameters still collide (intended — conviction is not an identity field).
10. `require(activeDuplicateHashes[duplicateHash] == 0, DuplicateCall(activeDuplicateHashes[duplicateHash]))` — Gate 6.2
11. Read caller's `settledCalls` from ProfileRegistry; if `settledCalls < 10 && conviction >= 85`, set `conviction = 84` and emit `ConvictionCapped` event — Gate 6.3
12. Pre-check `USDC.allowance(caller, address(this)) >= stake + CREATION_FEE` — revert `InsufficientUsdcAllowance` with helpful values so the frontend can re-prompt for approval
13. Pre-check `USDC.balanceOf(caller) >= stake + CREATION_FEE` — revert `InsufficientUsdcBalance` similarly
14. Pull `stake + CREATION_FEE` ($10 fee) from caller's wallet via `safeTransferFrom`; on failure revert `UsdcTransferFailed`
15. Route `CREATION_FEE_TO_TREASURY` ($5) to treasury, `CREATION_FEE_TO_VIRTUAL` ($5) to virtual fade pool (added to base `VIRTUAL_FADE_SEED` $2 = $7 total virtual fade for this call)
16. Proceed with call creation, store the duplicateHash and `openToChallenges` flag, emit `CallCreated`

**Caller exit logic inside `callerExit`:**

1. `require(!paused, Paused)`
2. `require(msg.sender == call.caller, NotCaller)`
3. `require(block.timestamp >= call.createdAt + CALLER_EXIT_LOCK_DURATION, CallerExitLocked)`
4. `require(call.status == CallStatus.Live, CallerAlreadyExited)` — `CallerExited` and `Settled` both fail this check; `CallerAlreadyExited` is the user-facing message because that's the more common case to surface
5. Compute `penaltyPct = 15 + (35 × time_remaining_ratio)` per Section 8.7.2
6. Compute `penaltyAmount = call.stake × penaltyPct / 100`
7. Split penalty: 50% to follow pool, 40% to fade pool, 10% to treasury — added directly to pool reserves per §11.2 penalty-injection semantics; existing shares appreciate
8. Snapshot `callerVolumeAtExit = followPool + fadePool` for Model B creator fee calculation
9. Set `call.callerExitedAt = now`, `call.status = CallerExited` (the previously-redundant `bool callerExited` was removed; `status == CallerExited` is the single source of truth)
10. Apply reputation slash to caller via ProfileRegistry (decay curve, floor at -10). Mark the caller as no longer part of this call's reputation accounting per §8.7.3 — eventual settlement does NOT apply additional rep changes to this caller
11. Transfer `call.stake - penaltyAmount` back to caller via `safeTransfer`
12. Emit `CallerExited` event for broadcast

**Settlement clears the duplicate hash:**

When a call settles via `SettlementManager`, the corresponding `activeDuplicateHashes[duplicateHash]` is reset to 0, allowing a new call with the same parameters to be created.

### 12.2 FollowFadeMarket

```solidity
interface IFollowFadeMarket {
    event Followed(uint256 indexed callId, address indexed user, uint256 stake, uint256 shares);
    event Faded(uint256 indexed callId, address indexed user, uint256 stake, uint256 shares);
    event PayoutClaimed(uint256 indexed callId, address indexed user, uint256 amount);

    // `minSharesOut` is the slippage floor — caller's transaction reverts if the AMM would mint
    // fewer shares than this (e.g. due to a sandwich attack or concurrent same-block deposit).
    // Frontend computes the expected shares + a small tolerance (e.g. 1%) and passes it through.
    function follow(uint256 callId, uint256 stake, uint256 minSharesOut) external returns (uint256 sharesMinted);
    function fade(uint256 callId, uint256 stake, uint256 minSharesOut) external returns (uint256 sharesMinted);

    function claimPayout(uint256 callId) external returns (uint256 amount);

    // Position exit (Section 8.7.1) — flat 10% penalty after 4h cooldown
    function exitPosition(uint256 callId, bool isFollow) external returns (uint256 amountReturned);

    function getFollowPool(uint256 callId) external view returns (uint256);
    function getFadePool(uint256 callId) external view returns (uint256);
    function getSharePrice(uint256 callId, bool isFollow) external view returns (uint256);
    function getUserPosition(uint256 callId, address user) external view returns (uint256 followShares, uint256 fadeShares);
    function getPositionEntryTime(uint256 callId, address user, bool isFollow) external view returns (uint64);

    // Anti-front-running cooldown
    uint64 public constant POSITION_EXIT_COOLDOWN = 4 hours;
    uint8 public constant POSITION_EXIT_PENALTY_PCT = 10;  // flat 10%
    uint256 public constant MIN_POSITION = 1 * 1e6;        // $1 USDC minimum follow/fade position
    uint256 public constant MAX_POSITION = 100 * 1e6;      // $100 USDC max position per user per call

    event PositionExited(
        uint256 indexed callId,
        address indexed user,
        bool isFollow,
        uint256 penaltyAmount,
        uint256 amountReturned
    );

    error ExitCooldownActive(uint64 unlocksAt);
    error NoPositionToExit();
    error PositionBelowMinimum(uint256 attempted, uint256 minimum);
    error PositionAboveMaximum(uint256 attempted, uint256 maximum);
    error CallNotLive(uint256 callId);              // call is settled, disputed, or callerExited and locked for new deposits
    error CallPastExpiry(uint64 expiry, uint64 now_); // post-expiry follow/fade blocked — settle() must run first
    error SlippageExceeded(uint256 expected, uint256 actual);
    error TvlCapReached(uint256 requested, uint256 available);
    error AlreadyClaimed();
    error NoPayoutAvailable();                       // user is on the losing side, or call not yet settled
    error CallNotSettled(uint256 callId);            // claim attempted while call is still Live
    error Paused();
}
```

**Follow/fade deposit logic (`follow`, `fade`):**

1. `require(!paused, Paused)` — emergency carve-out per §10.3
2. `require(stake >= MIN_POSITION, PositionBelowMinimum)`
3. `require(stake <= MAX_POSITION, PositionAboveMaximum)` — plus check that *cumulative* position by this user in this pool stays under MAX_POSITION
4. `require(call.status == CallStatus.Live || call.status == CallStatus.CallerExited, CallNotLive)` — CallerExited markets stay open per §8.7.2 ("The call continues normally for all other participants")
5. **`require(block.timestamp < call.expiry, CallPastExpiry)` — critical post-expiry gate**. Without this, anyone who sees the price move past expiry can deposit on the winning side before `settle()` is called, harvesting risk-free returns
6. `require(currentTvl + stake <= tvlCap, TvlCapReached)` — TVL is aggregated across all pools and contracts
7. Compute `sharesMinted` from the AMM curve
8. **`require(sharesMinted >= minSharesOut, SlippageExceeded)` — sandwich protection**
9. `safeTransferFrom(user → contract, stake)`; on failure revert with descriptive error
10. Record `positionEntryTime[callId][user][side] = block.timestamp` for the 4h exit cooldown — note: if a user adds to an existing position, the entry timestamp resets to the *latest* deposit (preserves the front-running protection)
11. Mint shares, increment pool reserve, emit `Followed` / `Faded`

**Position exit logic inside `exitPosition`:**

1. `require(!paused, Paused)` — but note: per §10.3, position exit is one of the carve-outs and DOES function while paused; the `Paused` check here is omitted so users can always exit. (Listed for completeness.)
2. `require(userShares > 0, NoPositionToExit)`
3. `require(block.timestamp >= positionEntryTime + POSITION_EXIT_COOLDOWN, ExitCooldownActive)`
4. If the call has already settled, revert with `CallNotLive` and surface "Use Claim Payout instead" in the frontend
5. Compute `userStake = sharesToUsdc(userShares, side)` from the current pool reserves
6. Calculate `penaltyAmount = userStake × POSITION_EXIT_PENALTY_PCT / 100` (10%)
7. Split penalty: 50% to opposite pool, 40% to same-side pool, 10% to treasury — added directly to pool reserves per §11.2 penalty-injection semantics
8. Burn user's shares
9. `safeTransfer(user, userStake - penaltyAmount)`
10. Emit `PositionExited` event

**Claim payout logic inside `claimPayout`:**

1. `require(call.status == CallStatus.Settled, CallNotSettled)` — `claimPayout` requires settlement to have run; for `CallerExited` settled calls this still applies (the call eventually settles after caller exit)
2. `require(!claimed[callId][user], AlreadyClaimed)` — idempotency: a second claim attempt reverts cleanly
3. Determine winning side from `call.outcome`; if user holds no winning shares, revert `NoPayoutAvailable` (UI should not show the claim button in this case)
4. Compute `userPayout = userWinningShares / totalWinningShares × totalPool`
5. Mark `claimed[callId][user] = true` BEFORE transfer (Checks-Effects-Interactions)
6. `safeTransfer(user, userPayout)`
7. Emit `PayoutClaimed`

### 12.3 ChallengeEscrow

```solidity
interface IChallengeEscrow {
    enum ChallengeStatus { Proposed, Accepted, Rejected, Settled, Refunded }

    struct Challenge {
        uint256 callId;
        address challenger;
        uint256 challengerStake;
        uint64 proposedAt;
        ChallengeStatus status;
        address winner;
    }

    uint64 public constant CHALLENGE_ACCEPTANCE_WINDOW = 24 hours;

    event ChallengeProposed(uint256 indexed challengeId, uint256 indexed callId, address indexed challenger);
    event ChallengeAccepted(uint256 indexed challengeId);
    event ChallengeRejected(uint256 indexed challengeId);
    event ChallengeRefunded(uint256 indexed challengeId);
    event ChallengeSettled(uint256 indexed challengeId, address winner, uint256 payout);

    error CallNotChallengeable(uint256 callId);
    error CallerNotOpenToChallenges(uint256 callId);
    error SelfChallenge();
    error ChallengeStakeBelowMinimum(uint256 attempted, uint256 minimum);
    error ChallengeStakeAboveMaximum(uint256 attempted, uint256 maximum);
    error NotOriginalCaller();
    error AcceptanceWindowExpired(uint64 expiredAt);
    error AcceptanceWindowNotExpired(uint64 expiresAt);
    error WrongChallengeStatus(ChallengeStatus current, ChallengeStatus required);
    error AlreadyClaimed();
    error NotDuelWinner();
    error Paused();

    function proposeChallenge(uint256 callId, uint256 stake) external returns (uint256 challengeId);
    function acceptChallenge(uint256 challengeId) external;
    function rejectChallenge(uint256 challengeId) external;
    function claimRefund(uint256 challengeId) external; // after 24h timeout
    function claimDuelPayout(uint256 challengeId) external;

    function getChallenge(uint256 challengeId) external view returns (Challenge memory);
}
```

**Propose-challenge logic inside `proposeChallenge`:**

1. `require(!paused, Paused)`
2. Read the parent call from CallRegistry
3. `require(call.status == CallStatus.Live, CallNotChallengeable)` — CallerExited, Settled, and Disputed all fail (you cannot challenge a caller who has abandoned ship)
4. `require(call.openToChallenges, CallerNotOpenToChallenges)` — contract-level enforcement of the §5.3 toggle, not just UI
5. **`require(msg.sender != call.caller, SelfChallenge)` — self-challenge banned** (no rep farming, no Duel King gaming via puppet wallets)
6. `require(block.timestamp < call.expiry, CallNotChallengeable)` — cannot challenge a call past its own expiry
7. `require(stake >= MIN_STAKE && stake <= MAX_STAKE, ...)` — same per-call stake bounds as call creation
8. Pre-check USDC allowance + balance with descriptive errors as in §12.1
9. `safeTransferFrom` the challenger's stake into escrow
10. Record the challenge with `proposedAt = block.timestamp`, `status = Proposed`
11. Emit `ChallengeProposed`

**Accept logic inside `acceptChallenge`:**

1. `require(!paused, Paused)`
2. `require(msg.sender == call.caller, NotOriginalCaller)`
3. `require(challenge.status == ChallengeStatus.Proposed, WrongChallengeStatus)`
4. `require(block.timestamp <= challenge.proposedAt + CHALLENGE_ACCEPTANCE_WINDOW, AcceptanceWindowExpired)`
5. `safeTransferFrom` the caller's matching stake into escrow (defaults to `challenger.stake` per the matched-stake UX, but asymmetric duels are allowed per §5.3 — caller signs whatever stake they intend)
6. Set `challenge.status = Accepted`, emit `ChallengeAccepted`

**Reject and refund logic:** `rejectChallenge` lets the caller cancel an unwanted challenge during the window (refunds challenger immediately); `claimRefund` lets the challenger pull their stake back after the window expires without action. Both require `challenge.status == Proposed`. `claimRefund` additionally requires the window to have expired (`AcceptanceWindowNotExpired` otherwise).

**Claim duel payout logic inside `claimDuelPayout`:**

1. `require(challenge.status == ChallengeStatus.Settled, WrongChallengeStatus)`
2. `require(msg.sender == challenge.winner, NotDuelWinner)`
3. `require(!claimed[challengeId], AlreadyClaimed)`
4. Compute `pot = min(callerStake, challengerStake) × 2` per §5.3 — asymmetric duels' overage is returned to whichever side overcommitted, regardless of outcome
5. Compute `payout = pot × 99 / 100` — 1% protocol fee per §8.9
6. Mark claimed BEFORE transfer (Checks-Effects-Interactions)
7. `safeTransfer(winner, payout)` and `safeTransfer(treasury, fee)`
8. If overage exists, `safeTransfer(overcommitter, overage)`
9. Emit `ChallengeSettled` (finalization event)

### 12.4 SettlementManager

```solidity
interface ISettlementManager {
    uint64 public constant DISPUTE_WINDOW = 24 hours;
    uint64 public constant FORCE_SETTLE_COOLDOWN = 7 days;
    uint8  public constant MAX_COUNTER_CLAIMS = 3;        // §13.8

    // Standard settlement
    event CallSettled(uint256 indexed callId, bool outcome, int256 priceDelta);
    event SettlementDelayed(uint256 indexed callId, string reason, uint64 retryAfter);
    event DisputeRaised(uint256 indexed callId, address indexed challenger, bytes32 evidenceHash);
    event DisputeResolved(uint256 indexed callId, bool finalOutcome, address resolver);

    // Stylus call observability (Section 11.6)
    event RepCalculated(
        uint256 indexed callId,
        address indexed user,
        uint32 currentRep,
        uint8 conviction,
        uint8 consensusPct,
        bool isWinner,
        uint32 baseValue,
        int32 delta
    );
    event RepCalculatedFallback(
        uint256 indexed callId,
        address indexed user,
        int32 baselineDelta,
        bytes lowLevelError
    );

    // Operator escape hatch — owner-only, with 7-day cooldown from call expiry
    event CallForceSettled(uint256 indexed callId, bool outcome, address owner);

    error CallNotExpired(uint64 expiry, uint64 now_);
    error AlreadySettled(uint256 callId);
    error OracleDataAmbiguous(string source);   // triggers dispute window per §13.7
    error NotSettlementManagerCaller();          // for cross-contract guards
    error CounterClaimLimitReached(uint8 limit);
    error DisputeWindowClosed(uint64 closedAt);
    error DisputeBondInsufficient(uint256 attempted, uint256 required);
    error ForceSettleCooldownActive(uint64 unlocksAt);
    error NotOwner();
    error Paused();

    // Anyone can call (gas-incentive comes from the relayer rotating these).
    // Settlement is idempotent: a second call when status != Live reverts AlreadySettled.
    function settle(uint256 callId) external;

    function raiseDispute(uint256 callId, bytes calldata evidence) external payable;
    function resolveDispute(uint256 callId, bool finalOutcome) external; // owner-only in v1

    // Operator escape hatch for stuck settlements (oracle permanently unavailable, Stylus reverts
    // persisting through retries, etc.). Only callable after FORCE_SETTLE_COOLDOWN from expiry.
    // Logs the manual override loudly so it's visible to all users — never use silently.
    function forceSettle(uint256 callId, bool outcome) external;
}
```

**Settlement logic inside `settle(callId)` — all steps atomic; any revert rolls back the entire transaction:**

1. `require(!paused, Paused)` — note: settlement IS paused under emergency stop. Withdraw/claim paths remain open per §10.3 but new outcomes cannot be written
2. `require(call.status == CallStatus.Live, AlreadySettled)` — idempotency: a second `settle()` call reverts cleanly. CallerExited markets are still eligible for settlement (the call continues for non-caller participants per §8.7.2); their `status` transitions Live → Settled at this step
3. `require(block.timestamp >= call.expiry, CallNotExpired)` — cannot settle before expiry
4. Dispatch to the correct oracle adapter based on `call.marketType` and `call.eventSubtype`
5. **Oracle read with confidence checks** per §13.1:
   - For Pyth-backed reads: `require(pythConfidence × 200 <= price, OracleDataAmbiguous("PYTH_CONFIDENCE_WIDE"))` — 0.5% confidence threshold
   - On `OracleDataAmbiguous`, do NOT revert the whole tx. Instead: increment a retry counter on the call, emit `SettlementDelayed(callId, reason, retryAfter=60s)`, and return early. The relayer reschedules.
   - If retry counter exceeds 30 (30 retries × 60s = 30 minutes), open a dispute window via the same path as a manual `raiseDispute` — per §13.7
6. Compute `outcome` deterministically from the oracle data
7. **Update the caller's reputation** via `StylusScoreEngine` wrapped in try/catch per §11.6:
   ```
   try styleEngine.compute_rep_change(...) returns (int32 delta) {
       profileRegistry.updateAfterSettlement(call.caller, call.category, true, isWinner, delta);
       emit RepCalculated(callId, caller, currentRep, conviction, consensusPct, isWinner, base, delta);
   } catch (bytes lowLevelError) {
       int32 baselineDelta = _solidityBaselineRepDelta(...);
       profileRegistry.updateAfterSettlement(call.caller, call.category, true, isWinner, baselineDelta);
       emit RepCalculatedFallback(callId, caller, baselineDelta, lowLevelError);
   }
   ```
   The fallback path keeps settlement progressing; operator investigates the Stylus revert offline. If caller has exited (per §8.7.3), skip this step entirely — exited callers receive no further rep changes.
8. **For challenges:** if a duel is attached, compute challenger outcome (inverse of caller outcome since they took opposite sides), apply rep deltas to both parties (~1.5× the standard rep movement per §5.3), update ChallengeEscrow status to Settled with `winner` set
9. **For Followers/Faders:** NO per-user rep updates (per §7.6, follow/fade does not move rep). Only mark the call as settled and unlock pull-pattern `claimPayout()` per §12.2. This keeps `settle()` gas O(1) regardless of participant count.
10. **Cold-start rep adjustment** per §8.3: if the call won AND the real fade pool (excluding the $7 virtual seed) was zero, scale the caller's `delta` down to 25% before applying. "Real" = any non-zero real USDC, per §8.3 spec text.
11. Pay protocol fee (1%), creator fee (0.4% × volume-at-exit for Model B or full volume otherwise), and route LP fee (0.3%) into the winning pool's reserve
12. Clear the duplicate hash (`activeDuplicateHashes[duplicateHash] = 0`) so the same call parameters can be reused
13. Set `call.status = Settled`, `call.outcome = outcome`
14. Emit `CallSettled(callId, outcome, priceDelta)`

**Atomicity guarantee:** all 14 steps execute in a single transaction. If any step reverts (oracle revert, Stylus revert escaping the try/catch, USDC transfer revert, etc.) the entire settlement rolls back and the call remains `Live` — preventing partial-state corruption like "rep updated but fees not paid." The only intentional non-revert is step 5's `OracleDataAmbiguous`, which emits `SettlementDelayed` and exits cleanly so the relayer can retry.

**Dispute logic inside `raiseDispute`:**

1. `require(msg.value == 5 * 1e6, DisputeBondInsufficient)` — $5 USDC bond per §8.10 (passed via `payable` — note that for USDC bonds the function takes the bond as a USDC transfer rather than ETH; the interface above reflects the calling convention but the implementation pulls USDC via `safeTransferFrom`)
2. `require(call.status == CallStatus.Settled || ...Disputed..., ...)` — disputes can only be raised against settled or already-disputed calls
3. `require(block.timestamp <= call.settledAt + DISPUTE_WINDOW, DisputeWindowClosed)`
4. `require(counterClaimCount[callId] < MAX_COUNTER_CLAIMS, CounterClaimLimitReached)`
5. Record the dispute with evidence hash (off-chain content addressed via IPFS or similar)
6. If this is the first dispute against a `Settled` call, transition `status` to `Disputed`
7. Emit `DisputeRaised`

**Resolve dispute logic inside `resolveDispute` (v1: owner-only):**

1. `require(msg.sender == owner, NotOwner)`
2. `require(call.status == CallStatus.Disputed, WrongCallStatus)`
3. If `finalOutcome != call.outcome`, reverse the settlement: reverse rep deltas (via Stylus or fallback with negation flag), re-distribute pool USDC from old-winner to new-winner accounting (note: shareholders who already `claimPayout`ed under the wrong outcome must be clawed back — in v1 this is operationally hairy enough that **post-claim disputes are not honored**; the dispute window is shorter than the typical claim activity to make this rare)
4. Refund disputer bond + $2 reward from treasury (per §8.10) if their counter-claim is accepted
5. Forfeit disputer bond to treasury if the original outcome stands
6. Set `call.status = Settled` with `call.outcome = finalOutcome`
7. Emit `DisputeResolved(callId, finalOutcome, msg.sender)`

**Force-settle logic inside `forceSettle(callId, outcome)`:**

1. `require(msg.sender == owner, NotOwner)`
2. `require(block.timestamp >= call.expiry + FORCE_SETTLE_COOLDOWN, ForceSettleCooldownActive)` — 7 days from expiry; cannot bypass the normal settlement path in the first week
3. `require(call.status == CallStatus.Live || ...Disputed..., AlreadySettled)`
4. Execute the standard settlement path from step 7 onward, treating `outcome` as the oracle-provided outcome (skip the oracle read entirely)
5. Emit BOTH `CallForceSettled(callId, outcome, owner)` AND `CallSettled(callId, outcome, 0)` so dashboards see the override loudly

This is the operator's escape hatch for permanently stuck oracles (e.g., Pyth deprecates a feed, DefiLlama deletes a protocol, CEX listing announcement page changes format and scraper breaks). Documented in the settlement-stuck operator runbook. Never used in normal flow.

### 12.5 ProfileRegistry

```solidity
interface IProfileRegistry {
    // v1 ships three categories per §7.5; new categories may be appended in v2 without redeploy
    enum Category { Majors, DeFi, Other }
    uint8 public constant CATEGORY_COUNT = 3;

    uint256 public constant MAX_HANDLE_LENGTH = 50; // applies to Twitter & Farcaster handle strings

    struct Profile {
        uint32 globalRep;
        uint32[CATEGORY_COUNT] categoryRep;   // sized to current enum; future categories require migration
        uint32 callerRep;
        uint32 challengerRep;
        uint32 streak;
        uint32 totalCalls;
        uint32 settledCalls;                   // used by §6.3 high-conviction floor
        uint32 wins;
        uint32 losses;
        uint64 lastActiveAt;
    }

    struct SocialIdentity {
        string twitterHandle;       // empty string if not linked; max MAX_HANDLE_LENGTH bytes
        string farcasterHandle;     // empty string if not linked; max MAX_HANDLE_LENGTH bytes
        bytes32 twitterProofHash;   // hash of OAuth verification, for audit
        bytes32 farcasterProofHash;
        uint64 twitterLinkedAt;
        uint64 farcasterLinkedAt;
    }

    event ProfileUpdated(address indexed user, uint32 newGlobalRep);
    event SocialLinked(address indexed user, string platform, string handle);
    event SocialUnlinked(address indexed user, string platform);
    event SettlementManagerUpdated(address indexed old, address indexed new_);
    event RelayerUpdated(address indexed old, address indexed new_);

    error NotAuthorizedSettlementManager(address caller);
    error NotAuthorizedRelayer(address caller);
    error HandleTooLong(uint256 length, uint256 max);
    error InvalidCategory(uint8 attempted, uint8 max);
    error AlreadyLinked(string platform);

    // Owner can rotate the authorized SettlementManager. Old manager loses write access immediately.
    // Multiple SettlementManagers cannot be authorized simultaneously — single source of truth
    // prevents rep-corruption from stale deployments.
    function setSettlementManager(address newManager) external; // onlyOwner
    function setRelayer(address newRelayer) external;          // onlyOwner

    function getProfile(address user) external view returns (Profile memory);
    function getSocialIdentity(address user) external view returns (SocialIdentity memory);

    // Restricted to the single authorized SettlementManager
    function updateAfterSettlement(
        address user,
        uint8 category,
        bool isCaller,
        bool isWinner,
        int32 repDelta
    ) external;

    // Restricted to authorized relayer with verified OAuth proof.
    // Reverts HandleTooLong if bytes(handle).length > MAX_HANDLE_LENGTH.
    function linkTwitter(address user, string calldata handle, bytes32 proofHash) external;
    function linkFarcaster(address user, string calldata handle, bytes32 proofHash) external;
    function unlinkTwitter(address user) external;       // user can call this directly
    function unlinkFarcaster(address user) external;     // user can call this directly
}
```

**Access control:**
- `updateAfterSettlement` reverts `NotAuthorizedSettlementManager` if `msg.sender != currentSettlementManager`. The owner may rotate this address with `setSettlementManager`, which emits `SettlementManagerUpdated` — the prior manager loses write access in the same block. Two settlement managers cannot be authorized simultaneously.
- `linkTwitter` / `linkFarcaster` revert `NotAuthorizedRelayer` if `msg.sender != currentRelayer`. Owner may rotate the relayer with `setRelayer`. Per §10.7 the relayer key should sit behind a multisig at growth scale.
- `unlinkTwitter` / `unlinkFarcaster` are callable by the user directly (no relayer required) — letting users remove a compromised social link without waiting on the relayer.

### 12.6 StylusScoreEngine (Rust interface, exposed as Stylus contract)

```rust
// Stylus contract exposed function signature (sol_storage / external attribute)
pub fn compute_rep_change(
    current_rep: u32,
    conviction: u8,          // 1-100
    consensus_pct: u8,       // % of market that agreed with the call at creation time
    is_winner: bool,
    base_value: u32,         // base gain/loss before multipliers
) -> i32 {
    // Returns signed delta to apply to rep
    // Handles:
    //   - confidence multiplier
    //   - contrarian multiplier (winners only)
    //   - high-conviction 2x asymmetry at conviction >= 85
    //   - floor at 0 (clamping handled by caller)
}
```

Callable from SettlementManager via standard Stylus cross-contract invocation.

---

## 13. Settlement & Oracles

The product uses multiple data sources depending on call type. All are wired into the SettlementManager via dedicated oracle adapters.

### 13.1 Price Feeds — Pyth Network

**Pyth** is the primary oracle for coin price calls (Price target, Spread/vs with Price metric, Token launch price thresholds).

- Sub-second price updates with confidence intervals
- The SettlementManager reads the price at expiry via `PythUpgradable.getPriceNoOlderThan(priceId, 60)` (60-second freshness window) — single-block reads are avoided because they're trivially MEV-manipulable on thin pairs
- All v1 allowlisted coins must have a Pyth feed; new additions require verifying feed availability against [docs.pyth.network/price-feeds/price-feeds](https://docs.pyth.network/price-feeds/price-feeds) before activation

**Confidence threshold (locked):** Pyth publishes a `confidence` value in the same units as `price`. The contract requires `confidence × 200 <= price` — i.e. **confidence interval ≤ 0.5% of price**. Reads outside this band are treated as ambiguous and trigger the retry policy below. (Post-v1: per-asset thresholds — 0.1% for majors, up to 2% for memes. The v1 single threshold is acceptable because the allowlist excludes long-tail assets.)

**Tiered wait policy on ambiguous reads:**

1. First failed read at expiry → emit `SettlementDelayed(callId, "PYTH_CONFIDENCE_WIDE", retryAfter=60s)`. Relayer reschedules.
2. Retry every 60 seconds for up to **30 minutes** (30 attempts max).
3. If all 30 retries fail, settlement falls into the standard 24h dispute window per §13.7 with reason `"oracle data ambiguous"`. Owner resolves in v1.
4. **Worst-case settlement SLA:** 30 minutes (Pyth retries) + 24 hours (dispute window) = **24h 30m maximum** from `call.expiry` to a final `Settled` state, under all conditions short of a complete oracle outage. The `forceSettle` escape hatch (§12.4) becomes available at expiry + 7 days for the truly stuck case.

**Spread/vs reads:** read both `assetA` and `assetB` Pyth feeds within the same block. If either fails confidence, treat the spread settlement as ambiguous.

### 13.2 NFT Floor Prices — Alchemy NFT API

**Background — Reservoir API sunset.** The original spec named Reservoir as the NFT oracle. Reservoir sunset their NFT API on **October 15, 2025**, and pivoted the company to "Relay Protocol" (cross-chain trading). The Reservoir endpoint no longer exists; the spec was rewritten to use Alchemy as the replacement.

**Alchemy NFT API** is the v1 oracle for NFT floor price calls.

- Coverage: all 6 v1 NFT collections (CryptoPunks, BAYC, Pudgy Penguins, Milady, Azuki, DeGods) are blue-chip Ethereum collections with deep Alchemy support — verified before launch via `getFloorPrice` against each contract address
- Alchemy does **not** expose a native TWAP endpoint, so the relayer computes the 24-hour time-weighted average floor price **off-chain** from raw listings + sales data pulled via `getNFTSales` and `getFloorPrice` calls at 5-minute polling intervals
- The computed TWAP is signed by the relayer key and submitted on-chain at the settlement timestamp via a `submitNftFloor(callId, twapPriceWei, observationCount, evidenceHash)` call to SettlementManager
- The signed update includes a count of underlying observations — if fewer than 12 observations exist in the 24h window (e.g. the collection went illiquid), the read is treated as ambiguous and routed to the dispute window per §13.7
- New NFT additions to the allowlist require: (a) confirmed Alchemy coverage, (b) verified ≥24 sales/day average over the prior 30 days, and (c) explicit `addNFTCollection(contractAddress)` call by the owner

**Categorization for reputation:** NFT calls map to the `Majors` category per §7.5 — blue-chip NFTs behave as majors for reputation purposes.

**Why relayer-computed TWAP and not on-chain TWAP:** computing a 24h TWAP on-chain requires either continuous Chainlink-style price updates (paid gas per update) or a Uniswap-V3-style observation array (only available for swappable assets; NFT floors are not). Off-chain computation by a signed relayer is the standard pattern for non-fungible price oracles and is the explicit design accepted as a v1 trust trade-off. Mitigated by: (a) the dispute window catches bad signed reads, (b) the operator runbook includes a sanity-check script that re-computes TWAP from on-chain transfer logs and flags mismatches.

**Relayer trust:** the TWAP signing key sits in the same multisig as the rest of the relayer authority per §10.7. Compromising it forges NFT settlement outcomes — bounded by the per-call $100 stake cap and the $5K TVL cap in v1.

### 13.3 Protocol Data — DefiLlama API

**DefiLlama** is the oracle for TVL, Volume/fees, and APR-based event calls.

- The SettlementManager queries DefiLlama via an off-chain relayer at the deadline timestamp
- Relayer signs the data point and submits it on-chain for verification
- Supported metrics: protocol TVL, chain TVL, 7d/30d volume, 7d/30d fees, 7d revenue, supply APR, borrow APR, staking APR

### 13.4 On-chain Metrics — direct RPC

For purely on-chain metrics (active addresses, gas burned, validator count, liquidation events), the SettlementManager queries data directly from Arbitrum and other chain RPCs via a relayer.

- For event-driven resolution (e.g. "any liquidation > $50M happens"), the relayer watches the relevant contract events and triggers settlement as soon as a qualifying event occurs within the window
- For snapshot-based resolution (e.g. "Arbitrum DAA > 1M"), the relayer queries the metric at the deadline timestamp

### 13.5 Governance — Snapshot + Tally

For governance event calls:

- **Snapshot:** off-chain signature-based voting. Relayer reads the proposal state from Snapshot's API at the deadline
- **Tally:** on-chain governance for ERC-20 governance tokens. SettlementManager can read proposal state directly via the governance contract's standard interface

### 13.6 CEX Listings — exchange announcement scraping

For CEX listing event calls, a backend relayer monitors the official listing announcement pages of supported exchanges (Binance, Coinbase, OKX, Bybit, Kraken, Bitget, KuCoin, Upbit). When a matching listing announcement is detected within the resolution window, the relayer submits a signed proof on-chain.

This is the highest-trust resolution path (exchange announcements are public but not on-chain), so it has the tightest dispute window — see Section 12.8.

### 13.7 Hybrid Resolution Flow & Settlement SLA

All event calls follow this resolution sequence:

1. **Auto-resolution attempt** at deadline timestamp — SettlementManager queries the appropriate oracle adapter
2. **Clean data path:** if the source returns deterministic data within tolerance, the call settles immediately
3. **Ambiguous path:** if the source is unavailable, contradictory, or the data is borderline (e.g. Pyth confidence >0.5% per §13.1, NFT TWAP <12 observations per §13.2, DefiLlama stale, CEX listing scrape inconclusive), the tiered retry policy runs first:
   - Pyth-backed reads: 30 retries × 60s = 30-minute window per §13.1
   - All other relayer-signed reads: single retry attempt at +5 minutes; if both fail, ambiguous
4. **Dispute window** opens after retries exhaust: 24 hours; any user can submit a counter-claim with a $5 USDC bond and supporting evidence
5. **Resolution:**
   - No counter-claim filed: original auto-resolution stands at the end of the window
   - Counter-claim filed: owner-resolved in v1 (decentralized resolution is post-hackathon, e.g. Kleros integration or token-weighted vote)
   - Maximum 3 counter-claims per call per §13.8; the third is the final to be considered

**Settlement SLA (locked):**

| Path | Time from `call.expiry` to final `Settled` state |
|---|---|
| Clean oracle data | < 1 block (~250ms on Arbitrum) |
| Pyth confidence retry, succeeds within 30min | up to 30 minutes |
| Ambiguous data, no dispute filed | up to ~24h 30m (oracle retries + dispute window) |
| Ambiguous data, dispute filed, owner resolves promptly | ~24h 30m + owner response time |
| All retries exhausted, owner unresponsive | requires `forceSettle` at expiry + 7 days |

**24h 30m maximum** is the operator commitment for normal-flow settlements. Surface this SLA in user-facing copy on the receipt page ("Settles within 24h after [expiry]") so users do not panic when ambiguous reads delay settlement past the exact expiry minute.

### 13.8 Dispute Bonds

- Bond amount: $5 USDC
- If the disputer wins (counter-claim accepted): bond returned + small reward from protocol treasury ($2 USDC equivalent)
- If the disputer loses: bond forfeited to protocol treasury (prevents spam disputes)
- A single call can have at most 3 counter-claims; after 3, the dispute window closes and the third claim is resolved by owner

---

## 14. Design System

The design system is fully specified and locked.

### 14.1 Color Palette

**Backgrounds:**
- Primary background: `#09090E` (near-black with slight blue undertone)
- Secondary background: `#111118` (cards and panels)
- Tertiary background: `#1A1A24` (hover states, elevated rows)
- Quaternary background: `#13131D` (podium tier on leaderboard)

**Borders:**
- Subtle border: `#1E1E2E`
- Active border: `#2E2E42`

**Primary accent (Call It signal color):**
- `#E8F542` — sharp electric yellow-green. Used sparingly. Represents correct calls, reputation gains, winning side.

**Functional colors:**
- Win / correct: `#4ADE80` (clean green)
- Loss / incorrect: `#F87171` (clean red)
- Neutral / pending: `#94A3B8` (slate)
- Challenge / orange action: `#FB923C`
- High-conviction warning: `#FB923C` (amber)

**Typography colors:**
- Primary text: `#F1F5F9`
- Secondary text: `#64748B`
- Muted text: `#334155`

### 14.2 Typography

- **Primary typeface:** Space Grotesk (Inter as fallback) — UI text, labels, body
- **Display typeface:** Syne — large reputation scores, outcome words, leaderboard hero scores
- **Monospace:** JetBrains Mono — addresses, transaction IDs, timestamps, prices

**Hierarchy:**
- Display (rep score, outcome word): 64–96px, Syne, tight letter-spacing
- Headline: 28–40px, Space Grotesk, medium weight
- Subhead: 18–22px, Space Grotesk
- Body: 14–16px, Space Grotesk
- Label/meta: 11–12px, Space Grotesk, uppercase, tracked out
- Data/address: 13px, JetBrains Mono

### 14.3 Spacing

- Base unit: 4px
- Card padding: 20–24px
- Section spacing: 48–64px
- Max content width: 1120px

### 14.4 Corner Brackets

L-shaped corner brackets in `#2E2E42` are used on data-heavy cards as a design motif (inspired by Isidor.ai). Used on reputation cards, notable receipt trophies, and any card containing data that "matters."

### 14.5 Iconography

- Line icons only, 1.5px stroke weight
- Slightly rounded joins
- No filled icons except state indicators (active, correct, incorrect)

### 14.6 Neobrutalist Treatment (locked)

Call It's visual register is **neobrutalist on top of the brand foundation above** — not generic neobrutalism (which would clash with the typographic and palette restraint), but a deliberate fusion where the brand keeps its sharp typography and electric accent while structural elements (borders, shadows, frames) gain weight, edge, and intentionality.

**Border weights:**
- Subtle structural borders (card outlines, dividers): **2px** in `#1E1E2E`
- Primary action / hero card borders: **3px** in `#E8F542` (accent yellow-green) or `#2E2E42` depending on emphasis
- Outcome blocks (settled receipts, settled duels): **3-4px** in the outcome color (`#4ADE80` win, `#F87171` loss, `#E8F542` contrarian, `#FB923C` exited)

**Shadows:**
- Hard offset shadows only — **never blurred**. Format: `4px 4px 0 [color]`
- The shadow color matches the border color of the element (yellow border = yellow shadow, red border = red shadow)
- Buttons get the shadow on hover: idle = flat against the border; hover = `4px 4px 0` offset; active/click = `2px 2px 0` (the button "presses down")
- Outcome blocks have a permanent hard shadow that "stamps in" on reveal — see animation rules §17.2

**Corner radius:**
- Default: `0px` on cards, buttons, inputs, outcome blocks
- Allowed: `2px` on small chips, tags, and badges where a sharp corner would feel aggressive (category tags, conviction percentage pills)
- Never use radii ≥ 4px anywhere in v1

**Corner brackets, elevated:**
- The L-bracket motif from §14.4 is upgraded to a **primary visual element**, not decoration
- Stroke weight: **4px** (was 1px-ish in original spec)
- Color: `#E8F542` (accent yellow-green) on all data-significant blocks; `#2E2E42` on secondary blocks for restraint
- Placement: top-left and bottom-right of every block that carries weight (outcome block, profile rep card, leaderboard #1 hero, receipt page frame, sign-in screen frame, FINAL POSITIONS block). NOT used on every UI element — the rule is "every block of weight gets brackets," and the absence of brackets signals secondary content.

**Typography treatment:**
- Display type (Syne 64-96px) for outcome words and rep scores stays as-is — already brand-correct
- Body labels (uppercase, tracked-out, 11-12px) get **slightly heavier letter-spacing** in neobrutalist context (e.g. `0.12em` instead of `0.08em`) to feel deliberately industrial
- Headlines use `font-weight: 600` (Space Grotesk medium) — never lighter than 500 in v1

**Asymmetric grids and exposed structure:**
- Layouts default to **asymmetric** where the design permits (settled receipt, sign-in screen, leaderboard #1 hero) — symmetric layouts feel default-WordPress
- Structural dividers are visible, not hidden — column gutters get visible vertical lines (`1px #1E1E2E`) where they meet a horizontal divider, rather than negative space alone

**Motion:** see §17.2 — stamp animations, sharp eases, no smooth fades for state changes. The shadow is part of the motion language: it grows on hover, snaps on click, stamps on reveal.

**The "no slop" filter:** if a UI element could appear unchanged in a generic SaaS dashboard, it's wrong. Every primary action, outcome block, and data card should be unmistakably Call It. The neobrutalist + brand fusion is the differentiator — defaults are the enemy.

---

## 15. Page Specifications

Ten pages are designed and locked. All inherit the §14.6 neobrutalist treatment by default — thick borders, hard offset shadows, 4px corner brackets on weight-carrying blocks, no rounded corners.

### 15.1 The Tape (Feed)

The global call stream. Page path: `/`

**Layout:**
- Top: thin price ticker strip (28px tall, scrolling marquee at 11px monospace, slightly lifted bg)
- Below ticker: main navigation header (logo left, search center, wallet right)
- Left sidebar: navigation (Feed, New call, Receipt·Live, Receipt·Settled, Profile, Duel, Leaderboard) + YOUR REP card
- Main column: page title "The Tape" + tabs (Live calls / Settled / Following / **Duels**) + filter + new call CTA + feed

**Feed sections in order (top to bottom):**

1. **TOP CONVICTION pinned card** — highest-conviction call from the user's Call It follow graph. Styled identically to regular cards with a small "TOP CONVICTION · IN YOUR FOLLOW GRAPH" label.

2. **"From your X" section** (if Twitter connected and opt-in confirmed) — up to 10 most recent calls from accounts the user follows on Twitter that have linked Call It profiles. Section header: "FROM YOUR X · [N] callers you follow on X are live." Section is collapsible. See Section 9.9 for the underlying mechanic.

3. **"From your Farcaster" section** (if Farcaster connected and opt-in confirmed) — parallel structure to "From your X" but reading from Farcaster's social graph. Up to 10 calls from followed Farcaster accounts.

4. **Live calls feed (global)** — chronological stream of all active calls across the platform, paginated, with filter chips.

**Call card structure (canonical):**
- Line 1: Avatar + handle + rep score dot + **VERIFIED · X badge** (if linked) + **VERIFIED CRITERIA badge** (if criteria ≥50 chars) + **⚔ OPEN badge** (if open to challenges) + **DUEL KING badge** (if applicable) | CLOSES IN countdown (right)
- Call statement (typographic hero, 28–32px)
- Tag row: category tag + asset tag + stake amount
- Single conviction bar (combined follow/fade split with conviction pill on left)
- Action row: Follow (filled yellow-green) · Fade (red outline) · Challenge (text+icon) · Quote (icon only)
- Top-right card corner: expand icon (distinct from quote icon)

**No quote count on the Quote button** — Quote is the lightest action.

**Duels tab (new dedicated spec):**

The Duels tab shows all 1v1 challenge duels, separate from regular calls.

Layout:
- **Filter chips** at top: All / Active / Just settled / High-stakes (>$500 pot) / Trending
- **Active duels section** (top): all ongoing 1v1 duels, sorted by pot size descending
  - Each row shows two-column layout: caller (left) vs challenger (right) with avatars + handles + rep scores
  - Center column: market statement + pot size + time remaining
  - Bottom of row: live market consensus bar (% favor caller / % favor challenger split)
  - Click row → navigate to full Duel page
- **Trending duels** that have hit thresholds ($500+ pot or 50+ "Riding" backers) get a "TRENDING" pin pinned at the top of the section for 4 hours
- **Recently settled duels** (bottom section): last 7 days of completed duels, with outcome and rep deltas. Settled rows are styled with the winner highlighted and loser dimmed.

### 15.2 New Call ("Go on record.")

The call composition page. Page path: `/new`

**Layout:**
- Title: "Go on record."
- Subtitle: "Every field shapes the receipt — and the receipt is permanent."
- Drafts·N button top right
- Split layout: form left, live receipt preview right

**Common fields (always visible, top of form):**
- MARKET TYPE: Price target / Spread vs / Event binary (segmented buttons)

**Mode-specific fields** (rendered dynamically based on selected market type):

**Price target mode:**
- ASSET selector (single)
- DIRECTION: Up / Down
- TARGET + UNIT (% / $)

**Spread / vs mode:**
- ASSET / VS (two asset selectors)
- METRIC dropdown: Price / Market cap / Volume rank (7d) / TVL rank / Fees rank (7d)
- TARGET (shape varies by metric):
  - Price: percentage spread (e.g. ">5%")
  - Market cap / rank metrics: segmented button — Flips / Beats by X% / Stays ahead of

**Event / binary mode:**
- EVENT TYPE: 2-column card grid with 7 subtypes (TVL milestone, Volume/fees, On-chain metric, CEX listing, Token launch, Governance, Protocol milestone)
- Dynamic field set per event type:
  - **TVL / Volume / On-chain metric:** Subject dropdown, Metric dropdown, Comparison (>/</=), Target value
  - **CEX listing:** Exchange, Action (Lists/Delists), Token ticker, Listing type
  - **Token launch:** Subject, Event (TGE/Mainnet/Airdrop announced/Airdrop opens/Snapshot), optional Target price/FDV
  - **Governance:** Platform (Snapshot/Tally/On-chain), DAO, Proposal title or ID, Action (Passes/Fails/Executes)
  - **Protocol milestone:** Subject, Milestone type, Detail free-text
- Switching event types crossfades the dynamic fields (200ms fade-out, 200ms fade-in)

**Plain-language preview block** (Event/binary and Spread/vs modes):
- Label "your call reads as" above
- 2px left border accent in yellow-green
- Sentence dynamically generated from form fields, e.g. "Pendle TVL crosses $9B by end of this month. Settles automatically from DefiLlama on Nov 30 at 23:59 UTC."
- Resolution source pill below in monospace, e.g. `resolution · defillama.com/protocol/pendle`

**Deadline / Expiry** (varies by mode):
- Price target / Spread vs: EXPIRY slider, 1 day–90 days
- Event / binary: DEADLINE dropdown (End of week / End of month / End of quarter / 7d / 14d / 30d / 90d / Custom date…)

**RESOLUTION CRITERIA field** (optional or required per Section 4.7):
- Position: between Deadline and the Commit phase (Conviction/Stake)
- Label: "RESOLUTION CRITERIA" with optionality indicator
  - **Optional** pill for Price target, Spread/vs, TVL milestone, Volume/fees, On-chain metric
  - **Required** indicator (red asterisk + "≥50 chars" hint) for CEX listing, Token launch, Governance, Protocol milestone
- Textarea below, 4 rows visible
- Placeholder text changes per event type with example criteria (see Section 4.7 for examples)
- Character counter at bottom right: "0 / minimum 50" for required types; just "0 chars" for optional
- "VERIFIED CRITERIA" badge preview appears next to the caller handle in the live receipt preview when the textarea has ≥50 characters
- Markdown supported with small `?` tooltip
- The Publish button is disabled if criteria is required and the field has <50 characters

**Common fields (always visible, bottom of form):**
- CONVICTION: slider, 1%–100%, with current % and "impacts payout/penalty" on the right
- **Dynamic conviction warning**: appears below slider at conviction ≥85% — "⚡ High conviction · 2× payout if correct · 2× penalty if wrong" in amber
- **High-conviction floor warning** (if caller has <10 settled calls and conviction ≥85%): "⚡ High conviction unlocks after 10 settled calls. You have N. Your call will publish at 84% — the highest available to you."
- STAKE (USDC): numeric input + quick-stake buttons ($5 / $25 / $50 / $100, capped at $100 per call per Section 10 safety caps)
- **Inline minimum-stake validation**: if user enters <$5, red border + "Minimum stake is $5 USDC"
- **Inline duplicate detection** (above the conviction slider): if form fields hash to an existing active call, amber warning block appears: "⚠ A nearly identical call is already live. Quote it instead →"
- REASONING [optional] with `?` icon for markdown tooltip, textarea
- ADVANCED SETTINGS: collapsed disclosure with three toggles:
  - **Allow followers to ride the call** (default: ON)
  - **Open to 1v1 challenges** (default: ON) — when ON, adds ⚔ OPEN badge to the call card
  - **Auto-post receipt to socials on settle** (default: ON)

**Publish button**: full-width, filled, dynamic label "Publish call · stake $XXX"

**Two-step publish flow:**
1. Click "Publish call · stake $XX" — opens confirmation modal (does not directly submit)
2. Modal shows full-size receipt preview + breakdown table (stake, conviction, payout if correct, penalty if wrong, rep impact, $10 creation fee)
3. Two buttons: "Cancel" (returns to form with state preserved) and "Confirm — go on record" (filled accent yellow-green, triggers wallet transaction)

**Live receipt preview (right panel):**
- DRAFT / LIVE PREVIEW toggle
- you.eth avatar + rep + accuracy + streak
- THE CALL: large display rendering of the call statement with target highlighted in accent color
- "by [deadline] from now"
- 3-stat row: CONVICTION / STAKE / REASONING
- CONVICTION BAR with "permanent on settle" label
- Divider
- **POTENTIAL OUTCOME panel:**
  - "If correct" column: +$payout, +X rep
  - "If wrong" column: −$stake, −X rep
  - Numbers update live as form fields change
  - At conviction ≥85%, payout and penalty visibly double
- Footer: callitapp.xyz · chain · arbitrum

### 15.3 Receipt — Live

The page for an active call. Page path: `/call/[id]`

**Layout:**
- Top metadata: "← Back to feed" left, "0xa3f…91d2 · arbitrum · block N" right
- Hero card:
  - Caller header: avatar, handle, rep score with trend arrow, "X% acc · Y streak" (tight, two lines max), VERIFIED · X badge if linked, VERIFIED CRITERIA badge if criteria present, DUEL KING badge if applicable
  - Top right: Watch (muted) + Share (primary, icon in accent color)
  - "Preview share card ↗" link below the Watch/Share group
  - THE CALL · CATEGORY label
  - **Call statement as page hero** in massive display type, with the target value highlighted in accent yellow-green (e.g. ">5%")
  - 4-stat row: CURRENT SPREAD (with progress bar showing progress to target) / TIME LEFT / STAKE / CONVICTION
  - MARKET POSITIONING bar with "X% follow / Y% fade" labels and pool sizes below
  - 3 action buttons full-width: Follow this call (filled yellow-green) · Fade · bet against (red outline) · Challenge [handle] (orange outline)
  - REASONING FROM CALLER block with left accent border, regular weight
  - **RESOLUTION CRITERIA block** (if present) — collapsible, default collapsed with "view criteria ↓" link. When expanded, shows the full criteria text with left accent border, same styling as reasoning block.

**CALLER EXITED state (replaces hero treatment if applicable):**

If `call.callerExited == true`, the hero card displays differently:
- A prominent amber banner at the top of the card: "⚠ CALLER EXITED · veda exited this call [X days/hours] ago · $XX slashed"
- The original call statement still displays, but slightly dimmed
- The market positioning bar still shows live odds
- The action buttons remain functional (followers/faders can still exit, new participants can still follow/fade)
- A small explanation: "The caller is no longer in this market. The call still settles at expiry."

**Below hero:**
- **Live activity feed (left column):** real-time entries showing follow/fade activity, e.g. "veda followed with $50 · 32s ago" — each entry shows the user's avatar, handle, VERIFIED · X badge if applicable, and amount. Label "updating" in muted color at the top with a live pulse indicator.
- **Quote calls section (right column):** threaded reply-style cards showing quote-calls referencing this call, with FADING/FOLLOWING tag on each based on the quoter's position direction.

**Caller-specific actions (visible only to the caller themselves):**

If the viewer is the call's caller, a small additional control appears below the action buttons:

- **First 24h:** "Exit locked for [HH:MM:SS] more. Callers cannot exit during the first 24 hours."
- **After 24h:** "Exit your call · current penalty: [X%]" link in muted text. Clicking opens a confirmation modal showing:
  - Current penalty percentage and dollar amount
  - Amount returned to caller after slash
  - Reputation impact
  - Public broadcast warning: "Exiting will broadcast to all followers and faders. Your reputation will be slashed by [X] points."
  - Two buttons: "Cancel" and "Confirm exit"

**Position-holder actions (visible to followers/faders):**

If the viewer has a position on this call, a small additional control appears below the action buttons:

- **First 4h after entry:** "Exit locked for [HH:MM:SS] more. New positions must wait 4 hours before exit."
- **After 4h:** "Exit your position · 10% penalty" link in muted text. Clicking opens a confirmation modal showing the penalty math and a confirm button.

### 15.4 Profile

The user reputation page. Page path: `/profile/[address]`

**Layout:**
- Top: avatar + handle + verified badges (VERIFIED · ARBITRUM, plus VERIFIED · X and/or VERIFIED · FC if socials linked) + TOP X% GLOBAL in accent + wallet address + metadata (joined date, X calls, Y duels)
- Right of header: Share profile + settings gear

**Connect socials card (for the viewer's own profile only, if socials are not yet linked):**
- A subtle CTA card appears between the header and the Global Reputation card
- Copy: "Add credibility — connect Twitter or Farcaster"
- Two buttons: "Connect Twitter" + "Connect Farcaster"
- Dismissible — closing it hides the card but the option remains available in Settings
- Disappears entirely once both socials are connected, or after dismissal

**Global Reputation hero card:**
- Left: rep score (1,428) in massive Syne, +84 7d trend in green, rank text below
- Right: 30D TRAJECTORY line chart with start label ("1344 — 30d ago") and end label ("now — 1428") in muted text
- Footer of card: "14 settled · 9 wins · 5 misses · 64% acc"

**Tabs:** Overview / Calls / Duels

**Overview tab:**
- 5-stat row: ACCURACY (with "global avg · 51%" benchmark) / CALIBRATION (with "1.0 = perfect" benchmark) / ROI / CONTRARIAN HITS / STREAK
- CATEGORY REPUTATION grid (v1 ships with 3 categories per §7.5):
  - Single row of 3 category cards, equal width, the strongest highlighted in accent yellow-green ("strongest: Majors" label right of section header)
  - Cards follow the §14.6 neobrutalist treatment: 3px subtle border, 4px accent corner brackets on the strongest, 0px corner radius
  - In v2 when categories expand back toward 8, the grid switches to a 2-row layout (4 strongest top, 4 weaker bottom at ~60% height)
- Recent calls list (left) with filter chips (All / Live / Called / Wrong / Contrarian)
- Most followed by (right): list of top followers with avatars and rep scores
- Notable receipts (right, below Most followed by): trophy cards with outcome label as hero (CONTRARIAN HIT in accent yellow-green, CALLED IT in green), call statement, rep delta. Cards have corner brackets.

**Settings (accessible via gear icon top right):**
- Edit display handle (overrides handle priority rules)
- Connect / disconnect Twitter
- Connect / disconnect Farcaster
- Export embedded wallet (for users who signed in via Google/Twitter and want to migrate to a self-custodial wallet)
- Notification preferences (post-MVP)

### 15.5 Duel

The 1v1 challenge page. Page path: `/duel/[id]`

**Layout:**
- Top: "← Back" left, "duel #d/041 · arbitrum · LOCKED · 4d 06h" right (LOCKED in muted accent yellow-green at 80% opacity)
- Centered hero block:
  - "THE MARKET" label
  - "ARB / OP" in massive display type (the "/" is a design element)
  - Question line below: "Will ARB outperform OP by more than +5% in the next 7 days?"
  - 3-stat row: LIVE SPREAD / POT ($1,500 · winner takes all · ±20 rep) / SETTLES IN
- Duel card (two-column):
  - Left (caller): CALLER label, avatar, handle in yellow-green, POSITION box with bet statement
  - Right (challenger): CHALLENGER label, avatar, handle in orange, POSITION box with bet statement
  - Centered VS divider
  - Stat rows below — **parallel order on both sides**: REP / ACCURACY / IN CATEGORY (mirrored alignment but same data order)
  - STREAK row below: number + fire emoji (emoji only if streak ≥ 3)
  - MARKET CONSENSUS · LIVE bar with "X% FAVOR CALLER" / "Y% FAVOR CHALLENGER" labels (yellow-green / orange split)
- Below duel card:
  - Left: "Riding jaxon.eth" section with list of bettors and amounts
  - Right: "Riding degen_oracle" section with list of bettors and amounts
- Bottom CTAs: "Side with [caller]" (filled yellow-green) · "Side with [challenger]" (orange outline)

### 15.6 Leaderboard ("The Tape · Top of book")

The reputation rankings page. Page path: `/leaderboard`

**Layout:**
- Title: "The Tape · Top of book"
- Subtitle: "Reputation is a function of accuracy × volume × calibration. Easy to climb. Easy to fall."
- 7d / 30d / All-time toggle top right

**#1 Hero card:**
- Avatar + handle
- RANK 01 badge + category specialist tag (e.g. MAJORS SPECIALIST) + streak tag (9-CALL STREAK)
- Quote line: "Be right in public" · top of the tape since week X of 'YY
- GLOBAL REP label + massive 4-digit score + "+124 this 7d" delta
- **Massive faded "01" watermark** behind the score (Syne, 200–240px, accent yellow-green at ~8% opacity)
- 5-stat row: ACCURACY / CALLS / CALIBRATION / ROI / TRAJECTORY (mini sparkline)

**Category filter chips** below hero (v1, 3 categories per §7.5): `All categories` / `Majors` / `DeFi` / `Other`

**Leaderboard table:**
- Columns: # / CALLER (avatar + handle + call count) / REP / ACC / BEST (category) / Δ 7D (sparkline with delta number anchored to right end)
- **Podium treatment for ranks 02 and 03:**
  - Slightly taller row height
  - Slightly lifted background (`#13131D`)
  - Rank number larger and in accent yellow-green at 60% opacity
  - Small silver/bronze pill next to the caller's name ("#2" silver, "#3" bronze)
- **Viewer's own row (you.eth)** has elevated background `#1A1A24` plus the yellow left border accent — findable in a fast scan
- Rank 04 onwards: standard table treatment

**Bottom metadata:** "showing 1-10 of X,XXX callers · all stats on-chain · indexed every block"

**Category filter chips (v1 with 3 categories):** All categories / Majors / DeFi / Other. The 8-category list shown in earlier mock-ups was reduced to 3 per §7.5 — at hackathon volume eight categories were statistical noise. v2 expands by appending enum values, not renumbering.

### 15.7 Settled Receipt Page (`/call/[id]` when `status == Settled` or `Disputed`)

**The single most important page in the product. The share moment. Neobrutalist treatment is most pronounced here.**

**Page path:** `/call/[id]` — same URL as the live receipt; the page renders differently based on `call.status`.

**Layout:**

- Top metadata bar: "← BACK TO TAPE" left, "arb · block N · view on arbiscan ↗" right, in JetBrains Mono 12px muted
- Page frame: 3px solid `#2E2E42` border, 4px accent yellow-green corner brackets top-left + bottom-right
- Caller header (sticky on scroll): avatar (40px circle, 2px border `#E8F542`) + handle in Space Grotesk 18px medium + rep score with delta + VERIFIED badges + DUEL KING badge if applicable. **Address never appears on the page** (per item 80 — internal Privy address is not surfaced for share moments)
- Top-right of caller header: Watch button (muted outline) and Share button (filled accent `#E8F542` on black text, 3px black border, hard offset shadow `4px 4px 0 #09090E`)
- "Preview share card ↗" small link below the Watch/Share group

**Call statement block:**
- Label row: `THE CALL · [CATEGORY]` in 11px tracked-out (`0.12em`) Space Grotesk uppercase
- Call statement in **Syne 48px** with the target value highlighted in accent yellow-green (e.g. ">5%" gets the accent color, the rest in primary text)
- Underneath in muted slate: "settled [N hours/days] ago · settles automatically from [oracle source link]"

**Outcome block (the visual hero):**

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║                    CALLED  IT                                ║   ← 96px Syne
║                                                              ║      green (#4ADE80)
║                    by veda · +47 rep                         ║      tracked-out 0.05em
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
   ↑ 3px solid #4ADE80 border, hard offset shadow 4px 4px 0 #4ADE80
     on near-black bg #111118
```

**Outcome word variants (all 96px Syne, all 3px-bordered with matching hard offset shadow):**
- `CALLED IT` — `#4ADE80` green
- `LOUD AND WRONG` — `#F87171` red
- `CONTRARIAN HIT` — `#E8F542` accent yellow-green + small "CONTRARIAN" lozenge top-right of the block
- `COLD CALL` — muted slate `#94A3B8` (deliberately less celebratory — timid call was right but earned little)
- `FADED CORRECTLY` — `#E8F542` accent + small "FADER WIN" lozenge top-right (rendered when viewer is a winning fader, not the caller)

**Critical readability rule:** the outcome word must be legible at thumbnail size. QA gate: zoom the page to 200px viewport width — if the outcome word is unreadable, the design fails. This applies to both the page and the OG image (§16.3).

**Stat row beneath outcome:**

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ FINAL VALUE  │ TARGET       │ CONVICTION   │ P&L          │
│ $9.34B       │ $9.00B       │ 82%          │ +$87.40      │
└──────────────┴──────────────┴──────────────┴──────────────┘
   ↑ 2px subtle border, internal dividers visible, no rounding
```

Each cell: label in 11px tracked-out, value in JetBrains Mono 18px for numerics. P&L color: green if positive, red if negative, muted if zero.

**Settlement provenance line (below stat row):**

`SETTLED FROM defillama.com/protocol/pendle at 2026-05-31 23:59 UTC · view oracle proof ↗`

In JetBrains Mono 13px muted. The "view oracle proof" link opens a modal showing the on-chain transaction hash, the oracle source, the raw data point, and the signed relayer attestation (where applicable). This makes settlement auditable, not just claimed.

**Action row:**

- Primary: `[ SHARE THE RECEIPT → ]` filled accent yellow-green, 3px black border, hard shadow
- Secondary: `[ VIEW ALL CALLS BY veda ]` outline only, 2px border, no shadow
- Both stretch full-width on mobile (375px breakpoint), side-by-side on desktop

**Reasoning block (below action row):**

Carryover from the live receipt — left accent border (4px `#E8F542`), regular Space Grotesk 14px. If the call had a Resolution Criteria field per §4.7, render that below the reasoning in a collapsible block with `view criteria ↓` toggle, same styling.

**FINAL POSITIONS block (with corner brackets):**

```
┌─[bracket]──────────────────────────────────────[bracket]┐
│ FINAL POSITIONS                                          │
│                                                          │
│  Followers (14)              Faders (23)                 │
│   ▌ veda    $50  → +$23.40   ▌ degen   $80  → -$80      │
│   ▌ cobie   $25  → +$11.70   ▌ jaxon   $50  → -$50      │
│   ▌ ...                       ▌ ...                      │
│                                                          │
│  Top follower: cobie (+$11.70)                           │
│  Top fader: degen (-$80) — biggest loss                  │
└──────────────────────────────────────────────────────────┘
```

4px brackets in accent yellow-green at the four implied corners. Each row shows handle + initial position + P&L. Sorted by P&L descending. Limited to 20 rows per side with "view all" link if more.

**Caller-Exited variant** (if `status == CallerExited` then `Settled`):

Above the outcome block, render an amber banner per §15.3 ("⚠ CALLER EXITED · veda exited this call [time] before settlement · $XX slashed") — but with neobrutalist treatment: 3px `#FB923C` border, hard offset shadow `4px 4px 0 #FB923C`, no rounding. The outcome block still renders the eventual outcome (the call continued for everyone else), but the caller's handle in the outcome subline is greyed to 40% opacity.

**Disputed variant** (if `status == Disputed`):

Outcome block is replaced by a "PENDING DISPUTE" block with `#FB923C` amber styling, 3px border, hard shadow. Body text below explains the dispute status: who filed it, when, evidence link, current owner-review state, and SLA reminder ("Resolution within 24h of dispute opening").

**Stamp animation on first paint:** when the user lands on a freshly-settled receipt, the outcome block "stamps in" — scale `1.2 → 1.0` with brief overshoot to `0.98 → 1.0`, plus the shadow expands from `0 0 0 transparent` to `4px 4px 0 [color]`, total duration 300ms ease-out. Rep delta number counts up in Syne with a green/red pulse per §17.2.

### 15.8 Sign-in Screen (`/signin`)

The first contact with the brand. Per the wallet decision (§9), three sign-in paths land in the same authenticated state.

**Layout:**

- Full-page neobrutalist frame: 3px `#2E2E42` border, 4px accent yellow-green corner brackets at all four corners of the viewport
- Centered column, max-width 480px
- Top: `CALL IT` wordmark in Syne 64px, accent yellow-green. Tagline below: "Be right in public." in Space Grotesk 24px muted

**Three CTAs, vertical stack:**

- **Primary — Connect Wallet** (visually loudest, signals crypto-native is the primary audience):
  - Full-width button, 3px solid `#E8F542` accent border, accent fill, black text in Space Grotesk 16px medium
  - Hard offset shadow `4px 4px 0 #E8F542` on hover
  - Subtitle line in 12px muted JetBrains Mono: `metamask · rabby · walletconnect · coinbase wallet`
  - Triggers SIWE; no Privy wallet created for this path
- Divider: `──── OR ────` in 12px tracked-out muted slate, 24px vertical padding
- **Sign in with Google** (2px solid white border, no fill, white text in Space Grotesk 16px medium)
  - Hard offset shadow `4px 4px 0 #F1F5F9` on hover
  - Triggers Privy OAuth flow → internal wallet
- **Sign in with Twitter** (same styling as Google)
  - Triggers Privy OAuth → internal wallet + Twitter pre-linked

**Disclaimer copy** (below CTAs, in 12px muted slate, max-width matched to button width):

> "By signing in you agree that your calls become permanent public record. No edits. No deletes. Wins and losses both count."

The copy is part of the brand — no legalese softening, no soft welcome.

**Custody disclosure microcopy** (12px muted, below the disclaimer, only shown when OAuth path is hovered or pre-selected):

> "OAuth wallets are custodied by Privy until you export. You can export at any time from Settings."

This satisfies the §10.6 disclosure obligation without making it the headline.

### 15.9 Onboarding Flow (`/onboarding`)

Triggered automatically on first successful sign-in. Four screens, each full-height, with a step indicator at top. Each screen is a single neobrutalist card with 3px `#2E2E42` border and 4px accent corner brackets at top-left + bottom-right.

**Step indicator (top of every screen):** `STEP N OF 4` in 11px tracked-out accent yellow-green, with three filled and one outlined accent squares in a row showing progress.

**Screen 1 — Handle:**
- Headline: "HOW DO WE CALL YOU?" in Syne 32px
- Input: handle pre-filled from ENS (if Connect Wallet path) or Twitter handle (if Twitter OAuth path) or "you.eth" placeholder. 3px subtle border, accent yellow-green left border when focused, no rounding. JetBrains Mono 18px input text.
- Subcopy: "Used on every call you publish. You can change it later in settings."
- Primary CTA: `CONTINUE →` filled accent

**Screen 2 — Connect Socials (skippable):**
- Headline: "ADD CREDIBILITY (OPTIONAL)" in Syne 32px
- Subcopy: "Connect socials so other users can verify it's actually you."
- Two stacked buttons:
  - `CONNECT TWITTER →` (skipped if user signed in via Twitter — show "✓ Twitter linked" disabled state instead)
  - `CONNECT FARCASTER →`
- Skip link: `SKIP — DO THIS LATER →` (full-width tertiary button, 2px subtle border, no fill)

**Screen 3 — Follow-graph opt-in (only if Twitter or Farcaster connected):**
- Headline: "SHOW CALLS FROM PEOPLE YOU FOLLOW?"
- Subcopy: "We'll surface calls from accounts you follow on [X / Farcaster] that have Call It profiles. Makes your feed relevant from minute one."
- Two side-by-side buttons: `YES, SHOW ME →` (filled accent) and `SKIP` (outline)
- Privacy footnote in 11px muted: "Your follow list is read-only; we never post on your behalf. Visible only to you in Call It."

**Screen 4 — Tagline (commitment moment):**
- Headline: "ONE LAST THING." in Syne 32px
- Center block in Syne 28px tracked-out: "EVERY CALL IS PERMANENT. WINS AND LOSSES. WE DON'T SUGAR-COAT."
- Primary CTA: `GO TO THE TAPE →` filled accent yellow-green, full width
- This screen sets the product's voice for everything that follows. Tone over softness.

### 15.10 Quote Call Composer (`/new?quote=[parentCallId]`)

A modified `/new` page with parent-call context displayed above the standard form.

**Layout:**

Same frame, header, and right-panel live preview as §15.2 New Call. Inserted at the top of the form column, above the market-type segmented buttons:

**Parent context card:**

```
┌─[2px border #2E2E42, bg #1A1A24 elevated]──────────────────┐
│ QUOTING                                                     │
│                                                             │
│  @veda · rep 1,428 · VERIFIED · X                           │
│                                                             │
│  "Pendle TVL crosses $9B by end of this month"              │  ← Italic Syne 20px
│                                                             │     primary text
│  STAKE $25 · CONVICTION 82% · FOLLOW $340 · FADE $520       │  ← 11px tracked-out
│  Settles in 14d 6h · view original ↗                        │     monospace numbers
└─────────────────────────────────────────────────────────────┘
```

No corner brackets on the parent card — it's deliberately a second-class visual element so the user's own call (in the live preview) remains the hero.

**"YOUR THESIS" textarea** (positioned ABOVE the market-type buttons — forces the user to articulate why they're quoting before they shape their counter-call):

- Label: `YOUR THESIS` in 11px tracked-out accent yellow-green
- Textarea: 5 rows minimum, 3px subtle border, accent left border on focus, Space Grotesk 14px
- Placeholder: "I disagree because..." or "I'm refining this with..." — copy varies based on whether the user's call agrees or disagrees with the parent (detected once the user picks direction)
- Character soft limit: 500 chars (no hard limit; just a counter ticking down)

**Below YOUR THESIS, render the standard New Call form** exactly as §15.2 — same fields, same validation, same right-panel live preview. The only difference: a small `QUOTING @veda` chip appears in the top-right of the live preview card to indicate parent context.

**On submit:**

- Contract sets `parent_call_id = [parentCallId]` on the new call
- Frontend success screen shows a "thread preview" — parent + your quote — and a Share button that generates a thread-style OG card (handled by the OG service per §16; not in v1 scope for explicit thread image rendering — v1 ships with the parent + quote as separate OG cards stacked in a Twitter thread when the user posts)

Quote calls do NOT affect the parent call's pool or settlement (per §5.4) — confirmed and surfaced in a small confirmation line above the Publish button: "Your call is independent of the call you're quoting."

---

## 15A. Shared UI Components

These two components are referenced across every page and are defined once here for consistency.

### 15A.1 Loading Skeleton

A single component reused everywhere data is being fetched.

**Visual rules:**

- Block fill color: `#1A1A24` (matches the tertiary background)
- Block shape matches the layout it's replacing (e.g. a card skeleton has the same outer dimensions as the rendered card)
- Card outer border is the same 2px `#1E1E2E` as the rendered card — when content loads it slots into the exact same frame, no layout shift
- Animation: subtle horizontal shimmer from `#1A1A24` → `#1E1E2E` → `#1A1A24`, 1500ms loop, very low contrast. **Neobrutalist means even loading states are quiet, not flashy.** No pulse, no spin.
- NO corner brackets on loading states — brackets reserved for fully rendered weight-carrying blocks

**Skeleton variants needed:**

| Variant | Used on |
|---|---|
| `<CallCardSkeleton />` | Feed (`/`), Profile recent calls list |
| `<ReceiptHeroSkeleton />` | `/call/[id]` (both live and settled) |
| `<ProfileHeaderSkeleton />` | `/profile/[address]` |
| `<LeaderboardRowSkeleton />` | `/leaderboard` table rows |
| `<DuelCardSkeleton />` | `/duel/[id]` |
| `<StatRowSkeleton />` | Any 4-stat or 5-stat row (replaces inline) |

All variants share the shimmer rules above; only block dimensions vary.

### 15A.2 Error / Status Toast

Single component, position fixed top-right of the viewport, stacks vertically with 8px gap.

**Visual rules:**

- 3px solid border in the status color (red `#F87171`, amber `#FB923C`, green `#4ADE80`)
- Hard offset shadow `4px 4px 0 [status color]`, no blur, no rounding
- Background: `#111118` (cards bg) — solid, no opacity
- 4px corner brackets at top-left + bottom-right in the status color
- Width: 360px desktop, full-width minus 24px gutter on mobile
- Padding: 20px

**Content rules:**

- Title row: status icon (✓ for success, ⚠ for warning, ✗ for error) + uppercase title in 14px Space Grotesk tracked-out
- Body: 14px Space Grotesk regular, max 3 lines (truncate with "View details →" linking to a modal for longer messages)
- Action buttons (optional): use the standard button style (border, no fill, hard shadow on hover)

**Behavior rules:**

- Auto-dismiss: success after 4s, warning after 8s, error with no actions after 8s, error with actions does NOT auto-dismiss (user must dismiss explicitly)
- Countdown indicator: a 1px line along the bottom edge of the toast in the status color, draining left-to-right to show remaining time
- Stacking: max 3 visible at once; additional toasts queue and appear as space frees
- Dedupe: identical title + body within 2s shows a count badge ("×2", "×3") on the original instead of stacking a duplicate
- Entry: slide in from the right `translateX(100%) → 0` over 200ms ease-out
- Exit: fade out `opacity 1 → 0` over 150ms

**Status mapping:**

| Status | Border + shadow color | Used for |
|---|---|---|
| Success | `#4ADE80` | "Call published", "Position exited", "Payout claimed" |
| Warning | `#FB923C` | "Settlement delayed (oracle waiting)", "Caller exited a call you follow" |
| Error | `#F87171` | Transaction reverts, USDC allowance issues, network errors |

---

## 16. Receipt Card (Share Asset)

The receipt card is the canonical share artifact. When a call is shared to X, Farcaster, Telegram, or anywhere else, this is the image that travels.

### 16.1 Specifications

- **Dimensions:** 1200 × 630px (OpenGraph standard)
- **Format:** PNG, generated off-chain by a Node.js service using Satori or @vercel/og at the moment of sharing
- **Generation:** Image is cached on a CDN, regenerated when the call's state changes (new follow/fade activity, settlement)

### 16.2 Live State Card

For an active call:

- Top left: Call It wordmark + callitapp.xyz (small monospace)
- Top right: Arbitrum logo (small)
- Center hero: call statement in large display type (truncated if necessary)
- Below statement: "by [caller handle] · X% conviction · stake $XXX"
- Live progress bar: follow % / fade % split
- Bottom: "Time left: Xd Yh" in monospace
- Subtle corner bracket motif in all four corners

### 16.3 Settled State Card

This is the share moment. The outcome word is the hero.

- Top left: Call It wordmark + callitapp.xyz
- Top right: Arbitrum logo
- **Center hero: outcome word** in massive Syne display type
  - "CALLED IT" — green
  - "LOUD AND WRONG" — red
  - "CONTRARIAN HIT" — accent yellow-green
  - "COLD CALL" — muted (timid call that was right but earned little)
  - "FADED CORRECTLY" — accent yellow-green (for successful faders)
- Below outcome: original call statement (smaller, primary text)
- Stats row: P&L · Reputation change · Final price/outcome · Conviction
- Bottom: caller avatar + handle + current global rep score
- Corner bracket motif

**The outcome word must be readable at thumbnail size.** This is what travels.

### 16.4 Duel Settled Card

A dedicated share card variant for resolved 1v1 challenges. Engineered for "I beat them" virality. Visually distinct from regular settled receipts.

**Layout:**

- Top left: Call It wordmark + callitapp.xyz
- Top right: Arbitrum logo
- **Two-column hero layout:**
  - Left: winner's avatar (large, ~180px circle) + handle below in large display type
  - Right: loser's avatar (slightly smaller, dimmed to 40% opacity) + handle below, slightly muted
  - Between them: a vertical divider line and the outcome word — **"WINS"** in large Syne next to the winner's column, with the market statement underneath in smaller type
- **Pot information** prominently displayed: "Pot: $X,XXX · winner takes all"
- **Reputation deltas** as a paired stat:
  - Winner: "+XX rep" in green
  - Loser: "-XX rep" in red
- **Market and target** beneath the hero: small text identifying what was actually bet on
- Bottom-left: Call It branding; Bottom-right: Arbitrum branding
- Corner bracket motif on all four corners

This card's visual story is unmistakable: two people went head to head, one won, the other lost in public. Designed to be screenshotted and posted to X with maximum shareable drama.

### 16.5 Caller Exited Card

A third share card variant for the rare event of a caller exiting their own call. Naturally dramatic and shareable.

**Layout:**

- Top left: Call It wordmark + callitapp.xyz
- Top right: Arbitrum logo
- **Center hero:** "CALLER EXITED" in massive amber display type (`#FB923C`)
- **Below the hero:** the caller's avatar (slightly dimmed) and handle, with the original call statement underneath
- Stats row: time elapsed before exit · stake slashed · reputation impact
- Bottom: a small note — "Call continues for followers and faders. Settles at [expiry]."
- Corner bracket motif

This card auto-generates when a `CallerExited` event fires and is the asset attached to the broadcast in the global activity feed.

### 16.6 Fallback Card ("A Call Was Made")

When a user shares a call moments after creation — before the OG service has finished rendering the real receipt image — the share preview cannot 404. The fallback card renders deterministically from a static template with no per-call data beyond the handle.

**When the fallback serves:**

- Real receipt URL returns 404 (cache not yet warm) — primary use case
- Settled outcome image hasn't yet regenerated post-settlement (transient)
- OG service is fully down — CDN serves the fallback with a 24h cache

**Layout:**

- Frame: 3px solid `#E8F542` accent border, 4px accent yellow-green corner brackets at all four corners (more prominent than other share cards — signals "this is intentional, not broken")
- Background: solid `#09090E` near-black; no images, no gradients, no external fonts beyond what ships in the OG bundle
- Top-left: `CALL IT` wordmark in Syne 48px accent yellow-green
- Top-right: `arbitrum mainnet` in JetBrains Mono 12px muted
- Center hero (asymmetric — sits slightly left of center, ~40% from left edge):
  - "A CALL WAS MADE" in Syne 64px, muted white `#F1F5F9`
  - Below: "by @[handle]" in Space Grotesk 28px muted slate
- Below hero, in muted slate Space Grotesk 18px:
  - "The receipt is being prepared."
  - "Tap to view live."
- Bottom-left: `callitapp.xyz · Be right in public.` in 14px muted
- Bottom-right: Arbitrum logo small

**Rendering rules:**

- Generated by the same Node.js/Satori OG service as the other variants — using a stripped template that pulls only `[handle]` from the URL. Renders in <100ms.
- Cached on CDN for 60 seconds (short — once the real card warms, subsequent fetches should pick up the real URL)
- After the real receipt image generates (typically 2-5s after call creation), the fallback URL is replaced by the real URL on subsequent share-link clicks

**Brand integrity:** the phrase "A call was made" is intentional — portentous, slightly cocky, on-brand. The fallback never reads as a placeholder; it reads as a teaser. The user who shares a too-fresh call gets a deliberately styled "receipt is coming" card, not a broken preview.

---

## 17. Animation & Micro-interactions

Every animation is intentional. Defaults are explicitly avoided.

### 17.1 Principles

- Duration: 150–300ms for micro-interactions, 400–600ms for transitions
- Easing: ease-out for entry, ease-in for exit, spring for weight
- Animations respond to data, not decorate

### 17.2 Specific Animations

- **Feed load:** Cards enter with `translateY: 8px → 0` + `opacity: 0 → 1`, staggered 60ms between cards
- **Follow/Fade button press:** Compress to `scale: 0.97` then spring back; count increments with number flip
- **Conviction slider:** Fill color interpolates muted → accent as conviction increases; number ticks in real time
- **Conviction warning (≥85%):** Amber callout fades in with slight upward motion; fades out on drop below threshold
- **POTENTIAL OUTCOME numbers:** Tick smoothly as stake/conviction change
- **Receipt settle (outcome reveal):** Outcome word reveals with a "stamp" animation — scale from 1.2 → 1.0 with brief overshoot, plus a quick color flash. Not a fade. A reveal that feels earned.
- **Reputation change:** Number counts up or down in Syne; brief green pulse for gains, red pulse for losses
- **Live odds bar:** Slides smoothly as new positions come in; never jumps
- **Page transitions:** Horizontal slide for tab switches; vertical slide-up for modals; no fade-to-black

---

## 18. Distribution & Virality

### 18.1 Public Calls by Default

Every new call publishes to the global feed immediately. No league selection at creation. No private mode. The product is built around public commitment.

Leagues (curated groups, e.g. "Arbitrum DeFi Season") are a post-hackathon feature.

### 18.2 Off-chain Receipt Images

Receipt cards are generated off-chain by a Node.js service. They are:
- Faster to render than fully onchain SVG generation
- Easier to iterate on visually
- Cached on CDN for performance
- Referenced by the onchain call via a hash for verification

**Receipts are not NFTs in v1.** They are off-chain artifacts referenced onchain.

### 18.3 Farcaster Frames (Final Phase)

If time permits in the build, Farcaster Frames are added as the final phase.

- Each receipt card becomes an interactive Frame when shared on Farcaster
- Frame buttons enable Follow / Fade / Challenge directly from a Farcaster post — no app open required
- Implementation: OpenGraph meta tags + a Frame server endpoint that handles button clicks and returns next-frame state
- Critical: this is added LAST. The product ships and works without it. Frames are an enhancement.

### 18.4 Go-to-Market: Protocol-Sponsored Campaigns

The growth mechanic is **protocol-sponsored seasons**. An Arbitrum-native protocol (GMX, Pendle, Camelot, etc.) sponsors a 7-day prediction season around their own metrics:

- Protocol puts up a prize pool
- Users make calls within the season's scope (e.g. "GMX weekly fees beat last week")
- Top callers split the prize pool based on accuracy
- The protocol gets community engagement and attention
- Call It gets seeded calls, real stakes, and an audience on day one

This solves the cold-start problem and creates a repeatable revenue model.

For the hackathon demo: seed 10–15 calls manually before demonstration using two pre-funded wallets, and pitch protocol-sponsored campaigns as the go-to-market.

---

## 19. Build Order

The build order is optimized for "always have something demoable." If time runs out, the most recently completed step is still a working product.

**All contract deployments stage on Arbitrum Sepolia first; mainnet deploy is gated by §19.10.**

### Phase 1 — Core contracts + auth + frontend skeleton

- CallRegistry (deploy to Sepolia)
- ProfileRegistry (deploy to Sepolia, basic — includes SocialIdentity storage)
- USDC integration (Sepolia test USDC)
- Frontend skeleton: routing, navigation, dark theme tokens with §14.6 neobrutalist treatment, basic feed rendering from CallRegistry events, shared loading skeleton + error toast (§15A) wired up
- **Privy integration**: three sign-in paths (Connect Wallet, Sign in with Google, Sign in with Twitter) plus the §9.2 internal wallet flows (funding via Coinbase Onramp + direct USDC, paymaster gas sponsorship per §10.7, wallet export, multi-auth linking)
  - PrivyProvider wraps the React app
  - Embedded wallet auto-creation for OAuth paths
  - SIWE for wallet connect path
  - **Phase-1 scope inflated significantly by the §9 wallet architecture** — budget for Coinbase Onramp integration, paymaster wiring, withdrawal flow, address-book + SIWE re-sign at withdrawal, and wallet-export UX. None of these are trivial; collectively they are ~2-3 days of focused work.
- Sign-in screen (§15.8) + Onboarding flow (§15.9) implementation
- Create Call form (§15.2) publishing to CallRegistry

### Phase 1.5 — Social linking (lightweight, parallel)

- Backend relayer endpoint for verifying OAuth proofs and posting social links onchain
- Twitter OAuth verification flow → ProfileRegistry.linkTwitter()
- Farcaster Auth Kit integration → ProfileRegistry.linkFarcaster()
- "Connect socials" CTA card on profile setup screen (now part of Onboarding §15.9 Screen 2)
- VERIFIED · X / VERIFIED · FC badges rendering wherever handles appear (feed, profile, receipts, leaderboard, duel page)
- Multi-auth-linking security additions: new-auth-link cooldown (24h before withdrawal authorization), per-method permission scoping, email + in-app notification on link, removal flow that requires existing-method re-auth

This phase can run in parallel with Phase 2.

### Phase 2 — FollowFadeMarket AMM

- Deploy FollowFadeMarket (single-contract sub-state per §11.2 lock) to Sepolia
- Frontend: Follow / Fade buttons on call cards execute real transactions
- **Slippage protection (`minSharesOut` param) wired into all follow/fade calls** — frontend computes expected shares + 1% tolerance and passes through
- **Post-expiry gate** verified: deposits past `call.expiry` revert `CallPastExpiry`
- TVL-cap aggregation across all open calls — boundary tested at $4,999.99 and $5,000.01
- Position exit flow (4h cooldown, 10% slash) implemented and tested
- Live pools visible on receipt page (live mode, §15.3)

### Phase 3 — ChallengeEscrow

- Deploy ChallengeEscrow to Sepolia
- Frontend: Challenge flow (propose, accept, refund)
- Self-challenge gate verified at contract level (not just UI)
- Caller's `openToChallenges` flag enforced at contract level
- Duel page rendering live from contract state

### Phase 4 — SettlementManager + Pyth integration

- Deploy SettlementManager to Sepolia
- Pyth feeds wired in for price calls — confidence threshold (§13.1) + tiered wait policy implemented
- Manual settlement trigger via cron-driven relayer (deployer-button UI as a hackathon backup)
- Settled receipt page (§15.7) renders with outcome word + stamp animation per §17.2
- Settlement idempotency, atomicity, and the `RepCalculated` / `RepCalculatedFallback` events verified

### Phase 5 — StylusScoreEngine (with hard cutoff)

- Write Rust scoring engine
- Deploy to Stylus (Sepolia first, then mainnet) behind transparent proxy per §10.8
- SettlementManager calls into it on settlement, wrapped in try/catch with Solidity baseline fallback per §11.6
- Reputation updates propagate to ProfileRegistry
- Profile page renders live rep data

**Stylus fallback cutoff (locked):** **48 hours before demo**, if the Rust + Stylus path is not working end-to-end on Sepolia, switch to the Solidity-baseline implementation in the same proxy slot. Pitch "Stylus in production roadmap" rather than holding the demo hostage.

### Phase 6 — Safety review + boundary testing (MOVED EARLIER)

This phase ran last in the original spec; moved here so safety is validated *before* the polish-only work and *before* mainnet promotion.

- Emergency pause buttons tested on every state-changing function
- TVL cap behavior tested at the boundary ($4,999 OK, $5,001 reverts)
- Max stake enforcement tested ($100 OK, $101 reverts; $5 minimum same)
- Min position enforcement tested ($1 OK, $0.99 reverts)
- All "Do not pause" withdraw/claim paths verified to work while paused
- Caller-exit lock verified (24h cannot exit; 24h+1s can exit; penalty math correct at all decay points)
- Position-exit cooldown verified (4h cannot exit; 4h+1s can exit; 10% slash math correct)
- Duplicate-hash detection verified for UTC-day-boundary edge cases per §6.2
- Slippage parameter verified to revert when AMM moves between quote and execution
- Settlement idempotency verified (calling `settle` twice reverts cleanly)
- Self-challenge gate verified (caller cannot challenge themselves)
- Reentrancy guard verified (USDC mock with callback attempts to re-enter — must revert)
- Stylus runtime fallback verified (deploy a deliberately reverting Stylus contract; verify Solidity baseline runs and `RepCalculatedFallback` fires)
- Owner-only functions verified (non-owner cannot pause, setTvlCap, setSettlementManager, setRelayer, forceSettle, resolveDispute)

### Phase 7 — Off-chain receipt card generation

- Node.js service generating OG images (Satori or @vercel/og)
- Hosted at `api.callitapp.xyz/og/[callId]`
- All five variants: Live (§16.2), Settled (§16.3), Duel Settled (§16.4), Caller Exited (§16.5), Fallback (§16.6)
- Cached on CDN with state-change invalidation; fallback ready to serve when real card not yet warm
- Linked from share buttons throughout the app
- Visual QA at thumbnail size (200px) for the outcome word per §15.7 critical rule

### Phase 8 — Farcaster Frames (if time permits)

- Frame server endpoint
- OpenGraph meta tags on receipt pages
- Tested in Warpcast

### Phase 9 — Mobile responsive pass

- Apply 375px breakpoint to Feed (§15.1), Receipt Live (§15.3), Profile (§15.4), Settled Receipt (§15.7), Sign-in (§15.8), Onboarding (§15.9), Leaderboard (§15.6)
- Mobile pattern: single-column layouts, full-width action buttons, collapsed left sidebar behind a hamburger
- Loading skeletons (§15A.1) already adapt via flex/responsive units; error toasts (§15A.2) switch to full-width minus 24px gutter
- Other pages (Duel §15.5, Quote composer §15.10, New Call §15.2) get desktop-only banners in v1: "Best viewed on desktop"

### 19.10 Sepolia Staging Gate (locked — must pass before mainnet deploy)

Before any contract is deployed to Arbitrum mainnet, the following gate must complete:

- **≥48 hours** of operation on Arbitrum Sepolia with:
  - ≥10 seeded calls covering each call type (Price target, Spread/vs, ≥3 event subtypes)
  - ≥30 follow/fade positions across those calls
  - ≥3 settled calls per call type — verify outcome words render correctly, payouts arrive correctly, rep updates correctly
  - ≥1 caller-exit triggered and broadcast verified
  - ≥1 challenge proposed-and-accepted cycle settled
  - ≥1 dispute raised and resolved (owner path)
  - Pyth confidence retry exercised manually (force a wide-confidence read and verify `SettlementDelayed` flow)
- All Phase 6 safety tests pass on Sepolia
- Post-deploy smoke test checklist (§19.11) defined and dry-run on Sepolia

The gate is non-optional. Real-money mainnet without Sepolia-tested contracts is a documented unacceptable risk per §10.

### 19.11 Post-Deploy Smoke Test Checklist (mainnet)

Immediately after mainnet deploy, run through this checklist before announcing public availability. Estimated 20 minutes if everything works.

- [ ] `pause()` and `unpause()` both execute from the owner wallet; `paused()` view reflects state correctly
- [ ] Attempt deposit from a normal user while paused — reverts with `Paused` error
- [ ] Attempt withdrawal while paused — **succeeds** (§10.3 carve-out)
- [ ] `setTvlCap(5000 * 1e6)` confirms cap; reading `tvlCap` returns expected value
- [ ] Attempt to deposit $99 USDC when current TVL is $4,901 — succeeds; balance = $5,000
- [ ] Attempt next $1 deposit — reverts with `TvlCapReached`
- [ ] Min-stake test: create call with $4 stake → reverts; with $5 → succeeds
- [ ] Max-stake test: create call with $101 stake → reverts; with $100 → succeeds
- [ ] All five oracle adapters return test data for a synthetic test call (Pyth on BTC, DefiLlama on a known TVL endpoint, Snapshot/Tally on a known proposal, CEX scrape on a known announcement, Alchemy on CryptoPunks floor)
- [ ] OG image renders for all 5 outcome words at thumbnail size (200px) — `CALLED IT`, `LOUD AND WRONG`, `CONTRARIAN HIT`, `COLD CALL`, `FADED CORRECTLY`
- [ ] All 3 sign-in paths complete to first authenticated session: Connect Wallet (SIWE), Sign in with Google (Privy OAuth → internal wallet), Sign in with Twitter (Privy OAuth + Twitter pre-linked)
- [ ] Funding flow completes: Coinbase Onramp → USDC delivered to internal wallet, AND direct USDC transfer from external wallet to internal wallet
- [ ] First sponsored transaction succeeds via paymaster; per-account cap counter increments
- [ ] Receipt-link share works on Twitter (verify OG card appears in Twitter Card Validator)
- [ ] `forceSettle` is **NOT** callable within the cooldown window (sanity check — should revert with `ForceSettleCooldownActive`)

If any item fails, pause the contracts immediately and investigate. Do not announce.

---

## 20. Open Gaps

The following are still NOT designed and remain open work for v1.1 — none are ship-blockers for the hackathon demo per the explicit v1 cuts below.

### 20.1 Notification System

The bell icon in the header has no defined notification flow. What triggers a notification (settled call, challenge proposed, challenge accepted, caller exited on a followed call, dispute opened, paymaster cap hit) and where they live (in-app dropdown? email digest? Telegram? Farcaster cast?). Out of scope for v1.

### 20.2 Search

The search bar in the header ("Search callers, calls, assets") has no defined behavior or result UI. Out of scope for v1; the leaderboard and feed surfaces are the primary discovery paths in v1.

### 20.3 Watch / Notify Flow

The Watch button on the receipt page has no defined notification delivery (email? Telegram? Farcaster? On-site only?). Out of scope for v1; the button is rendered but triggers an "in-app only" notification subscription that surfaces in the in-app notification dropdown when §20.1 ships.

### 20.4 Resolved Gaps (now in spec)

The following were open in the prior revision and are now designed:

- **Settled Receipt Page** → §15.7
- **Sign-in Screen** → §15.8
- **Onboarding Flow** → §15.9
- **Quote Call Composer** → §15.10
- **Empty States** → covered by §15A loading-skeleton and per-page copy already in §15.1 (feed), §15.4 (profile)
- **Error States** → §15A.2 error toast component handles all transaction reverts, stale price feeds, TVL cap reached, max stake exceeded, wallet not connected, etc.; each error has a named error type in §12 and the toast surfaces it with the right copy
- **Mobile Responsive** → Phase 9 in §19 commits to a 375px breakpoint for the 7 critical pages; remaining pages get a "best viewed on desktop" banner
- **Dispute Resolution UI** → out of v1 scope per item 68 in the CEO review decisions log; disputes in v1 are owner-resolved via direct contract call. Reviewer UI moves to v1.1 alongside the rest of the §20.1 notification system.

---

## Appendix A — Locked Decisions Log

Every product decision made in the design conversation, locked for build.

| Decision | Value |
|---|---|
| Network | Arbitrum mainnet |
| Funds | Real USDC |
| Max stake per call | $100 USDC (hardcoded) |
| TVL cap | $5,000 USDC (adjustable via setTvlCap) |
| Emergency pause | Yes, on all state-changing functions; withdraw/claim exempt |
| Protocol fee | 1.0% (treasury) |
| Caller creator fee | 0.4% on settled volume (Model B for exited callers — pre-exit volume only) |
| LP fees | 0.3% (stays in winning pool) |
| Market creation fee | $10 USDC ($5 treasury / $5 virtual fade liquidity seed) |
| Total settlement extraction | 1.7% |
| Virtual fade liquidity base | $2 (accounting only, dissolves at settlement) |
| Virtual fade liquidity with creation fee | $7 ($2 base + $5 from creation fee) |
| Cancellation mechanic | None — no path to void a call after publish |
| Caller exit lock | 24 hours after creation, no exit possible |
| Caller exit penalty | 50% → 15% time-decay formula (15% + 35% × time_remaining_ratio) |
| Caller exit floor | 15% even on last-minute exits |
| Caller exit slash distribution | 50% to follow pool / 40% to fade pool / 10% to treasury |
| Caller exit reputation slash | -45 rep day 1 → -10 rep floor (decay) |
| Caller exit broadcast | Public event to feed + notification to all participants |
| Follower/fader exit cooldown | 4 hours after entering position |
| Follower/fader exit penalty | Flat 10% |
| Follower/fader exit slash distribution | 50% opposite side / 40% same side / 10% treasury |
| Cold-start reputation adjustment | 25% of normal rep gain for correct calls with no real fade activity |
| Pricing model | Parimutuel AMM (constant-product invariant) |
| Position tradeability | Not tradeable mid-call; exits possible with penalty (cooldown + slash) |
| Bonding curve | Not used (avoids growth-speculation distortion of probability signal) |
| Reputation starting score | 100 |
| Reputation floor | 0 |
| Min stake per call (anti-spam) | $5 USDC (hardcoded MIN_STAKE) |
| Max stake per call (mainnet safety) | $100 USDC (hardcoded MAX_STAKE) |
| Duplicate detection scope | All open calls (any caller); hash of market_type + subject + metric + target + deadline_day |
| Duplicate detection clearing | Hash cleared on settlement, enabling reuse |
| High-conviction floor | ≥85% conviction requires ≥10 settled calls |
| High-conviction floor cap | Auto-cap at 84% conviction when floor not met (no revert) |
| Skipped anti-spam gates | Rate limiting, minimum movement threshold, mandatory reasoning |
| Reputation gain formula | base × confidence_multiplier × contrarian_multiplier |
| Reputation loss formula | base × confidence_multiplier (no contrarian on losses) |
| High conviction threshold | 85% |
| High conviction multiplier | 2× on both payout and penalty |
| Reputation structure | Global + 3 categories (Majors/DeFi/Other, see §7.5) + caller score + challenger score |
| Follow/fade impact on rep | None — only making calls moves rep |
| Inactivity behavior | All scores freeze, no decay |
| Reputation gating | None in v1 (purely social signal) |
| Call types | Price target, Spread/vs (5 metrics), Event/binary (7 subtypes) |
| Spread/vs metrics | Price, Market cap, Volume rank 7d, TVL rank, Fees rank 7d |
| Event/binary subtypes | TVL milestone, Volume/fees, On-chain metric, CEX listing, Token launch, Governance, Protocol milestone |
| v1 asset allowlist | 25 coins across majors/L2s/DeFi/LSTs/memes/Arb ecosystem/AI |
| v1 NFT allowlist | CryptoPunks, BAYC, Pudgy Penguins, Milady, Azuki, DeGods |
| NFT resolution | 24h TWAP floor — computed off-chain by the relayer from Alchemy NFT API sales/listings; signed and submitted on-chain |
| Deferred to v2 | Macro events, compound calls, range/band, race events, NFT mint outcomes |
| Cut entirely | Social engagement events, personal/interpersonal predictions |
| Resolution Criteria field | Optional for Price/Spread/TVL/Volume/On-chain; required (≥50 chars) for CEX/Token/Governance/Protocol |
| Resolution Criteria binding | Advisory in disputes — structured fields take precedence |
| Resolution Criteria storage | Hashed onchain at publish, immutable |
| VERIFIED CRITERIA badge | For criteria ≥50 chars, no mechanical effect |
| Social actions | Follow, Fade, Challenge, Quote |
| Quote implementation | parent_call_id reference on CallRegistry |
| Challenge default stake | Matches caller's stake (pre-filled in challenge form) |
| Challenge "Open" badge | ⚔ OPEN badge on call cards when caller toggle is ON (default ON) |
| Trending Duel threshold | $500+ combined pot OR 50+ Riding backers — 4-hour pin in feed |
| Duel King badge | Highest 7-day duel win streak holder; refreshed weekly |
| Duel rep impact | ~1.5× a comparable follow/fade settlement |
| Duel-specific share card | Two-avatar layout with WINS outcome word; distinct from regular receipts |
| Public/league | Public by default, no leagues in v1 |
| Receipt format | Off-chain OG images (not NFTs) |
| Price oracle (coins) | Pyth Network |
| NFT floor oracle | **Alchemy NFT API** (Reservoir sunset Oct 2025); relayer computes 24h TWAP off-chain from raw sales/listings and submits signed update |
| Protocol data oracle | DefiLlama API (TVL, volume, fees, APRs) |
| On-chain metrics oracle | Direct RPC + DefiLlama Yields/Liquidations |
| Governance oracle | Snapshot API + Tally / direct on-chain |
| CEX listing oracle | Relayer-scraped exchange announcement pages |
| Event resolution | Hybrid: auto-resolve + 24h dispute window with $5 USDC bond |
| Dispute reward | $2 USDC from treasury if disputer wins |
| Farcaster Frames | Last phase, only if time permits |
| Contracts | 6 total: CallRegistry, FollowFadeMarket, ChallengeEscrow, SettlementManager, ProfileRegistry, StylusScoreEngine |
| AMM vs fixed-odds | AMM for Follow/Fade, fixed-odds escrow for Challenge |
| Sign-in options | Connect Wallet, Sign in with Google, Sign in with Twitter |
| Embedded wallet provider | Privy |
| Social linking | Twitter + Farcaster — both optional, encouraged |
| Social verification effect | VERIFIED badge only, no rep impact, no mechanical gating |
| Handle priority | ENS → Twitter → Farcaster → truncated address (user-overridable) |
| Twitter/Farcaster gas | Sponsored by protocol for linking actions |
| Twitter follow-graph integration | "From your X" feed section, up to 10 most recent calls from followed X accounts, opt-in during onboarding |
| Farcaster follow-graph integration | "From your Farcaster" feed section, parallel to Twitter graph |

### Appendix A.1 — Additional Locked Decisions (2026 spec revision)

The following decisions were added or amended in the CEO+eng review revision pass. They supersede any conflicting language in earlier sections.

**Reputation system:**

| Decision | Value |
|---|---|
| Reputation categories (v1) | **3 categories: Majors, DeFi, Other** (down from 8 originally explored — see §7.5 for category-assignment rules) |
| Future category expansion | Append to enum without renumbering; preserves on-chain rep history |
| Settled-caller does not earn rep after exit | Locked per §8.7.3 — caller-exit slash IS their settlement; eventual outcome does not adjust their rep |
| "Real fader" threshold for cold-start 25% rep adjustment | Any non-zero real USDC in the fade pool (excluding $7 virtual seed) |

**Allowlist:**

| Decision | Value |
|---|---|
| Coin allowlist cleanup | BASE removed (no token exists); MATIC published as POL in 2024 — verify feed name pre-deploy |
| Pre-deployment Pyth feed verification | Required for every listed coin against [docs.pyth.network/price-feeds](https://docs.pyth.network/price-feeds/price-feeds) — particularly MNT, ETHFI, ezETH, RDNT |
| NFT allowlist | Same 6 collections; coverage verified against Alchemy NFT API before launch |

**Smart contract architecture:**

| Decision | Value |
|---|---|
| FollowFadeMarket structure | **Single contract with sub-state** keyed by `callId` (per-call proxy rejected) |
| AMM penalty-injection semantics | USDC added directly to pool reserve; `k` grows; existing shares appreciate pro-rata |
| Settlement atomicity | All 14 steps in `settle()` execute atomically; any revert rolls back the whole transaction |
| Settlement idempotency | Second `settle()` call reverts `AlreadySettled` cleanly |
| Stylus runtime fallback | SettlementManager wraps Stylus call in try/catch; on revert falls back to Solidity baseline rep calc + emits `RepCalculatedFallback` event |
| Stylus build-time fallback cutoff | 48 hours before demo |
| Stylus contract upgradability | Minimal transparent proxy with deployer-key admin (rotated to multisig before v1.1) |
| Other contracts (CallRegistry, FollowFadeMarket, ChallengeEscrow, SettlementManager, ProfileRegistry) | NOT upgradable in v1; pause + redeploy is the rollback policy |
| Solidity version | Pinned to `^0.8.24` (not "0.8+") |
| USDC address | Hardcoded in every transfer path via `require(token == USDC_ARB)` |

**Contract gates and errors (new):**

| Decision | Value |
|---|---|
| Post-expiry follow/fade gate | `require(block.timestamp < call.expiry)` in `follow`/`fade` — reverts `CallPastExpiry` |
| Slippage parameter | `minSharesOut` required on `follow` and `fade`; reverts `SlippageExceeded` |
| Min follow/fade position | $1 USDC (`MIN_POSITION`) |
| Max follow/fade position per user per call | $100 USDC (`MAX_POSITION`) — matches caller cap |
| Self-challenge gate | `require(msg.sender != call.caller)` in `proposeChallenge` — reverts `SelfChallenge` |
| Caller's `openToChallenges` enforced at contract | Yes — `proposeChallenge` reverts `CallerNotOpenToChallenges` if false |
| `claimPayout` idempotency | `require(!claimed[callId][user])` — reverts `AlreadyClaimed` |
| `setTvlCap` upper bound | Hardcoded `MAX_ALLOWED_CAP = 100,000 * 1e6` — owner cannot raise above this |
| Twitter/Farcaster handle length cap | 50 bytes per `MAX_HANDLE_LENGTH` |
| ProfileRegistry settlement-manager rotation | Single authorized SettlementManager at a time; owner rotates via `setSettlementManager` |
| TVL cap reached error | `TvlCapReached` with descriptive params; aggregated across all open calls and contracts |
| Asset not allowlisted error | `AssetNotAllowlisted` |
| `forceSettle` escape hatch | Owner-only, available 7 days after `call.expiry`; emits both `CallForceSettled` and `CallSettled` for loud audit trail |
| `RepCalculated` event | Emitted with full inputs (currentRep, conviction, consensusPct, isWinner, baseValue, delta) for debuggability |
| `getCallsByUser` pagination | Built into v1 interface (`offset, limit`) even though hackathon volumes are small — avoids v2 redeploy |

**Hash semantics:**

| Decision | Value |
|---|---|
| Duplicate hash deadline rounding | UTC, floor, 86,400 seconds: `deadline_day_utc = (deadlineTimestamp / 86400) * 86400` |
| Frontend must display rounded UTC day next to chosen deadline | Yes — duplicate-detection surprises at day boundary must never be invisible |

**Oracle thresholds:**

| Decision | Value |
|---|---|
| Pyth confidence threshold | 0.5% of price (`confidence × 200 <= price`) |
| Pyth tiered wait policy | 30 retries × 60s = 30 min max; then 24h dispute window |
| NFT TWAP minimum observations | 12 in 24h window; below that, treated as ambiguous |
| Maximum settlement SLA | 24h 30m (Pyth retries + dispute window) for normal flow; `forceSettle` available at expiry + 7 days |

**Mainnet safety additions:**

| Decision | Value |
|---|---|
| Privy custody disclosure | Surfaced during onboarding; re-prompts wallet export at $50 USDC balance |
| Paymaster per-account cap | 5 sponsored transactions; 6th onward requires user-provided ETH |
| Paymaster global daily cap | $50/day at hackathon launch; auto-disable when reached |
| Paymaster cap alert | Telegram bot at 80% of daily cap |
| CAPTCHA on sign-up | Deferred to v1.1; daily cap is the primary defense at hackathon scale |
| SIWE re-sign at withdrawal | Required for the saved external-address destination |
| New-auth-link cooldown | 24h before a newly-added auth method can authorize withdrawals |
| Per-auth-method permission scoping | OAuth methods can view/sign but require 2nd factor for withdrawals over a threshold (post-v1; documented limitation in v1) |
| Notification on auth-method link | In-app + email when available |
| Address on shareable receipt | **NOT shown** — handle + rep + outcome only |

**Process and deployment:**

| Decision | Value |
|---|---|
| Sepolia staging gate | ≥48h with seeded calls, settlements, exits, challenges, disputes before mainnet — non-optional |
| Safety review phase | Moved from Phase 8 to **Phase 6** (before polish, before mainnet promotion) |
| Post-deploy smoke test checklist | §19.11 — 20-minute checklist mandatory before public announcement |
| Demo seed plan | 10-15 calls pre-funded across both Privy and external wallets for realism |
| MetaMask backup path for demo | Not added — Privy is the chosen single auth provider |
| Subgraph commitment | Use a subgraph (The Graph) as the primary indexed event source for v1; polled events as hackathon fallback if subgraph deploy is delayed |
| Real-time UI updates | 5-second polling for hackathon launch; WebSocket migration is a v1.1 priority |

**Design system additions:**

| Decision | Value |
|---|---|
| Neobrutalist treatment | Locked per §14.6 — 2-3px borders, hard offset shadows (no blur), 0-2px corner radius max, 4px corner brackets on weight-carrying blocks, asymmetric grids |
| Shared loading skeleton | §15A.1 — single component, 6 variants, low-contrast shimmer |
| Shared error/status toast | §15A.2 — single component, 3 status colors (red/amber/green), hard shadow, 4px brackets, auto-dismiss timing per status |
| Settled Receipt Page | Designed in §15.7 |
| Sign-in Screen | Designed in §15.8 |
| Onboarding Flow | Designed in §15.9 |
| Quote Call Composer | Designed in §15.10 |
| OG fallback ("A Call Was Made") | Designed in §16.6 — serves when real card not yet cached or service down |
| Mobile responsive | 375px breakpoint for 7 critical pages (Feed, Receipt Live, Profile, Settled Receipt, Sign-in, Onboarding, Leaderboard); rest get desktop-only banner |

**Observability and operations:**

| Decision | Value |
|---|---|
| Structured logging | Required on relayer for every oracle query, settlement submission, and dispute |
| Minimum metrics dashboard | Total TVL, calls/hour, settlement latency, dispute rate, failed-tx rate |
| Alerting | Telegram bot for failed `settle()`, pause invocation, dispute raised, TVL approaching cap |
| Settlement-stuck runbook | Documented in §10.7; references `forceSettle` after 7-day cooldown |

---

*End of specification.*
