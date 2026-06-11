/**
 * not-found.tsx — branded 404 (quick-260611-5mh C8)
 *
 * Server Component (no client directive, no hooks) rendered inside the AppShell
 * for any unknown route / missing call. App-shell typography + btn classes
 * from globals.css; copy in the brutal tape voice.
 */

import Link from 'next/link';

export default function NotFound() {
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
        404
      </span>
      <span className="h-1" style={{ maxWidth: '20ch' }}>
        NO SUCH CALL ON THE TAPE.
      </span>
      <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
        Whatever was here either never existed or never went on record.
      </span>
      <Link href="/" className="btn cream" style={{ textDecoration: 'none' }}>
        BACK TO THE TAPE
      </Link>
    </div>
  );
}
