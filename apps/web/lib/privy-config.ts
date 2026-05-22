/**
 * Privy client configuration — 3 login methods + embedded wallet auto-create + Arbitrum chain restriction.
 *
 * Decision D-33: Button order on /signin: Connect Wallet > Google > Twitter
 * Decision D-36: Supported chains hardcoded to [arbitrum, arbitrumSepolia] only (not multi-chain)
 * AUTH-01: 3 login paths must all produce an authenticated session
 * AUTH-03/04: OAuth paths (Google/Twitter) auto-create an embedded Privy wallet via createOnLogin
 *
 * @privy-io/wagmi@4.0.8 API surface verified in Wave-0 (Plan 01-01 SUMMARY):
 *   - PrivyClientConfig type is exported from '@privy-io/react-auth'
 *   - loginMethods, embeddedWallets.createOnLogin, supportedChains fields all exist
 *   - 'users-without-wallets' is the correct createOnLogin value for auto-wallet on OAuth
 *
 * Requirement: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, T-01-30
 * Source: RESEARCH.md Pattern 2, PATTERNS.md § file 6
 */

import { arbitrum, arbitrumSepolia } from 'viem/chains';
import type { PrivyClientConfig } from '@privy-io/react-auth';

/** Privy public app ID — safe to include in frontend bundle (NEXT_PUBLIC_ prefix). */
export const privyAppId = process.env['NEXT_PUBLIC_PRIVY_APP_ID']!;

/**
 * Privy client config for Call It.
 *
 * loginMethods: all 3 paths per AUTH-01/02/03/04
 * appearance: dark theme + brand accent yellow-green #E8F542
 * embeddedWallets: auto-create wallet for users signing in via OAuth (no password required)
 * supportedChains: Arbitrum One + Arbitrum Sepolia ONLY (D-36 lock)
 * defaultChain: resolved from NEXT_PUBLIC_NETWORK env — mainnet or staging
 */
export const privyConfig: PrivyClientConfig = {
  loginMethods: ['wallet', 'google', 'twitter'],
  appearance: {
    theme: 'dark',
    accentColor: '#E8F542',
  },
  embeddedWallets: {
    // AUTO-CREATE embedded wallet for Google/Twitter users who don't already have one
    // This is AUTH-03/04 — wagmi useAccount() will return the embedded wallet address
    createOnLogin: 'users-without-wallets',
    requireUserPasswordOnCreate: false,
  },
  supportedChains: [arbitrum, arbitrumSepolia],
  // D-36: default chain driven by network profile env var
  defaultChain:
    process.env['NEXT_PUBLIC_NETWORK'] === 'mainnet' ? arbitrum : arbitrumSepolia,
};
