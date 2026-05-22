/**
 * ConvictionBar — Radix Slider with neobrutalist styling (UI-51)
 *
 * Track: brand-border (#27272A)
 * Range fill: interpolated color from brand-muted (#A1A1AA) at value=1
 *             to brand-accent (#E8F542) at value=100 via CSS custom property.
 * Thumb: neobrutalist square with hard offset shadow.
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
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden bg-brand-border">
        <SliderPrimitive.Range
          className="absolute h-full"
          style={{ backgroundColor: 'var(--fill-color)' }}
        />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className={cn(
          'block h-5 w-5',
          'bg-brand-accent',
          'border-2 border-black',
          'shadow-[2px_2px_0_0_#000]',
          'hover:translate-x-[1px] hover:translate-y-[1px]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent',
          'cursor-pointer',
          'transition-shadow duration-100'
        )}
      />
    </SliderPrimitive.Root>
  );
}
