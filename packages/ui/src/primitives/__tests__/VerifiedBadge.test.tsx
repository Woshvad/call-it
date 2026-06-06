/**
 * VerifiedBadge variant render tests — AUTH-09.
 *
 * The badge renders next to a handle on the Profile header, Feed call card,
 * and Live Receipt header. It derives a combined VERIFIED label from the two
 * link flags (verifiedX / verifiedFc):
 *
 *   X only    → "VERIFIED · X"
 *   FC only   → "VERIFIED · FC"
 *   both      → "VERIFIED · X · FC"
 *   neither   → renders null (nothing in the DOM)
 *
 * The badge reuses the neobrutalist `Tag` primitive (intent="warning",
 * brand-accent #E8F542) and carries data-testid="verified-badge". Tag is
 * inline-flex (never grid) — load-bearing for Satori/OG (Pitfall 15).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { VerifiedBadge } from '../VerifiedBadge';

describe('VerifiedBadge — AUTH-09 variants', () => {
  it('renders "VERIFIED · X · FC" when both flags are true', () => {
    render(<VerifiedBadge verifiedX verifiedFc />);
    const badge = screen.getByTestId('verified-badge');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe('VERIFIED · X · FC');
  });

  it('renders "VERIFIED · X" when only verifiedX is true', () => {
    render(<VerifiedBadge verifiedX />);
    const badge = screen.getByTestId('verified-badge');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe('VERIFIED · X');
  });

  it('renders "VERIFIED · FC" when only verifiedFc is true', () => {
    render(<VerifiedBadge verifiedFc />);
    const badge = screen.getByTestId('verified-badge');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe('VERIFIED · FC');
  });

  it('renders nothing when both flags are false', () => {
    const { container } = render(<VerifiedBadge verifiedX={false} verifiedFc={false} />);
    expect(screen.queryByTestId('verified-badge')).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when both flags are undefined', () => {
    const { container } = render(<VerifiedBadge />);
    expect(screen.queryByTestId('verified-badge')).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it('uses the warning (brand-accent) Tag intent — inline-flex, never grid (Pitfall 15)', () => {
    render(<VerifiedBadge verifiedX />);
    const badge = screen.getByTestId('verified-badge');
    expect(badge.className).toContain('border-brand-accent');
    expect(badge.className).toContain('inline-flex');
    expect(badge.className).not.toContain('grid');
  });

  it('forwards a custom className', () => {
    render(<VerifiedBadge verifiedX className="ml-2" />);
    const badge = screen.getByTestId('verified-badge');
    expect(badge.className).toContain('ml-2');
  });
});
