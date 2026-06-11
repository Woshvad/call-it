---
id: quick-260611-5mh-01
phase: quick-260611-5mh
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/relayer/src/lib/call-enrichment.ts (new)
  - apps/relayer/src/routes/feed.ts
  - apps/relayer/src/routes/live-state.ts
  - apps/relayer/src/routes/profile.ts
  - apps/relayer/src/routes/notifications.ts
  - apps/relayer/src/routes/call-positions.ts (new)
  - apps/relayer/src/routes/duel-live-state.ts (alias path only, if needed)
  - apps/relayer/src/index.ts
  - apps/relayer/src/**/*.test.ts (new/updated colocated vitest files)
autonomous: true
must_haves:
  truths:
    - "/api/feed price-target items return real assetSymbol, expiry, targetValue (1e8 string), and marketLine — no more asset:'' / expiry:'0' (RC2, D-05)"
    - "/api/live-state/:id responses include assetSymbol, targetValue, marketLine via the same enrichment helper"
    - "/api/profile/:address accepts CHECKSUMMED addresses (no 400) and returns REAL subgraph globalRep/totalCalls/settledCalls/wins/losses plus a calls history array"
    - "/api/notifications?callId=14&type=challenge_proposed returns filtered results WITHOUT requiring user; existing user+cursor behavior byte-identical"
    - "GET /api/calls/:id/positions returns 200 with the shape the web's FinalPosition type expects (never 404)"
    - "The duel-live-state path the web actually calls resolves 200 for an existing challenge"
    - "Enrichment failure degrades gracefully — feed/live-state return current shape, never throw, never 500"
  artifacts:
    - path: "apps/relayer/src/lib/call-enrichment.ts"
      provides: "Shared enrichment helper: viem multicall against CallRegistry getCall + in-process immutable cache + Pyth feedId→symbol reverse map + marketLine builder"
    - path: "apps/relayer/src/routes/call-positions.ts"
      provides: "GET /api/calls/:id/positions backed by subgraph Position entities"
  key_links:
    - from: "apps/relayer/src/routes/feed.ts"
      to: "apps/relayer/src/lib/call-enrichment.ts"
      via: "enrichment helper call per feed page"
    - from: "apps/relayer/src/lib/call-enrichment.ts"
      to: "CallRegistry 0xc79bB19dBCA44D8b467b9f7bbb191b56e9fb3CB0 (Arbitrum Sepolia)"
      via: "ONE viem multicall per feed page, getCall(id)"
    - from: "apps/relayer/src/routes/profile.ts"
      to: "apps/relayer/src/lib/subgraph-client.ts queryProfileCalls (lines 353-369, currently UNUSED)"
      via: "calls history array"
---

<objective>
Fix the relayer data layer so the site stops rendering placeholder garbage: enrich feed/live-state with real on-chain call data (the D-05 enrichment that was never built), make the profile route return real subgraph stats instead of hardcoded zeros, add the missing positions endpoint the web already calls, add notification filters for the pending-challenge banner, and align the duel-live-state route path.

Purpose: Live /api/feed today literally returns {"asset":"","expiry":"0","statement":"Price target call #14"} and /api/profile returns hardcoded totalCalls:0/globalRep:100 while the subgraph holds real data. This plan is the data foundation PLAN-03 (web presentation) builds on.
Output: Updated relayer routes + new enrichment module + new positions route, all response changes ADDITIVE/backward-compatible.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
</execution_context>

<context>
@apps/relayer/src/routes/feed.ts
@apps/relayer/src/routes/live-state.ts
@apps/relayer/src/routes/profile.ts
@apps/relayer/src/routes/notifications.ts
@apps/relayer/src/lib/subgraph-client.ts
@apps/relayer/src/index.ts
@packages/shared/src/constants/pyth-feed-ids.ts
@packages/shared/src/constants/addresses.ts
</context>

## Verified Root Cause (from live investigation 2026-06-11 — TRUST THIS, do not re-derive)

