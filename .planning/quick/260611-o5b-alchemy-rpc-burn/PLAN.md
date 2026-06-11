---
phase: quick-260611-o5b
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/relayer/src/workers/chain-scanner.ts
  - apps/relayer/src/workers/notification-fanout.ts
  - apps/relayer/src/workers/social-unlink-watcher.ts
  - apps/relayer/src/workers/auto-post-worker.ts
  - apps/relayer/src/index.ts
  - apps/relayer/src/workers/__tests__/chain-scanner.test.ts
  - apps/relayer/src/workers/__tests__/auto-post-worker.test.ts
autonomous: true
requirements: [QUICK-260611-O5B]
must_haves:
  truths:
    - "The relayer issues exactly ONE eth_getLogs (multi-address + multi-event) and ONE eth_getBlockNumber per 30s tick in steady state, instead of ~56 getLogs + 3 getBlockNumber (9-block chunks x 4 event streams) — the Alchemy CU burn fix (QUICK-260611-O5B)"
    - "The default scan window span is 500 blocks (was 9n), with the corrected rationale comment: the Alchemy free-tier eth_getLogs cap is a 10K-block RANGE for filtered queries, not 10 blocks per request"
    - "Env override fallback order is documented and honored: CHAIN_SCANNER_BLOCK_SPAN > NOTIFICATION_FANOUT_BLOCK_SPAN > 500 default; CHAIN_SCANNER_MAX_WINDOWS_PER_TICK > NOTIFICATION_FANOUT_MAX_WINDOWS_PER_TICK > 50 default"
    - "Same events detected, same 30s tick latency: CallerExited (FFM) still fans out notifications AND auto-posts; CallSettled (SettlementManager) still auto-posts; SocialUnlinked (ProfileRegistry) still backstop-purges — DB writes, dedup (ON CONFLICT DO NOTHING / posted_receipts), Redis bumps, and Telegram alerts byte-for-byte equivalent per log"
    - "WR-05 init guard preserved in the shared scanner: if getBlockNumber fails at init, the scanner NEVER scans from block 1 — it re-seeds from head on the next tick and skips scanning until seeded"
    - "Per-tick error resilience preserved: getLogs failure does NOT advance the cursor (same window retried next tick); a throwing handler is logged via pino, never rethrown, and never blocks other handlers or the interval"
    - "Each worker keeps its public start*() API, handle shape ({ stop, getStats }, auto-post also processCall), and stop() teardown; index.ts wiring changes are minimal (one shared scanner instance + scanner field in three worker configs)"
    - "Existing relayer test suite green (auto-post-worker.test.ts handler-level assertions unweakened) + new chain-scanner unit tests (chunking math, address+topic dispatch, WR-05 init guard, error resilience, stop(), env fallback order)"
    - "settlement-poller.ts, polled-events-fallback.ts, duel-king-worker.ts, duel-trending-worker.ts, and all of apps/web are byte-identical to HEAD"
  artifacts:
    - path: "apps/relayer/src/workers/chain-scanner.ts"
      provides: "Shared single-cursor chained-window getLogs scanner with subscriber registration + onTick callbacks"
      exports: ["createChainScanner", "ChainScannerConfig", "ChainScannerHandle", "LogSubscription"]
    - path: "apps/relayer/src/workers/__tests__/chain-scanner.test.ts"
      provides: "Scanner unit tests: window math, dispatch, WR-05, error resilience, stop, env fallback"
    - path: "apps/relayer/src/workers/notification-fanout.ts"
      provides: "CallerExited fan-out as a scanner subscription + challenge notifications as an onTick callback (scan loop removed)"
    - path: "apps/relayer/src/workers/social-unlink-watcher.ts"
      provides: "SocialUnlinked backstop purge as a scanner subscription (scan loop removed; zero-address inactive guard kept)"
    - path: "apps/relayer/src/workers/auto-post-worker.ts"
      provides: "CallSettled + CallerExited auto-post as two scanner subscriptions (scan loop removed; processCall test seam kept)"
  key_links:
    - from: "apps/relayer/src/index.ts"
      to: "apps/relayer/src/workers/chain-scanner.ts"
      via: "one createChainScanner({ publicClient: notificationFanoutClient, intervalMs: 30_000 }) instance passed as `scanner` into all three worker configs; started in onReady, stopped in onClose"
      pattern: "createChainScanner"
    - from: "apps/relayer/src/workers/notification-fanout.ts"
      to: "chain-scanner register()"
      via: "scanner.register({ address: ffmAddress, event: CALLER_EXITED_EVENT, onLog }) + scanner.onTick(processChallengeNotifications)"
      pattern: "scanner\\.register"
    - from: "apps/relayer/src/workers/auto-post-worker.ts"
      to: "chain-scanner register()"
      via: "two registrations: (settlementManagerAddress, CALL_SETTLED_EVENT) and (ffmAddress, CALLER_EXITED_EVENT)"
      pattern: "scanner\\.register"
    - from: "apps/relayer/src/workers/social-unlink-watcher.ts"
      to: "chain-scanner register()"
      via: "scanner.register({ address: profileRegistryAddress, event: SOCIAL_UNLINKED_EVENT, onLog }) — skipped entirely when zero-address (inactive)"
      pattern: "scanner\\.register"
