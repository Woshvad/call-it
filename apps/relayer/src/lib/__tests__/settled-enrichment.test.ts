/**
 * settled-enrichment tests (quick-260611-tbc Task 1 — TDD RED).
 *
 * Exercises the settled-feed enrichment at the GraphQL boundary (mocked global
 * fetch — subgraph-breaker.test.ts convention) so BOTH layers are covered:
 *   - querySettledFeedFields (subgraph-client.ts): one batched
 *     settlements(id_in) + repEvents(callId_in) query through the breaker;
 *     caller-filtered repDelta pick; fail-safe empty Map, never throws.
 *   - enrichSettledFeedItems (settled-enrichment.ts): ADDITIVE merge of
 *     settledAt/repDelta always-when-present + finalPct ONLY under the
 *     contract-verified marketType-0 derivation (SettlementManager.sol:713-723
 *     priceDelta = final − target, both 1e8 → finalPct = priceDelta/target×100).
 *
 *   1. Additive merge: settledAt + repDelta + finalPct land; existing keys
 *      byte-identical.
 *   2. Truthful-only finalPct: marketType 2 / missing targetValue / null
 *      priceDelta → finalPct ABSENT (settledAt/repDelta still merged).
 *   3. Caller-filtered repDelta: the CALLER's latest delta wins over a
 *      challenger's later event (case-insensitive address compare).
 *   4. Live untouched + never-throws: live items pass through; a rejecting
 *      fetch resolves with the input UNCHANGED.
 *   5. Negative finalPct 1-dp rounding.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stable logger capture (subgraph-breaker.test.ts convention).
const logged = vi.hoisted(() => ({ events: [] as Array<Record<string, unknown>> }));
vi.mock('../logger.js', () => {
  const push = (obj: Record<string, unknown>) => {
    logged.events.push(obj);
  };
  const fake = { info: push, warn: push, error: push };
  return { getLogger: vi.fn(() => fake), logger: fake };
});

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { _resetBreakerForTesting, querySettledFeedFields } from '../subgraph-client.js';
import { enrichSettledFeedItems } from '../settled-enrichment.js';

const CALLER = '0xAaAa000000000000000000000000000000000001';
const CHALLENGER = '0xbbbb000000000000000000000000000000000002';

/** A post-enrichFeedItems settled feed item (wire status is TitleCase). */
function settledItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '14',
    caller: CALLER.toLowerCase(),
    marketType: 0,
    asset: 'ETH',
    stake: '5000000',
    expiry: '1779000000',
    conviction: 70,
    status: 'Settled',
    createdAt: '1778000000',
    outcome: 'CallerWon',
    targetValue: '10000000000',
    ...overrides,
  };
}

function liveItem(): Record<string, unknown> {
  return {
    id: '15',
    caller: CALLER.toLowerCase(),
    marketType: 0,
    asset: 'BTC',
    stake: '5000000',
    expiry: '1800000000',
    conviction: 55,
    status: 'Live',
    createdAt: '1779000000',
  };
}

function okSubgraph(data: Record<string, unknown>) {
  return { ok: true, json: async () => ({ data }) };
}

beforeEach(() => {
  _resetBreakerForTesting();
  mockFetch.mockReset();
  logged.events.length = 0;
  process.env.SUBGRAPH_STUDIO_URL = 'https://studio.example/subgraph/v1';
});

