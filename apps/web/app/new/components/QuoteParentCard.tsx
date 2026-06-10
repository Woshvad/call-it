/**
 * QuoteParentCard — read-only parent context card for the Quote Composer (UI-26,
 * ROOT `.brutal-card` skin).
 *
 * Renders the quoted (parent) call as a read-only Card:
 *   - QUOTING overline label (JBM mono)
 *   - parent statement (Archivo display voice)
 *   - "view original" mono link
 * UI-26: NO corner brackets on the parent card (distinguishes it from the active
 * composer surface).
 *
 * Stance pill (FOLLOWING/FADING) intentionally NOT rendered: the quote stance is
 * keyed to the on-chain CallQuoted event at publish time — there is no stance
 * data source at compose time, so it degrades to hidden per D-07 (never faked).
 *
 * Data: fetched client-side from the relayer marketLine + subgraph (D-04 — full
 * cross-origin hydration verified at deploy, Plan 07-06). Until the fetch resolves
 * (or if the parent is unavailable) the documented empty state is shown.
 *
 * FLEXBOX ONLY — no CSS grid (Pitfall 15).
 *
 * Requirements: UI-26, D-04
 */

'use client';

import { useEffect, useState } from 'react';
import { Card } from '@call-it/ui';
import { getMarketLine } from '@/lib/relayer-client';

interface QuoteParentCardProps {
  parentCallId: string;
}

export function QuoteParentCard({ parentCallId }: QuoteParentCardProps) {
  const [statement, setStatement] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getMarketLine(parentCallId)
      .then((line) => {
        if (!active) return;
        if (line) {
          setStatement(line);
        } else {
          // No authoritative statement — fall back to a safe generic label, never crash.
          setStatement(`Call #${parentCallId}`);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setUnavailable(true);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [parentCallId]);

  // Empty state: parent unavailable (UI-SPEC empty-states table).
  if (unavailable) {
    return (
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 20,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '-0.01em',
              color: 'var(--text-primary)',
            }}
          >
            Call unavailable
          </span>
          <span className="mono" style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            This call can&apos;t be quoted right now. It may be unsettled or removed.
          </span>
        </div>
      </Card>
    );
  }

  return (
    // NO corner brackets on the parent card (UI-26) — a plain .brutal-card.
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="label-overline">QUOTING</span>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: '-0.015em',
            lineHeight: 1.15,
            color: 'var(--text-primary)',
          }}
        >
          {loading ? 'Loading call…' : statement}
        </span>
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: 10,
          }}
        >
          <span className="mono" style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
            Original call
          </span>
          <a
            href={`/call/${parentCallId}`}
            className="mono"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
              textDecoration: 'underline',
            }}
          >
            view original
          </a>
        </div>
      </div>
    </Card>
  );
}
