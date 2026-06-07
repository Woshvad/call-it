# Phase 7: OG service final variants + Subgraph final mappings - Research

**Researched:** 2026-06-07
**Domain:** Off-chain OG share loop (@vercel/og + Satori) · The Graph subgraph mapping finalization · auto-post worker · Next.js App Router pages · Vercel/Fly deploy + CORS
**Confidence:** HIGH (the entire phase is finalization of code that already exists in-repo; nearly every claim is VERIFIED by reading the actual source files)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 (Subgraph publish, SC3):** **Defer the Decentralized-Network publish to Phase 10.** Phase 7 finalizes + VERIFIES ALL ~20 event mappings on the existing **Sepolia Studio** subgraph (`call-it-sepolia` v0.8.0) and keeps the Phase-0 polled-events fallback live. The ~3,000 GRT (~$100-300) DN publish is a Phase-10 mainnet task. **Do NOT plan the DN publish or `api.callitapp.xyz` cutover here.**
- **D-02 (Auto-post-to-X/Farcaster, SC2):** **Build the full mechanism, gate the write on key presence.** Cache-warm verification (`?v={statusVersion}` to force regen → HEAD 200 + correct ETag before posting; on failure delay ≤30s then retry — Pitfall 8) + post-text construction + Farcaster cast-URL construction. The actual X write **degrades to a no-op when X API write keys are absent** (mirror the Phase-1.5 feed degrade-to-empty pattern) and activates with no code change once keys land. Default-ON per SC2 (Advanced Settings toggle). **Planner MUST reconcile with the Pitfall-18 dispute-safety / claim-delay decision in the Phase-4 settlement runbook.**
- **D-03 (OG/receipt real-data wiring, SC1):** **Market statement comes from a new subgraph `Call` entity field**, populated from `CallCreated` data/criteria during SC3 mapping finalization. Wire OG route + receipt page to read it single-source (replaces the `Call #N` stub). Remaining OG stubs (P&L / REP CHANGE / FINAL / TARGET, currently `—`) are wired from SettlementManager settlement events via the same subgraph reads. **No IPFS fetch on the hot path.**
- **D-04 (Web deploy, SC4/SC5):** **Deploy `apps/web` to Vercel (`call-it-web-sepolia`)** on the recovery cluster. **CONSTRAINT:** the Fly relayer CORS-blocks cross-origin; the deploy MUST add the Vercel origin to the relayer's CORS allowlist or receipt/profile pages won't hydrate. Mainnet domain cutover stays in Phase 10.

### Claude's Discretion
- Exact subgraph `Call` entity field name/shape for the market statement.
- The custom eslint rule implementation that rejects `display: grid` in OG sources (flexbox-only is already followed; this adds the enforcement gate).
- 200px visual-regression harness (Playwright already installed in `apps/web`; reuse it).
- Profile/Leaderboard/Quote component structure (reuse `@call-it/ui` primitives).

### Deferred Ideas (OUT OF SCOPE)
- Decentralized-Network subgraph publish (~3,000 GRT) → **Phase 10**.
- Mainnet OG domain cutover (`api.callitapp.xyz`) → **Phase 10** (Sepolia uses the Vercel origin via `NEXT_PUBLIC_OG_BASE_URL`).
- X API write-key provisioning → when budgeted (mechanism ships gated in Phase 7).
- Farcaster Mini App frame actions (Follow/Fade/Challenge from a cast) → **Phase 8**.
- Mobile responsive (375px) on the 7 critical pages → **Phase 9**.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OPS-04 | Subgraph indexes CallCreated within ~30s of emission | All ~20 handlers already wired in `subgraph.yaml` + mappings; SC3 is finalize+verify. Verify via Studio sync-lag + polled-events fallback. (§Subgraph Mapping Finalization) |
| SHARE-01 | Off-chain OG service generates 1200×630 PNG via @vercel/og / Satori | Built: `og/[callId]/route.ts`, `og/duel/[challengeId]/route.ts`, `og/fallback`. `@vercel/og@0.11.1`, `satori@0.26.0`, Node runtime. (§OG Real-Data Wiring) |
| SHARE-02 | OG hosted at `api.callitapp.xyz/og/[callId]` | **Sepolia uses the Vercel origin** via `NEXT_PUBLIC_OG_BASE_URL` (D-12); `api.callitapp.xyz` is Phase 10 (D-01 deferred). Plan against Vercel origin. |
| SHARE-03 | OG cached on CDN, regenerated on state change | `Cache-Control: max-age=60, stale-while-revalidate=300` + `?v={statusVersion}` cache-bust already in place; statusVersion bumped by `notification-fanout` worker. (§Cache-Warm + Versioning) |
| SHARE-13 | Receipt OG cards pass Twitter Card Validator pre-flight | SC1 gate. Validate the 5 variant URLs after the D-04 Vercel deploy (needs a public origin). (§CI / Pre-flight Gates) |
| SHARE-14 | Receipt page server-renders OpenGraph meta tags | `call/[id]/layout.tsx generateMetadata` already emits `og:image=/og/{id}?v={statusVersion}` + twitter:card. Wire `marketLine` from subgraph (D-03). |
| SHARE-15 | Share button generates Twitter intent URL | Build on receipt/profile pages alongside the auto-post text builder (shared text construction). (§Auto-Post Worker) |
| SHARE-16 | Auto-post default ON per Advanced Settings | D-02. Default-ON toggle; degrade to no-op when keys absent. |
| SHARE-17 | Auto-post never modifies X account beyond posting | D-02. The write path is the only X mutation; read-only graph access is the separate `x-api-client.ts` (follows.read). |
| SHARE-18 | Farcaster cast URL construction parallel to Twitter intent | D-02. Warpcast compose-intent URL builder. (§Auto-Post Worker) |
| SHARE-20 | Receipts are off-chain OG images referenced onchain by hash, NOT NFTs | Already the architecture — `criteriaHash` on-chain, OG image off-chain. No NFT minting anywhere. Verify no regression. |
| SHARE-21 | Receipt page loads without auth; sign-in CTA prominent | `middleware.ts` PUBLIC_PREFIXES carve-out already in place (fixed `fd79a74`). Verify post-deploy in incognito. |
| UI-09 | Profile Overview tab (5-stat row, CATEGORY REPUTATION, recent calls, most-followed, notable receipts) | Build from `@call-it/ui` primitives; data via relayer `/api/profile` + subgraph. (§Profile/Leaderboard/Quote Pages) |
| UI-12 | Leaderboard page (`/leaderboard`) — title, time toggle, Hero card, category chips, table | **New route** — does not exist yet. Build from primitives. Needs a leaderboard data source. (§Open Questions Q3) |
| UI-13 | Leaderboard table columns + viewer-row highlight | Per UI-SPEC: rank/handle/rep mono bold; viewer row = accent left border + `#1A1A24` bg. |
| UI-26 | Quote Composer at `/new?quote=[parentCallId]` with parent context card | Route + minimal banner already exist in `app/new/page.tsx`; build out parent card + thread. |
| UI-27 | Quote Composer renders YOUR THESIS textarea ABOVE market-type buttons | New-call form modification under `?quote=` mode. |
| UI-28 | Quote Composer success screen shows thread preview + Share button | Build success state (parent + quote stacked OG cards). |
</phase_requirements>

