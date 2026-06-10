/**
 * LeaderboardClient — client renderer for "The Tape" (/leaderboard).
 *
 * Phase 09.2 (plan 04): prototype leaderboard markup (`call it frontend/screens/
 * leaderboard.jsx` is the markup donor — D-05: never a logic donor) over the
 * EXISTING props contract. page.tsx's RSC fetch is untouched; this stays a dumb
 * props renderer.
 *
 * Layout (renders inside the AppShell `.main` column):
 *   - .page-header: Archivo display title + sub copy.
 *   - #1 hero: <Card accent> with a giant low-opacity "01" watermark behind a
 *     giant Archivo rep numeral + stat blocks (UI-12).
 *   - .brutal-table: rank (.slot-num mono) / caller (square avatar + handle +
 *     call count) / rep (mono 600) / acc% (wins ÷ settledCalls). The VIEWER'S
 *     own row carries .your-row-tint: #1A1A24 bg (= --bg-tertiary) + ACCENT
 *     left border (UI-13).
 *
 * D-07: stats with no live data source are HIDDEN, never faked.
 * D-08: dead prototype controls (period toggles, non-filtering category chips,
 *       NEXT-10 pagination, row click navigation, SORT) are CUT — no dead
 *       buttons ship. The D-06 v1 limitation note stays as static microcopy.
 * AUTH-44: handles only — the `address` field is used for the isViewer
 *          comparison ONLY and is never rendered.
 *
 * Accent (#E8F542) usage stays on the reserved list (UI-SPEC §Color):
 *   - #1 hero card border + "01" watermark (#4)
 *   - the viewer's own highlighted row (#3)
 *
 * Requirements: UI-12, UI-13, D-06
 */

'use client';

import { useAccount } from 'wagmi';
import { Card } from '@call-it/ui';
import { useIsMobile } from '@/app/hooks/useIsMobile';
import type { LeaderboardData, LeaderboardRow } from '@/lib/leaderboard-client';

const ACCENT = '#E8F542';
// #1A1A24 IS --bg-tertiary — the literal is the UI-13 viewer-row tint.
const ROW_HIGHLIGHT_BG = '#1A1A24';

interface LeaderboardClientProps {
  data: LeaderboardData | null;
  fetchError: string | null;
}

/** Deterministic prototype avatar grad (a–f) from the handle. */
const AVATAR_GRADS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
function gradFor(handle: string): string {
  let sum = 0;
  for (let i = 0; i < handle.length; i++) sum += handle.charCodeAt(i);
  return AVATAR_GRADS[sum % AVATAR_GRADS.length] ?? 'a';
}

function initialFor(handle: string): string {
  const ch = handle.replace(/^@/, '').charAt(0);
  return ch ? ch.toUpperCase() : '?';
}

/** Accuracy % from real fields (wins ÷ settledCalls); null when nothing settled (D-07). */
function accuracyPct(row: LeaderboardRow): number | null {
  if (row.settledCalls <= 0) return null;
  return Math.round((row.wins / row.settledCalls) * 100);
}

