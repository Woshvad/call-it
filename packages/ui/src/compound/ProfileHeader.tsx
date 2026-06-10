/**
 * ProfileHeader — user profile identity header (UI-08, rethemed Phase 09.2)
 *
 * Prototype treatment (`call it frontend/screens/profile.jsx` identity block):
 * square avatar on the deterministic grad palette, Archivo 800 uppercase
 * handle, pill verified badges, JetBrains Mono metadata line with interpunct
 * separators built from REAL stats only (D-07 — nothing without a source).
 *
 * AUTH-44: No wallet address rendered — identity is handle + badges only.
 * FLEXBOX ONLY — Satori compatibility (Pitfall 15). No CSS grid layout.
 * Props API unchanged (Phase 09.2 plan 05 — chrome-only retheme).
 */

import { VerifiedBadge } from '../primitives/VerifiedBadge';
import { Tag } from '../primitives/Tag';

export type ProfileHeaderUser = {
  /** Public handle — shown as @handle */
  handle: string;
  /** Display name (optional — falls back to handle) */
  displayName?: string;
  /** Avatar URL (optional — falls back to initials) */
  avatarUrl?: string;
  /**
   * @deprecated Use verifiedX / verifiedFc (AUTH-09). Kept for back-compat —
   * a truthy `verified` maps to verifiedX when verifiedX is not set.
   */
  verified?: boolean;
  /** X (Twitter) link verified — renders VERIFIED · X (AUTH-09) */
  verifiedX?: boolean;
  /** Farcaster link verified — renders VERIFIED · FC (AUTH-09) */
  verifiedFc?: boolean;
  /** Top percentile rep (e.g. 5 = "TOP 5%") — Phase 2 wires */
  topPercent?: number;
  /** Call stats */
  stats?: {
    totalCalls: number;
    settledCalls: number;
    wins: number;
  };
};

export type ProfileHeaderProps = {
  user: ProfileHeaderUser;
  className?: string;
};

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

/**
 * Avatar grad palette — mirrors the app-cascade `.avatar-grad-{a..f}` recipes
 * (apps/web/app/globals.css). Local literals because packages/ui components
 * must render standalone (jsdom tests / non-app hosts) without the app
 * stylesheet in the cascade.
 */
const AVATAR_GRADS: ReadonlyArray<{ bg: string; fg: string }> = [
  { bg: '#E8F542', fg: '#000' },
  { bg: '#FB923C', fg: '#000' },
  { bg: '#A855F7', fg: '#fff' },
  { bg: '#22D3EE', fg: '#000' },
  { bg: '#F472B6', fg: '#000' },
  { bg: '#FBBF24', fg: '#000' },
];

/** Deterministic grad from the handle (charCode sum, same as the app shell). */
function gradFor(handle: string): { bg: string; fg: string } {
  let sum = 0;
  for (let i = 0; i < handle.length; i++) sum += handle.charCodeAt(i);
  return AVATAR_GRADS[sum % AVATAR_GRADS.length] ?? { bg: '#E8F542', fg: '#000' };
}

export function ProfileHeader({ user, className }: ProfileHeaderProps) {
  const displayName = user.displayName ?? user.handle;
  const initials = getInitials(displayName);
  const grad = gradFor(user.handle);
  const verifiedX = user.verifiedX ?? user.verified;

  // JBM metadata line — interpunct-separated, REAL stats only (D-07).
  const metaParts: string[] = [];
  if (user.displayName) metaParts.push(`@${user.handle}`);
  if (user.stats) {
    metaParts.push(`${user.stats.totalCalls} call${user.stats.totalCalls === 1 ? '' : 's'}`);
    metaParts.push(`${user.stats.settledCalls} settled`);
    metaParts.push(`${user.stats.wins} win${user.stats.wins === 1 ? '' : 's'}`);
  }

  return (
    <div className={`flex flex-row items-start gap-5 ${className ?? ''}`}>
      {/* Square avatar — radius 0, grad palette (prototype .avatar xl) */}
      <div className="flex-shrink-0">
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={`@${user.handle} avatar`}
            style={{
              width: '80px',
              height: '80px',
              objectFit: 'cover',
              border: '3px solid var(--border-strong)',
              borderRadius: 0,
            }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              width: '80px',
              height: '80px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: grad.bg,
              color: grad.fg,
              border: '3px solid var(--border-strong)',
              borderRadius: 0,
              fontFamily: 'var(--font-display)',
              fontWeight: 900,
              fontSize: '32px',
            }}
          >
            {initials}
          </div>
        )}
      </div>

      {/* Handle + pill badges + metadata */}
      <div className="flex flex-col gap-3">
        {/* Handle — Archivo 800 uppercase display (AUTH-44: handle, never address) */}
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 'clamp(28px, 7vw, 44px)',
            letterSpacing: '-0.04em',
            lineHeight: 0.95,
            textTransform: 'uppercase',
            color: 'var(--text-primary)',
            overflowWrap: 'anywhere',
          }}
        >
          {user.displayName ?? `@${user.handle}`}
        </span>

        {/* Pill badges (prototype .pill recipe via Tag/VerifiedBadge) */}
        {(verifiedX || user.verifiedFc || user.topPercent !== undefined) && (
          <div className="flex flex-row flex-wrap items-center gap-2">
            <VerifiedBadge verifiedX={verifiedX} verifiedFc={user.verifiedFc} />
            {user.topPercent !== undefined && (
              <Tag intent="warning">TOP {user.topPercent}%</Tag>
            )}
          </div>
        )}

        {/* JBM overline metadata — interpunct separators, real stats only (D-07) */}
        {metaParts.length > 0 && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              letterSpacing: '0.02em',
              color: 'var(--text-tertiary)',
            }}
          >
            {metaParts.join(' · ')}
          </span>
        )}
      </div>
    </div>
  );
}
