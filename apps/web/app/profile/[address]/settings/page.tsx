/**
 * Profile Settings page — /profile/[address]/settings
 *
 * Owner-only access: if useAccount().address !== address, redirect to read-only profile.
 *
 * Sections (per plan spec):
 *   1. Handle edit — calls ProfileRegistry.setDisplayHandle (AUTH-35, wagmi direct)
 *   2. Custody Disclosure card — Plan 06 component (AUTH-22)
 *   3. Wallet Export button — usePrivy().exportWallet() (AUTH-23)
 *   4. Connect/Disconnect socials — Privy linkAccount stubs (Phase 1.5 wires onchain)
 *   5. AddressBookManager — Plan 07 component (AUTH-31)
 *
 * 09.2-13 retheme: .page-header + .section-divider + .brutal-card groups +
 * .brutal-input forms + cream primary CTAs; wallet export gets the warning
 * (#FB923C) destructive framing. Owner guard, setDisplayHandle write, and
 * exportWallet wiring UNTOUCHED (D-05/D-14). This page is the user's OWN
 * wallet-management surface — existing address display patterns here are
 * functional; no NEW address rendering added (AUTH-44 applies to public
 * identity surfaces).
 *
 * Requirements: AUTH-22, AUTH-23, AUTH-31, AUTH-34, AUTH-35, UI-10
 */

'use client';

import { useEffect, useState } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { profileRegistryAbi } from '@/lib/abis/ProfileRegistry';
import { CustodyDisclosureCard } from '@/components/CustodyDisclosureCard';
import { AddressBookManager } from '@/components/AddressBookManager';
import { SocialLinkControls } from '@/app/components/SocialLinkControls';
import { Card } from '@call-it/ui';

// ProfileRegistry address from env
const PROFILE_REGISTRY_ADDR = (
  process.env.NEXT_PUBLIC_PROFILE_REGISTRY_ADDRESS as `0x${string}` | undefined
) ?? '0x0000000000000000000000000000000000000000';

interface SettingsPageProps {
  params: Promise<{
    address: string;
  }>;
}

/** JBM section heading (settings group voice) */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="label-overline"
      style={{ color: 'var(--text-secondary)', margin: '0 0 12px 0' }}
    >
      {children}
    </h2>
  );
}

