---
phase: 09-mobile-responsive-on-7-critical-pages
reviewed: 2026-06-09T00:00:00Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - apps/web/app/call/[id]/page.tsx
  - apps/web/app/components/ChallengeFormModal.tsx
  - apps/web/app/components/DesktopOnlyBanner.tsx
  - apps/web/app/components/GlobalNav.tsx
  - apps/web/app/components/MobileDrawer.tsx
  - apps/web/app/components/SocialLinkControls.tsx
  - apps/web/app/duel/[challengeId]/page.tsx
  - apps/web/app/hooks/useIsMobile.ts
  - apps/web/app/leaderboard/LeaderboardClient.tsx
  - apps/web/app/new/page.tsx
  - apps/web/app/onboarding/follow-graph/page.tsx
  - apps/web/app/onboarding/fund/page.tsx
  - apps/web/app/onboarding/handle/page.tsx
  - apps/web/app/onboarding/layout.tsx
  - apps/web/app/onboarding/socials/page.tsx
  - apps/web/app/page.tsx
  - apps/web/app/profile/[address]/ProfileClient.tsx
  - apps/web/app/signin/page.tsx
  - apps/web/components/PrivyFundButton.tsx
  - apps/web/components/ProfileTabs.tsx
  - apps/web/tests/responsive.spec.ts
  - packages/ui/src/compound/CallerExitModal.tsx
  - packages/ui/src/compound/FollowFadeModal.tsx
  - packages/ui/src/compound/PositionExitModal.tsx
findings:
  critical: 1
  warning: 7
  info: 6
  total: 14
status: issues_found
---

# Phase 9: Code Review Report

**Reviewed:** 2026-06-09
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

Phase 9 is a mobile-responsive retrofit. The bulk of the work is `useIsMobile()`-gated style switches, single-column stacking, ≥44px touch targets, a hamburger `MobileDrawer`, a `DesktopOnlyBanner`, and viewport clamps on modals. The core responsive primitives are solid: `useIsMobile.ts` is correctly SSR-safe (server snapshot `true`, `addEventListener('change')`, no deprecated `addListener`, no `window`-seeded `useState`), the `packages/ui` modals stay flexbox-only and free of `matchMedia` (Pitfall 2 respected), and the `MobileDrawer` auth-gates Profile/New Call/Sign-out behind `authenticated && ready` (D-06 honored).

However, the duel page ships **two competing "best viewed on desktop" banners** — the new `DesktopOnlyBanner` component AND a leftover CSS `@media` banner — which is a real behavioral regression (double banner on mobile, and the legacy one is sticky-free duplicate copy). The `DesktopOnlyBanner` is also rendered twice within the same duel render tree. There are several correctness concerns in non-layout code that was touched/co-located (a stale-closure `publishStep` read on `/new`, a slippage-retry path that never refreshes reserves), and a Profile-link gating gap in the drawer where authenticated OAuth users with no `wagmi` address get no Profile entry point.

No introduced `display:grid`, no `matchMedia`/`useIsMobile` leak into `packages/ui`, and no React Rules-of-Hooks violations were found (every `useIsMobile()` call is unconditional at the top of its component).

## Critical Issues

### CR-01: Duel page renders two conflicting "best viewed on desktop" banners

**File:** `apps/web/app/duel/[challengeId]/page.tsx:33, 488, 514, 537-561`
**Issue:** The page imports and mounts the new `DesktopOnlyBanner` (line 33 import; rendered at line 488 in the loading skeleton AND again at line 514 in the main render) but ALSO still contains the legacy hardcoded CSS `@media (max-width: 768px)` `.mobile-banner` block (lines 537–561). On a mobile viewport both fire: the user sees the dismissible `DesktopOnlyBanner` ("Best viewed on desktop … Use the menu to navigate away.") stacked with the non-dismissible legacy banner ("BEST VIEWED ON DESKTOP · Some features may not work on mobile."). This is duplicated, contradictory UI and a behavioral regression versus the single-banner contract (UI-50 / D-08).

