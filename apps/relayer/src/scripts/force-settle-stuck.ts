/**
 * force-settle-stuck.ts — owner forceSettle for the 5 stuck seeded Event calls
 * (#3–#7: marketType 2, empty criteria store, non-Pyth oracle rail not live —
 * the settlement poller skips them by design, settlement_poller_skip_non_pyth).
 * User approved cleanup via forceSettle on 2026-06-12.
 *
 * forceSettle is onlyOwner (SettlementManager.sol:389) and gated by
 * FORCE_SETTLE_COOLDOWN = expiry + 7 days (SETTLE-39). For #3–#7 the cooldown
 * unlocks 2026-06-13 11:16 UTC (expiry 2026-06-06 11:16 UTC). The forced
 * outcome is ALWAYS CallerLost — "permissive default, owner is the decider"
 * (SettlementManager.sol:400) — so these land on the settled tab as
 * LOUD AND WRONG receipts for their seeded test-wallet callers.
 *
 * Safety rails:
 *   - signer = DEPLOYER_PRIVATE_KEY (root .env); HARD-REFUSES unless the
 *     derived address equals SM.owner() on-chain
 *   - skips ids already Settled (AlreadySettled pre-check)
 *   - skips ids still inside the cooldown, printing the unlock time
 *   - waits for each receipt and asserts on-chain success
 *
 * Usage (from apps/relayer):
 *   npx tsx src/scripts/force-settle-stuck.ts [callId ...]   (defaults to 3..7)
 */

import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvIfNeeded(): void {
  if (process.env.ARBITRUM_SEPOLIA_RPC_URL && process.env.DEPLOYER_PRIVATE_KEY) return;
  const candidates = [
    resolve(__dirname, '../../.env.local'),
    resolve(__dirname, '../../../.env.local'),
    resolve(__dirname, '../../../../.env'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        process.loadEnvFile(p);
        if (process.env.DEPLOYER_PRIVATE_KEY) break;
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
import { SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA } from '@call-it/shared';

const FORCE_SETTLE_COOLDOWN = 604_800n; // 7 days (SettlementManager.FORCE_SETTLE_COOLDOWN)
const STATUS_SETTLED = 2; // ICallRegistry.CallStatus.Settled

const SM_ABI = parseAbi([
  'function owner() view returns (address)',
  'function callRegistry() view returns (address)',
  'function forceSettle(uint256 callId)',
]);

// CallRegistry.getCall ABI slice (mirrors call-enrichment.ts:40-74).
const CALL_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'getCall',
    stateMutability: 'view',
    inputs: [{ name: 'callId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'caller', type: 'address' },
          { name: 'stake', type: 'uint96' },
          { name: 'virtualFadeSeed', type: 'uint96' },
          { name: 'createdAt', type: 'uint64' },
          { name: 'expiry', type: 'uint64' },
          { name: 'marketType', type: 'uint8' },
          { name: 'eventSubtype', type: 'uint8' },
          { name: 'category', type: 'uint8' },
          { name: 'status', type: 'uint8' },
          { name: 'conviction', type: 'uint8' },
          { name: 'openToChallenges', type: 'bool' },
          { name: 'callerExitedAt', type: 'uint64' },
          { name: 'outcome', type: 'uint8' },
          { name: 'duplicateHash', type: 'bytes32' },
          { name: 'criteriaHash', type: 'bytes32' },
          { name: 'assetA', type: 'uint256' },
          { name: 'assetB', type: 'uint256' },
          { name: 'targetValue', type: 'uint256' },
          { name: 'parentCallId', type: 'uint256' },
        ],
      },
    ],
  },
] as const;

function normalizeKey(raw: string | undefined): `0x${string}` | null {
  if (!raw) return null;
  const t = raw.trim();
  if (t === '' || t.startsWith('<')) return null;
  const hex = t.startsWith('0x') ? t : `0x${t}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) return null;
  return hex as `0x${string}`;
}

function utc(tsSeconds: bigint): string {
  return new Date(Number(tsSeconds) * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

async function main(): Promise<void> {
  const ids = process.argv.slice(2).length
    ? process.argv.slice(2).map((a) => BigInt(a))
    : [3n, 4n, 5n, 6n, 7n];

  const key = normalizeKey(process.env.DEPLOYER_PRIVATE_KEY);
  if (!key) {
    console.error('DEPLOYER_PRIVATE_KEY missing/malformed — set it in the repo-root .env');
    process.exit(1);
  }
  const account = privateKeyToAccount(key);

  const rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL ?? 'https://sepolia-rollup.arbitrum.io/rpc';
  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: arbitrumSepolia, transport: http(rpcUrl) });

  const sm = SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA as `0x${string}`;

  // HARD owner gate — forceSettle is onlyOwner; anything else just burns gas on a revert.
  const owner = await publicClient.readContract({ address: sm, abi: SM_ABI, functionName: 'owner' });
  if (owner.toLowerCase() !== account.address.toLowerCase()) {
    console.error(
      `REFUSING: signer ${account.address} is not the SettlementManager owner (${owner}). ` +
        'forceSettle is onlyOwner — use the deployer/treasury key.',
    );
    process.exit(1);
  }

  const registry = await publicClient.readContract({ address: sm, abi: SM_ABI, functionName: 'callRegistry' });
  const block = await publicClient.getBlock();
  console.log(`SettlementManager ${sm} | owner OK (${account.address})`);
  console.log(`CallRegistry ${registry} | chain time ${utc(block.timestamp)}\n`);

  const results: Record<string, string> = {};

  for (const id of ids) {
    const idStr = id.toString();
    const call = await publicClient.readContract({
      address: registry,
      abi: CALL_REGISTRY_ABI,
      functionName: 'getCall',
      args: [id],
    });

    if (call.createdAt === 0n) {
      results[idStr] = 'SKIP — nonexistent id (zero struct)';
      console.log(`call ${idStr}: ${results[idStr]}`);
      continue;
    }
    if (call.status === STATUS_SETTLED) {
      results[idStr] = 'SKIP — already settled';
      console.log(`call ${idStr}: ${results[idStr]}`);
      continue;
    }

    const unlock = BigInt(call.expiry) + FORCE_SETTLE_COOLDOWN;
    if (block.timestamp < unlock) {
      results[idStr] = `SKIP — cooldown active, unlocks ${utc(unlock)} (ForceSettleCooldownActive)`;
      console.log(`call ${idStr}: ${results[idStr]}`);
      continue;
    }

    console.log(`call ${idStr}: forceSettle → forced CallerLost (LOUD AND WRONG, SM.sol:400)…`);
    try {
      const txHash = await walletClient.writeContract({
        address: sm,
        abi: SM_ABI,
        functionName: 'forceSettle',
        args: [id],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') {
        results[idStr] = `FAILED — tx ${txHash} mined but REVERTED`;
      } else {
        results[idStr] = `SETTLED (CallerLost) — tx ${txHash}`;
      }
    } catch (err) {
      results[idStr] = `FAILED — ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`;
    }
    console.log(`call ${idStr}: ${results[idStr]}`);
  }

  console.log('\n── summary ──');
  for (const [idStr, r] of Object.entries(results)) console.log(`  #${idStr}: ${r}`);
  const failed = Object.values(results).filter((r) => r.startsWith('FAILED')).length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
