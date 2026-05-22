/**
 * Button — CVA-driven neobrutalist button
 *
 * 3 intents × 3 sizes per spec §14.6 / RESEARCH "Common Operation 3"
 * Hard offset shadow (no soft drop-shadow), hover/active translate.
 *
 * @example
 *   <Button intent="primary" size="md">Publish Call</Button>
 */
import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const button = cva(
  // Base classes — neobrutalist: 2px border, hard offset shadow, translate on interact
  [
    'inline-flex items-center justify-center',
    'font-body font-semibold',
    'border-2 border-black',
    'shadow-[4px_4px_0_0_#000]',
    'transition-transform duration-100 ease-out',
    'hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0_0_#000]',
    'active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0_0_#000]',
    'disabled:opacity-50 disabled:pointer-events-none',
    'cursor-pointer',
    'select-none',
  ],
  {
    variants: {
      intent: {
        primary: 'bg-brand-accent text-black border-black',
        secondary: 'bg-transparent text-white border-white shadow-[4px_4px_0_0_#fff]',
        danger: 'bg-outcome-loss text-white border-black',
      },
      size: {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-4 py-2 text-sm',
        lg: 'px-6 py-3 text-lg',
      },
    },
    defaultVariants: {
      intent: 'primary',
      size: 'md',
    },
  }
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof button>;

export function Button({ intent, size, className, children, ...props }: ButtonProps) {
  return (
    <button className={cn(button({ intent, size }), className)} {...props}>
      {children}
    </button>
  );
}
