/**
 * SHARE-19 SC2 — Frame tx wire endpoint: POST /api/frame/tx/:callId
 *
 * Makes a Call It receipt actionable from a Farcaster cast. Returns the legacy
 * Frame `tx` wire object —
 *   { chainId:'eip155:421614', method:'eth_sendTransaction', params:{ abi, to, data, value } }
 * — whose button set is chosen by the live call status (D-02 live triplet
 * Follow/Fade/Challenge vs D-06 settled triplet Follow/Challenge/Quote) and whose
 * calldata is built server-side with viem from the in-repo ABIs + the pinned
 * @call-it/shared Sepolia addresses.
 *
 * Of the four button actions only the three directly-constructible one-tap actions
 * (Live Follow, Live Fade, Challenge) return tx calldata; the two non-constructible
 * actions (settled social Follow, Quote) route to the 'Open in Call It' deep-link
 * (D-06a, resolved 2026-06-08). Live broadcast in Warpcast is deferred to Phase 10
 * (D-01 — Arbitrum Sepolia 421614 is not in Warpcast's chainList); this slice builds
 * + asserts a well-formed wire on testnet (SC2 = "tx wire is correct on testnet").
 *
 * ── Security / threat model (08-03 <threat_model>) ──────────────────────────────
 *   - T-08-03-01 (Tampering): `to` is ALWAYS a pinned @call-it/shared Sepolia address
 *     (FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA / CHALLENGE_ESCROW_ARBITRUM_SEPOLIA),
 *     NEVER echoed from a request param; `data` is built by encodeFunctionData against
 *     a const ABI with a fixed functionName — no arbitrary fn/args/to.
 *   - T-08-03-02 (Tampering/DoS): callId is validated with BigInt and rejects 0/non-numeric
 *     BEFORE any calldata build (replicates /og/[callId]/route.ts guard).
 *   - T-08-03-04 (Tampering): Follow/Fade amount is HARDCODED MIN_POSITION_USDC ($1);
 *     it is NEVER read from the (untrusted) Frame POST body. Larger stakes go to the
 *     deep-link, not the Frame (D-07).
 *   - T-08-03-05 (Elevation of Privilege): NO server-side signer / private key here.
 *     The route returns calldata ONLY; the user's Warpcast wallet signs + broadcasts.
 *   - T-08-03-06 (Spoofing): deep-link targets are built from NEXT_PUBLIC_OG_BASE_URL
 *     + a fixed path — origin-locked, no open redirect.
 *   - T-08-03-07 (accept, documented): a single Frame eth_sendTransaction cannot
 *     approve+act atomically — see the USDC-allowance policy note below (Pitfall 3).
 *
 * Requirements: SHARE-19 (SC2).
 */

export const runtime = 'nodejs';

import { encodeFunctionData } from 'viem';
import {
  FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA,
  CHALLENGE_ESCROW_ARBITRUM_SEPOLIA,
} from '@call-it/shared';
import { followFadeMarketAbi } from '@/lib/abis/FollowFadeMarket';
import { challengeEscrowAbi } from '@/lib/abis/ChallengeEscrow';
import {
  buttonsForStatus,
  type FarcasterCallStatus,
  type FarcasterButton,
} from '@/lib/farcaster-fixtures';

// ── Hardcoded one-tap amounts (NEVER read from the request body — T-08-03-04) ────

/**
 * Fixed minimum follow/fade stake = $1.00 in 6-dp USDC base units (D-07).
 * One-tap Follow/Fade always stake exactly this; larger stakes route to the
 * deep-link where the full in-app flow runs. Mirrors
 * lib/farcaster-fixtures.ts MIN_FOLLOW_STAKE_USDC_6DP.
 */
const MIN_POSITION_USDC = 1_000_000n;

/**
 * Fixed minimum challenge stake = $5.00 in 6-dp USDC base units.
 * proposeChallenge.stake is uint96; 5_000_000 fits comfortably (matches the
 * Foundry gate / ChallengeFormModal CHALLENGE_MIN_STAKE_USDC).
 */
const MIN_STAKE_USDC = 5_000_000n;

