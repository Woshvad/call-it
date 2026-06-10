/**
 * Privy session JWT verifier for the Call It relayer (Phase 1, Plan 06).
 *
 * Provides:
 *   - getPrivyClient() — memoized PrivyClient singleton
 *   - privySessionPreHandler — Fastify preHandler that verifies Authorization: Bearer <token>
 *     via @privy-io/server-auth and attaches req.privyUserId
 *
 * This preHandler is the canonical session-auth gate for all user-facing
 * relayer routes in Plans 07/08/09. Export it and reuse — do NOT duplicate.
 *
 * Security (T-01-33):
 *   - PRIVY_APP_SECRET sourced from GCP Secret Manager (Phase 0 D-09)
 *   - Invalid/missing token returns 401 { error: 'unauthorized', code: 'invalid_session' }
 *   - All verify results logged with { event: 'privy_session_verified' | 'privy_session_invalid' }
 *
 * Requirements: AUTH-19, Pitfall D (D-09/10), T-01-33
 */

import { PrivyClient } from '@privy-io/server-auth';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { getLogger } from './logger.js';

// ─── Module augmentation ──────────────────────────────────────────────────────
// Extend FastifyRequest to carry the verified Privy user ID so route handlers
// can access it as `request.privyUserId` without re-parsing the token.
declare module 'fastify' {
  interface FastifyRequest {
    privyUserId?: string;
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _privyClient: PrivyClient | undefined;

/**
 * Returns the memoized PrivyClient singleton.
 * Reads the app id from NEXT_PUBLIC_PRIVY_APP_ID (primary, GCP-sourced /
 * frontend-matching) with PRIVY_APP_ID as a legacy fallback, plus
 * PRIVY_APP_SECRET, from process.env.
 * Throws if the resolved app id or the secret is missing (caught at startup,
 * not at request time).
 */
export function getPrivyClient(): PrivyClient {
  if (_privyClient) return _privyClient;

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? process.env.PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error(
      'NEXT_PUBLIC_PRIVY_APP_ID (primary) / PRIVY_APP_ID (fallback) and ' +
        'PRIVY_APP_SECRET are required for privySessionPreHandler',
    );
  }

  _privyClient = new PrivyClient(appId, appSecret);
  return _privyClient;
}

/**
 * Reset the Privy client singleton (for testing only).
 * @internal
 */
export function _resetPrivyClientForTesting(): void {
  _privyClient = undefined;
}

/**
 * Inject a pre-built PrivyClient (for testing with mocks).
 * @internal
 */
export function _setPrivyClientForTesting(client: PrivyClient): void {
  _privyClient = client;
}

// ─── preHandler ──────────────────────────────────────────────────────────────

/**
 * Fastify preHandler that verifies a Privy session JWT.
 *
 * Extracts the token from `Authorization: Bearer <token>`, calls
 * `privy.verifyAuthToken(token)`, and attaches `request.privyUserId`.
 *
 * Returns 401 on any failure:
 *   { error: 'unauthorized', code: 'invalid_session' }
 *
 * Usage:
 *   app.get('/api/onboarding/state', { preHandler: privySessionPreHandler }, handler);
 *
 * Re-export this from routes that need session auth — Plans 07/08/09 use the same gate.
 */
export async function privySessionPreHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    getLogger().warn(
      { event: 'privy_session_invalid', reason: 'missing_bearer_header' },
      'session rejected — no Authorization header',
    );
    await reply.status(401).send({ error: 'unauthorized', code: 'invalid_session' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();

  try {
    const privy = getPrivyClient();
    const result = await privy.verifyAuthToken(token);

    // Attach the verified user ID to the request for route handlers
    request.privyUserId = result.userId;

    getLogger().info(
      { event: 'privy_session_verified', privyUserId: result.userId },
      'session OK',
    );
  } catch (e) {
    getLogger().warn(
      {
        event: 'privy_session_invalid',
        err: e instanceof Error ? e.message : String(e),
      },
      'session rejected',
    );
    await reply.status(401).send({ error: 'unauthorized', code: 'invalid_session' });
  }
}
