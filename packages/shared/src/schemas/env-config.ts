/**
 * Environment configuration schema — zod validation for Call It env vars.
 *
 * Phase 0 base:
 * - NEXT_PUBLIC_NETWORK ∈ { 'mainnet', 'sepolia' }
 * - If mainnet: NEXT_PUBLIC_CHAIN_ID must be '42161'
 * - If mainnet: NEXT_PUBLIC_SUBGRAPH_URL must NOT contain 'arbitrum-sepolia'
 *   (in-app cross-check that mirrors the CI grep guard from grep-guards.yml — D-09)
 * - If sepolia: NEXT_PUBLIC_CHAIN_ID must be '421614'
 *
 * Phase 1 additions (Plan 01-01):
 * - NEXT_PUBLIC_PRIVY_APP_ID: required — Privy app identifier
 * - NEXT_PUBLIC_ALCHEMY_AA_POLICY_ID: required — Alchemy gas policy for ERC-4337 sponsorship
 * - NEXT_PUBLIC_RELAYER_BASE_URL: required — base URL for relayer proxy endpoints
 * - NEXT_PUBLIC_CALL_REGISTRY_ADDRESS: optional until Phase 1 contract deploy
 * - NEXT_PUBLIC_PROFILE_REGISTRY_ADDRESS: optional until Phase 1 contract deploy
 * - NEXT_PUBLIC_CIRCLE_PAYMASTER_ADDRESS: required for post-cap USDC gas (D-04)
 * - ALCHEMY_PAYMASTER_ADDRESS: optional — relayer-side paymaster address
 * - PRIVY_APP_SECRET: required — server-side Privy verification (relayer only)
 * - PRIVY_WEBHOOK_SECRET: required — HMAC verification for Privy webhooks (Plan 07)
 * - POSTGRES_URL: required — Fly Postgres connection string (D-07)
 *   NOTE: POSTGRES_URL is a server-side secret; it MUST NOT be in NEXT_PUBLIC_ vars.
 *   Additional cross-field refine rejects localhost in mainnet profile (T-01-02).
 * - ENS_MAINNET_RPC_URL: required — Alchemy Ethereum Mainnet RPC for ENS resolution (D-13)
 *
 * This is a layered defense (D-09): the grep guard catches it in CI,
 * and this schema catches it at runtime before any chain interaction.
 *
 * Requirement: OPS-21 (network hardcoded), Pitfall 5 (Sepolia↔mainnet drift),
 *              AUTH-31 (address book), AUTH-32 (auth method cooldown), T-01-02
 */

import { z } from 'zod';

