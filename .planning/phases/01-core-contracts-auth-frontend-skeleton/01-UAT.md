---
phase: 01-core-contracts-auth-frontend-skeleton
created: 2026-05-22
status: pending
gaps_total: 6
gaps_open: 6
gaps_resolved: 0
verification_source: .planning/phases/01-core-contracts-auth-frontend-skeleton/01-VERIFICATION.md
---

# Phase 01 — UAT (Operator + Human Verification)

Phase 1 execution is complete: 10 plans landed across 7 waves, ~40 commits, 257+ tests pass. Verifier reported `human_needed` because 1 deploy-gate + 5 live-integration tests are operator-bound (not orchestrator-resolvable). Each item below must be checked off before the phase can be marked fully complete in ROADMAP.

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

**Status:** failed (placeholder address — MEDIUM confidence)

**What:** `CIRCLE_PAYMASTER_ARBITRUM_ONE = '0x6C973eBe80dCD8660841D4356bf15c32460271C9'` in `packages/shared/src/constants/addresses.ts` is from MEDIUM-confidence RESEARCH (Plan 01 WAVE-0-VERIFICATION.md Item 2). Cannot ship to mainnet without browser-verifying this against current Arbitrum third-party docs + Circle's public paymaster announcement.

**How to close:**
1. Open https://docs.arbitrum.io/for-devs/third-party-docs/Circle/usdc-paymaster-quickstart — copy the current mainnet paymaster address verbatim.
2. Cross-check against https://www.circle.com/blog/how-to-integrate-circle-paymaster-to-enable-users-to-pay-gas-fees-with-their-usdc-balance
3. If different from `0x6C97...`, update `CIRCLE_PAYMASTER_ARBITRUM_ONE` in `addresses.ts` and re-run the relayer test suite.
4. Record the verification result in `WAVE-0-VERIFICATION.md` Item 2.

### Gap 01-UAT-06 — Visual snapshot baselines + phase-1-complete tag (T-01-70)

**Status:** failed (baselines not yet committed)

**What:** `apps/web/tests/visual-smoke.spec.ts` and `apps/web/tests/design-system-snap.spec.ts` use Playwright `toHaveScreenshot` but `apps/web/tests/__screenshots__/` is empty. The `phase-1-complete-gate` workflow runs these tests in tag mode but cannot pass without baselines.

**How to close:** Locally run:
```bash
pnpm --filter @call-it/web exec playwright test tests/visual-smoke.spec.ts --update-snapshots
pnpm --filter @call-it/web exec playwright test tests/design-system-snap.spec.ts --update-snapshots
```
Review each baseline image for design-system correctness; commit them. Then push the `phase-1-complete` tag to trigger the full gate workflow.

## Operator Setup Items (carry-forward from plan SUMMARYs)

Tracked separately from the UAT gaps above — these are infrastructure setup the operator needs to do at some point before mainnet, but don't block the code from being correct:

1. **Fly Postgres provisioning** (from 01-01 + 01-06) — `fly postgres create --region iad --name call-it-pg` + GCP Secret Manager `POSTGRES_URL` for both sepolia and mainnet projects.
2. **Alchemy paymaster RPC choice** (from 01-01 + 01-07) — Plan 07 picked ERC-7677 standard; verify against current Alchemy AA SDK docs that this is the supported method (or switch to `alchemy_requestGasAndPaymasterAndData` if v4-only).
3. **Privy webhook secret rotation runbook** (from 01-07) — verify Svix `whsec_`-prefixed format in GCP Secret Manager.
4. **ENS_MAINNET_RPC_URL** (from 01-01 + 01-09) — separate Alchemy free-tier Ethereum mainnet RPC for ENS reverse-record resolution (per-network IAM isolation from Phase 0 D-09).
5. **The Graph Studio deploy key** (from 01-10) — for `pnpm --filter @call-it/subgraph deploy:sepolia` to publish the extended mappings.
6. **Coinbase Onramp app config** (from 01-06) — Allowed Origins for production + dev URLs.
