/**
 * soak-seeder.ts — Scripted seeding bot for the Phase 6 ≥48h Sepolia soak.
 *
 * Purpose (D-04, SAFETY-21–28):
 *   Drives the on-chain soak activity required to pass the Phase 6 Sepolia staging gate:
 *     Phase A: ≥10 calls covering all market types / event subtypes
 *     Phase B: ≥30 follow/fade positions (≥15 each), distributed across 10 wallets
 *     Phase C: Settle ≥3 calls per type; detect SettlementDelayed for Pyth retries
 *     Phase D: Caller-exit on one seeded call (after 24h)
 *     Phase E: Challenge cycle (propose → accept → settle duel)
 *     Phase F: Dispute + owner resolution
 *
 * Evidence log (D-05):
 *   Each soak action appends an EvidenceEntry JSON line to
 *   evidence/phase-6-soak/evidence-${Date.now()}.jsonl. The tx hashes in the log
 *   are independently verifiable on https://sepolia.arbiscan.io.
 *
 * Alerts (D-05):
 *   On settle-stuck >25 minutes: sendAlertSafe('settle_stuck_25m', { callId })
 *   Reuses the stylus-deactivation-watcher.ts alert path (WR-03 non-crashing pattern).
 *
 * Multi-wallet design (T-06-04-03, T-06-04-04):
 *   10 test wallets funded via Circle Sepolia faucet.
 *   Keys read from SOAK_WALLET_0..SOAK_WALLET_9 env vars — NEVER stored in repo.
 *   FAUCET_RATE_LIMIT_MS (2h) guard between faucet-dependent actions per wallet.
 *
 * Owner-gated actions:
 *   Phase F's resolveDispute is restricted by Ownable2Step to the contract owner
 *   (0xDa8c5726f596E8dae99e6dDEBa8AEa1c8bE9A4a5 = treasury = SOAK_WALLET_0 after the
 *   2026-06-06 owner-key-recovery redeploy). Provide the owner key via
 *   SOAK_OWNER_PRIVATE_KEY to run it; if unset, resolveDispute is skipped gracefully
 *   (NOT counted as an error).
 *
 * Phase subsetting (E/F standalone):
 *   "challenge needs a Live+unexpired call" and "dispute needs a settled call" are
 *   mutually exclusive within one run, so E and F can be run on their own against
 *   pre-existing callIds via SOAK_PHASES + SOAK_CALL_IDS.
 *
 * Usage:
 *   # From apps/relayer — full A-F run:
 *   npx tsx src/scripts/soak-seeder.ts
 *   # Phase E standalone (challenge a pre-existing Live+unexpired call #5 created by wallet 4):
 *   SOAK_PHASES=E SOAK_CHALLENGE_CALL_ID=5 SOAK_CALLER_INDEX=4 npx tsx src/scripts/soak-seeder.ts
 *   # Phase F standalone (dispute+resolve a pre-existing settled call #8):
 *   SOAK_PHASES=F SOAK_CALL_IDS=8 SOAK_OWNER_PRIVATE_KEY=0x... npx tsx src/scripts/soak-seeder.ts
 *
 * Prerequisites:
 *   - ARBITRUM_SEPOLIA_RPC_URL, SOAK_WALLET_0..SOAK_WALLET_9 env vars set
 *   - CALL_REGISTRY_ADDRESS, FFM_ADDRESS, CE_ADDRESS, SM_ADDRESS set (or uses addresses.ts defaults)
 *   - Wallets funded with Circle Sepolia USDC + Sepolia ETH
 *
 * Env vars (new — phase subsetting + funding + owner gating):
 *   - SOAK_PHASES            Comma-separated, case-insensitive subset of A,B,C,D,E,F
 *                            (default "A,B,C,D,E,F"). Only enabled phases run.
 *   - SOAK_CALL_IDS          Comma-separated integers — pre-existing callIds for B-F when
 *                            Phase A is skipped. If A runs, its output is preferred and
 *                            SOAK_CALL_IDS is used only as a fallback.
 *   - SOAK_CHALLENGE_CALL_ID Explicit Phase E target (must be Live+unexpired). Falls back
 *                            to callIds[1].
 *   - SOAK_DISPUTE_CALL_ID   Explicit Phase F target (must be settled). Falls back to callIds[0].
 *   - SOAK_CHALLENGER_INDEX  Integer 0-9 — Phase E challenger wallet. Default (callerIndex+1)%10.
 *   - SOAK_CALLER_INDEX      Integer 0-9 — Phase E caller wallet (the one that created the target
 *                            call; acceptChallenge is caller-restricted). Default (callId-1)%10,
 *                            correct ONLY for a fresh full-run contract — set it explicitly for a
 *                            standalone Phase E against a pre-existing call.
 *   - SOAK_DISPUTER_INDEX    Integer 0-9 — Phase F disputer wallet. Default 4 (proven SAFETY-27 run).
 *   - SOAK_OWNER_PRIVATE_KEY Owner key for 0xDa8c5726f596E8dae99e6dDEBa8AEa1c8bE9A4a5 (treasury /
 *                            SOAK_WALLET_0) — required to run Phase F resolveDispute; if unset, skipped.
 *   - SOAK_CALL_EXPIRY_SECONDS  Phase A call expiry offset (default 2h).
 *
 * Compile check: cd apps/relayer && npx tsc --noEmit
 *
 * Requirements: SAFETY-21, SAFETY-22, SAFETY-23, SAFETY-24, SAFETY-25, SAFETY-26,
 *               SAFETY-27, SAFETY-28
 */

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Env loader (mirrors backfill-criteria.ts) ──────────────────────────────

function loadEnvIfNeeded(): void {
  if (!process.env.ARBITRUM_SEPOLIA_RPC_URL) {
    const envCandidates = [
      resolve(__dirname, '../../.env.local'), // apps/relayer/.env.local (correct for this script)
      resolve(__dirname, '../../../.env.local'), // apps/.env.local (legacy)
      resolve(__dirname, '../../../../.env'), // repo-root/.env
    ];
    for (const envPath of envCandidates) {
      if (existsSync(envPath)) {
        try {
          process.loadEnvFile(envPath);
          if (process.env.ARBITRUM_SEPOLIA_RPC_URL) break;
        } catch {
          // continue to next candidate
        }
      }
    }
  }
}

loadEnvIfNeeded();

