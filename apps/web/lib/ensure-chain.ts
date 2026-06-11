/**
 * ensure-chain.ts — wallet-chain alignment guard for ALL write flows.
 *
 * WHY (live failure 2026-06-11): the Privy embedded wallet session persists
 * its last active chain. A session created before privy-config's
 * defaultChain landed sits on Ethereum mainnet (id 1), and viem then refuses
 * chain-pinned writes with "The current chain of the wallet (id: 1) does not
 * match the target chain for the transaction (id: 421614)". Reads are immune
 * (explicit chainId routes the request), but every writeContract goes through
 * the wallet's CURRENT chain — so each write flow must align the wallet first.
 *
 * Privy embedded wallets switch silently (no popup) for chains listed in
 * privy-config supportedChains; injected wallets may prompt the user once.
 */

import { getChainId, switchChain } from 'wagmi/actions';
import { wagmiConfig } from '@/lib/wagmi';
import { ACTIVE_CHAIN, ACTIVE_CHAIN_ID } from '@/lib/chain';

type ConfigChainId = (typeof wagmiConfig)['chains'][number]['id'];

/**
 * Align the connected wallet to the active chain before a write.
 * No-op when already aligned. Throws a human-actionable Error when the
 * switch fails (user rejected the prompt / connector refused).
 */
export async function ensureActiveChain(): Promise<void> {
  const current = getChainId(wagmiConfig);
  if (current === ACTIVE_CHAIN_ID) return;
  try {
    await switchChain(wagmiConfig, {
      chainId: ACTIVE_CHAIN_ID as ConfigChainId,
    });
  } catch {
    throw new Error(
      `Your wallet is on the wrong network — switch it to ${ACTIVE_CHAIN.name} and retry.`,
    );
  }
}
