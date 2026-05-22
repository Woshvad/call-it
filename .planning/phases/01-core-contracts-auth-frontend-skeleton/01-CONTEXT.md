# Phase 1: Core contracts + auth + frontend skeleton - Context

**Gathered:** 2026-05-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Critical-path steps 1–5 (Sign-up → Fund → First sponsored tx → Compose → Publish) land here at contract + UI level. A real user signs in via any of 3 Privy paths, completes 4-screen onboarding, funds the wallet (with the post-cap UX bridged by Circle's USDC paymaster — see deviation below), gets the first 5 tx sponsored, sees the address book + 24h cooldown enforced server-side, and publishes a real CallRegistry call. The 4 baseline pages (`/`, `/new`, `/profile/[address]`, `/signin`) ship with the locked neobrutalist design system primitives + 6-variant skeleton + 3-status toast — promoted to a new `packages/ui` workspace.

**In scope:**
- Contracts: `CallRegistry` (all anti-spam gates CALL-01..70), `ProfileRegistry` (non-upgradeable per §10.8) — owner = single deployer key (multisig promotion = Phase 6).
- Privy 3-path sign-in (Wallet SIWE, Google OAuth, Twitter OAuth) with locked provider order `<PrivyProvider><QueryClientProvider><WagmiProvider>` + AST regression test (Pitfall 13).
- 4-screen onboarding (Handle → Connect Socials → Follow-graph opt-in cond. → Tagline commitment) + Privy custody disclosure + export prompt at ≥$50.
- Paymaster (ERC-4337) via Alchemy AA + relayer ERC-7677 policy endpoint enforcing the per-user 5-tx cap server-side (AUTH-28, Pitfall 14).
- Post-cap USDC-gas via Circle USDC Paymaster on Arbitrum (spec deviation — see Decisions § Paymaster).
- Address book + 24h cooldown enforced server-side via Fly Postgres + relayer pre-tx hook (AUTH-31/32, Pitfall 20).
- New Call form (`/new`) with 3 mode-conditional sub-forms, debounced duplicate-hash pre-check, shared `<Receipt mode>` live preview, two-step publish modal.
- Feed shell (`/`) with subgraph-primary + 800ms per-request fallback to polled-events worker, cursor pagination, 10s Redis cache on first page.
- Profile shell (`/profile/[address]`) with server-side ENS reverse-record resolution + 24h Redis cache.
- Sign-in page (`/signin`) with 3 CTAs vertically + custody microcopy.
- Design system: new `packages/ui` workspace (Tailwind + CVA, Radix where it earns its place), CSS pseudo-element corner brackets, 6-variant static skeleton (no shimmer), 3-status toast with countdown drain.
- Relayer endpoints: `/paymaster/policy` (ERC-7677), `/addressbook/*`, `/api/calls/preflight`, `/api/calls/dup-check`, `/api/profile/[address]`, `/api/feed`, ENS-cache job.

**Out of scope:**
- Social linking onchain (→ Phase 1.5, parallel) — but the ProfileRegistry `SocialIdentity` slots exist; linkTwitter/linkFarcaster setters land in 1.5.
- FollowFadeMarket contract and Follow/Fade/Exit UX (→ Phase 2).
- ChallengeEscrow contract and Duel page (→ Phase 3).
- SettlementManager + oracle adapters + Settled Receipt page (→ Phase 4).
- Stylus rep engine (→ Phase 5). Solidity baseline rep delta ships in Phase 4 per Roadmap Delta 3, not here.
- Multisig promotion (→ Phase 6 HARD GATE).
- "From your X / Farcaster" feed sections (→ Phase 1.5).
- OG card variants 1–4 (→ Phase 7); only the OG fallback variant from Phase 0 is live.
- Decentralized Network subgraph publish (→ Phase 7) — Phase 1 reads from Sepolia Studio.

</domain>

<decisions>
## Implementation Decisions

### Paymaster (ERC-4337) vendor + gating
- **D-01:** AA vendor is **Alchemy AA**. Same vendor as the NFT API + RPC plan — single billing line, one dashboard, one outage surface. First-class Privy integration. Bundler + paymaster + RPC under one key.
- **D-02:** 5-tx server-side cap is enforced by a **relayer ERC-7677 policy endpoint** at `POST /paymaster/policy`. Vendor calls it on every sponsorship request with userOp + Privy userId; relayer reads the Phase 0 Upstash counter (OPS-13), increments only on confirmed inclusion, returns sign-or-deny. Vendor-agnostic chokepoint. Pitfall 14 demands OUR layer, not the vendor's.
- **D-03:** **One userOp = one tx unit.** Batched calls inside a single userOp (approve + createCall) count as one. Most generous to users and matches how ERC-7677 fires.
- **D-04:** **Post-cap mechanic uses Circle's USDC Paymaster on Arbitrum** (EIP-2612 permit-based). From tx 6 onward, users pay gas in USDC via the Circle paymaster — no relayer involvement, no custom accounting, **no ETH ever required**. Matches the CLAUDE.md `Circle Paymaster + EIP-2612` source.
- **D-05:** **Per-tx EIP-2612 permit signature embedded in the userOp** for tx 6+ (not a one-time blanket permit). Privy hides it as an in-flow modal. Trades one extra signature per tx for zero pull-arbitrary-USDC custody-disclosure burden.
- **D-06: SPEC DEVIATION — AUTH-27 + AUTH-29 are amended.** Spec text says "6th transaction onward requires user-provided ETH" + route to "fund your wallet to continue" flow. We instead continue paying gas in USDC via Circle's paymaster forever, eliminating the ETH-funding requirement entirely. Update REQUIREMENTS.md AUTH-27 / AUTH-29 to reflect the USDC-gas reality before Phase 1 verification.

### Address book + 24h cooldown storage
- **D-07:** **Fly Postgres** is the canonical app DB starting Phase 1. Same region (`iad`) as the relayer, bound to Fly private network, $5–15/mo. Creds in GCP Secret Manager. Daily `pg_dump` to GCS via cron. Tables in Phase 1: `address_book`, `auth_methods`, `onboarding_state` (and `ens_reverse_cache` if not in Redis).
- **D-08:** **Address book storage:** `address_book` rows of `(privy_user_id, address, added_at, label, removed_at NULL)` — never delete, only soft-remove.
- **D-09:** **24h cooldown chokepoint = relayer pre-tx hook.** Every withdrawal-touching userOp flow goes through a relayer endpoint that signs/co-signs after a Postgres lookup. Returns 403 if `now < added_at + 24h`. Pitfall 20 mandate.
- **D-10:** **AUTH-32 (new-auth-method 24h cooldown) enforced in the same chokepoint.** Separate `auth_methods` table `(privy_user_id, auth_type, linked_at)`. Privy webhook (preferred) or session-bootstrap polling populates rows. Withdrawal hook checks BOTH the destination cooldown AND that no auth method used for the current session was added <24h ago.

### Handle namespace strategy
- **D-11:** **Display-priority only — no uniqueness enforced onchain.** ProfileRegistry stores a `displayHandle` per user with no claim system. Resolution per §9.6 (ENS → Twitter → Farcaster → 0x truncated) with the AUTH-35 user override. Saves ~22k gas per profile + dodges the ENS-collision-on-pre-fill conflict.
- **D-12:** **Profile URL is canonical `/profile/[address]`** — address is the only identifier in the URL. Display name resolves server-side at render. No `/[handle]` sugar route in v1 (defer to Phase 7 if the domain change makes it worth it).
- **D-13:** **ENS reverse-record resolution is server-side on profile read with a 24h Redis cache** keyed by address. Relayer queries Mainnet ENS (not Arbitrum). Frontend fetches via `/api/profile/[address]`. Saves Mainnet RPC traffic from each client.
- **D-14:** **ProfileRegistry is non-upgradeable** per spec §10.8. Owner-only `setSettlementManager` / `setRelayer` rotation handles role updates. If the schema changes, ship `ProfileRegistryV2` and dual-read during transition.

### Design system delivery + boundary
- **D-15:** **New `packages/ui` workspace** consumed by `apps/web` now and by Phase 8 Mini Apps later. Promotes Button, Card, Tag, Slider, Toast, Skeleton (6 variants), CornerBrackets, Stamp, Receipt (multi-mode), ConvictionBar.
- **D-16:** **Tailwind + class-variance-authority (CVA)** for variant mapping. Layer Radix primitives (Dialog, Popover, Tooltip, Slider) where they earn their place (A11y + focus management for free); build the rest natively. Reject shadcn/ui — its defaults fight neobrutalist treatment and the "no slop" filter applies.
- **D-17:** **Corner brackets via CSS `::before`/`::after`** with borders. Zero asset load, scales to any size, themeable via `currentColor`. Wrap as `<CornerBrackets>` primitive.
- **D-18:** **Loading skeletons are static gray blocks (no shimmer).** Shimmer is a SaaS-dashboard tell — fails the "no slop" filter. Use `#27272A` (`brand-border`) blocks with the locked hard offset shadow, exactly matching the eventual content layout. 6 variants: feed card, receipt, profile header, leaderboard row, duel card stub, list-item.
- **D-19:** **Toast component is 3-status stacking with countdown drain** (success/info/error). Renders via `<ToastProvider>` at the app root; programmatic API `useToast()`. Auto-dismiss 5s default with a visible countdown bar draining.

### New Call form architecture
- **D-20:** **react-hook-form + `@hookform/resolvers/zod`** for the form state. Handles re-render optimization for the conviction slider, debounced duplicate-hash field, and the 3 mode-conditional sub-forms. Zod schemas live in `packages/shared/src/validation/call-gates.ts` and are shared with the relayer preflight.
- **D-21:** **Shared `<Receipt mode='preview'|'live'|'settled'>` component** in `packages/ui`. Preview mode is bound to form state; live mode is bound to subgraph data (Phase 2); settled mode is bound to settled call data (Phase 4). What the user sees in preview is literally what publishes. Pays back in Phases 2/4/7.
- **D-22:** **Duplicate-hash pre-check: debounced 400ms client call to `/api/calls/dup-check`.** Relayer computes the hash + reads ProfileRegistry/CallRegistry view + returns the existing call ID if matched. Renders the CALL-49 amber "A nearly identical call is already live — quote it instead →" inline above the conviction slider before submit. Pre-empts the contract revert.
- **D-23:** **ProfileRegistry `settledCalls(user)` read via wagmi `useReadContract` on `/new` mount, cached in session.** Drives the CALL-29/31 high-conviction floor messaging. Contract is the authoritative source; one RPC read per `/new` visit.

### Feed data source from day one
- **D-24:** **Subgraph (Sepolia Studio endpoint) as primary + polled-events worker as automatic fallback.** Relayer feed endpoint races the subgraph fetch against an 800ms timer. On timeout/error/`_meta.block.number < currentBlock - 50`, immediately query the polled-events Redis-cached aggregation. Logs `feed_fallback_engaged` events to Better Stack. Per-request circuit breaker, no global state to drift.
- **D-25:** **Cursor pagination, recency desc.** 20-per-page; cursor is `(createdAt, callId)` to break ties. Forward-only scroll; "Trending" / personalized ranking is additive in later phases.
- **D-26:** **Redis 10s TTL cache on the first page only** (the `cursor=null` recency request) — every visitor lands there. Deep pagination and filtered queries skip cache. Saves subgraph quota on the hot path without hiding new activity for long (subgraph indexing latency ≤30s).
- **D-27:** **Studio API key is held by the relayer only.** Frontend hits a relayer proxy `/api/feed`. No Studio key in the frontend bundle.

### Pre-flight server-side validation surface
- **D-28:** **Full pre-flight endpoint at `POST /api/calls/preflight`.** Runs ALL gates before the user signs the userOp: duplicate hash (Gate 6.2), conviction floor (Gate 6.3 — reads ProfileRegistry.settledCalls), asset allowlist (CALL-13), criteria-required (CALL-15/16), TVL cap headroom (CALL-34), USDC allowance + balance (CALL-35/36), paymaster eligibility (informational only — see D-30). Returns `{ field, code, message }[]` on 422.
- **D-29:** **Anti-drift: shared Zod schemas + Foundry↔Vitest parity test.** Per-gate Zod schema in `packages/shared/src/validation/call-gates.ts` is imported by both the RHF resolver and the relayer preflight. A Foundry test fixture posts a matrix of inputs to the contract; a Vitest parity test runs the same matrix through the Zod schemas — they MUST agree. CI guard fails if they diverge. Pairs with Phase 0's grep guards as the new "Phase 1 invariant guard."
- **D-30:** **Paymaster sponsorship is decoupled from preflight.** ERC-7677 policy decides eligibility on user identity (5-tx budget); preflight decides validity on the operation. A failing userOp can still be sponsored (preflight is the UX defense at the form layer; the wallet won't open if preflight failed). Separation of concerns; no double-coupling.
- **D-31:** **Failed-preflight UX is inline field-level errors via the RHF Zod resolver.** Relayer's `{ field, code, message }[]` folds into the form's error state; each renders next to the field. Matches CALL-26 / CALL-48 wording. Single error pattern across all gates.

### Claude's Discretion
- **D-32:** **Onboarding state persistence** across browser-close: persist a `(privy_user_id, step, completed_at)` row in the Postgres `onboarding_state` table at the end of each screen. On next sign-in, resume at the last incomplete step. The Tagline commitment (Screen 4) is the completion signal.
- **D-33:** **Wallet connectors on `/signin`:** wagmi's built-in MetaMask + WalletConnect + CoinbaseWallet connectors. Rabby is detected via MetaMask connector's window.ethereum sniff. No RainbowKit — Privy provides the connection UX. Order on screen per spec §15.8: Connect Wallet (filled accent) > Google > Twitter.
- **D-34:** **Coinbase Onramp integration** lives behind the AUTH-25 "Fund your wallet" CTA inside the onboarding fund step. Uses Coinbase Onramp's hosted-flow popup (NOT redirect) — keeps the onboarding session intact. Direct USDC transfer is the alternative shown side-by-side with the user's deposit address copyable.
- **D-35:** **Feed empty state** copy per spec §15.1 tone register: "No calls yet. Be the first to go on record." with a primary `[+ NEW CALL]` button. Static gray skeleton renders on first load before subgraph response arrives.
- **D-36:** **Wagmi v2 chain config** hardcoded to Arbitrum One (mainnet) and Arbitrum Sepolia (staging) only. `wagmi.chains = [arbitrum, arbitrumSepolia]` per the network profile env. CI grep guard from Phase 0 catches any drift back to wrong chain refs.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec source-of-truth (LOCKED) — `CALL_IT_SPEC1.md`
- §9.1, §9.2, §15.8 — Privy 3-path sign-in + provider integration + sign-in screen
- §9.3, §9.7 — Optional social linking surfaces and unlink path (skeleton lands here; full impl in Phase 1.5)
- §9.6 — Handle resolution priority (ENS → Twitter → Farcaster → 0x truncated)
- §10.1 — Mainnet safety caps ($100 max stake, $5K TVL cap, $5 min stake, $1 min position)
- §10.2 — TVL cap aggregation (Phase 1 CallRegistry must respect, Phase 6 closes full aggregation)
- §10.3 — Pause carve-out (withdraw/claim works while paused; CallRegistry contracts must mirror)
- §10.5 — USDC hardcoded address mandate (Phase 0 grep guard enforces — Phase 1 every transfer must use the constant)
- §10.6 — Privy custody disclosure card + ≥$50 export prompt
- §10.7 — Paymaster $50/day budget + per-user 5-tx cap + alert at 80%
- §10.8 — Single owner key in v1; non-upgradeable contracts except StylusScoreEngine; multisig in Phase 6
- §11.1 — CallRegistry contract responsibilities
- §11.5 — ProfileRegistry contract responsibilities + storage shape
- §12.1 — CallRegistry function signatures + events + reverts
- §12.5 — ProfileRegistry function signatures + events + reverts + AUTH-39/40/41 setter rotation pattern
- §13.1 — Pyth pull oracle pattern (Phase 4, but settlement integration touch-points appear in Phase 1 contract interfaces)
- §15.1 — Feed page layout, tone, empty state
- §15.2 — New Call form layout, modes, conviction slider, advanced settings, two-step publish modal
- §15.4 — Profile page shell (Phase 1 ships shell + Overview tab stub; full Overview is Phase 7)
- §15.8 — Sign-in page CTAs and disclaimer copy
- §15.9 — 4-screen onboarding flow + custody disclosure card
- §16.6 — Fallback OG card (already Phase 0; referenced for parity)

### Project planning artifacts
- `.planning/PROJECT.md` — Project frame, locked decisions, constraints (Spec deviation D-06 must be reflected here after Phase 1 verification)
- `.planning/REQUIREMENTS.md` — REQ-IDs (AUTH-01..44, CALL-01..70, REP-01/02/17/18/28/29, SAFETY-01/04..11/14/18, UI-01..56 subset)
- `.planning/ROADMAP.md` Phase 1 — Goal, success criteria, pitfalls mitigated
- `.planning/STATE.md` — Current position, accumulated decisions
- `.planning/phases/00-foundation/00-CONTEXT.md` — Phase 0 carry-forward (D-01..D-21)
- `.planning/phases/00-foundation/00-RESEARCH.md` — Stack patterns, monorepo conventions
- `.planning/phases/00-foundation/VERIFICATION.md` — Phase 0 hosted resources baseline

### Research (read before planning)
- `.planning/research/STACK.md` — Pinned versions, network choices (treat the CLAUDE.md Technology Stack section as the canonical record)
- `.planning/research/ARCHITECTURE.md` — Component boundaries, monorepo layout, relayer-cluster diagram
- `.planning/research/PITFALLS.md` — Especially Pitfall 1 (USDC paste), 12 (UTC duplicate-hash boundary), 13 (Privy provider order — AST test required), 14 (per-user 5-tx cap enforced server-side), 16 (Privy outage → Connect Wallet fallback UX), 20 (24h cooldown server-side)

### CLAUDE.md (project root) — Operative stack reference
- Technology Stack — Pinned versions for `@privy-io/react-auth@3.27.0`, `@privy-io/wagmi@1.32.5` (note: pinned to `4.0.8` in actual package.json per Phase 0 P01 deviation — verify before planning), `wagmi@2.18.0`, `viem@2.50.4`, `@tanstack/react-query@5.100.11`
- Pinned Addresses — `USDC_ARB_NATIVE` and Pyth contract (Phase 4 use)
- "Circle Paymaster + EIP-2612" source (Arbitrum docs) — primary reference for D-04/D-05 post-cap USDC-gas mechanic
- "What NOT to Use" — bridged USDC.e, Solidity 0.8.28–0.8.33, `@privy-io/wagmi-connector` legacy, edge runtime for OG, `display: grid` in OG cards, MATIC/USD feed, RNDR/USD feed, `delegatecall` to user addresses

### External references locked by user during discussion
- Circle USDC Paymaster on Arbitrum (`docs.arbitrum.io/for-devs/third-party-docs/Circle/usdc-paymaster-quickstart`) — D-04/D-05 mechanic
- ERC-7677 (Paymaster Web Service Capability) — D-02 endpoint contract

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/shared/src/constants/usdc.ts` — `USDC_ARB_NATIVE` TS constant; CallRegistry frontend reads pull from here, never inline.
- `packages/shared/src/constants/networks.ts` — Network profiles, chain IDs; Phase 1 wagmi config consumes.
- `packages/shared/src/constants/addresses.ts` — Where ProfileRegistry / CallRegistry deployment addresses will be appended post-deploy.
- `packages/shared/src/schemas/env-config.ts` — Phase 0 env schema; extend with Phase 1 envs (Privy app id, Alchemy AA key, Postgres URL, ENS RPC, etc).
- `packages/contracts/src/constants/USDC.sol` — Solidity USDC constant; every CallRegistry transfer path uses this.
- `packages/contracts/foundry.toml` — `=0.8.30` pin + `via_ir=false` + fuzz profile (use `ci` for 1000 runs in PR builds).
- `packages/contracts/remappings.txt` — `@openzeppelin/=lib/openzeppelin-contracts/` + `forge-std/=lib/forge-std/src/`.
- `apps/web/lib/og-fallback-render.ts` + `og-fonts.ts` — Phase 0 OG fallback. The Receipt mode='preview'|'live'|'settled' design system primitive should be the source of truth those future OG variants reuse in Phase 7.
- `apps/web/app/layout.tsx` — Currently no provider tree. Phase 1 adds `<PrivyProvider><QueryClientProvider><WagmiProvider>` in this order (Pitfall 13 + AST test).
- `apps/web/tailwind.config.ts` — Neobrutalist color tokens, font stack, border widths already defined; `packages/ui` consumers should extend, not redefine.
- `apps/relayer/src/{routes,lib,workers}/` — Phase 0 relayer skeleton. New routes land here (`/paymaster/policy`, `/api/calls/*`, `/api/feed`, `/addressbook/*`, `/api/profile/*`). Pino structured logging baseline already present.

### Established Patterns
- **Single source of truth files in `packages/shared`** — never hardcode addresses, network constants, fees, Pyth IDs in app code. CI grep guards (Phase 0) enforce.
- **Pino structured logging** — extend with `module`, `correlation_id`, `userId` fields. P0 events go to Telegram per Phase 0 D-15.
- **viem-only on the server.** No ethers. Use `createWalletClient` with the GCP-KMS signer wrapper for any onchain write.
- **Foundry tests live in `packages/contracts/test/`.** Phase 1 adds `CallRegistry.t.sol`, `ProfileRegistry.t.sol`, `CallRegistryGates.t.sol` (anti-spam matrix), `CallRegistryParity.t.sol` (the contract↔preflight parity fixture).
- **Workspace dep convention:** `"@call-it/shared": "workspace:*"` etc. New `packages/ui` follows the same pattern.

### Integration Points
- **GCP KMS / Secret Manager** must hold the new keys before relayer wiring: Privy app secret (Secret Manager), Alchemy AA key (Secret Manager), Postgres URL (Secret Manager), ENS Mainnet RPC URL (Secret Manager). Per-network GCP project separation (D-09 of Phase 0) extends — never reuse Sepolia keys on mainnet.
- **Fly Postgres provisioning** must precede the relayer's address book routes. Migration runner = `node-pg-migrate` or `drizzle-kit` (planner picks). Backup cron → GCS via the Phase 0 OPS plumbing.
- **Subgraph schema (Phase 0 P03)** must include CallRegistry + ProfileRegistry event definitions; if not already, extend in Phase 1 P01 and redeploy to Sepolia Studio.
- **Telegram alerts** extend with paymaster-80%-cap (OPS-13 already exists) + new: address-book-cooldown-bypass-attempt (P0), preflight-contract-drift (P0 — fires from the parity test if it ever fails in CI on a non-PR run).
- **Privy webhook** for `auth.linked` event must be wired to insert into `auth_methods`. Fallback: poll on session bootstrap.
- **ProfileRegistry setter rotation pattern (AUTH-39/40):** deployer key calls `setSettlementManager(addr)` / `setRelayer(addr)` to rotate. SettlementManager arrives in Phase 4 — Phase 1 deploys ProfileRegistry pointing at a placeholder (or makes the function `onlyOwner`-callable with `setSettlementManager(address(0))` initial).

</code_context>

<specifics>
## Specific Ideas

- **Spec deviation D-06 is the single non-trivial direction-change in Phase 1.** Spec language says "user-provided ETH" for tx 6+; we use Circle USDC Paymaster instead. Update REQUIREMENTS.md AUTH-27 / AUTH-29 entries to reflect post-Phase-1 reality. PROJECT.md "Key Decisions" gets a row.
- **The contract↔preflight parity test (D-29) is a first-class CI gate**, not a nice-to-have. It is the "Phase 1 anti-drift guard" analogous to Phase 0's grep guards. Any divergence between the Zod schemas and the contract behavior MUST fail the build.
- **Shared `<Receipt mode>` component (D-21) is the design lever for the entire receipt critical path.** Phases 2 (live), 4 (settled), 7 (OG cards) all reuse the same primitive. Spend the Phase 1 budget on getting it right; it underwrites the receipt-loop story.
- **No `display: grid` in any component that might ever render an OG card.** Even though OG variants are Phase 7, the shared `<Receipt>` is rendered in OG Phase 7 with Satori. Build pure flexbox now; Phase 7 doesn't need to refactor (PITFALLS.md Pitfall 15).
- **Privy provider order test (Pitfall 13):** add `apps/web/tests/privy-provider-order.ast.test.ts` that parses `apps/web/app/Providers.tsx` (or wherever the tree lives) and asserts `PrivyProvider > QueryClientProvider > WagmiProvider`. Fails the build if reordered.
- **Onboarding state row pattern (D-32):** `onboarding_state(privy_user_id PK, current_step int, handle_set_at, socials_step_completed_at, followgraph_optin_at, tagline_committed_at)`. Read on every authenticated session bootstrap; redirect into the resume step if `tagline_committed_at IS NULL`.

</specifics>

<deferred>
## Deferred Ideas

- **ProfileRegistry rep storage schema deep-dive** (monolithic struct vs split mappings vs packed slots) — defer to Phase 4 / Phase 5 when rep math actually lands. Phase 1 needs storage that holds `settledCalls` + `displayHandle` + `socialIdentity` + (placeholder for rep fields). Pack later when rep shape is locked.
- **`/[handle]` sugar route** — defer to Phase 7 with the domain change (D-12 lock).
- **"From your X" / "From your Farcaster" feed sections** — Phase 1.5 (parallel to Phase 2).
- **Trending Duel auto-promotion + Duels tab** — Phase 3 (when ChallengeEscrow ships).
- **Per-event-type Telegram channels for Phase 1 events** — extend Phase 0 D-15 two-channel routing only if alert volume justifies; v1.1 polish.
- **Mainnet ENS resolver cache hit-rate dashboard** (D-13) — basic 24h TTL is enough for Phase 1; metrics can wait.
- **Privy export wallet inline tutorial** beyond the AUTH-22 disclosure card — defer to a v1.1 polish.
- **Form analytics (Mixpanel/PostHog) on /new abandonment** — defer; product-analytics surface lands when traffic justifies.
- **Subgraph 100K-query-tier auto-upgrade alert** — defer to Phase 7 publish to Decentralized Network.
- **Sign-in screen brand animation / hero treatment** — minimum-viable per §15.8; polish later.

### Reviewed Todos (not folded)
- None — no pending todos matched Phase 1 scope at discussion time.

</deferred>

---

*Phase: 1-Core contracts + auth + frontend skeleton*
*Context gathered: 2026-05-22*
