---
phase: quick-260610-f6s
plan: 01
subsystem: web-onboarding
tags: [farcaster, auth-kit, social-link, onboarding, ui]
requires:
  - "@farcaster/auth-kit@0.8.2 (QRCode export + useSignIn url/isPolling/timeout)"
provides:
  - "Full-width on-brand linked-state indicators (Twitter w/ @handle + Farcaster)"
  - "Real Warpcast connect flow (desktop QR / mobile redirect) with timeout + inline error"
affects:
  - apps/web/app/components/SocialLinkControls.tsx
tech-stack:
  added: []
  patterns:
    - "useSignIn({ timeout: 300_000 }) destructuring url/isPolling to surface the relay channel"
    - "QRCode top-level export from @farcaster/auth-kit (no provider, no new dependency)"
key-files:
  created: []
  modified:
    - apps/web/app/components/SocialLinkControls.tsx
decisions:
  - "Map Twitter StatusLine 'ok'→'idle' to suppress the duplicate 'Linked.' line (new indicator conveys it)"
  - "Used `type CSSProperties` import rather than the React namespace (file imports named-only from 'react')"
metrics:
  duration: "~3m"
  completed: "2026-06-10"
---

# Quick 260610-f6s: Improve Connect-Socials Linked State + Fix Farcaster Hang Summary

Replaced the two tiny linked-state pills with full-width on-brand "✓ … linked" indicators (Twitter shows the X @handle) and fixed the "Link Farcaster" button — which hung forever on "Connecting…" — by wiring the real Auth Kit Warpcast flow (desktop QR / mobile redirect) with a 5-minute timeout and a graceful inline error, all inside a single file with an additive-only guarantee.

## What Was Built

**Task 1 — Full-width linked indicators (Change A):**
- Derived the Twitter username inside the component using the canonical `handle/page.tsx` pattern (`linkedAccounts.find(a => a.type === 'twitter_oauth')` cast to `{ username?: string }`), computing `✓ @<username> linked` / `✓ X linked`.
- Replaced `<Tag intent="success" data-testid="twitter-linked-tag">X Linked</Tag>` and the Farcaster `FC Linked` tag with full-width (`flex: 1`) bordered brand-green (`#22C55E`) indicator divs, keeping both `data-testid`s and the settings-mode Unlink buttons unchanged.
- Suppressed the duplicate Twitter "Linked." line by passing `status={twStatus === 'ok' ? 'idle' : twStatus}` to the Twitter `StatusLine` (pending/error still surface). The `StatusLine` component contract itself was untouched.
- Removed the now-unused `Tag` import (kept `Button`).

**Task 2 — Real Warpcast connect flow + timeout + inline error (Change B, the bug fix):**
- Added `QRCode` to the `@farcaster/auth-kit` import.
- Changed `useSignIn({...})` to destructure `{ signIn, connect, url, isPolling }` and added `timeout: 300_000` to the args (so the channel errors via the existing `onError` after 5 min instead of hanging). Existing `onSuccess`/`onError` left exactly as-is. (Used the minimal `{ signIn, connect, url, isPolling }` destructure to avoid no-unused-vars under the strict tsconfig.)
- Made `handleLinkFarcaster` an async callback: `await connect()` (so `url` is ready) then `signIn()`, inside try/catch — never rethrows; on throw sets a friendly `fcError` + `fcStatus='error'`. The onClick wrapper calls `() => { void handleLinkFarcaster(); }`.
- Added the connect panel that short-circuits the "Link Farcaster" button when `fcStatus === 'pending' && url && !isFarcasterLinked`:
  - **Desktop:** `<QRCode uri={url} size={176} />`, caption, an `Open link` anchor with `rel="noopener noreferrer"`, a "Waiting for approval…" line while `isPolling`, and a Cancel that does `setFcStatus('idle')`. `data-testid="farcaster-qr-panel"`.
  - **Mobile:** full-width "Open in Warpcast" primary that sets `window.location.href = url`, caption, the `isPolling` waiting line, and the same Cancel. `data-testid="farcaster-open-warpcast"`.
  - While `pending` but `url` not yet ready, the existing button keeps showing "Connecting…".
- On error/timeout the existing Farcaster `StatusLine` shows `fcError` inline and the default `link-farcaster-button` returns for retry.

**Task 3 — Typecheck-gated atomic single-file commit:** see Verification below.

## Verification

- **Typecheck:** `pnpm --filter @call-it/web exec tsc --noEmit` → **NO errors referencing SocialLinkControls.tsx**. The only 3 errors in the project are pre-existing and reference farcaster *test files* (`tests/farcaster-embed.test.ts` ×2, `tests/farcaster-manifest.test.ts` ×1) — explicitly acceptable per the plan.
- **QRCode import resolves** from `@farcaster/auth-kit` (confirmed exported in the installed 0.8.2 dist types: `export declare function QRCode({ ecl, size, uri }: Props)`; `useSignIn` returns `url`/`isPolling` and accepts `timeout`).
- **Staging (`git status --porcelain` before commit):** exactly one entry — `M  apps/web/app/components/SocialLinkControls.tsx`. All unrelated background-soak files (evidence/, scripts, docs, .gitignore) remained UNstaged.
- **Commit:** `1bc4e55` on `master` — `1 file changed, 123 insertions(+), 16 deletions(-)`; HEAD contains exactly `apps/web/app/components/SocialLinkControls.tsx`; no file deletions; commit message ends with the `Co-Authored-By: Claude Opus 4.8 (1M context)` trailer. **Not pushed.** ROADMAP.md untouched.

## LIVE-OPS Caveat

Completing a REAL Farcaster link end-to-end is **NOT headlessly verifiable** and is operator/human-verified, not part of this automated verification. It requires (1) the relayer up with `FARCASTER_AUTH_DOMAIN` matching the live web domain (`call-it-web-sepolia.vercel.app`), and (2) a human scanning the QR with the Warpcast app on a phone. This fix delivers the **client-side QR/redirect flow plus a graceful inline error/timeout** — i.e. no more silent hang on "Connecting…". The full successful-link handshake remains an operator/human step.

## Deviations from Plan

None — plan executed as written. Minor implementation choice (within the plan's allowances): used the minimal `{ signIn, connect, url, isPolling }` destructure (the plan explicitly permitted omitting `isError`/`channelToken`/`error` if they lint under the strict tsconfig), and used `type CSSProperties` from `'react'` for the shared indicator style since the file imports named-only from `'react'` (no `React` namespace in scope).

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: apps/web/app/components/SocialLinkControls.tsx
- FOUND: commit 1bc4e55 (HEAD on master, single file)
