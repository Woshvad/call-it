/**
 * fire-synthetic-alert.ts — CI helper for daily Telegram alert pipeline verification (D-16, Pitfall D)
 *
 * Usage:
 *   tsx scripts/fire-synthetic-alert.ts --event rep_fallback --wait-seconds 60
 *   tsx scripts/fire-synthetic-alert.ts --event rep_fallback --wait-seconds 60 --expect-chat-id "-1001234567890"
 *   tsx scripts/fire-synthetic-alert.ts --event rep_fallback --wait-seconds 60 --seed-dashboards
 *
 * Flow:
 *   1. Generate fresh UUID nonce + current timestamp
 *   2. Compute HMAC-SHA256 over {event, nonce, timestamp} with RELAYER_INTERNAL_HMAC_SECRET
 *   3. POST /internal/test-alert to relayer — if non-200, exit 1 (build-failer)
 *   4. Poll Telegram getUpdates every 5s up to --wait-seconds
 *      If nonce found in P0 channel → exit 0
 *      If timeout → exit 1 with "Nonce not seen in P0 channel within Xs — alert pipeline broken"
 *   5. If --seed-dashboards: emit synthetic Pino log lines for 5 Better Stack dashboard dimensions
 *
 * Required env vars:
 *   RELAYER_URL                  Base URL of the relayer (e.g. http://localhost:8080)
 *   RELAYER_INTERNAL_HMAC_SECRET HMAC secret shared with relayer /internal/test-alert endpoint
 *   TELEGRAM_BOT_TOKEN           Telegram bot token (must have getUpdates permission on P0 channel)
 *   TELEGRAM_CHAT_ID_P0          P0 channel chat ID (negative for channels, e.g. -1001234567890)
 *
 * Security (T-00-28):
 *   RELAYER_INTERNAL_HMAC_SECRET is sourced from GCP Secret Manager; never log it.
 *   TELEGRAM_BOT_TOKEN is sourced from GCP Secret Manager; never log it.
 *
 * CI integration:
 *   This script exits 0/1. CI workflow (.github/workflows/synthetic-alert.yml)
 *   treats exit 1 as a build failure — the alert pipeline IS broken.
 *
 * Open Question 5 (resolved): Telegram bot getUpdates requires the bot to be added as
 *   an administrator of the P0 channel (not just a member). The bot must have "Post Messages"
 *   and "Read Messages" admin rights. Without these, getUpdates returns empty even when
 *   the bot's own messages appear.
 */

