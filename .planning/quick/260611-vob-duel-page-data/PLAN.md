---
phase: quick-260611-vob
plan: 260611-vob
slug: duel-page-data
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/lib/abis/CallRegistry.ts
  - apps/web/lib/feed-symbols.ts
  - apps/web/app/duel/[challengeId]/page.tsx
  - apps/web/tests/duel-page-data.test.ts
  - apps/web/tests/presentation-sweep.test.ts # CONDITIONAL — touched ONLY if an existing pin targets removed markup (streak/category); honest migration, never deletion
autonomous: true
requirements: [QUICK-260611-VOB]
must_haves:
  truths:
    - "The duel hero shows the REAL market: marketType 1 (RelativePerformance) with both symbols resolved → giant SYMA/SYMB pair (e.g. ARB/OP, current h1 styling); marketType 0 (PriceTarget) with symA → giant SYMA alone; anything else → the marketLine text itself as the headline at clamp(28px, 6vw, 64px) — symbols come from on-chain getCall feed ids inverted through @call-it/shared PYTH_FEED_IDS; unknown feed id → undefined → degrade, NEVER a fabricated or '—/—' pair (D-07)"
    - "Each duelist's identity is profile-backed: handle from useProfile when source !== 'truncated' (else the wire's truncated fallback), rendered AS STORED with no uppercase transform (D-14/AUTH-44 — handles, never raw wallet addresses, wherever a real handle exists); VERIFIED · X / VERIFIED · FC pills gated on profile.verifiedX/verifiedFc; rep chip (prototype RepBadge recipe, components.jsx:84-103, NO trend arrow) gated on Number.isFinite(globalRep)"
    - "Stats are honest or absent (D-07): REP renders only when globalRep is finite; ACCURACY = Math.round(wins/settledCalls*100)+'%' ONLY when settledCalls > 0 (never 0% from no data); a failed profile fetch renders NO stats row for that side; the 'IN CATEGORY' column is REMOVED entirely; the LIVE SPREAD stat stays HIDDEN (no source — existing D-07 comment at page.tsx:802-803 kept)"
    - "Win-streak is GONE per user constraint 2026-06-11: both 🔥 blocks (~909-916, ~1014-1021), the callerStreak/challengerStreak type fields (127/136) and their mapping lines (269/281) deleted; callerCategoryAccuracy/challengerCategoryAccuracy dead fields out too"
    - "POSITION boxes are real: caller box = marketLine (the call's actual claim; absent → box hidden, D-07); challenger box = the literal duel semantic 'TAKES THE OTHER SIDE.' with a comment justifying it (contract: challenger wins iff the caller loses) — UNLESS a grep of ChallengeFormModal.tsx reveals a real stored challenger-statement rail, in which case wire that instead"
    - "SETTLES IN gets an honest oracle sub line: marketType 0/1 → 'PYTH ORACLE', marketType 2 → 'ATTESTED EVENT', marketType unknown → no sub (D-07); POT keeps its 'winner takes all' sub; consensus bar, riders lists, accept/reject controls, ChallengeFormModal, toast, mobile stacking, DesktopOnlyBanner, 5s liveness ALL untouched"
    - "The new useReadContract getCall callsite carries chainId: ACTIVE_CHAIN_ID (chain-pinning guard tests stay green — D-14 invariant: addresses only from @call-it/shared via '@/lib/chain', reads pinned), enabled only when callId > 0n, staleTime 60_000, NO polling"
    - "D-15 honored: new duel-page-data.test.ts source-assertion + real-module suite added; any existing test pin on removed markup is migrated honestly with a quick-260611-vob comment, never silently deleted; pnpm --filter @call-it/web build exit 0 AND full vitest run ALL green (baseline 335 + new)"
    - "Single atomic commit staging ONLY the explicit file list; NO push (orchestrator pushes — user's 'deploy' = Vercel web deploy on push; web-only, NO Fly deploy); apps/relayer/**, packages/**, 'call it frontend/', docs/, evidence/ never touched"
  artifacts:
    - path: "apps/web/lib/abis/CallRegistry.ts"
      provides: "getCall view fragment — exact 19-field tuple copied from apps/relayer/src/lib/call-enrichment.ts:40-74; additive only"
      contains: "getCall"
    - path: "apps/web/lib/feed-symbols.ts"
      provides: "PYTH_FEED_IDS inversion (lowercased 0x-hex map) + feedIdToSymbol(feedId: bigint): string | undefined — replica of relayer call-enrichment.ts:119-136; unknown → undefined, never guess (D-07)"
      exports: ["feedIdToSymbol"]
    - path: "apps/web/app/duel/[challengeId]/page.tsx"
      provides: "duel page with real data in every slot — on-chain asset-pair hero, marketLine subtitle/positions, profile handles + verified pills + rep chips, gated REP/ACCURACY stats, oracle sub; streak + in-category removed"
      contains: "TAKES THE OTHER SIDE."
    - path: "apps/web/tests/duel-page-data.test.ts"
      provides: "source-assertion pins (wiring, user-constraint removals, honesty gates) + feedIdToSymbol real-module unit pins"
  key_links:
    - from: "apps/web/app/duel/[challengeId]/page.tsx"
      to: "apps/web/hooks/useProfile.ts"
      via: "two unconditional useProfile calls (caller + challenger addresses from the duel wire), placed before any early return"
      pattern: "useProfile"
    - from: "apps/web/app/duel/[challengeId]/page.tsx"
      to: "relayer GET /api/calls/:callId/live-state"
      via: "existing fetchRidingLists (297-323) EXTENDED to also capture marketLine + assetSymbol — same single fetch, zero new requests"
      pattern: "marketLine"
    - from: "apps/web/app/duel/[challengeId]/page.tsx"
      to: "CallRegistry.getCall on-chain"
      via: "wagmi useReadContract, address CALL_REGISTRY_ADDRESS from '@/lib/chain', chainId: ACTIVE_CHAIN_ID, enabled callId > 0n"
      pattern: "ACTIVE_CHAIN_ID"
    - from: "apps/web/app/duel/[challengeId]/page.tsx"
      to: "apps/web/lib/feed-symbols.ts"
      via: "symA = feedIdToSymbol(assetA), symB = feedIdToSymbol(assetB) from the getCall tuple"
      pattern: "feedIdToSymbol"
    - from: "apps/web/lib/feed-symbols.ts"
      to: "@call-it/shared PYTH_FEED_IDS"
      via: "Object.entries inversion, lowercased 0x-prefixed keys"
      pattern: "PYTH_FEED_IDS"
