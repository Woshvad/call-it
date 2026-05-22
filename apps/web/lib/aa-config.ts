/**
 * Alchemy Account Abstraction (AA) client factory — ERC-7677 middleware wiring.
 *
 * Plan 05 ships the config + factory function.
 * Plan 08 (publish flow) invokes sendUserOperation via the AA client.
 * Plan 07 (paymaster policy endpoint) implements the server-side relayer callback.
 *
 * AA integration approach (Wave 0 verification — RESEARCH A2 closure):
 *   @account-kit/infra is not bundled in apps/web at this stage (would pull in large AA
 *   SDK tree-shaking risk + has friction with Privy 3.27 embedded wallet as raw signer).
 *   Plan 05 ships a lightweight aa-config stub that exposes:
 *     1. erc7677PolicyUrl — the ERC-7677 callback URL pointing at the relayer endpoint
 *     2. createAaClient(privyEmbeddedWallet) — factory stub; full impl wired in Plan 07/08
 *
 *   If @account-kit/infra integrates cleanly with Privy embedded wallet as signer (Plan 07
 *   discovers), the factory body will be filled in. Otherwise permissionless viem-native
 *   helpers will be used as the RESEARCH A2 fallback (documented in SUMMARY).
 *
 * T-01-30: PRIVY_APP_SECRET must never appear in this file or any NEXT_PUBLIC_ var.
 *
 * Decision D-01: Alchemy AA vendor
 * Decision D-02: ERC-7677 policy endpoint enforces 5-tx cap server-side
 * Requirement: AUTH-27, AUTH-28
 * Source: RESEARCH.md Pattern 4, CONTEXT.md D-02
 */

/**
 * Base URL for the relayer API.
 * All relayer endpoints are proxied through NEXT_PUBLIC_RELAYER_BASE_URL.
 * Plan 07 implements the /paymaster/policy endpoint at this URL.
 */
const relayerBaseUrl = process.env['NEXT_PUBLIC_RELAYER_BASE_URL'] ?? '';

/**
 * ERC-7677 policy callback URL.
 * Alchemy's bundler will call POST <erc7677PolicyUrl> on each userOp sponsorship request.
 * The relayer at this endpoint reads the Upstash counter and returns sign-or-deny.
 *
 * Pattern: D-02 — vendor-agnostic chokepoint for the 5-tx cap.
 * Full endpoint implementation: Plan 07 (apps/relayer/src/routes/paymaster-policy.ts)
 */
export const erc7677PolicyUrl = `${relayerBaseUrl}/paymaster/policy`;

/**
 * Alchemy AA policy ID for the ERC-4337 paymaster gas policy.
 * This is the policy that Alchemy will use for the first 5 sponsored transactions.
 * The policy has a callback URL set to erc7677PolicyUrl (configured in Alchemy dashboard).
 */
export const alchemyAaPolicyId = process.env['NEXT_PUBLIC_ALCHEMY_AA_POLICY_ID'] ?? '';

/**
 * AA client factory stub.
 *
 * Full implementation lands in Plan 07/08 once the paymaster policy endpoint is live.
 * At that point this factory will:
 *   1. Accept a Privy embedded wallet's raw signer
 *   2. Create an Alchemy aa-sdk SmartAccountClient (or permissionless fallback)
 *   3. Wire the erc7677Middleware pointing at erc7677PolicyUrl
 *   4. Return the client for sendUserOperation calls (Plan 08 createCall flow)
 *
 * For now, the factory returns a typed stub so Plans 06/08/09 can import it without errors.
 *
 * Decision: If @account-kit/infra@4.x integrates with Privy 3.27 cleanly in Plan 07,
 *   use createAlchemySmartAccountClient + erc7677Middleware from @account-kit/infra.
 *   Otherwise fall back to permissionless + viem (RESEARCH Alternatives A2).
 *   Document the outcome in 01-07-SUMMARY.md.
 */
export interface AaClientConfig {
  policyUrl: string;
  policyId: string;
}

export const aaClientConfig: AaClientConfig = {
  policyUrl: erc7677PolicyUrl,
  policyId: alchemyAaPolicyId,
};

/**
 * Type stub for the AA client that Plan 08 will receive.
 * Filled in by Plan 07 when the paymaster endpoint is implemented.
 */
export interface AaClient {
  sendUserOperation: (callData: `0x${string}`) => Promise<`0x${string}`>;
  waitForUserOperationReceipt: (hash: `0x${string}`) => Promise<unknown>;
}

/**
 * Create an AA client for a given Privy embedded wallet signer.
 *
 * @param signer - The Privy embedded wallet signer (from usePrivy().user?.wallet)
 * @returns AaClient stub — full implementation in Plan 07/08
 *
 * DEVIATION NOTE (T-01-32): A user who signs in via wagmi direct-connect (Pitfall 16 fallback)
 * will have a wagmi session but no Privy session. That user is wagmi-authenticated but
 * Privy-unauthenticated and cannot use the AA client. Phase 1.5 social linking closes this gap.
 */
export function createAaClient(_signer: unknown): AaClient {
  // Stub: will be implemented in Plan 07 when relayer policy endpoint is live
  // Plan 08 will call this factory to get the client for createCall userOps
  return {
    sendUserOperation: async (_callData: `0x${string}`) => {
      throw new Error('AA client not yet wired — implement in Plan 07');
    },
    waitForUserOperationReceipt: async (_hash: `0x${string}`) => {
      throw new Error('AA client not yet wired — implement in Plan 07');
    },
  };
}
