/**
 * useDuelEnrichment — one-shot, capped per-duel live-state enrichment for the
 * duels surfaces (quick-260611-ust).
 *
 * ONE burst of fetchDuelEnrichment calls per id-set (keyed on the joined
 * SORTED challengeIds so new array identities never refire the effect), then
 * done. NO polling primitives of any kind in this file — the relayer caches
 * duel live-state at 4s and this is a browse surface; the only interval timer
 * in the whole duels feature is DuelCard's 1s countdown tick.
 *
 * D-07: failures are silently ABSENT from the returned Map — the consuming
 * card degrades to wire-only fields, never fakes the enriched ones.
 */

'use client';

import { useEffect, useState } from 'react';
import {
  fetchDuelEnrichment,
  type DuelEntry,
  type DuelEnrichment,
} from '@/lib/duels-client';

// Cap: the /api/duels route returns ≤50 by default limit; enriching only the
// first 20 keeps the one-shot request burst bounded. Per-duel failures are
// silent by design — a missing Map entry means the card hides the enriched
// blocks and renders wire-only fields (D-07 degrade contract).
const ENRICHMENT_CAP = 20;

export function useDuelEnrichment(
  duels: DuelEntry[] | null,
): Map<string, DuelEnrichment> {
  const [map, setMap] = useState<Map<string, DuelEnrichment>>(() => new Map());

  // Stable string key from the SORTED first-N challengeIds — a new duels array
  // identity with the same ids must NOT refire the effect.
  const idKey =
    duels === null || duels.length === 0
      ? ''
      : duels
          .slice(0, ENRICHMENT_CAP)
          .map((d) => d.challengeId)
          .sort()
          .join(',');

  useEffect(() => {
    if (idKey === '') return; // null/empty input → empty Map, no requests
    let cancelled = false;
    const ids = idKey.split(',');
    // fetchDuelEnrichment never throws (null on failure) → Promise.all is safe.
    void Promise.all(
      ids.map(async (id) => ({ id, enrichment: await fetchDuelEnrichment(id) })),
    ).then((results) => {
      if (cancelled) return;
      const next = new Map<string, DuelEnrichment>();
      for (const r of results) {
        if (r.enrichment !== null) next.set(r.id, r.enrichment);
      }
      setMap(next);
    });
    return () => {
      cancelled = true;
    };
  }, [idKey]);

  return map;
}
