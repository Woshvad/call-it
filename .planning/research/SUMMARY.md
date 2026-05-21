# Research Synthesis — Call It

**Date:** 2026-05-21
**Source files:** `STACK.md` · `FEATURES.md` · `ARCHITECTURE.md` · `PITFALLS.md`
**Spec source of truth:** `CALL_IT_SPEC1.md` v1.0 (3,088 lines)

---

## TL;DR

Call It is a person-first onchain social prediction product on Arbitrum mainnet with a 6-contract Solidity+Stylus topology, a 9-step receipt/share loop as Core Value, and a real-money $5K-TVL-cap v1 that must ship hackathon-ready AND mainnet-grade in the same build. The four research files validate the locked spec end-to-end: zero feature gaps found vs 2026 competitors, the stack pins cleanly to current versions, the architecture has no cycles, and the dispute / settlement / pause / force-settle paths are production-shaped. The four most consequential research outputs are (a) **18 spec gaps** ranging from Solidity pragma pinning to relayer key separation to US-jurisdiction ToS, (b) a **roadmap re-ordering recommendation** that promotes multisig from v1.1 to Phase 6 and pulls subgraph/OG service into Phase 0 alongside foundation work, (c) **8 spec corrections** required before deploy (POL replaces MATIC, RENDER replaces RNDR, Solidity `=0.8.30` exact pin, openzeppelin-stylus `=0.3.0` pin, Solidity-front transparent proxy + Stylus-impl, Mini Apps replaces Frames v2, multisig earlier, Solidity baseline rep delta shipped in Phase 4 not Phase 5), and (d) **operational budget items the spec is silent on** totaling ~$175/mo recurring + ~$150-300 upfront (X API Basic, The Graph publishing GRT, KMS, Better Stack, Pinata, Redis). The roadmap must converge Phases 1-7 on a working 9-step share loop before Phase 8 (Mini Apps) and Phase 9 (mobile responsive) — the receipt is the entire product. Confidence is HIGH on the build plan; MEDIUM areas are Stylus alpha-line crate stability, OAuth-takeover withdrawal velocity, and CFTC regulatory landing.

---

## Project Shape

Call It lets a user stake USDC ($5–$100) on three call types (price target, spread/vs, event/binary with 7 subtypes) and produces a permanent, person-tied receipt that travels as a shareable OG card on Twitter and Farcaster. Others can Follow, Fade (parimutuel AMM), Challenge (1v1 duel), or Quote-call. A Stylus/Rust reputation engine behind a transparent proxy applies confidence × contrarian multipliers (with high-conviction asymmetry and cold-start adjustments) at settlement. Settlement reads Pyth (coins, 0.5% confidence threshold, 30 retries × 60s), Alchemy NFT API (24h relayer-computed TWAP, ≥12 observations), DefiLlama (TVL/Volume/Fees/APRs), direct RPC (on-chain metrics), Snapshot/Tally (governance), and Playwright CEX-listing scrapers across 8 exchanges. Five OG card variants (Live, Settled, DuelSettled, CallerExited, Fallback) render via @vercel/og + Satori on Node runtime. The product is **person-first** — every call is a public commitment tied to a named reputation, filling the gap between accountability-free Crypto Twitter and anonymous-position Polymarket.

---

## Stack Summary (Pinned Versions Subset)

