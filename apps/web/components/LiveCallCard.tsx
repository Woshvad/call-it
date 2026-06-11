'use client';
/**
 * LiveCallCard — prototype-parity HOME-FEED live card (quick-260611-u1l,
 * user request 2026-06-11).
 *
 * Honest-data mapping (every rendered element has a REAL source; everything
 * else is OMITTED per D-07 — hidden, never faked):
 *   - avatar + handle        → feed displayHandle ?? handle ?? on-chain
 *                              ProfileRegistry fallback ?? truncated address
 *                              (AUTH-44: rendered AS STORED, no uppercase —
 *                              user decision 2026-06-11; the footer address is
 *                              receipt provenance, not identity)
 *   - Closes in countdown    → item.expiry (C2 parity: expired-but-unsettled
 *                              flips to the amber AWAITING SETTLEMENT tag)
 *   - statement              → marketLine ?? statement ?? 'Open Call'
 *   - class + asset pills    → assetClassesFor(assetSymbol) (real enrichment)
 *   - conviction             → item.conviction (hidden when absent)
 *   - odds bar + pools       → REAL FollowFadeMarket followReserve/fadeReserve
 *                              (reserves prop; whole section hidden when the
 *                              reads are absent/failed — D-07)
 *   - footer                 → caller address + posted-ago from createdAt
 *
 * OMITTED (no feed source, D-07): rep badge, verified badges, button counts
 * (the prototype's ·142/·67 were demo data), block-number, per-call challenge
 * counts (/api/duels items carry no callId). DROPPED BY USER CONSTRAINT
 * (2026-06-11): the amount-staked pill and the verified badge row.
 *
 * D-06: FOLLOW / FADE / CHALLENGE / quote are NAVIGATION affordances —
 * Links to /call/:id and /new?quote=:id; the real amount-based modals live
 * on the call page.
 *
 * FLEXBOX ONLY — Satori compatibility (Pitfall 15).
 */
import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';
import Link from 'next/link';
import { Tag, avatarInitial, cn } from '@call-it/ui';
import { assetClassesFor } from '@/lib/asset-class';
import type { FeedItem } from '@/lib/relayer-client';

export type LiveCallCardProps = {
  item: FeedItem;
  /** Real FollowFadeMarket reserves (6dp USDC). Absent → odds section hidden (D-07). */
  reserves?: { follow: bigint; fade: bigint };
  /** On-chain ProfileRegistry.displayHandle fallback tier (AUTH-44). */
  onchainHandle?: string;
  onClick?: () => void;
};

/** AUTH-44-safe fallback display: first 6 + last 4 of the address. */
function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address || '0x???';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

const GRAD_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