import { createPublicClient, createWalletClient, http, parseAbi, decodeEventLog } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';
import { sendAlertSafe } from '../workers/alerts.js';
import {
  CALL_REGISTRY_ARBITRUM_SEPOLIA,
  FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA,
  CHALLENGE_ESCROW_ARBITRUM_SEPOLIA,
  SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA,
} from '@call-it/shared';

// ── Evidence log ──────────────────────────────────────────────────────────────

interface EvidenceEntry {
  action:
    | 'callCreated'
    | 'followed'
    | 'faded'
    | 'settled'
    | 'callerExited'
    | 'challengeProposed'
    | 'challengeAccepted'
    | 'challengeSettled'
    | 'disputeRaised'
    | 'disputeResolved'
    | 'settlementDelayed';
  txHash: `0x${string}`;
  callId?: number;
  walletIndex?: number;
  timestamp: number;
  block?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Circle Sepolia faucet rate limit: 2 hours per wallet per request */
const FAUCET_RATE_LIMIT_MS = 7_200_000;

/** Path for this seeder run's evidence JSONL file (one per invocation) */
const EVIDENCE_LOG_PATH = resolve(
  __dirname,
  `../../../../evidence/phase-6-soak/evidence-${Date.now()}.jsonl`,
);

/** Circle USDC on Arbitrum Sepolia (D-01, ADR-0001) */
const USDC_ARB_SEPOLIA =
  (process.env.USDC_ARB_SEPOLIA_ADDRESS as `0x${string}` | undefined) ??
  '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d';

/** Protocol contract addresses — env vars take precedence over addresses.ts constants */
const CALL_REGISTRY_ADDRESS: `0x${string}` =
  (process.env.CALL_REGISTRY_ADDRESS as `0x${string}` | undefined) ??
  CALL_REGISTRY_ARBITRUM_SEPOLIA;
const FFM_ADDRESS: `0x${string}` =
  (process.env.FFM_ADDRESS as `0x${string}` | undefined) ??
  FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA;
const CE_ADDRESS: `0x${string}` =
  (process.env.CE_ADDRESS as `0x${string}` | undefined) ??
  CHALLENGE_ESCROW_ARBITRUM_SEPOLIA;
const SM_ADDRESS: `0x${string}` =
  (process.env.SM_ADDRESS as `0x${string}` | undefined) ??
  SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA;

// ── Wallet setup ──────────────────────────────────────────────────────────────

/** 10 soak wallets — keys from env SOAK_WALLET_0..SOAK_WALLET_9 */
const SOAK_WALLET_COUNT = 10;

/**
 * Canonical owner of all 5 contracts (Ownable2Step). resolveDispute is restricted
 * to this address. After the 2026-06-06 owner-key-recovery redeploy this is the
 * treasury 0xDa8c5726 (== SOAK_WALLET_0), so SOAK_OWNER_PRIVATE_KEY can be that key.
 */
const SOAK_OWNER_ADDRESS = '0xDa8c5726f596E8dae99e6dDEBa8AEa1c8bE9A4a5' as const;

/** Minimum USDC for a Phase E/F stake or bond: $5 = 5_000000 (6-decimal USDC) */
const MIN_STAKE_USDC = 5_000000n;

function getSoakWalletKey(index: number): `0x${string}` | null {
  const key = process.env[`SOAK_WALLET_${index}`];
  if (!key) return null;
  return key.startsWith('0x') ? (key as `0x${string}`) : (`0x${key}` as `0x${string}`);
}

/** Normalize an arbitrary private-key string to a 0x-prefixed hex key. */
function normalizePrivateKey(key: string): `0x${string}` {
  return key.startsWith('0x') ? (key as `0x${string}`) : (`0x${key}` as `0x${string}`);
}

// ── Phase subsetting (SOAK_PHASES) ─────────────────────────────────────────────

type PhaseId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

/** Parse SOAK_PHASES (comma-separated, case-insensitive). Default: all phases A-F. */
function parseEnabledPhases(): Set<PhaseId> {
  const raw = process.env.SOAK_PHASES;
  if (!raw || !raw.trim()) {
    return new Set<PhaseId>(['A', 'B', 'C', 'D', 'E', 'F']);
  }
  const valid: PhaseId[] = ['A', 'B', 'C', 'D', 'E', 'F'];
  const enabled = new Set<PhaseId>();
  for (const token of raw.split(',')) {
    const p = token.trim().toUpperCase();
    if ((valid as string[]).includes(p)) {
      enabled.add(p as PhaseId);
    } else if (p) {
      console.warn(`soak-seeder: SOAK_PHASES — ignoring unknown phase '${token.trim()}'`);
    }
  }
  return enabled;
}

/** Parse SOAK_CALL_IDS (comma-separated integers). Returns [] when unset/empty. */
function parseSoakCallIds(): number[] {
  const raw = process.env.SOAK_CALL_IDS;
  if (!raw || !raw.trim()) return [];
  const ids: number[] = [];
  for (const token of raw.split(',')) {
    const t = token.trim();
    if (!t) continue;
    const n = Number(t);
    if (Number.isInteger(n) && n >= 0) {
      ids.push(n);
    } else {
      console.warn(`soak-seeder: SOAK_CALL_IDS — ignoring non-integer '${t}'`);
    }
  }
  return ids;
}

/** Parse an integer wallet-index env var (0-9). Returns null when unset/invalid. */
function parseWalletIndexEnv(name: string): number | null {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n < 0 || n >= SOAK_WALLET_COUNT) {
    console.warn(`soak-seeder: ${name}='${raw}' is not an integer in 0-${SOAK_WALLET_COUNT - 1} — ignoring`);
    return null;
  }
  return n;
}

/** Parse an explicit override callId env var (Phase E/F target). Returns null when unset/invalid. */
function parseCallIdEnv(name: string): number | null {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return null;
  const n = Number(raw.trim());
  if (!Number.isInteger(n) || n < 0) {
    console.warn(`soak-seeder: ${name}='${raw}' is not a non-negative integer — ignoring`);
    return null;
  }
  return n;
}

// ── Minimal ABIs (inline — no external ABI files needed) ─────────────────────

const CALL_REGISTRY_ABI = parseAbi([
  'function createCall(uint8 marketType, uint8 eventSubtype, uint8 category, uint256 assetA, uint256 assetB, uint256 targetValue, uint64 expiry, uint96 stake, uint8 conviction, bytes32 criteriaHash, bool openToChallenges, uint256 parentCallId) returns (uint256 callId)',
  'event CallCreated(uint256 indexed id, address indexed caller, uint8 marketType, uint96 stake)',
]);

