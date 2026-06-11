---
phase: quick-260611-sof
plan: 01
type: execute
status: planned
date: 2026-06-11
wave: 1
depends_on: []
files_modified:
  - packages/subgraph/subgraph.yaml
  - packages/subgraph/src/profile-registry.ts
  - packages/subgraph/src/settlement-manager.ts
  - packages/subgraph/tests/rep-mirror.test.ts
  - packages/shared/src/constants/addresses.ts
  - apps/web/.env.local            # gitignored — edited, never staged
autonomous: true
requirements: [QUICK-260611-SOF]
must_haves:
  truths:
    - "Subgraph Profile.globalRep equals on-chain ProfileRegistry.globalRep for every profile, sourced from the RepDeltaApplied(user, delta, newRep) event's POST-apply newRep — no more stale pre-settlement currentRep mirror (QUICK-260611-SOF, 09.2 UAT finding 1: losers no longer show unpunished at 100)"
    - "ACCEPTANCE HARD GATE: GraphQL POST to https://api.studio.thegraph.com/query/1754389/call-it-sepolia/v0.9.2 returns profile 0x3e6c1e35581b9a4fc3edaa98f73ad97d0c5d3f64 globalRep=90 AND 0xda8c5726f596e8dae99e6ddeba8aea1c8be9a4a5 globalRep=77 — exact match with cast against PR 0xF66C0AFEf03b43338FC5aE282e45C0Cf6A3c4820"
    - "handleRepCalculated no longer writes profile.globalRep from event.params.currentRep (the stale pre-update read at SettlementManager.sol:282/311); its settledCalls/wins/losses/lastActiveAt updates are unchanged"
    - "The exited-caller skip (SM:307 `if (!callerExited)`), cold-start 25% scaling (SM:302), REP-02 floor-at-0 + WR-08 uint128 clamp (ProfileRegistry.sol:245-249), duel deltas (SM:336-337), and dispute-reversal rep (SM:506) are ALL mirrored exactly — for free, because every one of those paths flows through applyRepDelta which emits the post-state; the duel-rep 'known gap' from the task brief is CLOSED, not documented as open"
    - "Studio version v0.9.2 of call-it-sepolia is deployed, fully synced (_meta.hasIndexingErrors=false, block near chain head), and all tracked v0.9.1 references are bumped (SUBGRAPH_URL_SEPOLIA in packages/shared/src/constants/addresses.ts; historical docs/operator runbook prose left untouched)"
    - "Subgraph vitest suite green including a new source-assertion test pinning the RepDeltaApplied wiring; `graph codegen && graph build` green"
    - "Two commits on master per quick-task convention (code commit, then docs commit), staged file-by-file — NEVER git add -A (another session's uncommitted WIP lives in apps/relayer/src/lib/ens-resolver.ts + its test); NOT pushed"
    - "SUMMARY.md lists the operator follow-ups verbatim with exact commands: Vercel NEXT_PUBLIC_SUBGRAPH_URL + redeploy; Vercel server-side SUBGRAPH_URL (currently a DN gateway URL pinned to an OLD published deployment with the stale mappings — leaderboard-client.ts PREFERS it over NEXT_PUBLIC_SUBGRAPH_URL); Fly relayer secrets"
  artifacts:
    - path: "packages/subgraph/src/profile-registry.ts"
      provides: "handleRepDeltaApplied — sets profile.globalRep = event.params.newRep.toI32() (single source of truth for globalRep)"
      exports: ["handleRepDeltaApplied"]
    - path: "packages/subgraph/subgraph.yaml"
      provides: "RepDeltaApplied(indexed address,int256,uint128) eventHandler entry under the ProfileRegistry data source"
      contains: "handleRepDeltaApplied"
    - path: "packages/subgraph/src/settlement-manager.ts"
      provides: "handleRepCalculated WITHOUT the stale globalRep write; comment pointing to RepDeltaApplied as the rep source"
    - path: "packages/subgraph/tests/rep-mirror.test.ts"
      provides: "Source-assertion vitest (call-statement.test.ts style) pinning yaml wiring + handler body + stale-write removal"
    - path: "packages/shared/src/constants/addresses.ts"
      provides: "SUBGRAPH_URL_SEPOLIA bumped to .../call-it-sepolia/v0.9.2 with updated provenance comment"
  key_links:
    - from: "packages/subgraph/subgraph.yaml"
      to: "packages/subgraph/src/profile-registry.ts"
      via: "eventHandlers entry — event: RepDeltaApplied(indexed address,int256,uint128) / handler: handleRepDeltaApplied"
      pattern: "handleRepDeltaApplied"
    - from: "packages/subgraph/src/profile-registry.ts"
      to: "generated/ProfileRegistry/ProfileRegistry (graph codegen output)"
      via: "import { RepDeltaApplied } — the committed abis/ProfileRegistry.json ALREADY contains the event (line ~530); codegen regenerates the class"
      pattern: "RepDeltaApplied"
    - from: "apps/web/lib/leaderboard-client.ts"
      to: "Studio v0.9.2 endpoint"
      via: "SUBGRAPH_URL ?? NEXT_PUBLIC_SUBGRAPH_URL env ladder (lines 24-28) — local .env.local NEXT_PUBLIC var bumped here; the SUBGRAPH_URL gateway var is an OPERATOR follow-up"
      pattern: "NEXT_PUBLIC_SUBGRAPH_URL"
