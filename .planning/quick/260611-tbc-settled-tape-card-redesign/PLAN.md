---
phase: quick-260611-tbc
plan: 01
type: execute
status: planned
date: 2026-06-11
wave: 1
depends_on: []
files_modified:
  - packages/ui/src/compound/SettledCallCard.tsx
  - packages/ui/src/compound/CallCard.tsx
  - packages/ui/src/index.ts
  - packages/ui/src/compound/__tests__/SettledCallCard.test.tsx
  - apps/relayer/src/lib/subgraph-client.ts
  - apps/relayer/src/lib/settled-enrichment.ts
  - apps/relayer/src/lib/__tests__/settled-enrichment.test.ts
  - apps/relayer/src/routes/feed.ts
  - apps/web/lib/relayer-client.ts
  - apps/web/components/FeedList.tsx
  - apps/web/tests/settled-tape-card.test.ts
autonomous: true
requirements: [QUICK-260611-TBC]
must_haves:
  truths:
    - "Settled-tab tape cards render the prototype settled treatment (operator screenshot 2026-06-11, matching `call it frontend/screens/feed.jsx:159-212` SettledCard): bracketed brutal card + square grad avatar + mono-bold handle + `settled <date> · <time> UTC` JBM overline + the outcome word HUGE top-right in Archivo black uppercase with the 3px 3px 0 #000 hard offset shadow"
    - "Outcome words carry DIFFERENTIATING text colors (user requirement): CALLED IT = var(--accent-win), LOUD AND WRONG = var(--accent-loss), CONTRARIAN HIT = var(--accent-duel), COLD CALL = var(--text-tertiary) — the color map covers all four §15.7 words even though the feed wire only derives two today (CallerWon → CALLED IT, CallerLost → LOUD AND WRONG); outcome absent/unknown → the existing muted SETTLED tag layout, never a guessed word (D-07)"
    - "The 7e33294 small win/loss pill is REPLACED in the settled-with-outcome path; the pill code paths reduce to the muted SETTLED tag as the outcome-absent fallback ONLY — and the live-status rendering of CallCard stays byte-identical (live/awaiting-settlement/preview branches untouched)"
    - "Bottom row = JBM label-overline stat blocks FINAL / REP Δ / STAKE with mono-bold values: FINAL signed 1-dp percent (+ chartreuse / − red by sign, `—` only when the market type semantically has no final price), REP Δ signed int (+ win-color / − loss-color), STAKE $N white — plus an OUTLINED SHARE anchor bottom-right (X web intent, rel=noopener noreferrer) whose click stopPropagation-s so the D-06 card-tap navigation to /call/[id] keeps working; SHARE omitted when NEXT_PUBLIC_OG_BASE_URL is unset (obx precedent — no dead controls, D-08)"
    - "GET /api/feed settled items ADDITIVELY carry settledAt (unix seconds, from Settlement.settledAt) and repDelta (int, the CALLER's latest RepEvent.delta — RepEvent has callId + user; trustworthy post-quick-260611-sof); finalPct is included ONLY for the truthful derivation: marketType 0 (PriceTarget) where SettlementManager.sol:713-723 defines priceDelta = Pyth final price − call.targetValue, both 1e8 (expo −8), so finalPct = priceDelta/targetValue×100 = signed % by which the final price landed past(+)/short(−) of the target — semantics verified against contract source and documented in a code comment; marketTypes 1/2 NEVER get a finalPct (governance attestations carry priceDelta=0 which would be a fake 0%); a number whose semantics aren't verified is never shipped (D-07)"
    - "MANDATORY degradation: against the CURRENT deployed relayer (no settledAt/repDelta/finalPct on the wire) the settled card renders outcome word + statement + STAKE + SHARE with the stats and overline ABSENT — never fabricated; relayer-side, the settled enrichment NEVER throws and NEVER blocks the feed (subgraph failure → items unchanged, mirroring the enrichFeedItems contract)"
    - "Gates: ui + web + relayer vitest suites and builds green — relayer gate is 'no NEW failures beyond the known pre-existing ens-resolver.test.ts failure'; two commits (code, then docs) staged file-by-file, NEVER git add -A (another session's uncommitted WIP owns apps/web/app/page.tsx, apps/web/app/components/FromYourNetworkSections.tsx, apps/web/lib/asset-class.ts — quick-260611-t7h); NOT pushed; SUMMARY.md notes the stats row goes live only after relayer Fly redeploy + web push"
  artifacts:
    - path: "packages/ui/src/compound/SettledCallCard.tsx"
      provides: "Prototype settled tape card (CornerBrackets + outcome word w/ hard offset shadow + per-word color map + FINAL/REP Δ/STAKE blocks + outlined SHARE anchor) + settledOutcomeWord wire→word derivation + OUTCOME_WORD_COLORS map"
      exports: ["SettledCallCard", "settledOutcomeWord", "OUTCOME_WORD_COLORS"]
    - path: "packages/ui/src/compound/CallCard.tsx"
      provides: "Routing: settled + derivable outcome word → SettledCallCard; settled without outcome → muted SETTLED tag (7e33294 win/loss pills removed); live branches byte-identical; gradFor/formatStake exported for reuse"
      exports: ["CallCard", "gradFor", "formatStake"]
    - path: "apps/relayer/src/lib/settled-enrichment.ts"
      provides: "enrichSettledFeedItems(items) — additive settledAt/repDelta/finalPct merge for settled/disputed items; never throws"
      exports: ["enrichSettledFeedItems"]
    - path: "apps/relayer/src/lib/subgraph-client.ts"
      provides: "querySettledFeedFields(items) — ONE batched settlements(id_in) + repEvents(callId_in) query through the circuit breaker; empty map on any failure"
      exports: ["querySettledFeedFields"]
    - path: "apps/relayer/src/routes/feed.ts"
      provides: "settled-enrichment step after enrichFeedItems (additive, graceful)"
      contains: "enrichSettledFeedItems"
    - path: "apps/web/components/FeedList.tsx"
      provides: "FeedItem → CallCardData mapping for settledAt/repDelta/finalPct/finalNA/marketType + shareHref built via @call-it/shared builders gated on NEXT_PUBLIC_OG_BASE_URL"
      contains: "buildShareText"
    - path: "apps/web/lib/relayer-client.ts"
      provides: "FeedItem optional settledAt/repDelta/finalPct fields (additive wire contract)"
      contains: "finalPct"
  key_links:
    - from: "apps/relayer/src/routes/feed.ts"
      to: "apps/relayer/src/lib/settled-enrichment.ts"
      via: "enrichSettledFeedItems(enrichedItems) after the existing enrichFeedItems step, inside its own try/catch"
      pattern: "enrichSettledFeedItems"
    - from: "apps/relayer/src/lib/settled-enrichment.ts"
      to: "apps/relayer/src/lib/subgraph-client.ts"
      via: "querySettledFeedFields — settlements(where:{id_in}) + repEvents(where:{callId_in}) in one GraphQL document through executeQuery (breaker)"
      pattern: "querySettledFeedFields"
    - from: "apps/web/components/FeedList.tsx"
      to: "packages/ui/src/compound/SettledCallCard.tsx"
      via: "CallCard internal routing on status==='settled' && settledOutcomeWord(outcome)!==null; FeedList passes the new CallCardData fields + shareHref prop"
      pattern: "settledOutcomeWord"
    - from: "apps/web/components/FeedList.tsx"
      to: "packages/shared/src/share/share-text.ts"
      via: "buildShareText + twitterIntentUrl from '@call-it/shared' — EXACTLY the /call/[id] settled share path (page.tsx:1867-1882); raw handle candidate passed so the internal isRealHandle filters 0x/#N fakes"
      pattern: "twitterIntentUrl"
