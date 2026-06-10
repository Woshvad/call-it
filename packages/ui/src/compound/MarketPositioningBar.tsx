/**
 * MarketPositioningBar — Follow/Fade split progress bar
 * (prototype `.brutal-bar.split` recipe, Phase 09.2 retheme)
 *
 * Reads live followReserve / fadeReserve props and renders a two-segment
 * flexbox bar: follow side var(--accent-win), 2px black gap, fade side
 * var(--accent-loss). Fill widths transition 0.4s cubic-bezier(0.16,1,0.3,1).
 *
 * FLEXBOX ONLY — no CSS grid (Pitfall 15 / Satori constraint).
 * Brutalist: 10px bar, 1px var(--border-subtle) border, radius 0.
 *
 * Requirements: SOCIAL-05, SOCIAL-06, UI-06
 * Spec: §15.3 — "MARKET POSITIONING bar with X% follow / Y% fade labels"
 */

export type MarketPositioningBarProps = {
  /** Follow pool reserve in USDC (6-decimal units, bigint) */
  followReserve: bigint;
  /** Fade pool reserve in USDC (6-decimal units, bigint) */
  fadeReserve: bigint;
  /** Optional pool size label display (default: show USDC amounts) */
  showPoolSizes?: boolean;
  className?: string;
};

/** Format USDC bigint (6 decimals) to human-readable dollar string */
function formatUsdc(amount: bigint): string {
  const dollars = Number(amount) / 1_000_000;
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const MONO_STACK = 'var(--font-mono), ui-monospace, monospace';
const FILL_TRANSITION = 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)';

export function MarketPositioningBar({
  followReserve,
  fadeReserve,
  showPoolSizes = true,
  className,
}: MarketPositioningBarProps) {
  // Compute percentages — guard division-by-zero for empty pools
  const total = followReserve + fadeReserve;
  const followPct = total === 0n ? 50 : Number((followReserve * 100n) / total);
  const fadePct = 100 - followPct;

  return (
    <div className={className}>
      {/* Section label */}
      <div
        style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', marginBottom: '6px' }}
      >
        <span
          style={{ fontFamily: MONO_STACK, fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}
        >
          Market Positioning
        </span>
        {total === 0n && (
          <span style={{ fontFamily: MONO_STACK, fontSize: '11px', color: 'var(--text-tertiary)' }}>
            No positions yet
          </span>
        )}
      </div>

      {/* .brutal-bar.split — two segments + 2px black gap, flexbox only */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          width: '100%',
          height: '10px',
          border: '1px solid var(--border-subtle)',
          borderRadius: 0,
          background: 'var(--bg-tertiary)',
          overflow: 'hidden',
        }}
      >
        {/* Follow side — accent win */}
        <div
          style={{
            width: `${followPct}%`,
            backgroundColor: 'var(--accent-win)',
            height: '100%',
            transition: FILL_TRANSITION,
            minWidth: followPct > 0 ? '2px' : '0px',
          }}
        />
        {/* 2px black gap between segments */}
        <div
          style={{
            flex: '0 0 2px',
            width: '2px',
            backgroundColor: '#000',
            height: '100%',
          }}
        />
        {/* Fade side — accent loss */}
        <div
          style={{
            flex: 1,
            backgroundColor: 'var(--accent-loss)',
            height: '100%',
            transition: FILL_TRANSITION,
          }}
        />
      </div>

      {/* Labels row */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: '6px',
        }}
      >
        {/* Follow label */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span
            style={{
              fontFamily: MONO_STACK,
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--accent-win)',
            }}
          >
            {followPct}% Following
          </span>
          {showPoolSizes && total > 0n && (
            <span style={{ fontFamily: MONO_STACK, fontSize: '11px', color: 'var(--text-tertiary)' }}>
              {formatUsdc(followReserve)} pool
            </span>
          )}
        </div>

        {/* Fade label */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end' }}>
          <span
            style={{
              fontFamily: MONO_STACK,
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--accent-loss)',
            }}
          >
            {fadePct}% Fading
          </span>
          {showPoolSizes && total > 0n && (
            <span style={{ fontFamily: MONO_STACK, fontSize: '11px', color: 'var(--text-tertiary)' }}>
              {formatUsdc(fadeReserve)} pool
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
