/**
 * phase-0-smoke.ts — 6-step Phase 0 end-to-end smoke test (00-05, OPS-19, OPS-24, SAFETY-58)
 *
 * Verifies all Phase 0 success criteria against deployed artifacts.
 * Runs as the body of .github/workflows/phase-0-gate.yml on `git tag phase-0-complete`.
 *
 * Steps:
 *   1. Build green      — pnpm install + pnpm turbo run lint test build (all 6 packages)
 *   2. Grep guards pass — 3 guards from .github/workflows/grep-guards.yml pass on current code
 *   3. Relayer /health  — GET relayerUrl/health → 200 + { status: 'ok' } + <2000ms
 *   4. Subgraph live    — POST subgraphUrl GraphQL _meta → { data: { _meta: { block: { number: int } } } }
 *   5. OG Fallback p95  — 100 sequential GETs → p95 < 100ms + Content-Type: image/png + X-Variant: fallback
 *   6. Synthetic alert  — invoke fire-synthetic-alert.ts subprocess + wait for Telegram round-trip
 *
 * Usage:
 *   pnpm tsx scripts/phase-0-smoke.ts \
 *     --network sepolia \
 *     --web-url https://call-it-web-sepolia.vercel.app \
 *     --relayer-url https://call-it-relayer-sepolia.fly.dev \
 *     --subgraph-url https://api.studio.thegraph.com/query/call-it-sepolia/graphql \
 *     --require-synthetic-alert
 *
 * Environment variables (for step 6):
 *   TELEGRAM_BOT_TOKEN        — Telegram bot token
 *   TELEGRAM_CHAT_ID_P0       — P0 channel chat ID
 *   RELAYER_INTERNAL_HMAC     — HMAC secret for /internal/test-alert
 *   RELAYER_URL               — overrides --relayer-url for fire-synthetic-alert subprocess
 *
 * Exit codes:
 *   0 — all steps pass
 *   1 — one or more steps failed (always runs all 6 to give full diagnostic picture)
 */

import { execSync, spawn } from 'child_process';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── CLI flag parsing ────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  network: string;
  webUrl: string;
  relayerUrl: string;
  subgraphUrl: string;
  requireSyntheticAlert: boolean;
} {
  const args = argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };
  const has = (flag: string): boolean => args.includes(flag);

  return {
    network: get('--network') ?? 'sepolia',
    webUrl: get('--web-url') ?? '',
    relayerUrl: get('--relayer-url') ?? '',
    subgraphUrl: get('--subgraph-url') ?? '',
    requireSyntheticAlert: has('--require-synthetic-alert') || !has('--no-synthetic-alert'),
  };
}

// ─── Percentile math ─────────────────────────────────────────────────────────

/**
 * Compute the Pth percentile of a sorted array of numbers.
 * Uses the nearest-rank method (ceiling of rank).
 * Exported for unit testing.
 */
export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sortedValues.length);
  return sortedValues[Math.min(rank, sortedValues.length) - 1]!;
}

// ─── Step results accumulator ─────────────────────────────────────────────────

export type StepStatus = 'pass' | 'fail' | 'skip';

export interface SmokeResults {
  step1: StepStatus;
  step2: StepStatus;
  step3: StepStatus;
  step4: StepStatus;
  step5: StepStatus | { status: StepStatus; p50: number; p95: number; p99: number };
  step6: StepStatus;
  overall: 'pass' | 'fail';
  errors: Record<string, string>;
  timestamp: string;
}

// ─── Step 1: Build green ─────────────────────────────────────────────────────

