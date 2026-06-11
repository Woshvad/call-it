/**
 * SocialLinkControls — reusable Twitter (X) + Farcaster link/unlink controls (01.5-04)
 *
 * Used by:
 *   - onboarding/socials   (mode="onboarding") — link only
 *   - profile/[address]/settings (mode="settings") — link AND unlink
 *
 * Flows:
 *   - Twitter LINK:   Privy useLinkAccount().linkTwitter() → on link, POST the
 *                     Privy-verified handle proof to the relayer via
 *                     `${NEXT_PUBLIC_RELAYER_BASE_URL}/api/social/link` with a
 *                     `Authorization: Bearer <privy access token>` header. The
 *                     relayer re-reads the verified handle from Privy server-side
 *                     (never trusts the client) and submits ProfileRegistry.linkTwitter
 *                     from its KMS wallet (01.5-02).
 *   - Farcaster LINK: Farcaster Auth Kit useSignIn() produces a signed SIWF
 *                     { message, signature, nonce } → POST to
 *                     `/api/social/link/farcaster`. The provider `domain` MUST equal
 *                     the relayer FARCASTER_AUTH_DOMAIN for verifySignInMessage to pass
 *                     (Pitfall 3, wired in Providers.tsx).
 *   - UNLINK (settings only): wagmi writeContract(unlinkTwitter | unlinkFarcaster) from
 *                     the user's own wallet (user-callable on-chain — removes badge +
 *                     handle reference, retains on-chain history; AUTH-12) followed by a
 *                     best-effort POST `/api/social/unlink-purge { platform }` that clears
 *                     the off-chain follow-graph (D-13/AUTH-17).
 *
 * ADDITIVE-ONLY GUARANTEE (Pitfall 5 / Pitfall 16): every network call is best-effort.
 * A failure surfaces an inline retry message and NEVER throws into the page — linking
 * must never break the sign-in / onboarding path. A relayer outage degrades to "try
 * again", not a broken screen.
 *
 * Requirements: AUTH-07 (Farcaster link), AUTH-12 (unlink via Settings)
 */

'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { ACTIVE_CHAIN_ID } from '@/lib/chain';
import { ensureActiveChain } from '@/lib/ensure-chain';
import { usePrivy, useLinkAccount } from '@privy-io/react-auth';
import { useAccount, useWriteContract } from 'wagmi';
import { useSignIn, QRCode } from '@farcaster/auth-kit';
import { Button } from '@call-it/ui';
import { profileRegistryAbi } from '@/lib/abis/ProfileRegistry';
import { useIsMobile } from '../hooks/useIsMobile';

type Mode = 'onboarding' | 'settings';

export interface SocialLinkControlsProps {
  mode: Mode;
}

const RELAYER_BASE = (process.env['NEXT_PUBLIC_RELAYER_BASE_URL'] ?? '').replace(/\/$/, '');

const PROFILE_REGISTRY_ADDR = (
  process.env['NEXT_PUBLIC_PROFILE_REGISTRY_ADDRESS'] as `0x${string}` | undefined
) ?? '0x0000000000000000000000000000000000000000';

type Status = 'idle' | 'pending' | 'ok' | 'error';

/** Inline status line — never throws; shows a retry affordance on error. */
function StatusLine({
  status,
  errorMsg,
  testId,
}: {
  status: Status;
  errorMsg: string | null;
  testId: string;
}) {
  if (status === 'idle') return null;
  if (status === 'ok') {
    return (
      <p
        data-testid={`${testId}-ok`}
        style={{ fontSize: '0.7rem', color: 'var(--accent-win)', fontFamily: 'var(--font-mono)', margin: 0 }}
      >
        Linked.
      </p>
    );
  }
  if (status === 'error') {
    return (
      <p
        data-testid={`${testId}-error`}
        role="alert"
        style={{ fontSize: '0.7rem', color: 'var(--accent-loss)', fontFamily: 'var(--font-mono)', margin: 0 }}
      >
        {errorMsg ?? 'Something went wrong — try again.'}
      </p>
    );
  }
  return null;
}

