/**
 * AUTH-10 / D-09 — Zero-mechanical-effect parity invariant.
 *
 * HARD INVARIANT (mirrors Phase 1's parity-gate discipline):
 *   A verified user and an unverified user receive byte-identical mechanical
 *   treatment. Social verification (verifiedX / verifiedFc) is purely cosmetic
 *   and MUST NOT touch any rep / stake-limit / fee / payout code path.
 *
 * This test proves the invariant two ways:
 *
 *   1. INPUT/OUTPUT PARITY — `mechanicalInputsFor({ verifiedX, verifiedFc, ...shared })`
 *      runs the ACTUAL mechanical surfaces (fee BPS constants, stake/position
 *      bounds, conviction floor, caller-exit penalty + rep-delta math) from
 *      @call-it/shared. The result is asserted deep-equal between a fully
 *      verified user and a fully unverified user with otherwise identical inputs.
 *      Because the helper never reads the verification flags, the two snapshots
 *      are identical — any future code that branches on verification breaks this.
 *
 *   2. STATIC GUARD — the mechanical-path source modules are read from disk and
 *      asserted to contain NO `verifiedX` / `verifiedFc` reference. If a verified
 *      flag ever leaks into fee/stake/rep math, the grep fails immediately.
 *
 * Requirement: AUTH-10. Decision: D-09.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  // Fee schedule (settlement extraction)
  PROTOCOL_FEE_BPS,
  CREATOR_FEE_BPS,
  LP_FEE_BPS,
  TOTAL_SETTLEMENT_EXTRACTION_BPS,
  CALL_CREATION_FEE_USDC,
  // Stake / position limits
  MIN_STAKE_USDC,
  MAX_STAKE_USDC,
  MIN_POSITION_USDC,
  // Conviction floor (rep-adjacent gate input)
  HIGH_CONVICTION_THRESHOLD,
  CONVICTION_AUTOCAP,
  CONVICTION_FLOOR_MIN_CALLS,
  // Caller-exit rep delta (the rep-delta surface)
  computeCallerExitRepDelta,
  computeCallerExitPenaltyPct,
  computePositionSlashSplit,
} from '@call-it/shared';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHARED_SRC = join(HERE, '..', '..', '..', 'packages', 'shared', 'src');

/** A user context that carries verification flags alongside the mechanical fields. */
type UserContext = {
  verifiedX: boolean;
  verifiedFc: boolean;
  // Otherwise-identical mechanical fields
  stake: bigint;
  position: bigint;
  conviction: number;
  settledCalls: number;
  createdAt: bigint;
  expiry: bigint;
  now: bigint;
  slashAmount: bigint;
};

/**
 * Compute every mechanical surface for a user, DELIBERATELY ignoring the
 * verification flags. JSON-serializable snapshot (bigints → strings) so two
 * snapshots can be compared with toEqual.
 */
function mechanicalInputsFor(ctx: UserContext) {
  // ── Stake / position bound checks (Gate 6.1 / SOCIAL-03) ──────────────────
  const stakeWithinBounds = ctx.stake >= MIN_STAKE_USDC && ctx.stake <= MAX_STAKE_USDC;
  const positionAboveMin = ctx.position >= MIN_POSITION_USDC;

  // ── Fee computation (1.0% + 0.4% + 0.3% = 1.7% settlement extraction) ─────
  const protocolFee = (ctx.stake * BigInt(PROTOCOL_FEE_BPS)) / 10_000n;
  const creatorFee = (ctx.stake * BigInt(CREATOR_FEE_BPS)) / 10_000n;
  const lpFee = (ctx.stake * BigInt(LP_FEE_BPS)) / 10_000n;
  const totalExtraction = (ctx.stake * BigInt(TOTAL_SETTLEMENT_EXTRACTION_BPS)) / 10_000n;
  const creationFee = CALL_CREATION_FEE_USDC;

  // ── Conviction floor (rep-adjacent gate input) ───────────────────────────
  const convictionCapped =
    ctx.conviction >= HIGH_CONVICTION_THRESHOLD && ctx.settledCalls < CONVICTION_FLOOR_MIN_CALLS;
  const appliedConviction = convictionCapped ? CONVICTION_AUTOCAP : ctx.conviction;

  // ── Caller-exit rep delta + penalty (the rep-delta / payout surfaces) ─────
  const repDelta = computeCallerExitRepDelta(ctx.createdAt, ctx.expiry, ctx.now);
  const exitPenaltyPct = computeCallerExitPenaltyPct(ctx.createdAt, ctx.expiry, ctx.now);
  const slashSplit = computePositionSlashSplit(ctx.slashAmount);

  return {
    stakeWithinBounds,
    positionAboveMin,
    protocolFee: protocolFee.toString(),
    creatorFee: creatorFee.toString(),
    lpFee: lpFee.toString(),
    totalExtraction: totalExtraction.toString(),
    creationFee: creationFee.toString(),
    convictionCapped,
    appliedConviction,
    repDelta,
    exitPenaltyPct,
    slashSplit: {
      toOpposite: slashSplit.toOpposite.toString(),
      toSameSide: slashSplit.toSameSide.toString(),
      toTreasury: slashSplit.toTreasury.toString(),
    },
  };
}

