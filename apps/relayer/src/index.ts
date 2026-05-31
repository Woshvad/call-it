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

// MUST be first: loads .env.local in dev before any module reads process.env.
// No-op in production (env comes from Fly secrets). See lib/load-dev-env.ts.
import './lib/load-dev-env.js';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { initEnv } from './env.js';
import { createLogger, setLogger } from './lib/logger.js';
import { pingWithBullMQCompat } from './lib/redis.js';
import { getDb } from './db/client.js';
import { FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA } from '@call-it/shared';
import { healthRoute } from './routes/health.js';
import { internalTestAlertRoute } from './routes/internal-test-alert.js';
import { paymasterAdminRoute } from './routes/admin-paymaster.js';
import { allowlistAdminRoute } from './routes/admin-allowlist.js';
import { onboardingRoute } from './routes/onboarding.js';
import { paymasterPolicyRoute } from './routes/paymaster-policy.js';
import { addressBookRoute } from './routes/address-book.js';
import { withdrawAuthorizeRoute } from './routes/withdraw-authorize.js';
import { privyWebhookRoute } from './routes/privy-webhook.js';
import { callsPreflightRoute } from './routes/calls-preflight.js';
import { callsDupCheckRoute } from './routes/calls-dup-check.js';
import { feedRoute } from './routes/feed.js';
import { profileRoute } from './routes/profile.js';
import { liveStateRoute } from './routes/live-state.js';
import { quoteStanceRoute } from './routes/quote-stance.js';
import { notificationsRoute } from './routes/notifications.js';
import { sendAlert } from './workers/alerts.js';
import { startPaymasterConfirmer } from './workers/paymaster-confirmer.js';
import { startNotificationFanout } from './workers/notification-fanout.js';

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

  // 3b. CORS — the web app calls JWT-gated relayer endpoints directly from the
  // browser (e.g. useOnboardingState → /api/onboarding/*), which is cross-origin
  // (Vercel web ↔ Fly relayer in prod; localhost:3000 ↔ localhost:8080 in dev).
  // Without this, the browser blocks the fetch ("Failed to fetch") and preflight
  // OPTIONS for the Authorization header fails.
  //
  // Allowed origins: NEXT_PUBLIC_OG_BASE_URL (the web origin) + localhost dev,
  // plus any comma-separated CORS_ALLOWED_ORIGINS override.
  const corsOrigins = new Set<string>([
    'http://localhost:3000',
    'http://localhost:3001',
  ]);
  if (env.NEXT_PUBLIC_OG_BASE_URL) corsOrigins.add(env.NEXT_PUBLIC_OG_BASE_URL.replace(/\/$/, ''));
  if (env.NEXT_PUBLIC_RELAYER_URL) {
    // no-op: relayer is not a browser origin; listed for clarity
  }
  for (const o of (process.env.CORS_ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    corsOrigins.add(o);
  }
  await app.register(cors, {
    origin: Array.from(corsOrigins),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type'],
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

  // ── Plan 01-08 routes ─────────────────────────────────────
  // Phase 1 — Plan 08: calls preflight gate (D-28, D-29 parity)
  await app.register(callsPreflightRoute);
  // Phase 1 — Plan 08: duplicate-hash pre-check with Redis cache (D-22, CALL-49)
  await app.register(callsDupCheckRoute);
  // ── Plan 01-09 routes ─────────────────────────────────────
  // Phase 1 — Plan 09: public feed endpoint (800ms race + 10s cache — D-24/26)
  await app.register(feedRoute);
  // Phase 1 — Plan 09: profile resolution (ENS + AUTH-11 priority chain — D-13)
  await app.register(profileRoute);
  // ── Plan 02-07 routes ─────────────────────────────────────
  // Phase 2 — Plan 07: live-state proxy (FFM contract reads + 4s Redis cache — D-07)
  await app.register(liveStateRoute);
  // Phase 2 — Plan 07: quote-stance CRUD (D-15, SOCIAL-43)
  await app.register(quoteStanceRoute);
  // Phase 2 — Plan 07: notifications inbox (D-13, D-14 — Privy-gated mark-read)
  await app.register(notificationsRoute);
  // ─────────────────────────────────────────────────────────

  // 5. Boot-time BullMQ compatibility smoke (Pitfall A mitigation)
  // Run after app is ready so we have logging; don't block app start.

  // Set up notification fan-out worker dependencies (created lazily at boot)
  const notificationFanoutClient = createPublicClient({
    chain: arbitrumSepolia,
    // Production injects RPC_URL_ARBITRUM_SEPOLIA (GCP/Fly secret); local .env.local
    // uses ARBITRUM_SEPOLIA_RPC_URL (matches foundry/web). Read both so the fan-out
    // RPC transport is defined in dev AND prod. undefined => viem default public RPC.
    transport: http(
      process.env.RPC_URL_ARBITRUM_SEPOLIA ?? process.env.ARBITRUM_SEPOLIA_RPC_URL,
    ),
  });
  const notificationFanoutDb = getDb();
  const notificationSubgraphUrl =
    process.env.RELAYER_SUBGRAPH_URL ??
    process.env.NEXT_PUBLIC_SUBGRAPH_URL ??
    '';

  app.addHook('onReady', async () => {
    // Start paymaster confirmer worker (Plan 07 — D-02)
    startPaymasterConfirmer();
    // Start notification fan-out worker (Plan 02-07 — D-13, SOCIAL-24)
    // Worker polls CallerExited events every 30s and fans out per-user notifications
    try {
      startNotificationFanout({
        publicClient: notificationFanoutClient,
        ffmAddress: FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA as `0x${string}`,
        db: notificationFanoutDb,
        subgraphUrl: notificationSubgraphUrl,
        intervalMs: 30_000,
      });
    } catch (err) {
      app.log.error(
        { event: 'notification_fanout_start_failed', err: String(err) },
        'Failed to start notification fan-out worker',
      );
    }
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
