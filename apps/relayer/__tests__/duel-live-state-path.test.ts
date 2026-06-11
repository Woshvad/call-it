/**
 * Duel live-state path alignment — quick-260611-5mh Task 3 (A6).
 *
 * CANONICAL PATH: GET /api/duels/:id/live-state
 *   - relayer registers it (src/routes/duel-live-state.ts:180)
 *   - the web calls it (apps/web/app/duel/[challengeId]/page.tsx:242 and
 *     layout.tsx:53)
 * The live-curl 404 of /api/calls/:id/duel-live-state probed a path that
 * NOTHING in the codebase serves or calls — no alias is needed. This suite
 * pins the canonical path so a future rename can't silently 404 the duel page.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockRedisGet, mockRedisSet } = vi.hoisted(() => ({
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
}));

vi.mock('../src/lib/redis.js', () => ({
  getRedis: vi.fn(() => ({ get: mockRedisGet, set: mockRedisSet })),
}));

vi.mock('../src/lib/logger.js', () => ({
  getLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));

// ── Import SUT (after mocks) ──────────────────────────────────────────────────

import { duelLiveStateRoute } from '../src/routes/duel-live-state.js';

// ── Test data — a cached DuelLiveStateResponse (cache-hit path, no RPC) ───────

const CACHED_DUEL_STATE = {
  challengeId: '1',
  callId: '14',
  caller: '0xda8c5726f596e8dae99e6ddeba8aea1c8be9a4a5',
  challenger: '0x7304a289aa8d5a4db23eb78c143e9aa376415ced',
  callerStake: '5000000',
  challengerStake: '5000000',
  pot: '10000000',
  status: 'Accepted',
  winner: null,
  followReserve: '0',
  fadeReserve: '0',
  expiry: '1780931059',
  deferred: false,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('duel live-state path alignment (quick-260611-5mh A6)', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(JSON.stringify(CACHED_DUEL_STATE));
    mockRedisSet.mockResolvedValue('OK');

    app = Fastify({ logger: false });
    await app.register(duelLiveStateRoute);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('CANONICAL: GET /api/duels/:id/live-state (the path the web calls) resolves 200', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/duels/1/live-state' });

    expect(response.statusCode).toBe(200);
    const body = response.json<typeof CACHED_DUEL_STATE>();
    expect(body.challengeId).toBe('1');
    expect(body.callId).toBe('14');
    expect(body.status).toBe('Accepted');
  });

  it('non-canonical probe path /api/calls/:id/duel-live-state is NOT served (documented 404)', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/calls/1/duel-live-state' });
    expect(response.statusCode).toBe(404);
  });

  it('non-numeric challengeId → 400', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/duels/abc/live-state' });
    expect(response.statusCode).toBe(400);
  });
});