import { createHmac, randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AlertEvent =
  | 'pause'
  | 'dispute_raised'
  | 'force_settle'
  | 'rep_fallback'
  | 'settle_failed'
  | 'stylus_reactivation'
  | 'paymaster_80'
  | 'tvl_approach'
  | 'settle_stuck_25m';

export interface FireAndVerifyOptions {
  event: AlertEvent;
  waitSeconds: number;
  expectChatId: string;
  seedDashboards?: boolean;
  fetchFn?: typeof fetch; // Injectable for testing
}

export interface FireAndVerifyResult {
  success: boolean;
  exitCode: 0 | 1;
  nonce?: string;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (exported for unit tests)
// ─────────────────────────────────────────────────────────────────────────────

/** Generate a fresh UUID nonce (v4). Each invocation returns a unique value. */
export function generateNonce(): string {
  return randomUUID();
}

/**
 * Compute HMAC-SHA256 over JSON.stringify({event, nonce, timestamp}).
 * Must match the computation in apps/relayer/src/workers/synthetic-event-handler.ts.
 */
export function buildHmac(
  secret: string,
  body: { event: string; nonce: string; timestamp: number },
): string {
  const payload = JSON.stringify({ event: body.event, nonce: body.nonce, timestamp: body.timestamp });
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Parse Telegram getUpdates response and check if any message in the given chat
 * contains `nonce:<expectedNonce>` or the nonce as part of a JSON payload.
 */
export function nonceFoundInUpdates(
  updates: unknown[],
  expectedNonce: string,
  expectChatId: string,
): boolean {
  const chatIdNum = parseInt(expectChatId, 10);

  for (const update of updates as Record<string, unknown>[]) {
    const post = update.channel_post as Record<string, unknown> | undefined;
    if (!post) continue;

    const chat = post.chat as Record<string, unknown> | undefined;
    if (!chat) continue;

    const chatId = chat.id;
    if (chatId !== chatIdNum && String(chatId) !== expectChatId) continue;

    const text = (post.text as string) ?? '';
    // Match nonce in various formats:
    // - "nonce:uuid" (our injected format)
    // - JSON {"nonce":"uuid"} embedded in the Telegram message
    if (text.includes(`nonce:${expectedNonce}`) || text.includes(`"nonce":"${expectedNonce}"`) || text.includes(`"nonce": "${expectedNonce}"`)) {
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Synthetic Pino log lines for Better Stack dashboard seeding (OPS-06)
// ─────────────────────────────────────────────────────────────────────────────

function emitDashboardSeedLogs(): void {
  const now = new Date().toISOString();

  // 5 Better Stack dashboard data dimensions (Pino structured log format)
  const syntheticEvents = [
    { event: 'tvl_snapshot', totalTvl: 1250.0, callRegistryTvl: 800.0, followFadeMarketTvl: 350.0, challengeEscrowTvl: 100.0, synthetic: true, ts: now },
    { event: 'call_created', callId: 'synthetic-001', asset: 'BTC/USD', stake: 25.0, synthetic: true, ts: now },
    { event: 'call_settled', callId: 'synthetic-001', settledAt: Math.floor(Date.now() / 1000), expiry: Math.floor(Date.now() / 1000) - 900, settleLatencyMs: 900_000, synthetic: true, ts: now },
    { event: 'dispute_raised', callId: 'synthetic-001', disputeType: 'price_confidence', synthetic: true, ts: now },
    { level: 'error', component: 'relayer', errorType: 'pyth_confidence_wide', callId: 'synthetic-001', synthetic: true, ts: now },
  ];

  for (const entry of syntheticEvents) {
    // Emit as JSON Pino log lines — Better Stack ingests these
    process.stdout.write(JSON.stringify({ ...entry, time: Date.now() }) + '\n');
  }

  console.error('[fire-synthetic-alert] Dashboard seed logs emitted (5 synthetic events for Better Stack)');
}

// ─────────────────────────────────────────────────────────────────────────────
// Core fire-and-verify logic (exported for unit tests)
// ─────────────────────────────────────────────────────────────────────────────

export async function fireAndVerify(opts: FireAndVerifyOptions): Promise<FireAndVerifyResult> {
  const { event, waitSeconds, expectChatId, seedDashboards = false } = opts;
  const fetchFn = opts.fetchFn ?? fetch;

  const relayerUrl = process.env.RELAYER_URL;
  const hmacSecret = process.env.RELAYER_INTERNAL_HMAC_SECRET;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!relayerUrl) return { success: false, exitCode: 1, error: 'RELAYER_URL not set' };
  if (!hmacSecret) return { success: false, exitCode: 1, error: 'RELAYER_INTERNAL_HMAC_SECRET not set' };
  if (!botToken) return { success: false, exitCode: 1, error: 'TELEGRAM_BOT_TOKEN not set' };

  // Step 1: Generate nonce + timestamp
  const nonce = generateNonce();
  const timestamp = Math.floor(Date.now() / 1000);

  // Step 2: Compute HMAC
  const hmac = buildHmac(hmacSecret, { event, nonce, timestamp });

  // Step 3: POST to relayer /internal/test-alert
  let relayerResponse: Response;
  try {
    relayerResponse = await fetchFn(`${relayerUrl}/internal/test-alert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-HMAC': hmac,
      },
      body: JSON.stringify({ event, nonce, timestamp }),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      exitCode: 1,
      error: `Relayer connection error: ${msg}`,
    };
  }

  if (!relayerResponse.ok) {
    let detail = `status ${relayerResponse.status}`;
    try {
      const body = await relayerResponse.json() as Record<string, unknown>;
      detail += ` — ${body.message ?? body.error ?? JSON.stringify(body)}`;
    } catch {
      // Ignore JSON parse error
    }
    return {
      success: false,
      exitCode: 1,
      error: `Relayer returned non-200: ${detail}`,
    };
  }

  // Step 4: Poll Telegram getUpdates every 5s up to waitSeconds
  const pollIntervalMs = 5_000;
  const deadline = Date.now() + waitSeconds * 1000;
  const telegramApiBase = `https://api.telegram.org/bot${botToken}`;

  while (Date.now() < deadline) {
    // Poll getUpdates with offset=-100 to get recent messages
    let updatesResponse: Response;
    try {
      updatesResponse = await fetchFn(`${telegramApiBase}/getUpdates?offset=-100&limit=50`);
    } catch {
      // Network error during polling — wait and retry
      await sleep(pollIntervalMs);
      continue;
    }

    if (updatesResponse.ok) {
      const data = await updatesResponse.json() as { ok: boolean; result: unknown[] };
      if (data.ok && nonceFoundInUpdates(data.result, nonce, expectChatId)) {
        // Nonce found — alert pipeline confirmed working
        if (seedDashboards) emitDashboardSeedLogs();
        return { success: true, exitCode: 0, nonce };
      }
    }

    await sleep(pollIntervalMs);
  }

  // Timeout — nonce never seen
  const channelId = expectChatId;
  return {
    success: false,
    exitCode: 1,
    nonce,
    error: `Nonce not seen in P0 channel (${channelId}) within ${waitSeconds}s — alert pipeline broken`,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      event: { type: 'string', default: 'rep_fallback' },
      'wait-seconds': { type: 'string', default: '60' },
      'expect-chat-id': { type: 'string' },
      'seed-dashboards': { type: 'boolean', default: false },
    },
    strict: false,
  });

  const event = (values.event ?? 'rep_fallback') as AlertEvent;
  const waitSeconds = parseInt(values['wait-seconds'] as string ?? '60', 10);
  const expectChatId = (values['expect-chat-id'] as string | undefined) ?? process.env.TELEGRAM_CHAT_ID_P0 ?? '';
  const seedDashboards = values['seed-dashboards'] as boolean;

  if (!expectChatId) {
    console.error('Error: --expect-chat-id or TELEGRAM_CHAT_ID_P0 env var required');
    process.exit(1);
  }

  console.error(`[fire-synthetic-alert] Firing ${event} alert, waiting ${waitSeconds}s for Telegram confirmation...`);

  const result = await fireAndVerify({ event, waitSeconds, expectChatId, seedDashboards });

  if (result.success) {
    console.error(`[fire-synthetic-alert] SUCCESS: Nonce ${result.nonce} confirmed in P0 channel`);
    process.exit(0);
  } else {
    console.error(`[fire-synthetic-alert] FAILURE: ${result.error}`);
    process.exit(1);
  }
}

// Only run main() when invoked directly
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('fire-synthetic-alert.ts') ||
    process.argv[1].endsWith('fire-synthetic-alert.js'));

if (isMain) {
  main();
}