## Summary

Phase 7 is a **finalization phase, not a greenfield build.** Almost everything is already in the repo and working in a stubbed/deferred state. The research confirms five concrete realities the planner must build on:

1. **OG cards are built and render**, but read on-chain via **viem directly** (NOT the subgraph). The market statement is hardcoded `Call #${callId}` and the settled stats (P&L / REP CHANGE / FINAL / TARGET) are `—`. D-03 wiring means adding a subgraph read to the OG routes for the human-readable statement + settled fields. **The on-chain `CallCreated` event does NOT carry the statement string** (`CallCreated(uint256 id, address caller, uint8 marketType, uint96 stake)`), so the statement field cannot be populated purely from event data inside the AssemblyScript mapping — this is the single biggest design decision in the phase (see Open Questions Q1 and the Architecture section).

2. **All ~20 subgraph event handlers already exist** in `subgraph.yaml` + the five mapping files. SC3 is "finalize + VERIFY they index correctly," plus add **one new `Call` entity field** (the market statement) and re-deploy `v0.8.0 → v0.9.0` to Studio. The DN publish is deferred (D-01).

3. **The auto-post worker does not exist yet.** It belongs in the **relayer** (`apps/relayer/src/workers/`), triggered on `CallSettled` (the settlement-watcher and notification-fanout patterns are the template). The cache-warm verification, text construction, Twitter-intent + Farcaster-cast URL builders, and the key-gated no-op write are all new code. The `x-api-client.ts` degrade-to-empty pattern is the exact template for key-gating.

4. **The CI grid-lint is currently fake** — `eslint.config.js` is empty (zero rules); the "no-grid" check is a string-match in a Playwright test with a `console.warn` escape hatch. SC1 requires a **real custom eslint rule**.

5. **The CORS change for D-04 is an env-var change, not code.** `apps/relayer/src/index.ts:117-133` already adds `NEXT_PUBLIC_OG_BASE_URL` + a comma-separated `CORS_ALLOWED_ORIGINS` override to the allowlist. Adding the Vercel origin = set that Fly secret + redeploy/restart the relayer.

**Primary recommendation:** Treat Phase 7 as wiring + enforcement, not construction. The largest real design work is (a) deciding how the human-readable market statement reaches the subgraph `Call` entity given the event lacks the string (recommend: a relayer-written enrichment, see Architecture), and (b) building the relayer auto-post worker with the Pitfall-8 cache-warm gate and the Pitfall-18 claim-delay reconciliation.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| OG card PNG render | Frontend Server (Next.js Node runtime route) | — | Satori needs Node runtime; resvg-wasm bundling fails on edge. Already correct. |
| OG card data read (statement, settled fields) | Subgraph (read) + Frontend Server (OG route fetches it) | CallRegistry RPC (freshness for status/outcome only) | D-03: single-source from subgraph; but Pitfall 8 says status/outcome read fresh from RPC to avoid lag (the route already reads RPC for status). |
| Market-statement field population | **Relayer** (writes enrichment) → Subgraph (stores/serves) | — | On-chain event lacks the string. Relayer is the only component that knows it at create time (it already runs `calls-preflight` criteria writes). See Open Questions Q1. |
| Subgraph event indexing | Subgraph (The Graph Studio) | Relayer polled-events fallback (Phase 0) | All handlers exist; SC3 verifies + adds the new field. |
| Auto-post worker (cache-warm + post) | **Relayer** (BullMQ/poll worker) | OG service (HEAD probe target), X API / Warpcast (post targets) | Long-running, key-holding, settle-triggered — exactly the relayer's role (settlement-watcher precedent). NOT Vercel (Pitfall: Vercel functions can't host long workers). |
| Twitter-intent / Farcaster-cast URL build | Relayer (auto-post) + Frontend (Share button) | — | Same text/URL builder shared by SHARE-15 (manual) and SHARE-16/18 (auto). |
| Profile / Leaderboard / Quote pages | Frontend (Next.js App Router) | Relayer `/api/*` proxy + subgraph | Reuse `@call-it/ui`; data via relayer proxy (D-27 keeps Studio key server-side). |
| Web deploy + CORS allowlist | Vercel (web host) + Fly (relayer CORS env) | — | D-04. CORS is an env-var change on the existing allowlist code. |
| CI grid-lint + 200px visual regression | CI (eslint custom rule + Playwright) | — | SC1 enforcement gates. |

## Standard Stack

All versions are **already pinned and installed** in the repo and match CLAUDE.md. No new runtime dependencies are required for the core phase; the only candidate new dev-dependency is for the visual-regression diff (see Package Legitimacy Audit).

### Core (already installed — VERIFIED by reading package.json)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@vercel/og` | `0.11.1` `[VERIFIED: apps/web/package.json]` | OG PNG render (wraps satori + resvg-wasm) | CLAUDE.md pin; Node-runtime only. |
| `satori` | `0.26.0` (bundled in @vercel/og) `[VERIFIED]` | HTML→SVG; **flexbox only, no grid** | Pitfall 15. |
| `next` | `16.2.6` `[VERIFIED]` | App Router + OG route hosting + SSR meta | CLAUDE.md pin. |
| `@playwright/test` | `^1.48.0` `[VERIFIED]` | 200px visual-regression + Twitter-card pre-flight harness | Already used for og-fallback specs. |
| `@graphprotocol/graph-cli` | `0.98.1` `[VERIFIED: packages/subgraph/package.json]` | `graph codegen` / `graph build` / `graph deploy` | CLAUDE.md pin. |
| `@graphprotocol/graph-ts` | `0.38.2` `[VERIFIED]` | AssemblyScript mapping types | CLAUDE.md pin. |
| `bullmq` + `ioredis` | installed (relayer) `[VERIFIED: settlement-watcher imports]` | Auto-post worker queue (settle-triggered, delayed retry) | Matches settlement-watcher pattern. |
| `pino` | `9.x` (relayer logger) `[VERIFIED]` | Structured logs for the auto-post worker | Project mandate. |

### Supporting (built-in / no new deps)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| native `fetch` | Node 22 | X API v2 POST /2/tweets, HEAD cache-warm probe, subgraph GraphQL | The repo deliberately avoids an X SDK (see `x-api-client.ts` note). Mirror that: thin `fetch` wrapper for the write path too. |
| `@fastify/cors` | installed `[VERIFIED: index.ts]` | Relayer CORS allowlist (D-04) | Already wired; add origin via env. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom eslint rule (no-display-grid) | `eslint-plugin-no-inline-styles` or a generic regex CI grep | A custom flat-config rule is more precise (matches `display: 'grid'`, `gridTemplate*`, `gridColumn*` only in OG files) and is what SC1 asks for. A grep guard is the cheap fallback if the custom rule slips. |
| Playwright pixel-diff for 200px gate | `pixelmatch` + `pngjs` manual diff, or Playwright's built-in `toHaveScreenshot` | Playwright's built-in `expect(page).toHaveScreenshot()` needs no new dep and already ships with `@playwright/test`. Prefer it over adding `pixelmatch`. |
| Subgraph statement field populated in-mapping | Relayer-written enrichment via a synthetic on-chain event OR a Studio-side mutation (not possible) | The event lacks the string; pure in-mapping derivation can only produce a templated statement from `marketType`/`asset`/`targetValue` numerics, NOT the caller's actual prose. See Open Questions Q1. |

