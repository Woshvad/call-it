---
phase: quick
plan: 260611-t7h
slug: feed-tabs-chips
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/app/page.tsx
  - apps/web/lib/asset-class.ts
  - apps/web/app/components/FromYourNetworkSections.tsx
  - apps/web/tests/feed-tabs-chips.test.ts
autonomous: true
requirements: [QUICK-260611-T7H]
must_haves:
  truths:
    - "Home feed shows 4 tabs — Live calls / Settled / Following / Duels — restoring the prototype row that 09.2 D-08 cut, now honestly wired (user request 2026-06-11)"
    - "Duels tab lists real duels from GET /api/duels (rows link to /duel/:challengeId) or renders the prototype dashed 'NO LIVE DUELS IN YOUR GRAPH.' empty block — no fake rows (D-07)"
    - "Following tab hosts FromYourNetworkSections with an honest dashed 'QUIET HERE.' fallback when both network sections are hidden; the Live tab no longer renders the sections (prototype parity)"
    - "Chip row (7 asset-class chips: All/Majors/DeFi/L2s/Memecoins/Arbitrum Eco/Restaking) renders on Live + Settled tabs ONLY and filters the tape by real FeedItem.assetSymbol; NFTs + Macro chips are CUT as dead controls (D-08)"
    - "No fake counts (D-07): Following tab NEVER renders a count span (prototype's 12 was fake); Duels count span renders only after the /api/duels fetch succeeds"
    - "status-normalization.test.ts:49 stays green — new page.tsx code uses only lowercase status comparisons (D-15); app/duels/page.tsx untouched (presentation-sweep pins)"
  artifacts:
    - path: "apps/web/lib/asset-class.ts"
      provides: "ASSET_CLASS_CHIPS const (7 entries) + assetMatchesChip(symbol, chip) membership test"
      exports: ["ASSET_CLASS_CHIPS", "assetMatchesChip"]
    - path: "apps/web/app/page.tsx"
      provides: "4-tab feed + chip row + Duels fetch/rows + Following fallback wiring"
      contains: "chip-row"
    - path: "apps/web/app/components/FromYourNetworkSections.tsx"
      provides: "optional fallback prop rendered when both sections hidden"
      contains: "fallback"
    - path: "apps/web/tests/feed-tabs-chips.test.ts"
      provides: "source-assertion + real-import unit pins for tabs, duels wiring, following fallback, chips"
  key_links:
    - from: "apps/web/app/page.tsx"
      to: "${RELAYER_URL}/api/duels"
      via: "useEffect fetch on mount, AbortSignal.timeout(8_000)"
      pattern: "/api/duels"
    - from: "apps/web/app/page.tsx"
      to: "apps/web/lib/asset-class.ts"
      via: "assetMatchesChip filter over visibleItems"
      pattern: "assetMatchesChip"
    - from: "apps/web/app/page.tsx"
      to: "apps/web/app/components/FromYourNetworkSections.tsx"
      via: "fallback prop (Following tab body)"
      pattern: "fallback="
---

<objective>
Restore the prototype's FOLLOWING and DUELS feed tabs (cut in 09.2 as dead controls — cut rationale now obsolete: `/api/duels` is live and subgraph-backed) plus the category filter chip row, honestly wired: Duels from the real relayer endpoint, Following hosting the real FromYourNetworkSections with an honest fallback, chips filtering by ASSET CLASS derived from the real `assetSymbol` enrichment (NOT the 3-value on-chain Category enum). User request 2026-06-11 with prototype screenshot.

