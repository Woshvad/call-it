---
phase: quick
id: 260611-t7h
status: complete
commits:
  - d0e3161
---

# SUMMARY — feed tabs restored + asset-class filter chips

(Authored by the orchestrator: the executor committed d0e3161 then lost its
connection before writing this file; gates were re-run and verified by the
orchestrator afterward.)

## What changed

- **apps/web/app/page.tsx** — FeedTab widened to Live/Settled/Following/Duels;
  prototype tab row with `.count` chips (Live/Settled = loaded filtered
  lengths; Duels = real /api/duels count rendered only post-fetch-success;
  Following = NO count — the prototype's 12 was fake, D-07). One-shot
  /api/duels fetch (8s abort, null on failure) feeding compact DuelTabRow
  links to /duel/{challengeId}; empty/failed → dashed "NO LIVE DUELS IN YOUR
  GRAPH." block. Following tab hosts FromYourNetworkSections with the dashed
  "QUIET HERE." fallback; the old Live-branch render is deleted (Live = pure
  tape). Chip row (Live+Settled only): All/Majors/DeFi/L2s/Memecoins/
  Arbitrum Eco/Restaking filtering via assetMatchesChip; chip-empty state is
  a mono "NO {CHIP} CALLS ON THE TAPE." line, distinct from EmptyTape.
  Header comment documents the 09.2 D-08 cut supersession (user request
  2026-06-11) + asset-class (not on-chain category) semantics.
- **apps/web/lib/asset-class.ts** (new) — ASSET_CLASS_CHIPS (7) +
  assetMatchesChip membership test (ARB in both L2s and Arbitrum Eco;
  unmapped/missing symbol matches All only; case-insensitive). NFTS/MACRO cut
  per D-08 (no matching call types exist in v1 data).
- **apps/web/app/components/FromYourNetworkSections.tsx** — optional
  `fallback` prop rendered when both sections hide (sole behavior change).
- **apps/web/tests/feed-tabs-chips.test.ts** (new) — source pins (4 tabs,
  duels wiring, following fallback + Live-branch removal, chip gating) +
  real-module unit pins for the asset-class map.

## Gates (orchestrator-verified post-commit)

- `pnpm --filter @call-it/web build` → exit 0
- `pnpm --filter @call-it/web exec vitest run` → 276/276 passed
  (status-normalization + presentation-sweep pins green)

## Deviations

- Executor socket dropped twice (after Tasks 1-2, then after the commit);
  resumed once via a fresh agent; SUMMARY.md written by the orchestrator.
