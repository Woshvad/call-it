/**
 * VerifiedBadge — reusable VERIFIED · X / · FC / · X · FC badge (AUTH-09)
 *
 * Presentational only. Derives a combined VERIFIED label from the two social
 * link flags and reuses the neobrutalist `Tag` primitive (intent="warning" =
 * brand-accent #E8F542). Returns `null` when neither flag is set so callers can
 * unconditionally drop it next to a handle.
 *
 * Data source (no fetch here — flags are supplied by the caller):
 *   - lists/feed:   subgraph Profile.twitterHandle / farcasterHandle (Phase 1)
 *   - single page:  /api/profile → { verifiedX, verifiedFc } (enriched 01.5-02)
 *
 * FLEXBOX ONLY — Tag is inline-flex (NEVER grid). This is load-bearing for
 * Satori/OG rendering (Pitfall 15). Do not introduce display:grid here or in
 * any surface that renders this badge.
 *
 * AUTH-10 / D-09: verification is purely cosmetic. These flags MUST NOT reach
 * any rep / stake-limit / fee / payout code path — enforced by the
 * zero-mechanical-effect parity test.
 *
 * @example
 *   <VerifiedBadge verifiedX verifiedFc />   // "VERIFIED · X · FC"
 *   <VerifiedBadge verifiedX />              // "VERIFIED · X"
 *   <VerifiedBadge />                        // null
 */
import React from 'react';
import { Tag } from './Tag';

export type VerifiedBadgeProps = {
  /** X (Twitter) link verified — from subgraph twitterHandle / api verifiedX */
  verifiedX?: boolean;
  /** Farcaster link verified — from subgraph farcasterHandle / api verifiedFc */
  verifiedFc?: boolean;
  /** Optional extra classes forwarded to the underlying Tag */
  className?: string;
};

/**
 * VerifiedBadgeHost — the minimal AUTH-09 badge-host seam (D-07).
 *
 * Surfaces that show a caller handle spread this into their data type so a
 * <VerifiedBadge> can render next to the handle. The full Duel page (Phase 3)
 * and Leaderboard page (Phase 7) are out of scope here — this type is the prop
 * seam those pages will populate. ProfileHeaderUser, CallCardData, and
 * ReceiptData already carry these fields inline; this type is the shared
 * contract for not-yet-built surfaces.
 */
export type VerifiedBadgeHost = {
  /** AUTH-09 badge host — full Duel page Phase 3 / Leaderboard page Phase 7 */
  verifiedX?: boolean;
  /** AUTH-09 badge host — full Duel page Phase 3 / Leaderboard page Phase 7 */
  verifiedFc?: boolean;
};

export function VerifiedBadge({ verifiedX, verifiedFc, className }: VerifiedBadgeProps): React.JSX.Element | null {
  if (!verifiedX && !verifiedFc) return null;

  const label =
    verifiedX && verifiedFc
      ? 'VERIFIED · X · FC'
      : verifiedX
        ? 'VERIFIED · X'
        : 'VERIFIED · FC';

  return (
    <Tag intent="warning" data-testid="verified-badge" className={className}>
      {label}
    </Tag>
  );
}