export default function ProfileSettingsPage({ params }: SettingsPageProps) {
  const [pageAddress, setPageAddress] = useState<string>('');
  const { address: connectedAddress } = useAccount();
  const { exportWallet } = usePrivy();
  const router = useRouter();

  // Handle input for setDisplayHandle
  const [handleInput, setHandleInput] = useState('');
  const [handleError, setHandleError] = useState('');

  // wagmi write contract for AUTH-35 handle edit
  const { writeContract, isPending: isWritingHandle, isSuccess: handleWriteSuccess } = useWriteContract();

  // Resolve params (Next.js 15+ params are Promises)
  useEffect(() => {
    params.then(({ address }) => {
      setPageAddress(address);
    }).catch(() => {});
  }, [params]);

  // Owner guard: redirect non-owners to read-only profile
  useEffect(() => {
    if (pageAddress && connectedAddress) {
      if (connectedAddress.toLowerCase() !== pageAddress.toLowerCase()) {
        router.push(`/profile/${pageAddress}`);
      }
    }
  }, [pageAddress, connectedAddress, router]);

  // If we don't have a connected address yet, show a loading state
  if (!pageAddress) {
    return (
      <main style={{ maxWidth: '680px', margin: '0 auto', padding: '24px 16px' }}>
        <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
          Loading...
        </p>
      </main>
    );
  }

  // If not the owner, show a redirect message (the useEffect will navigate away)
  if (connectedAddress && connectedAddress.toLowerCase() !== pageAddress.toLowerCase()) {
    return (
      <main style={{ maxWidth: '680px', margin: '0 auto', padding: '24px 16px' }}>
        <p style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          Redirecting...
        </p>
      </main>
    );
  }

  function handleSetDisplayHandle() {
    if (!handleInput.trim()) {
      setHandleError('Handle cannot be empty');
      return;
    }
    if (handleInput.length > 50) {
      setHandleError('Handle cannot exceed 50 characters (AUTH-42)');
      return;
    }
    setHandleError('');

    // AUTH-35: direct user tx — not through relayer
    writeContract({
      abi: profileRegistryAbi,
      address: PROFILE_REGISTRY_ADDR,
      functionName: 'setDisplayHandle',
      args: [handleInput],
    });
  }

  return (
    <main style={{ maxWidth: '680px', margin: '0 auto', padding: '0 0 64px' }}>
      {/* Page header — Archivo display voice */}
      <div className="page-header" style={{ padding: '32px 0 20px' }}>
        <div>
          <h1 style={{ fontSize: 'clamp(28px, 7vw, 40px)' }}>Settings</h1>
          <p className="sub" style={{ marginTop: '8px' }}>
            <a href={`/profile/${pageAddress}`} style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
              ← Back to profile
            </a>
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* ── Section 1: Handle edit (AUTH-35) ───────────────────────────────── */}
        <Card style={{ padding: '20px' }}>
          <SectionTitle>// Display Handle</SectionTitle>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 16px 0' }}>
            Set your preferred on-chain display name. This overrides ENS and social handles (AUTH-35).
          </p>
          <div style={{ display: 'flex', flexDirection: 'row', gap: '8px' }}>
            <input
              type="text"
              value={handleInput}
              onChange={(e) => setHandleInput(e.target.value)}
              placeholder="mycoolhandle"
              maxLength={50}
              className="brutal-input mono"
              style={{ flex: 1, padding: '8px 12px', fontSize: '0.875rem' }}
            />
            <button
              className="btn cream"
              onClick={handleSetDisplayHandle}
              disabled={isPending()}
              style={{
                cursor: isWritingHandle ? 'not-allowed' : 'pointer',
                opacity: isWritingHandle ? 0.6 : 1,
              }}
            >
              {isWritingHandle ? 'Saving...' : 'Save Handle'}
            </button>
          </div>
          {handleError && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--accent-loss)', margin: '8px 0 0 0' }}>
              {handleError}
            </p>
          )}
          {handleWriteSuccess && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--accent-win)', margin: '8px 0 0 0' }}>
              Handle saved on-chain.
            </p>
          )}
        </Card>

        {/* ── Section 2: Custody Disclosure card (AUTH-22) ───────────────────── */}
        <CustodyDisclosureCard />

        {/* ── Section 3: Wallet Export (AUTH-23) — warning destructive framing ── */}
        <Card style={{ padding: '20px', borderLeft: '4px solid var(--accent-warning)' }}>
          <SectionTitle>// Export Wallet</SectionTitle>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 16px 0' }}>
            Export your private key to take full self-custody of your wallet.
          </p>
          <button
            className="btn"
            onClick={() => exportWallet()}
            style={{
              backgroundColor: 'transparent',
              color: 'var(--accent-warning)',
              border: '2px solid var(--accent-warning)',
            }}
          >
            Export Wallet Key
          </button>
        </Card>

        {/* ── Section 4: Connect / Disconnect socials (AUTH-07/12, D-07/13) ────── */}
        <Card style={{ padding: '20px' }}>
          <SectionTitle>// Connected Accounts</SectionTitle>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 16px 0' }}>
            Link Twitter / X or Farcaster to earn a VERIFIED badge (D-07). Unlinking removes
            the badge + handle reference on-chain (your call history is retained) and clears
            your follow-graph data from our servers (AUTH-12 / AUTH-17). Verification has no
            effect on your stakes, fees, or reputation.
          </p>
          {/* settings mode renders link AND unlink controls for both platforms.
              Unlink = wagmi unlinkTwitter/unlinkFarcaster (user wallet) + relayer purge. */}
          <SocialLinkControls mode="settings" />
        </Card>

        {/* ── Section 5: Address Book (AUTH-31, Plan 07 component) ─────────────── */}
        <Card style={{ padding: '20px' }}>
          <SectionTitle>// Address Book</SectionTitle>
          <AddressBookManager />
        </Card>

      </div>
    </main>
  );

  function isPending() {
    return isWritingHandle;
  }
}
