'use client';

import { useWatch, type Control, type UseFormSetValue, type FieldErrors } from 'react-hook-form';
import type { CreateCallInput, EventSubtype } from '@call-it/shared';
import { EVENT_SUBTYPES, CRITERIA_REQUIRED_EVENT_SUBTYPES } from '@call-it/shared';
import { CriteriaField } from './CriteriaField';
import { AssetSelect } from './AssetSelect';

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
  // CR-01 (quick-260611-co5): 'governance' submits Governance_Snapshot(6) on
  // the deployed 05.1 enum — label it honestly. Governance_Tally(7) is not
  // expressible from the composer until the TS union splits (REVIEW.md follow-up).
  governance: 'Governance (Snapshot)',
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
 * EventFields — sub-form for Event market type with 7 subtypes (ROOT skin).
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
  const assetA = useWatch({ control, name: 'assetA' });
  const requiresCriteria = eventSubtype
    ? CRITERIA_REQUIRED_EVENT_SUBTYPES.has(eventSubtype as EventSubtype)
    : false;

  return (
    <div className="flex flex-col gap-5">
      {/* Asset — webCreateCallSchema still ACCEPTS hex-address/numeric event
          assets, but the UI now constrains entry to the 24 allowlisted symbols
          (quick-260611-bf2 client gate; no free-text path remains). */}
      <div className="flex flex-col gap-2">
        <label htmlFor="event-asset" className="label-overline">Asset / Protocol</label>
        <AssetSelect
          id="event-asset"
          value={assetA}
          onChange={(v) => setValue('assetA', v, { shouldValidate: true })}
          hasError={!!errors.assetA}
        />
        {errors.assetA && (
          <div className="mono" style={{ fontSize: 11, color: 'var(--accent-loss)' }}>
            {errors.assetA.message}
          </div>
        )}
      </div>

      {/* Event subtype */}
      <div className="flex flex-col gap-2">
        <label className="label-overline">Event Type</label>
        <select
          value={eventSubtype ?? 'none'}
          onChange={(e) => setValue('eventSubtype', e.target.value as EventSubtype)}
          className="brutal-select"
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
        <div className="flex flex-col gap-2">
          <label className="label-overline">Exchange</label>
          <select
            onChange={(e) => setValue('assetB', e.target.value)}
            className="brutal-select"
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
        <div className="flex flex-col gap-2">
          <label className="label-overline">Metric</label>
          <select
            onChange={(e) => setValue('assetB', e.target.value)}
            className="brutal-select"
          >
            <option value="">Select metric</option>
            {ONCHAIN_METRICS.map((metric) => (
              <option key={metric} value={metric.toLowerCase().replace(/ /g, '_')}>
                {metric}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Target value (for non-milestone events) */}
      {eventSubtype !== 'governance' && eventSubtype !== 'tokenLaunch' && (
        <div className="flex flex-col gap-2">
          <label className="label-overline">Target Value</label>
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
            className="brutal-input mono"
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
