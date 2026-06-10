/**
 * Skeleton variants test
 * Tests all 6 skeleton variants.
 *
 * Phase 09.2 retheme (D-15 lockstep update): hard-edged blocks on
 * var(--bg-tertiary) with a slow opacity pulse (app-cascade `liveDot`
 * keyframe) — still NO shimmer and NO Tailwind animate-pulse utility.
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

describe('Skeleton 6-variant hard-edged blocks (09.2 retheme)', () => {
  for (const variant of VARIANTS) {
    it(`renders ${variant} skeleton on var(--bg-tertiary)`, () => {
      const { container } = render(<Skeleton variant={variant} />);
      const el = container.firstChild as HTMLElement;
      expect(el).toBeTruthy();
      expect(el?.className).toContain('bg-[var(--bg-tertiary)]');
      // Hard edges — radius 0
      expect(el?.className).toContain('rounded-none');
    });

    it(`${variant} has NO shimmer/animate-pulse utility`, () => {
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
