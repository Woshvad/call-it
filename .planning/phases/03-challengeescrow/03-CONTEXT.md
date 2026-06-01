# Phase 3: ChallengeEscrow - Context

**Gathered:** 2026-06-01
**Status:** Ready for planning

<domain>
## Phase Boundary

A new `ChallengeEscrow` contract for 1v1 duels, plus the duel social/distribution surfaces. Any user can `proposeChallenge(callId, stake)` against a **Live**, `openToChallenges == true` call; self-challenge is banned at the contract; the caller has a 24h window to `acceptChallenge` / `rejectChallenge`; `claimRefund` recovers the challenger's stake after timeout; both stakes are escrowed; payout is idempotent (CEI). Asymmetric stakes are allowed with overage returned to the overcommitter. The Duel page (`/duel/[challengeId]`), Trending Duel auto-promotion, Duel King badge, Duels tab, and the variant-3 Duel Settled OG card ship here.

**In scope:**
- `ChallengeEscrow` contract per §11.3 / §12.3 (LOCKED interface): `proposeChallenge` / `acceptChallenge` / `rejectChallenge` / `claimRefund` / `claimDuelPayout` / `getChallenge` with the 11-step propose logic, accept logic, reject/refund logic, and CEI claim logic exactly as specified; self-challenge ban; stake bounds (MIN/MAX_STAKE); `CHALLENGE_ACCEPTANCE_WINDOW = 24h`; `pause()` + Ownable2Step mirroring Phase 1/2.
- **Phase-4-ready settlement seam** (designed now, implemented Phase 4): `settleDuel(challengeId, winner)` guarded `onlySettlementManager`, owner `setSettlementManager(addr)` setter, `markClaimed`/status transitions. No second ChallengeEscrow redeploy.
- **Asymmetric overage handling** (Pitfall 21): hybrid push-then-claim — overage pushed to the overcommitter at settlement; on push failure, recorded as `UnclaimedOverage` pullable via a fallback `claimOverage`.
- **3-way TVL cap (good-citizen)**: `proposeChallenge`/`acceptChallenge` enforce the $5K aggregated cap against `CallRegistry.currentTvl + FollowFadeMarket.getTvl() + own escrow`; ChallengeEscrow exposes its own `getTvl()`.
- Subgraph extension: replace the Phase 0 `challenge-escrow.ts` stub with real handlers for `ChallengeProposed/Accepted/Rejected/Refunded/Settled`, `PayoutClaimed`, plus the `Challenge`, `ChallengePayout`, `UnclaimedOverage`, `TvlSnapshot` entities; redeploy to Sepolia Studio.
- Foundry tests: propose/accept/reject/refund/claim matrix, self-challenge gate, stake-bounds, acceptance-window expiry, idempotent payout, asymmetric overage push + claim fallback, 3-way TVL cap revert, pause carve-outs; Foundry↔Vitest parity (D-29) for the challenge gates.
- Duel page (`/duel/[challengeId]`) per §15.5: THE MARKET hero (asset pair, question, 3-stat: live spread / pot / settles-in), two-column duel card (CALLER yellow-green / VS / CHALLENGER orange) with parallel stat rows + STREAK, MARKET CONSENSUS · LIVE bar, Riding sections both sides, "Side with [X]" CTAs.
- Trending Duel auto-promotion (SOCIAL-40), Duel King badge (SOCIAL-41), Duels tab in feed (SOCIAL-42) — computed by a relayer worker + Postgres.
- Variant-3 Duel Settled OG card route (`/og/duel/[challengeId]`) per §16.4, full layout with settled-only fields stubbed until Phase 4.
- Duel notifications via the existing generic `notifications` table (`challenge_proposed`, `challenge_accepted`, etc.).

