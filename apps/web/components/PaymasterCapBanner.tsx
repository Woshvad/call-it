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
      className="w-full px-4 py-2 bg-[#1A1A2E] border-b border-[#E8F542]/30"
      role="status"
      aria-live="polite"
    >
      <p className="text-xs text-center text-[#E8F542]">
        <span className="font-mono font-bold">USDC gas mode</span>
        {' '}—{' '}
        <span className="text-[#E8F542]/80">
          Circle USDC Paymaster active · No ETH required
        </span>
      </p>
    </div>
  );
}
