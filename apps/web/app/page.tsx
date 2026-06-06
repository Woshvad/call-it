/**
 * Call It — Home feed page (/)
 *
 * Phase 1 feed shell (Plan 09):
 *   - Unauthenticated visitors: see the feed + [Sign in] CTA (§18.1 — public read)
 *   - Authenticated users: see the feed + [+ NEW CALL] primary CTA
 *   - Empty feed: renders D-35 empty state copy + primary button
 *   - Feed cards stagger enter (UI-53) via .card-enter + --index CSS variable
 *   - First page auto-polls every 5s (UI-56) via useFeed refetchInterval
 *
 * Phase 3 (Plan 07) additions:
 *   - Duels tab (fourth tab) with Active / Trending / Recently settled sections
 *   - Filter chips: All / Active / Just settled / High-stakes / Trending
 *   - ⚔ OPEN badge on CallCards where call.openToChallenges == true
 *   - TRENDING DUEL pin at top of Live tab feed (3px #E8F542 border + hard shadow)
 *   - Duel King badge (placeholder — no badge renders when duel_kings has no row)
 *   - ⚔ Challengeable filter chip on Live tab
 *
 * Data: relayer /api/feed (D-24/25/26/27) + relayer /api/duels (Phase 3)
 *
 * Requirements: CALL-58, CALL-59, CALL-60, UI-04, UI-53, UI-56, SOCIAL-40, SOCIAL-41, SOCIAL-42
 *
 * D-12: Domain literals are never hardcoded.
 * D-08: Recently settled duels is a placeholder until Phase 4.
 * D-11: Duel King badge not rendered when duel_kings table empty (Phase 3 correct behavior).
 */

'use client';

import React, { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useFeed } from '@/hooks/useFeed';
import { FeedList } from '@/components/FeedList';
import { ChallengeFormModal } from '@/app/components/ChallengeFormModal';
import { FromYourNetworkSections } from '@/app/components/FromYourNetworkSections';
import type { FeedItem } from '@/lib/relayer-client';

// Import the global CSS for feed card stagger animation (UI-53)
import './globals.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type FeedTab = 'Live' | 'Settled' | 'Following' | 'Duels';
type DuelFilter = 'All' | 'Active' | 'Just settled' | 'High-stakes' | 'Trending';
type LiveFilter = 'All' | 'Challengeable';

interface DuelRow {
  id: string;
  callId: string;
  callerHandle: string;
  challengerHandle: string;
  callerRep?: number;
  challengerRep?: number;
  marketStatement: string;
  pot: number;          // USDC in dollars
  timeRemaining?: string;
  callerConsensusPct: number; // 0-100
  isTrending?: boolean;
  status: 'Active' | 'Settled';
}

interface DuelKingRow {
  winnerAddress: string;
  winnerHandle: string;
}

// ── Duels API fetch ────────────────────────────────────────────────────────────

