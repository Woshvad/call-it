---
phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
plan: 04
subsystem: relayer
tags: [bullmq, pyth, hermes-client, defillama, eip712, kms-signer, settlement-watcher, viem, pino, vitest, green-gate]

# Dependency graph
requires:
  - phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
    provides: RED-gate Vitest scaffolds for pyth-adapter and defillama-adapter (plan 04-01)
  - phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
    provides: SettlementManager deployed at 0xAc37a0e4A3e575EF21684c28a5b820dB44654595 (plan 04-03)
  - phase: 03-challengeescrow
    provides: ChallengeEscrow + kms-signer.ts + alerts.ts + subgraph-client.ts patterns

provides:
  - PythAdapter class (fetchAndVerify confidence gate, fetchWithRetry 30x retries)
  - settlePythCall(callId, updateData, acceptedChallengeIds, walletClient, publicClient)
  - checkEthBalance: ETH budget monitoring with Telegram alert at < 0.01 ETH
  - startSettlementWatcher: BullMQ queue + worker, 30x60s Pyth retry, stuck>25min alert
  - getAcceptedChallengeIds: subgraph query with empty fallback (Blocker 3 fix)
  - enqueueSettlement: BullMQ delayed job helper
  - DefiLlamaAdapter.fetchAndAttest: TVL fetch + EIP-712 KMS sign (keyId='defillama')
  - signDefiLlamaAttestation, fetchDefiLlamaMetric, submitDefiLlamaAttestation standalone exports
  - index.ts: settlement watcher started on onReady + graceful onClose shutdown

affects: [04-05-settle-route, 04-06-cex-scrapers, 04-07-web-ui, 04-08-subgraph, phase-05-stylus, phase-06-staging]

# Tech tracking
tech-stack:
  added:
    - "@pythnetwork/hermes-client@3.1.0 — Pyth pull-oracle VAA fetch"
  patterns:
    - "Pyth pull-oracle: HermesClient.getLatestPriceUpdates → confidence gate (conf*200 <= price) → settle(callId, updateData[], acceptedChallengeIds[])"
    - "KMS attestation path: gcpKmsAccount(keyId='defillama') → signTypedData(EIP-712 domain name='CallIt-DefiLlama', chainId=42161n)"
    - "Subgraph challenge fetch: getAcceptedChallengeIds(callId) → empty[] fallback if unavailable (settlement proceeds, no duels settled)"
    - "BullMQ settlement worker: Queue + Worker pattern; retry via re-enqueue with delay (not synchronous loop)"
    - "lib/kms-signer.ts barrel shim: re-exports src/lib/kms-signer.ts to align test mock path with adapter import path (Vitest module ID alignment)"
    - "tsconfig rootDir '.' + include lib/**/*.ts: allows barrel shim outside src/ to compile without rootDir violation"

key-files:
  created:
    - apps/relayer/src/workers/oracle-adapters/pyth-adapter.ts
    - apps/relayer/src/workers/settlement-watcher.ts
    - apps/relayer/src/workers/oracle-adapters/defillama-adapter.ts
    - apps/relayer/lib/kms-signer.ts
  modified:
    - apps/relayer/src/index.ts (settlement watcher onReady + onClose wiring)
    - packages/shared/src/index.ts (SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA barrel export)
    - apps/relayer/tsconfig.json (rootDir '.' + include lib/**/*.ts)
    - apps/relayer/vitest.config.ts (reverted to minimal — alias approach abandoned)

key-decisions:
  - "kms-signer mock path alignment: defillama-adapter.test.ts uses vi.mock('../../../lib/kms-signer.js') which resolves to apps/relayer/lib/kms-signer.js (3 dirs above test's __tests__/). Adapter must import from '../../../lib/kms-signer.js' to match. Created lib/kms-signer.ts re-export barrel + updated tsconfig rootDir to '.' to allow cross-src imports."
  - "acceptedChallengeIds sourced from subgraph (not on-chain enumerator): CallRegistry and ChallengeEscrow are UNCHANGED per Blocker 3 fix. getAcceptedChallengeIds falls back to [] if subgraph unavailable — settlement still proceeds but no duel settlements happen."
  - "BullMQ retry = re-enqueue new job (not synchronous sleep loop): matches spec's 30x60s pattern while keeping the worker non-blocking."
  - "walletClient in server wiring is a placeholder stub: full KMS walletClient wired in plan 04-05 when settle route is added. Settlement watcher starts at boot but live settlement requires the real walletClient."

