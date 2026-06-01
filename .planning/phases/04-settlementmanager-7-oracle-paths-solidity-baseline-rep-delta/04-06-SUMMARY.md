---
phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
plan: 06
subsystem: relayer
tags: [oracle-adapters, playwright, alchemy-sdk, snapshot-js, eip712, kms-signer, cex-scrapers, settlement-watcher, viem, pino, vitest, green-gate]

# Dependency graph
requires:
  - phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
    provides: DefiLlama KMS-attestation rail + settlement-watcher BullMQ worker (plan 04-04)
  - phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
    provides: RED-gate cex-binance.test.ts scaffold + binance-listing.html fixture (plan 04-01)
  - phase: 03-challengeescrow
    provides: kms-signer.ts + gcpKmsAccount pattern

provides:
  - NftTwapAdapter: Alchemy getNftSales 24h TWAP; >=12 obs check; keyId='nft-twap'; ambiguous if <12
  - RpcMetricsAdapter: viem getLogs Aave V3 liquidations; AAVE_V3_POOL from @call-it/shared; keyId='defillama' (intentional shared key); domain='CallIt-RpcMetrics'
  - SnapshotAdapter: @snapshot-labs/snapshot.js proposal read; keyId='snapshot-tally'; domain='CallIt-SnapshotTally'
  - TallyAdapter: Tally GraphQL fetch to api.tally.xyz; keyId='snapshot-tally'; TALLY_API_KEY absent = ambiguous
  - 8 CEX scrapers (binance/coinbase/okx/bybit/kraken/bitget/kucoin/upbit): Playwright headless; per-exchange ANNOUNCE_URL + EXCLUSION_PATTERNS embedded; testWithFixture for CI
  - CexAdapter: orchestrates all 8 scrapers; keyId='cex'; domain='CallIt-Cex'; INNOVATION_ZONE_EXCLUSION_PATTERNS registry
  - settlement-watcher.ts: OracleAdapter enum + full 7-case switch dispatch; adapter instances at startup; ambiguous → sendAlertSafe
  - AAVE_V3_POOL_ARBITRUM_ONE constant in @call-it/shared (W11 fix)

affects: [04-07-web-ui, 04-08-subgraph, 04-09-ci, phase-05-stylus, phase-06-staging]

# Tech tracking
tech-stack:
  added:
    - "alchemy-sdk@3.6.5 — NFT TWAP via getNftSales (Ethereum mainnet)"
    - "@snapshot-labs/snapshot.js@0.14.21 — Snapshot governance proposal reads"
    - "playwright@latest — headless Chromium for 8 CEX scrapers"
  patterns:
    - "KMS attestation rail: gcpKmsAccount(keyId=X) → signTypedData(domain={name='CallIt-X', chainId=42161n}) — replicated across 4 new adapters"
    - "Per-type key isolation (D-05): nft-twap | defillama (shared w/ rpc-metrics) | cex | snapshot-tally keys"
    - "rpc-metrics shares defillama KMS key (intentional): both numeric off-chain attestations; blast radius documented; different domain prevents cross-type replay"
    - "CEX scraper pattern: ANNOUNCE_URL + EXCLUSION_PATTERNS embedded as in-file constants; BinanceScraper class + detectListing + testWithFixture; multi-signal confirm"
    - "Settlement watcher dispatch: OracleAdapter enum (7 values); full switch; adapter instances at startup"
    - "Ambiguous path: all adapters return { ambiguous: true } on failure — never throw — prevents settlement-watcher crash"

