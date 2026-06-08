---
phase: 07-og-service-final-variants-subgraph-final-mappings
verified: 2026-06-08T17:30:00Z
status: passed
score: 5/5 success criteria verified (SC1 met at 4/5 outcome words; CONTRARIAN HIT a documented code-gap follow-up)
overrides_applied: 0
re_verification:
  previous_status: needs-review
  previous_score: 5/5 substantively delivered (SC1 partial — 200px gate not yet executed)
  gaps_closed:
    - "SC1 200px outcome-word readability baselines — 4/5 committed (CALLED IT, COLD CALL, LOUD AND WRONG, FADED CORRECTLY), all legible"
    - "OPS-04 authoritative verify-event-coverage.ts live run — re-run by verifier against v0.9.0 --seeded-call-id 14, exit 0, CallCreated indexed in 266ms (<30s)"
    - "Twitter Card Validator (SHARE-13) — card meta confirmed live by curl on /call/1 + /duel/1 (summary_large_image + absolute og:image); browser visual preview operator-confirmed"
    - "DuelSettled OG card metadata — was missing entirely; fixed (commit 57a402c) + live (/duel/1 emits summary_large_image → /og/duel/1?v=1)"
    - "Incognito visual hydration spot-check — operator-confirmed (CORS preflight 204 exact-origin + page 200s + no hydration-error markers)"
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "CONTRARIAN HIT 200px outcome-word baseline (5th of 5 SC1 words)"
    addressed_in: "Follow-up code task (post-Phase-7, tracked in phase-7-deploy-runbook.md + og-thumbnail-200px.spec.ts)"
    evidence: "The OG route apps/web/app/og/[callId]/route.ts:862 hardcodes fadeRealShare:0, and apps/web/lib/outcome-word.ts:89 requires fadeRealShare >= 0.5 for CONTRARIAN HIT — so the card cannot render that word regardless of seeded data until fadeRealShare is wired from subgraph fade/follow positions. This is a genuine code-gap follow-up (not a seeding miss); the test marks it deferred:true (test.skip). The other 4 outcome words have committed legible baselines. SC1's machine-verifiable gates (grid-lint, 1200×630, Node runtime, card meta) all pass."
  - truth: "Subgraph published to The Graph Decentralized Network on Arbitrum (ROADMAP SC3 literal wording)"
    addressed_in: "Phase 10"
    evidence: "D-01 (locked CONTEXT decision): DN publish needs live mainnet contracts which do not exist until Phase 10. Phase 7 finalizes + verifies ALL ~20 event mappings on the existing Sepolia Studio subgraph (v0.8.0 → v0.9.0). ROADMAP Phase 10 detail owns DN publish + api.callitapp.xyz cutover. Intentional decision-driven narrowing, not a gap."
  - truth: "OG service hosted at api.callitapp.xyz/og/[callId] (SHARE-02 literal wording)"
    addressed_in: "Phase 10"
    evidence: "D-01 / CONTEXT Deferred: mainnet OG domain cutover is Phase 10. Sepolia serves OG from the Vercel origin via NEXT_PUBLIC_OG_BASE_URL (D-12). The OG service itself is fully built + live on the Vercel origin (call-it-web-sepolia.vercel.app)."
---

# Phase 7: OG service final variants + Subgraph final mappings — Verification Report

**Phase Goal:** All 5 OG card variants finalized (Live, Settled, DuelSettled, CallerExited, Fallback) via @vercel/og + Satori on Node runtime (flexbox only, CI grid-lint, 200px readability gate); subgraph event mappings finalized + verified on the Sepolia Studio subgraph (DN publish deferred to Phase 10); auto-post-to-X/Farcaster gated by cache-warm verification; Profile Overview / Leaderboard / Quote Composer pages built; apps/web deployed to Vercel (call-it-web-sepolia). Closes critical-path steps 6/8/9/10.

**Verified:** 2026-06-08T17:30:00Z
**Status:** passed
**Re-verification:** Yes — after the operator/seeded residuals were closed this session

## Goal Achievement

The Phase 7 goal is achieved. The code spine of the share loop is real, substantive, wired, compiles, and tests green; the live Sepolia deploy is done and re-verified by the verifier directly against the deployed app and the live v0.9.0 subgraph (not via SUMMARY claims). The three residuals that held the prior verdict at `needs-review` are now closed:

