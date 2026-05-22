'use client';
/**
 * ClientProviders — thin client-side wrapper for Providers.tsx.
 *
 * Problem: PrivyProvider throws synchronously during SSR if NEXT_PUBLIC_PRIVY_APP_ID
 * is not a valid Privy app ID format (e.g., in CI environments with mock IDs).
 * PrivyProvider also relies on browser APIs (localStorage) unavailable on the server.
 *
 * Solution: Load Providers with dynamic() + ssr:false from a Client Component.
 * next/dynamic can only be called in Client Components, hence this thin wrapper.
 *
 * The AST regression test (tests/privy-provider-order.ast.test.ts) checks Providers.tsx
 * source directly — this wrapper is not part of the provider-order invariant.
 *
 * Decision: ssr:false is the correct pattern for auth providers that rely on:
 *   - Browser APIs (localStorage, sessionStorage) for session persistence
 *   - NEXT_PUBLIC_PRIVY_APP_ID being a real Privy app ID (not mock)
 *
 * AUTH-01: All Privy auth flows execute in the browser after hydration.
 * T-01-30: NEXT_PUBLIC_PRIVY_APP_ID is baked into the client bundle (public key).
 */

import dynamic from 'next/dynamic';

// Load Providers as a client-only component (no SSR)
const Providers = dynamic(
  () => import('./Providers').then((m) => ({ default: m.Providers })),
  {
    ssr: false,
    loading: () => null,
  }
);

interface ClientProvidersProps {
  children: React.ReactNode;
}

export function ClientProviders({ children }: ClientProvidersProps) {
  return <Providers>{children}</Providers>;
}