| Layer | Tech | Version | Verdict |
|---|---|---|---|
| Network | Arbitrum One | mainnet | Validates — sub-cent fees + 250ms blocks + Stylus |
| Solidity | solc | **`=0.8.30` exact** (NOT `^0.8.24`) | Avoid `0.8.28–0.8.33` IR storage-clearing bug |
| OZ Contracts | @openzeppelin/contracts | `5.6.1` | Standard; Ownable2Step for single-owner-key sensitivity |
| Stylus | stylus-sdk | `0.10.7` | Production-ready May 2026; keep 48h fallback |
| Stylus | cargo-stylus | `0.6.3` | Standard install |
| Stylus | openzeppelin-stylus | **`=0.3.0` exact** | Alpha line; Solidity TransparentProxy front + Stylus impl |
| Frontend | next | `16.2.6` | App Router; Node runtime for OG (NOT edge) |
| Frontend | react | `19.x` | Bundled with Next 16 |
| Auth | @privy-io/react-auth | `3.27.0` | v3 breaking line; do not mix v2 examples |
| Auth | @privy-io/wagmi | `1.32.5` | NOT `@privy-io/wagmi-connector` (legacy v1) |
| Chain | wagmi / viem | `2.18.0` / `2.50.4` | Modern standard |
| Chain | @tanstack/react-query | `5.100.11` | Peer dep for wagmi v2 |
| Backend | fastify | `5.6.1` | Long-running relayer; not Vercel functions |
| OG | @vercel/og + satori | `0.11.1` / `0.26.0` | Flexbox only; grid silently misrenders |
| Oracle | @pythnetwork/pyth-sdk-solidity + hermes-client | `4.3.1` / `3.1.0` | Pull model; budget ETH fee + multicall |
| NFT | alchemy-sdk | `3.6.5` | Replaces sunset Reservoir; ETH-mainnet floors only |
| Indexer | @graphprotocol/graph-cli | `0.98.1` | Studio → Decentralized Network on Arbitrum |
| Farcaster | @farcaster/auth-kit | `0.8.2` | Optional FC link path |
| Currency | Native USDC | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | NOT bridged USDC.e |
| Pyth | EVM contract | `0xff1a0f4744e8582DF1aE09D5611b887B6a12925C` | Arbitrum One |

---

## Feature Roll-up

- **65 table-stakes features** across Auth/Identity, Call Creation/Anti-Spam, Social Actions, Reputation/Settlement, Sharing/Receipts, Discovery/Feed, Design System, Mainnet Safety/Ops — **all present in spec; zero genuine gaps**.
- **17 differentiators** that compound: identity-first calls, conviction × contrarian math, high-conviction asymmetry (2× at ≥85%), public Caller Exit broadcast, Stylus-Rust scoring, 5-variant OG receipts, neobrutalist visual, 1v1 duels + Duel King badge, quote-calls, 3-category rep, cold-start adjustment, VERIFIED CRITERIA, "From your X" follow-graph, Caller Exit share card, auto-post on settle, 1.7% extraction vs 2-5% competitors. No single competitor matches the **combination**.
- **20 anti-features explicitly excluded** (social engagement events, personal predictions, macro/regulatory v1, multi-condition compound, range/band, first-to-X, NFT mint outcomes, decentralized dispute resolution, reputation NFTs, leagues, rep-gated stakes, notification delivery, search UI, mobile-responsive non-critical pages, WebSocket real-time, CAPTCHA, per-auth 2FA, second auth provider, watch/notify delivery, MetaMask backup) — **zero need reconsideration for v1**.

**Critical path:** 9 steps that MUST all work for Core Value to hold. Sign-up → Fund → Paymaster-sponsored first tx → Compose → Publish → Live receipt renders → Settlement → Settled receipt renders → Share to X/FC → New user loops back. Break at any step kills the product. Phases 1-7 must converge here; Phases 8 (Mini Apps) and 9 (mobile responsive) are enhancements, not enablers.

---

## Architecture Roll-up

### Six Contracts (Solidity + one Stylus)

