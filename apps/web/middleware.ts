/**
 * Next.js middleware — authenticated user onboarding redirect guard (D-32, T-01-35).
 *
 * Intercepts every navigation and enforces:
 *   1. If user is NOT authenticated (no Privy session cookie) → allow /signin and /og routes;
 *      redirect everything else to /signin.
 *   2. If user IS authenticated and onboarding is incomplete (taglineCommittedAt IS NULL):
 *      - If NOT already on /onboarding/* → redirect to /onboarding/<currentStepSlug>
 *      - If on /onboarding/* → let through (user is actively onboarding)
 *   3. If user IS authenticated and onboarding is complete → let through.
 *
 * D-32 resume behavior: on next sign-in, middleware reads `taglineCommittedAt` from
 * the relayer state and redirects to the last incomplete step.
 *
 * T-01-36 (DoS — Privy outage during middleware fetch):
 *   If the relayer state call fails, middleware reads the last-known step from a
 *   short-lived cookie (`ci_onboarding_step`) with 30s TTL and falls back to that.
 *   If neither is available, lets the request through (fail-open, not fail-closed).
 *
 * Security: T-01-33 (JWT passed to relayer), T-01-35 (server-side canonical state),
 *           T-01-36 (Privy outage toleration)
 *
 * Requirements: AUTH-19, D-32
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const RELAYER_BASE = (process.env['NEXT_PUBLIC_RELAYER_BASE_URL'] ?? '').replace(/\/$/, '');

/**
 * Cookie name for Privy's session token.
 *
 * Use the ACCESS token cookie (`privy-token`), NOT the identity token (`privy-id-token`):
 *   - The relayer verifies sessions with `privy.verifyAuthToken(token)` (@privy-io/server-auth),
 *     which validates the ACCESS token. Passing the identity token would 401.
 *   - `privy-token` is the cookie Privy's documented Next.js middleware pattern reads.
 *   - The identity-token cookie is only issued when identity tokens are enabled (extra feature)
 *     and would not verify against verifyAuthToken anyway.
 *
 * Fix 2026-05-29: was `privy-id-token` — caused every authenticated user to bounce back to
 * /signin (first real OAuth login surfaced it; Tier-2 browser tests were skipped in CI).
 */
const PRIVY_COOKIE_NAME = 'privy-token';

/** Short-lived cache cookie key for last-known onboarding step */
const STEP_CACHE_COOKIE = 'ci_onboarding_step';

/** Routes that are always allowed (no auth/onboarding check) */
const PUBLIC_PREFIXES = [
  '/signin',
  '/og',
  '/api',
  '/_next',
  '/favicon.ico',
  '/fonts',
  // Dev-only showcase + visual-snapshot target. Gated by NEXT_PUBLIC_DEV_ROUTES=1
  // at the page level — in production (DEV_ROUTES unset) the page returns a
  // disabled-state message, so listing the prefix here doesn't leak anything.
  '/dev',
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

interface OnboardingStateResponse {
  currentStep: number;
  taglineCommittedAt: number | null;
}

const STEP_SLUGS: Record<number, string> = {
  1: 'handle',
  2: 'socials',
  3: 'follow-graph',
  4: 'fund',
  5: 'tagline',
};

function stepToSlug(step: number): string {
  return STEP_SLUGS[step] ?? 'handle';
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // 1. Allow public routes unconditionally
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // 2. Check for Privy session cookie
  const privyCookie = request.cookies.get(PRIVY_COOKIE_NAME);
  const privyToken = privyCookie?.value;

  if (!privyToken) {
    // Not authenticated — redirect to sign-in
    // Allow the request if it's already heading somewhere auth-free
    const signinUrl = new URL('/signin', request.url);
    return NextResponse.redirect(signinUrl);
  }

  // 3. Already on an onboarding route — let through (user is in flow)
  if (pathname.startsWith('/onboarding/')) {
    return NextResponse.next();
  }

  // 4. Fetch onboarding state from the relayer
  try {
    const res = await fetch(`${RELAYER_BASE}/api/onboarding/state`, {
      headers: {
        Authorization: `Bearer ${privyToken}`,
        'Content-Type': 'application/json',
      },
      // Short timeout — don't block the user for long (T-01-36)
      signal: AbortSignal.timeout(2500),
    });

    if (res.ok) {
      const state = (await res.json()) as OnboardingStateResponse;

      if (state.taglineCommittedAt === null) {
        // Onboarding incomplete — redirect to the current step
        const slug = stepToSlug(state.currentStep);
        const onboardingUrl = new URL(`/onboarding/${slug}`, request.url);

        const response = NextResponse.redirect(onboardingUrl);
        // Cache the step briefly to tolerate relayer outage (T-01-36)
        response.cookies.set(STEP_CACHE_COOKIE, String(state.currentStep), {
          maxAge: 30,
          httpOnly: true,
          sameSite: 'lax',
        });
        return response;
      }

      // Onboarding complete — clear the cache cookie if present and let through
      const response = NextResponse.next();
      if (request.cookies.get(STEP_CACHE_COOKIE)) {
        response.cookies.delete(STEP_CACHE_COOKIE);
      }
      return response;
    }

    // Non-OK response from relayer (e.g., 401 expired token) — redirect to sign-in
    if (res.status === 401) {
      const signinUrl = new URL('/signin', request.url);
      return NextResponse.redirect(signinUrl);
    }

    // Other errors — fall through to T-01-36 cache fallback below
  } catch {
    // Relayer fetch failed (timeout or network error) — T-01-36 fallback
  }

  // 5. T-01-36 fallback: use cached step if available
  const cachedStep = request.cookies.get(STEP_CACHE_COOKIE)?.value;
  if (cachedStep) {
    const step = parseInt(cachedStep, 10);
    if (!Number.isNaN(step) && step < 5) {
      // Cached step says onboarding incomplete — redirect
      const slug = stepToSlug(step);
      const onboardingUrl = new URL(`/onboarding/${slug}`, request.url);
      return NextResponse.redirect(onboardingUrl);
    }
  }

  // 6. No cache + relayer down → fail-open (let through)
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
};
