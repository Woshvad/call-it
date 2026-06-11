/**
 * /disputes/ layout — minimal wrapper
 *
 * Phase 4 Plan 04-08: Public disputes log + owner-gated resolve admin.
 * Page frame: 3px border-active + 4px accent-win corner brackets (consistent with receipt frame).
 */

import type { ReactNode, CSSProperties } from 'react';

export const metadata = {
  title: 'Disputes — Call It',
  description: 'Every dispute, public and on the record.',
};

export default function DisputesLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: 'relative',
        border: '3px solid var(--border-active)',
        minHeight: '100vh',
        backgroundColor: '#09090E',
      }}
    >
      {/* 4px accent-win corner brackets — consistent with receipt page (UI-14); class=corner-brackets */}
      {[
        { top: 0, left: 0, borderTop: '4px solid var(--accent-win)', borderLeft: '4px solid var(--accent-win)' } as CSSProperties,
        { top: 0, right: 0, borderTop: '4px solid var(--accent-win)', borderRight: '4px solid var(--accent-win)' } as CSSProperties,
        { bottom: 0, left: 0, borderBottom: '4px solid var(--accent-win)', borderLeft: '4px solid var(--accent-win)' } as CSSProperties,
        { bottom: 0, right: 0, borderBottom: '4px solid var(--accent-win)', borderRight: '4px solid var(--accent-win)' } as CSSProperties,
      ].map((s, i) => (
        <div key={i} className="corner-brackets" style={{ position: 'absolute', width: 24, height: 24, ...s }} />
      ))}
      {children}
    </div>
  );
}