describe('enrichSettledFeedItems — additive settledAt/repDelta/finalPct merge', () => {
  it('Test 1: merges settledAt + repDelta + finalPct on a settled marketType-0 item, all pre-existing keys byte-identical', async () => {
    const input = settledItem();
    const snapshot = JSON.parse(JSON.stringify(input)) as Record<string, unknown>;

    mockFetch.mockResolvedValueOnce(
      okSubgraph({
        settlements: [{ id: '14', priceDelta: '310000000', settledAt: '1780000000' }],
        repEvents: [
          { callId: '14', user: CALLER.toLowerCase(), delta: -10, timestamp: '1780000001' },
        ],
      }),
    );

    const out = (await enrichSettledFeedItems([input])) as Array<Record<string, unknown>>;
    expect(out).toHaveLength(1);
    const item = out[0]!;

    expect(item['settledAt']).toBe(1780000000);
    expect(item['repDelta']).toBe(-10);
    // priceDelta 310000000 / targetValue 10000000000 × 100 = 3.1
    expect(item['finalPct']).toBe(3.1);

    // ALL pre-existing keys byte-identical.
    for (const [k, v] of Object.entries(snapshot)) {
      expect(item[k]).toEqual(v);
    }
  });

  it('Test 2a: marketType 2 NEVER gets finalPct even with a non-null priceDelta (governance priceDelta=0 would be a fake 0%)', async () => {
    mockFetch.mockResolvedValueOnce(
      okSubgraph({
        settlements: [{ id: '14', priceDelta: '0', settledAt: '1780000000' }],
        repEvents: [
          { callId: '14', user: CALLER.toLowerCase(), delta: 12, timestamp: '1780000001' },
        ],
      }),
    );

    const out = (await enrichSettledFeedItems([
      settledItem({ marketType: 2, targetValue: undefined }),
    ])) as Array<Record<string, unknown>>;
    const item = out[0]!;
    expect('finalPct' in item).toBe(false);
    expect(item['settledAt']).toBe(1780000000);
    expect(item['repDelta']).toBe(12);
  });

  it('Test 2b: marketType 0 with targetValue missing (enrichment failed) → finalPct ABSENT, settledAt/repDelta still merged', async () => {
    mockFetch.mockResolvedValueOnce(
      okSubgraph({
        settlements: [{ id: '14', priceDelta: '310000000', settledAt: '1780000000' }],
        repEvents: [
          { callId: '14', user: CALLER.toLowerCase(), delta: -3, timestamp: '1780000001' },
        ],
      }),
    );

    const out = (await enrichSettledFeedItems([
      settledItem({ targetValue: undefined }),
    ])) as Array<Record<string, unknown>>;
    const item = out[0]!;
    expect('finalPct' in item).toBe(false);
    expect(item['settledAt']).toBe(1780000000);
    expect(item['repDelta']).toBe(-3);
  });

  it('Test 2c: priceDelta null → finalPct ABSENT, settledAt/repDelta still merged', async () => {
    mockFetch.mockResolvedValueOnce(
      okSubgraph({
        settlements: [{ id: '14', priceDelta: null, settledAt: '1780000000' }],
        repEvents: [
          { callId: '14', user: CALLER.toLowerCase(), delta: 5, timestamp: '1780000001' },
        ],
      }),
    );

    const out = (await enrichSettledFeedItems([settledItem()])) as Array<
      Record<string, unknown>
    >;
    const item = out[0]!;
    expect('finalPct' in item).toBe(false);
    expect(item['settledAt']).toBe(1780000000);
    expect(item['repDelta']).toBe(5);
  });

  it("Test 3: caller-filtered repDelta — the CALLER's delta wins over the challenger's later event (case-insensitive)", async () => {
    mockFetch.mockResolvedValueOnce(
      okSubgraph({
        settlements: [{ id: '14', priceDelta: '310000000', settledAt: '1780000000' }],
        repEvents: [
          // Challenger's event is LATER — the unfiltered OG pick would grab it.
          { callId: '14', user: CHALLENGER, delta: 99, timestamp: '1780000999' },
          // Caller address in checksum case; item.caller is lowercased.
          { callId: '14', user: CALLER, delta: -10, timestamp: '1780000001' },
        ],
      }),
    );

    const fields = await querySettledFeedFields([
      { id: '14', caller: CALLER.toLowerCase() },
    ]);
    expect(fields.get('14')?.repDelta).toBe(-10);
  });

  it('Test 3b: among multiple CALLER events the latest timestamp wins', async () => {
    mockFetch.mockResolvedValueOnce(
      okSubgraph({
        settlements: [],
        repEvents: [
          { callId: '14', user: CALLER.toLowerCase(), delta: 4, timestamp: '1780000001' },
          { callId: '14', user: CALLER.toLowerCase(), delta: 7, timestamp: '1780000500' },
        ],
      }),
    );

    const fields = await querySettledFeedFields([
      { id: '14', caller: CALLER.toLowerCase() },
    ]);
    expect(fields.get('14')?.repDelta).toBe(7);
  });

  it('Test 4: live items pass through unchanged; a throwing subgraph resolves with input UNCHANGED (never throws)', async () => {
    // Live-only input: no subgraph call should even fire.
    const live = liveItem();
    const liveOut = await enrichSettledFeedItems([live]);
    expect(liveOut[0]).toBe(live);
    expect(mockFetch).not.toHaveBeenCalled();

    // Settled input + rejecting fetch → items unchanged, NO throw.
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const input = settledItem();
    const snapshot = JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
    const out = (await enrichSettledFeedItems([input])) as Array<Record<string, unknown>>;
    expect(out[0]).toEqual(snapshot);
    expect('settledAt' in out[0]!).toBe(false);
    expect('finalPct' in out[0]!).toBe(false);
  });

  it('Test 4b: querySettledFeedFields itself fail-safes to an empty Map on rejection (never throws)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'));
    const fields = await querySettledFeedFields([
      { id: '14', caller: CALLER.toLowerCase() },
    ]);
    expect(fields.size).toBe(0);
  });

  it('Test 5: negative finalPct rounds to 1 dp — priceDelta -241000000 on targetValue 10000000000 → -2.4', async () => {
    mockFetch.mockResolvedValueOnce(
      okSubgraph({
        settlements: [{ id: '14', priceDelta: '-241000000', settledAt: '1780000000' }],
        repEvents: [],
      }),
    );

    const out = (await enrichSettledFeedItems([settledItem()])) as Array<
      Record<string, unknown>
    >;
    const item = out[0]!;
    expect(item['finalPct']).toBe(-2.4);
    expect(item['settledAt']).toBe(1780000000);
    // No repEvent for the caller → repDelta absent, never fabricated.
    expect('repDelta' in item).toBe(false);
  });
});
