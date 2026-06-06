/**
 * Synthetic event handler (D-16, Pitfall D mitigation).
 *
 * Called by POST /internal/test-alert.
 * Verifies HMAC + replay-window + nonce uniqueness before dispatching alert.
 *
 * Separated from the route module for cleaner unit testing.
 *
 * HMAC construction: HMAC-SHA256(RELAYER_INTERNAL_HMAC, JSON.stringify({event, nonce, timestamp}))
 * The HMAC secret is fetched from env (populated from GCP Secret Manager at boot, D-08).
 */

import { createHmac } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { sendAlert, type AlertEvent } from './alerts.js';
import { getRedis } from '../lib/redis.js';
import { getLogger } from '../lib/logger.js';

interface SyntheticAlertBody {
  event: AlertEvent;
  nonce: string;
  timestamp: number;
}

/** Replay window: 5 minutes */
const REPLAY_WINDOW_SECONDS = 5 * 60;
/** Nonce TTL: 10 minutes (covers replay window × 2) */
const NONCE_TTL_SECONDS = 10 * 60;

/**
 * Compute the expected HMAC for a synthetic alert request.
 *
 * @param secret - RELAYER_INTERNAL_HMAC from env
 * @param body - { event, nonce, timestamp }
 */
function computeHmac(secret: string, body: SyntheticAlertBody): string {
  const payload = JSON.stringify({ event: body.event, nonce: body.nonce, timestamp: body.timestamp });
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Handle POST /internal/test-alert.
 *
 * Security gates (T-00-08):
 * 1. X-Internal-HMAC header must match computed HMAC
 * 2. Timestamp within 5-minute skew window
 * 3. Nonce not seen within the last 10 minutes (SET NX)
 */
export async function syntheticEventHandler(
  request: FastifyRequest<{ Body: SyntheticAlertBody }>,
  reply: FastifyReply,
): Promise<void> {
  const body = request.body;
  const providedHmac = request.headers['x-internal-hmac'] as string | undefined;

  // 1. Validate presence of HMAC header
  if (!providedHmac) {
    await reply.status(403).send({ error: 'Forbidden', message: 'Missing X-Internal-HMAC header' });
    return;
  }

  // 2. Validate HMAC
  const secret = process.env.RELAYER_INTERNAL_HMAC;
  if (!secret) {
    getLogger().error({ event: 'synthetic_alert_no_secret' }, 'RELAYER_INTERNAL_HMAC not set');
    await reply.status(500).send({ error: 'Internal error', message: 'Alert HMAC secret not configured' });
    return;
  }

  const expectedHmac = computeHmac(secret, body);
  if (providedHmac !== expectedHmac) {
    getLogger().warn({ event: 'synthetic_alert_hmac_mismatch' }, 'X-Internal-HMAC mismatch');
    await reply.status(403).send({ error: 'Forbidden', message: 'HMAC verification failed' });
    return;
  }

  // 3. Validate timestamp (5-minute replay window)
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - body.timestamp) > REPLAY_WINDOW_SECONDS) {
    getLogger().warn(
      { event: 'synthetic_alert_replay_window', timestamp: body.timestamp, now: nowSeconds },
      'Synthetic alert rejected: timestamp outside 5-minute window',
    );
    await reply.status(400).send({
      error: 'Bad Request',
      message: 'Timestamp outside 5-minute replay window',
    });
    return;
  }

  // 4. Nonce uniqueness (SET NX prevents replay attacks)
  const redis = getRedis();
  const nonceKey = `paymaster:internal-nonce:${body.nonce}`;
  const acquired = await redis.set(nonceKey, '1', 'EX', NONCE_TTL_SECONDS, 'NX');
  if (acquired !== 'OK') {
    getLogger().warn({ event: 'synthetic_alert_nonce_replay', nonce: body.nonce }, 'Nonce already used');
    await reply.status(400).send({ error: 'Bad Request', message: 'Nonce already used' });
    return;
  }

  // All checks passed — dispatch the alert
  try {
    await sendAlert(body.event, { synthetic: true, nonce: body.nonce, timestamp: body.timestamp });
    getLogger().info(
      { event: 'synthetic_alert_dispatched', alertEvent: body.event, nonce: body.nonce },
      'Synthetic alert dispatched',
    );
    // 200 is returned ONLY after sendAlert() resolved — i.e. bot.sendMessage()
    // succeeded (it re-throws on failure → caught below → 500). `delivered: true`
    // makes that send-confirmation explicit so the CI self-test can assert on it
    // without polling getUpdates (a bot can't read its own outgoing DM that way).
    await reply.status(200).send({ ok: true, event: body.event, nonce: body.nonce, delivered: true });
  } catch (err) {
    getLogger().error(
      { event: 'synthetic_alert_dispatch_failed', err: err instanceof Error ? err.message : String(err) },
      'Failed to dispatch synthetic alert',
    );
    await reply.status(500).send({ error: 'Internal error', message: 'Alert dispatch failed' });
  }
}