**RC2 MISSING RELAYER ENRICHMENT (D-05):** `packages/subgraph/src/call-registry.ts:90-100` deliberately sets `asset=''` / `expiry=BigInt(0)` / `conviction=50` / `statement='Price target call #N'` with comments saying "relayer enriches" — that enrichment was never built. Live `/api/feed` items literally return `{"asset":"","expiry":"0","statement":"Price target call #14"}`. Real data IS on-chain: `getCall(14)` decoded → `assetA=0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace` (= ETH/USD Pyth feed id), `expiry=1780931059`, `targetValue=100000000000000` (1e14 = $1,000,000 at 1e8 scale), `conviction=50`. The `CallCreated` event only carries `(id, caller, marketType, stake)` per `packages/contracts/src/interfaces/ICallRegistry.sol:65` — the subgraph CANNOT index the rest from events; the relayer must enrich from chain reads.

**RC4 PROFILE ROUTE BLIND:** `apps/relayer/src/routes/profile.ts` returns hardcoded `totalCalls:0/globalRep:100/wins:0` (never queries subgraph Profile stats; `queryProfileCalls()` in `apps/relayer/src/lib/subgraph-client.ts:353-369` exists UNUSED) and its address validation REJECTS checksummed addresses (live curl with `0x7304A289Aa8d5a4DB23eb78c143E9aA376415CeD` → 400 invalid_address; all-lowercase works). Subgraph truth exists and disagrees: `profile(0xda8c5726f596e8dae99e6ddeba8aea1c8be9a4a5)` = globalRep 98, totalCalls 2, settledCalls 2, wins 2. The Twitter identity chain WORKS for the address that linked: `/api/profile/0x8c311b8ce783034e501930b71958f1374ea8598b` returns handle "@woshvad", source "twitter", verifiedX true.

**Other live findings owned by this plan:** `GET /api/calls/1/duel-live-state` → 404 (path mismatch with what the web calls); `GET /api/calls/:id/positions` → 404 (route does not exist; web already calls it from `apps/web/app/call/[id]/page.tsx:335-350` fetchFinalPositions); `/api/notifications` returns 400 without `user` (web needs callId/type filtering for the pending-challenge banner).

## Global Constraints (binding)

- **D-15:** never weaken tests to pass — update expectations only where behavior intentionally changed, with honest reasoning in the SUMMARY.
- **D-07:** degrade-to-hidden (absent data hidden, never zeros/fakes).
- **D-27:** subgraph Studio key stays server-side; no subgraph URLs into client code.
- **DO NOT TOUCH:** packages/contracts (deployed), packages/subgraph mappings, settlement worker Redis config, OG fonts.
- **Relayer response changes ADDITIVE ONLY** — the OG route and the Farcaster Mini App also consume these endpoints. Keep all existing keys and casing (`status` stays 'Live'/'Settled' TitleCase — the web normalizes on its side in PLAN-03).
- **No Redis for new caching** — Upstash quota is exhausted (settlement worker already down because of it). Use an in-process Map.
- Direct master commit, atomic, ONE commit for this whole plan: `fix(quick-260611-5mh): relayer feed/live-state enrichment + profile stats + positions endpoint + notification filters`. ALWAYS check `git status` for the `packages/contracts/lib/openzeppelin-contracts` submodule and NEVER stage it.
- pnpm on Windows via Git Bash (use the Bash tool, not PowerShell, for pnpm/flyctl).

<tasks>

