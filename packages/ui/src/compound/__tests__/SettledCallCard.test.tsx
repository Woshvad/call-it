/**
 * SettledCallCard render tests — quick-260611-tbc (TDD RED).
 *
 * Pins the prototype settled treatment (feed.jsx SettledCard recipe):
 *   1. Outcome word + per-word differentiating colors (all four §15.7 words)
 *      with the 3px 3px 0 #000 hard offset shadow; settledOutcomeWord wire
 *      derivation (CallerWon/CallerLost only — never guess, D-07).
 *   2. Overline honesty: `settled … UTC` ONLY when settledAt is present.
 *   3. Stat degradation matrix: FINAL/REP Δ blocks hidden when their fields
 *      are absent (absent ≠ N/A — D-07); '—' only via the explicit finalNA.
 *   4. SHARE anchor: env-gated by shareHref, noopener noreferrer, click
 *      stopPropagation (D-06 card-tap nav preserved).
 *   5. CallCard routing: settled+word → big treatment; settled w/o outcome →
 *      muted SETTLED tag; live branch byte-identical ('Closes in' pin).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import {
  SettledCallCard,
  settledOutcomeWord,
  OUTCOME_WORD_COLORS,
} from '../SettledCallCard';
import { CallCard, type CallCardData } from '../CallCard';

function settledCall(overrides: Partial<CallCardData> = {}): CallCardData {
  return {
    handle: 'veda',
    marketLine: 'ETH ≥ $1,000,000',
    deadline: new Date('2026-06-01T00:00:00Z'),
    stake: 5_000_000n, // $5 in 6-dp USDC base units
    status: 'settled',
    outcome: 'CallerWon',
    ...overrides,
  };
}

describe('settledOutcomeWord — wire → §15.7 word derivation (D-07)', () => {
  it('derives only the two wire-backed words; everything else is null (never guess)', () => {
    expect(settledOutcomeWord('CallerWon')).toBe('CALLED IT');
    expect(settledOutcomeWord('CallerLost')).toBe('LOUD AND WRONG');
    expect(settledOutcomeWord(undefined)).toBeNull();
    expect(settledOutcomeWord('Pending')).toBeNull();
  });
});

describe('SettledCallCard — outcome word + colors (Test 1)', () => {
  it('maps all four §15.7 words to their differentiating tokens', () => {
    expect(OUTCOME_WORD_COLORS['CALLED IT']).toBe('var(--accent-win)');
    expect(OUTCOME_WORD_COLORS['LOUD AND WRONG']).toBe('var(--accent-loss)');
    expect(OUTCOME_WORD_COLORS['CONTRARIAN HIT']).toBe('var(--accent-duel)');
    expect(OUTCOME_WORD_COLORS['COLD CALL']).toBe('var(--text-tertiary)');
  });

  it.each([
    ['CALLED IT', 'var(--accent-win)'],
    ['LOUD AND WRONG', 'var(--accent-loss)'],
    ['CONTRARIAN HIT', 'var(--accent-duel)'],
    ['COLD CALL', 'var(--text-tertiary)'],
  ])('renders "%s" with color %s and the hard offset shadow', (word, color) => {
    render(<SettledCallCard call={settledCall()} word={word} />);
    const el = screen.getByText(word);
    expect(el.style.color).toBe(color);
    expect(el.style.textShadow).toBe('3px 3px 0 #000');
  });

  it('derives the word from call.outcome when no override is given', () => {
    render(<SettledCallCard call={settledCall({ outcome: 'CallerLost' })} />);
    const el = screen.getByText('LOUD AND WRONG');
    expect(el.style.color).toBe('var(--accent-loss)');
  });
});

describe('SettledCallCard — overline honesty (Test 2)', () => {
  it('renders the `settled … UTC` overline from settledAt (UTC date + time)', () => {
    // 1780000000 = 2026-05-28T20:26:40Z
    render(<SettledCallCard call={settledCall({ settledAt: 1_780_000_000 })} />);
    const overline = screen.getByText(/^settled .* UTC$/);
    expect(overline.textContent).toContain('May 28');
    expect(overline.textContent).toContain('20:26:40');
  });

  it('renders NO overline when settledAt is absent', () => {
    render(<SettledCallCard call={settledCall()} />);
    expect(screen.queryByText(/^settled .* UTC$/)).toBeNull();
  });
});

describe('SettledCallCard — stat degradation matrix (Test 3, D-07)', () => {
  it('(a) finalPct 3.1 → "+3.1%" colored win', () => {
    render(<SettledCallCard call={settledCall({ finalPct: 3.1 })} />);
    const v = screen.getByText('+3.1%');
    expect(v.style.color).toBe('var(--accent-win)');
    expect(screen.getByText('FINAL')).toBeTruthy();
  });

  it('(b) finalPct -2.4 → "-2.4%" colored loss', () => {
    render(<SettledCallCard call={settledCall({ finalPct: -2.4 })} />);
    const v = screen.getByText('-2.4%');
    expect(v.style.color).toBe('var(--accent-loss)');
  });

  it('(c) finalNA → FINAL renders the semantic "—"', () => {
    render(<SettledCallCard call={settledCall({ finalNA: true })} />);
    expect(screen.getByText('FINAL')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('(d) finalPct + finalNA both absent → NO FINAL block', () => {
    render(<SettledCallCard call={settledCall()} />);
    expect(screen.queryByText('FINAL')).toBeNull();
    expect(screen.queryByText('—')).toBeNull();
  });

  it('(e) repDelta -10 → "-10" colored loss; absent → NO REP Δ block', () => {
    const { unmount } = render(
      <SettledCallCard call={settledCall({ repDelta: -10 })} />,
    );
    const v = screen.getByText('-10');
    expect(v.style.color).toBe('var(--accent-loss)');
    expect(screen.getByText('REP Δ')).toBeTruthy();
    unmount();

    render(<SettledCallCard call={settledCall()} />);
    expect(screen.queryByText('REP Δ')).toBeNull();
  });

  it('(e2) positive repDelta renders "+N" colored win', () => {
    render(<SettledCallCard call={settledCall({ repDelta: 12 })} />);
    const v = screen.getByText('+12');
    expect(v.style.color).toBe('var(--accent-win)');
  });

  it('(f) STAKE always renders formatStake', () => {
    render(<SettledCallCard call={settledCall()} />);
    expect(screen.getByText('STAKE')).toBeTruthy();
    expect(screen.getByText('$5')).toBeTruthy();
  });
});

describe('SettledCallCard — SHARE anchor (Test 4)', () => {
  const href = 'https://twitter.com/intent/tweet?text=x&url=y';

  it('renders the share anchor with target _blank + noopener noreferrer', () => {
    render(<SettledCallCard call={settledCall()} shareHref={href} />);
    const a = screen.getByRole('link', { name: /share/i });
    expect(a.getAttribute('href')).toBe(href);
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('share click does NOT fire the card onClick (stopPropagation — D-06)', () => {
    const onClick = vi.fn();
    render(<SettledCallCard call={settledCall()} shareHref={href} onClick={onClick} />);
    fireEvent.click(screen.getByRole('link', { name: /share/i }));
    expect(onClick).not.toHaveBeenCalled();
    // The card body itself still navigates.
    fireEvent.click(screen.getByText('ETH ≥ $1,000,000'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders NO share control without shareHref (D-08 no dead controls)', () => {
    render(<SettledCallCard call={settledCall()} />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('CallCard routing + pill replacement (Test 5)', () => {
  it('settled + CallerWon routes to the BIG treatment (word visible, no Tag pill)', () => {
    render(<CallCard call={settledCall()} />);
    const word = screen.getByText('CALLED IT');
    expect(word.style.textShadow).toBe('3px 3px 0 #000');
    expect(screen.queryByText('SETTLED')).toBeNull();
  });

  it('settled WITHOUT outcome renders the muted SETTLED tag, not a big word', () => {
    render(<CallCard call={settledCall({ outcome: undefined })} />);
    expect(screen.getByText('SETTLED')).toBeTruthy();
    expect(screen.queryByText('CALLED IT')).toBeNull();
    expect(screen.queryByText('LOUD AND WRONG')).toBeNull();
  });

  it("live renders the countdown branch exactly as before ('Closes in' pin, no outcome word)", () => {
    render(
      <CallCard
        call={settledCall({
          status: 'live',
          outcome: undefined,
          deadline: new Date(Date.now() + 86_400_000),
        })}
      />,
    );
    expect(screen.getByText('Closes in')).toBeTruthy();
    expect(screen.queryByText('CALLED IT')).toBeNull();
  });
});
