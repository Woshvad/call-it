/**
 * LeaderboardClient — client renderer for "The Tape" (/leaderboard).
 *
 * Built from @call-it/ui primitives (Card). FLEXBOX ONLY — no CSS grid anywhere
 * (consistency with OG + Pitfall 15; UI-SPEC §Leaderboard).
 *
 * Layout (UI-SPEC §Leaderboard):
 *   - Title block: "The Tape" (Syne display) + "Top of book" (muted subtitle).
 *   - Time toggle: 7D / 30D / ALL-TIME segmented control; active = accent.
 *   - Category chips: All / Majors / DeFi / Other; active = accent.
 *   - #1 Hero Card: accent border + giant low-opacity "01" Syne watermark behind content.
 *   - Table: rows on brand-surface; the VIEWER'S OWN ROW highlighted with accent
 *     (left border + #1A1A24 bg, UI-13). Rank + rep in mono bold, handle in mono.
 *
 * D-06: the 7D/30D toggles are wired but ALL backed by All-time globalRep data — a
 * documented v1 limitation rendered as a visible note. The LeaderboardEntry entity
 * is NOT used.
 *
 * Accent (#E8F542) usage here is on the EXACT reserved list (UI-SPEC §Color):
 *   - active toggle / active category chip (#7)
 *   - #1 Hero card border + "01" watermark (#4)
 *   - the viewer's own highlighted row (#3)
 *
 * Requirements: UI-12, UI-13, D-06
 */

'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { Card } from '@call-it/ui';
import { useIsMobile } from '@/app/hooks/useIsMobile';
import type { LeaderboardData, LeaderboardRow, LeaderboardWindow } from '@/lib/leaderboard-client';

const ACCENT = '#E8F542';
const ROW_HIGHLIGHT_BG = '#1A1A24';

type CategoryChip = 'All' | 'Majors' | 'DeFi' | 'Other';

interface LeaderboardClientProps {
  data: LeaderboardData | null;
  fetchError: string | null;
}

const TIME_WINDOWS: { id: LeaderboardWindow; label: string }[] = [
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: 'all', label: 'ALL-TIME' },
];

const CATEGORY_CHIPS: CategoryChip[] = ['All', 'Majors', 'DeFi', 'Other'];

