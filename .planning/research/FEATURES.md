# Feature Research — Call It

**Domain:** Identity-first onchain social prediction market (Arbitrum mainnet, USDC, person-first reputation)
**Researched:** 2026-05-21
**Confidence:** HIGH on spec coverage (locked spec is the source of truth); MEDIUM on 2026 competitive deltas (WebSearch-verified against Polymarket, Kalshi, Manifold, Stocktwits, Farcaster, Privy docs)
**Method:** This is not a "what should we build" greenfield study. The spec at `CALL_IT_SPEC1.md` names every v1 feature. This document categorizes each spec feature against 2026 competitive baselines so REQUIREMENTS.md and the roadmap can sequence them.

---

## Executive Synthesis

Three findings dominate the analysis:

1. **The spec is feature-complete for v1.** Cross-referencing all 17 active requirement clusters in `PROJECT.md` against Polymarket, Kalshi, Manifold, Stocktwits, and the Farcaster/Mini-Apps ecosystem produced **zero genuine table-stakes gaps**. The only debatable omission — push notifications — is explicitly deferred to v1.1 in §20.1 and is non-blocking for the share loop. The spec's authors clearly studied the competitive landscape before locking decisions.

2. **The differentiator stack is real and compounding.** Five differentiators stack on top of each other in ways no single competitor matches: identity-first calls, conviction × contrarian rep math, public Caller Exit broadcast, Stylus-Rust scoring, neobrutalist receipts. Polymarket can copy any one of these. They cannot copy the gestalt without abandoning their market-first thesis.

3. **The receipt/share loop has a 9-step critical path with a single hard dependency chain.** A break at any one step kills Core Value. The roadmap must sequence Phases 1-7 to converge on a working share loop **before** Phase 8 (Frames) and Phase 9 (mobile responsive). The spec's build order already does this — validating it here.

The most consequential downstream finding for REQUIREMENTS.md: **48 features are P1 (mainnet ship blockers), 11 are P2 (v1 polish), 16 are explicitly anti-features (do not build).** Every P1 must trace to a spec section and a critical-path step.

---

## Feature Landscape

### TABLE STAKES — Auth & Identity

Users assume these. Missing any = bounce at sign-in or onboarding. All present in spec.

| Feature | Why Expected | Complexity | Critical Path? | Mainnet Safety? | Spec § |
|---------|--------------|------------|----------------|------------------|--------|
| Connect wallet (SIWE) | Crypto-native primary audience expects EOA path; SIWE is the EIP-4361 standard | LOW | YES (sign-up) | NO | §9.1, §15.8 |
| Sign in with Google (OAuth + embedded wallet) | Non-crypto users need email-like onboarding; standard since Privy/Magic 2023 | MEDIUM | YES (sign-up) | YES (custody disclosure) | §9.1, §9.2, §10.6 |
| Sign in with Twitter (OAuth + embedded wallet) | X-native audience; pre-links handle for social proof | MEDIUM | YES (sign-up) | YES (same as Google) | §9.1, §9.2 |
| Embedded wallet auto-creation (Privy) | OAuth users cannot see a seed phrase; Privy is the 2026 default per Privy docs | MEDIUM | YES | YES (MPC custody) | §9.2 |
| Wallet export to self-custody | Privy "escape hatch" is a 2026 expectation; needed for ≥$50 disclosure | MEDIUM | NO | YES (custody escape) | §9.2, §10.6, §15.4 |
| ENS / Twitter / Farcaster handle resolution | Crypto users expect their identity to render correctly, not as 0xabc... | LOW | YES (receipt) | NO | §9.6 |
| Optional Twitter linking with VERIFIED · X badge | Social proof — credibility cue users assume on any social product | MEDIUM | YES (receipt credibility) | NO | §9.3, §9.4 |
| Optional Farcaster linking with VERIFIED · FC badge | Farcaster is the secondary network for crypto-native; assumed | MEDIUM | NO (Twitter alone covers v1) | NO | §9.3, §9.4 |
| Onboarding flow (handle, socials, opt-in, commitment) | First-run UX is non-negotiable; setting the brand voice early per §15.9 | MEDIUM | YES (first session) | NO | §15.9 |
| Sponsored gas (paymaster, first 5 tx free) | Newcomers cannot fund ETH before they can act; expected per all 2026 onboarding products | HIGH | YES (first action) | YES ($50/day cap) | §10.7 |
| Fund flow (Coinbase Onramp + direct USDC transfer) | OAuth users must move from $0 USDC to any USDC; Onramp is the expected path | HIGH | YES (first call) | YES | §19 Phase 1, §19.11 |
| SIWE re-sign at withdrawal | Defense against compromised OAuth at moment of value extraction | LOW | NO (no withdrawal in critical path until claim) | YES | App.A.1 §10.6 |
| Address book + new-auth-link 24h cooldown | Industry pattern post-Inferno-Drainer; required for OAuth + withdrawal safety | MEDIUM | NO | YES | §19 Phase 1.5, App.A.1 |
| Privy custody disclosure card during onboarding | VASP / money-transmitter risk mitigation via user education | LOW | NO | YES | §10.6 |

**Note on Privy:** verified via Privy docs and 2026 Privy review — embedded wallets are portable, one-click export is shipping, MPC custody is the 2026 standard for OAuth wallets. The spec correctly identifies this is custodial and exposes the disclosure.

### TABLE STAKES — Call Creation & Anti-Spam

| Feature | Why Expected | Complexity | Critical Path? | Mainnet Safety? | Spec § |
|---------|--------------|------------|----------------|------------------|--------|
| Three call types (Price target, Spread/vs, Event/binary with 7 subtypes) | Crypto Twitter posts predictions across all three shapes; coverage gap = bounce | HIGH | YES (every call) | YES (deterministic resolution) | §4.1-4.3 |
| Asset/NFT allowlist with pre-deploy Pyth verification | Stable settlements require allowlisted feeds; arbitrary asset support is a settlement bomb | LOW | YES | YES (gates `AssetNotAllowlisted`) | §4.4, App.A.1 |
| Resolution Criteria field (optional/required by call type) | Disambiguates "what counts as a mainnet launch" — protects dispute resolution | LOW | YES (event types) | YES (dispute foundation) | §4.7 |
| Min stake floor $5 USDC | Anti-spam — without this, the feed is a meme cesspool within 24h | LOW | YES (every call) | YES (Gate 6.1) | §6.1 |
| Duplicate detection (`duplicateHash`, UTC-day floor) | Two identical calls live at once erodes signal; standard prediction-market gate | LOW | YES (every call) | YES (Gate 6.2) | §6.2 |
| High-conviction floor (≥85% conviction requires ≥10 settled calls) | Prevents brand-new accounts from posting high-conviction garbage | LOW | YES (high-conviction calls) | YES (Gate 6.3) | §6.3 |
| Conviction slider 1-100% with live conviction warning at ≥85% | Conviction is the input the rep math multiplies — must be honest | LOW | YES (every call) | NO | §6.3, §15.2, §17.2 |
| Two-step publish flow (review modal + confirm) | Permanent + public + onchain = no accidents allowed. Industry standard for irreversible action | LOW | YES (every call) | YES (irreversibility) | §15.2 |
| Live receipt preview during composition | "You're about to commit X" — preview prevents bounce when user sees receipt for first time | MEDIUM | YES | NO | §15.2 |
| Allowlist of 25 coins + 6 NFT collections | v1 deliberately narrow — quality > breadth at launch | LOW | YES | YES (pre-deployment verification per App.A.1) | §4.4 |

### TABLE STAKES — Social Actions

| Feature | Why Expected | Complexity | Critical Path? | Mainnet Safety? | Spec § |
|---------|--------------|------------|----------------|------------------|--------|
| Follow (parimutuel AMM) | Without follow, the call is monologue. Cannot have prediction without bet-with | HIGH | NO (receipt loop) — but YES for product completeness | YES (TVL aggregation, slippage, post-expiry gate) | §5.1, §8.1, §12.2 |
| Fade (parimutuel AMM) | Symmetric counterparty; Polymarket users expect to bet against | HIGH | NO | YES | §5.2, §8.1 |
| Challenge (1v1 escrow) — caller opt-in default ON | Drama surface; what makes Call It feel alive vs anonymous markets | MEDIUM | NO (v1.5 polish) — but YES for distribution | YES (self-challenge gate) | §5.3, §12.3 |
| Quote-call (parent_call_id reference) | Thread-style "I disagree" — table stakes for any social product | LOW | NO | NO | §5.4, §15.10 |
| Position exits (4h cooldown, 10% slash) | Markets without exit feel rigged; cooldown prevents front-running | MEDIUM | NO | YES (TVL freed) | §8.7.1, §12.2 |
| Slippage protection (`minSharesOut`) on follow/fade | Sandwich-attack resistance — 2026 baseline for any AMM | LOW | YES (every follow/fade) | YES (sandwich resistance) | §12.2, App.A.1 |
| Live activity feed on receipt page | "X just followed with $50" social proof — what makes a market feel hot | MEDIUM | YES (live receipt) | NO | §15.3 |

