---
phase: 07-og-service-final-variants-subgraph-final-mappings
verified: 2026-06-08T10:05:00Z
status: needs-review
score: 5/5 success-criteria substantively delivered (SC1 partial — 200px gate not yet executed)
overrides_applied: 0
human_verification:
  - test: "Twitter Card Validator on the 5 variant receipt URLs (SHARE-13, D-08)"
    expected: "Each of Live / Settled / DuelSettled / CallerExited / Fallback receipt URLs returns a passing card preview + og:image render at cards-dev.twitter.com/validator"
    why_human: "Browser-only operator checklist (D-08, intentionally NOT a CI gate) — needs a public URL and is not cleanly scriptable. Runbook Step 6 is unchecked."
  - test: "SC1 200px outcome-word readability baselines + authoritative verify-event-coverage.ts run (OPS-04 live confirm)"
    expected: "OG_200PX_BASELINES=1 run of og-thumbnail-200px.spec.ts passes for all 5 outcome words against committed baselines; verify-event-coverage.ts --endpoint <v0.9.0> --seeded-call-id <id> exits 0 with all core events indexed + CallCreated <30s"
    why_human: "Both need a fresh seeded settled-call run on the deployed Sepolia app to generate authoritative baselines + exercise the indexer. The harness + script exist and pass structurally; the live data run is operator-gated."
  - test: "Incognito visual hydration spot-check on the deployed Sepolia app"
    expected: "In an incognito window (no Privy session) /call/[id], /leaderboard, /profile/[address] hydrate with no CORS error in console"
    why_human: "CORS preflight (204, exact origin) + page 200s are already curl-confirmed; the in-browser hydration visual confirmation is operator-pending (unblocks Phase-4 UAT-1/2/3)."
deferred:
  - truth: "Subgraph published to The Graph Decentralized Network on Arbitrum (~3,000 GRT) — ROADMAP SC3 literal wording"
    addressed_in: "Phase 10"
    evidence: "D-01 (locked CONTEXT decision): DN publish needs live mainnet contracts which do not exist until Phase 10. Phase 7 finalizes + verifies ALL ~20 event mappings on the existing Sepolia Studio subgraph (v0.8.0 → v0.9.0). ROADMAP Phase 10 detail places DN publish + api.callitapp.xyz cutover there. This is an intentional decision-driven narrowing, not a gap."
  - truth: "OG service hosted at api.callitapp.xyz/og/[callId] (SHARE-02 literal wording)"
    addressed_in: "Phase 10"
    evidence: "D-01 / CONTEXT Deferred: mainnet OG domain cutover is Phase 10. Sepolia serves OG from the Vercel origin via NEXT_PUBLIC_OG_BASE_URL (D-12). The OG service itself is fully built + live on the Vercel origin."
---

# Phase 7: OG service final variants + Subgraph final mappings — Verification Report

**Phase Goal:** All 5 OG card variants finalized (Live, Settled, DuelSettled, CallerExited, Fallback) via @vercel/og + Satori on Node runtime (flexbox only, CI grid-lint, 200px readability gate); subgraph event mappings finalized + verified on the Sepolia Studio subgraph (DN publish deferred to Phase 10); auto-post-to-X/Farcaster gated by cache-warm verification; Profile Overview / Leaderboard / Quote Composer pages built; apps/web deployed to Vercel (call-it-web-sepolia). Closes critical-path steps 6/8/9/10.

**Verified:** 2026-06-08
**Status:** needs-review
**Re-verification:** No — initial verification

## Goal Achievement

The code spine of the share loop is real, substantive, wired, and compiles/tests green. The live Sepolia deploy is done and curl-smoke-verified. Three known residuals — all browser/seeded-data-gated and explicitly recorded as such in the deploy runbook — keep the phase from a clean `passed`: they are the same operator-gated items the project's standard "documented residual" framing covers. None is a silent failure; each is enumerated below.

### Observable Truths (Success Criteria)

