/**
 * Stamp — framer-motion overshoot stamp (prototype `.outcome-stamp` recipe, Phase 09.2)
 *
 * Used for CALLED IT / LOUD AND WRONG / CONTRARIAN HIT receipt outcomes.
 * Visuals: font-size clamp(56px, 17vw, 120px), Archivo 900 (font-display),
 * uppercase, line-height 0.85, rotate(-1deg), text-shadow 4px 4px 0 #000.
 * Reveal: stampReveal overshoot — scale 1.3 → 0.96 → 1, rotate -2deg → -1deg,
 * 0.4s cubic-bezier(0.34, 1.56, 0.64, 1).
 * prefers-reduced-motion: CSS fade-in fallback (a11y per spec §15.7).
 *
 * framer-motion usage is SCOPED TO THIS FILE.
 * No other component in packages/ui/src/ imports framer-motion.
 *
 * D-03 RESOLVED (Phase 09.2-01): COLOR_MAP['outcome-contrarian'] now returns
 * #E8F542 (the win color) — the stale #A855F7 contrarian token is fixed at the
 * source. #A855F7 is duel/challenger identity ONLY. The hexColor override prop
 * (added Plan 04-07 as the workaround) is KEPT for explicit per-call overrides;
 * existing callers using the StampColor token map now get the correct color
 * either way.
 *
 * @example
 *   <Stamp word="CALLED IT" color="outcome-win" />
 *   <Stamp word="CONTRARIAN HIT" color="outcome-contrarian" />  // #E8F542 via COLOR_MAP
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
   * Optional explicit hex color override for the stamp text.
   * Kept from Plan 04-07. Since 09.2-01 the COLOR_MAP itself carries the
   * correct hexes (outcome-contrarian = #E8F542, D-03 fixed), so this is now
   * an explicit override seam rather than a stale-token workaround.
   * When provided, takes precedence over COLOR_MAP[color].
   */
  hexColor?: string;
  className?: string;
};

const COLOR_CLASS: Record<StampColor, string> = {
  'outcome-win': 'text-outcome-win',
  'outcome-loss': 'text-outcome-loss',
  'outcome-contrarian': 'text-outcome-contrarian',
  'brand-muted': 'text-brand-muted',
  'brand-accent': 'text-brand-accent',
};

// Prototype .outcome-stamp constants
const STAMP_FONT_SIZE = 'clamp(56px, 17vw, 120px)';
const STAMP_TEXT_SHADOW = '4px 4px 0 #000';

export function Stamp({ word, color, hexColor, className }: StampProps) {
  const prefersReducedMotion = useReducedMotion();
  // Use explicit hexColor when provided; fall back to the (now-correct) token map.
  const colorHex = hexColor ?? COLOR_MAP[color] ?? '#ffffff';

  if (prefersReducedMotion) {
    // a11y fallback: simple CSS fade-in (no transform animation)
    return (
      <div
        className={cn(
          'inline-block font-display font-black uppercase',
          'tracking-[-0.04em] leading-[0.85]',
          'opacity-0 animate-[fadeIn_0.4s_ease-out_forwards]',
          COLOR_CLASS[color],
          className
        )}
        style={{
          color: colorHex,
          fontSize: STAMP_FONT_SIZE,
          textShadow: STAMP_TEXT_SHADOW,
          transform: 'rotate(-1deg)',
        }}
      >
        {word}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ scale: 1.3, rotate: -2, opacity: 0 }}
      animate={{
        scale: [1.3, 0.96, 1],
        rotate: [-2, -1, -1],
        opacity: 1,
      }}
      transition={{
        // stampReveal: 0.4s overshoot, keyframes at 0% / 60% / 100%
        duration: 0.4,
        ease: [0.34, 1.56, 0.64, 1],
        times: [0, 0.6, 1],
        opacity: { duration: 0.24 },
      }}
      className={cn(
        'inline-block font-display font-black uppercase',
        'tracking-[-0.04em] leading-[0.85]',
        COLOR_CLASS[color],
        className
      )}
      style={{
        color: colorHex,
        fontSize: STAMP_FONT_SIZE,
        textShadow: STAMP_TEXT_SHADOW,
      }}
    >
      {word}
    </motion.div>
  );
}
