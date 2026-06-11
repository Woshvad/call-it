---
phase: quick-260611-obx
plan: 01
subsystem: web/call-page
status: complete
completed: 2026-06-11
requirements: [SHARE-15, SHARE-18]
dependency_graph:
  requires:
    - "@call-it/shared share-text pure builders (twitterIntentUrl / warpcastComposeUrl / buildShareText, Phase 7)"
    - "OG Live card variant at /og/[callId] (Phase 7) — shared /call/{id} links unfurl honestly for unsettled calls"
  provides:
    - "Live-view share intents on /call/[id] (X web intent + Farcaster compose) for live, awaiting-settlement, and callerExited-unsettled states"
  affects:
    - "apps/web/app/call/[id]/page.tsx live render path only — settled view byte-identical"
tech_stack:
  added: []
  patterns:
    - "Live share head word total over all unsettled states: 'LIVE CALL' (genuinely live) / 'ON RECORD' (expired-awaiting-settlement + callerExited fall-through) — win words unreachable (D-08 / 08-05 GAP 1)"
    - "No-dead-controls: share row gated ONLY on NEXT_PUBLIC_OG_BASE_URL; omitted entirely when unset (D-08)"
key_files:
  created:
    - apps/web/tests/live-call-share.test.ts
  modified:
    - "apps/web/app/call/[id]/page.tsx"
decisions:
  - "Live share derivation kept local to the live scope (separate ogBaseLive const) — settled derivation NOT refactored into a shared const, keeping the settled branch byte-identical (D-15)"
  - "Gate is liveCallShareUrl only — no outcomeWordResult gate (none exists live) and no handle gate (buildShareText's isRealHandle self-handles '#N'/0x/numeric fakes, WR-06)"
metrics:
  duration: "~12 min"
  tasks: 2
  files: 2
  commit: fbb7aec
---

# Quick Task quick-260611-obx: Live-Call Share Controls Summary

**One-liner:** Live/unsettled calls on /call/{id} now carry honest share controls — "SHARE THIS CALL →" (X web intent) + demoted Farcaster compose link — built from the same shared pure builders as the settled receipt row, with a head word ('LIVE CALL' / 'ON RECORD') that makes win words unreachable in the live path.

## What Changed

### Task 1 — apps/web/app/call/[id]/page.tsx (live view only)

1. **Derivation block** inserted just above the live return (between the settled branch close and the LIVE RECEIPT RENDER comment):
   - ogBaseLive — local read of NEXT_PUBLIC_OG_BASE_URL with trailing-slash strip (settled ogBaseForFrame untouched, no shared hoist).
   - liveCallShareUrl — {ogBaseLive}/call/{callIdNum} or null.
   - liveShareHead — HONESTY RULE ternary: callData?.status === 'live' && !isCallExpired → 'LIVE CALL', else 'ON RECORD' (covers awaiting-settlement AND callerExited-without-outcome fall-through). No win word appears anywhere in the derivation block, including comments.
   - liveShareText — buildShareText({ outcomeWord: liveShareHead, handle: displayHandle, statement: displayMarketLine }) with displayHandle passed raw (WR-06 / T-obx-02).
   - liveShareOnXUrl / liveShareCastUrl — via twitterIntentUrl / warpcastComposeUrl, gated only on liveCallShareUrl (T-obx-01 purity contract).

2. **Markup** — data-live-share-row column added as a sibling after the pills row inside the live header spread, rendered only when an intent URL exists: primary "btn cream" anchor "SHARE THIS CALL →" + demoted "mono receipt-frame-link" anchor "or share as a Farcaster frame ↗"; both target="_blank" rel="noopener noreferrer" (T-obx-03); full-width/stretch on mobile, flex-end on desktop — mirrors the settled data-receipt-action-row exactly.

3. **Comment rewrite** — the stale 09.2 cut comment's share-twin clause replaced; the literal phrase "no live-call share wiring exists" no longer appears in the file. AUTH-44/D-07 header-stats and eye-icon-cut sentences kept.

### Task 2 — apps/web/tests/live-call-share.test.ts (new, additive)

Vitest source-assertion spec (node env, mirrors presentation-sweep.test.ts — NOT Playwright), 5 tests:
- a. both intents built in the LIVE block (slice liveShareHead → data-live-share-row contains all three builder calls)
- b. honest heads 'LIVE CALL' + 'ON RECORD' present
- c. HONESTY RULE: derivation slice (liveShareHead → liveShareCastUrl) contains no 'CALLED IT' / 'CONTRARIAN HIT'
- d. markup contract: data-live-share-row + 'SHARE THIS CALL' + rel/target guards within 4000-char bound
- e. stale rationale 'no live-call share wiring exists' absent

No existing test edited, weakened, or deleted (D-15).

## Verification Evidence

| Check | Result |
|---|---|
| pnpm --filter @call-it/web build | exit 0 (all routes compiled, /call/[id] dynamic) |
| pnpm --filter @call-it/web exec vitest run | 27 files / 245 tests passed, 0 failed (live-call-share.test.ts: 5/5) |
| git diff --cached --name-only pre-commit | exactly the 2 intended files |
| git show --stat HEAD | 2 files changed, 173 insertions(+), 3 deletions(-) |

## Commit

- fbb7aec — fix(quick-260611-obx): live-call share controls on call page (X intent + Farcaster cast) — was settled-only (not pushed — orchestrator pushes)

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None — the share row is fully wired to the shared builders; the only conditional absence (OG base URL unset) is the intentional D-08 no-dead-controls omission, not a stub.

## Self-Check: PASSED

- apps/web/app/call/[id]/page.tsx modified — FOUND
- apps/web/tests/live-call-share.test.ts created — FOUND
- Commit fbb7aec — FOUND in git log
