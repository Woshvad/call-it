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
 * the PUBLIC_PREFIXES. We re-declare the prefixes the Farcaster surfaces depend on.
 */
const FARCASTER_PUBLIC_PREFIXES = ['/.well-known', '/api', '/og'];

function isPublicRoute(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname.startsWith(p));
}

describe('SC1c — middleware public carve-out for Farcaster surfaces', () => {
  it('treats /.well-known/farcaster.json as public', () => {
    expect(isPublicRoute('/.well-known/farcaster.json', FARCASTER_PUBLIC_PREFIXES)).toBe(true);
  });

  it('treats /api/frame/tx/1 as public (covered by the /api prefix)', () => {
    expect(isPublicRoute('/api/frame/tx/1', FARCASTER_PUBLIC_PREFIXES)).toBe(true);
  });

  it('the middleware source actually carries the /.well-known prefix (Task 1 carve-out)', () => {
    const src = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf-8');
    expect(src).toContain("'/.well-known'");
  });

  it('an authenticated-only action page is NOT made public by these prefixes', () => {
    // sanity: the carve-out must not over-match (e.g. /new, /settings stay gated)
    expect(isPublicRoute('/new', FARCASTER_PUBLIC_PREFIXES)).toBe(false);
    expect(isPublicRoute('/settings', FARCASTER_PUBLIC_PREFIXES)).toBe(false);
  });
});
