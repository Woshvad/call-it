'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams } from 'next/navigation';
import { useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import type { CreateCallInput, MarketType } from '@call-it/shared';
import { createCallSchema, MIN_STAKE } from '@call-it/shared';
import { Receipt, Button } from '@call-it/ui';
import { MarketTypeSwitcher } from './components/MarketTypeSwitcher';
import { PriceTargetFields } from './components/PriceTargetFields';
import { SpreadVsFields } from './components/SpreadVsFields';
import { EventFields } from './components/EventFields';
import { DeadlinePicker } from './components/DeadlinePicker';
import { ConvictionSliderField } from './components/ConvictionSliderField';
import { CriteriaField } from './components/CriteriaField';
import { AdvancedSettings } from './components/AdvancedSettings';
import { DuplicateWarning } from './components/DuplicateWarning';
import { PublishConfirmModal } from './components/PublishConfirmModal';
import { useDebouncedDupCheck } from './hooks/useDebouncedDupCheck';
import { usePublishCall } from './hooks/usePublishCall';

/**
 * /new page — New Call composer.
 *
 * LAYOUT: 2-column FLEXBOX (form left, Receipt preview right).
 * FLEXBOX ONLY — no CSS grid anywhere (Pitfall 15).
 *
 * RHF + zodResolver(createCallSchema) from @call-it/shared (D-29 parity).
 * The form NEVER duplicates gate logic — always imports from @call-it/shared.
 *
 * Requirements: CALL-37..70, UI-01..03, UI-51, UI-55, UI-56
 */
export default function NewCallPage() {
  const searchParams = useSearchParams();
  const quoteId = searchParams?.get('quote');
  const { getAccessToken } = usePrivy();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [token, setToken] = useState<string | undefined>(undefined);

  // Initialize form with zodResolver (D-29 parity — same schema as relayer preflight)
  const form = useForm<CreateCallInput>({
    resolver: zodResolver(createCallSchema),
    mode: 'onChange',
    defaultValues: {
      marketType: 'priceTarget' as MarketType,
      eventSubtype: 'none',
      category: 'majors',
      assetA: '',
      assetB: undefined,
      targetValue: 1n,
      expiry: BigInt(Math.floor(Date.now() / 1000) + 86400 * 7),
      stake: MIN_STAKE,
      conviction: 50,
      criteriaText: '',
      openToChallenges: true,
      parentCallId: quoteId ? BigInt(quoteId) : undefined,
      callerSettledCalls: 0,
    },
  });

  const { control, setValue, formState: { errors }, handleSubmit, watch, setError } = form;
  const formValues = watch();
  const marketType = watch('marketType');

  // Debounced dup-check (D-22, CALL-49 — 400ms, only fires when required fields present)
  const { match: dupMatch } = useDebouncedDupCheck(formValues, token);

  const loadToken = useCallback(async () => {
    if (!token) {
      const t = await getAccessToken();
      if (t) setToken(t);
    }
  }, [token, getAccessToken]);

  const {
    publish,
    isPublishing,
    step: publishStep,
  } = usePublishCall(setError);

  const onPublish = useCallback(async () => {
    await loadToken();
    setIsModalOpen(true);
  }, [loadToken]);

  const onConfirmPublish = useCallback(async () => {
    const values = form.getValues();
    await publish(values);
    setIsModalOpen(false);
  }, [form, publish]);

  return (
    <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
      {/* Left: Form — flex-1 */}
      <div style={{ flex: 1 }}>
        <h1 className="text-2xl font-display font-bold text-brand-text uppercase tracking-wide mb-6">
          New Call
        </h1>

        {/* Quote context card */}
        {quoteId && (
          <div className="mb-4 p-3 border-2 border-brand-accent bg-brand-surface font-mono text-sm text-brand-text">
            Quote mode — quoting call #{quoteId}
          </div>
        )}

        <form onSubmit={handleSubmit(onPublish)} className="flex flex-col gap-6">
          {/* Market type switcher */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-mono text-brand-text uppercase tracking-wide">
              Call Type
            </label>
            <MarketTypeSwitcher value={marketType} setValue={setValue} />
          </div>

          {/* Mode-conditional sub-form (anti-drift D-29: all validation from @call-it/shared) */}
          {marketType === 'priceTarget' && (
            <PriceTargetFields control={control} errors={errors} />
          )}
          {marketType === 'spreadVs' && (
            <SpreadVsFields control={control} errors={errors} />
          )}
          {marketType === 'event' && (
            <EventFields control={control} setValue={setValue} errors={errors} />
          )}

          {/* Deadline picker — shows UTC-day bucket label (PITFALL-12 / CALL-46) */}
          <DeadlinePicker control={control} error={errors.expiry} />

          {/* Stake input */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-mono text-brand-text uppercase tracking-wide">
              Stake (USDC)
            </label>
            <input
              type="number"
              min={5}
              max={100}
              step={1}
              value={formValues.stake ? (Number(formValues.stake) / 1_000_000) : 5}
              onChange={(e) => {
                const usd = parseFloat(e.target.value);
                if (!isNaN(usd)) setValue('stake', BigInt(Math.round(usd * 1_000_000)));
              }}
              className={[
                'border-2 bg-brand-surface text-brand-text font-mono px-3 py-2',
                'focus:outline-none focus:border-brand-accent',
                errors.stake ? 'border-red-500' : 'border-brand-border',
              ].join(' ')}
            />
            {errors.stake && (
              <div className="text-red-500 text-xs font-mono">{String(errors.stake.message)}</div>
            )}
          </div>

          {/* DuplicateWarning above conviction slider (CALL-49) */}
          {dupMatch && (
            <DuplicateWarning existingCallId={dupMatch.existingCallId} />
          )}

          {/* Conviction slider (Plan 04 ConvictionBar — UI-51) */}
          <ConvictionSliderField control={control} error={errors.conviction} />

          {/* Criteria field (required for some event subtypes per CALL-15/16) */}
          {marketType !== 'priceTarget' && (
            <CriteriaField control={control} errors={errors} isRequired={false} />
          )}

          {/* Advanced settings (CALL-62/63/64) */}
          <AdvancedSettings control={control} />

          {/* Root errors (from preflight 422) */}
          {errors.root && (
            <div className="p-3 border-2 border-red-500 text-red-600 text-sm font-mono">
              {errors.root.message}
            </div>
          )}

          <Button intent="primary" size="lg" type="submit" disabled={isPublishing}>
            {isPublishing ? 'Publishing...' : 'Publish Call'}
          </Button>
        </form>
      </div>

      {/* Right: Receipt preview — flex-1, sticky (D-21) */}
      {/* FLEXBOX only — Receipt component enforces this internally (Pitfall 15) */}
      <div style={{ flex: 1, position: 'sticky', top: '2rem' }}>
        <h2 className="text-sm font-mono text-brand-muted uppercase tracking-wide mb-3">
          Preview
        </h2>
        <Receipt
          mode="preview"
          data={{
            handle: '@you',
            marketLine: `${formValues.assetA || 'Asset'} ${formValues.marketType === 'spreadVs' ? 'vs' : '>='} ${
              formValues.targetValue
                ? (Number(formValues.targetValue) / 1_000_000).toLocaleString()
                : '?'
            }`,
            conviction: formValues.conviction ?? 50,
            deadline: new Date(Number(formValues.expiry ?? 0n) * 1000),
            stake: formValues.stake ?? 0n,
          }}
        />
      </div>

      {/* Publish confirmation modal (2-step: Review → Sign) */}
      <PublishConfirmModal
        isOpen={isModalOpen}
        formValues={form.getValues()}
        isPublishing={isPublishing}
        publishStep={publishStep}
        onConfirm={onConfirmPublish}
        onCancel={() => setIsModalOpen(false)}
      />
    </div>
  );
}
