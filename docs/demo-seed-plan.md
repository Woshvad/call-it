# Sepolia Demo Seed Plan (OPS-20; Phase 6 staging input)

**Requirement:** OPS-20, CALL_IT_SPEC1.md §19.10  
**Phase:** 6 — execute during the ≥48h Sepolia staging gate  
**Success criterion:** ≥10 calls seeded across all call types, indexed by subgraph within 30s

---

## 1. Goal

Seed ≥10 calls covering all 3 call types and all 5 event subtypes on Arbitrum Sepolia
for the mandatory ≥48h staging gate (§19.10). This gives the team:
- Real transaction history to verify subgraph indexing
- Real callIds for OG card rendering tests
- Real settlement scenarios to verify the 30-retry Pyth loop
- Real follow/fade positions to verify LP payout math
- Real dispute scenarios to verify the forceSettle path

The seeding script (`scripts/seed-call.ts`) ships in Phase 6. This plan documents the
10-15 call seed specification so Phase 6 has a concrete input.

---

## 2. Call Type Matrix

### Price Target Calls (2 calls)

| Call | Asset | Target | Direction | Expiry | Stake | Conviction |
|------|-------|--------|-----------|--------|-------|------------|
| PT-1 | BTC/USD | +10% from seed price | Bull | 72h | $25 | 70% |
| PT-2 | ETH/USD | -5% from seed price | Bear | 24h | $100 | 85% |

**PT-1 specification:**
- `assetType: 'price'`
- `asset: 'BTC/USD'`
- `target: seedPrice * 1.10`
- `direction: 'above'`
- `expiry: seedTime + 72 * 3600`
- `stake: 25_000_000` (USDC 6 decimals)
- `conviction: 7000` (70.00%)
- Caller: Operator's Ledger Nano / test wallet

**PT-2 specification:**
- `assetType: 'price'`
- `asset: 'ETH/USD'`
- `target: seedPrice * 0.95`
- `direction: 'below'`
- `expiry: seedTime + 24 * 3600`
- `stake: 100_000_000` (USDC 6 decimals)
- `conviction: 8500` (85.00%)

### Spread/Vs Call (1 call)

| Call | Asset A | Asset B | Target | Expiry | Stake | Conviction |
|------|---------|---------|--------|--------|-------|------------|
| SV-1 | ETH/USD | BTC/USD | ETH outperforms by 5% | 7d | $50 | 65% |

**SV-1 specification:**
- `assetType: 'spread'`
- `assetA: 'ETH/USD'`
- `assetB: 'BTC/USD'`
- `spreadTarget: 500` (5.00% in basis points)
- `direction: 'above'` (ETH/BTC ratio increases by 5%)
- `expiry: seedTime + 7 * 24 * 3600`
- `stake: 50_000_000`
- `conviction: 6500`

### Event Calls — 5 Subtypes (5 calls)

| Call | Event Type | Target | Expiry | Stake | Conviction |
|------|-----------|--------|--------|-------|------------|
| EV-1 | Snapshot governance | ARB Snapshot proposal passes | 72h | $5 | 50% |
| EV-2 | NFT floor price | Pudgy Penguins floor < 15 ETH | 7d | $25 | 70% |
| EV-3 | CEX listing | SOL listed on new major CEX | 30d | $50 | 60% |
| EV-4 | Tally governance | Phase-specific Tally proposal passes | 24h | $5 | 55% |
| EV-5 | DefiLlama TVL | Arbitrum DeFi TVL > $5B | 7d | $100 | 75% |

**EV-1 specification (Snapshot):**
- `assetType: 'event'`
- `eventType: 'snapshot_proposal'`
- `snapshotProposalId: '<phase-6-active-arb-proposal>'`
- `resolution: 'passes'`
- `expiry: snapshotProposalEndTime + 3600`
- `stake: 5_000_000`
- `conviction: 5000`