const FFM_ABI = parseAbi([
  'function follow(uint256 callId, uint256 amount, uint256 minSharesOut)',
  'function fade(uint256 callId, uint256 amount, uint256 minSharesOut)',
  'function callerExit(uint256 callId)',
]);

const CE_ABI = parseAbi([
  'function proposeChallenge(uint256 callId, uint96 stake) returns (uint256 challengeId)',
  'function acceptChallenge(uint256 challengeId)',
  'function claimDuelPayout(uint256 challengeId)',
  'event ChallengeProposed(uint256 indexed challengeId, uint256 indexed callId, address indexed challenger, uint96 stake)',
]);

const SM_ABI = parseAbi([
  'function settle(uint256 callId, bytes[] calldata pythUpdateData, uint256[] calldata acceptedChallengeIds)',
  'function raiseDispute(uint256 callId, bytes32 evidenceHash)',
  'function resolveDispute(uint256 callId, uint8 finalOutcome)',
  'event SettlementDelayed(uint256 indexed callId, string reason, uint256 retryAt)',
]);

const USDC_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
]);

// ── Evidence log helpers ──────────────────────────────────────────────────────

function ensureEvidenceDir(): void {
  const dir = resolve(__dirname, '../../../../evidence/phase-6-soak');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function appendEvidenceLog(entry: EvidenceEntry): void {
  try {
    ensureEvidenceDir();
    appendFileSync(EVIDENCE_LOG_PATH, JSON.stringify(entry) + '\n', 'utf8');
  } catch (err) {
    console.error('[evidence] Failed to write log entry:', err);
  }
}

// ── Viem client helpers ───────────────────────────────────────────────────────

function buildPublicClient() {
  const rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL;
  if (!rpcUrl) throw new Error('ARBITRUM_SEPOLIA_RPC_URL is not set');
  return createPublicClient({ chain: arbitrumSepolia, transport: http(rpcUrl) });
}

function buildWalletClient(privateKey: `0x${string}`) {
  const rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL;
  if (!rpcUrl) throw new Error('ARBITRUM_SEPOLIA_RPC_URL is not set');
  const account = privateKeyToAccount(privateKey);
  return {
    client: createWalletClient({ account, chain: arbitrumSepolia, transport: http(rpcUrl) }),
    account,
  };
}

// ── USDC approval helper ─────────────────────────────────────────────────────

async function ensureUsdcApproval(
  walletIndex: number,
  privateKey: `0x${string}`,
  spender: `0x${string}`,
): Promise<void> {
  const { client, account } = buildWalletClient(privateKey);
  await client.writeContract({
    address: USDC_ARB_SEPOLIA,
    abi: USDC_ABI,
    functionName: 'approve',
    args: [spender, BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')],
    account,
    chain: arbitrumSepolia,
  });
  console.log(`[approve] wallet[${walletIndex}] approved ${spender}`);
}

// ── Funded-wallet self-heal ─────────────────────────────────────────────────────

/** Read a wallet's USDC balance (returns 0n on RPC error). */
async function usdcBalanceOf(
  publicClient: ReturnType<typeof buildPublicClient>,
  address: `0x${string}`,
): Promise<bigint> {
  try {
    return (await publicClient.readContract({
      address: USDC_ARB_SEPOLIA,
      abi: USDC_ABI,
      functionName: 'balanceOf',
      args: [address],
    })) as bigint;
  } catch (err) {
    console.warn(`[balance] balanceOf(${address}) failed: ${String(err)}`);
    return 0n;
  }
}

/**
 * Self-heal: given a preferred wallet index, ensure it holds >= `required` USDC.
 * If underfunded (or excluded), scan all 10 soak wallets and substitute the highest-balance
 * one that meets the requirement, skipping `excludeIndex` (e.g. the caller in Phase E, which
 * acceptChallenge restricts and so must never become the challenger). Returns the chosen
 * { index, key } or null if none qualify. Logs both the balance check and any substitution.
 */
async function pickFundedWallet(
  publicClient: ReturnType<typeof buildPublicClient>,
  walletKeys: (`0x${string}` | null)[],
  preferredIndex: number,
  required: bigint,
  phaseLabel: string,
  excludeIndex?: number,
): Promise<{ index: number; key: `0x${string}` } | null> {
  const preferredKey = preferredIndex === excludeIndex ? null : walletKeys[preferredIndex];
  if (preferredKey) {
    const { account } = buildWalletClient(preferredKey);
    const bal = await usdcBalanceOf(publicClient, account.address);
    if (bal >= required) {
      return { index: preferredIndex, key: preferredKey };
    }
    console.warn(
      `[${phaseLabel}] wallet[${preferredIndex}] underfunded ($${Number(bal) / 1e6}), scanning for a funded substitute (need $${Number(required) / 1e6})...`,
    );
  } else if (preferredIndex === excludeIndex) {
    console.warn(`[${phaseLabel}] preferred wallet[${preferredIndex}] is excluded (e.g. the caller) — scanning for a funded substitute...`);
  } else {
    console.warn(`[${phaseLabel}] wallet[${preferredIndex}] key not set — scanning for a funded substitute...`);
  }

  // Scan all wallets (except excludeIndex) for the highest balance that meets the requirement.
  let best: { index: number; key: `0x${string}`; bal: bigint } | null = null;
  for (let i = 0; i < SOAK_WALLET_COUNT; i++) {
    if (i === excludeIndex) continue;
    const key = walletKeys[i];
    if (!key) continue;
    const { account } = buildWalletClient(key);
    const bal = await usdcBalanceOf(publicClient, account.address);
    if (bal >= required && (best === null || bal > best.bal)) {
      best = { index: i, key, bal };
    }
  }

  if (best === null) {
    return null;
  }

  if (best.index !== preferredIndex) {
    const prefBal = preferredKey
      ? await usdcBalanceOf(publicClient, buildWalletClient(preferredKey).account.address)
      : 0n;
    console.log(
      `[${phaseLabel}] wallet[${preferredIndex}] underfunded ($${Number(prefBal) / 1e6}), substituting funded wallet[${best.index}] ($${Number(best.bal) / 1e6})`,
    );
  }
  return { index: best.index, key: best.key };
}

// ── TX receipt helper ─────────────────────────────────────────────────────────

async function waitForReceipt(
  publicClient: ReturnType<typeof buildPublicClient>,
  txHash: `0x${string}`,
): Promise<{ blockNumber: bigint }> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  return { blockNumber: receipt.blockNumber };
}

// ── Settlement stuck detector ─────────────────────────────────────────────────

async function waitForSettlement(
  publicClient: ReturnType<typeof buildPublicClient>,
  walletIndex: number,
  callId: number,
  txHash: `0x${string}`,
  timeoutMs = 30 * 60 * 1000, // 30 minutes
): Promise<boolean> {
  const startMs = Date.now();
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: txHash,
    timeout: timeoutMs,
  }).catch(() => null);

  if (!receipt) {
    const elapsed = Date.now() - startMs;
    if (elapsed >= 25 * 60 * 1000) {
      await sendAlertSafe('settle_stuck_25m', { callId, elapsed });
    }
    return false;
  }

  // Check for SettlementDelayed in logs
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: SM_ABI, ...log });
      if (decoded.eventName === 'SettlementDelayed') {
        const delayedCallId = Number((decoded.args as { callId: bigint }).callId);
        appendEvidenceLog({
          action: 'settlementDelayed',
          txHash,
          callId: delayedCallId,
          walletIndex,
          timestamp: Date.now(),
          block: Number(receipt.blockNumber),
        });
      }
    } catch {
      // Not a SettlementDelayed event — continue
    }
  }

  return true;
}

