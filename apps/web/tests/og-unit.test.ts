/**
 * Unit tests for OG fallback route — no running server required.
 *
 * Tests the renderFallback() function and route handler directly.
 * These tests run in Vitest and validate behavior without Playwright.
 *
 * Playwright integration tests (og-fallback.spec.ts, og-fallback-routing.spec.ts,
 * og-fallback-bench.spec.ts) require a running Next.js dev server and are run
 * with `pnpm test:og-fallback` etc.
 *
 * Requirements: SHARE-09, SHARE-10, SHARE-11
 */

import { describe, it, expect } from 'vitest';

describe('OG fallback route — static assertions', () => {
  it('route.ts exports runtime = nodejs', async () => {
    const { runtime } = await import('../app/api/og/fallback/route.js');
    expect(runtime).toBe('nodejs');
  });

  it('route.ts exports GET function', async () => {
    const { GET } = await import('../app/api/og/fallback/route.js');
    expect(typeof GET).toBe('function');
  });

  it('[callId]/route.ts source exports runtime = nodejs (static check)', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    // Use static source check because Vitest has trouble resolving paths with brackets
    const source = readFileSync(join(process.cwd(), 'app/api/og/[callId]/route.ts'), 'utf-8');
    expect(source).toContain("runtime = 'nodejs'");
  });

  it('[callId]/route.ts source exports GET function (static check)', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(join(process.cwd(), 'app/api/og/[callId]/route.ts'), 'utf-8');
    expect(source).toContain('export async function GET');
  });

  it('og-fallback-render.ts exports renderFallback function', async () => {
    const { renderFallback } = await import('../lib/og-fallback-render.js');
    expect(typeof renderFallback).toBe('function');
  });

  it('og-fonts.ts exports syneBold, spaceGrotesk, jetBrainsMono', async () => {
    const fonts = await import('../lib/og-fonts.js');
    expect(fonts.syneBold).toBeDefined();
    expect(fonts.spaceGrotesk).toBeDefined();
    expect(fonts.jetBrainsMono).toBeDefined();
    // Each should be a Buffer with non-trivial size
    expect(fonts.syneBold.length).toBeGreaterThan(1000);
    expect(fonts.spaceGrotesk.length).toBeGreaterThan(1000);
    expect(fonts.jetBrainsMono.length).toBeGreaterThan(1000);
  });
});

describe('OG fallback route — security invariants (static analysis)', () => {
  it('D-12: route.ts source does not contain literal "callitapp.xyz"', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const routeSource = readFileSync(
      join(process.cwd(), 'app/api/og/fallback/route.ts'),
      'utf-8'
    );
    expect(routeSource).not.toContain('callitapp.xyz');
  });

  it('D-12: og-fallback-render.ts source does not contain literal "callitapp.xyz"', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(join(process.cwd(), 'lib/og-fallback-render.ts'), 'utf-8');
    expect(source).not.toContain('callitapp.xyz');
  });

  it('Pitfall 15: fallback route source does not contain "display: grid"', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const routeSource = readFileSync(
      join(process.cwd(), 'app/api/og/fallback/route.ts'),
      'utf-8'
    );
    const renderSource = readFileSync(join(process.cwd(), 'lib/og-fallback-render.ts'), 'utf-8');
    expect(routeSource).not.toContain("display: 'grid'");
    expect(routeSource).not.toContain('display: "grid"');
    expect(renderSource).not.toContain("display: 'grid'");
    expect(renderSource).not.toContain('display: "grid"');
  });

  it('Pitfall E: fallback route source uses NEXT_PUBLIC_BRAND_FOOTER (only allowed NEXT_PUBLIC_*)', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(
      join(process.cwd(), 'app/api/og/fallback/route.ts'),
      'utf-8'
    );
    // Must reference the allowed env var
    expect(source).toContain('NEXT_PUBLIC_BRAND_FOOTER');
    // Must NOT reference any other NEXT_PUBLIC_* vars
    const matches = source.match(/NEXT_PUBLIC_(?!BRAND_FOOTER)\w+/g);
    expect(matches ?? []).toHaveLength(0);
  });

  it('D-04: fallback route exports runtime = nodejs literal', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(
      join(process.cwd(), 'app/api/og/fallback/route.ts'),
      'utf-8'
    );
    expect(source).toContain("runtime = 'nodejs'");
  });

  it('[callId] route source contains Phase 0/2/4 variant rollout comment', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    // Use escaped path (Windows path with brackets)
    const callIdRoutePath = join(process.cwd(), 'app', 'api', 'og', '[callId]', 'route.ts');
    const source = readFileSync(callIdRoutePath, 'utf-8');
    expect(source.toLowerCase()).toContain('phase 0');
    expect(source.toLowerCase()).toContain('phase 2');
  });

  it('fonts exist in app/fonts/ (NOT public/fonts/) — Pitfall F', async () => {
    const { existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    expect(existsSync(join(process.cwd(), 'app/fonts/Syne-Bold.ttf'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'app/fonts/SpaceGrotesk-Regular.ttf'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'app/fonts/JetBrainsMono-Regular.ttf'))).toBe(true);
    // Negative assertion: fonts should NOT be in public/fonts/
    expect(existsSync(join(process.cwd(), 'public/fonts/Syne-Bold.ttf'))).toBe(false);
  });
});
