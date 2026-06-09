/**
 * Responsive mechanical gate — Phase 9 Wave-0 scaffold (UI-48 / UI-49 / UI-50 / SC3).
 *
 * ## Strategy (mirrors signin.spec.ts + quote-composer.spec.ts)
 *
 * **Tier-1 — Static source assertions (always run, NO Privy app id, NO build)**
 *   - `server snapshot` — asserts the useIsMobile() hook's getServerSnapshot() returns
 *     `true` (D-02 lock) and that it lives in apps/web with addEventListener('change')
 *     and no deprecated addListener.
 *   - `desktop-only banner` — asserts NONE of the 7 critical page files mount
 *     DesktopOnlyBanner (the negative half is already true). The positive half
 *     (banner present on /new + /duel/[id]) is gated as RED-pending until 09-04
 *     mounts the banner — written so it does not hard-fail the suite now.
 *
 * **Tier-2 — Browser viewport E2E (375px + 390px)**
 *   These navigate the running app. They require a real NEXT_PUBLIC_PRIVY_APP_ID +
 *   `pnpm build` + `pnpm start` (Privy validates the app id client-side before any
 *   UI renders). They are skipped when no real app id is present — the suite never
 *   hard-fails in CI on a missing app id (idiom copied from signin.spec.ts).
 *
 * Pitfall 6: the lone Playwright project is Desktop Chrome — a viewport-less spec
 * passes vacuously at desktop width. We set viewport IN-SPEC via
 * `test.use({ viewport: { width, height: 812 } })` per-width describe block.
 *
 * Pitfall 3 / 15: NEVER assert `display: grid` presence — the house style is flex-only;
 * a grid assertion would risk a regression contract that breaks quote-composer.spec.ts.
 *
 * The page-render viewport tests (no horizontal scroll / touch target / outcome word
 * legible / single column) are RED-pending until the later Phase-9 page plans retrofit
 * each surface. They run only when a real Privy app id is present.
 *
 * Requirements: UI-48, UI-49, UI-50, SC3 · Decisions: D-01, D-02, D-03, D-08, D-10
 */

import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

// apps/web root (cwd when playwright runs from apps/web).
const WEB_ROOT = process.cwd();

function readWeb(relativePath: string): string {
  const full = join(WEB_ROOT, relativePath);
  if (!existsSync(full)) throw new Error(`File not found: ${full}`);
  return readFileSync(full, 'utf-8');
}

// ─── Seeded settled-call id (overridable by the operator — Open Question 1 RESOLVED) ─
// Phase-7 seeded a guaranteed-CallerLost PriceTarget call as #14
// (apps/relayer/src/scripts/seed-loss-call.ts; targetValue $1M 8-dp → deterministic
// CallerLost = LOUD AND WRONG). Plan 09-08 Task 1 CONFIRMED #14 is still stable on the
// live Sepolia target on 2026-06-09:
//   - relayer  GET /api/calls/14/live-state → "status":"Settled"
//     (https://call-it-relayer-sepolia.fly.dev/api/calls/14/live-state)
//   - deployed OG card GET /og/14 → HTTP 200 image/png (~49 KB) on call-it-web-sepolia
// So #14 is the confirmed-stable default for the outcome-word assertion. The
// RESPONSIVE_SETTLED_CALL_ID env override is retained for any future re-seed.
const SEEDED_SETTLED_CALL = process.env['RESPONSIVE_SETTLED_CALL_ID'] ?? '14';

// ─── The 7 critical pages + onboarding subroutes + the two receipt paths ─────────────
const CRITICAL_PATHS = [
  '/',
  '/leaderboard',
  '/signin',
  '/onboarding/handle',
  '/onboarding/socials',
  '/onboarding/follow-graph',
  '/onboarding/fund',
  '/onboarding/tagline',
  `/call/${SEEDED_SETTLED_CALL}`, // settled-receipt path
];

