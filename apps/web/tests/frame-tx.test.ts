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

import { describe, it, expect } from 'vitest';
import { decodeFunctionData, parseAbi } from 'viem';
import {
  buttonsForStatus,
  MIN_FOLLOW_STAKE_USDC_6DP,
  SEEDED_CALL_IDS,
} from '../lib/farcaster-fixtures.js';
import { FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA } from '@call-it/shared';

describe('SC2 — status-aware button selection (GREEN now, pure fixtures)', () => {
  it('live → [Follow,Fade,Challenge]; settled triplet → [Follow,Challenge,Quote]', () => {
    expect(buttonsForStatus('Live')).toEqual(['Follow', 'Fade', 'Challenge']);
    expect(buttonsForStatus('Settled')).toEqual(['Follow', 'Challenge', 'Quote']);
    expect(buttonsForStatus('Disputed')).toEqual(['Follow', 'Challenge', 'Quote']);
    expect(buttonsForStatus('CallerExited')).toEqual(['Follow', 'Challenge', 'Quote']);
  });
});

describe('SC2 — Frame tx wire format + decode round-trip (RED until Plan 03)', () => {
  it('POST returns the eip155:421614 eth_sendTransaction wire for a live follow', async () => {
    const route = await import('../app/api/frame/tx/[callId]/route.js');
    expect(typeof route.POST).toBe('function');

    const callId = SEEDED_CALL_IDS.live;
    const req = new Request(`https://callit.app/api/frame/tx/${callId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ buttonIndex: 1, untrustedData: { buttonIndex: 1 } }),
    });
    const res = await route.POST(req, { params: Promise.resolve({ callId }) });
    const wire = (await res.json()) as {
      chainId: string;
      method: string;
      params: { abi: unknown; to: string; data: `0x${string}` };
    };

    expect(wire.chainId).toBe('eip155:421614');
    expect(wire.method).toBe('eth_sendTransaction');
    expect(wire.params.to.toLowerCase()).toBe(FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA.toLowerCase());

    // Decode the calldata: follow(callId, amount, side). Min $1 one-tap (D-07), side 0.
    const followAbi = parseAbi(['function follow(uint256 callId, uint96 amount, uint8 side)']);
    const decoded = decodeFunctionData({ abi: followAbi, data: wire.params.data });
    expect(decoded.functionName).toBe('follow');
    expect(decoded.args).toEqual([BigInt(callId), MIN_FOLLOW_STAKE_USDC_6DP, 0n]);
  });
});
