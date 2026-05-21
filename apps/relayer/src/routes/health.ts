/**
 * GET /health — relayer health check endpoint (OPS-24).
 *
 * Monitored by:
 * - Better Stack uptime checks (D-14) — pings every 30s
 * - Fly.io health checks (fly.toml [[services.http_checks]]) — every 30s
 *
 * Response: { status: 'ok', timestamp: ISO string, version: package.json version }
 * Auth: NONE — this endpoint is intentionally public (operators + uptime monitors need it)
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';

export async function healthRoute(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  app.get('/health', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? 'dev',
    });
  });
}
