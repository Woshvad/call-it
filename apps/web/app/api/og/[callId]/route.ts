/**
 * SHARE-10: OG catch-all route — GET /api/og/[callId]
 *
 * Phase 0 ALWAYS returns Fallback. Phase 2 wires Live variant.
 * Phase 4 wires Settled/DuelSettled/CallerExited variants. The fallback-on-error
 * path remains forever as the SHARE-10 contract.
 *
 * Phase progression:
 *   Phase 0: ALWAYS return Fallback (no contract data exists yet)
 *   Phase 2: Attempt subgraph lookup for Live variant; fallback on 404 or error
 *   Phase 4: Add Settled/DuelSettled/CallerExited variants; fallback on any miss
 *   Phase 7: Finalize all 5 variants; domain cutover via NEXT_PUBLIC_OG_BASE_URL
 *
 * The fallback-on-error path (SHARE-10) is permanent — even when all variants are
 * implemented, any lookup failure routes to the Fallback card instead of 404.
 *
 * Security:
 *   - T-00-19: callIds are intentionally public per spec §18.1; no PII in URL
 *   - T-00-20: Cache-Control absorbs crawler bursts
 *   - Pitfall 15: Only display: flex (via renderFallback shared renderer)
 *   - D-04: runtime = 'nodejs' — NOT edge
 */

export const runtime = 'nodejs';

import { type NextRequest } from 'next/server';
import { renderFallback } from '@/lib/og-fallback-render';

/**
 * GET /api/og/[callId]
 *
 * Phase 0: All callIds route to the Fallback render (no subgraph data).
 * Future phases: implement subgraph lookup here, fallback to renderFallback on miss.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ callId: string }> }
) {
  // Resolve callId from dynamic route params
  const { callId } = await params;

  // Extract ?handle=... passthrough — callers may supply a handle hint
  // even when the callId is unknown (useful when sharing before settlement)
  const url = new URL(req.url);
  const handle = (url.searchParams.get('handle') ?? '').slice(0, 32);

  // Phase 0: ALWAYS fall through to Fallback render
  // No subgraph lookup attempted — no contracts deployed yet
  //
  // TODO Phase 2: Add subgraph lookup for Live variant:
  //   const call = await fetchCallFromSubgraph(callId);
  //   if (call && call.status === 'Live') return renderLiveVariant(call);
  //
  // TODO Phase 4: Add Settled/DuelSettled/CallerExited variants:
  //   if (call && call.status === 'Settled') return renderSettledVariant(call);
  //   if (call && call.status === 'DuelSettled') return renderDuelSettledVariant(call);
  //   if (call && call.status === 'CallerExited') return renderCallerExitedVariant(call);
  //
  // On any miss or error, fall through to the Fallback render below (SHARE-10 contract)

  // Suppress unused variable warning for Phase 0
  void callId;

  // D-12: footer brand from env-var
  const footerBrand = process.env['NEXT_PUBLIC_BRAND_FOOTER'] ?? '[BRAND] · Be right in public.';

  const imageResponse = renderFallback({ handle, footerBrand });

  imageResponse.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  imageResponse.headers.set('X-Variant', 'fallback');
  imageResponse.headers.set('X-Reason', 'phase-0-no-subgraph-data');

  return imageResponse;
}
