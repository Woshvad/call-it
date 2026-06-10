/**
 * Receipt — multi-mode receipt component (D-21, ROOT brutalist skin Phase 09.2)
 *
 * FLEXBOX ONLY — see Pitfall 15. Phase 7 OG via Satori will reuse this component.
 * No CSS grid layout, no grid utility classes. All layouts must be flexbox.
 *
 * AUTH-44: This component NEVER renders the wallet address.
 * The data prop type signature explicitly excludes an `address` field.
 * Anti-drift enforced at three layers:
 *   1. TypeScript type (no address field)
 *   2. ESLint no-display-grid rule (packages/config/eslint/base.js)
 *   3. Vitest static-source assertion (__tests__/receipt-no-address.test.tsx)
 *
 * Modes:
 *   preview  — form-bound data before publishing; "DRAFT · LIVE PREVIEW" mono header
 *   live     — subgraph-bound data after publishing; shows LIVE tag
 *   settled  — settled call data; shows Stamp with outcome word
 *
 * Preview canon (09.2 screenshots): "● Call It" mono header row, square avatar
 * identity row, headline with unfilled tokens dim-italic, CONVICTION/STAKE stat
 * pair, conviction bar fill, if-correct/if-wrong rows (REAL stake only — the
 * if-correct payout has no computed source, so it degrades to a descriptive
 * line per D-07; no mock payout math, D-05), "chain · arbitrum" mono footer.
 *
 * Visual parity with apps/web/lib/og-fallback-render.ts buildCard() is
 * structural only — UI/OG visual divergence is accepted in-phase (D-04).
 */

import { Card } from '../primitives/Card';
import { CornerBrackets } from '../primitives/CornerBrackets';
import { Tag } from '../primitives/Tag';
import { Stamp, type StampColor } from '../primitives/Stamp';
import { VerifiedBadge } from '../primitives/VerifiedBadge';

/** Data shape for Receipt — intentionally excludes wallet address (AUTH-44) */
export type ReceiptData = {
  /** Public handle (not wallet address) */
  handle: string;
  /**
   * X (Twitter) link verified — renders VERIFIED · X in the header (AUTH-09).
   * Badge host for the Live Receipt (Phase 2) and the Settled Receipt (Phase 4,
   * wiring deferred — the host is ready now per D-07).
   */
  verifiedX?: boolean;
  /** Farcaster link verified — renders VERIFIED · FC in the header (AUTH-09) */
  verifiedFc?: boolean;
  /** Human-readable market line e.g. "BTC >= $80k by Dec 31" */
  marketLine: string;
  /** Conviction 1-100 */
  conviction: number;
  /** Settlement deadline */
  deadline: Date;
  /** Stake in USDC (number or bigint) */
  stake: number | bigint;
  /** Optional criteria hash for verifiable criteria receipts */
  criteriaHash?: string;
  /** Outcome word for settled mode: "CALLED IT" | "LOUD AND WRONG" | "CONTRARIAN HIT" */
  outcome?: string;
  /** Outcome color key for settled mode Stamp */
  outcomeColor?: StampColor;
  /** Settled-mode extra data (phase 4 wires) */
  settledData?: {
    settledAt?: Date;
    finalPrice?: string;
  };
};

export type ReceiptProps = {
  mode: 'preview' | 'live' | 'settled';
  data: ReceiptData;
  className?: string;
};

