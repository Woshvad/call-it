/**
 * MarketPositioningBar — Follow/Fade split progress bar
 *
 * Reads live followReserve / fadeReserve props and renders a two-section
 * flexbox bar: left (accent #E8F542) = follow%, right (dark) = fade%.
 *
 * FLEXBOX ONLY — no CSS grid (Pitfall 15 / Satori constraint).
 * Neobrutalist: 2px border, hard offset shadow, #09090E background.
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
          style={{ fontFamily: 'monospace', fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#94A3B8' }}
        >
          Market Positioning
        </span>
        {total === 0n && (
          <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#94A3B8' }}>
            No positions yet
          </span>
        )}
      </div>

      {/* Two-section bar — flexbox only */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          width: '100%',
          height: '20px',
          border: '2px solid #2E2E42',
          boxShadow: '3px 3px 0 0 #E8F542',
          overflow: 'hidden',
        }}
      >
        {/* Follow side — accent yellow-green */}
        <div
          style={{
            width: `${followPct}%`,
            backgroundColor: '#E8F542',
            height: '100%',
            transition: 'width 0.3s ease',
            minWidth: followPct > 0 ? '2px' : '0px',
          }}
        />
        {/* Fade side — dark */}
        <div
          style={{
            flex: 1,
            backgroundColor: '#13131D',
            height: '100%',
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
              fontFamily: 'monospace',
              fontSize: '13px',
              fontWeight: 700,
              color: '#E8F542',
            }}
          >
            {followPct}% Following
          </span>
          {showPoolSizes && total > 0n && (
            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#94A3B8' }}>
              {formatUsdc(followReserve)} pool
            </span>
          )}
        </div>

        {/* Fade label */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end' }}>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '13px',
              fontWeight: 700,
              color: '#F87171',
            }}
          >
            {fadePct}% Fading
          </span>
          {showPoolSizes && total > 0n && (
            <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#94A3B8' }}>
              {formatUsdc(fadeReserve)} pool
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
