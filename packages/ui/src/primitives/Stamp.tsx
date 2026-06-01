/**
 * Stamp — framer-motion overshoot scale animation
 *
 * Used for CALLED IT / LOUD AND WRONG / CONTRARIAN HIT receipt outcomes.
 * scale: [1.2, 1.0] with overshoot cubic-bezier, ~400ms duration.
 * boxShadow: 0→4px 4px 0 {color} expansion, ~300ms ease-out (UI-45).
 * prefers-reduced-motion: CSS fade-in fallback (a11y per spec §15.7).
 *
 * framer-motion usage is SCOPED TO THIS FILE (+ Toast live-pulse in Task 2).
 * No other component in packages/ui/src/ imports framer-motion.
 *
 * Phase 4 (Plan 04-07): Added hexColor? prop for CONTRARIAN HIT + COLD CALL + FADED CORRECTLY.
 * The existing StampColor token map has #A855F7 for outcome-contrarian (violates §14.1).
 * Pass hexColor to use the locked §14.1 hex directly, bypassing the stale token.
 * Existing callers using the StampColor token map are unchanged.
 *
 * @example
 *   <Stamp word="CALLED IT" color="outcome-win" />
 *   <Stamp word="CONTRARIAN HIT" hexColor="#E8F542" color="outcome-contrarian" />
 *   <Stamp word="COLD CALL" hexColor="#94A3B8" color="brand-muted" />
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
  /**
   * Optional explicit hex color override for the text, border, and boxShadow.
   * Use for outcomes where the StampColor token is stale (e.g., CONTRARIAN HIT).
   * §14.1 authoritative hex: CONTRARIAN HIT = #E8F542, COLD CALL = #94A3B8,
   * FADED CORRECTLY = #E8F542. When provided, takes precedence over COLOR_MAP[color].
   */
  hexColor?: string;
  className?: string;
};

const COLOR_CLASS: Record<StampColor, string> = {
  'outcome-win': 'text-outcome-win border-outcome-win',
  'outcome-loss': 'text-outcome-loss border-outcome-loss',
  'outcome-contrarian': 'text-outcome-contrarian border-outcome-contrarian',
  'brand-muted': 'text-brand-muted border-brand-muted',
  'brand-accent': 'text-brand-accent border-brand-accent',
};

export function Stamp({ word, color, hexColor, className }: StampProps) {
  const prefersReducedMotion = useReducedMotion();
  // Use explicit hexColor when provided (§14.1 mandate); fall back to token map.
  const colorHex = hexColor ?? COLOR_MAP[color] ?? '#ffffff';

  if (prefersReducedMotion) {
    // a11y fallback: simple CSS fade-in (no transform, no boxShadow animation)
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
      initial={{ scale: 1.2, opacity: 0, boxShadow: '0 0 0 transparent' }}
      animate={{
        scale: 1.0,
        opacity: 1,
        boxShadow: `4px 4px 0 ${colorHex}`,
      }}
      transition={{
        scale: {
          duration: 0.4,
          ease: [0.34, 1.56, 0.64, 1], // overshoot cubic-bezier
        },
        opacity: { duration: 0.3 },
        boxShadow: { duration: 0.35, ease: 'easeOut' }, // ~300-400ms shadow expansion (UI-45)
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
