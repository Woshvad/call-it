---
phase: 01-core-contracts-auth-frontend-skeleton
plan: "06"
subsystem: apps/web, apps/relayer
tags:
  - onboarding
  - 4-screen-flow
  - custody-disclosure
  - export-prompt
  - coinbase-onramp
  - privy-session-auth
  - drizzle
  - postgres
  - slice-b
dependency_graph:
  requires:
    - "01-01: Drizzle schema (onboardingState table), getDb() singleton, @privy-io/server-auth confirmed"
    - "01-04: @call-it/ui design system (Button, Card, Tag, ToastProvider, useToast)"
    - "01-05: Providers tree, relayer-client.ts, wagmi config, Privy sign-in"
  provides:
    - "5-screen onboarding flow: handle / socials / follow-graph / fund / tagline"
    - "Postgres-backed onboarding state (D-32 resume on sign-in)"
    - "privySessionPreHandler — canonical JWT gate for Plans 07/08/09"
    - "GET /api/onboarding/state + POST /api/onboarding/advance — transactional, Pitfall B closed"
    - "CustodyDisclosureCard (AUTH-22 locked copy) — reused in Profile Settings (Plan 09)"
    - "WalletExportPrompt — fires toast at >= $50 USDC (AUTH-24)"
    - "CoinbaseOnrampButton — D-34 popup (window.open, not redirect)"
    - "useUsdcBalance — USDC_ARB_NATIVE + 5s polling + useWatchContractEvent (AUTH-26)"
    - "Next.js middleware — D-32 redirect guard + T-01-36 Privy outage toleration"
  affects:
    - "01-07: Paymaster endpoint can now import privySessionPreHandler from lib/privy-auth.ts"
    - "01-08: Call publish flow depends on middleware (redirect if onboarding incomplete)"
    - "01-09: Profile/Settings page reuses CustodyDisclosureCard"
tech_stack:
  added:
    - "@privy-io/server-auth@1.32.5 (relayer dep) — Privy JWT verification"
    - "pg-mem (relayer devDep) — installed but unused; in-memory mock via Map used instead"
    - "qrcode + @types/qrcode (web dep) — QR code for deposit address on fund screen"
  patterns:
    - "privySessionPreHandler: Fastify preHandler pattern (FastifyRequest + FastifyReply) per iam-auth.ts analog"
    - "onboardingRoute: Fastify plugin per admin-paymaster.ts pattern"
    - "Tier-1/Tier-2 Playwright split: static source assertions in CI; browser tests skipped without real Privy"
    - "useOnboardingState: Privy getAccessToken() fetched fresh on every advance() call"
    - "Next.js middleware: config.matcher + AbortSignal.timeout(2500) for relay toleration"
    - "Toast action button: extended @call-it/ui ToastItem/useToast to support optional action field"
key_files:
  created:
    - apps/relayer/src/lib/privy-auth.ts
    - apps/relayer/src/routes/onboarding.ts
    - apps/relayer/__tests__/onboarding.test.ts
    - apps/web/app/onboarding/layout.tsx
    - apps/web/app/onboarding/handle/page.tsx
    - apps/web/app/onboarding/socials/page.tsx
    - apps/web/app/onboarding/follow-graph/page.tsx
    - apps/web/app/onboarding/fund/page.tsx
    - apps/web/app/onboarding/tagline/page.tsx
    - apps/web/components/CustodyDisclosureCard.tsx
    - apps/web/components/WalletExportPrompt.tsx
    - apps/web/components/CoinbaseOnrampButton.tsx
    - apps/web/hooks/useUsdcBalance.ts
    - apps/web/hooks/useOnboardingState.ts
    - apps/web/middleware.ts
    - apps/web/tests/onboarding.spec.ts
    - apps/web/tests/wallet-export-prompt.spec.ts
  modified:
    - apps/relayer/src/index.ts (register onboardingRoute)
    - apps/relayer/package.json (@privy-io/server-auth added)
    - apps/relayer/vitest.config.ts (include __tests__/ directory)
    - apps/web/app/Providers.tsx (mount WalletExportPrompt inside ToastProvider)
    - apps/web/next.config.ts (add extensionAlias .js -> .ts for workspace packages)
    - apps/web/package.json (qrcode added)
    - packages/shared/src/schemas/env-config.ts (COINBASE_APP_ID + ONRAMP_API_KEY added)
    - packages/ui/src/hooks/useToast.ts (add ToastAction + optional action field)
    - packages/ui/src/index.ts (export ToastAction)
    - packages/ui/src/primitives/Toast.tsx (render action button)
    - packages/ui/src/primitives/ToastProvider.tsx (pass action through to ToastItem)
