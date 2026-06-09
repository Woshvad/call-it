/**
 * Farcaster Mini App embed builder (SHARE-19 SC1a/SC3, D-03).
 *
 * Pure: no env reads, no fetch. The caller passes `baseUrl` (origin derived from
 * NEXT_PUBLIC_OG_BASE_URL in layout.tsx — origin-locked, T-08-02-01), `callId`,
 * and the SAME `statusVersion` already fetched for og:image (Pitfall 4 / T-08-02-02 —
 * the cast image never goes stale relative to og:image because both share statusVersion).
 *
 * Returns BOTH the modern `fc:miniapp` embed (primary) and the legacy `fc:frame`
 * embed (compat, D-03). The ONLY field that differs between them is
 * `button.action.type` (`launch_miniapp` vs `launch_frame`).
 *
 * Both are returned as JSON strings ready to drop into generateMetadata().other.
 * The embed contains ONLY URLs + brand constants — never a raw user string
 * (handle/statement) — so JSON.stringify escaping is sufficient (T-08-02-03).
 *
 * Shape verified against the live spec 2026-06-08 (08-RESEARCH Pattern 1):
 *   miniapps.farcaster.xyz/docs/guides/sharing
 *
 * Requirements: SHARE-19 (SC1a / SC3).
 */

/** Brand splash background (CLAUDE.md color token). */
const SPLASH_BACKGROUND_COLOR = '#09090E';
/** Embed button label — must be ≤32 chars. */
const BUTTON_TITLE = 'View on Call It';
/** Mini App display name — ≤32 chars. */
const APP_NAME = 'Call It';

export type FarcasterEmbedAction = {
  type: 'launch_miniapp' | 'launch_frame';
  url: string;
  name: string;
  splashImageUrl: string;
  splashBackgroundColor: string;
};

export type FarcasterEmbed = {
  version: '1';
  imageUrl: string;
  button: {
    title: string;
    action: FarcasterEmbedAction;
  };
};

export type BuildFarcasterEmbedsArgs = {
  /** The on-chain call id (route param). */
  callId: string;
  /** The SAME statusVersion already fetched for og:image (Pitfall 4). */
  statusVersion: string | number;
  /** Absolute origin, derived from NEXT_PUBLIC_OG_BASE_URL (no trailing slash). */
  baseUrl: string;
};

export type FarcasterEmbeds = {
  /** JSON.stringify of the fc:miniapp embed (primary). */
  miniappEmbed: string;
  /** JSON.stringify of the fc:frame embed (legacy compat, D-03). */
  frameEmbed: string;
};

/**
 * Build the `{ miniappEmbed, frameEmbed }` JSON strings for the receipt page head.
 * Pure — derives everything from the passed args; no env, no fetch.
 */
export function buildFarcasterEmbeds({
  callId,
  statusVersion,
  baseUrl,
}: BuildFarcasterEmbedsArgs): FarcasterEmbeds {
  // WR-02: the builder stays pure (no env reads) but MUST refuse an empty/relative
  // origin. A Farcaster embed's imageUrl / action.url have to be absolute URLs the
  // client can launch; an empty baseUrl would silently yield relative `/og/...` /
  // `/call/...` strings that fail at HTTP 200. Validate the caller's contract here so
  // the failure is loud at the call site rather than shipped in a broken embed.
  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
    throw new Error(
      'buildFarcasterEmbeds: baseUrl must be a non-empty absolute http(s) origin',
    );
  }
  // Embed image reuses the unchanged Phase-7 OG card at the SAME statusVersion as
  // og:image (criterion 3 visual continuity, Pitfall 4 / T-08-02-02). Absolute URL,
  // ≤1024 chars. 1200x630 = exactly 3:2 ✓ (embed-image constraint).
  const imageUrl = `${baseUrl}/og/${callId}?v=${statusVersion}`;
  // Launch target is the receipt page itself.
  const launchUrl = `${baseUrl}/call/${callId}`;
  // Splash asset — 200x200 PNG (Wave-0 splash.png), origin-locked.
  const splashImageUrl = `${baseUrl}/splash.png`;

  const miniapp: FarcasterEmbed = {
    version: '1',
    imageUrl,
    button: {
      title: BUTTON_TITLE,
      action: {
        type: 'launch_miniapp',
        url: launchUrl,
        name: APP_NAME,
        splashImageUrl,
        splashBackgroundColor: SPLASH_BACKGROUND_COLOR,
      },
    },
  };

  // Legacy fc:frame embed — IDENTICAL except button.action.type (D-03).
  const frame: FarcasterEmbed = {
    ...miniapp,
    button: {
      ...miniapp.button,
      action: {
        ...miniapp.button.action,
        type: 'launch_frame',
      },
    },
  };

  return {
    miniappEmbed: JSON.stringify(miniapp),
    frameEmbed: JSON.stringify(frame),
  };
}
