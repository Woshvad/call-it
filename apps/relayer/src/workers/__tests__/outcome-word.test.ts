/**
 * outcome-word.test.ts — RED-gate Vitest scaffold for outcome word assignment.
 *
 * Spec: CALL_IT_SPEC1.md §15.7 — 5 outcome words LOCKED
 * Design: D-08 (thresholds — planner discretion), D-09 (per-viewer rendering)
 * Requirements: UI-14, UI-15, UI-16
 *
 * RED GATE: getOutcomeWord() is a stub in apps/web/lib/outcome-word.ts that throws.
 * This file WILL fail ("getOutcomeWord not yet implemented") until Plan 04-02 implements it.
 *
 * D-08 THRESHOLDS (this test file is the SPEC-OF-RECORD for outcome word assignment):
 *   - CONTRARIAN HIT: callerWon AND fadeRealShare >= 0.5 (majority real fade side)
 *   - COLD CALL:      callerWon AND repDelta <= 3 (low conviction OR cold-start 25% applied)
 *   - CALLED IT:      callerWon (default win, fadeRealShare < 0.5 AND repDelta > 3)
 *   - LOUD AND WRONG: callerLost (caller lost, not a fader's POV)
 *   - FADED CORRECTLY: per-viewer only — viewerIsWinningFader=true AND callerLost (D-09)
 *
 * D-09 PUBLIC VIEWER RULE (CRITICAL):
 *   viewerIsWinningFader=false means:
 *   - Wallet is disconnected, OR
 *   - Viewer has no fade position on this call
 *   In this case, outcome word is ALWAYS caller-centric (NEVER "FADED CORRECTLY").
 *   A public viewer (no wallet) sees LOUD AND WRONG when the caller lost.
 *   This prevents misleading display to non-participating viewers.
 *
 * Foundry↔Vitest parity gate: these thresholds must match the Solidity
 * _solidityBaselineRepDelta logic for COLD CALL detection (delta <= 3 at conviction <= 15%).
 */

import { describe, it, expect } from 'vitest';

// Import from the web app's outcome-word module (stub for now)
// The relayer shares this logic via the monorepo — same thresholds as frontend
import {
  getOutcomeWord,
  OutcomeWord,
  OutcomeWordParams,
} from '../../../../web/lib/outcome-word.js'; // <-- Will throw until Plan 04-02 implements

