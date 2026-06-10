/**
 * Toast — 3-status stacking toast with countdown drain animation (D-19)
 *
 * Phase 09.2 retheme: radius 0, 2px border, bg var(--bg-secondary)
 * (brand-surface alias), brutal black shadow. Enter animation uses the
 * app-cascade `fadeIn` keyframe (apps/web/app/globals.css) — the previous
 * tailwindcss-animate utilities (animate-in/slide-in-*) were removed: that
 * plugin was never registered, so they were latent no-ops.
 *
 * Built on Radix Toast primitives for a11y (focus management, screen reader announcements).
 * Countdown bar drains over `duration` ms via the `drain` CSS keyframe (app cascade).
 * framer-motion is NOT used here — CSS animation is sufficient (scope restriction: framer-motion
 * is limited to Stamp only per RESEARCH "Standard Stack").
 *
 * Status → styling:
 *   success → border var(--accent-win)  (outcome-win)
 *   info    → border-brand-accent
 *   error   → border var(--accent-loss) (outcome-loss #F87171)
 */
import * as ToastPrimitive from '@radix-ui/react-toast';
import { cva } from 'class-variance-authority';
import { cn } from '../lib/cn';
import { CornerBrackets } from './CornerBrackets';
import type { ToastItem } from '../hooks/useToast';

const toastVariants = cva(
  [
    'relative overflow-hidden',
    'flex flex-col gap-1',
    'min-w-[280px] max-w-[380px]',
    'p-4',
    'border-2',
    'rounded-none',
    'bg-brand-surface text-brand-text',
    'shadow-[4px_4px_0_0_#000]',
    'animate-[fadeIn_0.18s_linear]',
  ],
  {
    variants: {
      status: {
        success: 'border-outcome-win',
        info: 'border-brand-accent',
        error: 'border-outcome-loss',
      },
    },
    defaultVariants: {
      status: 'info',
    },
  }
);

const countdownVariants = cva(
  ['absolute bottom-0 left-0 h-1'],
  {
    variants: {
      status: {
        success: 'bg-outcome-win',
        info: 'bg-brand-accent',
        error: 'bg-outcome-loss',
      },
    },
    defaultVariants: {
      status: 'info',
    },
  }
);

export type ToastProps = {
  toast: ToastItem;
  onDismiss: (id: string) => void;
};

export function Toast({ toast, onDismiss }: ToastProps) {
  return (
    <ToastPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open) onDismiss(toast.id);
      }}
      duration={toast.duration}
      data-toast-status={toast.status}
      className={cn(toastVariants({ status: toast.status }))}
    >
      <CornerBrackets />
      <ToastPrimitive.Title className="font-body font-semibold text-sm pr-4">
        {toast.message}
      </ToastPrimitive.Title>

      {/* Optional action button (AUTH-24: Export wallet) */}
      {toast.action && (
        <ToastPrimitive.Action
          altText={toast.action.label}
          onClick={toast.action.onClick}
          className="self-start mt-1 px-3 py-1 text-xs font-mono font-semibold border border-current bg-transparent cursor-pointer hover:opacity-80"
          data-toast-action
        >
          {toast.action.label}
        </ToastPrimitive.Action>
      )}

      {/* Countdown drain bar */}
      <div
        data-countdown
        className={cn(countdownVariants({ status: toast.status }))}
        style={{
          animation: `drain ${toast.duration}ms linear forwards`,
          animationPlayState: 'running',
        }}
      />
    </ToastPrimitive.Root>
  );
}