**Installation:** No `npm install` required for the core phase. If the planner chooses Playwright built-in screenshots (recommended), nothing new is added. If a manual pixel-diff is chosen, that introduces a new dep — gate it behind the Package Legitimacy Audit below.

**Version verification (run at plan time, not assumed):**
```bash
node -e "console.log(require('./apps/web/package.json').dependencies['@vercel/og'])"   # expect 0.11.1
node -e "console.log(require('./packages/subgraph/package.json').devDependencies['@graphprotocol/graph-cli'])"  # expect 0.98.1
```

## Package Legitimacy Audit

> The core phase adds **no external runtime packages** — every library is already in the lockfile and matches CLAUDE.md pins. slopcheck was not run because no new package is proposed; the recommended path (Playwright built-in `toHaveScreenshot`) uses an already-installed, CLAUDE.md-pinned dependency.

| Package | Registry | Disposition |
|---------|----------|-------------|
| `@vercel/og` 0.11.1 | npm | Already installed, CLAUDE.md-pinned — Approved (no change) |
| `@playwright/test` ^1.48.0 | npm | Already installed — Approved (use built-in screenshots) |
| `@graphprotocol/graph-cli` 0.98.1 | npm | Already installed, CLAUDE.md-pinned — Approved |
| *(any pixel-diff lib, e.g. `pixelmatch`)* | npm | **Only if** the planner rejects Playwright built-in screenshots. If proposed, MUST run the Package Legitimacy Gate (slopcheck + `npm view`) before install and gate behind `checkpoint:human-verify`. Recommendation: **do not add** — use Playwright built-in. |

**Packages removed due to slopcheck [SLOP] verdict:** none (no new packages).
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram (the share loop, Phase-7-final)

```
                          ┌─────────────────────────────────────────────┐
  Caller composes call    │  apps/web  (Vercel: call-it-web-sepolia)     │
  ──────────────────────▶ │  /new (+ ?quote=)  → on-chain CallCreated    │
                          └───────────────┬─────────────────────────────┘
                                          │ POST /api/calls/criteria (callId, statement?)
                                          ▼
   on-chain  CallRegistry.CallCreated     ┌──────────────────────────────┐
   (id, caller, marketType, stake)   ───▶ │ apps/relayer (Fly: iad)       │
            (NO statement string!)        │  calls-preflight → criteria   │
                                          │  + NEW: statement enrichment  │ ── writes statement ──┐
                                          └──────────┬───────────────────┘                        │
                                                     │ settle path (BullMQ)                        │
   on-chain SettlementManager.CallSettled            ▼                                             ▼
   (callId, outcome, priceDelta)  ───────▶ ┌──────────────────────┐         ┌───────────────────────────┐
   RepCalculated / RepCalculatedFallback   │ settlement-watcher    │         │ The Graph Studio subgraph  │
                                           └──────────┬───────────┘         │ call-it-sepolia v0.9.0     │
                                                      │ on settle confirmed  │ Call.statement (NEW field) │
                                                      ▼                      │ Settlement / RepEvent      │
                                          ┌──────────────────────────┐      └─────────────┬──────────────┘
                                          │ NEW: auto-post worker     │                    │ GraphQL (Studio key,
                                          │ 1. bump statusVersion     │                    │ relayer-only D-27)
                                          │ 2. GET /og/{id}?v={sv}    │ ── force regen ──▶ │
                                          │ 3. HEAD 200 + ETag check  │ ◀── X-Variant ─────┤
                                          │    (≤30s retry, Pitfall 8)│                    │
                                          │ 4. claim-delay guard      │   ┌────────────────▼──────────────┐
                                          │    (Pitfall 18 reconcile) │   │ apps/web /og/[callId] route    │
                                          │ 5. IF X keys: POST tweet  │   │ (Vercel Node runtime)          │
                                          │    ELSE: no-op (log)      │   │ reads subgraph Call.statement  │
                                          │ 6. Farcaster cast URL     │   │ + Settlement fields → PNG      │
                                          └──────────────────────────┘   └────────────────────────────────┘
                                                                                          ▲
   Viewer clicks shared link ──▶ /call/[id] (public, middleware carve-out) ── og:image ──┘
   /profile/[address] · /leaderboard · /quote ── fetch /api/* on Fly relayer (CORS allowlist = D-04)
```

### Recommended Project Structure (net-new files only — most code already exists)
```
apps/web/
├── app/
│   ├── leaderboard/page.tsx          # NEW — UI-12/13 (route does not exist yet)
│   ├── profile/[address]/            # EXISTS — extend ProfileClient.tsx for Overview tab (UI-09)
│   └── new/page.tsx                  # EXISTS — extend ?quote= mode (UI-26/27/28)
├── lib/
│   └── share-text.ts                 # NEW — shared Twitter-intent + Farcaster-cast URL builder (SHARE-15/18)
├── tests/
│   └── og-thumbnail-200px.spec.ts    # NEW — 200px visual-regression gate (SC1)
└── eslint.config.js                  # EXTEND — add custom no-display-grid rule (SC1)
apps/web/eslint-rules/
└── no-display-grid-in-og.js          # NEW — custom flat-config rule
apps/relayer/src/
├── workers/
│   └── auto-post-worker.ts           # NEW — settle-triggered cache-warm + post (D-02)
├── lib/
│   └── x-write-client.ts             # NEW — POST /2/tweets, key-gated no-op (mirror x-api-client.ts)
└── routes/
    └── calls-criteria.ts (or similar)# EXTEND — accept + persist statement at create time (Q1)
packages/subgraph/
├── schema.graphql                    # EXTEND — add Call.statement field
└── src/call-registry.ts              # EXTEND — populate statement (see Q1 for the source)
```

