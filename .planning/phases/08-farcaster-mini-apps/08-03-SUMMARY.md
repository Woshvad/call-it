---
phase: 08-farcaster-mini-apps
plan: 03
subsystem: frontend
tags: [farcaster, frame, tx-wire, viem, encodeFunctionData, abi, sepolia, security]

# Dependency graph
requires:
  - phase: 08-farcaster-mini-apps
    provides: lib/farcaster-fixtures.ts (per-status button table + min-stake) + frame-tx.test.ts RED scaffold (Plan 01)
  - phase: 02-followfademarket
    provides: FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA + followFadeMarketAbi (follow/fade)
  - phase: 03-challengeescrow
    provides: CHALLENGE_ESCROW_ARBITRUM_SEPOLIA + verified ChallengeFormModal CE_ABI slice
provides:
  - apps/web/lib/abis/ChallengeEscrow.ts — promoted challengeEscrowAbi (proposeChallenge slice)
  - apps/web/app/api/frame/tx/[callId]/route.ts — public Frame tx wire endpoint (POST+GET, runtime nodejs)
  - status-aware button selection (D-02 live / D-06 settled) driving origin-locked viem calldata
affects: [phase-08-plan-04-auto-post, phase-10-mainnet-cutover]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Frame tx wire: status read fail-safe to 'Live' -> single-source button triplet -> encodeFunctionData against a const ABI with a FIXED functionName; `to` is ALWAYS a pinned @call-it/shared Sepolia address, never from the (untrusted) request"
    - "callId guard replicated from /og/[callId]/route.ts: BigInt() + reject 0n inside try/catch -> 400 BEFORE any calldata build"
    - "Non-constructible actions (settled social Follow, Quote) return a {type:'deep-link',url} response from NEXT_PUBLIC_OG_BASE_URL — never faked as an eth_sendTransaction (D-06a)"

key-files:
  created:
    - apps/web/lib/abis/ChallengeEscrow.ts
    - apps/web/app/api/frame/tx/[callId]/route.ts
  modified:
    - apps/web/lib/abis/index.ts
    - apps/web/tests/frame-tx.test.ts

key-decisions:
  - "frame-tx.test decode ABI reconciled to the REAL on-chain follow/fade(uint256,uint256,uint256) signature — the Wave-0 scaffold assumed follow(uint256,uint96,uint8) which has a different 4-byte selector and would never decode the real calldata (and a tx with it would revert on-chain). The asserted args tuple [callId, 1_000_000n, 0n] is identical either way, so the test intent (min-$1 one-tap, origin-locked to, decode round-trip) is fully preserved (Rule 1)"
  - "One-tap follow/fade amount HARDCODED MIN_POSITION_USDC=1_000_000n ($1) + minSharesOut=0n; NEVER read from the untrusted Frame POST body (T-08-03-04, D-07). Challenge stake HARDCODED MIN_STAKE_USDC=5_000_000n ($5)"
  - "Status read uses the layout.tsx env convention (RELAYER_URL ?? NEXT_PUBLIC_RELAYER_URL) + {next:{revalidate:4}}; on any fetch error/non-ok it fails-safe to 'Live' (most-permissive triplet; the contract still enforces real state)"
  - "USDC-allowance policy (Pitfall 3) is ACCEPTED + documented in-code: a single Frame eth_sendTransaction cannot approve+act atomically, so the one-tap path assumes allowance and routes allowance-less users to the in-app deep-link; the tx simply reverts client-side with no fund loss"
  - "ChallengeFormModal.tsx left UNCHANGED — its inline CE_ABI slice was promoted verbatim, not moved (out of scope to touch a Phase-3 component)"

patterns-established:
  - "Public no-auth tx-construction route: validate path param -> read untrusted body ONLY for button index -> fixed-functionName encodeFunctionData -> pinned `to` -> no-store wire JSON; never a server signer"

requirements-completed: [SHARE-19]

# Metrics
duration: ~18min
completed: 2026-06-08
---

# Phase 8 Plan 03: Frame Tx Wire Endpoint Summary

**`POST /api/frame/tx/:callId` now returns a well-formed legacy Frame `eth_sendTransaction` wire (`eip155:421614`) whose button set is chosen by live call status (D-02 live Follow/Fade/Challenge vs D-06 settled Follow/Challenge/Quote) and whose calldata is built server-side with viem `encodeFunctionData` against the in-repo ABIs + pinned Sepolia addresses — the three constructible one-tap actions (live Follow/Fade at a fixed $1, Challenge at $5) return tx calldata with an origin-locked `to`; the two non-constructible actions (settled social Follow, Quote) route to an origin-locked deep-link (D-06a). Live in-Warpcast broadcast remains the Phase-10 gate (D-01).**

