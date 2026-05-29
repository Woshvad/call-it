# Phase 2: FollowFadeMarket - Context

**Gathered:** 2026-05-29
**Status:** Ready for planning

<domain>
## Phase Boundary

A single FollowFadeMarket contract holds per-`callId` sub-state and runs the constant-product AMM (`follow_shares × fade_shares = k`) for follow/fade positions. Anyone can Follow or Fade any live call ($1–$100 USDC, slippage-protected `minSharesOut`); followers/faders exit after a 4h cooldown with a flat 10% slash; the caller can exit after a 24h lock with a time-decaying penalty (15% floor) + public broadcast + rep slash. The Live Receipt page (`/call/[id]`) renders the in-progress receipt with a live activity feed, market-positioning bar, exit flows, and quote-calls column; the Live-state OG card (variant 1) renders at `/og/[callId]`.

**In scope:**
- `FollowFadeMarket` contract (single-contract sub-state per §11.2 lock): `follow`/`fade` with `minSharesOut`, `exitPosition` (4h/10%), caller exit (24h lock + decay + 50/40/10 split + rep slash), penalty-injection-into-reserve semantics, post-expiry/pause/status gates, `getTvl()` + aggregated TVL cap enforcement, AMM k-invariant.
- **Redeploy `CallRegistry`** (Sepolia) as single USDC custodian: forwards caller stake into FollowFadeMarket + inits the per-call follow pool; Phase-4-ready authorization surface (market + settlement hooks, guarded status transitions).
- **Redeploy `ProfileRegistry`** (Sepolia) with a generic authorized-rep-writer set so caller-exit can apply the rep slash.
- Live Receipt page (`/call/[id]`, status Live/CallerExited): sticky caller header, THE CALL hero, 4-stat row, market positioning bar, 3 action buttons (Follow/Fade/Challenge), REASONING + optional RESOLUTION CRITERIA, live activity feed (left), quote-calls column (right, FADING/FOLLOWING tag), caller/position exit links + confirmation modals (SOCIAL-49/50, UI-06/07, SHARE-04).
- Live-state OG card variant 1 (`/og/[callId]`) with follow%/fade% bar + time-left countdown + corner brackets + `?v={statusVersion}` cache-bust.
- **In-app notification center** (Fly Postgres + relayer fan-out worker + web inbox) for SOCIAL-24 caller-exit notifications; generic `event_type` schema reused by Phase 3/4.
- Quote-call UI threading (on-chain `parentCallId`/`CallQuoted` already exist from Phase 1) + off-chain FADING/FOLLOWING stance.
- Subgraph extension (FollowFadeMarket events) + redeploy to Sepolia Studio; Foundry AMM-invariant + interference + empty-pool fuzz tests.

**Out of scope:**
- ChallengeEscrow contract, Duel page, Trending Duel, Duel King, Duels tab (SOCIAL-29..42, SOCIAL-51) → Phase 3.
- `claimPayout` exercised end-to-end (requires settlement) + Settled-state Receipt + Settled/CallerExited OG variants → Phase 4 / Phase 7. (Interface present in §12.2; payout flow activates with SettlementManager.)
- SettlementManager + oracle adapters → Phase 4. (Phase 2 only wires the `setSettlementManager` + `markSettled` + authorized-rep-writer hooks so Phase 4 is a plug-in, no third redeploy.)
- Full 3-contract TVL aggregation + boundary fuzz (ChallengeEscrow included) → Phase 6.
- Stylus / Solidity-baseline win-loss rep math → Phase 4/5. (Phase 2 caller-exit slash is a separate, simple decay curve.)
- "From your X/Farcaster" feed sections, VERIFIED badges → Phase 1.5 (parallel).
- Push / email / SSE notifications → v1.1 (Phase 2 ships polled in-app only).

</domain>

<decisions>
## Implementation Decisions

