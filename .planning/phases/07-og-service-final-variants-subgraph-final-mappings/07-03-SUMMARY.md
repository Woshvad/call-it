---
phase: 07-og-service-final-variants-subgraph-final-mappings
plan: 03
subsystem: web (OG service)
tags: [vercel-og, satori, subgraph, relayer-client, marketLine, settlement, repevent, d-03, d-05, share-01, sc1]

# Dependency graph
requires:
  - phase: 07-02
    provides: relayer live-state marketLine (D-05) + subgraph Call.statement templated mirror (D-03)
  - phase: 07-01
    provides: env-gated 200px og-thumbnail spec scaffold + no-display-grid eslint rule
provides:
  - getMarketLine + getSettledFields (call) + getDuelSettledFields (duel) helpers in relayer-client
  - og/[callId] Live/Settled/CallerExited cards reading real statement + settled stats (D-03)
  - og/duel/[challengeId] DuelSettled card reading real rep deltas + statement (D-03)
  - SHARE-01 1200x630 PNG-dimension assertions for the wired Live/Settled/DuelSettled variants
affects: [07-04-auto-post-worker, 07-05-share-button, 07-06-deploy-seed]

# Tech tracking
tech-stack:
  added: []  # zero new packages — @vercel/og 0.11.1 + Playwright built-in only
  patterns:
    - "OG real-data wiring: relayer marketLine (D-05) -> subgraph Call.statement mirror (D-03) -> generic safe string; never crash"
    - "Fail-safe subgraph reads: getSettledFields/getDuelSettledFields return all-null (never throw) so cards degrade to em-dash, not 500 (SHARE-10)"
    - "RPC stays the freshness source for status/outcome (Pitfall 8); subgraph supplies display fields only"
    - "SHARE-01 dimension gate via PNG IHDR read (buffer.readUInt32BE(16/20)) mirroring og-fallback Test 1 — runs unconditionally, no seeded data needed"

key-files:
  created:
    - apps/web/tests/og-real-data-wiring.test.ts
  modified:
    - apps/web/app/og/[callId]/route.ts
    - apps/web/app/og/duel/[challengeId]/route.ts
    - apps/web/lib/relayer-client.ts
    - apps/web/tests/og-thumbnail-200px.spec.ts

key-decisions:
  - "Settled-stat fetch in the web OG route reads the subgraph directly via NEXT_PUBLIC_SUBGRAPH_URL (the public Studio query URL), not through the relayer. The OG route is a Node-runtime Route Handler running server-side; the privileged Studio key stays relayer-side (D-27 respected — only the public query URL is used). marketLine still comes from the relayer (D-05)."
  - "fadeRealShare stays 0 in getOutcomeWordResult — the settled fade pool is not available post-settlement on-chain and is not a subgraph entity field; the §14.1 word/color is driven by callerWon + the real RepEvent.delta. CONTRARIAN HIT (fade-share path) remains best-effort until a fade-share subgraph field exists (pre-existing WR-04/06 gap, not introduced here)."
  - "200px outcome-word baselines NOT generated — no seeded settled-call IDs are reachable (relayer is localhost:8080, subgraph URL is reachable but the cluster has no seeded settled calls mapped to each outcome word). Per the plan's <note_on_200px_baselines>, baselines were NOT fabricated; the 200px block stays env-gated (OG_200PX_BASELINES=1), and the authoritative readability run is deferred to 07-06 (deploy+seed). The SHARE-01 1200x630 assertion was still added (it needs only that the routes render)."
  - "Oracle price scale assumed 1e8 for finalPrice/priceDelta/targetValue formatting (Pyth/SettlementManager convention). Values render as $X,XXX.XX; absent fields render em-dash."

requirements-completed: [SHARE-01, SHARE-02, SHARE-03]
requirements-partial: [SHARE-20]  # verified no NFT-mint regression (negative requirement — nothing to add)

# Metrics
duration: ~12min
completed: 2026-06-07
---

# Phase 7 Plan 03: OG Real-Data Wiring (statement + settled stats + DuelSettled) Summary

**All OG card variants now render real data — the statement comes from the relayer `marketLine` (D-05) with the subgraph `Call.statement` templated mirror as fallback (D-03); settled stats (P&L / REP CHANGE / FINAL / TARGET) come from subgraph `Settlement.priceDelta/finalPrice` + `RepEvent.delta`; the DuelSettled card shows real per-participant rep deltas + the underlying call statement — with the SHARE-01 1200×630 PNG-dimension gate now covering the wired Live/Settled/DuelSettled variants, not just the inherited fallback.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-07T20:51:26Z
- **Completed:** 2026-06-07T21:03:04Z
- **Tasks:** 2 (Task 1 `tdd="true"`)
- **Files modified:** 5 (1 created test, 4 modified)

## Accomplishments

