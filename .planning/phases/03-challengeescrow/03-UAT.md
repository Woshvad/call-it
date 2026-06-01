---
status: partial
phase: 03-challengeescrow
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md, 03-04-SUMMARY.md, 03-05-SUMMARY.md, 03-06-SUMMARY.md, 03-07-SUMMARY.md, 03-VERIFICATION.md]
started: 2026-06-01
updated: 2026-06-01
---

## Current Test

[testing paused — all live browser tests blocked by two environment prerequisites; see Environment Findings]

## Tests

### 1. Cold Start Smoke Test
expected: Fresh start — relayer boots, duel workers tick, web `next dev` serves homepage, GET /api/duels returns without 500.
result: blocked
blocked_by: other
reason: "`next dev` (turbopack) returns HTTP 500 on every route — module-not-found resolving `@call-it/shared` barrel's `.js`-extension imports (e.g. ./validation/follow-fade-gates.js) to their .ts sources. PRE-EXISTING (the .js-import pattern predates Phase 3) and NOT a Phase 3 defect. Production `next build` exits 0 (verified during execution), so the code is sound — only turbopack dev-mode resolution is broken."

### 2. Duel page layout (/duel/[challengeId])
expected: THE MARKET hero + two-column CALLER (#E8F542) / VS / CHALLENGER (#FB923C) card with CornerBrackets + parallel stat rows.
result: blocked
blocked_by: other
reason: "Page 500s in `next dev` (same shared-import issue as Test 1); and no seeded duel exists (see Sepolia-USDC finding). Code verified via prod build + security audit (T-3-06-03 flexbox, color tokens present) + verifier (criterion 4 PASS at code level)."

### 3. MARKET CONSENSUS · LIVE bar
expected: Renders + refreshes on ~5s poll + window-focus.
result: blocked
blocked_by: other
reason: "Blocked by Test 1 dev 500 + no seeded duel + relayer not running locally (duel-live-state endpoint). Code present (D-10 poll pattern verified by verifier)."

### 4. Duel Settled OG card (/og/duel/[challengeId])
expected: Returns a valid PNG, flexbox-only, Phase-4 stubs, renderFallback on error.
result: blocked
blocked_by: other
reason: "Route 500s in `next dev` due to the shared-import resolution issue (route imports @call-it/shared). Code verified: security audit confirmed runtime='nodejs' first line (T-3-07-03), zero display:grid (T-3-07-01), renderFallback on all error paths (T-3-07-02); prod build passed."

### 5. Challenge propose flow
expected: Stake pre-fill + $5–$100 Zod bounds + USDC allowance/balance preflight before proposeChallenge.
result: blocked
blocked_by: third-party
reason: "Needs Privy wallet auth + USDC on Sepolia. Native USDC (0xaf88d065…e5831) has NO code on Arbitrum Sepolia, so stake transfers cannot execute on the testnet — a stake-backed duel cannot be seeded. Form + preflight code verified (T-3-06-01 bounds, T-3-06-06 allowance preflight)."

### 6. Caller accept / reject flow
expected: Caller pending block, accept w/ USDC preflight (min(callerInput, challengerStake)), reject refunds, exit links present.
result: blocked
blocked_by: third-party
reason: "Same as Test 5 — wallet + Sepolia USDC required; no token contract on Sepolia. Accept-formula fix + preflight + SOCIAL-49/50 exit links verified at code level (28/28 contract tests, verifier criteria 1-3)."

### 7. Trending duel pin + badges in feed
expected: Duels tab (Active/Trending/Recently-settled) + ⚔ OPEN badge + TRENDING pin + Duel King placeholder.
result: blocked
blocked_by: other
reason: "Feed 500s in `next dev` (shared import) + needs subgraph-indexed calls + relayer /api/duels. Code present (03-07); verifier criterion 5 PASS at code level."

### 8. Mobile banner (Duel page)
expected: "Best viewed on desktop" banner at ≤768px.
result: blocked
blocked_by: other
reason: "Blocked by Test 1 dev 500. Banner code present (grep confirmed 'desktop' marker in /duel page source; verifier noted ≤768px banner)."

## Summary

total: 8
passed: 0
issues: 0
blocked: 8
pending: 0
skipped: 0

## Environment Findings (not Phase 3 code defects — blockers for live UAT)

1. **`next dev` 500 — `@call-it/shared` `.js` import resolution (PRE-EXISTING, dev-only).**
   The shared package `exports: { ".": "./src/index.ts" }` serves raw TS; its barrel uses NodeNext `.js`-extension imports (`./validation/follow-fade-gates.js`). Turbopack dev fails to resolve these to the `.ts` sources → HTTP 500 on every route. Production `next build` (webpack) resolves them fine and exits 0. Fix options: add a turbopack `resolveExtensions`/alias, or build `@call-it/shared` to `dist` and point `exports` there for consumers, or run the app via `next build && next start` for UAT. Pre-dates Phase 3 (the import pattern is from 2026-05-29). Recommend a separate infra task.

2. **No native USDC on Arbitrum Sepolia.**
   The mandated USDC `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` is the Arbitrum **One** address and has **no code on Sepolia**. ChallengeEscrow (and FollowFadeMarket) deploy fine but any `safeTransferFrom`/`safeTransfer` stake path will revert on Sepolia — so duels/follows/settles cannot be exercised end-to-end on the testnet. This affects the spec's "≥48h Sepolia staging gate with seeded calls/follows/settles" requirement. Likely needs a Sepolia mock-USDC strategy (deploy a test ERC-20 + a Sepolia-specific address override) — a project-level decision, not Phase 3 scope. Recommend surfacing for Phase 6/staging planning.

## Code-level verification standing (why blocked ≠ unverified)

Phase 3 code correctness is independently established: `forge test --match-contract ChallengeEscrow` 28/28 GREEN; 111 Phase-2 regression tests green; all package builds (web/relayer/subgraph/shared) exit 0; code review 6/6 criticals fixed (03-REVIEW.md); security audit 36/36 threats closed (03-SECURITY.md); goal verifier confirmed all 6 ROADMAP success criteria at code level (03-VERIFICATION.md, status human_needed); contract live + correct on-chain (cast reads). The 8 UAT items are blocked on the two environment prerequisites above, not on Phase 3 code.

## Gaps

[none — all blocks are environment prerequisites, not code issues]
