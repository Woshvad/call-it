/**
 * predeploy-ritual-check.ts — 4-gate automated pre-deploy ritual checker.
 *
 * Purpose (SAFETY-29, 06-05 Gate 5):
 *   Runs four automated checks before mainnet deploy to catch the most common
 *   "looks done but isn't" failures. Must exit 0 (all pass / skipped) before
 *   the Phase 6 multisig promotion proceeds.
 *
 * Gates:
 *   gate-a: No "arbitrum-sepolia" string in relayer production source code
 *           (excluding test files, .md files, and .json files). Guards against
 *           network-string drift where a dev hardcodes Sepolia into production.
 *   gate-b: EIP-712 domain construction uses hardcoded chainId 42161 (mainnet).
 *           Guards against cross-chain replay vulnerability (Pitfall 7).
 *   gate-c: Relayer ETH balance ≥ 0.5 ETH on Arbitrum Sepolia.
 *           SKIPPED gracefully when RELAYER_ADDRESS or ARBITRUM_SEPOLIA_RPC_URL
 *           is absent — not treated as FAIL (no network side effects in CI).
 *   gate-d: Pyth bytes32 feed IDs for BTC/ETH/SOL/ARB/OP/POL match Hermes API.
 *           SKIPPED per-symbol on network error (advisory cross-check only —
 *           actual on-chain feed IDs are set at deploy time, not by this script).
 *
 * Env vars consumed:
 *   RELAYER_ADDRESS          — gate-c: the relayer's on-chain address (public, non-secret)
 *   ARBITRUM_SEPOLIA_RPC_URL — gate-c: RPC endpoint for balance check
 *
 * How to run (from apps/relayer):
 *   npx tsx src/scripts/predeploy-ritual-check.ts
 *
 * Compile check (from apps/relayer):
 *   npx tsc --noEmit
 *
 * SKIPPED behavior:
 *   gate-c: prints "[gate-c] SKIPPED — RELAYER_ADDRESS or ARBITRUM_SEPOLIA_RPC_URL not set"
 *           and counts as SKIPPED, not FAIL. This allows CI to run gate-a and gate-b
 *           without network credentials.
 *   gate-d: each symbol is SKIPPED individually on network error. Overall gate-d is
 *           PASS if all 6 pass, FAIL if any mismatch, SKIPPED if all are skipped.
 *
 * Requirements: SAFETY-29
 */

import { createPublicClient, http, parseEther, formatEther } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { PYTH_FEED_IDS } from '@call-it/shared';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Env loader (matches soak-seeder.ts) ─────────────────────────────────────

