/**
 * SHARE-09: Fallback OG card route — GET /api/og/fallback?handle=...
 *
 * Renders the §16.6 Fallback card ("A CALL WAS MADE") when a real receipt URL
 * 404s, the settled image hasn't regenerated, or the OG service is fully down.
 *
 * Design contract (§16.6):
 *   - 1200×630px, #09090E background, 3px #E8F542 border
 *   - 4 corner brackets (24×24, 4px border)
 *   - CALL IT wordmark: Syne 48px, #E8F542
 *   - "A CALL WAS MADE": Syne 64px, #F1F5F9, 5% left margin asymmetric hero
 *   - "by @{handle}": SpaceGrotesk 28px, #94A3B8 (defaults to "someone")
 *   - Subtext: SpaceGrotesk 18px
 *   - Footer brand: env-var NEXT_PUBLIC_BRAND_FOOTER (D-12 — domain literal forbidden, see CONTEXT.md)
 *   - ⬢ ARBITRUM: JetBrainsMono 12px
 *
 * Security:
 *   - T-00-18: handle bounded to 32 chars; JSX escapes prevent XSS
 *   - T-00-20: Cache-Control absorbs crawler bursts via Vercel Edge Network
 *   - T-00-26: ESLint no-display-grid rule enforced on this file
 *
 * Pitfalls mitigated:
 *   - Pitfall 15: Only display: flex — Satori does NOT support display: grid
 *   - Pitfall E: ZERO NEXT_PUBLIC_* except NEXT_PUBLIC_BRAND_FOOTER (D-12 single exception)
 *   - Pitfall F: Fonts loaded from app/fonts/ at module init (not inside GET handler)
 *   - D-04: runtime = 'nodejs' — NOT edge (resvg-wasm bundling on edge is broken)
 *   - D-12: footerBrand constructed from env-var; domain literal forbidden (see CONTEXT.md §D-12)
 */

export const runtime = 'nodejs';

import { type NextRequest } from 'next/server';
import { renderFallback } from '@/lib/og-fallback-render';

/**
 * GET /api/og/fallback
 * Query params: ?handle=<twitter_or_farcaster_handle> (optional, max 32 chars)
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  // T-00-18: bound handle input to 32 chars (worst case: garbled text in PNG, no XSS)
  const handle = (url.searchParams.get('handle') ?? '').slice(0, 32);

  // D-12: footer brand from env-var; domain literal forbidden in this file (see CONTEXT.md §D-12)
  const footerBrand = process.env['NEXT_PUBLIC_BRAND_FOOTER'] ?? '[BRAND] · Be right in public.';

  const imageResponse = renderFallback({ handle, footerBrand });

  // T-00-20: Cache-Control absorbs social crawler bursts via Vercel Edge Network CDN
  // X-Variant: downstream debugging header
  imageResponse.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  imageResponse.headers.set('X-Variant', 'fallback');

  return imageResponse;
}