## Performance

- **Duration:** ~18 min
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- **Task 1 — promoted `challengeEscrowAbi`:** new `apps/web/lib/abis/ChallengeEscrow.ts` exports the `proposeChallenge(uint256 callId, uint96 stake) -> (uint256 challengeId)` nonpayable entry `as const`, copied verbatim from the verified `ChallengeFormModal.tsx` `CE_ABI` slice; re-exported from the `lib/abis` barrel. `ChallengeFormModal.tsx` untouched.
- **Task 2 — Frame tx route (TDD GREEN):** `apps/web/app/api/frame/tx/[callId]/route.ts` (`export const runtime = 'nodejs'`, `POST` + debug `GET`):
  - **callId guard (T-08-03-02):** `BigInt(callIdStr)` + reject `0n` inside try/catch → `400` BEFORE any calldata build (replicates the og route guard). Verified `'0'`/`'abc'` → 400, never encode.
  - **Status read (fail-safe, D-02):** fetch relayer `/api/calls/:id/live-state` via `RELAYER_URL ?? NEXT_PUBLIC_RELAYER_URL`, `{next:{revalidate:4}}`; on error/non-ok → default `'Live'`. Triplet from the single-source `lib/farcaster-fixtures.ts` table.
  - **Three constructible one-tap actions:** live Follow → `follow(id, 1_000_000n, 0n)` @ `FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA`; live Fade → `fade(id, 1_000_000n, 0n)` same `to`; Challenge (live or settled) → `proposeChallenge(id, 5_000_000n)` @ `CHALLENGE_ESCROW_ARBITRUM_SEPOLIA`. Wire = `{chainId:'eip155:421614', method:'eth_sendTransaction', params:{abi,to,data,value:'0'}}`, `cache-control: no-store`.
  - **Two non-constructible actions (D-06a):** settled social Follow → deep-link `${base}/call/:id`; Quote → deep-link `${base}/new?parent=:id` (`base = NEXT_PUBLIC_OG_BASE_URL`); returned as `{type:'deep-link',url}`, never an eth_sendTransaction.
  - **Security invariants:** `to` is ALWAYS a pinned import (grep-asserted no `to:` from request); amounts hardcoded (never from body); no server signer; deep-links origin-locked; USDC-allowance assume-allowance policy documented in-code (Pitfall 3).

## Task Commits

1. **Task 1: promote ChallengeEscrow ABI slice** — `8e4f714` (feat)
2. **Task 2: Frame tx wire endpoint + status-aware buttons** — `d45830e` (feat)

## Files Created/Modified

- `apps/web/lib/abis/ChallengeEscrow.ts` — promoted `challengeEscrowAbi` (`proposeChallenge` slice, `as const`)
- `apps/web/lib/abis/index.ts` — re-export `challengeEscrowAbi`
- `apps/web/app/api/frame/tx/[callId]/route.ts` — public Frame tx wire endpoint (Node runtime, status-aware, origin-locked)
- `apps/web/tests/frame-tx.test.ts` — turned GREEN; decode ABI reconciled to real on-chain signature + added Fade/Challenge/settled-triplet/deep-link/callId-guard coverage

## Decisions Made

