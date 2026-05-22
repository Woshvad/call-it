/**
 * Call It Relayer — Fastify app bootstrap (Phase 0 — Plan 00-02)
 *
 * Exports:
 *   buildApp(): FastifyInstance — creates the fully wired Fastify app
 *
 * Routes:
 *   GET  /health                — public uptime probe (OPS-24)
 *   POST /internal/test-alert   — HMAC-gated synthetic alert endpoint (D-16)
 *   PATCH /admin/paymaster-cap  — IAM-gated operator cap adjustment (SAFETY-16)
 *   POST /admin/allowlist       — IAM-gated allowlist stub (OPS-26, returns 501)
 *
 * Boot sequence:
 *   1. initEnv() — fetch secrets from GCP Secret Manager (D-08)
 *   2. Create Fastify instance with Pino logger (D-14)
 *   3. Register all 4 routes
 *   4. pingWithBullMQCompat() — verify Upstash supports BullMQ commands (Pitfall A)
 *
 * Host: Fly.io iad (D-01, D-02) — always-on machine (auto_stop_machines=false)
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { initEnv } from './env.js';
import { createLogger, setLogger } from './lib/logger.js';
import { pingWithBullMQCompat } from './lib/redis.js';
import { healthRoute } from './routes/health.js';
import { internalTestAlertRoute } from './routes/internal-test-alert.js';
import { paymasterAdminRoute } from './routes/admin-paymaster.js';
import { allowlistAdminRoute } from './routes/admin-allowlist.js';
import { onboardingRoute } from './routes/onboarding.js';
import { paymasterPolicyRoute } from './routes/paymaster-policy.js';
import { addressBookRoute } from './routes/address-book.js';
import { withdrawAuthorizeRoute } from './routes/withdraw-authorize.js';
import { privyWebhookRoute } from './routes/privy-webhook.js';
import { sendAlert } from './workers/alerts.js';
import { startPaymasterConfirmer } from './workers/paymaster-confirmer.js';

/**
 * Build and configure the Fastify application.
 *
 * Called once at startup. Also used in tests via inject() to avoid real port binding.
 */
export async function buildApp(): Promise<FastifyInstance> {
  // 1. Load secrets from GCP Secret Manager (or process.env in dev)
  const env = await initEnv();

  // 2. Create the Pino logger with @logtail/pino transport in production
  const pinoLogger = createLogger(env);
  setLogger(pinoLogger);

  // 3. Create Fastify instance
  // Use Pino logger options rather than loggerInstance to avoid type mismatch
  // The logger module handles transport configuration separately
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL ?? 'info',
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
    trustProxy: true,
    bodyLimit: 1_048_576, // 1MB max body
  });

  // 4. Register routes (Phase 0 + Phase 1)
  await app.register(healthRoute);
  await app.register(internalTestAlertRoute);
  await app.register(paymasterAdminRoute);
  await app.register(allowlistAdminRoute);
  // Phase 1 — Plan 06: onboarding state persistence (privy-session-gated)
  await app.register(onboardingRoute);

  // Phase 1 — Plan 07: paymaster policy + count endpoints (ERC-7677)
  await app.register(paymasterPolicyRoute);

  // Phase 1 — Plan 07: address book CRUD (soft-delete only — D-08)
  await app.register(addressBookRoute);

  // Phase 1 — Plan 07: withdraw-authorize (24h cooldown gate — D-09/10, Pitfall 20/D)
  await app.register(withdrawAuthorizeRoute);

  // Phase 1 — Plan 07: Privy webhook receiver (HMAC-verified — T7, Pitfall 14)
  await app.register(privyWebhookRoute);

  // 5. Boot-time BullMQ compatibility smoke (Pitfall A mitigation)
  // Run after app is ready so we have logging; don't block app start.
  app.addHook('onReady', async () => {
    // Start paymaster confirmer worker (Plan 07 — D-02)
    startPaymasterConfirmer();
    try {
      const result = await pingWithBullMQCompat();
      if (!result.ok) {
        // TODO Phase 1: add a dedicated 'redis_degraded' AlertEvent
        // For Phase 0, repurpose tvl_approach with category:'infra' payload
        await sendAlert('tvl_approach', {
          category: 'infra',
          subsystem: 'redis-bullmq',
          failures: result.failures,
          message:
            'BullMQ compat check failed. Upstash may not support all required Redis commands. ' +
            'Consider upgrading to Upstash Pro or switching to Fly Redis sidecar (~$5/mo).',
        }).catch((alertErr: unknown) => {
          app.log.error({ event: 'bullmq_compat_alert_failed', err: String(alertErr) }, 'Failed to send BullMQ compat alert');
        });
      }
    } catch (err) {
      app.log.error(
        { event: 'bullmq_compat_check_failed', err: String(err) },
        'BullMQ compat check threw — Redis may be unavailable',
      );
    }
  });

  return app;
}

// Direct execution — starts the HTTP server when run as main module
// Checking process.argv[1] for ESM compatibility
if (process.env.START_RELAYER === 'true' || (
  typeof process !== 'undefined' &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('index.js') || process.argv[1].endsWith('index.ts')) &&
  !process.env.VITEST
)) {
  buildApp()
    .then((app) => {
      const port = parseInt(process.env.PORT ?? '8080', 10);
      const host = process.env.HOST ?? '0.0.0.0';
      return app.listen({ port, host });
    })
    .then((address) => {
      console.log(`Call It relayer listening at ${address}`);
    })
    .catch((err: unknown) => {
      console.error('Failed to start relayer:', err);
      process.exit(1);
    });
}
