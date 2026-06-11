/**
 * Synthetic-alert nonce replay guard across Redis outage/recovery
 * (review fix WR-05, quick-260611-h36).
 *
 * The in-memory cache is checked FIRST and claimed BEFORE the Redis SETNX on
 * every request, so a nonce claimed during a Redis outage stays claimed
 * in-process after Redis recovers (previously, recovery reopened a replay
 * window: Redis never saw the outage-claimed nonce, so a replayed SETNX
 * succeeded → duplicate alert). Single-machine bound — see the module header
 * in synthetic-event-handler.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRedisSet, mockSendAlert } = vi.hoisted(() => ({
  mockRedisSet: vi.fn(),
  mockSendAlert: vi.fn(),
}));

vi.mock('../../lib/redis.js', () => ({ getRedis: () => ({ set: mockRedisSet }) }));
vi.mock('../alerts.js', () => ({ sendAlert: mockSendAlert }));
vi.mock('../../lib/logger.js', () => {
  const fake = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { getLogger: () => fake, logger: fake };
});

import { createHmac } from 'node:crypto';
import { syntheticEventHandler, _clearNonceCacheForTesting } from '../synthetic-event-handler.js';

const SECRET = 'test-hmac-secret';

function makeReqReply(nonce: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = { event: 'pause', nonce, timestamp };
  const hmac = createHmac('sha256', SECRET)
    .update(JSON.stringify({ event: body.event, nonce, timestamp }))
    .digest('hex');
  const request = { body, headers: { 'x-internal-hmac': hmac } };
  const sent: { status?: number; payload?: unknown } = {};
  const reply = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    async send(payload: unknown) {
      sent.payload = payload;
    },
  };
  return { request, reply, sent };
}

describe('synthetic-alert nonce guard (WR-05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendAlert.mockResolvedValue(undefined);
    _clearNonceCacheForTesting();
    process.env.RELAYER_INTERNAL_HMAC = SECRET;
  });

  it('a nonce claimed during a Redis outage stays claimed after Redis recovers', async () => {
    // Outage: SETNX throws → in-memory claim, alert still dispatched (200).
    mockRedisSet.mockRejectedValueOnce(new Error('quota exceeded'));
    const first = makeReqReply('nonce-outage-1');
    await syntheticEventHandler(first.request as never, first.reply as never);
    expect(first.sent.status).toBe(200);
    expect(mockSendAlert).toHaveBeenCalledTimes(1);

    // Recovery: Redis is healthy and has NEVER seen the nonce — the memory
    // check must reject the replay BEFORE Redis is even consulted.
    mockRedisSet.mockResolvedValue('OK');
    const replay = makeReqReply('nonce-outage-1');
    await syntheticEventHandler(replay.request as never, replay.reply as never);
    expect(replay.sent.status).toBe(400);
    expect(mockSendAlert).toHaveBeenCalledTimes(1); // no duplicate alert
    expect(mockRedisSet).toHaveBeenCalledTimes(1); // memory rejected it first
  });

  it('healthy path dual-writes: a Redis-accepted nonce is rejected from memory during a later outage', async () => {
    mockRedisSet.mockResolvedValueOnce('OK');
    const first = makeReqReply('nonce-dual-1');
    await syntheticEventHandler(first.request as never, first.reply as never);
    expect(first.sent.status).toBe(200);

    // Later outage: Redis SETNX would throw — but memory holds the claim, so
    // the replay is rejected without firing a second alert.
    mockRedisSet.mockRejectedValue(new Error('down again'));
    const replay = makeReqReply('nonce-dual-1');
    await syntheticEventHandler(replay.request as never, replay.reply as never);
    expect(replay.sent.status).toBe(400);
    expect(mockSendAlert).toHaveBeenCalledTimes(1);
  });

  it('a normal Redis SETNX replay-reject (nonce claimed elsewhere) still 400s', async () => {
    // Memory is empty for this nonce; Redis already holds it → not-OK.
    mockRedisSet.mockResolvedValue(null);
    const replayed = makeReqReply('nonce-redis-held-1');
    await syntheticEventHandler(replayed.request as never, replayed.reply as never);
    expect(replayed.sent.status).toBe(400);
    expect(mockSendAlert).not.toHaveBeenCalled();
  });

  it('a fresh nonce on healthy Redis claims both stores and dispatches', async () => {
    mockRedisSet.mockResolvedValue('OK');
    const fresh = makeReqReply('nonce-fresh-1');
    await syntheticEventHandler(fresh.request as never, fresh.reply as never);
    expect(fresh.sent.status).toBe(200);
    expect(mockRedisSet).toHaveBeenCalledWith(
      'paymaster:internal-nonce:nonce-fresh-1',
      '1',
      'EX',
      600,
      'NX',
    );
    expect(mockSendAlert).toHaveBeenCalledTimes(1);
  });
});
