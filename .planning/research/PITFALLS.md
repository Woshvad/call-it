# Pitfalls Research — Call It

**Domain:** Onchain social prediction market on Arbitrum mainnet (real USDC, person-first reputation, parimutuel AMM with per-call sub-state, Stylus/Rust scoring + Solidity fallback, embedded Privy wallets, off-chain OG receipts, signed-relayer attestation oracles)
**Researched:** 2026-05-21
**Confidence:** HIGH on spec-corroborated pitfalls (cross-referenced with spec section IDs); HIGH on pitfalls corroborated by 2024–2026 public incidents (Compound Sonne, Polygon POL migration, Wintermute Optimism multisig, Mango Markets oracle, Pyth pull-model footguns, Polymarket UMA Ukraine-mineral-deal attack March 2025); MEDIUM on AMM sub-state aggregation traps (inferred from 2023–2025 lending-pool aggregation bugs); MEDIUM on OG-share-loop pitfalls (corroborated by Satori issues + Vercel docs); LOW where flagged inline.
**Scope discipline:** The spec already named the obvious risks (Reservoir sunset, USDC.e vs native, 0.8.28–0.8.33 IR bug, MATIC→POL, RNDR→RENDER, Pyth pull model, Satori-no-grid, Privy provider order, Stylus 365-day reactivation, single owner key). This document writes the **pitfall version** of those — "how teams ship the mistake even when the spec correctly identifies the fix" — plus the subtler domain-specific pitfalls the spec did not pre-identify. Every Critical pitfall pins to a spec section and a §19 build phase.

This document succeeds an earlier PITFALLS.md draft committed in `38b0c94`. The earlier draft was a useful first pass; this version goes deeper on the **share loop, AMM sub-state, oracle-attestation plane, Stylus fallback, and embedded-wallet 24h cooldown** — domains the original under-served per the quality-gate requirements.

---

## Executive Summary

The **three highest-blast-radius pitfalls** for Call It are:

1. **Pitfall 1: "Native USDC" address gets pasted as USDC.e somewhere along the build chain.** A single contract that hardcodes the wrong USDC address (or a frontend env var that mismatches the contracts) silently routes user funds into a token whose 1:1 redemption is no longer guaranteed. Spec §10.5 mandates `require(token == USDC_ARB)` — but the constant must be cross-verified at *every* layer (contracts, deploy scripts, frontend env, subgraph manifest, relayer config). Loud spec correctness does not prevent silent paste failure.

2. **Pitfall 2: Stylus runtime fallback is "shipped" but never actually exercised on a real revert.** SettlementManager `try/catch`es Stylus per §11.6, but the catch branch is the most error-prone code in the system because nothing forces it to run. A reverting Stylus implementation deployed for the §19.10 Sepolia staging gate is the only proof. Without that drill, the first real fallback fires *on mainnet*, against real USDC, with the operator finding out via Telegram alert.

