/**
 * Task 2 TDD — DER-to-viem-hex helper tests
 *
 * Tests the DER signature decoder + low-S normalization + recovery-bit search.
 * No GCP dependency — uses hard-coded test vectors generated with @noble/curves.
 */

import { describe, it, expect } from 'vitest';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak256, toBytes, bytesToHex, hexToBytes } from 'viem';
import { derToViemHex, KmsSignerError } from '../src/lib/der-to-viem-hex.js';

/**
 * Encode an (r, s) pair as DER — mimics what GCP KMS returns.
 *
 * DER structure: 0x30 <total-len> 0x02 <r-len> <r> 0x02 <s-len> <s>
 * r and s are big-endian; leading 0x00 is required if high bit is set.
 */
function encodeDer(r: bigint, s: bigint): Uint8Array {
  function encodeInt(n: bigint): Uint8Array {
    let hex = n.toString(16);
    if (hex.length % 2 !== 0) hex = '0' + hex;
    const bytes = hexToBytes(('0x' + hex) as `0x${string}`);
    // Prepend 0x00 if high bit is set (DER requires positive integer encoding)
    if (bytes[0]! & 0x80) {
      return new Uint8Array([0x00, ...bytes]);
    }
    return bytes;
  }

  const rBytes = encodeInt(r);
  const sBytes = encodeInt(s);

  const totalLen = 2 + rBytes.length + 2 + sBytes.length;
  const der = new Uint8Array(2 + totalLen);
  let offset = 0;
  der[offset++] = 0x30;
  der[offset++] = totalLen;
  der[offset++] = 0x02;
  der[offset++] = rBytes.length;
  der.set(rBytes, offset);
  offset += rBytes.length;
  der[offset++] = 0x02;
  der[offset++] = sBytes.length;
  der.set(sBytes, offset);

  return der;
}

/**
 * Compute a message hash for a raw 32-byte message (used in EIP-191 signing).
 * Mimics the pre-image that gcpKmsAccount.signMessage would hash over.
 */
function hashForSigning(message: string): `0x${string}` {
  // EIP-191: "\x19Ethereum Signed Message:\n{len}{message}"
  const prefix = '\x19Ethereum Signed Message:\n';
  const msgBytes = toBytes(message);
  const prefixBytes = toBytes(prefix + msgBytes.length.toString());
  const combined = new Uint8Array(prefixBytes.length + msgBytes.length);
  combined.set(prefixBytes, 0);
  combined.set(msgBytes, prefixBytes.length);
  return keccak256(combined);
}

/**
 * Derive Ethereum address from secp256k1 private key.
 */
function privateKeyToAddress(privateKey: bigint): `0x${string}` {
  const pubKey = secp256k1.getPublicKey(privateKey, false); // uncompressed
  // pubKey is 65 bytes: 0x04 || X || Y
  // address = keccak256(pubKey[1:])[12:]
  const pubKeyHash = keccak256(pubKey.slice(1));
  return ('0x' + pubKeyHash.slice(-40)) as `0x${string}`;
}

describe('derToViemHex', () => {
  // Known private key for test vector generation
  const PRIVATE_KEY_1 = 0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefn;
  const ADDRESS_1 = privateKeyToAddress(PRIVATE_KEY_1);

  it('Vector 1: correctly decodes DER and recovers expected address (v=27 case)', () => {
    const message = 'hello world';
    const digest = hashForSigning(message);
    const digestBytes = hexToBytes(digest);

    // Sign with noble/secp256k1 directly (produces compact 64-byte sig + recovery bit)
    const sig = secp256k1.sign(digestBytes, PRIVATE_KEY_1.toString(16).padStart(64, '0'));
    const r = sig.r;
    const s = sig.s;

    // Encode as DER (simulating what KMS returns)
    const der = encodeDer(r, s);

    // derToViemHex should recover the correct address
    const viemHex = derToViemHex(der, digest, ADDRESS_1);
    expect(viemHex).toMatch(/^0x[0-9a-f]{130}$/i); // 65 bytes = 130 hex chars
    expect(viemHex.length).toBe(132); // 0x + 130 chars
  });

  it('Vector 2: low-S normalization produces correct result', () => {
    const PRIVATE_KEY_2 = 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefn;
    const ADDRESS_2 = privateKeyToAddress(PRIVATE_KEY_2);

    const message = 'low-s-test';
    const digest = hashForSigning(message);
    const digestBytes = hexToBytes(digest);

    const sig = secp256k1.sign(digestBytes, PRIVATE_KEY_2.toString(16).padStart(64, '0'));
    const n = secp256k1.CURVE.n;
    // Force high-S by using n - s (which requires normalization back to low-S)
    const highS = n - sig.s;

    // Encode DER with high-S (as KMS might return it)
    const der = encodeDer(sig.r, highS);

    // derToViemHex should normalize to low-S and still recover the address
    const viemHex = derToViemHex(der, digest, ADDRESS_2);
    expect(viemHex).toMatch(/^0x[0-9a-f]{130}$/i);

    // Verify that the s value in the output is the low-S
    const sHex = viemHex.slice(66, 130); // bytes 32–64 of the 65-byte sig
    const sValue = BigInt('0x' + sHex);
    expect(sValue <= n / 2n).toBe(true);
  });

  it('Vector 3: throws KmsSignerError when DER does not recover to expectedAddress', () => {
    const PRIVATE_KEY_3 = 0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210n;

    const message = 'wrong-address-test';
    const digest = hashForSigning(message);
    const digestBytes = hexToBytes(digest);

    const sig = secp256k1.sign(digestBytes, PRIVATE_KEY_3.toString(16).padStart(64, '0'));
    const der = encodeDer(sig.r, sig.s);

    // Use a DIFFERENT address than what this key would produce
    const wrongAddress = '0x0000000000000000000000000000000000000001' as `0x${string}`;

    expect(() => derToViemHex(der, digest, wrongAddress)).toThrowError(KmsSignerError);
    expect(() => derToViemHex(der, digest, wrongAddress)).toThrowError(
      'No recovery bit matches expected address',
    );
  });
});
