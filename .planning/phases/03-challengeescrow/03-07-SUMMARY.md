---
phase: 03-challengeescrow
plan: 07
subsystem: ui
tags: [vercel-og, satori, nextjs, duels, og-card, feed-tabs, badges]
dependency_graph:
  requires:
    - phase: 03-challengeescrow
      provides: ChallengeFormModal at apps/web/app/components/ (plan 03-06)
    - phase: 03-challengeescrow
      provides: CHALLENGE_ESCROW_ARBITRUM_SEPOLIA + PROFILE_REGISTRY_ARBITRUM_SEPOLIA (shared)
    - phase: 02-followfademarket
      provides: renderFallback + og-fonts + @vercel/og Node runtime pattern (plan 02-09)
  provides:
    - GET /og/duel/[challengeId] — Duel Settled OG card variant 3 (§16.4): Node runtime, flexbox-only, STUB CONTRACT D-11, renderFallback
    - Duels tab (fourth tab in feed): Active / Trending / Recently settled sections
    - ⚔ OPEN badge on CallCards where openToChallenges == true
    - TRENDING DUEL pin in main Live feed (3px border + 4px shadow)
    - Duel King badge (placeholder — no render when duel_kings empty, Phase 3 correct)
    - ⚔ Challengeable filter chip in Live tab
  affects: [phase-04-settlement, phase-07-og-finalization]
tech-stack:
  added: []
  patterns:
    - "OG duel route: mirrors /og/[callId] exactly — runtime='nodejs' first line; zero display:grid; renderFallback on any error"
    - "STUB CONTRACT pattern (D-11): settled fields render graceful placeholders until Phase 4 activates them"
    - "ChallengeFormModal reuse pattern: imported from @/app/components/ not duplicated (Known Plan Issue #4)"
    - "Zero-address guard in OG route: deferred-deploy path serves placeholder card rather than error"
key-files:
  created:
    - apps/web/app/og/duel/[challengeId]/route.ts
  modified:
    - apps/web/app/page.tsx
decisions:
  - "export const runtime = 'nodejs' as FIRST LINE of route.ts — T-3-07-03 enforcement; build confirms position"
  - "D-11 stub contract: settled=false always in Phase 3; VS not WINS; ? REP not real deltas; X-Variant: duel-active"
  - "assetPair and callQuestion stubbed as empty/'Duel #N' in OG route — subgraph lookup deferred to Phase 7"
  - "ChallengeFormModal opened from LiveFeedList with callerHandle/callerStake as empty stubs — feed items lack those fields until relayer extends FeedItem in Phase 4"
  - "LiveFeedItem cast via ExtendedFeedItem intersection type to avoid FeedItem index-signature incompatibility"
metrics:
  duration: 11min
  completed: "2026-06-01"
  tasks: 2
  files_modified: 2
requirements:
  - SOCIAL-40
  - SOCIAL-41
  - SOCIAL-42
  - SOCIAL-51
  - SHARE-07
---

# Phase 3 Plan 07: Duel OG Card + Duels Tab + Distribution Badges Summary

**Duel Settled OG card variant 3 at /og/duel/[challengeId] (§16.4: Node runtime, flexbox-only, D-11 STUB CONTRACT) + Duels tab with Active/Trending/Recently-settled sections, ⚔ OPEN badge, TRENDING DUEL pin, and Duel King badge placeholder in the feed.**

## Accomplishments

- **OG duel route** (`/og/duel/[challengeId]/route.ts`): `export const runtime = 'nodejs'` is the first line; zero `display: 'grid'` anywhere (Pitfall 15); full §16.4 two-column flexbox layout — CALLER column (180px circle, 3px `#E8F542`, Syne 32px handle) | 24px VS divider (1px `#2E2E42`) | CHALLENGER column (180px circle, 3px `#FB923C`, opacity 1.0); `X-Variant: duel-active` header; `renderFallback()` on any error path (SHARE-10 — never 500); CHALLENGE_ESCROW from `@call-it/shared` (no inline hex); zero-address guard serves graceful placeholder card when CE not yet deployed; `Cache-Control: public, max-age=60, stale-while-revalidate=300`

- **D-11 STUB CONTRACT**: both columns full opacity (1.0), "VS" not "WINS" (Syne 64px `#64748B`), caller handle neutral `#F1F5F9` not `#E8F542`, rep deltas render "? REP" in `#94A3B8` — all Phase 4 activation points documented inline

- **Duels tab** (fourth tab in feed): "⚔ Duels" tab label; filter chips (All / Active / Just settled / High-stakes / Trending) with neobrutalist chip style (`#E8F542` border+bg selected, `0px` radius); Trending section pinned above Active with "TRENDING DUEL" pill badge; Active section with caller/challenger row layout + 4px consensus bar; "RECENTLY SETTLED (7D)" section renders D-08 placeholder text inert until Phase 4

- **⚔ OPEN badge**: inline pill on CallCards where `openToChallenges == true`; 2px `#E8F542` border, `#0D1A00` bg; ⚔ Challengeable filter chip on Live tab shows only open-to-challenge calls

- **TRENDING DUEL pin**: promoted highest-qualifying trending duel to top of Live tab with upgraded 3px `#E8F542` border + `4px 4px 0 #E8F542` hard shadow