---

<objective>
Wire the duel page's already-built prototype markup to REAL data (user request 2026-06-11, with the prototype duel screenshot: giant ARB/OP hero, question subtitle, stat column, VS card with POSITION boxes + rep/accuracy stats + verified badges + rep chips, consensus bar — "this is how the duel page should look like, and don't add that win streak stuff. deploy when you're done fixing").

ROOT CAUSE (orchestrator-diagnosed, do not re-investigate): apps/web/app/duel/[challengeId]/page.tsx (1145 lines, built in 09.2-11) already HAS the prototype markup, but the duel wire GET /api/duels/:id/live-state returns only challengeId/callId/caller/challenger/stakes/pot/status/winner/reserves/expiry/deferred — so the DuelLiveState mapping (page.tsx:248-295) defensively defaults everything else: assetA/assetB → '—' (hero renders "—/—"), marketLine → '' (no subtitle), handles → truncated addresses, rep/accuracy/positions → 0/''. The fix is web-only: wire real web-side sources (call live-state reuse, on-chain getCall + feed-symbol inversion, useProfile ×2) into those slots, and DELETE the win-streak + in-category fake-data surfaces per the user constraint. The relayer is NEVER touched.

PARALLEL-SESSION CONSTRAINT: a second Claude session shares this tree. RE-READ apps/web/app/duel/[challengeId]/page.tsx IMMEDIATELY before editing and COMPOSE with any changes found — all line numbers in this plan are planning-time anchors, re-locate by content.

