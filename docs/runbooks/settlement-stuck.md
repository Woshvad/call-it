# Settlement-Stuck Runbook (OPS-14, OPS-15)

**Requirement:** OPS-14 (`settle_stuck_25m`), OPS-15, CALL_IT_SPEC1.md §13.7  
**Trigger:** P1 Telegram alert `settle_stuck_25m` with `{ callId, expiry, assetType }`  
**Severity:** MEDIUM — stuck settlement blocks LP payout and caller reputation scoring

---

## 1. Background

A settlement is "stuck" when a call is past-expiry but `settle()` has not succeeded within 25 minutes.
Common causes:
- Pyth price feed confidence interval too wide (>0.5% per spec §13.1): 30 retries × 60s = 30min max
- RPC timeout during the 30-retry Pyth loop
- Contract revert (e.g., USDC transfer failure, reentrancy guard hit)
- Out-of-gas: `settle()` is complex — approximately 300K gas
- Subgraph indexing lag: relayer has the settlement result but subgraph hasn't indexed yet

The `forceSettle` escape hatch unlocks at **expiry + 7 days** (spec §13.7). Use it only as a last resort.

**This runbook documents concrete steps (cast commands, GraphQL queries) — not placeholders.**

---

## 2. Step 1: Query Subgraph for the Stuck Call

```graphql
# Exact GraphQL query — run against the Studio endpoint
# Replace <now-1500> with current Unix timestamp - 1500 (25 minutes ago)
{
  calls(where: { status: "pending_settle", expiry_lt: <now-1500> }) {
    id
    caller
    asset
    expiry
    status
    stake
    assetType
  }
}
```

**Studio endpoint:**
- Sepolia: `https://api.studio.thegraph.com/query/<id>/call-it-sepolia/v0.0.1`
- Mainnet: `https://api.studio.thegraph.com/query/<id>/call-it-mainnet/v0.0.1`

Or via curl:
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"{ calls(where: { status: \"pending_settle\", expiry_lt: '$(( $(date +%s) - 1500 ))' }) { id caller asset expiry status } }"}' \
  $SUBGRAPH_URL
```

Note the stuck `callId` from the response.

---

## 3. Step 2: Diagnose via Better Stack `failed-tx-rate` Dashboard

1. Open Better Stack → Dashboards → **Failed Tx Rate**
2. Filter by `callId == <stuckId>` using the widget's search field
3. Inspect `errorType` field to classify:

| Error Type | Diagnosis | Action |
|------------|-----------|--------|
| `pyth_confidence_wide` | Price feed confidence > 0.5% | Wait for confidence to narrow; check Pyth docs for feed status |
| `rpc_timeout` | Alchemy RPC timeout during retry loop | Check Alchemy dashboard for outage; retry manually |
| `contract_revert` | `settle()` reverted on-chain | Check revert reason via `cast call` (below) |
| `out_of_gas` | Transaction OOG | Retry with higher gas (`--gas-limit 500000`) |
| `nft_insufficient_obs` | NFT TWAP < 12 observations | Wait for more sales data; see nft-twap-sanity.md |
| `other` | Unknown | Check relayer logs in Better Stack for full stack trace |

**Check revert reason:**
```bash
# Simulate the settlement to get revert reason
cast call $SETTLEMENT_MANAGER_ADDRESS \
  "settle(uint256)" \
  <callId> \
  --rpc-url $RPC_URL_ARBITRUM_ONE
# Error output will show the revert reason string
```

**Check Pyth confidence:**
```bash
# Query current Pyth price + confidence for the stuck asset
cast call $PYTH_CONTRACT_ADDRESS \
  "getPriceNoOlderThan(bytes32,uint256)" \
  <PYTH_FEED_ID> \
  60 \
  --rpc-url $RPC_URL_ARBITRUM_ONE
# Output: { price: int64, conf: uint64, expo: int32, publishTime: uint256 }
# Confidence check: conf * 200 <= price (per spec §13.1)
```

---

## 4. Step 3: Trigger `forceSettle` After 7-Day Cooldown

**Use only if:** The call has been stuck for > 7 days AND normal `settle()` continues to fail.

Per spec §13.7, `forceSettle` bypasses oracle checks and settles at the last available
price from the Pyth feed (not necessarily the most recent). It is the "escape hatch" for
truly stuck markets.

```bash
# Verify the 7-day window has passed
CALL_EXPIRY=$(cast call $SETTLEMENT_MANAGER_ADDRESS \
  "getCall(uint256)" <callId> \
  --rpc-url $RPC_URL_ARBITRUM_ONE | grep expiry | awk '{print $2}')

FORCE_SETTLE_UNLOCK=$(( CALL_EXPIRY + 7 * 86400 ))
NOW=$(date +%s)

if [ $NOW -lt $FORCE_SETTLE_UNLOCK ]; then
  echo "Too early: forceSettle unlocks at $(date -d @$FORCE_SETTLE_UNLOCK)"
  exit 1
fi

# Execute forceSettle (requires owner key — deployer Ledger in Phase 0-5; multisig in Phase 6+)
cast send $SETTLEMENT_MANAGER_ADDRESS \
  "forceSettle(uint256)" \
  <callId> \
  --rpc-url $RPC_URL_ARBITRUM_ONE \
  --ledger \
  --mnemonic-derivation-path "m/44'/60'/0'/0/0"

# Expected output:
# Transaction hash: 0x...
# Receipt: status 1 (success)
```

**Verify settlement:**
```bash
cast call $SETTLEMENT_MANAGER_ADDRESS \
  "getCall(uint256)" <callId> \
  --rpc-url $RPC_URL_ARBITRUM_ONE
# Should show: status = force_settled
```

---

## 5. Document the Incident

Per spec §18.7, every forced settlement is public:
```bash
mkdir -p docs/disputes
cat > docs/disputes/$(date +%Y-%m-%d)-settle-stuck-<callId>.md << 'EOF'
# Settlement Stuck — $(date +%Y-%m-%d) — callId: <callId>

## Timeline
- Expiry: [datetime]
- settle_stuck_25m alert: [datetime]
- Diagnosis: [errorType from Better Stack]
- forceSettle executed: [datetime or N/A]
- forceSettle tx: [0x... or N/A]

## Root Cause
[Description of why settle() failed]

## Resolution
[forceSettle / normal settle after Pyth confidence narrowed / other]
EOF

git add docs/disputes/ && git commit -m "docs: settlement-stuck incident $(date +%Y-%m-%d) callId=<callId>"
```
