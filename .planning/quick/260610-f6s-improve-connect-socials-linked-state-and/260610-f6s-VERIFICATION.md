---
phase: quick-260610-f6s
verified: 2026-06-10T00:00:00Z
status: human_needed
score: 8/8 must-haves verified
overrides_applied: 0
human_verification:
  - test: "On the live Sepolia web domain with the relayer up (FARCASTER_AUTH_DOMAIN matching the web host), open CONNECT SOCIALS, click 'Link Farcaster', and complete the SIWF handshake by scanning the QR with the Warpcast app on a phone."
    expected: "The QR/redirect panel appears (no infinite 'Connecting…'); after approval in Warpcast the page transitions to the full-width '✓ Farcaster linked' indicator. On a real timeout (300s) or cancel, an inline error / idle-reset shows instead of a hang."
    why_human: "A real end-to-end Farcaster link cannot be exercised headlessly — it requires (1) the relayer up with FARCASTER_AUTH_DOMAIN matching the live web domain and (2) a human scanning the QR with the Warpcast app. Per the plan's LIVE-OPS caveat, only the client QR/redirect flow + graceful inline error is automatable; the successful-link handshake is operator/human-verified."
---

# Quick Task quick-260610-f6s Verification Report

**Task Goal:** Improve the CONNECT SOCIALS onboarding screen — (A) full-width on-brand linked indicator showing the X username (replacing the tiny "X Linked" pill), and (B) FIX the Farcaster "Link Farcaster" button that hung forever on "Connecting…" by surfacing the Warpcast connect-URL (QRCode desktop / redirect mobile), adding a timeout, and showing inline errors instead of hanging. Single file: `apps/web/app/components/SocialLinkControls.tsx`. Committed as `1bc4e55`.
**Verified:** 2026-06-10
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Twitter linked → full-width '✓ @<username> linked' (or '✓ X linked') indicator, not a pill | ✓ VERIFIED | Lines 305-309 derive `twitterUsername` from `linkedAccounts` (`type === 'twitter_oauth'` cast `{ username?: string }`) and compute `twitterLinkedLabel`. Lines 339-341 render it inside a `flex: 1` full-width `<div data-testid="twitter-linked-tag" style={linkedIndicatorStyle}>` (style at 312-326). The old `<Tag intent="success">X Linked</Tag>` is removed (diff line 84-86). |
| 2 | Farcaster linked → full-width '✓ Farcaster linked' indicator, not a pill | ✓ VERIFIED | Lines 384-386: `<div data-testid="farcaster-linked-tag" style={linkedIndicatorStyle}>✓ Farcaster linked</div>`. Old `<Tag>FC Linked</Tag>` removed (diff line 112-114). |
| 3 | 'Linked' shown only once for Twitter — StatusLine 'ok' suppressed | ✓ VERIFIED | Line 373: `status={twStatus === 'ok' ? 'idle' : twStatus}` passed to the Twitter StatusLine — 'ok'→'idle' suppresses the duplicate "Linked." while pending/error stay inline. |
| 4 | 'Link Farcaster' opens a real Warpcast flow (QR desktop / redirect mobile) — never hangs forever | ✓ VERIFIED | Line 40 imports `QRCode`; line 213 destructures `url, isPolling`. Connect panel renders when `fcStatus === 'pending' && url && !isFarcasterLinked` (line 402): desktop `<QRCode uri={url} size={176} />` (438) + "Open link" anchor (442-449); mobile "Open in Warpcast" → `window.location.href = url` (426). While `url` not yet ready the button keeps its "Connecting…" label (475-488), so the panel only replaces it once the channel `url` exists. |
| 5 | Timeout (300_000) / error → inline error + retry, no silent hang | ✓ VERIFIED | Line 214: `timeout: 300_000` in `useSignIn` args. `onError` (225-228) sets `fcError` + `fcStatus='error'`. StatusLine (490) renders `fcError`; on error the default "Link Farcaster" button (data-testid `link-farcaster-button`, 483) returns for retry. |
| 6 | Cancel control resets the Farcaster panel to idle | ✓ VERIFIED | Lines 455-473: `<button data-testid="farcaster-cancel" onClick={() => { setFcStatus('idle'); }}>Cancel</button>`. |
| 7 | Every Farcaster call best-effort — never throws into the page (additive guarantee) | ✓ VERIFIED | `handleLinkFarcaster` (231-243) wraps `await connect(); signIn();` in try/catch and only `setFcError`/`setFcStatus('error')` on throw — never rethrows. `onClick` wraps it as `() => { void handleLinkFarcaster(); }` (479-481). `postFarcasterLink` (174-211) is also fully try/catch-guarded. |
| 8 | Twitter/X link+unlink, sign-in, postTwitterLink, unlink handlers, Providers.tsx untouched | ✓ VERIFIED | `git diff 1bc4e55~1 1bc4e55` shows no `+`/`-` lines mutating `handleLinkTwitter`, `postTwitterLink`, `handleUnlinkTwitter`, `handleUnlinkFarcaster`, `postFarcasterLink`, or `linkTwitter` logic. `git diff` on `apps/web/app/Providers.tsx` is empty; the commit touches exactly 1 file (`git show --stat`). |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/web/app/components/SocialLinkControls.tsx` | Full-width linked indicators + real Warpcast QR/redirect connect flow with timeout + inline error; contains `QRCode` | ✓ VERIFIED | File exists, 494 lines, substantive. Contains `QRCode` (imported line 40, rendered line 438). Wired: imported from `@farcaster/auth-kit`, used in JSX. `tsc --noEmit` produces no errors referencing this file. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| SocialLinkControls.tsx | `@farcaster/auth-kit` | `import { useSignIn, QRCode }` + `url`/`isPolling`/`timeout` destructure | ✓ WIRED | Line 40 import; line 213-214 `const { signIn, connect, url, isPolling } = useSignIn({ timeout: 300_000, ... })`. Installed `@farcaster/auth-kit@0.8.2` exports `QRCode` (dist `auth-kit.d.ts:47`), and `useSignIn` returns `url`/`isPolling` and accepts `timeout` (lines 106/110/117). |
| handleLinkFarcaster | `connect` + `signIn` | `await connect()` then `signIn()` in try/catch | ✓ WIRED | Lines 237-238 inside try block; never rethrows (catch at 239-242). deps `[connect, signIn]` (243). |
| SocialLinkControls | `linkedAccounts twitter_oauth.username` | `find((a) => a.type === 'twitter_oauth') as { username?: string }` | ✓ WIRED | Lines 305-308. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| File typechecks with no new errors | `pnpm --filter @call-it/web exec tsc --noEmit \| grep SocialLinkControls` | no matching lines | ✓ PASS |
| `QRCode` export resolves in installed package | grep `auth-kit@0.8.2/dist/auth-kit.d.ts` | `export declare function QRCode(...)` at line 47 | ✓ PASS |
| Commit `1bc4e55` is single-file, correct trailer | `git show --stat 1bc4e55` | 1 file changed (SocialLinkControls.tsx), Co-Authored-By trailer present | ✓ PASS |
| Providers.tsx unchanged in commit | `git diff 1bc4e55~1 1bc4e55 -- apps/web/app/Providers.tsx` | empty | ✓ PASS |
| Live end-to-end Farcaster link handshake | — (requires relayer + Warpcast phone scan) | — | ? SKIP → human |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AUTH-07 | 260610-f6s-PLAN.md | Farcaster link flow | ✓ SATISFIED (client) | Real Warpcast QR/redirect connect flow wired with timeout + graceful inline error. Full end-to-end link handshake routed to human verification per LIVE-OPS caveat. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None | — | No TODO/FIXME/XXX/HACK/PLACEHOLDER/stub markers in the modified file. |

### Human Verification Required

**1. Real end-to-end Farcaster link (LIVE-OPS)**

- **Test:** On the live Sepolia web domain with the relayer up (FARCASTER_AUTH_DOMAIN matching the web host), open CONNECT SOCIALS, click "Link Farcaster", and complete the SIWF handshake by scanning the QR with the Warpcast app on a phone.
- **Expected:** The QR/redirect panel appears (no infinite "Connecting…"); after approval in Warpcast the page transitions to the full-width "✓ Farcaster linked" indicator. On a real timeout (300s) or cancel, an inline error / idle-reset shows instead of a hang.
- **Why human:** Cannot be exercised headlessly — requires the relayer up with FARCASTER_AUTH_DOMAIN matching the live web domain AND a human scanning the QR with the Warpcast app. The automated deliverable (client QR/redirect flow + graceful inline error, no silent hang) is fully verified in code above.

### Gaps Summary

No gaps. All 8 observable truths are verified against commit `1bc4e55`; the single required artifact exists, is substantive, and is correctly wired; the `@farcaster/auth-kit` API surface (`QRCode`, `url`, `isPolling`, `timeout`) is confirmed in the installed `0.8.2` package; the file typechecks cleanly; and scope discipline holds (Twitter/X + unlink handlers and Providers.tsx untouched, single-file commit with correct trailer). Status is `human_needed` solely because of the plan's explicit LIVE-OPS caveat: the successful real-Warpcast-link handshake requires a live relayer + a phone scan and is operator/human-verified — it is NOT a code gap.

---

_Verified: 2026-06-10_
_Verifier: Claude (gsd-verifier)_