Purpose: the live duel page stops looking bare — every slot real or hidden, never faked (D-07).
Output: 1 ABI fragment (additive), 1 new util, 1 page rework, 1 new test suite (+ conditional honest pin migration). Single atomic commit; NO push (orchestrator pushes → Vercel deploys web; no Fly deploy needed).
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@apps/web/app/duel/[challengeId]/page.tsx        — REWORK target (1145 lines). Planning-time anchors: DuelLiveState type fields callerStreak/challengerStreak at 127/136; DuelLiveState mapping 248-295 (defensive defaults — streak mappings at 269/281); fetchRidingLists 297-323 (already fetches /api/calls/:callId/live-state, extracts only followers/faders); hero pair render 792-795 (unconditional {liveState.assetA}/{liveState.assetB}); subtitle .h-3 block 796-800; LIVE SPREAD D-07 comment 802-803 (KEEP); 🔥 streak blocks ~909-916 + ~1014-1021. Existing useReadContract calls sit ABOVE the early returns — place the two useProfile calls alongside them
@apps/web/lib/abis/CallRegistry.ts               — ADD getCall fragment (currently absent); additive only
@apps/web/hooks/useProfile.ts                    — existing profile hook (relayer /api/profile/:address); READ for exact signature/return shape before wiring
@apps/web/lib/relayer-client.ts                  — ProfileResponse (~499+): handle, source ('display_handle'|'ens'|'twitter'|'farcaster'|'truncated'), globalRep, totalCalls, settledCalls, wins, verifiedX, verifiedFc
@apps/web/lib/chain.ts                           — CALL_REGISTRY_ADDRESS + ACTIVE_CHAIN_ID exports (RC1 chain-pinning rule: every read-hook callsite MUST carry chainId: ACTIVE_CHAIN_ID)
@apps/relayer/src/lib/call-enrichment.ts         — READ ONLY CANON, NEVER EDIT: getCall tuple shape at 40-74 (caller/stake/virtualFadeSeed/createdAt/expiry/marketType/eventSubtype/category/status/conviction/openToChallenges/callerExitedAt/outcome/duplicateHash/criteriaHash/assetA/assetB/targetValue/parentCallId); feedIdToSymbol canon at 119-136 (Map over Object.entries(PYTH_FEED_IDS), lowercased keys, bigint → `0x${toString(16).padStart(64,'0')}`, 0n → undefined)
@apps/relayer/src/routes/live-state.ts           — READ ONLY (189-198): call live-state ALSO carries marketLine (authoritative stored statement, else server-built) + assetSymbol (resolved Pyth ticker for assetA; omitted when unknown)
@apps/relayer/src/routes/duel-live-state.ts      — READ ONLY (154-171), DO NOT EDIT: duel wire = challengeId, callId, caller, challenger, callerStake, challengerStake, pot, status, winner, followReserve, fadeReserve, expiry, deferred — NOTHING else; web-only task
@apps/web/app/components/ChallengeFormModal.tsx  — GREP before Task 3(g): does it capture/post any challenger statement/stance to the relayer? Expected NO → generic 'TAKES THE OTHER SIDE.'; if a real stored rail exists, wire it instead
@apps/web/tests/chain-pinning.test.ts            — guard scanning every read-hook callsite; the new getCall useReadContract MUST carry chainId: ACTIVE_CHAIN_ID to stay green
@apps/web/tests/presentation-sweep.test.ts       — CHECK for duel-page pins before editing the page (Task 4b); also grep ALL of apps/web/tests/ for the duel page path
@call it frontend/components.jsx                 — READ ONLY prototype: RepBadge recipe at 84-103 (1px var(--border-active) border, 5px accent-win square, mono 11.5px) — replicate WITHOUT the trend arrow (no source)
</context>

<tasks>

<task type="auto">
  <name>Task 1: apps/web/lib/abis/CallRegistry.ts — add the getCall view fragment (additive only)</name>
  <files>apps/web/lib/abis/CallRegistry.ts</files>
  <action>
