/**
 * fire-synthetic-alert.ts — CI helper for daily Telegram alert pipeline verification (D-16, Pitfall D)
 *
 * Usage:
 *   tsx scripts/fire-synthetic-alert.ts --event rep_fallback
 *   tsx scripts/fire-synthetic-alert.ts --event rep_fallback --seed-dashboards
 *
 * Flow:
 *   1. Generate a fresh UUID nonce + current timestamp
 *   2. Compute HMAC-SHA256 over {event, nonce, timestamp} with RELAYER_INTERNAL_HMAC_SECRET
 *   3. POST /internal/test-alert to the relayer
 *   4. Verify the relayer's SEND-CONFIRMATION response:
 *        success iff HTTP 200 AND body.ok === true AND body.nonce === <sent nonce>
 *        AND body.delivered !== false
 *      The relayer handler returns 200 ONLY after sendAlert() resolves — and sendAlert
 *      `await`s bot.sendMessage(...) and re-throws on failure (→ HTTP 500). So a 200 means
 *      Telegram accepted the send. We deliberately do NOT poll getUpdates: a bot cannot read
 *      its OWN outgoing messages via getUpdates (only incoming updates + channel posts where
 *      the bot is an admin), so getUpdates can never confirm a direct-message the bot sent.
 *      Send-confirmation is the correct end-to-end check for the DM alert setup (and works
 *      equally for a channel). The `delivered` field is tolerated-when-absent so this passes
 *      against a relayer that predates the explicit flag.
 *   5. If --seed-dashboards: emit synthetic Pino log lines for 5 Better Stack dashboard dimensions
 *
 * Required env vars:
 *   RELAYER_URL                  Base URL of the relayer (e.g. http://localhost:8080)
 *   RELAYER_INTERNAL_HMAC_SECRET HMAC secret shared with the relayer /internal/test-alert endpoint
 *
 * (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID_P0 are no longer needed here — the relayer holds the
 *  Telegram credentials and performs the send; CI only confirms the relayer's response.)
 *
 * Security (T-00-28):
 *   RELAYER_INTERNAL_HMAC_SECRET is sourced from GCP Secret Manager; never log it.
 *
 * CI integration:
 *   This script exits 0/1. CI workflow (.github/workflows/synthetic-alert.yml)
 *   treats exit 1 as a build failure — the alert pipeline IS broken.
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
  /** @deprecated Retained for CLI back-compat; verification no longer polls, so this is unused. */
  waitSeconds?: number;
  /** @deprecated Retained for CLI back-compat; verification no longer reads Telegram, so this is unused. */
  expectChatId?: string;
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
  const { event } = opts;
  const fetchFn = opts.fetchFn ?? fetch;
  const seedDashboards = opts.seedDashboards ?? false;

  const relayerUrl = process.env.RELAYER_URL;
  const hmacSecret = process.env.RELAYER_INTERNAL_HMAC_SECRET;

  if (!relayerUrl) return { success: false, exitCode: 1, error: 'RELAYER_URL not set' };
  if (!hmacSecret) return { success: false, exitCode: 1, error: 'RELAYER_INTERNAL_HMAC_SECRET not set' };

  // Step 1-2: nonce + timestamp + HMAC
  const nonce = generateNonce();
  const timestamp = Math.floor(Date.now() / 1000);
  const hmac = buildHmac(hmacSecret, { event, nonce, timestamp });

  // Step 3: POST the HMAC-signed synthetic alert to the relayer
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
    return { success: false, exitCode: 1, error: `Relayer connection error: ${msg}` };
  }

  if (!relayerResponse.ok) {
    let detail = `status ${relayerResponse.status}`;
    try {
      const errBody = (await relayerResponse.json()) as Record<string, unknown>;
      detail += ` — ${errBody.message ?? errBody.error ?? JSON.stringify(errBody)}`;
    } catch {
      // Ignore JSON parse error
    }
    return { success: false, exitCode: 1, nonce, error: `Relayer returned non-200: ${detail}` };
  }

  // Step 4: Verify delivery via the relayer's send-confirmation response.
  // The handler returns 200 ONLY after sendAlert() resolves — sendAlert awaits
  // bot.sendMessage() and re-throws on failure (which surfaces as the 500 handled
  // above). It echoes the nonce and (post-redeploy) `delivered: true`. A bot cannot
  // read its own outgoing DM via getUpdates, so this send-confirmation is the correct
  // end-to-end check for the DM alert setup.
  let body: Record<string, unknown>;
  try {
    body = (await relayerResponse.json()) as Record<string, unknown>;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, exitCode: 1, nonce, error: `Relayer 200 but body not JSON: ${msg}` };
  }

  const okFlag = body.ok === true;
  const nonceMatches = body.nonce === nonce;
  const notUndelivered = body.delivered !== false; // tolerant: absent => treat as delivered

  if (okFlag && nonceMatches && notUndelivered) {
    if (seedDashboards) emitDashboardSeedLogs();
    return { success: true, exitCode: 0, nonce };
  }

  return {
    success: false,
    exitCode: 1,
    nonce,
    error:
      `Relayer 200 but send not confirmed ` +
      `(ok=${String(body.ok)}, nonceMatch=${nonceMatches}, delivered=${String(body.delivered)}) ` +
      `— alert pipeline not verified`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      event: { type: 'string', default: 'rep_fallback' },
      // Accepted for back-compat; verification no longer waits/polls or reads Telegram.
      'wait-seconds': { type: 'string', default: '60' },
      'expect-chat-id': { type: 'string' },
      'seed-dashboards': { type: 'boolean', default: false },
    },
    strict: false,
  });

  const event = (values.event ?? 'rep_fallback') as AlertEvent;
  const waitSeconds = parseInt((values['wait-seconds'] as string) ?? '60', 10);
  const expectChatId = (values['expect-chat-id'] as string | undefined) ?? process.env.TELEGRAM_CHAT_ID_P0;
  const seedDashboards = values['seed-dashboards'] as boolean;

  console.error(`[fire-synthetic-alert] Firing ${event} alert; verifying relayer send-confirmation...`);

  const result = await fireAndVerify({ event, waitSeconds, expectChatId, seedDashboards });

  if (result.success) {
    console.error(`[fire-synthetic-alert] SUCCESS: relayer confirmed send of nonce ${result.nonce}`);
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
