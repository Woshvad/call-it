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

import { describe, it, expect } from 'vitest';

describe('SC1b — /.well-known/farcaster.json manifest schema (RED until Plan 02)', () => {
  it('GET returns 200 with a miniapp object and NO accountAssociation', async () => {
    const route = await import('../app/.well-known/farcaster.json/route.js');
    expect(typeof route.GET).toBe('function');

    const res = await route.GET(new Request('https://callit.app/.well-known/farcaster.json'));
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    const miniapp = body['miniapp'] as Record<string, unknown> | undefined;
    expect(miniapp).toBeDefined();
    expect(miniapp?.['version']).toBe('1');
    expect(typeof miniapp?.['name']).toBe('string');
    expect((miniapp?.['name'] as string).length).toBeGreaterThan(0);
    expect(typeof miniapp?.['homeUrl']).toBe('string');
    expect(typeof miniapp?.['iconUrl']).toBe('string');

    // D-05: signed accountAssociation is a Phase-10 (mainnet domain) artifact.
    expect(body['accountAssociation']).toBeUndefined();
  });
});