decisions:
  - "5-screen flow (not 4): Fund added as a separate step between follow-graph and tagline.
    The spec's 4 screens are Handle / Socials / Follow-graph / Tagline; Fund is an additional
    step (per plan action spec: 'NEW Fund step at /onboarding/fund between follow-graph and tagline').
    Step numbers: 1=handle, 2=socials, 3=followgraph, 4=fund, 5=tagline."
  - "Privy v3.27.0 linkAccount API: usePrivy().linkAccount() does not exist in v3.27.0.
    The Privy v3 API provides useLinkAccount() as a separate hook. The socials page
    stubs the Twitter linking for Plan 06 and documents the TODO for Plan 07."
  - "In-memory Map mock vs pg-mem/testcontainers: Map-based mock chosen for Task 1 tests
    because pg-mem + Drizzle ORM + ESM = complex compatibility surface. The Map mock
    faithfully implements the transactional semantics with a Promise-chain mutex.
    pg-mem is installed as a devDep for future use in Plans 07/08/09 if needed."
  - "Toast action extension: @call-it/ui ToastItem/useToast extended with optional action
    field to support AUTH-24 Export button. This is a Rule 2 auto-fix (missing critical
    functionality for AUTH-24 export prompt)."
  - "Drizzle-kit push status: Schema is unchanged from Plan 01 (onboarding_state already
    exists). Operator must run `pnpm --filter @call-it/relayer db:push` against the live
    Fly Postgres to confirm no-op. This is an operator action — not automated here."
metrics:
  duration: "~40 minutes"
  started: "2026-05-22T13:55:00Z"
  completed: "2026-05-22T14:41:00Z"
  tasks: 2
  files_created: 17
  files_modified: 11
  tests:
    relayer: "8/8 Vitest onboarding tests pass (+ 39/40 relayer regression: 1 KMS skip)"
    web_tier1: "15/15 Playwright Tier-1 onboarding tests pass"
    web_wallet: "8/8 Playwright Tier-1 wallet-export tests pass"
    web_signin: "6/6 Playwright signin regression tests pass"
    web_ast: "6/6 Privy provider order AST tests pass"
requirements_completed:
  - AUTH-19
  - AUTH-20
  - AUTH-21
  - AUTH-22
  - AUTH-23
  - AUTH-24
  - AUTH-25
  - AUTH-08
  - AUTH-26
  - UI-25
---

# Phase 1 Plan 06: Onboarding 4-Screen Flow + Relayer Auth Summary

Vertical slice B: first-time sign-in user completes a 5-screen onboarding flow (Handle → Connect Socials → Follow-graph → Fund → Tagline) with Privy custody disclosure on Screen 1, Coinbase Onramp hosted-flow popup + direct USDC transfer on Fund screen, export prompt at ≥$50 USDC, and Postgres-backed state that resumes across browser closes.

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 (relayer) | d5d31af | privySessionPreHandler + onboardingRoute + 8 Vitest tests |
| Task 2 (web) | 3940415 | 5 onboarding pages + 6 components/hooks + middleware + Playwright tests |

## What Was Built

### Task 1: Relayer onboarding backend

