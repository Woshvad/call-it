"use strict";
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
 * NOTE: This is a compiled artifact. The canonical source is outcome-word.ts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOutcomeWord = getOutcomeWord;
exports.getOutcomeWordResult = getOutcomeWordResult;

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
 * Note: COLD CALL takes priority over CONTRARIAN HIT when repDelta <= 3 (D-08 priority).
 */
function getOutcomeWord(params) {
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
function getOutcomeWordResult(params) {
    var word = getOutcomeWord(params);
    // §14.1 LOCKED outcome colors — explicit hex, NOT Stamp token map (#A855F7 is wrong)
    var COLOR_MAP = {
        'CALLED IT':       '#4ADE80', // win green
        'LOUD AND WRONG':  '#F87171', // loss red
        'CONTRARIAN HIT':  '#E8F542', // accent (NOT purple #A855F7)
        'COLD CALL':       '#94A3B8', // neutral slate
        'FADED CORRECTLY': '#E8F542', // accent (same as CONTRARIAN HIT)
    };
    var LOZENGE_MAP = {
        'CALLED IT':       null,
        'LOUD AND WRONG':  null,
        'CONTRARIAN HIT':  'CONTRARIAN',
        'COLD CALL':       null,
        'FADED CORRECTLY': 'FADER WIN',
    };
    return {
        word: word,
        color: COLOR_MAP[word],
        lozenge: LOZENGE_MAP[word],
    };
}
//# sourceMappingURL=outcome-word.js.map
