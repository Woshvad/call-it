---
id: quick-260611-5mh-02
phase: quick-260611-5mh
plan: 02
status: complete
commit: 73e7f1a
completed: 2026-06-11
tasks: 4/4
suites:
  shared: 124/124 passed (6 files)
  ui: 72/72 passed (7 files)
  web: 124/124 passed (15 files)
builds: shared + ui + web all green (next build exit 0)
---

# Quick 260611-5mh Plan 02 Summary

**One-liner:** Web chain + money correctness — Sepolia-first wagmi default + every read hook pinned to `chainId: ACTIVE_CHAIN_ID` with chain-selected addresses via new `apps/web/lib/chain.ts` (RC1: $0.00 balance chip), composer targetValue migrated 1e6 to canonical 1e8 (RC3: $4,200 became $42 on-chain), FollowFadeModal insufficient-balance gate + shares coherence (B5), expiry gating on FOLLOW/FADE/CHALLENGE (B6), $10 creation-fee disclosure (B7).

## Commit

ONE atomic commit on master: `73e7f1a` — `fix(quick-260611-5mh): web Sepolia chain correctness + composer 1e8 target scale + modal gates + fee disclosure` (20 files, +702/-88, no deletions). Submodule `packages/contracts/lib/openzeppelin-contracts` NOT staged; no relayer/docs/evidence files touched.

## What changed (by task)

### Task 1 — Chain order + ACTIVE_CHAIN module (B1, B2)
- `apps/web/lib/wagmi.ts` — chains reordered to `[arbitrumSepolia, arbitrum]` (line 47) with an honest comment explaining the wagmi default-chain semantics; D-36 intact (exactly these two chains). No CI guard asserts the old order (verified by grep across `.github/workflows` + `scripts/`).
- `apps/web/lib/chain.ts` (NEW) — exports `ACTIVE_CHAIN`, `ACTIVE_CHAIN_ID` (`Number(NEXT_PUBLIC_CHAIN_ID) || 421614`), and chain-selected `USDC_ADDRESS` / `CALL_REGISTRY_ADDRESS` / `FOLLOW_FADE_MARKET_ADDRESS` / `CHALLENGE_ESCROW_ADDRESS` / `PROFILE_REGISTRY_ADDRESS` / `SETTLEMENT_MANAGER_ADDRESS`. All sourced from `@call-it/shared` constants — zero address literals; USDC for 421614 = `USDC_ARB_SEPOLIA` (0x75fa...AA4d).
- `packages/shared/src/index.ts` — added `USDC_ARB_SEPOLIA` to the barrel exports (it existed in `constants/addresses.ts` but was never exported; Rule 3 blocking fix).

### Task 2 — Read-hook sweep (B3)
Every `useBalance`/`useReadContract`/`useReadContracts` in apps/web now pins `chainId: ACTIVE_CHAIN_ID` + chain-correct addresses (9 callsites total, all verified by `apps/web/tests/chain-pinning.test.ts`):
- `apps/web/hooks/useUsdcBalance.ts` — THE 0.00-chip fix: useBalance token = Sepolia USDC + chainId; `useWatchContractEvent` also pinned.
- `apps/web/app/components/ChallengeFormModal.tsx` — allowance + balanceOf reads pinned; `USDC_ADDR`/`CE_ADDR` now from `@/lib/chain` (fixes the false "Insufficient USDC balance — you need $5.00 more" block).
- `apps/web/app/new/hooks/useSettledCalls.ts` — chainId added; replaced the broken `NEXT_PUBLIC_CHAIN_ID === 'mainnet'` string comparison with `PROFILE_REGISTRY_ADDRESS` from chain.ts.
- `apps/web/hooks/useCirclePaymaster.ts` — nonce read pinned; LATENT PERMIT-SIGNATURE BUG fixed: EIP-712 domain `chainId` was hardcoded `arbitrum.id`, now `ACTIVE_CHAIN_ID`; usdcAddress chain-selected (file no longer imports `viem/chains`).
- `apps/web/lib/circle-permit.ts` — `getUsdcAddress()` redirected to the chain-selected `USDC_ADDRESS` (it returned hardcoded MAINNET USDC; only consumer was useCirclePaymaster, but the stale helper was a footgun).
- Grep gate passed: mainnet USDC literal `0xaf88...5831` appears nowhere in apps/web/hooks or apps/web/app; CI usdc-allowlist + IN-05 guards unaffected (all addresses still flow from `@call-it/shared`).

