/**
 * CustodyDisclosureCard — AUTH-22 Privy custody disclosure.
 *
 * Renders the spec §10.6 LOCKED copy verbatim:
 *   "Your wallet is custodied by Privy until you export it.
 *    We recommend exporting once you hold more than $50 in this wallet."
 *
 * This component is rendered:
 *   1. On Screen 1 of onboarding (`/onboarding/handle`) — guaranteed display moment
 *   2. On Profile → Settings (Plan 09 — deferred)
 *
 * AUTH-44: No wallet address rendered here — handle-only per spec.
 *
 * Requirements: AUTH-22, §10.6
 */

'use client';

import { Card } from '@call-it/ui';

interface CustodyDisclosureCardProps {
  /** Optional className for additional styling */
  className?: string;
}

/**
 * CustodyDisclosureCard — renders the locked AUTH-22 custody disclosure copy.
 *
 * This copy is SPEC-LOCKED. Do NOT modify the message text without updating
 * REQUIREMENTS.md AUTH-22 and adding a plan decision note.
 */
export function CustodyDisclosureCard({ className }: CustodyDisclosureCardProps) {
  return (
    <Card
      className={className}
      style={{
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        borderColor: 'var(--border-accent)',
        backgroundColor: 'var(--bg-quaternary)',
      }}
    >
      {/* AUTH-22 custody label */}
      <p
        style={{
          fontSize: '0.625rem',
          fontFamily: 'var(--font-mono)',
          color: 'var(--accent-win)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 600,
          margin: 0,
        }}
        data-testid="custody-disclosure-label"
      >
        Custody Notice
      </p>
      {/* AUTH-22 LOCKED COPY — do not modify */}
      {/* eslint-disable-next-line max-len */}
      <p
        style={{
          fontSize: '0.75rem',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
          margin: 0,
        }}
        data-testid="custody-disclosure-body"
      >
        Your wallet is custodied by Privy until you export it. We recommend exporting once you hold more than $50 in this wallet.
      </p>
    </Card>
  );
}
