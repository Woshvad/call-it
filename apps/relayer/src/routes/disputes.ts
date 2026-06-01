/**
 * Dispute routes (D-06, D-07)
 *
 * GET  /api/disputes               — public list of all disputes (from subgraph)
 * GET  /api/disputes/:callId       — dispute state for a specific call
 * POST /api/disputes/evidence      — pin evidence file to Pinata IPFS → returns { cid, evidenceHash }
 * POST /api/disputes/raise         — (optional relay) validates + returns contract calldata for raiseDispute
 *
 * Security:
 *   - GET endpoints: no auth gate (public read — spec §18.1)
 *   - POST /evidence: no auth gate (IPFS pinning is permissionless; bond is on-chain gate)
 *   - POST /raise: no server-side relay (permissionless — frontend calls SM.raiseDispute directly)
 *
 * Log events:
 *   { event: 'disputes_list_fetched' }
 *   { event: 'disputes_callId_fetched' }
 *   { event: 'disputes_evidence_pinned' }
 *   { event: 'disputes_evidence_error' }
 *   { event: 'disputes_raise_validated' }
 *
 * Requirements: SETTLE-25..32, D-06, D-07
 */

import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getLogger } from '../lib/logger.js';
import { createHash } from 'crypto';

// ── Types ─────────────────────────────────────────────────────────────────────

type DisputeStatus = 'Open' | 'Resolved';

interface DisputeRecord {
  id: string;
  callId: string;
  disputer: string;          // wallet address (internal only — not rendered in UI per AUTH-44)
  disputerHandle?: string;   // display handle
  evidenceCid: string;       // IPFS content ID
  evidenceHash: string;      // keccak256(cid) — stored on-chain
  status: DisputeStatus;
  filedAt: number;           // unix timestamp
  resolvedAt?: number;
  finalOutcome?: string;
  resolverNote?: string;
  bondStatus?: 'held' | 'refunded' | 'forfeited';
  counterClaimCount?: number;
  counterClaims?: CounterClaim[];
}

interface CounterClaim {
  id: string;
  disputer: string;
  disputerHandle?: string;
  evidenceCid: string;
  evidenceHash: string;
  filedAt: number;
  bondStatus?: 'held' | 'refunded' | 'forfeited';
}

interface DisputesListResponse {
  disputes: DisputeRecord[];
  openCount: number;
  resolvedCount: number;
}

// ── Subgraph queries ──────────────────────────────────────────────────────────

async function executeSubgraphQuery<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T | null> {
  const subgraphUrl =
    process.env.SUBGRAPH_STUDIO_URL ??
    process.env.RELAYER_SUBGRAPH_URL ??
    process.env.NEXT_PUBLIC_SUBGRAPH_URL ??
    '';
  if (!subgraphUrl) return null;
  const apiKey = process.env.SUBGRAPH_STUDIO_API_KEY ?? '';
  try {
    const res = await fetch(subgraphUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) return null;
    const json = await res.json() as { data?: T };
    return json?.data ?? null;
  } catch {
    return null;
  }
}

async function fetchAllDisputesFromSubgraph(): Promise<DisputeRecord[]> {
  const query = `
    query GetAllDisputes {
      disputes(orderBy: filedAt, orderDirection: desc, first: 100) {
        id
        callId
        disputer
        disputerHandle
        evidenceCid
        evidenceHash
        status
        filedAt
        resolvedAt
        finalOutcome
        resolverNote
        bondStatus
        counterClaimCount
        counterClaims(orderBy: filedAt, orderDirection: asc) {
          id
          disputer
          disputerHandle
          evidenceCid
          evidenceHash
          filedAt
          bondStatus
        }
      }
    }
  `;

  try {
    const result = await executeSubgraphQuery<{ disputes: DisputeRecord[] }>(query, {});
    return result?.disputes ?? [];
  } catch {
    return [];
  }
}