1. **SC1 200px outcome-word baselines** — 4/5 generated + committed + legible; the 5th (CONTRARIAN HIT) is a confirmed code-gap deferral with an inline code comment and a tracked follow-up (not a seeding miss, not a silent failure).
2. **OPS-04 authoritative coverage run** — the verifier re-ran `verify-event-coverage.ts --endpoint <v0.9.0> --seeded-call-id 14` and observed exit 0 with CallCreated id=14 indexed in 266ms (<30s budget).
3. **Twitter Card Validator + incognito hydration** — card meta confirmed LIVE by verifier curl on `/call/1` and `/duel/1`; browser visual preview + incognito hydration operator-confirmed per the runbook.

The two ROADMAP-literal items (DN publish, api.callitapp.xyz) remain decision-deferred to Phase 10 by the locked D-01 and are NOT gaps. The single CONTRARIAN HIT baseline is deferred to a follow-up code task; per the re-verification instruction this documented deferral is treated as acceptable, so SC1 is judged met.

### Observable Truths (Success Criteria)

| # | Success Criterion | Status | Evidence |
|---|-------------------|--------|----------|
| SC1 | 5 OG variants render 1200×630 PNG on Node runtime; CI grid-lint rejects `display:grid`; 200px readability gate passes for the outcome words; Twitter Card check passes | ✓ VERIFIED (4/5 outcome words; CONTRARIAN HIT a documented code-gap follow-up) | **Grid-lint:** `eslint app/og` exit 0 (verifier re-ran), planted-violation fail proven in prior run. **Node runtime:** all OG routes declare `runtime='nodejs'`. **1200×630:** dimension assertions run unconditionally in og-thumbnail-200px.spec.ts; verifier curl confirms `/og/1`, `/og/duel/1`, `/og/fallback`, `/og/14`, `/og/14?as=fader` all return `200 image/png` live. **200px baselines:** 4 committed PNGs at `apps/web/tests/og-thumbnail-200px.spec.ts-snapshots/og-200-{CALLED-IT,COLD-CALL,LOUD-AND-WRONG,FADED-CORRECTLY}-chromium-win32.png` (seeded via call #14 = CallerLost). **CONTRARIAN HIT deferred:** route.ts:862 hardcodes `fadeRealShare:0`; outcome-word.ts:89 needs `>=0.5` — card cannot render that word until fadeRealShare is wired from subgraph positions; test marks `deferred:true` (test.skip); tracked in runbook + spec comment. **Twitter Card:** `/call/1` + `/duel/1` emit `summary_large_image` + absolute og:image (verifier curl); browser preview + incognito hydration operator-confirmed. |
| SC2 | Auto-post fires on settle ONLY after cache-warm verification (?v= regen → HEAD 200 + ETag); ≤30s retry; Farcaster cast parallel; never modifies X beyond posting | ✓ VERIFIED | auto-post-worker.ts: cache-warm HEAD probe asserts 200 + X-Variant∈{settled,caller-exited} + stable ETag before posting; AUTO_POST_DELAY_MS Pitfall-18 gate; retry budget (≤30s, SHARE-03); posted_receipts onConflictDoNothing dedup; warpcastComposeUrl parallel. x-write-client.ts key-gated degrade-to-no-op (never throws). X_API_WRITE_TOKEN on pino redact list. Wired into relayer startup (index.ts). Relayer tests 208 passed (prior run). Unchanged this session — no regression. |
| SC3 | Subgraph event mappings finalized + all ~20 §12.1–12.5 events indexed; CallCreated <30s; polled-events fallback live (DN publish deferred per D-01) | ✓ VERIFIED (Sepolia Studio v0.9.0; DN deferred to Phase 10 per D-01) | `Call.statement` field in schema.graphql; `templateStatement()` populated in handleCallCreated. SUBGRAPH_URL_SEPOLIA = v0.9.0 (addresses.ts:309). **Verifier re-ran the authoritative coverage script** against the live v0.9.0 endpoint with `--seeded-call-id 14`: **exit 0**; all core money/rep paths OK (CallCreated, CallSettled, CallerExited, Followed, Faded, RepCalculated, ProfileUpdated, Challenge Proposed/Accepted/Rejected/Refunded, Dispute Raised/Resolved, SettlementDelayed, RepCalculatedFallback); 8 rare paths empty (non-fatal WARN); **OPS-04 sync-lag: CallCreated id=14 indexed in 266ms (<30000ms)**. DN publish intentionally deferred (D-01). |
| SC4 | Profile Overview (5-stat + CATEGORY REPUTATION + RECENT CALLS + MOST FOLLOWED BY + NOTABLE RECEIPTS); Leaderboard (title/toggle/#1 hero+watermark/chips/viewer-row); Quote Composer + success screen | ✓ VERIFIED | ProfileClient.tsx renders all 5 Overview sections. LeaderboardClient.tsx renders "The Tape"/"Top of book", 7D/30D/All-time toggle, #1 hero with "01" watermark, All/Majors/DeFi/Other chips, viewer-row highlight (D-06 limitation documented). new/page.tsx `?quote=` parent card + THESIS-above-buttons + success thread + Share button. Live: `/leaderboard` 200, `/profile/[address]` operator-confirmed hydrate in incognito. Unchanged this session. |
| SC5 | Receipt server-renders og:image meta with ?v={statusVersion}; receipts off-chain by hash (not NFTs); public no-auth load with sign-in CTA | ✓ VERIFIED | call/[id]/layout.tsx generateMetadata injects og:image `/og/{id}?v={statusVersion}` + twitter:card — **verifier curl confirms live**: `/call/1` → `og:image .../og/1?v=0` + `summary_large_image`. duel/[challengeId]/layout.tsx (added this session, commit 57a402c) emits `og:image .../og/duel/1?v=1` + `summary_large_image` — **verifier curl confirms live**. middleware PUBLIC_PREFIXES /call /duel /profile /leaderboard (no-auth). No NFT mint code in OG/receipt paths (SHARE-20). |

**Score:** 5/5 success criteria VERIFIED. SC1 is met at 4/5 outcome words with the CONTRARIAN HIT baseline carried as a documented code-gap follow-up (route fadeRealShare wiring), accepted per the re-verification instruction.

### Deferred Items (decision-driven / tracked follow-up)

| # | Item | Addressed In | Evidence |
|---|------|--------------|----------|
| 1 | CONTRARIAN HIT 200px baseline (5th SC1 word) | Follow-up code task | route.ts:862 `fadeRealShare:0` + outcome-word.ts:89 `>=0.5` gate — card cannot render the word until fadeRealShare is wired from subgraph positions. test.skip(deferred). Tracked in runbook + spec comment. |
| 2 | DN-publish of subgraph (ROADMAP SC3 literal "Decentralized Network on Arbitrum") | Phase 10 | D-01 locked decision — DN needs mainnet contracts; Phase 7 finalizes mappings on Sepolia Studio v0.9.0. |
| 3 | OG domain `api.callitapp.xyz` (SHARE-02 literal) | Phase 10 | D-01 / CONTEXT Deferred — mainnet domain cutover is Phase 10; Sepolia uses Vercel origin via NEXT_PUBLIC_OG_BASE_URL. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/eslint-rules/no-display-grid-in-og.js` | AST grid-ban rule | ✓ VERIFIED | Real `Property`-node rule; wired into eslint.config.js scoped to OG files; `eslint app/og` exit 0 (verifier re-ran); planted-violation fail proven prior. |
| `apps/web/tests/og-thumbnail-200px.spec.ts` + snapshots | SC1 200px readability + 1200×630 dims | ✓ VERIFIED (4/5 words) | 4 committed baseline PNGs (CALLED-IT, COLD-CALL, LOUD-AND-WRONG, FADED-CORRECTLY); CONTRARIAN HIT `deferred:true` (test.skip). 1200×630 block runs unconditionally. |
| `apps/relayer/src/scripts/seed-loss-call.ts` | Guaranteed-CallerLost seed for LOUD AND WRONG baseline | ✓ VERIFIED | Present (13.5KB); created call #14 (PriceTarget target $1M → CallerLost), settled via settle-pyth-calls.ts. |
| `apps/web/lib/share-text.ts` + `packages/shared/src/share/share-text.ts` | share builders | ✓ VERIFIED | Builders in @call-it/shared; web file thin re-export. Consumed by web Share button + relayer auto-post. |
| `apps/web/app/og/[callId]/route.ts` | Live/Settled/CallerExited real-data cards | ✓ VERIFIED | resolveStatement chain; P&L/REP/FINAL/TARGET wired from Settlement/RepEvent. `fadeRealShare:0` hardcode is the documented CONTRARIAN HIT follow-up (line 862). |
| `apps/web/app/duel/[challengeId]/layout.tsx` | DuelSettled og:image meta (NEW this session) | ✓ VERIFIED | Server layout emits `summary_large_image` → `/og/duel/{id}?v={ordinal}`; live `/duel/1` curl confirms `og:image .../og/duel/1?v=1`. Closes a real gap (page was 'use client' with no metadata). |
| `apps/web/app/og/duel/[challengeId]/route.ts` | DuelSettled card image | ✓ VERIFIED | Live `/og/duel/1` → 200 image/png. |
| `apps/relayer/src/workers/auto-post-worker.ts` | cache-warm + key-gate + retry + dedup | ✓ VERIFIED | See SC2. Wired into index.ts startup. |
| `apps/relayer/src/lib/x-write-client.ts` | key-gated no-op postTweet | ✓ VERIFIED | Never throws; redacted token. |
| `apps/relayer/src/db/schema.ts` (call_statement + posted_receipts) | enrichment + dedup tables | ✓ VERIFIED | Both present; migrations 0006/0007 applied to remote Sepolia DB (runbook Outputs-to-record confirmed via `\d`). |
| `packages/subgraph/schema.graphql` + `src/call-registry.ts` | Call.statement templated mirror | ✓ VERIFIED | Field + templateStatement(); subgraph tests green (prior). |
| `packages/subgraph/scripts/verify-event-coverage.ts` | ~20-event coverage + <30s lag | ✓ VERIFIED (live run by verifier) | Re-run against v0.9.0 `--seeded-call-id 14` → exit 0; CallCreated indexed 266ms. |
| `apps/web/app/leaderboard/{page,LeaderboardClient}.tsx` | Leaderboard surface | ✓ VERIFIED | Full UI-12/13 layout; D-06 globalRep sort. |
| `apps/web/app/profile/[address]/ProfileClient.tsx` | Profile Overview | ✓ VERIFIED | All 5 sections. |
| `apps/web/app/new/page.tsx` | Quote composer | ✓ VERIFIED | ?quote= mode + success screen. |
| `apps/web/app/call/[id]/layout.tsx` + `middleware.ts` | og:image meta + public carve-out | ✓ VERIFIED | Live `/call/1` curl: og:image `?v=0` + summary_large_image; PUBLIC_PREFIXES. |
| `packages/shared/src/constants/addresses.ts` (SUBGRAPH_URL_SEPOLIA) | v0.9.0 bump | ✓ VERIFIED | Line 309 = v0.9.0 query URL (commit 1b0f9ff). |
| `apps/web/vercel.json` | git auto-deploy build fix | ✓ VERIFIED | buildCommand builds `@call-it/shared` before web (commit 588a629); Vercel git auto-deploy green; live origin serves all routes 200. |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| eslint.config.js | no-display-grid-in-og.js | plugin wiring scoped to app/og | ✓ WIRED (verifier: eslint app/og exit 0) |
| og/[callId]/route.ts | relayer marketLine + subgraph Settlement/RepEvent | fetch + GraphQL | ✓ WIRED |
| auto-post-worker.ts | OG HEAD probe + postTweet + warpcastComposeUrl | cache-warm → key-gated post → cast URL | ✓ WIRED |
| index.ts | auto-post-worker.ts | startAutoPostWorker() at startup | ✓ WIRED |
| call/[id]/layout.tsx | /og/{id}?v={statusVersion} | generateMetadata og:image | ✓ WIRED (live curl) |
| duel/[challengeId]/layout.tsx | /og/duel/{id}?v={ordinal} | generateMetadata og:image (NEW) | ✓ WIRED (live curl /duel/1 → /og/duel/1?v=1) |
| og-thumbnail-200px.spec.ts | seeded call 8/11/14 + committed baselines | toHaveScreenshot snapshots | ✓ WIRED (4 PNGs committed) |
| addresses.ts SUBGRAPH_URL_SEPOLIA | live v0.9.0 endpoint | query URL constant | ✓ WIRED (coverage exit 0) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Grid-lint passes on real OG sources | `eslint app/og` (verifier re-ran) | exit 0 | ✓ PASS |
| Subgraph coverage + OPS-04 sync-lag (live) | `node verify-event-coverage.ts --endpoint <v0.9.0> --seeded-call-id 14` (verifier re-ran) | exit 0; CallCreated id=14 indexed 266ms; 7 core paths OK, 8 rare WARN | ✓ PASS |
| Live receipt card meta | `curl /call/1` (verifier) | `summary_large_image` + `og:image .../og/1?v=0` | ✓ PASS |
| Live duel card meta (DuelSettled fix) | `curl /duel/1` (verifier) | `summary_large_image` + `og:image .../og/duel/1?v=1` | ✓ PASS |
| Live OG image endpoints | `curl /og/{1,duel/1,fallback,14,14?as=fader}` (verifier) | all 200 image/png | ✓ PASS |
| 200px outcome-word baselines committed | `ls *-snapshots/` | 4 PNGs (CALLED-IT, COLD-CALL, LOUD-AND-WRONG, FADED-CORRECTLY) | ✓ PASS (4/5) |
| CONTRARIAN HIT 200px baseline | test.skip(deferred) | code-gap deferral (route fadeRealShare:0) | ⤳ DEFERRED (follow-up) |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| OPS-04 | Subgraph indexes CallCreated within ~30s | ✓ SATISFIED | Verifier re-ran coverage: CallCreated id=14 indexed 266ms (<30s). |
| SHARE-01 | 1200×630 PNG cards via Satori/@vercel/og | ✓ SATISFIED | All OG endpoints 200 image/png live; dimension assertions unconditional. |
| SHARE-02 | OG hosted at api.callitapp.xyz | ⤳ DEFERRED (Phase 10) | D-01 — Sepolia uses Vercel origin; mainnet domain cutover Phase 10. |
| SHARE-03 | CDN cache + regen on state change | ✓ SATISFIED | Cache-Control max-age=60 + ?v={statusVersion} regen. |
| SHARE-13 | Twitter Card check | ✓ SATISFIED | Card meta confirmed live by curl on /call + /duel; browser preview operator-confirmed (cards-dev validator dead since 2022; opengraph.xyz/X-composer used). |
| SHARE-14 | Receipt server-renders OG meta | ✓ SATISFIED | Live curl /call/1: og:image + summary_large_image. |
| SHARE-15 | Share button Twitter intent URL | ✓ SATISFIED | twitterIntentUrl in composer + receipt Share button. |
| SHARE-16 | Auto-post default-ON toggle | ✓ SATISFIED | AUTO_POST_ENABLED default-ON; non-destructive OFF. |
| SHARE-17 | Auto-post never modifies X beyond posting | ✓ SATISFIED | x-write-client only POST /2/tweets; key-gated. |
| SHARE-18 | Farcaster cast URL parallel | ✓ SATISFIED | warpcastComposeUrl in worker + builders. |
| SHARE-20 | Off-chain OG referenced on-chain by hash, not NFTs | ✓ SATISFIED | No mint code in OG/receipt paths. |
| SHARE-21 | Receipt loads without auth + sign-in CTA | ✓ SATISFIED | middleware PUBLIC_PREFIXES; incognito hydration operator-confirmed. |
| UI-09 | Profile Overview tab | ✓ SATISFIED | ProfileClient 5 sections. |
| UI-12 | Leaderboard page | ✓ SATISFIED | LeaderboardClient full layout. |
| UI-13 | Leaderboard table + viewer-row highlight | ✓ SATISFIED | Viewer-row highlight. |
| UI-26 | Quote composer parent context card | ✓ SATISFIED | new/page.tsx ?quote= parent card. |
| UI-27 | THESIS textarea above market-type buttons | ✓ SATISFIED | Confirmed in composer. |
| UI-28 | Quote success screen + thread preview | ✓ SATISFIED | quotePosted success state. |

### Locked Decisions (D-01..D-08) Honored

| Decision | Honored | Evidence |
|----------|---------|----------|
| D-01 defer DN publish to Phase 10 | ✓ | v0.9.0 on Sepolia Studio only; runbook scope guard; addresses.ts comment. |
| D-02 build full auto-post, gate write on key presence | ✓ | x-write-client degrade-to-no-op; full cache-warm mechanism. |
| D-03 statement from subgraph Call field + settled stats from events | ✓ | resolveStatement chain; settled fields from Settlement/RepEvent. |
| D-04 deploy apps/web to Vercel + Fly CORS allowlist | ✓ | Live at call-it-web-sepolia.vercel.app; CORS exact origin (204, not *). |
| D-05 relayer-authoritative statement + subgraph templated mirror | ✓ | call_statement column + live-state marketLine + templateStatement() mirror. |
| D-06 All-time live + 7d/30d documented limitation | ✓ | globalRep sort; toggles wired, v1 limitation documented. |
| D-07 auto-post default-ON, reconciled with Phase-4 runbook | ✓ | Default-ON after cache-warm + AUTO_POST_DELAY_MS. |
| D-08 Twitter Card Validator = operator checklist not CI | ✓ | Runbook Step 6 checklist; executed — card meta live + browser preview operator-confirmed. |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| apps/web/app/og/[callId]/route.ts:862 | `fadeRealShare: 0` hardcode | ⚠️ Warning (tracked follow-up) | Blocks CONTRARIAN HIT outcome word from ever rendering. Documented with inline comment + runbook deferral + test.skip. Not a silent stub — it is an explicitly tracked code-gap follow-up. Does not block the Phase 7 goal (other 4 outcome words render + baseline). |
| apps/web/app/og/[callId]/route.ts:852 | `// Phase 7 will wire full subgraph lookup` comment | ℹ️ Info | Stale comment; the settled-fields subgraph lookup IS wired (realRepDelta from settledFields). Cosmetic only. |
| apps/web/app/new/hooks/usePublishCall.ts:138 | `TODO: Re-submit userOp with paymasterAndData` | ℹ️ Info | Pre-existing Phase-1 AA-client note, not Phase-7-modified, not in share-loop critical path. |
| apps/web/tests/visual-smoke.spec.ts:94 | `test.use({ reducedMotion })` type error | ℹ️ Info (pre-existing, out of scope) | Phase-1 (2026-05-22) Playwright type error; excluded from `next build` (deploy path builds clean on Vercel). Not Phase 7; does not count against it. |

No blocking debt markers (TBD/FIXME/XXX) in Phase-7-authored files. The `fadeRealShare:0` hardcode is the one tracked code-gap follow-up (CONTRARIAN HIT) and is documented, not silent.

### Human Verification Required

None remaining. All prior human-verification items are closed:

1. **Twitter Card check (5 variants)** — CLOSED. Card meta confirmed live by verifier curl on `/call/1` + `/duel/1` (`summary_large_image` + absolute og:image); all OG images 200 image/png; browser visual preview operator-confirmed (runbook Outputs-to-record). The legacy cards-dev.twitter.com/validator was shut down by X in 2022; opengraph.xyz / X-composer used as the modern equivalent.
2. **SC1 200px baselines + authoritative coverage run** — CLOSED. 4/5 baselines committed + legible; verifier independently re-ran verify-event-coverage.ts (exit 0, CallCreated 266ms). CONTRARIAN HIT carried as a tracked code-gap follow-up.
3. **Incognito visual hydration** — CLOSED. Operator-confirmed (CORS preflight 204 exact-origin + page 200s, no hydration-error markers). Unblocks parked Phase-4 UAT-1/2/3.

### Gaps Summary

**No blocking gaps.** Every SC artifact exists, is substantive, is wired, compiles, and passes its automated tests; the live Sepolia deploy is re-verified by the verifier directly against the deployed app (`/call/1`, `/duel/1`, `/og/*`) and the live v0.9.0 subgraph (coverage exit 0, CallCreated 266ms). The three residuals that held the prior `needs-review` are closed.

One tracked follow-up remains: the **CONTRARIAN HIT** 200px baseline cannot be produced until the OG route wires `fadeRealShare` from subgraph fade/follow positions (route.ts:862 hardcodes `fadeRealShare:0`; outcome-word.ts:89 gate is `>=0.5`). This is a genuine code-gap follow-up — documented in the runbook, in the spec file, and in code — and per the re-verification instruction the documented deferral is accepted; SC1 is judged met at 4/5 outcome words. The two ROADMAP-literal items (DN publish, api.callitapp.xyz) remain decision-deferred to Phase 10 by the locked D-01 and are not gaps.

---

_Verified: 2026-06-08T17:30:00Z_
_Verifier: Claude (gsd-verifier) — re-verification after residual closure_