3. **Pitfall 3: TVL cap aggregation drifts as new pools/contracts are added.** The $5K cap (raisable to $100K per `MAX_ALLOWED_CAP`) is checked against `currentTvl + stake + virtualSeed` in `createCall` and `currentTvl + stake` in `follow`/`fade`. If `currentTvl` reads from one source (CallRegistry's own accounting) and reality sits across CallRegistry + FollowFadeMarket + ChallengeEscrow, the cap is an illusion. A leaky aggregator means the protocol can hold $15K while reporting $4,800 — and the boundary test from §19.10 (deposit $99 at $4,901) passes against a number that isn't the real total.

The pattern across all three: **the spec is correct, but correctness is not sufficient.** Each requires a verification drill (cross-layer address audit, mandatory fallback exercise, end-to-end TVL reconciliation) that the build phase must contain explicitly.

The **single most-overlooked share-loop pitfall** is `next/og`-via-Vercel-Edge runtime accidentally selected by a developer reading a 2024 tutorial. Spec §16.1 and STACK.md both call this out — but the migration path from "edge runtime tutorial" to "Node runtime production" trips on `resvg-wasm` bundling 100% of the time. Phase 7 must include a `runtime: 'nodejs'` lint rule, not just a doc note.

The **single most-underestimated mainnet pitfall** is the Sepolia↔mainnet config-drift surface: 12+ env vars + 6 contract addresses + 1 USDC address + 25 Pyth feed IDs + 6 NFT contract addresses + relayer signing key + Privy app ID + subgraph URL. Any one of them pointed at the wrong network on mainnet day = either a failed launch (best case) or real USDC moved against test contracts (worst case). The §19.11 smoke test catches some but not all; a `printenv | grep -E '(MAINNET|SEPOLIA|CHAIN_ID)'` reconciliation step is missing.

---

## Critical Pitfalls

### Pitfall 1: USDC address paste-failure across the build chain
**Severity:** CRITICAL · **Confidence:** HIGH · **Spec pin:** §10.5, App.A.1 USDC address line, STACK.md "Pinned Addresses" · **Phase pin:** Phase 0 (foundation), Phase 1 (contracts deploy), Phase 6 (safety review boundary tests)

**What goes wrong:**
Native USDC on Arbitrum is `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`. Bridged USDC.e is `0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8`. A single contract that hardcodes USDC.e (e.g. an executor pastes from a 2023 Arbitrum tutorial), or a frontend env file with USDC.e set in `.env.local`, routes deposits into a token whose 1:1 redemption is no longer guaranteed (Circle deprecated bridged USDC.e's preferred status when CCTP went live; redemption is permissive today but is not contractually mandated). The bug is subtle because **USDC.e transfers succeed** — there is no revert. Users deposit, balances accrue, settlements pay out — in USDC.e. The discovery moment is when a user tries to use the payout against a contract or DEX that expects native USDC.

**Why it happens:**
- Most Arbitrum tutorials online are from 2022–2024 and reference USDC.e.
- Both tokens are deployed by Circle-adjacent entities and have identical ERC-20 surfaces — `name()` returns "USD Coin" for both.
- The `require(token == USDC_ARB)` check in §10.5 only catches *other* ERC-20s — it doesn't catch a wrong-constant copy.
- Six contracts × every USDC interaction × Solidity constant × Rust constant × frontend env × subgraph mapping × relayer config = ~20 places the address appears.

**How to avoid:**
- **Single source of truth file** at `packages/config/usdc.ts` exporting `USDC_ARB_NATIVE = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as const` with a Solidity-side mirror in `packages/contracts/src/constants/USDC.sol`. Every other file imports — no inline literals anywhere.
- **CI grep guard:** ripgrep against `0xff970a61` (case-insensitive) on every commit; build fails if present anywhere except a documented negative-test fixture.
- **Deploy script invariant:** post-deploy, every contract's `USDC_ARB` constant is read back via Cast and asserted against the source-of-truth constant before deploy script exits.
- **Smoke test §19.11 addendum:** "Read `USDC_ARB` from CallRegistry, FollowFadeMarket, ChallengeEscrow, SettlementManager via Cast; print and visually verify the last 4 hex chars are `5831`, not `5CC8`."

**Warning signs:**
- First USDC transfer in a Sepolia smoke test goes through against a non-zero balance but post-transfer `balanceOf` of a known native-USDC holder doesn't change. (Sepolia USDC.e doesn't exist, but the analog on testnet exists if test-USDC was deployed twice.)
- `etherscan.io/address/<contract>` shows token transfers under a different USDC entry than expected.
- Any user reports a "USDC sent to my embedded wallet but I see 0" — this is the bridged/native confusion on Privy display.
- Subgraph `Position` entities show `stake` in USDC.e display strings (Subgraph Studio resolves the bridged token's metadata if the address mapping is wrong).

**Recovery (assumes real money on mainnet):**
1. `pause()` all contracts immediately.
2. Audit every state-changing contract's `USDC_ARB` constant via Cast against `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`.
3. If wrong constant deployed: contracts are non-upgradable per §10.8 — **redeploy is required.** Communicate via X + in-app banner; rely on §10.3 withdraw/claim carve-out to let users pull bridged USDC.e out.
4. Provide a manual recovery script that converts users' USDC.e back to native USDC via Uniswap (1:~1 today, slippage 0.1-0.5%) or Circle's CCTP bridge.
5. Re-deploy with the correct constant; migrate state by re-publishing seeded calls (the $5K TVL cap makes this tolerable per §10.8).

---

### Pitfall 2: Stylus runtime fallback is never exercised before mainnet
**Severity:** CRITICAL · **Confidence:** HIGH · **Spec pin:** §11.6, §12.4 step 7, §19.10 Sepolia gate, §19 Phase 6 · **Phase pin:** Phase 5 (Stylus), Phase 6 (safety review)

**What goes wrong:**
SettlementManager wraps the Stylus call in `try/catch` per §11.6 with a Solidity baseline that activates on revert. The baseline is shipped, the wrapper compiles, and tests pass *as long as Stylus never reverts*. The team — focused on getting Stylus to work — never deploys an intentionally-reverting Stylus implementation to verify the `catch` branch actually runs end-to-end through `RepCalculatedFallback` emission, fee distribution, and ProfileRegistry write. The first time the fallback runs in anger is on mainnet, against a call with real USDC, when the operator finds out via the alert bot. Failure modes hiding inside the catch branch include: (a) ProfileRegistry's `NotAuthorizedSettlementManager` check failing because the baseline path was written against a stale ABI, (b) the baseline rep calculation underflowing because Stylus's `i32` return was silently coerced differently in fallback, (c) `RepCalculatedFallback` event signature drift between contract and subgraph mapping so the operator never sees it, (d) fee distribution skipped entirely because the fallback path's `if/else` mis-routes around the fee block.

**Why it happens:**
- "Happy path tests" are how solo+AI teams ship — there's always a feature feeling more urgent than a destruction test.
- The catch branch is by definition only-runs-during-rare-events; until a real revert happens, there's no signal that it's broken.
- The §19.10 staging gate lists "Stylus runtime fallback verified" but it's one bullet among many — easy to check-mark as "we wrote the code."
- Stylus reverts in production are rare enough that an unverified catch branch can survive months before the first real fire.

**How to avoid:**
- **Mandatory destruction drill in Phase 6:** deploy a `RevertingStylusEngine` to the same transparent-proxy slot on Sepolia, run `settle()` against a real seeded call, assert (a) tx succeeds, (b) `RepCalculatedFallback` event fires with non-empty `lowLevelError`, (c) `ProfileRegistry.getProfile(caller).globalRep` advanced by the *baseline* delta (not the would-have-been-Stylus delta), (d) fees were paid into FollowFadeMarket and treasury per §12.4 step 11, (e) `Call.status == Settled` and duplicateHash cleared per step 12.
- **Test fixture must live in repo** as a reusable Stylus contract: `apps/contracts-stylus/src/test_fixtures/reverting_engine.rs`. Run as part of CI on every PR touching SettlementManager or StylusScoreEngine.
- **Operator runbook entry:** "On `RepCalculatedFallback` alert, compare emitted `baselineDelta` against expected Stylus value (off-chain re-computation). If divergence >25%, investigate Stylus implementation immediately."

**Warning signs:**
- First `RepCalculatedFallback` event fires post-mainnet but baseline rep is +0 (under/overflow), or ProfileRegistry write reverts (caught silently if not actually verified).
- Telegram alert bot is configured to fire on `RepCalculatedFallback` per ARCHITECTURE.md §2.7 alert bot row — verify the watcher works *before* you need it (filter the existing test event, not just compile the listener).
- Stylus contract gets close to its 365-day reactivation window per spec; reactivation is missed; first `settle()` after expiry runs the fallback for every call simultaneously, surfacing every bug at once.

**Recovery:**
1. If fallback fails mid-settle: tx reverts (per §12.4 atomicity), call remains `Live`, no funds moved. The contract is safe; only the SLA is broken.
2. Owner uses `forceSettle(callId, outcome)` after expiry + 7 days to recover stuck calls per §12.4.
3. For calls that already settled via broken fallback: dispute window catches partial corruption if any user notices the wrong rep delta. Owner can `resolveDispute(callId, originalOutcome)` to manually fix rep via a follow-up administrative call — but post-claim disputes are documented unsupported in v1 per §12.4 step 3 of resolveDispute. Real recovery requires off-chain manual rep correction via a separately-deployed admin contract authorized by the same SettlementManager rotation per §12.5.

---

### Pitfall 3: TVL cap aggregation reads stale or wrong-scope data
**Severity:** CRITICAL · **Confidence:** HIGH · **Spec pin:** §10.2, §12.1 step 6, §12.2 step 6, App.A.1 "TVL cap reached" line, §11.2 single-contract sub-state lock · **Phase pin:** Phase 2 (FollowFadeMarket), Phase 6 (safety review boundary tests)

**What goes wrong:**
Spec §10.2 sets `tvlCap = 5_000 * 1e6` and step 6 of `createCall` and `follow`/`fade` requires `currentTvl + stake + ... <= tvlCap`. But what is `currentTvl`? Real TVL = USDC held across (a) FollowFadeMarket pool reserves for every active call, (b) CallRegistry caller stakes (technically these *move* into FollowFadeMarket's follow pool at creation, but the implementation order matters), (c) ChallengeEscrow holdings for accepted duels, (d) the LP-fee USDC injected into pools at settlement that hasn't been claimed yet, (e) penalty USDC injected by caller-exit and position-exit slashes (50% / 40% / 10% splits per §8.7.1 and §8.7.2). If `currentTvl` is computed as `USDC.balanceOf(FollowFadeMarket)` only — the simplest implementation — the cap *under*-counts ChallengeEscrow holdings and the protocol can hold $7K while reporting $4,800 free. If `currentTvl` is summed across separate per-contract counters maintained by hand, the counters drift on every fee, every exit, every claim — and the cap *over*-counts after the first claim wave, locking out deposits while $2K of slack exists. Either way, the §19.10 boundary test ($4,999 OK / $5,001 reverts) passes against a number that isn't the truth.

**Why it happens:**
- Spec doesn't define the canonical `currentTvl` getter — it's left as an implementation detail.
- Single-contract sub-state per §11.2 was chosen specifically to "make TVL-cap aggregation trivial," but only if aggregation is across the single FollowFadeMarket. ChallengeEscrow and the treasury portion of penalty splits are separate.
- The LP-fee injection at §12.4 step 11 grows pool reserves *during settlement* — if settlement happens while another call is mid-creation, the post-step-11 balance could push past cap without a `TvlCapReached` check inside settle.
- Slash injections per §11.2 grow pool reserves without minting shares — `USDC.balanceOf(FollowFadeMarket)` and `totalShares × averagePrice` diverge after every exit.

**How to avoid:**
- **Define a canonical `getTvl()` view function** that reads `USDC.balanceOf(FollowFadeMarket) + USDC.balanceOf(ChallengeEscrow) - claimableButUnclaimed`. Use this single function in every cap check.
- **Treasury portion of penalty splits never counts toward TVL** — penalties send 10% to the treasury wallet (a separate address), removing it from the protected pool entirely. Verify this in the slash implementation; if treasury is `address(this)` for FollowFadeMarket, the cap accounting is wrong.
- **Invariant test (Foundry fuzz):** after any sequence of create/follow/fade/exit/settle/claim operations, `sum(call.stake) + sum(position.stake) + sum(challenge.stake) - sum(claimed) - sum(treasury_outflow) == USDC.balanceOf(FollowFadeMarket) + USDC.balanceOf(ChallengeEscrow)`. Run for 10K iterations.
- **Phase 6 boundary test expansion:** beyond "$4,999 OK / $5,001 reverts," add (a) deposit at $4,999, then settle a $200 call → claim payouts → verify next deposit math; (b) deposit at $4,999 with $200 in ChallengeEscrow simultaneously → verify revert (or pass, but documented); (c) deposit at $4,999, force a penalty slash injection that adds $50 to a pool reserve → verify next deposit accounting.

**Warning signs:**
- `TvlCapReached` reverts begin appearing in the relayer logs while the metrics dashboard shows TVL well under cap.
- Or: TVL metric shows >$5K while no `TvlCapReached` reverts are observed.
- `sum(pool_reserves)` (subgraph aggregation) ≠ `USDC.balanceOf(FollowFadeMarket)` — divergence after the first slash injection.
- Operator wants to raise the cap via `setTvlCap($10K)` but discovers actual TVL is already $7K.

**Recovery:**
1. If under-counting (real TVL > reported): `pause()` immediately. Run the canonical `getTvl()` off-chain by summing on-chain balances. If real TVL > $5K, withdraw/claim is still functional per §10.3 — users can exit cleanly. Owner uses `setTvlCap(realTvl + 100)` to bring the cap honest, then resumes service. Note: `MAX_ALLOWED_CAP = 100K` per App.A.1 — cap cannot be raised arbitrarily.
2. If over-counting (reported TVL > real): redeploy the `getTvl()` function in a v1.1 patch. The over-counted period is recoverable — users were blocked from deposits but no funds were at risk. Communicate as a "TVL cap underestimate" minor incident.
3. Verify treasury wallet balance separately throughout — penalty 10% should accumulate there, not in FollowFadeMarket.

---

### Pitfall 4: Pyth pull-oracle settle() runs without first pushing a fresh price update
**Severity:** CRITICAL · **Confidence:** HIGH · **Spec pin:** §13.1, §13.7, STACK.md "Pyth pull model" gotcha · **Phase pin:** Phase 4 (SettlementManager + Pyth)

**What goes wrong:**
Pyth on Arbitrum is a **pull oracle** — `getPriceNoOlderThan(priceId, 60)` reverts with `StalePrice` if no recent update has been pushed on-chain. Teams reading the Pyth getting-started page often miss this nuance because the function signature looks like a normal read. The spec correctly identifies the pattern (§13.1: "reads price at expiry via `getPriceNoOlderThan`") and STACK.md explicitly calls out the Hermes fetch + `updatePriceFeeds` step, but the **implementation** for `settle()` must be a multicall: (a) Hermes-VAA-fetched-off-chain → (b) `IPyth.updatePriceFeeds{value: fee}(updateData)` → (c) `SettlementManager.settle(callId)` → (d) settle internally calls `getPriceNoOlderThan`. If the team's `settle()` does only step (d) and assumes "Pyth keepers will keep prices fresh enough," settlement *will* revert in production because (i) Pyth keepers don't push every priceId continuously on Arbitrum — they push on demand and on volatility, (ii) the 60-second freshness window is tight for low-volatility long-tail allowlist assets, (iii) every call expires at exactly its expiry timestamp, but no keeper is incentivized to push that exact moment.

**Why it happens:**
- "Oracle read" intuition from Chainlink: Chainlink IS push, so a `getLatestRound()` always returns *some* number. Pyth is pull, and silence means staleness.
- The Hermes fee is paid in **ETH on the Pyth contract**, not USDC — adds a separate gas/ETH budget concern that's easy to defer.
- The atomic multicall pattern requires wagmi `useWriteContract` with `multicall3` or a custom contract entry point; tutorials often show `updatePriceFeeds` and `settle` as separate transactions, which racing keepers can interleave.
- Spec §13.1 says "single-block reads are avoided because they're trivially MEV-manipulable on thin pairs" — but the fix (60s freshness window) requires *something* to push fresh data into that window.

**How to avoid:**
- **Implement `settle(callId)` to accept update data:** `function settle(uint256 callId, bytes[] calldata pythUpdateData) external payable` — the function pays the Pyth update fee from `msg.value`, calls `IPyth.updatePriceFeeds{value: pythFee}(pythUpdateData)`, then reads `getPriceNoOlderThan`. Atomic per-block.
- **Relayer fetches Hermes VAA just-in-time** per ARCHITECTURE.md §2.7 "Pyth Hermes pull" row. The relayer is the gas payer in normal operation per §12.4 "Anyone can call."
- **ETH budget for relayer wallet:** ~0.001 ETH per settle. The relayer wallet needs continuous ETH top-up; add a Telegram alert at <0.01 ETH (~$30 worth at typical 2026 prices).
- **Multicall vs sequenced:** prefer atomic multicall; if separating, gate on `block.number` invariance to prevent a second tx in the next block from racing.
- **Fallback for keeper-pushed prices:** if Hermes is unavailable, settle reverts cleanly into `SettlementDelayed` per §13.1 — the 30-retry × 60s window absorbs Hermes outages.

**Warning signs:**
- `SettlementDelayed` events firing with reason `"PYTH_CONFIDENCE_WIDE"` on assets that should have tight feeds (BTC, ETH) — symptom is actually `StalePrice` masquerading as confidence-wide if the error mapping is sloppy.
- Relayer wallet ETH balance drifting toward zero in the metrics dashboard.
- `IPyth.updatePriceFeeds` reverting with "InsufficientFee" — Pyth update fee varies; query via `IPyth.getUpdateFee(updateData)` and pass exactly that much.
- Settled calls show `priceDelta == 0` consistently — symptom of `getPriceNoOlderThan` returning a stale price that hasn't actually moved.

**Recovery:**
1. If settles are stuck on missing pushes: relayer can manually call `updatePriceFeeds` for the relevant feed IDs, then re-invoke `settle()`. The 30-retry policy handles this if the relayer Pyth job is configured correctly.
2. If a feed is permanently broken (Pyth deprecates the feed mid-call): `forceSettle(callId, outcome)` after expiry + 7 days per §12.4. Document the outcome derivation in the manual override announcement.
3. Update the allowlist to remove the broken feed via `addAsset(...)` policy — owner-only.

---

### Pitfall 5: Frontend ships against Sepolia config, mainnet day flips one var
**Severity:** CRITICAL · **Confidence:** HIGH · **Spec pin:** §19.10, §19.11, ARCHITECTURE.md §6 "Frontend env var management" row · **Phase pin:** Phase 0 (foundation, env var system), Phase 6 (safety review), Phase 7 (OG service), mainnet deploy day

**What goes wrong:**
The build runs on Sepolia for 48+ hours per §19.10. Twelve+ environment variables differentiate Sepolia from mainnet: `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_USDC_ADDRESS`, `NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_ALCHEMY_RPC_URL`, `NEXT_PUBLIC_SUBGRAPH_URL`, `NEXT_PUBLIC_OG_BASE_URL`, six contract addresses, Pyth contract address (different per network), relayer signing key separation, X API tokens, Pinata key, Sentry DSN. The execution model is "flip envs on Vercel + Railway + Subgraph Studio simultaneously and redeploy." Any one var pointing at Sepolia on mainnet day = either a failed launch (frontend can't read mainnet contracts) or — worse — a successful frontend reading Sepolia subgraph against mainnet contracts, showing "no calls" while real USDC sits in real contracts that the frontend cannot see. Worse-still: relayer signing key from Sepolia accidentally pushed to mainnet relayer config — now relayer-signed NFT TWAPs are signed by a key the SettlementManager doesn't recognize, settle reverts forever.

**Why it happens:**
- 12+ envs × 3 platforms (Vercel, Railway, Subgraph Studio) × dev/staging/prod = ~100 cells in a mental matrix.
- Mainnet day is a one-shot event with adrenaline; nobody runs a `diff env-sepolia env-mainnet` ritual under pressure.
- Vercel's "Promote to Production" flips frontend envs but not Railway's; Railway's "Promote" doesn't flip Subgraph Studio's URL.
- `NEXT_PUBLIC_*` envs are baked at build time; a runtime config flip that "should work" doesn't because the bundle was compiled with Sepolia.
- The Privy app ID is the most-missed: same dashboard, two app IDs (one per env). Sign-in works against both — but the Privy webhook for OAuth proof lands in the wrong relayer.

**How to avoid:**
- **Single env-config file checked into repo:** `packages/config/env.ts` with `MAINNET_CONFIG` and `SEPOLIA_CONFIG` typed objects, both fully populated, selected at build/runtime via `process.env.NEXT_PUBLIC_NETWORK`.
- **Mainnet deploy ritual checklist** before any contract is touched: print all envs from Vercel, Railway, Subgraph Studio side-by-side; verify the chain ID, USDC address, contract addresses, Privy app ID, subgraph URL all match the mainnet column.
- **Build-time invariant:** in `app/layout.tsx`, log `console.error('NETWORK CHECK:', { chainId, usdc, contracts })` and fail if `chainId === 421614` (Sepolia) when `NEXT_PUBLIC_NETWORK === 'mainnet'`.
- **§19.11 smoke test additions:** "Open browser devtools, inspect bundled JS for substring `421614` — must be absent on mainnet build" and "curl the OG service `/health` endpoint, verify it reports `chainId: 42161`."
- **Relayer key separation:** ABSOLUTE — mainnet relayer signing key never touched by Sepolia code path. Two separate AWS KMS keys (or two separate `.env.mainnet` / `.env.sepolia` files with explicit Railway secret namespacing).

**Warning signs:**
- Frontend loads, sign-in works, "no calls in feed" — but Arbiscan shows calls being created against the contracts. Symptom: subgraph URL or chain ID wrong.
- First settle on mainnet emits no event the frontend sees — symptom: subgraph indexer pointed at the wrong network.
- OG service renders a fallback card for every callId — symptom: OG service's RPC URL points at Sepolia, subgraph query returns empty.
- Telegram alert bot quiet on a known event — symptom: alert bot's RPC/subgraph URL points at Sepolia.
- A user's "fund my wallet" Coinbase Onramp delivers to Sepolia (which Coinbase blocks anyway) — symptom: Privy app ID mismatch.

**Recovery:**
1. If detected within first minutes: `pause()` immediately, fix envs, redeploy, unpause. No funds moved.
2. If a real call was created during the window: the call exists on the correct contracts; the frontend just couldn't see it. Fix envs, the call appears in the feed and progresses normally.
3. If relayer key is wrong, signed attestations are rejected by SettlementManager; settles revert; calls go to dispute window. Recover by deploying with the correct relayer key, calling `setRelayer(...)` per §12.5, then re-invoking settle.

---

### Pitfall 6: Single owner key is everything in v1 — multisig promotion gets deferred forever
**Severity:** CRITICAL · **Confidence:** HIGH · **Spec pin:** §10.4, §10.7, §10.8, ARCHITECTURE.md §5 "The compounded threat" line · **Phase pin:** Phase 0 (multisig setup), Phase 6 (safety review), pre-v1.1 (mandatory rotation)

**What goes wrong:**
Per spec §10.4 and §10.8, a single deployer key controls `pause()`, `setTvlCap()`, `setSettlementManager()`, `setRelayer()`, `forceSettle()`, `resolveDispute()`, and the Stylus proxy admin. The spec mandates multisig promotion before v1.1 / before TVL exceeds $5K — but the timing is "soft" enough that under hackathon adrenaline + launch-day momentum, the multisig setup gets deferred to "next week." Next week becomes next month. Meanwhile the key sits on a single laptop (or worse, in a `.env` file pushed to a private repo). If the key is compromised, the attacker can: (a) `pause()` the protocol indefinitely (DoS), (b) `setTvlCap(1)` to lock out deposits, (c) `forceSettle()` every call to a chosen outcome (real USDC moves), (d) `upgradeTo(MaliciousScoreEngine)` on Stylus proxy to grant infinite rep, (e) `setRelayer(attackerKey)` to forge social-link badges, (f) `setSettlementManager(maliciousManager)` to write arbitrary rep deltas to ProfileRegistry. The 7d cooldown on `forceSettle` is the only friction — and 7 days is short enough that an attacker who waits has the full surface.

**Why it happens:**
- Multisig setup is operational work that doesn't ship features.
- Hackathon week + first-week traffic = "we'll do it after launch."
- The Safe multisig deploy + 2-of-3 signer coordination + ownership-transfer rituals (6 contracts + 1 Stylus proxy = 7 separate `transferOwnership` calls) is a half-day of focus that's hard to find.
- Until something bad happens, single-key feels frictionless and multisig feels like overhead.

**How to avoid:**
- **Phase 0 includes Safe multisig deploy** per ARCHITECTURE.md §6 "Multisig" row — don't wait for v1.1. Deploy the Safe immediately, even if ownership stays on the deployer key until launch.
- **Hard-gate v1.1 promotion on multisig transfer.** No feature work for v1.1 until `Ownable2Step` 2-step ownership transfer is complete on all 6 contracts and the Stylus proxy admin is the multisig. Verify via Cast read.
- **Use Ownable2Step everywhere** per STACK.md — the 2-step pattern blocks "transfer to zero address" mistakes. The pending owner pattern means the multisig must accept ownership in a second tx, which is a safety net.
- **Deploy-script generates the ownership-transfer script** as a separate Foundry script that takes a multisig address and produces the 7 `transferOwnership` calls. Run it post-Sepolia, verify on Sepolia, then ready for mainnet day.
- **Owner key hygiene immediately:** the deployer key sits in a hardware wallet (Ledger) from day one, even before multisig. Not in `.env`, not in a CI secret, not on the dev laptop.

**Warning signs:**
- Operator routinely uses the deployer key for one-off operations (running `forceSettle` from a `.env`-loaded script).
- The "transition to multisig" task has been on the backlog for >30 days post-launch.
- TVL is approaching $5K with no multisig in place.
- The deployer key is held by a single person who is also the sole on-call operator (no redundancy).

**Recovery (assumes key compromise on mainnet):**
1. If keys were stored in a Ledger and the laptop is compromised but the Ledger is not: rotate using the multisig you should have already deployed. If no multisig: every contract's owner is the compromised key — there is no on-chain recovery. The attacker has full control of `pause`, `forceSettle`, `upgradeTo`. Communicate immediately; users can still `claimPayout` and `exitPosition` per §10.3 if the attacker hasn't paused yet.
2. **Race the attacker.** If they haven't yet acted: deploy a multisig from a clean device, transfer ownership from the hot key (which the attacker also has — they may transfer first). This is a race condition with real money at stake.
3. **The real recovery is "this should not have been a single-key system."** If TVL is small ($5K cap), redeploy fresh contracts with the multisig and ask users to migrate.

---

### Pitfall 7: NFT TWAP relayer signing key compromise forges settlement outcomes
**Severity:** CRITICAL · **Confidence:** MEDIUM · **Spec pin:** §13.2, §13.6, ARCHITECTURE.md §5 "Alchemy NFT TWAP" row · **Phase pin:** Phase 4 (SettlementManager + oracle adapters), Phase 6 (safety review)

**What goes wrong:**
Spec §13.2 delegates NFT TWAP computation to the relayer because Alchemy doesn't expose a TWAP endpoint and on-chain TWAP for NFTs is impractical. The relayer computes the 24h time-weighted average from 5-min polls of `getFloorPrice` + `getNFTSales`, signs the result with a relayer key, and calls `submitNftFloor(callId, twapPriceWei, observationCount, evidenceHash)` on SettlementManager. If the relayer key is compromised (or — more likely — the relayer's Railway/Fly.io VM is breached), the attacker can forge any NFT floor settlement: a "Pudgy Penguins floor > 20 ETH" call gets resolved true regardless of actual floor. Same key signs the DefiLlama, Snapshot, and CEX listing attestations per §13.3, §13.5, §13.6 — so compromise extends to most non-Pyth oracle paths. The spec correctly identifies this in ARCHITECTURE.md §5 ("Compromise of relayer key → attacker can forge any NFT settlement outcome") and bounds the loss via §10 caps, but the implementation surface — where the relayer key sits, how it's accessed, how it's rotated — is left unspecified.

**Why it happens:**
- The relayer is a single Node process with the signing key in its process memory.
- Railway/Fly.io VMs are not "secure enclaves" — a sufficient breach (SSH compromise, container escape, supply-chain attack on a Node dep) exposes the key.
- Rotation requires `setRelayer(newKey)` on ProfileRegistry per §12.5 plus updating SettlementManager's authorized signer (implementation detail; likely a constructor-set or owner-rotatable field).
- The same key signs every oracle path for operational simplicity — separation of duties across NFT, DefiLlama, Snapshot, CEX is more secure but more code.

**How to avoid:**
- **Relayer key in AWS KMS** (or equivalent), not in `.env` or container memory. The relayer uses KMS-sign API for each attestation. Key never leaves KMS.
- **Per-oracle signing keys** (separate KMS keys for NFT, DefiLlama, Snapshot, CEX). Each has narrower compromise blast radius. SettlementManager authorizes the four pubkeys separately.
- **Observation-count gate (already in spec §13.2):** `observationCount >= 12` in the 24h window. A compromised key can lie about price but not retroactively about observation count — wait, yes it can, since the count is also signed. So this gate doesn't actually mitigate compromise — it mitigates *honest* relayer with insufficient data. Adjust threat model.
- **On-chain TWAP sanity check:** SettlementManager could optionally re-compute TWAP from `Transfer` events of the NFT contract within the 24h window (still off-chain math but verifiable). The runbook in §13.2 mentions this; productize the check as a relayer-side double-write that compares its own TWAP to a sanity-check secondary path; alert on >5% deviation.
- **Multi-sig the relayer rotation key:** `setRelayer` on ProfileRegistry should be behind the same multisig as the owner key per Pitfall 6.

**Warning signs:**
- Telegram alert: an NFT TWAP submission's `twapPriceWei` deviates >10% from a separately-fetched OpenSea Pro floor at the same timestamp.
- A spike of NFT calls all settling in favor of the caller (or all in favor of fader) — single-signer collusion pattern.
- Relayer container access logs show unfamiliar IPs or unexpected `eth_call` patterns.

**Recovery:**
1. Disable submissions immediately: `setRelayer(0x0)` on ProfileRegistry pauses social linking; equivalent function on SettlementManager pauses signed-attestation acceptance (implement during Phase 4 — owner-only `setOracleRelayer(address)`).
2. All active NFT/DefiLlama/Snapshot/CEX calls go to dispute window per §13.7 when their oracle path errors.
3. Operator manually researches each settlement claim and uses `forceSettle()` (after 7d cooldown) or `resolveDispute()` to set the correct outcome.
4. Rotate keys; redeploy relayer with new KMS key; `setOracleRelayer(newKey)`.

---

### Pitfall 8: Subgraph and OG cache go out of sync with on-chain state during settlement window
**Severity:** HIGH · **Confidence:** HIGH · **Spec pin:** §16.3, §16.6, §18.2, ARCHITECTURE.md §3.3 step 10, FEATURES.md "share loop critical path" · **Phase pin:** Phase 7 (OG + subgraph)

**What goes wrong:**
The settled-receipt OG card per §16.3 — "the share moment, outcome word as hero" — depends on (a) `CallSettled` event detected by OG service event watcher, (b) CDN cache invalidation for `/og/[callId]`, (c) next share-link click regenerating with the outcome word stamp. If any of these races: (1) user views `/call/[id]` while subgraph hasn't picked up settle yet (5-30s lag per The Graph Decentralized Network SLA) but OG service is reading direct from RPC — UI shows "live" while preview shows "settled" (or vice versa); (2) OG service's event watcher misses the `CallSettled` event because the watcher restarted during settle — old "live" card remains cached for 24h; (3) auto-post-to-Twitter (default ON per §15.2) fires *before* OG cache is invalidated — the tweet's preview shows the live card with outdated pool ratios while the user is announcing "CALLED IT"; (4) Twitter Card Validator caches the first preview it sees for ~24h, so even a subsequent invalidation doesn't refresh Twitter's preview until the card validator is manually re-submitted.

**Why it happens:**
- Three separate read planes (subgraph, RPC, CDN) move at different speeds.
- The OG service's cache-invalidation trigger (event watcher) is a separate process from the rendering endpoint — failures in one don't block the other.
- `next/og` and `@vercel/og` cache aggressively at the CDN layer for performance; invalidation requires explicit purge.
- Twitter's preview cache is opaque and ~24h — the auto-post-on-settle pattern's race window is exactly when the preview matters most.

**How to avoid:**
- **OG service reads ALWAYS use the freshest source.** Settled card endpoint queries RPC `eth_call` directly for `Call.status` and `Call.outcome` from CallRegistry, not the subgraph. Sub-second freshness is the SLA.
- **`Cache-Control: public, max-age=60, stale-while-revalidate=300`** on settled cards so the cache refreshes in the background — never serve stale for >60s.
- **Cache-bust on share URL:** the share link is `/og/[callId]?v=[blockNumberAtSettle]` — Twitter treats it as a new URL and re-fetches.
- **Delay auto-post-to-X until OG cache is verified warm.** Relayer's auto-post worker waits for: (a) CallSettled tx confirmed, (b) HEAD on `/og/[callId]` returns the settled card variant (sniff via response header `X-Variant: settled`), (c) only then construct the tweet. Adds ~5-15s latency to the post but eliminates the wrong-preview-on-the-most-important-tweet pitfall.
- **Twitter Card Validator pre-flight in §19.11 smoke test:** Validate a synthetic settled-call URL through `cards-dev.twitter.com/validator` before announcing public availability. Spec lists this; verify it's actually run, not just listed.

**Warning signs:**
- User reports show "my settled receipt previewed as live for hours" — symptom of cache-invalidation failure.
- Auto-posted tweets show different content than the receipt page does for the same call.
- OG service Sentry shows `outcome === null` errors in the settled template path — symptom of stale subgraph read.
- Twitter Card Validator returns "no card found" or a stale card on first attempt against a known-settled call.

**Recovery:**
1. Manually invalidate the CDN for the affected URL: Vercel deployment → Cache → purge by URL.
2. For tweets with wrong preview: cannot recover — delete the auto-post and re-share manually. Document as a known limitation post-incident.
3. Patch the auto-post worker to add the verification step. Patch the OG service event watcher to use a more reliable subscription model (e.g., upgrade from polling to an RPC `eth_subscribe` if available).

---

### Pitfall 9: AMM sub-state has a shared invariant bug across all calls
**Severity:** HIGH · **Confidence:** HIGH · **Spec pin:** §11.2 single-contract sub-state lock, §11.2 penalty-injection semantics, §12.2, FEATURES.md "blast radius" line · **Phase pin:** Phase 2 (FollowFadeMarket), Phase 6 (safety review)

**What goes wrong:**
Spec §11.2 commits to a single FollowFadeMarket holding sub-state for all calls keyed by `callId`. The blast-radius concern is acknowledged ("a bug affects all markets") and mitigated by the $5K TVL cap. But the specific failure modes inside the shared contract are subtle: (a) **AMM math overflow at small pool sizes** — with cold-start pools of $7 virtual + $50 caller stake, share-mint math can underflow if `sharesMinted = stake × totalShares / (poolReserve + stake)` is computed with insufficient precision (Solidity integer division rounds down — first share-mint can be off by units of 1 if `totalShares = 0` and the bootstrap formula isn't carefully chosen); (b) **`positionEntryTime` mapping not cleared on `claimPayout`** — if not cleared, a user who claims, then re-follows a *different* call, can mis-trigger the 4h cooldown check that reads `positionEntryTime[callId][user][isFollow]` — bug only manifests when same user follows multiple calls; (c) **slash-injection (penalty USDC added directly to pool reserves per §11.2) breaks the share-price invariant** — if penalty injection happens during another user's pending follow tx in the same block, the follower's expected `sharesMinted` calculated off the old pool ratio is now wrong, `minSharesOut` slippage protection saves them but they revert (denial of service); (d) **TVL drift across calls** — per-call sub-state means every call's pool is in the same balance pool; an underflow in pool reserve tracking for call A means call B's user can drain via a "claim" that reads against the wrong reserve.

**Why it happens:**
- The single-contract pattern collapses what would be 100s of per-call proxy contracts into one storage layout. A bug isolated to one proxy in a per-proxy design corrupts all calls in a sub-state design.
- AMM math is notoriously hard at boundary conditions (`k = 0`, `sharesMinted < 1`, single-side liquidity).
- Penalty injection per §11.2 ("USDC added directly to pool reserve; `k` grows") is a non-standard operation — most AMMs don't have one-sided liquidity injection, so AMM-correctness reasoning doesn't transfer.
- The fuzz-test surface is multi-call × multi-user × multi-action × multi-call-overlap — easy to under-test.

**How to avoid:**
- **Property-based fuzz tests** (Foundry's `forge fuzz`) on FollowFadeMarket with 10K+ iterations: invariants must hold under any sequence of (createCall, follow, fade, exit, settle, claim) for any number of calls and users. Key invariants: (1) `sum(userPosition.usdcValue) <= USDC.balanceOf(this) - treasuryBalance - virtualSeedSum`, (2) per-call `followPool × fadePool` is monotonic non-decreasing except on settle (k grows on penalty injection), (3) `claimPayout` is idempotent (`claimed[callId][user]` cannot be cleared), (4) `positionEntryTime` only set, never cleared (the 4h cooldown is one-way).
- **Cold-start AMM bootstrap test:** create call with $5 caller stake → first follow at $1 → assert shares minted are non-zero, share-price math doesn't underflow. Boundary-test at $5/$1, $5/$0.01-rejected, $7-virtual-only-fade case.
- **Slash-injection isolation:** structure the slash-injection function to update pool reserves AFTER computing the affected pool's current `k` and broadcasting an event so concurrent follow/fade txs can see the change in the same block. Or — accept that slash-injection invalidates pending swaps and rely on `minSharesOut` to revert them; document the UX hit.
- **Per-call invariant assertion** in `settle()` step 11: after fee distribution, assert `followPool × fadePool >= preFee_k` (k can grow from fees, never shrink). Cheap on-chain check.
- **Sepolia staging §19.10 expansion:** run 30+ follow/fade across 10+ calls *simultaneously* (overlapping in same block via batched txs from Anvil) to exercise multi-call interference.

**Warning signs:**
- `SlippageExceeded` reverts spiking in relayer logs without a price-impact narrative.
- `claimPayout` amounts that don't match the expected `userShares / totalShares × pool` formula computed off-chain.
- Subgraph `Position` entity USDC totals diverge from `USDC.balanceOf(FollowFadeMarket)` by >0.1%.
- A user reports "I followed call A, exited, then tried to follow call B and got cooldown error" — bug in cross-call `positionEntryTime` aliasing.

**Recovery:**
1. If a math bug corrupts state for one call: `pause()` immediately. Affected call goes to dispute window via `raiseDispute`. Owner uses `resolveDispute` to manually set outcome — but pool reserves are now wrong; manual recovery requires direct USDC `safeTransfer` from FollowFadeMarket to affected users via an admin function (which doesn't exist in v1 spec — would need a v1.1 upgrade or a fresh redeploy at $5K cap level per §10.8).
2. If state corruption is calls-wide: redeploy is the only recovery per §10.8 (non-upgradeable). Use the §10.3 withdraw/claim carve-out to let users pull funds first.

---

### Pitfall 10: Post-expiry follow/fade window is open until `settle()` runs
**Severity:** HIGH · **Confidence:** HIGH · **Spec pin:** §12.2 step 5 (the `block.timestamp < call.expiry` gate), App.A.1 "Post-expiry follow/fade gate" · **Phase pin:** Phase 2 (FollowFadeMarket), Phase 6 (safety review)

**What goes wrong:**
The spec correctly identifies (App.A.1) that `follow`/`fade` must revert with `CallPastExpiry` if `block.timestamp >= call.expiry` — otherwise after expiry, anyone watching the price feed can deposit on the certain-winning side before `settle()` runs, harvesting risk-free returns at the expense of the original counterparty. The gate is in §12.2. But two implementation gotchas:
- **(a)** Forgetting the gate entirely — easy to omit because the AMM math doesn't care about expiry; the gate is purely an economic-correctness layer. A code review pass that focuses on AMM correctness misses it.
- **(b)** Implementing it as `block.timestamp <= call.expiry` (off-by-one) — at the exact expiry second, both `follow` and `settle` would compete for the same block; the first one in wins. If follow wins, free-roll arbitrage is open for the duration of that one block (~250ms on Arbitrum — but in a frontrun scenario, MEV bots can act).
- **(c)** Relayer doesn't run `settle()` immediately at expiry — if there's a 60-second delay before the relayer cron fires, that's a 60-second window where the gate must hold. If the gate is missing or off-by-one, ~$5K of risk-free arbitrage every minute the call sits unsettled.

**Why it happens:**
- "Cool-down" thinking: developer assumes Pyth or settle blocks any follow because "the call is settled." But the call's status is still `Live` until `settle()` runs successfully.
- The 30-retry Pyth wait window per §13.1 means a call can sit between `expiry` and `Settled` for up to 30 minutes — a wide arbitrage window if gate missing.
- The auto-`settle()` relayer cron is a 60s loop — settle is best-effort, not guaranteed.

**How to avoid:**
- **Inline gate verification test (Phase 6):** create a Sepolia call with `expiry = now + 60s`. Wait 65s. Attempt `follow()` — must revert `CallPastExpiry`. Wait until next block. Verify `block.timestamp - call.expiry > 0` via on-chain read. Document the success case (revert is correct behavior).
- **`block.timestamp < call.expiry`** (strict less-than, not `<=`) — matches the spec's wording precisely. At exact expiry, follow is closed and settle is open.
- **Frontend disables Follow/Fade buttons** at expiry-1s, with a "settles momentarily" message — UX defense in depth.
- **Relayer settle latency monitoring:** alert if any call's `now - expiry > 90s` and status is still `Live` — symptom of stuck cron or stuck Pyth.

**Warning signs:**
- Follow events in the subgraph with timestamps `>= call.expiry`.
- Suspiciously profitable follow/fade positions with entry times just before the SettlementManager.settle tx.
- A spike of follows/fades on near-expiring calls from the same address cluster.

**Recovery:**
1. If exploited: the protocol can't claw back without manual `resolveDispute` ruling those late deposits as ineligible. In v1, this is operator discretion via dispute resolution.
2. Patch with a contract redeploy (non-upgradeable per §10.8) if the off-by-one is in the deployed contract.

---

### Pitfall 11: Self-funded sybil-fade attack on the cold-start 25% adjustment
**Severity:** HIGH · **Confidence:** HIGH · **Spec pin:** §8.3, FEATURES.md "wash trading own calls" gap · **Phase pin:** Phase 2 (FollowFadeMarket), Phase 4 (SettlementManager), Phase 6 (safety review observability)

**What goes wrong:**
Per §8.3, a correct call with zero real fade activity earns only 25% of normal rep gain. A caller wanting full rep can defeat this by fading their own call from a second wallet — the "real fader" check sees non-zero fade USDC and grants full rep. The §12.3 self-challenge gate (`SelfChallenge` revert) blocks this on the Challenge surface but **there is no equivalent gate on Follow/Fade**. The cost to farm is $5 min fade × 10% exit slash = $0.50 per farmed call, plus the loss on the fade (which goes back to the caller's other wallet if their call is correct, so net cost is just the 10% slash). FEATURES.md correctly identifies this as a gap and recommends observability-only mitigation. But the mitigation is **observability**, which requires someone to look — and at hackathon launch, there's no one looking.

**Why it happens:**
- The self-challenge gate was added per §12.3 step 5 specifically to prevent Duel King gaming. The same logic for Follow/Fade was either deemed too restrictive (legitimate followers might be same-cluster funded) or simply missed.
- "Cluster" detection requires off-chain analytics, which doesn't exist in the v1 spec.
- The economic cost is bounded by the $100 max stake — at hackathon scale, the upside is small enough to not seem urgent.

**How to avoid:**
- **Contract-level self-fade ban (optional v1.1):** revert `SelfFade` if `msg.sender == call.caller` in `fade()`. Trade-off: prevents wash farming but blocks the legitimate case of a caller hedging their own call.
- **Observability flag in the relayer:** for each new fade position, check if the funder of the fader's wallet (last incoming USDC transfer) shares a source wallet with the call's caller within 7 days. Flag for ops review.
- **Cold-start adjustment threshold change:** require fade pool to have ≥$5 *from a non-zero-rep account* to qualify as "real" — bootstrap accounts with 100 rep don't count. This is a contract change.
- **Self-fade-detection in the metrics dashboard** per FEATURES.md recommendation — at minimum, surface the count to ops.

**Warning signs:**
- Caller's wallet and the first fader's wallet were funded from the same source within 24h.
- A pattern of calls where the only fader is the same fader across N calls all by different but related callers.
- Rep gains in the leaderboard show callers with unusually high rep velocity but no follower activity — only the caller's own fader.

**Recovery:**
1. Self-fade farmed rep is hard to claw back in v1 (no rep-correction admin function per spec). Treat as accepted v1 risk per FEATURES.md analysis ("not a contract change in v1 — observability only").
2. For v1.1: add the self-fade gate and run a one-time rep recomputation pass against historical settled calls; surface "rep adjusted due to cold-start gate" notification to affected callers.

---

### Pitfall 12: Duplicate-hash UTC-day boundary surprises users; collisions look like bugs
**Severity:** MEDIUM-HIGH · **Confidence:** HIGH · **Spec pin:** §6.2, App.A.1 "Frontend must display rounded UTC day next to chosen deadline" · **Phase pin:** Phase 1 (CallRegistry + New Call UI), Phase 6 (safety review)

**What goes wrong:**
Per §6.2, `duplicateHash` floors the deadline to UTC day (86,400 seconds). A user in San Francisco creating a call with deadline "today 11:32 PM PT" (which is 06:32 UTC the next day) hashes into a different UTC day than they intended. Two users intending different deadlines from different timezones collide on the same UTC day; the second user gets `DuplicateCall(existingCallId)` and has no explanation. The spec's mitigation — "the frontend should surface the rounded UTC day next to the chosen deadline" (App.A.1) — is documentation, not enforcement. A frontend that shows the user's local time without the UTC-floored hash bucket = user sees `2026-05-22 11:32 PT` as their deadline, doesn't realize the duplicate-hash bucket is `2026-05-23 00:00 UTC`, and is confused when a "different" call (in a different local time) collides.

**Why it happens:**
- UTC timezone disambiguation is one of the oldest user-facing engineering errors (DST, IDL, leap seconds).
- The spec explicitly says "users authoring near a UTC day boundary may find their intended deadline collides with a neighbouring slot — the frontend should surface the rounded UTC day next to the chosen deadline so this is never a surprise" — but the build phase needs to enforce this requirement at the UI layer, and it's easy to ship a deadline picker that displays only local time.
- Daylight saving transitions (2nd Sunday in March, 1st Sunday in November in the US) compound the confusion for cross-DST calls.

**How to avoid:**
- **Deadline composer always shows two times:** "Your time: 2026-05-22 11:32 PT" AND "Hash bucket (UTC): 2026-05-23 00:00 UTC."
- **Pre-publish view call:** `CallRegistry.computeDuplicateHash(...)` view function (it's in §12.1) — the New Call form invokes this and surfaces "this call collides with [existing call]" *before* the user signs.
- **Inline warning on UTC-boundary cases:** if `localDeadline.utcHour < 4 || localDeadline.utcHour > 20` (approximately the timezone-confusion zone), show "this falls within Y day in UTC — collides with other deadlines in 2026-05-23 UTC bucket."

**Warning signs:**
- `DuplicateCall` reverts in the relayer/Sentry logs without corresponding UI warnings.
- User support tickets: "I tried to make a different call and it said duplicate."
- A spike of `DuplicateCall` reverts near 00:00 UTC.

**Recovery:**
1. User picks a different bucket: trivially recovered by changing deadline by ±1 day.
2. If a wave of confused users: ship a frontend patch (no contract change needed) to surface the UTC-floored hash bucket; backfill `DuplicateCall` errors with a helpful inline message.

---

### Pitfall 13: Privy provider order gets reordered by a refactor; embedded wallets vanish silently
**Severity:** HIGH · **Confidence:** HIGH · **Spec pin:** §9.2, STACK.md "Provider order is load-bearing" · **Phase pin:** Phase 1 (Privy integration)

**What goes wrong:**
The Privy + wagmi integration requires `<PrivyProvider>` → `<QueryClientProvider>` → `<WagmiProvider from @privy-io/wagmi>` → `{children}` in that exact order (STACK.md, ARCHITECTURE.md §2.8). A refactor — even an innocuous "let's add an AuthKitProvider for Farcaster" — can reshuffle the order, especially if the dev uses an IDE refactor tool or VS Code's "Wrap with Provider" command. The failure mode is silent: `useAccount()` returns `address: undefined` for embedded-wallet users, but for users with external wallets it works fine. QA running on Connect Wallet path doesn't notice. The bug ships, OAuth users see "no wallet found" on first action.

**Why it happens:**
- Provider order is a runtime invariant that TypeScript can't catch.
- Privy + wagmi + react-query + AuthKit is four providers — wrapping order across four is non-obvious.
- The `@privy-io/wagmi` wrapper export (not `@privy-io/wagmi-connector` legacy) is one of the things that can be silently regressed during a dep upgrade.
- The error is "embedded wallet not appearing" — which a dev might attribute to OAuth flow or Privy app ID issues rather than provider tree.

**How to avoid:**
- **`app/providers.tsx` is owned by one human (or AI session)** with a comment at line 1: `// PROVIDER ORDER LOAD-BEARING — see STACK.md`. Any PR touching this file requires explicit review notes.
- **Smoke test in CI:** Playwright test that completes Sign in with Google → checks `window.ethereum` shim is populated → reads embedded wallet address. Run on every PR.
- **Static test for the JSX tree:** parse `providers.tsx` AST in a test, assert provider component order matches the canonical tuple `[PrivyProvider, QueryClientProvider, WagmiProvider, AuthKitProvider]`.
- **Lint rule** against importing from `wagmi`'s `WagmiProvider` directly when Privy is in the project — must use `@privy-io/wagmi`.

**Warning signs:**
- Sign in with Google succeeds (Privy session active) but `useAccount()` returns `undefined`.
- `useWriteContract` errors with "no connector" for OAuth users only.
- A test user reports "I signed in with Google but my wallet isn't showing."

**Recovery:**
1. Patch the provider order; redeploy frontend. No contract or user-funds impact.
2. Users who attempted transactions during the window saw revert; no state changed on-chain.

---

### Pitfall 14: Paymaster $50/day cap silently breaks the "first 5 free" onboarding promise
**Severity:** HIGH · **Confidence:** HIGH · **Spec pin:** §10.7, FEATURES.md "Paymaster cap hit" line in critical path breaks · **Phase pin:** Phase 1 (paymaster), Phase 6 (safety review)

**What goes wrong:**
Spec §10.7 sets a $50/day global paymaster cap to mitigate sybil drain. At hackathon launch, 100 organic users averaging 5 sponsored txs × $0.01 gas = $5/day; well under cap. But on launch day with a viral X share, 500 users in an hour blow through $50 within minutes. The paymaster auto-disables; the next user trying to sign in with Google + publish a call gets "fund your wallet to continue" — a flow they're not ready for (the "first 5 free" promise was the bridge to onboarding). The user bounces. The spec correctly identifies the Telegram alert at 80% of cap, but the alert lands while the operator is asleep / not on call. The 24h reset means the cap is gone for the rest of the UTC day after a single peak hour.

**Why it happens:**
- $50/day at $0.01/tx = 5,000 sponsored txs/day. Hackathon-scale spike easily exceeds this — and 2026 Arbitrum gas at congestion is higher than $0.01 per tx (Privy's markup adds 10-30%; an unexpected gas spike can push effective per-tx cost to $0.05-0.10).
- The cap is a budget defense, not a UX target. They aren't the same thing.
- The "fund your wallet" handoff is friction the user wasn't expecting at minute 0.

**How to avoid:**
- **Raise the cap dynamically during launch windows.** Operator's runbook entry: pre-launch, raise to $500/day. Post-launch, ratchet down to $50/day with the 80% alert as the floor.
- **Per-user cap is the real defense; daily cap is a circuit breaker.** Per-account 5-tx limit per §10.7 is sufficient sybil defense at hackathon scale ($5K total potential drain at 1M sybils per FEATURES.md). The daily cap is paranoia.
- **Telegram alert at 50% cap, not 80%** — gives operator more reaction window.
- **Onboarding UX for "out of sponsored tx" path:** show "Add $5 to continue (covers 1000+ transactions)" with one-click Coinbase Onramp — not a generic "fund your wallet" screen.
- **Operator on-call rotation for launch day** — the daily cap is going to fire if launch is successful; treat it as a feature of success, not a bug.

**Warning signs:**
- Telegram alert: "Paymaster at 80% of $50 daily cap."
- New-user dropoff rate spikes at the cap-hit minute in the metrics dashboard.
- User support: "I signed up but couldn't make a call."

**Recovery:**
1. Raise the cap via the off-chain relayer config (`setPaymasterDailyCap`) per §10.7 — this is a runtime, not contract, change.
2. Backfill: post-cap users had no path to act; they bounced. Re-engagement via X / email to the affected handles is the only recovery; some are lost permanently.
3. Document peak QPS and per-tx cost for the next launch — calibrate the cap to your actual cost-per-onboarded-user budget.

---

### Pitfall 15: Satori uses `display: grid` somewhere; OG cards silently break at thumbnail size
**Severity:** HIGH · **Confidence:** HIGH · **Spec pin:** §16.3 ("outcome word must be readable at thumbnail size"), §19.11 ("OG image renders for all 5 outcome words at thumbnail size 200px"), STACK.md "Satori does not support CSS Grid" · **Phase pin:** Phase 7 (OG service)

**What goes wrong:**
The spec correctly notes Satori is flexbox-only — STACK.md emphasizes this in three places. But the failure mode of using grid in a Satori-rendered template is **silent or partial** — Satori may render the parent flex/block context but skip the grid children, producing a card with missing elements (the outcome word vanishes, or the pool bars don't appear). At a desktop preview size (1200×630) the developer doesn't notice the missing elements because the overall layout still looks intentional. At thumbnail size (200px — what actually travels on X/Discord), the missing element is what would have been "CALLED IT" or "LOUD AND WRONG" in massive Syne — meaning the shared receipt loses its **entire purpose**: making the outcome word unmissable at thumbnail. The spec's §19.11 line "OG image renders for all 5 outcome words at thumbnail size (200px)" is the gate, but if a dev runs that test and the outcome word is there because the dev used flexbox, but a subsequent CSS-fix refactor adds `display: grid` to fix an alignment issue, the gate isn't re-run.

**Why it happens:**
- Developers reach for grid instinctively for 2D layouts (two-column comparison in DuelSettled card §16.4 is the natural grid use case).
- Satori's error messages for unsupported CSS are warnings in dev logs that get lost in noise; the output renders without raising visible errors.
- Browser-based testing renders grid correctly via real Chrome — only Satori (server-side) is broken.
- The 200px-thumbnail readability check is a manual QA step easy to skip during a "tiny CSS fix."

**How to avoid:**
- **Lint rule in Phase 7:** `eslint-plugin-no-grid-in-satori` (custom or via `eslint-plugin-react/jsx-no-target-blank` pattern) — forbid `display: grid`, `gridTemplate*`, `gridColumn*` in any file under `apps/og-service/templates/`.
- **Visual regression test** at 200px: render every OG variant at 200px, compute a perceptual hash, compare against committed baselines. PR fails on hash drift.
- **`@vercel/og` provides a `font-size` heuristic** — set the outcome word's font-size in `vw` units that scale predictably, and verify at the 200px width the text occupies ≥40% of width.
- **Stage gate:** §19.11 thumbnail readability test runs on every PR touching `apps/og-service/`, not just at mainnet smoke time.

**Warning signs:**
- Satori dev-server logs show "unsupported CSS property: grid-template-columns" warnings.
- A rendered OG card looks correct at full size but loses elements at small size.
- Twitter Card Validator shows the card but the outcome word is missing or truncated.

**Recovery:**
1. Refactor the template to flexbox. Redeploy. CDN cache-bust the affected URLs.
2. Twitter Card Validator: re-submit the URL to refresh Twitter's cache. Past tweets with the broken preview cannot be repaired.

---

### Pitfall 16: Privy custodial wallet shutdown during the launch window
**Severity:** HIGH · **Confidence:** MEDIUM (Privy is well-funded but every custodial vendor carries this risk) · **Spec pin:** §10.6, §9.2 · **Phase pin:** Phase 1 (Privy integration), Phase 6 (safety review)

**What goes wrong:**
Per §10.6, OAuth-sign-in users have wallets custodied by Privy via MPC key shards. If Privy has a service incident (regional outage, security event, regulatory pressure pausing certain jurisdictions), affected users cannot sign transactions or export their wallets. The product is alive — feed renders, contracts work — but the OAuth-signed-in users can't act. The spec's mitigation is "users encouraged to export at $50 USDC balance" but in the first week of launch, almost no user is at $50; the cohort with exported wallets is empty. The spec's secondary mitigation is the Connect Wallet path (§9.1) as a fallback for crypto-native users — but OAuth users don't have a wallet to connect.

**Why it happens:**
- Custodial dependencies are single points of failure by definition.
- Privy is the spec's locked choice (per Key Decisions in PROJECT.md); switching vendors is a v1.1 conversation.
- The $50 export prompt is good policy but slow to bind users in early adoption.
- Most users won't be aware Privy is custodial despite the disclosure card per §10.6.

**How to avoid:**
- **Active export prompting:** prompt at $20 balance, not $50, in the first week of launch. Lower the friction, multiply the cohort.
- **Status page:** subscribe to Privy's status page; surface "Privy partial outage" banner in the app when relevant.
- **Backup auth path:** ensure Connect Wallet (SIWE) path is visible and works for any user who wants to migrate manually. Show a "your funds are safe but Privy is down — connect an external wallet to continue" CTA during outages.
- **Document a Privy-outage runbook:** if outage extends beyond N hours, communicate via X with "your funds are not at risk; we're waiting for Privy to recover" message.

**Warning signs:**
- Privy status page indicates degraded service.
- A wave of "I can't sign in" support requests with OAuth-only patterns.
- Privy SDK errors in Sentry: `PrivyError: failed to sign transaction`.

**Recovery:**
1. Wait for Privy recovery. There is no on-chain action available — the wallets' keys are not in the team's control.
2. For users at risk of missing settlement claims: settlement is permissionless via §12.4 — `claimPayout` is open per §10.3 carve-out. Users with external wallets can claim. OAuth-only users wait.
3. For an extended outage: there is no recourse beyond Privy's recovery. This is the residual risk of v1.

---

### Pitfall 17: Stylus contract reactivation deadline misses; entire scoring engine reverts
**Severity:** HIGH · **Confidence:** HIGH · **Spec pin:** §10.8, STACK.md "Stylus gotchas — Activation cycle" · **Phase pin:** Phase 5 (Stylus), operational/v1.1 ongoing

**What goes wrong:**
Stylus contracts must be **reactivated every 365 days** or after any Stylus protocol upgrade. After deactivation, calls into the contract revert. The spec correctly identifies the runtime fallback (§11.6) — SettlementManager's try/catch catches Stylus reverts and uses the Solidity baseline. But what happens if the team doesn't reactivate by day 365? Every settle() for the next N days falls back to the Solidity baseline — lower-fidelity rep math, no high-conviction asymmetry, fixed contrarian multiplier of 1.0. Users notice "my rep gains are wrong" after a wave of settles. The fallback works but it's a degraded mode.

**Why it happens:**
- 365 days is too long to remember as a discrete task. Tasks reminded once a year are missed.
- The deactivation is silent — no Telegram alert exists for it in v1 (the alert bot in ARCHITECTURE.md §2.7 doesn't mention reactivation).
- The fallback's transparency obscures the failure — settlement proceeds, just at lower fidelity.

**How to avoid:**
- **Calendar reminder at day 300** — operator's calendar event with the reactivation runbook link.
- **Telegram alert at deactivation event:** subscribe to Stylus contract's `Deactivated` or analogous event (verify the event exists in the Arbitrum Stylus runtime); fire alert on detection.
- **Health-check in §19.11 smoke test (annually re-run):** verify Stylus contract is "active" via Cast/Arbiscan before any major release.
- **Reactivation is `cargo stylus activate <address>` plus the activation fee** — document the command and fee budget (varies, typically <$50).

**Warning signs:**
- `RepCalculatedFallback` events firing for every settle (mass fallback indicates global Stylus issue, not single-call panic).
- Cumulative day count since deploy approaches 365.
- Arbiscan shows the Stylus contract as "Inactive" or shows the activation expiry date.

**Recovery:**
1. Run `cargo stylus activate <addr>` with the activation fee. Contract resumes within a block.
2. Backfill rep corrections for the period of fallback if the lower-fidelity math materially affected user outcomes — owner runs a one-time rep-correction script (not present in v1; would need to be built).

---

### Pitfall 18: Dispute window assumes claim activity is slow — but auto-post drives instant claims
**Severity:** HIGH · **Confidence:** MEDIUM · **Spec pin:** §12.4 resolveDispute step 3 ("post-claim disputes are NOT honored"), §13.7 settlement SLA · **Phase pin:** Phase 4 (SettlementManager), Phase 6 (safety review)

**What goes wrong:**
Spec §12.4 (resolveDispute step 3) explicitly documents "post-claim disputes are not honored; the dispute window is shorter than the typical claim activity to make this rare." But "typical claim activity is in the 24-72h window after settle" assumes claim isn't driven by an attention spike. Auto-post-to-X on settle (default ON per §15.2) creates an attention spike *at the exact moment of settle* — winners are notified, click their auto-tweet, and claim immediately. So claim activity concentrates in the first few hours post-settle, not the 24-72h window. If a dispute is raised at hour 22 (within the 24h window) and the original outcome was wrong, half the winners have already claimed via the wrong outcome — and per the spec, those claims cannot be reversed. The other half cannot claim because the outcome flips. Net: post-claim disputes ARE common when auto-post drives instant claims, and v1 has no recourse.

**Why it happens:**
- The spec's design assumption (24-72h claim activity) was based on a manual-share model, not auto-post.
- Auto-post default-ON per §15.2 is a distribution win that breaks the dispute economics.
- The 24h dispute window is long enough for genuine disputes but in conflict with the instant-claim pattern.

**How to avoid:**
- **Delay payout claim by 24h post-settle.** Add a `claimWindowOpensAt = settledAt + 24h` field; `claimPayout` reverts if `now < claimWindowOpensAt`. Trade-off: winners wait 24h for their money. Brand-on for "permanent receipt; the rep updates immediately, the cash settles in 24h."
- **Shorter dispute window (e.g., 6h) for low-value calls** under a threshold — accepts more dispute risk on small calls in exchange for fast claims.
- **Operator runbook for accepted disputes:** if a dispute is upheld post-claim, owner directly USDC-transfers the corrected payouts to affected users from the treasury wallet. Document this as a v1 operational responsibility.
- **Default auto-post-to-X to OFF** for the first weeks of launch, gating until the dispute pattern is observable.

**Warning signs:**
- A dispute fires within the 24h window and the resolved outcome differs from the original.
- Claim activity spikes in the first 4h post-settle (>50% of total claims) per the subgraph aggregation.

**Recovery:**
1. Owner manually transfers USDC from treasury to users who would have won under the corrected outcome.
2. For users who claimed under the wrong outcome and the correction makes them losers: owner can either request return (no enforcement) or absorb the loss from treasury.
3. v1 documented limitation; v1.1 priority: claim-delay or dispute-window adjustment.

---

### Pitfall 19: CEX listing scraper false positive triggers settlement on a non-listing announcement
**Severity:** HIGH · **Confidence:** MEDIUM · **Spec pin:** §13.6, §4.7 (Resolution Criteria required for CEX listing subtype) · **Phase pin:** Phase 4 (SettlementManager + CEX scrapers)

**What goes wrong:**
Per §13.6, 8 CEX scrapers (Binance, Coinbase, OKX, Bybit, Kraken, Bitget, KuCoin, Upbit) poll exchange listing announcement pages every 5 minutes. The scraper looks for the call's token symbol on the listing page. False-positive scenarios: (a) **Innovation Zone listing** — Binance sometimes pre-lists tokens to a restricted Innovation Zone with disclaimers; the spec's example Resolution Criteria for CEX listing explicitly excludes this, but a string-match scraper sees "POPCAT" and triggers; (b) **Futures-only listing** — same exclusion; (c) **Delisting announcement** — a "we are removing POPCAT" announcement matches a "Binance lists POPCAT" call positively; (d) **Wrong token, same ticker** — a token with the same symbol on a different chain listed on Binance triggers a call for the original token; (e) **Page restructure** — exchange changes its announcement page format mid-call; scraper either misses real listings or matches stale cached content. Each false positive triggers a `submitCexListing(callId, true, evidenceHash, exchange)` tx, and SettlementManager settles the call.

**Why it happens:**
- Web scraping is brittle by design — exchange pages change without notice (no breaking-change SLA).
- The Resolution Criteria field (§4.7) is *advisory* per §4.7 — structured fields win in disputes. So even if the criteria says "must be spot on Binance.com, not Innovation Zone," the scraper triggering on Innovation Zone produces a settlement that the dispute window must catch.
- 8 exchanges × hundreds of listings/year × edge cases = high false-positive surface.

**How to avoid:**
- **Per-exchange scraper modularity** (already in ARCHITECTURE.md §2.7) — each scraper isolated; one broken scraper doesn't taint others.
- **Multi-signal confirmation:** require BOTH announcement page match AND a Twitter Spaces / public verification of the listing (cross-check the exchange's official Twitter for the same announcement). Adds latency but eliminates most false positives.
- **Innovation Zone / futures exclusion in scraper logic:** explicit page-section filtering (Binance's announcement pages have distinguishable URL structures or DOM classes for Innovation Zone vs main listings). Document the per-exchange exclusion rules.
- **High-friction submit pathway for CEX listings:** rather than auto-submit, the scraper alerts the operator on a match, operator verifies (5-minute manual check), then submits. Accepts latency in exchange for accuracy. Acceptable since CEX listing calls are typically multi-day expiry.
- **Dispute window per spec §13.7 catches the rest** — 24h human review window with $5 bond.

**Warning signs:**
- Spike in disputes specifically on CEX-listing settled calls.
- A scraper alert that says "POPCAT listing detected" while the operator manually checks and finds Innovation Zone only.
- A scraper that hasn't fired in N days when the exchange has had listings.

**Recovery:**
1. Dispute window per §13.7 catches; owner resolves via `resolveDispute(callId, correctOutcome)` per §12.4.
2. Patch the scraper's exclusion rules. Document the per-exchange edge case in the scraper module.
3. For calls already past dispute window settled on a false positive: outcome stands; users' funds moved per the bad outcome. Owner can voluntarily compensate from treasury (operational discretion).

---

### Pitfall 20: 24h cooldown on new-auth-link is checked client-side, not enforced server-side
**Severity:** HIGH · **Confidence:** HIGH · **Spec pin:** App.A.1 "New-auth-link cooldown", §10.6, ARCHITECTURE.md §5 "OAuth proof verification" row · **Phase pin:** Phase 1.5 (social linking)

**What goes wrong:**
Per App.A.1, after a new auth method is added (e.g. user links Google to a wallet-originated account), a 24h cooldown must elapse before withdrawal authorization. The spec says this is "implement in the relayer (server-side timestamp check before signing withdrawal-authorization message)" (STACK.md). If the team implements only a frontend check — disabling the withdraw button in UI until 24h elapse — a sophisticated attacker who has compromised an OAuth account (via OAuth replay, session hijack) can craft a direct contract call (bypassing the frontend) and pull funds within minutes. The product appears safe to QA running through the UI but is exposed via direct tx.

**Why it happens:**
- Frontend timestamp checks are quick and visible; server-side enforcement requires backend code in the relayer.
- The relayer's role here is "withdrawal authorization signing" — a non-obvious step for a team focused on shipping features.
- Test coverage on the cooldown is typically UI-only; nobody scripts a direct-contract test that bypasses the frontend.

**How to avoid:**
- **Server-side timestamp check in the relayer** before issuing any signed withdrawal-authorization message. Store `linkedAt[user][authMethod]` in the relayer's Postgres; reject signing if `now < linkedAt + 24h`.
- **On-chain enforcement:** ProfileRegistry could store `lastAuthLinkTime` and gate any state-changing function (or via a separate `WithdrawalAuthorizer` contract) on `now - lastAuthLinkTime > 24h`. This is more secure but a contract change beyond current spec.
- **Test the bypass:** Phase 6 test that constructs a direct contract call to withdraw without going through the frontend; verify it reverts.

**Warning signs:**
- A withdrawal tx within 24h of a `SocialLinked` event for the same user — should be impossible.
- Compromised account reports: "someone added Google to my account and withdrew."

**Recovery:**
1. If exploited: funds are gone from the affected wallet. v1 caps ($100/call) and TVL ($5K) bound the loss.
2. Patch the relayer to enforce the cooldown. Affected users: communicate, offer rep restoration if applicable.
3. Long-term: move the check on-chain.

---

### Pitfall 21: ChallengeEscrow asymmetric-stake overage refund stranded
**Severity:** MEDIUM-HIGH · **Confidence:** MEDIUM · **Spec pin:** §5.3 "asymmetric duels," §12.3 claimDuelPayout step 7-8 · **Phase pin:** Phase 3 (ChallengeEscrow)

**What goes wrong:**
Per §5.3, if challenger and caller stake different amounts (asymmetric), the pot is `min(callerStake, challengerStake) × 2` and the overage is "returned to whichever side overcommitted, regardless of outcome." Per §12.3, this is in `claimDuelPayout`. If the *winner* is the overcommitter, the implementation pays out `pot × 99 / 100` to winner AND overage to winner — straightforward. If the *loser* is the overcommitter, the loser must call a separate refund function for the overage — and a loser is less likely to interact again with the product. The overage sits unclaimed in escrow indefinitely. Worse: if `claimDuelPayout` is only callable by the winner per step 2 (`require(msg.sender == challenge.winner)`), the loser has no path to claim their overage at all without a separate function.

**Why it happens:**
- `claimDuelPayout` was likely designed as a winner-only path (matches the §12.3 step 2 access control).
- The overage refund is mentioned in §5.3 as a property but the function-level implementation is folded into the same claim function.
- Losers don't claim — there's no UX incentive to come back to a duel you lost.

**How to avoid:**
- **`claimOverage` separate function** callable by either party. Idempotent. Frontend surfaces a "claim your overage refund" UI for losers post-settle if applicable.
- **Auto-refund at settlement:** in SettlementManager's `settle()` step 8 (duel-specific), directly transfer overage to the overcommitter's wallet — push-pattern. Gas cost is bounded; UX is one-click.
- **Subgraph entity tracks unclaimed overage** so the operator can see total stranded USDC.

**Warning signs:**
- Total escrowed USDC in ChallengeEscrow doesn't reconcile to `sum(open_challenges + pending_claims)`.
- Subgraph aggregation shows "unclaimed overage" balance grows over time.

**Recovery:**
1. Add a `claimOverage` function in a contract patch — but contracts are non-upgradeable per §10.8. So this requires a redeploy or treating the overage as a v1.1 fix.
2. Owner can manually transfer stranded USDC to the rightful overcommitter via an admin-USDC-transfer function (which doesn't exist in v1). Bake this into the redeploy plan if it becomes material.

---

### Pitfall 22: `claimPayout` math undefined when LP fees inject into a pool with only virtual shareholders
**Severity:** MEDIUM · **Confidence:** MEDIUM · **Spec pin:** §8.6 LP fee row, §12.4 step 11, §12.2 claimPayout, §8.2 virtual fade dissolution · **Phase pin:** Phase 2 (FollowFadeMarket), Phase 4 (SettlementManager), Phase 6 (safety review)

**What goes wrong:**
Per §8.6, the 0.3% LP fee at settlement "stays in the winning pool, distributed proportionally to all winning shareholders." Per §12.4 step 11, the LP fee is "routed into the winning pool's reserve." If the winning side has no real shareholders (e.g., a call with no real fade, fader-side wins because caller's call was wrong; or vice versa), the LP fee accrues to phantom/virtual shareholders or to nobody. `claimPayout` math computes `userPayout = userWinningShares / totalWinningShares × totalPool` — if `totalWinningShares == 0`, this is division-by-zero and reverts. If `totalWinningShares > 0` but all shares are virtual (the $7 virtual fade seed), the math returns USDC to nobody — funds stranded.

**Why it happens:**
- The virtual fade seed dissolves at settlement per §8.2 ("The virtual portion does not pay out to anyone at settlement — it dissolves"), but the LP fee injection happens *during* settlement.
- The interaction between virtual liquidity dissolution and LP-fee distribution is not explicit in the spec.
- A call where the only fader is virtual but the call is wrong → fade pool wins → LP fee injected into a pool with only virtual shareholders → math undefined.

**How to avoid:**
- **Explicit invariant:** if `realWinningShares == 0` after virtual dissolution, the LP fee routes to the treasury instead of the empty pool. Document and implement in SettlementManager step 11.
- **Test fixture in Phase 6:** a call with zero real follow OR zero real fade where the empty side wins → verify settlement completes, LP fee routes correctly, no stranded funds.

**Warning signs:**
- A settled call with `outcome == fadeSide` and zero real faders — funds stranded.
- `claimPayout` reverts with division-by-zero for specific callIds.

**Recovery:**
1. Treasury accumulates stranded LP fees; operator's quarterly reconciliation moves them.
2. Patch in v1.1 with the empty-side LP-routing fix.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Single signing key for all oracle paths (NFT + DefiLlama + Snapshot + CEX) | One KMS key to manage; simpler relayer | Compromise blast radius covers all non-Pyth oracles (Pitfall 7) | v1 hackathon scale ($5K TVL); split per-oracle keys before v1.1 |
| Deploying with deployer key as owner (no multisig from day 1) | Faster Phase 1 ship | Single point of failure for pause + forceSettle + Stylus admin (Pitfall 6) | Never — Phase 0 deploys Safe even if ownership stays on deployer initially |
| Polled-events fallback instead of subgraph from day 1 | Skip Subgraph Studio setup | UI degraded; aggregations slow; cannot query historical data; "blackout" period during deploy | Acceptable per spec §3060 as fallback during subgraph deploy gaps only |
| `getTvl()` reads `USDC.balanceOf(FollowFadeMarket)` only | Single line of code | Cap is wrong as soon as ChallengeEscrow holds USDC (Pitfall 3) | Never — define canonical getTvl() in Phase 2 |
| Inline USDC literal addresses in tests / scripts | Faster scaffolding | Mainnet day paste-bug surface (Pitfall 1) | Test fixtures only, lint-guarded against in source files |
| Frontend shows local time only on deadline picker | Lower form complexity | UTC-day collision confusion (Pitfall 12) | Never per spec App.A.1 |
| Cap on auto-post receipt to X at relayer concurrency = 10 | Cheap default | Mass-settle days will queue posts for hours; defeats viral moment | Acceptable initial; promote auto-post to dedicated worker pool in v1.1 |
| Skip the "destruction drill" for Stylus fallback because the code compiles | Save 2h | Fallback fails silently on first real revert (Pitfall 2) | Never — mandatory in Phase 6 |
| Cache OG cards aggressively (max-age 86400) to reduce Vercel function cost | Lower OG service cost | Stale share previews on auto-post (Pitfall 8) | Lower max-age to 60-300s with `stale-while-revalidate` |
| Single relayer process for all subsystems | Simpler deploy | One subsystem's crash takes the others down; split per ARCHITECTURE.md §2.7 v1.1 note | Acceptable for v1 hackathon scale; plan split for v1.1 |
| Skip Sepolia 48h gate "because the spec is just guidance" | Ship faster | Real-money mainnet without integration test = funds at risk | **Never** — spec §19.10 marks this as non-optional |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| **Pyth Network** | Calling `getPriceNoOlderThan` without first pushing an update | Multi-call pattern: fetch Hermes VAA → `updatePriceFeeds{value: fee}` → `settle` (Pitfall 4) |
| **Privy + wagmi** | Importing `WagmiProvider` from `wagmi` instead of `@privy-io/wagmi` | Always import from `@privy-io/wagmi`; provider order load-bearing (Pitfall 13) |
| **Privy + Twitter OAuth** | Default scope is `users.read` only | Request `follows.read` via Privy custom scopes; pay for X API Basic tier ($200/mo per STACK.md) |
| **Alchemy NFT API** | Calling `getFloorPrice` per-request with no caching | Cache at 5-min intervals; Alchemy caches server-side anyway; rate limit is generous but not infinite |
| **DefiLlama** | Querying TVL/Volume/Fees at the exact deadline second | DefiLlama updates on N-minute intervals; query a few minutes after deadline to allow for source updates |
| **The Graph Decentralized Network** | Publishing without curating with GRT (~3,000 GRT ≈ $100-300 in 2026) | Budget for curation upfront; indexers need incentive to pick up the subgraph |
| **The Graph subgraph mappings (AssemblyScript)** | Using `null` for value types or assuming closures work | AssemblyScript has strict no-null-for-values, no-closures; plan mapping logic flat |
| **@vercel/og** | Selecting edge runtime to optimize cold-start | `resvg-wasm` bundling fails on edge; use Node runtime per STACK.md "What NOT to Use" |
| **Satori (under @vercel/og)** | Using `display: grid` for 2-column layouts | Flexbox only; Satori silently skips grid children (Pitfall 15) |
| **Coinbase Onramp** | Polling for fulfillment instead of subscribing to webhook | Webhook is more reliable; verify webhook signature against Coinbase JWKS endpoint |
| **Native USDC (Arbitrum)** | Copy-pasting USDC.e address from a 2023 tutorial | Single source of truth `packages/config/usdc.ts` (Pitfall 1) |
| **Snapshot** | Reading off the public REST API on every settle | Use `@snapshot-labs/snapshot.js` SDK; cache per-proposal state for 5min |
| **Tally** | Assuming there's a Tally SDK on npm | No SDK — direct GraphQL fetch to `https://api.tally.xyz/query`; API key from Tally dashboard |
| **Farcaster Auth Kit** | Wrapping above PrivyProvider | Wrap below — Privy is the outermost auth provider per ARCHITECTURE.md §2.8 |
| **IPFS via Pinata** | Storing user-generated content (reasoningText) without size limits | Cap at 8KB; truncate in UI before pinning; cost scales with size |
| **Stylus deploy** | Forgetting `rustup target add wasm32-unknown-unknown` | Verify in CI; first-time deploys break here predictably |
| **Stylus contract** | Skipping `cargo stylus activate` after deploy | Contract is deployed but inactive; reverts on call (Pitfall 17) |
| **The Graph subgraph publish** | Targeting `arbitrum-one` typo as `arbitrum` | Manifest must say `arbitrum-one` for mainnet, `arbitrum-sepolia` for staging |
| **Telegram bot** | Hardcoding the bot token in repo | Use env vars; rotate if leaked (Telegram's token-leak detection is good but not instant) |
| **Better Stack / log aggregation** | Logging raw private keys to Pino (e.g., debug-printed relayer signer) | Pino redact rules: redact `signer.privateKey`, `auth.token`, `apiKey` fields by default |
| **wagmi `useWriteContract`** | Not setting `reconnectOnMount: false` for Privy embedded wallets | The `@privy-io/wagmi` wrapper does this; if falling back to vanilla wagmi createConfig, set manually |

---

## Performance Traps

Patterns that work at hackathon scale (≤$5K TVL, ≤100 active users) but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| **OG cards rendered on every request, not cached** | OG service Vercel function invocations spike on viral share; bill jumps | `Cache-Control: public, max-age=60, stale-while-revalidate=300`; warm cache on settle | First viral X share with >1K impressions |
| **Subgraph queries fetch entire feed on every paint** | Feed page slow on mobile; subgraph query bill grows | Pagination via `first: 25, skip: N`; cursor-based for stability | >500 calls in subgraph |
| **Pyth update fees paid per-settle without batching** | ETH burn on relayer wallet outpaces top-ups | Batch settle multiple calls per `updatePriceFeeds` call when feeds overlap | >50 settles/day |
| **Frontend polls subgraph at 5s for every call card** | N call cards × 5s polls × M concurrent users = subgraph DDoS | Single websocket OR polling at 30s for non-focused cards, 5s for active call card | >50 concurrent users on /feed |
| **CEX scrapers run synchronously, one exchange at a time** | Settle latency for CEX-listing calls grows linearly with exchange count | Parallel scraping; per-exchange timeouts | First 8-exchange call settle |
| **`getCallsByUser` iterates a mapping without pagination** | RPC times out on profiles with >100 calls | `offset, limit` pagination per §12.1 (spec is correct here); enforce in tests | >100 calls per power user |
| **OG service generates all 5 card variants on first call** | Cold-start latency >1s per request | Pre-render variants on call creation; warm cache | First call's first share |
| **Twitter follow-graph fetch on every feed load** | X API rate limits + cost | 1h cache per user per spec §9.9 | Free tier exhausted at ~50 active users |
| **BullMQ queue without per-job rate limit** | Queue grows during oracle outage; backfill takes hours when oracles recover | Per-queue concurrency cap (e.g., 10 parallel settles); jitter retry | First major Pyth incident |
| **AssemblyScript subgraph mapping uses heavy string ops** | Indexer slow; subgraph lag grows | Flat mapping logic; avoid string concat in hot path | >10K events/day |
| **Alert bot fans out Telegram messages per-event without batching** | Telegram rate limit hit; alerts dropped silently | Batch alerts per-minute, group by category | First incident with multiple events/min |

---

## Security Mistakes

Beyond OWASP basics — domain-specific to this product.

| Mistake | Risk | Prevention |
|---------|------|------------|
| `delegatecall` to any address that isn't a static known-implementation | Arbitrary code execution; total drain | Spec §10.5 forbids; CI grep `\.delegatecall\(` and require explicit whitelist comment |
| Missing `nonReentrant` on a USDC-transferring function | Re-entrancy drain | Spec §10.5 mandates; lint rule enforces |
| USDC `safeTransferFrom` failure not checked | Phantom deposits | Use OpenZeppelin SafeERC20 (per STACK.md); reverts on failure (Pitfall 1 connection) |
| Owner functions on multisig but proxy admin on EOA | Stylus implementation upgradable by a single key | Per §10.8, proxy admin must rotate to multisig same time owner does (Pitfall 6) |
| Trusting `block.timestamp` for sub-second timing | MEV manipulation | Spec correctly uses 60s freshness windows; verify no <60s timestamp comparisons exist |
| Oracle data routed to settle without confidence check | Mango-Markets-style oracle manipulation | Spec §13.1 0.5% confidence threshold; enforce; per-asset tighten in v1.1 |
| Storing OAuth refresh tokens in cleartext in relayer DB | Hostile contractor / breach exposes all linked X accounts | Encrypt at rest; rotate encryption keys; minimal token lifetimes |
| Subgraph publishes contract addresses to a public manifest before deploy | Front-running deploy via etherscan watch | Deploy contracts → wait 1 block → publish subgraph manifest |
| Relayer signing key sits in process memory | Memory dump exposes key | KMS-sign per request; never load key into process memory (Pitfall 7) |
| Privy custom OAuth scopes too broad (`tweet.write` without consent screens) | User-facing trust failure | Request only `tweet.write` scope at the time of auto-post opt-in; default OFF for first launch |
| Force-settle owner key cooldown bypassed by setting `expiry` to past time at deploy | Owner can force-settle immediately | Spec §12.4 reads `block.timestamp >= call.expiry + 7d`; verify the deploy doesn't create calls with past expiry |
| `setTvlCap` raises above `MAX_ALLOWED_CAP` | Cap can be set to MAX_UINT, removing protection | Spec App.A.1 hardcoded `MAX_ALLOWED_CAP = 100,000 * 1e6`; verify on-chain constant |
| Self-challenge gate enforced UI-only | Caller challenges themselves via direct tx | Contract-level enforcement per §12.3 step 5 (`SelfChallenge` revert) — verify in tests |
| Twitter Card meta tags not server-rendered | Twitter previews show as "no card found" | Server-render `<meta property="og:image">` in `/call/[id]` Next.js layout, not client-only |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| User publishes call at 11:58 PM local; UTC-day floor puts hash in tomorrow's bucket; sees duplicate | "Why is this a duplicate? I made a different call." | Show UTC-day hash bucket inline (Pitfall 12) |
| Settled receipt shows "claim payout" button but user has nothing to claim (they were on losing side) | Confusion + frustration | UI checks `getUserPosition` and `outcome` before showing button; surface "your fade was wrong; nothing to claim" message |
| Caller exit flow doesn't preview penalty before signing | User signs and is surprised by the 49% slash | `computeCallerExitPenalty` view function (in §12.1) — display in two-step confirm modal |
| First-time OAuth user lands on `/feed` and sees empty state | Bounces; no clue what to do | Onboarding flow forces 3-step intro (handle, socials opt-in, "make your first call") per §15.9 |
| Sponsored-gas runs out mid-onboarding; user prompted to fund $5 from Coinbase | Friction at the worst moment | Cap-hit detection → "you're set up; add $5 to unlock unlimited" framing (Pitfall 14) |
| Receipt page shows wallet address publicly | Privacy concern; address is permanent | Per App.A.1, "Address on shareable receipt: NOT shown — handle + rep + outcome only" |
| Live receipt shows pool ratios that change while user reads | Disorienting | Use spec §17.2 "Live odds bar: slides smoothly as new positions come in; never jumps" — debounce updates |
| Mobile user opens shared link, lands on a non-responsive page | Drops; share-loop broken | 7 pages mobile-responsive per Phase 9; non-responsive pages get "best viewed on desktop" banner per §19 |
| Auto-post-to-X tweets "CALLED IT!" on a call settled via dispute reversal (loser auto-posted before flip) | User looks foolish; product reputation damage | Delay auto-post until 30min post-settle to absorb early disputes; or default to OFF for first weeks (Pitfall 18) |
| Privy custodial disclosure surfaces once and never again | User forgets they don't control the key | Re-prompt at every $50 balance increment; show wallet status icon (custodial vs exported) in header |
| "Connect Twitter" succeeds but VERIFIED · X badge doesn't render | Looks like a bug; user re-tries | Relayer must confirm tx mined before showing badge; loading state in between |
| New Call form lets user pick a deadline in the past | Tx reverts on submit | Frontend gates on `expiry > now + 60s` (allow buffer for tx confirmation) |
| Conviction slider snaps from 84% to 85% without warning at the high-conviction threshold | User crosses threshold accidentally; 2× penalty math kicks in | Spec §17.2 "Conviction warning (≥85%): Amber callout fades in with slight upward motion" — verify the warning is unmissable |
| Duel settled card shows wrong avatar mapping (loser as winner) | Defeats the "I beat them" share moment | OG service must verify `winner == challenger ? challenger : caller` matches against on-chain Challenge.winner field |
| Caller Exited banner is amber across the whole call detail page; doesn't visually distinguish "call is exited but pools are still live" | Followers/faders think the call is dead | Spec §15.3 mandates amber "CALLER EXITED" header; clarify in copy that pools continue per §8.7.2 |

---

## "Looks Done But Isn't" Checklist

Execution sign-off gates — an executor agent should walk this checklist before declaring any phase complete. Each item maps to a specific spec section and a verification.

### Share loop (Phases 4–7)
- [ ] **OG Settled card outcome word**: rendered at 200px viewport — readable, not truncated, not overflowing? (§16.3, §19.11) — visual diff against committed baseline.
- [ ] **OG Fallback card**: serves on cache miss within 100ms? (§16.6) — manual `curl` test against a non-existent callId.
- [ ] **Auto-post-to-X**: waits for OG cache to be warm before posting? (Pitfall 8) — Sepolia test: settle a call, watch the auto-post worker logs for the cache-verify step.
- [ ] **Twitter Card Validator**: returns the correct card variant for a settled mainnet call? (§19.11) — run cards-dev.twitter.com/validator manually.
- [ ] **Receipt `og:image` meta tag**: server-rendered, not client-only? — view-source on `/call/[id]` and confirm presence.
- [ ] **5 OG variants**: Live, Settled, Duel Settled, Caller Exited, Fallback — each rendered, cached, invalidated correctly? (§16.1-6) — manual fixture for each.
- [ ] **Receipt URL is permanent**: same URL works for unauthenticated users? (§18.1) — open in incognito; verify no auth redirect.

### Settlement path (Phase 4)
- [ ] **Pyth update is included in `settle()`**: settle accepts `bytes[] pythUpdateData` and pays the fee? (Pitfall 4) — read the function signature.
- [ ] **Stylus runtime fallback fires** on intentional revert? (Pitfall 2) — deploy `RevertingStylusEngine` on Sepolia, run settle, verify `RepCalculatedFallback` event.
- [ ] **Settlement is idempotent**: second `settle()` call reverts cleanly? (§12.4 step 2) — fuzz test.
- [ ] **Settlement atomicity**: any revert in steps 1-14 rolls back entire tx? (§12.4) — fuzz test inducing failure at each step.
- [ ] **Cold-start 25% adjustment**: applied when only virtual fade exists? (§8.3, §12.4 step 10) — fixture test with zero real faders.
- [ ] **LP fee** routes correctly when winning pool has no real shareholders? (Pitfall 22) — empty-side test.
- [ ] **Duplicate hash cleared** post-settle? (§12.4 step 12) — re-create same call after settle; should succeed.
- [ ] **`forceSettle` cooldown** correctly enforced? (§12.4) — owner cannot call before expiry+7d.

### Safety caps (Phase 6)
- [ ] **TVL cap aggregation** spans CallRegistry + FollowFadeMarket + ChallengeEscrow? (Pitfall 3) — boundary fixture with USDC across all three.
- [ ] **`MAX_ALLOWED_CAP = 100K`** enforced on `setTvlCap`? (App.A.1) — Cast read.
- [ ] **Pause carve-out**: withdraw/claim work while paused? (§10.3) — pause + claim test.
- [ ] **USDC address** is native (`...5831`), not bridged (`...5CC8`) in every contract? (Pitfall 1) — grep + Cast verify.
- [ ] **Solidity version pinned** to `=0.8.30` (not `^0.8.24` floating)? (STACK.md) — verify foundry.toml + each contract's pragma.
- [ ] **Owner is multisig** OR a documented v1.1 transition plan? (Pitfall 6) — Cast `owner()` on all contracts.
- [ ] **Stylus contract active**: `cargo stylus check` succeeds against deployed address? (Pitfall 17) — health-check script.
- [ ] **All Phase 6 safety tests pass** on Sepolia? (§19.10) — checklist.

### Embedded wallet path (Phase 1, 1.5)
- [ ] **Privy provider order**: `<PrivyProvider><QueryClient><WagmiProvider>` exactly? (Pitfall 13) — AST test.
- [ ] **24h new-auth-link cooldown** enforced server-side? (Pitfall 20) — Postgres timestamp check; direct-tx bypass test.
- [ ] **SIWE re-sign at withdrawal** for saved external addresses? (App.A.1) — manual test.
- [ ] **Paymaster cap**: 5 sponsored tx per account + $50/day global? (§10.7) — relayer counter inspection.
- [ ] **Custody disclosure** card shown during onboarding? (§10.6) — UI fixture.
- [ ] **Coinbase Onramp** webhook verifies signature against JWKS? (ARCHITECTURE.md §6) — test with invalid signature.

### Oracle attestation plane (Phase 4)
- [ ] **NFT TWAP** observation count ≥12 enforced in `submitNftFloor`? (§13.2) — test with 11 observations; must revert.
- [ ] **Per-oracle signing keys** separated (NFT, DefiLlama, Snapshot, CEX)? (Pitfall 7) — KMS key inventory.
- [ ] **CEX scraper** filters Innovation Zone / futures-only listings? (Pitfall 19) — fixture for each exclusion case per exchange.
- [ ] **DefiLlama** queries at deadline + N-minute buffer? — verify in cron config.
- [ ] **Snapshot vs Tally** preference: trustless Tally read used when available? (ARCHITECTURE.md §5) — code review.

### Subgraph + indexing (Phase 0, 7)
- [ ] **Subgraph manifest** targets `arbitrum-one` (mainnet) / `arbitrum-sepolia` (staging)? — verify by network.
- [ ] **Polled-events fallback** functions when subgraph is behind? (App.A.1) — disable subgraph, verify UI degraded but functional.
- [ ] **Mapping handles** every event emitted by all 6 contracts? — event coverage grep.
- [ ] **Subgraph aggregation** for TVL matches on-chain `USDC.balanceOf` sum? (Pitfall 3) — daily reconciliation test.

### Mainnet day (post-Phase 6, pre-§19.11)
- [ ] **Sepolia 48h staging gate** complete with all required test artifacts? (§19.10) — checklist.
- [ ] **Env vars** at Vercel + Railway + Subgraph Studio match mainnet column? (Pitfall 5) — `diff` ritual.
- [ ] **Chain ID** in bundled JS = 42161, not 421614? — grep bundled output.
- [ ] **Twitter Card Validator** passes for synthetic settled call? (§19.11) — manual.
- [ ] **All 5 oracle adapters** return test data for synthetic call? (§19.11) — checklist.
- [ ] **Operator on-call schedule** posted for launch + 72h? — calendar event.
- [ ] **Telegram alert bot** receives test alerts from each subsystem? — fire test event from each adapter.
- [ ] **Treasury wallet** balance for dispute rewards (>$200 USDC)? — Cast read.
- [ ] **Relayer ETH balance** for Pyth update fees (>0.1 ETH)? — Cast read.

---

## Recovery Strategies

When pitfalls occur despite prevention, the recovery cost and path.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| 1 — USDC address wrong | HIGH | Pause; redeploy with correct address; manual USDC.e→native swap for affected users via Uniswap/CCTP |
| 2 — Stylus fallback broken at runtime | MEDIUM | Fallback path's revert means atomic tx rollback; call stays Live; owner uses `forceSettle` at expiry+7d |
| 3 — TVL cap aggregation drift | MEDIUM | Pause; reconcile off-chain; raise cap to actual TVL via `setTvlCap`; unpause; patch in v1.1 |
| 4 — Pyth pull-model omission | LOW | Patch relayer to include update VAA; retry failed settles |
| 5 — Env config drift on mainnet day | LOW (if caught in minutes) / HIGH (if real money moved) | Pause; fix envs; redeploy; verify chain ID in bundle |
| 6 — Owner key compromised pre-multisig | CATASTROPHIC | No on-chain recovery if attacker acts first; race the attacker to multisig transfer; $5K cap bounds loss |
| 7 — Relayer signing key compromise | HIGH | `setOracleRelayer(0x0)` to halt signed submissions; manual outcome resolution via `forceSettle`; rotate keys |
| 8 — OG cache out of sync | LOW | Manual CDN purge for affected URLs; broken tweets are unrecoverable (delete + reshare) |
| 9 — AMM sub-state shared bug | CATASTROPHIC if calls-wide | Pause; redeploy fresh contracts; users withdraw via §10.3 carve-out; communicate migration |
| 10 — Post-expiry follow gate missing | MEDIUM | Patch via redeploy (non-upgradeable); refund victims from treasury at operator discretion |
| 11 — Self-fade farm | LOW | Observability-only mitigation in v1; v1.1 contract gate + rep recomputation |
| 12 — UTC duplicate-hash confusion | LOW | UI patch; no contract change needed |
| 13 — Privy provider order regression | LOW | Frontend patch; redeploy |
| 14 — Paymaster cap hit | LOW | Raise cap via relayer config; lost users are lost (re-engagement is operations) |
| 15 — Satori grid in template | LOW | Refactor template to flexbox; CDN purge; re-validate Twitter cards |
| 16 — Privy outage | NONE | Wait for Privy recovery; communicate; no on-chain action possible |
| 17 — Stylus reactivation missed | LOW | `cargo stylus activate <addr>`; backfill rep corrections if material |
| 18 — Post-claim dispute reversal | MEDIUM | Owner manually USDC-transfers to affected users from treasury |
| 19 — CEX scraper false positive | MEDIUM | Dispute catches; resolve via owner; patch scraper exclusion |
| 20 — 24h cooldown client-side only | HIGH | Funds lost from affected wallet; patch relayer for cooldown enforcement |
| 21 — Asymmetric duel overage stranded | LOW | v1.1 claimOverage function; owner manual transfer in interim |
| 22 — Empty-pool LP-fee math | LOW | Treasury accumulates stranded fees; patch in v1.1 |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 — USDC address paste-failure | Phase 0 (foundation), 1, 6 | CI grep + Cast post-deploy + §19.11 smoke |
| 2 — Stylus runtime fallback never exercised | Phase 5, 6 | Mandatory Sepolia destruction drill with `RevertingStylusEngine` fixture |
| 3 — TVL cap aggregation drift | Phase 2, 6 | Foundry fuzz invariant tests; boundary fixtures including ChallengeEscrow |
| 4 — Pyth pull-model omission | Phase 4 | Settle function signature includes `pythUpdateData`; ETH budget monitoring |
| 5 — Env config drift | Phase 0 (env system), 6, mainnet day | Build-time invariant + smoke checklist + diff ritual |
| 6 — Single owner key persistence | Phase 0 (multisig setup), pre-v1.1 (mandatory rotation) | Cast owner() reads + multisig deploy script |
| 7 — Relayer signing key compromise | Phase 4, 6 | KMS-sign integration; per-oracle key separation; on-chain TWAP sanity-check secondary path |
| 8 — OG cache desync with on-chain state | Phase 7 | OG service reads from RPC, not subgraph; auto-post waits for cache-warm |
| 9 — AMM sub-state shared invariant bug | Phase 2, 6 | Foundry property-based fuzz; cold-start bootstrap tests; multi-call interference fixtures |
| 10 — Post-expiry follow window open | Phase 2, 6 | Strict `block.timestamp < call.expiry` gate; relayer settle-latency monitoring |
| 11 — Self-fade rep farming | Phase 4, 6 (observability dashboard) | Relayer analytics flag; v1.1 contract-level gate |
| 12 — UTC duplicate-hash boundary | Phase 1 (New Call UI) | Frontend displays UTC-hash bucket inline |
| 13 — Privy provider order regression | Phase 1 | Provider-tree AST test in CI; Playwright sign-in smoke |
| 14 — Paymaster cap breaks onboarding | Phase 1, 6 | Operator runbook for cap-raising during launch; per-user cap as primary defense |
| 15 — Satori grid in OG template | Phase 7 | Lint rule + visual regression at 200px |
| 16 — Privy outage | Phase 1.5, ongoing ops | Status-page subscription; Connect Wallet fallback UX |
| 17 — Stylus reactivation deadline | Phase 5, ongoing ops | Calendar reminder day 300; Telegram alert on deactivation event; annual smoke test |
| 18 — Post-claim dispute reversal | Phase 4 | Claim-delay implementation OR shortened dispute window OR auto-post default OFF; documented in operator runbook |
| 19 — CEX scraper false positive | Phase 4 | Per-exchange exclusion fixtures; multi-signal confirmation; high-friction submit path |
| 20 — 24h cooldown client-side only | Phase 1.5, 6 | Server-side enforcement in relayer; direct-tx bypass test |
| 21 — Asymmetric duel overage stranded | Phase 3 | Push-pattern refund in SettlementManager; subgraph unclaimed-overage entity |
| 22 — Empty-pool LP fee math | Phase 2, 4, 6 | Explicit invariant: empty-side LP routes to treasury; fixture test |

---

## Sources

- **`CALL_IT_SPEC1.md` v1.0** (locked v1 spec, 3088 lines) — the authoritative source for every spec section pin in this document
- **`.planning/research/STACK.md`** (sister research output, 370 lines) — validated stack with version pins, "What NOT to Use" table, integration gotchas
- **`.planning/research/FEATURES.md`** (sister research output, 1100+ lines) — table-stakes/differentiator/anti-feature mapping, attack-surface analysis, share-loop critical path
- **`.planning/research/ARCHITECTURE.md`** (sister research output, 800+ lines) — 6-contract boundaries, 6 data flow traces, trust boundary inventory, hidden infrastructure
- **Solidity 0.8.34 release notes** (February 2026) — IR pipeline storage-clearing bug, fixed
- **OpenZeppelin Stylus crate 0.3.0 docs** (September 2025) — UUPS proxy pattern, alpha-line caveats
- **Stylus SDK 0.10.7 release notes** (May 2026) — current SDK; activation cycle (365 days) confirmed
- **Pyth Network "Getting started: pulling price updates" docs** — pull-model multicall pattern
- **Pyth Hermes API docs** — VAA fetch + `updatePriceFeeds` fee structure
- **Circle "Migrate from USDC.e to USDC on Arbitrum"** announcement (2023-06) — bridged-token deprecation context
- **Polygon Labs MATIC→POL migration** (2024) — ticker rename; Pyth feed rename to POL/USD; analogous lesson for RENDER/RNDR
- **Wintermute Optimism multisig incident** (2022) — multisig vs single-key risk; promoted to Pitfall 6 framing
- **Mango Markets oracle incident** (October 2022) — oracle confidence threshold importance; promoted to Pitfall 7 framing
- **Polymarket UMA Ukraine-mineral-deal incident** (March 2025) — governance-attack pattern on the dispute window; analogous to v1 owner-resolved disputes
- **Privy 3.0 docs and migration guide** — provider order, custodial wallet model, OAuth scope custom config
- **Vercel `@vercel/og` issue tracker** — `resvg-wasm` edge runtime bundling pain (multiple 2024-2025 issues)
- **Satori `display: grid` GitHub issue #15** (and related) — flexbox-only confirmation
- **The Graph "Sunsetting the Hosted Service"** announcement (June 2024) — Decentralized Network migration; Studio + GRT curation cost
- **Alchemy NFT API `getFloorPrice` reference** — Ethereum mainnet only; OpenSea + LooksRare aggregation; 5-min server-side cache
- **EIP-4361 (SIWE)** — re-sign at withdrawal pattern
- **OpenZeppelin Ownable2Step** docs — pending-owner two-step transfer pattern
- Public post-mortems and threat-model analyses from 2024–2026 DeFi incidents — anonymized contextual influence on Pitfalls 6, 7, 9, 18

---

*Pitfalls research for: Call It — onchain social prediction product on Arbitrum One*
*Researched: 2026-05-21*
*Spec source: `CALL_IT_SPEC1.md` v1.0 (3088 lines, locked)*
*Sister docs: STACK.md, FEATURES.md, ARCHITECTURE.md*
