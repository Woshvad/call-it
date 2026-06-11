/**
 * Minimal USDC/ERC-20 ABI — allowance + balanceOf + approve only.
 *
 * Source: copied VERBATIM from the proven inline USDC_ABI in
 * apps/web/app/components/ChallengeFormModal.tsx (quick-260611-co5).
 * Intentionally minimal — this is NOT a full ERC-20 ABI; it covers exactly
 * the surface the money flows need (allowance check + approve before a
 * registry/escrow pull, balance reads).
 */

export const erc20Abi = [
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const;