### Contract custody + integration (the redeploy)
- **D-01: Single-custodian redeploy.** Redeploy `CallRegistry` so `createCall` forwards the caller's stake into FollowFadeMarket and initializes the per-call follow pool (caller stake) + the $7 virtual fade seed accounting (§8.2). ALL real market USDC — caller stakes + follower/fader deposits + injected penalties — lives in FollowFadeMarket, a single custodian. This makes Phase 4 settlement a local transfer (winning pool splits losing pool, which includes the caller's stake) instead of a cross-contract USDC dance, and keeps exit slash-injection + TVL math local.
- **D-02: Phase-4-ready authorization surface on the redeployed CallRegistry.** Owner setters `setFollowFadeMarket(addr)` + `setSettlementManager(addr)`; stake-forwarding in `createCall`; guarded status transitions — `markCallerExited(callId)` callable only by FollowFadeMarket, `markSettled(callId, outcome)` callable only by SettlementManager (wired in Phase 4 via the existing setter — no second redeploy). `call.status` stays the single source of truth (SOCIAL-21, no redundant boolean).
- **D-03: TVL aggregated now (2 of 3 contracts).** `follow`/`fade` enforce the $5K cap against `CallRegistry.currentTvl + FollowFadeMarket` pool totals on every deposit (revert `TvlCapReached`). Phase 6 folds in ChallengeEscrow + the boundary fuzz tests. Closes the SOCIAL-09 vs Pitfall-3 ("Phase 6 aggregates") gap so combined TVL never silently exceeds the cap during Phase 2.
- **D-04: Redeploy ProfileRegistry too, with a generic authorized-rep-writer set.** `mapping(address => bool) authorizedRepWriters`, owner-managed. FollowFadeMarket is authorized so caller-exit writes the rep slash directly; SettlementManager joins the same set in Phase 4. The redeployed CallRegistry's constructor points at the new ProfileRegistry. Both redeploys happen together — Sepolia-only, §10.8 blesses pause+redeploy; mainnet (Phase 7.5) ships these final versions.
- **D-05: Caller-exit rep slash computed in FollowFadeMarket.** The `-45` (day 1) → `-10` (floor) decay is a simple time-based curve over the call lifetime; FollowFadeMarket knows the exit timing, computes the delta, and calls `profileRegistry.applyRepDelta(caller, delta)` inside the caller-exit tx (single tx, applied immediately per SOCIAL-26). Distinct from the win/loss rep math (Solidity baseline Phase 4 / Stylus Phase 5).
- **D-06: FollowFadeMarket ownership/pause mirrors Phase 1.** Single deployer key, Ownable2Step, emergency `pause()`; `exitPosition` + `claimPayout` are pause carve-outs (§10.3); ownership transfers to the 2-of-3 multisig in Phase 6.

### Live Receipt liveness
- **D-07: Live numeric state via direct contract reads + poll + optimistic.** follow%/fade% bar, share price, and the user's position read directly from FollowFadeMarket via wagmi `useReadContract`; refetch on a ~5s interval + on window focus; optimistically reflect the user's OWN follow/fade before confirmation. Fresh on-chain reserves (no ~30s indexer lag) also feed accurate `minSharesOut`.
- **D-08: Activity feed via subgraph events, polled.** The who-followed/faded list (amounts, relative time, VERIFIED·X badge) is sourced from subgraph events (`Followed`/`Faded`/`CallerExited`/`PositionExited`) through the relayer, reusing the Phase 1 D-24 800ms-race + polled-events fallback; refetched on the same ~5s cadence. Append-only history fits the subgraph; the polled-events worker covers the indexer-sync gap.
- **D-09: OG cache-bust on status change + throttled activity.** `og:image?v={statusVersion}` bumps `statusVersion` ALWAYS on status transitions (Live→CallerExited→Settled) plus a throttled bump on follow/fade activity (at most ~once per few minutes). The in-app feed handles real-time; the shared social card doesn't need per-second freshness. Controls @vercel/og regeneration + CDN churn; sets up Pitfall-8 cache-warm verification (Phase 7).

