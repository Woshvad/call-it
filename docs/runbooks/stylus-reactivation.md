# Stylus Reactivation Runbook (Pitfall 17 mitigation)

**Requirement:** D-13, CALL_IT_SPEC1.md §10.8  
**Severity:** CRITICAL — silent contract deactivation causes StylusScoreEngine to stop executing  
**Phase 5+ ongoing operational procedure**

---

## 1. Background

Stylus contracts on Arbitrum deactivate automatically **365 days** after their last activation.
After deactivation, `arbitrumActivationExpiry()` returns a timestamp in the past, and the
WASM program stops executing. The `StylusScoreEngine` — which computes all reputation scores —
will silently fail. Calls will land in the Solidity baseline fallback path, triggering
`rep_fallback` P0 alerts, but the rep engine will be broken until reactivation.

Reactivation is simple:
- `cargo stylus activate <address>` OR
- `cast send <address> "activateProgram(...)"` from the deployer Ledger

The 48h-before-demo cutoff (§11.6): if reactivation fails, run `proxy.upgradeTo(soliditySolidityBaselineAddress)`
to fall back to the Solidity baseline in the same proxy slot. Pitch: "Stylus in production roadmap."

**Two independent alert belts (D-13):**
1. Google Calendar invites at T-30d/T-15d/T-7d/T-1d (created by `scripts/seed-calendar.ts`)
2. Relayer `stylus-deactivation-watcher.ts` polling `arbitrumActivationExpiry()` daily → P0 Telegram alerts

Either belt alerting means you have time to reactivate. Both must fail before the window is missed.

---

## 2. Alert Thresholds

| Threshold | When | Action |
|-----------|------|--------|
| T-30d | 30 days before expiry | Schedule reactivation window on team calendar |
| T-15d | 15 days before expiry | Confirm Ledger Nano is available; check Arbitrum ETH balance |
| T-7d | 7 days before expiry | Execute reactivation during this week |
| T-1d | 1 day before expiry | URGENT — execute immediately or escalate |

Telegram P0 channel: `stylus_reactivation` event with `{ daysRemaining, expiryTimestamp, stylusAddress }`.

---

## 3. Pre-flight Checks

Before executing reactivation:

1. **Verify Stylus address:**
   ```bash
   cat packages/contracts/deployments/safe-arbitrum-one.json
   # Note the StylusScoreEngine proxy address
   # Or: check STYLUS_SCORE_ENGINE_ADDRESS in Fly secrets
   flyctl secrets list --app call-it-relayer-mainnet | grep STYLUS
   ```

2. **Query current activation expiry:**
   ```bash
   cast call $STYLUS_SCORE_ENGINE_ADDRESS "arbitrumActivationExpiry()(uint256)" \
     --rpc-url $RPC_URL_ARBITRUM_ONE
   # Convert to date: date -d @<timestamp> (Linux) or gdate -d @<timestamp> (macOS)
   ```

3. **Verify Ledger Nano is available:**
   - Ledger Nano X/S Plus connected via USB
   - Ethereum app open (not screensaver)
   - Blind signing enabled: Settings → Contract data → Allowed
   - ETH balance ≥ 0.05 on Arbitrum One (deployer key):
     ```bash
     cast balance $SAFE_SIGNER_1 --rpc-url $RPC_URL_ARBITRUM_ONE
     ```

4. **Verify `cargo stylus` is installed and up to date:**
   ```bash
   cargo stylus --version  # should be ≥ 0.6.3
   # Install/update: cargo install --force cargo-stylus
   ```

---

## 4. Execution Steps

### Option A: cargo stylus activate (recommended)

```bash
# Set env
export STYLUS_SCORE_ENGINE_ADDRESS=<address>
export RPC_URL_ARBITRUM_ONE=<alchemy-rpc-url>

# Activate with Ledger
cargo stylus activate \
  --address $STYLUS_SCORE_ENGINE_ADDRESS \
  --endpoint $RPC_URL_ARBITRUM_ONE \
  --private-key-path /dev/null \
  # (Ledger signing — cargo-stylus prompts Ledger automatically)

# Expected output:
# Activating Stylus program...
# Transaction sent: 0x...
# Program activated successfully
```

### Option B: cast send (manual ABI call)

```bash
# Check current Stylus activation ABI for activateProgram selector
cast sig "activateProgram(address)" 
# → 0x...

cast send $STYLUS_SCORE_ENGINE_ADDRESS \
  "activateProgram(address)(uint256)" \
  $STYLUS_SCORE_ENGINE_ADDRESS \
  --rpc-url $RPC_URL_ARBITRUM_ONE \
  --ledger \
  --mnemonic-derivation-path "m/44'/60'/0'/0/0"
```

---

## 5. Post-Reactivation Verification

```bash
# 1. Query new expiry (should be current time + 365 days)
cast call $STYLUS_SCORE_ENGINE_ADDRESS "arbitrumActivationExpiry()(uint256)" \
  --rpc-url $RPC_URL_ARBITRUM_ONE

# 2. Verify activation status
cast call $STYLUS_SCORE_ENGINE_ADDRESS "isProgramActivated()(bool)" \
  --rpc-url $RPC_URL_ARBITRUM_ONE
# Should return: true

# 3. Update Google Calendar events to new expiry date
pnpm tsx scripts/repoint-calendar.ts \
  --stylus-deploy-date $(date +%Y-%m-%d)
# This updates the 4 Google Calendar events to the new T-30/15/7/1d dates

# 4. Confirm in Better Stack that rep_fallback alerts stopped
# (The watcher should detect new expiry > 30d and stop alerting)
```

---

## 6. Escalation: 48h-Before-Demo Cutoff

If reactivation fails within 48h of a demo/mainnet event:

```bash
# Fallback: upgrade proxy to Solidity baseline (§11.6)
# The Solidity baseline contract must be deployed FIRST (Phase 4 ships it):
export SOLIDITY_BASELINE_ADDRESS=<phase-4-deployed-address>

# Upgrade via multisig (Phase 6+) or deployer key (Phase 5):
cast send $STYLUS_PROXY_ADMIN \
  "upgrade(address,address)" \
  $STYLUS_SCORE_ENGINE_ADDRESS \
  $SOLIDITY_BASELINE_ADDRESS \
  --rpc-url $RPC_URL_ARBITRUM_ONE \
  --ledger \
  --mnemonic-derivation-path "m/44'/60'/0'/0/0"

# Verify: proxy now delegates to Solidity baseline
cast call $STYLUS_SCORE_ENGINE_ADDRESS "implementation()(address)" \
  --rpc-url $RPC_URL_ARBITRUM_ONE
# Should return SOLIDITY_BASELINE_ADDRESS
```

Pitch to team/investors: "Stylus in production roadmap" — the Solidity baseline provides identical
reputation scoring, just without the Rust/WASM performance characteristics.

---

## 7. Document the Event

```bash
# Create incident log (public commitment per spec §18.7)
mkdir -p docs/incidents
cat > docs/incidents/$(date +%Y-%m-%d)-stylus-reactivation.md << 'EOF'
# Stylus Reactivation — $(date +%Y-%m-%d)

## Timeline
- T-Nd alert received: [datetime]
- Reactivation executed: [datetime]
- New expiry: [timestamp]
- Calendar updated: [yes/no]

## Outcome
[Successful reactivation / Fell back to Solidity baseline]
EOF
```
