---
status: accepted
phase: 03-challengeescrow
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md, 03-04-SUMMARY.md, 03-05-SUMMARY.md, 03-06-SUMMARY.md, 03-07-SUMMARY.md, 03-VERIFICATION.md]
started: 2026-06-01
updated: 2026-06-01
closed_out: 2026-06-01 (operator — accepted env-deferred items)
---

## Current Test

[closed out — Test 4 (OG card) PASSES after the font fix; the 7 remaining items are accepted as environment-deferred (Privy auth wall + no Sepolia USDC). Carried as tracked debt: this file + 03-VERIFICATION.md "Operator Close-Out" + ADR 0001 + Phase 4. The `next dev` 500 is also fixed, so the UI walkthrough is runnable once a wallet connects.]

## Tests

### 1. Cold Start Smoke Test
expected: Fresh start — relayer boots, duel workers tick, web serves homepage, GET /api/duels no 500.
result: blocked
blocked_by: other
reason: "PARTIAL FIX APPLIED. The `@call-it/shared` `.js`-import 500 is FIXED (commit fc03e8a — dropped .js extensions for bundler moduleResolution; verified: shared tsc + web prod build pass, dev error gone). BUT `next dev` (turbopack) still 500s because Privy's optional x402/@solana-program/* deps do named imports the turbopack `empty.mjs` stub can't satisfy (webpack's `false` stub tolerates them → PROD build/start works fully). Net: dev-mode broken via Privy/Solana; production build is the working path."