key-files:
  created:
    - apps/relayer/src/workers/oracle-adapters/nft-twap-adapter.ts
    - apps/relayer/src/workers/oracle-adapters/rpc-metrics-adapter.ts
    - apps/relayer/src/workers/oracle-adapters/snapshot-adapter.ts
    - apps/relayer/src/workers/oracle-adapters/tally-adapter.ts
    - apps/relayer/src/workers/oracle-adapters/cex/binance-scraper.ts
    - apps/relayer/src/workers/oracle-adapters/cex/coinbase-scraper.ts
    - apps/relayer/src/workers/oracle-adapters/cex/okx-scraper.ts
    - apps/relayer/src/workers/oracle-adapters/cex/bybit-scraper.ts
    - apps/relayer/src/workers/oracle-adapters/cex/kraken-scraper.ts
    - apps/relayer/src/workers/oracle-adapters/cex/bitget-scraper.ts
    - apps/relayer/src/workers/oracle-adapters/cex/kucoin-scraper.ts
    - apps/relayer/src/workers/oracle-adapters/cex/upbit-scraper.ts
    - apps/relayer/src/workers/oracle-adapters/cex/cex-adapter.ts
  modified:
    - apps/relayer/src/workers/settlement-watcher.ts (OracleAdapter enum + full 7-case switch dispatch)
    - packages/shared/src/constants/addresses.ts (AAVE_V3_POOL_ARBITRUM_ONE added)
    - packages/shared/src/index.ts (AAVE_V3_POOL_ARBITRUM_ONE barrel export)
    - apps/relayer/package.json (alchemy-sdk@3.6.5 + @snapshot-labs/snapshot.js@0.14.21 + playwright)
    - pnpm-lock.yaml
    - pnpm-workspace.yaml (es5-ext: false)

key-decisions:
  - "rpc-metrics-adapter shares defillama KMS key (intentional, D-05): both adapters produce numeric off-chain attestations with equivalent trust. Different EIP-712 domain name (CallIt-RpcMetrics vs CallIt-DefiLlama) prevents cross-type replay within the shared key. Blast radius documented in file header."
  - "AAVE_V3_POOL_ARBITRUM_ONE from @call-it/shared — never from call parameters (W11 fix): if from call params, attacker could forge attestation by pointing to a malicious contract"
  - "Alchemy getNftSales uses fromBlock/toBlock (not startTime/endTime): Alchemy SDK block-range API, not time-range. Approximated 24h window via block count."
  - "BinanceScraper uses regex HTML parser (not Playwright DOM eval) for testWithFixture path: no browser needed for fixture mode, same regex works for both live and fixture HTML"
  - "CexAdapter kms-signer import 4 levels up (../../../../lib/kms-signer.js): cex/ subdirectory is one level deeper than oracle-adapters/ — import path adjusted accordingly"
  - "outcome-word.test.ts stays RED: cross-package import (apps/web/lib/outcome-word.ts) — 04-07's job, explicitly documented as expected-RED"

requirements-completed:
  - SETTLE-13
  - SETTLE-14
  - SETTLE-15
  - SETTLE-16
  - SETTLE-17
  - SETTLE-18
  - SETTLE-19
  - SETTLE-20
  - SETTLE-21
  - SETTLE-22
  - SETTLE-23
  - SETTLE-24
  - SETTLE-06

# Metrics
duration: 21min
completed: 2026-06-01
---

# Phase 4 Plan 6: NFT TWAP + RPC Metrics + Snapshot + Tally + 8 CEX Scrapers + Settlement Dispatch Summary

**All 7 oracle paths implemented with KMS-attestation rail: 4 new adapters (NFT TWAP, RPC metrics, Snapshot, Tally) + 8 Playwright CEX scrapers with per-exchange Innovation Zone exclusion + settlement-watcher full 7-case dispatch table (D-02 full fidelity)**

## Performance

- **Duration:** 21 min
- **Started:** 2026-06-01T22:34:33Z
- **Completed:** 2026-06-01T22:55:49Z
- **Tasks:** 3 (Task 1, Task 2a, Task 2b)
- **Files modified:** 19 (13 created, 6 modified)

## Accomplishments

- 4 new KMS-attestation adapters following defillama-adapter.ts pattern exactly
- rpc-metrics intentionally shares defillama KMS key (documented blast-radius comment, different domain prevents cross-type replay)
- 8 CEX scrapers: Playwright headless, embedded ANNOUNCE_URL + EXCLUSION_PATTERNS per-exchange, BinanceScraper class pattern, testWithFixture
- cex-adapter orchestrator: runs all 8 in parallel via Promise.allSettled; keyId='cex'
- settlement-watcher extended: OracleAdapter enum + 7-case switch dispatches all adapter types
- cex-binance.test.ts GREEN (3/3): testWithFixture detection, Innovation Zone exclusion, multi-signal confirm
- pyth + defillama tests still GREEN (confirmed)
- AAVE_V3_POOL_ARBITRUM_ONE added to @call-it/shared (W11 fix, never from call params)

