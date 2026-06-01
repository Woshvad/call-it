/**
 * outcome-word.ts — Outcome word assignment for the Settled Receipt page.
 *
 * Spec: CALL_IT_SPEC1.md §15.7 — the 5 outcome words are LOCKED.
 * Design: D-08 (thresholds) + D-09 (per-viewer rendering).
 *
 * TODO: Implement getOutcomeWord() in Plan 04-02 (GREEN gate for outcome-word.test.ts).
 *
 * D-08 Thresholds (codified as test-of-record in outcome-word.test.ts):
 *   - CONTRARIAN HIT: callerWon AND fadeRealShare >= 0.5 (majority real fade side)
 *   - COLD CALL:      callerWon AND repDelta <= 3 (low conviction OR cold-start 25% applied)
 *   - CALLED IT:      callerWon (default win)
 *   - LOUD AND WRONG: callerLost (default loss)
 *   - FADED CORRECTLY: per-viewer only — connected wallet is winning fader (D-09)
 *
 * D-09 Public viewer rule:
 *   viewerIsWinningFader=false (wallet disconnected OR no fade position) NEVER returns
 *   "FADED CORRECTLY" — viewer sees caller-centric outcome word only.
 *
 * Phase 4 note: This module ships the stub here so the test can import it.
 * The full implementation is in Plan 04-02 (GREEN gate).
 */

/** Parameters for outcome word assignment (D-08/D-09). */
export interface OutcomeWordParams {
  /** Whether the caller won the call. */
  callerWon: boolean;
  /**
   * Fade share of the real (non-virtual) pool at settlement time.
   * Range: [0, 1]. Used for CONTRARIAN HIT threshold (D-08: >= 0.5).
   */
  fadeRealShare: number;
  /**
   * Rep delta awarded/deducted at settlement.
   * Used for COLD CALL threshold (D-08: repDelta <= 3).
   */
  repDelta: number;
  /**
   * Whether the connected viewer holds a winning fade position (D-09).
   * false when wallet is disconnected OR viewer has no fade position.
   * NEVER returns "FADED CORRECTLY" when false.
   */
  viewerIsWinningFader: boolean;
}

/** The 5 locked outcome words (CALL_IT_SPEC1.md §15.7 — DO NOT ADD/RENAME). */
export type OutcomeWord =
  | 'CONTRARIAN HIT'
  | 'COLD CALL'
  | 'CALLED IT'
  | 'LOUD AND WRONG'
  | 'FADED CORRECTLY';

/**
 * Determine the outcome word for the Settled Receipt page.
 *
 * Priority order (D-08):
 *   1. viewerIsWinningFader=true AND !callerWon → "FADED CORRECTLY" (D-09 per-viewer)
 *   2. callerWon AND repDelta <= 3              → "COLD CALL"
 *   3. callerWon AND fadeRealShare >= 0.5       → "CONTRARIAN HIT"
 *   4. callerWon                                → "CALLED IT"
 *   5. !callerWon                               → "LOUD AND WRONG"
 *
 * TODO (Plan 04-02): implement this function body.
 */
export function getOutcomeWord(_params: OutcomeWordParams): OutcomeWord {
  // TODO: implement in Plan 04-02 (GREEN gate)
  throw new Error('getOutcomeWord not yet implemented — Plan 04-02 GREEN gate');
}
