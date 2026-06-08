/**
 * seed-loss-call.ts — seed ONE guaranteed-CallerLost PriceTarget call on Sepolia
 * to unlock the Phase-7 SC1 OG outcome-word baselines for LOUD AND WRONG and
 * FADED CORRECTLY.
 *
 * Both missing outcome words derive from a single CallerLost call: the OG route
 * renders LOUD AND WRONG for the caller view (`/og/<id>`) and FADED CORRECTLY for
 * the fader view (`/og/<id>?as=fader`) on any CallerLost call. No CallerLost call
 * currently exists on Sepolia (call 8 = CALLED IT, call 11 = COLD CALL), so this
 * script seeds one.
 *
 * The guarantee comes from targetValue = 100000000000000n ($1,000,000 in Pyth 8-dp).
 * SettlementManager._settlePyth does `currentPrice >= target ? CallerWon : CallerLost`;
 * ETH (~$3.5k = ~3.5e11 in 8-dp) is far below 1e14, so the call settles CallerLost
 * deterministically once settled via the existing settle-pyth-calls.ts.
 *
 * Usage (from apps/relayer):
 *   npx tsx src/scripts/seed-loss-call.ts                 # LIVE — broadcasts txns
 *   SEED_DRY_RUN=1 npx tsx src/scripts/seed-loss-call.ts  # dry-run — prints plan, exits 0, NO broadcast
 *
 * Env (apps/relayer/.env.local):
 *   - ARBITRUM_SEPOLIA_RPC_URL   (required)
 *   - SOAK_WALLET_0..SOAK_WALLET_9  (test-only Sepolia keys; never mainnet)
 *   - SEED_CALLER_INDEX          (optional, default 2)
 *   - SEED_EXPIRY_SECONDS        (optional, default 150)
 *   - CALL_REGISTRY_ADDRESS      (optional override of the shared Sepolia constant)
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

import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';
import { CALL_REGISTRY_ARBITRUM_SEPOLIA } from '@call-it/shared';

// ── Constants ───────────────────────────────────────────────────────────────

/** Circle USDC on Arbitrum Sepolia (D-01, ADR-0001) — testnet only */
const USDC = '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d' as const satisfies `0x${string}`;

/** ETH/USD Pyth feed id (allowlisted on CallRegistry); passed as assetA via BigInt(ETH_FEED) */
const ETH_FEED = '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace';

/** $5 min stake (6-dp USDC) — the createCall `stake` argument */
const MIN_STAKE = 5_000000n;
/** $10 flat market-creation fee pulled alongside stake (CallRegistry.CREATION_FEE) */
const CREATION_FEE = 10_000000n;
/** USDC the caller must hold + approve: createCall pulls stake + CREATION_FEE = $15 */
const REQUIRED_USDC = MIN_STAKE + CREATION_FEE;
/** Consolidation top-up ceiling — REQUIRED_USDC plus a small buffer */
const TOPUP_CEILING = REQUIRED_USDC + 500000n;

/** CallRegistry — env override precedence over the shared Sepolia constant (matches soak-seeder) */
const CALL_REGISTRY: `0x${string}` =
  (process.env.CALL_REGISTRY_ADDRESS as `0x${string}` | undefined) ?? CALL_REGISTRY_ARBITRUM_SEPOLIA;

const EVIDENCE_PATH = resolve(
  __dirname,
  `../../../../evidence/phase-6-soak/seed-loss-${Date.now()}.jsonl`,
);

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

// ── ABIs ─────────────────────────────────────────────────────────────────────

const CALL_REGISTRY_ABI = parseAbi([
  'function createCall(uint8 marketType, uint8 eventSubtype, uint8 category, uint256 assetA, uint256 assetB, uint256 targetValue, uint64 expiry, uint96 stake, uint8 conviction, bytes32 criteriaHash, bool openToChallenges, uint256 parentCallId) returns (uint256 callId)',
  'event CallCreated(uint256 indexed id, address indexed caller, uint8 marketType, uint96 stake)',
]);

const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

const SOAK_WALLET_COUNT = 10;

