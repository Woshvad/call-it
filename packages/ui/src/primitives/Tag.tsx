/**
 * Tag — inline pill with sharp corners and mono font
 *
 * 4 intents: info, success, warning, danger
 * No rounded-full — sharp neobrutalist edges.
 *
 * @example
 *   <Tag intent="success">CALLED IT</Tag>
 *   <Tag intent="info">PREVIEW</Tag>
 */
import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const tag = cva(
  [
    'inline-flex items-center',
    'px-2 py-0.5',
    'text-xs font-mono font-semibold',
    'border-2',
    'rounded-none',
  ],
  {
    variants: {
      intent: {
        info: 'border-brand-muted text-brand-muted',
        success: 'border-outcome-win text-outcome-win',
        warning: 'border-brand-accent text-brand-accent',
        danger: 'border-outcome-loss text-outcome-loss',
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
