# Deferred Items — quick-260611-if0

## Below-target direction → contracts v2

**Deferred:** "Price closes BELOW X" calls (downside direction) cannot ship in v1.

**Why:** The deployed v1 contracts are immutable and settle price-target calls
strictly as at-or-above:

```solidity
// packages/contracts/src/SettlementManager.sol:713-722
if (currentPrice >= target) → CallerWon; else → CallerLost;
```

There is NO direction field anywhere on-chain — not in the CallRegistry create
path (`CreateCallInput` has no `direction`), not in SettlementManager's settle
branch. A below-target call would require a contracts-v2 change:

1. A direction field threaded through the CallRegistry create path (struct +
   event + ABI change), and
2. A `below` branch in SettlementManager's price-target settle
   (`currentPrice <= target → CallerWon`).

Both contracts are deployed + immutable on the canonical Sepolia cluster, so
this is structurally impossible to retrofit in v1.

**v1 honesty mitigation (shipped in this quick task):**

- Composer Price Target field now states the win condition explicitly:
  "Wins if price closes at or above target at the deadline."
  (`apps/web/app/new/components/PriceTargetFields.tsx`, token-styled mono helper)
- The +pct quick-pick chips intentionally expose ONLY upside targets
  (+10/+20/+50/+100); the deferral anchor comment
  "Below-target direction is a contracts-v2 feature — SettlementManager v1
  settles >= only (SettlementManager.sol:718)" is pinned at both chip-math
  sites (`PriceTargetFields.tsx` TARGET_CHIP_PCTS,
  `apps/web/app/new/lib/hermes-price.ts` computeChipTarget) and at the form
  schema (`apps/web/app/new/lib/web-call-schema.ts`).
- Composer receipt preview renders `≥` (matching the server-built receipt
  lines, e.g. "ETH ≥ $1,000,000") so the relation is unambiguous before signing.

**Origin:** quick-260611-hog finding (1) — direction honesty.
