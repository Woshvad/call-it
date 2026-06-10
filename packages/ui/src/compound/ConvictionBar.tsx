/**
 * ConvictionBar — Radix Slider carrying the prototype `.brutal-bar` /
 * `.brutal-slider` recipes (UI-51, Phase 09.2 retheme)
 *
 * Track: 10px, var(--bg-tertiary), 1px var(--border-subtle) border, radius 0.
 * Range fill: interpolated color from brand-muted (#94A3B8) at value=1
 *             to brand-accent (#E8F542) at value=100 via CSS custom property
 *             (UI-51 — fill interpolates as conviction rises; logic unchanged).
 * Thumb: 26px cream square, 2px black border, 2px 2px 0 #000 shadow.
 *
 * @example
 *   <ConvictionBar value={75} onChange={(v) => setConviction(v)} />
 */
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '../lib/cn';
import { BRAND_MUTED, BRAND_ACCENT } from '../tokens/colors';

/** Linearly interpolate between two hex colors based on a 0..1 fraction */
function lerpHex(hex1: string, hex2: string, t: number): string {
  const parse = (h: string) => [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  const [r1, g1, b1] = parse(hex1);
  const [r2, g2, b2] = parse(hex2);
  return `#${toHex(r1 + (r2 - r1) * t)}${toHex(g1 + (g2 - g1) * t)}${toHex(b1 + (b2 - b1) * t)}`;
}

/** Returns a fill color LERPed from muted→accent based on 1..100 value */
function interpolateMutedToAccent(value: number, max = 100): string {
  const t = Math.max(0, Math.min(1, (value - 1) / (max - 1)));
  return lerpHex(BRAND_MUTED, BRAND_ACCENT, t);
}

export type ConvictionBarProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  className?: string;
};

export function ConvictionBar({
  value,
  onChange,
  min = 1,
  max = 100,
  className,
}: ConvictionBarProps) {
  const fillColor = interpolateMutedToAccent(value, max);

  return (
    <SliderPrimitive.Root
      min={min}
      max={max}
      value={[value]}
      onValueChange={([v]) => onChange(v)}
      className={cn('relative flex w-full touch-none select-none items-center', className)}
      style={{ '--fill-color': fillColor } as React.CSSProperties}
    >
      {/* .brutal-bar track: 10px, --bg-tertiary, 1px border, radius 0 */}
      <SliderPrimitive.Track className="relative h-[10px] w-full grow overflow-hidden bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-none">
        <SliderPrimitive.Range
          className="absolute h-full"
          style={{ backgroundColor: 'var(--fill-color)' }}
        />
      </SliderPrimitive.Track>
      {/* .brutal-slider thumb: 26px cream square, 2px black border, hard shadow */}
      <SliderPrimitive.Thumb
        className={cn(
          'block h-[26px] w-[26px]',
          'bg-brand-cream',
          'border-2 border-black',
          'shadow-[2px_2px_0_0_#000]',
          'rounded-none',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent',
          'cursor-grab active:cursor-grabbing'
        )}
      />
    </SliderPrimitive.Root>
  );
}