patterns-established:
  - "Oracle adapter GREEN gate: pyth-adapter.test.ts and defillama-adapter.test.ts both pass after implementing the corresponding adapter class"
  - "KMS attestation rail: pattern reusable for NFT-TWAP, CEX, Snapshot-Tally, OAuth-proof adapters in plan 04-06"
  - "Subgraph untrusted input: getAcceptedChallengeIds supplies IDs to relayer; SettlementManager validates each on-chain via ce.getChallenge() — no trust in subgraph values"

requirements-completed:
  - SETTLE-07
  - SETTLE-08
  - SETTLE-09
  - SETTLE-10
  - SETTLE-11
  - SETTLE-12
  - SETTLE-18
  - SETTLE-37
  - SETTLE-38
  - OPS-15

# Metrics
duration: 21min
completed: 2026-06-01
---

# Phase 4 Plan 04: Pyth settlement spine + DefiLlama KMS-attestation rail — GREEN gate Summary

**BullMQ settlement watcher with 30x60s Pyth retry + confidence gate + acceptedChallengeIds from subgraph + DefiLlama KMS-EIP-712 attestation adapter, both Vitest suites GREEN**

## Performance

- **Duration:** 21 min
- **Started:** 2026-06-01T21:49:19Z
- **Completed:** 2026-06-01T22:11:11Z
- **Tasks:** 2
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments

- PythAdapter GREEN: all 3 tests pass (wide confidence → SettlementDelayed, 30 retries exhausted → DisputeWindowOpened, success path with updateData + feeWei)
- DefiLlamaAdapter GREEN: all 3 tests pass (EIP-712 domain chainId=42161n, name='CallIt-DefiLlama', TVL fetch → signed attestation)
- BullMQ settlement watcher: startSettlementWatcher + enqueueSettlement exported; job processes callId, fetches acceptedChallengeIds from subgraph, dispatches Pyth adapter, retries 30x, fires Telegram alerts on stuck/exhausted
- settlement watcher registered in index.ts with onReady startup and onClose graceful shutdown
- @call-it/shared barrel updated to export SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA (Rule 3 fix — was missing)
- Installed @pythnetwork/hermes-client@3.1.0

## Task Commits

1. **Task 1: Pyth oracle adapter + settlement watcher** - `f03f84b` (feat)
2. **Task 2: DefiLlama KMS-attestation adapter + server wiring** - `436bb81` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `apps/relayer/src/workers/oracle-adapters/pyth-adapter.ts` — PythAdapter class + fetchPythUpdate + settlePythCall + checkEthBalance; acceptedChallengeIds as third settle() arg
- `apps/relayer/src/workers/settlement-watcher.ts` — BullMQ Queue+Worker; MAX_PYTH_RETRIES=30; getAcceptedChallengeIds subgraph fallback; startSettlementWatcher + enqueueSettlement exports
- `apps/relayer/src/workers/oracle-adapters/defillama-adapter.ts` — DefiLlamaAdapter.fetchAndAttest; EIP-712 domain name='CallIt-DefiLlama', chainId=42161n; gcpKmsAccount keyId='defillama'
- `apps/relayer/lib/kms-signer.ts` — Re-export barrel aligning test mock path with adapter import path
- `apps/relayer/src/index.ts` — startSettlementWatcher in onReady; onClose graceful shutdown hook
- `packages/shared/src/index.ts` — Added SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA + SETTLEMENT_MANAGER_ARBITRUM_ONE exports
- `apps/relayer/tsconfig.json` — rootDir changed from 'src' to '.' + include lib/**/*.ts
- `apps/relayer/vitest.config.ts` — Reverted to minimal (no alias needed after direct path alignment)

## Decisions Made

1. **lib/kms-signer.ts barrel for Vitest mock path alignment** — The test at `src/workers/__tests__/defillama-adapter.test.ts` mocks `'../../../lib/kms-signer.js'` which resolves to `apps/relayer/lib/kms-signer.js` (3 dirs up = package root). The adapter imports from the same path so Vitest's module registry assigns the same ID. Created `apps/relayer/lib/kms-signer.ts` re-export barrel + updated tsconfig `rootDir: "."` to allow compilation. Vitest alias approach was explored but doesn't intercept `vi.mock` path registration reliably — direct path alignment is the only reliable fix.

2. **acceptedChallengeIds subgraph fallback** — getAcceptedChallengeIds falls back to `[]` if subgraph is unavailable. Settlement proceeds without duel settlement for that call. Contract validates each supplied ID on-chain via `ce.getChallenge()` so subgraph compromise cannot inject fake challenges.