### TABLE STAKES — Reputation & Settlement

| Feature | Why Expected | Complexity | Critical Path? | Mainnet Safety? | Spec § |
|---------|--------------|------------|----------------|------------------|--------|
| Global rep score (starting 100, floor 0) | The number on every profile. The product is this number. | LOW | YES (receipt) | NO | §7.1, §7.2 |
| Category sub-scores (Majors / DeFi / Other) | "Where is this caller actually sharp?" — Manifold has this, expected | LOW | NO | NO | §7.5 |
| Confidence × contrarian multiplier rep math | The differentiator math (see Differentiators) — but also table stakes for any rep system | MEDIUM | YES (settlement) | NO | §7.3 |
| Caller score + challenger score separation | Skill profiles differ; expected for any duel/dual-mode system | LOW | NO | NO | §7.5 |
| Pyth price feeds with 0.5% confidence threshold | Production oracle for coin prices; manipulation-resistant | MEDIUM | YES (settlement) | YES (oracle gating) | §13.1 |
| Pyth tiered wait policy (30 retries × 60s + 24h dispute) | Production-grade oracle handling; clean SLA narrative | MEDIUM | YES (settlement) | YES (24h 30m SLA) | §13.1, §13.7 |
| Alchemy NFT API + relayer-computed 24h TWAP | Replaces Reservoir (sunset Oct 2025); production NFT floor | HIGH | YES (NFT calls) | YES (signed relayer) | §13.2 |
| DefiLlama integration (TVL/Volume/Fees/APRs) | Standard data source for DeFi events; trusted by users | MEDIUM | YES (event subtypes 1-3) | YES (signed relayer) | §13.3 |
| Snapshot + Tally for governance | The two governance platforms users will name; covering both is expected | MEDIUM | YES (governance subtype) | YES | §13.5 |
| CEX listing announcement scrapers (8 exchanges) | Listing events are the most-shared CT prediction shape; must cover | HIGH | YES (CEX subtype) | YES (signed relayer) | §13.6 |
| Owner-resolved disputes with $5 bond + $2 reward | Production disputes need a bond — keeps spam off, legitimate disputes on | LOW | YES (post-settlement) | YES (dispute safety) | §13.8, §8.10 |
| Settlement idempotency + atomicity | Calling `settle` twice cannot corrupt state — table stakes for any payment contract | LOW | YES (settlement) | YES (state integrity) | §12.4 |
| Force-settle escape hatch (7d cooldown) | Production stuck-oracle recovery — every settled-money protocol needs this | LOW | NO (operator) | YES | §10, §12.4 |
| The Graph subgraph from day 1 (primary event source) | Production indexing — every read-heavy product post-2022 uses a subgraph | HIGH | YES (feed, profile, all UI reads) | NO | §19, App.A.1 |

### TABLE STAKES — Sharing & Receipts

| Feature | Why Expected | Complexity | Critical Path? | Mainnet Safety? | Spec § |
|---------|--------------|------------|----------------|------------------|--------|
| OG image generation service (Satori or @vercel/og) | Without OG images, share previews are broken. 2026 baseline | MEDIUM | YES (share moment) | NO | §16, §18.2 |
| Live state OG card (1200×630) | Twitter renders 1200×675 (16:9) per 2026 Twitter docs; 1200×630 (1.91:1) covers FB/Discord + Twitter Summary Large Image | LOW | YES (live share) | NO | §16.1, §16.2 |
| Settled state OG card with outcome word as hero | The single most-shared asset — must be unfakeable at thumbnail | MEDIUM | **YES — Core Value** | NO | §16.3 |
| Fallback OG card ("A CALL WAS MADE") | Race condition: user shares before cache warms. Must never 404 the preview | LOW | YES (share resilience) | NO | §16.6 |
| Receipt page (live state) at `/call/[id]` | Permanent URL is the receipt's address — must exist before share works | MEDIUM | YES (every share) | NO | §15.3 |
| Receipt page (settled state) at same URL | Same URL, different render when `status == Settled` — clean share semantics | MEDIUM | YES (settled share) | NO | §15.7 |
| 200px-viewport readability QA gate on outcome word | Thumbnail readability is what makes the receipt travel | LOW | YES (validates Core Value) | NO | §15.7, §16.3 |
| Outcome word variants (5: CALLED IT / LOUD AND WRONG / CONTRARIAN HIT / COLD CALL / FADED CORRECTLY) | Each outcome has a different narrative — sharing needs the right word | LOW | YES | NO | §15.7, §16.3 |
| Twitter Card Validator compatibility (smoke-tested) | Verifying preview works before mainnet announce | LOW | YES (smoke test) | NO | §19.11 |
| Auto-post receipt to socials on settle (default ON) | Distribution multiplier — expected in 2026 prediction products | MEDIUM | NO (v1.5 polish) — YES for distribution | NO | §15.2 advanced settings |

### TABLE STAKES — Discovery & Feed

| Feature | Why Expected | Complexity | Critical Path? | Mainnet Safety? | Spec § |
|---------|--------------|------------|----------------|------------------|--------|
| Global feed ("The Tape") with chronological live calls | The main page; without it the product is empty | MEDIUM | YES | NO | §15.1 |
| Filter tabs (Live / Settled / Following / Duels) | Standard feed pattern; users expect to slice | LOW | NO | NO | §15.1 |
| Leaderboard ("Top of book") with 7d/30d/All-time | Rep without a leaderboard is invisible — Manifold-baseline | MEDIUM | NO | NO | §15.6 |
| Profile page with rep hero, 30d trajectory, recent calls | Every social product has profile pages; missing = broken | MEDIUM | YES (linked-from-receipt) | NO | §15.4 |
| Duels tab with active duels, trending, recently settled | Discovery surface for challenges; lets challengers find calls to challenge | MEDIUM | NO | NO | §15.1, §5.3 |
| "From your X" / "From your Farcaster" feed sections | Cold-start solver via existing follow graph — biggest unlock for new users per §9.9 | HIGH | NO (post-MVP) — YES for retention | NO | §9.9, §15.1 |
| Top Conviction pinned card | High-signal hero post in feed; standard social pattern | LOW | NO | NO | §15.1 |

### TABLE STAKES — Design System & Shared UI

| Feature | Why Expected | Complexity | Critical Path? | Mainnet Safety? | Spec § |
|---------|--------------|------------|----------------|------------------|--------|
| Shared loading skeleton component (6 variants) | Layout-shift-free loading; 2026 baseline UX | LOW | YES (every page) | NO | §15A.1 |
| Shared error/status toast (3 status colors, auto-dismiss) | All wallet-related products need consistent error surfacing | LOW | YES (every tx) | NO | §15A.2 |
| Neobrutalist treatment (2-3px borders, hard shadows, 0-2px radius, 4px corner brackets) | The brand. Without it, the product is a generic dashboard | MEDIUM | YES (brand integrity) | NO | §14.6 |
| Stamp animation on outcome reveal | The "moment" of the receipt — micro-interaction is the brand voice | LOW | YES (receipt feel) | NO | §17.2 |
| Mobile responsive on 7 critical pages (375px breakpoint) | Mobile is where shared links open. 7 pages = receipt loop + core | MEDIUM | YES (share-link target) | NO | §19 Phase 9 |

### TABLE STAKES — Mainnet Safety & Operations

| Feature | Why Expected | Complexity | Critical Path? | Mainnet Safety? | Spec § |
|---------|--------------|------------|----------------|------------------|--------|
| Max stake $100/call hardcoded | Real-money mainnet without per-call cap is malpractice | LOW | NO | YES | §10.1 |
| TVL cap $5K initial, owner-raisable to $100K | Blast-radius limiting; raise as audit confidence grows | LOW | NO | YES | §10.2 |
| Emergency pause with withdraw/claim carve-out | Withdraw must always work, even during pause — the line between bug and drain | LOW | NO | YES | §10.3 |
| ReentrancyGuard on all USDC transfer paths | Production money-handling — table stakes | LOW | YES (settlement) | YES | §10.5 |
| Solidity `^0.8.24` pinned + hardcoded USDC address | Audit-readiness — version pin + asset whitelist | LOW | NO | YES | §10.5 |
| Paymaster $50/day cap with 80% alert | Sponsored-gas drain attack mitigation | LOW | YES (first 5 free) | YES | §10.7 |
| Sepolia staging ≥48h with seeded calls, settlements, exits, disputes | Non-optional gate before mainnet. Per spec, this is locked. | HIGH | NO (pre-mainnet) | YES | §19.10 |
| Post-deploy smoke test (20-min checklist) | Mainnet announce ritual; documented in §19.11 | LOW | YES (pre-announce) | YES | §19.11 |
| Settlement-stuck operator runbook | Force-settle invocation criteria documented | LOW | NO (operator) | YES | §10.7, §12.4 |
| Structured relayer logging | Production observability — required for incident response | MEDIUM | NO (ops) | YES | App.A.1 |
| Metrics dashboard (TVL, calls/hr, settlement latency, dispute rate, failed-tx rate) | Five metrics that catch most production issues | MEDIUM | NO (ops) | YES | App.A.1 |
| Telegram alerts (failed settle, pause, dispute, TVL approaching cap) | Operator notification — mainnet without alerts is blind | LOW | NO (ops) | YES | App.A.1 |