### 2. Duel page layout (/duel/[challengeId])
expected: THE MARKET hero + two-column CALLER (#E8F542) / CHALLENGER (#FB923C) card.
result: blocked
blocked_by: other
reason: "Page is behind the Privy auth wall — middleware redirects /duel/1 → /signin (HTTP 307), and there's no wallet/Privy session to authenticate in this environment. Plus no seeded duel (no Sepolia USDC). Code verified by prod build + security audit + verifier (criterion 4)."

### 3. MARKET CONSENSUS · LIVE bar
expected: Renders + refreshes on ~5s poll + window-focus.
result: blocked
blocked_by: other
reason: "Behind auth wall (Test 2) + needs seeded duel + relayer running locally. Code verified by verifier (D-10)."

### 4. Duel Settled OG card (/og/duel/[challengeId])
expected: Returns a valid PNG, flexbox-only, Phase-4 stubs, renderFallback on error.
result: pass
reported: "FIXED (commit b225007). Root cause was 3 corrupt OG font files (invalid sfnt magic in the committed blobs). Replaced with valid static TTFs (JetBrains Mono Regular from the official repo; Space Grotesk 400 + Syne 700 instanced from the google/fonts variable fonts via fonttools — variable fonts tripped a Satori glyph error, static instances fixed it) + added a root .gitattributes marking fonts binary. Verified via prod `next start`: GET /og/duel/1 → HTTP 200, image/png, valid PNG (37,885b); /og/[callId] → PNG (38,775b); /api/og/fallback → PNG (38,775b). Minor non-fatal: satori logs a 'dynamic font' 400 for a ⬢ glyph not in the bundled fonts — the card still renders; cosmetic only."

### 5. Challenge propose flow
expected: Stake pre-fill + $5–$100 bounds + USDC preflight before proposeChallenge.
result: blocked
blocked_by: third-party
reason: "Needs Privy wallet + USDC on Sepolia. Native USDC (0xaf88d065…e5831) has NO code on Arbitrum Sepolia, so stakes can't transfer / a duel can't be seeded. Form + preflight code verified (T-3-06-01/06)."

### 6. Caller accept / reject flow
expected: Caller pending block, accept w/ USDC preflight, reject refunds, exit links present.
result: blocked
blocked_by: third-party
reason: "Same as Test 5 — wallet + Sepolia USDC required. Accept-formula fix + preflight + SOCIAL-49/50 links verified at code level (28/28 tests, verifier criteria 1-3)."

### 7. Trending duel pin + badges in feed
expected: Duels tab + ⚔ OPEN badge + TRENDING pin + Duel King placeholder.
result: blocked
blocked_by: other
reason: "Feed behind auth wall (/ → /signin 307) + needs subgraph-indexed calls + relayer. Code present (03-07); verifier criterion 5 PASS at code level."

### 8. Mobile banner (Duel page)
expected: "Best viewed on desktop" banner at ≤768px.
result: blocked
blocked_by: other
reason: "Duel page behind auth wall. Banner code present (source grep + verifier)."

## Summary

total: 8
passed: 1
issues: 0
blocked: 7
pending: 0
skipped: 0

(Test 4 OG card now PASSES after the font fix. The remaining 7 are environment-blocked, not code defects. The `next dev` 500 from Test 1 is also resolved — shared `.js` fix fc03e8a + dev→webpack 8fe076f — so local dev works; the cold-start smoke still needs a manual relayer boot to fully close.)

## Environment Findings (blockers for live UAT)

1. **`next dev` broken via Privy/Solana turbopack stubs (PRE-EXISTING; prod build works).** Privy's optional `x402` + `@solana-program/*` deps do static named imports; the next.config turbopack `resolveAlias → ./stubs/empty.mjs` can't satisfy named imports (turbopack errors on missing named exports). Webpack's `alias → false` tolerates them, so `next build && next start` works fully. The `@call-it/shared` `.js`-resolution part of this was FIXED (commit fc03e8a); the Privy/Solana part remains. Fix needs a turbopack-compatible stub strategy (e.g. a stub that re-exports the named symbols, or move Privy's optional features behind dynamic import).
2. **Privy auth wall.** Middleware redirects all app routes (/, /duel/*, feed) → /signin. No wallet/Privy session is available in this environment to reach the authenticated duel UI for screenshots.
3. **No native USDC on Arbitrum Sepolia** (mandated address is mainnet-only, no code on Sepolia) — can't seed a stake-backed duel; blocks the spec's 48h Sepolia staging gate. (Already flagged as a spin-off task.)

## Gaps

```yaml
- truth: "Duel Settled OG card (/og/duel/[challengeId]) returns a valid PNG"
  status: resolved   # fixed in commit b225007 — valid static fonts + .gitattributes; all OG routes return PNG
  reason: "All 3 OG fonts (Syne-Bold, SpaceGrotesk-Regular, JetBrainsMono-Regular .ttf) are corrupt (invalid sfnt magic in the committed git blobs) → Satori throws 'Unsupported OpenType signature'; renderFallback also fails (same fonts) → OG route returns no image. Breaks ALL OG cards (Phase 2 + Phase 3)."
  severity: blocker
  test: 4
  artifacts: [apps/web/app/fonts/Syne-Bold.ttf, apps/web/app/fonts/SpaceGrotesk-Regular.ttf, apps/web/app/fonts/JetBrainsMono-Regular.ttf, apps/web/app/og/[callId]/route.ts, apps/web/app/og/duel/[challengeId]/route.ts, apps/web/app/api/og/fallback/route.ts]
  missing: ["valid TTF/OTF font binaries (correct sfnt signature)", ".gitattributes marking *.ttf/*.otf/*.woff* as binary to prevent recorruption"]
  root_cause: "Font binaries were committed corrupt (likely a text-mode/transform when first added in Phase 0 OG setup). Not Phase 3 code — but Phase 3's SHARE-07 duel OG card inherits the broken renderer."
```

## Code-level verification standing

Phase 3 code correctness remains independently established (28/28 contract tests, all builds, code review 6/6 criticals fixed, security audit 36/36, goal verifier 6/6 criteria, contract live on-chain). The font bug is a pre-existing shared-OG-infra defect surfaced by render-testing; it is the one item that needs a code/asset fix. The other 7 items are environment-gated (auth wall, Sepolia USDC, Privy-turbopack dev), not Phase 3 code defects.
