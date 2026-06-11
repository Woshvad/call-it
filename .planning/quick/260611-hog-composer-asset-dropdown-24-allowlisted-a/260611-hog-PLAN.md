---
phase: quick-260611-hog
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/app/new/components/AssetSelect.tsx
  - apps/web/app/new/components/PriceTargetFields.tsx
  - apps/web/app/new/components/SpreadVsFields.tsx
  - apps/web/app/new/components/EventFields.tsx
  - apps/web/app/new/lib/hermes-price.ts
  - apps/web/app/new/hooks/usePythPrice.ts
  - apps/web/tests/asset-select.test.ts
  - apps/web/tests/hermes-price.test.ts
autonomous: true
requirements: [CALL-06, UI-02]
tags: [composer, pyth, hermes, react-hook-form, nextjs]

must_haves:
  truths:
    - "All three composer asset fields (Price Target assetA, Spread vs assetA+assetB, Event asset) are .brutal-select dropdowns listing exactly the 24 allowlisted PYTH_FEED_IDS symbols, grouped by optgroup category — free-text asset entry is gone"
    - "The select value is the plain ticker string ('BTC') — preflight resolveAssetToFeedId, dup-check, and receipt preview consume the symbol unchanged"
    - "Selecting an asset renders a live Hermes price row; on fetch failure/timeout/pending NOTHING fake renders (D-07 honesty — transient 'fetching price…' allowed, never a stale-looking number)"
    - "Price Target shows +10% / +20% / +50% / +100% chips ONLY when a live price exists; tapping a chip fills the manual target input through the existing RHF field.onChange -> usdToTargetValue path and remains user-editable"
    - "pnpm --filter @call-it/web test passes (including the existing target-scale + preflight-body source assertions) and pnpm --filter @call-it/web build exits 0"
  artifacts:
    - path: "apps/web/app/new/components/AssetSelect.tsx"
      provides: "Reusable 24-asset grouped dropdown (single source for all three sub-forms)"
      exports: ["AssetSelect", "ASSET_GROUPS"]
      min_lines: 40
    - path: "apps/web/app/new/lib/hermes-price.ts"
      provides: "Pure Hermes URL builder + response parser + USD formatter + chip-target math"
      exports: ["buildHermesLatestUrl", "parseHermesPriceResponse", "fetchHermesPrice", "formatUsdPrice", "roundForTarget", "computeChipTarget"]
    - path: "apps/web/app/new/hooks/usePythPrice.ts"
      provides: "usePythPrice(symbol) — live price state with 5s abort timeout + 30s refresh + honest null degrade"
      exports: ["usePythPrice"]
    - path: "apps/web/tests/hermes-price.test.ts"
      provides: "Unit tests for Hermes parsing/formatting/chip math with stubbed fetch (no network)"
    - path: "apps/web/tests/asset-select.test.ts"
      provides: "Catalog-drift guard: ASSET_GROUPS flattens to exactly the 24 PYTH_FEED_IDS keys"
  key_links:
    - from: "apps/web/app/new/components/AssetSelect.tsx"
      to: "packages/shared/src/constants/pyth-feed-ids.ts"
      via: "PYTH_FEED_IDS import from @call-it/shared (keyof typeof binds group membership at compile time)"
      pattern: "PYTH_FEED_IDS"
    - from: "apps/web/app/new/hooks/usePythPrice.ts"
      to: "https://hermes.pyth.network/v2/updates/price/latest"
      via: "fetchHermesPrice(feedId, signal) from lib/hermes-price"
      pattern: "fetchHermesPrice"
    - from: "apps/web/app/new/components/PriceTargetFields.tsx"
      to: "apps/web/app/new/lib/target-scale.ts"
      via: "chip onClick -> field.onChange(usdToTargetValue(computeChipTarget(...)))"
      pattern: "usdToTargetValue\\(computeChipTarget"
---

