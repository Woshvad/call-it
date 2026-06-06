/**
 * fire-synthetic-alert.test.ts — unit tests for scripts/fire-synthetic-alert.ts
 *
 * The CI helper verifies the Telegram alert pipeline via the relayer's SEND-CONFIRMATION
 * response (HTTP 200 { ok, nonce, delivered }) — it does NOT poll Telegram getUpdates
 * (a bot cannot read its own outgoing DM that way). All tests mock fetch; no real relayer
 * and no real Telegram calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('fire-synthetic-alert — relayer send-confirmation', () => {
  beforeEach(() => {
    process.env.RELAYER_URL = 'http://localhost:8080';
    process.env.RELAYER_INTERNAL_HMAC_SECRET = 'test-hmac-secret-32bytes-exactly!!!';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.RELAYER_URL;
    delete process.env.RELAYER_INTERNAL_HMAC_SECRET;
  });

  /**
   * Build a fetch mock for the relayer POST that echoes the posted nonce back into the
   * response body (the relayer echoes the nonce it received). Throws if anything other
   * than the relayer endpoint is called — the CI must NOT call Telegram.
   */
  function relayerMock(
    make: (nonce: string) => { ok: boolean; status: number; body: Record<string, unknown> },
  ) {
    return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (!String(url).includes('/internal/test-alert')) {
        throw new Error(`Unexpected URL — CI must only call the relayer, not: ${url}`);
      }
      const reqBody = JSON.parse((init?.body as string) ?? '{}');
      const { ok, status, body } = make(reqBody.nonce as string);
      return { ok, status, json: async () => body } as unknown as Response;
    });
  }

  it('exits 0 when relayer 200 { ok, nonce, delivered:true }', async () => {
    const { fireAndVerify } = await import('../fire-synthetic-alert.js');
    const fetchMock = relayerMock((nonce) => ({
      ok: true,
      status: 200,
      body: { ok: true, event: 'rep_fallback', nonce, delivered: true },
    }));

    const result = await fireAndVerify({
      event: 'rep_fallback',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.nonce).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the relayer POST — no Telegram poll
  });

  it('exits 0 (tolerant) when relayer 200 { ok, nonce } omits the delivered flag', async () => {
    const { fireAndVerify } = await import('../fire-synthetic-alert.js');
    const fetchMock = relayerMock((nonce) => ({
      ok: true,
      status: 200,
      body: { ok: true, event: 'rep_fallback', nonce }, // no `delivered` — pre-redeploy relayer
    }));

    const result = await fireAndVerify({
      event: 'rep_fallback',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it('exits 1 when relayer 200 but the nonce is missing/mismatched', async () => {
    const { fireAndVerify } = await import('../fire-synthetic-alert.js');
    const fetchMock = relayerMock(() => ({ ok: true, status: 200, body: { ok: true } })); // no nonce echoed

    const result = await fireAndVerify({
      event: 'rep_fallback',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toMatch(/nonceMatch=false|send not confirmed|not verified/i);
  });

  it('exits 1 when relayer 200 but delivered:false', async () => {
    const { fireAndVerify } = await import('../fire-synthetic-alert.js');
    const fetchMock = relayerMock((nonce) => ({
      ok: true,
      status: 200,
      body: { ok: true, nonce, delivered: false },
    }));

    const result = await fireAndVerify({
      event: 'rep_fallback',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toMatch(/delivered=false|send not confirmed/i);
  });

  it('exits 1 when relayer responds non-200, without any second (Telegram) call', async () => {
    const { fireAndVerify } = await import('../fire-synthetic-alert.js');
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('/internal/test-alert')) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: 'Internal error', message: 'HMAC secret not configured' }),
        } as unknown as Response;
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const result = await fireAndVerify({
      event: 'rep_fallback',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no getUpdates poll
    expect(result.error).toMatch(/non-200|status.*500|500/i);
  });

  it('generateNonce returns unique v4 UUIDs and buildHmac is nonce-sensitive', async () => {
    const { generateNonce, buildHmac } = await import('../fire-synthetic-alert.js');

    const nonce1 = generateNonce();
    const nonce2 = generateNonce();
    const nonce3 = generateNonce();

    expect(nonce1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(nonce2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(nonce1).not.toBe(nonce2);
    expect(nonce2).not.toBe(nonce3);
    expect(nonce1).not.toBe(nonce3);

    const ts = Math.floor(Date.now() / 1000);
    const hmac1 = buildHmac('test-secret', { event: 'rep_fallback', nonce: nonce1, timestamp: ts });
    const hmac2 = buildHmac('test-secret', { event: 'rep_fallback', nonce: nonce2, timestamp: ts });
    expect(hmac1).not.toBe(hmac2);
  });
});