---

<objective>
Redesign the Settled-tab tape card to the prototype settled treatment (operator screenshot 2026-06-11; ground truth `call it frontend/screens/feed.jsx:159-212` SettledCard + styles.css `.outcome-stamp`/`.label-overline` recipes — the 09.2 markup donor): bracketed dark brutal card, avatar + handle + `settled <date> · <time> UTC` overline, the outcome word HUGE top-right with hard offset shadow and per-word differentiating colors, statement in the display voice, FINAL / REP Δ / STAKE stat blocks, and an outlined SHARE button. Supersedes the small CALLED IT / LOUD AND WRONG pill added in commit 7e33294 earlier today (the muted SETTLED tag remains as the outcome-absent fallback only, D-07).

Feeds the stats truthfully: the relayer /api/feed additively enriches settled items with settledAt + repDelta from the subgraph (Settlement.settledAt, RepEvent.delta — trustworthy post-quick-260611-sof) and a finalPct ONLY where an honest derivation exists (marketType 0: SettlementManager.sol:717 `priceDelta = currentPrice - target`, both 1e8 — verified at planning time). The web degrades gracefully against the CURRENT deployed relayer (enrichment is INERT until a Fly deploy): no enrichment fields → outcome word + statement + STAKE + SHARE, stats absent.

Purpose: the Settled tab is the public proof-of-record surface — "CALLED IT / LOUD AND WRONG" must hit at feed-scan distance, with receipts-grade honest numbers (Core Value).
Output: new SettledCallCard in @call-it/ui + CallCard routing; relayer settled enrichment (subgraph-client query + lib module + feed.ts wiring); web FeedItem/FeedList pass-through + share wiring; tests across all three packages; two commits (code, docs), NOT pushed.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@"call it frontend/screens/feed.jsx"                 # SettledCard recipe lines 159-212 (GROUND TRUTH for layout)
@"call it frontend/styles.css"                       # .outcome-stamp 739-748, .label-overline 486-495, .btn.outline-white 431-436, .h-statement 623
@packages/ui/src/compound/CallCard.tsx               # 7e33294 pill at lines 184-191; brutal-card recipe; gradFor/formatStake/AVATAR_GRADS; liveDot animate-[…] precedent
@packages/ui/src/primitives/CornerBrackets.tsx       # bracket primitive (parent must be position:relative)
@packages/ui/src/primitives/__tests__/VerifiedBadge.test.tsx  # ui test style (vitest + @testing-library/react, jsdom)
@apps/relayer/src/routes/feed.ts                     # enrichFeedItems step at lines 171-186; response build 188-209
@apps/relayer/src/lib/subgraph-client.ts             # executeQuery/breaker; querySettledFields precedent 825-868; FEED_QUERY 122-149 (DO NOT TOUCH)
@apps/relayer/src/lib/call-enrichment.ts             # graceful-degradation contract precedent; enriched items carry marketType/targetValue
@apps/web/lib/relayer-client.ts                      # FeedItem 133-160; normalizeCallStatus boundary
@apps/web/components/FeedList.tsx                    # feedItemToCallCardData 30-60 (mapping point)
@apps/web/app/call/[id]/page.tsx                     # settled share path 1861-1882 (builders + gating to mirror); handle derivation 1825-1828
@packages/shared/src/share/share-text.ts             # buildShareText/twitterIntentUrl/isRealHandle (pure builders)
@packages/contracts/src/SettlementManager.sol        # _settlePyth 687-724 — priceDelta semantics (line 717)
@packages/subgraph/schema.graphql                    # Settlement 73-80 (priceDelta/settledAt/finalPrice), RepEvent 148-156
</context>

