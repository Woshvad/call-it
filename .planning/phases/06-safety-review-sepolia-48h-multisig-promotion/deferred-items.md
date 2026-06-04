# Phase 06 — Deferred Items

## Plan 06-06 Deferred (out-of-scope pre-existing issues)

### scripts/deploy-safe.ts — ✅ RESOLVED 2026-06-04 (commit aa7d4e6)

Migrated to protocol-kit v7: the removed v4 `SafeFactory` API replaced with `Safe.init` +
`createSafeDeploymentTransaction` + viem for the `--signer-source=env` path (Sepolia rehearsal);
the Ledger/mainnet path now routes to the Safe UI (app.safe.global) instead of shipping
unverified Ledger tx-signing. Unused imports + the unused `network` param removed; the Ledger
`Eth` dynamic-import type fixed via cast. `tsc --noEmit` is clean for `deploy-safe.ts`.
**NOT runtime-tested** (no Safe deploy / Ledger in CI) — operator MUST `--network sepolia --dry-run`
first, and the Safe UI remains the recommended path for the production Arbitrum One deploy.

### scripts/phase-0-smoke.ts, seed-calendar.ts, test/*.ts — Pre-existing tsc errors

Various unused variable and type errors in existing scripts. Not caused by 06-06.

### tsc --noEmit exit status for scripts package

`npx tsc --noEmit` in `scripts/` exits 1 due to the above pre-existing errors.
`rehearse-ownership.ts` itself is clean — zero errors from that file.
