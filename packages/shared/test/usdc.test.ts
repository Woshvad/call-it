/**
 * USDC constants test — single source-of-truth validation.
 *
 * These tests assert the exact values that SAFETY-13 / OPS-22 require.
 * If these tests fail, USDC transfer paths in the product will route funds incorrectly.
 *
 * See packages/shared/src/constants/usdc.ts for the source.
 */

import { describe, it, expect } from 'vitest';
import {
  USDC_ARB_NATIVE,
  USDC_DECIMALS,
  USDC_E_BRIDGED_DO_NOT_USE,
} from '../src/constants/usdc.js';

describe('USDC constants', () => {
  it('USDC_ARB_NATIVE is exactly the canonical native USDC address on Arbitrum One', () => {
    // Source: CLAUDE.md "Pinned Addresses" + Arbiscan + Circle docs
    // Any deviation here breaks ALL USDC transfer paths silently.
    expect(USDC_ARB_NATIVE).toBe('0xaf88d065e77c8cC2239327C5EDb3A432268e5831');
  });

  it('USDC_ARB_NATIVE is case-sensitive checksum form', () => {
    // EIP-55 checksum address — must match exactly; some tools are case-sensitive
    expect(USDC_ARB_NATIVE).toMatch(/^0x[0-9a-fA-F]{40}$/);
    // Verify it is not all-lowercase (that would be non-checksum)
    expect(USDC_ARB_NATIVE).not.toBe(USDC_ARB_NATIVE.toLowerCase());
  });

  it('USDC_E_BRIDGED_DO_NOT_USE is the bridged USDC.e address (negative-test fixture)', () => {
    // Source: CLAUDE.md "What NOT to Use" — bridged USDC.e must NOT be used in production
    expect(USDC_E_BRIDGED_DO_NOT_USE).toBe('0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8');
  });

  it('USDC_DECIMALS is 6', () => {
    // Native USDC always has 6 decimals — 1 USDC = 1_000_000 base units
    expect(USDC_DECIMALS).toBe(6);
  });

  it('USDC_ARB_NATIVE and USDC_E_BRIDGED_DO_NOT_USE are different addresses', () => {
    // Ensures the negative-test fixture is distinct from the canonical address
    expect(USDC_ARB_NATIVE).not.toBe(USDC_E_BRIDGED_DO_NOT_USE);
  });

  it('USDC_ARB_NATIVE does not contain 0xff970a61 (case-insensitive check against bridged)', () => {
    // Belt-and-suspenders: even case-folded, the addresses must differ
    expect(USDC_ARB_NATIVE.toLowerCase()).not.toContain('0xff970a61');
  });
});