<source_facts>
Verified at planning time (2026-06-11). Re-confirm anchors before each edit — line numbers drift and ANOTHER session has uncommitted WIP in this repo.

- PROTOTYPE RECIPE (feed.jsx SettledCard, 159-212): `.brutal-card interactive bracketed` padding 28; top spread = Avatar + (handle 700/15px + mono overline 10.5px text-tertiary 0.04em `settled {date} · 23:59:47 UTC`) vs `.h-display .outcome-stamp` fontSize 32, color per outcome, `textShadow: "3px 3px 0 #000"`; statement `.h-statement` text-secondary 22; bottom row gap 28 items-end = three blocks of `.label-overline` + mono 16/600 value (FINAL colored by outcome, REP Δ `delta > 0 ? "+" : ""` win/loss color, STAKE `$N`), then `marginLeft:auto` `.btn outline-white` SHARE with `onClick={(e) => e.stopPropagation()}`. `.outcome-stamp` = font-display 900, -0.04em, uppercase, line-height 0.85, rotate(-1deg), stampReveal animation. `.label-overline` = mono 11px/600/0.08em/uppercase/text-tertiary. `.btn.outline-white` = transparent bg, text-primary, 2px var(--border-strong) border.
- PROTOTYPE OUTCOMES colors (data.jsx:91-97): called→win, wrong→loss, cold→neutral, contrarian→accent(purple in this product's mapping). USER REQUIREMENT overrides with app tokens: CALLED IT=var(--accent-win) #E8F542, LOUD AND WRONG=var(--accent-loss) #F87171, CONTRARIAN HIT=var(--accent-duel) #A855F7, COLD CALL=var(--text-tertiary) #64748B. All four tokens exist in apps/web/app/globals.css (lines 79-88). `stampReveal` keyframe exists in globals.css:912 — same app-cascade pattern as the `liveDot` animation CallCard already uses via `animate-[…]`.
- PRICE DELTA SEMANTICS (the FINAL % investigation, resolved): SettlementManager.sol:713-723 — Pyth rail computes `priceDelta = currentPrice - target` where the comment at 714 pins "targetValue stored in same units as Pyth price (8-decimal form, expo=-8)". CallSettled(callId, outcome, priceDelta) emitted at SM:372; subgraph handleCallSettled persists `settlement.priceDelta = event.params.priceDelta` + `settlement.settledAt = event.block.timestamp` (settlement-manager.ts:115-116). Settlement.finalPrice is NEVER written (always null — mapping line 54) so finalPrice cannot be used. The attested non-Pyth rail keeps the same contract (`priceDelta = observed - target`, oracle-attestation.ts:24/168) BUT governance adapters attest `priceDelta: 0n` (snapshot-adapter.ts:279, tally-adapter.ts:306) and value adapters use adapter-unit targets — therefore the ONLY truthful finalPct is marketType 0 (PriceTarget): finalPct = priceDelta/targetValue×100 = signed % by which the final price landed past(+)/short(−) of the target. Positive ⇔ CallerWon (SM:719 wins on currentPrice >= target).
- targetValue source: the feed items are ALREADY enriched by enrichFeedItems with `targetValue` (1e8-scale string; OMITTED for Event markets per WR-04) and real `marketType` (call-enrichment.ts:364-374) — run the settled enrichment AFTER that step and read both off the enriched records.
- repDelta source: RepEvent { user: Bytes!, delta: Int!, callId: String!, timestamp: BigInt! } (schema.graphql:148-156), created in handleRepCalculated. Pick the CALLER's latest: filter user.toLowerCase() === item.caller.toLowerCase(), max timestamp — an IMPROVEMENT over the OG path's unfiltered `repEvents(first:1)` which can grab the challenger's event on duels. Settlement entity id = callId.toString() (ensureSettlement, settlement-manager.ts:46-57) → `settlements(where: { id_in: $ids })` works directly. Both entities are deployed + queried in production today (web getSettledFields, relayer querySettledFields) — no schema risk.
- DO NOT TOUCH FEED_QUERY (subgraph-client.ts:122-149): it is load-bearing — a GraphQL validation error there empties the ENTIRE feed. The settled enrichment is a SEPARATE query whose failure degrades additively to "no extra fields".
- Breaker behavior: executeQuery routes through the circuit breaker; SubgraphNonInfraError (validation/config) rethrows — querySettledFeedFields must catch EVERYTHING and return an empty Map (mirrors querySettledFields:825-868 fail-safe contract).
- Wire casing: subgraph Call.status is TitleCase ('Settled'/'Disputed'); web normalizes at relayer-client boundary (normalizeCallStatus). Relayer-side settled detection must compare lowercased.
- WEB SHARE PATH TO MIRROR (page.tsx:1861-1882): `ogBase = process.env.NEXT_PUBLIC_OG_BASE_URL?.replace(/\/$/, '')`; receiptShareUrl = `${ogBase}/call/${id}`; `twitterIntentUrl(receiptShareUrl, buildShareText({ outcomeWord, handle, statement: marketLine }))`; anchor target=_blank rel="noopener noreferrer". Handle consistency: /call/[id] passes the handle RAW and relies on buildShareText's internal isRealHandle to omit 0x/#N/numeric fakes (page.tsx:2481-2483 comment; share-text.ts:63-73). The feed card passes `item.displayHandle ?? item.handle` (NEVER the truncateAddress() display fallback) for the same reason.
- CallCard pill to replace (CallCard.tsx:184-191): `call.status === 'settled' ? (outcome==='CallerWon' ? <Tag intent="win">CALLED IT</Tag> : outcome==='CallerLost' ? <Tag intent="loss">LOUD AND WRONG</Tag> : <Tag intent="muted">SETTLED</Tag>)`. The win/loss arms are removed (those cards route to SettledCallCard before this branch is reached); `<Tag intent="muted">SETTLED</Tag>` stays.
- FeedList is the ONLY `<CallCard>` consumer (grep-verified) — routing inside CallCard means zero other call-site churn.
- CONCURRENT WIP (quick-260611-t7h, uncommitted in worktree right now): apps/web/app/page.tsx, apps/web/app/components/FromYourNetworkSections.tsx, apps/web/lib/asset-class.ts, .planning/quick/260611-t7h-feed-tabs-chips/. This plan's file set has ZERO overlap — do not modify page.tsx, and NEVER `git add -A` / `git add .`; stage every path explicitly. Known pre-existing failing test: apps/relayer/src/lib/__tests__/ens-resolver.test.ts — the relayer gate is "no NEW failures beyond that one".
- Test runners: ui = vitest jsdom + @testing-library/react (`pnpm --filter @call-it/ui test`, include pattern `src/**/__tests__/**/*.test.{ts,tsx}`); relayer = vitest (`pnpm --filter @call-it/relayer test`); web = vitest source-assertion style (`pnpm --filter @call-it/web test`). Builds: ui/relayer `tsc --build`; web `next build --webpack` and REQUIRES `pnpm --filter @call-it/shared build` first (dist is gitignored — Phase 7 gotcha).
</source_facts>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Relayer settled-feed enrichment — settledAt + repDelta + truthful finalPct (additive, never-throws)</name>
  <files>apps/relayer/src/lib/subgraph-client.ts, apps/relayer/src/lib/settled-enrichment.ts, apps/relayer/src/lib/__tests__/settled-enrichment.test.ts, apps/relayer/src/routes/feed.ts</files>
  <behavior>
    __tests__/settled-enrichment.test.ts (vitest, vi.mock subgraph-client's querySettledFeedFields — or mock at the GraphQL boundary if cleaner per existing subgraph-breaker.test.ts conventions):
    - Test 1 (additive merge): a settled item (status 'Settled', marketType 0, targetValue '10000000000') whose Settlement row has settledAt 1780000000 + priceDelta '310000000' and whose caller RepEvent has delta -10 → output item carries settledAt: 1780000000 (number), repDelta: -10, finalPct: 3.1; ALL pre-existing keys byte-identical.
    - Test 2 (truthful-only finalPct): (a) marketType 2 → finalPct ABSENT even with a non-null priceDelta; (b) marketType 0 with targetValue missing (enrichment failed) → finalPct ABSENT; (c) priceDelta null → finalPct ABSENT; settledAt/repDelta still merged where present.
    - Test 3 (caller-filtered repDelta): two RepEvents for the callId — challenger (other user, later timestamp NOT matching caller) and caller — the CALLER's delta wins, case-insensitive address compare.
    - Test 4 (live untouched + never-throws): live items pass through unchanged; querySettledFeedFields rejecting/throwing → enrichSettledFeedItems resolves with the input items UNCHANGED (no throw, no field).
    - Test 5 (negative finalPct rounding): priceDelta '-241000000' on targetValue '10000000000' → finalPct -2.4 (1-dp rounding via Math.round(pct*10)/10).
  </behavior>
  <action>
    Write the test file FIRST per the behavior block; confirm RED (module doesn't exist), then implement:

    1. apps/relayer/src/lib/subgraph-client.ts — APPEND (do NOT touch FEED_QUERY or any existing export) a new section mirroring the querySettledFields precedent:
       - `SETTLED_FEED_FIELDS_QUERY`: one document — `settlements(first: 100, where: { id_in: $ids }) { id priceDelta settledAt }` + `repEvents(first: 1000, where: { callId_in: $idStrs }) { callId user delta timestamp }` with `$ids: [ID!]!, $idStrs: [String!]!` (Settlement.id = callId string; RepEvent.callId is String).
       - `export interface SubgraphSettledFeedFields { settledAt: number | null; priceDelta: string | null; repDelta: number | null; }`
       - `export async function querySettledFeedFields(items: Array<{ id: string; caller: string }>): Promise<Map<string, SubgraphSettledFeedFields>>` — routes through `executeQuery` (breaker); builds the map keyed by callId: settledAt = Number(settlement.settledAt) when parseable and > 0 else null; priceDelta = settlement.priceDelta ?? null; repDelta = delta of the latest (max BigInt timestamp) repEvent whose user.toLowerCase() === caller.toLowerCase() (guard non-number deltas → null). FAIL-SAFE: catch EVERYTHING (including SubgraphNonInfraError) → return empty Map; never throws. Doc-comment: mirrors querySettledFields' fail-safe contract; the user-filtered pick is deliberately stricter than the OG path's unfiltered repEvents(first:1) which can grab a challenger's event on duels.
    2. NEW apps/relayer/src/lib/settled-enrichment.ts — `export async function enrichSettledFeedItems(items: unknown[]): Promise<unknown[]>`:
       - Collect items whose status lowercases to 'settled' or 'disputed' (wire is TitleCase) with string/number id + string caller; if none → return items unchanged.
       - ONE querySettledFeedFields call; empty map → items unchanged.
       - Merge ADDITIVELY per matched item: `settledAt` (number) and `repDelta` (number) when non-null; `finalPct` ONLY when ALL hold: enriched `marketType === 0` (number, off the post-enrichFeedItems record), enriched `targetValue` is a string parsing to BigInt > 0, and priceDelta is a non-null string parsing to BigInt — then `finalPct = Math.round((Number(priceDelta) / Number(targetValue)) * 1000) / 10`. MANDATORY comment block citing the verified semantics: SettlementManager.sol:713-723 `priceDelta = currentPrice - target`, both 1e8 (expo −8, comment at SM:714) → finalPct = signed % by which the final price landed past(+)/short(−) of the target; positive ⇔ CallerWon (SM:719); marketTypes 1/2 are NEVER given a finalPct (governance attestations carry priceDelta=0 — snapshot-adapter.ts:279/tally-adapter.ts:306 — which would render a fake 0%; no single truthful final-vs-target % exists for those markets). NEVER throws — top-level try/catch returns input unchanged with a logger.warn (`event: 'settled_enrichment_failed'`), mirroring call-enrichment.ts's contract.
    3. apps/relayer/src/routes/feed.ts — after the existing enrichFeedItems block (lines ~171-186) and BEFORE the response build, add a parallel step: `enrichedItems = await enrichSettledFeedItems(enrichedItems)` inside its own try/catch (warn `event: 'settled_feed_enrichment_failed'`, keep prior items). Comment: quick-260611-tbc — additive settledAt/repDelta/finalPct for the settled tape card; INERT until the Fly redeploy; first-page Redis/L1 cache (10s TTL) caches the post-enrichment response so the extra subgraph query is bounded; the breaker + fail-safe map protect the feed from subgraph outages.
    4. Gates (repo root): `pnpm --filter @call-it/relayer test` — new suite green, no NEW failures beyond the pre-existing ens-resolver.test.ts; `pnpm --filter @call-it/relayer build` green.
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/relayer build && pnpm --filter @call-it/relayer test -- src/lib/__tests__/settled-enrichment.test.ts && bash -c "grep -q 'enrichSettledFeedItems' apps/relayer/src/routes/feed.ts && grep -q 'querySettledFeedFields' apps/relayer/src/lib/settled-enrichment.ts && grep -q 'SettlementManager.sol' apps/relayer/src/lib/settled-enrichment.ts && echo TASK1-OK"</automated>
  </verify>
  <done>settled-enrichment.test.ts written first (RED) then GREEN; querySettledFeedFields fail-safe (empty map, never throws); enrichSettledFeedItems merges settledAt/repDelta always-when-present and finalPct only under the verified marketType-0 derivation with the semantics comment; feed.ts wired additively after enrichFeedItems; FEED_QUERY untouched; relayer build green and no new test failures beyond ens-resolver.test.ts.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: @call-it/ui — SettledCallCard (prototype settled treatment) + CallCard routing, live rendering byte-identical</name>
  <files>packages/ui/src/compound/SettledCallCard.tsx, packages/ui/src/compound/CallCard.tsx, packages/ui/src/index.ts, packages/ui/src/compound/__tests__/SettledCallCard.test.tsx</files>
  <behavior>
    __tests__/SettledCallCard.test.tsx (vitest jsdom + @testing-library/react, VerifiedBadge.test.tsx style):
    - Test 1 (word + colors, all four §15.7 words): rendering SettledCallCard directly with each derived word asserts the word's element has the mapped color — CALLED IT→var(--accent-win), LOUD AND WRONG→var(--accent-loss), CONTRARIAN HIT→var(--accent-duel), COLD CALL→var(--text-tertiary) — and the hard offset textShadow '3px 3px 0 #000'. settledOutcomeWord('CallerWon')==='CALLED IT', ('CallerLost')==='LOUD AND WRONG', (undefined)===null, ('Pending')===null.
    - Test 2 (overline honesty): settledAt present → `settled … UTC` overline rendered with UTC date+time; settledAt absent → NO overline node.
    - Test 3 (stat degradation matrix): (a) finalPct 3.1 → '+3.1%' colored var(--accent-win); (b) finalPct -2.4 → '-2.4%' var(--accent-loss); (c) finalNA → FINAL block renders '—'; (d) finalPct+finalNA both absent → NO FINAL block; (e) repDelta -10 → '-10' var(--accent-loss); repDelta absent → NO REP Δ block; (f) STAKE always renders formatStake.
    - Test 4 (share): shareHref present → anchor with that href, target _blank, rel 'noopener noreferrer'; clicking the share anchor does NOT fire the card onClick (stopPropagation — D-06 card-tap nav preserved); shareHref absent → no anchor.
    - Test 5 (CallCard routing + pill replacement): CallCard with status 'settled' + outcome 'CallerWon' renders the BIG treatment (word visible, no Tag pill); status 'settled' + no outcome renders the muted SETTLED Tag and NOT the big word; status 'live' renders the countdown branch exactly as before (pin: 'Closes in' present, no outcome word).
  </behavior>
  <action>
    Write the test file FIRST (RED — component missing), then:

    1. NEW packages/ui/src/compound/SettledCallCard.tsx ('use client'; FLEXBOX ONLY — Satori Pitfall 15; doc-comment crediting the prototype recipe feed.jsx SettledCard + quick-260611-tbc):
       - Exports: `OUTCOME_WORD_COLORS: Record<string,string>` = { 'CALLED IT': 'var(--accent-win)', 'LOUD AND WRONG': 'var(--accent-loss)', 'CONTRARIAN HIT': 'var(--accent-duel)', 'COLD CALL': 'var(--text-tertiary)' } (future-proofed for all four §15.7 words — the feed wire derives only two today); `settledOutcomeWord(outcome?: string): string | null` = 'CallerWon'→'CALLED IT', 'CallerLost'→'LOUD AND WRONG', anything else→null (D-07: never guess).
       - Props: `{ call: CallCardData; className?: string; onClick?: () => void; shareHref?: string }` — imports `gradFor`, `formatStake` and type `CallCardData` from './CallCard' (export them there; zero behavior change), `CornerBrackets` from '../primitives/CornerBrackets', `VerifiedBadge`, `avatarInitial`, `cn`.
       - Container: same brutal-card recipe as CallCard (relative flex-col rounded-none bg-[var(--bg-secondary)] border-2 border-[var(--border-subtle)] p-6 sm:p-7, interactive hover classes only when onClick) + `<CornerBrackets />` first child.
       - Top row (flex spread, gap-3): LEFT = square 40px grad avatar (gradFor/avatarInitial, identical to CallCard) + column: mono 15px bold `@handle` + VerifiedBadge; beneath, ONLY when `call.settledAt` is a positive number, the JBM overline `settled {Mon D} · {HH:MM:SS} UTC` — `formatSettledOverline(unixSec)` using toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}) + toLocaleTimeString('en-US',{hour12:false,timeZone:'UTC'}) — font-mono text-[10.5px] tracking-[0.04em] text-[var(--text-tertiary)]. RIGHT = the outcome word: font-display font-black uppercase, `fontSize: 'clamp(20px, 6.5vw, 32px)'`, lineHeight 0.9, letterSpacing '-0.04em', `textShadow: '3px 3px 0 #000'`, color from OUTCOME_WORD_COLORS, `transform: 'rotate(-1deg)'`, `animate-[stampReveal_0.4s_cubic-bezier(0.34,1.56,0.64,1)]` (app-cascade keyframe — same pattern as CallCard's liveDot), `textAlign: 'right'` with flex-none max-w constraint so 'LOUD AND WRONG' wraps/clamps at 375px instead of overflowing (e.g. two-line wrap allowed; no clip/overflow-x).
       - Statement: the existing CallCard Archivo display voice verbatim — font-display font-extrabold, fontSize clamp(22px,5vw,28px), lineHeight 1.1, letterSpacing -0.02em, text-[var(--text-primary)], mb-5.
       - Bottom row: `flex flex-row flex-wrap items-end gap-x-7 gap-y-3`. Stat block = column: label `.label-overline` recipe (font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]) + value font-mono text-[16px] font-semibold mt-1. FINAL: render only when `typeof call.finalPct === 'number'` (value `${pct>=0?'+':''}${pct.toFixed(1)}%`, color accent-win when >=0 else accent-loss) OR `call.finalNA === true` (value '—', text-tertiary); otherwise OMIT the block (absent field ≠ N/A — D-07). REP Δ: only when `typeof call.repDelta === 'number'` — `${d>0?'+':''}${d}`, color accent-win when >0, accent-loss when <0, text-primary when 0. STAKE: always — formatStake(call.stake), text-[var(--text-primary)]. SHARE: only when shareHref — `<a>` styled `.btn outline-white`: inline-flex items-center justify-center font-mono text-[12px] font-semibold uppercase tracking-[0.06em] border-2 border-[var(--border-strong)] text-[var(--text-primary)] bg-transparent px-4 min-h-[44px] w-full sm:w-auto sm:ml-auto hover:bg-white/[0.04]; `href={shareHref} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}` (D-06: card-tap nav to /call/[id] must keep working on the card body).
    2. packages/ui/src/compound/CallCard.tsx:
       - Export `gradFor` and `formatStake` (add `export` keyword only — bodies untouched).
       - Extend CallCardData ADDITIVELY with doc-commented optional fields: `settledAt?: number` (unix seconds, relayer settled enrichment — absent on pre-enrichment deploys), `repDelta?: number`, `finalPct?: number` (signed %, truthful marketType-0 derivation only), `finalNA?: boolean` (market type semantically has no final price — renders '—'), and CallCardProps with `shareHref?: string`.
       - At the top of the CallCard function body, BEFORE any hooks ARE NOT yet called — actually place the routing as the FIRST statement so hook order is never conditional: `if (call.status === 'settled' && settledOutcomeWord(call.outcome) !== null) return <SettledCallCard call={call} className={className} onClick={onClick} shareHref={shareHref} />;` (import from './SettledCallCard'; no circular-type issue: SettledCallCard imports only values/types exported from CallCard — if the runtime cycle trips vitest, hoist CallCardData/gradFor/formatStake into a small './call-card-shared.ts' instead; planner default is the two-file form).
       - Settled tag branch (lines ~184-191): replace the three-arm conditional with the single `<Tag intent="muted">SETTLED</Tag>` (the 7e33294 CallerWon/CallerLost pill arms are dead after the routing — this is the outcome-absent fallback ONLY). NOTHING else in the component changes — live/awaiting/preview rendering stays byte-identical (Test 5 pins 'Closes in').
    3. packages/ui/src/index.ts — add `export { SettledCallCard, settledOutcomeWord, OUTCOME_WORD_COLORS, type SettledCallCardProps } from './compound/SettledCallCard';`.
    4. Gates: `pnpm --filter @call-it/ui test` (new suite + VerifiedBadge suite green) and `pnpm --filter @call-it/ui build`.
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/ui test && pnpm --filter @call-it/ui build && bash -c "grep -q 'SettledCallCard' packages/ui/src/index.ts && grep -q 'noopener noreferrer' packages/ui/src/compound/SettledCallCard.tsx && grep -q 'stopPropagation' packages/ui/src/compound/SettledCallCard.tsx && ! grep -q 'CALLED IT' <(sed -n '180,200p' packages/ui/src/compound/CallCard.tsx) && echo TASK2-OK"</automated>
  </verify>
  <done>SettledCallCard renders the prototype settled treatment with the four-word color map + hard offset shadow; overline/FINAL/REP Δ blocks degrade-to-hidden per D-07; SHARE anchor stops propagation and is absent without shareHref; CallCard routes settled-with-word to it and keeps the muted SETTLED tag as the only settled fallback; live branches byte-identical (test-pinned); ui suite + build green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Web wiring — FeedItem fields, FeedList mapping + share href, degradation pins, full gates, two commits</name>
  <files>apps/web/lib/relayer-client.ts, apps/web/components/FeedList.tsx, apps/web/tests/settled-tape-card.test.ts</files>
  <behavior>
    apps/web/tests/settled-tape-card.test.ts (vitest, source-assertion style per live-call-share.test.ts — readFileSync the sources; plus pure-function real imports from @call-it/shared only):
    - Test 1 (wire contract): relayer-client.ts FeedItem declares optional `settledAt`, `repDelta`, `finalPct` (regex on the interface block).
    - Test 2 (mapping pass-through): FeedList.tsx source passes settledAt/repDelta/finalPct/finalNA into the card data and computes finalNA only when settledAt is present AND marketType is 1 or 2.
    - Test 3 (share path parity): FeedList.tsx contains `NEXT_PUBLIC_OG_BASE_URL`, `twitterIntentUrl(`, `buildShareText(`, `/call/${'$'}{…}`-style receipt URL construction, and imports the builders from '@call-it/shared'; the RAW handle candidate (`displayHandle ?? `…`handle`) is what reaches buildShareText — NOT truncateAddress output (assert truncateAddress is not in the share-text argument expression).
    - Test 4 (degradation honesty, real import): buildShareText({ outcomeWord: 'LOUD AND WRONG', handle: '0x73047a88…ced', statement: 'ETH ≥ $1,000,000' }) contains 'LOUD AND WRONG' and NOT '@0x' (isRealHandle filter holds for the feed card's inputs).
  </behavior>
  <action>
    Write the test FIRST (RED), then:

    1. apps/web/lib/relayer-client.ts — extend FeedItem ADDITIVELY (doc-commented): `settledAt?: number` (unix seconds; absent until the relayer Fly redeploy — quick-260611-tbc), `repDelta?: number`, `finalPct?: number` (signed %, truthful marketType-0 derivation only — see apps/relayer/src/lib/settled-enrichment.ts). No normalization changes (numbers pass through getFeed's spread untouched).
    2. apps/web/components/FeedList.tsx:
       - Imports: add `twitterIntentUrl, buildShareText` from '@call-it/shared' and `settledOutcomeWord` from '@call-it/ui'.
       - feedItemToCallCardData: pass through `settledAt: typeof item.settledAt === 'number' ? item.settledAt : undefined`, same guard for `repDelta`/`finalPct`; compute `finalNA: item.finalPct === undefined && typeof item.settledAt === 'number' && (item.marketType === 1 || item.marketType === 2) ? true : undefined` — comment: '—' renders ONLY when the enrichment is live (settledAt present) and the market type semantically has no final-vs-target price (RelativePerformance/Event); a marketType-0 item missing finalPct omits the block (missing data ≠ N/A, D-07).
       - Share href (module-scope helper or inline in the render map): `const ogBase = (process.env['NEXT_PUBLIC_OG_BASE_URL'] ?? '').replace(/\/$/, '')`; for settled items where `settledOutcomeWord(item.outcome)` is non-null AND ogBase is non-empty: `shareHref = twitterIntentUrl(`${ogBase}/call/${item.id}`, buildShareText({ outcomeWord: word, handle: item.displayHandle ?? item.handle, statement: marketLine }))` — EXACTLY the /call/[id] settled share recipe (page.tsx:1867-1882); the handle candidate is passed RAW (never truncateAddress output) so buildShareText's internal isRealHandle omits 0x/#N fakes; ogBase unset → shareHref undefined → the card renders NO share control (obx precedent, D-08 no dead controls). Pass `shareHref={…}` to `<CallCard>`.
       - MANDATORY degradation comment: against the CURRENT deployed relayer none of settledAt/repDelta/finalPct exist → the settled card renders outcome word + statement + STAKE + SHARE only.
       - DO NOT touch apps/web/app/page.tsx, FromYourNetworkSections.tsx, or lib/asset-class.ts — uncommitted quick-260611-t7h WIP owns them.
    3. Gates (full sweep, repo root): `pnpm --filter @call-it/ui test && pnpm --filter @call-it/web test && pnpm --filter @call-it/relayer test` (relayer: no NEW failures beyond ens-resolver.test.ts) then builds: `pnpm --filter @call-it/shared build && pnpm --filter @call-it/ui build && pnpm --filter @call-it/relayer build && pnpm --filter @call-it/web build`.
    4. COMMITS (two, quick-task convention; stage EXPLICITLY — NEVER git add -A / git add . — the worktree carries quick-260611-t7h WIP in apps/web plus unrelated dirt):
       a. CODE commit — stage exactly: packages/ui/src/compound/SettledCallCard.tsx, packages/ui/src/compound/CallCard.tsx, packages/ui/src/index.ts, packages/ui/src/compound/__tests__/SettledCallCard.test.tsx, apps/relayer/src/lib/subgraph-client.ts, apps/relayer/src/lib/settled-enrichment.ts, apps/relayer/src/lib/__tests__/settled-enrichment.test.ts, apps/relayer/src/routes/feed.ts, apps/web/lib/relayer-client.ts, apps/web/components/FeedList.tsx, apps/web/tests/settled-tape-card.test.ts (plus call-card-shared.ts if the cycle fallback was used). Message EXACTLY:
          `feat(quick-260611-tbc): settled tape card redesign — prototype settled treatment (huge colored outcome word, FINAL/REP Δ/STAKE, SHARE) + truthful relayer settledAt/repDelta/finalPct enrichment`
       b. DOCS commit — stage exactly: .planning/quick/260611-tbc-settled-tape-card-redesign/PLAN.md and .planning/quick/260611-tbc-settled-tape-card-redesign/SUMMARY.md. Message EXACTLY:
          `docs(quick-260611-tbc): settled tape card redesign — plan + summary`
       c. `git show --stat HEAD` after each commit lists exactly the staged paths. DO NOT PUSH — the operator authorizes push/Fly deploys separately.
    5. SUMMARY.md — include: the prototype-recipe provenance, the finalPct semantics derivation (SM.sol:713-723, why marketTypes 1/2 are excluded), the degradation matrix, files + both commit hashes, and an OPERATOR FOLLOW-UPS section stating verbatim: the stats row (settledAt overline, FINAL, REP Δ) goes live ONLY after (1) relayer Fly redeploy — local `flyctl deploy -a call-it-relayer-sepolia --config apps/relayer/fly.toml --dockerfile apps/relayer/Dockerfile .` from repo root via Bash (the gh workflow is broken — missing FLY_API_TOKEN) — and (2) web push to master (Vercel auto-deploy); until then deployed cards show the degraded word+statement+STAKE+SHARE form by design.
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/web test && bash -c "grep -q 'finalPct' apps/web/lib/relayer-client.ts && grep -q 'buildShareText' apps/web/components/FeedList.tsx && grep -q 'NEXT_PUBLIC_OG_BASE_URL' apps/web/components/FeedList.tsx && git log --oneline -2 | grep -q 'quick-260611-tbc' && git status --porcelain | grep -E 'app/page\.tsx|FromYourNetworkSections|asset-class' | grep -qv '^A' && echo TASK3-OK"</automated>
  </verify>
  <done>FeedItem carries the additive wire fields; FeedList maps them + builds the env-gated shareHref via the exact /call/[id] builders with the raw handle candidate; finalNA computed only for live-enrichment N/A market types; all three suites + four builds green (relayer: no new failures beyond ens-resolver.test.ts); exactly two commits with the exact messages, other sessions' WIP unstaged and untouched, NOT pushed; SUMMARY.md carries the Fly-redeploy/web-push go-live note verbatim.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| subgraph → relayer feed | Untrusted indexed data becomes additive wire fields (settledAt/repDelta/finalPct) |
| feed wire → rendered receipt claims | Numbers on the settled card are public reputation claims (Core Value: unfakeable) |
| card → external share intent | User-controlled statement/handle strings enter a twitter.com intent URL |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-tbc-01 | Tampering | finalPct derivation | mitigate | Only the contract-verified marketType-0 derivation (SM.sol:713-723 priceDelta = final − target, both 1e8) ships; marketTypes 1/2 and any missing input omit the field; semantics documented in-code; never a fabricated 0% from governance attestations |
| T-tbc-02 | Spoofing | share intent URL | mitigate | Pure builders from @call-it/shared (URL-encoded statement, isRealHandle filters 0x/#N fakes); anchor rel="noopener noreferrer"; href origin is the env-locked NEXT_PUBLIC_OG_BASE_URL receipt URL |
| T-tbc-03 | Denial of Service | extra subgraph query per feed page | mitigate | Single batched query through the existing circuit breaker; fail-safe empty map; first-page 10s cache holds the post-enrichment response; FEED_QUERY untouched so the main feed can never break on the new selection |
| T-tbc-04 | Information Disclosure | Studio API key | mitigate | Query runs server-side via existing executeQuery (D-27); nothing key-bearing reaches the wire |
| T-tbc-SC | Tampering | npm/pip/cargo installs | accept | NO new packages — existing workspace deps only; supply-chain surface unchanged |
</threat_model>

<verification>
1. `pnpm --filter @call-it/ui test` green (SettledCallCard suite incl. four-word color map, degradation matrix, stopPropagation share, CallCard routing + live-branch pin).
2. `pnpm --filter @call-it/relayer test` — settled-enrichment suite green; no NEW failures beyond the pre-existing ens-resolver.test.ts.
3. `pnpm --filter @call-it/web test` green (wire-contract + mapping + share-parity + handle-honesty pins).
4. Builds green in order: shared → ui → relayer → web (`next build --webpack` needs shared dist).
5. Degradation pin: with settledAt/repDelta/finalPct absent from card data, the rendered settled card contains the outcome word, statement, STAKE and (env permitting) SHARE — and NO overline/FINAL/REP Δ nodes.
6. Exactly two new commits with the exact messages; `git show --stat` lists only the explicitly staged paths; apps/web/app/page.tsx, FromYourNetworkSections.tsx, lib/asset-class.ts (quick-260611-t7h WIP) remain unstaged/untouched; nothing pushed.
</verification>

<success_criteria>
- The Settled tab reads like the prototype: huge color-coded outcome words with the hard offset shadow at feed-scan distance, corner brackets, honest stat blocks, working share — replacing the 7e33294 pill except as the outcome-absent fallback.
- Every number on the card is truthful by construction: settledAt/repDelta straight from trustworthy subgraph entities, finalPct only from the contract-verified PriceTarget derivation, '—' only for semantic N/A, absent fields omitted (D-07).
- Card-tap navigation (D-06) and live-card rendering are regression-pinned; the web ships safely against the CURRENT deployed relayer and lights up the stats row automatically after the operator's Fly redeploy + web push.
- Two clean commits on master, not pushed; concurrent quick-260611-t7h WIP untouched.
</success_criteria>

<output>
- Code commit: `feat(quick-260611-tbc): settled tape card redesign — prototype settled treatment (huge colored outcome word, FINAL/REP Δ/STAKE, SHARE) + truthful relayer settledAt/repDelta/finalPct enrichment` — NOT pushed.
- Docs commit: `docs(quick-260611-tbc): settled tape card redesign — plan + summary` — NOT pushed.
- `.planning/quick/260611-tbc-settled-tape-card-redesign/SUMMARY.md` with the operator go-live note (relayer Fly redeploy + web push) verbatim.
</output>
