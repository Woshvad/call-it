/**
 * deploy-safe.test.ts — unit tests for scripts/deploy-safe.ts
 *
 * Tests:
 * - Test 1 (gated by SAFE_SIGNER_1): dry-run path constructs valid SafeAccountConfig
 * - Test 2 (gated by SAFE_SIGNER_1 + LEDGER_AVAILABLE): execute path deploys Safe (manual operator step)
 * - Test 3 (unconditional): error handling — missing env vars, env-key on mainnet rejection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isAddress } from 'viem';

const hasSigner1 = !!process.env.SAFE_SIGNER_1;
const hasSigner2 = !!process.env.SAFE_SIGNER_2;
const hasSigner3 = !!process.env.SAFE_SIGNER_3;
const hasAllSigners = hasSigner1 && hasSigner2 && hasSigner3;
const hasRpc = !!process.env.RPC_URL_ARBITRUM_SEPOLIA;
const hasDeployerKey = !!process.env.DEPLOYER_PRIVATE_KEY;
const hasLedger = !!process.env.LEDGER_AVAILABLE;

// ─────────────────────────────────────────────────────────────────────────────
// Test 3 (unconditional): Error handling + SafeAccountConfig validation
// ─────────────────────────────────────────────────────────────────────────────
describe('deploy-safe — error handling (unconditional)', () => {
  it('parses flag --dry-run as boolean', async () => {
    const { parseDeployArgs } = await import('../deploy-safe.js');
    const args = parseDeployArgs(['--network', 'sepolia', '--dry-run', '--signer-source', 'env']);
    expect(args.network).toBe('sepolia');
    expect(args.dryRun).toBe(true);
    expect(args.execute).toBe(false);
    expect(args.signerSource).toBe('env');
  });

  it('parses flag --execute as boolean', async () => {
    const { parseDeployArgs } = await import('../deploy-safe.js');
    const args = parseDeployArgs(['--network', 'sepolia', '--execute', '--signer-source', 'ledger']);
    expect(args.execute).toBe(true);
    expect(args.dryRun).toBe(false);
  });

  it('rejects --signer-source=env with --network=arbitrum-one', async () => {
    const { validateArgs } = await import('../deploy-safe.js');
    expect(() =>
      validateArgs({ network: 'arbitrum-one', dryRun: false, execute: true, signerSource: 'env' }),
    ).toThrow(/env.*mainnet|mainnet.*env|arbitrum-one.*env|env.*arbitrum-one/i);
  });

  it('rejects missing SAFE_SIGNER_1 env var', async () => {
    const { validateSigners } = await import('../deploy-safe.js');
    const origEnv = { ...process.env };
    // Remove signer 1 temporarily
    delete process.env.SAFE_SIGNER_1;
    expect(() => validateSigners()).toThrow(/SAFE_SIGNER_1 missing/i);
    // Restore
    Object.assign(process.env, origEnv);
  });

  it('rejects malformed (non-address) SAFE_SIGNER value', async () => {
    const { validateSigners } = await import('../deploy-safe.js');
    const origEnv = { ...process.env };
    process.env.SAFE_SIGNER_1 = '0x_invalid';
    process.env.SAFE_SIGNER_2 = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
    process.env.SAFE_SIGNER_3 = '0x742d35Cc6634C0532925a3b844Bc454e4438f44f';
    expect(() => validateSigners()).toThrow(/invalid.*address|address.*invalid|SAFE_SIGNER_1/i);
    // Restore
    Object.assign(process.env, origEnv);
  });

  it('builds SafeAccountConfig with owners[3] + threshold 2', async () => {
    const { buildSafeAccountConfig } = await import('../deploy-safe.js');
    const signers = [
      '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
      '0x742d35Cc6634C0532925a3b844Bc454e4438f44f',
      '0x742d35Cc6634C0532925a3b844Bc454e4438f44c',
    ] as const;
    const config = buildSafeAccountConfig(signers[0], signers[1], signers[2]);
    expect(config.owners).toHaveLength(3);
    expect(config.threshold).toBe(2);
    expect(config.owners).toContain(signers[0]);
    expect(config.owners).toContain(signers[1]);
    expect(config.owners).toContain(signers[2]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 1 (env-gated): Dry-run path with 3 signer env vars
// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!hasAllSigners || !hasRpc || !hasDeployerKey)(
  'deploy-safe — dry-run with env signers (gated: SAFE_SIGNER_{1,2,3} + RPC_URL_ARBITRUM_SEPOLIA + DEPLOYER_PRIVATE_KEY)',
  () => {
    it('predicts Safe address without executing deploy transaction', async () => {
      // This test invokes the dry-run path with --signer-source env
      // It should return a predicted address (0x...) WITHOUT broadcasting a tx
      const { runDeploy } = await import('../deploy-safe.js');
      const result = await runDeploy({
        network: 'sepolia',
        dryRun: true,
        execute: false,
        signerSource: 'env',
      });
      expect(result.predictedAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(result.txHash).toBe('dry-run');
      expect(result.signers).toHaveLength(3);
      expect(result.threshold).toBe(2);
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Test 2 (heavily gated): Execute path with Ledger — manual operator only
// ─────────────────────────────────────────────────────────────────────────────
describe.skipIf(!hasAllSigners || !hasRpc || !hasLedger)(
  'deploy-safe — execute with Ledger (gated: SAFE_SIGNER_{1,2,3} + RPC_URL_ARBITRUM_SEPOLIA + LEDGER_AVAILABLE)',
  () => {
    it('deploys Safe to Sepolia and writes deployment manifest', async () => {
      const { runDeploy } = await import('../deploy-safe.js');
      const result = await runDeploy({
        network: 'sepolia',
        dryRun: false,
        execute: true,
        signerSource: 'ledger',
      });
      expect(result.safeAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(result.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(result.threshold).toBe(2);
    });
  },
);
