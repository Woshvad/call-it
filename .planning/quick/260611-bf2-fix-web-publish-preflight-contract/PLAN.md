---
phase: quick-260611-bf2
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/app/new/lib/resolve-asset.ts
  - apps/web/app/new/lib/preflight-body.ts
  - apps/web/app/new/lib/web-call-schema.ts
  - apps/web/app/new/hooks/usePublishCall.ts
  - apps/web/app/new/page.tsx
  - apps/web/app/new/components/SpreadVsFields.tsx
  - apps/web/lib/relayer-client.ts
  - apps/web/tests/resolve-asset.test.ts
  - apps/web/tests/preflight-body.test.ts
autonomous: true
requirements: [QUICK-260611-BF2, CALL-13, D-28, D-29, D-31]
must_haves:
  truths:
    - "Publishing a priceTarget call from /new sends marketType/eventSubtype/category as STRING enums ('priceTarget'/'none'/'majors') to POST /api/calls/preflight and gets 200 ok:true with valid inputs (was 422 invalid_type 'Expected string, received number')"
    - "A typed symbol ('ETH', 'eth', ' btc ') resolves to its Pyth feed id from the shared PYTH_FEED_IDS catalogue and the SAME resolved 0x id is used in BOTH the preflight body and the on-chain createCall assetA arg (was assetA=0 on-chain → unsettleable)"
    - "spreadVs resolves assetB and passes BigInt(resolvedAssetB) in calldata (was hardcoded assetB: 0n)"
    - "An unresolvable asset shows an inline RHF field error on assetA/assetB BEFORE the confirm modal and aborts publish() before any network call"
    - "A 422 whose field errors only hit inputs with no visible form control (marketType/eventSubtype/category/expiry/parentCallId) surfaces the first message in the toast text instead of the bare 'Please fix the form errors below'"
    - "relayerFetch maps the relayer's 422 body shape { ok:false, errors:[{field,code,message}] } into RelayerError.fieldErrors (was only reading body.fieldErrors, which the preflight route never sends — D-31 inline mapping never fired)"
    - "packages/shared and apps/relayer are byte-identical to HEAD — the relayer string-enum schema is the canonical wire contract (per QUICK-260611-BF2 constraints)"
  artifacts:
    - path: "apps/web/app/new/lib/resolve-asset.ts"
      provides: "resolveAssetToFeedId(input: string): `0x${string}` | null"
      exports: ["resolveAssetToFeedId", "UNKNOWN_ASSET_MESSAGE"]
    - path: "apps/web/app/new/lib/preflight-body.ts"
      provides: "buildPreflightBody pure helper — single source of preflight body + calldata asset uints"
      exports: ["buildPreflightBody"]
    - path: "apps/web/app/new/lib/web-call-schema.ts"
      provides: "Web-local createCallSchema extension with assetA/assetB resolvability superRefine (shared schema untouched)"
      exports: ["webCreateCallSchema"]
    - path: "apps/web/tests/resolve-asset.test.ts"
      provides: "Resolver unit tests (symbol case/trim, 0x passthrough, short-hex null, unknown null)"
    - path: "apps/web/tests/preflight-body.test.ts"
      provides: "Preflight body unit tests (string enums, resolved assetA/assetB, event passthrough, error union)"
  key_links:
    - from: "apps/web/app/new/hooks/usePublishCall.ts"
      to: "apps/web/app/new/lib/preflight-body.ts"
      via: "buildPreflightBody(input, address) before getAccessToken/postPreflight"
      pattern: "buildPreflightBody"
    - from: "apps/web/app/new/hooks/usePublishCall.ts"
      to: "calldata args"
      via: "built.assetAUint / built.assetBUint replace the line-116 BigInt footgun and line-117 hardcoded 0n"
      pattern: "assetAUint"
    - from: "apps/web/app/new/page.tsx"
      to: "apps/web/app/new/lib/web-call-schema.ts"
      via: "zodResolver(webCreateCallSchema) — was zodResolver(createCallSchema)"
      pattern: "webCreateCallSchema"
    - from: "apps/web/lib/relayer-client.ts"
      to: "relayer 422 body { ok:false, errors:[...] }"
      via: "relayerFetch folds errors[] into RelayerError.fieldErrors"
      pattern: "errors"