---

<objective>
Stop the ~6M CU/day Alchemy burn in the relayer event watchers by (1) merging the three independent getLogs scan loops (notification-fanout, social-unlink-watcher, auto-post-worker — the last issues 2 getLogs per window) into ONE shared chain-scanner with a single block cursor and ONE multi-address/multi-event getLogs per window, and (2) raising the default window span from 9 blocks to 500 (the 9n value was based on a wrong belief that Alchemy free tier caps eth_getLogs at 10 blocks/request; the real cap is a 10K-block range for filtered queries).

Purpose: On Arbitrum Sepolia (~250ms blocks ≈ 120 new blocks per 30s tick), today's steady state is ceil(120/9)=14 windows × 4 getLogs streams ≈ 56 getLogs + 3 getBlockNumber every 30s, 24/7 on Fly. After this fix: 1 merged getLogs (120 < 500-block span → one window) + 1 getBlockNumber per tick — same events, same 30s latency, ~30× fewer RPC round trips.

Output: New apps/relayer/src/workers/chain-scanner.ts + refactored three workers + minimal index.ts wiring + scanner unit tests; one atomic commit to master (NOT pushed); SUMMARY.md in this task dir (uncommitted).

NO behavior change contract: same events detected, same per-log side effects (DB writes, dedup, Redis statusVersion bumps, Telegram alerts, cache-warm/post pipeline), same 30s tick cadence, same WR-05 init-seeding guard, same never-throw discipline.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
</execution_context>

<context>
@apps/relayer/src/workers/notification-fanout.ts
@apps/relayer/src/workers/social-unlink-watcher.ts
@apps/relayer/src/workers/auto-post-worker.ts
@apps/relayer/src/index.ts                      # worker wiring: imports ~62-75, client ~213-222, onReady ~284-432, onClose ~458+
@apps/relayer/src/workers/__tests__/auto-post-worker.test.ts
@apps/relayer/package.json                      # name @call-it/relayer; test=vitest run; build=tsc --build
</context>

<diagnosis>
Diagnosed by the orchestrator 2026-06-11; grounded against source at planning time. The executor has not seen the diagnosing conversation.

**The burn.** Three workers each run an independent 30s setInterval scan loop against the same PublicClient (`notificationFanoutClient`, index.ts:213-222):
- notification-fanout.ts: getBlockNumber + chunked getLogs (FFM CallerExited), span 9n (lines 481-498), maxWindowsPerTick 50.
- social-unlink-watcher.ts: getBlockNumber + chunked getLogs (ProfileRegistry `SocialUnlinked(address indexed user, uint8 kind)` — parseAbiItem at line 40-42), span 9n (lines 164-170, env SOCIAL_UNLINK_BLOCK_SPAN), maxWindowsPerTick 50.
- auto-post-worker.ts: getBlockNumber + TWO chunked getLogs per window via Promise.all (SettlementManager CallSettled + FFM CallerExited, lines 465-468), span 9n (lines 351-357, env AUTO_POST_BLOCK_SPAN ?? NOTIFICATION_FANOUT_BLOCK_SPAN), maxWindowsPerTick 50.

The 9n span comes from notification-fanout.ts:481-482's stale comment: "Alchemy free tier caps eth_getLogs at 10 blocks per request on Arbitrum" — wrong; the free-tier constraint is a 10K-block RANGE for single/filtered-address queries. 500 blocks is conservatively 20× under that cap and covers ~4 ticks of Sepolia chain per window.

