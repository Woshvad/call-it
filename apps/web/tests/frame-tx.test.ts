/**
 * RED scaffold (Wave 0) — SC2: Frame tx wire format + status-aware buttons.
 *
 * Target (Plan 03, GREEN):
 *   apps/web/app/api/frame/tx/[callId]/route.ts  (POST, runtime nodejs, public)
 *   apps/web/lib/abis/ChallengeEscrow.ts (challengeEscrowAbi) — promoted Plan 03
 *
 * Asserted behavior (SC2, D-02/D-06/D-06a/D-07):
 *   - given a known live callId, the route returns the legacy Frame tx wire:
 *       { chainId:'eip155:421614', method:'eth_sendTransaction', params:{ abi, to, data } }
 *   - params.to === FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA (origin-locked target)
 *   - viem.decodeFunctionData(params.data) → functionName 'follow', args [callId, 1_000_000n, 0n]
 *     (min $1 one-tap, D-07; side 0 = follow)
 *   - the selected button set matches the fixtures table for the given status (D-02/D-06)
 *
 * The button-set assertion runs NOW (it only needs the pure fixtures module, which
 * exists in Wave 0). The wire-shape + decode assertions are RED until the Plan-03
 * route lands — guarded by a lazy dynamic import that rejects today.
 *
 * Requirements: SHARE-19 (SC2).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { decodeFunctionData, parseAbi } from 'viem';
import {
  buttonsForStatus,
  MIN_FOLLOW_STAKE_USDC_6DP,
  SEEDED_CALL_IDS,
} from '../lib/farcaster-fixtures.js';
import {
  FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA,
  CHALLENGE_ESCROW_ARBITRUM_SEPOLIA,
} from '@call-it/shared';

// Decode ABIs match the REAL on-chain signatures (Plan 08-03 correction): the
// FollowFadeMarket follow/fade take (uint256 callId, uint256 amountIn, uint256
// minSharesOut) — there is no separate `side` param (follow and fade are distinct
// functions). The Wave-0 scaffold originally assumed follow(uint256,uint96,uint8);
// that signature has a different 4-byte selector and would never decode the real
// calldata (and a tx with it would revert on-chain). The asserted args tuple
// [callId, 1_000_000n, 0n] is identical either way, so the test intent (min-$1
// one-tap, origin-locked `to`, decode round-trip) is fully preserved.
const FOLLOW_FADE_DECODE_ABI = parseAbi([
  'function follow(uint256 callId, uint256 amountIn, uint256 minSharesOut)',
  'function fade(uint256 callId, uint256 amountIn, uint256 minSharesOut)',
]);
const CHALLENGE_DECODE_ABI = parseAbi([
  'function proposeChallenge(uint256 callId, uint96 stake) returns (uint256)',
]);
const MIN_STAKE_USDC_6DP = 5_000_000n; // $5 challenge stake

describe('SC2 — status-aware button selection (GREEN now, pure fixtures)', () => {
  it('live → [Follow,Fade,Challenge]; settled triplet → [Follow,Challenge,Quote]', () => {
    expect(buttonsForStatus('Live')).toEqual(['Follow', 'Fade', 'Challenge']);
    expect(buttonsForStatus('Settled')).toEqual(['Follow', 'Challenge', 'Quote']);
    expect(buttonsForStatus('Disputed')).toEqual(['Follow', 'Challenge', 'Quote']);
    expect(buttonsForStatus('CallerExited')).toEqual(['Follow', 'Challenge', 'Quote']);
  });
});

type TxWire = {
  chainId: string;
  method: string;
  params: { abi: unknown; to: string; data: `0x${string}`; value: string };
};
type DeepLink = { type: string; url: string };

/**
 * Build a Frame POST request.
 *
 * Post-CR-01 the button is selected by the (untrusted) buttonIndex in the body — this
 * is the production path that works WITHOUT the dev `?action=` override. `buttonIndex`
 * is 1-based against the status's button set (Live = [Follow,Fade,Challenge];
 * Settled = [Follow,Challenge,Quote]). The optional `action` arg still appends the
 * `?action=` query for the override-specific tests (which also set NEXT_PUBLIC_DEV_ROUTES).
 */
