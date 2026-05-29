# Roadmap: Call It

## Overview

Call It ships as a person-first onchain social prediction product on Arbitrum mainnet — full v1 scope, no trims, hackathon-ready AND mainnet-grade in the same build. The roadmap derives from `CALL_IT_SPEC1.md` §19 ("Build Order") with five research-driven deltas applied: a new Phase 0 lays continuously-live foundation (monorepo, multisig prep, IPFS, CDN, subgraph schema, relayer skeleton, monitoring, OG fallback) so the receipt loop is never blocked by infra; Phase 1.5 runs social linking in parallel with Phase 2 to surface VERIFIED badges sooner; the Solidity baseline reputation delta ships in Phase 4 (not as a Phase 5 fallback) so the 48h Stylus cutoff becomes a mechanical `upgradeTo(...)`; Safe 2-of-3 multisig promotion is pulled from "before v1.1" into Phase 6 as a hard gate before mainnet promotion; and OG service + subgraph mappings are scaffolded in Phase 0 and finalized in Phase 7. Phases 1–7 converge on the 9-step receipt critical path (Sign-up → Fund → Sponsored tx → Compose → Publish → Live receipt → Settlement → Settled receipt → Share). Phase 7.5 is the 20-minute mainnet smoke test gate. Phases 8 (Farcaster Mini Apps) and 9 (mobile responsive on 7 critical pages) are distribution/UX enhancements that follow mainnet promotion.

## Phases

**Phase Numbering:**
- Integer phases (0, 1, 2, ...): Planned milestone work
- Decimal phases (1.5, 7.5): Parallel-stream phase (1.5) and mainnet-deploy gate (7.5)

- [x] **Phase 0: Foundation** - Always-live infra: monorepo, multisig prep, IPFS, CDN, subgraph schema, relayer skeleton, monitoring stack, env-var matrix, USDC single source-of-truth, OG fallback variant (completed 2026-05-22)
- [ ] **Phase 1: Core contracts + auth + frontend skeleton** - CallRegistry + ProfileRegistry contracts, Privy 3-path sign-in, onboarding, paymaster (5 free tx), address book + 24h cooldown, New Call flow, design system, loading skeleton + toast
- [ ] **Phase 1.5: Social linking (parallel to Phase 2)** - Twitter/Farcaster OAuth proof, relayer-signed `linkTwitter`/`linkFarcaster`, VERIFIED badges, "From your X/Farcaster" feed sections
- [ ] **Phase 2: FollowFadeMarket** - Single-contract AMM with per-callId sub-state, follow/fade with `minSharesOut` slippage, caller exit (24h lock + decay), follower/fader exit (4h cooldown + 10% slash), Live Receipt page
- [ ] **Phase 3: ChallengeEscrow** - 1v1 duel escrow, self-challenge ban, 24h accept window, push-pattern overage refund, Duel King badge, Trending Duel auto-promotion, Duel page
- [ ] **Phase 4: SettlementManager + 7 oracle paths + Solidity baseline rep delta** - 14-step atomic settle dispatch hub, Pyth pull + multicall, NFT TWAP via Alchemy + KMS-signed relayer, DefiLlama, RPC, Snapshot/Tally, 8 CEX scrapers, dispute window with $5 bond, forceSettle 7d cooldown, Settled Receipt page, in-contract Solidity baseline rep math
- [ ] **Phase 5: StylusScoreEngine + 48h cutoff** - Rust reputation engine behind Solidity `TransparentUpgradeableProxy`, full-fidelity `compute_rep_change`, 365-day reactivation runbook integrated with Phase 0 alerts, parallel-built `RevertingStylusEngine` test fixture
- [ ] **Phase 6: Safety review + Sepolia ≥48h + multisig promotion** - Stylus destruction drill, TVL cap aggregation boundary tests, full "Looks Done But Isn't" checklist, Sepolia ≥48h with seeded calls/follows/settles/exits/challenges/disputes, Safe 2-of-3 multisig deploy + ownership transfer (HARD GATE)
- [ ] **Phase 7: OG service final variants + Subgraph final mappings** - 5 OG card variants finalized (Live, Settled, DuelSettled, CallerExited, Fallback) via @vercel/og + Satori, subgraph published to Decentralized Network on Arbitrum, auto-post-to-X gated by cache-warm verification, Twitter Card Validator pre-flight, 200px readability QA gate
- [ ] **Phase 7.5: Mainnet deploy gate** - 20-minute §19.11 smoke test checklist; deploy + verify + ownership transfer to multisig + first authenticated session + funding + first sponsored tx + receipt share Twitter Card Validator
- [ ] **Phase 8: Farcaster Mini Apps** - `fc:frame` meta tags, Mini App manifest, Farcaster receipt rendering, Follow/Fade/Challenge actions from Frame
- [ ] **Phase 9: Mobile responsive on 7 critical pages** - 375px breakpoint on Feed, Live Receipt, Settled Receipt, Profile, Leaderboard, Sign-in, Onboarding; desktop-only banner on Duel, Quote composer, New Call

## Phase Details