- **Task 1 (D-03, `tdd`) — og/[callId] real statement + settled stats:**
  - Added `getMarketLine(callId)` (fetches `/api/calls/:id/live-state`, returns authoritative `marketLine`, null on outage/absent — D-05) and `getSettledFields(callId)` (subgraph `Call.statement` + `Settlement.finalPrice/priceDelta` + `RepEvent.delta`, all-null on any error — SHARE-10) to `relayer-client.ts`.
  - Replaced the `Call #${callIdStr}` statement stub with `resolveStatement(marketLine → subgraph statement → generic)`; replaced the four `—` settled-stat stubs with `Settlement.priceDelta`-derived P&L, `RepEvent.delta`-derived REP CHANGE, `Settlement.finalPrice` FINAL, and on-chain `targetValue` TARGET (1e8 oracle-scale formatting).
  - Fed the real `RepEvent.delta` into `getOutcomeWordResult()`; wired the CallerExited card's rep impact from `RepEvent.delta` (falling back to the documented `-35 REP` baseline).
  - Preserved untouched: the RPC `status`/`outcome` freshness read (Pitfall 8), `getOutcomeWordResult()` §14.1 colors, `export const runtime = 'nodejs'`, cache + `X-Variant` headers, `renderFallback` on throw (SHARE-10).
- **Task 2 (D-03, SC1, SHARE-01) — DuelSettled wiring + dimension gate:**
  - Added `getDuelSettledFields(callId, caller, challenger)` (subgraph `Call.statement/asset` + per-participant `RepEvent.delta`) to `relayer-client.ts`.
  - Duel route: real `callerRepDelta`/`challengerRepDelta` from `RepEvent` (replacing the `+REP`/`-REP` placeholder), real `callQuestion` from the subgraph statement + `assetPair` from `Call.asset` (replacing `Duel #N`). The pre-existing real winner/pot/opacity wiring (Phase-4 stub-fill) was retained.
  - `og-thumbnail-200px.spec.ts`: added an **unconditional** SHARE-01 block asserting the wired Live, Settled, and DuelSettled OG routes return `image/png` whose PNG IHDR decodes to width=1200 height=630 (mirroring `og-fallback.spec.ts` Test 1), plus an `X-Variant` allow-list per route (real card OR SHARE-10 fallback — both 1200×630). The 200px outcome-word legibility block stays env-gated (see Known Stubs / deferral).

## Task Commits

1. **RED — failing source-assertion test for OG real-data wiring** — `cadf558` (test)
2. **Task 1: wire og/[callId] statement + settled stats (D-03)** — `a386543` (feat)
3. **Task 2: wire DuelSettled rep deltas + statement; add SHARE-01 1200×630 assertions** — `f5167f8` (feat)

## Verification Results

- **eslint `app/og` (no-display-grid gate):** exits 0 (flexbox only; no `display:'grid'`).
- **`pnpm --filter @call-it/web build`:** exits 0 (all OG routes compile; `/og/[callId]` + `/og/duel/[challengeId]` listed).
- **`og-real-data-wiring.test.ts` (new, vitest):** RED 5/8 fail → GREEN 8/8 pass.
- **`og-unit.test.ts` (vitest):** 13/13 pass.
- **`og-fallback.spec.ts` (playwright, fresh prod server):** 5/5 pass.
- **`og-thumbnail-200px.spec.ts` (playwright):** SHARE-01 dimension assertions 3/3 pass (Live, Settled, DuelSettled all 1200×630 PNG); 200px legibility 5/5 skipped (env-gated, pending 07-06 seed).
- **SHARE-20 (no NFT mint regression):** grep `mint|safeMint|tokenURI|ERC721` across `apps/web/app/og` → 0 matches.

## Decisions Made

1. **Web OG route reads the subgraph directly via the public `NEXT_PUBLIC_SUBGRAPH_URL`** (the Studio query URL), not through the relayer. The OG route is server-side (Node runtime); only the public query URL is used, so the privileged Studio API key stays relayer-side (D-27 intact). `marketLine` still comes from the relayer (D-05).
2. **`fadeRealShare` left at 0** in `getOutcomeWordResult` — there is no settled fade-share subgraph field (pre-existing WR-04/06 schema gap), so the CONTRARIAN HIT path remains best-effort; word/color is driven by `callerWon` + the real `RepEvent.delta`. Not a regression introduced by this plan.
3. **Oracle price scale = 1e8** for `finalPrice`/`priceDelta`/`targetValue` formatting (Pyth/SettlementManager convention) → `$X,XXX.XX`; absent fields render em-dash.
4. **200px baselines deferred to 07-06** (deploy+seed), NOT fabricated — see the plan's `<note_on_200px_baselines>` directive.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Subgraph read wired into the web OG route directly, not via a relayer proxy hop**
- **Found during:** Task 1 (locating the settled-field read seam).
- **Issue:** The plan said "reuse the existing relayer-proxy/subgraph-client convention" and keep the subgraph read "server-side per D-27." There is no relayer endpoint that returns `Settlement`/`RepEvent` for an arbitrary callId (the relayer subgraph-client only exposes feed/profile/social queries), and adding one was out of scope. The web OG route is itself server-side.
- **Fix:** `getSettledFields`/`getDuelSettledFields` POST directly to `NEXT_PUBLIC_SUBGRAPH_URL` (the public Studio query URL). D-27 is respected — the privileged Studio key is never used; only the public query endpoint. `marketLine` still routes through the relayer (D-05).
- **Files modified:** `apps/web/lib/relayer-client.ts`
- **Commit:** `a386543`

