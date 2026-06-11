---
phase: quick
plan: 260611-u1l
slug: live-call-card
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/components/LiveCallCard.tsx
  - apps/web/hooks/useFeedMarketData.ts
  - apps/web/lib/asset-class.ts
  - apps/web/components/FeedList.tsx
  - apps/web/tests/live-call-card.test.ts
autonomous: true
requirements: [QUICK-260611-U1L]
must_haves:
  truths:
    - "Home-feed LIVE cards render the prototype live-card layout via NEW apps/web/components/LiveCallCard.tsx — packages/ui CallCard.tsx is NEVER edited or staged (parallel session quick-260611-tbc owns it mid-flight)"
    - "USER CONSTRAINTS 2026-06-11: NO stake amount and NO verified-criteria badge anywhere on the live card — proven by source grep (no /STAKE/, no /CRITERIA/i in LiveCallCard.tsx)"
    - "Follow/fade odds bar + pool dollars are REAL on-chain reads (FollowFadeMarket.followReserve/fadeReserve via one batched useReadContracts, chainId: ACTIVE_CHAIN_ID pinned, staleTime 30s, NO refetchInterval — Alchemy CU discipline per commit 065729c) and the whole block degrades-to-hidden when reserves are absent (D-07, never fake)"
    - "Handle precedence honest (AUTH-44): item.displayHandle ?? item.handle ?? on-chain ProfileRegistry.displayHandle ?? truncated address — rendered AS STORED (no uppercase, user decision 2026-06-11); footer address is receipt provenance, not identity"
    - "Omissions are honest (D-07): no rep badge, no verified badges, no FOLLOW·142-style button counts, no block number, no challenge counts — none has a real feed source (/api/duels carries no callId)"
    - "FOLLOW / FADE / CHALLENGE / quote are navigation affordances (D-06): /call/:id and /new?quote=:id Links with stopPropagation — modals live on the call page"
    - "All existing pins stay green: 276 baseline vitest tests, feed-shell.spec.ts source pins (card-enter wrapper on EVERY card, no empty-state block in FeedList), feed-tabs-chips.test.ts (asset-class addition is pure), status-normalization (D-15 lowercase comparisons), chain-pinning, presentation-sweep, wallet-popover"
  artifacts:
    - path: "apps/web/components/LiveCallCard.tsx"
      provides: "prototype-parity live call card — avatar/handle, ticking countdown + AWAITING SETTLEMENT C2 parity, statement, class+asset pills, conviction/odds/pools block, action Links, provenance footer"
      contains: "AWAITING SETTLEMENT"
    - path: "apps/web/hooks/useFeedMarketData.ts"
      provides: "useFeedReserves(callIds) + useFeedHandles(callers) — batched, chainId-pinned, fetch-once wagmi reads"
      exports: ["useFeedReserves", "useFeedHandles"]
    - path: "apps/web/lib/asset-class.ts"
      provides: "NEW assetClassesFor(assetSymbol) — ordered class list for the pill row; existing exports byte-stable"
      exports: ["assetClassesFor"]
    - path: "apps/web/components/FeedList.tsx"
      provides: "render branch: settled/disputed → existing CallCard path (composes with parallel-session wiring), everything else → LiveCallCard; hooks called before early returns; card-enter wrapper kept"
      contains: "LiveCallCard"
    - path: "apps/web/tests/live-call-card.test.ts"
      provides: "source-assertion + real-import unit pins for user constraints, honesty, wiring, odds math, handle precedence, D-07 gating"
  key_links:
    - from: "apps/web/components/FeedList.tsx"
      to: "apps/web/components/LiveCallCard.tsx"
      via: "non-settled render branch with reserves/onchainHandle props"
      pattern: "LiveCallCard"
    - from: "apps/web/hooks/useFeedMarketData.ts"
      to: "FollowFadeMarket (on-chain)"
      via: "useReadContracts followReserve/fadeReserve, FOLLOW_FADE_MARKET_ADDRESS, chainId: ACTIVE_CHAIN_ID"
      pattern: "followReserve"
    - from: "apps/web/hooks/useFeedMarketData.ts"
      to: "ProfileRegistry (on-chain)"
      via: "useReadContracts displayHandle, PROFILE_REGISTRY_ADDRESS, chainId: ACTIVE_CHAIN_ID"
      pattern: "displayHandle"
    - from: "apps/web/components/LiveCallCard.tsx"
      to: "/call/[id] and /new?quote=[id]"
      via: "next/link with e.stopPropagation()"
      pattern: "/new\\?quote=\\$\\{"
