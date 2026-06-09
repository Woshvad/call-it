/**
 * settled-outcome-truth.test.ts — Regression test of record for 08-05 GAP 1.
 *
 * CORE VALUE (PROJECT.md): every settled receipt must render and SHARE its TRUE
 * outcome word — a settled LOSS must read 'LOUD AND WRONG', NEVER 'CALLED IT'.
 *
 * UAT 08 GAP 1 (severity: major — Core Value violation): a settled loss (call #14
 * = CallerLost) was publicly sharing as 'CALLED IT' because:
 *   - the relayer /live-state did not return `outcome`, so the page's
 *     outcomeWordResult was null, and
 *   - the page defaulted `outcomeWord = outcomeWordResult?.word ?? 'CALLED IT'`,
 *     fabricating a win for both the receipt stamp and the SHARE AS FRAME text.
 *
 * This file locks the fix:
 *   1. CallerLost → 'LOUD AND WRONG'; buildShareText contains it, NOT 'CALLED IT'.
 *   2. CallerWon (high rep) → 'CALLED IT' (win path not over-corrected).
 *   3. Unknown outcome (result null) → resolveSettledWord yields a NON-WIN neutral
 *      placeholder — there is NO code path where loss/unknown yields 'CALLED IT'.
 */

import { describe, it, expect } from 'vitest';

import {
  getOutcomeWordResult,
  resolveSettledWord,
  SETTLED_NEUTRAL_WORD,
} from '../lib/outcome-word';
import { buildShareText } from '@call-it/shared';

const WIN_WORDS = ['CALLED IT', 'CONTRARIAN HIT', 'COLD CALL', 'FADED CORRECTLY'];

describe('08-05 GAP 1 — settled receipt shows/shares the TRUE outcome word', () => {
  it('CallerLost → LOUD AND WRONG (receipt word + share text), NEVER CALLED IT', () => {
    // CallerLost: callerWon=false, repDelta<0, fadeRealShare<0.5, public viewer.
    const result = getOutcomeWordResult({
      callerWon: false,
      fadeRealShare: 0.2,
      repDelta: -8,
      viewerIsWinningFader: false,
    });
    const resolved = resolveSettledWord(result);
    expect(resolved.word).toBe('LOUD AND WRONG');

    const text = buildShareText({
      outcomeWord: resolved.word,
      handle: 'veda',
      statement: 'BTC >= $120k by Jun 30',
    });
    expect(text).toContain('LOUD AND WRONG');
    expect(text).not.toContain('CALLED IT');
  });

  it('CallerWon (high rep, low fade) → CALLED IT (win path preserved)', () => {
    const result = getOutcomeWordResult({
      callerWon: true,
      fadeRealShare: 0.2,
      repDelta: 12,
      viewerIsWinningFader: false,
    });
    const resolved = resolveSettledWord(result);
    expect(resolved.word).toBe('CALLED IT');
  });

  it('unknown outcome (result null) → neutral placeholder, NEVER a win word', () => {
    const resolved = resolveSettledWord(null);
    expect(resolved.word).toBe(SETTLED_NEUTRAL_WORD);
    expect(WIN_WORDS).not.toContain(resolved.word);
    expect(resolved.lozenge).toBeNull();

    // And the forbidden fallback must not leak into the share text either.
    const text = buildShareText({
      outcomeWord: resolved.word,
      handle: 'veda',
      statement: 'BTC >= $120k by Jun 30',
    });
    expect(text).not.toContain('CALLED IT');
  });

  it('FORBIDDEN: no loss/unknown input ever resolves to CALLED IT', () => {
    // CallerLost across the threshold space — must always be LOUD AND WRONG.
    for (const fadeRealShare of [0, 0.49, 0.5, 0.99, 1]) {
      for (const repDelta of [-50, -1, 0, 3, 100]) {
        const result = getOutcomeWordResult({
          callerWon: false,
          fadeRealShare,
          repDelta,
          viewerIsWinningFader: false,
        });
        const resolved = resolveSettledWord(result);
        expect(resolved.word).toBe('LOUD AND WRONG');
        expect(resolved.word).not.toBe('CALLED IT');
      }
    }
    // Unknown outcome — neutral, never a win.
    expect(resolveSettledWord(null).word).not.toBe('CALLED IT');
  });
});
