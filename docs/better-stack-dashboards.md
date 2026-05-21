# Better Stack Dashboard Configuration (OPS-06; D-14)

**Access control: per D-17 these dashboards are PRIVATE to operator + co-signers only — DO NOT enable public sharing.**

**Platform:** Better Stack → Dashboards → New Dashboard  
**Log source:** Pino structured logs from `apps/relayer` (via `@logtail/pino` transport)  
**Logtail source token:** `BETTERSTACK_SOURCE_TOKEN` in GCP Secret Manager  

---

## Access Control (D-17)

After creating each dashboard:
1. Better Stack → Dashboards → Select Dashboard → Settings → Sharing
2. Set to: **Team only** (not public, not link-sharing)
3. Add team members: operator + all 3 multisig co-signers
4. **Never** enable "Public status page" for any of these dashboards

---

## Dashboard 1: Total TVL

**Purpose:** Monitor combined TVL across all 3 contracts to detect TVL_CAP approach (Pitfall 3)

**Data source filter:**
```
event:tvl_snapshot AND synthetic:false
```
(Remove `synthetic:false` to include seed data while dashboards are bootstrapping)

**Widget config:**
- Type: Line chart
- Y-axis: `totalTvl` (numeric field, unit: USDC)
- Time range: Last 24 hours
- Aggregation: Latest value per 5-minute bucket
- Series: One line per source field:
  - `callRegistryTvl` — blue
  - `followFadeMarketTvl` — green
  - `challengeEscrowTvl` — orange
  - `totalTvl` (sum) — red (thicker line)

**Alert threshold:**
- If `totalTvl > 0.9 * TVL_CAP_INITIAL_USDC` (= 0.9 × 5000 = $4,500 USDC):
  - Alert fires via relayer P1 path (`tvl_approach` event) — NOT directly from Better Stack
  - Better Stack widget shows a red horizontal line at $4,500 for visual reference
  - Alert is NOT configured in Better Stack directly (to avoid double-alerting)

**Seed data:** Run `pnpm tsx scripts/fire-synthetic-alert.ts --seed-dashboards` to inject:
```json
{ "event": "tvl_snapshot", "totalTvl": 1250.0, "callRegistryTvl": 800.0, 
  "followFadeMarketTvl": 350.0, "challengeEscrowTvl": 100.0, "synthetic": true }
```

---

## Dashboard 2: Calls/Hour

**Purpose:** Track prediction market activity; detect unusual activity spikes or drops

**Data source filter:**
```
event:call_created
```

**Widget config:**
- Type: Bar chart
- Y-axis: Count (number of events per time bucket)
- Time range: Last 7 days
- Aggregation: COUNT per 1-hour bucket
- No secondary series

**Alert threshold:** None (informational only — activity monitoring)

**Expected range in Phase 1 (Sepolia):** 0–5 calls/hour (operator + testers)  
**Expected range in Phase 7 (mainnet public):** 10–100 calls/hour (spike alerts TBD in Phase 7)

**Seed data:** Run `--seed-dashboards`:
```json
{ "event": "call_created", "callId": "synthetic-001", "asset": "BTC/USD", 
  "stake": 25.0, "synthetic": true }
```

---

## Dashboard 3: Settlement Latency

**Purpose:** Detect settle_stuck cases before the 25-min threshold triggers the P1 alert

**Data source filter:**
```
event:call_settled
```

**Widget config:**
- Type: Line chart with percentile lines
- Y-axis: `settleLatencyMs` (milliseconds; derived from `settledAt - expiry` in the relayer)
- Time range: Last 24 hours
- Aggregation: Three series:
  - p50 (median) — green
  - p95 — orange
  - p99 — red

**Alert threshold:**
- If p95 `settleLatencyMs` > 1,500,000 ms (25 minutes):
  - The relayer already fires `settle_stuck_25m` P1 alert at this threshold
  - Better Stack shows a red horizontal line at 1,500,000 ms for visual context
  - Alert NOT configured directly in Better Stack (handled by relayer)

**Seed data:** Run `--seed-dashboards`:
```json
{ "event": "call_settled", "callId": "synthetic-001", "settleLatencyMs": 900000,
  "settledAt": 1748000000, "expiry": 1747999100, "synthetic": true }
```

---

## Dashboard 4: Dispute Rate

**Purpose:** Monitor dispute frequency as a governance-attack signal

**Data source filter:**
```
event:dispute_raised
```

**Widget config:**
- Type: Bar chart + line overlay
- Y-axis: Count per day (bars) + rolling 7-day dispute rate % (line)
- Dispute rate % = (disputes / settled_calls) × 100 per day
  - Note: settled_calls count comes from `event:call_settled`; this requires a derived metric
  - In Better Stack: create a calculated metric: `count(dispute_raised) / count(call_settled) * 100`
- Time range: Last 30 days
- No alert threshold in Phase 0 (baseline not yet established)

**Phase 1 target:** Dispute rate < 5% (flag for governance review if sustained >10%)

**Seed data:** Run `--seed-dashboards`:
```json
{ "event": "dispute_raised", "callId": "synthetic-001", 
  "disputeType": "price_confidence", "synthetic": true }
```

---

## Dashboard 5: Failed Tx Rate

**Purpose:** Detect relayer errors and classify by type for on-call triage

**Data source filter:**
```
level:error AND component:relayer
```

**Widget config:**
- Type: Bar chart (stacked by error type)
- Y-axis: Count per 1-hour bucket
- Aggregation: COUNT per `errorType` field value, stacked:
  - `pyth_confidence_wide` — yellow
  - `rpc_timeout` — orange
  - `contract_revert` — red
  - `out_of_gas` — purple
  - `other` — grey

**Alert threshold:**
- If total error count > 10 per hour → send Better Stack notification to operator email
- **Configure in Better Stack:** Alerts → New Alert → Better Stack Notification
  - Metric: `count(level:error AND component:relayer)` per 1-hour window > 10
  - Delivery: Email to operator (Better Stack has built-in email alerting)
  - Note: This is in ADDITION to the relayer's Telegram P0/P1 alerts — double coverage for error spikes

**Seed data:** Run `--seed-dashboards`:
```json
{ "level": "error", "component": "relayer", 
  "errorType": "pyth_confidence_wide", "callId": "synthetic-001", "synthetic": true }
```

---

## Bootstrapping the Dashboards

### One-time setup:
1. Create a Better Stack account at betterstack.com → Logs
2. Create a new Logtail source → Copy the `sourceToken`
3. Set `BETTERSTACK_SOURCE_TOKEN` in GCP Secret Manager + Fly secrets
4. Deploy the relayer (Plan 00-05) → Pino logs start flowing to Better Stack
5. Create 5 dashboards per the specs above
6. Run `pnpm tsx scripts/fire-synthetic-alert.ts --seed-dashboards` to inject test data
7. Verify each dashboard shows the synthetic data point
8. Set each dashboard access to "Team only" (D-17)

### Ongoing:
- Phase 1+: Real `call_created`, `call_settled`, `dispute_raised`, `tvl_snapshot` events replace synthetic data
- The dashboards auto-update as Pino logs flow in — no widget reconfiguration needed
- Weekly: Operator reviews trends and adjusts alert thresholds if needed

---

## Maintenance

Better Stack dashboard config is documented here (not as code) because:
- Better Stack does not have a stable config-as-code API in 2026 for the free tier
- Dashboard IDs are environment-specific and short-lived
- The documented widget specs above serve as the "source of truth" for recreation

If dashboards are accidentally deleted: recreate using the specs above and re-run
`scripts/fire-synthetic-alert.ts --seed-dashboards` to restore synthetic baseline data.
