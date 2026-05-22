# Call It

## What This Is

Call It is a social prediction product for crypto-native users who want to build a public, permanent, verifiable reputation for being right. Users stake USDC on calls (price targets, relative performance, future events), receive a permanent onchain receipt, and other users can follow, fade, challenge (1v1), or quote-call them. Settled calls produce shareable "CALLED IT" / "LOUD AND WRONG" / "CONTRARIAN HIT" receipts. The product is **person-first** — every call is a public commitment tied to a named reputation, filling the gap between accountability-free Crypto Twitter and anonymous-position Polymarket.

## Core Value

**Every call is permanent, public, and tied to identity.** If everything else fails, the receipt — created, settled, and shared — must be unfakeable, undeletable, and visually unmistakable. That is the entire product.

## Requirements

### Validated

(None yet — ship to validate)

### Active

The locked spec at [CALL_IT_SPEC1.md](../CALL_IT_SPEC1.md) is the source of truth for all requirements. Full v1 scope is being built — no trims. See `.planning/REQUIREMENTS.md` for the structured REQ-ID list with traceability to spec sections.

High-level requirement clusters:

- [ ] **Identity & Auth** — Privy (3 sign-in paths: Wallet, Google, Twitter) + optional Twitter/Farcaster linking + ProfileRegistry onchain
- [ ] **Call creation** — 3 call types (Price target, Spread/vs, Event/binary with 7 subtypes), allowlist enforcement, anti-spam gates (min stake, duplicate hash, high-conviction floor), Resolution Criteria field
- [ ] **Social actions** — Follow / Fade (AMM), Challenge (1v1 escrow), Quote-call
- [ ] **Reputation system** — Global + 3 categories (Majors/DeFi/Other) + caller score + challenger score, confidence × contrarian multipliers, high-conviction asymmetry, cold-start adjustment
- [ ] **Settlement & oracles** — Pyth (coins), Alchemy NFT API (24h TWAP, relayer-computed), DefiLlama (TVL/volume/fees/APRs), RPC (on-chain metrics), Snapshot/Tally (governance), CEX announcement scrapers
- [ ] **Stylus scoring engine** — Rust reputation math behind transparent proxy with try/catch Solidity fallback at runtime AND build-time
- [ ] **Position exits** — Caller exit (24h lock, 50→15% time-decay, public broadcast + rep slash), follower/fader exit (4h cooldown, flat 10% slash)
- [ ] **Mainnet safety** — $100/call cap, $5K TVL cap, pause with withdraw/claim carve-out, paymaster budget caps, force-settle escape hatch (7-day cooldown), Privy custody disclosure
- [ ] **UI** — 10 pages in neobrutalist treatment (Feed, New Call, Live Receipt, Settled Receipt, Profile, Duel, Leaderboard, Sign-in, Onboarding, Quote Composer) + shared loading skeleton + error toast
- [ ] **Share assets** — Off-chain OG service with 5 card variants (Live, Settled, Duel Settled, Caller Exited, Fallback) via Satori or @vercel/og
- [ ] **Distribution** — Public-by-default, Twitter/Farcaster follow-graph integration ("From your X"), Farcaster Frames (final phase), protocol-sponsored campaigns as GTM
- [ ] **Subgraph indexer** — The Graph subgraph as primary indexed event source from day 1
- [ ] **Disputes** — $5 USDC bond, 24h window, max 3 counter-claims, owner-resolved in v1
- [ ] **Operations** — Structured relayer logging, metrics dashboard (TVL, calls/hr, settlement latency, dispute rate, failed-tx rate), Telegram alerting, settlement-stuck runbook

### Out of Scope

Per spec §4.5 (deferred to v2) and §4.6 (explicitly cut):

- **Macro / regulatory events** (ETF approvals, Fed rate decisions, political outcomes) — needs dedicated human-curated oracle; v2
- **Multi-condition compound calls** ("BTC > $100k AND ETH > $5k") — needs composite resolution logic; v2
- **Range / band predictions** ("ETH stays between X and Y") — needs path-dependent settlement; v2
- **First-to-X / race events** ("X launches before Y") — needs two-event tracking; v2
- **NFT mint outcomes** ("X sells out in 24h") — needs mint-specific oracle integration; v2
- **Social engagement events** (tweet likes, follower counts, recasts) — trivially manipulable via botting; incompatible with credibility-based product; cut entirely
- **Personal / interpersonal predictions** ("@X subtweets @Y this month") — subjective and unverifiable; cut entirely
- **Notification system** (§20.1) — v1.1
- **Search UI** (§20.2) — v1.1; leaderboard and feed are the v1 discovery surfaces
- **Watch / Notify delivery** (§20.3) — v1.1; v1 button creates in-app subscription only
- **Reputation-gated stake limits** (§7.8) — v1 has no gating; the $100 cap applies to everyone
- **Leagues / curated groups** — public-by-default in v1; v1.1+
- **Decentralized dispute resolution** (Kleros / token vote) — owner-resolved in v1; post-hackathon
- **Reputation NFTs** — receipts are off-chain OG images in v1, not NFTs
- **Mobile-responsive pass for non-critical pages** (Duel, Quote composer, New Call) — desktop-only banner in v1

## Context

**Domain:** Crypto-native social prediction; competes with Polymarket (market-first, anonymous), Kalshi (regulated, US-focused), Pump.fun (token speculation), Melee (bonding-curve prediction). Differentiation is **person-first** identity + permanent shareable receipts.

