/**
 * settled-enrichment.ts — additive settledAt/repDelta/finalPct merge for the
 * Settled tape card (quick-260611-tbc).
 *
 * Runs AFTER enrichFeedItems (call-enrichment.ts) so the records already carry
 * the real on-chain `marketType` and the 1e8-scale `targetValue` string
 * (omitted for Event markets — WR-04). One batched subgraph query per page via
 * querySettledFeedFields (circuit-breaker routed, fail-safe empty Map).
 *
 * CONTRACT (mirrors enrichFeedItems): NEVER throws, NEVER blocks the feed —
 * any failure returns the input items UNCHANGED. Absent fields degrade the
 * settled card (D-07 honesty), they are never fabricated.
 */

import { getLogger } from './logger.js';
import { querySettledFeedFields } from './subgraph-client.js';

/**
 * Enrich settled/disputed feed items ADDITIVELY with:
 *   - `settledAt` (unix seconds, Settlement.settledAt) — when present
 *   - `repDelta` (signed int, the CALLER's latest RepEvent.delta) — when present
 *   - `finalPct` — ONLY under the verified marketType-0 derivation below
 *
 * finalPct SEMANTICS (verified against contract source at planning time):
 * SettlementManager.sol:713-723 — the Pyth rail computes
 * `priceDelta = currentPrice - target` where the comment at SM:714 pins
 * "targetValue stored in same units as Pyth price (8-decimal form, expo=-8)".
 * Both operands are 1e8-scale, so
 *   finalPct = priceDelta / targetValue × 100
 * is the signed % by which the final price landed past(+)/short(−) of the
 * target. Positive ⇔ CallerWon (SM:719 wins on currentPrice >= target).
 *
 * marketTypes 1/2 are NEVER given a finalPct: governance attestations carry
 * priceDelta = 0 (snapshot-adapter.ts:279 / tally-adapter.ts:306) which would
 * render a fake 0%, and value adapters use adapter-unit targets — no single
 * truthful final-vs-target % exists for those markets (D-07: a number whose
 * semantics aren't verified is never shipped).
 */
export async function enrichSettledFeedItems(items: unknown[]): Promise<unknown[]> {
  try {
    // Collect settled/disputed items (wire status is TitleCase — compare
    // lowercased) that carry a usable id + caller.
    const targets: Array<{ id: string; caller: string }> = [];
    for (const item of items) {
      if (item === null || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const status = typeof rec['status'] === 'string' ? rec['status'].toLowerCase() : '';
      if (status !== 'settled' && status !== 'disputed') continue;
      const id = rec['id'];
      if (typeof id !== 'string' && typeof id !== 'number') continue;
      if (typeof rec['caller'] !== 'string') continue;
      targets.push({ id: String(id), caller: rec['caller'] });
    }
    if (targets.length === 0) return items;

    // ONE batched query (breaker-routed; fail-safe empty Map — never throws).
    const fields = await querySettledFeedFields(targets);
    if (fields.size === 0) return items;

    return items.map((item) => {
      if (item === null || typeof item !== 'object') return item;
      const rec = item as Record<string, unknown>;
      const f = fields.get(String(rec['id']));
      if (!f) return item;

      // finalPct ONLY when ALL hold: enriched marketType === 0 (PriceTarget),
      // enriched targetValue parses to BigInt > 0, priceDelta parses to BigInt.
      let finalPct: number | undefined;
      if (rec['marketType'] === 0 && typeof rec['targetValue'] === 'string' && f.priceDelta !== null) {
        try {
          const target = BigInt(rec['targetValue']);
          const delta = BigInt(f.priceDelta); // parse-validate; math in Number for the 1-dp %
          if (target > 0n) {
            void delta;
            finalPct =
              Math.round((Number(f.priceDelta) / Number(rec['targetValue'])) * 1000) / 10;
          }
        } catch {
          // non-parseable inputs — omit finalPct, never guess
        }
      }

      return {
        ...rec,
        ...(f.settledAt !== null ? { settledAt: f.settledAt } : {}),
        ...(f.repDelta !== null ? { repDelta: f.repDelta } : {}),
        ...(finalPct !== undefined ? { finalPct } : {}),
      };
    });
  } catch (err) {
    // NEVER throws — mirror call-enrichment.ts's graceful-degradation contract.
    getLogger().warn(
      { event: 'settled_enrichment_failed', err: String(err) },
      'Settled feed enrichment failed — items returned unchanged',
    );
    return items;
  }
}
