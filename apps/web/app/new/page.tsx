'use client';

import { useForm, type UseFormSetValue } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams } from 'next/navigation';
import { useState, useCallback, type CSSProperties } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import { useProfile } from '@/hooks/useProfile';
import type { CreateCallInput, MarketType } from '@call-it/shared';
import { MIN_STAKE, CREATION_FEE } from '@call-it/shared';
import { webCreateCallSchema } from './lib/web-call-schema';
import { formatTargetForDisplay } from './lib/target-scale';
import { targetGuardViolation } from './lib/target-guard';
import { usePythPrice } from './hooks/usePythPrice';
import { ACTIVE_CHAIN } from '@/lib/chain';
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
import { QuoteParentCard } from './components/QuoteParentCard';
import { QuoteSuccess } from './components/QuoteSuccess';
import { DesktopOnlyBanner } from '../components/DesktopOnlyBanner';
import { useIsMobile } from '../hooks/useIsMobile';

/** Stake quick-pick values in whole USDC (within the existing zod $5/$100 bounds). */
const STAKE_QUICK_PICKS = [5, 25, 50, 100] as const;

/**
 * StakeField — `.brutal-input` stake entry + $5/$25/$50/$100 quick-pick chip row.
 *
 * Quick-picks write through the SAME RHF setValue path as the input (no new
 * validation path — zod min/max still enforced; T-09.2-27 mitigated).
 */
function StakeField({
  stake,
  setValue,
  error,
}: {
  stake: bigint | undefined;
  setValue: UseFormSetValue<CreateCallInput>;
  error?: { message?: string };
}) {
  const stakeUsd = stake ? Number(stake) / 1_000_000 : 5;
  return (
    <div className="flex flex-col gap-2">
      <label className="label-overline">Stake (USDC)</label>
      <input
        type="number"
        min={5}
        max={100}
        step={1}
        value={stakeUsd}
        onChange={(e) => {
          const usd = parseFloat(e.target.value);
          if (!isNaN(usd)) setValue('stake', BigInt(Math.round(usd * 1_000_000)));
        }}
        className="brutal-input mono"
        style={{
          fontSize: 22,
          fontWeight: 700,
          ...(error ? { borderColor: 'var(--accent-loss)' } : {}),
        }}
      />
      {/* Quick-pick chip row — writes through the existing RHF setValue */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {STAKE_QUICK_PICKS.map((v) => (
          <button
            key={v}
            type="button"
            className={`chip ${stakeUsd === v ? 'active' : ''}`}
            style={{ flex: 1, minWidth: 60, minHeight: 44, fontSize: 13, fontWeight: 700 }}
            onClick={() =>
              setValue('stake', BigInt(v * 1_000_000), { shouldValidate: true })
            }
          >
            ${v}
          </button>
        ))}
      </div>
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.02em' }}>
        $5 minimum · $100 maximum during launch
      </div>
      {/* B7 (quick-260611-5mh): persistent creation-fee disclosure near the
          stake input — fee value derived from the shared CREATION_FEE constant. */}
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-tertiary)', letterSpacing: '0.02em' }}>
        + ${(Number(CREATION_FEE) / 1_000_000).toFixed(2)} creation fee at publish
      </div>
      {error && (
        <div className="mono" style={{ fontSize: 11, color: 'var(--accent-loss)' }}>
          {String(error.message)}
        </div>
      )}
    </div>
  );
}

/**
 * /new page — New Call composer ("Go on record." — ROOT brutalist shell).
 *
 * LAYOUT: 2-column FLEXBOX desktop (form left, sticky Receipt preview right),
 * single column <768px via useIsMobile. FLEXBOX ONLY — no CSS grid (Pitfall 15).
 *
 * RHF + zodResolver(createCallSchema) from @call-it/shared (D-29 parity).
 * The form NEVER duplicates gate logic — always imports from @call-it/shared.
 *
 * `?quote=[parentCallId]` mode (UI-26/27/28): renders a read-only parent context
 * card, the YOUR THESIS textarea ABOVE the market-type buttons (UI-27 — forces
 * articulation before composition), Post quote / Cancel CTAs, and on submit a
 * success screen with a stacked thread preview + a Twitter-intent Share button
 * (SHARE-15). Quote stance persists via the existing quote_stance route.
 *
 * Requirements: CALL-37..70, UI-01..03, UI-51, UI-55, UI-56, UI-26, UI-27, UI-28, SHARE-15
 */
