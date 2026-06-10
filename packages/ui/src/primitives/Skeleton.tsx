/**
 * Skeleton — 6 skeleton variants (Phase 09.2 retheme)
 *
 * Radius 0, hard edges, slow opacity pulse on var(--bg-tertiary).
 * NO shimmer / NO animate-pulse / NO animate-shimmer utility — the pulse is
 * the app-cascade `liveDot` opacity keyframe at a slow 2s cadence.
 * Variants map to distinct layout-placeholder dimensions.
 *
 * Named exports for tree-shaking convenience:
 *   SkeletonFeedCard, SkeletonReceipt, SkeletonProfileHeader,
 *   SkeletonLeaderboardRow, SkeletonDuelCard, SkeletonListItem
 *
 * @example
 *   <Skeleton variant="feedCard" />
 */
import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const skeleton = cva(
  // Base: hard-edged block on --bg-tertiary with a slow opacity pulse
  [
    'bg-[var(--bg-tertiary)]',
    'border border-[var(--border-subtle)]',
    'rounded-none',
    'animate-[liveDot_2s_ease-in-out_infinite]',
  ],
  {
    variants: {
      variant: {
        feedCard: 'w-full h-32',
        receipt: 'w-full h-64',
        profileHeader: 'w-full h-24',
        leaderboardRow: 'w-full h-16',
        duelCard: 'w-full h-48',
        listItem: 'w-full h-12',
      },
    },
    defaultVariants: {
      variant: 'feedCard',
    },
  }
);

export type SkeletonProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof skeleton>;

export function Skeleton({ variant, className, ...props }: SkeletonProps) {
  return (
    <div
      role="presentation"
      className={cn(skeleton({ variant }), className)}
      {...props}
    />
  );
}

// Named convenience exports
export const SkeletonFeedCard = () => <Skeleton variant="feedCard" />;
export const SkeletonReceipt = () => <Skeleton variant="receipt" />;
export const SkeletonProfileHeader = () => <Skeleton variant="profileHeader" />;
export const SkeletonLeaderboardRow = () => <Skeleton variant="leaderboardRow" />;
export const SkeletonDuelCard = () => <Skeleton variant="duelCard" />;
export const SkeletonListItem = () => <Skeleton variant="listItem" />;
