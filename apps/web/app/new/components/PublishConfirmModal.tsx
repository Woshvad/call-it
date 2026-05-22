'use client';

import { Button } from '@call-it/ui';
import type { CreateCallInput } from '@call-it/shared';

interface PublishConfirmModalProps {
  isOpen: boolean;
  formValues: CreateCallInput;
  isPublishing: boolean;
  publishStep: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const MARKET_TYPE_LABELS: Record<string, string> = {
  priceTarget: 'Price Target',
  spreadVs: 'Spread vs',
  event: 'Event',
};

/**
 * PublishConfirmModal — 2-step publish confirmation (Review → Sign).
 *
 * Step 1: "Confirm your call" — shows locked-in summary of the call.
 * Step 2: "Signing transaction" — shown while the userOp is being signed/sent.
 *
 * The Confirm button calls usePublishCall().publish() which:
 *   1. Runs preflight (POST /api/calls/preflight)
 *   2. If 200, builds userOp and signs via Privy embedded wallet
 *
 * Requirement: UI-55, UI-56, D-28
 */
export function PublishConfirmModal({
  isOpen,
  formValues,
  isPublishing,
  publishStep,
  onConfirm,
  onCancel,
}: PublishConfirmModalProps) {
  if (!isOpen) return null;

  const isSigning = isPublishing && (publishStep === 'preflight' || publishStep === 'signing' || publishStep === 'waiting');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-brand-bg opacity-80" onClick={onCancel} />

      {/* Modal */}
      <div className="relative z-10 bg-brand-surface border-3 border-brand-text shadow-[8px_8px_0_0_#E8F542] max-w-lg w-full mx-4">
        {/* Header */}
        <div className="border-b-2 border-brand-border px-6 py-4">
          <h2 className="text-xl font-display font-bold text-brand-text uppercase tracking-wide">
            {isSigning ? 'Signing Transaction...' : 'Confirm Your Call'}
          </h2>
        </div>

        {/* Body */}
        <div className="px-6 py-6 flex flex-col gap-4">
          {!isSigning ? (
            <>
              {/* Call summary */}
              <div className="flex flex-col gap-2 font-mono text-sm">
                <div className="flex justify-between">
                  <span className="text-brand-muted">Type</span>
                  <span className="text-brand-text font-bold">
                    {MARKET_TYPE_LABELS[formValues.marketType] ?? formValues.marketType}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-brand-muted">Asset</span>
                  <span className="text-brand-text">{formValues.assetA}</span>
                </div>
                {formValues.targetValue && (
                  <div className="flex justify-between">
                    <span className="text-brand-muted">Target</span>
                    <span className="text-brand-text">
                      {(Number(formValues.targetValue) / 1_000_000).toLocaleString()} USD
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-brand-muted">Conviction</span>
                  <span className="text-brand-accent font-bold">{formValues.conviction}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-brand-muted">Stake</span>
                  <span className="text-brand-text">
                    ${(Number(formValues.stake) / 1_000_000).toFixed(2)} USDC
                  </span>
                </div>
              </div>

              <p className="text-xs font-mono text-brand-muted border border-brand-border p-3">
                This call will be permanent and public. The preflight check will run before you sign.
              </p>
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-8 h-8 border-4 border-brand-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-sm font-mono text-brand-muted text-center">
                {isPublishing && publishStep === 'preflight' && 'Running gate checks...'}
                {isPublishing && publishStep === 'signing' && 'Please sign in your wallet...'}
                {isPublishing && publishStep === 'waiting' && 'Waiting for on-chain confirmation...'}
                {!isPublishing && 'Processing...'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {!isSigning && (
          <div className="border-t-2 border-brand-border px-6 py-4 flex gap-3 justify-end">
            <Button intent="secondary" size="md" type="button" onClick={onCancel} disabled={isPublishing}>
              Cancel
            </Button>
            <Button intent="primary" size="md" type="button" onClick={onConfirm} disabled={isPublishing}>
              {isPublishing ? 'Publishing...' : 'Confirm publish'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
