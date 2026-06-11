---
phase: quick-260611-5mh-fix-all-site-review-findings
reviewed: 2026-06-11T00:00:00Z
depth: deep
files_reviewed: 38
files_reviewed_list:
  - apps/relayer/src/lib/call-enrichment.ts
  - apps/relayer/src/lib/subgraph-client.ts
  - apps/relayer/src/routes/feed.ts
  - apps/relayer/src/routes/live-state.ts
  - apps/relayer/src/routes/profile.ts
  - apps/relayer/src/routes/notifications.ts
  - apps/relayer/src/routes/call-positions.ts
  - apps/relayer/src/index.ts
  - apps/web/lib/wagmi.ts
  - apps/web/lib/chain.ts
  - apps/web/lib/relayer-client.ts
  - apps/web/lib/circle-permit.ts
  - apps/web/lib/leaderboard-client.ts
  - apps/web/hooks/useUsdcBalance.ts
  - apps/web/hooks/useCirclePaymaster.ts
  - apps/web/hooks/useFeed.ts
  - apps/web/app/page.tsx
  - apps/web/app/call/[id]/page.tsx
  - apps/web/app/duel/[challengeId]/page.tsx
  - apps/web/app/duels/page.tsx
  - apps/web/app/not-found.tsx
  - apps/web/app/components/AppShell.tsx
  - apps/web/app/components/Sidebar.tsx
  - apps/web/app/components/SocialLinkControls.tsx
  - apps/web/app/components/ChallengeFormModal.tsx
  - apps/web/app/leaderboard/LeaderboardClient.tsx
  - apps/web/app/profile/[address]/ProfileClient.tsx
  - apps/web/app/new/page.tsx
  - apps/web/app/new/lib/target-scale.ts
  - apps/web/app/new/components/PriceTargetFields.tsx
  - apps/web/app/new/components/SpreadVsFields.tsx
  - apps/web/app/new/components/PublishConfirmModal.tsx
  - apps/web/app/new/hooks/useSettledCalls.ts
  - apps/web/app/og/[callId]/route.ts
  - apps/web/app/og/duel/[challengeId]/route.ts
  - apps/web/app/api/og/[callId]/route.ts
  - apps/web/components/FeedList.tsx
  - packages/ui/src/compound/FollowFadeModal.tsx
  - packages/ui/src/compound/CallCard.tsx
  - packages/ui/src/compound/ProfileHeader.tsx
  - packages/ui/src/lib/avatar-initial.ts
  - packages/shared/src/share/share-text.ts
findings:
  critical: 0
  warning: 7
  info: 6
  total: 13
status: issues_found
fix_status: warnings_fixed
fixed_at: 2026-06-11
---

# Quick 260611-5mh: Code Review Report

**Reviewed:** 2026-06-11
**Depth:** deep
**Files Reviewed:** 38
**Status:** issues_found

## Summary

Reviewed the three commits (160a4c9 relayer enrichment, 73e7f1a web chain/scale, 07f39d4 web presentation) against the seven priority lenses. The core fixes are sound: the 1e8 target scale migration is correct and round-trips (verified $4,200 → 420000000000n, $1M → 1e14); read-hook chainId pinning is complete across all 9 callsites; status normalization happens once at the relayer-client boundary; enrichment degrades gracefully and never throws into the feed; the in-process cache is immutable-keyed and does not poison on failed/zero lookups; share-text and OG P&L semantics are materially improved; D-15 test updates are honest (additive 15→16 keys, no weakened assertions).

No CRITICAL defects were found — the Sepolia happy-path read/write flows are intact and no path silently routes to Arbitrum mainnet for the active deploy. However, seven WARNING-level issues remain, the most notable being a notification-filter mode that returns other users' notification rows to unauthenticated callers, an incomplete EIP-712 permit domain fix, an event-market target-scale mismatch, and a feed pagination key mismatch that caps infinite scroll at page 1.

## Fix Status (2026-06-11 — all 7 Warnings fixed)