<task type="auto">
  <name>Task 1: Call enrichment module + feed enrichment (A1) + live-state additions (A2)</name>
  <files>apps/relayer/src/lib/call-enrichment.ts (new), apps/relayer/src/routes/feed.ts, apps/relayer/src/routes/live-state.ts, colocated tests</files>
  <action>
    Create `apps/relayer/src/lib/call-enrichment.ts` — a shared enrichment helper used by both feed.ts and live-state.ts:

    1. **Chain read:** ONE viem `multicall` per feed page against CallRegistry `0xc79bB19dBCA44D8b467b9f7bbb191b56e9fb3CB0` (Arbitrum Sepolia; this matches `CALL_REGISTRY_ARBITRUM_SEPOLIA` in `packages/shared/src/constants/addresses.ts:96`) calling `getCall(id)` for each item. Reuse the existing viem public-client + ABI patterns already present in `apps/relayer/src/routes/live-state.ts` (it already does createPublicClient RPC reads) — do not invent a parallel client config. Read the getCall return struct from the existing ABI to learn exact field names (assetA, assetB, expiry, conviction, targetValue, marketType, direction/comparator if present).
    2. **Reverse map feedId→symbol:** `packages/shared` ALREADY exports `PYTH_FEED_IDS` (symbol → 0x-prefixed feedId) from `packages/shared/src/constants/pyth-feed-ids.ts` — do NOT create a new shared file. Build the reverse map inside call-enrichment.ts by inverting `PYTH_FEED_IDS` (Object.entries), comparing feed IDs lowercased (on-chain bytes32 vs the 0x-prefixed constants). Unknown feedId → assetSymbol undefined (degrade, never guess).
    3. **Cache:** in-process `Map<callId, enrichedFields>` for the IMMUTABLE post-creation fields (asset, expiry, conviction, targetValue, marketType, statement inputs) — cache never expires. Do NOT use Redis — Upstash quota is exhausted.
    4. **marketLine builder (server-side string):** marketType 0 (PriceTarget) → e.g. "ETH ≥ $1,000,000" (targetValue ÷ 1e8, en-US locale formatting, no decimals unless value < $10; use the comparator from the struct if one exists, else ≥). marketType 1 (RelativePerformance) → "A vs B" form if BOTH assets resolve via the reverse map, else degrade. marketType 2 (Event) → keep the existing statement.
    5. **Graceful degradation:** if the multicall/RPC fails (timeout, revert, bad RPC), return items UNCHANGED in their current shape — never throw, never block the feed. Wrap with the existing `with-timeout.ts` helper if appropriate.

    Then wire it in:
    - **feed.ts (A1):** enrich each subgraph feed item with real `expiry`, `conviction`, `assetSymbol`, `targetValue` (STRING, raw 1e8-scale), and `marketLine`. Fields are ADDITIVE — keep all existing keys and casing (`status` stays 'Live'/'Settled' TitleCase).
    - **live-state.ts (A2):** add `assetSymbol`, `targetValue` (string), `marketLine` to the response using the SAME helper (share the module + the cache instance).

    Add/extend colocated vitest coverage: reverse-map resolution (ETH feedId → "ETH"), marketLine formatting ($1,000,000 no decimals; sub-$10 with decimals), cache hit skips multicall, RPC failure returns unenriched items unchanged.
  </action>
  <verify>
    <automated>cd "/c/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/shared build && pnpm --filter @call-it/relayer build && pnpm --filter @call-it/relayer exec vitest run</automated>
  </verify>
  <done>feed.ts and live-state.ts responses carry additive assetSymbol/targetValue/marketLine/expiry/conviction enrichment from one multicall per page with an in-process immutable cache; RPC failure returns the current shape untouched; build + relayer vitest green.</done>
</task>

<task type="auto">
  <name>Task 2: Profile route — checksummed addresses, real subgraph stats, calls history (A3)</name>
  <files>apps/relayer/src/routes/profile.ts, apps/relayer/src/lib/subgraph-client.ts (only if a stats query helper must be added), colocated tests</files>
  <action>
    Fix `apps/relayer/src/routes/profile.ts` (RC4):

    (a) **Accept checksummed addresses:** lowercase the input address BEFORE validation/use. `0x7304A289Aa8d5a4DB23eb78c143E9aA376415CeD` must no longer 400; behavior for already-lowercase input unchanged.

    (b) **Real stats:** query the subgraph Profile entity (entity id = lowercased address) for `globalRep`, `totalCalls`, `settledCalls`, `wins`, `losses` and return REAL values instead of the hardcoded `totalCalls:0/globalRep:100/wins:0` defaults. Graceful degrade: if the subgraph query fails, fall back to the current defaults (do not 500). Known-good truth to test against: profile `0xda8c5726f596e8dae99e6ddeba8aea1c8be9a4a5` = globalRep 98, totalCalls 2, settledCalls 2, wins 2.

    (c) **ADD a `calls: [...]` history array** using the existing UNUSED `queryProfileCalls()` in `apps/relayer/src/lib/subgraph-client.ts:353-369`. Items: `id`, `status`, `outcome`, `stake`, `createdAt`, `statement`, plus enriched `marketLine`/`assetSymbol` if cheaply available — reuse the Task 1 enrichment cache (`apps/relayer/src/lib/call-enrichment.ts`); degrade to `statement` when enrichment is unavailable.

    **DO NOT REGRESS** the route's existing handle/socials resolution — it works (live: `/api/profile/0x8c311b8ce783034e501930b71958f1374ea8598b` returns handle "@woshvad", source "twitter", verifiedX true). All changes additive; existing response keys keep their names and types.

    Tests: checksummed input accepted (lowercased), real stats passthrough from a mocked subgraph response, subgraph failure → current defaults, calls array shape, socials resolution untouched.
  </action>
  <verify>
    <automated>cd "/c/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/relayer build && pnpm --filter @call-it/relayer exec vitest run</automated>
  </verify>
  <done>Checksummed addresses return 200; response carries real globalRep/totalCalls/settledCalls/wins/losses from the subgraph (defaults only on query failure) plus a calls history array; handle/socials resolution behavior unchanged; tests green.</done>
