/**
 * copy-abis.cjs — prebuild script for @call-it/subgraph
 *
 * Copies compiled ABI JSON files from packages/contracts/out/ into
 * packages/subgraph/abis/ before graph codegen + graph build run.
 *
 * When contracts/out/ is not present (CI without a prior forge build,
 * or developer hasn't run `forge build` yet), the existing abis/ files
 * are kept as-is and a notice is logged. This allows the subgraph to
 * build against the committed ABI snapshots without requiring Foundry.
 *
 * Usage: node scripts/copy-abis.cjs (called by pnpm run prebuild)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SUBGRAPH_ROOT = path.resolve(__dirname, '..');
const CONTRACTS_OUT = path.resolve(SUBGRAPH_ROOT, '..', 'contracts', 'out');
const ABIS_DIR = path.resolve(SUBGRAPH_ROOT, 'abis');

/** Map from contracts/out sub-path to abis/ target filename */
const ABI_MAP = [
  ['CallRegistry.sol/CallRegistry.json', 'CallRegistry.json'],
  ['ProfileRegistry.sol/ProfileRegistry.json', 'ProfileRegistry.json'],
  ['FollowFadeMarket.sol/FollowFadeMarket.json', 'FollowFadeMarket.json'],
  ['ChallengeEscrow.sol/ChallengeEscrow.json', 'ChallengeEscrow.json'],
  ['SettlementManager.sol/SettlementManager.json', 'SettlementManager.json'],
];

if (!fs.existsSync(ABIS_DIR)) {
  fs.mkdirSync(ABIS_DIR, { recursive: true });
}

if (!fs.existsSync(CONTRACTS_OUT)) {
  console.log(
    '[copy-abis] contracts/out not found — using committed abis/ snapshots.',
    'Run `forge build` in packages/contracts to refresh.',
  );
  process.exit(0);
}

let copied = 0;
let skipped = 0;

for (const [srcRel, dstName] of ABI_MAP) {
  const srcPath = path.join(CONTRACTS_OUT, srcRel);
  const dstPath = path.join(ABIS_DIR, dstName);

  if (!fs.existsSync(srcPath)) {
    console.log(`[copy-abis] SKIP (not built): ${srcRel}`);
    skipped++;
    continue;
  }

  /** Extract only the ABI array from the Foundry artifact JSON */
  try {
    const artifact = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
    const abi = artifact.abi || artifact;
    fs.writeFileSync(dstPath, JSON.stringify(abi, null, 2));
    console.log(`[copy-abis] Copied ${srcRel} -> abis/${dstName}`);
    copied++;
  } catch (err) {
    console.error(`[copy-abis] ERROR reading ${srcRel}: ${err.message}`);
    process.exit(1);
  }
}

console.log(`[copy-abis] Done: ${copied} copied, ${skipped} skipped.`);
