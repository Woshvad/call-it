/**
 * AUTH-12 / AUTH-17 / D-13 — unlink-purge dual-store clear (Pitfall 6).
 *
 * Asserts:
 *  - POST /api/social/unlink-purge deletes follow_graph rows (Postgres) AND deletes
 *    the Redis follow-graph cache key — BOTH stores cleared before returning 200.
 *  - it does NOT submit an on-chain unlink (the relayer only purges off-chain data;
 *    unlink is user-callable on-chain — AUTH-12).
 *  - session-gated (401 without a token).
 *
 * Requirement: AUTH-12, AUTH-17. Decision: D-13. Pitfall 6.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Privy: session verify + getUser (wallet resolution for markUnlinked) ──────
// Mock the whole module: the route imports BOTH getPrivyClient (handle/wallet
// reads) and privySessionPreHandler (session gate). We supply a preHandler that
// uses verifyAuthTokenMock so a "Bearer valid" header attaches privyUserId.
const verifyAuthTokenMock = vi.fn();
const getUserMock = vi.fn();
vi.mock('../src/lib/privy-auth.js', () => ({
  getPrivyClient: () => ({ verifyAuthToken: verifyAuthTokenMock, getUser: getUserMock }),
  privySessionPreHandler: async (
    request: { headers: Record<string, string | undefined>; privyUserId?: string },
    reply: { status: (n: number) => { send: (b: unknown) => unknown } },
  ) => {
    const auth = request.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'unauthorized', code: 'invalid_session' });
    }
    try {
      const result = await verifyAuthTokenMock(auth.slice('Bearer '.length).trim());
      request.privyUserId = result.userId;
    } catch {
      return reply.status(401).send({ error: 'unauthorized', code: 'invalid_session' });
    }
  },
}));

// ── Redis del spy ─────────────────────────────────────────────────────────────
const redisDelMock = vi.fn().mockResolvedValue(1);
vi.mock('../src/lib/redis.js', () => ({
  getRedis: () => ({ del: redisDelMock, get: vi.fn().mockResolvedValue(null) }),
}));

import Fastify from 'fastify';
import { socialLinkRoute } from '../src/routes/social-link.js';

const USER_A = '0xaaaa000000000000000000000000000000000001';

/** Drizzle fake that records delete + update invocations. */
function makeFakeDb() {
  const calls = { delete: 0, update: 0 };
  const db = {
    select: () => ({ from: () => ({ where: async () => [] }) }),
    insert: () => ({ values: async () => undefined }),
    update: () => ({ set: () => ({ where: async () => { calls.update++; } }) }),
    delete: () => ({ where: async () => { calls.delete++; } }),
  };
  return { db: db as never, calls };
}

async function buildApp(db: unknown) {
  const app = Fastify({ logger: false });
  verifyAuthTokenMock.mockResolvedValue({ userId: 'did:privy:user-1' });
  // never builds the real KMS submitter — unlink-purge does no on-chain write.
  const failSubmitter = () => {
    throw new Error('submitter must NOT be built for unlink-purge');
  };
  await app.register(socialLinkRoute, { db, getSubmitter: failSubmitter } as never);
  return app;
}

beforeEach(() => {
  verifyAuthTokenMock.mockReset();
  getUserMock.mockReset();
  redisDelMock.mockClear();
  getUserMock.mockResolvedValue({ linkedAccounts: [{ type: 'wallet', address: USER_A }] });
});

describe('POST /api/social/unlink-purge — dual-store clear (AUTH-17, Pitfall 6)', () => {
  it('deletes Postgres follow_graph rows AND the Redis cache key, returns 200', async () => {
    const { db, calls } = makeFakeDb();
    const app = await buildApp(db);

    const res = await app.inject({
      method: 'POST',
      url: '/api/social/unlink-purge',
      headers: { authorization: 'Bearer valid' },
      payload: { platform: 'twitter' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ purged: true, platform: 'twitter' });
    // BOTH stores cleared (Pitfall 6).
    expect(calls.delete).toBe(1); // Postgres follow_graph delete
    expect(redisDelMock).toHaveBeenCalledTimes(1); // Redis cache del
    expect(redisDelMock).toHaveBeenCalledWith('follow:x:did:privy:user-1');
    // social_link_index marked unlinked (update).
    expect(calls.update).toBeGreaterThan(0);
    await app.close();
  });

  it('uses the fc cache key for the farcaster platform', async () => {
    const { db } = makeFakeDb();
    const app = await buildApp(db);
    const res = await app.inject({
      method: 'POST',
      url: '/api/social/unlink-purge',
      headers: { authorization: 'Bearer valid' },
      payload: { platform: 'farcaster' },
    });
    expect(res.statusCode).toBe(200);
    expect(redisDelMock).toHaveBeenCalledWith('follow:fc:did:privy:user-1');
    await app.close();
  });

  it('rejects an invalid platform with 400', async () => {
    const { db } = makeFakeDb();
    const app = await buildApp(db);
    const res = await app.inject({
      method: 'POST',
      url: '/api/social/unlink-purge',
      headers: { authorization: 'Bearer valid' },
      payload: { platform: 'myspace' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 401 without a session token', async () => {
    const { db } = makeFakeDb();
    const app = await buildApp(db);
    const res = await app.inject({
      method: 'POST',
      url: '/api/social/unlink-purge',
      payload: { platform: 'twitter' },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});
