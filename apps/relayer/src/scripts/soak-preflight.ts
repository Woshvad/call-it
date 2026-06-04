/**
 * soak-preflight.ts — Pre-soak readiness + funding check for the Phase 6 ≥48h Sepolia soak.
 *
 * Reads SOAK_WALLET_0..9 + ARBITRUM_SEPOLIA_RPC_URL from apps/relayer/.env.local,
 * derives each wallet's public address, and reports its ETH (gas) + USDC balance so
 * the operator knows exactly which wallets still need funding BEFORE launching
 * soak-seeder.ts. Prints NO private keys — only derived public addresses + balances.
 *
 * Usage (from apps/relayer):
 *   npx tsx src/scripts/soak-preflight.ts
 *
 * Exit code: 0 when all 10 wallets meet the funding floors, 1 otherwise.
 *
 * Requirements: SAFETY-21..28 (funding precondition for the soak).
 */

import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Load apps/relayer/.env.local (then legacy fallbacks) if env not already populated. */
function loadEnvIfNeeded(): void {
  if (process.env.ARBITRUM_SEPOLIA_RPC_URL && process.env.SOAK_WALLET_0) return;
  const candidates = [
    resolve(__dirname, '../../.env.local'), // apps/relayer/.env.local (correct for this script)
    resolve(__dirname, '../../../.env.local'), // apps/.env.local (legacy)
    resolve(__dirname, '../../../../.env'), // repo-root/.env
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        process.loadEnvFile(p);
        if (process.env.ARBITRUM_SEPOLIA_RPC_URL) break;
      } catch {
        // try next candidate
      }
    }
  }
}

loadEnvIfNeeded();

import { createPublicClient, http, parseAbi, formatEther, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';

/** Circle USDC on Arbitrum Sepolia (D-01) — 6 decimals. */
const USDC =
  (process.env.USDC_ARB_SEPOLIA_ADDRESS as `0x${string}` | undefined) ??
  '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d';
const USDC_ABI = parseAbi(['function balanceOf(address account) view returns (uint256)']);

/** Funding floors per wallet. */
const MIN_USDC = 20; // 20 USDC per wallet
const MIN_ETH = 0.005; // gas floor

/** Normalize a SOAK_WALLET value into a 0x-prefixed 32-byte key, or null if unset/placeholder/invalid. */
function normalizeKey(raw: string | undefined): `0x${string}` | null {
  if (!raw) return null;
  const t = raw.trim();
  if (t === '' || t.startsWith('<')) return null; // unset or <PASTE...> placeholder
  const hex = t.startsWith('0x') ? t : `0x${t}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) return null;
  return hex as `0x${string}`;
}

async function main(): Promise<void> {
  const rpc = process.env.ARBITRUM_SEPOLIA_RPC_URL;
  if (!rpc || rpc.startsWith('<')) {
    console.error(
      'ARBITRUM_SEPOLIA_RPC_URL is not set (still a <PASTE...> placeholder?). Fill it in apps/relayer/.env.local.',
    );
    process.exit(1);
  }

  const client = createPublicClient({ chain: arbitrumSepolia, transport: http(rpc) });

  console.log('soak-preflight — Phase 6 Sepolia funding check');
  console.log(`USDC: ${USDC}  | floors: ${MIN_USDC} USDC + ${MIN_ETH} ETH per wallet`);
  console.log('');

  let configured = 0;
  let needUsdc = 0;
  let needEth = 0;
  const fundAddresses: string[] = [];

  for (let i = 0; i < 10; i++) {
    const key = normalizeKey(process.env[`SOAK_WALLET_${i}`]);
    if (!key) {
      console.log(`  [${i}] NOT SET / placeholder — fill SOAK_WALLET_${i} in .env.local`);
      continue;
    }

    let address: `0x${string}`;
    try {
      address = privateKeyToAccount(key).address;
    } catch {
      console.log(`  [${i}] INVALID KEY (could not derive address)`);
      continue;
    }
    configured++;

    let eth = 0n;
    let usdc = 0n;
    try {
      eth = await client.getBalance({ address });
    } catch {
      // leave 0
    }
    try {
      usdc = (await client.readContract({
        address: USDC,
        abi: USDC_ABI,
        functionName: 'balanceOf',
        args: [address],
      })) as bigint;
    } catch {
      // leave 0
    }

    const ethNum = Number(formatEther(eth));
    const usdcNum = Number(formatUnits(usdc, 6));
    const ethLow = ethNum < MIN_ETH;
    const usdcLow = usdcNum < MIN_USDC;
    if (ethLow) needEth++;
    if (usdcLow) {
      needUsdc++;
      fundAddresses.push(address);
    }

    const flags = `${usdcLow ? ' NEEDS-USDC' : ''}${ethLow ? ' NEEDS-ETH' : ''}`;
    const role = i === 0 ? ' (deployer/owner)' : '';
    console.log(
      `  [${i}]${role} ${address}  ETH=${ethNum.toFixed(4)}  USDC=${usdcNum.toFixed(2)}${flags}`,
    );
  }

  console.log('');
  console.log(`Configured wallets: ${configured}/10`);
  console.log(`Need USDC (< ${MIN_USDC}): ${needUsdc}   |   Need ETH (< ${MIN_ETH}): ${needEth}`);

  if (configured === 10 && needUsdc === 0 && needEth === 0) {
    console.log('READY ✅ — all 10 wallets funded. Safe to launch soak-seeder.ts.');
    process.exit(0);
  }

  if (fundAddresses.length > 0) {
    console.log('');
    console.log(`USDC-faucet these ${fundAddresses.length} address(es) at faucet.circle.com (Arbitrum Sepolia):`);
    for (const a of fundAddresses) console.log(`  ${a}`);
  }
  console.log('NOT READY — fund the flagged wallets, then re-run preflight.');
  process.exit(1);
}

main().catch((err) => {
  console.error('soak-preflight: fatal error:', err);
  process.exit(1);
});
