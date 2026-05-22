'use client';

import type { UseFormSetValue } from 'react-hook-form';
import type { CreateCallInput, MarketType } from '@call-it/shared';

interface MarketTypeSwitcherProps {
  value: MarketType;
  setValue: UseFormSetValue<CreateCallInput>;
}

const ALL_MARKET_TYPES: readonly MarketType[] = ['priceTarget', 'spreadVs', 'event'];

const MARKET_TYPE_LABELS: Record<MarketType, string> = {
  priceTarget: 'Price Target',
  spreadVs: 'Spread vs',
  event: 'Event',
};

/**
 * MarketTypeSwitcher — Tag-row toggle for the 3 market types.
 *
 * Switching to a different mode does NOT clear unrelated fields (they are preserved
 * under the hood even if not visible). Only the selected mode's sub-form is mounted.
 *
 * Requirement: UI-01, CALL-37
 */
export function MarketTypeSwitcher({ value, setValue }: MarketTypeSwitcherProps) {
  return (
    <div
      className="flex gap-2"
      role="group"
      aria-label="Market type selector"
    >
      {ALL_MARKET_TYPES.map((type) => {
        const isActive = value === type;
        return (
          <button
            key={type}
            type="button"
            onClick={() => setValue('marketType', type, { shouldValidate: true })}
            className={[
              'px-4 py-2 text-sm font-mono uppercase tracking-wide border-2 transition-colors',
              isActive
                ? 'bg-brand-accent text-brand-bg border-brand-accent'
                : 'bg-brand-surface text-brand-muted border-brand-border hover:border-brand-text hover:text-brand-text',
            ].join(' ')}
            aria-pressed={isActive}
          >
            {MARKET_TYPE_LABELS[type]}
          </button>
        );
      })}
    </div>
  );
}
