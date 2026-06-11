/**
 * CallRegistry ABI — typed const for viem inference.
 *
 * Source: packages/contracts/src/CallRegistry.sol (Plan 02 output)
 * The ABI is extracted from packages/contracts/out/CallRegistry.sol/CallRegistry.json
 * after `forge build` (Plan 02). This stub captures the Phase 1 contract surface
 * that Plan 08 (createCall) and Plan 09 (feed reads) will consume.
 *
 * POST-PLAN-02 NOTE: Run `forge build` in packages/contracts, then copy the `abi` array
 * from out/CallRegistry.sol/CallRegistry.json here and replace this stub.
 * The ABI shape is stable once Plan 02 ships.
 *
 * Requirements: CALL-01..70 (via createCall function), CALL-67 (getCallsByUser)
 */

export const callRegistryAbi = [
  // ─── Events ──────────────────────────────────────────────────────────
  {
    type: 'event',
    name: 'CallCreated',
    inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'caller', type: 'address', indexed: true },
      { name: 'marketType', type: 'uint8', indexed: false },
      { name: 'stake', type: 'uint96', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CallQuoted',
    inputs: [
      { name: 'parentId', type: 'uint256', indexed: true },
      { name: 'quoteId', type: 'uint256', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'ConvictionCapped',
    inputs: [
      { name: 'caller', type: 'address', indexed: true },
      { name: 'requested', type: 'uint8', indexed: false },
      { name: 'applied', type: 'uint8', indexed: false },
    ],
  },
  // ─── Custom errors ────────────────────────────────────────────────────
  { type: 'error', name: 'StakeBelowMinimum', inputs: [] },
  { type: 'error', name: 'StakeAboveMaximum', inputs: [] },
  { type: 'error', name: 'ExpiryNotInFuture', inputs: [] },
  { type: 'error', name: 'CategoryInvalid', inputs: [] },
  { type: 'error', name: 'AssetNotAllowlisted', inputs: [] },
  {
    type: 'error',
    name: 'CriteriaRequired',
    inputs: [
      { name: 'marketType', type: 'uint8' },
      { name: 'subtype', type: 'uint8' },
    ],
  },
  {
    type: 'error',
    name: 'DuplicateCall',
    inputs: [{ name: 'existingCallId', type: 'uint256' }],
  },
  {
    type: 'error',
    name: 'TvlCapReached',
    inputs: [
      { name: 'requested', type: 'uint256' },
      { name: 'available', type: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'InsufficientUsdcAllowance',
    inputs: [
      { name: 'needed', type: 'uint256' },
      { name: 'actual', type: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'InsufficientUsdcBalance',
    inputs: [
      { name: 'needed', type: 'uint256' },
      { name: 'actual', type: 'uint256' },
    ],
  },
  // ─── Constructor ─────────────────────────────────────────────────────
  {
    type: 'constructor',
    inputs: [
      { name: '_profileRegistry', type: 'address' },
      { name: '_tvlCap', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  // ─── Main entry ───────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'createCall',
    inputs: [
      { name: 'marketType', type: 'uint8' },
      { name: 'eventSubtype', type: 'uint8' },
      { name: 'category', type: 'uint8' },
      { name: 'assetA', type: 'uint256' },
      { name: 'assetB', type: 'uint256' },
      { name: 'targetValue', type: 'uint256' },
      { name: 'expiry', type: 'uint64' },
      { name: 'stake', type: 'uint96' },
      { name: 'conviction', type: 'uint8' },
      { name: 'criteriaHash', type: 'bytes32' },
      { name: 'openToChallenges', type: 'bool' },
      { name: 'parentCallId', type: 'uint256' },
    ],
    outputs: [{ name: 'callId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  // ─── View functions ───────────────────────────────────────────────────
  // getCall added for the duel-page on-chain asset/marketType read — tuple mirrors apps/relayer/src/lib/call-enrichment.ts:40-74 (quick-260611-vob).
  {
    type: 'function',
    name: 'getCall',
    stateMutability: 'view',
    inputs: [{ name: 'callId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'caller', type: 'address' },
          { name: 'stake', type: 'uint96' },
          { name: 'virtualFadeSeed', type: 'uint96' },
          { name: 'createdAt', type: 'uint64' },
          { name: 'expiry', type: 'uint64' },
          { name: 'marketType', type: 'uint8' },
          { name: 'eventSubtype', type: 'uint8' },
          { name: 'category', type: 'uint8' },
          { name: 'status', type: 'uint8' },
          { name: 'conviction', type: 'uint8' },
          { name: 'openToChallenges', type: 'bool' },
          { name: 'callerExitedAt', type: 'uint64' },
          { name: 'outcome', type: 'uint8' },
          { name: 'duplicateHash', type: 'bytes32' },
          { name: 'criteriaHash', type: 'bytes32' },
          { name: 'assetA', type: 'uint256' },
          { name: 'assetB', type: 'uint256' },
          { name: 'targetValue', type: 'uint256' },
          { name: 'parentCallId', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getCallsByUser',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'offset', type: 'uint256' },
      { name: 'limit', type: 'uint256' },
    ],
    outputs: [{ name: 'callIds', type: 'uint256[]' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'computeDuplicateHash',
    inputs: [
      { name: 'marketType', type: 'uint8' },
      { name: 'assetA', type: 'uint256' },
      { name: 'metric', type: 'uint256' },
      { name: 'targetValue', type: 'uint256' },
      { name: 'deadlineDay', type: 'uint64' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'pure',
  },
  {
    type: 'function',
    name: 'computeCallerExitPenalty',
    inputs: [{ name: 'callId', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'currentTvl',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'tvlCap',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'activeDuplicateHashes',
    inputs: [{ name: 'hash', type: 'bytes32' }],
    outputs: [{ name: 'callId', type: 'uint256' }],
    stateMutability: 'view',
  },
  // ─── Owner functions ──────────────────────────────────────────────────
  {
    type: 'function',
    name: 'addAsset',
    inputs: [
      { name: 'symbol', type: 'string' },
      { name: 'feedId', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'addNftCollection',
    inputs: [{ name: 'collection', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setTvlCap',
    inputs: [{ name: 'newCap', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'pause',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'unpause',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;