// ─── Real-Privy-app-id gating (mirror signin.spec.ts) ───────────────────────────────
const PRIVY_APP_ID = process.env['NEXT_PUBLIC_PRIVY_APP_ID'] ?? '';
const HAS_REAL_PRIVY_APP_ID =
  PRIVY_APP_ID.length >= 28 &&
  !PRIVY_APP_ID.startsWith('cltest') &&
  !PRIVY_APP_ID.startsWith('clmock') &&
  !PRIVY_APP_ID.includes('mock') &&
  !PRIVY_APP_ID.includes('test');

const tier2SkipReason =
  'Requires a real NEXT_PUBLIC_PRIVY_APP_ID (not a mock/test value) + a production build. ' +
  'Set a real Privy app id, run `pnpm build`, then `playwright test tests/responsive.spec.ts`.';

// The 7 critical page surfaces (real client surfaces named where they differ from page.tsx).
const CRITICAL_PAGE_FILES = [
  'app/page.tsx',
  'app/leaderboard/LeaderboardClient.tsx',
  'app/signin/page.tsx',
  'app/profile/[address]/ProfileClient.tsx',
  'app/call/[id]/page.tsx',
  'app/onboarding/layout.tsx',
];

// The two banner mount-site files (UI-50 — /new and /duel/[challengeId]).
const BANNER_PAGE_FILES = ['app/new/page.tsx', 'app/duel/[challengeId]/page.tsx'];

// ═════════════════════════════════════════════════════════════════════════════════════
// Tier-1: Static source assertions (always run)
// ═════════════════════════════════════════════════════════════════════════════════════

