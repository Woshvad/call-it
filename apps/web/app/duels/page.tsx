/**
 * /duels — Duels index (quick-260611-5mh C7)
 *
 * Lists active 1v1 duels from the relayer `GET /api/duels` (subgraph-backed:
 * `{ duels: [...], count: N, duelKing: ... }`) with rows linking to
 * /duel/:challengeId. Live response today is empty (`{"duels":[],"count":0}`)
 * — the brutal empty state owns that case honestly (D-07: no fake rows).
 *
 * The relayer duel entries carry ADDRESSES (challenger/caller), not handles —
 * rows render truncated address aliases (AUTH-44-safe display alias).
 *
 * D-27: the relayer proxies the subgraph — no Studio key in this bundle.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { avatarInitial } from '@call-it/ui';

const RELAYER_URL = process.env['NEXT_PUBLIC_RELAYER_URL'] ?? '';

const DUEL_ACCENT = '#A855F7';
const CALLER_ACCENT = '#E8F542';

type DuelRow = {
  challengeId: string;
  challengerStake: string;
  callerStake: string;
  pot: string;
  status: string;
  proposedAt: string;
  challenger: string;
  caller: string;
  isTrending: boolean;
};

function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address || '—';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatUsdc(raw: string): string {
  try {
    const n = Number(BigInt(raw)) / 1_000_000;
    if (!Number.isFinite(n)) return '—';
    return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  } catch {
    return '—';
  }
}

/** Deterministic prototype avatar grad class (a–f) per handle. */
const AVATAR_GRAD_CLASSES = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
function gradFor(handle: string): string {
  let acc = 0;
  for (let i = 0; i < handle.length; i++) acc = (acc + handle.charCodeAt(i)) % AVATAR_GRAD_CLASSES.length;
  return `avatar-grad-${AVATAR_GRAD_CLASSES[acc] ?? 'a'}`;
}

async function fetchDuels(): Promise<DuelRow[] | null> {
  if (!RELAYER_URL) return null;
  try {
    const res = await fetch(`${RELAYER_URL}/api/duels`, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const raw = await res.json() as { duels?: unknown[] };
    if (!Array.isArray(raw.duels)) return [];
    return raw.duels.map((d) => {
      const e = d as Record<string, unknown>;
      return {
        challengeId: String(e['challengeId'] ?? ''),
        challengerStake: String(e['challengerStake'] ?? '0'),
        callerStake: String(e['callerStake'] ?? '0'),
        pot: String(e['pot'] ?? '0'),
        status: String(e['status'] ?? 'Proposed'),
        proposedAt: String(e['proposedAt'] ?? '0'),
        challenger: String(e['challenger'] ?? ''),
        caller: String(e['caller'] ?? ''),
        isTrending: Boolean(e['isTrending'] ?? false),
      };
    }).filter((d) => d.challengeId.length > 0);
  } catch {
    return null;
  }
}

export default function DuelsPage() {
  const router = useRouter();
  const [duels, setDuels] = useState<DuelRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setIsError(false);
    const rows = await fetchDuels();
    if (rows === null) {
      setIsError(true);
      setDuels([]);
    } else {
      setDuels(rows);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      {/* Page header — prototype .page-header voice */}
      <div className="page-header">
        <div>
          <h1>Duels</h1>
          <div className="sub">
            <span className="em">1v1.</span> Matched stakes. Winner takes all.
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="col" style={{ gap: 12 }}>
          <div style={{ height: 72, background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }} />
          <div style={{ height: 72, background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }} />
        </div>
      ) : isError ? (
        <div
          className="brutal-card"
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12,
            borderLeft: '3px solid var(--accent-loss)',
          }}
        >
          <span className="label-overline" style={{ color: 'var(--accent-loss)' }}>
            COULDN&apos;T LOAD THE DUELS
          </span>
          <span className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            The duel list didn&apos;t come back. Retry.
          </span>
          <button type="button" className="btn outline-white" onClick={() => void load()} style={{ minHeight: 44 }}>
            RETRY
          </button>
        </div>
      ) : duels && duels.length === 0 ? (
        /* Brutal empty state (C7) */
        <div
          className="brutal-card"
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
            padding: '64px 24px', textAlign: 'center',
          }}
        >
          <span className="label-overline" style={{ letterSpacing: '0.14em' }}>
            NO DUELS YET
          </span>
          <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            Open any call and hit CHALLENGE to start a 1v1.
          </span>
          <Link href="/" className="btn cream" style={{ textDecoration: 'none' }}>
            BACK TO THE TAPE
          </Link>
        </div>
      ) : (
        <div className="brutal-card" style={{ padding: 0 }}>
          <table className="brutal-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>#</th>
                <th>Matchup</th>
                <th style={{ textAlign: 'right' }}>Pot</th>
                <th style={{ textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {(duels ?? []).map((duel) => {
                const challengerAlias = truncateAddress(duel.challenger);
                const callerAlias = truncateAddress(duel.caller);
                return (
                  <tr
                    key={duel.challengeId}
                    onClick={() => {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      router.push(`/duel/${duel.challengeId}` as any);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <span className="mono" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                        #{duel.challengeId}
                      </span>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                        <span className={`avatar sm ${gradFor(challengerAlias)}`} aria-hidden="true">
                          {avatarInitial(challengerAlias)}
                        </span>
                        <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: DUEL_ACCENT }}>
                          {challengerAlias}
                        </span>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>vs</span>
                        <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: CALLER_ACCENT }}>
                          {callerAlias}
                        </span>
                        {duel.isTrending && <span className="pill duel">TRENDING</span>}
                      </div>
                      <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 4 }}>
                        stakes {formatUsdc(duel.challengerStake)} vs {formatUsdc(duel.callerStake)}
                      </div>
                    </td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 700, fontSize: 14 }}>
                      {formatUsdc(duel.pot)}
                    </td>
                    <td className="mono" style={{ textAlign: 'right', fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      {duel.status}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
