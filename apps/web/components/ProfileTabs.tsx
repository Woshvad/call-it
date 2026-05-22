/**
 * ProfileTabs — tab navigation for profile pages.
 *
 * Phase 1 tabs:
 *   Overview — stub (Phase 7 will add full leaderboard + chart)
 *   Settings — links to /profile/[address]/settings
 *
 * FLEXBOX ONLY — no display:grid (Pitfall 15).
 *
 * Requirements: UI-05, UI-08, AUTH-35
 */

'use client';

import { useState } from 'react';

export type TabId = 'overview' | 'settings';

interface ProfileTabsProps {
  address: string;
  initialTab?: TabId;
}

/**
 * ProfileTabs — renders Overview and Settings tab navigation.
 */
export function ProfileTabs({ address, initialTab = 'overview' }: ProfileTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: '8px',
          borderBottom: '2px solid #27272A',
          paddingBottom: '8px',
        }}
      >
        <button
          onClick={() => setActiveTab('overview')}
          style={{
            padding: '6px 16px',
            fontFamily: 'monospace',
            fontSize: '0.875rem',
            fontWeight: activeTab === 'overview' ? 700 : 400,
            color: activeTab === 'overview' ? '#E8F542' : '#A1A1AA',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'overview' ? '2px solid #E8F542' : '2px solid transparent',
            cursor: 'pointer',
            marginBottom: '-10px', // overlap the tab bar border
          }}
        >
          Overview
        </button>
        {/* Settings tab links to /profile/[address]/settings */}
        <a
          href={`/profile/${address}/settings`}
          style={{
            padding: '6px 16px',
            fontFamily: 'monospace',
            fontSize: '0.875rem',
            fontWeight: 400,
            color: '#A1A1AA',
            textDecoration: 'none',
          }}
        >
          Settings
        </a>
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div>
          {/* Phase 7: Overview tab will show full leaderboard + chart + recent calls.
              Phase 1: stub — shows "recent calls" placeholder. */}
          <p
            style={{
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              color: '#52525B',
              margin: 0,
            }}
          >
            {/* Recent calls list rendered by parent via wagmi useReadContract */}
          </p>
        </div>
      )}
    </div>
  );
}
