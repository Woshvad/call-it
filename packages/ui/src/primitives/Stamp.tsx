/**
 * Stamp — framer-motion overshoot scale animation
 *
 * Used for CALLED IT / LOUD AND WRONG / CONTRARIAN HIT receipt outcomes.
 * scale: [1.2, 1.0] with overshoot cubic-bezier, ~400ms duration.
 * prefers-reduced-motion: CSS fade-in fallback (a11y per spec §15.7).
 *
 * framer-motion usage is SCOPED TO THIS FILE (+ Toast live-pulse in Task 2).
 * No other component in packages/ui/src/ imports framer-motion.
 *
 * @example
 *   <Stamp word="CALLED IT" color="outcome-win" />
 */
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '../lib/cn';
import { COLOR_MAP, type BrandColor } from '../tokens/colors';

export type StampColor = Extract<
  BrandColor,
  'outcome-win' | 'outcome-loss' | 'outcome-contrarian' | 'brand-muted' | 'brand-accent'
>;

export type StampProps = {
  word: string;
  color: StampColor;
  className?: string;
};

const COLOR_CLASS: Record<StampColor, string> = {
  'outcome-win': 'text-outcome-win border-outcome-win',
  'outcome-loss': 'text-outcome-loss border-outcome-loss',
  'outcome-contrarian': 'text-outcome-contrarian border-outcome-contrarian',
  'brand-muted': 'text-brand-muted border-brand-muted',
  'brand-accent': 'text-brand-accent border-brand-accent',
};

export function Stamp({ word, color, className }: StampProps) {
  const prefersReducedMotion = useReducedMotion();
  const colorHex = COLOR_MAP[color] ?? '#ffffff';

  if (prefersReducedMotion) {
    // a11y fallback: simple CSS fade-in
    return (
      <div
        className={cn(
          'inline-block font-display font-black text-4xl uppercase tracking-wider',
          'border-4 px-4 py-2 rotate-[-5deg]',
          'opacity-0 animate-[fadeIn_0.4s_ease-out_forwards]',
          COLOR_CLASS[color],
          className
        )}
        style={{ color: colorHex, borderColor: colorHex }}
      >
        {word}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ scale: 1.2, opacity: 0 }}
      animate={{ scale: 1.0, opacity: 1 }}
      transition={{
        duration: 0.4,
        ease: [0.34, 1.56, 0.64, 1], // overshoot cubic-bezier
      }}
      className={cn(
        'inline-block font-display font-black text-4xl uppercase tracking-wider',
        'border-4 px-4 py-2 rotate-[-5deg]',
        COLOR_CLASS[color],
        className
      )}
      style={{ color: colorHex, borderColor: colorHex }}
    >
      {word}
    </motion.div>
  );
}