Purpose: prototype-parity feed navigation without reintroducing fake data (D-07) or dead controls (D-08).
Output: reworked `apps/web/app/page.tsx`, new `apps/web/lib/asset-class.ts`, one-prop change to `FromYourNetworkSections.tsx`, new `apps/web/tests/feed-tabs-chips.test.ts`. Web-only; single atomic commit; no push.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@apps/web/app/page.tsx                                  — file being reworked (266 lines; header comment lines 1-23 documents the now-obsolete 09.2 cut)
@apps/web/app/duels/page.tsx                            — READ ONLY precedent: DuelRow type (~line 27), truncateAddress (~39), formatUsdc (~44), fetchDuels mapping (~62-86), empty/error states. DO NOT MODIFY (presentation-sweep pins it).
@apps/web/app/components/FromYourNetworkSections.tsx    — `if (!showX && !showFc) return null;` at line 266; component currently takes no props
@apps/web/lib/relayer-client.ts                         — FeedItem.assetSymbol optional enrichment (~line 153)
@apps/web/app/globals.css                               — recipes ALREADY present, NO CSS changes: .tabs:755 .tab:761 .tab .count:777 .chip-row:827 .chip:830 (text-transform: uppercase, so literal "Majors" renders MAJORS) .chip.active:845 .h-2:750 .muted:986
@"call it frontend/screens/feed.jsx"                    — canon: FILTER_CHIPS lines 3-5, Tabs config ~240-249, chip-row ~252-262, following/duels dashed empty bodies ~294-305
@"call it frontend/components.jsx"                      — Tabs `.count` span markup ~175-187: `{item.count != null && <span className="count">{item.count}</span>}`
@apps/web/tests/status-normalization.test.ts            — line 47 regex `/status\s*[=!]==?\s*['"](Live|Settled|...)['"]/ ` — `activeTab === 'Live'` is explicitly fine (UI state); never compare a STATUS field to TitleCase
@apps/web/tests/presentation-sweep.test.ts              — `read()` helper pattern (line 12): `readFileSync(join(process.cwd(), ...segs), 'utf-8')` — vitest cwd is apps/web
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create apps/web/lib/asset-class.ts — chip catalogue + membership test</name>
  <files>apps/web/lib/asset-class.ts</files>
  <action>
New file. Two exports:

1. `export const ASSET_CLASS_CHIPS = ['All', 'Majors', 'DeFi', 'L2s', 'Memecoins', 'Arbitrum Eco', 'Restaking'] as const;` — exactly 7 entries, literal prototype FILTER_CHIPS strings minus NFTs/Macro (CUT per D-08: no NFT-floor/macro calls exist in v1 data; a chip that can never match is a dead control — say so in a comment).

2. `export function assetMatchesChip(assetSymbol: string | undefined, chip: string): boolean` —
   - chip === 'All' → always true (even for undefined symbol);
   - otherwise uppercase the symbol and membership-test against per-chip sets:
     Majors: BTC ETH SOL · DeFi: UNI LINK AAVE SKY ONDO · L2s: ARB OP POL MNT · Memecoins: PEPE WIF BONK DOGE · Arbitrum Eco: ARB GMX RDNT PENDLE · Restaking: EIGEN ETHFI EZETH.
   - ARB is intentionally in BOTH L2s and Arbitrum Eco (membership, not partition — comment this);
   - missing/unmapped symbol (event calls, FET, future listings) → false for every non-All chip;
   - unknown chip name → false.

Header comment: presentation-layer asset-class grouping over the REAL assetSymbol enrichment (relayer-client FeedItem); NOT the on-chain Category enum (majors/defi/other, packages/shared/src/types/call.ts); NFTS/MACRO cut per D-08 until those call types exist; symbols sourced from the project's Pyth feed catalogue.
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/web exec tsc --noEmit 2>/dev/null || pnpm --filter @call-it/web build</automated>
  </verify>
  <done>Module compiles; ASSET_CLASS_CHIPS has exactly 7 entries; assetMatchesChip behaves per the membership table (pinned by Task 4 unit tests).</done>
</task>

<task type="auto">
  <name>Task 2: FromYourNetworkSections — optional fallback prop (sole behavior change)</name>
  <files>apps/web/app/components/FromYourNetworkSections.tsx</files>
  <action>
Add an optional prop to the exported component: `export function FromYourNetworkSections({ fallback }: { fallback?: ReactNode } = {})` — add `type ReactNode` to the existing `from 'react'` import (file does not import the React namespace). Change line 266 `if (!showX && !showFc) return null;` → `if (!showX && !showFc) return <>{fallback ?? null}</>;` (fragment-wrap so the return type stays a ReactElement — safest across React 19 typings).

