# Phase 06 — Deferred Items

## Plan 06-06 Deferred (out-of-scope pre-existing issues)

### scripts/deploy-safe.ts — Pre-existing tsc errors (NOT caused by 06-06)

These errors were present before Plan 06-06 execution. They are out of scope per deviation rules (only fix issues DIRECTLY caused by the current task's changes).

| File | Error | Root Cause |
|------|-------|-----------|
| `scripts/deploy-safe.ts:48` | `TS2614: Module '"@safe-global/protocol-kit"' has no exported member 'SafeFactory'` | `SafeFactory` was removed in protocol-kit v7 (was a v4 API). The script uses the v4 pattern. Needs update to v7 `Safe.init()` or `safeFactory.deploySafe()` pattern. |
| `scripts/deploy-safe.ts:38` | `TS6133: 'createWriteStream' is declared but its value is never read` | Unused import from a previous iteration |
| `scripts/deploy-safe.ts:42` | Multiple unused imports (`createWalletClient`, `http`, `Account`) | Same — unused imports from a previous iteration |
| `scripts/deploy-safe.ts:185` | `TS6133: 'network' is declared but its value is never read` | Unused parameter |
| `scripts/deploy-safe.ts:210` | `TS2351: This expression is not constructable` | Ledger `Eth` class dynamic import type issue |

### scripts/phase-0-smoke.ts, seed-calendar.ts, test/*.ts — Pre-existing tsc errors

Various unused variable and type errors in existing scripts. Not caused by 06-06.

### tsc --noEmit exit status for scripts package

`npx tsc --noEmit` in `scripts/` exits 1 due to the above pre-existing errors.
`rehearse-ownership.ts` itself is clean — zero errors from that file.
