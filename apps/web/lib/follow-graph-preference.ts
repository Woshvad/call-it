/**
 * follow-graph-preference — AUTH-16 / D-14 follow-graph opt-in model + render gate.
 *
 * The onboarding follow-graph screen records a per-platform Yes/No opt-in. The
 * declared preference drives whether the "From your X / Farcaster" feed section
 * (built in 01.5-05) is EVER rendered for the viewer:
 *
 *   - opted in  → the section may render
 *   - declined  → the section is NEVER rendered (AUTH-16 "declined never shows")
 *   - unset     → not opted in → section does NOT render (opt-in is explicit)
 *
 * This module is pure (no React, no fetch) so the AUTH-16 declined-never-renders
 * invariant is unit-testable in a node environment without a DOM harness.
 *
 * Consent copy (D-14) is exported as a constant so the screen and the test share a
 * single source of truth. It MUST disclose that the follow graph is stored
 * server-side (durable), is viewer-only, and is cleared on disconnect.
 *
 * Persistence: the boolean preference is POSTed to the relayer onboarding endpoint
 * alongside the `followgraph` step advance (see onboarding/follow-graph/page.tsx).
 *
 * Requirements: AUTH-16, D-14
 */

export type FollowGraphPlatform = 'twitter' | 'farcaster';

/** A single platform's opt-in decision. `null` = not yet decided (treated as declined for render). */
export type OptInDecision = boolean | null;

export interface FollowGraphPreference {
  /** "From your X" opt-in. */
  twitter: OptInDecision;
  /** "From your Farcaster" opt-in (only meaningful when Farcaster is linked). */
  farcaster: OptInDecision;
}

/**
 * D-14 consent disclosure copy. Shown verbatim on the onboarding follow-graph screen.
 * Discloses: durable server-side storage, viewer-only access, cleared on disconnect.
 */
export const FOLLOW_GRAPH_CONSENT_COPY =
  'Your follow graph is stored on our servers (durable, server-side) so we can match ' +
  'it to calls. It is viewer-only — no one else can see who you follow — and it is ' +
  'cleared from our servers when you disconnect the account.';

/**
 * AUTH-16 render gate: returns true only when the viewer explicitly opted in for the
 * given platform. A declined OR unset decision returns false — the feed section must
 * never render for those users.
 */
export function shouldRenderFollowGraphSection(
  pref: FollowGraphPreference | null | undefined,
  platform: FollowGraphPlatform,
): boolean {
  if (!pref) return false;
  return pref[platform] === true;
}

/** Convenience: did the viewer opt in to AT LEAST ONE platform's follow-graph feed? */
export function hasAnyFollowGraphOptIn(pref: FollowGraphPreference | null | undefined): boolean {
  return (
    shouldRenderFollowGraphSection(pref, 'twitter') ||
    shouldRenderFollowGraphSection(pref, 'farcaster')
  );
}

/** localStorage key for the locally-cached follow-graph preference (per-browser). */
export const FOLLOW_GRAPH_PREF_STORAGE_KEY = 'callit:follow-graph-optin';

/**
 * Persist the per-platform follow-graph preference.
 *
 * Writes a local (durable per-browser) copy so the 01.5-05 feed section's render
 * gate (shouldRenderFollowGraphSection) can read it immediately, AND best-effort
 * POSTs it to the relayer follow-graph opt-in endpoint for durable server-side
 * storage (the relayer endpoint lands in the FEED wave; the POST is forward-
 * compatible and never blocks — Pitfall 5/16).
 *
 * Pure-on-server-safe: the localStorage write is guarded for SSR; a fetch failure
 * is swallowed so opting in/out never throws into the onboarding flow.
 */
export async function persistFollowGraphPreference(
  pref: FollowGraphPreference,
  opts?: { relayerBase?: string; token?: string | null },
): Promise<void> {
  // 1. Local durable copy (per-browser) — read by the feed-section render gate.
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(FOLLOW_GRAPH_PREF_STORAGE_KEY, JSON.stringify(pref));
    }
  } catch {
    // private-mode / quota — non-fatal
  }

  // 2. Best-effort server-side persistence (durable, viewer-only — D-12/D-14).
  const base = (opts?.relayerBase ?? '').replace(/\/$/, '');
  if (!base || !opts?.token) return;
  try {
    await fetch(`${base}/api/social/follow-graph-optin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.token}`,
      },
      body: JSON.stringify(pref),
    });
  } catch {
    // relayer unreachable — local copy already saved; never block onboarding
  }
}

/** Read the locally-cached follow-graph preference (per-browser). Returns null on SSR/miss. */
export function readFollowGraphPreference(): FollowGraphPreference | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(FOLLOW_GRAPH_PREF_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FollowGraphPreference>;
    return {
      twitter: parsed.twitter ?? null,
      farcaster: parsed.farcaster ?? null,
    };
  } catch {
    return null;
  }
}
