/**
 * POST /api/privy/webhook — HMAC-verified Privy webhook receiver (Plan 07, T7, Pitfall 14).
 *
 * Privy uses Svix for webhook delivery. Each request carries:
 *   svix-id:        unique message ID
 *   svix-timestamp: Unix timestamp of the message
 *   svix-signature: v1,<base64-hmac-sha256>
 *
 * Signature verification per Svix docs:
 *   signed_content = svix_id + "." + svix_timestamp + "." + raw_body
 *   expected_sig = HMAC-SHA256(PRIVY_WEBHOOK_SECRET, signed_content)
 *   compare base64(expected_sig) to the v1,<sig> value
 *
 * On valid auth.linked event:
 *   INSERT INTO auth_methods (privy_user_id, auth_type, linked_at)
 *   ON CONFLICT DO NOTHING — idempotent on duplicate delivery (T7)
 *
 * Security (T-01-43):
 *   - PRIVY_WEBHOOK_SECRET stored in GCP Secret Manager
 *   - 401 on invalid or missing signature
 *   - 200 no-op for non-auth.linked event types (future-proof)
 *   - All events logged with { event: 'privy_webhook_received'|'privy_webhook_auth_linked_processed'|'privy_webhook_signature_invalid' }
 *
 * Requirements: AUTH-29, AUTH-30, T-01-43, Pitfall 14, T7
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getDb } from '../db/client.js';
import { authMethods } from '../db/schema.js';
import { getLogger } from '../lib/logger.js';

// ─── Svix signature verification ─────────────────────────────────────────────

/**
 * Verify a Svix webhook signature.
 *
 * Per Svix docs: the signing input is:
 *   {svix-id}.{svix-timestamp}.{raw-body}
 *
 * The signature header has the format:
 *   v1,<base64-encoded-hmac-sha256>
 *   (may have multiple comma-separated versions, e.g. "v1,sig1 v1a,sig2")
 *
 * PRIVY_WEBHOOK_SECRET is used as the HMAC key.
 * Per Privy's docs, the secret may be base64url-encoded — we decode it first.
 */
function verifySvixSignature(
  svixId: string,
  svixTimestamp: string,
  rawBody: string,
  svixSignatureHeader: string,
  secret: string,
): boolean {
  try {
    // Svix secrets are prefixed with "whsec_" followed by base64url-encoded bytes
    let keyBytes: Buffer;
    if (secret.startsWith('whsec_')) {
      keyBytes = Buffer.from(secret.slice('whsec_'.length), 'base64');
    } else {
      // Plain secret — use directly as UTF-8 bytes
      keyBytes = Buffer.from(secret, 'utf-8');
    }

    const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
    const expectedHmac = createHmac('sha256', keyBytes)
      .update(signedContent)
      .digest('base64');

    // svix-signature header may contain multiple space-separated signatures
    // Each signature is in the format "v1,<base64>"
    const signatures = svixSignatureHeader.split(' ');
    for (const sig of signatures) {
      const [version, sigValue] = sig.split(',') as [string, string | undefined];
      if (version === 'v1' && sigValue) {
        const sigBuffer = Buffer.from(sigValue, 'base64');
        const expectedBuffer = Buffer.from(expectedHmac, 'base64');
        if (
          sigBuffer.length === expectedBuffer.length &&
          timingSafeEqual(sigBuffer, expectedBuffer)
        ) {
          return true;
        }
      }
    }

    return false;
  } catch {
    return false;
  }
}

// ─── Webhook event types ──────────────────────────────────────────────────────

interface PrivyLinkedAccount {
  type: string;
  verifiedAt?: number;
  [key: string]: unknown;
}

