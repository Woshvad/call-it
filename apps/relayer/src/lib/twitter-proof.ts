/**
 * Twitter link-proof extraction (AUTH-06, D-04, Pitfall 2).
 *
 * The relayer trusts Privy's OAuth attestation: Privy already ran the Twitter
 * OAuth handshake at link time, so the verified handle lives in the user's
 * `linkedAccounts` as a `twitter_oauth` entry. This module reads that VERIFIED
 * handle server-side — it NEVER accepts a handle from the request body (Pitfall 2 /
 * anti-impersonation). Session auth (verifyAuthToken) tells us WHO is calling;
 * this read tells us WHICH handle they actually own.
 *
 * Distinct from privySessionPreHandler (session gate) — same Privy client
 * singleton, different operation (read linkedAccounts vs verify session JWT).
 *
 * Security:
 *  - V2/V4: handle is derived from the Privy-verified linked account, not the body.
 *  - Throws `twitter_not_linked_in_privy` when no twitter_oauth account is present.
 *
 * Requirements: AUTH-06, D-04. Pitfall 2.
 */

import { getPrivyClient } from './privy-auth.js';
import { getLogger } from './logger.js';

/** The verified Twitter claims extracted from Privy (handle + stable subject id). */
export interface VerifiedTwitter {
  /** Privy-verified Twitter username (handle), without a leading '@'. */
  handle: string;
  /** Stable X user id (the OAuth `sub` claim) — used in the proofHash subject field. */
  subject: string;
}

/** A linked account as returned by Privy getUser().linkedAccounts. */
interface PrivyLinkedAccount {
  type: string;
  username?: string | null;
  subject?: string | null;
}

/**
 * Extract the Privy-verified Twitter handle + subject for a session user.
 *
 * @param privyUserId the verified Privy DID (from privySessionPreHandler — request.privyUserId)
 * @returns the verified { handle, subject }
 * @throws Error('twitter_not_linked_in_privy') if no twitter_oauth account / username is present
 *
 * NOTE: the handle ALWAYS comes from Privy's linkedAccounts, never from a request
 * body argument (Pitfall 2). This function intentionally takes no handle parameter.
 */
export async function extractVerifiedTwitter(privyUserId: string): Promise<VerifiedTwitter> {
  const privy = getPrivyClient();
  const user = (await privy.getUser(privyUserId)) as unknown as {
    linkedAccounts?: PrivyLinkedAccount[];
  };

  const linkedAccounts = user.linkedAccounts ?? [];
  const twitter = linkedAccounts.find((a) => a.type === 'twitter_oauth');

  if (!twitter || !twitter.username) {
    getLogger().warn(
      { event: 'social_link_twitter_not_linked', privyUserId },
      'No verified twitter_oauth account on the Privy user',
    );
    throw new Error('twitter_not_linked_in_privy');
  }

  return {
    handle: twitter.username,
    // subject is the stable X user id; fall back to empty string only if Privy omits it.
    subject: twitter.subject ?? '',
  };
}
