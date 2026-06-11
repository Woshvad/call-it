/**
 * /duels — tabbed duels surface (quick-260611-ust, user request 2026-06-11).
 *
 * Live duels / Settled duels tabs mirroring the tape's .tabs recipe
 * (app/page.tsx), a DUEL KING banner surfacing the wire field the web
 * previously dropped, and rich at-a-glance DuelCard lists replacing the bare
 * 4-column brutal-table.
 *
 * Data: TWO independent fetches via lib/duels-client — fetchDuels() (route
 * default Proposed+Accepted) and fetchDuels('Settled') (subgraph status value,
 * packages/subgraph/src/challenge-escrow.ts). Each tab owns its OWN
 * loading/error state — a settled-fetch failure never kills the live tab and
 * vice versa. Count chips render ONLY post-fetch-success (D-07: null while
 * loading/failed). The DUEL KING banner hides entirely when the wire field is
 * null (D-07).
 *
 * Per-duel enrichment (market line / expiry clock / consensus / winner) via
 * useDuelEnrichment (one-shot, capped, zero polling); handles via the existing
 * useFeedHandles ProfileRegistry tier — fallback stays the truncated address.
 *
 * D-27: the relayer proxies the subgraph — no Studio key in this bundle.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  fetchDuels,
  formatUsdc,
  truncateAddress,
  type DuelEntry,
  type DuelKing,
} from '@/lib/duels-client';
import { DuelCard } from '@/components/DuelCard';
import { useDuelEnrichment } from '@/hooks/useDuelEnrichment';
import { useFeedHandles } from '@/hooks/useFeedMarketData';

type DuelsTab = 'live' | 'settled';

/** Coarse honest time-ago from an ISO timestamp (duelKing.lastWinAt). */
function timeAgoIso(iso: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const delta = Math.floor((Date.now() - ms) / 1000);
  if (delta < 60) return 'just now';
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

export default function DuelsPage() {
  const [activeTab, setActiveTab] = useState<DuelsTab>('live');

  // Independent per-tab state (D-07: count chips only post-fetch-success;
  // a settled failure degrades ONLY the settled tab).
  const [liveDuels, setLiveDuels] = useState<DuelEntry[] | null>(null);
  const [liveLoading, setLiveLoading] = useState(true);
  const [liveError, setLiveError] = useState(false);
  const [settledDuels, setSettledDuels] = useState<DuelEntry[] | null>(null);
  const [settledLoading, setSettledLoading] = useState(true);
  const [settledError, setSettledError] = useState(false);
  const [duelKing, setDuelKing] = useState<DuelKing | null>(null);

  const loadLive = useCallback(async () => {
    setLiveLoading(true);
    setLiveError(false);
    const res = await fetchDuels(); // route default: Proposed + Accepted
    if (res === null) {
      setLiveError(true);
      setLiveDuels(null);
      setDuelKing(null);
    } else {
      setLiveDuels(res.duels);
      setDuelKing(res.duelKing);
    }
    setLiveLoading(false);
  }, []);

  const loadSettled = useCallback(async () => {
    setSettledLoading(true);
    setSettledError(false);
    // Subgraph ChallengeStatus value (packages/subgraph/src/challenge-escrow.ts)
    const res = await fetchDuels('Settled');
    if (res === null) {
      setSettledError(true);
      setSettledDuels(null);
    } else {
      setSettledDuels(res.duels);
    }
    setSettledLoading(false);
  }, []);

  useEffect(() => {
    void loadLive();
    void loadSettled();
  }, [loadLive, loadSettled]);

  // ── Hooks at top, unconditional (React hook rules) — empty inputs no-op ─────
  const activeDuels = activeTab === 'live' ? liveDuels : settledDuels;
  const enrichMap = useDuelEnrichment(activeDuels);

  // ALL challenger/caller/winner/duelKing addresses (useFeedHandles dedupes +
  // lowercases internally; empty array when nothing has loaded yet).
  const handleAddrs: string[] = [];
  for (const d of [...(liveDuels ?? []), ...(settledDuels ?? [])]) {
    handleAddrs.push(d.challenger, d.caller);
  }
  for (const e of enrichMap.values()) {
    if (e.winner) handleAddrs.push(e.winner);
  }
  if (duelKing) handleAddrs.push(duelKing.winnerAddress);
  const handlesMap = useFeedHandles(handleAddrs);

  // ── Per-tab view state ──────────────────────────────────────────────────────
  const isLoading = activeTab === 'live' ? liveLoading : settledLoading;
  const isError = activeTab === 'live' ? liveError : settledError;
  const retry = activeTab === 'live' ? loadLive : loadSettled;

  const liveCount = liveDuels !== null ? liveDuels.length : null;
  const settledCount = settledDuels !== null ? settledDuels.length : null;

  const kingLastWin = duelKing?.lastWinAt ? timeAgoIso(duelKing.lastWinAt) : null;
  const kingHandle = duelKing
    ? handlesMap.get(duelKing.winnerAddress.toLowerCase()) ??
      truncateAddress(duelKing.winnerAddress)
    : null;

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

      {/* DUEL KING banner — the wire field the web previously dropped.
          Hidden entirely when null (D-07: never fake a king). */}
      {duelKing && (
        <div
          className="brutal-card"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 16,
            marginBottom: 20,
            borderLeft: '3px solid var(--accent-duel)',
          }}
        >
          <span className="label-overline" style={{ color: 'var(--accent-duel)' }}>
            DUEL KING
          </span>
          <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-duel)' }}>
            {kingHandle}
          </span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            WIN STREAK {duelKing.winStreak}
          </span>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            HIGHEST POT {formatUsdc(duelKing.highestPotUsdc)}
          </span>
          {kingLastWin && (
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              last win {kingLastWin}
            </span>
          )}
        </div>
      )}

      {/* Tab bar — the tape's .tabs recipe (app/page.tsx): role=tab,
          aria-selected, min-height 44, count chip ONLY post-fetch-success */}
      <div className="tabs" role="tablist">
        {(['live', 'settled'] as const).map((tab) => {
          const count = tab === 'live' ? liveCount : settledCount;
          return (
            <button
              type="button"
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`tab ${activeTab === tab ? 'active' : ''}`}
              style={{
                background: 'none',
                border: 'none',
                borderBottom:
                  activeTab === tab
                    ? '3px solid var(--accent-win)'
                    : '3px solid transparent',
                minHeight: 44,
              }}
            >
              {tab === 'live' ? 'Live duels' : 'Settled duels'}
              {count != null && <span className="count">{count}</span>}
            </button>
          );
        })}
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
          <button type="button" className="btn outline-white" onClick={() => void retry()} style={{ minHeight: 44 }}>
            RETRY
          </button>
        </div>
      ) : activeDuels && activeDuels.length === 0 ? (
        activeTab === 'live' ? (
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
          <div
            className="brutal-card"
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
              padding: '64px 24px', textAlign: 'center',
            }}
          >
            <span className="label-overline" style={{ letterSpacing: '0.14em' }}>
              NO SETTLED DUELS YET.
            </span>
            <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              Finished duels land here with their receipts.
            </span>
          </div>
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(activeDuels ?? []).map((duel) => (
            <DuelCard
              key={duel.challengeId}
              duel={duel}
              enrichment={enrichMap.get(duel.challengeId)}
              handles={handlesMap}
            />
          ))}
        </div>
      )}
    </div>
  );
}
