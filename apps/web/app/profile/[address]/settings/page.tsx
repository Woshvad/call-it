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
        <p style={{ fontFamily: 'monospace', color: '#52525B', fontSize: '0.875rem' }}>
          Loading...
        </p>
      </main>
    );
  }

  // If not the owner, show a redirect message (the useEffect will navigate away)
  if (connectedAddress && connectedAddress.toLowerCase() !== pageAddress.toLowerCase()) {
    return (
      <main style={{ maxWidth: '680px', margin: '0 auto', padding: '24px 16px' }}>
        <p style={{ fontFamily: 'monospace', color: '#A1A1AA', fontSize: '0.875rem' }}>
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
    <main style={{ maxWidth: '680px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Page header */}
      <div style={{ marginBottom: '32px' }}>
        <h1
          style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            fontFamily: 'monospace',
            color: '#FFFFFF',
            margin: '0 0 4px 0',
          }}
        >
          Settings
        </h1>
        <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#52525B', margin: 0 }}>
          <a href={`/profile/${pageAddress}`} style={{ color: '#A1A1AA', textDecoration: 'none' }}>
            ← Back to profile
          </a>
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* ── Section 1: Handle edit (AUTH-35) ───────────────────────────────── */}
        <Card style={{ padding: '20px' }}>
          <h2 style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.875rem', color: '#E8F542', margin: '0 0 12px 0' }}>
            Display Handle
          </h2>
          <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#A1A1AA', margin: '0 0 16px 0' }}>
            Set your preferred on-chain display name. This overrides ENS and social handles (AUTH-35).
          </p>
          <div style={{ display: 'flex', flexDirection: 'row', gap: '8px' }}>
            <input
              type="text"
              value={handleInput}
              onChange={(e) => setHandleInput(e.target.value)}
              placeholder="mycoolhandle"
              maxLength={50}
              style={{
                flex: 1,
                padding: '8px 12px',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                backgroundColor: '#0F0F14',
                border: '2px solid #27272A',
                color: '#FFFFFF',
                outline: 'none',
              }}
            />
            <button
              onClick={handleSetDisplayHandle}
              disabled={isPending()}
              style={{
                padding: '8px 16px',
                fontFamily: 'monospace',
                fontWeight: 700,
                fontSize: '0.875rem',
                backgroundColor: '#E8F542',
                color: '#09090E',
                border: '2px solid #000',
                cursor: isWritingHandle ? 'not-allowed' : 'pointer',
                opacity: isWritingHandle ? 0.6 : 1,
              }}
            >
              {isWritingHandle ? 'Saving...' : 'Save Handle'}
            </button>
          </div>
          {handleError && (
            <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#EF4444', margin: '8px 0 0 0' }}>
              {handleError}
            </p>
          )}
          {handleWriteSuccess && (
            <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#22C55E', margin: '8px 0 0 0' }}>
              Handle saved on-chain.
            </p>
          )}
        </Card>

        {/* ── Section 2: Custody Disclosure card (AUTH-22) ───────────────────── */}
        <CustodyDisclosureCard />

        {/* ── Section 3: Wallet Export (AUTH-23) ─────────────────────────────── */}
        <Card style={{ padding: '20px' }}>
          <h2 style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.875rem', color: '#E8F542', margin: '0 0 12px 0' }}>
            Export Wallet
          </h2>
          <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#A1A1AA', margin: '0 0 16px 0' }}>
            Export your private key to take full self-custody of your wallet.
          </p>
          <button
            onClick={() => exportWallet()}
            style={{
              padding: '8px 16px',
              fontFamily: 'monospace',
              fontWeight: 700,
              fontSize: '0.875rem',
              backgroundColor: 'transparent',
              color: '#FFFFFF',
              border: '2px solid #27272A',
              cursor: 'pointer',
            }}
          >
            Export Wallet Key
          </button>
        </Card>

        {/* ── Section 4: Connect / Disconnect socials (AUTH-07/12, D-07/13) ────── */}
        <Card style={{ padding: '20px' }}>
          <h2 style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.875rem', color: '#E8F542', margin: '0 0 12px 0' }}>
            Connected Accounts
          </h2>
          <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#A1A1AA', margin: '0 0 16px 0' }}>
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
          <h2 style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.875rem', color: '#E8F542', margin: '0 0 16px 0' }}>
            Address Book
          </h2>
          <AddressBookManager />
        </Card>

      </div>
    </main>
  );

  function isPending() {
    return isWritingHandle;
  }
}
