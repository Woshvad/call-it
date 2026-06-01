/**
 * /duel/[challengeId] — Duel Page (§15.5)
 *
 * Full Phase 3 duel interaction surface:
 *   - THE MARKET hero (asset pair 64px Syne, pot, settles-in countdown)
 *   - Two-column duel card (CALLER / VS / CHALLENGER) — flexbox, NEVER grid
 *   - MARKET CONSENSUS · LIVE bar (followReserve / fadeReserve ratio, 5s poll)
 *   - Riding sections (existing FollowFadeMarket follow/fade participants — D-06)
 *   - "Side with [X]" CTAs → Follow / Fade modals on parent call
 *   - Challenge form modal (proposeChallenge — Surface 7)
 *   - Caller-only accept/reject block when challenge is Proposed
 *   - Mobile "Best viewed on desktop" banner at <=768px
 *
 * LIVENESS: 5s setInterval + window focus refetch of /api/duels/:id/live-state (D-10)
 * FLEXBOX ONLY — no display:grid anywhere (Pitfall 15)
 * AUTH-44: wallet address NEVER rendered — handle + rep only
 * CE_ADDR imported from @call-it/shared — never inline hex (T-3-06-05)
 *
 * Requirements: SOCIAL-30, SOCIAL-34, SOCIAL-35, SOCIAL-36, UI-11
 * Spec: §15.5 Duel page layout (BINDING DESIGN CONTRACT)
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import Link from 'next/link';
import { FollowFadeModal } from '@call-it/ui';
import { CHALLENGE_ESCROW_ARBITRUM_SEPOLIA } from '@call-it/shared';
import { ChallengeFormModal } from '@/app/components/ChallengeFormModal';

// ─── Constants ────────────────────────────────────────────────────────────────

/** ChallengeEscrow address — imported from @call-it/shared; never inline hex (T-3-06-05) */
const CE_ADDR = CHALLENGE_ESCROW_ARBITRUM_SEPOLIA as `0x${string}`;

/** USDC native on Arbitrum (canonical) */
const USDC_ADDR = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as `0x${string}`;

const RELAYER_URL = process.env['NEXT_PUBLIC_RELAYER_URL'] ?? '';

/** ChallengeStatus enum ordinals — matches IChallengeEscrow.sol */
const ChallengeStatus = {
  Proposed: 0,
  Accepted: 1,
  Rejected: 2,
  Refunded: 3,
  Settled: 4,
} as const;

// ─── Minimal ABIs ─────────────────────────────────────────────────────────────

/** Minimal ChallengeEscrow ABI for accept / reject */
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

