/**
 * ProfileRegistry ABI — typed const for viem inference.
 *
 * Source: packages/contracts/src/ProfileRegistry.sol (Plan 02 output)
 * The ABI is extracted from packages/contracts/out/ProfileRegistry.sol/ProfileRegistry.json
 * after `forge build` (Plan 02). This stub captures the Phase 1 contract surface
 * that Plan 08 (profile writes) and Plan 09 (profile reads) will consume.
 *
 * POST-PLAN-02 NOTE: Run `forge build` in packages/contracts, then copy the `abi` array
 * from out/ProfileRegistry.sol/ProfileRegistry.json here and replace this stub.
 *
 * Key reads in Phase 1:
 *   - settledCalls(user) — needed by createCall high-conviction floor (CALL-28..31)
 *   - displayHandle(user) — for profile pages (AUTH-11)
 *
 * Requirements: AUTH-35, AUTH-39/40/41, AUTH-42, REP-01/02, REP-17/18
 */

export const profileRegistryAbi = [
  // ─── Events ──────────────────────────────────────────────────────────
  {
    type: 'event',
    name: 'ProfileUpdated',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'displayHandle', type: 'string', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'SettlementManagerSet',
    inputs: [{ name: 'newManager', type: 'address', indexed: false }],
  },
  {
    type: 'event',
    name: 'RelayerSet',
    inputs: [{ name: 'newRelayer', type: 'address', indexed: false }],
  },
  // ─── Custom errors ────────────────────────────────────────────────────
  { type: 'error', name: 'HandleTooLong', inputs: [] },
  { type: 'error', name: 'NotRelayer', inputs: [] },
  { type: 'error', name: 'NotSettlementManager', inputs: [] },
  // ─── Constructor ─────────────────────────────────────────────────────
  {
    type: 'constructor',
    inputs: [],
    stateMutability: 'nonpayable',
  },
  // ─── User functions ───────────────────────────────────────────────────
  {
    type: 'function',
    name: 'setDisplayHandle',
    inputs: [{ name: 'handle', type: 'string' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // ─── View functions ───────────────────────────────────────────────────
  {
    type: 'function',
    name: 'settledCalls',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'displayHandle',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'globalRep',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'totalCalls',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'profileExists',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  // ─── Owner rotation functions (AUTH-39/40/41) ─────────────────────────
  {
    type: 'function',
    name: 'setSettlementManager',
    inputs: [{ name: 'newManager', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setRelayer',
    inputs: [{ name: 'newRelayer', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // ─── Settlement functions (Phase 4 — stubs in Phase 1) ───────────────
  {
    type: 'function',
    name: 'recordSettledCall',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // ─── Social unlink (AUTH-12, user-callable — Phase 1.5 SocialLinkControls) ─
  // unlinkTwitter()/unlinkFarcaster() are msg.sender-self-service on-chain
  // (ProfileRegistry.sol:168-182). They remove the badge + handle reference but
  // retain on-chain history. The relayer purge (/api/social/unlink-purge) is a
  // separate side call that clears the off-chain follow-graph (D-13/AUTH-17).
  {
    type: 'function',
    name: 'unlinkTwitter',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'unlinkFarcaster',
    inputs: [],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;
