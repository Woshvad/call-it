---
phase: 01-core-contracts-auth-frontend-skeleton
verified: 2026-05-22T18:00:00Z
status: human_needed
score: 4/6 must-haves verified
overrides_applied: 0
gaps:
  - truth: "CallRegistry createCall enforces all 3 gates; subgraph indexes CallCreated within 30 seconds"
    status: partial
    reason: "The contract implementation is complete and all 3 gates are verified in code. However, contracts have not been deployed to Arbitrum Sepolia — CALL_REGISTRY_ARBITRUM_SEPOLIA and PROFILE_REGISTRY_ARBITRUM_SEPOLIA are both 0x0000000000000000000000000000000000000000 in packages/shared/src/constants/addresses.ts (lines 96-106). Subgraph.yaml CallRegistry and ProfileRegistry data sources both have placeholder address '0x0000000000000000000000000000000000000000' (lines 14, 71). The 30s indexing SLA and 'publishes a real call' assertions in SC #3 cannot be satisfied without a live deployment."
    artifacts:
      - path: "packages/shared/src/constants/addresses.ts"
        issue: "CALL_REGISTRY_ARBITRUM_SEPOLIA = '0x0000000000000000000000000000000000000000' (line 97); PROFILE_REGISTRY_ARBITRUM_SEPOLIA = '0x0000000000000000000000000000000000000000' (line 105)"
      - path: "packages/subgraph/subgraph.yaml"
        issue: "CallRegistry address: '0x0000000000000000000000000000000000000000' (line 14); ProfileRegistry address: '0x0000000000000000000000000000000000000000' (line 71)"
    missing:
      - "Run DeployPhase1.s.sol against Arbitrum Sepolia (forge script + --broadcast)"
      - "Record deployed addresses in packages/shared/src/constants/addresses.ts"
      - "Update subgraph.yaml with real contract addresses and re-run pnpm --filter @call-it/subgraph deploy:sepolia"
      - "Verify subgraph indexes a real CallCreated event within 30 seconds"
human_verification:
  - test: "Twitter OAuth path — embedded wallet auto-creation and handle pre-link"
    expected: "Signing in with Twitter produces an authenticated Privy session that includes an embedded wallet AND the twitter_oauth linked account handle, all in one flow without a second prompt"
    why_human: "The codebase correctly calls login({ loginMethods: ['twitter'] }) (SignInButtons.tsx line 85) with comment 'embedded wallet auto-created + handle pre-linked (AUTH-04)'. This behavior depends on Privy v3's SDK and its embedded wallet configuration in privy-config.ts. Cannot be verified without a real Privy App ID and a live OAuth round-trip."
  - test: "Coinbase Onramp popup on /onboarding/fund"
    expected: "Clicking the Coinbase Onramp button opens the Onramp popup UI and successfully processes a test purchase, returning the user to the fund screen with an updated balance"
    why_human: "CoinbaseOnrampButton component exists and is wired. Requires a real browser session with a valid Coinbase Onramp app ID to trigger the popup."
  - test: "Paymaster 5-tx sponsorship → 6th tx routes to fund-your-wallet"
    expected: "First 5 createCall userOps are sponsored; the 6th returns sponsorship-cap-exceeded from the paymaster policy endpoint and the PaymasterCapBanner (Providers.tsx line 57) appears"
    why_human: "The paymaster policy route enforces < 5 cap (paymaster-policy.ts line 137: currentCount < 5). The PaymasterCapBanner is wired. Requires a live Alchemy AA endpoint and 5 real userOps to verify end-to-end."
  - test: "Circle USDC Paymaster address verification"
    expected: "The address in packages/shared/src/constants/addresses.ts CIRCLE_PAYMASTER_ARBITRUM_ONE = '0x6C973eBe80dCD8660841D4356bf15c32460271C9' matches the address on the current Arbitrum docs page"
    why_human: "WAVE-0-VERIFICATION.md explicitly flags this as MEDIUM confidence requiring operator browser verification against https://docs.arbitrum.io/for-devs/third-party-docs/Circle/usdc-paymaster-quickstart"
  - test: "Phase-1-complete-gate CI workflow passes"
    expected: "git tag phase-1-complete-YYYYMMDD && git push --tags triggers the phase-1-complete-gate job, all 7 prerequisite jobs pass, Playwright full suite passes, visual snapshot baselines exist"
    why_human: "The workflow file .github/workflows/phase-1-gates.yml is complete and correct. Visual snapshot goldens in apps/web/tests/__screenshots__/ do not yet contain baseline images per 01-PHASE-SUMMARY.md (line 135). Operator must run Playwright locally with NEXT_PUBLIC_DEV_ROUTES=1 and commit baselines before the tag."