**Out of scope:**
- SettlementManager + oracle adapters + the actual duel settlement/payout execution (`settleDuel` *caller*) → Phase 4. Phase 3 only ships the seam ChallengeEscrow exposes.
- The ~1.5× duel rep delta application → Phase 4 (SettlementManager writes via ProfileRegistry `authorizedRepWriters`).
- Full symmetric 3-contract TVL aggregation (FollowFadeMarket/CallRegistry reading ChallengeEscrow) + boundary fuzz → Phase 6 (which redeploys the final mainnet versions).
- Real Duel King output + "recently settled" duels (require settled duels) → exercisable Phase 4, validated under load Phase 6.
- Auto-post-to-X on duel resolution + Twitter Card Validator pre-flight + 200px QA → Phase 7 (cache-warm-verified).
- Mobile responsive for the Duel page → Phase 9 ships a "Best viewed on desktop" banner (Duel is a non-critical page).
- FollowFadeMarket `claimPayout` end-to-end (SOCIAL-46/47): contract body already exists from Phase 2; behavior is only *exercisable* once settlement lands in Phase 4. Not net-new work here.

</domain>

<decisions>
## Implementation Decisions

### Settlement seam (Phase-4-ready, no redeploy)
- **D-01: `settleDuel(challengeId, winner)` mirrors Phase 2's `markSettled`.** Guarded `onlySettlementManager`; owner `setSettlementManager(addr)` setter (deploy at `address(0)`, owner rotates before Phase 4 — same pattern as CallRegistry §410 / ProfileRegistry §119). `settleDuel` only sets `winner` + `status = Settled` (and triggers the overage path, D-03); the winner still pulls funds via the **locked** CEI `claimDuelPayout` (§12.3). Phase 4 plugs in with **no ChallengeEscrow redeploy** — the keystone goal inherited from Phase 2 D-01/D-02.
- **D-02: Per-`challengeId` settlement is the unit.** Because `settleDuel` is keyed by `challengeId`, it naturally supports the many-accepted-duels-per-call model (D-08) — Phase 4 loops over each accepted duel for a call and calls `settleDuel` per duel.

### Asymmetric overage (Pitfall 21)
- **D-03: Hybrid push-then-claim.** §12.3 step 8 buries overage inside winner-only `claimDuelPayout`, which strands a *losing* overcommitter's overage. Instead: settlement **pushes** the overage back to whichever side overcommitted (regardless of win/loss, per §5.3 "returned to its source at settlement"); if the push transfer fails, record an `UnclaimedOverage` the overcommitter pulls via a dedicated `claimOverage(challengeId)`. The subgraph `UnclaimedOverage` entity (Phase 0 scaffolded) tracks any outstanding amount. Most robust against push-griefing while keeping the zero-extra-tx happy path for Privy/EOA wallets.

