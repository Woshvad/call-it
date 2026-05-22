/**
 * privy-webhook route tests (Plan 07, Task 2 — TDD GREEN).
 *
 * Tests:
 *   1. Returns 401 on missing Svix headers
 *   2. Returns 401 on invalid HMAC signature
 *   3. Returns 200 + inserts auth_methods row on valid auth.linked event
 *   4. Returns 200 + idempotent on duplicate delivery (onConflictDoNothing)
 *   5. Returns 200 no-op for non-auth.linked events (other event types)
 *   6. Returns 500 if PRIVY_WEBHOOK_SECRET is not set
 *
 * Mock strategy:
 *   - PRIVY_WEBHOOK_SECRET set in process.env for testing
 *   - HMAC computed with real crypto for valid requests
 *   - In-memory auth_methods store
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';

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

// ─── In-memory store for auth_methods ────────────────────────────────────────

interface AuthMethodRow {
  id: number;
  privyUserId: string;
  authType: string;
  linkedAt: Date;
}

let authMethodsStore: AuthMethodRow[] = [];
let nextId = 1;

function createMockDb() {
  return {
    insert: () => ({
      values: (data: Omit<AuthMethodRow, 'id'>) => ({
        onConflictDoNothing: () => {
          // Idempotent: check if row already exists (by privyUserId + authType)
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

vi.mock('../src/db/client.js', () => ({
  getDb: () => createMockDb(),
  _resetDbForTesting: vi.fn(),
  _setDbForTesting: vi.fn(),
}));

// ─── Test setup ───────────────────────────────────────────────────────────────

import Fastify from 'fastify';
import { privyWebhookRoute } from '../src/routes/privy-webhook.js';

const TEST_WEBHOOK_SECRET = 'test-webhook-secret-plain';
const TEST_SVIX_ID = 'msg_test_001';
const TEST_TIMESTAMP = '1716000000';

async function buildTestApp(secret?: string) {
  process.env.PRIVY_WEBHOOK_SECRET = secret ?? TEST_WEBHOOK_SECRET;
  const app = Fastify({ logger: false });
  await app.register(privyWebhookRoute);
  return app;
}

/**
 * Compute a valid Svix signature for testing.
 * Uses the same algorithm as verifySvixSignature in the route.
 */
function computeValidSignature(svixId: string, timestamp: string, body: string, secret: string): string {
  const keyBytes = Buffer.from(secret, 'utf-8');
  const signedContent = `${svixId}.${timestamp}.${body}`;
  const hmac = createHmac('sha256', keyBytes).update(signedContent).digest('base64');
  return `v1,${hmac}`;
}

function makeAuthLinkedPayload(userId: string, authType: string, verifiedAt?: number): string {
  return JSON.stringify({
    type: 'auth.linked',
    data: {
      userId,
      linkedAccount: { type: authType, verifiedAt },
      linkedAt: verifiedAt,
    },
  });
}

