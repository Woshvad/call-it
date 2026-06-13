/**
 * GET /health — relayer health check endpoint (OPS-24).
 *
 * Monitored by:
 * - Better Stack uptime checks (D-14) — pings every 30s
 * - Fly.io health checks (fly.toml [[services.http_checks]]) — every 30s
 *
 * Response: { status: 'ok', timestamp: ISO string, version: package.json version,
 *             commit: deployed git SHA from GIT_COMMIT (default 'unknown') }
 * The `commit` field (quick-260613-r3u) surfaces the deployed git SHA so
 * deployed-vs-master drift is visible at a glance — the Dockerfile bakes
 * GIT_COMMIT via `--build-arg GIT_COMMIT=$(git rev-parse --short HEAD)`.
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
      commit: process.env.GIT_COMMIT ?? 'unknown',
    });
  });
}