3. **walletClient stub in index.ts** — The live settlement walletClient requires a KMS-backed account which is wired in plan 04-05. The settlement watcher starts at boot with a placeholder that throws on `writeContract`. This allows watcher boot validation without requiring live KMS credentials.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed @pythnetwork/hermes-client@3.1.0**
- **Found during:** Task 1 (pyth-adapter implementation)
- **Issue:** `@pythnetwork/hermes-client` was not installed in the relayer package — `HermesClient` import failed
- **Fix:** `pnpm --filter @call-it/relayer add @pythnetwork/hermes-client@3.1.0`
- **Files modified:** `apps/relayer/package.json`, `pnpm-lock.yaml`
- **Verification:** Import resolves; pyth-adapter.test.ts passes GREEN
- **Committed in:** `f03f84b` (Task 1 commit)

**2. [Rule 3 - Blocking] Added SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA to shared barrel export**
- **Found during:** Task 1 (TypeScript build check)
- **Issue:** `SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA` was defined in `packages/shared/src/constants/addresses.ts` but NOT listed in `packages/shared/src/index.ts` explicit barrel export. TypeScript build error: "Module '@call-it/shared' has no exported member 'SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA'"
- **Fix:** Added the constant to the addresses re-export block in `index.ts`
- **Files modified:** `packages/shared/src/index.ts`
- **Verification:** Build no longer emits the missing-export error for this symbol
- **Committed in:** `f03f84b` (Task 1 commit)

**3. [Rule 3 - Blocking] lib/kms-signer.ts barrel + tsconfig rootDir change for Vitest mock path**
- **Found during:** Task 2 (defillama-adapter test run — all 3 tests failing with GCP credentials error)
- **Issue:** `vi.mock('../../../lib/kms-signer.js')` in the test resolves to `apps/relayer/lib/kms-signer.js`. The adapter's `import { gcpKmsAccount } from '../../lib/kms-signer.js'` resolves to `apps/relayer/src/lib/kms-signer.ts`. Different absolute paths → Vitest's mock registry doesn't intercept → real GCP KMS client called → "Could not load the default credentials" error. Vitest alias approaches (resolve.alias, various patterns) don't reliably affect `vi.mock` path registration.
- **Fix:** (a) Changed adapter import to `'../../../lib/kms-signer.js'` to match the test's mock path. (b) Created `apps/relayer/lib/kms-signer.ts` re-export barrel. (c) Updated `apps/relayer/tsconfig.json` to `rootDir: "."` + `include: ["src/**/*.ts", "lib/**/*.ts"]` so TypeScript compiles the barrel without rootDir violation. (d) Updated index.ts import type accordingly.
- **Files modified:** `apps/relayer/src/workers/oracle-adapters/defillama-adapter.ts`, `apps/relayer/lib/kms-signer.ts` (created), `apps/relayer/tsconfig.json`, `apps/relayer/vitest.config.ts`
- **Verification:** `pnpm --filter @call-it/relayer test --run src/workers/__tests__/defillama-adapter.test.ts` — all 3 tests GREEN; no new TypeScript errors in my files
- **Committed in:** `436bb81` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 3 — blocking)
**Impact on plan:** All fixes required for correctness and test interception. No scope creep. The kms-signer barrel was necessitated by the test file's mock path being one `../` level deeper than the correct relative path (apparent typo in the 04-01 RED-gate scaffold).

## RED/GREEN Gate Status

### Vitest GREEN Gate (CONFIRMED)

```
pnpm --filter @call-it/relayer test --run
```

GREEN (this plan):
- `src/workers/__tests__/pyth-adapter.test.ts` — 3/3 PASS (wide confidence, 30 retries, success path)
- `src/workers/__tests__/defillama-adapter.test.ts` — 3/3 PASS (EIP-712 domain, chainId binding, TVL fetch)

Expected RED (future plans):
- `src/workers/__tests__/cex-binance.test.ts` — FAIL (Cannot find module) — plan 04-06 GREEN gate
- `src/workers/__tests__/outcome-word.test.ts` — 9 FAIL (getOutcomeWord not implemented) — plan 04-07 GREEN gate

## Pre-existing Build Errors (Not introduced by this plan)

