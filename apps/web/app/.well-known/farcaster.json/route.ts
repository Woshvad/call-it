/**
 * Farcaster Mini App manifest — GET /.well-known/farcaster.json (SHARE-19 SC1b, D-05).
 *
 * Body-only manifest sufficient for feed embed render. The signed domain-ownership
 * proof (a proof, NOT a secret) gates addMiniApp / discoverability / notifications —
 * NOT feed embed render. Originally deferred to Phase 10 (D-01/D-04/D-05); the
 * callitlive.app domain go-live (user decision 2026-06-12) supersedes that deferral:
 * when the three FARCASTER_ACCOUNT_ASSOCIATION_* env vars are set (signed via the
 * Farcaster manifest tool for the canonical domain), the accountAssociation block is
 * emitted; when unset, the manifest stays body-only exactly as before.
 * (T-08-02-04 still holds: the association is public display config, no secrets.)
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
  // WR-01: a manifest MUST carry absolute URLs. If NEXT_PUBLIC_OG_BASE_URL is unset the
  // homeUrl/iconUrl/splashImageUrl would be empty/relative and the Farcaster crawler
  // (which fetches this out-of-band) cannot resolve them — the Mini App silently fails
  // to render. Fail loud with 503 instead of emitting a broken manifest at HTTP 200.
  const base = process.env['NEXT_PUBLIC_OG_BASE_URL'];
  if (!base) {
    return new Response('manifest unavailable: NEXT_PUBLIC_OG_BASE_URL unset', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  // Signed domain-ownership proof (top-level sibling of `miniapp` per the spec).
  // Emitted ONLY when all three parts are present — a partial set would be an
  // invalid association, so it degrades to the unsigned manifest instead.
  const aaHeader = process.env['FARCASTER_ACCOUNT_ASSOCIATION_HEADER'];
  const aaPayload = process.env['FARCASTER_ACCOUNT_ASSOCIATION_PAYLOAD'];
  const aaSignature = process.env['FARCASTER_ACCOUNT_ASSOCIATION_SIGNATURE'];
  const accountAssociation =
    aaHeader && aaPayload && aaSignature
      ? { header: aaHeader, payload: aaPayload, signature: aaSignature }
      : undefined;

  return Response.json(
    {
      ...(accountAssociation ? { accountAssociation } : {}),
      miniapp: {
        version: '1',
        name: APP_NAME,
        homeUrl: base,
        iconUrl: `${base}/icon.png`, // 1024x1024 PNG, no alpha (Wave-0 icon.png)
        splashImageUrl: `${base}/splash.png`, // 200x200 (Wave-0 splash.png)
        splashBackgroundColor: SPLASH_BACKGROUND_COLOR,
        // NO deprecated top-level imageUrl/buttonTitle — embed meta carries them.
      },
    },
    {
      headers: { 'Cache-Control': CACHE_CONTROL },
    },
  );
}