That is the SOLE behavior change — gate logic (AUTH-16), fetch, collapse wiring all untouched. Update the file header comment: now hosted under the feed's Following tab; the fallback renders when both sections are hidden (declined/unset platforms).
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && grep -c "fallback" apps/web/app/components/FromYourNetworkSections.tsx</automated>
  </verify>
  <done>Component accepts `fallback`; existing call sites (none pass it yet) still compile; both-hidden path renders fallback instead of null.</done>
</task>

<task type="auto">
  <name>Task 3: page.tsx rework — 4 tabs, Duels fetch + rows, Following fallback, chip row</name>
  <files>apps/web/app/page.tsx</files>
  <action>
Rework `apps/web/app/page.tsx` per the spec below. KEEP BYTE-STABLE: useFeed wiring, EmptyTape, TapeError, the section-divider "THE TAPE · LIVE/SETTLED" block, pagination "Load more" (keyed off hasNextPage as today), `data-testid="signed-in"`, lowercase status comparisons (D-15 — `activeTab === 'Live'` is fine, `item.status === 'Settled'` is NOT), handleNewCallClick/handleOpenCall.

1. TABS. `type FeedTab = 'Live' | 'Settled' | 'Following' | 'Duels';` Tab row maps 4 tabs with labels "Live calls" / "Settled" / "Following" / "Duels" inside the EXISTING button markup (keep role=tab, aria-selected, minHeight 44, the borderBottom active style, background/border:none resets). Count via prototype markup `<span className="count">{n}</span>` (components.jsx ~183). Counts are REAL ONLY (D-07) — implement via an explicit helper, e.g. `function tabCount(tab: FeedTab): number | null` with a literal `'Following'` → `null` branch commented "no real source — prototype's 12 was fake", and JSX `{count != null && <span className="count">{count}</span>}`:
   - Live → liveItems.length; Settled → settledItems.length;
   - Duels → duels.length ONLY when the fetch has succeeded (duels state !== null); null while loading/failed → span omitted;
   - Following → ALWAYS null, span never rendered.
   (Task 4 pins the literal Following→null mapping — keep it greppable on one line.)

