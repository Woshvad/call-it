/**
 * 9-event Telegram alert dispatcher with P0/P1 channel routing (D-15, OPS-07..14).
 *
 * P0 (TELEGRAM_CHAT_ID_P0) — paged immediately, 6 events:
 *   pause, dispute_raised, force_settle, rep_fallback, settle_failed, stylus_reactivation
 *
 * P1 (TELEGRAM_CHAT_ID_P1) — digest, 3 events:
 *   paymaster_80, tvl_approach, settle_stuck_25m
 *
 * Alert message format (Markdown):
 *   🚨 P0 *{event}*
 *   ```json
 *   { ...payload }
 *   ```
 *
 * Special case: rep_fallback appends a runbook link (OPS-25).
 *
 * Security (T-00-15):
 * - TELEGRAM_BOT_TOKEN is never logged (Pino redact config in logger.ts)
 * - Token fetched from env at first sendAlert() call (lazy init)
 *
 * Interface exported for Plan 00-03 and Plan 00-04:
 *   export type AlertEvent
 *   export const P0_EVENTS: ReadonlySet<AlertEvent>
 *   export async function sendAlert(event: AlertEvent, payload: Record<string, unknown>): Promise<void>
 */

import TelegramBot from 'node-telegram-bot-api';
import { getLogger } from '../lib/logger.js';

/**
 * All 9 alert events (9-member union).
 *
 * Adding a new event requires:
 * 1. Add to this union
 * 2. Decide P0 vs P1 routing (update P0_EVENTS if P0)
 * 3. Add to test coverage in test/alerts.test.ts
 */
export type AlertEvent =
  | 'pause'               // OPS-08 — registry paused by owner
  | 'dispute_raised'       // OPS-09 — settlement disputed
  | 'force_settle'         // OPS-13 — forceSettle escape hatch invoked
  | 'rep_fallback'         // OPS-12 — rep engine fell back to Solidity baseline
  | 'settle_failed'        // OPS-07 — settlement failed after 30 Pyth retries
  | 'stylus_reactivation'  // D-13   — Stylus WASM being reactivated (belt-and-suspenders)
  | 'paymaster_80'         // OPS-10 — daily cap 80% threshold crossed
  | 'tvl_approach'         // OPS-11 — TVL approaching $5K initial cap
  | 'settle_stuck_25m';    // OPS-14 — settlement stuck >25 minutes

/**
 * P0 events (page immediately to TELEGRAM_CHAT_ID_P0).
 * P1 events go to TELEGRAM_CHAT_ID_P1 (digest channel).
 */
export const P0_EVENTS: ReadonlySet<AlertEvent> = new Set<AlertEvent>([
  'pause',
  'dispute_raised',
  'force_settle',
  'rep_fallback',
  'settle_failed',
  'stylus_reactivation',
]);

// Lazy bot singleton — initialized on first sendAlert call
let _bot: TelegramBot | undefined;
let _chatIdP0: string | undefined;
let _chatIdP1: string | undefined;

function getBot(): TelegramBot {
  if (_bot) return _bot;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set — sendAlert cannot proceed');
  }

  _chatIdP0 = process.env.TELEGRAM_CHAT_ID_P0;
  _chatIdP1 = process.env.TELEGRAM_CHAT_ID_P1;

  if (!_chatIdP0 || !_chatIdP1) {
    throw new Error('TELEGRAM_CHAT_ID_P0 and TELEGRAM_CHAT_ID_P1 must be set');
  }

  _bot = new TelegramBot(token, { polling: false });
  return _bot;
}

/**
 * Format a Telegram Markdown alert message.
 * Rep_fallback appends a runbook link (OPS-25).
 */
function formatAlertMessage(event: AlertEvent, payload: Record<string, unknown>): string {
  const isP0 = P0_EVENTS.has(event);
  const tier = isP0 ? '🚨 P0' : '📊 P1';

  let text = `${tier} *${event}*\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;

  // OPS-25: rep_fallback must include the runbook link for manual compensation
  if (event === 'rep_fallback') {
    text +=
      '\n\n[Compensation runbook](https://github.com/call-it-xyz/call-it/blob/main/docs/runbooks/relayer-key-rotation.md#manual-rep-compensation)';
  }

  return text;
}

/**
 * Send an alert to the appropriate Telegram channel.
 *
 * P0 events → TELEGRAM_CHAT_ID_P0 (paged immediately)
 * P1 events → TELEGRAM_CHAT_ID_P1 (digest)
 *
 * @param event - one of the 9 AlertEvent types
 * @param payload - arbitrary context to include in the message body
 */
export async function sendAlert(
  event: AlertEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  const bot = getBot();
  const isP0 = P0_EVENTS.has(event);
  const chatId = isP0 ? (_chatIdP0 ?? process.env.TELEGRAM_CHAT_ID_P0!) : (_chatIdP1 ?? process.env.TELEGRAM_CHAT_ID_P1!);
  const text = formatAlertMessage(event, payload);

  try {
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    getLogger().info({ event: 'telegram_alert_sent', alertEvent: event, chatId, isP0 }, 'Alert sent');
  } catch (err) {
    getLogger().error(
      { event: 'telegram_alert_failed', alertEvent: event, err: err instanceof Error ? err.message : String(err) },
      'Failed to send Telegram alert',
    );
    // Re-throw so callers can decide whether to retry (e.g. the synthetic-event handler)
    throw err;
  }
}

/**
 * Reset bot singleton (for testing only).
 * @internal
 */
export function _resetBotForTesting(): void {
  _bot = undefined;
  _chatIdP0 = undefined;
  _chatIdP1 = undefined;
}
