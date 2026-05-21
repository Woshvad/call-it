/**
 * Shared Fallback OG card renderer (§16.6 layout).
 *
 * Extracted for reuse by BOTH:
 *   - apps/web/app/api/og/fallback/route.ts (SHARE-09)
 *   - apps/web/app/api/og/[callId]/route.ts (SHARE-10 catch-all)
 *
 * Layout spec §16.6:
 *   - 1200×630px, #09090E background, 3px #E8F542 border
 *   - 4 corner brackets (24×24, 4px border, #E8F542)
 *   - CALL IT wordmark: Syne 48px, #E8F542, top-left
 *   - "A CALL WAS MADE": Syne 64px, #F1F5F9, hero with 5% left margin
 *   - "by @{handle}": SpaceGrotesk 28px, #94A3B8
 *   - Subtext: SpaceGrotesk 18px, #94A3B8
 *   - Footer: brand string (env-var, D-12) + ARBITRUM (JetBrainsMono 12px)
 *
 * PITFALL 15: Only `display: flex` is used — Satori does NOT support display: grid.
 * PITFALL E: No NEXT_PUBLIC_* env vars (except NEXT_PUBLIC_BRAND_FOOTER per D-12).
 * PITFALL F: Fonts loaded from app/fonts/ at module init time (see og-fonts.ts).
 * D-12: footerBrand is env-var construction — domain literal is FORBIDDEN here; see CONTEXT.md §D-12.
 */

import { ImageResponse } from '@vercel/og';
import { createElement as h, type ReactElement } from 'react';
import { syneBold, spaceGrotesk, jetBrainsMono } from '@/lib/og-fonts';

export interface RenderFallbackOptions {
  /** The @handle to display in "by @{handle}". Defaults to "someone". Max 32 chars. */
  handle?: string;
  /** Override the footer brand string (used in tests to assert env-var behavior). */
  footerBrand?: string;
}

/**
 * Render the §16.6 Fallback OG card and return an ImageResponse.
 * @vercel/og automatically sets Content-Type: image/png.
 *
 * Cache-Control and X-Variant headers are set by the route handlers,
 * not here — this function is a pure renderer.
 */
export function renderFallback(options: RenderFallbackOptions = {}): ImageResponse {
  // T-00-18: bound handle input length; React createElement escapes by default
  const handle = ((options.handle ?? '') || 'someone').slice(0, 32);

  // D-12: footer brand constructed from env-var; domain literal is forbidden — see CONTEXT.md §D-12
  const footerBrand =
    options.footerBrand ??
    (process.env['NEXT_PUBLIC_BRAND_FOOTER'] ?? '[BRAND] · Be right in public.');

  return new ImageResponse(
    buildCard(handle, footerBrand),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Syne', data: syneBold, style: 'normal', weight: 700 },
        { name: 'SpaceGrotesk', data: spaceGrotesk, style: 'normal', weight: 400 },
        { name: 'JetBrainsMono', data: jetBrainsMono, style: 'normal', weight: 400 },
      ],
    }
  );
}

// ── Card layout ──────────────────────────────────────────────────────────────

/** Corner bracket positions */
type CornerPos = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

/** Render a corner bracket decoration at the given position */
function cornerBracket(pos: CornerPos): ReactElement {
  const yellow = '#E8F542';
  const base = {
    position: 'absolute' as const,
    width: 24,
    height: 24,
    display: 'flex' as const,
  };

  const styles: Record<CornerPos, Record<string, unknown>> = {
    topLeft:     { ...base, top: 16, left: 16,   borderTop: `4px solid ${yellow}`, borderLeft:  `4px solid ${yellow}` },
    topRight:    { ...base, top: 16, right: 16,  borderTop: `4px solid ${yellow}`, borderRight: `4px solid ${yellow}` },
    bottomLeft:  { ...base, bottom: 16, left: 16,  borderBottom: `4px solid ${yellow}`, borderLeft:  `4px solid ${yellow}` },
    bottomRight: { ...base, bottom: 16, right: 16, borderBottom: `4px solid ${yellow}`, borderRight: `4px solid ${yellow}` },
  };

  return h('div', { key: pos, style: styles[pos] });
}

/**
 * Build the card JSX tree using React.createElement (no JSX transform required).
 * All layout uses `display: flex` — Satori does NOT support display: grid (PITFALL 15).
 */
function buildCard(handle: string, footerBrand: string): ReactElement {
  return h(
    'div',
    {
      style: {
        width: '1200px',
        height: '630px',
        background: '#09090E',
        display: 'flex',               // PITFALL 15: flexbox only — Satori does not support display: grid
        flexDirection: 'column',
        position: 'relative',
        border: '3px solid #E8F542',   // §16.6 3px accent border
      },
    },
    // 4 corner brackets (§16.6)
    cornerBracket('topLeft'),
    cornerBracket('topRight'),
    cornerBracket('bottomLeft'),
    cornerBracket('bottomRight'),

    // Top row: CALL IT wordmark (Syne 48px) + "arbitrum mainnet" (JetBrainsMono 12px)
    h(
      'div',
      {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          padding: '40px 56px 0 56px',
        },
      },
      h('div', {
        style: { fontFamily: 'Syne', fontSize: 48, color: '#E8F542', display: 'flex' },
      }, 'CALL IT'),
      h('div', {
        style: { fontFamily: 'JetBrainsMono', fontSize: 12, color: '#94A3B8', display: 'flex' },
      }, 'arbitrum mainnet'),
    ),

    // Asymmetric hero — ~5% from left, Syne 64px + SpaceGrotesk 28px handle
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          padding: '80px 56px 0 56px',
          marginLeft: '5%',
        },
      },
      h('div', {
        style: { fontFamily: 'Syne', fontSize: 64, color: '#F1F5F9', display: 'flex', lineHeight: 1.05 },
      }, 'A CALL WAS MADE'),
      h('div', {
        style: { fontFamily: 'SpaceGrotesk', fontSize: 28, color: '#94A3B8', display: 'flex', marginTop: 16 },
      }, `by @${handle}`),
    ),

    // Subtext — SpaceGrotesk 18px
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          padding: '56px 56px 0 56px',
          marginLeft: '5%',
        },
      },
      h('div', {
        style: { fontFamily: 'SpaceGrotesk', fontSize: 18, color: '#94A3B8', display: 'flex' },
      }, 'The receipt is being prepared.'),
      h('div', {
        style: { fontFamily: 'SpaceGrotesk', fontSize: 18, color: '#94A3B8', display: 'flex' },
      }, 'Tap to view live.'),
    ),

    // Footer: brand string (SpaceGrotesk 14px) + ARBITRUM (JetBrainsMono 12px)
    h(
      'div',
      {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          position: 'absolute',
          bottom: 32,
          left: 56,
          right: 56,
        },
      },
      h('div', {
        style: { fontFamily: 'SpaceGrotesk', fontSize: 14, color: '#94A3B8', display: 'flex' },
      }, footerBrand),
      h('div', {
        style: { fontFamily: 'JetBrainsMono', fontSize: 12, color: '#94A3B8', display: 'flex' },
      }, '⬢ ARBITRUM'),
    ),
  );
}
