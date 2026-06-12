/**
 * demo-prep sweep source gates — quick-260612-hi3.
 *
 * Source-assert pins (presentation-sweep read() style — node env, no DOM) for
 * the 7 confirmed 09.2-review bugs fixed in this sweep, so a refactor can't
 * silently revert them:
 *   WR-02 — dispute resolve fail-closed (prefetched on-chain outcome)
 *   WR-03 — dead "Resolver Note (public)" control removed
 *   WR-04 — duel accept preflight works pre-accept (Proposed state)
 *   WR-11 — quote share never "@you" / never a fake settled outcome word
 *   WR-12 — onboarding handle persisted on-chain (setDisplayHandle)
 *   WR-10 — CallerExited OG slash is the real penaltyApplied, never ~50%
 *   CR-02 — /og/[callId] identity is server-resolved; ?handle= is gone
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...segs: string[]) => readFileSync(join(process.cwd(), ...segs), 'utf-8');

describe('WR-02 — dispute resolve is fail-closed on the fetched on-chain outcome', () => {
  const src = () => read('app', 'disputes', 'page.tsx');

  it('prefetches the provenance snapshot from a mount effect (before any outcome selection)', () => {
    expect(src()).toContain('fetchProvenanceSnapshot');
    // The prefetch lives in a top-level useEffect keyed on isOwner + the open
    // dispute id list — not inside the render IIFE.
    expect(src()).toMatch(/useEffect\(\(\) => \{\s*\n\s*if \(!isOwner\) return;/);
    expect(src()).toContain('prefetchedSnapshotsRef');
  });

  it('confirm gate requires a non-null fetched preview (fail-closed)', () => {
    expect(src()).toMatch(
      /const canConfirm = !state\.previewFailed && !state\.previewLoading && state\.preview !== null;/,
    );
  });

  it('loadReversalPreview never defaults the current outcome to CallerLost', () => {
    const loadFn = src().split('const loadReversalPreview')[1]?.split('};')[0] ?? '';
    expect(loadFn).not.toContain('OUTCOME_CALLER_LOST');
    expect(loadFn.length).toBeGreaterThan(0);
  });
});

describe('WR-03 — dead resolver-note control removed (relayer-sourced display survives)', () => {
  const src = () => read('app', 'disputes', 'page.tsx');

  it('does NOT render the "Resolver Note (public)" input', () => {
    expect(src()).not.toContain('Resolver Note (public)');
  });

  it('still renders the relayer-sourced resolverNote in the resolved list', () => {
    expect(src()).toContain('resolverNote');
  });
});

describe('WR-04 — duel accept preflight works in Proposed state', () => {
  it('callerMatchingStake falls back to challengerStake when callerStake is 0n', () => {
    const src = read('app', 'duel', '[challengeId]', 'page.tsx');
    const stakeExpr = src.split('const callerMatchingStake')[1]?.split(';')[0] ?? '';
    expect(stakeExpr).toContain('callerStake > 0n');
    expect(stakeExpr).toContain(': liveState.challengerStake)');
  });
});

describe('WR-11 — quote share intent honesty', () => {
  it('QuoteSuccess contains neither "@you" nor "CALLED A QUOTE"; shares "ON RECORD" with the resolved viewer handle', () => {
    const src = read('app', 'new', 'components', 'QuoteSuccess.tsx');
    expect(src).not.toContain('@you');
    expect(src).not.toContain('CALLED A QUOTE');
    expect(src).toContain('ON RECORD');
    expect(src).toContain('useProfile');
  });

  it('usePublishCall returns the new callId and supports suppressRedirect', () => {
    const src = read('app', 'new', 'hooks', 'usePublishCall.ts');
    expect(src).toContain('suppressRedirect');
    expect(src).toMatch(
      /return \{ status: 'success', callId: callId !== null \? String\(callId\) : null \};/,
    );
  });

  it('ShareButton handle prop is optional (isRealHandle omits absent handles)', () => {
    const src = read('components', 'ShareButton.tsx');
    expect(src).toMatch(/handle\?:/);
  });
});

describe('WR-12 — onboarding handle persists on-chain', () => {
  it('handle page wires the settings setDisplayHandle wagmi path (chain-aligned, chainId-pinned)', () => {
    const src = read('app', 'onboarding', 'handle', 'page.tsx');
    expect(src).toContain('setDisplayHandle');
    expect(src).toContain('ensureActiveChain');
    expect(src).toContain('chainId: ACTIVE_CHAIN_ID');
  });
});

describe('WR-10 — CallerExited OG slash is real, never fabricated', () => {
  it('og/[callId]/route.ts no longer contains the stakeRaw / 2n estimate', () => {
    const src = read('app', 'og', '[callId]', 'route.ts');
    expect(src).not.toContain('stakeRaw / 2n');
    expect(src).toContain('exitPenalty');
  });

  it('relayer-client sources exitPenalty from subgraph callerExits.penaltyApplied', () => {
    const src = read('lib', 'relayer-client.ts');
    expect(src).toContain('callerExits');
    expect(src).toContain('penaltyApplied');
    expect(src).toContain('exitPenalty');
  });
});

describe('CR-02 — /og/[callId] identity is server-resolved (no forgeable ?handle=)', () => {
  const ogSrc = () => read('app', 'og', '[callId]', 'route.ts');

  it('does NOT read ?handle= from the query string', () => {
    expect(ogSrc()).not.toContain("searchParams.get('handle')");
  });

  it('resolves the caller handle via ProfileRegistry getProfile with truncate-address fallback', () => {
    expect(ogSrc()).toContain('getProfile');
    expect(ogSrc()).toContain('slice(0, 6)');
    expect(ogSrc()).toContain('slice(-4)');
  });

  it('?as=fader viewer-lens flip is KEPT (user decision — D-03)', () => {
    expect(ogSrc()).toContain("searchParams.get('as')");
  });

  it('duel OG route fallbacks use the same truncate style (no slice(2, 8))', () => {
    const duelSrc = read('app', 'og', 'duel', '[challengeId]', 'route.ts');
    expect(duelSrc).not.toContain('slice(2, 8)');
    expect(duelSrc).toContain('slice(0, 6)');
    expect(duelSrc).toContain('slice(-4)');
  });
});
