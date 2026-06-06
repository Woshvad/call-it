/**
 * prepare-set-relayer.ts — NO-KEY operator helper for the 01.5-01 `setRelayer` gate.
 *
 * WHY THIS EXISTS: ProfileRegistry.linkTwitter/linkFarcaster revert `NotRelayer`
 * until the owner calls `setRelayer(<relayer oauth-proof KMS address>)` on the
 * canonical PR (Pitfall 1). That tx is an owner-gated, `autonomous:false` checkpoint
 * that no agent may broadcast. The hard part for a human, though, is knowing WHICH
 * address to authorize — it is the Ethereum address derived from the GCP `oauth-proof`
 * KMS key, which requires PEM math. This script does exactly that hard part:
 *
 *   1. Derives the `oauth-proof` KMS address from its PUBLIC key (no private material,
 *      no signing) — mirrors verifyKmsAddress() in lib/kms-signer.ts.
 *   2. Reads the live on-chain `relayer()` + `owner()` on the canonical PR (read-only).
 *   3. Reports drift vs. RELAYER_OAUTH_PROOF_ADDRESS in env (Pitfall 1).
 *   4. Emits the exact `cast send` + readback commands for the operator to run with
 *      the treasury owner key.
 *
 * SAFETY: This script NEVER loads, holds, signs with, or prints any private key, and
 * it NEVER broadcasts a transaction. It performs read-only RPC calls and a KMS
 * public-key read only. The actual `setRelayer` broadcast is left to the operator.
 *
 * Requires GCP Application Default Credentials (gcloud auth / GOOGLE_APPLICATION_CREDENTIALS)
 * with kms.cryptoKeyVersions.viewPublicKey on the `oauth-proof` key.
 *
 * Usage (from apps/relayer):
 *   npx tsx src/scripts/prepare-set-relayer.ts
 */

import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Hydrate process.env from the relayer .env.local / monorepo-root .env if not already set. */
function loadEnvIfNeeded(): void {
  if (process.env.GCP_PROJECT_ID && process.env.GCP_KEY_VERSION_OAUTH_PROOF) return;
  const candidates = [
    resolve(__dirname, '../../.env.local'),
    resolve(__dirname, '../../../.env.local'),
    resolve(__dirname, '../../../../.env'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        process.loadEnvFile(p);
        if (process.env.GCP_PROJECT_ID) break;
      } catch {
        // next candidate
      }
    }
  }
}

loadEnvIfNeeded();

import { KeyManagementServiceClient } from '@google-cloud/kms';
import {
  createPublicClient,
  http,
  parseAbi,
  keccak256,
  getAddress,
  type Address,
} from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { PROFILE_REGISTRY_ARBITRUM_SEPOLIA } from '@call-it/shared';

const ZERO: Address = '0x0000000000000000000000000000000000000000';
const TREASURY_OWNER: Address = '0xDa8c5726f596E8dae99e6dDEBa8AEa1c8bE9A4a5';
const PUBLIC_SEPOLIA_RPC = 'https://sepolia-rollup.arbitrum.io/rpc';

const ABI = parseAbi([
  'function relayer() view returns (address)',
  'function owner() view returns (address)',
]);

function req(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '' || v.trim().startsWith('<')) {
    throw new Error(`Missing required env var ${name} (set it in apps/relayer/.env.local or the root .env).`);
  }
  return v.trim();
}

/**
 * Derive the Ethereum address from the GCP `oauth-proof` KMS key's PUBLIC key.
 * Mirrors verifyKmsAddress() in lib/kms-signer.ts but WITHOUT the expectedAddress
 * assertion (here we are discovering the address, not checking it).
 */
async function deriveOauthProofAddress(): Promise<Address> {
  const projectId = req('GCP_PROJECT_ID');
  const locationId = req('GCP_LOCATION_ID'); // must be us-east1 (Pitfall B)
  const keyRingId = req('GCP_KEYRING_ID'); // 'attestations'
  const keyVersion = req('GCP_KEY_VERSION_OAUTH_PROOF');

  const kms = new KeyManagementServiceClient();
  const versionName = kms.cryptoKeyVersionPath(
    projectId,
    locationId,
    keyRingId,
    'oauth-proof',
    keyVersion,
  );

  const [resp] = await kms.getPublicKey({ name: versionName });
  const pem = resp.pem;
  if (!pem) {
    throw new Error(`KMS returned an empty PEM for oauth-proof version ${keyVersion}.`);
  }

  const b64 = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s/g, '');
  const der = Buffer.from(b64, 'base64');

  // The last 65 bytes of the DER SubjectPublicKeyInfo are the uncompressed point
  // (0x04 || X || Y). Find the 0x04 marker scanning from the tail.
  let off = -1;
  for (let i = der.length - 65; i >= 0; i--) {
    if (der[i] === 0x04) {
      off = i;
      break;
    }
  }
  if (off === -1) throw new Error('Could not locate the uncompressed public-key point in the KMS PEM.');

  const xy = der.subarray(off + 1, off + 65); // X || Y (64 bytes)
  if (xy.length !== 64) throw new Error('Unexpected public-key length in the KMS PEM.');

  const hash = keccak256(`0x${xy.toString('hex')}`);
  return getAddress(`0x${hash.slice(-40)}`);
}