### TVL cap (good-citizen, no redeploy)
- **D-04: ChallengeEscrow enforces the 3-way aggregated cap on its own deposits.** `proposeChallenge` and `acceptChallenge` both revert `TvlCapReached` when `CallRegistry.currentTvl + FollowFadeMarket.getTvl() + ChallengeEscrow escrow` would exceed the $5K cap. ChallengeEscrow takes constructor refs to CallRegistry + FollowFadeMarket and exposes its own `getTvl()` (feeds the subgraph `TvlSnapshot`). FollowFadeMarket/CallRegistry keep their existing 2-way check (they are deployed + non-upgradeable and don't know ChallengeEscrow).
- **D-05: Full symmetric closure deferred to Phase 6.** Making FFM/CR also count ChallengeEscrow requires redeploying them — Phase 6 already owns "TVL cap aggregation across all 3 contracts + boundary fuzz" and ships the final mainnet versions. Edge case captured: if the cap fills *between* propose and accept, `acceptChallenge` reverts `TvlCapReached`; the challenger recovers via `claimRefund` after the 24h window.

### Trending / Duel King / "Riding" (off-chain product mechanics)
- **D-06: "Riding" = the existing follow/fade participants on the parent call.** "Side with [caller]" maps to **Follow**, "Side with [challenger]" maps to **Fade** on the parent FollowFadeMarket call. Trending's "≥50 Riding backers" = follower count + fader count. The Duel page "Riding sections both sides" render the existing follow/fade lists. **No new contract, no new staking layer** — pure UI/aggregation over Phase 2's AMM.
- **D-07: Trending-pin + Duel King computed by a relayer scheduled worker + Fly Postgres.** A BullMQ repeatable job (Phase 0 stack) reads duel pot (on-chain/subgraph), backer counts (subgraph), and settled-duel history; writes trending-pin state (with a `trending_until` timestamp) and the current Duel King; feed/profile/leaderboard read it via relayer endpoints. Directly reuses the Phase 2 D-13/D-14 notification-fan-out infra. (Subgraph-only and client-side rejected — no wall-clock cron / temporal windows.)
- **D-08: Build the full duel-meta machinery now; settled-dependent parts inert until Phase 4.** Worker + schema + endpoints + UI for Trending, Duel King, and the Duels tab all ship in Phase 3. Active-duel Trending (pot ≥$500 OR ≥50 backers → 4h pin) is fully live. Duel King badge and the "recently settled (7d)" Duels-tab section render placeholders until Phase 4 settlement produces winners; validated under load in Phase 6's seeded settle cycle. Matches Phase 2's build-with-documented-stub approach; avoids a Phase 4 retrofit.

### Duel page + OG card
- **D-09: Many accepted duels per call; route `/duel/[challengeId]`.** No one-accepted-per-call guard — the caller may accept multiple challengers on the same call, locking a *separate* matching stake per accepted duel. **Implications flagged for downstream:** one call can lock N× the caller's stake in escrow (all counted toward the TVL cap, D-04); Phase 4 settlement must loop over **all** accepted duels per call (the spec's §13 "if *a* duel is attached" assumed singular) and stack the ~1.5× rep delta per duel; the D-01 per-challengeId seam already supports this. The Duels tab + Duel page must list/handle multiple concurrent duels on one call.
- **D-10: Duel page liveness reuses Phase 2 D-07/D-08.** Live numeric state (pot, market consensus / live spread, settles-in countdown) via direct contract reads (ChallengeEscrow + FollowFadeMarket reserves + `call.expiry`) on a ~5s poll + window-focus refetch; Riding lists + duel activity via subgraph events through the relayer (800ms race + polled-events fallback). Caller/challenger REP/ACCURACY/IN-CATEGORY/STREAK stats from ProfileRegistry reads + relayer.
- **D-11: Full variant-3 OG route now, settled fields stubbed.** Build `/og/duel/[challengeId]/route.ts` (Node runtime, flexbox-only per Pitfall 15) with the full §16.4 layout (two-avatar, "WINS" in Syne, pot, paired rep deltas, corner brackets), rendering from available data with documented placeholders for settled-only fields (winner/loser highlight, rep deltas) until Phase 4. Active-duel shares fall back to the parent call's Live OG card (variant 1) or the fallback card. Auto-post-on-settle + Twitter Card Validator + 200px QA finalize in Phase 4/7. Mirrors the Phase 2 variant-1-with-`Call #N`-stub precedent.

