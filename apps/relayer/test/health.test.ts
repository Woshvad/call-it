/**
 * Task 4 TDD — /health endpoint tests (OPS-24)
 *
 * Tests the Fastify app's /health endpoint without binding a real port.
 * Uses fastify.inject() for in-process HTTP simulation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock env module to avoid GCP Secret Manager calls in tests
vi.mock('../src/env.js', () => ({
  initEnv: vi.fn().mockResolvedValue({
    NEXT_PUBLIC_NETWORK: 'sepolia',
    NEXT_PUBLIC_CHAIN_ID: '421614',
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    GCP_PROJECT_ID: 'local-dev',
    GCP_LOCATION_ID: 'us-east1',
    GCP_KEYRING_ID: 'attestations',
    GCP_KEY_VERSION_NFT_TWAP: '1',
    GCP_KEY_VERSION_DEFILLAMA: '1',
    GCP_KEY_VERSION_CEX: '1',
    GCP_KEY_VERSION_SNAPSHOT_TALLY: '1',
    GCP_KEY_VERSION_OAUTH_PROOF: '1',
    TELEGRAM_BOT_TOKEN: 'test-token',
    TELEGRAM_CHAT_ID_P0: 'p0-chat',
    TELEGRAM_CHAT_ID_P1: 'p1-chat',
    UPSTASH_REDIS_REST_URL: 'redis://localhost:6379',
    UPSTASH_REDIS_REST_TOKEN: 'test-token',
    BETTERSTACK_SOURCE_TOKEN: 'test-token',
    PRIVY_APP_SECRET: 'test-secret',
    ALCHEMY_API_KEY: 'test-key',
    RELAYER_INTERNAL_HMAC: 'test-hmac-secret',
  }),
  getEnv: vi.fn().mockReturnValue({
    NEXT_PUBLIC_NETWORK: 'sepolia',
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
  }),
  _resetEnvForTesting: vi.fn(),
}));

// Mock Redis to avoid real connections
vi.mock('../src/lib/redis.js', () => ({
  getRedis: vi.fn().mockReturnValue(null),
  pingWithBullMQCompat: vi.fn().mockResolvedValue({ ok: true, failures: [] }),
  _resetRedisForTesting: vi.fn(),
}));

// Mock alerts to avoid Telegram calls
vi.mock('../src/workers/alerts.js', () => ({
  sendAlert: vi.fn().mockResolvedValue(undefined),
  P0_EVENTS: new Set(['pause', 'dispute_raised', 'force_settle', 'rep_fallback', 'settle_failed', 'stylus_reactivation']),
}));

import { buildApp } from '../src/index.js';

describe('GET /health', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    app = await buildApp();
  });

  it('returns 200 with status ok, timestamp, and version', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body) as { status: string; timestamp: string; version: string };
    expect(body.status).toBe('ok');
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO string
    expect(body.version).toBeDefined();
  });

  it('does not require authentication (anonymous request returns 200)', async () => {
    // No Authorization header — should still return 200
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      // No headers
    });

    expect(response.statusCode).toBe(200);
  });
});
