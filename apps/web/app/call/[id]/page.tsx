/**
 * /call/[id] — Live + Settled Receipt Page
 *
 * Phase 2 + Phase 3 (Plan 03-06) additions:
 *   - Sticky caller header with CALLER EXITED amber banner (SOCIAL-25)
 *   - THE CALL hero (market line, conviction bar, criteria badge)
 *   - 4-stat row (current spread, time left, stake, conviction)
 *   - MarketPositioningBar (live followReserve/fadeReserve — D-07)
 *   - 3 action buttons (Follow / Fade / Challenge orange-outline — Phase 3 activated)
 *   - REASONING block + optional collapsible RESOLUTION CRITERIA
 *   - Two-column: ActivityFeed (left) + QuoteCallsColumn (right)
 *   - Caller-specific exit controls after 24h lock (SOCIAL-49)
 *   - Position-holder exit controls after 4h cooldown (SOCIAL-50)
 *   - [Phase 3] Pending challenge notification block (Surface 7, challenge_proposed)
 *   - [Phase 3] Caller-only accept/reject + USDC preflight (T-3-06-06)
 *   - [Phase 3] ChallengeFormModal integrated on Challenge button click
 *
 * Phase 4 (Plan 04-07) additions:
 *   - Settled Receipt branch: 96px Syne outcome word, Stamp animation, FINAL POSITIONS
 *   - Disputed branch: PENDING DISPUTE block (amber border, §15.7 amber heading)
 *   - CallerExited settled branch: amber banner + dimmed caller subline
 *   - getOutcomeWord(): D-08 thresholds; D-09 viewerIsWinningFader guard
 *   - Provenance line: "SETTLED FROM {oracleHost} at {timestamp} UTC · view oracle proof ↗"
 *   - FINAL POSITIONS: flex-direction:row (NOT grid), two columns capped 20/side, sorted P&L desc
 *
 * Phase 4 (Plan 04-08) additions:
 *   - DisputeModal: amber neobrutalist modal, IPFS evidence upload via Pinata,
 *     $5 USDC bond preflight (inline approve), raiseDispute writeContract (D-06)
 *   - ProvenanceModal: accent neobrutalist modal, oracle URL + chain-correct
 *     explorer tx link (EXPLORER_BASE_URL — WR-05), path-aware raw oracle data
 *     per oracle.type (Pyth=price+conf+publishTime, attestation paths=payload
 *     JSON, CEX=announcement), EIP-712 sig truncated with the ACTIVE chainId
 *     label, copy-to-clipboard (D-10, SETTLE-52)
 *   - Dispute CTA: "Dispute this settlement" shown when status==Settled + within 24h window
 *   - Dispute window / MAX_COUNTER_CLAIMS enforcement
 *
 * callerMatchingStake = min(callerInputStake, challengerStake) — Issue #1 fix (SOCIAL-31)
 * NOT min(challengerStake, challengerStake) — that was the copy-paste bug in the plan.
 *
 * D-09 CRITICAL: viewerIsWinningFader=false when wallet disconnected — public viewers NEVER
 * see 'FADED CORRECTLY'. Guard requires: authenticated AND account.address AND fade position.
 *
 * LIVE STATE: useReadContracts with 5s refetchInterval (D-07) reads 8 values from FFM.
 * No inline contract addresses — imports FOLLOW_FADE_MARKET + CHALLENGE_ESCROW constants.
 * FLEXBOX ONLY — no CSS grid (Pitfall 15).
 * AUTH-44: wallet address never rendered — only handle.
 *
 * Requirements: SOCIAL-05..08, SOCIAL-10..13, SOCIAL-17..19, SOCIAL-22..23,
 *               SOCIAL-25, SOCIAL-30, SOCIAL-34, SOCIAL-44..45, SOCIAL-49..50, UI-06..07, UI-11,
 *               UI-14, UI-15, UI-16, UI-17, UI-18, UI-19, UI-20, UI-21, UI-22, UI-23, UI-44, UI-45
 * Spec: §15.3 Live Receipt + §15.5 challenge pending block + §15.7 Settled Receipt
 * Threat: T-02-08-03 (AUTH-44), T-3-06-06 (USDC allowance preflight),
 *         T-04-07-05 (D-09 fader guard), T-04-07-03 (CONTRARIAN HIT color)
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount, useReadContracts, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
// quick-260611-fo1: wagmi/actions (NOT hooks) — callable inside useCallback for the
// follow/fade USDC allowance preflight, mirroring usePublishCall.ts.
import { readContract, waitForTransactionReceipt } from 'wagmi/actions';
import { wagmiConfig } from '@/lib/wagmi';
import Link from 'next/link';
import {
  FollowFadeModal,
  CallerExitModal,
  PositionExitModal,
  Stamp,
  avatarInitial,
} from '@call-it/ui';
import { normalizeCallStatus, type CallStatus } from '@/lib/relayer-client';
import {
  ACTIVE_CHAIN_ID,
  EXPLORER_BASE_URL,
  FOLLOW_FADE_MARKET_ADDRESS,
  CHALLENGE_ESCROW_ADDRESS,
  SETTLEMENT_MANAGER_ADDRESS,
  USDC_ADDRESS,
} from '@/lib/chain';
import { ensureActiveChain } from '@/lib/ensure-chain';
import { getOutcomeWordResult, resolveSettledWord, SETTLED_NEUTRAL_WORD } from '@/lib/outcome-word';
import { followFadeMarketAbi } from '@/lib/abis';
import {
  computeCallerExitPenaltyPct,
  computeCallerExitRepDelta,
  POSITION_EXIT_PENALTY_PCT,
  CALLER_EXIT_LOCK_DURATION,
  POSITION_EXIT_COOLDOWN,
} from '@call-it/shared';
import { warpcastComposeUrl, twitterIntentUrl, buildShareText } from '@call-it/shared';
import { ChallengeFormModal } from '@/app/components/ChallengeFormModal';
import { useIsMobile } from '@/app/hooks/useIsMobile';
// B5 (quick-260611-5mh): real wallet balance for the FollowFadeModal
// insufficient-balance gate (Sepolia-correct after the RC1 chain sweep).
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
// MiniAppReady (08-06, UAT 08 GAP 2): calls sdk.actions.ready() once after mount so the
// Farcaster Mini App host dismisses the splash and reveals this receipt (no blank page).
// Mounted on EVERY render branch below (loading / settled / live). Fail-safe outside a host.
// SCOPE (D-01, Phase-10): this only makes the Mini App RENDER the read-only receipt + ready();
// in-app tap-to-transact on mainnet 42161 stays Phase 10. Interactive controls stay wallet-gated.
import MiniAppReady from './MiniAppReady';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Call metadata from the relayer (subgraph-sourced). */
type CallData = {
  id: bigint;
  caller: string; // wallet address — only for internal logic, NEVER rendered (AUTH-44)
  handle: string; // display handle, e.g. "@veda"
  marketLine: string; // e.g. "BTC >= $120k by Jun 30"
  category: string;
  stake: bigint; // 6-decimal USDC
  conviction: number; // 1-100
  expiry: bigint; // unix timestamp seconds
  createdAt: bigint; // unix timestamp seconds
  reasoning: string;
  criteriaText?: string;
  criteriaHash?: string;
  /** Canonical lowercase status — normalized ONCE in fetchCallData (C1). */
  status: CallStatus;
  repScore: number;
  callerExitedAt?: bigint;
  callerExitedPenalty?: bigint;
  openToChallenges?: boolean;
  // Phase 4 settlement fields (from SettlementManager subgraph + relayer)
  outcome?: 'CallerWon' | 'CallerLost' | 'Pending';
  repDelta?: number;       // rep delta at settlement (for outcome word D-08 thresholds)
  fadeRealShare?: number;  // fade share of real pool at settlement (for CONTRARIAN HIT)
  settledAt?: bigint;      // unix timestamp of settlement
  oracleHost?: string;     // e.g. "pyth.network", "defillama.com"
  oracleTxHash?: string;   // settlement tx hash for provenance link
  finalValue?: string;     // oracle price at settlement (display string)
  targetValue?: string;    // the call's target value (display string)
  pnl?: bigint;            // caller P&L in USDC (6 decimal)
};

/** Final position entry (follower or fader) for the FINAL POSITIONS block */
type FinalPosition = {
  handle: string;       // display handle — NEVER wallet address (AUTH-44)
  side: 'follow' | 'fade';
  /**
   * P&L in USDC (6 decimal) — can be negative. `null` when the relayer omits
   * pnl (PLAN-01 D-07: unknown pnl is OMITTED, never a fake zero) — such
   * entries render in a neutral FINAL POSITIONS list, not WINNERS/LOSERS.
   */
  pnl: bigint | null;
  stake: bigint;        // position size in USDC
};

/** Activity feed entry */
type ActivityEntry = {
  id: string;
  handle: string;
  action: 'followed' | 'faded' | 'exited' | 'caller_exited';
  amountUsdc: bigint;
  timestamp: number;
};

/** Quote-call entry */
type QuoteEntry = {
  id: bigint;
  handle: string;
  marketLine: string;
  stance: 'following' | 'fading';
  timestamp: number;
};

/** Pending challenge notification (Surface 7, challenge_proposed) */
type PendingChallenge = {
  challengeId: bigint;
  challengerHandle: string;
  challengerStake: bigint;
  proposedAt: bigint;
};

// ─── Provenance types (Phase 4 D-10, SETTLE-52) ──────────────────────────────

type OracleType = 'pyth' | 'nft-twap' | 'defillama' | 'rpc-metrics' | 'snapshot' | 'tally' | 'cex';

type RawOracleData =
  | { pythPrice: string; pythConf: string; pythPublishTime: string }
  | { attestationPayload: string; evidenceHash?: string; observationCount?: number }
  | { attestationPayload: string }
  | { announcementTitle: string; announcementUrl: string; scrapedAt: string }
  | null;

type ProvenanceData = {
  oracle: { type: OracleType; url: string; host: string; feedId?: string };
  txHash: string;
  settledAt: number | null;
  rawOracleData: RawOracleData;
  /** EIP-712 relayer signature (bound to the ACTIVE chain — Pitfall 7) */
  relayerSignature: string;
  /** WR-05: the active deploy chain (ACTIVE_CHAIN_ID), never hardcoded 42161. */
  chainId: number;
};

// ─── Dispute constants (SETTLE-26/27/28) ─────────────────────────────────────

/** Dispute bond in USDC micro-units ($5) */
const DISPUTE_BOND_USDC = 5_000_000n;

/** Dispute window in seconds (24h) */
const DISPUTE_WINDOW_SECONDS = 86_400n;

/** Max counter-claims per call (SETTLE-30) */
const MAX_COUNTER_CLAIMS = 3;

// ─── Settlement Manager ABI slice (raiseDispute) ─────────────────────────────

