---
phase: 01-core-contracts-auth-frontend-skeleton
plan: 01
subsystem: ui, database, infra
tags: [pnpm-workspace, tailwind-preset, drizzle-orm, postgres, eslint-flat-config, env-schema, wave-0]

# Dependency graph
requires:
  - phase: 00-foundation
    provides: "pnpm monorepo, @call-it/shared, @call-it/config, apps/relayer singleton patterns (getRedis), Pino logger, GCP Secret Manager wiring, env schema baseline"
provides:
  - "@call-it/ui workspace shell (empty — Plan 04 populates components)"
  - "packages/ui/tailwind.preset.ts with neobrutalist tokens (brand-bg, brand-accent #E8F542, outcome-win/loss/contrarian, Syne/Space Grotesk/JetBrains Mono fonts, 3px/4px borders)"
  - "Drizzle ORM schema (address_book, auth_methods, onboarding_state) with migration SQL"
  - "getDb() singleton following getRedis() pattern"
  - "Phase 1 env Zod schema extension (NEXT_PUBLIC_CIRCLE_PAYMASTER_ADDRESS, POSTGRES_URL, ENS_MAINNET_RPC_URL, PRIVY_APP_ID, ALCHEMY_AA_POLICY_ID, etc.)"
  - "packages/config/versions.lock.json with 13 locked exact versions"
  - "WAVE-0-VERIFICATION.md with @privy-io/wagmi@4.0.8 API surface confirmed + operator gates for Items 2-4"
  - "CIRCLE_PAYMASTER_ARBITRUM_ONE constant in packages/shared (MEDIUM-confidence, requires operator verification)"
affects:
  - "01-02 through 01-10 (all Phase 1 plans depend on @call-it/ui workspace being installable)"
  - "01-05 (Privy provider wiring — unblocked by wagmi API verification)"
  - "01-06 (address book routes — Drizzle schema must be present)"
  - "01-07 (paymaster policy route — blocked on Items 2-4 of WAVE-0-VERIFICATION.md)"

# Tech tracking
tech-stack:
  added:
    - "drizzle-orm@0.45.2 (relayer dep)"
    - "drizzle-kit@0.31.10 (relayer devDep)"
    - "postgres@3.4.9 — postgres-js driver for Drizzle"
    - "class-variance-authority@0.7.1 (ui dep — version locked)"
    - "framer-motion@11.18.2 (ui dep — version locked)"
    - "@radix-ui/react-dialog, @radix-ui/react-popover, @radix-ui/react-tooltip, @radix-ui/react-slider (ui deps — exact versions pending)"
  patterns:
    - "packages/ui workspace follows exact packages/shared manifest structure"
    - "Tailwind preset extracted from apps/web into packages/ui/tailwind.preset.ts; apps/web consumes via presets: [uiPreset]"
    - "getDb() singleton mirrors getRedis() pattern (module-level let _db, lazy init, _resetDbForTesting)"
    - "ESLint flat config (eslint.config.js) for packages/ui — ESLint 9 does not support .eslintrc.cjs"
    - "packages/config/eslint/base.js extended with Receipt.tsx no-display-grid scope (Pitfall 15 pre-emption)"
    - "EnvConfigSchema extended with superRefine cross-field validation for POSTGRES_URL localhost in mainnet (T-01-02)"

