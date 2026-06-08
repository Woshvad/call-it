---
phase: 8
slug: farcaster-mini-apps
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-08
updated: 2026-06-08
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (apps/web + apps/relayer); contracts not relevant this phase |
| **Config file** | `apps/web/vitest.config.ts` (`include: ['tests/**/*.test.ts']`, `globals: false`, `environment: 'node'`) |
| **Quick run command** | `pnpm --filter @call-it/web test` (per-file: `pnpm --filter @call-it/web exec vitest run tests/<file>.test.ts`) |
| **Full suite command** | `pnpm --filter @call-it/web test && pnpm --filter @call-it/relayer test` |
| **Estimated runtime** | ~30 seconds (web unit) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @call-it/web test` (web) / `pnpm --filter @call-it/relayer test` (relayer task)
- **After every plan wave:** Run the full suite command above
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 8-01-01 | 01 | 0 | SHARE-19 | T-08-01-01 | `/.well-known/farcaster.json` is public (not bounced to /signin); icon/splash assets exist at exact dimensions | source/unit | `cd apps/web && node -e "..." (asset + middleware grep)` | ❌ W0 | ⬜ pending |
| 8-01-02 | 01 | 0 | SHARE-19 | T-08-01-SC | RED scaffolds collected (no zero-dep install); fixtures pure | unit | `pnpm --filter @call-it/web exec vitest run tests/farcaster-embed.test.ts tests/farcaster-manifest.test.ts tests/frame-tx.test.ts tests/middleware-public.test.ts` | ❌ W0 | ⬜ pending |
| 8-02-01 | 02 | 1 | SHARE-19 (SC1a/SC3) | T-08-02-01/02/03 | embed origin-locked to NEXT_PUBLIC_OG_BASE_URL; same statusVersion as og:image (no stale card); JSON.stringify-escaped (no raw user string) | unit | `pnpm --filter @call-it/web exec vitest run tests/farcaster-embed.test.ts` | ✅ (W0 scaffold) | ⬜ pending |
| 8-02-02 | 02 | 1 | SHARE-19 (SC1b) | T-08-02-04 | manifest public, body-only, NO accountAssociation (D-05); dotted route builds (Pitfall 5) | unit + build-verify | `pnpm --filter @call-it/web exec vitest run tests/farcaster-manifest.test.ts` | ✅ (W0 scaffold) | ⬜ pending |
| 8-03-01 | 03 | 1 | SHARE-19 | T-08-03-SC | const ABI preserves viem inference; barrel export | source/typecheck | `pnpm --filter @call-it/web exec tsc --noEmit` | ❌ (new) | ⬜ pending |
| 8-03-02 | 03 | 1 | SHARE-19 (SC2) | T-08-03-01..05 | `to` from pinned addresses only (never params); callId BigInt-validated (reject 0/non-numeric); one-tap amount HARDCODED $1; no server signer; deep-link for settled Follow/Quote (D-06a) | unit | `pnpm --filter @call-it/web exec vitest run tests/frame-tx.test.ts` | ✅ (W0 scaffold) | ⬜ pending |
| 8-04-01 | 04 | 2 | SHARE-19 (SC3) | T-08-04-02/03 | auto-post warpcastUrl carries embed-bearing receipt URL; compose host verified; builders pure | unit | `pnpm --filter @call-it/relayer test` (+ `pnpm --filter @call-it/web test` for share-text) | ✅ exists (extend) | ⬜ pending |
| 8-04-02 | 04 | 2 | SHARE-19 (SC3) | T-08-04-01 | SHARE AS FRAME control reuses shared builders, noopener/noreferrer, omitted on missing URL/handle (no dead button) | source + human-verify | `cd apps/web && node -e "..." (control grep)` + visual checkpoint | ❌ (new) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

> **Nyquist note (from RESEARCH §Validation Architecture):** SC1 (embed meta + manifest) and the Frame `tx` endpoint wire format are validatable on Sepolia WITHOUT live Warpcast — render `generateMetadata` and assert `fc:miniapp`/`fc:frame`; invoke the manifest route and assert the pinned schema; POST the tx route and assert a well-formed `eth_sendTransaction` wire object + `decodeFunctionData` round-trip for a known callId. The live in-Warpcast tap-to-broadcast (SC2 live proof) is genuinely NOT testable on testnet (Arbitrum Sepolia 421614 not in Warpcast's chainList) and is correctly a Phase-10 gate (D-01) → recorded under Manual-Only below, NOT as a red test.

---

## Wave 0 Requirements

- [ ] `apps/web/tests/farcaster-embed.test.ts` — SC1a/SC3 embed-meta shape (turned GREEN by Plan 02)
- [ ] `apps/web/tests/farcaster-manifest.test.ts` — SC1b manifest schema, no accountAssociation (turned GREEN by Plan 02)
- [ ] `apps/web/tests/frame-tx.test.ts` — SC2 wire format + status-aware buttons + calldata round-trip (turned GREEN by Plan 03)
- [ ] `apps/web/tests/middleware-public.test.ts` — SC1c `/.well-known` + `/api/frame` public
- [ ] `apps/web/lib/farcaster-fixtures.ts` — shared per-status button-set table + seeded callId fixtures (live / settled / caller-exited / duel)
- [ ] `apps/web/public/icon.png` (1024×1024 PNG no alpha) + `apps/web/public/splash.png` (200×200)
- [ ] Extend `apps/relayer/src/workers/__tests__/auto-post-worker.test.ts` — assert the receipt URL carries the embed (no payload change) — Plan 04

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live in-Warpcast tap-to-transact (Follow/Fade/Challenge broadcasts) | SHARE-19 / SC2 | Arbitrum Sepolia (421614) is not in Warpcast's supported chainList; live broadcast needs production Warpcast + a chain it broadcasts to (D-01) — **Phase-10 gate, not a Phase-8 failure** | Deferred to Phase 10 mainnet smoke test (eip155:42161) |
| Cast embed renders OG card + launch button in a real Farcaster client | SHARE-19 / SC1 | Best confirmed visually in the Farcaster Mini App embed debugger / a real cast; the unit test asserts the meta shape, the visual render is a supplementary manual check | Paste a deployed Sepolia `/call/:id` URL into the Farcaster embed debugger; confirm OG card + button (optional — supplements the GREEN unit test) |
| SHARE AS FRAME control placement/treatment | SHARE-19 / SC3 / UI-SPEC | Visual treatment (outline, spacing, no new tokens) is a human visual check | Plan 04 Task 2 checkpoint:human-verify (how-to-verify steps) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags (`vitest run`, `watch:false`)
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (planning)