- **Duel King badge**: renders only when `duel_kings` table has a row (Phase 3 = no render — correct per D-11); `DuelKingBadge` component ready for Phase 4 activation

- **ChallengeFormModal reuse** (Known Plan Issue #4): imported from `@/app/components/ChallengeFormModal` in the Duels-tab challenge flow, not duplicated

## Task Commits

Each task committed atomically:

1. **Task 1: OG duel card variant 3** — `b179555` (feat)
2. **Task 2: Duels tab + ⚔ OPEN badge + Duel King badge + TRENDING DUEL pin** — `8a7d392` (feat)

## Files Created/Modified

- `apps/web/app/og/duel/[challengeId]/route.ts` — OG card variant 3: Node runtime, flexbox-only §16.4 layout, D-11 stubs, renderFallback, zero-address guard
- `apps/web/app/page.tsx` — Duels tab (fourth), filter chips, Trending/Active/Recently-settled sections, ⚔ OPEN badge, Duel King badge, TRENDING DUEL pin, ChallengeFormModal mount

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] FeedItem type incompatibility in LiveFeedList**
- **Found during:** Task 2 TypeScript build check
- **Issue:** `LiveFeedItem` interface with `[key: string]: unknown` index signature is not assignable from `FeedItem` (which lacks the index signature). TypeScript error on `items` prop.
- **Fix:** Replaced `LiveFeedItem` with `ExtendedFeedItem = FeedItem & { openToChallenges?: boolean; callId?: string | number }` intersection type; `LiveFeedListProps.items` now typed as `FeedItem[]`; internal cast via `rawItem as ExtendedFeedItem`
- **Files modified:** `apps/web/app/page.tsx`
- **Committed in:** `8a7d392`

**2. [Rule 1 - Bug] Wrong import path for ChallengeFormModal**
- **Found during:** Task 2 first build attempt
- **Issue:** Import `@/components/ChallengeFormModal` resolves to `apps/web/components/` (which is the Phase 1/2 components directory). The file is at `apps/web/app/components/ChallengeFormModal.tsx`.
- **Fix:** Changed import to `@/app/components/ChallengeFormModal` (correct path via tsconfig `@/*: [./*]` alias)
- **Files modified:** `apps/web/app/page.tsx`
- **Committed in:** `8a7d392`

---

**Total deviations:** 2 auto-fixed (TypeScript type incompatibility + wrong import path). No architectural deviations. No plan scope changes.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `settled = false` always | `apps/web/app/og/duel/[challengeId]/route.ts` line ~547 | Phase 4 wires `challenge.winner !== ZERO_ADDRESS` check to activate settled variant |
| `assetPair: ''` in OG card | `apps/web/app/og/duel/[challengeId]/route.ts` line ~554 | On-chain Challenge struct has no asset pair; requires subgraph lookup (Phase 7) |
| `callQuestion: 'Duel #N'` | `apps/web/app/og/duel/[challengeId]/route.ts` line ~555 | Market statement in IPFS/subgraph only (Phase 7 OG finalization mirrors /og/[callId] pattern) |
| `callerHandle/callerStake=0n` in ChallengeFormModal mount | `apps/web/app/page.tsx` line ~880+ | FeedItem lacks callerStake; Phase 4 will extend relayer FeedItem with challenge-prefill data |
| RECENTLY SETTLED (7D) placeholder | `apps/web/app/page.tsx` DuelsTab | D-08: inert until Phase 4 settlement worker populates the table |
| Duel King badge no-render | `apps/web/app/page.tsx` | D-11: badge absent is correct Phase 3 behavior; duel_kings table empty until first settled duel |

## Threat Surface Scan

No new network endpoints outside the plan's threat model. The `/og/duel/[challengeId]` route follows the exact same trust boundary as `/og/[callId]` (plan 02-09 T-02-09-01 pattern). Confirmed:
- `ARBITRUM_SEPOLIA_RPC_URL` server-side only (no `NEXT_PUBLIC_` prefix) — T-3-07-06
- `renderFallback()` on all error paths — T-3-07-02
- No raw wallet addresses rendered in any badge — AUTH-44

## Self-Check: PASSED

- [x] `apps/web/app/og/duel/[challengeId]/route.ts` exists on disk
- [x] `apps/web/app/page.tsx` modified (Duels tab + badges)
- [x] `head -1 apps/web/app/og/duel/[challengeId]/route.ts` = `export const runtime = 'nodejs';`
- [x] `grep -c "display: 'grid'" apps/web/app/og/duel/[challengeId]/route.ts` = 0 (no actual grid styles; comments excluded)
- [x] `grep -c "duel-active" apps/web/app/og/duel/[challengeId]/route.ts` = 4 (≥1)
- [x] `grep -c "TRENDING DUEL" apps/web/app/page.tsx` = 5 (≥2)
- [x] `grep -c "openToChallenges\|OPEN" apps/web/app/page.tsx` = 18 (≥1)
- [x] `grep -c "DUEL KING\|duelKing" apps/web/app/page.tsx` = 21 (≥1)
- [x] `pnpm --filter @call-it/web build` exits 0 — PASS
- [x] Commits `b179555` and `8a7d392` exist in git log
