# Phase 6 Soak — Evidence Log

**Status:** IN PROGRESS (pre-built template — operator fills in during soak)
**Purpose:** Gate document for multisig promotion (06-06). Every row must be flipped from ⬜ PENDING to ✅ before Phase 6 closes.
**Finalization gate:** `grep -c "❌" evidence/phase-6-soak/EVIDENCE-LOG.md` must return 0.

MARKER GUIDE:
- ⬜ PENDING — not yet verified (default for all rows in this template)
- ✅ — verified with evidence (tx hash / test name / screenshot filename)
- ❌ — verified FAILURE (blocks Phase 7 — must be resolved before proceeding)

DO NOT pre-mark ✅ on rows that have not been verified. False evidence is worse than no evidence.
DO NOT use ❌ to mean "not yet done" — ❌ means a real failure has been found.

---

## Section 1: SAFETY-21–28 Soak Minimums

| Item | Requirement | Status | Evidence |
|------|-------------|--------|----------|
| SAFETY-21 | Soak duration ≥48 continuous hours with live relayer active | ⬜ PENDING | Start: `__________` End: `__________` Duration: `__` h |
| SAFETY-22 | ≥10 seeded calls covering all market types (PriceTarget, SpreadVs, ≥3 EventSubtypes) | ⬜ PENDING | callIds: `__________` |
| SAFETY-23 | ≥30 follow/fade positions (≥15 each), distributed across 10 wallets | ⬜ PENDING | JSONL follow count: `___` fade count: `___` |
| SAFETY-24 | ≥3 settled calls per type; outcome words, payouts, and rep updates verified | ⬜ PENDING | settle txs: `__________` |
| SAFETY-25 | ≥1 caller-exit triggered and CallerExited event broadcast verified | ⬜ PENDING | callerExit tx: `__________` |
| SAFETY-26 | ≥1 full challenge cycle: propose → accept → settle duel | ⬜ PENDING | propose: `___` accept: `___` settle: `___` |
| SAFETY-27 | ≥1 dispute raised and owner-resolved | ⬜ PENDING | raise: `___` resolve: `___` |
| SAFETY-28 | Pyth confidence retry exercised: SettlementDelayed event emitted + relayer waited 30×60s | ⬜ PENDING | SettlementDelayed tx: `__________` |

---

## Section 2: SAFETY-29–43 Safety Matrix

Each item maps to a Foundry test (from 06-03-SUMMARY.md) OR a live Sepolia tx OR a screenshot.

