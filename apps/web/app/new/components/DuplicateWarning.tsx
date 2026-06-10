'use client';

import Link from 'next/link';
import { Tag } from '@call-it/ui';

interface DuplicateWarningProps {
  existingCallId: number;
}

/**
 * DuplicateWarning — warning block (#FB923C border, ROOT skin) shown when the
 * dup-check returns a match.
 *
 * CALL-49: User sees this warning above the conviction slider when a near-identical
 * call already exists. The warning includes a link to quote the existing call instead.
 *
 * D-22: Triggered by the 400ms debounced dup-check hook (useDebouncedDupCheck).
 *
 * Copy is verbatim per CALL-49 acceptance criteria:
 *   "A nearly identical call is already live — quote it instead"
 */
export function DuplicateWarning({ existingCallId }: DuplicateWarningProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        border: '2px solid #FB923C',
        background: 'rgba(251,146,60,0.06)',
        boxShadow: 'var(--shadow-brutal-sm)',
      }}
    >
      {/* Warning pill */}
      <Tag intent="warning" className="shrink-0 text-xs font-mono">
        DUPLICATE
      </Tag>

      <div
        className="mono"
        style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}
      >
        A nearly identical call is already live — quote it instead
      </div>

      <Link
        href={`/new?quote=${existingCallId}`}
        className="mono shrink-0"
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--accent-warning)',
          textDecoration: 'underline',
        }}
        aria-label={`Quote call ${existingCallId}`}
      >
        quote it instead →
      </Link>
    </div>
  );
}
