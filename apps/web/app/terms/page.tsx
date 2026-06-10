/**
 * /terms — on-brand Terms & Conditions stub page.
 *
 * Backs the /signin disclaimer link (AUTH-37) so it never 404s. Preserves the
 * permanent-public-record promise the old inline disclaimer carried, verbatim.
 *
 * 09.2-13 retheme: typographic restyle only — Archivo heading, Inter body,
 * token-layer colors; content verbatim (D-05/D-14).
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
        justifyContent: 'flex-start',
        minHeight: '60vh',
        padding: '2rem',
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
            letterSpacing: '-0.04em',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-display)',
            textTransform: 'uppercase',
            lineHeight: 0.95,
            margin: 0,
          }}
        >
          Terms &amp; Conditions
        </h1>

        <p
          style={{
            fontSize: '0.8rem',
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-mono)',
            lineHeight: 1.5,
            margin: 0,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          Full terms are coming soon.
        </p>

        <p
          style={{
            fontSize: '0.95rem',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-sans)',
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          By using Call It and signing in, you acknowledge that your calls become a permanent public record. No edits. No deletes. Wins and losses both count.
        </p>

        <Link
          href="/"
          style={{
            color: 'var(--accent-win)',
            textDecoration: 'underline',
            fontFamily: 'var(--font-mono)',
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