export const EnvConfigSchema = z
  .object({
    // ── Phase 0 — network / chain ─────────────────────────────────────────────
    NEXT_PUBLIC_NETWORK: z.enum(['mainnet', 'sepolia']),
    NEXT_PUBLIC_CHAIN_ID: z.string(),
    NEXT_PUBLIC_SUBGRAPH_URL: z.string().url().optional(),
    NEXT_PUBLIC_OG_BASE_URL: z.string().url().optional(),
    NEXT_PUBLIC_RELAYER_URL: z.string().url().optional(),
    NEXT_PUBLIC_BRAND_FOOTER: z.string().optional(),

    // ── Phase 1 — Privy + Alchemy AA ──────────────────────────────────────────
    /** Privy app identifier (NEXT_PUBLIC — safe in frontend bundle) */
    NEXT_PUBLIC_PRIVY_APP_ID: z.string().min(1),
    /** Alchemy gas policy ID for ERC-4337 paymaster sponsorship (AUTH-26, D-01) */
    NEXT_PUBLIC_ALCHEMY_AA_POLICY_ID: z.string().min(1),
    /** Base URL for relayer API proxy (no trailing slash) */
    NEXT_PUBLIC_RELAYER_BASE_URL: z.string().url(),

    // ── Phase 1 — Contract addresses (optional until deploy) ─────────────────
    /** CallRegistry address — null until Phase 1 contracts deployed */
    NEXT_PUBLIC_CALL_REGISTRY_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
    /** ProfileRegistry address — null until Phase 1 contracts deployed */
    NEXT_PUBLIC_PROFILE_REGISTRY_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),

    // ── Phase 1 — Wallet funding ──────────────────────────────────────────────
    // Funding provider was switched from Coinbase Onramp (spec D-34) to Privy-native
    // funding (useFundWallet) on 2026-05-29 — no app-specific env vars required; the
    // funding providers are configured in the Privy dashboard. The former
    // NEXT_PUBLIC_COINBASE_APP_ID / NEXT_PUBLIC_COINBASE_ONRAMP_API_KEY are removed.

    // ── Phase 1 — Circle USDC Paymaster (D-04/D-05) ───────────────────────────
    /**
     * Circle USDC Paymaster address on Arbitrum One (mainnet).
     * Wave 0 Task 3 verifies this address against current Arbitrum docs.
     * Source: https://docs.arbitrum.io/for-devs/third-party-docs/Circle/usdc-paymaster-quickstart
     */
    NEXT_PUBLIC_CIRCLE_PAYMASTER_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
    /** Alchemy paymaster address (relayer-side, not exposed to frontend) */
    ALCHEMY_PAYMASTER_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),

    // ── Phase 1 — Server-side secrets (relayer env, NOT frontend bundle) ──────
    /** Privy server-side app secret — @privy-io/server-auth verification */
    PRIVY_APP_SECRET: z.string().min(1).optional(),
    /** Privy webhook HMAC secret — Plan 07 webhook route uses this for verification */
    PRIVY_WEBHOOK_SECRET: z.string().min(1).optional(),

    // ── Phase 1 — Database (D-07 — Fly Postgres) ────────────────────────────
    /**
     * Fly Postgres connection string.
     * Accepts both postgres:// and postgresql:// prefixes.
     * SECURITY (T-01-02): Never in .env file or version control;
     * injected from Fly secrets (synced from GCP Secret Manager per D-09).
     */
    POSTGRES_URL: z
      .string()
      .refine(
        (v) => v.startsWith('postgres://') || v.startsWith('postgresql://'),
        { message: 'POSTGRES_URL must start with postgres:// or postgresql://' },
      )
      .optional(),

    // ── Phase 1 — ENS resolution (D-13) ────────────────────────────────────
    /**
     * Alchemy Ethereum Mainnet RPC URL for server-side ENS reverse-record resolution.
     * Separate from Arbitrum keys — per-network IAM isolation (D-09).
     */
    ENS_MAINNET_RPC_URL: z.string().url().optional(),

    // ── Phase 1.5 — Social linking (CORE wave, D-01..D-09) ───────────────────
    // ALL optional: the relayer runs in CI/dev without these, and the on-chain
    // social surface is already deployed (D-01). These are network-agnostic — no
    // mainnet superRefine applies (they hold the same value on Sepolia + mainnet).
    /**
     * Expected Ethereum address derived from the GCP `oauth-proof` KMS key.
     * Passed as `expectedAddress` to `gcpKmsAccount({ keyId: 'oauth-proof' })` (01.5-02)
     * and verified by `verifyKmsAddress()` at boot (RESEARCH Q2 / T-00-17).
     * MUST match the on-chain `ProfileRegistry.relayer()` value set via the
     * owner-gated `setRelayer` tx on the canonical PR — drift here = NotRelayer
     * at link time (Pitfall 1, T-01.5-01-02).
     */
    RELAYER_OAUTH_PROOF_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
    /**
     * Farcaster relay URL consumed by `@farcaster/auth-client` createAppClient
     * in 01.5-02. Documented default: https://relay.farcaster.xyz
     */
    FARCASTER_RELAY_URL: z.string().url().optional(),
    /**
     * AuthKitProvider domain asserted inside `verifySignInMessage` (Pitfall 3).
     * MUST equal the frontend AuthKitProvider domain set in 01.5-04 — a mismatch
     * makes every SIWF verification fail (replay/cross-app guard).
     */
    FARCASTER_AUTH_DOMAIN: z.string().min(1).optional(),

    // ── Phase 1.5 — FEED-wave secrets (01.5-05, gated) ──────────────────────
    // Optional so CORE never depends on them. Held in GCP Secret Manager in
    // production (Security Domain table); fall back to process.env in dev. The
    // FEED wave (X API / Neynar) is gated behind a checkpoint:human-verify.
    /** X API Bearer token (follows.read scope) — "From your X" (AUTH-14/15) */
    X_API_BEARER_TOKEN: z.string().min(1).optional(),
    /** Neynar API key — "From your Farcaster" follow graph (AUTH-18) */
    NEYNAR_API_KEY: z.string().min(1).optional(),
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

      // Mainnet POSTGRES_URL must not be localhost / 127.0.0.1 (T-01-02)
      if (
        data.POSTGRES_URL &&
        (data.POSTGRES_URL.includes('localhost') ||
          data.POSTGRES_URL.includes('127.0.0.1'))
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['POSTGRES_URL'],
          message:
            'NEXT_PUBLIC_NETWORK=mainnet but POSTGRES_URL points to localhost. ' +
            'This is T-01-02 — mainnet must use Fly Postgres, not a local DB.',
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