const SM_ABI = [
  {
    type: 'function',
    name: 'raiseDispute',
    inputs: [
      { name: 'callId', type: 'uint256' },
      { name: 'evidenceHash', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * wagmi/actions take the typed wagmiConfig as their first argument, so the
 * `chainId` param is narrowed to the config's chain-id union. ACTIVE_CHAIN_ID
 * is declared `number` in @/lib/chain — narrow it here (mirrors usePublishCall.ts).
 */
type ActiveChainId = (typeof wagmiConfig)['chains'][number]['id'];

/** FFM contract address — chain-selected via @/lib/chain, never inlined */
const FFM_ADDR = FOLLOW_FADE_MARKET_ADDRESS;

/** ChallengeEscrow address — chain-selected via @/lib/chain (T-3-06-05) */
const CE_ADDR = CHALLENGE_ESCROW_ADDRESS;

/** SettlementManager address — chain-selected via @/lib/chain (Phase 4) */
const SM_ADDR = SETTLEMENT_MANAGER_ADDRESS;

/** USDC token — chain-selected via @/lib/chain (RC1: was hardcoded MAINNET USDC).
 *  IN-05: ultimately sourced from @call-it/shared constants — never inline hex. */
const USDC_ADDR = USDC_ADDRESS;

const RELAYER_URL = process.env['NEXT_PUBLIC_RELAYER_URL'] ?? '';

// ─── ChallengeEscrow ABI slices ───────────────────────────────────────────────

const CE_ABI = [
  {
    type: 'function',
    name: 'acceptChallenge',
    inputs: [{ name: 'challengeId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'rejectChallenge',
    inputs: [{ name: 'challengeId', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

const USDC_ALLOWANCE_ABI = [
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const;

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatUsdc(amount: bigint): string {
  return `$${(Number(amount) / 1_000_000).toFixed(2)}`;
}

/** Truncated 0x display alias (AUTH-44-safe fallback when no handle exists). */
function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * C4: oracle/target values are 1e8-scale on-chain (SettlementManager canonical
 * scale; consistent with the PLAN-02 composer fix — NOT 1e6). Renders
 * "$1,000,000.00" from "100000000000000". Non-numeric input passes through
 * unchanged (older relayer deploys may send pre-formatted display strings).
 */
function formatTarget1e8(raw: string): string {
  if (!/^-?\d+$/.test(raw.trim())) return raw;
  try {
    const n = Number(BigInt(raw.trim())) / 1e8;
    if (!Number.isFinite(n)) return raw;
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } catch {
    return raw;
  }
}

/**
 * C4: criteriaHash sentinel — calls created without real resolution criteria
 * carry this placeholder hash on-chain (call #14's criteriaHash is literally
 * this value). It must NEVER light up the VERIFIED CRITERIA badge.
 */
const CRITERIA_HASH_SENTINEL =
  '0x0000000000000000000000000000000000000000000000000000000000000001';

function formatTimeLeft(expiry: bigint): string {
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  if (nowSec >= expiry) return 'Expired';
  const diff = Number(expiry - nowSec);
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp * 1000;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

// ─── Relayer fetch helpers ────────────────────────────────────────────────────

async function fetchCallData(callId: string): Promise<CallData | null> {
  if (!RELAYER_URL) return null;
  try {
    const res = await fetch(`${RELAYER_URL}/api/calls/${callId}/live-state`);
    if (!res.ok) return null;
    const raw = await res.json() as Record<string, unknown>;
    const caller = String(raw['caller'] ?? '');
    // C3: handle fallback is a truncated address alias (AUTH-44-safe), never
    // a "call #14" pseudo-handle that reads like an @mention downstream.
    const handle = raw['handle']
      ? String(raw['handle'])
      : caller
        ? truncateAddress(caller)
        : `#${callId}`;
    // C3: marketLine → stored statement → '' (display layer falls back to
    // 'Open Call' — never bare "Call").
    const marketLine = String(raw['marketLine'] ?? raw['statement'] ?? '').trim();
    return {
      id: BigInt(raw['id'] as string ?? callId),
      caller,
      handle,
      marketLine,
      category: String(raw['category'] ?? 'Majors'),
      stake: BigInt(String(raw['stake'] ?? '0')),
      conviction: Number(raw['conviction'] ?? 50),
      expiry: BigInt(String(raw['expiry'] ?? '0')),
      createdAt: BigInt(String(raw['createdAt'] ?? '0')),
      reasoning: String(raw['reasoning'] ?? ''),
      criteriaText: raw['criteriaText'] ? String(raw['criteriaText']) : undefined,
      criteriaHash: raw['criteriaHash'] ? String(raw['criteriaHash']) : undefined,
      // C1: normalize the TitleCase wire status ONCE at this parse boundary.
      status: normalizeCallStatus(raw['status']),
      repScore: Number(raw['repScore'] ?? 0),
      callerExitedAt: raw['callerExitedAt'] ? BigInt(String(raw['callerExitedAt'])) : undefined,
      callerExitedPenalty: raw['callerExitedPenalty'] ? BigInt(String(raw['callerExitedPenalty'])) : undefined,
      openToChallenges: raw['openToChallenges'] !== undefined ? Boolean(raw['openToChallenges']) : true,
      // Phase 4 settlement fields
      outcome: raw['outcome'] as CallData['outcome'] ?? undefined,
      repDelta: raw['repDelta'] !== undefined ? Number(raw['repDelta']) : undefined,
      fadeRealShare: raw['fadeRealShare'] !== undefined ? Number(raw['fadeRealShare']) : undefined,
      settledAt: raw['settledAt'] ? BigInt(String(raw['settledAt'])) : undefined,
      oracleHost: raw['oracleHost'] ? String(raw['oracleHost']) : undefined,
      oracleTxHash: raw['oracleTxHash'] ? String(raw['oracleTxHash']) : undefined,
      finalValue: raw['finalValue'] ? String(raw['finalValue']) : undefined,
      targetValue: raw['targetValue'] ? String(raw['targetValue']) : undefined,
      pnl: raw['pnl'] ? BigInt(String(raw['pnl'])) : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch FINAL POSITIONS from GET /api/calls/:id/positions (PLAN-01 A5).
 * The body is a BARE JSON ARRAY sorted stake desc; `pnl` is OMITTED when
 * unknown (D-07) → kept as null here so the UI never fakes a $0.00 P&L.
 * Empty / failure → [] → the section degrades to hidden (D-07).
 */
async function fetchFinalPositions(callId: string): Promise<FinalPosition[]> {
  if (!RELAYER_URL) return [];
  try {
    const res = await fetch(`${RELAYER_URL}/api/calls/${callId}/positions`);
    if (!res.ok) return [];
    const raw = await res.json() as unknown[];
    if (!Array.isArray(raw)) return [];
    return (raw as Record<string, unknown>[]).map((e) => ({
      handle: String(e['handle'] ?? ''),
      side: (e['side'] as FinalPosition['side']) ?? 'follow',
      pnl: e['pnl'] !== undefined && e['pnl'] !== null ? BigInt(String(e['pnl'])) : null,
      stake: BigInt(String(e['stake'] ?? '0')),
    }));
  } catch {
    return [];
  }
}

async function fetchActivityFeed(callId: string): Promise<ActivityEntry[]> {
  if (!RELAYER_URL) return [];
  try {
    const res = await fetch(`${RELAYER_URL}/api/feed?callId=${callId}`);
    if (!res.ok) return [];
    const raw = await res.json() as unknown[];
    return (raw).map((e) => {
      const entry = e as Record<string, unknown>;
      return {
        id: String(entry['id'] ?? Math.random()),
        handle: String(entry['handle'] ?? ''),
        action: (entry['action'] as ActivityEntry['action']) ?? 'followed',
        amountUsdc: BigInt(String(entry['amountUsdc'] ?? '0')),
        timestamp: Number(entry['timestamp'] ?? 0),
      };
    });
  } catch {
    return [];
  }
}

async function fetchQuoteCalls(callId: string): Promise<QuoteEntry[]> {
  if (!RELAYER_URL) return [];
  try {
    // WR-04: query by parentCallId (list mode) — returns a JSON ARRAY of
    // quote-call entries for this call, matching the .map() below. The old
    // ?quoteCallId= path returns a single { stance } object that broke .map().
    const res = await fetch(`${RELAYER_URL}/api/calls/quote-stance?parentCallId=${callId}`);
    if (!res.ok) return [];
    const raw = await res.json() as unknown[];
    return (raw).map((e) => {
      const entry = e as Record<string, unknown>;
      return {
        id: BigInt(String(entry['id'] ?? '0')),
        handle: String(entry['handle'] ?? ''),
        marketLine: String(entry['marketLine'] ?? ''),
        stance: (entry['stance'] as QuoteEntry['stance']) ?? 'following',
        timestamp: Number(entry['timestamp'] ?? 0),
      };
    });
  } catch {
    return [];
  }
}

/**
 * Result of the provenance fetch — C4: a failed fetch must NEVER be a silent
 * no-op. The error string is surfaced inline in the ProvenanceModal with a
 * retry affordance instead of leaving silent em-dashes.
 */
type ProvenanceFetchResult =
  | { ok: true; data: ProvenanceData }
  | { ok: false; error: string };

/** Fetch settlement provenance from relayer (D-10, SETTLE-52). Bounded at 8s. */
async function fetchProvenanceData(callId: string): Promise<ProvenanceFetchResult> {
  if (!RELAYER_URL) {
    return { ok: false, error: 'Relayer not configured — oracle proof unavailable.' };
  }
  try {
    // C4: bounded fetch — a stalled relayer previously hung this request
    // forever with zero feedback (the live "dead button" failure mode).
    const res = await fetch(`${RELAYER_URL}/api/settle/${callId}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      return { ok: false, error: `Couldn't load the oracle proof (HTTP ${res.status}). Retry.` };
    }
    const raw = await res.json() as Record<string, unknown>;
    return {
      ok: true,
      data: {
        oracle: {
          type: ((raw['oracle'] as Record<string, unknown>)?.['type'] ?? 'pyth') as OracleType,
          url: String((raw['oracle'] as Record<string, unknown>)?.['url'] ?? ''),
          host: String((raw['oracle'] as Record<string, unknown>)?.['host'] ?? ''),
          feedId: (raw['oracle'] as Record<string, unknown>)?.['feedId'] as string | undefined,
        },
        txHash: String(raw['txHash'] ?? ''),
        settledAt: raw['settledAt'] ? Number(raw['settledAt']) : null,
        rawOracleData: (raw['rawOracleData'] as RawOracleData) ?? null,
        relayerSignature: String(raw['relayerSignature'] ?? ''),
        // WR-05: the provenance is bound to the ACTIVE deploy chain — the old
        // hardcoded 42161 mislabeled every Sepolia settlement.
        chainId: ACTIVE_CHAIN_ID,
      },
    };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    return {
      ok: false,
      error: timedOut
        ? "The oracle-proof request timed out. The relayer may be busy — retry."
        : "Couldn't reach the relayer for the oracle proof. Retry.",
    };
  }
}

/**
 * Fetch pending challenge for this call from the relayer notifications endpoint.
 * Returns the first challenge_proposed notification for this callId, if any.
 */
async function fetchPendingChallenge(
  callId: string,
  userAddress: string | undefined,
): Promise<PendingChallenge | null> {
  if (!RELAYER_URL || !userAddress) return null;
  try {
    const res = await fetch(
      `${RELAYER_URL}/api/notifications?callId=${callId}&type=challenge_proposed`,
    );
    if (!res.ok) return null;
    // Wire shape: { notifications: [{ payload: { challengeId }, createdAt, ... }] }
    const raw = await res.json() as Record<string, unknown>;
    const list = Array.isArray(raw['notifications'])
      ? (raw['notifications'] as Record<string, unknown>[])
      : [];
    if (list.length === 0) return null;
    const payload = (list[0]?.['payload'] ?? {}) as Record<string, unknown>;
    const challengeIdStr = String(payload['challengeId'] ?? '');
    if (!/^\d+$/.test(challengeIdStr)) return null;
    // The notification payload only carries challengeId — hydrate stake/handle
    // from duel live-state. The accept flow needs the REAL matching stake, so a
    // failed hydration hides the banner rather than rendering wrong numbers (D-07).
    const duelRes = await fetch(`${RELAYER_URL}/api/duels/${challengeIdStr}/live-state`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!duelRes.ok) return null;
    const duel = await duelRes.json() as Record<string, unknown>;
    const challengerStakeStr = String(duel['challengerStake'] ?? '');
    if (!/^\d+$/.test(challengerStakeStr) || challengerStakeStr === '0') return null;
    const proposedAtStr = String(duel['proposedAt'] ?? '0');
    return {
      challengeId: BigInt(challengeIdStr),
      challengerHandle: String(duel['challengerHandle'] ?? 'challenger'),
      challengerStake: BigInt(challengerStakeStr),
      proposedAt: /^\d+$/.test(proposedAtStr) ? BigInt(proposedAtStr) : 0n,
    };
  } catch {
    return null;
  }
}

// ─── DisputeModal (D-06, SETTLE-25..32) ──────────────────────────────────────

type DisputeModalProps = {
  open: boolean;
  onClose: () => void;
  callId: bigint;
  outcomeWord: string;
  smAddr: `0x${string}`;
  usdcAddr: `0x${string}`;
  relayerUrl: string;
};

function DisputeModal({ open, onClose, callId, outcomeWord, smAddr, usdcAddr, relayerUrl }: DisputeModalProps) {
  const isMobile = useIsMobile(); // Phase 9 (09-03): clamp panel + stack action row at 375px (D-04)
  const { address: userAddress } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceCid, setEvidenceCid] = useState<string | null>(null);
  const [evidenceHash, setEvidenceHash] = useState<`0x${string}` | null>(null);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [note, setNote] = useState('');
  const [approveTxHash, setApproveTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [disputeTxHash, setDisputeTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [isApproving, setIsApproving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{ text: string; isError: boolean } | null>(null);

  const userAddr = (userAddress as `0x${string}` | undefined) ?? '0x0000000000000000000000000000000000000000' as `0x${string}`;
  const isSmZero = smAddr === '0x0000000000000000000000000000000000000000';

  // USDC allowance check for $5 bond (SETTLE-26)
  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    address: usdcAddr,
    chainId: ACTIVE_CHAIN_ID, // RC1: pin the read to the active chain
    abi: USDC_ALLOWANCE_ABI,
    functionName: 'allowance',
    args: [userAddr, smAddr],
    query: { enabled: open && !isSmZero && !!userAddress },
  });
  const currentAllowance = (allowanceData as bigint | undefined) ?? 0n;
  const needsApproval = !isSmZero && currentAllowance < DISPUTE_BOND_USDC;

  const { isLoading: approveConfirming, isSuccess: approveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveTxHash });
  const { isSuccess: disputeConfirmed } =
    useWaitForTransactionReceipt({ hash: disputeTxHash });

  useEffect(() => {
    if (approveConfirmed) {
      void refetchAllowance();
      setIsApproving(false);
    }
  }, [approveConfirmed, refetchAllowance]);

  useEffect(() => {
    if (disputeConfirmed) {
      setIsSubmitting(false);
      setToast({ text: 'Dispute filed — under owner review. Resolves within 24h.', isError: false });
      setTimeout(() => { setToast(null); onClose(); }, 3000);
    }
  }, [disputeConfirmed, onClose]);

  useEffect(() => {
    if (!open) {
      setEvidenceFile(null); setEvidenceCid(null); setEvidenceHash(null);
      setNote(''); setIsApproving(false); setIsSubmitting(false);
      setApproveTxHash(undefined); setDisputeTxHash(undefined); setToast(null);
    }
  }, [open]);

  // F-C12: a11y — Escape closes the dialog, inert while approve/dispute is in
  // flight (mirrors the backdrop-click semantics — never dismiss progress UI).
  const escInFlight = isApproving || approveConfirming || isSubmitting;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !escInFlight) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, escInFlight, onClose]);

  const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024; // WR-06: 5 MB cap

  const handleEvidenceUpload = async (file: File) => {
    setUploadingEvidence(true);
    try {
      // WR-06: FileReader.readAsDataURL avoids the btoa(String.fromCharCode(...spread))
      // RangeError stack overflow that aborted uploads of files a few hundred KB+.
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
      const res = await fetch(`${relayerUrl}/api/disputes/evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: base64, filename: file.name, mimeType: file.type }),
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const data = await res.json() as { cid: string; evidenceHash: string };
      setEvidenceCid(data.cid);
      setEvidenceHash(data.evidenceHash as `0x${string}`);
    } catch (err) {
      setToast({ text: err instanceof Error ? err.message : 'Upload failed', isError: true });
    } finally {
      setUploadingEvidence(false);
    }
  };

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      await ensureActiveChain();
      const hash = await writeContractAsync({
        chainId: ACTIVE_CHAIN_ID,
        address: usdcAddr,
        abi: USDC_ALLOWANCE_ABI,
        functionName: 'approve',
        args: [smAddr, DISPUTE_BOND_USDC],
      });
      setApproveTxHash(hash);
    } catch (err) {
      setToast({ text: err instanceof Error ? err.message : 'Approval failed', isError: true });
      setIsApproving(false);
    }
  };

  const handleRaiseDispute = async () => {
    if (!evidenceHash) return;
    setIsSubmitting(true);
    try {
      await ensureActiveChain();
      const hash = await writeContractAsync({
        chainId: ACTIVE_CHAIN_ID,
        address: smAddr,
        abi: SM_ABI,
        functionName: 'raiseDispute',
        args: [callId, evidenceHash],
      });
      setDisputeTxHash(hash);
    } catch (err) {
      setToast({ text: err instanceof Error ? err.message : 'Dispute failed', isError: true });
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  const canSubmit = !!evidenceHash && !needsApproval && !isSubmitting && !isApproving && !approveConfirming && !isSmZero;

  return (
    <div
      // .modal-overlay template (D-13): rgba(0,0,0,0.82) scrim + blur(4px), z-200
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {toast && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', zIndex: 300,
          background: 'var(--bg-secondary)',
          borderLeft: `4px solid ${toast.isError ? 'var(--accent-loss)' : 'var(--accent-warning)'}`,
          padding: '14px 18px', fontFamily: 'var(--font-mono)', fontSize: '13px',
          color: 'var(--text-primary)', maxWidth: '340px',
        }}>
          {toast.text}
        </div>
      )}
      {/* .modal-panel template (D-13): cream var(--bg-inverse), BLACK text,
          3px black border, brutal shadow — every text token inside is inverse */}
      <div role="dialog" aria-modal="true" aria-labelledby="dispute-modal-title" style={{
        background: 'var(--bg-inverse)',
        color: '#000',
        border: '3px solid #000',
        boxShadow: 'var(--shadow-brutal-lg)',
        maxWidth: '620px',
        width: '100%',
        padding: isMobile ? '24px' : '36px',
        position: 'relative',
        maxHeight: '90vh',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}>
        {/* Header — FINAL · CONFIRM mono voice + close */}
        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h2 id="dispute-modal-title" style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: '#000', letterSpacing: '0.14em', textTransform: 'uppercase', margin: 0 }}>
            RAISE DISPUTE
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(0,0,0,0.55)', fontSize: '20px', padding: '4px', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {/* Currently settled — read-only */}
        <div style={{ border: '2px solid #000', background: 'rgba(0,0,0,0.04)', padding: '10px 14px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'rgba(0,0,0,0.55)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '4px' }}>
            Currently settled:
          </div>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 800, color: '#000', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
            {outcomeWord}
          </span>
        </div>

        {/* YOUR EVIDENCE upload — handler + 5 MB validation unchanged (WR-06) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            YOUR EVIDENCE
          </label>
          <input
            type="file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              // WR-06: reject oversized evidence before upload.
              if (file.size > MAX_EVIDENCE_BYTES) {
                setToast({ text: 'Evidence file too large — max 5 MB', isError: true });
                return;
              }
              setEvidenceFile(file);
              void handleEvidenceUpload(file);
            }}
            style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'rgba(0,0,0,0.7)', cursor: 'pointer' }}
          />
          {uploadingEvidence && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'rgba(0,0,0,0.6)' }}>Uploading to IPFS…</span>
          )}
          {evidenceCid && !uploadingEvidence && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#000', fontWeight: 700 }}>
              evidence pinned ✓ — {evidenceCid.slice(0, 16)}…
            </span>
          )}
          {!evidenceFile && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'rgba(0,0,0,0.55)' }}>
              Evidence required before you can submit.
            </span>
          )}
        </div>

        {/* WHAT'S WRONG — optional note */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            WHAT&apos;S WRONG (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            style={{
              fontFamily: 'var(--font-sans)', fontSize: '14px', color: '#000',
              background: 'rgba(255,255,255,0.55)', border: '2px solid #000', borderRadius: 0,
              padding: '10px', resize: 'vertical', outline: 'none',
            }}
            placeholder="Describe what's wrong with this settlement…"
          />
        </div>

        {/* DISPUTE BOND — amount EXPLICIT before the confirm CTA (UI-SPEC destructive contract) */}
        <div style={{ borderTop: '1px solid rgba(0,0,0,0.25)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            DISPUTE BOND
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'rgba(0,0,0,0.7)' }}>
            $5.00 USDC · refunded + $2 reward if you win, forfeited if you lose
          </span>
        </div>

        {/* USDC preflight — inline approve sub-step (preflight logic unchanged) */}
        {needsApproval && !isSmZero && (
          <div style={{ border: '2px solid #000', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'rgba(0,0,0,0.7)' }}>
              Approve USDC first — allow $5.00 to SettlementManager
            </span>
            <button
              onClick={() => void handleApprove()}
              disabled={isApproving || approveConfirming}
              style={{
                fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 800,
                textTransform: 'uppercase', letterSpacing: '0.04em',
                color: '#000',
                background: isApproving || approveConfirming ? 'rgba(0,0,0,0.15)' : 'var(--accent-warning)',
                border: '2px solid #000',
                boxShadow: isApproving || approveConfirming ? 'none' : 'var(--shadow-brutal)',
                padding: '10px 16px',
                cursor: isApproving || approveConfirming ? 'not-allowed' : 'pointer',
              }}
            >
              {isApproving || approveConfirming ? 'Approving…' : 'Approve USDC ▸'}
            </button>
          </div>
        )}

        {isSmZero && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'rgba(0,0,0,0.7)', border: '1px solid rgba(0,0,0,0.35)', padding: '10px' }}>
            SettlementManager not yet deployed — disputes available after Phase 4 deploy.
          </div>
        )}

        {/* Action row — stacks full-width at mobile (D-04), each button ≥44px tall.
            Confirm = warning treatment (#FB923C) — cream-on-cream needs contrast. */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '12px' }}>
          <button
            onClick={onClose}
            style={{
              flex: isMobile ? undefined : 1, width: isMobile ? '100%' : undefined,
              fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.04em',
              color: '#000', background: 'transparent', border: '2px solid #000',
              padding: '14px', cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => void handleRaiseDispute()}
            disabled={!canSubmit}
            style={{
              flex: isMobile ? undefined : 2, width: isMobile ? '100%' : undefined,
              fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 800,
              textTransform: 'uppercase', letterSpacing: '0.04em',
              color: canSubmit ? '#000' : 'rgba(0,0,0,0.4)',
              background: canSubmit ? 'var(--accent-warning)' : 'rgba(0,0,0,0.12)',
              border: '3px solid #000',
              boxShadow: canSubmit ? 'var(--shadow-brutal)' : 'none',
              padding: '14px', cursor: canSubmit ? 'pointer' : 'not-allowed',
              display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            {isSubmitting ? 'Submitting…' : 'Submit dispute · stake $5 ▸'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ProvenanceModal (D-10, SETTLE-52) ───────────────────────────────────────

type ProvenanceModalProps = {
  open: boolean;
  onClose: () => void;
  provenance: ProvenanceData | null;
  isLoading: boolean;
  /** C4: non-null when the provenance fetch failed — rendered inline, never silent. */
  error?: string | null;
  /** C4: retry affordance for a failed provenance fetch. */
  onRetry?: () => void;
};

/** Truncate a hex string: first 10 chars + '…' + last 8 chars */
function truncateSig(sig: string): string {
  if (!sig || sig.length <= 20) return sig;
  return `${sig.slice(0, 10)}…${sig.slice(-8)}`;
}

function renderRawOracleData(oracleType: OracleType, rawData: RawOracleData): string {
  if (!rawData) return 'raw data unavailable';
  switch (oracleType) {
    case 'pyth': {
      const d = rawData as { pythPrice: string; pythConf: string; pythPublishTime: string };
      return `price: ${d.pythPrice} · confidence: ±${d.pythConf} · publishTime: ${d.pythPublishTime}`;
    }
    case 'cex': {
      const d = rawData as { announcementTitle: string; announcementUrl: string; scrapedAt: string };
      return `announcementTitle: ${d.announcementTitle}\nsource: ${d.announcementUrl}\nscrapedAt: ${d.scrapedAt}`;
    }
    default: {
      const d = rawData as { attestationPayload: string };
      try {
        return JSON.stringify(JSON.parse(d.attestationPayload ?? '{}'), null, 2);
      } catch {
        return d.attestationPayload ?? '{}';
      }
    }
  }
}

function ProvenanceModal({ open, onClose, provenance, isLoading, error, onRetry }: ProvenanceModalProps) {
  const isMobile = useIsMobile(); // Phase 9 (09-03): 560px panel OVERFLOWS 375px → clamp (D-04)
  const [sigCopied, setSigCopied] = useState(false);

  // F-C12: a11y — Escape closes unconditionally (no transaction lives here).
  // MUST stay above the early return (rules of hooks).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const oracleType = provenance?.oracle?.type ?? 'pyth';
  const oracleUrl = provenance?.oracle?.url ?? '';
  const feedId = provenance?.oracle?.feedId;
  const txHash = provenance?.txHash ?? '';
  const sig = provenance?.relayerSignature ?? '';
  const truncatedSig = truncateSig(sig);
  const rawDisplay = provenance ? renderRawOracleData(oracleType, provenance.rawOracleData) : 'Loading…';

  const handleCopySig = () => {
    if (!sig) return;
    void navigator.clipboard.writeText(sig).then(() => {
      setSigCopied(true);
      setTimeout(() => setSigCopied(false), 2000);
    });
  };

  return (
    <div
      // .modal-overlay template (D-13): rgba(0,0,0,0.82) scrim + blur(4px), z-200
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* .modal-panel template (D-13): cream var(--bg-inverse), BLACK text,
          3px black border, brutal shadow — real provenance values only (D-07) */}
      <div role="dialog" aria-modal="true" aria-labelledby="provenance-modal-title" style={{
        background: 'var(--bg-inverse)',
        color: '#000',
        border: '3px solid #000',
        boxShadow: 'var(--shadow-brutal-lg)',
        maxWidth: '620px',
        width: '100%',
        padding: isMobile ? '24px' : '36px',
        position: 'relative',
        maxHeight: '90vh',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}>
        {/* Header — mono voice + close */}
        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h2 id="provenance-modal-title" style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: '#000', letterSpacing: '0.14em', textTransform: 'uppercase', margin: 0 }}>
            ORACLE PROOF
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(0,0,0,0.55)', fontSize: '20px', padding: '4px', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>

        {isLoading ? (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', color: 'rgba(0,0,0,0.6)', padding: '24px 0', textAlign: 'center' }}>
            Loading provenance data…
          </div>
        ) : error ? (
          /* C4: visible error state — a failed provenance fetch is never a
             silent no-op / silent em-dash wall. */
          <div
            role="alert"
            style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px 0', alignItems: 'flex-start' }}
          >
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: '#B91C1C' }}>
              {error}
            </span>
            {onRetry && (
              <button
                onClick={onRetry}
                style={{
                  fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 800,
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                  color: '#000', background: 'var(--accent-warning)',
                  border: '2px solid #000', boxShadow: 'var(--shadow-brutal-sm)',
                  padding: '10px 18px', cursor: 'pointer',
                }}
              >
                Retry
              </button>
            )}
          </div>
        ) : (
          <>
            {/* ORACLE SOURCE */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: 'rgba(0,0,0,0.55)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                ORACLE SOURCE
              </span>
              <a
                href={oracleUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: '#000', textDecoration: 'underline' }}
              >
                {provenance?.oracle?.host ?? 'oracle'}{feedId ? ` · ${feedId.slice(0, 12)}…` : ''} ↗
              </a>
            </div>

            {/* SETTLEMENT TX */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: 'rgba(0,0,0,0.55)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                SETTLEMENT TX
              </span>
              {txHash ? (
                <a
                  // WR-05: chain-correct explorer (sepolia.arbiscan.io on 421614)
                  href={`${EXPLORER_BASE_URL}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 700, color: '#000', textDecoration: 'underline' }}
                >
                  {txHash.slice(0, 10)}…{txHash.slice(-8)} ↗
                </a>
              ) : (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'rgba(0,0,0,0.55)' }}>—</span>
              )}
            </div>

            {/* RAW ORACLE DATA — path-aware per oracle.type (logic unchanged) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: 'rgba(0,0,0,0.55)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                RAW ORACLE DATA
              </span>
              <div style={{ background: 'rgba(0,0,0,0.06)', border: '2px solid #000', padding: '12px', overflowX: 'auto' }}>
                <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#000', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {/* path-aware raw data: branch on oracle.type */}
                  {oracleType === 'pyth' && provenance?.rawOracleData ? (() => {
                    const d = provenance.rawOracleData as { pythPrice?: string; pythConf?: string; pythPublishTime?: string };
                    return `price: ${d.pythPrice ?? '—'}\nconfidence: ±${d.pythConf ?? '—'}\npublishTime: ${d.pythPublishTime ?? '—'}`;
                  })() : oracleType === 'cex' && provenance?.rawOracleData ? (() => {
                    const d = provenance.rawOracleData as { announcementTitle?: string; announcementUrl?: string; scrapedAt?: string };
                    return `announcementTitle: ${d.announcementTitle ?? '—'}\nsource: ${d.announcementUrl ?? '—'}\nscrapedAt: ${d.scrapedAt ?? '—'}`;
                  })() : provenance?.rawOracleData ? (() => {
                    const d = provenance.rawOracleData as { attestationPayload?: string };
                    try { return JSON.stringify(JSON.parse(d.attestationPayload ?? '{}'), null, 2); } catch { return d.attestationPayload ?? '{}'; }
                  })() : rawDisplay}
                </pre>
              </div>
            </div>

            {/* RELAYER SIGNATURE (EIP-712, bound to the ACTIVE chain — Pitfall 7 / WR-05) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: 'rgba(0,0,0,0.55)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                  RELAYER SIGNATURE (EIP-712)
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#000', border: '1px solid #000', padding: '1px 5px' }}>
                  chainId {ACTIVE_CHAIN_ID}
                </span>
              </div>
              {sig ? (
                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'rgba(0,0,0,0.7)' }}>
                    {/* truncated: first 10 + last 8 chars (SETTLE-52) */}
                    {truncatedSig}
                  </span>
                  <button
                    onClick={handleCopySig}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: sigCopied ? '#000' : 'rgba(0,0,0,0.55)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 4px' }}
                  >
                    {sigCopied ? 'copied ✓' : 'copy'}
                  </button>
                </div>
              ) : (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'rgba(0,0,0,0.55)' }}>— (not available)</span>
              )}
            </div>
          </>
        )}

        {/* Close */}
        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.04em',
              color: '#000', background: 'transparent', border: '2px solid #000',
              padding: '10px 24px', cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Settled receipt styles (09.2-07 — prototype SETTLED_OUTCOMES port) ──────
//
// Color/tint/sub map ported from `call it frontend/screens/receipt.jsx:284-290`
// (the canonical SETTLED_OUTCOMES — NEVER the prototype data module's OUTCOMES,
// whose CSS vars are broken), keyed by the resolveSettledWord outcome word. WORDS always come from
// lib/outcome-word.ts (the D-09 per-viewer FADED CORRECTLY guard + the PENDING
// RESULT neutral fail-safe live there); this map supplies COLORS/tints/sub-lines
// ONLY. The neutral word has no entry here — it degrades to the resolveSettledWord
// slate with no sub-line (D-07).

type SettledOutcomeStyle = { hex: string; tint: string; sub: string | null };

const SETTLED_OUTCOME_STYLES: Record<string, SettledOutcomeStyle> = {
  'CALLED IT': { hex: '#E8F542', tint: 'rgba(232,245,66,0.04)', sub: 'Right.' },
  'LOUD AND WRONG': { hex: '#F87171', tint: 'rgba(248,113,113,0.04)', sub: 'The market remembers.' },
  'COLD CALL': { hex: '#64748B', tint: 'rgba(100,116,139,0.04)', sub: "Didn't hit." },
  'CONTRARIAN HIT': { hex: '#E8F542', tint: 'rgba(232,245,66,0.05)', sub: 'Faded the consensus. Right.' },
  'FADED CORRECTLY': { hex: '#E8F542', tint: 'rgba(232,245,66,0.04)', sub: 'Right to doubt.' },
};

/** Prototype avatar grad classes a–f (globals.css) — deterministic pick per handle. */
const AVATAR_GRAD_CLASSES = [
  'avatar-grad-a',
  'avatar-grad-b',
  'avatar-grad-c',
  'avatar-grad-d',
  'avatar-grad-e',
  'avatar-grad-f',
] as const;

function avatarGradClass(handle: string): string {
  let acc = 0;
  for (let i = 0; i < handle.length; i++) {
    acc = (acc + handle.charCodeAt(i)) % AVATAR_GRAD_CLASSES.length;
  }
  return AVATAR_GRAD_CLASSES[acc] ?? AVATAR_GRAD_CLASSES[0];
}

/** Short hash for metadata footers: 0xa3f4…91d2 (display-only). */
function shortHash(h: string): string {
  return h.length > 12 ? `${h.slice(0, 6)}…${h.slice(-4)}` : h;
}

/** Mono UTC stamp for provenance metadata: "2026-06-08 14:22 UTC". */
function formatUtc(sec: bigint | number): string {
  return `${new Date(Number(sec) * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/**
 * LiveCountdown (09.2-09) — prototype Countdown recipe (`call it frontend/
 * components.jsx:105-121`): D HH:MM:SS in JetBrains Mono, ticking 1s.
 * DISPLAY-ONLY component over the existing `expiry` field — no data/handler
 * logic (D-05: markup donor only).
 */
function LiveCountdown({ expiry }: { expiry: bigint }) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Number(expiry) - Math.floor(nowMs / 1000));
  if (s === 0) {
    return <span className="mono">Expired</span>;
  }
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (
    <span className="mono" style={{ letterSpacing: '0.04em' }}>
      {d > 0 ? `${d}d ` : ''}
      {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(sec).padStart(2, '0')}
    </span>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function CallPage() {
  const params = useParams<{ id: string }>();
  const callId = BigInt(params.id ?? '0');
  const callIdNum = params.id ?? '0';

  const { user, authenticated } = usePrivy();
  const { address: userAddress } = useAccount();

  // Phase 9 (09-03): mobile-responsive layout swap (D-01/D-02 — single hook,
  // mobile-first first paint). Drives every isMobile ? mobile : desktop style
  // object on the settled + live branches and the two inline modals below.
  const isMobile = useIsMobile();

  // Call metadata from relayer
  const [callData, setCallData] = useState<CallData | null>(null);
  const [activityFeed, setActivityFeed] = useState<ActivityEntry[]>([]);
  const [quoteCalls, setQuoteCalls] = useState<QuoteEntry[]>([]);
  const [criteriaExpanded, setCriteriaExpanded] = useState(false);
  const [isLoadingCall, setIsLoadingCall] = useState(true);
  // Phase 4: Final positions for settled receipt
  const [finalPositions, setFinalPositions] = useState<FinalPosition[]>([]);
  // Phase 4: Rep count-up animation state (D-08, UI-45)
  const [displayedRepDelta, setDisplayedRepDelta] = useState(0);
  const repAnimRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Modal states
  const [isFollowModalOpen, setIsFollowModalOpen] = useState(false);
  const [isFadeModalOpen, setIsFadeModalOpen] = useState(false);
  const [isCallerExitModalOpen, setIsCallerExitModalOpen] = useState(false);
  const [isPositionExitModalOpen, setIsPositionExitModalOpen] = useState(false);
  const [isChallengeFormOpen, setIsChallengeFormOpen] = useState(false);
  // Phase 4 D-06: Dispute modal state
  const [isDisputeModalOpen, setIsDisputeModalOpen] = useState(false);
  // Phase 4 D-10: Provenance modal state + data
  const [isProvenanceModalOpen, setIsProvenanceModalOpen] = useState(false);
  const [provenanceData, setProvenanceData] = useState<ProvenanceData | null>(null);
  const [isProvenanceLoading, setIsProvenanceLoading] = useState(false);
  // C4: visible error state for the provenance fetch (never a silent no-op)
  const [provenanceError, setProvenanceError] = useState<string | null>(null);
  // C3: caller profile (handle + rep) for the receipt header — real data from
  // /api/profile/:caller (PLAN-01 A3); degrade-to-hidden when absent (D-07).
  const [callerProfile, setCallerProfile] = useState<{ handle: string; globalRep: number } | null>(null);
  // SSR-safe portal gate for the receipt modals (mounted into document.body)
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => { setPortalReady(true); }, []);

  // ── Phase 3: Pending challenge state ──────────────────────────────────────
  const [pendingChallenge, setPendingChallenge] = useState<PendingChallenge | null>(null);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const [challengeAccepting, setChallengeAccepting] = useState(false);
  const [challengeApproving, setChallengeApproving] = useState(false);
  const [challengeRejecting, setChallengeRejecting] = useState(false);
  const [challengeApproveTxHash, setChallengeApproveTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [challengeAcceptTxHash, setChallengeAcceptTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [challengeRejectTxHash, setChallengeRejectTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [challengeToast, setChallengeToast] = useState<{ text: string; isError: boolean } | null>(null);

  // callerInputStake for accept — default = challengerStake (caller can override; UI stub defaults to match)
  // callerMatchingStake = min(callerInputStake, challengerStake) — SOCIAL-31 CORRECT formula
  // Issue #1 fix: NOT min(challengerStake, challengerStake)
  const callerMatchingStake =
    pendingChallenge
      ? pendingChallenge.challengerStake // default: caller matches challenger exactly
      : 0n;

  const isZeroCE = CE_ADDR === '0x0000000000000000000000000000000000000000';

  // ─── useReadContracts — 8 reads at 5s refetchInterval (D-07) ───────────────
  const userAddr = userAddress ?? '0x0000000000000000000000000000000000000000';

  // RC1: every contract entry pins chainId — unpinned useReadContracts defaults
  // to the first chain in the wagmi config.
  const { data: contractData } = useReadContracts({
    contracts: [
      { address: FFM_ADDR, chainId: ACTIVE_CHAIN_ID, abi: followFadeMarketAbi, functionName: 'followReserve', args: [callId] },
      { address: FFM_ADDR, chainId: ACTIVE_CHAIN_ID, abi: followFadeMarketAbi, functionName: 'fadeReserve', args: [callId] },
      { address: FFM_ADDR, chainId: ACTIVE_CHAIN_ID, abi: followFadeMarketAbi, functionName: 'followTotalShares', args: [callId] },
      { address: FFM_ADDR, chainId: ACTIVE_CHAIN_ID, abi: followFadeMarketAbi, functionName: 'fadeTotalShares', args: [callId] },
      { address: FFM_ADDR, chainId: ACTIVE_CHAIN_ID, abi: followFadeMarketAbi, functionName: 'followShares', args: [callId, userAddr] },
      { address: FFM_ADDR, chainId: ACTIVE_CHAIN_ID, abi: followFadeMarketAbi, functionName: 'fadeShares', args: [callId, userAddr] },
      { address: FFM_ADDR, chainId: ACTIVE_CHAIN_ID, abi: followFadeMarketAbi, functionName: 'followEntryTime', args: [callId, userAddr] },
      { address: FFM_ADDR, chainId: ACTIVE_CHAIN_ID, abi: followFadeMarketAbi, functionName: 'fadeEntryTime', args: [callId, userAddr] },
    ],
    query: {
      refetchInterval: 5000,       // 5s poll — D-07
      refetchOnWindowFocus: true,
      staleTime: 4000,
    },
  });

  // Extract contract reads with fallback to 0n
  const followReserve   = (contractData?.[0]?.result ?? 0n) as bigint;
  const fadeReserve     = (contractData?.[1]?.result ?? 0n) as bigint;
  const followTotalShares = (contractData?.[2]?.result ?? 0n) as bigint;
  const fadeTotalShares = (contractData?.[3]?.result ?? 0n) as bigint;
  const followShares    = (contractData?.[4]?.result ?? 0n) as bigint;
  const fadeShares      = (contractData?.[5]?.result ?? 0n) as bigint;
  const followEntryTime = (contractData?.[6]?.result ?? 0n) as bigint;
  const fadeEntryTime   = (contractData?.[7]?.result ?? 0n) as bigint;

  // ─── Derived state ────────────────────────────────────────────────────────
  const nowSec = BigInt(Math.floor(Date.now() / 1000));

  // B5: live USDC balance (6-decimal) for the FollowFadeModal balance gate
  const { balance: usdcBalance } = useUsdcBalance();

  // B6 (quick-260611-5mh): FOLLOW/FADE/CHALLENGE are gated on call liveness.
  // callData.expiry is unix SECONDS (nowSec is too — no ms/s mismatch).
  // C1: all comparisons use the canonical lowercase status from fetchCallData.
  const isCallExpired = callData ? nowSec >= callData.expiry : false;
  const isCallActionable = callData?.status === 'live' && !isCallExpired;

  const isCallerExited = callData?.status === 'callerExited';
  // Phase 4: settled/disputed branch
  const isSettled = callData?.status === 'settled' || callData?.status === 'disputed';
  const isDisputed = callData?.status === 'disputed';
  // C2: expired-but-unsettled — the amber AWAITING SETTLEMENT state
  const isAwaitingSettlement = callData?.status === 'live' && isCallExpired;

  // D-09 CRITICAL: viewerIsWinningFader MUST be explicitly false when wallet is disconnected.
  // A connected wallet viewing a settled call where they had a winning fade position
  // will see 'FADED CORRECTLY'. Public viewers (no wallet) see 'LOUD AND WRONG'.
  // The guard: requires authenticated AND account.address AND fade position AND CallerLost.
  // T-04-07-05: viewerIsWinningFader=false when !authenticated OR !userAddress.
  const viewerIsWinningFader = Boolean(
    authenticated &&
    userAddress &&
    callData?.outcome === 'CallerLost' &&
    // hasFadePosition: user has fadeShares > 0 (from live FFM read — or after settlement, stored in subgraph)
    // We use fadeShares from the contract read as the position indicator.
    // After settlement, FFM positions are cleared but the subgraph/relayer stores final positions.
    // For the settled view, we fall back to checking if the user appears in finalPositions fade side.
    (fadeShares > 0n || finalPositions.some(p => p.side === 'fade' && p.handle === (callData?.handle ?? '')))
  );

  // Outcome word computation (Phase 4 — D-08 thresholds)
  const outcomeWordResult = isSettled && callData?.outcome
    ? getOutcomeWordResult({
        callerWon: callData.outcome === 'CallerWon',
        fadeRealShare: callData.fadeRealShare ?? 0,
        repDelta: callData.repDelta ?? 0,
        viewerIsWinningFader,
      })
    : null;

  const userIsCaller = Boolean(userAddress && callData?.caller?.toLowerCase() === userAddress.toLowerCase());
  const userIsFollower = followShares > 0n;
  const userIsFader = fadeShares > 0n;

  // Caller lock check: 24h from createdAt (SOCIAL-17)
  const callerLockExpires = callData
    ? callData.createdAt + CALLER_EXIT_LOCK_DURATION
    : 0n;
  const callerLockPassed = nowSec >= callerLockExpires;

  // Position exit cooldown: 4h from entry (SOCIAL-12)
  const userFollowEntryUnlock = followEntryTime + POSITION_EXIT_COOLDOWN;
  const userFadeEntryUnlock = fadeEntryTime + POSITION_EXIT_COOLDOWN;
  const followCooldownPassed = followEntryTime > 0n && nowSec >= userFollowEntryUnlock;
  const fadeCooldownPassed = fadeEntryTime > 0n && nowSec >= userFadeEntryUnlock;
  const positionCooldownPassed = (userIsFollower && followCooldownPassed) || (userIsFader && fadeCooldownPassed);

  // Penalty math
  const callerPenaltyPct = callData
    ? computeCallerExitPenaltyPct(callData.createdAt, callData.expiry, nowSec)
    : 50;
  const callerPenaltyUsdc = callData
    ? (callData.stake * BigInt(callerPenaltyPct)) / 100n
    : 0n;
  const callerStakeReturned = callData
    ? callData.stake - callerPenaltyUsdc
    : 0n;

  // Position exit math (10% flat — SOCIAL-13)
  // WR-01: position value is the USDC the user's shares redeem for, mirroring
  // the contract's exitPosition: value = userShares * reserve / totalShares.
  // Raw shares are 18-decimal and are NOT a USDC value, so use them only to
  // pro-rate against the live reserve (6-decimal USDC).
  const userPositionValue = userIsFollower
    ? (followTotalShares > 0n ? (followShares * followReserve) / followTotalShares : 0n)
    : userIsFader
    ? (fadeTotalShares > 0n ? (fadeShares * fadeReserve) / fadeTotalShares : 0n)
    : 0n;
  const positionSlash = (userPositionValue * POSITION_EXIT_PENALTY_PCT) / 100n;
  const positionUserReceives = userPositionValue - positionSlash;

  // ─── useWriteContract ─────────────────────────────────────────────────────
  const { writeContractAsync } = useWriteContract();

  // Phase 4 D-10 / C4: open ProvenanceModal and fetch provenance data with
  // visible loading + error states (a failed fetch is never a silent no-op).
  const loadProvenance = useCallback(async () => {
    setIsProvenanceLoading(true);
    setProvenanceError(null);
    const result = await fetchProvenanceData(callIdNum);
    if (result.ok) {
      setProvenanceData(result.data);
    } else {
      setProvenanceData(null);
      setProvenanceError(result.error);
    }
    setIsProvenanceLoading(false);
  }, [callIdNum]);

  const handleOpenProvenance = useCallback(async () => {
    setIsProvenanceModalOpen(true);
    if (!provenanceData && !isProvenanceLoading) {
      await loadProvenance();
    }
  }, [provenanceData, isProvenanceLoading, loadProvenance]);

  // quick-260611-fo1: approve-then-deposit. FollowFadeMarket._deposit pulls USDC
  // via safeTransferFrom, and allowance(user -> FFM) was zero — live "tx failed"
  // 2026-06-11. Exact-amount approve (never infinite), mirroring usePublishCall.ts.
  const handleFollow = useCallback(async (amountIn: bigint, minSharesOut: bigint) => {
    await ensureActiveChain();
    if (!userAddress) throw new Error('Connect your wallet first.');
    const allowance = (await readContract(wagmiConfig, {
      address: USDC_ADDR,
      chainId: ACTIVE_CHAIN_ID as ActiveChainId,
      abi: USDC_ALLOWANCE_ABI,
      functionName: 'allowance',
      args: [userAddress, FFM_ADDR],
    })) as bigint;
    if (allowance < amountIn) {
      const approveHash = await writeContractAsync({
        chainId: ACTIVE_CHAIN_ID,
        address: USDC_ADDR,
        abi: USDC_ALLOWANCE_ABI,
        functionName: 'approve',
        args: [FFM_ADDR, amountIn],
      });
      const receipt = await waitForTransactionReceipt(wagmiConfig, {
        hash: approveHash,
        chainId: ACTIVE_CHAIN_ID as ActiveChainId,
      });
      if (receipt.status !== 'success') {
        throw new Error('USDC approval failed — try again.');
      }
    }
    await writeContractAsync({
        chainId: ACTIVE_CHAIN_ID,
      address: FFM_ADDR,
      abi: followFadeMarketAbi,
      functionName: 'follow',
      args: [callId, amountIn, minSharesOut],
    });
  }, [callId, userAddress, writeContractAsync]);

  // quick-260611-fo1: same approve-then-deposit guard as handleFollow — fade()
  // also pulls USDC via _deposit's safeTransferFrom (zero-allowance "tx failed").
  const handleFade = useCallback(async (amountIn: bigint, minSharesOut: bigint) => {
    await ensureActiveChain();
    if (!userAddress) throw new Error('Connect your wallet first.');
    const allowance = (await readContract(wagmiConfig, {
      address: USDC_ADDR,
      chainId: ACTIVE_CHAIN_ID as ActiveChainId,
      abi: USDC_ALLOWANCE_ABI,
      functionName: 'allowance',
      args: [userAddress, FFM_ADDR],
    })) as bigint;
    if (allowance < amountIn) {
      const approveHash = await writeContractAsync({
        chainId: ACTIVE_CHAIN_ID,
        address: USDC_ADDR,
        abi: USDC_ALLOWANCE_ABI,
        functionName: 'approve',
        args: [FFM_ADDR, amountIn],
      });
      const receipt = await waitForTransactionReceipt(wagmiConfig, {
        hash: approveHash,
        chainId: ACTIVE_CHAIN_ID as ActiveChainId,
      });
      if (receipt.status !== 'success') {
        throw new Error('USDC approval failed — try again.');
      }
    }
    await writeContractAsync({
        chainId: ACTIVE_CHAIN_ID,
      address: FFM_ADDR,
      abi: followFadeMarketAbi,
      functionName: 'fade',
      args: [callId, amountIn, minSharesOut],
    });
  }, [callId, userAddress, writeContractAsync]);

  const handleCallerExit = useCallback(async () => {
    await ensureActiveChain();
    await writeContractAsync({
        chainId: ACTIVE_CHAIN_ID,
      address: FFM_ADDR,
      abi: followFadeMarketAbi,
      functionName: 'callerExit',
      args: [callId],
    });
  }, [callId, writeContractAsync]);

  const handlePositionExit = useCallback(async () => {
    const side = userIsFollower ? 0 : 1; // 0=Follow, 1=Fade (enum IFollowFadeMarket.Side)
    await ensureActiveChain();
    await writeContractAsync({
        chainId: ACTIVE_CHAIN_ID,
      address: FFM_ADDR,
      abi: followFadeMarketAbi,
      functionName: 'exitPosition',
      args: [callId, side],
    });
  }, [callId, userIsFollower, writeContractAsync]);

  // ── Phase 3: USDC allowance for caller accept path (T-3-06-06) ─────────────
  const userAddr2 = userAddress as `0x${string}` | undefined ?? '0x0000000000000000000000000000000000000000' as `0x${string}`;

  const { data: ceAllowanceData, refetch: refetchCeAllowance } = useReadContract({
    address: USDC_ADDR,
    chainId: ACTIVE_CHAIN_ID, // RC1: pin the read to the active chain
    abi: USDC_ALLOWANCE_ABI,
    functionName: 'allowance',
    args: [userAddr2, CE_ADDR],
    query: {
      enabled: userIsCaller && !!pendingChallenge && !isZeroCE,
    },
  });

  const ceAllowance = (ceAllowanceData as bigint | undefined) ?? 0n;
  const callerNeedsApproval =
    !isZeroCE && userIsCaller && !!pendingChallenge && ceAllowance < callerMatchingStake;

  // Challenge approve/accept/reject tx receipts
  const { isLoading: ceApproveConfirming, isSuccess: ceApproveConfirmed } =
    useWaitForTransactionReceipt({ hash: challengeApproveTxHash });
  const { isSuccess: ceAcceptConfirmed } =
    useWaitForTransactionReceipt({ hash: challengeAcceptTxHash });
  const { isSuccess: ceRejectConfirmed } =
    useWaitForTransactionReceipt({ hash: challengeRejectTxHash });

  // After approval confirmed — refetch allowance
  useEffect(() => {
    if (ceApproveConfirmed) {
      void refetchCeAllowance();
      setChallengeApproving(false);
    }
  }, [ceApproveConfirmed, refetchCeAllowance]);

  useEffect(() => {
    if (ceAcceptConfirmed) {
      setChallengeAccepting(false);
      setChallengeToast({ text: 'Challenge accepted — duel is live!', isError: false });
    }
  }, [ceAcceptConfirmed]);

  useEffect(() => {
    if (ceRejectConfirmed) {
      setChallengeRejecting(false);
      setRejectConfirmOpen(false);
      setChallengeToast({ text: 'Challenge rejected — stake refunded.', isError: false });
    }
  }, [ceRejectConfirmed]);

  // ── Phase 3: challenge wagmi write handlers ──────────────────────────────
  const handleChallengeApprove = useCallback(async () => {
    if (!callerMatchingStake) return;
    setChallengeApproving(true);
    try {
      await ensureActiveChain();
      const hash = await writeContractAsync({
        chainId: ACTIVE_CHAIN_ID,
        address: USDC_ADDR,
        abi: USDC_ALLOWANCE_ABI,
        functionName: 'approve',
        args: [CE_ADDR, callerMatchingStake],
      });
      setChallengeApproveTxHash(hash);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Approval failed';
      setChallengeToast({ text: msg, isError: true });
      setChallengeApproving(false);
    }
  }, [callerMatchingStake, writeContractAsync]);

  const handleChallengeAccept = useCallback(async () => {
    if (!pendingChallenge) return;
    setChallengeAccepting(true);
    try {
      await ensureActiveChain();
      const hash = await writeContractAsync({
        chainId: ACTIVE_CHAIN_ID,
        address: CE_ADDR,
        abi: CE_ABI,
        functionName: 'acceptChallenge',
        args: [pendingChallenge.challengeId],
      });
      setChallengeAcceptTxHash(hash);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Accept failed';
      setChallengeToast({ text: msg, isError: true });
      setChallengeAccepting(false);
    }
  }, [pendingChallenge, writeContractAsync]);

  const handleChallengeReject = useCallback(async () => {
    if (!pendingChallenge) return;
    setChallengeRejecting(true);
    try {
      await ensureActiveChain();
      const hash = await writeContractAsync({
        chainId: ACTIVE_CHAIN_ID,
        address: CE_ADDR,
        abi: CE_ABI,
        functionName: 'rejectChallenge',
        args: [pendingChallenge.challengeId],
      });
      setChallengeRejectTxHash(hash);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Reject failed';
      setChallengeToast({ text: msg, isError: true });
      setChallengeRejecting(false);
    }
  }, [pendingChallenge, writeContractAsync]);

  // ─── Data fetching ────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    const [call, feed, quotes] = await Promise.all([
      fetchCallData(callIdNum),
      fetchActivityFeed(callIdNum),
      fetchQuoteCalls(callIdNum),
    ]);
    if (call) {
      setCallData(call);
      // Fetch final positions when settled (C5 — GET /api/calls/:id/positions)
      if (call.status === 'settled' || call.status === 'disputed') {
        void fetchFinalPositions(callIdNum).then(setFinalPositions);
      }
    }
    setActivityFeed(feed);
    setQuoteCalls(quotes);
    setIsLoadingCall(false);
  }, [callIdNum]);

  // Phase 4: Rep count-up animation (UI-45) — starts when settled state loads
  useEffect(() => {
    const targetDelta = callData?.repDelta ?? 0;
    if (!isSettled || targetDelta === 0) {
      setDisplayedRepDelta(targetDelta);
      return;
    }
    // Animate from 0 to targetDelta over ~800ms (20 steps)
    const STEPS = 20;
    const STEP_MS = 40;
    let step = 0;
    if (repAnimRef.current) clearInterval(repAnimRef.current);
    repAnimRef.current = setInterval(() => {
      step++;
      if (step >= STEPS) {
        setDisplayedRepDelta(targetDelta);
        if (repAnimRef.current) clearInterval(repAnimRef.current);
      } else {
        setDisplayedRepDelta(Math.round((targetDelta * step) / STEPS));
      }
    }, STEP_MS);
    return () => {
      if (repAnimRef.current) clearInterval(repAnimRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSettled, callData?.repDelta]);

  // Also fetch pending challenge notification on load + poll
  useEffect(() => {
    void fetchPendingChallenge(callIdNum, userAddress).then(setPendingChallenge);
  }, [callIdNum, userAddress]);

  // C3: caller handle + rep for the receipt header from /api/profile/:caller
  // (real subgraph stats after PLAN-01 A3). Best-effort; absent → hidden (D-07).
  const callerAddress = callData?.caller ?? '';
  useEffect(() => {
    if (!RELAYER_URL || !callerAddress) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${RELAYER_URL}/api/profile/${callerAddress}`, {
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) return;
        const raw = await res.json() as Record<string, unknown>;
        if (cancelled) return;
        const handle = typeof raw['handle'] === 'string' ? raw['handle'] : null;
        const globalRep = typeof raw['globalRep'] === 'number' ? raw['globalRep'] : null;
        if (handle !== null && globalRep !== null) {
          setCallerProfile({ handle, globalRep });
        }
      } catch {
        // degrade-to-hidden (D-07) — header falls back to live-state fields
      }
    })();
    return () => { cancelled = true; };
  }, [callerAddress]);

  // C3: document title carries the real market line (never "Call" / bare id).
  useEffect(() => {
    if (callData?.marketLine) {
      document.title = `${callData.marketLine} — Call It`;
    }
  }, [callData?.marketLine]);

  useEffect(() => {
    void fetchAll();
    // Activity feed + quote-calls polled at 5s (D-08, reusing D-24 pattern)
    const interval = setInterval(() => {
      void fetchAll();
      void fetchPendingChallenge(callIdNum, userAddress).then(setPendingChallenge);
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchAll, callIdNum, userAddress]);

  // ─── Loading skeleton ─────────────────────────────────────────────────────
  // The loading gate keys off the RELAYER fetch (isLoadingCall && !callData) ONLY —
  // NOT on Privy/wagmi wallet readiness. A logged-out Mini App webview reaches the
  // read-only receipt branches below without waiting on wallet init (08-06 GAP 2).
  if (isLoadingCall && !callData) {
    return (
      <div style={{ padding: '32px', color: '#94A3B8', fontFamily: 'monospace', fontSize: '14px' }}>
        {/* 08-06 GAP 2: signal ready() even on the loading skeleton so the Mini App host
            never leaves a blank splash up if the relayer fetch is slow/unavailable.
            D-01: read-only render only; tap-to-transact is Phase 10. */}
        <MiniAppReady enabled />
        Loading call #{callIdNum}...
      </div>
    );
  }

  // Fall back to minimal placeholder if relayer not available.
  // C3: prefer the profile-resolved handle (real @handle) over the live-state
  // field (which may be a truncated address alias).
  const displayHandle = callerProfile?.handle ?? callData?.handle ?? `#${callIdNum}`;
  // C3: marketLine → 'Open Call' (never bare "Call" / "Call #14")
  const displayMarketLine = callData?.marketLine || 'Open Call';
  const displayCategory = callData?.category ?? 'Majors';
  const displayStake = callData?.stake ?? 0n;
  const displayConviction = callData?.conviction ?? 50;
  const displayExpiry = callData?.expiry ?? BigInt(Math.floor(Date.now() / 1000) + 86400);
  const displayReasoning = callData?.reasoning ?? '';

  // Follow%/Fade% for the 4-stat row
  const total = followReserve + fadeReserve;
  const followPct = total === 0n ? 50 : Number((followReserve * 100n) / total);
  const fadePct = 100 - followPct;

  // User's position on this call (for FollowFadeModal headroom).
  // FollowFadeModal's userPosition is 6-decimal USDC; raw shares are 18-decimal,
  // so pro-rate against the live reserve (same contract as userPositionValue above).
  const userFollowPosition =
    followTotalShares > 0n ? (followShares * followReserve) / followTotalShares : 0n;
  const userFadePosition =
    fadeTotalShares > 0n ? (fadeShares * fadeReserve) / fadeTotalShares : 0n;

  // ─── SETTLED / DISPUTED RECEIPT RENDER (09.2-07 — prototype receipt skin) ──
  // Renders for Settled + Disputed + CallerExited-settled states over the
  // UNTOUCHED data/handler block above (markup donor: `call it frontend/`
  // screens/receipt.jsx ReceiptSettledScreen). Outcome WORDS come from
  // resolveSettledWord (lib/outcome-word.ts — D-09 fader guard + neutral
  // fail-safe); COLORS/tints/subs come from SETTLED_OUTCOME_STYLES above.
  if (isSettled || (isCallerExited && callData?.outcome)) {
    // C3: profile-resolved handle preferred; rep renders ONLY from the real
    // profile fetch (live-state repScore is a hardcoded 0 — D-07 hides it).
    const handle = callerProfile?.handle ?? callData?.handle ?? `#${callIdNum}`;
    // quick-260611-h44 locked decision 3 (D-07/AUTH-44): the '#N' fallback is
    // never rendered AS identity — avatar/name gate on a REAL resolved handle.
    const handleResolved = Boolean(callerProfile?.handle ?? callData?.handle);
    const marketLine = callData?.marketLine || 'Open Call';
    const conviction = callData?.conviction ?? 50;
    const settledAt = callData?.settledAt;
    const createdAt = callData?.createdAt;
    // D-07: stats and metadata render ONLY real provenance fields — absent
    // fields hide their stat/segment instead of showing a '—' filler.
    const oracleHost = callData?.oracleHost;
    const oracleTxHash = callData?.oracleTxHash;
    const finalValue = callData?.finalValue;
    const targetValue = callData?.targetValue;
    const callerPnl = callData?.pnl;
    const repDelta = callData?.repDelta;

    // CORE VALUE (08-05 GAP 1 — receipts must be unfakeable): NEVER default a
    // settled receipt to a win word. When outcomeWordResult is null (the true
    // outcome is not yet known — outcome enum Pending, or a subgraph/relayer
    // outage left the settled fields absent), resolveSettledWord returns the
    // NEUTRAL placeholder ('PENDING RESULT'), never a win word (UAT 08 GAP 1).
    const resolvedSettled = resolveSettledWord(outcomeWordResult);
    const outcomeWord = resolvedSettled.word;
    const outcomeColor = resolvedSettled.color;
    const outcomeLozenge = resolvedSettled.lozenge;

    // Colors/tints/subs ride the prototype map keyed by the resolved word.
    // The neutral SETTLED_NEUTRAL_WORD has no prototype entry — slate, no sub.
    const isNeutralOutcome = outcomeWord === SETTLED_NEUTRAL_WORD;
    const outcomeStyle: SettledOutcomeStyle = SETTLED_OUTCOME_STYLES[outcomeWord] ?? {
      hex: outcomeColor,
      tint: 'rgba(100,116,139,0.04)',
      sub: null,
    };

    // SHARE controls (D-09 / SHARE-19 — the app's existing WORKING wiring; the
    // prototype's dead SHARE button is superseded): warpcast compose intent
    // (SHARE AS FRAME, Plan 08-04) + twitter web intent, both via the shared
    // pure builders. CORE VALUE (08-05 GAP 1): only ever share a REAL resolved
    // outcome word — require outcomeWordResult != null in addition to the OG
    // base origin + a real handle (no dead/fake share controls, D-08).
    const ogBaseForFrame = process.env.NEXT_PUBLIC_OG_BASE_URL?.replace(/\/$/, '');
    const receiptShareUrl = ogBaseForFrame ? `${ogBaseForFrame}/call/${callIdNum}` : null;
    const shareAsFrameUrl =
      outcomeWordResult && receiptShareUrl && callData?.handle
        ? warpcastComposeUrl(
            receiptShareUrl,
            buildShareText({ outcomeWord, handle, statement: marketLine }),
          )
        : null;
    const shareOnXUrl =
      outcomeWordResult && receiptShareUrl && callData?.handle
        ? twitterIntentUrl(
            receiptShareUrl,
            buildShareText({ outcomeWord, handle, statement: marketLine }),
          )
        : null;

    // WINNERS / LOSERS from the existing positions data — handles + amounts
    // only (AUTH-44), sorted by P&L, capped 20/side. C5/D-07: entries with
    // UNKNOWN pnl (omitted by the relayer) are split into a neutral FINAL
    // POSITIONS list — they are never faked as +$0.00 winners.
    const winners = finalPositions
      .filter((p): p is FinalPosition & { pnl: bigint } => p.pnl !== null && p.pnl >= 0n)
      .sort((a, b) => Number(b.pnl - a.pnl))
      .slice(0, 20);
    const losers = finalPositions
      .filter((p): p is FinalPosition & { pnl: bigint } => p.pnl !== null && p.pnl < 0n)
      .sort((a, b) => Number(a.pnl - b.pnl))
      .slice(0, 20);
    const neutralPositions = finalPositions
      .filter((p) => p.pnl === null)
      .slice(0, 40);

    // 2-node timeline (D-07): created → settled with REAL timestamps. Middle
    // milestones (follower counts, pool thresholds) have NO event source and
    // are NOT rendered.
    const timelineNodes = [
      ...(createdAt && createdAt > 0n
        ? [{ ts: formatUtc(createdAt), lbl: 'Call created', color: 'var(--text-secondary)' }]
        : []),
      ...(settledAt && settledAt > 0n
        ? [
            {
              ts: formatUtc(settledAt),
              lbl: isNeutralOutcome ? 'Settled' : `Resolved · ${outcomeWord}`,
              color: outcomeStyle.hex,
            },
          ]
        : []),
    ];

    // Metadata segments — real provenance values only, hidden where absent
    // (D-07). Block number has no source on this payload → never rendered.
    const metaSegments = [
      isDisputed ? 'disputed' : 'settled',
      oracleTxHash ? shortHash(oracleTxHash) : null,
      settledAt && settledAt > 0n ? formatUtc(settledAt) : null,
    ].filter((s): s is string => s !== null);

    return (
      <div>
        {/* 08-06 GAP 2: signal ready() so the Mini App host reveals this settled
            receipt (renders null). enabled keyed off callData so the host shows
            real content. D-01: read-only render; tap-to-transact is Phase 10. */}
        <MiniAppReady enabled={!!callData} />

        {/* ── Top meta: back to the tape + provenance metadata (D-07 real only) ── */}
        <div className="spread" style={{ paddingTop: 28, paddingBottom: 18, flexWrap: 'wrap', gap: 12 }}>
          <Link href="/" className="btn ghost" style={{ padding: '8px 0' }}>
            ← Back to the tape
          </Link>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.04em' }}>
            {metaSegments.join(' · ')}
          </span>
        </div>

        {/* ── SETTLED HERO — tinted brutal card (prototype ReceiptSettledScreen) ── */}
        <div
          className="brutal-card hero bracketed"
          style={{ padding: isMobile ? 24 : 48, background: outcomeStyle.tint, position: 'relative' }}
        >
          <span className="br-bl" />
          <span className="br-br" />

          {/* Caller-exited-with-outcome variant — warning banner (real fields only) */}
          {isCallerExited && (
            <div
              style={{
                margin: isMobile ? '-24px -24px 24px' : '-48px -48px 28px',
                padding: isMobile ? '14px 24px' : '16px 36px',
                background: 'rgba(251,146,60,0.08)',
                borderBottom: '2px solid var(--accent-warning)',
              }}
            >
              <div
                className="mono"
                style={{ fontSize: 12, color: 'var(--accent-warning)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}
              >
                CALLER EXITED
                {callData?.callerExitedAt ? ` · ${formatRelativeTime(Number(callData.callerExitedAt))}` : ''}
                {callData?.callerExitedPenalty ? ` · ${formatUsdc(callData.callerExitedPenalty)} slashed` : ''}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                The caller exited before settlement. The call still settled at expiry.
              </div>
            </div>
          )}

          {/* Top row: square grad avatar + handle + rep · share controls */}
          <div className="spread" style={{ marginBottom: 28, alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
            <div className="row" style={{ gap: 14 }}>
              {handleResolved ? (
                <span className={`avatar lg ${avatarGradClass(handle)}`} aria-hidden="true">
                  {avatarInitial(handle)}
                </span>
              ) : (
                /* D-07: a grad identity seeded by '#N' is fabricated — neutral avatar */
                <span
                  className="avatar lg"
                  aria-hidden="true"
                  style={{ background: 'var(--bg-tertiary)', color: 'var(--text-tertiary)' }}
                >
                  ?
                </span>
              )}
              <div className="col" style={{ gap: 6 }}>
                {/* handle only — AUTH-44: NEVER wallet address; '#N' fallback is
                    never styled as identity (locked decision 3) */}
                {handleResolved ? (
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em' }}>
                    {handle}
                  </span>
                ) : (
                  <span className="mono" style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                    caller unresolved
                  </span>
                )}
                {/* C3/D-07: rep only from the REAL profile fetch — never the
                    hardcoded live-state 0. Locked decision 1: accent-win ONLY
                    when rep > 0; zero and negative both render muted. */}
                {callerProfile && (
                  <span
                    className="mono"
                    style={{
                      fontSize: 11,
                      color: callerProfile.globalRep > 0 ? 'var(--accent-win)' : 'var(--text-secondary)',
                    }}
                  >
                    {callerProfile.globalRep} rep
                  </span>
                )}
              </div>
            </div>

            {/* SHARE controls — existing working wiring kept (D-09): primary
                cream twitter web intent on top; the warpcast frame intent is
                DEMOTED to a small mono text link below it (locked decision 4 —
                the two actions are not equivalent). Controls are OMITTED
                (never dead) when no real share URL exists. */}
            <div
              data-receipt-action-row
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                width: isMobile ? '100%' : undefined,
                alignItems: isMobile ? 'stretch' : 'flex-end',
              }}
            >
              {shareOnXUrl && (
                <a
                  href={shareOnXUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn cream"
                  style={{ width: isMobile ? '100%' : undefined, textDecoration: 'none' }}
                >
                  SHARE THE RECEIPT →
                </a>
              )}
              {shareAsFrameUrl && (
                /* rel kept — reverse-tabnabbing guard (T-h44-01). minHeight 44 +
                   mobile full width keep the touch-target + action-row specs green. */
                <a
                  href={shareAsFrameUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mono receipt-frame-link"
                  style={{
                    fontSize: 11.5,
                    color: 'var(--text-secondary)',
                    textDecoration: 'none',
                    minHeight: 44,
                    display: 'inline-flex',
                    alignItems: 'center',
                    width: isMobile ? '100%' : undefined,
                  }}
                >
                  or share as a Farcaster frame ↗
                </a>
              )}
            </div>
          </div>

          {/* OUTCOME STAMP (word from resolveSettledWord; hex from the prototype
              map) — swapped for the PENDING DISPUTE warning while under review */}
          {isDisputed ? (
            <div style={{ textAlign: 'center', padding: '28px 0 24px' }}>
              <div className="h-2" style={{ color: 'var(--accent-warning)', textTransform: 'uppercase' }}>
                Pending dispute
              </div>
              <p className="mono" style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '12px 0 0' }}>
                This settlement is under dispute review. The outcome may change.
              </p>
            </div>
          ) : isNeutralOutcome ? (
            /* quick-260611-h44 locked decision 2: an UNCONFIRMED outcome never
               gets the giant stamp — small dispute-pattern heading + explainer
               (D-07 honesty). data-outcome-word stays as the Playwright hook. */
            <div data-outcome-word={outcomeWord} style={{ textAlign: 'center', padding: '28px 0 24px' }}>
              <div className="h-2" style={{ color: outcomeStyle.hex, textTransform: 'uppercase' }}>
                Pending result
              </div>
              <p className="mono" style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '12px 0 0' }}>
                Settlement recorded — the final outcome hasn&apos;t been confirmed yet. Check back shortly.
              </p>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0 24px' }}>
              {/* data-outcome-word: stable Playwright hook (responsive.spec.ts) */}
              <div
                data-outcome-word={outcomeWord}
                style={{ display: 'flex', justifyContent: 'center', fontSize: 'clamp(56px, 17vw, 120px)' }}
              >
                {/* token-class prop is a fallback only — hexColor (prototype map) wins */}
                <Stamp word={outcomeWord} color="brand-muted" hexColor={outcomeStyle.hex} />
              </div>
              {outcomeStyle.sub && (
                <div
                  className="mono"
                  style={{ marginTop: 18, fontSize: 13, color: 'var(--text-secondary)', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700 }}
                >
                  · {outcomeStyle.sub} ·
                </div>
              )}
              {outcomeLozenge && (
                <div style={{ marginTop: 14 }}>
                  <span className="pill" style={{ color: outcomeStyle.hex }}>
                    {outcomeLozenge}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Market line — .h-statement Archivo voice */}
          <div
            className="h-statement"
            style={{ textAlign: 'center', margin: '12px auto 28px', maxWidth: '30ch', color: 'var(--text-secondary)' }}
          >
            {marketLine}
          </div>

          {/* 4-stat row (.stat-block) — each stat hides when its field is absent
              (D-07); wraps 2-up below 768px (UI-48) */}
          <div className="row" style={{ gap: 14, marginBottom: 28, alignItems: 'stretch', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
            {/* quick-260611-h44 locked decision 1: zero is NEUTRAL — never a
                win-styled '+$0.00'. Three-way color/sign on the REAL values. */}
            {callerPnl !== undefined && (
              <div className="stat-block" style={{ flex: isMobile ? '1 1 45%' : 1 }}>
                <div className="stat-label">P&L</div>
                <div
                  className="stat-value"
                  style={{
                    color:
                      callerPnl === 0n
                        ? 'var(--text-secondary)'
                        : callerPnl > 0n
                          ? 'var(--accent-win)'
                          : 'var(--accent-loss)',
                  }}
                >
                  {callerPnl === 0n
                    ? formatUsdc(0n)
                    : callerPnl > 0n
                      ? `+${formatUsdc(callerPnl)}`
                      : `-${formatUsdc(-callerPnl)}`}
                </div>
              </div>
            )}
            {repDelta !== undefined && (
              <div className="stat-block" style={{ flex: isMobile ? '1 1 45%' : 1 }}>
                <div className="stat-label">Rep Δ</div>
                {/* UI-45 count-up rides the existing displayedRepDelta animation
                    state; color + sign key off the REAL repDelta (zero = muted,
                    no '+'; negative displayedRepDelta carries its own minus). */}
                <div
                  className="stat-value"
                  style={{
                    color:
                      repDelta === 0
                        ? 'var(--text-secondary)'
                        : repDelta > 0
                          ? 'var(--accent-win)'
                          : 'var(--accent-loss)',
                  }}
                >
                  {repDelta > 0 ? '+' : ''}
                  {displayedRepDelta}
                </div>
              </div>
            )}
            {/* C4: oracle/target values are 1e8-scale on-chain — ÷1e8 display */}
            {finalValue && (
              <div className="stat-block" style={{ flex: isMobile ? '1 1 45%' : 1 }}>
                <div className="stat-label">Final</div>
                <div className="stat-value">{formatTarget1e8(finalValue)}</div>
                {targetValue && <div className="stat-sub">target {formatTarget1e8(targetValue)}</div>}
              </div>
            )}
            {!finalValue && targetValue && (
              <div className="stat-block" style={{ flex: isMobile ? '1 1 45%' : 1 }}>
                <div className="stat-label">Target</div>
                <div className="stat-value">{formatTarget1e8(targetValue)}</div>
              </div>
            )}
            <div className="stat-block" style={{ flex: isMobile ? '1 1 45%' : 1 }}>
              <div className="stat-label">Conviction</div>
              <div className="stat-value">{conviction}%</div>
            </div>
          </div>

          {/* 2-node timeline — created → settled (real timestamps only, D-07) */}
          {timelineNodes.length > 0 && (
            <>
              <div className="label-overline" style={{ marginBottom: 14 }}>{'// WHAT HAPPENED'}</div>
              <div style={{ display: 'flex', position: 'relative', padding: '16px 0', marginBottom: 8 }}>
                <div
                  style={{ position: 'absolute', left: '12%', right: '12%', top: 23, height: 2, background: 'var(--border-active)', zIndex: 0 }}
                />
                {timelineNodes.map((step, i) => (
                  <div key={i} style={{ flex: 1, textAlign: 'center', position: 'relative', zIndex: 1 }}>
                    <div
                      style={{ width: 14, height: 14, background: step.color, margin: '0 auto 10px', border: '2px solid var(--bg-primary)' }}
                    />
                    <div
                      className="mono"
                      style={{ fontSize: 10, color: 'var(--text-tertiary)', letterSpacing: '0.06em', fontWeight: 600, textTransform: 'uppercase' }}
                    >
                      {step.ts}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginTop: 3, color: step.color }}>{step.lbl}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Metadata footer — real provenance only (D-07) + oracle proof link
              (SETTLE-52 / D-10 — handleOpenProvenance wiring unchanged) */}
          <div
            className="mono"
            style={{
              marginTop: 32,
              paddingTop: 18,
              borderTop: '1px solid var(--border-subtle)',
              fontSize: 10.5,
              color: 'var(--text-tertiary)',
              letterSpacing: '0.08em',
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {oracleHost && <span style={{ textTransform: 'uppercase' }}>settled from {oracleHost}</span>}
            {oracleTxHash && <span>· tx {shortHash(oracleTxHash)}</span>}
            <button
              onClick={() => void handleOpenProvenance()}
              className="mono"
              aria-busy={isProvenanceLoading}
              style={{
                fontSize: 10.5,
                letterSpacing: '0.08em',
                color: 'var(--accent-win)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                // C4: real touch target — the 10px text line was nearly unclickable
                minHeight: 44,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              {/* C4: visible click feedback — never a silent no-op */}
              {isProvenanceLoading && !isProvenanceModalOpen
                ? '· loading proof…'
                : '· view oracle proof ↗'}
            </button>
          </div>
        </div>

        {/* ── DISPUTE THIS SETTLEMENT CTA (D-06, SETTLE-25) — wiring unchanged ── */}
        {callData?.status === 'settled' && (() => {
          const nowUnix = BigInt(Math.floor(Date.now() / 1000));
          const windowOpen = callData.settledAt
            ? (nowUnix - callData.settledAt) < DISPUTE_WINDOW_SECONDS
            : true;
          const underLimit = (callData as CallData & { counterClaimCount?: number }).counterClaimCount !== undefined
            ? ((callData as CallData & { counterClaimCount?: number }).counterClaimCount ?? 0) < MAX_COUNTER_CLAIMS
            : true;
          if (!windowOpen) {
            return (
              <div style={{ marginTop: 20 }}>
                <span className="mono" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  Dispute window closed.
                </span>
              </div>
            );
          }
          if (!underLimit) {
            return (
              <div style={{ marginTop: 20 }}>
                <span className="mono" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                  Counter-claim limit reached (3).
                </span>
              </div>
            );
          }
          return (
            <div style={{ marginTop: 20 }}>
              <button
                onClick={() => setIsDisputeModalOpen(true)}
                className="btn"
                style={{ color: 'var(--accent-warning)', borderColor: 'var(--accent-warning)' }}
              >
                Dispute this settlement →
              </button>
            </div>
          );
        })()}

        {/* ── WINNERS / LOSERS — existing positions data (AUTH-44 handles only) ── */}
        {(winners.length > 0 || losers.length > 0) && (
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 20, marginTop: 32, alignItems: 'flex-start' }}>
            {winners.length > 0 && (
              <div style={{ flex: 1, width: isMobile ? '100%' : undefined, minWidth: 0, alignSelf: 'stretch' }}>
                <div className="section-divider" style={{ marginTop: 0 }}>
                  <span className="title">↗ WINNERS · {winners.length}</span>
                  <span className="line"></span>
                </div>
                <div className="brutal-card" style={{ padding: 0 }}>
                  <table className="brutal-table">
                    <tbody>
                      {winners.map((p, i) => (
                        <tr key={i} style={{ cursor: 'default' }}>
                          <td style={{ width: 40 }}>
                            <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                              {String(i + 1).padStart(2, '0')}
                            </span>
                          </td>
                          <td>
                            <div className="row" style={{ gap: 10 }}>
                              <span className={`avatar sm ${avatarGradClass(p.handle)}`} aria-hidden="true">
                                {avatarInitial(p.handle)}
                              </span>
                              {/* handle only — AUTH-44 */}
                              <span style={{ fontWeight: 600, fontSize: 13 }}>{p.handle}</span>
                            </div>
                          </td>
                          <td className="mono" style={{ textAlign: 'right', color: 'var(--accent-win)', fontWeight: 700, fontSize: 14 }}>
                            +{formatUsdc(p.pnl)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {losers.length > 0 && (
              <div style={{ flex: 1, width: isMobile ? '100%' : undefined, minWidth: 0, alignSelf: 'stretch' }}>
                <div className="section-divider" style={{ marginTop: 0 }}>
                  <span className="title">↘ LOSERS · {losers.length}</span>
                  <span className="line"></span>
                </div>
                <div className="brutal-card" style={{ padding: 0 }}>
                  <table className="brutal-table">
                    <tbody>
                      {losers.map((p, i) => (
                        <tr key={i} style={{ cursor: 'default' }}>
                          <td style={{ width: 40 }}>
                            <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                              {String(i + 1).padStart(2, '0')}
                            </span>
                          </td>
                          <td>
                            <div className="row" style={{ gap: 10 }}>
                              <span className={`avatar sm ${avatarGradClass(p.handle)}`} aria-hidden="true">
                                {avatarInitial(p.handle)}
                              </span>
                              {/* handle only — AUTH-44 */}
                              <span style={{ fontWeight: 600, fontSize: 13 }}>{p.handle}</span>
                            </div>
                          </td>
                          <td className="mono" style={{ textAlign: 'right', color: 'var(--accent-loss)', fontWeight: 700, fontSize: 14 }}>
                            -{formatUsdc(-p.pnl)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── FINAL POSITIONS (C5/D-07) — entries whose pnl the relayer omits:
            real handle/side/stake render WITHOUT a faked $0.00 P&L. Hidden
            entirely when empty. ── */}
        {neutralPositions.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div className="section-divider" style={{ marginTop: 0 }}>
              <span className="title">FINAL POSITIONS · {neutralPositions.length}</span>
              <span className="line"></span>
            </div>
            <div className="brutal-card" style={{ padding: 0 }}>
              <table className="brutal-table">
                <tbody>
                  {neutralPositions.map((p, i) => (
                    <tr key={i} style={{ cursor: 'default' }}>
                      <td style={{ width: 40 }}>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                      </td>
                      <td>
                        <div className="row" style={{ gap: 10 }}>
                          <span className={`avatar sm ${avatarGradClass(p.handle)}`} aria-hidden="true">
                            {avatarInitial(p.handle)}
                          </span>
                          {/* handle only — AUTH-44 */}
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{p.handle}</span>
                          <span className={`pill ${p.side === 'follow' ? 'win' : 'loss'}`}>
                            {p.side === 'follow' ? 'FOLLOWED' : 'FADED'}
                          </span>
                        </div>
                      </td>
                      <td className="mono" style={{ textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 14 }}>
                        {formatUsdc(p.stake)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── DisputeModal (D-06) — C4: portaled to document.body so no page
            ancestor (transform/filter/stacking context) can ever trap or hide
            the fixed overlay. Open-state wiring unchanged. ── */}
        {portalReady && isDisputeModalOpen && createPortal(
          <DisputeModal
            open={isDisputeModalOpen}
            onClose={() => setIsDisputeModalOpen(false)}
            callId={callId}
            outcomeWord={outcomeWord}
            smAddr={SM_ADDR}
            usdcAddr={USDC_ADDR}
            relayerUrl={RELAYER_URL}
          />,
          document.body,
        )}

        {/* ── ProvenanceModal (D-10) — portaled (C4) with loading + error states ── */}
        {portalReady && isProvenanceModalOpen && createPortal(
          <ProvenanceModal
            open={isProvenanceModalOpen}
            onClose={() => setIsProvenanceModalOpen(false)}
            provenance={provenanceData}
            isLoading={isProvenanceLoading}
            error={provenanceError}
            onRetry={() => void loadProvenance()}
          />,
          document.body,
        )}
      </div>
    );
  }

  // ─── LIVE RECEIPT RENDER (09.2-09 — prototype ReceiptLiveScreen skin) ──────
  // Markup donor: `call it frontend/screens/receipt.jsx` ReceiptLiveScreen over
  // the UNTOUCHED data/handler block above. CTAs open the EXISTING amount-based
  // modals (D-06). Data with no live source is HIDDEN/CUT, never faked (D-07/
  // D-08): the prototype's dead controls and the caller accuracy/streak header
  // stats have no source on this page. Handles only (AUTH-44).
  return (
    <div>
      {/* 08-06 GAP 2: signal ready() so the Mini App host reveals this LIVE receipt
          (renders null). enabled keyed off callData so the host shows real content.
          The read-only receipt body below renders WITHOUT a connected wallet — only the
          interactive Follow/Fade/Challenge controls are wallet-gated. D-01: read-only
          render only; in-app tap-to-transact on mainnet 42161 is Phase 10. */}
      <MiniAppReady enabled={!!callData} />

      {/* ── Top meta: back to the tape + posted time (real field only, D-07) ── */}
      <div className="spread" style={{ paddingTop: 28, paddingBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <Link href="/" className="btn ghost" style={{ padding: '8px 0' }}>
          ← Back to the tape
        </Link>
        {callData?.createdAt && callData.createdAt > 0n ? (
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.04em' }}>
            posted {formatRelativeTime(Number(callData.createdAt))}
          </span>
        ) : null}
      </div>

      {/* ── LIVE HERO — bracketed brutal card (prototype ReceiptLiveScreen) ── */}
      <div
        className="brutal-card hero bracketed"
        style={{ padding: isMobile ? 24 : 36, position: 'relative', opacity: isCallerExited ? 0.95 : 1 }}
      >
        <span className="br-bl" />
        <span className="br-br" />

        {/* CALLER EXITED warning banner — SOCIAL-25 (real exit fields only, D-07) */}
        {isCallerExited && (
          <div
            style={{
              margin: isMobile ? '-24px -24px 24px' : '-36px -36px 28px',
              padding: isMobile ? '14px 24px' : '16px 36px',
              background: 'rgba(251,146,60,0.08)',
              borderBottom: '2px solid var(--accent-warning)',
            }}
          >
            <div
              className="mono"
              style={{ fontSize: 12, color: 'var(--accent-warning)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}
            >
              CALLER EXITED
              {callData?.callerExitedAt ? ` · ${formatRelativeTime(Number(callData.callerExitedAt))}` : ''}
              {callData?.callerExitedPenalty ? ` · ${formatUsdc(callData.callerExitedPenalty)} slashed` : ''}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>
              The caller is no longer in this market. The call still settles at expiry.
            </div>
          </div>
        )}

        {/* Header identity row — handle only (AUTH-44). Caller accuracy/streak
            header stats have NO source on this page → HIDDEN (D-07; no extra
            profile fetch added). The prototype's eye-icon header button has no
            backing feature → CUT (D-08); its unwired Share twin (no live-call
            share wiring exists) is cut with it — settled receipts carry the
            real share intents (D-09). */}
        <div className="spread" style={{ marginBottom: 24, alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
          <div className="row" style={{ gap: 14 }}>
            <span className={`avatar lg ${avatarGradClass(displayHandle)}`} aria-hidden="true">
              {avatarInitial(displayHandle)}
            </span>
            <div className="col" style={{ gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 900, letterSpacing: '-0.02em' }}>
                {displayHandle}
              </span>
              {/* C3/D-07: rep only from the REAL profile fetch — the live-state
                  repScore is a hardcoded 0 and is hidden, never faked */}
              {callerProfile && (
                <span className="mono" style={{ fontSize: 11, color: 'var(--accent-win)' }}>
                  {callerProfile.globalRep} rep
                </span>
              )}
            </div>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {/* C2: pulsing LIVE only while genuinely live; expired+unsettled is
                the amber AWAITING SETTLEMENT state — never both, never neither */}
            {callData?.status === 'live' && !isCallExpired && (
              <span className="pill win">
                <span className="live-dot" />
                LIVE
              </span>
            )}
            {isAwaitingSettlement && (
              <span
                className="pill"
                style={{ color: 'var(--accent-warning)', borderColor: 'var(--accent-warning)' }}
              >
                AWAITING SETTLEMENT
              </span>
            )}
            {/* C4: VERIFIED CRITERIA only for REAL criteria — hidden when the
                criteria text is absent or the hash is the 0x…01 sentinel */}
            {callData?.criteriaText &&
              callData?.criteriaHash &&
              callData.criteriaHash !== CRITERIA_HASH_SENTINEL && (
                <span className="pill win">VERIFIED CRITERIA</span>
              )}
          </div>
        </div>

        {/* THE CALL overline + market statement (.h-statement Archivo voice;
            28px desktop / 22px mobile per plan) */}
        <div className="label-overline" style={{ marginBottom: 16 }}>
          THE CALL · {displayCategory.toUpperCase()}
        </div>
        <div
          className="h-statement"
          style={{ fontSize: isMobile ? 22 : 28, margin: '0 0 24px', maxWidth: '24ch', opacity: isCallerExited ? 0.8 : 1 }}
        >
          {displayMarketLine}
        </div>

        {/* Stat row — time left (JBM countdown), stake, conviction. The
            prototype's "Current spread" oracle stat and its category-average
            sub have NO source on this page → CUT (D-07). Wraps 2-up below
            768px (UI-48). */}
        <div className="row" style={{ gap: 14, marginBottom: 24, alignItems: 'stretch', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          <div className="stat-block" style={{ flex: isMobile ? '1 1 45%' : 1 }}>
            <div className="stat-label">Time left</div>
            <div className="stat-value">
              <LiveCountdown expiry={displayExpiry} />
            </div>
            <div className="stat-sub">
              settles {new Date(Number(displayExpiry) * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </div>
          <div className="stat-block" style={{ flex: isMobile ? '1 1 45%' : 1 }}>
            <div className="stat-label">Stake</div>
            <div className="stat-value">{formatUsdc(displayStake)}</div>
            <div className="stat-sub">caller&apos;s commit</div>
          </div>
          <div className="stat-block" style={{ flex: isMobile ? '1 1 45%' : 1 }}>
            <div className="stat-label">Conviction</div>
            <div className="stat-value" style={{ color: 'var(--accent-win)' }}>{displayConviction}%</div>
            <div className="stat-sub">permanent on settle</div>
          </div>
        </div>

          {/* Market positioning — odds split bar over the existing FFM-derived
              followPct/fadePct (key_link: never fabricated percentages,
              T-09.2-26) + pool stats from the live 5s-polled reserves. */}
          <div
            style={{
              padding: isMobile ? 16 : 20,
              background: 'var(--bg-quaternary)',
              border: '1px solid var(--border-subtle)',
              marginBottom: 24,
            }}
          >
            <div className="spread" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div className="label-overline">Market positioning</div>
                <div className="row" style={{ gap: 16, marginTop: 6, alignItems: 'baseline' }}>
                  <span
                    style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em', color: 'var(--accent-win)' }}
                  >
                    {followPct}%
                  </span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.08em', fontWeight: 700 }}>
                    FOLLOW
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>·</span>
                  <span
                    style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em', color: 'var(--accent-loss)' }}
                  >
                    {fadePct}%
                  </span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.08em', fontWeight: 700 }}>
                    FADE
                  </span>
                </div>
              </div>
            </div>

            {/* Odds split — .brutal-bar.split (win/loss fills, 2px black gap,
                0.4s fill transition from the class recipe) */}
            <div className="brutal-bar split" role="img" aria-label={`${followPct}% follow`}>
              <div className="follow" style={{ flexBasis: `${followPct}%` }} />
              <div className="gap" />
              <div className="fade" style={{ flexBasis: `${fadePct}%` }} />
            </div>

            {/* Pool stats — existing FFM reserve/position derivations; the
                "your position" block renders ONLY when the viewer holds one
                (D-07: null fields hidden). Positions COUNT has no source →
                not rendered (D-07). */}
            <div className="row" style={{ gap: 14, marginTop: 14, alignItems: 'stretch', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
              <div className="stat-block" style={{ flex: isMobile ? '1 1 45%' : 1 }}>
                <div className="stat-label">Follow pool</div>
                <div className="stat-value" style={{ fontSize: 16, color: 'var(--accent-win)' }}>{formatUsdc(followReserve)}</div>
              </div>
              <div className="stat-block" style={{ flex: isMobile ? '1 1 45%' : 1 }}>
                <div className="stat-label">Fade pool</div>
                <div className="stat-value" style={{ fontSize: 16, color: 'var(--accent-loss)' }}>{formatUsdc(fadeReserve)}</div>
              </div>
              <div className="stat-block" style={{ flex: isMobile ? '1 1 45%' : 1 }}>
                <div className="stat-label">Total pot</div>
                <div className="stat-value" style={{ fontSize: 16 }}>{formatUsdc(total)}</div>
              </div>
              {(userIsFollower || userIsFader) && (
                <div className="stat-block" style={{ flex: isMobile ? '1 1 45%' : 1 }}>
                  <div className="stat-label">Your position</div>
                  <div className="stat-value" style={{ fontSize: 16 }}>{formatUsdc(userPositionValue)}</div>
                  <div className="stat-sub">{userIsFollower ? 'following' : 'fading'}</div>
                </div>
              )}
            </div>
          </div>

          {/* ── CTA row — each opens the EXISTING amount-based modal via the
              existing setter (D-06; T-09.2-24 handler-identifier gate). Mobile:
              full-width stacked column, .btn.big ≥44px targets (UI-48). The
              CHALLENGE CTA renders only when the caller is open to challenges
              (existing gate — no dead button, D-08); the inline guard logic is
              kept verbatim. */}
          <div
            data-receipt-action-row
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              gap: 12,
              marginBottom: 24,
            }}
          >
            {/* FOLLOW — cream press-physics CTA.
                B6: handler guarded on isCallActionable (modal cannot open on an
                expired/non-Live call), button also carries `disabled`. */}
            <button
              onClick={() => { if (user && isCallActionable) setIsFollowModalOpen(true); }}
              disabled={!isCallActionable}
              className="btn cream big"
              style={{
                flex: isMobile ? undefined : 1.2,
                width: isMobile ? '100%' : undefined,
                cursor: isCallActionable ? undefined : 'not-allowed',
                opacity: isCallActionable ? 1 : 0.5,
              }}
            >
              ↗ FOLLOW THIS CALL
            </button>
            {/* FADE — loss outline (B6 gate mirrors FOLLOW) */}
            <button
              onClick={() => { if (user && isCallActionable) setIsFadeModalOpen(true); }}
              disabled={!isCallActionable}
              className="btn fade big"
              style={{
                flex: isMobile ? undefined : 1,
                width: isMobile ? '100%' : undefined,
                cursor: isCallActionable ? undefined : 'not-allowed',
                opacity: isCallActionable ? 1 : 0.5,
              }}
            >
              FADE · BET AGAINST
            </button>
            {/* CHALLENGE — duel identity outline (Surface 6, T-3-06-02 self-challenge guard) */}
            {callData?.openToChallenges && (
              <button
                onClick={() => {
                  if (!user) return;
                  // B6: never open the challenge form on an expired/non-Live call
                  if (!isCallActionable) return;
                  // T-3-06-02: prevent self-challenge from UI
                  if (userIsCaller) {
                    setChallengeToast({ text: "You can't challenge your own call.", isError: true });
                    return;
                  }
                  if (!callData?.openToChallenges) {
                    setChallengeToast({ text: "This caller isn't open to challenges right now.", isError: true });
                    return;
                  }
                  setIsChallengeFormOpen(true);
                }}
                disabled={!isCallActionable}
                className="btn duel big"
                style={{
                  flex: isMobile ? undefined : 1,
                  width: isMobile ? '100%' : undefined,
                  cursor: user && isCallActionable ? 'pointer' : 'not-allowed',
                  opacity: user && isCallActionable ? 1 : 0.5,
                }}
              >
                ⚔ CHALLENGE {displayHandle}
              </button>
            )}
          </div>

          {/* B6: inert reason text — rendered only when actions are gated */}
          {!isCallActionable && (
            <div
              className="mono"
              style={{
                fontSize: 11,
                color: 'var(--text-tertiary)',
                letterSpacing: '0.04em',
                marginTop: -12,
                marginBottom: 24,
              }}
            >
              {isCallExpired
                ? 'call expired — awaiting settlement'
                : 'call is no longer live — follow/fade/challenge closed'}
            </div>
          )}

          {/* REASONING — prototype quote treatment (.label-overline header) */}
          {displayReasoning && (
            <div style={{ marginTop: 4, padding: '18px 22px', borderLeft: '3px solid var(--border-strong)' }}>
              <div className="label-overline" style={{ marginBottom: 10 }}>
                Reasoning · from the caller
              </div>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: 'var(--text-primary)' }}>
                {displayReasoning}
              </p>
            </div>
          )}

          {/* RESOLUTION CRITERIA — tinted accent block; the existing WORKING
              collapse toggle stays (criteria text in mono — §15.3) */}
          {callData?.criteriaText && (
            <div
              style={{
                marginTop: 16,
                padding: '16px 22px',
                background: 'rgba(232,245,66,0.04)',
                borderLeft: '3px solid var(--accent-win)',
              }}
            >
              <button
                onClick={() => setCriteriaExpanded(!criteriaExpanded)}
                className="label-overline"
                style={{ color: 'var(--accent-win)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                VERIFIED RESOLUTION CRITERIA {criteriaExpanded ? '↑' : '↓'}
              </button>
              {criteriaExpanded && (
                <p className="mono" style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {callData.criteriaText}
                </p>
              )}
            </div>
          )}

          {/* ── Hero footer — caller/position exit affordances (SOCIAL-49/50).
              Existing conditional rendering + handlers wired to the rethemed
              exit modals (09.2-08, D-06). Rendered only when the viewer holds
              an exit-capable role (no dead controls, D-08). */}
          {(userIsCaller || userIsFollower || userIsFader) && (
            <div
              className="spread"
              style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: 10 }}
            >
              {userIsCaller && (
                callerLockPassed ? (
                  <button
                    onClick={() => setIsCallerExitModalOpen(true)}
                    className="mono"
                    style={{
                      fontSize: 11,
                      letterSpacing: '0.04em',
                      color: 'var(--accent-warning)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline',
                      minHeight: 44,
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    Exit your call · current penalty: {callerPenaltyPct}% →
                  </button>
                ) : (
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.04em' }}>
                    Caller exit locked for {formatTimeLeft(callerLockExpires)} more · callers cannot exit during the first 24 hours
                  </span>
                )
              )}
              {(userIsFollower || userIsFader) && (
                positionCooldownPassed ? (
                  <button
                    onClick={() => setIsPositionExitModalOpen(true)}
                    className="mono"
                    style={{
                      fontSize: 11,
                      letterSpacing: '0.04em',
                      color: 'var(--text-tertiary)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline',
                      minHeight: 44,
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    Exit position · 10% penalty →
                  </button>
                ) : (
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.04em' }}>
                    Position exit locked for {formatTimeLeft(
                      userIsFollower ? userFollowEntryUnlock : userFadeEntryUnlock
                    )} more · new positions wait 4 hours
                  </span>
                )
              )}
            </div>
          )}
        </div>

      {/* ── Phase 3: Challenge toast — wiring untouched; error accent stays
          #F87171 (= var(--accent-loss)); chrome on the token layer ── */}
      {challengeToast && (
        <div
          className="mono"
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            zIndex: 200,
            backgroundColor: 'var(--bg-secondary)',
            border: '2px solid var(--border-active)',
            borderLeft: `4px solid ${challengeToast.isError ? '#F87171' : 'var(--accent-win)'}`,
            padding: '14px 18px',
            fontSize: 13,
            color: 'var(--text-primary)',
            maxWidth: 340,
          }}
        >
          {challengeToast.text}
        </div>
      )}

      {/* ── Pending challenge block (Surface 7) — .brutal-card.heavy with the
          duel-purple identity pill. Accept/reject handlers + the USDC approve
          preflight (T-3-06-06, SOCIAL-31 matching-stake formula) are kept
          VERBATIM — only the chrome changes (T-09.2-24). ── */}
      {pendingChallenge && (
        <div className="brutal-card heavy" style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <span className="pill duel">⚔ 1V1 DUEL · PENDING</span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>
              {pendingChallenge.challengerHandle} challenged this call ·{' '}
              {displayHandle} has{' '}
              {Math.max(0, Math.floor((Number(pendingChallenge.proposedAt) + 86400 - Date.now() / 1000) / 3600))}h to accept or reject
            </span>
          </div>

          {/* Caller-only accept/reject section (SOCIAL-49) */}
          {userIsCaller && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p className="mono" style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.5 }}>
                You have {Math.max(0, Math.floor((Number(pendingChallenge.proposedAt) + 86400 - Date.now() / 1000) / 3600))}h to accept or reject this challenge.
                Accepting will lock {formatUsdc(callerMatchingStake)} USDC (your matching stake).
              </p>
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 10, alignItems: isMobile ? 'stretch' : 'center', flexWrap: 'wrap' }}>
                {callerNeedsApproval ? (
                  /* Step 1: Approve USDC (T-3-06-06) */
                  <button
                    onClick={() => void handleChallengeApprove()}
                    disabled={challengeApproving || ceApproveConfirming}
                    className="btn cream"
                    style={{
                      width: isMobile ? '100%' : undefined,
                      minHeight: 44,
                      opacity: (challengeApproving || ceApproveConfirming) ? 0.5 : 1,
                      cursor: (challengeApproving || ceApproveConfirming) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {(challengeApproving || ceApproveConfirming) ? 'APPROVING…' : `APPROVE USDC (${formatUsdc(callerMatchingStake)})`}
                  </button>
                ) : (
                  /* Step 2: Accept challenge (callerMatchingStake = min(callerInputStake, challengerStake) — SOCIAL-31) */
                  <button
                    onClick={() => void handleChallengeAccept()}
                    disabled={challengeAccepting || isZeroCE}
                    className="btn cream"
                    style={{
                      width: isMobile ? '100%' : undefined,
                      minHeight: 44,
                      opacity: (challengeAccepting || isZeroCE) ? 0.5 : 1,
                      cursor: (challengeAccepting || isZeroCE) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {challengeAccepting ? 'ACCEPTING…' : 'ACCEPT CHALLENGE ▸'}
                  </button>
                )}

                {/* Reject path */}
                {!rejectConfirmOpen ? (
                  <button
                    onClick={() => setRejectConfirmOpen(true)}
                    className="btn outline-white"
                    style={{ width: isMobile ? '100%' : undefined, minHeight: 44 }}
                  >
                    REJECT CHALLENGE
                  </button>
                ) : (
                  <div className="mono" style={{ display: 'flex', flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: 'var(--text-tertiary)' }}>
                    <span>This will immediately refund {pendingChallenge.challengerHandle}&apos;s stake. Are you sure?</span>
                    <button
                      onClick={() => setRejectConfirmOpen(false)}
                      className="btn ghost"
                      style={{ minHeight: 44 }}
                    >
                      Keep call open
                    </button>
                    <button
                      onClick={() => void handleChallengeReject()}
                      disabled={challengeRejecting}
                      className="btn fade"
                      style={{ minHeight: 44, cursor: challengeRejecting ? 'not-allowed' : 'pointer', opacity: challengeRejecting ? 0.5 : 1 }}
                    >
                      {challengeRejecting ? 'Rejecting…' : 'Yes, reject'}
                    </button>
                  </div>
                )}
              </div>

              {isZeroCE && (
                <p className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>
                  ChallengeEscrow not yet deployed — accepting enabled after operator deploy (03-03)
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Two-column: ACTIVITY (left) + QUOTE CALLS (right) — prototype
          section-divider + .activity-row recipes over the existing 5s-polled
          activityFeed/quoteCalls data. Handles only (AUTH-44). Mobile stacks
          to a single column, activity first. The quote-calls column is a
          READ-ONLY display surface (NOT the composer). Quotes section is
          HIDDEN entirely when empty (D-07). */}
      <div
        style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? 16 : 24,
          alignItems: 'flex-start',
          marginTop: 32,
          marginBottom: 24,
        }}
      >
        {/* Left: activity feed (D-08) */}
        <div style={{ flex: 3, width: isMobile ? '100%' : undefined, minWidth: 0 }}>
          <div className="section-divider" style={{ marginTop: 0 }}>
            <span className="title">
              <span className="live-dot" />
              ACTIVITY · UPDATING
            </span>
            <span className="line" />
            {activityFeed.length > 0 && (
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
                {activityFeed.length} actions
              </span>
            )}
          </div>

          {activityFeed.length === 0 ? (
            <div className="mono" style={{ padding: '16px 0', fontSize: 12, color: 'var(--text-tertiary)', letterSpacing: '0.04em' }}>
              No activity yet.
            </div>
          ) : (
            <div className="col" style={{ gap: 0 }}>
              {activityFeed.slice(0, 20).map((entry) => {
                // Side → pill color: follow=win, fade=loss, exits=neutral
                const sidePill =
                  entry.action === 'followed' ? 'win' : entry.action === 'faded' ? 'loss' : 'neutral';
                const actionLabel =
                  entry.action === 'followed' ? 'FOLLOWED' :
                  entry.action === 'faded' ? 'FADED' :
                  entry.action === 'caller_exited' ? 'CALLER EXITED' :
                  'EXITED';
                return (
                  <div key={entry.id} className="activity-row">
                    <span className={`avatar sm ${avatarGradClass(entry.handle)}`} aria-hidden="true">
                      {avatarInitial(entry.handle)}
                    </span>
                    <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                      {/* handle only — AUTH-44 */}
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{entry.handle}</span>
                      <span className={`pill ${sidePill}`}>{actionLabel}</span>
                      {entry.amountUsdc > 0n && (
                        <span className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {formatUsdc(entry.amountUsdc)}
                        </span>
                      )}
                    </div>
                    <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-tertiary)', letterSpacing: '0.04em' }}>
                      {formatRelativeTime(entry.timestamp)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: quote calls (SOCIAL-44/45) — hidden when empty (D-07) */}
        {quoteCalls.length > 0 && (
          <div style={{ flex: 2, width: isMobile ? '100%' : undefined, minWidth: 0 }}>
            <div className="section-divider" style={{ marginTop: 0 }}>
              <span className="title">QUOTE CALLS · {quoteCalls.length}</span>
              <span className="line" />
            </div>

            <div className="col" style={{ gap: 12 }}>
              {quoteCalls.slice(0, 10).map((entry) => (
                <div key={String(entry.id)} className="brutal-card" style={{ padding: 18 }}>
                  <div className="spread" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <span className={`avatar sm ${avatarGradClass(entry.handle)}`} aria-hidden="true">
                        {avatarInitial(entry.handle)}
                      </span>
                      {/* handle only — AUTH-44 */}
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{entry.handle}</span>
                    </div>
                    {/* FOLLOWING/FADING stance pill — SOCIAL-45 */}
                    <span className={`pill ${entry.stance === 'following' ? 'win' : 'loss'}`}>
                      {entry.stance === 'following' ? 'FOLLOWING' : 'FADING'}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                    {entry.marketLine}
                  </p>
                  <Link
                    href={`/call/${entry.id}`}
                    className="mono"
                    style={{
                      fontSize: 11,
                      color: 'var(--text-tertiary)',
                      textDecoration: 'none',
                      letterSpacing: '0.04em',
                      marginTop: 10,
                      minHeight: 44,
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    view quote call ↗
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      <FollowFadeModal
        open={isFollowModalOpen}
        onClose={() => setIsFollowModalOpen(false)}
        callId={callId}
        side="follow"
        followReserve={followReserve}
        fadeReserve={fadeReserve}
        followTotalShares={followTotalShares}
        fadeTotalShares={fadeTotalShares}
        userPosition={userFollowPosition}
        userBalance={usdcBalance}
        onSubmit={handleFollow}
      />

      <FollowFadeModal
        open={isFadeModalOpen}
        onClose={() => setIsFadeModalOpen(false)}
        callId={callId}
        side="fade"
        followReserve={followReserve}
        fadeReserve={fadeReserve}
        followTotalShares={followTotalShares}
        fadeTotalShares={fadeTotalShares}
        userPosition={userFadePosition}
        userBalance={usdcBalance}
        onSubmit={handleFade}
      />

      <CallerExitModal
        open={isCallerExitModalOpen}
        onClose={() => setIsCallerExitModalOpen(false)}
        callId={callId}
        penaltyPct={callerPenaltyPct}
        penaltyUsdc={callerPenaltyUsdc}
        stakeReturned={callerStakeReturned}
        repDelta={
          callData ? computeCallerExitRepDelta(callData.createdAt, callData.expiry, nowSec) : -35
        }
        onSubmit={handleCallerExit}
      />

      <PositionExitModal
        open={isPositionExitModalOpen}
        onClose={() => setIsPositionExitModalOpen(false)}
        callId={callId}
        side={userIsFollower ? 'follow' : 'fade'}
        positionValue={userPositionValue}
        slash={positionSlash}
        userReceives={positionUserReceives}
        onSubmit={handlePositionExit}
      />

      {/* Phase 3: ChallengeFormModal — opens from Challenge button in action row */}
      <ChallengeFormModal
        open={isChallengeFormOpen}
        onClose={() => setIsChallengeFormOpen(false)}
        callId={callId}
        callerHandle={displayHandle}
        callerStake={displayStake}
        marketLine={displayMarketLine}
        onSuccess={() => {
          // After challenge sent, poll for the new pending challenge notification
          void fetchPendingChallenge(callIdNum, userAddress).then(setPendingChallenge);
        }}
      />
    </div>
  );
}