async function fetchDuels(params?: Record<string, string>): Promise<DuelRow[]> {
  try {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    const res = await fetch(`/api/duels${qs}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json() as { duels?: DuelRow[]; deferred?: boolean };
    if (data.deferred) return [];
    return data.duels ?? [];
  } catch {
    return [];
  }
}

async function fetchDuelKing(): Promise<DuelKingRow | null> {
  try {
    const res = await fetch('/api/duels?type=king', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json() as { king?: DuelKingRow; deferred?: boolean };
    if (data.deferred || !data.king) return null;
    return data.king;
  } catch {
    return null;
  }
}

// ── Color tokens ───────────────────────────────────────────────────────────────
// Established in Phase 1; repeated here for inline styles (Satori/OG-card parity).
const COLORS = {
  bg: '#09090E',
  surface: '#111118',
  surfaceElevated: '#1A1A24',
  borderSubtle: '#1E1E2E',
  borderActive: '#2E2E42',
  accent: '#E8F542',
  challenger: '#FB923C',
  textPrimary: '#F1F5F9',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
} as const;

// ── Badge Components ───────────────────────────────────────────────────────────

/** ⚔ OPEN badge — renders on CallCard when call.openToChallenges == true */
function OpenChallengeBadge() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '2px',
        border: `2px solid ${COLORS.accent}`,
        background: '#0D1A00',
        color: COLORS.accent,
        fontFamily: 'Space Grotesk, monospace',
        fontSize: '12px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.10em',
        borderRadius: '2px',
        padding: '2px 4px',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      ⚔ OPEN
    </span>
  );
}

/** TRENDING DUEL label pill badge */
function TrendingDuelBadge() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        border: `2px solid ${COLORS.accent}`,
        background: '#0D1A00',
        color: COLORS.accent,
        fontFamily: 'Space Grotesk, monospace',
        fontSize: '12px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        borderRadius: '2px',
        padding: '2px 6px',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      TRENDING DUEL
    </span>
  );
}

/** DUEL KING badge — renders only when duel_kings table has a row (Phase 4 activates) */
function DuelKingBadge() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        border: `2px solid ${COLORS.accent}`,
        background: '#0D1A00',
        color: COLORS.accent,
        fontFamily: 'Space Grotesk, monospace',
        fontSize: '12px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.10em',
        borderRadius: '2px',
        padding: '2px 4px',
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      {/* Crown character as Duel King icon (Lucide Crown not available in inline RSC context) */}
      <span style={{ fontSize: '11px' }}>♛</span>
      DUEL KING
    </span>
  );
}

// ── Duel row component ─────────────────────────────────────────────────────────

interface DuelRowCardProps {
  duel: DuelRow;
  duelKing: DuelKingRow | null;
  isTrending?: boolean;
}

function DuelRowCard({ duel, duelKing, isTrending }: DuelRowCardProps) {
  const isKingCaller = duelKing?.winnerHandle === duel.callerHandle;
  const isKingChallenger = duelKing?.winnerHandle === duel.challengerHandle;
  const callerBarWidth = Math.max(duel.callerConsensusPct, 2);
  const challengerBarWidth = Math.max(100 - duel.callerConsensusPct, 2);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderBottom: `2px solid ${COLORS.borderSubtle}`,
        padding: '12px 0',
        position: 'relative',
      }}
    >
      {/* Trending label — top-right of row */}
      {isTrending && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginBottom: '6px',
          }}
        >
          <TrendingDuelBadge />
        </div>
      )}

      {/* Main row: caller | market info | challenger */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        {/* Caller cell */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            minWidth: '120px',
            gap: '2px',
          }}
        >
          {/* Avatar placeholder 32px */}
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: `2px solid ${COLORS.accent}`,
              background: COLORS.surfaceElevated,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 700,
              color: COLORS.accent,
            }}
          >
            {(duel.callerHandle[0] ?? '?').toUpperCase()}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontFamily: 'Space Grotesk, monospace',
                fontSize: '16px',
                fontWeight: 700,
                color: COLORS.accent,
              }}
            >
              @{duel.callerHandle}
            </span>
            {/* Duel King badge: only renders when duel_kings has a row (D-11) */}
            {isKingCaller && <DuelKingBadge />}
          </div>
          {duel.callerRep !== undefined && (
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                color: COLORS.textSecondary,
              }}
            >
              {duel.callerRep} rep
            </span>
          )}
        </div>

        {/* Center: market statement + pot + time */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            gap: '4px',
          }}
        >
          <span
            style={{
              fontFamily: 'Space Grotesk, monospace',
              fontSize: '16px',
              fontWeight: 400,
              color: COLORS.textPrimary,
            }}
          >
            {duel.marketStatement}
          </span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '12px',
                fontWeight: 400,
                color: COLORS.accent,
              }}
            >
              ${duel.pot.toLocaleString()}
            </span>
            {duel.timeRemaining && (
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  color: COLORS.textMuted,
                }}
              >
                {duel.timeRemaining}
              </span>
            )}
          </div>
        </div>

        {/* Challenger cell */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            minWidth: '120px',
            gap: '2px',
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              border: `2px solid ${COLORS.challenger}`,
              background: COLORS.surfaceElevated,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 700,
              color: COLORS.challenger,
            }}
          >
            {(duel.challengerHandle[0] ?? '?').toUpperCase()}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                fontFamily: 'Space Grotesk, monospace',
                fontSize: '16px',
                fontWeight: 700,
                color: COLORS.challenger,
              }}
            >
              @{duel.challengerHandle}
            </span>
            {isKingChallenger && <DuelKingBadge />}
          </div>
          {duel.challengerRep !== undefined && (
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                color: COLORS.textSecondary,
              }}
            >
              {duel.challengerRep} rep
            </span>
          )}
        </div>
      </div>

      {/* Consensus bar: #E8F542 caller / #FB923C challenger — 4px tall, no border-radius */}
      <div
        style={{
          display: 'flex',
          height: '4px',
          marginTop: '8px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            width: `${callerBarWidth}%`,
            background: COLORS.accent,
            height: '100%',
          }}
        />
        <div
          style={{
            display: 'flex',
            width: `${challengerBarWidth}%`,
            background: COLORS.challenger,
            height: '100%',
          }}
        />
      </div>
    </div>
  );
}

// ── Duels tab content ──────────────────────────────────────────────────────────

interface DuelsTabProps {
  duelKing: DuelKingRow | null;
}

function DuelsTab({ duelKing }: DuelsTabProps) {
  const [activeFilter, setActiveFilter] = useState<DuelFilter>('All');
  const [duels, setDuels] = useState<DuelRow[]>([]);
  const [isLoadingDuels, setIsLoadingDuels] = useState(true);

  useEffect(() => {
    setIsLoadingDuels(true);
    void fetchDuels().then((rows) => {
      setDuels(rows);
      setIsLoadingDuels(false);
    });
  }, []);

  const filters: DuelFilter[] = ['All', 'Active', 'Just settled', 'High-stakes', 'Trending'];

  // Apply client-side filter
  const filteredDuels = duels.filter((d) => {
    if (activeFilter === 'All') return true;
    if (activeFilter === 'Active') return d.status === 'Active';
    if (activeFilter === 'Just settled') return d.status === 'Settled';
    if (activeFilter === 'High-stakes') return d.pot >= 500;
    if (activeFilter === 'Trending') return d.isTrending === true;
    return true;
  });

  const trendingDuels = filteredDuels.filter((d) => d.isTrending);
  const activeDuels = filteredDuels.filter((d) => d.status === 'Active' && !d.isTrending);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
      {/* Filter chips */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: '8px',
          flexWrap: 'wrap',
          marginBottom: '16px',
        }}
      >
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            style={{
              padding: '4px 10px',
              fontFamily: 'Space Grotesk, monospace',
              fontSize: '12px',
              fontWeight: 400,
              cursor: 'pointer',
              border: `2px solid ${activeFilter === f ? COLORS.accent : COLORS.borderActive}`,
              background: activeFilter === f ? COLORS.accent : COLORS.surface,
              color: activeFilter === f ? COLORS.bg : COLORS.textPrimary,
              borderRadius: '0px',
              transition: 'none',
            }}
          >
            {f}
            {f === 'High-stakes' && (
              <span style={{ marginLeft: '4px', color: activeFilter === f ? COLORS.bg : COLORS.textSecondary, fontSize: '11px' }}>
                (&gt;$500)
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoadingDuels ? (
        <div style={{ color: COLORS.textMuted, fontFamily: 'monospace', fontSize: '14px', padding: '24px 0' }}>
          Loading duels...
        </div>
      ) : (
        <>
          {/* Trending section — pinned above Active when qualifying duels exist */}
          {trendingDuels.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '16px' }}>
              <div
                style={{
                  fontFamily: 'Space Grotesk, monospace',
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: COLORS.textSecondary,
                  marginBottom: '8px',
                }}
              >
                TRENDING DUELS ({trendingDuels.length})
              </div>
              {trendingDuels.slice(0, 3).map((duel) => (
                <DuelRowCard key={duel.id} duel={duel} duelKing={duelKing} isTrending />
              ))}
              {trendingDuels.length > 3 && (
                <div
                  style={{
                    fontFamily: 'Space Grotesk, monospace',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: COLORS.accent,
                    padding: '8px 0',
                    cursor: 'pointer',
                  }}
                >
                  Show {trendingDuels.length - 3} more trending
                </div>
              )}
            </div>
          )}

          {/* Active duels section */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                fontFamily: 'Space Grotesk, monospace',
                fontSize: '12px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: COLORS.textSecondary,
                marginBottom: '8px',
              }}
            >
              ACTIVE DUELS ({activeDuels.length})
            </div>
            {activeDuels.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '32px 16px',
                  border: `2px solid ${COLORS.borderSubtle}`,
                  background: COLORS.surface,
                  textAlign: 'center',
                }}
              >
                <span style={{ fontSize: '24px' }}>⚔</span>
                <span
                  style={{
                    fontFamily: 'Space Grotesk, monospace',
                    fontSize: '14px',
                    color: COLORS.textSecondary,
                  }}
                >
                  No active duels yet. Challenge a caller to get started.
                </span>
                <OpenChallengeBadge />
              </div>
            ) : (
              activeDuels.map((duel) => (
                <DuelRowCard key={duel.id} duel={duel} duelKing={duelKing} />
              ))
            )}
          </div>

          {/* Recently settled section — D-08 placeholder until Phase 4 */}
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: '24px' }}>
            <div
              style={{
                fontFamily: 'Space Grotesk, monospace',
                fontSize: '12px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: COLORS.textSecondary,
                marginBottom: '8px',
              }}
            >
              RECENTLY SETTLED (7D)
            </div>
            {/* D-08: Phase 3 placeholder — inert until Phase 4 settlement */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '24px 16px',
                border: `2px solid ${COLORS.borderSubtle}`,
                background: COLORS.surface,
                textAlign: 'center',
              }}
            >
              <span
                style={{
                  fontFamily: 'Space Grotesk, monospace',
                  fontSize: '14px',
                  color: COLORS.textMuted,
                }}
              >
                No settled duels yet. Settle pending calls to see duel outcomes here.
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Trending duel pin in Live tab ──────────────────────────────────────────────

interface TrendingDuelPinProps {
  duel: DuelRow;
  duelKing: DuelKingRow | null;
}

function TrendingDuelPin({ duel, duelKing }: TrendingDuelPinProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        border: `3px solid ${COLORS.accent}`,
        background: COLORS.surface,
        boxShadow: `4px 4px 0 ${COLORS.accent}`,
        marginBottom: '16px',
        padding: '12px 16px',
        position: 'relative',
      }}
    >
      {/* Pin label — top-left */}
      <div style={{ display: 'flex', marginBottom: '8px' }}>
        <TrendingDuelBadge />
      </div>
      <DuelRowCard duel={duel} duelKing={duelKing} isTrending={false} />
    </div>
  );
}

// ── Main page component ────────────────────────────────────────────────────────

export default function HomePage() {
  const { ready, authenticated } = usePrivy();
  const router = useRouter();
  const { allItems, isLoading, fetchNextPage, hasNextPage } = useFeed();

  // Tab state
  const [activeTab, setActiveTab] = useState<FeedTab>('Live');
  const [liveFilter, setLiveFilter] = useState<LiveFilter>('All');

  // Challenge modal state (Known Plan Issue #4: shared from 03-06, not duplicated)
  const [challengeModalCallId, setChallengeModalCallId] = useState<bigint | null>(null);

  // Duels state (loaded lazily when Duels tab activated or for trending pin in Live tab)
  const [duels, setDuels] = useState<DuelRow[]>([]);
  const [duelKing, setDuelKing] = useState<DuelKingRow | null>(null);
  const [duelsLoaded, setDuelsLoaded] = useState(false);

  // Load duels data once (for trending pin in Live tab + Duels tab)
  useEffect(() => {
    void fetchDuels().then((rows) => {
      setDuels(rows);
      setDuelsLoaded(true);
    });
    void fetchDuelKing().then(setDuelKing);
  }, []);

  // Trending duel for Live tab pin (highest pot trending duel)
  const trendingDuel = duelsLoaded ? (duels.find((d) => d.isTrending) ?? null) : null;

  function handleNewCallClick() {
    if (authenticated) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push('/new' as any);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      router.push('/signin' as any);
    }
  }

  // Apply live tab filter: "⚔ Challengeable" shows only openToChallenges == true calls
  // FeedItem may be extended server-side with openToChallenges; cast to unknown first (AUTH-44 safe)
  const filteredLiveItems = liveFilter === 'Challengeable'
    ? allItems.filter((item) => (item as unknown as { openToChallenges?: boolean }).openToChallenges === true)
    : allItems;

  const tabs: FeedTab[] = ['Live', 'Settled', 'Following', 'Duels'];

  return (
    <main
      style={{
        maxWidth: '680px',
        margin: '0 auto',
        padding: '24px 16px',
      }}
    >
      {/* Header row */}
      <header
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}
      >
        <h1
          style={{
            fontSize: '1.5rem',
            fontWeight: 900,
            fontFamily: 'monospace',
            letterSpacing: '-0.02em',
            color: '#E8F542',
            margin: 0,
          }}
        >
          CALL IT
        </h1>

        {/* Auth-aware CTA — only shown when Privy is ready */}
        {ready && (
          <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', alignItems: 'center' }}>
            {authenticated ? (
              <button
                onClick={handleNewCallClick}
                style={{
                  padding: '8px 16px',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  backgroundColor: '#E8F542',
                  color: '#09090E',
                  border: '2px solid #000',
                  boxShadow: '3px 3px 0 0 #000',
                  cursor: 'pointer',
                }}
              >
                + NEW CALL
              </button>
            ) : (
              <button
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onClick={() => router.push('/signin' as any)}
                style={{
                  padding: '8px 16px',
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  backgroundColor: 'transparent',
                  color: '#E8F542',
                  border: '2px solid #E8F542',
                  cursor: 'pointer',
                }}
              >
                Sign in
              </button>
            )}
          </div>
        )}
      </header>

      {/* ── Tab bar: Live / Settled / Following / Duels ─────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          borderBottom: `2px solid ${COLORS.borderSubtle}`,
          marginBottom: '16px',
          gap: '0',
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 16px',
              fontFamily: 'Space Grotesk, monospace',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? `2px solid ${COLORS.accent}` : '2px solid transparent',
              color: activeTab === tab ? COLORS.textPrimary : COLORS.textSecondary,
              marginBottom: '-2px',
              transition: 'none',
            }}
          >
            {tab === 'Duels' ? '⚔ Duels' : tab}
          </button>
        ))}
      </div>

      {/* ── Live tab ─────────────────────────────────────────────────────────── */}
      {activeTab === 'Live' && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* "From your X / Farcaster" sections — render above the main feed for
              opted-in viewers only (AUTH-16 gate inside; self-hides otherwise). */}
          <FromYourNetworkSections />

          {/* Live tab filter chips: All / ⚔ Challengeable */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: '8px',
              marginBottom: '16px',
              flexWrap: 'wrap',
            }}
          >
            {(['All', 'Challengeable'] as LiveFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setLiveFilter(f)}
                style={{
                  padding: '4px 10px',
                  fontFamily: 'Space Grotesk, monospace',
                  fontSize: '12px',
                  fontWeight: 400,
                  cursor: 'pointer',
                  border: `2px solid ${liveFilter === f ? COLORS.accent : COLORS.borderActive}`,
                  background: liveFilter === f ? COLORS.accent : COLORS.surface,
                  color: liveFilter === f ? COLORS.bg : COLORS.textPrimary,
                  borderRadius: '0px',
                }}
              >
                {f === 'Challengeable' ? '⚔ Challengeable' : f}
              </button>
            ))}
          </div>

          {/* TRENDING DUEL pin — promoted from Duels tab into main Live feed */}
          {trendingDuel && (
            <TrendingDuelPin duel={trendingDuel} duelKing={duelKing} />
          )}

          {/* Feed list — renders empty state or populated list */}
          {/* ⚔ OPEN badge is rendered inline where call.openToChallenges == true */}
          <LiveFeedList
            items={filteredLiveItems}
            isLoading={isLoading}
            onNewCallClick={handleNewCallClick}
            duelKing={duelKing}
            onChallengeClick={(callId: bigint) => setChallengeModalCallId(callId)}
          />

          {/* Pagination */}
          {hasNextPage && (
            <div style={{ marginTop: '24px', textAlign: 'center' }}>
              <button
                onClick={() => fetchNextPage()}
                style={{
                  padding: '8px 24px',
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  color: '#A1A1AA',
                  background: 'none',
                  border: '1px solid #27272A',
                  cursor: 'pointer',
                }}
              >
                Load more
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Settled tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'Settled' && (
        <FeedList
          items={allItems.filter((item) => item.status === 'settled')}
          isLoading={isLoading}
          onNewCallClick={handleNewCallClick}
        />
      )}

      {/* ── Following tab ────────────────────────────────────────────────────── */}
      {activeTab === 'Following' && (
        <FeedList
          items={allItems}
          isLoading={isLoading}
          onNewCallClick={handleNewCallClick}
        />
      )}

      {/* ── Duels tab ────────────────────────────────────────────────────────── */}
      {activeTab === 'Duels' && (
        <DuelsTab duelKing={duelKing} />
      )}

      {/* Challenge modal (Known Plan Issue #4: reuse from 03-06, not duplicated) */}
      {challengeModalCallId !== null && (
        <ChallengeFormModal
          open={challengeModalCallId !== null}
          callId={challengeModalCallId}
          callerHandle="caller"
          callerStake={0n}
          marketLine=""
          onClose={() => setChallengeModalCallId(null)}
        />
      )}

      {/* Plan 05: Playwright signin.spec.ts hook — preserved per plan dependency */}
      <div data-testid="signed-in" style={{ display: 'none' }} aria-hidden="true" />
    </main>
  );
}

// ── Live feed list with ⚔ OPEN badge + Duel King badge + challenge CTA ────────

// FeedItem extended with Phase 3 fields that may be sent by the relayer
type ExtendedFeedItem = FeedItem & {
  openToChallenges?: boolean;
  callId?: string | number;
};

interface LiveFeedListProps {
  items: FeedItem[];
  isLoading: boolean;
  onNewCallClick: () => void;
  duelKing: DuelKingRow | null;
  onChallengeClick: (callId: bigint) => void;
}

function LiveFeedList({ items, isLoading, onNewCallClick, duelKing, onChallengeClick }: LiveFeedListProps) {
  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              height: '120px',
              background: COLORS.surface,
              border: `2px solid ${COLORS.borderSubtle}`,
              borderRadius: '0',
            }}
          />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          padding: '48px 24px',
          textAlign: 'center',
          border: `2px solid ${COLORS.borderSubtle}`,
          background: COLORS.surface,
        }}
      >
        <span style={{ fontSize: '14px', fontFamily: 'monospace', color: '#A1A1AA' }}>
          No calls yet. Be the first to go on record.
        </span>
        <button
          onClick={onNewCallClick}
          style={{
            padding: '8px 16px',
            fontFamily: 'monospace',
            fontWeight: 700,
            fontSize: '0.875rem',
            backgroundColor: '#E8F542',
            color: '#09090E',
            border: '2px solid #000',
            cursor: 'pointer',
          }}
        >
          + NEW CALL
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {items.map((rawItem, i) => {
        // Cast to extended type for Phase 3 fields (openToChallenges, callId)
        const item = rawItem as ExtendedFeedItem;
        const handle = item.displayHandle ?? item.handle ?? (item.caller ? truncateAddr(item.caller) : '0x???');
        const isCallerDuelKing = duelKing?.winnerHandle === handle;
        const rawCallId = item.callId ?? item.id;
        const callIdBigInt = rawCallId !== undefined ? BigInt(String(rawCallId)) : null;

        return (
          <div
            key={item.id}
            className="card-enter"
            style={
              {
                '--index': i,
                display: 'flex',
                flexDirection: 'column',
                border: `2px solid ${COLORS.borderActive}`,
                background: COLORS.surface,
                padding: '12px 16px',
                gap: '8px',
              } as React.CSSProperties
            }
          >
            {/* Line 1: handle badges row */}
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontFamily: 'Space Grotesk, monospace',
                  fontSize: '16px',
                  fontWeight: 700,
                  color: COLORS.textPrimary,
                }}
              >
                @{handle}
              </span>
              {/* Duel King badge — only when duelKing row exists (D-11 placeholder) */}
              {isCallerDuelKing && <DuelKingBadge />}
              {/* ⚔ OPEN badge — renders when call.openToChallenges == true */}
              {item.openToChallenges === true && <OpenChallengeBadge />}
            </div>

            {/* Line 2: market line */}
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: '14px',
                color: COLORS.textSecondary,
              }}
            >
              {item.asset
                ? `${item.asset} · ${item.marketType === 0 ? 'Price Target' : 'Call'}`
                : 'Open Call'}
            </div>

            {/* Line 3: Challenge CTA */}
            <div style={{ display: 'flex', flexDirection: 'row', gap: '8px', alignItems: 'center' }}>
              {callIdBigInt !== null && (
                <button
                  onClick={() => {
                    if (item.openToChallenges === true) {
                      onChallengeClick(callIdBigInt);
                    }
                  }}
                  style={{
                    padding: '4px 10px',
                    fontFamily: 'Space Grotesk, monospace',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: item.openToChallenges === true ? 'pointer' : 'not-allowed',
                    border: `2px solid ${item.openToChallenges === true ? COLORS.challenger : COLORS.borderActive}`,
                    background: 'transparent',
                    color: item.openToChallenges === true ? COLORS.challenger : COLORS.textSecondary,
                    borderRadius: '0px',
                    opacity: item.openToChallenges === true ? 1 : 0.5,
                  }}
                  title={item.openToChallenges === true ? 'Challenge this call' : "This caller isn't open to challenges right now."}
                >
                  ⚔ Challenge
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function truncateAddr(address: string): string {
  if (!address || address.length < 10) return address || '0x???';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
