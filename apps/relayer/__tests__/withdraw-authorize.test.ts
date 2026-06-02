/**
 * withdraw-authorize route tests (Plan 07, Task 2 — TDD GREEN).
 *
 * Tests:
 *   1. Returns 401 without valid session
 *   2. Returns 403 with blockedBy: 'auth_method' when auth method linked < 24h ago
 *   3. Returns 200 authorized when auth method linked > 24h ago, destination not in book
 *   4. Returns 403 with blockedBy: 'destination' when destination added < 24h ago
 *   5. Returns 200 when both auth method > 24h AND destination > 24h
 *   6. Pitfall D: mock getUser() to return fresh linkedAccount → lazy backfill + 403
 *   7. Telegram alert fired (P0) on every 403 cooldown block
 *   8. Returns 400 on invalid body
 *
 * Mock strategy:
 *   - In-memory stores for auth_methods + address_book
 *   - @privy-io/server-auth mocked with controllable getUser() response
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Controllable mock state ──────────────────────────────────────────────────

const VALID_TOKEN = 'valid-privy-token-wa-test';
const VALID_USER_ID = 'did:privy:withdraw-auth-user';

// Mutable getUser response — updated per test for Pitfall D scenarios
let mockGetUserResponse: { linkedAccounts: Array<{ type: string; verifiedAt?: Date }> } = {
  linkedAccounts: [],
};

// ─── Mock @privy-io/server-auth ───────────────────────────────────────────────

vi.mock('@privy-io/server-auth', () => ({
  PrivyClient: vi.fn().mockImplementation(() => ({
    verifyAuthToken: vi.fn().mockImplementation((token: string) => {
      if (token === VALID_TOKEN) {
        return Promise.resolve({ userId: VALID_USER_ID });
      }
      return Promise.reject(new Error('Invalid token'));
    }),
    getUser: vi.fn().mockImplementation((_userId: string) => {
      return Promise.resolve(mockGetUserResponse);
    }),
  })),
}));

// ─── Mock privy-auth.ts to use the same mock PrivyClient instance ─────────────
// The singleton pattern in privy-auth.ts means getPrivyClient() caches the first
// PrivyClient instance. We need to ensure getUser() on that instance is controllable.
// Solution: mock the module directly and expose a fresh getPrivyClient() each test.

const mockPrivyClientInstance = {
  verifyAuthToken: vi.fn().mockImplementation((token: string) => {
    if (token === VALID_TOKEN) return Promise.resolve({ userId: VALID_USER_ID });
    return Promise.reject(new Error('Invalid token'));
  }),
  getUser: vi.fn().mockImplementation((_userId: string) => {
    return Promise.resolve(mockGetUserResponse);
  }),
};

vi.mock('../src/lib/privy-auth.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    getPrivyClient: () => mockPrivyClientInstance,
    privySessionPreHandler: vi.fn().mockImplementation(
      async (request: { headers: { authorization?: string }; privyUserId?: string }, reply: { status: (n: number) => { send: (b: unknown) => unknown } }) => {
        const auth = request.headers.authorization;
        if (!auth?.startsWith('Bearer ')) {
          return reply.status(401).send({ error: 'unauthorized', code: 'invalid_session' });
        }
        const token = auth.slice('Bearer '.length).trim();
        if (token !== VALID_TOKEN) {
          return reply.status(401).send({ error: 'unauthorized', code: 'invalid_session' });
        }
        request.privyUserId = VALID_USER_ID;
      },
    ),
  };
});

// ─── Mock Redis ───────────────────────────────────────────────────────────────

vi.mock('../src/lib/redis.js', () => ({
  getRedis: vi.fn(),
  pingWithBullMQCompat: vi.fn().mockResolvedValue({ ok: true, failures: [] }),
}));

// ─── Mock alerts ──────────────────────────────────────────────────────────────

vi.mock('../src/workers/alerts.js', () => ({
  sendAlert: vi.fn().mockResolvedValue(undefined),
  P0_EVENTS: new Set(['pause', 'dispute_raised', 'force_settle', 'rep_fallback', 'settle_failed', 'stylus_reactivation', 'address_book_cooldown_bypass_attempt']),
}));

// ─── In-memory stores for auth_methods + address_book ────────────────────────

interface AuthMethodRow {
  id: number;
  privyUserId: string;
  authType: string;
  linkedAt: Date;
}

interface AddressBookRow {
  id: number;
  privyUserId: string;
  address: string;
  label: string | null;
  addedAt: Date;
  removedAt: Date | null;
}

let authMethodsStore: AuthMethodRow[] = [];
let addressBookStore: AddressBookRow[] = [];
let nextId = 1;

const NOW = new Date();
const TWENTY_FIVE_HOURS_AGO = new Date(NOW.getTime() - 25 * 60 * 60 * 1000);
const TWELVE_HOURS_AGO = new Date(NOW.getTime() - 12 * 60 * 60 * 1000);

// Track which "table" the last .from() referred to for routing queries
let _lastTableRef: 'auth_methods' | 'address_book' | 'unknown' = 'unknown';

function createMockDb() {
  return {
    select: (_fields?: unknown) => ({
      from: (table: unknown) => {
        // Detect table reference by inspecting the table object
        // The schema objects have a Symbol key we can detect
        const tableStr = String(table);
        if (tableStr.includes('address_book') || (table as Record<string,unknown>)['address']) {
          _lastTableRef = 'address_book';
        } else {
          // Default to auth_methods for the withdraw route's queries
          _lastTableRef = 'auth_methods';
        }

        return {
          where: (cond: unknown) => {
            const c = cond as { _filter?: (row: Record<string, unknown>) => boolean };
            const filter = c._filter ?? (() => true);
            const tableHint = _lastTableRef;

            const selectResult = tableHint === 'address_book'
              ? addressBookStore.filter(r => filter(r as unknown as Record<string, unknown>)).map(r => ({
                  id: r.id,
                  addedAt: r.addedAt,
                  address: r.address,
                  removedAt: r.removedAt,
                }))
              : authMethodsStore.filter(r => filter(r as unknown as Record<string, unknown>)).map(r => ({
                  id: r.id,
                  linkedAt: r.linkedAt,
                  privyUserId: r.privyUserId,
                  authType: r.authType,
                }));

            // Support .limit() chaining
            return Object.assign(Promise.resolve(selectResult), {
              limit: (_n: number) => {
                return Promise.resolve(selectResult.slice(0, _n));
              },
            });
          },
        };
      },
    }),
    insert: (_table: unknown) => ({
      values: (data: Omit<AuthMethodRow, 'id'>) => ({
        onConflictDoNothing: () => {
          // Check if already exists to simulate ON CONFLICT DO NOTHING
          const exists = authMethodsStore.some(
            r => r.privyUserId === data.privyUserId && r.authType === data.authType,
          );
          if (!exists) {
            authMethodsStore.push({ id: nextId++, ...data });
          }
          return Promise.resolve();
        },
      }),
    }),
  };
}

// Simplified Drizzle operator mocks
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    eq: (_col: unknown, val: unknown) => ({
      _filter: (row: Record<string, unknown>) => Object.values(row).some(v => v === val),
      _val: val,
    }),
    and: (...conditions: Array<{ _filter?: (row: Record<string, unknown>) => boolean }>) => ({
      _filter: (row: Record<string, unknown>) =>
        conditions.every(c => c._filter ? c._filter(row) : true),
    }),
    isNull: () => ({
      _filter: (row: Record<string, unknown>) => row.removedAt === null || row.removedAt === undefined,
    }),
    max: vi.fn().mockReturnValue({ _isMax: true }),
  };
});

vi.mock('../src/db/client.js', () => ({
  getDb: () => createMockDb(),
  _resetDbForTesting: vi.fn(),
  _setDbForTesting: vi.fn(),
}));

// ─── Test setup ───────────────────────────────────────────────────────────────

import Fastify from 'fastify';
import { withdrawAuthorizeRoute } from '../src/routes/withdraw-authorize.js';
import * as alertsMod from '../src/workers/alerts.js';

process.env.PRIVY_APP_ID = 'test-app-id';
process.env.PRIVY_APP_SECRET = 'test-app-secret';

async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(withdrawAuthorizeRoute);
  return app;
}

const DEST_ADDRESS = '0xdddddddddddddddddddddddddddddddddddddddd';
const USER_OP_HASH = '0xaaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa1111bbbb2222cc';

describe('POST /api/withdraw/authorize', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    authMethodsStore = [];
    addressBookStore = [];
    nextId = 1;
    mockGetUserResponse = { linkedAccounts: [] };
    vi.mocked(alertsMod.sendAlert).mockClear();
    mockPrivyClientInstance.getUser.mockClear();
    app = await buildTestApp();
  });

  it('Test 1: returns 401 without valid session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/withdraw/authorize',
      headers: { 'content-type': 'application/json' },
      payload: { destination: DEST_ADDRESS, userOpHash: USER_OP_HASH },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body) as { code: string };
    expect(body.code).toBe('invalid_session');
  });

  it('Test 2: returns 403 with blockedBy: auth_method when linked < 24h ago', async () => {
    // Auth method linked only 12h ago (within cooldown)
    authMethodsStore.push({
      id: 1,
      privyUserId: VALID_USER_ID,
      authType: 'wallet',
      linkedAt: TWELVE_HOURS_AGO,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/withdraw/authorize',
      headers: {
        authorization: `Bearer ${VALID_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: { destination: DEST_ADDRESS, userOpHash: USER_OP_HASH },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body) as {
      error: string;
      code: string;
      blockedBy: string;
      cooldownEndsAt: string;
    };
    expect(body.code).toBe('cooldown_active');
    expect(body.blockedBy).toBe('auth_method');
    expect(body.cooldownEndsAt).toBeDefined();
  });

  it('Test 3: returns 200 when auth method linked > 24h ago and destination not in book', async () => {
    // Auth method linked 25h ago (outside cooldown)
    authMethodsStore.push({
      id: 1,
      privyUserId: VALID_USER_ID,
      authType: 'wallet',
      linkedAt: TWENTY_FIVE_HOURS_AGO,
    });
    // Destination not in address book

    const res = await app.inject({
      method: 'POST',
      url: '/api/withdraw/authorize',
      headers: {
        authorization: `Bearer ${VALID_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: { destination: DEST_ADDRESS, userOpHash: USER_OP_HASH },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { authorized: boolean };
    expect(body.authorized).toBe(true);
  });

  it('Test 4: returns 403 with blockedBy: destination when destination added < 24h ago', async () => {
    // Auth method well outside cooldown
    authMethodsStore.push({
      id: 1,
      privyUserId: VALID_USER_ID,
      authType: 'wallet',
      linkedAt: TWENTY_FIVE_HOURS_AGO,
    });
    // Destination added only 5h ago
    addressBookStore.push({
      id: 1,
      privyUserId: VALID_USER_ID,
      address: DEST_ADDRESS.toLowerCase(),
      label: null,
      addedAt: new Date(NOW.getTime() - 5 * 60 * 60 * 1000),
      removedAt: null,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/withdraw/authorize',
      headers: {
        authorization: `Bearer ${VALID_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: { destination: DEST_ADDRESS, userOpHash: USER_OP_HASH },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body) as { code: string; blockedBy: string };
    expect(body.code).toBe('cooldown_active');
    expect(body.blockedBy).toBe('destination');
  });

  it('Test 5: returns 200 when both checks pass (all > 24h ago)', async () => {
    // Auth method > 24h
    authMethodsStore.push({
      id: 1,
      privyUserId: VALID_USER_ID,
      authType: 'wallet',
      linkedAt: TWENTY_FIVE_HOURS_AGO,
    });
    // Destination > 24h
    addressBookStore.push({
      id: 1,
      privyUserId: VALID_USER_ID,
      address: DEST_ADDRESS.toLowerCase(),
      label: null,
      addedAt: TWENTY_FIVE_HOURS_AGO,
      removedAt: null,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/withdraw/authorize',
      headers: {
        authorization: `Bearer ${VALID_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: { destination: DEST_ADDRESS, userOpHash: USER_OP_HASH },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { authorized: boolean };
    expect(body.authorized).toBe(true);
  });

  it('Test 6: Pitfall D — fresh linkedAccount in Privy but missing auth_methods row → 403 + lazy backfill', async () => {
    // NO auth_methods rows — simulates a scenario where webhook was missed
    // Privy's getUser() returns a linkedAccount with verifiedAt = 1h ago
    // Privy returns verifiedAt as a Date (not a unix-seconds number) — mock it as
    // such so this test exercises the real type the production code consumes.
    const oneHourAgo = new Date(NOW.getTime() - 60 * 60 * 1000);
    mockGetUserResponse = {
      linkedAccounts: [{ type: 'google', verifiedAt: oneHourAgo }],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/api/withdraw/authorize',
      headers: {
        authorization: `Bearer ${VALID_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: { destination: DEST_ADDRESS, userOpHash: USER_OP_HASH },
    });

    // Must be rejected (Pitfall D backfill + reject)
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body) as { code: string; blockedBy: string };
    expect(body.code).toBe('cooldown_active');
    expect(body.blockedBy).toBe('auth_method');

    // The missing row must have been inserted (lazy backfill)
    const backfilledRow = authMethodsStore.find(
      r => r.privyUserId === VALID_USER_ID && r.authType === 'google',
    );
    expect(backfilledRow).toBeDefined();
  });

  it('Test 7: telegram alert (P0) fired on every cooldown block', async () => {
    authMethodsStore.push({
      id: 1,
      privyUserId: VALID_USER_ID,
      authType: 'wallet',
      linkedAt: TWELVE_HOURS_AGO,
    });

    await app.inject({
      method: 'POST',
      url: '/api/withdraw/authorize',
      headers: {
        authorization: `Bearer ${VALID_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: { destination: DEST_ADDRESS, userOpHash: USER_OP_HASH },
    });

    const mockSendAlert = vi.mocked(alertsMod.sendAlert);
    expect(mockSendAlert).toHaveBeenCalled();
    const [event] = mockSendAlert.mock.calls[0] as [string, unknown];
    expect(event).toBe('address_book_cooldown_bypass_attempt');
  });

  it('Test 8: returns 400 on invalid body (missing destination)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/withdraw/authorize',
      headers: {
        authorization: `Bearer ${VALID_TOKEN}`,
        'content-type': 'application/json',
      },
      payload: { userOpHash: USER_OP_HASH },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe('validation_failed');
  });
});
