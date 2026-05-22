/**
 * Fund step — fund your embedded wallet before committing to the tagline.
 *
 * Shows two funding paths:
 *   1. Coinbase Onramp popup (D-34) — `<CoinbaseOnrampButton />`
 *   2. Direct USDC transfer — user's embedded wallet address (copyable, QR code)
 *
 * Live balance shown via `useUsdcBalance()`.
 * "Continue" / "Skip" always allowed — balance > 0 enables the Continue button.
 *
 * AUTH-44: No wallet address rendered in the main onboarding visual; address IS
 *   shown in the deposit instructions panel (this is the explicit exception —
 *   the user needs to know where to send funds).
 *
 * Requirements: AUTH-23, AUTH-25, D-34
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import { Button, Tag } from '@call-it/ui';
import { CoinbaseOnrampButton } from '../../../components/CoinbaseOnrampButton';
import { useUsdcBalance } from '../../../hooks/useUsdcBalance';
import { useOnboardingState } from '../../../hooks/useOnboardingState';

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function FundPage() {
  const router = useRouter();
  const { address } = useAccount();
  const { balance, formatted } = useUsdcBalance();
  const { advance } = useOnboardingState();
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
      {/* Screen header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <h2
          style={{
            fontSize: '1.25rem',
            fontWeight: 900,
            color: '#F4F4F5',
            fontFamily: "'Syne', sans-serif",
            textTransform: 'uppercase',
            margin: 0,
            letterSpacing: '-0.02em',
          }}
        >
          FUND YOUR WALLET
        </h2>
        <p
          style={{
            fontSize: '0.75rem',
            color: '#A1A1AA',
            fontFamily: 'monospace',
            margin: 0,
          }}
        >
          Calls require USDC on Arbitrum as your stake. You can start with as little as $5.
        </p>
      </div>

      {/* Live balance */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          backgroundColor: '#0F0F14',
          border: '2px solid #27272A',
        }}
      >
        <span style={{ fontSize: '0.75rem', color: '#A1A1AA', fontFamily: 'monospace' }}>
          Balance
        </span>
        <span
          style={{
            fontSize: '1rem',
            fontFamily: 'monospace',
            fontWeight: 700,
            color: hasBalance ? '#E8F542' : '#52525B',
          }}
          data-testid="usdc-balance"
        >
          {displayBalance}
        </span>
      </div>

      {/* Funding options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Option 1: Coinbase Onramp (D-34 popup) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <p style={{ fontSize: '0.625rem', fontFamily: 'monospace', color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
            Buy with card or bank
          </p>
          <CoinbaseOnrampButton
            onComplete={() => { /* balance auto-refreshes via useUsdcBalance */ }}
          />
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#27272A' }} />
          <span style={{ fontSize: '0.625rem', fontFamily: 'monospace', color: '#52525B', textTransform: 'uppercase' }}>
            or
          </span>
          <div style={{ flex: 1, height: '1px', backgroundColor: '#27272A' }} />
        </div>

        {/* Option 2: Direct transfer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p style={{ fontSize: '0.625rem', fontFamily: 'monospace', color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
            Send USDC directly
          </p>

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
                    fontFamily: 'monospace',
                    color: '#A1A1AA',
                    padding: '8px',
                    backgroundColor: '#0F0F14',
                    border: '1px solid #27272A',
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
            <p style={{ fontSize: '0.75rem', color: '#52525B', fontFamily: 'monospace', margin: 0 }}>
              Connect wallet to see deposit address
            </p>
          )}
        </div>
      </div>

      {error && (
        <p
          style={{ fontSize: '0.75rem', color: '#ef4444', fontFamily: 'monospace', margin: 0 }}
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
        >
          {isContinuing ? 'Saving...' : hasBalance ? 'CONTINUE →' : 'SKIP FOR NOW →'}
        </Button>
      </div>
    </>
  );
}
