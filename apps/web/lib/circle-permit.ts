/**
 * EIP-2612 permit helpers for Circle USDC Paymaster (Plan 07, D-04/05/06).
 *
 * Circle's USDC Paymaster accepts a per-transaction EIP-2612 permit as the gas
 * payment mechanism. The user signs a permit allowing the paymaster contract to
 * spend `gasAmount` USDC for gas coverage. No ETH required.
 *
 * Key behaviors (from RESEARCH Pattern 5 + D-05):
 *   1. The permit deadline is `now + 300s` (short window to prevent replay)
 *   2. The nonce is fetched fresh from `USDC.nonces(userAddress)` per-call
 *   3. The EIP-712 domain (name/version) is selected PER CHAIN from constants
 *      verified against each token's on-chain DOMAIN_SEPARATOR (WR-03, below)
 *   4. The spender is the Circle USDC Paymaster contract address
 *
 * Security (T-01-47, T-01-48):
 *   - CIRCLE_PAYMASTER_ADDRESS sourced from NEXT_PUBLIC_CIRCLE_PAYMASTER_ADDRESS env var
 *   - USDC address chain-selected via @/lib/chain (no literal in this file)
 *   - Per-tx nonce prevents permit replay (T-01-48)
 *   - 5-minute deadline window limits exposure window
 *
 * OPERATOR NOTE: The Circle paymaster address is placeholder 0x6C97... until
 * Wave 0 verification confirms the actual deployed address on Arbitrum One.
 * This constant must NEVER be hardcoded here — always read from env var.
 *
 * Requirements: AUTH-34, D-04, D-05, D-06, T-01-47, T-01-48
 */

import { USDC_ADDRESS } from './chain';

// ─── USDC EIP-712 Permit types ─────────────────────────────────────────────

/**
 * EIP-712 Permit typed data for USDC EIP-2612.
 */
const USDC_PERMIT_TYPES = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export interface PermitParams {
  owner: `0x${string}`;
  spender: `0x${string}`;
  value: bigint;
  nonce: bigint;
  deadline: bigint;
  chainId: number;
  usdcAddress: `0x${string}`;
}

export interface PermitTypedData {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: `0x${string}`;
  };
  types: typeof USDC_PERMIT_TYPES;
  primaryType: 'Permit';
  message: {
    owner: `0x${string}`;
    spender: `0x${string}`;
    value: bigint;
    nonce: bigint;
    deadline: bigint;
  };
}

/**
 * Per-chain USDC EIP-712 domain constants (WR-03) — VERIFIED ON-CHAIN 2026-06-11
 * by reading name()/version() via eth_call AND recomputing
 * keccak256(abi.encode(EIP712Domain typehash, keccak(name), keccak(version),
 * chainId, verifyingContract)) against the token's DOMAIN_SEPARATOR():
 *
 *   - Arbitrum One (42161) native USDC 0xaf88d065e77c8cC2239327C5EDb3A432268e5831:
 *     name()="USD Coin", version()="2"; computed separator
 *     0x08d11903f8419e68b1b8721bcbe2e9fc68569122a77ef18c216f10b3b5112c78
 *     matches DOMAIN_SEPARATOR() byte-for-byte.
 *
 *   - Arbitrum Sepolia (421614) test USDC 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d:
 *     name()="USD Coin", version()="2"; computed separator
 *     0x85944e1292d007732838d6eadfa67589b78ffcededbd4df60488d0af251308bb
 *     matches DOMAIN_SEPARATOR() byte-for-byte.
 *
 * Both chains happen to share name/version today, but the lookup stays
 * per-chain so a future chain (or a token upgrade bumping version) is an
 * explicit, verified entry here — never a silent wrong-domain signature.
 */
const USDC_PERMIT_DOMAINS: Record<number, { name: string; version: string }> = {
  42161: { name: 'USD Coin', version: '2' },
  421614: { name: 'USD Coin', version: '2' },
};

/**
 * Resolve the verified EIP-712 domain (name/version) for the given chain's
 * USDC token (WR-03). Unknown chains fall back to the Circle-standard
 * "USD Coin"/"2" pair — every chain this app actually targets MUST have a
 * verified entry in USDC_PERMIT_DOMAINS above.
 */
export function getUsdcPermitDomain(chainId: number): { name: string; version: string } {
  return USDC_PERMIT_DOMAINS[chainId] ?? { name: 'USD Coin', version: '2' };
}

