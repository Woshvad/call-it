/**
 * Tag — inline pill (prototype `.pill` recipe, Phase 09.2)
 *
 * JBM (font-mono) 11px weight 600, uppercase, 0.06em tracking, padding 3px/8px,
 * 1px intent-colored border, radius 0. inline-flex ONLY — NEVER block/grid
 * (Satori parity, Pitfall 15).
 *
 * Original intents (info/success/warning/danger) kept for consumers; pill
 * variant intents (win/loss/duel/neutral/muted) added per the donor recipes.
 *
 * @example
 *   <Tag intent="success">CALLED IT</Tag>
 *   <Tag intent="duel">OPEN</Tag>
 */
import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const tag = cva(
  [
    'inline-flex items-center gap-[5px]',
    'px-2 py-[3px]',
    'font-mono text-[11px] font-semibold uppercase tracking-[0.06em]',
    'border',
    'rounded-none',
    'whitespace-nowrap leading-[1.4]',
  ],
  {
    variants: {
      intent: {
        // Original keys — consumers reference these (D-02)
        info: 'border-brand-muted text-brand-muted',
        success: 'border-outcome-win text-outcome-win',
        warning: 'border-brand-accent text-brand-accent',
        danger: 'border-outcome-loss text-outcome-loss',
        // Prototype .pill.* variant keys
        win: 'border-outcome-win text-outcome-win',
        loss: 'border-outcome-loss text-outcome-loss',
        duel: 'border-[var(--accent-duel)] text-[var(--accent-duel)]',
        neutral: 'border-[var(--accent-neutral)] text-[var(--accent-neutral)]',
        muted: 'border-[var(--text-tertiary)] text-[var(--text-tertiary)]',
      },
    },
    defaultVariants: {
      intent: 'info',
    },
  }
);

export type TagProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof tag>;

export function Tag({ intent, className, children, ...props }: TagProps) {
  return (
    <span className={cn(tag({ intent }), className)} {...props}>
      {children}
    </span>
  );
}