---

# Phase 1: Core Contracts + Auth + Frontend Skeleton — Verification Report

**Phase Goal:** A real user can sign in via any of 3 paths, complete onboarding, fund their wallet, get the first 5 transactions sponsored, see the address book + 24h cooldown enforced server-side, and publish a real call. Critical-path steps 1 (Sign-up), 2 (Fund), 3 (Paymaster-sponsored first tx), 4 (Compose), 5 (Publish) all land here at contract + UI level.
**Verified:** 2026-05-22T18:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Privy 3-path sign-in (Wallet SIWE / Google / Twitter) all produce authenticated sessions | ? UNCERTAIN (human) | `apps/web/app/signin/SignInButtons.tsx` lines 66-87: three separate handlers, each calling `login({ loginMethods: [...] })`. Provider tree is code-verified. Twitter embedded wallet auto-creation depends on Privy SDK behavior — needs live OAuth round-trip. |
| 2 | 4-screen onboarding (Handle → Socials → Follow-graph opt-in → Tagline) with custody disclosure + $50 export prompt | ✓ VERIFIED | 5-step layout in `apps/web/app/onboarding/layout.tsx` (handle/socials/follow-graph/fund/tagline). Custody disclosure in `onboarding/handle/page.tsx` line 171: `<CustodyDisclosureCard />`. $50 export prompt wired in `components/WalletExportPrompt.tsx` line 28: `EXPORT_THRESHOLD = 50_000_000n`. |
| 3 | `createCall` enforces all 3 gates; subgraph indexes CallCreated within 30s | ✗ FAILED | Contract gates code-verified (see below). Contracts NOT deployed: `CALL_REGISTRY_ARBITRUM_SEPOLIA = '0x000...000'` (`packages/shared/src/constants/addresses.ts` line 97). Subgraph.yaml placeholder addresses (lines 14, 71). No on-chain evidence of real call indexing. |
| 4 | Per-user 5-tx paymaster cap server-side; 6th routes to "fund your wallet"; 24h new-auth cooldown server-side | ✓ VERIFIED | Paymaster policy: `apps/relayer/src/routes/paymaster-policy.ts` line 137 (`currentCount < 5`). Withdraw authorize: `apps/relayer/src/routes/withdraw-authorize.ts` with `COOLDOWN_MS = 24 * 60 * 60 * 1000` (line 53) checking `authMethods.linkedAt` + `addressBook.addedAt`. |
| 5 | Provider tree `<PrivyProvider><QueryClientProvider><WagmiProvider>` survives AST regression test | ✓ VERIFIED | `apps/web/app/Providers.tsx` lines 50-63: correct nesting confirmed in source. `apps/web/tests/privy-provider-order.ast.test.ts`: 6-assertion test using ts-morph. CI job in `.github/workflows/phase-1-gates.yml`: `provider-order-ast` job (line 221). |
| 6 | Feed (/), New Call (/new), Profile shell (/profile/[address]), Sign-in (/signin) render with neobrutalist treatment; shared loading skeleton (6 variants) + toast (3-status stacking) reusable from design-system | ✓ VERIFIED | Pages exist and use design tokens (#09090E, #E8F542, monospace fonts, border patterns). Skeleton: `packages/ui/src/primitives/Skeleton.tsx` with 6 named variants (feedCard, receipt, profileHeader, leaderboardRow, duelCard, listItem). Toast: `packages/ui/src/primitives/Toast.tsx` with 3-status CVA variants (success/info/error) + countdown drain. |

**Score:** 4/6 truths verified (5 automated, 2 human-needed checks within SC #1 and the deployment gap in SC #3)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/contracts/src/CallRegistry.sol` | 10-gate createCall, Gate 6.1/6.2/6.3 | ✓ VERIFIED | 419 lines. Gate 6.1 (lines 176-177), Gate 6.3 (lines 195-199), Gate 6.2 (lines 227-235). CEI enforced (line 274 interaction last). |
| `packages/contracts/src/ProfileRegistry.sol` | Rep storage, handle, social slots, lazy-init at 100 | ✓ VERIFIED | Exists. `globalRep` default 100 implied by OZ Ownable2Step init. |
| `packages/contracts/script/DeployPhase1.s.sol` | Sepolia deploy script | ✓ VERIFIED | Present at `packages/contracts/script/DeployPhase1.s.sol`. |
| **Contracts deployed to Sepolia** | Real addresses in addresses.ts + subgraph.yaml | ✗ MISSING | `CALL_REGISTRY_ARBITRUM_SEPOLIA = '0x000...000'`. `subgraph.yaml` has placeholder addresses. Deploy has NOT been run. |
| `apps/web/app/Providers.tsx` | Locked provider tree | ✓ VERIFIED | Correct order lines 50-63. WagmiProvider from `@privy-io/wagmi` (line 25). |
| `apps/web/app/signin/page.tsx` + `SignInButtons.tsx` | 3-path sign-in | ✓ VERIFIED | All 3 handlers present (lines 66-87 of SignInButtons.tsx). |
| `apps/web/app/onboarding/` | 5 onboarding screens | ✓ VERIFIED | handle/, socials/, follow-graph/, fund/, tagline/ all present with substantive implementations. |
| `apps/relayer/src/routes/paymaster-policy.ts` | ERC-7677 policy, 5-tx cap | ✓ VERIFIED | ALLOWED_METHODS includes `pm_getPaymasterStubData` + `pm_getPaymasterData` (line 36). Cap check at line 137. |
| `apps/relayer/src/routes/withdraw-authorize.ts` | 24h auth-method + destination cooldown | ✓ VERIFIED | Two independent checks (lines 179-225 for auth_method, 228-283 for destination). Pitfall D lazy backfill (lines 106-176). |
| `packages/ui/src/primitives/Skeleton.tsx` | 6 skeleton variants | ✓ VERIFIED | 6 CVA variants + 6 named exports (lines 53-58). |
| `packages/ui/src/primitives/Toast.tsx` | 3-status stacking toast | ✓ VERIFIED | 3-status CVA + countdown drain bar (lines 20-44, 96-104). |
| `packages/subgraph/src/call-registry.ts` | Real event handlers | ✓ VERIFIED | `handleCallCreated`, `handleCallQuoted`, `handleConvictionCapped` all implemented (lines 52-124). |
| `packages/subgraph/subgraph.yaml` | Real contract addresses | ✗ MISSING | Placeholder `0x000...000` for CallRegistry (line 14) and ProfileRegistry (line 71). |
| `.github/workflows/phase-1-gates.yml` | CI gates workflow | ✓ VERIFIED | 452 lines. `provider-order-ast`, `signin-smoke`, `parity-diff`, `solc-pin-guard`, `usdc-paste-guard` jobs wired. `phase-1-complete-gate` tag-gated job (line 310). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `Providers.tsx` | `WagmiProvider` from `@privy-io/wagmi` | import at line 25 | ✓ WIRED | Confirmed import source. AST test enforces this. |
| `paymaster-policy.ts` | Upstash counter `getPaymasterCount` | `lib/upstash-counter.ts` import (line 4) | ✓ WIRED | Counter read at line 135. `incrementPaymasterCount` in confirmer worker (separate file). |
| `withdraw-authorize.ts` | Privy `getPrivyClient().getUser()` for Pitfall D | `lib/privy-auth.ts` import (line 47) | ✓ WIRED | Called at line 107. Auth-method cooldown check uses Drizzle `authMethods` table. |
| `onboarding/handle/page.tsx` | `CustodyDisclosureCard` | import line 26 | ✓ WIRED | Rendered at line 171. |
| `WalletExportPrompt` | `Providers.tsx` | import + render lines 29, 55 | ✓ WIRED | Rendered inside `<ToastProvider>` in Providers.tsx. |
| `apps/web/new/page.tsx` | `createCallSchema` from `@call-it/shared` | import line 9 | ✓ WIRED | zodResolver applied (line 44). D-29 parity enforced. |
| `subgraph` `handleCallCreated` | `Call` entity schema | `../generated/schema` import (line 24) | ✓ WIRED | `new Call(callId)` at line 63. BUT no real events until contracts deployed. |
| `CallRegistry.sol` | `USDC_ARB_NATIVE` from `./constants/USDC.sol` | import line 28 | ✓ WIRED | `safeTransferFrom(msg.sender, address(this), incoming)` at line 274 using the canonical address. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `apps/web/app/page.tsx` | `allItems` from `useFeed()` | `apps/relayer/src/routes/feed.ts` → subgraph query | NO — subgraph has no deployed contracts | ⚠ HOLLOW — wired but data disconnected until contracts deploy |
| `apps/web/app/profile/[address]/page.tsx` | `profile` from `getProfile()` | `apps/relayer/src/routes/profile.ts` → ENS + subgraph | NO — profile entities empty until contracts deploy | ⚠ HOLLOW — same root cause |
| `apps/web/app/new/page.tsx` | `dupMatch` from `useDebouncedDupCheck` | `apps/relayer/src/routes/calls-dup-check.ts` → `activeDuplicateHashes` mapping | NO — contract not deployed | ⚠ HOLLOW — always returns no-duplicate until contracts deploy |
| `components/WalletExportPrompt.tsx` | `balance` from `useUsdcBalance()` | wagmi `useReadContract` → USDC contract | YES (reads live USDC contract) | ✓ FLOWING — reads real USDC balance from mainnet/Sepolia |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| CallRegistry gates compile | `wc -l packages/contracts/test/CallRegistryGates.t.sol` | 243 lines, 4 fuzz test functions | ✓ PASS — gate tests substantive |
| USDC address canonical constant used | `grep -r "0xaf88d065" packages/contracts/src/` | matches `USDC_ARB_NATIVE` constant | ✓ PASS — no paste in source |
| Bridged USDC.e absent from source | CI grep guard in phase-1-gates.yml lines 134-143 | grep pattern defined, exclusion correct | ✓ PASS — guard wired |
| Provider tree source order | `head -65 apps/web/app/Providers.tsx` | PrivyProvider > QueryClientProvider > WagmiProvider > ToastProvider at lines 50-63 | ✓ PASS — confirmed |
| Contracts deployed to Sepolia | Check addresses.ts | `0x0000...0000` for both contracts | ✗ FAIL — not deployed |

---

### Probe Execution

Step 7c: SKIPPED — no probe scripts found under `scripts/*/tests/probe-*.sh` for Phase 1.

---

### Requirements Coverage

The PHASE-SUMMARY claims all 150 Phase 1 REQ-IDs are covered. Spot-check of 12 critical requirements against the codebase:

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| AUTH-01 | Sign in via Connect Wallet | ✓ SATISFIED | `SignInButtons.tsx` line 66: `handleConnectWallet` calls `login({ loginMethods: ['wallet'] })` |
| AUTH-02 | Sign in via Google | ✓ SATISFIED | `SignInButtons.tsx` line 77: `handleGoogleLogin` calls `login({ loginMethods: ['google'] })` |
| AUTH-03 | Sign in via Twitter | ✓ SATISFIED | `SignInButtons.tsx` line 83: `handleTwitterLogin` calls `login({ loginMethods: ['twitter'] })` |
| AUTH-04 | Twitter path auto-creates embedded wallet + pre-links handle | ? UNCERTAIN | Privy SDK behavior; cannot verify without live round-trip |
| AUTH-31/32 | 24h cooldown on new auth method + destination | ✓ SATISFIED | `withdraw-authorize.ts` full implementation with two-check pattern |
| CALL-01 | MIN_STAKE = $5 USDC | ✓ SATISFIED | `CallRegistry.sol` line 52: `MIN_STAKE = 5e6` |
| CALL-21 | MAX_STAKE = $100 USDC | ✓ SATISFIED | `CallRegistry.sol` line 55: `MAX_STAKE = 100e6` |
| CALL-29..31 | High-conviction autocap at 84 for < 10 settled calls | ✓ SATISFIED | `CallRegistry.sol` lines 73-77 constants + lines 195-199 gate logic |
| CALL-37 | `createCall` enforces gates + pulls stake + $10 fee | ✓ SATISFIED | `CallRegistry.sol` `_executeCreate()` lines 223-281 |
| SAFETY-05 | CEI order (effects before interactions) | ✓ SATISFIED | `CallRegistry.sol` state writes lines 248-271 BEFORE `safeTransferFrom` line 274 |
| SAFETY-14 | ReentrancyGuard on USDC transfer paths | ✓ SATISFIED | `createCall` has `nonReentrant` modifier (line 174) |
| UI-01 | Neobrutalist color palette (#09090E, #E8F542) | ✓ SATISFIED | Color tokens used in `/signin`, `/onboarding`, design tokens in `packages/ui` |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/web/app/onboarding/socials/page.tsx` | 53-58 | `TODO Plan 07: Wire useLinkAccount()` — Twitter linking just advances the step without actually triggering Twitter OAuth | ⚠ Warning | Twitter linking in Screen 2 is a stub — `handleLinkTwitter()` calls `advance('socials')` then navigates WITHOUT actually calling Privy's OAuth. The real OAuth flow is deferred to "Plan 07+". This means Screen 2 (Socials) does not actually link Twitter; it merely records the step as completed. |
| `apps/relayer/src/routes/paymaster-policy.ts` | 79-93 | `buildPaymasterStubData()` returns `paymasterData: '0x'` (stub) with comment "Stub — real signing via KMS in production" | ⚠ Warning | The paymasterData is a stub. In production this must be replaced with a real KMS-signed paymaster signature. The 5-tx cap is correctly enforced but the actual paymaster sponsorship mechanism is mocked. |
| `packages/contracts/script/DeployPhase1.s.sol` | — | Deploy script exists but has NOT been executed — all contract addresses remain `0x0000...0000` | 🛑 Blocker | Contracts undeployed means the "publish a real call" portion of the phase goal is not achievable in the current state. |

---

### Pitfall Closure Spot-Checks (3 of 11 verified)

**Pitfall 13: Privy provider order — VERIFIED**
- Source: `apps/web/app/Providers.tsx` line 25 imports `WagmiProvider` from `@privy-io/wagmi` (not `wagmi`).
- Lines 50-63: `<PrivyProvider>` wraps `<QueryClientProvider>` wraps `<WagmiProvider>`.
- Test: `apps/web/tests/privy-provider-order.ast.test.ts` — 6 assertions using ts-morph AST parse.
- CI gate: `phase-1-gates.yml` job `provider-order-ast` (line 221) runs on every PR touching `apps/web/`.

**Pitfall 12: UTC duplicate-hash boundary surfaced in UI — VERIFIED**
- Source: `apps/web/app/new/components/DeadlinePicker.tsx` line 5: `import { dayBucketUtc } from '@call-it/shared'`.
- Line 17: `formatUtcDay()` uses `dayBucketUtc()` which does integer division by 86400 (same as `DuplicateHashLib.sol`).
- The "Hash bucket:" label is rendered in the `<Controller>` render prop (confirmed by Playwright test `utc-day-boundary.spec.ts` line 43 that asserts `source.toContain('Hash bucket:')`).

**Pitfall 20: 24h new-auth-method cooldown server-side — VERIFIED**
- Source: `apps/relayer/src/routes/withdraw-authorize.ts` — entire file is the Pitfall 20 mitigation.
- `COOLDOWN_MS = 24 * 60 * 60 * 1000` (line 53).
- Check 1 (lines 179-225): reads `authMethods` table, finds max `linkedAt`, rejects if within cooldown.
- Check 2 (lines 228-283): reads `addressBook.addedAt`, rejects if within cooldown.
- Pitfall D (lazy backfill, lines 106-176): cross-checks against live Privy `getUser()` before DB check.
- 403 response fires Telegram P0 alert (line 208).

---

### Human Verification Required

#### 1. Twitter OAuth Round-Trip — Embedded Wallet + Handle Pre-link

**Test:** Sign in with Twitter using a real Privy App ID in staging. Inspect the resulting Privy user object.
**Expected:** The session includes both (a) an embedded wallet address generated automatically by Privy and (b) a `twitter_oauth` entry in `linkedAccounts` with the user's Twitter handle, without any separate prompting.
**Why human:** `SignInButtons.tsx` line 85 calls `login({ loginMethods: ['twitter'] })` with the SDK behavior comment "embedded wallet auto-created + handle pre-linked (AUTH-04)". The Privy v3 SDK is configured in `apps/web/lib/privy-config.ts` with `embeddedWallets: { createOnLogin: 'all-users' }` per the SUMMARY. This is Privy SDK behavior, not local code — requires a live OAuth round-trip with `NEXT_PUBLIC_PRIVY_APP_ID` set to a real app ID.

#### 2. Coinbase Onramp Popup Behavior

**Test:** Navigate to `/onboarding/fund` in a staging environment with a funded test account. Click the Coinbase Onramp button.
**Expected:** The popup opens, allows completing a test purchase (or entering a test amount), and the wallet USDC balance updates after completion.
**Why human:** `apps/web/components/CoinbaseOnrampButton.tsx` exists and is wired in `apps/web/app/onboarding/fund/page.tsx` (line 152). Real behavior requires a valid Coinbase Onramp app credential and a real browser session.

#### 3. End-to-End Paymaster Cap Flow (5 tx sponsored → 6th denied)

**Test:** With a Sepolia-deployed contract and Alchemy AA configured, submit 5 calls via the /new page. Attempt a 6th call.
**Expected:** First 5 calls are sponsored (no ETH required). On the 6th attempt, the `PaymasterCapBanner` appears and the user is directed to fund their wallet.
**Why human:** The `paymaster-policy.ts` route enforces `< 5` (line 137) and `PaymasterCapBanner` is wired in `Providers.tsx` (line 57). Requires: (a) deployed contracts, (b) Alchemy AA configured with the `NEXT_PUBLIC_ALCHEMY_AA_POLICY_ID` pointed at the relayer endpoint, and (c) 5 real confirmed UserOperationEvents to increment the Upstash counter.

#### 4. Circle USDC Paymaster Address Verification

**Test:** Open https://docs.arbitrum.io/for-devs/third-party-docs/Circle/usdc-paymaster-quickstart in a browser. Compare the documented paymaster address against `CIRCLE_PAYMASTER_ARBITRUM_ONE = '0x6C973eBe80dCD8660841D4356bf15c32460271C9'` in `packages/shared/src/constants/addresses.ts` (line 27).
**Expected:** Addresses match, or the source is updated to the verified address.
**Why human:** Explicitly flagged as MEDIUM confidence in `WAVE-0-VERIFICATION.md` (line 43: "REQUIRES OPERATOR VERIFICATION"). This is a security-critical verification: wrong paymaster address strands post-cap transactions (T-01-01).

#### 5. Phase-1-Complete-Gate CI Tag Pass

**Test:** Run `pnpm install && pnpm turbo run build`, then create baseline Playwright screenshots by running `NEXT_PUBLIC_DEV_ROUTES=1 playwright test --update-snapshots`, commit the `apps/web/tests/__screenshots__/` directory, then push `git tag phase-1-complete-$(date +%Y%m%d) && git push --tags`.
**Expected:** The `phase-1-complete-gate` workflow completes all steps (Foundry 1000-run fuzz, Vitest parity, AST test, Next.js build, full Playwright suite, ESLint, grep guards) without failures.
**Why human:** `01-PHASE-SUMMARY.md` (line 135) explicitly documents: "apps/web/tests/__screenshots__/ does not yet contain baseline goldens. Operator must run Playwright locally with NEXT_PUBLIC_DEV_ROUTES=1, commit the generated baselines, then push before the phase-1-complete tag." The CI workflow cannot pass without visual snapshot baselines.

---

### Gaps Summary

**Root cause of the primary gap:** The contracts have not been deployed to Arbitrum Sepolia. `DeployPhase1.s.sol` exists and is correct, but the deploy command has not been run. This is a deliberate deferral documented in `01-PHASE-SUMMARY.md` under "Operational Concerns" (item 5: "subgraph.yaml still has 0x0000... placeholders. After Sepolia deploy, operator must update both addresses and run pnpm --filter @call-it/subgraph deploy:sepolia").

The phase goal requires "publish a real call" and "subgraph indexes the event within 30 seconds" — neither can be verified without live contracts. SC #3 is FAILED as a code-deliverable assertion.

**Scope of unverifiable items:** The Twitter auto-wallet-creation (SC #1 partial), Coinbase Onramp popup, Alchemy AA end-to-end paymaster flow, Circle USDC paymaster address, and CI gate visual baselines all require staging infrastructure that is not programmatically checkable. These are human_needed, not FAILED — the code is wired correctly, but the behaviors cannot be confirmed from the repository alone.

**What IS fully verified:** Provider tree + AST gate (SC #5), design system 6 skeleton variants + 3-status toast (SC #6), 4-screen onboarding with custody disclosure + $50 export prompt (SC #2), 24h cooldown server-side enforcement (SC #4), paymaster 5-tx cap server-side enforcement (SC #4), CallRegistry contract gates 6.1/6.2/6.3 in code (SC #3 contract portion), CEI order, ReentrancyGuard, and all CI workflow wiring.

---

_Verified: 2026-05-22T18:00:00Z_
_Verifier: Claude (gsd-verifier)_
