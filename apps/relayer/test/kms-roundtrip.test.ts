/**
 * Task 2 TDD — KMS round-trip integration test (gated by GCP_PROJECT_ID).
 *
 * This test is SKIPPED when GCP credentials are absent (local dev / CI without secrets).
 * It runs ONLY when GCP_PROJECT_ID is set (manual operator verification gate before
 * Plan 00-05 Sepolia deploy, and on every PR in the secrets-enabled CI environment).
 *
 * Requirement: OPS-19 (KMS-backed signing), D-06 (no private key in process),
 *              Pitfall 7 (key-address binding), T-00-17 (boot-time address verification)
 */

import { describe, it, expect } from 'vitest';
import { recoverMessageAddress } from 'viem';
import { gcpKmsAccount, verifyKmsAddress, type AttestationType } from '../src/lib/kms-signer.js';
import type { Address, Hex } from 'viem';

const hasGcpCreds = Boolean(process.env.GCP_PROJECT_ID);

describe('GCP KMS round-trip (Sepolia — skipped without creds)', () => {
  it.skipIf(!hasGcpCreds)('signs a message with the nft-twap KMS key and ecrecovers to expected address', async () => {
    // These env vars must be set when the test runs with real GCP credentials
    const projectId = process.env.GCP_PROJECT_ID!;
    const locationId = process.env.GCP_LOCATION_ID ?? 'us-east1';
    const keyRingId = process.env.GCP_KEYRING_ID ?? 'attestations';
    const keyVersion = process.env.GCP_KEY_VERSION_NFT_TWAP ?? '1';
    const expectedAddress = process.env.KMS_DERIVED_ADDRESS_NFT_TWAP as Address;

    if (!expectedAddress) {
      throw new Error('KMS_DERIVED_ADDRESS_NFT_TWAP env var required for KMS round-trip test');
    }

    const keyId: AttestationType = 'nft-twap';

    // First verify the address matches (boot-time check pattern)
    const verifiedAddress = await verifyKmsAddress({
      projectId,
      locationId,
      keyRingId,
      keyId,
      keyVersion,
      expectedAddress,
    });
    expect(verifiedAddress.toLowerCase()).toBe(expectedAddress.toLowerCase());

    // Create the KMS-backed account
    const account = gcpKmsAccount({
      projectId,
      locationId,
      keyRingId,
      keyId,
      keyVersion,
      expectedAddress,
    });

    expect(account.address.toLowerCase()).toBe(expectedAddress.toLowerCase());

    // Sign a test message
    const message = 'KMS round-trip test — call-it-sepolia — nft-twap';
    const signature = await account.signMessage({ message });

    expect(signature).toMatch(/^0x[0-9a-fA-F]{130}$/); // 65 bytes hex

    // Ecrecover: the recovered address must match the KMS key's address
    const recovered = await recoverMessageAddress({ message, signature: signature as Hex });
    expect(recovered.toLowerCase()).toBe(expectedAddress.toLowerCase());
  });
});
