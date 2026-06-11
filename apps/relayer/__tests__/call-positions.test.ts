/**
 * GET /api/calls/:id/positions tests — quick-260611-5mh Task 3 (A5).
 *
 * The web's fetchFinalPositions (apps/web/app/call/[id]/page.tsx ~335) does
 * `await res.json() as unknown[]` then maps {handle, side, pnl, stake} — so
 * the contract under test is: BARE ARRAY body, handle/side/stake per item,
 * pnl omitted (web defaults to '0'), 200 on empty AND on subgraph failure.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockQueryCallPositions } = vi.hoisted(() => ({
  mockQueryCallPositions: vi.fn(),
}));

vi.mock('../src/lib/subgraph-client.js', () => ({
  queryCallPositions: mockQueryCallPositions,
}));

vi.mock('../src/lib/logger.js', () => ({
  getLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

// ── Import SUT (after mocks) ──────────────────────────────────────────────────

import { callPositionsRoute } from '../src/routes/call-positions.js';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/calls/:id/positions (quick-260611-5mh A5)', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify({ logger: false });
    await app.register(callPositionsRoute);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns a BARE ARRAY shaped for the web FinalPosition mapping, stake desc', async () => {
    mockQueryCallPositions.mockResolvedValueOnce([
      {
        user: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        side: 'follow',
        usdcDeposited: '1000000',
        sharesHeld: '1000000',
        entryTime: '1780000000',
        exitedAt: null,
      },
      {
        user: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        side: 'fade',
        usdcDeposited: '5000000',
        sharesHeld: '5000000',
        entryTime: '1780000001',
        exitedAt: null,
      },
    ]);

    const response = await app.inject({ method: 'GET', url: '/api/calls/14/positions' });

    expect(response.statusCode).toBe(200);
    const body = response.json<Array<Record<string, unknown>>>();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);

    // Sorted stake desc — the larger fade position first
    expect(body[0]).toMatchObject({
      handle: '0xbbbb...bbbb', // AUTH-44 truncated display alias
      side: 'fade',
      stake: '5000000',
    });
    expect(body[1]).toMatchObject({
      handle: '0xaaaa...aaaa',
      side: 'follow',
      stake: '1000000',
    });
    // pnl is OMITTED, not zeroed (D-07) — the web defaults absent pnl to 0n
    expect(body[0]).not.toHaveProperty('pnl');
    expect(mockQueryCallPositions).toHaveBeenCalledWith('14');
  });

  it('returns 200 [] when the call has no positions (never 404)', async () => {
    mockQueryCallPositions.mockResolvedValueOnce([]);

    const response = await app.inject({ method: 'GET', url: '/api/calls/999/positions' });

    expect(response.statusCode).toBe(200);
    expect(response.json<unknown[]>()).toEqual([]);
  });

  it('returns 200 [] on subgraph failure (graceful degrade, never 500)', async () => {
    mockQueryCallPositions.mockRejectedValueOnce(new Error('subgraph down'));

    const response = await app.inject({ method: 'GET', url: '/api/calls/14/positions' });

    expect(response.statusCode).toBe(200);
    expect(response.json<unknown[]>()).toEqual([]);
  });

  it('returns 400 for a non-numeric call id', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/calls/not-a-number/positions' });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toBe('invalid_call_id');
  });

  it('coerces unknown side values to "follow" (web union type safety)', async () => {
    mockQueryCallPositions.mockResolvedValueOnce([
      {
        user: '0xcccccccccccccccccccccccccccccccccccccccc',
        side: 'weird-side',
        usdcDeposited: '100',
        sharesHeld: '100',
        entryTime: '1780000002',
        exitedAt: '1780000010',
      },
    ]);

    const response = await app.inject({ method: 'GET', url: '/api/calls/14/positions' });
    const body = response.json<Array<Record<string, unknown>>>();
    expect(body[0]?.['side']).toBe('follow');
    expect(body[0]?.['exitedAt']).toBe('1780000010');
  });
});
