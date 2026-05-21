/**
 * PATCH /admin/paymaster-cap — operator-only cap adjustment (SAFETY-16).
 *
 * Phase 0: writes new cap to Redis key `paymaster:cap`.
 * Phase 4: also calls contract setPaymasterDailyCap(newCap) on-chain.
 *
 * Auth: GCP IAM service-account ID token required (T-00-09).
 * Rejection: 401 Unauthorized without valid token.
 *
 * Body: { newCapUsdc6: string } — USDC6 as string to avoid BigInt JSON issues
 * Response: { success: true, newCapUsdc6: string }
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { iamAuthPreHandler } from '../lib/iam-auth.js';
import { getRedis } from '../lib/redis.js';
import { getLogger } from '../lib/logger.js';

interface PaymasterCapBody {
  newCapUsdc6: string;
}

export async function paymasterAdminRoute(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  app.patch<{ Body: PaymasterCapBody }>(
    '/admin/paymaster-cap',
    {
      preHandler: iamAuthPreHandler,
      schema: {
        body: {
          type: 'object',
          required: ['newCapUsdc6'],
          properties: {
            newCapUsdc6: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { newCapUsdc6 } = request.body;

      // Validate: must be a positive integer string
      const capValue = BigInt(newCapUsdc6);
      if (capValue <= 0n) {
        return reply.status(400).send({ error: 'newCapUsdc6 must be a positive integer' });
      }

      const redis = getRedis();
      await redis.set('paymaster:cap', newCapUsdc6);

      getLogger().info(
        { event: 'paymaster_cap_updated', newCapUsdc6 },
        'Paymaster cap updated by operator',
      );

      // TODO Phase 4: call contract setPaymasterDailyCap(capValue) on-chain
      // import { publicClient, walletClient } from '../lib/viem-clients.js';
      // await walletClient.writeContract({ abi, address, functionName: 'setPaymasterDailyCap', args: [capValue] });

      return reply.status(200).send({ success: true, newCapUsdc6 });
    },
  );
}
