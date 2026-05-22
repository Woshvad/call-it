/**
 * Card — neobrutalist structural wrapper
 *
 * Hard offset shadow in brand-accent, 3px border, dark surface bg.
 * Use the `accent` variant for highlighted cards.
 *
 * @example
 *   <Card>Content here</Card>
 *   <Card accent>Highlighted card</Card>
 */
import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const card = cva(
  [
    'relative',
    'border-3 border-white',
    'shadow-[6px_6px_0_0_#E8F542]',
    'bg-brand-surface',
    'p-6',
  ],
  {
    variants: {
      accent: {
        true: 'border-brand-accent',
        false: 'border-white',
      },
    },
    defaultVariants: {
      accent: false,
    },
  }
);

export type CardProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof card>;

export function Card({ accent, className, children, ...props }: CardProps) {
  return (
    <div className={cn(card({ accent }), className)} {...props}>
      {children}
    </div>
  );
}
