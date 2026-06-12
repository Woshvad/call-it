/**
 * OG footer host allowlisting — quick-260611-5mh WR-07.
 *
 * The OG routes must never reflect an arbitrary request Host header into the
 * rendered (CDN-cacheable) card footer. Only allowlisted hostnames pass
 * through; everything else degrades to the canonical deploy literal.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveOgFooterHost, OG_FALLBACK_HOST } from '../lib/og-host';

describe('resolveOgFooterHost (WR-07)', () => {
  it('passes through the allowlisted Vercel deploy host', () => {
    expect(resolveOgFooterHost('call-it-web-sepolia.vercel.app')).toBe(
      'call-it-web-sepolia.vercel.app',
    );
    // Case-insensitive (Host headers are case-insensitive per RFC 9110)
    expect(resolveOgFooterHost('Call-It-Web-Sepolia.Vercel.App')).toBe(
      'call-it-web-sepolia.vercel.app',
    );
  });

  it('passes through localhost (with port) for local dev', () => {
    expect(resolveOgFooterHost('localhost:3000')).toBe('localhost:3000');
    expect(resolveOgFooterHost('127.0.0.1:3000')).toBe('127.0.0.1:3000');
  });

  it('passes through the custom domain (callitlive.app, 2026-06-12)', () => {
    expect(resolveOgFooterHost('callitlive.app')).toBe('callitlive.app');
    expect(resolveOgFooterHost('www.callitlive.app')).toBe('www.callitlive.app');
    // Lookalikes still rejected
    expect(resolveOgFooterHost('callitlive.app.evil.example')).toBe(OG_FALLBACK_HOST);
  });

  it('rejects spoofed / arbitrary Host headers → fixed fallback literal', () => {
    expect(resolveOgFooterHost('evil.example')).toBe(OG_FALLBACK_HOST);
    expect(resolveOgFooterHost('phishing-call-it.vercel.app')).toBe(OG_FALLBACK_HOST);
    expect(resolveOgFooterHost('call-it-web-sepolia.vercel.app.evil.example')).toBe(
      OG_FALLBACK_HOST,
    );
    expect(resolveOgFooterHost('SEND $5 TO CLAIM')).toBe(OG_FALLBACK_HOST);
  });

  it('handles absent/empty host → fixed fallback literal', () => {
    expect(resolveOgFooterHost(undefined)).toBe(OG_FALLBACK_HOST);
    expect(resolveOgFooterHost(null)).toBe(OG_FALLBACK_HOST);
    expect(resolveOgFooterHost('')).toBe(OG_FALLBACK_HOST);
  });
});

describe('grep gate: all three OG routes use the allowlist helper', () => {
  const read = (...segs: string[]) => readFileSync(join(process.cwd(), ...segs), 'utf-8');

  const routes: Array<string[]> = [
    ['app', 'og', '[callId]', 'route.ts'],
    ['app', 'og', 'duel', '[challengeId]', 'route.ts'],
    ['app', 'api', 'og', '[callId]', 'route.ts'],
  ];

  for (const segs of routes) {
    it(`${segs.join('/')} derives requestHost via resolveOgFooterHost (no raw url.host reflection)`, () => {
      const src = read(...segs);
      expect(src).toContain('resolveOgFooterHost(url.host)');
      // The raw-reflection pattern must be gone
      expect(src).not.toMatch(/requestHost\s*=\s*url\.host\s*\|\|/);
    });
  }
});
