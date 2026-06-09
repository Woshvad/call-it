---
status: complete
phase: 08-farcaster-mini-apps
source: [08-VERIFICATION.md]
started: 2026-06-09T07:30:00Z
updated: 2026-06-09T08:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. SHARE AS FRAME control — visual placement + compose-intent behavior
expected: |
  On a settled /call/{id}, the action row shows SHARE THE RECEIPT → (accent fill) and, to its
  right, SHARE AS FRAME → (outline: 2px #E8F542 border, transparent fill, accent text) at the
  same height/gap/typography; clicking opens a new tab to
  farcaster.xyz/~/compose?text=…&embeds[]=<receiptUrl>; the control is ABSENT (not a dead button)
  on a receipt with no real handle / no NEXT_PUBLIC_OG_BASE_URL.
why_human: |
  Planner deferred this as checkpoint:human-verify (08-04 Task 2, gate=blocking). Visual
  treatment/placement + new-tab navigation cannot be verified by grep.
note: |
  Operator APPROVED this on automated evidence during execution (2026-06-09): web 89/89, build
  exit 0, control reuses the existing sibling outline button's tokens, rel="noopener noreferrer".
result: issue
reported: "Button mechanics worked (placement, new-tab compose, embed render confirmed live in the Farcaster composer). BUT the compose TEXT reads 'CALLED IT' on a settled LOSS (call #14 = CallerLost). The embed OG card correctly shows 'LOUD AND WRONG'; the share text + receipt-page stamp show 'CALLED IT'. A settled loss publicly shares as a win — Core Value violation (fake receipt)."
severity: major
root_cause: |
  fetchCallData (apps/web/app/call/[id]/page.tsx:289-312) maps CallData from the relayer
  /api/calls/:id/live-state, which does NOT return an `outcome` field (nor repDelta/fadeRealShare/
  marketLine/handle). So callData.outcome is always undefined → outcomeWordResult is null
  (page.tsx:1059) → outcomeWord falls back to the hardcoded 'CALLED IT' (page.tsx:1368). That wrong
  value feeds BOTH the receipt stamp and buildShareText (page.tsx:1383). The /og/[id] OG-image route
  computes the outcome correctly from the subgraph (renders LOUD AND WRONG), so only the page/share
  path is wrong. Page-level og:title is a third wrong answer ("Live Call") for the settled call.
  Pre-existing data-wiring gap (predates Phase 8) surfaced as a PUBLIC false cast by 08-04's
  SHARE AS FRAME reuse of outcomeWord. Related to Phase-7 follow-up (fadeRealShare from subgraph).

### 2. Live in-Warpcast cast render (Sepolia embed debugger / real cast)
expected: |
  Paste a deployed Sepolia /call/{id} into the Farcaster Mini App embed debugger (or post a real
  cast): Warpcast loads the cast, renders the Settled receipt OG card as the embed image, and shows
  the launch button; the manifest at /.well-known/farcaster.json resolves on the deployed origin.
why_human: |
  Requires a deployed origin + a live Farcaster client. CI builds + asserts the embed meta/manifest
  shape but cannot drive Warpcast. (D-01: full live render of mainnet chain 42161 tap-to-transact is
  Phase-10; the Sepolia embed render is a tool/manual check, not a gate.)
result: issue
reported: "CAST EMBED render works (OG card image + launch button render in the Farcaster composer; manifest 200). BUT tapping 'View on Call It' (launch_miniapp) opens a BLANK WHITE Mini App page — the launched receipt page never renders in the Farcaster webview."
severity: major
root_cause: |
  Two compounding causes: (1) NO Farcaster Mini App SDK anywhere — grep for @farcaster/miniapp-sdk /
  @farcaster/frame-sdk / sdk.actions.ready() returns nothing (only @farcaster/auth-kit from Phase 1.5
  is present). Farcaster Mini Apps stay on a blank/splash screen until the app calls
  sdk.actions.ready(); it is never called. (2) The /call/[id] page SSR HTML contains
  BAILOUT_TO_CLIENT_SIDE_RENDERING — an empty server shell (13KB, no <body> receipt content), so the
  page is 100% client-rendered via a heavy Privy+wagmi stack that does not initialize/render in the
  restricted Mini App webview. The cast EMBED works because it is a static /og/[id] image, not the page.
  Phase 8 shipped the manifest + fc:miniapp launch_miniapp action + launch button (08-02) but never made
  the launch TARGET a real Mini App (no SDK init, no ready(), no SSR content, no webview-render path).

### 3. CR-01 security intent — forged ?action= cannot coerce a Live wire on a settled call
expected: |
  In production (NEXT_PUBLIC_DEV_ROUTES unset), POST /api/frame/tx/{settledId}?action=Fade returns
  the settled deep-link, never an eth_sendTransaction; the override is also dead during a relayer
  outage (statusReadOk=false).
why_human: |
  REVIEW-FIX flagged CR-01 as 'fixed: requires human verification' (security/logic hardening).
  Regression tests assert this in CI, but the fixer requested a human confirm the threat-model intent
  holds end-to-end.
result: pass
verified: "LIVE on call-it-web-sepolia.vercel.app — POST /api/frame/tx/14?action=Fade|Follow|Challenge and plain all return {type:deep-link}, never an eth_sendTransaction. Settled call cannot be coerced into a live wire via forged param (NEXT_PUBLIC_DEV_ROUTES unset in prod)."

### 4. WR-04 onboarding boundary — user cached on step 5 during outage is redirected, not let through
expected: |
  With cached ci_onboarding_step=5 and the relayer down, middleware redirects to /onboarding/tagline
  rather than failing open into gated pages.
why_human: |
  REVIEW-FIX flagged WR-04 as 'fixed: requires human verification' (boundary change from step<5 to
  1<=step<=5). Behavioral redirect under a simulated outage is best confirmed by a human.
result: pass
verified: "Logic-verified (cannot curl — needs logged-in session + simulated outage). middleware.ts:183 cached-step fallback is `step >= 1 && step <= 5` → redirect to /onboarding/{STEP_SLUGS[step]}; STEP_SLUGS[5]='tagline'. Cached step 5 + relayer down → redirect to /onboarding/tagline (was fail-open under old `step < 5`). Correct."

## Summary

total: 4
passed: 2
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "A settled receipt renders and SHARES its true outcome word (CALLED IT / LOUD AND WRONG / CONTRARIAN HIT / COLD CALL / FADED CORRECTLY) — never a fake positive."
  status: resolved
  resolved_by: "08-05 (commits e3f453e relayer /live-state surfaces outcome+repDelta+fadeRealShare; 609182d removes the ?? 'CALLED IT' default → fail-safe neutral 'PENDING RESULT', wires real outcome into page + share + og:title; regression test settled-outcome-truth.test.ts proves CallerLost → 'LOUD AND WRONG', never 'CALLED IT'). Web 97✓ incl. new test. NOTE: full 'LOUD AND WRONG' on live #14 needs the relayer (Fly) redeploy — until then the web fail-safe shows NEUTRAL, never a fake win (Core Value satisfied on web-deploy alone)."
  reason: "User reported: settled loss (call #14) shares as 'CALLED IT' in the Farcaster cast text + receipt stamp; only the OG embed image is correct ('LOUD AND WRONG')."
  severity: major
  test: 1
  artifacts:
    - apps/web/app/call/[id]/page.tsx (fetchCallData ~L289-312; outcomeWordResult L1059; outcomeWord ?? 'CALLED IT' L1368; buildShareText L1383)
    - apps/web/app/call/[id]/layout.tsx (generateMetadata og:title — also wrong: "Live Call" for settled #14)
    - apps/relayer (/api/calls/:id/live-state — missing outcome/repDelta/fadeRealShare/marketLine/handle)
    - apps/web/app/og/[id] (correct outcome source — read pattern to mirror)
  missing:
    - "Settled outcome (CallerWon/CallerLost) + repDelta + fadeRealShare wired into the receipt page (subgraph-sourced, mirroring /og/[id]); OR relayer live-state extended to return them."
    - "Remove the dangerous `?? 'CALLED IT'` default — when outcome is unknown on a SETTLED call, do not fabricate a positive word (fail safe to neutral/loading, never a win)."
    - "layout.tsx generateMetadata og:title must reflect the settled outcome, not 'Live Call'."

- truth: "Tapping the Mini App launch button ('View on Call It') opens a Mini App that RENDERS the receipt inside the Farcaster webview (not a blank page)."
  status: resolved
  resolved_by: "08-06 (commits 227f810 adds @farcaster/miniapp-sdk@0.3.0 + fail-safe MiniAppReady calling sdk.actions.ready() once; c799fe3 mounts it on all 3 render branches; read-only receipt no longer blocks on Privy/wagmi wallet init). Web 97✓ incl. miniapp-ready.test.ts (4 tests). Live in-Warpcast webview render is operator/manual re-verify (CI cannot drive Warpcast). Tap-to-transact stays Phase 10 (D-01)."
  reason: "User reported: launched Mini App shows a blank white page. Cast embed (OG image) renders, but the launch_miniapp target page is empty."
  severity: major
  test: 2
  artifacts:
    - apps/web/app/call/[id]/page.tsx (SSR emits BAILOUT_TO_CLIENT_SIDE_RENDERING — empty server shell; heavy Privy+wagmi client-only render)
    - apps/web/app/call/[id]/layout.tsx (fc:miniapp action.type=launch_miniapp points here)
    - apps/web/package.json (no @farcaster/miniapp-sdk / frame-sdk dependency)
    - "(absent) sdk.actions.ready() call — required to dismiss the Mini App splash/blank"
  missing:
    - "Add the Farcaster Mini App SDK (@farcaster/miniapp-sdk) and call sdk.actions.ready() once the receipt is rendered, so the host reveals content instead of a blank splash."
    - "Ensure the launched page renders in the Mini App webview — provide SSR/streamed receipt content (avoid full CSR bailout) and/or a Mini-App-safe render path that does not depend on Privy/wagmi wallet init to show the read-only receipt."
    - "Decide scope vs Phase 10: minimum here = the Mini App RENDERS the read-only receipt + ready(); in-app tap-to-transact stays Phase 10 (D-01)."