---

<objective>
Fix the web publish path on /new so a call can actually be published end-to-end: (1) send the relayer preflight STRING enums instead of uint integers, (2) resolve typed asset symbols to Pyth feed ids and use the resolved id consistently in the preflight body AND the on-chain calldata (assetA + assetB), (3) make 422 field errors actually visible (inline where a field exists, in the toast where it does not).

Purpose: Publishing from https://call-it-web-sepolia.vercel.app/new has NEVER worked (calls #13/#14 were script-seeded). Every attempt 422s with "Expected string, received number" on marketType/eventSubtype/category and shows zero visible errors. Even if that passed, typed symbols would land on-chain as assetA=0 — unsettleable (no Pyth feed at settlement).

Output: Working publish path in apps/web only; one atomic commit to master; SUMMARY.md in this task dir (uncommitted).

HARD CONSTRAINT: apps/relayer and packages/shared MUST stay untouched. The relayer's string-enum schema (calls-preflight.ts httpBodyPreprocessSchema → shared createCallSchemaStrict) is the canonical wire contract, and the relayer was just redeployed. The web client conforms to the relayer — never the reverse.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
</execution_context>

<context>
@apps/web/app/new/hooks/usePublishCall.ts
@apps/web/app/new/page.tsx
@apps/web/app/new/components/PriceTargetFields.tsx
@apps/web/app/new/components/SpreadVsFields.tsx
@apps/web/lib/relayer-client.ts
@packages/shared/src/types/call.ts
@packages/shared/src/validation/call-gates.ts
@packages/shared/src/constants/pyth-feed-ids.ts
@apps/relayer/src/routes/calls-preflight.ts   # READ ONLY — wire contract reference; do not modify
</context>

<diagnosis>
Live-diagnosed 2026-06-11 with the user's real authenticated session against the deployed stack. Carried verbatim — the executor has not seen the diagnosing conversation.

**BUG 1 — preflight payload type mismatch (the 422).** POST /api/calls/preflight returns 422 `[{field:"marketType",code:"invalid_type",message:"Expected string, received number"}, same for eventSubtype + category]`. The relayer preflight schema (apps/relayer/src/routes/calls-preflight.ts:49-68 `httpBodyPreprocessSchema` → shared `createCallSchemaStrict`) expects STRING enums; apps/web/app/new/hooks/usePublishCall.ts:81-83 sends `MARKET_TYPE_TO_UINT`/`EVENT_SUBTYPE_TO_UINT`/`CATEGORY_TO_UINT` numbers. The 422 fieldErrors map to RHF fields with no visible inputs → nothing renders "below" → toast says "Please fix the form errors below" with no visible errors.

**PROOF the corrected contract passes** (same session, same deployed relayer):

```json
{
  "marketType": "priceTarget",
  "eventSubtype": "none",
  "category": "majors",
  "assetA": "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  "targetValue": "420000000000",
  "stake": "5000000",
  "conviction": 50
}
```

→ `200 {ok:true, hash:0xc06f9b…, suggestedConviction:50}`.

**BUG 2 — asset symbols never resolved to Pyth feed ids.** (a) relayer `assetToUint256` (calls-preflight.ts:150-158) maps 'ETH' → 0n; (b) web calldata builder usePublishCall.ts:116 `BigInt(input.assetA.startsWith('0x') ? input.assetA : '0x0')` → on-chain assetA=0 for typed symbols; (c) usePublishCall.ts:117 hardcodes `assetB: 0n` even for spreadVs. assetA=0 calls are UNSETTLEABLE (no Pyth feed at settlement). The composer placeholder promises "BTC, ETH, SOL... (Pyth feed or symbol)".

**BUG 3 — latent, found during plan grounding (explains "NO visible field errors" exactly).** `relayerFetch` (apps/web/lib/relayer-client.ts:46-64) only reads `body.fieldErrors` from non-2xx JSON, but the relayer preflight 422 responds `{ ok: false, errors: [{field, code, message}] }` (calls-preflight.ts:186-189, 214-217, 393-396 — `PreflightFailResponse` has no `fieldErrors` key). So `RelayerError.fieldErrors` is ALWAYS undefined for preflight 422s and the D-31 inline-mapping loop in usePublishCall.ts:187-195 never executed. Must be fixed in the web client (relayer untouched).

