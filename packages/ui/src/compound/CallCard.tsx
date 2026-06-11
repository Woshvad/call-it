'use client';
/**
 * CallCard — feed tape card (prototype `.brutal-card` recipe, Phase 09.2-06)
 *
 * Composes: brutal-card surface (bg var(--bg-secondary), 2px var(--border-subtle)
 * border, radius 0) + square grad avatar + @handle metadata overline (JBM) +
 * statement in the Archivo display voice + stake/status pills + conviction +
 * live D HH:MM:SS countdown from `deadline`.
 *
 * D-07 (honest degradation): this card renders ONLY the fields its props
 * contract provides. No pool dollars, no position counts, no caller
 * rep/accuracy/streak, no editorial flag fields, no tx/block footer — those
 * have no live data source and are HIDDEN, never faked. Conviction is
 * optional and degrades-to-hidden: a missing value hides the entire
 * CONVICTION row item rather than fabricating a default.
 *
 * D-06: the card itself carries no stake toggles. Its only affordance is the
 * optional `onClick` (consumers navigate to the call page, where the real
 * amount-based modals live).
 *
 * FLEXBOX ONLY — Satori compatibility (Pitfall 15).
 */
import { useEffect, useState } from 'react';
import { cn } from '../lib/cn';
import { avatarInitial } from '../lib/avatar-initial';
import { Tag } from '../primitives/Tag';
import { VerifiedBadge } from '../primitives/VerifiedBadge';

export type CallCardData = {
  handle: string;
  marketLine: string;
  conviction?: number;
  deadline: Date;
  stake: number | bigint;
  status?: 'live' | 'settled' | 'preview';
  /** X (Twitter) link verified — renders VERIFIED · X next to the handle (AUTH-09) */
  verifiedX?: boolean;
  /** Farcaster link verified — renders VERIFIED · FC next to the handle (AUTH-09) */
  verifiedFc?: boolean;
};

export type CallCardProps = {
  call: CallCardData;
  className?: string;
  onClick?: () => void;
};

// Prototype avatar grad palette a–f (square, black initials except the duel
// purple). Literal hexes — same pattern as COLOR_MAP (CSS vars don't reach
// every inline-style consumer reliably).
const AVATAR_GRADS: ReadonlyArray<{ bg: string; fg: string }> = [
  { bg: '#E8F542', fg: '#000000' }, // a
  { bg: '#FB923C', fg: '#000000' }, // b
  { bg: '#A855F7', fg: '#FFFFFF' }, // c
  { bg: '#22D3EE', fg: '#000000' }, // d
  { bg: '#F472B6', fg: '#000000' }, // e
  { bg: '#FBBF24', fg: '#000000' }, // f
];

/** Deterministic grad pick from the handle (prototype grad a–f). */
function gradFor(handle: string): { bg: string; fg: string } {
  let acc = 0;
  for (let i = 0; i < handle.length; i++) {
    acc = (acc + handle.charCodeAt(i)) % AVATAR_GRADS.length;
  }
  return AVATAR_GRADS[acc] ?? AVATAR_GRADS[0]!;
}

/** "$N" JBM stake — bigint = raw 6-dp USDC base units; number = dollars. */
function formatStake(stake: number | bigint): string {
  const dollars =
    typeof stake === 'bigint' ? Number(stake) / 1_000_000 : stake;
  return `$${dollars.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
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

export function CallCard({ call, className, onClick }: CallCardProps) {
  const grad = gradFor(call.handle);

  // C2 (quick-260611-5mh): a live call whose deadline has PASSED is not live —
  // it is awaiting settlement. Ticking check (1s, live-status cards only) so a
  // mounted card flips to AWAITING SETTLEMENT the moment the deadline passes
  // instead of pulsing LIVE next to "Closes in EXPIRED".
  const isLiveStatus = call.status === 'live' || call.status === undefined;
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!isLiveStatus) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isLiveStatus]);
  const isExpired = call.deadline.getTime() <= nowMs;
  const isLive = isLiveStatus && !isExpired;
  const isAwaitingSettlement = isLiveStatus && isExpired;

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
        className
      )}
      onClick={onClick}
    >
      {/* Top row: square grad avatar + @handle (+ verified) · right: countdown / status */}
      <div className="flex flex-row items-start justify-between gap-3 mb-4">
        <div className="flex flex-row items-center gap-3 min-w-0">
          {/* Square avatar — prototype .avatar (40px, 2px white border, radius 0) */}
          <span
            className="flex items-center justify-center flex-none rounded-none w-10 h-10 border-2 border-white font-display font-black text-[15px] uppercase select-none"
            style={{ background: grad.bg, color: grad.fg }}
            aria-hidden="true"
          >
            {avatarInitial(call.handle)}
          </span>
          <span className="flex flex-col gap-1 min-w-0">
            <span className="flex flex-row items-center gap-2 min-w-0">
              <span className="font-mono text-[15px] font-bold text-[var(--text-primary)] truncate">
                @{call.handle}
              </span>
              <VerifiedBadge verifiedX={call.verifiedX} verifiedFc={call.verifiedFc} />
            </span>
          </span>
        </div>

        <span className="flex flex-col items-end gap-1 flex-none">
          {isLive ? (
            <>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
                Closes in
              </span>
              <Countdown deadline={call.deadline} />
            </>
          ) : isAwaitingSettlement ? (
            /* C2: expired + unsettled — amber state, never LIVE + "Closes in EXPIRED" */
            <Tag
              intent="warning"
              className="border-[var(--accent-warning)] text-[var(--accent-warning)]"
            >
              AWAITING SETTLEMENT
            </Tag>
          ) : call.status === 'settled' ? (
            <Tag intent="muted">SETTLED</Tag>
          ) : (
            <Tag intent="neutral">PREVIEW</Tag>
          )}
        </span>
      </div>

      {/* Statement — Archivo display voice, clamped to 22px on mobile */}
      <span
        className="font-display font-extrabold text-[var(--text-primary)] mb-5"
        style={{
          fontSize: 'clamp(22px, 5vw, 28px)',
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
        }}
      >
        {call.marketLine}
      </span>

      {/* Bottom row: stake + live pill · conviction (all real FeedItem fields) */}
      <div className="flex flex-row flex-wrap items-center justify-between gap-2">
        <span className="flex flex-row flex-wrap items-center gap-2">
          {/* Stake pill — JBM "$N" */}
          <span className="inline-flex items-center rounded-none font-mono text-[11px] font-semibold uppercase tracking-[0.06em] px-2 py-[3px] border border-[var(--border-active)] text-[var(--text-secondary)] whitespace-nowrap">
            STAKE {formatStake(call.stake)}
          </span>
          {/* LIVE pill — accent + pulsing square dot (liveDot keyframe, app cascade) */}
          {isLive && (
            <span className="inline-flex items-center gap-[6px] rounded-none font-mono text-[11px] font-semibold uppercase tracking-[0.06em] px-2 py-[3px] border border-current text-[var(--accent-win)] whitespace-nowrap">
              <span
                className="inline-block w-[6px] h-[6px] bg-[var(--accent-win)] animate-[liveDot_1.4s_ease-in-out_infinite]"
                aria-hidden="true"
              />
              LIVE
            </span>
          )}
        </span>

        {/* Conviction — JBM overline, accent number. D-07: hidden when absent, never faked. */}
        {typeof call.conviction === 'number' && (
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-tertiary)] whitespace-nowrap">
            CONVICTION ·{' '}
            <span className="text-[var(--accent-win)]">{call.conviction}%</span>
          </span>
        )}
      </div>
    </div>
  );
}
