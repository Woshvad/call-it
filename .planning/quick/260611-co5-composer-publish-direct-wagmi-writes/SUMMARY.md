# Quick 260611-co5: Composer publish via direct wagmi writes — Summary

**One-liner:** Replaced the composer's dead AA-stub submission with a real direct-EOA flow — gas guard → USDC approve(stake+CREATION_FEE) → CallRegistry.createCall → CallCreated-log callId → redirect to /call/{callId}.

**Commit:** `adc1e19` — `fix(quick-260611-co5): composer publish via direct wagmi writes — approve+createCall with gas guard (AA stub was never wired)` (single atomic commit, 7 files, all apps/web)

## Verified Root Cause

usePublishCall.ts step 3 called createAaClient() (apps/web/lib/aa-config.ts:97-108) — an explicit stub whose sendUserOperation / waitForUserOperationReceipt both throw 'AA client not yet wired — implement in Plan 07'. Verified live 2026-06-11 against the deployed app with a real authenticated session: preflight returned 200 {ok:true} (the quick-260611-bf2 fixes work), then publish ALWAYS threw. Every other money flow (ChallengeFormModal, call/[id] follow/fade, duel page) already used direct wagmi writes; /new was the only one still on the dead path.

## What Changed (per file)

| File | Change |
|---|---|
| apps/web/lib/abis/erc20.ts | NEW — minimal USDC ABI (allowance/balanceOf/approve) copied verbatim from the proven inline USDC_ABI in ChallengeFormModal.tsx; exported as erc20Abi. ChallengeFormModal itself untouched (kept the diff minimal). |
| apps/web/lib/abis/index.ts | Barrel export for erc20Abi. |
| apps/web/app/new/lib/call-created-log.ts | NEW pure module (no 'use client'/React): extractCallIdFromLogs (case-insensitive registry-address match + per-log try/catch viem decodeEventLog, returns CallCreated id or null), extractRevertErrorName (BaseError walk → ContractFunctionRevertedError.data.errorName), isUserRejection (walk → UserRejectedRequestError). |
| apps/web/app/new/hooks/usePublishCall.ts | Steps 0-1 (buildPreflightBody → postPreflight → suggestedConviction, full 422/HIDDEN_ERROR_FIELDS handling) byte-equivalent. Steps 2-4 replaced: (1) gas guard — getBalance vs GAS_FLOOR_WEI = 10_000_000_000_000n (0.00001 ETH), 0-ETH wallets get the exact faucet-direction toast BEFORE any tx; (2) readContract allowance; when < input.stake + CREATION_FEE → step 'approving' → approve write + receipt check; (3) step 'signing' → createCall via writeContract with the SAME 12 args (incl. built.assetAUint/built.assetBUint dup-hash invariant + effectiveConviction); (4) step 'waiting' → waitForTransactionReceipt, revert check; (5) extractCallIdFromLogs(receipt.logs, CALL_REGISTRY_ADDRESS) → router.push(`/call/${callId}`) (profile fallback if null — never dead-ends a succeeded tx). Catch extended: user rejection → 'Signature request rejected — nothing was sent.'; decoded revert → AssetNotAllowlisted humanized, others `Transaction reverted: {errorName}`. Removed createAaClient, useCirclePaymaster, encodeFunctionData, and the entire sponsorship-cap/Circle handoff branch; dependency array cleaned. ALL actions pass chainId: ACTIVE_CHAIN_ID with @/lib/chain addresses. |
| apps/web/app/new/components/PublishConfirmModal.tsx | 'approving' added to the isSigning gate + step→copy line 'Approving USDC spend…' (preflight → approving → signing → waiting). Nothing else touched. |
| apps/web/tests/call-created-log.test.ts | NEW — 6 unit tests (valid log incl. case-insensitive address, CallQuoted, garbage log, wrong-address, empty array, mixed-array scan), real viem encode/decode against the real ABI, no mocks (D-15). TDD: RED (module missing) → GREEN. |
| apps/web/tests/new-call-publish.spec.ts | The two stale Tier-1 static assertions updated: D-28 ordering now `await postPreflight` < `await writeContract`; sponsorship-cap test replaced with the direct-EOA path test (getBalance + allowance + approve + extractCallIdFromLogs present, sendUserOperation absent). Header bullet updated. |

apps/web/lib/aa-config.ts is byte-identical to HEAD~1 (verified `git diff HEAD -- apps/web/lib/aa-config.ts` empty pre-commit) — it stays as the future-AA roadmap doc. Quote-mode logic in app/new/page.tsx untouched.

## Key Decision

**wagmi/actions, NOT @wagmi/core:** @wagmi/core is only a transitive dep in the pnpm store — strict isolation would fail the import. wagmi v2 re-exports all core actions via wagmi/actions, each taking wagmiConfig (from @privy-io/wagmi createConfig, so the Privy embedded-wallet connector is used automatically). Since the actions receive the typed config, chainId narrows to 421614 | 42161 while ACTIVE_CHAIN_ID is declared `number` — narrowed inline as `chainId: ACTIVE_CHAIN_ID as ActiveChainId` (preserves the chain-pinning convention literal).

## Deviations from Plan

**1. [Rule 1 - Bug] D-28 ordering test anchored to call sites, not bare identifiers**
- **Found during:** Task 3
- **Issue:** The plan-prescribed source.indexOf('writeContract') would false-fail — writeContract now first appears in the wagmi/actions import block, ABOVE the postPreflight import, so import ordering (not execution order) would drive the assertion.
- **Fix:** Markers changed to 'await postPreflight' / 'await writeContract' — asserts the actual execution order honestly.
- **Files:** apps/web/tests/new-call-publish.spec.ts
- **Commit:** adc1e19

No other deviations — plan executed as written.

## Test & Build Results

- Full web vitest: **206 passed / 0 failed** across **23 files** (200 pre-existing + 6 new call-created-log tests)
- pnpm --filter @call-it/web build: **green** (proves wagmi/actions imports + removed AA imports compile under Next 16)
- Playwright tests/new-call-publish.spec.ts: **17 passed, 2 skipped** (Tier-2 needs a real Privy app ID — expected)
- Static gates: zero non-comment createAaClient/sendUserOperation/sponsorship-cap-exceeded in usePublishCall.ts; 'wagmi/actions', 'chainId: ACTIVE_CHAIN_ID', faucet toast string all present; spec file has exactly 1 non-comment sendUserOperation (the negative assertion itself)
- Scope: git show --stat HEAD lists exactly the 7 apps/web files; no deletions; no non-apps/web file staged

## Live-Verification Handoff (orchestrator)

The session wallet 0x73047a882e0B88a1913A25bBe8d871aBad2c5CeD holds $20 USDC and **0 Sepolia ETH** — a real publish cannot be exercised until ETH is dripped. After push + Vercel deploy:
1. Drip Arbitrum Sepolia ETH to the session wallet (e.g. Alchemy Arbitrum Sepolia faucet).
2. Publish a call on the deployed app: expect the gas guard to pass, an approve tx (first publish; allowance starts 0), then createCall.
3. Confirm both txs on sepolia.arbiscan.io and that the app redirects to /call/{newId}.
4. Before the drip, a publish attempt should show the exact faucet toast with NO transaction attempted — that path is also worth one manual check.

## Self-Check: PASSED

- apps/web/lib/abis/erc20.ts — FOUND
- apps/web/app/new/lib/call-created-log.ts — FOUND
- apps/web/tests/call-created-log.test.ts — FOUND
- Commit adc1e19 — FOUND on master
