'use client';
/**
 * SettledCallCard — Settled-tab tape card (prototype settled treatment,
 * quick-260611-tbc; recipe credit: `call it frontend/screens/feed.jsx`
 * SettledCard lines 159-212 + styles.css `.outcome-stamp` / `.label-overline`
 * / `.btn.outline-white`).
 *
 * Composition: brutal-card surface + CornerBrackets + square grad avatar +
 * mono-bold @handle + `settled <date> · <time> UTC` JBM overline + the outcome
 * word HUGE top-right (Archivo black uppercase, 3px 3px 0 #000 hard offset
 * shadow, per-word differentiating colors) + statement in the display voice +
 * FINAL / REP Δ / STAKE label-overline stat blocks + outlined SHARE anchor.
 *
 * D-07 (honest degradation): every block renders ONLY from real fields —
 * settledAt absent → no overline; finalPct/finalNA absent → no FINAL block
 * (absent data ≠ N/A; '—' renders ONLY via the explicit finalNA semantic
 * no-final-price flag); repDelta absent → no REP Δ block. Against the
 * pre-enrichment deployed relayer the card degrades to outcome word +
 * statement + STAKE + SHARE by design.
 *
 * D-06: the SHARE anchor stopPropagation-s so the card-tap navigation to
 * /call/[id] keeps working on the card body.
 * D-08: SHARE is omitted entirely without a shareHref — no dead controls.
 *
 * FLEXBOX ONLY — Satori compatibility (Pitfall 15).
 */
import { cn } from '../lib/cn';
import { avatarInitial } from '../lib/avatar-initial';
import { CornerBrackets } from '../primitives/CornerBrackets';
import { VerifiedBadge } from '../primitives/VerifiedBadge';
import { gradFor, formatStake, type CallCardData } from './CallCard';

/**
 * Per-word differentiating text colors (user requirement, 2026-06-11).
 * Future-proofed for all four §15.7 words — the feed wire only derives two
 * today (CallerWon → CALLED IT, CallerLost → LOUD AND WRONG); CONTRARIAN HIT
 * / COLD CALL await a richer derivation (fadeRealShare etc.) and arrive via
 * the `word` override prop.
 */
export const OUTCOME_WORD_COLORS: Record<string, string> = {
  'CALLED IT': 'var(--accent-win)',
  'LOUD AND WRONG': 'var(--accent-loss)',
  'CONTRARIAN HIT': 'var(--accent-duel)',
  'COLD CALL': 'var(--text-tertiary)',
};

/**
 * Wire outcome → §15.7 word. ONLY the two wire-backed values derive a word;
 * anything else (absent, 'Pending', unknown) returns null — the consumer
 * falls back to the muted SETTLED tag, never a guessed word (D-07).
 */
export function settledOutcomeWord(outcome?: string): string | null {
  if (outcome === 'CallerWon') return 'CALLED IT';
  if (outcome === 'CallerLost') return 'LOUD AND WRONG';
  return null;
}

/** `settled May 28 · 08:26:40 UTC` — both segments rendered in UTC. */
function formatSettledOverline(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const date = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const time = d.toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' });
  return `settled ${date} · ${time} UTC`;
}

export type SettledCallCardProps = {
  call: CallCardData;
  className?: string;
  /** D-06: card tap navigates to /call/[id] (no inline stake toggles). */
  onClick?: () => void;
  /** Pre-built X web-intent URL. Absent → NO share control (D-08). */
  shareHref?: string;
  /**
   * Explicit §15.7 word override (e.g. CONTRARIAN HIT / COLD CALL from a
   * richer derivation). Defaults to settledOutcomeWord(call.outcome).
   */
  word?: string;
};

/** `.label-overline` recipe — JBM 11px/600/0.08em uppercase tertiary. */
const LABEL_OVERLINE =
  'font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]';