interface PrivyAuthLinkedEvent {
  type: 'auth.linked';
  data: {
    userId: string;
    linkedAccount: PrivyLinkedAccount;
    linkedAt?: number;
  };
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function privyWebhookRoute(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  /**
   * POST /api/privy/webhook
   *
   * No Privy session auth — this endpoint is called by Privy's webhook infrastructure,
   * not by users. Authentication is via HMAC-SHA256 signature (Svix).
   */
  app.post(
    '/api/privy/webhook',
    {
      // Raw body is needed for signature verification
      // Fastify parses JSON by default; we need the raw string
      config: { rawBody: true },
    },
    async (request, reply) => {
      const svixId = request.headers['svix-id'] as string | undefined;
      const svixTimestamp = request.headers['svix-timestamp'] as string | undefined;
      const svixSignature = request.headers['svix-signature'] as string | undefined;

      getLogger().info(
        {
          event: 'privy_webhook_received',
          svixId,
          hasSignature: !!svixSignature,
        },
        'Privy webhook received',
      );

      // Validate Svix headers are present
      if (!svixId || !svixTimestamp || !svixSignature) {
        getLogger().warn(
          { event: 'privy_webhook_signature_invalid', reason: 'missing_svix_headers' },
          'Privy webhook rejected — missing Svix headers',
        );
        return reply.status(401).send({ error: 'unauthorized', code: 'missing_signature' });
      }

      const webhookSecret = process.env.PRIVY_WEBHOOK_SECRET;
      if (!webhookSecret) {
        getLogger().error(
          { event: 'privy_webhook_no_secret' },
          'PRIVY_WEBHOOK_SECRET not set — rejecting webhook',
        );
        return reply.status(500).send({ error: 'server_error', code: 'webhook_not_configured' });
      }

      // Get raw body string for signature verification
      // Fastify stores raw body in request.rawBody if rawBody plugin is active,
      // otherwise fall back to serializing the parsed body
      const rawBody: string = typeof (request as unknown as { rawBody?: string }).rawBody === 'string'
        ? (request as unknown as { rawBody: string }).rawBody
        : JSON.stringify(request.body);

      // Verify HMAC signature
      const valid = verifySvixSignature(svixId, svixTimestamp, rawBody, svixSignature, webhookSecret);

      if (!valid) {
        getLogger().warn(
          { event: 'privy_webhook_signature_invalid', svixId, reason: 'hmac_mismatch' },
          'Privy webhook rejected — HMAC signature mismatch',
        );
        return reply.status(401).send({ error: 'unauthorized', code: 'invalid_signature' });
      }

      // Process the event
      const body = request.body as { type?: string; data?: unknown };

      if (body.type !== 'auth.linked') {
        // No-op for other event types — 200 OK
        getLogger().info(
          { event: 'privy_webhook_noop', eventType: body.type },
          'Privy webhook: unhandled event type (no-op)',
        );
        return reply.status(200).send({ ok: true });
      }

      // Process auth.linked event
      const event = body as unknown as PrivyAuthLinkedEvent;
      const { userId, linkedAccount, linkedAt } = event.data;

      // Determine linked_at timestamp
      // Priority: event.data.linkedAt > linkedAccount.verifiedAt > now()
      let linkedAtDate: Date;
      if (linkedAt) {
        linkedAtDate = new Date(linkedAt * 1000);
      } else if (linkedAccount.verifiedAt) {
        linkedAtDate = new Date(linkedAccount.verifiedAt * 1000);
      } else {
        linkedAtDate = new Date();
      }

      const authType = linkedAccount.type ?? 'unknown';

      const db = getDb();

      // Idempotent insert — ON CONFLICT DO NOTHING (T7 duplicate delivery)
      await db.insert(authMethods).values({
        privyUserId: userId,
        authType,
        linkedAt: linkedAtDate,
      }).onConflictDoNothing();

      getLogger().info(
        {
          event: 'privy_webhook_auth_linked_processed',
          userId,
          authType,
          linkedAt: linkedAtDate.toISOString(),
          svixId,
        },
        'Privy auth.linked event processed',
      );

      return reply.status(200).send({ ok: true });
    },
  );
}
