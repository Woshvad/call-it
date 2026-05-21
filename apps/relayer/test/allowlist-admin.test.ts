/**
 * Task 3 TDD — Allowlist admin endpoint tests (OPS-26)
 *
 * Tests POST /admin/allowlist returns 501 in Phase 0 with IAM auth gate.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

const loggedEvents: Array<{ event: string }> = [];
vi.mock('../src/lib/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn((obj: { event: string }) => { loggedEvents.push(obj); }),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  logger: {
    info: vi.fn((obj: { event: string }) => { loggedEvents.push(obj); }),
    warn: vi.fn(),
    error: vi.fn(),
  },
  setLogger: vi.fn(),
  REDACT_PATHS: [],
  createLogger: vi.fn(),
}));

import Fastify from 'fastify';
import { allowlistAdminRoute } from '../src/routes/admin-allowlist.js';

async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(allowlistAdminRoute);
  return app;
}

describe('POST /admin/allowlist', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    app = await buildTestApp();
    loggedEvents.length = 0;
  });

  it('returns 501 Not Implemented with valid IAM auth (Phase 0 stub)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/allowlist',
      headers: { authorization: 'Bearer valid-iam-token' },
      payload: { address: '0x1234567890123456789012345678901234567890', action: 'add' },
    });
    expect(response.statusCode).toBe(501);
  });

  it('logs allowlist_admin_invoked event when called with valid auth', async () => {
    await app.inject({
      method: 'POST',
      url: '/admin/allowlist',
      headers: { authorization: 'Bearer valid-iam-token' },
      payload: { address: '0x1234567890123456789012345678901234567890', action: 'add' },
    });

    const invocationLogs = loggedEvents.filter((e) => e.event === 'allowlist_admin_invoked');
    expect(invocationLogs.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 401 without Authorization header', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/allowlist',
      payload: { address: '0x1234567890123456789012345678901234567890', action: 'add' },
    });
    expect(response.statusCode).toBe(401);
  });
});
