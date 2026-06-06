/**
 * Structured social-link proofHash (D-05) — no PII on-chain.
 *
 * The relayer commits a keccak256 digest of the canonical claims it verified
 * (user address, platform, handle, OAuth subject/id, issuedAt, attestation nonce)
 * to ProfileRegistry.linkTwitter/linkFarcaster as `proofHash`. Only the digest is
 * written on-chain — the raw handle/subject/nonce never leave the relayer, so no
 * PII is published (D-05, V8 Data Protection).
 *
 * The digest provides an auditable (user ↔ handle) binding commitment, mirroring
 * the project's KMS/EIP-712 attestation discipline (Phase 4). It is NOT a signature
 * — authorization is enforced by msg.sender == relayer on-chain; this hash binds
 * the verified claims so a later audit can reproduce the commitment.
 *
 * Security (V6 Cryptography): keccak256 via viem — never hand-rolled.
 *
 * Requirements: AUTH-06, AUTH-07, D-05.
 */

import { keccak256, encodeAbiParameters, type Hex } from 'viem';

/** platform discriminant — matches ProfileRegistry SocialLinked event `kind` (0=twitter, 1=farcaster). */
export type SocialPlatform = 0 | 1;

export const PLATFORM_TWITTER: SocialPlatform = 0;
export const PLATFORM_FARCASTER: SocialPlatform = 1;

/**
 * Compute the structured proofHash committed on-chain (D-05).
 *
 * keccak256(abi.encode(
 *   address user, uint8 platform, string handle, string subject, uint64 issuedAt, bytes32 nonce
 * ))
 *
 * Properties (verified by social-proof-hash.test.ts):
 *  - Deterministic: identical inputs → identical hash.
 *  - Sensitive: changing ANY field (handle, subject, nonce, …) changes the hash.
 *  - Shape: 0x + 64 hex chars (a 32-byte keccak digest) — carries no readable PII.
 *
 * @param user      on-chain wallet address the handle is being linked to
 * @param platform  0 = twitter, 1 = farcaster
 * @param handle    verified handle (from Privy / SIWF — never request body)
 * @param subject   stable OAuth subject / id (X user id, or Farcaster fid as string)
 * @param issuedAt  unix seconds the relayer verified the proof
 * @param nonce     32-byte attestation nonce (see generateNonce)
 */
export function computeProofHash(
  user: `0x${string}`,
  platform: SocialPlatform,
  handle: string,
  subject: string,
  issuedAt: number,
  nonce: Hex,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'uint8' },
        { type: 'string' },
        { type: 'string' },
        { type: 'uint64' },
        { type: 'bytes32' },
      ],
      [user, platform, handle, subject, BigInt(issuedAt), nonce],
    ),
  );
}

/**
 * Generate a 32-byte hex attestation nonce (0x + 64 hex chars).
 *
 * Used both for the proofHash and as the server-issued SIWF nonce (Pitfall 3 —
 * the SIWF nonce is stored in Redis with a short TTL by the link route so the
 * Farcaster verify step can require the exact nonce the server issued).
 *
 * Uses the platform Web Crypto API (globalThis.crypto) — available on Node 22 LTS.
 */
export function generateNonce(): Hex {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  let hex = '0x';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return hex as Hex;
}
