---
phase: 01-core-contracts-auth-frontend-skeleton
created: 2026-05-22
updated: 2026-05-29
status: partial
gaps_total: 6
gaps_open: 1
gaps_resolved: 4
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

**Status: RESOLVED 2026-05-29**

Deployed to Arbitrum Sepolia (chain 421614) via `DeployPhase1.s.sol`:
- **ProfileRegistry:** `0x4dCdE524F0566f583fab237d7CeED2fE8fB02322`
- **CallRegistry:**    `0xC61deC55ED916f97006FC1B01695Ee9297a8867C`
- **Deploy block:** 271888754 · **Deployer/owner:** `0xF4ee61950B63cCA5C82f1146484d018Ac95Bd0F2`

Post-deploy smoke test (§19.11) — all green:
- `tvlCap()` → `5000000000` ($5,000) ✓
- `currentTvl()` → `0` ✓
- `owner()` (both contracts) → deployer ✓
- `profileRegistry()` → ProfileRegistry address ✓

**Stack-pin reconciliation:** the `lib/openzeppelin-contracts` submodule was an uninitialized git submodule pointing at the stale **v5.3.0** commit. Bumped to the pinned **v5.6.1** (CLAUDE.md `=5.6.1`) before deploying; re-ran the full Foundry suite — **80/80 tests pass** against 5.6.1. The submodule gitlink bump is part of this change set.

Wired:
- `packages/shared/src/constants/addresses.ts` → `CALL_REGISTRY_ARBITRUM_SEPOLIA`, `PROFILE_REGISTRY_ARBITRUM_SEPOLIA`
- `packages/subgraph/subgraph.yaml` → both data-source `address` + `startBlock: 271888754`

**Still open (rolls into Step 11):** subgraph Studio deploy (`pnpm --filter @call-it/subgraph deploy:sepolia`) + confirm a synthetic `CallCreated` indexes within 30s. Contract verification on Arbiscan (`--verify`) deferred — needs a free Arbiscan API key.

### Gap 01-UAT-02 — OAuth round-trip → embedded wallet → onboarding (AUTH-03/04)

**Status: RESOLVED 2026-05-29** (verified live via Google; Twitter wired identically)

Verified the full OAuth → embedded-wallet → onboarding round-trip end-to-end against
a real Privy App ID + the locally-run relayer. **Google** was the verified path
(operator-confirmed: sign-in → authenticated session → embedded wallet → onboarding
flow advances handle → socials → … with no errors). Twitter uses the identical
`login({ loginMethods: ['twitter'] })` code path and the Twitter Developer App is
configured in Privy, so it exercises the same mechanism.

**Two real auth-gate bugs were found + fixed to get here** (first real OAuth login —
the Tier-2 browser path was always skipped in CI):
- **Middleware cookie mismatch** (commit `ef10f4e`): middleware read `privy-id-token`
  but the relayer verifies the ACCESS token (`privy-token`) via `verifyAuthToken`.
  Switched to `privy-token`; SignInButtons now writes the access token to a first-party
  cookie after auth so the server-side middleware can read it (Privy stores the session
  in localStorage by default and sets no first-party cookie).
- See also the relayer-boot + CORS fixes in the session note at the bottom of this file.

**Residual:** Twitter-specific round-trip (handle pre-link from `twitter_oauth`) not
separately screen-verified; mechanism identical to the verified Google path.

### Gap 01-UAT-03 — Fund flow (AUTH-23/25) — provider SUPERSEDED

**Status: RESOLVED 2026-05-29** (Coinbase Onramp dropped; funding is Privy-native)

The funding provider was switched from Coinbase Onramp (spec D-34) to **Privy-native
`useFundWallet`** (commit `73681c9`). Rationale: the operator hit Coinbase CDP setup
friction, and Coinbase Onramp cannot deliver Sepolia testnet USDC anyway. Privy
aggregates card (Moonpay/Coinbase) + external-wallet + exchange transfer behind one
dashboard-configured flow — no separate CDP app or `NEXT_PUBLIC_COINBASE_*` env vars.

The `/onboarding/fund` step renders both paths (Privy funding button + direct USDC
transfer with QR/copy) inside the now-working onboarding flow. The "fund flow exists"
requirement (AUTH-23/25) is satisfied. Supersedes spec D-34. For Sepolia testing,
fund the embedded wallet via the Circle faucet → direct transfer.