function emitOperatorCommands(pr: Address, kmsAddr: Address, rpcEnvVar: string): void {
  const rpc = `$${rpcEnvVar}`;
  console.log('\n── Operator commands (run with the treasury owner key) ─────────────────────');
  console.log('# 1. Ensure the KMS wallet is funded with Arbitrum Sepolia ETH (relayer pays gas, D-03):');
  console.log(`#    ${kmsAddr}`);
  console.log('# 2. Authorize it on-chain from the treasury owner key:');
  console.log(
    `cast send ${pr} "setRelayer(address)" ${kmsAddr} \\\n` +
      `  --rpc-url ${rpc} --account <treasury-owner-key>`,
  );
  console.log('# 3. Verify the readback (must print the KMS address, not 0x0):');
  console.log(`cast call ${pr} "relayer()(address)" --rpc-url ${rpc}`);
  console.log('# 4. Set the relayer env to the SAME address (drift here = NotRelayer, Pitfall 1):');
  console.log(`#    RELAYER_OAUTH_PROOF_ADDRESS=${kmsAddr}`);
  console.log('────────────────────────────────────────────────────────────────────────────');
}

async function main(): Promise<void> {
  const pr =
    (process.env.PROFILE_REGISTRY_ADDRESS as Address | undefined) ??
    PROFILE_REGISTRY_ARBITRUM_SEPOLIA;

  // Read-only RPC: prefer the configured key'd endpoint, else the public Sepolia RPC.
  const rpcEnvVar = process.env.ARBITRUM_SEPOLIA_RPC_URL ? 'ARBITRUM_SEPOLIA_RPC_URL' : '';
  const rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL?.trim() || PUBLIC_SEPOLIA_RPC;
  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http(rpcUrl) });

  console.log(`ProfileRegistry (canonical PR): ${pr}`);

  const [onchainRelayer, onchainOwner] = (await Promise.all([
    publicClient.readContract({ address: pr, abi: ABI, functionName: 'relayer' }),
    publicClient.readContract({ address: pr, abi: ABI, functionName: 'owner' }),
  ])) as [Address, Address];

  console.log(`  relayer():  ${onchainRelayer}${onchainRelayer === ZERO ? '  (UNSET — linking reverts NotRelayer)' : ''}`);
  console.log(`  owner():    ${onchainOwner}`);
  if (onchainOwner.toLowerCase() !== TREASURY_OWNER.toLowerCase()) {
    console.warn(`  ! owner() is not the expected treasury ${TREASURY_OWNER} — confirm before proceeding.`);
  }

  let kmsAddr: Address;
  try {
    kmsAddr = await deriveOauthProofAddress();
  } catch (err) {
    console.error('\nCould not derive the oauth-proof KMS address:');
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    console.error(
      '\nThis step needs GCP Application Default Credentials with viewPublicKey on the\n' +
        '`oauth-proof` key (gcloud auth application-default login, or GOOGLE_APPLICATION_CREDENTIALS),\n' +
        'plus GCP_PROJECT_ID / GCP_LOCATION_ID / GCP_KEYRING_ID / GCP_KEY_VERSION_OAUTH_PROOF in env.\n' +
        'On-chain state above is still accurate; re-run once GCP access is available.',
    );
    process.exit(1);
  }

  console.log(`\noauth-proof KMS address (derived from public key): ${kmsAddr}`);

  // Drift check vs. the relayer env (Pitfall 1 / T-01.5-01-02).
  const envAddr = process.env.RELAYER_OAUTH_PROOF_ADDRESS?.trim();
  if (envAddr && !envAddr.startsWith('<')) {
    const match = getAddress(envAddr) === kmsAddr;
    console.log(
      `RELAYER_OAUTH_PROOF_ADDRESS (env): ${envAddr} ${match ? '✓ matches derived' : '✗ DRIFT — fix env to match derived'}`,
    );
  } else {
    console.log('RELAYER_OAUTH_PROOF_ADDRESS (env): not set — set it to the derived address above.');
  }

  if (onchainRelayer.toLowerCase() === kmsAddr.toLowerCase()) {
    console.log('\n✓ relayer() already equals the derived KMS address. The 01.5-01 gate is satisfied on-chain.');
    console.log('  (Confirm RELAYER_OAUTH_PROOF_ADDRESS in the relayer env matches, then close 01.5-01.)');
    process.exit(0);
  }

  if (onchainRelayer !== ZERO) {
    console.log(
      `\n! relayer() is currently ${onchainRelayer}, which differs from the derived KMS address.\n` +
        '  setRelayer below will REPLACE it. Confirm this is intended before broadcasting.',
    );
  }

  emitOperatorCommands(pr, kmsAddr, rpcEnvVar || 'ARBITRUM_SEPOLIA_RPC_URL');
  console.log('\nThis script does not broadcast. Run the cast commands above with the treasury owner key.');
  process.exit(0);
}

main().catch((err) => {
  console.error('prepare-set-relayer: fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
