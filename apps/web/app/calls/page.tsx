/**
 * /calls — public live-calls route (quick-260612-a6v, user request 2026-06-12).
 *
 * WHY THIS ROUTE EXISTS:
 *   `/` is auth-gated by middleware.ts (signed-out visitors → /signin) and must
 *   STAY gated so first-time visitors land on the new acid-hero landing (the
 *   rewritten /signin). The landing's "See Live Calls" CTA needs a
 *   logged-out-reachable view of the live tape — this route re-exports the tape
 *   (app/page.tsx default export) at a public path.
 *
 * WHY IT IS PUBLIC WITH ZERO MIDDLEWARE CHANGE:
 *   middleware.ts PUBLIC_PREFIXES carries '/call' (the public receipt prefix)
 *   and isPublicRoute() matches via startsWith — '/calls'.startsWith('/call')
 *   === true. This is a LOAD-BEARING dependency: if the '/call' prefix is ever
 *   renamed or removed, /calls silently re-gates and the landing's See Live
 *   Calls CTA bounces logged-out visitors back to /signin.
 *   landing-hero.test.ts mirror-reads the prefix to flag exactly this.
 *
 * SIGNED-OUT SAFETY:
 *   The tape renders signed-out-safe — relayer-backed feed, auth-aware NEW CALL
 *   handler, public /call/:id receipt links. It intentionally renders INSIDE
 *   the AppShell chrome (fullBleed is /signin + /onboarding/* only).
 */

export { default } from '../page';
