/**
 * rehearse-ownership.ts — Safe batch acceptOwnership on 5 Ownable2Step contracts.
 *
 * Run after TransferOwnershipToSafe.s.sol has set pendingOwner = Safe on all 5
 * Ownable2Step contracts (CallRegistry, FollowFadeMarket, ChallengeEscrow,
 * SettlementManager, ProfileRegistry).
 *
 * This script sends a batch Safe transaction: one acceptOwnership() call per
 * contract. Two of the three Safe signers sign it (2-of-3 threshold). After
 * execution, it verifies that owner() == SAFE_ADDRESS for all 5 contracts.
 *
 * ProxyAdmin is NOT included — it uses plain Ownable and transferOwnership()
 * is already final (no acceptOwnership step needed).
 *
 * Usage:
 *   tsx scripts/rehearse-ownership.ts --network sepolia
 *
 * Required env vars:
 *   SAFE_ADDRESS              Address of the deployed Safe (from deploy-safe.ts output)
 *   SIGNER_1_PRIVATE_KEY      Private key for signer 1 (first confirmer)
 *   SIGNER_2_PRIVATE_KEY      Private key for signer 2 (second confirmer; reaches threshold=2)
 *   RPC_URL_ARBITRUM_SEPOLIA  Alchemy RPC (when --network sepolia)
 *   RPC_URL_ARBITRUM_ONE      Alchemy RPC (when --network arbitrum-one)
 *
 * Contract addresses (Ownable2Step targets):
 *   Read from env or fall back to Phase-05.1 Sepolia PLACEHOLDER constants below.
 *   UPDATE the constants (or provide via env) before running against the Phase-6 cluster.
 *   UPDATE again before running against Arbitrum One mainnet.
 *
 *   Env overrides:
 *     CONTRACT_CALL_REGISTRY
 *     CONTRACT_FOLLOW_FADE_MARKET
 *     CONTRACT_CHALLENGE_ESCROW
 *     CONTRACT_SETTLEMENT_MANAGER
 *     CONTRACT_PROFILE_REGISTRY
 *
 * Requirements: SAFETY-02, SAFETY-03, SAFETY-19, SAFETY-20
 */

// ---------------------------------------------------------------------------
// Env bootstrap — mirrors backfill-criteria.ts pattern
// ---------------------------------------------------------------------------

import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvIfNeeded(): void {
  if (!process.env.SAFE_ADDRESS) {
    const envCandidates = [
      resolve(__dirname, '../.env.local'),
      resolve(__dirname, '../.env'),
    ];
    for (const envPath of envCandidates) {
      if (existsSync(envPath)) {
        try {
          process.loadEnvFile(envPath);
          if (process.env.SAFE_ADDRESS) break;
        } catch {
          // continue to next candidate
        }
      }
    }
  }
}

loadEnvIfNeeded();

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import Safe from '@safe-global/protocol-kit';
import { type SafeTransactionDataPartial } from '@safe-global/types-kit';
import { encodeFunctionData, createPublicClient, http, type Address, isAddress } from 'viem';
import { arbitrumSepolia, arbitrum } from 'viem/chains';

// ---------------------------------------------------------------------------
// Ownable2Step ABI (acceptOwnership + owner)
// ---------------------------------------------------------------------------

