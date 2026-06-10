/**
 * Design-system snapshot tests — captures @call-it/ui primitives.
 *
 * Navigates to /dev/design-system (dev-only page) and snapshots all
 * primitive variants as regression baselines for Phase 2-9 development.
 *
 * ## Baseline goldens
 *
 * Stored in: apps/web/tests/__screenshots__/design-system-snap.spec.ts/
 * Committed to version control. Any visual drift in existing primitives
 * (accidental Tailwind class changes, token mutations, etc.) trips the test.
 *
 * To regenerate goldens after an intentional design-system change:
 *   NEXT_PUBLIC_DEV_ROUTES=1 pnpm --filter @call-it/web exec playwright test \
 *     tests/design-system-snap.spec.ts --update-snapshots
 *
 * ## Primitives covered
 *
 * | Section | Variants |
 * |---------|---------|
 * | Button  | 3 intents × 3 sizes = 9 |
 * | Tag     | 4 intents |
 * | CornerBrackets | 1 (used as wrapper) |
 * | Skeleton | 6 named variants |
 * | Stamp   | 4 color variants |
 * | ConvictionBar | 3 values (1, 50, 100) |
 * | Toast   | 3 statuses (captured after trigger button click) |
 *
 * ## Env requirement
 *
 * NEXT_PUBLIC_DEV_ROUTES=1 must be set at build time for the page to render.
 * Without it, the page renders a disabled-state message and the test skips.
 *
 * ## Motion
 *
 * reducedMotion: 'reduce' is set so framer-motion Stamp animation is disabled
 * for deterministic snapshots.
 *
 * Requirements: UI-38, UI-39, UI-40, UI-41, UI-42, UI-43
 * Plan: 01-10, Task 2
 */

import { test, expect } from '@playwright/test';

// ── Platform guard (quick-260610-vab) ────────────────────────────────────────
// Playwright suffixes screenshot baselines per-platform, and the committed
// goldens for this suite are exclusively `-chromium-win32.png`. On CI, missing
// snapshots are NEVER auto-written — a linux run would fail every screenshot
// assertion with "A snapshot doesn't exist". This is CI/platform SCOPING, not
// assertion weakening: no screenshot assertion or maxDiffPixelRatio threshold
// is modified (D-15); win32 goldens stay authoritative for local runs. Belt-and-suspenders: the phase-1-gates gate job no longer bakes
// NEXT_PUBLIC_DEV_ROUTES (so this suite already self-skips on CI via the
// disabled-state detection below), but this guard keeps the suite safe if an
// operator ever re-enables dev routes on a linux CI build. To regenerate
// goldens, run the `--update-snapshots` command from the file header on the
// win32 dev box. (decision: quick-260610-vab)
test.skip(
  process.platform !== 'win32',
  'Visual goldens are win32-only (*-chromium-win32.png) — no baselines exist for this platform'
);

test.describe('Design-system snapshot: @call-it/ui primitives', () => {
  // Animations are disabled for deterministic snapshots via the global
  // reducedMotion: 'reduce' (contextOptions) in playwright.config.ts `use`.

  test('Full design-system page baseline', async ({ page }) => {
    await page.goto('/dev/design-system');
    await page.waitForLoadState('networkidle');

    // Check if the dev route is enabled
    const pageRoot = page.locator('[data-testid="design-system-page"]');
    const isEnabled = await pageRoot.count() > 0;

    if (!isEnabled) {
      test.skip(true, 'NEXT_PUBLIC_DEV_ROUTES=1 not set — design-system page disabled; skipping snapshot');
      return;
    }

    // Wait for web fonts to load
    await page.evaluate(() => document.fonts.ready);

    await expect(page).toHaveScreenshot('design-system-full.png', {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    });
  });

  test('Design-system with toasts triggered', async ({ page }) => {
    await page.goto('/dev/design-system');
    await page.waitForLoadState('networkidle');

    const pageRoot = page.locator('[data-testid="design-system-page"]');
    const isEnabled = await pageRoot.count() > 0;

    if (!isEnabled) {
      test.skip(true, 'NEXT_PUBLIC_DEV_ROUTES=1 not set — design-system page disabled; skipping snapshot');
      return;
    }

    // Wait for fonts
    await page.evaluate(() => document.fonts.ready);

    // Click the toast trigger to show all 3 toast statuses
    const triggerButton = page.locator('[data-testid="trigger-toasts"]');
    await triggerButton.click();

    // Brief wait for toasts to appear (they animate in)
    await page.waitForTimeout(200);

    await expect(page).toHaveScreenshot('design-system-with-toasts.png', {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    });
  });

  test('Buttons section snapshot', async ({ page }) => {
    await page.goto('/dev/design-system');
    await page.waitForLoadState('networkidle');

    const isEnabled = await page.locator('[data-testid="design-system-page"]').count() > 0;
    if (!isEnabled) {
      test.skip(true, 'NEXT_PUBLIC_DEV_ROUTES=1 not set; skipping snapshot');
      return;
    }

    await page.evaluate(() => document.fonts.ready);

    const section = page.locator('[data-testid="section-buttons"]');
    await expect(section).toHaveScreenshot('buttons-section.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('Stamp section snapshot', async ({ page }) => {
    await page.goto('/dev/design-system');
    await page.waitForLoadState('networkidle');

    const isEnabled = await page.locator('[data-testid="design-system-page"]').count() > 0;
    if (!isEnabled) {
      test.skip(true, 'NEXT_PUBLIC_DEV_ROUTES=1 not set; skipping snapshot');
      return;
    }

    await page.evaluate(() => document.fonts.ready);

    const section = page.locator('[data-testid="section-stamp"]');
    await expect(section).toHaveScreenshot('stamp-section.png', {
      maxDiffPixelRatio: 0.02,
    });
  });

  test('ConvictionBar section snapshot', async ({ page }) => {
    await page.goto('/dev/design-system');
    await page.waitForLoadState('networkidle');

    const isEnabled = await page.locator('[data-testid="design-system-page"]').count() > 0;
    if (!isEnabled) {
      test.skip(true, 'NEXT_PUBLIC_DEV_ROUTES=1 not set; skipping snapshot');
      return;
    }

    await page.evaluate(() => document.fonts.ready);

    const section = page.locator('[data-testid="section-conviction-bar"]');
    await expect(section).toHaveScreenshot('conviction-bar-section.png', {
      maxDiffPixelRatio: 0.02,
    });
  });
});
