# Phase 09 — Deferred Items (out-of-scope discoveries during execution)

These are pre-existing, environmental failures discovered while running the full
`apps/web` Playwright suite during 09-08 Task 1. They are NOT caused by plan 09-08's
change (a one-line documentation edit to `tests/responsive.spec.ts`) and were confirmed
red on the clean baseline (with the 09-08 edit stashed). Per the executor SCOPE BOUNDARY
rule, they are logged here and NOT fixed inside 09-08.

## 1. OG image routes return 404 against the local prod build on Windows

- **Specs affected:** `og-fallback.spec.ts` (4), `og-fallback-routing.spec.ts` (2),
  `og-fallback-bench.spec.ts` (2), `og-thumbnail-200px.spec.ts` (3).
- **Symptom:** `GET /api/og/fallback`, `/api/og/[callId]`, `/og/[callId]`, `/og/duel/[challengeId]`
  return HTTP 404 from `next start` on win32, even though the route files exist on disk
  (`app/api/og/fallback/route.ts`, `app/api/og/[callId]/route.ts`, `app/og/[callId]/route.ts`).
  The home page (`/`) returns 200, so the server is healthy.
- **Proof it is environmental:** the DEPLOYED Vercel target renders these fine —
  `https://call-it-web-sepolia.vercel.app/og/14` returns HTTP 200 `image/png` (~49 KB)
  (verified 2026-06-09 during the same Task-1 run). The 404 is local-prod-build/route-
  registration on Windows, not a code regression.
- **Proof it is pre-existing:** with the 09-08 edit stashed, `og-fallback.spec.ts` still
  failed 4/5 identically (same `/api/og/fallback → 404`).
- **Disposition:** OUT OF SCOPE for Phase 9 (responsive retrofit). These OG routes are
  Phase 7 surface; the deployed target is green. Re-run on the Vercel staging deploy via
  `PLAYWRIGHT_BASE_URL=https://call-it-web-sepolia.vercel.app` if a local-prod repro is
  needed, or investigate the win32 `@vercel/og` route emission separately.

## 2. visual-smoke.spec.ts — missing OS-specific snapshot baseline

- **Spec affected:** `visual-smoke.spec.ts` — "Home feed shell (/)".
- **Symptom:** `A snapshot doesn't exist at ...home-feed-chromium-win32.png, writing actual.`
- **Disposition:** OUT OF SCOPE. The committed baselines were captured on a different OS;
  no `-win32.png` baseline exists. Not a regression introduced by 09-08. Regenerate
  baselines on the CI OS (`--update-snapshots`) if a win32 baseline is wanted.