ADD a getCall view-function fragment to the existing CallRegistry ABI const. Copy the EXACT tuple shape from apps/relayer/src/lib/call-enrichment.ts:40-74 — input: callId (uint256); output tuple components in order: caller (address), stake, virtualFadeSeed, createdAt, expiry (uint256s as the relayer canon declares them), marketType, eventSubtype, category, status, conviction (uint8s per canon), openToChallenges (bool), callerExitedAt, outcome, duplicateHash, criteriaHash, assetA, assetB, targetValue, parentCallId — mirror the relayer's exact solidity types and component names field-for-field (read the canon block, do not guess widths). Do NOT modify or reorder any existing fragment; do NOT touch contract addresses (D-14: addresses only from @call-it/shared via '@/lib/chain'). One-line comment above the fragment: getCall added for the duel-page on-chain asset/marketType read — tuple mirrors apps/relayer/src/lib/call-enrichment.ts:40-74 (quick-260611-vob).
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && grep -q "getCall" apps/web/lib/abis/CallRegistry.ts && grep -q "assetA" apps/web/lib/abis/CallRegistry.ts && grep -q "parentCallId" apps/web/lib/abis/CallRegistry.ts</automated>
  </verify>
  <done>CallRegistry.ts contains a getCall view fragment whose tuple matches the relayer canon field-for-field; every pre-existing fragment byte-identical.</done>
</task>

<task type="auto">
  <name>Task 2: NEW apps/web/lib/feed-symbols.ts — PYTH_FEED_IDS inversion + feedIdToSymbol(bigint)</name>
  <files>apps/web/lib/feed-symbols.ts</files>
  <action>
New small util module. Import PYTH_FEED_IDS from '@call-it/shared' (symbol → 0x-prefixed feedId string, 24 entries). Build a module-level ReadonlyMap by inverting Object.entries(PYTH_FEED_IDS) with LOWERCASED 0x-prefixed feed-id keys. Export feedIdToSymbol(feedId: bigint): string | undefined — 0n returns undefined; otherwise look up the canonical hex form built as backtick 0x + feedId.toString(16).padStart(64, '0') (already lowercase from toString(16)). Unknown id → undefined — degrade, never guess (D-07). Header comment MUST cite the canon: web-side replica of apps/relayer/src/lib/call-enrichment.ts:119-136 (quick-260611-vob; duel-page hero asset resolution). Keep the signature bigint-only (the page only has on-chain uint256 values) unless reusing the canon's bigint|string union is zero extra cost — either is acceptable, but bigint must be handled exactly as specified.
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && grep -q "PYTH_FEED_IDS" apps/web/lib/feed-symbols.ts && grep -q "feedIdToSymbol" apps/web/lib/feed-symbols.ts && grep -q "padStart(64" apps/web/lib/feed-symbols.ts && grep -q "call-enrichment" apps/web/lib/feed-symbols.ts</automated>
  </verify>
  <done>feed-symbols.ts exports feedIdToSymbol(bigint) → symbol | undefined with the lowercased-hex inversion map, 0n/unknown → undefined, canon citation in the header.</done>
</task>

<task type="auto">
  <name>Task 3: Rework apps/web/app/duel/[challengeId]/page.tsx — real data in every slot, streak + in-category OUT</name>
  <files>apps/web/app/duel/[challengeId]/page.tsx</files>
  <action>
RE-READ THE LIVE FILE FIRST (parallel session shares the tree — compose with any drift; all line anchors below re-locate by content). Markup mostly stays; data slots get real sources. ALL hooks unconditional at component top, BEFORE the early returns — verify where the early returns sit and follow the existing useReadContract placement (already above them).

(a) RIDERS FETCH EXTENSION: fetchRidingLists (297-323) already hits /api/calls/:callId/live-state — extend its return to ALSO carry { marketLine?: string; assetSymbol?: string } from the SAME response (apps/relayer/src/routes/live-state.ts:189-198: marketLine = authoritative stored statement else server-built line; assetSymbol = resolved ticker, omitted when unknown). Store in state (e.g. callLineState). One fetch, ZERO new requests.

(b) ON-CHAIN CALL READ: wagmi useReadContract — abi CallRegistry (now with getCall from Task 1), address CALL_REGISTRY_ADDRESS from '@/lib/chain', functionName getCall, args [callId], chainId: ACTIVE_CHAIN_ID (MANDATORY — chain-pinning.test.ts scans every read-hook callsite), query enabled only when callId > 0n, staleTime 60_000, NO polling/refetchInterval. Derive symA = feedIdToSymbol(assetA), symB = feedIdToSymbol(assetB) (import from '@/lib/feed-symbols'), and marketType from the tuple. When the call live-state's assetSymbol (from (a)) is present it corroborates symA — prefer the on-chain-derived value, they come from the same canon.