## Task Commits

1. **Task 1: NFT TWAP + RPC metrics + Snapshot + Tally adapters** - `fb3a715` (feat)
2. **Task 2a: First 4 CEX scrapers + cex-adapter orchestrator** - `d1cbd71` (feat)
3. **Task 2b: Remaining 4 CEX scrapers + settlement-watcher dispatch** - `f331e84` (feat)

## Files Created/Modified

- `apps/relayer/src/workers/oracle-adapters/nft-twap-adapter.ts` - Alchemy getNftSales; >=12 obs; keyId='nft-twap'; domain='CallIt-NftTwap'
- `apps/relayer/src/workers/oracle-adapters/rpc-metrics-adapter.ts` - viem getLogs Aave V3; keyId='defillama' (shared intentionally); domain='CallIt-RpcMetrics'
- `apps/relayer/src/workers/oracle-adapters/snapshot-adapter.ts` - snapshot.js; keyId='snapshot-tally'; domain='CallIt-SnapshotTally'
- `apps/relayer/src/workers/oracle-adapters/tally-adapter.ts` - Tally GraphQL; keyId='snapshot-tally'; TALLY_API_KEY absent = ambiguous
- `apps/relayer/src/workers/oracle-adapters/cex/binance-scraper.ts` - BinanceScraper class; ANNOUNCE_URL; EXCLUSION_PATTERNS ['Innovation Zone','Seed Tag','Monitoring Tag']; testWithFixture
- `apps/relayer/src/workers/oracle-adapters/cex/coinbase-scraper.ts` - EXCLUSION_PATTERNS []
- `apps/relayer/src/workers/oracle-adapters/cex/okx-scraper.ts` - EXCLUSION_PATTERNS ['Innovation Zone']
- `apps/relayer/src/workers/oracle-adapters/cex/bybit-scraper.ts` - EXCLUSION_PATTERNS ['Innovation Zone']
- `apps/relayer/src/workers/oracle-adapters/cex/kraken-scraper.ts` - EXCLUSION_PATTERNS [] (major listings only)
- `apps/relayer/src/workers/oracle-adapters/cex/bitget-scraper.ts` - EXCLUSION_PATTERNS ['PoP Zone','Margin Trading Only','Monitoring']
- `apps/relayer/src/workers/oracle-adapters/cex/kucoin-scraper.ts` - EXCLUSION_PATTERNS ['Innovation Zone']
- `apps/relayer/src/workers/oracle-adapters/cex/upbit-scraper.ts` - EXCLUSION_PATTERNS ['유의 종목','KRW Market Only']; Vue SPA extra wait
- `apps/relayer/src/workers/oracle-adapters/cex/cex-adapter.ts` - orchestrates all 8; INNOVATION_ZONE_EXCLUSION_PATTERNS for all 8 exchanges; keyId='cex'; domain='CallIt-Cex'
- `apps/relayer/src/workers/settlement-watcher.ts` - OracleAdapter enum + 7-case switch dispatch + adapter instances
- `packages/shared/src/constants/addresses.ts` - AAVE_V3_POOL_ARBITRUM_ONE constant
- `packages/shared/src/index.ts` - AAVE_V3_POOL_ARBITRUM_ONE barrel export
- `apps/relayer/package.json` - alchemy-sdk@3.6.5 + @snapshot-labs/snapshot.js@0.14.21 + playwright added
- `pnpm-lock.yaml` - updated
- `pnpm-workspace.yaml` - es5-ext: false

## Decisions Made

1. **rpc-metrics shares defillama KMS key (intentional)** — Both adapters produce numeric off-chain attestations with equivalent trust requirements. Different EIP-712 domain names (CallIt-RpcMetrics vs CallIt-DefiLlama) prevent cross-type replay within the shared key. Blast radius documented in file header per plan spec.

