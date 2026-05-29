/**
 * SHARE-04: Live OG card variant 1 — GET /og/[callId]
 *
 * §16.2 Live State Card layout:
 *   - Top left: CALL IT wordmark (Syne 48px, #E8F542)
 *   - Top right: "ARB" label (JetBrainsMono 12px)
 *   - Center hero: call statement (Syne 48px, #F1F5F9)
 *   - Below statement: "by @{handle} · {conviction}% conviction · stake ${stake}"
 *   - LIVE badge top-left in hero row (#E8F542)
 *   - Follow/Fade progress bar: #E8F542 (follow%) / #2A2A30 (fade%)
 *   - Labels: "X% Following   Y% Fading"
 *   - Footer: "$X staked · X% conviction · {timeLeft} left"
 *   - Corner bracket motif (all four corners)
 *
 * Runtime: 'nodejs' — CRITICAL. NOT 'edge'. resvg-wasm bundling fails on edge runtime.
 * Source: CLAUDE.md "Pinned Addresses", §16.2 binding design contract
 * Security:
 *   - T-02-09-01: statusVersion bump via ?v= param forces CDN cache-miss
 *   - T-02-09-02: export const runtime = 'nodejs' enforced; no display:grid
 *   - D-04: runtime = 'nodejs', NOT 'edge'
 *   - Pitfall 15: ALL layout uses display:flex — Satori does NOT support display:grid
 *   - SHARE-10: On any RPC/lookup failure, fall through to renderFallback
 */

export const runtime = 'nodejs';

