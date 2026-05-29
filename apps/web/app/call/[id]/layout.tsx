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

  return {
    title,
    description,
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
