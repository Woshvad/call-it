'use client';
/**
 * global-error.tsx — root error boundary (quick-260613-e46 #2).
 *
 * Triggers when the root layout itself throws. Because it REPLACES the root
 * layout, it must render its own <html>/<body> and cannot rely on globals.css
 * class styling being applied — so brand tokens are hardcoded inline
 * (#09090E background, #E8F542 accent, light text) to render standalone.
 * The Try again button calls reset().
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Reference error so the prop is intentionally consumed (digest for log correlation).
  void error.digest;

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
          padding: '24px',
          textAlign: 'center',
          background: '#09090E',
          color: '#F5F1E8',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#9A9A90',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}
        >
          FATAL ERROR
        </span>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 900,
            letterSpacing: '-0.03em',
            textTransform: 'uppercase',
            lineHeight: 1,
            margin: 0,
            maxWidth: '24ch',
          }}
        >
          THE TAPE TOOK A HIT.
        </h1>
        <p style={{ color: '#C9C9C0', fontSize: 14, margin: 0, maxWidth: '40ch' }}>
          Call It hit an unexpected error. Try reloading — your calls are permanent and safe.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            marginTop: 8,
            padding: '12px 22px',
            background: '#E8F542',
            color: '#09090E',
            border: '2px solid #09090E',
            fontWeight: 800,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}
        >
          TRY AGAIN
        </button>
      </body>
    </html>
  );
}
