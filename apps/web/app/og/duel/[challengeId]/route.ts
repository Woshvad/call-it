export const runtime = 'nodejs';

/**
 * SHARE-07 / SOCIAL-51: Duel Settled OG card variant 3 — GET /og/duel/[challengeId]
 *
 * §16.4 Duel Settled Card layout (1200×630):
 *   - Outer: background #09090E, 3px #E8F542 border, flexbox column
 *   - Header row: "CALL IT" Syne 64px 700 #E8F542 left | "ARB" right
 *   - Hero row (flex:1, flex-direction:row):
 *     - CALLER column (flex:1): avatar 180px circle (3px #E8F542), handle Syne 32px 700
 *     - VS divider (24px, 1px #2E2E42 border-left)
 *     - CHALLENGER column (flex:1): avatar 180px circle (3px #FB923C), handle Syne 32px 700
 *   - VS/WINS slot (Syne 64px 700): stub = "VS" in #64748B (Phase 3), "WINS" in Phase 4
 *   - Pot row: "Pot: $X,XXX · winner takes all" Space Grotesk 16px 400 #F1F5F9
 *   - Rep deltas row: "? REP" #94A3B8 (stub per D-11; Phase 4 shows real deltas)
 *   - Meta row: asset pair + question (Space Grotesk 12px #64748B) | "callitapp.xyz" Syne 12px #E8F542
 *   - 4x corner brackets (L-shaped, 4px stroke, #E8F542, 16px arm)
 *
 * STUB CONTRACT (D-11 — active-duel Phase 3):
 *   - winner highlight: both columns at full opacity (1.0)
 *   - WINS/VS text: "VS" in Syne 64px 700 #64748B (not "WINS")
 *   - winner handle color: #F1F5F9 neutral (not #E8F542)
 *   - rep deltas: "? REP" in #94A3B8
 *   - X-Variant: 'duel-active'
 *
 * Runtime: 'nodejs' — CRITICAL (Pitfall 15; T-3-07-03). NOT 'edge'.
 * Security:
 *   - T-3-07-01: ZERO CSS grid usage (no grid display or gridTemplateColumns) anywhere
 *   - T-3-07-02: any error → renderFallback(); never 500; X-Reason header only
 *   - T-3-07-03: export const runtime = 'nodejs' is FIRST export (line 1)
 *   - T-3-07-06: ARBITRUM_SEPOLIA_RPC_URL server-side only (no NEXT_PUBLIC_ prefix)
 *   - AUTH-44: never renders raw wallet address — handles only
 *   - SHARE-10: on any RPC failure, call renderFallback()
 */

