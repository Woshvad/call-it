/**
 * Card — brutalist structural wrapper (prototype `.brutal-card` recipe, Phase 09.2)
 *
 * Base: bg var(--bg-secondary), 2px var(--border-subtle) border, p-6, radius 0.
 * All shadows are BLACK — the legacy 6px chartreuse accent offset is gone.
 *
 * Variants (prototype .brutal-card.*):
 *   heavy       → 3px white border + brutal black shadow
 *   hero        → heavy + p-8
 *   cream       → cream bg (--bg-inverse), black text, 3px black border, brutal shadow
 *   interactive → hover: white border + brutal shadow + translate(-2px,-2px)
 *
 * The `accent` prop stays functional (consumers assert `<Card accent`) and now
 * renders a 3px var(--border-accent) accent BORDER (the accent shadow died).
 *
 * @example
 *   <Card>Content here</Card>
 *   <Card variant="hero">Hero receipt</Card>
 *   <Card accent>Highlighted card</Card>
 */
import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const card = cva(
  [
    'relative',
    'bg-[var(--bg-secondary)]',
    'border-2 border-[var(--border-subtle)]',
    'rounded-none',
    'p-6',
    'transition-all duration-[120ms] ease-linear',
  ],
  {
    variants: {
      variant: {
        default: '',
        heavy: 'border-[3px] border-white shadow-[4px_4px_0_0_#000]',
        hero: 'border-[3px] border-white shadow-[4px_4px_0_0_#000] p-8',
        cream:
          'bg-[var(--bg-inverse)] text-black border-[3px] border-black shadow-[4px_4px_0_0_#000]',
        interactive:
          'cursor-pointer hover:border-white hover:shadow-[4px_4px_0_0_#000] hover:-translate-x-[2px] hover:-translate-y-[2px]',
      },
      // Accent prop = 3px accent border (the legacy accent SHADOW is removed)
      accent: {
        true: 'border-[3px] border-[var(--border-accent)]',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      accent: false,
    },
  }
);

export type CardProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof card>;

export function Card({ variant, accent, className, children, ...props }: CardProps) {
  return (
    <div className={cn(card({ variant, accent }), className)} {...props}>
      {children}
    </div>
  );
}
