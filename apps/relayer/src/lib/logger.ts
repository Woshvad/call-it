/**
 * Pino logger with @logtail/pino transport and redaction config.
 *
 * Security (T-00-11, V7 ASVS):
 * - Redacts all listed secrets from log output so they never appear in Better Stack
 * - Transport is only active in production (NODE_ENV=production)
 * - In dev/test: logs stream to stdout as JSON (inspect with `jq`)
 *
 * Usage:
 *   import { createLogger } from './lib/logger.js';
 *   const logger = createLogger(env);
 */

import pino from 'pino';
import type { RelayerEnv } from '../types.js';

/** Pino redaction paths covering all sensitive fields (T-00-11) */
export const REDACT_PATHS: string[] = [
  'TELEGRAM_BOT_TOKEN',
  'PRIVY_APP_SECRET',
  'RELAYER_INTERNAL_HMAC',
  'UPSTASH_REDIS_REST_TOKEN',
  'PINATA_JWT',
  'BETTERSTACK_SOURCE_TOKEN',
  '*.privateKey',
  '*.private_key',
  'headers.authorization',
  'req.headers.authorization',
];

/**
 * Create the root Pino logger instance.
 *
 * In production: attaches @logtail/pino transport to ship logs to Better Stack.
 * In dev/test: streams to stdout as JSON (no transport).
 *
 * @param env - populated RelayerEnv from initEnv()
 */
export function createLogger(env: Pick<RelayerEnv, 'LOG_LEVEL' | 'NODE_ENV' | 'BETTERSTACK_SOURCE_TOKEN'>): pino.Logger {
  const isProduction = env.NODE_ENV === 'production';

  const options: pino.LoggerOptions = {
    level: env.LOG_LEVEL ?? 'info',
    redact: {
      paths: REDACT_PATHS,
      censor: '[Redacted]',
    },
  };

  if (isProduction && env.BETTERSTACK_SOURCE_TOKEN && !env.BETTERSTACK_SOURCE_TOKEN.startsWith('DEV_PLACEHOLDER')) {
    // Production: ship logs to Better Stack via @logtail/pino transport
    const transport = pino.transport({
      targets: [
        {
          target: '@logtail/pino',
          options: { sourceToken: env.BETTERSTACK_SOURCE_TOKEN },
          level: env.LOG_LEVEL ?? 'info',
        },
      ],
    });
    return pino(options, transport);
  }

  // Dev/test: plain stdout JSON (easily piped to `pino-pretty` for local dev)
  return pino(options);
}

// Module-level logger instance — created after initEnv() in index.ts
// For modules that import logger before env is ready, they should
// import createLogger and build their own instance, OR import this lazily.
let _logger: pino.Logger | undefined;

export function setLogger(l: pino.Logger): void {
  _logger = l;
}

export function getLogger(): pino.Logger {
  if (!_logger) {
    // Fallback for tests and early boot — plain Pino with no transport
    _logger = pino({ level: 'info', redact: { paths: REDACT_PATHS, censor: '[Redacted]' } });
  }
  return _logger;
}

/** Convenience singleton logger — uses getLogger() */
export const logger = new Proxy({} as pino.Logger, {
  get(_target, prop: string | symbol) {
    return (getLogger() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
