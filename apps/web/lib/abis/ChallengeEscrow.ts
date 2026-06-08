/**
 * ChallengeEscrow ABI — typed const for viem inference.
 *
 * Source: promoted verbatim from the verified inline `CE_ABI` slice in
 *         apps/web/app/components/ChallengeFormModal.tsx (Phase 3, lines 38-50).
 *         That slice is already correct (do NOT re-derive — RESEARCH "Don't Hand-Roll").
 * Used by: the Frame tx wire route (apps/web/app/api/frame/tx/[callId]/route.ts,
 *          Plan 08-03) to encode one-tap proposeChallenge(callId, stake) calldata.
 *
 * Only the single function the Frame route needs is promoted; ChallengeFormModal.tsx
 * keeps its own inline slice unchanged (a follow-up may switch it to this import —
 * out of scope here to avoid touching a Phase-3 component).
 *
 * Requirements: SHARE-19 (SC2)
 */

export const challengeEscrowAbi = [
  {
    type: 'function',
    name: 'proposeChallenge',
    inputs: [
      { name: 'callId', type: 'uint256' },
      { name: 'stake', type: 'uint96' },
    ],
    outputs: [{ name: 'challengeId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
] as const;
