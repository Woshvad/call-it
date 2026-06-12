/**
 * Landing acid-hero source gates — quick-260612-a6v (user homepage replacement
 * 2026-06-12: "replace it with exactly what is in that folder").
 *
 * Source-assert style (presentation-sweep convention — node env, no DOM):
 * pins the user removals (Market/Leaderboard/Dashboard nav pills), the CTA
 * wiring, the ALWAYS-MOUNTED SignInButtons invariant, static-import asset
 * honesty, the /calls route + its middleware '/call'-prefix dependency, and
 * the page-local ci-pulse/ci-bloom keyframes.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const read = (...segs: string[]) => readFileSync(join(process.cwd(), ...segs), 'utf-8');

const signin = () => read('app', 'signin', 'page.tsx');

describe('user removals — design nav pills are NOT rendered', () => {
  it('Market/Leaderboard/Dashboard pills removed; single How it works pill present', () => {
    const s = signin();
    // quick-260612-a6v: the user replaced the design's three nav pills with
    // ONE "How it works" pill (user homepage replacement 2026-06-12).
    expect(s).not.toContain('>Market<');
    expect(s).not.toContain('>Leaderboard<');
    expect(s).not.toContain('>Dashboard<');
    expect(s).toContain('How it works');
  });
});

describe('CTA wiring', () => {
  it('MAKE YOUR FIRST CALL, See Live Calls → /calls, and Sign In triggers present', () => {
    const s = signin();
    expect(s).toContain('MAKE YOUR FIRST CALL');
    expect(s).toContain('See Live Calls');
    expect(s).toContain('href="/calls"');
    expect(s).toContain('Sign In');
  });
});

describe('cookie-self-heal invariant — SignInButtons is ALWAYS mounted', () => {
  // WHY: SignInButtons' privy-token cookie-write effect (SignInButtons.tsx
  // ~114-153) must mount on page load — it redirects already-authenticated
  // visitors off /signin and self-heals returning sessions whose cookie
  // expired. The modal wrapper must therefore be display-toggled, NEVER
  // conditionally rendered around SignInButtons.
  it('signin modal is display-toggled + aria-hidden, never conditionally rendered', () => {
    const s = signin();
    expect(s).toContain('display: signinOpen');
    expect(s).toContain('aria-hidden={!signinOpen}');
    expect(s).not.toMatch(/\{signinOpen && [\s\S]{0,80}SignInButtons/);
    expect(s).toContain("dynamic(() => import('./SignInButtons')");
  });
});

describe('asset honesty — logo via static import', () => {
  it('callit-mark is statically imported, never a raw /brand/ URL', () => {
    const s = signin();
    // Raw public URLs bounce through the middleware matcher (which excludes
    // only _next/static|_next/image|favicon.ico|public/) — a logged-out
    // visitor's <img src="/brand/..."> request would 307 to /signin. The
    // static import serves from /_next/static/media/* which IS excluded.
    expect(s).toContain('callit-mark');
    expect(s).not.toContain('src="/brand/');
  });

  it('the copied asset exists at public/brand/callit-mark.png', () => {
    expect(existsSync(join(process.cwd(), 'public', 'brand', 'callit-mark.png'))).toBe(true);
  });
});

describe('demo-card design fidelity (decorative, documented)', () => {
  it('the three design-canon demo callers render', () => {
    const s = signin();
    expect(s).toContain('veda');
    expect(s).toContain('jaxon.eth');
    expect(s).toContain('degen_oracle');
  });
});

describe('/calls public tape route', () => {
  it('app/calls/page.tsx exists and re-exports the tape', () => {
    const p = join(process.cwd(), 'app', 'calls', 'page.tsx');
    expect(existsSync(p)).toBe(true);
    expect(read('app', 'calls', 'page.tsx')).toContain("from '../page'");
  });

  it("middleware carries the '/call' public prefix that makes /calls public", () => {
    // This startsWith prefix is what makes /calls public with ZERO middleware
    // change ('/calls'.startsWith('/call') === true). If the prefix is ever
    // renamed or removed, /calls silently re-gates and the landing's See Live
    // Calls CTA bounces logged-out visitors — this pin flags the dependency.
    const mw = read('middleware.ts');
    expect(mw).toContain("'/call'");
  });
});

describe('page-local keyframes', () => {
  it('ci-pulse and ci-bloom keyframes present', () => {
    const s = signin();
    expect(s).toContain('ci-pulse');
    expect(s).toContain('ci-bloom');
  });
});
