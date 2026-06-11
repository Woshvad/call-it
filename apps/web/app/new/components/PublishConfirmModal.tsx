'use client';

import type { CreateCallInput } from '@call-it/shared';
import { CREATION_FEE } from '@call-it/shared';
import { formatTargetForDisplay } from '../lib/target-scale';

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

/** Permanence copy — exact string per the 09.2 UI-SPEC Copywriting Contract. */
const PERMANENCE_COPY = "This is permanent. There's no edit after publish.";

/**
 * PublishConfirmModal — 2-step publish confirmation (Review → Sign) on the cream
 * `.modal-panel` template (FINAL · CONFIRM voice, permanence copy).
 *
 * Step 1: "FINAL · CONFIRM" — shows locked-in summary of the call.
 * Step 2: "Signing transaction" — shown while the userOp is being signed/sent.
 *
 * The Confirm button calls usePublishCall().publish() which:
 *   1. Runs preflight (POST /api/calls/preflight)
 *   2. If 200, builds userOp and signs via Privy embedded wallet
 *
 * Cream-context rules (09.2-08 reference pattern): all interior text black /
 * near-black; accents only as black-strip text or black-filled CTAs.
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
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 200 }}>
      {/* Backdrop click target */}
      <div style={{ position: 'absolute', inset: 0 }} onClick={onCancel} />

      {/* Cream panel (.modal-panel template) */}
      <div className="modal-panel" style={{ position: 'relative', zIndex: 201 }}>
        {/* Header — FINAL · CONFIRM mono voice */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            borderBottom: '2px solid #000',
            paddingBottom: 14,
            marginBottom: 20,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#000',
            }}
          >
            {isSigning ? 'SIGNING · BROADCAST' : 'FINAL · CONFIRM'}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 20,
              fontWeight: 900,
              letterSpacing: '-0.02em',
              textTransform: 'uppercase',
              color: '#000',
            }}
          >
            {isSigning ? 'Signing transaction…' : 'Go on record'}
          </span>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!isSigning ? (
            <>
              {/* Call summary */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  color: '#000',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'rgba(0,0,0,0.55)' }}>Type</span>
                  <span style={{ fontWeight: 700 }}>
                    {MARKET_TYPE_LABELS[formValues.marketType] ?? formValues.marketType}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'rgba(0,0,0,0.55)' }}>Asset</span>
                  <span>{formValues.assetA}</span>
                </div>
                {formValues.targetValue && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'rgba(0,0,0,0.55)' }}>Target</span>
                    <span>
                      {/* RC3: canonical 1e8 target scale (raw for event milestones) */}
                      {formatTargetForDisplay(formValues.marketType, formValues.targetValue)} USD
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'rgba(0,0,0,0.55)' }}>Conviction</span>
                  <span style={{ fontWeight: 700 }}>{formValues.conviction}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'rgba(0,0,0,0.55)' }}>Stake</span>
                  <span style={{ fontWeight: 700 }}>
                    ${(Number(formValues.stake) / 1_000_000).toFixed(2)} USDC
                  </span>
                </div>
                {/* B7 (quick-260611-5mh): $10 creation-fee disclosure + stake+fee
                    total — fee from the shared CREATION_FEE constant. */}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'rgba(0,0,0,0.55)' }}>Creation fee</span>
                  <span>${(Number(CREATION_FEE) / 1_000_000).toFixed(2)} USDC</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    borderTop: '1px solid rgba(0,0,0,0.25)',
                    paddingTop: 8,
                  }}
                >
                  <span style={{ color: 'rgba(0,0,0,0.55)' }}>Total (stake + fee)</span>
                  <span style={{ fontWeight: 700 }}>
                    ${((Number(formValues.stake) + Number(CREATION_FEE)) / 1_000_000).toFixed(2)} USDC
                  </span>
                </div>
              </div>

              {/* Permanence strip — black strip on cream (09.2-08 accent pattern) */}
              <div
                style={{
                  background: '#000',
                  padding: '12px 14px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  color: 'var(--bg-inverse)',
                }}
              >
                {PERMANENCE_COPY} The preflight check runs before you sign.
              </div>
            </>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 16,
                padding: '16px 0',
              }}
            >
              <div
                className="animate-spin"
                style={{
                  width: 32,
                  height: 32,
                  border: '4px solid #000',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                }}
              />
              <p
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  color: 'rgba(0,0,0,0.7)',
                  textAlign: 'center',
                  margin: 0,
                }}
              >
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
          <div
            style={{
              borderTop: '2px solid #000',
              marginTop: 20,
              paddingTop: 16,
              display: 'flex',
              gap: 12,
              justifyContent: 'flex-end',
            }}
          >
            <button
              type="button"
              className="btn"
              onClick={onCancel}
              disabled={isPublishing}
              style={{
                background: 'transparent',
                color: '#000',
                borderColor: '#000',
                minHeight: 44,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              onClick={onConfirm}
              disabled={isPublishing}
              style={{
                background: '#000',
                color: 'var(--bg-inverse)',
                borderColor: '#000',
                fontWeight: 800,
                boxShadow: 'var(--shadow-brutal-sm)',
                minHeight: 44,
                opacity: isPublishing ? 0.5 : 1,
                cursor: isPublishing ? 'not-allowed' : 'pointer',
              }}
            >
              {isPublishing ? 'Publishing...' : 'Confirm publish'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
