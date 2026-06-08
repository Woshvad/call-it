---
phase: 08-farcaster-mini-apps
plan: 01
subsystem: testing
tags: [farcaster, mini-apps, frame, manifest, middleware, vitest, png, viem, og]

# Dependency graph
requires:
  - phase: 07-og-finalization
    provides: /og/[callId] route + statusVersion-tagged og:image (embed imageUrl reuse, Pitfall 4)
  - phase: 01-foundation
    provides: middleware.ts PUBLIC_PREFIXES + isPublicRoute startsWith model (carve-out analog)
  - phase: 02-followfademarket
    provides: FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA constant in @call-it/shared (Frame tx `to` target)
provides:
  - apps/web/public/icon.png — 1024x1024 PNG, NO alpha (manifest iconUrl asset)
  - apps/web/public/splash.png — 200x200 PNG (manifest/embed splashImageUrl asset)
  - middleware /.well-known public carve-out (Farcaster crawler reaches manifest unauthenticated)
  - apps/web/lib/farcaster-fixtures.ts — pure per-status button-set table + min-stake + seeded callIds
  - 4 Wave-0 test scaffolds (3 RED targets for Wave-1/2 + 1 GREEN middleware proof)
affects: [phase-08-plan-02-embed-manifest, phase-08-plan-03-frame-tx, phase-08-plan-04-auto-post]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Raw PNG generation via node:zlib (deflate IDAT + CRC32 chunks) — no ImageMagick/sharp/canvas dependency; deterministic, color-type-controlled (RGB=2 for no-alpha icon, RGBA=6 for splash)"
    - "RED scaffold form: lazy dynamic import() inside the test body → file is COLLECTED (no collection-time crash) but FAILS until the Wave-1/2 target module lands; flips GREEN with no test-body edit"
    - "Single-source button table: lib/farcaster-fixtures.ts owns buttonsForStatus() so the Plan-03 Frame route and frame-tx.test.ts agree by construction (no divergence)"

key-files:
  created:
    - apps/web/public/icon.png
    - apps/web/public/splash.png
    - apps/web/lib/farcaster-fixtures.ts
    - apps/web/tests/farcaster-embed.test.ts
    - apps/web/tests/farcaster-manifest.test.ts
    - apps/web/tests/frame-tx.test.ts
    - apps/web/tests/middleware-public.test.ts
  modified:
    - apps/web/middleware.ts

key-decisions:
  - "PNGs generated with a node:zlib one-off (no ImageMagick/sharp/canvas available on the host) — icon.png colorType 2 (RGB, opaque, no alpha per manifest spec), splash.png colorType 6 (RGBA, alpha allowed)"
  - "Three scaffolds use lazy dynamic import() so they are RED (not green-by-accident) and not collection-time crashes; the fourth (middleware-public) is GREEN because its carve-out lands in this plan (Task 1)"
  - "middleware-public.test.ts re-declares the prefix predicate + source-anchors the '/.well-known' string rather than forcing an isPublicRoute export refactor"
  - "Seeded callId fixtures are documented testnet placeholders on the canonical Phase-6 recovery cluster (CR 0xc79bB19d…), not load-bearing mainnet values"

patterns-established:
  - "node:zlib raw-PNG emit for deterministic brand assets when no image lib is installed"
  - "lazy-import RED scaffold: collected-but-failing test that flips GREEN when its target lands"
  - "pure fixtures module as the single source for status→button-set across route + tests"

requirements-completed: [SHARE-19]

# Metrics
duration: ~14min
completed: 2026-06-08
---

# Phase 8 Plan 01: Farcaster Wave-0 Foundation Summary

**Two opaque/alpha-controlled manifest PNGs generated via node:zlib, a `/.well-known` middleware public carve-out so the Farcaster crawler reaches the manifest unauthenticated, plus a pure per-status button-set fixtures module and four Wave-0 test scaffolds (3 RED targets for the embed/manifest/frame-tx slices + 1 GREEN middleware proof).**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-06-08T22:50Z
- **Completed:** 2026-06-08T23:04Z
- **Tasks:** 2
- **Files modified:** 8 (7 created, 1 modified)

