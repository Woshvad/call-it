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
import { ToastProvider } from '@call-it/ui';
import { wagmiConfig } from '@/lib/wagmi';
import { privyAppId, privyConfig } from '@/lib/privy-config';
import { WalletExportPrompt } from '@/components/WalletExportPrompt';

/**
 * QueryClient is created outside the component to avoid re-creation on renders.
 * This is the standard wagmi v2 + @tanstack/react-query v5 pattern.
 */
const queryClient = new QueryClient();

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
            {children}
          </ToastProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