Separately, `DesktopOnlyBanner` itself is mounted twice in the same component tree (skeleton branch at 488 + main branch at 514). Because each instance owns its own `dismissed` state, after the loading skeleton swaps to the main render the user is shown a *fresh, undismissed* banner even if they dismissed it during loading — and if loading resolves while the skeleton banner is visible, two banners can momentarily coexist.

**Fix:** Delete the legacy CSS banner block entirely and mount `DesktopOnlyBanner` exactly once. Render it above the page frame outside the `loading` branch so a single instance persists across the skeleton→content transition:
```tsx
// remove lines 537-561 (the .mobile-banner div + <style> @media block)
// and the <DesktopOnlyBanner /> at line 488 inside the loading skeleton.

return (
  <div style={{ backgroundColor: '#09090E', minHeight: '100vh', padding: '0' }}>
    <DesktopOnlyBanner />
    {loading && !liveState ? (
      <div /* skeleton, no banner here */ />
    ) : (
      /* ...main content... */
    )}
  </div>
);
```

## Warnings

### WR-01: `onConfirmPublish` reads `publishStep` from a stale closure — quote-success screen may never show

**File:** `apps/web/app/new/page.tsx:100-110`
**Issue:** `onConfirmPublish` does `await publish(values)` then immediately checks `if (isQuoteMode && publishStep === 'success')`. `publishStep` is the value captured when the `useCallback` was created; `publish()` updating the hook's internal step triggers a re-render but does **not** mutate the `publishStep` const already closed over in this invocation. So the equality check reads the *pre-publish* step (almost always not `'success'`), and `setQuotePosted(...)` likely never runs — the UI-28 quote-success screen silently never appears even on a successful quote. (`publishStep` is also in the dependency array, which keeps the closure fresh across renders but does not help *within* the single async invocation that already started.)
**Fix:** Have `publish()` return a result/status and branch on the return value, or read the step from a ref. For example:
```tsx
const onConfirmPublish = useCallback(async () => {
  const values = form.getValues();
  const result = await publish(values); // make publish resolve { status }
  setIsModalOpen(false);
  if (isQuoteMode && result?.status === 'success') {
    setQuotePosted({ quoteCallId: quoteId ?? '' });
  }
}, [form, publish, isQuoteMode, quoteId]);
```

### WR-02: FollowFadeModal slippage "Retry" never refreshes reserves, so retry resubmits the same stale `minSharesOut`

**File:** `packages/ui/src/compound/FollowFadeModal.tsx:135-159`
**Issue:** On `SlippageExceeded` (D-10) the handler sets `slippageHit`, shows "Updated estimate shown below," and clears all `refreshed*` overrides to `null` (lines 143–146). But clearing the overrides makes `effective*` fall back to the *original* props passed at open time — it does not pull fresh reserves. `handleReset` (156–159) only clears `error`/`slippageHit`; it does not refetch either. Unless the parent happens to push new props via its 5s poll between the revert and the user tapping "Retry," the recomputed `minSharesOut` is identical to the one that just reverted, so Retry reverts again. The comment acknowledges "we trigger a visual refresh by clearing our overrides," but there is no mechanism that actually delivers newer reserves into this component synchronously.
**Fix:** Lift reserve re-reads to the parent and pass a `onRefreshReserves` callback the modal can `await` before recomputing, or accept that retry depends on the parent poll and gate the Retry button on a "reserves updated since revert" timestamp. At minimum, document that Retry is only meaningful after the next parent refetch, and disable Retry until fresh props arrive.

### WR-03: MobileDrawer hides the Profile link for authenticated users without a wagmi `address`

**File:** `apps/web/app/components/MobileDrawer.tsx:67, 187-197`
**Issue:** The Profile link is gated on `showAuthedLinks && address`, where `address` comes from `useAccount()` (wagmi). For Privy OAuth logins (Google/Twitter) the embedded wallet address may not be populated in the wagmi `useAccount()` hook at the moment the drawer opens (Privy embedded-wallet address can lag, or wagmi may report `undefined` until the connector hydrates). In that window an authenticated user sees **New Call** and **Sign out** but **no Profile link** — there is no other mobile entry point to their own profile (D-06 lists Profile as an authenticated destination). This is the inverse of the D-06 risk and a navigation dead-end for OAuth users.
**Fix:** Prefer the Privy embedded-wallet address as a fallback, or render the Profile link whenever `showAuthedLinks` and resolve the address lazily. e.g. read `user?.wallet?.address` from `usePrivy()` as a fallback:
```tsx
const { authenticated, ready, logout, user } = usePrivy();
const { address } = useAccount();
const profileAddr = address ?? (user?.wallet?.address as `0x${string}` | undefined);
// ...
{profileAddr && <Link href={`/profile/${profileAddr}`} ...>Profile</Link>}
```

