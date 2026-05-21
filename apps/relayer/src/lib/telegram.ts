/**
 * Telegram bot singleton (D-15).
 *
 * Lazily initializes a TelegramBot instance on first call to getBot().
 * The bot token is sourced from the loaded env (never from process.env directly —
 * all secrets come through GCP Secret Manager via env.ts, D-08).
 *
 * Security (T-00-15):
 * - TELEGRAM_BOT_TOKEN is redacted from Pino logs (T-00-11)
 * - Token rotation: update secret in GCP Secret Manager + restart relayer
 *   (documented in docs/runbooks/relayer-key-rotation.md)
 *
 * The sendAlert function lives in workers/alerts.ts — this module only
 * provides the bot instance factory.
 */

import TelegramBot from 'node-telegram-bot-api';

let _bot: TelegramBot | undefined;

/**
 * Returns the memoized TelegramBot instance.
 * Creates on first call using the token from process.env or injected env.
 *
 * @param token - TELEGRAM_BOT_TOKEN (pass from env to avoid circular deps)
 */
export function getBot(token?: string): TelegramBot {
  if (_bot) return _bot;

  const botToken = token ?? process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is not set — call getBot(env.TELEGRAM_BOT_TOKEN)');
  }

  // polling: false — relayer is a sender-only bot (receives via Fastify routes)
  _bot = new TelegramBot(botToken, { polling: false });
  return _bot;
}

/**
 * Reset the bot singleton (for testing only).
 * @internal
 */
export function _resetBotForTesting(): void {
  _bot = undefined;
}

/**
 * Inject a pre-built bot instance (for testing with vi.mock).
 * @internal
 */
export function _setBotForTesting(b: TelegramBot): void {
  _bot = b;
}
