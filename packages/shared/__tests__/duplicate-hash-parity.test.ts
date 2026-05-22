/**
 * Duplicate-hash parity test — TS mirror vs Solidity DuplicateHashLib
 *
 * Verifies byte-for-byte parity between:
 *   packages/shared/src/hashing/duplicate-hash.ts  (this test)
 *   packages/contracts/src/libraries/DuplicateHashLib.sol  (Foundry parity test)
 *
 * Reference values were derived from viem's ABI encoding (abi.encode semantics),
 * which produces identical output to Solidity's abi.encode() for the same inputs.
 *
 * The encoding used: keccak256(abi.encode(uint8, uint256, uint256, uint256, uint64))
 * with ABI-standard 32-byte-per-slot padding.
 *
 * To regenerate reference values against a live Solidity environment:
 *   forge test --match-test test_parity_duplicate_hash_vectors -vv
 * then compare the bytes32 outputs with those hardcoded below.
 *
 * D-29 anti-drift: changes to DuplicateHashLib.sol encoding MUST be mirrored here
 * or the parity CI gate will fail.
 *
 * Requirement: CALL-22, CALL-23, CALL-24
 */

import { describe, it, expect, afterAll } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dayBucketUtc, computeDuplicateHash } from '../src/hashing/duplicate-hash.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Deterministic reference vectors.
 * Each vector was computed by running:
 *   DuplicateHashLib.compute(marketType, assetA, metric, targetValue, deadlineDay)
 * which is equivalent to:
 *   keccak256(abi.encode(marketType, assetA, metric, targetValue, deadlineDay))
 *
 * viem's encodeAbiParameters produces byte-identical output for the same inputs.
 */
const REFERENCE_VECTORS: Array<{
  label: string;
  input: { marketType: number; assetA: bigint; metric: bigint; targetValue: bigint; deadlineDay: bigint };
  expectedHash: `0x${string}`;
}> = [
  {
    label: 'priceTarget, assetA=1, metric=0, target=$100, deadlineDay=day1',
    input: { marketType: 0, assetA: 1n, metric: 0n, targetValue: 100_000_000n, deadlineDay: 86400n },
    expectedHash: '0xb178d473ad78634a07f7b187d70a9e49ecddff943d5b3101349b67406198cfad',
  },
  {
    label: 'priceTarget, assetA=2, metric=0, target=$200, deadlineDay=day1',
    input: { marketType: 0, assetA: 2n, metric: 0n, targetValue: 200_000_000n, deadlineDay: 86400n },
    expectedHash: '0x924fae28a6e9d9f10fa4aa43a5bd9a8778ab0cd62e368c4d252fd36c80bd358d',
  },
  {
    label: 'spreadVs, assetA=1, metric=0, target=$50, deadlineDay=day2',
    input: { marketType: 1, assetA: 1n, metric: 0n, targetValue: 50_000_000n, deadlineDay: 172800n },
    expectedHash: '0x25da5b98abf64ec617068462165ef3d8e222e67de3fe672d538d77011e44b331',
  },
  {
    label: 'event, assetA=3, metric=4 (cexListing), target=0, deadlineDay=day3',
    input: { marketType: 2, assetA: 3n, metric: 4n, targetValue: 0n, deadlineDay: 259200n },
    expectedHash: '0x4524308d307978b458bfb8c902e3ded2a40f30e929966670db9456735cf66eb9',
  },
  {
    label: 'priceTarget, assetA=42, metric=0, target=$100, deadlineDay=1699920000 (Pitfall 12 date)',
    input: { marketType: 0, assetA: 42n, metric: 0n, targetValue: 100_000_000n, deadlineDay: 1699920000n },
    expectedHash: '0x876a71898cd181c18267da5648d33229355d2734ac403bbe2e5820eda494f25d',
  },
  {
    label: 'priceTarget, assetA=1, metric=0, target=$5 (min stake), deadlineDay=day1',
    input: { marketType: 0, assetA: 1n, metric: 0n, targetValue: 5_000_000n, deadlineDay: 86400n },
    expectedHash: '0xeba5207774459e4c6cec3e9a13682815af72e00b4c0972eac3dab90fac47139b',
  },
  {
    label: 'priceTarget, assetA=1, deadlineDay=0 (day0 edge case)',
    input: { marketType: 0, assetA: 1n, metric: 0n, targetValue: 100_000_000n, deadlineDay: 0n },
    expectedHash: '0xaf1f2a017df1aee425bf70869267ff2c691b685ace5ad883bfbe9e252d0f1cf7',
  },
  {
    label: 'event, assetA=1, metric=1 (tvlMilestone), target=0, deadlineDay=day1',
    input: { marketType: 2, assetA: 1n, metric: 1n, targetValue: 0n, deadlineDay: 86400n },
    expectedHash: '0xd4c16ba3a694df8e53417e741011ef72f0eb1cf5b238992f2e63284b3de39e95',
  },
  {
    label: 'event, assetA=4, metric=6 (governance), target=0, deadlineDay=1700006400',
    input: { marketType: 2, assetA: 4n, metric: 6n, targetValue: 0n, deadlineDay: 1700006400n },
    expectedHash: '0xe909b86ae20b8b5781a3485333e66f57ff68a756a8d90019d7351fdb437348e1',
  },
  {
    label: 'priceTarget, assetA=999999, large target, deadlineDay=30days',
    input: { marketType: 0, assetA: 999999n, metric: 0n, targetValue: 999_000_000n, deadlineDay: 2592000n },
    expectedHash: '0x19eaecd27abf89fd707325a1adab5f7e403e053afc545087b5f1fa97c3953328',
  },
];

