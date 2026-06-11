/**
 * Relayer client — typed fetch wrapper over the relayer API.
 *
 * All relayer endpoints are proxied through NEXT_PUBLIC_RELAYER_BASE_URL.
 * The relayer holds the subgraph Studio API key, the PRIVY_APP_SECRET, and the
 * Alchemy API key — none of these reach the frontend bundle.
 *
 * Decision D-27: Studio key is held by relayer only; frontend hits /api/feed.
 * Requirement: AUTH-31, AUTH-32, CALL-28, UI-01
 * Source: PATTERNS.md § relayer-client (partial analog to og-fallback-render.ts)
 */

import { SUBGRAPH_URL_SEPOLIA } from '@call-it/shared';
import type { MarketType, EventSubtype, Category } from '@call-it/shared';

const RELAYER_BASE = (process.env['NEXT_PUBLIC_RELAYER_BASE_URL'] ?? '').replace(/\/$/, '');

/**
 * Structured error thrown by all relayer client methods.
 * Matches the relayer's error response shape from Plan 07.
 */
export class RelayerError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'RelayerError';
  }
}

/**
 * Internal fetch helper — throws RelayerError on non-2xx responses.
 */
async function relayerFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${RELAYER_BASE}${path}`;
  // Headers must merge AFTER the init spread: `...init` re-introduces
  // `init.headers` wholesale, so spreading it last clobbered Content-Type
  // whenever a caller passed Authorization — fetch then sent string bodies as
  // text/plain and the relayer's zod saw "Expected object, received string".
  const { headers: initHeaders, ...restInit } = init ?? {};
  const res = await fetch(url, {
    ...restInit,
    headers: { 'Content-Type': 'application/json', ...initHeaders },
  });

  if (!res.ok) {
    let code = 'RELAYER_ERROR';
    let message = `Relayer request failed: ${res.status}`;
    let fieldErrors: Record<string, string[]> | undefined;

    try {
      const body = (await res.json()) as {
        code?: string;
        message?: string;
        fieldErrors?: Record<string, string[]>;
        /** Relayer 422 shape: { ok:false, errors:[{field,code,message}] } (D-31). */
        errors?: Array<{ field?: string; code?: string; message?: string }>;
      };
      code = body.code ?? code;
      message = body.message ?? message;
      fieldErrors = body.fieldErrors;

      // quick-260611-bf2 BUG 3: the preflight route NEVER sends `fieldErrors` —
      // its 422 body is { ok:false, errors:[{field,code,message}] }. Fold that
      // array into the fieldErrors record so RelayerError.fieldErrors actually
      // carries the per-field messages (the D-31 inline mapping never fired).
      // Defensive guards: other endpoints' error bodies must never throw here.
      if (fieldErrors === undefined && Array.isArray(body.errors) && body.errors.length > 0) {
        const folded: Record<string, string[]> = {};
        for (const entry of body.errors) {
          if (entry === null || typeof entry !== 'object') continue;
          const field = typeof entry.field === 'string' && entry.field ? entry.field : 'root';
          const msg =
            (typeof entry.message === 'string' && entry.message) ||
            (typeof entry.code === 'string' && entry.code) ||
            'Validation error';
          (folded[field] ??= []).push(msg);
        }
        if (Object.keys(folded).length > 0) {
          fieldErrors = folded;
        }
        // Give RelayerError.message something meaningful when the body had none.
        if (body.message === undefined) {
          const first = body.errors[0];
          if (first && typeof first.message === 'string' && first.message) {
            message = first.message;
          }
        }
      }
    } catch {
      // non-JSON response body — keep defaults
    }

    throw new RelayerError(res.status, code, message, fieldErrors);
  }

  return res.json() as Promise<T>;
}

// ─── Status normalization (quick-260611-5mh C1) ────────────────────────────────

/**
 * Canonical lowercase call statuses used by ALL web comparisons.
 * The relayer wire format is TitleCase ('Live'/'Settled'/'Disputed'/
 * 'CallerExited') and is NOT changed — normalization happens ONCE here at the
 * response-parse boundary. Comparing against the TitleCase wire values in
 * components was the settled-call-in-LIVE-tab bug (page.tsx tab filters
 * compared `item.status === 'settled'` against 'Settled' — never matched).
 */
export type CallStatus = 'live' | 'settled' | 'disputed' | 'callerExited';

const STATUS_MAP: Record<string, CallStatus> = {
  live: 'live',
  settled: 'settled',
  disputed: 'disputed',
  callerexited: 'callerExited',
};

/** Map a relayer TitleCase status string → canonical lowercase. Unknown → 'live'. */
export function normalizeCallStatus(raw: unknown): CallStatus {
  if (typeof raw !== 'string') return 'live';
  return STATUS_MAP[raw.trim().toLowerCase()] ?? 'live';
}

// ─── Feed ──────────────────────────────────────────────────────────────────────

export interface FeedItem {
  id: string;
  caller: string;
  marketType: number;
  asset?: string;
  stake: string;
  conviction: number;
  expiry: number | string;
  createdAt: number | string;
  /** Canonical lowercase status (normalized from the TitleCase wire at the boundary). */
  status: CallStatus;
  /** Settled outcome wire value ('CallerWon' | 'CallerLost'); null/absent while live. */
  outcome?: string | null;
  displayHandle?: string;
  handle?: string; // resolved handle from profile (may be set by relayer)
  /** Server-built human line, e.g. "ETH ≥ $1,000,000" (PLAN-01 enrichment; optional). */
  marketLine?: string;
  /** Stored call statement (when the relayer carries one; optional). */
  statement?: string;
  /** Resolved Pyth ticker for assetA (PLAN-01 enrichment; optional). */
  assetSymbol?: string;
  /**
   * Raw on-chain target at 1e8 scale, as a string (PLAN-01 enrichment;
   * optional). WR-04: the relayer omits this for Event markets — event
   * milestone targets are raw/unscaled and must never be ÷1e8-rendered.
   */
  targetValue?: string;
}

export interface FeedResponse {
  items: FeedItem[];
  cursor: string | null;
}

/**
 * GET /api/feed — paginated recency-desc call feed.
 * Subgraph-primary with 800ms fallback to polled-events worker (D-24).
 * Statuses are normalized to canonical lowercase HERE (wire stays TitleCase).
 */
export async function getFeed(cursor?: string): Promise<FeedResponse> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  // WR-02: the relayer wire key is `nextCursor` (feed.ts returns
  // { items, nextCursor, _source }) — reading `res.cursor` always yielded
  // undefined and capped infinite scroll at page 1. Map wire → web shape here.
  const res = await relayerFetch<{
    items: Array<Omit<FeedItem, 'status'> & { status?: string }>;
    nextCursor: string | null;
  }>(`/api/feed${qs}`);
  return {
    cursor: res.nextCursor ?? null,
    items: (res.items ?? []).map((item) => ({
      ...item,
      status: normalizeCallStatus(item.status),
    })),
  };
}

// ─── Live state / market line (OG real-data wiring, D-05) ───────────────────────

/**
 * Subset of GET /api/calls/:id/live-state used by the OG route.
 * `marketLine` is the authoritative human-readable statement (D-05). It is
 * OMITTED by the relayer when no statement is stored — the OG route then falls
 * back to the subgraph templated mirror (D-03).
 */
export interface LiveStateLite {
  id: string;
  status: string;
  marketLine?: string;
  targetValue?: string;
}

/**
 * GET /api/calls/:id/live-state — return ONLY the authoritative marketLine (D-05).
 *
 * Returns `null` when the relayer is unreachable, the call is unknown, or no
 * statement has been stored. The caller (OG route) treats `null` as "fall back
 * to the subgraph templated Call.statement, then to a generic safe string" so
 * the card NEVER crashes (SHARE-10 / UI-SPEC error-state row).
 *
 * Server-side only (the OG route is a Node-runtime Route Handler). No secrets
 * leave the bundle — RELAYER_BASE is the same proxy used everywhere else (D-27).
 */
export async function getMarketLine(callId: string | number): Promise<string | null> {
  try {
    const data = await relayerFetch<LiveStateLite>(
      `/api/calls/${encodeURIComponent(String(callId))}/live-state`,
    );
    const line = data.marketLine;
    if (typeof line === 'string' && line.trim().length > 0) return line;
    return null;
  } catch {
    // Relayer outage / unknown call → null → subgraph templated fallback (D-03).
    return null;
  }
}

// ─── Settled-field subgraph read (OG real-data wiring, D-03) ─────────────────────

// Subgraph query URL — env-driven server-side (D-27). The production Graph gateway
// URL embeds the API key in its path (`.../api/<KEY>/subgraphs/id/<ID>`), so it can
// NEVER be committed to the shared SUBGRAPH_URL_SEPOLIA const (git is public) — it
// lives only in the server-only `SUBGRAPH_URL` env var. Runtime behavior, both halves:
// (a) server-side — the ONLY place getSettledFields/getDuelSettledFields are ever
//     invoked (the two Node-runtime og Route Handlers) — `SUBGRAPH_URL` wins when set;
// (b) client bundles also evaluate this module-level line (relayer-client.ts is
//     imported by client components for getFeed etc.); there the server-only var is
//     undefined (Next never inlines non-NEXT_PUBLIC vars) and the const falls back to
//     the keyless Sepolia Studio URL — an acceptable degrade, since no client code
//     path ever calls the subgraph readers.
const SUBGRAPH_URL = (process.env['SUBGRAPH_URL'] ?? SUBGRAPH_URL_SEPOLIA).replace(/\/$/, '');

/**
 * Real settled stats for a single call, read from the subgraph Settlement +
 * RepEvent entities. Each field is OPTIONAL — any absent field stays a safe
 * em-dash in the OG card. `statement` is the subgraph templated Call.statement
 * mirror (D-03), used as the marketLine fallback.
 */
export interface SettledFields {
  /** subgraph Call.statement templated mirror (D-03 fallback for marketLine). */
  statement: string | null;
  /** Settlement.finalPrice (oracle price at settlement), raw string. */
  finalPrice: string | null;
  /** Settlement.priceDelta (signed), raw string. */
  priceDelta: string | null;
  /** RepEvent.delta for the caller (signed integer). */
  repDelta: number | null;
  /** RepEvent.fallback flag (Stylus-fallback rep path), informational. */
  repFallback: boolean | null;
  /**
   * Real (non-virtual) fade share of the settled fade+follow pool, range [0,1].
   * Computed from subgraph Position deposits (fade / (fade+follow)). Drives the
   * CONTRARIAN HIT threshold (D-08: >= 0.5). Null on any error (SHARE-10).
   */
  fadeRealShare: number | null;
}

const SETTLED_FIELDS_QUERY = `
query SettledFields($callId: ID!, $callIdStr: String!) {
  call(id: $callId) {
    statement
  }
  settlements(first: 1, where: { call: $callId }, orderBy: settledAt, orderDirection: desc) {
    finalPrice
    priceDelta
  }
  repEvents(first: 1, where: { callId: $callId }, orderBy: timestamp, orderDirection: desc) {
    delta
    fallback
  }
  positions(first: 1000, where: { callId: $callIdStr }) {
    side
    usdcDeposited
  }
}
`;

/**
 * Query the subgraph for a call's settled stats + templated statement (D-03).
 *
 * Returns all-null fields (never throws) on any error / missing subgraph URL so
 * the OG card degrades to safe em-dashes instead of 500ing (SHARE-10).
 * Server-only function (the Node-runtime og routes are its only callers) — the
 * subgraph URL comes from the server-only `SUBGRAPH_URL` env var (key-bearing
 * gateway URL, D-27) with the keyless `SUBGRAPH_URL_SEPOLIA` const as fallback.
 */
export async function getSettledFields(callId: string | number): Promise<SettledFields> {
  const empty: SettledFields = {
    statement: null,
    finalPrice: null,
    priceDelta: null,
    repDelta: null,
    repFallback: null,
    fadeRealShare: null,
  };
  if (!SUBGRAPH_URL) return empty;

  try {
    const res = await fetch(SUBGRAPH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: SETTLED_FIELDS_QUERY,
        // call(id:) is ID!, Position.callId is String — pass both forms.
        variables: { callId: String(callId), callIdStr: String(callId) },
      }),
    });
    if (!res.ok) return empty;

    const json = (await res.json()) as {
      data?: {
        call?: { statement?: string | null } | null;
        settlements?: Array<{ finalPrice?: string | null; priceDelta?: string | null }>;
        repEvents?: Array<{ delta?: number | null; fallback?: boolean | null }>;
        positions?: Array<{ side?: string | null; usdcDeposited?: string | null }>;
      };
      errors?: unknown;
    };
    if (json.errors || !json.data) return empty;

    const d = json.data;
    const settlement = d.settlements?.[0];
    const repEvent = d.repEvents?.[0];

    // Real fade share from subgraph Position deposits (fade / (fade+follow)).
    // BigInt accumulation avoids float drift on raw 6-dp USDC amounts; malformed
    // entries are skipped so a bad value can never throw out of the success path.
    let fadeSum = 0n;
    let followSum = 0n;
    for (const p of d.positions ?? []) {
      const raw = p?.usdcDeposited;
      if (typeof raw !== 'string' || raw.trim().length === 0) continue;
      let amount: bigint;
      try {
        amount = BigInt(raw);
      } catch {
        continue; // non-parseable usdcDeposited — skip, never throw
      }
      if (p.side === 'fade') fadeSum += amount;
      else if (p.side === 'follow') followSum += amount;
    }
    const denom = fadeSum + followSum;
    const fadeRealShare = denom > 0n ? Number(fadeSum) / Number(denom) : 0;

    return {
      statement: d.call?.statement ?? null,
      finalPrice: settlement?.finalPrice ?? null,
      priceDelta: settlement?.priceDelta ?? null,
      repDelta:
        typeof repEvent?.delta === 'number' ? repEvent.delta : null,
      repFallback:
        typeof repEvent?.fallback === 'boolean' ? repEvent.fallback : null,
      fadeRealShare,
    };
  } catch {
    return empty;
  }
}

// ─── Duel settled-field subgraph read (OG real-data wiring, D-03) ────────────────

/**
 * Real settled fields for a duel OG card, read from the subgraph.
 * Each field is OPTIONAL — absent fields stay safe defaults in the card.
 */
export interface DuelSettledFields {
  /** subgraph Call.statement templated mirror (D-03) for the underlying call. */
  statement: string | null;
  /** Asset of the underlying call (e.g. "BTC"), for the meta row. */
  asset: string | null;
  /** RepEvent.delta for the caller address (signed). */
  callerRepDelta: number | null;
  /** RepEvent.delta for the challenger address (signed). */
  challengerRepDelta: number | null;
}

const DUEL_SETTLED_FIELDS_QUERY = `
query DuelSettledFields($callId: String!, $caller: Bytes!, $challenger: Bytes!) {
  call(id: $callId) {
    statement
    asset
  }
  callerRep: repEvents(first: 1, where: { callId: $callId, user: $caller }, orderBy: timestamp, orderDirection: desc) {
    delta
  }
  challengerRep: repEvents(first: 1, where: { callId: $callId, user: $challenger }, orderBy: timestamp, orderDirection: desc) {
    delta
  }
}
`;

/**
 * Query the subgraph for a duel's settled rep deltas + underlying call statement.
 *
 * Returns all-null fields (never throws) on any error / missing subgraph URL so
 * the duel OG card degrades to safe defaults instead of 500ing (SHARE-10).
 * Server-side only.
 *
 * @param callId The underlying call id (challenge.callId).
 * @param caller The caller address (lowercased for the Bytes match).
 * @param challenger The challenger address (lowercased for the Bytes match).
 */
export async function getDuelSettledFields(
  callId: string | number,
  caller: string,
  challenger: string,
): Promise<DuelSettledFields> {
  const empty: DuelSettledFields = {
    statement: null,
    asset: null,
    callerRepDelta: null,
    challengerRepDelta: null,
  };
  if (!SUBGRAPH_URL) return empty;

  try {
    const res = await fetch(SUBGRAPH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: DUEL_SETTLED_FIELDS_QUERY,
        variables: {
          callId: String(callId),
          caller: caller.toLowerCase(),
          challenger: challenger.toLowerCase(),
        },
      }),
    });
    if (!res.ok) return empty;

    const json = (await res.json()) as {
      data?: {
        call?: { statement?: string | null; asset?: string | null } | null;
        callerRep?: Array<{ delta?: number | null }>;
        challengerRep?: Array<{ delta?: number | null }>;
      };
      errors?: unknown;
    };
    if (json.errors || !json.data) return empty;

    const d = json.data;
    return {
      statement: d.call?.statement ?? null,
      asset: d.call?.asset ?? null,
      callerRepDelta:
        typeof d.callerRep?.[0]?.delta === 'number' ? d.callerRep[0]!.delta : null,
      challengerRepDelta:
        typeof d.challengerRep?.[0]?.delta === 'number' ? d.challengerRep[0]!.delta : null,
    };
  } catch {
    return empty;
  }
}

// ─── Profile ───────────────────────────────────────────────────────────────────

/**
 * One entry in the profile's call-history array (PLAN-01 A3 enrichment).
 * `status`/`outcome` carry the relayer wire strings ('Live'/'Settled'… and
 * 'CallerWon'/'CallerLost'); consumers normalize for display.
 */
export interface ProfileCallEntry {
  id: string;
  status: string;
  outcome?: string | null;
  stake: string;
  createdAt: string | number;
  statement?: string | null;
  marketLine?: string;
  assetSymbol?: string;
}

export interface ProfileResponse {
  address: string;
  handle: string;
  source: 'display_handle' | 'ens' | 'twitter' | 'farcaster' | 'truncated';
  displayHandle: string;
  globalRep: number;
  totalCalls: number;
  settledCalls: number;
  wins: number;
  losses: number;
  streak: number;
  ensName: string | null;
  twitterHandle: string | null;
  farcasterHandle: string | null;
  verifiedX: boolean;
  verifiedFc: boolean;
  /** Call history (PLAN-01 A3 — additive; absent on older relayer deploys). */
  calls?: ProfileCallEntry[];
}

/**
 * GET /api/profile/:address — server-side ENS resolution + profile data.
 * ENS cached at 24h Redis TTL (D-13).
 */
export async function getProfile(address: `0x${string}`): Promise<ProfileResponse> {
  // Bounded SSR fetch: the relayer can hang >60s resolving unknown addresses,
  // which would otherwise hold the profile page's RSC stream open indefinitely.
  return relayerFetch<ProfileResponse>(`/api/profile/${address}`, {
    signal: AbortSignal.timeout(8_000),
  });
}

// ─── Calls ─────────────────────────────────────────────────────────────────────

export interface PreflightInput {
  /**
   * quick-260611-bf2 BUG 1: the relayer preflight schema expects STRING enums
   * ('priceTarget'/'none'/'majors') — the old `number` typing let the client
   * send *_TO_UINT integers, which 422'd "Expected string, received number".
   * (DupCheckInput.marketType stays `number` — different route, own contract.)
   */
  marketType: MarketType;
  eventSubtype: EventSubtype;
  category: Category;
  assetA: string;
  assetB?: string;
  targetValue: string;
  expiry: number;
  stake: string;
  conviction: number;
  criteriaText?: string;
  openToChallenges: boolean;
  parentCallId?: string;
  callerAddress: `0x${string}`;
  /**
   * Number of caller's settled calls — used for Gate 6.3 conviction floor.
   * REQUIRED (IN-05): the relayer's httpBodyPreprocessSchema requires it
   * (non-optional union transform) — an omitting caller would 422.
   */
  callerSettledCalls: number;
}

export interface PreflightError {
  field: string;
  code: string;
  message: string;
}

export interface PreflightSuccessResponse {
  ok: true;
  hash: string;
  settledCalls: number;
  suggestedConviction: number;
  criteriaHash: string;
}

export interface PreflightFailResponse {
  ok: false;
  errors: PreflightError[];
}

export type PreflightResponse = PreflightSuccessResponse | PreflightFailResponse;

// Legacy type alias for backward compat
export interface PreflightResponseLegacy {
  valid: boolean;
  errors: PreflightError[];
  duplicateCallId?: string;
  criteriaHash?: `0x${string}`;
}

/**
 * POST /api/calls/preflight — run ALL gate checks before the user signs the userOp.
 * Returns 200 { ok: true, hash, settledCalls, suggestedConviction } on pass.
 * Returns 422 { ok: false, errors: [...] } on gate failure (D-28, D-31).
 * Requires Authorization: Bearer <privy-token> header.
 */
export async function postPreflight(input: PreflightInput, token?: string): Promise<PreflightSuccessResponse> {
  return relayerFetch<PreflightSuccessResponse>('/api/calls/preflight', {
    method: 'POST',
    body: JSON.stringify(input),
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

export interface DupCheckInput {
  marketType: number;
  assetA: string;
  metric?: string;
  targetValue: string;
  deadline: number;
}

export interface DupCheckResponse {
  /** True if a near-identical call already exists */
  exists: boolean;
  /** The existing call's ID (present when exists === true) */
  existingCallId?: number;
  /** The computed hash (for debugging) */
  hash?: string;
  // Legacy field aliases (kept for backward compat)
  isDuplicate?: boolean;
}

/**
 * POST /api/calls/dup-check — debounced duplicate hash pre-check (400ms, D-22).
 * Prevents the DuplicateCall(existingCallId) contract revert at the UX layer.
 * Requires Authorization: Bearer <privy-token> header.
 */
export async function postDupCheck(input: DupCheckInput, token?: string): Promise<DupCheckResponse> {
  return relayerFetch<DupCheckResponse>('/api/calls/dup-check', {
    method: 'POST',
    body: JSON.stringify(input),
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

// ─── Onboarding ────────────────────────────────────────────────────────────────

export interface OnboardingState {
  currentStep: number;
  handleSetAt: number | null;
  socialsStepCompletedAt: number | null;
  followgraphOptinAt: number | null;
  taglineCommittedAt: number | null;
}

/**
 * GET /api/onboarding/state/:userId — read current onboarding progress.
 * Used on sign-in to resume at the correct step (D-32).
 */
export async function getOnboardingState(userId: string): Promise<OnboardingState> {
  return relayerFetch<OnboardingState>(`/api/onboarding/state/${encodeURIComponent(userId)}`);
}

/**
 * POST /api/onboarding/advance/:userId — advance onboarding step.
 * Persists the step completion in Postgres (D-32).
 */
export async function postOnboardingAdvance(
  userId: string,
  step: number,
): Promise<OnboardingState> {
  return relayerFetch<OnboardingState>(`/api/onboarding/advance/${encodeURIComponent(userId)}`, {
    method: 'POST',
    body: JSON.stringify({ step }),
  });
}

// ─── Address book ──────────────────────────────────────────────────────────────

export interface AddressBookEntry {
  id: string;
  address: `0x${string}`;
  label: string | null;
  addedAt: number;
  removedAt: number | null;
}

/**
 * GET /api/addressbook — list active address book entries for the authenticated user.
 * Requires Authorization: Bearer <privy-token> header.
 */
export async function getAddressBook(token?: string): Promise<AddressBookEntry[]> {
  return relayerFetch<AddressBookEntry[]>('/api/addressbook', {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

/**
 * POST /api/addressbook — add an address to the book (starts 24h cooldown timer, AUTH-31).
 * Requires Authorization: Bearer <privy-token> header.
 */
export async function postAddressBook(
  address: `0x${string}`,
  label?: string,
  token?: string,
): Promise<AddressBookEntry> {
  return relayerFetch<AddressBookEntry>('/api/addressbook', {
    method: 'POST',
    body: JSON.stringify({ address, label }),
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

/**
 * DELETE /api/addressbook/:id — soft-remove an address book entry.
 * (Never deleted from Postgres — removedAt set, D-08)
 * Requires Authorization: Bearer <privy-token> header.
 */
export async function deleteAddressBook(id: string, token?: string): Promise<void> {
  return relayerFetch<void>(`/api/addressbook/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

// ─── Withdraw Authorize ────────────────────────────────────────────────────────

export interface WithdrawAuthorizeResponse {
  authorized: boolean;
}

export interface WithdrawCooldownError {
  error: 'cooldown_active';
  code: 'cooldown_active';
  blockedBy: 'auth_method' | 'destination';
  cooldownEndsAt: string;
  message: string;
}

/**
 * POST /api/withdraw/authorize — server-side 24h cooldown check.
 * Must be called before every withdrawal-class userOp.
 *
 * Throws RelayerError with status 403 and code 'cooldown_active' if blocked.
 * The error.message contains the cooldown expiry timestamp.
 *
 * Requires Authorization: Bearer <privy-token> header.
 */
export async function postWithdrawAuthorize(
  destination: `0x${string}`,
  userOpHash: string,
  token?: string,
): Promise<WithdrawAuthorizeResponse> {
  return relayerFetch<WithdrawAuthorizeResponse>('/api/withdraw/authorize', {
    method: 'POST',
    body: JSON.stringify({ destination, userOpHash }),
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}
