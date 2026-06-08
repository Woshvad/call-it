# Phase 7: OG service final variants + Subgraph final mappings - Pattern Map

**Mapped:** 2026-06-07
**Files analyzed:** 13 net-new/modified
**Analogs found:** 12 / 13 (1 net-new pattern: custom eslint rule — no in-repo analog)

> Phase 7 is a **finalization/wiring phase**. Almost every new file has a strong in-repo analog to copy line-for-line. The single exception is the custom eslint flat-config rule (no prior custom rule exists; copy the structure from RESEARCH §Code Examples + ESLint flat-config docs).

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/relayer/src/workers/auto-post-worker.ts` | worker | event-driven | `apps/relayer/src/workers/notification-fanout.ts` | exact (worker + statusVersion + subgraph) |
| `apps/relayer/src/lib/x-write-client.ts` | utility | request-response | `apps/relayer/src/lib/x-api-client.ts` | exact (key-gated degrade-to-no-op) |
| `apps/relayer/src/workers/__tests__/auto-post-worker.test.ts` | test | event-driven | (existing relayer vitest worker tests) | role-match |
| `apps/relayer/src/db/schema.ts` (EXTEND: `statement` col) | model | CRUD | `callOracleCriteria` table in same file | exact |
| `apps/relayer/src/db/criteria-store.ts` (or new statement-store) | service | CRUD | `criteria-store.ts` `insertCriteria`/`resolveCriteria` | exact |
| `apps/relayer/src/workers/calls-preflight.ts` (EXTEND: persist statement) | worker | request-response | same file `handleCallCreated` | exact |
| `packages/subgraph/schema.graphql` (EXTEND: `Call.statement`) | model | n/a | `Call` entity `reasoning` field (same file) | exact |
| `packages/subgraph/src/call-registry.ts` (EXTEND: templated statement) | mapping | event-driven | `handleCallCreated` (same file) | exact |
| `apps/web/lib/share-text.ts` | utility | transform | `apps/web/lib/relayer-client.ts` (lib module shape) + RESEARCH builders | role-match |
| `apps/web/eslint-rules/no-display-grid-in-og.js` | config | n/a | `apps/web/eslint.config.js` (empty) | **no analog — net-new** |
| `apps/web/eslint.config.js` (EXTEND: wire rule) | config | n/a | self (empty flat config) | partial |
| `apps/web/tests/og-thumbnail-200px.spec.ts` | test | request-response | `apps/web/tests/og-fallback.spec.ts` | exact |
| `apps/web/app/leaderboard/page.tsx` (+ client) | component | request-response | `apps/web/app/profile/[address]/page.tsx` + `ProfileClient.tsx` | role-match |
| `apps/web/app/profile/[address]/ProfileClient.tsx` (EXTEND: Overview tab) | component | request-response | self (Overview stub exists) | exact |
| `apps/web/app/new/page.tsx` (EXTEND: `?quote=` mode) | component | request-response | self (quote banner exists) | exact |
| `apps/web/app/og/[callId]/route.ts` (WIRE: real data) | route | request-response | self (stubs at L777, L811-814) | exact |
| `apps/web/app/og/duel/[challengeId]/route.ts` (WIRE) | route | request-response | `og/[callId]/route.ts` | role-match |

---

## Pattern Assignments

### `apps/relayer/src/workers/auto-post-worker.ts` (worker, event-driven)

**Analog:** `apps/relayer/src/workers/notification-fanout.ts` (settle/event-triggered worker; statusVersion bump; subgraph query; never-throw discipline).

**Worker shape + config (copy):** `notification-fanout.ts:92-110` — `Config` interface (`publicClient`, `db`, `subgraphUrl`, `intervalMs`) + `Handle` with `stop()`/`getStats()`. Start function `startNotificationFanout` at `:478` is the template: `setInterval(() => tick().catch(...))`, `initPromise` head-seeding, `initialized` guard against full-chain scans.

**statusVersion bump (copy exactly — reuse for cache-warm step 1):** `notification-fanout.ts:118-122` + `:303-318`:
```typescript
function statusVersionKey(callId: string): string {
  return `status_version:${callId}`;
}
// ...
const redis = getRedis();
await redis.incr(statusVersionKey(callId));   // step 1 of the Pitfall-8 cache-warm sequence
```

**Never-throw error discipline (copy — RESEARCH Pattern 2):** `notification-fanout.ts:635-643`:
```typescript
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error({ event: 'auto_post_error', callId, error: message, phase: 'post' }, 'auto-post failed');
  errors++;
  // Do NOT throw — interval must keep running (polled-events-fallback discipline)
}
```

**Idempotency precedent (apply to "posted-once" dedup):** the `onConflictDoNothing` + unique-index pattern at `notification-fanout.ts:280-288` and `db/schema.ts:152-159`. The auto-post worker needs a "posted" dedup so a re-processed `CallSettled` does not double-post — mirror the notifications `(user_address, event_type, call_id)` unique-index pattern with a `posted_receipts(call_id)` unique key.

**Subgraph query (copy fetch shape):** `notification-fanout.ts:145-200` `queryHolders` — raw `fetch(subgraphUrl, { method:'POST', body: JSON.stringify({query,variables}) })`, check `!response.ok`, check `json.errors`. Use the same shape to read `Settlement` + `RepEvent` if the worker needs settled fields for the post text.

**Trigger event:** subscribe to `CallSettled` (and `CallerExited`) the same way `notification-fanout` polls `CallerExited` via `parseAbiItem` + `getLogs` chunked at `blockSpan=9n` (`:485-491`, `:595-620`). Reuse the chunking constants.

**Pitfall-8 cache-warm sequence (NEW logic, no analog — implement per RESEARCH Pitfall 2):** (1) bump statusVersion, (2) `GET /og/{id}?v={sv}` force regen, (3) `HEAD /og/{id}?v={sv}` assert `200` + `X-Variant: settled|caller-exited` + stable ETag, (4) only then post; on failure `delay ≤30s` then retry. The `X-Variant` header it asserts is set by the OG route (see OG invariants below).

**Pitfall-18 reconciliation (BLOCKING decision — D-07/Q2):** locate the Phase-4 settlement-runbook claim-delay decision (`.planning/phases/04-*` docs / settlement runbook) and gate the auto-post trigger to be consistent with it. If the runbook is silent, default-ON fires after cache-warm succeeds (D-07). The Phase-1.5 deferral note ([[phase1.5-complete-verified]]) confirms the degrade-to-empty precedent.

---

### `apps/relayer/src/lib/x-write-client.ts` (utility, request-response)

**Analog:** `apps/relayer/src/lib/x-api-client.ts` — the exact key-gated degrade-to-empty template (RESEARCH Pattern 3).

**Module header + no-SDK note (copy intent):** `x-api-client.ts:1-20` — "Raw `fetch()`, NO npm SDK" + "Graceful degradation" + "structured pino logs `{ event: 'x_*' }`; never logs the token". Mirror verbatim for the write path.

**Key-gate degrade-to-no-op (copy — change throw→return for the write path):** `x-api-client.ts:73-79`:
```typescript
const logger = getLogger();
const token = process.env.X_API_BEARER_TOKEN;   // → use X_API_WRITE_TOKEN (user-context, A2)
if (!token) {
  logger.warn({ event: 'x_api_no_key' }, 'X_API_BEARER_TOKEN not set — degrades to empty');
  throw new QuotaError('x_api_no_key', { status: 0 });
}
```
> For the WRITE path, RESEARCH Pattern 3 says **return a no-op result, do NOT throw** (the worker keeps running):
> ```typescript
> if (!token) {
>   logger.warn({ event: 'x_write_no_key' }, 'X write keys absent — auto-post degrades to no-op');
>   return { posted: false, reason: 'no_key' };
> }
> ```

**Error/status handling (copy):** `x-api-client.ts:110-118` — 429 → log + degrade; `!res.ok` → log + degrade. Mirror for `POST /2/tweets`.

**Security (V7):** add `X_API_WRITE_TOKEN` to the pino redact list (`index.ts:89-101` per RESEARCH); never log the token — `x-api-client.ts` logs `x_api_no_key` without the value.

> Credential note (A2): write needs **user-context OAuth** (OAuth2 PKCE / OAuth1.0a), NOT the existing app-only `X_API_BEARER_TOKEN`. Confirm when keys are budgeted; gated-no-op until then.

---

### `apps/relayer/src/db/schema.ts` (model, CRUD) — EXTEND with `statement`

**Analog:** the `callOracleCriteria` table in the **same file** (`db/schema.ts:261-281`) — the established "on-chain Call struct lacks string fields, bridge off-chain keyed by callId" pattern. This is the exact precedent for D-05.

**Pattern to copy (add `statement` column — either a new `call_statement` table or a column on `call_oracle_criteria`):**
```typescript
// Mirror callOracleCriteria (schema.ts:261-281): PK on call_id, text() for prose, defaultNow()
export const callStatement = pgTable('call_statement', {
  callId: integer('call_id').primaryKey().notNull(),
  statement: text('statement').notNull(),      // human-readable market prose (length-capped by route, V5)
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```
> Discretion (D-05): prefer a distinct store/column over repurposing `reasoning`. The header comment block style (schema.ts:236-260) documents Writer/Reader/fail-safe — copy that convention.

---

### `apps/relayer/src/db/criteria-store.ts` (service, CRUD) — statement read/write helpers

**Analog:** `criteria-store.ts` `insertCriteria` (`:87-103`) + `resolveCriteria` (`:50-66`) — the exact read/write helper shape.

**Write (copy — idempotent ON CONFLICT DO NOTHING):** `criteria-store.ts:93-102`:
```typescript
await db.insert(callStatement)
  .values({ callId, statement })
  .onConflictDoNothing();          // re-processed CallCreated is a no-op (WR-05 idempotency)
```

**Read (copy — single-key lookup, null = absent → safe fallback):** `criteria-store.ts:50-66` (`.where(eq(...)).limit(1)`, return null when empty). The OG/receipt read treats null as "use the templated subgraph fallback" — mirrors the fail-safe contract at `:36-49`.

---

### `apps/relayer/src/workers/calls-preflight.ts` (worker) — EXTEND to persist statement

**Analog:** `handleCallCreated` in the **same file** (`calls-preflight.ts:89+`) — already the post-CallCreated criteria-write hook called by `routes/calls-criteria.ts`. Add the statement persist alongside the criteria insert.

**Pattern (copy fail-safe non-fatal write):** `calls-preflight.ts:74-90` header contract — "if insert throws (DB unavailable), log and do NOT fail call creation." Wrap the new `insertCallStatement` in the same try/log/continue.

**Route extension:** the existing `POST /api/calls/criteria` route (`routes/calls-criteria.ts`, referenced `calls-preflight.ts:18`) is the EXTEND target — accept an optional `statement` field at create time (the frontend `/new` flow knows the prose), length-cap it (V5), persist via the store helper above.

---

### `packages/subgraph/schema.graphql` (model) — add `Call.statement`

**Analog:** the `Call` entity `reasoning: String` field (`schema.graphql:24`) — nullable String already on the entity.

**Pattern (copy — add nullable field, do not break existing):**
```graphql
type Call @entity(immutable: false) {
  # ... existing fields unchanged ...
  reasoning: String          # exists (currently null)
  statement: String          # NEW (D-05) — templated mirror; nullable for safety
}
```
> Bump deploy `v0.8.0 → v0.9.0` to Studio (D-01: stays on Studio, DN deferred). Re-run `pnpm --filter @call-it/subgraph build` (codegen+build regenerate `generated/` — Runtime State Inventory).

---

### `packages/subgraph/src/call-registry.ts` (mapping, event-driven) — populate templated statement

**Analog:** `handleCallCreated` in the **same file** (`call-registry.ts:52-79`).

**Pattern (copy — set the new field with a safe default at create time):** mirror how `:68-74` sets `asset = ''` / `expiry = 0` / `reasoning = null` with documented "not in event; relayer enriches" comments. The mapping CANNOT read the relayer DB (AssemblyScript constraint, `:7-10`), so `statement` is a **templated fallback** derived from numerics (`marketType` + `asset` + `targetValue`):
```typescript
// AssemblyScript: no closures, no null for value types — build the string flatly
call.statement = templateStatement(call.marketType, call.asset, /* target */);  // safe default
```
> D-05: authoritative prose = relayer (`marketLine`); subgraph field = indexed templated mirror so OG/receipt never crash when enrichment hasn't run. Add a vitest mapping test asserting the default populates (Wave 0).

---

### `apps/web/lib/share-text.ts` (utility, transform)

**Analog (module shape):** `apps/web/lib/relayer-client.ts` — `export async function`/`export function` lib module with a documented header; `NEXT_PUBLIC_*` base-URL handling at `:13`. Plus the RESEARCH §Code Examples builders.

**Pattern (build per RESEARCH — shared by manual Share button SHARE-15 + relayer auto-post SHARE-18):**
```typescript
export function twitterIntentUrl(receiptUrl: string, text: string) {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(receiptUrl)}`;
}
export function warpcastComposeUrl(receiptUrl: string, text: string) {
  return `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(receiptUrl)}`;
}
```
> A3: verify the Warpcast compose-intent URL shape against current Farcaster docs at plan time. Add a unit test for both builders (Wave 0, SHARE-18). The relayer auto-post worker imports the same logic (keep the builders pure/dependency-free so both web + relayer can use them).

---

### `apps/web/eslint-rules/no-display-grid-in-og.js` (config) — **NET-NEW, no analog**

**Analog:** none — `apps/web/eslint.config.js:1-7` is empty (zero custom rules). The current "rule" is a fake string-match in `og-fallback.spec.ts:76-104` with a `console.warn` escape hatch (now obsolete per RESEARCH State of the Art).

**Pattern (build from RESEARCH §Code Examples — flat-config custom rule):** flag `display:'grid'` and `grid(Template|Column|Row|Area|Auto)*` props in `ObjectExpression` style objects:
```js
export default {
  meta: { type: 'problem', docs: { description: 'Satori does not support CSS grid (Pitfall 15)' } },
  create(context) {
    return {
      Property(node) {
        const key = node.key.name ?? node.key.value;
        const val = node.value.value;
        if (key === 'display' && val === 'grid')
          context.report({ node, message: "Satori does not support display:'grid' — use flexbox." });
        if (typeof key === 'string' && /^grid(Template|Column|Row|Area|Auto)/.test(key))
          context.report({ node, message: `Satori does not support '${key}' — use flexbox.` });
      },
    };
  },
};
```

**Wire into `eslint.config.js` (EXTEND the empty flat config):** scope to `files: ['app/og/**/*.{ts,tsx}', 'app/api/og/**/*.ts', 'lib/og-*.ts']`. The `ignores` block at `eslint.config.js:3-5` is preserved.

---

### `apps/web/tests/og-thumbnail-200px.spec.ts` (test, request-response)

**Analog:** `apps/web/tests/og-fallback.spec.ts` — exact Playwright OG-route test harness.

**Patterns to copy:**
- `test.describe` + `{ request, baseURL }` fixtures, `request.get(\`${baseURL}/og/...\`)` (`og-fallback.spec.ts:24-41`).
- PNG dimension assertion via `buffer.readUInt32BE(16)/(20)` for 1200×630 (`:32-41`).
- Header assertions: `Cache-Control: public, max-age=60, stale-while-revalidate=300` (`:62-67`) and `X-Variant` (`:69-74`).

**NEW (per RESEARCH §Code Examples) — 200px visual-regression for the 5 outcome words:** `page.setViewportSize({ width: 200, height: 105 })` + `expect(page).toHaveScreenshot('og-200-...png', { maxDiffPixelRatio: 0.02 })` (Playwright built-in — no new dep, A4). Commit baselines. The obsolete `og-fallback.spec.ts:76-104` ESLint-string-match test can be replaced with an assertion that `eslint app/og` exits non-zero on a planted `display:'grid'`.

---

### `apps/web/app/leaderboard/page.tsx` (+ client component)

**Analog:** `apps/web/app/profile/[address]/page.tsx` + `ProfileClient.tsx` — server-fetch page + client renderer split. Route does NOT exist yet (confirmed).

**Patterns to copy:**
- Server Component fetches data, passes to client (`profile/[address]/page.tsx:30-53`): `try { data = await getX() } catch { fetchError = ... }` then render `<Client data fetchError={...} />`.
- Data source: relayer proxy via `lib/relayer-client.ts` (add `getLeaderboard()` mirroring `getProfile()` at `relayer-client.ts:122`; D-27 keeps Studio key server-side).
- **Leaderboard data (D-06/Q3):** sort `Profile.globalRep` from subgraph at read time for All-time; 7d/30d toggles ship wired but backed by All-time with a documented v1 limitation. `LeaderboardEntry` entity exists (`schema.graphql:130-137`) but is unpopulated — do NOT depend on it.
- UI: reuse `@call-it/ui` primitives (`Card`/`Tag`/`Stamp`/`CornerBrackets`) per UI-SPEC §Leaderboard. **Flexbox only, no CSS grid** (consistency with OG + Pitfall 15) — the 3-card CATEGORY REPUTATION and Hero/table layouts use flex rows.

---

### `apps/web/app/profile/[address]/ProfileClient.tsx` — EXTEND Overview tab (UI-09)

**Analog:** self — Overview stub already present (`profile/[address]/page.tsx:13` comment "Phase 7 will add charts + leaderboard"). Build the 5-stat row + CATEGORY REPUTATION + RECENT CALLS + MOST FOLLOWED BY + NOTABLE RECEIPTS sections from `@call-it/ui` primitives per UI-SPEC. Mono-bold numerics, Syne headings, accent reserved per the locked color list.

---

### `apps/web/app/new/page.tsx` — EXTEND `?quote=` mode (UI-26/27/28)

**Analog:** self — quote banner already exists. Build parent-context `Card`, YOUR THESIS textarea ABOVE market-type buttons (UI-27), success thread preview + Share button (UI-28, uses `share-text.ts`). Quote stance persists via the existing `quote_stance` table / `routes/quote-stance.ts` (`db/schema.ts:178-193`).

---

### `apps/web/app/og/[callId]/route.ts` + `og/duel/[challengeId]/route.ts` — WIRE real data (D-03/D-05)

**Analog:** self — the stubs are explicit:
- `og/[callId]/route.ts:777` `const callStatement = \`Call #${callIdStr}\`;` → **replace** with the relayer `marketLine` read (`/api/calls/:id/live-state`, authoritative per D-05) with the subgraph `Call.statement` templated value as fallback.
- `og/[callId]/route.ts:811-814` `pnlStr/repDeltaStr/finalValue/targetValue = '—'` → **replace** with subgraph `Settlement.priceDelta`/`finalPrice` + `RepEvent.delta` reads (settlement-manager mapping populates these — `settlement-manager.ts:46-57`).
- Keep the existing RPC read of `status`/`outcome` for freshness (`:782-795`) — RESEARCH Pattern 1 (subgraph for display fields, RPC for freshness; statement is immutable so lag is irrelevant).
- `outcome word` already wired via `getOutcomeWordResult()` (`:796-801`) — do NOT touch the color logic (§14.1 locked).

---

## Shared Patterns

### Key-gated degrade-to-no-op (auth/secrets)
**Source:** `apps/relayer/src/lib/x-api-client.ts:73-79` + `:110-118`
**Apply to:** `x-write-client.ts`. Missing `X_API_WRITE_TOKEN` → log `{ event: 'x_write_no_key' }` (no token in log) + return `{ posted: false }` (no throw). Add token to pino redact list.

### Never-throw worker error discipline
**Source:** `apps/relayer/src/workers/notification-fanout.ts:635-643`, `:681-688`
**Apply to:** `auto-post-worker.ts`. Every per-event `try/catch` logs `{ event: 'auto_post_error', phase }` + `errors++`; the `setInterval` callback has a final `.catch` safety net. The interval must survive any single failure.

### Idempotency via ON CONFLICT DO NOTHING + unique index
**Source:** `db/schema.ts:152-159` (unique index) + `notification-fanout.ts:280-288` / `criteria-store.ts:93-102` (insert)
**Apply to:** statement persist (callId PK), posted-receipt dedup (callId unique), any re-processed-event write. A re-processed `CallCreated`/`CallSettled` must never duplicate.

### Off-chain bridge for missing on-chain strings
**Source:** `db/schema.ts:236-281` (`callOracleCriteria`) + `criteria-store.ts:1-20` (fail-safe contract)
**Apply to:** D-05 statement store. On-chain `CallCreated` carries no string (`call-registry.ts:48-49`); the relayer is the only component that knows the prose at create time. Null read = safe fallback, never crash.

### statusVersion cache-bust (OG)
**Source:** `notification-fanout.ts:118-122` + `:303-318` (Redis `status_version:{callId}`)
**Apply to:** auto-post worker cache-warm step 1 + the OG route `?v={sv}` already-wired flow (RESEARCH Pattern 4).

### Subgraph GraphQL read (relayer-only, D-27)
**Source:** `notification-fanout.ts:145-200` (`queryHolders` fetch shape)
**Apply to:** auto-post worker settled-field reads + leaderboard `Profile.globalRep` sort. Check `!response.ok` + `json.errors`; Studio key stays server-side.

### Server-fetch page → client renderer
**Source:** `apps/web/app/profile/[address]/page.tsx:30-53`
**Apply to:** `leaderboard/page.tsx`. `try await getX() catch fetchError` → render client with `fetchError` prop; error copy per UI-SPEC error-states table.

### OG route invariants (LOCKED — SC1 gates enforce)
**Source:** `apps/web/app/og/[callId]/route.ts` + UI-SPEC §OG Card Variant Contract
**Apply to:** all OG routes. `export const runtime = 'nodejs'` line 1; flexbox only (eslint rule enforces); `Cache-Control: max-age=60, stale-while-revalidate=300`; `X-Variant` header (the auto-post HEAD probe asserts this); `renderFallback` on any throw (SHARE-10).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `apps/web/eslint-rules/no-display-grid-in-og.js` | config | n/a | No custom eslint rule exists in-repo (`eslint.config.js` is empty; the prior "rule" was a fake test string-match). Build from RESEARCH §Code Examples + ESLint flat-config AST-visitor docs. |

Partially-novel logic (analog exists for structure, but the core sequence is new):
- **Pitfall-8 cache-warm sequence** in `auto-post-worker.ts` (bump→GET regen→HEAD assert X-Variant+ETag→≤30s retry→post) — worker scaffolding from `notification-fanout.ts`, but the 4-step probe is new (RESEARCH Pitfall 2).
- **200px visual-regression** in `og-thumbnail-200px.spec.ts` — harness from `og-fallback.spec.ts`, but `toHaveScreenshot` at 200px viewport is new (RESEARCH §Code Examples).

---

## Metadata

**Analog search scope:** `apps/relayer/src/{workers,lib,db,routes}`, `apps/web/{app,lib,tests}`, `packages/subgraph/{schema.graphql,src}`.
**Files scanned:** ~18 (8 read in full / targeted; rest via Glob/Grep).
**Pattern extraction date:** 2026-06-07