| Item | Description | Method / Test Name | Status | Evidence |
|------|-------------|-------------------|--------|----------|
| SAFETY-29 | Pre-deploy ritual: 4 gates pass (grep, chainId, ETH balance, Pyth feed IDs) | predeploy-ritual-check.ts output | ⬜ PENDING | Script output: `__________` |
| SAFETY-30 | Pause guard: all state-changing functions revert while paused; claimPayout + exitPosition work while paused | CallRegistrySafety.t.sol (FFM/CE/SM pause extensions) | ⬜ PENDING | forge test result: `__________` |
| SAFETY-31 | TVL cap aggregation spans CR + FFM + CE: $5,001 across all three reverts TvlCapReached | TvlAggregation.t.sol test_tvlBoundary_includesChallengeEscrow | ⬜ PENDING | forge test result: `__________` |
| SAFETY-32 | MAX_ALLOWED_CAP = 100,000 USDC enforced on setTvlCap; setTvlCap(100_001e6) reverts | CallRegistrySafety.t.sol | ⬜ PENDING | forge test result: `__________` |
| SAFETY-33 | USDC address is native (…5831) in all 4 contracts; not bridged (…5CC8) | CallRegistrySafety.t.sol + Cast post-deploy read | ⬜ PENDING | Cast output: `__________` |
| SAFETY-34 | Settlement idempotency: second settle() on same callId reverts cleanly | SettlementSafetyMatrix.t.sol | ⬜ PENDING | forge test result: `__________` |
| SAFETY-35 | Post-expiry follow gate: follow/fade revert with CallPastExpiry after expiry | SettlementSafetyMatrix.t.sol | ⬜ PENDING | forge test result: `__________` |
| SAFETY-36 | Caller-exit 24h cooldown enforced: callerExit reverts before 24h | SettlementSafetyMatrix.t.sol | ⬜ PENDING | forge test result: `__________` |
| SAFETY-37 | UTC dup-hash boundary: call creation near UTC day boundary hashes into correct bucket | SettlementSafetyMatrix.t.sol | ⬜ PENDING | forge test result: `__________` |
| SAFETY-38 | minSharesOut slippage protection: follow/fade revert when slippage exceeded | SettlementSafetyMatrix.t.sol | ⬜ PENDING | forge test result: `__________` |
| SAFETY-39 | Self-challenge gate: proposeChallenge from call's own caller reverts SelfChallenge | SettlementSafetyMatrix.t.sol | ⬜ PENDING | forge test result: `__________` |
| SAFETY-40 | Rep decay / cooldown math: computeRepDelta returns expected values for given inputs | SettlementSafetyMatrix.t.sol | ⬜ PENDING | forge test result: `__________` |
| SAFETY-41 | forceSettle cooldown: owner cannot call forceSettle before expiry+7d | SettlementSafetyMatrix.t.sol | ⬜ PENDING | forge test result: `__________` |
| SAFETY-42 | Stylus destruction drill: RevertingStylusEngine installed, settle() fires RepCalculatedFallback, Telegram alert received, real engine restored | Live Sepolia drill (see 06-04-SUMMARY.md + drill tx hashes) | ⬜ PENDING | upgrade tx: `___` settle tx: `___` restore tx: `___` Telegram: `___` |
| SAFETY-43 | All owner-only guards revert for non-owner callers on all 4 contracts | CallRegistrySafety.t.sol | ⬜ PENDING | forge test result: `__________` |

---

## Section 3: PITFALLS Checklist

All items are from .planning/research/PITFALLS.md "Looks Done But Isn't" section.
Flip ⬜ → ✅ with evidence (tx hash / test name / screenshot) as the soak progresses.

#### Share Loop (Phase 4–7)

- ⬜ **OG Settled card outcome word**: rendered at 200px viewport — readable, not truncated, not overflowing? (§16.3, §19.11) — visual diff against committed baseline.
- ⬜ **OG Fallback card**: serves on cache miss within 100ms? (§16.6) — manual `curl` test against a non-existent callId.
- ⬜ **Auto-post-to-X**: waits for OG cache to be warm before posting? (Pitfall 8) — Sepolia test: settle a call, watch the auto-post worker logs for the cache-verify step.
- ⬜ **Twitter Card Validator**: returns the correct card variant for a settled mainnet call? (§19.11) — run cards-dev.twitter.com/validator manually.
- ⬜ **Receipt `og:image` meta tag**: server-rendered, not client-only? — view-source on `/call/[id]` and confirm presence.
- ⬜ **5 OG variants**: Live, Settled, Duel Settled, Caller Exited, Fallback — each rendered, cached, invalidated correctly? (§16.1-6) — manual fixture for each.
- ⬜ **Receipt URL is permanent**: same URL works for unauthenticated users? (§18.1) — open in incognito; verify no auth redirect.

#### Settlement Path (Phase 4)

- ⬜ **Pyth update is included in `settle()`**: settle accepts `bytes[] pythUpdateData` and pays the fee? (Pitfall 4) — read the function signature.
- ⬜ **Stylus runtime fallback fires** on intentional revert? (Pitfall 2) — deploy `RevertingStylusEngine` on Sepolia, run settle, verify `RepCalculatedFallback` event.
- ⬜ **Settlement is idempotent**: second `settle()` call reverts cleanly? (§12.4 step 2) — fuzz test.
- ⬜ **Settlement atomicity**: any revert in steps 1-14 rolls back entire tx? (§12.4) — fuzz test inducing failure at each step.
- ⬜ **Cold-start 25% adjustment**: applied when only virtual fade exists? (§8.3, §12.4 step 10) — fixture test with zero real faders.
- ⬜ **LP fee** routes correctly when winning pool has no real shareholders? (Pitfall 22) — empty-side test.
- ⬜ **Duplicate hash cleared** post-settle? (§12.4 step 12) — re-create same call after settle; should succeed.
- ⬜ **`forceSettle` cooldown** correctly enforced? (§12.4) — owner cannot call before expiry+7d.