export function LeaderboardClient({ data, fetchError }: LeaderboardClientProps) {
  const isMobile = useIsMobile(); // UI-48: single-column hero + scrollable table + 44px rows at 375px

  // Viewer address for the UI-13 own-row highlight (comparison only — AUTH-44).
  const { address: viewerAddress } = useAccount();
  const viewer = viewerAddress?.toLowerCase() ?? null;

  const rows = data?.rows ?? [];
  const hero = rows[0] ?? null;
  const heroAccuracy = hero ? accuracyPct(hero) : null;

  return (
    <div>
      {/* Page header — period toggles CUT (D-08: they never refetched; data is All-time only) */}
      <div className="page-header">
        <div>
          <h1>The Tape · Top of book</h1>
          <div className="sub">
            Reputation is a function of <span className="em">accuracy</span> ×{' '}
            <span className="em">volume</span>. Easy to climb. Easy to fall.
          </div>
        </div>
      </div>

      {/* D-06 v1 limitation note — the board is All-time reputation only */}
      <div
        className="mono"
        style={{
          fontSize: '11px',
          letterSpacing: '0.04em',
          color: 'var(--text-tertiary)',
          padding: '8px 12px',
          borderLeft: `3px solid ${ACCENT}`,
          background: 'var(--bg-secondary)',
          marginBottom: '24px',
        }}
      >
        v1 limitation: the board shows All-time reputation. Time-windowed leaderboards
        land in a later release.
      </div>

      {/* Error state (UI-SPEC error-states table) */}
      {fetchError && (
        <div
          className="mono"
          style={{
            fontSize: '13px',
            color: 'var(--text-secondary)',
            padding: '12px 16px',
            borderLeft: '3px solid var(--accent-loss)',
            background: 'var(--bg-secondary)',
          }}
        >
          Couldn&apos;t load the tape. The data feed is catching up — refresh in a moment.
        </div>
      )}

      {/* Empty state (UI-SPEC empty-states table) */}
      {!fetchError && rows.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '32px 0' }}>
          <h2 className="h-2" style={{ margin: 0 }}>
            Nothing on the tape yet
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', margin: 0 }}>
            No callers ranked yet. Make a call to get on the board.
          </p>
        </div>
      )}

      {/* #1 HERO — <Card accent> + giant low-opacity "01" watermark (UI-12) */}
      {!fetchError && hero && (
        <Card
          accent
          style={{
            position: 'relative',
            overflow: 'hidden',
            padding: isMobile ? '28px 20px' : '48px',
            marginBottom: '36px',
          }}
        >
          {/* Watermark "01" */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '-40px',
              right: '-20px',
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(160px, 48vw, 360px)',
              fontWeight: 900,
              letterSpacing: '-0.06em',
              color: ACCENT,
              opacity: 0.06,
              lineHeight: 1,
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            01
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: isMobile ? 'flex-start' : 'center',
              justifyContent: 'space-between',
              gap: '36px',
              position: 'relative',
              zIndex: 1,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <span
                className="mono"
                style={{
                  fontSize: '11px',
                  color: ACCENT,
                  letterSpacing: '0.14em',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                }}
              >
                Rank 01 · Top of book
              </span>
              <div className="row" style={{ gap: '18px' }}>
                <span className={`avatar xl avatar-grad-${gradFor(hero.handle)}`}>
                  {initialFor(hero.handle)}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'clamp(28px, 7vw, 44px)',
                    fontWeight: 900,
                    letterSpacing: '-0.04em',
                    lineHeight: 0.95,
                    textTransform: 'uppercase',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {hero.handle}
                </span>
              </div>
            </div>

            <div>
              <div className="label-overline" style={{ marginBottom: '12px' }}>
                Global rep
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(64px, 18vw, 132px)',
                  fontWeight: 900,
                  letterSpacing: '-0.06em',
                  lineHeight: 0.85,
                  color: 'var(--text-primary)',
                }}
              >
                {hero.globalRep.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Stat blocks — ONLY stats with a real source render (D-07) */}
          <div
            style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              gap: '12px',
              marginTop: '32px',
              position: 'relative',
              zIndex: 1,
            }}
          >
            {heroAccuracy != null && (
              <div className="stat-block" style={{ flex: 1 }}>
                <div className="stat-label">Accuracy</div>
                <div className="stat-value" style={{ color: 'var(--accent-win)' }}>
                  {heroAccuracy}%
                </div>
                <div className="stat-sub">
                  {hero.wins} of {hero.settledCalls} settled
                </div>
              </div>
            )}
            <div className="stat-block" style={{ flex: 1 }}>
              <div className="stat-label">Calls</div>
              <div className="stat-value">{hero.totalCalls}</div>
            </div>
          </div>
        </Card>
      )}

      {/* Table — .brutal-table; viewer row tinted (UI-13). Row click navigation CUT (D-08). */}
      {!fetchError && rows.length > 0 && (
        <div
          className="brutal-card"
          style={{ padding: 0, overflowX: isMobile ? 'auto' : undefined }}
        >
          <table className="brutal-table" style={{ minWidth: isMobile ? '480px' : undefined }}>
            <thead>
              <tr>
                <th style={{ width: '60px' }}>#</th>
                <th>Caller</th>
                <th style={{ textAlign: 'right' }}>Rep</th>
                <th style={{ textAlign: 'right' }}>Acc</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <LeaderboardTableRow
                  key={row.rank}
                  row={row}
                  isViewer={viewer != null && row.address.toLowerCase() === viewer}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer microcopy — real count only; NEXT-10 pagination CUT (D-08) */}
      {!fetchError && rows.length > 0 && (
        <div style={{ marginTop: '18px' }}>
          <span
            className="mono"
            style={{ fontSize: '11px', color: 'var(--text-tertiary)', letterSpacing: '0.04em' }}
          >
            {rows.length} caller{rows.length === 1 ? '' : 's'} on the board · all stats on-chain
          </span>
        </div>
      )}
    </div>
  );
}

function LeaderboardTableRow({ row, isViewer }: { row: LeaderboardRow; isViewer: boolean }) {
  const isMobile = useIsMobile(); // UI-48: each row >=44px tall at mobile
  const acc = accuracyPct(row);
  return (
    <tr
      className={isViewer ? 'your-row-tint' : undefined}
      style={{
        // UI-13: viewer's own row — #1A1A24 bg (--bg-tertiary) + ACCENT left border.
        backgroundColor: isViewer ? ROW_HIGHLIGHT_BG : undefined,
        borderLeft: isViewer ? `3px solid ${ACCENT}` : '3px solid transparent',
        height: isMobile ? '44px' : undefined,
      }}
    >
      <td>
        <span
          className="mono slot-num"
          style={{ fontSize: '13px', color: 'var(--text-tertiary)', fontWeight: 600 }}
        >
          {String(row.rank).padStart(2, '0')}
        </span>
      </td>
      <td>
        <div className="row" style={{ gap: '12px' }}>
          <span className={`avatar sm avatar-grad-${gradFor(row.handle)}`}>
            {initialFor(row.handle)}
          </span>
          <div className="col" style={{ gap: '2px' }}>
            <span style={{ fontWeight: 700, fontSize: '13.5px' }}>
              {row.handle}
              {isViewer && (
                <span
                  className="mono"
                  style={{
                    marginLeft: '8px',
                    fontSize: '10px',
                    color: 'var(--accent-win)',
                    letterSpacing: '0.1em',
                    fontWeight: 700,
                  }}
                >
                  · YOU
                </span>
              )}
            </span>
            <span className="mono" style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>
              {row.totalCalls} call{row.totalCalls === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      </td>
      <td className="mono" style={{ textAlign: 'right', fontSize: '16px', fontWeight: 600 }}>
        {row.globalRep.toLocaleString()}
      </td>
      <td
        className="mono"
        style={{
          textAlign: 'right',
          fontSize: '13px',
          fontWeight: 600,
          color: acc != null && acc >= 70 ? 'var(--accent-win)' : 'var(--text-secondary)',
        }}
      >
        {acc != null ? `${acc}%` : '—'}
      </td>
    </tr>
  );
}
