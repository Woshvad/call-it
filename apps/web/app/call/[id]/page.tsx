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
 *   - ProvenanceModal: accent neobrutalist modal, oracle URL + Arbiscan tx hash,
 *     path-aware raw oracle data per oracle.type (Pyth=price+conf+publishTime,
 *     attestation paths=payload JSON, CEX=announcement), EIP-712 sig truncated
 *     with chainId 42161 label, copy-to-clipboard (D-10, SETTLE-52)
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
  SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA,
  USDC_ARB_NATIVE,
} from '@call-it/shared';
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
  /** EIP-712 relayer signature (chainId 42161-bound — Pitfall 7) */
  relayerSignature: string;
  chainId: 42161;
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

/** FFM contract address — CONSTANT, never inlined */
const FFM_ADDR = FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA as `0x${string}`;

/** ChallengeEscrow address — imported from @call-it/shared (T-3-06-05) */
const CE_ADDR = CHALLENGE_ESCROW_ARBITRUM_SEPOLIA as `0x${string}`;

/** SettlementManager address — imported from @call-it/shared (Phase 4) */
const SM_ADDR = SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA as `0x${string}`;

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

/** Fetch settlement provenance from relayer (D-10, SETTLE-52). */
async function fetchProvenanceData(callId: string): Promise<ProvenanceData | null> {
  if (!RELAYER_URL) return null;
  try {
    const res = await fetch(`${RELAYER_URL}/api/settle/${callId}`);
    if (!res.ok) return null;
    const raw = await res.json() as Record<string, unknown>;
    return {
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
      chainId: 42161,
    };
  } catch {
    return null;
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
      const hash = await writeContractAsync({
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
      const hash = await writeContractAsync({
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
      <div style={{
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
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: '#000', letterSpacing: '0.14em', textTransform: 'uppercase', margin: 0 }}>
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

function ProvenanceModal({ open, onClose, provenance, isLoading }: ProvenanceModalProps) {
  const isMobile = useIsMobile(); // Phase 9 (09-03): 560px panel OVERFLOWS 375px → clamp (D-04)
  const [sigCopied, setSigCopied] = useState(false);

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
      <div style={{
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
          <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: '#000', letterSpacing: '0.14em', textTransform: 'uppercase', margin: 0 }}>
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
                  href={`https://arbiscan.io/tx/${txHash}`}
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

            {/* RELAYER SIGNATURE (EIP-712, chainId 42161-bound — Pitfall 7) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 700, color: 'rgba(0,0,0,0.55)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                  RELAYER SIGNATURE (EIP-712)
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#000', border: '1px solid #000', padding: '1px 5px' }}>
                  chainId 42161
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
// (the canonical SETTLED_OUTCOMES — NEVER data.jsx OUTCOMES, whose CSS vars are
// broken), keyed by the resolveSettledWord outcome word. WORDS always come from
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

  // Phase 4 D-10: open ProvenanceModal and fetch provenance data
  const handleOpenProvenance = useCallback(async () => {
    setIsProvenanceModalOpen(true);
    if (!provenanceData) {
      setIsProvenanceLoading(true);
      const data = await fetchProvenanceData(callIdNum);
      setProvenanceData(data);
      setIsProvenanceLoading(false);
    }
  }, [callIdNum, provenanceData]);

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

  // ─── SETTLED / DISPUTED RECEIPT RENDER (09.2-07 — prototype receipt skin) ──
  // Renders for Settled + Disputed + CallerExited-settled states over the
  // UNTOUCHED data/handler block above (markup donor: `call it frontend/`
  // screens/receipt.jsx ReceiptSettledScreen). Outcome WORDS come from
  // resolveSettledWord (lib/outcome-word.ts — D-09 fader guard + neutral
  // fail-safe); COLORS/tints/subs come from SETTLED_OUTCOME_STYLES above.
  if (isSettled || (isCallerExited && callData?.outcome)) {
    const handle = callData?.handle ?? `#${callIdNum}`;
    const repScore = callData?.repScore ?? 0;
    const marketLine = callData?.marketLine ?? `Call #${callIdNum}`;
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
    // only (AUTH-44), sorted by P&L, capped 20/side.
    const winners = finalPositions
      .filter((p) => p.pnl >= 0n)
      .sort((a, b) => Number(b.pnl - a.pnl))
      .slice(0, 20);
    const losers = finalPositions
      .filter((p) => p.pnl < 0n)
      .sort((a, b) => Number(a.pnl - b.pnl))
      .slice(0, 20);

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
              <span className={`avatar lg ${avatarGradClass(handle)}`} aria-hidden="true">
                {(handle.replace(/^[@#]/, '')[0] ?? '?').toUpperCase()}
              </span>
              <div className="col" style={{ gap: 6 }}>
                {/* handle only — AUTH-44: NEVER wallet address */}
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 900, letterSpacing: '-0.02em' }}>
                  {handle}
                </span>
                <span className="mono" style={{ fontSize: 11, color: 'var(--accent-win)' }}>
                  {repScore} rep
                </span>
              </div>
            </div>

            {/* SHARE row — existing working wiring kept (D-09): twitter web
                intent + SHARE AS FRAME warpcast compose intent. Controls are
                OMITTED (never dead) when no real share URL exists. */}
            <div
              data-receipt-action-row
              style={{
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                gap: 12,
                width: isMobile ? '100%' : undefined,
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
                <a
                  href={shareAsFrameUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn outline-white"
                  style={{ width: isMobile ? '100%' : undefined, textDecoration: 'none' }}
                >
                  SHARE AS FRAME →
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
            {callerPnl !== undefined && (
              <div className="stat-block" style={{ flex: isMobile ? '1 1 45%' : 1 }}>
                <div className="stat-label">P&L</div>
                <div className="stat-value" style={{ color: callerPnl >= 0n ? 'var(--accent-win)' : 'var(--accent-loss)' }}>
                  {callerPnl >= 0n ? `+${formatUsdc(callerPnl)}` : `-${formatUsdc(-callerPnl)}`}
                </div>
              </div>
            )}
            {repDelta !== undefined && (
              <div className="stat-block" style={{ flex: isMobile ? '1 1 45%' : 1 }}>
                <div className="stat-label">Rep Δ</div>
                {/* UI-45 count-up rides the existing displayedRepDelta animation state */}
                <div className="stat-value" style={{ color: repDelta >= 0 ? 'var(--accent-win)' : 'var(--accent-loss)' }}>
                  {displayedRepDelta >= 0 ? '+' : ''}
                  {displayedRepDelta}
                </div>
              </div>
            )}
            {finalValue && (
              <div className="stat-block" style={{ flex: isMobile ? '1 1 45%' : 1 }}>
                <div className="stat-label">Final</div>
                <div className="stat-value">{finalValue}</div>
                {targetValue && <div className="stat-sub">target {targetValue}</div>}
              </div>
            )}
            {!finalValue && targetValue && (
              <div className="stat-block" style={{ flex: isMobile ? '1 1 45%' : 1 }}>
                <div className="stat-label">Target</div>
                <div className="stat-value">{targetValue}</div>
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
              style={{ fontSize: 10.5, letterSpacing: '0.08em', color: 'var(--accent-win)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              · view oracle proof ↗
            </button>
          </div>
        </div>

        {/* ── DISPUTE THIS SETTLEMENT CTA (D-06, SETTLE-25) — wiring unchanged ── */}
        {callData?.status === 'Settled' && (() => {
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
                                {(p.handle.replace(/^[@#]/, '')[0] ?? '?').toUpperCase()}
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
                                {(p.handle.replace(/^[@#]/, '')[0] ?? '?').toUpperCase()}
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

        {/* ── DisputeModal (D-06) — open-state wiring unchanged ── */}
        {isDisputeModalOpen && (
          <DisputeModal
            open={isDisputeModalOpen}
            onClose={() => setIsDisputeModalOpen(false)}
            callId={callId}
            outcomeWord={outcomeWord}
            smAddr={SM_ADDR}
            usdcAddr={USDC_ADDR}
            relayerUrl={RELAYER_URL}
          />
        )}

        {/* ── ProvenanceModal (D-10) — open-state wiring unchanged ── */}
        {isProvenanceModalOpen && (
          <ProvenanceModal
            open={isProvenanceModalOpen}
            onClose={() => setIsProvenanceModalOpen(false)}
            provenance={provenanceData}
            isLoading={isProvenanceLoading}
          />
        )}
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ backgroundColor: '#09090E', minHeight: '100vh', padding: '0' }}>
      {/* 08-06 GAP 2: signal ready() so the Mini App host reveals this LIVE receipt
          (renders null). enabled keyed off callData so the host shows real content.
          The read-only receipt body below renders WITHOUT a connected wallet — only the
          interactive Follow/Fade/Challenge controls are wallet-gated. D-01: read-only
          render only; in-app tap-to-transact on mainnet 42161 is Phase 10. */}
      <MiniAppReady enabled={!!callData} />

      {/* ── Sticky Caller Header ────────────────────────────────────────────── */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          backgroundColor: '#09090E',
          borderBottom: '2px solid #2E2E42',
          padding: isMobile ? '12px 16px' : '12px 24px',
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

        <div style={{
          display: 'flex', flexDirection: 'row', justifyContent: 'space-between',
          alignItems: 'center', flexWrap: isMobile ? 'wrap' : 'nowrap', gap: isMobile ? '8px' : undefined,
        }}>
          {/* Left: back link + handle */}
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: isMobile ? '10px' : '16px', flexWrap: 'wrap', minWidth: 0 }}>
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
      <div style={isMobile
        ? { width: '100%', maxWidth: '100%', margin: '0 auto', padding: '0 16px' }
        : { maxWidth: '1024px', margin: '0 auto', padding: '24px' }}>

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

          {/* 4-stat row — desktop: 4 in a row; mobile: 2×2 via flexWrap (NOT grid),
              dividers preserved (matches the settled-receipt stat-stack treatment) */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              flexWrap: isMobile ? 'wrap' : 'nowrap',
              gap: '0px',
              border: '2px solid #2E2E42',
              marginBottom: '20px',
            }}
          >
            {/* CURRENT SPREAD */}
            <div
              style={{
                flex: isMobile ? '1 1 45%' : 1,
                padding: '14px 16px',
                borderRight: '1px solid #2E2E42',
                borderBottom: isMobile ? '1px solid #2E2E42' : undefined,
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
                flex: isMobile ? '1 1 45%' : 1,
                padding: '14px 16px',
                borderRight: isMobile ? undefined : '1px solid #2E2E42',
                borderBottom: isMobile ? '1px solid #2E2E42' : undefined,
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
                flex: isMobile ? '1 1 45%' : 1,
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
                flex: isMobile ? '1 1 45%' : 1,
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

          {/* ── 3 Action Buttons ─────────────────────────────────────────────
              Desktop: 3 in a row. Mobile: full-width stacked (column), each ≥44px
              tall (padding 14px ⇒ ~46px). Preserve filled/outline/orange treatments. */}
          <div
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              gap: isMobile ? '12px' : '8px',
              marginBottom: '20px',
            }}
          >
            {/* FOLLOW — filled accent yellow-green */}
            <button
              onClick={() => { if (user) setIsFollowModalOpen(true); }}
              style={{
                flex: isMobile ? undefined : 1,
                width: isMobile ? '100%' : undefined,
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
                flex: isMobile ? undefined : 1,
                width: isMobile ? '100%' : undefined,
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
                flex: isMobile ? undefined : 1,
                width: isMobile ? '100%' : undefined,
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
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '10px', alignItems: isMobile ? 'stretch' : 'center' }}>
                  {callerNeedsApproval ? (
                    /* Step 1: Approve USDC (T-3-06-06) */
                    <button
                      onClick={() => void handleChallengeApprove()}
                      disabled={challengeApproving || ceApproveConfirming}
                      style={{
                        width: isMobile ? '100%' : undefined,
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        fontWeight: 700,
                        color: '#09090E',
                        backgroundColor: (challengeApproving || ceApproveConfirming) ? '#2E2E42' : '#E8F542',
                        border: '2px solid #09090E',
                        boxShadow: (challengeApproving || ceApproveConfirming) ? 'none' : '4px 4px 0 #09090E',
                        padding: '12px 18px',
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
                        width: isMobile ? '100%' : undefined,
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        fontWeight: 700,
                        color: '#09090E',
                        backgroundColor: (challengeAccepting || isZeroCE) ? '#2E2E42' : '#4ADE80',
                        border: `2px solid ${(challengeAccepting || isZeroCE) ? '#2E2E42' : '#09090E'}`,
                        boxShadow: (challengeAccepting || isZeroCE) ? 'none' : '4px 4px 0 #09090E',
                        padding: '12px 18px',
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
                        width: isMobile ? '100%' : undefined,
                        fontFamily: 'monospace',
                        fontSize: '13px',
                        color: '#F87171',
                        backgroundColor: 'transparent',
                        border: '2px solid #F87171',
                        padding: '12px 18px',
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

        {/* ── Two-column content: ActivityFeed (left) + QuoteCalls (right) ───
            Mobile: stacks to a single column — activity feed FIRST, quote-calls below.
            The quote-calls column is a READ-ONLY display surface (NOT the composer) →
            stays in scope, gets NO desktop-only banner. */}
        <div style={{
          display: 'flex', flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? '16px' : '24px', alignItems: 'flex-start', marginBottom: '24px',
        }}>

          {/* Left: Activity feed (D-08) — full width at mobile, listed first */}
          <div style={{ flex: 3, width: isMobile ? '100%' : undefined, display: 'flex', flexDirection: 'column', gap: '0px' }}>
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

          {/* Right: Quote-calls column (D-08, SOCIAL-44, SOCIAL-45) — full width at mobile, below the feed */}
          <div style={{ flex: 2, width: isMobile ? '100%' : undefined, display: 'flex', flexDirection: 'column', gap: '0px' }}>
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
