/**
 * PaymasterCapBanner — displays when user has exhausted their 5 sponsored txs.
 *
 * Renders nothing while remaining > 0 (invisible, no layout impact).
 * When remaining === 0, renders an informational tag explaining the
 * Circle USDC Paymaster is now active and no ETH is required.
 *
 * Mounted globally in Providers.tsx so it's always visible when the cap is hit.
 * Users on their 6th+ tx see this banner on every page.
 *
 * Requirements: D-04, D-05, D-06, AUTH-33
 */

'use client';

import { usePaymasterCount } from '@/hooks/usePaymasterCount';

/**
 * PaymasterCapBanner
 *
 * Shows nothing while remaining > 0.
 * Shows "USDC gas mode" banner when remaining === 0.
 */
export function PaymasterCapBanner() {
  const { isCapped, isLoading } = usePaymasterCount();

  // Don't render anything while loading or when cap not reached
  if (isLoading || !isCapped) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        width: '100%',
        padding: '8px 16px',
        background: 'var(--bg-secondary)',
        borderBottom: '2px solid var(--accent-warning)',
      }}
    >
      <p
        style={{
          fontSize: '11px',
          textAlign: 'center',
          color: 'var(--accent-warning)',
          fontFamily: 'var(--font-mono)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          margin: 0,
        }}
      >
        <span style={{ fontWeight: 700 }}>USDC gas mode</span>
        {' '}—{' '}
        <span style={{ color: 'var(--text-secondary)' }}>
          Circle USDC Paymaster active · No ETH required
        </span>
      </p>
    </div>
  );
}
