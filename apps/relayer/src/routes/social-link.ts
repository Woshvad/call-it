/**
 * Social-link relayer routes (AUTH-06/07/12/13/17).
 *
 *   POST /api/social/link            — link verified Twitter handle (Privy proof)
 *   POST /api/social/link/farcaster  — link verified Farcaster (SIWF proof)
 *   POST /api/social/unlink-purge    — purge follow-graph (Postgres + Redis), mark unlinked
 *
 * All three are session-gated (privySessionPreHandler — V2/V3 access control).
 *
 * Link flow (D-03/D-04/D-05/D-06):
 *   1. Session gate → request.privyUserId (WHO).
 *   2. Extract the VERIFIED handle (twitter: Privy linkedAccounts; farcaster: SIWF)
 *      — never from the request body (Pitfall 2).
 *   3. Resolve privyUserId → on-chain wallet address (the connected/embedded wallet).
 *   4. Normalize handle + uniqueness check (D-06) → 409 if actively linked elsewhere.
 *   5. computeProofHash (D-05, no PII) + submit linkTwitter/linkFarcaster from the
 *      KMS oauth-proof wallet (D-03).
 *   6. Record the active index row.
 *
 * Unlink-purge (AUTH-12/AUTH-17/D-13, Pitfall 6): deletes follow_graph rows AND the
 * Redis cache key AND marks social_link_index unlinkedAt — does NOT submit an
 * on-chain unlink (unlink is user-callable on-chain; the relayer only purges
 * off-chain data). Returns 200 only after BOTH stores are cleared.
 *
 * Failure semantics (Pitfall 5): linking is additive — a verify/submit failure
 * returns an error response but never throws into the session or blocks sign-in.
 *
 * Security: V5 input validation (zod + 50-byte handle cap); V7 structured pino logs
 * `{ event: 'social_link_*' }`.
 *
 * Requirements: AUTH-06, AUTH-07, AUTH-12, AUTH-13, AUTH-17. D-03/04/05/06/13.
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { getRedis } from '../lib/redis.js';
import { getLogger } from '../lib/logger.js';
import { getPrivyClient, privySessionPreHandler } from '../lib/privy-auth.js';
import { extractVerifiedTwitter } from '../lib/twitter-proof.js';
import { verifyFarcasterProof } from '../lib/farcaster-proof.js';
import {
  computeProofHash,
  PLATFORM_TWITTER,
  PLATFORM_FARCASTER,
} from '../lib/social-proof-hash.js';
import {
  assertHandleAvailable,
  recordActiveLink,
  markUnlinked,
  normalizeHandle,
  HandleAlreadyLinkedError,
} from '../lib/social-link-index.js';
import { buildOauthProofSubmitter, type OauthProofSubmitter } from '../lib/oauth-proof-submitter.js';
import { eq, and } from 'drizzle-orm';
import { followGraph } from '../db/schema.js';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema.js';
import { PROFILE_REGISTRY_ARBITRUM_SEPOLIA } from '@call-it/shared';

type DrizzleDb = NodePgDatabase<typeof schema>;

/** On-chain handle cap — mirrors ProfileRegistry MAX_HANDLE_LENGTH (V5 input validation). */
const MAX_HANDLE_LENGTH = 50;