#### Safety Caps (Phase 6)

- ⬜ **TVL cap aggregation** spans CallRegistry + FollowFadeMarket + ChallengeEscrow? (Pitfall 3) — boundary fixture with USDC across all three.
- ⬜ **`MAX_ALLOWED_CAP = 100K`** enforced on `setTvlCap`? (App.A.1) — Cast read.
- ⬜ **Pause carve-out**: withdraw/claim work while paused? (§10.3) — pause + claim test.
- ⬜ **USDC address** is native (`...5831`), not bridged (`...5CC8`) in every contract? (Pitfall 1) — grep + Cast verify.
- ⬜ **Solidity version pinned** to `=0.8.30` (not `^0.8.24` floating)? (STACK.md) — verify foundry.toml + each contract's pragma.
- ⬜ **Owner is multisig** OR a documented v1.1 transition plan? (Pitfall 6) — Cast `owner()` on all contracts.
- ⬜ **Stylus contract active**: `cargo stylus check` succeeds against deployed address? (Pitfall 17) — health-check script.
- ⬜ **All Phase 6 safety tests pass** on Sepolia? (§19.10) — checklist.

#### Embedded Wallet Path (Phase 1, 1.5)

- ⬜ **Privy provider order**: `<PrivyProvider><QueryClient><WagmiProvider>` exactly? (Pitfall 13) — AST test.
- ⬜ **24h new-auth-link cooldown** enforced server-side? (Pitfall 20) — Postgres timestamp check; direct-tx bypass test.
- ⬜ **SIWE re-sign at withdrawal** for saved external addresses? (App.A.1) — manual test.
- ⬜ **Paymaster cap**: 5 sponsored tx per account + $50/day global? (§10.7) — relayer counter inspection.
- ⬜ **Custody disclosure** card shown during onboarding? (§10.6) — UI fixture.
- ⬜ **Coinbase Onramp** webhook verifies signature against JWKS? (ARCHITECTURE.md §6) — test with invalid signature.

#### Oracle Attestation Plane (Phase 4)

- ⬜ **NFT TWAP** observation count ≥12 enforced in `submitNftFloor`? (§13.2) — test with 11 observations; must revert.
- ⬜ **Per-oracle signing keys** separated (NFT, DefiLlama, Snapshot, CEX)? (Pitfall 7) — KMS key inventory.
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
- ⬜ **Chain ID** in bundled JS = 42161, not 421614? — grep bundled output.
- ⬜ **Twitter Card Validator** passes for synthetic settled call? (§19.11) — manual.
- ⬜ **All 5 oracle adapters** return test data for synthetic call? (§19.11) — checklist.
- ⬜ **Operator on-call schedule** posted for launch + 72h? — calendar event.
- ⬜ **Telegram alert bot** receives test alerts from each subsystem? — fire test event from each adapter.
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

Run: `npx tsx apps/relayer/src/scripts/predeploy-ritual-check.ts` with RELAYER_ADDRESS and ARBITRUM_SEPOLIA_RPC_URL set.

| Gate | Check | Status | Output |
|------|-------|--------|--------|
| gate-a | grep for "arbitrum-sepolia" in relayer src (excl. tests/.md/.json) returns 0 matches | ⬜ PENDING | `__________` |
| gate-b | chainId 42161 literal present in relayer EIP-712 domain construction (≥1 match) | ⬜ PENDING | `__________` |
| gate-c | Relayer ETH balance ≥ 0.5 ETH on Arbitrum Sepolia | ⬜ PENDING | Balance: `__________` ETH |
| gate-d | Pyth bytes32 feed IDs for BTC/ETH/SOL/ARB/OP/POL match Hermes API | ⬜ PENDING | `__________` |

Script exit code: ⬜ PENDING (`0 = all pass, 1 = at least one fail`)