<objective>
Composer UX upgrade, three features: (1) replace the free-text asset inputs in all three market-type sub-forms with one reusable 24-asset grouped `.brutal-select` dropdown; (2) show the live Pyth Hermes price for the selected asset with honest degrade-to-hidden; (3) add direction-aware percentage quick-pick chips (+10/+20/+50/+100%) on the Price Target field that prefill the manual target input through the existing RHF validation path.

Purpose: Free-text asset entry forces users to guess valid tickers (UNKNOWN_ASSET_MESSAGE errors after typing); a constrained dropdown + live price + chips make the composer's happy path zero-error and one-tap. This is the CALL-06 "CoinPicker with Pyth feed ID resolution" that the PriceTargetFields docstring deferred to "Phase 2+".

Output: AssetSelect component, hermes-price pure lib, usePythPrice hook, three updated sub-forms, two new vitest files. Web test suite + build green.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@apps/web/app/new/components/PriceTargetFields.tsx
@apps/web/app/new/components/SpreadVsFields.tsx
@apps/web/app/new/components/EventFields.tsx
@apps/web/app/new/page.tsx
@apps/web/app/new/lib/target-scale.ts
@apps/web/app/new/lib/resolve-asset.ts
@apps/web/tests/target-scale.test.ts
@packages/shared/src/constants/pyth-feed-ids.ts
</context>

<discovery_findings>
Verified during planning (executor: trust these, re-grep only if something contradicts):

1. **No `direction` field exists in CreateCallInput.** `packages/shared/src/validation/call-gates.ts:124` has only `assetA: z.string().min(1)`; grep for `direction` across `packages/shared/src` returns zero matches; the preview market line in `page.tsx:199-205` hardcodes `>=`. Per task scope: default chips to "above" (+pct), render all four chips including +100%, and note the default in a code comment. The "omit 100% when below" rule is moot.

2. **No Playwright spec types into the asset input.** `new-call-publish.spec.ts` Tier-2 (lines 213-219) only asserts `getByText(/asset a/i)` / `getByText(/asset b/i)` label VISIBILITY — the `label-overline` labels survive the input→select swap. `utc-day-boundary.spec.ts` fills only `input[type="datetime-local"]`. No `getByPlaceholder` / `fill('BTC')` exists anywhere in `apps/web/tests/*.spec.ts`. **No spec updates are required** — but the executor MUST re-run the grep in Task 1 verify to confirm nothing drifted.

3. **Vitest source-assertion suites constrain the new code** (these run in the `pnpm --filter @call-it/web test` gate):
   - `target-scale.test.ts:87-101` — `PriceTargetFields.tsx` and `SpreadVsFields.tsx` MUST keep the `target-scale` import AND must NOT match `/targetValue[\s\S]{0,200}1_000_000/`. Chips must use `usdToTargetValue` and never place the literal `1_000_000` within 200 chars after the token `targetValue` (including comments).
   - `new-call-publish.spec.ts:172-191` (Playwright Tier-1, runs via playwright not vitest, but keep it green) — no `display:grid` / `grid-cols-` in ANY /new component. Applies to the new `AssetSelect.tsx` too. Flexbox only.
   - Component names `PriceTargetFields` / `SpreadVsFields` / `EventFields` and the token `eventSubtype` must remain in their sources (they will).

4. **Vitest config** (`apps/web/vitest.config.ts`): include = `tests/**/*.test.ts`, environment = `node`, no DOM/testing-library. The Hermes test must therefore target PURE functions + a fetch-stubbed async helper (`vi.stubGlobal('fetch', ...)`) — NOT a rendered React hook.

5. **CSS primitives already exist** in `apps/web/app/globals.css`: `.brutal-select` (lines 566-583, custom chevron, mono font) and `.chip` / `.chip.active` (lines 823-841) with the 44px mobile touch-target media rule (line ~1044). Zero CSS changes needed.

6. **`category` form field is independent** — `category: 'majors'|'defi'|'other'` is a separate user control in `AdvancedSettings.tsx`. The dropdown's optgroup labels are display-only; do NOT write `category` from AssetSelect.

