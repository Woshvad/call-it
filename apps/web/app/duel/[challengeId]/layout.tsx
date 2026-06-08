/**
 * /duel/[challengeId] layout — Server Component
 *
 * Injects the summary_large_image OG/Twitter card for shared duel receipts
 * (§16 OG card variant 4 — DuelSettled). The duel page.tsx is 'use client' and
 * emits no metadata, so without this layout Next.js falls back to a tiny
 * <meta name="twitter:card" content="summary"> with no image. A server layout +
 * client page compose fine. No 'use client' here — pure server-side metadata.
 *
 * OG image URL: /og/duel/{challengeId}?v={statusVersion}
 * statusVersion bumps on: Proposed→Accepted→Settled transitions (D-09).
 *   The relayer duel endpoint returns a STRING status label, not a numeric
 *   statusVersion (per duel-live-state.ts DuelLiveStateResponse), so the label
 *   is mapped to an ordinal here for the CDN cache-buster.
 *
 * Requirements: SHARE-07, SOCIAL-51, D-09
 */

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

type Props = {
  params: Promise<{ challengeId: string }>;
  children: ReactNode;
};

/**
 * Duel status label → ordinal map (mirrors ChallengeEscrow ChallengeStatus enum
 * and the relayer's CHALLENGE_STATUS_LABELS). The ordinal is the D-09 ?v=
 * cache-buster: it bumps the CDN key as the duel transitions.
 */
const DUEL_STATUS_ORDINALS: Record<string, number> = {
  Proposed: 0,
  Accepted: 1,
  Rejected: 2,
  Refunded: 3,
  Settled: 4,
};

/**
 * Fetch the duel status from the relayer and map it to an ordinal for OG
 * cache-busting. Returns null on failure — caller falls back to v=0 + a
 * generic title.
 */
async function fetchDuelStatusVersion(
  challengeId: string,
): Promise<{ statusVersion: number } | null> {
  try {
    const relayerUrl =
      process.env['RELAYER_URL'] ?? process.env['NEXT_PUBLIC_RELAYER_URL'] ?? '';
    if (!relayerUrl) return null;

    const res = await fetch(`${relayerUrl}/api/duels/${challengeId}/live-state`, {
      // Revalidate every 60s — status ordinal bumps on transitions (D-09)
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;

    // The duel endpoint returns a STRING status label, NOT a numeric statusVersion.
    const data = (await res.json()) as { status?: string };
    const statusVersion = data.status
      ? DUEL_STATUS_ORDINALS[data.status] ?? 0
      : 0;

    return { statusVersion };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { challengeId } = await params;
  const meta = await fetchDuelStatusVersion(challengeId);
  const statusVersion = meta?.statusVersion ?? 0;

  // No marketLine is available from the duel endpoint; fall back to a generic
  // title when the relayer fetch failed (meta === null).
  const title = meta ? `Duel #${challengeId} — Call It` : 'Duel — Call It';

  const description =
    'A 1v1 challenge on Call It — winner takes the pot, permanent onchain receipt.';

  // OG image URL with status ordinal for CDN cache-busting (D-09).
  // Relative URL is intentional (Vercel injects the deployment origin as the
  // metadataBase fallback; confirmed working on /call/[id]). No inline contract
  // address, RPC key, or origin host — uses challengeId from route params only.
  const ogImageUrl = `/og/duel/${challengeId}?v=${statusVersion}`;

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

export default async function DuelLayout({ children }: Props) {
  return <>{children}</>;
}
