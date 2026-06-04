/**
 * allowlist-soak-assets.ts — one-off owner action to populate the CallRegistry
 * asset allowlist on the live Sepolia cluster.
 *
 * WHY THIS EXISTS: DeployPhase6.s.sol deploys CallRegistry but never calls
 * addAsset(), so the live cluster (CR 0x015758Cb) has an EMPTY asset allowlist —
 * every createCall reverts AssetNotAllowlisted. (This is also a mainnet blocker:
 * DeployPhase6 needs an allowlist step before the Phase 7 mainnet deploy.) This
 * script allowlists the core Pyth feeds so the soak can create calls.
 *
 * Owner-only: signs with SOAK_WALLET_0 (the deployer = CallRegistry owner).
 * Idempotent: skips feeds already allowlisted. Prints tx hashes; never prints keys.
 *
 * Usage (from apps/relayer):
 *   npx tsx src/scripts/allowlist-soak-assets.ts
 */

import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvIfNeeded(): void {
  if (process.env.ARBITRUM_SEPOLIA_RPC_URL && process.env.SOAK_WALLET_0) return;
  const candidates = [
    resolve(__dirname, '../../.env.local'),
    resolve(__dirname, '../../../.env.local'),
    resolve(__dirname, '../../../../.env'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        process.loadEnvFile(p);
        if (process.env.ARBITRUM_SEPOLIA_RPC_URL) break;
      } catch {
        // next
      }
    }
  }
}

loadEnvIfNeeded();

import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';
import { CALL_REGISTRY_ARBITRUM_SEPOLIA } from '@call-it/shared';

/** Core Pyth feed IDs (CLAUDE.md catalogue) — bytes32, 0x-prefixed. */
const FEEDS: { symbol: string; feedId: `0x${string}` }[] = [
  { symbol: 'ETH', feedId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace' },
  { symbol: 'BTC', feedId: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43' },
  { symbol: 'SOL', feedId: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d' },
  { symbol: 'ARB', feedId: '0x3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5' },
  { symbol: 'OP', feedId: '0x385f64d993f7b77d8182ed5003d97c60aa3361f3cecfe711544d2d59165e9bdf' },
  { symbol: 'POL', feedId: '0xffd11c5a1cfd42f80afb2df4d9f264c15f956d68153335374ec10722edd70472' },
];

const ABI = parseAbi([
  'function addAsset(string symbol, bytes32 feedId)',
  'function allowlistedFeedKeys(bytes32) view returns (bool)',
  'function owner() view returns (address)',
]);

function normalizeKey(raw: string | undefined): `0x${string}` | null {
  if (!raw) return null;
  const t = raw.trim();
  if (t === '' || t.startsWith('<')) return null;
  const hex = t.startsWith('0x') ? t : `0x${t}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) return null;
  return hex as `0x${string}`;
}

async function main(): Promise<void> {
  const rpc = process.env.ARBITRUM_SEPOLIA_RPC_URL;
  if (!rpc || rpc.startsWith('<')) {
    console.error('ARBITRUM_SEPOLIA_RPC_URL not set in apps/relayer/.env.local.');
    process.exit(1);
  }
  const ownerKey = normalizeKey(process.env.SOAK_WALLET_0);
  if (!ownerKey) {
    console.error('SOAK_WALLET_0 (deployer/owner key) not set or invalid.');
    process.exit(1);
  }

  const cr =
    (process.env.CALL_REGISTRY_ADDRESS as `0x${string}` | undefined) ?? CALL_REGISTRY_ARBITRUM_SEPOLIA;
  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http(rpc) });
  const account = privateKeyToAccount(ownerKey);
  const wallet = createWalletClient({ account, chain: arbitrumSepolia, transport: http(rpc) });

  // Sanity: signer must be the CallRegistry owner.
  const onchainOwner = (await publicClient.readContract({
    address: cr,
    abi: ABI,
    functionName: 'owner',
  })) as `0x${string}`;
  console.log(`CallRegistry: ${cr}`);
  console.log(`owner():      ${onchainOwner}`);
  console.log(`signer:       ${account.address}`);
  if (onchainOwner.toLowerCase() !== account.address.toLowerCase()) {
    console.error('SOAK_WALLET_0 is NOT the CallRegistry owner — cannot allowlist. Use the deployer key.');
    process.exit(1);
  }

  for (const f of FEEDS) {
    const already = (await publicClient.readContract({
      address: cr,
      abi: ABI,
      functionName: 'allowlistedFeedKeys',
      args: [f.feedId],
    })) as boolean;
    if (already) {
      console.log(`  ${f.symbol}: already allowlisted — skipping`);
      continue;
    }
    try {
      const hash = await wallet.writeContract({
        address: cr,
        abi: ABI,
        functionName: 'addAsset',
        args: [f.symbol, f.feedId],
        account,
        chain: arbitrumSepolia,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`  ${f.symbol}: allowlisted — tx ${hash}`);
    } catch (err) {
      console.error(`  ${f.symbol}: FAILED — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log('Allowlist done. ETH feed key is what the seeder uses for assetA.');
  process.exit(0);
}

main().catch((err) => {
  console.error('allowlist-soak-assets: fatal error:', err);
  process.exit(1);
});