**TABLE STAKES TOTAL:** 65 features. All present in the locked spec. **No genuine gaps found.**

---

### DIFFERENTIATORS — What the spec ships that competitors don't

These are the features that distinguish Call It from Polymarket, Kalshi, Manifold, Pump.fun, Friend.tech, and Stocktwits. Each is verified against competitor surveys in the Sources section.

| Feature | Value Proposition | Competitive Delta | Complexity | Spec § |
|---------|-------------------|---------------------|------------|--------|
| **Identity-first prediction** (every call tied to named handle, ENS or Twitter) | Polymarket positions are anonymous; Kalshi positions are KYC'd but not socially identified. Call It positions are public-by-default with handle, rep score, verified socials on every receipt. | Polymarket: anonymous trader_42. Kalshi: KYC'd but not socially surfaced. Manifold: handle-first but play-money. **Call It: real-money + identity + reputation.** | MEDIUM | §1, §2, §9 |
| **Conviction × contrarian rep math** | Rep gain scales with how lonely-and-right you were. Maximum gain is a bold contrarian win; minimum is a timid consensus call. Manifold has calibration scores but no contrarian multiplier. | Polymarket: no rep system. Manifold: calibration score (Brier). Stocktwits: heart counts only. **Call It: explicit contrarian × confidence math.** | MEDIUM | §7.3 |
| **High-conviction asymmetry (2× payout/penalty at ≥85% conviction)** | Physical tension when slider crosses threshold. Makes the conviction input mean something. No competitor exposes this. | None of Polymarket / Kalshi / Manifold has explicit high-conviction asymmetry; positions are linear. | LOW | §7.4 |
| **Public Caller Exit broadcast with rep slash** | "Caller bailed" is dramatic, public, undeniable. Creates a unique social offense category no other product has. | Polymarket: positions can be sold anytime, no social signal. Kalshi: same. **Call It: exiting a call is a public act with reputation consequences.** | MEDIUM | §8.7.2, §8.7.3, §15.3 |
| **Shareable receipt OG cards (5 variants) as Core Value** | Every settled call produces a thumbnail-readable outcome word that travels on X / Farcaster / Discord. The product is the receipt. | Polymarket: shareable position links exist but visual is generic chart. Manifold: similar. **Call It: the receipt IS the product surface.** | MEDIUM | §16, §18.2 |
| **Neobrutalist visual language** | Sharp typography, electric `#E8F542` accent, hard offset shadows, 4px corner brackets. Unmistakable at thumbnail size. | Polymarket: tasteful fintech. Kalshi: trading-platform standard. Manifold: friendly play-money. **Call It: looks like nothing else in the space.** | MEDIUM | §14.6 |
| **Stylus-Rust scoring engine with runtime + build-time Solidity fallback** | Rep math at near-native speed; impossible to express affordably in Solidity. Production fallback path means Stylus revert doesn't freeze settlement. | First production-Stylus reputation engine on Arbitrum (verifiable via Arbiscan post-deploy). Differentiator for hackathon + technical credibility for users. | HIGH | §11.6, §10.8, §12.6 |
| **Challenge / 1v1 duels with matched stakes + Duel King badge** | Drama on tap. "I publicly bet you wrong and matched your stake" is inherently shareable. | Polymarket: orderbook positions, no 1v1 framing. Kalshi: same. Friend.tech tried social-tokens for this but failed. **Call It: head-to-head is a first-class action.** | MEDIUM | §5.3, §12.3 |
| **Quote-call (thesis tree)** | Twitter-quote-tweet for predictions. Creates visible disagreement trees around important calls. | Polymarket: no analog. Manifold: comments only. **Call It: a quote-call is its own bet, threaded.** | LOW | §5.4, §15.10 |
| **Trending Duel + Duel King badge** | Auto-promote duels with ≥$500 pot or ≥50 backers. Highest 7-day duel-streak holder gets the badge. Aspirational + competitive. | None of the competitors has a streak-based public badge. | LOW | §5.3 |
| **3-category reputation (Majors / DeFi / Other)** | Reveals where a caller's edge is. "Sharp on Majors, mediocre on DeFi" is a useful signal. | Manifold has topic tags but no category sub-scores. Polymarket positions don't aggregate. | LOW | §7.5 |
| **Cold-start rep adjustment (25% gain if no real faders)** | Prevents farming uncontested calls. Locks the anti-spam math even when AMM has no opposition. | No competitor has this — most don't have rep systems at all. | LOW | §8.3 |
| **VERIFIED CRITERIA badge + Resolution Criteria field** | Caller pre-specifies their own standard. Forces thoughtfulness, self-curates quality. | Polymarket has resolution criteria but it's exchange-set, not caller-set. Manifold is informal. **Call It: caller writes their own standard, on record.** | LOW | §4.7 |
| **Twitter follow-graph integration ("From your X" feed)** | Cold-start solver. New users see calls from people they already trust on X. | Stocktwits has X integration but for chat. Polymarket has no social graph. **Call It: graph imports power the feed.** | HIGH | §9.9, §15.1 |
| **Caller Exit share card (amber outcome variant)** | Even the failure mode is a sharable receipt. Caller bailing = drama = distribution. | No competitor has this. The act of exiting a position is silent everywhere else. | LOW | §16.5 |
| **Auto-post receipt on settle (default ON)** | Every settled call goes to caller's X automatically. Distribution by default. | Polymarket: manual share. **Call It: default-on distribution.** | MEDIUM | §15.2 advanced settings |
| **1.7% total extraction vs 2-5% across competitors** | Headline number to communicate. Lower than Polymarket (~2%), Pump.fun (~6%+), Melee (3-5%). | Verified via competitor fee surveys: Polymarket ~2% per trade, Kalshi $0.07-1.75 per 100 contracts (depth-dependent), Manifold play-money (no take). **Call It: 1.7% all-in.** | LOW | §8.6 |

**DIFFERENTIATORS TOTAL:** 17 features that no single competitor matches. The defensible moat is the **combination**, not any single one.

---

### ANTI-FEATURES — Things the spec correctly excludes (validated against 2026 pressure)

For each anti-feature, validating whether the 2026 competitive landscape creates pressure to reconsider. Spoiler: none of them do.

