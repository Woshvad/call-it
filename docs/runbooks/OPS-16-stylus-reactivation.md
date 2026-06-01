# OPS-16: Stylus Engine Reactivation Runbook

**Requirement:** OPS-16, CALL_IT_SPEC1.md §11.6
**Trigger:** `RepCalculatedFallback` Telegram alert fires when the Stylus engine call reverts unexpectedly (Phase 5+)
**Severity:** HIGH -- Stylus WASM deactivation causes all rep calculations to fall back to the Solidity baseline, triggering P0 alerts and degraded (but functional) rep scoring

---

## Background

Stylus WASM programs on Arbitrum expire approximately **365 days** after their last activation. After expiration:
- `arbitrumActivationExpiry()` returns a timestamp in the past
- The WASM program stops executing
- `SettlementManager.settle()` step 8 catches the revert via IStylusScoreEngine try/catch
- `RepCalculatedFallback` is emitted instead of `RepCalculated`
- The Solidity baseline rep delta (`_solidityBaselineRepDelta`) is used as fallback

The Solidity baseline is functional but lower-fidelity than the Stylus engine (linear confidence scale, fixed contrarian=1.0, no high-conviction 2x asymmetry per REP-22). Re-activation restores full-fidelity rep scoring.

**Phase 3 note:** If Phase 5 (Stylus deployment) has not yet been deployed, `SettlementManager.stylusScoreEngine` is `address(0)` and `RepCalculatedFallback` NEVER fires (the try/catch seam is only active when `stylusScoreEngine != address(0)`). OPS-16 applies only after Phase 5 deploys the Stylus engine.

**Two independent alert systems (calendar reminders):**
1. T-30d, T-15d, T-7d, T-1d Telegram alerts (wired in Phase 0 via `stylus-deactivation-watcher.ts`)
2. Google Calendar events at the same intervals (created by `scripts/seed-calendar.ts`)

Both alert belts must fail before the reactivation window is missed.

---

## Step 1: Verify Stylus Program Activation Status

```bash
# Get the Stylus engine address from SettlementManager
export STYLUS_ENGINE_ADDRESS=$(cast call $SETTLEMENT_MANAGER_ADDRESS \
  "stylusScoreEngine()(address)" \
  --rpc-url $ARB_ONE_RPC_URL)

echo "Stylus engine address: $STYLUS_ENGINE_ADDRESS"

# Check activation expiry
cast call $STYLUS_ENGINE_ADDRESS \
  "arbitrumActivationExpiry()(uint256)" \
  --rpc-url $ARB_ONE_RPC_URL
# Convert to human date: date -d @<timestamp> (Linux) or date -r <timestamp> (macOS)

# Check if program is currently activated
cargo stylus check \
  --address $STYLUS_ENGINE_ADDRESS \
  --endpoint $ARB_ONE_RPC_URL
# If output shows "Program is not activated" or "Program is expired": proceed to reactivation
```

---

## Step 2: Check Phase 5 Deployment Status

If Phase 5 has NOT yet been deployed (no Stylus engine at a real address):

```bash
# Confirm stylusScoreEngine is address(0)
cast call $SETTLEMENT_MANAGER_ADDRESS \
  "stylusScoreEngine()(address)" \
  --rpc-url $ARB_ONE_RPC_URL
# If result is 0x0000000000000000000000000000000000000000:
# Phase 5 not yet deployed -- no action needed
# RepCalculatedFallback fires only when stylusScoreEngine != address(0)
# SettlementManager is already using the Solidity baseline -- this is normal operation
echo "Phase 5 not yet deployed. SettlementManager is on Solidity baseline. No action required."
exit 0
```

---

## Step 3: Reactivate the Stylus Program

**Option A: cargo stylus activate (recommended)**

```bash
# Ensure cargo-stylus >= 0.6.3 is installed
cargo stylus --version
# Install/update: cargo install --force cargo-stylus
# Also needed: rustup target add wasm32-unknown-unknown

# Activate the Stylus program
# Activation fee: approximately 0.1 ETH on Arbitrum One
# Ensure deployer key has sufficient ETH balance:
cast balance $DEPLOYER_ADDRESS --rpc-url $ARB_ONE_RPC_URL

cargo stylus activate \
  --address $STYLUS_ENGINE_ADDRESS \
  --endpoint $ARB_ONE_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY

# Expected output:
# Activating Stylus program at <address>...
# Transaction sent: 0x...
# Program activated successfully
# New expiry: <timestamp> (~365 days from now)
```

**Option B: cast send activation (alternative)**

```bash
# Activate via cast send
cast send $STYLUS_ENGINE_ADDRESS \
  "activateProgram(address)(uint256)" \
  $STYLUS_ENGINE_ADDRESS \
  --rpc-url $ARB_ONE_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --value 0.1ether

# Verify activation
cast call $STYLUS_ENGINE_ADDRESS \
  "arbitrumActivationExpiry()(uint256)" \
  --rpc-url $ARB_ONE_RPC_URL
# Should show a timestamp approximately 365 days from now
```

