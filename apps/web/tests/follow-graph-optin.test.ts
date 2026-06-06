/**
 * AUTH-16 / D-14 follow-graph opt-in test (01.5-04 Task 2)
 *
 * Asserts the two locked invariants:
 *   (a) The D-14 consent copy discloses DURABLE SERVER-SIDE storage AND CLEARED-ON-DISCONNECT.
 *   (b) "No thanks" (a declined preference) makes the feed-section render gate return
 *       false for that user — the "From your X / Farcaster" section (01.5-05) NEVER renders
 *       for a declined viewer (AUTH-16 "declined never shows").
 *
 * Harness note (deviation from the plan's `.test.tsx` + Testing Library): apps/web's
 * vitest config uses `include: ['tests/**\/*.test.ts']` with `environment: 'node'` and
 * has NO jsdom / @testing-library/react installed. The plan's threat model locks "No new
 * deps", so this is written as a `.test.ts` against the PURE render-decision module that
 * the follow-graph page consumes, plus static-source assertions on the page (the same
 * Tier-1 pattern used by onboarding.spec.ts). This tests the exact AUTH-16 invariant
 * (declined-never-renders) without a DOM harness.
 *
 * Requirements: AUTH-16, D-14
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  FOLLOW_GRAPH_CONSENT_COPY,
  shouldRenderFollowGraphSection,
  hasAnyFollowGraphOptIn,
  type FollowGraphPreference,
} from '../lib/follow-graph-preference';

const WEB_ROOT = path.resolve(__dirname, '..');
const FOLLOW_GRAPH_PAGE = path.join(WEB_ROOT, 'app', 'onboarding', 'follow-graph', 'page.tsx');

describe('AUTH-16 / D-14 follow-graph opt-in', () => {
  // ── (a) Consent copy discloses durable server-side storage + cleared-on-disconnect ──
  describe('D-14 consent disclosure copy', () => {
    it('mentions durable server-side storage', () => {
      const copy = FOLLOW_GRAPH_CONSENT_COPY.toLowerCase();
      expect(copy).toContain('server');
      expect(copy).toContain('durable');
    });

    it('mentions viewer-only access', () => {
      expect(FOLLOW_GRAPH_CONSENT_COPY.toLowerCase()).toContain('viewer-only');
    });

    it('mentions the graph is cleared on disconnect', () => {
      const copy = FOLLOW_GRAPH_CONSENT_COPY.toLowerCase();
      expect(copy).toContain('cleared');
      expect(copy).toContain('disconnect');
    });

    it('is rendered on the follow-graph onboarding screen via the shared constant', () => {
      const src = readFileSync(FOLLOW_GRAPH_PAGE, 'utf-8');
      expect(src).toContain('FOLLOW_GRAPH_CONSENT_COPY');
      expect(src).toContain('data-testid="follow-graph-consent"');
    });
  });

  // ── (b) Declined preference never renders the feed section (AUTH-16) ──
  describe('declined-never-renders (AUTH-16)', () => {
    it('returns false for a declined Twitter preference', () => {
      const declined: FollowGraphPreference = { twitter: false, farcaster: null };
      expect(shouldRenderFollowGraphSection(declined, 'twitter')).toBe(false);
    });

    it('returns false for a declined Farcaster preference', () => {
      const declined: FollowGraphPreference = { twitter: null, farcaster: false };
      expect(shouldRenderFollowGraphSection(declined, 'farcaster')).toBe(false);
    });

    it('returns false for an unset (no-decision) preference — opt-in is explicit', () => {
      const unset: FollowGraphPreference = { twitter: null, farcaster: null };
      expect(shouldRenderFollowGraphSection(unset, 'twitter')).toBe(false);
      expect(shouldRenderFollowGraphSection(unset, 'farcaster')).toBe(false);
    });

    it('returns false when no preference exists at all (null/undefined)', () => {
      expect(shouldRenderFollowGraphSection(null, 'twitter')).toBe(false);
      expect(shouldRenderFollowGraphSection(undefined, 'farcaster')).toBe(false);
    });

    it('a fully-declined user renders NEITHER section', () => {
      const declined: FollowGraphPreference = { twitter: false, farcaster: false };
      expect(shouldRenderFollowGraphSection(declined, 'twitter')).toBe(false);
      expect(shouldRenderFollowGraphSection(declined, 'farcaster')).toBe(false);
      expect(hasAnyFollowGraphOptIn(declined)).toBe(false);
    });
  });

  // ── Positive path: opted-in user CAN render the section ──
  describe('opted-in renders', () => {
    it('returns true only for an explicitly opted-in platform', () => {
      const optedIn: FollowGraphPreference = { twitter: true, farcaster: false };
      expect(shouldRenderFollowGraphSection(optedIn, 'twitter')).toBe(true);
      expect(shouldRenderFollowGraphSection(optedIn, 'farcaster')).toBe(false);
      expect(hasAnyFollowGraphOptIn(optedIn)).toBe(true);
    });
  });

  // ── The page wires the opt-in persistence + per-platform Yes/No ──
  describe('page wiring', () => {
    it('persists the per-platform preference and offers explicit Yes/No', () => {
      const src = readFileSync(FOLLOW_GRAPH_PAGE, 'utf-8');
      expect(src).toContain('persistFollowGraphPreference');
      expect(src).toContain('data-testid="follow-graph-yes-button"');
      expect(src).toContain('data-testid="follow-graph-no-button"');
      // No leftover Plan-06 stub: the discarded `void optIn` placeholder is gone.
      expect(src).not.toContain('void optIn');
    });
  });
});