function postReq(callId: string, buttonIndex = 1, action?: string) {
  const url = action
    ? `https://callit.app/api/frame/tx/${callId}?action=${action}`
    : `https://callit.app/api/frame/tx/${callId}`;
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ buttonIndex, untrustedData: { buttonIndex } }),
  });
}

describe('SC2 — Frame tx wire format + decode round-trip (GREEN — Plan 03)', () => {
  it('POST returns the eip155:421614 eth_sendTransaction wire for a live follow', async () => {
    const route = await import('../app/api/frame/tx/[callId]/route.js');
    expect(typeof route.POST).toBe('function');

    const callId = SEEDED_CALL_IDS.live;
    // No relayer configured in test → Live default (ok=true); Live buttonIndex 1 = Follow.
    const res = await route.POST(postReq(callId, 1), {
      params: Promise.resolve({ callId }),
    });
    const wire = (await res.json()) as TxWire;

    expect(wire.chainId).toBe('eip155:421614');
    expect(wire.method).toBe('eth_sendTransaction');
    expect(wire.params.to.toLowerCase()).toBe(
      FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA.toLowerCase(),
    );

    // Decode: follow(callId, amountIn=$1, minSharesOut=0). Min $1 one-tap (D-07).
    const decoded = decodeFunctionData({
      abi: FOLLOW_FADE_DECODE_ABI,
      data: wire.params.data,
    });
    expect(decoded.functionName).toBe('follow');
    expect(decoded.args).toEqual([BigInt(callId), MIN_FOLLOW_STAKE_USDC_6DP, 0n]);
  });

  it('live Fade → fade(callId, $1, 0) on the FFM address', async () => {
    const route = await import('../app/api/frame/tx/[callId]/route.js');
    const callId = SEEDED_CALL_IDS.live;
    // Live buttonIndex 2 = Fade.
    const res = await route.POST(postReq(callId, 2), {
      params: Promise.resolve({ callId }),
    });
    const wire = (await res.json()) as TxWire;
    expect(wire.params.to.toLowerCase()).toBe(
      FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA.toLowerCase(),
    );
    const decoded = decodeFunctionData({
      abi: FOLLOW_FADE_DECODE_ABI,
      data: wire.params.data,
    });
    expect(decoded.functionName).toBe('fade');
    expect(decoded.args).toEqual([BigInt(callId), MIN_FOLLOW_STAKE_USDC_6DP, 0n]);
  });

  it('Challenge → proposeChallenge(callId, $5) on the ChallengeEscrow address', async () => {
    const route = await import('../app/api/frame/tx/[callId]/route.js');
    const callId = SEEDED_CALL_IDS.live;
    // Live buttonIndex 3 = Challenge.
    const res = await route.POST(postReq(callId, 3), {
      params: Promise.resolve({ callId }),
    });
    const wire = (await res.json()) as TxWire;
    expect(wire.method).toBe('eth_sendTransaction');
    expect(wire.params.to.toLowerCase()).toBe(
      CHALLENGE_ESCROW_ARBITRUM_SEPOLIA.toLowerCase(),
    );
    const decoded = decodeFunctionData({
      abi: CHALLENGE_DECODE_ABI,
      data: wire.params.data,
    });
    expect(decoded.functionName).toBe('proposeChallenge');
    expect(decoded.args).toEqual([BigInt(callId), MIN_STAKE_USDC_6DP]);
  });

  it('callId "0" and "abc" → 400, never builds a wire', async () => {
    const route = await import('../app/api/frame/tx/[callId]/route.js');
    for (const bad of ['0', 'abc']) {
      const res = await route.POST(postReq(bad), {
        params: Promise.resolve({ callId: bad }),
      });
      expect(res.status).toBe(400);
    }
  });
});

