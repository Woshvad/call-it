/**
 * settle-pyth-calls.ts — settle expired Pyth-price calls (PriceTarget / SpreadVs)
 * by fetching the Hermes price-update VAA and passing it to settle().
 *
 * settle() is PERMISSIONLESS and NOT payable: the SettlementManager pays the Pyth
 * update fee from its OWN ETH balance (funded at deploy). We just supply the
 * Hermes update data so `_settlePyth` → getPriceNoOlderThan(assetA, 60) sees a
 * fresh on-chain price. _settlePyth reads only assetA, so both PriceTarget(0) and
 * SpreadVs(1) settle this way; Event(2) calls route to the relayer attestation
 * plane and will emit SettlementDelayed("attestation-pending") instead.
 *
 * Outcome: targetValue is in Pyth 8-dp units; the soak's ~$30 targets vs ETH ~$3000
 * settle CallerWon ("CALLED IT").
 *
 * Usage (from apps/relayer):
 *   npx tsx src/scripts/settle-pyth-calls.ts [callId ...]   (defaults to 1..10)
 */

import { resolve, dirname } from 'node:path';
import { existsSync, appendFileSync, mkdirSync } from 'node:fs';
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

import { createPublicClient, createWalletClient, http, parseAbi, decodeEventLog, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';
import { SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA } from '@call-it/shared';

const ETH_FEED = '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace';
const HERMES = 'https://hermes.pyth.network/v2/updates/price/latest';

const SM_ABI = parseAbi([
  'function settle(uint256 callId, bytes[] pythUpdateData, uint256[] acceptedChallengeIds)',
  'event CallSettled(uint256 indexed callId, uint8 outcome, int256 priceDelta)',
  'event SettlementDelayed(uint256 indexed callId, string reason, uint256 retryAt)',
]);

const OUTCOME: Record<number, string> = {
  0: 'Pending',
  1: 'CallerWon (CALLED IT)',
  2: 'CallerLost (LOUD AND WRONG)',
};

const EVIDENCE_PATH = resolve(__dirname, `../../../../evidence/phase-6-soak/settle-${Date.now()}.jsonl`);

function appendEvidence(entry: Record<string, unknown>): void {
  try {
    const dir = resolve(__dirname, '../../../../evidence/phase-6-soak');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(EVIDENCE_PATH, JSON.stringify(entry) + '\n', 'utf8');
  } catch (err) {
    console.error('[evidence] write failed:', err);
  }
}

function normalizeKey(raw: string | undefined): `0x${string}` | null {
  if (!raw) return null;
  const t = raw.trim();
  if (t === '' || t.startsWith('<')) return null;
  const hex = t.startsWith('0x') ? t : `0x${t}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) return null;
  return hex as `0x${string}`;
}

async function fetchEthVaa(): Promise<`0x${string}`> {
  const res = await fetch(`${HERMES}?ids[]=${ETH_FEED}`);
  if (!res.ok) throw new Error(`Hermes HTTP ${res.status}`);
  const j = (await res.json()) as { binary?: { data?: string[] } };
  const data = j?.binary?.data?.[0];
  if (!data) throw new Error('Hermes returned no binary update data');
  return (data.startsWith('0x') ? data : `0x${data}`) as `0x${string}`;
}

async function main(): Promise<void> {
  const rpc = process.env.ARBITRUM_SEPOLIA_RPC_URL;
  if (!rpc || rpc.startsWith('<')) {
    console.error('ARBITRUM_SEPOLIA_RPC_URL not set in apps/relayer/.env.local.');
    process.exit(1);
  }
  const key = normalizeKey(process.env.SOAK_WALLET_0);
  if (!key) {
    console.error('SOAK_WALLET_0 not set/invalid (settle is permissionless; any funded wallet works).');
    process.exit(1);
  }

  const sm =
    (process.env.SM_ADDRESS as `0x${string}` | undefined) ?? SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA;
  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http(rpc) });
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ account, chain: arbitrumSepolia, transport: http(rpc) });

  const smBal = await publicClient.getBalance({ address: sm });
  console.log(`SettlementManager ${sm}`);
  console.log(`  ETH balance (pays Pyth fee): ${formatEther(smBal)} ETH`);
  console.log(`  settle caller: ${account.address}`);
  console.log(`  evidence -> ${EVIDENCE_PATH}`);

  const argIds = process.argv.slice(2).map((s) => Number(s)).filter((n) => Number.isInteger(n) && n > 0);
  const callIds = argIds.length > 0 ? argIds : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  console.log(`  callIds: [${callIds.join(', ')}]`);
  console.log('');

  let settled = 0;
  let delayed = 0;
  let failed = 0;

  for (const callId of callIds) {
    try {
      const vaa = await fetchEthVaa(); // fresh per call to stay within the 60s window
      const hash = await wallet.writeContract({
        address: sm,
        abi: SM_ABI,
        functionName: 'settle',
        args: [BigInt(callId), [vaa], []],
        account,
        chain: arbitrumSepolia,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      let summary = 'tx mined (no CallSettled/SettlementDelayed decoded)';
      for (const log of receipt.logs) {
        try {
          const d = decodeEventLog({ abi: SM_ABI, data: log.data, topics: log.topics });
          if (d.eventName === 'CallSettled') {
            const o = Number((d.args as { outcome: number }).outcome);
            summary = `SETTLED — outcome=${OUTCOME[o] ?? o}`;
            settled++;
            appendEvidence({ action: 'settled', txHash: hash, callId, outcome: o, block: Number(receipt.blockNumber), timestamp: Date.now() });
          } else if (d.eventName === 'SettlementDelayed') {
            const reason = (d.args as { reason: string }).reason;
            summary = `DELAYED — reason="${reason}"`;
            delayed++;
            appendEvidence({ action: 'settlementDelayed', txHash: hash, callId, reason, block: Number(receipt.blockNumber), timestamp: Date.now() });
          }
        } catch {
          // not one of our events
        }
      }
      console.log(`  call #${callId}: ${summary} — tx ${hash}`);
    } catch (err) {
      failed++;
      const e = err as { shortMessage?: string; metaMessages?: string[]; details?: string };
      const msg = [e?.shortMessage, e?.details, (e?.metaMessages ?? []).join(' ')]
        .filter(Boolean)
        .join(' | ')
        .slice(0, 400) || (err instanceof Error ? err.message.slice(0, 200) : String(err));
      console.log(`  call #${callId}: FAILED — ${msg}`);
    }
  }

  console.log('');
  console.log(`settle-pyth: settled=${settled}, delayed=${delayed}, failed=${failed}`);
  process.exit(failed > 0 && settled === 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('settle-pyth-calls: fatal error:', err);
  process.exit(1);
});