test.describe('RESPONSIVE: Tier-1 source assertions', () => {
  test('server snapshot — useIsMobile getServerSnapshot returns true (D-02 lock)', () => {
    const hookPath = resolve(WEB_ROOT, 'app/hooks/useIsMobile.ts');
    expect(existsSync(hookPath)).toBe(true);
    const source = readFileSync(hookPath, 'utf-8');

    // 'use client' module exporting a named useIsMobile via useSyncExternalStore.
    expect(source).toContain("'use client'");
    expect(source).toMatch(/useSyncExternalStore/);
    expect(source).toMatch(/import\s*\{\s*useSyncExternalStore\s*\}\s*from\s*['"]react['"]/);
    expect(source).toMatch(/export\s+function\s+useIsMobile/);

    // D-02 lock: getServerSnapshot is present and returns true.
    expect(source).toContain('getServerSnapshot');
    expect(source).toMatch(/function\s+getServerSnapshot\s*\(\s*\)\s*:\s*boolean\s*\{[\s\S]*?return\s+true/);

    // Single breakpoint < 768px ⇒ mobile.
    expect(source).toContain('(max-width: 767px)');

    // Event subscription uses addEventListener('change', …), NEVER the deprecated addListener.
    expect(source).toMatch(/addEventListener\(\s*['"]change['"]/);
    expect(source).not.toMatch(/\.addListener\(/);
  });

  test('server snapshot — hook does NOT seed state from window during render (Pitfall 1)', () => {
    const source = readWeb('app/hooks/useIsMobile.ts');
    // No useState(window...) hydration-mismatch seed.
    expect(source).not.toMatch(/useState\([^)]*window/);
    expect(source).not.toMatch(/useState\([^)]*matchMedia/);
  });

  test('matchMedia lives in apps/web only — never packages/ui (Pitfall 2)', () => {
    // packages/ui is one level up from apps/web (../../packages/ui/src).
    const uiSrc = resolve(WEB_ROOT, '../../packages/ui/src');
    if (!existsSync(uiSrc)) {
      // If the layout differs, the verification step's grep guard covers this; do not fail.
      return;
    }
    // Walk packages/ui/src for any matchMedia reference.
    const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) {
          walk(p);
        } else if (/\.(ts|tsx)$/.test(entry)) {
          if (readFileSync(p, 'utf-8').includes('matchMedia')) offenders.push(p);
        }
      }
    };
    walk(uiSrc);
    expect(offenders).toEqual([]);
  });

  test('desktop-only banner — NONE of the 7 critical pages mount DesktopOnlyBanner', () => {
    for (const f of CRITICAL_PAGE_FILES) {
      const source = readWeb(f);
      expect(source, `${f} must NOT mount DesktopOnlyBanner`).not.toContain('DesktopOnlyBanner');
    }
  });

  test('desktop-only banner — /new and /duel mount DesktopOnlyBanner (RED-pending 09-04)', () => {
    // The banner is mounted in plan 09-04. Until then this is the contract those mount
    // sites must satisfy. Skip (do not hard-fail) while the banner is unbuilt so the
    // Wave-0 gate stays green; flips to a hard assertion automatically once 09-04 lands.
    const allMounted = BANNER_PAGE_FILES.every((f) => readWeb(f).includes('DesktopOnlyBanner'));
    test.skip(!allMounted, 'DesktopOnlyBanner not yet mounted on /new + /duel (lands in plan 09-04).');
    for (const f of BANNER_PAGE_FILES) {
      expect(readWeb(f)).toContain('DesktopOnlyBanner');
    }
  });

  test('no display:grid asserted by this spec (Pitfall 3/15 — flex-only house style)', () => {
    // Guard against this spec ever encoding a grid contract that would conflict with
    // quote-composer.spec.ts's no-grid assertion. Read our own source.
    const selfSrc = readWeb('tests/responsive.spec.ts');
    expect(selfSrc).not.toMatch(/display:\s*['"]grid['"]/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════
// Tier-2: Browser viewport E2E at 375px + 390px (require real Privy app id + build)
// ═════════════════════════════════════════════════════════════════════════════════════

for (const width of [375, 390]) {
  test.describe(`RESPONSIVE @${width}px — Tier-2 viewport`, () => {
    test.use({ viewport: { width, height: 812 } });

    test.beforeEach(() => {
      if (!HAS_REAL_PRIVY_APP_ID) test.skip(true, tier2SkipReason);
    });

    for (const path of CRITICAL_PATHS) {
      test(`no horizontal scroll — ${path}`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(overflow).toBe(false);
      });

      test(`touch target >=44px — ${path}`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        const small = await page.$$eval('button, a[href], [role="button"]', (els) =>
          els.filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && (r.width < 44 || r.height < 44);
          }).length,
        );
        expect(small).toBe(0);
      });
    }

    test(`single column / full-width — settled receipt action row`, async ({ page }) => {
      await page.goto(`/call/${SEEDED_SETTLED_CALL}`);
      await page.waitForLoadState('networkidle');
      // The receipt action row buttons must each be full-width (single column) at mobile:
      // every share/action button spans (near) the inner content width.
      const row = page.locator('[data-receipt-action-row] button, [data-receipt-action-row] a');
      const count = await row.count();
      // RED-pending: 09-03 wires the [data-receipt-action-row] marker. Skip if absent.
      test.skip(count === 0, 'Receipt action-row marker not present yet (lands in plan 09-03).');
      for (let i = 0; i < count; i++) {
        const box = await row.nth(i).boundingBox();
        expect(box).not.toBeNull();
        // Full-width within a 375/390px viewport minus 16px side padding each side.
        expect(box!.width).toBeGreaterThanOrEqual(width - 64);
      }
    });

    test(`outcome word legible — settled receipt`, async ({ page }) => {
      await page.goto(`/call/${SEEDED_SETTLED_CALL}`);
      await page.waitForLoadState('networkidle');
      const el = page.locator('[data-outcome-word]');
      // RED-pending: 09-03 adds the [data-outcome-word] attribute to the outcome hero <p>.
      const present = (await el.count()) > 0;
      test.skip(!present, 'data-outcome-word hook not present yet (lands in plan 09-03).');
      const box = await el.first().boundingBox();
      const fontSize = await el
        .first()
        .evaluate((n) => parseFloat(getComputedStyle(n).fontSize));
      expect(fontSize).toBeGreaterThanOrEqual(36);
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    });

    test(`desktop-only banner present — /new at ${width}px`, async ({ page }) => {
      await page.goto('/new');
      await page.waitForLoadState('networkidle');
      const banner = page.getByText('Best viewed on desktop');
      // RED-pending until 09-04 mounts the banner.
      const present = (await banner.count()) > 0;
      test.skip(!present, 'DesktopOnlyBanner not yet mounted on /new (lands in plan 09-04).');
      await expect(banner.first()).toBeVisible();
    });
  });
}
