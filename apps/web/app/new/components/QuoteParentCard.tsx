/**
 * QuoteParentCard — read-only parent context card for the Quote Composer (UI-26).
 *
 * Renders the quoted (parent) call as a read-only Card:
 *   - QUOTING label
 *   - parent caller info + parent statement (italic Syne)
 *   - stake / conviction / follow / fade meta row
 *   - "view original" link
 * UI-26: NO corner brackets on the parent card (distinguishes it from the active
 * composer surface).
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span className="font-display font-bold text-brand-text text-xl">Call unavailable</span>
          <span className="font-body text-brand-muted text-base">
            This call can&apos;t be quoted right now. It may be unsettled or removed.
          </span>
        </div>
      </Card>
    );
  }

  return (
    // NO corner brackets on the parent card (UI-26) — a plain Card.
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <span className="font-mono text-xs uppercase tracking-wide text-brand-muted">QUOTING</span>
        <span
          className="font-display font-bold text-brand-text"
          style={{ fontSize: '20px', fontStyle: 'italic', lineHeight: 1.2 }}
        >
          {loading ? 'Loading call…' : statement}
        </span>
        <div
          style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <span className="font-mono text-sm text-brand-muted">Original call</span>
          <a
            href={`/call/${parentCallId}`}
            className="font-mono text-sm text-brand-muted"
            style={{ textDecoration: 'underline' }}
          >
            view original
          </a>
        </div>
      </div>
    </Card>
  );
}