// ── USDC-allowance one-tap policy (Pitfall 3 — accepted, documented; T-08-03-07) ──
//
// A single Frame `eth_sendTransaction` CANNOT do approve+action atomically. The
// one-tap Follow/Fade/Challenge tx ASSUMES the connected Warpcast wallet already has
// sufficient USDC allowance to the spender (FollowFadeMarket / ChallengeEscrow). This
// v1 testnet path does NOT attempt a permit or a two-tap approve flow — those are the
// deep-link in-app flow's job (ChallengeFormModal.tsx / call page do the two-step
// approve->act, surfacing InsufficientUsdcAllowance). A user without allowance should
// use the 'Open in Call It' deep-link. We do NOT silently emit a tx that reverts
// without this documented assumption; if the assumption fails the tx simply reverts
// client-side with no fund loss (the user's wallet signs, not us — T-08-03-05).

// ── Wire types ──────────────────────────────────────────────────────────────────

const CHAIN_ID = 'eip155:421614' as const; // Arbitrum Sepolia (CAIP-2); mainnet 42161 = Phase 10

interface TxWire {
  chainId: typeof CHAIN_ID;
  method: 'eth_sendTransaction';
  params: {
    abi: unknown;
    to: string;
    data: `0x${string}`;
    value: string;
  };
}

interface DeepLinkWire {
  type: 'deep-link';
  url: string;
}

// ── Status read (fail-safe — defaults to 'Live' on any error, PATTERNS / D-02) ────

const VALID_STATUSES: readonly FarcasterCallStatus[] = [
  'Live',
  'Settled',
  'Disputed',
  'CallerExited',
];

async function readStatus(callIdStr: string): Promise<FarcasterCallStatus> {
  try {
    // Same env-var convention as call/[id]/layout.tsx (the live-state source of truth):
    // RELAYER_URL (prod) ?? NEXT_PUBLIC_RELAYER_URL (local). Do NOT invent a new var.
    const relayerUrl =
      process.env['RELAYER_URL'] ?? process.env['NEXT_PUBLIC_RELAYER_URL'] ?? '';
    if (!relayerUrl) return 'Live';

    const res = await fetch(`${relayerUrl}/api/calls/${callIdStr}/live-state`, {
      // revalidate:4 — status-aware buttons want fresh status (RESEARCH); matches the
      // relayer live-state 4s cache TTL.
      next: { revalidate: 4 },
    });
    if (!res.ok) return 'Live';

    const data = (await res.json()) as { status?: string };
    const status = data.status as FarcasterCallStatus | undefined;
    return status && VALID_STATUSES.includes(status) ? status : 'Live';
  } catch {
    // Fail-safe: relayer unreachable / parse error → assume Live (most-permissive
    // button set; the tx still targets the real contract which enforces real state).
    return 'Live';
  }
}

// ── Which button was tapped ───────────────────────────────────────────────────────
//
// The Frame POST body is UNTRUSTED — we read it ONLY to learn which of the displayed
// buttons the user tapped (a small index), NEVER for the amount or the `to` address.
// A `?action=` query param overrides for debugging/clients that don't send buttonIndex.

function buttonIndexFromBody(body: unknown): number {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    const direct = b['buttonIndex'];
    if (typeof direct === 'number' && direct >= 1) return direct;
    const untrusted = b['untrustedData'];
    if (untrusted && typeof untrusted === 'object') {
      const u = untrusted as Record<string, unknown>;
      if (typeof u['buttonIndex'] === 'number' && (u['buttonIndex'] as number) >= 1) {
        return u['buttonIndex'] as number;
      }
    }
  }
  return 1; // default to the first button
}

function selectButton(
  buttons: readonly FarcasterButton[],
  req: Request,
  body: unknown,
): FarcasterButton {
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  if (action) {
    const match = buttons.find((b) => b.toLowerCase() === action.toLowerCase());
    if (match) return match;
  }
  const idx = buttonIndexFromBody(body); // 1-based
  return buttons[idx - 1] ?? buttons[0]!;
}

// ── Response builders ─────────────────────────────────────────────────────────────

function txResponse(wire: TxWire): Response {
  return new Response(JSON.stringify(wire), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      // Per-user tx-construction wire — never cache (it is shaped by the tapped button).
      'cache-control': 'no-store',
    },
  });
}

