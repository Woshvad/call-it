'use client';
/**
 * Icon — inline SVG line-icon set ported from the prototype
 * (`call it frontend/components.jsx` lines 4-61).
 *
 * Canon (D-01): 1.5px stroke, strokeLinecap="square", strokeLinejoin="miter" —
 * hard corners everywhere, matching the radius-0 design language.
 *
 * Ported LAZILY per plan 09.2-03: only the names the shell + obvious later
 * screens reference. Add further names from the prototype registry as later
 * plans need them — never blind-copy the full 45-name set.
 *
 * Lives in apps/web/app/components (NOT packages/ui) — page-level usage only;
 * Satori/OG paths never import this file.
 */

import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'feed'
  | 'create'
  | 'receipt'
  | 'profile'
  | 'duel'
  | 'leaderboard'
  | 'search'
  | 'bell'
  | 'settings'
  | 'book'
  | 'arrowUp'
  | 'arrowDown'
  | 'arrowRight'
  | 'check'
  | 'x'
  | 'chevron'
  | 'chevronDown'
  | 'clock'
  | 'sparkline'
  | 'dot'
  | 'wallet'
  | 'plus'
  | 'minus'
  | 'warning';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/** Path registry — verbatim from the prototype Icon component. */
function paths(name: IconName, color: string): ReactNode {
  switch (name) {
    case 'feed':
      return <path d="M3 5h18M3 12h18M3 19h12" />;
    case 'create':
    case 'plus':
      return <path d="M12 5v14M5 12h14" />;
    case 'receipt':
      return (
        <>
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
          <path d="M9 8h6M9 12h6M9 16h4" />
        </>
      );
    case 'profile':
      return (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
        </>
      );
    case 'duel':
      return <path d="m14.5 14.5 6.5 6.5M3 3l6.5 6.5M9.5 14.5 3 21M21 3l-6.5 6.5" />;
    case 'leaderboard':
      return <path d="M6 21V10M12 21V4M18 21v-7" />;
    case 'search':
      return (
        <>
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </>
      );
    case 'bell':
      return (
        <>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9z" />
          <path d="M10 21h4" />
        </>
      );
    case 'settings':
      return (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.5a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.3-.9a7 7 0 0 0 2 1.2L10 21h4l.6-2.5a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" />
        </>
      );
    case 'book':
      return (
        <>
          <path d="M4 5a2 2 0 0 1 2-2h14v18H6a2 2 0 0 1-2-2V5z" />
          <path d="M4 17h16" />
        </>
      );
    case 'arrowUp':
      return <path d="M7 17 17 7M9 7h8v8" />;
    case 'arrowDown':
      return <path d="M17 7 7 17M7 9v8h8" />;
    case 'arrowRight':
      return <path d="M5 12h14M13 6l6 6-6 6" />;
    case 'check':
      return <path d="m5 13 4 4L19 7" />;
    case 'x':
      return <path d="M6 6l12 12M18 6 6 18" />;
    case 'chevron':
      return <path d="m9 6 6 6-6 6" />;
    case 'chevronDown':
      return <path d="m6 9 6 6 6-6" />;
    case 'clock':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      );
    case 'sparkline':
      return <path d="M3 16l4-5 4 3 4-7 6 6" />;
    case 'dot':
      return <circle cx="12" cy="12" r="3" fill={color} stroke="none" />;
    case 'wallet':
      return (
        <>
          <path d="M3 7c0-1 1-2 2-2h13v2" />
          <rect x="3" y="7" width="18" height="13" />
          <circle cx="16" cy="13.5" r="1.2" fill={color} stroke="none" />
        </>
      );
    case 'minus':
      return <path d="M5 12h14" />;
    case 'warning':
      return (
        <>
          <path d="M12 3 2 21h20L12 3z" />
          <path d="M12 10v5M12 18v.5" />
        </>
      );
    default:
      return null;
  }
}

export function Icon({
  name,
  size = 16,
  color = 'currentColor',
  strokeWidth = 1.5,
  ...props
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      {...props}
    >
      {paths(name, color)}
    </svg>
  );
}