### Acknowledged plan-vs-reality reconciliations (not code deviations)

- The DuelSettled route already carried real `settled`/`callerIsWinner`/pot/opacity wiring from Phase 4 (04-07 stub-fill); this plan only replaced the remaining placeholder rep-delta + statement/asset stubs. The plan's framing ("settled=false-always", '"VS"/"WINS" stub') described the Phase-3 state, which 04-07 had already advanced.

---

**Total deviations:** 1 auto-fixed (blocking) + 1 acknowledged reconciliation. **Impact:** Necessary for correctness; D-03/D-05/SHARE-01 intent fully delivered. No scope creep.

## Authentication Gates

None — no auth gates encountered. All verification ran against a local production build server.

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| 200px outcome-word baselines (5 PNGs) NOT generated | `apps/web/tests/og-thumbnail-200px.spec.ts` | ~96-126 | No seeded settled-call IDs are reachable (relayer localhost; the live cluster has no settled calls mapped one-per-outcome-word). Per the plan's `<note_on_200px_baselines>`, baselines were NOT fabricated; the SC1 200px block stays env-gated (`OG_200PX_BASELINES=1`). The authoritative readability run is deferred to 07-06 (deploy+seed). The SHARE-01 1200×630 gate (which needs no seeded data) IS added and passing. |
| `fadeRealShare: 0` in settled outcome-word calc | `apps/web/app/og/[callId]/route.ts` | ~settled branch | No settled fade-share subgraph field exists (pre-existing WR-04/06 schema gap). Word/color driven by `callerWon` + real `RepEvent.delta`. CONTRARIAN HIT path best-effort until a subgraph fade-share field is added (future plan). |
| caller-exit `stakeSlashed` = ~50% estimate | `apps/web/app/og/[callId]/route.ts` | CallerExited branch | Exact slash amount needs the on-chain CallerExited event payload (not in `getCall` nor a current subgraph field). Estimate retained; rep impact IS now real (RepEvent.delta when present). |

None of these block this plan's goal (real statement + real settled stats render; SHARE-01 1200×630 gate green). The 200px legibility run is explicitly authorized for post-deploy in 07-06.

## Threat Surface Scan

No new network endpoints or trust boundaries beyond the plan's `<threat_model>`. The new subgraph reads use a fixed project endpoint (`NEXT_PUBLIC_SUBGRAPH_URL`), never a user-supplied URL; callId is numeric-validated (no SSRF — T-07-03-04). Statement strings are length-capped at render (77/87) and Satori renders text not HTML (T-07-03-03). RPC status/outcome freshness preserved (T-07-03-02). No `display:'grid'` (T-07-03-01, eslint-gated). SHARE-20: no NFT mint introduced (grep-clean).

## Next Phase Readiness

- **07-04 / 07-05** (auto-post worker / Share button) can reference the now-real OG cards — the share-loop visual payload is real, not stubbed.
- **07-06** (deploy + seed) closes the 200px legibility gate: seed one settled call per outcome word on a deployed endpoint, set `OG_200PX_BASELINES=1`, run `--update-snapshots`, commit the 5 `og-200-*.png` baselines.

---
*Phase: 07-og-service-final-variants-subgraph-final-mappings*
*Completed: 2026-06-07*

## Self-Check: PASSED

- [x] `apps/web/app/og/[callId]/route.ts` exists (statement + settled stats wired)
- [x] `apps/web/app/og/duel/[challengeId]/route.ts` exists (DuelSettled rep deltas + statement wired)
- [x] `apps/web/lib/relayer-client.ts` exists (getMarketLine + getSettledFields + getDuelSettledFields)
- [x] `apps/web/tests/og-thumbnail-200px.spec.ts` exists (SHARE-01 1200×630 assertions added)
- [x] `apps/web/tests/og-real-data-wiring.test.ts` exists (8/8 pass)
- [x] Commit `cadf558` (RED test) exists in git log
- [x] Commit `a386543` (Task 1) exists in git log
- [x] Commit `f5167f8` (Task 2) exists in git log
- [x] eslint app/og exits 0; web build exits 0; og-unit 13/13; og-fallback 5/5; SHARE-01 3/3; 200px 5 skipped
