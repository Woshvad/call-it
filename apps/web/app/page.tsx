/**
 * Call It — Home page
 *
 * Phase 0 placeholder. Real feed UI lands in Phase 1 (call creation + feed).
 * Auth UI (Privy, wallet connect) lands in Phase 1.
 *
 * D-12: Domain literals are never hardcoded; this page uses no domain references.
 */
export default function HomePage() {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <h1
        style={{
          fontSize: '3rem',
          fontWeight: 900,
          letterSpacing: '-0.04em',
          color: '#FFFFFF',
          marginBottom: '1rem',
        }}
      >
        CALL IT
      </h1>
      <p
        style={{
          fontSize: '1.25rem',
          color: '#A1A1AA',
          maxWidth: '480px',
          lineHeight: 1.5,
        }}
      >
        Be right in public. Every call is permanent, public, and tied to your identity.
      </p>
      <p
        style={{
          marginTop: '2rem',
          fontSize: '0.875rem',
          color: '#52525B',
          fontFamily: 'monospace',
        }}
      >
        Phase 0 — Foundation in progress
      </p>
    </main>
  );
}
