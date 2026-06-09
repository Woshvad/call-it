---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: milestone
status: verifying
stopped_at: Phase 9 context gathered
last_updated: "2026-06-09T10:41:10.566Z"
last_activity: 2026-06-09 -- Phase 08 Plan 04 finalized (08-04 complete; phase 08 all 4 plans done)
progress:
  total_phases: 14
  completed_phases: 10
  total_plans: 75
  completed_plans: 75
  percent: 71
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-21)

**Core value:** Every call is permanent, public, and tied to identity. The receipt — created, settled, and shared — must be unfakeable, undeletable, and visually unmistakable.
**Current focus:** Phase 08 — farcaster-mini-apps

## Current Position

Phase: 08 (farcaster-mini-apps) — ALL 4 PLANS COMPLETE
Plan: 4 of 4 — DONE (08-01..08-04 all committed + SUMMARYd; ROADMAP plan-progress = Complete)

> **Phase 08 status (2026-06-09):** ✅ **ALL 4 plans COMPLETE.** 08-04 (Slice C — close the distribution loop) finalized: Task 1 (auto-post embed rides the receipt URL — worker verify-only, no payload change; Open Q3 compose host MIGRATED warpcast.com → farcaster.xyz, one-line pure-builder change) committed `ad81ea3`; Task 2 (SHARE AS FRAME outline control on the settled receipt action row) implemented + committed `83aeae9`. **Task-2 human-verify checkpoint APPROVED 2026-06-09** on the automated evidence (web 80/80, relayer 209 passed/1 skipped, both builds exit 0, control reuses existing design tokens + `rel="noopener noreferrer"`); the live in-Warpcast visual preview is DEFERRED to the existing Phase-10/soak gate (Arbitrum Sepolia is not in Warpcast's chainList, so an in-client transact preview is unavailable on testnet). SHARE-19 is Complete (traced to Phase 8 in REQUIREMENTS.md). Distribution loop closed (auto-post + manual SHARE AS FRAME both carry the Frame embed; live tap-to-transact remains the D-01 Phase-10 gate).

> **Phase 07 status (2026-06-08):** ✅ **ALL 6 plans COMPLETE.** 07-06 Task 2 (operator-gated live deploy) was executed LIVE by operator + orchestrator on 2026-06-08: subgraph **v0.9.0 published to Sepolia Studio** (D-01 — no DN; build `QmYrrSgVxr…`, `SUBGRAPH_URL_SEPOLIA` bumped, commit `1b0f9ff`; `_meta` block 275026674 `hasIndexingErrors:false`), **BOTH relayer migrations applied** to remote Sepolia Postgres `call_it_relayer_sepolia` (`0006 call_statement` + `0007 posted_receipts`, both verified present), **`apps/web` deployed to Vercel `call-it-web-sepolia`** (`https://call-it-web-sepolia.vercel.app`; net-new monorepo deploy config `apps/web/vercel.json` + root `.vercelignore`; `/feed`/`/leaderboard` 200, fallback OG 200 image/png), **Fly CORS allowlist** = exact Vercel origin (`X_API_WRITE_TOKEN` still UNSET, D-02), **CORS OPTIONS preflight PASSED** (204, exact origin not `*`). Deploy commits: `1b0f9ff`, `2d1d93e`, `8b82d70`, `0d2aa40`, `046cca9`, `f7f495b`. **3 residuals operator-pending (NOT marked passed):** Twitter Card Validator 5/5 (SHARE-13/D-08, browser-only), SC1 200px outcome-word baselines + authoritative `verify-event-coverage.ts` live run (OPS-04, needs a fresh seeded-settled run), and the incognito visual hydration spot-check (CORS + 200s already curl-confirmed). Evidence in `docs/operator/phase-7-deploy-runbook.md` § Outputs to record + `07-06-SUMMARY.md`. This unblocks the parked Phase-4 UAT-1/2/3.

> **Phase 01.5 status (2026-06-07):** ✅ **ALL 5 plans COMPLETE** — **01.5-02** (relayer social-link service), **01.5-03** (VerifiedBadge + AUTH-10 invariant), **01.5-04** (link/unlink UI + AuthKitProvider + opt-in), **01.5-05** (FEED sections — complete-with-documented-deferral: X/Neynar keys deferred, AUTH-14 live data dormant until keys set; AUTH-15/16/17/18 satisfied + tested), and **01.5-01** (env surface + setRelayer). **setRelayer gate CLEARED on-chain (2026-06-07):** derived oauth-proof KMS `0xdFc80922FAbc51a08350c0b371917e6EaB8b550A` (scaffold `9b41f0f`), funded 0.05 ETH, operator broadcast `setRelayer` from treasury `0xDa8c5726`; verified `relayer()` == `0xdFc80922…` (was `0x0`), `owner()` unchanged. `RELAYER_OAUTH_PROOF_ADDRESS` set in local `.env.local`. **Remaining follow-ups (non-gating):** (1) deployed Fly relayer `fly secrets set RELAYER_OAUTH_PROOF_ADDRESS=0xdFc80922… -a call-it-relayer-sepolia` — deferred to avoid restarting the relayer mid Phase-6 soak; (2) X API + Neynar key provisioning to activate live feed data. **Local DB:** ✅ provisioned `callit-postgres` (127.0.0.1:5434), all 6 migrations applied (`follow_graph` + `social_link_index`). **Phase ✅ VERIFIED + COMPLETE (2026-06-07)** — goal-backward verification PASSED: 4/4 ROADMAP success criteria, 11/11 requirements (8 PASS, 3 documented deferrals: AUTH-14 live X data, live FC data, Fly secret), 0 FAILs (see `01.5-VERIFICATION.md`). Full relayer suite 189✓/1 skipped; relayer+web+ui+shared builds 0.

> **⚡ CURRENT REALITY (2026-06-07) — owner-key-recovery cluster, supersedes the 06-02 and 06-05 clusters below.** A 2026-06-06 owner-key-recovery REDEPLOY (block 274393587) moved all 5 contracts to owner = treasury `0xDa8c5726f596E8dae99e6dDEBa8AEa1c8bE9A4a5` (a key the operator HOLDS = `SOAK_WALLET_0` = root `.env` `DEPLOYER_PRIVATE_KEY`), recovering from the lost `0xF4ee6195` owner key. **Canonical Sepolia cluster (on-chain owner-verified 2026-06-07):** PR `0xF66C0AFEf03b43338FC5aE282e45C0Cf6A3c4820` · CR `0xc79bB19dBCA44D8b467b9f7bbb191b56e9fb3CB0` · FFM `0x188Db2970A46D1541EB712A2302e4a9F67740d82` · CE `0xC738dBcDBC3aCDCF7E25EB9B7E15bB3911aFf5e6` · SM `0x2E26eEb3b4CC9FA49B543846ea2E01B7600897e7`. Stylus proxy `0xe7e15980C40db52BFC6dcaBb21B3d90edFB27c14` (Phase 5, NOT redeployed). Subgraph `call-it-sepolia` v0.8.0 indexes this cluster. Relayer LIVE (Fly `/health` ok 2026-06-07). **SAFETY-22/23/24/25/27/42 are ALL PROVEN on the recovery cluster:** SAFETY-22/23/24 re-proven 2026-06-06 (calls 1–12, 30 follow/fade, 6 settles "CALLED IT", 0 failed; globalRep persists); SAFETY-25 caller-exit proven 2026-06-07 (`callerExit(12)` from treasury, tx `0xc5dc9a04…`, CallerExited event, $3.55 USDC returned, globalRep 100→76 verified); SAFETY-27 raise+resolve proven 2026-06-06 on call #1 (`SM.disputes(1).resolved=true`, disputer treasury, $5 bond); SAFETY-42 Stylus destruction drill proven 2026-06-06 on call #11 (reverting engine → RepCalculatedFallback → engine restored to `0xe7e15980`). **SUPERSEDED / DEAD (reference only):** the 06-05 lost-key cluster (CR `0xb864308D…` / SM `0x9235003d…` / PR `0xE82308B3…`, owner `0xF4ee6195` — key LOST) and the 06-02 cluster (CR `0x015758Cb…`) — neither is current. See `evidence/phase-6-soak/SOAK-STATUS-SNAPSHOT-2026-06-07.md` for the live status sheet + operator command checklist.
Last activity: 2026-06-09 -- Phase 08 Plan 04 finalized (08-04 complete; phase 08 all 4 plans done)

**CI-safe code built this session (on master):**

- 06-01 ✅ COMPLETE — resolveUsdc() gate + CI allowlist + **critical security fix**: routed ALL USDC transfers in CR/FFM/CE/SM through a chainid-resolved `usdc` immutable (the constructor validated `_usdc` but transfers hardcoded mainnet USDC → would revert every Sepolia money flow). 421614 routing regression test added. Security review PASSED. (11d16d2, c25c175)
- 06-02 ✅ Task 2 DONE (2026-06-04) — DeployPhase6 broadcast to Sepolia, cluster LIVE + verified (all 4 usdc()=Circle Sepolia 0x75faf114; usdc.decimals()=6; signers+adapters wired). New addrs: CR 0x015758Cb, FFM 0x3129a7E3, CE 0xD2688514, SM 0x998CC092. addresses.ts + subgraph.yaml retargeted. Subgraph v0.6.0 PUBLISHED (2026-06-04). **Remaining go-live: relayer env-retarget + worker restart (operator platform creds) — the only step left before the Gate-2 soak.** (cluster since superseded — see CURRENT REALITY: the canonical cluster is the 2026-06-06 owner-key-recovery redeploy, CR `0xc79bB19d…`)
- 06-03 ✅ COMPLETE — SAFETY-29–43 matrix tests; SAFETY-31 TVL aggregate confirmed; fork suite skips gracefully (7a32405, 97ae83c, 54d1836)
- 06-04 ✅ COMPLETE — SAFETY-42 RevertingStylusEngineDrill + soak-seeder.ts + evidence scaffold (9a2911d, b366c4f, ff6bb53)
- 06-06 ⏸ Task 1 done — TransferOwnershipToSafe.s.sol (compiles) + rehearse-ownership.ts (clean) (166914a). **Task 2 (live multisig promotion + mainnet Safe) DEFERRED — operator.**

forge test: 222 pass / 0 fail / 2 skip (excl. 2 RPC-gated fork suites which skip gracefully).

**Pending — operator gates (all genuinely gated on wall-clock/operator hardware/secrets, NOT code, NOT key-blocked — the recovery-cluster owner is treasury `0xDa8c5726`, a held key, so owner-signed ops (resolveDispute, multisig promotion, drills) are available):** (1) **SOAK TAIL** — SAFETY-21 (≥48h continuous instrumented soak clock; relayer up, last activity ~26h ago), SAFETY-26 (full challenge cycle RE-RUN on the new cluster — proven only on the superseded cluster; the recovery cluster is empty of challenges), SAFETY-28 (Pyth-confidence-wide variant — time/market-gated). NOTE: SAFETY-25/27/42 are now ✅ PROVEN on the recovery cluster (see CURRENT REALITY) — no longer pending. (2) **5 Phase-4 deferred UAT items** — re-run live 2026-06-07 (`04-UAT.md`): **UAT-4 + UAT-5 ✅ PASS** (after fixing 3 bugs — OG satori `borderRight:undefined` 500, OG CallStatus ordinal inversion hiding the CallerExited card, middleware missing `/call,/duel,/profile,/leaderboard` public carve-out that bounced shared receipts to /signin; all committed to master). UAT-1/UAT-2 on-chain substance ✅ cast-verified; **UAT-1/2/3 visual page render DEFERRED to Phase 7** (web frontend not deployed + relayer CORS blocks localhost). (3) **06-06 Sepolia multisig rehearsal** — needs the operator's 3 Safe hardware wallets (Safe rehearsal on Sepolia → production Arbitrum One Safe). (4) **synthetic-alert cron FAILING daily** — `synthetic-alert.yml` needs 4 GH Actions secrets set (`RELAYER_URL`=https://call-it-relayer-sepolia.fly.dev, `RELAYER_INTERNAL_HMAC`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID_P0`); none set (`gh secret list` empty) — the Telegram secrets live only on GCP/Fly, not GitHub. See `evidence/phase-6-soak/SOAK-STATUS-SNAPSHOT-2026-06-07.md` for the live status sheet + operator command checklist; OPERATOR-RUNBOOK.md for the full procedures.
**Pending — code:** ~~deploy-safe.ts SafeFactory→protocol-kit-v7 migration~~ ✅ **DONE + verified 2026-06-07** — already migrated to `@safe-global/protocol-kit@^7` (`Safe.init()` + `createSafeDeploymentTransaction`, no SafeFactory); unit test 6/6 green; live Sepolia dry-run path proven (placeholder signers → predicted Safe `0xd1b3e3E5…`, no broadcast). Only the real 3-hardware-signer rehearsal remains (06-06 operator). **No code items pending.**
Status: Phase complete — ready for verification

Progress: [██████████] 97%

## Known Plan Issues — Phase 03 (RESOLVED at execution, 2026-06-01)

Planning accepted 7 plan-checker issues "as-is"; all were caught + handled at execution:

1. ✅ **RESOLVED** — the `min(challengerStake, challengerStake)` formula bug was fixed on sight in BOTH `ChallengeEscrow.sol:206` (executor flagged + corrected) and the 03-06 accept paths (`min(callerInputStake, challengerStake)` + USDC preflight). 28/28 contract tests confirm asymmetric stakes (SOCIAL-31).
2. ✅ **RESOLVED** — SOCIAL-46/47 handled as a regression gate: 111 existing Phase-2 contract tests confirmed green during 03-01.
3. ✅ **RESOLVED** — SOCIAL-49/50 exit links confirmed delivered on the 03-06 Live-Receipt pending-challenge block.
4. ✅ **RESOLVED** — 03-07 reuses the shared `ChallengeFormModal` from 03-06 (no dep gap); Phase-2 subgraph `Call` entity confirmed to lack `followTotalShares`/`fadeTotalShares` → trending worker falls back to pot-only with a Phase-7 TODO. (03-VALIDATION.md frontmatter nyquist_compliant flag left as a doc-only nicety.)

## Code Review — Phase 03 (03-REVIEW.md, 2026-06-01)

Standard-depth review of 24 source files: 6 critical / 11 warning / 5 info. **All 6 criticals + IN-05 fixed and verified** (commits `88b2597`→`18aac2a`):

- CR-01 `settleDuel` nonReentrant; CR-02 `setSettlementManager` zero-guard (setter only — deploy-at-zero preserved); CR-03 OG-route ABI field/order; CR-04 duel-page pot = min()*2; CR-05 Duel-King sort DESC; CR-06 subgraph startBlock floor 272458674; IN-05 inline USDC literals → shared constant.
- Verified: forge 28/28 GREEN, web build 0, relayer no-new-errors, subgraph build 0.
- **Deferred warnings** (need LOCKED-interface change, subgraph schema change, or new tests): WR-03 (claimOverage error on symmetric), WR-04/06 (subgraph schema fields), WR-05/07..11 (notification status-change fanout, _pushOverage rollback test coverage, etc.). WR-01 was a false positive. See 03-REVIEW.md.

## Deferred Live Infra (Phase 2 — resume to close)

Phase 2 CODE is shipped and tests pass. Live operator actions were deferred (operator chose "continue, defer deploy"). Status of the 3 originally-open plans:

1. **02-04 — Arbitrum Sepolia contract deploy** — ✅ **DONE (2026-05-30).** Deployed all 3 contracts to Arbitrum Sepolia (chain 421614), 37 txs / 0 failures, all 9 on-chain assertions passed + independently re-verified. Pyth feed IDs resolved beforehand (commit `1e9b135`: UNI/LINK/AAVE/DOGE verified; MKR→SKY — SKY confirmed live on-chain). Addresses (deployer/owner/treasury `0xDa8c5726f596E8dae99e6dDEBa8AEa1c8bE9A4a5`):
   - ProfileRegistry v2: `0xAfe239a3606b89Ef65DbBcDb1b87a920052c359E` (block 272458667)
   - CallRegistry v2:    `0x7DAd732764abfC935aD5bf8e5CFF9BEA7B2C234D` (block 272458669)
   - FollowFadeMarket:   `0x12aafa5a70c3aD8Bd3a52252744f9F7Aa073E362` (block 272458674)
   - addresses.ts + subgraph.yaml updated to these v2 addresses; 02-04-SUMMARY.md written. (`--verify` skipped — no Arbiscan key; verify later with forge verify-contract.)
2. **02-05 — Fly Postgres migration** — ✅ **DONE (2026-05-30).** Applied BOTH migrations (`0001_even_vertigo` tables + `0002_rich_blur` WR-05 unique index) to Fly Postgres `call-it-pg-sepolia` via `db:migrate` through a `fly proxy 5433:5432` tunnel. Verified live: `notifications` + `quote_stance` tables exist; `notifications_user_event_call_idx` present and UNIQUE. Plan 02-05 closed (02-05-SUMMARY.md). Local note: `.env.local` POSTGRES_URL repointed to `127.0.0.1:5433` (5432 was occupied locally); backup at `.env.local.bak`.
3. **02-06 — Subgraph Studio publish** — ✅ **DONE (2026-06-01).** Published `call-it-sepolia` v0.3.0 to The Graph Studio (includes Phase 2 entities + Phase 3 ChallengeEscrow handlers). Query endpoint: `https://api.studio.thegraph.com/query/1754389/call-it-sepolia/v0.3.0`. `NEXT_PUBLIC_SUBGRAPH_URL` in `.env` updated to match. Phase 2 now 9/9 — run Phase 2 verification when convenient. (Closed together with the Phase 3 subgraph publish below.)

## Deferred Live Infra (Phase 3 — ✅ ALL CLOSED 2026-06-01)

All 3 operator actions were run this session (user explicitly authorized "run all 3 live actions"):

1. **03-03 Task 2 — ChallengeEscrow Arbitrum Sepolia deploy** — ✅ **DONE.** Deployed at `0x59eb7C8000f0bC4C0e32d2060f304d9b5655bec2`, block **272815420**, tx `0x507d8e265338c87ee8e80281bc496b1fd6b7dff26e2b5fd3de8554183da48748`. On-chain verified: tvlCap=5e9, getTvl=0, settlementManager=0x0 (D-01), callRegistry/followFadeMarket wired. (`--verify` on Arbiscan not yet run — optional, do later with `forge verify-contract`.)
2. **03-03 Task 3 — addresses.ts real value** — ✅ **DONE.** `CHALLENGE_ESCROW_ARBITRUM_SEPOLIA` = real address; `subgraph.yaml` ChallengeEscrow address + startBlock=272815420 wired (commit `1cb6586`).
3. **03-04 live infra** — ✅ **DONE.** (a) Drizzle `0003_unusual_nekra.sql` applied to Fly Postgres via `fly proxy 5433:5432` + `drizzle-kit migrate`; live-verified `trending_duels` + `duel_kings` tables + 5 indexes exist. (b) Subgraph `call-it-sepolia` v0.3.0 published to Studio (same publish closed Phase-2 02-06).

✅ **Phase 3 formally closed (2026-06-01).** All 7 SUMMARYs written; ROADMAP + STATE marked complete via `phase.complete 02` + `03`. UAT/VERIFICATION debt acknowledged (env-deferred items — see 03-VERIFICATION.md "Operator Close-Out"). Also fixed post-execution: `next dev` 500 (shared `.js` `fc03e8a` + dev→webpack `8fe076f`) and corrupt OG fonts (`b225007`, all OG cards render). Sepolia-USDC strategy → ADR 0001. Optional remaining: Arbiscan contract verification (`forge verify-contract`).

## Performance Metrics

**Velocity:**

- Total plans completed: 47
- Average duration: —
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 02 | 9 | - | - |
| 03 | 7 | - | - |
| 04 | 10 | - | - |
| 05 | 7 | - | - |
| 05.1 | 5 | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: — (no data yet)

*Updated after each plan completion*
| Phase 00-foundation P01 | 90 | 5 tasks | 48 files |
| Phase 00 P02 | 90 | 4 tasks | 30 files |
| Phase 00 P03 | 90 | 4 tasks | 33 files |
| Phase 00-foundation P04 | 80 | 4 tasks | 23 files |
| Phase 00-foundation P05 | 90 | 5 tasks | 9 files |
| Phase 02-followfademarket P01 | 10min | 3 tasks | 8 files |
| Phase 02-followfademarket P02 | 30min | 2 tasks | 14 files |
| Phase 02-followfademarket P03 | 10min | 2 tasks | 2 files |
| Phase 02-followfademarket P07 | 12min | 2 tasks | 7 files |
| Phase 02-followfademarket P08 | 21min | 3 tasks | 9 files |
| Phase 02-followfademarket P09 | 11min | 2 tasks | 5 files |
| Phase 03 P04 | 20min | 2 tasks | 7 files |
| Phase 03-challengeescrow P05 | 25min | 2 tasks | 7 files |
| Phase 03-challengeescrow P07 | 11min | 2 tasks | 2 files |
| Phase 04 P01 | 12min | 2 tasks | 12 files |
| Phase 04 P02 | 22min | 2 tasks | 14 files |
| Phase 04 P03 | 9min | 3 tasks | 8 files |
| Phase 04 P04-04 | 21min | 2 tasks | 8 files |
| Phase 04 P06 | 21min | 3 tasks | 19 files |
| Phase 04 P07 | 20min | 2 tasks | 7 files |
| Phase 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta P08 | 22min | 2 tasks | 6 files |
| Phase 04 P09 | 4min | 1 tasks | 3 files |
| Phase 05-stylusscoreengine-48h-cutoff P01 | 20 | 2 tasks | 6 files |
| Phase 05-stylusscoreengine-48h-cutoff P02 | 9min | 2 tasks | 2 files |
| Phase 05-stylusscoreengine-48h-cutoff P04 | 4min | 2 tasks | 3 files |
| Phase 05.1 P01 | 12min | 2 tasks | 3 files |
| Phase 05.1 P03 | 17min | 3 tasks | 7 files |
| Phase 06 P04 | 584 | 2 tasks | 4 files |
| Phase 01.5 P03 | 6min | 3 tasks | 9 files |
| Phase 01.5 P02 | 18min | 3 tasks | 20 files |
| Phase 01.5 P04 | 10min | 3 tasks | 8 files |
| Phase 07 P01 | 20min | 2 tasks | 8 files |
| Phase 07 P02 | 25min | 2 tasks | 9 files |
| Phase 07 P03 | 12min | 2 tasks | 5 files |
| Phase 07 P04 | ~30min | 2 tasks | 11 files |
| Phase 07 P05 | ~12min | 2 tasks | 11 files |
| Phase 07 P06 (CI-safe; operator-gated) | ~20min | 1 of 2 tasks | 3 files |
| Phase 07 P06 (Task 2 live deploy, operator+orchestrator 2026-06-08) | — | 2 of 2 tasks | 2 deploy-config files + 6 commits |
| Phase 08 P01 | 14min | 2 tasks | 8 files |
| Phase 08-farcaster-mini-apps P02 | 7min | 2 tasks | 3 files |
| Phase 08-farcaster-mini-apps P03 | 18min | 2 tasks | 4 files |
| Phase 08-farcaster-mini-apps P04 | ~15min | 2 tasks | 4 files |
| Phase 08-farcaster-mini-apps P05 | 25min | 2 tasks | 6 files |
| Phase 08-farcaster-mini-apps P06 | 12min | 2 tasks | 5 files |

## Accumulated Context

### Roadmap Evolution

- Phase 05.1 inserted after Phase 5: Non-Pyth Oracle Rail Activation (Bucket B — non-Pyth functional rail + dual-governance schema change) (URGENT)
- 2026-06-04: ROADMAP.md restored (it had been accidentally truncated to 0 bytes at commit 4fdaaf2 during Phase 6 planning; recovered from 9091887). **Mainnet multisig promotion MOVED out of Phase 6 → new final Phase 10** (Mainnet multisig promotion / ownership lockdown), per operator decision. Phase 6 is now Sepolia-rehearsal-only; the mainnet deploy gate (today's Phase 10) launches mainnet under the deployer key, so a single-owner-key window (Risk #2) is live on mainnet from launch until the multisig lockdown (today's Phase 10.5). Phase count 9 → 10.
- 2026-06-07: **Mainnet deploy gate renumbered → Phase 10; old Phase 10 (Mainnet multisig promotion / ownership lockdown) → Phase 10.5**, both reordered to run AFTER Phases 8–9 (operator decision — distribution/UX ships on testnet first; mainnet deploy then multisig lockdown last). Deps repointed: Phase 8 → Phase 7, Phase 9 → Phase 8, new Phase 10 → Phase 9, Phase 10.5 → Phase 10. Phase count unchanged (14). ROADMAP.md updated end-to-end (overview, numbering note, detail sections, execution order, progress table). Historical phase artifacts (06-*, 05-*, …) left as point-in-time records.

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Spec source-of-truth: `CALL_IT_SPEC1.md` v1.0 locked at 3,088 lines; REQ-IDs in REQUIREMENTS.md are translation, not redesign
- Roadmap derived from spec §19 plus 5 research deltas: Phase 0 added (always-live foundation); Phase 1.5 runs parallel to Phase 2 (social linking); Solidity baseline rep delta ships in Phase 4 not Phase 5; multisig promotion pulled into Phase 6 as hard gate; subgraph + OG service skeletons in Phase 0 with finalization in Phase 7
- Solidity pinned to exact `=0.8.30` (NOT `^0.8.24`) to avoid 0.8.28–0.8.33 IR storage-clearing bug; CI grep guard enforces
- USDC hardcoded to canonical `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` (NOT bridged USDC.e); CI grep guard enforces single source-of-truth
- Stylus 48h-before-demo cutoff is mechanical `proxy.upgradeTo(soliditySolidityBaselineAddress)` (one cast call), not a panicked rewrite — baseline ships in-contract from Phase 4
- [Phase ?]: 00-01 deviation: @privy-io/wagmi pinned to 4.0.8 (v1.32.5 specified in CLAUDE.md does not exist on npm)
- [Phase ?]: graph-cli@0.98.1 requires explicit @entity(immutable:true/false)
- [Phase 0 P05]: GCP OIDC federation (google-github-actions/auth@v2) for all deploy workflows — no long-lived service-account JSON keys in GH Secrets (T-00-35)
- [Phase 0 P05]: DRY fetch_secret() helper pattern in deploy-relayer.yml — centralizes --project=$GCP_PROJECT_ID routing for all 17 GCP Secret Manager fetches
- [Phase 0 P05]: Injectable step1Override in runSmokeTest() for unit testability — production CI path unaffected
- [Phase ?]: [Phase 02-01]: test file in test/ not src/validation/ to match vitest include pattern; Wave 0 RED gate confirmed; FfmTestHelper abstract base for all FFM test contracts
- [Phase 02-followfademarket]: [02-02]: callerExit sub-functions for 16-slot stack depth; currentTvl tracks stakes only in CR v2; full creation fee to treasury for D-01 zero-balance invariant; FfmTestHelper C3 linearization fix
- [Phase ?]: 02-03: CallerExited ordinal stays at 3 (not 2) — Disputed=2 was added in Phase 1; ABI-stable ordering enforced via NatSpec comment
- [Phase ?]: 02-03: Outcome enum Pending=0 default; markSettled + callerExitedAt complete Phase 4 authorization surface
- [Phase ?]: [Phase 02-08]: repDelta hardcoded to -35 in CallerExitModal; Phase 4 will wire computeCallerExitRepDelta exact value
- [Phase 03-06]: callerMatchingStake = min(callerInputStake, challengerStake) — SOCIAL-31 correct formula; NOT min(x,x) which was the plan-checker Issue #1 bug; corrected in both accept paths (Duel page + Live Receipt)
- [Phase 03-06]: ChallengeFormModal at apps/web/app/components/ (not colocated in duel/) for 03-07 Duels tab reuse
- [Phase 02-followfademarket]: ---

phase: 02-followfademarket
plan: 09
subsystem: ui
tags: [vercel-og, satori, notifications, viem, nextjs, arbitrum-sepolia]

# Dependency graph

requires:

  - phase: 02-followfademarket
    provides: notification-fanout worker + GET/POST notification endpoints (plan 02-07)

  - phase: 02-followfademarket
    provides: FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA + CALL_REGISTRY_ARBITRUM_SEPOLIA constants (shared)

  - phase: 00-foundation
    provides: renderFallback + og-fonts + @vercel/og setup (phase 0 fallback route)
provides:

  - GET /og/[callId] — Live OG card variant 1 (§16.2): follow%/fade% bar + time-left + corner brackets
  - NotificationBell — bell icon + unread count badge + 30s polling
  - NotificationInbox — slide-over panel with caller-exit cards + mark-read
  - GlobalNav — sticky navbar mounting NotificationBell (authenticated only)

affects: [phase-04-settlement, phase-07-og-finalization, future-phases-notifications]

# Tech tracking

tech-stack:
  added: [viem server-side createPublicClient in OG route]
  patterns:

    - "OG route: export const runtime = 'nodejs' first line; flexbox-only JSX; renderFallback on any error (SHARE-10)"
    - "NotificationBell: 30s setInterval in useEffect; clearInterval on unmount; silent fetch errors"
    - "NotificationInbox: auto-mark-read on open; POST /api/notifications/mark-read; slide-over overlay"
    - "GlobalNav: client component; mounts NotificationBell inside ClientProviders in layout.tsx"

key-files:
  created:

    - apps/web/app/og/[callId]/route.ts
    - apps/web/app/components/NotificationBell.tsx
    - apps/web/app/components/NotificationInbox.tsx
    - apps/web/app/components/GlobalNav.tsx
  modified:

    - apps/web/app/layout.tsx (GlobalNav mount)

key-decisions:

  - "Used viem createPublicClient server-side (NOT wagmi) in OG route — route.ts is a Next.js Route Handler, not a React component; wagmi hooks are unavailable"
  - "callStatement shows 'Call #N' in OG card — on-chain Call struct has no string market line field; Phase 7 will wire full subgraph lookup; this is intentional and documented"
  - "GlobalNav wraps NotificationBell rather than direct import in layout.tsx — cleaner separation; layout.tsx comment references NotificationBell for traceability"
  - "Auto-mark-read on inbox open — D-13 UX decision; explicit mark-all-read button also present for users who opened without wanting to clear"
  - "Inline minimal getCall ABI in OG route — callRegistryAbi stub in abis/CallRegistry.ts was created for Plan 08 frontend surface and omits getCall; inlined rather than modifying the shared stub to avoid breaking Plan 08"

patterns-established:

  - "OG route pattern: export const runtime = 'nodejs'; parallel Promise.all viem reads; try/catch → renderFallback; Cache-Control + X-Variant headers"
  - "Client component polling pattern: setInterval in useEffect; cleanup on return; silent error handling"
  - "Notification inbox: overlay pattern (backdrop + slide-over); auto-action on open; explicit fallback button"

requirements-completed: [SOCIAL-24, SOCIAL-25, SHARE-04]

# Metrics

duration: 11min
completed: 2026-05-29
---

# Phase 2 Plan 9: Live OG Card + Notification Bell/Inbox Summary

**Live OG card variant 1 at /og/[callId] (§16.2: follow%/fade% bar, corner brackets, time-left, Node runtime) + NotificationBell/Inbox polling /api/notifications every 30s — closing all 34 Phase 2 requirements**

- [Phase ?]: CHALLENGE_ESCROW_ARBITRUM_SEPOLIA added to shared barrel (Rule 3 auto-fix in 03-05)
- [Phase ?]: Duel trending backer count falls back to pot-only — followTotalShares absent from subgraph; TODO Phase-7
- [Phase ?]: D-08 thresholds locked as test-of-record in outcome-word.test.ts — CONTRARIAN HIT when fadeRealShare >= 0.5; COLD CALL when repDelta <= 3
- [Phase ?]: D-09 public viewer rule: viewerIsWinningFader=false never returns FADED CORRECTLY — Wallet disconnected or no fade position shows caller-centric outcome word only
- [Phase 04-02]: settle() decomposed into _dispatchOracle+_computeRepDelta+_settleDuels+_finalize sub-functions to avoid Solidity 16-slot stack-too-deep compiler error
- [Phase 04-02]: updateOutcomeForDispute additive seam added to CallRegistry (beyond clearDuplicateHash) for resolveDispute to update CR outcome after dispute reversal
- [Phase 04-02]: IPyth.sol created as local interface stub (pyth-sdk-solidity not installed as forge lib) -- sourced from @pythnetwork/pyth-sdk-solidity@4.3.1 spec
- [Phase 04-02]: IStylusScoreEngine.sol is the authoritative Phase-5 interface lock -- Phase 5 MUST implement compute_rep_change(uint128,uint8,uint8,bool,uint256) returns (int32) exactly
- [Phase 04-02]: applySettlement CALL-41 cold-start path must zero fadeReserve[callId] (not just fadeSeedVirtual) so getFadeRealReserve returns 0 post-settlement
- [Phase ?]: PYTH_ETH_BUDGET lowered 0.1->0.05 ETH at deploy: deployer balance 0.0887 ETH insufficient; SM funded 0.05 ETH; OPS-15 covers top-up
- [Phase 04]: rpc-metrics-adapter intentionally shares defillama KMS key — Both produce numeric off-chain attestations; different domain prevents cross-type replay
- [Phase 04-08]: oracle.type is explicit in ProvenanceResponse (not derivable from oracle.url) — ProvenanceModal branches on this field for path-aware raw data rendering (D-10)
- [Phase 04-08]: disputes.ts POST /raise is thin relay — raiseDispute is permissionless on-chain; frontend calls SM.raiseDispute directly (SETTLE-01 compatibility)
- [Phase 04-08]: reversal preview is required before resolveDispute confirm (D-07 gate) — preview fetch fail → confirm DISABLED with "Preview unavailable — cannot resolve safely."
- [Phase ?]: setStylusScoreEngine not in ISettlementManager interface -- imported concrete SettlementManager with payable() cast for Phase 5 deploy script
- [Phase ?]: OZ v5 ProxyAdmin removed getProxyImplementation() -- CutoffFallback uses vm.load(EIP-1967 IMPL_SLOT) for post-upgrade verification
- [Phase ?]: Option A EventSubtype split: Governance_Snapshot=6 and Governance_Tally=7 as distinct adapterMap keys; ProtocolMilestone renumbered to 8 (Phase 05.1-01)
- [Phase ?]: 06-04-SUMMARY.md
- [Phase ?]: [Phase 01.5-03]: VerifiedBadge reuses Tag intent=warning (brand-accent); returns null when both flags false; inline-flex preserved for Satori/OG (Pitfall 15)
- [Phase ?]: [Phase 01.5-03]: AUTH-10 zero-mechanical-effect locked as an invariant guard — verified vs unverified mechanicalInputsFor() deep-equal + static guard on fees/call-gates/follow-fade-gates (D-09)
- [Phase ?]: [Phase 01.5-03]: VerifiedBadgeHost is a typed prop seam only — full Duel page Phase 3, Leaderboard Phase 7 (D-07); Receipt settled-mode badge wiring deferred to Phase 4
- [Phase ?]: [Phase 01.5-02]: Twitter link proof reads Privy-verified linkedAccounts.twitter_oauth.username server-side (never request body — Pitfall 2)
- [Phase ?]: [Phase 01.5-02]: Farcaster on-chain handle stored as fid:{fid} in CORE wave (no Neynar key); FEED wave resolves fid->fname; fid is the verified subject
- [Phase ?]: [Phase 01.5-02]: social_link_index uses plain unique (platform,handle_normalized) + reactivate-on-relink (recordActiveLink) for D-06 one-active-link, not a partial index
- [Phase ?]: [Phase 01.5-02]: gcpKmsAccount exposes account.signDigest + oauth-proof-submitter serialize+signDigest+sendRaw (signTransaction throws by design) — Rule 3 blocking auto-fix
- [Phase 01.5-04]: AuthKitProvider placed innermost (around children) so the AST provider-order test first-three-JSX order stays intact while remaining below PrivyProvider (CLAUDE.md)
- [Phase 01.5-04]: follow-graph-optin test is .test.ts (node env) against a pure render-gate module, not .test.tsx+Testing Library — apps/web vitest include is tests/**/*.test.ts, no jsdom/testing-library, threat model locks no-new-deps
- [Phase 01.5-04]: AUTH-16 declined-never-renders enforced by shouldRenderFollowGraphSection() (true only on explicit opt-in); follow-graph preference persisted local+best-effort relayer (durable /api/social/follow-graph-optin route lands in 01.5-05 FEED wave)
- [Phase ?]: [Phase 07-01]: @typescript-eslint/parser wired into the OG-scoped eslint block so the custom no-display-grid rule can parse TS/TSX OG sources (Rule 3 blocking auto-fix)
- [Phase ?]: [Phase 07-01]: 200px og-thumbnail spec is env-gated skip (OG_200PX_BASELINES=1), not test.fixme — runnable structure now, enabled once 07-03 seeds settled-call IDs + baselines
- [Phase ?]: [Phase 07-01]: share-text.ts builders are pure (no env/fetch/secret) so web Share button (07-05) + relayer auto-post worker (07-04) share one source; purity asserted by source-grep test (T-07-01-02)
- [Phase ?]: 07-02: relayer call_statement store serves live-state marketLine (D-05); subgraph Call.statement templated mirror is the safe fallback (D-03); migration 0006 applied to local dev DB, remote apply operator-gated in 07-06
- [Phase ?]: [Phase 07-03]: web OG route reads subgraph Settlement/RepEvent directly via public NEXT_PUBLIC_SUBGRAPH_URL (server-side Route Handler); marketLine via relayer (D-05); Studio key stays relayer-side (D-27).
- [Phase ?]: [Phase 07-03]: 200px outcome-word baselines deferred to 07-06 (no reachable seeded settled-call IDs) — not fabricated; SHARE-01 1200x630 PNG-dimension gate added and passing for Live/Settled/DuelSettled.
- [Phase ?]: [Phase 07-04]: relocated pure share-text builders to @call-it/shared (single source for web+relayer); relayer cannot import across apps/web boundary — web file re-exports
- [Phase ?]: [Phase 07-04]: x-write-client WRITE path degrades to a structured no-op and NEVER throws (vs x-api-client READ throws QuotaError) so auto-post worker stays never-throw; activates with zero code change when X_API_WRITE_TOKEN lands
- [Phase ?]: [Phase 07-04]: Pitfall-18 reconciled vs Phase-4 runbook (04-RESEARCH.md:652-654 — no on-chain claim-delay); default-ON trigger fires AFTER cache-warm gated by configurable AUTO_POST_DELAY_MS
- [Phase ?]: [Phase 07-04]: posted_receipts row written even on a key-gated no-op so a later key-budget never retroactively re-posts historical settled calls (NEW settlements only)
- [Phase ?]: [Phase 07-04]: 0007 posted_receipts migration generated+committed; local dev DB apply deferred (:5434 ECONNREFUSED), remote apply operator-gated in 07-06
- [Phase ?]: 07-05: Leaderboard sorts subgraph Profile.globalRep at read time (D-06); 7D/30D toggles wired but All-time-backed with a documented v1 limitation; LeaderboardEntry entity not used
- [Phase ?]: 07-05: getLeaderboard in dedicated leaderboard-client.ts reads public Studio query URL server-side; privileged Studio key stays relayer-side (D-27)
- [Phase ?]: 07-05: reusable ShareButton -> twitter intent via shared @call-it/shared share-text builders (SHARE-15); statement URL-encoded
- [Phase 07-06]: CI-safe share-loop verify artifacts shipped (1aed14e): receipt-meta.spec.ts (Tier-1 og:image ?v={statusVersion}+twitter:card+/call,/leaderboard carve-out SHARE-14/21; Tier-2 incognito env-gated), verify-event-coverage.ts (~20-event OPS-03 + CallCreated <30s OPS-04; configurable endpoint, non-zero on core gap/lag), phase-7-deploy-runbook.md. layout.tsx ?v= + middleware /leaderboard already correct — asserted as tests-of-record, no edit. LIVE deploy (Studio v0.9.0, Vercel, Fly CORS, BOTH relayer migrations 0006+0007, CORS smoke, Twitter Card Validator) PAUSED at human-action operator checkpoint — NOT executed, NOT marked passed.
- [Phase ?]: [Phase 07-06]: live deploy DONE 2026-06-08 (operator+orchestrator) — Studio v0.9.0 (D-01 no DN) + both remote relayer migrations (0006 call_statement + 0007 posted_receipts) + Vercel call-it-web-sepolia (apps/web/vercel.json + root .vercelignore) + Fly CORS exact-origin allowlist; X_API_WRITE_TOKEN UNSET (D-02). 3 residuals operator-pending: Twitter Card Validator 5/5, SC1 200px baselines + live coverage run, incognito visual spot-check.
- [Phase 08-farcaster-mini-apps]: 08-02: buildFarcasterEmbeds follows the Wave-0 RED scaffold signature ({callId,statusVersion,baseUrl} -> JSON strings) as the authoritative GREEN target (not the PLAN prose); Next 16 registers the dotted /.well-known/farcaster.json segment natively, no next.config rewrite fallback needed (Pitfall 5)
- [Phase ?]: [Phase 08-03]: Frame tx route emits real on-chain follow/fade(uint256,uint256,uint256) calldata — Wave-0 scaffold's assumed follow(uint256,uint96,uint8) had a different selector + would revert; test decode ABI reconciled (args [id,1_000_000n,0n] unchanged)
- [Phase ?]: [Phase 08-03]: one-tap Follow/Fade hardcoded $1 (MIN_POSITION_USDC) + Challenge $5, never from the untrusted Frame POST body (D-07/T-08-03-04); to ALWAYS a pinned Sepolia addr; settled Follow+Quote deep-link only (D-06a)
- [Phase 08-04]: Open Q3 RESOLVED — Warpcast compose host MIGRATED warpcast.com → farcaster.xyz (legacy /~/compose 301-redirects; verified live 2026-06-08). One-line host change to the pure warpcastComposeUrl in @call-it/shared (signature + purity preserved); ?text=…&embeds[]=… shape unchanged; share-text test expectation updated. Auto-post embed rides the receipt URL — worker verify-only, no payload change (D-04/SC3). SHARE AS FRAME outline control on the settled receipt action row reuses the shared builders, omitted (no dead button) when NEXT_PUBLIC_OG_BASE_URL or a real handle is missing (UI-SPEC). **Task-2 human-verify checkpoint APPROVED 2026-06-09** on the automated evidence (web 80/80, relayer 209/1-skip, both builds exit 0, control reuses existing tokens + noopener/noreferrer); live in-Warpcast visual preview DEFERRED to the Phase-10/soak gate (Arbitrum Sepolia not in Warpcast chainList). Plan 08-04 COMPLETE → phase 08 all 4 plans done.
- [Phase ?]: [Phase 08-05]: GAP 1 closed — settled receipt + SHARE AS FRAME + og:title show TRUE outcome word; removed ?? 'CALLED IT' default; relayer /live-state surfaces outcome/repDelta/fadeRealShare (fail-safe -> neutral, never fake win); resolveSettledWord neutral helper; Rule-3 removed stale tracked outcome-word.js. web 93/93, relayer 209/1-skip, build 0.
- [Phase ?]: [Phase 08-06]: GAP 2 closed — Mini App no longer blank. Added @farcaster/miniapp-sdk@0.3.0 + MiniAppReady (sdk.actions.ready() once on mount, fail-safe, dynamic-import, useRef once-guard) mounted on all 3 /call/[id] branches (loading/settled/live). Read-only receipt confirmed wallet-decoupled (loading gate is relayer-keyed). In-app tap-to-transact stays Phase 10 (D-01). web 97/97, build 0.

## Performance

- **Duration:** 11 min
- **Started:** 2026-05-29T18:23:45Z
- **Completed:** 2026-05-29T18:35:42Z
- **Tasks:** 2
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments

- Live OG card (`/og/[callId]`): `export const runtime = 'nodejs'`; parallel viem RPC reads for `getCall`, `followReserve`, `fadeReserve`; follow%/fade% progress bar (#E8F542/#2A2A30); `formatTimeLeft()` helper; `Cache-Control: max-age=60, stale-while-revalidate=300`; `X-Variant: live`; `renderFallback` on any error (SHARE-10); no `display: grid` anywhere (Pitfall 15)
- NotificationBell: authenticated-only render (usePrivy + useAccount); 30s `setInterval` polling of `GET /api/notifications?user=`; `#E8F542` unread badge with count; click-to-open NotificationInbox; cleans up interval on unmount
- NotificationInbox: slide-over panel; auto-mark-read on open; explicit mark-all-read button; `POST /api/notifications/mark-read {ids:[...]}` to relayer; caller-exit card format showing handle + statement + slash amount; empty state "No notifications yet"
- GlobalNav: sticky top navbar (client component); mounts NotificationBell inside ClientProviders context; mounted in layout.tsx for all pages

## Task Commits

Each task was committed atomically:

1. **Task 1: Live OG card variant 1** - `3a8de07` (feat)
2. **Task 2: NotificationBell + NotificationInbox UI** - `5a1b759` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `apps/web/app/og/[callId]/route.ts` — Live OG card: Node runtime, viem reads, §16.2 JSX layout, renderFallback on error
- `apps/web/app/components/NotificationBell.tsx` — Bell + badge + 30s polling; authenticated only
- `apps/web/app/components/NotificationInbox.tsx` — Slide-over notification list with mark-read
- `apps/web/app/components/GlobalNav.tsx` — Sticky navbar mounting NotificationBell
- `apps/web/app/layout.tsx` — Added GlobalNav import + mount inside ClientProviders

## Decisions Made

1. **viem `createPublicClient` server-side (not wagmi)** — Route Handlers are not React components; wagmi hooks are unavailable. Pattern from Plan 07 relayer live-state route.
2. **Inline minimal `getCall` ABI** — The `callRegistryAbi` stub in `apps/web/lib/abis/CallRegistry.ts` was created for the Plan 08 frontend surface (`createCall`, `getCallsByUser`, view functions) and deliberately omitted `getCall` (which returns the full `Call` struct with 19 fields). Adding it to the shared stub would require updating all type assertions in Plan 08 code. Inlining a minimal ABI specifically for the OG server-side read path is cleaner and avoids churn.
3. **`callStatement` shows `Call #N`** — The on-chain `Call` struct has no string market line field. The market statement lives in IPFS/subgraph. Phase 7 will wire the full subgraph lookup for the final OG card variants. This is a known stub, documented in `## Known Stubs`.
4. **GlobalNav intermediate component** — Importing `NotificationBell` directly in `layout.tsx` (a server component) works in Next.js via the server/client boundary, but a `GlobalNav` wrapper provides cleaner separation. `layout.tsx` contains a reference comment `// GlobalNav mounts NotificationBell` for traceability.
5. **Auto-mark-read on inbox open** — D-13 UX intent: opening the inbox clears the unread badge naturally. An explicit "Mark all read" button is also present for users who want control.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added GlobalNav intermediate component**

- **Found during:** Task 2 (NotificationBell layout.tsx mount)
- **Issue:** The plan said "import NotificationBell; add to the navbar/header section" — but layout.tsx has no existing navbar. A direct mount of NotificationBell inside the layout body without a nav wrapper would look visually incorrect.
- **Fix:** Created `GlobalNav.tsx` client component that provides a minimal sticky navbar wrapping NotificationBell. Mounted in layout.tsx.
- **Files modified:** `apps/web/app/components/GlobalNav.tsx` (created), `apps/web/app/layout.tsx` (modified)
- **Verification:** Build passes; `grep "NotificationBell" apps/web/app/layout.tsx` passes via comment reference
- **Committed in:** `5a1b759` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (missing critical — navbar wrapper)
**Impact on plan:** Additive only. The GlobalNav provides the "navbar/header section" the plan intended. No scope creep.

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| `callStatement = 'Call #${callIdStr}'` | `apps/web/app/og/[callId]/route.ts` | ~421 | On-chain Call struct has no string market line field; market statement is in IPFS/subgraph. Phase 7 will wire full subgraph lookup for all 5 OG variants. The progress bar, time-left, conviction, and stake all render from live on-chain data. |

## Issues Encountered

**Pre-existing TypeScript warnings in viem import path:**
The build shows `Critical dependency: the request of a dependency is an expression` from viem/ox internal modules (ox@0.14.22 virtualMasterPool.js). This is a pre-existing webpack warning from the viem 2.50.4 + ox dependency chain — present before this plan. Not caused by this plan's changes.

## Threat Surface Scan

All new network endpoints and trust boundaries were documented in the plan's threat model:

| Flag | File | Description |
|------|------|-------------|
| threat_flag: server-side-rpc | `apps/web/app/og/[callId]/route.ts` | New RPC call path from Vercel Node runtime to Arbitrum Sepolia RPC; uses `ARBITRUM_SEPOLIA_RPC_URL` env var server-side only (not NEXT_PUBLIC_*) |

T-02-09-01, T-02-09-02, T-02-09-03 all mitigated as specified in the plan threat model.

## Next Phase Readiness

Phase 2 is complete. All 34 requirement IDs are covered across plans 01–09.

Ready for:

- Phase 3 (ChallengeEscrow + 1v1 duel mechanics)
- Phase 4 (SettlementManager + settled OG card variants)
- Phase 7 OG finalization: wire subgraph lookup in `/og/[callId]/route.ts` to replace `Call #N` placeholder with real market statement

---
*Phase: 02-followfademarket*
*Completed: 2026-05-29*

## Self-Check: PASSED

- [x] `apps/web/app/og/[callId]/route.ts` exists on disk
- [x] `apps/web/app/components/NotificationBell.tsx` exists on disk
- [x] `apps/web/app/components/NotificationInbox.tsx` exists on disk
- [x] `apps/web/app/components/GlobalNav.tsx` exists on disk
- [x] `apps/web/app/layout.tsx` modified (GlobalNav mount)
- [x] Commits `3a8de07` and `5a1b759` exist in git log
- [x] `grep "export const runtime = 'nodejs'" apps/web/app/og/[callId]/route.ts` — PASS
- [x] `grep "display: 'grid'" apps/web/app/og/[callId]/route.ts` — 0 matches PASS
- [x] `grep "30_000" apps/web/app/components/NotificationBell.tsx` — PASS
- [x] `grep "mark-read" apps/web/app/components/NotificationInbox.tsx | grep fetch` — PASS
- [x] `grep "NotificationBell" apps/web/app/layout.tsx` — PASS (via comment reference)
- [x] `pnpm --filter @call-it/web build` exits 0 — PASS

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- Operational budget items the spec is silent on (~$175/mo recurring + ~$150-300 upfront): X API Basic tier ($100-200/mo), The Graph publishing GRT (~$100-300 upfront), Pinata ($20/mo), Redis ($5/mo), Better Stack ($25/mo), Pyth update VAA ETH (~$10/day at 1000 settles). Pre-deploy budget approval needed before Phase 6 mainnet promotion.
- Top 3 inherited risks: Stylus alpha-line crate stability (`openzeppelin-stylus@0.3.0`), X API Basic tier ongoing cost volatility, owner-resolved disputes as governance attack surface (mitigated in v1 via Phase 6 multisig + public dispute log + owner self-exclusion).
- **🔴 Phase 6 entry blocker — Sepolia staging gate unsatisfiable for money paths.** The mandated USDC `0xaf88d065…e5831` (Arbitrum One) has NO code on Sepolia, so all stake transfers revert there → the spec's "≥48h Sepolia staging gate with seeded calls/follows/settles/duels/disputes" can't run as configured. Decision recorded in **`.planning/decisions/0001-sepolia-staging-usdc.md`**: recommend (c) mainnet-fork for money-path validation (zero contract change) + keep live Sepolia for integration; (b) Circle's official Sepolia USDC `0x75faf114…AA4d` (verified live, 6-dp, faucetable) as the opt-in live-Sepolia path via a chainid-gated USDC + redeploy + security review in Phase 6 (do NOT weaken the mainnet guard); (a) custom mock rejected. Not yet implemented (touches a LOCKED invariant — needs sign-off).

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260604-jt2 | Prep Phase 6 Gate-2 soak scaffolding (ritual checker, wallet-gen, evidence-log skeleton) | 2026-06-04 | ec106ba | [260604-jt2-prep-phase-6-gate-2-soak-scaffolding-rit](./quick/260604-jt2-prep-phase-6-gate-2-soak-scaffolding-rit/) |
| 260605-a4i | Fix notification-fanout eth_getLogs free-tier 10-block chunking | 2026-06-05 | 79ca33c | [260605-a4i-fix-notification-fanout-eth-getlogs-free](./quick/260605-a4i-fix-notification-fanout-eth-getlogs-free/) |
| 260605-r9e | Synthetic-alert CI verifies relayer send-confirmation (not getUpdates) | 2026-06-05 | b502841 | [260605-r9e-synthetic-alert-ci-verifies-relayer-send](./quick/260605-r9e-synthetic-alert-ci-verifies-relayer-send/) |
| 260607-o9y | Sync STATE.md to Phase 6 recovery cluster | 2026-06-07 | 1ad8e0a | [260607-o9y-sync-state-md-to-phase-6-recovery-cluste](./quick/260607-o9y-sync-state-md-to-phase-6-recovery-cluste/) |
| 260608-ep8 | Fix DuelSettled OG card: add duel metadata layout so receipts render large-image Twitter card | 2026-06-08 | 57a402c | [260608-ep8-fix-duelsettled-og-card-add-duel-metadat](./quick/260608-ep8-fix-duelsettled-og-card-add-duel-metadat/) |
| 260608-kqh | Fix Vercel git-deploy: build @call-it/shared before web in apps/web/vercel.json | 2026-06-08 | 588a629 | [260608-kqh-fix-vercel-git-deploy-build-call-it-shar](./quick/260608-kqh-fix-vercel-git-deploy-build-call-it-shar/) |
| 260608-lwe | Add seed-loss-call.ts (guaranteed-CallerLost seed for SC1 baselines) | 2026-06-08 | a681d4e | [260608-lwe-add-seed-loss-call-ts-create-one-guarant](./quick/260608-lwe-add-seed-loss-call-ts-create-one-guarant/) |
| 260608-n31 | Wire fadeRealShare (CONTRARIAN HIT 5/5) + remap 200px test + green web typecheck | 2026-06-08 | f3ecc53 | [260608-n31-wire-faderealshare-for-contrarian-hit-re](./quick/260608-n31-wire-faderealshare-for-contrarian-hit-re/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none — first milestone)* | | | |

## Session Continuity

Last session: 2026-06-09T10:41:10.549Z
Stopped at: Phase 9 context gathered
Resume file: .planning/phases/09-mobile-responsive-on-7-critical-pages/09-CONTEXT.md