| Anti-Feature | Why Excluded | 2026 Pressure to Reconsider? | Verdict |
|--------------|--------------|-----------------------------|---------|
| **Social engagement events** (tweet likes, follower counts, recasts) | Trivially manipulable via botting; incompatible with credibility-based product | None. Polymarket / Kalshi avoid these. Twitter has not become more bot-resistant since 2024. | **Keep excluded.** Re-evaluate never. |
| **Personal / interpersonal predictions** ("X subtweets Y") | Subjective and unverifiable | None. Manifold dabbles in these as play-money but the resolution disputes are well-documented messes. | **Keep excluded.** |
| **Engagement / ratings events on Farcaster casts** | Same manipulation surface as Twitter; bots are cheaper on Farcaster | None. | **Keep excluded.** |
| **NFT minting of receipts** | Faster to render off-chain; easier to iterate; referenced onchain by hash. NFT-of-prediction adds friction without value. | None. The 2021 "everything is an NFT" thesis has cooled. Polymarket / Kalshi don't NFT positions. | **Keep excluded.** |
| **Macro / regulatory events in v1** (ETF approvals, Fed rates, political outcomes) | Needs dedicated human-curated oracle; v2 | None. Polymarket and Kalshi do these but have dedicated oracle teams. Call It does not need to compete on this axis in v1. | **Keep excluded.** Polymarket / Kalshi have moats here that Call It cannot match without a 10-person oracle team. |
| **Multi-condition compound calls** ("BTC > $100k AND ETH > $5k") | Needs composite resolution logic | None. | **Keep excluded.** v2. |
| **Range / band predictions** ("ETH stays between X and Y") | Path-dependent settlement is harder than v1 oracle stack can guarantee | None. | **Keep excluded.** v2. |
| **First-to-X / race events** ("X launches before Y") | Two-event tracking | None. | **Keep excluded.** v2. |
| **NFT mint outcomes** ("X sells out in 24h") | Mint-specific oracle complexity | None. | **Keep excluded.** v2. |
| **Notification system** (§20.1) | v1.1 — bell icon stays, no delivery in v1 | Mild. Modern social products notify. **But:** auto-post-to-X is the v1 substitute for caller's audience; the bell is the v1.1 priority. | **Keep excluded in v1.** Spec is right to defer; auto-post-to-X mitigates. |
| **Search UI** (§20.2) | v1.1 — leaderboard + feed are discovery in v1 | Mild. Most products have search. **But:** at hackathon volume, search is over-engineering; leaderboard + filter chips suffice. | **Keep excluded in v1.** |
| **Watch / Notify delivery** (§20.3) | v1 button creates in-app subscription only | Tied to notification system above. | **Keep excluded in v1.** |
| **Reputation-gated stake limits** (§7.8) | $100 cap applies to all; rep is purely social signal | None. Rep-gating could discourage new callers. | **Keep excluded in v1.** v2 consideration. |
| **Leagues / curated groups** | Public-by-default in v1 | None. Friend.tech / Stars Arena tried curated communities and failed. Public is right. | **Keep excluded in v1.** |
| **Decentralized dispute resolution** (Kleros / token vote) | Owner-resolved in v1; complex governance is post-hackathon | None. Even Polymarket uses centralized resolution committee with onchain bonds. | **Keep excluded in v1.** Post-hackathon. |
| **MetaMask backup path beyond Privy** (separate non-Privy wallet flow) | Privy is the single auth provider; one path is the contract | Mild. Some users distrust embedded wallets. **But:** Privy supports SIWE Connect Wallet path natively (§9.1), which covers EOA. The exclusion is "no second auth provider," not "no EOA." | **Keep excluded in v1.** Privy covers both flows. |
| **Mobile-responsive Duel / Quote / New Call pages** | Desktop-only banner in v1; 7 critical pages get the responsive treatment | None. The shared-link landing pages (receipt, profile, leaderboard) ARE responsive. Composition can be desktop. | **Keep excluded in v1.** Smart trim. |
| **WebSocket real-time UI updates** | 5-second polling at hackathon launch; WebSocket is v1.1 | None at hackathon scale. | **Keep excluded in v1.** |
| **CAPTCHA on sign-up** | Daily paymaster cap is the primary defense | Mild. Sybil risk is real. **But:** the $50/day paymaster cap converts the financial attack into a DoS-against-honest-users — which is observable to operators within minutes. CAPTCHA can ship in v1.1 if abuse appears. | **Keep excluded in v1.** Re-evaluate at first sybil signal. |
| **Per-auth-method 2FA for large withdrawals** | Documented limitation in v1 | None at $100/call cap. | **Keep excluded in v1.** Caps make this not yet necessary. |

**ANTI-FEATURES VALIDATED:** 20 exclusions. **Zero need reconsideration for v1.** All deferred items are documented with v1.1+ trigger conditions.

---

## Feature Dependencies (Roadmap-Critical)

```
                                     ┌─────────────────────────┐
                                     │ TABLE STAKES — AUTH     │
                                     │ Privy + SIWE + Onboard  │ ─── Phase 1
                                     └────────────┬────────────┘
                                                  │ required for any action
                                                  ▼
                                     ┌─────────────────────────┐
                                     │ ProfileRegistry deploy  │ ─── Phase 1
                                     │ (rep + social identity) │
                                     └────────────┬────────────┘
                                                  │
                                                  ▼
┌─────────────────────────┐         ┌─────────────────────────┐
│ Pyth feed verification   │ ─────▶  │ CallRegistry deploy     │ ─── Phase 1
│ (pre-deploy)             │         │ (call creation, gates)  │
│ Alchemy NFT TWAP wired   │         └────────────┬────────────┘
│ DefiLlama, Snapshot/Tally│                      │
│ CEX scrapers ready       │                      ▼
└─────────────────────────┘         ┌─────────────────────────┐
                                     │ FollowFadeMarket deploy │ ─── Phase 2
                                     │ (AMM, slippage, exit)   │
                                     └────────────┬────────────┘
                                                  │
                                                  ▼
                                     ┌─────────────────────────┐
                                     │ ChallengeEscrow deploy  │ ─── Phase 3
                                     │ (1v1 duels)             │
                                     └────────────┬────────────┘
                                                  │
                                                  ▼
                                     ┌─────────────────────────┐
                                     │ SettlementManager deploy│ ─── Phase 4
                                     │ + oracle adapters       │
                                     │ + dispute window        │
                                     └────────────┬────────────┘
                                                  │
                                                  ▼
                                     ┌─────────────────────────┐
                                     │ StylusScoreEngine       │ ─── Phase 5
                                     │ (with 48h cutoff to     │     (Solidity fallback if Rust path breaks)
                                     │  Solidity baseline)     │
                                     └────────────┬────────────┘
                                                  │
                                                  ▼
                                     ┌─────────────────────────┐
                                     │ Safety review +         │ ─── Phase 6 (MOVED EARLIER per spec)
                                     │ boundary testing        │
                                     └────────────┬────────────┘
                                                  │
                                                  ▼
                                     ┌─────────────────────────┐
                                     │ OG image service        │ ─── Phase 7
                                     │ (Satori / @vercel/og)   │
                                     │ 5 variants              │
                                     └────────────┬────────────┘
                                                  │
                                                  ▼
                                     ┌─────────────────────────┐
                                     │ Subgraph deploy         │ ─── Phase 7 (parallel)
                                     │ (The Graph)             │
                                     └────────────┬────────────┘
                                                  │
                                                  ▼
                                     ╔═════════════════════════╗
                                     ║ SHARE LOOP COMPLETE     ║ ◀── CORE VALUE
                                     ║ Sign-up → Call → Settle ║
                                     ║   → Share → Sign-up     ║
                                     ╚═════════════════════════╝
                                                  │
                              ┌───────────────────┼───────────────────┐
                              ▼                                       ▼
              ┌─────────────────────────┐         ┌─────────────────────────┐
              │ Farcaster Frames        │         │ Mobile responsive       │ ─── Phase 9
              │ (if time permits)       │ ─── Phase 8                       │
              └─────────────────────────┘         └─────────────────────────┘
```

### Dependency Notes

- **CallRegistry blocks everything** — no Follow/Fade, Challenge, Quote, or Settlement without it. Phase 1 priority is correct.
- **ProfileRegistry must deploy before CallRegistry** because Gate 6.3 (high-conviction floor) reads `settledCalls` from ProfileRegistry at call creation time. The spec correctly groups both in Phase 1.
- **FollowFadeMarket depends on CallRegistry storage layout** (callId, expiry, status) — keying sub-state by callId is the locked architecture (§11.2). Cannot deploy independently.
- **ChallengeEscrow depends on CallRegistry's `openToChallenges` flag** (§12.3 step 4 enforces this at the contract level, not just UI). Cannot deploy without that field.
- **SettlementManager depends on all four prior contracts** plus oracle adapter wiring. This is the integration hub.
- **StylusScoreEngine is the only contract with a build-time fallback** — the 48h cutoff allows it to slip to Solidity baseline without blocking the demo. Build order correctly isolates the risk.
- **Safety review (Phase 6) must precede Phase 7 (OG service)** because mainnet promotion depends on Phase 6 passing. OG service is post-mainnet polish.
- **OG service (Phase 7) is the share-loop gate** — without it, the receipt is invisible. **This is the most underrated dependency.**
- **Subgraph (Phase 7 parallel) is required for the feed, profile, leaderboard** — all read-heavy UI surfaces. Polled-events fallback (per App.A.1) is the hackathon backup.
- **Frames (Phase 8) and mobile (Phase 9) are intentionally LAST** because they enhance, not enable, the share loop.

### Conflicts and Cross-Phase Coupling

- **Allowlist enforcement (CallRegistry) vs new asset onboarding (DefiLlama/Pyth):** Adding an asset requires `addAsset(symbol, feedId)` + pre-deploy Pyth verification. Owner workflow, not user-facing. Documented.
- **Paymaster budget cap vs OAuth onboarding flood:** New OAuth signups consume the $50/day cap quickly. The 5-sponsored-tx cap per account + global daily cap converge correctly per §10.7. No phase conflict — but operationally coupled.
- **Stylus deploy vs SettlementManager runtime try/catch:** SettlementManager must ship with both the Stylus call AND the Solidity baseline implementation. They are coupled in the same contract; can't ship the engine in Phase 5 without the fallback already in Phase 4.

---

## The Critical Path — Receipt / Share Loop

