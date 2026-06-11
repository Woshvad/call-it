/**
 * quick-260611-bf2 follow-up — relayerFetch header-merge regression pin.
 *
 * BUG 4 (live-diagnosed 2026-06-11): relayerFetch spread `...init` AFTER the
 * headers merge, so any caller passing custom headers (e.g. Authorization on
 * the authenticated POSTs: preflight, dup-check) clobbered Content-Type.
 * fetch() then sent the JSON string body as text/plain and the relayer's zod
 * rejected with root "Expected object, received string" — masking every other
 * publish fix. These tests pin: custom headers MERGE with (never replace)
 * Content-Type: application/json.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { postPreflight, type PreflightInput } from '../lib/relayer-client';

const PREFLIGHT_INPUT: PreflightInput = {
  marketType: 'priceTarget',
  eventSubtype: 'none',
  category: 'majors',
  assetA: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  targetValue: '8000000000000',
  expiry: 1781769407,
  stake: '5000000',
  conviction: 50,
  criteriaText: '',
  openToChallenges: true,
  callerAddress: '0x73047a882e0B88a1913A25bBe8d871aBad2c5CeD',
  callerSettledCalls: 0,
};

describe('relayerFetch header merge (BUG 4 regression)', () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    fetchSpy.mockReset();
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ ok: true, hash: '0x0', settledCalls: 0, suggestedConviction: 50, criteriaHash: '0x0' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps Content-Type: application/json when Authorization is passed', async () => {
    await postPreflight(PREFLIGHT_INPUT, 'test-privy-token');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Authorization']).toBe('Bearer test-privy-token');
  });

  it('keeps Content-Type when no custom headers are passed', async () => {
    await postPreflight(PREFLIGHT_INPUT);
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('still sends the JSON body and method through unchanged', async () => {
    await postPreflight(PREFLIGHT_INPUT, 'tok');
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe('POST');
    const parsed = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(parsed['marketType']).toBe('priceTarget');
    expect(parsed['assetA']).toBe(PREFLIGHT_INPUT.assetA);
  });
});