import { type NextRequest } from 'next/server';
import { createElement as h, type ReactElement } from 'react';
import { ImageResponse } from '@vercel/og';
import { createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { renderFallback } from '@/lib/og-fallback-render';
import { syneBold, spaceGrotesk, jetBrainsMono } from '@/lib/og-fonts';
import {
  FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA,
  CALL_REGISTRY_ARBITRUM_SEPOLIA,
} from '@call-it/shared';
import { followFadeMarketAbi } from '@/lib/abis/FollowFadeMarket';

// ── Minimal CallRegistry getCall ABI ──────────────────────────────────────────
// getCall is not in the main ABI stub (stub captures Plan 08 surface only).
// Inline minimal ABI here for the OG server-side read path.
const callRegistryGetCallAbi = [
  {
    type: 'function',
    name: 'getCall',
    inputs: [{ name: 'callId', type: 'uint256', internalType: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct ICallRegistry.Call',
        components: [
          { name: 'caller', type: 'address', internalType: 'address' },
          { name: 'stake', type: 'uint96', internalType: 'uint96' },
          { name: 'virtualFadeSeed', type: 'uint96', internalType: 'uint96' },
          { name: 'createdAt', type: 'uint64', internalType: 'uint64' },
          { name: 'expiry', type: 'uint64', internalType: 'uint64' },
          { name: 'marketType', type: 'uint8', internalType: 'enum ICallRegistry.MarketType' },
          { name: 'eventSubtype', type: 'uint8', internalType: 'enum ICallRegistry.EventSubtype' },
          { name: 'category', type: 'uint8', internalType: 'enum ICallRegistry.Category' },
          { name: 'status', type: 'uint8', internalType: 'enum ICallRegistry.CallStatus' },
          { name: 'conviction', type: 'uint8', internalType: 'uint8' },
          { name: 'openToChallenges', type: 'bool', internalType: 'bool' },
          { name: 'callerExitedAt', type: 'uint64', internalType: 'uint64' },
          { name: 'outcome', type: 'uint8', internalType: 'enum ICallRegistry.Outcome' },
          { name: 'duplicateHash', type: 'bytes32', internalType: 'bytes32' },
          { name: 'criteriaHash', type: 'bytes32', internalType: 'bytes32' },
          { name: 'assetA', type: 'uint256', internalType: 'uint256' },
          { name: 'assetB', type: 'uint256', internalType: 'uint256' },
          { name: 'targetValue', type: 'uint256', internalType: 'uint256' },
          { name: 'parentCallId', type: 'uint256', internalType: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
] as const;

// ── Server-side viem public client (NOT wagmi — server route only) ─────────────
// Using Arbitrum Sepolia RPC for staging; RPC key is server-side only (T-02-09-01).
// FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA is 0x000...000 until Phase 2 deploy lands.
// All FFM reads will revert/return 0 from the zero address → caught by try/catch → renderFallback.
const publicClient = createPublicClient({
  chain: arbitrumSepolia,
  transport: http(process.env['ARBITRUM_SEPOLIA_RPC_URL'] ?? 'https://sepolia-rollup.arbitrum.io/rpc'),
});

// ── Time formatting ────────────────────────────────────────────────────────────

/** Format seconds remaining into "Xd Yh", "Yh Zm", or "< 1h" */
function formatTimeLeft(secondsLeft: number): string {
  if (secondsLeft <= 0) return 'Expired';
  if (secondsLeft < 3600) return '< 1h';
  const days = Math.floor(secondsLeft / 86400);
  const hours = Math.floor((secondsLeft % 86400) / 3600);
  const mins = Math.floor((secondsLeft % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h ${mins}m`;
}

/** Format USDC amount (6 decimals) as "$X" */
function formatUsdc(raw: bigint): string {
  const whole = Number(raw) / 1_000_000;
  return `$${whole.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ── Corner bracket renderer ────────────────────────────────────────────────────

type CornerPos = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

function cornerBracket(pos: CornerPos): ReactElement {
  const yellow = '#E8F542';
  const base = { position: 'absolute' as const, width: 24, height: 24, display: 'flex' as const };
  const styles: Record<CornerPos, Record<string, unknown>> = {
    topLeft:     { ...base, top: 16, left: 16,   borderTop: `4px solid ${yellow}`, borderLeft:  `4px solid ${yellow}` },
    topRight:    { ...base, top: 16, right: 16,  borderTop: `4px solid ${yellow}`, borderRight: `4px solid ${yellow}` },
    bottomLeft:  { ...base, bottom: 16, left: 16,  borderBottom: `4px solid ${yellow}`, borderLeft:  `4px solid ${yellow}` },
    bottomRight: { ...base, bottom: 16, right: 16, borderBottom: `4px solid ${yellow}`, borderRight: `4px solid ${yellow}` },
  };
  return h('div', { key: pos, style: styles[pos] });
}

// ── Live card JSX builder ──────────────────────────────────────────────────────
// ALL layout uses display:flex — Satori does NOT support display:grid (Pitfall 15).

interface LiveCardProps {
  callStatement: string;
  handle: string;
  conviction: number;
  stakeRaw: bigint;
  followPct: number;
  fadePct: number;
  timeLeft: string;
  footerBrand: string;
}

function buildLiveCard(props: LiveCardProps): ReactElement {
  const { callStatement, handle, conviction, stakeRaw, followPct, fadePct, timeLeft, footerBrand } = props;
  const stakeStr = formatUsdc(stakeRaw);
  // Progress bar widths as integer percentages, minimum 2% for visibility
  const followWidth = Math.max(followPct, 2);
  const fadeWidth = Math.max(fadePct, 2);

  return h(
    'div',
    {
      style: {
        width: '1200px',
        height: '630px',
        background: '#09090E',
        display: 'flex',           // PITFALL 15: flexbox only — Satori does not support display:grid
        flexDirection: 'column',
        position: 'relative',
        border: '3px solid #E8F542',
      },
    },
    // Corner bracket motif (§16.2)
    cornerBracket('topLeft'),
    cornerBracket('topRight'),
    cornerBracket('bottomLeft'),
    cornerBracket('bottomRight'),

    // ── Top row: CALL IT wordmark + ARB label ──────────────────────────────
    h(
      'div',
      {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '32px 56px 0 56px',
        },
      },
      h('div', {
        style: { fontFamily: 'Syne', fontSize: 40, color: '#E8F542', fontWeight: 700, display: 'flex' },
      }, 'CALL IT'),
      // LIVE badge top-right
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          },
        },
        h('div', {
          style: {
            fontFamily: 'SpaceGrotesk',
            fontSize: 13,
            color: '#E8F542',
            background: 'rgba(232,245,66,0.12)',
            border: '2px solid #E8F542',
            padding: '4px 10px',
            display: 'flex',
            fontWeight: 700,
            letterSpacing: 2,
          },
        }, 'LIVE'),
        h('div', {
          style: { fontFamily: 'JetBrainsMono', fontSize: 12, color: '#94A3B8', display: 'flex' },
        }, '⬢ ARB'),
      ),
    ),

    // ── Caller line: @handle · repScore ───────────────────────────────────
    h(
      'div',
      {
        style: {
          display: 'flex',
          padding: '16px 56px 0 56px',
        },
      },
      h('div', {
        style: { fontFamily: 'SpaceGrotesk', fontSize: 20, color: '#94A3B8', display: 'flex' },
      }, `@${handle} · ${conviction}% conviction · ${stakeStr} staked`),
    ),

    // ── Call statement hero ────────────────────────────────────────────────
    h(
      'div',
      {
        style: {
          display: 'flex',
          padding: '24px 56px 0 56px',
          flex: 1,
          alignItems: 'flex-start',
        },
      },
      h('div', {
        style: {
          fontFamily: 'Syne',
          fontSize: 52,
          fontWeight: 700,
          color: '#F1F5F9',
          display: 'flex',
          lineHeight: 1.1,
          // Clamp to 2 lines visually via max characters
          maxWidth: '1000px',
        },
      }, callStatement.length > 80 ? callStatement.slice(0, 77) + '…' : callStatement),
    ),

    // ── Progress bar section ───────────────────────────────────────────────
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          padding: '0 56px',
          gap: 8,
        },
      },
      // Bar: follow (yellow-green) | fade (dark)
      h(
        'div',
        {
          style: {
            display: 'flex',
            height: 20,
            borderRadius: 2,
            overflow: 'hidden',
            border: '1px solid #2A2A30',
          },
        },
        h('div', {
          style: {
            display: 'flex',
            width: `${followWidth}%`,
            background: '#E8F542',
            height: '100%',
          },
        }),
        h('div', {
          style: {
            display: 'flex',
            width: `${fadeWidth}%`,
            background: '#2A2A30',
            height: '100%',
          },
        }),
      ),
      // Labels row
      h(
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
          },
        },
        h('div', {
          style: { fontFamily: 'SpaceGrotesk', fontSize: 16, color: '#E8F542', display: 'flex', fontWeight: 700 },
        }, `${followPct}% Following`),
        h('div', {
          style: { fontFamily: 'SpaceGrotesk', fontSize: 16, color: '#94A3B8', display: 'flex' },
        }, `${fadePct}% Fading`),
      ),
    ),

    // ── Footer: time left + brand ──────────────────────────────────────────
    h(
      'div',
      {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 56px 32px 56px',
        },
      },
      h('div', {
        style: { fontFamily: 'JetBrainsMono', fontSize: 14, color: '#94A3B8', display: 'flex' },
      }, `Time left: ${timeLeft}`),
      h('div', {
        style: { fontFamily: 'SpaceGrotesk', fontSize: 12, color: '#94A3B8', display: 'flex' },
      }, footerBrand),
    ),
  );
}

