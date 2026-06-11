/**
 * KMS-backed on-chain submitter for the `oauth-proof` relayer wallet (D-03/D-04).
 *
 * Submits ProfileRegistry.linkTwitter / linkFarcaster from the GCP-KMS `oauth-proof`
 * key. The relayer is the only authorized linker (msg.sender == relayer on-chain);
 * the key bytes never leave KMS (T-00-10 / V6).
 *
 * Why a bespoke submitter instead of viem's createWalletClient(): gcpKmsAccount's
 * signTransaction throws by design (the generic walletClient path can't sign raw
 * txs via KMS). So we build the EIP-1559 tx ourselves, sign the serialized digest
 * via account.signDigest(), and broadcast with sendRawTransaction. The returned
 * object exposes a `writeContract({ address, abi, functionName, args })` method that
 * MIRRORS the settlement-watcher walletClient interface — routes/tests treat it the
 * same way and inject a mock in tests.
 *
 * RUNTIME NOTE: the on-chain ProfileRegistry.setRelayer(oauthProofAddress) wiring is
 * deferred to the operator. This submitter is fully unit-mocked; no live tx is sent
 * during build/test.
 *
 * Requirements: AUTH-06, AUTH-07, D-03, D-04. Threat T-01.5-02-07 (KMS custody).
 */

import {
  createPublicClient,
  fallback,
  http,
  encodeFunctionData,
  serializeTransaction,
  keccak256,
  hexToBytes,
  type Abi,
  type Address,
  type Hex,
} from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { gcpKmsAccount, type GcpKmsAccount } from './kms-signer.js';
import { getLogger } from './logger.js';

export interface WriteContractParams {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
}

/** The minimal submitter shape — mirrors settlement-watcher's walletClient. */
export interface OauthProofSubmitter {
  account: { address: Address };
  writeContract(params: WriteContractParams): Promise<Hex>;
}

/**
 * Parse a 65-byte compact signature hex (r||s||v) into viem's {r,s,v} parts.
 */
function splitSignature(sig: Hex): { r: Hex; s: Hex; v: bigint } {
  const bytes = hexToBytes(sig);
  if (bytes.length !== 65) {
    throw new Error(`oauth-proof submitter: expected 65-byte signature, got ${bytes.length}`);
  }
  const r = ('0x' + sig.slice(2, 66)) as Hex;
  const s = ('0x' + sig.slice(66, 130)) as Hex;
  const v = BigInt('0x' + sig.slice(130, 132));
  return { r, s, v };
}

/**
 * Build the KMS-backed oauth-proof submitter.
 *
 * Reads GCP/KMS config + RELAYER_OAUTH_PROOF_ADDRESS from env (provisioned in
 * 01.5-01). Throws if the expected address is unset — surfaced as a link failure
 * the route swallows (Pitfall 5: linking is additive, never blocks the session).
 *
 * @param rpcUrl optional RPC override (defaults to Arbitrum Sepolia env / public).
 */
export function buildOauthProofSubmitter(rpcUrl?: string): OauthProofSubmitter {
  const expectedAddress = process.env.RELAYER_OAUTH_PROOF_ADDRESS as Address | undefined;
  if (!expectedAddress) {
    throw new Error('RELAYER_OAUTH_PROOF_ADDRESS not configured — cannot submit social links');
  }

  const account: GcpKmsAccount = gcpKmsAccount({
    keyId: 'oauth-proof',
    projectId: process.env.GCP_PROJECT_ID ?? 'call-it-sepolia',
    locationId: process.env.GCP_LOCATION_ID ?? 'us-east1',
    keyRingId: process.env.GCP_KEYRING_ID ?? 'attestations',
    keyVersion: process.env.GCP_KEY_VERSION_OAUTH_PROOF ?? '1',
    expectedAddress,
  });

  const transport = fallback([
    http(rpcUrl ?? process.env.RPC_URL_ARBITRUM_SEPOLIA ?? process.env.ARBITRUM_SEPOLIA_RPC_URL),
    http(), // public RPC failover
  ]);
  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport });

  async function writeContract(params: WriteContractParams): Promise<Hex> {
    const data = encodeFunctionData({
      abi: params.abi,
      functionName: params.functionName,
      args: params.args as unknown[],
    });

    // EIP-1559 fee + nonce + gas estimation from the public client.
    const [nonce, fees, gas, chainId] = await Promise.all([
      publicClient.getTransactionCount({ address: account.address, blockTag: 'pending' }),
      publicClient.estimateFeesPerGas(),
      publicClient.estimateGas({ account: account.address, to: params.address, data }),
      publicClient.getChainId(),
    ]);

    const txParams = {
      to: params.address,
      data,
      nonce,
      gas,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      chainId,
      type: 'eip1559' as const,
    };

    // Serialize unsigned → keccak256 digest → KMS sign → serialize signed → broadcast.
    const unsignedSerialized = serializeTransaction(txParams);
    const digest = keccak256(unsignedSerialized);
    const signature = await account.signDigest(digest);
    const { r, s, v } = splitSignature(signature);
    const signedSerialized = serializeTransaction(txParams, {
      r,
      s,
      yParity: v >= 27n ? Number(v - 27n) : Number(v),
    });

    const hash = await publicClient.sendRawTransaction({ serializedTransaction: signedSerialized });
    getLogger().info(
      { event: 'social_link_tx_submitted', functionName: params.functionName, hash },
      'oauth-proof link tx submitted',
    );
    return hash;
  }

  return { account: { address: account.address }, writeContract };
}
