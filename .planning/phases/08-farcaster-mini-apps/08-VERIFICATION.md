---
phase: 08-farcaster-mini-apps
verified: 2026-06-09T07:20:00Z
status: human_needed
score: 3/3 must-have truths verified (CI-deliverable scope); 5/5 ROADMAP success criteria code-complete on testnet
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
human_verification:
  - test: "SHARE AS FRAME → control visual placement + compose-intent behavior on a real receipt"
    expected: "On a settled /call/{id}, the action row shows SHARE THE RECEIPT → (accent fill) and, to its right, SHARE AS FRAME → (outline: 2px #E8F542 border, transparent fill, accent text) at the same height/gap/typography; clicking opens a new tab to farcaster.xyz/~/compose?text=…&embeds[]=<receiptUrl>; the control is ABSENT (not a dead button) on a receipt with no real handle / no NEXT_PUBLIC_OG_BASE_URL"
    why_human: "Planner deferred this as checkpoint:human-verify (08-04 Task 2, gate=blocking). Visual treatment/placement + new-tab navigation cannot be verified by grep; the build-verify only asserts the string + warpcastComposeUrl reuse exist"
  - test: "Live in-Warpcast cast render — paste a deployed Sepolia /call/{id} into the Farcaster Mini App embed debugger (or a real cast)"
    expected: "Warpcast loads the cast, renders the Settled receipt OG card as the embed image, and shows the launch button; the manifest at /.well-known/farcaster.json resolves on the deployed origin"
    why_human: "Requires a deployed origin + a live Farcaster client. CI builds + asserts the embed meta/manifest shape but cannot drive Warpcast. (D-01: full live render of mainnet chain 42161 tap-to-transact is Phase-10; the Sepolia embed render is a tool/manual check, not a gate)"
  - test: "CR-01 security intent — confirm a settled call can never yield a Live Follow/Fade/Challenge wire via a forged ?action= param"
    expected: "In production (NEXT_PUBLIC_DEV_ROUTES unset), POST /api/frame/tx/{settledId}?action=Fade returns the settled deep-link, never an eth_sendTransaction; the override is also dead during a relayer outage (statusReadOk=false)"
    why_human: "REVIEW-FIX flagged CR-01 as 'fixed: requires human verification' (security/logic hardening). Regression tests assert this in CI, but the fixer requested a human confirm the threat-model intent holds end-to-end"
  - test: "WR-04 onboarding boundary — a user cached on step 5 (tagline) during a relayer outage is redirected, not let through"
    expected: "With cached ci_onboarding_step=5 and the relayer down, middleware redirects to /onboarding/tagline rather than failing open into gated pages"
    why_human: "REVIEW-FIX flagged WR-04 as 'fixed: requires human verification' (boundary/logic change from step<5 to 1<=step<=5). Behavioral redirect under a simulated outage is best confirmed by a human"
deferred:
  - truth: "Live in-Warpcast broadcast on eip155:42161 (mainnet) tap-to-transact; signed accountAssociation against the mainnet domain; Mini App catalog/directory submission"
    addressed_in: "Phase 10"
    evidence: "08-CONTEXT D-01/D-04/D-05 + 08-01-PLAN <artifacts_this_phase_produces> 'Deferred to Phase 10' — Arbitrum Sepolia 421614 is not in Warpcast's chainList, so live tap-to-transact and signed-association/catalog are explicitly out of this phase's testable scope"
---

# Phase 8: Farcaster Mini Apps Verification Report

**Phase Goal:** Distribution extension via Farcaster Mini Apps. Frame buttons enable Follow / Fade / Challenge from a Farcaster cast; OpenGraph/`fc:frame` meta tags + Frame server endpoint + Mini App manifest.
**Verified:** 2026-06-09T07:20:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Verdict Summary

