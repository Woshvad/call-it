/**
 * QuoteSuccess — Quote Composer success screen (UI-28, SHARE-15, ROOT cream skin).
 *
 * Renders after a quote is posted:
 *   - cream success block ("Quote posted" — inverse panel, Archivo voice)
 *   - a THREAD PREVIEW: the parent card + the user's quote stacked VERTICALLY
 *   - a "Share receipt" button → Twitter web-intent URL built by the shared
 *     share-text builder (SHARE-15) — same canonical builders the relayer's
 *     social publishing worker uses (relocated to @call-it/shared in 07-04,
 *     re-exported from apps/web/lib/share-text.ts).
 *
 * The Share button is the reusable affordance the receipt/profile pages can also
 * use (it takes a receipt URL + outcome/handle/statement and produces the intent).
 *
 * FLEXBOX ONLY — no CSS grid (Pitfall 15).
 *
 * Requirements: UI-28, SHARE-15
 */

'use client';

import { Card, Button } from '@call-it/ui';
import { QuoteParentCard } from './QuoteParentCard';
import { ShareButton } from '@/components/ShareButton';

interface QuoteSuccessProps {
  parentCallId: string;
  quoteMarketLine: string;
  quoteConviction: number;
  thesis: string;
}

export function QuoteSuccess({
  parentCallId,
  quoteMarketLine,
  quoteConviction,
  thesis,
}: QuoteSuccessProps) {
  // Receipt URL for the share intent (the quote's public surface). In production
  // this is the deployed origin; relative is fine for the intent's url param.
  const receiptUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/call/${parentCallId}`
      : `/call/${parentCallId}`;

  return (
    <main
      style={{
        maxWidth: '560px',
        margin: '0 auto',
        padding: '24px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
      }}
    >
      {/* Cream success block — inverse panel (the signature treatment) */}
      <Card variant="cream">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'rgba(0,0,0,0.55)',
            }}
          >
            ON RECORD · PERMANENT
          </span>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 32,
              fontWeight: 900,
              letterSpacing: '-0.025em',
              lineHeight: 1.05,
              textTransform: 'uppercase',
              color: '#000',
              margin: 0,
            }}
          >
            Quote posted
          </h1>
        </div>
      </Card>

      {/* Thread preview: parent card + the user's quote stacked vertically */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <QuoteParentCard parentCallId={parentCallId} />

        {/* The user's quote (the new call) */}
        <Card accent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="label-overline">Your quote</span>
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
              {quoteMarketLine}
            </span>
            {thesis.trim().length > 0 && (
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{thesis}</span>
            )}
            <span
              className="mono"
              style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-win)' }}
            >
              {quoteConviction}% conviction
            </span>
          </div>
        </Card>
      </div>

      {/* Share affordance (SHARE-15) */}
      <div style={{ display: 'flex', flexDirection: 'row', gap: '12px' }}>
        <ShareButton
          receiptUrl={receiptUrl}
          outcomeWord="CALLED A QUOTE"
          handle="@you"
          statement={quoteMarketLine}
        />
        <a href={`/call/${parentCallId}`} style={{ textDecoration: 'none' }}>
          <Button intent="secondary" size="lg" type="button">
            View thread
          </Button>
        </a>
      </div>
    </main>
  );
}
