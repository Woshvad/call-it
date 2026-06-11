'use client';
/**
 * WalletPill — the header balance pill ("2,840.21 USDC · handle") extracted
 * from AppShell, now a click-anchored wallet popover (quick-260611-scj).
 *
 * Pill FACE (AUTH-44): handle + balance ONLY — never an address. When the
 * relayer's handle source is 'truncated' (a shortened wallet address), the
 * face shows the balance alone. The address NEVER exists in the DOM while
 * the popover is closed.
 *
 * Popover (user decision 2026-06-11): clicking the pill opens an anchored
 * panel showing the viewer's OWN wallet address — standard wallet UX. The
 * address appears only after a deliberate click; this is the viewer's own
 * address, not someone else's, so AUTH-44's "never show addresses" spirit
 * (identity-first display of OTHERS) is preserved.
 *
 * D-07 degrade: profile undefined → panel shows address + balance + quick
 * links only (no headline handle, no stats line, no verified pills).
 *
 * Handle casing: handles render AS STORED — no uppercase transform (user
 * decision 2026-06-11; precedent in ProfileHeader.tsx).
 *
 * Close behavior: Escape, outside click (mousedown contains-check on the
 * WRAPPER so a pill re-click only runs the button toggle — no close-then-
 * reopen race), and navigation via the footer links. Listeners attach only
 * while open.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { useProfile } from '@/hooks/useProfile';

export function WalletPill() {
  const { authenticated, ready, user } = usePrivy();
  const { address } = useAccount();
  const profileAddr =
    address ?? (user?.wallet?.address as `0x${string}` | undefined);
  const { formatted } = useUsdcBalance();
  const { data: profile } = useProfile(
    authenticated && ready ? profileAddr : undefined,
  );

  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on Escape + outside click — listeners attached ONLY while open.
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function handleMouseDown(e: MouseEvent) {
      // Contains check on the WRAPPER: a pill click while open passes this
      // check, so only the button's own toggle runs — no insta-reopen.
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [open]);

  // Auth-dependent slot: nothing until Privy is ready + a balance exists.
  if (!ready || !authenticated || formatted === undefined) return null;

  const balance = Number(formatted).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  // AUTH-44: a 'truncated' source means the handle IS a shortened wallet
  // address — treat as "no handle" and render the balance only.
  const handle =
    profile && profile.source !== 'truncated' ? profile.handle : null;

  async function handleCopy() {
    if (!profileAddr) return;
    try {
      await navigator.clipboard.writeText(profileAddr);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard not available
    }
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        className="wallet-pill"
        data-testid="wallet-pill"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="balance">
          {balance}
          <span className="ccy">USDC</span>
        </span>
        {handle && <span className="handle">{handle}</span>}
      </button>

      {/* AUTH-44 pill-face contract: the address exists in the DOM ONLY
          inside this gated panel — never while the popover is closed. */}
      {open && profileAddr && (
        <div
          role="dialog"
          aria-label="Wallet"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            zIndex: 60,
            width: 300,
            maxWidth: 'calc(100vw - 28px)',
            border: '2px solid var(--border-strong)',
            background: 'var(--bg-secondary)',
            borderRadius: 0,
            boxShadow: '4px 4px 0 0 rgba(0,0,0,0.8)',
            padding: 14,
          }}
        >
          {/* Identity headline — handle (as stored) OR truncated address */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 10,
            }}
          >
            {handle ? (
              <>
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 800,
                    fontSize: 18,
                    // Handles render AS STORED (user decision 2026-06-11).
                    textTransform: 'none',
                    color: 'var(--text-primary)',
                  }}
                >
                  @{handle}
                </span>
                {profile?.verifiedX && <span className="pill muted">VERIFIED · X</span>}
                {profile?.verifiedFc && <span className="pill muted">VERIFIED · FC</span>}
              </>
            ) : (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 14,
                  color: 'var(--text-primary)',
                }}
              >
                {`${profileAddr.slice(0, 6)}…${profileAddr.slice(-4)}`}
              </span>
            )}
          </div>

          {/* Address row — ALWAYS renders; the address is the point */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              marginBottom: 10,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--text-secondary)',
              }}
            >
              {`${profileAddr.slice(0, 6)}…${profileAddr.slice(-4)}`}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--text-primary)',
                border: '2px solid var(--border-active)',
                background: 'var(--bg-tertiary)',
                padding: '3px 8px',
                cursor: 'pointer',
                borderRadius: 0,
              }}
            >
              {copied ? 'COPIED' : 'COPY'}
            </button>
          </div>

          {/* Balance row — the primary number in the panel */}
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 16,
              color: 'var(--text-primary)',
              marginBottom: profile ? 8 : 10,
            }}
          >
            {balance}
            <span style={{ color: 'var(--text-tertiary)', marginLeft: 4, fontSize: 12 }}>
              USDC
            </span>
          </div>

          {/* Stats line — only when profile data exists (D-07) */}
          {profile && (
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--text-tertiary)',
                marginBottom: 10,
              }}
            >
              {profile.totalCalls} call{profile.totalCalls === 1 ? '' : 's'} ·{' '}
              {profile.settledCalls} settled · {profile.wins} win
              {profile.wins === 1 ? '' : 's'}
              {Number.isFinite(profile.globalRep) && <> · REP {profile.globalRep}</>}
            </div>
          )}

          {/* Footer quick links — close on navigate */}
          <Link
            href={`/profile/${profileAddr}`}
            onClick={() => setOpen(false)}
            style={{
              display: 'block',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              borderTop: '1px solid var(--border-active)',
              padding: '8px 0',
            }}
          >
            VIEW PROFILE →
          </Link>
          <Link
            href={`/profile/${profileAddr}/settings`}
            onClick={() => setOpen(false)}
            style={{
              display: 'block',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              borderTop: '1px solid var(--border-active)',
              padding: '8px 0 0',
            }}
          >
            SETTINGS →
          </Link>
        </div>
      )}
    </div>
  );
}
