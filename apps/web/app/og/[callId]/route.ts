/**
 * SHARE-04: Live OG card variant 1 — GET /og/[callId]
 * SHARE-05/06: Settled OG card variant 2 (buildSettledCard) — Phase 4 (Plan 04-07)
 * SHARE-08:    CallerExited OG card variant 4 (buildCallerExitedCard) — Phase 4 (Plan 04-07)
 *
 * §16.2 Live State Card, §16.3 Settled Card, §16.5 CallerExited Card
 *
 * Route branches on callData.status:
 *   Settled / Disputed → buildSettledCard
 *   CallerExited       → buildCallerExitedCard
 *   default (Live)     → buildLiveCard
 *
 * ?as=fader: if caller lost AND viewer has winning fade position, render FADED CORRECTLY variant (D-09)
 *
 * Runtime: 'nodejs' — CRITICAL. NOT 'edge'. resvg-wasm bundling fails on edge runtime.
 * Security:
 *   - T-02-09-01: statusVersion bump via ?v= param forces CDN cache-miss
 *   - T-02-09-02: export const runtime = 'nodejs' enforced; no display:grid (Pitfall 15)
 *   - T-04-07-01: AUTH-44 — caller address internal only; OG card shows @handle only
 *   - T-04-07-02: CI grep guard — zero display:grid in this file
 *   - T-04-07-03: CONTRARIAN HIT = #E8F542 (explicit hex, NOT purple #A855F7)
 *   - T-04-07-05: D-09 — ?as=fader only shows FADED CORRECTLY when isViewerFader=true
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
import { getOutcomeWordResult } from '@/lib/outcome-word';

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

// ── Settled card builder (Phase 4, variant 2) ────────────────────────────────
// SHARE-05/06: Settled OG card variant 2 (§16.3)
// ALL layout uses display:flex — Satori does NOT support display:grid (Pitfall 15 / T-04-07-02)
// AUTH-44: @handle only, never raw wallet address

interface SettledCardProps {
  callStatement: string;
  handle: string;
  conviction: number;
  repRaw: number;       // rep score (for display)
  outcomeWord: string;
  outcomeColor: string; // §14.1 locked hex
  outcomeLozenge: string | null;
  pnlStr: string;       // P&L formatted string e.g. "+$12.50"
  repDeltaStr: string;  // rep delta formatted e.g. "+8 REP"
  finalValue: string;   // oracle price at settlement
  targetValue: string;  // call target value
  isViewerFader: boolean; // D-09
  footerBrand: string;
}

function buildSettledCard(props: SettledCardProps): ReactElement {
  const {
    callStatement, handle, conviction, repRaw,
    outcomeWord, outcomeColor, outcomeLozenge,
    pnlStr, repDeltaStr, finalValue, targetValue,
    isViewerFader, footerBrand,
  } = props;

  // D-09: ?as=fader variant shows FADED CORRECTLY with accent colors
  const displayWord = isViewerFader ? 'FADED CORRECTLY' : outcomeWord;
  const displayColor = isViewerFader ? '#E8F542' : outcomeColor;
  const displayLozenge = isViewerFader ? 'FADER WIN' : outcomeLozenge;

  // Fit outcome word to one line — if LOUD AND WRONG overflows at 88px, use 64px
  const wordLen = displayWord.length;
  const wordFontSize = wordLen > 14 ? 64 : 88;

  return h(
    'div',
    {
      style: {
        width: '1200px',
        height: '630px',
        background: '#09090E',
        display: 'flex',           // PITFALL 15: flexbox only
        flexDirection: 'column',
        position: 'relative',
        border: '3px solid #E8F542',
      },
    },
    // Corner bracket motif
    cornerBracket('topLeft'),
    cornerBracket('topRight'),
    cornerBracket('bottomLeft'),
    cornerBracket('bottomRight'),

    // ── Header row: CALL IT wordmark + [SETTLED] badge + ARB ──────────────
    h('div', {
      style: {
        display: 'flex', flexDirection: 'row',
        justifyContent: 'space-between', alignItems: 'center',
        padding: '32px 56px 0 56px',
      },
    },
      h('div', {
        style: { fontFamily: 'Syne', fontSize: 40, color: '#E8F542', fontWeight: 700, display: 'flex' },
      }, 'CALL IT'),
      h('div', {
        style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12 },
      },
        h('div', {
          style: {
            fontFamily: 'SpaceGrotesk', fontSize: 13, color: '#E8F542',
            background: 'rgba(232,245,66,0.12)', border: '2px solid #E8F542',
            padding: '4px 10px', display: 'flex', fontWeight: 700, letterSpacing: 2,
          },
        }, 'SETTLED'),
        h('div', {
          style: { fontFamily: 'JetBrainsMono', fontSize: 12, color: '#94A3B8', display: 'flex' },
        }, '⬢ ARB'),
      ),
    ),

    // ── Caller line ────────────────────────────────────────────────────────
    h('div', {
      style: { display: 'flex', padding: '12px 56px 0 56px' },
    },
      h('div', {
        style: { fontFamily: 'SpaceGrotesk', fontSize: 18, color: '#94A3B8', display: 'flex' },
      }, `@${handle} · ${conviction}% conviction · ${repRaw} rep`),
    ),

    // ── OUTCOME WORD hero: §14.1 locked color, ≥64px one-line fit ─────────
    h('div', {
      style: {
        display: 'flex', flexDirection: 'column', padding: '16px 56px 0 56px', gap: 8,
      },
    },
      h('div', {
        style: {
          fontFamily: 'Syne', fontSize: wordFontSize, fontWeight: 800,
          color: displayColor, display: 'flex', lineHeight: 1.0,
        },
      }, displayWord),
      displayLozenge
        ? h('div', {
            style: {
              fontFamily: 'SpaceGrotesk', fontSize: 13, fontWeight: 700,
              color: displayColor, border: `2px solid ${displayColor}`,
              padding: '3px 12px', display: 'flex', letterSpacing: 2, alignSelf: 'flex-start',
            },
          }, displayLozenge)
        : h('div', { style: { display: 'flex' } }),
    ),

    // ── Call statement ─────────────────────────────────────────────────────
    h('div', {
      style: { display: 'flex', padding: '12px 56px 0 56px', flex: 1, alignItems: 'flex-start' },
    },
      h('div', {
        style: {
          fontFamily: 'Syne', fontSize: 28, fontWeight: 700, color: '#F1F5F9',
          display: 'flex', lineHeight: 1.2, maxWidth: '1050px',
        },
      }, callStatement.length > 90 ? callStatement.slice(0, 87) + '…' : callStatement),
    ),

    // ── Stats row: P&L / REP CHANGE / FINAL / CONVICTION ─────────────────
    h('div', {
      style: {
        display: 'flex', flexDirection: 'row', margin: '0 56px 0 56px',
        border: '1px solid #2E2E42',
      },
    },
      ...[
        { label: 'P&L', value: pnlStr, color: pnlStr.startsWith('+') ? '#4ADE80' : '#F87171' },
        { label: 'REP CHANGE', value: repDeltaStr, color: repDeltaStr.startsWith('+') ? '#4ADE80' : '#F87171' },
        { label: 'FINAL', value: finalValue, color: '#E8E8E8' },
        { label: 'TARGET', value: targetValue, color: '#E8F542' },
      ].map((cell, i, arr) => h('div', {
        key: cell.label,
        style: {
          display: 'flex', flexDirection: 'column', flex: 1, padding: '10px 16px', gap: 4,
          borderRight: i < arr.length - 1 ? '1px solid #2E2E42' : undefined,
        },
      },
        h('div', {
          style: { fontFamily: 'SpaceGrotesk', fontSize: 10, color: '#94A3B8', letterSpacing: 2, fontWeight: 700, display: 'flex' },
        }, cell.label),
        h('div', {
          style: { fontFamily: 'JetBrainsMono', fontSize: 15, color: cell.color, display: 'flex', fontWeight: 700 },
        }, cell.value),
      )),
    ),

    // ── Footer: handle + brand ──────────────────────────────────────────
    h('div', {
      style: {
        display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 56px 28px 56px',
      },
    },
      h('div', {
        style: { fontFamily: 'SpaceGrotesk', fontSize: 16, color: '#F1F5F9', display: 'flex', fontWeight: 700 },
      }, `@${handle}`),
      h('div', {
        style: { fontFamily: 'SpaceGrotesk', fontSize: 12, color: '#94A3B8', display: 'flex' },
      }, footerBrand),
    ),
  );
}

// ── CallerExited card builder (Phase 4, variant 4) ────────────────────────────
// SHARE-08: CallerExited OG card variant 4 (§16.5)
// Caller avatar at 40% opacity per SHARE-08 / UI-22
// ALL layout uses display:flex — Satori does NOT support display:grid (Pitfall 15)

interface CallerExitedCardProps {
  callStatement: string;
  handle: string;
  timeBeforeExit: string;   // e.g. "3d before expiry"
  stakeSlashed: string;     // e.g. "-$25.00"
  repImpact: string;        // e.g. "-35 REP"
  expiryStr: string;        // e.g. "Jun 30"
  footerBrand: string;
}

function buildCallerExitedCard(props: CallerExitedCardProps): ReactElement {
  const { callStatement, handle, timeBeforeExit, stakeSlashed, repImpact, expiryStr, footerBrand } = props;

  return h(
    'div',
    {
      style: {
        width: '1200px',
        height: '630px',
        background: '#09090E',
        display: 'flex',           // PITFALL 15: flexbox only
        flexDirection: 'column',
        position: 'relative',
        border: '3px solid #E8F542',
      },
    },
    // Corner bracket motif
    cornerBracket('topLeft'),
    cornerBracket('topRight'),
    cornerBracket('bottomLeft'),
    cornerBracket('bottomRight'),

    // ── Header row: CALL IT wordmark + ARB (no SETTLED badge) ─────────────
    h('div', {
      style: {
        display: 'flex', flexDirection: 'row',
        justifyContent: 'space-between', alignItems: 'center',
        padding: '32px 56px 0 56px',
      },
    },
      h('div', {
        style: { fontFamily: 'Syne', fontSize: 40, color: '#E8F542', fontWeight: 700, display: 'flex' },
      }, 'CALL IT'),
      h('div', {
        style: { fontFamily: 'JetBrainsMono', fontSize: 12, color: '#94A3B8', display: 'flex' },
      }, '⬢ ARB'),
    ),

    // ── Hero: "CALLER EXITED" in amber #FB923C ─────────────────────────────
    h('div', {
      style: { display: 'flex', padding: '20px 56px 0 56px' },
    },
      h('div', {
        style: {
          fontFamily: 'Syne', fontSize: 88, fontWeight: 800, color: '#FB923C',
          display: 'flex', lineHeight: 1.0,
        },
      }, 'CALLER EXITED'),
    ),

    // ── Call statement ─────────────────────────────────────────────────────
    h('div', {
      style: { display: 'flex', padding: '12px 56px 0 56px', flex: 1, alignItems: 'flex-start' },
    },
      h('div', {
        style: {
          fontFamily: 'Syne', fontSize: 28, fontWeight: 700, color: '#F1F5F9',
          display: 'flex', lineHeight: 1.2, maxWidth: '1050px',
        },
      }, callStatement.length > 90 ? callStatement.slice(0, 87) + '…' : callStatement),
    ),

    // ── Stats row: TIME / STAKE SLASHED / REPUTATION IMPACT ──────────────
    h('div', {
      style: {
        display: 'flex', flexDirection: 'row', margin: '0 56px 0 56px',
        border: '1px solid #2E2E42',
      },
    },
      ...[
        { label: 'TIME BEFORE EXIT', value: timeBeforeExit, color: '#94A3B8' },
        { label: 'STAKE SLASHED', value: stakeSlashed, color: '#F87171' },
        { label: 'REPUTATION IMPACT', value: repImpact, color: '#F87171' },
      ].map((cell, i, arr) => h('div', {
        key: cell.label,
        style: {
          display: 'flex', flexDirection: 'column', flex: 1, padding: '10px 16px', gap: 4,
          borderRight: i < arr.length - 1 ? '1px solid #2E2E42' : undefined,
        },
      },
        h('div', {
          style: { fontFamily: 'SpaceGrotesk', fontSize: 10, color: '#94A3B8', letterSpacing: 2, fontWeight: 700, display: 'flex' },
        }, cell.label),
        h('div', {
          style: { fontFamily: 'JetBrainsMono', fontSize: 15, color: cell.color, display: 'flex', fontWeight: 700 },
        }, cell.value),
      )),
    ),

    // ── Caller section: avatar at 40% opacity + handle (SHARE-08) ─────────
    h('div', {
      style: {
        display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 16,
        padding: '12px 56px 0 56px', opacity: 0.4,
      },
    },
      // Avatar placeholder circle
      h('div', {
        style: {
          width: 48, height: 48, borderRadius: '50%',
          border: '2px solid #94A3B8', background: '#1A1A24',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        },
      },
        h('div', {
          style: { fontFamily: 'Syne', fontSize: 20, fontWeight: 700, color: '#94A3B8', display: 'flex' },
        }, (handle[0] ?? '?').toUpperCase()),
      ),
      h('div', {
        style: { fontFamily: 'SpaceGrotesk', fontSize: 16, color: '#94A3B8', display: 'flex' },
      }, `@${handle}`),
    ),

    // ── Note copy ──────────────────────────────────────────────────────────
    h('div', {
      style: { display: 'flex', padding: '8px 56px 0 56px' },
    },
      h('div', {
        style: { fontFamily: 'SpaceGrotesk', fontSize: 14, color: '#94A3B8', display: 'flex' },
      }, `Call continues for followers and faders. Settles at ${expiryStr}.`),
    ),

    // ── Footer brand ───────────────────────────────────────────────────────
    h('div', {
      style: {
        display: 'flex', flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center',
        padding: '12px 56px 28px 56px',
      },
    },
      h('div', {
        style: { fontFamily: 'SpaceGrotesk', fontSize: 12, color: '#94A3B8', display: 'flex' },
      }, footerBrand),
    ),
  );
}

// ── GET handler ────────────────────────────────────────────────────────────────

/**
 * GET /og/[callId]?v={statusVersion}&handle={hint}&as={fader}
 *
 * Phase 2: Reads live state from CallRegistry + FollowFadeMarket via viem.
 * Phase 4: Branches on callData.status for Settled/CallerExited variants.
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
  // ?as=fader: viewer is a winning fader — show FADED CORRECTLY variant (D-09 / T-04-07-05)
  const isViewerFader = url.searchParams.get('as') === 'fader';

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

    // ── Phase 4: Branch on call status ────────────────────────────────────
    // Status ordinal from on-chain: 0=Live, 1=Disputed, 2=CallerExited, 3=Settled (check spec)
    // callData.status is a uint8 enum — 3=Settled, 2=CallerExited, 1=Disputed per CallStatus
    const statusNum = Number(callData.status);
    const isOnChainSettled = statusNum === 3 || statusNum === 1; // Settled or Disputed
    const isOnChainCallerExited = statusNum === 2;

    let cardJsx: ReactElement;
    let xVariant: string;

    if (isOnChainSettled) {
      // Variant 2: Settled OG card (buildSettledCard)
      // We don't have rep delta / outcome from on-chain getCall — these come from SettlementManager events.
      // Use defaults for now; Phase 7 will wire full subgraph lookup.
      // Outcome: default to 'CallerWon' (the outcome enum is not in getCall result — it's in CallRegistry.outcome field)
      const outcomeNum = Number(callData.outcome ?? 0); // outcome field from CallRegistry
      const callerWon = outcomeNum === 1; // Outcome.CallerWon = 1 per spec
      const outcomeResult = getOutcomeWordResult({
        callerWon,
        fadeRealShare: 0,  // Phase 7 wires subgraph read
        repDelta: 0,       // Phase 7 wires SettlementManager.RepCalculated
        viewerIsWinningFader: isViewerFader && !callerWon,
      });

      cardJsx = buildSettledCard({
        callStatement,
        handle,
        conviction,
        repRaw: 0,
        outcomeWord: outcomeResult.word,
        outcomeColor: outcomeResult.color,
        outcomeLozenge: outcomeResult.lozenge,
        pnlStr: '—',       // Phase 7 wires P&L
        repDeltaStr: '—',  // Phase 7 wires rep delta
        finalValue: '—',   // Phase 7 wires oracle final price
        targetValue: '—',  // Phase 7 wires call target
        isViewerFader: isViewerFader && !callerWon,
        footerBrand,
      });
      xVariant = 'settled';
    } else if (isOnChainCallerExited) {
      // Variant 4: CallerExited OG card (buildCallerExitedCard)
      const exitedAt = Number(callData.callerExitedAt ?? 0);
      const expiryNum = Number(callData.expiry);
      const timeBeforeExit = exitedAt > 0 && expiryNum > exitedAt
        ? formatTimeLeft(expiryNum - exitedAt) + ' before expiry'
        : 'Before expiry';
      const expiryDate = expiryNum > 0
        ? new Date(expiryNum * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : '—';

      cardJsx = buildCallerExitedCard({
        callStatement,
        handle,
        timeBeforeExit,
        stakeSlashed: formatUsdc(BigInt(stakeRaw / 2n)), // ~50% slash estimate; Phase 7 wires exact
        repImpact: '-35 REP',  // Phase 7 wires computeCallerExitRepDelta
        expiryStr: expiryDate,
        footerBrand,
      });
      xVariant = 'caller-exited';
    } else {
      // Variant 1: Live OG card (default)
      cardJsx = buildLiveCard({
        callStatement,
        handle,
        conviction,
        stakeRaw,
        followPct,
        fadePct,
        timeLeft,
        footerBrand,
      });
      xVariant = 'live';
    }

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
    imageResponse.headers.set('X-Variant', xVariant);

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