**Network:** Arbitrum mainnet from day 1 with real USDC. Sub-cent fees enable micro-stakes ($5-$100). Stylus enables Rust-based reputation math at near-native speed. 250ms blocks give real-time UX.

**Tone:** Sharp, intelligent, slightly intimidating. Trading-floor vocabulary ("The Tape", "Top of book", "Go on record"). Empty states like "No calls yet. Be the first to go on record."

**Design register:** Neobrutalist on top of a refined typographic foundation (Syne for display, Space Grotesk for body, JetBrains Mono for data). Electric yellow-green `#E8F542` accent. 2-3px borders, hard offset shadows (never blurred), 0-2px corner radius max, 4px corner brackets on weight-carrying blocks. The "no slop" filter applies — any element that could appear unchanged in a generic SaaS dashboard is wrong.

**Reservoir → Alchemy:** The original spec named Reservoir for NFT floor data; Reservoir sunset their NFT API in October 2025, so the v1 spec was rewritten to use Alchemy NFT API with relayer-computed 24h TWAP.

**Operational model:** Single owner key controls pause / setTvlCap / force-settle / proxy admin in v1. Promoted to multisig before any v1.1 / before TVL exceeds $5K. Privy custodies internal wallets until users export.

## Constraints

- **Network:** Arbitrum mainnet — hardcoded; not multi-chain in v1
- **Currency:** USDC on Arbitrum — hardcoded address in every transfer path
- **Tech stack — contracts:** Solidity `^0.8.24` (pinned, not `0.8+`) + Rust/Stylus for the reputation scoring engine behind a transparent proxy
- **Tech stack — frontend:** Next.js (App Router) + React + Privy for auth/embedded wallets + wagmi/viem for chain interactions + Tailwind for styling
- **Tech stack — backend:** Node.js + Fastify, deployed on Railway or Fly.io. Hosts the relayer (oracle queries, signed submissions, CEX scrapers, OG image generation via Satori or @vercel/og)
- **Indexer:** The Graph subgraph from day 1 as the primary event source; cron-polled events as fallback during subgraph deploy
- **Safety caps:** $100 max stake per call, $5,000 TVL cap initial (owner-raisable up to $100K), $5 min stake, $1 min follow/fade position
- **Settlement fees:** 1.0% protocol + 0.4% creator (Model B for exited callers) + 0.3% LP = 1.7% total extraction at settlement; $10 USDC flat market creation fee
- **Pyth confidence:** ≤ 0.5% of price (`confidence × 200 <= price`); 30 retries × 60s before dispute window
- **Settlement SLA:** 24h 30m maximum for normal flow; `forceSettle` escape hatch unlocks at expiry + 7 days
- **Audit-ready patterns:** Checks-Effects-Interactions, ReentrancyGuard on USDC transfer paths, no `delegatecall` to user-controlled addresses, hardcoded USDC address gate
- **Sepolia staging gate:** ≥48h on Arbitrum Sepolia with seeded calls/follows/settles/exits/challenges/disputes before mainnet deploy — non-optional
- **Post-deploy smoke test:** 20-minute checklist per §19.11 mandatory before public announcement
- **Stylus build cutoff:** 48 hours before demo — if Rust + Stylus path not working, swap to Solidity baseline in same proxy slot; pitch "Stylus in production roadmap"

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Spec is source of truth | Full v1 build, no trims — user wants both hackathon win AND mainnet-ready real product | — Pending |
| Next.js App Router for frontend | SSR + dynamic OG cards in same repo; pairs cleanly with the §16 OG service; Vercel deploy path | — Pending |
| Node + Fastify on Railway/Fly.io for backend | Long-running relayer needs predictable hosting (30-min Pyth retry loop, CEX scrapers, signed-attestation submitter) — Vercel function time limits are a poor fit | — Pending |
| The Graph subgraph from day 1 | Per §3060 decision; primary indexed event source. Polled-events fallback while subgraph deploys | — Pending |
| Build with Claude Code, user supervises | Effectively solo-with-AI build; roadmap optimizes for sequential focus + clear contract boundaries | — Pending |
| Network: Arbitrum mainnet | Locked per spec §1; Stylus + sub-cent fees + 250ms blocks are core to the product story | — Pending |
| Embedded wallet: Privy | Locked per spec §9.2; polished UX, OAuth flows, paymaster integration | — Pending |
| Single FollowFadeMarket contract with sub-state | Locked per §11.2; per-call proxies rejected — saves ~50k gas per call, simplifies TVL aggregation | — Pending |
| Stylus runtime + build-time fallback | Locked per §11.6; SettlementManager try/catches Stylus, Solidity baseline at lower fidelity. Build cutoff 48h before demo | — Pending |
| Owner-resolved disputes in v1 | Locked per §13.7; decentralized resolution (Kleros / token vote) is post-hackathon | — Pending |
| 3 reputation categories (Majors/DeFi/Other) | Locked per §7.5; reduced from 8 — at hackathon volume eight categories were statistical noise. Append-only enum for v2 expansion | — Pending |
| Receipts are off-chain OG images, not NFTs | Locked per §18.2; faster to render, easier to iterate, referenced onchain by hash | — Pending |
| D-06 (Phase 1): 6th-tx-onward gas mechanic | Circle USDC Paymaster on Arbitrum with per-tx EIP-2612 permit replaces user-provided ETH; no ETH ever required. Rationale: eliminates user-friction onboarding step that contradicts the USDC-native value prop. | Locked in Phase 1 — Plans 07/08 implementation. REQUIREMENTS.md AUTH-27 + AUTH-29 amended verbatim. 2026-05-23 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-21 after initialization*