### Gap 01-UAT-04 — Paymaster 5-tx cap end-to-end (AUTH-27 / D-02)

**Status:** failed (cannot run in CI — needs Alchemy AA + 5 confirmed UserOps)

**Expected:** First 5 `createCall` userOps are sponsored by Alchemy AA bundler. The 6th attempt receives `-32000 sponsorship-cap-exceeded` from `/api/paymaster/policy`. The `PaymasterCapBanner` appears in the UI offering the Circle USDC Paymaster handoff. The `useCirclePaymaster` hook signs an EIP-2612 permit and the 6th tx lands via Circle Paymaster (USDC gas).

**How to close:** With real `NEXT_PUBLIC_ALCHEMY_AA_POLICY_ID` + Sepolia deployment from Gap 01-UAT-01, run 5 `createCall` from a fresh embedded wallet, confirm Upstash counter increments on each `UserOperationEvent`, attempt the 6th — verify the cap-banner + Circle handoff fires and lands the tx.

**Status update 2026-05-29 — UNBLOCKED, full e2e pending.** The relayer now boots and
serves locally (`/paymaster/policy` reachable; auth + onboarding round-trip verified).
The paymaster *counter* uses Upstash REST (works). Two gaps remain before the 5→6 e2e
can be exercised:
1. `ALCHEMY_WS_URL` is not set, so the `paymaster-confirmer` WebSocket worker (which
   increments the counter on confirmed `UserOperationEvent`s) does not start — the
   counter won't auto-increment from real userOps without it.
2. Requires actually sending 6 sponsored `createCall` userOps from a funded embedded
   wallet on Sepolia.
Neither is a code defect; both are operator/runtime setup. Relayer-side cap logic +
`PaymasterCapBanner` + Circle handoff hook are all in place and unit-tested (111 relayer
tests pass).

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
6. ~~**Coinbase Onramp app config**~~ — SUPERSEDED 2026-05-29 (funding is Privy-native now; see Gap 03).

## Session note — 2026-05-29: operator onboarding + local-stack bring-up

External services wired (values in gitignored `.env.local` + GCP Secret Manager
project `call-it-sepolia-602217`): Privy app, Alchemy (RPC + AA policy `274820ba…`),
Fly app `call-it-relayer-sepolia` + Postgres `call-it-pg-sepolia`, Upstash Redis,
15 GCP secrets. Sepolia contracts deployed (Gap 01). `deploy-relayer.yml` gaps fixed
(real GCP project id + `POSTGRES_URL`/`PRIVY_WEBHOOK_SECRET`/`ENS_MAINNET_RPC_URL` added
to fetch+inject lists).

**Full local stack verified working** (web :3000 → relayer :8080 → Fly Postgres via
`flyctl proxy`): sign-in → embedded wallet → onboarding round-trip. Three latent Phase 1
bugs found + fixed along the way — all never caught because browser/relayer-boot paths
were skipped in CI:

| Fix | Commit | What |
|---|---|---|
| Auth gate | `ef10f4e` | middleware read `privy-id-token`; switched to `privy-token` (access token, matches relayer `verifyAuthToken`) + client writes first-party cookie post-auth |
| Relayer boot | `3accb16` | `@call-it/shared` `export *` barrel → explicit named re-exports (named imports unresolvable under tsx+NodeNext); viem `webSocketTransport` → `webSocket` |
| CORS | `f58564f` | added `@fastify/cors` — web→relayer browser calls were cross-origin with no CORS (prod bug too: Vercel↔Fly) |

**Local-run notes for resume:** relayer runs via `node --env-file=.env.local --import tsx
src/index.ts` from `apps/relayer/` with `flyctl proxy 5432 -a call-it-pg-sepolia` open and
`POSTGRES_URL` pointed at `127.0.0.1:5432`; web `.env.local` `NEXT_PUBLIC_RELAYER_BASE_URL`
points at `http://localhost:8080`. Revert both to the Fly URL once the relayer is deployed.
Upstash free-tier REST is not BullMQ-TCP-compatible (`connect EPERM` log noise, non-fatal);
needs Upstash Pro or a Fly Redis sidecar for the job queue at deploy time.