---

<objective>
Redesign the HOME-FEED LIVE call card to the prototype's live-card layout (jaxon.eth "ARB will outperform OP" screenshot, user request 2026-06-11), wiring every element to REAL data and omitting what has no source (D-07 degrade-to-hidden, never fake). Two explicit user constraints: (1) NO "VERIFIED CRITERIA" badge, (2) NO stake amount anywhere on the card. New real wiring this card gains over the old one: on-chain follow/fade odds bar + pool dollars (FollowFadeMarket reserves) and on-chain ProfileRegistry handles as a fallback tier.

CRITICAL PARALLEL-SESSION CONSTRAINT: a second Claude session shares this working tree RIGHT NOW, mid-task on quick-260611-tbc (settled-tape-card-redesign). Its uncommitted WIP: packages/ui/src/compound/CallCard.tsx, packages/ui/src/compound/SettledCallCard.tsx, packages/ui/src/compound/__tests__/, packages/ui/src/index.ts, apps/relayer/src/routes/feed.ts, apps/relayer/src/lib/subgraph-client.ts, apps/relayer/src/lib/settled-enrichment.ts (+test), .planning/quick/260611-tbc-*. This task touches NONE of those files. The live card is a NEW component in apps/web (NOT packages/ui). The ONLY shared file edited is apps/web/components/FeedList.tsx — RE-READ it immediately before editing and COMPOSE with any settled-routing changes that landed.

