'use client';

/**
 * MiniAppReady — Farcaster Mini App splash-dismiss signal (08-06, UAT 08 GAP 2).
 *
 * GAP 2 (UAT test 2, severity: major): tapping the `launch_miniapp` button
 * ("View on Call It") opened a BLANK white page in the Farcaster webview. A
 * Farcaster Mini App stays on the host's splash/blank screen until the app calls
 * `sdk.actions.ready()`. Phase 8 (08-02) shipped the manifest + `fc:miniapp`
 * launch action + launch button but never made the launch TARGET a real Mini App
 * — there was no SDK and no `ready()` call anywhere.
 *
 * This tiny `'use client'` component renders nothing and calls
 * `sdk.actions.ready()` exactly once on mount so the host dismisses the splash
 * and reveals the receipt. It is mounted on EVERY render branch of `/call/[id]`
 * (loading, settled, live) so the host always reveals content.
 *
 * Fail-safe by design: in a normal browser (no Mini App host) the dynamic SDK
 * import and/or `ready()` call resolves to a harmless no-op or throws — either
 * way the error is swallowed and the page renders normally. The (large) SDK is
 * imported dynamically inside the effect so it is NOT pulled into the page's
 * top-level/server module graph.
 *
 * SCOPE (D-01, Phase-10 boundary): this ONLY makes the Mini App RENDER the
 * read-only receipt + signal ready(). In-app tap-to-transact / live broadcast on
 * mainnet 42161 stays out of scope (Phase 10). Interactive Follow/Fade/Challenge
 * controls remain wallet-gated.
 *
 * Threat: T-08-06-01 (blank-UX DoS) — mitigated by the once-only fail-safe
 * ready() call on every branch.
 */

import { useEffect, useRef } from 'react';

/**
 * Pure-ish, injectable ready-signal helper. Extracted so the ready-invocation
 * logic is unit-testable in a node env WITHOUT rendering React or touching the
 * real browser SDK (see tests/miniapp-ready.test.ts).
 *
 * Contract:
 *  - calls `loader()` then `.actions.ready()` exactly once,
 *  - NEVER throws / never rejects-with-error when the loader rejects (host
 *    absent) or when `ready` itself throws — the normal-browser render must not
 *    break,
 *  - resolves once the attempt settles.
 *
 * @param loader returns (a promise of) an object exposing `actions.ready()`.
 *   In the component this is the dynamic `@farcaster/miniapp-sdk` import.
 */
export async function signalReady(
  loader: () => Promise<{ actions: { ready: () => Promise<void> | void } }>,
): Promise<void> {
  try {
    const sdk = await loader();
    await sdk.actions.ready();
  } catch {
    // Not inside a Mini App host (or the SDK threw) — swallow. The page must
    // render normally in a regular browser; ready() is only meaningful inside a
    // Farcaster webview, where it dismisses the splash.
  }
}

type MiniAppReadyProps = {
  /**
   * Defer ready() until there is meaningful content on screen. The page passes
   * `enabled={!!callData}` so the host reveals the receipt, not an empty
   * skeleton. When false, this component does nothing yet (it will fire once
   * `enabled` flips true). Defaults to true.
   */
  enabled?: boolean;
};

export default function MiniAppReady({ enabled = true }: MiniAppReadyProps): null {
  // Ref guard so ready() is signalled AT MOST ONCE even under React StrictMode's
  // double-invoke of effects in development.
  const signalledRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (signalledRef.current) return;
    signalledRef.current = true;

    void signalReady(() =>
      import('@farcaster/miniapp-sdk').then((m) => m.sdk),
    );
  }, [enabled]);

  return null;
}