---

<objective>
Fix 09.2 UAT finding 1 — the leaderboard shows losers unpunished (everyone at globalRep 100) — by making the subgraph mirror on-chain reputation exactly, then deploy Studio version v0.9.2 and prove the fix against live chain truth.

Root cause (live-verified by the orchestrator 2026-06-11, re-verified against source at planning time): SettlementManager._computeRepDelta reads `currentRep = profileRegistry.globalRep(caller)` (SettlementManager.sol:282) BEFORE `applyRepDelta` (line 308), and emits `RepCalculated(..., currentRep, ..., repDelta)` (line 311) with the PRE-update rep. The mapping (packages/subgraph/src/settlement-manager.ts:279) persists that stale value: `profile.globalRep = event.params.currentRep.toI32()`. Chain truth: loser 0x3e6c1e…=90, treasury=77. Subgraph v0.9.1: 100 and 76.

THE FIX (verified superior to arithmetic condition-mirroring): ProfileRegistry.applyRepDelta is the ONLY globalRep mutator and emits `RepDeltaApplied(address indexed user, int256 delta, uint128 newRep)` (ProfileRegistry.sol:251) where newRep is the POST-apply value after the REP-02 floor-at-0 AND the WR-08 uint128 clamp. PLANNING-TIME LIVE VERIFICATION: eth_getLogs on the deployed Sepolia PR (0xF66C0AFE…) for topic0 0x29b3aaae2a6022095dcfda0fb7e78e80fbde44f6f21042dc40152db0dbeb5151 returned 6 logs that decode EXACTLY to chain truth — treasury exit delta=-24→newRep=76; three lazy-init delta=0 events (newRep 76/100/100); loser settle delta=-10→newRep=90; treasury settle delta=+1→newRep=77. Subscribing to this event and writing `globalRep = newRep` mirrors EVERY apply path with zero condition logic: settlement (incl. the exited-caller skip at SM:307 — no event fires, so nothing to mirror), cold-start scaling (SM:302, baked into delta before emit), duel winner/loser deltas (SM:336-337 — each applyRepDelta emits its own RepDeltaApplied, CLOSING the task brief's anticipated duel gap), and dispute-reversal rep (SM:506). The only globalRep write WITHOUT an event is _initIfNeeded's 100 default via updateAfterSettlement — already mirrored by every ensureProfile helper's REP-01 default of 100.

Purpose: the leaderboard (apps/web/lib/leaderboard-client.ts ranks by Profile.globalRep) must punish losers — core "permanent, public reputation" product truth.

Output: mapping fix + new source-assertion test + Studio v0.9.2 deployed and acceptance-gated against cast truth + tracked v0.9.1 refs bumped + two commits (code, docs) on master, NOT pushed + SUMMARY.md with verbatim operator follow-ups.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@packages/subgraph/subgraph.yaml                    # ProfileRegistry dataSource lines 63-101 (addr 0xF66C0AFE…, startBlock 274393587)
@packages/subgraph/src/profile-registry.ts          # add handler here; ensureProfile at lines 28-46
@packages/subgraph/src/settlement-manager.ts        # stale write at line 279 (handleRepCalculated); fallback handler 294-326
@packages/subgraph/tests/call-statement.test.ts     # style template for the new source-assertion test
@packages/subgraph/package.json                     # test=vitest run tests/; build=prebuild(copy-abis)+graph codegen+graph build; deploy:sepolia script
@packages/contracts/src/SettlementManager.sol       # _computeRepDelta 270-312; _settleDuels 316-339; resolveDispute rep at 506
@packages/contracts/src/ProfileRegistry.sol         # applyRepDelta 239-252 (floor+clamp+emit); _initIfNeeded 259-264
@packages/shared/src/constants/addresses.ts         # SUBGRAPH_URL_SEPOLIA at lines 309-310 (v0.9.1, the only tracked code ref)
@apps/web/lib/leaderboard-client.ts                 # SUBGRAPH_URL ?? NEXT_PUBLIC_SUBGRAPH_URL ladder, lines 24-28
</context>

<source_facts>
Verified at planning time (2026-06-11) — the executor should trust these but re-confirm anchors before each edit (line numbers can drift; ANOTHER session has uncommitted WIP in this repo):

- Event signature: `event RepDeltaApplied(address indexed user, int256 delta, uint128 newRep)` (IProfileRegistry.sol:33). subgraph.yaml handler-signature format: `RepDeltaApplied(indexed address,int256,uint128)`.
- The committed `packages/subgraph/abis/ProfileRegistry.json` ALREADY contains RepDeltaApplied (entry near line 530) — `graph codegen` will generate the event class without any ABI work. The prebuild copy-abis.cjs tolerates a missing contracts/out/ (falls back to committed snapshots) — no forge build required.
- Deployed-PR emission CONFIRMED on Sepolia: topic0 `0x29b3aaae2a6022095dcfda0fb7e78e80fbde44f6f21042dc40152db0dbeb5151` = keccak("RepDeltaApplied(address,int256,uint128)"); 6 logs exist from startBlock 274393587 → latest on 0xF66C0AFEf03b43338FC5aE282e45C0Cf6A3c4820.
- In a settle tx the event order is: RepDeltaApplied (inside applyRepDelta, SM:308) → RepCalculated (SM:311) → ProfileUpdated (updateAfterSettlement, SM:369) → CallSettled (SM:372). Handlers run in logIndex order, so handleRepCalculated runs AFTER handleRepDeltaApplied in the same tx — the stale `globalRep = currentRep` write at settlement-manager.ts:279 would CLOBBER the correct value and therefore MUST be removed, not merely supplemented.
- Exited-caller settle (e.g. call #12): `if (!callerExited)` (SM:307) skips applyRepDelta → NO RepDeltaApplied fires → handler never runs → globalRep stays at the exit-time value (set by the exit tx's own RepDeltaApplied from FollowFadeMarket.sol:428). Exact mirror by construction.
- handleRepCalculatedFallback (settlement-manager.ts:294-326) does NOT touch globalRep — no staleness there. Contract-side, the catch branch (SM:293-296) emits RepCalculatedFallback and execution CONTINUES to the unconditional RepCalculated emit (SM:311) and the same conditional applyRepDelta — so rep in the fallback path is also covered by RepDeltaApplied. Do NOT add rep logic to the fallback handler; add a one-line comment only. (Observed, no action: the fallback path double-increments settledCalls across the two handlers, but handleProfileUpdated overwrites with authoritative on-chain counters later in the same tx — self-healing.)
- follow-fade-market.ts handleCallerExited never writes Profile.globalRep (only the CallerExit entity) — no conflict with the new handler.
- Profile.globalRep is `Int!` in schema.graphql (line 84) — `event.params.newRep.toI32()` matches the existing `currentRep.toI32()` precedent; uint128→i32 is safe at rep scale.
- Subgraph tests are SOURCE-LEVEL vitest assertions (read files from disk, parse/regex) — see call-statement.test.ts header: "matchstick runtime tests are not wired in this package". Gates are `pnpm --filter @call-it/subgraph test` + `pnpm --filter @call-it/subgraph build`.
- Tracked v0.9.1 references: ONLY `packages/shared/src/constants/addresses.ts:309-310` (SUBGRAPH_URL_SEPOLIA). docs/operator/phase-7-deploy-runbook.md:184 mentions v0.9.1 as HISTORICAL narrative — leave it.
- URL consumers: web leaderboard prefers server-only `SUBGRAPH_URL` over `NEXT_PUBLIC_SUBGRAPH_URL` (leaderboard-client.ts:24-28). Local apps/web/.env.local has NEXT_PUBLIC_SUBGRAPH_URL=…/v0.9.1 (line 16) AND SUBGRAPH_URL=https://gateway.thegraph.com/api/<key>/subgraphs/id/G6tEsqkxa147R8BvNWN97ssqGeu4cNHuZ1SkVS46X7Cy (line 43) — a Decentralized-Network gateway deployment pinned to OLD mappings; fixing it is an OPERATOR follow-up (republish to DN or repoint at Studio v0.9.2). Relayer resolves `RELAYER_SUBGRAPH_URL ?? NEXT_PUBLIC_SUBGRAPH_URL` (index.ts:226-229, duels.ts, settlement-watcher.ts; secret-manager.ts also fetches NEXT_PUBLIC_SUBGRAPH_URL from GCP).
- Acceptance chain truths (cast, public RPC https://sepolia-rollup.arbitrum.io/rpc): globalRep(0x3e6c1e35581b9a4fc3edaa98f73ad97d0c5d3f64)=90; globalRep(0xda8c5726f596e8dae99e6ddeba8aea1c8be9a4a5)=77; bonus spot-check 0x73047a882e0b88a1913a25bbe8d871abad2c5ced=100 (lazy-init only).
- GIT CAUTION: working tree carries another session's uncommitted WIP (apps/relayer/src/lib/ens-resolver.ts + its test) plus unrelated dirt ('call it frontend/', docs/, evidence/, .claude/launch.json, .gitignore, .planning/config.json, contracts submodule). NEVER `git add -A` / `git add .` — stage every path explicitly.
</source_facts>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: RepDeltaApplied mirror — yaml wiring + handler + stale-write removal + source-assertion test + build</name>
  <files>packages/subgraph/subgraph.yaml, packages/subgraph/src/profile-registry.ts, packages/subgraph/src/settlement-manager.ts, packages/subgraph/tests/rep-mirror.test.ts</files>
  <behavior>
    tests/rep-mirror.test.ts (vitest, source-assertion style copied from call-statement.test.ts — readFileSync from process.cwd(), describe/it/expect):
    - Test 1 (yaml wiring): subgraph.yaml's ProfileRegistry dataSource contains an eventHandlers entry with event `RepDeltaApplied(indexed address,int256,uint128)` and handler `handleRepDeltaApplied`.
    - Test 2 (handler body): src/profile-registry.ts exports `handleRepDeltaApplied` and assigns `profile.globalRep` from `event.params.newRep.toI32()`.
    - Test 3 (stale write removed): src/settlement-manager.ts does NOT match `/profile\.globalRep\s*=\s*event\.params\.currentRep/` anywhere.
    - Test 4 (single source of truth): the ONLY `profile.globalRep =` assignments across src/*.ts are the ensureProfile 100 defaults plus the one newRep mirror in profile-registry.ts (regex-count across the five mapping files).
    Written FIRST; Tests 1-3 must FAIL against the unmodified sources (Test 3 fails because the stale write still exists), then go GREEN after the edits.
  </behavior>
  <action>
    Write tests/rep-mirror.test.ts first per the behavior block and confirm the expected RED (run the suite; only the new file's relevant assertions fail — schema.test.ts and call-statement.test.ts stay green). Then:

    1. packages/subgraph/subgraph.yaml — in the ProfileRegistry dataSource (address 0xF66C0AFE…, lines 63-101), append to eventHandlers:
       `- event: RepDeltaApplied(indexed address,int256,uint128)` / `handler: handleRepDeltaApplied`
       (exact param-style of the sibling entries, e.g. `SocialLinked(indexed address,uint8,string,bytes32)`). Do NOT touch any other dataSource. networks.json carries only addresses/startBlocks — no change needed there.

    2. packages/subgraph/src/profile-registry.ts — add `RepDeltaApplied` to the existing import from '../generated/ProfileRegistry/ProfileRegistry' and add the handler (AssemblyScript: no closures, no Math.*; newRep is a codegen BigInt → .toI32()):

       handleRepDeltaApplied(event: RepDeltaApplied): ensureProfile(event.params.user.toHexString()); set `profile.globalRep = event.params.newRep.toI32();` and save. NOTHING else — deliberately do NOT set lastActiveAt (on-chain applyRepDelta does not set it, and lazy-init delta=0 emissions from FFM initializePool would otherwise skew activity). Doc-comment the contract: RepDeltaApplied carries the POST-apply globalRep (REP-02 floor-at-0 + WR-08 uint128 clamp already applied on-chain at ProfileRegistry.sol:239-252) and is emitted by EVERY applyRepDelta path — settlement (SM:308), caller exit (FFM:428), duel winner/loser (SM:336-337), dispute reversal (SM:506) — making it the single source of truth for Profile.globalRep (quick-260611-sof; 09.2 UAT finding 1).

    3. packages/subgraph/src/settlement-manager.ts — in handleRepCalculated, DELETE the two lines at ~278-279 (`// Update globalRep from currentRep …` + `profile.globalRep = event.params.currentRep.toI32();`) and replace with a comment: globalRep is NOT written here — RepCalculated.currentRep is the PRE-update rep read at SettlementManager.sol:282 before applyRepDelta (the v0.9.1 staleness bug, quick-260611-sof); Profile.globalRep is mirrored exclusively from ProfileRegistry.RepDeltaApplied in profile-registry.ts, which fires EARLIER in the same settle tx (logIndex order: RepDeltaApplied → RepCalculated) — writing currentRep here would clobber the correct value. Keep settledCalls/wins/losses/lastActiveAt updates and the RepEvent creation byte-identical. In handleRepCalculatedFallback add a one-line comment only (no code change): rep application in the Stylus-fallback path is also covered by RepDeltaApplied + the subsequent unconditional RepCalculated (SM:293-311); this handler records the fallback artifact entities only.

    4. Gates (repo root): `pnpm --filter @call-it/subgraph test` — all green including rep-mirror.test.ts; then `pnpm --filter @call-it/subgraph build` (runs copy-abis prebuild → graph codegen → graph build; codegen regenerates generated/ProfileRegistry with the RepDeltaApplied class from the already-committed ABI). If graph-cli is not on PATH inside the package scripts, prefix with npx as the scripts already resolve via the package's devDependency.
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/subgraph test && pnpm --filter @call-it/subgraph build && bash -c "! grep -q 'profile.globalRep = event.params.currentRep' packages/subgraph/src/settlement-manager.ts && grep -q 'handleRepDeltaApplied' packages/subgraph/subgraph.yaml && grep -q 'newRep.toI32' packages/subgraph/src/profile-registry.ts && echo TASK1-GATES-OK"</automated>
  </verify>
  <done>rep-mirror.test.ts written first and RED, then GREEN with the full subgraph vitest suite; `graph codegen && graph build` green; the stale currentRep write is gone from handleRepCalculated; handleRepDeltaApplied is the only non-default globalRep writer; fallback handler unchanged except the comment.</done>
</task>

<task type="auto">
  <name>Task 2: Studio v0.9.2 deploy + sync poll + ACCEPTANCE GATE vs chain truth + roll-forward + two commits</name>
  <files>packages/shared/src/constants/addresses.ts, apps/web/.env.local</files>
  <action>
    1. DEPLOY (live): from packages/subgraph run the repo-consistent deploy with an explicit version label:
       `npx graph deploy --node https://api.studio.thegraph.com/deploy/ call-it-sepolia --version-label v0.9.2`
       (this mirrors the package's own deploy:sepolia script; `graph deploy --studio call-it-sepolia --version-label v0.9.2` is an equivalent fallback if the --node form rejects the label flag). The Studio deploy key from prior v0.9.0/v0.9.1 deploys should be cached on this box. IF THE COMMAND FAILS WITH AN AUTH ERROR: STOP IMMEDIATELY — do not guess or search for keys; surface a checkpoint to the user stating the exact remediation: run `npx graph auth <SUBGRAPH_STUDIO_DEPLOY_KEY>` (key from Subgraph Studio → call-it-sepolia → Details), then resume.

    2. SYNC POLL: fresh versions resync from the manifest startBlock 274393587 (sparse event history — expect minutes). Poll every ~30s:
       `curl -s -X POST https://api.studio.thegraph.com/query/1754389/call-it-sepolia/v0.9.2 -H "Content-Type: application/json" -d '{"query":"{ _meta { block { number } hasIndexingErrors } }"}'`
       until `_meta.block.number` is within ~50 blocks of `eth_blockNumber` from https://sepolia-rollup.arbitrum.io/rpc AND hasIndexingErrors=false. While syncing the endpoint may return indexing-in-progress errors — keep polling, do not fail early. If hasIndexingErrors=true: STOP and investigate the mapping (a handler trap reverts indexing); fix and redeploy. If still unsynced after ~30 min, report progress and keep waiting rather than aborting.

    3. ACCEPTANCE (HARD GATE — the entire task fails without this):
       `curl -s -X POST https://api.studio.thegraph.com/query/1754389/call-it-sepolia/v0.9.2 -H "Content-Type: application/json" -d '{"query":"{ loser: profile(id: \"0x3e6c1e35581b9a4fc3edaa98f73ad97d0c5d3f64\") { globalRep } treasury: profile(id: \"0xda8c5726f596e8dae99e6ddeba8aea1c8be9a4a5\") { globalRep } spot: profile(id: \"0x73047a882e0b88a1913a25bbe8d871abad2c5ced\") { globalRep } }"}'`
       MUST return loser.globalRep=90 AND treasury.globalRep=77 (spot=100 is a bonus sanity check). These equal cast truth on PR 0xF66C0AFE… exactly. If they do NOT match, the mirror is wrong — re-read SettlementManager.sol/ProfileRegistry.sol, fix the mapping, and redeploy (the same v0.9.2 label can be re-pushed while the version is unsynced; otherwise bump to v0.9.3 and use that endpoint everywhere downstream, including this gate, the roll-forward, and SUMMARY.md).

    4. ROLL-FORWARD (only after the gate passes):
       a. packages/shared/src/constants/addresses.ts:309-310 — SUBGRAPH_URL_SEPOLIA → `https://api.studio.thegraph.com/query/1754389/call-it-sepolia/v0.9.2`; extend the trailing comment: v0.9.2 (2026-06-11, quick-260611-sof) mirrors globalRep from ProfileRegistry.RepDeltaApplied newRep — fixes the stale pre-settlement currentRep mirror (leaderboard showed losers at 100). Keep the existing cluster-address provenance prose.
       b. `pnpm --filter @call-it/shared build` — green (web/relayer import this constant; dist is gitignored so downstream builds need it fresh).
       c. apps/web/.env.local line 16: NEXT_PUBLIC_SUBGRAPH_URL → the v0.9.2 URL (file is GITIGNORED — edit is fine, never stage it; note the edit in SUMMARY.md). Leave line 43 SUBGRAPH_URL (DN gateway) untouched — operator decision, see follow-ups.
       d. Confirm no other tracked v0.9.1 refs: `grep -rn "call-it-sepolia/v0.9.1" packages/shared/src apps/relayer/src apps/web --include="*.ts" --include="*.tsx" --include="*.json"` → must be empty after (a). docs/operator/phase-7-deploy-runbook.md:184 is historical narrative — DO NOT edit.

    5. COMMITS (two, per quick-task convention; stage every path EXPLICITLY — the worktree has another session's WIP in apps/relayer/src/lib/ens-resolver.ts + its test, plus unrelated dirt; NEVER git add -A / git add .):
       a. CODE commit — stage exactly: packages/subgraph/subgraph.yaml, packages/subgraph/src/profile-registry.ts, packages/subgraph/src/settlement-manager.ts, packages/subgraph/tests/rep-mirror.test.ts, packages/shared/src/constants/addresses.ts. Message EXACTLY:
          `fix(quick-260611-sof): subgraph globalRep mirrors RepDeltaApplied newRep — v0.9.2 (stale pre-settlement rep showed losers unpunished)`
       b. DOCS commit — stage exactly: .planning/quick/260611-sof-subgraph-globalrep-staleness/PLAN.md and .planning/quick/260611-sof-subgraph-globalrep-staleness/SUMMARY.md. Message EXACTLY:
          `docs(quick-260611-sof): subgraph globalRep staleness — plan + summary`
       c. After each commit: `git show --stat HEAD` lists exactly the staged files. DO NOT PUSH.

    6. SUMMARY.md in .planning/quick/260611-sof-subgraph-globalrep-staleness/ — include: root cause (SM:282/311 pre-update emit + mapping line 279), the RepDeltaApplied design and WHY it supersedes condition-mirroring (single mutator, post-state event, live-verified 6 logs; duel-delta gap CLOSED, dispute-reversal covered), acceptance evidence (the exact GraphQL response + matching cast values), files changed, both commit hashes, the .env.local edit note, and this OPERATOR FOLLOW-UPS section VERBATIM with exact commands:
       - Vercel (web prod): update env NEXT_PUBLIC_SUBGRAPH_URL → https://api.studio.thegraph.com/query/1754389/call-it-sepolia/v0.9.2 and redeploy (vercel CLI is agent-blocked on this box — dashboard or operator-run `vercel env`).
       - Vercel server-side SUBGRAPH_URL (leaderboard-client.ts PREFERS it over NEXT_PUBLIC_SUBGRAPH_URL): the local value is a Decentralized-Network gateway URL (`https://gateway.thegraph.com/api/<key>/subgraphs/id/G6tEsqkxa147R8BvNWN97ssqGeu4cNHuZ1SkVS46X7Cy`) pinned to a published deployment running the OLD stale mappings — the production leaderboard stays wrong until the operator EITHER republishes v0.9.2 to the Decentralized Network (durable, the Phase-10 plan) OR points Vercel's SUBGRAPH_URL at the v0.9.2 Studio URL (immediate).
       - Fly relayer: `flyctl secrets list -a call-it-relayer-sepolia` to see which of RELAYER_SUBGRAPH_URL / NEXT_PUBLIC_SUBGRAPH_URL are set (resolution order is RELAYER_SUBGRAPH_URL ?? NEXT_PUBLIC_SUBGRAPH_URL; secret-manager.ts may also serve NEXT_PUBLIC_SUBGRAPH_URL from GCP Secret Manager), then `flyctl secrets set RELAYER_SUBGRAPH_URL=https://api.studio.thegraph.com/query/1754389/call-it-sepolia/v0.9.2 -a call-it-relayer-sepolia` (and/or the NEXT_PUBLIC variant / the GCP secret) — flyctl works via Bash, not PowerShell, on this box. Secrets-set triggers a machine restart; no code redeploy needed.
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && bash -c "curl -s -X POST https://api.studio.thegraph.com/query/1754389/call-it-sepolia/v0.9.2 -H 'Content-Type: application/json' -d '{\"query\":\"{ loser: profile(id: \\\"0x3e6c1e35581b9a4fc3edaa98f73ad97d0c5d3f64\\\") { globalRep } treasury: profile(id: \\\"0xda8c5726f596e8dae99e6ddeba8aea1c8be9a4a5\\\") { globalRep } }\"}' | grep -q '\"globalRep\":90' && curl -s -X POST https://api.studio.thegraph.com/query/1754389/call-it-sepolia/v0.9.2 -H 'Content-Type: application/json' -d '{\"query\":\"{ treasury: profile(id: \\\"0xda8c5726f596e8dae99e6ddeba8aea1c8be9a4a5\\\") { globalRep } }\"}' | grep -q '\"globalRep\":77' && grep -q 'call-it-sepolia/v0.9.2' packages/shared/src/constants/addresses.ts && git log --oneline -2 | grep -q 'quick-260611-sof' && echo ACCEPTANCE-OK"</automated>
  </verify>
  <done>v0.9.2 live on Studio, synced with hasIndexingErrors=false; the acceptance query returns loser=90 and treasury=77 matching cast exactly; SUBGRAPH_URL_SEPOLIA bumped and shared build green; .env.local NEXT_PUBLIC var bumped (unstaged); exactly two commits on master with the exact messages, NOT pushed; SUMMARY.md contains the verbatim operator follow-ups with exact commands.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| chain → subgraph mapping | Untrusted on-chain event data shapes the persisted Profile entities |
| executor → Studio deploy | Deploy-key-authenticated publish of indexing code to the public query endpoint |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-sof-01 | Tampering | Profile.globalRep mirror | mitigate | Sourced exclusively from RepDeltaApplied.newRep — the contract's own post-floor/post-clamp value; no subgraph-side arithmetic to get wrong; hard acceptance gate against cast truth |
| T-sof-02 | Information Disclosure | Studio deploy key / DN gateway key | mitigate | Never read, print, or guess keys; auth failure becomes a STOP-and-surface checkpoint; the gateway URL (key-in-path) stays in gitignored .env.local and is only REFERENCED (never quoted with key) in SUMMARY.md |
| T-sof-03 | Denial of Service | mapping handler trap reverting indexing | mitigate | Handler is two safe statements (ensureProfile + toI32 assignment); sync poll checks hasIndexingErrors before acceptance |
| T-sof-SC | Tampering | npm/pip/cargo installs | accept | NO new packages — uses existing @graphprotocol/graph-cli 0.98.1 / graph-ts 0.38.2 devDependencies; supply-chain surface unchanged |
</threat_model>

<verification>
1. `pnpm --filter @call-it/subgraph test` green (schema.test.ts + call-statement.test.ts + new rep-mirror.test.ts).
2. `pnpm --filter @call-it/subgraph build` green (codegen picks up RepDeltaApplied from the committed ABI).
3. ACCEPTANCE: v0.9.2 endpoint returns loser 0x3e6c1e…=90 AND treasury 0xda8c…=77 — byte-identical to cast on PR 0xF66C0AFE… (spot 0x73047a88…=100).
4. `grep -rn "call-it-sepolia/v0.9.1"` over packages/shared/src, apps/relayer/src, apps/web tracked sources → empty.
5. Exactly two new commits (code, then docs) with the exact messages; `git show --stat` per commit lists only the explicitly staged paths; apps/relayer/src/lib/ens-resolver.ts and its test remain UNSTAGED and untouched; nothing pushed.
</verification>

<success_criteria>
- Leaderboard data source is fixed at the root: subgraph Profile.globalRep mirrors on-chain rep exactly for every apply path (settle, exit, duel, dispute reversal, lazy-init default), with the duel-delta "known gap" from the task brief closed rather than documented.
- The 09.2 UAT finding is dispelled by hard evidence: v0.9.2 query shows the call-#14 loser at 90, treasury at 77.
- Tracked references roll forward consistently; gitignored local env bumped; production cutover (Vercel envs + Fly secrets + DN republish decision) handed to the operator verbatim with exact commands in SUMMARY.md.
- Two clean commits on master, not pushed; other sessions' WIP untouched.
</success_criteria>

<output>
- Code commit: `fix(quick-260611-sof): subgraph globalRep mirrors RepDeltaApplied newRep — v0.9.2 (stale pre-settlement rep showed losers unpunished)` — NOT pushed.
- Docs commit: `docs(quick-260611-sof): subgraph globalRep staleness — plan + summary` — NOT pushed.
- Live: Studio call-it-sepolia v0.9.2 deployed, synced, acceptance-gated.
- `.planning/quick/260611-sof-subgraph-globalrep-staleness/SUMMARY.md` with operator follow-ups.
</output>