1. **CallRegistry** — call state, anti-spam gates (Gates 6.1-6.3), allowlist enforcement, caller exit. Owns the `mapping(uint256 => Call)`, duplicate-hash mapping, TVL cap, pause flag.
2. **FollowFadeMarket** — single contract holds AMM sub-state per `callId` (per §11.2 lock; per-call proxies rejected — saves ~50k gas, simplifies TVL aggregation). Slippage-protected via `minSharesOut`; 4h cooldown + 10% slash on position exit.
3. **ChallengeEscrow** — 1v1 duel escrow, self-challenge ban, 24h accept window, refund path. Reads `openToChallenges` flag from CallRegistry at contract level (not just UI).
4. **SettlementManager** — the integration hub. Dispatches oracle adapter per (marketType, eventSubtype); try/catches Stylus → Solidity baseline fallback (in-contract from day 1); 24h dispute window + $5 USDC bond + max 3 counter-claims; `forceSettle` at expiry + 7d (owner-only); 14-step atomic settle.
5. **ProfileRegistry** — terminal rep + social-identity store. Written by SettlementManager (`updateAfterSettlement`), relayer (`linkTwitter`/`linkFarcaster`), users (`unlinkX/FC`), owner (rotate authorized SettlementManager/relayer).
6. **StylusScoreEngine** — stateless Rust reputation math behind Solidity `TransparentUpgradeableProxy`. Same proxy slot accepts Solidity baseline at the 48h cutoff. Storage lives in ProfileRegistry, not the engine.

### Three Data Planes

- **Write plane** — UI → wallet (Privy embedded) → contract. ReentrancyGuard, allowlist, TVL/stake caps, pause-with-carve-out for withdraw/claim.
- **Read plane** — Contract events → The Graph subgraph → UI. Polled-events fallback via viem `getLogs` at 5s interval during subgraph deploy gaps (48-72h post-publish).
- **Attestation plane** — Relayer signs and submits NFT TWAP, DefiLlama, CEX, Snapshot, OAuth-proof data. The biggest trust surface in v1.

### Six Trust Boundaries

1. **Pyth pull** — trustless from our side; publisher collusion is universal Pyth risk.
2. **Alchemy NFT TWAP (relayer-signed)** — compromise → forged NFT settlements; bounded by $100/call + $5K TVL + ≥12 observation gate.
3. **DefiLlama / Snapshot / CEX (relayer-signed)** — same key class; per-attestation-type key separation recommended.
4. **OAuth proof verification (relayer-signed)** — compromise → forged VERIFIED · X / FC badges; no mechanical effect (social signal only); user can unlink directly.
5. **Owner key (single in v1)** — controls pause + setTvlCap + forceSettle + Stylus proxy admin + SettlementManager/relayer rotation; **the single largest risk surface**; multisig promotion recommended in Phase 6 (not v1.1).
6. **Privy custodial wallets** — MPC custody until export; one-time disclosure card; $50 balance prompts export.

### Build DAG (with Phase 0 added)

Phase 0 (foundation, always live) → Phase 1 (ProfileRegistry + CallRegistry + Privy/auth + onboarding) → Phase 1.5 (social linking, parallel to Phase 2) → Phase 2 (FollowFadeMarket) → Phase 3 (ChallengeEscrow) → Phase 4 (SettlementManager + oracle adapters + Solidity baseline rep delta in-contract) → Phase 5 (StylusScoreEngine, 48h cutoff) → Phase 6 (safety review + Sepolia ≥48h + **multisig promotion**) → Phase 7 (OG service + Subgraph final mappings, scaffolded from Phase 0) → Mainnet deploy → Phase 8 (Mini Apps) + Phase 9 (mobile responsive, 7 pages).

---

## Risk Register — Top 10

