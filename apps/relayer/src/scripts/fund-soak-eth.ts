/**
 * fund-soak-eth.ts — distribute Sepolia ETH (gas) from SOAK_WALLET_0 (the deployer)
 * to SOAK_WALLET_1..9 so the operator skips the ETH faucet for the soak wallets.
 *
 * Idempotent: only tops up wallets currently below the gas FLOOR. Prints tx hashes;
 * never prints private keys. Aborts cleanly if the deployer can't cover the top-ups.
 *
 * Usage (from apps/relayer):
 *   npx tsx src/scripts/fund-soak-eth.ts
 *
 * Reads SOAK_WALLET_0..9 + ARBITRUM_SEPOLIA_RPC_URL from apps/relayer/.env.local.
 */

import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvIfNeeded(): void {
  if (process.env.ARBITRUM_SEPOLIA_RPC_URL && process.env.SOAK_WALLET_0) return;
  const candidates = [
    resolve(__dirname, '../../.env.local'), // apps/relayer/.env.local (correct)
    resolve(__dirname, '../../../.env.local'), // apps/.env.local (legacy)
    resolve(__dirname, '../../../../.env'), // repo-root/.env
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        process.loadEnvFile(p);
        if (process.env.ARBITRUM_SEPOLIA_RPC_URL) break;
      } catch {
        // try next
      }
    }
  }
}

loadEnvIfNeeded();

import { createPublicClient, createWalletClient, http, parseEther, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';

const FLOOR = parseEther('0.005'); // top up wallets below this
const TOPUP = parseEther('0.006'); // amount sent to each under-funded wallet
const SENDER_BUFFER = parseEther('0.01'); // keep this much on the deployer for its own gas

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
    console.error('ARBITRUM_SEPOLIA_RPC_URL not set. Fill it in apps/relayer/.env.local.');
    process.exit(1);
  }

  const senderKey = normalizeKey(process.env.SOAK_WALLET_0);
  if (!senderKey) {
    console.error('SOAK_WALLET_0 (deployer key) not set or invalid. Fill it in apps/relayer/.env.local.');
    process.exit(1);
  }

  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http(rpc) });
  const sender = privateKeyToAccount(senderKey);
  const wallet = createWalletClient({ account: sender, chain: arbitrumSepolia, transport: http(rpc) });

  // Collect under-funded targets (slots 1..9).
  const targets: { index: number; address: `0x${string}` }[] = [];
  for (let i = 1; i <= 9; i++) {
    const key = normalizeKey(process.env[`SOAK_WALLET_${i}`]);
    if (!key) {
      console.log(`  [${i}] not set — skipping`);
      continue;
    }
    const address = privateKeyToAccount(key).address;
    const bal = await publicClient.getBalance({ address });
    if (bal < FLOOR) targets.push({ index: i, address });
    else console.log(`  [${i}] ${address} already has ${formatEther(bal)} ETH — skipping`);
  }

  if (targets.length === 0) {
    console.log('All soak wallets already meet the ETH floor. Nothing to do.');
    process.exit(0);
  }

  // Affordability check.
  const required = TOPUP * BigInt(targets.length) + SENDER_BUFFER;
  const senderBal = await publicClient.getBalance({ address: sender.address });
  console.log(`Deployer ${sender.address} balance: ${formatEther(senderBal)} ETH`);
  console.log(`Distributing ${formatEther(TOPUP)} ETH to ${targets.length} wallet(s) (need ~${formatEther(required)} ETH incl. buffer)`);
  if (senderBal < required) {
    console.error(
      `Deployer ETH too low. Faucet more Sepolia ETH to ${sender.address} (need ~${formatEther(required)} ETH), then re-run.`,
    );
    process.exit(1);
  }

  for (const t of targets) {
    try {
      const hash = await wallet.sendTransaction({
        account: sender,
        chain: arbitrumSepolia,
        to: t.address,
        value: TOPUP,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`  [${t.index}] sent ${formatEther(TOPUP)} ETH -> ${t.address}  tx ${hash}`);
    } catch (err) {
      console.error(`  [${t.index}] FAILED -> ${t.address}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log('ETH distribution complete. Re-run soak-preflight.ts to confirm.');
  process.exit(0);
}

main().catch((err) => {
  console.error('fund-soak-eth: fatal error:', err);
  process.exit(1);
});
