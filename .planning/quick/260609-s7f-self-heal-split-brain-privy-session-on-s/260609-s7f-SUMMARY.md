---
phase: quick-260609-s7f
plan: 01
subsystem: web-auth
tags: [privy, signin, session-recovery, cookies]
requires:
  - "@privy-io/react-auth usePrivy().logout"
provides:
  - "Self-healing post-auth effect on /signin that recovers split-brain Privy sessions"
affects:
  - "apps/web/app/signin/SignInButtons.tsx"
tech-stack:
  added: []
  patterns:
    - "Split-brain session recovery: cookie clear (Max-Age=0) + Privy logout() on null/throwing access token"
key-files:
  created: []
  modified:
    - "apps/web/app/signin/SignInButtons.tsx"
decisions:
  - "Keep happy path byte-identical; only add a recovery else-branch + logout dep"
  - "logout() never triggers login(); after logout authenticated flips false and the effect early-returns — no loop"
metrics:
  duration: "~3m"
  completed: "2026-06-09"
  tasks: 1
  files: 1
requirements: [AUTH-01, AUTH-36]
---

# Phase quick-260609-s7f Plan 01: Self-heal split-brain Privy session on /signin Summary

Made `/signin` self-heal a stale / split-brain Privy session: when Privy reports `authenticated===true` from a leftover localStorage session but `getAccessToken()` returns `null` or throws, the post-auth effect now clears the `privy-token` cookie (`Max-Age=0`) and calls `await logout()`, recovering the user to a clean signed-out `/signin` instead of stranding them. The healthy-login path is byte-identical to before.

## What Was Done

Two surgical edits to `apps/web/app/signin/SignInButtons.tsx`:

1. **Destructure (line 99):** added `logout` to `usePrivy()` →
   `const { ready, authenticated, login, getAccessToken, logout } = usePrivy();`
2. **Post-auth `useEffect` (lines ~114–153):** replaced with the self-heal version.
   - `getAccessToken()` is now read into a `let token` inside try/catch (catch sets `token = null` and falls through, instead of bailing out of the whole effect).
   - **Happy path unchanged:** `token` present → set `privy-token` cookie `Max-Age=3600` (`; Secure` on https) → `router.push('/')`.
   - **New recovery branch:** `token` falsy → clear cookie with `Max-Age=0` (`; Secure` on https) → `await logout()` (wrapped in try/catch so a failed logout leaves the user on `/signin` rather than looping).
   - Dependency array now `[authenticated, getAccessToken, logout, router]`.

No other code in the file was touched (readiness-timeout hook, icon components, handlers, and JSX are untouched).

## Verification

- **Build gate:** `pnpm --filter @call-it/web build` exits 0 (TypeScript finished, 3/3 static pages generated, all routes compiled).
- **Destructure gate:** grep line 99 → `logout` present in the `usePrivy()` destructure.
- **Recovery gate:** grep line 142 → `privy-token=; path=/; SameSite=Lax; Max-Age=0`; grep line 144 → `await logout();`.
- **Happy-path-unchanged gate:** grep line 131 → `Max-Age=3600`; grep line 132 → `router.push('/')`.
- **Deps gate:** grep line 153 → `}, [authenticated, getAccessToken, logout, router]);`.
- **Staging gate:** `git status --porcelain` showed only `M  apps/web/app/signin/SignInButtons.tsx` staged (index column); the background-soak's unrelated working-tree files (`.gitignore`, `config.json`, evidence/soak scripts, etc.) remained unstaged. Staged via explicit `git add apps/web/app/signin/SignInButtons.tsx` — never `-A`/`.`/`-u`.
- **Loop-safety (reasoned, not a runtime test):** after `await logout()`, Privy flips `authenticated` to false → the effect re-runs and early-returns at `if (!authenticated) return;`. `logout()` does not call `login()`. Runtime recovery is hard to stage in CI (no headless browser E2E for the Privy OAuth/localStorage path); correctness is validated by the logic + the passing build.

## Deviations from Plan

None — plan executed exactly as written. Happy path is byte-identical; only the recovery branch and `logout` dependency were added.

## Out of Scope / Known Residual

- **token-valid-but-relayer-401 loop:** the separate failure mode where `getAccessToken()` returns a valid token but the relayer rejects it with 401 (middleware then bounces back to `/signin`) is explicitly NOT addressed here. This effect only heals the split-brain case (no token at all). The 401 loop is a distinct issue to be handled separately.
- **Runtime recovery not staged in CI:** browser E2E for the Privy session lifecycle is skipped in CI, so the recovery branch's runtime behavior was validated by logic review + the passing production build rather than an automated end-to-end test.

## Commits

- `360effb` fix(quick-260609-s7f): self-heal split-brain Privy session on /signin

## Self-Check: PASSED

- File exists: `apps/web/app/signin/SignInButtons.tsx` — FOUND
- Commit exists: `360effb` — FOUND
