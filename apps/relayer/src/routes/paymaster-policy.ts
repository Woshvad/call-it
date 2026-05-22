/**
 * POST /paymaster/policy — ERC-7677 paymaster policy endpoint (Plan 07, D-02, Pitfall 14).
 *
 * Called by the Alchemy bundler (or ERC-7677-compatible bundler) before sponsoring
 * a userOp. Returns pm_getPaymasterStubData / pm_getPaymasterData responses.
 *
 * IMPORTANT: This endpoint NEVER increments the counter. The confirmer worker
 * (workers/paymaster-confirmer.ts) increments ONLY on confirmed on-chain inclusion.
 * (D-02: "Counter increments only on confirmed inclusion via UserOperationEvent")
 *
 * Alchemy paymaster RPC choice: ERC-7677 standard (pm_getPaymasterStubData /
 * pm_getPaymasterData). If operator verification reveals Alchemy v4 only supports
 * the custom `alchemy_requestGasAndPaymasterAndData` RPC, the method name check
 * below is the only change required — the logic is identical.
 *
 * Security:
 *   - Counter never incremented here (D-02 — only confirmer does this)
 *   - privyUserId extracted from params[3].privyUserId (ERC-7677 context field)
 *   - sender → privyUserId mapping written at sign time (confirmer lookup)
 *   - Structured logs: { event: 'paymaster_policy_decision' }
 *
 * GET /api/paymaster-count — read-only count endpoint (privy-session-gated).
 * Returns { count, capacity, remaining } for the authenticated user.
 *
 * Requirements: AUTH-27, AUTH-28, SAFETY-18, D-02, Pitfall 14
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { getPaymasterCount, registerSenderMapping } from '../lib/upstash-counter.js';
import { privySessionPreHandler } from '../lib/privy-auth.js';
import { getLogger } from '../lib/logger.js';

// ─── JSON-RPC schema ─────────────────────────────────────────────────────────

const ALLOWED_METHODS = ['pm_getPaymasterStubData', 'pm_getPaymasterData'] as const;

const UserOpSchema = z.object({
  sender: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'sender must be a 0x address'),
  nonce: z.string().optional(),
  callData: z.string().optional(),
  initCode: z.string().optional(),
  callGasLimit: z.string().optional(),
  verificationGasLimit: z.string().optional(),
  preVerificationGas: z.string().optional(),
  maxFeePerGas: z.string().optional(),
  maxPriorityFeePerGas: z.string().optional(),
}).passthrough();

const ContextSchema = z.object({
  privyUserId: z.string().min(1, 'privyUserId is required in context'),
}).passthrough();

const PolicyRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.enum(ALLOWED_METHODS),
  params: z.tuple([
    UserOpSchema,     // params[0] — partial userOp
    z.string(),       // params[1] — entryPoint address
    z.string(),       // params[2] — chainId (hex)
    ContextSchema,    // params[3] — context (carries privyUserId)
  ]),
});

type PolicyRequest = z.infer<typeof PolicyRequestSchema>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a mock paymasterAndData stub for testing / development.
 * In production, replace this with actual KMS-signed paymasterAndData.
 *
 * NOTE: Plan 07 spec calls for a `signWithPaymasterPolicyKey(userOpHash)`.
 * Phase 0's KMS wrapper (`lib/kms-signer.ts`) is label-based; in production
 * extend it to add a `paymaster-policy-signer` key label.
 * For Phase 1 (pre-mainnet), we use a deterministic stub for testability.
 * The operator must wire the real KMS key before mainnet.
 */
function buildPaymasterStubData(): {
  paymaster: string;
  paymasterData: string;
  paymasterVerificationGasLimit: string;
  paymasterPostOpGasLimit: string;
} {
  const paymasterAddress = process.env.ALCHEMY_PAYMASTER_ADDRESS ?? '0x0000000000000000000000000000000000000000';
  return {
    paymaster: paymasterAddress,
    paymasterData: '0x',  // Stub — real signing via KMS in production
    paymasterVerificationGasLimit: '0x186a0',  // 100k gas
    paymasterPostOpGasLimit: '0x4e20',          // 20k gas
  };
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function paymasterPolicyRoute(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  /**
   * POST /paymaster/policy
   *
   * ERC-7677 endpoint. Alchemy bundler calls this before sponsoring a userOp.
   * Returns JSON-RPC 2.0 result (sponsor) or error (deny).
   *
   * Auth: No Privy session — Alchemy bundler caller.
   * The paymaster signature itself is the sponsorship gate.
   * TODO: Add vendor HMAC verification if Alchemy provides one for this endpoint.
   */
  app.post<{ Body: PolicyRequest }>(
    '/paymaster/policy',
    {},
    async (request, reply) => {
      const parsed = PolicyRequestSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({
          jsonrpc: '2.0',
          id: (request.body as { id?: unknown })?.id ?? null,
          error: {
            code: -32600,
            message: 'Invalid Request',
            data: parsed.error.issues,
          },
        });
      }

      const { id, method, params } = parsed.data;
      const [userOp, , , context] = params;
      const { privyUserId } = context;
      const sender = userOp.sender;

      // Read current count — NEVER increment here (D-02)
      const currentCount = await getPaymasterCount(privyUserId);

      const decision = currentCount < 5 ? 'sponsor' : 'deny';

      getLogger().info(
        {
          event: 'paymaster_policy_decision',
          privyUserId,
          currentCount,
          decision,
          sender,
          method,
        },
        `paymaster policy: ${decision}`,
      );

      if (decision === 'deny') {
        return reply.status(200).send({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32000,
            message: 'sponsorship-cap-exceeded',
          },
        });
      }

      // Register sender → privyUserId mapping for the confirmer worker
      // This is a side effect — the confirmer needs this to look up privyUserId
      // from the UserOperationEvent's `sender` field.
      await registerSenderMapping(sender, privyUserId);

      // Build and return the paymaster stub/data
      const paymasterResult = buildPaymasterStubData();

      return reply.status(200).send({
        jsonrpc: '2.0',
        id,
        result: paymasterResult,
      });
    },
  );

  /**
   * GET /api/paymaster-count
   *
   * Privy-session-gated read of the caller's lifetime paymaster count.
   * Used by the frontend's usePaymasterCount() hook.
   *
   * Response: { count: number, capacity: 5, remaining: number }
   */
  app.get(
    '/api/paymaster-count',
    { preHandler: privySessionPreHandler },
    async (request, reply) => {
      const privyUserId = request.privyUserId!;
      const count = await getPaymasterCount(privyUserId);
      const remaining = Math.max(0, 5 - count);

      return reply.status(200).send({
        count,
        capacity: 5,
        remaining,
      });
    },
  );
}