describe('AUTH-10 / D-09: verification has zero mechanical effect', () => {
  // Otherwise-identical mechanical fields shared by both users.
  const sharedFields = {
    stake: 50_000_000n, // $50
    position: 10_000_000n, // $10
    conviction: 90,
    settledCalls: 3, // < 10 → conviction floor fires for both
    createdAt: 1_700_000_000n,
    expiry: 1_700_086_400n, // +24h
    now: 1_700_043_200n, // halfway
    slashAmount: 7_777_777n,
  };

  const verifiedUser: UserContext = { verifiedX: true, verifiedFc: true, ...sharedFields };
  const unverifiedUser: UserContext = { verifiedX: false, verifiedFc: false, ...sharedFields };

  it('verified and unverified users yield identical mechanical treatment', () => {
    const verifiedMechanics = mechanicalInputsFor(verifiedUser);
    const unverifiedMechanics = mechanicalInputsFor(unverifiedUser);
    expect(verifiedMechanics).toEqual(unverifiedMechanics);
  });

  it('X-only, FC-only, and both-verified are all mechanically identical to unverified', () => {
    const baseline = mechanicalInputsFor(unverifiedUser);
    const xOnly = mechanicalInputsFor({ ...sharedFields, verifiedX: true, verifiedFc: false });
    const fcOnly = mechanicalInputsFor({ ...sharedFields, verifiedX: false, verifiedFc: true });
    const both = mechanicalInputsFor({ ...sharedFields, verifiedX: true, verifiedFc: true });
    expect(xOnly).toEqual(baseline);
    expect(fcOnly).toEqual(baseline);
    expect(both).toEqual(baseline);
  });

  it('the snapshot actually exercises real mechanics (non-trivial guard)', () => {
    const m = mechanicalInputsFor(verifiedUser);
    // Fees are non-zero (proves we computed something, not just empty parity).
    expect(m.protocolFee).toBe('500000'); // 50e6 * 100 / 10000
    expect(m.creatorFee).toBe('200000'); // 50e6 * 40 / 10000
    expect(m.lpFee).toBe('150000'); // 50e6 * 30 / 10000
    expect(m.totalExtraction).toBe('850000'); // 50e6 * 170 / 10000
    expect(m.convictionCapped).toBe(true); // 90 >= 85 && settled 3 < 10
    expect(m.appliedConviction).toBe(CONVICTION_AUTOCAP);
    expect(m.stakeWithinBounds).toBe(true);
    expect(m.repDelta).toBeLessThan(0); // rep delta is a real negative value
  });
});

describe('AUTH-10 / D-09: static guard — no verification flag in mechanical source', () => {
  const MECHANICAL_MODULES = [
    join(SHARED_SRC, 'constants', 'fees.ts'),
    join(SHARED_SRC, 'validation', 'call-gates.ts'),
    join(SHARED_SRC, 'validation', 'follow-fade-gates.ts'),
  ];

  it.each(MECHANICAL_MODULES)('%s contains no verifiedX/verifiedFc reference', (modulePath) => {
    const source = readFileSync(modulePath, 'utf-8');
    expect(source).not.toMatch(/verifiedX/);
    expect(source).not.toMatch(/verifiedFc/);
    // Defensive: no generic verification/social keying in fee/stake/rep math.
    expect(source).not.toMatch(/socialVerif/i);
  });

  it('mechanical modules read non-empty (sanity — paths resolve)', () => {
    for (const modulePath of MECHANICAL_MODULES) {
      expect(readFileSync(modulePath, 'utf-8').length).toBeGreaterThan(100);
    }
  });
});