### Claude's Discretion
- **Duel King "win streak" definition** — interpret as consecutive duel wins within the trailing 7 days, recomputed by the weekly job; tie-break by most recent win then highest pot. Documented assumption, flagged for confirmation in Phase 4 (no real output until duels settle).
- Challenge/overage storage shape (mappings keyed by `challengeId`, escrow accounting), `getTvl()` computation precision — planner/researcher decide within §12.3.
- Trending re-pin / pin-extension behavior when a duel keeps qualifying past 4h; exact relayer endpoint + Postgres schema shapes for trending/king state (reuse the Phase 2 notification table/worker conventions).
- Duels-tab filter-chip wiring (All / Active / Just settled / High-stakes / Trending) and feed-merge logic for pinned trending duels.
- `openToChallenges` feed badge (⚔ OPEN) + challengeable-only feed filter (§5.3) — render from existing on-chain `call.openToChallenges`; placement is design discretion.
- Challenge form: pre-fill challenger stake to match caller's exactly (SOCIAL-30), with override; reuse the Phase 1 preflight/zod gate pattern for stake bounds + USDC allowance/balance pre-checks.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec source-of-truth (LOCKED) — `CALL_IT_SPEC1.md`
- §5.3 — Challenge mechanic: matched-stake default + asymmetric overage "returned to its source at settlement", `openToChallenges` opt-in (default ON, ⚔ OPEN badge + feed filter), Trending Duels (≥$500 pot OR ≥50 Riding backers → 4h pin), Duel King (highest 7-day win streak, weekly), duel-specific share card, Duels tab
- §8.9 — Challenge settlement fee: **1.0% protocol only**, no creator fee, no LP fee; ~1.5× rep movement
- §10.2 — TVL cap aggregation
- §10.3 — Pause carve-out (claim/withdraw paths function while paused)
- §10.8 — Non-upgradeable money contracts; pause+redeploy rollback; single owner key v1 → multisig Phase 6
- §11.3 — ChallengeEscrow responsibilities
- §11.4 — SettlementManager "calls into ChallengeEscrow to trigger payouts" (the D-01 seam consumer, Phase 4)
- §12.3 — **IChallengeEscrow interface (LOCKED)**: enum/struct, `CHALLENGE_ACCEPTANCE_WINDOW`, all events + errors, 11-step propose logic, accept logic, reject/refund logic, CEI claim logic, `pot = min(callerStake, challengerStake) × 2`, `payout = pot × 99 / 100`
- §13 settlement step 8 — duel-attached settlement (**must generalize from singular to many per D-09**)
- §15.1 — Duels tab in the global feed (sections + filter chips)
- §15.5 — Duel page layout (`/duel/[id]`: THE MARKET hero, two-column duel card, MARKET CONSENSUS bar, Riding sections, Side-with CTAs)
- §16.4 — Duel Settled OG card variant 3 layout

### Requirements — `.planning/REQUIREMENTS.md`
- SOCIAL-29..39 (propose/accept/reject/refund/claim, self-challenge ban, asymmetric pot, stake bounds, idempotent payout, escrow + 1% fee, ~1.5× rep)
- SOCIAL-40, SOCIAL-41, SOCIAL-42 (Trending, Duel King, Duels tab)
- SOCIAL-46, SOCIAL-47 (FollowFadeMarket `claimPayout` idempotency + CEI — contract exists from Phase 2, exercised at Phase 4 settlement)
- SOCIAL-48 (full event set: Followed/Faded/PayoutClaimed/PositionExited + Challenge* events)
- SOCIAL-51 (duel-settled two-avatar share card), UI-11 (Duel page), SHARE-07 (Duel Settled OG card variant 3)

### Roadmap + prior phase context
- `.planning/ROADMAP.md` Phase 3 — Goal, 6 success criteria, pitfalls (3 TVL aggregation, 21 overage push-pattern)
- `.planning/phases/02-followfademarket/02-CONTEXT.md` — **D-01/D-02** authorization-surface (settleDuel mirrors markSettled), **D-03** TVL aggregation (now 3-of-3), **D-07/D-08** live-reads + subgraph-activity (Duel page reuse), **D-13/D-14** generic notifications + relayer fan-out (Trending/King worker reuse)
- `.planning/phases/01-core-contracts-auth-frontend-skeleton/01-CONTEXT.md` — D-21 `<Receipt mode>`, D-24 feed pattern, D-29 Foundry↔Vitest parity gate
- `.planning/STATE.md` — accumulated decisions + blockers (budget, Stylus alpha risk)

### Research (read before planning)
- `.planning/research/STACK.md` — pinned versions (Foundry fuzz, subgraph graph-cli, wagmi/viem), network choices
- `.planning/research/ARCHITECTURE.md` — component boundaries, relayer-cluster diagram
- `.planning/research/PITFALLS.md` — Pitfall 3 (TVL aggregation), 15 (no `display: grid` in OG cards), 21 (asymmetric overage push-pattern + unclaimed-overage entity)