</task>

<task type="auto">
  <name>Task 3: Notification filters (A4) + new positions endpoint (A5) + duel path alignment (A6)</name>
  <files>apps/relayer/src/routes/notifications.ts, apps/relayer/src/routes/call-positions.ts (new), apps/relayer/src/routes/duel-live-state.ts (alias only if needed), apps/relayer/src/index.ts, colocated tests</files>
  <action>
    **A4 — notifications.ts:** currently requires `user` param (400 otherwise). Add OPTIONAL `callId` + `type` query params: when present, filter notifications by callId/type and make `user` optional in that mode. Keep the existing user+cursor behavior BYTE-IDENTICAL (no shape, ordering, or pagination changes for current callers). The web will call `GET /api/notifications?callId=14&type=challenge_proposed` for the pending-challenge banner on call pages.

    **A5 — NEW route GET /api/calls/:id/positions:** the web already calls it (`apps/web/app/call/[id]/page.tsx:335-350` fetchFinalPositions → currently 404). FIRST read the web's `FinalPosition` type in that file to match the expected response shape exactly, THEN implement `apps/relayer/src/routes/call-positions.ts` by querying subgraph Position entities (schema fields: `callId`, `user`, `side`, `usdcDeposited`, `sharesHeld`, `entryTime`, `exitedAt`). Return `{ positions: [] }` (or the exact empty shape the web expects) when none. Register the route in `apps/relayer/src/index.ts` following the existing import + registration pattern (lines 34-68 import block).

    **A6 — duel route path mismatch:** live curl `GET /api/calls/1/duel-live-state` → 404. Compare what `apps/relayer/src/routes/duel-live-state.ts` actually registers (it exists, registered via `duelLiveStateRoute` in index.ts:50) against what `apps/web/app/duel/[challengeId]/page.tsx` fetchDuelLiveState (~line 239) calls. Align by keeping/adding the relayer path the web expects — an ALIAS route on the relayer is fine; do not break the existing path (Mini App may use it). **Record in the SUMMARY which path is canonical** so PLAN-03 (C6) can align the web side.

    Tests: callId/type filtering, user+cursor mode unchanged (snapshot/byte-identical assertion), positions endpoint shape + empty case, duel alias resolves.
  </action>
  <verify>
    <automated>cd "/c/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/relayer build && pnpm --filter @call-it/relayer exec vitest run</automated>
  </verify>
  <done>Notifications support optional callId/type filters with legacy mode untouched; /api/calls/:id/positions exists, is registered, and matches the web's FinalPosition shape; duel-live-state path the web calls resolves; canonical duel path documented in SUMMARY; build + tests green.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @call-it/shared build && pnpm --filter @call-it/relayer build` succeeds.
- Full relayer vitest suite passes (`pnpm --filter @call-it/relayer exec vitest run`) — no weakened tests (D-15).
- Grep-confirm no Redis usage was added to new code paths: enrichment cache is an in-process Map.
- Grep-confirm all changed routes kept their existing response keys (additive only).
- Settlement worker and Redis config untouched (`git status` shows no changes under workers/settlement or redis config).
</verification>

<success_criteria>
- Feed items for price-target calls expose real assetSymbol/expiry/targetValue/marketLine sourced from getCall, with graceful RPC degradation.
- Profile route: checksummed-safe, real stats, calls history, socials untouched.
- Positions endpoint live and shape-matched to the web; notifications filterable by callId/type; duel path aligned and documented.
- ONE atomic commit: `fix(quick-260611-5mh): relayer feed/live-state enrichment + profile stats + positions endpoint + notification filters` — submodule `packages/contracts/lib/openzeppelin-contracts` NOT staged.
</success_criteria>

<output>
Create `.planning/quick/260611-5mh-fix-all-site-review-findings/SUMMARY-01.md` when done. MUST include: the canonical duel-live-state path (for PLAN-03 C6), the exact enriched-field names added to feed/live-state responses (for PLAN-03 C1/C3/C13), and the positions response shape.
</output>