### Slippage + exit UX
- **D-10: SlippageExceeded → refresh + explicit retry.** On revert, re-read pool reserves, show the updated expected shares ("price moved — you'll now get ~X shares"), and offer a one-tap retry. No silent auto-retry — never override the slippage guard's intent. `minSharesOut` stays expected + 1% per SOCIAL-06.
- **D-11: Exit-modal friction proportional to consequence.** Caller exit (irreversible, public, rep-slashing) = **type-to-confirm** (type a word, e.g. "EXIT") with the full penalty / return amount / rep-impact / public-broadcast warning. Position exit (flat 10%, lower-stakes) = **single confirm button** showing the math (SOCIAL-49/50).
- **D-12: Caller-exit modal surfaces decay context.** Display "Exit now: X% penalty · drops toward 15% as expiry nears." Nudges callers to think before bailing early and rewards holding — aligns with the accountability ethos.

### Notifications
- **D-13: Full in-app notification center (polled, no push).** A `notifications` table in Fly Postgres; a relayer worker watches `CallerExited` events, resolves current follower/fader addresses via the subgraph, and writes one row per affected user. The web app surfaces a bell + unread badge + inbox list + mark-read, polled (no push/email/SSE). Satisfies SOCIAL-24's per-user notification requirement.
- **D-14: Generic, reusable notifications schema.** An `event_type` column (`caller_exited` now; `settlement_ready` / `challenge_proposed` / `payout_available` later) so Phase 3 (duels) and Phase 4 (settlement) reuse the same table + inbox. Fan-out is off-chain (relayer reads the subgraph for current holders) — NO unbounded on-chain loops (gas/DoS safety).

### Quote-calls
- **D-15: Quote-call FADING/FOLLOWING = explicit stance picked at quote time.** The `/new?quote=parentId` composer asks the quoter to declare "Following" or "Fading" the parent's take. Deterministic, matches the social "I'm fading this" intent, no fragile inference. Stored off-chain (relayer DB / subgraph) keyed to the on-chain `CallQuoted(parentCallId, quoteCallId)` relationship — keeps CallRegistry lean (no per-call stance field). Renders in the Live Receipt quote column (SOCIAL-45).

### Claude's Discretion
- Pool / share-balance storage shape (nested mappings keyed by `callId` per §11.2), AMM rounding/precision, share decimals — planner/researcher decide within §11.2 + §12.2 constraints.
- Exact shape of the caller-exit rep-slash decay (linear vs curved between -45 and -10) — spec only says "decay curve -45 day 1 → -10 floor."
- Notification inbox UI placement, polling interval specifics, and unread-count semantics.
- Subgraph schema extension details for FollowFadeMarket events (the Phase 0 23-entity schema already scaffolds most; extend + redeploy to Sepolia Studio).
- Relayer endpoint shapes for the live-state proxy and notification fan-out worker.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec source-of-truth (LOCKED) — `CALL_IT_SPEC1.md`
- §5.1, §5.2 — Follow / Fade definitions
- §5.4, §15.10 — Quote-call + quote composer (SOCIAL-43/45; direction stance)
- §8.1 — Parimutuel pool-split constant-product AMM (chosen over LMSR/orderbook)
- §8.2 — Cold-start virtual fade seed ($2 base → $7 with creation fee; accounting-only, dissolves at settlement)
- §8.4 — Min ($1) / max ($100, cumulative) position
- §8.7.1 — Follower/fader exit (4h cooldown, 10% slash, 50/40/10 split)
- §8.7.2 — Caller exit (24h lock, `15% + (35% × time_remaining_ratio)` floor 15%, 50/40/10 split, CallerExited markets stay open)
- §8.7.3 — Caller-exit public broadcast + notifications + rep slash + permanent banner
- §8.7.4 — No separate "cancel the call" mechanic
- §8.8 — Model B creator fee (`callerVolumeAtExit` snapshot at exit; fee applied at settlement)
- §10.2 — TVL cap aggregation
- §10.3 — Pause carve-out (`exitPosition`/`claimPayout` function while paused)
- §10.8 — Non-upgradeable money contracts; pause+redeploy rollback policy; single owner key v1 → multisig Phase 6
- §11.2 — **FollowFadeMarket locked architecture** (single contract, sub-state keyed by callId, penalty-injection-into-reserve semantics)
- §11.5 — ProfileRegistry write authorization (SettlementManager + relayer for social linking)
- §12.2 — **IFollowFadeMarket interface** (`follow`/`fade`/`exitPosition`/`claimPayout` signatures, constants, errors, deposit/exit/claim step logic)
- §15.3 — Live Receipt page layout (sticky header, THE CALL hero, 4-stat row, positioning bar, 3 action buttons, activity feed, quote column, exit links)
- §16 (variant 1) — Live State OG card

