/**
 * SC1: 200px thumbnail legibility visual-regression scaffold
 * + SHARE-01: 1200×630 PNG-dimension assertions for the wired OG variants.
 *
 * Two concerns live here:
 *
 * 1. SHARE-01 (1200×630 — RUNS UNCONDITIONALLY): the newly-wired Live, Settled,
 *    and DuelSettled OG routes must render a `image/png` whose PNG IHDR decodes to
 *    width=1200 height=630, mirroring og-fallback.spec.ts Test 1. This closes the
 *    gap that the 1200×630 assertion previously existed only for the pre-existing
 *    /api/og/fallback variant. It needs only that the routes render (real card OR
 *    SHARE-10 fallback — both are 1200×630), NOT seeded settled-call data.
 *
 * 2. SC1 200px legibility (ENV-GATED): each of the 5 settled-outcome words must
 *    remain legible when the 1200×630 card is downscaled to its ~200px X-timeline
 *    thumbnail. This needs real seeded settled-call IDs (one per outcome word) on a
 *    reachable/deployed endpoint to generate authoritative baselines. Until 07-06
 *    seeds + deploys, this block stays env-gated (OG_200PX_BASELINES=1) so it never
 *    blocks CI — the structure + 5-word matrix exist now (Nyquist), and the
 *    authoritative readability run happens post-deploy.
 *
 * Uses Playwright's BUILT-IN `expect(page).toHaveScreenshot()` + the PNG IHDR header
 * read — NO new dependency (D-research A4: no `pixelmatch`/`pngjs`).
 *
 * To enable the 200px block once 07-06 has seeded IDs + committed baselines:
 *   OG_200PX_BASELINES=1 pnpm --filter @call-it/web exec playwright test og-thumbnail-200px.spec.ts
 * First run generates baselines:  ... --update-snapshots
 *
 * Run with: pnpm --filter @call-it/web exec playwright test og-thumbnail-200px.spec.ts
 * Requires: a running OG server (PLAYWRIGHT_BASE_URL or the config webServer `pnpm start`).
 */

import { test, expect } from '@playwright/test';

const BASELINES_READY = process.env['OG_200PX_BASELINES'] === '1';

// ── SHARE-01: 1200×630 PNG-dimension assertions for the WIRED variants ──────────
// These run unconditionally. Each route renders a real card when on-chain/subgraph
// data exists, else the SHARE-10 fallback — both decode to exactly 1200×630.
// The X-Variant header is asserted loosely (the route may serve the variant OR its
// fallback) by checking it is one of the allowed values for that route.
const DIMENSION_VARIANTS = [
  {
    name: 'Live (og/[callId])',
    url: '/og/1',
    allowedVariants: ['live', 'settled', 'caller-exited', 'live-fallback'],
  },
  {
    name: 'Settled (og/[callId])',
    // ?v= cache-bust is harmless; the route picks the variant from on-chain status.
    url: '/og/1?v=1',
    allowedVariants: ['live', 'settled', 'caller-exited', 'live-fallback'],
  },
  {
    name: 'DuelSettled (og/duel/[challengeId])',
    url: '/og/duel/1',
    allowedVariants: ['duel-active', 'duel-settled', 'duel-fallback'],
  },
] as const;

test.describe('SHARE-01: wired OG variants render 1200×630 PNG', () => {
  for (const v of DIMENSION_VARIANTS) {
    test(`1200×630 PNG: ${v.name}`, async ({ request, baseURL }) => {
      const res = await request.get(`${baseURL}${v.url}`);
      expect(res.status()).toBe(200);

      // content-type is an image PNG
      const contentType = res.headers()['content-type'] ?? '';
      expect(contentType).toContain('image/png');

      // X-Variant is one of the route's allowed variants (real OR fallback).
      const xVariant = res.headers()['x-variant'] ?? '';
      expect(v.allowedVariants).toContain(xVariant);

      // PNG IHDR dimension read (bytes 16-23) — mirrors og-fallback.spec.ts Test 1.
      const buffer = await res.body();
      expect(buffer.length).toBeGreaterThan(1000);
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      expect(width).toBe(1200);
      expect(height).toBe(630);
    });
  }
});

// ── SC1: 200px outcome-word legibility (env-gated; baselines seeded 2026-06-08) ──
// Real seeded Arbitrum-Sepolia settled-call IDs (one per outcome word):
//   CALLED IT       = call 2  (CallerWon, fade$1/follow$2 -> fadeRealShare 0.333, repDelta +8)
//   COLD CALL       = call 11 (CallerWon, repDelta +2, 0 faders -> cold-start)
//   LOUD AND WRONG  = call 14 (CallerLost, seeded via seed-loss-call.ts)
//   FADED CORRECTLY = call 14 ?as=fader (D-09 per-viewer fader render on the loss call)
//   CONTRARIAN HIT  = call 9  (CallerWon, fade$2/follow$1 -> majority real fade
//     fadeRealShare 0.667 >= 0.5, repDelta +10). Now wired via fadeRealShare from
//     subgraph Positions in getSettledFields, so the card renders this word.
// Baselines generated against the deployed endpoint (PLAYWRIGHT_BASE_URL) with
// OG_200PX_BASELINES=1 --update-snapshots.
const VARIANTS = [
  { word: 'CALLED IT', url: '/og/2', deferred: false },
  { word: 'LOUD AND WRONG', url: '/og/14', deferred: false },
  { word: 'CONTRARIAN HIT', url: '/og/9', deferred: false },
  { word: 'COLD CALL', url: '/og/11', deferred: false },
  { word: 'FADED CORRECTLY', url: '/og/14?as=fader', deferred: false },
] as const;

test.describe('SC1: 200px OG thumbnail legibility (5 outcome words)', () => {
  for (const v of VARIANTS) {
    test(`200px thumbnail legible: ${v.word}`, async ({ page }) => {
      // CONTRARIAN HIT is deferred (OG-route fadeRealShare gap — see note above).
      test.skip(
        v.deferred,
        'CONTRARIAN HIT deferred: OG route hardcodes fadeRealShare:0 so the card cannot render this word yet (see phase-7-deploy-runbook.md)',
      );
      // Env-gated: the authoritative readability run sets OG_200PX_BASELINES=1
      // against a deployed endpoint. Keeps this block from blocking CI.
      test.skip(
        !BASELINES_READY,
        'Set OG_200PX_BASELINES=1 (+ PLAYWRIGHT_BASE_URL=deployed) to run the authoritative 200px readability check',
      );

      // 1200×630 downscaled to its ~1/6 X-timeline thumbnail footprint.
      await page.setViewportSize({ width: 200, height: 105 });
      await page.goto(v.url);

      const snapshot = `og-200-${v.word.replace(/ /g, '-')}.png`;
      await expect(page).toHaveScreenshot(snapshot, { maxDiffPixelRatio: 0.02 });
    });
  }
});
