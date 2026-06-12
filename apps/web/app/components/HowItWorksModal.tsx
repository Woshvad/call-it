/**
 * HowItWorksModal — Polymarket-style explainer modal (user request 2026-06-12,
 * quick-260612-8wk).
 *
 * Copy canon (re-anchored quick-260612-a6v, user request 2026-06-12 — the
 * homepage was replaced with the acid hero): the signin landing no longer
 * renders the three-step section, so this modal is now the SINGLE copy canon
 * for the how-it-works steps. The landing (apps/web/app/signin/page.tsx)
 * MOUNTS this modal from its "How it works" nav pill; the
 * how-it-works-modal.test.ts lockstep guards the modal verbatim plus that
 * mount/trigger linkage.
 *
 * Chrome: the D-13 cream .modal-panel template mirrored from
 * ChallengeFormModal.tsx — fixed inset-0 z-200 rgba(0,0,0,0.82) + blur(4px)
 * overlay, cream var(--bg-inverse) panel, BLACK text, 3px black border,
 * var(--shadow-brutal-lg).
 *
 * Static content — no data fetches, no chain hooks, no tx-in-flight guards.
 * The only useEffect is the Escape-to-close listener (always closes —
 * nothing in-flight to protect).
 */

'use client';

import React, { useEffect } from 'react';

export type HowItWorksModalProps = {
  open: boolean;
  onClose: () => void;
  onPrimaryCta: () => void;
};

// Copy canon: STEPS is now the CANONICAL source (the signin HOW_IT_WORKS
// duplicate was deleted in quick-260612-a6v). NEVER paraphrase; the lockstep
// test now guards this file alone plus the landing's mount/trigger linkage.
const STEPS = [
  {
    n: '01',
    title: 'GO ON RECORD',
    body: 'Make a call on any crypto market. Pick your conviction. Stake USDC. Your prediction is now permanent and public.',
  },
  {
    n: '02',
    title: 'FOLLOW OR FADE',
    body: 'Others bet with you or against you. Every position is real money on the line. The market prices your prediction in real time.',
  },
  {
    n: '03',
    title: 'GET YOUR RECEIPT',
    body: 'When the call settles, the outcome stamps onto your receipt forever. CALLED IT. LOUD AND WRONG. Either way, the world knows.',
  },
];

export function HowItWorksModal({ open, onClose, onPrimaryCta }: HowItWorksModalProps) {
  // Escape ALWAYS closes — static content, no in-flight guard
  // (ChallengeFormModal's escInFlight does not apply here).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      // .modal-overlay template (D-13): rgba(0,0,0,0.82) scrim + blur(4px), z-200
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        backgroundColor: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* .modal-panel template (D-13): cream var(--bg-inverse), BLACK text,
          3px black border, brutal-lg shadow */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="How it works"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          backgroundColor: 'var(--bg-inverse)',
          color: '#000',
          border: '3px solid #000',
          boxShadow: 'var(--shadow-brutal-lg)',
          borderRadius: 0,
          padding: 'clamp(24px, 5vw, 36px)',
          width: 'min(92vw, 560px)',
          maxHeight: '85vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        {/* Header row — overline + close ✕ (44px touch target) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Cream-context inline overline idiom (NOT the dark-bg .label-overline) */}
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10px',
                fontWeight: 700,
                color: 'rgba(0,0,0,0.55)',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
              }}
            >
              · HOW IT WORKS
            </span>
            {/* Heading — ONE contiguous string, sentence case (landing canon) */}
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                color: '#000',
                fontSize: 'clamp(26px, 6vw, 38px)',
                lineHeight: 0.95,
                margin: 0,
              }}
            >
              Three steps. One receipt.
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'rgba(0,0,0,0.55)',
              fontSize: '20px',
              lineHeight: 1,
              minWidth: 44,
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* The 3 steps — mono number column + title/body */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {STEPS.map((step) => (
            <div key={step.n} style={{ display: 'flex', flexDirection: 'row', gap: '14px' }}>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  fontSize: '13px',
                  color: '#000',
                  width: '24px',
                  flexShrink: 0,
                  paddingTop: '2px',
                }}
              >
                {step.n}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '15px',
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    color: '#000',
                  }}
                >
                  {step.title}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '13px',
                    color: 'rgba(0,0,0,0.75)',
                    lineHeight: 1.5,
                  }}
                >
                  {step.body}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Real deployed constants — same numbers as the signin FEES table */}
        <div
          style={{
            borderTop: '1px solid rgba(0,0,0,0.25)',
            paddingTop: '14px',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'rgba(0,0,0,0.7)',
            letterSpacing: '0.08em',
          }}
        >
          $5 MIN · $100 MAX PER CALL · 1.7% SETTLEMENT FEE
        </div>

        {/* Primary CTA — black fill, cream text (the modal-panel inverse idiom) */}
        <button
          type="button"
          onClick={onPrimaryCta}
          style={{
            width: '100%',
            minHeight: 44,
            fontFamily: 'var(--font-display)',
            fontSize: '14px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--bg-inverse)',
            backgroundColor: '#000',
            border: '3px solid #000',
            boxShadow: 'var(--shadow-brutal)',
            padding: '14px 16px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          MAKE YOUR FIRST CALL ▸
        </button>
      </div>
    </div>
  );
}