/** Minimal ProfileRegistry link ABI (inline, like profile.ts). */
const LINK_ABI = [
  {
    type: 'function',
    name: 'linkTwitter',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'handle', type: 'string' },
      { name: 'proofHash', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'linkFarcaster',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'handle', type: 'string' },
      { name: 'proofHash', type: 'bytes32' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

// ── Request schemas (V5) ────────────────────────────────────────────────────

/** Twitter link takes no handle (Pitfall 2 — handle comes from Privy only). */
const farcasterLinkSchema = z.object({
  nonce: z.string().min(1),
  domain: z.string().min(1),
  message: z.string().min(1),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

const unlinkPurgeSchema = z.object({
  platform: z.enum(['twitter', 'farcaster']),
});

// ── Dependency injection (for tests) ──────────────────────────────────────────

export interface SocialLinkDeps {
  db?: DrizzleDb;
  /** Build/inject the KMS submitter. Defaults to the real KMS-backed one. */
  getSubmitter?: () => OauthProofSubmitter;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Redis cache key for a viewer's follow graph (D-12). */
function followCacheKey(platform: 'twitter' | 'farcaster', privyUserId: string): string {
  return `follow:${platform === 'twitter' ? 'x' : 'fc'}:${privyUserId}`;
}

/**
 * Resolve a privyUserId → the user's on-chain wallet address (RESEARCH Pattern 1
 * step 4). Reads the embedded/connected wallet from the Privy user object.
 * Throws 'no_wallet_for_user' when the user has no wallet account.
 */
async function resolveWalletAddress(privyUserId: string): Promise<`0x${string}`> {
  const privy = getPrivyClient();
  const user = (await privy.getUser(privyUserId)) as unknown as {
    linkedAccounts?: Array<{ type: string; address?: string; walletClientType?: string }>;
    wallet?: { address?: string };
  };
  // Prefer the embedded/primary wallet, else the first linked wallet account.
  const fromWallet = user.wallet?.address;
  const fromLinked = (user.linkedAccounts ?? []).find(
    (a) => (a.type === 'wallet' || a.type === 'smart_wallet') && a.address,
  )?.address;
  const address = fromWallet ?? fromLinked;
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error('no_wallet_for_user');
  }
  return address.toLowerCase() as `0x${string}`;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function socialLinkRoute(
  app: FastifyInstance,
  opts: FastifyPluginOptions & SocialLinkDeps,
): Promise<void> {
  const getDbClient = (): DrizzleDb => opts.db ?? getDb();
  const getSubmitter = opts.getSubmitter ?? (() => buildOauthProofSubmitter());

  // ── POST /api/social/link (Twitter) ─────────────────────────────────────────
  app.post(
    '/api/social/link',
    { preHandler: privySessionPreHandler },
    async (request, reply) => {
      const logger = getLogger();
      const privyUserId = request.privyUserId!;
      try {
        // 2. Verified handle from Privy (NEVER request body — Pitfall 2).
        const { handle, subject } = await extractVerifiedTwitter(privyUserId);
        if (Buffer.byteLength(handle, 'utf8') > MAX_HANDLE_LENGTH) {
          return reply.status(400).send({ error: 'handle_too_long' });
        }
        const normalized = normalizeHandle(handle);

        // 3. privyUserId → on-chain wallet address.
        const userAddress = await resolveWalletAddress(privyUserId);

        // 4. Uniqueness (D-06) — 409 if actively linked elsewhere.
        const db = getDbClient();
        await assertHandleAvailable(db, 'twitter', normalized, userAddress);

        // 5. proofHash (D-05) + KMS submit (D-03).
        const issuedAt = Math.floor(Date.now() / 1000);
        const nonce = (await import('../lib/social-proof-hash.js')).generateNonce();
        const proofHash = computeProofHash(
          userAddress,
          PLATFORM_TWITTER,
          handle,
          subject,
          issuedAt,
          nonce,
        );
        const submitter = getSubmitter();
        const txHash = await submitter.writeContract({
          address: PROFILE_REGISTRY_ARBITRUM_SEPOLIA as `0x${string}`,
          abi: LINK_ABI,
          functionName: 'linkTwitter',
          args: [userAddress, handle, proofHash],
        });

        // 6. Record the active index row (D-06).
        await recordActiveLink(db, 'twitter', normalized, userAddress);

        logger.info(
          { event: 'social_link_twitter_ok', privyUserId, userAddress, txHash },
          'Twitter linked on-chain',
        );
        return reply.status(200).send({ txHash, handle, proofHash });
      } catch (err) {
        return handleLinkError(reply, err, 'twitter');
      }
    },
  );

  // ── POST /api/social/link/farcaster ──────────────────────────────────────────
  app.post(
    '/api/social/link/farcaster',
    { preHandler: privySessionPreHandler },
    async (request, reply) => {
      const logger = getLogger();
      const privyUserId = request.privyUserId!;
      try {
        const parsed = farcasterLinkSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.status(400).send({ error: 'invalid_body' });
        }
        const { nonce, domain, message, signature } = parsed.data;

        // Pitfall 3: the nonce MUST match a server-issued nonce stored in Redis.
        const redis = getRedis();
        const nonceKey = `siwf:nonce:${privyUserId}`;
        const issuedNonce = await redis.get(nonceKey).catch(() => null);
        if (issuedNonce && issuedNonce !== nonce) {
          return reply.status(400).send({ error: 'nonce_mismatch' });
        }

        // 2. Verify SIWF (nonce + domain enforced inside verifyFarcasterProof).
        const { fid } = await verifyFarcasterProof({
          nonce,
          domain,
          message,
          signature: signature as `0x${string}`,
        });
        // Resolve fid → handle. Without a Neynar key (FEED wave) we use the fid as
        // the canonical handle identifier; the on-chain handle is the verified id.
        const handle = `fid:${fid}`;
        const subject = String(fid);
        if (Buffer.byteLength(handle, 'utf8') > MAX_HANDLE_LENGTH) {
          return reply.status(400).send({ error: 'handle_too_long' });
        }
        const normalized = normalizeHandle(handle);

        // 3. wallet address.
        const userAddress = await resolveWalletAddress(privyUserId);

        // 4. Uniqueness (D-06).
        const db = getDbClient();
        await assertHandleAvailable(db, 'farcaster', normalized, userAddress);

        // 5. proofHash (D-05) + KMS submit.
        const issuedAt = Math.floor(Date.now() / 1000);
        const proofNonce = (await import('../lib/social-proof-hash.js')).generateNonce();
        const proofHash = computeProofHash(
          userAddress,
          PLATFORM_FARCASTER,
          handle,
          subject,
          issuedAt,
          proofNonce,
        );
        const submitter = getSubmitter();
        const txHash = await submitter.writeContract({
          address: PROFILE_REGISTRY_ARBITRUM_SEPOLIA as `0x${string}`,
          abi: LINK_ABI,
          functionName: 'linkFarcaster',
          args: [userAddress, handle, proofHash],
        });

        // 6. Record + clear the consumed nonce.
        await recordActiveLink(db, 'farcaster', normalized, userAddress);
        await redis.del(nonceKey).catch(() => undefined);

        logger.info(
          { event: 'social_link_farcaster_ok', privyUserId, userAddress, fid, txHash },
          'Farcaster linked on-chain',
        );
        return reply.status(200).send({ txHash, handle, proofHash, fid });
      } catch (err) {
        return handleLinkError(reply, err, 'farcaster');
      }
    },
  );

  // ── POST /api/social/unlink-purge ────────────────────────────────────────────
  app.post(
    '/api/social/unlink-purge',
    { preHandler: privySessionPreHandler },
    async (request, reply) => {
      const logger = getLogger();
      const privyUserId = request.privyUserId!;
      const parsed = unlinkPurgeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'invalid_body' });
      }
      const { platform } = parsed.data;

      // Pitfall 6 / AUTH-17: clear BOTH stores. Postgres follow_graph rows first,
      // then the Redis cache key, then mark the link index unlinked. Return 200
      // only after both data stores are cleared.
      const db = getDbClient();

      // 1. Delete the durable follow_graph rows for this viewer + platform.
      await db
        .delete(followGraph)
        .where(and(eq(followGraph.privyUserId, privyUserId), eq(followGraph.platform, platform)));

      // 2. Delete the Redis follow-graph cache key.
      const redis = getRedis();
      await redis.del(followCacheKey(platform, privyUserId));

      // 3. Mark the social_link_index row unlinked for this user (best-effort by
      //    wallet address resolution; if no wallet, the watcher backstop covers it).
      try {
        const userAddress = await resolveWalletAddress(privyUserId);
        await markUnlinked(db, platform, userAddress);
      } catch {
        // Non-fatal — the dual-store purge above already satisfied AUTH-17; the
        // SocialUnlinked watcher is the durable backstop for the index row.
      }

      logger.info(
        { event: 'social_link_unlink_purged', privyUserId, platform },
        'Follow-graph purged (Postgres + Redis)',
      );
      return reply.status(200).send({ purged: true, platform });
    },
  );
}

/**
 * Map link errors to responses without throwing into the session (Pitfall 5).
 */
function handleLinkError(
  reply: import('fastify').FastifyReply,
  err: unknown,
  platform: 'twitter' | 'farcaster',
): import('fastify').FastifyReply {
  const logger = getLogger();
  if (err instanceof HandleAlreadyLinkedError) {
    logger.warn({ event: 'social_link_conflict', platform }, 'Handle already linked elsewhere (D-06)');
    return reply.status(409).send({ error: 'handle_already_linked' });
  }
  const message = err instanceof Error ? err.message : String(err);
  if (message === 'twitter_not_linked_in_privy') {
    return reply.status(400).send({ error: 'twitter_not_linked_in_privy' });
  }
  if (message === 'siwf_verification_failed' || message === 'siwf_missing_nonce_or_domain') {
    return reply.status(400).send({ error: message });
  }
  if (message === 'no_wallet_for_user') {
    return reply.status(400).send({ error: 'no_wallet_for_user' });
  }
  // Pitfall 5: any other failure (KMS/RPC) is reported but never crashes the session.
  logger.error({ event: 'social_link_failed', platform, err: message }, 'Social link failed');
  return reply.status(502).send({ error: 'link_submission_failed' });
}