2. **AAVE_V3_POOL from @call-it/shared (W11 fix)** — Added `AAVE_V3_POOL_ARBITRUM_ONE` constant to `packages/shared/src/constants/addresses.ts`. Never accepted from call parameters — if from call params, attacker could point to any contract.

3. **Alchemy block-range not time-range** — `getNftSales` uses `fromBlock`/`toBlock` per Alchemy SDK API (not `startTime`/`endTime`). Approximated 24h window via block count (Ethereum mainnet ~7200 blocks/24h).

4. **BinanceScraper regex parser** — `testWithFixture` mode uses regex HTML parsing (no browser), same as the regex helper used for live HTML. This keeps the fixture path browser-free for CI while sharing the multi-signal + exclusion logic.

5. **snapshot.js dynamic import** — `@snapshot-labs/snapshot.js` is a CommonJS module; using dynamic `import()` to handle ESM/CJS interop within the ESM relayer.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] alchemy-sdk + snapshot.js + playwright not installed**
- **Found during:** Task 1 (adapter imports)
- **Issue:** Three required packages (alchemy-sdk@3.6.5, @snapshot-labs/snapshot.js@0.14.21, playwright) were not in relayer package.json
- **Fix:** `pnpm --filter @call-it/relayer add alchemy-sdk@3.6.5 @snapshot-labs/snapshot.js@0.14.21 playwright@latest`
- **Files modified:** apps/relayer/package.json, pnpm-lock.yaml
- **Committed in:** fb3a715 (Task 1 commit)

**2. [Rule 2 - Missing Critical] AAVE_V3_POOL_ARBITRUM_ONE constant missing from @call-it/shared**
- **Found during:** Task 1 (rpc-metrics-adapter W11 gate)
- **Issue:** Plan required `AAVE_V3_POOL_ARBITRUM_ONE` from `@call-it/shared` but constant did not exist
- **Fix:** Added constant to `packages/shared/src/constants/addresses.ts` + barrel export
- **Files modified:** packages/shared/src/constants/addresses.ts, packages/shared/src/index.ts
- **Committed in:** fb3a715 (Task 1 commit)

**3. [Rule 1 - Bug] Alchemy getNFTSales → getNftSales (method name casing)**
- **Found during:** Task 1 (build error TS2551)
- **Issue:** Plan spec used `getNFTSales` but actual Alchemy SDK v3.6.5 exports `getNftSales`
- **Fix:** Corrected method name to `getNftSales`; adjusted to block-range API (fromBlock/toBlock not startTime/endTime)
- **Files modified:** apps/relayer/src/workers/oracle-adapters/nft-twap-adapter.ts
- **Committed in:** fb3a715 (Task 1 commit)

**4. [Rule 3 - Blocking] pnpm-workspace.yaml es5-ext build pending approval**
- **Found during:** Task 1 (pnpm install post-add)
- **Issue:** pnpm blocked install with `es5-ext: set this to true or false` — pnpm workspace.yaml needed explicit decision
- **Fix:** Set `es5-ext: false` in pnpm-workspace.yaml (es5-ext is a deprecated transitive dep, not needed for build scripts)
- **Files modified:** pnpm-workspace.yaml
- **Committed in:** fb3a715 (Task 1 commit)

---

**Total deviations:** 4 auto-fixed (1 missing critical, 2 blocking, 1 bug)
**Impact on plan:** All auto-fixes were required for correctness. No scope creep.

## Test Results

### GREEN (this plan's gate)

- `cex-binance.test.ts`: **3/3 PASS** (testWithFixture detection, Innovation Zone exclusion, multi-signal confirm)
- `defillama-adapter.test.ts`: **3/3 PASS** (still GREEN from plan 04-04)
- `pyth-adapter.test.ts`: **19/19 PASS** (still GREEN from plan 04-04)
- Total: **25 test files pass | 120 tests pass**

### Expected RED (documented)

- `outcome-word.test.ts`: **9/9 FAIL** — Expected RED. Cross-package import `../../../apps/web/lib/outcome-word.ts` is the 04-07 dependency (outcome word UI + web lib). This test file was scaffolded in plan 04-01 as the RED gate for 04-07. The pre-existing tsc errors in withdraw-authorize.ts and paymaster-confirmer.ts are also out of scope (Phase 1 type errors).

