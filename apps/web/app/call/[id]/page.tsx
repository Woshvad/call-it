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
import { useParams } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount, useReadContracts, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import Link from 'next/link';
import {
  MarketPositioningBar,
  FollowFadeModal,
  CallerExitModal,
  PositionExitModal,
  Receipt,
  Stamp,
} from '@call-it/ui';
import {
  FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA,
  CHALLENGE_ESCROW_ARBITRUM_SEPOLIA,
  USDC_ARB_NATIVE,
} from '@call-it/shared';
import { getOutcomeWordResult } from '@/lib/outcome-word';
import { followFadeMarketAbi } from '@/lib/abis';
import {
  computeCallerExitPenaltyPct,
  computeCallerExitRepDelta,
  POSITION_EXIT_PENALTY_PCT,
  CALLER_EXIT_LOCK_DURATION,
  POSITION_EXIT_COOLDOWN,
} from '@call-it/shared';
import { ChallengeFormModal } from '@/app/components/ChallengeFormModal';

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
  status: 'Live' | 'CallerExited' | 'Settled' | 'Disputed';
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
  pnl: bigint;          // P&L in USDC (6 decimal) — can be negative
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

// ─── Constants ────────────────────────────────────────────────────────────────

/** FFM contract address — CONSTANT, never inlined */
const FFM_ADDR = FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA as `0x${string}`;

/** ChallengeEscrow address — imported from @call-it/shared (T-3-06-05) */
const CE_ADDR = CHALLENGE_ESCROW_ARBITRUM_SEPOLIA as `0x${string}`;

