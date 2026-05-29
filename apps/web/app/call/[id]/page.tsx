/**
 * /call/[id] — Live Receipt Page
 *
 * The primary user-facing vertical slice of Phase 2.
 * Renders the full §15.3 layout for a live or CallerExited call:
 *   - Sticky caller header with CALLER EXITED amber banner (SOCIAL-25)
 *   - THE CALL hero (market line, conviction bar, criteria badge)
 *   - 4-stat row (current spread, time left, stake, conviction)
 *   - MarketPositioningBar (live followReserve/fadeReserve — D-07)
 *   - 3 action buttons (Follow filled / Fade outline / Challenge orange-outline)
 *   - REASONING block + optional collapsible RESOLUTION CRITERIA
 *   - Two-column: ActivityFeed (left) + QuoteCallsColumn (right)
 *   - Caller-specific exit controls (after 24h lock)
 *   - Position-holder exit controls (after 4h cooldown)
 *
 * LIVE STATE: useReadContracts with 5s refetchInterval (D-07) reads 8 values from FFM.
 * No inline contract addresses — imports FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA constant.
 * FLEXBOX ONLY — no CSS grid (Pitfall 15, Satori constraint applied consistently).
 *
 * Requirements: SOCIAL-05..08, SOCIAL-10..13, SOCIAL-17..19, SOCIAL-22..23,
 *               SOCIAL-25, SOCIAL-44..45, SOCIAL-49..50, UI-06..07
 * Spec: §15.3 Live Receipt page layout (BINDING DESIGN CONTRACT)
 * Threat: T-02-08-03 (wallet address never rendered — AUTH-44)
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount, useReadContracts, useWriteContract } from 'wagmi';
import Link from 'next/link';
import {
  MarketPositioningBar,
  FollowFadeModal,
  CallerExitModal,
  PositionExitModal,
  Receipt,
} from '@call-it/ui';
import { FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA } from '@call-it/shared';
import { followFadeMarketAbi } from '@/lib/abis';
import {
  computeCallerExitPenaltyPct,
  computeCallerExitRepDelta,
  POSITION_EXIT_PENALTY_PCT,
  CALLER_EXIT_LOCK_DURATION,
  POSITION_EXIT_COOLDOWN,
} from '@call-it/shared';

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

// ─── Constants ────────────────────────────────────────────────────────────────

/** FFM contract address — CONSTANT, never inlined */
const FFM_ADDR = FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA as `0x${string}`;

const RELAYER_URL = process.env['NEXT_PUBLIC_RELAYER_URL'] ?? '';

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
    };
  } catch {
    return null;
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

// ─── Page component ───────────────────────────────────────────────────────────

export default function CallPage() {
  const params = useParams<{ id: string }>();
  const callId = BigInt(params.id ?? '0');
  const callIdNum = params.id ?? '0';

  const { user } = usePrivy();
  const { address: userAddress } = useAccount();

  // Call metadata from relayer
  const [callData, setCallData] = useState<CallData | null>(null);
  const [activityFeed, setActivityFeed] = useState<ActivityEntry[]>([]);
  const [quoteCalls, setQuoteCalls] = useState<QuoteEntry[]>([]);
  const [criteriaExpanded, setCriteriaExpanded] = useState(false);
  const [isLoadingCall, setIsLoadingCall] = useState(true);

  // Modal states
  const [isFollowModalOpen, setIsFollowModalOpen] = useState(false);
  const [isFadeModalOpen, setIsFadeModalOpen] = useState(false);
  const [isCallerExitModalOpen, setIsCallerExitModalOpen] = useState(false);
  const [isPositionExitModalOpen, setIsPositionExitModalOpen] = useState(false);

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

  // ─── Data fetching ────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    const [call, feed, quotes] = await Promise.all([
      fetchCallData(callIdNum),
      fetchActivityFeed(callIdNum),
      fetchQuoteCalls(callIdNum),
    ]);
    if (call) setCallData(call);
    setActivityFeed(feed);
    setQuoteCalls(quotes);
    setIsLoadingCall(false);
  }, [callIdNum]);

  useEffect(() => {
    void fetchAll();
    // Activity feed + quote-calls polled at 5s (D-08, reusing D-24 pattern)
    const interval = setInterval(() => { void fetchAll(); }, 5000);
    return () => clearInterval(interval);
  }, [fetchAll]);

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
            {/* CHALLENGE — orange-outline, disabled (Phase 3 stub) */}
            <button
              disabled
              title="Challenges coming soon"
              style={{
                flex: 1,
                fontFamily: 'monospace',
                fontSize: '13px',
                fontWeight: 700,
                color: '#FB923C',
                backgroundColor: 'transparent',
                border: '2px solid #FB923C',
                padding: '14px 16px',
                cursor: 'not-allowed',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                opacity: 0.5,
              }}
            >
              Challenge (soon)
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
    </div>
  );
}