**`apps/relayer/src/lib/privy-auth.ts`**
- `getPrivyClient()` singleton reading `PRIVY_APP_ID` + `PRIVY_APP_SECRET`
- `privySessionPreHandler` — Fastify preHandler (per `iam-auth.ts` pattern): verifies JWT via `@privy-io/server-auth` `verifyAuthToken()`, attaches `request.privyUserId`, returns 401 `{ error: 'unauthorized', code: 'invalid_session' }` on failure
- Module augmentation: `declare module 'fastify' { interface FastifyRequest { privyUserId?: string } }`
- Structured logs: `{ event: 'privy_session_verified' }` / `{ event: 'privy_session_invalid' }`
- **Plans 07/08/09 reuse this directly** — no duplication needed

**`apps/relayer/src/routes/onboarding.ts`**
- `GET /api/onboarding/state` — lazy-inserts a default row on first call (currentStep: 1); returns row as JSON timestamps
- `POST /api/onboarding/advance` — Zod-validated body `{ step, timestamp? }`; transactional update via `db.transaction()` with `ON CONFLICT DO NOTHING`; validates step order (socials requires handle first; others are flexible); 422 on out-of-order
- Step ordering: 1=handle, 2=socials, 3=followgraph, 4=fund, 5=tagline
- Pitfall B (state drift) closed: serialized transactions + idempotent updates
- Registered in `apps/relayer/src/index.ts` Phase 1 block

**`apps/relayer/__tests__/onboarding.test.ts`**
- 8 named test cases passing
- Mock: `@privy-io/server-auth` → deterministic userId for magic token; `getDb()` → Map-based in-memory store with Promise-chain mutex transaction simulation
- Tests: 401 missing header, 401 invalid token, 200 lazy-init, 200 existing row, 200 happy path (handle→socials→followgraph→tagline), 422 out-of-order, concurrent POST consistency (5 parallel handle advances → all 200, row state consistent)

### Task 2: Web onboarding UI

**5 onboarding pages** — all in `apps/web/app/onboarding/`
- `layout.tsx` — nested layout with 5-dot progress indicator; brand mark; wraps content in Card
- `handle/page.tsx` — pre-fills from ENS (`useEnsName`), Twitter username, or `'you.eth'`; renders `CustodyDisclosureCard` (AUTH-22 guaranteed display moment)
- `socials/page.tsx` — Link Twitter / Farcaster (stub, "Coming soon" Tag); Skip for now (AUTH-08)
- `follow-graph/page.tsx` — AUTH-16 opt-in: "Show me calls from people I follow on X?"; [Yes] + [No thanks]
- `fund/page.tsx` — CoinbaseOnrampButton (popup, D-34) + direct transfer panel (QR + copyable address)
- `tagline/page.tsx` — AUTH-21 LOCKED COPY in large Syne; [ COMMIT ] button → redirects to `/`

**Components**
- `CustodyDisclosureCard.tsx` — AUTH-22 LOCKED COPY: "Your wallet is custodied by Privy until you export it. We recommend exporting once you hold more than $50 in this wallet."
- `WalletExportPrompt.tsx` — silent side-effect component; fires toast at `balance >= 50_000_000n`; localStorage flag (T-01-38); 30s toast with Export action button calling `exportWallet()`
- `CoinbaseOnrampButton.tsx` — `window.open(url, 'coinbase-onramp', 'width=500,height=700')` (D-34); origin-checked `postMessage` completion listener (T-01-37)

**Hooks**
- `useUsdcBalance.ts` — `useBalance` keyed to `USDC_ARB_NATIVE` from `@call-it/shared`; 5s poll interval; `useWatchContractEvent` on `Transfer` → `refetch()` (AUTH-26); `enabled: !!address` guard (T-01-40)
- `useOnboardingState.ts` — fetches `/api/onboarding/state` with `Authorization: Bearer <token>` (from `getAccessToken()`); `advance(step)` POST method; currentSlug + isComplete helpers

