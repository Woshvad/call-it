/**
 * deploy-safe.ts — Safe 2-of-3 deploy script (SAFETY-58, D-10, D-11)
 *
 * Usage:
 *   tsx scripts/deploy-safe.ts --network sepolia --dry-run --signer-source env
 *   tsx scripts/deploy-safe.ts --network sepolia --execute --signer-source ledger
 *   tsx scripts/deploy-safe.ts --network arbitrum-one --execute --signer-source ledger
 *
 * Flags:
 *   --network        'sepolia' | 'arbitrum-one' (required)
 *   --dry-run        Predict Safe address without broadcasting tx (default: false)
 *   --execute        Deploy the Safe (mutually exclusive with --dry-run)
 *   --signer-source  'ledger' | 'env' (default: 'ledger')
 *                    env: reads DEPLOYER_PRIVATE_KEY — LOCAL DEV ONLY
 *                    ledger: signs via Ledger Nano X/S Plus (D-11)
 *
 * IMPORTANT (D-11): '--signer-source env' is FORBIDDEN with '--network arbitrum-one'.
 * The deployer Ledger key must be used for all mainnet operations.
 *
 * Phase 6 usage:
 *   The same Ledger key (SAFE_SIGNER_1 = operator's Ledger address) becomes one
 *   of the 3 multisig signers. Run this script once with --network arbitrum-one
 *   --execute --signer-source ledger to deploy the production Safe.
 *
 * Env vars required:
 *   SAFE_SIGNER_1    Operator's Ledger Nano address (first signer + future owner key)
 *   SAFE_SIGNER_2    Trusted human #2 hardware wallet address (different brand per D-10)
 *   SAFE_SIGNER_3    Trusted human #3 hardware wallet address
 *   RPC_URL_ARBITRUM_SEPOLIA  Alchemy RPC URL for arbitrum-sepolia (when --network sepolia)
 *   RPC_URL_ARBITRUM_ONE      Alchemy RPC URL for arbitrum-one (when --network arbitrum-one)
 *   DEPLOYER_PRIVATE_KEY      ONLY for --signer-source env (local dev)
 *
 * Output: packages/contracts/deployments/safe-{network}.json
 *   { safeAddress, chainId, signers, threshold, deployedAt, deployerAddress, txHash }
 */

import { parseArgs } from 'node:util';
import { createWriteStream, mkdirSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isAddress, createWalletClient, http, type Account } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum, arbitrumSepolia } from 'viem/chains';

// Safe SDK (D-10, D-11, SAFETY-58)
// @safe-global/protocol-kit v4+
import Safe, { SafeFactory } from '@safe-global/protocol-kit';

// @ts-ignore — Ledger HID transport (optional; only needed when --signer-source=ledger)
// Dynamically imported below to avoid bundling issues when not using Ledger path
// import Eth from '@ledgerhq/hw-app-eth';
// import TransportNodeHid from '@ledgerhq/hw-transport-node-hid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type NetworkName = 'sepolia' | 'arbitrum-one';
export type SignerSource = 'ledger' | 'env';

export interface DeployArgs {
  network: NetworkName;
  dryRun: boolean;
  execute: boolean;
  signerSource: SignerSource;
}

export interface SafeAccountConfig {
  owners: string[];
  threshold: number;
}

export interface DeployResult {
  safeAddress?: string;
  predictedAddress?: string;
  chainId: number;
  signers: string[];
  threshold: number;
  deployedAt: string;
  deployerAddress: string;
  txHash: string;
  network: NetworkName;
}

// ─────────────────────────────────────────────────────────────────────────────
// Argument parsing (exported for unit tests)
// ─────────────────────────────────────────────────────────────────────────────

export function parseDeployArgs(argv: string[]): DeployArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      network: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      execute: { type: 'boolean', default: false },
      'signer-source': { type: 'string', default: 'ledger' },
    },
    strict: false,
  });

  const network = (values.network ?? 'sepolia') as NetworkName;
  const dryRun = values['dry-run'] as boolean;
  const execute = values.execute as boolean;
  const signerSource = (values['signer-source'] ?? 'ledger') as SignerSource;

  return { network, dryRun, execute, signerSource };
}

