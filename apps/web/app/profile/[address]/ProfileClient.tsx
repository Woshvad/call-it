/**
 * ProfileClient — dumb client renderer for /profile/[address].
 *
 * Phase 09.2 (plan 05): prototype profile markup (`call it frontend/screens/
 * profile.jsx` is the markup donor — D-05: never a logic donor) over the
 * EXISTING props contract. page.tsx's RSC fetch is untouched; this stays a
 * pure props renderer (D-05).
 *
 * Renders ONLY data with a live source (D-07 — no-source sections are HIDDEN,
 * never faked):
 *   - Identity: <ProfileHeader> from @call-it/ui (square avatar grad +
 *     Archivo handle + verified pills). AUTH-44: the `address` prop is the
 *     RSC lookup key only — never rendered; this file contains zero
 *     address-formatting helpers.
 *   - Hero rep: GLOBAL REPUTATION Archivo 900 numeral at
 *     clamp(64px, 18vw, 132px) inside <Card variant="hero">, with a real
 *     settled/wins/misses meta line.
 *   - Stat blocks (.stat-block recipes): Accuracy (wins ÷ settledCalls —
 *     hidden entirely when nothing is settled), W/L record, Streak, Calls.
 *   - RECENT CALLS: .section-divider + the prototype-voice empty state
 *     ("No calls on record yet.") — the relayer ProfileResponse carries no
 *     call list yet, so no table renders (an empty table would be a stub).
 *
 * REMOVED outright (D-07 — no live source; one section was actively faked):
 *   - the category-reputation cards whose fill bars carried a hardcoded
 *     width value (the app's one active fake-data surface — deleted)
 *   - the em-dash placeholder stat blocks with no relayer source
 *   - the 30d rep-history chart, the followers list, and the receipts
 *     showcase (prototype sections with no data behind them)
 *   - the All/Open/Settled filter chips — they filtered an always-empty
 *     list, i.e. dead controls (D-08)
 *
 * Mobile (UI-48): full-width container clamp at 375px; stat blocks wrap 2-up.
 *
 * Requirements: AUTH-44, UI-48
 */

'use client';

import Link from 'next/link';
import { ProfileHeader, Card } from '@call-it/ui';
import { useIsMobile } from '@/app/hooks/useIsMobile';
import { normalizeCallStatus } from '@/lib/relayer-client';
import type { ProfileCallEntry, ProfileResponse } from '@/lib/relayer-client';

interface ProfileClientProps {
  /** URL lookup key consumed by the RSC fetch — NEVER rendered (AUTH-44). */
  address: string;
  profile: ProfileResponse | null;
  fetchError: string | null;
}

/**
 * Accuracy % from real fields (wins ÷ settledCalls).
 * Returns null when nothing is settled — the block hides entirely (D-07).
 */
function accuracyPct(profile: ProfileResponse): number | null {
  if (profile.settledCalls <= 0) return null;
  return Math.round((profile.wins / profile.settledCalls) * 100);
}

/** "$5.00" from micro-USDC string; '—' on garbage (never crashes the page). */
function formatStake(raw: string): string {
  try {
    const n = Number(BigInt(raw)) / 1_000_000;
    if (!Number.isFinite(n)) return '—';
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } catch {
    return '—';
  }
}

