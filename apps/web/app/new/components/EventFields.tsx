'use client';

import { useWatch, type Control, type UseFormSetValue, type FieldErrors } from 'react-hook-form';
import type { CreateCallInput, EventSubtype } from '@call-it/shared';
import { EVENT_SUBTYPES, CRITERIA_REQUIRED_EVENT_SUBTYPES } from '@call-it/shared';
import { CriteriaField } from './CriteriaField';

interface EventFieldsProps {
  control: Control<CreateCallInput>;
  setValue: UseFormSetValue<CreateCallInput>;
  errors: FieldErrors<CreateCallInput>;
}

const EVENT_SUBTYPE_LABELS: Record<EventSubtype, string> = {
  none: 'None',
  tvlMilestone: 'TVL Milestone',
  volumeFees: 'Volume / Fees',
  onchainMetric: 'On-chain Metric',
  cexListing: 'CEX Listing',
  tokenLaunch: 'Token Launch',
  governance: 'Governance',
  protocolMilestone: 'Protocol Milestone',
};

// CEX exchange options for cexListing subtype
const CEX_EXCHANGES = [
  'Binance', 'Coinbase', 'Kraken', 'OKX', 'Bybit', 'Gate.io', 'Bitfinex', 'Huobi',
];

// On-chain metrics for onchainMetric subtype
const ONCHAIN_METRICS = [
  'TVL', 'Daily Active Users', 'Transaction Volume', 'Fee Revenue',
  'Unique Wallets', 'Protocol Revenue', 'Token Holders', 'GitHub Stars',
];

/**
 * EventFields — sub-form for Event market type with 7 subtypes.
 *
 * Subtype-conditional inputs:
 *   - cexListing: exchange dropdown (8 options per CALL-02)
 *   - onchainMetric: metric dropdown (8 options)
 *   - others: just criteriaText (required for cexListing, tokenLaunch, governance, protocolMilestone)
 *
 * Requirement: CALL-02, CALL-15, CALL-16, CALL-37
 */
export function EventFields({ control, setValue, errors }: EventFieldsProps) {
  const eventSubtype = useWatch({ control, name: 'eventSubtype' });
  const requiresCriteria = eventSubtype
    ? CRITERIA_REQUIRED_EVENT_SUBTYPES.has(eventSubtype as EventSubtype)
    : false;

  return (
    <div className="flex flex-col gap-4">
      {/* Asset */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-mono text-brand-text uppercase tracking-wide">
          Asset / Protocol
        </label>
        <input
          type="text"
          placeholder="e.g. ETH, Uniswap, EigenLayer"
          onChange={(e) => setValue('assetA', e.target.value)}
          className={[
            'border-2 bg-brand-surface text-brand-text font-mono px-3 py-2',
            'focus:outline-none focus:border-brand-accent',
            errors.assetA ? 'border-red-500' : 'border-brand-border',
          ].join(' ')}
        />
        {errors.assetA && (
          <div className="text-red-500 text-xs font-mono">{errors.assetA.message}</div>
        )}
      </div>

      {/* Event subtype */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-mono text-brand-text uppercase tracking-wide">
          Event Type
        </label>
        <select
          value={eventSubtype ?? 'none'}
          onChange={(e) => setValue('eventSubtype', e.target.value as EventSubtype)}
          className="border-2 bg-brand-surface text-brand-text font-mono px-3 py-2 focus:outline-none focus:border-brand-accent border-brand-border"
        >
          {EVENT_SUBTYPES.filter((s) => s !== 'none').map((subtype) => (
            <option key={subtype} value={subtype}>
              {EVENT_SUBTYPE_LABELS[subtype]}
            </option>
          ))}
        </select>
      </div>

      {/* cexListing: exchange dropdown */}
      {eventSubtype === 'cexListing' && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-mono text-brand-text uppercase tracking-wide">
            Exchange
          </label>
          <select
            onChange={(e) => setValue('assetB', e.target.value)}
            className="border-2 bg-brand-surface text-brand-text font-mono px-3 py-2 focus:outline-none focus:border-brand-accent border-brand-border"
          >
            <option value="">Select exchange</option>
            {CEX_EXCHANGES.map((exchange) => (
              <option key={exchange} value={exchange.toLowerCase()}>
                {exchange}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* onchainMetric: metric dropdown */}
      {eventSubtype === 'onchainMetric' && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-mono text-brand-text uppercase tracking-wide">
            Metric
          </label>
          <select
            onChange={(e) => setValue('assetB', e.target.value)}
            className="border-2 bg-brand-surface text-brand-text font-mono px-3 py-2 focus:outline-none focus:border-brand-accent border-brand-border"
          >
            <option value="">Select metric</option>
            {ONCHAIN_METRICS.map((metric) => (
              <option key={metric} value={metric.toLowerCase().replace(' ', '_')}>
                {metric}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Target value (for non-milestone events) */}
      {eventSubtype !== 'governance' && eventSubtype !== 'tokenLaunch' && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-mono text-brand-text uppercase tracking-wide">
            Target Value
          </label>
          <input
            type="number"
            placeholder="e.g. 1000000 (for $1M TVL)"
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val)) {
                setValue('targetValue', BigInt(Math.round(val)));
              }
            }}
            step="1"
            className="border-2 bg-brand-surface text-brand-text font-mono px-3 py-2 focus:outline-none focus:border-brand-accent border-brand-border"
          />
        </div>
      )}

      {/* Criteria text (required for specific subtypes per CALL-15/16) */}
      <CriteriaField
        control={control}
        errors={errors}
        isRequired={requiresCriteria}
      />
    </div>
  );
}