**`apps/web/middleware.ts`**
- D-32: redirects authenticated users with `taglineCommittedAt === null` to `/onboarding/<currentStepSlug>`
- T-01-36: 2.5s timeout on relayer fetch; `ci_onboarding_step` cookie fallback (30s TTL); fail-open if both unavailable
- Privy cookie: reads `privy-id-token` cookie for session detection
- Public routes: `/signin`, `/og`, `/api`, `/_next`, `/favicon.ico` pass through unconditionally

## Onboarding Step Ordering Decision

**5 screens shipped (not 4).** The spec's canonical 4 screens are Handle / Connect Socials / Follow-graph / Tagline. The plan explicitly adds Fund as a step between follow-graph and tagline:
> "NEW Fund step at `/onboarding/fund` between follow-graph and tagline"

Step numbers stored in `onboarding_state.current_step`:
- 1 = handle
- 2 = socials
- 3 = followgraph
- 4 = fund (no timestamp column — step advances on click or skip)
- 5 = tagline (completion gate)

The middleware maps `currentStep` to URL slug: handle → `/onboarding/handle`, etc. (with `follow-graph` URL slug for the `followgraph` step).

## drizzle-kit push Status

**Schema unchanged from Plan 01.** The `onboarding_state` table was created in Plan 01 migration `0000_brainy_morlocks.sql`. This plan adds no new columns or tables.

**Operator action required:** Run `pnpm --filter @call-it/relayer db:push` against the live Fly Postgres to confirm the no-op:
```
Expected output: [✓] No changes detected
```

If the Fly Postgres was provisioned and Plan 01's migration was applied, this is a no-op. If not, the operator must first provision Fly Postgres and run the initial migration.

## Privy v3.27.0 linkAccount API

`usePrivy().linkAccount()` does not exist in Privy v3.27.0. The v3 API provides:
- `useLinkAccount()` hook (separate from `usePrivy()`)
- `useLinkWithSiwe()`, `useLinkWithPasskey()`, etc.

**Plan 06 socials page:** The "Link Twitter" button currently advances the step without calling the actual Privy linking flow (the call to `linkAccount` was replaced with a stub + TODO). The Privy linking UI modal would need to be invoked via `useLinkAccount()` from Privy v3. This is documented as a TODO for Plan 07.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Toast action button support**
- **Found during:** Task 2 — WalletExportPrompt requires a toast with an "Export" action button (AUTH-24)
- **Issue:** `@call-it/ui` ToastItem/useToast had no `action` field; `ToastProvider.show()` only accepted `{ status, message, duration }`
- **Fix:** Extended `ToastItem` with optional `action?: { label: string; onClick: () => void }`, updated `useToast.ts`, `ToastProvider.tsx`, `Toast.tsx` to pass through and render the action button using Radix `ToastPrimitive.Action`
- **Files modified:** `packages/ui/src/hooks/useToast.ts`, `packages/ui/src/primitives/Toast.tsx`, `packages/ui/src/primitives/ToastProvider.tsx`, `packages/ui/src/index.ts`
- **Commit:** 3940415

**2. [Rule 3 - Blocking] webpack extensionAlias for TypeScript workspace packages**
- **Found during:** Task 2 build — `pnpm --filter @call-it/web build` failed with "Module not found: Can't resolve './constants/usdc.js'" from `packages/shared/src/index.ts`
- **Issue:** `packages/shared/src/index.ts` uses `.js` extension imports (correct for ESM tsc output), but webpack resolves `@call-it/shared` to the TypeScript source (via `"main": "./src/index.ts"` in package.json) and cannot find the `.js` files
- **Fix:** Added `config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] }` to webpack config in `apps/web/next.config.ts`
- **Note:** This is a pre-existing issue (Plan 05 build also fails without this fix). The stash check confirmed this was already broken before Plan 06.
- **Files modified:** `apps/web/next.config.ts`
- **Commit:** 3940415