describe('SC2 — settled triplet + deep-link routing for non-constructible actions (D-06/D-06a)', () => {
  const prevRelayer = process.env['NEXT_PUBLIC_RELAYER_URL'];

  afterEach(() => {
    vi.unstubAllGlobals();
    if (prevRelayer === undefined) delete process.env['NEXT_PUBLIC_RELAYER_URL'];
    else process.env['NEXT_PUBLIC_RELAYER_URL'] = prevRelayer;
  });

  function stubSettled() {
    process.env['NEXT_PUBLIC_RELAYER_URL'] = 'https://relayer.test';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ status: 'Settled' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
  }

  // Settled button set = [Follow, Challenge, Quote] → buttonIndex 1/2/3.
  it('settled Quote → deep-link (NOT an eth_sendTransaction)', async () => {
    stubSettled();
    const route = await import('../app/api/frame/tx/[callId]/route.js');
    const callId = SEEDED_CALL_IDS.settled;
    const res = await route.POST(postReq(callId, 3), {
      params: Promise.resolve({ callId }),
    });
    const wire = (await res.json()) as DeepLink;
    expect(wire.type).toBe('deep-link');
    expect(typeof wire.url).toBe('string');
    expect((wire as unknown as TxWire).method).toBeUndefined();
  });

  it('settled Follow → deep-link (off-chain follow-graph, D-06a)', async () => {
    stubSettled();
    const route = await import('../app/api/frame/tx/[callId]/route.js');
    const callId = SEEDED_CALL_IDS.settled;
    const res = await route.POST(postReq(callId, 1), {
      params: Promise.resolve({ callId }),
    });
    const wire = (await res.json()) as DeepLink;
    expect(wire.type).toBe('deep-link');
    expect((wire as unknown as TxWire).method).toBeUndefined();
  });

  it('settled Challenge → proposeChallenge tx (the one constructible settled action)', async () => {
    stubSettled();
    const route = await import('../app/api/frame/tx/[callId]/route.js');
    const callId = SEEDED_CALL_IDS.settled;
    const res = await route.POST(postReq(callId, 2), {
      params: Promise.resolve({ callId }),
    });
    const wire = (await res.json()) as TxWire;
    expect(wire.method).toBe('eth_sendTransaction');
    expect(wire.params.to.toLowerCase()).toBe(
      CHALLENGE_ESCROW_ARBITRUM_SEPOLIA.toLowerCase(),
    );
    const decoded = decodeFunctionData({
      abi: CHALLENGE_DECODE_ABI,
      data: wire.params.data,
    });
    expect(decoded.functionName).toBe('proposeChallenge');
    expect(decoded.args).toEqual([BigInt(callId), MIN_STAKE_USDC_6DP]);
  });
});