**EV-2 specification (NFT floor):**
- `assetType: 'event'`
- `eventType: 'nft_floor'`
- `nftCollection: 'pudgypenguins'`
- `priceTarget: 15_000_000_000_000_000_000` (15 ETH in wei)
- `direction: 'below'`
- `expiry: seedTime + 7 * 24 * 3600`
- `stake: 25_000_000`
- `conviction: 7000`

**EV-5 specification (DefiLlama TVL):**
- `assetType: 'event'`
- `eventType: 'defillama_tvl'`
- `protocol: 'arbitrum'`
- `tvlTarget: 5_000_000_000` (in USD, 0 decimals)
- `direction: 'above'`
- `expiry: seedTime + 7 * 24 * 3600`
- `stake: 100_000_000`
- `conviction: 7500`

---

## 3. Seeding Procedure (Phase 6)

Phase 6 executes:
```bash
# Seed all 10 calls using scripts/seed-call.ts (Phase 6 ships this script)
pnpm tsx scripts/seed-call.ts --spec docs/seed-specs/PT-1.json --network sepolia
pnpm tsx scripts/seed-call.ts --spec docs/seed-specs/PT-2.json --network sepolia
pnpm tsx scripts/seed-call.ts --spec docs/seed-specs/SV-1.json --network sepolia
pnpm tsx scripts/seed-call.ts --spec docs/seed-specs/EV-1.json --network sepolia
pnpm tsx scripts/seed-call.ts --spec docs/seed-specs/EV-2.json --network sepolia
pnpm tsx scripts/seed-call.ts --spec docs/seed-specs/EV-3.json --network sepolia
pnpm tsx scripts/seed-call.ts --spec docs/seed-specs/EV-4.json --network sepolia
pnpm tsx scripts/seed-call.ts --spec docs/seed-specs/EV-5.json --network sepolia

# Additional edge-case calls (round out to 10+)
# SC-1: Minimum stake ($5) — tests stake validation
pnpm tsx scripts/seed-call.ts --spec docs/seed-specs/SC-min-stake.json --network sepolia
# SC-2: Maximum stake ($100) — tests cap enforcement
pnpm tsx scripts/seed-call.ts --spec docs/seed-specs/SC-max-stake.json --network sepolia
```

---

## 4. Verification Steps

After seeding, perform within 30s:

```bash
# 1. Subgraph indexes all calls
curl -X POST -H "Content-Type: application/json" \
  -d '{"query":"{ calls(orderBy: createdAt, orderDirection: desc, first: 15) { id status stake assetType } }"}' \
  $SUBGRAPH_URL_SEPOLIA
# Expected: ≥10 calls with status=live in the response

# 2. OG cards render for each callId
for CALL_ID in <callId-1> <callId-2> <callId-3>; do
  curl -o /dev/null -s -w "%{http_code}" \
    https://<vercel-preview-url>/api/og/$CALL_ID
  # Expected: 200 for each
done

# 3. Follow/fade positions: at least 3 calls have ≥1 follower
# Phase 6 seeds follow/fade positions via additional scripts

# 4. Check Telegram P0 channel for any unexpected alerts (should be silent during seeding)
```

---

## 5. 48h Staging Gate Checklist

The Sepolia staging gate (§19.10) requires ≥48h with:

- [ ] All 10+ seeded calls visible in subgraph
- [ ] At least 1 call reaches expiry and settles successfully (pick PT-2 at 24h expiry)
- [ ] At least 1 follow + 1 fade position created and settled
- [ ] At least 1 dispute raised + resolved (operator creates + resolves)
- [ ] At least 1 caller exit (exits from a live call position)
- [ ] OG cards render for all 5 card variants: Live, Settled, Duel Settled, Caller Exited, Fallback
- [ ] All 5 Better Stack dashboards show real (non-synthetic) data points
- [ ] No P0 Telegram alerts during the 48h window
- [ ] Smoke test checklist §19.11 completed (20-minute checklist)
