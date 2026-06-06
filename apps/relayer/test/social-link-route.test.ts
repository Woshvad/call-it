/**
 * AUTH-06/07/13 / D-06 — social-link route (link twitter + uniqueness 409).
 *
 * Asserts:
 *  - happy path: verified Twitter handle → linkTwitter submitted via the (mocked)
 *    KMS submitter → 200 { txHash, handle, proofHash } + active index row recorded.
 *  - D-06 uniqueness: a second account linking a handle actively linked to a
 *    DIFFERENT user_address → 409 { error: 'handle_already_linked' }, no submit.
 *  - re-link of the SAME handle to the SAME user is allowed (200).
 *  - the handle ALWAYS comes from Privy (Pitfall 2) — the request body is ignored.
 *
 * Requirement: AUTH-06, AUTH-13. Decision: D-06.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Privy: session verify + getUser (handle extraction + wallet resolution) ──
// Mock the whole module: supply a preHandler that uses verifyAuthTokenMock so a
// "Bearer valid" header attaches privyUserId, plus getPrivyClient for the
// handle/wallet reads (twitter-proof + wallet resolution).
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

// ── Redis (ioredis-mock) ──────────────────────────────────────────────────────
vi.mock('../src/lib/redis.js', () => {
  const RedisMock = require('ioredis-mock');
  const redisMock = new RedisMock();
  return { getRedis: () => redisMock };
});

import Fastify from 'fastify';
import { socialLinkRoute } from '../src/routes/social-link.js';
import { HandleAlreadyLinkedError } from '../src/lib/social-link-index.js';

const USER_A = '0xaaaa000000000000000000000000000000000001';
const USER_B = '0xbbbb000000000000000000000000000000000002';

/**
 * Minimal drizzle-shaped fake. select().from().where() returns whatever the
 * configured `activeRows` produce; insert/update record calls. We control the
 * uniqueness outcome via assertHandleAvailable's select result.
 */
function makeFakeDb(activeRows: Array<{ userAddress: string; unlinkedAt: Date | null }>) {
  const calls = { insert: 0, update: 0, selectWhere: 0 };
  const db = {
    select: () => ({
      from: () => ({
        where: async () => {
          calls.selectWhere++;
          return activeRows;
        },
      }),
    }),
    insert: () => ({ values: async () => { calls.insert++; } }),
    update: () => ({ set: () => ({ where: async () => { calls.update++; } }) }),
    delete: () => ({ where: async () => undefined }),
  };
  return { db: db as never, calls };
}

function makeSubmitter() {
  const writeContract = vi.fn().mockResolvedValue('0xdeadbeef' as `0x${string}`);
  return { submitter: { account: { address: USER_A }, writeContract }, writeContract };
}

async function buildApp(deps: { db: unknown; getSubmitter: () => never }) {
  const app = Fastify({ logger: false });
  // Session token "valid" → privyUserId resolved by verifyAuthToken mock.
  verifyAuthTokenMock.mockResolvedValue({ userId: 'did:privy:user-1' });
  await app.register(socialLinkRoute, deps as never);
  return app;
}

beforeEach(() => {
  verifyAuthTokenMock.mockReset();
  getUserMock.mockReset();
  // getUser returns BOTH a verified twitter_oauth handle AND a wallet account.
  getUserMock.mockResolvedValue({
    linkedAccounts: [
      { type: 'wallet', address: USER_A },
      { type: 'twitter_oauth', username: 'satoshi', subject: 'x-99' },
    ],
  });
});

describe('POST /api/social/link — happy path', () => {
  it('submits linkTwitter via KMS and returns 200 { txHash, handle, proofHash }', async () => {
    const { db, calls } = makeFakeDb([]); // no active rows → available
    const { submitter, writeContract } = makeSubmitter();
    const app = await buildApp({ db, getSubmitter: () => submitter as never });

    const res = await app.inject({
      method: 'POST',
      url: '/api/social/link',
      headers: { authorization: 'Bearer valid' },
      // Body carries a bogus handle — Pitfall 2: it must be ignored.
      payload: { handle: 'attacker_handle' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.handle).toBe('satoshi'); // from Privy, NOT the body
    expect(body.txHash).toBe('0xdeadbeef');
    expect(body.proofHash).toMatch(/^0x[0-9a-f]{64}$/);
    // linkTwitter submitted with the Privy-verified handle.
    expect(writeContract).toHaveBeenCalledTimes(1);
    expect(writeContract.mock.calls[0][0]).toMatchObject({ functionName: 'linkTwitter' });
    expect(writeContract.mock.calls[0][0].args[1]).toBe('satoshi');
    // active index row recorded.
    expect(calls.insert + calls.update).toBeGreaterThan(0);
    await app.close();
  });

  it('returns 401 when no session token is present', async () => {
    const { db } = makeFakeDb([]);
    const { submitter } = makeSubmitter();
    const app = await buildApp({ db, getSubmitter: () => submitter as never });
    const res = await app.inject({ method: 'POST', url: '/api/social/link', payload: {} });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('POST /api/social/link — D-06 uniqueness', () => {
  it('returns 409 when the handle is actively linked to a DIFFERENT user', async () => {
    // An active row owned by USER_B blocks USER_A (resolves to USER_A wallet).
    const { db } = makeFakeDb([{ userAddress: USER_B, unlinkedAt: null }]);
    const { submitter, writeContract } = makeSubmitter();
    const app = await buildApp({ db, getSubmitter: () => submitter as never });

    const res = await app.inject({
      method: 'POST',
      url: '/api/social/link',
      headers: { authorization: 'Bearer valid' },
      payload: {},
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'handle_already_linked' });
    // No on-chain submit on conflict.
    expect(writeContract).not.toHaveBeenCalled();
    await app.close();
  });

  it('allows re-link of the SAME handle to the SAME user (200)', async () => {
    // An active row owned by USER_A (same wallet) is not a conflict.
    const { db } = makeFakeDb([{ userAddress: USER_A, unlinkedAt: null }]);
    const { submitter, writeContract } = makeSubmitter();
    const app = await buildApp({ db, getSubmitter: () => submitter as never });

    const res = await app.inject({
      method: 'POST',
      url: '/api/social/link',
      headers: { authorization: 'Bearer valid' },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(writeContract).toHaveBeenCalledTimes(1);
    await app.close();
  });
});

describe('D-06: HandleAlreadyLinkedError shape', () => {
  it('carries a 409 statusCode + handle_already_linked code', () => {
    const e = new HandleAlreadyLinkedError();
    expect(e.statusCode).toBe(409);
    expect(e.code).toBe('handle_already_linked');
  });
});
