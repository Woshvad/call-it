'use client';
/**
 * SystemTicker — 32px sticky price tape (prototype `components.jsx` ~226).
 *
 * FLAG-GATED, DEFAULT OFF (D-11): renders ONLY when
 * `NEXT_PUBLIC_SYSTEM_TICKER === '1'`. No price endpoint exists yet, so this
 * is markup only — NO data fetch, NO mock prices (D-05 / T-09.2-09: never
 * fake "live" data). When a real price feed lands, a later plan passes
 * `items` from that source.
 *
 * Recipe: `.system-ticker` in globals.css — 32px, sticky top:0, z-60,
 * bg var(--bg-ticker), JBM 11px, 80s linear marquee (pauses on hover).
 *
 * AppShell derives its sticky offsets from the same flag — the 32px offset
 * is never hardcoded when the flag is off (D-11).
 */

/** Single tape entry — fed by a REAL price source only (never mocks, D-05). */
export interface TickerItem {
  /** Asset label, e.g. "BTC" */
  label: string;
  /** Display value, e.g. "$97,840" */
  value: string;
  /** Signed 24h change in percent, e.g. -2.6 */
  changePct: number;
}

/** True when the ticker feature flag is on (default OFF — D-11). */
export function isSystemTickerEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SYSTEM_TICKER === '1';
}

export interface SystemTickerProps {
  /** Computed by AppShell from NEXT_PUBLIC_SYSTEM_TICKER (default OFF). */
  enabled: boolean;
  /** Real price entries — defaults to empty (no price endpoint yet, D-11). */
  items?: TickerItem[];
}

export function SystemTicker({ enabled, items = [] }: SystemTickerProps) {
  if (!enabled) return null;

  return (
    <div className="system-ticker" role="marquee" aria-label="Price tape">
      {items.length > 0 && (
        <div className="system-ticker-track">
          {/* Triplicate the list so the -50% marquee loop never shows a gap */}
          {[...items, ...items, ...items].map((it, i) => (
            <span key={i} className="system-ticker-item">
              <span style={{ color: 'var(--text-tertiary)' }}>{it.label}</span>
              <span style={{ color: 'var(--text-primary)' }}>{it.value}</span>
              <span
                style={{
                  color: it.changePct > 0 ? 'var(--accent-win)' : 'var(--accent-loss)',
                }}
              >
                {it.changePct > 0 ? '↗' : '↘'}
                {Math.abs(it.changePct).toFixed(1)}%
              </span>
              <span style={{ color: 'var(--text-muted)' }}>·</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
