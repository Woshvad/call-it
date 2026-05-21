/**
 * DER-to-viem-hex converter for GCP KMS secp256k1 signatures.
 *
 * GCP KMS returns signatures in DER-encoded format (RFC 5480 / BIP-0066).
 * viem expects compact 65-byte signatures: 0x{r32}{s32}{v1}
 *
 * This helper:
 * 1. Parses the DER structure to extract r and s
 * 2. Normalizes s to low-S (BIP-0066 / EIP-2) if s > n/2
 * 3. Tries both recovery bits (v=27, v=28) to find the one that ecrecovers
 *    to the expected Ethereum address
 * 4. Returns the 65-byte compact hex or throws KmsSignerError
 *
 * Referenced in: Pattern 3 (lines 600–628 of 00-RESEARCH.md)
 * Covers: T-00-10 (D-07 blast-radius isolation), T-00-13 (audit trail)
 */

import { secp256k1 } from '@noble/curves/secp256k1';
import {
  keccak256,
  type Hex,
} from 'viem';

/** Custom error for KMS signer failures — distinguishes from generic errors */
export class KmsSignerError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'KmsSignerError';
    if (cause) this.cause = cause;
  }
}

/**
 * Parse a DER-encoded secp256k1 signature into (r, s) bigints.
 *
 * DER structure (RFC 5480 / BIP-0066):
 *   0x30 <total-len> 0x02 <r-len> <r-bytes> 0x02 <s-len> <s-bytes>
 *
 * GCP KMS always produces well-formed DER. We validate the structure
 * strictly to catch any malformed input early.
 */
function parseDer(der: Uint8Array): { r: bigint; s: bigint } {
  if (der[0] !== 0x30) {
    throw new KmsSignerError(`DER: expected 0x30 SEQUENCE tag, got 0x${der[0]?.toString(16)}`);
  }

  let offset = 2; // skip 0x30 + length byte

  if (der[offset] !== 0x02) {
    throw new KmsSignerError(`DER: expected 0x02 INTEGER tag for r, got 0x${der[offset]?.toString(16)}`);
  }
  offset++; // skip 0x02

  const rLen = der[offset++]!;
  const rBytes = der.slice(offset, offset + rLen);
  offset += rLen;

  if (der[offset] !== 0x02) {
    throw new KmsSignerError(`DER: expected 0x02 INTEGER tag for s, got 0x${der[offset]?.toString(16)}`);
  }
  offset++; // skip 0x02

  const sLen = der[offset++]!;
  const sBytes = der.slice(offset, offset + sLen);

  // Convert bytes to bigints (strip any leading 0x00 byte that DER adds for sign)
  const r = BigInt('0x' + Buffer.from(rBytes).toString('hex'));
  const s = BigInt('0x' + Buffer.from(sBytes).toString('hex'));

  return { r, s };
}

/**
 * Recover an Ethereum address from a secp256k1 signature.
 *
 * @param digest - 32-byte message hash as 0x-prefixed hex
 * @param r - r component
 * @param s - s component
 * @param recovery - 0 or 1 (maps to v=27 or v=28)
 */
function recoverAddress(digest: Hex, r: bigint, s: bigint, recovery: 0 | 1): `0x${string}` | null {
  try {
    const digestBytes = hexToBytes32(digest);
    const pubKey = secp256k1.Signature.fromCompact(
      r.toString(16).padStart(64, '0') + s.toString(16).padStart(64, '0'),
    )
      .addRecoveryBit(recovery)
      .recoverPublicKey(digestBytes)
      .toRawBytes(false); // uncompressed: 65 bytes starting with 0x04

    // Ethereum address = keccak256(pubKey[1:65])[12:]
    const pubKeyHash = keccak256(pubKey.slice(1) as Uint8Array);
    return ('0x' + pubKeyHash.slice(-40)) as `0x${string}`;
  } catch {
    return null;
  }
}

/**
 * Helper: convert a 0x-prefixed hex string to a 32-byte Uint8Array.
 */
function hexToBytes32(hex: Hex): Uint8Array {
  const stripped = hex.startsWith('0x') ? hex.slice(2) : hex;
  const padded = stripped.padStart(64, '0');
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Convert a GCP KMS DER-encoded secp256k1 signature to a viem-compatible
 * compact 65-byte hex string with recovery bit.
 *
 * @param der - DER-encoded signature bytes from kms.asymmetricSign response
 * @param digest - 32-byte message hash (as 0x-prefixed hex) that was signed
 * @param expectedAddress - Ethereum address derived from the KMS key's public key;
 *   used to determine the correct recovery bit (v)
 * @returns 0x-prefixed 65-byte hex: r(32) || s(32) || v(1)
 * @throws {KmsSignerError} if DER is malformed or neither recovery bit matches
 */
export function derToViemHex(der: Uint8Array, digest: Hex, expectedAddress: Hex): Hex {
  const { r, s: rawS } = parseDer(der);

  // Low-S normalization (BIP-0066 / EIP-2):
  // If s > n/2, use s = n - s to get the canonical low-S form.
  const n = secp256k1.CURVE.n;
  const s = rawS > n / 2n ? n - rawS : rawS;

  // Normalize addresses for comparison (lowercase)
  const normalizedExpected = expectedAddress.toLowerCase() as `0x${string}`;

  // Try both recovery bits to find the one that ecrecovers to expectedAddress
  for (const recovery of [0, 1] as const) {
    const recovered = recoverAddress(digest, r, s, recovery);
    if (recovered && recovered.toLowerCase() === normalizedExpected) {
      // Build 65-byte compact hex: r(32) || s(32) || v(1)
      const rHex = r.toString(16).padStart(64, '0');
      const sHex = s.toString(16).padStart(64, '0');
      const vHex = (27 + recovery).toString(16).padStart(2, '0');
      return `0x${rHex}${sHex}${vHex}` as Hex;
    }
  }

  throw new KmsSignerError(
    `No recovery bit matches expected address ${expectedAddress} for this signature. ` +
      'This may indicate key version mismatch or DER corruption. ' +
      'Run verifyKmsAddress() at boot to detect key configuration drift (T-00-17).',
  );
}
