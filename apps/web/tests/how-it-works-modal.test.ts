/**
 * HOW IT WORKS modal source gates — quick-260612-8wk.
 *
 * Source-assert style (presentation-sweep convention — node env, no DOM):
 * pins the Polymarket-style explainer modal content + a11y wiring, the
 * page.tsx trigger source-order, static-honesty, and a copy-canon lockstep
 * drift guard between the modal and the signin landing (the read-only canon).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const read = (...segs: string[]) => readFileSync(join(process.cwd(), ...segs), 'utf-8');

describe('HowItWorksModal — content + a11y', () => {
  it('component file exists', () => {
    const p = join(process.cwd(), 'app', 'components', 'HowItWorksModal.tsx');
    expect(existsSync(p)).toBe(true);
  });

  const src = () => read('app', 'components', 'HowItWorksModal.tsx');

  it('carries the landing copy canon: overline, heading, 3 step titles', () => {
    const s = src();
    expect(s).toContain('HOW IT WORKS');
    // ONE contiguous string — no <br/> split like the landing's h2
    expect(s).toContain('Three steps. One receipt.');
    expect(s).toContain('GO ON RECORD');
    expect(s).toContain('FOLLOW OR FADE');
    expect(s).toContain('GET YOUR RECEIPT');
  });

  it('footnote carries the REAL deployed constants', () => {
    const s = src();
    expect(s).toContain('$5 MIN');
    expect(s).toContain('$100 MAX');
    expect(s).toContain('1.7%');
  });

  it('primary CTA label', () => {
    expect(src()).toContain('MAKE YOUR FIRST CALL');
  });

  it('a11y wiring: dialog role, aria-modal, Escape, backdrop stopPropagation, labeled close', () => {
    const s = src();
    expect(s).toContain('role="dialog"');
    expect(s).toContain('aria-modal');
    expect(s).toContain("'Escape'");
    expect(s).toContain('stopPropagation');
    expect(s).toContain('aria-label="Close"');
  });
});

describe('HowItWorksModal — single copy canon + landing mount linkage', () => {
  // quick-260612-a6v (user homepage replacement 2026-06-12): the landing no
  // longer duplicates the step bodies — its three-step section was deleted
  // with the acid-hero rewrite. The modal IS the single canon now; guard the
  // modal verbatim plus the landing's mount linkage that replaced the
  // duplicated copy.
  const STEP_BODIES = [
    'Make a call on any crypto market. Pick your conviction. Stake USDC. Your prediction is now permanent and public.',
    'Others bet with you or against you. Every position is real money on the line. The market prices your prediction in real time.',
    'When the call settles, the outcome stamps onto your receipt forever. CALLED IT. LOUD AND WRONG. Either way, the world knows.',
  ];

  it('modal carries all 3 step bodies verbatim (single canon)', () => {
    const modal = read('app', 'components', 'HowItWorksModal.tsx');
    for (const body of STEP_BODIES) {
      expect(modal).toContain(body);
    }
  });

  it('signin landing mounts the modal and carries the How it works trigger', () => {
    const signin = read('app', 'signin', 'page.tsx');
    expect(signin).toContain('HowItWorksModal');
    expect(signin).toContain('How it works');
  });
});

describe('page.tsx — trigger + mount wiring', () => {
  const src = () => read('app', 'page.tsx');

  it('imports + mounts HowItWorksModal with howOpen state', () => {
    const s = src();
    expect(s).toContain('HowItWorksModal');
    expect(s).toContain('howOpen');
    expect(s).toContain('setHowOpen(true)');
  });

  it('HOW IT WORKS trigger renders BEFORE the header + NEW CALL in source order', () => {
    const s = src();
    const i = s.indexOf('HOW IT WORKS');
    expect(i).toBeGreaterThan(-1);
    // NOTE: a plain indexOf('+ NEW CALL') hits the pre-existing EmptyTape CTA
    // (~line 105), which precedes the page header. The pin's intent is the
    // HEADER order: the trigger must be followed by the header's + NEW CALL.
    const j = s.indexOf('+ NEW CALL', i);
    expect(j).toBeGreaterThan(i);
  });
});

describe('HowItWorksModal — static honesty (no data primitives)', () => {
  it('contains no fetches, chain reads/writes, or wagmi imports', () => {
    const s = read('app', 'components', 'HowItWorksModal.tsx');
    expect(s).not.toContain('fetch(');
    expect(s).not.toContain('useReadContract');
    expect(s).not.toContain('useWriteContract');
    expect(s).not.toContain('wagmi');
    // NOTE: useEffect is allowed — the Escape listener legitimately uses it.
  });
});
