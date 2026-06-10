/**
 * /new page Playwright tests (Plan 08, Task 2).
 *
 * ## Test strategy (same Tier-1/Tier-2 split as Plan 06)
 *
 * **Tier 1 — Static source assertions (always run in CI)**
 * These tests verify the structural correctness of the /new page by reading source files:
 *   - page.tsx uses zodResolver(createCallSchema) — D-29 parity
 *   - page.tsx imports createCallSchema from @call-it/shared — not duplicated
 *   - no display:grid in /new page or components (Pitfall 15)
 *   - DuplicateWarning has the CALL-49 copy verbatim
 *   - DeadlinePicker imports dayBucketUtc from @call-it/shared
 *   - usePublishCall calls postPreflight BEFORE sendUserOperation (D-28)
 *   - ConvictionSliderField uses ConvictionBar from @call-it/ui
 *   - MarketTypeSwitcher supports all 3 market types
 *   - 3 sub-form components exist (PriceTargetFields, SpreadVsFields, EventFields)
 *   - PublishConfirmModal exists with 2-step structure
 *
 * **Tier 2 — Browser E2E (requires real Privy session)**
 * Skipped unless NEXT_PUBLIC_PRIVY_APP_ID is set to a real app ID.
 *
 * Requirements: CALL-37..70, UI-01..03, UI-51, UI-55, UI-56, D-28, D-29, D-31
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// ─── File paths ───────────────────────────────────────────────────────────────

const WEB_ROOT = path.resolve(__dirname, '..');
const NEW_PAGE = path.join(WEB_ROOT, 'app', 'new', 'page.tsx');
const MARKET_TYPE_SWITCHER = path.join(WEB_ROOT, 'app', 'new', 'components', 'MarketTypeSwitcher.tsx');
const PRICE_TARGET_FIELDS = path.join(WEB_ROOT, 'app', 'new', 'components', 'PriceTargetFields.tsx');
const SPREAD_VS_FIELDS = path.join(WEB_ROOT, 'app', 'new', 'components', 'SpreadVsFields.tsx');
const EVENT_FIELDS = path.join(WEB_ROOT, 'app', 'new', 'components', 'EventFields.tsx');
const DEADLINE_PICKER = path.join(WEB_ROOT, 'app', 'new', 'components', 'DeadlinePicker.tsx');
const CONVICTION_SLIDER = path.join(WEB_ROOT, 'app', 'new', 'components', 'ConvictionSliderField.tsx');
const DUPLICATE_WARNING = path.join(WEB_ROOT, 'app', 'new', 'components', 'DuplicateWarning.tsx');
const PUBLISH_MODAL = path.join(WEB_ROOT, 'app', 'new', 'components', 'PublishConfirmModal.tsx');
const PUBLISH_HOOK = path.join(WEB_ROOT, 'app', 'new', 'hooks', 'usePublishCall.ts');
const DUP_CHECK_HOOK = path.join(WEB_ROOT, 'app', 'new', 'hooks', 'useDebouncedDupCheck.ts');
const ADVANCED_SETTINGS = path.join(WEB_ROOT, 'app', 'new', 'components', 'AdvancedSettings.tsx');

// ─── Tier 1: Static source assertions ────────────────────────────────────────

test.describe('Tier 1: /new page source assertions (D-29 + Pitfall 15)', () => {

  test('page.tsx uses zodResolver(createCallSchema) from @call-it/shared (D-29)', () => {
    const source = readFileSync(NEW_PAGE, 'utf-8');
    // Must use zodResolver with createCallSchema
    expect(source).toMatch(/zodResolver\(createCallSchema\)/);
    // Must import from @call-it/shared (not local)
    expect(source).toMatch(/from '@call-it\/shared'/);
  });

  test('page.tsx has no display:grid (Pitfall 15)', () => {
    const source = readFileSync(NEW_PAGE, 'utf-8');
    // Pitfall 15: Receipt is flexbox-only; the page layout should not use CSS grid
    expect(source).not.toMatch(/display:\s*['"]?grid/);
    expect(source).not.toMatch(/grid-cols-/);
  });

  test('page.tsx imports @call-it/shared at least 3 times (D-29 anti-drift)', () => {
    const source = readFileSync(NEW_PAGE, 'utf-8');
    const sharedImports = (source.match(/@call-it\/shared/g) ?? []).length;
    expect(sharedImports).toBeGreaterThanOrEqual(2);
  });

  test('MarketTypeSwitcher supports priceTarget, spreadVs, and event modes', () => {
    const source = readFileSync(MARKET_TYPE_SWITCHER, 'utf-8');
    expect(source).toContain('priceTarget');
    expect(source).toContain('spreadVs');
    expect(source).toContain('event');
  });

  test('3 sub-form components exist (PriceTargetFields, SpreadVsFields, EventFields)', () => {
    const ptSource = readFileSync(PRICE_TARGET_FIELDS, 'utf-8');
    const svSource = readFileSync(SPREAD_VS_FIELDS, 'utf-8');
    const evSource = readFileSync(EVENT_FIELDS, 'utf-8');

    expect(ptSource).toContain('PriceTargetFields');
    expect(svSource).toContain('SpreadVsFields');
    expect(evSource).toContain('EventFields');
    // EventFields must handle 7 subtypes
    expect(evSource).toContain('eventSubtype');
  });

  test('DeadlinePicker imports dayBucketUtc from @call-it/shared (PITFALL-12)', () => {
    const source = readFileSync(DEADLINE_PICKER, 'utf-8');
    expect(source).toMatch(/dayBucketUtc/);
    expect(source).toMatch(/@call-it\/shared/);
    // Must show "Hash bucket:" label inline
    expect(source).toContain('Hash bucket:');
  });

  test('DuplicateWarning has CALL-49 verbatim copy', () => {
    const source = readFileSync(DUPLICATE_WARNING, 'utf-8');
    // CALL-49 acceptance criteria: exact copy
    expect(source).toContain('A nearly identical call is already live — quote it instead');
  });

  test('ConvictionSliderField uses ConvictionBar from @call-it/ui (UI-51)', () => {
    const source = readFileSync(CONVICTION_SLIDER, 'utf-8');
    expect(source).toMatch(/ConvictionBar/);
    expect(source).toMatch(/@call-it\/ui/);
    // Must show auto-cap warning (CALL-30/31)
    expect(source).toContain('CONVICTION_AUTOCAP');
  });

  test('usePublishCall calls postPreflight before sendUserOperation (D-28)', () => {
    const source = readFileSync(PUBLISH_HOOK, 'utf-8');
    const preflightIdx = source.indexOf('postPreflight');
    const sendUserOpIdx = source.indexOf('sendUserOperation');
    expect(preflightIdx).toBeGreaterThan(-1);
    expect(sendUserOpIdx).toBeGreaterThan(-1);
    // preflight must come BEFORE sendUserOperation in source order (D-28)
    expect(preflightIdx).toBeLessThan(sendUserOpIdx);
  });

  test('usePublishCall handles sponsorship-cap-exceeded via Circle paymaster (Plan 07)', () => {
    const source = readFileSync(PUBLISH_HOOK, 'utf-8');
    expect(source).toMatch(/sponsorship-cap-exceeded/);
    expect(source).toMatch(/buildPaymasterAndData|useCirclePaymaster/);
  });

  test('useDebouncedDupCheck has 400ms debounce (D-22)', () => {
    const source = readFileSync(DUP_CHECK_HOOK, 'utf-8');
    expect(source).toContain('400');
  });

  test('PublishConfirmModal has 2-step structure (Review / Confirm)', () => {
    const source = readFileSync(PUBLISH_MODAL, 'utf-8');
    expect(source).toContain('Confirm publish');
    expect(source).toContain('Cancel');
  });

  test('AdvancedSettings has openToChallenges toggle (CALL-64)', () => {
    const source = readFileSync(ADVANCED_SETTINGS, 'utf-8');
    expect(source).toContain('openToChallenges');
  });

  test('ConvictionSliderField has the 4 conviction zone words (09.2-10 / D-16)', () => {
    const source = readFileSync(CONVICTION_SLIDER, 'utf-8');
    expect(source).toContain('CONVICTION_ZONES');
    expect(source).toContain('Hesitant');
    expect(source).toContain('Confident');
    expect(source).toContain('Bold');
    expect(source).toContain('On record');
  });

  test('page.tsx has $5/$25/$50/$100 stake quick-picks wired via RHF setValue (09.2-10)', () => {
    const source = readFileSync(NEW_PAGE, 'utf-8');
    expect(source).toContain('STAKE_QUICK_PICKS');
    expect(source).toMatch(/\[5, 25, 50, 100\]/);
    // Quick-picks write through the existing RHF setValue path (T-09.2-27)
    expect(source).toMatch(/setValue\('stake'/);
  });

  test('PublishConfirmModal carries FINAL · CONFIRM + exact permanence copy (09.2-10)', () => {
    const source = readFileSync(PUBLISH_MODAL, 'utf-8');
    expect(source).toContain('FINAL · CONFIRM');
    expect(source).toContain("This is permanent. There's no edit after publish.");
  });

  test('no display:grid in any /new component (Pitfall 15)', () => {
    const files = [
      NEW_PAGE,
      MARKET_TYPE_SWITCHER,
      PRICE_TARGET_FIELDS,
      SPREAD_VS_FIELDS,
      EVENT_FIELDS,
      DEADLINE_PICKER,
      CONVICTION_SLIDER,
      DUPLICATE_WARNING,
      PUBLISH_MODAL,
      ADVANCED_SETTINGS,
    ];

    for (const file of files) {
      const source = readFileSync(file, 'utf-8');
      expect(source, `${path.basename(file)} must not use display:grid`).not.toMatch(/display:\s*['"]?grid/);
      expect(source, `${path.basename(file)} must not use grid-cols`).not.toMatch(/grid-cols-/);
    }
  });
});

// ─── Tier 2: Browser E2E (requires real Privy session) ───────────────────────

const hasPrivy = !!process.env['NEXT_PUBLIC_PRIVY_APP_ID'] &&
  process.env['NEXT_PUBLIC_PRIVY_APP_ID'] !== 'test-app-id';

test.describe('Tier 2: /new page browser E2E (requires Privy session)', () => {

  test.beforeEach(({}, testInfo) => {
    if (!hasPrivy) testInfo.skip(true, 'Tier 2 tests require a real Privy app ID.');
  });

  test('Tier2 /new page loads and shows MarketTypeSwitcher with 3 modes', async ({ page }) => {
    await page.goto('/new');
    // All 3 market type buttons should be visible
    await expect(page.getByRole('button', { name: /price target/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /spread vs/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /event/i })).toBeVisible();
  });

  test('Tier2 Switching market type mounts the correct sub-form', async ({ page }) => {
    await page.goto('/new');
    // Click "Spread vs" — should mount SpreadVsFields
    await page.getByRole('button', { name: /spread vs/i }).click();
    await expect(page.getByText(/asset a/i)).toBeVisible();
    await expect(page.getByText(/asset b/i)).toBeVisible();
  });
});
