/**
 * POST /admin/allowlist — sponsored-campaign allowlist management (OPS-26).
 *
 * Phase 0: returns 501 Not Implemented (stub for Phase 4).
 * Phase 4: adds the real allowlist contract write.
 *
 * Auth: GCP IAM service-account ID token required (same as paymaster admin, T-00-09).
 * The IAM gate is active in Phase 0 so the access pattern is proven before real logic lands.
 *
 * Body: { address: string, action: 'add' | 'remove' }
 * Response Phase 0: 501 Not Implemented
 * Response Phase 4: 200 { success: true, address, action }
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { iamAuthPreHandler } from '../lib/iam-auth.js';
import { getLogger } from '../lib/logger.js';

interface AllowlistBody {
  address: string;
  action: 'add' | 'remove';
}

export async function allowlistAdminRoute(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  app.post<{ Body: AllowlistBody }>(
    '/admin/allowlist',
    {
      preHandler: iamAuthPreHandler,
      schema: {
        body: {
          type: 'object',
          required: ['address', 'action'],
          properties: {
            address: { type: 'string' },
            action: { type: 'string', enum: ['add', 'remove'] },
          },
        },
      },
    },
    async (request, reply) => {
      const { address, action } = request.body;

      // OPS-26: log the invocation so the IAM gate is observable
      getLogger().info(
        { event: 'allowlist_admin_invoked', address, action },
        'Allowlist admin endpoint invoked (Phase 0 stub — returns 501)',
      );

      // Phase 0: return 501; Phase 4 wires real contract allowlist write
      // TODO Phase 4:
      //   const receipt = await allowlistContract.write.setAllowlisted([address, action === 'add']);
      //   return reply.status(200).send({ success: true, address, action, txHash: receipt });

      return reply.status(501).send({
        error: 'Not Implemented',
        message: 'POST /admin/allowlist is a Phase 0 stub. Real allowlist management lands in Phase 4.',
        phase: '00-foundation',
      });
    },
  );
}
