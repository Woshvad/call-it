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

type Props = {
  params: Promise<{ id: string }>;
  children: ReactNode;
};

/**
 * Fetch call metadata from the relayer for OG injection.
 * Returns null on failure — layout renders without OG tag.
 */
async function fetchCallMeta(
  callId: string,
): Promise<{ statusVersion: number; marketLine: string; handle: string } | null> {
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
    };

    return {
      statusVersion: data.statusVersion ?? 0,
      marketLine: data.marketLine ?? '',
      handle: data.handle ?? '',
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const meta = await fetchCallMeta(id);
  const statusVersion = meta?.statusVersion ?? 0;

  const title = meta?.marketLine
    ? `${meta.handle ? `@${meta.handle} · ` : ''}${meta.marketLine} — Call It`
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