**Schema/source facts the executor needs (verified against source 2026-06-11):**
- String enum literals (packages/shared/src/types/call.ts): `MARKET_TYPES = ['priceTarget','spreadVs','event']`, `EVENT_SUBTYPES = ['none','tvlMilestone','volumeFees','onchainMetric','cexListing','tokenLaunch','governance','protocolMilestone']`, `CATEGORIES = ['majors','defi','other']`. Exported TS union types: `MarketType`, `EventSubtype`, `Category`. Use these types — never hand-typed literals.
- Symbol→feedId catalogue: `PYTH_FEED_IDS` in packages/shared/src/constants/pyth-feed-ids.ts — 24 entries keyed by UPPERCASE ticker (BTC, ETH, SOL, UNI, LINK, AAVE, SKY, DOGE, ARB, OP, POL, MNT, GMX, PENDLE, RDNT, ONDO, EIGEN, ETHFI, EZETH, PEPE, WIF, BONK, RENDER, FET), values are 0x-prefixed lowercase 64-hex bytes32 strings. Already exported from `@call-it/shared` (packages/shared/src/index.ts).
- Shared `createCallSchema` (packages/shared/src/validation/call-gates.ts:115-205): `assetA: z.string().min(1)` is INTENTIONALLY freeform — comment says "AssetNotAllowlisted (CALL-13): NOT checked here — relayer pre-checks the allowlist." The relayer imports this same module (D-29 parity), so the shared schema MUST NOT gain a resolvability gate — extend it web-locally instead.
- EVENT-type assets are NOT feed-gated: relayer `assetToUint256` falls back to 0n for non-hex/non-numeric strings (e.g. cexListing token names), and event settlement is criteria/attestation-based, not Pyth. Only gate resolution on priceTarget + spreadVs.
- Form wiring (apps/web/app/new/page.tsx:131-133): `useForm<CreateCallInput>({ resolver: zodResolver(createCallSchema), mode: 'onChange', ... })`. RHF ignores per-field `rules` when a resolver is set, so early validation goes through a schema extension, not Controller rules.
- `RelayerError` (relayer-client.ts:21-31): `constructor(status, code, message, fieldErrors?: Record<string, string[]>)`.
- `PreflightInput` (relayer-client.ts:474-490) currently types marketType/eventSubtype/category as `number` — must become the shared string types.
- SpreadVsFields (apps/web/app/new/components/SpreadVsFields.tsx:53-68) renders NO error for `errors.assetB` (no error div, no error border) — must be added or the assetB inline error is invisible.
- apps/web vitest: config include is `tests/**/*.test.ts`, environment node, `@` alias → apps/web root. Test runner: `pnpm --filter @call-it/web exec vitest run`.
- Existing numeric-payload pins: grep of `MARKET_TYPE_TO_UINT|EVENT_SUBTYPE_TO_UINT|CATEGORY_TO_UINT` across apps/web matches ONLY usePublishCall.ts and useDebouncedDupCheck.ts — no test file pins the old numeric preflight payload. Re-verify with the Task 2 grep gate anyway.