// ── Phase A: Create ≥10 calls covering all market types ──────────────────────

async function phaseA_createCalls(
  publicClient: ReturnType<typeof buildPublicClient>,
  walletKeys: (`0x${string}` | null)[],
): Promise<number[]> {
  console.log('[Phase A] Creating ≥10 calls covering all types...');

  // Approve CallRegistry for all funded wallets
  for (let i = 0; i < SOAK_WALLET_COUNT; i++) {
    const key = walletKeys[i];
    if (!key) continue;
    try {
      await ensureUsdcApproval(i, key, CALL_REGISTRY_ADDRESS);
    } catch (err) {
      console.warn(`[Phase A] wallet[${i}] approval failed (may need faucet): ${String(err)}`);
    }
  }

  // 7 distinct (marketType, eventSubtype) pairs covering all types + 3 repeats = 10 calls
  // MarketType: 0=PriceTarget, 1=SpreadVs, 2=EventBinary
  // EventSubtype: 0=None, 1=TVL, 2=CEX, 3=GovernanceSnapshot, 4=GovernanceTally, 5=ProtocolMilestone
  const callSpecs = [
    { marketType: 0, eventSubtype: 0, name: 'PriceTarget/ETH' },       // SAFETY-21 type 1
    { marketType: 1, eventSubtype: 0, name: 'SpreadVs/ETH-BTC' },       // SAFETY-21 type 2
    { marketType: 2, eventSubtype: 1, name: 'Event/TVL' },              // SAFETY-21 type 3
    { marketType: 2, eventSubtype: 2, name: 'Event/CEX' },              // SAFETY-21 type 4
    { marketType: 2, eventSubtype: 3, name: 'Event/GovernanceSnapshot' }, // SAFETY-21 type 5
    { marketType: 2, eventSubtype: 4, name: 'Event/GovernanceTally' },  // SAFETY-21 type 6
    { marketType: 2, eventSubtype: 5, name: 'Event/ProtocolMilestone' }, // SAFETY-21 type 7
    // Repeat 3 PriceTarget calls to reach ≥10 total
    { marketType: 0, eventSubtype: 0, name: 'PriceTarget/ETH-repeat-1' },
    { marketType: 0, eventSubtype: 0, name: 'PriceTarget/ETH-repeat-2' },
    { marketType: 1, eventSubtype: 0, name: 'SpreadVs/ETH-BTC-repeat-1' },
  ] as const;

  const callIds: number[] = [];
  // Expiry = now + 2h by default (a live soak waits for expiry before settling).
  // Override with SOAK_CALL_EXPIRY_SECONDS for a short-expiry run that can be settled
  // in-session — settle() requires the call to be PAST expiry. Keep it comfortably larger
  // than the seeder's own runtime so follow/fade (which require an un-expired call) all land.
  const expirySeconds = Number(process.env.SOAK_CALL_EXPIRY_SECONDS ?? 2 * 60 * 60);
  const expiry = BigInt(Math.floor(Date.now() / 1000) + expirySeconds);

  for (let i = 0; i < callSpecs.length; i++) {
    const spec = callSpecs[i];
    const walletIndex = i % SOAK_WALLET_COUNT;
    const key = walletKeys[walletIndex];
    if (!key) {
      console.warn(`[Phase A] wallet[${walletIndex}] key not set — skipping ${spec.name}`);
      continue;
    }

    const { client, account } = buildWalletClient(key);
    try {
      const txHash = await client.writeContract({
        address: CALL_REGISTRY_ADDRESS,
        abi: CALL_REGISTRY_ABI,
        functionName: 'createCall',
        args: [
          spec.marketType,   // marketType
          spec.eventSubtype, // eventSubtype
          0,                 // category (0 = Majors)
          BigInt('0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace'), // assetA = ETH/USD Pyth feed ID (allowlisted on CallRegistry)
          BigInt(0),         // assetB
          BigInt(3000_000000 + i * 1_000000 + (Date.now() % 1_000_000_000)), // run-unique targetValue (distinct dup-hash across re-runs)
          expiry,
          BigInt(5_000000),  // stakeAmount: $5 USDC (min stake; sized so 20 USDC/wallet covers a full seed)
          50,                // conviction 50%
          '0x0000000000000000000000000000000000000000000000000000000000000001', // non-zero criteriaHash (required for event subtypes 4-7)
          true,              // isPriceAbove
          BigInt(0),         // minSharesOut
        ],
        account,
        chain: arbitrumSepolia,
      });
      const { blockNumber } = await waitForReceipt(publicClient, txHash);

      // Read callId from CallCreated event — use block logs
      const logs = await publicClient.getLogs({
        address: CALL_REGISTRY_ADDRESS,
        event: CALL_REGISTRY_ABI[1],
        fromBlock: blockNumber,
        toBlock: blockNumber,
      });
      const callId = logs.length > 0 ? Number(logs[logs.length - 1].args.id) : i + 1;
      callIds.push(callId);

      appendEvidenceLog({
        action: 'callCreated',
        txHash,
        callId,
        walletIndex,
        timestamp: Date.now(),
        block: Number(blockNumber),
      });
      console.log(`[Phase A] Created call #${callId} (${spec.name}) — tx ${txHash}`);
    } catch (err) {
      console.error(`[Phase A] Failed to create ${spec.name} with wallet[${walletIndex}]: ${String(err)}`);
    }
  }

  console.log(`[Phase A] Done. Created ${callIds.length} calls: [${callIds.join(', ')}]`);
  return callIds;
}