### Deployed contracts + code (read the source before extending)
- `packages/contracts/src/CallRegistry.sol` — deployed Sepolia (`0x7DAd732764abfC935aD5bf8e5CFF9BEA7B2C234D`); read for call data (`getCall`, `openToChallenges`, `status`, `expiry`, `currentTvl`); `setSettlementManager`/`markSettled` reference impl (§410/§442). ChallengeEscrow reads it — **no CR redeploy** (read-only consumer).
- `packages/contracts/src/FollowFadeMarket.sol` — deployed Sepolia (`0x12aafa5a70c3aD8Bd3a52252744f9F7Aa073E362`); `getTvl()` for the 3-way cap; follow/fade reserves for market-consensus reads.
- `packages/contracts/src/ProfileRegistry.sol` — deployed Sepolia (`0xAfe239a3606b89Ef65DbBcDb1b87a920052c359E`); `authorizedRepWriters` (Phase 4 wires SettlementManager for duel rep deltas); profile reads for duel-card stats.
- `packages/contracts/src/interfaces/IFollowFadeMarket.sol`, `ICallRegistry.sol`, `IProfileRegistry.sol` — add `IChallengeEscrow.sol`.
- `packages/contracts/src/constants/USDC.sol` — every transfer path uses this constant (CI grep guard).
- `packages/contracts/foundry.toml` — `=0.8.30` pin + fuzz profile (`ci` = 1000 runs) for challenge property tests.
- `packages/subgraph/src/challenge-escrow.ts` — **Phase 0 stub already anticipates** `Challenge`, `ChallengePayout`, `UnclaimedOverage`, `TvlSnapshot` entities + `ChallengeProposed/Accepted/Settled/PaidOut/UnclaimedOverageCreated/TvlSnapshot` handlers. Replace stub with real handlers.
- `packages/shared/src/constants/addresses.ts` — add `CHALLENGE_ESCROW_*` after deploy.
- `packages/subgraph/subgraph.yaml` — add ChallengeEscrow data source + `startBlock` after deploy.
- `apps/web/app/og/[callId]/route.ts` — Phase 2 Live OG variant-1 route (Node runtime, flexbox, `renderFallback`, `Call #N` documented stub) — the pattern `/og/duel/[challengeId]` mirrors.
- `apps/relayer/src/{routes,lib,workers}/` — Phase 2 notification worker + live-state proxy route; add the trending/Duel-King worker + duel live-state + Duels-tab endpoints here.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`<Receipt mode>` + duel-card-stub primitive in `packages/ui` (Phase 1 D-15/D-21).** Phase 1 already shipped a "duel card stub" skeleton variant; the Duel page is its primary consumer. ConvictionBar / CallCard / CornerBrackets / market-positioning-bar reuse here.
- **Phase 2 live-state route + activity-feed pattern (02-07/02-08, D-07/D-08).** Direct contract reads + ~5s poll + subgraph activity via relayer (800ms race + polled fallback) — extend with ChallengeEscrow reads for the Duel page.
- **Phase 2 notification infra (D-13/D-14): generic `notifications` table (`event_type`) + relayer fan-out worker + web inbox.** `challenge_proposed`/`challenge_accepted` event types were anticipated — wire duel notifications here, no new mechanism.
- **Phase 2 Live OG route (`/og/[callId]`)** — Node runtime, flexbox-only, `renderFallback`, cache headers, `?v={statusVersion}` cache-bust. Clone the shape for `/og/duel/[challengeId]`.
- `packages/shared/src/constants/{usdc,networks,addresses}.ts` — single source of truth (CI grep guards).
- `packages/contracts/test/` + `helpers/`/`fixtures/`/`mocks/` — `FfmTestHelper` and the Phase 2 test scaffolds are templates for `ChallengeEscrow.t.sol` + gates + parity.
- Shared Zod gates + Foundry↔Vitest parity (D-29) — extend for challenge stake bounds / self-challenge / window / cap.

### Established Patterns
- Single source of truth in `packages/shared`; never inline addresses/networks/fees. CI grep guards (Phase 0).
- viem-only on the server; `createWalletClient` + GCP-KMS signer for any onchain write (e.g. Phase 4 settlement; Phase 3 reads are public clients).
- Foundry tests in `packages/contracts/test/`; `=0.8.30` pin; property fuzz for invariants (overage conservation, escrow == sum-of-stakes, payout ≤ pot).
- Ownable2Step + `pause()` with claim/withdraw carve-outs (§10.3); ownership → 2-of-3 multisig in Phase 6.
- Subgraph extension + redeploy to Sepolia Studio after the contract deploy; addresses.ts + subgraph.yaml updated together.

