/**
 * live-call-share.test.ts — quick-260611-obx (live UAT 2026-06-11).
 *
 * Live-call share was SETTLED-ONLY: a user who just made a call landed on
 * /call/{id} (usePublishCall redirect) with zero share affordance. This spec
 * pins the live-view share wiring added by quick-260611-obx:
 *   - D-09: live share intents built via the same @call-it/shared pure
 *     builders as the settled action row (twitterIntentUrl / warpcastComposeUrl
 *     / buildShareText).
 *   - D-08 / 08-05 GAP 1 (HONESTY RULE): the live share head is 'LIVE CALL'
 *     (genuinely live) or 'ON RECORD' (expired/exited-unsettled) — a win word
 *     is UNREACHABLE in the live derivation.
 *   - D-08 (no dead controls): the share row is omitted entirely when
 *     NEXT_PUBLIC_OG_BASE_URL is unset; both anchors keep the
 *     rel="noopener noreferrer" reverse-tabnabbing guard (T-obx-03).
 *   - D-15: purely ADDITIVE spec — no existing test touched or weakened.
 *
 * Source-assert style (matches tests/presentation-sweep.test.ts — node env,
 * no DOM, no mocks): pins the wiring so a refactor can't silently revert it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(
  join(process.cwd(), 'app', 'call', '[id]', 'page.tsx'),
  'utf-8',
);

describe('quick-260611-obx — live-call share wiring (D-09)', () => {
  it('a. live path builds BOTH intents via the shared pure builders', () => {
    expect(src).toContain('liveShareOnXUrl');
    expect(src).toContain('liveShareCastUrl');

    // Prove the LIVE block (not just the settled block) calls the builders:
    // the slice from the live head-word derivation to the live markup row
    // must contain all three shared-builder calls.
    const start = src.indexOf('liveShareHead');
    const end = src.indexOf('data-live-share-row');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const liveBlock = src.slice(start, end);
    expect(liveBlock).toContain('twitterIntentUrl(');
    expect(liveBlock).toContain('warpcastComposeUrl(');
    expect(liveBlock).toContain('buildShareText(');
  });

  it('b. honest head words are present', () => {
    expect(src).toContain('LIVE CALL');
    expect(src).toContain('ON RECORD');
  });

  it('c. HONESTY RULE — no win word reachable in the live derivation (D-08 / 08-05 GAP 1)', () => {
    const start = src.indexOf('liveShareHead');
    const end = src.indexOf('liveShareCastUrl');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(-1);
    const derivation = src.slice(start, end);
    // A win word can never enter the live share text — not even via a comment
    // inside the derivation block.
    expect(derivation).not.toContain('CALLED IT');
    expect(derivation).not.toContain('CONTRARIAN HIT');
  });

  it('d. no-dead-controls markup contract: share row + tabnabbing guard', () => {
    expect(src).toContain('data-live-share-row');
    expect(src).toContain('SHARE THIS CALL');
    const rowStart = src.indexOf('data-live-share-row');
    expect(rowStart).toBeGreaterThan(-1);
    const row = src.slice(rowStart, rowStart + 4000);
    expect(row).toContain('rel="noopener noreferrer"');
    expect(row).toContain('target="_blank"');
  });

  it('e. stale settled-only rationale is gone from the cut comment', () => {
    expect(src).not.toContain('no live-call share wiring exists');
  });
});
