---
phase: 08-farcaster-mini-apps
fixed_at: 2026-06-09T07:05:00Z
review_path: .planning/phases/08-farcaster-mini-apps/08-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 8: Code Review Fix Report

**Fixed at:** 2026-06-09T07:05:00Z
**Source review:** .planning/phases/08-farcaster-mini-apps/08-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope (Critical + Warning): 7 (CR-01, WR-01..WR-06)
- Fixed: 7
- Skipped: 0
- Info findings (IN-01..IN-05): out of scope — not addressed

**Verification (run in an isolated worktree on branch `gsd-reviewfix/08-8152`):**
- `pnpm --filter @call-it/web test` → 11 files, 89 tests passed
- `pnpm --filter @call-it/shared test` → 6 files, 124 tests passed
- `pnpm --filter @call-it/web build` → success (TypeScript compiled; all routes built)

## Fixed Issues

### CR-01: `?action=` query override lets an untrusted caller pick any rendered button

**Files modified:** `apps/web/app/api/frame/tx/[callId]/route.ts`, `apps/web/tests/frame-tx.test.ts`
**Commit:** eacc63f
**Status:** fixed: requires human verification (logic/security hardening — confirm the threat-model intent holds)
**Applied fix:** Implemented the reviewer's recommended hardening exactly:
- `readStatus` now returns `{ status, ok }`. `ok=false` on a genuine relayer-read
  failure (relayer configured but non-OK / parse error / network throw). A *missing*
  relayer (local/test) is treated as `ok=true` (deliberate Live default — SC2 wires
  must still build on testnet), distinct from a transient outage.
- The `?action=` override is honored ONLY when `NEXT_PUBLIC_DEV_ROUTES === '1'`
  (its only stated purpose is debugging), AND `statusReadOk`, AND the requested
  action is in the *current* status-derived button set. A settled call therefore can
  never yield a Live Follow/Fade/Challenge wire via a forged query param, and the
  override is dead during a relayer outage.
- Regression tests assert: forged `?action=Fade` on a settled call → deep-link (not a
  Fade tx); forged `?action=Fade` during an outage → ignored (falls back to
  buttonIndex); override OFF in production (dev flag unset); override honored only
  within the live set when dev flag + statusReadOk.

### WR-01: Manifest emits URLs with an empty origin when `NEXT_PUBLIC_OG_BASE_URL` is unset

**Files modified:** `apps/web/app/.well-known/farcaster.json/route.ts`, `apps/web/tests/farcaster-manifest.test.ts`
**Commit:** f5b0d14
**Applied fix:** The manifest route now fails loud with HTTP 503
(`manifest unavailable: NEXT_PUBLIC_OG_BASE_URL unset`, `Cache-Control: no-store`)
when the origin env var is missing/empty, instead of serving relative
`homeUrl`/`iconUrl`/`splashImageUrl` at HTTP 200. Test sets the origin for the happy
path (and asserts absolute URLs) plus a new case asserting 503 when unset.

### WR-02: Embed builder produces relative/garbage URLs when `baseUrl` is empty

**Files modified:** `apps/web/lib/farcaster-embed.ts`, `apps/web/app/call/[id]/layout.tsx`, `apps/web/tests/farcaster-embed.test.ts`
**Commit:** 0236f3d
**Applied fix:** `buildFarcasterEmbeds` stays pure (no env reads) but now validates its
contract — it throws if `baseUrl` is empty or not an absolute `http(s)` origin. The
single call site (`layout.tsx`) reads `NEXT_PUBLIC_OG_BASE_URL` and only invokes the
builder when the origin is a valid absolute URL; otherwise it omits the
`fc:miniapp`/`fc:frame` meta entirely (the page still renders with og:image) rather
than emitting un-launchable relative embed URLs at HTTP 200. Tests cover the throw on
empty/relative baseUrl and the layout omit-when-unset path.

### WR-03: Middleware `/api` carve-out makes every current and future API route public

**Files modified:** `apps/web/middleware.ts`, `apps/web/tests/middleware-public.test.ts`
**Commit:** 1c0ee48
**Applied fix:** Replaced the blanket `'/api'` public prefix with explicit
`'/api/frame'` and `'/api/og'` prefixes. Any future `/api/*` route (e.g. `/api/me`,
`/api/admin`) is now gated by the middleware by default. The middleware-public test
mirrors the explicit prefixes, asserts `/api/me` and `/api/admin` stay gated, and
asserts the source no longer carries a standalone blanket `'/api'` entry.

### WR-04: Onboarding fallback never redirects a user stuck on the final step (5)

**Files modified:** `apps/web/middleware.ts`
**Commit:** 1c0ee48 (committed together with WR-03 — same file)
**Status:** fixed: requires human verification (boundary/logic change)
**Applied fix:** The T-01-36 cache fallback now redirects when `1 <= step <= 5`
(previously `step < 5`). The cache cookie is only ever written inside the
`taglineCommittedAt === null` (incomplete) branch, so any cached step — including
step 5 (`tagline`, the final incomplete step) — means onboarding is still incomplete
and the user must be redirected rather than falling through to fail-open.

### WR-05: `readStatus` swallows the distinction between "settled" and "unknown"

**Files modified:** `apps/web/app/api/frame/tx/[callId]/route.ts`, `apps/web/tests/frame-tx.test.ts`
**Commit:** eacc63f (committed together with CR-01 — same function rewrite)
**Applied fix:** `readStatus` now surfaces `ok` (see CR-01). A genuine read failure
returns `ok=false`, which the handler uses to block the `?action=` override during an
outage — closing the substrate CR-01 exploits.

**Deliberate scoping note:** The reviewer offered two WR-05 options — (a) prefer the
deep-link on read failure, or (b) surface `ok` and only honor the override when the
read succeeded. Option (a) — forcing a deep-link whenever the status read fails —
would break SC2's "tx wire builds on testnet" guarantee (the GREEN `frame-tx` tests
build wires with no relayer configured), so it was not applied. Option (b) was applied
and is sufficient to close the actual tampering surface (the forgeable override).
The residual "transiently-failed read on a truly-settled call emits a Live wire that
reverts client-side" remains a documented, no-fund-loss display default per the
review; the wire still targets the real contract, which enforces real state.

### WR-06: `buttonIndexFromBody` accepts an out-of-range index and silently clamps to button 0

**Files modified:** `apps/web/app/api/frame/tx/[callId]/route.ts`, `apps/web/tests/frame-tx.test.ts`
**Commit:** eacc63f (committed together with CR-01 — same function rewrite)
**Applied fix:** `buttonIndexFromBody` returns `null` when no index is supplied (the
legitimate probe path → defaults to Follow). `selectButton` range-checks a supplied
index against the current button set and returns an `out-of-range` marker; the handler
rejects it with HTTP 400 (`invalid buttonIndex`) instead of clamping to button 0
(Follow). Regression test asserts `buttonIndex: 99` → 400.

## Skipped Issues

None — all 7 in-scope findings were fixed.

The 5 Info findings (IN-01 `value: '0'` vs `'0x0'`; IN-02 manifest GET signature;
IN-03 `Math.random()` list key; IN-04 fixtures in `lib/`; IN-05 duplicated oracle
render logic) were intentionally out of scope (`fix_scope: critical_warning`) and were
not addressed. Note: the IN-02 test-side mismatch was incidentally tidied — the
manifest test now calls `route.GET()` with no args — but the handler signature itself
was left unchanged.

---

_Fixed: 2026-06-09T07:05:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