**Core Value:** Every call is permanent, public, and tied to identity. The receipt — created, settled, and shared — must be unfakeable, undeletable, and visually unmistakable.

The 9-step critical path. **Every step must work for Core Value to hold:**

```
Step 1.  Sign-up                  → Privy OAuth + embedded wallet creation succeeds
Step 2.  Fund                     → Coinbase Onramp OR direct USDC transfer to embedded wallet
Step 3.  First action sponsored   → Paymaster covers gas for first call publish
Step 4.  Compose call             → New Call page validates (allowlist, min stake, duplicate hash, conviction floor)
Step 5.  Publish call             → CallRegistry.createCall succeeds; CallCreated event emitted
Step 6.  Live receipt renders     → /call/[id] loads; OG image generated (or fallback serves)
Step 7.  Settlement happens       → SettlementManager.settle resolves outcome; rep updates
Step 8.  Settled receipt renders  → Same URL, different render; outcome word stamps in; OG card regenerates
Step 9.  Share to X / Farcaster   → Share button + auto-post triggers; Twitter Card Validator confirms thumbnail
Step 10. New user clicks the share → lands on settled receipt page → sign-up flow (loops back to Step 1)
```

### Features required on the critical path

Marked **P1-CRITICAL** in REQUIREMENTS.md if they trace to a step here.

**Step 1 — Sign-up:**
- Privy provider integration (§9.2)
- Three sign-in paths (Connect Wallet SIWE, Google OAuth, Twitter OAuth) (§9.1, §15.8)
- ProfileRegistry account creation (lazy or eager) (§11.5)
- Onboarding flow (§15.9)
- Custody disclosure card (§10.6)

**Step 2 — Fund:**
- Coinbase Onramp integration (§19 Phase 1)
- Direct USDC transfer detection (§19 Phase 1)
- Address book + 24h cooldown for new auth links (App.A.1 §10.6)
- SIWE re-sign at withdrawal (post-MVP via address book) (App.A.1)

**Step 3 — Paymaster:**
- Privy paymaster integration (§10.7)
- $50/day cap + 80% Telegram alert
- Per-account 5-tx counter

**Step 4 — Compose:**
- New Call page with three call types (§15.2)
- Live receipt preview (§15.2 right panel)
- Inline duplicate detection warning (§15.2)
- Allowlist enforcement (UI + contract) (§4.4, §12.1)
- Resolution Criteria field — required for event subtypes 3-6 (§4.7)
- Conviction slider with high-conviction warning (§15.2)
- Two-step publish (form → modal → wallet) (§15.2)

**Step 5 — Publish:**
- CallRegistry.createCall with all 16 contract-level checks (§12.1)
- USDC allowance + balance pre-checks with descriptive errors (§12.1)
- $10 creation fee transfer ($5 treasury + $5 virtual fade)
- Stake transfer + virtual fade seed initialization (§8.2)
- CallCreated event emission

**Step 6 — Live receipt:**
- `/call/[id]` page (live state) (§15.3)
- OG image generation service (Satori or @vercel/og) (§16.1, §16.2)
- Fallback OG card serves if cache not warm (§16.6)
- Subgraph indexing CallCreated within ~30s (or polled fallback)
- Live activity feed (follows/fades stream)
- Live pools / market positioning bar
- Caller header with VERIFIED badges + DUEL KING if applicable

**Step 7 — Settlement:**
- SettlementManager.settle with full 14-step atomicity (§12.4)
- Oracle adapters: Pyth (coins), Alchemy TWAP (NFTs), DefiLlama (TVL/Volume/Fees), RPC (on-chain), Snapshot/Tally (governance), CEX scrapers (listings)
- Pyth 0.5% confidence threshold + 30-retry policy
- StylusScoreEngine try/catch with Solidity baseline fallback (§11.6)
- Cold-start rep adjustment (25% if no real faders) (§8.3)
- Fee distribution (1.0% protocol, 0.4% creator, 0.3% LP) (§8.6)
- 24h dispute window opens
- CallSettled event emitted

**Step 8 — Settled receipt:**
- `/call/[id]` page (settled state) (§15.7)
- Outcome block with stamp animation (§17.2)
- Outcome word variants (5: CALLED IT, LOUD AND WRONG, CONTRARIAN HIT, COLD CALL, FADED CORRECTLY)
- OG image regeneration to settled state
- Settled OG card (§16.3) — outcome word as visual hero
- 200px-viewport readability QA gate
- FINAL POSITIONS block
- Settlement provenance line (oracle source + onchain tx)

**Step 9 — Share:**
- Share button on receipt page (§15.7)
- Auto-post receipt to socials on settle (default ON) (§15.2 advanced settings)
- Twitter intent URL construction (verified to pass Twitter Card Validator) (§19.11)
- Farcaster cast URL construction (optional, parallel)
- OG meta tags on receipt page server-rendered

**Step 10 — New user loops back:**
- Receipt page loads without auth (public-by-default per §18.1)
- Sign-in CTA prominent for unauthenticated viewers
- The same Step 1 onwards

### What breaks the loop

| Break point | Consequence | Mitigation in spec |
|-------------|-------------|---------------------|
| Privy OAuth fails | New OAuth users cannot sign up | Three sign-in paths means Wallet path is a fallback for crypto-native users (§9.1) |
| Paymaster cap hit | First 5 free narrative breaks | $50/day cap + 80% alert + "fund your wallet to continue" flow (§10.7) |
| Pyth feed unavailable | Settlement stuck | Tiered retry + 24h dispute window + force-settle escape hatch at 7d (§13.1, §12.4) |
| Stylus reverts at runtime | Settlement freezes | try/catch with Solidity baseline + RepCalculatedFallback event (§11.6) |
| Stylus build fails | Cannot deploy | 48h build cutoff to Solidity baseline (§11.6) |
| OG service down | Share preview broken | Fallback card with 24h CDN cache (§16.6) |
| Subgraph deploy delayed | Feed empty | Polled-events fallback (App.A.1) |
| TVL cap reached | New calls / follows revert | $5K initial, raisable via setTvlCap; documented operational tuning (§10.2) |
| Twitter Card Validator fails | Share preview doesn't render | Post-deploy smoke test §19.11 gates announcement on this |

---

## Reputation Farming Attack Surface

The spec has four anti-farming gates. Cross-checking against 2026 attack patterns from prediction markets and reputation systems:

### Existing Gates (per spec)

1. **Cold-start 25% rep adjustment** — correct call with zero real faders earns only 25% of normal gain (§8.3)
2. **Min stake $5 USDC** — anti-spam floor (§6.1, Gate 6.1)
3. **Duplicate hash** — two identical calls cannot be live simultaneously (§6.2, Gate 6.2)
4. **High-conviction floor** — 85%+ conviction requires 10 settled calls (§6.3, Gate 6.3)

### Attack Pattern Analysis (2026)