1. **Decode-ABI reconciliation (the load-bearing deviation).** The Wave-0 scaffold decoded with `parseAbi(['function follow(uint256 callId, uint96 amount, uint8 side)'])`. The real on-chain `FollowFadeMarket.follow` is `follow(uint256 callId, uint256 amountIn, uint256 minSharesOut)` (and `fade` is a distinct function — there is no `side` param). The two signatures have **different 4-byte selectors** (`0xa67221cb` vs `0x401f7e0b`), so calldata encoded for the real contract (the only correct thing to emit — a wrong-selector tx reverts on-chain, violating the Core Value) cannot be decoded by the scaffold ABI. Fixed the test's decode ABI to the real signature. The asserted args tuple `[callId, 1_000_000n, 0n]` is identical, so the test's intent is preserved exactly. (Verified selectors via viem `toFunctionSelector`.)
2. **Fixed amounts, never from the body.** `MIN_POSITION_USDC=1_000_000n` ($1) and `MIN_STAKE_USDC=5_000_000n` ($5) are module constants; the untrusted POST body is read ONLY to learn the tapped button index. Larger stakes route to the deep-link (D-07).
3. **`minSharesOut=0` for the one-tap.** A $1 one-tap accepts any share output (no slippage floor); the real in-app flow can set a floor.
4. **`?action=` override + buttonIndex.** Which button was tapped is resolved from `?action=` (matched against the current triplet) else the 1-based `buttonIndex` in the body, defaulting to the first button. `?action=` only matches buttons present in the current status triplet — Quote/settled-Follow therefore deep-link only on a settled call.
5. **GET debug handler.** Added alongside POST for probe-style clients; same logic.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reconciled the Wave-0 test decode ABI to the real on-chain follow/fade signature**
- **Found during:** Task 2 (turning `frame-tx.test.ts` GREEN)
- **Issue:** The scaffold asserted decode against `follow(uint256,uint96,uint8)`; the deployed contract is `follow(uint256,uint256,uint256)` (and `fade` is separate). Different selectors → the scaffold ABI cannot decode the correct calldata, and emitting calldata for the scaffold's signature would produce a tx that reverts on-chain.
- **Fix:** Updated the test's decode ABI to `follow/fade(uint256 callId, uint256 amountIn, uint256 minSharesOut)` (+ `proposeChallenge` decode ABI for the new coverage). Asserted args tuple `[callId, 1_000_000n, 0n]` unchanged.
- **Files modified:** `apps/web/tests/frame-tx.test.ts`
- **Verification:** viem `toFunctionSelector` confirmed the selector mismatch; route emits real-ABI calldata; 8/8 tests GREEN.
- **Committed in:** `d45830e`

**2. [Rule 3 - Blocking, logged not fixed] Pre-existing Plan-01/02 scaffold `tsc` errors**
- **Found during:** Task 1/Task 2 `tsc --noEmit`
- **Issue:** `tests/farcaster-embed.test.ts` (TS2345 missing `children`) and `tests/farcaster-manifest.test.ts` (TS6307 + TS2554) fail typecheck — both from Plan-01 commit `a50fef5`, not from this plan's files.
- **Action:** Per SCOPE BOUNDARY, NOT fixed; logged to `08-farcaster-mini-apps/deferred-items.md`. The `frame-tx.test.ts` typecheck is clean after this plan; both files pass at vitest runtime (failures are typecheck-only).
- **Files modified:** `deferred-items.md` (log only)

---

**Total deviations:** 2 (1 auto-fixed Rule-1 test reconciliation; 1 out-of-scope discovery logged).
**Impact on plan:** No scope creep. The Rule-1 fix makes the wire on-chain-correct (the whole point of SC2). The logged items belong to earlier plans.

## Threat Surface Scan

All surface is within the plan's `<threat_model>`:

- **T-08-03-01** (Tampering `to`/`data`): `to` ALWAYS pinned import (grep-asserted), `data` = fixed-functionName `encodeFunctionData` against const ABI. Mitigated.
- **T-08-03-02** (malicious callId): BigInt guard + reject `0n` → 400 before any build. Mitigated (tested).
- **T-08-03-03** (SSRF): only outbound fetch is the env-pinned relayer `/live-state` with a BigInt-validated path segment. Mitigated.
- **T-08-03-04** (wrong/larger amount): hardcoded `MIN_POSITION_USDC`; never from body. Mitigated (decode asserts `1_000_000n`).
- **T-08-03-05** (server signer): calldata-only route, no private key, no tx hash. Mitigated.
- **T-08-03-06** (off-origin deep-link): deep-links from `NEXT_PUBLIC_OG_BASE_URL` + fixed path. Mitigated.
- **T-08-03-07** (allowance revert): accepted + documented (Pitfall 3 in-code).
- **T-08-03-SC** (npm installs): ZERO new npm deps — viem already in-repo.

No new threat flags beyond the register.

## Known Stubs

None. The deep-link responses for settled Follow / Quote are the intended D-06a behavior (the in-frame on-chain-less social-follow SPA is an explicit Phase-10 enhancement, documented in-code), not stubs.

## User Setup Required

None.

## Next Phase Readiness

- **Plan 04 (auto-post):** the actionable Frame tx wire is in place; SC2 (action half of SHARE-19) is satisfied unit-end-to-end (encode/decode round-trip + status triplet + callId guard + origin-locked `to`).
- **Phase 10 (mainnet cutover):** live in-Warpcast broadcast is the deferred gate (D-01 — 421614 not in Warpcast chainList); CAIP-2 swaps `eip155:421614` → `eip155:42161` and the `to`/deep-link origin re-points via the same pinned-address / env-base pattern.
- No blockers.

---
*Phase: 08-farcaster-mini-apps*
*Completed: 2026-06-08*

## Self-Check: PASSED