function formatDate(createdAt: string | number): string | null {
  const sec = Number(createdAt);
  if (!Number.isFinite(sec) || sec <= 0) return null;
  return new Date(sec * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Honest status/outcome tag for a history row (C12): a real outcome wins
 * (WON/LOST); otherwise the call's lifecycle status renders.
 */
function callTag(entry: ProfileCallEntry): { label: string; pill: string } {
  if (entry.outcome === 'CallerWon') return { label: 'WON', pill: 'win' };
  if (entry.outcome === 'CallerLost') return { label: 'LOST', pill: 'loss' };
  const status = normalizeCallStatus(entry.status);
  if (status === 'settled') return { label: 'SETTLED', pill: 'neutral' };
  if (status === 'disputed') return { label: 'DISPUTED', pill: 'neutral' };
  if (status === 'callerExited') return { label: 'EXITED', pill: 'neutral' };
  return { label: 'LIVE', pill: 'win' };
}

export function ProfileClient({ profile, fetchError }: ProfileClientProps) {
  const isMobile = useIsMobile(); // UI-48: container clamp + 2-up stat wrap at 375px

  const accuracy = profile ? accuracyPct(profile) : null;

  // Stat blocks fill the row on desktop; wrap 2-up at mobile (UI-48).
  const statBlockFlex = isMobile ? '1 1 calc(50% - 8px)' : '1 1 0';

  return (
    <main
      style={{
        // UI-48: full-width clamp at mobile so the 680px container never forces scroll.
        width: isMobile ? '100%' : undefined,
        maxWidth: isMobile ? '100%' : '680px',
        margin: '0 auto',
        padding: '24px 16px',
      }}
    >
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
            marginBottom: '24px',
          }}
        >
          Couldn&apos;t load the tape. The data feed is catching up — refresh in a moment.
        </div>
      )}

      {profile && (
        <>
          {/* Identity — ProfileHeader (@call-it/ui): handle + verified pills only (AUTH-44) */}
          <div style={{ marginBottom: '32px' }}>
            <ProfileHeader
              user={{
                handle: profile.handle,
                verifiedX: profile.verifiedX,
                verifiedFc: profile.verifiedFc,
                stats: {
                  totalCalls: profile.totalCalls,
                  settledCalls: profile.settledCalls,
                  wins: profile.wins,
                },
              }}
            />
          </div>

          {/* Hero rep — prototype hero card; the chart column had no source (D-07) */}
          <Card
            variant="hero"
            className="bracketed"
            style={{ padding: isMobile ? '28px 20px' : '36px', marginBottom: '8px' }}
          >
            <div className="label-overline" style={{ marginBottom: '12px' }}>
              Global reputation
            </div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(64px, 18vw, 132px)',
                fontWeight: 900,
                letterSpacing: '-0.05em',
                lineHeight: 0.85,
                color: 'var(--text-primary)',
              }}
            >
              {profile.globalRep.toLocaleString()}
            </div>
            <div
              className="mono"
              style={{
                fontSize: '12px',
                color: 'var(--text-tertiary)',
                marginTop: '14px',
                letterSpacing: '0.04em',
              }}
            >
              {profile.settledCalls} settled · {profile.wins} wins · {profile.losses} misses
              {accuracy != null ? ` · ${accuracy}% acc` : ''}
            </div>
          </Card>

          {/* RECORD — real-source stat blocks ONLY (D-07) */}
          <div className="section-divider">
            <span className="title">RECORD</span>
            <span className="line"></span>
          </div>
          <div
            style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '12px' }}
          >
            {accuracy != null && (
              <div className="stat-block" style={{ flex: statBlockFlex }}>
                <div className="stat-label">Accuracy</div>
                <div className="stat-value" style={{ color: 'var(--accent-win)' }}>
                  {accuracy}%
                </div>
                <div className="stat-sub">
                  {profile.wins} of {profile.settledCalls} settled
                </div>
              </div>
            )}
            <div className="stat-block" style={{ flex: statBlockFlex }}>
              <div className="stat-label">W/L record</div>
              <div className="stat-value">
                {profile.wins}–{profile.losses}
              </div>
            </div>
            <div className="stat-block" style={{ flex: statBlockFlex }}>
              <div className="stat-label">Streak</div>
              <div className="stat-value">{profile.streak}</div>
            </div>
            <div className="stat-block" style={{ flex: statBlockFlex }}>
              <div className="stat-label">Calls</div>
              <div className="stat-value">{profile.totalCalls}</div>
            </div>
          </div>

          {/* RECENT CALLS — C12 (quick-260611-5mh): real call history from the
              enriched profile payload (PLAN-01 A3 `calls` array). Empty/absent
              → the honest empty state stays (D-07, no fake rows). */}
          <div className="section-divider">
            <span className="title">RECENT CALLS</span>
            <span className="line"></span>
          </div>
          {profile.calls && profile.calls.length > 0 ? (
            <div className="col" style={{ gap: 10 }}>
              {profile.calls.map((entry) => {
                const tag = callTag(entry);
                const line =
                  (entry.marketLine && entry.marketLine.trim()) ||
                  (entry.statement && entry.statement.trim()) ||
                  `Call #${entry.id}`;
                const date = formatDate(entry.createdAt);
                return (
                  <Link
                    key={entry.id}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    href={`/call/${entry.id}` as any}
                    className="brutal-card"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      padding: '16px 18px',
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 8,
                        justifyContent: 'space-between',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontWeight: 800,
                          fontSize: 15,
                          letterSpacing: '-0.01em',
                        }}
                      >
                        {line}
                      </span>
                      <span className={`pill ${tag.pill}`}>{tag.label}</span>
                    </div>
                    <div
                      className="mono"
                      style={{
                        fontSize: 11,
                        color: 'var(--text-tertiary)',
                        letterSpacing: '0.04em',
                        display: 'flex',
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 6,
                      }}
                    >
                      <span>stake {formatStake(entry.stake)}</span>
                      {date && <span>· {date}</span>}
                      <span>· view receipt ↗</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            /* F-B7: home-feed EmptyTape containment pattern */
            <div
              className="brutal-card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 16,
                padding: '48px 24px',
                textAlign: 'center',
              }}
            >
              <span className="label-overline" style={{ letterSpacing: '0.14em' }}>
                NO CALLS ON RECORD YET
              </span>
              <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                Every call is permanent and public. Go on record.
              </span>
              <Link href="/new" className="btn cream" style={{ textDecoration: 'none' }}>
                Make your first call
              </Link>
            </div>
          )}
        </>
      )}
    </main>
  );
}