key-files:
  created:
    - "packages/ui/package.json — @call-it/ui workspace manifest"
    - "packages/ui/tsconfig.json — extends @call-it/config/tsconfig/library.json"
    - "packages/ui/src/index.ts — empty barrel (Plan 04 populates)"
    - "packages/ui/tailwind.preset.ts — neobrutalist design tokens"
    - "packages/ui/vitest.config.ts — test config for ui package"
    - "packages/ui/eslint.config.js — flat config extending @call-it/config/eslint/base"
    - "packages/config/tsconfig/library.json — JSX-capable library tsconfig for packages/ui"
    - "apps/relayer/drizzle.config.ts — Drizzle Kit config (schema, out, dialect postgresql)"
    - "apps/relayer/src/db/schema.ts — addressBook, authMethods, onboardingState tables"
    - "apps/relayer/src/db/client.ts — getDb() singleton + _resetDbForTesting()"
    - "apps/relayer/src/db/index.ts — barrel export for db module"
    - "apps/relayer/src/db/migrations/0000_brainy_morlocks.sql — CREATE TABLE for all 3 tables"
    - "packages/config/versions.lock.json — locked exact versions of Phase 1 deps"
    - ".planning/phases/01-core-contracts-auth-frontend-skeleton/WAVE-0-VERIFICATION.md — Wave 0 verification record"
  modified:
    - "apps/web/package.json — added @call-it/ui workspace:* dep"
    - "apps/web/tailwind.config.ts — reduced to presets: [uiPreset] + content globs"
    - "packages/config/eslint/base.js — added Receipt.tsx no-display-grid scope block"
    - "packages/config/package.json — added ./tsconfig/library export"
    - "apps/relayer/package.json — added drizzle-orm, postgres, drizzle-kit; added db:generate/push/migrate scripts"
    - "apps/relayer/src/types.ts — added POSTGRES_URL, ENS_MAINNET_RPC_URL, Phase 1 env fields to RelayerEnv"
    - "apps/relayer/src/lib/secret-manager.ts — added Phase 1 secret fetches to loadSecrets()"
    - "packages/shared/src/schemas/env-config.ts — extended with Phase 1 env vars"
    - "packages/shared/src/constants/addresses.ts — added CIRCLE_PAYMASTER_ARBITRUM_ONE, CIRCLE_PAYMASTER_ARBITRUM_SEPOLIA"

key-decisions:
  - "ESLint 9 requires flat config (eslint.config.js) — packages/ui uses eslint.config.js not .eslintrc.cjs (deviation from plan wording, semantically equivalent)"
  - "packages/config/tsconfig/library.json created as new config for JSX-enabled library packages (not present in Phase 0)"
  - "Drizzle-kit generates combined single migration (0000_brainy_morlocks.sql) for all 3 tables — kept as canonical; satisfies plan acceptance criteria of 'at least one SQL file with CREATE TABLE for all 3 tables'"
  - "Task 3 (operator verification) executed partially: @privy-io/wagmi API surface + dep versions verified programmatically; Circle paymaster address + Alchemy RPC choice flagged in WAVE-0-VERIFICATION.md for operator browser verification before Plan 07"
  - "CIRCLE_PAYMASTER_ARBITRUM_ONE committed with MEDIUM-confidence RESEARCH value 0x6C973... — must be replaced after operator confirms against current Arbitrum docs (T-01-01)"

patterns-established:
  - "packages/ui workspace: mirrors packages/shared manifest structure; uses library.json tsconfig"
  - "Tailwind preset pattern: shared design tokens extracted to packages/ui/tailwind.preset.ts; consuming apps use presets: [uiPreset]"
  - "getDb() pattern: exact analog of getRedis() — module-level let _db, lazy construct on first call, _resetDbForTesting for test isolation"
  - "ESLint no-display-grid scoping: add new files block in packages/config/eslint/base.js per affected path — do not duplicate the rule body"

requirements-completed: [AUTH-31, AUTH-32, SAFETY-18]

# Metrics
duration: 18min
completed: 2026-05-22
---

# Phase 1 Plan 01: Wave 0 Foundation Summary

**@call-it/ui workspace shell + Drizzle ORM 3-table schema + Phase 1 env extension with all envs validated in Zod — foundation for Plans 02-10**

## Performance

- **Duration:** 18 min
- **Started:** 2026-05-22T06:56:31Z
- **Completed:** 2026-05-22T07:14:21Z
- **Tasks:** 3 (2 auto, 1 partial-checkpoint)
- **Files modified:** 19

## Accomplishments

- `@call-it/ui` workspace created, installable from monorepo root, `pnpm --filter @call-it/ui build` + lint pass; `apps/web` consumes via workspace dep
- Tailwind neobrutalist design tokens extracted from `apps/web/tailwind.config.ts` into `packages/ui/tailwind.preset.ts`; `apps/web/tailwind.config.ts` reduced to `presets: [uiPreset]`; web build regression passes
- Drizzle ORM schema for `address_book`, `auth_methods`, `onboarding_state` with correct column lengths (varchar 42/128/32) per T-01-03; migration SQL generated
- `getDb()` singleton follows `getRedis()` pattern exactly (lazy init, memoization, test reset helper)
- Phase 1 env schema extended with NEXT_PUBLIC_CIRCLE_PAYMASTER_ADDRESS, POSTGRES_URL (with mainnet/localhost guard T-01-02), ENS_MAINNET_RPC_URL, PRIVY_APP_ID, ALCHEMY_AA_POLICY_ID, PRIVY_WEBHOOK_SECRET
- `@privy-io/wagmi@4.0.8` API surface verified: `createConfig` + `WagmiProvider` match RESEARCH Pattern 3 — Plan 05 unblocked
- `packages/config/versions.lock.json` created with 13 locked exact versions; 4 deferred to Plan 05/06
- Relayer Phase 0 tests: 31/31 pass

