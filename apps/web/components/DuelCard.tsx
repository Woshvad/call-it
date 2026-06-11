'use client';
/**
 * DuelCard — shared rich at-a-glance duel card for BOTH /duels and the feed
 * Duels tab (quick-260611-ust, user request 2026-06-11: "let each card have
 * more data what people can easily understand what's up at a look").
 *
 * Honest-data map (every rendered element has a REAL source; absent data is
 * HIDDEN, never faked — D-07):
 *   - wire fields (always present): challengeId / challenger+caller stakes /
 *     pot / status / proposedAt / parties / isTrending → status chip, matchup
 *     row, pot, proposed-ago, accept-window clock
 *   - enrichment fields (per-duel /api/duels/:id/live-state via
 *     useDuelEnrichment; absent → block hidden): callId → marketLine subject,
 *     expiry → CALL CLOSES IN / AWAITING SETTLEMENT clock, followReserve +
 *     fadeReserve → consensus split bar, winner → Settled-only WINNER row
 *   - handles map (useFeedHandles, ProfileRegistry displayHandle) — rendered
 *     AS STORED; fallback is the truncated address (AUTH-44)
 *
 * NO hardcoded handles, NO fake counts anywhere.
 * D-14: duel purple #A855F7 stays confined to duel surfaces — OK here.
 * The 1s countdown setInterval below is the ONLY interval in this feature
 * (useDuelEnrichment is one-shot, zero polling).
 */

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { avatarInitial } from '@call-it/ui';
import {
  formatUsdc,
  truncateAddress,
  gradFor,
  type DuelEntry,
  type DuelEnrichment,
} from '@/lib/duels-client';

const DUEL_ACCENT = '#A855F7'; // D-14: confined to duel surfaces
const CALLER_ACCENT = '#E8F542';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// ChallengeEscrow.sol:59 — CHALLENGE_ACCEPTANCE_WINDOW = 24 hours.
const ACCEPT_WINDOW_SECONDS = 24 * 60 * 60;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Local replica of LiveCallCard's formatCountdown ('D HH:MM:SS', EXPIRED at or
 * after zero) — replicated, not imported (LiveCallCard internals are private).
 */
