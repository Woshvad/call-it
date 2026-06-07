---
phase: 7
slug: og-service-final-variants-subgraph-final-mappings
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-07
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 07-RESEARCH.md § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (`@playwright/test ^1.48.0`) for web/OG; Vitest (`^3.0.0`) for subgraph mapping + relayer worker unit tests |
| **Config file** | `apps/web/playwright.config.ts` (exists); `packages/subgraph/vitest.config.ts` (exists); relayer vitest (exists) |
| **Quick run command** | `pnpm --filter @call-it/web exec playwright test og-thumbnail-200px.spec.ts` |
| **Full suite command** | `pnpm --filter @call-it/web exec playwright test && pnpm --filter @call-it/subgraph test && pnpm --filter @call-it/relayer test && pnpm --filter @call-it/web exec eslint app/og` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task's targeted spec (e.g. `playwright test og-thumbnail-200px.spec.ts` or the relayer worker vitest) + `eslint app/og`
- **After every plan wave:** Run full web Playwright suite + subgraph vitest + relayer vitest
- **Before `/gsd-verify-work`:** Full suite green + manual Twitter Card Validator pass (5 variants) + post-deploy incognito receipt load
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

> Filled by the planner/executor as task IDs are assigned. Seeded from the RESEARCH.md requirement→test map below.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | — | 0 | SC1 / Pitfall 15 | T-tamper | No `display:grid` in OG sources | lint | `eslint app/og app/api/og lib/og-*` (custom rule) | ❌ W0 | ⬜ pending |
| TBD | — | — | SC1 / SHARE-01 | — | 5 variants render 1200×630 PNG | e2e | `playwright test og-*` | ⚠️ extend | ⬜ pending |
| TBD | — | 0 | SC1 | — | 200px outcome-word legible (5 words) | visual regression | `playwright test og-thumbnail-200px.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | — | 0 | SC2 / Pitfall 8 | T-tamper | regen → HEAD 200 + X-Variant + ETag before post; ≤30s retry | integration | relayer vitest (mock OG HEAD + fake clock) | ❌ W0 | ⬜ pending |
| TBD | — | 0 | SC2 / SHARE-16/17 | T-infodisc | key absent → no-op; key present → POST once | unit | relayer vitest (mirror x-api-client) | ❌ W0 | ⬜ pending |
| TBD | — | 0 | SC2 / SHARE-18 | — | Farcaster cast URL constructed correctly | unit | `share-text.ts` builder test | ❌ W0 | ⬜ pending |
| TBD | — | 0 | SC2 / Pitfall 18 | T-repud | auto-post trigger consistent with claim-window/runbook | integration | worker test asserting trigger gate | ❌ W0 | ⬜ pending |
| TBD | — | 0 | SC3 / OPS-04 | — | all ~20 events index; CallCreated < 30s | subgraph integration | Studio query after seed + sync-lag check | ❌ W0 | ⬜ pending |
| TBD | — | 0 | SC3 / D-03/D-05 | T-tamper | `Call.statement` templated default + read by OG/receipt | subgraph unit + e2e | vitest mapping test + playwright OG-reads-statement | ❌ W0 | ⬜ pending |
| TBD | — | — | SC4 / UI-09 | — | Profile Overview 5-stat + sections | e2e | `playwright test profile.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | SC4 / UI-12/13 | — | Leaderboard title/toggle/hero/table/viewer-row | e2e | `playwright test leaderboard.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | SC4 / UI-26/27/28 | — | Quote Composer parent card + thesis-above + success thread | e2e | `playwright test quote.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | SC5 / SHARE-14/21 | T-access | receipt server-renders og:image meta; public no-auth load | e2e | `playwright test receipt-meta.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | — | — | SC5 / D-04 | T-spoof | Vercel origin hydrates against Fly relayer (CORS allowlist, not `*`) | post-deploy smoke | curl OPTIONS preflight + browser hydration | ❌ smoke | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `apps/web/eslint-rules/no-display-grid-in-og.js` + wire into `eslint.config.js` (scoped to OG files) — SC1
- [ ] `apps/web/tests/og-thumbnail-200px.spec.ts` + committed 200px baselines — SC1
- [ ] Extend OG render specs to cover all 5 variants (currently only fallback) — SC1
- [ ] `apps/relayer/src/workers/__tests__/auto-post-worker.test.ts` (cache-warm + key-gate + retry + Pitfall-18 gate) — SC2
- [ ] `apps/web/lib/share-text.ts` builder + unit test — SHARE-15/18
- [ ] Subgraph mapping vitest for `Call.statement` templated default + populate — SC3/D-03/D-05
- [ ] Subgraph event-coverage verification script (~20 events index on Studio) — SC3/OPS-04
- [ ] Profile / Leaderboard / Quote Playwright specs — SC4
- [ ] Receipt-meta + public-load spec — SC5
- [ ] Post-deploy CORS preflight smoke (curl OPTIONS) — D-04

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Twitter Card Validator pass (5 variants) | SHARE-13 | Needs a public URL (post-D-04 deploy); not cleanly scriptable | Run each of the 5 variant receipt URLs through `cards-dev.twitter.com/validator`; confirm card preview + image render (D-08) |
| Vercel origin hydration against Fly relayer | SC5 / D-04 | Requires live deployed origin + relayer; smoke not full CI | After deploy, load receipt/profile in incognito; confirm `/api/feed` + `/api/calls/:id/live-state` hydrate (no CORS error in console) |
| Subgraph published to Studio v0.9.0 | SC3 | Requires `SUBGRAPH_STUDIO_DEPLOY_KEY` operator secret | Operator runs `graph deploy`; verify all ~20 events index via Studio playground query |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