export function LeaderboardClient({ data, fetchError }: LeaderboardClientProps) {
  const isMobile = useIsMobile(); // Phase 9 (09-05): container clamp + >=44px toggles/chips at mobile (UI-48/D-03)
  // ALL-TIME is the only window with real data (D-06) — default to it.
  const [activeWindow, setActiveWindow] = useState<LeaderboardWindow>('all');
  const [activeCategory, setActiveCategory] = useState<CategoryChip>('All');

  // Viewer address for the UI-13 own-row highlight.
  const { address: viewerAddress } = useAccount();
  const viewer = viewerAddress?.toLowerCase() ?? null;

  const rows = data?.rows ?? [];
  const hero = rows[0] ?? null;
  const tableRows = rows;

  return (
    <main
      style={{
        // Phase 9 (09-05): full-width clamp at mobile so the 760px container never forces scroll (UI-48).
        width: isMobile ? '100%' : undefined,
        maxWidth: isMobile ? '100%' : '760px',
        margin: '0 auto',
        padding: '24px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}
    >
      {/* Title block */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <h1 className="font-display font-bold text-brand-text text-3xl uppercase tracking-wide">
          The Tape
        </h1>
        <p className="font-body text-brand-muted text-base">Top of book</p>
      </div>

      {/* Time toggle — 7D / 30D / ALL-TIME (active = accent) */}
      <div style={{ display: 'flex', flexDirection: 'row', gap: '8px' }}>
        {TIME_WINDOWS.map((w) => {
          const active = w.id === activeWindow;
          return (
            <button
              key={w.id}
              onClick={() => setActiveWindow(w.id)}
              className="font-mono text-xs uppercase tracking-wide"
              style={{
                padding: isMobile ? '0 14px' : '6px 14px',
                minHeight: isMobile ? '44px' : undefined,
                border: '3px solid',
                borderColor: active ? ACCENT : '#27272A',
                color: active ? ACCENT : '#A1A1AA',
                backgroundColor: '#18181B',
                cursor: 'pointer',
                fontWeight: active ? 700 : 400,
              }}
            >
              {w.label}
            </button>
          );
        })}
      </div>

      {/* D-06 v1-limitation note (only matters off the all-time window) */}
      {activeWindow !== 'all' && (
        <div
          className="font-mono text-xs text-brand-muted"
          style={{
            padding: '8px 12px',
            borderLeft: `3px solid ${ACCENT}`,
            backgroundColor: '#18181B',
          }}
        >
          v1 limitation: windowed rankings show All-time reputation. Time-windowed
          leaderboards land in a later release.
        </div>
      )}

      {/* Category chips — All / Majors / DeFi / Other (active = accent) */}
      <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', flexWrap: 'wrap' }}>
        {CATEGORY_CHIPS.map((c) => {
          const active = c === activeCategory;
          return (
            <button
              key={c}
              onClick={() => setActiveCategory(c)}
              className="font-mono text-xs"
              style={{
                padding: isMobile ? '0 12px' : '4px 12px',
                minHeight: isMobile ? '44px' : undefined,
                border: '2px solid',
                borderColor: active ? ACCENT : '#27272A',
                color: active ? ACCENT : '#A1A1AA',
                backgroundColor: '#18181B',
                cursor: 'pointer',
                fontWeight: active ? 700 : 400,
              }}
            >
              {c}
            </button>
          );
        })}
      </div>

      {/* Error state (UI-SPEC error-states table) */}
      {fetchError && (
        <div
          className="font-mono text-sm text-brand-muted"
          style={{
            padding: '12px 16px',
            borderLeft: '3px solid #EF4444',
            backgroundColor: '#18181B',
          }}
        >
          Couldn&apos;t load the tape. The data feed is catching up — refresh in a moment.
        </div>
      )}

      {/* Empty state (UI-SPEC empty-states table) */}
      {!fetchError && rows.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '32px 0' }}>
          <h2 className="font-display font-bold text-brand-text text-xl">Nothing on the tape yet</h2>
          <p className="font-body text-brand-muted text-base">
            No callers ranked for this period. Make a call to get on the board.
          </p>
        </div>
      )}

      {/* #1 Hero card — accent border + giant faded "01" Syne watermark (UI-12) */}
      {!fetchError && hero && (
        <Card accent style={{ position: 'relative', overflow: 'hidden' }}>
          {/* Giant low-opacity "01" watermark behind content */}
          <span
            aria-hidden="true"
            className="font-display font-bold"
            style={{
              position: 'absolute',
              right: '8px',
              top: '-24px',
              fontSize: '160px',
              lineHeight: 1,
              color: ACCENT,
              opacity: 0.08,
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            01
          </span>
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span className="font-mono text-xs uppercase tracking-wide text-brand-muted">#1 on the tape</span>
            <a
              href={`/profile/${hero.address}`}
              className="font-display font-bold text-brand-text text-xl"
              style={{
                textDecoration: 'none',
                // Mobile (D-03): pad the hit area to >=44px without altering desktop density.
                display: isMobile ? 'inline-flex' : undefined,
                alignItems: isMobile ? 'center' : undefined,
                minHeight: isMobile ? '44px' : undefined,
              }}
            >
              @{hero.handle}
            </a>
            <div style={{ display: 'flex', flexDirection: 'row', gap: '24px', marginTop: '4px' }}>
              <HeroStat label="Rep" value={String(hero.globalRep)} />
              <HeroStat label="Calls" value={String(hero.totalCalls)} />
              <HeroStat label="Wins" value={String(hero.wins)} />
            </div>
          </div>
        </Card>
      )}

      {/* Table — rows on brand-surface; viewer row highlighted (UI-13) */}
      {!fetchError && tableRows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {/* Header row */}
          <div
            className="font-mono text-xs uppercase tracking-wide text-brand-muted"
            style={{ display: 'flex', flexDirection: 'row', padding: '8px 12px' }}
          >
            <span style={{ width: '48px' }}>#</span>
            <span style={{ flex: 1 }}>Caller</span>
            <span style={{ width: '80px', textAlign: 'right' }}>Rep</span>
            <span style={{ width: '72px', textAlign: 'right' }}>Calls</span>
          </div>
          {tableRows.map((row) => (
            <LeaderboardTableRow
              key={row.address}
              row={row}
              isViewer={viewer != null && row.address.toLowerCase() === viewer}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <span className="font-mono text-xs uppercase tracking-wide text-brand-muted">{label}</span>
      <span className="font-mono font-bold text-brand-text text-lg">{value}</span>
    </div>
  );
}

function LeaderboardTableRow({ row, isViewer }: { row: LeaderboardRow; isViewer: boolean }) {
  const isMobile = useIsMobile(); // Phase 9 (09-05): each row >=44px tall at mobile (D-03); viewer accent preserved
  return (
    <a
      href={`/profile/${row.address}`}
      style={{
        display: 'flex',
        flexDirection: 'row', // Stays row at mobile (Divergence #1: live 4-col layout already fits 343px — no column drop).
        alignItems: 'center',
        padding: '10px 12px',
        minHeight: isMobile ? '44px' : undefined,
        // UI-13: the viewer's own row is highlighted with accent (left border + #1A1A24 bg) — preserved through the mobile path.
        backgroundColor: isViewer ? ROW_HIGHLIGHT_BG : '#18181B',
        borderLeft: isViewer ? `3px solid ${ACCENT}` : '3px solid transparent',
        textDecoration: 'none',
      }}
    >
      <span className="font-mono font-bold text-brand-text text-sm" style={{ width: '48px' }}>
        {row.rank}
      </span>
      <span className="font-mono text-brand-text text-sm" style={{ flex: 1 }}>
        @{row.handle}
      </span>
      <span
        className="font-mono font-bold text-brand-text text-sm"
        style={{ width: '80px', textAlign: 'right' }}
      >
        {row.globalRep}
      </span>
      <span
        className="font-mono text-brand-muted text-sm"
        style={{ width: '72px', textAlign: 'right' }}
      >
        {row.totalCalls}
      </span>
    </a>
  );
}