7. **Hermes response shape** for `GET /v2/updates/price/latest?ids[]=<feedId>`: `{ binary: {...}, parsed: [{ id: <64-hex no 0x>, price: { price: "9743218000000", conf: "...", expo: -8, publish_time: ... }, ema_price: {...} }] }`. usd = `Number(parsed[0].price.price) * 10 ** parsed[0].price.expo`. Hermes accepts 0x-prefixed ids in the query; the returned `id` strips the prefix (irrelevant for a single-id request). No API key. CORS-open public endpoint.

8. **EventFields wiring quirk**: it uses bare `setValue` (uncontrolled input), not Controller. The select needs a controlled `value` — use `useWatch({ control, name: 'assetA' })` (useWatch is already imported there) and `setValue('assetA', v, { shouldValidate: true })`. Note: the event dropdown narrows entry to the 24 feed symbols; `webCreateCallSchema` still ACCEPTS hex-address/numeric event assets but there is no longer a UI path for them — accepted consequence per task scope ("events are allowlist-gated client-side per quick-260611-bf2").
</discovery_findings>

<tasks>

<task type="auto">
  <name>Task 1: AssetSelect component + dropdown swap in all three sub-forms + catalog-drift test</name>
  <files>apps/web/app/new/components/AssetSelect.tsx, apps/web/app/new/components/PriceTargetFields.tsx, apps/web/app/new/components/SpreadVsFields.tsx, apps/web/app/new/components/EventFields.tsx, apps/web/tests/asset-select.test.ts</files>
  <action>
**1. Create `apps/web/app/new/components/AssetSelect.tsx`** (`'use client'`, flexbox only, no hardcoded hex colors — tokens only):

- Import `PYTH_FEED_IDS` from `@call-it/shared`. Define `type AssetSymbol = keyof typeof PYTH_FEED_IDS`.
- Export `ASSET_GROUPS: ReadonlyArray<{ label: string; symbols: readonly AssetSymbol[] }>` in the exact pyth-feed-ids.ts category order:
  - `Majors`: BTC, ETH, SOL, UNI, LINK, AAVE, SKY, DOGE
  - `L2s`: ARB, OP, POL, MNT
  - `DeFi`: GMX, PENDLE, RDNT, ONDO
  - `Restaking & LSTs`: EIGEN, ETHFI, EZETH
  - `Memes`: PEPE, WIF, BONK
  - `AI & RWA`: RENDER, FET
  Typing `symbols` as `readonly AssetSymbol[]` makes catalog drift a compile error.
- Export `AssetSelect` with props `{ id: string; value: string | undefined; onChange: (symbol: string) => void; onBlur?: () => void; hasError?: boolean; placeholder?: string }` (placeholder default `'Select asset'`).
- Render `<select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} className="brutal-select mono" style={hasError ? { borderColor: 'var(--accent-loss)' } : undefined}>` containing a leading `<option value="" disabled>{placeholder}</option>` then one `<optgroup label={group.label}>` per group with `<option key={sym} value={sym}>{sym}</option>` per symbol. The option VALUE is the plain ticker string — nothing else.

**2. `PriceTargetFields.tsx`** — replace the assetA `<input type="text">` inside the existing Controller render with `<AssetSelect id="pt-asset" value={field.value} onChange={field.onChange} onBlur={field.onBlur} hasError={!!errors.assetA} />`. Change the label to `<label htmlFor="pt-asset" className="label-overline">Asset</label>`. Keep the error message div unchanged. Also update the component docstring: the CALL-06 CoinPicker deferral note is now stale — this IS the coin picker (price resolution lands in Task 2). Keep the `target-scale` import and the targetValue Controller untouched in this task.

**3. `SpreadVsFields.tsx`** — same swap for BOTH Controllers: `id="sv-asset-a"` and `id="sv-asset-b"`, with `htmlFor` on their labels (`Asset A` / `Asset B` label text MUST stay — Tier-2 e2e asserts visibility of /asset a/i and /asset b/i). `hasError={!!errors.assetA}` / `{!!errors.assetB}` respectively. Keep the metric select + Target Ratio Controller untouched.