function deepLinkResponse(url: string): Response {
  const wire: DeepLinkWire = { type: 'deep-link', url };
  return new Response(JSON.stringify(wire), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

// ── Handler ───────────────────────────────────────────────────────────────────────

async function handle(
  req: Request,
  params: Promise<{ callId: string }>,
): Promise<Response> {
  const { callId: callIdStr } = await params;

  // Step 1 — validate callId (replicates the /og/[callId]/route.ts guard, T-08-03-02).
  // Reject 0 / non-numeric BEFORE any calldata build.
  let id: bigint;
  try {
    id = BigInt(callIdStr);
    if (id === 0n) throw new Error('callId 0 is burned');
  } catch {
    return new Response('invalid callId', { status: 400 });
  }

  // Read the (untrusted) body once — used ONLY for the tapped-button index.
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  // Step 2 — status read (fail-safe) → button triplet (single-source fixtures table).
  const status = await readStatus(callIdStr);
  const settled =
    status === 'Settled' || status === 'Disputed' || status === 'CallerExited';
  const buttons = buttonsForStatus(status); // D-02 live / D-06 settled
  const tapped = selectButton(buttons, req, body);

  // Origin-locked deep-link base (T-08-03-06).
  const base = process.env['NEXT_PUBLIC_OG_BASE_URL'] ?? '';

  // Step 3 — build the response per action. `to` is ALWAYS a pinned import.
  switch (tapped) {
    case 'Follow': {
      if (settled) {
        // D-06a: settled-cast Follow is an off-chain follow-graph action (no contract
        // fn) — route to the deep-link, NOT one-tap calldata. The in-frame on-chain-less
        // social-follow SPA is a Phase-10 enhancement (D-06a / D-01).
        return deepLinkResponse(`${base}/call/${callIdStr}`);
      }
      // Live Follow → fixed min-$1 one-tap (D-07). amountIn=MIN_POSITION_USDC,
      // minSharesOut=0 (no slippage floor for the $1 one-tap). HARDCODED amount —
      // never read from the POST body (T-08-03-04).
      const data = encodeFunctionData({
        abi: followFadeMarketAbi,
        functionName: 'follow',
        args: [id, MIN_POSITION_USDC, 0n],
      });
      return txResponse({
        chainId: CHAIN_ID,
        method: 'eth_sendTransaction',
        params: {
          abi: followFadeMarketAbi,
          to: FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA,
          data,
          value: '0',
        },
      });
    }

    case 'Fade': {
      // Fade only appears in the Live triplet; build the symmetric one-tap fade.
      const data = encodeFunctionData({
        abi: followFadeMarketAbi,
        functionName: 'fade',
        args: [id, MIN_POSITION_USDC, 0n],
      });
      return txResponse({
        chainId: CHAIN_ID,
        method: 'eth_sendTransaction',
        params: {
          abi: followFadeMarketAbi,
          to: FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA,
          data,
          value: '0',
        },
      });
    }

    case 'Challenge': {
      // Challenge (live OR settled) → proposeChallenge(callId, MIN_STAKE_USDC).
      const data = encodeFunctionData({
        abi: challengeEscrowAbi,
        functionName: 'proposeChallenge',
        args: [id, MIN_STAKE_USDC],
      });
      return txResponse({
        chainId: CHAIN_ID,
        method: 'eth_sendTransaction',
        params: {
          abi: challengeEscrowAbi,
          to: CHALLENGE_ESCROW_ARBITRUM_SEPOLIA,
          data,
          value: '0',
        },
      });
    }

    case 'Quote': {
      // D-06a: Quote = createCall (~$15, 12 params) — NOT a one-tap. Deep-link to the
      // new-call composer pre-seeded with the parent callId.
      return deepLinkResponse(`${base}/new?parent=${callIdStr}`);
    }

    default: {
      // Unreachable given the fixtures table, but fail closed to a deep-link.
      return deepLinkResponse(`${base}/call/${callIdStr}`);
    }
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ callId: string }> },
): Promise<Response> {
  return handle(req, params);
}

// GET is provided for debugging / clients that issue a GET probe; same logic.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ callId: string }> },
): Promise<Response> {
  return handle(req, params);
}