**EXPLICITLY OUT OF SCOPE:** `useDebouncedDupCheck` / `postDupCheck` (sends `marketType: number` to /api/calls/dup-check — a DIFFERENT relayer route with its own numeric contract; dup-check fails silently by design and is best-effort UX). Do not touch it. Do not touch apps/relayer. Do not touch packages/shared (helper placement decision: apps/web — see Task 1).
</diagnosis>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure helpers — resolveAssetToFeedId + buildPreflightBody — with unit tests</name>
  <files>apps/web/app/new/lib/resolve-asset.ts, apps/web/app/new/lib/preflight-body.ts, apps/web/tests/resolve-asset.test.ts, apps/web/tests/preflight-body.test.ts</files>
  <behavior>
    resolve-asset.test.ts (import PYTH_FEED_IDS from '@call-it/shared' and assert against the shared constants, plus ONE hardcoded cross-check for ETH = '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace'):
    - resolveAssetToFeedId('ETH') === PYTH_FEED_IDS.ETH
    - resolveAssetToFeedId('eth') === PYTH_FEED_IDS.ETH (case-insensitive)
    - resolveAssetToFeedId(' btc ') === PYTH_FEED_IDS.BTC (trimmed)
    - resolveAssetToFeedId(PYTH_FEED_IDS.ETH) === PYTH_FEED_IDS.ETH (full 0x id passthrough)
    - resolveAssetToFeedId('0x' + PYTH_FEED_IDS.ETH.slice(2).toUpperCase()) === PYTH_FEED_IDS.ETH (mixed-case hex → lowercased)
    - resolveAssetToFeedId('0x1234') === null ('0xshort' fails the 64-hex regex)
    - resolveAssetToFeedId('DOGECOIN') === null (unknown symbol)
    - resolveAssetToFeedId('') === null

    preflight-body.test.ts (build a representative valid CreateCallInput fixture: marketType 'priceTarget', eventSubtype 'none', category 'majors', assetA 'ETH', targetValue 420000000000n, expiry BigInt(now+7d), stake 5000000n, conviction 50, openToChallenges true, callerSettledCalls 0; callerAddress any 0x… address literal):
    - priceTarget + 'ETH': result.ok === true; body.marketType === 'priceTarget' AND typeof body.marketType === 'string' (regression pin for BUG 1); body.eventSubtype === 'none'; body.category === 'majors'; body.assetA === PYTH_FEED_IDS.ETH; assetAUint === BigInt(PYTH_FEED_IDS.ETH); assetBUint === 0n; body.targetValue === '420000000000'; body.stake === '5000000'; typeof body.expiry === 'number'; body.callerAddress === fixture address
    - priceTarget + 'DOGECOIN': result.ok === false, field === 'assetA', message === UNKNOWN_ASSET_MESSAGE
    - spreadVs + assetA 'BTC' + assetB 'eth': ok; body.assetA === PYTH_FEED_IDS.BTC; body.assetB === PYTH_FEED_IDS.ETH; assetBUint === BigInt(PYTH_FEED_IDS.ETH)
    - spreadVs + assetB undefined (or 'DOGECOIN'): result.ok === false, field === 'assetB'
    - event (marketType 'event', eventSubtype 'cexListing', criteriaText ≥50 chars) + assetA 'SomeNewToken': ok; body.assetA === 'SomeNewToken' (raw passthrough); assetAUint === 0n (mirrors relayer assetToUint256 fallback)
    - event + assetA 'ETH': ok; body.assetA === PYTH_FEED_IDS.ETH; assetAUint === BigInt(PYTH_FEED_IDS.ETH) (best-effort resolution)
    - parentCallId 5n → body.parentCallId === '5'; parentCallId undefined → body.parentCallId === undefined
  </behavior>
  <action>
    Placement decision (the QUICK spec allowed apps/web OR packages/shared — apps/web is chosen): packages/shared is consumed by the just-redeployed relayer; touching it widens the blast radius, requires a shared rebuild + export wiring, and risks violating the relayer-untouched constraint. Both helpers live in apps/web/app/new/lib/.

    1. apps/web/app/new/lib/resolve-asset.ts — export function resolveAssetToFeedId(input: string): `0x${string}` | null. Logic, in order: trim the input; if it matches /^0x[0-9a-fA-F]{64}$/ return it lowercased (as `0x${string}`); else uppercase the trimmed input and look it up in PYTH_FEED_IDS (imported from '@call-it/shared') — return the feed id on hit; else return null. Also export const UNKNOWN_ASSET_MESSAGE = 'Unknown asset — use a listed symbol (BTC, ETH, SOL…) or a Pyth feed id' (exact string per spec — reused by Task 2 hook abort and Task 3 schema refine so the message is identical everywhere). No other dependencies; must stay pure (importable in node-env vitest without React).

    2. apps/web/app/new/lib/preflight-body.ts — export function buildPreflightBody(input: CreateCallInput, callerAddress: `0x${string}`): PreflightBuildResult, where PreflightBuildResult is the discriminated union { ok: true; body: PreflightInput; assetAUint: bigint; assetBUint: bigint } | { ok: false; field: 'assetA' | 'assetB'; message: string }. Import CreateCallInput from '@call-it/shared' and PreflightInput from '@/lib/relayer-client' (Task 2 retypes it to string enums; write this file against the corrected type — TypeScript build is verified after Task 2; the vitest gate for this task is type-checked by vitest's esbuild transform loosely, full tsc rigor lands with the Task 3 build gate).

    CONSISTENCY INVARIANT (the reason this helper exists — document it in the file header): the relayer recomputes assetToUint256(body.assetA) for its duplicateHash (calls-preflight.ts:150-158: 0x-prefixed → BigInt, /^\d+$/ → BigInt, else 0n). Whatever uint the calldata carries for assetA MUST equal what the relayer derives from the preflight body, or preflight's dup-hash diverges from the contract's duplicateHash. buildPreflightBody is the ONLY place both values are derived.

    Per-market-type rules:
    - 'priceTarget': resolveAssetToFeedId(input.assetA); null → { ok: false, field: 'assetA', message: UNKNOWN_ASSET_MESSAGE }. Else body.assetA = resolved, assetAUint = BigInt(resolved), body.assetB = undefined, assetBUint = 0n.
    - 'spreadVs': resolve BOTH input.assetA and input.assetB (assetB undefined/empty string counts as unresolvable → field 'assetB'). body.assetA/body.assetB = resolved ids; assetAUint/assetBUint = BigInt of each.
    - 'event': best-effort — if resolveAssetToFeedId(input.assetA) resolves, use the resolved id in body.assetA and assetAUint = BigInt(resolved); else body.assetA = input.assetA raw (string passthrough — relayer assetToUint256 maps it to 0n) and assetAUint = 0n. Never returns ok:false for events. assetBUint = 0n, body.assetB = undefined.

    Enum fields — STRING passthrough using the shared types (this is the BUG 1 fix): body.marketType = input.marketType, body.eventSubtype = input.eventSubtype ?? 'none', body.category = input.category. Do NOT import or use MARKET_TYPE_TO_UINT/EVENT_SUBTYPE_TO_UINT/CATEGORY_TO_UINT in this file.

    Scalar fields — exactly as the current usePublishCall.ts:86-94 inline object: targetValue String(input.targetValue), expiry Number(input.expiry), stake String(input.stake), conviction Number(input.conviction), criteriaText input.criteriaText, openToChallenges input.openToChallenges, parentCallId input.parentCallId ? String(input.parentCallId) : undefined, callerAddress, callerSettledCalls input.callerSettledCalls.

    3. Write the two test files per the behavior block FIRST, watch them fail (helpers absent), then implement until green.
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/web exec vitest run tests/resolve-asset.test.ts tests/preflight-body.test.ts</automated>
  </verify>
  <done>Both new test files pass; resolveAssetToFeedId and buildPreflightBody are pure modules under apps/web/app/new/lib/ with zero React/network imports; UNKNOWN_ASSET_MESSAGE exported; no *_TO_UINT import anywhere in either new file.</done>
</task>

<task type="auto">
  <name>Task 2: Rewire usePublishCall + relayer-client — string-enum types, resolved calldata, 422 fieldErrors parsing, defensive toast</name>
  <files>apps/web/lib/relayer-client.ts, apps/web/app/new/hooks/usePublishCall.ts</files>
  <action>
    A. apps/web/lib/relayer-client.ts:
    1. Retype PreflightInput (lines ~474-490): marketType: MarketType; eventSubtype: EventSubtype; category: Category — import the three union types (type-only import) from '@call-it/shared'. All other fields unchanged. Leave DupCheckInput.marketType: number ALONE (different relayer route, out of scope).
    2. Fix relayerFetch's non-2xx JSON parsing (lines ~46-64, BUG 3): widen the parsed body type to also read errors?: Array<{ field?: string; code?: string; message?: string }>. After the existing body.fieldErrors read: if fieldErrors is still undefined AND body.errors is a non-empty array, fold it into Record<string, string[]> grouped by entry.field ?? 'root' with entry.message ?? entry.code ?? 'Validation error' as the value; also, if body.message was undefined, set message from the first entry's message so RelayerError.message is meaningful. Guard defensively (Array.isArray, typeof checks) so other endpoints' error bodies can never throw inside the error handler. Do not change the 2xx path or RelayerError's signature.

    B. apps/web/app/new/hooks/usePublishCall.ts:
    1. Imports: add buildPreflightBody from '../lib/preflight-body'. KEEP the MARKET_TYPE_TO_UINT/EVENT_SUBTYPE_TO_UINT/CATEGORY_TO_UINT imports — they remain correct for the on-chain uint8 enum args (calldata lines ~113-115 stay as-is).
    2. At the top of the try block, BEFORE getAccessToken() (the abort must precede ANY network call, and getAccessToken can hit the network): call buildPreflightBody(input, address). On { ok: false }: setError(built.field, { type: 'resolve', message: built.message }); showToast({ status: 'error', message: built.message, duration: 5000 }); setState to step 'error' with the message, isPublishing false; return { status: 'error' }. (This is the publish-time backstop; Task 3 adds the pre-modal inline validation — both are required by the spec.)
    3. On { ok: true }: replace the inline postPreflight payload object (lines ~80-95) with built.body — this swaps the three numeric enum fields for strings (BUG 1) and the raw input.assetA for the resolved id, keeping preflight's dup-hash consistent with the calldata.
    4. Calldata args (lines ~112-125): keep args 0-2 (the *_TO_UINT uint8 enums) unchanged; replace line 116's BigInt(input.assetA.startsWith('0x') ? input.assetA : '0x0') with built.assetAUint; replace line 117's hardcoded 0n with built.assetBUint (BUG 2 fix — comments on those lines should note the values come from buildPreflightBody to preserve the dup-hash invariant).
    5. Defensive toast in the catch block (lines ~179-216): define a module-level const HIDDEN_ERROR_FIELDS = new Set(['marketType', 'eventSubtype', 'category', 'expiry', 'parentCallId', 'callerAddress', 'callerSettledCalls', 'root']) — fields with no visible form input/error slot (spec names the first five; the last three are equally invisible and belong in the set). Keep the existing setError mapping loop. Then compute the toast message for the isPreflightError branch: if fieldErrors exists, is non-empty, and EVERY key is in HIDDEN_ERROR_FIELDS → 'Preflight rejected: ' + first hidden field's first message; if fieldErrors is undefined/empty on a 422 → use err.message (never the bare generic line when there is nothing visible to fix); otherwise (at least one error landed on a visible field) keep 'Please fix the form errors below'.
    6. Run the grep gates below; then confirm via grep that NO existing test pins the old numeric preflight payload: rg "MARKET_TYPE_TO_UINT|EVENT_SUBTYPE_TO_UINT|CATEGORY_TO_UINT" apps/web/tests — expected zero matches (verified at planning time); if any appear, update them honestly to the new string contract (D-15 — never weaken or delete assertions to pass).
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/web exec vitest run && bash -c "! grep -q \"input.assetA : '0x0'\" apps/web/app/new/hooks/usePublishCall.ts && grep -q 'buildPreflightBody' apps/web/app/new/hooks/usePublishCall.ts && grep -q 'assetBUint' apps/web/app/new/hooks/usePublishCall.ts && ! grep -q 'MARKET_TYPE_TO_UINT\[input.marketType\],$' apps/web/lib/relayer-client.ts && echo GATES-OK"</automated>
  </verify>
  <done>Full web vitest suite green (all 18 pre-existing test files + 2 new — none weakened); usePublishCall sends built.body (string enums + resolved assets) to postPreflight; calldata uses built.assetAUint/built.assetBUint; the line-116 '0x0' footgun is gone; PreflightInput is string-enum typed; relayerFetch folds the relayer's errors[] array into fieldErrors; hidden-field-only 422s surface their message in the toast.</done>
</task>

<task type="auto">
  <name>Task 3: Pre-modal inline validation (web-local schema + assetB error rendering) + builds + atomic commit</name>
  <files>apps/web/app/new/lib/web-call-schema.ts, apps/web/app/new/page.tsx, apps/web/app/new/components/SpreadVsFields.tsx</files>
  <action>
    1. apps/web/app/new/lib/web-call-schema.ts (new): export const webCreateCallSchema = createCallSchema (imported from '@call-it/shared') chained with an additional .superRefine (Zod supports chaining superRefine on the existing ZodEffects) that: for data.marketType 'priceTarget' OR 'spreadVs', adds a custom issue at path ['assetA'] with message UNKNOWN_ASSET_MESSAGE (imported from './resolve-asset') when resolveAssetToFeedId(data.assetA) === null; and for 'spreadVs' only, adds a custom issue at path ['assetB'] when data.assetB is undefined/empty or resolveAssetToFeedId(data.assetB) === null. EVENT-type is NOT gated (verified: shared schema assetA is intentionally freeform per its CALL-13 comment; relayer assetToUint256 falls back to 0n; event settlement is criteria-based, not Pyth — e.g. cexListing token names are valid non-feed assets). DO NOT modify packages/shared — the relayer imports the same createCallSchema module (D-29 parity), and a resolvability gate there would change the deployed wire contract.
    2. apps/web/app/new/page.tsx: change the resolver (line ~132) from zodResolver(createCallSchema) to zodResolver(webCreateCallSchema), importing it from './lib/web-call-schema'. Remove the now-unused createCallSchema import if nothing else in the file uses it. mode: 'onChange' is already set (line 133), so the unknown-asset error renders live in PriceTargetFields' existing errors.assetA slot BEFORE the user can reach the confirm modal — and because the resolver runs inside handleSubmit, an unresolvable asset also blocks onPublish from opening the modal at all (page.tsx:252/384 — handleSubmit(onPublish)).
    3. apps/web/app/new/components/SpreadVsFields.tsx: the Asset B Controller block (lines ~53-68) renders no error. Mirror the assetA pattern exactly: add the error border style on the input (style={errors.assetB ? { borderColor: 'var(--accent-loss)' } : undefined}) and the mono error div rendering errors.assetB.message below it.
    4. Builds (Git Bash, repo root): run pnpm --filter @call-it/shared build first (defensive — shared dist is gitignored and the web build consumes it; shared SOURCE is untouched), then pnpm --filter @call-it/web build. Both must be green. Then the full pnpm --filter @call-it/web exec vitest run once more. Shared vitest is NOT required since packages/shared is untouched — assert that with git status (next step).
    5. Untouched-tree assertion: git status --porcelain -- packages/shared apps/relayer must output NOTHING. If it does, revert those paths — the fix is apps/web-only by hard constraint.
    6. Atomic commit to master. Stage ONLY these nine paths explicitly (NEVER git add -A / git add . — the worktree carries unrelated dirt: packages/contracts/lib/openzeppelin-contracts submodule, 'call it frontend/', docs/, evidence/, .planning/, .gitignore files, apps/relayer/src/scripts/soak-*.sh, apps/web/tests/visual-smoke.spec.ts-snapshots/):
       apps/web/app/new/lib/resolve-asset.ts, apps/web/app/new/lib/preflight-body.ts, apps/web/app/new/lib/web-call-schema.ts, apps/web/app/new/hooks/usePublishCall.ts, apps/web/app/new/page.tsx, apps/web/app/new/components/SpreadVsFields.tsx, apps/web/lib/relayer-client.ts, apps/web/tests/resolve-asset.test.ts, apps/web/tests/preflight-body.test.ts.
       Commit message EXACTLY: fix(quick-260611-bf2): web publish path — preflight string enums + Pyth feed-id resolution (assetA/assetB)
       After committing, git status --porcelain must show no staged leftovers and git show --stat HEAD must list exactly the nine files. Do NOT push — the orchestrator pushes and performs live deployed verification.
    7. Write SUMMARY.md in .planning/quick/260611-bf2-fix-web-publish-preflight-contract/ (UNCOMMITTED — the orchestrator commits docs): what was broken (all three bugs), what changed per file, test counts before/after, the commit hash, and the live-verification handoff note below.
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/shared build && pnpm --filter @call-it/web build && pnpm --filter @call-it/web exec vitest run && bash -c "test -z \"$(git status --porcelain -- packages/shared apps/relayer)\" && git show --stat HEAD | grep -q 'fix(quick-260611-bf2)' && echo FINAL-GATES-OK"</automated>
  </verify>
  <done>Web build + shared build green; full web vitest green; packages/shared and apps/relayer have zero modifications; exactly one commit on master containing exactly the nine listed files with the exact message; SUMMARY.md written in the task dir and left uncommitted.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser → relayer (POST /api/calls/preflight) | Untrusted client input; relayer's string-enum Zod schema is the canonical validator and is UNTOUCHED by this fix |
| browser → chain (createCall calldata) | Client-built calldata; contract gates (asset allowlist, stake bounds, dup-hash) remain the backstop |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-bf2-01 | Tampering | buildPreflightBody dup-hash invariant | mitigate | Single helper derives BOTH preflight body assetA and calldata assetAUint; unit tests pin the invariant (preflight dup-hash diverging from contract duplicateHash would let dup calls slip the pre-check — contract still reverts as backstop) |
| T-bf2-02 | Spoofing | resolveAssetToFeedId 0x passthrough | accept | A raw 64-hex feed id is accepted as-is by design (composer placeholder promises it); the contract's asset allowlist (CALL-13) rejects non-allowlisted feeds at createCall |
| T-bf2-03 | Information Disclosure | toast surfacing relayer 422 messages | accept | Messages are Zod validation strings from our own schema — no secrets; bounded to first message only |
| T-bf2-SC | Tampering | npm/pip/cargo installs | accept | NO new packages installed by this plan (all imports already in apps/web deps + workspace @call-it/shared) — supply-chain surface unchanged |
</threat_model>

<verification>
1. `pnpm --filter @call-it/shared build` — green (defensive prebuild; shared source untouched).
2. `pnpm --filter @call-it/web build` — green.
3. `pnpm --filter @call-it/web exec vitest run` — ALL green: 18 pre-existing test files (none weakened — D-15) + tests/resolve-asset.test.ts + tests/preflight-body.test.ts.
4. `git status --porcelain -- packages/shared apps/relayer` — empty (relayer wire contract untouched).
5. Single commit on master: `fix(quick-260611-bf2): web publish path — preflight string enums + Pyth feed-id resolution (assetA/assetB)` — exactly 9 files.

**LIVE DEPLOYED VERIFICATION IS THE ORCHESTRATOR'S JOB POST-PUSH** (do not attempt from this plan): after push → Vercel auto-deploy, the orchestrator re-runs the real-session publish on https://call-it-web-sepolia.vercel.app/new and confirms (a) preflight 200 with a typed symbol, (b) on-chain assetA equals the resolved Pyth feed id, (c) unknown-asset inline error renders pre-modal. Note this handoff in SUMMARY.md.
</verification>

<success_criteria>
- Preflight POST body carries marketType/eventSubtype/category as the shared string-enum types — the proven-good contract from the diagnosis (200 ok:true on the reference payload shape).
- 'ETH' (any case, padded) resolves to 0xff61491a…0ace and that exact id appears in BOTH the preflight body and the createCall assetA uint; spreadVs assetB likewise (no more hardcoded 0n); event assets pass through ungated.
- Unresolvable assets error inline on assetA/assetB before the confirm modal AND abort publish() before any network call with the exact message "Unknown asset — use a listed symbol (BTC, ETH, SOL…) or a Pyth feed id".
- relayer 422 errors[] now reach RelayerError.fieldErrors; hidden-field-only failures surface "Preflight rejected: <message>" in the toast.
- apps/relayer + packages/shared byte-identical to HEAD~1; one atomic commit; SUMMARY.md in task dir uncommitted.
</success_criteria>

<output>
- Code: one commit to master (9 files, message above), NOT pushed.
- Docs: `.planning/quick/260611-bf2-fix-web-publish-preflight-contract/SUMMARY.md` — written, left uncommitted for the orchestrator.
</output>
