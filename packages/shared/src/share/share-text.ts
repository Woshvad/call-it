/**
 * share-text.ts — pure, dependency-free share-intent URL + text builders.
 *
 * SHARE-15 (Twitter intent) / SHARE-18 (Warpcast cast) — D-02.
 *
 * SINGLE SOURCE (07-01 decision, 07-04 Rule-3 relocation): these pure builders
 * live in @call-it/shared so BOTH `apps/web` (Share button, Plan 07-05) and
 * `apps/relayer` (auto-post worker, Plan 07-04) import the exact same logic. The
 * web module apps/web/lib/share-text.ts re-exports from here; the relayer imports
 * directly from @call-it/shared (it cannot import across the apps/web project
 * boundary under its composite tsconfig rootDir).
 *
 * PURITY CONTRACT (T-07-01-02): these builders MUST stay pure — no environment
 * reads, no network calls, no secrets. The X write token lives ONLY in the relayer
 * (Plan 07-04); it never passes through this module. Untrusted statement strings
 * are URL-encoded.
 *
 * Farcaster compose-intent URL shape: `farcaster.xyz/~/compose?text=…&embeds[]=…`
 * (Open Q3, verified live 2026-06-08). The legacy `warpcast.com/~/compose` host now
 * 301-redirects to `farcaster.xyz/~/compose` (Warpcast → Farcaster rebrand); the path
 * and `?text=…&embeds[]=…` query shape are preserved across the migration. Pointing
 * directly at the canonical `farcaster.xyz` host avoids the redirect hop. Phase 7 only
 * CONSTRUCTS the cast URL (D-02); programmatically landing the cast is Phase 8 (Mini App).
 */

/** Twitter web-intent share URL (SHARE-15). Both args are URL-encoded. */
export function twitterIntentUrl(receiptUrl: string, text: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(receiptUrl)}`;
}

/**
 * Warpcast compose-intent share URL (SHARE-18). Both args are URL-encoded.
 * `embeds[]=receiptUrl` renders the OG card as a cast embed.
 */
export function warpcastComposeUrl(receiptUrl: string, text: string): string {
  return `https://farcaster.xyz/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(receiptUrl)}`;
}

export interface ShareTextInput {
  /** Settled outcome word, e.g. "CALLED IT" / "LOUD AND WRONG" (D-08). */
  outcomeWord: string;
  /**
   * Caller handle (with or without leading @). OPTIONAL — when absent, empty,
   * or not a REAL handle (a 0x wallet address / truncated address is NOT a
   * handle), the @segment is OMITTED entirely (quick-260611-5mh C3: share text
   * must never emit "@undefined" / "@0x1234…" / "@call #14" style fakes).
   */
  handle?: string;
  /** Human-readable market statement (the D-03 subgraph Call.statement). */
  statement?: string;
}

/** Twitter's hard post limit; we keep the constructed text safely within it. */
const MAX_SHARE_TEXT = 240;

/**
 * True only for a REAL social handle. Addresses (0x…), truncated addresses
 * (0x12…abcd), empty strings, stringified absent values, '#'-prefixed
 * pseudo-handles ('#14' call-id fallbacks — WR-06), and purely-numeric
 * fallbacks are NOT handles — mentioning them would tag nothing (or a fake
 * account) on X/Farcaster.
 */
export function isRealHandle(handle?: string | null): boolean {
  if (!handle) return false;
  // WR-06: strip leading @/# prefixes (same cleaning as avatarInitial — IN-03)
  // so a '#14' call-id fallback can never become "@#14" in a shared post.
  const h = handle.trim().replace(/^[@#]+/, '');
  if (h.length === 0) return false;
  if (/^0x/i.test(h)) return false; // wallet address or truncated address alias
  if (/^\d+$/.test(h)) return false; // WR-06: purely-numeric fallback (call id), not a handle
  if (h === 'undefined' || h === 'null') return false;
  return true;
}

/**
 * Build the public post text for a settled receipt (D-02). Returns a non-empty
 * string ≤ 240 chars that always contains the outcome word. The statement is
 * truncated (with an ellipsis) before the limit is reached so the outcome word
 * and handle are never dropped. When no REAL handle exists the @segment is
 * omitted (never "@undefined" / "@0x1234…").
 */
export function buildShareText({ outcomeWord, handle, statement }: ShareTextInput): string {
  const head = isRealHandle(handle)
    ? `${outcomeWord} — ${handle!.trim().startsWith('@') ? handle!.trim() : `@${handle!.trim()}`}`
    : outcomeWord;

  if (!statement || statement.trim().length === 0) {
    return head.slice(0, MAX_SHARE_TEXT);
  }

  const sep = ': ';
  const budget = MAX_SHARE_TEXT - head.length - sep.length;
  if (budget <= 1) {
    // No room for the statement — keep the outcome word + handle.
    return head.slice(0, MAX_SHARE_TEXT);
  }

  const trimmed = statement.trim();
  const body = trimmed.length <= budget ? trimmed : `${trimmed.slice(0, budget - 1)}…`;
  return `${head}${sep}${body}`;
}
