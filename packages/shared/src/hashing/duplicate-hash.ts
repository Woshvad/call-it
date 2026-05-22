/**
 * Duplicate-hash helper — TS mirror of DuplicateHashLib.sol (Plan 02).
 *
 * CROSS-LANGUAGE COUPLING (D-29 anti-drift / PITFALL-12):
 * These functions MUST produce byte-identical output to:
 *   packages/contracts/src/libraries/DuplicateHashLib.sol
 *
 * Encoding: keccak256(abi.encode(marketType, assetA, metric, targetValue, deadlineDay))
 *   - abi.encode pads each value to 32 bytes (ABI standard encoding)
 *   - viem `encodeAbiParameters` with individual types produces identical layout
 *   - uint8 marketType → padded to 32 bytes
 *   - uint256 assetA → 32 bytes
 *   - uint256 metric → 32 bytes
 *   - uint256 targetValue → 32 bytes
 *   - uint64 deadlineDay → padded to 32 bytes
 *
 * PITFALL-12 WARNING: UTC-day bucket floors must use integer division:
 *   dayBucketUtc(86399n) === 0n
 *   dayBucketUtc(86400n) === 86400n
 *   dayBucketUtc(172799n) === 86400n
 * See .planning/phases/01-core-contracts-auth-frontend-skeleton/01-RESEARCH.md Pitfall 12
 *
 * The Plan 03 parity test (packages/shared/__tests__/duplicate-hash-parity.test.ts)
 * asserts byte-for-byte equality between these TS functions and the Solidity library.
 * Any change to the encoding here MUST be mirrored in DuplicateHashLib.sol
 * (or the parity CI gate fires).
 *
 * Source: DuplicateHashLib.sol natspec; RESEARCH "Common Operation 4" lines 779-796
 * Requirement: CALL-22, CALL-23, CALL-24, D-29
 */

import { encodeAbiParameters, keccak256 } from 'viem';

/**
 * Floor a UNIX timestamp (seconds) to the start of its UTC day (midnight UTC).
 *
 * Mirrors Solidity: `uint64((ts / 86400) * 86400)`
 *
 * @param unixSeconds - UNIX timestamp in seconds (bigint)
 * @returns The timestamp floored to UTC midnight of the same day
 *
 * @example
 * dayBucketUtc(86399n) // 0n  (still day 0)
 * dayBucketUtc(86400n) // 86400n  (start of day 1)
 * dayBucketUtc(1700000000n) // 1699920000n  (floor to day start)
 */
export function dayBucketUtc(unixSeconds: bigint): bigint {
  return (unixSeconds / 86400n) * 86400n;
}

/** Input type for computeDuplicateHash. */
export interface DuplicateHashInput {
  /** MarketType enum value (0=PriceTarget, 1=SpreadVs, 2=Event) */
  marketType: number;
  /** Primary asset identifier (Pyth feed key or NFT collection address as uint256) */
  assetA: bigint;
  /** Metric identifier (0 for price target; EventSubtype cast to uint256 for events) */
  metric: bigint;
  /** Target value (price target or 0 for events) */
  targetValue: bigint;
  /**
   * UTC-day-floored expiry timestamp (output of dayBucketUtc).
   * Caller is responsible for flooring with dayBucketUtc before passing here.
   */
  deadlineDay: bigint;
}

/**
 * Compute the duplicate-hash key for a call — mirrors DuplicateHashLib.compute().
 *
 * Encoding: keccak256(abi.encode(marketType, assetA, metric, targetValue, deadlineDay))
 * Using viem's encodeAbiParameters which produces ABI-standard (padded) encoding,
 * identical to Solidity's abi.encode().
 *
 * @returns 32-byte hex string (bytes32) — the key used in `activeDuplicateHashes`
 *
 * @example
 * computeDuplicateHash({
 *   marketType: 0,
 *   assetA: 42n,
 *   metric: 0n,
 *   targetValue: 100_000_000n,
 *   deadlineDay: 1699920000n,
 * })
 * // Returns bytes32 keccak256 matching DuplicateHashLib.compute(0, 42, 0, 100000000, 1699920000)
 */
export function computeDuplicateHash(input: DuplicateHashInput): `0x${string}` {
  const { marketType, assetA, metric, targetValue, deadlineDay } = input;

  return keccak256(
    encodeAbiParameters(
      [
        { type: 'uint8' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'uint64' },
      ],
      [
        marketType,
        assetA,
        metric,
        targetValue,
        deadlineDay,
      ],
    ),
  );
}