**4. `EventFields.tsx`** — replace the uncontrolled `Asset / Protocol` text input with: `const assetA = useWatch({ control, name: 'assetA' });` (extend the existing useWatch usage) and `<AssetSelect id="event-asset" value={assetA} onChange={(v) => setValue('assetA', v, { shouldValidate: true })} hasError={!!errors.assetA} />`. Label gets `htmlFor="event-asset"`. Add a one-line comment noting the schema still accepts hex/numeric event assets but the UI now constrains to the 24 allowlisted symbols (quick-260611-bf2 client gate).

**5. Create `apps/web/tests/asset-select.test.ts`** (vitest, node env): import `ASSET_GROUPS` from the component and `PYTH_FEED_IDS` from `@call-it/shared`. Assert:
- Flattened `ASSET_GROUPS` symbols have length 24 and NO duplicates.
- Set equality with `Object.keys(PYTH_FEED_IDS)` (every key present, nothing extra).
- Group order/labels match the six expected labels in order.

**Constraints:** no new dependencies; no `display:grid`/`grid-cols-` anywhere (Tier-1 sweep covers all /new components); the select value must remain the bare ticker so `resolveAssetToFeedId`, `buildPreflightBody`, dup-hash, and the receipt preview (`formValues.assetA`) are byte-identical downstream. `page.tsx` needs NO changes.
  </action>
  <verify>
    <automated>pnpm --filter @call-it/shared build && pnpm --filter @call-it/web test && pnpm --filter @call-it/web build</automated>
  </verify>
  <done>All three sub-forms render AssetSelect (zero free-text asset inputs remain in apps/web/app/new/components); asset-select.test.ts proves 24/24 catalog coverage; full web vitest suite (including target-scale + web-call-schema + preflight-body source/behavior assertions) passes; next build exits 0. Grep confirms no spec/test references a removed placeholder ("Pyth feed or symbol", "First asset", "Second asset", "e.g. ETH, Uniswap" appear nowhere under apps/web/tests).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: hermes-price lib + usePythPrice hook + live price row + percentage chips + unit tests</name>
  <files>apps/web/app/new/lib/hermes-price.ts, apps/web/app/new/hooks/usePythPrice.ts, apps/web/app/new/components/PriceTargetFields.tsx, apps/web/app/new/components/SpreadVsFields.tsx, apps/web/tests/hermes-price.test.ts</files>
  <behavior>
    Write apps/web/tests/hermes-price.test.ts FIRST (vitest, node env, NO network — stub fetch with vi.stubGlobal):
    - parseHermesPriceResponse: realistic BTC payload `{ parsed: [{ price: { price: '9743218000000', expo: -8 } }] }` -> 97432.18
    - parseHermesPriceResponse: PEPE-scale payload (e.g. price '1234', expo: -10 -> 0.0000001234)
    - parseHermesPriceResponse: null for each of — missing `parsed`, empty `parsed: []`, non-numeric price string, non-finite result, price <= 0
    - fetchHermesPrice: stubbed fetch resolving ok JSON -> number; res.ok === false -> null; fetch rejecting (network error / AbortError) -> null (never throws)
    - buildHermesLatestUrl includes the 0x-prefixed feed id as an `ids[]` query param against https://hermes.pyth.network/v2/updates/price/latest
    - formatUsdPrice: 97432.18 -> '97,432.18'; 1.5 -> '1.50'; 0.00001234 -> 4 significant figures ('0.00001234'); 0.9876 -> '0.9876'
    - roundForTarget: sub-$1 -> 4 sig figs (Number('0.00001234')); >= $1 -> 2 decimals (110.00 not 110.000000001)
    - computeChipTarget: (100, 10) -> 110; (100, 100) -> 200; (0.00001234, 50) -> roundForTarget(0.00001851) (4 sig figs)
  </behavior>
  <action>
**1. Create `apps/web/app/new/lib/hermes-price.ts`** — pure module, no React:

- `buildHermesLatestUrl(feedId: string): string` — `new URL('https://hermes.pyth.network/v2/updates/price/latest')` + `searchParams.append('ids[]', feedId)`. Feed ids from PYTH_FEED_IDS are 0x-prefixed; Hermes accepts that.
- `parseHermesPriceResponse(json: unknown): number | null` — defensively narrow: `parsed` array non-empty, `parsed[0].price.price` string + `expo` number, compute `Number(price) * 10 ** expo`; return null unless the result is finite and > 0. NEVER throw on malformed input (Hermes is an untrusted boundary).
- `fetchHermesPrice(feedId: string, signal?: AbortSignal): Promise<number | null>` — `fetch(buildHermesLatestUrl(feedId), { signal })`; non-ok -> null; json parse + parseHermesPriceResponse; catch everything (including AbortError) -> null.
- `formatUsdPrice(usd: number): string` — sub-$1: `usd.toPrecision(4)` trimmed of exponent artifacts (use `Number(usd.toPrecision(4)).toString()`); >= $1: `usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`.
- `roundForTarget(usd: number): number` — sub-$1: `Number(usd.toPrecision(4))`; else `Math.round(usd * 100) / 100`.
- `computeChipTarget(currentPrice: number, pct: number): number` — `roundForTarget(currentPrice * (1 + pct / 100))`. Code comment: CreateCallInput has NO direction field (verified — call-gates.ts has no direction; preview hardcodes '>='), so chips default to ABOVE (+pct); revisit if a direction control ships.

**2. Create `apps/web/app/new/hooks/usePythPrice.ts`** (`'use client'`):

- `usePythPrice(symbol: string | undefined): { price: number | null; status: 'idle' | 'loading' | 'ready' | 'error' }`.
- Resolve `symbol` -> feedId via the EXISTING `resolveAssetToFeedId` from `../lib/resolve-asset` (handles trim/uppercase/0x passthrough, already unit-tested). No feedId -> `{ price: null, status: 'idle' }` and skip fetching.
- `useEffect` keyed on feedId: create an `AbortController`; `setTimeout(() => controller.abort(), 5000)` for the ~5s budget (clear the timer in cleanup AND after settle); `setStatus('loading')` only when no price is currently shown; `fetchHermesPrice(feedId, controller.signal)` -> number sets `{ price, status: 'ready' }`, null sets `{ price: null, status: 'error' }` (D-07: callers render NOTHING on error — no fake/stale number). Guard state updates against unmount/feedId-change via a cancelled flag or `controller.signal.aborted` check.
- Gentle refresh: `setInterval` re-fetch every 30_000ms while mounted with the same abort/timeout discipline (a failed refresh CLEARS the price to null — never keep showing a number the feed stopped backing). Cleanup clears interval + aborts in-flight.

**3. `PriceTargetFields.tsx`** — wire price row + chips:

- `const assetA = useWatch({ control, name: 'assetA' });` then `const { price, status } = usePythPrice(assetA);`.
- Under the AssetSelect (inside the asset field column): when `status === 'loading'` and price is null render a mono row `fetching price…`; when `price !== null` render `Current price · ${formatUsdPrice(price)}` — mono, `fontSize: 11`, `color: 'var(--text-tertiary)'`. Error/idle -> render nothing.
- Restructure the targetValue Controller render to return a fragment: ABOVE the existing number input, render the chip row ONLY when `price !== null`: `<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>` with four `<button type="button" className="chip">` for 10/20/50/100 labeled `+10%` etc., `onClick={() => field.onChange(usdToTargetValue(computeChipTarget(price, pct)))}`. Chips are SETTERS not modes — the input stays editable and validation runs identically (zod onChange mode). 44px mobile touch targets come free from the existing `.chip` media rule; mirror the StakeField chip style (`minHeight: 44` inline is acceptable, matching page.tsx:77).
- CRITICAL: do not introduce the literal `1_000_000` within 200 chars after any `targetValue` token and keep the `target-scale` import (target-scale.test.ts source assertions).

**4. `SpreadVsFields.tsx`** — nice-to-have, include it (hook is shared, cost ~10 lines): `usePythPrice` per asset (`assetA`, `assetB` via useWatch), same mono price row under each AssetSelect. NO chips here — the spreadVs target is a ratio, not a USD price.

