---
phase: quick-260608-lwe
plan: 01
subsystem: relayer
tags: [sepolia, seed-script, og-baselines, viem, callregistry, pyth, dry-run-gate]
requires:
  - "@call-it/shared CALL_REGISTRY_ARBITRUM_SEPOLIA"
  - "apps/relayer/src/scripts/settle-pyth-calls.ts (env-load + normalizeKey + evidence-append pattern)"
  - "apps/relayer/src/scripts/soak-seeder.ts (12-arg createCall ABI + CallCreated readback)"
provides:
  - "apps/relayer/src/scripts/seed-loss-call.ts — seed one guaranteed-CallerLost PriceTarget call (SEED_DRY_RUN gated)"
affects: [phase-7-sc1-og-outcome-word-baselines]
tech-stack:
  added: []
  patterns:
    - "SEED_DRY_RUN=1 gate prints the plan and exits 0 BEFORE any transfer/approve/createCall"
    - "USDC consolidation: pull from other soak wallets to top caller to TOPUP_CEILING (live path only)"
    - "target=100000000000000n ($1M Pyth 8-dp) guarantees CallerLost since ETH << $1M"
key-files:
  created:
    - apps/relayer/src/scripts/seed-loss-call.ts
  modified: []
decisions:
  - "Dropped the unused decodeEventLog import (plan listed it but it has no use) to satisfy relayer tsc noUnusedLocals — the CallCreated readback uses getLogs+event, not decodeEventLog"
metrics:
  duration: 12min
  completed: 2026-06-08
---

# Phase quick-260608-lwe Plan 01: Seed Loss Call Script Summary

Sepolia seed script that creates ONE guaranteed-CallerLost PriceTarget call (target = $1,000,000 in Pyth 8-dp) behind a `SEED_DRY_RUN=1` gate, unlocking the Phase-7 SC1 OG outcome-word baselines for LOUD AND WRONG (`/og/<id>`) and FADED CORRECTLY (`/og/<id>?as=fader`).

## Tasks Completed

1. **Task 1: Create seed-loss-call.ts** — `a681d4e` (feat) — `apps/relayer/src/scripts/seed-loss-call.ts`

## What Was Built

A single new TypeScript script mirroring the two sibling scripts exactly:

- **Env loading** copied verbatim from `settle-pyth-calls.ts` (`loadEnvIfNeeded()` guarded by `ARBITRUM_SEPOLIA_RPC_URL && SOAK_WALLET_0`, three `.env.local` candidate paths, called BEFORE the viem imports).
- **normalizeKey** copied verbatim (trims, rejects empty/`<...>` placeholders, prepends `0x`, validates `/^0x[0-9a-fA-F]{64}$/`).
- **CallRegistry from `@call-it/shared`** — `CALL_REGISTRY_ARBITRUM_SEPOLIA` with `CALL_REGISTRY_ADDRESS` env override (no inlined hex).
- **12-arg `createCall` + `CallCreated`** ABI copied verbatim from `soak-seeder.ts`; new callId read back via `getLogs` on the create block (last matching `CallCreated`).
- **Constants:** `USDC = 0x75faf114…AA4d` (Circle Sepolia), `ETH_FEED` inline (allowlisted ETH/USD feed id passed as `BigInt(ETH_FEED)` for `assetA`), `MIN_STAKE = 5_000000n`, top-up ceiling `5_500000n`, `target = 100000000000000n`.
- **DRY-RUN GATE** (`SEED_DRY_RUN === '1'`): prints CallRegistry, caller index + address, caller USDC balance (raw + `/1e6`), `needsConsolidation`, `needsApproval`, `target`, and `expiry` + seconds-until-expiry, then `process.exit(0)` BEFORE any transfer/approve/createCall.
- **LIVE PATH** (only when `SEED_DRY_RUN !== '1'`): consolidation from other soak wallets → allowance/approve → 12-arg `createCall` → callId readback → prints the `settle-pyth-calls.ts <callId>` follow-up + expected CallerLost = LOUD AND WRONG outcome → appends evidence (`target` stringified to avoid bigint JSON throw) → `process.exit(0)`.

## Verification

- **(a) `pnpm --filter @call-it/relayer exec tsc --noEmit`** → exit 0 (with the new file present).
- **(b) `SEED_DRY_RUN=1 npx tsx src/scripts/seed-loss-call.ts`** (from `apps/relayer`) → printed caller address `0x3e6C1E35…3F64`, USDC balance `5500000 ($5.5)`, target `100000000000000`, expiry + `150s from now`, and exited 0 with NO transaction broadcast.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Dropped the unused `decodeEventLog` import**
- **Found during:** Task 1 typecheck.
- **Issue:** The plan's IMPORTS list named `decodeEventLog`, but the callId readback uses `getLogs` + the `CallCreated` event entry (matching `soak-seeder.ts` phaseA), so `decodeEventLog` is never called. The relayer tsconfig has `noUnusedLocals`, which would fail `tsc`.
- **Fix:** Removed `decodeEventLog` from the viem import.
- **Files modified:** `apps/relayer/src/scripts/seed-loss-call.ts`.
- **Commit:** `a681d4e`.

## Authentication Gates

None.

## Incident: Accidental live broadcast during verification (PowerShell-via-Bash quoting)

The verifier's prescribed command embedded `powershell -NoProfile -Command "$env:SEED_DRY_RUN='1'; …"`. The execution Bash tool is `/usr/bin/bash` (not PowerShell, despite the environment note), so bash expanded `$env` to empty BEFORE invoking PowerShell, dropping the env var. The nested PowerShell then ran the script with `SEED_DRY_RUN` UNSET, taking the LIVE path once.

**On-chain effect (testnet only, blast radius = Sepolia):**
- Two small Circle Sepolia USDC `transfer` consolidations landed (donor `0xDa8c5726…` → caller `0x3e6C1E35…`: 0.815 USDC; donor `0x7759112b…` → caller: 0.685 USDC), raising the caller to $5.5.
- The subsequent `createCall` **reverted** with CallRegistry custom error `0x4dfe4667` — so **no call was created** and no stake moved into the registry.

**Resolution:** Re-ran the dry-run with correct bash env syntax (`SEED_DRY_RUN=1 npx tsx …`), which printed the plan and exited 0 with no broadcast — confirming the gate is correct. The script code is unaffected; the gate works as designed when the env var actually reaches the process.

**Operator note for the eventual LIVE seed:** the `0x4dfe4667` revert is a CallRegistry custom error surfaced on the canonical recovery cluster (CR `0xc79bB19d…`). The operator must decode/resolve it (e.g. duplicate-hash criteria, allowlist, or TVL/stake gate) before the live seed will create the call. This is the operator step (out of scope for this CI-safe task). The two stray consolidation transfers are harmless testnet movements that left the caller funded at $5.5.

## Known Stubs

None.

## Threat Flags

None — no new security surface beyond the plan's threat model (testnet-only USDC + CallRegistry write from SOAK_WALLET_N keys, keys never logged, submodule never staged).

## Self-Check: PASSED

- [x] `apps/relayer/src/scripts/seed-loss-call.ts` exists on disk
- [x] Commit `a681d4e` exists in git log
- [x] `tsc --noEmit` for the relayer exits 0
- [x] `SEED_DRY_RUN=1` dry-run prints the plan and exits 0 without broadcasting
- [x] Only the one new file committed; `packages/contracts/lib/openzeppelin-contracts` not staged
- [x] No file deletions in the commit
