/**
 * /duel/[challengeId] — Duel Page (§15.5) — prototype duel skin (09.2-11)
 *
 * Prototype `call it frontend/screens/duel.jsx` markup over the EXISTING
 * Phase 3 data/handler layer (D-05 — markup donor only):
 *   - Top meta row (← Back ghost link, duel id · arbitrum · status · countdown)
 *   - THE MARKET hero (asset pair Archivo 900, market line, pot/settles-in stat blocks)
 *   - VS duel card (.brutal-card.hero): CALLER #E8F542 / VS / CHALLENGER #A855F7
 *   - MARKET CONSENSUS · LIVE footer (.brutal-bar.split caller/challenger, 2px black gap)
 *   - Riders lists per side (existing FollowFadeMarket follow/fade participants — D-06)
 *   - Challenge form modal (proposeChallenge — Surface 7)
 *   - Caller-only accept/reject block when challenge is Proposed (handlers UNCHANGED)
 *   - Mobile single-column stacking (UI-48) + DesktopOnlyBanner (Phase 9 09-04)
 *
 * D-07: data with no source is HIDDEN, never faked — the prototype's price
 *       live-spread hero stat and its "±N rep" payload sub have no source and
 *       are not rendered.
 * D-08: the prototype's bottom side-with CTA pair is CUT (see comment at the
 *       old render slot) — the FollowFadeModal stubs behind them were no-ops.
 *
 * LIVENESS: 5s setInterval + window focus refetch of /api/duels/:id/live-state (D-10)
 * AUTH-44: wallet address NEVER rendered — handle + rep only
 * CE_ADDR imported from @call-it/shared — never inline hex (T-3-06-05)
 *
 * Requirements: SOCIAL-30, SOCIAL-34, SOCIAL-35, SOCIAL-36, UI-11, AUTH-44
 * Spec: §15.5 Duel page layout + 09.2-UI-SPEC.md (BINDING DESIGN CONTRACT)
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import Link from 'next/link';
import { CHALLENGE_ESCROW_ARBITRUM_SEPOLIA, USDC_ARB_NATIVE } from '@call-it/shared';
import { ChallengeFormModal } from '@/app/components/ChallengeFormModal';
import { DesktopOnlyBanner } from '@/app/components/DesktopOnlyBanner';
import { useIsMobile } from '@/app/hooks/useIsMobile';

// ─── Constants ────────────────────────────────────────────────────────────────

/** ChallengeEscrow address — imported from @call-it/shared; never inline hex (T-3-06-05) */
const CE_ADDR = CHALLENGE_ESCROW_ARBITRUM_SEPOLIA as `0x${string}`;

/** USDC native on Arbitrum (canonical) */
const USDC_ADDR = USDC_ARB_NATIVE as `0x${string}`; // IN-05: imported from @call-it/shared

const RELAYER_URL = process.env['NEXT_PUBLIC_RELAYER_URL'] ?? '';

/**
 * Duel identity colors (prototype duel.jsx / UI-SPEC Color table):
 * caller = chartreuse, challenger = duel purple. #A855F7 is confined to
 * challenge UI only (D-14 / AUTH-44 invariant set).
 */
const CALLER_ACCENT = '#E8F542';
const DUEL_ACCENT = '#A855F7';

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

/** Honest status word + color for the meta line — real ChallengeStatus, never a hardcoded word. */
function challengeStatusMeta(status: number): { word: string; color: string } {
  switch (status) {
    case ChallengeStatus.Accepted:
      return { word: 'LOCKED', color: 'var(--accent-win)' };
    case ChallengeStatus.Rejected:
      return { word: 'REJECTED', color: 'var(--text-tertiary)' };
    case ChallengeStatus.Refunded:
      return { word: 'REFUNDED', color: 'var(--text-tertiary)' };
    case ChallengeStatus.Settled:
      return { word: 'SETTLED', color: 'var(--text-secondary)' };
    case ChallengeStatus.Proposed:
    default:
      return { word: 'PENDING', color: 'var(--accent-warning)' };
  }
}

/** Deterministic prototype avatar grad class per handle (a–f) — same recipe as /call/[id] (09.2-07). */
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

