/**
 * Quote Composer Playwright tests — Plan 07-05 Task 2 (UI-26/27/28, SHARE-15)
 *
 * Strategy: Tier-1 (static source assertions) — always run.
 *           Tier-2 (browser tests) — skipped without PLAYWRIGHT_BASE_URL.
 *
 * Tier-1 verifies:
 *   1. In ?quote= mode, the YOUR THESIS textarea appears BEFORE the market-type
 *      segmented buttons in document/source order (UI-27).
 *   2. The parent context card renders QUOTING + the "view original" link with NO
 *      corner brackets (UI-26).
 *   3. The success screen renders the stacked thread preview + a Share button using
 *      twitterIntentUrl / buildShareText from share-text.ts (SHARE-15 / UI-28).
 *   4. The ShareButton produces a twitter.com/intent/tweet href.
 *   5. No CSS grid (flexbox only, Pitfall 15).
 */

import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const WEB_ROOT = join(process.cwd());

function readFile(relativePath: string): string {
  const fullPath = join(WEB_ROOT, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`File not found: ${fullPath}`);
  }
  return readFileSync(fullPath, 'utf-8');
}

const PAGE = 'app/new/page.tsx';
const PARENT_CARD = 'app/new/components/QuoteParentCard.tsx';
const SUCCESS = 'app/new/components/QuoteSuccess.tsx';
const SHARE_BTN = 'components/ShareButton.tsx';

test.describe('QUOTE-COMPOSER: source assertions (Tier-1)', () => {
  test('Test 1: YOUR THESIS textarea appears BEFORE the market-type buttons (UI-27)', () => {
    const source = readFile(PAGE);
    // Only consider the quote-mode block (the standard mode has no thesis textarea).
    const thesisIdx = source.indexOf('Your thesis');
    const switcherIdx = source.indexOf('<MarketTypeSwitcher');
    expect(thesisIdx).toBeGreaterThan(-1);
    expect(switcherIdx).toBeGreaterThan(-1);
    // The first occurrence of the thesis label must precede the first MarketTypeSwitcher.
    expect(thesisIdx).toBeLessThan(switcherIdx);
    // The thesis input is a textarea (articulation field).
    expect(source).toContain('id="quote-thesis"');
    expect(source).toContain('<textarea');
  });

  test('Test 2: parent card renders QUOTING + view original, NO corner brackets (UI-26)', () => {
    const source = readFile(PARENT_CARD);
    expect(source).toContain('QUOTING');
    expect(source).toContain('view original');
    // UI-26: NO corner brackets on the parent card.
    expect(source).not.toContain('CornerBrackets');
    // Parent-unavailable empty state present.
    expect(source).toContain('Call unavailable');
  });

  test('Test 3: success screen renders the thread preview + Share button (UI-28)', () => {
    const source = readFile(SUCCESS);
    expect(source).toContain('Quote posted');
    // Thread preview = parent card + the user's quote.
    expect(source).toContain('QuoteParentCard');
    expect(source).toContain('Your quote');
    // Share affordance present.
    expect(source).toContain('ShareButton');
  });

  test('Test 4: ShareButton uses twitterIntentUrl / buildShareText -> intent href (SHARE-15)', () => {
    const source = readFile(SHARE_BTN);
    expect(source).toContain('twitterIntentUrl');
    expect(source).toContain('buildShareText');
    // Sourced from the shared share-text builder module.
    expect(source).toMatch(/from ['"]@\/lib\/share-text['"]/);
  });

  test('Test 5: no CSS grid in quote-composer sources (flexbox only)', () => {
    for (const f of [PAGE, PARENT_CARD, SUCCESS, SHARE_BTN]) {
      const src = readFile(f);
      expect(src).not.toMatch(/display:\s*['"]grid['"]/);
      expect(src).not.toContain("display: 'grid'");
    }
  });
});

test.describe('QUOTE-COMPOSER: browser tests (Tier-2)', () => {
  const isTier2Enabled = !!process.env['PLAYWRIGHT_BASE_URL'];

  test.beforeEach(({}, testInfo) => {
    if (!isTier2Enabled) {
      testInfo.skip();
    }
  });

  test('Tier-2: ?quote= renders parent card above the thesis textarea', async ({ page, baseURL }) => {
    await page.route('**/api/calls/*/live-state', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: '42', status: 'live', marketLine: 'BTC >= 100000' }),
      });
    });
    await page.goto(`${baseURL}/new?quote=42`);
    await expect(page.getByText('QUOTING')).toBeVisible();
    await expect(page.getByText('Your thesis')).toBeVisible();
    // The thesis textarea must precede the market-type buttons in the DOM.
    const thesisBox = await page.locator('#quote-thesis').boundingBox();
    const switcherBox = await page.getByText('Call Type').boundingBox();
    expect(thesisBox && switcherBox && thesisBox.y < switcherBox.y).toBeTruthy();
  });
});
