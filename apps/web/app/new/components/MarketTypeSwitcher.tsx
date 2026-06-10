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

const MARKET_TYPE_SUBS: Record<MarketType, string> = {
  priceTarget: 'asset hits a price',
  spreadVs: 'A outperforms B',
  event: 'binary outcome',
};

/**
 * MarketTypeSwitcher — three `.brutal-card.interactive` type cards (ROOT skin).
 *
 * The selected card shows a chartreuse corner dot (screenshot canon).
 * Switching to a different mode does NOT clear unrelated fields (they are preserved
 * under the hood even if not visible). Only the selected mode's sub-form is mounted.
 * Same three market types, same RHF binding (setValue('marketType', ...)).
 *
 * Requirement: UI-01, CALL-37
 */
export function MarketTypeSwitcher({ value, setValue }: MarketTypeSwitcherProps) {
  return (
    <div
      style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}
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
            className="brutal-card interactive"
            style={{
              flex: '1 1 0',
              minWidth: 140,
              minHeight: 44,
              padding: '14px 16px',
              textAlign: 'left',
              cursor: 'pointer',
              position: 'relative',
              background: isActive ? 'rgba(232,245,66,0.06)' : undefined,
              borderColor: isActive ? 'var(--accent-win)' : undefined,
            }}
            aria-pressed={isActive}
          >
            {/* Chartreuse corner dot on the selected card (screenshot canon) */}
            {isActive && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  width: 8,
                  height: 8,
                  background: 'var(--accent-win)',
                }}
              />
            )}
            <span
              style={{
                display: 'block',
                fontFamily: 'var(--font-display)',
                fontSize: 13,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.02em',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              {MARKET_TYPE_LABELS[type]}
            </span>
            <span
              className="mono"
              style={{
                display: 'block',
                fontSize: 10.5,
                color: 'var(--text-tertiary)',
                marginTop: 2,
              }}
            >
              {MARKET_TYPE_SUBS[type]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
