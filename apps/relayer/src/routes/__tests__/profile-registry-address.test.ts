/**
 * profile-registry-address.test.ts — quick-260611-p9a regression pins.
 *
 * Root cause (verified live 2026-06-11): getProfileRegistryAddress() in
 * routes/profile.ts fell back to the ZERO ADDRESS when a NEXT_PUBLIC_* env
 * var (a web-ism, never set on Fly) was unset — so every displayHandle /
 * settledCalls read silently targeted the zero address, degraded to ''/0n
 * via the inner catch, and the user's paid-for on-chain handle rendered as
 * `truncated`. Same landmine class fixed on web in quick-260611-npv.
 *
 * Pins (source-assertion style, mirrors apps/web/tests/chain-pinning.test.ts):
 *   1. profile.ts sources its registry address from the canonical
 *      PROFILE_REGISTRY_ARBITRUM_SEPOLIA const in @call-it/shared.
 *   2. The env-or-zero fallback pattern is dead.
 *   3. The shared const itself can never silently regress to zero.
 *
 * Requirements: AUTH-11, AUTH-35
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROFILE_REGISTRY_ARBITRUM_SEPOLIA } from '@call-it/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, '../profile.ts'), 'utf-8');

describe('profile route ProfileRegistry address (quick-260611-p9a)', () => {
  it('reads the canonical shared const PROFILE_REGISTRY_ARBITRUM_SEPOLIA', () => {
    expect(source).toContain('PROFILE_REGISTRY_ARBITRUM_SEPOLIA');
    expect(source).toContain('@call-it/shared');
  });

  it('env-or-zero fallback pattern is dead', () => {
    expect(source).not.toContain('NEXT_PUBLIC_PROFILE_REGISTRY_ADDRESS');
    expect(source).not.toContain("?? '0x0000000000000000000000000000000000000000'");
  });

  it('the shared const itself is not the zero address (no silent regression)', () => {
    expect(PROFILE_REGISTRY_ARBITRUM_SEPOLIA).not.toBe(
      '0x0000000000000000000000000000000000000000',
    );
  });
});