function formatCountdown(msLeft: number): string {
  if (msLeft <= 0) return 'EXPIRED';
  const total = Math.floor(msLeft / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${d > 0 ? `${d}d ` : ''}${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

/** Coarse honest time-ago buckets from unix-seconds (NaN-guarded). */
function timeAgo(unixS: string | number): string {
  const seconds = Number(unixS);
  if (!Number.isFinite(seconds) || seconds <= 0) return 'just now';
  const delta = Math.floor(Date.now() / 1000) - seconds;
  if (delta < 60) return 'just now';
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

export type DuelCardProps = {
  duel: DuelEntry;
  /** Per-duel live-state enrichment. Absent → enriched blocks hidden (D-07). */
  enrichment?: DuelEnrichment;
  /** lowercased address → ProfileRegistry displayHandle (AUTH-44 fallback tier). */
  handles?: Map<string, string>;
};

export function DuelCard({ duel, enrichment, handles }: DuelCardProps) {
  // 1s countdown tick — the ONLY setInterval in the duels feature. Runs only
  // while the card actually shows a ticking clock.
  const needsClock =
    (duel.status === 'Accepted' && enrichment?.expiry !== undefined) ||
    duel.status === 'Proposed';
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!needsClock) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [needsClock]);

  // Handles render AS STORED (no uppercase transform); fallback = truncated.
  const challengerHandle =
    handles?.get(duel.challenger.toLowerCase()) ?? truncateAddress(duel.challenger);
  const callerHandle =
    handles?.get(duel.caller.toLowerCase()) ?? truncateAddress(duel.caller);

  // ── Status chip ──────────────────────────────────────────────────────────────
  let statusChip: ReactNode;
  if (duel.status === 'Accepted') {
    statusChip = (
      <span className="pill duel" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span className="live-dot" aria-hidden="true" />
        LIVE DUEL
      </span>
    );
  } else if (duel.status === 'Proposed') {
    statusChip = <span className="pill muted">AWAITING ACCEPT</span>;
  } else if (duel.status === 'Settled') {
    statusChip = <span className="pill win">SETTLED</span>;
  } else {
    // Rejected / Refunded / unknown — muted, honest wire value
    statusChip = <span className="pill muted">{duel.status.toUpperCase()}</span>;
  }

  // ── Status-dependent clock (d) ───────────────────────────────────────────────
  let clock: ReactNode = null;
  if (duel.status === 'Accepted' && enrichment?.expiry !== undefined) {
    const msLeft = enrichment.expiry * 1000 - nowMs;
    clock =
      msLeft > 0 ? (
        <span className="mono" suppressHydrationWarning style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          CALL CLOSES IN {formatCountdown(msLeft)}
        </span>
      ) : (
        <span className="mono" style={{ fontSize: 11, color: 'var(--accent-warning)' }}>
          AWAITING SETTLEMENT
        </span>
      );
  } else if (duel.status === 'Proposed') {
    // ChallengeEscrow.sol:59 CHALLENGE_ACCEPTANCE_WINDOW = 24 hours from proposedAt.
    const acceptDeadlineMs = (Number(duel.proposedAt) + ACCEPT_WINDOW_SECONDS) * 1000;
    const msLeft = acceptDeadlineMs - nowMs;
    clock =
      Number.isFinite(msLeft) && msLeft > 0 ? (
        <span className="mono" suppressHydrationWarning style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          ACCEPT WINDOW {formatCountdown(msLeft)}
        </span>
      ) : (
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          ACCEPT WINDOW EXPIRED
        </span>
      );
  }
  // 'Settled' / Rejected / Refunded → no clock.

  // ── Consensus split (e) — ONLY when BOTH reserves present and non-zero sum ───
  const follow = enrichment?.followReserve;
  const fade = enrichment?.fadeReserve;
  let consensus: ReactNode = null;
  if (follow !== undefined && fade !== undefined && follow + fade > 0n) {
    const total = follow + fade;
    // Same guard idiom as the call surfaces — never fabricate a split.
    const pct = total === 0n ? 50 : Number((follow * 100n) / total);
    consensus = (
      <div>
        {/* follow reserve = riding the caller, fade = riding the challenger */}
        <div className="brutal-bar split">
          <div className="caller" style={{ flexBasis: `${pct}%` }} />
          <div className="gap" />
          <div className="challenger" style={{ flexBasis: `${100 - pct}%` }} />
        </div>
        <div className="spread mono" style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>
          <span>RIDING CALLER {pct}%</span>
          <span>RIDING CHALLENGER {100 - pct}%</span>
        </div>
      </div>
    );
  }

  // ── Winner row (f) — ONLY for Settled duels with a real non-zero winner ──────
  const winner = enrichment?.winner;
  const showWinner =
    duel.status === 'Settled' &&
    typeof winner === 'string' &&
    winner.length > 0 &&
    winner.toLowerCase() !== ZERO_ADDRESS;
  let winnerRow: ReactNode = null;
  if (showWinner) {
    const winnerLower = winner.toLowerCase();
    const winnerColor =
      winnerLower === duel.caller.toLowerCase()
        ? CALLER_ACCENT
        : winnerLower === duel.challenger.toLowerCase()
          ? DUEL_ACCENT
          : 'var(--text-primary)';
    const winnerHandle = handles?.get(winnerLower) ?? truncateAddress(winner);
    winnerRow = (
      <div className="spread" style={{ alignItems: 'center' }}>
        <div className="row" style={{ gap: 10 }}>
          <span className="pill win">WINNER</span>
          <span className="mono" style={{ fontSize: 12.5, fontWeight: 700, color: winnerColor }}>
            {winnerHandle}
          </span>
        </div>
        <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
          TOOK {formatUsdc(duel.pot)}
        </span>
      </div>
    );
  }

  return (
    <Link
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      href={`/duel/${duel.challengeId}` as any}
      className="block rounded-none p-5 bg-[var(--bg-secondary)] border-2 border-[var(--border-subtle)] transition-all duration-[120ms] ease-linear hover:border-white hover:shadow-[4px_4px_0_0_#000] hover:-translate-x-[2px] hover:-translate-y-[2px]"
      style={{ display: 'flex', flexDirection: 'column', gap: 14, textDecoration: 'none' }}
    >
      {/* (a) HEADER — status chip(s) · #id + proposed-ago */}
      <div className="spread" style={{ alignItems: 'center' }}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {statusChip}
          {duel.isTrending && <span className="pill duel">TRENDING</span>}
        </div>
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          #{duel.challengeId} · proposed {timeAgo(duel.proposedAt)}
        </span>
      </div>

      {/* (b) MARKET LINE — the duel's subject, ONLY when enrichment carries it (D-07) */}
      {enrichment?.marketLine && (
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 20,
            lineHeight: 1.1,
            color: 'var(--text-primary)',
          }}
        >
          {enrichment.marketLine}
        </div>
      )}

      {/* (c) VS MATCHUP — challenger (purple) vs caller (lime), per-side stakes */}
      <div className="spread" style={{ alignItems: 'center', gap: 12 }}>
        <div className="col" style={{ gap: 4, minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className={`avatar sm ${gradFor(challengerHandle)}`} aria-hidden="true">
              {avatarInitial(challengerHandle)}
            </span>
            <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: DUEL_ACCENT }}>
              {challengerHandle}
            </span>
          </div>
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
            STAKED {formatUsdc(duel.challengerStake)}
          </span>
        </div>
        <span className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>
          VS
        </span>
        <div className="col" style={{ gap: 4, minWidth: 0, alignItems: 'flex-end' }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: CALLER_ACCENT }}>
              {callerHandle}
            </span>
            <span className={`avatar sm ${gradFor(callerHandle)}`} aria-hidden="true">
              {avatarInitial(callerHandle)}
            </span>
          </div>
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
            STAKED {formatUsdc(duel.callerStake)}
          </span>
        </div>
      </div>

      {/* (d) POT + status-dependent clock */}
      <div className="spread" style={{ alignItems: 'center' }}>
        <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
          POT {formatUsdc(duel.pot)}
        </span>
        {clock}
      </div>

      {/* (e) CONSENSUS — real reserves only (D-07) */}
      {consensus}

      {/* (f) WINNER — Settled + real non-zero winner only (D-07, never guess) */}
      {winnerRow}
    </Link>
  );
}
