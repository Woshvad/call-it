/**
 * Unit tests for app/new/lib/call-created-log.ts (quick-260611-co5, D-15).
 *
 * Real viem decode against the real callRegistryAbi — no mocks, no fake DOM.
 * Fixtures are built with viem's own encoders (encodeEventTopics /
 * encodeAbiParameters) so the round-trip exercises the actual ABI shape of
 * CallCreated(id uint256 indexed, caller address indexed, marketType uint8,
 * stake uint96).
 */

import { describe, it, expect } from 'vitest';
import { encodeEventTopics, encodeAbiParameters } from 'viem';
import { callRegistryAbi } from '@/lib/abis';
import { extractCallIdFromLogs } from '@/app/new/lib/call-created-log';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Mixed-case (checksummed-style) registry address — proves the address
 *  compare in extractCallIdFromLogs is case-insensitive. */
const REGISTRY_MIXED_CASE = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01' as const;
const REGISTRY_LOWER = REGISTRY_MIXED_CASE.toLowerCase() as `0x${string}`;

/** A structurally-valid-but-different contract address. */
const OTHER_CONTRACT = '0x1111111111111111111111111111111111111111' as const;

const CALLER = '0x73047a882e0B88a1913A25bBe8d871aBad2c5CeD' as const;

/** Valid CallCreated log: id=14n, caller=CALLER, marketType=0, stake=5 USDC. */
function buildCallCreatedLog(address: `0x${string}`) {
  const topics = encodeEventTopics({
    abi: callRegistryAbi,
    eventName: 'CallCreated',
    args: { id: 14n, caller: CALLER },
  });
  // Non-indexed tail: (uint8 marketType, uint96 stake)
  const data = encodeAbiParameters(
    [{ type: 'uint8' }, { type: 'uint96' }],
    [0, 5_000_000n],
  );
  return { address, data, topics };
}

/** CallQuoted log (both args indexed → empty data). */
function buildCallQuotedLog(address: `0x${string}`) {
  const topics = encodeEventTopics({
    abi: callRegistryAbi,
    eventName: 'CallQuoted',
    args: { parentId: 7n, quoteId: 14n },
  });
  return { address, data: '0x' as `0x${string}`, topics };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('extractCallIdFromLogs', () => {
  it('returns the callId from a valid CallCreated log (case-insensitive address match)', () => {
    // Log address mixed-case, registry param lowercase — must still match.
    const logs = [buildCallCreatedLog(REGISTRY_MIXED_CASE)];
    expect(extractCallIdFromLogs(logs, REGISTRY_LOWER)).toBe(14n);
  });

  it('returns null for an unrelated event (CallQuoted) from the registry address', () => {
    const logs = [buildCallQuotedLog(REGISTRY_MIXED_CASE)];
    expect(extractCallIdFromLogs(logs, REGISTRY_LOWER)).toBeNull();
  });

  it('returns null (no throw) for a garbage log from the registry address', () => {
    const logs = [
      {
        address: REGISTRY_MIXED_CASE,
        data: '0xdeadbeef' as `0x${string}`,
        topics: ['0x1234' as `0x${string}`],
      },
    ];
    expect(extractCallIdFromLogs(logs, REGISTRY_LOWER)).toBeNull();
  });

  it('returns null for a structurally valid CallCreated log from a DIFFERENT contract', () => {
    const logs = [buildCallCreatedLog(OTHER_CONTRACT)];
    expect(extractCallIdFromLogs(logs, REGISTRY_MIXED_CASE)).toBeNull();
  });

  it('returns null for an empty logs array', () => {
    expect(extractCallIdFromLogs([], REGISTRY_LOWER)).toBeNull();
  });

  it('skips non-matching/garbage logs and still finds CallCreated later in the array', () => {
    const logs = [
      buildCallQuotedLog(REGISTRY_MIXED_CASE),
      buildCallCreatedLog(OTHER_CONTRACT),
      buildCallCreatedLog(REGISTRY_MIXED_CASE),
    ];
    expect(extractCallIdFromLogs(logs, REGISTRY_LOWER)).toBe(14n);
  });
});
