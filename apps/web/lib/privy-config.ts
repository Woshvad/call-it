/**
 * Privy client configuration — 3 login methods + embedded wallet auto-create + Arbitrum chain restriction.
 *
 * Decision D-33: Button order on /signin: Connect Wallet > Google > Twitter
 * Decision D-36: Supported chains hardcoded to [arbitrum, arbitrumSepolia] only (not multi-chain)
 * AUTH-01: 3 login paths must all produce an authenticated session
 * AUTH-03/04: OAuth paths (Google/Twitter) auto-create an embedded Privy wallet via createOnLogin
 *
 * @privy-io/react-auth@3.27.0 API surface (verified against installed types):
 *   - PrivyClientConfig type is exported from '@privy-io/react-auth'
 *   - loginMethods, supportedChains fields all exist
 *   - embeddedWallets.ethereum.createOnLogin is the v3 structure (NOT top-level createOnLogin)
 *   - 'users-without-wallets' is the correct createOnLogin value for auto-wallet on OAuth
 *
 * DEVIATION [Rule 1 - Bug] privy-config.ts embeddedWallets shape:
 *   The scaffold used `embeddedWallets.createOnLogin` (v2 API) which does not exist in
 *   @privy-io/react-auth@3.27.0. The v3 type requires `embeddedWallets.ethereum.createOnLogin`.
 *   Fixed: moved createOnLogin under the `ethereum` sub-object per the v3 PrivyClientConfig type.
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
    // v3 API: createOnLogin is nested under `ethereum` (not top-level)
    // AUTO-CREATE embedded wallet for Google/Twitter users who don't already have one
    // This is AUTH-03/04 — wagmi useAccount() will return the embedded wallet address
    ethereum: {
      createOnLogin: 'users-without-wallets',
    },
  },
  supportedChains: [arbitrum, arbitrumSepolia],
  // D-36: default chain driven by network profile env var
  defaultChain:
    process.env['NEXT_PUBLIC_NETWORK'] === 'mainnet' ? arbitrum : arbitrumSepolia,
};
