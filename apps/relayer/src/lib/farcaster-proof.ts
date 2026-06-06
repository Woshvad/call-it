/**
 * Farcaster SIWF link-proof verification (AUTH-07, Pitfall 3).
 *
 * The frontend produces a Sign-In-With-Farcaster signed message via
 * @farcaster/auth-kit; the relayer verifies it here with @farcaster/auth-client's
 * verifySignInMessage, asserting the server-issued nonce and the AuthKitProvider
 * domain match the message (Pitfall 3 — a SIWF message without strict nonce+domain
 * checks is replayable / cross-app forgeable).
 *
 * Security:
 *  - V2/V3: server-issued nonce (stored in Redis with short TTL by the link route)
 *    + strict domain equality. Both nonce AND domain MUST be non-empty (we reject
 *    a verify attempt that omits either — defeating the anti-replay control).
 *  - Throws `siwf_verification_failed` on success:false.
 *  - Returns the verified fid (the Farcaster identity) on success.
 *
 * Requirements: AUTH-07. Pitfall 3.
 */

import { createAppClient, viemConnector } from '@farcaster/auth-client';
import { getLogger } from './logger.js';

export interface VerifyFarcasterProofParams {
  /** Server-issued nonce for this attempt (MUST equal the message nonce) — Pitfall 3. */
  nonce: string;
  /** AuthKitProvider domain (MUST equal the message domain) — Pitfall 3. */
  domain: string;
  /** The SIWF message string from the relay channel. */
  message: string;
  /** The user's Farcaster wallet signature over the message. */
  signature: `0x${string}`;
}

export interface VerifiedFarcaster {
  /** The verified Farcaster id. */
  fid: number;
}

/**
 * Lazily build the app client. The relay URL comes from FARCASTER_RELAY_URL
 * (added in 01.5-01); fall back to the public Farcaster relay when unset (dev).
 */
function buildAppClient() {
  const relay = process.env.FARCASTER_RELAY_URL || 'https://relay.farcaster.xyz';
  return createAppClient({ relay, ethereum: viemConnector() });
}

/**
 * Verify a SIWF sign-in message and return the verified fid.
 *
 * @throws Error('siwf_missing_nonce_or_domain') if nonce or domain is empty
 *         (Pitfall 3 — both must be provided or anti-replay is defeated).
 * @throws Error('siwf_verification_failed') when verifySignInMessage returns success:false.
 */
export async function verifyFarcasterProof(
  params: VerifyFarcasterProofParams,
): Promise<VerifiedFarcaster> {
  const { nonce, domain, message, signature } = params;

  // Pitfall 3: BOTH nonce and domain are mandatory. An empty value silently
  // disables the corresponding anti-replay check inside verifySignInMessage.
  if (!nonce || nonce.trim().length === 0 || !domain || domain.trim().length === 0) {
    getLogger().warn(
      { event: 'social_link_farcaster_missing_nonce_or_domain', hasNonce: !!nonce, hasDomain: !!domain },
      'SIWF verify rejected — nonce and domain are both required (Pitfall 3)',
    );
    throw new Error('siwf_missing_nonce_or_domain');
  }

  const appClient = buildAppClient();

  const result = (await appClient.verifySignInMessage({
    nonce,
    domain,
    message,
    signature,
  })) as { success: boolean; fid?: number };

  if (!result.success) {
    getLogger().warn(
      { event: 'social_link_farcaster_verify_failed', domain },
      'SIWF verifySignInMessage returned success:false',
    );
    throw new Error('siwf_verification_failed');
  }

  return { fid: Number(result.fid) };
}
