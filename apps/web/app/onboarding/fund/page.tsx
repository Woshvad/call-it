/**
 * Fund step — fund your embedded wallet before committing to the tagline.
 *
 * Shows two funding paths:
 *   1. Privy-native funding (`<PrivyFundButton />`) — card / external wallet / exchange,
 *      via Privy's useFundWallet flow (supersedes the spec's D-34 Coinbase Onramp popup;
 *      see PrivyFundButton.tsx for the provider-swap rationale, 2026-05-29).
 *   2. Direct USDC transfer — user's embedded wallet address (copyable, QR code)
 *
 * Live balance shown via `useUsdcBalance()`.
 * "Continue" / "Skip" always allowed — balance > 0 enables the Continue button.
 *
 * AUTH-44: No wallet address rendered in the main onboarding visual; address IS
 *   shown in the deposit instructions panel (this is the explicit exception —
 *   the user needs to know where to send funds).
 *
 * 09.2-13 retheme: .stat-block balance display + .label-overline section labels;
 * useUsdcBalance/PrivyFundButton wiring and all data-testid hooks untouched (D-05/D-14).
 *
 * Requirements: AUTH-23, AUTH-25 (funding provider: Privy-native, not D-34 Coinbase)
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { Button, Tag } from '@call-it/ui';
import { PrivyFundButton } from '../../../components/PrivyFundButton';
import { useUsdcBalance } from '../../../hooks/useUsdcBalance';
import { useOnboardingState } from '../../../hooks/useOnboardingState';
import { useIsMobile } from '../../hooks/useIsMobile';

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function FundPage() {
  const router = useRouter();
  const { address } = useAccount();
  const { balance, formatted } = useUsdcBalance();
  const { advance } = useOnboardingState();
  const isMobile = useIsMobile(); // D-03: >=44px touch targets at mobile only
  const [isContinuing, setIsContinuing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  const hasBalance = balance !== undefined && balance > 0n;
  const displayBalance = formatted ? `${formatted} USDC` : '0 USDC';

  // Generate QR code for the deposit address
  useEffect(() => {
    if (!address || !qrRef.current) return;

    void (async () => {
      try {
        const QRCode = (await import('qrcode')).default;
        const canvas = document.createElement('canvas');
        await QRCode.toCanvas(canvas, address, { width: 140, margin: 1 });
        if (qrRef.current) {
          qrRef.current.innerHTML = '';
          qrRef.current.appendChild(canvas);
        }
      } catch {
        // QR code generation failed — silently skip, address is still shown as text
      }
    })();
  }, [address]);

  async function handleContinue() {
    setIsContinuing(true);
    setError(null);
    try {
      await advance('fund');
      router.push('/onboarding/tagline');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save. Please try again.');
    } finally {
      setIsContinuing(false);
    }
  }

  async function handleCopy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  }

  return (
    <>
      {/* Screen header — Archivo display voice */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <h2
          style={{
            fontSize: '1.5rem',
            fontWeight: 900,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-display)',
            textTransform: 'uppercase',
            margin: 0,
            letterSpacing: '-0.03em',
            lineHeight: 0.95,
          }}
        >
          FUND YOUR WALLET
        </h2>
        <p
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
            margin: 0,
          }}
        >
          Calls require USDC on Arbitrum as your stake. You can start with as little as $5.
        </p>
      </div>

      {/* Live balance — .stat-block recipe */}
      <div className="stat-block">
        <div className="stat-label">Balance</div>
        <div
          className="stat-value"
          style={{ color: hasBalance ? 'var(--accent-win)' : 'var(--text-tertiary)' }}
          data-testid="usdc-balance"
        >
          {displayBalance}
        </div>
      </div>

      {/* Funding options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Option 1: Privy-native funding (card / external wallet / exchange) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span className="label-overline">
            Buy with card or transfer from an exchange
          </span>
          <PrivyFundButton
            onComplete={() => { /* balance auto-refreshes via useUsdcBalance */ }}
          />
        </div>

        {/* Divider */}
        <div className="section-divider" style={{ margin: 0 }}>
          <div className="line" />
          <span className="title">or</span>
          <div className="line" />
        </div>

        {/* Option 2: Direct transfer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <span className="label-overline">
            Send USDC directly
          </span>

          {address ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {/* QR code */}
              <div
                ref={qrRef}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                data-testid="qr-code"
              />

              {/* Address with copy */}
              <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
                <code
                  style={{
                    flex: 1,
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-secondary)',
                    padding: '8px',
                    backgroundColor: 'var(--bg-quaternary)',
                    border: '1px solid var(--border-subtle)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  data-testid="deposit-address"
                  title={address}
                >
                  {truncateAddress(address)}
                </code>
                <Button
                  intent="secondary"
                  size="sm"
                  onClick={() => { void handleCopy(); }}
                  data-testid="copy-address-button"
                  style={isMobile ? { minHeight: '44px' } : undefined}
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </Button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'row', gap: '0.5rem', flexWrap: 'wrap' }}>
                <Tag intent="info">Arbitrum One</Tag>
                <Tag intent="success">USDC only</Tag>
              </div>
            </div>
          ) : (
            <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', margin: 0 }}>
              Connect wallet to see deposit address
            </p>
          )}
        </div>
      </div>

      {error && (
        <p
          style={{ fontSize: '0.75rem', color: 'var(--accent-loss)', fontFamily: 'var(--font-mono)', margin: 0 }}
          role="alert"
        >
          {error}
        </p>
      )}

      {/* Continue / Skip */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <Button
          intent="primary"
          size="md"
          onClick={() => { void handleContinue(); }}
          disabled={isContinuing}
          data-testid="fund-continue-button"
          style={isMobile ? { minHeight: '44px' } : undefined}
        >
          {isContinuing ? 'Saving...' : hasBalance ? 'CONTINUE →' : 'SKIP FOR NOW →'}
        </Button>
      </div>
    </>
  );
}