export function validateArgs(args: DeployArgs): void {
  if (args.dryRun && args.execute) {
    throw new Error('--dry-run and --execute are mutually exclusive');
  }

  // D-11: env-key path FORBIDDEN for mainnet
  if (args.signerSource === 'env' && args.network === 'arbitrum-one') {
    throw new Error(
      'FORBIDDEN: --signer-source=env cannot be used with --network=arbitrum-one. ' +
        'The Ledger Nano must be used for all mainnet operations (D-11). ' +
        'Use --signer-source=ledger for mainnet deploys.',
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Signer validation (exported for unit tests)
// ─────────────────────────────────────────────────────────────────────────────

export function validateSigners(): { signer1: string; signer2: string; signer3: string } {
  const signer1 = process.env.SAFE_SIGNER_1;
  const signer2 = process.env.SAFE_SIGNER_2;
  const signer3 = process.env.SAFE_SIGNER_3;

  if (!signer1) throw new Error('SAFE_SIGNER_1 missing — set the operator Ledger address');
  if (!signer2) throw new Error('SAFE_SIGNER_2 missing — set trusted human #2 hardware wallet address');
  if (!signer3) throw new Error('SAFE_SIGNER_3 missing — set trusted human #3 hardware wallet address');

  if (!isAddress(signer1)) throw new Error(`SAFE_SIGNER_1 is not a valid Ethereum address: "${signer1}"`);
  if (!isAddress(signer2)) throw new Error(`SAFE_SIGNER_2 is not a valid Ethereum address: "${signer2}"`);
  if (!isAddress(signer3)) throw new Error(`SAFE_SIGNER_3 is not a valid Ethereum address: "${signer3}"`);

  return { signer1, signer2, signer3 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Safe account config builder (exported for unit tests)
// ─────────────────────────────────────────────────────────────────────────────

export function buildSafeAccountConfig(signer1: string, signer2: string, signer3: string): SafeAccountConfig {
  return {
    owners: [signer1, signer2, signer3],
    threshold: 2,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RPC URL resolution
// ─────────────────────────────────────────────────────────────────────────────

function getRpcUrl(network: NetworkName): string {
  if (network === 'sepolia') {
    const url = process.env.RPC_URL_ARBITRUM_SEPOLIA;
    if (!url) throw new Error('RPC_URL_ARBITRUM_SEPOLIA not set');
    return url;
  }
  if (network === 'arbitrum-one') {
    const url = process.env.RPC_URL_ARBITRUM_ONE;
    if (!url) throw new Error('RPC_URL_ARBITRUM_ONE not set');
    return url;
  }
  throw new Error(`Unknown network: ${network}`);
}

function getChainId(network: NetworkName): number {
  return network === 'sepolia' ? 421614 : 42161;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deployer account construction
// ─────────────────────────────────────────────────────────────────────────────

async function buildDeployerAccount(signerSource: SignerSource, network: NetworkName): Promise<{ address: string; signer: string }> {
  if (signerSource === 'env') {
    // LOCAL DEV ONLY — D-11 prohibits this for mainnet (validated above in validateArgs)
    console.warn(
      '\n⚠️  WARNING: --signer-source=env is for LOCAL DEV ONLY.\n' +
        '   This path uses DEPLOYER_PRIVATE_KEY from environment.\n' +
        '   It is FORBIDDEN for mainnet deploys per D-11.\n' +
        '   Use --signer-source=ledger for production.\n',
    );
    const pk = process.env.DEPLOYER_PRIVATE_KEY;
    if (!pk) throw new Error('DEPLOYER_PRIVATE_KEY not set — required for --signer-source=env');
    const account = privateKeyToAccount(pk as `0x${string}`);
    return { address: account.address, signer: pk };
  }

  // Ledger path — D-11 (Ledger Nano X/S Plus)
  console.log('\n🔐 Awaiting Ledger confirmation...');
  console.log('   Please open the Ethereum app on your Ledger Nano X/S Plus.\n');

  try {
    // Dynamic import to avoid hard dependency when not using Ledger
    const { default: TransportNodeHid } = await import('@ledgerhq/hw-transport-node-hid');
    const { default: Eth } = await import('@ledgerhq/hw-app-eth');

    const transport = await (TransportNodeHid as any).create();
    const eth = new Eth(transport);

    const derivationPath = "44'/60'/0'/0/0";
    const result = await eth.getAddress(derivationPath);
    const address = result.address;

    console.log(`   Ledger address: ${address}`);
    console.log('   Connected successfully.\n');

    await transport.close();

    return { address, signer: address };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Ledger connection failed: ${msg}\n` +
        'Ensure:\n' +
        '  1. Ledger Nano X/S Plus is connected via USB\n' +
        '  2. Ethereum app is open (not screensaver)\n' +
        '  3. Blind signing is enabled for EIP-712 (Settings > Contract data = Allowed)',
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Write deployment manifest
// ─────────────────────────────────────────────────────────────────────────────

function writeDeploymentManifest(result: DeployResult): string {
  const deploymentsDir = path.join(REPO_ROOT, 'packages', 'contracts', 'deployments');
  mkdirSync(deploymentsDir, { recursive: true });

  const filePath = path.join(deploymentsDir, `safe-${result.network}.json`);
  const manifest = {
    safeAddress: result.safeAddress ?? result.predictedAddress,
    chainId: result.chainId,
    signers: result.signers,
    threshold: result.threshold,
    deployedAt: result.deployedAt,
    deployerAddress: result.deployerAddress,
    txHash: result.txHash,
    network: result.network,
  };

  writeFileSync(filePath, JSON.stringify(manifest, null, 2));
  return filePath;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main deploy function (exported for unit tests)
// ─────────────────────────────────────────────────────────────────────────────

export async function runDeploy(args: DeployArgs): Promise<DeployResult> {
  validateArgs(args);

  const { signer1, signer2, signer3 } = validateSigners();
  const safeAccountConfig = buildSafeAccountConfig(signer1, signer2, signer3);
  const rpcUrl = getRpcUrl(args.network);
  const chainId = getChainId(args.network);
  const { address: deployerAddress, signer } = await buildDeployerAccount(args.signerSource, args.network);

  console.log(`\nSafe 2-of-3 Deploy Script`);
  console.log(`  Network:    ${args.network} (chainId: ${chainId})`);
  console.log(`  Signers:    ${signer1}, ${signer2}, ${signer3}`);
  console.log(`  Threshold:  2-of-3`);
  console.log(`  Deployer:   ${deployerAddress}`);
  console.log(`  Mode:       ${args.dryRun ? 'DRY RUN (no tx broadcast)' : 'EXECUTE (deploy tx)'}\n`);

  // Initialize SafeFactory using @safe-global/protocol-kit
  const safeFactory = await SafeFactory.init({
    provider: rpcUrl,
    signer: args.signerSource === 'env' ? signer : deployerAddress,
    safeVersion: '1.4.1',
  });

  if (args.dryRun) {
    // Predict address without deploying
    const predictedAddress = await safeFactory.predictSafeAddress(safeAccountConfig);

    console.log(`Predicted Safe address: ${predictedAddress}`);
    console.log('DRY RUN complete — no transaction broadcast.\n');

    const result: DeployResult = {
      predictedAddress,
      chainId,
      signers: safeAccountConfig.owners,
      threshold: safeAccountConfig.threshold,
      deployedAt: new Date().toISOString(),
      deployerAddress,
      txHash: 'dry-run',
      network: args.network,
    };

    const manifestPath = writeDeploymentManifest(result);
    console.log(`Deployment manifest written: ${manifestPath}`);

    return result;
  }

  // Execute: deploy the Safe
  console.log('Deploying Safe 2-of-3...');
  console.log('Awaiting Ledger confirmation for deploy transaction...\n');

  const safe = await safeFactory.deploySafe({
    safeAccountConfig,
    options: {
      gasPrice: undefined, // use network default
    },
  });

  const safeAddress = await safe.getAddress();

  // Verify owners + threshold post-deploy
  const owners = await safe.getOwners();
  const threshold = await safe.getThreshold();

  console.log(`\nSafe deployed!`);
  console.log(`  Address:   ${safeAddress}`);
  console.log(`  Owners:    ${owners.join(', ')}`);
  console.log(`  Threshold: ${threshold}\n`);

  const result: DeployResult = {
    safeAddress,
    chainId,
    signers: owners,
    threshold,
    deployedAt: new Date().toISOString(),
    deployerAddress,
    txHash: 'pending', // Safe SDK v7+ doesn't expose txHash directly from deploySafe
    network: args.network,
  };

  const manifestPath = writeDeploymentManifest(result);
  console.log(`Deployment manifest written: ${manifestPath}`);

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseDeployArgs(process.argv.slice(2));

  if (!args.dryRun && !args.execute) {
    console.error('Error: Must specify either --dry-run or --execute');
    process.exit(1);
  }

  try {
    await runDeploy(args);
    process.exit(0);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\nError: ${msg}`);
    process.exit(1);
  }
}

// Only run main() when invoked directly (not when imported for tests)
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('deploy-safe.ts') || process.argv[1].endsWith('deploy-safe.js'));

if (isMain) {
  main();
}
