'use client';
/**
 * FromYourNetworkSections — "From your X" + "From your Farcaster" feed sections (AUTH-14/15/18).
 *
 * Renders, for an OPTED-IN viewer only, two collapsible sections above the main feed:
 *   - "From your X"        → GET /api/feed/from-your-x
 *   - "From your Farcaster" → GET /api/feed/from-your-farcaster
 * Each is fetched on mount with the Privy bearer token and shows the active calls
 * (≤10, recency, no settled — enforced server-side, AUTH-15) of people the viewer
 * follows who are linked Call It users.
 *
 * AUTH-16 (declined-never-renders): the per-platform opt-in preference (persisted in
 * 01.5-04) gates rendering via shouldRenderFollowGraphSection — a declined or unset
 * platform's section is NEVER rendered. If neither platform is opted in, the whole
 * component renders nothing.
 *
 * Pitfall 5 (never block the main feed): every fetch degrades to
 * { items: [], source: 'empty' }; an empty section renders a quiet empty state and
 * never throws. Both sections can appear simultaneously (AUTH-18).
 *
 * Neobrutalist tokens (#09090E / #E8F542, sharp 2px borders, hard shadow); flexbox only.
 *
 * Requirements: AUTH-14, AUTH-15, AUTH-16, AUTH-18.
 */