## Issues Encountered

None beyond the 4 auto-fixed deviations listed above.

## Threat Surface Scan

New network endpoints / trust boundaries introduced:

| Flag | File | Description |
|------|------|-------------|
| threat_flag: external-api | nft-twap-adapter.ts | New Alchemy NFT API calls (ETH mainnet); rate-limited; obs<12 → ambiguous backstop |
| threat_flag: external-api | snapshot-adapter.ts | New Snapshot Hub API calls; proposal not-closed → ambiguous |
| threat_flag: external-api | tally-adapter.ts | New Tally GraphQL calls; TALLY_API_KEY absent → ambiguous |
| threat_flag: headless-browser | cex/*.ts | Playwright scrapes 8 CEX pages; returns empty HTML on error → not_found; T-04-06-04 noted in plan |

All threats addressed per plan threat model (T-04-06-01 through T-04-06-07).

## Next Phase Readiness

All 7 oracle paths implemented (D-02 full fidelity):
- Pyth (plan 04-04) ✓
- DefiLlama (plan 04-04) ✓
- NFT TWAP (this plan) ✓
- RPC Metrics (this plan) ✓
- Snapshot (this plan) ✓
- Tally (this plan) ✓
- CEX Scrapers (this plan) ✓

Ready for:
- Plan 04-07: Outcome word + web UI settled receipt (outcome-word.test.ts GREEN gate)
- Plan 04-08: Subgraph SettlementManager handlers
- Plan 04-09: CI cron for weekly testWithFixture synthetic tests

## Self-Check: PASSED

- [x] `apps/relayer/src/workers/oracle-adapters/nft-twap-adapter.ts` exists on disk
- [x] `apps/relayer/src/workers/oracle-adapters/rpc-metrics-adapter.ts` exists on disk
- [x] `apps/relayer/src/workers/oracle-adapters/snapshot-adapter.ts` exists on disk
- [x] `apps/relayer/src/workers/oracle-adapters/tally-adapter.ts` exists on disk
- [x] `apps/relayer/src/workers/oracle-adapters/cex/binance-scraper.ts` exists on disk
- [x] `apps/relayer/src/workers/oracle-adapters/cex/cex-adapter.ts` exists on disk
- [x] `apps/relayer/src/workers/settlement-watcher.ts` modified with 7-case dispatch
- [x] `packages/shared/src/constants/addresses.ts` has AAVE_V3_POOL_ARBITRUM_ONE
- [x] Commits `fb3a715`, `d1cbd71`, `f331e84` exist in git log
- [x] `cex-binance.test.ts` 3/3 PASS (GREEN gate confirmed)
- [x] `defillama-adapter.test.ts` 3/3 PASS (still GREEN)
- [x] `pyth-adapter.test.ts` 19/19 PASS (still GREEN)
- [x] `outcome-word.test.ts` 9/9 FAIL — expected RED (04-07 dependency, documented)
- [x] All 8 scraper files exist in `apps/relayer/src/workers/oracle-adapters/cex/`
- [x] `grep "keyId.*nft-twap\|CallIt-NftTwap"` in nft-twap-adapter.ts — PASS
- [x] `grep "keyId.*defillama\|intentional\|blast radius"` in rpc-metrics-adapter.ts — PASS
- [x] `grep "CallIt-RpcMetrics"` in rpc-metrics-adapter.ts — PASS
- [x] `grep "AAVE_V3_POOL_ARBITRUM_ONE"` in rpc-metrics-adapter.ts (from shared import) — PASS
- [x] `grep "snapshot-tally\|snapshot.js"` in snapshot-adapter.ts — PASS
- [x] `grep "tally.xyz\|TALLY_API_KEY"` in tally-adapter.ts — PASS
- [x] 7 `case OracleAdapter.` statements in settlement-watcher.ts — PASS
- [x] All 4 new adapters have `chainId: 42161n` — PASS

---
*Phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta*
*Completed: 2026-06-01*
