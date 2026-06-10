/**
 * Receipt — multi-mode receipt component (D-21)
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
 *   preview  — form-bound data before publishing; shows PREVIEW tag
 *   live     — subgraph-bound data after publishing; shows LIVE tag
 *   settled  — settled call data; shows Stamp with outcome word
 *
 * Visual parity with apps/web/lib/og-fallback-render.ts buildCard()
 * so Phase 7 OG card variants can reuse the same structure.
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

/** Format stake for display */
function formatStake(stake: number | bigint): string {
  const n = typeof stake === 'bigint' ? Number(stake) : stake;
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

export function Receipt({ mode, data, className }: ReceiptProps) {
  return (
    <Card className={className} accent={mode === 'settled'}>
      {/* Corner brackets for all modes — visual identity */}
      <CornerBrackets />

      {/* Top row: mode badge + handle */}
      <div className="flex flex-row items-center justify-between mb-4">
        {mode === 'preview' && (
          <Tag intent="info">PREVIEW</Tag>
        )}
        {mode === 'live' && (
          <Tag intent="warning">LIVE</Tag>
        )}
        {mode === 'settled' && data.outcome && data.outcomeColor && (
          <Tag intent="success">SETTLED</Tag>
        )}
        {/* Caller handle + verified badge host (AUTH-09 / D-07) */}
        <div className="flex flex-row items-center gap-2">
          <VerifiedBadge verifiedX={data.verifiedX} verifiedFc={data.verifiedFc} />
          <span className="font-mono text-sm text-brand-muted">@{data.handle}</span>
        </div>
      </div>

      {/* Settled mode: Stamp overlay */}
      {mode === 'settled' && data.outcome && data.outcomeColor && (
        <div className="flex flex-row justify-center mb-4">
          <Stamp word={data.outcome} color={data.outcomeColor} />
        </div>
      )}

      {/* Market line */}
      <div className="flex flex-col gap-1 mb-4">
        <span className="font-body text-xs text-brand-muted uppercase tracking-wider">Call</span>
        <span className="font-display font-bold text-lg text-brand-text leading-tight">
          {data.marketLine}
        </span>
      </div>

      {/* Conviction + Stake row */}
      <div className="flex flex-row gap-6 mb-4">
        <div className="flex flex-col gap-1">
          <span className="font-body text-xs text-brand-muted uppercase tracking-wider">Conviction</span>
          <span className="font-mono font-bold text-brand-accent text-xl">{data.conviction}%</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-body text-xs text-brand-muted uppercase tracking-wider">Stake</span>
          <span className="font-mono font-bold text-brand-text text-xl">{formatStake(data.stake)}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-body text-xs text-brand-muted uppercase tracking-wider">Deadline</span>
          <span className="font-mono text-brand-text text-sm">{formatDeadline(data.deadline)}</span>
        </div>
      </div>

      {/* Criteria hash badge (optional) */}
      {data.criteriaHash && (
        <div className="flex flex-row items-center gap-2">
          <span className="font-body text-xs text-brand-muted">Criteria:</span>
          <span className="font-mono text-xs text-brand-muted truncate max-w-[160px]">
            {data.criteriaHash.slice(0, 8)}…
          </span>
        </div>
      )}

      {/* Live mode: activity placeholder (Phase 2 wires) */}
      {mode === 'live' && (
        <div className="flex flex-row items-center gap-2 mt-2">
          <div className="w-2 h-2 rounded-full bg-brand-accent" />
          <span className="font-body text-xs text-brand-muted">Live activity...</span>
        </div>
      )}

      {/* Settled mode: settlement details */}
      {mode === 'settled' && data.settledData?.settledAt && (
        <div className="flex flex-row items-center gap-2 mt-2">
          <span className="font-body text-xs text-brand-muted">
            Settled {data.settledData.settledAt.toLocaleDateString()}
          </span>
        </div>
      )}
    </Card>
  );
}
