/**
 * duels-client — single source for the duels wire (quick-260611-ust).
 *
 * Covers BOTH duels reads:
 *   - GET /api/duels            → { duels, count, duelKing } list (10s relayer cache)
 *   - GET /api/duels/:id/live-state → per-duel enrichment (callId/winner/expiry/
 *     reserves; 4s relayer cache), merged with getMarketLine(callId) for the
 *     duel's human-readable subject line.
 *
 * D-07 degrade contract: every fetcher returns `null` on ANY failure (timeout,
 * non-OK, malformed body, deferred state) — the consumer HIDES or degrades the
 * dependent UI. Absent data is never fabricated.
 *
 * Shared display helpers (formatUsdc / truncateAddress / gradFor) are lifted
 * VERBATIM from the pre-rework app/duels/page.tsx so /duels and the feed Duels
 * tab share one copy.
 */

import { getMarketLine } from './relayer-client';

// Both NEXT_PUBLIC_RELAYER_URL (the duels surfaces' precedent: app/duels +
// app/duel/[challengeId]) and NEXT_PUBLIC_RELAYER_BASE_URL (lib/relayer-client)
// point at the same relayer deploy — prefer the duels-surface var this module's
// fetchers were lifted from, fall back to the relayer-client base.
const RELAYER_URL = (
  process.env['NEXT_PUBLIC_RELAYER_URL'] ??
  process.env['NEXT_PUBLIC_RELAYER_BASE_URL'] ??
  ''
).replace(/\/$/, '');

// ── Wire types (apps/relayer/src/routes/duels.ts DuelEntry/DuelKingEntry) ─────

export type DuelEntry = {
  challengeId: string;
  challengerStake: string;
  callerStake: string;
  pot: string;
  status: string;
  proposedAt: string;
  acceptedAt: string | null;
  challenger: string;
  caller: string;
  isTrending: boolean;
};

export type DuelKing = {
  winnerAddress: string;
  winStreak: string;
  highestPotUsdc: string;
  lastWinAt: string | null;
};

export type DuelsResponse = {
  duels: DuelEntry[];
  duelKing: DuelKing | null;
};

/** Defensive duelKing mapping — null when absent or malformed (D-07). */
function mapDuelKing(raw: unknown): DuelKing | null {
  if (raw === null || typeof raw !== 'object') return null;
  const k = raw as Record<string, unknown>;
  const winnerAddress = String(k['winnerAddress'] ?? '');
  if (winnerAddress.length === 0) return null;
  return {
    winnerAddress,
    winStreak: String(k['winStreak'] ?? '0'),
    highestPotUsdc: String(k['highestPotUsdc'] ?? '0'),
    lastWinAt:
      k['lastWinAt'] === null || k['lastWinAt'] === undefined
        ? null
        : String(k['lastWinAt']),
  };
}

/**
 * GET /api/duels — list + duelKing. Optional `status` filter (subgraph status
 * values, e.g. 'Settled'; route default is Proposed+Accepted). Returns null on
 * ANY failure — never throws.
 */
export async function fetchDuels(status?: string): Promise<DuelsResponse | null> {
  if (!RELAYER_URL) return null; // skip entirely when the env is unset
  try {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    const res = await fetch(`${RELAYER_URL}/api/duels${qs}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as { duels?: unknown[]; duelKing?: unknown };
    const duels: DuelEntry[] = !Array.isArray(raw.duels)
      ? []
      : raw.duels
          .map((d) => {
            const e = d as Record<string, unknown>;
            return {
              challengeId: String(e['challengeId'] ?? ''),
              challengerStake: String(e['challengerStake'] ?? '0'),
              callerStake: String(e['callerStake'] ?? '0'),
              pot: String(e['pot'] ?? '0'),
              status: String(e['status'] ?? 'Proposed'),
              proposedAt: String(e['proposedAt'] ?? '0'),
              acceptedAt:
                e['acceptedAt'] === null || e['acceptedAt'] === undefined
                  ? null
                  : String(e['acceptedAt']),
              challenger: String(e['challenger'] ?? ''),
              caller: String(e['caller'] ?? ''),
              isTrending: Boolean(e['isTrending'] ?? false),
            };
          })
          .filter((d) => d.challengeId.length > 0);
    return { duels, duelKing: mapDuelKing(raw.duelKing) };
  } catch {
    return null;
  }
}

// ── Per-duel enrichment (apps/relayer/src/routes/duel-live-state.ts) ──────────

export type DuelEnrichment = {
  callId?: string;
  winner?: string;
  expiry?: number;
  followReserve?: bigint;
  fadeReserve?: bigint;
  marketLine?: string;
};

/**
 * GET /api/duels/:id/live-state → DuelEnrichment, merged with the existing
 * getMarketLine(callId) helper (lib/relayer-client.ts — NO client-side
 * market-line builder, no new ABI fragments).
 *
 * Per-field defensive mapping: a field that fails to parse is OMITTED (the
 * card hides the dependent block, D-07). `deferred: true` (pre-deploy escrow
 * placeholder) → null. Never throws.
 */
export async function fetchDuelEnrichment(
  challengeId: string,
): Promise<DuelEnrichment | null> {
  if (!RELAYER_URL) return null;
  try {
    const res = await fetch(
      `${RELAYER_URL}/api/duels/${encodeURIComponent(challengeId)}/live-state`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;
    const raw = (await res.json()) as Record<string, unknown>;
    if (raw['deferred'] === true) return null;

    const enrichment: DuelEnrichment = {};

    const callId = raw['callId'];
    if (typeof callId === 'string' && callId.length > 0 && callId !== '0') {
      enrichment.callId = callId;
    }
    const winner = raw['winner'];
    if (typeof winner === 'string' && winner.length > 0) {
      enrichment.winner = winner;
    }
    const expiry = Number(raw['expiry']);
    if (Number.isFinite(expiry) && expiry > 0) {
      enrichment.expiry = expiry;
    }
    try {
      enrichment.followReserve = BigInt(String(raw['followReserve']));
    } catch {
      // non-parseable followReserve — omit the field (D-07)
    }
    try {
      enrichment.fadeReserve = BigInt(String(raw['fadeReserve']));
    } catch {
      // non-parseable fadeReserve — omit the field (D-07)
    }

    if (enrichment.callId !== undefined) {
      const line = await getMarketLine(enrichment.callId);
      if (line !== null) enrichment.marketLine = line;
    }

    return enrichment;
  } catch {
    return null;
  }
}

// ── Shared display helpers (lifted verbatim from app/duels/page.tsx) ──────────

export function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address || '—';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatUsdc(raw: string): string {
  try {
    const n = Number(BigInt(raw)) / 1_000_000;
    if (!Number.isFinite(n)) return '—';
    return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  } catch {
    return '—';
  }
}

/** Deterministic prototype avatar grad class (a–f) per handle. */
const AVATAR_GRAD_CLASSES = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
export function gradFor(handle: string): string {
  let acc = 0;
  for (let i = 0; i < handle.length; i++) acc = (acc + handle.charCodeAt(i)) % AVATAR_GRAD_CLASSES.length;
  return `avatar-grad-${AVATAR_GRAD_CLASSES[acc] ?? 'a'}`;
}
