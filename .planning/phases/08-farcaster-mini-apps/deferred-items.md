# Phase 08 — Deferred Items (out-of-scope discoveries)

Logged per the executor SCOPE BOUNDARY rule: discovered during a plan but caused by
files NOT touched by that plan. NOT fixed here.

## From 08-03 (Frame tx wire)

- **Pre-existing `tsc --noEmit` errors in two Plan-01 Wave-0 scaffolds** (commit `a50fef5`):
  - `tests/farcaster-embed.test.ts(56)` — calls `generateMetadata({ params })` but the
    Plan-02 `layout.tsx` `Props` type requires `children`; the test omits it (TS2345).
  - `tests/farcaster-manifest.test.ts(24,27)` — `app/.well-known/farcaster.json/route.ts`
    not in the tsconfig file list (TS6307) + `route(arg)` called with 1 arg where the
    handler takes 0 (TS2554).
  - Both are Plan-01/02 scaffold typing issues, NOT caused by 08-03 (which only added
    `lib/abis/ChallengeEscrow.ts`, the barrel export, the Frame tx route, and edits to
    `tests/frame-tx.test.ts`). The `frame-tx.test.ts` typecheck is clean after 08-03.
  - Suggested owner: a Plan-02 follow-up or a typecheck-hygiene quick task.