**Source facts the executor needs (verified 2026-06-11):**
- Worker public APIs: `startNotificationFanout(config): NotificationFanoutHandle` (stop, getStats → { lastBlockSeen, totalEventsProcessed, errors }); `startSocialUnlinkWatcher(config): SocialUnlinkWatcherHandle` (same getStats shape); `startAutoPostWorker(config): AutoPostWorkerHandle` (stop, getStats → { lastBlockSeen, totalPosted, errors }, processCall).
- Only importers of these modules: index.ts (lines 62, 66, 75) and `__tests__/auto-post-worker.test.ts`. routes/live-state.ts mentions notification-fanout in a COMMENT only. No other coupling — the refactor is contained.
- notification-fanout extras beyond the scan loop: `processChallengeNotifications` (subgraph + DB, time-windowed 60s lookback) runs at the END of every initialized tick AND in the get_head-failure path (lines 577-588, 666-677); it must keep running every 30s independent of scan success. `resolveCallerHandle` uses `config.publicClient.readContract` — publicClient stays in the config.
- social-unlink-watcher inactive guard: ProfileRegistry zero-address → logs `social_unlink_watcher_inactive` warn, never scans, getStats returns zeros (lines 173-205). Preserve by NOT registering on the scanner when inactive.
- auto-post-worker: dispatch by kind — CallSettled outcome 1/2 → processCall(expectedVariant 'settled', outcomeWord via settledOutcomeWord); CallerExited → processCall(expectedVariant 'caller-exited', outcomeWord 'CALLER EXITED', caller lowercased). Per-event try/catch increments its own `errors` (lines 381-426). processCall and all its test seams (fetchImpl, sleepImpl, resolveHandle) are UNTOUCHED.
- Existing tests: `__tests__/auto-post-worker.test.ts` (10 its) constructs the worker with a publicClient mock ({ getBlockNumber → 100n, getLogs → [] }) and intervalMs 1_000_000 (never ticks), drives `processCall` directly, and calls `worker.stop()`. notification-fanout and social-unlink-watcher have NO test files. Keeping `scanner` OPTIONAL in worker configs (internal-scanner fallback) lets this suite pass with zero-or-minimal edits.
- viem 2.50.4 `getLogs` accepts `address: Address[]` AND `events: AbiEvent[]` together (topics OR'd across events; decoded logs carry `eventName` + `args`; default strict:false so undecodable logs have undefined args — every handler already guards `if (!args || ...) return`).
- Cross-product note: a merged (3-address × 3-event) filter can in theory return noise pairs (e.g., a CallSettled-shaped topic from FFM). Dispatch MUST filter by (lowercased address, event) registration pairs and silently drop non-matching logs.
- Ordering note: within a window the merged getLogs returns logs in chain order (block, logIndex) interleaved across addresses, whereas auto-post today processes settledLogs then exitedLogs per window. Per-call processing is independent and idempotent (posted_receipts dedup) — chain-order dispatch is acceptable and documented as such.
- Gates: package name `@call-it/relayer`; `pnpm --filter @call-it/relayer test` (vitest run) and `pnpm --filter @call-it/relayer build` (tsc --build). Build `@call-it/shared` first defensively (workspace dep, dist gitignored).
- PARALLEL SESSION CAUTION: another Claude session may be active in this repo (settlement-poller is its fresh work). Before EACH edit, if the file content differs from what this plan quotes (line numbers shifted, new code present), re-read the full file and re-locate the anchors. Never rebase/reset/checkout anything.

**EXPLICITLY OUT OF SCOPE (do not touch):** apps/web (5s polls are intentional UX), apps/relayer/src/workers/settlement-poller.ts (parallel session's work), polled-events-fallback.ts (unwired), duel-king-worker.ts / duel-trending-worker.ts (subgraph-based, no RPC burn), packages/*.
</diagnosis>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: chain-scanner.ts — shared single-cursor scanner with subscriber registration (TDD)</name>
  <files>apps/relayer/src/workers/chain-scanner.ts, apps/relayer/src/workers/__tests__/chain-scanner.test.ts</files>
  <behavior>
    chain-scanner.test.ts (vitest; publicClient mocked via vi.fn getBlockNumber/getLogs; drive ticks deterministically — export a test seam `tickNow(): Promise<void>` on the handle OR construct with a huge intervalMs and call the exposed tick; save/restore the env vars touched in beforeEach/afterEach):
    - Window chunking math: seed head 1000n, next tick head 1000n+1234n, span 500 → getLogs called with exactly [1001..1500], [1501..2000], [2001..2234]; cursor ends at 2234n.
    - Single merged call shape: with three registrations (addrA/eventX, addrB/eventY, addrC/eventZ), each window issues ONE getLogs whose `address` array contains all three addresses and `events` array all three AbiEvents — never one call per registration.
    - Dispatch by address+event: getLogs returns [log(addrA,eventX), log(addrB,eventY), log(addrA,eventY)] → handlerX receives only the first, handlerY only the second; the cross-product noise log (addrA,eventY) is dropped (no handler call). Address matching is case-insensitive (mixed-case log.address still dispatches).
    - WR-05 init guard: getBlockNumber rejects at init → getLogs is NEVER called; first tick re-seeds (getBlockNumber resolves 5000n) and SKIPS scanning that tick (no getLogs, matching the per-worker init_recovered semantics); the following tick scans from 5001n. fromBlock is never 0n/1n in any test.
    - getLogs failure resilience: getLogs rejects on window 1 → cursor NOT advanced (same fromBlock retried next tick), error logged, tick does not throw.
    - Handler error isolation: handlerX throws → handlerY for a later log in the same window is still invoked, the window still advances (cursor = to), nothing propagates out of tick.
    - maxWindowsPerTick cap: span 10, head = cursor + 1000n, cap 50 → exactly 50 getLogs calls, cursor advanced by exactly 500n, a catching-up info event logged.
    - onTick callbacks: registered callback runs at the end of every initialized tick; ALSO runs when the per-tick getBlockNumber (head fetch) fails; does NOT run while the scanner is un-seeded (init never succeeded); a throwing onTick callback is caught and logged.
    - stop(): after stop(), the interval is cleared and a subsequent manual tick is a no-op (stopped guard) — no further getLogs.
    - Unregister: the function returned by register() removes the subscription — the next window's getLogs address/events arrays shrink accordingly and the handler is no longer invoked.
    - Env fallback order (span): CHAIN_SCANNER_BLOCK_SPAN=123 → 123n even when NOTIFICATION_FANOUT_BLOCK_SPAN=77; only NOTIFICATION_FANOUT_BLOCK_SPAN=77 → 77n; neither set → 500n; CHAIN_SCANNER_BLOCK_SPAN invalid ('abc' or '0') falls through to NOTIFICATION_FANOUT_BLOCK_SPAN, then 500n. Same ladder for maxWindowsPerTick with CHAIN_SCANNER_MAX_WINDOWS_PER_TICK / NOTIFICATION_FANOUT_MAX_WINDOWS_PER_TICK / 50.
  </behavior>
  <action>
    Write the test file FIRST per the behavior block, watch it fail (module absent), then implement apps/relayer/src/workers/chain-scanner.ts:

    Exports:
    - `interface ChainScannerConfig { publicClient: PublicClient; intervalMs?: number /* default 30_000 */; blockSpan?: bigint; maxWindowsPerTick?: number }` — explicit config values take precedence over the env ladder.
    - `interface LogSubscription { name: string; address: Address; event: AbiEvent; onLog: (log: Log) => Promise<void> }` (AbiEvent type from 'abitype' via viem — use `import type { AbiEvent } from 'viem'`).
    - `interface ChainScannerHandle { register(sub: LogSubscription): () => void; onTick(name: string, fn: () => Promise<void>): () => void; start(): void; stop(): void; getStats(): { lastBlockSeen: bigint; initialized: boolean; errors: number; subscriptions: number } }`
    - `export function createChainScanner(config: ChainScannerConfig): ChainScannerHandle`

    Tunables, resolved once at creation (replicate the existing parse-guard style from notification-fanout.ts:485-498 — Number.isFinite && > 0, floor, else fall through). Document this fallback order IN A COMMENT, plus the corrected rationale replacing the stale one:
    ```
    blockSpan:        config.blockSpan ?? CHAIN_SCANNER_BLOCK_SPAN ?? NOTIFICATION_FANOUT_BLOCK_SPAN ?? 500n
    maxWindowsPerTick: config.maxWindowsPerTick ?? CHAIN_SCANNER_MAX_WINDOWS_PER_TICK ?? NOTIFICATION_FANOUT_MAX_WINDOWS_PER_TICK ?? 50
    ```
    Comment content (corrects WR-05's stale claim): the old 9n span assumed "Alchemy free tier caps eth_getLogs at 10 blocks per request" — the actual free-tier cap is a 10K-block RANGE for filtered (address-scoped) queries; 500 is 20× under that cap and covers ~4 Sepolia ticks per window. Also note the legacy per-worker envs AUTO_POST_BLOCK_SPAN / SOCIAL_UNLINK_BLOCK_SPAN are retired by this module (their scan loops no longer exist).

    Tick loop (port the notification-fanout scan-loop skeleton, lines 500-661, into the shared module — it is the most complete of the three):
    1. State: `lastBlockSeen = 0n`, `initialized = false`, `errors = 0`, `stopped`, `intervalId`, `subscriptions: LogSubscription[]`, `tickCallbacks`.
    2. start(): idempotent; kicks the init-seed promise (getBlockNumber → lastBlockSeen, initialized = true; on failure log + errors++, leave initialized=false — WR-05) and sets the setInterval whose callback runs tick() with a final .catch safety net (mirror lines 681-688).
    3. tick(): if stopped → return. Await init promise. If !initialized → re-seed (getBlockNumber; success logs `chain_scanner_init_recovered` and RETURNS WITHOUT SCANNING — same as fanout lines 539-556; failure logs + errors++ + return). If initialized: fetch head once; on failure log `phase: 'get_head'`, errors++, then STILL run the onTick callbacks (matching fanout's get_head-failure path lines 577-588) and return. Then the window loop: `while (lastBlockSeen < head && windows < maxWindowsPerTick && !stopped)` — from = lastBlockSeen+1n, to = min(from+span-1n, head); ONE `publicClient.getLogs({ address: [unique addresses of all subscriptions], events: [unique events of all subscriptions], fromBlock: from, toBlock: to })`; on getLogs failure log + errors++ + BREAK without advancing (retry same window next tick). For each returned log, find matching subscriptions where `sub.address.toLowerCase() === log.address.toLowerCase() && sub.event.name === (log as {eventName?: string}).eventName`; invoke each match's onLog inside try/catch (log with the subscription name + errors++ on throw; NEVER rethrow; continue). Logs matching no subscription are dropped silently (debug-level at most). After the per-log loop: `lastBlockSeen = to; windows++`. After the while loop: if backlog remains and the cap was hit, log a `chain_scanner_catching_up` info (mirror lines 652-661). Finally run every onTick callback in its own try/catch.
    4. Empty-subscription guard: if `subscriptions.length === 0`, skip the head fetch + window loop entirely (zero RPC) but still run onTick callbacks once initialized.
    5. register()/onTick() return unregister functions (splice by identity). stop() mirrors the existing workers (stopped=true, clearInterval).
    6. Logging via `logger` from '../lib/logger.js' with `event: 'chain_scanner_*'` names mirroring the fanout taxonomy (started, tick, init_recovered, catching_up, error+phase).

    Keep the module pure of worker concerns: no DB, no Redis, no subgraph imports — publicClient + pino only.
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/relayer exec vitest run src/workers/__tests__/chain-scanner.test.ts</automated>
  </verify>
  <done>chain-scanner.test.ts fully green; the module issues one merged getLogs per window; WR-05 guard, error resilience, stop(), unregister, onTick semantics, and the env fallback ladder are all pinned by tests; no DB/Redis/subgraph imports in chain-scanner.ts.</done>
</task>

<task type="auto">
  <name>Task 2: Refactor the three workers onto the shared scanner — identical handler semantics</name>
  <files>apps/relayer/src/workers/notification-fanout.ts, apps/relayer/src/workers/social-unlink-watcher.ts, apps/relayer/src/workers/auto-post-worker.ts, apps/relayer/src/workers/__tests__/auto-post-worker.test.ts</files>
  <action>
    PARALLEL-SESSION GUARD: before editing each file, confirm it still matches the content quoted in <diagnosis>; if it looks newer, re-read fully and re-anchor. Do not touch settlement-poller.ts / polled-events-fallback.ts / duel-*-worker.ts.

    Common pattern for all three workers — config gains `scanner?: ChainScannerHandle` (import type from './chain-scanner.js'):
    - When `scanner` is provided (production path): the worker does NOT create any interval or scan loop. It calls `scanner.register(...)` for its (address, event) pair(s) with an onLog handler containing EXACTLY the existing per-event processing body, keeps its own `totalEventsProcessed`/`totalPosted`/`errors` counters inside that handler (existing per-event try/catch moves INTO the handler unchanged), and its handle becomes: `stop()` → call the unregister function(s); `getStats()` → same shape as today with `lastBlockSeen` read from `scanner.getStats().lastBlockSeen` (document in a comment: scan-level errors now live in scanner stats; worker `errors` counts its own processing failures).
    - When `scanner` is absent (back-compat / unit-test path): the worker lazily creates a PRIVATE scanner via `createChainScanner({ publicClient, intervalMs })`, registers on it identically, calls its start(), and `stop()` stops the private scanner (it owns it). This keeps `startX(config)` signatures and the existing test construction working.
    - The old per-worker scan-loop code (initPromise, tick(), setInterval, blockSpan/maxWindowsPerTick tunables, get_head/get_logs plumbing) is DELETED from each worker. Delete the env reads for SOCIAL_UNLINK_BLOCK_SPAN and AUTO_POST_BLOCK_SPAN with them (retired — noted in the scanner comment). Update each worker's header doc-comment (the "chunked viem getLogs / ≤9-block windows" prose) to say it subscribes to the shared chain-scanner.

    Per worker specifics:
    1. notification-fanout.ts: ONE registration { name: 'notification-fanout', address: ffmAddress, event: CALLER_EXITED_EVENT, onLog: processCallerExitedEvent(log, config) wrapped in the existing try/catch (totalEventsProcessed++ on success, errors++ + log on throw — lines 623-643 body) }. The challenge-notification pass becomes `scanner.onTick('notification-fanout-challenges', ...)` with the existing guard + non-fatal catch (lines 666-677): skipped when `config.subgraphUrl` is empty. Keep startup log `notification_fanout_started`. DELETE the local blockSpan/maxWindowsPerTick block (lines 481-498) including the stale 10-blocks comment — the corrected comment lives in chain-scanner.ts (Task 1). resolveCallerHandle and everything below the scan loop are untouched.
    2. social-unlink-watcher.ts: keep the zero-address inactive guard — when inactive, log `social_unlink_watcher_inactive`, register NOTHING, return a handle whose stop() is a no-op and getStats() returns zeros (current behavior). When active: ONE registration { name: 'social-unlink-watcher', address: profileRegistryAddress, event: SOCIAL_UNLINKED_EVENT, onLog: processSocialUnlinked wrapped in the existing try/catch (lines 259-271 body) }. Keep `social_unlink_watcher_started` log on registration.
    3. auto-post-worker.ts: TWO registrations — { name: 'auto-post:settled', address: settlementManagerAddress, event: CALL_SETTLED_EVENT, onLog → the kind='settled' branch of processLogs (outcome 1/2 filter, settledOutcomeWord, expectedVariant 'settled') } and { name: 'auto-post:caller-exited', address: ffmAddress, event: CALLER_EXITED_EVENT, onLog → the kind='caller-exited' branch }. Keep per-log try/catch with errors++ and totalPosted++ exactly as in processLogs (lines 385-425); drop the now-dead lastBlockSeen-from-log tracking (cursor is the scanner's). processCall, makeProcessCall, runCacheWarm, all test seams, and the handle's processCall export are UNTOUCHED. NOTE in a comment: settled/exited logs now arrive in chain order interleaved (was settled-then-exited per window) — per-call processing is independent + posted_receipts-deduped, so ordering is immaterial.

    Tests: run the full relayer suite. auto-post-worker.test.ts should pass via the private-scanner fallback (its publicClient mock already provides getBlockNumber/getLogs; intervalMs 1_000_000 never ticks; processCall is driven directly). If any test needs adaptation because the scan loop moved (e.g., a stop() expectation), adapt the MECHANICS only — handler-level assertions (what gets posted/written for a given log) must remain unweakened. Optionally add to chain-scanner.test.ts or a small new describe: startNotificationFanout/startSocialUnlinkWatcher/startAutoPostWorker with an injected FAKE scanner record the expected (address, event.name) registration pairs — fanout 1 (FFM/CallerExited) + onTick 1, unlink 1 (PR/SocialUnlinked) or 0 when zero-address, auto-post 2 — and stop() invokes the unregister functions.
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/relayer test && bash -c "! grep -q 'setInterval' apps/relayer/src/workers/notification-fanout.ts && ! grep -q 'setInterval' apps/relayer/src/workers/social-unlink-watcher.ts && ! grep -q 'setInterval' apps/relayer/src/workers/auto-post-worker.ts && ! grep -q '10 blocks per request' apps/relayer/src/workers/notification-fanout.ts && grep -q 'scanner.register\|scanner\.register' apps/relayer/src/workers/notification-fanout.ts && echo GATES-OK"</automated>
  </verify>
  <done>Full relayer vitest suite green (auto-post handler-level assertions unweakened); no setInterval/scan loop remains in any of the three workers; each registers on the scanner (injected or private fallback); fanout's challenge notifications ride scanner.onTick; unlink's zero-address guard and auto-post's processCall seam intact; stale 10-blocks comment gone.</done>
</task>

<task type="auto">
  <name>Task 3: index.ts wiring (one shared scanner) + build/test gates + atomic commit</name>
  <files>apps/relayer/src/index.ts</files>
  <action>
    PARALLEL-SESSION GUARD: re-read index.ts immediately before editing (the settlement-poller session touched it recently — quoted line numbers may have shifted; anchor on the startNotificationFanout/startSocialUnlinkWatcher/startAutoPostWorker call sites, currently ~290/~337/~415).

    1. Import `createChainScanner` (and the handle type) from './workers/chain-scanner.js' alongside the existing worker imports (~lines 62-75).
    2. After `notificationFanoutClient` is created (~line 222), create ONE shared scanner: `const chainScanner = createChainScanner({ publicClient: notificationFanoutClient, intervalMs: 30_000 });` with a comment: quick-260611-o5b — single merged getLogs scan loop replacing 3 independent worker loops (~56 getLogs/tick → 1; Alchemy CU burn fix). Track a `let chainScannerStarted = false` or just call start() unconditionally in onReady (start() is idempotent per Task 1).
    3. In the onReady hook: pass `scanner: chainScanner` into the startNotificationFanout config (~290), the startSocialUnlinkWatcher config (~337), and the startAutoPostWorker config (~415). Leave each worker's existing try/catch + enable-flag gating (AUTO_POST_ENABLED) untouched. The `intervalMs: 30_000` fields may stay (used only by the private-scanner fallback). After the three start* blocks, call `chainScanner.start()` inside its own try/catch with an `app.log.info({ event: 'chain_scanner_started' }, ...)`.
    4. In the existing onClose hook (~line 458, where settlementWatcherHandle is stopped): add `chainScanner.stop()` (guarded try/catch) so Fastify shutdown tears the interval down.
    5. Gates, in order (repo root, Git Bash):
       a. `pnpm --filter @call-it/shared build` (defensive — workspace dep, dist gitignored)
       b. `pnpm --filter @call-it/relayer build` (tsc --build) — green
       c. `pnpm --filter @call-it/relayer test` (vitest run) — full suite green
    6. Untouched-tree assertion: `git status --porcelain -- apps/web packages apps/relayer/src/workers/settlement-poller.ts apps/relayer/src/workers/polled-events-fallback.ts apps/relayer/src/workers/duel-king-worker.ts apps/relayer/src/workers/duel-trending-worker.ts` must output NOTHING. If it does, revert those paths.
    7. Atomic commit to master. Stage ONLY these seven paths explicitly (NEVER git add -A / git add . — the worktree carries unrelated dirt: 'call it frontend/', docs/, evidence/, .planning/, soak scripts, submodule):
       apps/relayer/src/workers/chain-scanner.ts, apps/relayer/src/workers/notification-fanout.ts, apps/relayer/src/workers/social-unlink-watcher.ts, apps/relayer/src/workers/auto-post-worker.ts, apps/relayer/src/index.ts, apps/relayer/src/workers/__tests__/chain-scanner.test.ts, apps/relayer/src/workers/__tests__/auto-post-worker.test.ts (the last only if it was actually modified in Task 2).
       Commit message EXACTLY: fix(quick-260611-o5b): merge relayer event watchers into one chain-scanner — 1 getLogs/tick at 500-block windows (Alchemy CU burn)
       After committing: `git status --porcelain` shows no staged leftovers; `git show --stat HEAD` lists exactly the staged files. DO NOT PUSH — the orchestrator pushes and redeploys the relayer (Fly deploy is a separate operator gate; master push only auto-deploys web).
    8. Write SUMMARY.md in .planning/quick/260611-o5b-alchemy-rpc-burn/ (UNCOMMITTED — orchestrator commits docs): the before/after RPC math (≈56 getLogs + 3 getBlockNumber per 30s → 1 + 1), the env fallback ladder, the retired envs (AUTO_POST_BLOCK_SPAN, SOCIAL_UNLINK_BLOCK_SPAN), per-file changes, test counts before/after, commit hash, and the deploy handoff note: the fix only takes effect on Fly after `flyctl deploy -a call-it-relayer-sepolia --config apps/relayer/fly.toml --dockerfile apps/relayer/Dockerfile .` from repo root (the known-working deploy path; the gh workflow is broken — missing FLY_API_TOKEN).
  </action>
  <verify>
    <automated>cd "C:/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/shared build && pnpm --filter @call-it/relayer build && pnpm --filter @call-it/relayer test && bash -c "test -z \"$(git status --porcelain -- apps/web packages apps/relayer/src/workers/settlement-poller.ts apps/relayer/src/workers/polled-events-fallback.ts)\" && git show --stat HEAD | grep -q 'fix(quick-260611-o5b)' && echo FINAL-GATES-OK"</automated>
  </verify>
  <done>Relayer build + full test suite green; index.ts creates exactly one chainScanner shared by all three workers, started in onReady and stopped in onClose; out-of-scope files byte-identical to HEAD~1; exactly one commit on master with the exact message, NOT pushed; SUMMARY.md written in the task dir and left uncommitted.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| chain → relayer (getLogs results) | Untrusted on-chain event data crosses into handler logic; merged multi-address filter widens what one response can carry |
| env → scanner tunables | Operator-controlled span/cap values parsed into the scan loop |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-o5b-01 | Spoofing | merged getLogs cross-product (event topic X from contract Y) | mitigate | Scanner dispatches ONLY on exact (registered address, registered event) pairs; non-matching logs dropped; pinned by the dispatch unit test |
| T-o5b-02 | Denial of Service | 500-block windows returning large log batches | mitigate | maxWindowsPerTick cap (50) bounds per-tick work; per-log handler try/catch keeps the interval alive; existing per-event DB batching (100) and dedup unchanged |
| T-o5b-03 | Tampering | env-derived blockSpan/maxWindows (invalid/hostile values) | mitigate | Same Number.isFinite && > 0 parse guards as today; invalid values fall through the documented ladder to safe defaults (500/50); pinned by env-fallback tests |
| T-o5b-04 | Repudiation | shared cursor skipping events on init failure | mitigate | WR-05 guard ported verbatim: never scan from block 1, re-seed from head next tick; pinned by the init-guard unit test; downstream idempotency (ON CONFLICT DO NOTHING, posted_receipts) absorbs any replay |
| T-o5b-SC | Tampering | npm/pip/cargo installs | accept | NO new packages — chain-scanner.ts uses only existing deps (viem, pino); supply-chain surface unchanged |
</threat_model>

<verification>
1. `pnpm --filter @call-it/relayer test` — full suite green: all pre-existing test files (auto-post-worker.test.ts handler assertions unweakened) + new chain-scanner.test.ts.
2. `pnpm --filter @call-it/relayer build` — green (after defensive `pnpm --filter @call-it/shared build`).
3. Grep gates: no `setInterval` left in the three refactored workers; no "10 blocks per request" stale comment; `scanner.register` present in all three.
4. `git status --porcelain` clean for apps/web, packages/, settlement-poller.ts, polled-events-fallback.ts, duel-*-worker.ts.
5. Single commit on master: `fix(quick-260611-o5b): merge relayer event watchers into one chain-scanner — 1 getLogs/tick at 500-block windows (Alchemy CU burn)` — NOT pushed.

LIVE VERIFICATION IS THE ORCHESTRATOR'S JOB POST-DEPLOY (not this plan): after the Fly redeploy, confirm via Alchemy dashboard that getLogs volume drops ~30× and via relayer logs that `chain_scanner_tick` fires every 30s with single-window steady state.
</verification>

<success_criteria>
- One shared chain-scanner replaces the three independent scan loops: per 30s tick in steady state, exactly 1 eth_getBlockNumber + 1 merged eth_getLogs (address array: FFM + SettlementManager + ProfileRegistry; events: CallerExited + CallSettled + SocialUnlinked).
- Default span 500 blocks; env ladder CHAIN_SCANNER_* > NOTIFICATION_FANOUT_* > defaults (500/50), documented in a comment with the corrected Alchemy free-tier rationale (10K-block range, not 10 blocks/request).
- Zero behavior change at the handler level: identical DB writes/dedup, Redis bumps, alerts, cache-warm/post pipeline, 30s latency, WR-05 init guard, never-throw discipline, getStats shapes, stop() teardown, start*() public APIs.
- New scanner unit tests pin chunking math, merged-call shape, dispatch, WR-05, error resilience, cap, onTick, stop, unregister, and the env ladder.
- apps/web, packages/, settlement-poller.ts, polled-events-fallback.ts, duel workers untouched; one atomic commit, not pushed; SUMMARY.md in the task dir uncommitted.
</success_criteria>

<output>
- Code: one commit to master (chain-scanner.ts + 3 refactored workers + index.ts + tests), NOT pushed.
- Docs: `.planning/quick/260611-o5b-alchemy-rpc-burn/SUMMARY.md` — written, left uncommitted for the orchestrator.
</output>
