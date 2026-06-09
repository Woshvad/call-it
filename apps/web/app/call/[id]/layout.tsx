/**
 * /call/[id] layout — Server Component
 *
 * Fetches minimal call metadata to inject og:image meta tag with statusVersion
 * for CDN cache-busting on status transitions (D-09). No 'use client' — pure
 * server-side metadata generation.
 *
 * OG image URL: /og/{callId}?v={statusVersion}
 * statusVersion bumps on: Live→CallerExited→Settled transitions (D-09).
 *
 * Requirements: SHARE-04, D-09
 * Spec: §15.3, §16 (OG card variant 1)
 */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { buildFarcasterEmbeds } from '@/lib/farcaster-embed';
import { getOutcomeWordResult } from '@/lib/outcome-word';

type Props = {
  params: Promise<{ id: string }>;
  children: ReactNode;
};

/**
 * Fetch call metadata from the relayer for OG injection.
 * Returns null on failure — layout renders without OG tag.
 */
type CallMeta = {
  statusVersion: number;
  marketLine: string;
  handle: string;
  // Settled outcome fields (08-05) — only present for a non-Pending settled call.
  // Used to derive the TRUE og:title word so a settled LOSS never titles 'Live Call'
  // (nor a fabricated win). Absent for Live/unknown.
  outcome?: 'CallerWon' | 'CallerLost' | 'Pending';
  repDelta?: number;
  fadeRealShare?: number;
};

async function fetchCallMeta(callId: string): Promise<CallMeta | null> {
  try {
    const relayerUrl =
      process.env['RELAYER_URL'] ?? process.env['NEXT_PUBLIC_RELAYER_URL'] ?? '';
    if (!relayerUrl) return null;

    const res = await fetch(`${relayerUrl}/api/calls/${callId}/live-state`, {
      // Revalidate every 60s — statusVersion bumps on status change (D-09)
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      statusVersion?: number;
      marketLine?: string;
      handle?: string;
      outcome?: string;
      repDelta?: number;
      fadeRealShare?: number;
    };

    // Normalize unknown outcome strings to undefined so the title logic never keys
    // off a phantom value (CORE VALUE — never fabricate a settled word).
    const outcome =
      data.outcome === 'CallerWon' || data.outcome === 'CallerLost' || data.outcome === 'Pending'
        ? data.outcome
        : undefined;

    return {
      statusVersion: data.statusVersion ?? 0,
      marketLine: data.marketLine ?? '',
      handle: data.handle ?? '',
      ...(outcome !== undefined ? { outcome } : {}),
      ...(typeof data.repDelta === 'number' ? { repDelta: data.repDelta } : {}),
      ...(typeof data.fadeRealShare === 'number' ? { fadeRealShare: data.fadeRealShare } : {}),
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const meta = await fetchCallMeta(id);
  const statusVersion = meta?.statusVersion ?? 0;

  // og:title — settled-aware (08-05 GAP 1). For a SETTLED call with a known outcome
  // (CallerWon/CallerLost), prefix the TRUE §15.7 outcome word so the title matches the
  // (already-correct) /og card and the receipt page — e.g. "LOUD AND WRONG — @veda · …".
  // The server has no viewer, so viewerIsWinningFader=false (never 'FADED CORRECTLY').
  // For Live / Pending / unknown outcome, keep the live form — NEVER emit a win word.
  // CORE VALUE: a settled LOSS must not title as "Live Call" nor as a fabricated win.
  const settledWord =
    meta && (meta.outcome === 'CallerWon' || meta.outcome === 'CallerLost')
      ? getOutcomeWordResult({
          callerWon: meta.outcome === 'CallerWon',
          fadeRealShare: meta.fadeRealShare ?? 0,
          repDelta: meta.repDelta ?? 0,
          viewerIsWinningFader: false,
        }).word
      : null;

  const callerPrefix = meta?.handle ? `@${meta.handle} · ` : '';
  const title = settledWord
    ? `${settledWord} — ${callerPrefix}${meta?.marketLine ?? `Call ${id}`} — Call It`
    : meta?.marketLine
      ? `${callerPrefix}${meta.marketLine} — Call It`
      : 'Live Call — Call It';

  const description = 'Track this live call on Call It — real-time follow/fade market, permanent onchain receipt.';

  // OG image URL with statusVersion for CDN cache-busting (D-09)
  // No inline contract addresses — uses callId from route params only
  const ogImageUrl = `/og/${id}?v=${statusVersion}`;

  // Farcaster Mini App embed meta (SHARE-19 SC1, D-03/D-04).
  // Origin is env-derived only (NEXT_PUBLIC_OG_BASE_URL — T-08-02-01 origin-lock;
  // Phase-10 mainnet cutover re-points automatically). The embed reuses the SAME
  // `statusVersion` already fetched above — NO second relayer call (Pitfall 4 /
  // T-08-02-02 — the cast image cannot go stale relative to og:image).
  //
  // WR-02: buildFarcasterEmbeds now REQUIRES a non-empty absolute origin (it throws on
  // an empty/relative baseUrl). Guard here so that a missing NEXT_PUBLIC_OG_BASE_URL
  // omits the fc:miniapp/fc:frame meta (page still renders with og:image) instead of
  // emitting a relative, un-launchable embed at HTTP 200.
  const base = process.env['NEXT_PUBLIC_OG_BASE_URL'];
  const embeds =
    base && /^https?:\/\//i.test(base)
      ? buildFarcasterEmbeds({
          callId: id,
          statusVersion: String(statusVersion),
          baseUrl: base,
        })
      : null;

  return {
    title,
    description,
    // fc:miniapp (primary) + fc:frame (legacy compat) — only action.type differs (D-03).
    // JSON.stringify-escaped; contains only URLs + brand constants, no raw user strings (T-08-02-03).
    // Omitted entirely when the origin is unset (WR-02) — a relative embed is worse than none.
    ...(embeds
      ? {
          other: {
            'fc:miniapp': embeds.miniappEmbed,
            'fc:frame': embeds.frameEmbed,
          },
        }
      : {}),
    openGraph: {
      title,
      description,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function CallLayout({ children }: Props) {
  return <>{children}</>;
}
