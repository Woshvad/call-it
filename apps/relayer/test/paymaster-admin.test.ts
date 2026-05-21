/**
 * Task 3 TDD — Paymaster admin endpoint tests (SAFETY-16)
 *
 * Tests PATCH /admin/paymaster-cap with GCP IAM token verification.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock google-auth-library
vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    verifyIdToken: vi.fn().mockImplementation(({ idToken }: { idToken: string }) => {
      if (idToken === 'valid-iam-token') {
        return Promise.resolve({ getPayload: () => ({ sub: 'test-sa@project.iam.gserviceaccount.com' }) });
      }
      return Promise.reject(new Error('Invalid token'));
    }),
  })),
}));

vi.mock('../src/lib/redis.js', () => {
  const RedisMock = require('ioredis-mock');
  const redisMock = new RedisMock();
  return {
    getRedis: () => redisMock,
    _setRedisForTesting: vi.fn(),
    _resetRedisForTesting: vi.fn(),
    pingWithBullMQCompat: vi.fn().mockResolvedValue({ ok: true, failures: [] }),
  };
});

vi.mock('../src/workers/alerts.js', () => ({
  sendAlert: vi.fn().mockResolvedValue(undefined),
  P0_EVENTS: new Set(['pause', 'dispute_raised', 'force_settle', 'rep_fallback', 'settle_failed', 'stylus_reactivation']),
}));

import Fastify from 'fastify';
import { paymasterAdminRoute } from '../src/routes/admin-paymaster.js';
import { getRedis } from '../src/lib/redis.js';

async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(paymasterAdminRoute);
  return app;
}

describe('PATCH /admin/paymaster-cap', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    app = await buildTestApp();
    const redis = getRedis();
    await (redis as unknown as { flushall(): Promise<string> }).flushall();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/admin/paymaster-cap',
      payload: { newCapUsdc6: '100000000' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns 401 when Authorization token is invalid', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/admin/paymaster-cap',
      headers: { authorization: 'Bearer invalid-token' },
      payload: { newCapUsdc6: '100000000' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('returns 200 and updates cap in Redis with valid IAM token', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/admin/paymaster-cap',
      headers: { authorization: 'Bearer valid-iam-token' },
      payload: { newCapUsdc6: '100000000' },
    });
    expect(response.statusCode).toBe(200);

    // Verify cap was written to Redis
    const redis = getRedis();
    const cap = await redis.get('paymaster:cap');
    expect(cap).toBe('100000000');
  });
});
