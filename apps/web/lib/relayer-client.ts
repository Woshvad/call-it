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
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
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
      };
      code = body.code ?? code;
      message = body.message ?? message;
      fieldErrors = body.fieldErrors;
    } catch {
      // non-JSON response body — keep defaults
    }

    throw new RelayerError(res.status, code, message, fieldErrors);
  }

  return res.json() as Promise<T>;
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
  status: string;
  displayHandle?: string;
  handle?: string; // resolved handle from profile (may be set by relayer)
}

export interface FeedResponse {
  items: FeedItem[];
  cursor: string | null;
}

/**
 * GET /api/feed — paginated recency-desc call feed.
 * Subgraph-primary with 800ms fallback to polled-events worker (D-24).
 */
export async function getFeed(cursor?: string): Promise<FeedResponse> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return relayerFetch<FeedResponse>(`/api/feed${qs}`);
}

// ─── Profile ───────────────────────────────────────────────────────────────────

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
}

/**
 * GET /api/profile/:address — server-side ENS resolution + profile data.
 * ENS cached at 24h Redis TTL (D-13).
 */
export async function getProfile(address: `0x${string}`): Promise<ProfileResponse> {
  return relayerFetch<ProfileResponse>(`/api/profile/${address}`);
}

// ─── Calls ─────────────────────────────────────────────────────────────────────

export interface PreflightInput {
  marketType: number;
  eventSubtype: number;
  category: number;
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
  /** Number of caller's settled calls — used for Gate 6.3 conviction floor */
  callerSettledCalls?: number;
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
