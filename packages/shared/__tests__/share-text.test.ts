/**
 * share-text handle guards (quick-260611-5mh C3).
 *
 * Share text must NEVER emit a fake @mention: "@undefined", "@0x1234…", or an
 * empty "@". Truncated wallet addresses are display aliases, NOT handles — the
 * @segment is omitted entirely when no real handle exists.
 */

import { describe, it, expect } from 'vitest';
import { buildShareText, isRealHandle } from '../src/share/share-text.js';

describe('isRealHandle', () => {
  it('accepts a real handle (with or without @)', () => {
    expect(isRealHandle('woshvad')).toBe(true);
    expect(isRealHandle('@woshvad')).toBe(true);
  });

  it('rejects undefined / null / empty', () => {
    expect(isRealHandle(undefined)).toBe(false);
    expect(isRealHandle(null)).toBe(false);
    expect(isRealHandle('')).toBe(false);
    expect(isRealHandle('   ')).toBe(false);
    expect(isRealHandle('@')).toBe(false);
  });

  it('rejects 0x addresses and truncated address aliases', () => {
    expect(isRealHandle('0x7304A289Aa8d5a4DB23eb78c143E9aA376415CeD')).toBe(false);
    expect(isRealHandle('0x7304...5CeD')).toBe(false);
    expect(isRealHandle('@0x1234…abcd')).toBe(false);
  });

  it('rejects stringified absent values', () => {
    expect(isRealHandle('undefined')).toBe(false);
    expect(isRealHandle('null')).toBe(false);
  });
});

describe('buildShareText handle guards', () => {
  it('real handle → outcome word + @handle', () => {
    const text = buildShareText({ outcomeWord: 'CALLED IT', handle: 'woshvad' });
    expect(text).toBe('CALLED IT — @woshvad');
  });

  it('undefined handle → @segment omitted entirely', () => {
    const text = buildShareText({ outcomeWord: 'LOUD AND WRONG', handle: undefined });
    expect(text).toBe('LOUD AND WRONG');
    expect(text).not.toContain('@');
  });

  it('0x-address handle → @segment omitted (addresses are not handles)', () => {
    const text = buildShareText({
      outcomeWord: 'LOUD AND WRONG',
      handle: '0x7304A289Aa8d5a4DB23eb78c143E9aA376415CeD',
      statement: 'ETH ≥ $1,000,000',
    });
    expect(text).toBe('LOUD AND WRONG: ETH ≥ $1,000,000');
    expect(text).not.toContain('@');
    expect(text).not.toContain('0x');
  });

  it('empty-string handle → @segment omitted', () => {
    const text = buildShareText({ outcomeWord: 'CONTRARIAN HIT', handle: '' });
    expect(text).toBe('CONTRARIAN HIT');
    expect(text).not.toContain('@');
  });

  it('still contains the outcome word and respects the 240-char cap with a long statement', () => {
    const longStatement = 'X'.repeat(500);
    const text = buildShareText({
      outcomeWord: 'CALLED IT',
      handle: '@woshvad',
      statement: longStatement,
    });
    expect(text.length).toBeLessThanOrEqual(240);
    expect(text).toContain('CALLED IT');
    expect(text).toContain('@woshvad');
    expect(text.endsWith('…')).toBe(true);
  });
});
