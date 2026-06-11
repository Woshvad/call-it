/**
 * avatarInitial — quick-260611-5mh C11.
 *
 * Truncated 0x address aliases must never produce a "0" avatar initial (the
 * '0' of '0x'); real handles use their first alpha character.
 */

import { describe, it, expect } from 'vitest';
import { avatarInitial } from '../src/lib/avatar-initial';

describe('avatarInitial', () => {
  it('skips the 0x prefix of a full address', () => {
    expect(avatarInitial('0x7304A289Aa8d5a4DB23eb78c143E9aA376415CeD')).toBe('7');
  });

  it('skips the 0x prefix of a truncated address alias', () => {
    expect(avatarInitial('0x7304…5CeD')).toBe('7');
    expect(avatarInitial('0xAbC1...9f2e')).toBe('A');
  });

  it('uses the first alpha char of a real handle', () => {
    expect(avatarInitial('veda')).toBe('V');
    expect(avatarInitial('@woshvad')).toBe('W');
  });

  it('strips leading @ / # markers', () => {
    expect(avatarInitial('#14')).toBe('1');
    expect(avatarInitial('@0x7304…5CeD')).toBe('7');
  });

  it('falls back to ? for empty/absent input', () => {
    expect(avatarInitial('')).toBe('?');
    expect(avatarInitial(undefined)).toBe('?');
    expect(avatarInitial(null)).toBe('?');
  });
});
