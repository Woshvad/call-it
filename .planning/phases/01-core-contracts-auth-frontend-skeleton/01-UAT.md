---
phase: 01-core-contracts-auth-frontend-skeleton
created: 2026-05-22
updated: 2026-05-22
status: partial
gaps_total: 6
gaps_open: 4
gaps_resolved: 1
gaps_partial: 1
verification_source: .planning/phases/01-core-contracts-auth-frontend-skeleton/01-VERIFICATION.md
---

# Phase 01 — UAT (Operator + Human Verification)

Phase 1 execution is complete: 10 plans landed across 7 waves, ~45 commits, 257+ tests pass. Verifier reported `human_needed` because 1 deploy-gate + 5 live-integration tests were operator-bound. Status as of 2026-05-22:

- **Gap 5 (Circle Paymaster mainnet address) — RESOLVED** via web verification. Bonus: Sepolia paymaster address (`0x31BE08D380A21fc740883c0BC434FcFc88740b58`) also captured — was previously assumed not to exist.
- **Gap 6 (Visual snapshot baselines) — PARTIAL.** 2 of 9 baselines generated (signin, new-call). Plan 10 introduced three real bugs (route at `_dev/` invisible to Next.js router, middleware redirect intercepting the route, two component prop-shape mismatches in the design-system page) — all three fixed in commits 1dfaaf0 / `fix(01-UAT-06)`. The remaining 7 baselines require either a real Privy App ID at CI build time OR a follow-up refactor to opt /dev/* routes out of the global Providers wrapper.
- **Operator setup item #2 (Alchemy paymaster RPC choice) — RESOLVED** via web verification. WAVE-0-VERIFICATION Item 4 updated with the full integration plan.
- **Gaps 1, 2, 3, 4 — still operator-bound** (Sepolia deploy with funded key, live OAuth round-trip, Coinbase Onramp popup, full paymaster 5→6 e2e).

## Gaps

### Gap 01-UAT-01 — CallRegistry / ProfileRegistry Sepolia deploy

**Status:** failed (not yet attempted)

**What:** The contract code is complete and verified (80 Foundry tests pass) but has not been deployed to Arbitrum Sepolia. `addresses.ts` has placeholder `0x0...0` for both `CALL_REGISTRY_ARBITRUM_SEPOLIA` and `PROFILE_REGISTRY_ARBITRUM_SEPOLIA`. `subgraph.yaml` data-source addresses are likewise placeholder.

**How to close:**
```bash
# Requires funded Arbitrum Sepolia deployer key in $DEPLOYER_PRIVATE_KEY
cd packages/contracts
forge script script/DeployPhase1.s.sol:DeployPhase1 \
  --rpc-url arbitrum_sepolia \
  --broadcast \
  --verify

# Record deployed addresses
# Update packages/shared/src/constants/addresses.ts CALL_REGISTRY_ARBITRUM_SEPOLIA + PROFILE_REGISTRY_ARBITRUM_SEPOLIA
# Update packages/subgraph/subgraph.yaml CallRegistry + ProfileRegistry source.address + startBlock
# Re-deploy subgraph: pnpm --filter @call-it/subgraph deploy:sepolia
# Verify a synthetic CallCreated event indexes within 30s
```

### Gap 01-UAT-02 — Twitter OAuth round-trip (AUTH-04)

**Status:** failed (cannot run in CI — needs real Privy App ID + browser)

**Expected:** Signing in via the Twitter button on `/signin` produces an authenticated Privy session that includes an embedded wallet auto-created in the same flow AND the user's Twitter handle pre-linked, without a second prompt.

**How to close:** With a real Privy App ID set in `NEXT_PUBLIC_PRIVY_APP_ID`, run the web app locally (`pnpm --filter @call-it/web dev`), navigate to `/signin`, click Twitter, complete OAuth, and confirm:
1. Post-OAuth session has `embeddedWallet.address` populated.
2. `linkedAccounts` array includes a `twitter_oauth` entry with the handle.
3. Onboarding flow proceeds to `/onboarding/handle` with the Twitter handle pre-filled (AUTH-20 fallback chain).

### Gap 01-UAT-03 — Coinbase Onramp popup (AUTH-25 / D-34)

**Status:** failed (cannot run in CI — needs real Onramp credentials)

**Expected:** Clicking the Coinbase Onramp button on `/onboarding/fund` opens a popup window (NOT a redirect), the user completes a sandbox test purchase, returns to the fund screen, and the USDC balance refreshes within 5s.

**How to close:** Set `NEXT_PUBLIC_COINBASE_APP_ID` and `NEXT_PUBLIC_COINBASE_ONRAMP_API_KEY` from Coinbase Cloud sandbox. Test the full popup → return flow.

### Gap 01-UAT-04 — Paymaster 5-tx cap end-to-end (AUTH-27 / D-02)

**Status:** failed (cannot run in CI — needs Alchemy AA + 5 confirmed UserOps)

**Expected:** First 5 `createCall` userOps are sponsored by Alchemy AA bundler. The 6th attempt receives `-32000 sponsorship-cap-exceeded` from `/api/paymaster/policy`. The `PaymasterCapBanner` appears in the UI offering the Circle USDC Paymaster handoff. The `useCirclePaymaster` hook signs an EIP-2612 permit and the 6th tx lands via Circle Paymaster (USDC gas).

**How to close:** With real `NEXT_PUBLIC_ALCHEMY_AA_POLICY_ID` + Sepolia deployment from Gap 01-UAT-01, run 5 `createCall` from a fresh embedded wallet, confirm Upstash counter increments on each `UserOperationEvent`, attempt the 6th — verify the cap-banner + Circle handoff fires and lands the tx.

### Gap 01-UAT-05 — Circle USDC Paymaster mainnet address verification (D-04)

**Status: RESOLVED 2026-05-22**

Verified against both source-of-truth pages:
- https://docs.arbitrum.io/for-devs/third-party-docs/Circle/usdc-paymaster-quickstart
- https://www.circle.com/blog/how-to-integrate-circle-paymaster-...

Mainnet `0x6C973eBe80dCD8660841D4356bf15c32460271C9` matches RESEARCH placeholder. Confidence raised MEDIUM → HIGH. JSDoc in `addresses.ts` updated with both source URLs.

**Bonus discovery:** Sepolia paymaster exists at `0x31BE08D380A21fc740883c0BC434FcFc88740b58` (RESEARCH wrongly assumed there was no Sepolia paymaster). Populated in `addresses.ts`; type narrowed from `string | null` to `string` const. WAVE-0-VERIFICATION Items 2 + 3 closed. T-01-01 closed. Sepolia staging can now exercise the Circle handoff path before mainnet.

Commits: `e8ee76c` (addresses + WAVE-0 update).

### Gap 01-UAT-06 — Visual snapshot baselines + phase-1-complete tag (T-01-70)

**Status: PARTIAL — 2 of 9 baselines generated; 3 production bugs found and fixed along the way**

Production bugs found while attempting baseline generation (all fixed):

1. **Plan 10 placed the design-system page at `apps/web/app/_dev/design-system/`.** Next.js App Router treats underscore-prefixed folders as private (not routed). The route literally didn't exist in the build — every request to `/_dev/design-system` would 404. Renamed `_dev` → `dev`. The page's own runtime env-var guard (`NEXT_PUBLIC_DEV_ROUTES=1`) still gates production-disable.

2. **Middleware was redirecting `/dev/*` to `/signin`** because it wasn't in PUBLIC_PREFIXES. Added.

3. **Two component prop-shape mismatches** in the design-system page (`<CornerBrackets>` invoked with `size`/`strokeWidth`/`className`/children — the component takes no props; `<ConvictionBar>` missing required `onChange`). Both repaired.

Baselines generated (committed):
- `visual-smoke/signin-chromium-win32.png`
- `visual-smoke/new-call-chromium-win32.png`

Skipped (7 tests):
- `visual-smoke/home-feed`, `visual-smoke/profile` — Privy provider in the global ClientProviders throws on the mock app ID before the page mounts (known Plan 05 limitation, documented in 01-05-SUMMARY).
- All 5 `design-system-snap` tests — same root cause; the Privy crash in the global layout cascades to /dev/* because there's no opt-out from the global Providers wrapper.

**How to close fully:** Either (a) set a real Privy App ID in the CI env for the visual run, or (b) refactor the root layout to opt /dev/* out of the Providers wrapper (e.g., move /dev under a route group with its own minimal layout). The fully-passing visual gate is a Phase 1.x follow-up; the 2 baselines + bug fixes are net wins now.

Commits: `1dfaaf0` (design-system page prop fixes), `<HEAD>` (route rename + middleware + 2 baselines).

## Operator Setup Items (carry-forward from plan SUMMARYs)

Tracked separately from the UAT gaps above — these are infrastructure setup the operator needs to do at some point before mainnet, but don't block the code from being correct:

1. **Fly Postgres provisioning** (from 01-01 + 01-06) — `fly postgres create --region iad --name call-it-pg` + GCP Secret Manager `POSTGRES_URL` for both sepolia and mainnet projects.
2. **Alchemy paymaster RPC choice** (from 01-01 + 01-07) — **RESOLVED 2026-05-22.** Alchemy AA SDK ships BOTH `alchemyGasAndPaymasterAndDataMiddleware` (default, calls Alchemy's `alchemy_requestGasAndPaymasterAndData` against Alchemy's own infra — bypasses our endpoint) AND `erc7677Middleware` (opt-in, calls standard `pm_getPaymasterStubData`/`pm_getPaymasterData` against any URL — what Plan 07's `/paymaster/policy` is built for). Plan 07's design is CORRECT. WAVE-0-VERIFICATION Item 4 fully closed with the integration plan: dashboard policy URL + `createAlchemySmartAccountClient` with `erc7677Middleware` override in `aa-config.ts` (currently a typed stub per Plan 05 design).
3. **Privy webhook secret rotation runbook** (from 01-07) — verify Svix `whsec_`-prefixed format in GCP Secret Manager.
4. **ENS_MAINNET_RPC_URL** (from 01-01 + 01-09) — separate Alchemy free-tier Ethereum mainnet RPC for ENS reverse-record resolution (per-network IAM isolation from Phase 0 D-09).
5. **The Graph Studio deploy key** (from 01-10) — for `pnpm --filter @call-it/subgraph deploy:sepolia` to publish the extended mappings.
6. **Coinbase Onramp app config** (from 01-06) — Allowed Origins for production + dev URLs.
