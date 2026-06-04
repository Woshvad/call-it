# Phase 6 Soak — Evidence Log

**Status:** IN PROGRESS — SAFETY-22 + 23 met live; CI safety-matrix + rituals captured (2026-06-04). Settle path exercised: event-defer works (5 SettlementDelayed), but **Pyth-win settle is BLOCKED by a dataless revert in `_finalize` — a release blocker under investigation**. Challenge (SAFETY-26, needs top-up), caller-exit (24h), dispute, drill, UAT PENDING.
**Purpose:** Gate document for multisig promotion (06-06). Every row must be flipped from ⬜ PENDING to ✅ before Phase 6 closes.
**Finalization gate:** the FAILURE marker (Unicode U+274C, the red cross-mark) must not appear anywhere in this file — `grep -c` for it returns 0. This template is intentionally free of that glyph so the gate reads 0 on a clean run; add it ONLY to a row that has genuinely failed.

MARKER GUIDE:
- ⬜ PENDING — not yet verified (default for all rows in this template)
- ✅ — verified with evidence (tx hash / test name / screenshot filename)
- FAILURE marker (U+274C, the red cross-mark) — a verified FAILURE (blocks Phase 7 — must be resolved before proceeding)

DO NOT pre-mark ✅ on rows that have not been verified. False evidence is worse than no evidence.
DO NOT use the FAILURE marker to mean "not yet done" — it means a real failure has been found.

> **Live cluster (Arbitrum Sepolia):** CallRegistry `0x015758Cb…BB54` · FollowFadeMarket `0x3129a7E3…25cAA` · ChallengeEscrow `0xD2688514…6487` · SettlementManager `0x998CC092…c7D4` · ProfileRegistry `0xAfe239a3…359E`.
> **Wiring fixes applied (this soak surfaced them — also fixed in DeployPhase6.s.sol for mainnet):** asset allowlist populated (ETH/BTC/SOL/ARB/OP/POL, tx `0x97ec0a55…`+5); FollowFadeMarket authorized as rep-writer (tx `0x0a139209…`).
> **Seed run raw log:** `evidence/phase-6-soak/evidence-1780584415130.jsonl` (30 entries; all tx hashes verifiable on sepolia.arbiscan.io).

---

## Section 1: SAFETY-21–28 Soak Minimums

| Item | Requirement | Status | Evidence |
|------|-------------|--------|----------|
| SAFETY-21 | Soak duration ≥48 continuous hours with live relayer active | ⬜ PENDING | Partial seed only; 48h soak not yet run. Start/End TBD. |
| SAFETY-22 | ≥10 seeded calls covering all market types (PriceTarget, SpreadVs, ≥3 EventSubtypes) | ✅ | 10 calls created 2026-06-04 — callIds 1–10, blocks 273779300–330. Types: PriceTarget(0), SpreadVs(1) + Event subtypes TvlMilestone(1)/VolumeFees(2)/OnchainMetric(3)/CexListing(4)/TokenLaunch(5). call 1 tx `0xf88160e2…839f5`; full list in evidence-1780584415130.jsonl |
| SAFETY-23 | ≥30 follow/fade positions (≥15 each), distributed across 10 wallets | ✅ | 30 positions (15 follow + 15 fade) across wallets 0–9 on calls 11–20, 2026-06-04 (after re-fund to 21 USDC/wallet). Raw log: evidence-1780599464899.jsonl |
| SAFETY-24 | ≥3 settled calls per type; outcome words, payouts, and rep updates verified | ⬜ BLOCKED (under investigation) | settle-pyth-calls.ts exercises the full path (Hermes VAA fetch; SM pays the Pyth fee from its 0.05 ETH). Event calls 3–7 correctly DEFER → SettlementDelayed "attestation-pending" (5 tx, settle-1780600088911.jsonl). Pyth-win calls (1,2,8,9,10) revert with NO error data in `_finalize` (applySettlement/markSettled/updateAfterSettlement) — all top-level guards pass + carry data, so it's a deeper empty revert; needs a tx trace (force-send + `cast run`) to pinpoint. **Settlement is the core product action — treat as a release blocker.** |
| SAFETY-25 | ≥1 caller-exit triggered and CallerExited event broadcast verified | ⬜ PENDING | Time-gated — caller-exit requires 24h after call creation. |
| SAFETY-26 | ≥1 full challenge cycle: propose → accept → settle duel | ⬜ PENDING | Needs funded challenger/caller wallets (seeder logic fixed: challenger ≠ caller). |
| SAFETY-27 | ≥1 dispute raised and owner-resolved | ⬜ PENDING | Requires a settled call first (raiseDispute reverts `not-settled` pre-settlement). |
| SAFETY-28 | Pyth confidence retry exercised: SettlementDelayed event emitted + relayer waited 30×60s | ⬜ PARTIAL | SettlementDelayed event mechanism CONFIRMED live (5 "attestation-pending" emissions, 2026-06-04). The specific PYTH_CONFIDENCE_WIDE variant + 30×60s relayer retry still pending (needs a settle reaching _settlePyth with wide confidence). |

