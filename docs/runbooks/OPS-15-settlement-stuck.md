# OPS-15: Settlement-Stuck Runbook

**Requirement:** OPS-15, SETTLE-38, CALL_IT_SPEC1.md §13.7
**Trigger:** `settlement_stuck_25m` Telegram alert fires when `settle()` has not confirmed within 25 minutes of a call's expiry
**Severity:** MEDIUM — stuck settlement blocks LP payout, caller reputation scoring, and share card issuance

---

## Background

A call is "stuck" when it passes expiry but `settle()` has not succeeded within 25 minutes. Common causes:

- Pyth price feed confidence interval too wide (>0.5% per spec §13.1): 30 retries x 60s = 30min max before auto-timeout
- SettlementManager ETH balance too low for Pyth VAA update fee (Pitfall 4)
- RPC timeout or provider outage during the 30-retry loop
- Relayer process crashed or job queue stuck in BullMQ
- Contract revert (e.g., call already settled, pause active)

The `forceSettle` escape hatch unlocks at **expiry + 7 days** (`FORCE_SETTLE_COOLDOWN`). Use it ONLY as a last resort after the 24h public dispute commitment (SETTLE-35, D-07 / Pitfall 6).

---

## Step 1: Identify the Call and Oracle Adapter

```bash
# 1a. Get the stuck callId from the Telegram alert payload: { callId, expiry, assetType }
export CALL_ID=<callId_from_alert>

# 1b. Check relayer logs in Better Stack for the callId
# Look for: event='settlement_watcher_tick', event='settle_failed', or event='pyth_confidence_wide'
# This identifies which oracle adapter is in use (Pyth vs. relayer-attested path)

# 1c. Query the call status on-chain
cast call $CALL_REGISTRY_ADDRESS \
  "getCall(uint256)(uint256,address,uint8,uint8,uint96,uint64,uint64,uint8)" \
  $CALL_ID \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
# Output includes: status (0=Live, 1=Settled, 2=Disputed, 3=CallerExited)
# If status=1, settlement already succeeded -- false alarm or subgraph lag
```

---

## Step 2: Check ETH Balance on SettlementManager (Pitfall 4)

```bash
# Pyth VAA update fees require ETH in SettlementManager.
# Minimum safe balance: 0.01 ETH (approximately 20-50 VAA updates depending on gas price)
cast balance $SETTLEMENT_MANAGER_ADDRESS --rpc-url $ARBITRUM_SEPOLIA_RPC_URL

# If balance < 0.005 ETH: top up immediately
# The deployer/owner key sends ETH to SM's receive() payable function
cast send $SETTLEMENT_MANAGER_ADDRESS \
  --value 0.1ether \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY

# Verify new balance
cast balance $SETTLEMENT_MANAGER_ADDRESS --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
# Expected: >= 100000000000000000 (0.1 ETH in wei)
```

---

## Step 3: Check SettlementDelayed Events for the Call

```bash
# Look for SettlementDelayed(callId, reason, retryAt) events on Arbiscan
# or via cast:
cast logs \
  --from-block "$(( $(cast block-number --rpc-url $ARBITRUM_SEPOLIA_RPC_URL) - 1000 ))" \
  --address $SETTLEMENT_MANAGER_ADDRESS \
  "SettlementDelayed(uint256 indexed,string,uint256)" \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL | grep -A5 $CALL_ID

# SettlementDelayed reason values:
#   "pyth_confidence_wide"  -> Price feed confidence > 0.5%; wait for Pyth to narrow
#   "oracle_not_ready"      -> Relayer attestation not yet submitted
#   "call_not_expired"      -> Edge case: block timestamp race
```

---

## Step 4: Handle Pyth Confidence-Wide

If relayer logs show `pyth_confidence_wide`:

```bash
# Check current Pyth price and confidence for the stuck call's asset
# Use the feed ID from packages/shared/src/constants/pyth-feeds.ts
# Confidence check: conf * 200 <= price (per spec §13.1)
cast call $PYTH_ARBITRUM_SEPOLIA \
  "getPriceNoOlderThan(bytes32,uint256)((int64,uint64,int32,uint256))" \
  <PYTH_FEED_ID> \
  60 \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
# Output: { price: int64, conf: uint64, expo: int32, publishTime: uint256 }
# If conf * 200 > price: confidence still too wide -- wait and retry
```

Pyth confidence is typically wide during high-volatility periods. The relayer auto-retries 30 times x 60s. If all 30 retries fail, the call enters the 24h dispute window automatically (SettlementDelayed event emitted).

If still wide after 30 retries, proceed to dispute window:
- The 24h dispute window opens automatically
- Users can raise a dispute via the UI with evidence
- Owner resolves after the window (see dispute runbook)

---

## Step 5: Restart Relayer and Re-Enqueue Settlement Job