The following TypeScript errors existed before this plan and are out of scope per deviation Rule 4 (scope boundary):
- `src/routes/withdraw-authorize.ts` — unused import + arithmetic type
- `src/workers/paymaster-confirmer.ts` — ABI type mismatch
- `src/workers/__tests__/cex-binance.test.ts` — Cannot find module (expected RED)
- `src/workers/__tests__/outcome-word.test.ts` — cross-package rootDir (expected RED)

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| settlementWalletClient is a throw stub | `apps/relayer/src/index.ts` | ~190 | Full KMS walletClient with gcpKmsAccount wired in plan 04-05 when settle route is added. Placeholder allows watcher boot without live KMS credentials. |

## Threat Surface Scan

| Flag | File | Description |
|------|------|-------------|
| threat_flag: external-api | `apps/relayer/src/workers/oracle-adapters/defillama-adapter.ts` | Unauthenticated fetch to api.llama.fi — no API key, rate limits apply. Relayer KMS-signs the result; on-chain ecrecover is the authority (T-04-04-01 mitigated). |
| threat_flag: external-api | `apps/relayer/src/workers/oracle-adapters/pyth-adapter.ts` | HermesClient fetches VAA from hermes.pyth.network — public endpoint; VAA cryptographically verified on-chain by Pyth contract (T-04-04-04 mitigated). |
| threat_flag: eth-balance | `apps/relayer/src/workers/oracle-adapters/pyth-adapter.ts` | ETH balance check before Pyth fee — alerts Telegram at < 0.01 ETH (T-04-04-03 mitigated via OPS-15). |

## Issues Encountered

The defillama mock path alignment (Deviation 3) required investigating Vitest module resolution internals. Vitest's `resolve.alias` does NOT intercept `vi.mock()` path registration in version 3.x — the alias only applies to actual module imports in production code, not to the mock path string. The only reliable fix when test and source disagree on mock path is to ensure both resolve to the SAME absolute path, which required the barrel shim approach.

## Next Phase Readiness

Ready for Plan 04-05 (settle route + walletClient KMS wiring). All settlement infrastructure is in place:
1. Plan 04-05 must wire real gcpKmsAccount walletClient in index.ts
2. Plan 04-05 adds POST /api/settle/:callId route (plan already has the placeholder comment)
3. Plan 04-06 fills the cex-binance + remaining oracle adapters
4. Plan 04-07 implements getOutcomeWord() for outcome-word.test.ts GREEN gate

---
*Phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta*
*Completed: 2026-06-01*

## Self-Check: PASSED

- [x] `apps/relayer/src/workers/oracle-adapters/pyth-adapter.ts` exists on disk
- [x] `apps/relayer/src/workers/settlement-watcher.ts` exists on disk
- [x] `apps/relayer/src/workers/oracle-adapters/defillama-adapter.ts` exists on disk
- [x] `apps/relayer/lib/kms-signer.ts` exists on disk
- [x] `grep "acceptedChallengeIds" apps/relayer/src/workers/oracle-adapters/pyth-adapter.ts` — PASS
- [x] `grep "getAcceptedChallengeIds" apps/relayer/src/workers/settlement-watcher.ts` — PASS
- [x] `grep "MAX_PYTH_RETRIES" apps/relayer/src/workers/settlement-watcher.ts` — PASS (value=30)
- [x] `grep "getBalance\|eth_balance_low" apps/relayer/src/workers/oracle-adapters/pyth-adapter.ts` — PASS
- [x] `grep "keyId.*defillama" apps/relayer/src/workers/oracle-adapters/defillama-adapter.ts` — PASS
- [x] `grep "42161n" apps/relayer/src/workers/oracle-adapters/defillama-adapter.ts` — PASS
- [x] `grep "CallIt-DefiLlama" apps/relayer/src/workers/oracle-adapters/defillama-adapter.ts` — PASS
- [x] `grep "startSettlementWatcher" apps/relayer/src/index.ts` — PASS
- [x] `grep "onClose\|watcherHandle.stop" apps/relayer/src/index.ts` — PASS (settlementWatcherHandle.stop())
- [x] pyth-adapter.test.ts: 3/3 GREEN — PASS
- [x] defillama-adapter.test.ts: 3/3 GREEN — PASS
- [x] cex-binance.test.ts: FAIL (expected RED for plan 04-06) — DOCUMENTED
- [x] outcome-word.test.ts: 9 FAIL (expected RED for plan 04-07) — DOCUMENTED
- [x] Commits `f03f84b` and `436bb81` exist in git log — PASS
- [x] No new TypeScript errors in my files (pre-existing errors documented separately) — PASS
- [x] SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA exported from @call-it/shared — PASS