Purpose: prototype-parity live card with honest data only.
Output: new LiveCallCard.tsx + useFeedMarketData.ts + live-call-card.test.ts, additive assetClassesFor in asset-class.ts, FeedList.tsx routing rework. Web-only; single atomic 5-file commit; no push; no relayer changes; no deploys.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@apps/web/components/FeedList.tsx                 — the ONLY shared-edit file. RE-READ the live file immediately before editing (parallel session may have landed settled-card routing). Today: feedItemToCallCardData mapping, .card-enter + --index stagger wrapper (e2e pin), skeletons, items.length===0 → null, onItemClick → /call/[id]
@packages/ui/src/compound/CallCard.tsx            — READ ONLY, NEVER EDIT (parallel WIP). Replicate into LiveCallCard: gradFor (charCode sum % 6), formatCountdown ("D HH:MM:SS", 'EXPIRED'), ticking Countdown (1s setInterval, suppressHydrationWarning), C2 expired-live → AWAITING SETTLEMENT amber Tag, statement clamp(22px,5vw,28px) Archivo, marketLine fallback chain, card shell Tailwind at lines 135-144
@packages/ui/src/index.ts                          — READ ONLY. Barrel exports usable here: Tag, avatarInitial, cn (lines 16, 48-49). Import ONLY these — NEVER SettledCallCard (uncommitted parallel WIP)
@apps/web/lib/relayer-client.ts                   — FeedItem (lines 133-160): id, caller, marketType, asset?, stake, conviction (real), expiry (real), createdAt, status (canonical lowercase), outcome?, displayHandle?, handle?, marketLine?, statement?, assetSymbol?, targetValue?. NO rep/verified/pools/block/challenge fields. Relayer does NOT set displayHandle/handle on feed items today
@apps/web/app/call/[id]/page.tsx                  — READ ONLY precedent: useReadContracts reserves pattern (lines 1336-1337, 1804-1805, 2750-2755), followPct formula, formatUsdc dollar format ("Follow pool"/"Fade pool" labels) — mirror formulas/format exactly, copy locally
@apps/web/lib/abis/FollowFadeMarket.ts            — followFadeMarketAbi incl. followReserve/fadeReserve view fns (uint256 USDC 6dp)
@apps/web/lib/abis/ProfileRegistry.ts             — profileRegistryAbi WITH displayHandle (line 67); barrel apps/web/lib/abis/index.ts exports it. Empty string = unset; stored handles are @-stripped (commit 5d8efc4)
@apps/web/lib/chain.ts                            — FOLLOW_FADE_MARKET_ADDRESS, PROFILE_REGISTRY_ADDRESS, ACTIVE_CHAIN_ID. RC1 rule (chain-pinning.test.ts): EVERY client read-hook callsite carries chainId: ACTIVE_CHAIN_ID
@apps/web/lib/asset-class.ts                      — ASSET_CLASS_CHIPS (7 entries) + assetMatchesChip (case-insensitive; ARB in both L2s and Arbitrum Eco); pinned by feed-tabs-chips.test.ts (D-15 — must stay green)
@apps/web/app/globals.css                         — VERIFIED recipes, NO CSS changes: .btn:484 .btn.cream:507 .btn.fade:542 .btn.duel:550 .pill.tag:654 .brutal-bar:661 .brutal-bar.split:673 (.follow/.gap/.fade:674-676) .label-overline:617 .avatar:717 (.avatar-grad-a..f:733-738; grad-c white text) .spread:984 .mono:985 .muted:986. NOT verified (do not assume): .brutal-card, .row, .col, .h-statement
@"call it frontend/screens/feed.jsx"              — canon markup reference ONLY, NEVER STAGE: CallCard lines 30-157 (top row/statement/tags/conviction+odds/actions/footer)
@"call it frontend/components.jsx"                — canon lines 84-134: RepBadge (NOT used), OddsBar (replicate as brutal-bar split)
@apps/web/tests/presentation-sweep.test.ts        — read() helper pattern (readFileSync + join(process.cwd(), ...), cwd = apps/web)
@apps/web/e2e/feed-shell.spec.ts                  — lines 37-73 pin FeedList source: card-enter present, no empty-state block — MUST stay satisfied
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create apps/web/components/LiveCallCard.tsx — prototype live card, honest data only</name>
  <files>apps/web/components/LiveCallCard.tsx</files>
  <action>
