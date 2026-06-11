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
import { FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA, PROFILE_REGISTRY_ARBITRUM_SEPOLIA, SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA } from '@call-it/shared';
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
// quick-260611-5mh A5: FINAL POSITIONS endpoint (web call page fetchFinalPositions)
import { callPositionsRoute } from './routes/call-positions.js';
import { quoteStanceRoute } from './routes/quote-stance.js';
import { notificationsRoute } from './routes/notifications.js';
import { duelLiveStateRoute } from './routes/duel-live-state.js';
import { duelsRoute } from './routes/duels.js';
// Phase 01.5 — Plan 02: social-link service (Twitter/Farcaster link + unlink-purge)
import { socialLinkRoute } from './routes/social-link.js';
// Phase 01.5 — Plan 05: "From your X / Farcaster" feed sections (viewer-only follow-graph)
import { feedFromYourXRoute } from './routes/feed-from-your-x.js';
import { feedFromYourFarcasterRoute } from './routes/feed-from-your-fc.js';
import { sendAlert } from './workers/alerts.js';
import { startPaymasterConfirmer } from './workers/paymaster-confirmer.js';
import { startNotificationFanout } from './workers/notification-fanout.js';
import { startDuelTrendingWorker } from './workers/duel-trending-worker.js';
import { startDuelKingWorker } from './workers/duel-king-worker.js';
// Phase 01.5 — Plan 02: SocialUnlinked backstop purge watcher (D-13, AUTH-17)
import { startSocialUnlinkWatcher } from './workers/social-unlink-watcher.js';
// Phase 4 — Plan 04-04: Settlement watcher (BullMQ + Pyth 30×60s retry)
import { startSettlementWatcher, type SettlementWatcherHandle } from './workers/settlement-watcher.js';
// Phase 4 — Plan 04-08: Settlement provenance + dispute routes (D-10, D-06/07)
import { settleRoute } from './routes/settle.js';
import { disputesRoute } from './routes/disputes.js';
// Phase 7 — Plan 07-04: auto-post share-loop worker (D-02, SHARE-16/17/18)
import { startAutoPostWorker } from './workers/auto-post-worker.js';

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
          'X_API_WRITE_TOKEN',
          'X_API_BEARER_TOKEN',
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
  // quick-260611-5mh A5: positions per call (subgraph Position entities —
  // backs the web's FINAL POSITIONS block; degrades to [] on subgraph failure)
  await app.register(callPositionsRoute);
  // Phase 2 — Plan 07: quote-stance CRUD (D-15, SOCIAL-43)
  await app.register(quoteStanceRoute);
  // Phase 2 — Plan 07: notifications inbox (D-13, D-14 — Privy-gated mark-read)
  await app.register(notificationsRoute);
  // ── Plan 03-05 routes ─────────────────────────────────────
  // Phase 3 — Plan 05: duel live-state proxy (ChallengeEscrow RPC reads + 4s Redis cache — T-03-05-01/02)
  // NOTE: CHALLENGE_ESCROW_ARBITRUM_SEPOLIA is the zero-address placeholder until
  // the 03-03 operator deploy lands; the route zero-guards and returns deferred:true.
  await app.register(duelLiveStateRoute);
  // Phase 3 — Plan 05: duels tab feed (trending_duels Postgres + subgraph merge — SOCIAL-41/48)
  await app.register(duelsRoute);
  // ── Plan 04-08 routes ─────────────────────────────────────
  // Phase 4 — Plan 08: settlement provenance (D-10, SETTLE-52)
  await app.register(settleRoute);
  // Phase 4 — Plan 08: dispute raise/list/evidence (D-06, D-07)
  await app.register(disputesRoute);
  // ── Plan 01.5-02 routes ───────────────────────────────────
  // Phase 01.5 — Plan 02: social-link service (AUTH-06/07/12/13/17 — session-gated;
  // Twitter (Privy proof) + Farcaster (SIWF) link via KMS oauth-proof wallet + unlink-purge)
  await app.register(socialLinkRoute);
  // ── Plan 01.5-05 routes ───────────────────────────────────
  // Phase 01.5 — Plan 05: "From your X / Farcaster" feed sections (AUTH-14/15/18,
  // viewer-only follow-graph; session-gated; degrade-to-empty so the main feed
  // never blocks). X API tier / Neynar key are FEED-wave operator gates.
  await app.register(feedFromYourXRoute);
  await app.register(feedFromYourFarcasterRoute);
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

  // Settlement watcher dependencies (Phase 4 — Plan 04-04)
  // walletClient uses the relayer's GCP KMS-backed key (no local private key — D-05)
  // In production, the walletClient must be created with a proper account (KMS-backed).
  // For the current wiring, we pass the publicClient and a minimal walletClient placeholder.
  // Full KMS wiring happens in Phase 4 Plan 04-05 when the settle route is added.
  const settlementPublicClient = notificationFanoutClient; // reuse same publicClient
  // walletClient requires an account; in production this will be gcpKmsAccount from kms-signer.ts
  // For now we create a walletClient using the same transport — it will fail gracefully if
  // no account is configured (settlement watcher is non-blocking via try/catch).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settlementWalletClient = { writeContract: async () => { throw new Error('walletClient not configured — set up KMS account before enabling live settlement'); } } as any;

  const settlementRedisConfig = {
    host: (() => {
      const url = process.env.UPSTASH_REDIS_REST_URL ?? 'redis://localhost:6379';
      try { return new URL(url).hostname; } catch { return 'localhost'; }
    })(),
    port: (() => {
      const url = process.env.UPSTASH_REDIS_REST_URL ?? 'redis://localhost:6379';
      try { return parseInt(new URL(url).port || '6379', 10); } catch { return 6379; }
    })(),
    password: process.env.UPSTASH_REDIS_REST_TOKEN,
    tls: (process.env.UPSTASH_REDIS_REST_URL ?? '').startsWith('rediss://') ? {} : undefined,
    lazyConnect: true,
  };

  let settlementWatcherHandle: SettlementWatcherHandle | undefined;

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
    // Start duel trending worker (Plan 03-05 — D-07, SOCIAL-41/48)
    // Runs every 60s; upserts trending_duels rows when pot >= $500 OR backers >= 50.
    // NOTE: subgraphUrl may return empty results until ChallengeEscrow is deployed (03-03).
    try {
      startDuelTrendingWorker({
        subgraphUrl: notificationSubgraphUrl,
        db: notificationFanoutDb,
        intervalMs: 60_000,
      });
    } catch (err) {
      app.log.error(
        { event: 'duel_trending_worker_start_failed', err: String(err) },
        'Failed to start duel trending worker',
      );
    }
    // Start Duel King worker (Plan 03-05 — SOCIAL-48)
    // Runs weekly; elects Duel King from settled challenges (placeholder until Phase 4).
    try {
      startDuelKingWorker({
        subgraphUrl: notificationSubgraphUrl,
        db: notificationFanoutDb,
        intervalMs: 7 * 24 * 3600 * 1000,
      });
    } catch (err) {
      app.log.error(
        { event: 'duel_king_worker_start_failed', err: String(err) },
        'Failed to start Duel King worker',
      );
    }
    // Start SocialUnlinked backstop watcher (Plan 01.5-02 — D-13, AUTH-17)
    // Polls ProfileRegistry SocialUnlinked events (chunked ≤9-block getLogs) and
    // purges follow_graph + Redis + marks social_link_index unlinked. Idle while
    // PROFILE_REGISTRY_ARBITRUM_SEPOLIA is zero-address (route zero-guards too).
    try {
      startSocialUnlinkWatcher({
        publicClient: notificationFanoutClient,
        profileRegistryAddress: PROFILE_REGISTRY_ARBITRUM_SEPOLIA as `0x${string}`,
        db: notificationFanoutDb,
        intervalMs: 30_000,
      });
    } catch (err) {
      app.log.error(
        { event: 'social_unlink_watcher_start_failed', err: String(err) },
        'Failed to start SocialUnlinked backstop watcher',
      );
    }
    // Start settlement watcher (Phase 4 — Plan 04-04 — D-04)
    // BullMQ expiry queue + Pyth 30×60s retry + Telegram stuck alert
    try {
      settlementWatcherHandle = startSettlementWatcher({
        publicClient: settlementPublicClient,
        walletClient: settlementWalletClient,
        redisConfig: settlementRedisConfig,
        subgraphUrl: notificationSubgraphUrl,
      });
      app.log.info({ event: 'settlement_watcher_started' }, 'Settlement watcher started');
    } catch (err) {
      app.log.error(
        { event: 'settlement_watcher_start_failed', err: String(err) },
        'Failed to start settlement watcher',
      );
    }
    // Start auto-post share-loop worker (Phase 7 — Plan 07-04 — D-02, SHARE-16/17/18)
    // Default-ON (SHARE-16); set AUTO_POST_ENABLED=false to disable (non-destructive).
    // Posts a settled receipt to X at most once per call (posted_receipts dedup) after
    // the Pitfall-8 cache-warm gate + the Pitfall-18 post-settle delay. Key-gated:
    // degrades to a no-op until X_API_WRITE_TOKEN is budgeted. The Farcaster cast URL
    // is constructed in parallel (SHARE-18; landing the cast is Phase 8).
    if (process.env.AUTO_POST_ENABLED !== 'false') {
      try {
        const ogBaseUrl = env.NEXT_PUBLIC_OG_BASE_URL ?? process.env.NEXT_PUBLIC_OG_BASE_URL ?? 'http://localhost:3000';
        startAutoPostWorker({
          publicClient: notificationFanoutClient,
          settlementManagerAddress: SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA as `0x${string}`,
          ffmAddress: FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA as `0x${string}`,
          db: notificationFanoutDb,
          ogBaseUrl,
          intervalMs: 30_000,
        });
        app.log.info({ event: 'auto_post_worker_started' }, 'Auto-post worker started (default-ON, SHARE-16)');
      } catch (err) {
        app.log.error(
          { event: 'auto_post_worker_start_failed', err: String(err) },
          'Failed to start auto-post worker',
        );
      }
    } else {
      app.log.info({ event: 'auto_post_worker_disabled' }, 'Auto-post worker disabled via AUTO_POST_ENABLED=false');
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

  // Graceful shutdown: stop settlement watcher before Fastify closes (Plan 04-04)
  app.addHook('onClose', async () => {
    if (settlementWatcherHandle) {
      app.log.info({ event: 'settlement_watcher_stopping' }, 'Stopping settlement watcher on server close');
      await settlementWatcherHandle.stop();
      app.log.info({ event: 'settlement_watcher_stopped' }, 'Settlement watcher stopped');
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