### WR-04: `formatUsdc(Number(amount)/1_000_000)` loses precision for large bigints across all modals

**File:** `packages/ui/src/compound/FollowFadeModal.tsx:54-56`, `packages/ui/src/compound/PositionExitModal.tsx:42-45`, `packages/ui/src/compound/CallerExitModal.tsx:43-46`, `apps/web/app/duel/[challengeId]/page.tsx:139-143`
**Issue:** Every USDC formatter does `Number(amount) / 1_000_000`. With the $100 stake cap this is safe today, but `formatShares` does `Number(shares) / 1e18` on 18-decimal bigints (FollowFadeModal:60-62), which exceeds `Number.MAX_SAFE_INTEGER` (2^53) for share totals above ~9M tokens and silently loses precision in the displayed "Expected shares" / "Min shares" preview. The preview number a user sees can therefore diverge from the actual `minSharesOut` bigint submitted on-chain. This is display-only (the submitted value is the real bigint) but undermines the slippage-preview trust the modal is built around.
**Fix:** Format share amounts via integer/bigint math (divide the bigint, keep a fixed number of fractional digits) rather than coercing the full 18-decimal value through `Number`. Same pattern should be applied wherever 18-decimal share bigints are displayed.

### WR-05: `useEnsName` result fed to `normalize()` can throw and crash the Handle screen

**File:** `apps/web/app/onboarding/handle/page.tsx:54-58`
**Issue:** `defaultHandle = ensName ? normalize(ensName) : ...`. `normalize()` (viem/ens, UTS-46) **throws** on a malformed name. ENS reverse records are user-controlled and not guaranteed to be normalizable; a reverse record containing disallowed characters will make `normalize(ensName)` throw during render, crashing the onboarding Handle step. This is in a Phase-9-touched file (added `useIsMobile` + touch targets) so it's in scope.
**Fix:** Wrap in try/catch and fall back to the raw name or placeholder:
```tsx
let normalizedEns: string | null = null;
if (ensName) { try { normalizedEns = normalize(ensName); } catch { normalizedEns = ensName; } }
const defaultHandle = normalizedEns ?? (twitterUsername ? `@${twitterUsername}` : 'you.eth');
```

### WR-06: DisputeModal base64-encodes evidence via `String.fromCharCode(...spread)` — stack overflow on large files

**File:** `apps/web/app/call/[id]/page.tsx:525-526`
**Issue:** `btoa(String.fromCharCode(...new Uint8Array(content)))` spreads the entire file's byte array into function arguments. For any non-trivial evidence file (hundreds of KB+), this exceeds the JS engine argument limit and throws `RangeError: Maximum call stack size exceeded`, aborting the dispute-evidence upload. There is no file-size guard on the `<input type="file">` (line 636). The `$5` dispute bond + evidence is a core dispute-flow requirement (SETTLE-26); a silent crash here blocks legitimate disputes. (In scope — the DisputeModal received the Phase-9 `isMobile` clamp.)
**Fix:** Chunk the encoding or use `FileReader.readAsDataURL`, and add a max-size guard on the input:
```tsx
const reader = new FileReader();
reader.onload = () => { const base64 = (reader.result as string).split(',')[1]; /* POST */ };
reader.readAsDataURL(file);
// + reject files over e.g. 5 MB before upload.
```

### WR-07: Duel page `<style>{...}</style>` injects global CSS targeting a generic class on every mount

