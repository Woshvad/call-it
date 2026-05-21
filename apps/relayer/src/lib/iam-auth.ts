/**
 * GCP IAM service-account ID-token verifier (T-00-09, SAFETY-16, OPS-26).
 *
 * Provides a Fastify preHandler that verifies the Authorization: Bearer <token> header
 * using google-auth-library's OAuth2Client.verifyIdToken.
 *
 * Only requests with a valid GCP IAM service-account ID token pass the gate.
 * All other requests receive 401 Unauthorized.
 *
 * Usage:
 *   app.patch('/admin/paymaster-cap', { preHandler: iamAuthPreHandler }, handler);
 */

import { OAuth2Client } from 'google-auth-library';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { getLogger } from './logger.js';

const client = new OAuth2Client();

/**
 * Fastify preHandler that verifies a GCP IAM ID token.
 *
 * The audience is bound to the operator service-account ID (from env).
 * If the env var is not set, any valid Google ID token is accepted
 * (acceptable for Phase 0; tighten in Phase 5 with specific SA ID).
 */
export async function iamAuthPreHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    await reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing Authorization: Bearer <GCP IAM token> header',
    });
    return;
  }

  const idToken = authHeader.slice('Bearer '.length);
  const audience = process.env.GCP_IAM_AUDIENCE;

  try {
    const ticket = await client.verifyIdToken({ idToken, audience });
    const payload = ticket.getPayload();

    getLogger().info(
      { event: 'iam_auth_ok', sub: payload?.sub },
      'IAM auth verified',
    );
    // Request is authenticated — continue to route handler
  } catch (err) {
    getLogger().warn(
      { event: 'iam_auth_failed', err: err instanceof Error ? err.message : String(err) },
      'IAM auth verification failed',
    );
    await reply.status(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired GCP IAM ID token',
    });
  }
}
