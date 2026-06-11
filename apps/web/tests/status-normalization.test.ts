/**
 * Status normalization — quick-260611-5mh C1.
 *
 * The relayer wire format is TitleCase ('Live'/'Settled'/'Disputed'/
 * 'CallerExited'); the web normalizes ONCE at the relayer-client boundary to
 * canonical lowercase. Comparing TitleCase wire values in components was the
 * settled-call-in-LIVE-tab bug.
 *
 * 1. Unit: normalizeCallStatus mapping.
 * 2. Grep gate: no TitleCase status comparisons remain against relayer-client
 *    output in the feed/call-page surfaces (TitleCase may legitimately remain
 *    ONLY inside the relayer-client normalization map + modules that do their
 *    own wire fetch, e.g. the frame-tx route).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeCallStatus } from '../lib/relayer-client';

describe('normalizeCallStatus (C1)', () => {
  it('maps the TitleCase wire statuses to canonical lowercase', () => {
    expect(normalizeCallStatus('Live')).toBe('live');
    expect(normalizeCallStatus('Settled')).toBe('settled');
    expect(normalizeCallStatus('Disputed')).toBe('disputed');
    expect(normalizeCallStatus('CallerExited')).toBe('callerExited');
  });

  it('is idempotent on already-canonical values', () => {
    expect(normalizeCallStatus('live')).toBe('live');
    expect(normalizeCallStatus('settled')).toBe('settled');
    expect(normalizeCallStatus('callerexited')).toBe('callerExited');
  });

  it('defaults unknown/absent input to live (degrade, never crash)', () => {
    expect(normalizeCallStatus(undefined)).toBe('live');
    expect(normalizeCallStatus(null)).toBe('live');
    expect(normalizeCallStatus(42)).toBe('live');
    expect(normalizeCallStatus('Banana')).toBe('live');
  });
});

describe('grep gate: no TitleCase status comparisons in relayer-client consumers', () => {
  const read = (...segs: string[]) => readFileSync(join(process.cwd(), ...segs), 'utf-8');
  // Comparison patterns against TitleCase wire values on a STATUS field.
  // (Tab labels like `activeTab === 'Live'` are UI state, not relayer status.)
  const titleCaseComparison = /status\s*[=!]==?\s*['"](Live|Settled|Disputed|CallerExited)['"]/;

  it('app/page.tsx (feed tabs) has no TitleCase status comparisons', () => {
    expect(read('app', 'page.tsx')).not.toMatch(titleCaseComparison);
  });

  it('components/FeedList.tsx has no TitleCase status comparisons', () => {
    expect(read('components', 'FeedList.tsx')).not.toMatch(titleCaseComparison);
  });

  it('app/call/[id]/page.tsx has no TitleCase status comparisons', () => {
    expect(read('app', 'call', '[id]', 'page.tsx')).not.toMatch(titleCaseComparison);
  });

  it('relayer-client getFeed normalizes statuses at the boundary', () => {
    const src = read('lib', 'relayer-client.ts');
    expect(src).toContain('export function normalizeCallStatus');
    expect(src).toContain('normalizeCallStatus(item.status)');
  });
});
