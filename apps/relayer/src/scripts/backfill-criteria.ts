/**
 * backfill-criteria.ts — One-shot script to populate call_oracle_criteria for
 * seeded Sepolia test calls.
 *
 * Purpose: Seeded Sepolia test calls were created before call_oracle_criteria
 * existed (migration 0004 was not yet applied). This script backfills the
 * criteria rows so the adapters can resolve them at settlement time.
 *
 * Required for SC-4 end-to-end settlement demonstration in Plan 05.
 *
 * Usage:
 *   # From the monorepo root:
 *   ts-node apps/relayer/src/scripts/backfill-criteria.ts
 *
 *   # Or from apps/relayer:
 *   npx tsx src/scripts/backfill-criteria.ts
 *
 * Prerequisites:
 *   - POSTGRES_URL env var must be set (or use fly proxy tunnel):
 *       fly proxy 5433:5432 --app call-it-pg-sepolia
 *       export POSTGRES_URL="postgresql://[user]:[pass]@127.0.0.1:5433/[db]"
 *   - Migration 0004_*.sql must already be applied (call_oracle_criteria table exists)
 *
 * Safety: insertCriteria uses ON CONFLICT DO NOTHING — re-running is safe.
 *
 * Requirements: SETTLE-18, SETTLE-19, SETTLE-21 (SC-4 end-to-end criteria rows)
 * Gap: B.3
 */

// Load environment — for local dev, reads POSTGRES_URL from .env.local or ../../.env
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvIfNeeded(): void {
  if (!process.env.POSTGRES_URL) {
    const envCandidates = [
      resolve(__dirname, '../../../.env.local'),
      resolve(__dirname, '../../../../.env'),
    ];
    for (const envPath of envCandidates) {
      if (existsSync(envPath)) {
        try {
          process.loadEnvFile(envPath);
          if (process.env.POSTGRES_URL) break;
        } catch {
          // continue to next candidate
        }
      }
    }
  }
}

loadEnvIfNeeded();

import { insertCriteria } from '../db/criteria-store.js';

// ── Sepolia test-call criteria ─────────────────────────────────────────────────
//
// OPERATOR: populate this array with the known Sepolia test-call callIds
// before running. The callIds are assigned on-chain by CallRegistry (use
// the CallCreated event or subgraph to retrieve them).
//
// Format: { callId, oracleType, identifier, targetUnit? }
//
//   callId     : integer callId from on-chain CallCreated event
//   oracleType : 2 = DefiLlama, 3 = RpcMetrics, 6 = CexScraper
//   identifier : protocolSlug (DefiLlama/RpcMetrics) or tokenSymbol (CEX)
//   targetUnit : optional unit string (e.g. 'tvl', 'liquidation') — undefined for CEX
//
// Example entries (replace with real Sepolia callIds before running):
//
//   { callId: 1, oracleType: 2, identifier: 'uniswap',     targetUnit: 'tvl' },
//   { callId: 2, oracleType: 3, identifier: 'liquidation', targetUnit: undefined },
//   { callId: 3, oracleType: 6, identifier: 'ETH',         targetUnit: undefined },

interface CriteriaRow {
  callId: number;
  oracleType: number;
  identifier: string;
  targetUnit?: string;
}

const SEPOLIA_TEST_CALLS: CriteriaRow[] = [
  // ── INSERT YOUR SEPOLIA TEST CALL CRITERIA HERE ───────────────────────────
  // { callId: <N>, oracleType: 2, identifier: '<protocolSlug>', targetUnit: 'tvl' },
  // { callId: <N>, oracleType: 6, identifier: '<TOKEN_SYMBOL>', targetUnit: undefined },
  // ─────────────────────────────────────────────────────────────────────────
];

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('backfill-criteria: starting...');
  console.log(`backfill-criteria: ${SEPOLIA_TEST_CALLS.length} row(s) to process`);

  if (SEPOLIA_TEST_CALLS.length === 0) {
    console.warn(
      'backfill-criteria: SEPOLIA_TEST_CALLS array is empty.\n' +
      'Edit apps/relayer/src/scripts/backfill-criteria.ts and add the known Sepolia test call entries.\n' +
      'Use the on-chain CallCreated events or subgraph to find the callIds.',
    );
    process.exit(0);
  }

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of SEPOLIA_TEST_CALLS) {
    try {
      await insertCriteria(row.callId, row.oracleType, row.identifier, row.targetUnit);
      console.log(
        `  ✓ callId=${row.callId}  oracleType=${row.oracleType}  identifier="${row.identifier}"` +
        (row.targetUnit ? `  targetUnit="${row.targetUnit}"` : '  targetUnit=null') +
        '  → inserted (or already existed — ON CONFLICT DO NOTHING)',
      );
      inserted++;
    } catch (err) {
      console.error(
        `  ✗ callId=${row.callId}  identifier="${row.identifier}"  → ERROR: ${String(err)}`,
      );
      errors++;
    }
  }

  console.log(
    `backfill-criteria: done. inserted=${inserted} skipped=${skipped} errors=${errors}`,
  );

  if (errors > 0) {
    console.error('backfill-criteria: completed with errors — review above.');
    process.exit(1);
  }

  // Close the DB connection cleanly
  const { _resetDbForTesting } = await import('../db/client.js');
  await _resetDbForTesting();

  process.exit(0);
}

main().catch((err) => {
  console.error('backfill-criteria: fatal error:', err);
  process.exit(1);
});