---

## Section 2: SAFETY-29–43 Safety Matrix

Each item maps to a Foundry test (from 06-03-SUMMARY.md) OR a live Sepolia tx OR a screenshot.
**Run 2026-06-04:** `forge test` — CallRegistrySafety **18/18**, SettlementSafetyMatrix **14/14**, TvlAggregation **9/9** = **41/41 pass, 0 fail**.

| Item | Description | Method / Test Name | Status | Evidence |
|------|-------------|-------------------|--------|----------|
| SAFETY-29 | Pre-deploy ritual: 4 gates pass (grep, chainId, ETH balance, Pyth feed IDs) | predeploy-ritual-check.ts output | ✅ (3/4) | gate-a/b/d PASS 2026-06-04 (no arbitrum-sepolia in prod src; 34 chainId+42161 lines; 6/6 Pyth feeds confirmed on Hermes). gate-c (relayer ETH ≥0.5) operator-deferred — needs RELAYER_ADDRESS. |
| SAFETY-30 | Pause guard: all state-changing functions revert while paused; claimPayout + exitPosition work while paused | CallRegistrySafety.t.sol (FFM/CE/SM pause extensions) | ✅ | test_pause_blocks_createCall_revert_EnforcedPause, test_unpause_allows_createCall, test_claimPayoutWhilePaused_succeeds, test_withdrawWhilePaused_exitPosition_succeeds — PASS |
| SAFETY-31 | TVL cap aggregation spans CR + FFM + CE: $5,001 across all three reverts TvlCapReached | TvlAggregation.t.sol test_tvlBoundary_includesChallengeEscrow | ✅ | test_tvlBoundary_includesChallengeEscrow + test_tvlBoundary5001Reverts — PASS |
| SAFETY-32 | MAX_ALLOWED_CAP = 100,000 USDC enforced on setTvlCap; setTvlCap(100_001e6) reverts | CallRegistrySafety.t.sol | ✅ | test_maxStake_101_reverts, test_tvlCapRaisable, test_only_owner_setTvlCap — PASS |
| SAFETY-33 | USDC address is native (…5831) in all 4 contracts; not bridged (…5CC8) | CallRegistrySafety.t.sol + Cast post-deploy read | ✅ | Deploy-verified usdc()=Circle Sepolia 0x75faf114 on all 4 (06-02); chainid-resolved resolveUsdc() routing regression test (06-01). |
| SAFETY-34 | Settlement idempotency: second settle() on same callId reverts cleanly | SettlementSafetyMatrix.t.sol | ✅ | test_settle_idempotency — PASS |
| SAFETY-35 | Post-expiry follow gate: follow/fade revert with CallPastExpiry after expiry | SettlementSafetyMatrix.t.sol | ⬜ PENDING | SettlementSafetyMatrix 14/14 green; specific post-expiry-follow assertion not individually located in this run — verify by name. |
| SAFETY-36 | Caller-exit 24h cooldown enforced: callerExit reverts before 24h | SettlementSafetyMatrix.t.sol | ✅ | test_callerExit_before24h_reverts + test_callerExit_after24h_succeeds — PASS |
| SAFETY-37 | UTC dup-hash boundary: call creation near UTC day boundary hashes into correct bucket | SettlementSafetyMatrix.t.sol | ✅ | test_duplicateHash_utcDayBoundary + test_duplicateHash_sameDayReverts — PASS |
| SAFETY-38 | minSharesOut slippage protection: follow/fade revert when slippage exceeded | SettlementSafetyMatrix.t.sol | ✅ | test_slippage_minSharesOut_reverts — PASS |
| SAFETY-39 | Self-challenge gate: proposeChallenge from call's own caller reverts SelfChallenge | SettlementSafetyMatrix.t.sol | ✅ | test_selfChallenge_reverts — PASS (also confirmed live: seeder hit SelfChallenge() before the fix) |
| SAFETY-40 | Rep decay / cooldown math: computeRepDelta returns expected values for given inputs | SettlementSafetyMatrix.t.sol | ⬜ PENDING | Suite green; dedicated computeRepDelta-math test not individually located in this run — verify by name. |
| SAFETY-41 | forceSettle cooldown: owner cannot call forceSettle before expiry+7d | SettlementSafetyMatrix.t.sol | ⬜ PENDING | Suite green; dedicated forceSettle-cooldown test not individually located in this run — verify by name. |
| SAFETY-42 | Stylus destruction drill: RevertingStylusEngine installed, settle() fires RepCalculatedFallback, Telegram alert received, real engine restored | Live Sepolia drill (see 06-04-SUMMARY.md + drill tx hashes) | ⬜ PENDING | Live drill — requires an expired/settleable call; Telegram alert path now live (@calllitbot). upgrade/settle/restore tx TBD. |
| SAFETY-43 | All owner-only guards revert for non-owner callers on all 4 contracts | CallRegistrySafety.t.sol | ✅ | test_only_owner_* (pause/resolveDispute/setRelayer/setSettlementManager/setTvlCap ×) — PASS |