/** USDC native on Arbitrum (canonical) */
const USDC_ADDR = USDC_ARB_NATIVE as `0x${string}`; // IN-05: imported from @call-it/shared

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
    return {
      id: BigInt(raw['id'] as string ?? callId),
      caller: String(raw['caller'] ?? ''),
      handle: String(raw['handle'] ?? `call #${callId}`),
      marketLine: String(raw['marketLine'] ?? 'Call'),
      category: String(raw['category'] ?? 'Majors'),
      stake: BigInt(String(raw['stake'] ?? '0')),
      conviction: Number(raw['conviction'] ?? 50),
      expiry: BigInt(String(raw['expiry'] ?? '0')),
      createdAt: BigInt(String(raw['createdAt'] ?? '0')),
      reasoning: String(raw['reasoning'] ?? ''),
      criteriaText: raw['criteriaText'] ? String(raw['criteriaText']) : undefined,
      criteriaHash: raw['criteriaHash'] ? String(raw['criteriaHash']) : undefined,
      status: (raw['status'] as CallData['status']) ?? 'Live',
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

/** Fetch FINAL POSITIONS from relayer (subgraph-sourced, sorted P&L desc). */
async function fetchFinalPositions(callId: string): Promise<FinalPosition[]> {
  if (!RELAYER_URL) return [];
  try {
    const res = await fetch(`${RELAYER_URL}/api/calls/${callId}/positions`);
    if (!res.ok) return [];
    const raw = await res.json() as unknown[];
    return (raw as Record<string, unknown>[]).map((e) => ({
      handle: String(e['handle'] ?? ''),
      side: (e['side'] as FinalPosition['side']) ?? 'follow',
      pnl: BigInt(String(e['pnl'] ?? '0')),
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
    const raw = await res.json() as unknown[];
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const entry = raw[0] as Record<string, unknown>;
    return {
      challengeId: BigInt(String(entry['challengeId'] ?? '0')),
      challengerHandle: String(entry['challengerHandle'] ?? 'challenger'),
      challengerStake: BigInt(String(entry['challengerStake'] ?? '0')),
      proposedAt: BigInt(String(entry['proposedAt'] ?? '0')),
    };
  } catch {
    return null;
  }
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function CallPage() {
  const params = useParams<{ id: string }>();
  const callId = BigInt(params.id ?? '0');
  const callIdNum = params.id ?? '0';

  const { user, authenticated } = usePrivy();
  const { address: userAddress } = useAccount();

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

  const { data: contractData } = useReadContracts({
    contracts: [
      { address: FFM_ADDR, abi: followFadeMarketAbi, functionName: 'followReserve', args: [callId] },
      { address: FFM_ADDR, abi: followFadeMarketAbi, functionName: 'fadeReserve', args: [callId] },
      { address: FFM_ADDR, abi: followFadeMarketAbi, functionName: 'followTotalShares', args: [callId] },
      { address: FFM_ADDR, abi: followFadeMarketAbi, functionName: 'fadeTotalShares', args: [callId] },
      { address: FFM_ADDR, abi: followFadeMarketAbi, functionName: 'followShares', args: [callId, userAddr] },
      { address: FFM_ADDR, abi: followFadeMarketAbi, functionName: 'fadeShares', args: [callId, userAddr] },
      { address: FFM_ADDR, abi: followFadeMarketAbi, functionName: 'followEntryTime', args: [callId, userAddr] },
      { address: FFM_ADDR, abi: followFadeMarketAbi, functionName: 'fadeEntryTime', args: [callId, userAddr] },
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

  const isCallerExited = callData?.status === 'CallerExited';
  // Phase 4: settled/disputed branch
  const isSettled = callData?.status === 'Settled' || callData?.status === 'Disputed';
  const isDisputed = callData?.status === 'Disputed';

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

  const handleFollow = useCallback(async (amountIn: bigint, minSharesOut: bigint) => {
    await writeContractAsync({
      address: FFM_ADDR,
      abi: followFadeMarketAbi,
      functionName: 'follow',
      args: [callId, amountIn, minSharesOut],
    });
  }, [callId, writeContractAsync]);

  const handleFade = useCallback(async (amountIn: bigint, minSharesOut: bigint) => {
    await writeContractAsync({
      address: FFM_ADDR,
      abi: followFadeMarketAbi,
      functionName: 'fade',
      args: [callId, amountIn, minSharesOut],
    });
  }, [callId, writeContractAsync]);

  const handleCallerExit = useCallback(async () => {
    await writeContractAsync({
      address: FFM_ADDR,
      abi: followFadeMarketAbi,
      functionName: 'callerExit',
      args: [callId],
    });
  }, [callId, writeContractAsync]);

  const handlePositionExit = useCallback(async () => {
    const side = userIsFollower ? 0 : 1; // 0=Follow, 1=Fade (enum IFollowFadeMarket.Side)
    await writeContractAsync({
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
      const hash = await writeContractAsync({
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
      const hash = await writeContractAsync({
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
      const hash = await writeContractAsync({
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
      // Fetch final positions when settled
      if (call.status === 'Settled' || call.status === 'Disputed') {
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
  if (isLoadingCall && !callData) {
    return (
      <div style={{ padding: '32px', color: '#94A3B8', fontFamily: 'monospace', fontSize: '14px' }}>
        Loading call #{callIdNum}...
      </div>
    );
  }

  // Fall back to minimal placeholder if relayer not available
  const displayHandle = callData?.handle ?? `#${callIdNum}`;
  const displayMarketLine = callData?.marketLine ?? `Call #${callIdNum}`;
  const displayCategory = callData?.category ?? 'Majors';
  const displayStake = callData?.stake ?? 0n;
  const displayConviction = callData?.conviction ?? 50;
  const displayExpiry = callData?.expiry ?? BigInt(Math.floor(Date.now() / 1000) + 86400);
  const displayReasoning = callData?.reasoning ?? '';
  const displayRepScore = callData?.repScore ?? 0;

  // Follow%/Fade% for the 4-stat row
  const total = followReserve + fadeReserve;
  const followPct = total === 0n ? 50 : Number((followReserve * 100n) / total);
  const fadePct = 100 - followPct;

  // User's position on this call (for FollowFadeModal headroom)
  // Simplified: use followPosition/fadePosition in USDC; for now use shares as proxy
  const userFollowPosition = followShares;
  const userFadePosition = fadeShares;

  // ─── SETTLED / DISPUTED RECEIPT RENDER ─────────────────────────────────
  // Phase 4: Renders for Settled + Disputed + CallerExited-settled states.
  // Separated branch to keep the Live receipt clean.
  if (isSettled || (isCallerExited && callData?.outcome)) {
    const handle = callData?.handle ?? `#${callIdNum}`;
    const repScore = callData?.repScore ?? 0;
    const marketLine = callData?.marketLine ?? `Call #${callIdNum}`;
    const conviction = callData?.conviction ?? 50;
    const settledAt = callData?.settledAt;
    const oracleHost = callData?.oracleHost ?? 'oracle';
    const oracleTxHash = callData?.oracleTxHash;
    const finalValue = callData?.finalValue ?? '—';
    const targetValue = callData?.targetValue ?? '—';
    const callerPnl = callData?.pnl ?? 0n;

    const outcomeWord = outcomeWordResult?.word ?? 'CALLED IT';
    const outcomeColor = outcomeWordResult?.color ?? '#4ADE80';
    const outcomeLozenge = outcomeWordResult?.lozenge ?? null;

    // Determine Stamp color token — use brand-accent for accent colors, outcome-win/loss for others
    const stampColor: 'outcome-win' | 'outcome-loss' | 'outcome-contrarian' | 'brand-muted' | 'brand-accent' =
      outcomeWord === 'CALLED IT' ? 'outcome-win' :
      outcomeWord === 'LOUD AND WRONG' ? 'outcome-loss' :
      outcomeWord === 'CONTRARIAN HIT' ? 'outcome-contrarian' :
      outcomeWord === 'COLD CALL' ? 'brand-muted' :
      'brand-accent'; // FADED CORRECTLY

    // FINAL POSITIONS: sort by P&L desc, cap 20/side
    const followers = finalPositions.filter(p => p.side === 'follow').sort((a, b) => Number(b.pnl - a.pnl)).slice(0, 20);
    const faders = finalPositions.filter(p => p.side === 'fade').sort((a, b) => Number(b.pnl - a.pnl)).slice(0, 20);

    return (
      <div style={{ backgroundColor: '#09090E', minHeight: '100vh', padding: '0' }}>
        {/* ── Settled Page Frame: 3px border + 4px corner brackets ─────────── */}
        <div style={{ position: 'relative', border: '3px solid #2E2E42' }}>
          {/* Corner bracket accent (UI-14) */}
          {[
            { top: 0, left: 0, borderTop: '4px solid #E8F542', borderLeft: '4px solid #E8F542' },
            { top: 0, right: 0, borderTop: '4px solid #E8F542', borderRight: '4px solid #E8F542' },
            { bottom: 0, left: 0, borderBottom: '4px solid #E8F542', borderLeft: '4px solid #E8F542' },
            { bottom: 0, right: 0, borderBottom: '4px solid #E8F542', borderRight: '4px solid #E8F542' },
          ].map((s, i) => (
            <div key={i} style={{ position: 'absolute', width: 24, height: 24, ...s }} />
          ))}

        {/* ── Sticky Caller Header ─────────────────────────────────────────── */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 30,
          backgroundColor: '#09090E', borderBottom: '2px solid #2E2E42', padding: '12px 24px',
        }}>
          <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '16px' }}>
              <Link href="/" style={{ fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8', textDecoration: 'none' }}>
                ← Back
              </Link>
              {/* handle only — AUTH-44: NEVER wallet address */}
              <span style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 700, color: '#E8E8E8' }}>
                {handle}
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#E8F542' }}>
                {repScore} rep
              </span>
            </div>
            {/* Share CTA (UI-20) */}
            <button style={{
              fontFamily: 'monospace', fontSize: '13px', fontWeight: 700,
              color: '#09090E', backgroundColor: '#E8F542',
              border: '2px solid #09090E', boxShadow: '3px 3px 0 0 #09090E',
              padding: '8px 16px', cursor: 'pointer',
            }}>
              SHARE THE RECEIPT →
            </button>
          </div>
        </div>

        {/* ── Page content ─────────────────────────────────────────────────── */}
        <div style={{ maxWidth: '1024px', margin: '0 auto', padding: '32px 24px' }}>

          {/* ── Call Statement (UI-15): Syne 48px, target value in #E8F542 ──── */}
          <div style={{ marginBottom: '32px' }}>
            <p style={{
              fontFamily: "'Syne', sans-serif", fontSize: '48px', fontWeight: 800,
              color: '#E8E8E8', lineHeight: 1.2, margin: '0 0 8px 0',
            }}>
              {marketLine}
            </p>
            {settledAt && (
              <p style={{ fontFamily: 'monospace', fontSize: '13px', color: '#94A3B8', margin: 0 }}>
                settled {formatRelativeTime(Number(settledAt))} ·
                settles automatically from{' '}
                <span style={{ color: '#E8F542' }}>{oracleHost}</span>
                {' '}↗
              </p>
            )}
          </div>

          {/* ── OUTCOME HERO (UI-16, UI-44, UI-45): Stamp + 96px outcome word ─ */}
          {!isDisputed && (
            <div style={{
              marginBottom: '32px', padding: '32px',
              backgroundColor: '#0D0D18', border: '2px solid #2E2E42',
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '20px',
            }}>
              {/* Stamp wrapping the 96px outcome word */}
              <Stamp
                word={outcomeWord}
                color={stampColor}
                hexColor={outcomeColor}
              />
              {/* 96px outcome word text (Syne, §14.1 locked color) */}
              <p style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: '96px',
                fontWeight: 800,
                color: outcomeColor,
                lineHeight: 1.0,
                margin: 0,
                letterSpacing: '-0.02em',
              }}>
                {outcomeWord}
              </p>
              {/* Lozenge (CONTRARIAN / FADER WIN) */}
              {outcomeLozenge && (
                <span style={{
                  fontFamily: 'monospace', fontSize: '11px', fontWeight: 700,
                  color: outcomeColor, border: `2px solid ${outcomeColor}`,
                  padding: '3px 10px', textTransform: 'uppercase', letterSpacing: '0.12em',
                }}>
                  {outcomeLozenge}
                </span>
              )}
              {/* Rep delta count-up (UI-45): JetBrains Mono, green/red */}
              <p style={{
                fontFamily: "'Space Grotesk', sans-serif", fontSize: '16px', color: '#94A3B8', margin: 0,
              }}>
                by {handle} ·{' '}
                <span style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  color: displayedRepDelta >= 0 ? '#4ADE80' : '#F87171',
                  fontWeight: 700,
                }}>
                  {displayedRepDelta >= 0 ? '+' : ''}{displayedRepDelta} rep
                </span>
              </p>
            </div>
          )}

          {/* ── PENDING DISPUTE block (UI-23): amber, replaces outcome hero ──── */}
          {isDisputed && (
            <div style={{
              marginBottom: '32px', padding: '24px',
              border: '3px solid #FB923C', backgroundColor: 'rgba(251, 146, 60, 0.06)',
              display: 'flex', flexDirection: 'column', gap: '12px',
            }}>
              <p style={{
                fontFamily: "'Space Grotesk', sans-serif", fontSize: '28px', fontWeight: 700,
                color: '#FB923C', margin: 0,
              }}>
                PENDING DISPUTE
              </p>
              <p style={{ fontFamily: 'monospace', fontSize: '14px', color: '#94A3B8', margin: 0 }}>
                This settlement is under dispute review. The outcome may change. Dispute resolution modal available in a future update.
              </p>
            </div>
          )}

          {/* ── 4-STAT ROW (UI-19): FINAL VALUE / TARGET / CONVICTION / P&L ── */}
          <div style={{
            display: 'flex', flexDirection: 'row', gap: '0px',
            border: '2px solid #2E2E42', marginBottom: '32px',
          }}>
            {[
              { label: 'FINAL VALUE', value: finalValue, color: '#E8E8E8' },
              { label: 'TARGET', value: targetValue, color: '#E8F542' },
              { label: 'CONVICTION', value: `${conviction}%`, color: '#E8F542' },
              {
                label: 'P&L',
                value: callerPnl >= 0n ? `+${formatUsdc(callerPnl)}` : formatUsdc(callerPnl < 0n ? -callerPnl : callerPnl),
                color: callerPnl >= 0n ? '#4ADE80' : '#F87171',
              },
            ].map((cell, i, arr) => (
              <div key={cell.label} style={{
                flex: 1, padding: '14px 16px',
                borderRight: i < arr.length - 1 ? '1px solid #2E2E42' : undefined,
                display: 'flex', flexDirection: 'column', gap: '4px',
              }}>
                <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                  {cell.label}
                </span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '15px', fontWeight: 700, color: cell.color }}>
                  {cell.value}
                </span>
              </div>
            ))}
          </div>

          {/* ── ACTION ROW (UI-20): Share + View All Calls ────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'row', gap: '12px', marginBottom: '32px' }}>
            <button style={{
              flex: 1, fontFamily: 'monospace', fontSize: '13px', fontWeight: 700,
              color: '#09090E', backgroundColor: '#E8F542',
              border: '2px solid #09090E', boxShadow: '4px 4px 0 0 #09090E',
              padding: '16px', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em',
            }}>
              SHARE THE RECEIPT →
            </button>
            <Link href={`/?caller=${encodeURIComponent(handle)}`} style={{ flex: 1, textDecoration: 'none' }}>
              <button style={{
                width: '100%', fontFamily: 'monospace', fontSize: '13px', fontWeight: 700,
                color: '#E8F542', backgroundColor: 'transparent',
                border: '2px solid #E8F542', padding: '16px', cursor: 'pointer',
                textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>
                VIEW ALL CALLS BY {handle}
              </button>
            </Link>
          </div>

          {/* ── FINAL POSITIONS (UI-21): flex row, 2 cols, 20/side max, sorted P&L desc ── */}
          {(followers.length > 0 || faders.length > 0) && (
            <div style={{
              marginBottom: '32px', border: '2px solid #2E2E42', backgroundColor: '#111118',
            }}>
              {/* Header with corner brackets accent */}
              <div style={{
                padding: '12px 16px', borderBottom: '2px solid #2E2E42',
                display: 'flex', flexDirection: 'row', alignItems: 'center', position: 'relative',
              }}>
                {/* 4px accent corner brackets on header */}
                {[
                  { top: 0, left: 0, borderTop: '4px solid #E8F542', borderLeft: '4px solid #E8F542' },
                  { top: 0, right: 0, borderTop: '4px solid #E8F542', borderRight: '4px solid #E8F542' },
                ].map((s, i) => (
                  <div key={i} style={{ position: 'absolute', width: 12, height: 12, ...s }} />
                ))}
                <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, color: '#E8F542', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                  FINAL POSITIONS
                </span>
              </div>
              {/* Two-column flex (NOT grid — Pitfall 15) */}
              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start' }}>
                {/* FOLLOWERS column */}
                <div style={{ flex: 1, borderRight: '1px solid #2E2E42' }}>
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid #2E2E42' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#E8F542', textTransform: 'uppercase', letterSpacing: '0.1em' }}>FOLLOWERS</span>
                  </div>
                  {followers.length === 0 ? (
                    <div style={{ padding: '12px', fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8' }}>None</div>
                  ) : (
                    followers.map((p, i) => (
                      <div key={i} style={{
                        display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 12px', borderBottom: '1px solid #1E1E2E',
                      }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '13px', color: '#E8E8E8' }}>{p.handle}</span>
                        <span style={{
                          fontFamily: 'JetBrains Mono, monospace', fontSize: '12px',
                          color: p.pnl >= 0n ? '#4ADE80' : '#F87171',
                        }}>
                          {p.pnl >= 0n ? '+' : '-'}{formatUsdc(p.pnl < 0n ? -p.pnl : p.pnl)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                {/* FADERS column */}
                <div style={{ flex: 1 }}>
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid #2E2E42' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#F87171', textTransform: 'uppercase', letterSpacing: '0.1em' }}>FADERS</span>
                  </div>
                  {faders.length === 0 ? (
                    <div style={{ padding: '12px', fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8' }}>None</div>
                  ) : (
                    faders.map((p, i) => (
                      <div key={i} style={{
                        display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 12px', borderBottom: '1px solid #1E1E2E',
                      }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '13px', color: '#E8E8E8' }}>{p.handle}</span>
                        <span style={{
                          fontFamily: 'JetBrains Mono, monospace', fontSize: '12px',
                          color: p.pnl >= 0n ? '#4ADE80' : '#F87171',
                        }}>
                          {p.pnl >= 0n ? '+' : '-'}{formatUsdc(p.pnl < 0n ? -p.pnl : p.pnl)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── PROVENANCE LINE (SETTLE-52 / D-10) ────────────────────────────── */}
          <div style={{
            padding: '12px 16px', border: '1px solid #1E1E2E',
            backgroundColor: '#111118', marginBottom: '32px',
            display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
          }}>
            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              SETTLED FROM
            </span>
            <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#E8F542', fontWeight: 700 }}>
              {oracleHost.toUpperCase()}
            </span>
            {settledAt && (
              <>
                <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748B' }}>at</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: '#94A3B8' }}>
                  {new Date(Number(settledAt) * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC')}
                </span>
              </>
            )}
            {oracleTxHash && (
              <a
                href={`https://arbiscan.io/tx/${oracleTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontFamily: 'monospace', fontSize: '11px', color: '#E8F542', textDecoration: 'none' }}
              >
                · view oracle proof ↗
              </a>
            )}
          </div>

        </div>
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ backgroundColor: '#09090E', minHeight: '100vh', padding: '0' }}>

      {/* ── Sticky Caller Header ────────────────────────────────────────────── */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          backgroundColor: '#09090E',
          borderBottom: '2px solid #2E2E42',
          padding: '12px 24px',
        }}
      >
        {/* CALLER EXITED amber banner — SOCIAL-25 */}
        {isCallerExited && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '10px',
              padding: '10px 14px',
              border: '3px solid #FB923C',
              boxShadow: '4px 4px 0 #FB923C',
              backgroundColor: 'rgba(251, 146, 60, 0.06)',
            }}
          >
            <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: '#FB923C', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              CALLER EXITED
            </span>
            {callData?.callerExitedAt && (
              <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8' }}>
                · {displayHandle} exited {formatRelativeTime(Number(callData.callerExitedAt))} before settlement
                {callData.callerExitedPenalty ? ` · ${formatUsdc(callData.callerExitedPenalty)} slashed` : ''}
              </span>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* Left: back link + handle */}
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '16px' }}>
            <Link href="/" style={{ fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8', textDecoration: 'none' }}>
              ← Back to feed
            </Link>
            <span style={{ fontFamily: 'monospace', fontSize: '16px', fontWeight: 700, color: '#E8E8E8' }}>
              {displayHandle}
            </span>
            <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#E8F542' }}>
              {displayRepScore} rep
            </span>
            {/* VERIFIED badge (Phase 1.5 stub) */}
          </div>

          {/* Right: Watch + Share */}
          <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', alignItems: 'center' }}>
            <button
              style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                color: '#94A3B8',
                backgroundColor: 'transparent',
                border: '2px solid #2E2E42',
                padding: '6px 12px',
                cursor: 'pointer',
              }}
            >
              Watch
            </button>
            <button
              style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                fontWeight: 700,
                color: '#09090E',
                backgroundColor: '#E8F542',
                border: '2px solid #09090E',
                boxShadow: '3px 3px 0 0 #09090E',
                padding: '6px 12px',
                cursor: 'pointer',
              }}
            >
              Share ↗
            </button>
          </div>
        </div>

        {/* Caller exit control — only shown to the caller (SOCIAL-49) */}
        {userIsCaller && (
          <div style={{ marginTop: '8px' }}>
            {callerLockPassed ? (
              <button
                onClick={() => setIsCallerExitModalOpen(true)}
                style={{
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  color: '#FB923C',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                }}
              >
                Exit your call · current penalty: {callerPenaltyPct}%
              </button>
            ) : (
              <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8' }}>
                Exit locked for {formatTimeLeft(callerLockExpires)} more. Callers cannot exit during the first 24 hours.
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Page content ───────────────────────────────────────────────────── */}
      <div style={{ maxWidth: '1024px', margin: '0 auto', padding: '24px' }}>

        {/* ── THE CALL Hero ────────────────────────────────────────────────── */}
        <div
          style={{
            position: 'relative',
            border: '3px solid #2E2E42',
            boxShadow: '6px 6px 0 0 #E8F542',
            padding: '28px',
            marginBottom: '24px',
            backgroundColor: '#0D0D18',
            opacity: isCallerExited ? 0.9 : 1,
          }}
        >
          {/* Category label */}
          <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              THE CALL · {displayCategory}
            </span>
            {callData?.criteriaHash && (
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#E8F542',
                  border: '1px solid #E8F542',
                  padding: '2px 6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                VERIFIED CRITERIA
              </span>
            )}
          </div>

          {/* Call statement hero text */}
          <p
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: '36px',
              fontWeight: 800,
              color: '#E8E8E8',
              lineHeight: 1.2,
              margin: '0 0 20px 0',
              opacity: isCallerExited ? 0.7 : 1,
            }}
          >
            {displayMarketLine}
          </p>

          {/* Conviction display (read-only bar) */}
          <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
              Conviction
            </span>
            <div style={{ flex: 1, height: '8px', backgroundColor: '#27272A', position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  height: '100%',
                  width: `${displayConviction}%`,
                  backgroundColor: '#E8F542',
                }}
              />
            </div>
            <span style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 700, color: '#E8F542', whiteSpace: 'nowrap' }}>
              {displayConviction}%
            </span>
          </div>

          {/* 4-stat row */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: '0px',
              border: '2px solid #2E2E42',
              marginBottom: '20px',
            }}
          >
            {/* CURRENT SPREAD */}
            <div
              style={{
                flex: 1,
                padding: '14px 16px',
                borderRight: '1px solid #2E2E42',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Current Spread
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 700, color: '#E8E8E8' }}>
                <span style={{ color: '#E8F542' }}>{followPct}%</span> / <span style={{ color: '#F87171' }}>{fadePct}%</span>
              </span>
            </div>
            {/* TIME LEFT */}
            <div
              style={{
                flex: 1,
                padding: '14px 16px',
                borderRight: '1px solid #2E2E42',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Time Left
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 700, color: '#E8E8E8' }}>
                {formatTimeLeft(displayExpiry)}
              </span>
            </div>
            {/* STAKE */}
            <div
              style={{
                flex: 1,
                padding: '14px 16px',
                borderRight: '1px solid #2E2E42',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Stake
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 700, color: '#E8E8E8' }}>
                {formatUsdc(displayStake)}
              </span>
            </div>
            {/* CONVICTION */}
            <div
              style={{
                flex: 1,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Conviction
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '15px', fontWeight: 700, color: '#E8F542' }}>
                {displayConviction}%
              </span>
            </div>
          </div>

          {/* Market Positioning Bar (live — D-07) */}
          <div style={{ marginBottom: '20px' }}>
            <MarketPositioningBar
              followReserve={followReserve}
              fadeReserve={fadeReserve}
              showPoolSizes
            />
          </div>

          {/* ── 3 Action Buttons ───────────────────────────────────────────── */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: '8px',
              marginBottom: '20px',
            }}
          >
            {/* FOLLOW — filled accent yellow-green */}
            <button
              onClick={() => { if (user) setIsFollowModalOpen(true); }}
              style={{
                flex: 1,
                fontFamily: 'monospace',
                fontSize: '13px',
                fontWeight: 700,
                color: '#09090E',
                backgroundColor: '#E8F542',
                border: '2px solid #09090E',
                boxShadow: '4px 4px 0 0 #09090E',
                padding: '14px 16px',
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Follow this call
            </button>
            {/* FADE — outline dark */}
            <button
              onClick={() => { if (user) setIsFadeModalOpen(true); }}
              style={{
                flex: 1,
                fontFamily: 'monospace',
                fontSize: '13px',
                fontWeight: 700,
                color: '#F87171',
                backgroundColor: 'transparent',
                border: '2px solid #F87171',
                boxShadow: '4px 4px 0 0 #F87171',
                padding: '14px 16px',
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Fade · bet against
            </button>
            {/* CHALLENGE — Phase 3 activated (Surface 6, T-3-06-02 self-challenge guard) */}
            <button
              onClick={() => {
                if (!user) return;
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
              style={{
                flex: 1,
                fontFamily: 'monospace',
                fontSize: '13px',
                fontWeight: 700,
                color: '#FB923C',
                backgroundColor: 'transparent',
                border: '2px solid #FB923C',
                padding: '14px 16px',
                cursor: user ? 'pointer' : 'not-allowed',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                opacity: user ? 1 : 0.5,
              }}
            >
              ⚔ Challenge
            </button>
          </div>

          {/* REASONING block */}
          {displayReasoning && (
            <div
              style={{
                borderLeft: '3px solid #2E2E42',
                paddingLeft: '16px',
                marginBottom: callData?.criteriaText ? '12px' : '0',
              }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'block', marginBottom: '6px' }}>
                Reasoning from caller
              </span>
              <p style={{ fontFamily: 'monospace', fontSize: '13px', color: '#B4B4C8', lineHeight: 1.6, margin: 0 }}>
                {displayReasoning}
              </p>
            </div>
          )}

          {/* RESOLUTION CRITERIA — collapsible (§15.3) */}
          {callData?.criteriaText && (
            <div style={{ borderLeft: '3px solid #2E2E42', paddingLeft: '16px', marginTop: '12px' }}>
              <button
                onClick={() => setCriteriaExpanded(!criteriaExpanded)}
                style={{
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  color: '#E8F542',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                {criteriaExpanded ? 'hide criteria ↑' : 'view criteria ↓'}
              </button>
              {criteriaExpanded && (
                <p style={{ fontFamily: 'monospace', fontSize: '13px', color: '#B4B4C8', lineHeight: 1.6, margin: '8px 0 0 0' }}>
                  {callData.criteriaText}
                </p>
              )}
            </div>
          )}

          {/* Caller exited explanation */}
          {isCallerExited && (
            <p style={{ fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8', marginTop: '16px', marginBottom: 0 }}>
              The caller is no longer in this market. The call still settles at expiry.
            </p>
          )}
        </div>

        {/* ── Receipt card preview (right-aligned, Phase 2 live mode) ──────── */}
        <div style={{ marginBottom: '24px' }}>
          <Receipt
            mode="live"
            data={{
              handle: displayHandle.replace('@', ''),
              marketLine: displayMarketLine,
              conviction: displayConviction,
              deadline: new Date(Number(displayExpiry) * 1000),
              stake: displayStake,
              criteriaHash: callData?.criteriaHash,
            }}
          />
        </div>

        {/* ── Phase 3: Challenge toast ───────────────────────────────────────── */}
        {challengeToast && (
          <div
            style={{
              position: 'fixed',
              top: '24px',
              right: '24px',
              zIndex: 200,
              backgroundColor: '#111118',
              borderLeft: `4px solid ${challengeToast.isError ? '#F87171' : '#4ADE80'}`,
              padding: '14px 18px',
              fontFamily: 'monospace',
              fontSize: '13px',
              color: '#F1F5F9',
              maxWidth: '340px',
            }}
          >
            {challengeToast.text}
          </div>
        )}

        {/* ── Phase 3: Pending challenge notification block (Surface 7) ─────── */}
        {/* Renders when challenge_proposed notification exists for this callId  */}
        {pendingChallenge && (
          <div
            style={{
              borderLeft: '2px solid #FB923C',
              backgroundColor: '#111118',
              padding: '16px 20px',
              marginBottom: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {/* challenge_proposed notification text */}
            <p
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '16px',
                color: '#F1F5F9',
                margin: 0,
              }}
            >
              ⚔ Challenge pending — {pendingChallenge.challengerHandle} challenged this call ·{' '}
              {displayHandle} has{' '}
              {Math.max(0, Math.floor((Number(pendingChallenge.proposedAt) + 86400 - Date.now() / 1000) / 3600))}h to accept or reject
            </p>

            {/* Caller-only accept/reject section (SOCIAL-49) */}
            {userIsCaller && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ fontFamily: 'monospace', fontSize: '13px', color: '#94A3B8', margin: 0 }}>
                  You have {Math.max(0, Math.floor((Number(pendingChallenge.proposedAt) + 86400 - Date.now() / 1000) / 3600))}h to accept or reject this challenge.
                  Accepting will lock {formatUsdc(callerMatchingStake)} USDC (your matching stake).
                </p>
                <div style={{ display: 'flex', flexDirection: 'row', gap: '10px', alignItems: 'center' }}>
                  {callerNeedsApproval ? (
                    /* Step 1: Approve USDC (T-3-06-06) */
                    <button
                      onClick={() => void handleChallengeApprove()}
                      disabled={challengeApproving || ceApproveConfirming}
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        fontWeight: 700,
                        color: '#09090E',
                        backgroundColor: (challengeApproving || ceApproveConfirming) ? '#2E2E42' : '#E8F542',
                        border: '2px solid #09090E',
                        boxShadow: (challengeApproving || ceApproveConfirming) ? 'none' : '4px 4px 0 #09090E',
                        padding: '10px 18px',
                        cursor: (challengeApproving || ceApproveConfirming) ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {(challengeApproving || ceApproveConfirming) ? 'Approving…' : `Approve USDC (${formatUsdc(callerMatchingStake)})`}
                    </button>
                  ) : (
                    /* Step 2: Accept challenge (callerMatchingStake = min(callerInputStake, challengerStake) — SOCIAL-31) */
                    <button
                      onClick={() => void handleChallengeAccept()}
                      disabled={challengeAccepting || isZeroCE}
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        fontWeight: 700,
                        color: '#09090E',
                        backgroundColor: (challengeAccepting || isZeroCE) ? '#2E2E42' : '#4ADE80',
                        border: `2px solid ${(challengeAccepting || isZeroCE) ? '#2E2E42' : '#09090E'}`,
                        boxShadow: (challengeAccepting || isZeroCE) ? 'none' : '4px 4px 0 #09090E',
                        padding: '10px 18px',
                        cursor: (challengeAccepting || isZeroCE) ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {challengeAccepting ? 'Accepting…' : `Accept challenge`}
                    </button>
                  )}

                  {/* Reject path */}
                  {!rejectConfirmOpen ? (
                    <button
                      onClick={() => setRejectConfirmOpen(true)}
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        color: '#F87171',
                        backgroundColor: 'transparent',
                        border: '2px solid #F87171',
                        padding: '10px 18px',
                        cursor: 'pointer',
                      }}
                    >
                      Reject challenge
                    </button>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', alignItems: 'center', flexWrap: 'wrap', fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8' }}>
                      <span>This will immediately refund {pendingChallenge.challengerHandle}&apos;s stake. Are you sure?</span>
                      <button
                        onClick={() => setRejectConfirmOpen(false)}
                        style={{ fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8', backgroundColor: 'transparent', border: '1px solid #2E2E42', padding: '4px 10px', cursor: 'pointer' }}
                      >
                        Keep call open
                      </button>
                      <button
                        onClick={() => void handleChallengeReject()}
                        disabled={challengeRejecting}
                        style={{ fontFamily: 'monospace', fontSize: '12px', color: '#F87171', backgroundColor: 'transparent', border: '2px solid #F87171', padding: '4px 10px', cursor: challengeRejecting ? 'not-allowed' : 'pointer' }}
                      >
                        {challengeRejecting ? 'Rejecting…' : 'Yes, reject'}
                      </button>
                    </div>
                  )}
                </div>

                {isZeroCE && (
                  <p style={{ fontFamily: 'monospace', fontSize: '11px', color: '#94A3B8', margin: 0 }}>
                    ChallengeEscrow not yet deployed — accepting enabled after operator deploy (03-03)
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Two-column content: ActivityFeed (left) + QuoteCalls (right) ─── */}
        <div style={{ display: 'flex', flexDirection: 'row', gap: '24px', alignItems: 'flex-start', marginBottom: '24px' }}>

          {/* Left: Activity feed (D-08) */}
          <div style={{ flex: 3, display: 'flex', flexDirection: 'column', gap: '0px' }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                border: '2px solid #2E2E42',
                borderBottom: 'none',
                backgroundColor: '#0D0D18',
              }}
            >
              {/* Live pulse indicator */}
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#E8F542',
                  display: 'inline-block',
                  boxShadow: '0 0 4px #E8F542',
                }}
              />
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Live Activity
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#94A3B8' }}>
                updating
              </span>
            </div>

            {/* Activity entries */}
            {activityFeed.length === 0 ? (
              <div
                style={{
                  padding: '20px 14px',
                  border: '2px solid #2E2E42',
                  backgroundColor: '#0D0D18',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  color: '#94A3B8',
                }}
              >
                No activity yet — be the first to follow or fade.
              </div>
            ) : (
              activityFeed.slice(0, 20).map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 14px',
                    border: '2px solid #2E2E42',
                    borderTop: 'none',
                    backgroundColor: '#0D0D18',
                  }}
                >
                  <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: '#E8E8E8' }}>
                    {entry.handle}
                  </span>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      color: entry.action === 'followed' ? '#E8F542' : entry.action === 'faded' ? '#F87171' : '#94A3B8',
                    }}
                  >
                    {entry.action === 'followed' ? 'followed with' :
                     entry.action === 'faded' ? 'faded with' :
                     entry.action === 'caller_exited' ? 'exited (caller)' :
                     'exited'}
                  </span>
                  {entry.amountUsdc > 0n && (
                    <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#E8E8E8' }}>
                      {formatUsdc(entry.amountUsdc)}
                    </span>
                  )}
                  <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#94A3B8', marginLeft: 'auto' }}>
                    {formatRelativeTime(entry.timestamp)}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Right: Quote-calls column (D-08, SOCIAL-44, SOCIAL-45) */}
          <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '0px' }}>
            <div
              style={{
                padding: '10px 14px',
                border: '2px solid #2E2E42',
                borderBottom: 'none',
                backgroundColor: '#0D0D18',
              }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Quote Calls
              </span>
            </div>

            {quoteCalls.length === 0 ? (
              <div
                style={{
                  padding: '20px 14px',
                  border: '2px solid #2E2E42',
                  backgroundColor: '#0D0D18',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  color: '#94A3B8',
                }}
              >
                No quote-calls yet.
              </div>
            ) : (
              quoteCalls.slice(0, 10).map((entry) => (
                <div
                  key={String(entry.id)}
                  style={{
                    padding: '12px 14px',
                    border: '2px solid #2E2E42',
                    borderTop: 'none',
                    backgroundColor: '#0D0D18',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 700, color: '#E8E8E8' }}>
                      {entry.handle}
                    </span>
                    {/* FADING/FOLLOWING stance tag — SOCIAL-45 */}
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '10px',
                        fontWeight: 700,
                        color: entry.stance === 'following' ? '#E8F542' : '#F87171',
                        border: `1px solid ${entry.stance === 'following' ? '#E8F542' : '#F87171'}`,
                        padding: '1px 6px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                      }}
                    >
                      {entry.stance === 'following' ? 'FOLLOWING' : 'FADING'}
                    </span>
                  </div>
                  <p style={{ fontFamily: 'monospace', fontSize: '12px', color: '#B4B4C8', margin: 0 }}>
                    {entry.marketLine}
                  </p>
                  <Link
                    href={`/call/${entry.id}`}
                    style={{ fontFamily: 'monospace', fontSize: '11px', color: '#94A3B8', textDecoration: 'none' }}
                  >
                    view quote call ↗
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Position holder exit controls (SOCIAL-50) ─────────────────────── */}
        {(userIsFollower || userIsFader) && (
          <div
            style={{
              padding: '14px 16px',
              border: '2px solid #2E2E42',
              backgroundColor: '#0D0D18',
              marginBottom: '24px',
            }}
          >
            <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Your position — {userIsFollower ? 'Following' : 'Fading'}
            </span>
            <div style={{ marginTop: '8px' }}>
              {positionCooldownPassed ? (
                <button
                  onClick={() => setIsPositionExitModalOpen(true)}
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    color: '#94A3B8',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    textDecoration: 'underline',
                  }}
                >
                  Exit your position · 10% penalty
                </button>
              ) : (
                <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8' }}>
                  Exit locked for {formatTimeLeft(
                    userIsFollower ? userFollowEntryUnlock : userFadeEntryUnlock
                  )} more. New positions must wait 4 hours before exit.
                </span>
              )}
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
