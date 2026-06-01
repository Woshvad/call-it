/**
 * KMS signer barrel re-export.
 *
 * Exists to provide a stable module path for tests that mock
 * '../../../lib/kms-signer.js' from src/workers/__tests__/.
 * See: apps/relayer/vitest.config.ts resolve.alias.
 *
 * This file re-exports everything from the canonical source at src/lib/kms-signer.ts.
 */
export * from '../src/lib/kms-signer.js';
