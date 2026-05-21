/**
 * Call It Relayer — Fastify HTTP server skeleton
 *
 * Phase 0: Bare HTTP skeleton with /health endpoint.
 * Real signer + alert wiring lands in Plan 00-02.
 *
 * Stack: Fastify 5.6.1 + Pino 9 + BullMQ + viem 2.50.4
 * Host: Fly.io iad (D-01, D-02)
 *
 * See apps/relayer/src/ for planned modules:
 *   - kms-signer.ts   — GCP KMS viem Account wrapper (D-06, D-07)
 *   - workers/alerts.ts — Telegram bot P0/P1 routing (D-15)
 *   - lib/redis.ts     — Upstash Redis connection (D-03)
 *   - lib/logger.ts    — Pino + @logtail/pino (D-14)
 */
import Fastify from 'fastify';

const app = Fastify({
  logger: true, // Phase 00-02 replaces with Pino + @logtail/pino (D-14)
});

// GET /health — monitored by Better Stack uptime checks (D-14)
app.get('/health', async (_req, reply) => {
  await reply.status(200).send({
    status: 'ok',
    service: 'call-it-relayer',
    phase: '00-foundation',
    timestamp: new Date().toISOString(),
  });
});

// Start the server (only when run directly, not when imported in tests)
const PORT = parseInt(process.env.PORT ?? '8080', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

app.listen({ port: PORT, host: HOST }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Call It relayer listening at ${address}`);
});

export { app };
