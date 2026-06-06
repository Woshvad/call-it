/**
 * D-05 — structured proofHash (no PII on-chain).
 *
 * Asserts:
 *  - identical inputs → identical hash (deterministic).
 *  - changing any field (handle, subject, nonce, …) changes the hash (sensitive).
 *  - output is 0x + 64 hex chars (a 32-byte keccak digest; carries no readable PII).
 *  - generateNonce returns a 32-byte hex value.
 *
 * Requirement: D-05.
 */
import { describe, it, expect } from 'vitest';
import {
  computeProofHash,
  generateNonce,
  PLATFORM_TWITTER,
  PLATFORM_FARCASTER,
} from '../src/lib/social-proof-hash.js';

const USER = '0x1111111111111111111111111111111111111111' as const;
const NONCE = ('0x' + 'ab'.repeat(32)) as `0x${string}`;
const NONCE_2 = ('0x' + 'cd'.repeat(32)) as `0x${string}`;

describe('D-05: computeProofHash', () => {
  it('is deterministic — identical inputs yield identical hash', () => {
    const a = computeProofHash(USER, PLATFORM_TWITTER, 'alice', 'x-sub-1', 1_700_000_000, NONCE);
    const b = computeProofHash(USER, PLATFORM_TWITTER, 'alice', 'x-sub-1', 1_700_000_000, NONCE);
    expect(a).toBe(b);
  });

  it('output shape is 0x + 64 hex chars (32-byte keccak digest, no PII)', () => {
    const h = computeProofHash(USER, PLATFORM_TWITTER, 'alice', 'x-sub-1', 1_700_000_000, NONCE);
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
    // No readable PII: the cleartext handle/subject must not appear in the digest.
    expect(h.toLowerCase()).not.toContain('alice');
    expect(h.toLowerCase()).not.toContain('x-sub-1');
  });

  it('changing the handle changes the hash', () => {
    const a = computeProofHash(USER, PLATFORM_TWITTER, 'alice', 'x-sub-1', 1_700_000_000, NONCE);
    const b = computeProofHash(USER, PLATFORM_TWITTER, 'bob', 'x-sub-1', 1_700_000_000, NONCE);
    expect(a).not.toBe(b);
  });

  it('changing the subject changes the hash', () => {
    const a = computeProofHash(USER, PLATFORM_TWITTER, 'alice', 'x-sub-1', 1_700_000_000, NONCE);
    const b = computeProofHash(USER, PLATFORM_TWITTER, 'alice', 'x-sub-2', 1_700_000_000, NONCE);
    expect(a).not.toBe(b);
  });

  it('changing the nonce changes the hash', () => {
    const a = computeProofHash(USER, PLATFORM_TWITTER, 'alice', 'x-sub-1', 1_700_000_000, NONCE);
    const b = computeProofHash(USER, PLATFORM_TWITTER, 'alice', 'x-sub-1', 1_700_000_000, NONCE_2);
    expect(a).not.toBe(b);
  });

  it('changing the platform changes the hash (twitter vs farcaster)', () => {
    const a = computeProofHash(USER, PLATFORM_TWITTER, 'alice', 'x-sub-1', 1_700_000_000, NONCE);
    const b = computeProofHash(USER, PLATFORM_FARCASTER, 'alice', 'x-sub-1', 1_700_000_000, NONCE);
    expect(a).not.toBe(b);
  });

  it('changing issuedAt changes the hash', () => {
    const a = computeProofHash(USER, PLATFORM_TWITTER, 'alice', 'x-sub-1', 1_700_000_000, NONCE);
    const b = computeProofHash(USER, PLATFORM_TWITTER, 'alice', 'x-sub-1', 1_700_000_001, NONCE);
    expect(a).not.toBe(b);
  });
});

describe('D-05: generateNonce', () => {
  it('returns a 32-byte hex value (0x + 64 hex chars)', () => {
    const n = generateNonce();
    expect(n).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('returns distinct values across calls', () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
  });
});