### Pattern 1: OG route reads subgraph for display fields, RPC for freshness
**What:** D-03 says single-source the statement from the subgraph. But Pitfall 8 says status/outcome must be read fresh (RPC) to avoid the 5–30s subgraph lag showing a stale "live" card on a settled call.
**When to use:** The Settled card.
**Resolution:** Keep the existing RPC read of `status`/`outcome` (it's already there, `og/[callId]/route.ts:782-795`), and ADD a subgraph read for the human-readable `statement` + settled-stat fields (P&L/REP CHANGE/FINAL/TARGET). The statement is immutable post-create so subgraph lag doesn't matter for it; the settled stats come from `Settlement` + `RepEvent` which only exist after settle anyway.
```typescript
// Source: apps/web/app/og/[callId]/route.ts:777 (current stub)
const callStatement = `Call #${callIdStr}`;   // ← REPLACE: fetch Call.statement from subgraph
// settled-stat stubs at :811-814 ('—') ← REPLACE: Settlement.priceDelta/finalPrice + RepEvent.delta
```

### Pattern 2: Relayer worker as the share-loop driver (settlement-watcher precedent)
**What:** The auto-post worker mirrors `settlement-watcher.ts` (BullMQ delayed jobs, `try/catch` that never throws, `sendAlertSafe` on failure) and `notification-fanout.ts` (settle-triggered fan-out, idempotent via dedup key).
**Example:**
```typescript
// Source: apps/relayer/src/workers/settlement-watcher.ts:715-728 (error discipline to copy)
} catch (err) {
  logger.error({ event: 'auto_post_error', callId, error: message }, 'auto-post failed');
  // Do NOT throw — worker must keep running (polled-events-fallback pattern)
}
```

### Pattern 3: Key-gated degrade-to-no-op (x-api-client.ts precedent)
**What:** Exactly mirror the read-graph client's missing-key handling for the WRITE path.
```typescript
// Source: apps/relayer/src/lib/x-api-client.ts:73-79 (the pattern to mirror)
const token = process.env.X_API_WRITE_TOKEN;   // OAuth1.0a or OAuth2 user-context for POST /2/tweets
if (!token) {
  logger.warn({ event: 'x_write_no_key' }, 'X write keys absent — auto-post degrades to no-op');
  return { posted: false, reason: 'no_key' };   // ← no throw, no crash; activates when keys land
}
```
> Note: read access (follows.read) and write access (tweet.write) are **different OAuth scopes/credentials**. The existing `X_API_BEARER_TOKEN` is app-only read; posting a tweet needs **user-context** auth (OAuth 2.0 PKCE user token or OAuth 1.0a). `[ASSUMED]` — verify the exact credential type when keys are budgeted (Phase 10 / when-budgeted).

### Pattern 4: `?v={statusVersion}` cache-bust is already wired end-to-end
**What:** `notification-fanout` bumps Redis `status_version:{callId}`; `live-state` returns it; `call/[id]/layout.tsx` injects `/og/{id}?v={statusVersion}` into og:image. The auto-post worker reuses the same statusVersion to force OG regen before posting.
**Source:** `live-state.ts:142-144` (`statusVersionKey`), `call/[id]/layout.tsx:70`.

### Anti-Patterns to Avoid
- **`display: grid` in any OG file** — Satori silently misrenders (Pitfall 15). The DuelSettled two-column layout is the temptation; it already uses `flexDirection: 'row'` correctly — keep it.
- **Reading the statement from RPC/on-chain** — it isn't there. The `CallCreated` event is 4 fields; the `Call` struct has no string. Don't try to decode a statement from `assetA`/`targetValue` for the hot path beyond a templated fallback.
- **Posting before cache-warm** — Pitfall 8: the tweet preview would show the stale live card on the "CALLED IT" moment. Always HEAD-verify `X-Variant: settled` (or `caller-exited`) before posting.
- **Posting before the claim window logic is reconciled** — Pitfall 18: auto-post drives instant claims; a dispute at hour-22 can't reverse claims made at hour-1. Reconcile with the Phase-4 runbook decision before enabling default-ON.
- **Vercel functions for the worker** — they can't run the long-lived settle-triggered loop. It lives in the Fly relayer.
- **Edge runtime on any OG route** — `resvg-wasm` bundling fails. Every route already has `export const runtime = 'nodejs'` as line 1; the eslint rule should also assert this.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OG PNG rendering | Custom canvas/sharp pipeline | `@vercel/og` (installed) | Already built + working for all 5 variants. |
| Outcome word + color | New color map | `getOutcomeWordResult()` (`lib/outcome-word.ts`) | §14.1 locked hex; D-08/D-09 logic; reused by cards + receipt. |
| Settle → worker trigger | New event poller | BullMQ + settlement-watcher pattern | Precedent exists; idempotency + retry solved. |
| Subgraph GraphQL from relayer | New client | `lib/subgraph-client.ts` `executeQuery()` | D-27 Studio-key-server-side already enforced. |
| CORS allowlist | New middleware | `index.ts` cors block + `CORS_ALLOWED_ORIGINS` env | Allowlist code already accepts the override. |
| Cache-bust versioning | New scheme | Redis `status_version:{callId}` (already bumped) | End-to-end wired through live-state + layout. |
| Profile/Leaderboard/Quote UI atoms | New components | `@call-it/ui` (`Card`/`Tag`/`Stamp`/`ConvictionBar`/`Receipt`/`ProfileHeader`/`CallCard`/`Skeleton*`) | Mature in-repo design system; UI-SPEC mandates reuse. |
| Pixel diff for 200px gate | `pixelmatch`+`pngjs` | Playwright `expect(...).toHaveScreenshot()` | No new dep; ships with `@playwright/test`. |

**Key insight:** The phase's risk is almost entirely in *integration seams* (statement source → subgraph → OG; settle → cache-warm → post; web origin → relayer CORS), not in building new subsystems. Plan tasks around verifying seams, not authoring components.

## Runtime State Inventory

> Phase 7 deploys a new web origin and re-publishes the subgraph. It is partly a deploy/migration phase, so this inventory applies.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **Subgraph index** (`call-it-sepolia` v0.8.0 on Studio) does not yet have a `Call.statement` field. Existing seeded Sepolia calls created before the field exists will index with an empty/derived statement on re-deploy. **Redis `status_version:{callId}` + `livestate:{callId}`** keys (Upstash) carry live state. | Add field + re-deploy as **v0.9.0**; decide backfill for pre-existing calls (Q1). statusVersion keys are fine as-is. |
| Live service config | **Fly relayer CORS allowlist** is env-driven (`NEXT_PUBLIC_OG_BASE_URL` + `CORS_ALLOWED_ORIGINS`) — the Vercel origin is NOT in it yet. **X API write keys** are absent (mechanism degrades to no-op). **`SUBGRAPH_STUDIO_DEPLOY_KEY`** needed to run `graph deploy`. | Set the Fly secret for the Vercel origin + restart. Deploy key must be present at deploy time. |
| OS-registered state | None — no Task Scheduler / launchd / pm2 named state introduced by this phase. | None — verified by scanning relayer boot (`index.ts`) and workers; all workers start in-process via `onReady`. |
| Secrets / env vars | NEW relayer env: `X_API_WRITE_TOKEN` (+ likely consumer key/secret for user-context auth) — absent by design. `CORS_ALLOWED_ORIGINS` (Fly) — to be set. Web build: `NEXT_PUBLIC_OG_BASE_URL`, `NEXT_PUBLIC_RELAYER_URL`/`RELAYER_URL`, `NEXT_PUBLIC_SUBGRAPH_URL` baked at build time (Pitfall 5). | Document the new vars; X write vars stay unset (gated). NEXT_PUBLIC_* must be set BEFORE `pnpm build` on Vercel. |
| Build artifacts | `packages/subgraph/build/` + `generated/` are regenerated by `graph codegen && graph build`; stale after schema edit. | Re-run `pnpm --filter @call-it/subgraph build` after the schema change before deploy. |

**The canonical question — after every file is updated, what runtime state still has stale data?** (1) The Studio subgraph until re-deployed to v0.9.0; (2) the Fly relayer CORS env until the Vercel origin is added; (3) Vercel's NEXT_PUBLIC_* build cache until a fresh deploy; (4) Twitter's ~24h preview cache (re-submit to the validator after deploy — Pitfall 8).

## Common Pitfalls

### Pitfall 1 (= research Pitfall 15): Satori silently drops `display: grid`
**What goes wrong:** A grid layout renders fine in Chrome but at 200px on X the outcome word vanishes. **Why:** Satori is flexbox-only; the warning is buried in logs. **How to avoid:** The custom eslint rule (SC1) banning `display:'grid'`/`gridTemplate*`/`gridColumn*` in `apps/web/app/og/**` + `lib/og-*`. **Warning signs:** Satori "unsupported CSS" warnings; element missing at thumbnail only. The current enforcement is a fake test string-match — replace it with a real rule.

### Pitfall 2 (= research Pitfall 8): OG cache out of sync → wrong preview on the "CALLED IT" tweet
**What goes wrong:** Auto-post fires before the CDN regenerated the settled card; the most important tweet shows the old live card. **Why:** subgraph/RPC/CDN move at different speeds; Twitter caches the first preview ~24h. **How to avoid (exact sequence per SC2):** (1) bump statusVersion, (2) `GET /og/{id}?v={sv}` to force regen, (3) `HEAD /og/{id}?v={sv}` and assert `200` + `X-Variant: settled|caller-exited` + a stable ETag, (4) only then post; on failure delay ≤30s and retry. **Warning signs:** auto-tweet content ≠ receipt page; `X-Variant: live` on a settled call.

### Pitfall 3 (= research Pitfall 18): Auto-post drives instant claims the dispute window can't reverse
**What goes wrong:** Default-ON auto-post notifies winners at settle; they claim within hours; a dispute at hour-22 can't undo claimed payouts (v1 doesn't honor post-claim disputes). **Why:** the dispute economics assumed slow manual-share claim activity. **How to avoid:** **Reconcile with the Phase-4 settlement runbook before enabling default-ON.** Options the planner must choose among (and surface to the user, since this is `[ASSUMED]` until the runbook is read): (a) keep auto-post default-ON but confirm the runbook already added a claim-delay/dispute-window mitigation; (b) gate auto-post behind claim-window-open; (c) operator-runbook compensation path. **Warning signs:** >50% of claims in first 4h; a dispute resolving against the original outcome after claims. **Action for planner: locate the Phase-4 runbook's Pitfall-18 decision (`04-*` docs / settlement runbook) and make the auto-post trigger consistent with it.**

### Pitfall 4 (= research Pitfall 5): Sepolia↔origin config drift baked into the Vercel build
**What goes wrong:** `NEXT_PUBLIC_*` are baked at build time; a wrong `NEXT_PUBLIC_OG_BASE_URL` or `NEXT_PUBLIC_SUBGRAPH_URL` ships silently and pages don't hydrate / OG renders fallback for everything. **How to avoid:** Set all NEXT_PUBLIC_* on Vercel BEFORE build; a post-deploy smoke step (incognito receipt load + OG render + `X-Variant` check). **Warning signs:** OG fallback for every callId (wrong RPC/subgraph URL); "Failed to fetch" in console (CORS / wrong relayer URL).

### Pitfall 5 (new, phase-specific): The statement field can't come from the event alone
**What goes wrong:** A planner assumes the AssemblyScript mapping can write `Call.statement` from `CallCreated` — but the event has no string. The mapping can only template from numerics (`marketType`+`asset`+`targetValue`). **How to avoid:** Decide the statement source explicitly (Open Questions Q1). Recommended: relayer enrichment at create time (it already runs `calls-preflight`). **Warning signs:** statement renders as a generic templated line instead of the caller's prose.

## Code Examples

### Custom eslint flat-config rule (no display:grid in OG sources) — SC1
```js
// Source pattern: ESLint flat config custom rule (apps/web/eslint-rules/no-display-grid-in-og.js)
// Targets ObjectExpression style props; flags display:'grid' and grid* properties.
export default {
  meta: { type: 'problem', docs: { description: 'Satori does not support CSS grid (Pitfall 15)' } },
  create(context) {
    return {
      Property(node) {
        const key = node.key.name ?? node.key.value;
        const val = node.value.value;
        if (key === 'display' && val === 'grid') {
          context.report({ node, message: "Satori does not support display:'grid' — use flexbox." });
        }
        if (typeof key === 'string' && /^grid(Template|Column|Row|Area|Auto)/.test(key)) {
          context.report({ node, message: `Satori does not support '${key}' — use flexbox.` });
        }
      },
    };
  },
};
// Wire into eslint.config.js scoped to: files: ['app/og/**/*.{ts,tsx}', 'app/api/og/**/*.ts', 'lib/og-*.ts']
```

### 200px visual-regression gate (Playwright built-in, no new dep) — SC1
```typescript
// Source pattern: apps/web/tests/og-thumbnail-200px.spec.ts (reuses existing playwright.config.ts)
import { test, expect } from '@playwright/test';
const VARIANTS = [
  { word: 'CALLED IT',        url: '/og/{settledWinId}'  },
  { word: 'LOUD AND WRONG',   url: '/og/{settledLossId}' },
  { word: 'CONTRARIAN HIT',   url: '/og/{contrarianId}'  },
  { word: 'COLD CALL',        url: '/og/{coldId}'        },
  { word: 'FADED CORRECTLY',  url: '/og/{faderId}?as=fader' },
];
for (const v of VARIANTS) {
  test(`200px thumbnail legible: ${v.word}`, async ({ page }) => {
    // Render the PNG, downscale viewport to 200px-equivalent, screenshot-diff against baseline.
    await page.setViewportSize({ width: 200, height: 105 }); // 1200x630 @ ~1/6
    await page.goto(v.url);
    await expect(page).toHaveScreenshot(`og-200-${v.word.replace(/ /g,'-')}.png`, { maxDiffPixelRatio: 0.02 });
  });
}
```
> Pre-flight Twitter Card Validator is **manual/semi-automated** — `cards-dev.twitter.com/validator` requires a public URL (needs the D-04 Vercel deploy first) and isn't easily scriptable. Plan it as a post-deploy operator checklist step against the 5 variant receipt URLs.

### Subgraph schema field addition (Claude's-discretion shape) — D-03 / SC3
```graphql
# Source: packages/subgraph/schema.graphql — add to the existing Call entity (do not break existing fields)
type Call @entity(immutable: false) {
  id: ID!
  caller: Bytes!
  # ... existing fields unchanged ...
  reasoning: String          # already exists (currently null)
  statement: String          # NEW (D-03) — human-readable market statement; nullable for safety
}
```
> The Call entity already has a `reasoning: String` field. The planner should decide whether to add a new `statement` field or repurpose `reasoning` (recommend a distinct `statement` field to avoid semantic overload). Whichever: the mapping must set a **safe default** (templated fallback) so the OG/receipt never crash when the enrichment hasn't run (per UI-SPEC error-state row).

### Twitter intent + Farcaster cast URL builders (shared SHARE-15/18)
```typescript
// Source pattern: apps/web/lib/share-text.ts (shared by manual Share button + relayer auto-post)
export function twitterIntentUrl(receiptUrl: string, text: string) {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(receiptUrl)}`;
}
export function warpcastComposeUrl(receiptUrl: string, text: string) {
  // Warpcast compose-intent — embeds[]=receiptUrl renders the OG card as a cast embed.
  return `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(receiptUrl)}`;
}
```
> `[ASSUMED]` the Warpcast compose-intent URL shape (`warpcast.com/~/compose?text=...&embeds[]=...`). Verify against current Farcaster docs at plan time — Warpcast intent URLs have changed historically. The auto-post worker only *constructs* the cast URL in Phase 7 (D-02); landing the cast programmatically is Phase 8 (Mini App).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OG card statement = `Call #N` stub | Subgraph `Call.statement` field, single-source (D-03) | This phase | Real prose on the receipt; no IPFS hot-path fetch. |
| Settled stats `—` | `Settlement` + `RepEvent` subgraph reads | This phase | P&L/REP CHANGE/FINAL/TARGET populated. |
| Grid-lint = Playwright string-match w/ `console.warn` escape | Real custom eslint flat-config rule | This phase | Actual CI enforcement (the current "rule" doesn't fail builds). |
| Manual share only | Auto-post default-ON, key-gated, cache-warm-verified | This phase | SHARE-16/17/18; gated until X keys land. |
| Subgraph on Studio only (Sepolia) | Stays on Studio (DN deferred to Phase 10) | D-01 | No GRT spend now; polled-events fallback stays live. |

**Deprecated/outdated for this phase:**
- The Playwright `og-fallback.spec.ts` Test 5 "ESLint check skipped — not configured in Phase 0" branch is now obsolete — SC1 makes the rule real; the test can assert the rule fires (eslint exits non-zero on a planted `display:'grid'`).
- ROADMAP SC1/SC3 text still references `api.callitapp.xyz` + the DN publish — **CONTEXT D-01 overrides** (defer to Phase 10). Plan to CONTEXT, not the stale ROADMAP wording.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Market statement is best sourced via **relayer enrichment** at create time (the event lacks the string) | Architecture / Q1 | If the user wants a pure-on-chain/IPFS source, the data-flow design changes; but D-03 explicitly bans IPFS on the hot path and says "subgraph Call entity field," so relayer-write→subgraph is the natural fit. Needs user confirmation of the exact write path. |
| A2 | X write requires **user-context** OAuth (not the existing app-only bearer) | Pattern 3 | If wrong, the credential provisioning differs; non-blocking now (degrade-to-no-op), confirm when keys budgeted. |
| A3 | Warpcast compose-intent URL shape `warpcast.com/~/compose?text=&embeds[]=` | Code Examples | Cast URL would be malformed; verify against Farcaster docs at plan time. Phase 7 only constructs it (Phase 8 lands it). |
| A4 | Playwright built-in `toHaveScreenshot` is sufficient for the 200px gate without a new dep | Standard Stack | If the team wants perceptual-hash diffing, a new dep is needed (gate via Package Legitimacy). |
| A5 | Pitfall-18 reconciliation outcome (claim-delay vs default-ON) is recorded in the Phase-4 runbook | Pitfalls | If the runbook left it open, the planner must surface a decision to the user before enabling default-ON auto-post. |
| A6 | Leaderboard needs a data source that does not yet exist (no `/leaderboard` route; `LeaderboardEntry` entity exists in schema but no mapping populates it) | Open Questions Q3 | If unaddressed, UI-12/13 ships with empty data. Needs a rep-ranking source (subgraph `Profile.globalRep` sort, or relayer aggregation). |

## Open Questions (RESOLVED)

> All four open questions are RESOLVED in 07-CONTEXT.md (post-research decision session, 2026-06-07). Original question text is preserved below for traceability; each carries an inline RESOLVED → D-0X pointer.

1. **How does the human-readable market statement reach the subgraph `Call.statement` field?**
   **RESOLVED → D-05 (see 07-CONTEXT.md):** Relayer-authoritative prose read via `/api/calls/:id/live-state` `marketLine`; the subgraph `Call.statement` field holds an in-mapping templated mirror as the indexed safe fallback (reconciles D-03 + "no IPFS on hot path" with the AssemblyScript constraint).
   - What we know: `CallCreated` event = `(id, caller, marketType, stake)` — NO string. The `Call` struct has no statement string (only numeric `assetA`/`assetB`/`targetValue`/hashes). The relayer already persists per-call off-chain data (`call_oracle_criteria`, `quote_stance`) and runs `calls-preflight` after `CallCreated`. The frontend `/new` flow knows the prose at compose time.
   - What's unclear: D-03 says the field lives on the subgraph `Call` entity, but AssemblyScript mappings can only read event/contract data — they cannot read the relayer DB. So either (a) the relayer enriches via a separate path the subgraph can index (e.g. a future on-chain enrichment event — out of scope, contracts are frozen), (b) the OG/receipt reads the statement from the **relayer** and the "subgraph field" is conceptual, or (c) the subgraph mapping writes a **templated** statement from numerics and the relayer/IPFS supplies the prose elsewhere.
   - Recommendation: **Confirm with the user.** Most likely intended path given D-03 + "no IPFS on hot path": the relayer stores the statement (it already has the criteria table — add a `statement` column), and the OG route + receipt read it via the relayer `/api/calls/:id/live-state` (which the receipt layout ALREADY reads `marketLine` from — see `live-state.ts:18-20` IN-03 note). The subgraph `Call.statement` then holds a **templated fallback** for queryability/feed, and the authoritative prose comes from the relayer. This reconciles "subgraph field" + "single-source, no IPFS" with the AssemblyScript constraint. **The planner should treat the relayer `marketLine` as the real statement source and add the subgraph field as the indexed/templated mirror.**

2. **Pitfall-18 / claim-delay reconciliation for default-ON auto-post.**
   **RESOLVED → D-07 (see 07-CONTEXT.md):** Build the full mechanism, default-ON, fires after cache-warm succeeds; reconciled against the Phase-4 runbook (no on-chain claim-delay exists — reversal affects unclaimed funds only) with a configurable post-settle delay; the X write still degrades to a no-op when keys are absent (D-02).
   What did the Phase-4 settlement runbook decide? The auto-post trigger MUST be consistent with it. If the runbook deferred it, surface a decision to the user (default-ON now vs gate behind claim window).

3. **Leaderboard data source (UI-12/13).**
   **RESOLVED → D-06 (see 07-CONTEXT.md):** All-time leaderboard sorts `Profile.globalRep` from the subgraph at read time (no new worker infra); the 7d/30d toggles ship wired but backed by All-time data with a documented v1 limitation. The windowed-aggregation worker is deferred (not Phase 7 scope).
   `LeaderboardEntry` exists in `schema.graphql` but no mapping populates `rank`/`score`/`window` (it's an empty entity). Options: (a) frontend/relayer sorts `Profile.globalRep` from the subgraph at read time (simplest, works for All-time; 7d/30d windows need time-bounded rep aggregation the subgraph doesn't currently compute); (b) a relayer worker computes windowed leaderboards into Postgres (like `duel-king-worker`). Recommend (a) for All-time + a documented limitation on 7d/30d for v1, OR confirm scope with the user.

4. **Twitter Card Validator automation.**
   **RESOLVED → D-08 (see 07-CONTEXT.md):** SHARE-13 pre-flight is a post-deploy operator checklist (the 5 variant receipt URLs run through `cards-dev.twitter.com/validator`), NOT a CI gate — it needs a public URL and isn't cleanly scriptable.
   It needs a public URL and isn't cleanly scriptable. Plan as a post-deploy operator checklist (5 variant URLs), not a CI gate — confirm that satisfies SHARE-13's "pre-flight smoke test" intent.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@vercel/og` / satori | OG render (SHARE-01) | ✓ | 0.11.1 / 0.26.0 | — |
| `@graphprotocol/graph-cli` | Subgraph deploy (SC3) | ✓ (devDep) | 0.98.1 | — |
| `SUBGRAPH_STUDIO_DEPLOY_KEY` | `graph deploy` to Studio | ✗ (operator secret) | — | Dry-run build only (`deploy:sepolia:dry-run`) |
| `@playwright/test` | 200px gate (SC1) | ✓ | ^1.48.0 | — |
| Vercel project `call-it-web-sepolia` | Web deploy (D-04) | ✗ (operator creates) | — | None — blocking for SC5 + Twitter Card Validator |
| Fly relayer (running) + CORS env | Page hydration (D-04) | ✓ relayer / ✗ origin in allowlist | — | None — blocking for receipt/profile hydration |
| `X_API_WRITE_TOKEN` (user-context) | Live auto-post (SHARE-16) | ✗ (by design) | — | **Degrade to no-op** (D-02) — mechanism ships, activates when keys land |
| Twitter Card Validator | SHARE-13 pre-flight | ✓ (web tool) | — | Manual operator step; needs public URL (post-D-04) |
| Redis/Upstash (statusVersion, BullMQ) | cache-warm + worker | ✓ | — | — |

**Missing dependencies with no fallback (blocking):**
- Vercel project + NEXT_PUBLIC_* env set before build (SC5).
- Fly CORS env updated with the Vercel origin (D-04 constraint).
- `SUBGRAPH_STUDIO_DEPLOY_KEY` to publish v0.9.0 (SC3) — operator gate.

**Missing dependencies with fallback:**
- X write keys → auto-post no-ops (D-02 designed for this).

## Validation Architecture

> nyquist_validation is `true` in config — this section drives VALIDATION.md.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (`@playwright/test ^1.48.0`) for web/OG; Vitest (`^3.0.0`) for subgraph mapping unit tests; Vitest for relayer worker tests (`apps/relayer/src/workers/__tests__`) |
| Config file | `apps/web/playwright.config.ts` (exists); `packages/subgraph/vitest.config.ts` (exists); relayer vitest (exists) |
| Quick run command | `pnpm --filter @call-it/web exec playwright test og-thumbnail-200px.spec.ts` |
| Full suite command | `pnpm --filter @call-it/web exec playwright test && pnpm --filter @call-it/subgraph test && pnpm --filter @call-it/relayer test && pnpm --filter @call-it/web exec eslint app/og` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SC1 / SHARE-01 | 5 variants render 1200×630 PNG | e2e | `playwright test og-*` | ✅ (extend fallback specs to all 5) |
| SC1 / Pitfall 15 | no `display:grid` in OG sources | lint | `eslint app/og app/api/og lib/og-*` w/ custom rule | ❌ Wave 0 (rule + config) |
| SC1 | 200px outcome-word legible (5 words) | visual regression | `playwright test og-thumbnail-200px.spec.ts` | ❌ Wave 0 |
| SHARE-13 | Twitter Card Validator pass (5 variants) | manual operator | n/a (public URL required, post-D-04) | ❌ (checklist, not CI) |
| SC2 / Pitfall 8 | cache-warm: regen → HEAD 200 + X-Variant + ETag before post; ≤30s retry | integration | relayer vitest mocking OG HEAD + fake clock | ❌ Wave 0 |
| SC2 / SHARE-16/17 | key absent → no-op (no throw); key present → POST called once | unit | relayer vitest (mirror x-api-client tests) | ❌ Wave 0 |
| SC2 / SHARE-18 | Farcaster cast URL constructed correctly | unit | `share-text.ts` builder unit test | ❌ Wave 0 |
| SC2 / Pitfall 18 | auto-post trigger consistent with claim-window decision | integration/assertion | worker test asserting trigger gate matches runbook | ❌ Wave 0 (after Q2 resolved) |
| SC3 / OPS-04 | all ~20 events index; CallCreated < 30s | subgraph integration | Studio query after seed; verify entity counts; sync-lag check | ❌ Wave 0 (verification script) |
| SC3 / D-03 | `Call.statement` populated + read by OG/receipt; safe fallback when absent | subgraph unit + e2e | vitest mapping test + playwright OG-reads-statement | ❌ Wave 0 |
| SC4 / UI-09 | Profile Overview renders 5-stat + sections | e2e | `playwright test profile.spec.ts` | ❌ Wave 0 |
| SC4 / UI-12/13 | Leaderboard renders title/toggle/hero/table/viewer-row | e2e | `playwright test leaderboard.spec.ts` | ❌ Wave 0 |
| SC4 / UI-26/27/28 | Quote Composer parent card + thesis-above + success thread | e2e | `playwright test quote.spec.ts` | ❌ Wave 0 |
| SC5 / SHARE-14/21 | receipt server-renders og:image meta; public no-auth load | e2e | `playwright test receipt-meta.spec.ts` (assert meta + 200 incognito) | ❌ Wave 0 |
| SC5 / D-04 | Vercel origin hydrates against Fly relayer (CORS) | post-deploy smoke | curl OPTIONS preflight + browser hydration check | ❌ (operator + smoke script) |

### Sampling Rate
- **Per task commit:** the task's targeted spec (e.g. `playwright test og-thumbnail-200px.spec.ts` or the relayer worker vitest) + `eslint app/og`.
- **Per wave merge:** full web Playwright suite + subgraph vitest + relayer vitest.
- **Phase gate:** full suite green + manual Twitter Card Validator pass (5 variants) + post-deploy incognito receipt load, before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `apps/web/eslint-rules/no-display-grid-in-og.js` + wire into `eslint.config.js` (scoped to OG files) — SC1
- [ ] `apps/web/tests/og-thumbnail-200px.spec.ts` + committed 200px baselines — SC1
- [ ] Extend OG render specs to cover all 5 variants (currently only fallback) — SC1
- [ ] `apps/relayer/src/workers/__tests__/auto-post-worker.test.ts` (cache-warm + key-gate + retry + Pitfall-18 gate) — SC2
- [ ] `apps/web/lib/share-text.ts` builder + unit test — SHARE-15/18
- [ ] Subgraph mapping vitest for `Call.statement` default + populate — SC3/D-03
- [ ] Subgraph event-coverage verification script (~20 events index on Studio) — SC3/OPS-04
- [ ] Profile / Leaderboard / Quote Playwright specs — SC4
- [ ] Receipt-meta + public-load spec — SC5
- [ ] Post-deploy CORS preflight smoke (curl OPTIONS) — D-04

## Security Domain

> `security_enforcement` is not set to false in config — included.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (auto-post X write keys) | X write keys via **GCP Secret Manager** (relayer pattern) / Fly secrets — never in code or logs (pino redact already lists secrets, `index.ts:89-101`). Add `X_API_WRITE_TOKEN` to the redact list. |
| V3 Session Management | partial | Receipt/profile/leaderboard are public (SHARE-21); no session on those. Quote-post mutations stay Privy-session-gated (existing `/api/quote-stance` pattern). |
| V4 Access Control | yes | D-27 keeps the Subgraph Studio key server-side (relayer-only). Auto-post worker uses relayer credentials; never exposes write keys to frontend. CORS allowlist (D-04) is an explicit-origin allowlist, NOT `*`. |
| V5 Input Validation | yes | `callId` validation already present in OG/live-state routes (BigInt parse → fallback). Statement string from relayer must be length-capped + treated as untrusted in the OG render (already truncated at 77/87 chars). |
| V6 Cryptography | partial | No new crypto in Phase 7. X write auth uses the platform's OAuth; do not hand-roll signing. (Settlement attestations are Phase 4, unchanged.) |
| V7 Logging | yes | pino structured logs `{ event: 'auto_post_*' }`; never log the X token (mirror `x-api-client.ts` which logs `x_api_no_key` without the token). |

### Known Threat Patterns for {Next.js OG route + relayer worker + subgraph}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Subgraph Studio key leaked to frontend bundle | Information Disclosure | D-27 server-only proxy; key never in `NEXT_PUBLIC_*` (existing `subgraph-client.ts` enforces). |
| X write token in logs / bundle | Information Disclosure | pino redact + relayer-only; degrade-to-no-op when absent. |
| CORS misconfig (`*`) exposes relayer to any origin | Spoofing / Elevation | Explicit-origin allowlist (existing); add only the Vercel origin (D-04). |
| Untrusted statement string → render/inject in OG | Tampering | Length-cap + treat as text (Satori renders text, not HTML — low XSS surface; still cap length). Receipt page must escape if rendered as HTML. |
| Auto-post forging wrong preview (stale cache) | Tampering (of public claim) | Pitfall-8 cache-warm gate (HEAD + X-Variant + ETag) before post. |
| Auto-post enabling instant-claim front-run of disputes | Repudiation / financial | Pitfall-18 reconciliation (claim-window / runbook) before default-ON. |
| `og:image` SSRF via attacker-controlled callId | Tampering | callId is numeric-validated; OG route reads only project contracts/subgraph; no user-supplied fetch target. |

## Sources

### Primary (HIGH confidence — read directly this session)
- `apps/web/app/og/[callId]/route.ts` — Live/Settled/CallerExited builders; `Call #N` + `—` stubs; RPC reads; runtime='nodejs'; cache headers.
- `apps/web/app/og/duel/[challengeId]/route.ts` — DuelSettled (flexbox row; stub contract).
- `apps/web/app/call/[id]/layout.tsx` — `generateMetadata` og:image `?v={statusVersion}`; reads `marketLine` from `/api/calls/:id/live-state`.
- `apps/relayer/src/routes/live-state.ts` — IN-03 note: marketLine/handle/reasoning are Phase-7 subgraph wiring; returns statusVersion.
- `apps/relayer/src/index.ts:117-133` — CORS allowlist accepts `NEXT_PUBLIC_OG_BASE_URL` + `CORS_ALLOWED_ORIGINS` (D-04 is env-only).
- `apps/relayer/src/lib/x-api-client.ts` — degrade-to-empty key-gate pattern (mirror for write path).
- `apps/relayer/src/workers/settlement-watcher.ts` + `notification-fanout` (referenced) — worker/BullMQ/idempotency precedent for auto-post.
- `packages/subgraph/schema.graphql` (Call entity, `reasoning` field, `LeaderboardEntry`) + `subgraph.yaml` (all ~20 handlers wired) + `src/call-registry.ts` / `src/settlement-manager.ts` (mapping behavior; CallCreated lacks statement string).
- `apps/web/eslint.config.js` (empty — no real grid rule) + `apps/web/tests/og-fallback.spec.ts` (fake string-match "rule") + `apps/web/playwright.config.ts`.
- `apps/relayer/src/db/schema.ts` / `db/criteria-store.ts` / `workers/calls-preflight.ts` — off-chain per-call store precedent (statement source candidate).
- `.planning/REQUIREMENTS.md` (req definitions), `.planning/ROADMAP.md` Phase 7 SC1–SC5, `.planning/research/PITFALLS.md` Pitfalls 5/8/15/18.
- `CLAUDE.md` (pinned versions, constraints) — all confirmed against package.json.

### Secondary (MEDIUM)
- Version cross-check via `node -e require(package.json)` — @vercel/og 0.11.1, satori 0.26.0, next 16.2.6, graph-cli 0.98.1, graph-ts 0.38.2 (match CLAUDE.md).

### Tertiary (LOW — needs validation)
- Warpcast compose-intent URL shape (A3) — verify against Farcaster docs at plan time.
- X write OAuth credential type (A2) — verify when keys budgeted.

## Project Constraints (from CLAUDE.md)

- Tech stack pinned: `@vercel/og 0.11.1`, `satori 0.26.0` (**flexbox only — `display: grid` does not work**), Next.js 16 App Router **Node runtime** (NOT edge — resvg-wasm), `graph-cli 0.98.1`, `graph-ts 0.38.2`, AssemblyScript quirks (no closures, no null for value types).
- Network/currency hardcoded: Arbitrum (Sepolia recovery cluster for this phase) + native USDC.
- Subgraph: The Graph Studio → DN (**DN publish deferred to Phase 10 per D-01**); polled-events fallback stays live.
- Structured logging (pino) mandatory; secrets never logged (redact list).
- GSD workflow enforcement: all edits via a GSD command.
- Auto-post worker must be on Railway/Fly (the relayer), NOT Vercel functions (long-running).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions read from installed package.json; no new deps.
- Architecture / data flow: HIGH for what exists; MEDIUM on the statement-source decision (Q1, A1) which needs user confirmation.
- Pitfalls: HIGH — Pitfalls 5/8/15/18 read in full and pinned to exact source lines.
- Auto-post worker: MEDIUM — pattern is clear (settlement-watcher precedent) but X write-credential specifics (A2) and Pitfall-18 reconciliation (A5/Q2) are open.

**Research date:** 2026-06-07
**Valid until:** 2026-07-07 (stable in-repo code; re-verify Warpcast URL + X write auth if/when keys are budgeted)
