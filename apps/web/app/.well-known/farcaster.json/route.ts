/**
 * Farcaster Mini App manifest — GET /.well-known/farcaster.json (SHARE-19 SC1b, D-05).
 *
 * Body-only, UNSIGNED manifest sufficient for feed embed render on the Sepolia origin.
 * The signed domain-ownership proof (a proof, NOT a secret) gates addMiniApp /
 * discoverability / notifications — NOT feed embed render — and is deferred to
 * Phase 10 against the mainnet domain (D-01/D-04/D-05). We deliberately emit NO
 * association proof key here (T-08-02-04: manifest is public display config, no secrets).
 *
 * All URLs derive ONLY from NEXT_PUBLIC_OG_BASE_URL (origin-locked, T-08-02-01) so the
 * Phase-10 mainnet domain cutover re-points them automatically (D-04).
 *
 * Required fields (verified 2026-06-08, miniapps.farcaster.xyz/docs/specification):
 *   version, name, homeUrl, iconUrl. The deprecated top-level imageUrl/buttonTitle are
 *   intentionally omitted — the embed meta (lib/farcaster-embed.ts) carries them.
 *
 * Runtime: 'nodejs' — CRITICAL, NOT 'edge' (CLAUDE.md mandate; matches every existing
 * route handler, e.g. app/og/[callId]/route.ts).
 *
 * Public reachability: the Farcaster crawler reaches this path unauthenticated via the
 * Wave-0 middleware `/.well-known` carve-out (Pitfall 2).
 *
 * Requirements: SHARE-19 (SC1b).
 */

export const runtime = 'nodejs';

/** Brand splash background (CLAUDE.md color token). */
const SPLASH_BACKGROUND_COLOR = '#09090E';
/** Mini App display name — ≤32 chars. */
const APP_NAME = 'Call It';
/** Matches the OG route's Cache-Control (app/og/[callId]/route.ts). */
const CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=300';

export async function GET(): Promise<Response> {
  // Origin env-derived only (D-04 / T-08-02-01) — never from request params/headers.
  const base = process.env['NEXT_PUBLIC_OG_BASE_URL'] ?? '';

  return Response.json(
    {
      miniapp: {
        version: '1',
        name: APP_NAME,
        homeUrl: base,
        iconUrl: `${base}/icon.png`, // 1024x1024 PNG, no alpha (Wave-0 icon.png)
        splashImageUrl: `${base}/splash.png`, // 200x200 (Wave-0 splash.png)
        splashBackgroundColor: SPLASH_BACKGROUND_COLOR,
        // NO signed association proof (D-05) — Phase 10 adds it against the mainnet domain.
        // NO deprecated top-level imageUrl/buttonTitle — embed meta carries them.
      },
    },
    {
      headers: { 'Cache-Control': CACHE_CONTROL },
    },
  );
}
