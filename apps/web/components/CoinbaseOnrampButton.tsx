/**
 * CoinbaseOnrampButton — hosted-flow POPUP launcher for Coinbase Onramp (D-34, AUTH-25).
 *
 * CRITICAL (D-34): Opens the Coinbase hosted flow in a POPUP window via `window.open()`.
 * Do NOT use `window.location.href = ...` — that would leave the onboarding flow.
 *
 * Security (T-01-37):
 *   - Listens for `window.postMessage` completion events
 *   - Validates `event.origin === 'https://pay.coinbase.com'` BEFORE trusting the event
 *   - Closes the popup on confirmed completion and refetches balance
 *
 * Requirements: AUTH-25, D-34, T-01-37
 */

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAccount } from 'wagmi';
import { Button } from '@call-it/ui';
import { useUsdcBalance } from '../hooks/useUsdcBalance';

const COINBASE_ONRAMP_ORIGIN = 'https://pay.coinbase.com';

interface CoinbaseOnrampButtonProps {
  /** Called when the user completes the Coinbase Onramp flow (popup completion) */
  onComplete?: () => void;
  /** Called when the popup is closed without completing */
  onDismiss?: () => void;
}

/**
 * CoinbaseOnrampButton — opens the Coinbase hosted-flow onramp as a POPUP (D-34).
 *
 * The popup URL pattern (per Coinbase Onramp docs):
 *   https://pay.coinbase.com/buy/select-asset
 *     ?appId=<COINBASE_APP_ID>
 *     &addresses=<address>
 *     &assets=USDC
 *     &defaultNetwork=arbitrum
 *
 * Completion detection: Coinbase Onramp posts a `window.postMessage` event from
 * `https://pay.coinbase.com` with `{ eventName: 'success' | 'exit' }`.
 *
 * POPUP (not redirect) is the correct D-34 implementation.
 */
export function CoinbaseOnrampButton({
  onComplete,
  onDismiss,
}: CoinbaseOnrampButtonProps) {
  const { address } = useAccount();
  const { refetch } = useUsdcBalance();
  const popupRef = useRef<Window | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const coinbaseAppId = process.env['NEXT_PUBLIC_COINBASE_APP_ID'];

  // Listen for Coinbase Onramp completion postMessage (T-01-37)
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // SECURITY: Origin-check before trusting the message (T-01-37)
      if (event.origin !== COINBASE_ONRAMP_ORIGIN) return;

      const data = event.data as { eventName?: string } | undefined;
      if (!data) return;

      if (data.eventName === 'success') {
        popupRef.current?.close();
        popupRef.current = null;
        setIsOpen(false);
        // Refetch balance after successful onramp
        void refetch();
        onComplete?.();
      } else if (data.eventName === 'exit') {
        popupRef.current?.close();
        popupRef.current = null;
        setIsOpen(false);
        onDismiss?.();
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onComplete, onDismiss, refetch]);

  const handleClick = useCallback(() => {
    if (!address) return;

    // Build the Coinbase Onramp hosted-flow URL
    const params = new URLSearchParams({
      assets: 'USDC',
      defaultNetwork: 'arbitrum',
      addresses: address,
    });
    if (coinbaseAppId) {
      params.set('appId', coinbaseAppId);
    }

    const url = `${COINBASE_ONRAMP_ORIGIN}/buy/select-asset?${params.toString()}`;

    // D-34: Open as POPUP, not redirect
    const popup = window.open(
      url,
      'coinbase-onramp',
      'width=500,height=700,toolbar=no,menubar=no,scrollbars=yes,resizable=yes',
    );

    if (popup) {
      popupRef.current = popup;
      setIsOpen(true);
    }
  }, [address, coinbaseAppId]);

  const label = isOpen ? 'Funding via Coinbase...' : 'Fund with Coinbase';

  return (
    <Button
      intent="primary"
      size="md"
      onClick={handleClick}
      disabled={!address || isOpen}
      data-testid="coinbase-onramp-button"
    >
      {label}
    </Button>
  );
}