---

## Step 4: 48h-Before-Demo Cutoff Decision (Fallback to Solidity Baseline)

**Use ONLY if reactivation is failing within 48h of a demo or mainnet milestone.**

This is the spec §11.6 "Stylus build cutoff" escape hatch. The Solidity baseline contract (`_solidityBaselineRepDelta`) was shipped in-contract from Phase 4. The Stylus engine is behind a transparent proxy (Phase 5 sets this up). The upgrade is a single mechanical command.

```bash
# Upgrade the transparent proxy to point at the Solidity baseline
# SOLIDITY_BASELINE_ADDRESS: the in-contract fallback deployed in Phase 4
# STYLUS_PROXY_ADMIN: the ProxyAdmin contract from Phase 5 proxy setup
export SOLIDITY_BASELINE_ADDRESS=<phase-4-deployed-solidity-baseline-address>
export STYLUS_PROXY_ADMIN=<proxy-admin-address-from-phase-5>

# Using multisig (Phase 6+) via Safe or deployer key (Phase 4-5):
cast send $STYLUS_PROXY_ADMIN \
  "upgrade(address,address)" \
  $STYLUS_ENGINE_ADDRESS \
  $SOLIDITY_BASELINE_ADDRESS \
  --rpc-url $ARB_ONE_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY

# Verify proxy now delegates to Solidity baseline
cast call $STYLUS_ENGINE_ADDRESS \
  "implementation()(address)" \
  --rpc-url $ARB_ONE_RPC_URL
# Should return SOLIDITY_BASELINE_ADDRESS
```

Pitch to investors: "Stylus in production roadmap" -- the Solidity baseline provides functionally identical reputation scoring, just without the Rust/WASM performance characteristics. Phase 5+ restores the full-fidelity engine.

---

## Step 5: Post-Reactivation Verification

```bash
# 1. Confirm new activation expiry is in the future
EXPIRY=$(cast call $STYLUS_ENGINE_ADDRESS \
  "arbitrumActivationExpiry()(uint256)" \
  --rpc-url $ARB_ONE_RPC_URL)
echo "New expiry: $(date -d @$EXPIRY 2>/dev/null || date -r $EXPIRY)"

# 2. Reconfirm activation via cargo stylus check
cargo stylus check \
  --address $STYLUS_ENGINE_ADDRESS \
  --endpoint $ARB_ONE_RPC_URL

# 3. Update the Google Calendar alert events to the new expiry date
# Run the calendar re-point script (wired in Phase 0):
pnpm tsx scripts/repoint-calendar.ts \
  --stylus-deploy-date $(date +%Y-%m-%d)

# 4. Confirm RepCalculatedFallback alerts stop in Better Stack
# The settlement-watcher's stylus-deactivation-watcher.ts detects the new expiry > 30d
# and stops sending Telegram alerts automatically

# 5. Monitor next few settlements for RepCalculated events (not RepCalculatedFallback)
# Check Better Stack logs: event='settlement_watcher_tick' following settlements
# should show RepCalculated, not RepCalculatedFallback
```

---

## Calendar Alert Schedule

| Alert | When | Action |
|-------|------|--------|
| T-30d | 30 days before expiry | Schedule reactivation window; confirm Ledger/key is available |
| T-15d | 15 days before expiry | Confirm ETH balance >= 0.1 on Arbitrum One |
| T-7d  | 7 days before expiry  | Execute reactivation this week |
| T-1d  | 1 day before expiry   | URGENT -- execute immediately or escalate to cutoff decision |

Telegram P0 channel: `stylus_reactivation` event with `{ daysRemaining, expiryTimestamp, stylusAddress }`.

---

## Incident Documentation

```bash
mkdir -p docs/incidents
cat > "docs/incidents/$(date +%Y-%m-%d)-stylus-reactivation.md" << 'INCIDENTEOF'
# Stylus Reactivation Incident

## Date: <YYYY-MM-DD>
## Engine Address: <STYLUS_ENGINE_ADDRESS>

### Timeline
- T-Nd alert received: [datetime]
- Reactivation executed: [datetime]
- New expiry: [timestamp / human date]
- Calendar updated: [yes/no]

### Outcome
[Successful reactivation / Fell back to Solidity baseline]

### Notes
[Any issues encountered]
INCIDENTEOF

git add docs/incidents/ && git commit -m "docs(ops): stylus-reactivation $(date +%Y-%m-%d)"
```

---

*Phase 4 -- Solidity baseline ships in-contract. Stylus engine deploys in Phase 5.*
*OPS-16 written alongside DeployPhase4.s.sol (plan 04-03).*
*48h cutoff command: cast send $STYLUS_PROXY_ADMIN "upgrade(address,address)" $STYLUS_ENGINE_ADDRESS $SOLIDITY_BASELINE_ADDRESS*