## Accomplishments

- **Static assets:** `icon.png` (1024x1024, colorType 2 RGB, NO alpha — manifest spec opaque requirement) and `splash.png` (200x200, colorType 6 RGBA, alpha allowed), both on brand-bg `#09090E` with an `#E8F542` accent glyph, generated deterministically with a `node:zlib` raw-PNG encoder (no ImageMagick/sharp/canvas on the host).
- **Middleware carve-out (Pitfall 2, D-05):** added `'/.well-known'` to `PUBLIC_PREFIXES` with a rationale comment; `/api/frame/*` left to the existing `'/api'` prefix (NOT duplicated). T-08-01-01 (DoS / 302-to-/signin) mitigated.
- **Pure fixtures module:** `lib/farcaster-fixtures.ts` exports `STATUS_BUTTON_SETS` + `buttonsForStatus()` (Live → [Follow,Fade,Challenge]; Settled/Disputed/CallerExited → [Follow,Challenge,Quote], D-02/D-06), `MIN_FOLLOW_STAKE_USDC_6DP = 1_000_000n` ($1, D-07), and seeded Sepolia callId fixtures. Verified pure (no env, no fetch).
- **Four Wave-0 test scaffolds** wired to the SC1a/SC1b/SC1c/SC2 rows in 08-VALIDATION.md, with documented RED/GREEN form.

## Task Commits

Each task was committed atomically:

1. **Task 1: Static assets + middleware public carve-out** - `17fcab3` (feat)
2. **Task 2: RED test scaffolds + shared status fixtures** - `a50fef5` (test)

**Plan metadata:** (docs commit — see final commit)

## Files Created/Modified

- `apps/web/public/icon.png` — 1024x1024 PNG, RGB colorType 2 (no alpha), manifest `iconUrl`
- `apps/web/public/splash.png` — 200x200 PNG, RGBA colorType 6, manifest/embed `splashImageUrl`
- `apps/web/middleware.ts` — `PUBLIC_PREFIXES += '/.well-known'` with crawler-rationale comment
- `apps/web/lib/farcaster-fixtures.ts` — pure status→button-set table, min-stake constant, seeded callId fixtures
- `apps/web/tests/farcaster-embed.test.ts` — SC1a/SC3 embed-meta shape (RED)
- `apps/web/tests/farcaster-manifest.test.ts` — SC1b manifest schema, no accountAssociation (RED)
- `apps/web/tests/frame-tx.test.ts` — SC2: button-set GREEN now + RED wire/decode round-trip
- `apps/web/tests/middleware-public.test.ts` — SC1c /.well-known + /api/frame public (GREEN)

## RED/GREEN form of each scaffold (per acceptance criteria)

| Test file | Form | Wave-0 result | Why |
|-----------|------|---------------|-----|
| `farcaster-embed.test.ts` | lazy `import('../lib/farcaster-embed.js')` + `import('../app/call/[id]/layout.js')` | **RED** | targets land in Plan 02 |
| `farcaster-manifest.test.ts` | lazy `import('../app/.well-known/farcaster.json/route.js')` | **RED** | route lands in Plan 02 |
| `frame-tx.test.ts` | button-set test (pure fixtures) **+** lazy `import('../app/api/frame/tx/[callId]/route.js')` | **GREEN** (button set) **/ RED** (wire+decode) | fixtures exist now; route lands in Plan 03 |
| `middleware-public.test.ts` | prefix predicate + source-anchored `/.well-known` assertion | **GREEN** | carve-out landed in Task 1 of THIS plan |

Vitest run: **4 failed / 5 passed** across the 4 files — exactly the intended RED-not-green-by-accident state (3 files fail on missing Wave-1/2 targets; the 5 passing tests are the pure button-set checks + the 4 middleware-public assertions). No collection-time import crash.

