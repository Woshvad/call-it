---
phase: quick
plan: 260611-u1l
slug: live-call-card
subsystem: web-feed
tags: [live-card, prototype-parity, follow-fade-odds, profile-registry, d-07]
requirements: [QUICK-260611-U1L]
dependency_graph:
  requires:
    - apps/web/lib/chain.ts (FOLLOW_FADE_MARKET_ADDRESS, PROFILE_REGISTRY_ADDRESS, ACTIVE_CHAIN_ID)
    - apps/web/lib/abis (followFadeMarketAbi, profileRegistryAbi)
    - apps/web/lib/relayer-client.ts (FeedItem)
    - "@call-it/ui (Tag, avatarInitial, cn)"
  provides:
    - apps/web/components/LiveCallCard.tsx (prototype-parity live feed card)
    - apps/web/hooks/useFeedMarketData.ts (useFeedReserves, useFeedHandles)
    - apps/web/lib/asset-class.ts assetClassesFor (additive)
  affects:
    - apps/web/components/FeedList.tsx (live/settled render branch)
key_files:
  created:
    - apps/web/components/LiveCallCard.tsx
    - apps/web/hooks/useFeedMarketData.ts
    - apps/web/tests/live-call-card.test.ts
  modified:
    - apps/web/components/FeedList.tsx
    - apps/web/lib/asset-class.ts
decisions:
  - "User constraints 2026-06-11: no stake amount, no verified-criteria badge on the live card — grep-proven (no /STAKE/, no /CRITERIA/i in LiveCallCard.tsx)"
  - "formatUsdc mirrors the call page's ACTUAL format $(Number/1e6).toFixed(2) — the plan's expected toLocaleString guess was wrong on read; plan said mirror-exactly, so toFixed(2) won"
  - "Odds/pools block entirely gated on the reserves prop (D-07); fpct uses the exact call-page formula total === 0n ? 50"
  - "Handle precedence AUTH-44 one-liner: item.displayHandle ?? item.handle ?? onchainHandle ?? truncateAddress(item.caller), rendered as stored (no uppercase)"
metrics:
  duration_minutes: ~10
  tasks: 5
  files: 5
  commit: 59e08aa
completed: 2026-06-11
---

# Quick 260611-u1l: Live Call Card Redesign Summary

**One-liner:** Home-feed LIVE cards now render the prototype jaxon.eth layout via a new apps/web LiveCallCard wired to REAL FollowFadeMarket reserves (odds bar + pool dollars) and an on-chain ProfileRegistry handle fallback — stake pill and verified-badge row dropped per user constraints; everything without a feed source omitted (D-07).

## What Was Built

1. **apps/web/components/LiveCallCard.tsx** (new, 325 lines) — prototype live card: square grad avatar + handle (AUTH-44 precedence, rendered as stored), ticking "Closes in" countdown with C2 AWAITING SETTLEMENT amber-tag parity, Archivo statement (marketLine → statement → 'Open Call'), class+asset pills via assetClassesFor, conviction + real follow/fade odds split (brutal-bar split) + pool dollars (call-page formatUsdc toFixed(2)), FOLLOW/FADE/CHALLENGE/quote navigation Links (D-06, as-any typed-route pattern, stopPropagation), provenance footer (0x1234...abcd · posted Nh ago). Header comment documents the full omission table.

2. **apps/web/hooks/useFeedMarketData.ts** (new) — useFeedReserves(callIds) (2 reads/id: followReserve+fadeReserve, one batched useReadContracts, staleTime 30s) and useFeedHandles(callers) (deduped lowercased addresses, displayHandle, staleTime 60s). Every entry pins chainId: ACTIVE_CHAIN_ID; ZERO refetchInterval (Alchemy CU discipline, 065729c); contracts arrays memoized on sorted-join keys; failed/partial/empty results dropped from the Maps (D-07 degrade-to-hidden).

3. **apps/web/lib/asset-class.ts** — pure additive assetClassesFor(assetSymbol); existing exports byte-stable.

4. **apps/web/components/FeedList.tsx** — render branch: status settled/disputed → existing CallCard path (byte-untouched feedItemToCallCardData/shareHrefFor from quick-260611-tbc), everything else → LiveCallCard with reserves/onchainHandle props. Hooks called unconditionally above the isLoading/empty early returns; card-enter + --index wrapper kept on every card.

5. **apps/web/tests/live-call-card.test.ts** (new, 20 tests) — user-constraint greps, honesty pins, wiring pins, odds-math pin, handle-precedence window regex, D-07 gate-order pin, assetClassesFor real-import unit pins, C2 parity.

## Gate Results

| Gate | Result |
|---|---|
| pnpm --filter @call-it/web build | exit 0 (route table clean, typed routes OK) |
| pnpm --filter @call-it/web exec vitest run | **303/303 passed, 31 files** (276 baseline + 20 new live-call-card + 7 settled-tape-card from the parallel session, all green) |
| feed-tabs-chips / status-normalization / presentation-sweep / chain-pinning / wallet-popover pins | green (included in the 303) |
| git grep STAKE -- apps/web/components/LiveCallCard.tsx | empty (exit 1) |
| git grep -i criteria -- apps/web/components/LiveCallCard.tsx | empty (exit 1) |
| git show --stat HEAD | exactly the 5 plan files |

**Commit:** 59e08aa — feat(quick-260611-u1l): live call card redesigned to prototype — real on-chain odds/pools/handles wired; stake + criteria badge dropped (user constraints)

## FeedList at Edit Time (parallel-session composition)

By edit time, the parallel session quick-260611-tbc had **already committed** its work (64fd6b7 feat + 06e47d5 docs) — packages/ui, apps/relayer, and apps/web/tests/settled-tape-card.test.ts were clean in the tree, and FeedList.tsx carried the tbc settled enrichment (settledAt/repDelta/finalPct pass-through in feedItemToCallCardData + shareHrefFor) **committed, not as WIP**. Composition was therefore clean: their settled path was preserved byte-for-byte; only the imports, the unconditional hook block, and the per-item ternary branch were added. No packages/ui or apps/relayer file was touched or staged.

## Deviations from Plan

1. **[Minor] formatUsdc format** — plan guessed toLocaleString('en-US', { maximumFractionDigits: 2 }) but instructed "mirror the call page's exact dollar format (read it)". The call page (page.tsx:296-298) uses toFixed(2); that exact form was copied.
2. **[Minor] useFeedReserves enabled flag** — plan wrote enabled: callIds.length > 0; implemented as enabled: validIds.length > 0 (post-BigInt-guard count) so an all-invalid id page doesn't fire an empty multicall. Strictly more correct, same behavior otherwise.
3. **[None otherwise]** — no auth gates, no blocked tasks, no out-of-scope fixes.

## Known Stubs

None — every rendered element has a real source; sourceless elements are omitted (D-07), not stubbed.

## Self-Check: PASSED

- apps/web/components/LiveCallCard.tsx — FOUND
- apps/web/hooks/useFeedMarketData.ts — FOUND
- apps/web/tests/live-call-card.test.ts — FOUND
- Commit 59e08aa — FOUND (HEAD, 5 files)