## Task Commits

1. **Task 1: Create @call-it/ui workspace shell + tailwind preset + ESLint base wiring** — `e8bce35` (feat)
2. **Task 2: Fly Postgres + Drizzle schema (3 tables) + db client singleton + migrations** — `c973b36` (feat)
3. **Task 3: Wave 0 verification + versions.lock.json + Circle paymaster placeholder** — `f5e450e` (chore)

## Files Created/Modified

- `packages/ui/package.json` — @call-it/ui workspace manifest with all required deps and peer deps
- `packages/ui/src/index.ts` — empty barrel export (Plan 04 populates)
- `packages/ui/tailwind.preset.ts` — neobrutalist tokens (brand-bg, brand-accent, outcome-win/loss/contrarian, fonts, borders)
- `packages/ui/eslint.config.js` — flat config for @call-it/ui (ESLint 9 requirement)
- `packages/config/tsconfig/library.json` — new JSX-capable library tsconfig for packages/ui
- `packages/config/eslint/base.js` — added Receipt.tsx no-display-grid scope block (Pitfall 15 pre-emption)
- `apps/web/tailwind.config.ts` — now uses presets: [uiPreset]; has packages/ui content glob
- `apps/web/package.json` — added @call-it/ui workspace:* dep
- `apps/relayer/src/db/schema.ts` — addressBook, authMethods, onboardingState tables with column constraints
- `apps/relayer/src/db/client.ts` — getDb() singleton + _resetDbForTesting() + _setDbForTesting()
- `apps/relayer/src/db/index.ts` — barrel re-exports
- `apps/relayer/drizzle.config.ts` — Drizzle Kit configuration
- `apps/relayer/src/db/migrations/0000_brainy_morlocks.sql` — combined migration with all 3 tables
- `apps/relayer/src/types.ts` — RelayerEnv extended with Phase 1 fields
- `apps/relayer/src/lib/secret-manager.ts` — loadSecrets() fetches Phase 1 secrets
- `packages/shared/src/schemas/env-config.ts` — Phase 1 env schema with cross-field refinements
- `packages/shared/src/constants/addresses.ts` — CIRCLE_PAYMASTER_ARBITRUM_ONE placeholder
- `packages/config/versions.lock.json` — 13 locked dep versions
- `.planning/phases/01-core-contracts-auth-frontend-skeleton/WAVE-0-VERIFICATION.md` — Wave 0 record

## Decisions Made

- **ESLint flat config:** Plan wording said `.eslintrc.cjs`; ESLint 9 (installed in monorepo) requires `eslint.config.js`. Created `packages/ui/eslint.config.js` instead. Semantically identical — same base config, same rules. Plan acceptance criteria fully met.
- **library.json tsconfig:** Plan references `@call-it/config/tsconfig/library.json` but it didn't exist. Created it as a JSX-enabled variant of `base.json`. Added to `packages/config/package.json` exports.
- **Drizzle migration naming:** `drizzle-kit generate` produced a single combined file `0000_brainy_morlocks.sql`. Plan says "either is acceptable as long as the SQL exists in version control." Kept as-is per the plan's guidance.
- **Task 3 partial automation:** The `@privy-io/wagmi` API surface and dependency versions were verified programmatically. The Circle paymaster address (browser-only verification) and Alchemy RPC choice (dashboard-only) are flagged in WAVE-0-VERIFICATION.md for operator action before Plan 07.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created missing library.json tsconfig**
- **Found during:** Task 1 (packages/ui tsconfig setup)
- **Issue:** Plan references `@call-it/config/tsconfig/library.json` but it did not exist. The shared package uses `base.json` directly with no JSX support. packages/ui needs JSX (`react-jsx`) for its component files.
- **Fix:** Created `packages/config/tsconfig/library.json` extending `base.json` with `"jsx": "react-jsx"`, `"lib": ["dom", "dom.iterable", "ES2022"]`. Added export to `packages/config/package.json`.
- **Files modified:** `packages/config/tsconfig/library.json`, `packages/config/package.json`
- **Committed in:** e8bce35 (Task 1 commit)