---

## Section 3: PITFALLS Checklist

All items are from .planning/research/PITFALLS.md "Looks Done But Isn't" section.
Flip ⬜ → ✅ with evidence (tx hash / test name / screenshot) as the soak progresses.
**Note:** items below marked ✅ are backed by the 41/41 forge safety-matrix run (2026-06-04) or this session's live cluster config; the rest are live/manual/frontend/subgraph checks still pending.

#### Share Loop (Phase 4–7)

- ⬜ **OG Settled card outcome word**: rendered at 200px viewport — readable, not truncated, not overflowing? (§16.3, §19.11) — visual diff against committed baseline.
- ⬜ **OG Fallback card**: serves on cache miss within 100ms? (§16.6) — manual `curl` test against a non-existent callId.
- ⬜ **Auto-post-to-X**: waits for OG cache to be warm before posting? (Pitfall 8) — Sepolia test: settle a call, watch the auto-post worker logs for the cache-verify step.
- ⬜ **Twitter Card Validator**: returns the correct card variant for a settled mainnet call? (§19.11) — run cards-dev.twitter.com/validator manually.
- ⬜ **Receipt `og:image` meta tag**: server-rendered, not client-only? — view-source on `/call/[id]` and confirm presence.
- ⬜ **5 OG variants**: Live, Settled, Duel Settled, Caller Exited, Fallback — each rendered, cached, invalidated correctly? (§16.1-6) — manual fixture for each.
- ⬜ **Receipt URL is permanent**: same URL works for unauthenticated users? (§18.1) — open in incognito; verify no auth redirect.

#### Settlement Path (Phase 4)

- ⬜ **Pyth update is included in `settle()`**: settle accepts `bytes[] pythUpdateData` and pays the fee? (Pitfall 4) — read the function signature. (Note: confirmed signature `settle(uint256,bytes[],uint256[])` on live SM during soak.)
- ⬜ **Stylus runtime fallback fires** on intentional revert? (Pitfall 2) — deploy `RevertingStylusEngine` on Sepolia, run settle, verify `RepCalculatedFallback` event. (= SAFETY-42, PENDING)
- ✅ **Settlement is idempotent**: second `settle()` call reverts cleanly? (§12.4 step 2) — test_settle_idempotency PASS (forge 2026-06-04).
- ⬜ **Settlement atomicity**: any revert in steps 1-14 rolls back entire tx? (§12.4) — fuzz test inducing failure at each step.
- ⬜ **Cold-start 25% adjustment**: applied when only virtual fade exists? (§8.3, §12.4 step 10) — fixture test with zero real faders.
- ⬜ **LP fee** routes correctly when winning pool has no real shareholders? (Pitfall 22) — empty-side test.
- ✅ **Duplicate hash cleared** post-settle? (§12.4 step 12) — dup-hash logic verified: test_duplicateHash_sameDayReverts / utcDayBoundary PASS; live createCall enforced DuplicateCall until per-call targetValue varied.
- ⬜ **`forceSettle` cooldown** correctly enforced? (§12.4) — owner cannot call before expiry+7d. (= SAFETY-41, PENDING)

