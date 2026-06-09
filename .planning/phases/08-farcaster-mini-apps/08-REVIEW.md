---
phase: 08-farcaster-mini-apps
reviewed: 2026-06-09T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - apps/relayer/src/workers/__tests__/auto-post-worker.test.ts
  - apps/web/app/.well-known/farcaster.json/route.ts
  - apps/web/app/api/frame/tx/[callId]/route.ts
  - apps/web/app/call/[id]/layout.tsx
  - apps/web/app/call/[id]/page.tsx
  - apps/web/lib/abis/ChallengeEscrow.ts
  - apps/web/lib/abis/index.ts
  - apps/web/lib/farcaster-embed.ts
  - apps/web/lib/farcaster-fixtures.ts
  - apps/web/middleware.ts
  - apps/web/tests/farcaster-embed.test.ts
  - apps/web/tests/farcaster-manifest.test.ts
  - apps/web/tests/frame-tx.test.ts
  - apps/web/tests/middleware-public.test.ts
  - apps/web/tests/share-text.test.ts
  - packages/shared/src/share/share-text.ts
findings:
  critical: 1
  warning: 6
  info: 5
  total: 12
status: issues_found
---

# Phase 8: Code Review Report

**Reviewed:** 2026-06-09T00:00:00Z
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

Reviewed the Farcaster Mini App slice: the unsigned manifest route, the Frame `tx`
wire endpoint, the embed/meta builders, the public-route middleware carve-out, the
shared share-text builders, and the supporting fixtures/ABIs/tests.

The security posture of the Frame endpoint is genuinely strong: `to` is always a
pinned `@call-it/shared` Sepolia address (never echoed from a param), `data` is built
by `encodeFunctionData` against a const ABI with fixed `functionName`, amounts are
hardcoded (never read from the untrusted body), there is no server-side signer, and
callId is validated with `BigInt` before any calldata build. The encoder ABIs
(`followFadeMarketAbi.follow/fade`, `challengeEscrowAbi.proposeChallenge`) match the
decode signatures asserted in `frame-tx.test.ts` and the on-chain shapes, and the
pinned addresses resolve to the real Phase-6 Sepolia cluster.

The most serious issue is an **origin-bypass in the Frame `?action=` override**: the
deep-link `base` and the wire are origin-locked, but the button selector trusts a
query param that lets a caller pick *any* displayed button regardless of which button
the cast actually rendered — combined with the fail-safe `status='Live'` default, this
lets a crafted POST coerce a Live-Follow/Fade/Challenge tx wire for a call that is
actually settled. It does not move funds (the user's wallet still signs and the
contract enforces real state), but it produces a wire that will revert client-side and
is a tampering vector worth closing. Several correctness/robustness warnings follow
around the manifest/embed `baseUrl` empty-origin case, the middleware over-broad `/api`
carve-out, and the `step < 5` fallback boundary.

## Critical Issues

### CR-01: `?action=` query override lets an untrusted caller pick any rendered button, bypassing the status-derived intent

**File:** `apps/web/app/api/frame/tx/[callId]/route.ts:159-172, 232-296`
**Issue:**
`selectButton` resolves the tapped button from a `?action=` query param *before*
falling back to the POST `buttonIndex`:

```ts
const action = url.searchParams.get('action');
if (action) {
  const match = buttons.find((b) => b.toLowerCase() === action.toLowerCase());
  if (match) return match;
}
```

The `action` string is fully attacker-controlled (it is in the request URL, not a
signed Frame payload). Combined with `readStatus`'s documented fail-safe — *any*
relayer error returns `'Live'` (lines 118, 125, 130-134) — a caller can POST
`/api/frame/tx/<settledId>?action=Fade` (or `?action=Follow`) and, if the relayer
read fails or is simply slow/unreachable, receive a **Live Fade/Follow
`eth_sendTransaction` wire targeting FollowFadeMarket** for a call that is actually
settled. The route never re-checks that the *constructible* action is legal for the
true on-chain state; it relies entirely on `readStatus`, which is explicitly
most-permissive on failure.

The threat-model header claims the body is read "ONLY to learn which of the displayed
buttons the user tapped" (line 138-141), but the `?action=` override breaks that
invariant: it is not gated to the button the user actually saw, and it is trivially
forgeable independent of the cast that rendered the buttons.

Impact is bounded (no server signer; the user's wallet signs; the contract reverts an
illegal follow/fade on a settled market — `T-08-03-05`), so this is not fund-loss.
But it is a real tampering surface (`T-08-03-01`/`T-08-03-02` intent) that emits a
misleading "one-tap" wire the wire-correctness SC2 is supposed to guarantee, and it
makes the fail-safe `'Live'` default exploitable on demand rather than only during a
genuine outage.

**Fix:** Drop the unauthenticated `?action=` override in production, or constrain it so
the selected button must belong to the *status-derived* set AND the status must have
been read successfully (no override when `readStatus` fell back). Minimal hardening:

```ts
function selectButton(buttons, req, body, statusReadOk: boolean): FarcasterButton {
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  // Only honor the debug override when the status read succeeded AND the action is in
  // the *current* status's button set (so a settled call can never yield a Fade wire).
  if (statusReadOk && action) {
    const match = buttons.find((b) => b.toLowerCase() === action.toLowerCase());
    if (match) return match;
  }
  const idx = buttonIndexFromBody(body);
  return buttons[idx - 1] ?? buttons[0]!;
}
```

Have `readStatus` return `{ status, ok }` so the handler can pass `statusReadOk`, and
gate the override behind a dev flag (e.g. `NEXT_PUBLIC_DEV_ROUTES === '1'`) since its
only stated purpose is debugging.

## Warnings

### WR-01: Manifest emits URLs with an empty origin when `NEXT_PUBLIC_OG_BASE_URL` is unset

**File:** `apps/web/app/.well-known/farcaster.json/route.ts:37, 44-46`
**Issue:** `const base = process.env['NEXT_PUBLIC_OG_BASE_URL'] ?? ''`. When the env var
is missing/empty, `homeUrl` becomes `''` and `iconUrl`/`splashImageUrl` become
`/icon.png`, `/splash.png` — **relative paths in a manifest that must carry absolute
URLs**. The Farcaster crawler fetches this manifest out-of-band and cannot resolve a
relative `homeUrl`/`iconUrl` against any base, so the Mini App silently fails to render
or launch. The route returns HTTP 200, so monitoring/tests (the manifest test only
asserts `typeof iconUrl === 'string'`) will not catch it. This is a deploy-time
foot-gun given the env var is the single origin source for the whole Phase-8 surface.
**Fix:** Fail loud (or fall back to a known absolute default) when `base` is empty:
```ts
const base = process.env['NEXT_PUBLIC_OG_BASE_URL'];
if (!base) {
  return new Response('manifest unavailable: NEXT_PUBLIC_OG_BASE_URL unset', { status: 503 });
}
```
Apply the same guard in `layout.tsx:78` and pass-through in `farcaster-embed.ts`.

### WR-02: Embed builder produces relative/garbage URLs when `baseUrl` is empty — no validation

**File:** `apps/web/lib/farcaster-embed.ts:75-79`; `apps/web/app/call/[id]/layout.tsx:78-83`
**Issue:** `buildFarcasterEmbeds` is documented as "pure, no env reads" and trusts the
caller to pass an absolute origin, but performs no validation. `layout.tsx` passes
`process.env['NEXT_PUBLIC_OG_BASE_URL'] ?? ''`; when unset, the embed `imageUrl`
becomes `/og/7?v=0` and `action.url` becomes `/call/7` — relative URLs the Farcaster
client cannot launch, and the embed-image constraint ("Absolute URL, ≤1024 chars",
line 73-74) is violated. Like WR-01 this fails silently at HTTP 200. **Fix:** Validate
in the builder (throw or require a non-empty absolute `baseUrl`), or guard at the
single call site in `layout.tsx`.

### WR-03: Middleware `/api` carve-out makes every current and future API route fully public

**File:** `apps/web/middleware.ts:50-75`
**Issue:** `PUBLIC_PREFIXES` includes a blanket `'/api'`, so `isPublicRoute` returns
true for *any* path under `/api/*` and the middleware never enforces auth/onboarding on
it. Today only `/api/frame` and `/api/og` exist (both intentionally public), so there
is no live leak — but this is a standing auth-bypass trap: the moment anyone adds an
authenticated API route under `/api/*` (e.g. `/api/me`, `/api/admin`), it ships
publicly with zero middleware gate and no failing test. The comment even relies on this
("/api/frame/* is already covered by the '/api' prefix"). **Fix:** Replace the blanket
`'/api'` with explicit public API prefixes (`'/api/frame'`, `'/api/og'`) so new API
routes are gated by default:
```ts
'/api/frame',
'/api/og',
```

### WR-04: Onboarding fallback never redirects a user stuck on the final step (5)

**File:** `apps/web/middleware.ts:171-180`
**Issue:** The T-01-36 cache fallback only redirects when `step < 5`:
```ts
if (!Number.isNaN(step) && step < 5) { ... redirect ... }
```
Step 5 is `tagline` — the last incomplete step (onboarding is "complete" only when
`taglineCommittedAt` is non-null, which is a *separate* signal from `currentStep`). If
the relayer is down and the cached `currentStep` is `5`, the user is NOT redirected and
falls through to fail-open (line 183), gaining access to gated pages while still
mid-onboarding. The `< 5` bound silently treats "on the last step" as "done." **Fix:**
Use `step <= 5` (or `<= 5` with an explicit done-cookie), since the cache cookie is only
ever written for incomplete onboarding (lines 143-147 set it inside the
`taglineCommittedAt === null` branch).

