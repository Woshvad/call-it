---
phase: quick-260611-bf2
reviewed: 2026-06-11T08:45:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - apps/web/app/new/lib/resolve-asset.ts
  - apps/web/app/new/lib/preflight-body.ts
  - apps/web/app/new/lib/web-call-schema.ts
  - apps/web/app/new/hooks/usePublishCall.ts
  - apps/web/app/new/page.tsx
  - apps/web/app/new/components/SpreadVsFields.tsx
  - apps/web/lib/relayer-client.ts
  - apps/web/tests/preflight-body.test.ts
  - apps/web/tests/resolve-asset.test.ts
findings:
  critical: 1
  warning: 2
  info: 5
  total: 8
status: issues_found
---

# Quick 260611-bf2: Code Review Report

**Reviewed:** 2026-06-11T08:45:00Z
**Depth:** standard
**Files Reviewed:** 9 (commit `ae29569`)
**Status:** issues_found

## Summary

The three diagnosed bugs are genuinely fixed for the priceTarget and spreadVs paths: the preflight body now carries string enums matching the relayer's `httpBodyPreprocessSchema` field-for-field (verified every field against `calls-preflight.ts:50-69` + `createCallSchemaStrict` — enums, bigint-as-string `targetValue`/`stake`, number `expiry`/`conviction`/`callerSettledCalls`, undefined-vs-omitted via `JSON.stringify` drop for `assetB`/`parentCallId`), the resolved feed id drives both the body and the calldata uints, and `relayerFetch` now folds the preflight's `errors[]` shape into `RelayerError.fieldErrors` with safe guards. The 18 new tests assert real wire-contract behavior (ran them: 18/18 green) and no existing test was touched (D-15 holds — commit adds only the 2 new test files).

The **event market type** is where the commit breaks down. Its `assetAUint = 0n` fallback violates the dup-hash invariant the file's own header declares, regresses the prior `BigInt(0x…)` passthrough for NFT-collection-address assets that `CallRegistry._assertAllowlisted` explicitly supports, and — because the relayer preflight has no allowlist gate — lets freeform event assets sail through preflight into a guaranteed on-chain `AssetNotAllowlisted` revert after the user signs. Separately, the on-chain `assetA` semantics change silently kills the debounced `DuplicateWarning` for symbol-typed calls.

RHF/zod integration checks out: chained `superRefine` on the `ZodEffects` works in zod 3.24, `code: 'custom'` is the correct literal without a direct zod import, empty `assetA` shows "Asset is required" (the object-level `min(1)` issue precedes the refine issue and zodResolver keeps the first error per path), and unresolvable values get field-scoped errors on `assetA`/`assetB` paths that block `handleSubmit(onPublish)` pre-modal.

## Critical Issues

### CR-01: Event fallback `assetAUint = 0n` violates the dup-hash invariant and regresses 0x-address event assets into guaranteed on-chain reverts

**File:** `apps/web/app/new/lib/preflight-body.ts:71-79`
**Issue:** The event branch sets `assetAUint = 0n` for ANY unresolvable string, but the relayer's `assetToUint256` (`apps/relayer/src/routes/calls-preflight.ts:150-158`, mirrored in `calls-dup-check.ts:89`) converts `0x`/`0X`-prefixed strings of any length AND `/^\d+$/` numeric strings via `BigInt()`. Three concrete failures:

1. **NFT-collection-address event assets** (`assetA = '0xAbc…'` 40-hex): web calldata carries `assetAUint = 0n` while `CallRegistry._assertAllowlisted` (CallRegistry.sol:496-505) requires `allowlistedNftCollections[address(uint160(assetA))]` for events — `address(0)` is never allowlisted → guaranteed `AssetNotAllowlisted` revert after the user signs. The PRE-commit calldata line (`BigInt(input.assetA.startsWith('0x') ? input.assetA : '0x0')`) derived this case correctly.
2. **Dup-hash divergence:** for the same inputs the relayer derives `BigInt('0xAbc…')` (or `BigInt('12345')`) for its `duplicateHash` while calldata carries `0n` — exactly the invariant the file header says "MUST equal" and claims this helper is "the ONLY place both values are derived." Preflight Gate 6.2 then checks the wrong hash for these event assets.
3. The test `event + non-feed asset 'SomeNewToken' … (relayer parity)` (`apps/web/tests/preflight-body.test.ts:107-123`) pins parity only for the non-hex/non-numeric case; no test covers a 0x-address or numeric-string event asset — the exact inputs where parity is false.

