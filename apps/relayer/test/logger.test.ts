/**
 * Task 1 TDD — Logger tests
 *
 * Tests Pino logger with redaction config.
 * No external dependencies needed — uses a writable stream to capture output.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Writable } from 'node:stream';
import pino from 'pino';

function createTestLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding: string, callback: () => void) {
      lines.push(chunk.toString().trim());
      callback();
    },
  });

  const logger = pino(
    {
      level: 'info',
      redact: {
        paths: [
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
        ],
        censor: '[Redacted]',
      },
    },
    stream,
  );

  return { logger, lines };
}

describe('Pino logger redaction', () => {
  let lines: string[];
  let logger: pino.Logger;

  beforeEach(() => {
    const result = createTestLogger();
    lines = result.lines;
    logger = result.logger;
  });

  it('emits structured JSON with correct shape for info logs', () => {
    logger.info({ event: 'test' }, 'hello');

    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]!);

    expect(parsed.level).toBe(30); // pino info level = 30
    expect(parsed.time).toBeDefined();
    expect(parsed.event).toBe('test');
    expect(parsed.msg).toBe('hello');
  });

  it('redacts TELEGRAM_BOT_TOKEN from log output', () => {
    logger.info({ TELEGRAM_BOT_TOKEN: '12345:abcdef' }, 'oops');

    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]!);

    expect(parsed.TELEGRAM_BOT_TOKEN).toBe('[Redacted]');
    expect(parsed.msg).toBe('oops');
  });
});
