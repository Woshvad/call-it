/**
 * ens-resolver.test.ts — quick-260611-p9a regression guards.
 *
 * Root cause (verified live 2026-06-11): with ENS_MAINNET_RPC_URL unset on
 * Fly, the module-scope client's `http(undefined)` leg fell through to viem's
 * default public mainnet RPC, which hangs/throttles — burning the full 5s
 * withTimeout cap on every uncached profile request. Combined with CR-01
 * (timed-out legs are never cached) the 60s profile cache never filled, so
 * EVERY profile click paid ~6s.
 *
 * Guards:
 *   1. env UNSET → resolveEns returns null immediately, NO RPC attempted
 *      (honest D-07 degrade: ENS not configured = no ENS name).
 *   2. env SET → configured behavior unchanged: getEnsName drives the result.
 *
 * Requirements: D-13, AUTH-11, D-07
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The mainnet client is created at MODULE SCOPE in ens-resolver.ts, so the
// viem mock must be in place before the module loads (vi.mock hoisting).
const getEnsNameSpy = vi.hoisted(() => vi.fn());

vi.mock('viem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('viem')>();
  return {
    ...actual,
    createPublicClient: vi.fn(() => ({ getEnsName: getEnsNameSpy })),
  };
});

// Isolate from L1/Redis: cache always misses, writes are no-ops.
vi.mock('../cache.js', () => ({
  getCached: vi.fn(async () => null),
  setCached: vi.fn(async () => undefined),
}));

// Stub logger (mirrors subgraph-breaker.test.ts pattern).
vi.mock('../logger.js', () => {
  const noop = () => {};
  const fake = { info: noop, warn: noop, error: noop };
  return { getLogger: vi.fn(() => fake), logger: fake };
});

import { resolveEns } from '../ens-resolver.js';

const ORIGINAL_ENS_RPC = process.env.ENS_MAINNET_RPC_URL;

describe('ens-resolver resolveEns (quick-260611-p9a)', () => {
  beforeEach(() => {
    delete process.env.ENS_MAINNET_RPC_URL;
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (ORIGINAL_ENS_RPC === undefined) delete process.env.ENS_MAINNET_RPC_URL;
    else process.env.ENS_MAINNET_RPC_URL = ORIGINAL_ENS_RPC;
  });

  // ── (i) env UNSET → immediate null, NO RPC (early return before any leg) ──
  it('returns null immediately — no RPC attempted — when ENS_MAINNET_RPC_URL is unset', async () => {
    const result = await resolveEns('0x7304a289aa8d5a4db23eb78c143e9aa376415ced');

    expect(result).toBeNull();
    expect(getEnsNameSpy).not.toHaveBeenCalled();
  });

  // ── (ii) env SET → configured behavior unchanged ──────────────────────────
  it('resolves via getEnsName when ENS_MAINNET_RPC_URL is set (configured path unchanged)', async () => {
    process.env.ENS_MAINNET_RPC_URL = 'https://eth-mainnet.example/test';
    getEnsNameSpy.mockResolvedValueOnce('vitalik.eth');

    const result = await resolveEns('0x7304a289aa8d5a4db23eb78c143e9aa376415ced');

    expect(result).toBe('vitalik.eth');
    expect(getEnsNameSpy).toHaveBeenCalledTimes(1);
  });
});