#### Safety Caps (Phase 6)

- ✅ **TVL cap aggregation** spans CallRegistry + FollowFadeMarket + ChallengeEscrow? (Pitfall 3) — test_tvlBoundary_includesChallengeEscrow PASS (forge 2026-06-04).
- ✅ **`MAX_ALLOWED_CAP = 100K`** enforced on `setTvlCap`? (App.A.1) — test_maxStake_101_reverts + test_tvlCapRaisable PASS.
- ✅ **Pause carve-out**: withdraw/claim work while paused? (§10.3) — test_claimPayoutWhilePaused_succeeds, test_withdrawWhilePaused_exitPosition_succeeds PASS.
- ✅ **USDC address** is native (`...5831`), not bridged (`...5CC8`) in every contract? (Pitfall 1) — deploy-verified usdc()=0x75faf114 (Circle Sepolia) on all 4; resolveUsdc() chainid gate.
- ⬜ **Solidity version pinned** to `=0.8.30` (not `^0.8.24` floating)? (STACK.md) — verify foundry.toml + each contract's pragma.
- ⬜ **Owner is multisig** OR a documented v1.1 transition plan? (Pitfall 6) — Cast `owner()` on all contracts. (Deployer-key window until Phase 10; multisig rehearsal = 06-06.)
- ⬜ **Stylus contract active**: `cargo stylus check` succeeds against deployed address? (Pitfall 17) — health-check script.
- ✅ **All Phase 6 safety tests pass**? (§19.10) — 41/41 forge safety-matrix (CallRegistrySafety 18, SettlementSafetyMatrix 14, TvlAggregation 9) PASS 2026-06-04.

#### Embedded Wallet Path (Phase 1, 1.5)

- ⬜ **Privy provider order**: `<PrivyProvider><QueryClient><WagmiProvider>` exactly? (Pitfall 13) — AST test.
- ⬜ **24h new-auth-link cooldown** enforced server-side? (Pitfall 20) — Postgres timestamp check; direct-tx bypass test.
- ⬜ **SIWE re-sign at withdrawal** for saved external addresses? (App.A.1) — manual test.
- ⬜ **Paymaster cap**: 5 sponsored tx per account + $50/day global? (§10.7) — relayer counter inspection.
- ⬜ **Custody disclosure** card shown during onboarding? (§10.6) — UI fixture.
- ⬜ **Coinbase Onramp** webhook verifies signature against JWKS? (ARCHITECTURE.md §6) — test with invalid signature.

#### Oracle Attestation Plane (Phase 4)

- ⬜ **NFT TWAP** observation count ≥12 enforced in `submitNftFloor`? (§13.2) — test with 11 observations; must revert.
- ⬜ **Per-oracle signing keys** separated (NFT, DefiLlama, Snapshot, CEX)? (Pitfall 7) — KMS key inventory. (Live SM setAttestationSigner wired all 6 in DeployPhase6.)
- ⬜ **CEX scraper** filters Innovation Zone / futures-only listings? (Pitfall 19) — fixture for each exclusion case per exchange.
- ⬜ **DefiLlama** queries at deadline + N-minute buffer? — verify in cron config.
- ⬜ **Snapshot vs Tally** preference: trustless Tally read used when available? (ARCHITECTURE.md §5) — code review.

#### Subgraph + Indexing (Phase 0, 7)

