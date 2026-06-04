/**
 * gen-soak-wallets.ts — Throwaway Sepolia test wallet generator for Phase 6 soak.
 *
 * SECURITY WARNING:
 *   This script generates throwaway Sepolia test wallets.
 *   Private keys are printed to STDOUT ONLY — NEVER commit them, NEVER reuse on mainnet.
 *   Keys are for the Phase 6 ≥48h Sepolia soak exclusively.
 *   This script writes NO files. No writeFileSync, no appendFileSync, no createWriteStream.
 *
 * Purpose (SAFETY-21–28):
 *   Generates 10 fresh wallet key pairs for use as SOAK_WALLET_0..SOAK_WALLET_9.
 *   Prints:
 *     1. A prominent security warning banner
 *     2. A funding checklist (addresses to fund via faucet.circle.com + Sepolia ETH faucet)
 *     3. An env block (SOAK_WALLET_N=0x<privateKey> lines) to paste into .env.local or
 *        Railway/Fly.io secrets — then DELETE the terminal output
 *
 * How to run (from apps/relayer):
 *   npx tsx src/scripts/gen-soak-wallets.ts
 *
 * Compile check (from apps/relayer):
 *   npx tsc --noEmit
 *
 * Prerequisites:
 *   None — this script needs no env vars and no network access.
 *
 * Requirements: SAFETY-21, SAFETY-22, SAFETY-23, SAFETY-24, SAFETY-25, SAFETY-26,
 *               SAFETY-27, SAFETY-28
 */

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

// ── Wallet generation ─────────────────────────────────────────────────────────

interface SoakWallet {
  index: number;
  address: `0x${string}`;
  privateKey: `0x${string}`;
}

function generateSoakWallets(count: number): SoakWallet[] {
  const wallets: SoakWallet[] = [];
  for (let i = 0; i < count; i++) {
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    wallets.push({ index: i, address: account.address, privateKey });
  }
  return wallets;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const WALLET_COUNT = 10;
  const wallets = generateSoakWallets(WALLET_COUNT);

  // 1. Security warning banner
  console.log('=== SOAK WALLET GENERATOR — THROWAWAY SEPOLIA TEST KEYS ===');
  console.log('These keys are for the Phase 6 ≥48h Sepolia soak ONLY.');
  console.log('NEVER reuse on mainnet. NEVER commit to git. Fund via faucet.circle.com only.');
  console.log('Keys are printed to STDOUT only — no file is written.');
  console.log('');

  // 2. Funding checklist
  console.log('--- FUNDING CHECKLIST ---');
  console.log('Fund each address with ≥20 USDC via https://faucet.circle.com (20 USDC per address per 2h).');
  console.log('Fund each address with Sepolia ETH for gas (use a Sepolia ETH faucet).');
  for (const w of wallets) {
    console.log(`  [${w.index}] ${w.address}`);
  }
  console.log('');

  // 3. Env block
  console.log('--- ENV BLOCK (paste into your .env.local or Railway secrets, then DELETE) ---');
  console.log('# IMPORTANT: soak-seeder.ts uses SOAK_WALLET_0 as the call CALLER *and* as the');
  console.log('# SettlementManager OWNER that calls resolveDispute (owner-only, Phase F / SAFETY-27).');
  console.log('# Replace SOAK_WALLET_0 below with your DEPLOYER/OWNER private key, otherwise the');
  console.log('# dispute-resolution step reverts and SAFETY-27 evidence will be missing from the log.');
  for (const w of wallets) {
    const note = w.index === 0 ? '   # <-- REPLACE with deployer/owner key (see note above)' : '';
    console.log(`SOAK_WALLET_${w.index}=${w.privateKey}${note}`);
  }
  console.log('');

  // 4. End marker
  console.log('=== END — Do NOT save this output to any file ===');
}

main().catch((err) => {
  console.error('gen-soak-wallets: fatal error:', err);
  process.exit(1);
});