/** Format stake for display — bigint stakes are 6-decimal micro-USDC (matches CallCard.formatStake) */
function formatStake(stake: number | bigint): string {
  const n = typeof stake === 'bigint' ? Number(stake) / 1_000_000 : stake;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** Format deadline for display */
function formatDeadline(deadline: Date): string {
  return deadline.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * The /new preview composes its market line with 'Asset' / '?' placeholder
 * tokens while fields are empty (the existing token-fill logic lives in the
 * page). Render those unfilled tokens dim italic, filled tokens bold white.
 * Pure presentation — no new state or parsing beyond whitespace tokens.
 */
const UNFILLED_TOKENS = new Set(['Asset', '?']);

function MarketLineHeadline({ marketLine }: { marketLine: string }) {
  const tokens = marketLine.split(' ');
  return (
    <span
      className="font-display font-bold text-xl leading-tight"
      style={{ letterSpacing: '-0.02em' }}
    >
      {tokens.map((tok, i) => (
        <span
          key={`${tok}-${i}`}
          style={
            UNFILLED_TOKENS.has(tok)
              ? { color: 'var(--text-muted)', fontStyle: 'italic' }
              : { color: 'var(--text-primary)' }
          }
        >
          {tok}
          {i < tokens.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  );
}

export function Receipt({ mode, data, className }: ReceiptProps) {
  const avatarInitial = (data.handle.replace(/^@/, '')[0] ?? '?').toUpperCase();

  return (
    <Card className={className} variant="hero" accent={mode === 'settled'}>
      {/* Corner brackets for all modes — visual identity */}
      <CornerBrackets />

      {/* Mono header row: brand mark + mode marker */}
      <div className="flex flex-row items-center justify-between mb-4">
        <span
          className="font-mono"
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
          }}
        >
          <span style={{ color: 'var(--accent-win)' }}>●</span> Call It
        </span>
        {mode === 'preview' && (
          <span
            className="font-mono"
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--text-tertiary)',
            }}
          >
            DRAFT · LIVE PREVIEW
          </span>
        )}
        {mode === 'live' && <Tag intent="warning">LIVE</Tag>}
        {mode === 'settled' && data.outcome && data.outcomeColor && (
          <Tag intent="success">SETTLED</Tag>
        )}
      </div>

      {/* Identity row: square avatar + handle + verified badge host (AUTH-09 / D-07) */}
      <div className="flex flex-row items-center gap-2 mb-4">
        <span
          aria-hidden="true"
          className="flex items-center justify-center font-display"
          style={{
            width: 28,
            height: 28,
            background: 'var(--accent-win)',
            color: '#000',
            border: '1px solid var(--border-strong)',
            fontWeight: 900,
            fontSize: 11,
            flexShrink: 0,
          }}
        >
          {avatarInitial}
        </span>
        <span className="font-mono text-sm" style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
          @{data.handle.replace(/^@/, '')}
        </span>
        <VerifiedBadge verifiedX={data.verifiedX} verifiedFc={data.verifiedFc} />
      </div>

      {/* Settled mode: Stamp overlay */}
      {mode === 'settled' && data.outcome && data.outcomeColor && (
        <div className="flex flex-row justify-center mb-4">
          <Stamp word={data.outcome} color={data.outcomeColor} />
        </div>
      )}

      {/* Call headline — unfilled tokens dim italic, filled tokens bold white */}
      <div className="flex flex-col gap-1 mb-4">
        <span
          className="font-mono text-xs uppercase"
          style={{ letterSpacing: '0.08em', color: 'var(--text-tertiary)', fontWeight: 600 }}
        >
          Call
        </span>
        <MarketLineHeadline marketLine={data.marketLine} />
        <span className="font-mono" style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          by {formatDeadline(data.deadline)}
        </span>
      </div>

      {/* CONVICTION / STAKE stat pair */}
      <div className="flex flex-row gap-6 mb-3">
        <div className="flex flex-col gap-1" style={{ flex: 1 }}>
          <span
            className="font-mono text-xs uppercase"
            style={{ letterSpacing: '0.08em', color: 'var(--text-tertiary)', fontWeight: 600 }}
          >
            Conviction
          </span>
          <span className="font-mono font-bold text-xl" style={{ color: 'var(--accent-win)' }}>
            {data.conviction}%
          </span>
        </div>
        <div className="flex flex-col gap-1" style={{ flex: 1 }}>
          <span
            className="font-mono text-xs uppercase"
            style={{ letterSpacing: '0.08em', color: 'var(--text-tertiary)', fontWeight: 600 }}
          >
            Stake
          </span>
          <span className="font-mono font-bold text-xl" style={{ color: 'var(--text-primary)' }}>
            {formatStake(data.stake)}
          </span>
        </div>
      </div>

      {/* Conviction bar fill (.brutal-bar recipe, flexbox-only) */}
      <div
        className="flex flex-row mb-4"
        style={{
          height: 10,
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(100, data.conviction))}%`,
            background: 'var(--accent-win)',
          }}
        />
      </div>

      {/* If-correct / if-wrong rows — REAL stake only (D-05/D-07: the win payout
          has no computed source pre-publish, so it stays descriptive, never faked) */}
      <div
        className="flex flex-row gap-4 mb-4"
        style={{
          padding: 14,
          background: 'var(--bg-quaternary)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div
          className="flex flex-col gap-1"
          style={{ flex: 1, borderRight: '1px solid var(--border-subtle)', paddingRight: 14 }}
        >
          <span
            className="font-mono"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--accent-win)',
            }}
          >
            IF CORRECT
          </span>
          <span className="font-mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-win)' }}>
            stake + pool share
          </span>
          <span className="font-mono" style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
            settles on chain
          </span>
        </div>
        <div className="flex flex-col gap-1" style={{ flex: 1 }}>
          <span
            className="font-mono"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--accent-loss)',
            }}
          >
            IF WRONG
          </span>
          <span className="font-mono" style={{ fontSize: 17, fontWeight: 700, color: 'var(--accent-loss)' }}>
            −{formatStake(data.stake)}
          </span>
          <span className="font-mono" style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
            on the record
          </span>
        </div>
      </div>

      {/* Criteria hash badge (optional) */}
      {data.criteriaHash && (
        <div className="flex flex-row items-center gap-2 mb-2">
          <span className="font-mono text-xs" style={{ color: 'var(--text-tertiary)' }}>
            criteria:
          </span>
          <span className="font-mono text-xs truncate max-w-[160px]" style={{ color: 'var(--text-tertiary)' }}>
            {data.criteriaHash.slice(0, 8)}…
          </span>
        </div>
      )}

      {/* Live mode: activity indicator (square live dot) */}
      {mode === 'live' && (
        <div className="flex flex-row items-center gap-2 mb-2">
          <div style={{ width: 6, height: 6, background: 'var(--accent-win)' }} />
          <span className="font-mono text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Live activity...
          </span>
        </div>
      )}

      {/* Settled mode: settlement details */}
      {mode === 'settled' && data.settledData?.settledAt && (
        <div className="flex flex-row items-center gap-2 mb-2">
          <span className="font-mono text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Settled {data.settledData.settledAt.toLocaleDateString()}
          </span>
        </div>
      )}

      {/* Mono footer */}
      <div
        className="flex flex-row justify-center"
        style={{
          marginTop: 4,
          paddingTop: 12,
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        <span
          className="font-mono"
          style={{
            fontSize: 10,
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
          }}
        >
          chain · arbitrum
        </span>
      </div>
    </Card>
  );
}
