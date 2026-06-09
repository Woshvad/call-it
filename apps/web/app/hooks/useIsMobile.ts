'use client';

/**
 * SSR-safe `useIsMobile()` — Phase 9 mobile-responsive foundation (D-01 / D-02).
 *
 * Lives in `apps/web/app/hooks/` ONLY — NEVER `packages/ui` (Pitfall 2: pulling
 * `matchMedia` into the Satori / `@vercel/og` Node build path breaks OG rendering).
 *
 * Mechanism: `useSyncExternalStore` with a dedicated server-snapshot arg.
 *   - getServerSnapshot() returns `true` (D-02: mobile-first first paint) — the
 *     server HTML and the first client (hydration) render both use this snapshot,
 *     so server and client markup match → no hydration mismatch under
 *     `dynamic='force-dynamic'` (Pitfall 1).
 *   - After hydration commits, React reads getSnapshot() and, if a desktop viewport
 *     disagrees, re-renders once (the one quiet reflow D-02 accepts).
 *
 * Single breakpoint: `< 768px ⇒ mobile` (Claude's-discretion in D-01 — the tablet
 * tier collapses into the desktop bucket for v1).
 *
 * Source pattern: React `useSyncExternalStore` docs (server-snapshot argument).
 */

import { useSyncExternalStore } from 'react';

const QUERY = '(max-width: 767px)'; // < 768px ⇒ mobile

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  // NEVER the deprecated addListener — use addEventListener('change', …).
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getSnapshot(): boolean {
  // Client value — the real viewport. Guard SSR / test-node where matchMedia is absent.
  return typeof window !== 'undefined' && !!window.matchMedia
    ? window.matchMedia(QUERY).matches
    : true;
}

function getServerSnapshot(): boolean {
  return true; // D-02: mobile-first first paint (server + hydration baseline)
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