New 'use client' component rendering ONE live call in the prototype layout. Props: `{ item, reserves, onchainHandle, onClick }` where item is `FeedItem` (import type from '@/lib/relayer-client'), `reserves?: { follow: bigint; fade: bigint }`, `onchainHandle?: string`, `onClick?: () => void`. Imports from '@call-it/ui': ONLY `Tag` and `avatarInitial` (plus `cn` if useful) — NEVER `SettledCallCard` (uncommitted parallel WIP would break this commit's standalone build). Note: this file imports `assetClassesFor` from '@/lib/asset-class', added in Task 3 — write Task 3's one-line addition before running any build gate.

Local helpers (copy, do not import from packages/ui): `truncateAddress` = first 6 + '...' + last 4 chars of the address; `gradFor(handleShown)` = sum of charCodes % 6 → letter a–f (replicates CallCard); `formatCountdown` + ticking `Countdown` (1s setInterval, suppressHydrationWarning, "D HH:MM:SS", 'EXPIRED') replicated from CallCard; `formatUsdc` mirroring the call page's exact dollar format (read it; expected `'$' + (Number(v) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 })`); `timeAgo(createdAt)` — coarse honest buckets ("just now" under 60s, "Nm ago", "Nh ago", "Nd ago"); createdAt is unix seconds (number|string) — Number() it, NaN-guard to "just now".

Layout top→bottom (every element maps to a real source; omission = D-07):

(a) TOP ROW (className="spread"): LEFT — square avatar `span className={"avatar avatar-grad-" + letter}` with `avatarInitial(handleShown)`; beside it the handle column: `handleShown` bold 15px. Precedence EXACT, keep the chain on one greppable line: `item.displayHandle ?? item.handle ?? onchainHandle ?? truncateAddress(item.caller)`. Rendered AS STORED — textTransform none, no uppercase (user decision 2026-06-11). NO rep badge, NO verified badges (no feed source; user dropped the verified badge explicitly). RIGHT — "Closes in" as className="label-overline" + the ticking Countdown. C2 parity: when the expiry has passed (keep the 1s expiry check ticking exactly like CallCard's C2 even though this card only ever receives live-status items), render `Tag` with intent="warning" and className "border-[var(--accent-warning)] text-[var(--accent-warning)]" containing AWAITING SETTLEMENT instead of the countdown block.

(b) STATEMENT: `marketLine?.trim() || statement?.trim() || 'Open Call'` — Archivo display: className font-display font-extrabold, style fontSize clamp(22px,5vw,28px), lineHeight 1.1, letterSpacing -0.02em, color var(--text-primary).

(c) TAGS ROW — hidden ENTIRELY when no assetSymbol: for each class in `assetClassesFor(item.assetSymbol)` render `span className="pill tag"` with the class name uppercased, then ONE `span className="pill tag"` with assetSymbol.toUpperCase(). NO stake pill (user constraint — the uppercase word must not appear anywhere in this component, including comments; see header-comment wording rule below). NO LIVE pill (tape divider + countdown already say it; prototype card has none).

(d) CONVICTION/ODDS BLOCK:
- Top spread row: LEFT mono 11px var(--text-tertiary): `CONVICTION · ` + span styled color var(--accent-win) with `{conviction}%` — render ONLY when `typeof item.conviction === 'number'`. RIGHT (ONLY when reserves provided): span color var(--accent-win) `{fpct}% FOLLOW` + ` · ` + span color var(--accent-loss) `{100 - fpct}% FADE`, mono 11px.
- Bar (ONLY when reserves; the entire bar + pool rows live inside one `{reserves && ...}` gate so the gate index precedes 'brutal-bar split' in source — Task 5 pins this): `div className="brutal-bar split"` with role="img" and aria-label `${fpct}% follow`, children `div className="follow"` style flexBasis `${fpct}%`, `div className="gap"`, `div className="fade"` style flexBasis `${100 - fpct}%`.
- Bottom spread (ONLY when reserves): `{formatUsdc(reserves.follow)} pool follow` / `{formatUsdc(reserves.fade)} pool fade`, mono 10.5px var(--text-tertiary).
- fpct formula EXACT (Task 5 pins the `=== 0n ? 50` shape): `const total = follow + fade;` then `total === 0n ? 50 : Number((follow * 100n) / total)`.

(e) ACTIONS ROW (flex, gap 10): next/link Links, ALL calling e.stopPropagation() in onClick so the card-level onClick doesn't double-fire: `/call/${item.id}` className "btn cream" → FOLLOW; same href className "btn fade" → FADE; same href className "btn duel" → CHALLENGE; then marginLeft auto a 40x40 square quote Link to `/new?quote=${item.id}` with a quote glyph (literal " character or a tiny inline SVG — no shared Icon export verified; keep it dependency-free), title="Quote", border 2px solid var(--border-active). NO counts after labels (prototype's ·142/·67 was demo data — none exists, D-07). If next typedRoutes complains about dynamic hrefs, match the existing `as any` pattern (page.tsx duel links do this).

(f) FOOTER (className="spread", marginTop auto-ish spacing, paddingTop 16, borderTop 1px solid var(--border-subtle)): LEFT mono 10.5px var(--text-tertiary) letterSpacing 0.04em: `{truncateAddress(item.caller)} · posted {timeAgo(item.createdAt)}`. NO block number, NO challenges count (neither has a feed source — /api/duels items carry challengeId but NOT callId, so per-call counts are not derivable; D-07).

CARD SHELL: same Tailwind composition as packages/ui CallCard.tsx lines 135-144 — relative flex flex-col rounded-none p-6 bg-[var(--bg-secondary)] border-2 border-[var(--border-subtle)], plus when onClick present: cursor-pointer hover:border-white hover:shadow-[4px_4px_0_0_#000] hover:-translate variant (mirror CallCard's exact interactive classes). onClick goes on the root div.

HEADER COMMENT must document: prototype-parity live-card layout (quick-260611-u1l, user request 2026-06-11); the honest-data mapping table — what was omitted and why (rep/verified/button counts/block number/challenge counts = no feed source, D-07; stake amount + the verified badge = user constraints 2026-06-11); D-06: buttons are navigation affordances, modals live on the call page; AUTH-44: handle preferred, truncated-address fallback is provenance-honest, footer address is receipt provenance not identity. WORDING RULES for the whole file including comments: the word "criteria" must NOT appear in ANY case (the Task 5 pin is /CRITERIA/i — write "verified badge" instead); the uppercase word STAKE must not appear anywhere (lowercase "stake" in the header comment is tolerated by the /STAKE/ pin but prefer "amount staked" phrasing to keep the git-grep gate trivially clean); do not reference item.stake in code at all.
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && ! grep -E 'STAKE' apps/web/components/LiveCallCard.tsx && ! grep -iE 'criteria' apps/web/components/LiveCallCard.tsx && grep -q 'AWAITING SETTLEMENT' apps/web/components/LiveCallCard.tsx && grep -q '/new?quote=${' apps/web/components/LiveCallCard.tsx</automated>
  </verify>
  <done>Component exists; no uppercase STAKE and no any-case "criteria" anywhere in the file; AWAITING SETTLEMENT C2 parity present; FOLLOW/FADE/CHALLENGE + quote Links wired to /call/:id and /new?quote=:id; conviction renders only when numeric; entire odds/pools block gated on the reserves prop (D-07); handle precedence chain on one greppable line; header comment documents the omission table.</done>
</task>

<task type="auto">
  <name>Task 2: Create apps/web/hooks/useFeedMarketData.ts — batched, chainId-pinned, fetch-once reads</name>
  <files>apps/web/hooks/useFeedMarketData.ts</files>
  <action>
New 'use client' module. Two exported hooks, both wagmi `useReadContracts`, both chainId-pinned per the RC1 regression rule (chain-pinning.test.ts), both fetch-once:

1. `export function useFeedReserves(callIds: string[]): Map<string, { follow: bigint; fade: bigint }>` — build the contracts array with TWO entries per id (functionName 'followReserve' then 'fadeReserve'), each `{ address: FOLLOW_FADE_MARKET_ADDRESS, chainId: ACTIVE_CHAIN_ID, abi: followFadeMarketAbi, functionName, args: [BigInt(id)] }`. Guard non-numeric ids with try/catch around BigInt — skip ids that throw (and keep the contracts/ids arrays in lockstep so result pairing stays correct). `query: { enabled: callIds.length > 0, staleTime: 30_000 }`. Build the Map from result pairs (indices 2i / 2i+1): include an entry ONLY when both reads succeeded — failed/partial entries are omitted so the card degrades to conviction-only (D-07).

2. `export function useFeedHandles(callers: string[]): Map<string, string>` — dedupe to unique lowercased addresses; one read per address: `{ address: PROFILE_REGISTRY_ADDRESS, chainId: ACTIVE_CHAIN_ID, abi: profileRegistryAbi, functionName: 'displayHandle', args: [addr] }` (profileRegistryAbi from '@/lib/abis'); `query: { enabled: unique.length > 0, staleTime: 60_000 }`. Map keyed by the lowercased address; empty-string results (unset handle) and failed reads are DROPPED from the Map so the card falls through to the truncated-address tier.

Both hooks: memoize the contracts arrays with useMemo keyed on a stable join of the SORTED inputs (avoid refetch loops from new array identities each render). Imports: FOLLOW_FADE_MARKET_ADDRESS, PROFILE_REGISTRY_ADDRESS, ACTIVE_CHAIN_ID from '@/lib/chain'; followFadeMarketAbi from '@/lib/abis/FollowFadeMarket' (or the barrel if it exports it — check at edit time); profileRegistryAbi from '@/lib/abis'.

ABSOLUTE: NO refetchInterval anywhere in this file (Task 5 pins its absence). Header comment must state: one multicall batch per feed page; staleTime-only freshness (30s reserves / 60s handles) per the Alchemy CU burn lesson (commit 065729c) — the call page owns live 5s precision, the feed is a browse surface; D-07 degradation contract (missing Map entry = card hides the dependent block, never fakes).
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && test "$(grep -c 'chainId: ACTIVE_CHAIN_ID' apps/web/hooks/useFeedMarketData.ts)" -ge 2 && ! grep -E 'refetchInterval:\s*[0-9]' apps/web/hooks/useFeedMarketData.ts && grep -q 'followReserve' apps/web/hooks/useFeedMarketData.ts && grep -q 'displayHandle' apps/web/hooks/useFeedMarketData.ts</automated>
  </verify>
  <done>Both hooks exported; every read carries chainId: ACTIVE_CHAIN_ID; no polling; failed/empty results omitted from the Maps; contracts arrays memoized on stable keys.</done>
</task>

<task type="auto">
  <name>Task 3: apps/web/lib/asset-class.ts — additive assetClassesFor export</name>
  <files>apps/web/lib/asset-class.ts</files>
  <action>
PURE ADDITION — nothing else in this file changes (feed-tabs-chips.test.ts pins ASSET_CLASS_CHIPS and assetMatchesChip and must stay green, D-15):

`export function assetClassesFor(assetSymbol: string | undefined): string[] { return ASSET_CLASS_CHIPS.slice(1).filter((chip) => assetMatchesChip(assetSymbol, chip)); }`

Short doc comment: ordered class list for a symbol's pill row (order = ASSET_CLASS_CHIPS order, 'All' excluded); ARB → ['L2s','Arbitrum Eco'] (membership, not partition); unmapped or missing symbol → []. If ASSET_CLASS_CHIPS is a readonly tuple (`as const`), spread or Array.from before slice/filter as needed so the return type is string[].
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && grep -q 'assetClassesFor' apps/web/lib/asset-class.ts && pnpm --filter @call-it/web exec vitest run tests/feed-tabs-chips.test.ts</automated>
  </verify>
  <done>assetClassesFor exported; existing exports byte-stable; feed-tabs-chips suite still green.</done>
</task>

<task type="auto">
  <name>Task 4: apps/web/components/FeedList.tsx rework — route live items to LiveCallCard, compose with parallel WIP</name>
  <files>apps/web/components/FeedList.tsx</files>
  <action>
RE-READ the LIVE file immediately before editing — the parallel session (quick-260611-tbc) may have landed settled-card routing in CallCard/FeedList since this plan was written. COMPOSE with whatever exists at edit time; do not clobber it.

1. IMPORTS: add LiveCallCard ('@/components/LiveCallCard' or relative './LiveCallCard' matching file style) + useFeedReserves/useFeedHandles from '@/hooks/useFeedMarketData'. KEEP the existing CallCard import (settled path still uses it, whatever its internal routing now is).

2. HOOKS AT TOP of the FeedList component, called UNCONDITIONALLY before the isLoading/empty early returns (React hook rules — MOVE the early returns below the hook calls; pass empty arrays through, the `enabled` flag gates the actual fetch): derive `const liveItems = items.filter((i) => i.status !== 'settled' && i.status !== 'disputed');` (lowercase comparisons only, D-15) then `const reservesMap = useFeedReserves(liveItems.map((i) => i.id));` and `const handlesMap = useFeedHandles(liveItems.map((i) => i.caller));`.

3. RENDER BRANCH per item: status 'settled' or 'disputed' → EXACTLY the existing CallCard path (preserve whatever feedItemToCallCardData/settled wiring exists at edit time, byte-for-byte where possible); everything else → `<LiveCallCard item={item} reserves={reservesMap.get(item.id)} onchainHandle={handlesMap.get(item.caller.toLowerCase())} onClick={onItemClick ? () => onItemClick(item) : undefined} />`.

4. KEEP (e2e feed-shell.spec.ts lines 37-73 pin FeedList source): the .card-enter + --index stagger wrapper around EVERY card (both branches); the skeleton loading block; `items.length === 0` → return null (no empty-state block). Update the file header comment: live cards → LiveCallCard prototype layout (quick-260611-u1l); settled stays on the CallCard/SettledCallCard path owned by quick-260611-tbc.
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && grep -q 'LiveCallCard' apps/web/components/FeedList.tsx && grep -q 'card-enter' apps/web/components/FeedList.tsx && pnpm --filter @call-it/web build</automated>
  </verify>
  <done>Build exits 0; non-settled items render LiveCallCard with reserves/handle props; settled/disputed items render the pre-existing CallCard path unchanged; card-enter wrapper on every card; hooks precede every early return. If the build fails INSIDE packages/ui or apps/relayer code this task did not touch (the other session's WIP compiles into the web build), STOP and report — do not fix their files.</done>
</task>

<task type="auto">
  <name>Task 5: apps/web/tests/live-call-card.test.ts + full gates + atomic 5-file commit</name>
  <files>apps/web/tests/live-call-card.test.ts</files>
  <action>
New vitest source-assertion suite, presentation-sweep read() pattern — `const read = (...segs: string[]) => readFileSync(join(process.cwd(), ...segs), 'utf-8');` (cwd = apps/web), substring/regex/index-order checks, node env, no DOM. PLUS a real import of the asset-class module for unit pins — `import { assetClassesFor } from '../lib/asset-class';` (relative style matching feed-tabs-chips.test.ts). Assertions:

(i) EXISTENCE/ROUTING — read('components','LiveCallCard.tsx') succeeds; FeedList source contains 'LiveCallCard' (import + render) and still contains 'card-enter'.

(ii) USER CONSTRAINTS — LiveCallCard source has NO /STAKE/ match and NO /CRITERIA/i match.

(iii) HONESTY PINS — LiveCallCard source: no rep-badge artifacts (no '2,847', no /REP\s/), no hardcoded button counts (no /FOLLOW · \d/ and no /FADE · \d/), no 'block ' footer literal, no /challenges/i.

(iv) WIRING PINS — LiveCallCard source contains the link templates '/call/${' and '/new?quote=${'. Hooks source (read('hooks','useFeedMarketData.ts')) contains 'followReserve', 'fadeReserve', 'displayHandle', 'FOLLOW_FADE_MARKET_ADDRESS', 'PROFILE_REGISTRY_ADDRESS'; `(hooksSrc.match(/chainId: ACTIVE_CHAIN_ID/g) ?? []).length >= 2`; hooks source does NOT match /refetchInterval:\s*\d/ (CU pin).

(v) ODDS MATH PIN — LiveCallCard source matches /===\s*0n\s*\?\s*50/.

(vi) HANDLE PRECEDENCE — pin the one-line precedence chain Task 1 was told to keep greppable: assert a bounded-window regex like /displayHandle[\s\S]{0,60}\?\?[\s\S]{0,60}onchainHandle[\s\S]{0,60}\?\?[\s\S]{0,60}truncateAddress/ (displayHandle before onchainHandle before the truncation fallback within the chain — do NOT use file-wide indexOf, the truncateAddress helper definition appears earlier in the file).

(vii) D-07 GATING — index-order in LiveCallCard source: the reserves gate precedes the bar markup, e.g. `src.indexOf('reserves &&') !== -1 && src.indexOf('reserves &&') < src.indexOf('brutal-bar split')` (adjust the gate literal to the actual implementation if it differs, keep the order assertion).

(viii) assetClassesFor UNIT PINS (real import): deepEqual ARB → ['L2s','Arbitrum Eco'] (both, ASSET_CLASS_CHIPS order); BTC → ['Majors']; lowercase 'btc' → ['Majors'] (case-insensitive); undefined → []; 'FET' (unmapped) → [].

(ix) C2 PARITY — LiveCallCard source contains 'AWAITING SETTLEMENT'.

GATES (ALL must pass before commit):
- `cd "C:/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/web build` → exit 0
- `pnpm --filter @call-it/web exec vitest run` → ALL green (276 baseline + new suite; feed-tabs-chips / status-normalization / presentation-sweep / chain-pinning / wallet-popover / feed-shell source pins all stay green)
- `git grep STAKE -- apps/web/components/LiveCallCard.tsx` and `git grep -i criteria -- apps/web/components/LiveCallCard.tsx` (after staging) both return nothing — user constraints proven
If a gate fails INSIDE packages/ui or apps/relayer code this task did not touch (the other session's WIP compiles into the web build), STOP and report — do not fix their files.

COMMIT (single atomic; Git Bash on this Windows box; NO push — orchestrator pushes). Stage ONLY these 5 explicit paths via individual `git add`:
- `git add apps/web/components/LiveCallCard.tsx`
- `git add apps/web/components/FeedList.tsx`
- `git add apps/web/hooks/useFeedMarketData.ts`
- `git add apps/web/lib/asset-class.ts`
- `git add apps/web/tests/live-call-card.test.ts`
- `git commit -m "feat(quick-260611-u1l): live call card redesigned to prototype — real on-chain odds/pools/handles wired; stake + criteria badge dropped (user constraints)"`

NEVER `git add -A` / `git add .` / `git add -u`. NEVER stage: packages/ui/** (PARALLEL WIP: CallCard.tsx, index.ts, SettledCallCard.tsx, __tests__), apps/relayer/** (PARALLEL WIP: feed.ts, subgraph-client.ts, settled-enrichment*), .planning/quick/260611-tbc-*, packages/subgraph/**, packages/contracts/lib/openzeppelin-contracts, 'call it frontend/', docs/, evidence/, .claude/, .planning/config.json, any .gitignore, soak scripts, snapshots.
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/web exec vitest run</automated>
  </verify>
  <done>All gates green; `git show --stat HEAD` lists EXACTLY the 5 files; the parallel session's packages/ui + apps/relayer + 260611-tbc dirt is untouched and unstaged; no push.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @call-it/web build` → exit 0 (typed routes + tsc clean).
- `pnpm --filter @call-it/web exec vitest run` → all green: 276 baseline + new live-call-card suite; feed-tabs-chips, status-normalization, presentation-sweep, chain-pinning, wallet-popover pins green; feed-shell.spec.ts source assertions still satisfied (card-enter present in FeedList, no empty-state block).
- `git grep STAKE -- apps/web/components/LiveCallCard.tsx` → empty; `git grep -i criteria -- apps/web/components/LiveCallCard.tsx` → empty (user constraints proven on the committed file).
- `git show --stat HEAD` → exactly apps/web/components/LiveCallCard.tsx, apps/web/components/FeedList.tsx, apps/web/hooks/useFeedMarketData.ts, apps/web/lib/asset-class.ts, apps/web/tests/live-call-card.test.ts.
- `git status` → packages/ui/**, apps/relayer/**, .planning/quick/260611-tbc-* WIP still present, unstaged, byte-untouched by this task.
</verification>

<success_criteria>
- [ ] Live feed cards render the prototype layout: avatar+handle / Closes-in countdown (AWAITING SETTLEMENT C2 parity), Archivo statement, class+asset pills, conviction + real follow/fade odds bar + pool dollars, FOLLOW/FADE/CHALLENGE + quote actions, provenance footer (address · posted Nx ago)
- [ ] NO stake amount, NO verified-badge row anywhere on the card (user constraints 2026-06-11) — grep-proven
- [ ] Odds/pools from real FollowFadeMarket reserves; handles from feed fields with on-chain ProfileRegistry fallback, rendered as stored; everything without a source omitted (D-07): no rep, no counts, no block number, no challenge counts
- [ ] CU discipline: one batched read per data type per feed page, staleTime only (30s/60s), zero refetchInterval; every read chainId-pinned
- [ ] packages/ui, apps/relayer, and 260611-tbc planning files untouched and unstaged (parallel session protected); FeedList composes with any settled-routing that landed
- [ ] Both build + vitest gates green (276 baseline intact); single atomic 5-file commit; no push; web-only
</success_criteria>

<output>
Create `.planning/quick/260611-u1l-live-call-card/SUMMARY.md` when done (quick-task summary: what shipped, gate results, commit hash, any deviations — especially what FeedList looked like at edit time and how the settled path was composed).
</output>