export async function step1BuildGreen(): Promise<{ status: StepStatus; error?: string }> {
  console.log('\n[Step 1] Build green — pnpm install + pnpm turbo run lint test build');
  try {
    execSync('pnpm install --frozen-lockfile', { stdio: 'pipe' });
    execSync('pnpm turbo run lint test build', { stdio: 'pipe' });
    console.log('  PASS: pnpm build succeeded across all packages');
    return { status: 'pass' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  FAIL: Build or test failed — ${msg.slice(0, 300)}`);
    return { status: 'fail', error: msg };
  }
}

// ─── Step 2: Grep guards ─────────────────────────────────────────────────────

export async function step2GrepGuards(): Promise<{ status: StepStatus; error?: string }> {
  console.log('\n[Step 2] Grep guards — 3 invariants from grep-guards.yml must pass');

  // A missing local rg must FAIL the smoke run, not pass it (quick-260611-156
  // WR-01: the old `|| true` swallowed exit 127 as "no match").
  try {
    execSync('command -v rg', { shell: '/bin/bash', stdio: 'pipe' });
  } catch {
    const msg = 'ripgrep (rg) not found on PATH — grep guards cannot run';
    console.error(`  FAIL: ${msg}`);
    return { status: 'fail', error: msg };
  }

  // Each rg-based cmd mirrors the resurrected grep-guards.yml command
  // (quick-260611-156): pure positive globs (NOT --type + --glob, which rg
  // ANDs into selecting ZERO files), the full 4-fixture allowlist, the
  // continuation-hex-char pattern, and explicit exit-code discrimination —
  // rg's contract is 0=match, 1=no match, >=2=error. Exit 1 (clean) maps to
  // exit 0 with no output; exit >=2 propagates so the catch block FAILS the
  // run instead of treating it as "no match".
  // Self-reference note: the pattern text below contains the bare prefix
  // followed by '[' (not a hex char), so it does not trip the CI guard.
  const checks: Array<{ name: string; cmd: string; shouldMatch: boolean }> = [
    {
      name: 'USDC.e bridged address must NOT appear outside fixture',
      // Matches if USDC.e appears — so a match means FAILURE
      cmd: `rc=0; rg --hidden --no-ignore --glob "**/*.ts" --glob "**/*.tsx" --glob "**/*.js" --glob "**/*.jsx" --glob "**/*.mjs" --glob "**/*.cjs" --glob "**/*.rs" --glob "!packages/shared/src/constants/usdc.ts" --glob "!packages/shared/test/usdc.test.ts" --glob "!packages/contracts/src/constants/USDC.sol" --glob "!packages/contracts/test/USDC.t.sol" --glob "!**/node_modules/**" --glob "!**/out/**" --glob "!**/.next/**" --glob "!**/target/**" --glob "!**/.turbo/**" --glob "!**/dist/**" --ignore-case "0xff970a61[0-9a-f]" . || rc=$?; if [ "$rc" -eq 1 ]; then exit 0; fi; if [ "$rc" -ne 0 ]; then echo "rg failed with exit $rc - guard did not run" >&2; exit "$rc"; fi`,
      shouldMatch: false,
    },
    {
      name: 'All Solidity pragmas must be exactly =0.8.30',
      // Returns non-pinned pragmas — a match means FAILURE
      cmd: `rc=0; PRAGMAS=$(rg --hidden --no-ignore --glob "**/*.sol" --glob "!**/node_modules/**" --glob "!**/out/**" --glob "!**/target/**" --glob "!**/lib/**" "pragma solidity " .) || rc=$?; if [ "$rc" -gt 1 ]; then echo "rg failed with exit $rc - guard did not run" >&2; exit "$rc"; fi; frc=0; printf "%s\\n" "$PRAGMAS" | rg -v "pragma solidity =0\\.8\\.30;" || frc=$?; if [ "$frc" -gt 1 ]; then echo "rg filter failed with exit $frc - guard did not run" >&2; exit "$frc"; fi; exit 0`,
      shouldMatch: false,
    },
    {
      name: 'Mainnet env files must NOT reference arbitrum-sepolia or 421614',
      // Returns files with mainnet in name that also contain sepolia refs — match = FAILURE
      cmd: `find . -not -path "*/node_modules/*" -not -path "*/.next/*" -not -path "*/dist/*" -not -path "*/.turbo/*" -name "*.env*" \\( -name "*mainnet*" -o -name "*.production*" -o -name "*.prod*" \\) -exec grep -l -E "arbitrum-sepolia|421614" {} \\; 2>/dev/null || true`,
      shouldMatch: false,
    },
  ];

  const errors: string[] = [];
  for (const check of checks) {
    try {
      const output = execSync(check.cmd, { shell: '/bin/bash', encoding: 'utf8' }).trim();
      const hasMatch = output.length > 0;
      if (check.shouldMatch !== hasMatch) {
        const msg = check.shouldMatch
          ? `Guard "${check.name}" expected a match but got none`
          : `Guard "${check.name}" found a violation:\n${output.slice(0, 500)}`;
        errors.push(msg);
        console.error(`  FAIL: ${msg}`);
      } else {
        console.log(`  PASS: ${check.name}`);
      }
    } catch (err) {
      // A non-zero exit here means the guard command itself failed to run
      // (rg error, bad glob, missing tool) — that is a FAILURE, not a pass
      // (quick-260611-156 WR-01: the old catch printed PASS).
      const msg = err instanceof Error ? err.message : String(err);
      const fullMsg = `Guard "${check.name}" failed to execute: ${msg.slice(0, 300)}`;
      errors.push(fullMsg);
      console.error(`  FAIL: ${fullMsg}`);
    }
  }

  if (errors.length > 0) {
    return { status: 'fail', error: errors.join('\n') };
  }
  return { status: 'pass' };
}

// ─── Step 3: Relayer /health ─────────────────────────────────────────────────

export async function step3RelayerHealth(
  relayerUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ status: StepStatus; error?: string }> {
  console.log(`\n[Step 3] Relayer /health — GET ${relayerUrl}/health → 200 + { status: 'ok' } + <2000ms`);

  if (!relayerUrl) {
    const err = 'No --relayer-url provided';
    console.error(`  SKIP: ${err}`);
    return { status: 'skip', error: err };
  }

  const start = Date.now();
  try {
    const res = await fetchFn(`${relayerUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const elapsed = Date.now() - start;

    if (res.status !== 200) {
      const err = `HTTP ${res.status} (expected 200)`;
      console.error(`  FAIL: ${err}`);
      return { status: 'fail', error: err };
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      const err = 'Response body is not valid JSON';
      console.error(`  FAIL: ${err}`);
      return { status: 'fail', error: err };
    }

    if (typeof body !== 'object' || body === null || (body as Record<string, unknown>)['status'] !== 'ok') {
      const err = `Response body does not contain { status: 'ok' }: ${JSON.stringify(body)}`;
      console.error(`  FAIL: ${err}`);
      return { status: 'fail', error: err };
    }

    if (elapsed > 2000) {
      const err = `Response time ${elapsed}ms exceeds 2000ms limit`;
      console.error(`  FAIL: ${err}`);
      return { status: 'fail', error: err };
    }

    console.log(`  PASS: Relayer /health → 200 { status: 'ok' } in ${elapsed}ms`);
    return { status: 'pass' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  FAIL: Network error — ${msg}`);
    return { status: 'fail', error: msg };
  }
}

// ─── Step 4: Subgraph deployed ───────────────────────────────────────────────

export async function step4SubgraphDeployed(
  subgraphUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ status: StepStatus; error?: string }> {
  console.log(`\n[Step 4] Subgraph deployed — POST ${subgraphUrl} → _meta.block.number`);

  if (!subgraphUrl) {
    const err = 'No --subgraph-url provided';
    console.error(`  SKIP: ${err}`);
    return { status: 'skip', error: err };
  }

  try {
    const res = await fetchFn(subgraphUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ _meta { block { number } } }' }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const err = `Subgraph returned HTTP ${res.status}`;
      console.error(`  FAIL: ${err}`);
      return { status: 'fail', error: err };
    }

    const data = (await res.json()) as {
      data?: { _meta?: { block?: { number?: unknown } } };
      errors?: unknown[];
    };

    if (data.errors && data.errors.length > 0) {
      const err = `Subgraph query errors: ${JSON.stringify(data.errors).slice(0, 300)}`;
      console.error(`  FAIL: ${err}`);
      return { status: 'fail', error: err };
    }

    const blockNumber = data?.data?._meta?.block?.number;
    if (blockNumber === undefined || blockNumber === null || typeof blockNumber !== 'number') {
      const err = `_meta.block.number missing or null — subgraph not indexed yet: ${JSON.stringify(data).slice(0, 300)}`;
      console.error(`  FAIL: ${err}`);
      return { status: 'fail', error: err };
    }

    console.log(`  PASS: Subgraph is indexed at block ${blockNumber}`);
    return { status: 'pass' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  FAIL: ${msg}`);
    return { status: 'fail', error: msg };
  }
}

// ─── Step 5: OG Fallback p95 < 100ms (warm) ──────────────────────────────────

export async function step5OgFallbackPercentile(
  webUrl: string,
  fetchFn: typeof fetch = fetch,
): Promise<{
  status: StepStatus;
  p50?: number;
  p95?: number;
  p99?: number;
  error?: string;
}> {
  console.log(
    `\n[Step 5] OG Fallback p95 < 100ms — 100 sequential GETs to ${webUrl}/api/og/fallback?handle=smoketest`,
  );

  if (!webUrl) {
    const err = 'No --web-url provided';
    console.error(`  SKIP: ${err}`);
    return { status: 'skip', error: err };
  }

  const url = `${webUrl}/api/og/fallback?handle=smoketest`;

  // 1 warmup request (result discarded)
  try {
    await fetchFn(url, { signal: AbortSignal.timeout(10000) });
    console.log('  Warmup request complete');
  } catch {
    console.warn('  Warmup request failed — continuing to measurement phase');
  }

  const timings: number[] = [];
  const errors: string[] = [];

  for (let i = 0; i < 100; i++) {
    const start = Date.now();
    try {
      const res = await fetchFn(url, { signal: AbortSignal.timeout(10000) });
      const elapsed = Date.now() - start;
      timings.push(elapsed);

      // Validate response
      const contentType = res.headers.get('content-type') ?? '';
      const variant = res.headers.get('x-variant') ?? '';
      const body = await res.arrayBuffer();

      if (res.status !== 200) {
        errors.push(`Request ${i + 1}: HTTP ${res.status}`);
      } else if (!contentType.includes('image/png')) {
        errors.push(`Request ${i + 1}: Content-Type is "${contentType}" (expected image/png)`);
      } else if (variant !== 'fallback') {
        errors.push(`Request ${i + 1}: X-Variant is "${variant}" (expected "fallback")`);
      } else if (body.byteLength < 1000) {
        errors.push(`Request ${i + 1}: Response body ${body.byteLength} bytes (< 1000 — not a real PNG)`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Request ${i + 1}: ${msg}`);
      timings.push(10000); // penalize failed requests
    }
  }

  if (timings.length === 0) {
    return { status: 'fail', error: 'All 100 requests failed' };
  }

  const sorted = [...timings].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const p99 = percentile(sorted, 99);

  console.log(`  Timings: p50=${p50}ms, p95=${p95}ms, p99=${p99}ms`);
  console.log(`  Response errors: ${errors.length}`);

  if (errors.length > 0) {
    errors.slice(0, 5).forEach((e) => console.error(`  ${e}`));
  }

  if (p95 >= 100) {
    const err = `p95 is ${p95}ms — exceeds 100ms limit`;
    console.error(`  FAIL: ${err}`);
    return { status: 'fail', p50, p95, p99, error: err };
  }

  if (errors.length > 10) {
    const err = `${errors.length}/100 requests had validation errors`;
    console.error(`  FAIL: ${err}`);
    return { status: 'fail', p50, p95, p99, error: err };
  }

  console.log(`  PASS: OG Fallback p95=${p95}ms (< 100ms) with ${errors.length}/100 response errors`);
  return { status: 'pass', p50, p95, p99 };
}

// ─── Step 6: Synthetic alert end-to-end ──────────────────────────────────────

export async function step6SyntheticAlert(
  relayerUrl: string,
  requireSyntheticAlert: boolean,
  spawnFn: typeof spawn = spawn,
): Promise<{ status: StepStatus; error?: string }> {
  console.log('\n[Step 6] Synthetic alert — fire-synthetic-alert.ts → Telegram round-trip ≤60s');

  if (!requireSyntheticAlert) {
    console.log('  SKIP: --no-synthetic-alert flag set');
    return { status: 'skip' };
  }

  if (!process.env['TELEGRAM_BOT_TOKEN'] || !process.env['TELEGRAM_CHAT_ID_P0']) {
    const err = 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID_P0 env vars missing';
    console.error(`  FAIL: ${err}`);
    return { status: 'fail', error: err };
  }

  const scriptPath = join(dirname(fileURLToPath(import.meta.url)), 'fire-synthetic-alert.ts');

  return new Promise((resolve) => {
    const chatId = process.env['TELEGRAM_CHAT_ID_P0'] ?? '';
    const proc = spawnFn(
      'pnpm',
      [
        'tsx',
        scriptPath,
        '--event',
        'rep_fallback',
        '--wait-seconds',
        '60',
        '--expect-chat-id',
        chatId,
      ],
      {
        stdio: 'pipe',
        env: {
          ...process.env,
          RELAYER_URL: relayerUrl || process.env['RELAYER_URL'] || '',
        },
        timeout: 90_000, // 90s hard limit (60s wait + 30s overhead)
      },
    );

    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log('  PASS: Synthetic alert round-trip verified via Telegram');
        resolve({ status: 'pass' });
      } else {
        const err = `fire-synthetic-alert.ts exited ${code}: ${(stdout + stderr).slice(0, 500)}`;
        console.error(`  FAIL: ${err}`);
        resolve({ status: 'fail', error: err });
      }
    });

    proc.on('error', (err) => {
      console.error(`  FAIL: Failed to spawn fire-synthetic-alert.ts: ${err.message}`);
      resolve({ status: 'fail', error: err.message });
    });
  });
}

// ─── Main runner ──────────────────────────────────────────────────────────────

export interface SmokeDeps {
  fetchFn?: typeof fetch;
  spawnFn?: typeof spawn;
  /** Injectable step1 override — for testing; defaults to real step1BuildGreen() */
  step1Override?: () => Promise<{ status: StepStatus; error?: string }>;
}

export async function runSmokeTest(
  opts: ReturnType<typeof parseArgs>,
  deps?: SmokeDeps,
): Promise<SmokeResults> {
  const fetchFn = deps?.fetchFn ?? fetch;
  const spawnFn = deps?.spawnFn ?? spawn;

  console.log('='.repeat(60));
  console.log('Phase 0 Smoke Test');
  console.log('='.repeat(60));
  console.log(`Network:     ${opts.network}`);
  console.log(`Web URL:     ${opts.webUrl || '(not provided)'}`);
  console.log(`Relayer URL: ${opts.relayerUrl || '(not provided)'}`);
  console.log(`Subgraph:    ${opts.subgraphUrl || '(not provided)'}`);
  console.log(`Synthetic:   ${opts.requireSyntheticAlert}`);

  // Run all 6 steps, collecting results regardless of failures
  const r1 = await (deps?.step1Override ? deps.step1Override() : step1BuildGreen());
  const r2 = await step2GrepGuards();
  const r3 = await step3RelayerHealth(opts.relayerUrl, fetchFn);
  const r4 = await step4SubgraphDeployed(opts.subgraphUrl, fetchFn);
  const r5 = await step5OgFallbackPercentile(opts.webUrl, fetchFn);
  const r6 = await step6SyntheticAlert(opts.relayerUrl, opts.requireSyntheticAlert, spawnFn);

  const allPass = [r1.status, r2.status, r3.status, r4.status, r5.status, r6.status].every(
    (s) => s === 'pass' || s === 'skip',
  );
  const anyFail = [r1.status, r2.status, r3.status, r4.status, r5.status, r6.status].some(
    (s) => s === 'fail',
  );

  const results: SmokeResults = {
    step1: r1.status,
    step2: r2.status,
    step3: r3.status,
    step4: r4.status,
    step5:
      typeof r5.p50 === 'number'
        ? { status: r5.status, p50: r5.p50, p95: r5.p95 ?? 0, p99: r5.p99 ?? 0 }
        : r5.status,
    step6: r6.status,
    overall: anyFail ? 'fail' : 'pass',
    errors: {
      ...(r1.error ? { step1: r1.error } : {}),
      ...(r2.error ? { step2: r2.error } : {}),
      ...(r3.error ? { step3: r3.error } : {}),
      ...(r4.error ? { step4: r4.error } : {}),
      ...(r5.error ? { step5: r5.error } : {}),
      ...(r6.error ? { step6: r6.error } : {}),
    },
    timestamp: new Date().toISOString(),
  };

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('Results Summary');
  console.log('='.repeat(60));
  console.log(`Step 1 (build):         ${r1.status.toUpperCase()}`);
  console.log(`Step 2 (grep guards):   ${r2.status.toUpperCase()}`);
  console.log(`Step 3 (relayer health): ${r3.status.toUpperCase()}`);
  console.log(`Step 4 (subgraph):      ${r4.status.toUpperCase()}`);
  console.log(
    `Step 5 (OG fallback):   ${r5.status.toUpperCase()}${
      typeof r5.p95 === 'number' ? ` (p50=${r5.p50}ms, p95=${r5.p95}ms, p99=${r5.p99}ms)` : ''
    }`,
  );
  console.log(`Step 6 (synthetic alert): ${r6.status.toUpperCase()}`);
  console.log(`OVERALL: ${results.overall.toUpperCase()}`);

  // Write results JSON
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsPath = join(dirname(fileURLToPath(import.meta.url)), `phase-0-smoke-results-${ts}.json`);
  writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\nResults written to: ${resultsPath}`);

  return results;
}

// ─── CLI entrypoint ───────────────────────────────────────────────────────────

// Only run when invoked directly (not imported as a module for testing)
const isMain = process.argv[1]?.endsWith('phase-0-smoke.ts') || process.argv[1]?.endsWith('phase-0-smoke.js');

if (isMain) {
  const opts = parseArgs(process.argv);
  runSmokeTest(opts)
    .then((results) => {
      process.exit(results.overall === 'pass' ? 0 : 1);
    })
    .catch((err) => {
      console.error('Unhandled smoke test error:', err);
      process.exit(1);
    });
}
