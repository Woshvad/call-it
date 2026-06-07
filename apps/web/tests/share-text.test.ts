/**
 * Unit tests for share-text builders (SHARE-15 / SHARE-18, D-02).
 *
 * Asserts the pure URL/text builders in lib/share-text.ts:
 *   - twitterIntentUrl: encoded text + url params
 *   - warpcastComposeUrl: encoded text + embeds[] param
 *   - buildShareText: ≤240 chars, always contains the outcome word
 *   - purity: the module reads no process.env and calls no fetch (T-07-01-02)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { twitterIntentUrl, warpcastComposeUrl, buildShareText } from '../lib/share-text.js';

describe('SHARE-15: twitterIntentUrl', () => {
  it('builds a Twitter web-intent URL with both args URL-encoded', () => {
    const url = twitterIntentUrl(
      'https://callit.app/call/42?as=fader',
      'CALLED IT — @veda: ETH > $4k',
    );
    expect(url).toBe(
      'https://twitter.com/intent/tweet' +
        `?text=${encodeURIComponent('CALLED IT — @veda: ETH > $4k')}` +
        `&url=${encodeURIComponent('https://callit.app/call/42?as=fader')}`,
    );
    // Spot-check that reserved chars actually got encoded (no raw space / & / ?).
    expect(url).toContain('%20');
    expect(url).not.toContain('text=CALLED IT');
  });
});

describe('SHARE-18: warpcastComposeUrl', () => {
  it('builds a Warpcast compose URL with text + embeds[] URL-encoded', () => {
    const url = warpcastComposeUrl(
      'https://callit.app/call/42',
      'CONTRARIAN HIT — @veda',
    );
    expect(url).toBe(
      'https://warpcast.com/~/compose' +
        `?text=${encodeURIComponent('CONTRARIAN HIT — @veda')}` +
        `&embeds[]=${encodeURIComponent('https://callit.app/call/42')}`,
    );
    expect(url).toContain('embeds[]=');
    expect(url).toContain(encodeURIComponent('https://callit.app/call/42'));
  });
});

describe('D-02: buildShareText', () => {
  it('returns a non-empty string ≤ 240 chars containing the outcome word', () => {
    const text = buildShareText({
      outcomeWord: 'CALLED IT',
      handle: 'veda',
      statement: 'ETH closes above $4,000 by EOY 2026',
    });
    expect(text.length).toBeGreaterThan(0);
    expect(text.length).toBeLessThanOrEqual(240);
    expect(text).toContain('CALLED IT');
    expect(text).toContain('@veda');
  });

  it('keeps the outcome word + handle and truncates an over-long statement', () => {
    const longStatement = 'x'.repeat(500);
    const text = buildShareText({
      outcomeWord: 'LOUD AND WRONG',
      handle: '@loudcaller',
      statement: longStatement,
    });
    expect(text.length).toBeLessThanOrEqual(240);
    expect(text).toContain('LOUD AND WRONG');
    expect(text).toContain('@loudcaller');
    expect(text.endsWith('…')).toBe(true);
  });

  it('handles a missing statement without dropping the outcome word', () => {
    const text = buildShareText({ outcomeWord: 'COLD CALL', handle: 'veda' });
    expect(text).toContain('COLD CALL');
    expect(text).toContain('@veda');
    expect(text.length).toBeLessThanOrEqual(240);
  });
});

describe('T-07-01-02: share-text purity', () => {
  it('reads no process.env and calls no fetch (no secret can pass through)', () => {
    const src = readFileSync(join(process.cwd(), 'lib/share-text.ts'), 'utf-8');
    expect(src).not.toMatch(/process\.env/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
  });
});
