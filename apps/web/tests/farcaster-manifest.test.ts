/**
 * RED scaffold (Wave 0) — SC1b: Farcaster Mini App manifest schema.
 *
 * Target (Plan 02, GREEN):
 *   apps/web/app/.well-known/farcaster.json/route.ts  (GET, runtime nodejs, public)
 *
 * Asserted behavior (D-05, Pitfall 5):
 *   - GET returns 200 + JSON
 *   - body.miniapp.version === '1'
 *   - body.miniapp has non-empty name, homeUrl, iconUrl
 *   - body has NO top-level `accountAssociation` key (signed association deferred to Phase 10)
 *
 * FORM: lazy dynamic import of the route handler inside the test body. The route does
 * not exist yet (Plan 02 builds it), so the import REJECTS → the test FAILS (RED)
 * without a collection-time crash. Flips GREEN when the manifest route lands.
 *
 * Requirements: SHARE-19 (SC1b).
 */

import { describe, it, expect, afterEach } from 'vitest';

const OG_BASE = 'https://callit.app';

describe('SC1b — /.well-known/farcaster.json manifest schema', () => {
  const prevBase = process.env['NEXT_PUBLIC_OG_BASE_URL'];

  afterEach(() => {
    if (prevBase === undefined) delete process.env['NEXT_PUBLIC_OG_BASE_URL'];
    else process.env['NEXT_PUBLIC_OG_BASE_URL'] = prevBase;
  });

  it('GET returns 200 with absolute-URL miniapp object and NO accountAssociation', async () => {
    // WR-01: the manifest requires an absolute origin — provide it.
    process.env['NEXT_PUBLIC_OG_BASE_URL'] = OG_BASE;
    const route = await import('../app/.well-known/farcaster.json/route.js');
    expect(typeof route.GET).toBe('function');

    const res = await route.GET();
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    const miniapp = body['miniapp'] as Record<string, unknown> | undefined;
    expect(miniapp).toBeDefined();
    expect(miniapp?.['version']).toBe('1');
    expect(typeof miniapp?.['name']).toBe('string');
    expect((miniapp?.['name'] as string).length).toBeGreaterThan(0);
    // Absolute URLs (WR-01): homeUrl is the origin; iconUrl is origin-prefixed.
    expect(miniapp?.['homeUrl']).toBe(OG_BASE);
    expect(miniapp?.['iconUrl']).toBe(`${OG_BASE}/icon.png`);

    // D-05: signed accountAssociation is a Phase-10 (mainnet domain) artifact.
    expect(body['accountAssociation']).toBeUndefined();
  });

  it('WR-01: GET returns 503 (not a broken 200) when NEXT_PUBLIC_OG_BASE_URL is unset', async () => {
    delete process.env['NEXT_PUBLIC_OG_BASE_URL'];
    const route = await import('../app/.well-known/farcaster.json/route.js');
    const res = await route.GET();
    expect(res.status).toBe(503);
  });
});