**2. [Rule 3 - Blocking] ESLint flat config required instead of .eslintrc.cjs**
- **Found during:** Task 1 (packages/ui lint verification)
- **Issue:** ESLint 9.x (installed as `^9.0.0`) does not support `.eslintrc.cjs`. Running `eslint src/` with a `.eslintrc.cjs` file produced: "ESLint couldn't find an eslint.config.(js|mjs|cjs) file."
- **Fix:** Created `packages/ui/eslint.config.js` (flat config, CJS module.exports) extending the shared base. Removed `.eslintrc.cjs`.
- **Files modified:** `packages/ui/eslint.config.js` (new), `.eslintrc.cjs` (deleted)
- **Verification:** `pnpm --filter @call-it/ui lint` exits 0
- **Committed in:** e8bce35 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 3 — blocking)
**Impact on plan:** Both auto-fixes necessary for the plan to work with the existing monorepo toolchain. No scope creep.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `CIRCLE_PAYMASTER_ARBITRUM_ONE = '0x6C973...'` | `packages/shared/src/constants/addresses.ts` | MEDIUM-confidence RESEARCH value. Must be verified by operator against current Arbitrum docs before Plan 07. `WAVE-0-VERIFICATION.md` Item 2 gates this. |
| `CIRCLE_PAYMASTER_ARBITRUM_SEPOLIA = null` | `packages/shared/src/constants/addresses.ts` | Pending Wave 0 browser verification (Item 3). Likely no Sepolia paymaster exists; Sepolia uses Alchemy sponsorship. |
| `packages/ui/src/index.ts` has `export {}` only | `packages/ui/src/index.ts` | Intentional. Plan 04 populates all UI components. |
| `NOT_YET_INSTALLED` entries in versions.lock.json | `packages/config/versions.lock.json` | @account-kit/infra, react-hook-form, @hookform/resolvers, ts-morph install in Plan 05/06. File will be updated then. |

## Threat Flags

No new threat flags beyond what the plan's threat model already covers. The `CIRCLE_PAYMASTER_ARBITRUM_ONE` placeholder is tracked as T-01-01 in the plan's threat register.

## User Setup Required

**Wave 0 operator verification required before Plan 07 begins.** See `WAVE-0-VERIFICATION.md` for:

1. **Item 2:** Verify Circle USDC Paymaster mainnet address against `docs.arbitrum.io`
2. **Item 3:** Check if Sepolia Circle paymaster exists (likely: no — use Alchemy sponsorship)
3. **Item 4:** Determine Alchemy paymaster RPC method (ERC-7677 vs `alchemy_requestGasAndPaymasterAndData`)

Plans 02-06 CAN proceed without this verification. Only Plan 07 (paymaster policy route) is blocked.

**Fly Postgres provisioning** (user_setup in plan frontmatter) is still required before Plan 06 (address book routes):
- `fly postgres create --region iad --name call-it-pg`
- `fly postgres attach call-it-pg --app call-it-relayer`
- Store POSTGRES_URL in GCP Secret Manager for both sepolia and mainnet projects

## Next Phase Readiness

- Plans 02-06 are unblocked — `@call-it/ui` workspace is installable; Drizzle schema compiles; env schema is extended
- Plan 05 unblocked: `@privy-io/wagmi@4.0.8` API surface confirmed compatible with RESEARCH Pattern 3
- Plan 07 blocked on 3 browser-verification items in `WAVE-0-VERIFICATION.md`
- Fly Postgres must be provisioned + attached before Plan 06 (address book routes go live)

## Self-Check

- [x] `packages/ui/package.json` exists with `"name": "@call-it/ui"` — FOUND
- [x] `apps/web/package.json` has `"@call-it/ui": "workspace:*"` — FOUND
- [x] `apps/web/tailwind.config.ts` has `presets: [uiPreset]` — FOUND
- [x] `apps/relayer/src/db/schema.ts` exports addressBook, authMethods, onboardingState — FOUND
- [x] `apps/relayer/src/db/client.ts` has `let _db:` lazy memoization — FOUND
- [x] Migration SQL contains CREATE TABLE for all 3 tables — FOUND (0000_brainy_morlocks.sql)
- [x] `packages/config/versions.lock.json` exists with @privy-io/wagmi entry — FOUND
- [x] `WAVE-0-VERIFICATION.md` contains "Circle USDC Paymaster" — FOUND
- [x] Commits e8bce35, c973b36, f5e450e exist in git log — FOUND

## Self-Check: PASSED

---

*Phase: 01-core-contracts-auth-frontend-skeleton*
*Completed: 2026-05-22*