**5. EventFields gets NO price row** — event assets settle on non-price oracles; out of scope.

**Constraints:** no new dependencies (native fetch + RHF + existing primitives); flexbox only; token colors only; Playwright e2e must not depend on Hermes — price row + chips are ADDITIVE and degrade to hidden, so existing specs (which never assert on them) are unaffected whether or not the dev server can reach the network.
  </action>
  <verify>
    <automated>pnpm --filter @call-it/shared build && pnpm --filter @call-it/web test && pnpm --filter @call-it/web build</automated>
  </verify>
  <done>hermes-price.test.ts covers parsing (happy/PEPE-scale/5 malformed shapes), stubbed-fetch behavior (ok/non-ok/reject -> never throws), URL building, formatting, and chip math — all green with zero network access; selecting an asset shows the live price row; chips appear only with a live price, write through field.onChange -> usdToTargetValue, and leave the input editable; fetch failure renders nothing; full web suite + build pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| web client -> Hermes public API | Untrusted JSON response crosses into the composer UI |
| composer UI -> on-chain publish | Chip-prefilled target flows into a signed transaction |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-hog-01 | Tampering | parseHermesPriceResponse | mitigate | Defensive narrowing of untrusted Hermes JSON — null on any malformed/non-finite/non-positive value; price is DISPLAY + prefill only, never submitted on-chain directly |
| T-hog-02 | Spoofing | usePythPrice price row | mitigate | D-07 honesty: failure/timeout renders nothing (no fake/stale number a user could anchor a stake on); 5s abort budget; failed refresh clears the shown price |
| T-hog-03 | Tampering | chip -> targetValue | mitigate | Chip writes through the SAME RHF field.onChange -> usdToTargetValue -> zod path as manual entry; relayer preflight (D-29 parity) re-validates server-side; user reviews target in PublishConfirmModal before signing |
| T-hog-04 | DoS | Hermes fetch loop | accept | One request per asset change + 30s interval, single-id query, public unauthenticated endpoint — negligible load; rate-limit response handled as null (degrade to hidden) |
| T-hog-SC | Tampering | npm/pip/cargo installs | accept | No new dependencies in this plan (native fetch + existing RHF/primitives only) |
</threat_model>

<verification>
1. `pnpm --filter @call-it/shared build && pnpm --filter @call-it/web test` — full vitest suite green (existing 144+ tests, plus asset-select.test.ts + hermes-price.test.ts).
2. `pnpm --filter @call-it/web build` — Next.js production build exits 0.
3. Sweep confirmations (grep, expect zero hits): `"Pyth feed or symbol"`, `"First asset"`, `"Second asset"`, `'e.g. ETH, Uniswap'` under `apps/web` (placeholders fully removed, no test references them).
4. Source-assertion invariants intact: `target-scale` imported in PriceTargetFields/SpreadVsFields; no `targetValue[\s\S]{0,200}1_000_000` match; no `display:grid`/`grid-cols-` in any /new component including AssetSelect.tsx.
5. Preflight unaffected: `preflight-body.test.ts` + `web-call-schema.test.ts` + `resolve-asset.test.ts` pass unchanged (symbol strings identical downstream).
</verification>

<success_criteria>
- One reusable AssetSelect drives all three sub-forms; the 24-symbol catalog is type-bound to PYTH_FEED_IDS and test-guarded against drift.
- Live Hermes price renders for any selected asset with honest degrade (nothing on failure), small-price assets formatted at 4 significant figures.
- Percentage chips render only with a live price, compute above-direction targets (no direction field exists — documented default), round sensibly, and fill the canonical-1e8 target input via the existing validated path.
- Zero Playwright/vitest regressions; zero new dependencies; web test + build gates green.
</success_criteria>

<output>
Create `.planning/quick/260611-hog-composer-asset-dropdown-24-allowlisted-a/SUMMARY.md` when done (use the summary template; include the no-direction-field finding and the EventFields hex/numeric-entry UI consequence so future phases see them).
</output>
