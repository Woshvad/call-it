/**
 * share-text.ts — pure, dependency-free share-intent URL + text builders.
 *
 * SHARE-15 (Twitter intent) / SHARE-18 (Warpcast cast) — D-02.
 *
 * PURITY CONTRACT (T-07-01-02): these builders MUST stay pure — no environment
 * reads, no network calls, no secrets. The X write token lives ONLY in the relayer (Plan 07-04);
 * it never passes through this module. Untrusted statement strings are URL-encoded.
 * Purity is what lets BOTH `apps/web` (Share button, Plan 07-05) and `apps/relayer`
 * (auto-post worker, Plan 07-04) import the same logic.
 *
 * [ASSUMED] Warpcast compose-intent URL shape: `warpcast.com/~/compose?text=…&embeds[]=…`
 * (07-RESEARCH A3). Warpcast intent URLs have changed historically — verify against
 * current Farcaster docs when X/FC keys are budgeted. Phase 7 only CONSTRUCTS the
 * cast URL (D-02); programmatically landing the cast is Phase 8 (Mini App).
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
  return `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(receiptUrl)}`;
}

export interface ShareTextInput {
  /** Settled outcome word, e.g. "CALLED IT" / "LOUD AND WRONG" (D-08). */
  outcomeWord: string;
  /** Caller handle (with or without leading @). */
  handle: string;
  /** Human-readable market statement (the D-03 subgraph Call.statement). */
  statement?: string;
}

/** Twitter's hard post limit; we keep the constructed text safely within it. */
const MAX_SHARE_TEXT = 240;

/**
 * Build the public post text for a settled receipt (D-02). Returns a non-empty
 * string ≤ 240 chars that always contains the outcome word. The statement is
 * truncated (with an ellipsis) before the limit is reached so the outcome word
 * and handle are never dropped.
 */
export function buildShareText({ outcomeWord, handle, statement }: ShareTextInput): string {
  const at = handle.startsWith('@') ? handle : `@${handle}`;
  const head = `${outcomeWord} — ${at}`;

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