// ── Phase B: Create ≥30 follow/fade positions ────────────────────────────────

async function phaseB_followFade(
  publicClient: ReturnType<typeof buildPublicClient>,
  walletKeys: (`0x${string}` | null)[],
  callIds: number[],
): Promise<void> {
  console.log('[Phase B] Creating ≥30 follow/fade positions...');

  if (callIds.length === 0) {
    console.warn('[Phase B] No callIds available — skipping');
    return;
  }

  // Approve FFM for all wallets
  for (let i = 0; i < SOAK_WALLET_COUNT; i++) {
    const key = walletKeys[i];
    if (!key) continue;
    try {
      await ensureUsdcApproval(i, key, FFM_ADDRESS);
    } catch (err) {
      console.warn(`[Phase B] wallet[${i}] FFM approval failed: ${String(err)}`);
    }
  }

  // 30 actions: first 15 = follow, last 15 = fade
  // Distribute across wallets (walletIndex 0..9) and callIds
  for (let i = 0; i < 30; i++) {
    const walletIndex = i % SOAK_WALLET_COUNT;
    const callId = callIds[i % callIds.length];
    const isFollow = i < 15;
    const action = isFollow ? 'followed' : 'faded';
    const functionName = isFollow ? 'follow' : 'fade';

    const key = walletKeys[walletIndex];
    if (!key) {
      console.warn(`[Phase B] wallet[${walletIndex}] key not set — skipping ${action} #${i}`);
      continue;
    }

    const { client, account } = buildWalletClient(key);
    try {
      const txHash = await client.writeContract({
        address: FFM_ADDRESS,
        abi: FFM_ABI,
        functionName,
        args: [BigInt(callId), BigInt(1_000000), BigInt(0)], // $1 USDC (min) — $10 creation fee leaves only ~$5/wallet for follows
        account,
        chain: arbitrumSepolia,
      });
      const { blockNumber } = await waitForReceipt(publicClient, txHash);

      appendEvidenceLog({
        action: action as 'followed' | 'faded',
        txHash,
        callId,
        walletIndex,
        timestamp: Date.now(),
        block: Number(blockNumber),
      });
      console.log(`[Phase B] ${action} call #${callId} wallet[${walletIndex}] — tx ${txHash}`);
    } catch (err) {
      console.error(`[Phase B] ${action} failed wallet[${walletIndex}] callId=${callId}: ${String(err)}`);
    }
  }

  console.log('[Phase B] Done.');
}

// ── Phase C: Settle ≥3 calls per type ────────────────────────────────────────

async function phaseC_settle(
  publicClient: ReturnType<typeof buildPublicClient>,
  walletKeys: (`0x${string}` | null)[],
  callIds: number[],
): Promise<void> {
  console.log('[Phase C] Settling calls (waiting for expiry)...');

  if (callIds.length === 0) {
    console.warn('[Phase C] No callIds — skipping');
    return;
  }

  // The calls were created with expiry = now + 2h; in a live run the operator
  // waits for expiry. This script logs the settlement attempt; the Phase 6
  // operator runbook covers the wait. For faster test coverage, if calls have
  // already expired (e.g. very-short-deadline test calls), settle proceeds.
  const walletIndex = 0;
  const key = walletKeys[walletIndex];
  if (!key) {
    console.warn('[Phase C] wallet[0] key not set — skipping settlements');
    return;
  }

  const { client, account } = buildWalletClient(key);

  for (const callId of callIds.slice(0, Math.min(callIds.length, 10))) {
    try {
      const txHash = await client.writeContract({
        address: SM_ADDRESS,
        abi: SM_ABI,
        functionName: 'settle',
        args: [BigInt(callId), [], []],
        account,
        chain: arbitrumSepolia,
      });

      const settled = await waitForSettlement(publicClient, walletIndex, callId, txHash);

      if (settled) {
        const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
        appendEvidenceLog({
          action: 'settled',
          txHash,
          callId,
          walletIndex,
          timestamp: Date.now(),
          block: Number(receipt.blockNumber),
        });
        console.log(`[Phase C] Settled call #${callId} — tx ${txHash}`);
      } else {
        console.warn(`[Phase C] Settlement timed out or stuck for call #${callId}`);
      }
    } catch (err) {
      console.error(`[Phase C] settle() failed callId=${callId}: ${String(err)}`);
    }
  }

  console.log('[Phase C] Done.');
}

// ── Phase D: Caller-exit ──────────────────────────────────────────────────────

async function phaseD_callerExit(
  publicClient: ReturnType<typeof buildPublicClient>,
  walletKeys: (`0x${string}` | null)[],
  callIds: number[],
): Promise<void> {
  console.log('[Phase D] Caller-exit...');

  if (callIds.length === 0) {
    console.warn('[Phase D] No callIds — skipping');
    return;
  }

  // Use the last callId (least likely to already be settled in Phase C)
  const callId = callIds[callIds.length - 1];
  const walletIndex = (callId - 1) % SOAK_WALLET_COUNT; // actual caller: call #N was created by wallet (N-1)%10 (fixes NotCallerOfCall)
  const key = walletKeys[walletIndex];
  if (!key) {
    console.warn(`[Phase D] caller wallet[${walletIndex}] key not set — skipping callerExit`);
    return;
  }

  // Note: callerExit requires 24h to have passed since call creation.
  // In a live 48h soak this is satisfied naturally. The script logs the attempt.
  const { client, account } = buildWalletClient(key);
  try {
    const txHash = await client.writeContract({
      address: FFM_ADDRESS,
      abi: FFM_ABI,
      functionName: 'callerExit',
      args: [BigInt(callId)],
      account,
      chain: arbitrumSepolia,
    });
    const { blockNumber } = await waitForReceipt(publicClient, txHash);

    appendEvidenceLog({
      action: 'callerExited',
      txHash,
      callId,
      walletIndex,
      timestamp: Date.now(),
      block: Number(blockNumber),
    });
    console.log(`[Phase D] callerExit call #${callId} — tx ${txHash}`);
  } catch (err) {
    console.error(`[Phase D] callerExit failed callId=${callId}: ${String(err)}`);
  }

  console.log('[Phase D] Done.');
}