export function SettledCallCard({
  call,
  className,
  onClick,
  shareHref,
  word,
}: SettledCallCardProps) {
  const outcomeWord = word ?? settledOutcomeWord(call.outcome);
  const grad = gradFor(call.handle);
  const wordColor = outcomeWord
    ? (OUTCOME_WORD_COLORS[outcomeWord] ?? 'var(--text-primary)')
    : 'var(--text-primary)';
  const hasOverline = typeof call.settledAt === 'number' && call.settledAt > 0;
  const hasFinalPct = typeof call.finalPct === 'number';
  const hasFinalNA = call.finalNA === true;
  const hasRepDelta = typeof call.repDelta === 'number';

  return (
    <div
      className={cn(
        // .brutal-card recipe — bg var(--bg-secondary), 2px var(--border-subtle), radius 0
        'relative flex flex-col rounded-none p-6 sm:p-7',
        'bg-[var(--bg-secondary)] border-2 border-[var(--border-subtle)]',
        'transition-all duration-[120ms] ease-linear',
        // .brutal-card.interactive — only when the card has an action
        onClick &&
          'cursor-pointer hover:border-white hover:shadow-[4px_4px_0_0_#000] hover:-translate-x-[2px] hover:-translate-y-[2px]',
        className
      )}
      onClick={onClick}
    >
      <CornerBrackets />

      {/* Top row: avatar + handle (+ overline) · the outcome word HUGE right */}
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
            {/* Overline honesty (D-07): renders ONLY from a real settledAt. */}
            {hasOverline && (
              <span className="font-mono text-[10.5px] tracking-[0.04em] text-[var(--text-tertiary)]">
                {formatSettledOverline(call.settledAt as number)}
              </span>
            )}
          </span>
        </div>

        {/* The outcome stamp — prototype .outcome-stamp (h-display 900, -0.04em,
            uppercase, lh 0.85→0.9, rotate(-1deg), stampReveal app-cascade
            keyframe — same pattern as CallCard's liveDot). flex-none + max-w
            so 'LOUD AND WRONG' wraps at 375px instead of overflowing. */}
        {outcomeWord && (
          <span
            className="flex-none max-w-[55%] font-display font-black uppercase animate-[stampReveal_0.4s_cubic-bezier(0.34,1.56,0.64,1)]"
            style={{
              fontSize: 'clamp(20px, 6.5vw, 32px)',
              lineHeight: 0.9,
              letterSpacing: '-0.04em',
              textShadow: '3px 3px 0 #000',
              color: wordColor,
              transform: 'rotate(-1deg)',
              textAlign: 'right',
            }}
          >
            {outcomeWord}
          </span>
        )}
      </div>

      {/* Statement — the CallCard Archivo display voice verbatim */}
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

      {/* Bottom row: FINAL / REP Δ / STAKE stat blocks + outlined SHARE */}
      <div className="flex flex-row flex-wrap items-end gap-x-7 gap-y-3">
        {/* FINAL — only a real finalPct or the explicit semantic-N/A flag
            (absent field ≠ N/A — D-07). */}
        {(hasFinalPct || hasFinalNA) && (
          <span className="flex flex-col">
            <span className={LABEL_OVERLINE}>FINAL</span>
            {hasFinalPct ? (
              <span
                className="font-mono text-[16px] font-semibold mt-1"
                style={{
                  color:
                    (call.finalPct as number) >= 0
                      ? 'var(--accent-win)'
                      : 'var(--accent-loss)',
                }}
              >
                {`${(call.finalPct as number) >= 0 ? '+' : ''}${(call.finalPct as number).toFixed(1)}%`}
              </span>
            ) : (
              <span
                className="font-mono text-[16px] font-semibold mt-1"
                style={{ color: 'var(--text-tertiary)' }}
              >
                —
              </span>
            )}
          </span>
        )}

        {/* REP Δ — hidden when absent, never fabricated (D-07). */}
        {hasRepDelta && (
          <span className="flex flex-col">
            <span className={LABEL_OVERLINE}>REP Δ</span>
            <span
              className="font-mono text-[16px] font-semibold mt-1"
              style={{
                color:
                  (call.repDelta as number) > 0
                    ? 'var(--accent-win)'
                    : (call.repDelta as number) < 0
                      ? 'var(--accent-loss)'
                      : 'var(--text-primary)',
              }}
            >
              {`${(call.repDelta as number) > 0 ? '+' : ''}${call.repDelta}`}
            </span>
          </span>
        )}

        {/* STAKE — always (the stake is on every wire item). */}
        <span className="flex flex-col">
          <span className={LABEL_OVERLINE}>STAKE</span>
          <span className="font-mono text-[16px] font-semibold mt-1 text-[var(--text-primary)]">
            {formatStake(call.stake)}
          </span>
        </span>

        {/* SHARE — .btn outline-white anchor; absent without href (D-08).
            stopPropagation keeps the D-06 card-tap nav on the body only. */}
        {shareHref && (
          <a
            href={shareHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center font-mono text-[12px] font-semibold uppercase tracking-[0.06em] border-2 border-[var(--border-strong)] text-[var(--text-primary)] bg-transparent px-4 min-h-[44px] w-full sm:w-auto sm:ml-auto hover:bg-white/[0.04]"
          >
            SHARE
          </a>
        )}
      </div>
    </div>
  );
}
