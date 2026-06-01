/**
 * challenge-gates.test.ts — Vitest parity for ChallengeEscrow gate logic (D-29).
 *
 * Pure TypeScript mirror of the Foundry gate test conditions in:
 *   packages/contracts/test/ChallengeEscrowParity.t.sol
 *
 * These tests validate the same boundary conditions as the Solidity contract
 * but run against a TS utility object so the frontend can enforce the same
 * rules before sending a transaction (preflight pattern from Phase 1).
 *
 * No contract imports — pure logic only.
 *
 * Requirements: SOCIAL-29, SOCIAL-31, SOCIAL-32, SOCIAL-34
 *
 * Run:
 *   pnpm --filter @call-it/web test --run challenge-gates
 */

import { describe, it, expect } from 'vitest';

// ─── Constants (mirror ChallengeEscrow.sol and CeTestHelper.sol) ──────────────

/** Minimum stake: $5 USDC in micro-units (6 decimals). SOCIAL-03. */
const CHALLENGE_MIN_STAKE = 5_000_000n;

/** Maximum stake: $100 USDC in micro-units. SOCIAL-04. */
const CHALLENGE_MAX_STAKE = 100_000_000n;

/** Acceptance window: 24 hours in seconds. SOCIAL-34. */
const CHALLENGE_ACCEPTANCE_WINDOW_SECS = 86_400;

// ─── Challenge gate utility object ───────────────────────────────────────────

interface StakeValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * Mirror of ChallengeEscrow on-chain gate logic.
 * Used by the ChallengeFormModal preflight to block invalid transactions before submission.
 */
const challengeGates = {
  /**
   * Validate stake is within [CHALLENGE_MIN_STAKE, CHALLENGE_MAX_STAKE].
   * Mirrors ChallengeEscrow.proposeChallenge() StakeBelowMinimum / StakeAboveMaximum gates.
   */
  validateStake(stake: bigint): StakeValidationResult {
    if (stake < CHALLENGE_MIN_STAKE) {
      return { ok: false, error: 'StakeBelowMinimum' };
    }
    if (stake > CHALLENGE_MAX_STAKE) {
      return { ok: false, error: 'StakeAboveMaximum' };
    }
    return { ok: true };
  },

  /**
   * Detect self-challenge: caller address equals challenger address.
   * Mirrors ChallengeEscrow.proposeChallenge() SelfChallenge gate.
   * @param caller The call creator's address (checksummed or lowercase).
   * @param challenger The proposing challenger's address.
   */
  isSelfChallenge(caller: string, challenger: string): boolean {
    return caller.toLowerCase() === challenger.toLowerCase();
  },

  /**
   * Check if the 24h acceptance window has expired.
   * Mirrors ChallengeEscrow.acceptChallenge() AcceptanceWindowExpired gate.
   * @param proposedAt Unix timestamp (seconds) when the challenge was proposed.
   * @param nowTs Current Unix timestamp (seconds).
   */
  isWindowExpired(proposedAt: number, nowTs: number): boolean {
    return nowTs > proposedAt + CHALLENGE_ACCEPTANCE_WINDOW_SECS;
  },

  /**
   * Check if a call is open to challenges.
   * Mirrors ChallengeEscrow.proposeChallenge() CallerNotOpenToChallenges gate.
   * @param flag The call.openToChallenges field from on-chain data.
   */
  isOpenToChallenges(flag: boolean): boolean {
    return flag;
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('challengeGates — stake bounds', () => {
  it('stakeBelowMinimum: 4_999_999 micros is rejected', () => {
    const result = challengeGates.validateStake(4_999_999n);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('StakeBelowMinimum');
  });

  it('stakeAtMinimum: 5_000_000 micros is accepted', () => {
    const result = challengeGates.validateStake(5_000_000n);
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('stakeAboveMaximum: 100_000_001 micros is rejected', () => {
    const result = challengeGates.validateStake(100_000_001n);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('StakeAboveMaximum');
  });

  it('stakeAtMaximum: 100_000_000 micros is accepted', () => {
    const result = challengeGates.validateStake(100_000_000n);
    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });
});

describe('challengeGates — self-challenge detection', () => {
  it('selfChallengeDetected: caller == challenger returns true', () => {
    const addr = '0xabc123def456abc123def456abc123def456abc1';
    expect(challengeGates.isSelfChallenge(addr, addr)).toBe(true);
  });

  it('selfChallengeDetected: caller != challenger returns false', () => {
    const caller     = '0xabc123def456abc123def456abc123def456abc1';
    const challenger = '0xdef456abc123def456abc123def456abc123def4';
    expect(challengeGates.isSelfChallenge(caller, challenger)).toBe(false);
  });

  it('selfChallengeDetected: case-insensitive comparison (checksummed vs lowercase)', () => {
    const caller     = '0xABC123DEF456ABC123DEF456ABC123DEF456ABC1';
    const challenger = '0xabc123def456abc123def456abc123def456abc1';
    expect(challengeGates.isSelfChallenge(caller, challenger)).toBe(true);
  });
});

describe('challengeGates — openToChallenges flag', () => {
  it('openToChallengesFlag: false means NOT open to challenges', () => {
    expect(challengeGates.isOpenToChallenges(false)).toBe(false);
  });

  it('openToChallengesFlag: true means open to challenges', () => {
    expect(challengeGates.isOpenToChallenges(true)).toBe(true);
  });
});

describe('challengeGates — acceptance window', () => {
  it('windowExpired: proposedAt more than 24h ago returns true', () => {
    const proposedAt = 1_000_000;
    const nowTs = proposedAt + CHALLENGE_ACCEPTANCE_WINDOW_SECS + 1;
    expect(challengeGates.isWindowExpired(proposedAt, nowTs)).toBe(true);
  });

  it('windowValid: proposedAt 23h ago returns false', () => {
    const proposedAt = 1_000_000;
    const nowTs = proposedAt + (CHALLENGE_ACCEPTANCE_WINDOW_SECS - 3600); // 23h later
    expect(challengeGates.isWindowExpired(proposedAt, nowTs)).toBe(false);
  });

  it('windowBoundary: exactly at 24h returns false (window open)', () => {
    const proposedAt = 1_000_000;
    const nowTs = proposedAt + CHALLENGE_ACCEPTANCE_WINDOW_SECS; // exactly 24h, not expired
    expect(challengeGates.isWindowExpired(proposedAt, nowTs)).toBe(false);
  });
});
