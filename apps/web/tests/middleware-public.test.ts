/**
 * SC1c — middleware public-route predicate covers the Farcaster surfaces.
 *
 * Unlike the other three Wave-0 scaffolds, this one is GREEN in Wave 0: the
 * '/.well-known' carve-out lands in THIS plan (Task 1), so the behavior it asserts
 * exists now. It is the unit proof for T-08-01-01 (a logged-out Farcaster crawler
 * reaching /.well-known/farcaster.json is NOT bounced to /signin) and for the
 * /api/frame/* path being public (covered by the existing '/api' prefix — D-05).
 *
 * `isPublicRoute` is not exported from middleware.ts (it is a module-internal helper),
 * so this test re-declares the SAME prefix-list predicate and additionally asserts the
 * middleware source actually contains the '/.well-known' prefix — keeping the assertion
 * behavioral and source-anchored without a middleware refactor.
 *
 * Requirements: SHARE-19 (SC1c).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Mirror of middleware.ts isPublicRoute(): a path is public iff it startsWith one of
 * the PUBLIC_PREFIXES. WR-03: the blanket '/api' prefix was replaced with the explicit
 * public API prefixes ('/api/frame', '/api/og') so a generic future '/api/*' route is
 * NOT auto-public. We re-declare the same explicit prefixes here.
 */
const FARCASTER_PUBLIC_PREFIXES = ['/.well-known', '/api/frame', '/api/og', '/og'];

function isPublicRoute(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname.startsWith(p));
}

describe('SC1c — middleware public carve-out for Farcaster surfaces', () => {
  it('treats /.well-known/farcaster.json as public', () => {
    expect(isPublicRoute('/.well-known/farcaster.json', FARCASTER_PUBLIC_PREFIXES)).toBe(true);
  });

  it('treats /api/frame/tx/1 as public (explicit /api/frame prefix)', () => {
    expect(isPublicRoute('/api/frame/tx/1', FARCASTER_PUBLIC_PREFIXES)).toBe(true);
  });

  it('the middleware source carries the /.well-known prefix and the explicit /api/frame prefix', () => {
    const src = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf-8');
    expect(src).toContain("'/.well-known'");
    expect(src).toContain("'/api/frame'");
  });

  it('WR-03: a generic future /api/* route is NOT made public (no blanket /api prefix)', () => {
    // The blanket '/api' would have auto-published these — now they stay gated.
    expect(isPublicRoute('/api/me', FARCASTER_PUBLIC_PREFIXES)).toBe(false);
    expect(isPublicRoute('/api/admin', FARCASTER_PUBLIC_PREFIXES)).toBe(false);
    // And the middleware source must NOT carry a standalone blanket '/api' entry.
    const src = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf-8');
    expect(src).not.toContain("\n  '/api',");
  });

  it('an authenticated-only action page is NOT made public by these prefixes', () => {
    // sanity: the carve-out must not over-match (e.g. /new, /settings stay gated)
    expect(isPublicRoute('/new', FARCASTER_PUBLIC_PREFIXES)).toBe(false);
    expect(isPublicRoute('/settings', FARCASTER_PUBLIC_PREFIXES)).toBe(false);
  });
});

/**
 * Root-served public/ assets (quick-260612 fix): public-folder files serve at the
 * ROOT URL (/icon.png), not under /public/, so the matcher's `public/` exclusion
 * never matches them — they MUST be explicit PUBLIC_PREFIXES entries or the
 * Farcaster crawler's unauthenticated fetches of the manifest's iconUrl /
 * splashImageUrl 307-bounce to /signin (verified live on Vercel 2026-06-12).
 */
const STATIC_ASSET_PREFIXES = ['/icon.png', '/splash.png', '/brand/'];

describe('root-served public assets are explicit public prefixes', () => {
  it('treats the Farcaster manifest images as public', () => {
    expect(isPublicRoute('/icon.png', STATIC_ASSET_PREFIXES)).toBe(true);
    expect(isPublicRoute('/splash.png', STATIC_ASSET_PREFIXES)).toBe(true);
  });

  it('treats brand-dir assets as public', () => {
    expect(isPublicRoute('/brand/callit-mark.png', STATIC_ASSET_PREFIXES)).toBe(true);
  });

  it('the trailing-slash /brand/ entry does NOT auto-publish a future /branding page (WR-03)', () => {
    expect(isPublicRoute('/branding', STATIC_ASSET_PREFIXES)).toBe(false);
  });

  it('the middleware source carries the exact entries', () => {
    const src = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf-8');
    expect(src).toContain("'/icon.png'");
    expect(src).toContain("'/splash.png'");
    expect(src).toContain("'/brand/'");
  });
});
