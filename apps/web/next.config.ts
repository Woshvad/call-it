import type { NextConfig } from 'next';

/**
 * Call It — Next.js 16 configuration
 *
 * Key constraints from CLAUDE.md:
 * - App Router only (not Pages Router)
 * - Node runtime for OG endpoints (not edge) — Satori + resvg-wasm bundle pain on edge (Pitfall 8)
 * - typedRoutes: true — Phase 0 + later phases use this for type-safe routing
 *
 * D-12: Domain placeholder — NEXT_PUBLIC_OG_BASE_URL is env-var, never hardcoded domain.
 */
const nextConfig: NextConfig = {
  typedRoutes: true,

  // Ensure the OG endpoint uses Node runtime (not edge).
  // Runtime is set per-route in route.ts via: export const runtime = 'nodejs';
  // This config does NOT set a global default runtime — per-route is explicit and safer.

  // Disable x-powered-by header for minimal information disclosure
  poweredByHeader: false,

  // Strict mode for catching async issues early
  reactStrictMode: true,
};

export default nextConfig;
