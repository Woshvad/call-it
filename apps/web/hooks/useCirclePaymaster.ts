/**
 * useCirclePaymaster — Circle USDC Paymaster handoff hook (Plan 07, D-04/05/06).
 *
 * When the relayer's paymaster policy returns -32000 sponsorship-cap-exceeded
 * (user has used their 5 sponsored transactions), this hook builds the
 * paymasterAndData field for the Circle USDC Paymaster.
 *
 * Flow (D-06 handoff):
 *   1. User attempts a userOp via normal Alchemy AA path
 *   2. /paymaster/policy returns -32000 sponsorship-cap-exceeded
 *   3. Frontend calls buildPaymasterAndData(userOp, gasInUsdc)
 *   4. Hook reads USDC.nonces(userAddress) via viem readContract
 *   5. Hook builds EIP-2612 permit typed-data via circle-permit.ts
 *   6. Hook calls signTypedData (routes to Privy embedded wallet)
 *   7. Hook encodes permit → paymasterAndData bytes
 *   8. userOp is resubmitted with Circle paymasterAndData
 *
 * Key behaviors:
 *   - No ETH required (D-05 — USDC gas via EIP-2612 permit)
 *   - Privy shows the signTypedData in-flow modal (D-05 UX)
 *   - Per-tx nonce prevents replay (T-01-48)
 *   - CIRCLE_PAYMASTER address from env var (T-01-47)
 *
 * Security: T-01-47 (env var, not literal), T-01-48 (sequential nonce)
 * Requirements: AUTH-33, AUTH-34, D-04, D-05, D-06
 */

'use client';

import { useCallback } from 'react';
import { useAccount, useReadContract, useSignTypedData } from 'wagmi';
import { erc20Abi } from 'viem';
import { ACTIVE_CHAIN_ID, USDC_ADDRESS } from '@/lib/chain';
import {
  buildEip2612PermitTypedData,
  encodePermitForCirclePaymaster,
  getPermitDeadline,
  getCirclePaymasterAddress,
} from '../lib/circle-permit';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseCirclePaymasterReturn {
  /**
   * Build the paymasterAndData bytes for a Circle USDC Paymaster userOp.
   *
   * @param _userOp - The partial UserOperation (unused in permit path, for future extensibility)
   * @param gasInUsdc - How much USDC to approve for gas (in 6-decimal units, e.g. 1_000_000 = $1)
   * @returns The encoded paymasterAndData hex string to embed in the userOp
   */
  buildPaymasterAndData: (_userOp: unknown, gasInUsdc: bigint) => Promise<`0x${string}`>;

  /**
   * Whether the Circle paymaster address is configured.
   * False if NEXT_PUBLIC_CIRCLE_PAYMASTER_ADDRESS is not set.
   */
  isConfigured: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useCirclePaymaster — provides the Circle USDC Paymaster handoff capability.
 *
 * Must be used inside a component tree that has:
 *   - WagmiProvider (for useAccount, useReadContract, useSignTypedData)
 *   - PrivyProvider (for the embedded wallet signer backing useSignTypedData)
 */
export function useCirclePaymaster(): UseCirclePaymasterReturn {
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  // RC1: chain-selected USDC (was getUsdcAddress() → hardcoded MAINNET USDC,
  // which made the nonce read AND the permit verifyingContract wrong on Sepolia)
  const usdcAddress = USDC_ADDRESS;
  const paymasterAddress = getCirclePaymasterAddress();
  const isConfigured = paymasterAddress !== '0x0000000000000000000000000000000000000000';

  // Read the user's current USDC nonce for permit construction
  // This is fetched fresh each time buildPaymasterAndData is called (not cached)
  const { refetch: refetchNonce } = useReadContract({
    address: usdcAddress,
    chainId: ACTIVE_CHAIN_ID, // RC1: pin the read to the active chain
    abi: erc20Abi,
    functionName: 'nonces' as never,  // USDC has nonces() for EIP-2612
    args: address ? [address] : undefined,
    query: {
      enabled: false,  // Only fetch on demand (not on mount)
    },
  });

  const buildPaymasterAndData = useCallback(
    async (_userOp: unknown, gasInUsdc: bigint): Promise<`0x${string}`> => {
      if (!address) {
        throw new Error('Wallet not connected — cannot build Circle paymaster data');
      }

      // 1. Fetch fresh nonce
      const nonceResult = await refetchNonce();
      const nonce = (nonceResult.data as bigint | undefined) ?? 0n;

      // 2. Build permit typed data
      const deadline = getPermitDeadline();
      const permitTypedData = buildEip2612PermitTypedData({
        owner: address,
        spender: paymasterAddress,
        value: gasInUsdc,
        nonce,
        deadline,
        // LATENT PERMIT-SIGNATURE BUG fix (quick-260611-5mh): the EIP-712 domain
        // chainId was hardcoded to arbitrum.id (42161) — on Sepolia that produced
        // a permit signature the on-chain USDC would reject. Use the active chain.
        chainId: ACTIVE_CHAIN_ID,
        usdcAddress,
      });

      // 3. Sign via Privy embedded wallet (Privy shows its in-flow modal)
      // wagmi's useSignTypedData routes to the connected wallet, which is
      // the Privy embedded wallet (injected via @privy-io/wagmi connector)
      const signature = await signTypedDataAsync({
        domain: permitTypedData.domain,
        types: permitTypedData.types,
        primaryType: 'Permit',
        message: permitTypedData.message,
      });

      // 4. Encode into paymasterAndData
      const paymasterAndData = encodePermitForCirclePaymaster({
        signature,
        permit: permitTypedData,
        paymasterAddress,
      });

      return paymasterAndData;
    },
    [address, paymasterAddress, usdcAddress, refetchNonce, signTypedDataAsync],
  );

  return {
    buildPaymasterAndData,
    isConfigured,
  };
}
