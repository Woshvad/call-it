---
phase: 08-farcaster-mini-apps
plan: 04
subsystem: ui
tags: [farcaster, mini-apps, frame, share, auto-post, warpcast, compose-intent, distribution]

# Dependency graph
requires:
  - phase: 08-farcaster-mini-apps
    provides: fc:miniapp/fc:frame embed meta on the receipt page (the embed rides the receipt URL) — Plan 08-02
  - phase: 08-farcaster-mini-apps
    provides: Frame tx wire endpoint (the actionable half of SHARE-19) — Plan 08-03
  - phase: 07-og-finalization
    provides: auto-post-on-settle worker + warpcastComposeUrl construction; pure @call-it/shared share builders
provides:
  - apps/web/app/call/[id]/page.tsx — SHARE AS FRAME → outline control in the settled receipt action row (reuses warpcastComposeUrl + buildShareText)
  - apps/relayer/src/workers/__tests__/auto-post-worker.test.ts — assertion that the auto-post warpcastUrl carries the embed-bearing receipt URL (SC3/D-04)
  - packages/shared/src/share/share-text.ts — warpcastComposeUrl compose host verified + migrated to the canonical farcaster.xyz (Open Q3)
affects: [phase-10-mainnet-cutover]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Distribution-loop reuse: the Farcaster Mini App embed is a property of the receipt URL's HTML (Plan 08-02 meta) — it rides the receipt URL inside warpcastComposeUrl's embeds[]= param, so BOTH the auto-post worker and the manual control carry it with NO payload/embeds-array change"
    - "SHARE AS FRAME control: a derived shareAsFrameUrl const (null when origin/handle missing) gates a single <a target=_blank rel=noopener noreferrer> wrapping an outline button — omitted (no dead button) per UI-SPEC Error state"
    - "Open Q3 resolution: verify the live compose host at execute time via an HTTP redirect probe; warpcast.com/~/compose now 301-redirects to farcaster.xyz/~/compose, so the pure builder points directly at the canonical host (one-line change, signature + purity preserved)"

key-files:
  created: []
  modified:
    - packages/shared/src/share/share-text.ts
    - apps/web/tests/share-text.test.ts
    - apps/relayer/src/workers/__tests__/auto-post-worker.test.ts
    - apps/web/app/call/[id]/page.tsx

key-decisions:
  - "Open Q3 — compose host MIGRATED (not 'verified current'). Live probe on 2026-06-08: GET https://warpcast.com/~/compose?text=hi returns 301 → https://farcaster.xyz/~/compose (which serves 200; farcaster.xyz serves 200 directly with the embeds[] param). Per the plan's Open-Q3 instruction this is the one-line host change: warpcastComposeUrl now emits https://farcaster.xyz/~/compose, preserving the ?text=…&embeds[]=… shape + the function signature + the purity contract (no env/network/secret). buildShareText/twitterIntentUrl untouched."
  - "Worker is verify-only (no structural change). auto-post-worker.ts already builds receiptUrl = `${base}/call/${callId}` and warpcastComposeUrl(receiptUrl, text); the embed rides receiptUrl once the receipt HTML carries the Plan-02 meta. Added ONE test (f) asserting the produced warpcastUrl contains the URL-encoded receipt URL — NO embeds-array payload added (RESEARCH Pattern 4 / D-04)."
  - "SHARE AS FRAME omitted when no real handle. The receipt page falls back handle to `#<id>` when callData.handle is absent; that placeholder is not a shareable handle, so the control gates on Boolean(callData?.handle) AND NEXT_PUBLIC_OG_BASE_URL (UI-SPEC Error state — no dead button)."
  - "Reused the existing sibling-outline button pattern verbatim (the VIEW ALL CALLS BY {handle} treatment): 2px #E8F542 border, transparent fill, #E8F542 text, gap:12px/padding:16px/13px·700 mono uppercase letter-spacing:0.08em. Zero new design tokens (this phase adds none)."
  - "statement passed to buildShareText is the settled-branch marketLine (callData.marketLine, the D-03 subgraph Call.statement / templated fallback) — the same public market line already on the receipt; no new disclosure (T-08-04-04 accept)."

patterns-established:
  - "Embed-rides-the-URL: a single shared warpcastComposeUrl(receiptUrl, …) carries the Mini App embed for both the automated cast and the manual control — the embed is never a separate worker/route payload"
  - "Execute-time live-host verification for external intent URLs: probe the redirect chain (curl -w redirect_url) and, if migrated, make a single reviewed host-string edit in the pure builder + its test"

