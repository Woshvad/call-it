/**
 * og-host.ts — OG-card footer host allowlisting (quick-260611-5mh WR-07).
 *
 * The OG routes' footer-brand fallback previously reflected the RAW request
 * Host header (`url.host`) into the rendered card. A spoofed Host header on a
 * CDN cache-miss request could place arbitrary text in the card footer
 * ("evil.example · Be right in public.") and get cached for other viewers.
 * Satori renders text nodes only (no HTML → not XSS), but reflected header
 * content in a shareable, cacheable artifact is still spoofing.
 *
 * Fix: the request host is trusted ONLY when its hostname matches a known-host
 * allowlist (the live Vercel deploy + local dev). Anything else degrades to
 * the canonical deploy literal. The env var (NEXT_PUBLIC_BRAND_FOOTER) still
 * wins over all of this at the call sites.
 */

/** Canonical deploy literal — used whenever the request host is not allowlisted. */
export const OG_FALLBACK_HOST = 'call-it-web-sepolia.vercel.app';

/** Hostnames (no port) whose Host header we trust in the OG footer. */
const OG_ALLOWED_HOSTNAMES: ReadonlySet<string> = new Set([
  'call-it-web-sepolia.vercel.app',
  'localhost',
  '127.0.0.1',
]);

/**
 * Resolve the footer host for an OG card from the request's `url.host`.
 * Returns the request host verbatim (lowercased, port preserved — useful for
 * `localhost:3000`) when its hostname is allowlisted; otherwise the fixed
 * OG_FALLBACK_HOST literal. Never reflects arbitrary header content (WR-07).
 */
export function resolveOgFooterHost(rawHost: string | null | undefined): string {
  if (!rawHost) return OG_FALLBACK_HOST;
  const host = rawHost.trim().toLowerCase();
  const hostname = host.split(':')[0] ?? '';
  return OG_ALLOWED_HOSTNAMES.has(hostname) ? host : OG_FALLBACK_HOST;
}
