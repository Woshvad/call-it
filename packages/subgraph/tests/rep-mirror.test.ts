/**
 * rep-mirror.test.ts — source-assertion tests pinning the RepDeltaApplied
 * globalRep mirror (quick-260611-sof; 09.2 UAT finding 1).
 *
 * Root cause being pinned: SettlementManager._computeRepDelta emits
 * RepCalculated(..., currentRep, ...) with the PRE-applyRepDelta rep
 * (SettlementManager.sol:282 read, :311 emit). The v0.9.1 mapping persisted
 * that stale value (settlement-manager.ts handleRepCalculated), so the
 * leaderboard showed losers unpunished at 100.
 *
 * The fix: ProfileRegistry.applyRepDelta is the ONLY globalRep mutator and
 * emits RepDeltaApplied(address indexed user, int256 delta, uint128 newRep)
 * where newRep is the POST-apply value (REP-02 floor-at-0 + WR-08 uint128
 * clamp already applied on-chain, ProfileRegistry.sol:239-252). The subgraph
 * mirrors globalRep exclusively from that event.
 *
 * These are source-level assertions (readFileSync + regex) in the style of
 * call-statement.test.ts — matchstick runtime tests are not wired in this
 * package.
 *
 * Requirements: QUICK-260611-SOF, OPS-01, OPS-03 (subgraph), REP family.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const yamlPath = join(process.cwd(), 'subgraph.yaml');
const yamlText = readFileSync(yamlPath, 'utf-8');

const profileRegistryPath = join(process.cwd(), 'src', 'profile-registry.ts');
const profileRegistryText = readFileSync(profileRegistryPath, 'utf-8');

const settlementManagerPath = join(process.cwd(), 'src', 'settlement-manager.ts');
const settlementManagerText = readFileSync(settlementManagerPath, 'utf-8');

// All five mapping files — used by the single-source-of-truth assertion.
const mappingFiles = [
  'call-registry.ts',
  'challenge-escrow.ts',
  'follow-fade-market.ts',
  'profile-registry.ts',
  'settlement-manager.ts',
] as const;

/** Extract the ProfileRegistry dataSource block from subgraph.yaml. */
function profileRegistryDataSource(): string {
  const start = yamlText.indexOf('name: ProfileRegistry');
  expect(start, 'ProfileRegistry dataSource must exist in subgraph.yaml').toBeGreaterThan(-1);
  const rest = yamlText.slice(start);
  const nextDataSource = rest.indexOf('- kind: ethereum/contract');
  return nextDataSource === -1 ? rest : rest.slice(0, nextDataSource);
}

describe('quick-260611-sof: RepDeltaApplied globalRep mirror', () => {
  it('subgraph.yaml wires RepDeltaApplied(indexed address,int256,uint128) → handleRepDeltaApplied under ProfileRegistry', () => {
    const block = profileRegistryDataSource();
    expect(
      block.includes('RepDeltaApplied(indexed address,int256,uint128)'),
      'ProfileRegistry dataSource must declare the RepDeltaApplied event handler entry',
    ).toBe(true);
    expect(
      /handler:\s*handleRepDeltaApplied/.test(block),
      'ProfileRegistry dataSource must route RepDeltaApplied to handleRepDeltaApplied',
    ).toBe(true);
  });

  it('profile-registry.ts exports handleRepDeltaApplied assigning globalRep from event.params.newRep.toI32()', () => {
    expect(
      /export\s+function\s+handleRepDeltaApplied\(/.test(profileRegistryText),
      'src/profile-registry.ts must export handleRepDeltaApplied',
    ).toBe(true);
    expect(
      /profile\.globalRep\s*=\s*event\.params\.newRep\.toI32\(\)/.test(profileRegistryText),
      'handleRepDeltaApplied must mirror the POST-apply rep: profile.globalRep = event.params.newRep.toI32()',
    ).toBe(true);
    // The event class must come from codegen output for the ProfileRegistry ABI.
    expect(
      /RepDeltaApplied[\s\S]*?from\s+'\.\.\/generated\/ProfileRegistry\/ProfileRegistry'/.test(
        profileRegistryText,
      ),
      'RepDeltaApplied must be imported from the generated ProfileRegistry bindings',
    ).toBe(true);
  });

  it('settlement-manager.ts no longer writes the stale pre-update currentRep into globalRep', () => {
    expect(
      /profile\.globalRep\s*=\s*event\.params\.currentRep/.test(settlementManagerText),
      'handleRepCalculated must NOT persist RepCalculated.currentRep — it is the PRE-applyRepDelta rep (SettlementManager.sol:282) and clobbers the correct RepDeltaApplied mirror in the same tx',
    ).toBe(false);
  });

  it('single source of truth: the only globalRep writers are the ensureProfile 100 defaults plus the one newRep mirror', () => {
    const assignmentRe = /profile\.globalRep\s*=\s*([^;]+);/g;
    const allowedDefault = /^100$/;
    const allowedMirror = /^event\.params\.newRep\.toI32\(\)$/;

    let mirrorCount = 0;
    for (const file of mappingFiles) {
      const text = readFileSync(join(process.cwd(), 'src', file), 'utf-8');
      let match: RegExpExecArray | null;
      while ((match = assignmentRe.exec(text)) !== null) {
        const rhs = match[1].trim();
        if (allowedMirror.test(rhs)) {
          mirrorCount += 1;
          expect(
            file,
            'the newRep mirror must live in profile-registry.ts only',
          ).toBe('profile-registry.ts');
        } else {
          expect(
            allowedDefault.test(rhs),
            `unexpected globalRep writer in src/${file}: "profile.globalRep = ${rhs};" — only the ensureProfile 100 default and the RepDeltaApplied newRep mirror are allowed`,
          ).toBe(true);
        }
      }
      assignmentRe.lastIndex = 0;
    }
    expect(mirrorCount, 'exactly one newRep mirror must exist').toBe(1);
  });
});
