'use client';

/**
 * DesktopOnlyBanner — Phase 9 mobile-responsive (UI-50 / D-08 / D-09).
 *
 * The 3 non-critical pages (Duel §15.5, Quote composer §15.10, New Call §15.2)
 * were scope-cut from the responsive pass. Instead of a responsive retrofit they
 * surface this honest, dismissible "Best viewed on desktop" banner.
 *
 * Behaviour:
 *   - Renders `null` unless `isMobile && !dismissed` — therefore ABSENT at desktop
 *     AND absent on the 7 critical pages (they never mount it).
 *   - D-08 warn-but-allow: the banner is NORMAL FLOW (not `position:fixed`/overlay),
 *     so it pushes the (non-responsive) page DOWN and the page stays fully
 *     interactive below it. It never covers the page's controls or the hamburger
 *     drawer (09-02), so return navigation / sign-out is never blocked (SC2).
 *   - D-09 dismissible-for-session: an `[×]` button flips local `dismissed` state.
 *     No persistence — re-shows on a fresh session.
 *
 * Mount sites (net 2 files, UI-SPEC Desktop-Only Banner Contract):
 *   - app/new/page.tsx — covers New Call AND the `?quote=` quote composer (same file).
 *   - app/duel/[challengeId]/page.tsx.
 *
 * Copy + styling tokens are locked by the UI-SPEC Copywriting Contract +
 * Desktop-Only Banner Contract.
 */

import { useState } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';

export function DesktopOnlyBanner() {
  const isMobile = useIsMobile();
  const [dismissed, setDismissed] = useState(false);

  // Absent at desktop, absent on the 7 critical pages (never mounted there),
  // and gone once dismissed for the session.
  if (!isMobile || dismissed) return null;

  return (
    <div
      style={{
        border: '3px solid #E8F542',
        boxShadow: '4px 4px 0 0 #E8F542',
        background: '#13131D',
        padding: '12px 14px',
        margin: '12px 16px',
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: '12px',
      }}
    >
      <div>
        <strong
          style={{
            color: '#E8F542',
            fontFamily: 'monospace',
            textTransform: 'uppercase',
          }}
        >
          Best viewed on desktop
        </strong>
        <p style={{ color: '#94A3B8', fontSize: '13px', margin: '4px 0 0' }}>
          This page isn&apos;t optimized for small screens yet. Use the menu to navigate away.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        style={{
          minWidth: 44,
          minHeight: 44,
          background: 'transparent',
          border: 'none',
          color: '#E8F542',
          fontSize: 20,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