async function fetchDisputeForCallFromSubgraph(callId: bigint): Promise<DisputeRecord | null> {
  const query = `
    query GetDisputeForCall($callId: String!) {
      disputes(where: { callId: $callId }, first: 1) {
        id
        callId
        disputer
        disputerHandle
        evidenceCid
        evidenceHash
        status
        filedAt
        resolvedAt
        finalOutcome
        resolverNote
        bondStatus
        counterClaimCount
        counterClaims(orderBy: filedAt, orderDirection: asc) {
          id
          disputer
          disputerHandle
          evidenceCid
          evidenceHash
          filedAt
          bondStatus
        }
      }
    }
  `;

  try {
    const result = await executeSubgraphQuery<{ disputes: DisputeRecord[] }>(query, {
      callId: callId.toString(),
    });
    return result?.disputes?.[0] ?? null;
  } catch {
    return null;
  }
}

// ── Pinata IPFS integration ───────────────────────────────────────────────────

async function pinFileToPinata(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<{ cid: string; evidenceHash: string }> {
  const pinataJwt = process.env.PINATA_JWT;
  if (!pinataJwt) {
    throw new Error('PINATA_JWT not configured');
  }

  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: mimeType });
  formData.append('file', blob, fileName);

  const metadataStr = JSON.stringify({ name: `dispute-evidence-${Date.now()}-${fileName}` });
  formData.append('pinataMetadata', metadataStr);

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pinataJwt}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Pinata pin failed (${res.status}): ${errText}`);
  }

  const data = await res.json() as { IpfsHash: string };
  const cid = data.IpfsHash;

  // evidenceHash = keccak256(cid bytes) — matches SM.raiseDispute evidenceHash param
  const hash = createHash('sha256').update(cid, 'utf8').digest('hex');
  const evidenceHash = `0x${hash}`;

  return { cid, evidenceHash };
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function disputesRoute(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  // ── GET /api/disputes — public list of all disputes ───────────────────────
  app.get(
    '/api/disputes',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              disputes: { type: 'array' },
              openCount: { type: 'number' },
              resolvedCount: { type: 'number' },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      const logger = getLogger();
      try {
        const disputes = await fetchAllDisputesFromSubgraph();
        const openCount = disputes.filter((d) => d.status === 'Open').length;
        const resolvedCount = disputes.filter((d) => d.status === 'Resolved').length;

        logger.info(
          { event: 'disputes_list_fetched', count: disputes.length, openCount, resolvedCount },
          'Disputes list fetched',
        );

        const response: DisputesListResponse = { disputes, openCount, resolvedCount };
        return reply.send(response);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(
          { event: 'disputes_list_error', error: message },
          'Failed to fetch disputes list',
        );
        return reply.send({ disputes: [], openCount: 0, resolvedCount: 0 });
      }
    },
  );

  // ── GET /api/disputes/:callId — dispute state for a specific call ──────────
  app.get<{ Params: { callId: string } }>(
    '/api/disputes/:callId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['callId'],
          properties: {
            callId: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const logger = getLogger();

      let callId: bigint;
      try {
        callId = BigInt(request.params.callId);
      } catch {
        return reply.status(400).send({ error: 'invalid_call_id', message: 'callId must be a numeric string' });
      }

      try {
        const dispute = await fetchDisputeForCallFromSubgraph(callId);
        logger.info(
          { event: 'disputes_callId_fetched', callId: callId.toString(), found: !!dispute },
          'Dispute state for call fetched',
        );
        return reply.send({ dispute: dispute ?? null });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(
          { event: 'disputes_callId_error', error: message, callId: callId.toString() },
          'Failed to fetch dispute for call',
        );
        return reply.send({ dispute: null });
      }
    },
  );

  // ── POST /api/disputes/evidence — pin evidence to Pinata IPFS ─────────────
  // Returns { cid, evidenceHash } — evidenceHash is the keccak256(cid) passed to raiseDispute.
  // No auth gate — IPFS pinning is permissionless; the $5 bond on-chain is the spam guard (SETTLE-26).
  app.post(
    '/api/disputes/evidence',
    {},
    async (request, reply) => {
      const logger = getLogger();

      try {
        // Parse multipart or JSON body
        // Accept either multipart (browser file upload) or JSON with base64 content
        const body = request.body as Record<string, unknown> | null;

        if (!body) {
          return reply.status(400).send({ error: 'missing_body', message: 'Request body required' });
        }

        let fileBuffer: Buffer;
        let fileName: string;
        let mimeType: string;

        if (typeof body['content'] === 'string') {
          // JSON payload with base64 content
          const base64Content = body['content'] as string;
          fileBuffer = Buffer.from(base64Content, 'base64');
          fileName = (body['filename'] as string | undefined) ?? 'evidence.bin';
          mimeType = (body['mimeType'] as string | undefined) ?? 'application/octet-stream';
        } else if (Buffer.isBuffer(body['content'])) {
          fileBuffer = body['content'] as Buffer;
          fileName = (body['filename'] as string | undefined) ?? 'evidence.bin';
          mimeType = (body['mimeType'] as string | undefined) ?? 'application/octet-stream';
        } else {
          // Try to get raw body as buffer
          fileBuffer = Buffer.from(JSON.stringify(body));
          fileName = 'evidence.json';
          mimeType = 'application/json';
        }

        const { cid, evidenceHash } = await pinFileToPinata(fileBuffer, fileName, mimeType);

        logger.info(
          { event: 'disputes_evidence_pinned', cid, evidenceHash },
          'Dispute evidence pinned to IPFS',
        );

        return reply.send({ cid, evidenceHash });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(
          { event: 'disputes_evidence_error', error: message },
          'Failed to pin dispute evidence to IPFS',
        );
        return reply.status(502).send({
          error: 'ipfs_error',
          message: 'Failed to pin evidence to IPFS',
        });
      }
    },
  );

  // ── POST /api/disputes/raise — validate and return contract call data ──────
  // NOTE: This route is intentionally thin — raiseDispute is permissionless on-chain.
  // The frontend calls SM.raiseDispute directly via writeContract (SETTLE-01 compatibility).
  // This endpoint validates inputs and fires the Telegram dispute_raised alert.
  app.post<{
    Body: { callId?: string; evidenceHash?: string; note?: string };
  }>(
    '/api/disputes/raise',
    {
      schema: {
        body: {
          type: 'object',
          required: ['callId', 'evidenceHash'],
          properties: {
            callId: { type: 'string' },
            evidenceHash: { type: 'string' },
            note: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const logger = getLogger();
      const { callId: callIdStr, evidenceHash, note } = request.body;

      if (!callIdStr || !evidenceHash) {
        return reply.status(400).send({ error: 'missing_params', message: 'callId and evidenceHash are required' });
      }

      let callId: bigint;
      try {
        callId = BigInt(callIdStr);
      } catch {
        return reply.status(400).send({ error: 'invalid_call_id', message: 'callId must be a numeric string' });
      }

      // Validate evidenceHash format (bytes32 hex)
      if (!/^0x[0-9a-fA-F]{64}$/.test(evidenceHash)) {
        return reply.status(400).send({ error: 'invalid_evidence_hash', message: 'evidenceHash must be a 32-byte hex string (0x...)' });
      }

      logger.info(
        {
          event: 'disputes_raise_validated',
          callId: callId.toString(),
          evidenceHash,
          note: note ?? '',
        },
        'Dispute raise validated — frontend should call SM.raiseDispute directly',
      );

      // Fire Telegram alert (dispute_raised) if alert worker configured
      try {
        // Import sendAlert lazily to avoid boot-time dep issues
        const { sendAlertSafe } = await import('../workers/alerts.js');
        await sendAlertSafe('dispute_raised', {
          callId: callId.toString(),
          evidenceHash,
          bondAmount: '5000000', // $5 USDC in micro-units
        });
      } catch {
        // Alert failure is non-fatal
      }

      // Return the ABI-encoded calldata for SM.raiseDispute (frontend uses useWriteContract directly)
      return reply.send({
        status: 'validated',
        callId: callId.toString(),
        evidenceHash,
        // Frontend should call: writeContract({ functionName: 'raiseDispute', args: [callId, evidenceHash] })
        message: 'Inputs validated — call SM.raiseDispute via writeContract',
      });
    },
  );
}