import { type NextRequest } from 'next/server';
import { createElement as h, type ReactElement } from 'react';
import { ImageResponse } from '@vercel/og';
import { createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { renderFallback } from '@/lib/og-fallback-render';
import { syneBold, spaceGrotesk, jetBrainsMono } from '@/lib/og-fonts';
import {
  CHALLENGE_ESCROW_ARBITRUM_SEPOLIA,
  PROFILE_REGISTRY_ARBITRUM_SEPOLIA,
} from '@call-it/shared';
import { getDuelSettledFields } from '@/lib/relayer-client';

/** Format a signed rep delta integer as "+N REP" / "-N REP". */
function formatRepDelta(delta: number | null): string | null {
  if (delta === null) return null;
  const sign = delta >= 0 ? '+' : '-';
  return `${sign}${Math.abs(delta)} REP`;
}

// ── Minimal ChallengeEscrow ABI — getChallenge(uint256) ────────────────────────
// Inline minimal ABI for the OG server-side read path (consistent with og/[callId] pattern).
const challengeEscrowAbi = [
  {
    type: 'function',
    name: 'getChallenge',
    inputs: [{ name: 'challengeId', type: 'uint256', internalType: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct IChallengeEscrow.Challenge',
        // Field names and ORDER must exactly match IChallengeEscrow.Challenge struct
        // (viem decodes positionally -- wrong order = wrong values, CR-03 fix).
        components: [
          { name: 'callId', type: 'uint256', internalType: 'uint256' },
          { name: 'caller', type: 'address', internalType: 'address' },
          { name: 'challenger', type: 'address', internalType: 'address' },
          { name: 'callerStake', type: 'uint96', internalType: 'uint96' },
          { name: 'challengerStake', type: 'uint96', internalType: 'uint96' },
          { name: 'proposedAt', type: 'uint64', internalType: 'uint64' },
          { name: 'winner', type: 'address', internalType: 'address' },
          { name: 'status', type: 'uint8', internalType: 'enum IChallengeEscrow.ChallengeStatus' },
          { name: 'callerClaimed', type: 'bool', internalType: 'bool' },
          { name: 'challengerClaimed', type: 'bool', internalType: 'bool' },
          { name: 'overageClaimed', type: 'bool', internalType: 'bool' },
        ],
      },
    ],
    stateMutability: 'view',
  },
] as const;

// ── Minimal ProfileRegistry ABI — getProfile(address) ─────────────────────────
const profileRegistryAbi = [
  {
    type: 'function',
    name: 'getProfile',
    inputs: [{ name: 'user', type: 'address', internalType: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        internalType: 'struct IProfileRegistry.Profile',
        components: [
          { name: 'handle', type: 'string', internalType: 'string' },
          { name: 'avatarUri', type: 'string', internalType: 'string' },
          { name: 'repScore', type: 'uint64', internalType: 'uint64' },
          { name: 'createdAt', type: 'uint64', internalType: 'uint64' },
        ],
      },
    ],
    stateMutability: 'view',
  },
] as const;

// ── Server-side viem public client (NOT wagmi — server route only) ──────────────
// RPC key is server-side only (T-3-07-06 — no NEXT_PUBLIC_ prefix).
// CHALLENGE_ESCROW_ARBITRUM_SEPOLIA is 0x000...000 until Phase 3 deploy lands.
// All CE reads against the zero address will revert → caught by try/catch → renderFallback.
const publicClient = createPublicClient({
  chain: arbitrumSepolia,
  transport: http(process.env['ARBITRUM_SEPOLIA_RPC_URL'] ?? 'https://sepolia-rollup.arbitrum.io/rpc'),
});

// ── Zero address constant ───────────────────────────────────────────────────────
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

// ── Pot formatting ──────────────────────────────────────────────────────────────

/**
 * Format USDC pot value (6 decimals) as "$X,XXX"
 * Commas, no decimals unless < $10 (< 10_000_000 micro-USDC).
 */
function formatPot(potRaw: bigint): string {
  const usdcWhole = Number(potRaw) / 1_000_000;
  if (usdcWhole < 10) {
    return `$${usdcWhole.toFixed(2)}`;
  }
  return `$${usdcWhole.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ── Corner bracket renderer (verbatim from og/[callId]/route.ts) ───────────────
// All four corners, 4px stroke, #E8F542, 16px arm.
// Uses nested position:absolute divs — no SVG (Satori SVG support is limited).

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

// ── Duel card JSX builder ───────────────────────────────────────────────────────
// ALL layout uses display:'flex' — ZERO display:'grid' (Pitfall 15 / T-3-07-01).
// Two-column layout = flexDirection:'row' with two flex:1 children.

interface DuelCardProps {
  callerHandle: string;
  challengerHandle: string;
  potRaw: bigint;
  assetPair: string;
  callQuestion: string;
  footerBrand: string;
  // Phase 3 stub: settled = false always; Phase 4: true when winner !== ZERO_ADDRESS
  settled: boolean;
  // Phase 4: winner-aware (T-04-07-04: not hardcoded as caller)
  callerIsWinner: boolean;
  // Phase 4: real rep deltas from subgraph (replaces "? REP" stub)
  callerRepDelta: string;
  challengerRepDelta: string;
}

function buildDuelCard(props: DuelCardProps): ReactElement {
  const {
    callerHandle,
    challengerHandle,
    potRaw,
    assetPair,
    callQuestion,
    footerBrand,
    settled,
    callerIsWinner,
    callerRepDelta,
    challengerRepDelta,
  } = props;

  const potStr = formatPot(potRaw);

  // Phase 4: winner-aware opacity + colors (T-04-07-04: not caller-hardcoded)
  // When settled: winner column full opacity, loser column 0.4 opacity
  // callerIsWinner determines which column is the winner
  const callerOpacity = settled ? (callerIsWinner ? 1.0 : 0.4) : 1.0;
  const challengerOpacity = settled ? (callerIsWinner ? 0.4 : 1.0) : 1.0;
  // WINS text in #E8F542 when settled (per D-11 Phase 4 fill spec)
  const vsWinsText = settled ? 'WINS' : 'VS';
  const vsWinsColor = settled ? '#E8F542' : '#64748B';
  // Winner handle highlighted in #E8F542
  const callerHandleColor = settled && callerIsWinner ? '#E8F542' : '#F1F5F9';
  const challengerHandleColor = settled && !callerIsWinner ? '#E8F542' : '#F1F5F9';
  // Rep delta display: real values when settled, "? REP" stub when not
  const repDeltaDisplay = settled
    ? `${callerRepDelta} / ${challengerRepDelta}`
    : '? REP';

  return h(
    'div',
    {
      style: {
        width: '1200px',
        height: '630px',
        background: '#09090E',
        display: 'flex',           // PITFALL 15: flexbox only — Satori does not support CSS grid
        flexDirection: 'column',
        position: 'relative',
        border: '3px solid #E8F542',
      },
    },
    // Corner bracket motif — all four corners (§16.4)
    cornerBracket('topLeft'),
    cornerBracket('topRight'),
    cornerBracket('bottomLeft'),
    cornerBracket('bottomRight'),

    // ── Header row: CALL IT wordmark + ARB label ────────────────────────────
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '32px 56px 0 56px',
        },
      },
      h('div', {
        style: {
          fontFamily: 'Syne',
          fontSize: 64,
          fontWeight: 700,
          color: '#E8F542',
          display: 'flex',
        },
      }, 'CALL IT'),
      h('div', {
        style: {
          fontFamily: 'JetBrainsMono',
          fontSize: 14,
          color: '#94A3B8',
          display: 'flex',
          alignItems: 'center',
        },
      }, '⬢ ARB'),
    ),

    // ── Hero row: CALLER | VS divider | CHALLENGER ──────────────────────────
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'row',
          flex: 1,
          padding: '16px 40px 0 40px',
        },
      },

      // CALLER column (flex:1): Phase 4 winner-aware opacity
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 24px',
            opacity: callerOpacity,
          },
        },
        // Caller avatar placeholder circle (180px)
        h('div', {
          style: {
            width: 180,
            height: 180,
            borderRadius: '50%',
            border: '3px solid #E8F542',
            background: '#1A1A24',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          },
        },
          h('div', {
            style: {
              fontFamily: 'Syne',
              fontSize: 56,
              fontWeight: 700,
              color: '#E8F542',
              display: 'flex',
            },
          }, (callerHandle[0] ?? '?').toUpperCase()),
        ),
        // Caller handle
        h('div', {
          style: {
            fontFamily: 'Syne',
            fontSize: 32,
            fontWeight: 700,
            color: callerHandleColor,
            display: 'flex',
            marginTop: 16,
            maxWidth: '400px',
          },
        }, `@${callerHandle.length > 16 ? callerHandle.slice(0, 15) + '…' : callerHandle}`),
        // VS / WINS slot — Phase 4 fills: "WINS" in #E8F542 when settled
        h('div', {
          style: {
            fontFamily: 'Syne',
            fontSize: 64,
            fontWeight: 700,
            color: vsWinsColor,
            display: 'flex',
            marginTop: 8,
          },
        }, vsWinsText),
      ),

      // VS divider (24px wide, 1px #2E2E42 left border)
      h('div', {
        style: {
          width: 24,
          display: 'flex',
          borderLeft: '1px solid #2E2E42',
          alignSelf: 'stretch',
        },
      }),

      // CHALLENGER column (flex:1, opacity 0.4 when settled, 1.0 in Phase 3 stub)
      h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 24px',
            opacity: challengerOpacity,
          },
        },
        // Challenger avatar placeholder circle (180px, #FB923C border)
        h('div', {
          style: {
            width: 180,
            height: 180,
            borderRadius: '50%',
            border: '3px solid #FB923C',
            background: '#1A1A24',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          },
        },
          h('div', {
            style: {
              fontFamily: 'Syne',
              fontSize: 56,
              fontWeight: 700,
              color: '#FB923C',
              display: 'flex',
            },
          }, (challengerHandle[0] ?? '?').toUpperCase()),
        ),
        // Challenger handle — Phase 4: winner-aware color (T-04-07-04)
        h('div', {
          style: {
            fontFamily: 'Syne',
            fontSize: 32,
            fontWeight: 700,
            color: challengerHandleColor,
            display: 'flex',
            marginTop: 16,
            maxWidth: '400px',
          },
        }, `@${challengerHandle.length > 16 ? challengerHandle.slice(0, 15) + '…' : challengerHandle}`),
      ),
    ),

    // ── Pot row ────────────────────────────────────────────────────────────
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 56px 0 56px',
        },
      },
      h('div', {
        style: {
          fontFamily: 'SpaceGrotesk',
          fontSize: 16,
          fontWeight: 400,
          color: '#F1F5F9',
          display: 'flex',
        },
      }, `Pot: ${potStr} · winner takes all`),
      // Rep deltas — Phase 4 fills: real values when settled (D-11 stub replaced)
      h('div', {
        style: {
          fontFamily: 'JetBrainsMono',
          fontSize: 16,
          color: settled ? '#E8E8E8' : '#94A3B8',
          display: 'flex',
        },
      }, repDeltaDisplay),
    ),

    // ── Meta row: asset pair + question | callitapp.xyz ────────────────────
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 56px 28px 56px',
        },
      },
      h('div', {
        style: {
          fontFamily: 'SpaceGrotesk',
          fontSize: 12,
          color: '#64748B',
          display: 'flex',
          maxWidth: '900px',
        },
      }, assetPair ? `${assetPair} · ${callQuestion.length > 60 ? callQuestion.slice(0, 57) + '…' : callQuestion}` : callQuestion),
      h('div', {
        style: {
          fontFamily: 'Syne',
          fontSize: 12,
          color: '#E8F542',
          display: 'flex',
          whiteSpace: 'nowrap',
        },
      }, footerBrand),
    ),
  );
}

// ── GET handler ─────────────────────────────────────────────────────────────────

/**
 * GET /og/duel/[challengeId]?v={challengeStatusVersion}
 *
 * Phase 3: Reads challenge + profile data from ChallengeEscrow + ProfileRegistry via viem.
 * Falls through to renderFallback on any RPC failure (SHARE-10).
 *
 * D-09: ?v= param provides CDN cache-bust when challengeStatusVersion changes.
 * Cache-Control: max-age=60, stale-while-revalidate=300
 * X-Variant: 'duel-active' (Phase 3); Phase 4 sets 'duel-settled' when winner populated.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ challengeId: string }> }
) {
  const { challengeId: challengeIdStr } = await params;

  // Parse query params
  const url = new URL(req.url);
  // ?v= is the CDN cache-bust version — consumed by CDN, not used server-side
  void url.searchParams.get('v');

  const footerBrand = process.env['NEXT_PUBLIC_BRAND_FOOTER'] ?? 'callitapp.xyz';

  let challengeId: bigint;
  try {
    challengeId = BigInt(challengeIdStr);
    if (challengeId === 0n) throw new Error('challengeId 0 is invalid');
  } catch {
    // Invalid challengeId → fallback (SHARE-10)
    const resp = renderFallback({ handle: 'duel', footerBrand });
    resp.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    resp.headers.set('X-Variant', 'duel-fallback');
    resp.headers.set('X-Reason', 'invalid-challenge-id');
    return resp;
  }

  try {
    // Guard: ChallengeEscrow placeholder address → skip RPC read, serve graceful fallback
    // CHALLENGE_ESCROW_ARBITRUM_SEPOLIA is 0x000...000 until Phase 3 operator deploy.
    const ceDeployed = (CHALLENGE_ESCROW_ARBITRUM_SEPOLIA as string).toLowerCase() !== ZERO_ADDRESS;

    if (!ceDeployed) {
      // Deferred deploy — serve placeholder duel card
      const cardJsx = buildDuelCard({
        callerHandle: 'caller',
        challengerHandle: 'challenger',
        potRaw: 0n,
        assetPair: '',
        callQuestion: `Duel #${challengeIdStr}`,
        footerBrand,
        settled: false,
        callerIsWinner: false,
        callerRepDelta: '?',
        challengerRepDelta: '?',
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
      imageResponse.headers.set('X-Variant', 'duel-active');
      imageResponse.headers.set('X-Reason', 'deferred-deploy');
      return imageResponse;
    }

    // ── RPC reads: Challenge data + caller/challenger profiles ──────────────
    const challenge = await publicClient.readContract({
      address: CHALLENGE_ESCROW_ARBITRUM_SEPOLIA as `0x${string}`,
      abi: challengeEscrowAbi,
      functionName: 'getChallenge',
      args: [challengeId],
    });

    // Guard: challenge not found (zero caller = uninitialized slot)
    if (!challenge.caller || challenge.caller === ZERO_ADDRESS) {
      throw new Error('challenge-not-found');
    }

    // Parallel profile reads for both participants
    const profileRegistryDeployed =
      (PROFILE_REGISTRY_ARBITRUM_SEPOLIA as string).toLowerCase() !== ZERO_ADDRESS;

    let callerHandle = `0x${challenge.caller.slice(2, 8)}`;
    let challengerHandle = `0x${challenge.challenger.slice(2, 8)}`;

    if (profileRegistryDeployed) {
      const [callerProfile, challengerProfile] = await Promise.all([
        publicClient.readContract({
          address: PROFILE_REGISTRY_ARBITRUM_SEPOLIA as `0x${string}`,
          abi: profileRegistryAbi,
          functionName: 'getProfile',
          args: [challenge.caller],
        }),
        publicClient.readContract({
          address: PROFILE_REGISTRY_ARBITRUM_SEPOLIA as `0x${string}`,
          abi: profileRegistryAbi,
          functionName: 'getProfile',
          args: [challenge.challenger],
        }),
      ]);
      if (callerProfile.handle) callerHandle = callerProfile.handle;
      if (challengerProfile.handle) challengerHandle = challengerProfile.handle;
    }

    // Compute pot: min(callerStake, challengerStake) × 2 (SOCIAL-31)
    const matchedStake = challenge.callerStake < challenge.challengerStake
      ? challenge.callerStake
      : challenge.challengerStake;
    const potRaw = matchedStake * 2n;

    // Phase 4: D-11 stub fill — settled = true when winner is populated (T-04-07-04)
    const settled = challenge.winner !== ZERO_ADDRESS;

    // Phase 4: winner-aware (T-04-07-04: not hardcoded as caller)
    // callerIsWinner = true when winner address === caller address
    const callerIsWinner = settled && challenge.winner.toLowerCase() === challenge.caller.toLowerCase();

    // ── D-03: real rep deltas + statement from the subgraph ─────────────────
    // RepEvent.delta per participant (keyed by callId + user); the underlying
    // call's templated statement (D-03) + asset for the meta row. Fail-safe:
    // getDuelSettledFields returns all-null on any error → safe defaults below.
    const callIdForSubgraph = challenge.callId.toString();
    const duelFields = settled
      ? await getDuelSettledFields(callIdForSubgraph, challenge.caller, challenge.challenger)
      : { statement: null, asset: null, callerRepDelta: null, challengerRepDelta: null };

    // Rep delta display: real RepEvent.delta when present, else "?" pre-settle.
    const callerRepDelta = settled
      ? (formatRepDelta(duelFields.callerRepDelta) ?? (callerIsWinner ? '+REP' : '-REP'))
      : '?';
    const challengerRepDelta = settled
      ? (formatRepDelta(duelFields.challengerRepDelta) ?? (callerIsWinner ? '-REP' : '+REP'))
      : '?';

    // Underlying call statement (D-03) + asset for the meta row; fall back to
    // the Duel #N label when the subgraph has no statement yet.
    const callQuestion = duelFields.statement ?? `Duel #${challengeIdStr}`;
    const assetPair = duelFields.asset ?? '';

    const cardJsx = buildDuelCard({
      callerHandle,
      challengerHandle,
      potRaw,
      assetPair,        // D-03: subgraph Call.asset
      callQuestion,     // D-03: subgraph Call.statement templated mirror
      footerBrand,
      settled,
      callerIsWinner,
      callerRepDelta,
      challengerRepDelta,
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
    // Phase 4: X-Variant: 'duel-settled' when winner populated (D-11 stub fill)
    imageResponse.headers.set('X-Variant', settled ? 'duel-settled' : 'duel-active');

    return imageResponse;

  } catch {
    // SHARE-10 contract: any error → renderFallback — never 500, never stack trace
    const resp = renderFallback({ handle: 'duel', footerBrand });
    resp.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    resp.headers.set('X-Variant', 'duel-fallback');
    resp.headers.set('X-Reason', 'rpc-error-or-not-found');
    return resp;
  }
}