// ── Phase E: Challenge cycle ──────────────────────────────────────────────────
//
// Target call must be Live + unexpired. Resolution order for the target:
//   SOAK_CHALLENGE_CALL_ID (explicit override) → callIds[1] (default).
// Challenger wallet: SOAK_CHALLENGER_INDEX (0-9) → (callerIndex+1)%10 (default).
// Caller wallet:     SOAK_CALLER_INDEX (0-9) → (callId-1)%10 (default; correct only for a fresh
//   full-run contract — set it for a standalone run against a pre-existing call).
// A full A/B run drains every call-creating wallet below the $5 minimum, so the
// challenger is self-healed: if the chosen wallet holds < $5 USDC, the highest-balance
// funded wallet is substituted (logged). The CALLER (acceptChallenge) CANNOT be
// substituted — the contract restricts acceptChallenge to the call's actual caller — so
// its balance is only logged + warned when underfunded.

async function phaseE_challengeCycle(
  publicClient: ReturnType<typeof buildPublicClient>,
  walletKeys: (`0x${string}` | null)[],
  callIds: number[],
): Promise<void> {
  console.log('[Phase E] Challenge cycle (propose → accept → settle duel)...');

  // Target: explicit SOAK_CHALLENGE_CALL_ID override, else callIds[1] (default).
  const challengeCallIdOverride = parseCallIdEnv('SOAK_CHALLENGE_CALL_ID');
  let callId: number;
  if (challengeCallIdOverride !== null) {
    callId = challengeCallIdOverride;
    console.log(`[Phase E] Using SOAK_CHALLENGE_CALL_ID=${callId} (must be Live+unexpired)`);
  } else if (callIds.length >= 2) {
    callId = callIds[1]; // use second call for challenge
  } else {
    console.warn('[Phase E] No usable callId (need ≥2 callIds or SOAK_CHALLENGE_CALL_ID) — skipping');
    return;
  }

  // Caller of call #N. Default derivation (callId-1)%10 holds ONLY for a fresh full-run
  // contract; for standalone Phase E against a pre-existing call, override with
  // SOAK_CALLER_INDEX (acceptChallenge is caller-restricted, so this must be the real caller).
  const callerEnv = parseWalletIndexEnv('SOAK_CALLER_INDEX');
  const callerIndex = callerEnv ?? (callId - 1) % SOAK_WALLET_COUNT;
  const challengerEnv = parseWalletIndexEnv('SOAK_CHALLENGER_INDEX');
  let challengerIndex = challengerEnv ?? (callerIndex + 1) % SOAK_WALLET_COUNT; // a DIFFERENT wallet (fixes SelfChallenge)

  let challengerKey = walletKeys[challengerIndex];
  const callerKey = walletKeys[callerIndex];
  if (!callerKey) {
    console.warn(`[Phase E] caller wallet[${callerIndex}] key not set — skipping challenge cycle`);
    return;
  }

  // Self-heal the CHALLENGER (never the caller — acceptChallenge is caller-restricted):
  // a full A/B run drains it below the $5 minimum. excludeIndex=callerIndex guarantees any
  // substitute is some wallet OTHER than the caller, so we never accidentally self-challenge.
  const picked = await pickFundedWallet(publicClient, walletKeys, challengerIndex, MIN_STAKE_USDC, 'Phase E', callerIndex);
  if (picked === null) {
    console.warn('[Phase E] no funded non-caller soak wallet holds the $5 challenge stake — skipping challenge cycle');
    return;
  }
  challengerIndex = picked.index;
  challengerKey = picked.key;

  // The CALLER cannot be substituted (acceptChallenge is caller-restricted) — only warn.
  const callerBal = await usdcBalanceOf(publicClient, buildWalletClient(callerKey).account.address);
  console.log(`[Phase E] caller wallet[${callerIndex}] balance $${Number(callerBal) / 1e6}`);
  if (callerBal < MIN_STAKE_USDC) {
    console.warn(
      `[Phase E] caller wallet[${callerIndex}] underfunded ($${Number(callerBal) / 1e6} < $5) — acceptChallenge may revert (cannot substitute the caller)`,
    );
  }

  // Approve ChallengeEscrow for both wallets
  for (const [idx, key] of [[challengerIndex, challengerKey], [callerIndex, callerKey]] as const) {
    try {
      await ensureUsdcApproval(idx, key, CE_ADDRESS);
    } catch (err) {
      console.warn(`[Phase E] CE approval failed wallet[${idx}]: ${String(err)}`);
    }
  }

  let challengeId: number | null = null;

  // Propose the challenge from the (self-healed) challenger wallet
  const { client: challengerClient, account: challengerAccount } = buildWalletClient(challengerKey);
  try {
    const txHash = await challengerClient.writeContract({
      address: CE_ADDRESS,
      abi: CE_ABI,
      functionName: 'proposeChallenge',
      args: [BigInt(callId), BigInt(5_000000)], // $5 USDC stake (fits 20 USDC/wallet budget)
      account: challengerAccount,
      chain: arbitrumSepolia,
    });
    const { blockNumber } = await waitForReceipt(publicClient, txHash);

    // Read the REAL challengeId from the ChallengeProposed event. (Previously this assumed
    // challengeId = callId + 100, which is wrong on a fresh ChallengeEscrow — the stale ID
    // made acceptChallenge revert NotAuthorized, breaking the SAFETY-26 duel cycle.)
    const propReceipt = await publicClient.getTransactionReceipt({ hash: txHash });
    for (const log of propReceipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: CE_ABI, data: log.data, topics: log.topics });
        if (decoded.eventName === 'ChallengeProposed') {
          challengeId = Number((decoded.args as { challengeId: bigint }).challengeId);
          break;
        }
      } catch {
        // not a ChallengeEscrow event — skip
      }
    }

    appendEvidenceLog({
      action: 'challengeProposed',
      txHash,
      callId,
      walletIndex: challengerIndex,
      timestamp: Date.now(),
      block: Number(blockNumber),
    });
    console.log(`[Phase E] Challenge proposed on call #${callId} — tx ${txHash}`);
  } catch (err) {
    console.error(`[Phase E] proposeChallenge failed callId=${callId}: ${String(err)}`);
    return;
  }

  if (challengeId === null) {
    console.warn('[Phase E] could not decode challengeId from ChallengeProposed event — skipping accept');
    return;
  }

  // Accept the challenge from the call's actual caller (caller-restricted)
  const { client: callerClient, account: callerAccount } = buildWalletClient(callerKey);
  try {
    const txHash = await callerClient.writeContract({
      address: CE_ADDRESS,
      abi: CE_ABI,
      functionName: 'acceptChallenge',
      args: [BigInt(challengeId)],
      account: callerAccount,
      chain: arbitrumSepolia,
    });
    const { blockNumber } = await waitForReceipt(publicClient, txHash);

    appendEvidenceLog({
      action: 'challengeAccepted',
      txHash,
      callId,
      walletIndex: callerIndex,
      timestamp: Date.now(),
      block: Number(blockNumber),
    });
    console.log(`[Phase E] Challenge #${challengeId} accepted — tx ${txHash}`);
  } catch (err) {
    console.error(`[Phase E] acceptChallenge failed challengeId=${challengeId}: ${String(err)}`);
  }

  console.log('[Phase E] Done (duel settle happens via Phase C settle() in the full soak run).');
}

