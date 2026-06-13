'use client';
/**
 * error.tsx — route-segment error boundary (quick-260613-e46 #2).
 *
 * Client component (required for error boundaries). Renders inside the AppShell
 * for any thrown render error in a route segment, replacing the segment with an
 * on-brand recovery card (brutal-card / .btn classes from globals.css, tape voice).
 * The Try again button calls reset() to re-render the segment.
 */

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Benign — surfaces the digest for log correlation; no secrets.
    console.error('Render error', error.digest);
  }, [error]);

  return (
    <div
      className="brutal-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 18,
        padding: '80px 24px',
        textAlign: 'center',
        marginTop: 48,
      }}
    >
      <span
        className="mono"
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--text-tertiary)',
        }}
      >
        ERROR
      </span>
      <span className="h-1" style={{ maxWidth: '24ch' }}>
        SOMETHING WENT LOUD AND WRONG.
      </span>
      <span style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: '40ch' }}>
        That wasn&apos;t supposed to happen. The tape is fine — give it another shot.
      </span>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button type="button" onClick={() => reset()} className="btn cream">
          TRY AGAIN
        </button>
        <Link href="/" className="btn" style={{ textDecoration: 'none' }}>
          BACK TO THE TAPE
        </Link>
      </div>
    </div>
  );
}