If relayer process crashed or BullMQ job is stuck:

```bash
# Check relayer status (Fly.io)
flyctl status --app call-it-relayer-sepolia

# Restart if unhealthy
flyctl restart --app call-it-relayer-sepolia

# Re-enqueue the settlement job via the relayer's manual endpoint
# (POST /api/settle/:callId forces the job into the BullMQ queue)
curl -X POST \
  -H "Content-Type: application/json" \
  "$RELAYER_URL/api/settle/$CALL_ID"

# Verify job was enqueued (check relayer logs for: event='settle_job_enqueued')
```

---

## Step 6: Emergency forceSettle (Last Resort)

**Use ONLY if:**
1. The call has been stuck for > 7 days (FORCE_SETTLE_COOLDOWN elapsed from expiry)
2. Normal `settle()` continues to fail after multiple attempts
3. **24h public commitment made on /disputes/ page first (SETTLE-35, D-07, Pitfall 6)**

Dispute reversal note: reversal via `resolveDispute()` applies ONLY to unclaimed funds. If users have already claimed their payout before a dispute reversal, the reversal is partial -- SM redistributes only the unclaimed portion (SETTLE-35). Always check claims before reverting.

```bash
# Verify the 7-day force-settle cooldown has passed
CALL_EXPIRY=$(cast call $CALL_REGISTRY_ADDRESS \
  "getCall(uint256)(uint256,address,uint8,uint8,uint96,uint64,uint64,uint8)" \
  $CALL_ID \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL | awk 'NR==6{print $1}')
# (adjust field index to match getCall() return tuple position for expiry)

FORCE_SETTLE_UNLOCK=$(( CALL_EXPIRY + 7 * 86400 ))
NOW=$(date +%s)

if [ $NOW -lt $FORCE_SETTLE_UNLOCK ]; then
  echo "Too early: forceSettle unlocks at $(date -d @$FORCE_SETTLE_UNLOCK 2>/dev/null || date -r $FORCE_SETTLE_UNLOCK)"
  echo "STOP: Post the 24h public commitment on /disputes/ and wait for the unlock time."
  exit 1
fi

# Post 24h public commitment on /disputes/ page before executing
# (public dispute log URL: $NEXT_PUBLIC_APP_URL/disputes/)

# Execute forceSettle (owner-only)
cast send $SETTLEMENT_MANAGER_ADDRESS \
  "forceSettle(uint256)" \
  $CALL_ID \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY

# Verify: check for CallForceSettled(callId, outcome) event on Arbiscan
```

---

## Step 7: Dispute Window Flow

If a dispute was raised (`DisputeRaised` event on SM):

```bash
# Check dispute status
cast call $SETTLEMENT_MANAGER_ADDRESS \
  "disputes(uint256)(address,bytes32,uint256,uint256,uint8,uint8)" \
  $CALL_ID \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
# Output: (disputer, evidenceHash, bondAmount, windowCloseAt, status, counterClaimCount)
# status: 0=Open, 1=Resolved
```

Dispute resolution timeline:
1. User raises dispute (24h window opens, `windowCloseAt = block.timestamp + 24h`)
2. Other users can counter-claim (max 3 counter-claims)
3. After 24h window, owner reviews evidence and calls `resolveDispute(callId, finalOutcome)`
4. Rep deltas are reversed if outcome changes; USDC redistributed from old winner to new winner

Notify the disputing user that the 24h resolution window is active and they can track status at `$NEXT_PUBLIC_APP_URL/disputes/`.

---

## Incident Documentation

```bash
# Create incident log (public commitment per spec §18.7)
mkdir -p docs/disputes
cat > "docs/disputes/$(date +%Y-%m-%d)-settlement-stuck-callId-${CALL_ID}.md" << 'INCIDENTEOF'
# Settlement Stuck Incident

## Call ID: <callId>
## Date: <YYYY-MM-DD>

### Timeline
- Expiry: [datetime]
- settlement_stuck_25m alert: [datetime]
- Diagnosis: [oracle_adapter + errorType from relayer logs]
- Resolution: [normal settle after pyth narrowed / relayer restart / forceSettle / dispute]
- Resolved at: [datetime]

### Root Cause
[Description]

### Actions Taken
[Commands run, outcomes]

### Outcome
[Final call status + outcome]
INCIDENTEOF

git add docs/disputes/ && git commit -m "docs(ops): settlement-stuck incident $(date +%Y-%m-%d) callId=${CALL_ID}"
```

---

*Phase 4 -- SettlementManager wired. OPS-15 written alongside DeployPhase4.s.sol (plan 04-03).*
*forceSettle cooldown: FORCE_SETTLE_COOLDOWN = 7 days from expiry.*
*Dispute reversal note: applies only to unclaimed funds (SETTLE-35).*
