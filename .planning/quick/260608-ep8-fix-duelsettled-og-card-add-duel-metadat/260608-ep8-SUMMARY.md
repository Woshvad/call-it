---
phase: quick-260608-ep8
plan: 01
subsystem: web
tags: [nextjs, app-router, opengraph, twitter-card, og-image, duel, share]
requires:
  - phase: 07
    provides: /og/duel/[challengeId] image route (built; returns 200 image/png)
  - phase: 03
    provides: /api/duels/[id]/live-state relayer endpoint (status string label)
provides:
  - /duel/[challengeId] summary_large_image OG/Twitter card via Server Component generateMetadata
affects: [shared-duel-receipts, social-card-rendering]
tech-stack:
  added: []
  patterns:
    - "Server Component layout.tsx (no 'use client') + 'use client' page.tsx compose for App Router metadata"
    - "Duel status STRING label → ordinal map for the D-09 ?v= cache-buster (relayer returns label, not statusVersion)"
key-files:
  created:
    - apps/web/app/duel/[challengeId]/layout.tsx
  modified: []
decisions:
  - "Mirrored /call/[id]/layout.tsx structure; mapped Proposed=0..Settled=4 since the duel endpoint returns a status string, not a numeric statusVersion"
  - "Generic 'Duel — Call It' title on fetch failure (no marketLine available from the duel endpoint)"
metrics:
  duration: ~6min
  completed: 2026-06-08
---

# Quick Task 260608-ep8: Fix DuelSettled OG Card — Add Duel Metadata Summary

Adds a Server Component `layout.tsx` for `/duel/[challengeId]` that injects a `summary_large_image` OG/Twitter card pointing at the existing `/og/duel/[challengeId]` image route, with a D-09 cache-buster derived from the relayer duel status label — so shared duel receipts render the large-image card instead of a tiny text card.

## Accomplishments

- Created `apps/web/app/duel/[challengeId]/layout.tsx` as a Server Component (no `'use client'`) exporting `generateMetadata` + a pass-through default `DuelLayout`.
- `generateMetadata` emits top-level `title`/`description`, `openGraph` (1200x630 image), and `twitter.card: 'summary_large_image'` with `og:image` + `twitter:image` → `/og/duel/${challengeId}?v=${ordinal}` (SHARE-07, SOCIAL-51).
- `fetchDuelStatusVersion` reads `RELAYER_URL ?? NEXT_PUBLIC_RELAYER_URL`, fetches `/api/duels/${challengeId}/live-state` with `next.revalidate=60`, and maps the STRING status label (Proposed=0, Accepted=1, Rejected=2, Refunded=3, Settled=4) to the D-09 `?v=` ordinal cache-buster.
- Graceful fallback: empty relayer URL / `!res.ok` / any throw → `null` → `v=0` + generic `Duel — Call It` title, still a valid large-image card.
- `/call/[id]` and all `/og/*` routes untouched — only one new file added.

## Task Commits

1. **Task 1: duel-route layout.tsx with summary_large_image OG card + D-09 status cache-buster** — `57a402c` (feat)

## Verification

- **CI-safe gate (automated):** `pnpm --filter @call-it/web build` passes. The build output lists `/duel/[challengeId]` as a server-rendered-on-demand route (picks up the new layout); typecheck + lint clean. No `'use client'` in the new file; async `params` awaited; `Metadata` shape valid.
- **Post-deploy (operator, NOT run here):** `curl -s https://call-it-web-sepolia.vercel.app/duel/<id>` should show `<meta name="twitter:card" content="summary_large_image">` plus `og:image`/`twitter:image` referencing `/og/duel/<id>?v=<ordinal>`. Pre-fix the page showed `content="summary"` and no image meta.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed status-ordinal expression type error**

- **Found during:** Task 1 build gate.
- **Issue:** First implementation used `(data.status && DUEL_STATUS_ORDINALS[data.status]) ?? 0`, which TypeScript widened to `number | ""` (an empty-string `data.status` short-circuits the `&&` to `""`), failing strict typecheck: `Type 'number | "" ' is not assignable to type 'number'`.
- **Fix:** Rewrote as an explicit ternary: `data.status ? DUEL_STATUS_ORDINALS[data.status] ?? 0 : 0`.
- **Files modified:** `apps/web/app/duel/[challengeId]/layout.tsx`
- **Verification:** `pnpm --filter @call-it/web build` passes.
- **Committed in:** `57a402c` (the fix was applied before the single Task 1 commit).

**Total deviations:** 1 auto-fixed (own-code type bug, fixed pre-commit). No scope creep.

## Known Stubs

None. The title intentionally shows `Duel #${challengeId}` (no marketLine) because the duel live-state endpoint does not return a market line; this is documented intent from the plan, not a stub.

## Self-Check: PASSED

- [x] `apps/web/app/duel/[challengeId]/layout.tsx` exists on disk
- [x] Commit `57a402c` exists in git log
- [x] File contains `summary_large_image`, `/og/duel/`, `/api/duels/`, and `generateMetadata`
- [x] No `'use client'` in the new file
- [x] `pnpm --filter @call-it/web build` exits 0

---
*Quick task: 260608-ep8*
*Completed: 2026-06-08*