(c) HERO RULES — replace the unconditional {liveState.assetA}/{liveState.assetB} pair (792-795): marketType 1 AND symA AND symB → giant SYMA + red slash + SYMB (KEEP the current h1 styling/markup idiom, just feed real symbols); marketType 0 AND symA → giant SYMA, NO slash; otherwise → render the marketLine text itself as the display headline at clamp(28px, 6vw, 64px), same Archivo 900 voice, NO fabricated pair. Subtitle (.h-3 block 796-800): marketLine when present AND not already used as the headline (never duplicate the same string twice). Drop the wire assetA/assetB ('—') usage ENTIRELY; if nothing else consumes liveState.assetA/assetB afterwards, delete those type fields + mapping lines too (dead fields out, same rule as (h)).

(d) STAT COLUMN: keep POT (+ existing 'winner takes all' sub) and SETTLES IN blocks. ADD an honest oracle sub line to SETTLES IN: marketType 0/1 → 'PYTH ORACLE'; marketType 2 → 'ATTESTED EVENT'; marketType unknown (read not loaded/failed) → no sub (D-07). The prototype's LIVE SPREAD stat stays HIDDEN — KEEP the existing D-07 comment at 802-803, render nothing.

(e) HANDLES + IDENTITY: two useProfile calls (caller + challenger addresses from the duel wire), unconditional, above early returns. displayCallerHandle = callerProfile && callerProfile.source !== 'truncated' ? callerProfile.handle : liveState.callerHandle — mirrored for challenger. Handles render AS STORED — NO uppercase transform (user decision precedent; D-14/AUTH-44 handles-never-addresses). Next to each handle: verified pills gated on the profile — verifiedX → 'VERIFIED · X', verifiedFc → 'VERIFIED · FC' (check how the page/ProfileHeader/WalletPill render badge pills and match the page's own idiom, small muted .pill style); plus a rep chip when Number.isFinite(globalRep): mono bordered chip '■ {globalRep.toLocaleString()}' per the prototype RepBadge recipe (call it frontend/components.jsx:84-103 — 1px var(--border-active) border, 5px accent-win square, mono 11.5px; NO trend arrow — no source).

(f) STATS ROW per side — replace the rep/accuracy/category trio: REP = profile.globalRep, rendered only when Number.isFinite; ACCURACY = profile.settledCalls > 0 ? Math.round(profile.wins / profile.settledCalls * 100) + '%' : HIDDEN (D-07 — never 0% from no data); the 'IN CATEGORY' column is REMOVED entirely (no source — the deleted fake-data surface stays dead). A side whose profile fetch failed entirely renders NO stats row (D-07).

(g) POSITION BOXES: caller box text = marketLine (the call's real claim; absent → hide the box entirely, D-07). Challenger box = the literal 'TAKES THE OTHER SIDE.' with a code comment justifying it: the contract semantic — challenger wins iff the caller loses. EXCEPTION first: grep apps/web/app/components/ChallengeFormModal.tsx for any challenger statement/stance capture posted to the relayer; if a real stored challenger-statement rail exists, wire it instead; if not (expected), use the generic line.

(h) STREAK REMOVAL (user constraint 2026-06-11): delete the two 🔥 win-streak blocks (~909-916 and ~1014-1021 regions), the callerStreak/challengerStreak type fields (127/136) and their mapping lines (269/281). Also remove callerCategoryAccuracy/challengerCategoryAccuracy fields + mappings if nothing else consumes them after (f) — dead fields out.

(i) AVATARS: keep DuelAvatar (grad initials — wire avatarUrl is always '' so grads render); only change = feed it the resolved display handle for the grad/initial.

(j) UNTOUCHED: consensus bar + riders lists (reserves real in the wire; ridersCount/pot caption already real), accept/reject Proposed controls, ChallengeFormModal, toast, mobile stacking, DesktopOnlyBanner, 5s liveness — ALL handler logic byte-preserved.

(k) FILE-HEADER COMMENT update: data slots now wired (profiles ×2, call live-state marketLine/assetSymbol reuse, on-chain getCall symbols); streak + in-category REMOVED per user 2026-06-11; live-spread still D-07-hidden. Cite quick-260611-vob.
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && grep -q "useProfile" "apps/web/app/duel/[challengeId]/page.tsx" && grep -q "feed-symbols" "apps/web/app/duel/[challengeId]/page.tsx" && grep -q "ACTIVE_CHAIN_ID" "apps/web/app/duel/[challengeId]/page.tsx" && grep -q "TAKES THE OTHER SIDE." "apps/web/app/duel/[challengeId]/page.tsx" && grep -q "PYTH ORACLE" "apps/web/app/duel/[challengeId]/page.tsx" && grep -q "ATTESTED EVENT" "apps/web/app/duel/[challengeId]/page.tsx" && ! grep -q "callerStreak" "apps/web/app/duel/[challengeId]/page.tsx" && ! grep -q "challengerStreak" "apps/web/app/duel/[challengeId]/page.tsx" && ! grep -q "callerCategoryAccuracy" "apps/web/app/duel/[challengeId]/page.tsx" && pnpm --filter @call-it/web build</automated>
  </verify>
  <done>Build exits 0. Hero/subtitle/stat-column/identity/stats/positions all real-or-hidden per (a)-(g); streak + in-category surfaces and their dead fields gone per (h); avatars/consensus/riders/handlers untouched per (i)-(j); header comment updated per (k); the new getCall read is chainId-pinned, gated on callId > 0n, staleTime 60_000, no polling.</done>
</task>

<task type="auto">
  <name>Task 4: NEW duel-page-data.test.ts + existing-pin check + full gates + atomic commit</name>
  <files>apps/web/tests/duel-page-data.test.ts, apps/web/tests/presentation-sweep.test.ts</files>
  <action>
(b) FIRST — check existing pins BEFORE finalizing: grep the duel page path ("duel/[challengeId]" and "duel/") across apps/web/tests/ (presentation-sweep.test.ts and every other suite; chain-pinning.test.ts scans read-hook callsites — Task 3's chainId: ACTIVE_CHAIN_ID keeps it green by construction). If ANY existing assertion pins removed markup (streak / in-category / the '—' pair render), migrate it HONESTLY: same contract, new location/expectation, one-line comment citing quick-260611-vob — NEVER silently delete (D-15). If no pin targets removed markup (expected), presentation-sweep.test.ts is NOT edited and NOT staged.

(a) NEW apps/web/tests/duel-page-data.test.ts — source-assertion suite in the presentation-sweep read() style (fs readFileSync + join(process.cwd(), ...), cwd = apps/web) plus real-module unit pins:
- WIRING: page source references useProfile with two-call evidence (two distinct call expressions or caller+challenger args); imports '@/lib/feed-symbols'; getCall usage with chainId: ACTIVE_CHAIN_ID in the same callsite region; apps/web/lib/abis/CallRegistry.ts contains the getCall fragment.
- USER CONSTRAINT pins: page source contains NO 'win streak' (case-insensitive), NO 'callerStreak', NO 'challengerStreak'; NO 'In category', NO 'IN CATEGORY', NO 'callerCategoryAccuracy'.
- HONESTY pins (D-07): accuracy gated behind settledCalls > 0 (assert the literal gate expression, e.g. source matches /settledCalls\s*>\s*0/); the string 'TAKES THE OTHER SIDE.' exists; the '—' pair fallback is gone — no render of the wire fields (assert source has no 'liveState.assetA' / 'liveState.assetB' occurrences); no stat-label renders LIVE SPREAD (the D-07 comment may mention it — pin that no JSX-rendered literal like '>LIVE SPREAD<' exists).
- feedIdToSymbol REAL-MODULE unit pins (import the actual module, not source text): the BTC feed id from @call-it/shared PYTH_FEED_IDS (BigInt of the 0x value) maps back to 'BTC'; 0n → undefined; an unknown id (e.g. 1n) → undefined.
- IDENTITY pins: page source references verifiedX, verifiedFc, and a Number.isFinite-gated globalRep (rep chip + pills wiring evidence).

GATES (ALL must pass before commit):
- cd "C:/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/web build → exit 0
- pnpm --filter @call-it/web exec vitest run → ALL green (baseline 335 + new suite; chain-pinning + presentation-sweep + every other suite stays green)

COMMIT (single atomic; Git Bash; NO push — orchestrator pushes, which IS the user's 'deploy': Vercel auto-deploys web on push; no Fly deploy, web-only). Stage ONLY these explicit paths via individual git add:
- git add apps/web/app/duel/"[challengeId]"/page.tsx
- git add apps/web/lib/abis/CallRegistry.ts
- git add apps/web/lib/feed-symbols.ts
- git add apps/web/tests/duel-page-data.test.ts
- PLUS any test file actually edited in (b) — listed explicitly by path (expected: none)
- git commit -m "feat(quick-260611-vob): duel page wired to real data — profiles (handles/rep/accuracy/verified), on-chain asset pair hero, marketLine positions, oracle sub; win-streak + in-category removed (user)"

NEVER git add -A / git add . / git add -u. NEVER stage or touch: apps/relayer/**, packages/**, packages/contracts/lib/openzeppelin-contracts, 'call it frontend/', docs/, evidence/, .planning/config.json, .gitignore, .claude/.
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/web exec vitest run</automated>
  </verify>
  <done>Full vitest run ALL green (335 baseline + new duel-page-data suite; any (b) migration green and commented); build exit 0; git show --stat HEAD lists EXACTLY the staged files (4 expected, +explicit migrations only); no push; relayer/packages/prototype/docs/evidence untouched.</done>
</task>

</tasks>

<verification>
- pnpm --filter @call-it/web build → exit 0 (typed routes + tsc clean).
- pnpm --filter @call-it/web exec vitest run → ALL green: 335 baseline intact (chain-pinning green via the pinned getCall callsite), new duel-page-data suite green, any migrated pin green with quick-260611-vob comment.
- Source spot-checks: page.tsx has useProfile ×2 / feed-symbols import / chainId: ACTIVE_CHAIN_ID / 'TAKES THE OTHER SIDE.' / 'PYTH ORACLE' / 'ATTESTED EVENT', and has NO callerStreak/challengerStreak/IN CATEGORY/callerCategoryAccuracy/liveState.assetA renders; CallRegistry.ts has the getCall fragment; feed-symbols.ts has the padStart(64,'0') inversion + canon citation.
- git show --stat HEAD → exactly the explicit staged file list; git status → apps/relayer/**, packages/**, 'call it frontend/', docs/, evidence/ untouched.
- NO push performed (orchestrator pushes; Vercel deploy follows the push — that is the user's requested deploy; no Fly deploy).
</verification>

<success_criteria>
- [ ] Live duel page hero shows the real asset pair (RelativePerformance) / single asset (PriceTarget) from on-chain getCall + PYTH_FEED_IDS inversion, or the marketLine headline fallback — never '—/—', never fabricated (D-07)
- [ ] marketLine + assetSymbol captured from the EXISTING call live-state fetch (zero new requests); marketLine feeds subtitle + caller POSITION box (absent → hidden); challenger POSITION = 'TAKES THE OTHER SIDE.' (or a real stored challenger statement if ChallengeFormModal grep finds one)
- [ ] Both duelists show profile-backed handles AS STORED, VERIFIED · X / VERIFIED · FC pills, RepBadge-recipe rep chips (no trend arrow), and settledCalls-gated ACCURACY; failed profile → no stats row (D-07, D-14/AUTH-44)
- [ ] Win-streak and IN CATEGORY are fully removed (markup + type fields + mappings) per the user's explicit constraint; LIVE SPREAD stays hidden (D-07)
- [ ] SETTLES IN carries the honest oracle sub (PYTH ORACLE / ATTESTED EVENT / none); POT, consensus bar, riders, accept/reject, modals, toast, mobile, liveness untouched
- [ ] getCall read is chainId-pinned (ACTIVE_CHAIN_ID), enabled callId > 0n, staleTime 60_000, no polling — chain-pinning guard green
- [ ] D-15: new test suite green, any existing pin migrated honestly (never deleted), build + full vitest (335 baseline + new) exit 0; single atomic commit with the exact message; NO push, web-only
</success_criteria>

<output>
Create `.planning/quick/260611-vob-duel-page-data/SUMMARY.md` when done (quick-task summary: what shipped, gate results with before/after test counts, commit hash, the ChallengeFormModal grep outcome for the challenger-position exception, any parallel-session drift found at the pre-edit re-read and how it was composed, and any honestly-migrated pins listed by file+line).
</output>