| # | Risk | Severity | Mitigation | Owning Phase |
|---|------|----------|------------|--------------|
| 1 | Solidity `^0.8.24` floats into IR storage-clearing bug (0.8.28–0.8.33) | CRITICAL | Pin `=0.8.30` exact in `foundry.toml` AND every pragma; CI lint rejects `^` | Phase 0 |
| 2 | Single owner key compromise = total protocol seizure | CRITICAL | Safe 2-of-3 multisig + ownership transfer; **promote to Phase 6, NOT v1.1** | Phase 6 |
| 3 | Relayer signer key compromise (forges NFT TWAPs, DefiLlama, CEX, Snapshot, VERIFIED badges via single key) | CRITICAL | KMS storage; 90d rotation; per-attestation-type key separation; EIP-712 with chainId | Phase 0 + Phase 4 |
| 4 | Pyth feed IDs rotate between research and deploy → silent settlement against unrelated asset | CRITICAL | Pre-deploy CI script: fetch Hermes per asset, assert exact bytes32, fail deploy on mismatch | Phase 6 |
| 5 | Stylus build path slips past 48h cutoff | HIGH | Pre-write `upgradeTo(solidityBaseline)` BEFORE cutoff; Solidity baseline in-contract from Phase 4; hard calendar discipline | Phase 4 + Phase 5 |
| 6 | Owner-resolved dispute = Polymarket/UMA-class governance attack (centralized variant) | HIGH | `bannedFromMarkets[owner] = true` on-chain self-exclusion; 24h public commitment before forceSettle; multisig (Risk #2); public `/disputes/` log | Phase 4 + Phase 6 |
| 7 | OG image CDN cache stale post-settlement → Twitter/Discord show Live card forever | HIGH | `og:image?v={statusVersion}` cache-busting (Live URL ≠ Settled URL); CDN invalidation on state-change | Phase 7 |
| 8 | Stylus 365-day reactivation expires silently → contract uncallable, falls to baseline indefinitely with no alert | HIGH | Telegram alerts at T-30d/T-15d/T-7d/T-1d; operator runbook | Phase 0 + Phase 5 |
| 9 | Privy OAuth-takeover at withdrawal moment (24h cooldown protects new auth link, NOT compromised original Google/Twitter) | HIGH | Opt-in withdrawal cooldown (default ON for OAuth wallets); v1.1 daily cap + email confirmation | Phase 1 + v1.1 |
| 10 | CEX scraper breaks silently when exchange redesigns announcement page (8 × 6mo = certain) | HIGH | Weekly synthetic-test CI cron per exchange against known recent listing; alert on miss; modular selectors | Phase 4 + Phase 0 |

**Bonus operational risk:** paymaster $50/day cap exhausted in first hour of demo by genuine demand. Mitigation: elevate to $300/day for demo week.

---

## Spec Corrections Required

- **§13.1 Pyth feed list:** replace `POL/MATIC` with `POL` only (MATIC deprecated 2024; Hermes returns no MATIC/USD).
- **§13.1 Pyth feed list:** replace `RNDR` with `RENDER` (Pyth renamed post-token-migration; RNDR/USD returns empty).
- **§10.5 / §11.6 Solidity pragma:** change `^0.8.24` to `=0.8.30` exact in `foundry.toml` and every contract pragma (avoids `0.8.28–0.8.33` IR bug; fixed in `0.8.34+`).
- **§10.8 / §11.6 Stylus crate pin:** `openzeppelin-stylus = "=0.3.0"` exact in `Cargo.toml` (alpha line; floating unsafe).
- **§10.8 / §11.6 Stylus proxy pattern:** explicitly document "transparent-proxy via Solidity `TransparentUpgradeableProxy@5.6.1` pointing at the **stateless** Stylus implementation address." Do NOT use custom Rust proxy; do NOT use the UUPS Stylus crate as front-facing proxy in v1. Preserves §10.8 admin-separated-from-logic.
- **§10.8 operational model:** move multisig promotion from "before v1.1 / before TVL > $5K" to **Phase 6**. ~4h effort; removes day-one single-owner-key risk.
- **§11.6 Solidity baseline:** ship the Solidity baseline rep delta **in-contract from Phase 4 (SettlementManager)**, not as a Phase 5 fallback. Lets the 48h Stylus cutoff be a mechanical `upgradeTo(...)` rather than a panicked rewrite.
- **§18.3 / Phase 8 Farcaster:** rename "Farcaster Frames" to **"Farcaster Mini Apps"** (Frames v2 rebranded; 3-month deprecation notice; `fc:frame` meta tag still works for compat).

---

## Roadmap Implications (Deltas vs Spec §19)

### Delta 1 — Add explicit **Phase 0 (Foundation)**

ARCHITECTURE.md §4.2 tightening opportunity. Phase 0 ships: monorepo (pnpm + Turborepo, `apps/{web,relayer}` + `packages/{contracts,subgraph,shared,config}`), Safe multisig prep (signers identified; ownership-transfer script written), IPFS pinning (Pinata $20/mo + JWT), CDN (Vercel Edge — free), subgraph schema scaffold (entities + `subgraph.yaml` for Arbitrum Sepolia; mappings stubbed per-contract), relayer skeleton (Fastify + BullMQ + Redis + Pino + viem walletClient + health-check), monitoring stack (Better Stack $25/mo + Sentry free + Telegram alert bot with 5 dashboards), OG service skeleton + Fallback variant (works from day one). Removes the "blackout" period where contracts work but UI cannot read/share.

### Delta 2 — **Multisig promotion to Phase 6** (was v1.1)

Per Risk #2. ~4h effort, ~$50 cost. Safe 2-of-3 with operator + backup + advisor as signers. Eliminates day-one single-owner-key risk before mainnet promotion.

### Delta 3 — **Solidity baseline rep delta to Phase 4** (was Phase 5 fallback)

Per Risk #5. `SettlementManager.settle` try/catch needs a Solidity baseline target; landing in Phase 4 isolates Stylus risk. The 48h cutoff becomes `upgradeTo(soliditySolidityBaseline)` — one cast call, mechanical.

### Delta 4 — **Subgraph + OG service skeletons in Phase 0, finalized through Phase 7**

Per ARCHITECTURE.md §4.2. Subgraph mappings are per-contract — no wait-for-all-contracts dependency. Schema drafted from spec event signatures alone; mappings populate as each contract deploys (Phase 1 → CallRegistry/Profile, Phase 2 → FollowFade, Phase 3 → Challenge, Phase 4 → Settlement/Dispute). OG Fallback variant zero-contract-dependency; Live in Phase 1, DuelSettled in Phase 3, Settled + CallerExited in Phase 4. Polled-events fallback covers subgraph deploy gap.

### Delta 5 — Add **Phase 1.5 (social linking) parallel to Phase 2**

ProfileRegistry exists from Phase 1 but social linking (Twitter/Farcaster OAuth proof → relayer-signed `linkTwitter`/`linkFarcaster`) can run in parallel with FollowFadeMarket build. Unblocks VERIFIED badges earlier.

### Suggested Phase Map (post-deltas)

| Phase | Name | Critical Path Steps Owned | Top Pitfalls Mitigated |
|---|---|---|---|
| **0** | Foundation (always live) | Repo, multisig prep, IPFS, CDN, subgraph schema, relayer skeleton, monitoring, OG fallback | #1, #3, #8, #10 |
| **1** | Core contracts + auth + frontend skeleton | Steps 1, 2, 3 (Sign-up, Fund, Paymaster) | #9, #11 |
| **1.5** | Social linking (parallel to Phase 2) | Step 1 enrichment (VERIFIED badges) | — |
| **2** | FollowFadeMarket | Product completeness | — |
| **3** | ChallengeEscrow | Distribution-critical | — |
| **4** | SettlementManager + oracle adapters + Solidity baseline rep delta | Steps 4, 5, 7 (Compose, Publish, Settle) | #4, #5, #6, #10 |
| **5** | StylusScoreEngine + 48h cutoff | Step 7 enhancement | #5, #8 |
| **6** | Safety review + Sepolia ≥48h + multisig promotion | Pre-mainnet gate | #2, #4, #6 |
| **7** | OG service final variants + Subgraph final mappings | Steps 6, 8, 9, 10 (Live, Settled, Share, Loop) | #7 |
| **Mainnet** | Promote per §19.10 + §19.11 | All 10 steps live | — |
| **8** | Farcaster Mini Apps (rename, time-permitting) | Distribution extension | — |
| **9** | Mobile responsive (7 critical pages) | Share-link landing experience | — |

---

## Operational Budget Items (Spec is Silent)

| Item | Cost | Phase | Why |
|---|---|---|---|
| **X API Basic tier** | $100–$200/mo (volatile) | Phase 1.5 + Phase 7 | "From your X" follow-graph + auto-post on settle. Free tier per-endpoint 24h windows too restrictive. Degradable: 1h → 24h → disable. |
| **The Graph publishing GRT** | $100–$300 upfront | Phase 6 (mainnet) | Studio is free; **publishing to Decentralized Network requires curating ~3,000 GRT** for indexers. Studio-only misses SLA. |
| **KMS / secret manager for relayer keys** | $0–$5/mo (AWS KMS pay-per-use; Fly.io secrets free) | Phase 0 | Risk #3. Relayer key in env file unacceptable for mainnet. |
| **Better Stack (monitoring + logs + alerts)** | $25/mo | Phase 0 | Cheaper than Grafana Cloud at v1 scale; smoother Pino integration. Hosts 5 required dashboards. |
| **Pinata (IPFS pinning)** | $20/mo paid tier | Phase 0 | Reasoning + criteria + dispute evidence. Paid for uptime SLA on dedicated gateway. |
| **Redis (BullMQ backing + DefiLlama cache)** | $5/mo (managed) | Phase 0 | Free tier 30MB ceiling trips on 1000 delayed Pyth retries. |
| **Pyth update VAA ETH fees** | ~$0.01 per settle = $10/day at 1000 settles | Phase 4 | Pre-deposit 0.5 ETH; monitor separately from USDC. |
| **Sentry error tracking** | $0 free tier | Phase 0 | Sufficient for hackathon scale. |
| **Arbiscan API key** | $0 free | Phase 0 | For `forge verify-contract` automated verification. |
| **Alchemy paid tier (upgrade for demo week)** | optional ~$49/mo | Phase 6 (demo) | Free 330 req/sec may throttle during live demo; revert after. |

**Recurring monthly minimum (production):** ~$175/mo. **Upfront one-time:** ~$150-300. **Optional demo-week add:** ~$50.

---

## Open Questions for Downstream Phase Research

1. Privy `subjectId` collision behavior — do same-OAuth-account paths produce same DID? (Phase 1)
2. Real-world Pyth confidence histograms per long-tail allowlist asset — pull 1-week data; tighten allowlist if median >0.3%. (Phase 4)
3. Stylus mainnet vs Sepolia gas-cost parity — STACK says "marginally cheaper" for simple math; verify before pitching judges. (Phase 5)
4. CFTC final rule timing — public comment closed April 2026; final rule could land mid-build. Monitor `cftc.gov`.
5. Arbitrum sequencer time monotonicity — verify in Phase 6 boundary testing.
6. The Graph Decentralized Network query latency under demo-day load — p99 for feed queries.
7. Twitter Card Validator + Discord embed cache TTL empirical behavior — verify `?v={statusVersion}` works pre-launch.
8. Privy paymaster signer key rotation procedure — Privy docs sparse; support ticket in Phase 1.
9. DefiLlama "Standard" rate limits under settle-cron load — verify in Phase 4.
10. OZ Stylus crate alpha-line API stability between 2026-05-21 and demo day — re-check releases pre-Phase 5.
11. Stylus build hash reproducibility — `cargo --locked` + commit `Cargo.lock`; Sepolia and mainnet hashes match.
12. Pyth feed verification automation — pre-deploy CI script architecture.
13. EIP-712 domain separator schema — exact field set per attestation type; chainId binding test.
14. Cold-start activity-seeding strategy at mainnet launch — pre-seed 50+ calls + 1-3 seed follows/fades each.
15. CEX scraper synthetic monitoring — weekly CI cron architecture per exchange; spare-token roster.
16. Geo-IP block + ToS click-through implementation — US-jurisdiction; v1 best-effort + v1.1 legal review.
17. Owner self-exclusion mapping — `bannedFromMarkets[address]` storage location (CallRegistry vs SettlementManager).
18. OAuth account-takeover withdrawal velocity controls — opt-in cooldown UX in Phase 1; v1.1 hardcoded daily cap.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|-----------|-------|
| **Solidity/EVM stack (versions, OZ patterns, Pyth, USDC, wagmi, Privy, DefiLlama)** | HIGH | Mature ecosystem; STACK.md cross-referenced live npm versions on 2026-05-21. |
| **Architecture topology (6 contracts, 3 data planes, trust boundaries)** | HIGH | Spec locked and internally coherent; no cycles; trust boundaries fully enumerated. |
| **Feature completeness vs 2026 competitors** | HIGH | FEATURES.md surveyed Polymarket, Kalshi, Manifold, Stocktwits, Farcaster; zero gaps; 20 anti-features validated. |
| **Critical-path 9-step receipt/share loop** | HIGH | Single dependency chain; per-step failure modes catalogued with mitigations. |
| **Stylus + OpenZeppelin Stylus crate (alpha-ish)** | MEDIUM | `openzeppelin-stylus@0.3.0` on alpha line; `cargo --locked` mitigation; iosiro DoS bounty proves attack surface real. |
| **Alchemy NFT TWAP coverage (per-collection)** | MEDIUM | Reservoir sunset absorbed; per-collection coverage of 6 NFT allowlist entries must be verified pre-deploy. |
| **Privy OAuth-takeover at withdrawal** | MEDIUM | No specific 2025/2026 Privy CVE; reasoning from generic OAuth + embedded-wallet pattern; bounded by $100/call cap. |
| **US-jurisdiction regulatory exposure** | MEDIUM | CFTC actively rulemaking; state enforcement active (Arizona vs Kalshi, NJ, Wisconsin); identity-tied USDC in ambiguous grey zone. |
| **Owner-resolved disputes as governance attack surface** | MEDIUM | March 2025 UMA Ukraine incident is canonical analog; v1 mitigation via public log + multisig + owner self-exclusion. |
| **Hackathon-demo failure modes** | HIGH | Standard pitfalls; mitigations are operational (pre-warming, elevated paymaster cap, BTC/ETH/SOL anchor calls). |

**Overall:** HIGH confidence on the build plan. MEDIUM areas are bounded by economic caps ($100/call, $5K TVL, $50/day paymaster) and surfaced via operational runbooks.

---

## Sources (Aggregated)

Per-file source lists live in `STACK.md` / `FEATURES.md` / `ARCHITECTURE.md` / `PITFALLS.md`. Highest-confidence external anchors:

- Stylus SDK 0.10 release blog (March 2026); cargo-stylus GitHub releases; OpenZeppelin Stylus 0.3.0; Privy 3.0 migration guide; npm registry version queries.
- Pyth EVM contract addresses; Pyth Hermes API feed catalog (all 25 spec'd feeds verified 2026-05-21).
- Native USDC on Arbitrum (Arbiscan); Arbitrum USDC docs.
- The Graph Hosted Service sunset (June 2024); Subgraph Studio pricing.
- Solidity 0.8.30 / 0.8.34 release announcements (IR bug context).
- Polymarket UMA Ukraine-mineral-deal incident (March 2025); Orochi Network oracle manipulation analysis; iosiro Arbitrum Stylus DoS bounty (Sep 2024); Trail of Bits Stylus assessment (June 2024).
- CFTC prediction markets rulemaking (Bloomberg Jan 2026); Norton Rose Fulbright analysis (2026).
- Privy 2026 Review + Privy Security docs.
- Farcaster Frames v2 → Mini Apps rename official docs.