### Requirements — `.planning/REQUIREMENTS.md`
- SOCIAL-01..28 (follow/fade AMM, slippage, position + caller exits, penalty injection, broadcast, notifications, rep slash)
- SOCIAL-43, SOCIAL-44, SOCIAL-45 (quote-call + Live Receipt activity feed + quote column)
- UI-06, UI-07, SHARE-04 (Live Receipt UI + Live OG card)

### Roadmap + prior phase context
- `.planning/ROADMAP.md` Phase 2 — Goal, 6 success criteria, pitfalls (3, 8, 9, 10, 22)
- `.planning/phases/01-core-contracts-auth-frontend-skeleton/01-CONTEXT.md` — D-21 `<Receipt mode='live'>`, D-24/25/26/27 feed pattern, D-13 ENS cache, D-07 Fly Postgres, D-14 ProfileRegistry non-upgradeable + setter rotation, D-29 parity-test pattern
- `.planning/STATE.md` — accumulated decisions + blockers (budget, Stylus alpha risk)

### Research (read before planning)
- `.planning/research/STACK.md` — pinned versions (wagmi/viem, Foundry fuzz, subgraph), network choices
- `.planning/research/ARCHITECTURE.md` — component boundaries, relayer-cluster diagram
- `.planning/research/PITFALLS.md` — Pitfall 3 (TVL aggregation), 8 (OG cache-bust on state change), 9 (per-callId AMM k-invariant property fuzz), 10 (post-expiry `follow`/`fade` gate), 22 (empty-pool LP-fee routes to treasury)

### Deployed contracts (read the source before redeploying)
- `packages/contracts/src/CallRegistry.sol` — deployed Sepolia; holds stake, `currentTvl`, `parentCallId`, emits `CallQuoted`; to be redeployed with market/settlement hooks (D-01/D-02)
- `packages/contracts/src/ProfileRegistry.sol` — deployed Sepolia; to be redeployed with `authorizedRepWriters` set (D-04)
- `packages/contracts/src/interfaces/ICallRegistry.sol`, `IProfileRegistry.sol`
- `packages/shared/src/constants/addresses.ts` — `CALL_REGISTRY_*` / `PROFILE_REGISTRY_*` addresses to update after redeploy; add `FOLLOW_FADE_MARKET_*`
- `packages/subgraph/subgraph.yaml` — data-source addresses + `startBlock` to update after redeploy; add FollowFadeMarket data source

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`<Receipt mode='live'>` in `packages/ui` (D-21)** — bind to live contract reads (D-07) + subgraph activity (D-08); the Live Receipt page is its primary consumer. ConvictionBar / CallCard / market-positioning-bar primitives also reuse here.
- **D-24 feed pattern** (relayer subgraph fetch + 800ms race + polled-events fallback + Redis cache) — reuse for the activity feed (D-08).
- `packages/shared/src/constants/{usdc,networks,addresses}.ts` — USDC + network + contract addresses single source (CI grep guards enforce).
- `packages/contracts/src/constants/USDC.sol` — every transfer path uses this constant.
- `packages/contracts/foundry.toml` — `=0.8.30` pin + fuzz profile (`ci` = 1000 runs) for the AMM k-invariant property tests (Pitfall 9).
- `apps/relayer/src/{routes,lib,workers}/` — Phase 1 skeleton; new FollowFadeMarket live-state proxy route + notification fan-out worker land here (Pino logging baseline present).
- **Fly Postgres (D-07)** — add `notifications` table (D-13/14) + optional `quote_stance` annotation table (D-15).

