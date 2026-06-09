/**
 * outcome-word.ts — Outcome word assignment for the Settled Receipt page.
 *
 * Spec: CALL_IT_SPEC1.md §15.7 — the 5 outcome words are LOCKED.
 * Design: D-08 (thresholds) + D-09 (per-viewer rendering).
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
 * GREEN gate for outcome-word.test.ts (Plan 04-07).
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
 * Outcome word result with explicit §14.1 hex color and optional lozenge label.
 * Colors are EXPLICIT HEX — NOT the Stamp token map (which has stale #A855F7 for contrarian).
 */
export interface OutcomeWordResult {
  word: OutcomeWord;
  /** §14.1 hex color — LOCKED. Never use Stamp token map colors here. */
  color: string;
  /** Optional lozenge label: 'CONTRARIAN' | 'FADER WIN' | null */
  lozenge: string | null;
}

/**
 * Determine the outcome word for the Settled Receipt page.
 *
 * Priority order (D-08):
 *   1. viewerIsWinningFader=true AND !callerWon → "FADED CORRECTLY" (D-09 per-viewer)
 *   2. callerWon AND repDelta <= 3              → "COLD CALL" (takes priority over CONTRARIAN HIT)
 *   3. callerWon AND fadeRealShare >= 0.5       → "CONTRARIAN HIT"
 *   4. callerWon                                → "CALLED IT"
 *   5. !callerWon                               → "LOUD AND WRONG"
 *
 * Note: The test file (spec-of-record) validates that COLD CALL takes priority over
 * CONTRARIAN HIT when repDelta <= 3, even if fadeRealShare >= 0.5.
 */
export function getOutcomeWord(params: OutcomeWordParams): OutcomeWord {
  const { callerWon, fadeRealShare, repDelta, viewerIsWinningFader } = params;

  // D-09: per-viewer fader win — only when wallet connected AND has winning fade position
  if (viewerIsWinningFader && !callerWon) {
    return 'FADED CORRECTLY';
  }

  if (callerWon) {
    // COLD CALL takes priority over CONTRARIAN HIT (D-08 priority, test case testPriorityOrder)
    if (repDelta <= 3) {
      return 'COLD CALL';
    }
    if (fadeRealShare >= 0.5) {
      return 'CONTRARIAN HIT';
    }
    return 'CALLED IT';
  }

  // Default loss word (caller-centric, viewerIsWinningFader=false at this point)
  return 'LOUD AND WRONG';
}

/**
 * Get the full outcome word result including §14.1 hex color and lozenge.
 * Used by the Settled Receipt page and OG card builder.
 *
 * D-09: viewerIsWinningFader must be explicitly false when wallet is disconnected.
 */
export function getOutcomeWordResult(params: OutcomeWordParams): OutcomeWordResult {
  const word = getOutcomeWord(params);

  // §14.1 LOCKED outcome colors — explicit hex, NOT Stamp token map (#A855F7 is wrong)
  const COLOR_MAP: Record<OutcomeWord, string> = {
    'CALLED IT':       '#4ADE80', // win green
    'LOUD AND WRONG':  '#F87171', // loss red
    'CONTRARIAN HIT':  '#E8F542', // accent (NOT purple #A855F7)
    'COLD CALL':       '#94A3B8', // neutral slate
    'FADED CORRECTLY': '#E8F542', // accent (same as CONTRARIAN HIT)
  };

  const LOZENGE_MAP: Record<OutcomeWord, string | null> = {
    'CALLED IT':       null,
    'LOUD AND WRONG':  null,
    'CONTRARIAN HIT':  'CONTRARIAN',
    'COLD CALL':       null,
    'FADED CORRECTLY': 'FADER WIN',
  };

  return {
    word,
    color: COLOR_MAP[word],
    lozenge: LOZENGE_MAP[word],
  };
}

// ── Settled-receipt neutral fallback (08-05 — GAP 1, Core Value) ────────────────

/**
 * Neutral placeholder used by the Settled Receipt page when the true outcome word
 * is NOT yet known (outcome enum still Pending, or a subgraph/relayer outage left
 * the settled fields absent). This word is deliberately NOT one of the 5 §15.7
 * outcome words — it is a non-win, non-loss state so the page NEVER fabricates a
 * positive "CALLED IT" for a settled call whose result we cannot confirm.
 */
export const SETTLED_NEUTRAL_WORD = 'PENDING RESULT';
/** Neutral slate color (§14.1 muted) for the placeholder word. */
export const SETTLED_NEUTRAL_COLOR = '#94A3B8';

/** Resolved settled-receipt display word + color + lozenge. */
export interface ResolvedSettledWord {
  word: string;
  color: string;
  lozenge: string | null;
}

/**
 * Resolve the word/color/lozenge the Settled Receipt page should render.
 *
 * CORE VALUE (08-05 GAP 1 — receipts must be unfakeable): when `result` is null
 * (the true outcome is unknown on a settled call), this resolves to a NEUTRAL
 * placeholder — NEVER to a win word. The old page code defaulted to 'CALLED IT'
 * here, publicly casting a settled LOSS (or an unknown outcome) as a win. This
 * helper is the single, unit-testable guard that makes a fabricated win impossible.
 *
 * @param result The getOutcomeWordResult output, or null when outcome is unknown.
 */
export function resolveSettledWord(result: OutcomeWordResult | null): ResolvedSettledWord {
  if (result) {
    return { word: result.word, color: result.color, lozenge: result.lozenge };
  }
  // FAIL-SAFE: unknown outcome on a settled call → neutral, never a win word.
  return {
    word: SETTLED_NEUTRAL_WORD,
    color: SETTLED_NEUTRAL_COLOR,
    lozenge: null,
  };
}
