/**
 * CallCard — feed row variant composing Card + handle + market line + conviction + time-left
 *
 * FLEXBOX ONLY — Satori compatibility (Pitfall 15). No grid.
 */
import { Card } from '../primitives/Card';
import { Tag } from '../primitives/Tag';
import { VerifiedBadge } from '../primitives/VerifiedBadge';

export type CallCardData = {
  handle: string;
  marketLine: string;
  conviction: number;
  deadline: Date;
  stake: number | bigint;
  status?: 'live' | 'settled' | 'preview';
  /** X (Twitter) link verified — renders VERIFIED · X next to the handle (AUTH-09) */
  verifiedX?: boolean;
  /** Farcaster link verified — renders VERIFIED · FC next to the handle (AUTH-09) */
  verifiedFc?: boolean;
};

export type CallCardProps = {
  call: CallCardData;
  className?: string;
  onClick?: () => void;
};

function formatTimeLeft(deadline: Date): string {
  const now = Date.now();
  const diff = deadline.getTime() - now;
  if (diff <= 0) return 'Expired';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

export function CallCard({ call, className, onClick }: CallCardProps) {
  return (
    <Card className={className} onClick={onClick}>
      {/* Top: handle (+ verified badge) + time-left */}
      <div className="flex flex-row items-center justify-between mb-2">
        <div className="flex flex-row items-center gap-2">
          <span className="font-mono text-sm text-brand-muted">@{call.handle}</span>
          <VerifiedBadge verifiedX={call.verifiedX} verifiedFc={call.verifiedFc} />
        </div>
        <span className="font-mono text-xs text-brand-muted">{formatTimeLeft(call.deadline)}</span>
      </div>

      {/* Market line */}
      <div className="flex flex-col mb-3">
        <span className="font-display font-bold text-brand-text leading-tight">
          {call.marketLine}
        </span>
      </div>

      {/* Bottom: conviction + status */}
      <div className="flex flex-row items-center gap-3">
        <span className="font-mono font-bold text-brand-accent">{call.conviction}%</span>
        {call.status === 'live' && <Tag intent="warning">LIVE</Tag>}
        {call.status === 'settled' && <Tag intent="success">SETTLED</Tag>}
        {call.status === 'preview' && <Tag intent="info">PREVIEW</Tag>}
      </div>
    </Card>
  );
}