| # | Success Criterion | Status | Evidence |
|---|-------------------|--------|----------|
| SC1 | 5 OG variants render 1200×630 PNG on Node runtime; CI grid-lint rejects `display:grid`; 200px readability gate passes for 5 outcome words; Twitter Card Validator passes | ⚠️ PARTIAL | grid-lint VERIFIED real gate (eslint exit 0 on `app/og`; planted `display:'grid'`+`gridTemplateColumns` → 2 errors, exit 1). All OG routes compile (`/og/[callId]`, `/og/duel/[challengeId]`, `/api/og/[callId]`, `/api/og/fallback`) and declare `runtime='nodejs'`. 1200×630 dimension assertions run unconditionally in og-thumbnail-200px.spec.ts. **GAP:** the 200px outcome-word legibility block is `test.skip` gated on `OG_200PX_BASELINES=1` with placeholder callIds + NO committed baselines (only `visual-smoke` snapshots exist). Twitter Card Validator is operator-pending (D-08, browser-only). |
| SC2 | Auto-post fires on settle ONLY after cache-warm verification (?v= regen → HEAD 200 + ETag); ≤30s retry; Farcaster cast parallel; never modifies X beyond posting | ✓ VERIFIED | auto-post-worker.ts (506 ln): cache-warm HEAD probe asserts 200 + X-Variant∈{settled,caller-exited} + stable ETag before posting; AUTO_POST_DELAY_MS Pitfall-18 gate; retry budget (≤30s, SHARE-03); posted_receipts onConflictDoNothing dedup; warpcastComposeUrl parallel. x-write-client.ts key-gated degrade-to-no-op (returns `{posted:false,reason:'no_key'}`, never throws). X_API_WRITE_TOKEN on pino redact list. Wired into relayer startup (index.ts:337). Relayer tests 208 passed. |
| SC3 | Subgraph event mappings finalized + all ~20 §12.1–12.5 events indexed; CallCreated <30s; polled-events fallback live (DN publish deferred per D-01) | ✓ VERIFIED (Sepolia Studio; DN deferred to Phase 10 per D-01) | `Call.statement` field added to schema.graphql; `templateStatement()` populated in handleCallCreated (call-registry.ts); subgraph tests green (7 passed). verify-event-coverage.ts enumerates all 23 SC3 events with core-path hard-fail + rare-path WARN + <30s sync-lag probe. SUBGRAPH_URL_SEPOLIA bumped to v0.9.0 (committed `1b0f9ff`); published to Sepolia Studio 2026-06-08, `_meta` block 275026674 hasIndexingErrors:false. **Note:** authoritative coverage-script run against live v0.9.0 with a fresh seeded callId is operator-pending (see residual #2). DN publish intentionally deferred (D-01). |
| SC4 | Profile Overview (5-stat + CATEGORY REPUTATION + RECENT CALLS + MOST FOLLOWED BY + NOTABLE RECEIPTS); Leaderboard (title/toggle/#1 hero+watermark/chips/viewer-row); Quote Composer + success screen | ✓ VERIFIED | ProfileClient.tsx renders all 5 Overview sections (Accuracy/Calibration/ROI/Contrarian hits/Streak + CATEGORY REPUTATION). LeaderboardClient.tsx renders "The Tape"/"Top of book", 7D/30D/All-time toggle, #1 hero card with "01" watermark, All/Majors/DeFi/Other chips, viewer-row highlight; D-06 All-time-backed toggles with documented v1 limitation. new/page.tsx `?quote=` mode: parent card + THESIS-above-buttons + success thread + Share button (SHARE-15). All routes compile; flexbox-only. |
| SC5 | Receipt server-renders og:image meta with ?v={statusVersion}; receipts off-chain by hash (not NFTs); public no-auth load with sign-in CTA | ✓ VERIFIED | call/[id]/layout.tsx generateMetadata injects og:image `/og/{id}?v={statusVersion}` + twitter:card; statusVersion from live-state. middleware.ts PUBLIC_PREFIXES includes /call /duel /profile /leaderboard (no-auth). receipt-meta.spec.ts asserts meta + public 200. No NFT mint code in OG/receipt paths (SHARE-20). Live smoke: /feed 200, /leaderboard 200, fallback OG 200 image/png. |

**Score:** 5/5 success criteria substantively delivered; SC1 marked PARTIAL because its 200px-readability and Twitter-Card-Validator sub-gates are not yet executed (operator/seeded-data-gated).

### Deferred Items (decision-driven, addressed in later phases)

| # | Item | Addressed In | Evidence |
|---|------|--------------|----------|
| 1 | DN-publish of subgraph (ROADMAP SC3 literal "Decentralized Network on Arbitrum") | Phase 10 | D-01 locked decision — DN needs mainnet contracts; Phase 7 finalizes mappings on Sepolia Studio v0.9.0. ROADMAP Phase 10 detail owns DN publish. |
| 2 | OG domain `api.callitapp.xyz` (SHARE-02 literal) | Phase 10 | D-01 / CONTEXT Deferred — mainnet domain cutover is Phase 10; Sepolia uses Vercel origin via NEXT_PUBLIC_OG_BASE_URL. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/eslint-rules/no-display-grid-in-og.js` | AST grid-ban rule | ✓ VERIFIED | Real `Property`-node rule; flags `display:'grid'` + `grid*` props; wired into eslint.config.js scoped to OG files; proven to fail on planted violation. |
| `apps/web/lib/share-text.ts` + `packages/shared/src/share/share-text.ts` | twitterIntentUrl/warpcastComposeUrl/buildShareText | ✓ VERIFIED | Builders live in @call-it/shared; web file is a thin re-export. Consumed by web Share button + relayer auto-post. |
| `apps/web/app/og/[callId]/route.ts` | Live/Settled/CallerExited real-data cards | ✓ VERIFIED | resolveStatement chain (marketLine → subgraph mirror → generic); P&L/REP/FINAL/TARGET wired from Settlement.priceDelta/finalPrice + RepEvent.delta. `Call #N` demoted to last-resort fallback. |
| `apps/web/app/og/duel/[challengeId]/route.ts` | DuelSettled real settled fields | ✓ VERIFIED | getDuelSettledFields() subgraph read; WINS/pot/paired rep deltas wired (D-11 Phase 4 fill). |
| `apps/relayer/src/workers/auto-post-worker.ts` | cache-warm + key-gate + retry + dedup | ✓ VERIFIED | See SC2. Wired into index.ts startup. |
| `apps/relayer/src/lib/x-write-client.ts` | key-gated no-op postTweet | ✓ VERIFIED | Never throws; redacted token. |
| `apps/relayer/src/db/schema.ts` (call_statement + posted_receipts) | enrichment + dedup tables | ✓ VERIFIED | Both tables present; migrations 0006/0007 exist + applied to remote Sepolia DB (runbook confirmed). |
| `packages/subgraph/schema.graphql` + `src/call-registry.ts` | Call.statement templated mirror | ✓ VERIFIED | Field + templateStatement() populate; subgraph tests green. |
| `packages/subgraph/scripts/verify-event-coverage.ts` | ~20-event coverage + <30s lag | ✓ VERIFIED (built) / ⚠️ live-run pending | 23 events enumerated; configurable endpoint; core hard-fail. Authoritative live run pending seeded data (residual #2). |
| `apps/web/app/leaderboard/{page,LeaderboardClient}.tsx` + lib/leaderboard-client.ts | Leaderboard surface | ✓ VERIFIED | Compiles; D-06 globalRep sort; full UI-12/13 layout. |
| `apps/web/app/profile/[address]/ProfileClient.tsx` | Profile Overview | ✓ VERIFIED | All 5 sections. |
| `apps/web/app/new/page.tsx` | Quote composer | ✓ VERIFIED | ?quote= mode + success screen. |
| `apps/web/app/call/[id]/layout.tsx` + `middleware.ts` | og:image meta + public carve-out | ✓ VERIFIED | ?v={statusVersion}; PUBLIC_PREFIXES. |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| eslint.config.js | no-display-grid-in-og.js | plugin wiring scoped to app/og | ✓ WIRED (proven: planted grid → exit 1) |
| og/[callId]/route.ts | relayer marketLine + subgraph Settlement/RepEvent | fetch + GraphQL | ✓ WIRED |
| live-state.ts | criteria-store.ts | resolveCallStatement → marketLine | ✓ WIRED |
| auto-post-worker.ts | OG HEAD probe + postTweet + warpcastComposeUrl | cache-warm → key-gated post → cast URL | ✓ WIRED |
| index.ts | auto-post-worker.ts | startAutoPostWorker() at startup | ✓ WIRED |
| call/[id]/layout.tsx | /og/{id}?v={statusVersion} | generateMetadata og:image | ✓ WIRED |
| leaderboard/page.tsx | leaderboard-client.ts getLeaderboard | server-fetch → client renderer | ✓ WIRED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Grid-lint passes on real OG sources | `eslint app/og` | exit 0 | ✓ PASS |
| Grid-lint fails on planted violation | `eslint __grid_probe.ts` (display:grid + gridTemplateColumns) | 2 errors, exit 1 | ✓ PASS |
| Relayer suite (incl. auto-post worker) | `pnpm --filter @call-it/relayer test` | 208 passed, 1 skipped (env-gated KMS) | ✓ PASS |
| Subgraph suite (incl. call-statement mapping) | `pnpm --filter @call-it/subgraph test` | 7 passed | ✓ PASS |
| Web build compiles all Phase-7 routes | `pnpm --filter @call-it/web build` | exit 0; /leaderboard /new /call/[id] /og/[callId] /og/duel/[challengeId] emitted | ✓ PASS |
| 200px outcome-word readability (5 words) | `OG_200PX_BASELINES=1 playwright test og-thumbnail-200px.spec.ts` | not runnable — placeholder callIds + no committed baselines | ✗ SKIP → human (residual #2) |
| Twitter Card Validator (5 variants) | browser cards-dev.twitter.com/validator | operator-pending | ? SKIP → human (residual #1) |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| OPS-04 | Subgraph indexes CallCreated within ~30s | ⚠️ NEEDS HUMAN | Coverage script + <30s probe built; live run pending fresh seed. REQUIREMENTS.md still `[ ]`. |
| SHARE-01 | 1200×630 PNG cards via Satori/@vercel/og | ✓ SATISFIED | Dimension assertions run unconditionally; routes compile on Node runtime. |
| SHARE-02 | OG hosted at api.callitapp.xyz | ⤳ DEFERRED (Phase 10) | D-01 — Sepolia uses Vercel origin; mainnet domain cutover Phase 10. OG service itself live. |
| SHARE-03 | CDN cache + regen on state change | ✓ SATISFIED | Cache-Control max-age=60 + ?v={statusVersion} regen. |
| SHARE-13 | Twitter Card Validator smoke | ⚠️ NEEDS HUMAN | D-08 operator checklist; runbook Step 6 unchecked. REQUIREMENTS.md `[ ]`. |
| SHARE-14 | Receipt server-renders OG meta | ✓ SATISFIED (code) / live-spot-check pending | generateMetadata + receipt-meta.spec.ts. REQUIREMENTS.md `[ ]` pending live incognito confirm. |
| SHARE-15 | Share button Twitter intent URL | ✓ SATISFIED | twitterIntentUrl in composer + receipt Share button. |
| SHARE-16 | Auto-post default-ON toggle | ✓ SATISFIED | AUTO_POST_ENABLED default-ON; non-destructive OFF. |
| SHARE-17 | Auto-post never modifies X beyond posting | ✓ SATISFIED | x-write-client only POST /2/tweets; key-gated. |
| SHARE-18 | Farcaster cast URL parallel | ✓ SATISFIED | warpcastComposeUrl in worker + builders. |
| SHARE-20 | Off-chain OG referenced on-chain by hash, not NFTs | ✓ SATISFIED | No mint code in OG/receipt paths. |
| SHARE-21 | Receipt loads without auth + sign-in CTA | ✓ SATISFIED (code) / live-spot-check pending | middleware PUBLIC_PREFIXES; live /leaderboard 200. REQUIREMENTS.md `[ ]` pending incognito confirm. |
| UI-09 | Profile Overview tab | ✓ SATISFIED | ProfileClient 5 sections. |
| UI-12 | Leaderboard page | ✓ SATISFIED | LeaderboardClient full layout. |
| UI-13 | Leaderboard table + viewer-row highlight | ✓ SATISFIED | Viewer-row #1A1A24 + accent border. |
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
| D-06 All-time live + 7d/30d documented limitation | ✓ | globalRep sort; toggles wired, v1 limitation documented in LeaderboardClient. |
| D-07 auto-post default-ON, reconciled with Phase-4 runbook | ✓ | No on-chain claim-delay → default-ON after cache-warm + AUTO_POST_DELAY_MS. |
| D-08 Twitter Card Validator = operator checklist not CI | ✓ | Runbook Step 6 checklist; not in CI. (Execution pending — residual #1.) |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| apps/web/app/new/hooks/usePublishCall.ts:138 | `TODO: Re-submit userOp with paymasterAndData` | ℹ️ Info | Pre-existing Phase-1 AA-client wiring note, not Phase-7-modified, not in the share-loop critical path. Not a Phase 7 gate. |
| og duel/[callId] route comments | `$X,XXX` matched TBD/XXX regex | ℹ️ Info (false positive) | Currency format strings in doc comments — not debt markers. |

No blocking debt markers (TBD/FIXME/XXX) in Phase-7-authored files. No stubs in the shipped OG/receipt data paths — the `Call #N` and `—` stubs are demoted to last-resort fallbacks behind real relayer+subgraph reads.

### Human Verification Required

1. **Twitter Card Validator (5 variants)** — Run Live / Settled / DuelSettled / CallerExited / Fallback receipt URLs through cards-dev.twitter.com/validator (D-08, SHARE-13). Expected: passing card preview + og:image render. Runbook Step 6.
2. **SC1 200px baselines + authoritative coverage run** — Seed settled calls (one per outcome word) on the deployed app, generate + commit 200px baselines (`OG_200PX_BASELINES=1 ... --update-snapshots`), and run `verify-event-coverage.ts --endpoint <v0.9.0> --seeded-call-id <id>` to exit 0 (OPS-04 live confirm).
3. **Incognito visual hydration** — Load /call/[id], /leaderboard, /profile/[address] in an incognito window; confirm hydration with no console CORS error (CORS preflight + 200s already curl-confirmed).

### Gaps Summary

There are **no implementation gaps** — every SC artifact exists, is substantive, is wired, compiles, and passes its automated tests; the live Sepolia deploy is done and curl-smoke-verified. The phase falls short of a clean `passed` only on three **execution/verification residuals that are inherently operator- or seeded-data-gated** and are explicitly documented as PENDING in `docs/operator/phase-7-deploy-runbook.md` (Outputs-to-record section): (1) Twitter Card Validator (SHARE-13, browser-only, D-08), (2) the SC1 200px outcome-word readability baselines + authoritative live `verify-event-coverage.ts` run (OPS-04 live confirm), and (3) the incognito visual hydration spot-check. Per the instructions these are treated as known PARTIAL/pending items, not silent failures — hence `status: needs-review` rather than forced `passed`. The two ROADMAP-literal items (DN publish, api.callitapp.xyz) are decision-deferred to Phase 10 by the locked D-01 and are NOT counted as gaps.

---

_Verified: 2026-06-08T10:05:00Z_
_Verifier: Claude (gsd-verifier)_
