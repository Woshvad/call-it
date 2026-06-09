/**
 * RED scaffold (Wave 0) — SC1a / SC3: Farcaster embed meta shape.
 *
 * Target (Plan 02, GREEN):
 *   apps/web/lib/farcaster-embed.ts → buildFarcasterEmbeds(...) → { miniappEmbed, frameEmbed }
 *   wired into apps/web/app/call/[id]/layout.tsx generateMetadata().other
 *
 * Asserted behavior (D-03, Pitfall 4):
 *   - generateMetadata returns an `other` object carrying BOTH 'fc:miniapp' and 'fc:frame'
 *   - each value JSON.parses to { version:'1', imageUrl, button:{ title, action:{ type, url, ... } } }
 *   - fc:miniapp.action.type === 'launch_miniapp'; fc:frame.action.type === 'launch_frame'
 *   - imageUrl === /og/{id}?v={statusVersion}  (SAME statusVersion as og:image — Pitfall 4)
 *
 * FORM: lazy dynamic import inside each test body. The module/route do not exist yet
 * (Wave-1 builds them), so the import REJECTS and the test FAILS (RED) — without a
 * collection-time crash. When Plan 02 lands buildFarcasterEmbeds + the layout, these
 * assertions flip GREEN with no edit to the test bodies' shape expectations.
 *
 * Requirements: SHARE-19 (SC1a / SC3).
 */

import { describe, it, expect, afterEach } from 'vitest';

const SEEDED_ID = '7';
const OG_BASE = 'https://callit.app';

describe('SC1a/SC3 — Farcaster embed meta', () => {
  const prevBase = process.env['NEXT_PUBLIC_OG_BASE_URL'];

  afterEach(() => {
    if (prevBase === undefined) delete process.env['NEXT_PUBLIC_OG_BASE_URL'];
    else process.env['NEXT_PUBLIC_OG_BASE_URL'] = prevBase;
  });

  it('exposes buildFarcasterEmbeds returning miniappEmbed + frameEmbed', async () => {
    const mod = await import('../lib/farcaster-embed.js');
    expect(typeof mod.buildFarcasterEmbeds).toBe('function');

    const { miniappEmbed, frameEmbed } = mod.buildFarcasterEmbeds({
      callId: SEEDED_ID,
      statusVersion: 'live',
      baseUrl: OG_BASE,
    });

    for (const raw of [miniappEmbed, frameEmbed]) {
      const parsed = JSON.parse(raw);
      expect(parsed.version).toBe('1');
      expect(typeof parsed.imageUrl).toBe('string');
      expect(typeof parsed.button?.title).toBe('string');
      expect(typeof parsed.button?.action?.type).toBe('string');
      expect(typeof parsed.button?.action?.url).toBe('string');
      // Pitfall 4: imageUrl reuses the same statusVersion as og:image.
      expect(parsed.imageUrl).toBe('https://callit.app/og/7?v=live');
    }

    expect(JSON.parse(miniappEmbed).button.action.type).toBe('launch_miniapp');
    expect(JSON.parse(frameEmbed).button.action.type).toBe('launch_frame');
  });

  it('WR-02: buildFarcasterEmbeds throws on an empty/relative baseUrl', async () => {
    const mod = await import('../lib/farcaster-embed.js');
    expect(() =>
      mod.buildFarcasterEmbeds({ callId: SEEDED_ID, statusVersion: 'live', baseUrl: '' }),
    ).toThrow();
    expect(() =>
      mod.buildFarcasterEmbeds({
        callId: SEEDED_ID,
        statusVersion: 'live',
        baseUrl: '/relative',
      }),
    ).toThrow();
  });

  it('call/[id]/layout generateMetadata.other carries fc:miniapp + fc:frame keys (with origin set)', async () => {
    // WR-02: the layout now omits the embed meta when NEXT_PUBLIC_OG_BASE_URL is unset.
    process.env['NEXT_PUBLIC_OG_BASE_URL'] = OG_BASE;
    const layout = await import('../app/call/[id]/layout.js');
    expect(typeof layout.generateMetadata).toBe('function');

    const meta = await layout.generateMetadata({ params: Promise.resolve({ id: SEEDED_ID }) });
    const other = meta.other as Record<string, unknown>;
    expect(other).toBeDefined();
    expect(other['fc:miniapp']).toBeDefined();
    expect(other['fc:frame']).toBeDefined();
  });

  it('WR-02: layout omits fc:miniapp/fc:frame when NEXT_PUBLIC_OG_BASE_URL is unset', async () => {
    delete process.env['NEXT_PUBLIC_OG_BASE_URL'];
    const layout = await import('../app/call/[id]/layout.js');
    const meta = await layout.generateMetadata({ params: Promise.resolve({ id: SEEDED_ID }) });
    const other = (meta.other ?? {}) as Record<string, unknown>;
    expect(other['fc:miniapp']).toBeUndefined();
    expect(other['fc:frame']).toBeUndefined();
  });
});
