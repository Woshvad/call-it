/**
 * POST /internal/test-alert — synthetic alert endpoint for CI cron (D-16).
 *
 * Allows the Plan 00-04 daily CI cron to fire a test alert through the full
 * Telegram dispatch pipeline without requiring a real contract event.
 *
 * Security (T-00-08):
 * - HMAC-SHA256 over JSON.stringify({event, nonce, timestamp}) with RELAYER_INTERNAL_HMAC_SECRET
 * - 5-minute timestamp replay window (reject stale requests)
 * - Nonce uniqueness enforced via Redis SET NX (600s TTL)
 * - Header X-Internal-HMAC must match computed HMAC
 *
 * Body: { event: AlertEvent, nonce: string, timestamp: number }
 * Response: 200 { ok: true } | 400 bad request | 403 HMAC mismatch
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { syntheticEventHandler } from '../workers/synthetic-event-handler.js';
import type { AlertEvent } from '../workers/alerts.js';

interface TestAlertBody {
  event: AlertEvent;
  nonce: string;
  timestamp: number;
}

export async function internalTestAlertRoute(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  app.post<{ Body: TestAlertBody }>('/internal/test-alert', async (request, reply) => {
    return syntheticEventHandler(request, reply);
  });
}