/**
 * DuelCountdown — prototype Countdown recipe (`call it frontend/components.jsx:105-121`):
 * D HH:MM:SS in JetBrains Mono, ticking 1s. DISPLAY-ONLY component over the
 * existing `expiry` field — no data/handler logic (D-05: markup donor only).
 */
function DuelCountdown({ expiry }: { expiry: bigint }) {
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

// ─── Sub-components (display-only — prototype recipes) ────────────────────────

/** Square prototype avatar (radius 0, grad a–f) — image when avatarUrl exists, grad+initial otherwise. */
function DuelAvatar({ url, handle, size }: { url: string; handle: string; size: 'sm' | 'xl' }) {
  if (url) {
    const px = size === 'xl' ? 80 : 28;
    return (
      <span className={`avatar ${size}`} style={{ overflow: 'hidden', padding: 0 }} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" width={px} height={px} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </span>
    );
  }
  const initial = handle.replace('@', '').charAt(0).toUpperCase();
  return (
    <span className={`avatar ${size} ${avatarGradClass(handle)}`} aria-hidden="true">
      {initial}
    </span>
  );
}

/** Riders rows — prototype duel.jsx riders recipe. Handles only (AUTH-44). */
function RidingList({ entries, accentColor }: { entries: RidingEntry[]; accentColor: string }) {
  if (entries.length === 0) {
    return (
      <div className="mono" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
        No one riding yet
      </div>
    );
  }
  const visible = entries.slice(0, 5);
  const extra = entries.length - 5;
  return (
    <div className="col" style={{ gap: 8 }}>
      {visible.map((e, i) => (
        <div
          key={i}
          className="row"
          style={{ padding: '12px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', gap: 12 }}
        >
          <DuelAvatar url={e.avatarUrl} handle={e.handle} size="sm" />
          {/* AUTH-44: handle only, never an address */}
          <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{e.handle}</span>
          <span className="mono" style={{ fontSize: 13, color: accentColor, fontWeight: 700 }}>
            {formatUsdc(e.amountUsdc)}
          </span>
        </div>
      ))}
      {extra > 0 && (
        <div className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.04em' }}>
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
  const isMobile = useIsMobile(); // 375px single-column stacking (UI-48)

  const [liveState, setLiveState] = useState<DuelLiveState | null>(null);
  const [ridingFollowers, setRidingFollowers] = useState<RidingEntry[]>([]);
  const [ridingFaders, setRidingFaders] = useState<RidingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number>(0);

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

  // ─── Loading skeleton (token recipes) ───────────────────────────────────────
  if (loading && !liveState) {
    return (
      <div className="col" style={{ gap: 16, paddingTop: 24 }}>
        <DesktopOnlyBanner />
        <div style={{ height: 24, background: 'var(--bg-tertiary)', width: 200 }} />
        <div style={{ height: 200, background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }} />
        <div style={{ height: 280, background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }} />
      </div>
    );
  }

  // ─── Error state (UI-SPEC: problem + next step, never a faked page) ─────────
  if (!liveState) {
    return (
      <div>
        <DesktopOnlyBanner />
        <div
          className="brutal-card"
          style={{ marginTop: 24, borderLeft: '3px solid var(--accent-loss)', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}
        >
          <span className="label-overline" style={{ color: 'var(--accent-loss)' }}>
            COULDN&apos;T LOAD THE DUEL
          </span>
          <span className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            The duel live-state didn&apos;t come back. Retry.
          </span>
          <button
            onClick={() => { setLoading(true); void fetchAll(); }}
            className="btn outline-white"
            style={{ minHeight: 44 }}
          >
            RETRY
          </button>
        </div>
      </div>
    );
  }

  const displayChallengerHandle = liveState?.challengerHandle ?? 'challenger';
  const displayCallerHandle = liveState?.callerHandle ?? 'caller';
  const displayCallerStake = liveState?.callerStake ?? 0n;
  const displayChallengerStake = liveState?.challengerStake ?? 0n;
  const displayExpiry = liveState?.expiry ?? 0n;
  // CR-04 fix: pot = min(callerStake, challengerStake) * 2 (contract §8.9 prize-pot formula).
  // In a pre-accept (Proposed) state callerStake is 0n; pot reads as 0 -- hidden (D-07).
  // In an Accepted state both stakes are set; min*2 is the actual prize pot.
  // displayCallerStake + displayChallengerStake is the raw escrowed total, NOT the pot.
  const matchedStake = displayCallerStake < displayChallengerStake
    ? displayCallerStake
    : displayChallengerStake;
  const potTotal = matchedStake * 2n;

  const statusMeta = challengeStatusMeta(liveState.status);
  const ridersCount = ridingFollowers.length + ridingFaders.length;
  const followersBacked = ridingFollowers.reduce((s, e) => s + e.amountUsdc, 0n);
  const fadersBacked = ridingFaders.reduce((s, e) => s + e.amountUsdc, 0n);

  // ─── Render — prototype duel.jsx markup over the live data (D-05) ───────────
  return (
    <div>

      <DesktopOnlyBanner />

      {/* ── Toast notification (wiring untouched — chrome on the token layer) ── */}
      {toastMsg && (
        <div
          className="mono"
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            zIndex: 200,
            backgroundColor: 'var(--bg-secondary)',
            borderLeft: `4px solid ${toastMsg.isError ? 'var(--accent-loss)' : 'var(--accent-win)'}`,
            padding: '14px 18px',
            fontSize: 13,
            color: 'var(--text-primary)',
            maxWidth: 340,
          }}
        >
          {toastMsg.text}
        </div>
      )}

      {/* ── Top meta row — ghost back link + duel meta (real status word) ────── */}
      <div className="spread" style={{ paddingTop: 28, paddingBottom: 18, flexWrap: 'wrap', gap: 8 }}>
        <Link href="/" className="btn ghost" style={{ padding: '8px 0', textDecoration: 'none' }}>
          ← Back to the tape
        </Link>
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.04em' }}>
          duel #d/{challengeId} · arbitrum ·{' '}
          <span style={{ color: statusMeta.color, fontWeight: 700 }}>{statusMeta.word}</span>
          {displayExpiry > 0n ? <> · {formatTimeLeft(displayExpiry)}</> : null}
        </span>
      </div>

      {/* ── Caller-only pending block (SOCIAL-49) — handlers UNCHANGED ───────── */}
      {userIsCaller && isProposed && (
        <div className="brutal-card heavy" style={{ marginBottom: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <span className="pill duel">⚔ 1V1 DUEL · PENDING</span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>
              {liveState.challengerHandle} challenged this call · you have {acceptHoursLeft}h to accept or reject
            </span>
          </div>

          {/* Accept/reject controls */}
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 10, alignItems: isMobile ? 'stretch' : 'center', flexWrap: 'wrap' }}>
            {callerNeedsApproval ? (
              /* Step 1: Approve USDC (T-3-06-06) */
              <button
                onClick={() => void handleCallerApprove()}
                disabled={approving || approveConfirming}
                className="btn cream"
                style={{
                  width: isMobile ? '100%' : undefined,
                  minHeight: 44,
                  opacity: (approving || approveConfirming) ? 0.5 : 1,
                  cursor: (approving || approveConfirming) ? 'not-allowed' : 'pointer',
                }}
              >
                {(approving || approveConfirming) ? 'APPROVING…' : `APPROVE USDC (${formatUsdc(callerMatchingStake)})`}
              </button>
            ) : (
              /* Step 2: Accept challenge (matching stake = min — SOCIAL-31) */
              <button
                onClick={() => void handleAccept()}
                disabled={accepting || isZeroAddr}
                className="btn cream"
                style={{
                  width: isMobile ? '100%' : undefined,
                  minHeight: 44,
                  opacity: (accepting || isZeroAddr) ? 0.5 : 1,
                  cursor: (accepting || isZeroAddr) ? 'not-allowed' : 'pointer',
                }}
              >
                {accepting ? 'ACCEPTING…' : 'ACCEPT CHALLENGE ▸'}
              </button>
            )}

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
                <span>This will immediately refund {liveState.challengerHandle}&apos;s stake. Are you sure?</span>
                <button
                  onClick={() => setRejectConfirmOpen(false)}
                  className="btn ghost"
                  style={{ minHeight: 44 }}
                >
                  Keep call open
                </button>
                <button
                  onClick={() => void handleReject()}
                  disabled={rejecting}
                  className="btn fade"
                  style={{ minHeight: 44, cursor: rejecting ? 'not-allowed' : 'pointer', opacity: rejecting ? 0.5 : 1 }}
                >
                  {rejecting ? 'Rejecting…' : 'Yes, reject'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── THE MARKET hero — asymmetric: title left, stat blocks right ──────── */}
      <div style={{ padding: '4px 0 36px' }}>
        <div className="label-overline" style={{ marginBottom: 14 }}>· THE MARKET</div>
        <div
          style={
            isMobile
              ? { display: 'flex', flexDirection: 'column', gap: 24 }
              : { display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 32, alignItems: 'end' }
          }
        >
          <div>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(44px, 9vw, 110px)',
                fontWeight: 900,
                letterSpacing: '-0.055em',
                lineHeight: 0.82,
                margin: 0,
                textTransform: 'uppercase',
                overflowWrap: 'anywhere',
              }}
            >
              {liveState.assetA}
              <span style={{ color: 'var(--accent-loss)', margin: '0 12px' }}>/</span>
              {liveState.assetB}
            </h1>
            {liveState.marketLine && (
              <div className="h-3" style={{ margin: '20px 0 0', maxWidth: '44ch', color: 'var(--text-secondary)', fontWeight: 500 }}>
                {liveState.marketLine}
              </div>
            )}
          </div>
          {/* The prototype's price live-spread hero stat (and its rep-payload sub)
              has NO data source — HIDDEN, never faked (D-07). Only sourced stats render. */}
          {(potTotal > 0n || displayExpiry > 0n) && (
            <div className="col" style={{ gap: 14 }}>
              {potTotal > 0n && (
                <div className="stat-block bracketed">
                  <div className="stat-label">Pot</div>
                  <div className="stat-value">{formatUsdc(potTotal)}</div>
                  <div className="stat-sub">winner takes all</div>
                  <span className="br-bl"></span>
                  <span className="br-br"></span>
                </div>
              )}
              {displayExpiry > 0n && (
                <div className="stat-block bracketed">
                  <div className="stat-label">Settles in</div>
                  <div className="stat-value"><DuelCountdown expiry={displayExpiry} /></div>
                  <span className="br-bl"></span>
                  <span className="br-br"></span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── VS duel card (.brutal-card.hero) — page-level grid OK ────────────── */}
      <div className="brutal-card hero" style={{ padding: 0, position: 'relative' }}>
        <div
          style={
            isMobile
              ? { display: 'flex', flexDirection: 'column', alignItems: 'stretch' }
              : { display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 0, alignItems: 'stretch' }
          }
        >
          {/* CALLER side — #E8F542 identity */}
          <div
            style={{
              padding: isMobile ? '24px 20px' : '32px 32px 28px',
              borderRight: isMobile ? undefined : '2px solid var(--border-strong)',
              borderBottom: isMobile ? '2px solid var(--border-strong)' : undefined,
            }}
          >
            <div className="label-overline" style={{ marginBottom: 16, color: CALLER_ACCENT }}>
              · CALLER
            </div>
            <div className="row" style={{ gap: 16, marginBottom: 18 }}>
              <DuelAvatar url={liveState.callerAvatarUrl} handle={displayCallerHandle} size="xl" />
              <div className="col" style={{ gap: 8 }}>
                {/* AUTH-44: handle only, not address */}
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: isMobile ? 22 : 28,
                    fontWeight: 900,
                    letterSpacing: '-0.02em',
                    color: CALLER_ACCENT,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {displayCallerHandle}
                </span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>
                  staked {formatUsdc(displayCallerStake)}
                </span>
              </div>
            </div>
            {liveState.callerPosition && (
              <div style={{ padding: 16, background: 'rgba(232,245,66,0.05)', border: `1.5px solid ${CALLER_ACCENT}` }}>
                <div className="mono" style={{ fontSize: 10, color: CALLER_ACCENT, letterSpacing: '0.1em', fontWeight: 700, marginBottom: 6 }}>
                  POSITION
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, lineHeight: 1.25 }}>
                  {liveState.callerPosition}
                </div>
              </div>
            )}
            {/* Stats — existing DuelLiveState fields only (D-07) */}
            <div className="row" style={{ gap: 16, marginTop: 22, flexWrap: 'wrap' }}>
              <div>
                <div className="label-overline">Rep</div>
                <div className="mono" style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
                  {liveState.callerRep.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="label-overline">Accuracy</div>
                <div className="mono" style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: 'var(--accent-win)' }}>
                  {liveState.callerAccuracy}%
                </div>
              </div>
              <div>
                <div className="label-overline">In category</div>
                <div className="mono" style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
                  {liveState.callerCategoryAccuracy}%
                </div>
              </div>
            </div>
            {liveState.callerStreak >= 3 && (
              <div className="mono" style={{ marginTop: 14, fontSize: 11, color: 'var(--accent-warning)', fontWeight: 700, letterSpacing: '0.04em' }}>
                🔥 {liveState.callerStreak}-call win streak
              </div>
            )}
          </div>

          {/* VS center */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: isMobile ? '4px 0' : '0 20px',
              borderBottom: isMobile ? '2px solid var(--border-strong)' : undefined,
              position: 'relative',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: isMobile ? 36 : 56,
                fontWeight: 900,
                letterSpacing: '-0.06em',
                color: 'var(--accent-loss)',
                transform: 'rotate(-6deg)',
                textShadow: '3px 3px 0 #000',
                padding: '8px 16px',
              }}
            >
              VS
            </div>
          </div>

          {/* CHALLENGER side — #A855F7 duel identity (confined to challenge UI, D-14) */}
          <div style={{ padding: isMobile ? '24px 20px' : '32px 32px 28px' }}>
            <div className="label-overline" style={{ marginBottom: 16, color: DUEL_ACCENT, textAlign: isMobile ? 'left' : 'right' }}>
              CHALLENGER ·
            </div>
            <div className="row" style={{ gap: 16, marginBottom: 18, justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
              {isMobile && (
                <DuelAvatar url={liveState.challengerAvatarUrl} handle={displayChallengerHandle} size="xl" />
              )}
              <div className="col" style={{ gap: 8, alignItems: isMobile ? 'flex-start' : 'flex-end' }}>
                {/* AUTH-44: handle only, not address */}
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: isMobile ? 22 : 28,
                    fontWeight: 900,
                    letterSpacing: '-0.02em',
                    color: DUEL_ACCENT,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {displayChallengerHandle}
                </span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)', letterSpacing: '0.02em' }}>
                  staked {formatUsdc(displayChallengerStake)}
                </span>
              </div>
              {!isMobile && (
                <DuelAvatar url={liveState.challengerAvatarUrl} handle={displayChallengerHandle} size="xl" />
              )}
            </div>
            {liveState.challengerPosition && (
              <div style={{ padding: 16, background: 'rgba(168,85,247,0.06)', border: `1.5px solid ${DUEL_ACCENT}` }}>
                <div className="mono" style={{ fontSize: 10, color: DUEL_ACCENT, letterSpacing: '0.1em', fontWeight: 700, marginBottom: 6, textAlign: isMobile ? 'left' : 'right' }}>
                  POSITION
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, lineHeight: 1.25, textAlign: isMobile ? 'left' : 'right' }}>
                  {liveState.challengerPosition}
                </div>
              </div>
            )}
            {/* Stats — existing DuelLiveState fields only (D-07) */}
            <div className="row" style={{ gap: 16, marginTop: 22, flexWrap: 'wrap', justifyContent: isMobile ? 'flex-start' : 'flex-end' }}>
              <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
                <div className="label-overline">Rep</div>
                <div className="mono" style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
                  {liveState.challengerRep.toLocaleString()}
                </div>
              </div>
              <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
                <div className="label-overline">Accuracy</div>
                <div className="mono" style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: 'var(--accent-win)' }}>
                  {liveState.challengerAccuracy}%
                </div>
              </div>
              <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
                <div className="label-overline">In category</div>
                <div className="mono" style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>
                  {liveState.challengerCategoryAccuracy}%
                </div>
              </div>
            </div>
            {liveState.challengerStreak >= 3 && (
              <div className="mono" style={{ marginTop: 14, fontSize: 11, color: 'var(--accent-warning)', fontWeight: 700, letterSpacing: '0.04em', textAlign: isMobile ? 'left' : 'right' }}>
                🔥 {liveState.challengerStreak}-call win streak
              </div>
            )}
          </div>
        </div>

        {/* ── MARKET CONSENSUS · LIVE footer — real FFM reserves only ─────────── */}
        <div style={{ borderTop: '2px solid var(--border-strong)', padding: isMobile ? '16px 20px' : '20px 32px', background: 'var(--bg-quaternary)' }}>
          <div className="spread" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div className="row" style={{ gap: 8 }}>
              <span className="live-dot" />
              <span className="label-overline">MARKET CONSENSUS · LIVE</span>
              {isStale && (
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>· updating</span>
              )}
            </div>
            {ridersCount > 0 && (
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                {ridersCount} riders{potTotal > 0n ? ` · ${formatUsdc(potTotal)} pot` : ''}
              </span>
            )}
          </div>

          {total > 0n ? (
            <>
              <div className="spread" style={{ marginBottom: 10, alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
                <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 24 : 32, fontWeight: 900, color: CALLER_ACCENT, letterSpacing: '-0.03em' }}>
                    {callerPct}%
                  </span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: '0.06em', fontWeight: 700 }}>
                    FAVOR CALLER
                  </span>
                </div>
                <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: '0.06em', fontWeight: 700 }}>
                    FAVOR CHALLENGER
                  </span>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? 24 : 32, fontWeight: 900, color: DUEL_ACCENT, letterSpacing: '-0.03em' }}>
                    {challengerPct}%
                  </span>
                </div>
              </div>
              {/* Duel split-bar variant: caller var(--accent-win) vs challenger #A855F7, 2px black gap */}
              <div className="brutal-bar split" role="img" aria-label={`${callerPct}% favor caller`}>
                <div className="caller" style={{ flexBasis: `${callerPct}%` }} />
                <div className="gap" />
                <div className="challenger" style={{ flexBasis: `${challengerPct}%` }} />
              </div>
            </>
          ) : (
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              consensus data unavailable
            </div>
          )}
        </div>
      </div>

      {/* ── Riders (D-06 — existing FollowFadeMarket data; handles only AUTH-44) ── */}
      <div
        style={
          isMobile
            ? { display: 'flex', flexDirection: 'column', gap: 24, marginTop: 36 }
            : { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 36 }
        }
      >
        <div>
          <div className="section-divider" style={{ marginTop: 0 }}>
            <span className="title" style={{ color: CALLER_ACCENT }}>RIDING {displayCallerHandle}</span>
            <span className="line"></span>
            {ridingFollowers.length > 0 && (
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                {formatUsdc(followersBacked)} backed
              </span>
            )}
          </div>
          <RidingList entries={ridingFollowers} accentColor={CALLER_ACCENT} />
        </div>
        <div>
          <div className="section-divider" style={{ marginTop: 0 }}>
            <span className="title" style={{ color: DUEL_ACCENT }}>RIDING {displayChallengerHandle}</span>
            <span className="line"></span>
            {ridingFaders.length > 0 && (
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                {formatUsdc(fadersBacked)} backed
              </span>
            )}
          </div>
          <RidingList entries={ridingFaders} accentColor={DUEL_ACCENT} />
        </div>
      </div>

      {/* ── D-08: the prototype's bottom side-with CTA pair is intentionally CUT.
          The old buttons opened FollowFadeModal stubs whose onSubmit was a
          verified no-op (no transaction ever fired) — dead money CTAs are
          banned. Riders + consensus above remain the spectator surface; real
          follow/fade wiring on the parent call is deferred to Phase 09.1+. ── */}

      {/* ── Challenge form button (non-caller viewer) — wired, guards verbatim ── */}
      {!userIsCaller && user && (
        <div className="row" style={{ justifyContent: 'center', marginTop: 36 }}>
          <button
            onClick={() => {
              if (!liveState?.openToChallenges) {
                setToastMsg({ text: "This caller isn't open to challenges right now.", isError: true });
                return;
              }
              setIsChallengeFormOpen(true);
            }}
            className="btn duel"
            style={{ minHeight: 44, width: isMobile ? '100%' : undefined }}
          >
            ⚔ CHALLENGE {displayCallerHandle}
          </button>
        </div>
      )}

      {/* ── Modals — ChallengeFormModal only (the wired one) ─────────────────── */}
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
