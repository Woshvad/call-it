/**
 * Skeleton variants test — RED phase
 * Tests all 6 static skeleton variants (D-18 — no shimmer)
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { Skeleton } from '../src/primitives/Skeleton';

const VARIANTS = [
  'feedCard',
  'receipt',
  'profileHeader',
  'leaderboardRow',
  'duelCard',
  'listItem',
] as const;

describe('Skeleton 6-variant static blocks (D-18)', () => {
  for (const variant of VARIANTS) {
    it(`renders ${variant} skeleton as static gray block`, () => {
      const { container } = render(<Skeleton variant={variant} />);
      const el = container.firstChild as HTMLElement;
      expect(el).toBeTruthy();
      // Must be a static background — bg-brand-border or equivalent
      expect(el?.className).toContain('bg-brand-border');
    });

    it(`${variant} has NO shimmer/pulse animation`, () => {
      const { container } = render(<Skeleton variant={variant} />);
      const el = container.firstChild as HTMLElement;
      expect(el?.className).not.toContain('animate-pulse');
      expect(el?.className).not.toContain('animate-shimmer');
      expect(el?.className).not.toContain('shimmer');
    });
  }

  it('feedCard skeleton has full width', () => {
    const { container } = render(<Skeleton variant="feedCard" />);
    const el = container.firstChild as HTMLElement;
    expect(el?.className).toContain('w-full');
  });

  it('leaderboardRow skeleton has full width', () => {
    const { container } = render(<Skeleton variant="leaderboardRow" />);
    const el = container.firstChild as HTMLElement;
    expect(el?.className).toContain('w-full');
  });
});
