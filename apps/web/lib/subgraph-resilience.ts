/**
 * subgraph-resilience.ts — shared, server-only subgraph fetch with retry +
 * bounded last-known-good cache (quick-260614-1co).
 *
 * Factored out of leaderboard-client.ts (quick-260613-we4) so the two settled-
 * receipt OG reads in relayer-client.ts (getSettledFields / getDuelSettledFields)
 * get the SAME resilience the leaderboard already had — the live Studio endpoint
 * flaps ~20% (request 1 = HTTP 521 Cloudflare origin-down, requests 2–5 = 200),
 * so without a retry the first non-ok response silently degrades real settled
 * receipts to em-dashes (D-03 real-data wiring lost during a blip).
 *
 * Behavior:
 *   - retries up to maxAttempts (default 3) on a network error, HTTP 429, any 5xx
 *     (covers the observed Cloudflare 521), or a GraphQL `errors` / no-`data` body;
 *   - a NON-retryable 4xx (any non-ok status other than 429 and not >=500) stops
 *     the loop immediately — no remaining attempts are spent;
 *   - on success it caches `parse(data)` under `cacheKey` in a module-level,
 *     insertion-ordered Map capped at ~256 entries (evict-oldest on overflow);
 *   - EXHAUSTED (all attempts spent OR a non-retryable 4xx) → serve the cached
 *     last-known-good for this cacheKey if present; else call `fallback()` if
 *     provided; else throw the last captured error.
 *
 * D-27: this util takes the subgraph URL as an argument — it introduces NO gateway
 * host literal and NO NEXT_PUBLIC subgraph URL. The key-bearing URL stays in the
 * callers' server-only `SUBGRAPH_URL` env var.
 *
 * Requirements: D-03, D-06, D-27, SHARE-10
 */

/** Options for {@link resilientSubgraphFetch}. */
export interface ResilientSubgraphOptions<T> {
  /** Subgraph endpoint (server-only, key-bearing — supplied by the caller). */
  url: string;
  /** GraphQL query string. */
  query: string;
  /** GraphQL variables. */
  variables: Record<string, unknown>;
  /** Cache key for the last-known-good entry (caller-namespaced, e.g. `settled:42`). */
  cacheKey: string;
  /** Pure transform from `json.data` to the caller's result shape. */
  parse: (data: any) => T;
  /** Optional: produce a safe result when exhausted with no cached value (never-throw contract). */
  fallback?: () => T;
  /** Optional RequestInit extras (spread LAST — e.g. `{ cache: 'no-store' }`). */
  fetchInit?: RequestInit;
  /** Max attempts on a transient failure. Default 3. */
  maxAttempts?: number;
}

/** Module-level bounded last-known-good cache (insertion-ordered, evict-oldest). */
const CACHE_CAP = 256;
const cache = new Map<string, unknown>();

/**
 * Backoff between retry attempts. 0ms under test (vitest sets NODE_ENV='test')
 * so the suite stays fast; ~250ms→500ms in prod to ride out a Cloudflare flap.
 * Mirrors the helper that previously lived in leaderboard-client.ts.
 */
function backoffMs(attempt: number): number {
  if (process.env['NODE_ENV'] === 'test') return 0;
  return attempt === 1 ? 250 : 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Insert into the bounded cache, evicting the oldest entry on overflow. */
function cacheSet(key: string, value: unknown): void {
  if (!cache.has(key) && cache.size >= CACHE_CAP) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

/**
 * Resilient POST to a subgraph endpoint with retry + last-known-good fallback.
 * See module doc for the full retry/exhausted contract.
 */
export async function resilientSubgraphFetch<T>(opts: ResilientSubgraphOptions<T>): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  let lastError: Error = new Error('Subgraph request failed');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(opts.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: opts.query, variables: opts.variables }),
        // Spread fetchInit LAST so callers can add e.g. cache:'no-store'.
        ...opts.fetchInit,
      });

      if (!res.ok) {
        // Retryable transport failure: 429 (rate limit) or any 5xx (incl. 521).
        if (res.status === 429 || res.status >= 500) {
          lastError = new Error(`Subgraph request failed: ${res.status}`);
          if (attempt < maxAttempts) await sleep(backoffMs(attempt));
          continue;
        }
        // Non-retryable client error (4xx other than 429) — stop immediately.
        lastError = new Error(`Subgraph request failed: ${res.status}`);
        break;
      }

      const json = (await res.json()) as { data?: unknown; errors?: unknown };

      // GraphQL errors / missing data — treat as a retryable attempt.
      if (json.errors || !json.data) {
        lastError = new Error('Subgraph returned errors');
        if (attempt < maxAttempts) await sleep(backoffMs(attempt));
        continue;
      }

      const result = opts.parse(json.data);
      cacheSet(opts.cacheKey, result); // prime last-known-good before returning
      return result;
    } catch (err) {
      // Network error (fetch threw) — retryable.
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts) await sleep(backoffMs(attempt));
      continue;
    }
  }

  // EXHAUSTED: cache → fallback → throw.
  if (cache.has(opts.cacheKey)) return cache.get(opts.cacheKey) as T;
  if (opts.fallback) return opts.fallback();
  throw lastError;
}

/** Test-only: clear the module-level last-known-good cache. */
export function __resetSubgraphCache(): void {
  cache.clear();
}
