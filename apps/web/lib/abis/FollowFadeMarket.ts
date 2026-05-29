/**
 * FollowFadeMarket ABI — typed const for viem inference.
 *
 * Source: packages/subgraph/abis/FollowFadeMarket.json (Plan 02-04 output)
 * Used by: useReadContracts in apps/web/app/call/[id]/page.tsx (Plan 02-08)
 *          useWriteContract for follow/fade/exitPosition/callerExit
 *
 * Requirements: SOCIAL-05, SOCIAL-06, SOCIAL-12, SOCIAL-13, SOCIAL-17, SOCIAL-18, SOCIAL-25
 */

export const followFadeMarketAbi = [
  {
    type: 'function',
    name: 'follow',
    inputs: [
      { name: 'callId', type: 'uint256', internalType: 'uint256' },
      { name: 'amountIn', type: 'uint256', internalType: 'uint256' },
      { name: 'minSharesOut', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'fade',
    inputs: [
      { name: 'callId', type: 'uint256', internalType: 'uint256' },
      { name: 'amountIn', type: 'uint256', internalType: 'uint256' },
      { name: 'minSharesOut', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'exitPosition',
    inputs: [
      { name: 'callId', type: 'uint256', internalType: 'uint256' },
      { name: 'side', type: 'uint8', internalType: 'enum IFollowFadeMarket.Side' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'callerExit',
    inputs: [{ name: 'callId', type: 'uint256', internalType: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'followReserve',
    inputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'fadeReserve',
    inputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'followTotalShares',
    inputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'fadeTotalShares',
    inputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'followShares',
    inputs: [
      { name: '', type: 'uint256', internalType: 'uint256' },
      { name: '', type: 'address', internalType: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'fadeShares',
    inputs: [
      { name: '', type: 'uint256', internalType: 'uint256' },
      { name: '', type: 'address', internalType: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'followEntryTime',
    inputs: [
      { name: '', type: 'uint256', internalType: 'uint256' },
      { name: '', type: 'address', internalType: 'address' },
    ],
    outputs: [{ name: '', type: 'uint64', internalType: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'fadeEntryTime',
    inputs: [
      { name: '', type: 'uint256', internalType: 'uint256' },
      { name: '', type: 'address', internalType: 'address' },
    ],
    outputs: [{ name: '', type: 'uint64', internalType: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'callerExitedAt',
    inputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '', type: 'uint64', internalType: 'uint64' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'computeCallerExitPenaltyPct',
    inputs: [{ name: 'callId', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'followPosition',
    inputs: [
      { name: '', type: 'uint256', internalType: 'uint256' },
      { name: '', type: 'address', internalType: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'fadePosition',
    inputs: [
      { name: '', type: 'uint256', internalType: 'uint256' },
      { name: '', type: 'address', internalType: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'error',
    name: 'SlippageExceeded',
    inputs: [
      { name: 'minOut', type: 'uint256', internalType: 'uint256' },
      { name: 'actualOut', type: 'uint256', internalType: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'CallerExitLocked',
    inputs: [{ name: 'unlocksAt', type: 'uint64', internalType: 'uint64' }],
  },
  {
    type: 'error',
    name: 'ExitCooldownActive',
    inputs: [{ name: 'unlocksAt', type: 'uint64', internalType: 'uint64' }],
  },
  {
    type: 'event',
    name: 'Followed',
    inputs: [
      { name: 'callId', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'user', type: 'address', indexed: true, internalType: 'address' },
      { name: 'amountIn', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'sharesOut', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Faded',
    inputs: [
      { name: 'callId', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'user', type: 'address', indexed: true, internalType: 'address' },
      { name: 'amountIn', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'sharesOut', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'CallerExited',
    inputs: [
      { name: 'callId', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'caller', type: 'address', indexed: true, internalType: 'address' },
      { name: 'timeElapsed', type: 'uint64', indexed: false, internalType: 'uint64' },
      { name: 'penaltyPaid', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'stakeReturned', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'reputationDelta', type: 'int256', indexed: false, internalType: 'int256' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'PositionExited',
    inputs: [
      { name: 'callId', type: 'uint256', indexed: true, internalType: 'uint256' },
      { name: 'user', type: 'address', indexed: true, internalType: 'address' },
      { name: 'side', type: 'uint8', indexed: false, internalType: 'enum IFollowFadeMarket.Side' },
      { name: 'usdcReturned', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'slashAmount', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
    anonymous: false,
  },
] as const;
