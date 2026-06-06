/**
 * GCP-KMS-backed viem Account wrapper (D-06, D-07, OPS-19).
 *
 * Returns a viem Account whose signMessage/signTypedData implementations
 * call GCP KMS's asymmetricSign API instead of using local private key material.
 *
 * Security properties:
 * - The relayer process NEVER holds private key bytes (T-00-10)
 * - 5 separate KMS keys, one per AttestationType (D-07)
 * - EIP-712 domain includes attestationType → cross-path replay is impossible
 * - Boot-time verifyKmsAddress() catches key-version configuration drift (T-00-17)
 * - Every sign call logs { event: 'kms_sign', keyId, latencyMs, success } (T-00-13)
 *
 * Referenced in: Pattern 3 (lines 560–631 of 00-RESEARCH.md)
 * Interface contract:
 *   export function gcpKmsAccount(opts): viem.Account
 *   export type AttestationType = ...
 *   export async function verifyKmsAddress(opts): Promise<Address>
 */

import { KeyManagementServiceClient } from '@google-cloud/kms';
import { toAccount } from 'viem/accounts';
import {
  hashMessage,
  hashTypedData,
  hexToBytes,
  keccak256,
  type Hex,
  type Address,
} from 'viem';
import { derToViemHex, KmsSignerError } from './der-to-viem-hex.js';
import { getLogger } from './logger.js';

/**
 * The 5 attestation key types (D-07).
 *
 * One GCP KMS crypto key per type, in each GCP project (D-09).
 * EIP-712 domain includes attestationType for replay isolation.
 *
 * Do NOT add a 6th type without creating the corresponding KMS key + updating
 * the pre-deploy checklist in docs/runbooks/key-provisioning.md.
 */
export type AttestationType =
  | 'nft-twap'
  | 'defillama'
  | 'cex'
  | 'snapshot-tally'
  | 'oauth-proof';

export interface KmsAccountOptions {
  /** GCP project ID — 'call-it-sepolia' or 'call-it-mainnet' (D-09) */
  projectId: string;
  /** KMS keyring region — must be 'us-east1' per Pitfall B */
  locationId: string;
  /** KMS keyring name — 'attestations' */
  keyRingId: string;
  /** Attestation type — maps to the KMS crypto key name (D-07) */
  keyId: AttestationType;
  /** KMS key version string — '1' initially; bump on rotation */
  keyVersion: string;
  /**
   * Expected Ethereum address derived from this KMS key's public key.
   * Verified at boot via verifyKmsAddress() to catch configuration drift (T-00-17).
   */
  expectedAddress: Address;
}

// Singleton KMS client — reused across all account instances
let _kmsClient: KeyManagementServiceClient | undefined;
function getKmsClient(): KeyManagementServiceClient {
  if (!_kmsClient) {
    _kmsClient = new KeyManagementServiceClient();
  }
  return _kmsClient;
}

/**
 * Create a viem Account backed by a GCP KMS secp256k1 key.
 *
 * Returns a standard viem Account (compatible with useSignMessage, sendTransaction, etc.)
 * where all signing operations delegate to GCP KMS instead of a local private key.
 *
 * @param opts - KMS key configuration + expected Ethereum address
 */
/**
 * A viem Account whose underlying KMS digest signer is also exposed directly.
 *
 * The base toAccount() wrapper deliberately throws on signTransaction (the
 * generic viem walletClient path cannot use a KMS-held key for raw tx signing).
 * For raw EIP-1559 submission (e.g. ProfileRegistry.linkTwitter/linkFarcaster in
 * the 01.5-02 social-link route) consumers serialize the tx themselves, then call
 * `signDigest(keccak256(serializedUnsigned))` to obtain the 65-byte signature.
 */
export type GcpKmsAccount = ReturnType<typeof toAccount> & {
  /** Sign a 32-byte digest via GCP KMS → 65-byte compact hex (r||s||v). */
  signDigest(digest: Hex): Promise<Hex>;
};