export default function NewCallPage() {
  const searchParams = useSearchParams();
  const quoteId = searchParams?.get('quote');
  const isQuoteMode = !!quoteId;
  const { getAccessToken } = usePrivy();
  const isMobile = useIsMobile();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [token, setToken] = useState<string | undefined>(undefined);
  // Quote success screen state (UI-28). `newCallId` is the freshly-minted
  // QUOTE call's id from publish() (WR-11, 260612-hi3) — the parent id stays
  // available as `quoteId`. Null when the CallCreated log was unparseable.
  const [quotePosted, setQuotePosted] = useState<{ newCallId: string | null } | null>(null);

  // WR-11 (260612-hi3): resolved viewer handle for the preview Receipts —
  // a truncated address is NOT a handle (AUTH-44); '@you' survives ONLY as
  // the unresolved-preview fallback (never in a share intent).
  const { address: viewerAddress } = useAccount();
  const { data: viewerProfile } = useProfile(viewerAddress);
  const previewHandle =
    viewerProfile && viewerProfile.source !== 'truncated' && viewerProfile.handle
      ? viewerProfile.handle
      : '@you';

  // Initialize form with zodResolver (D-29 parity — same schema as relayer preflight)
  const form = useForm<CreateCallInput>({
    // quick-260611-bf2: web-local extension of createCallSchema (D-29 parity
    // preserved) — adds the assetA/assetB Pyth-resolvability gate so unknown
    // assets error inline BEFORE the confirm modal.
    resolver: zodResolver(webCreateCallSchema),
    mode: 'onChange',
    defaultValues: {
      marketType: 'priceTarget' as MarketType,
      eventSubtype: 'none',
      category: 'majors',
      assetA: '',
      assetB: undefined,
      // RC3: NO numeric prefill — empty required input with placeholder.
      // The old `1n` default rendered "0.000001" in the target field.
      targetValue: undefined,
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

  // quick-260611-uf9: lifted live-price hook — ONE fetch loop serves both the
  // PriceTargetFields display and the onPublish trivially-true gate below.
  // Non-priceTarget types pass undefined so the hook stays idle (its
  // feedId-null branch) — spreadVs/event add no fetch traffic.
  const { price: livePrice, status: livePriceStatus } = usePythPrice(
    marketType === 'priceTarget' ? formValues.assetA : undefined,
  );

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
    // quick-260611-uf9: trivially-true guard — v1 settles >= ONLY
    // (SettlementManager.sol:718), so a price target at/below the live
    // current price is a guaranteed CALLED IT (rep farming). Block the
    // confirm modal while the violation holds. No setError here: the derived
    // inline error in PriceTargetFields is already visible for exactly the
    // duration of the violation (reactive by construction — a one-shot
    // setError would go stale when the 30s price refresh moves). When
    // livePrice is null (D-07) the gate passes and the relayer preflight
    // enforces fail-closed server-side.
    const values = form.getValues();
    if (
      values.marketType === 'priceTarget' &&
      targetGuardViolation(values.targetValue, livePrice)
    ) {
      return;
    }
    await loadToken();
    setIsModalOpen(true);
  }, [form, livePrice, loadToken]);

  const onConfirmPublish = useCallback(async () => {
    const values = form.getValues();
    // WR-11 (260612-hi3): quote mode suppresses the publish redirect — the
    // unconditional router.push navigated away before QuoteSuccess rendered.
    const result = await publish(values, { suppressRedirect: isQuoteMode });
    setIsModalOpen(false);
    // In quote mode, surface the success screen (UI-28) once the publish flow reports
    // success. Branch on publish()'s returned terminal status — NOT the closed-over
    // `publishStep` const, which is captured stale at callback-creation time and never
    // reflects the just-completed publish (WR-01). The quote_stance write is keyed to the
    // on-chain CallQuoted event (parent + new quote-call ids); the success thread anchors
    // on the parent call, but the share receipt links the NEW quote-call id.
    if (isQuoteMode && result?.status === 'success') {
      setQuotePosted({ newCallId: result.callId ?? null });
    }
  }, [form, publish, isQuoteMode]);

  // Build the live preview market line (shared by the right-rail Receipt + thread preview).
  // RC3: target renders at the canonical 1e8 scale (raw for event milestones).
  const previewMarketLine = `${formValues.assetA || 'Asset'} ${
    formValues.marketType === 'spreadVs' ? 'vs' : '≥'
  } ${
    formValues.targetValue
      ? formatTargetForDisplay(formValues.marketType, formValues.targetValue)
      : '?'
  }`;

  // Two-column desktop / single-column mobile (Phase 9 carry-over, flexbox only)
  const columnsStyle: CSSProperties = {
    display: 'flex',
    flexDirection: isMobile ? 'column' : 'row',
    gap: isMobile ? 24 : 36,
    alignItems: 'flex-start',
  };
  const formColStyle: CSSProperties = isMobile
    ? { width: '100%' }
    : { flex: '1.4 1 0%', minWidth: 0 };
  const previewColStyle: CSSProperties = isMobile
    ? { width: '100%' }
    : { flex: '1 1 0%', minWidth: 0, position: 'sticky', top: 96 };

  // ── Success screen (UI-28) ──────────────────────────────────────────────────
  if (isQuoteMode && quotePosted) {
    return (
      <>
        <DesktopOnlyBanner />
        <QuoteSuccess
          parentCallId={quoteId!}
          quoteCallId={quotePosted.newCallId}
          quoteMarketLine={previewMarketLine}
          quoteConviction={formValues.conviction ?? 50}
          thesis={formValues.criteriaText ?? ''}
        />
      </>
    );
  }

  // ── Quote Composer mode (UI-26/27) ────────────────────────────────────────────
  if (isQuoteMode) {
    return (
      <>
        <DesktopOnlyBanner />
        <div style={columnsStyle}>
        {/* Left: parent card + composer */}
        <div style={formColStyle}>
          <div className="page-header" style={{ paddingTop: 24 }}>
            <div>
              <h1>Quote this call</h1>
              <div className="sub">
                Take a side on someone else&apos;s record. <span className="em">Your thesis is permanent too.</span>
              </div>
            </div>
          </div>

          {/* UI-26: read-only parent context card (NO corner brackets on the parent card) */}
          <QuoteParentCard parentCallId={quoteId!} />

          <form onSubmit={handleSubmit(onPublish)} className="flex flex-col gap-6 mt-6">
            {/* UI-27: YOUR THESIS textarea ABOVE the market-type buttons (forces articulation) */}
            <div className="flex flex-col gap-2">
              <label htmlFor="quote-thesis" className="label-overline">
                Your thesis
              </label>
              <textarea
                id="quote-thesis"
                value={formValues.criteriaText ?? ''}
                onChange={(e) => setValue('criteriaText', e.target.value)}
                placeholder="Why are you following or fading this call?"
                rows={3}
                className="brutal-textarea mono"
              />
            </div>

            {/* Market type switcher (BELOW the thesis per UI-27) */}
            <div className="flex flex-col gap-2">
              <label className="label-overline">Call Type</label>
              <MarketTypeSwitcher value={marketType} setValue={setValue} />
            </div>

            {marketType === 'priceTarget' && (
              <PriceTargetFields
                control={control}
                errors={errors}
                price={livePrice}
                status={livePriceStatus}
              />
            )}
            {marketType === 'spreadVs' && <SpreadVsFields control={control} errors={errors} />}
            {marketType === 'event' && (
              <EventFields control={control} setValue={setValue} errors={errors} />
            )}

            <DeadlinePicker control={control} error={errors.expiry} />

            {/* Stake input + quick-picks */}
            <StakeField stake={formValues.stake} setValue={setValue} error={errors.stake} />

            <ConvictionSliderField control={control} error={errors.conviction} />

            <AdvancedSettings control={control} />

            {/* Quote-submit error state (UI-SPEC error-states table) */}
            {errors.root && (
              <div
                className="mono"
                style={{
                  padding: 14,
                  border: '2px solid var(--accent-loss)',
                  background: 'rgba(248,113,113,0.06)',
                  fontSize: 12,
                  color: 'var(--accent-loss)',
                }}
              >
                Quote didn&apos;t post. Check your connection and try again.
              </div>
            )}

            {/* CTAs: Post quote (cream) + Cancel (outline) */}
            <div className="flex flex-row gap-3">
              <Button intent="primary" size="lg" type="submit" disabled={isPublishing}>
                {isPublishing ? 'Posting...' : 'Post quote'}
              </Button>
              <Button
                intent="secondary"
                size="lg"
                type="button"
                onClick={() => history.back()}
                disabled={isPublishing}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>

        {/* Right: live Receipt preview of the quote — sticky on desktop */}
        <div style={previewColStyle}>
          <div
            className="mono"
            style={{
              fontSize: 10.5,
              color: 'var(--text-tertiary)',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              fontWeight: 700,
              marginBottom: 14,
            }}
          >
            ↳ Your quote preview · updates as you type
          </div>
          <Receipt
            mode="preview"
            chainLabel={ACTIVE_CHAIN.name.toLowerCase()}
            data={{
              handle: previewHandle,
              marketLine: previewMarketLine,
              conviction: formValues.conviction ?? 50,
              deadline: new Date(Number(formValues.expiry ?? 0n) * 1000),
              stake: formValues.stake ?? 0n,
            }}
          />
        </div>

        <PublishConfirmModal
          isOpen={isModalOpen}
          formValues={form.getValues()}
          isPublishing={isPublishing}
          publishStep={publishStep}
          onConfirm={onConfirmPublish}
          onCancel={() => setIsModalOpen(false)}
        />
        </div>
      </>
    );
  }

  // ── Standard New Call mode ────────────────────────────────────────────────────
  return (
    <>
      <DesktopOnlyBanner />
      {/* Page header — prototype create-screen voice */}
      <div className="page-header">
        <div>
          <h1>Go on record.</h1>
          <div className="sub">
            Every field counts. <span className="em">Every word is permanent.</span> Write
            like the world will read it — because they will.
          </div>
        </div>
      </div>

      <div style={columnsStyle}>
      {/* Left: Form */}
      <div style={formColStyle}>
        <form onSubmit={handleSubmit(onPublish)} className="flex flex-col gap-6">
          {/* Market type switcher */}
          <div className="flex flex-col gap-2">
            <label className="label-overline">Call Type</label>
            <MarketTypeSwitcher value={marketType} setValue={setValue} />
          </div>

          {/* Mode-conditional sub-form (anti-drift D-29: all validation from @call-it/shared) */}
          {marketType === 'priceTarget' && (
            <PriceTargetFields
              control={control}
              errors={errors}
              price={livePrice}
              status={livePriceStatus}
            />
          )}
          {marketType === 'spreadVs' && (
            <SpreadVsFields control={control} errors={errors} />
          )}
          {marketType === 'event' && (
            <EventFields control={control} setValue={setValue} errors={errors} />
          )}

          {/* Deadline picker — shows UTC-day bucket label (PITFALL-12 / CALL-46) */}
          <DeadlinePicker control={control} error={errors.expiry} />

          {/* Stake input + $5/$25/$50/$100 quick-picks */}
          <StakeField stake={formValues.stake} setValue={setValue} error={errors.stake} />

          {/* DuplicateWarning above conviction slider (CALL-49) */}
          {dupMatch && (
            <DuplicateWarning existingCallId={dupMatch.existingCallId} />
          )}

          {/* Conviction slider (Plan 04 ConvictionBar — UI-51) */}
          <ConvictionSliderField control={control} error={errors.conviction} />

          {/* Criteria field (required for some event subtypes per CALL-15/16).
              Event mode renders its own CriteriaField inside EventFields — only
              spreadVs needs the page-level one (avoids two textareas bound to
              the same RHF field). */}
          {marketType === 'spreadVs' && (
            <CriteriaField control={control} errors={errors} isRequired={false} />
          )}

          {/* Advanced settings (CALL-62/63/64) */}
          <AdvancedSettings control={control} />

          {/* Root errors (from preflight 422) */}
          {errors.root && (
            <div
              className="mono"
              style={{
                padding: 14,
                border: '2px solid var(--accent-loss)',
                background: 'rgba(248,113,113,0.06)',
                fontSize: 12,
                color: 'var(--accent-loss)',
              }}
            >
              {errors.root.message}
            </div>
          )}

          <Button intent="primary" size="lg" type="submit" disabled={isPublishing} className="w-full">
            {isPublishing ? 'Publishing...' : 'Publish call · Go on record →'}
          </Button>

          <div
            className="mono"
            style={{
              fontSize: 11,
              color: 'var(--text-tertiary)',
              letterSpacing: '0.04em',
              textAlign: 'center',
            }}
          >
            ↳ confirmation step before broadcast
          </div>
        </form>
      </div>

      {/* Right: Receipt preview — sticky on desktop (D-21) */}
      {/* FLEXBOX only — Receipt component enforces this internally (Pitfall 15) */}
      <div style={previewColStyle}>
        <div
          className="mono"
          style={{
            fontSize: 10.5,
            color: 'var(--text-tertiary)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            fontWeight: 700,
            marginBottom: 14,
          }}
        >
          ↳ Live preview · updates as you type
        </div>
        <Receipt
          mode="preview"
          chainLabel={ACTIVE_CHAIN.name.toLowerCase()}
          data={{
            handle: previewHandle,
            marketLine: previewMarketLine,
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
    </>
  );
}
