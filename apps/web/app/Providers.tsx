'use client';
// PROVIDER ORDER LOAD-BEARING — see PITFALLS.md Pitfall 13.
// Any PR touching this file must pass apps/web/tests/privy-provider-order.ast.test.ts
//
// Order is:
//   <PrivyProvider>          ← outermost: Privy session + embedded wallet context
//     <QueryClientProvider>  ← middle: wagmi v2 requires React Query
//       <WagmiProvider>      ← inner: reads Privy connector via @privy-io/wagmi
//         <ToastProvider>    ← innermost: toast queue available to all pages
//
// WRONG ORDER CONSEQUENCE: Privy embedded wallet connector is invisible to useAccount().
// OAuth sign-in paths (Google, Twitter) silently fail to expose a wallet address.
// The AST test verifies this order on every CI run.
//
// WagmiProvider: imported from '@privy-io/wagmi', NOT from 'wagmi'.
//   '@privy-io/wagmi' injects the Privy connector into the wagmi config.
//   Using 'wagmi' directly bypasses the Privy connector entirely (Pitfall 13).
//
// Requirement: AUTH-01, AUTH-05, T-01-27
// Source: RESEARCH.md Pattern 1, PATTERNS.md § file 5

import { PrivyProvider } from '@privy-io/react-auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// CRITICAL: import WagmiProvider from '@privy-io/wagmi', NOT from 'wagmi'
import { WagmiProvider } from '@privy-io/wagmi';
// Farcaster Auth Kit (01.5-04): AuthKitProvider wraps BELOW PrivyProvider per CLAUDE.md
// ("Farcaster AuthKitProvider wraps below PrivyProvider"). It is placed as the
// INNERMOST wrapper (inside ToastProvider, around children) so the AST-locked
// PrivyProvider > QueryClientProvider > WagmiProvider order is untouched
// (privy-provider-order.ast.test.ts inspects the first three JSX elements).
import { AuthKitProvider } from '@farcaster/auth-kit';
import '@farcaster/auth-kit/styles.css';
import { ToastProvider } from '@call-it/ui';
import { wagmiConfig } from '@/lib/wagmi';
import { privyAppId, privyConfig } from '@/lib/privy-config';
import { WalletExportPrompt } from '@/components/WalletExportPrompt';
import { PaymasterCapBanner } from '@/components/PaymasterCapBanner';

/**
 * QueryClient is created outside the component to avoid re-creation on renders.
 * This is the standard wagmi v2 + @tanstack/react-query v5 pattern.
 */
const queryClient = new QueryClient();

/**
 * Farcaster Auth Kit config (AUTH-07 / 01.5-04).
 *
 * - rpcUrl: an OP-mainnet RPC (AuthKit reads Optimism for FID/key registry). Sourced
 *   from NEXT_PUBLIC_OP_MAINNET_RPC_URL with the public Optimism endpoint as fallback.
 * - domain: MUST equal the relayer FARCASTER_AUTH_DOMAIN (01.5-01) so the server-side
 *   verifySignInMessage passes (Pitfall 3). Sourced from NEXT_PUBLIC_FARCASTER_AUTH_DOMAIN.
 * - siweUri: the app origin (the URI the SIWF message is bound to).
 *
 * Falls back to window.location at runtime when env is unset (dev/local) so a missing
 * env never crashes the provider tree — linking is purely additive (Pitfall 5/16).
 */
const farcasterAuthConfig = {
  rpcUrl:
    process.env['NEXT_PUBLIC_OP_MAINNET_RPC_URL'] ?? 'https://mainnet.optimism.io',
  domain:
    process.env['NEXT_PUBLIC_FARCASTER_AUTH_DOMAIN'] ??
    (typeof window !== 'undefined' ? window.location.host : 'localhost:3000'),
  siweUri:
    (typeof window !== 'undefined'
      ? window.location.origin
      : process.env['NEXT_PUBLIC_OG_BASE_URL'] ?? 'http://localhost:3000') + '/login',
};

interface ProvidersProps {
  children: React.ReactNode;
}

/**
 * Providers — wraps the entire app in the locked provider tree.
 *
 * Order is AST-test-locked (Pitfall 13). Do NOT reorder.
 * Do NOT change WagmiProvider import source. The test will fail if you do.
 */
export function Providers({ children }: ProvidersProps) {
  return (
    <PrivyProvider appId={privyAppId} config={privyConfig}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <ToastProvider>
            {/* AUTH-24: WalletExportPrompt — watches balance and fires toast at ≥$50 */}
            <WalletExportPrompt />
            {/* Plan 07: PaymasterCapBanner — shows "USDC gas mode" when 5-tx cap is hit */}
            <PaymasterCapBanner />
            {/* 01.5-04: AuthKitProvider — innermost wrapper, below PrivyProvider (CLAUDE.md).
                Placed here so the AST-locked Privy>QueryClient>Wagmi order is preserved. */}
            <AuthKitProvider config={farcasterAuthConfig}>{children}</AuthKitProvider>
          </ToastProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