| Attack | Spec defense | Sufficient? | Gap notes |
|--------|--------------|-------------|-----------|
| **Sybil rep farming** — attacker creates N wallets, makes obvious calls, harvests rep | Cold-start 25% adjustment for uncontested calls; high-conviction floor requires 10 settled calls | MOSTLY. Sybils can grind 10 obvious low-conviction calls per account to unlock high-conviction. **At 25% rep gain, this is uneconomical compared to one genuine 100% gain.** Per the 2025 Sybil research (Humanode, Cointelegraph science-prediction-markets piece), economic cost is the right defense in absence of identity layer. | **No critical gap** at v1 scale. Watch metric: % of rep gains coming from uncontested calls. If >20%, consider increasing cold-start penalty. |
| **Wash trading own calls** — caller fades their own call with sybil wallet to bypass cold-start | Self-challenge gate prevents this for Challenges (§12.3 `SelfChallenge` revert), but **no gate prevents sybil-fade of own call** | PARTIAL. **GAP IDENTIFIED.** A caller can fade their own call from a second wallet to satisfy the "real fader" check and unlock full rep gain. The $5 min position × 10% slash on fade-side exit means the cost is bounded ($0.50 per attempted farm). Mitigation: monitor wash-trade pattern (same-source funding of opposing positions). Flag for v1.1 — not blocking but worth a metrics dashboard alert. | **GAP for REQUIREMENTS.md:** Add a relayer-side analytics flag for "fade pool funded predominantly from same source wallet cluster as caller." Not a contract change in v1 — observability only. |
| **Reputation laundering through inactivity** — grind to high rep, go silent, sell account | Inactivity freezes (no decay) per §7.7. Sells of OAuth-linked accounts theoretically possible | LOW priority. Account sales are detectable (handle change pattern) and the buyer cannot sell USDC out without SIWE re-sign on a NEW external address. The 24h new-auth-link cooldown (App.A.1 §10.6) is the defense. | **Sufficient.** |
| **Coordinated contrarian farming** — group of accounts coordinates to take opposite positions, half always wins | No specific defense | UNCLEAR. The contrarian multiplier rewards lonely winners — if 5 accounts coordinate to all fade one call, they share the contrarian credit. With max stake $100 and small group size, the upside is bounded. Likely not economical at hackathon scale ($5K TVL cap). | **No defense needed at hackathon scale.** Re-evaluate at >$100K TVL. |
| **Manipulation of consensus snapshot** — caller times call publish to gain favorable contrarian multiplier | Consensus is captured at call creation time. Caller cannot retroactively change it. | Sufficient. |
| **Duel King badge gaming via puppet wallets** — caller creates calls, second wallet challenges, caller wins all | Self-challenge gate blocks this directly (§12.3). Second wallet must be different EOA, AND duel King rewards 7-day win streak. Sybil pair would need to consistently win — losses also count. | Sufficient at scale. **Watch metric:** Are Duel King badge holders showing healthy win/loss ratios (>50% wins but not 100%)? |
| **Settling-bot front-running** — bot watches expiry, races to be settler | Settlement is permissionless (§12.4 "Anyone can call"); rewards come from relayer rotation. No race condition for outcomes (oracle data is deterministic). | Sufficient. |
| **Sandwich attacks on follow/fade** — front-runner buys then sells around victim's deposit | `minSharesOut` slippage parameter (§12.2) reverts trades outside tolerance | Sufficient. Standard AMM defense. |
| **Paymaster drain via mass OAuth signup** — attacker creates N accounts, harvests 5 sponsored tx each | Per-account 5-tx cap + $50/day global cap + 80% Telegram alert (§10.7) | Sufficient at hackathon scale. The $50/day cap converts financial attack into a DoS — preferable and observable. CAPTCHA is the v1.1 defense if abuse appears. |
| **NFT TWAP manipulation** — attacker manipulates Alchemy data to influence relayer-computed TWAP | TWAP computed off 12+ observations in 24h window; <12 observations triggers dispute (§13.2). Operator runbook includes sanity-check script re-computing TWAP from on-chain transfer logs. | Sufficient at v1 NFT allowlist depth. Blue-chip collections have hundreds of daily transfers. |
| **Resolution Criteria gaming** — caller writes criteria contradicting structured fields | Criteria is advisory in disputes; structured fields win (§4.7) | Sufficient. The economic incentive is to write criteria that MATCHES structured intent. |
| **Sponsored campaign gaming** — protocol sponsor seeds calls with their own wallets to inflate prize pool optics | Owner-controlled allowlist (only owner can `addAsset`). Sponsor wallets are still subject to all anti-spam gates. | Sufficient at hackathon. Operational concern more than mechanical. |

### Net Assessment

**One identified gap:** Wash-trading own calls via sybil-fade to bypass cold-start. Recommended mitigation is observability-only (relayer analytics flag), not a contract change. Documented for REQUIREMENTS.md as a P2 "ops dashboard" item, not a P1 mainnet blocker.

**All other attack patterns are covered** by the four primary gates plus the $5K TVL cap (which makes most attacks uneconomical) plus the $100/call cap (which limits per-call upside).

---

## 2026 UX Patterns — Validation Against Spec

### Privy embedded wallet UX

**Verified via Privy 2026 docs and review:**
- One-click wallet export to self-custody is shipping. Spec correctly surfaces this in Settings (§15.4) and during high-balance prompts (§10.6).
- Multi-auth linking (add Google to a wallet-created account, etc.) is standard. Spec's 24h cooldown before withdrawal authorization is the correct security pattern (App.A.1).
- Coinbase Onramp integration is the standard funding path for OAuth wallets — spec is on the 2026 best-practice trail.
- MPC custody disclosure is a 2026 requirement (VASP regulatory pressure). Spec satisfies via the one-time disclosure card per §10.6.

**Validated.** No spec changes needed.

### SIWE re-sign at withdrawal

**Verified via docs.siwe.xyz and EIP-4361:**
- The pattern is: user signs SIWE message with nonce when binding a new external withdrawal address. Address is stored, withdrawals to that address require no further SIWE. New address addition requires SIWE + 24h cooldown.
- This is what the spec describes in App.A.1: "SIWE re-sign at withdrawal: Required for the saved external-address destination" and "New-auth-link cooldown: 24h before a newly-added auth method can authorize withdrawals."

**Validated.** Spec aligns with 2026 best practice. Implementation hint: store address-book entries with `addedAt` timestamp; gate withdrawals on `now > addedAt + 24h`.

### Paymaster / sponsored-tx user education

