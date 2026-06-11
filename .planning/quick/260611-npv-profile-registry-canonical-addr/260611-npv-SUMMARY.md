---
phase: quick-260611-npv
plan: 01
subsystem: web-profile
status: complete
tags: [profile-registry, zero-address, silent-success, read-back-verification, regression-pin]
requirements: [AUTH-35, AUTH-12]
dependency_graph:
  requires:
    - apps/web/lib/chain.ts (PROFILE_REGISTRY_ADDRESS, ACTIVE_CHAIN_ID)
    - apps/web/lib/abis/ProfileRegistry.ts (displayHandle view — pre-existing, no ABI change)
  provides:
    - Canonical-address setDisplayHandle write + post-receipt displayHandle read-back
    - Canonical-address unlinkTwitter/unlinkFarcaster writes
    - Regression pins (4 tests) locking both files off the env-fallback pattern
  affects:
    - /profile/[address]/settings handle save flow
    - Settings unlink Twitter / Farcaster flows
key_files:
  modified:
    - "apps/web/app/profile/[address]/settings/page.tsx"
    - apps/web/app/components/SocialLinkControls.tsx
    - apps/web/tests/chain-pinning.test.ts
decisions:
  - "Read-back compares onChainHandle against the EXACT raw handleInput (write submits untrimmed args) — mismatch shows 'Save confirmed but the handle did not update — contact support.' and handleSaved stays false"
  - "Rationale comments describe the dead pattern as 'a per-app env override' — the literal env-var name is banned from both source files by the new source-text pin"
  - "Regression test asserts non-zero ONLY for the active (Sepolia) selection; PROFILE_REGISTRY_ARBITRUM_ONE stays a documented 0x0 placeholder until Phase 7.5 cutover"
  - "Unlink writes remain non-receipt-gated (pre-existing scope) — only the address source changed there"
metrics:
  duration: ~10 minutes
  completed: 2026-06-11
  tasks: 2/2
  commit: 75ab468
---

# Quick 260611-npv: ProfileRegistry Canonical Address + Save Read-Back Summary

**One-liner:** ProfileRegistry writes (setDisplayHandle, unlinkTwitter, unlinkFarcaster) repointed from a Vercel-unset env var that fell back to the zero address (txs mined "successfully" into the void) to the canonical chain-aware PROFILE_REGISTRY_ADDRESS from @/lib/chain, plus post-receipt displayHandle read-back so "Handle saved on-chain." is unreachable without the chain reflecting it.

## What Was Done

### Task 1 — Repoint both write surfaces + read-back verification (commit 75ab468)

**`apps/web/app/profile/[address]/settings/page.tsx`:**
- Deleted the `PROFILE_REGISTRY_ADDR = env ?? 0x000…000` local const
- Imports `PROFILE_REGISTRY_ADDRESS` from `@/lib/chain` and `readContract` from `wagmi/actions`
- TS-safe caller guard: missing `connectedAddress` → "No connected wallet — reconnect and retry."; narrowed `caller` captured for the read-back closure
- Receipt-success branch now reads `displayHandle(caller)` from the canonical registry; `setHandleSaved(true)` ONLY on exact equality with the raw submitted `handleInput`; mismatch → "Save confirmed but the handle did not update — contact support."; a read throw falls through to the existing outer catch
- File header + write-site comments document the silent-success root cause without the literal env-var name

**`apps/web/app/components/SocialLinkControls.tsx`:**
- Deleted the env-fallback const; extended the `@/lib/chain` import with `PROFILE_REGISTRY_ADDRESS`
- Both `handleUnlinkTwitter` and `handleUnlinkFarcaster` write sites repointed; surrounding ensureActiveChain/try-catch untouched; link flows, relayer POSTs, and C12 logic untouched

### Task 2 — Regression pin block (same commit)

New `describe('ProfileRegistry writes — canonical address, no env fallback (quick-260611-npv)')` in `apps/web/tests/chain-pinning.test.ts` (4 tests):
1. `PROFILE_REGISTRY_ADDRESS` is non-zero and equals `PROFILE_REGISTRY_ARBITRUM_SEPOLIA`
2. + 3. Source pins for both files: no `NEXT_PUBLIC_PROFILE_REGISTRY_ADDRESS`, no `PROFILE_REGISTRY_ADDR =`, contains `PROFILE_REGISTRY_ADDRESS` + `@/lib/chain`
4. Settings page contains `functionName: 'displayHandle'` + `readContract` (read-back wired)

## Verification

| Gate | Result |
|---|---|
| `grep -c NEXT_PUBLIC_PROFILE_REGISTRY_ADDRESS` (both files) | 0 and 0 (pattern eradicated) |
| `pnpm --filter @call-it/web build` | exit 0 |
| `pnpm --filter @call-it/web exec vitest run` | 240 passed / 0 failed (236 baseline + 4 new pins; chain-pinning.test.ts 12→16) |
| `git log -1 --stat` | single commit `75ab468`, exactly 3 files, no push |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None introduced. Note (pre-existing, documented in plan): unlink writes are not receipt-gated — out of scope here by design.

## Self-Check: PASSED
- FOUND: apps/web/app/profile/[address]/settings/page.tsx (modified, committed)
- FOUND: apps/web/app/components/SocialLinkControls.tsx (modified, committed)
- FOUND: apps/web/tests/chain-pinning.test.ts (modified, committed)
- FOUND: commit 75ab468 on master