const OWNABLE2STEP_ABI = [
  {
    name: 'acceptOwnership',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'owner',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

// ---------------------------------------------------------------------------
// Phase-05.1 Sepolia PLACEHOLDER addresses
// UPDATE before running against Phase-6 cluster or Arbitrum One mainnet.
// See the two-gate note in TransferOwnershipToSafe.s.sol.
// ---------------------------------------------------------------------------

const PLACEHOLDER_ADDRESSES = {
  CALL_REGISTRY:        '0x9E3E467e5D1F1266354444CEaC67651c7e9CACEc' as Address,
  FOLLOW_FADE_MARKET:   '0x5Aa7bC9ee202AD9197CB109e7EcF3d7d99C72a48' as Address,
  CHALLENGE_ESCROW:     '0xf0D65BFd5dFa4e40c81d198DD7ED78423a26Fdea' as Address,
  SETTLEMENT_MANAGER:   '0x765f6ecd85059CF8eF59286DF578AEC0B13230fC' as Address,
  PROFILE_REGISTRY:     '0xAfe239a3606b89Ef65DbBcDb1b87a920052c359E' as Address,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NetworkName = 'sepolia' | 'arbitrum-one';

export interface ContractAddresses {
  callRegistry:       Address;
  followFadeMarket:   Address;
  challengeEscrow:    Address;
  settlementManager:  Address;
  profileRegistry:    Address;
}

export interface RehearsalResult {
  success: boolean;
  safeAddress: string;
  txHash: string;
  ownerVerifications: Record<string, boolean>;
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

export function parseRehearsalArgs(argv: string[]): { network: NetworkName } {
  const { values } = parseArgs({
    args: argv,
    options: {
      network: { type: 'string', default: 'sepolia' },
    },
    strict: false,
  });

  const network = (values.network ?? 'sepolia') as NetworkName;
  if (network !== 'sepolia' && network !== 'arbitrum-one') {
    throw new Error(`Unknown --network: "${network}". Expected 'sepolia' or 'arbitrum-one'.`);
  }

  return { network };
}

// ---------------------------------------------------------------------------
// Env resolution
// ---------------------------------------------------------------------------

export function resolveContractAddresses(): ContractAddresses {
  const resolve = (envKey: string, placeholder: Address): Address => {
    const envVal = process.env[envKey];
    if (envVal) {
      if (!isAddress(envVal)) {
        throw new Error(`${envKey} is not a valid Ethereum address: "${envVal}"`);
      }
      return envVal as Address;
    }
    console.warn(
      `  [warn] ${envKey} not set — using Phase-05.1 placeholder: ${placeholder}`,
    );
    return placeholder;
  };

  return {
    callRegistry:      resolve('CONTRACT_CALL_REGISTRY',        PLACEHOLDER_ADDRESSES.CALL_REGISTRY),
    followFadeMarket:  resolve('CONTRACT_FOLLOW_FADE_MARKET',   PLACEHOLDER_ADDRESSES.FOLLOW_FADE_MARKET),
    challengeEscrow:   resolve('CONTRACT_CHALLENGE_ESCROW',     PLACEHOLDER_ADDRESSES.CHALLENGE_ESCROW),
    settlementManager: resolve('CONTRACT_SETTLEMENT_MANAGER',   PLACEHOLDER_ADDRESSES.SETTLEMENT_MANAGER),
    profileRegistry:   resolve('CONTRACT_PROFILE_REGISTRY',     PLACEHOLDER_ADDRESSES.PROFILE_REGISTRY),
  };
}

export function resolveRpcUrl(network: NetworkName): string {
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

// ---------------------------------------------------------------------------
// Main rehearsal function (exported for unit tests)
// ---------------------------------------------------------------------------

export async function runRehearsal(network: NetworkName): Promise<RehearsalResult> {
  // ── Validate required env vars ────────────────────────────────────────────

  const safeAddress = process.env.SAFE_ADDRESS;
  if (!safeAddress) throw new Error('SAFE_ADDRESS not set — run deploy-safe.ts first');
  if (!isAddress(safeAddress)) throw new Error(`SAFE_ADDRESS is not a valid address: "${safeAddress}"`);

  const signer1Pk = process.env.SIGNER_1_PRIVATE_KEY;
  if (!signer1Pk) throw new Error('SIGNER_1_PRIVATE_KEY not set');

  const signer2Pk = process.env.SIGNER_2_PRIVATE_KEY;
  if (!signer2Pk) throw new Error('SIGNER_2_PRIVATE_KEY not set');

  const rpcUrl = resolveRpcUrl(network);
  const contracts = resolveContractAddresses();

  // ── Log plan ──────────────────────────────────────────────────────────────

  console.log('rehearse-ownership: starting...');
  console.log(`  Network:        ${network}`);
  console.log(`  Safe address:   ${safeAddress}`);
  console.log(`  Contracts (Ownable2Step targets):`);
  console.log(`    CallRegistry:      ${contracts.callRegistry}`);
  console.log(`    FollowFadeMarket:  ${contracts.followFadeMarket}`);
  console.log(`    ChallengeEscrow:   ${contracts.challengeEscrow}`);
  console.log(`    SettlementManager: ${contracts.settlementManager}`);
  console.log(`    ProfileRegistry:   ${contracts.profileRegistry}`);
  console.log(`  Threshold:      2-of-3 (signing with signer 1 + signer 2)`);
  console.log('');
  console.log(
    '  NOTE: If contract addresses above show Phase-05.1 placeholders, set\n' +
    '  CONTRACT_* env vars to the Phase-6 cluster addresses from 06-02 broadcast.',
  );
  console.log('');

  // ── Encode acceptOwnership() calldata (shared across all 5 contracts) ────

  const acceptOwnershipData = encodeFunctionData({
    abi: OWNABLE2STEP_ABI,
    functionName: 'acceptOwnership',
  });

  // ── Build 5-transaction batch ─────────────────────────────────────────────

  const ownable2StepContracts: Array<{ name: string; address: Address }> = [
    { name: 'CallRegistry',      address: contracts.callRegistry },
    { name: 'FollowFadeMarket',  address: contracts.followFadeMarket },
    { name: 'ChallengeEscrow',   address: contracts.challengeEscrow },
    { name: 'SettlementManager', address: contracts.settlementManager },
    { name: 'ProfileRegistry',   address: contracts.profileRegistry },
  ];

  const safeTransactionData: SafeTransactionDataPartial[] = ownable2StepContracts.map(({ address }) => ({
    to: address,
    value: '0',
    data: acceptOwnershipData,
  }));

  // ── Initialize Safe for signer 1 ─────────────────────────────────────────

  console.log('rehearse-ownership: initializing Safe (signer 1)...');
  // pnpm + NodeNext module resolution sometimes binds the default import to the module
  // namespace type rather than the default export class type, causing a false "init does
  // not exist" error. Cast to `any` to work around this toolchain limitation.
  // Runtime: Safe.init() is the correct protocol-kit v7 static factory method.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const protocolKitSigner1 = await (Safe as any).init({
    provider: rpcUrl,
    signer: signer1Pk,
    safeAddress,
  });

  // ── Create Safe transaction ───────────────────────────────────────────────

  console.log('rehearse-ownership: creating batch transaction (5x acceptOwnership)...');
  const safeTransaction = await protocolKitSigner1.createTransaction({
    transactions: safeTransactionData,
  });

  // ── Sign with signer 1 ────────────────────────────────────────────────────

  console.log('rehearse-ownership: signing with signer 1...');
  const signedTxSigner1 = await protocolKitSigner1.signTransaction(safeTransaction);

  // ── Sign with signer 2 (reaches threshold = 2) ───────────────────────────

  console.log('rehearse-ownership: signing with signer 2 (reaching 2-of-3 threshold)...');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const protocolKitSigner2 = await (Safe as any).init({
    provider: rpcUrl,
    signer: signer2Pk,
    safeAddress,
  });
  const signedTxSigner2 = await protocolKitSigner2.signTransaction(signedTxSigner1);

  // ── Execute the batch ─────────────────────────────────────────────────────

  console.log('rehearse-ownership: executing batch transaction...');
  const executionResult = await protocolKitSigner1.executeTransaction(signedTxSigner2);

  const txHash = executionResult.hash;
  console.log(`rehearse-ownership: executed. tx hash: ${txHash}`);
  console.log('rehearse-ownership: waiting for confirmation...');

  // ── Wait for receipt via viem ─────────────────────────────────────────────

  const chain = network === 'sepolia' ? arbitrumSepolia : arbitrum;
  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash as `0x${string}`,
  });

  if (receipt.status !== 'success') {
    throw new Error(`rehearse-ownership: batch tx reverted. hash: ${txHash}`);
  }

  console.log(`rehearse-ownership: confirmed in block ${receipt.blockNumber}`);
  console.log('');

  // ── Post-execution owner() verification ──────────────────────────────────

  console.log('rehearse-ownership: verifying owner() == Safe for all 5 contracts...');

  const ownerVerifications: Record<string, boolean> = {};
  let allPassed = true;

  for (const { name, address } of ownable2StepContracts) {
    const owner = await publicClient.readContract({
      address,
      abi: OWNABLE2STEP_ABI,
      functionName: 'owner',
    });

    const passed = owner.toLowerCase() === safeAddress.toLowerCase();
    ownerVerifications[name] = passed;

    if (passed) {
      console.log(`  [PASS] ${name} owner() = ${owner}`);
    } else {
      console.error(`  [FAIL] ${name} owner() = ${owner} (expected ${safeAddress})`);
      allPassed = false;
    }
  }

  console.log('');

  if (!allPassed) {
    throw new Error(
      'rehearse-ownership: one or more owner() verifications failed.\n' +
      'Check that TransferOwnershipToSafe.s.sol was broadcast first and\n' +
      'that the correct SAFE_ADDRESS env var is set.',
    );
  }

  console.log('rehearse-ownership: COMPLETE.');
  console.log(`  All 5 contracts owner() = ${safeAddress}`);
  console.log('');
  console.log('NEXT STEPS:');
  console.log('  1. Verify ProxyAdmin owner() via cast (already transferred by forge script):');
  console.log(`     cast call $PROXY_ADMIN "owner()(address)" --rpc-url $RPC`);
  console.log(`     -> expected: ${safeAddress}`);
  console.log('  2. Run Safe-gated pause test via Safe UI (app.safe.global):');
  console.log(`     Propose: ${contracts.callRegistry}.pause() — signer 2 confirms — execute`);
  console.log(`     cast call $CR "paused()(bool)" --rpc-url $RPC -> true`);
  console.log('  3. Update addresses.ts with SAFE_ARBITRUM_SEPOLIA constant.');
  console.log('  4. Run deploy-safe.ts --network arbitrum-one --execute for production Safe.');
  console.log('');

  return {
    success: true,
    safeAddress,
    txHash,
    ownerVerifications,
  };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { network } = parseRehearsalArgs(process.argv.slice(2));

  try {
    await runRehearsal(network);
    process.exit(0);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\nrehearse-ownership: fatal error: ${msg}`);
    process.exit(1);
  }
}

// Only run main() when invoked directly (not when imported for tests)
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('rehearse-ownership.ts') || process.argv[1].endsWith('rehearse-ownership.js'));

if (isMain) {
  main();
}
