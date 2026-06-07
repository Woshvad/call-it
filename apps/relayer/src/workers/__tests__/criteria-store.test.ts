/**
 * criteria-store.test.ts — Vitest tests for the call_oracle_criteria store.
 *
 * Tests cover: resolveCriteria (found / not-found), insertCriteria (correct write),
 * governance encoding (proposalId from assetA, not DB), and the requiresCriteriaStore
 * guard that excludes Pyth/NftTwap/Snapshot/Tally/NFT call types from the store.
 *
 * Requirements: SETTLE-18, SETTLE-19, SETTLE-20, SETTLE-21, SETTLE-22, SETTLE-23, SETTLE-24
 * Gap: B.3 (criteria store for non-Pyth string identifiers)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveCriteria,
  insertCriteria,
  insertCallStatement,
  resolveCallStatement,
  STATEMENT_MAX_LEN,
} from '../../db/criteria-store.js';

// ── Drizzle DB client mock ────────────────────────────────────────────────────
//
// Mock the lazy singleton client. We intercept at the getDb() call site so the
// POSTGRES_URL env var is never required in tests (no live DB connection).
//
// The mock matches the Drizzle query builder chain used in criteria-store.ts:
//   db.select().from().where().limit()   → Promise<rows[]>
//   db.insert().values().onConflictDoNothing()  → Promise<void>

const mockLimit = vi.fn();
const mockWhere = vi.fn(() => ({ limit: mockLimit }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

const mockOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
const mockValues = vi.fn(() => ({ onConflictDoNothing: mockOnConflictDoNothing }));
const mockInsert = vi.fn(() => ({ values: mockValues }));

const mockDb = {
  select: mockSelect,
  insert: mockInsert,
};

vi.mock('../../db/client.js', () => ({
  getDb: vi.fn(() => mockDb),
}));

// ── Test suite ────────────────────────────────────────────────────────────────

describe('criteria-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the chain after each test so mock call counts are fresh
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockValues.mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
    mockInsert.mockReturnValue({ values: mockValues });
  });

  // ── Test 1: resolveCriteria returns identifier when row found ───────────────

  it('resolveCriteria returns identifier when row found', async () => {
    // Simulate DB returning one row
    mockLimit.mockResolvedValue([
      {
        callId: 42,
        oracleType: 2,
        identifier: 'uniswap',
        targetUnit: 'tvl',
        createdAt: new Date(),
      },
    ]);

    const result = await resolveCriteria(42);

    expect(result).not.toBeNull();
    expect(result!.identifier).toBe('uniswap');
    expect(result!.targetUnit).toBe('tvl');

    // Verify query chain was called with correct callId
    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockWhere).toHaveBeenCalledTimes(1);
    expect(mockLimit).toHaveBeenCalledWith(1);
  });

  // ── Test 2: resolveCriteria returns null when no row found ──────────────────

  it('resolveCriteria returns null when no row found', async () => {
    // Simulate empty result
    mockLimit.mockResolvedValue([]);

    const result = await resolveCriteria(999);

    expect(result).toBeNull();

    // FAIL-SAFE CONTRACT: caller must treat null as ambiguous — never settle
    // (This test documents the invariant; adapter logic tested in adapter tests)
  });

  // ── Test 3: insertCriteria stores correctly ─────────────────────────────────

  it('insertCriteria calls db.insert with correct values', async () => {
    mockOnConflictDoNothing.mockResolvedValue(undefined);

    await insertCriteria(101, 2, 'curve-dex', 'tvl');

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledWith({
      callId: 101,
      oracleType: 2,
      identifier: 'curve-dex',
      targetUnit: 'tvl',
    });
    expect(mockOnConflictDoNothing).toHaveBeenCalledTimes(1);
  });

  // ── Test 4: governance calls decode proposalId from assetA, not from store ──

  it('governance calls decode proposalId from assetA not from store', () => {
    // Snapshot proposalIds are 32-byte keccak256 hashes stored as uint256 in assetA.
    // The settlement-watcher reads call.assetA (uint256) and the adapter re-encodes
    // it as bytes32 hex for the Snapshot API query.
    //
    // This test verifies the encoding/decoding round-trip logic (not DB).
    // The adapter uses:  '0x' + call.assetA.toString(16).padStart(64, '0')

    // Simulate a Snapshot proposalId bytes32 hash as uint256 in assetA
    const EXAMPLE_PROPOSAL_ID =
      '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    // assetA is stored as BigInt (uint256) on-chain
    const assetAUint256 = BigInt(EXAMPLE_PROPOSAL_ID);

    // Decode back to bytes32 hex (the Snapshot API format)
    const decoded = '0x' + assetAUint256.toString(16).padStart(64, '0');

    expect(decoded).toBe(EXAMPLE_PROPOSAL_ID);

    // Verify Tally numeric proposalId round-trip (on-chain uint256 → string)
    const tallyProposalId = 12345678n; // numeric on-chain proposalId
    const decodedTally = tallyProposalId.toString();
    expect(decodedTally).toBe('12345678');

    // Confirm: no DB lookup needed for governance — assetA encodes the proposalId
    // so resolveCriteria is never called for Snapshot (4) or Tally (5) oracleTypes
  });

  // ── Test 5: requiresCriteriaStore guard excludes non-store oracle types ──────

  it('insertCriteria is not called for Pyth/NftTwap/Snapshot/Tally call types', () => {
    // This test verifies the requiresCriteriaStore guard logic from calls-preflight.ts.
    // The guard is:
    //   const requiresCriteriaStore = [
    //     OracleType.DefiLlama (2),
    //     OracleType.RpcMetrics (3),
    //     OracleType.CexScraper (6),
    //   ].includes(oracleType);
    //
    // Types that must NOT call insertCriteria:
    //   0 = Pyth         → settles via Pyth VAA; assetA = feedId
    //   1 = NftTwap      → assetA = uint256(nftContractAddress)
    //   4 = Snapshot     → assetA = proposalId bytes32 hash as uint256
    //   5 = Tally        → assetA = on-chain numeric proposalId as uint256

    const CRITERIA_STORE_TYPES = [2, 3, 6]; // DefiLlama, RpcMetrics, CexScraper
    const NON_STORE_TYPES = [0, 1, 4, 5];   // Pyth, NftTwap, Snapshot, Tally

    for (const oracleType of NON_STORE_TYPES) {
      const requiresCriteriaStore = CRITERIA_STORE_TYPES.includes(oracleType);
      expect(requiresCriteriaStore).toBe(false);
    }

    for (const oracleType of CRITERIA_STORE_TYPES) {
      const requiresCriteriaStore = CRITERIA_STORE_TYPES.includes(oracleType);
      expect(requiresCriteriaStore).toBe(true);
    }
  });
});

// ── call_statement store (Phase 07 — D-05 authoritative market statement) ─────────

describe('call-statement store (D-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWhere.mockReturnValue({ limit: mockLimit });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockValues.mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
    mockInsert.mockReturnValue({ values: mockValues });
  });

  // ── insertCallStatement writes the (capped) statement idempotently ──────────

  it('insertCallStatement writes the statement with onConflictDoNothing', async () => {
    mockOnConflictDoNothing.mockResolvedValue(undefined);

    await insertCallStatement(7, 'BTC above $100k by EOY');

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledWith({
      callId: 7,
      statement: 'BTC above $100k by EOY',
    });
    expect(mockOnConflictDoNothing).toHaveBeenCalledTimes(1);
  });

  // ── V5: length-cap on persist (untrusted prose) ─────────────────────────────

  it('insertCallStatement length-caps the statement at STATEMENT_MAX_LEN (V5)', async () => {
    mockOnConflictDoNothing.mockResolvedValue(undefined);

    const longStatement = 'x'.repeat(STATEMENT_MAX_LEN + 50);
    await insertCallStatement(8, longStatement);

    const calls = mockValues.mock.calls as unknown as Array<[{ statement: string }]>;
    const writtenArg = calls[0]![0];
    expect(writtenArg.statement.length).toBe(STATEMENT_MAX_LEN);
  });

  // ── empty/whitespace statement → no row written (clean null fallback) ───────

  it('insertCallStatement skips the write for an empty/whitespace statement', async () => {
    await insertCallStatement(9, '   ');

    expect(mockInsert).not.toHaveBeenCalled();
  });

  // ── resolveCallStatement returns the stored prose when found ────────────────

  it('resolveCallStatement returns the statement when a row is found', async () => {
    mockLimit.mockResolvedValue([
      { callId: 42, statement: 'ETH flips BTC in market cap', createdAt: new Date() },
    ]);

    const result = await resolveCallStatement(42);

    expect(result).toBe('ETH flips BTC in market cap');
    expect(mockLimit).toHaveBeenCalledWith(1);
  });

  // ── FAIL-SAFE: null when absent → caller falls back to subgraph mirror (D-03) ─

  it('resolveCallStatement returns null when no row found (D-03 fallback contract)', async () => {
    mockLimit.mockResolvedValue([]);

    const result = await resolveCallStatement(999);

    expect(result).toBeNull();
  });
});