describe('getOutcomeWord — D-08 thresholds (spec-of-record)', () => {

  /**
   * testContrarianHit (D-08):
   * fadeRealShare=0.55 (55% of real pool was on fade side) AND callerWon.
   * Threshold: fadeRealShare >= 0.5 → CONTRARIAN HIT.
   * The "majority real faders" threshold is lenient to drive more celebratory receipts.
   */
  it('CONTRARIAN HIT when fadeRealShare >= 0.5 and caller won (D-08)', () => {
    const params: OutcomeWordParams = {
      callerWon: true,
      fadeRealShare: 0.55,  // 55% — above the 0.5 threshold
      repDelta: 10,         // high rep delta — not a cold call
      viewerIsWinningFader: false,
    };

    const word: OutcomeWord = getOutcomeWord(params);
    expect(word).toBe('CONTRARIAN HIT');
  });

  /**
   * testContrarianHitBoundary (D-08):
   * fadeRealShare=0.5 exactly — at the boundary, should still be CONTRARIAN HIT.
   */
  it('CONTRARIAN HIT when fadeRealShare equals 0.5 exactly (D-08 boundary)', () => {
    const params: OutcomeWordParams = {
      callerWon: true,
      fadeRealShare: 0.5,   // Exact boundary — >= 0.5 → CONTRARIAN HIT
      repDelta: 8,
      viewerIsWinningFader: false,
    };

    const word: OutcomeWord = getOutcomeWord(params);
    expect(word).toBe('CONTRARIAN HIT');
  });

  /**
   * testCalledIt (D-08):
   * fadeRealShare=0.3 (below 0.5 threshold) AND callerWon AND repDelta > 3.
   * Default win word.
   */
  it('CALLED IT when caller won with fadeRealShare < 0.5 and repDelta > 3 (D-08)', () => {
    const params: OutcomeWordParams = {
      callerWon: true,
      fadeRealShare: 0.3,   // Below threshold — not contrarian
      repDelta: 10,         // Above 3 — not a cold call
      viewerIsWinningFader: false,
    };

    const word: OutcomeWord = getOutcomeWord(params);
    expect(word).toBe('CALLED IT');
  });

  /**
   * testColdCall (D-08):
   * callerWon=true AND repDelta=2 (delta <= 3 threshold).
   * COLD CALL applies when:
   *   - Very low conviction (conviction <= ~15% in Solidity baseline → delta ≤ 3), OR
   *   - Cold-start 25% scaling applied (REP-14: zero real faders → 25% of uncapped delta)
   *
   * Threshold: repDelta <= 3 → COLD CALL.
   * This is the Foundry↔Vitest parity gate for _solidityBaselineRepDelta.
   */
  it('COLD CALL when callerWon and repDelta <= 3 (D-08 threshold, Foundry parity gate)', () => {
    const params: OutcomeWordParams = {
      callerWon: true,
      fadeRealShare: 0.3,
      repDelta: 2,          // <= 3 → COLD CALL
      viewerIsWinningFader: false,
    };

    const word: OutcomeWord = getOutcomeWord(params);
    expect(word).toBe('COLD CALL');
  });

  /**
   * testColdCallBoundary (D-08):
   * repDelta=3 exactly — at the boundary, should be COLD CALL.
   */
  it('COLD CALL when repDelta equals 3 exactly (D-08 boundary)', () => {
    const params: OutcomeWordParams = {
      callerWon: true,
      fadeRealShare: 0.2,
      repDelta: 3,          // Exact boundary — <= 3 → COLD CALL
      viewerIsWinningFader: false,
    };

    const word: OutcomeWord = getOutcomeWord(params);
    expect(word).toBe('COLD CALL');
  });

  /**
   * testLoudAndWrong:
   * callerWon=false → "LOUD AND WRONG" (default loss word).
   * Not viewer-dependent when viewerIsWinningFader=false.
   */
  it('LOUD AND WRONG when caller lost (default loss, viewerIsWinningFader=false)', () => {
    const params: OutcomeWordParams = {
      callerWon: false,
      fadeRealShare: 0.4,
      repDelta: -10,
      viewerIsWinningFader: false,
    };

    const word: OutcomeWord = getOutcomeWord(params);
    expect(word).toBe('LOUD AND WRONG');
  });

  /**
   * testFadedCorrectly (D-09):
   * viewerIsWinningFader=true AND callerWon=false → "FADED CORRECTLY".
   * Per-viewer outcome: a connected wallet on the winning fade side sees their win.
   */
  it('FADED CORRECTLY when viewerIsWinningFader=true and caller lost (D-09 per-viewer)', () => {
    const params: OutcomeWordParams = {
      callerWon: false,
      fadeRealShare: 0.6,
      repDelta: -10,
      viewerIsWinningFader: true,  // Connected wallet with winning fade position
    };

    const word: OutcomeWord = getOutcomeWord(params);
    expect(word).toBe('FADED CORRECTLY');
  });

  /**
   * testPublicViewer (D-09 CRITICAL):
   * viewerIsWinningFader=false means the viewer either:
   *   - Has no connected wallet, OR
   *   - Has a wallet but no fade position on this call
   * In BOTH cases, the viewer sees the CALLER-CENTRIC outcome word.
   * NEVER "FADED CORRECTLY" when viewerIsWinningFader=false.
   *
   * This test enforces D-09: public viewers (no wallet, no position) see
   * "LOUD AND WRONG" when the caller lost — NOT "FADED CORRECTLY".
   * Only actual winning faders with a connected wallet see "FADED CORRECTLY".
   */
  it('NEVER returns FADED CORRECTLY when viewerIsWinningFader=false (D-09 public viewer rule)', () => {
    // Scenario: caller lost, lots of real faders, but viewer has no wallet/position
    const params: OutcomeWordParams = {
      callerWon: false,
      fadeRealShare: 0.7,   // 70% real faders — but viewer is NOT one of them
      repDelta: -10,
      viewerIsWinningFader: false,  // Wallet disconnected OR no fade position
    };

    const word: OutcomeWord = getOutcomeWord(params);

    // Public viewer sees caller-centric word
    expect(word).toBe('LOUD AND WRONG');
    // Must NEVER be "FADED CORRECTLY" for public viewers (D-09)
    expect(word).not.toBe('FADED CORRECTLY');
  });

  /**
   * testPriorityOrder (D-08):
   * COLD CALL takes priority over CONTRARIAN HIT when repDelta <= 3.
   * A contrarian win with very low conviction is still a COLD CALL.
   */
  it('COLD CALL takes priority over CONTRARIAN HIT when repDelta <= 3 (D-08 priority)', () => {
    const params: OutcomeWordParams = {
      callerWon: true,
      fadeRealShare: 0.6,   // Would be CONTRARIAN HIT (>= 0.5)
      repDelta: 1,          // But COLD CALL threshold wins (delta <= 3)
      viewerIsWinningFader: false,
    };

    // repDelta <= 3 overrides the CONTRARIAN HIT condition
    const word: OutcomeWord = getOutcomeWord(params);
    expect(word).toBe('COLD CALL');
  });
});