### Task 3 — Composer 1e8 + fee disclosure (B4, B7)
- `apps/web/app/new/lib/target-scale.ts` (NEW) — `TARGET_SCALE = 1e8`, `usdToTargetValue` (x1e8; returns `undefined` on empty/invalid so the field resets to required), `targetValueToUsd` (div 1e8), `formatTargetForDisplay` (market-type-aware: priceTarget/spreadVs div 1e8; EVENT milestones display RAW — EventFields stores unscaled integers; the old flat div-1e6 preview was wrong for events too).
- `apps/web/app/new/components/PriceTargetFields.tsx` — display div 1e8 / onChange x1e8 via the helpers (was x1e6).
- `apps/web/app/new/components/SpreadVsFields.tsx` — same 1e8 migration (deviation, see below).
- `apps/web/app/new/page.tsx` — default `targetValue: undefined` (was `1n`, which rendered the "0.000001" prefill); preview market line uses `formatTargetForDisplay`; persistent "+ $10.00 creation fee at publish" note under the stake input (derived from `CREATION_FEE`, not hardcoded).
- `apps/web/app/new/components/PublishConfirmModal.tsx` — Target row div 1e8 (market-type-aware); new "Creation fee $10.00 USDC" row + "Total (stake + fee)" row from `CREATION_FEE`.
- call-gates.ts: NO 1e8 ALIGNMENT NEEDED. `targetValue` is `z.bigint().positive()` — no scale-dependent bound exists. Left untouched.
- Preflight path verified clean: `usePublishCall.ts` passes `String(input.targetValue)` to preflight and the raw bigint into `encodeFunctionData` — single conversion point in the field components, no double conversion. `useDebouncedDupCheck` also passes the raw value (dup-hashes computed from new 1e8 values are consistent going forward).

### Task 4 — FollowFadeModal gates (B5) + expiry gating (B6)
- `packages/ui/src/compound/FollowFadeModal.tsx`:
  - New optional `userBalance?: bigint` prop; when set and `amountInUsdc > userBalance`, renders exactly "Insufficient USDC balance — you need $X.XX more" and the confirm button disables (`insufficientBalance` folded into `isValid`). When the prop is absent the gate is INACTIVE (D-07 degrade — never fake zero).
  - Shares coherence: `formatShares` renders `<0.0001` for tiny non-zero values (no more "0.0000" next to a min-shares figure); displayed min shares clamped to never exceed displayed expected shares (both derive from the same `computeMinSharesOut` computation; the SUBMITTED `minSharesOut` is unchanged).
- `apps/web/app/call/[id]/page.tsx` — FOLLOW/FADE/CHALLENGE disabled + open-handlers guarded when `status !== 'Live'` OR `nowSec >= callData.expiry` (both unix SECONDS); inert reason text "call expired — awaiting settlement" / "call is no longer live — follow/fade/challenge closed"; real `useUsdcBalance()` balance passed into both FollowFadeModal instances.

## HANDOFF TO PLAN-03 — exact regions touched (wave-2 baseline = commit 73e7f1a)

### apps/web/app/call/[id]/page.tsx
| Region | Lines (at 73e7f1a) | What changed |
|---|---|---|
| Imports | 62-67 (chain.ts import replaces shared address imports), 87-89 (useUsdcBalance import) | ACTIVE_CHAIN_ID + FFM/CE/SM/USDC selected addresses from @/lib/chain |
| Address constants | 211-224 | FFM_ADDR/CE_ADDR/SM_ADDR/USDC_ADDR now assigned from chain.ts exports (NAMES UNCHANGED — rest of file unaffected) |
| DisputeModal allowance read | 487-494 (chainId at 489) | chainId: ACTIVE_CHAIN_ID added |
| FFM 8-read useReadContracts | 1148-1161 (entries 1153-1160) | per-entry chainId: ACTIVE_CHAIN_ID |
| Derived state | 1182-1188 | NEW: usdcBalance (useUsdcBalance), isCallExpired, isCallActionable |
| CE allowance read | 1316-1325 (chainId at 1318) | chainId: ACTIVE_CHAIN_ID added |
| CTA row (FOLLOW/FADE/CHALLENGE) | ~2218-2280 | B6 gating: disabled={!isCallActionable}, guarded onClick handlers, opacity/cursor styling |
| Inert reason text | 2282-2298 | NEW block directly below the CTA row |
| FollowFadeModal usages | 2658 + 2672 | userBalance={usdcBalance} prop added to both |

Everything else on this page (settled receipt, provenance, dispute UI, activity feed, quote calls, statuses, styling) is UNCHANGED — PLAN-03 owns it.

### apps/web/app/duel/[challengeId]/page.tsx
| Region | Lines (at 73e7f1a) | What changed |
|---|---|---|
| Import | 36 | @/lib/chain import replaces @call-it/shared address import |
| Constants | 43-48 | CE_ADDR/USDC_ADDR from chain.ts |
| Caller allowance read | 418-425 (chainId at 420) | chainId: ACTIVE_CHAIN_ID added |

NOTHING else on the duel page touched — all presentation is PLAN-03's.