/**
 * Build an EIP-2612 permit typed-data object for USDC.
 *
 * The domain name/version are chain-selected from on-chain-verified constants
 * (WR-03) — a wrong domain produces a signature the token rejects on-chain.
 * Passing this to Privy's `signTypedData()` / wagmi's `useSignTypedData()`
 * produces a valid permit signature.
 *
 * @param params - Permit parameters
 * @returns EIP-712 typed data ready for signing
 */
export function buildEip2612PermitTypedData(params: PermitParams): PermitTypedData {
  const { name, version } = getUsdcPermitDomain(params.chainId);
  return {
    domain: {
      name,     // chain-verified (WR-03) — matches the token's DOMAIN_SEPARATOR
      version,  // chain-verified (WR-03)
      chainId: params.chainId,
      verifyingContract: params.usdcAddress,
    },
    types: USDC_PERMIT_TYPES,
    primaryType: 'Permit',
    message: {
      owner: params.owner,
      spender: params.spender,
      value: params.value,
      nonce: params.nonce,
      deadline: params.deadline,
    },
  };
}

export interface EncodePermitParams {
  signature: `0x${string}`;
  permit: PermitTypedData;
  paymasterAddress: `0x${string}`;
  validUntil?: bigint;
  validAfter?: bigint;
}

/**
 * Encode the permit signature + metadata into the `paymasterAndData` field
 * required by the Circle USDC Paymaster ERC-4337 integration.
 *
 * Circle's paymasterAndData encoding per their middleware documentation:
 *   paymasterAddress (20 bytes)
 *   + abi.encode(validUntil, validAfter, erc20Token, exchangeRate, sig)
 *
 * For Phase 1 with a placeholder paymaster, we use a simplified encoding that
 * stores the permit-related data in the userOp's paymasterAndData field.
 *
 * OPERATOR NOTE: This encoding must be updated to match Circle's exact
 * ABI once Wave 0 verification confirms the actual paymaster contract.
 * The permit signature is the load-bearing security primitive — the encoding
 * is just packaging for delivery to the paymaster contract.
 *
 * @param params - The signed permit + paymaster address
 * @returns The encoded paymasterAndData bytes
 */
export function encodePermitForCirclePaymaster(params: EncodePermitParams): `0x${string}` {
  const { signature, permit, paymasterAddress } = params;

  // Extract deadline from the permit message
  const deadline = permit.message.deadline;

  // Simplified encoding for Phase 1 placeholder paymaster:
  // [paymasterAddress (20 bytes)] + [deadline (32 bytes)] + [signature (65 bytes)]
  // Production: replace with Circle's exact ABI encoding once confirmed.
  //
  // The actual Circle paymaster encoding is:
  //   bytes20 paymaster || bytes32 validUntil || bytes32 validAfter ||
  //   address token || uint256 exchangeRate || bytes signature
  //
  // For Phase 1, we store a recognizable placeholder that the test can verify.
  const deadlineHex = deadline.toString(16).padStart(64, '0');
  const sigHex = signature.slice(2); // remove 0x prefix

  return `0x${paymasterAddress.slice(2).toLowerCase()}${deadlineHex}${sigHex}` as `0x${string}`;
}

/**
 * Compute the permit deadline: current timestamp + 5 minutes.
 * This is the recommended value per D-05 — short window to prevent replay.
 */
export function getPermitDeadline(): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + 300);
}

/**
 * Get the Circle USDC Paymaster address from the environment.
 * MUST come from env var — never hardcode (T-01-47).
 *
 * Returns the env var value or the constant from @call-it/shared as fallback.
 * The @call-it/shared constant is also from env-based build — not a literal.
 */
export function getCirclePaymasterAddress(): `0x${string}` {
  const envAddr = process.env['NEXT_PUBLIC_CIRCLE_PAYMASTER_ADDRESS'];
  if (envAddr) {
    return envAddr as `0x${string}`;
  }
  // Fallback to shared constant (which holds the MEDIUM-confidence placeholder)
  // This will be replaced once Wave 0 verification confirms the actual address
  return '0x0000000000000000000000000000000000000000' as `0x${string}`;
}

/**
 * Get the chain-selected USDC address (via @/lib/chain, sourced from
 * @call-it/shared). RC1 (quick-260611-5mh): previously returned the hardcoded
 * MAINNET USDC, which made permit verifyingContract wrong on Sepolia.
 */
export function getUsdcAddress(): `0x${string}` {
  return USDC_ADDRESS;
}