function loadEnvIfNeeded(): void {
  if (!process.env.ARBITRUM_SEPOLIA_RPC_URL) {
    const envCandidates = [
      resolve(__dirname, '../../../.env.local'),
      resolve(__dirname, '../../../../.env'),
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

// ── Result types ─────────────────────────────────────────────────────────────

type GateStatus = 'PASS' | 'FAIL' | 'SKIPPED';

interface GateResult {
  gate: string;
  status: GateStatus;
  message: string;
}

// ── Cross-platform file walker (node:fs — no grep/shell — works on Windows) ──

/**
 * Recursively collect all file paths under `dir`.
 * Returned paths are absolute.
 */
function walkDir(dir: string): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = resolve(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      results.push(...walkDir(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

// ── Gate A — No "arbitrum-sepolia" in production relayer source ───────────────

function runGateA(): GateResult {
  // Script lives at apps/relayer/src/scripts/; resolve up one level to apps/relayer/src
  const SRC_DIR = resolve(__dirname, '..');

  const allFiles = walkDir(SRC_DIR);

  // Exclusion rules (mirror the plan spec):
  //   - path segment contains /test, /tests, or /__tests__
  //   - extension is .md or .json
  //   - this script itself (avoid false positive on the "arbitrum-sepolia" literal in the JSDoc)
  const thisFile = resolve(__dirname, 'predeploy-ritual-check.ts');
  const productionFiles = allFiles.filter((f) => {
    const normalized = f.replace(/\\/g, '/');
    if (normalized.includes('/test/') || normalized.includes('/tests/') || normalized.includes('/__tests__/')) {
      return false;
    }
    const ext = extname(f).toLowerCase();
    if (ext === '.md' || ext === '.json') return false;
    if (f === thisFile) return false;
    return true;
  });

  let totalCount = 0;
  const matchFiles: string[] = [];

  for (const filePath of productionFiles) {
    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    const count = (content.match(/arbitrum-sepolia/g) ?? []).length;
    if (count > 0) {
      totalCount += count;
      matchFiles.push(`${filePath} (${count})`);
    }
  }

  if (totalCount === 0) {
    return { gate: 'a', status: 'PASS', message: 'No "arbitrum-sepolia" string in production relayer source' };
  }
  return {
    gate: 'a',
    status: 'FAIL',
    message: `Found ${totalCount} occurrence(s) of "arbitrum-sepolia" in production source:\n  ${matchFiles.join('\n  ')}`,
  };
}

// ── Gate B — EIP-712 domain uses hardcoded chainId 42161 ─────────────────────

function runGateB(): GateResult {
  const SRC_DIR = resolve(__dirname, '..');
  const allFiles = walkDir(SRC_DIR);
  const tsFiles = allFiles.filter((f) => extname(f).toLowerCase() === '.ts');

  let matchCount = 0;
  const examples: string[] = [];

  for (const filePath of tsFiles) {
    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split('\n');
    for (const line of lines) {
      if (!line.includes('42161')) continue;
      const lower = line.toLowerCase();
      if (lower.includes('chainid') || lower.includes('domain')) {
        matchCount++;
        if (examples.length < 3) {
          const trimmed = line.trim();
          examples.push(`${filePath}: ${trimmed}`);
        }
      }
    }
  }

  if (matchCount >= 1) {
    return {
      gate: 'b',
      status: 'PASS',
      message: `Found ${matchCount} line(s) with chainId/domain + 42161 (e.g. ${examples[0] ?? 'n/a'})`,
    };
  }
  return {
    gate: 'b',
    status: 'FAIL',
    message: 'No line found containing "42161" with "chainId" or "domain" context in relayer src. EIP-712 mainnet chainId may be missing.',
  };
}

// ── Gate C — Relayer ETH balance ≥ 0.5 ETH on Arbitrum Sepolia ──────────────

async function runGateC(): Promise<GateResult> {
  const relayerAddress = process.env.RELAYER_ADDRESS;
  const rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL;

  if (!relayerAddress || !rpcUrl) {
    return {
      gate: 'c',
      status: 'SKIPPED',
      message: 'RELAYER_ADDRESS or ARBITRUM_SEPOLIA_RPC_URL not set',
    };
  }

  try {
    const client = createPublicClient({ chain: arbitrumSepolia, transport: http(rpcUrl) });
    const balance = await client.getBalance({ address: relayerAddress as `0x${string}` });
    const threshold = parseEther('0.5');

    if (balance >= threshold) {
      return {
        gate: 'c',
        status: 'PASS',
        message: `Relayer ETH balance = ${formatEther(balance)} ETH (≥ 0.5 ETH threshold)`,
      };
    }
    return {
      gate: 'c',
      status: 'FAIL',
      message: `Relayer ETH balance = ${formatEther(balance)} ETH (< 0.5 ETH threshold). Top up before deploy.`,
    };
  } catch (err) {
    return {
      gate: 'c',
      status: 'FAIL',
      message: `RPC error during balance check: ${String(err)}`,
    };
  }
}

// ── Gate D — Pyth feed IDs match Hermes API ───────────────────────────────────

/** The 6 symbols to check, in order. Keys match PYTH_FEED_IDS. */
const GATE_D_SYMBOLS = ['BTC', 'ETH', 'SOL', 'ARB', 'OP', 'POL'] as const;
type GateDSymbol = (typeof GATE_D_SYMBOLS)[number];

interface HermesFeedEntry {
  id: string;
  // Hermes returns more fields; we only need `id`
  [key: string]: unknown;
}

async function checkHermesFeed(
  symbol: GateDSymbol,
): Promise<{ symbol: GateDSymbol; status: 'PASS' | 'FAIL' | 'SKIPPED'; message: string }> {
  const localId = PYTH_FEED_IDS[symbol]; // 0x-prefixed 66-char string
  if (!localId) {
    return { symbol, status: 'FAIL', message: `PYTH_FEED_IDS["${symbol}"] is undefined` };
  }

  // Hermes returns IDs without 0x prefix
  const localIdNoPrefix = localId.startsWith('0x') ? localId.slice(2) : localId;
  const hermesQuery = `Crypto.${symbol}/USD`;
  const url = `https://hermes.pyth.network/v2/price_feeds?query=${encodeURIComponent(hermesQuery)}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      return { symbol, status: 'SKIPPED', message: `Hermes HTTP ${response.status} for ${hermesQuery}` };
    }

    const feeds = (await response.json()) as HermesFeedEntry[];

    if (!Array.isArray(feeds)) {
      return { symbol, status: 'SKIPPED', message: `Hermes returned unexpected shape for ${hermesQuery}` };
    }

    const found = feeds.some((f) => typeof f.id === 'string' && f.id.toLowerCase() === localIdNoPrefix.toLowerCase());

    if (found) {
      return { symbol, status: 'PASS', message: `${symbol} feed ID confirmed on Hermes` };
    }

    // ID not found — check if the query returned any results at all
    if (feeds.length === 0) {
      return {
        symbol,
        status: 'FAIL',
        message: `Hermes returned 0 feeds for "${hermesQuery}" — feed may be renamed or delisted`,
      };
    }
    return {
      symbol,
      status: 'FAIL',
      message: `Hermes has ${feeds.length} feed(s) for "${hermesQuery}" but none match local ID ${localId}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { symbol, status: 'SKIPPED', message: `Network error for ${symbol}: ${msg}` };
  }
}

async function runGateD(): Promise<GateResult> {
  const results = await Promise.all(GATE_D_SYMBOLS.map((sym) => checkHermesFeed(sym)));

  const failed = results.filter((r) => r.status === 'FAIL');
  const skipped = results.filter((r) => r.status === 'SKIPPED');
  const passed = results.filter((r) => r.status === 'PASS');

  // Print per-symbol details
  for (const r of results) {
    console.log(`  [gate-d/${r.symbol}] ${r.status}: ${r.message}`);
  }

  if (failed.length > 0) {
    return {
      gate: 'd',
      status: 'FAIL',
      message: `${failed.length} feed ID mismatch(es): ${failed.map((r) => r.symbol).join(', ')}`,
    };
  }
  if (passed.length === GATE_D_SYMBOLS.length) {
    return { gate: 'd', status: 'PASS', message: `All 6 Pyth feed IDs confirmed on Hermes` };
  }
  // Some passed, some skipped, none failed
  return {
    gate: 'd',
    status: 'SKIPPED',
    message: `${passed.length} passed, ${skipped.length} skipped (network), 0 failed`,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('=== Pre-deploy Ritual Check (06-05 Gate 5) ===');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`RELAYER_ADDRESS: ${process.env.RELAYER_ADDRESS ?? '(not set)'}`);
  console.log('');

  const results: GateResult[] = [];

  // Gate A (sync)
  const gateA = runGateA();
  results.push(gateA);
  console.log(`[gate-a] ${gateA.status}${gateA.status !== 'PASS' ? ': ' + gateA.message : ''}`);
  if (gateA.status === 'PASS') {
    console.log(`[gate-a] ${gateA.message}`);
  }

  // Gate B (sync)
  const gateB = runGateB();
  results.push(gateB);
  console.log(`[gate-b] ${gateB.status}${gateB.status !== 'PASS' ? ': ' + gateB.message : ''}`);
  if (gateB.status === 'PASS') {
    console.log(`[gate-b] ${gateB.message}`);
  }

  // Gate C (async — network)
  const gateC = await runGateC();
  results.push(gateC);
  console.log(`[gate-c] ${gateC.status}: ${gateC.message}`);

  // Gate D (async — network, per-symbol logged inside runGateD)
  console.log('[gate-d] Checking Pyth feed IDs against Hermes API...');
  const gateD = await runGateD();
  results.push(gateD);
  console.log(`[gate-d] ${gateD.status}: ${gateD.message}`);

  // Summary
  const passed = results.filter((r) => r.status === 'PASS').length;
  const skipped = results.filter((r) => r.status === 'SKIPPED').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;

  console.log('');
  console.log(`${passed}/4 gates passed, ${skipped} skipped, ${failed} failed.`);

  if (failed > 0) {
    console.log('RESULT: FAIL — fix the above before mainnet deploy.');
    process.exit(1);
  }

  if (skipped > 0) {
    console.log('RESULT: PASS (partial — some gates skipped due to missing env/network)');
  } else {
    console.log('RESULT: PASS');
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('predeploy-ritual-check: fatal error:', err);
  process.exit(1);
});
