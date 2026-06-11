'use client';

/**
 * usePythPrice — live Hermes price for a composer asset symbol
 * (quick-260611-hog).
 *
 * Resolves the symbol -> feed id via the existing resolveAssetToFeedId
 * (trim/uppercase/0x passthrough, unit-tested), then fetches the live price
 * from Pyth Hermes with a ~5s abort budget and a gentle 30s refresh.
 *
 * D-07 honesty contract (T-hog-02): on fetch failure/timeout the price is
 * null and status is 'error' — callers render NOTHING (no fake or stale
 * number a user could anchor a stake on). A FAILED refresh CLEARS the shown
 * price too: we never keep displaying a number the feed stopped backing.
 *
 * Requirement: CALL-06, UI-02
 */

import { useEffect, useState } from 'react';
import { resolveAssetToFeedId } from '../lib/resolve-asset';
import { fetchHermesPrice } from '../lib/hermes-price';

const FETCH_TIMEOUT_MS = 5_000;
const REFRESH_INTERVAL_MS = 30_000;

export type PythPriceStatus = 'idle' | 'loading' | 'ready' | 'error';

export function usePythPrice(symbol: string | undefined): {
  price: number | null;
  status: PythPriceStatus;
} {
  const feedId = symbol ? resolveAssetToFeedId(symbol) : null;
  const [price, setPrice] = useState<number | null>(null);
  const [status, setStatus] = useState<PythPriceStatus>('idle');

  useEffect(() => {
    if (!feedId) {
      setPrice(null);
      setStatus('idle');
      return;
    }

    let cancelled = false;
    let inflight: AbortController | null = null;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const load = async (isFirst: boolean) => {
      const controller = new AbortController();
      inflight = controller;
      // ~5s budget: abort the request if Hermes hangs.
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      timers.push(timeout);
      if (isFirst) {
        // Only show the transient loading state when nothing is on screen yet —
        // refreshes happen silently behind the current number.
        setStatus('loading');
      }
      const usd = await fetchHermesPrice(feedId, controller.signal);
      clearTimeout(timeout);
      if (cancelled) return; // unmounted or feedId changed — drop the result
      if (usd !== null) {
        setPrice(usd);
        setStatus('ready');
      } else {
        // D-07: failure (including a failed REFRESH) clears the price —
        // callers render nothing rather than a stale-looking number.
        setPrice(null);
        setStatus('error');
      }
    };

    setPrice(null);
    void load(true);

    const interval = setInterval(() => {
      void load(false);
    }, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      inflight?.abort();
      for (const t of timers) clearTimeout(t);
      clearInterval(interval);
    };
  }, [feedId]);

  return { price, status };
}
