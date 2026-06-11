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
 * platform's section is NEVER rendered. If neither platform is opted in, the component
 * renders the optional `fallback` (or nothing when no fallback is passed).
 *
 * quick-260611-t7h: now hosted under the home feed's Following tab (moved off
 * the Live tab — prototype parity). The `fallback` prop renders when BOTH
 * sections are hidden (declined/unset platforms) so the Following tab can show
 * an honest dashed empty state instead of a blank body.
 *
 * Pitfall 5 (never block the main feed): every fetch degrades to
 * { items: [], source: 'empty' }; an empty section renders a quiet empty state and
 * never throws. Both sections can appear simultaneously (AUTH-18).
 *
 * 09.2-06 restyle: prototype `.section-divider` recipe header (live-dot + JBM
 * overline title with the REAL caller count + collapse affordance — the toggle is
 * existing working wiring, kept) over token-layer item rows. Markup only — gate,
 * fetch, and collapse logic are unchanged (D-05). Flexbox only.
 *
 * Requirements: AUTH-14, AUTH-15, AUTH-16, AUTH-18.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
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

const EMPTY: SectionResponse = { items: [], source: 'empty' };

/**
 * X follow-graph availability gate. The relayer's "From your X" cross-reference
 * needs the PAID X API tier (follows.read scope via X_API_BEARER_TOKEN), which
 * is not provisioned — the endpoint always degrades to empty. Until the operator
 * lands the key on the relayer (apps/relayer/src/lib/x-api-client.ts), the X
 * section renders a COMING SOON state and skips the pointless fetch. Flip to
 * true when the key is live. The Farcaster section is independent of this gate.
 */
const X_FOLLOW_GRAPH_LIVE = false;

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

// ── Single feed item row (token-layer brutal row) ────────────────────────────────

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
        border: '2px solid var(--border-active)',
        background: 'var(--bg-secondary)',
        padding: '10px 12px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span
          className="mono"
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}
        >
          @{item.handle || 'caller'}
        </span>
        <span className="pill win">{badge}</span>
        {item.status === 'active-duel' && (
          <span className="pill duel">⚔ DUEL</span>
        )}
      </div>
      <span className="mono" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        {item.marketLine}
      </span>
    </div>
  );
}

// ── Collapsible section (.section-divider header) ───────────────────────────────

function NetworkSection({
  title,
  platform,
  data,
  collapsed,
  onToggle,
  comingSoon = false,
}: {
  title: string;
  platform: FollowGraphPlatform;
  data: SectionResponse;
  collapsed: boolean;
  onToggle: () => void;
  /** Renders a COMING SOON body instead of items/empty copy (X — paid API tier pending). */
  comingSoon?: boolean;
}) {
  // REAL caller count from the fetched items (unique handles) — never faked (D-07).
  const callerCount = new Set(data.items.map((i) => i.handle)).size;
  const countSuffix =
    callerCount > 0
      ? ` · ${callerCount} ${callerCount === 1 ? 'CALLER' : 'CALLERS'} YOU FOLLOW ${callerCount === 1 ? 'IS' : 'ARE'} LIVE`
      : '';

  return (
    <section style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header — .section-divider recipe; the whole row is the existing
          collapse toggle (AUTH-18, working wiring kept) */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="section-divider"
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          margin: '0 0 14px',
          cursor: 'pointer',
          width: '100%',
          minHeight: 44,
          textAlign: 'left',
        }}
      >
        <span className="title">
          <span className="live-dot" aria-hidden="true" />
          {title.toUpperCase()}
          {countSuffix}
        </span>
        <span className="line" />
        <span
          className="mono"
          style={{ fontSize: 10.5, color: 'var(--text-tertiary)', letterSpacing: '0.06em' }}
        >
          {collapsed ? 'expand ↓' : 'collapse ↑'}
        </span>
      </button>

      {/* Body */}
      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {comingSoon ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                border: '2px solid var(--border-active)',
                background: 'var(--bg-secondary)',
                padding: '10px 12px',
              }}
            >
              <span className="pill warn">COMING SOON</span>
              <span
                className="mono"
                style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.4 }}
              >
                Calls from people you follow on X will appear here. Follow-graph sync is in the
                works.
              </span>
            </div>
          ) : data.items.length === 0 ? (
            <span
              className="mono"
              style={{
                fontSize: 12,
                color: 'var(--text-tertiary)',
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

export function FromYourNetworkSections({ fallback }: { fallback?: ReactNode } = {}) {
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
    if (showX && X_FOLLOW_GRAPH_LIVE) void fetchSection('/api/feed/from-your-x', token).then(setXData);
    if (showFc) void fetchSection('/api/feed/from-your-farcaster', token).then(setFcData);
  }, [ready, authenticated, showX, showFc, getAccessToken]);

  useEffect(() => {
    void loadSections();
  }, [loadSections]);

  // AUTH-16: a declined OR unset platform never renders. If neither is opted in,
  // render the host-provided fallback (or nothing — the main feed is unaffected).
  if (!showX && !showFc) return <>{fallback ?? null}</>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
      {showX && (
        <NetworkSection
          title="From your X"
          platform="twitter"
          data={xData}
          collapsed={xCollapsed}
          onToggle={() => setXCollapsed((c) => !c)}
          comingSoon={!X_FOLLOW_GRAPH_LIVE}
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