### packages/ui/src/compound/FollowFadeModal.tsx
Prop type block (userBalance doc + field, ~lines 59-69), formatShares (~75-83), destructuring (~98), gate computation block (~146-175: displayedMinShares, insufficientBalance, balanceDeficit, extended isValid), insufficient-balance error span (after the headroom error, ~395-400), min-shares display line (uses displayedMinShares). All other modal chrome unchanged.

## Deviations from plan

1. [Rule 2 — coherence] SpreadVsFields.tsx migrated to 1e8 too (not in files_modified): the shared preview (new/page.tsx) and PublishConfirmModal divide every non-event target by ONE scale; leaving spread ratios at 1e6 would have made their display 100x wrong after the RC3 fix. No contract-side spread settlement path asserts 1e6 (SettlementManager has no spread branch — the non-Pyth rail settles via attestation), so unifying on the canonical scale is honest.
2. [Rule 1 — bug] Event-milestone display made RAW in formatTargetForDisplay: EventFields stores unscaled integers (BigInt(Math.round(val))), so the old flat div-1e6 preview was already wrong for events; the new helper is market-type-aware instead of blindly applying div-1e8.
3. [Rule 3 — blocking] USDC_ARB_SEPOLIA export added to packages/shared/src/index.ts: the constant existed but was not in the barrel; chain.ts needs it.
4. [Rule 2] apps/web/app/call/[id]/page.tsx:1316 CE-allowance read also pinned (plan listed only ~482 + ~1143): it is a read-hook callsite (within the stated ownership boundary "read-hook callsites") and the plan verification grep requires no unpinned read hooks.
5. [Rule 2] apps/web/lib/circle-permit.ts getUsdcAddress() redirected to chain.ts (file not in files_modified): it was the mainnet-USDC source feeding the paymaster hook; fixing the hook without it would have left a live wrong-address helper.
6. Write paths (writeContractAsync) intentionally NOT given chainId — out of plan scope ("read hooks"); writes follow the connected wallet chain, and Privy defaultChain is already network-profile-driven (privy-config.ts). The address constants the writes use ARE now chain-correct (approve targets Sepolia USDC).

## Tests changed/added (D-15 — no weakened tests)

- UPDATED apps/web/tests/onboarding.spec.ts (T-01-39): previously asserted useUsdcBalance contains USDC_ARB_NATIVE — i.e. it PINNED the mainnet-token bug. Behavior intentionally changed: now asserts the hook uses USDC_ADDRESS + ACTIVE_CHAIN_ID from @/lib/chain. The actual invariant (no inline 0xaf88/0xFF97 literals) kept verbatim. Note: this is a Playwright-run source-assert spec (vitest only includes *.test.ts).
- NEW apps/web/tests/chain-pinning.test.ts (12 tests): chain.ts defaults (421614, Sepolia USDC + cluster), wagmi order literal, per-file chainId presence, no USDC_ARB_NATIVE imports outside chain.ts, paymaster hook no longer imports viem/chains.
- NEW apps/web/tests/target-scale.test.ts (15 tests): $4,200 -> 420000000000n; $1M -> call-#14 reference 1e14; round-trip display; spreadVs 2.5x round-trip; event raw display; empty input -> undefined; schema rejects missing targetValue; no stale 1e6 target conversion in composer files; fee-disclosure presence.
- NEW packages/ui/__tests__/follow-fade-modal-gates.test.tsx (5 tests): deficit message + disabled confirm; covered balance not gated; absent prop not gated (D-07); <0.0001 coherence (both lines); min <= expected display.
- No existing test expectations were loosened anywhere.

## call-gates.ts 1e8 alignment: NOT NEEDED

targetValue is z.bigint().positive() — no scale-dependent bounds (no dollar-term min/max). Verified the preflight/dup-check paths pass the raw bigint with no second conversion. File untouched.

## Verification results

- Build chain: pnpm --filter @call-it/shared build && pnpm --filter @call-it/ui build && pnpm --filter @call-it/web build — all green (web next build exit 0).
- Vitest: shared 124/124, ui 72/72, web 124/124 (web includes the 27 new tests).
- Grep gate: no mainnet USDC literal in apps/web/hooks + apps/web/app — PASS.
- All 9 read-hook callsites in apps/web carry explicit chainId (enumerated via grep).
- D-36 intact: wagmi config = exactly [arbitrumSepolia, arbitrum], Sepolia first.

## Self-Check: PASSED

- apps/web/lib/chain.ts — FOUND
- apps/web/app/new/lib/target-scale.ts — FOUND
- apps/web/tests/chain-pinning.test.ts — FOUND
- apps/web/tests/target-scale.test.ts — FOUND
- packages/ui/__tests__/follow-fade-modal-gates.test.tsx — FOUND
- Commit 73e7f1a — FOUND on master