/** Deterministic grad letter a–f from the shown handle (CallCard parity). */
function gradFor(handle: string): string {
  let acc = 0;
  for (let i = 0; i < handle.length; i++) {
    acc = (acc + handle.charCodeAt(i)) % GRAD_LETTERS.length;
  }
  return GRAD_LETTERS[acc] ?? 'a';
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Prototype Countdown format: `D HH:MM:SS` (JBM), `EXPIRED` at/after zero. */
function formatCountdown(msLeft: number): string {
  if (msLeft <= 0) return 'EXPIRED';
  const total = Math.floor(msLeft / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${d > 0 ? `${d}d ` : ''}${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

/** Ticking countdown (1s) — prototype Countdown behavior. */
function Countdown({ deadline }: { deadline: Date }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span
      suppressHydrationWarning
      className="font-mono text-[13px] font-medium tracking-[0.04em] text-[var(--text-primary)]"
    >
      {formatCountdown(deadline.getTime() - now)}
    </span>
  );
}

/** Pool dollars — the call page's exact USDC format ($N.NN from 6dp base units). */
function formatUsdc(amount: bigint): string {
  return `$${(Number(amount) / 1_000_000).toFixed(2)}`;
}

/** Coarse honest posted-ago buckets from unix-seconds createdAt. */
function timeAgo(createdAt: number | string): string {
  const seconds = Number(createdAt);
  if (!Number.isFinite(seconds)) return 'just now';
  const delta = Math.floor(Date.now() / 1000 - seconds);
  if (delta < 60) return 'just now';
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

export function LiveCallCard({ item, reserves, onchainHandle, onClick }: LiveCallCardProps) {
  // AUTH-44 precedence — feed fields, then the on-chain ProfileRegistry tier,
  // then the provenance-honest truncated address. Rendered AS STORED.
  const handleShown = item.displayHandle ?? item.handle ?? onchainHandle ?? truncateAddress(item.caller);
  const gradLetter = gradFor(handleShown);

  const expirySeconds =
    typeof item.expiry === 'number' ? item.expiry : parseInt(String(item.expiry), 10);
  const deadline = new Date(expirySeconds * 1000);

  // C2 parity (CallCard): ticking 1s expiry check so a mounted card flips to
  // AWAITING SETTLEMENT the moment the deadline passes.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const isAwaitingSettlement = deadline.getTime() <= nowMs;

  const statementShown =
    item.marketLine?.trim() || item.statement?.trim() || 'Open Call';

  const classPills = assetClassesFor(item.assetSymbol);

  // Real odds split — EXACT call-page formula over the live reserves.
  let fpct = 50;
  if (reserves) {
    const total = reserves.follow + reserves.fade;
    fpct = total === 0n ? 50 : Number((reserves.follow * 100n) / total);
  }

  const stop = (e: ReactMouseEvent) => e.stopPropagation();

  return (
    <div
      className={cn(
        // .brutal-card recipe — bg var(--bg-secondary), 2px var(--border-subtle), radius 0
        'relative flex flex-col rounded-none p-6',
        'bg-[var(--bg-secondary)] border-2 border-[var(--border-subtle)]',
        'transition-all duration-[120ms] ease-linear',
        // .brutal-card.interactive — only when the card has an action
        onClick &&
          'cursor-pointer hover:border-white hover:shadow-[4px_4px_0_0_#000] hover:-translate-x-[2px] hover:-translate-y-[2px]',
      )}
      onClick={onClick}
    >
      {/* TOP ROW — avatar + handle · right: Closes in countdown / amber tag */}
      <div className="spread" style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <span className={`avatar avatar-grad-${gradLetter}`} aria-hidden="true">
            {avatarInitial(handleShown)}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            {/* No rep badge, no verified badges — no feed source (D-07);
                the verified badge row was dropped by user constraint. */}
            <span
              className="font-mono truncate"
              style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', textTransform: 'none' }}
            >
              {handleShown}
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right', flex: 'none' }}>
          {isAwaitingSettlement ? (
            /* C2: expired + unsettled — amber state, never "Closes in EXPIRED" */
            <Tag
              intent="warning"
              className="border-[var(--accent-warning)] text-[var(--accent-warning)]"
            >
              AWAITING SETTLEMENT
            </Tag>
          ) : (
            <>
              <div className="label-overline" style={{ marginBottom: 4 }}>
                Closes in
              </div>
              <Countdown deadline={deadline} />
            </>
          )}
        </div>
      </div>

      {/* STATEMENT — Archivo display voice */}
      <div
        className="font-display font-extrabold"
        style={{
          fontSize: 'clamp(22px, 5vw, 28px)',
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
          color: 'var(--text-primary)',
          marginBottom: 22,
        }}
      >
        {statementShown}
      </div>

      {/* TAGS — class + asset pills from the REAL assetSymbol enrichment.
          No amount-staked pill (user constraint), no LIVE pill (the tape
          divider + countdown already say it). Hidden entirely without a symbol. */}
      {item.assetSymbol && (
        <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
          {classPills.map((cls) => (
            <span key={cls} className="pill tag">
              {cls.toUpperCase()}
            </span>
          ))}
          <span className="pill tag">{item.assetSymbol.toUpperCase()}</span>
        </div>
      )}

      {/* CONVICTION + REAL ODDS — reserves are live FollowFadeMarket reads;
          the whole odds/pools section hides when they are absent (D-07). */}
      {(typeof item.conviction === 'number' || reserves) && (
        <div style={{ marginBottom: 22 }}>
          <div className="spread" style={{ marginBottom: 10 }}>
            {typeof item.conviction === 'number' ? (
              <span
                className="mono"
                style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.06em', fontWeight: 600 }}
              >
                CONVICTION ·{' '}
                <span style={{ color: 'var(--accent-win)' }}>{item.conviction}%</span>
              </span>
            ) : (
              <span />
            )}
            {reserves && (
              <span
                className="mono"
                style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: '0.04em', fontWeight: 600 }}
              >
                <span style={{ color: 'var(--accent-win)' }}>{fpct}% FOLLOW</span>
                <span style={{ color: 'var(--text-muted)' }}> · </span>
                <span style={{ color: 'var(--accent-loss)' }}>{100 - fpct}% FADE</span>
              </span>
            )}
          </div>
          {reserves && (
            <>
              <div className="brutal-bar split" role="img" aria-label={`${fpct}% follow`}>
                <div className="follow" style={{ flexBasis: `${fpct}%` }} />
                <div className="gap" />
                <div className="fade" style={{ flexBasis: `${100 - fpct}%` }} />
              </div>
              <div className="spread" style={{ marginTop: 8 }}>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
                  {formatUsdc(reserves.follow)} pool follow
                </span>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
                  {formatUsdc(reserves.fade)} pool fade
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ACTIONS — navigation affordances (D-06): the real modals live on the
          call page. No counts after labels (no source — D-07).
          FOLLOW/FADE/CHALLENGE hide once expired (user 2026-06-11): the
          contracts reject new positions and challenge creation after expiry,
          so on an AWAITING SETTLEMENT card they are dead controls (D-08).
          Quote stays — quoting an expired call is still a valid new-call
          affordance. */}
      <div style={{ display: 'flex', flexDirection: 'row', gap: 10 }}>
        {!isAwaitingSettlement && (
          <>
            <Link
              href={`/call/${item.id}` as any}
              className="btn cream"
              style={{ minWidth: 110 }}
              onClick={stop}
            >
              FOLLOW
            </Link>
            <Link href={`/call/${item.id}` as any} className="btn fade" onClick={stop}>
              FADE
            </Link>
            <Link href={`/call/${item.id}` as any} className="btn duel" onClick={stop}>
              CHALLENGE
            </Link>
          </>
        )}
        <Link
          href={`/new?quote=${item.id}` as any}
          title="Quote"
          onClick={stop}
          className="font-display"
          style={{
            marginLeft: 'auto',
            width: 40,
            height: 40,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: '2px solid var(--border-active)',
            color: 'var(--text-tertiary)',
            fontSize: 18,
            fontWeight: 900,
            textDecoration: 'none',
          }}
        >
          &ldquo;
        </Link>
      </div>

      {/* FOOTER — receipt provenance (address, not identity — AUTH-44).
          No block-number, no per-call challenge count (no feed source, D-07). */}
      <div
        className="spread"
        style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--border-subtle)' }}
      >
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-tertiary)', letterSpacing: '0.04em' }}>
          {truncateAddress(item.caller)} · posted {timeAgo(item.createdAt)}
        </span>
      </div>
    </div>
  );
}