2. DUELS TAB. Module-level `const RELAYER_URL = process.env['NEXT_PUBLIC_RELAYER_URL'] ?? '';`. One useEffect fetch on mount of `${RELAYER_URL}/api/duels` with `AbortSignal.timeout(8_000)`, try/catch → `duels` state (`DuelTabRow[] | null`, null = not-loaded/failed); skip the fetch entirely when RELAYER_URL is empty. Borrow app/duels/page.tsx (READ, do not modify): local `DuelTabRow` type (challengeId/challenger/caller/pot/status from the `{ duels: [...] }` response, defensive String()/Boolean() mapping, filter empty challengeIds), local truncateAddress (`0x1234…abcd`) and formatUsdc copies. Compact row component INSIDE page.tsx: each row a next/link `<Link href={`/duel/${duel.challengeId}`}>` (if typed-routes complains at build, follow the duels-page precedent: cast with eslint-disable'd `as any` / `as Route`); mono typography, 2px solid var(--border-active) bordered row, challenger vs caller truncated addresses, pot via formatUsdc, status uppercase — brutal styling consistent with the duels page (avatar-grad squares optional; keep simple). Tab body when `duels === null || duels.length === 0` → prototype dashed empty block (feed.jsx ~301-304):
   `<div style={{ padding: '80px 20px', textAlign: 'center', border: '2px dashed var(--border-active)' }}>` containing `<div className="h-2" style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>NO LIVE DUELS IN YOUR GRAPH.</div>` + `<span className="muted">Issue a challenge from any call.</span>` (.h-2 and .muted already in globals.css).

3. FOLLOWING TAB. Body renders `<FromYourNetworkSections fallback={quietHere} />` where `quietHere` = the same dashed block pattern with "QUIET HERE." heading + `<span className="muted">Follow more callers to populate this feed.</span>` (feed.jsx ~295-298). DELETE the current `{activeTab === 'Live' && <FromYourNetworkSections />}` line (~213) — the Live tab becomes pure tape (prototype parity).

4. CHIP ROW — rendered for Live + Settled tabs ONLY (gate the JSX on `(activeTab === 'Live' || activeTab === 'Settled')` — keep that expression near the `chip-row` literal; Task 4 pins it). `<div className="chip-row" style={{ marginBottom: 28 }}>` mapping ASSET_CLASS_CHIPS from `@/lib/asset-class`. Render each as `<button type="button" className={`chip ${activeChip === c ? 'active' : ''}`} onClick={...}>{c}</button>` — render the literal stored label ("All"/"Majors"/"Arbitrum Eco"...; the .chip recipe (globals.css:830) sets text-transform: uppercase plus font-family/size/weight/padding/border/background/color, all class-targeted so they apply to button.chip — no heavy inline reset needed; add a tiny reset only if a button default visibly leaks). `const [activeChip, setActiveChip] = useState<string>('All');`
   Filtering: `const chipFiltered = activeChip === 'All' ? visibleItems : visibleItems.filter((i) => assetMatchesChip(i.assetSymbol, activeChip));` Pass chipFiltered to FeedList. EmptyTape/TapeError keep keying off the UNFILTERED visibleItems exactly as today; the section-divider keeps keying off visibleItems.length > 0. NEW chip-empty case — when `chipFiltered.length === 0 && visibleItems.length > 0`, render IN PLACE OF FeedList a centered mono line: `NO {activeChip.toUpperCase()} CALLS ON THE TAPE.` (className="mono", fontSize ~12, color var(--text-tertiary), textAlign center, padding '32px 0'). Do NOT use EmptyTape for this case (EmptyTape = truly empty tape with the NEW CALL CTA).

5. TAB BODY ROUTING. Live/Settled → chip row + existing tape body (error/empty/divider/FeedList-or-chip-empty/pagination). Following → FromYourNetworkSections block only. Duels → duel rows or dashed empty only. The tape body, chip row, and section-divider must NOT render on Following/Duels.

6. HEADER COMMENT REWRITE (lines 1-23): the 09.2 D-08 cut is superseded 2026-06-11 (user request; /api/duels is now real and subgraph-backed, Following hosts the network sections with an honest fallback); chip row = asset-class grouping over real assetSymbol enrichment, NOT the 3-value on-chain Category enum; NFTS/MACRO chips trimmed per D-08. Keep the D-06/D-07 notes and the requirements line.
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/web build</automated>
  </verify>
  <done>Build exits 0. Four tabs render with honest counts; Duels fetches once on mount and degrades to the dashed empty block; Following hosts FromYourNetworkSections with the QUIET HERE fallback; chips filter Live/Settled by assetSymbol; no TitleCase status comparison anywhere in the file.</done>
</task>

<task type="auto">
  <name>Task 4: feed-tabs-chips.test.ts + full gates + atomic commit</name>
  <files>apps/web/tests/feed-tabs-chips.test.ts</files>
  <action>
New vitest file mirroring the presentation-sweep pattern: `const read = (...segs: string[]) => readFileSync(join(process.cwd(), ...segs), 'utf-8');` (cwd = apps/web) PLUS a real import `import { ASSET_CLASS_CHIPS, assetMatchesChip } from '../lib/asset-class';` for unit pins. Assertions:

(i) TABS — `read('app','page.tsx')` contains 'Live calls', 'Settled', 'Following', 'Duels' and `className="count"`.

(ii) DUELS WIRING — page source contains '/api/duels', matches /\/duel\/\$\{/ (link template), and contains 'NO LIVE DUELS IN YOUR GRAPH.'.

(iii) FOLLOWING WIRING — page source contains 'FromYourNetworkSections' rendered with `fallback=`, contains 'QUIET HERE.', and does NOT match /activeTab === 'Live' && <FromYourNetworkSections/ (the old Live-branch render is gone).

(iv) CHIPS — page source imports from asset-class (match /from ['"](@\/lib\/asset-class|\.\.?\/.*asset-class)['"]/), contains 'chip-row', and the chip row is gated to Live/Settled: assert a robust co-location regex against the ACTUAL Task-3 implementation, e.g. /\(activeTab === 'Live' \|\| activeTab === 'Settled'\)[\s\S]{0,300}chip-row/ — adjust the window/shape to the final code, keep it non-brittle. NFTs/Macro absence is asserted on the ARRAY (see v), NOT on page source — the rewritten page header comment legitimately mentions the NFTS/MACRO trim, so a naive page-source negative match would false-fail.

(v) UNIT PINS (real module import): assetMatchesChip('BTC','Majors')===true; 'ARB' true for BOTH 'L2s' AND 'Arbitrum Eco'; assetMatchesChip('PEPE','Memecoins')===true; assetMatchesChip('EIGEN','Restaking')===true; assetMatchesChip(undefined,'Majors')===false but assetMatchesChip(undefined,'All')===true; case-insensitive: assetMatchesChip('btc','Majors')===true; ASSET_CLASS_CHIPS.length===5+2===7 and includes neither 'NFTs' nor 'Macro'.

(vi) HONESTY PIN — Following renders no count: assert page source does NOT contain 'count: 12' and DOES match the literal Following→null mapping from Task 3's tabCount helper (e.g. /'Following'[^\n]*null/ — match the single greppable line Task 3 was told to keep; document in a comment that this pins the prototype's fake 12 staying dead). Implement the strongest form the final code allows without being brittle.

GATES (both must pass before commit):
- `cd "C:/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/web build` → exit 0
- `pnpm --filter @call-it/web exec vitest run` → ALL green (baseline 258 passing + new file; status-normalization:49 and presentation-sweep duels-page pins must stay green)

COMMIT (single atomic; Git Bash on this Windows box; NO push — orchestrator pushes):
```
git add apps/web/app/page.tsx
git add apps/web/lib/asset-class.ts
git add apps/web/app/components/FromYourNetworkSections.tsx
git add apps/web/tests/feed-tabs-chips.test.ts
git commit -m "feat(quick-260611-t7h): feed tabs restored — Following + Duels (real wiring) + asset-class filter chips (prototype layout, honest data)"
```
Stage ONLY those 4 files via explicit individual `git add`. NEVER `git add -A` / `git add .` / `git add -u`. NEVER stage: packages/subgraph/** (PARALLEL SESSION WIP RIGHT NOW), packages/contracts/lib/openzeppelin-contracts, 'call it frontend/', docs/, evidence/, .claude/, .planning/, .gitignore files, soak scripts, snapshots.
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/web exec vitest run</automated>
  </verify>
  <done>Both gates green; exactly 4 files in the commit (`git show --stat HEAD` lists only the 4); working tree's other dirt (subgraph WIP etc.) untouched and unstaged.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @call-it/web build` → exit 0 (typed routes + tsc clean).
- `pnpm --filter @call-it/web exec vitest run` → all green: baseline 258 + new feed-tabs-chips suite; status-normalization.test.ts:49 (no TitleCase status comparisons in app/page.tsx) green; presentation-sweep duels-page pins green (app/duels/page.tsx byte-untouched — `git status` shows it unmodified).
- `git show --stat HEAD` → exactly apps/web/app/page.tsx, apps/web/lib/asset-class.ts, apps/web/app/components/FromYourNetworkSections.tsx, apps/web/tests/feed-tabs-chips.test.ts.
</verification>

<success_criteria>
- [ ] 4 tabs (Live calls / Settled / Following / Duels) on the home feed, prototype .tabs markup with `<span className="count">` badges
- [ ] Counts honest (D-07): Live/Settled real lengths; Duels only post-fetch-success; Following never
- [ ] Duels tab: real `${RELAYER_URL}/api/duels` fetch (8s timeout, null-on-failure, skip when env empty), rows link to /duel/:challengeId, dashed "NO LIVE DUELS IN YOUR GRAPH." empty state
- [ ] Following tab: FromYourNetworkSections moved off the Live tab, rendered with dashed "QUIET HERE." fallback via new optional prop
- [ ] Chip row on Live+Settled only: 7 asset-class chips (NFTs/Macro cut, D-08), button elements, filters by real assetSymbol via new lib; chip-empty mono line distinct from EmptyTape
- [ ] No CSS changes; app/duels/page.tsx unmodified; no relayer changes; subgraph WIP untouched
- [ ] Both gates green; single atomic 4-file commit; no push
</success_criteria>

<output>
Create `.planning/quick/260611-t7h-feed-tabs-chips/SUMMARY.md` when done (quick-task summary: what shipped, gate results, commit hash, any deviations).
</output>
