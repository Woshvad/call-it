/**
 * CallCard status-state tests — quick-260611-5mh C2.
 *
 * An expired-but-unsettled call must render the amber AWAITING SETTLEMENT tag
 * — never the pulsing LIVE pill next to "Closes in EXPIRED".
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { CallCard } from '../src/compound/CallCard';

const baseCall = {
  handle: 'veda',
  marketLine: 'ETH ≥ $1,000,000',
  conviction: 70,
  stake: 5_000_000n,
};

describe('CallCard settlement states (C2)', () => {
  it('live status + future deadline → LIVE pill + countdown, no AWAITING SETTLEMENT', () => {
    render(
      <CallCard
        call={{
          ...baseCall,
          status: 'live',
          deadline: new Date(Date.now() + 86_400_000),
        }}
      />,
    );
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText('Closes in')).toBeInTheDocument();
    expect(screen.queryByText('AWAITING SETTLEMENT')).not.toBeInTheDocument();
  });

  it('live status + PAST deadline → amber AWAITING SETTLEMENT, no LIVE pill, no countdown', () => {
    render(
      <CallCard
        call={{
          ...baseCall,
          status: 'live',
          deadline: new Date(Date.now() - 60_000),
        }}
      />,
    );
    expect(screen.getByText('AWAITING SETTLEMENT')).toBeInTheDocument();
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
    expect(screen.queryByText('Closes in')).not.toBeInTheDocument();
    expect(screen.queryByText('EXPIRED')).not.toBeInTheDocument();
  });

  it('settled status → SETTLED tag regardless of deadline', () => {
    render(
      <CallCard
        call={{
          ...baseCall,
          status: 'settled',
          deadline: new Date(Date.now() - 60_000),
        }}
      />,
    );
    expect(screen.getByText('SETTLED')).toBeInTheDocument();
    expect(screen.queryByText('AWAITING SETTLEMENT')).not.toBeInTheDocument();
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
  });

  it('missing conviction hides the CONVICTION row entirely (D-07 — never fake 50%)', () => {
    const { conviction: _omitted, ...callWithoutConviction } = baseCall;
    render(
      <CallCard
        call={{
          ...callWithoutConviction,
          status: 'live',
          deadline: new Date(Date.now() + 86_400_000),
        }}
      />,
    );
    expect(screen.queryByText(/CONVICTION/)).not.toBeInTheDocument();
  });

  it('avatar initial of a truncated-address handle skips the 0x prefix (C11)', () => {
    render(
      <CallCard
        call={{
          ...baseCall,
          handle: '0x7304…5CeD',
          status: 'live',
          deadline: new Date(Date.now() + 86_400_000),
        }}
      />,
    );
    expect(screen.getByText('7')).toBeInTheDocument();
  });
});
