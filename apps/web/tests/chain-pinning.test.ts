/**
 * chain-pinning.test.ts — quick-260611-5mh RC1 regression guards.
 *
 * Root cause (verified live 2026-06-11): wagmi hooks WITHOUT an explicit
 * `chainId` default to the FIRST chain in the wagmi config. With
 * `[arbitrum, arbitrumSepolia]` and hooks carrying no chainId + the hardcoded
 * MAINNET USDC token, ~90/122 page requests hit arb-mainnet.g.alchemy.com and
 * a wallet holding $20.00 USDC on Sepolia rendered as $0.00.
 *
 * Guards:
 *   1. apps/web/lib/chain.ts defaults to Arbitrum Sepolia (421614) and selects
 *      the Sepolia USDC token for that chain.
 *   2. wagmi config lists arbitrumSepolia FIRST (D-36: still exactly these two).
 *   3. Every client-side read-hook callsite carries `chainId: ACTIVE_CHAIN_ID`.
 *   4. The Circle paymaster permit domain uses ACTIVE_CHAIN_ID (not arbitrum.id).
 */

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ACTIVE_CHAIN_ID,
  ACTIVE_CHAIN,
  USDC_ADDRESS,
  CALL_REGISTRY_ADDRESS,
  FOLLOW_FADE_MARKET_ADDRESS,
  CHALLENGE_ESCROW_ADDRESS,
  PROFILE_REGISTRY_ADDRESS,
} from '../lib/chain';
import {
  USDC_ARB_SEPOLIA,
  CALL_REGISTRY_ARBITRUM_SEPOLIA,
  FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA,
  CHALLENGE_ESCROW_ARBITRUM_SEPOLIA,
  PROFILE_REGISTRY_ARBITRUM_SEPOLIA,
  ARBITRUM_SEPOLIA_CHAIN_ID,
} from '@call-it/shared';

const WEB_ROOT = path.resolve(__dirname, '..');
const read = (p: string) => readFileSync(path.join(WEB_ROOT, p), 'utf-8');

describe('chain.ts — active chain + selected addresses (B2)', () => {
  test('defaults to Arbitrum Sepolia (421614) when NEXT_PUBLIC_CHAIN_ID is unset', () => {
    expect(ACTIVE_CHAIN_ID).toBe(ARBITRUM_SEPOLIA_CHAIN_ID);
    expect(ACTIVE_CHAIN.id).toBe(ARBITRUM_SEPOLIA_CHAIN_ID);
  });

  test('selects the SEPOLIA USDC token (0x75fa...AA4d) — not mainnet 0xaf88...', () => {
    expect(USDC_ADDRESS).toBe(USDC_ARB_SEPOLIA);
    expect(USDC_ADDRESS.toLowerCase()).not.toContain('af88d065');
  });

  test('selects the Sepolia protocol cluster addresses', () => {
    expect(CALL_REGISTRY_ADDRESS).toBe(CALL_REGISTRY_ARBITRUM_SEPOLIA);
    expect(FOLLOW_FADE_MARKET_ADDRESS).toBe(FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA);
    expect(CHALLENGE_ESCROW_ADDRESS).toBe(CHALLENGE_ESCROW_ARBITRUM_SEPOLIA);
    expect(PROFILE_REGISTRY_ADDRESS).toBe(PROFILE_REGISTRY_ARBITRUM_SEPOLIA);
  });
});

describe('wagmi config — chain order (B1, D-36)', () => {
  test('arbitrumSepolia is FIRST (wagmi default chain) and only the two D-36 chains exist', () => {
    const source = read('lib/wagmi.ts');
    expect(source).toContain('chains: [arbitrumSepolia, arbitrum]');
    // D-36: the only viem/chains import is exactly the two Arbitrum chains
    expect(source).toContain("import { arbitrum, arbitrumSepolia } from 'viem/chains'");
  });
});

describe('read hooks — explicit chainId: ACTIVE_CHAIN_ID (B3)', () => {
  const HOOK_FILES = [
    'hooks/useUsdcBalance.ts',
    'hooks/useCirclePaymaster.ts',
    'app/components/ChallengeFormModal.tsx',
    'app/new/hooks/useSettledCalls.ts',
    'app/call/[id]/page.tsx',
    'app/duel/[challengeId]/page.tsx',
  ];

  for (const file of HOOK_FILES) {
    test(`${file} pins chainId: ACTIVE_CHAIN_ID and imports @/lib/chain`, () => {
      const source = read(file);
      expect(source).toContain('chainId: ACTIVE_CHAIN_ID');
      expect(source).toContain('@/lib/chain');
    });
  }

  test('no file still imports the mainnet-only USDC_ARB_NATIVE outside lib/chain.ts', () => {
    for (const file of HOOK_FILES.concat(['lib/circle-permit.ts'])) {
      expect(read(file), `${file} must not reference USDC_ARB_NATIVE`).not.toContain(
        'USDC_ARB_NATIVE',
      );
    }
  });
});

describe('Circle paymaster permit domain (latent signature bug)', () => {
  test('useCirclePaymaster builds the EIP-712 domain with ACTIVE_CHAIN_ID, not arbitrum.id', () => {
    const source = read('hooks/useCirclePaymaster.ts');
    expect(source).toContain('chainId: ACTIVE_CHAIN_ID');
    // The hook no longer imports any viem chain object — the active chain id
    // comes exclusively from @/lib/chain (code check, not comment-sensitive).
    expect(source).not.toMatch(/from 'viem\/chains'/);
  });
});
