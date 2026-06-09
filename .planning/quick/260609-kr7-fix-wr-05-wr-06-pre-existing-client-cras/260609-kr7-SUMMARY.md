---
phase: quick-260609-kr7
plan: 01
subsystem: web
tags: [nextjs, viem-ens, filereader, dispute-evidence, client-crash-fix]
requires:
  - phase: 09-mobile-responsive
    provides: 09-REVIEW.md findings WR-05, WR-06
provides:
  - try/catch-guarded ENS normalize on the onboarding Handle screen (WR-05)
  - FileReader.readAsDataURL evidence encode + 5 MB size guard on dispute upload (WR-06)
affects: [onboarding-handle-flow, dispute-evidence-upload]
key-files:
  modified:
    - apps/web/app/onboarding/handle/page.tsx
    - apps/web/app/call/[id]/page.tsx
decisions:
  - "normalizedEns fallback chain: normalize(ensName) → raw ensName (catch) → Twitter → 'you.eth'"
  - "MAX_EVIDENCE_BYTES = 5 * 1024 * 1024 (5 MB) defined inside DisputeModal next to handleEvidenceUpload"
metrics:
  duration: 4min
  completed: 2026-06-09
requirements: [AUTH-19, AUTH-20, SETTLE-26]
---

# Quick Task 260609-kr7: Fix WR-05 / WR-06 Pre-existing Client Crashes Summary

Hardened two device-independent client crash paths from the Phase-9 code review: a UTS-46 `normalize()` throw on a malformed ENS reverse record during the onboarding Handle render (WR-05), and a `btoa(String.fromCharCode(...spread))` stack overflow on dispute-evidence upload (WR-06), plus a 5 MB pre-upload size guard.

## Tasks Completed

### Task 1 — WR-05: guard ENS normalize() on the Handle screen
`apps/web/app/onboarding/handle/page.tsx` — Replaced the inline `ensName ? normalize(ensName) : …` ternary with a `string | null` `normalizedEns` computed inside a try/catch: `normalize(ensName)` in `try`, raw `ensName` in `catch` (only when truthy), else `null`. `defaultHandle = normalizedEns ?? (twitterUsername ? '@'+twitterUsername : 'you.eth')` preserves the existing ENS → Twitter → placeholder ordering. The `useEnsName` hook, the seeding `useEffect`, the `normalize` import, and all other code are unchanged.

### Task 2 — WR-06: FileReader encode + 5 MB guard
`apps/web/app/call/[id]/page.tsx`:
1. In `handleEvidenceUpload`, replaced `file.arrayBuffer()` + `btoa(String.fromCharCode(...new Uint8Array(content)))` with a `new Promise<string>` wrapping a `FileReader`: `onload` resolves `(reader.result as string).split(',')[1]`, `onerror` rejects, then `reader.readAsDataURL(file)`. POST body shape `{ content: base64, filename, mimeType }`, the try/catch/finally, `setUploadingEvidence`, `setEvidenceCid`, and `setEvidenceHash` are all unchanged.
2. Added `MAX_EVIDENCE_BYTES = 5 * 1024 * 1024` next to the handler. The `<input type="file">` onChange now returns early (no `setEvidenceFile`, no `handleEvidenceUpload`) with `setToast({ text: 'Evidence file too large — max 5 MB', isError: true })` when `file.size` exceeds the cap; only within-limit files proceed.

The approve/raiseDispute handlers, modal layout, and `isMobile` clamp were not touched.

## Task Commits

1. **Task 1 (WR-05):** `289c8a5` — `fix(quick-260609-kr7): guard ENS normalize() on onboarding Handle screen (WR-05)` — 1 file, +12/-5
2. **Task 2 (WR-06):** `03a2011` — `fix(quick-260609-kr7): FileReader evidence encode + 5MB guard on dispute upload (WR-06)` — 1 file, +18/-3

Each commit was staged with an explicit path (`git add <file>`); no soak artifacts or unrelated working-tree files were swept in.

## Verification

- `pnpm --filter @call-it/web build` exits 0 (TypeScript clean, all routes generated).
- WR-05: `normalize(ensName)` is no longer called bare in render — it is inside a try/catch with a raw-name fallback.
- WR-06: no `String.fromCharCode(...` spread remains in `handleEvidenceUpload`; encode goes through `FileReader.readAsDataURL`; the 5 MB guard precedes upload.
- No other 09-REVIEW finding touched. CR-01 and WR-03 (already fixed) left untouched.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] `apps/web/app/onboarding/handle/page.tsx` contains `catch` (try/catch ENS guard)
- [x] `apps/web/app/call/[id]/page.tsx` contains `readAsDataURL`
- [x] Commit `289c8a5` exists in git log
- [x] Commit `03a2011` exists in git log
- [x] `pnpm --filter @call-it/web build` exits 0
- [x] Exactly two files changed, one per atomic commit
