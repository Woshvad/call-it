/**
 * wagmi config — createConfig from @privy-io/wagmi (NOT from 'wagmi' directly).
 *
 * CRITICAL: Import from '@privy-io/wagmi', not 'wagmi'.
 *   Using 'wagmi' directly breaks the Privy embedded wallet connector and silently
 *   makes useAccount() return no address for OAuth sign-in paths (Pitfall 13).
 *
 * Decision D-36: chains array is HARDCODED to exactly {arbitrumSepolia, arbitrum}.
 *   No other chains. OPS-21 + CI grep guard enforces.
 *
 * Chain ORDER (quick-260611-5mh RC1): arbitrumSepolia is FIRST because wagmi
 *   hooks WITHOUT an explicit `chainId` default to the FIRST chain in this
 *   array. With mainnet first, every unpinned read (balance chip, allowances,
 *   FFM pool reads) silently hit Arbitrum One while the app runs on Sepolia —
 *   $20 wallets rendered as $0.00. Sepolia-first matches the current deploy
 *   target; every read hook ALSO pins `chainId: ACTIVE_CHAIN_ID` explicitly
 *   (see apps/web/lib/chain.ts) so the default order is a backstop, not a
 *   load-bearing setting. Flip the order at the mainnet cutover (Phase 7.5).
 *
 * The AST test (apps/web/tests/privy-provider-order.ast.test.ts) independently
 * validates that WagmiProvider is imported from '@privy-io/wagmi' in Providers.tsx.
 *
 * Chain IDs are also available from @call-it/shared:
 *   ARBITRUM_MAINNET_CHAIN_ID = 42161
 *   ARBITRUM_SEPOLIA_CHAIN_ID = 421614
 *
 * Requirement: AUTH-05, T-01-29
 * Source: RESEARCH.md Pattern 3, PATTERNS.md § file 6
 */

// CRITICAL: import from '@privy-io/wagmi', NOT from 'wagmi'
import { createConfig } from '@privy-io/wagmi';
import { http } from 'viem';
import { arbitrum, arbitrumSepolia } from 'viem/chains';

/**
 * wagmi v2 config wired through the Privy connector.
 *
 * createConfig from @privy-io/wagmi automatically:
 *   - Sets reconnectOnMount: false
 *   - Wires the Privy embedded wallet as a connector
 *   - Exposes the session to useAccount() / useWalletClient()
 */
export const wagmiConfig = createConfig({
  // D-36 lock — ONLY Arbitrum Sepolia + Arbitrum One.
  // Sepolia FIRST: the first chain is wagmi's default for unpinned hooks (RC1).
  chains: [arbitrumSepolia, arbitrum],
  transports: {
    [arbitrum.id]: http(process.env['NEXT_PUBLIC_ARBITRUM_RPC_URL']!),
    [arbitrumSepolia.id]: http(process.env['NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL']!),
  },
});
