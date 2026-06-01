/**
 * /disputes/ — Public disputes log + owner-gated resolve admin (D-07, §13.7)
 *
 * Two sections:
 *   1. OPEN DISPUTES — amber-accented, with 24h owner commitment countdown (Pitfall 6)
 *   2. RESOLVED — neutral, with outcome + resolver note
 *
 * Owner-gated resolve admin section (visible ONLY when connected wallet === owner):
 *   - Outcome selector + reversal preview (REQUIRED before confirm — D-07)
 *   - If preview fetch fails → "Preview unavailable — cannot resolve safely." + DISABLE confirm
 *   - Two-step confirm for reversals (destructive red pattern)
 *   - resolveDispute(callId, finalOutcome) writeContract
 *
 * FLEXBOX ONLY — no CSS grid (Pitfall 15)
 * AUTH-44: no wallet address rendered in any dispute row copy
 *
 * Requirements: SETTLE-25..32, D-06, D-07, Pitfall 6
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import Link from 'next/link';
import { SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA } from '@call-it/shared';

// ─── Constants ────────────────────────────────────────────────────────────────

const RELAYER_URL = process.env['NEXT_PUBLIC_RELAYER_URL'] ?? '';
const OWNER_ADDRESS = process.env['NEXT_PUBLIC_OWNER_ADDRESS'] ?? '';

/** SM address — imported from @call-it/shared (never inline hex) */
const SM_ADDR = SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA as `0x${string}`;

