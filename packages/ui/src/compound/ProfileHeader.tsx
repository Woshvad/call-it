/**
 * ProfileHeader — user profile header (UI-08)
 *
 * Shows: avatar (initials fallback) + handle + verified badge slot + TOP X% rep slot + stats
 * AUTH-44: No wallet address rendered.
 *
 * FLEXBOX ONLY — Satori compatibility (Pitfall 15). No grid.
 */

export type ProfileHeaderUser = {
  /** Public handle — shown as @handle */
  handle: string;
  /** Display name (optional — falls back to handle) */
  displayName?: string;
  /** Avatar URL (optional — falls back to initials) */
  avatarUrl?: string;
  /** Verified (Phase 1.5 wires the VERIFIED·X badge) */
  verified?: boolean;
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

export function ProfileHeader({ user, className }: ProfileHeaderProps) {
  const displayName = user.displayName ?? user.handle;
  const initials = getInitials(displayName);

  return (
    <div className={`flex flex-col gap-4 ${className ?? ''}`}>
      {/* Top row: avatar + name + badges */}
      <div className="flex flex-row items-center gap-4">
        {/* Avatar */}
        <div className="flex-shrink-0">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={`@${user.handle} avatar`}
              className="w-16 h-16 border-2 border-brand-accent object-cover"
            />
          ) : (
            <div className="w-16 h-16 flex items-center justify-center bg-brand-surface border-2 border-brand-accent">
              <span className="font-display font-bold text-brand-accent text-xl">{initials}</span>
            </div>
          )}
        </div>

        {/* Name + handle + badges */}
        <div className="flex flex-col gap-1">
          <div className="flex flex-row items-center gap-2">
            <span className="font-display font-bold text-brand-text text-xl">{displayName}</span>
            {user.verified && (
              <span className="font-mono text-xs text-brand-accent border border-brand-accent px-1">
                VERIFIED
              </span>
            )}
          </div>
          <span className="font-mono text-sm text-brand-muted">@{user.handle}</span>
          {user.topPercent !== undefined && (
            <span className="font-mono text-xs text-brand-accent">TOP {user.topPercent}%</span>
          )}
        </div>
      </div>

      {/* Stats row */}
      {user.stats && (
        <div className="flex flex-row gap-6">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono font-bold text-brand-text text-lg">{user.stats.totalCalls}</span>
            <span className="font-body text-xs text-brand-muted">Total Calls</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-mono font-bold text-brand-text text-lg">{user.stats.settledCalls}</span>
            <span className="font-body text-xs text-brand-muted">Settled</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-mono font-bold text-outcome-win text-lg">{user.stats.wins}</span>
            <span className="font-body text-xs text-brand-muted">Wins</span>
          </div>
        </div>
      )}
    </div>
  );
}
