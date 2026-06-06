/**
 * @call-it/ui — design system barrel export
 *
 * All primitives, compounds, and hooks are exported from here.
 * apps/web imports from '@call-it/ui' directly.
 *
 * Primitives: Button, Card, Tag, VerifiedBadge, Toast, ToastProvider, CornerBrackets, Skeleton, Stamp
 * Compounds: Receipt, ConvictionBar, CallCard, ProfileHeader
 * Hooks: useToast
 * Tokens: colors, typography, spacing
 */

// Primitives
export { Button, type ButtonProps } from './primitives/Button';
export { Card, type CardProps } from './primitives/Card';
export { Tag, type TagProps } from './primitives/Tag';
export { VerifiedBadge, type VerifiedBadgeProps } from './primitives/VerifiedBadge';
export { CornerBrackets } from './primitives/CornerBrackets';
export {
  Skeleton,
  SkeletonFeedCard,
  SkeletonReceipt,
  SkeletonProfileHeader,
  SkeletonLeaderboardRow,
  SkeletonDuelCard,
  SkeletonListItem,
  type SkeletonProps,
} from './primitives/Skeleton';
export { Stamp, type StampProps, type StampColor } from './primitives/Stamp';
export { Toast, type ToastProps } from './primitives/Toast';
export { ToastProvider } from './primitives/ToastProvider';

// Hooks
export { useToast, ToastContext, type ToastItem, type ToastStatus, type ToastAction, type ToastContextValue } from './hooks/useToast';

// Compounds
export { Receipt, type ReceiptProps, type ReceiptData } from './compound/Receipt';
export { ConvictionBar, type ConvictionBarProps } from './compound/ConvictionBar';
export { CallCard, type CallCardProps, type CallCardData } from './compound/CallCard';
export { ProfileHeader, type ProfileHeaderProps, type ProfileHeaderUser } from './compound/ProfileHeader';
export { MarketPositioningBar, type MarketPositioningBarProps } from './compound/MarketPositioningBar';
export { FollowFadeModal, type FollowFadeModalProps } from './compound/FollowFadeModal';
export { CallerExitModal, type CallerExitModalProps } from './compound/CallerExitModal';
export { PositionExitModal, type PositionExitModalProps } from './compound/PositionExitModal';

// Utilities
export { cn } from './lib/cn';

// Tokens
export * from './tokens/colors';
export * from './tokens/typography';
export * from './tokens/spacing';
