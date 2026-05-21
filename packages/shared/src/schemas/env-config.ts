/**
 * Environment configuration schema — zod validation for Call It env vars.
 *
 * Enforces:
 * - NEXT_PUBLIC_NETWORK ∈ { 'mainnet', 'sepolia' }
 * - If mainnet: NEXT_PUBLIC_CHAIN_ID must be '42161'
 * - If mainnet: NEXT_PUBLIC_SUBGRAPH_URL must NOT contain 'arbitrum-sepolia'
 *   (in-app cross-check that mirrors the CI grep guard from grep-guards.yml — D-09)
 * - If sepolia: NEXT_PUBLIC_CHAIN_ID must be '421614'
 *
 * This is a layered defense (D-09): the grep guard catches it in CI,
 * and this schema catches it at runtime before any chain interaction.
 *
 * Requirement: OPS-21 (network hardcoded), Pitfall 5 (Sepolia↔mainnet drift)
 */

import { z } from 'zod';

export const EnvConfigSchema = z
  .object({
    NEXT_PUBLIC_NETWORK: z.enum(['mainnet', 'sepolia']),
    NEXT_PUBLIC_CHAIN_ID: z.string(),
    NEXT_PUBLIC_SUBGRAPH_URL: z.string().url().optional(),
    NEXT_PUBLIC_OG_BASE_URL: z.string().url().optional(),
    NEXT_PUBLIC_RELAYER_URL: z.string().url().optional(),
    NEXT_PUBLIC_BRAND_FOOTER: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.NEXT_PUBLIC_NETWORK === 'mainnet') {
      // Mainnet must use chain ID 42161
      if (data.NEXT_PUBLIC_CHAIN_ID !== '42161') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['NEXT_PUBLIC_CHAIN_ID'],
          message:
            'NEXT_PUBLIC_NETWORK=mainnet requires NEXT_PUBLIC_CHAIN_ID=42161 (Arbitrum One). ' +
            'Got: ' +
            data.NEXT_PUBLIC_CHAIN_ID,
        });
      }

      // Mainnet subgraph URL must not point to arbitrum-sepolia (Pitfall 5)
      if (
        data.NEXT_PUBLIC_SUBGRAPH_URL &&
        (data.NEXT_PUBLIC_SUBGRAPH_URL.includes('arbitrum-sepolia') ||
          data.NEXT_PUBLIC_SUBGRAPH_URL.includes('421614'))
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['NEXT_PUBLIC_SUBGRAPH_URL'],
          message:
            'NEXT_PUBLIC_NETWORK=mainnet but NEXT_PUBLIC_SUBGRAPH_URL references arbitrum-sepolia. ' +
            'This is Pitfall 5 — Sepolia config on mainnet day. Update to the mainnet subgraph URL.',
        });
      }
    }

    if (data.NEXT_PUBLIC_NETWORK === 'sepolia') {
      // Sepolia must use chain ID 421614
      if (data.NEXT_PUBLIC_CHAIN_ID !== '421614') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['NEXT_PUBLIC_CHAIN_ID'],
          message:
            'NEXT_PUBLIC_NETWORK=sepolia requires NEXT_PUBLIC_CHAIN_ID=421614 (Arbitrum Sepolia). ' +
            'Got: ' +
            data.NEXT_PUBLIC_CHAIN_ID,
        });
      }
    }
  });

export type EnvConfig = z.infer<typeof EnvConfigSchema>;
