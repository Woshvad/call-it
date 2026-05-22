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
 *
 * Phase 1 note:
 * @privy-io/react-auth@3.27.0 bundles optional Solana wallet features that import
 * @solana/kit subpaths. These are optional peer deps (all marked optional in peerDependenciesMeta).
 * We use webpack.resolve.alias to stub them out on the client bundle since we do not
 * use any Solana wallet features (Call It is Arbitrum-only per OPS-21).
 *
 * [Rule 3 - Blocking]: Build fails without this shim. Pre-existing issue with Privy 3.27 + Next.js 16.
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

  // [Rule 3 - Blocking] Stub out optional Solana peer deps from @privy-io/react-auth@3.27.0.
  // Privy bundles Solana wallet support (FundSolWalletWithExternalSolanaWallet component)
  // that imports @solana/kit subpaths. Since Call It is Arbitrum-only (OPS-21), we never
  // use Solana wallets. The aliases below make Turbopack resolve these imports to
  // a stub module instead of a missing module.
  // Note: Turbopack resolveAlias maps specifier → absolute path or a module-specifier string.
  turbopack: {
    resolveAlias: {
      '@solana/kit/program-client-core': '@call-it/web/stubs/solana-stub',
      '@farcaster/mini-app-solana': '@call-it/web/stubs/solana-stub',
    },
  },

  // Webpack fallback for environments that don't use Turbopack (e.g., test environments)
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
      };
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        '@solana/kit/program-client-core': false,
        '@farcaster/mini-app-solana': false,
      };
    }
    return config;
  },
};

export default nextConfig;