### Established Patterns
- Single source of truth in `packages/shared`; never inline addresses/networks/fees. CI grep guards (Phase 0).
- viem-only on the server; `createWalletClient` + GCP-KMS signer for any onchain write.
- Foundry tests in `packages/contracts/test/` — add `FollowFadeMarket.t.sol`, `FollowFadeMarketGates.t.sol`, AMM k-invariant property fuzz, **multi-call interference fixtures (Pitfall 9)**, **empty-pool LP-fee→treasury fixture (Pitfall 22)**.
- Shared Zod schemas + Foundry↔Vitest parity (D-29 pattern) — extend for follow/fade/exit gates (min/max/cumulative position, slippage, post-expiry, status).
- Subgraph extension + redeploy to Sepolia Studio after each contract redeploy.

### Integration Points
- **CallRegistry redeploy** → update `addresses.ts` + `subgraph.yaml` (address + `startBlock`) + re-seed Sepolia test data + re-fund test wallets. **Operator action.**
- **ProfileRegistry redeploy** → redeployed CallRegistry constructor points at the new ProfileRegistry; update `addresses.ts` + subgraph.
- **FollowFadeMarket** → new contract + new subgraph data source + new `addresses.ts` entry; `DeployPhase2.s.sol` wires `setFollowFadeMarket` on CallRegistry + authorizes FollowFadeMarket in ProfileRegistry's writer set.
- **Telegram alerts (Phase 0)** — extend with caller-exit broadcast + AMM-invariant-violation guard (TVL-cap-approach already exists).
- **SettlementManager (Phase 4)** plugs into the existing `setSettlementManager` + `markSettled` + `authorizedRepWriters` — no third redeploy.

</code_context>

<specifics>
## Specific Ideas

- **The single-custodian double-redeploy (CallRegistry + ProfileRegistry) is the keystone of this phase.** Design both contracts' authorization surfaces once, Phase-4-ready, so Phase 4's SettlementManager is a pure plug-in and the mainnet deploy (Phase 7.5) ships these exact final versions. Avoid a third redeploy.
- **Caller-stake-as-follow-pool only works cleanly if all USDC is in one place.** At settlement the winning pool splits the losing pool *including the caller's stake* — D-01 makes that a local transfer, not a cross-contract reconciliation.
- **Penalty injection grows the pool reserve / `k` (no phantom shares minted)** — SOCIAL-11 / §11.2 must be implemented exactly: slashed USDC is added directly to the receiving reserve and existing shares appreciate pro-rata.
- **AMM `k`-invariant property fuzz (Pitfall 9) + empty-pool LP-fee→treasury (Pitfall 22) are first-class CI gates**, analogous to Phase 1's contract↔preflight parity test. A divergence must fail the build.
- **The notification center is generic from day one (D-14).** Build the reusable `event_type` table + inbox; do NOT build a caller-exit-only mechanism that Phase 3/4 have to replace.
- **Fresh on-chain reads drive both the live bar and slippage (D-07/D-10).** The Live Receipt reading reserves directly is what makes `minSharesOut` accurate and slippage reverts rare.

</specifics>

<deferred>
## Deferred Ideas

- **ChallengeEscrow TVL into the aggregate + full 3-contract boundary fuzz** → Phase 6.
- **Trending Duel auto-promotion, Duel King badge, Duels tab** (SOCIAL-40/41/42) + duel-settled share card (SOCIAL-51) → Phase 3.
- **`claimPayout` end-to-end** (requires settlement) → activates with SettlementManager in Phase 4 (interface present in §12.2; payout flow exercised then).
- **Settled-state Receipt rendering + Settled/CallerExited OG variants** → Phase 4 / Phase 7.
- **Model B creator-fee application** — `callerVolumeAtExit` snapshot is captured at caller-exit in Phase 2; the actual fee routing happens at settlement (Phase 4).
- **Push / email notifications + real-time SSE/WebSocket upgrade** for the live receipt → v1.1 polish if polling proves insufficient.
- **"From your X / Farcaster" feed sections + VERIFIED badges** → Phase 1.5 (parallel stream).

</deferred>

---

*Phase: 2-FollowFadeMarket*
*Context gathered: 2026-05-29*