**Fix:** Mirror the relayer's derivation in the event fallback:
```ts
} else {
  const resolvedA = resolveAssetToFeedId(input.assetA);
  if (resolvedA !== null) {
    bodyAssetA = resolvedA;
    assetAUint = BigInt(resolvedA);
  } else {
    bodyAssetA = input.assetA;
    const trimmed = input.assetA.trim();
    if (/^0[xX][0-9a-fA-F]+$/.test(trimmed) || /^\d+$/.test(trimmed)) {
      assetAUint = BigInt(trimmed); // relayer assetToUint256 parity (NFT addr / numeric)
    } else {
      assetAUint = 0n;
    }
  }
  bodyAssetB = undefined;
}
```
(Use a hex-validity regex rather than bare `startsWith('0x') → BigInt` so `'0xNotHex'` cannot throw client-side; note the relayer's own `BigInt(trimmed)` throws → 500 on such input — relayer-side, out of scope here but worth a follow-up.) Add tests for `'0x' + 40-hex` and `'12345'` event assets pinning `assetAUint === BigInt(...)`.

## Warnings

### WR-01: Debounced DuplicateWarning is now permanently dead for symbol-typed calls — dup-check hash diverges from the new on-chain assetA

**File:** `apps/web/app/new/hooks/useDebouncedDupCheck.ts:58-66` (consequence of `usePublishCall.ts:133`)
**Issue:** `useDebouncedDupCheck` still posts the RAW symbol (`assetA: 'ETH'`) to `/api/calls/dup-check`, whose `assetToUint256('ETH')` → `0n`. Before this commit, published calls also landed on-chain with `assetA = 0` so the (broken) hashes at least matched. Now published calls carry `assetA = BigInt(feedId)`, so the dup-check hash can NEVER match an existing duplicate for symbol-typed priceTarget/spreadVs input — the `DuplicateWarning` UI (page.tsx:413-415) silently never fires. The plan declared dup-check out of scope, but this functional kill is a new consequence of the commit, not pre-existing breakage. Preflight Gate 6.2 (which now hashes correctly) and the contract remain backstops, so users hit the duplicate as a publish-time 422 instead of the early warning.
**Fix:** In `checkForDuplicate`, resolve before posting: `const resolved = resolveAssetToFeedId(assetA); postDupCheck({ ..., assetA: resolved ?? assetA, ... })`. One-line import of the existing helper; or document the degradation explicitly as a deferred follow-up.

### WR-02: Freeform event assets pass web validation AND relayer preflight but always revert `AssetNotAllowlisted` on-chain — user wastes a signature

**File:** `apps/web/app/new/lib/preflight-body.ts:71-79`, `apps/web/app/new/lib/web-call-schema.ts:27-44`
**Issue:** The code (and its comments: "event settlement is criteria/attestation-based, not Pyth. Never fails.") codifies that freeform event assets ('SomeNewToken', 'Uniswap' — exactly what `EventFields.tsx:59` invites with placeholder "e.g. ETH, Uniswap, EigenLayer") publish with `assetA = 0`. But `CallRegistry._assertAllowlisted` (CallRegistry.sol:493-506) runs for Event market types too and requires an allowlisted NFT collection address OR allowlisted feed key — `bytes32(0)` is neither, so the transaction is GUARANTEED to revert. The relayer preflight has no allowlist gate (its gates are stake/TVL/allowance/balance/dup only), so nothing stops the user before signing: web schema passes (events ungated), `buildPreflightBody` "never fails", preflight 200s, user signs, chain reverts. "Events must still publish with freeform assets" is unachievable end-to-end with the current contract; this commit ships comments and a test asserting the opposite.
**Fix:** Minimum: correct the comments in `preflight-body.ts` and `web-call-schema.ts` to state that non-allowlisted event assets WILL revert on-chain (don't claim relayer/contract tolerance that doesn't exist). Better: gate event-type `assetA` in `webCreateCallSchema` to resolvable feed ids / allowlisted identifiers, or surface a pre-sign warning. Contract/relayer-side allowlist preflight is a separate change.

## Info

### IN-01: 'root' is in HIDDEN_ERROR_FIELDS but has a visible error slot

**File:** `apps/web/app/new/hooks/usePublishCall.ts:36`, `apps/web/app/new/page.tsx:432-445`
**Issue:** The set's comment says "fields with NO visible form input / error slot", but `errors.root` renders an inline box in both standard and quote modes. A duplicate-call 422 (field `'root'` — the most likely real preflight failure besides stake) now toasts "Preflight rejected: …" while the root box ALSO renders; in quote mode the root box shows the hardcoded "Quote didn't post. Check your connection…" copy, contradicting the real cause (copy is pre-existing). Harmless duplication, but the classification contradicts its own comment.
**Fix:** Remove `'root'` from the set, or update the comment to say root is included deliberately so the toast carries the real message.

### IN-02: "Unknown asset" error renders on every keystroke for partial symbols

**File:** `apps/web/app/new/lib/web-call-schema.ts:27-36`, `apps/web/app/new/page.tsx:137`
**Issue:** With `mode: 'onChange'`, typing 'E' → 'ET' shows the unknown-asset error until 'ETH' completes. Empty input correctly shows "Asset is required" (the object-level `min(1)` issue precedes the refine issue; zodResolver keeps the first error per path) — verified. Plan-intended live validation, but noisy in the product's primary flow.
**Fix:** Consider `reValidateMode`/blur-scoped display for the unknown-asset message, or suppress it while the field is focused and shorter than the shortest catalogue symbol (2 chars).

### IN-03: usePreflightValidation is dead code whose latent behavior just changed

**File:** `apps/web/app/new/hooks/usePreflightValidation.ts`
**Issue:** No caller anywhere in apps/web (grep: zero `runPreflight`/`usePreflightValidation` usages outside the file). It duplicates the D-31 fieldErrors→setError mapping that `usePublishCall` owns, and the new `errors[]` folding now activates its previously-dead `body.fieldErrors` branch — drift risk if someone wires it later.
**Fix:** Delete the hook, or note it as superseded by `usePublishCall`.

### IN-04: Dead `else if (fields.length === 0)` branch in the toast logic

**File:** `apps/web/app/new/hooks/usePublishCall.ts:237-240`
**Issue:** `toastMessage` is already initialized to `message` at line 229, so the branch assigns the value it already holds. Not wrong — just dead weight that implies a distinction that doesn't exist.
**Fix:** Drop the branch and keep the comment on the initialization.

### IN-05: `PreflightInput.callerSettledCalls` is optional but the relayer requires it

**File:** `apps/web/lib/relayer-client.ts:526`
**Issue:** `callerSettledCalls?: number` — but the relayer's `httpBodyPreprocessSchema` requires it (`z.union([z.number(), z.string()]).transform(...)`, not `.optional()`), so any future caller omitting it gets a 422. `buildPreflightBody` always sets it, so not live today. Pre-existing typing, surfaced by the retype work in this commit.
**Fix:** Make it required: `callerSettledCalls: number`.

---

## Fix Status (review-fix pass, 2026-06-11)

Applied on master in `fix(quick-260611-bf2): review fixes — relayer-parity asset fallback, canonical dup-check asset, event allowlist gating` (apps/web only; relayer/shared/contracts untouched).

| Finding | Status | Resolution |
|---------|--------|------------|
| CR-01 | **FIXED** | `assetToUint256Parity` in `resolve-asset.ts` mirrors the relayer's `assetToUint256` (trimmed 0x/0X-hex → BigInt, pure-digit → BigInt, else 0n; hex-validated so `'0xNotHex'` → 0n instead of throwing). Event fallback in `preflight-body.ts` now uses it — dup-hash invariant holds for symbol / 64-hex feed id / 0x-address / numeric / freeform. New tests: 0x 40-hex collection address, numeric `'12345'`, malformed `'0xNotHex'`. |
| WR-01 | **FIXED** | `useDebouncedDupCheck` now posts `canonicalAssetForWire(assetA)` (resolved feed id when listed, raw otherwise) — the same canonical value the preflight body + calldata carry. Debounce untouched. Hook has no render-tests (no @testing-library dep); the canonicalization is the extracted pure helper `canonicalAssetForWire`, covered by 3 new tests incl. the symbol→uint parity pin. |
| WR-02 | **FIXED (gate branch)** | Contract verified: `_assertAllowlisted` is called unconditionally in createCall validation (CallRegistry.sol:201) and its Event branch (lines 496-501) requires an allowlisted NFT collection address OR feed key — `bytes32(0)` reverts. So the event exemption was removed: `webCreateCallSchema` now gates event `assetA` on resolvable-or-0x/numeric with inline copy "Use a listed asset (BTC, ETH, SOL…)". Comments in `preflight-body.ts`/`web-call-schema.ts` corrected to state the on-chain revert reality. Residual gap (unallowlisted feed id / collection address still reverts) is relayer/contract-side, noted in the schema header. 6 new schema tests. |
| IN-01 | DEFERRED | `'root'` left in `HIDDEN_ERROR_FIELDS` — removing it changes toast/root-box duplication behavior (UX decision, incl. pre-existing quote-mode copy mismatch); not risk-free in this pass. |
| IN-02 | DEFERRED | Keystroke-noise suppression for partial symbols is an RHF validation-mode/UX change — out of scope for a review-fix pass. |
| IN-03 | DEFERRED | `usePreflightValidation.ts` dead-code deletion left for a cleanup pass (zero callers confirmed; superseded by `usePublishCall` — noted here as the supersession record). |
| IN-04 | **FIXED** | Dead `else if (fields.length === 0)` branch removed in `usePublishCall.ts`; intent comment moved to the `toastMessage` initialization. |
| IN-05 | **FIXED** | `PreflightInput.callerSettledCalls` now required (`number`, not `number?`) in `relayer-client.ts` — matches the relayer's non-optional schema; type-safe since `CreateCallInput.callerSettledCalls` is required. |

Post-fix: `pnpm --filter @call-it/web build` green; full web vitest 21 files / 197 tests green (23 added, zero pre-existing tests modified or weakened — D-15 holds).

---

_Reviewed: 2026-06-11T08:45:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
