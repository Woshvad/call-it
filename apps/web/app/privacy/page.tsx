/**
 * /privacy — on-brand Privacy Policy stub page.
 *
 * Mirrors /terms (apps/web/app/terms/page.tsx) structure + style. Linked from the
 * Sidebar footer and the /signin disclaimer so it never 404s. States plainly that
 * wallet address + linked social handles are public by design and that calls are a
 * permanent public record (no edits, no deletes).
 *
 * Plain server component — no auth, no hooks, no data fetching. Flexbox layout only
 * (Satori-safe habit).
 */

import Link from 'next/link';

export default function PrivacyPage() {
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
          Privacy Policy
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
          Full privacy policy coming soon.
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
          Call It is public by design. Your wallet address and any social handles you link
          (Twitter, Farcaster) are visible to everyone. Every call you make is a permanent public
          record — there are no edits and no deletes. Don&apos;t put anything on the tape you
          aren&apos;t willing to stand behind forever.
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