### Phase 0: Foundation
**Goal**: Lay continuously-live infrastructure so the receipt loop is never blocked by infra. Monorepo, multisig prep, pinning, CDN, indexer scaffolding, relayer skeleton, monitoring, env discipline, USDC single source-of-truth, OG fallback variant — everything that every subsequent phase will extend, not replace.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: OPS-01, OPS-02, OPS-03, OPS-05, OPS-06, OPS-07, OPS-08, OPS-09, OPS-10, OPS-11, OPS-12, OPS-13, OPS-14, OPS-17, OPS-18, OPS-19, OPS-20, OPS-21, OPS-22, OPS-23, OPS-24, OPS-25, OPS-26, SAFETY-12, SAFETY-13, SAFETY-15, SAFETY-16, SAFETY-17, SAFETY-58, SHARE-09, SHARE-10, SHARE-11
**Success Criteria** (what must be TRUE):
  1. `pnpm install && pnpm build` from monorepo root produces deployable artifacts for `apps/web`, `apps/relayer`, `packages/contracts`, `packages/subgraph`, `packages/shared`, `packages/config` with zero cross-package import violations.
  2. CI fails the build when any Solidity file contains `pragma solidity ^0.8.*` (must be exact `=0.8.30`), when any source file hardcodes a USDC address other than the canonical `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`, or when any environment file references `arbitrum-sepolia` in a `mainnet` profile (Pitfall 1, Pitfall 5).
  3. Relayer skeleton (Fastify + BullMQ + Redis + Pino + viem `walletClient`) responds 200 to `/health` from Railway/Fly.io, with the signer private key sourced from KMS/secret manager (never env file) and 5 dashboard panels in Better Stack populated by Pino structured logs (Pitfall 3 surface, Pitfall 7 mitigation).
  4. Subgraph schema (`subgraph.yaml` + AssemblyScript mappings stubbed per contract) deploys to Subgraph Studio for Arbitrum Sepolia and exposes empty entities; polled-events fallback via `viem.getLogs` at 5s interval is wired and tested against a local anvil.
  5. OG Fallback variant card ("A CALL WAS MADE") renders at `/og/fallback?handle=...` in <100ms with no on-chain dependency, served via CDN with 60s cache; Telegram alert bot fires on synthetic `pause()`, dispute-raised, paymaster-80%, settlement-stuck-25m, `RepCalculatedFallback`, `CallForceSettled`, and TVL-cap-approach events (OPS-07..14).
  6. Safe 2-of-3 multisig deployment script is written and dry-run-tested on Sepolia with the three signers identified (operator + co-founder + advisor); deployer key lives on hardware wallet; Stylus reactivation calendar reminders are scheduled at T-30d/T-15d/T-7d/T-1d for the eventual deployment date (Risk #2 prep, Pitfall 17 prep).
**Plans**: 5 plans across 4 waves
  - [x] 00-01-PLAN.md — Wave 0: pnpm + Turborepo monorepo bootstrap; USDC + networks + Pyth feeds single source-of-truth; Solidity =0.8.30 pin; 3 CI grep guards (USDC paste, pragma, env-network)
  - [x] 00-02-PLAN.md — Wave 1: Fastify relayer skeleton on Fly.io iad; 5-key GCP KMS signer wrapper; Pino + Better Stack logging with redaction; Upstash Redis + paymaster counter; 9-event Telegram alert dispatcher (P0/P1) + admin endpoints
  - [x] 00-03-PLAN.md — Wave 2: 23-entity subgraph schema deployed to Studio for Sepolia; polled-events fallback worker (viem.getLogs); SHARE-09 OG Fallback route on Vercel Node runtime with <100ms p95 warm render
  - [x] 00-04-PLAN.md — Wave 3: Safe 2-of-3 deploy script + Sepolia dry-run with Ledger; Google Calendar Stylus reactivation seeding + Phase 5 repoint hook + relayer deactivation-watcher (second belt); daily synthetic-alert CI cron with Telegram getUpdates verification; 5 Better Stack dashboards + 5 operator runbooks + demo seed plan
  - [x] 00-05-PLAN.md — Wave 4: Vercel + Fly.io + Subgraph Studio deploy workflows with GCP OIDC federation; phase-0-gate.yml on tag phase-0-complete; 6-step smoke test against deployed artifacts; operator pre-tag checklist (8 hosted-resource verification items including Pinata D-20 + default-domain D-05)
**Pitfalls mitigated**: 1 (USDC single source + CI grep), 3 (TVL cap surfaces will read from canonical aggregator), 5 (env discipline + diff ritual), 6 (multisig prep this phase, promotion in Phase 6), 7 (KMS storage from day one), 8 (subgraph + OG service from day one — no cache-desync window opens), 10 (CEX scraper synthetic-monitoring scaffolding), 17 (calendar reminder for Stylus reactivation)

### Phase 1: Core contracts + auth + frontend skeleton
**Goal**: A real user can sign in via any of 3 paths, complete onboarding, fund their wallet, get the first 5 transactions sponsored, see the address book + 24h cooldown enforced server-side, and publish a real call. Critical-path steps 1 (Sign-up), 2 (Fund), 3 (Paymaster-sponsored first tx), 4 (Compose), 5 (Publish) all land here at contract + UI level.
**Mode:** mvp
**Depends on**: Phase 0
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-08, AUTH-11, AUTH-19, AUTH-20, AUTH-21, AUTH-22, AUTH-23, AUTH-24, AUTH-25, AUTH-26, AUTH-27, AUTH-28, AUTH-29, AUTH-30, AUTH-31, AUTH-32, AUTH-33, AUTH-34, AUTH-35, AUTH-36, AUTH-37, AUTH-38, AUTH-39, AUTH-40, AUTH-41, AUTH-42, AUTH-43, AUTH-44, CALL-01, CALL-02, CALL-03, CALL-04, CALL-05, CALL-06, CALL-07, CALL-08, CALL-09, CALL-10, CALL-11, CALL-12, CALL-13, CALL-14, CALL-15, CALL-16, CALL-17, CALL-18, CALL-19, CALL-20, CALL-21, CALL-22, CALL-23, CALL-24, CALL-25, CALL-26, CALL-27, CALL-28, CALL-29, CALL-30, CALL-31, CALL-32, CALL-33, CALL-34, CALL-35, CALL-36, CALL-37, CALL-38, CALL-39, CALL-40, CALL-41, CALL-42, CALL-43, CALL-44, CALL-45, CALL-46, CALL-47, CALL-48, CALL-49, CALL-50, CALL-51, CALL-52, CALL-53, CALL-54, CALL-55, CALL-56, CALL-57, CALL-58, CALL-59, CALL-60, CALL-61, CALL-62, CALL-63, CALL-64, CALL-65, CALL-66, CALL-67, CALL-68, CALL-69, CALL-70, REP-01, REP-02, REP-17, REP-18, REP-28, REP-29, SAFETY-01, SAFETY-04, SAFETY-05, SAFETY-06, SAFETY-07, SAFETY-08, SAFETY-09, SAFETY-10, SAFETY-11, SAFETY-14, SAFETY-18, UI-01, UI-02, UI-03, UI-04, UI-05, UI-08, UI-10, UI-24, UI-25, UI-29, UI-30, UI-31, UI-32, UI-33, UI-34, UI-35, UI-36, UI-37, UI-38, UI-39, UI-40, UI-41, UI-42, UI-43, UI-46, UI-47, UI-51, UI-53, UI-55, UI-56
**Success Criteria** (what must be TRUE):
  1. User can sign in via Privy through all 3 paths (Connect Wallet SIWE / Sign in with Google / Sign in with Twitter) and arrive at the same authenticated session; Twitter path auto-creates a Privy embedded wallet AND pre-links the Twitter handle in the same flow.
  2. First-time onboarding runs 4 screens (Handle → Connect Socials → Follow-graph opt-in conditional → Tagline commitment), displays the Privy custody disclosure card, and prompts wallet export when balance reaches ≥ $50 USDC.
  3. User publishes a real CallRegistry call (Price target, Spread/vs, or any Event subtype) — `createCall` enforces all anti-spam gates (Gate 6.1 min/max stake, Gate 6.2 duplicate hash with UTC-day boundary surfaced in UI per Pitfall 12, Gate 6.3 high-conviction floor auto-capping conviction to 84 for users with <10 settled calls), pulls stake + $10 fee via `safeTransferFrom`, emits `CallCreated`, and the subgraph indexes the event within 30 seconds (OPS-04 dependency).
  4. The first 5 transactions per user are sponsored by the paymaster (cap enforced server-side at the paymaster gating layer, not just contract-side); 6th transaction routes the user to "fund your wallet to continue"; new auth methods cannot authorize a withdrawal until 24h after `addedAt` (server-side check in relayer per Pitfall 20).
  5. Privy provider tree (`<PrivyProvider><QueryClientProvider><WagmiProvider>{children}</WagmiProvider></QueryClientProvider></PrivyProvider>`) survives a Playwright sign-in smoke test (Pitfall 13) and an AST regression check that the order is preserved across refactors.
  6. Tape feed (`/`), New Call page (`/new`), Profile page shell (`/profile/[address]`), and Sign-in page (`/signin`) render with the locked neobrutalist treatment (color palette, typography stack, 2-3px borders, hard offset shadows, 4px corner brackets, button shadow language); shared loading skeleton (6 variants) and shared error/status toast component (3-status stacking, countdown drain) are reusable from the design-system package.
**Plans**:  10 plans across 5 waves
  - [x] 01-01-PLAN.md — Wave 0: monorepo bootstrap; @call-it/ui workspace + Drizzle schema + env extension + WAVE-0-VERIFICATION (Circle paymaster + Privy wagmi v4 + Alchemy RPC choice)
  - [x] 01-02-PLAN.md — Wave 0: CallRegistry + ProfileRegistry contracts + DuplicateHashLib + Foundry tests + gate-matrix.json fixture + Sepolia deploy
  - [x] 01-03-PLAN.md — Wave 1: Shared Zod schemas + TS duplicate-hash mirror + Vitest parity tests + parity-diff CI gate (D-29 anti-drift)
  - [x] 01-04-PLAN.md — Wave 1: @call-it/ui primitives (Button/Card/Tag/CornerBrackets/Skeleton×6/Toast/Stamp) + compound components (Receipt/ConvictionBar/CallCard/ProfileHeader) + AUTH-44 no-wallet-address invariant
  - [x] 01-05-PLAN.md — Wave 2 (Slice A): Privy 3-path sign-in + provider tree AST test + Alchemy AA + wagmi configs + sign-in page
  - [x] 01-06-PLAN.md — Wave 2 (Slice B): 4-screen onboarding + custody disclosure + 0 export prompt + Coinbase Onramp + relayer onboarding endpoint (privySessionPreHandler shared)
  - [x] 01-07-PLAN.md — Wave 3 (Slice E+F): Paymaster policy + Upstash counter + UserOp confirmer + Circle USDC handoff + address book + 24h cooldown + Privy webhook
  - [x] 01-08-PLAN.md — Wave 4 (Slice D): /new page + RHF + zodResolver + 3 mode sub-forms + dup-check + preflight + Receipt preview + two-step publish modal
  - [x] 01-09-PLAN.md — Wave 4 (Slice G): Feed shell (800ms race + 10s cache) + Profile shell (ENS server-side + 24h cache) + Settings page
  - [x] 01-10-PLAN.md — Wave 5 (closure): subgraph extension + REQUIREMENTS amendment for AUTH-27/29 + visual smoke + design-system snap + phase-1-complete-gate workflow + Phase 1 SUMMARY
**UI hint**: yes
**Pitfalls mitigated**: 1 (USDC hardcoded address gate in every transfer path), 5 (Phase 0 env config consumed end-to-end), 12 (UTC duplicate-hash boundary surfaced inline in New Call form), 13 (Privy provider order locked + AST test), 14 (per-user 5-tx cap as primary defense alongside Phase 0 paymaster $50/day cap), 16 (Connect Wallet fallback UX present from day one), 20 (24h new-auth-link cooldown enforced server-side in relayer)

### Phase 1.5: Social linking (parallel to Phase 2)
**Goal**: Optional Twitter/Farcaster linking enriches identity so VERIFIED · X / VERIFIED · FC / VERIFIED · X · FC badges land on every surface (profile, feed card, receipt, duel, leaderboard) before FollowFadeMarket goes live. Twitter follow-graph powers "From your X" feed section; Farcaster follow-graph mirrors as "From your Farcaster". Zero mechanical effect on rep, stake limits, fees, or payouts.
**Mode:** mvp
**Depends on**: Phase 1 (ProfileRegistry skeleton must exist; can run in parallel with Phase 2)
**Requirements**: AUTH-06, AUTH-07, AUTH-09, AUTH-10, AUTH-12, AUTH-13, AUTH-14, AUTH-15, AUTH-16, AUTH-17, AUTH-18
**Success Criteria** (what must be TRUE):
  1. User can optionally link Twitter (via Privy OAuth proof) and/or Farcaster (via Farcaster Auth Kit OAuth proof); relayer verifies the proof server-side and submits `linkTwitter(handle, proofHash)` / `linkFarcaster(handle, proofHash)` to ProfileRegistry; gas is sponsored by the protocol.
  2. VERIFIED · X / VERIFIED · FC / VERIFIED · X · FC badge renders next to the handle on Profile, Feed call card, Live + Settled Receipt headers, Duel page parties, and Leaderboard rows; badge has zero mechanical effect on rep, stake limits, or payouts (cross-checked in test).
  3. "From your X" feed section shows up to 10 calls (active + active duels, excludes settled), ordered by recency, refreshed when feed opens with a 1-hour cache; "From your Farcaster" mirrors with collapse toggles; explicit opt-in screen shown during onboarding and never bypassed.
  4. User can unlink Twitter/Farcaster directly (no relayer required) via Profile → Settings; badge and handle reference removed; onchain history retained; X/FC follow-graph data is server-side only, visible only to the viewer, and cleared on disconnect.
**Plans**: TBD
**UI hint**: yes
**Pitfalls mitigated**: 16 (Privy outage — Wallet-path users unaffected because social linking is optional and independent of auth)

### Phase 2: FollowFadeMarket
**Goal**: Single-contract AMM holds per-callId sub-state per §11.2 lock (per-call proxies rejected — saves ~50k gas/call, simplifies TVL aggregation). Anyone can Follow or Fade any live call with slippage-protected `minSharesOut`; followers/faders can exit with 4h cooldown + 10% slash; caller can exit after 24h lock with time-decay penalty (50%→15%) + public broadcast + rep slash. Live Receipt page renders the in-progress receipt with live activity feed and quote-calls section.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: SOCIAL-01, SOCIAL-02, SOCIAL-03, SOCIAL-04, SOCIAL-05, SOCIAL-06, SOCIAL-07, SOCIAL-08, SOCIAL-09, SOCIAL-10, SOCIAL-11, SOCIAL-12, SOCIAL-13, SOCIAL-14, SOCIAL-15, SOCIAL-16, SOCIAL-17, SOCIAL-18, SOCIAL-19, SOCIAL-20, SOCIAL-21, SOCIAL-22, SOCIAL-23, SOCIAL-24, SOCIAL-25, SOCIAL-26, SOCIAL-27, SOCIAL-28, SOCIAL-43, SOCIAL-44, SOCIAL-45, UI-06, UI-07, SHARE-04
**Success Criteria** (what must be TRUE):
  1. User can Follow or Fade any live call by depositing $1–$100 USDC; AMM mints FOLLOW or FADE shares priced by `follow_shares × fade_shares = k`; `follow`/`fade` revert `SlippageExceeded` when `minSharesOut` (frontend computes expected + 1% tolerance) is not met; post-expiry deposits revert `CallPastExpiry`.
  2. Follower/fader exit after 4h cooldown returns 90% of stake; the 10% slash splits 50% to opposite pool / 40% to same-side pool / 10% to treasury; `exitPosition` continues to work while contract is paused (carve-out per §10.3) and reverts `CallNotLive` if call already settled.
  3. Caller exit (callable only after 24h lock, penalty follows `15% + (35% × time_remaining_ratio)` with 15% floor) sets `call.status = CallerExited`, snapshots `callerVolumeAtExit` for Model B creator-fee, emits `CallerExited` event, posts the public broadcast entry, fires notifications to all current followers/faders, applies the `-45 → -10` rep decay slash, and the Live Receipt page renders the amber "CALLER EXITED" banner from that moment forward.
  4. Canonical `getTvl()` view on FollowFadeMarket returns total across all callId sub-states; TVL cap aggregation across CallRegistry + FollowFadeMarket + ChallengeEscrow (when present) is correctly enforced by `follow`/`fade` per Pitfall 3; Foundry property-based fuzz tests assert the AMM `k`-invariant per-callId across multi-call interference fixtures (Pitfall 9); empty-pool LP-fee math routes to treasury per Pitfall 22 invariant.
  5. Live Receipt page (`/call/[id]`) renders the sticky caller header, THE CALL hero, 4-stat row (Current Spread + Time Left + Stake + Conviction), market positioning bar, 3 action buttons (Follow filled / Fade outline / Challenge orange outline), REASONING block, optional collapsible RESOLUTION CRITERIA block, live activity feed left column, quote-calls right column with FADING/FOLLOWING tag; "Exit your call" / "Exit your position" links appear under the correct conditions with confirmation modals showing penalty math.
  6. Live State OG card (variant 1) renders at `/og/[callId]` with the live follow%/fade% progress bar + time-left countdown + corner bracket motif; `og:image?v={statusVersion}` cache-busts on follow/fade activity per Pitfall 8 prep.
**Plans**: 9 plans across 4 waves
  - [x] 02-01-PLAN.md — Wave 0: Foundry test scaffold (FfmTestHelper + FollowFadeMarket.t.sol + Gates + Interference + TvlAggregation) + TypeScript AMM parity stubs (D-29)
  - [x] 02-02-PLAN.md — Wave 1: IFollowFadeMarket interface + FollowFadeMarket AMM contract (full CEI/penalty-injection/caller-exit/TVL)
  - [x] 02-03-PLAN.md — Wave 1: CallRegistry redeploy diff (stake-forward D-01, markCallerExited D-02) + ProfileRegistry redeploy diff (authorizedRepWriters D-04, applyRepDelta D-05)
  - [ ] 02-04-PLAN.md — Wave 1: DeployPhase2.s.sol + addresses.ts + ABI export + [OPERATOR] Sepolia deploy checkpoint
  - [ ] 02-05-PLAN.md — Wave 2: DB schema (notifications + quote_stance tables) + [BLOCKING] Drizzle migration
  - [ ] 02-06-PLAN.md — Wave 2: Subgraph extension (follow-fade-market.ts + subgraph.yaml update + Sepolia Studio redeploy)
  - [x] 02-07-PLAN.md — Wave 2: Relayer routes (live-state + quote-stance + notifications) + notification-fanout worker + statusVersion bump
  - [ ] 02-08-PLAN.md — Wave 3: /call/[id] Live Receipt page + 4 modal components (Follow/Fade/CallerExit/PositionExit)
  - [ ] 02-09-PLAN.md — Wave 4: OG card variant 1 (/og/[callId]/route.ts Node runtime) + NotificationBell + NotificationInbox
**UI hint**: yes
**Pitfalls mitigated**: 3 (canonical `getTvl()` + TVL aggregation boundary tests staged for Phase 6), 8 (OG cache-busting via `?v={statusVersion}` rolls forward on every state change), 9 (per-callId AMM invariant property-based fuzz), 10 (strict `block.timestamp < call.expiry` gate in `follow`/`fade`), 22 (empty-pool LP-fee math routes to treasury — explicit fixture test)

### Phase 3: ChallengeEscrow
**Goal**: 1v1 duel escrow: any user can challenge a Live call (when `openToChallenges == true`), self-challenge banned at contract level, 24h accept window with automatic refund path, asymmetric-stake overage refunded via push-pattern (not stranded — Pitfall 21). Duel page renders the THE MARKET hero + two-column duel card; Duel King badge + Trending Duel auto-promotion drive distribution; Duel Settled OG card (variant 3) auto-generates on duel resolution.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: SOCIAL-29, SOCIAL-30, SOCIAL-31, SOCIAL-32, SOCIAL-33, SOCIAL-34, SOCIAL-35, SOCIAL-36, SOCIAL-37, SOCIAL-38, SOCIAL-39, SOCIAL-40, SOCIAL-41, SOCIAL-42, SOCIAL-46, SOCIAL-47, SOCIAL-48, SOCIAL-49, SOCIAL-50, SOCIAL-51, UI-11, SHARE-07
**Success Criteria** (what must be TRUE):
  1. Challenger can `proposeChallenge(callId, stake)` against any Live call with `openToChallenges == true`; `SelfChallenge` revert fires when `msg.sender == call.caller` (no rep farming via puppet wallets); asymmetric stakes are accepted with the pot computed as `min(callerStake, challengerStake) × 2`.
  2. Caller has 24h to `acceptChallenge` or `rejectChallenge`; after the window, challenger calls `claimRefund` to recover stake; challenge stakes are escrowed in ChallengeEscrow until settlement; overage (when stakes are asymmetric) is refunded via push-pattern in SettlementManager and indexed as a subgraph "unclaimed overage" entity (Pitfall 21).
  3. `claimDuelPayout` is idempotent (`AlreadyClaimed` on second attempt) and reverts `NotDuelWinner` for non-winners; `claimPayout` follows Checks-Effects-Interactions; subgraph indexes `ChallengeProposed`, `ChallengeAccepted`, `ChallengeRejected`, `ChallengeRefunded`, `ChallengeSettled`, `PayoutClaimed`, `PositionExited` events for Live Receipt activity feed.
  4. Duel page (`/duel/[id]`) renders THE MARKET hero block (asset pair massive type + question line + 3-stat live spread / pot / settles-in), two-column duel card (CALLER yellow-green / VS divider / CHALLENGER orange) with parallel stat rows, MARKET CONSENSUS bar, Riding sections both sides, and "Side with [X]" bottom CTAs.
  5. Trending Duel auto-promotion pins duels with combined pot ≥ $500 USDC OR ≥50 "Riding" backers to top of global feed for 4 hours with "TRENDING DUEL" label; Duel King badge displays on the single user with the highest 7-day duel win streak (refreshed weekly) on profile, leaderboard row, feed call cards, and receipt cards; Duels tab in feed shows Active (pot desc) / Trending (pinned) / Recently settled (7d) with filter chips.
  6. Duel Settled OG card (variant 3) renders the two-avatar layout with winner highlighted and loser dimmed to 40% opacity, WINS in Syne next to the winner's column, pot ("Pot: $X,XXX · winner takes all"), paired rep deltas, market + target small text, Call It + Arbitrum branding bottom corners.
**Plans**: TBD
**UI hint**: yes
**Pitfalls mitigated**: 3 (ChallengeEscrow TVL contribution included in canonical aggregation), 21 (asymmetric-stake overage push-pattern refund + subgraph unclaimed-overage entity)

### Phase 4: SettlementManager + 7 oracle paths + Solidity baseline rep delta
**Goal**: The 14-step atomic settle dispatch hub lands. Per (marketType, eventSubtype), SettlementManager routes to the correct oracle adapter: Pyth (pull model with `bytes[] pythUpdateData` multicall + ETH fee), Alchemy NFT API (24h relayer-computed TWAP with ≥12 observations), DefiLlama (TVL / volume / fees / APRs), direct RPC (on-chain metrics + liquidation events), Snapshot (off-chain governance), Tally (on-chain governance), and 8 Playwright CEX scrapers with per-exchange selectors + Innovation Zone exclusion fixtures. KMS-signed relayer attestations land via EIP-712 with chainId binding. Dispute window opens for ambiguous reads ($5 USDC bond, max 3 counter-claims, owner-resolved in v1 with public commitment log). `forceSettle` escape hatch unlocks 7 days post-expiry. Solidity baseline reputation delta is shipped in-contract (NOT as a Phase 5 fallback per Delta 3) so the 48h Stylus cutoff becomes a mechanical `upgradeTo(...)`. Settled Receipt page renders all variants. Critical-path steps 4, 5, 7 (Compose, Publish, Settlement) all close here.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: SETTLE-01, SETTLE-02, SETTLE-03, SETTLE-04, SETTLE-05, SETTLE-06, SETTLE-07, SETTLE-08, SETTLE-09, SETTLE-10, SETTLE-11, SETTLE-12, SETTLE-13, SETTLE-14, SETTLE-15, SETTLE-16, SETTLE-17, SETTLE-18, SETTLE-19, SETTLE-20, SETTLE-21, SETTLE-22, SETTLE-23, SETTLE-24, SETTLE-25, SETTLE-26, SETTLE-27, SETTLE-28, SETTLE-29, SETTLE-30, SETTLE-31, SETTLE-32, SETTLE-33, SETTLE-34, SETTLE-35, SETTLE-36, SETTLE-37, SETTLE-38, SETTLE-39, SETTLE-40, SETTLE-41, SETTLE-42, SETTLE-43, SETTLE-44, SETTLE-45, SETTLE-46, SETTLE-47, SETTLE-48, SETTLE-49, SETTLE-50, SETTLE-51, SETTLE-52, REP-03, REP-04, REP-05, REP-06, REP-07, REP-08, REP-09, REP-10, REP-11, REP-12, REP-13, REP-14, REP-15, REP-16, REP-22, REP-23, REP-25, REP-26, REP-27, OPS-15, OPS-16, SAFETY-57, SHARE-05, SHARE-06, SHARE-08, SHARE-12, UI-14, UI-15, UI-16, UI-17, UI-18, UI-19, UI-20, UI-21, UI-22, UI-23, UI-44, UI-45, UI-52, UI-54
**Success Criteria** (what must be TRUE):
  1. `settle(callId)` is permissionless and idempotent (second call when status != Live reverts `AlreadySettled`); 14 steps execute atomically (any revert rolls back the whole tx); SettlementManager dispatches to the correct oracle adapter per (marketType, eventSubtype); for Pyth paths, the function signature accepts `bytes[] pythUpdateData` and pre-pushes Hermes VAA in a multicall before `getPriceNoOlderThan(priceId, 60)` (Pitfall 4); for NFT paths, ≥12 observations are required or the read is treated ambiguous (Pitfall 7 magnitude cap).
  2. KMS-signed relayer attestations land via EIP-712 with chainId binding; per-attestation-type signing keys (NFT-TWAP, DefiLlama, CEX, Snapshot, OAuth-proof) are separated in the KMS namespace; 8 CEX scrapers (Binance, Coinbase, OKX, Bybit, Kraken, Bitget, KuCoin, Upbit) operate independently with per-exchange selectors + Innovation Zone exclusion fixtures + weekly synthetic-test CI cron against known recent listings (Pitfall 19 mitigation, Pitfall 10 weekly CI).
  3. Ambiguous-data detection opens a 24h dispute window with a $5 USDC bond; `MAX_COUNTER_CLAIMS = 3` enforced; `raiseDispute` reverts `DisputeWindowClosed` after the window; owner-resolved in v1 with `resolveDispute(callId, finalOutcome)` reversing settlement (rep deltas reversed, pool USDC re-distributed from old-winner to new-winner) — claim-delay decision is implemented per Pitfall 18 (either claim-delay OR shortened dispute window OR auto-post default OFF; documented in operator runbook); `forceSettle` is owner-only and gated by `FORCE_SETTLE_COOLDOWN = 7 days` from expiry, emitting BOTH `CallForceSettled` AND `CallSettled` events for loud audit trail.
  4. SettlementManager step 7 wraps the Stylus rep call in try/catch with the Solidity baseline `_solidityBaselineRepDelta(...)` shipped in-contract from this phase (NOT as a Phase 5 fallback per Delta 3); on Stylus revert, settlement still completes and `RepCalculatedFallback(callId, user, baselineDelta, lowLevelError)` event fires for Telegram alert per OPS-12; cold-start adjustment scales caller's delta to 25% if real fade pool was zero (Pitfall 11 surfaced via Phase 6 dashboard for v1.1 contract-level gate); exited callers receive no settlement rep delta per §8.7.3.
  5. Settlement step 11 applies the 1.7% total extraction (1.0% protocol + 0.4% creator with Model B for exited callers + 0.3% LP into winning pool reserve); step 12 clears the duplicate-hash mapping; step 14 emits `CallSettled(callId, outcome, priceDelta)`; subgraph indexes the event + `DisputeRaised` + `DisputeResolved` + `CallForceSettled` + `RepCalculated` + `RepCalculatedFallback` + `SettlementDelayed` for downstream feeds; settlement-stuck runbook (OPS-15) and Stylus reactivation runbook (OPS-16) are written.
  6. Settled Receipt page (`/call/[id]` when status == Settled or Disputed) renders the 3px page frame + 4px accent corner brackets, sticky caller header (NO wallet address per §15.7), outcome block as visual hero (Syne 96px, color per outcome word — CALLED IT green / LOUD AND WRONG red / CONTRARIAN HIT accent / COLD CALL muted / FADED CORRECTLY accent) with stamp animation (scale 1.2→1.0 overshoot + shadow expansion), 200px-viewport readability QA gate passes on every variant; FINAL POSITIONS block, Caller-Exited variant, and Disputed variant all render with their correct treatments; Settled, CallerExited OG card variants (variants 2, 4) render with cache-busting on state change.
**Plans**: TBD
**UI hint**: yes
**Pitfalls mitigated**: 4 (Pyth pull-model multicall + ETH fee budget monitoring), 5 (Stylus fallback in-contract from Phase 4 — 48h cutoff becomes mechanical upgrade), 6 (public `/disputes/` log + 24h owner public commitment before forceSettle), 7 (KMS storage + per-attestation-type key separation + EIP-712 chainId binding + on-chain TWAP sanity-check secondary path documented), 10 (per-exchange weekly CI cron synthetic test), 11 (cold-start sybil-fade surfaced via relayer analytics dashboard), 18 (claim-delay decision implemented per operator runbook), 19 (per-exchange exclusion fixtures + multi-signal confirmation + high-friction submit path), 22 (LP-fee empty-pool path explicit in settle step 11)

### Phase 5: StylusScoreEngine + 48h cutoff
**Goal**: The Rust reputation engine lands behind a Solidity `TransparentUpgradeableProxy` pointing at the stateless Stylus implementation address (per STACK.md — preserves §10.8 admin-separated-from-logic; OZ Stylus only ships UUPS natively, so the Solidity front is the path of least resistance). Storage lives in ProfileRegistry, not the engine. The 365-day reactivation calendar reminder seeded in Phase 0 stays live with Telegram alerts at T-30d/T-15d/T-7d/T-1d. The `RevertingStylusEngine` test fixture is built in parallel so the Phase 6 destruction drill is mechanical. **Hard cutoff rule:** if Rust + Stylus is not working by 48h before demo, the deploy script runs `proxy.upgradeTo(soliditySolidityBaselineAddress)` (one cast call) — same proxy admin, same address — and the pitch becomes "Stylus in production roadmap."
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: REP-19, REP-20, REP-21, REP-24
**Success Criteria** (what must be TRUE):
  1. StylusScoreEngine Rust crate compiles via `cargo stylus check && cargo stylus deploy --no-verify` with `--locked` for reproducible Sepolia/mainnet build hashes; deployed behind Solidity `TransparentUpgradeableProxy@5.6.1` pointing at the stateless Stylus implementation address; admin key = deployer (multisig promotion happens in Phase 6).
  2. `compute_rep_change(currentRep, conviction, consensusPct, isWinner, baseValue) -> i32` handles confidence multiplier, contrarian multiplier (winners only), high-conviction 2× asymmetry at conviction ≥85, floor clamping at 0; cross-contract call from SettlementManager step 7 succeeds via type-safe `#[public]` trait; `RepCalculated(callId, user, currentRep, conviction, consensusPct, isWinner, baseValue, delta)` event fires with full inputs for debuggability.
  3. `RevertingStylusEngine` test fixture is built in parallel — same proxy slot, intentionally reverts on `compute_rep_change` — and deploys cleanly to Sepolia (drill is run in Phase 6, not here, but the fixture must compile and be ready).
  4. 48h-before-demo cutoff decision rule is documented and pre-staged: Solidity baseline (already in-contract from Phase 4) becomes the proxy target via `cast send proxy "upgradeTo(address)" $SOLIDITY_BASELINE_ADDR` — single mechanical command, tested on Sepolia, no panicked rewrite path; calendar reminders fire 72h, 48h, 24h before the demo to force the go/no-go call.
**Plans**: TBD
**Pitfalls mitigated**: 2 (RevertingStylusEngine fixture built here, drill in Phase 6), 5 (48h cutoff path is mechanical not panicked), 17 (Stylus reactivation runbook + Telegram alerts wired to deploy date)

### Phase 6: Safety review + Sepolia ≥48h + multisig promotion
**Goal**: All safety invariants verified on Sepolia under load for ≥48 hours with seeded activity. Stylus destruction drill proves the Solidity baseline fallback actually runs under the runtime try/catch. TVL cap aggregation boundary tests cover the full CallRegistry + FollowFadeMarket + ChallengeEscrow surface. The full PITFALLS.md "Looks Done But Isn't" 38-item checklist must pass. **Safe 2-of-3 multisig is deployed and ownership of CallRegistry, FollowFadeMarket, ChallengeEscrow, SettlementManager, ProfileRegistry, and the StylusScoreEngine proxy admin is transferred — this is a HARD GATE before mainnet promotion (Risk #2 mitigation). Per Delta 2: multisig promotion is in Phase 6, not v1.1.** Env diff ritual, chain ID grep in bundle, relayer ETH balance check, Pyth feed bytes32 pre-deploy CI verification all run here.
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: SAFETY-02, SAFETY-03, SAFETY-19, SAFETY-20, SAFETY-21, SAFETY-22, SAFETY-23, SAFETY-24, SAFETY-25, SAFETY-26, SAFETY-27, SAFETY-28, SAFETY-29, SAFETY-30, SAFETY-31, SAFETY-32, SAFETY-33, SAFETY-34, SAFETY-35, SAFETY-36, SAFETY-37, SAFETY-38, SAFETY-39, SAFETY-40, SAFETY-41, SAFETY-42, SAFETY-43
**Success Criteria** (what must be TRUE):
  1. Sepolia staging operates ≥48 hours with ≥10 seeded calls covering each call type (Price target, Spread/vs, ≥3 event subtypes), ≥30 follow/fade positions, ≥3 settled calls per call type with outcome words + payouts + rep updates verified, ≥1 caller-exit broadcast verified, ≥1 challenge proposed-accepted-settled cycle, ≥1 dispute raised and owner-resolved, Pyth confidence retry exercised manually with `SettlementDelayed` flow verified.
  2. Stylus destruction drill: `RevertingStylusEngine` is deployed to Sepolia behind the same proxy slot via `proxy.upgradeTo(...)`; SettlementManager.settle is invoked and the try/catch fires correctly, the Solidity baseline path runs, `RepCalculatedFallback` event fires, Telegram alert fires, settlement completes successfully — proving the fallback is real, not theoretical (Pitfall 2 closed).
  3. All Phase 6 contract-level safety verifications pass: emergency pause on every state-changing function, TVL cap boundary ($4,999 OK / $5,001 reverts) aggregated across all 3 contracts holding funds (Pitfall 3 closed), max stake ($100 OK / $101 reverts), min position ($1 OK / $0.99 reverts), withdraw/claim works while paused, caller-exit 24h lock + decay math, follower/fader 4h cooldown + 10% slash math, duplicate-hash UTC-day-boundary edge cases, slippage `minSharesOut` reverts under AMM movement (Pitfall 9 boundary closed), settlement idempotency, self-challenge gate, reentrancy guard against USDC mock callback, owner-only function guards (non-owner cannot pause / setTvlCap / setSettlementManager / setRelayer / forceSettle / resolveDispute).
  4. Safe 2-of-3 multisig is deployed on Arbitrum One; ownership of CallRegistry, FollowFadeMarket, ChallengeEscrow, SettlementManager, ProfileRegistry, and the StylusScoreEngine `TransparentUpgradeableProxy` admin role is transferred to the multisig via Ownable2Step `acceptOwnership`; `cast call <each_contract> "owner()"` returns the multisig address; single-owner-key path is dead before mainnet promotion (Risk #2 closed).
  5. Env diff ritual passes: prod `.env` vs Sepolia `.env` differ ONLY in expected fields (RPC URL, USDC address would NOT differ — both mainnet — chain ID, multisig address, Pyth contract address); `grep -r "arbitrum-sepolia"` in the production bundle returns zero matches; chain ID is hardcoded in the relayer EIP-712 domain separator and verified; relayer ETH balance ≥0.5 ETH for Pyth update VAA fees; Pyth feed bytes32 pre-deploy CI script fetches Hermes for every spec'd asset and asserts the exact `bytes32` matches the in-contract pinning (Pitfall 4 closed, Risk #4 closed).
  6. The PITFALLS.md "Looks Done But Isn't" 38-item checklist gates promotion to Phase 7 — each item physically checked off on Sepolia or in CI; any failing item blocks Phase 7.
**Plans**: TBD
**Pitfalls mitigated**: 2 (destruction drill closed), 3 (TVL cap aggregation boundary verified across all 3 contracts), 4 (Pyth feed pre-deploy CI), 5 (env config drift caught), 6 (multisig promoted — single-key path dead), 7 (KMS-sign integration verified end-to-end + secondary on-chain TWAP sanity-check), 9 (multi-call interference fuzz fixtures), 10 (Sepolia-load post-expiry settle latency monitored), 11 (Phase 6 dashboard surfaces self-fade rep farming patterns for v1.1 gate), 14 (operator runbook for paymaster cap-raising during launch verified), 20 (direct-tx bypass test confirms server-side 24h cooldown enforcement)

### Phase 7: OG service final variants + Subgraph final mappings
**Goal**: All 5 OG card variants finalized (Live, Settled, DuelSettled, CallerExited, Fallback) via @vercel/og + Satori on Node runtime (NOT edge — `resvg-wasm` bundling pain). Flexbox only — a CI lint rule rejects `display: grid` because Satori silently misrenders it (Pitfall 15). Subgraph published from Studio to The Graph Decentralized Network on Arbitrum (~$100-300 GRT curation per ops budget). Auto-post-to-X gated by cache-warm verification — OG service reads from RPC not subgraph for the cache-warm check (Pitfall 8). Twitter Card Validator pre-flight passes for all 5 variants. 200px-viewport outcome-word readability QA gate passes for every outcome word (CALLED IT / LOUD AND WRONG / CONTRARIAN HIT / COLD CALL / FADED CORRECTLY). Critical-path steps 6 (Live receipt renders), 8 (Settled receipt renders), 9 (Share to X/FC), 10 (New user loops back) all close here.
**Mode:** mvp
**Depends on**: Phase 6
**Requirements**: OPS-04, SHARE-01, SHARE-02, SHARE-03, SHARE-13, SHARE-14, SHARE-15, SHARE-16, SHARE-17, SHARE-18, SHARE-20, SHARE-21, UI-09, UI-12, UI-13, UI-26, UI-27, UI-28
**Success Criteria** (what must be TRUE):
  1. OG service at `api.callitapp.xyz/og/[callId]` generates 1200×630 PNG cards for all 5 variants via @vercel/og + satori@0.26.0 on Node runtime; CI lint rule (eslint custom rule) rejects any `display: grid` in OG card source (Pitfall 15); 200px-viewport thumbnail readability QA test (Playwright + visual regression) passes for all 5 outcome words; Twitter Card Validator (`cards-dev.twitter.com/validator`) returns a passing response for the receipt URL of every variant.
  2. Auto-post-to-X (default ON per Advanced Settings) fires on settle only AFTER a cache-warm verification — OG service is hit via `?v={statusVersion}` to force regeneration, then a HEAD request confirms 200 + correct ETag before the post fires; if cache-warm fails, post is delayed up to 30s then retried (Pitfall 8 closed); Farcaster cast URL construction is supported parallel to Twitter intent; auto-post never modifies the user's X account beyond posting (read-only graph access elsewhere).
  3. Subgraph is published to The Graph Decentralized Network on Arbitrum (Studio → Decentralized Network with ~3,000 GRT curation, ~$100-300 cost from ops budget); all events from §12.1–12.5 (CallCreated, CallSettled, CallQuoted, ConvictionCapped, CallerExited, Followed, Faded, PayoutClaimed, PositionExited, ChallengeProposed/Accepted/Rejected/Refunded/Settled, DisputeRaised/Resolved, CallForceSettled, RepCalculated, RepCalculatedFallback, SettlementDelayed, ProfileUpdated, SocialLinked, SocialUnlinked) are indexed; CallCreated is indexed within ~30s of emission for share-loop dependency; polled-events fallback from Phase 0 stays live for the 48–72h post-publish indexer-sync gap.
  4. Profile page Overview tab renders 5-stat row (Accuracy / Calibration / ROI / Contrarian hits / Streak), CATEGORY REPUTATION grid (3 cards), recent calls list with filter chips, most-followed-by list, notable receipts trophy cards; Leaderboard page renders "The Tape · Top of book" title, 7d/30d/All-time toggle, #1 Hero card with massive faded "01" watermark, category filter chips (All / Majors / DeFi / Other), leaderboard table with viewer's row highlighted; Quote Composer + Quote success screen render with parent context card + thread preview.
  5. Receipt page server-renders OpenGraph meta tags referencing the OG card URL with the `?v={statusVersion}` cache-buster; receipts are off-chain OG images referenced onchain by hash for verification (NOT NFTs); receipt page loads without auth (public-by-default per §18.1) with sign-in CTA prominent for unauthenticated viewers.
**Plans**: TBD
**UI hint**: yes
**Pitfalls mitigated**: 8 (cache-warm-verified auto-post), 15 (Satori grid lint rule + 200px visual regression)

### Phase 7.5: Mainnet deploy gate
**Goal**: 20-minute post-deploy smoke test per §19.11 — non-optional before public announcement. This is a hard gate, not a building phase: contracts and frontend deploy to mainnet, ownership is already on the multisig from Phase 6, and the operator walks the 20-minute checklist. If any item fails, contracts pause immediately and no public announcement is made.
**Mode:** mvp
**Depends on**: Phase 7
**Requirements**: SAFETY-44, SAFETY-45, SAFETY-46, SAFETY-47, SAFETY-48, SAFETY-49, SAFETY-50, SAFETY-51, SAFETY-52, SAFETY-53, SAFETY-54, SAFETY-55, SAFETY-56
**Success Criteria** (what must be TRUE):
  1. All contracts deploy to Arbitrum One mainnet; ownership is the Safe 2-of-3 multisig (verified via `cast call <each_contract> "owner()"`); contract bytecode is verified on Arbiscan via `forge verify-contract`; Pyth feed bytes32 in-contract pinning is re-verified against live Hermes (Pitfall 4 final check).
  2. Smoke test verifies `pause()` + `unpause()` execute from multisig wallet and `paused()` view reflects state; deposit while paused reverts `Paused`; withdrawal while paused succeeds per §10.3 carve-out; `setTvlCap` and TVL boundary deposit ($4,901 + $99 succeeds, next $1 reverts `TvlCapReached`); min-stake ($4 reverts, $5 succeeds); max-stake ($101 reverts, $100 succeeds); all 5 oracle adapters exercised with synthetic test calls (Pyth/BTC, DefiLlama TVL, Snapshot/Tally proposal, CEX scrape, Alchemy CryptoPunks floor); `forceSettle` is NOT callable within cooldown window (reverts `ForceSettleCooldownActive`).
  3. End-to-end user-path smoke: all 3 sign-in paths complete to first authenticated session; funding via Coinbase Onramp AND direct USDC transfer both succeed; first sponsored transaction succeeds via paymaster and counter increments; receipt-link share works on Twitter and passes Twitter Card Validator; OG image renders all 5 outcome words at 200px viewport thumbnail size.
  4. If any smoke test item fails: contracts are paused immediately via multisig, no public announcement is made, root cause is diagnosed, fix is shipped, gate is re-run from item 1. Only on full pass does Phase 8 (Mini Apps) and Phase 9 (mobile responsive) work begin.
**Plans**: TBD
**Pitfalls mitigated**: 1 (USDC final paste-failure check), 4 (Pyth feed final check), 5 (env config final check), 6 (multisig ownership final verification)

### Phase 8: Farcaster Mini Apps
**Goal**: Distribution extension via Farcaster Mini Apps (per SUMMARY.md Delta 4 — renamed from Frames v2 with 3-month deprecation notice; `fc:frame` meta tag still works for compat). Frame buttons enable Follow / Fade / Challenge from a Farcaster cast; OpenGraph meta tags + Frame server endpoint + Mini App manifest.
**Mode:** mvp
**Depends on**: Phase 7.5
**Requirements**: SHARE-19
**Success Criteria** (what must be TRUE):
  1. Receipt page server-renders `fc:frame` meta tags AND Farcaster Mini App manifest pointing at the Frame server endpoint; a Farcaster client (Warpcast) loads the cast, renders the Settled receipt OG card, and shows the Follow / Fade / Challenge action buttons.
  2. Tapping a Follow / Fade / Challenge button from a Farcaster post initiates the corresponding transaction flow against the same Phase 1.5 / Phase 2 / Phase 3 contract paths (via Farcaster Frame transaction protocol), without forcing the user out of Warpcast.
  3. Farcaster receipt rendering matches the Twitter OG card variant (Settled / DuelSettled / CallerExited) for visual continuity; auto-post-to-Farcaster cast URL construction (from Phase 7) lands the post and the Mini App is discoverable.
**Plans**: TBD
**UI hint**: yes

### Phase 9: Mobile responsive on 7 critical pages
**Goal**: 375px breakpoint pass on the 7 critical pages — Feed (§15.1), Live Receipt (§15.3), Profile (§15.4), Settled Receipt (§15.7), Sign-in (§15.8), Onboarding (§15.9), Leaderboard (§15.6). Non-critical pages (Duel §15.5, Quote composer §15.10, New Call §15.2) get a "Best viewed on desktop" banner per spec scope cut. Per the spec the share-link landing experience is the priority — viewers arriving from a Twitter/Farcaster share must land on a usable mobile Settled Receipt or feed.
**Mode:** mvp
**Depends on**: Phase 7.5
**Requirements**: UI-48, UI-49, UI-50
**Success Criteria** (what must be TRUE):
  1. At 375px viewport width, each of the 7 critical pages renders single-column with full-width action buttons; left sidebar (on pages that have one) collapses behind a hamburger menu; no horizontal scroll on any page; touch targets meet the 44×44px minimum.
  2. The 3 non-critical pages (Duel, Quote composer, New Call) render the "Best viewed on desktop" banner at the top with a CTA to switch to desktop view; banner does not block return navigation or sign-out.
  3. Share-link landing experience is validated end-to-end on real mobile devices (iOS Safari + Android Chrome): a Twitter Card click lands on the mobile Settled Receipt, the outcome word is legible, the "[ SHARE THE RECEIPT → ]" + "[ VIEW ALL CALLS BY veda ]" buttons stack and are tappable, and the Sign-in CTA is visible for unauthenticated viewers.
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 0 → 1 → 1.5 (parallel with 2) → 2 → 3 → 4 → 5 → 6 → 7 → 7.5 → 8 → 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 0. Foundation | 5/5 | Complete   | 2026-05-22 |
| 1. Core contracts + auth + frontend skeleton | 0/10 | Planned | - |
| 1.5. Social linking | 0/TBD | Not started | - |
| 2. FollowFadeMarket | 0/9 | Planned | - |
| 3. ChallengeEscrow | 0/TBD | Not started | - |
| 4. SettlementManager + 7 oracle paths + Solidity baseline rep delta | 0/TBD | Not started | - |
| 5. StylusScoreEngine + 48h cutoff | 0/TBD | Not started | - |
| 6. Safety review + Sepolia ≥48h + multisig promotion | 0/TBD | Not started | - |
| 7. OG service final variants + Subgraph final mappings | 0/TBD | Not started | - |
| 7.5. Mainnet deploy gate | 0/TBD | Not started | - |
| 8. Farcaster Mini Apps | 0/TBD | Not started | - |
| 9. Mobile responsive on 7 critical pages | 0/TBD | Not started | - |