| ID | Status | Fix note |
|---|---|---|
| WR-01 | ✅ FIXED | Filter mode now requires BOTH `callId` AND `type` non-empty (empty-string params normalized to absent BEFORE filterMode — the `?type=` dump vector is closed; `and()` with zero conditions is impossible). Anonymous reads restricted to PUBLIC types (`challenge_proposed`) and return only `{id, callId, eventType, payload, createdAt}` (no `userAddress`/`readAt`). 6 new tests + smarter mock in `notifications-filters.test.ts` (D-15 additive — all 5 original tests unchanged and passing). |
| WR-02 | ✅ FIXED | `getFeed` now reads the relayer wire key `nextCursor` and maps it to the web-internal `cursor`; wire format unchanged. Source-gate test added in `status-normalization.test.ts`. |
| WR-03 | ✅ FIXED | Per-chain `USDC_PERMIT_DOMAINS` table in `circle-permit.ts`. VERIFIED ON-CHAIN 2026-06-11: Sepolia USDC `0x75faf114…AA4d` returns `name()="USD Coin"`, `version()="2"`, and the recomputed EIP-712 separator (`0x85944e12…08bb`) matches `DOMAIN_SEPARATOR()` byte-for-byte (mainnet `0xaf88…e5831` likewise re-verified: `0x08d11903…2c78`). The hardcoded literals were coincidentally correct on Sepolia; the lookup is now explicit, per-chain, and documented. |
| WR-04 | ✅ FIXED | `EnrichedCallFields.targetValue` is now optional and OMITTED for Event markets (marketType 2 — raw/unscaled targets) in `buildEnrichmentFromStruct`; `enrichFeedItems` + `/live-state` use conditional spreads. Event calls degrade to their stored statement (D-07) — no fabricated `$0.01` target. 2 new relayer tests. |
| WR-05 | ✅ FIXED | Added `EXPLORER_BASE_URL` to `apps/web/lib/chain.ts` (mainnet → arbiscan.io, Sepolia → sepolia.arbiscan.io). Provenance modal tx link, `chainId` field (`ACTIVE_CHAIN_ID`, type widened to `number`), and the chainId label all derive from the active chain. |
| WR-06 | ✅ FIXED | `isRealHandle` strips `^[@#]+` (aligned with `avatarInitial` — addresses IN-03's divergence) and rejects purely-numeric fallbacks; `'#14'` / `'@#14'` / `'14'` can never become an @mention. 4 new shared tests (D-15 additive). |
| WR-07 | ✅ FIXED | New `apps/web/lib/og-host.ts` — `resolveOgFooterHost` trusts the request host only when its hostname is allowlisted (live Vercel deploy + localhost/127.0.0.1); otherwise the fixed deploy literal. All 3 OG routes wired. New `og-host.test.ts` (7 unit cases + per-route grep gate); `presentation-sweep` footer assertion updated to follow the literal into the helper. |
| IN-01 | ⏭ deferred | Not trivially co-located with a Warning fix; float-precision edge above ~$90M. |
| IN-02 | ⏭ deferred | Title-restore cleanup — cosmetic SPA staleness. |
| IN-03 | ✅ FIXED (partially, via WR-06) | `isRealHandle` now uses the same `^[@#]+` cleaning as `avatarInitial`; full centralization into one shared helper deferred. |
| IN-04 | ⏭ deferred | Cosmetic (0 target is invalid anyway). |
| IN-05 | ✅ FIXED | `typeof item === 'object' === false` → `typeof item !== 'object'` (same file as WR-04, zero-risk). |
| IN-06 | ⏭ deferred | `as any` route casts — not co-located with a Warning fix. |

Verification: `@call-it/relayer` build + vitest 264/264 ✅ · `@call-it/shared` build + vitest 137/137 ✅ · `@call-it/ui` build ✅ · `@call-it/web` build + vitest 156/156 ✅.

## Warnings

### WR-01: Notification filter mode leaks all users' notification rows to anonymous callers

**File:** `apps/relayer/src/routes/notifications.ts:105-160`
**Issue:** The new filter mode makes `user` optional whenever `callId` OR `type` is present, then runs `db.select().from(notifications).where(...)` returning the FULL rows (recipient `userAddress`, `payload`, read state). Two problems:
1. `GET /api/notifications?callId=14` (no `type`, no `user`) returns every notification of every type for that call across ALL recipients — broader than the intended "pending challenge banner."
2. Worse, `GET /api/notifications?type=` (empty string, no callId, no user) sets `filterMode = true` (because `typeParam !== undefined`), but the empty-string guard `typeParam.length > 0` skips the type condition, `normalizedUser` is null, and `cursorDate` is null — so `conds` is empty and `.where(conds.length === 1 ? conds[0] : and(...conds))` becomes `.where(and())` → `.where(undefined)` → an UNFILTERED dump of the first 20 notifications belonging to arbitrary users.

The legacy mode required knowing an address to read that address's notifications; the new mode removes that gate entirely. Payload is declared no-PII (schema.ts:135) and addresses are public on-chain, so this is information-disclosure rather than secret leakage, but it is an unauthenticated bulk read that did not exist before.
**Fix:** Require `callId` to be present and valid in filter mode (reject filter queries with no callId), restrict returned columns to the banner's needs, and treat empty-string `type` as absent before computing `filterMode`:
```ts
const typeParam = request.query.type && request.query.type.length > 0 ? request.query.type : undefined;
const filterMode = callIdParam !== undefined; // callId is mandatory in filter mode
if (filterMode && callIdParam === undefined) return reply.status(400)...
```

### WR-02: Feed pagination broken — getFeed reads `res.cursor` but the relayer returns `nextCursor`

**File:** `apps/web/lib/relayer-client.ts:130-141`, consumed at `apps/web/hooks/useFeed.ts:36`
**Issue:** The relayer feed route returns `{ items, nextCursor, _source }` (feed.ts:196), but `getFeed` destructures `res.cursor` and returns `{ cursor: res.cursor, ... }` — `res.cursor` is always `undefined`. `useFeed`'s `getNextPageParam: (lastPage) => lastPage.cursor ?? undefined` therefore always yields `undefined`, so `useInfiniteQuery` never advances past page 1. The bug pre-dates this commit (the prior `relayerFetch<FeedResponse>` also mis-typed the shape), but this diff rewrote the exact function and reasserted the wrong key under an explicit type annotation, making it look intentional/correct while infinite scroll silently stays capped.
**Fix:** Map the wire key:
```ts
const res = await relayerFetch<{ items: ...; nextCursor: string | null }>(`/api/feed${qs}`);
return { cursor: res.nextCursor, items: (res.items ?? []).map(...) };
```

### WR-03: Circle paymaster permit domain still hardcodes mainnet USDC name/version

**File:** `apps/web/lib/circle-permit.ts:88-103`, `apps/web/hooks/useCirclePaymaster.ts:107-114`
**Issue:** The commit correctly fixed the EIP-712 domain `chainId` (was `arbitrum.id`, now `ACTIVE_CHAIN_ID`) and `verifyingContract` (now chain-selected USDC), and the SUMMARY calls the permit-signature bug "fixed." But `buildEip2612PermitTypedData` still hardcodes `domain.name: 'USD Coin'` and `version: '2'` — values verified only against the Arbitrum mainnet native USDC (0xaf88…). If the Arbitrum Sepolia test token (0x75faf114…) exposes a different EIP-712 domain `name` or `version`, the permit signature will STILL be rejected on-chain on Sepolia despite the chainId fix. The fix is incomplete/unverified for the active chain.
**Fix:** Read `name()`/`version()` (or `eip712Domain()`) from the selected USDC contract, or pin per-chain domain constants. At minimum, verify the Sepolia token's domain name/version match the hardcoded literals and document the verification.

### WR-04: Event-market targetValue mis-scaled by the 1e8 consumers

**File:** `apps/relayer/src/lib/call-enrichment.ts:280-300` (emits `targetValue` raw for all market types), consumed at `apps/web/app/call/[id]/page.tsx:288-298` `formatTarget1e8`
**Issue:** `buildEnrichmentFromStruct` emits `targetValue` as the raw on-chain integer for every market type and the field is documented as "1e8 scale." But per the team's own `target-scale.ts` (and SUMMARY-02 deviation #2), Event-market milestone targets are stored RAW/unscaled (e.g. `1000000` for a $1M TVL milestone), not at 1e8. The call-page `formatTarget1e8` unconditionally divides by 1e8, so an Event call's target renders as `$0.01` instead of `$1,000,000`. The composer's `formatTargetForDisplay` is market-type-aware and handles this correctly, but the relayer enrichment field and the receipt formatter are not — they assume 1e8 universally.
**Fix:** Either omit `targetValue`/`marketLine`-target rendering for `marketType === 2` (Event) in the enrichment, or carry `marketType` through to the receipt and branch the formatter (raw for events, ÷1e8 otherwise) exactly as the composer does.

### WR-05: Provenance modal hardcodes mainnet chainId + Arbiscan mainnet tx link on a Sepolia deploy

**File:** `apps/web/app/call/[id]/page.tsx:497` (`chainId: 42161`), `:1039` (`https://arbiscan.io/tx/${txHash}`), `:1080` ("chainId 42161" label)
**Issue:** `fetchProvenanceData` was rewritten in this diff and re-hardcodes `chainId: 42161` into the provenance object; the modal renders a tx link to `arbiscan.io` (Arbitrum One explorer) and a "chainId 42161" label. On the current Arbitrum Sepolia deploy, settlement tx hashes do not exist on mainnet Arbiscan, so the "view on explorer" link 404s and the chain label is wrong. Partly pre-existing, but the diff touched the exact construction site and preserved the mainnet assumption while the rest of the commit was explicitly moving reads to `ACTIVE_CHAIN_ID`.
**Fix:** Derive `chainId` and the explorer base from `ACTIVE_CHAIN_ID` (`sepolia.arbiscan.io` for 421614). If the relayer genuinely signs provenance bound to 42161 regardless of deploy, document that and still fix the explorer host.

### WR-06: `isRealHandle` does not reject `#`-prefixed pseudo-handles

**File:** `packages/shared/src/share/share-text.ts:60-68`; reached via `apps/web/app/call/[id]/page.tsx:1741,1748`
**Issue:** `isRealHandle` strips only a leading `@` (`.replace(/^@/, '')`) and rejects `0x…`, empty, `undefined`, `null`. The call page's handle fallback chain bottoms out at `` `#${callIdNum}` `` (when `callerProfile`, `callData.handle`, and `caller` are all absent). `isRealHandle('#14')` returns `true`, so `buildShareText` emits `LOUD AND WRONG — @#14`, exactly the fake-handle class C3 set out to eliminate. Narrow (requires an empty caller field) but it is a live path that produces a bogus @mention in shared posts.
**Fix:** Reject `#`-prefixed values too: `if (/^[#]/.test(h)) return false;` (or strip `^[@#]+` like `avatarInitial` does, then re-check length/0x).

### WR-07: OG footer host is taken from the request Host header without allowlisting

**File:** `apps/web/app/og/[callId]/route.ts:763-766`, `apps/web/app/og/duel/[challengeId]/route.ts:484-486`, `apps/web/app/api/og/[callId]/route.ts:64-67`
**Issue:** The footer-domain fallback now derives from `url.host` (i.e. the request's Host / forwarded host). An attacker who controls the Host header on a cached-miss request can place arbitrary text in the OG card footer ("Be right in public." prefix). Satori renders text nodes (no HTML), so this is NOT XSS — but it allows footer-domain spoofing on shared receipt cards, and a poisoned response could be cached by the CDN and served to other viewers. Severity is low (cosmetic, no script execution), but the lens explicitly flagged x-forwarded-host trust.
**Fix:** Prefer the env var (already first), and when falling back, use a fixed allowlisted literal (`call-it-web-sepolia.vercel.app`) rather than the reflected `url.host`. Reserve `url.host` only if you validate it against a known-host set.

## Info

### IN-01: targetValue precision loss above ~$90M

**File:** `apps/web/app/new/lib/target-scale.ts:27-29`
**Issue:** `BigInt(Math.round(usd * TARGET_SCALE))` computes `usd * 1e8` in floating point before converting to BigInt. For targets above ~$90M (`> Number.MAX_SAFE_INTEGER / 1e8`), the multiplication loses integer precision and produces a slightly-off on-chain target. The $100 stake cap does not bound target magnitude. Edge, but a price target on a high-nominal asset could be imprecise.
**Fix:** Parse the decimal string directly to scaled BigInt (split on `.`, pad fractional to 8 digits) instead of float multiplication.

### IN-02: `document.title` is set but never restored on unmount

**File:** `apps/web/app/call/[id]/page.tsx:1631-1635`
**Issue:** The title effect sets `document.title = "{marketLine} — Call It"` but has no cleanup; navigating away (client-side) leaves the stale receipt title until the next page sets its own. Minor SPA tab-title staleness.
**Fix:** Return a cleanup that restores the prior title, or rely on a route-level metadata mechanism.

### IN-03: `avatarInitial` and `isRealHandle` diverge on prefix handling

**File:** `packages/ui/src/lib/avatar-initial.ts:13` vs `packages/shared/src/share/share-text.ts:62`
**Issue:** `avatarInitial` strips `^[@#]+`; `isRealHandle` strips only `^@`. Two "is this a handle / what's the initial" helpers treat `#` differently (see WR-06). Not a bug on its own, but the inconsistency is what makes WR-06 possible.
**Fix:** Centralize handle-cleaning in one shared helper used by both.

### IN-04: Empty-string target cannot display a literal `0`

**File:** `apps/web/app/new/components/PriceTargetFields.tsx:57`, `SpreadVsFields.tsx:102`
**Issue:** `value={field.value ? targetValueToUsd(field.value).toString() : ''}` treats `0n` as falsy, so a `0` target renders as an empty field. A 0 target is invalid anyway, so impact is cosmetic.
**Fix:** Use an explicit `field.value !== undefined && field.value !== null` check if a literal 0 ever needs to render.

### IN-05: `enrichFeedItems` uses a convoluted type guard

**File:** `apps/relayer/src/lib/call-enrichment.ts:344`
**Issue:** `if (item === null || typeof item === 'object' === false) return item;` parses as `(typeof item === 'object') === false`. Correct, but reads as a defect and is easy to mis-edit.
**Fix:** `if (item === null || typeof item !== 'object') return item;`

### IN-06: Duels page row navigation casts to `any`

**File:** `apps/web/app/duels/page.tsx:169-173`, also `ProfileClient.tsx` history links
**Issue:** `router.push(`/duel/${duel.challengeId}` as any)` and `href={`/call/${entry.id}` as any}` defeat Next's typed-routes checking. Acceptable escape hatch for dynamic segments, but the `any` casts will hide genuine route typos.
**Fix:** Use the typed `Route` cast (`as Route`) already imported elsewhere in the codebase rather than `any`.

---

_Reviewed: 2026-06-11_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
