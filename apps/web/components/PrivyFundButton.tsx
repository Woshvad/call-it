/**
 * PrivyFundButton — Privy-native wallet funding (replaces the standalone Coinbase Onramp).
 *
 * Decision (2026-05-29): the funding provider was switched from a direct Coinbase Onramp
 * integration to Privy's built-in funding flow (`useFundWallet`). Rationale:
 *   - We already depend on Privy for auth + embedded wallets; Privy aggregates on-ramp
 *     providers (Moonpay, Coinbase) + external-wallet/exchange transfer behind one flow,
 *     configured in the Privy dashboard rather than wiring a separate Coinbase CDP app.
 *   - Removes the NEXT_PUBLIC_COINBASE_APP_ID / NEXT_PUBLIC_COINBASE_ONRAMP_API_KEY surface.
 *   - Supersedes spec D-34 / AUTH-25 (Coinbase popup). The "fund flow exists" requirement
 *     (AUTH-23/25) is still satisfied — by Privy funding here + direct-transfer on the page.
 *
 * Privy API (verified against @privy-io/react-auth@3.27.0 types):
 *   const { fundWallet } = useFundWallet({ onUserExited });
 *   await fundWallet({ address, options: { chain, asset: 'USDC', amount } })
 *     -> Promise<FundingResult> with { status: 'completed' | 'cancelled', ... }
 *
 * Requirements: AUTH-23, AUTH-25 (provider swapped from D-34 Coinbase → Privy-native)
 */

'use client';

import { useCallback, useState } from 'react';
import { useAccount } from 'wagmi';
import { useFundWallet } from '@privy-io/react-auth';
import { arbitrum, arbitrumSepolia } from 'viem/chains';
import { Button } from '@call-it/ui';
import { useUsdcBalance } from '../hooks/useUsdcBalance';
import { useIsMobile } from '../app/hooks/useIsMobile';

/** Funding chain follows the network profile (D-36 — Arbitrum only). */
const fundingChain =
  process.env['NEXT_PUBLIC_NETWORK'] === 'mainnet' ? arbitrum : arbitrumSepolia;

/** Default funding amount in USDC — mirrors the $5 minimum stake (spec §6.1). */
const DEFAULT_FUND_AMOUNT_USDC = '5';

interface PrivyFundButtonProps {
  /** Called when the user completes the funding flow (FundingResult.status === 'completed'). */
  onComplete?: () => void;
  /** Called when the funding flow is exited/dismissed without completing. */
  onDismiss?: () => void;
}

/**
 * PrivyFundButton — opens Privy's funding flow for the connected embedded wallet.
 *
 * Privy presents the enabled funding methods (card via Moonpay/Coinbase, external wallet,
 * or exchange transfer) per the Privy dashboard config. On completion the USDC balance
 * is refetched so the onboarding "Continue" button enables.
 */
export function PrivyFundButton({ onComplete, onDismiss }: PrivyFundButtonProps) {
  const { address } = useAccount();
  const { refetch } = useUsdcBalance();
  const isMobile = useIsMobile(); // D-03: >=44px touch targets at mobile only
  const [isFunding, setIsFunding] = useState(false);

  const { fundWallet } = useFundWallet({
    onUserExited: () => {
      setIsFunding(false);
      onDismiss?.();
    },
  });

  const handleClick = useCallback(async () => {
    if (!address) return;
    setIsFunding(true);
    try {
      const result = await fundWallet({
        address,
        options: {
          chain: fundingChain,
          asset: 'USDC',
          amount: DEFAULT_FUND_AMOUNT_USDC,
        },
      });
      if (result.status === 'completed') {
        // Funds can take a few minutes to settle; refetch immediately + let polling catch up.
        void refetch();
        onComplete?.();
      }
    } catch {
      // Funding failed or was cancelled — onUserExited handles the dismiss path.
    } finally {
      setIsFunding(false);
    }
  }, [address, fundWallet, refetch, onComplete]);

  const label = isFunding ? 'Opening funding…' : 'Fund with card or exchange';

  return (
    <Button
      intent="primary"
      size="md"
      onClick={() => {
        void handleClick();
      }}
      disabled={!address || isFunding}
      data-testid="privy-fund-button"
      style={isMobile ? { minHeight: '44px' } : undefined}
    >
      {label}
    </Button>
  );
}