### WR-05: `readStatus` swallows the distinction between "settled" and "unknown," weakening the wire guarantee

**File:** `apps/web/app/api/frame/tx/[callId]/route.ts:112-135, 221-226`
**Issue:** Every failure path (no relayer URL, non-OK response, parse error, network
throw) collapses to `'Live'`. That is reasonable as a *display* default, but the
handler then uses it to decide whether to emit a one-tap **on-chain tx** vs a
deep-link. A genuinely-settled call whose status read transiently fails will emit a
Live Follow/Fade tx wire (the markets are settled → the tx reverts), degrading the
"tx wire is correct on testnet" guarantee (SC2) to "correct only when the relayer is
up." This is the substrate CR-01 exploits, but it is a robustness defect on its own.
**Fix:** On status-read failure, prefer the *deep-link* (safe, never reverts) rather
than the most-permissive on-chain button set, or surface `ok=false` and only emit
calldata when the status was read successfully.

### WR-06: `buttonIndexFromBody` accepts an out-of-range index and silently clamps to button 0

**File:** `apps/web/app/api/frame/tx/[callId]/route.ts:143-157, 171`
**Issue:** `buttonIndexFromBody` returns any `buttonIndex >= 1` with no upper bound;
`selectButton` then does `buttons[idx - 1] ?? buttons[0]!`. A body with
`buttonIndex: 99` silently resolves to `buttons[0]` (Follow) instead of being rejected.
Coupled with the fail-safe `'Live'` default, an out-of-range index always yields a
Live-Follow wire. This is a minor tampering/robustness gap (no fund risk) but it means
the endpoint cannot distinguish a malformed request from a legitimate Follow tap.
**Fix:** Validate `idx` against `buttons.length` and return 400 on an out-of-range
index rather than clamping.

## Info

### IN-01: `value: '0'` is a decimal string, not the conventional hex wire value

**File:** `apps/web/app/api/frame/tx/[callId]/route.ts:255, 274, 293`
**Issue:** The `eth_sendTransaction` wire sets `value: '0'`. This matches the Phase-8
research doc (`08-RESEARCH.md:290`), but most EVM JSON-RPC / Frame clients expect the
`value` field as a hex quantity (`'0x0'`). `'0'` parses to 0 in lenient clients but is
non-canonical and may be rejected by stricter wallets at the Phase-10 mainnet cutover.
**Fix:** Emit `value: '0x0'` (and keep it consistent with whatever Warpcast's chainList
expects when 42161 is enabled).

### IN-02: Manifest/layout `Request`-less GET signature is inconsistent with the test's call

**File:** `apps/web/app/.well-known/farcaster.json/route.ts:35`; `apps/web/tests/farcaster-manifest.test.ts:27`
**Issue:** The route handler is `GET(): Promise<Response>` (no args) but the test calls
`route.GET(new Request(...))`. It works (extra arg ignored) and is harmless, but the
mismatch is confusing and would break if the handler later reads the request. **Fix:**
Either accept `(_req: Request)` in the handler signature or drop the arg in the test for
intent clarity.

### IN-03: `randomly-generated id` fallback in activity feed mapping can collide / break keys

**File:** `apps/web/app/call/[id]/page.tsx:356`
**Issue:** `id: String(entry['id'] ?? Math.random())` uses `Math.random()` as a React
list-key fallback. Two entries missing `id` in the same response can collide
(low-probability) and the key changes every render, defeating reconciliation. Not a
security issue. **Fix:** Use the array index or a stable composite key
(`handle:timestamp:action`) instead of `Math.random()`.

### IN-04: `farcaster-fixtures.ts` ships hardcoded seeded callId strings as production constants

**File:** `apps/web/lib/farcaster-fixtures.ts:70-79`
**Issue:** `SEEDED_CALL_IDS` ('7', '1', '12', '14') are testnet seed ids exported from a
non-test module. They are documented as placeholders and only consumed by tests today,
but living in `lib/` they are importable by app code. Low risk; flagged so they are not
accidentally wired into a production code path. **Fix:** Move to a `__fixtures__`/test
-only module, or annotate with a lint guard against app-code imports.

### IN-05: Duplicated raw-oracle-data rendering logic in the receipt page

**File:** `apps/web/app/call/[id]/page.tsx:756-776, 885-894`
**Issue:** `renderRawOracleData()` and the inline JSX branch (lines 885-894) implement
the same path-aware oracle-data formatting twice with slightly different field handling
(`±${d.pythConf}` vs `confidence: ±${d.pythConf ?? '—'}`). Duplication invites drift.
Not in Phase-8 scope but surfaced while reading the file. **Fix:** Call
`renderRawOracleData(oracleType, provenance.rawOracleData)` from the JSX and delete the
inline duplicate.

---

_Reviewed: 2026-06-09T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
