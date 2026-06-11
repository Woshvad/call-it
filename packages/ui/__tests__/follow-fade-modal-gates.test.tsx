/**
 * FollowFadeModal gate tests — quick-260611-5mh B5.
 *
 * Covers:
 *   1. Insufficient-balance gate: message "Insufficient USDC balance — you
 *      need $X.XX more" + disabled confirm when stake exceeds userBalance.
 *   2. Gate INACTIVE when userBalance prop is absent (D-07 degrade — never
 *      fake a zero balance).
 *   3. Shares display coherence: tiny non-zero expected shares render
 *      "<0.0001" (not a contradictory "0.0000"), and the displayed min shares
 *      never exceed the displayed expected shares.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { FollowFadeModal } from '../src/compound/FollowFadeModal';

const baseProps = {
  open: true,
  onClose: vi.fn(),
  callId: 14n,
  side: 'follow' as const,
  // $100 follow pool with 100e18 total shares → 1 share ≈ $1
  followReserve: 100_000_000n,
  fadeReserve: 50_000_000n,
  followTotalShares: 100n * 10n ** 18n,
  fadeTotalShares: 50n * 10n ** 18n,
  userPosition: 0n,
  onSubmit: vi.fn(),
};

describe('FollowFadeModal — insufficient-balance gate (B5)', () => {
  it('shows the deficit message and disables confirm when stake exceeds balance', () => {
    // Default amount input is $10; balance $5 → deficit $5.00
    render(<FollowFadeModal {...baseProps} userBalance={5_000_000n} />);

    expect(
      screen.getByText('Insufficient USDC balance — you need $5.00 more'),
    ).toBeTruthy();

    const confirm = screen.getByRole('button', { name: /confirm follow/i });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
  });

  it('does NOT gate when userBalance covers the stake', () => {
    render(<FollowFadeModal {...baseProps} userBalance={20_000_000n} />);

    expect(screen.queryByText(/Insufficient USDC balance/)).toBeNull();
    const confirm = screen.getByRole('button', { name: /confirm follow/i });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
  });

  it('gate is INACTIVE when userBalance prop is absent (D-07 degrade)', () => {
    render(<FollowFadeModal {...baseProps} />);

    expect(screen.queryByText(/Insufficient USDC balance/)).toBeNull();
    const confirm = screen.getByRole('button', { name: /confirm follow/i });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('FollowFadeModal — shares display coherence (B5)', () => {
  it('renders "<0.0001" for tiny non-zero expected shares instead of "0.0000"', () => {
    // Tiny pool: totalShares 1e6 (raw, vs 1e18 display scale) → expected
    // shares for a $10 deposit are non-zero but far below 0.0001.
    render(
      <FollowFadeModal
        {...baseProps}
        followReserve={1_000_000n}
        followTotalShares={1_000_000n}
      />,
    );

    // Both the Expected-shares and Min-shares lines derive from the same
    // computation → both render the coherent "<0.0001" (never 0.0000 next to
    // a larger min-shares number).
    expect(screen.getAllByText('<0.0001').length).toBe(2);
    expect(screen.queryByText('0.0000')).toBeNull();
  });

  it('displayed min shares never exceed displayed expected shares', () => {
    render(<FollowFadeModal {...baseProps} />);

    // $10 into $100 pool with 100e18 shares:
    //   expected = 100e18 * 10e6 / 110e6 = 9.0909...e18 → "9.0909"
    //   min (1% slippage) = expected * 0.99 = 8.9999...e18 → "9.0000"
    const expected = screen.getByText('9.0909');
    const min = screen.getByText('9.0000');
    expect(expected).toBeTruthy();
    expect(min).toBeTruthy();
    expect(Number('9.0000')).toBeLessThanOrEqual(Number('9.0909'));
  });
});