/** Minimal USDC ABI for allowance + approve */
const USDC_ABI = [
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

// ─── Types ────────────────────────────────────────────────────────────────────

type DuelLiveState = {
  challengeId: bigint;
  callId: bigint;
  status: number; // ChallengeStatus ordinal
  caller: string; // address — INTERNAL ONLY, AUTH-44
  callerHandle: string;
  callerStake: bigint;
  callerRep: number;
  callerAccuracy: number;
  callerCategoryAccuracy: number;
  callerStreak: number;
  callerAvatarUrl: string;
  callerPosition: string;
  challenger: string; // address — INTERNAL ONLY, AUTH-44
  challengerHandle: string;
  challengerStake: bigint;
  challengerRep: number;
  challengerAccuracy: number;
  challengerCategoryAccuracy: number;
  challengerStreak: number;
  challengerAvatarUrl: string;
  challengerPosition: string;
  assetA: string;
  assetB: string;
  marketLine: string;
  expiry: bigint;
  proposedAt: bigint;
  openToChallenges: boolean;
  deferred: boolean;
};

type RidingEntry = {
  handle: string;
  amountUsdc: bigint;
  avatarUrl: string;
};

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatUsdc(amount: bigint): string {
  const n = Number(amount) / 1_000_000;
  if (n < 10) return `$${n.toFixed(2)}`;
  return `$${Math.round(n).toLocaleString()}`;
}

function formatTimeLeft(expiry: bigint): string {
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  if (nowSec >= expiry) return 'Expired';
  const diff = Number(expiry - nowSec);
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h ${Math.floor((diff % 3600) / 60)}m`;
}

function hoursRemaining(deadline: bigint): number {
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  if (nowSec >= deadline) return 0;
  return Math.floor(Number(deadline - nowSec) / 3600);
}

// ─── Data fetch helpers ───────────────────────────────────────────────────────

async function fetchDuelLiveState(challengeId: string): Promise<DuelLiveState | null> {
  if (!RELAYER_URL) return null;
  try {
    const res = await fetch(`${RELAYER_URL}/api/duels/${challengeId}/live-state`);
    if (!res.ok) return null;
    const raw = await res.json() as Record<string, unknown>;
    return {
      challengeId: BigInt(String(raw['challengeId'] ?? challengeId)),
      callId: BigInt(String(raw['callId'] ?? '0')),
      status: Number(raw['status'] ?? ChallengeStatus.Proposed),
      caller: String(raw['caller'] ?? ''),
      callerHandle: String(raw['callerHandle'] ?? `caller`),
      callerStake: BigInt(String(raw['callerStake'] ?? '0')),
      callerRep: Number(raw['callerRep'] ?? 0),
      callerAccuracy: Number(raw['callerAccuracy'] ?? 0),
      callerCategoryAccuracy: Number(raw['callerCategoryAccuracy'] ?? 0),
      callerStreak: Number(raw['callerStreak'] ?? 0),
      callerAvatarUrl: String(raw['callerAvatarUrl'] ?? ''),
      callerPosition: String(raw['callerPosition'] ?? ''),
      challenger: String(raw['challenger'] ?? ''),
      challengerHandle: String(raw['challengerHandle'] ?? `challenger`),
      challengerStake: BigInt(String(raw['challengerStake'] ?? '0')),
      challengerRep: Number(raw['challengerRep'] ?? 0),
      challengerAccuracy: Number(raw['challengerAccuracy'] ?? 0),
      challengerCategoryAccuracy: Number(raw['challengerCategoryAccuracy'] ?? 0),
      challengerStreak: Number(raw['challengerStreak'] ?? 0),
      challengerAvatarUrl: String(raw['challengerAvatarUrl'] ?? ''),
      challengerPosition: String(raw['challengerPosition'] ?? ''),
      assetA: String(raw['assetA'] ?? '—'),
      assetB: String(raw['assetB'] ?? '—'),
      marketLine: String(raw['marketLine'] ?? ''),
      expiry: BigInt(String(raw['expiry'] ?? '0')),
      proposedAt: BigInt(String(raw['proposedAt'] ?? '0')),
      openToChallenges: Boolean(raw['openToChallenges'] ?? false),
      deferred: Boolean(raw['deferred'] ?? true),
    };
  } catch {
    return null;
  }
}

async function fetchRidingLists(callId: string): Promise<{ followers: RidingEntry[]; faders: RidingEntry[] }> {
  if (!RELAYER_URL) return { followers: [], faders: [] };
  try {
    const res = await fetch(`${RELAYER_URL}/api/calls/${callId}/live-state`);
    if (!res.ok) return { followers: [], faders: [] };
    const raw = await res.json() as Record<string, unknown>;
    const followers = ((raw['followers'] as unknown[]) ?? []).map((e) => {
      const entry = e as Record<string, unknown>;
      return {
        handle: String(entry['handle'] ?? ''),
        amountUsdc: BigInt(String(entry['amountUsdc'] ?? '0')),
        avatarUrl: String(entry['avatarUrl'] ?? ''),
      };
    });
    const faders = ((raw['faders'] as unknown[]) ?? []).map((e) => {
      const entry = e as Record<string, unknown>;
      return {
        handle: String(entry['handle'] ?? ''),
        amountUsdc: BigInt(String(entry['amountUsdc'] ?? '0')),
        avatarUrl: String(entry['avatarUrl'] ?? ''),
      };
    });
    return { followers, faders };
  } catch {
    return { followers: [], faders: [] };
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Avatar({ url, handle, size, borderColor }: { url: string; handle: string; size: number; borderColor: string }) {
  const initial = handle.replace('@', '').charAt(0).toUpperCase();
  if (url) {
    return (
      <div style={{ width: `${size}px`, height: `${size}px`, borderRadius: '50%', border: `2px solid ${borderColor}`, overflow: 'hidden', flexShrink: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" width={size} height={size} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }
  return (
    <div style={{ width: `${size}px`, height: `${size}px`, borderRadius: '50%', border: `2px solid ${borderColor}`, backgroundColor: '#1A1A24', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: `${Math.floor(size * 0.4)}px`, fontWeight: 700, color: borderColor }}>
      {initial}
    </div>
  );
}

function RidingList({ entries, accentColor, emptyLabel }: { entries: RidingEntry[]; accentColor: string; emptyLabel?: string }) {
  if (entries.length === 0) {
    return (
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '12px', color: '#64748B' }}>
        {emptyLabel ?? 'No one riding yet'}
      </div>
    );
  }
  const visible = entries.slice(0, 5);
  const extra = entries.length - 5;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {visible.map((e, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
          <Avatar url={e.avatarUrl} handle={e.handle} size={24} borderColor={accentColor} />
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '12px', color: '#F1F5F9' }}>{e.handle}</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: '#94A3B8', marginLeft: 'auto' }}>{formatUsdc(e.amountUsdc)}</span>
        </div>
      ))}
      {extra > 0 && (
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '12px', color: accentColor, fontWeight: 700 }}>
          + {extra} more
        </div>
      )}
    </div>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function DuelPage() {
  const params = useParams<{ challengeId: string }>();
  const challengeId = params.challengeId ?? '0';

  const { user } = usePrivy();
  const { address: userAddress } = useAccount();

  const [liveState, setLiveState] = useState<DuelLiveState | null>(null);
  const [ridingFollowers, setRidingFollowers] = useState<RidingEntry[]>([]);
  const [ridingFaders, setRidingFaders] = useState<RidingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number>(0);

  const [isFollowModalOpen, setIsFollowModalOpen] = useState(false);
  const [isFadeModalOpen, setIsFadeModalOpen] = useState(false);
  const [isChallengeFormOpen, setIsChallengeFormOpen] = useState(false);

  // Caller accept/reject state
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [approveTxHash, setApproveTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [acceptTxHash, setAcceptTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [rejectTxHash, setRejectTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [toastMsg, setToastMsg] = useState<{ text: string; isError: boolean } | null>(null);

  // ─── Derived values ─────────────────────────────────────────────────────────
  const userIsCaller = Boolean(
    userAddress && liveState?.caller?.toLowerCase() === userAddress.toLowerCase(),
  );
  const isProposed = liveState?.status === ChallengeStatus.Proposed;
  const callerMatchingStake =
    liveState
      ? liveState.callerStake < liveState.challengerStake
        ? liveState.callerStake
        : liveState.challengerStake
      : 0n;

  const acceptWindowExpiry = liveState
    ? liveState.proposedAt + 86400n
    : 0n;
  const acceptHoursLeft = hoursRemaining(acceptWindowExpiry);

  const isZeroAddr = CE_ADDR === '0x0000000000000000000000000000000000000000';

  // ─── USDC allowance for caller accept path (T-3-06-06) ─────────────────────
  const userAddr =
    (userAddress as `0x${string}` | undefined) ??
    '0x0000000000000000000000000000000000000000';

  const { data: callerAllowanceData, refetch: refetchCallerAllowance } = useReadContract({
    address: USDC_ADDR,
    abi: USDC_ABI,
    functionName: 'allowance',
    args: [userAddr, CE_ADDR],
    query: { enabled: userIsCaller && isProposed && !isZeroAddr },
  });

  const callerAllowance = (callerAllowanceData as bigint | undefined) ?? 0n;
  const callerNeedsApproval =
    !isZeroAddr && userIsCaller && isProposed && callerAllowance < callerMatchingStake;

  // ─── Wagmi writes ────────────────────────────────────────────────────────────
  const { writeContractAsync } = useWriteContract();

  const { isLoading: approveConfirming, isSuccess: approveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveTxHash });
  const { isSuccess: acceptConfirmed } =
    useWaitForTransactionReceipt({ hash: acceptTxHash });
  const { isSuccess: rejectConfirmed } =
    useWaitForTransactionReceipt({ hash: rejectTxHash });

  useEffect(() => {
    if (approveConfirmed) {
      void refetchCallerAllowance();
      setApproving(false);
    }
  }, [approveConfirmed, refetchCallerAllowance]);

  useEffect(() => {
    if (acceptConfirmed) {
      setAccepting(false);
      setToastMsg({ text: 'Challenge accepted — duel is live!', isError: false });
    }
  }, [acceptConfirmed]);

  useEffect(() => {
    if (rejectConfirmed) {
      setRejecting(false);
      setRejectConfirmOpen(false);
      setToastMsg({ text: 'Challenge rejected — stake refunded to challenger.', isError: false });
    }
  }, [rejectConfirmed]);

  // ─── Approve USDC for caller accept ─────────────────────────────────────────
  const handleCallerApprove = useCallback(async () => {
    if (!callerMatchingStake) return;
    setApproving(true);
    try {
      const hash = await writeContractAsync({
        address: USDC_ADDR,
        abi: USDC_ABI,
        functionName: 'approve',
        args: [CE_ADDR, callerMatchingStake],
      });
      setApproveTxHash(hash);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Approval failed';
      setToastMsg({ text: msg, isError: true });
      setApproving(false);
    }
  }, [callerMatchingStake, writeContractAsync]);

  // ─── Accept challenge ────────────────────────────────────────────────────────
  const handleAccept = useCallback(async () => {
    setAccepting(true);
    try {
      const hash = await writeContractAsync({
        address: CE_ADDR,
        abi: CE_ABI,
        functionName: 'acceptChallenge',
        args: [BigInt(challengeId)],
      });
      setAcceptTxHash(hash);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Accept failed';
      setToastMsg({ text: msg, isError: true });
      setAccepting(false);
    }
  }, [challengeId, writeContractAsync]);

  // ─── Reject challenge ────────────────────────────────────────────────────────
  const handleReject = useCallback(async () => {
    setRejecting(true);
    try {
      const hash = await writeContractAsync({
        address: CE_ADDR,
        abi: CE_ABI,
        functionName: 'rejectChallenge',
        args: [BigInt(challengeId)],
      });
      setRejectTxHash(hash);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Reject failed';
      setToastMsg({ text: msg, isError: true });
      setRejecting(false);
    }
  }, [challengeId, writeContractAsync]);

  // ─── Data fetching + 5s liveness poll (D-10) ────────────────────────────────
  const fetchAll = useCallback(async () => {
    const state = await fetchDuelLiveState(challengeId);
    if (state) {
      setLiveState(state);
      setLastUpdated(Date.now());
      if (state.callId > 0n) {
        const { followers, faders } = await fetchRidingLists(String(state.callId));
        setRidingFollowers(followers);
        setRidingFaders(faders);
      }
    }
    setLoading(false);
  }, [challengeId]);

  useEffect(() => {
    void fetchAll();
    const interval = setInterval(() => { void fetchAll(); }, 5_000);
    const onFocus = () => { void fetchAll(); };
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchAll]);

  // ─── Live consensus bar ───────────────────────────────────────────────────────
  // followReserve/fadeReserve from FFM for parent call
  // Inline read via useReadContract
  const callId = liveState?.callId ?? 0n;

  // We rely on the relayer live-state (included in the deferred response or live data)
  // Fallback to 50/50 when data unavailable (per UI-SPEC stale contract)
  const followReserveFromState = 0n; // placeholder — will come from relayer
  const fadeReserveFromState = 0n;

  const staleSeconds = lastUpdated > 0 ? (Date.now() - lastUpdated) / 1000 : 0;
  const isStale = staleSeconds > 15;

  // Market consensus from relayer live-state (if available in response)
  const followReserve =
    liveState && (liveState as DuelLiveState & { followReserve?: bigint }).followReserve !== undefined
      ? (liveState as DuelLiveState & { followReserve?: bigint }).followReserve!
      : followReserveFromState;
  const fadeReserve =
    liveState && (liveState as DuelLiveState & { fadeReserve?: bigint }).fadeReserve !== undefined
      ? (liveState as DuelLiveState & { fadeReserve?: bigint }).fadeReserve!
      : fadeReserveFromState;

  const total = followReserve + fadeReserve;
  const callerPct = total === 0n ? 50 : Number((followReserve * 100n) / total);
  const challengerPct = 100 - callerPct;

  // ─── Loading skeleton ─────────────────────────────────────────────────────────
  if (loading && !liveState) {
    return (
      <div style={{ backgroundColor: '#09090E', minHeight: '100vh', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ height: '24px', backgroundColor: '#1E1E2E', width: '200px' }} />
        <div style={{ height: '200px', backgroundColor: '#111118', border: '1px solid #1E1E2E' }} />
        <div style={{ height: '280px', backgroundColor: '#111118', border: '1px solid #1E1E2E' }} />
      </div>
    );
  }

  const displayChallengerHandle = liveState?.challengerHandle ?? 'challenger';
  const displayCallerHandle = liveState?.callerHandle ?? 'caller';
  const displayCallerStake = liveState?.callerStake ?? 0n;
  const displayChallengerStake = liveState?.challengerStake ?? 0n;
  const displayExpiry = liveState?.expiry ?? 0n;
  const potTotal = displayCallerStake + displayChallengerStake;

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ backgroundColor: '#09090E', minHeight: '100vh', padding: '0' }}>

      {/* ── Toast notification ─────────────────────────────────────────────── */}
      {toastMsg && (
        <div
          style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            zIndex: 200,
            backgroundColor: '#111118',
            borderLeft: `4px solid ${toastMsg.isError ? '#F87171' : '#4ADE80'}`,
            padding: '14px 18px',
            fontFamily: 'monospace',
            fontSize: '13px',
            color: '#F1F5F9',
            maxWidth: '340px',
          }}
        >
          {toastMsg.text}
        </div>
      )}

      {/* ── Mobile "Best viewed on desktop" banner (D-10, Phase 9 contract) ── */}
      <div
        className="mobile-banner"
        style={{
          display: 'none', // hidden on desktop; CSS below overrides at <=768px
        }}
      >
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '12px', fontWeight: 700, color: '#F1F5F9', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          BEST VIEWED ON DESKTOP · Some features may not work on mobile.
        </span>
      </div>
      <style>{`
        @media (max-width: 768px) {
          .mobile-banner {
            display: flex !important;
            flex-direction: row;
            align-items: center;
            justify-content: center;
            padding: 10px 16px;
            background-color: #111118;
            border-top: 2px solid #FB923C;
            border-bottom: 2px solid #FB923C;
          }
        }
      `}</style>

      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          borderBottom: '2px solid #1E1E2E',
          backgroundColor: '#09090E',
        }}
      >
        <Link href="/" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: '#94A3B8', textDecoration: 'none' }}>
          ← Back
        </Link>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px', color: '#94A3B8' }}>
          duel #d/{challengeId} · arbitrum ·{' '}
          <span style={{ color: '#E8F542', opacity: 0.8 }}>LOCKED</span> ·{' '}
          {displayExpiry > 0n ? formatTimeLeft(displayExpiry) : '—'}
        </span>
      </div>

      {/* ── Page content ───────────────────────────────────────────────────── */}
      <div style={{ maxWidth: '1024px', margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '48px' }}>

        {/* ── Caller-only pending block (SOCIAL-49) ──────────────────────── */}
        {userIsCaller && isProposed && liveState && (
          <div
            style={{
              borderLeft: '2px solid #FB923C',
              backgroundColor: '#111118',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '16px', color: '#F1F5F9', margin: 0 }}>
              ⚔ Challenge pending — {liveState.challengerHandle} challenged this call ·{' '}
              You have {acceptHoursLeft}h to accept or reject this challenge.
            </p>

            {/* Accept/reject controls */}
            <div style={{ display: 'flex', flexDirection: 'row', gap: '12px', alignItems: 'center' }}>
              {callerNeedsApproval ? (
                <button
                  onClick={() => void handleCallerApprove()}
                  disabled={approving || approveConfirming}
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#09090E',
                    backgroundColor: (approving || approveConfirming) ? '#2E2E42' : '#E8F542',
                    border: '2px solid #09090E',
                    boxShadow: (approving || approveConfirming) ? 'none' : '4px 4px 0 #09090E',
                    padding: '10px 18px',
                    cursor: (approving || approveConfirming) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {(approving || approveConfirming) ? 'Approving…' : `Approve USDC (${formatUsdc(callerMatchingStake)})`}
                </button>
              ) : (
                <button
                  onClick={() => void handleAccept()}
                  disabled={accepting || isZeroAddr}
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#09090E',
                    backgroundColor: accepting || isZeroAddr ? '#2E2E42' : '#4ADE80',
                    border: `2px solid ${accepting || isZeroAddr ? '#2E2E42' : '#09090E'}`,
                    boxShadow: accepting || isZeroAddr ? 'none' : '4px 4px 0 #09090E',
                    padding: '10px 18px',
                    cursor: accepting || isZeroAddr ? 'not-allowed' : 'pointer',
                  }}
                >
                  {accepting ? 'Accepting…' : 'Accept challenge'}
                </button>
              )}

              {!rejectConfirmOpen ? (
                <button
                  onClick={() => setRejectConfirmOpen(true)}
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
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
                <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', alignItems: 'center', fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8' }}>
                  <span>This will immediately refund {liveState.challengerHandle}&apos;s stake. Are you sure?</span>
                  <button
                    onClick={() => setRejectConfirmOpen(false)}
                    style={{ fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8', backgroundColor: 'transparent', border: '1px solid #2E2E42', padding: '4px 10px', cursor: 'pointer' }}
                  >
                    Keep call open
                  </button>
                  <button
                    onClick={() => void handleReject()}
                    disabled={rejecting}
                    style={{ fontFamily: 'monospace', fontSize: '12px', color: '#F87171', backgroundColor: 'transparent', border: '2px solid #F87171', padding: '4px 10px', cursor: rejecting ? 'not-allowed' : 'pointer' }}
                  >
                    {rejecting ? 'Rejecting…' : 'Yes, reject'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── THE MARKET hero ─────────────────────────────────────────────── */}
        <div
          style={{
            position: 'relative',
            backgroundColor: '#111118',
            border: '3px solid #2E2E42',
            padding: '28px',
            display: 'flex',
            flexDirection: 'column',
            gap: '0px',
          }}
        >
          {/* Corner brackets top-left */}
          <div style={{ position: 'absolute', top: -3, left: -3, pointerEvents: 'none' }}>
            <div style={{ width: '20px', height: '4px', backgroundColor: '#E8F542' }} />
            <div style={{ width: '4px', height: '16px', backgroundColor: '#E8F542' }} />
          </div>
          {/* Corner brackets bottom-right */}
          <div style={{ position: 'absolute', bottom: -3, right: -3, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ width: '4px', height: '16px', backgroundColor: '#E8F542' }} />
            <div style={{ width: '20px', height: '4px', backgroundColor: '#E8F542' }} />
          </div>

          {/* Label */}
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '16px' }}>
            THE MARKET
          </div>

          {/* Asset pair hero — 64px Syne, "/" in #E8F542 */}
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: '64px', fontWeight: 700, color: '#F1F5F9', lineHeight: 1.0, marginBottom: '12px' }}>
            {liveState?.assetA ?? '—'}
            {' '}
            <span style={{ color: '#E8F542' }}>/</span>
            {' '}
            {liveState?.assetB ?? '—'}
          </div>

          {/* Market question line */}
          {liveState?.marketLine && (
            <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '16px', color: '#F1F5F9', margin: '0 0 24px 0', lineHeight: 1.5 }}>
              {liveState.marketLine}
            </p>
          )}

          {/* 3-stat row */}
          <div style={{ display: 'flex', flexDirection: 'row', border: '2px solid #1E1E2E' }}>
            <div style={{ flex: 1, padding: '14px 16px', borderRight: '2px solid #1E1E2E', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.12em' }}>LIVE SPREAD</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '16px', color: '#F1F5F9' }}>
                {total === 0n ? '—' : `${callerPct}% / ${challengerPct}%`}
              </span>
            </div>
            <div style={{ flex: 1, padding: '14px 16px', borderRight: '2px solid #1E1E2E', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.12em' }}>POT</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '16px', color: '#F1F5F9' }}>
                {potTotal > 0n ? `${formatUsdc(potTotal)} · winner takes all` : liveState?.deferred ? 'deferred' : '—'}
              </span>
            </div>
            <div style={{ flex: 1, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.12em' }}>SETTLES IN</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '16px', color: '#F1F5F9' }}>
                {displayExpiry > 0n ? formatTimeLeft(displayExpiry) : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* ── Two-column duel card ─────────────────────────────────────────── */}
        {/* Outer wrapper for corner brackets */}
        <div style={{ position: 'relative' }}>
          {/* Corner brackets top-left (4px #E8F542) */}
          <div style={{ position: 'absolute', top: -3, left: -3, pointerEvents: 'none', zIndex: 1 }}>
            <div style={{ width: '20px', height: '4px', backgroundColor: '#E8F542' }} />
            <div style={{ width: '4px', height: '16px', backgroundColor: '#E8F542' }} />
          </div>
          {/* Corner brackets bottom-right */}
          <div style={{ position: 'absolute', bottom: -3, right: -3, pointerEvents: 'none', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ width: '4px', height: '16px', backgroundColor: '#E8F542' }} />
            <div style={{ width: '20px', height: '4px', backgroundColor: '#E8F542' }} />
          </div>

          {/* Two-column flex row — NEVER display:grid (Pitfall 15 / T-3-06-03) */}
          <div style={{ display: 'flex', flexDirection: 'row', backgroundColor: '#111118' }}>

            {/* CALLER column — left, #E8F542 accent */}
            <div
              style={{
                flex: 1,
                borderLeft: '3px solid #E8F542',
                backgroundColor: '#111118',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '12px', fontWeight: 700, color: '#E8F542', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                CALLER
              </div>
              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
                <Avatar url={liveState?.callerAvatarUrl ?? ''} handle={displayCallerHandle} size={40} borderColor="#E8F542" />
                {/* AUTH-44: handle only, not address */}
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '16px', fontWeight: 700, color: '#E8F542' }}>
                  {displayCallerHandle}
                </span>
              </div>
              {liveState?.callerPosition && (
                <div style={{ border: '2px solid #2E2E42', backgroundColor: '#0D0D15', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.12em' }}>POSITION</div>
                  <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '16px', color: '#F1F5F9', margin: 0 }}>{liveState.callerPosition}</p>
                </div>
              )}
              {/* Stat rows */}
              {[
                { label: 'REP', value: String(liveState?.callerRep ?? '—') },
                { label: 'ACCURACY', value: liveState ? `${liveState.callerAccuracy}%` : '—' },
                { label: 'IN-CATEGORY', value: liveState ? `${liveState.callerCategoryAccuracy}%` : '—' },
                { label: 'STREAK', value: liveState ? (liveState.callerStreak >= 3 ? `${liveState.callerStreak} 🔥` : String(liveState.callerStreak)) : '—' },
              ].map((stat) => (
                <div key={stat.label} style={{ borderTop: '1px solid #1E1E2E', paddingTop: '10px', display: 'flex', flexDirection: 'row', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{stat.label}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '16px', color: '#F1F5F9' }}>{stat.value}</span>
                </div>
              ))}
            </div>

            {/* VS divider */}
            <div
              style={{
                width: '48px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderLeft: '1px solid #2E2E42',
                borderRight: '1px solid #2E2E42',
              }}
            >
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '12px', fontWeight: 700, color: '#64748B' }}>VS</span>
            </div>

            {/* CHALLENGER column — right, #FB923C accent */}
            <div
              style={{
                flex: 1,
                borderRight: '3px solid #FB923C',
                backgroundColor: '#111118',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '12px', fontWeight: 700, color: '#FB923C', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                CHALLENGER
              </div>
              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
                <Avatar url={liveState?.challengerAvatarUrl ?? ''} handle={displayChallengerHandle} size={40} borderColor="#FB923C" />
                {/* AUTH-44: handle only, not address */}
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '16px', fontWeight: 700, color: '#FB923C' }}>
                  {displayChallengerHandle}
                </span>
              </div>
              {liveState?.challengerPosition && (
                <div style={{ border: '2px solid #2E2E42', backgroundColor: '#0D0D15', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.12em' }}>POSITION</div>
                  <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '16px', color: '#F1F5F9', margin: 0 }}>{liveState.challengerPosition}</p>
                </div>
              )}
              {/* Stat rows */}
              {[
                { label: 'REP', value: String(liveState?.challengerRep ?? '—') },
                { label: 'ACCURACY', value: liveState ? `${liveState.challengerAccuracy}%` : '—' },
                { label: 'IN-CATEGORY', value: liveState ? `${liveState.challengerCategoryAccuracy}%` : '—' },
                { label: 'STREAK', value: liveState ? (liveState.challengerStreak >= 3 ? `${liveState.challengerStreak} 🔥` : String(liveState.challengerStreak)) : '—' },
              ].map((stat) => (
                <div key={stat.label} style={{ borderTop: '1px solid #1E1E2E', paddingTop: '10px', display: 'flex', flexDirection: 'row', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.12em' }}>{stat.label}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '16px', color: '#F1F5F9' }}>{stat.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── MARKET CONSENSUS · LIVE bar ───────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Label with live pulse */}
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: '#4ADE80',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              MARKET CONSENSUS · LIVE
            </span>
            {isStale && (
              <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#64748B' }}>
                · updating
              </span>
            )}
          </div>

          {/* 8px bar — sharp edges (neobrutalist) */}
          <div style={{ height: '8px', backgroundColor: '#1E1E2E', display: 'flex', flexDirection: 'row' }}>
            <div
              style={{
                width: total === 0n ? '50%' : `${callerPct}%`,
                height: '100%',
                backgroundColor: total === 0n ? '#2E2E42' : '#E8F542',
                transition: 'width 300ms ease-out',
              }}
            />
            <div
              style={{
                flex: 1,
                height: '100%',
                backgroundColor: total === 0n ? '#2E2E42' : '#FB923C',
                transition: 'width 300ms ease-out',
              }}
            />
          </div>

          {/* Percentage labels */}
          <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '12px', fontWeight: 700, color: total === 0n ? '#2E2E42' : '#E8F542', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              {callerPct}% FAVOR CALLER
            </span>
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '12px', fontWeight: 700, color: total === 0n ? '#2E2E42' : '#FB923C', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              {challengerPct}% FAVOR CHALLENGER
            </span>
          </div>

          {total === 0n && (
            <div style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748B', textAlign: 'center' }}>
              consensus data unavailable
            </div>
          )}
        </div>

        {/* ── Riding sections (D-06 — existing FollowFadeMarket data) ──────── */}
        <div style={{ display: 'flex', flexDirection: 'row', gap: '24px', alignItems: 'flex-start' }}>
          {/* Riding caller (follow side) */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              Riding <span style={{ color: '#E8F542' }}>{displayCallerHandle}</span>
            </div>
            <RidingList entries={ridingFollowers} accentColor="#E8F542" />
          </div>
          {/* Riding challenger (fade side) */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '12px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              Riding <span style={{ color: '#FB923C' }}>{displayChallengerHandle}</span>
            </div>
            <RidingList entries={ridingFaders} accentColor="#FB923C" />
          </div>
        </div>

        {/* ── Bottom CTAs ───────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'row', gap: '16px' }}>
          {/* Side with caller → Follow on parent call */}
          <button
            onClick={() => { if (user && callId > 0n) setIsFollowModalOpen(true); }}
            style={{
              flex: 1,
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '16px',
              fontWeight: 700,
              color: '#09090E',
              backgroundColor: '#E8F542',
              border: '3px solid #09090E',
              boxShadow: '4px 4px 0 #09090E',
              padding: '16px 20px',
              cursor: 'pointer',
              transition: 'box-shadow 0.1s ease-out',
            }}
            onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '2px 2px 0 #09090E'; }}
            onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '4px 4px 0 #09090E'; }}
          >
            Side with {displayCallerHandle}
          </button>
          {/* Side with challenger → Fade on parent call */}
          <button
            onClick={() => { if (user && callId > 0n) setIsFadeModalOpen(true); }}
            style={{
              flex: 1,
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '16px',
              fontWeight: 700,
              color: '#FB923C',
              backgroundColor: 'transparent',
              border: '3px solid #FB923C',
              padding: '16px 20px',
              cursor: 'pointer',
            }}
          >
            Side with {displayChallengerHandle}
          </button>
        </div>

        {/* ── Challenge form button (non-caller viewer) ─────────────────────── */}
        {!userIsCaller && user && (
          <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'center' }}>
            <button
              onClick={() => {
                if (!liveState?.openToChallenges) {
                  setToastMsg({ text: "This caller isn't open to challenges right now.", isError: true });
                  return;
                }
                setIsChallengeFormOpen(true);
              }}
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '14px',
                fontWeight: 700,
                color: '#FB923C',
                backgroundColor: 'transparent',
                border: '2px solid #FB923C',
                padding: '12px 24px',
                cursor: 'pointer',
              }}
            >
              ⚔ Challenge {displayCallerHandle}
            </button>
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      {callId > 0n && (
        <>
          <FollowFadeModal
            open={isFollowModalOpen}
            onClose={() => setIsFollowModalOpen(false)}
            callId={callId}
            side="follow"
            followReserve={followReserve}
            fadeReserve={fadeReserve}
            followTotalShares={0n}
            fadeTotalShares={0n}
            userPosition={0n}
            onSubmit={async (_amountIn: bigint, _minSharesOut: bigint) => { void 0; }}
          />
          <FollowFadeModal
            open={isFadeModalOpen}
            onClose={() => setIsFadeModalOpen(false)}
            callId={callId}
            side="fade"
            followReserve={followReserve}
            fadeReserve={fadeReserve}
            followTotalShares={0n}
            fadeTotalShares={0n}
            userPosition={0n}
            onSubmit={async (_amountIn: bigint, _minSharesOut: bigint) => { void 0; }}
          />
        </>
      )}

      <ChallengeFormModal
        open={isChallengeFormOpen}
        onClose={() => setIsChallengeFormOpen(false)}
        callId={callId}
        callerHandle={displayCallerHandle}
        callerStake={displayCallerStake}
        marketLine={liveState?.marketLine ?? ''}
        onSuccess={() => { void fetchAll(); }}
      />
    </div>
  );
}
