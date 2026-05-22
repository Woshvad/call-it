/**
 * WalletExportPrompt — fires a toast when USDC balance ≥ $50 (AUTH-24).
 *
 * Mount this once in the app root (inside ToastProvider and WagmiProvider).
 * It silently watches the USDC balance and fires the export toast when the
 * $50 threshold is crossed for the first time in a session.
 *
 * Toast behavior:
 *   - Message: "Your wallet balance is over $50. Export it to self-custody?"
 *   - Action button: "Export" → calls Privy's exportWallet()
 *   - Duration: 30000ms (30s auto-dismiss)
 *   - One-time per session: localStorage flag `export_prompt_fired` prevents spam
 *
 * Security: T-01-38 — localStorage flag tracks last-fired; future polish:
 *   permanently dismiss after user clicks Export once.
 *
 * Requirements: AUTH-23, AUTH-24
 */

'use client';

import { useEffect, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useToast } from '@call-it/ui';
import { useUsdcBalance } from '../hooks/useUsdcBalance';

/** $50 in 6-decimal USDC units */
const EXPORT_THRESHOLD = 50_000_000n;

const STORAGE_KEY = 'call_it_export_prompt_fired';

/**
 * WalletExportPrompt — a silent watcher component that fires the export toast.
 *
 * Renders nothing visible — it is purely a side-effect hook component.
 * Mount inside <ToastProvider> and <WagmiProvider> in Providers.tsx.
 */
export function WalletExportPrompt() {
  const { exportWallet } = usePrivy();
  const { balance } = useUsdcBalance();
  const { show } = useToast();
  const hasFiredRef = useRef(false);

  useEffect(() => {
    // Guard: only fire once per session
    if (hasFiredRef.current) return;
    if (balance === undefined) return;
    if (balance < EXPORT_THRESHOLD) return;

    // Guard: only fire once per browser session (localStorage flag)
    try {
      if (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      // localStorage unavailable — proceed anyway
    }

    hasFiredRef.current = true;

    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, '1');
      }
    } catch {
      // localStorage unavailable — silently ignore
    }

    show({
      status: 'info',
      message: 'Your wallet balance is over $50. Export it to self-custody?',
      duration: 30000,
      action: {
        label: 'Export',
        onClick: () => {
          void exportWallet();
        },
      },
    });
  }, [balance, exportWallet, show]);

  // Renders nothing — pure side-effect component
  return null;
}
