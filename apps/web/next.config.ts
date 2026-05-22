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
 * Phase 1 note (Rule 3 - Blocking):
 * @privy-io/react-auth@3.27.0 bundles optional Solana wallet features that import
 * @solana-program/* packages. Since Call It is Arbitrum-only (OPS-21), we never
 * use Solana wallets. The aliases below stub them out at both webpack and turbopack level.
 *
 * Turbopack resolveAlias: maps specifier → bare specifier of the empty stub package
 * Webpack alias: maps specifier → false (empty module in webpack)
 *
 * Note on Turbopack Windows paths: Turbopack does not support absolute Windows paths
 * in resolveAlias (as of Next.js 16.2.6). We must use a package-relative import specifier
 * (pointing to the local stub via the package name's exports or a relative ./stubs/ import).
 * We use a relative path that resolves from the project root via the module system.
 */

const nextConfig: NextConfig = {
  typedRoutes: true,

  // Disable x-powered-by header for minimal information disclosure
  poweredByHeader: false,

  // Strict mode for catching async issues early
  reactStrictMode: true,

  // Tell Next.js to tree-shake @privy-io/react-auth — this prevents Privy's optional
  // Solana components (FundSolWallet*, x402) from being bundled when unused.
  // Combined with the resolveAlias stubs below, this eliminates the Solana build errors.
  experimental: {
    optimizePackageImports: ['@privy-io/react-auth'],
  },

  // Turbopack: stub out optional Solana + x402 peer deps (Privy internal use only)
  // Privy 3.27 bundles X402 (payment protocol) which pulls @solana-program/token-2022 + @solana/kit.
  // Call It is Arbitrum-only (OPS-21) — stub at the x402 root level to cut the entire chain.
  // resolveAlias values use relative paths from project root (Turbopack doesn't support Windows abs paths)
  turbopack: {
    resolveAlias: {
      'x402': './stubs/empty.mjs',
      '@solana/kit': './stubs/empty.mjs',
      '@solana/kit/program-client-core': './stubs/empty.mjs',
      '@solana-program/system': './stubs/empty.mjs',
      '@solana-program/memo': './stubs/empty.mjs',
      '@solana-program/token': './stubs/empty.mjs',
      '@solana-program/token-2022': './stubs/empty.mjs',
      '@farcaster/mini-app-solana': './stubs/empty.mjs',
    },
  },

  // Webpack: stub out optional Solana + x402 peer deps on client bundle
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        'x402': false,
        '@solana/kit': false,
        '@solana/kit/program-client-core': false,
        '@solana-program/system': false,
        '@solana-program/memo': false,
        '@solana-program/token': false,
        '@solana-program/token-2022': false,
        '@farcaster/mini-app-solana': false,
      };
    }
    // Allow webpack to resolve .js extension imports as .ts in TypeScript workspace packages.
    // packages/shared uses ESM .js extension imports (correct for tsc output); webpack
    // needs to also look for .ts when the .js file is not found (Rule 3 — blocking).
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
