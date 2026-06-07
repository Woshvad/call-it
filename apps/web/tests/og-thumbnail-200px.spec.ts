/**
 * SC1: 200px thumbnail legibility visual-regression scaffold.
 *
 * Phase-7 acceptance: each of the 5 settled-outcome words must remain legible when
 * the 1200×630 OG card is downscaled to its ~200px X-timeline thumbnail size. A
 * `display:'grid'` slip (banned by the no-display-grid eslint rule) typically only
 * surfaces visually at this scale — this spec is the perceptual backstop.
 *
 * Uses Playwright's BUILT-IN `expect(page).toHaveScreenshot()` — NO new dependency
 * (D-research A4: no `pixelmatch`/`pngjs`). Reuses the existing playwright.config.ts
 * `chromium` project; does NOT add a new project.
 *
 * STATUS — SCAFFOLD (env-gated skip until baselines exist):
 *   The VARIANTS below point at placeholder callId URLs. Plan 07-03 wires them to
 *   real seeded settled-call IDs (one per outcome word) and generates the baseline
 *   PNGs. Until then the suite is skipped via OG_200PX_BASELINES so it never blocks
 *   Wave 0 — but the file + the 5-word structure exist now (SC1 / Nyquist).
 *
 *   To enable once 07-03 has seeded IDs + committed baselines:
 *     OG_200PX_BASELINES=1 pnpm --filter @call-it/web exec playwright test og-thumbnail-200px.spec.ts
 *   First run generates baselines:  ... --update-snapshots
 *
 * Run with: pnpm --filter @call-it/web exec playwright test og-thumbnail-200px.spec.ts
 * Requires (when enabled): a running OG server (PLAYWRIGHT_BASE_URL or `pnpm start`).
 */

import { test, expect } from '@playwright/test';

const BASELINES_READY = process.env['OG_200PX_BASELINES'] === '1';

// The 5 settled outcome words (D-08 / §16) + the placeholder receipt URL each renders.
// TODO(07-03): replace the {placeholder} callIds with real seeded settled-call IDs
// (one per outcome word) and commit the generated baseline PNGs.
const VARIANTS = [
  { word: 'CALLED IT', url: '/og/{settledWinId}' },
  { word: 'LOUD AND WRONG', url: '/og/{settledLossId}' },
  { word: 'CONTRARIAN HIT', url: '/og/{contrarianId}' },
  { word: 'COLD CALL', url: '/og/{coldId}' },
  { word: 'FADED CORRECTLY', url: '/og/{faderId}?as=fader' },
] as const;

test.describe('SC1: 200px OG thumbnail legibility (5 outcome words)', () => {
  for (const v of VARIANTS) {
    test(`200px thumbnail legible: ${v.word}`, async ({ page }) => {
      // Skip until Plan 07-03 has seeded settled-call IDs + committed baselines.
      // Keeps the scaffold from blocking Wave 0 while preserving the real structure.
      test.skip(
        !BASELINES_READY,
        'Pending 07-03 seeded settled-call IDs + baseline PNGs (set OG_200PX_BASELINES=1)',
      );

      // 1200×630 downscaled to its ~1/6 X-timeline thumbnail footprint.
      await page.setViewportSize({ width: 200, height: 105 });
      await page.goto(v.url);

      const snapshot = `og-200-${v.word.replace(/ /g, '-')}.png`;
      await expect(page).toHaveScreenshot(snapshot, { maxDiffPixelRatio: 0.02 });
    });
  }
});