## Decisions Made

1. **node:zlib raw-PNG generation** — the host has no ImageMagick (`magick` not found; `convert` resolves to Windows system32, not IM), no `sharp`, no `canvas`. A small `node:zlib` encoder (IHDR/IDAT/IEND chunks + CRC32) emits deterministic PNGs at exact dimensions and lets us pick colorType precisely: icon=2 (RGB, opaque, satisfies the manifest "no alpha" requirement), splash=6 (RGBA, alpha allowed).
2. **Lazy dynamic import for RED scaffolds** — keeps the files collected (no collection-time crash, per acceptance criteria) while failing until Wave-1/2 targets exist. The shape assertions are written to flip GREEN with no test-body edit when the modules land.
3. **middleware-public.test.ts source-anchors the prefix** — `isPublicRoute` is module-internal in middleware.ts; rather than force an export refactor in Wave 0, the test re-declares the predicate AND asserts the middleware source carries `'/.well-known'`. Keeps the assertion behavioral.
4. **Seeded callId fixtures are documented placeholders** — pegged to the canonical Phase-6 recovery cluster (CR `0xc79bB19d…`, subgraph v0.9.0); not load-bearing values, re-seedable per slice.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reworded fixtures purity comment to avoid a false-positive purity grep**
- **Found during:** Task 2 (fixtures purity check)
- **Issue:** The fixtures doc-comment contained the literal token `process.env` ("reads NO process.env"), which the share-text-style purity regex (`/process\.env/`) flags even though there is no actual env access.
- **Fix:** Reworded the comment to "reads no environment variables and performs no network calls" — no behavioral change.
- **Files modified:** `apps/web/lib/farcaster-fixtures.ts`
- **Verification:** purity regex (`/process\.env/`, `/\bfetch\s*\(/`) now returns clean; "fixtures pure: OK".
- **Committed in:** `a50fef5` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — purity-grep false positive).
**Impact on plan:** Cosmetic comment change only. No scope creep, no behavioral change.

## Issues Encountered

- **No image library on host** — resolved by the node:zlib raw-PNG encoder (see Decision 1). Dimensions + color types verified by reading the PNG IHDR bytes directly: icon 1024x1024/depth8/colorType2; splash 200x200/depth8/colorType6.
- **CRLF warnings on git add** — benign (repo default line-ending normalization); no content impact.

## Threat Surface Scan

No new security surface beyond the plan's `<threat_model>`. T-08-01-01 (DoS reachability) mitigated by the `/.well-known` carve-out + the middleware-public test; T-08-01-02 (static asset disclosure) accepted (display-only brand PNGs, no secrets); T-08-01-SC (install tampering) — ZERO new npm dependencies added.

## Known Stubs

None. The RED scaffolds intentionally reference not-yet-built Wave-1/2 targets (Plan 02 manifest/embed, Plan 03 Frame tx route) — these are documented in 08-PLAN artifacts as the GREEN targets for the following slices, not stubs in shipped code.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Plan 02 (embed + manifest):** has a concrete GREEN target — `farcaster-embed.test.ts` (build `buildFarcasterEmbeds` in `lib/farcaster-embed.ts` + wire `call/[id]/layout.tsx` `generateMetadata.other`) and `farcaster-manifest.test.ts` (build `app/.well-known/farcaster.json/route.ts`, body-only, no accountAssociation). Static `iconUrl`/`splashImageUrl` assets + the public carve-out are already in place.
- **Plan 03 (Frame tx):** has a concrete GREEN target — `frame-tx.test.ts` (build `app/api/frame/tx/[callId]/route.ts`; import the button table from `lib/farcaster-fixtures.ts`; emit the `eip155:421614` / `eth_sendTransaction` wire with origin-locked `to` = FFM Sepolia + min-$1 `follow` calldata).
- No blockers.

---
*Phase: 08-farcaster-mini-apps*
*Completed: 2026-06-08*

## Self-Check: PASSED
