---
status: testing
phase: 08-farcaster-mini-apps
source: [08-VERIFICATION.md]
started: 2026-06-09T07:30:00Z
updated: 2026-06-09T07:30:00Z
---

## Current Test

number: 1
name: SHARE AS FRAME control visual placement + compose-intent behavior on a real receipt
expected: |
  On a settled /call/{id}, the action row shows SHARE THE RECEIPT → (accent fill) and, to its
  right, SHARE AS FRAME → (outline: 2px #E8F542 border, transparent fill, accent text) at the
  same height/gap/typography; clicking opens a new tab to
  farcaster.xyz/~/compose?text=…&embeds[]=<receiptUrl>; the control is ABSENT (not a dead button)
  on a receipt with no real handle / no NEXT_PUBLIC_OG_BASE_URL.
awaiting: user response

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
  The remaining item is a live visual confirm in a browser; carry to soak like prior-phase live UAT.
result: [pending]

### 2. Live in-Warpcast cast render (Sepolia embed debugger / real cast)
expected: |
  Paste a deployed Sepolia /call/{id} into the Farcaster Mini App embed debugger (or post a real
  cast): Warpcast loads the cast, renders the Settled receipt OG card as the embed image, and shows
  the launch button; the manifest at /.well-known/farcaster.json resolves on the deployed origin.
why_human: |
  Requires a deployed origin + a live Farcaster client. CI builds + asserts the embed meta/manifest
  shape but cannot drive Warpcast. (D-01: full live render of mainnet chain 42161 tap-to-transact is
  Phase-10; the Sepolia embed render is a tool/manual check, not a gate.)
result: [pending]

### 3. CR-01 security intent — forged ?action= cannot coerce a Live wire on a settled call
expected: |
  In production (NEXT_PUBLIC_DEV_ROUTES unset), POST /api/frame/tx/{settledId}?action=Fade returns
  the settled deep-link, never an eth_sendTransaction; the override is also dead during a relayer
  outage (statusReadOk=false).
why_human: |
  REVIEW-FIX flagged CR-01 as 'fixed: requires human verification' (security/logic hardening).
  Regression tests assert this in CI, but the fixer requested a human confirm the threat-model intent
  holds end-to-end.
result: [pending]

### 4. WR-04 onboarding boundary — user cached on step 5 during outage is redirected, not let through
expected: |
  With cached ci_onboarding_step=5 and the relayer down, middleware redirects to /onboarding/tagline
  rather than failing open into gated pages.
why_human: |
  REVIEW-FIX flagged WR-04 as 'fixed: requires human verification' (boundary change from step<5 to
  1<=step<=5). Behavioral redirect under a simulated outage is best confirmed by a human.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
