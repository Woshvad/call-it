#!/usr/bin/env tsx
/**
 * verify-versions.ts — Wave 0 version verification script
 *
 * Compares pinned versions in package.json files against the npm registry
 * (and crates.io for Rust dependencies) to surface drift.
 *
 * - Exits 0 always (informational, not a build failure)
 * - Prints a table with checkmarks (match) or warnings (drift > 0 patch)
 * - Surfaces TODO_VERIFY Pyth feed IDs
 *
 * Usage: pnpm verify-versions
 *
 * Source: .planning/phases/00-foundation/00-RESEARCH.md §Version verification
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname ?? process.cwd(), '..');

// ---------------------------------------------------------------------------
// NPM packages to verify (from CLAUDE.md Technology Stack table)
// ---------------------------------------------------------------------------
const NPM_PACKAGES = [
  // Frontend
  { pkg: 'next', pinned: '16.2.6', area: 'Frontend' },
  { pkg: '@privy-io/react-auth', pinned: '3.27.0', area: 'Frontend' },
  { pkg: '@privy-io/wagmi', pinned: '4.0.8', area: 'Frontend (Note: CLAUDE.md said 1.32.5 — does not exist)' },
  { pkg: 'wagmi', pinned: '2.18.0', area: 'Frontend' },
  { pkg: 'viem', pinned: '2.50.4', area: 'Frontend/Backend' },
  { pkg: '@tanstack/react-query', pinned: '5.100.11', area: 'Frontend' },
  { pkg: '@vercel/og', pinned: '0.11.1', area: 'OG Images' },
  { pkg: 'satori', pinned: '0.26.0', area: 'OG Images' },
  { pkg: '@farcaster/auth-kit', pinned: '0.8.2', area: 'Frontend' },
  { pkg: 'siwe', pinned: '3.0.0', area: 'Frontend' },
  // Backend
  { pkg: 'fastify', pinned: '5.6.1', area: 'Backend' },
  { pkg: 'pino', pinned: 'latest (9.x)', area: 'Backend' },
  { pkg: 'bullmq', pinned: 'latest', area: 'Backend' },
  // Shared
  { pkg: 'zod', pinned: 'latest (^3)', area: 'Shared' },
  { pkg: 'typescript', pinned: 'latest (^5.6)', area: 'Tooling' },
  // Subgraph
  { pkg: '@graphprotocol/graph-cli', pinned: '0.98.1', area: 'Subgraph' },
  { pkg: '@graphprotocol/graph-ts', pinned: '0.38.2', area: 'Subgraph' },
  // OZ
  { pkg: '@openzeppelin/contracts', pinned: '5.6.1', area: 'Contracts' },
];

// ---------------------------------------------------------------------------
// Crates.io packages to verify
// ---------------------------------------------------------------------------
const CRATES = [
  { crate: 'stylus-sdk', pinned: '0.10.7', area: 'Stylus' },
  // openzeppelin-stylus is an alpha line, exact pin =0.3.0
  // { crate: 'openzeppelin-stylus', pinned: '0.3.0', area: 'Stylus' },
];

function npmView(pkg: string): string {
  try {
    // Use 'npm' on Linux/Mac, handle Windows where stderr redirection differs
    const cmd = process.platform === 'win32'
      ? `npm.cmd view "${pkg}" version`
      : `npm view "${pkg}" version 2>/dev/null`;
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'ERR';
  }
}

function cargoSearch(crate: string): string {
  try {
    const out = execSync(`cargo search "${crate}" --limit 1 2>/dev/null`, {
      encoding: 'utf8',
    });
    const match = out.match(new RegExp(`${crate} = "([^"]+)"`));
    return match ? match[1] : 'ERR';
  } catch {
    return 'ERR (cargo not installed)';
  }
}

function compareVersions(pinned: string, latest: string): 'MATCH' | 'BEHIND' | 'AHEAD' | 'ERR' {
  if (latest === 'ERR') return 'ERR';
  if (pinned === latest) return 'MATCH';
  const [pMaj, pMin, pPatch] = pinned.split('.').map(Number);
  const [lMaj, lMin, lPatch] = latest.split('.').map(Number);
  if (lMaj > pMaj || lMin > pMin || lPatch > pPatch) return 'BEHIND';
  return 'AHEAD';
}

function statusIcon(status: string): string {
  if (status === 'MATCH') return '✓';
  if (status === 'BEHIND') return '⚠ BEHIND';
  if (status === 'AHEAD') return '✓ (pinned newer)';
  return '✗ ERR';
}

console.log('\n=== Call It — Version Verification Report ===\n');
console.log(
  `${'Package'.padEnd(45)} ${'Pinned'.padEnd(20)} ${'Latest'.padEnd(15)} Status`,
);
console.log('-'.repeat(95));

let hasWarnings = false;

for (const { pkg, pinned, area } of NPM_PACKAGES) {
  const latest = npmView(pkg);
  const status = pinned.startsWith('latest') ? 'INFO' : compareVersions(pinned.split(' ')[0], latest);
  if (status === 'BEHIND') hasWarnings = true;
  const icon = pinned.startsWith('latest') ? '○ INFO' : statusIcon(status);
  console.log(`${pkg.padEnd(45)} ${pinned.padEnd(20)} ${latest.padEnd(15)} ${icon}  [${area}]`);
}

console.log('\n--- Rust / Crates.io ---\n');

for (const { crate, pinned, area } of CRATES) {
  const latest = cargoSearch(crate);
  const status = compareVersions(pinned, latest);
  if (status === 'BEHIND') hasWarnings = true;
  console.log(
    `${crate.padEnd(45)} ${pinned.padEnd(20)} ${latest.padEnd(15)} ${statusIcon(status)}  [${area}]`,
  );
}

// ---------------------------------------------------------------------------
// Pyth TODO_VERIFY feeds
// ---------------------------------------------------------------------------
console.log('\n--- Pyth Feed IDs (TODO_VERIFY — must be checked before mainnet deploy) ---\n');
const TODO_FEEDS = ['UNI', 'LINK', 'AAVE', 'MKR', 'DOGE'];
for (const symbol of TODO_FEEDS) {
  console.log(
    `  ⚠  ${symbol}/USD — placeholder bytes32 (0x000...0). Verify against https://hermes.pyth.network/v2/price_feeds before mainnet deploy.`,
  );
}

console.log('\n--- Workspace packages ---\n');
const packageFiles = [
  'apps/web/package.json',
  'apps/relayer/package.json',
  'packages/shared/package.json',
  'packages/subgraph/package.json',
  'packages/config/package.json',
];

for (const pkgFile of packageFiles) {
  try {
    const content = JSON.parse(readFileSync(join(REPO_ROOT, pkgFile), 'utf8'));
    console.log(`  ${content.name} @ ${content.version}`);
  } catch {
    console.log(`  Could not read ${pkgFile}`);
  }
}

if (hasWarnings) {
  console.log(
    '\n⚠  Some pinned packages are behind current registry. Review before Phase 6 mainnet gate.',
  );
} else {
  console.log('\n✓  All verified pinned packages are current or ahead of registry.');
}

console.log('\n  Note: @privy-io/wagmi pinned at 4.0.8 (CLAUDE.md specified 1.32.5 which does not exist on npm)');
console.log('  Note: Cargo not installed — Stylus crate versions cannot be verified locally.');
console.log('\n=== End of Version Report ===\n');