requirements-completed: [SHARE-19]
requirements-partial: []

# Metrics
duration: ~15min
completed: 2026-06-09
status: complete
---

# Phase 8 Plan 04: Close the Distribution Loop (Auto-post + SHARE AS FRAME) Summary

**Vertical slice C closes the Farcaster distribution loop: (1) the Phase-7 auto-post-on-settle worker now provably lands a cast whose Mini App embed renders automatically — the embed rides the receipt URL already passed to `warpcastComposeUrl` (worker test extended; no payload change), and (2) the settled receipt page gains a `SHARE AS FRAME →` outline control so a caller can post the actionable, embed-bearing receipt on demand. Open Q3 is resolved against the live spec: the Warpcast compose host migrated to `farcaster.xyz` (legacy `warpcast.com/~/compose` 301-redirects), so the pure builder was updated with a single host-string change.**

> **STATUS: COMPLETE (Task-2 human-verify APPROVED 2026-06-09).** Both tasks are committed. Task 2's `SHARE AS FRAME →` control passed every automated acceptance check (web 80/80, relayer 209 passed/1 skipped, both builds exit 0, control reuses the existing sibling-outline design tokens + `rel="noopener noreferrer"`). The user reviewed that automated evidence and responded **"approved"**. The live in-Warpcast visual preview (tapping the embed inside a real client) is **deferred to the existing Phase-10/soak gate** — Arbitrum Sepolia is not in Warpcast's `chainList`, so an in-client transact preview cannot be demonstrated on testnet (this is the same D-01 Phase-10 gate the plan's threat model/verification already names). Plan 08-04 is finalized; **phase 08 is all 4 plans complete.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2 of 2 complete (Task 1 auto + Task 2 implemented and human-verify approved)
- **Files modified:** 4 (0 created, 4 modified)

## Accomplishments

### Task 1 — auto-post embed-rides assertion + Open Q3 compose-host resolution (COMPLETE, `ad81ea3`)

- **Open Q3 RESOLVED — host migrated.** Live redirect probe on 2026-06-08: `GET https://warpcast.com/~/compose?text=hi` → **301** → `https://farcaster.xyz/~/compose` (200); `https://farcaster.xyz/~/compose?...&embeds[]=...` serves **200 directly**. Per the plan's Open-Q3 branch this is the one-line host change: `warpcastComposeUrl` in `packages/shared/src/share/share-text.ts` now emits `https://farcaster.xyz/~/compose`, preserving the `?text=…&embeds[]=…` query shape, the function signature, and the purity contract (no env/network/secret import). `buildShareText` / `twitterIntentUrl` untouched. Doc-comment updated to record the verified-live migration.
- **Worker verify-only + test extended.** Confirmed `auto-post-worker.ts` already builds `receiptUrl = ${base}/call/${callId}` and `warpcastComposeUrl(receiptUrl, text)` with NO structural change needed — the embed rides `receiptUrl`. Added one test `(f)` to `auto-post-worker.test.ts` asserting the produced `warpcastUrl` contains the URL-encoded receipt URL (`encodeURIComponent('https://callit.test/call/7')`) plus the `embeds[]=` marker. NO embeds-array payload added (RESEARCH Pattern 4 / D-04). All pre-existing assertions intact; the pre-existing host assertion updated to `farcaster.xyz/~/compose`.
- **Rebuilt `@call-it/shared` dist** so the web re-export + relayer import pick up the new host (Phase-7 gotcha: shared dist is gitignored and must be rebuilt before web/relayer consume it).

### Task 2 — SHARE AS FRAME outline control (COMPLETE — committed `83aeae9`, human-verify APPROVED 2026-06-09)

- Added a `SHARE AS FRAME →` control to the settled receipt action row in `apps/web/app/call/[id]/page.tsx`, to the right of `SHARE THE RECEIPT →`. It is an `<a href={shareAsFrameUrl} target="_blank" rel="noopener noreferrer">` wrapping an outline button.
- **Outline treatment matches the sibling** `VIEW ALL CALLS BY {handle}` button: `border:2px solid #E8F542`, transparent fill, `#E8F542` text, and the existing action-row spacing/typography (`gap:12px`, `padding:16px`, `13px`/`700` mono uppercase, `letter-spacing:0.08em`). Zero new design tokens.
- On click it opens `warpcastComposeUrl(`${ogBase}/call/${callIdNum}`, buildShareText({ outcomeWord, handle, statement: marketLine }))` in a new tab — the embed-bearing receipt URL rides the `embeds[]=` param.
- **Omitted entirely (no dead button)** when `NEXT_PUBLIC_OG_BASE_URL` is unset OR no real `callData.handle` exists (the `#<id>` fallback is not shareable) — UI-SPEC Error state, implemented as a `shareAsFrameUrl: string | null` const gating the JSX.
- Reuses the shared pure builders (imported from `@call-it/shared`) — no re-implementation of cast URL / share text.

## Task Commits

1. **Task 1: auto-post embed-rides assertion + migrate compose host to farcaster.xyz** — `ad81ea3` (feat)
2. **Task 2: SHARE AS FRAME outline control (implementation)** — `83aeae9` (feat) — *human-verify APPROVED 2026-06-09*

**Plan metadata:** (docs commit — see final commit; supersedes the interim paused-state docs commit `1ec0ee8`)

## Files Created/Modified

- `packages/shared/src/share/share-text.ts` — `warpcastComposeUrl` host `warpcast.com` → `farcaster.xyz` (Open Q3, one-line); signature + purity preserved
- `apps/web/tests/share-text.test.ts` — updated the `warpcastComposeUrl` expectation to the canonical `farcaster.xyz` host
- `apps/relayer/src/workers/__tests__/auto-post-worker.test.ts` — added test `(f)`: warpcastUrl carries the encoded receipt URL `${base}/call/${callId}` + `embeds[]=`; updated the host assertion
- `apps/web/app/call/[id]/page.tsx` — added the `SHARE AS FRAME →` outline control + the `shareAsFrameUrl` derived const (null-gated omission)

## Decisions Made

1. **Open Q3 = MIGRATED, not "verified current".** The live host moved (warpcast.com 301→farcaster.xyz). Took the plan's documented one-line-change branch: pointed the pure builder directly at the canonical `farcaster.xyz` host (avoids the redirect hop), preserving query shape + signature + purity, and updated the single test expectation.
2. **Worker untouched (verify-only).** The embed rides the receipt URL by construction; the only change is a new test asserting the URL is carried — no embeds-array payload, no structural change (D-04 / RESEARCH Pattern 4).
3. **SHARE AS FRAME gated on a real handle.** The receipt page uses `#<id>` as a handle fallback; that is not a shareable handle, so the control requires `callData.handle` AND `NEXT_PUBLIC_OG_BASE_URL` and otherwise renders nothing (UI-SPEC Error state — no dead/disabled button).
4. **`statement` = the settled-branch `marketLine`.** Same public market line already shown on the receipt — no new disclosure (T-08-04-04 accept).

## Deviations from Plan

### Auto-fixed / reconciled

**1. [Open Q3 — settled-as-instructed] Compose host migrated warpcast.com → farcaster.xyz**
- **Found during:** Task 1 (Open-Q3 live-host verification)
- **Issue:** The plan's Open Q3 required verifying the live compose host; the legacy `warpcast.com/~/compose` now 301-redirects to `farcaster.xyz/~/compose`.
- **Fix:** One-line host change in `warpcastComposeUrl` (host only; `?text=…&embeds[]=…` shape, signature, and purity preserved) + updated `share-text.test.ts` expectation. This is the plan's explicitly-anticipated "if migrated" branch, not an unplanned deviation.
- **Files modified:** `packages/shared/src/share/share-text.ts`, `apps/web/tests/share-text.test.ts`
- **Verification:** redirect probe (curl `-w redirect_url`); web suite 6/6 share-text green; relayer suite green.
- **Committed in:** `ad81ea3`

Otherwise: plan executed as written. No Rule-4 architectural changes; no auth gates.

## Threat Surface Scan

All surface is within the plan's `<threat_model>`:

- **T-08-04-01 (reverse-tabnabbing):** the `SHARE AS FRAME →` link opens with `rel="noopener noreferrer"` (grep-asserted). Mitigated.
- **T-08-04-02 (injection):** the control reuses `buildShareText` + `warpcastComposeUrl` unchanged — both URL-encode all args (purity contract); no raw concatenation. Mitigated.
- **T-08-04-03 (spoofing — wrong host after migration):** Open Q3 verified the live host; the migration is a single reviewed host-string edit in the pure builder + its test. Mitigated.
- **T-08-04-04 (info disclosure):** share text is the same outcome word + handle + market line already on the public receipt. Accept (no new disclosure).
- **T-08-04-SC (npm installs):** ZERO new npm deps — reuses `@call-it/shared` builders; no `@farcaster/*` package introduced.

No new threat flags beyond the register.

## Known Stubs

None. The auto-post embed rides a real receipt URL; the SHARE AS FRAME control opens a real, encoded compose intent; the only deferral is the live in-Warpcast tap-to-transact, which is the explicit Phase-10 gate (D-01), not a stub.

## Verification Evidence

- `pnpm --filter @call-it/shared build` → exit 0.
- `pnpm --filter @call-it/web test` → 11 files / **80 tests passed** (incl. `share-text.test.ts` 6/6 on the new host).
- `pnpm --filter @call-it/relayer test` → 37 files passed / 1 skipped, **209 tests passed** / 1 skipped (incl. `auto-post-worker.test.ts` **10 tests** — the new `(f)` brings it from 9 → 10).
- `apps/web` SHARE AS FRAME source-grep: control present, reuses `warpcastComposeUrl`, `rel="noopener noreferrer"` present → OK.
- `pnpm --filter @call-it/web build` → exit 0.

## Checkpoint (Task 2 — human-verify) — APPROVED 2026-06-09

The control was built + builds clean; the user reviewed the automated evidence and responded **"approved"**, resolving the checkpoint.

**What was approved on:** web suite 80/80, relayer 209 passed/1 skipped, `pnpm --filter @call-it/web build` and `pnpm --filter @call-it/shared build` both exit 0, and the control reuses the existing sibling-outline design tokens (2px `#E8F542` border, transparent fill, accent text — zero new tokens) with `rel="noopener noreferrer"` on the new-tab compose link (source-grep confirmed).

**What was deferred (and why):** the live in-Warpcast visual preview — opening the composed cast inside a real Farcaster client and tapping the embed — is deferred to the existing **Phase-10/soak gate**. Arbitrum Sepolia is not in Warpcast's `chainList`, so an in-client transact preview cannot be demonstrated on testnet. This matches the plan's own verification note ("the live in-Warpcast tap-to-transact is NOT a gate here — Phase 10, D-01") and the threat-register `T-08-04` Phase-10 framing. No code change resulted from the approval.

For reference, the human-verify steps that the live Phase-10 preview will exercise:

1. `pnpm --filter @call-it/web dev`; open a settled receipt at `/call/{seededSettledId}`.
2. Confirm the action row shows `SHARE THE RECEIPT →` (accent fill) and, to its right, `SHARE AS FRAME →` (outline).
3. Click `SHARE AS FRAME →` — a new tab opens to the Farcaster compose intent URL with the receipt URL in `embeds[]=` and the `buildShareText` outcome word + handle in `text=`.
4. Preview the composed cast and confirm the OG card + launch button render from the embed (live tap-to-transact = Phase-10 gate).
5. Confirm that on a receipt where the handle/URL is unavailable, the control is absent (not a dead/disabled button).

---
*Phase: 08-farcaster-mini-apps*
*Completed: 2026-06-09 (Task-2 human-verify approved)*

## Self-Check: PASSED

- [x] `packages/shared/src/share/share-text.ts` modified (host → farcaster.xyz) — verified on disk
- [x] `apps/web/tests/share-text.test.ts` modified (host expectation) — verified on disk
- [x] `apps/relayer/src/workers/__tests__/auto-post-worker.test.ts` modified (test (f)) — verified on disk
- [x] `apps/web/app/call/[id]/page.tsx` modified (SHARE AS FRAME control) — verified on disk
- [x] Commit `ad81ea3` (Task 1) in git log
- [x] Commit `83aeae9` (Task 2 implementation) in git log
- [x] `pnpm --filter @call-it/shared build` exit 0
- [x] web suite 80/80; relayer suite 209 passed/1 skipped (auto-post-worker 10 tests)
- [x] `pnpm --filter @call-it/web build` exit 0
- [x] Task 2 human-verify — APPROVED 2026-06-09 (on automated evidence; live in-Warpcast preview deferred to Phase-10/soak — Sepolia not in Warpcast chainList)
- [x] SHARE-19 traced + Complete in REQUIREMENTS.md (line 427 + traceability table)
- [x] ROADMAP phase-08 plan-progress = Complete (4/4); STATE completed_plans 72→73