// ── Phase F: Dispute + owner resolution ──────────────────────────────────────
//
// Target call must be settled. Resolution order for the target:
//   SOAK_DISPUTE_CALL_ID (explicit override) → callIds[0] (default).
// Disputer wallet: SOAK_DISPUTER_INDEX (0-9) → 4 (default; matches the proven SAFETY-27
// run). A full A/B run drains the disputer below the $5 bond minimum, so it is self-healed:
// if the chosen wallet holds < $5 USDC, the highest-balance funded wallet is substituted.
// resolveDispute is Ownable2Step-gated to the owner SOAK_OWNER_ADDRESS (= treasury
// 0xDa8c5726 == SOAK_WALLET_0 after the 2026-06-06 redeploy): it is sent from
// SOAK_OWNER_PRIVATE_KEY. If that env is unset, resolveDispute is skipped gracefully
// (NOT counted as an error).

async function phaseF_disputeResolve(
  publicClient: ReturnType<typeof buildPublicClient>,
  walletKeys: (`0x${string}` | null)[],
  callIds: number[],
): Promise<void> {
  console.log('[Phase F] Dispute + owner resolution...');

  // Target: explicit SOAK_DISPUTE_CALL_ID override, else callIds[0] (default).
  const disputeCallIdOverride = parseCallIdEnv('SOAK_DISPUTE_CALL_ID');
  let callId: number;
  if (disputeCallIdOverride !== null) {
    callId = disputeCallIdOverride;
    console.log(`[Phase F] Using SOAK_DISPUTE_CALL_ID=${callId} (must be settled)`);
  } else if (callIds.length > 0) {
    callId = callIds[0]; // use first call (should be settled by Phase C)
  } else {
    console.warn('[Phase F] No usable callId (need ≥1 callId or SOAK_DISPUTE_CALL_ID) — skipping');
    return;
  }

  // Disputer: SOAK_DISPUTER_INDEX override, else 4 (default — proven SAFETY-27 run).
  const disputerEnv = parseWalletIndexEnv('SOAK_DISPUTER_INDEX');
  let disputerIndex = disputerEnv ?? 4; // wallet[4] = disputer (SAFETY-27)

  // Self-heal the DISPUTER: a full A/B run drains call-creating wallets below the $5 bond.
  const picked = await pickFundedWallet(publicClient, walletKeys, disputerIndex, MIN_STAKE_USDC, 'Phase F');
  if (picked === null) {
    console.warn('[Phase F] no soak wallet holds the $5 dispute bond — skipping dispute');
    return;
  }
  disputerIndex = picked.index;
  const disputerKey = picked.key;

  // Approve SM for disputer (needs $5 USDC bond)
  try {
    await ensureUsdcApproval(disputerIndex, disputerKey, SM_ADDRESS);
  } catch (err) {
    console.warn(`[Phase F] SM approval failed wallet[${disputerIndex}]: ${String(err)}`);
  }

  // raiseDispute from the (self-healed) disputer wallet
  const { client: disputerClient, account: disputerAccount } = buildWalletClient(disputerKey);
  try {
    const txHash = await disputerClient.writeContract({
      address: SM_ADDRESS,
      abi: SM_ABI,
      functionName: 'raiseDispute',
      args: [BigInt(callId), '0x0000000000000000000000000000000000000000000000000000000000000001'],
      account: disputerAccount,
      chain: arbitrumSepolia,
    });
    const { blockNumber } = await waitForReceipt(publicClient, txHash);

    appendEvidenceLog({
      action: 'disputeRaised',
      txHash,
      callId,
      walletIndex: disputerIndex,
      timestamp: Date.now(),
      block: Number(blockNumber),
    });
    console.log(`[Phase F] Dispute raised on call #${callId} — tx ${txHash}`);
  } catch (err) {
    console.error(`[Phase F] raiseDispute failed callId=${callId}: ${String(err)}`);
    console.log('[Phase F] Skipping resolveDispute (raiseDispute failed).');
    return;
  }

  // resolveDispute is Ownable2Step-restricted to the contract owner SOAK_OWNER_ADDRESS
  // (= treasury 0xDa8c5726 == SOAK_WALLET_0 after the 2026-06-06 redeploy). It must be sent
  // from SOAK_OWNER_PRIVATE_KEY. When that env is unset, this step is operator-gated and
  // skipped gracefully (NOT an error), so the seeder still exits 0.
  const ownerKeyRaw = process.env.SOAK_OWNER_PRIVATE_KEY;
  if (!ownerKeyRaw || !ownerKeyRaw.trim()) {
    console.log(
      `[Phase F] resolveDispute is operator-gated: set SOAK_OWNER_PRIVATE_KEY (owner ${SOAK_OWNER_ADDRESS}) to run it — skipping`,
    );
    console.log('[Phase F] Done.');
    return;
  }

  const ownerKey = normalizePrivateKey(ownerKeyRaw.trim());
  const { client: ownerClient, account: ownerAccount } = buildWalletClient(ownerKey);

  // Warn (don't hard-fail) if the supplied key does not derive the canonical owner.
  if (ownerAccount.address.toLowerCase() !== SOAK_OWNER_ADDRESS.toLowerCase()) {
    console.warn(
      `[Phase F] SOAK_OWNER_PRIVATE_KEY derives ${ownerAccount.address} but the contract owner is ${SOAK_OWNER_ADDRESS} — resolveDispute will likely revert OwnableUnauthorizedAccount`,
    );
  }

  try {
    const txHash = await ownerClient.writeContract({
      address: SM_ADDRESS,
      abi: SM_ABI,
      functionName: 'resolveDispute',
      args: [BigInt(callId), 2], // 2 = CallerLost (reversal outcome for demo)
      account: ownerAccount,
      chain: arbitrumSepolia,
    });
    const { blockNumber } = await waitForReceipt(publicClient, txHash);

    appendEvidenceLog({
      action: 'disputeResolved',
      txHash,
      callId,
      timestamp: Date.now(),
      block: Number(blockNumber),
    });
    console.log(`[Phase F] Dispute resolved on call #${callId} (owner ${ownerAccount.address}) — tx ${txHash}`);
  } catch (err) {
    console.error(`[Phase F] resolveDispute failed callId=${callId}: ${String(err)}`);
  }

  console.log('[Phase F] Done.');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('soak-seeder: starting Phase 6 ≥48h Sepolia soak...');
  console.log(`soak-seeder: evidence log -> ${EVIDENCE_LOG_PATH}`);
  console.log(`soak-seeder: contracts CR=${CALL_REGISTRY_ADDRESS} FFM=${FFM_ADDRESS} CE=${CE_ADDRESS} SM=${SM_ADDRESS}`);
  console.log(`soak-seeder: FAUCET_RATE_LIMIT_MS=${FAUCET_RATE_LIMIT_MS}ms`);

  // Validate RPC
  if (!process.env.ARBITRUM_SEPOLIA_RPC_URL) {
    console.error('soak-seeder: ARBITRUM_SEPOLIA_RPC_URL is not set. Exiting.');
    process.exit(1);
  }

  // Load soak wallet keys (SOAK_WALLET_0..SOAK_WALLET_9)
  const walletKeys: (`0x${string}` | null)[] = Array.from({ length: SOAK_WALLET_COUNT }, (_, i) =>
    getSoakWalletKey(i),
  );

  const configuredWallets = walletKeys.filter(Boolean).length;
  console.log(`soak-seeder: ${configuredWallets}/${SOAK_WALLET_COUNT} SOAK_WALLET_N keys configured`);

  if (configuredWallets === 0) {
    console.error(
      'soak-seeder: No SOAK_WALLET_N keys set. Set SOAK_WALLET_0..SOAK_WALLET_9 in env.\n' +
      'These are test-only Sepolia wallets — never use mainnet keys.',
    );
    process.exit(1);
  }

  const publicClient = buildPublicClient();

  // Phase subsetting (SOAK_PHASES) — only enabled phases run.
  const enabledPhases = parseEnabledPhases();
  // A provided-but-all-invalid SOAK_PHASES yields an empty set (parseEnabledPhases returns
  // the full A-F set only for unset/empty input). Fail loudly so an operator typo
  // (e.g. SOAK_PHASES=foo) doesn't look like a passing run that silently did nothing.
  if (enabledPhases.size === 0) {
    console.error(
      `soak-seeder: SOAK_PHASES='${process.env.SOAK_PHASES}' matched no valid phases (A-F). Exiting.`,
    );
    process.exit(1);
  }
  const phaseEnabled = (p: PhaseId): boolean => enabledPhases.has(p);
  console.log(
    `soak-seeder: phases enabled = [${(['A', 'B', 'C', 'D', 'E', 'F'] as const).filter(phaseEnabled).join(', ')}]`,
  );

  // Pre-existing callIds for B-F when Phase A is skipped (or as a fallback for A).
  const presetCallIds = parseSoakCallIds();
  if (presetCallIds.length > 0) {
    console.log(`soak-seeder: SOAK_CALL_IDS = [${presetCallIds.join(', ')}]`);
  }

  let errors = 0;

  // Phase A: Create calls
  let callIds: number[] = [];
  if (phaseEnabled('A')) {
    try {
      callIds = await phaseA_createCalls(publicClient, walletKeys);
    } catch (err) {
      console.error('[Phase A] Fatal error:', err);
      errors++;
    }
    // Prefer A's output; fall back to SOAK_CALL_IDS if A produced nothing.
    if (callIds.length === 0 && presetCallIds.length > 0) {
      console.log('[Phase A] produced no callIds — falling back to SOAK_CALL_IDS');
      callIds = presetCallIds;
    }
  } else {
    // A skipped — B-F operate on the pre-existing callIds from SOAK_CALL_IDS.
    callIds = presetCallIds;
    console.log(`soak-seeder: Phase A skipped — using SOAK_CALL_IDS callIds=[${callIds.join(', ')}]`);
  }

  // Phase B: Follow/fade
  if (phaseEnabled('B')) {
    try {
      await phaseB_followFade(publicClient, walletKeys, callIds);
    } catch (err) {
      console.error('[Phase B] Fatal error:', err);
      errors++;
    }
  }

  // Phase C: Settle
  if (phaseEnabled('C')) {
    try {
      await phaseC_settle(publicClient, walletKeys, callIds);
    } catch (err) {
      console.error('[Phase C] Fatal error:', err);
      errors++;
    }
  }

  // Phase D: Caller-exit
  if (phaseEnabled('D')) {
    try {
      await phaseD_callerExit(publicClient, walletKeys, callIds);
    } catch (err) {
      console.error('[Phase D] Fatal error:', err);
      errors++;
    }
  }

  // Phase E: Challenge cycle
  if (phaseEnabled('E')) {
    try {
      await phaseE_challengeCycle(publicClient, walletKeys, callIds);
    } catch (err) {
      console.error('[Phase E] Fatal error:', err);
      errors++;
    }
  }

  // Phase F: Dispute + owner resolution
  if (phaseEnabled('F')) {
    try {
      await phaseF_disputeResolve(publicClient, walletKeys, callIds);
    } catch (err) {
      console.error('[Phase F] Fatal error:', err);
      errors++;
    }
  }

  console.log(`soak-seeder: complete. phases_errored=${errors}, evidence_log=${EVIDENCE_LOG_PATH}`);

  if (errors > 0) {
    console.error('soak-seeder: completed with phase errors — review above.');
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('soak-seeder: fatal error:', err);
  process.exit(1);
});
