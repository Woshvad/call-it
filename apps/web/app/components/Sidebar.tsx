'use client';
/**
 * Sidebar — 240px sticky desktop nav (prototype `app.jsx` Sidebar, D-10).
 *
 * Sections: "// TAPE" (The Tape, Leaderboard) and "// YOU" (Make a call,
 * Your profile, Settings, Disputes). Nav items are Next.js Links; active
 * route = `.nav-item.active` (bg-secondary + 3px accent left border),
 * derived from usePathname.
 *
 * Cream `.sidebar-rep` YOUR REP card pinned to the bottom — fed by the
 * EXISTING viewer profile fetch (useProfile → lib/relayer-client getProfile).
 * NO sparkline v1 (D-10). If the viewer has no profile data the card is
 * HIDDEN, never faked (D-07).
 *
 * `.sidebar-meta` footer shows REAL deploy values only: app version from
 * package.json + ARBITRUM SEPOLIA (current deploy) — never the prototype's
 * fake block number (D-05).
 *
 * AUTH-44: handles only — no raw wallet address is ever rendered here.
 * Auth-dependent slots (profile/settings links, rep card) gate on
 * `authenticated && ready` so the Privy ssr:false late-hydration flash
 * shows stable chrome (wiring-risk #4).
 */

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import { useProfile } from '@/hooks/useProfile';
import { Icon, type IconName } from './Icon';
import pkg from '../../package.json';

const APP_VERSION = (pkg as { version?: string }).version ?? '0.0.0';

interface NavEntry {
  label: string;
  href: Route;
  icon: IconName;
  /** Active when pathname starts with this (default: href). */
  activePrefix?: string;
  /** Active ONLY on exact pathname match (used by "/" and profile-vs-settings). */
  exact?: boolean;
}

function NavRow({ entry, active }: { entry: NavEntry; active: boolean }) {
  return (
    <Link
      href={entry.href}
      className={`nav-item ${active ? 'active' : ''}`}
      style={{ textDecoration: 'none' }}
    >
      <Icon name={entry.icon} size={15} strokeWidth={1.7} />
      <span>{entry.label}</span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname() ?? '';
  const { authenticated, ready, user } = usePrivy();
  const { address } = useAccount();

  // WR-03: Privy OAuth logins can lag the wagmi address — fall back to the
  // Privy embedded-wallet address (same pattern as MobileDrawer).
  const profileAddr =
    address ?? (user?.wallet?.address as `0x${string}` | undefined);
  const showAuthed = authenticated && ready;

  // EXISTING viewer profile fetch (relayer-client getProfile via useProfile) —
  // feeds the YOUR REP card; react-query dedupes with any other consumer.
  const { data: profile } = useProfile(showAuthed ? profileAddr : undefined);

  const tapeNav: NavEntry[] = [
    { label: 'The Tape', href: '/', icon: 'feed', exact: true },
    { label: 'Leaderboard', href: '/leaderboard', icon: 'leaderboard' },
    // C7 (quick-260611-5mh): duels index — /duel/:id pages were unreachable
    // by navigation before this entry existed.
    // F-E19: crossed-swords 'duel' glyph — distinct from Disputes' 'book'.
    { label: 'Duels', href: '/duels' as Route, icon: 'duel' },
  ];

  const youNav: NavEntry[] = [
    { label: 'Make a call', href: '/new', icon: 'create' },
    // Profile + Settings need the viewer identity — hidden until it exists
    // (degrade-to-hidden, D-07; never flash authed links to logged-out viewers).
    ...(showAuthed && profileAddr
      ? [
          {
            label: 'Your profile',
            href: `/profile/${profileAddr}` as Route,
            icon: 'profile' as IconName,
            exact: true,
          },
          {
            label: 'Settings',
            href: `/profile/${profileAddr}/settings` as Route,
            icon: 'settings' as IconName,
          },
        ]
      : []),
    { label: 'Disputes', href: '/disputes', icon: 'book' },
  ];

  const isActive = (entry: NavEntry): boolean => {
    if (entry.exact) return pathname === entry.href;
    return pathname.startsWith(entry.activePrefix ?? entry.href);
  };

  // Accuracy line only when it can be computed from real data (D-07).
  const accuracyLine =
    profile && profile.settledCalls > 0
      ? `${Math.round((profile.wins / profile.settledCalls) * 100)}% accuracy · ${profile.settledCalls} settled`
      : null;

  return (
    <aside className="sidebar">
      <div className="nav-section-label">{'// TAPE'}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {tapeNav.map((entry) => (
          <NavRow key={entry.href} entry={entry} active={isActive(entry)} />
        ))}
      </div>

      <div className="nav-section-label" style={{ marginTop: 22 }}>
        {'// YOU'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {youNav.map((entry) => (
          <NavRow key={entry.href} entry={entry} active={isActive(entry)} />
        ))}
      </div>

      {/* Cream YOUR REP card — real viewer profile data or nothing (D-07) */}
      {profile && (
        <div className="sidebar-rep" data-testid="sidebar-rep">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="label">YOUR REP</span>
          </div>
          <div className="rep-num">{profile.globalRep.toLocaleString()}</div>
          {accuracyLine && (
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: '#555',
                fontWeight: 600,
              }}
            >
              {accuracyLine}
            </div>
          )}
        </div>
      )}

      {/* REAL deploy values only — never the prototype's fake block number (D-05) */}
      <div className="sidebar-meta" style={profile ? undefined : { marginTop: 'auto' }}>
        v{APP_VERSION} · ARBITRUM SEPOLIA
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <Link href="/terms" style={{ color: 'inherit', textDecoration: 'underline' }}>
            TERMS
          </Link>
          <Link href={'/privacy' as Route} style={{ color: 'inherit', textDecoration: 'underline' }}>
            PRIVACY
          </Link>
        </div>
      </div>
    </aside>
  );
}