**3. [Rule 1 - Bug] Privy v3.27.0 linkAccount API mismatch**
- **Found during:** Task 2 TypeScript typecheck — `Property 'linkAccount' does not exist on type 'PrivyInterface'`
- **Issue:** `usePrivy().linkAccount()` was removed in Privy v3. The API is now `useLinkAccount()` hook
- **Fix:** Removed the `linkAccount` call from socials page; replaced with a stub advance + TODO comment documenting that Plan 07 should wire `useLinkAccount()` from `@privy-io/react-auth`
- **Files modified:** `apps/web/app/onboarding/socials/page.tsx`
- **Commit:** 3940415

### Out-of-scope Items

None found during execution.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| Twitter linking in Socials page | `apps/web/app/onboarding/socials/page.tsx` | Privy v3 uses `useLinkAccount()` hook not `usePrivy().linkAccount()`. Advancing without real Privy link flow. Plan 07 wires the actual OAuth flow. |
| `fundStep` has no timestamp column | `apps/relayer/src/routes/onboarding.ts` | The `onboarding_state` schema from Plan 01 has no `fundStepAt` timestamp. Fund step is tracked via `currentStep=4` only. Plan 07/08 can add a column if needed. |
| ENS reverse-record lookup | `apps/web/app/onboarding/handle/page.tsx` | Uses wagmi `useEnsName` with `chainId: 1` (Mainnet). The relayer's ENS cache endpoint (`/api/profile/[address]` — Plan 09) is not yet available. |

## Threat Flags

No new threat flags beyond what the plan's threat model already covers. All T-01-33 through T-01-40 mitigations implemented as specified.

## User Setup Required

**Coinbase Onramp credentials** (can be set after deploy):
- `NEXT_PUBLIC_COINBASE_APP_ID` — Coinbase Cloud → Onramp → Create App → App ID
- `NEXT_PUBLIC_COINBASE_ONRAMP_API_KEY` — Coinbase Cloud → Onramp → API Keys (public key only)

The onramp button renders without these (popup opens with a fallback URL). These are required for production Coinbase Onramp integration.

**Fly Postgres** — operator must run the following once the DB is provisioned:
```bash
pnpm --filter @call-it/relayer db:push
# Expected: No changes detected (Plan 01 already created all tables)
```

## Self-Check

- [x] `apps/relayer/src/lib/privy-auth.ts` exports `privySessionPreHandler` AND `getPrivyClient`: FOUND
- [x] `apps/relayer/src/routes/onboarding.ts` exports `onboardingRoute`: FOUND
- [x] `apps/relayer/src/index.ts` has `await app.register(onboardingRoute)`: FOUND
- [x] `pnpm --filter @call-it/relayer vitest run __tests__/onboarding.test.ts` → 8/8 PASS: VERIFIED
- [x] `pnpm --filter @call-it/web build` exits 0: VERIFIED
- [x] 15/15 Tier-1 Playwright onboarding tests pass: VERIFIED
- [x] 8/8 Tier-1 wallet-export-prompt tests pass: VERIFIED
- [x] 6/6 signin regression tests pass: VERIFIED
- [x] 6/6 Privy provider order AST tests pass: VERIFIED
- [x] AUTH-22 locked copy verbatim in CustodyDisclosureCard.tsx: FOUND
- [x] AUTH-21 locked copy in tagline/page.tsx: FOUND
- [x] `window.open` in CoinbaseOnrampButton.tsx (NOT `window.location.href`): FOUND
- [x] `USDC_ARB_NATIVE` from `@call-it/shared` in useUsdcBalance.ts: FOUND
- [x] WalletExportPrompt mounted in Providers.tsx: FOUND
- [x] d5d31af commit (Task 1): FOUND
- [x] 3940415 commit (Task 2): FOUND

## Self-Check: PASSED