async function main(): Promise<void> {
  const rpc = process.env.ARBITRUM_SEPOLIA_RPC_URL;
  if (!rpc || rpc.startsWith('<')) {
    console.error('ARBITRUM_SEPOLIA_RPC_URL not set in apps/relayer/.env.local.');
    process.exit(1);
  }
  const publicClient = createPublicClient({ chain: arbitrumSepolia, transport: http(rpc) });

  // Load SOAK_WALLET_0..SOAK_WALLET_9 (paired with index; invalid → null)
  const walletKeys: (`0x${string}` | null)[] = Array.from({ length: SOAK_WALLET_COUNT }, (_, i) =>
    normalizeKey(process.env[`SOAK_WALLET_${i}`]),
  );

  const callerIndex = Number(process.env.SEED_CALLER_INDEX ?? 2);
  const callerKey = walletKeys[callerIndex];
  if (!callerKey) {
    console.error(
      `SEED_CALLER_INDEX=${callerIndex}: SOAK_WALLET_${callerIndex} not set/invalid. Set a valid test key.`,
    );
    process.exit(1);
  }
  const callerAccount = privateKeyToAccount(callerKey);
  const caller = callerAccount.address;

  // Read caller USDC balance
  const callerBal = (await publicClient.readContract({
    address: USDC,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [caller],
  })) as bigint;

  // Read allowance to compute needsApproval WITHOUT sending
  const allowance = (await publicClient.readContract({
    address: USDC,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [caller, CALL_REGISTRY],
  })) as bigint;

  const needsConsolidation = callerBal < REQUIRED_USDC;
  const needsApproval = allowance < REQUIRED_USDC;

  const nowSec = Math.floor(Date.now() / 1000);
  const expiry = BigInt(nowSec + Number(process.env.SEED_EXPIRY_SECONDS ?? 150));
  const target = 100000000000000n;

  // ── DRY-RUN GATE — prints the plan and exits BEFORE any tx of any kind ──
  if (process.env.SEED_DRY_RUN === '1') {
    console.log('seed-loss-call: DRY RUN (SEED_DRY_RUN=1) — NO transaction will be broadcast');
    console.log(`  CallRegistry:        ${CALL_REGISTRY}`);
    console.log(`  caller index:        ${callerIndex}`);
    console.log(`  caller address:      ${caller}`);
    console.log(`  caller USDC balance: ${callerBal} (raw) = $${Number(callerBal) / 1e6}`);
    console.log(`  required USDC:        ${REQUIRED_USDC} ($${Number(REQUIRED_USDC) / 1e6} = $5 stake + $10 creation fee)`);
    console.log(`  needs consolidation: ${needsConsolidation} (balance < $15 stake+fee)`);
    console.log(`  needs approval:      ${needsApproval} (allowance < $15 stake+fee)`);
    console.log(`  target:              ${target} ($1,000,000 Pyth 8-dp — guarantees CallerLost)`);
    console.log(`  expiry:              ${expiry} (${Number(expiry) - nowSec}s from now)`);
    console.log('seed-loss-call: dry run complete — exiting 0 without broadcasting.');
    process.exit(0);
  }

  // ── LIVE PATH (only reached when SEED_DRY_RUN !== '1') ──
  const callerWallet = createWalletClient({ account: callerAccount, chain: arbitrumSepolia, transport: http(rpc) });

  console.log(`seed-loss-call: LIVE — CallRegistry ${CALL_REGISTRY}`);
  console.log(`  caller[${callerIndex}] ${caller} balance $${Number(callerBal) / 1e6}`);
  console.log(`  evidence -> ${EVIDENCE_PATH}`);

  // (a) Consolidation: pull USDC from other soak wallets until caller >= TOPUP_CEILING
  let bal = callerBal;
  if (bal < TOPUP_CEILING) {
    for (let i = 0; i < SOAK_WALLET_COUNT && bal < TOPUP_CEILING; i++) {
      if (i === callerIndex) continue;
      const donorKey = walletKeys[i];
      if (!donorKey) continue;
      const donorAccount = privateKeyToAccount(donorKey);
      const donorBal = (await publicClient.readContract({
        address: USDC,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [donorAccount.address],
      })) as bigint;
      if (donorBal === 0n) continue;

      const gap = TOPUP_CEILING - bal;
      const amount = donorBal < gap ? donorBal : gap;
      if (amount === 0n) continue;

      const donorWallet = createWalletClient({ account: donorAccount, chain: arbitrumSepolia, transport: http(rpc) });
      const txHash = await donorWallet.writeContract({
        address: USDC,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [caller, amount],
        account: donorAccount,
        chain: arbitrumSepolia,
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`  donor ${donorAccount.address} -> caller ${caller} : ${Number(amount) / 1e6} USDC`);

      bal = (await publicClient.readContract({
        address: USDC,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [caller],
      })) as bigint;
    }
  }

  if (bal < REQUIRED_USDC) {
    console.error(
      `caller ${caller} balance $${Number(bal) / 1e6} < $15 (stake + creation fee) after consolidation — fund a soak wallet via the Circle Sepolia faucet.`,
    );
    process.exit(1);
  }

  // (b) Allowance/approve
  const curAllowance = (await publicClient.readContract({
    address: USDC,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [caller, CALL_REGISTRY],
  })) as bigint;
  if (curAllowance < REQUIRED_USDC) {
    const txHash = await callerWallet.writeContract({
      address: USDC,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CALL_REGISTRY, REQUIRED_USDC],
      account: callerAccount,
      chain: arbitrumSepolia,
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`  approved CallRegistry for $${Number(REQUIRED_USDC) / 1e6} USDC`);
  }

  // (c) createCall — PriceTarget (0), ETH/USD assetA, target = $1M (8-dp) → CallerLost
  const createTx = await callerWallet.writeContract({
    address: CALL_REGISTRY,
    abi: CALL_REGISTRY_ABI,
    functionName: 'createCall',
    args: [
      0, // marketType = PriceTarget
      0, // eventSubtype = None
      0, // category = Majors
      BigInt(ETH_FEED), // assetA = ETH/USD Pyth feed id
      0n, // assetB
      target, // targetValue = 100000000000000 ($1M 8-dp) — guarantees CallerLost
      expiry,
      MIN_STAKE,
      50, // conviction 50%
      '0x0000000000000000000000000000000000000000000000000000000000000001', // non-zero criteriaHash
      false, // openToChallenges
      0n, // parentCallId
    ],
    account: callerAccount,
    chain: arbitrumSepolia,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: createTx });
  const blockNumber = receipt.blockNumber;
  console.log(`  createCall tx ${createTx} (block ${blockNumber})`);

  // (d) Read the new callId from CallCreated logs
  const logs = await publicClient.getLogs({
    address: CALL_REGISTRY,
    event: CALL_REGISTRY_ABI[1],
    fromBlock: blockNumber,
    toBlock: blockNumber,
  });
  const callId = logs.length > 0 ? Number(logs[logs.length - 1].args.id) : null;
  if (callId === null) {
    console.warn('  WARNING: could not decode callId from CallCreated logs — tx still mined (see hash above).');
  }

  // (e) Print follow-up settle command + expected outcome
  const secsToSettle = Number(expiry) - Math.floor(Date.now() / 1000);
  console.log('');
  console.log(`  new callId:           ${callId ?? '(unknown — see tx)'}`);
  console.log(`  expiry (unix):        ${Number(expiry)}`);
  console.log(`  seconds until settle: ${secsToSettle}`);
  console.log('');
  console.log('  AFTER expiry, settle this call (expected outcome: CallerLost = LOUD AND WRONG):');
  console.log(`    npx tsx src/scripts/settle-pyth-calls.ts ${callId ?? '<callId>'}`);
  console.log('  Then:');
  console.log(`    /og/${callId ?? '<callId>'}            renders LOUD AND WRONG`);
  console.log(`    /og/${callId ?? '<callId>'}?as=fader   renders FADED CORRECTLY`);

  // (f) Evidence — stringify the bigint target to avoid JSON.stringify throwing
  appendEvidence({
    action: 'lossCallCreated',
    callId,
    txHash: createTx,
    target: target.toString(),
    expiry: Number(expiry),
    timestamp: Date.now(),
  });

  process.exit(0);
}

main().catch((err) => {
  console.error('seed-loss-call: fatal error:', err);
  process.exit(1);
});