Every CI-verifiable code deliverable that makes SC1/SC2/SC3 achievable EXISTS, is substantive, is wired, and is covered by passing tests + a clean build. The portions of SC1/SC2/SC3 that require a real Farcaster client (Warpcast actually loading the cast, a user tapping a button and broadcasting on mainnet, the auto-post landing in a live client) are legitimately deferred to Phase 10 per D-01 (Arbitrum Sepolia 421614 is not in Warpcast's chainList) — they are NOT gaps. Status is `human_needed` (not `passed`) solely because the phase carries a planner-deferred `checkpoint:human-verify` visual check (SHARE AS FRAME placement) plus two fixer-flagged human confirmations (CR-01 security intent, WR-04 onboarding boundary) and a manual/tool embed-render check. No BLOCKER or genuine gap found.

## Goal Achievement

### Observable Truths (merged ROADMAP SC + PLAN must_haves)

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Receipt page server-renders `fc:miniapp` (+ `fc:frame`) embed meta AND a public Mini App manifest reachable by a logged-out crawler (SC1, code half) | ✓ VERIFIED | `layout.tsx:84-106` emits `other:{'fc:miniapp','fc:frame'}` from `buildFarcasterEmbeds`; `app/.well-known/farcaster.json/route.ts` GET returns the unsigned miniapp config; `middleware.ts:65` carves out `/.well-known` so the crawler is not bounced to /signin; build registers both routes (`ƒ /.well-known/farcaster.json`). Live Warpcast render = human/Phase-10. |
| 2 | Tapping Follow/Fade/Challenge initiates the corresponding tx flow against the Phase 1.5/2/3 contract paths via the Frame tx protocol (SC2, code half) | ✓ VERIFIED | `POST /api/frame/tx/[callId]` returns `{chainId:'eip155:421614', method:'eth_sendTransaction', params:{abi,to,data,value}}`; `frame-tx.test.ts` decode round-trips `follow(id,1_000_000n,0n)`, `fade(id,1_000_000n,0n)`, `proposeChallenge(id,5_000_000n)`; `to` is always a pinned `@call-it/shared` Sepolia address; settled Follow/Quote route to deep-links (D-06a). Live broadcast = Phase-10 (D-01). |
| 3 | Farcaster rendering matches the Twitter OG card variant for visual continuity; auto-post + manual SHARE AS FRAME carry the embed-bearing receipt URL (SC3, code half) | ✓ VERIFIED | Embed `imageUrl = ${base}/og/${callId}?v=${statusVersion}` reuses the UNCHANGED Phase-7 OG card at the SAME statusVersion as og:image (Pitfall 4 avoided); `auto-post-worker.test.ts:217` asserts the produced warpcastUrl carries the encoded receipt URL; `page.tsx:1574-1590` renders the SHARE AS FRAME control (omitted when handle/origin missing). Live cast-lands + catalog discoverability = human/Phase-10 (D-04). |

**Score:** 3/3 truths verified (CI-deliverable scope). All 5 ROADMAP success criteria are code-complete-on-testnet; their live-client tails are deferred to Phase 10 (D-01), not gaps.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Live in-Warpcast broadcast on mainnet (42161) tap-to-transact; signed `accountAssociation`; Mini App catalog submission | Phase 10 | 08-CONTEXT D-01/D-04/D-05; 08-01-PLAN `<artifacts_this_phase_produces>` "Deferred to Phase 10"; Sepolia 421614 not in Warpcast chainList |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `apps/web/public/icon.png` | 1024x1024 PNG, NO alpha | ✓ VERIFIED | 1024x1024, PNG colorType=2 (RGB, opaque) — confirmed via IHDR read |
| `apps/web/public/splash.png` | 200x200 PNG | ✓ VERIFIED | 200x200, colorType=6 (alpha allowed — spec compliant) |
| `apps/web/middleware.ts` | `PUBLIC_PREFIXES` includes `/.well-known`; explicit `/api/frame` `/api/og` (WR-03) | ✓ VERIFIED | Lines 57-65; blanket `/api` removed per WR-03; WR-04 `1<=step<=5` at line 183 |
| `apps/web/lib/farcaster-fixtures.ts` | per-status button-set table + seeded callIds, pure | ✓ VERIFIED | `STATUS_BUTTON_SETS` + `buttonsForStatus`, no env/fetch |
| `apps/web/lib/farcaster-embed.ts` | pure `buildFarcasterEmbeds` → {miniappEmbed, frameEmbed}, only action.type differs; throws on empty/relative base (WR-02) | ✓ VERIFIED | Lines 67-122; absolute-origin guard at 77-81 |
| `apps/web/app/call/[id]/layout.tsx` | `generateMetadata` adds `other:{fc:miniapp,fc:frame}`, reuses statusVersion, omits when base unset (WR-02) | ✓ VERIFIED | Lines 83-106; single `fetchCallMeta` call (no second fetch) |
| `apps/web/app/.well-known/farcaster.json/route.ts` | nodejs GET, no accountAssociation, 503 when base unset (WR-01) | ✓ VERIFIED | `runtime='nodejs'`; no association key; 503 guard at 42-47 |
| `apps/web/lib/abis/ChallengeEscrow.ts` (+barrel) | `challengeEscrowAbi` proposeChallenge(uint256,uint96)→uint256, as const | ✓ VERIFIED | Promoted verbatim; re-exported in `index.ts:13` |
| `apps/web/app/api/frame/tx/[callId]/route.ts` | nodejs POST, status-aware buttons, origin-locked calldata, CR-01/WR-05/WR-06 hardening | ✓ VERIFIED | Full file substantive; `readStatus` returns `{status,ok}`; `?action=` gated behind dev flag + statusReadOk + status-set membership |
| `apps/web/app/call/[id]/page.tsx` | SHARE AS FRAME outline control, reuse builders, omit when missing | ✓ VERIFIED | Lines 1378-1590; `rel="noopener noreferrer"`; conditional render on `shareAsFrameUrl` |
| `apps/relayer/.../auto-post-worker.test.ts` | asserts warpcastUrl carries receipt URL | ✓ VERIFIED | Line 217 `toContain(encodeURIComponent('https://callit.test/call/7'))` |
| `packages/shared/src/share/share-text.ts` | compose host verified (Open Q3) | ✓ VERIFIED | Host migrated to `farcaster.xyz/~/compose` (one-line, purity preserved) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `middleware.ts` | `/.well-known/farcaster.json` public | `PUBLIC_PREFIXES.startsWith('/.well-known')` | ✓ WIRED | `middleware-public.test.ts` asserts public + `/api/me` `/api/admin` still gated |
| `layout.tsx` | `/og/{id}?v={statusVersion}` | embed imageUrl from same statusVersion as og:image | ✓ WIRED | No second relayer fetch; Pitfall 4 closed |
| manifest route | `NEXT_PUBLIC_OG_BASE_URL` | env-derived homeUrl/iconUrl/splashImageUrl | ✓ WIRED | Origin-locked; 503 when unset |
| frame tx route | relayer `/api/calls/:id/live-state` | fail-safe fetch → `{status, ok}` | ✓ WIRED | `readStatus` 127-158; ok-gating closes CR-01 |
| frame tx route | `FOLLOW_FADE_MARKET_/CHALLENGE_ESCROW_ARBITRUM_SEPOLIA` | pinned `@call-it/shared` address as `to` | ✓ WIRED | `to` never from params; verified by decode round-trip tests |
| page SHARE AS FRAME | `warpcastComposeUrl + buildShareText` | reused pure builders, new tab | ✓ WIRED | page.tsx:1381-1384 |
| auto-post-worker | receipt URL embed | embed rides receiptUrl in warpcastComposeUrl | ✓ WIRED | worker test line 217 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase-8 web tests (frame-tx + embed + manifest + middleware-public) | `vitest run` (4 files) | 4 files / 24 tests passed | ✓ PASS |
| Full web suite | `pnpm --filter @call-it/web test` | 11 files / 89 tests passed | ✓ PASS |
| Shared suite | `pnpm --filter @call-it/shared test` | 6 files / 124 tests passed | ✓ PASS |
| Relayer suite | `pnpm --filter @call-it/relayer test` | 37 files / 209 passed, 1 skipped | ✓ PASS |
| Web build + dotted-route registration | `pnpm --filter @call-it/web build` | Compiled (warnings only); `ƒ /.well-known/farcaster.json` + `ƒ /api/frame/tx/[callId]` registered | ✓ PASS |
| Static-asset dimensions/alpha | node IHDR read | icon 1024x1024 opaque (ct=2); splash 200x200 (ct=6) | ✓ PASS |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| — | — | No `scripts/*/tests/probe-*.sh` declared for this web/frontend phase | ? SKIP (no probes) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| SHARE-19 | 01, 02, 03, 04 (all `requirements:[SHARE-19]`) | Frame buttons enable Follow/Fade/Challenge from a Farcaster post; OpenGraph meta + Frame server endpoint | ✓ SATISFIED | Embed meta (02) + manifest (02) + Frame tx wire (03) + auto-post/share-as-frame (04). REQUIREMENTS.md:427 already `[x]`; line 950 maps SHARE-19 → Phase 8 Complete. No other REQ-ID maps to Phase 8 → no ORPHANED requirements. Live-client tail = Phase-10 (D-01). |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| frame tx route | 300, 372, 377 | `?? ''` empty-base default for deep-link `base` | ℹ️ Info | Deep-link path only; manifest+embed have explicit absolute-base guards (WR-01/WR-02). Not user-facing on the gated path. |
| frame tx route | 326, 345, 364 | `value: '0'` (decimal, not `0x0`) | ℹ️ Info | IN-01 from REVIEW — out of fix scope (Info); flagged for Phase-10 mainnet cutover; lenient clients accept it. Not a gap. |
| farcaster-fixtures.ts | 70-79 | `SEEDED_CALL_IDS` testnet ids in non-test `lib/` | ℹ️ Info | IN-04 from REVIEW — documented placeholders, consumed only by tests today. Not a gap. |

No `TBD` / `FIXME` / `XXX` debt markers in any Phase-8-modified file. No stubs: every artifact returns real, status-derived output (verified by decode round-trips). All 1 BLOCKER (CR-01) + 6 warnings from 08-REVIEW are FIXED in 08-REVIEW-FIX (status all_fixed) and the fixes are present in the live code (confirmed by reading route.ts, middleware.ts, manifest route, embed builder, layout).

### Human Verification Required

1. **SHARE AS FRAME visual placement + compose behavior** (planner-deferred `checkpoint:human-verify`, 08-04 Task 2). Open a settled `/call/{id}`; confirm the outline control sits right of SHARE THE RECEIPT → with matching height/gap/typography, opens a new tab to `farcaster.xyz/~/compose?...&embeds[]=<receiptUrl>`, and is ABSENT (no dead button) when handle/origin is missing.
2. **Live Sepolia embed render** (manual/tool). Paste a deployed `/call/{id}` into the Farcaster embed debugger (or a real cast) — OG card + launch button render; manifest resolves on the deployed origin. (Mainnet tap-to-transact = Phase 10, D-01.)
3. **CR-01 security intent** (fixer-flagged). In production (DEV_ROUTES unset), confirm a forged `?action=Fade` on a settled call returns a deep-link, never a Fade tx; override dead during a relayer outage.
4. **WR-04 onboarding boundary** (fixer-flagged). With cached step=5 and the relayer down, confirm middleware redirects to /onboarding/tagline rather than failing open.

### Gaps Summary

No gaps. All CI-verifiable Phase-8 deliverables exist, are substantive, are wired, and pass tests + build. The 1 BLOCKER + 6 warnings from code review were all fixed and the fixes are verified present in the live code. The only items keeping this from `passed` are human-verification checks: one planner-deferred visual checkpoint (SHARE AS FRAME), one manual/tool embed-render check, and two fixer-requested human confirmations (CR-01 security intent, WR-04 onboarding boundary). The live in-Warpcast broadcast / mainnet tap-to-transact / signed accountAssociation / catalog submission are correctly deferred to Phase 10 per D-01 and are recorded as `deferred`, not gaps.

---

_Verified: 2026-06-09T07:20:00Z_
_Verifier: Claude (gsd-verifier)_
