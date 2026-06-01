---
status: partial
phase: 03-challengeescrow
source: [03-VERIFICATION.md]
started: 2026-06-01
updated: 2026-06-01
---

## Current Test

[awaiting human browser testing — Phase 3 code verified + contract live; these need a running app]

## Tests

### 1. Duel page layout (/duel/[challengeId])
THE MARKET hero + two-column duel card render with correct color semantics (CALLER `#E8F542` / CHALLENGER `#FB923C`), CornerBrackets, parallel stat rows. Status: pending.

### 2. MARKET CONSENSUS · LIVE bar
Renders + updates on the ~5s poll / window-focus refetch. Status: pending.

### 3. Duel Settled OG card (variant 3) PNG
`/og/duel/[challengeId]` returns a valid PNG, flexbox-only, with documented Phase-4 stubs (VS not WINS, ? REP). Status: pending.

### 4. Challenge propose flow
Challenge form pre-fills challenger stake (SOCIAL-30), Zod $5–$100 bounds, USDC allowance + balance preflight before propose. Status: pending.

### 5. Caller accept/reject flow
Caller-only accept (USDC `approve(min(callerInput, challengerStake))` preflight → `acceptChallenge`) and reject paths on the Live Receipt. Status: pending.

### 6. Trending duel pin + badges in feed
Duels tab (Active/Trending/Recently-settled), ⚔ OPEN badge, TRENDING DUEL pin, Duel King badge placeholder render in the global feed. Status: pending.

### 7. Mobile banner
"Best viewed on desktop" banner shows at ≤768px on the Duel page. Status: pending.

---
*Run `/gsd-verify-work 3` to walk these conversationally, or test in the browser once the app is running against the live Sepolia contract + subgraph v0.3.0.*