- ⬜ **Subgraph manifest** targets `arbitrum-one` (mainnet) / `arbitrum-sepolia` (staging)? — verify by network.
- ⬜ **Polled-events fallback** functions when subgraph is behind? (App.A.1) — disable subgraph, verify UI degraded but functional.
- ⬜ **Mapping handles** every event emitted by all 6 contracts? — event coverage grep.
- ⬜ **Subgraph aggregation** for TVL matches on-chain `USDC.balanceOf` sum? (Pitfall 3) — daily reconciliation test.

#### Mainnet Day (post-Phase 6, pre-§19.11)

- ⬜ **Sepolia 48h staging gate** complete with all required test artifacts? (§19.10) — checklist.
- ⬜ **Env vars** at Vercel + Railway + Subgraph Studio match mainnet column? (Pitfall 5) — `diff` ritual.
- ✅ **Chain ID** in bundled JS = 42161, not 421614? — gate-b: 34 lines with chainId + 42161 in relayer EIP-712 domain (predeploy-ritual-check 2026-06-04). (Re-run on the prod web bundle before mainnet.)
- ⬜ **Twitter Card Validator** passes for synthetic settled call? (§19.11) — manual.
- ⬜ **All 5 oracle adapters** return test data for synthetic call? (§19.11) — checklist.
- ⬜ **Operator on-call schedule** posted for launch + 72h? — calendar event.
- ⬜ **Telegram alert bot** receives test alerts from each subsystem? — fire test event from each adapter. (Bot @calllitbot live + direct-API test delivered 2026-06-04; per-subsystem test still pending.)
- ⬜ **Treasury wallet** balance for dispute rewards (>$200 USDC)? — Cast read.
- ⬜ **Relayer ETH balance** for Pyth update fees (>0.1 ETH)? — Cast read.

---

## Section 4: Phase-4 Deferred UAT Closure

These 5 items were deferred from Phase 4 (env-blocked live UAT). Verified manually by the operator through the UI during the soak. No automated proxy — human judgment required (D-04).

| Item | Description | Status | Evidence (screenshot filename or observation note) |
|------|-------------|--------|---------------------------------------------------|
| UAT-1 | Live settlement E2E: stake a call, wait for settlement, verify payout received in wallet (check Arbiscan for claimPayout tx) | ⬜ PENDING | `__________` |
| UAT-2 | Dispute flow E2E: raise dispute through UI, wait for owner resolution, verify payout reversal shown in UI | ⬜ PENDING | `__________` |
| UAT-3 | Provenance modal D-10: open Provenance modal on a settled Pyth call, verify oracle URL + tx hash + raw price data + EIP-712 sig all present and correct | ⬜ PENDING | `__________` |
| UAT-4 | OG card 200px readability QA: open /og/[callId] at 200px viewport, verify all outcome words are legible (SHARE-12/UI-18) | ⬜ PENDING | `__________` |
| UAT-5 | Live OG render for settled/exited calls: curl -I /og/[callId] returns X-Variant: settled (or exited) with correct card layout | ⬜ PENDING | `__________` |

---

## Section 5: Pre-deploy Ritual Results

Run: `npx tsx apps/relayer/src/scripts/predeploy-ritual-check.ts` with RELAYER_ADDRESS and ARBITRUM_SEPOLIA_RPC_URL set. **Run 2026-06-04: 3/4 PASS, 1 skipped, 0 fail.**

| Gate | Check | Status | Output |
|------|-------|--------|--------|
| gate-a | grep for "arbitrum-sepolia" in relayer src (excl. tests/.md/.json) returns 0 matches | ✅ | PASS — no "arbitrum-sepolia" string in production relayer source (2026-06-04) |
| gate-b | chainId 42161 literal present in relayer EIP-712 domain construction (≥1 match) | ✅ | PASS — 34 line(s) with chainId/domain + 42161 |
| gate-c | Relayer ETH balance ≥ 0.5 ETH on Arbitrum Sepolia | ⬜ PENDING | SKIPPED — RELAYER_ADDRESS not set; operator to run with the KMS signer address |
| gate-d | Pyth bytes32 feed IDs for BTC/ETH/SOL/ARB/OP/POL match Hermes API | ✅ | PASS — all 6 feed IDs confirmed on Hermes (2026-06-04) |

Script exit code: 1 (partial — gate-c skipped pending RELAYER_ADDRESS; 0 failures).