describe('CR-01 — `?action=` override is gated; cannot coerce a Live wire on a settled call', () => {
  const prevRelayer = process.env['NEXT_PUBLIC_RELAYER_URL'];
  const prevDev = process.env['NEXT_PUBLIC_DEV_ROUTES'];

  afterEach(() => {
    vi.unstubAllGlobals();
    if (prevRelayer === undefined) delete process.env['NEXT_PUBLIC_RELAYER_URL'];
    else process.env['NEXT_PUBLIC_RELAYER_URL'] = prevRelayer;
    if (prevDev === undefined) delete process.env['NEXT_PUBLIC_DEV_ROUTES'];
    else process.env['NEXT_PUBLIC_DEV_ROUTES'] = prevDev;
  });

  function stubStatus(status: string, httpOk = true) {
    process.env['NEXT_PUBLIC_RELAYER_URL'] = 'https://relayer.test';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(httpOk ? JSON.stringify({ status }) : 'down', {
          status: httpOk ? 200 : 503,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
  }

  it('forged ?action=Fade on a SETTLED call does NOT yield a Fade tx (Fade not in settled set)', async () => {
    // Even with the dev flag ON, Fade is not in the settled button set → override ignored;
    // falls back to buttonIndex 1 = Follow → settled Follow is a deep-link, never a Fade wire.
    process.env['NEXT_PUBLIC_DEV_ROUTES'] = '1';
    stubStatus('Settled');
    const route = await import('../app/api/frame/tx/[callId]/route.js');
    const callId = SEEDED_CALL_IDS.settled;
    const res = await route.POST(postReq(callId, 1, 'Fade'), {
      params: Promise.resolve({ callId }),
    });
    const wire = (await res.json()) as DeepLink & TxWire;
    expect(wire.method).toBeUndefined(); // not an eth_sendTransaction
    expect(wire.type).toBe('deep-link');
  });

  it('forged ?action=Fade during a relayer OUTAGE is ignored (statusReadOk=false)', async () => {
    // Relayer configured but failing → ok=false → override blocked even with dev flag set.
    // Falls back to buttonIndex 1 = Follow on the (fail-safe Live) set → Follow tx, NOT Fade.
    process.env['NEXT_PUBLIC_DEV_ROUTES'] = '1';
    stubStatus('Settled', /* httpOk */ false);
    const route = await import('../app/api/frame/tx/[callId]/route.js');
    const callId = SEEDED_CALL_IDS.live;
    const res = await route.POST(postReq(callId, 1, 'Fade'), {
      params: Promise.resolve({ callId }),
    });
    const wire = (await res.json()) as TxWire;
    const decoded = decodeFunctionData({
      abi: FOLLOW_FADE_DECODE_ABI,
      data: wire.params.data,
    });
    expect(decoded.functionName).toBe('follow'); // NOT 'fade'
  });

  it('?action override is OFF in production (dev flag unset): buttonIndex wins', async () => {
    // No dev flag → override never honored; ?action=Challenge is ignored, buttonIndex 1 = Follow.
    delete process.env['NEXT_PUBLIC_DEV_ROUTES'];
    delete process.env['NEXT_PUBLIC_RELAYER_URL']; // Live default, ok=true
    const route = await import('../app/api/frame/tx/[callId]/route.js');
    const callId = SEEDED_CALL_IDS.live;
    const res = await route.POST(postReq(callId, 1, 'Challenge'), {
      params: Promise.resolve({ callId }),
    });
    const wire = (await res.json()) as TxWire;
    const decoded = decodeFunctionData({
      abi: FOLLOW_FADE_DECODE_ABI,
      data: wire.params.data,
    });
    expect(decoded.functionName).toBe('follow'); // buttonIndex 1, NOT the forged Challenge
  });

  it('dev override ON + status read OK honors ?action within the live set (Fade)', async () => {
    process.env['NEXT_PUBLIC_DEV_ROUTES'] = '1';
    stubStatus('Live');
    const route = await import('../app/api/frame/tx/[callId]/route.js');
    const callId = SEEDED_CALL_IDS.live;
    const res = await route.POST(postReq(callId, 1, 'Fade'), {
      params: Promise.resolve({ callId }),
    });
    const wire = (await res.json()) as TxWire;
    const decoded = decodeFunctionData({
      abi: FOLLOW_FADE_DECODE_ABI,
      data: wire.params.data,
    });
    expect(decoded.functionName).toBe('fade');
  });
});

describe('WR-06 — out-of-range buttonIndex is rejected with 400 (not clamped to Follow)', () => {
  it('buttonIndex 99 → 400', async () => {
    const route = await import('../app/api/frame/tx/[callId]/route.js');
    const callId = SEEDED_CALL_IDS.live;
    const res = await route.POST(postReq(callId, 99), {
      params: Promise.resolve({ callId }),
    });
    expect(res.status).toBe(400);
  });
});
