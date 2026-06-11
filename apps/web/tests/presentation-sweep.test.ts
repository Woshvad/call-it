/**
 * Presentation-sweep source gates — quick-260611-5mh PLAN-03 (C2/C4/C7/C8/C13/C14).
 *
 * Source-assert style (matches this suite's convention — node env, no DOM):
 * pins the presentation fixes so a refactor can't silently revert them.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const read = (...segs: string[]) => readFileSync(join(process.cwd(), ...segs), 'utf-8');

describe('C2 — AWAITING SETTLEMENT amber state', () => {
  it('call/[id]/page.tsx renders the amber AWAITING SETTLEMENT pill for expired live calls', () => {
    const src = read('app', 'call', '[id]', 'page.tsx');
    expect(src).toContain('AWAITING SETTLEMENT');
    expect(src).toContain('isAwaitingSettlement');
  });
});

describe('C4 — receipt fixes', () => {
  const src = () => read('app', 'call', '[id]', 'page.tsx');

  it('criteria badge guards against the 0x…01 sentinel hash', () => {
    expect(src()).toContain(
      '0x0000000000000000000000000000000000000000000000000000000000000001',
    );
    expect(src()).toContain('CRITERIA_HASH_SENTINEL');
  });

  it('target/final values format at 1e8 scale (not 1e6)', () => {
    expect(src()).toContain('formatTarget1e8');
    expect(src()).toContain('1e8');
  });

  it('provenance fetch is bounded and surfaces errors (never a silent no-op)', () => {
    expect(src()).toContain("AbortSignal.timeout(8_000)");
    expect(src()).toContain('provenanceError');
    expect(src()).toContain('onRetry');
  });

  it('receipt modals portal to document.body (no ancestor can trap the fixed overlay)', () => {
    expect(src()).toContain('createPortal');
    expect(src()).toContain('document.body');
  });
});

describe('C7/C8 — duels index + branded 404 exist', () => {
  it('app/duels/page.tsx exists with the brutal empty state', () => {
    const p = join(process.cwd(), 'app', 'duels', 'page.tsx');
    expect(existsSync(p)).toBe(true);
    const src = readFileSync(p, 'utf-8');
    expect(src).toContain('NO DUELS YET');
    // quick-260611-ust: the /api/duels fetch moved into lib/duels-client.ts —
    // the page imports the shared client (same contract, relocated pin).
    expect(src).toContain('duels-client');
    expect(read('lib', 'duels-client.ts')).toContain('/api/duels');
  });

  it('Sidebar carries a DUELS entry', () => {
    expect(read('app', 'components', 'Sidebar.tsx')).toContain("'/duels'");
  });

  it('app/not-found.tsx is a branded SERVER component (no use client, no hooks)', () => {
    const p = join(process.cwd(), 'app', 'not-found.tsx');
    expect(existsSync(p)).toBe(true);
    const src = readFileSync(p, 'utf-8');
    expect(src).toContain('NO SUCH CALL ON THE TAPE.');
    expect(src).not.toContain("'use client'");
    expect(src).not.toMatch(/use(State|Effect|Callback)/);
  });
});

describe('C6 — duel page polish', () => {
  const src = () => read('app', 'duel', '[challengeId]', 'page.tsx');

  it("header reads 'duel #{id}' (no '#d/' artifact) with the honest network badge", () => {
    expect(src()).not.toContain('#d/');
    expect(src()).toContain('ARBITRUM SEPOLIA');
  });

  it('handle fallbacks are truncated addresses, not literal caller/challenger', () => {
    expect(src()).toContain('truncateAddress(caller)');
    expect(src()).toContain('truncateAddress(challenger)');
  });

  it('zero stats are hidden (D-07): rep stat gated on real profile data', () => {
    // quick-260611-vob: same D-07 contract (zero/absent stats hidden, never
    // fake credentials), migrated pin — the old `liveState.callerRep > 0`
    // wire-default gates were replaced by profile-backed gates: REP renders
    // only when Number.isFinite(globalRep), ACCURACY only when settledCalls > 0.
    expect(src()).toContain('Number.isFinite(callerProfile.globalRep)');
    expect(src()).toContain('Number.isFinite(challengerProfile.globalRep)');
    expect(src()).toMatch(/settledCalls\s*>\s*0/);
  });
});

describe('C13 — OG settled-loss money semantics', () => {
  const src = () => read('app', 'og', '[callId]', 'route.ts');

  it('CallerLost P&L is stake-based, price delta demoted to MISSED BY', () => {
    expect(src()).toContain('formatStakeLossPnl');
    expect(src()).toContain('MISSED BY');
    expect(src()).toContain('missedByStr');
  });

  it('footer brand derives from the (allowlisted) request host — no callitapp.xyz fallback', () => {
    expect(src()).not.toContain("?? 'callitapp.xyz");
    // WR-07 (quick-260611-5mh): the host now flows through the allowlist helper
    // in lib/og-host.ts — which carries the live-deploy literal — instead of
    // reflecting the raw Host header into the cacheable card.
    expect(src()).toContain('resolveOgFooterHost(url.host)');
    expect(read('lib', 'og-host.ts')).toContain('call-it-web-sepolia.vercel.app');
  });

  it('D-04 font freeze: og-fonts import untouched', () => {
    expect(src()).toContain("from '@/lib/og-fonts'");
    expect(src()).toContain('syneBold');
    expect(src()).toContain('spaceGrotesk');
    expect(src()).toContain('jetBrainsMono');
  });
});

describe('C14 — wordmark never wraps', () => {
  it('.brand carries white-space: nowrap', () => {
    const css = read('app', 'globals.css');
    const brandBlock = css.slice(css.indexOf('.brand {'), css.indexOf('.brand .slash'));
    expect(brandBlock).toContain('white-space: nowrap');
  });
});

describe('C10 — search de-emphasis', () => {
  it('AppShell search is dimmed with a SOON tag, readOnly + aria-label kept', () => {
    const src = read('app', 'components', 'AppShell.tsx');
    expect(src).toContain('SOON');
    expect(src).toContain('readOnly');
    expect(src).toContain('aria-label="Search (coming soon)"');
    expect(src).toContain("cursor: 'not-allowed'");
  });
});

describe('C9 — leaderboard multi-key sort', () => {
  it('leaderboard-client sorts globalRep desc, settledCalls desc, wins desc in JS', () => {
    const src = read('lib', 'leaderboard-client.ts');
    expect(src).toContain('b.globalRep - a.globalRep');
    expect(src).toContain('b.settledCalls - a.settledCalls');
    expect(src).toContain('b.wins - a.wins');
  });
});
