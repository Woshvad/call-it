/**
 * authorize-rep-writers.ts — one-off owner action to wire the new FollowFadeMarket
 * and SettlementManager as authorized rep-writers on the (reused) ProfileRegistry.
 *
 * WHY THIS EXISTS: DeployPhase6 redeployed FFM (v4) and SM (v5) and rotated the
 * ProfileRegistry SM *pointer* via setSettlementManager(), but never called
 * setAuthorizedRepWriter() for the new FFM/SM. So ProfileRegistry.applyRepDelta()
 * (called by FFM.initPool during createCall, and by SettlementManager.settle)
 * reverts NotAuthorizedWriter — blocking every call creation and settlement.
 * (Also a mainnet blocker: DeployPhase6 needs these authorizations before Phase 7.)
 *
 * Owner-only: signs with SOAK_WALLET_0 (deployer = ProfileRegistry owner).
 * Idempotent: skips writers already authorized. Prints tx hashes; never prints keys.
 *
 * Usage (from apps/relayer):
 *   npx tsx src/scripts/authorize-rep-writers.ts
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
import {
  PROFILE_REGISTRY_ARBITRUM_SEPOLIA,
  FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA,
  SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA,
} from '@call-it/shared';

const ABI = parseAbi([
  'function setAuthorizedRepWriter(address writer, bool authorized)',
  'function authorizedRepWriters(address) view returns (bool)',
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

  const pr =
    (process.env.PROFILE_REGISTRY_ADDRESS as `0x${string}` | undefined) ??
    PROFILE_REGISTRY_ARBITRUM_SEPOLIA;
  const writers: { name: string; address: `0x${string}` }[] = [
    { name: 'FollowFadeMarket', address: FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA },
    { name: 'SettlementManager', address: SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA },
  ];

  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http(rpc) });
  const account = privateKeyToAccount(ownerKey);
  const wallet = createWalletClient({ account, chain: arbitrumSepolia, transport: http(rpc) });

  const onchainOwner = (await publicClient.readContract({
    address: pr,
    abi: ABI,
    functionName: 'owner',
  })) as `0x${string}`;
  console.log(`ProfileRegistry: ${pr}`);
  console.log(`owner():         ${onchainOwner}`);
  console.log(`signer:          ${account.address}`);
  if (onchainOwner.toLowerCase() !== account.address.toLowerCase()) {
    console.error('SOAK_WALLET_0 is NOT the ProfileRegistry owner — cannot authorize. Use the deployer key.');
    process.exit(1);
  }

  for (const w of writers) {
    const already = (await publicClient.readContract({
      address: pr,
      abi: ABI,
      functionName: 'authorizedRepWriters',
      args: [w.address],
    })) as boolean;
    if (already) {
      console.log(`  ${w.name} (${w.address}): already authorized — skipping`);
      continue;
    }
    try {
      const hash = await wallet.writeContract({
        address: pr,
        abi: ABI,
        functionName: 'setAuthorizedRepWriter',
        args: [w.address, true],
        account,
        chain: arbitrumSepolia,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`  ${w.name} (${w.address}): authorized — tx ${hash}`);
    } catch (err) {
      console.error(`  ${w.name}: FAILED — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log('Rep-writer authorization done. createCall (via FFM) and settle (via SM) can now applyRepDelta.');
  process.exit(0);
}

main().catch((err) => {
  console.error('authorize-rep-writers: fatal error:', err);
  process.exit(1);
});