### Integration Points
- **ChallengeEscrow deploy** → new contract; constructor takes CallRegistry + FollowFadeMarket + ProfileRegistry(?) + USDC + treasury; `DeployPhase3.s.sol` deploys it and (optionally) sets nothing on CR/FFM (read-only). `setSettlementManager` left at `address(0)` until Phase 4.
- **No CallRegistry/FollowFadeMarket/ProfileRegistry redeploy** in Phase 3 — ChallengeEscrow is a read-only consumer of CR/FFM and writes nothing to them. (Contrast Phase 2's double redeploy.) Confirm during planning that `getCall`/`getTvl` views are sufficient.
- **Subgraph** → new ChallengeEscrow data source + `startBlock`; real handlers replace the Phase 0 `challenge-escrow.ts` stub.
- **Relayer** → new trending/Duel-King worker (BullMQ repeatable) + Postgres tables (`trending_duels`, `duel_kings` or similar) + duel live-state + Duels-tab + Duel-page-stats endpoints; extend the notifications table usage.
- **Telegram alerts (Phase 0)** — optionally extend with a duel-related alert (e.g. trending-duel fired); not required by spec.
- **SettlementManager (Phase 4)** plugs into `setSettlementManager` + `settleDuel` + ProfileRegistry `authorizedRepWriters` — no ChallengeEscrow redeploy.

</code_context>

<specifics>
## Specific Ideas

- **The `settleDuel` seam is the Phase-3 keystone (D-01), exactly like Phase 2's `markSettled`.** Get the authorization surface + overage push-then-claim right now so Phase 4's SettlementManager is a pure plug-in and the mainnet deploy (Phase 7.5) ships this exact ChallengeEscrow with no redeploy.
- **Overage must never be stranded (Pitfall 21).** The losing overcommitter never calls `claimDuelPayout`, so overage cannot live only there. Push at settlement + `claimOverage` fallback + `UnclaimedOverage` subgraph entity is the locked design (D-03).
- **"Many accepted duels per call" (D-09) is a deliberate divergence from the spec's singular "a duel" framing.** It is the most consequential decision in this phase: it multiplies caller stake exposure (still bounded per-challenge by MAX_STAKE, but N duels = N× lockup, all TVL-counted), and Phase 4 settlement + rep math must be 1-to-many. Carry this implication into RESEARCH.md and the Phase 4 context loudly.
- **"Riding" is not a new mechanic (D-06).** It is the existing follow/fade graph on the parent call. Building a separate duel side-bet layer would be scope creep and a new contract — explicitly rejected.
- **Duel King + recently-settled surfaces produce no real data until Phase 4** (no settlements yet). Build the machinery now (D-08), render placeholders, validate in Phase 6's seeded settle cycle.
- **Flexbox only in the OG card (Pitfall 15).** `/og/duel/[challengeId]` must never use `display: grid` — Satori silently misrenders it.

</specifics>

<deferred>
## Deferred Ideas

- **Full symmetric 3-contract TVL aggregation (FFM/CR read ChallengeEscrow) + boundary fuzz** → Phase 6 (redeploys final mainnet versions; D-05).
- **Actual duel settlement + payout execution + ~1.5× rep delta application** → Phase 4 (ChallengeEscrow only exposes the `settleDuel` seam now).
- **Real Duel King output + recently-settled Duels-tab section** → exercisable Phase 4, load-validated Phase 6.
- **Auto-post-to-X on duel resolution + Twitter Card Validator pre-flight + 200px readability QA** → Phase 7.
- **Duel page mobile-responsive pass** → out of scope entirely; Phase 9 ships a "Best viewed on desktop" banner (non-critical page).
- **Duel King "win streak" precise semantics confirmation** → revisit in Phase 4 when settled duels exist (documented assumption used until then).
- **Telegram alert for trending-duel events** → optional v1.1 polish if alert volume justifies.

### Reviewed Todos (not folded)
None — no pending todos matched Phase 3 scope at discussion time.

</deferred>

---

*Phase: 3-ChallengeEscrow*
*Context gathered: 2026-06-01*