export function gcpKmsAccount(opts: KmsAccountOptions): GcpKmsAccount {
  const kms = getKmsClient();

  const versionName = kms.cryptoKeyVersionPath(
    opts.projectId,
    opts.locationId,
    opts.keyRingId,
    opts.keyId,
    opts.keyVersion,
  );

  /**
   * Sign a 32-byte digest via GCP KMS.
   * Converts DER response to viem-compatible 65-byte compact hex.
   * Logs latency + success/failure for audit trail (T-00-13).
   */
  async function signDigest(digest: Hex): Promise<Hex> {
    const startMs = Date.now();
    try {
      const [resp] = await kms.asymmetricSign({
        name: versionName,
        digest: { sha256: hexToBytes(digest) },
      });

      if (!resp.signature) {
        throw new KmsSignerError('GCP KMS returned empty signature');
      }

      const sigData = resp.signature;
      const signature = sigData instanceof Uint8Array
        ? sigData
        : new Uint8Array(Buffer.from(sigData as unknown as string, 'binary'));

      const viemHex = derToViemHex(signature, digest, opts.expectedAddress);

      getLogger().info({
        event: 'kms_sign',
        keyId: opts.keyId,
        keyVersion: opts.keyVersion,
        latencyMs: Date.now() - startMs,
        success: true,
      }, 'KMS sign completed');

      return viemHex;
    } catch (err) {
      getLogger().error({
        event: 'kms_sign',
        keyId: opts.keyId,
        keyVersion: opts.keyVersion,
        latencyMs: Date.now() - startMs,
        success: false,
        err: err instanceof Error ? err.message : String(err),
      }, 'KMS sign failed');
      throw err;
    }
  }

  const account = toAccount({
    address: opts.expectedAddress,

    async signMessage({ message }) {
      const digest = hashMessage(message);
      return signDigest(digest);
    },

    async signTypedData(td) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const digest = hashTypedData(td as any);
      return signDigest(digest);
    },

    async signTransaction() {
      // The generic viem walletClient path cannot sign raw txs via KMS.
      // Use: serialize the transaction, compute digest, call account.signDigest() directly.
      throw new Error(
        'gcpKmsAccount.signTransaction: use serializeTransaction + signDigest for raw tx signing. ' +
          'The account exposes signDigest() — see oauth-proof-submitter.ts.',
      );
    },
  });

  // Expose the raw digest signer for consumers that serialize their own tx
  // (raw EIP-1559 submission — e.g. the social-link route). T-00-13 logging is
  // already inside signDigest.
  return Object.assign(account, { signDigest });
}

/**
 * Derive an Ethereum address from a GCP KMS secp256k1 public key.
 *
 * Fetches the public key PEM from KMS, decodes it to raw bytes,
 * extracts the uncompressed point, computes keccak256(X||Y)[12:] → address.
 *
 * Used for boot-time sanity check (T-00-17):
 *   const actual = await verifyKmsAddress(opts);
 *   assert(actual === opts.expectedAddress, 'KMS key version mismatch!');
 *
 * @param opts - same options as gcpKmsAccount
 * @returns the Ethereum address corresponding to this KMS key version
 */
export async function verifyKmsAddress(opts: KmsAccountOptions): Promise<Address> {
  const kms = getKmsClient();

  const versionName = kms.cryptoKeyVersionPath(
    opts.projectId,
    opts.locationId,
    opts.keyRingId,
    opts.keyId,
    opts.keyVersion,
  );

  const [pubKeyResponse] = await kms.getPublicKey({ name: versionName });
  const pem = pubKeyResponse.pem;
  if (!pem) {
    throw new KmsSignerError(`KMS returned empty PEM for key ${opts.keyId} version ${opts.keyVersion}`);
  }

  // Parse PEM: strip header/footer, base64-decode to DER
  const b64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s/g, '');
  const derBytes = Buffer.from(b64, 'base64');

  // The DER-encoded SubjectPublicKeyInfo for secp256k1 ends with the raw public key.
  // The last 65 bytes are the uncompressed point (0x04 || X || Y).
  // Find 0x04 marker that indicates the start of the uncompressed point.
  let pubKeyOffset = -1;
  for (let i = derBytes.length - 65; i >= 0; i--) {
    if (derBytes[i] === 0x04) {
      pubKeyOffset = i;
      break;
    }
  }

  if (pubKeyOffset === -1) {
    throw new KmsSignerError('Could not find uncompressed public key point in KMS PEM');
  }

  const uncompressedPubKey = derBytes.slice(pubKeyOffset + 1, pubKeyOffset + 65); // X || Y (64 bytes)
  if (uncompressedPubKey.length !== 64) {
    throw new KmsSignerError('Unexpected public key length in KMS PEM');
  }

  // Ethereum address = keccak256(X || Y)[12:]
  const pubKeyHash = keccak256(uncompressedPubKey);
  const address = ('0x' + pubKeyHash.slice(-40)) as Address;

  // Verify against expectedAddress
  if (address.toLowerCase() !== opts.expectedAddress.toLowerCase()) {
    throw new KmsSignerError(
      `KMS key ${opts.keyId} version ${opts.keyVersion} derived address ${address} ` +
        `does not match expectedAddress ${opts.expectedAddress}. ` +
        'Update GCP_KEY_VERSION_* env var or expectedAddress in config. (T-00-17)',
    );
  }

  getLogger().info({
    event: 'kms_address_verified',
    keyId: opts.keyId,
    keyVersion: opts.keyVersion,
    address,
  }, 'KMS address verified at boot');

  return address;
}

// Export KmsSignerError for consumers
export { KmsSignerError };
