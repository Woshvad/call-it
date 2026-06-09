/**
 * /terms — on-brand Terms & Conditions stub page.
 *
 * Backs the /signin disclaimer link (AUTH-37) so it never 404s. Preserves the
 * permanent-public-record promise the old inline disclaimer carried, verbatim.
 *
 * Plain server component — no auth, no hooks, no data fetching. Flexbox layout only
 * (Satori-safe habit).
 */

import Link from 'next/link';

export default function TermsPage() {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '2rem',
        backgroundColor: '#09090E',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          width: '100%',
          maxWidth: '480px',
          gap: '1.25rem',
        }}
      >
        <h1
          style={{
            fontSize: '2rem',
            fontWeight: 900,
            letterSpacing: '-0.02em',
            color: '#E8F542',
            fontFamily: "'Syne', sans-serif",
            textTransform: 'uppercase',
            lineHeight: 1.1,
            margin: 0,
          }}
        >
          Terms &amp; Conditions
        </h1>

        <p
          style={{
            fontSize: '0.9rem',
            color: '#A1A1AA',
            fontFamily: 'monospace',
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          Full terms are coming soon.
        </p>

        <p
          style={{
            fontSize: '0.9rem',
            color: '#A1A1AA',
            fontFamily: 'monospace',
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          By using Call It and signing in, you acknowledge that your calls become a permanent public record. No edits. No deletes. Wins and losses both count.
        </p>

        <Link
          href="/"
          style={{
            color: '#E8F542',
            textDecoration: 'underline',
            fontFamily: 'monospace',
            fontSize: '0.875rem',
            marginTop: '0.5rem',
          }}
        >
          &larr; Back to Call It
        </Link>
      </div>
    </main>
  );
}