describe('POST /api/privy/webhook', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    authMethodsStore = [];
    nextId = 1;
    app = await buildTestApp();
  });

  it('Test 1: returns 401 when Svix headers are missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/privy/webhook',
      headers: { 'content-type': 'application/json' },
      payload: { type: 'auth.linked' },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body) as { error: string; code: string };
    expect(body.error).toBe('unauthorized');
    expect(body.code).toBe('missing_signature');
  });

  it('Test 2: returns 401 on invalid HMAC signature', async () => {
    const bodyStr = makeAuthLinkedPayload('did:privy:user1', 'google');
    const res = await app.inject({
      method: 'POST',
      url: '/api/privy/webhook',
      headers: {
        'content-type': 'application/json',
        'svix-id': TEST_SVIX_ID,
        'svix-timestamp': TEST_TIMESTAMP,
        'svix-signature': 'v1,invalidsignature',
      },
      payload: bodyStr,
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body) as { code: string };
    expect(body.code).toBe('invalid_signature');
  });

  it('Test 3: returns 200 and inserts auth_methods row on valid auth.linked event', async () => {
    const userId = 'did:privy:webhook-user-1';
    const authType = 'google';
    const verifiedAt = Math.floor(Date.now() / 1000) - 3600; // 1h ago
    const bodyStr = makeAuthLinkedPayload(userId, authType, verifiedAt);
    const sig = computeValidSignature(TEST_SVIX_ID, TEST_TIMESTAMP, bodyStr, TEST_WEBHOOK_SECRET);

    const res = await app.inject({
      method: 'POST',
      url: '/api/privy/webhook',
      headers: {
        'content-type': 'application/json',
        'svix-id': TEST_SVIX_ID,
        'svix-timestamp': TEST_TIMESTAMP,
        'svix-signature': sig,
      },
      payload: bodyStr,
    });

    expect(res.statusCode).toBe(200);
    const responseBody = JSON.parse(res.body) as { ok: boolean };
    expect(responseBody.ok).toBe(true);

    // Verify the row was inserted
    const row = authMethodsStore.find(
      r => r.privyUserId === userId && r.authType === authType,
    );
    expect(row).toBeDefined();
    expect(row?.linkedAt).toBeInstanceOf(Date);
  });

  it('Test 4: idempotent on duplicate delivery — second delivery does not create duplicate row', async () => {
    const userId = 'did:privy:webhook-user-2';
    const authType = 'twitter';
    const verifiedAt = Math.floor(Date.now() / 1000) - 7200;
    const bodyStr = makeAuthLinkedPayload(userId, authType, verifiedAt);
    const sig = computeValidSignature(TEST_SVIX_ID, TEST_TIMESTAMP, bodyStr, TEST_WEBHOOK_SECRET);

    const headers = {
      'content-type': 'application/json',
      'svix-id': TEST_SVIX_ID,
      'svix-timestamp': TEST_TIMESTAMP,
      'svix-signature': sig,
    };

    // First delivery
    await app.inject({
      method: 'POST',
      url: '/api/privy/webhook',
      headers,
      payload: bodyStr,
    });

    // Duplicate delivery
    await app.inject({
      method: 'POST',
      url: '/api/privy/webhook',
      headers,
      payload: bodyStr,
    });

    // Only ONE row in the store (onConflictDoNothing)
    const rows = authMethodsStore.filter(
      r => r.privyUserId === userId && r.authType === authType,
    );
    expect(rows.length).toBe(1);
  });

  it('Test 5: returns 200 no-op for non-auth.linked events', async () => {
    const bodyStr = JSON.stringify({ type: 'wallet.funded', data: {} });
    const sig = computeValidSignature(TEST_SVIX_ID, TEST_TIMESTAMP, bodyStr, TEST_WEBHOOK_SECRET);

    const res = await app.inject({
      method: 'POST',
      url: '/api/privy/webhook',
      headers: {
        'content-type': 'application/json',
        'svix-id': TEST_SVIX_ID,
        'svix-timestamp': TEST_TIMESTAMP,
        'svix-signature': sig,
      },
      payload: bodyStr,
    });

    expect(res.statusCode).toBe(200);
    // No rows inserted for non-auth.linked events
    expect(authMethodsStore.length).toBe(0);
  });

  it('Test 6: returns 500 if PRIVY_WEBHOOK_SECRET is not set', async () => {
    // Build app without secret
    delete process.env.PRIVY_WEBHOOK_SECRET;
    const appNoSecret = Fastify({ logger: false });
    await appNoSecret.register(privyWebhookRoute);

    const bodyStr = makeAuthLinkedPayload('did:privy:user3', 'google');

    const res = await appNoSecret.inject({
      method: 'POST',
      url: '/api/privy/webhook',
      headers: {
        'content-type': 'application/json',
        'svix-id': TEST_SVIX_ID,
        'svix-timestamp': TEST_TIMESTAMP,
        'svix-signature': 'v1,doesnotmatter',
      },
      payload: bodyStr,
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body) as { code: string };
    expect(body.code).toBe('webhook_not_configured');

    // Restore
    process.env.PRIVY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
  });
});