export function SocialLinkControls({ mode }: SocialLinkControlsProps) {
  const { user, getAccessToken } = usePrivy();
  const { writeContractAsync } = useWriteContract();
  const { address: connectedAddress } = useAccount();
  const isMobile = useIsMobile(); // D-03: >=44px touch targets at mobile only
  // Mobile touch-target floor applied to every link/unlink Button (the link CTAs use
  // `flex: 1`, so we merge rather than overwrite their style).
  const touchTarget = isMobile ? { minHeight: '44px' } : undefined;

  const isTwitterLinked = user?.linkedAccounts.some((a) => a.type === 'twitter_oauth') ?? false;
  const isFarcasterLinked = user?.linkedAccounts.some((a) => a.type === 'farcaster') ?? false;

  // ── C12 (quick-260611-5mh): per-WALLET linked state ─────────────────────
  // Privy linkedAccounts say the Privy USER linked a social — but the on-chain
  // ProfileRegistry link is per-WALLET. When the current wallet's profile has
  // no twitterHandle/farcasterHandle while Privy says "linked", the truth is
  // "linked to a DIFFERENT wallet" and a relink affordance is offered.
  const currentWallet =
    connectedAddress ?? (user?.wallet?.address as `0x${string}` | undefined);
  const [walletProfile, setWalletProfile] = useState<{
    twitterHandle: string | null;
    farcasterHandle: string | null;
  } | null>(null);
  const [walletProfileVersion, setWalletProfileVersion] = useState(0);
  const refetchWalletProfile = useCallback(
    () => setWalletProfileVersion((v) => v + 1),
    [],
  );

  useEffect(() => {
    if (!RELAYER_BASE || !currentWallet) {
      setWalletProfile(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${RELAYER_BASE}/api/profile/${currentWallet}`, {
          signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok || cancelled) return;
        const raw = await res.json() as Record<string, unknown>;
        if (cancelled) return;
        setWalletProfile({
          twitterHandle: typeof raw['twitterHandle'] === 'string' ? raw['twitterHandle'] : null,
          farcasterHandle: typeof raw['farcasterHandle'] === 'string' ? raw['farcasterHandle'] : null,
        });
      } catch {
        // Best-effort (Pitfall 5/16): unknown profile state degrades to the
        // Privy-derived indicator — never claim a mismatch without data.
        if (!cancelled) setWalletProfile(null);
      }
    })();
    return () => { cancelled = true; };
  }, [currentWallet, walletProfileVersion]);

  // Mismatch = Privy says linked, but THIS wallet's on-chain profile has no
  // handle. Only asserted when the profile fetch actually returned data.
  const twitterLinkedElsewhere =
    isTwitterLinked && walletProfile !== null && !walletProfile.twitterHandle;
  const farcasterLinkedElsewhere =
    isFarcasterLinked && walletProfile !== null && !walletProfile.farcasterHandle;

  // ── Twitter state ──────────────────────────────────────────────────────
  const [twStatus, setTwStatus] = useState<Status>('idle');
  const [twError, setTwError] = useState<string | null>(null);

  // ── Farcaster state ────────────────────────────────────────────────────
  const [fcStatus, setFcStatus] = useState<Status>('idle');
  const [fcError, setFcError] = useState<string | null>(null);

  /**
   * POST the linked-Twitter proof to the relayer. The relayer reads the verified
   * handle from Privy server-side (Pitfall 2) — the body carries nothing trusted.
   * 409 → handle already linked to another profile (D-06).
   */
  const postTwitterLink = useCallback(async () => {
    setTwStatus('pending');
    setTwError(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('no-token');
      const res = await fetch(`${RELAYER_BASE}/api/social/link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      if (res.status === 409) {
        setTwError('That handle is already linked to another profile.');
        setTwStatus('error');
        return;
      }
      if (!res.ok) {
        setTwError('Could not link Twitter / X right now — try again.');
        setTwStatus('error');
        return;
      }
      setTwStatus('ok');
      // C12: re-read the current wallet's on-chain profile so the linked
      // indicator reflects the wallet-accurate state.
      refetchWalletProfile();
    } catch {
      // Pitfall 5/16: never throw into the page — show retry only.
      setTwError('Could not reach the linking service — try again.');
      setTwStatus('error');
    }
  }, [getAccessToken, refetchWalletProfile]);

  // Privy v3 link hook — on successful Twitter link, push the proof to the relayer.
  const { linkTwitter } = useLinkAccount({
    onSuccess: () => {
      void postTwitterLink();
    },
    onError: () => {
      // User cancelled or Privy errored — additive, non-fatal.
      setTwError('Twitter linking was cancelled or failed — try again.');
      setTwStatus('error');
    },
  });

  const handleLinkTwitter = useCallback(() => {
    setTwStatus('pending');
    setTwError(null);
    try {
      linkTwitter();
    } catch {
      setTwError('Could not open the Twitter link flow — try again.');
      setTwStatus('error');
    }
  }, [linkTwitter]);

  // ── Farcaster SIWF via Auth Kit ──────────────────────────────────────────
  const postFarcasterLink = useCallback(
    async (payload: { nonce?: string; domain?: string; message?: string; signature?: string }) => {
      setFcStatus('pending');
      setFcError(null);
      try {
        const token = await getAccessToken();
        if (!token) throw new Error('no-token');
        const res = await fetch(`${RELAYER_BASE}/api/social/link/farcaster`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            nonce: payload.nonce,
            domain: payload.domain,
            message: payload.message,
            signature: payload.signature,
          }),
        });
        if (res.status === 409) {
          setFcError('That Farcaster account is already linked to another profile.');
          setFcStatus('error');
          return;
        }
        if (!res.ok) {
          setFcError('Could not link Farcaster right now — try again.');
          setFcStatus('error');
          return;
        }
        setFcStatus('ok');
        // C12: wallet-accurate indicator refresh
        refetchWalletProfile();
      } catch {
        setFcError('Could not reach the linking service — try again.');
        setFcStatus('error');
      }
    },
    [getAccessToken, refetchWalletProfile],
  );

  const { signIn, connect, url, isPolling } = useSignIn({
    timeout: 300_000,
    onSuccess: (res: { message?: string; signature?: string; nonce?: string }) => {
      void postFarcasterLink({
        nonce: res.nonce,
        domain:
          process.env['NEXT_PUBLIC_FARCASTER_AUTH_DOMAIN'] ??
          (typeof window !== 'undefined' ? window.location.host : undefined),
        message: res.message,
        signature: res.signature,
      });
    },
    onError: () => {
      setFcError('Farcaster sign-in was cancelled or failed — try again.');
      setFcStatus('error');
    },
  });

  const handleLinkFarcaster = useCallback(async () => {
    setFcStatus('pending');
    setFcError(null);
    try {
      // Auth Kit: await connect() so the relay-channel `url` is ready (QR/redirect),
      // then signIn() drives the polling flow. Best-effort — never throws into the page.
      await connect();
      signIn();
    } catch {
      setFcError('Could not open the Farcaster sign-in flow — try again.');
      setFcStatus('error');
    }
  }, [connect, signIn]);

  // ── Unlink (settings mode only) ──────────────────────────────────────────
  const purgeOffChain = useCallback(
    async (platform: 'twitter' | 'farcaster') => {
      // Best-effort relayer purge (D-13/AUTH-17). A failure here is non-fatal —
      // the SocialUnlinked watcher backstops the purge.
      try {
        const token = await getAccessToken();
        if (!token) return;
        await fetch(`${RELAYER_BASE}/api/social/unlink-purge`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ platform }),
        });
      } catch {
        // swallow — backstop watcher handles durable purge
      }
    },
    [getAccessToken],
  );

  const handleUnlinkTwitter = useCallback(async () => {
    setTwStatus('pending');
    setTwError(null);
    try {
      await ensureActiveChain();
      await writeContractAsync({
        chainId: ACTIVE_CHAIN_ID,
        abi: profileRegistryAbi,
        address: PROFILE_REGISTRY_ADDR,
        functionName: 'unlinkTwitter',
      });
      await purgeOffChain('twitter');
      setTwStatus('idle');
    } catch {
      setTwError('Could not unlink Twitter / X — try again.');
      setTwStatus('error');
    }
  }, [writeContractAsync, purgeOffChain]);

  const handleUnlinkFarcaster = useCallback(async () => {
    setFcStatus('pending');
    setFcError(null);
    try {
      await ensureActiveChain();
      await writeContractAsync({
        chainId: ACTIVE_CHAIN_ID,
        abi: profileRegistryAbi,
        address: PROFILE_REGISTRY_ADDR,
        functionName: 'unlinkFarcaster',
      });
      await purgeOffChain('farcaster');
      setFcStatus('idle');
    } catch {
      setFcError('Could not unlink Farcaster — try again.');
      setFcStatus('error');
    }
  }, [writeContractAsync, purgeOffChain]);

  const showUnlink = mode === 'settings';

  // Twitter handle (canonical handle/page.tsx pattern) → full-width linked label.
  const twitterAccount = user?.linkedAccounts.find((a) => a.type === 'twitter_oauth') as
    | { type: 'twitter_oauth'; username?: string }
    | undefined;
  const twitterUsername = twitterAccount?.username;
  const twitterLinkedLabel = twitterUsername ? `✓ @${twitterUsername} linked` : '✓ X linked';

  // Full-width on-brand "linked" indicator (mirrors the link CTAs' `flex: 1` width).
  // 09.2-13: cream linked-state treatment (var(--bg-inverse) panel, black text/border).
  const linkedIndicatorStyle: CSSProperties = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    boxSizing: 'border-box',
    padding: '0.5rem 0.75rem',
    minHeight: '44px',
    border: '2px solid #000',
    background: 'var(--bg-inverse)',
    color: '#000',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.8rem',
    fontWeight: 700,
    textAlign: 'left',
    boxShadow: 'var(--shadow-brutal-sm)',
  };

  return (
    <div
      data-testid="social-link-controls"
      data-mode={mode}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
    >
      {/* ── Twitter / X ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {twitterLinkedElsewhere ? (
            /* C12: Privy says linked, but THIS wallet's profile has no
               twitterHandle — honest state + relink via the EXISTING flow. */
            <>
              <div
                data-testid="twitter-linked-elsewhere"
                style={{
                  ...linkedIndicatorStyle,
                  background: 'transparent',
                  color: 'var(--accent-warning)',
                  border: '2px solid var(--accent-warning)',
                  boxShadow: 'none',
                }}
              >
                {twitterUsername ? `@${twitterUsername}` : 'X'} — linked to a different wallet
              </div>
              <Button
                intent="primary"
                size="sm"
                onClick={() => {
                  void postTwitterLink();
                }}
                disabled={twStatus === 'pending'}
                data-testid="relink-twitter-button"
                style={touchTarget}
              >
                {twStatus === 'pending' ? 'Linking...' : 'Link to this wallet'}
              </Button>
            </>
          ) : isTwitterLinked ? (
            <>
              <div data-testid="twitter-linked-tag" style={linkedIndicatorStyle}>
                {twitterLinkedLabel}
              </div>
              {showUnlink && (
                <Button
                  intent="secondary"
                  size="sm"
                  onClick={() => {
                    void handleUnlinkTwitter();
                  }}
                  disabled={twStatus === 'pending'}
                  data-testid="unlink-twitter-button"
                  style={touchTarget}
                >
                  {twStatus === 'pending' ? 'Unlinking...' : 'Unlink Twitter / X'}
                </Button>
              )}
            </>
          ) : (
            <Button
              intent="primary"
              size="md"
              onClick={handleLinkTwitter}
              disabled={twStatus === 'pending'}
              data-testid="link-twitter-button"
              style={{ flex: 1, ...touchTarget }}
            >
              {twStatus === 'pending' ? 'Connecting...' : 'Link Twitter / X'}
            </Button>
          )}
        </div>
        {/* New full-width indicator conveys the linked state — suppress the
            duplicate StatusLine 'ok' (map 'ok'→'idle'); pending/error stay inline. */}
        <StatusLine
          status={twStatus === 'ok' ? 'idle' : twStatus}
          errorMsg={twError}
          testId="twitter"
        />
      </div>

      {/* ── Farcaster ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {farcasterLinkedElsewhere && !(fcStatus === 'pending' && url) ? (
            /* C12: Privy says linked but THIS wallet's profile carries no
               farcasterHandle — relink runs the EXISTING SIWF flow. */
            <>
              <div
                data-testid="farcaster-linked-elsewhere"
                style={{
                  ...linkedIndicatorStyle,
                  background: 'transparent',
                  color: 'var(--accent-warning)',
                  border: '2px solid var(--accent-warning)',
                  boxShadow: 'none',
                }}
              >
                Farcaster — linked to a different wallet
              </div>
              <Button
                intent="primary"
                size="sm"
                onClick={() => {
                  void handleLinkFarcaster();
                }}
                disabled={fcStatus === 'pending'}
                data-testid="relink-farcaster-button"
                style={touchTarget}
              >
                {fcStatus === 'pending' ? 'Connecting...' : 'Link to this wallet'}
              </Button>
            </>
          ) : isFarcasterLinked && !(fcStatus === 'pending' && url) ? (
            <>
              <div data-testid="farcaster-linked-tag" style={linkedIndicatorStyle}>
                ✓ Farcaster linked
              </div>
              {showUnlink && (
                <Button
                  intent="secondary"
                  size="sm"
                  onClick={() => {
                    void handleUnlinkFarcaster();
                  }}
                  disabled={fcStatus === 'pending'}
                  data-testid="unlink-farcaster-button"
                  style={touchTarget}
                >
                  {fcStatus === 'pending' ? 'Unlinking...' : 'Unlink Farcaster'}
                </Button>
              )}
            </>
          ) : fcStatus === 'pending' && url ? (
            // Channel is open and the relay `url` is ready → surface the real
            // Warpcast flow (QR on desktop, redirect on mobile) instead of
            // hanging. Also reached from the C12 "Link to this wallet" relink
            // path (Privy already linked → the old !isFarcasterLinked guard
            // would have suppressed the QR panel and dead-ended the flow).
            <div
              data-testid={isMobile ? 'farcaster-open-warpcast' : 'farcaster-qr-panel'}
              style={{
                flex: 1,
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                alignItems: isMobile ? 'stretch' : 'center',
                gap: '0.5rem',
                padding: '0.75rem',
                border: '2px solid var(--border-strong)',
                background: 'var(--bg-secondary)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {isMobile ? (
                <>
                  <Button
                    intent="primary"
                    size="md"
                    onClick={() => {
                      window.location.href = url;
                    }}
                    style={{ flex: 1, minHeight: '44px' }}
                  >
                    Open in Warpcast
                  </Button>
                  <p style={{ fontSize: '0.7rem', color: 'var(--accent-win)', margin: 0 }}>
                    Approve in Warpcast, then return here
                  </p>
                </>
              ) : (
                <>
                  <QRCode uri={url} size={176} />
                  <p style={{ fontSize: '0.7rem', color: 'var(--accent-win)', margin: 0 }}>
                    Scan with the Warpcast app on your phone
                  </p>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '0.7rem', color: 'var(--accent-win)' }}
                  >
                    Open link
                  </a>
                </>
              )}
              {isPolling && (
                <p style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', margin: 0 }}>Waiting for approval…</p>
              )}
              <button
                type="button"
                onClick={() => {
                  setFcStatus('idle');
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                  padding: 0,
                  textDecoration: 'underline',
                }}
                data-testid="farcaster-cancel"
              >
                Cancel
              </button>
            </div>
          ) : (
            <Button
              intent="primary"
              size="md"
              onClick={() => {
                void handleLinkFarcaster();
              }}
              disabled={fcStatus === 'pending'}
              data-testid="link-farcaster-button"
              style={{ flex: 1, ...touchTarget }}
            >
              {fcStatus === 'pending' ? 'Connecting...' : 'Link Farcaster'}
            </Button>
          )}
        </div>
        <StatusLine status={fcStatus} errorMsg={fcError} testId="farcaster" />
      </div>
    </div>
  );
}