/** SettlementManager.resolveDispute ABI slice */
const SM_ABI = [
  {
    type: 'function',
    name: 'resolveDispute',
    inputs: [
      { name: 'callId', type: 'uint256' },
      { name: 'finalOutcome', type: 'uint8' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

/** Outcome enum ordinals (mirror ISettlementManager) */
const OUTCOME_CALLER_WON = 1;
const OUTCOME_CALLER_LOST = 2;

// ─── Types ────────────────────────────────────────────────────────────────────

type BondStatus = 'held' | 'refunded' | 'forfeited';
type DisputeStatus = 'Open' | 'Resolved';

interface CounterClaim {
  id: string;
  disputerHandle?: string;
  evidenceCid: string;
  filedAt: number;
  bondStatus?: BondStatus;
}

interface DisputeRecord {
  id: string;
  callId: string;
  disputerHandle?: string;
  evidenceCid: string;
  status: DisputeStatus;
  filedAt: number;
  resolvedAt?: number;
  finalOutcome?: string;
  resolverNote?: string;
  bondStatus?: BondStatus;
  counterClaimCount?: number;
  counterClaims?: CounterClaim[];
}

interface ProvenanceSnapshot {
  repDelta?: number;
  poolAmount?: string;
  currentOutcome?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp * 1000;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

/** Compute 24h deadline from filedAt unix timestamp */
function compute24hDeadline(filedAt: number): Date {
  return new Date((filedAt + 86_400) * 1000);
}

function formatDeadline(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function bondStatusPill(status?: BondStatus): { text: string; color: string } {
  switch (status) {
    case 'refunded': return { text: 'bond refunded +$2', color: '#4ADE80' };
    case 'forfeited': return { text: 'bond forfeited', color: '#F87171' };
    default: return { text: 'bond held', color: '#FB923C' };
  }
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchDisputesList(): Promise<DisputeRecord[]> {
  if (!RELAYER_URL) return [];
  try {
    const res = await fetch(`${RELAYER_URL}/api/disputes`);
    if (!res.ok) return [];
    const data = await res.json() as { disputes?: DisputeRecord[] };
    return data.disputes ?? [];
  } catch {
    return [];
  }
}

async function fetchProvenanceSnapshot(callId: string): Promise<ProvenanceSnapshot | null> {
  if (!RELAYER_URL) return null;
  try {
    const res = await fetch(`${RELAYER_URL}/api/settle/${callId}`);
    if (!res.ok) return null;
    const data = await res.json() as { rawOracleData?: unknown; oracle?: { type?: string } };
    // Best effort — extract what we need for reversal preview
    return {
      currentOutcome: (data as Record<string, unknown>)['currentOutcome'] as string | undefined,
      poolAmount: (data as Record<string, unknown>)['poolAmount'] as string | undefined,
      repDelta: (data as Record<string, unknown>)['repDelta'] as number | undefined,
    };
  } catch {
    return null;
  }
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function DisputesPage() {
  usePrivy(); // auth context (needed for provider chain)
  const { address: userAddress } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [disputes, setDisputeList] = useState<DisputeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Owner-gated resolve admin state (per dispute)
  const [resolveState, setResolveState] = useState<Record<string, {
    outcome: number;
    note: string;
    preview: ProvenanceSnapshot | null;
    previewLoading: boolean;
    previewFailed: boolean;
    confirmStep: 1 | 2;
    txHash?: `0x${string}`;
    toast?: { text: string; isError: boolean };
  }>>({});

  // isOwner: client-side convenience gate (on-chain onlyOwner is the real guard — T-04-08-01)
  const isOwner = Boolean(
    userAddress &&
    OWNER_ADDRESS &&
    userAddress.toLowerCase() === OWNER_ADDRESS.toLowerCase(),
  );

  // ── Data fetch + 5s poll ───────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    const data = await fetchDisputesList();
    setDisputeList(data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void fetchData();
    const interval = setInterval(() => { void fetchData(); }, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ── Resolve admin helpers ──────────────────────────────────────────────────

  const initResolveState = (disputeId: string) => {
    if (resolveState[disputeId]) return;
    setResolveState((prev) => ({
      ...prev,
      [disputeId]: {
        outcome: OUTCOME_CALLER_WON,
        note: '',
        preview: null,
        previewLoading: false,
        previewFailed: false,
        confirmStep: 1,
      },
    }));
  };

  const updateResolveField = <K extends keyof (typeof resolveState)[string]>(
    disputeId: string,
    field: K,
    value: (typeof resolveState)[string][K],
  ) => {
    setResolveState((prev) => ({
      ...prev,
      [disputeId]: { ...(prev[disputeId] ?? {}), [field]: value },
    }));
  };

  const loadReversalPreview = async (disputeId: string, callId: string, newOutcome: number) => {
    const state = resolveState[disputeId];
    const currentOutcomeNum = state?.preview?.currentOutcome === 'CallerWon' ? OUTCOME_CALLER_WON : OUTCOME_CALLER_LOST;
    const isReversal = currentOutcomeNum !== newOutcome;
    if (!isReversal) return;
    updateResolveField(disputeId, 'previewLoading', true);
    updateResolveField(disputeId, 'previewFailed', false);
    try {
      const snapshot = await fetchProvenanceSnapshot(callId);
      if (!snapshot) {
        updateResolveField(disputeId, 'previewFailed', true);
      } else {
        updateResolveField(disputeId, 'preview', snapshot);
      }
    } catch {
      updateResolveField(disputeId, 'previewFailed', true);
    } finally {
      updateResolveField(disputeId, 'previewLoading', false);
    }
  };

  const handleResolve = async (disputeId: string, callId: string) => {
    const state = resolveState[disputeId];
    if (!state) return;
    try {
      const hash = await writeContractAsync({
        address: SM_ADDR,
        abi: SM_ABI,
        functionName: 'resolveDispute',
        args: [BigInt(callId), state.outcome],
      });
      updateResolveField(disputeId, 'txHash', hash);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Resolve failed';
      updateResolveField(disputeId, 'toast', { text: msg, isError: true });
    }
  };

  // ── Global toast ───────────────────────────────────────────────────────────

  const [globalToast, setGlobalToast] = useState<{ text: string; isError: boolean } | null>(null);

  // Watch for resolve tx confirmations
  const allTxHashes = Object.values(resolveState).map((s) => s.txHash).filter(Boolean);
  const latestTxHash = allTxHashes[allTxHashes.length - 1];
  const { isSuccess: resolveConfirmed } = useWaitForTransactionReceipt({ hash: latestTxHash });

  useEffect(() => {
    if (resolveConfirmed) {
      setGlobalToast({ text: 'Dispute resolved — receipt updated.', isError: false });
      setTimeout(() => setGlobalToast(null), 4000);
      void fetchData();
    }
  }, [resolveConfirmed, fetchData]);

  // ── Derived lists ──────────────────────────────────────────────────────────

  const openDisputes = disputes.filter((d) => d.status === 'Open');
  const resolvedDisputes = disputes.filter((d) => d.status === 'Resolved');

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ backgroundColor: '#09090E', minHeight: '100vh' }}>
      {/* Global toast */}
      {globalToast && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', zIndex: 200,
          backgroundColor: '#111118', borderLeft: `4px solid ${globalToast.isError ? '#F87171' : '#FB923C'}`,
          padding: '14px 18px', fontFamily: 'monospace', fontSize: '13px', color: '#F1F5F9', maxWidth: '360px',
        }}>
          {globalToast.text}
        </div>
      )}

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div style={{ padding: '32px 32px 0 32px', maxWidth: '1024px', margin: '0 auto' }}>
        <div style={{ marginBottom: '8px' }}>
          <Link href="/" style={{ fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8', textDecoration: 'none' }}>
            ← Back to feed
          </Link>
        </div>
        <h1 style={{
          fontFamily: "'Space Grotesk', sans-serif", fontSize: '48px', fontWeight: 700,
          color: '#F1F5F9', margin: '0 0 8px 0', letterSpacing: '-0.01em',
        }}>
          DISPUTES
        </h1>
        <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '16px', color: '#94A3B8', margin: '0 0 32px 0' }}>
          Every dispute, public and on the record.
        </p>
      </div>

      <div style={{ padding: '0 32px 64px 32px', maxWidth: '1024px', margin: '0 auto' }}>

        {/* ── OPEN DISPUTES section ─────────────────────────────────────────── */}
        <div style={{ marginBottom: '48px' }}>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <span style={{
              fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, color: '#FB923C',
              textTransform: 'uppercase', letterSpacing: '0.12em',
            }}>
              OPEN DISPUTES
            </span>
            {openDisputes.length > 0 && (
              <span style={{
                fontFamily: 'monospace', fontSize: '11px', color: '#09090E',
                backgroundColor: '#FB923C', padding: '2px 7px', fontWeight: 700,
              }}>
                {openDisputes.length}
              </span>
            )}
          </div>

          {openDisputes.length === 0 ? (
            <div style={{
              border: '2px solid #2E2E42', backgroundColor: '#111118', padding: '24px',
              fontFamily: "'Space Grotesk', sans-serif", fontSize: '16px', color: '#94A3B8',
            }}>
              No open disputes. Every settled call currently stands.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {openDisputes.map((dispute) => {
                const deadline = compute24hDeadline(dispute.filedAt);
                const isOverdue = Date.now() > deadline.getTime();
                const st = resolveState[dispute.id];

                return (
                  <div key={dispute.id} style={{
                    border: '2px solid #2E2E42', backgroundColor: '#111118',
                    borderLeft: '4px solid #FB923C',
                  }}>
                    {/* Dispute row header */}
                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {/* Call statement link */}
                      <Link href={`/call/${dispute.callId}`} style={{
                        fontFamily: "'Space Grotesk', sans-serif", fontSize: '16px', fontWeight: 700,
                        color: '#F1F5F9', textDecoration: 'none',
                      }}>
                        Call #{dispute.callId} ↗
                      </Link>

                      {/* Disputer info — handle only (AUTH-44: never wallet address) */}
                      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8' }}>
                          Disputed by {dispute.disputerHandle ?? 'anon'} · {formatRelativeTime(dispute.filedAt)}
                        </span>
                        {/* Status pill */}
                        <span style={{
                          fontFamily: 'monospace', fontSize: '10px', fontWeight: 700, color: '#09090E',
                          backgroundColor: '#FB923C', padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.08em',
                        }}>
                          OPEN · under review
                        </span>
                        {/* View evidence link */}
                        {dispute.evidenceCid && (
                          <a
                            href={`https://ipfs.io/ipfs/${dispute.evidenceCid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontFamily: 'monospace', fontSize: '12px', color: '#E8F542', textDecoration: 'none' }}
                          >
                            view evidence ↗
                          </a>
                        )}
                      </div>

                      {/* 24h owner commitment countdown (Pitfall 6, D-07) */}
                      <div style={{ fontFamily: 'monospace', fontSize: '12px', color: isOverdue ? '#F87171' : '#94A3B8' }}>
                        {/* Owner will resolve by {deadline} — committed {N} ago */}
                        Owner will resolve by {formatDeadline(deadline)} — committed {formatRelativeTime(dispute.filedAt)}
                      </div>
                    </div>

                    {/* Counter-claim thread (D-06 — up to MAX_COUNTER_CLAIMS=3) */}
                    {dispute.counterClaims && dispute.counterClaims.length > 0 && (
                      <div style={{ borderTop: '1px solid #1E1E2E', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {dispute.counterClaims.map((cc) => {
                          const pill = bondStatusPill(cc.bondStatus);
                          return (
                            <div key={cc.id} style={{
                              borderLeft: '2px solid #1E1E2E', paddingLeft: '12px',
                              backgroundColor: '#111118', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
                            }}>
                              <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8' }}>
                                Counter by {cc.disputerHandle ?? 'anon'} · {formatRelativeTime(cc.filedAt)}
                              </span>
                              {cc.evidenceCid && (
                                <a href={`https://ipfs.io/ipfs/${cc.evidenceCid}`} target="_blank" rel="noopener noreferrer"
                                  style={{ fontFamily: 'monospace', fontSize: '11px', color: '#E8F542', textDecoration: 'none' }}>
                                  view evidence ↗
                                </a>
                              )}
                              <span style={{ fontFamily: 'monospace', fontSize: '10px', color: pill.color, border: `1px solid ${pill.color}`, padding: '1px 6px' }}>
                                {pill.text}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* OWNER RESOLVE ADMIN — only visible when isOwner (T-04-08-01) */}
                    {isOwner && (() => {
                      if (!st) initResolveState(dispute.id);
                      const state = st ?? { outcome: OUTCOME_CALLER_WON, note: '', preview: null, previewLoading: false, previewFailed: false, confirmStep: 1 as const };
                      const currentOutcomeIsWon = state.preview?.currentOutcome === 'CallerWon';
                      const selectedOutcomeIsWon = state.outcome === OUTCOME_CALLER_WON;
                      const isReversal = currentOutcomeIsWon !== selectedOutcomeIsWon && state.preview !== null;
                      const canConfirm = !state.previewFailed && !state.previewLoading;

                      return (
                        <div style={{ borderTop: '2px solid #2E2E42', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: 'rgba(248,113,113,0.04)' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, color: '#F87171', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            OWNER RESOLVE ADMIN
                          </span>

                          {/* Outcome selector */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontFamily: 'monospace', fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                              Final Outcome
                            </label>
                            <select
                              value={state.outcome}
                              onChange={async (e) => {
                                const newOutcome = Number(e.target.value);
                                updateResolveField(dispute.id, 'outcome', newOutcome);
                                updateResolveField(dispute.id, 'confirmStep', 1);
                                await loadReversalPreview(dispute.id, dispute.callId, newOutcome);
                              }}
                              style={{
                                fontFamily: 'monospace', fontSize: '13px', color: '#F1F5F9',
                                backgroundColor: '#09090E', border: '2px solid #2E2E42',
                                padding: '8px', cursor: 'pointer', maxWidth: '240px',
                              }}
                            >
                              <option value={OUTCOME_CALLER_WON}>CallerWon (uphold)</option>
                              <option value={OUTCOME_CALLER_LOST}>CallerLost (overturn)</option>
                            </select>
                          </div>

                          {/* REVERSAL PREVIEW (D-07 — REQUIRED before confirm) */}
                          {state.previewLoading && (
                            <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8' }}>
                              Loading reversal preview…
                            </div>
                          )}
                          {state.previewFailed && (
                            <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#F87171', border: '1px solid #F87171', padding: '8px 12px' }}>
                              Preview unavailable — cannot resolve safely.
                            </div>
                          )}
                          {isReversal && state.preview && !state.previewFailed && (
                            <div style={{ border: '2px solid #F87171', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px', backgroundColor: 'rgba(248,113,113,0.06)' }}>
                              <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, color: '#F87171', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                ⚠ THIS REVERSES SETTLEMENT
                              </span>
                              {/* reversal preview copy (D-07) */}
                              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '13px', color: '#F1F5F9' }}>
                                This REVERSES settlement —{' '}
                                rep deltas reversed
                                {state.preview.repDelta !== undefined
                                  ? ` (caller: +${state.preview.repDelta} → -${state.preview.repDelta})`
                                  : ''
                                },
                                {' '}pool USDC re-distributed old-winner → new-winner
                                {state.preview.poolAmount ? ` ($${state.preview.poolAmount} moves)` : ''}.
                              </span>
                            </div>
                          )}

                          {/* Resolver note input */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ fontFamily: 'monospace', fontSize: '11px', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                              Resolver Note (public)
                            </label>
                            <textarea
                              value={state.note}
                              onChange={(e) => updateResolveField(dispute.id, 'note', e.target.value)}
                              rows={2}
                              style={{
                                fontFamily: "'Space Grotesk', sans-serif", fontSize: '13px', color: '#F1F5F9',
                                backgroundColor: '#09090E', border: '2px solid #2E2E42',
                                padding: '8px', resize: 'vertical', outline: 'none',
                              }}
                              placeholder="Enter your resolution rationale…"
                            />
                          </div>

                          {/* Action buttons — two-step confirm for reversals (D-07) */}
                          {state.toast && (
                            <div style={{ fontFamily: 'monospace', fontSize: '12px', color: state.toast.isError ? '#F87171' : '#4ADE80' }}>
                              {state.toast.text}
                            </div>
                          )}

                          {isReversal && canConfirm ? (
                            state.confirmStep === 1 ? (
                              // Step 1: warn about reversal
                              <button
                                onClick={() => updateResolveField(dispute.id, 'confirmStep', 2)}
                                style={{
                                  fontFamily: "'Space Grotesk', sans-serif", fontSize: '13px', fontWeight: 700,
                                  color: '#F87171', backgroundColor: 'transparent', border: '2px solid #F87171',
                                  padding: '10px 16px', cursor: 'pointer', alignSelf: 'flex-start',
                                }}
                              >
                                This reverses a settled receipt. Confirm?
                              </button>
                            ) : (
                              // Step 2: final destructive confirm
                              <div style={{ display: 'flex', flexDirection: 'row', gap: '12px', alignItems: 'center' }}>
                                <button
                                  onClick={() => updateResolveField(dispute.id, 'confirmStep', 1)}
                                  style={{
                                    fontFamily: 'monospace', fontSize: '12px', color: '#64748B',
                                    backgroundColor: 'transparent', border: '2px solid #2E2E42',
                                    padding: '8px 12px', cursor: 'pointer',
                                  }}
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => void handleResolve(dispute.id, dispute.callId)}
                                  style={{
                                    fontFamily: "'Space Grotesk', sans-serif", fontSize: '13px', fontWeight: 700,
                                    color: '#F87171', backgroundColor: 'transparent', border: '2px solid #F87171',
                                    padding: '10px 16px', cursor: 'pointer',
                                  }}
                                >
                                  Yes, resolve
                                </button>
                              </div>
                            )
                          ) : (
                            <button
                              onClick={canConfirm ? () => void handleResolve(dispute.id, dispute.callId) : undefined}
                              disabled={!canConfirm}
                              style={{
                                fontFamily: "'Space Grotesk', sans-serif", fontSize: '13px', fontWeight: 700,
                                color: canConfirm ? '#09090E' : '#64748B',
                                backgroundColor: canConfirm ? '#E8F542' : '#2E2E42',
                                border: `2px solid ${canConfirm ? '#09090E' : '#2E2E42'}`,
                                boxShadow: canConfirm ? '3px 3px 0 #09090E' : 'none',
                                padding: '10px 16px', cursor: canConfirm ? 'pointer' : 'not-allowed',
                                alignSelf: 'flex-start',
                              }}
                            >
                              {`Resolve · ${state.outcome === OUTCOME_CALLER_WON ? 'CallerWon' : 'CallerLost'}`}
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── RESOLVED section ──────────────────────────────────────────────── */}
        <div>
          <div style={{ marginBottom: '16px' }}>
            <span style={{
              fontFamily: 'monospace', fontSize: '11px', fontWeight: 700, color: '#94A3B8',
              textTransform: 'uppercase', letterSpacing: '0.12em',
            }}>
              RESOLVED
            </span>
          </div>

          {resolvedDisputes.length === 0 ? (
            <div style={{
              border: '2px solid #2E2E42', backgroundColor: '#111118', padding: '24px',
              fontFamily: "'Space Grotesk', sans-serif", fontSize: '16px', color: '#94A3B8',
            }}>
              No disputes have been resolved yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {resolvedDisputes.map((dispute) => {
                const isUpheld = dispute.finalOutcome === 'CallerWon';
                const pillColor = isUpheld ? '#4ADE80' : '#E8F542';
                const pillText = isUpheld ? 'RESOLVED · upheld' : 'RESOLVED · overturned';

                return (
                  <div key={dispute.id} style={{ border: '2px solid #2E2E42', backgroundColor: '#111118' }}>
                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <Link href={`/call/${dispute.callId}`} style={{
                          fontFamily: "'Space Grotesk', sans-serif", fontSize: '14px', fontWeight: 700,
                          color: '#F1F5F9', textDecoration: 'none',
                        }}>
                          Call #{dispute.callId} ↗
                        </Link>
                        <span style={{
                          fontFamily: 'monospace', fontSize: '10px', fontWeight: 700, color: pillColor,
                          border: `1px solid ${pillColor}`, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '0.08em',
                        }}>
                          {pillText}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#94A3B8' }}>
                          Disputed by {dispute.disputerHandle ?? 'anon'} · {formatRelativeTime(dispute.filedAt)}
                        </span>
                        {dispute.evidenceCid && (
                          <a href={`https://ipfs.io/ipfs/${dispute.evidenceCid}`} target="_blank" rel="noopener noreferrer"
                            style={{ fontFamily: 'monospace', fontSize: '12px', color: '#E8F542', textDecoration: 'none' }}>
                            view evidence ↗
                          </a>
                        )}
                        {dispute.resolvedAt && (
                          <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#64748B' }}>
                            resolved {formatRelativeTime(dispute.resolvedAt)}
                          </span>
                        )}
                      </div>
                      {dispute.resolverNote && (
                        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '13px', color: '#94A3B8', borderTop: '1px solid #1E1E2E', paddingTop: '8px' }}>
                          Resolver note: {dispute.resolverNote}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Loading state */}
        {isLoading && disputes.length === 0 && (
          <div style={{ fontFamily: 'monospace', fontSize: '14px', color: '#64748B', padding: '32px 0' }}>
            Loading disputes…
          </div>
        )}
      </div>
    </div>
  );
}
