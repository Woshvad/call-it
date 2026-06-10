/**
 * Button — CVA-driven brutalist button (prototype `.btn` recipe, Phase 09.2)
 *
 * 8 intents × 4 sizes. Archivo display voice (font-display), uppercase,
 * radius 0, 2px border, 0.08s linear transitions.
 *
 * Intent map (09.2-UI-SPEC Component Mapping + PATTERNS §5):
 *   primary / cream   → `.btn.cream` signature CTA: cream bg (--bg-inverse),
 *                       black text, 2px black border, brutal shadow, and the
 *                       cream press physics — hover translate(2px,2px) +
 *                       shadow-sm, active translate(4px,4px) + NO shadow
 *                       (down-right, the opposite of the legacy up-left hover).
 *   secondary / outline-white → `.btn.outline-white`: transparent, 2px white border.
 *   danger / fade     → loss-styled: transparent, 2px --accent-loss border + text.
 *   duel              → 2px #A855F7 border + text (duel identity ONLY, D-03).
 *   ghost             → borderless, --text-secondary, hover white.
 *
 * The accent chartreuse is NEVER a button background — the primary CTA is
 * CREAM, not chartreuse (UI-SPEC color reservation).
 *
 * @example
 *   <Button intent="primary" size="md">Publish Call</Button>
 *   <Button intent="fade" size="big">FADE</Button>
 */
import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

// Shared recipes (aliased intents stay byte-identical)
const CREAM_RECIPE =
  'bg-brand-cream text-black border-black font-extrabold shadow-[4px_4px_0_0_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_#000] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none';
const OUTLINE_WHITE_RECIPE =
  'bg-transparent text-white border-white hover:bg-[rgba(255,255,255,0.04)]';
const FADE_RECIPE =
  'bg-transparent text-outcome-loss border-outcome-loss hover:bg-[rgba(248,113,113,0.08)]';

const button = cva(
  // Base — prototype .btn: Archivo 700 13px uppercase 0.04em, 2px border,
  // radius 0, 0.08s linear transition (font-size lives in the size variants)
  [
    'inline-flex items-center justify-center gap-2',
    'font-display font-bold uppercase tracking-[0.04em]',
    'border-2 border-[var(--border-active)]',
    'rounded-none',
    'whitespace-nowrap',
    'transition-all duration-[80ms] ease-linear',
    'disabled:opacity-50 disabled:pointer-events-none',
    'cursor-pointer',
    'select-none',
  ],
  {
    variants: {
      intent: {
        // primary → the .btn.cream recipe (the brutalist signature CTA)
        primary: CREAM_RECIPE,
        // secondary → .btn.outline-white
        secondary: OUTLINE_WHITE_RECIPE,
        // danger → loss-styled outline (same recipe as fade)
        danger: FADE_RECIPE,
        // NEW intents (prototype .btn.* recipes)
        cream: CREAM_RECIPE,
        fade: FADE_RECIPE,
        duel: 'bg-transparent text-[#A855F7] border-[#A855F7] hover:bg-[rgba(168,85,247,0.08)]',
        'outline-white': OUTLINE_WHITE_RECIPE,
        ghost:
          'bg-transparent border-transparent text-brand-muted normal-case tracking-normal font-body font-medium hover:text-white hover:border-[var(--border-active)]',
      },
      size: {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-5 py-3 text-[13px]',
        lg: 'px-6 py-3 text-lg',
        // .btn.big — padding 18px/28px, 15px, 3px border
        big: 'px-7 py-[18px] text-[15px] border-[3px]',
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
