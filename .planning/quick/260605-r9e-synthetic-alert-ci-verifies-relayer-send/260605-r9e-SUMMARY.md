---
phase: quick
plan: 260605-r9e
status: complete
subsystem: ci + relayer
tags: [synthetic-alert, telegram, ci, relayer, D-16]
requirements: [D-16]
key_files:
  modified:
    - apps/relayer/src/workers/synthetic-event-handler.ts
    - scripts/fire-synthetic-alert.ts
    - scripts/test/fire-synthetic-alert.test.ts
    - .github/workflows/synthetic-alert.yml
completed: 2026-06-05
---

# Quick Task 260605-r9e: Synthetic-alert CI verifies relayer send-confirmation (not getUpdates)

**The daily synthetic-alert cron failed every run because it polled Telegram `getUpdates` for the
nonce — but `TELEGRAM_CHAT_ID_P0` is the operator's private DM, and a bot cannot read its own
outgoing DM via `getUpdates`. Rewired the CI self-test to verify the relayer's send-confirmation
response (HTTP 200 + echoed nonce + `delivered`) instead, which is the correct end-to-end check for
DM delivery and works for a channel too.**

## Root cause (confirmed via the Telegram Bot API)
- `getChat(6070757637)` → `type:"private"` (DM with "Woshvad"); `getWebhookInfo.url` empty (no webhook).
- `getUpdates` only returns INCOMING updates + channel posts where the bot is an admin — never the
  bot's own outgoing DM. So the cron's nonce poll could never succeed. The live DM alerting itself
  works (the relayer → DM send is fine); only the self-test was structurally broken.
- `apps/relayer/src/workers/alerts.ts` `sendAlert` `await`s `bot.sendMessage` and **re-throws** on
  failure; the handler returns 200 only after it resolves (500 otherwise) → a 200 + echoed nonce is
  proof Telegram accepted the send.

## Changes
- **apps/relayer/src/workers/synthetic-event-handler.ts** — success branch now returns
  `{ ok: true, event, nonce, delivered: true }` (explicit delivery flag; 200 already implied it).
- **scripts/fire-synthetic-alert.ts** — `fireAndVerify` now verifies the relayer response: success iff
  `relayerResponse.ok && body.ok===true && body.nonce===<sent nonce> && body.delivered!==false`
  (tolerant — absent `delivered` still passes, so it works against the not-yet-redeployed relayer).
  Removed the getUpdates poll loop, `nonceFoundInUpdates` (+export), `sleep`, and the
  `TELEGRAM_BOT_TOKEN` requirement; `--wait-seconds`/`--expect-chat-id` kept for back-compat but unused.
  Header doc rewritten (why send-confirmation, not getUpdates).
- **scripts/test/fire-synthetic-alert.test.ts** — rewritten for the send-confirmation contract:
  200+nonce+delivered:true ⇒ pass; 200+nonce (no delivered) ⇒ pass (tolerant); nonce-mismatch ⇒ fail;
  delivered:false ⇒ fail; non-200 ⇒ fail with no second (Telegram) call. Kept generateNonce/buildHmac.
- **.github/workflows/synthetic-alert.yml** — dropped `--expect-chat-id` + the `TELEGRAM_BOT_TOKEN` /
  `TELEGRAM_CHAT_ID_P0` env (CI no longer calls Telegram); kept `RELAYER_URL` + `RELAYER_INTERNAL_HMAC`.
  Updated the header comment + job/step names. GH secrets left in place (harmless).

## Verification
- `pnpm --filter @call-it/scripts test` → **3 files, 38 passed / 2 skipped** (fire-synthetic-alert
  rewrite green; phase-0-smoke green — its "FAIL" lines are its own deliberate failure-mode test output).
- `pnpm -C apps/relayer build` → **clean** (`tsc --build`, exit 0).
- `pnpm -C apps/relayer test` → **136 passed / 1 skipped** (kms-roundtrip pre-existing skip) — 0 new failures.
- No relayer test asserts the synthetic handler's response body, so `delivered:true` is safe.

## Notes / deviations
- The two source edits (handler + fire-synthetic-alert.ts) were applied by a gsd-executor that ran
  but did not finish (no test/yaml/artifacts/commit); the planner had failed with a 1M-context
  usage-credit error, so the remaining work (test, workflow, verification, artifacts, commit) was
  completed inline.
- **No relayer redeploy required** for CI to pass (tolerant assertion). The explicit `delivered:true`
  flag becomes live whenever the relayer is next redeployed; until then the relayer returns
  `{ ok, event, nonce }` and the tolerant check still passes.

## Self-check: PASSED
- [x] CI script no longer references getUpdates / nonceFoundInUpdates
- [x] CI passes against a relayer that omits `delivered` (tolerant) and fails on non-200 / nonce-mismatch
- [x] scripts + relayer suites green; relayer build clean
- [x] synthetic-alert.yml no longer requires the Telegram secrets