// ─── dayBucketUtc tests ───────────────────────────────────────────────────────

describe('dayBucketUtc — Pitfall 12 UTC-day boundary', () => {
  it('dayBucketUtc(86399n) === 0n — still in day 0', () => {
    expect(dayBucketUtc(86399n)).toBe(0n);
  });

  it('dayBucketUtc(86400n) === 86400n — start of day 1', () => {
    expect(dayBucketUtc(86400n)).toBe(86400n);
  });

  it('dayBucketUtc(86401n) === 86400n — still in day 1', () => {
    expect(dayBucketUtc(86401n)).toBe(86400n);
  });

  it('dayBucketUtc(172799n) === 86400n — last second of day 1', () => {
    expect(dayBucketUtc(172799n)).toBe(86400n);
  });

  it('dayBucketUtc(172800n) === 172800n — start of day 2', () => {
    expect(dayBucketUtc(172800n)).toBe(172800n);
  });

  it('dayBucketUtc(1700000000n) === 1699920000n — real-world timestamp', () => {
    // 1700000000 / 86400 = 19675.926... → floor 19675 * 86400 = 1699920000
    expect(dayBucketUtc(1700000000n)).toBe(1699920000n);
  });

  it('dayBucketUtc(0n) === 0n — epoch', () => {
    expect(dayBucketUtc(0n)).toBe(0n);
  });
});

// ─── computeDuplicateHash parity tests ────────────────────────────────────────

describe('computeDuplicateHash — byte-for-byte parity with DuplicateHashLib.sol', () => {
  it.each(REFERENCE_VECTORS)('$label', ({ input, expectedHash }) => {
    const result = computeDuplicateHash(input);
    expect(result).toBe(expectedHash);
  });

  it('same inputs produce same hash (determinism)', () => {
    const input = { marketType: 0, assetA: 1n, metric: 0n, targetValue: 100_000_000n, deadlineDay: 86400n };
    expect(computeDuplicateHash(input)).toBe(computeDuplicateHash(input));
  });

  it('different assetA produces different hash (collision resistance)', () => {
    const base = { marketType: 0, assetA: 1n, metric: 0n, targetValue: 100_000_000n, deadlineDay: 86400n };
    const alt = { ...base, assetA: 2n };
    expect(computeDuplicateHash(base)).not.toBe(computeDuplicateHash(alt));
  });

  it('different deadlineDay produces different hash (UTC-day isolation)', () => {
    const day1 = { marketType: 0, assetA: 1n, metric: 0n, targetValue: 100_000_000n, deadlineDay: 86400n };
    const day2 = { ...day1, deadlineDay: 172800n };
    expect(computeDuplicateHash(day1)).not.toBe(computeDuplicateHash(day2));
  });

  it('different marketType produces different hash', () => {
    const base = { marketType: 0, assetA: 1n, metric: 0n, targetValue: 100_000_000n, deadlineDay: 86400n };
    const alt = { ...base, marketType: 1 };
    expect(computeDuplicateHash(base)).not.toBe(computeDuplicateHash(alt));
  });

  it('returns a 0x-prefixed 32-byte hex string', () => {
    const hash = computeDuplicateHash({ marketType: 0, assetA: 1n, metric: 0n, targetValue: 100_000_000n, deadlineDay: 86400n });
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

// ─── Output for parity-diff script ───────────────────────────────────────────

const parityResults: Record<string, string> = {};
REFERENCE_VECTORS.forEach(({ label, input }) => {
  parityResults[label] = computeDuplicateHash(input);
});

afterAll(() => {
  const outPath = join(__dirname, '../../.vitest-duplicate-hash-parity-output.json');
  try {
    const dir = dirname(outPath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      outPath,
      JSON.stringify(
        {
          _generated: new Date().toISOString(),
          _note: 'Generated by packages/shared/__tests__/duplicate-hash-parity.test.ts',
          vectors: parityResults,
        },
        null,
        2,
      ),
    );
  } catch {
    // Non-fatal — parity-diff can re-run if missing
  }
});
