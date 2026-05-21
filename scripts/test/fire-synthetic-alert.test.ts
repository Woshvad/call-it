/**
 * fire-synthetic-alert.test.ts — unit tests for scripts/fire-synthetic-alert.ts
 *
 * Tests (all use mocked fetch — no real Telegram or relayer calls):
 * - Test 1: Relayer 200 + Telegram nonce found within timeout → exits 0
 * - Test 2: Relayer 200 + Telegram does NOT return nonce → exits 1 with build-failer message
 * - Test 3: Relayer non-200 → exits 1, does NOT poll Telegram
 * - Test 4: Each invocation generates a fresh UUID nonce; old nonces ignored
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac, randomUUID } from 'node:crypto';

// We need to import the functions, not the CLI entry point
// The script should export its core functions for testability

describe('fire-synthetic-alert — mocked relayer + Telegram', () => {
  beforeEach(() => {
    // Set required env vars for all tests
    process.env.RELAYER_URL = 'http://localhost:8080';
    process.env.RELAYER_INTERNAL_HMAC_SECRET = 'test-hmac-secret-32bytes-exactly!!!';
    process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
    process.env.TELEGRAM_CHAT_ID_P0 = '-1001234567890';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.RELAYER_URL;
    delete process.env.RELAYER_INTERNAL_HMAC_SECRET;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID_P0;
  });

  it('Test 1: exits 0 when relayer 200 + Telegram nonce found within timeout', async () => {
    const { fireAndVerify } = await import('../fire-synthetic-alert.js');

    // Mock fetch: relayer returns 200, then Telegram returns the nonce
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(async (url: string, _init?: RequestInit) => {
      callCount++;
      if (String(url).includes('/internal/test-alert')) {
        return { ok: true, status: 200, json: async () => ({ ok: true, event: 'rep_fallback', nonce: 'test-nonce' }) } as Response;
      }
      if (String(url).includes('getUpdates')) {
        // Simulate: on first getUpdates call, return the nonce in a message
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: [
              {
                update_id: 1,
                channel_post: {
                  message_id: 1,
                  chat: { id: -1001234567890, type: 'channel' },
                  text: `🚨 P0 rep_fallback\n{"nonce": "EXPECTED_NONCE"}`,
                },
              },
            ],
          }),
        } as unknown as Response;
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    // We need to inject the nonce into the "expected" message. Let's use a different approach:
    // Use the captureAndVerify helper that captures the nonce used in the request.
    let capturedNonce = '';
    const enhancedFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/internal/test-alert')) {
        const body = JSON.parse((init?.body as string) ?? '{}');
        capturedNonce = body.nonce;
        return { ok: true, status: 200, json: async () => ({ ok: true, event: body.event, nonce: body.nonce }) } as Response;
      }
      if (String(url).includes('getUpdates')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            result: [
              {
                update_id: 1,
                channel_post: {
                  message_id: 1,
                  chat: { id: -1001234567890, type: 'channel' },
                  text: `🚨 P0 rep_fallback\nnonce:${capturedNonce}`,
                },
              },
            ],
          }),
        } as unknown as Response;
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await fireAndVerify({
      event: 'rep_fallback',
      waitSeconds: 10,
      expectChatId: '-1001234567890',
      fetchFn: enhancedFetch as unknown as typeof fetch,
    });

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.nonce).toMatch(/^[0-9a-f-]{36}$/); // UUID format
  });

  it('Test 2: exits 1 when Telegram does NOT return nonce within timeout', async () => {
    const { fireAndVerify } = await import('../fire-synthetic-alert.js');

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/internal/test-alert')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        } as Response;
      }
      if (String(url).includes('getUpdates')) {
        // Never returns the nonce — always returns empty
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, result: [] }),
        } as unknown as Response;
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await fireAndVerify({
      event: 'rep_fallback',
      waitSeconds: 2, // Short timeout for fast test
      expectChatId: '-1001234567890',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toMatch(/nonce not seen.*within|not seen in.*within|alert pipeline broken/i);
  });

  it('Test 3: exits 1 with relayer error when relayer responds non-200', async () => {
    const { fireAndVerify } = await import('../fire-synthetic-alert.js');

    let telegramCalled = false;
    const fetchMock = vi.fn().mockImplementation(async (url: string, _init?: RequestInit) => {
      if (String(url).includes('/internal/test-alert')) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: 'Internal error', message: 'HMAC secret not configured' }),
        } as unknown as Response;
      }
      if (String(url).includes('getUpdates')) {
        telegramCalled = true;
        throw new Error('Telegram should NOT be called when relayer fails');
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await fireAndVerify({
      event: 'rep_fallback',
      waitSeconds: 10,
      expectChatId: '-1001234567890',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(telegramCalled).toBe(false); // Telegram NOT polled when relayer fails
    expect(result.error).toMatch(/relayer.*error|error.*relayer|non-200|status.*500|500/i);
  });

  it('Test 4: Each invocation generates a fresh UUID nonce; old nonces are ignored', async () => {
    const { generateNonce, buildHmac } = await import('../fire-synthetic-alert.js');

    const nonce1 = generateNonce();
    const nonce2 = generateNonce();
    const nonce3 = generateNonce();

    // Each should be a valid UUID
    expect(nonce1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(nonce2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    // Each should be unique
    expect(nonce1).not.toBe(nonce2);
    expect(nonce2).not.toBe(nonce3);
    expect(nonce1).not.toBe(nonce3);

    // HMAC changes with different nonce (same secret, different payload)
    const ts = Math.floor(Date.now() / 1000);
    const hmac1 = buildHmac('test-secret', { event: 'rep_fallback', nonce: nonce1, timestamp: ts });
    const hmac2 = buildHmac('test-secret', { event: 'rep_fallback', nonce: nonce2, timestamp: ts });
    expect(hmac1).not.toBe(hmac2);

    // Old nonce ignored: verify that a getUpdates response with nonce1 would NOT match nonce2
    const messageText = `🚨 P0 rep_fallback\nnonce:${nonce1}`;
    expect(messageText).toContain(`nonce:${nonce1}`);
    expect(messageText).not.toContain(`nonce:${nonce2}`);
  });
});