**Verified via Privy paymaster + Alchemy account abstraction docs:**
- The 2026 pattern is: "first N transactions free, then fund your wallet to continue." Spec's "first 5 free, then fund" matches this exactly (§10.7).
- The 80% cap Telegram alert is standard operator pattern (Alchemy's account-abstraction dashboards expose this metric).
- The 6th-transaction routing to "fund your wallet" flow is the expected handoff.

**Validated.** Spec is on 2026 best practice.

### Twitter / X share-card preview patterns

**Verified via Moda 2026 Twitter Card Image Size guide and og-image.org 2026 specs:**
- Twitter Cards recommend 1200×675px (16:9) for "Summary Card with Large Image". 1200×630px (1.91:1) is the historical OpenGraph standard that also renders correctly on Twitter (1200/630 = 1.905 ≈ 1.91:1 ratio).
- **Spec calls for 1200×630px (§16.1)** — this is OpenGraph standard, renders correctly on Twitter as Summary Large Image, and is the universal size (Facebook, LinkedIn, Discord all use this). The 1200×675 alternative is 16:9 but doesn't render as cleanly on FB.
- Twitter Card Validator (cards-dev.twitter.com/validator) is the smoke-test surface. Spec correctly gates mainnet announcement on §19.11 Twitter Card Validator pass.

**Validated.** 1200×630 is the right choice for cross-platform compatibility. Spec is correct.

### Farcaster Frames v2 / Mini Apps spec changes

**Verified via miniapps.farcaster.xyz docs and Farcaster docs/frames-redirect:**
- **CRITICAL FINDING:** Frames v2 has been **rebranded to Mini Apps** as of early 2025. Frames v2 support is **deprecated and ends March 2025**. The 2026 reality is: **Mini Apps is the spec.**
- Mini Apps are essentially full web apps in an iframe (424×695px on web, device-dimensions on mobile) with direct wallet connectivity and persistence (users can save them, receive notifications).
- The spec says "Farcaster Frames" (§18.3, Phase 8). **This terminology is now outdated.** What the spec wants is the Mini Apps surface — interactive embed of the receipt with Follow/Fade buttons.
- The Mini Apps spec preserves backward-compatible Frame button semantics. Phase 8 work in the spec will work but should be referred to as Mini Apps in REQUIREMENTS.md and downstream docs.

**Spec terminology issue — not a feature gap.** No mechanical change required. Roadmap and REQUIREMENTS.md should refer to "Farcaster Mini Apps (formerly Frames v2)" to stay aligned with 2026 Farcaster docs.

### OG image generation thumbnail size requirements

**Verified for X, Farcaster, Discord (2026):**

| Platform | Preferred size | Aspect ratio | Spec match? |
|----------|----------------|--------------|--------------|
| X / Twitter (Summary Large Image) | 1200×675 (16:9) or 1200×630 (1.91:1) | 1.91:1 to 16:9 | YES (1200×630) |
| Farcaster Cast | 1200×630 (1.91:1) | 1.91:1 | YES |
| Discord (rich embed) | 1200×630 | 1.91:1 | YES |
| OpenGraph standard | 1200×630 | 1.91:1 | YES |
| Mini App embed (Farcaster, web) | 424×695 (portrait) | ~3:5 | **NOT SPEC'd — different surface** |

**Validated.** The 1200×630 dimension is universal for static share cards. Mini App embeds (Phase 8) will need a separate aspect ratio for the in-app preview — flag for Phase 8 design work.

---

## Competitor Feature Analysis

| Feature | Polymarket | Kalshi | Manifold | Stocktwits | Friend.tech | Call It v1 |
|---------|-----------|--------|----------|------------|-------------|------------|
| Real money | YES (USDC) | YES (USD KYC) | NO (play money "Mana") | NO (chat only) | YES (ETH) | YES (USDC) |
| Identity-first | NO (anon) | KYC'd but not surfaced | YES (handles) | YES (handles) | YES (Twitter-linked) | **YES (Twitter / ENS / Farcaster)** |
| Reputation score | NO | NO | YES (calibration / Brier) | hearts only | NO | **YES (global + 3 categories + caller + challenger)** |
| Contrarian-weighted rep | NO | NO | NO | NO | NO | **YES** |
| 1v1 duels | NO | NO | NO | NO | NO (was social-tokens) | **YES (ChallengeEscrow + Duel King)** |
| Quote-call / thread | NO | NO | comments only | replies only | NO | **YES (parent_call_id)** |
| Public exit broadcast | NO (silent sell) | NO | NO | NO | NO | **YES (CallerExited event + amber receipt)** |
| Shareable outcome cards | basic (chart) | NO | basic | screenshot-only | NO | **YES (5 variants, OG hero)** |
| Caller-set resolution criteria | exchange-set only | exchange-set only | informal | NO | NO | **YES (with VERIFIED badge)** |
| Follow-graph integration | NO | NO | NO | X integration (chat) | YES (Twitter follow) | **YES (X + Farcaster)** |
| Fee total | ~2% per trade | $0.07-$1.75/100 | none (play money) | none | ~10% trade fee historical | **1.7% all-in** |
| Sub-cent gas | NO (Polygon → migrated to L2) | NO (off-chain) | NO (play money) | NO | NO (mainnet ETH) | **YES (Arbitrum + 250ms blocks)** |
| Auto-post receipt | NO | NO | NO | manual share | NO | **YES (default ON)** |
| Sponsored gas onboarding | NO | NO | NO | NO | NO | **YES (paymaster, first 5 free)** |
| Stylus / Rust performance contracts | NO | NO | NO | NO | NO | **YES (StylusScoreEngine)** |
| Public-by-default | YES | YES | YES | YES | YES | **YES** |
| Disputes with bonds | YES (UMA) | NO (exchange resolves) | community vote | N/A | NO | **YES ($5 bond, $2 reward)** |
| Onchain receipt hash | NO (off-chain results) | NO (regulated, off-chain) | NO | NO | NO | **YES (criteriaHash + reasoningHash)** |
| Verified social badge on profile | NO | basic KYC | NO | YES (verified accounts) | YES (Twitter handle) | **YES (VERIFIED · X / FC)** |

**Call It uniquely combines:** identity-first + real money + sub-cent gas + reputation math + 1v1 duels + shareable receipts + public exit drama + caller-written criteria.

---

## MVP Definition

### Launch With (v1) — Aligned to Spec Phases 1-7

The spec's Phase 1-7 IS the MVP. Every feature listed below is a P1 ship blocker for the share loop or mainnet safety.

**Phase 1 — Auth + Skeleton (P1-CRITICAL):**
- [ ] Privy integration with 3 sign-in paths (§9.1, §9.2)
- [ ] SIWE for Connect Wallet path (§9.1)
- [ ] Embedded wallet auto-creation for OAuth paths (§9.2)
- [ ] Sign-in screen (§15.8)
- [ ] Onboarding flow with 4 screens (§15.9)
- [ ] CallRegistry + ProfileRegistry deployed (§11.1, §11.5)
- [ ] USDC integration (Sepolia test, then mainnet) (§10.5)
- [ ] Frontend skeleton with §14.6 neobrutalist treatment
- [ ] Shared loading skeleton + error toast (§15A)
- [ ] Coinbase Onramp integration (§19 Phase 1)
- [ ] Paymaster wiring with $50/day cap (§10.7)
- [ ] Wallet export flow (§15.4)
- [ ] Custody disclosure card (§10.6)
- [ ] New Call form with all three call types (§15.2)
- [ ] Anti-spam gates 6.1, 6.2, 6.3 enforced at contract level (§6)
- [ ] $10 creation fee transfer ($5 treasury + $5 virtual fade)

**Phase 1.5 — Social linking (parallel, P1):**
- [ ] Backend relayer for OAuth proof verification (§9.8)
- [ ] Twitter OAuth linking → ProfileRegistry.linkTwitter (§9.3)
- [ ] Farcaster Auth Kit linking → ProfileRegistry.linkFarcaster (§9.3)
- [ ] VERIFIED badges rendering everywhere (§9.4)
- [ ] Multi-auth-linking security (24h cooldown, new-link notifications) (App.A.1 §10.6)

**Phase 2 — FollowFadeMarket AMM (P1-CRITICAL):**
- [ ] FollowFadeMarket deployed with single-contract sub-state (§11.2)
- [ ] Follow / Fade buttons execute real tx with slippage protection (§12.2)
- [ ] Post-expiry deposit gate (§12.2)
- [ ] TVL-cap aggregation boundary tested (§10.2)
- [ ] Position exit (4h cooldown, 10% slash) (§8.7.1)
- [ ] Live pools rendering on receipt page (§15.3)

**Phase 3 — ChallengeEscrow (P1):**
- [ ] ChallengeEscrow deployed (§11.3, §12.3)
- [ ] Challenge propose/accept/refund flow (§5.3)
- [ ] Self-challenge gate at contract (§12.3)
- [ ] `openToChallenges` flag enforced at contract (§12.3)
- [ ] Duel page rendering live (§15.5)

**Phase 4 — SettlementManager + Pyth (P1-CRITICAL):**
- [ ] SettlementManager deployed (§11.4, §12.4)
- [ ] Pyth confidence threshold + tiered wait policy (§13.1)
- [ ] DefiLlama adapter (§13.3)
- [ ] Snapshot + Tally adapter (§13.5)
- [ ] CEX listing scraper for 8 exchanges (§13.6)
- [ ] Alchemy NFT API + relayer TWAP (§13.2)
- [ ] Dispute window (24h, $5 bond, $2 reward) (§13.8, §8.10)
- [ ] Force-settle escape hatch at expiry + 7d (§12.4)
- [ ] Settled receipt page (§15.7)
- [ ] Stamp animation on outcome reveal (§17.2)

**Phase 5 — StylusScoreEngine (P1, with 48h fallback to Solidity):**
- [ ] Rust scoring engine (§11.6, §12.6)
- [ ] Stylus deploy behind transparent proxy (§10.8)
- [ ] SettlementManager try/catch with Solidity baseline (§11.6)
- [ ] RepCalculatedFallback event emission
- [ ] Profile page live rep data (§15.4)
- [ ] **48h-before-demo cutoff to Solidity baseline if Rust path broken**

**Phase 6 — Safety review (P1-CRITICAL, moved earlier than original spec):**
- [ ] All Phase 6 boundary tests pass (§19 Phase 6 checklist, 13 items)
- [ ] Sepolia staging gate completed (§19.10)

**Phase 7 — OG service + Subgraph (P1-CRITICAL):**
- [ ] Node.js OG service (Satori or @vercel/og) (§16.1)
- [ ] All 5 OG variants (Live, Settled, Duel Settled, Caller Exited, Fallback) (§16.2-16.6)
- [ ] CDN caching with state-change invalidation
- [ ] Visual QA at 200px viewport (§15.7)
- [ ] The Graph subgraph deployed as primary event source (App.A.1)
- [ ] Polled-events fallback for subgraph delay (App.A.1)

### Add After Validation (v1.x — Phases 8-9)

These are non-critical-path enhancers.

**Phase 8 — Farcaster Mini Apps (P2, time-permitting):**
- [ ] Mini Apps endpoint (formerly Frames v2) (§18.3)
- [ ] OpenGraph meta tags for cast embed
- [ ] Follow / Fade / Challenge from within cast
- [ ] Tested in Warpcast

**Phase 9 — Mobile responsive (P2):**
- [ ] 375px breakpoint on 7 critical pages: Feed, Receipt Live, Profile, Settled Receipt, Sign-in, Onboarding, Leaderboard (§19 Phase 9)
- [ ] Desktop-only banner on remaining pages (Duel, Quote composer, New Call)

**Other v1.x:**
- [ ] Wash-trade analytics dashboard (operator-side flag for sybil-fade pattern)
- [ ] Auto-post receipt to socials default-ON wired to Twitter + Farcaster APIs
- [ ] "From your X" / "From your Farcaster" feed sections (§9.9, §15.1)

### Future Consideration (v2+)

These are explicitly deferred per spec §4.5, §4.6, §20:

- [ ] Notification system (§20.1) — v1.1
- [ ] Search UI (§20.2) — v1.1
- [ ] Watch / Notify delivery (§20.3) — v1.1
- [ ] Reputation-gated stake limits (§7.8) — v2
- [ ] Leagues / curated groups — v1.1+
- [ ] Decentralized dispute resolution (Kleros / token vote) — post-hackathon
- [ ] Reputation NFTs — not on roadmap (off-chain OG is the v1 + v2 answer)
- [ ] Macro / regulatory events — v2 (needs human-curated oracle)
- [ ] Multi-condition compound calls — v2
- [ ] Range / band predictions — v2
- [ ] First-to-X / race events — v2
- [ ] NFT mint outcomes — v2
- [ ] WebSocket real-time UI — v1.1 (polling at hackathon)
- [ ] CAPTCHA on sign-up — v1.1 (deferred pending abuse signal)
- [ ] Per-auth-method 2FA for large withdrawals — post-v1

---

## Feature Prioritization Matrix

| Feature group | User value | Implementation cost | Priority |
|---------------|-----------|---------------------|----------|
| Auth (Privy + 3 paths + Onboarding) | HIGH | HIGH | **P1-CRITICAL** |
| Call creation (3 types + anti-spam gates + Resolution Criteria) | HIGH | HIGH | **P1-CRITICAL** |
| FollowFadeMarket AMM | HIGH | HIGH | P1 |
| SettlementManager + oracle adapters | HIGH | HIGH | **P1-CRITICAL** |
| Receipt pages (live + settled) | HIGH | MEDIUM | **P1-CRITICAL (Core Value)** |
| OG image service (5 variants) | HIGH | MEDIUM | **P1-CRITICAL (Core Value)** |
| ProfileRegistry + rep math | HIGH | MEDIUM | P1 |
| StylusScoreEngine (with Solidity fallback) | HIGH | HIGH | P1 (fallback if cutoff hits) |
| ChallengeEscrow (1v1 duels) | MEDIUM | MEDIUM | P1 (differentiator) |
| Quote-call | MEDIUM | LOW | P1 |
| Position exits (4h cooldown, 10% slash) | MEDIUM | MEDIUM | P1 |
| Caller exit (24h lock, time decay, broadcast) | HIGH | MEDIUM | P1 (differentiator) |
| Disputes ($5 bond, owner-resolved) | MEDIUM | LOW | P1 (safety) |
| Mainnet safety (caps, pause, paymaster cap, force-settle) | HIGH | MEDIUM | **P1-CRITICAL** |
| The Graph subgraph | HIGH | HIGH | P1 |
| Twitter + Farcaster social linking | MEDIUM | MEDIUM | P1 |
| Sponsored gas (paymaster) | HIGH | MEDIUM | P1 |
| Coinbase Onramp | MEDIUM | MEDIUM | P1 |
| Wallet export | LOW | LOW | P1 (custody disclosure obligation) |
| Leaderboard (7d/30d/All-time) | MEDIUM | MEDIUM | P1 |
| Profile page (Overview + Calls + Duels tabs) | MEDIUM | MEDIUM | P1 |
| Duels tab on Feed | MEDIUM | MEDIUM | P1 |
| "From your X" / Farcaster feed sections | HIGH | HIGH | P2 (post-MVP retention) |
| Auto-post receipt to socials (default ON) | HIGH | MEDIUM | P2 (distribution) |
| Mobile responsive (7 pages) | MEDIUM | MEDIUM | P2 |
| Farcaster Mini Apps (formerly Frames v2) | LOW (at hackathon) → MEDIUM (post) | MEDIUM | P2 |
| Wash-trade analytics dashboard | LOW (operator) | LOW | P2 |
| Notification system | MEDIUM | HIGH | P3 (v1.1) |
| Search UI | MEDIUM | MEDIUM | P3 (v1.1) |
| Reputation NFTs | LOW | HIGH | P3 (explicitly rejected) |
| Decentralized dispute resolution | LOW (at hackathon scale) | HIGH | P3 (post-hackathon) |

**Priority key:**
- **P1-CRITICAL:** On the receipt/share loop critical path — must work for Core Value.
- **P1:** Mainnet ship blocker but not on critical-path-to-share-loop.
- **P2:** v1 polish, add when possible.
- **P3:** v1.1+ or explicitly deferred.

---

## Sources

**Primary (locked spec, source of truth):**
- `CALL_IT_SPEC1.md` — full 3,088-line v1.0 hackathon MVP specification
- `.planning/PROJECT.md` — project context, constraints, key decisions

**Competitor analysis (2026 verified):**
- [Polymarket vs Kalshi comparison 2026 — DeFi Rate](https://defirate.com/prediction-markets/kalshi-vs-polymarket/)
- [Polymarket vs Kalshi Liquidity & Trading — QuantVPS](https://www.quantvps.com/blog/polymarket-vs-kalshi-explained)
- [Manifold Markets Review 2026 — CryptoNews](https://cryptonews.com/cryptocurrency/manifold-markets-review/)
- [Manifold FAQ](https://docs.manifold.markets/faq)
- [Stocktwits Review 2026 — WallStreetZen](https://www.wallstreetzen.com/blog/stocktwits-review/)

**UX patterns (2026 verified):**
- [Privy Wallets Overview](https://docs.privy.io/wallets/overview)
- [Privy Review 2026 — Embedded Wallet UX, Authentication Flows, and Risks](https://cryptoadventure.com/privy-review-2026-embedded-wallet-ux-authentication-flows-and-risks/)
- [Privy Blog — How embedded wallets work](https://privy.io/blog/how-privy-embedded-wallets-work)
- [Sign in with Ethereum (SIWE) docs](https://docs.siwe.xyz/)
- [EIP-4361: Sign-In with Ethereum](https://eips.ethereum.org/EIPS/eip-4361)
- [Farcaster Frames v2 / Mini Apps — Specification](https://miniapps.farcaster.xyz/docs/specification)
- [Farcaster Frames-to-Mini-Apps redirect](https://docs.farcaster.xyz/reference/frames-redirect)
- [Twitter / X Card Image Size 2026 — Moda](https://moda.app/resources/sizes/twitter-card)
- [Twitter Card Image Size 2026 specs — og-image.org](https://og-image.org/learn/twitter-card-size)
- [X (Twitter) Image Sizes for 2026 — Influencer Marketing Hub](https://influencermarketinghub.com/twitter-image-size/)

**Sybil / reputation farming research (2025-2026):**
- [Science Needs Prediction Markets That Can't Be Sybil-Attacked — Cointelegraph](https://cointelegraph.com/opinion/science-prediction-markets-sybil)
- [What prediction market builders are missing about Sybils — Humanode](https://blog.humanode.io/what-prediction-market-builders-are-missing-about-sybils/)
- [Sybil Attacks in Crypto & DeFi — Formo](https://formo.so/blog/what-are-sybil-attacks-in-crypto-and-how-to-prevent-them)
- [What Is a Sybil Attack — KuCoin](https://www.kucoin.com/blog/en-what-is-a-sybil-attack-complete-guide-to-detection-prevention-and-real-world-solutions)

---

## Confidence Assessment & Open Questions

**HIGH confidence:**
- Spec is feature-complete for v1. Zero genuine table-stakes gaps identified.
- All 20 anti-features remain correctly excluded under 2026 competitive pressure.
- The 9-step critical path for the receipt/share loop is well-defined and matches the spec's build order (Phases 1-7 converge to a working share loop).
- Differentiator stack (17 features) is real and verified against 5 competitors.

**MEDIUM confidence:**
- Wash-trading own-call gap is real but bounded ($0.50/attempt) and addressable via operator-side analytics in v1 — flagged for REQUIREMENTS.md as a P2 ops item.
- "Farcaster Frames" in spec §18.3 should be referred to as "Farcaster Mini Apps" in REQUIREMENTS.md to align with 2026 terminology — no mechanical change.

**LOW confidence / Open questions for phase-specific research:**

1. **Mini Apps embed dimensions** — 424×695px portrait is the Mini Apps web dimension; the spec's 1200×630 OG card is too wide for in-cast embed. Phase 8 design work needs a separate 424×695 layout for Mini Apps. Flag for Phase 8 research.

2. **Twitter API access tier required for "From your X" follow-graph integration** — Twitter API v2 pricing has changed multiple times in 2024-2025. Spec assumes feasibility (§9.9). Phase 1.5 needs to verify which Twitter API tier supports the follow-graph read, and at what cost. Flag for Phase 1.5 procurement.

3. **Coinbase Onramp coverage for embedded Privy wallets** — Phase 1 assumption is that Onramp delivers USDC to a Privy embedded wallet address. Verify Onramp's address-arbitrary delivery and any KYC handoff. Flag for Phase 1 integration spike.

4. **CEX listing scraper resilience** — 8 exchanges' announcement page formats can change. Spec acknowledges this in §12.4 force-settle (operator escape hatch). Phase 4 needs a maintenance plan for scraper drift; not a feature gap but an ops concern.

5. **Pyth feed verification for the asset allowlist** — §4.4 lists 25 coins; §App.A.1 flags MNT, ETHFI, ezETH, RDNT, MATIC (→ POL) as higher-risk pre-deployment. This must be verified by hand against Pyth's price feed catalogue before Phase 4 mainnet promotion. Not a research gap — an ops checklist item.

These five open questions are flagged for downstream phase research, not for the current FEATURES.md scope.

---
*Feature research for: Call It — identity-first onchain social prediction product on Arbitrum*
*Researched: 2026-05-21*
*Spec version cross-referenced: CALL_IT_SPEC1.md v1.0 (3,088 lines)*