import { useCallback, useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import {
  readFollowGraphPreference,
  shouldRenderFollowGraphSection,
  type FollowGraphPlatform,
  type FollowGraphPreference,
} from '@/lib/follow-graph-preference';

// ── Types (mirror the relayer section response shape) ───────────────────────────

interface NetworkFeedItem {
  callId: string;
  handle: string;
  marketLine: string;
  status: string;
  deadline: string;
}

interface SectionResponse {
  items: NetworkFeedItem[];
  source: 'live' | 'cache' | 'empty';
}

const RELAYER_BASE = (process.env['NEXT_PUBLIC_RELAYER_BASE_URL'] ?? '').replace(/\/$/, '');

const COLORS = {
  bg: '#09090E',
  surface: '#111118',
  borderSubtle: '#1E1E2E',
  borderActive: '#2E2E42',
  accent: '#E8F542',
  textPrimary: '#F1F5F9',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
} as const;

const EMPTY: SectionResponse = { items: [], source: 'empty' };

/**
 * Fetch a feed section with the Privy bearer token. Always resolves (never throws);
 * a missing base URL / token / non-200 / network error degrades to an empty section
 * so the main feed is never blocked (Pitfall 5).
 */
async function fetchSection(path: string, token: string | null): Promise<SectionResponse> {
  if (!RELAYER_BASE || !token) return EMPTY;
  try {
    const res = await fetch(`${RELAYER_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return EMPTY;
    const data = (await res.json()) as Partial<SectionResponse>;
    return { items: Array.isArray(data.items) ? data.items : [], source: data.source ?? 'empty' };
  } catch {
    return EMPTY;
  }
}

// ── Single feed item row (compact neobrutalist card) ────────────────────────────

function ItemRow({ item, platform }: { item: NetworkFeedItem; platform: FollowGraphPlatform }) {
  // Every caller in this section is a linked (platform-verified) Call It user by
  // construction (cross-reference matched their linked handle) — surface the badge.
  const badge = platform === 'twitter' ? 'VERIFIED · X' : 'VERIFIED · FC';
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        border: `2px solid ${COLORS.borderActive}`,
        background: COLORS.surface,
        padding: '10px 12px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span
          style={{
            fontFamily: 'Space Grotesk, monospace',
            fontSize: 15,
            fontWeight: 700,
            color: COLORS.textPrimary,
          }}
        >
          @{item.handle || 'caller'}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            border: `2px solid ${COLORS.accent}`,
            background: '#0D1A00',
            color: COLORS.accent,
            fontFamily: 'Space Grotesk, monospace',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            padding: '1px 5px',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {badge}
        </span>
        {item.status === 'active-duel' && (
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: 11,
              color: '#FB923C',
              fontWeight: 700,
              letterSpacing: '0.06em',
            }}
          >
            ⚔ DUEL
          </span>
        )}
      </div>
      <span style={{ fontFamily: 'monospace', fontSize: 13, color: COLORS.textSecondary }}>
        {item.marketLine}
      </span>
    </div>
  );
}

// ── Collapsible section ─────────────────────────────────────────────────────────

function NetworkSection({
  title,
  platform,
  data,
  collapsed,
  onToggle,
}: {
  title: string;
  platform: FollowGraphPlatform;
  data: SectionResponse;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        border: `2px solid ${COLORS.borderSubtle}`,
        background: COLORS.bg,
      }}
    >
      {/* Header — collapse toggle (AUTH-18) */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '10px 12px',
          background: 'transparent',
          border: 'none',
          borderBottom: collapsed ? 'none' : `2px solid ${COLORS.borderSubtle}`,
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            fontFamily: 'Space Grotesk, monospace',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: COLORS.accent,
          }}
        >
          {title}
          {data.items.length > 0 && (
            <span style={{ color: COLORS.textSecondary, marginLeft: 8 }}>({data.items.length})</span>
          )}
        </span>
        <span style={{ fontFamily: 'monospace', fontSize: 12, color: COLORS.textMuted }}>
          {collapsed ? '▸' : '▾'}
        </span>
      </button>

      {/* Body */}
      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px' }}>
          {data.items.length === 0 ? (
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 12,
                color: COLORS.textMuted,
                lineHeight: 1.4,
              }}
            >
              No active calls from people you follow{platform === 'twitter' ? ' on X' : ' on Farcaster'} yet.
            </span>
          ) : (
            data.items.map((item) => (
              <ItemRow key={`${platform}-${item.callId}`} item={item} platform={platform} />
            ))
          )}
        </div>
      )}
    </section>
  );
}

// ── Main component ──────────────────────────────────────────────────────────────

export function FromYourNetworkSections() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const [pref, setPref] = useState<FollowGraphPreference | null>(null);
  const [xData, setXData] = useState<SectionResponse>(EMPTY);
  const [fcData, setFcData] = useState<SectionResponse>(EMPTY);
  const [xCollapsed, setXCollapsed] = useState(false);
  const [fcCollapsed, setFcCollapsed] = useState(false);

  // Read the per-platform opt-in preference (client-only — localStorage).
  useEffect(() => {
    setPref(readFollowGraphPreference());
  }, []);

  const showX = shouldRenderFollowGraphSection(pref, 'twitter');
  const showFc = shouldRenderFollowGraphSection(pref, 'farcaster');

  // Fetch each opted-in section on feed open (refresh-on-open; the follow-graph
  // itself is cached 1h server-side). Never blocks; degrades to empty on any error.
  const loadSections = useCallback(async () => {
    if (!ready || !authenticated || (!showX && !showFc)) return;
    const token = await getAccessToken().catch(() => null);
    if (!token) return;
    if (showX) void fetchSection('/api/feed/from-your-x', token).then(setXData);
    if (showFc) void fetchSection('/api/feed/from-your-farcaster', token).then(setFcData);
  }, [ready, authenticated, showX, showFc, getAccessToken]);

  useEffect(() => {
    void loadSections();
  }, [loadSections]);

  // AUTH-16: a declined OR unset platform never renders. If neither is opted in,
  // render nothing at all (the main feed is unaffected).
  if (!showX && !showFc) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
      {showX && (
        <NetworkSection
          title="From your X"
          platform="twitter"
          data={xData}
          collapsed={xCollapsed}
          onToggle={() => setXCollapsed((c) => !c)}
        />
      )}
      {showFc && (
        <NetworkSection
          title="From your Farcaster"
          platform="farcaster"
          data={fcData}
          collapsed={fcCollapsed}
          onToggle={() => setFcCollapsed((c) => !c)}
        />
      )}
    </div>
  );
}
