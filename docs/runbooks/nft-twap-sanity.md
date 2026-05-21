# NFT TWAP Sanity-Check Runbook (OPS-18; Phase 4 fills implementation)

**Requirement:** OPS-18, CALL_IT_SPEC1.md §13.2  
**Phase:** 0 skeleton; Phase 4 populates addresses + `scripts/nft-twap-sanity-check.ts`  
**Severity:** MEDIUM — incorrect TWAP causes incorrect NFT call settlement

---

## 1. Background

NFT call settlement paths use the Alchemy NFT API (`getFloorPrice` / `getNFTSales`) to
compute a 24-hour TWAP (Time-Weighted Average Price) with ≥12 observations per spec §13.2.

The relayer's `nft-twap` KMS attestation key signs the computed TWAP before it is accepted
by the `SettlementManager` contract. If the TWAP is wrong (stale, manipulated, or computed
from too few observations), settlement results are incorrect.

This runbook covers the sanity-check procedure to verify TWAP correctness before and after
each major settlement involving an NFT call.

---

## 2. Phase 0 Skeleton: Sanity-Check Pattern

The sanity-check procedure (Phase 4 implements the actual script):

### Cross-checking against multiple sources:

1. **Alchemy `getFloorPrice`** — Primary source (used by relayer)
   ```bash
   # TODO_PHASE_4: replace collection-slug with actual collection address
   curl "https://eth-mainnet.g.alchemy.com/nft/v3/$ALCHEMY_API_KEY/getFloorPrice?collection=<slug>"
   ```

2. **Direct on-chain query** — Fallback (Reservoir API is defunct since Oct 2025)
   ```bash
   # Query recent NFT sales from the collection contract
   # TODO_PHASE_4: implement via viem getLogs on Transfer events
   cast logs \
     "Transfer(address indexed from, address indexed to, uint256 indexed tokenId)" \
     --address $NFT_COLLECTION_ADDRESS \
     --from-block $BLOCK_24H_AGO \
     --rpc-url $RPC_URL_ARBITRUM_ONE
   ```

3. **Expected TWAP check:** If |Alchemy TWAP - on-chain TWAP| > 5%, flag for operator review.

### Phase 4 implementation gate:

When `SettlementManager` NFT settlement path lands (Phase 4), the script
`scripts/nft-twap-sanity-check.ts` will:
1. Fetch 24h of Alchemy `getNFTSales` data for the target collection
2. Compute TWAP from ≥12 observations (reject if fewer)
3. Cross-check against the relayer's computed TWAP (from Better Stack logs)
4. Assert |delta| ≤ 5% (configurable threshold)
5. Log result as `nft_twap_sanity_passed` or `nft_twap_sanity_failed` Pino event

---

## 3. NFT Collection Registry (Phase 0 Skeleton)

The 6 spec'd NFT collections — addresses to be populated in Phase 4:

| Collection | Alchemy Slug | Contract Address (Arbitrum/ETH) |
|------------|-------------|--------------------------------|
| Pudgy Penguins | `pudgypenguins` | TODO_PHASE_4 |
| Milady Maker | `milady-maker` | TODO_PHASE_4 |
| Azuki | `azuki` | TODO_PHASE_4 |
| Doodles | `doodles-official` | TODO_PHASE_4 |
| Cool Cats | `cool-cats-nft` | TODO_PHASE_4 |
| Bored Ape Yacht Club | `boredapeyachtclub` | TODO_PHASE_4 |

Phase 4 executor: populate these addresses + verify each via `getFloorPrice` before deploy.

---

## 4. Observation Count Validation

Per spec §13.2, TWAP requires ≥12 price observations in the 24h window.

If fewer than 12 observations are available:
- The relayer logs `nft_twap_insufficient_observations` Pino event
- The call remains `pending_settle` until 12 observations accumulate
- If the call expires before 12 observations are reached, the `forceSettle` path
  applies (see `docs/runbooks/settlement-stuck.md`)

---

## 5. Manual Sanity Check (Phase 0 — Pre-Phase-4 script)

Until `scripts/nft-twap-sanity-check.ts` ships in Phase 4, perform this manual check
before any NFT call settlement involving >$100 USDC value:

```bash
# 1. Get 24h sales data from Alchemy (Phase 4 automates this)
ALCHEMY_URL="https://eth-mainnet.g.alchemy.com/nft/v3/$ALCHEMY_API_KEY"
curl "$ALCHEMY_URL/getNFTSales?contractAddress=$NFT_COLLECTION_ADDRESS&fromBlock=$BLOCK_24H_AGO&toBlock=latest"

# 2. Compute TWAP manually (sum of sale prices / count)
# 3. Compare against the relayer's logged TWAP value in Better Stack
# 4. If |delta| > 5%, pause settlement via:
cast send $CALL_REGISTRY_ADDRESS \
  "pause()" \
  --rpc-url $RPC_URL_ARBITRUM_ONE \
  --ledger

# 5. File dispute: docs/disputes/$(date +%Y-%m-%d)-nft-twap-dispute.md
```