// ── GET handler ────────────────────────────────────────────────────────────────

/**
 * GET /og/[callId]?v={statusVersion}&handle={hint}
 *
 * Phase 2: Reads live state from CallRegistry + FollowFadeMarket via viem.
 * Falls through to renderFallback on any RPC failure or call-not-found (SHARE-10).
 *
 * D-09: ?v= param provides CDN cache-bust when statusVersion changes.
 * Cache-Control: max-age=60, stale-while-revalidate=300 (D-09: re-served within 60s).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ callId: string }> }
) {
  const { callId: callIdStr } = await params;

  // Parse query params
  const url = new URL(req.url);
  // ?v= is the CDN cache-bust version (D-09); value is read by CDN — not used server-side.
  void url.searchParams.get('v');
  const handleHint = (url.searchParams.get('handle') ?? '').slice(0, 32);

  // D-12: footer brand from env-var
  const footerBrand = process.env['NEXT_PUBLIC_BRAND_FOOTER'] ?? 'callitapp.xyz · Be right in public.';

  let callId: bigint;
  try {
    callId = BigInt(callIdStr);
    if (callId === 0n) throw new Error('callId 0 is burned');
  } catch {
    // Invalid callId → fallback (SHARE-10)
    const resp = renderFallback({ handle: handleHint || 'someone', footerBrand });
    resp.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    resp.headers.set('X-Variant', 'live-fallback');
    resp.headers.set('X-Reason', 'invalid-call-id');
    return resp;
  }

  try {
    // ── WR-09: short-circuit the known-zero FFM placeholder ──────────────────
    // FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA is 0x000..000 until the deferred Phase 2
    // deploy. Reading reserves against the zero address is a guaranteed-useless RPC
    // round trip that previously also relied on a revert to trip the catch→fallback
    // path. Skip those two reads entirely and treat reserves as empty (50/50 bar);
    // the deployed CallRegistry.getCall still runs for real call metadata.
    const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
    const ffmDeployed =
      (FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA as string).toLowerCase() !== ZERO_ADDRESS;

    const callDataPromise = publicClient.readContract({
      address: CALL_REGISTRY_ARBITRUM_SEPOLIA as `0x${string}`,
      abi: callRegistryGetCallAbi,
      functionName: 'getCall',
      args: [callId],
    });

    let callData: Awaited<typeof callDataPromise>;
    let followReserve = 0n;
    let fadeReserve = 0n;

    if (ffmDeployed) {
      const [cd, followReserveRaw, fadeReserveRaw] = await Promise.all([
        callDataPromise,
        publicClient.readContract({
          address: FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA as `0x${string}`,
          abi: followFadeMarketAbi,
          functionName: 'followReserve',
          args: [callId],
        }),
        publicClient.readContract({
          address: FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA as `0x${string}`,
          abi: followFadeMarketAbi,
          functionName: 'fadeReserve',
          args: [callId],
        }),
      ]);
      callData = cd;
      followReserve = followReserveRaw as bigint;
      fadeReserve = fadeReserveRaw as bigint;
    } else {
      // Deferred FFM deploy — only the CallRegistry read is meaningful.
      callData = await callDataPromise;
    }

    // ── Guard: call not found (zero caller address = burned slot 0 or uninitialized) ──
    if (!callData.caller || callData.caller === '0x0000000000000000000000000000000000000000') {
      throw new Error('call-not-found');
    }

    // ── Compute follow%/fade% ───────────────────────────────────────────────
    let followPct = 50;
    let fadePct = 50;
    const totalReserve = followReserve + fadeReserve;
    if (totalReserve > 0n) {
      followPct = Math.round(Number((followReserve * 100n) / totalReserve));
      fadePct = 100 - followPct;
    }

    // ── Time left ──────────────────────────────────────────────────────────
    const nowSec = Math.floor(Date.now() / 1000);
    const expirySec = Number(callData.expiry);
    const secondsLeft = expirySec - nowSec;
    const timeLeft = formatTimeLeft(secondsLeft);

    // ── Build card data ────────────────────────────────────────────────────
    // callStatement: use handle hint or fallback label since we don't have the
    // market line in on-chain data (stored in IPFS/subgraph). Use a minimal representation.
    // The handle hint from og:image URL is the caller's handle.
    const handle = handleHint || `0x${callData.caller.slice(2, 8)}`;
    const conviction = Number(callData.conviction);
    const stakeRaw = BigInt(callData.stake);

    // Market statement: not available from on-chain data alone (no string field in Call struct).
    // Use a representative placeholder; Phase 7 will wire the full subgraph lookup.
    const callStatement = `Call #${callIdStr}`;

    const cardJsx = buildLiveCard({
      callStatement,
      handle,
      conviction,
      stakeRaw,
      followPct,
      fadePct,
      timeLeft,
      footerBrand,
    });

    const imageResponse = new ImageResponse(cardJsx, {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Syne', data: syneBold, style: 'normal', weight: 700 },
        { name: 'SpaceGrotesk', data: spaceGrotesk, style: 'normal', weight: 400 },
        { name: 'JetBrainsMono', data: jetBrainsMono, style: 'normal', weight: 400 },
      ],
    });

    imageResponse.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    imageResponse.headers.set('X-Variant', 'live');

    return imageResponse;

  } catch {
    // SHARE-10 contract: any error → renderFallback
    const resp = renderFallback({ handle: handleHint || 'someone', footerBrand });
    resp.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    resp.headers.set('X-Variant', 'live-fallback');
    resp.headers.set('X-Reason', 'rpc-error-or-not-found');
    return resp;
  }
}