**File:** `apps/web/app/duel/[challengeId]/page.tsx:548-561`
**Issue:** Even setting aside CR-01, injecting a raw `<style>` block with a global `.mobile-banner { ... !important }` rule from inside a client component is fragile: the class name is generic, the rule is global (not scoped), uses `!important`, and is re-inserted into the DOM on every full remount of the page. This is the kind of non-layout footgun the Phase-9 contract steers away from (the project standard is inline-style/`useIsMobile`, not ad-hoc media queries). It should be removed as part of CR-01's cleanup; flagging separately because the global-style injection pattern should not be reintroduced elsewhere.
**Fix:** Remove the `<style>` block (covered by CR-01). Do not reintroduce global `<style>` injection from page components — use `useIsMobile()` + inline styles consistent with the rest of the phase.

## Info

### IN-01: `displayedRepDelta` count-up animation excluded from deps via eslint-disable

**File:** `apps/web/app/call/[id]/page.tsx:1300-1324`
**Issue:** The rep count-up effect uses `// eslint-disable-next-line react-hooks/exhaustive-deps`. This is acceptable for an animation keyed intentionally on `[isSettled, callData?.repDelta]`, but the disable masks the fact that `displayedRepDelta` resets are not coordinated with `callData` identity changes. Low risk; noting for maintainability.
**Fix:** None required; consider extracting the count-up into a small `useCountUp(target, enabled)` hook to remove the lint suppression.

### IN-02: `key={i}` array index used as React key in FINAL POSITIONS and RidingList

**File:** `apps/web/app/call/[id]/page.tsx:1704, 1728`; `apps/web/app/duel/[challengeId]/page.tsx:263`
**Issue:** Final-positions and riding rows are keyed by array index. Since these lists re-sort by P&L and re-fetch on a 5s poll, index keys can cause subtle reconciliation glitches (wrong row animating/highlighting) when ordering changes.
**Fix:** Key by `p.handle` (positions are unique per handle/side) or a stable id.

### IN-03: `DuelRowCard` uses `duel.callerHandle[0]` without guarding empty string

**File:** `apps/web/app/page.tsx:271, 378`
**Issue:** `(duel.callerHandle[0] ?? '?')` — indexing `''[0]` yields `undefined`, so the `?? '?'` covers it; safe. But `handle.replace('@','').charAt(0)` style elsewhere is more defensive. Noting consistency only.
**Fix:** None required.

### IN-04: Stale `RELAYER_URL`/`RELAYER_BASE_URL` env var name divergence across files

**File:** `apps/web/app/call/[id]/page.tsx:223` (`NEXT_PUBLIC_RELAYER_URL`) vs `apps/web/app/components/SocialLinkControls.tsx:51` and `apps/web/app/onboarding/follow-graph/page.tsx:38` (`NEXT_PUBLIC_RELAYER_BASE_URL`)
**Issue:** Two different env var names are used for the relayer base across the app. Not introduced by Phase 9 but visible in reviewed files; a misconfigured deploy could leave one set and the other empty, silently degrading one surface.
**Fix:** Consolidate to a single relayer-base env var (or document both explicitly in the deploy checklist).

### IN-05: `DesktopOnlyBanner` copy says "Use the menu to navigate away" but relies on the hamburger existing on the page

**File:** `apps/web/app/components/DesktopOnlyBanner.tsx:64-66`
**Issue:** The banner copy instructs users to "Use the menu to navigate away." This depends on `GlobalNav`'s hamburger being mounted on `/new` and `/duel`. Confirm those routes render `GlobalNav` (it's a root-layout nav, so likely yes) — if a route opts out of the global nav the copy would be misleading.
**Fix:** Verify `GlobalNav` is present on the banner-bearing routes; otherwise soften the copy.

### IN-06: `parseFloat`/`isNaN` amount parsing accepts scientific notation and whitespace edge cases

**File:** `packages/ui/src/compound/FollowFadeModal.tsx:94-97`; `apps/web/app/components/ChallengeFormModal.tsx:113-115`
**Issue:** `parseFloat('1e2')` → 100, `parseFloat('5abc')` → 5. The `<input type="number">` constrains most browser input, but programmatic/paste paths can feed `'1e2'` which silently becomes a 100-USDC stake. Bounds checks (min/max) catch out-of-range values, so impact is limited.
**Fix:** Tighten parsing with a numeric regex before `parseFloat`, or rely solely on the validated bigint bounds (already present).

---

_Reviewed: 2026-06-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
