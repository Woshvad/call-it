# Multisig Promotion Runbook (Phase 6 HARD GATE, Pitfall 6 mitigation)

**Requirement:** D-10, D-11, SAFETY-58, CALL_IT_SPEC1.md §10.8  
**Phase:** 6 — HARD GATE before mainnet announcement  
**Severity:** CRITICAL — single deployer key ownership is a permanent security risk

---

## 1. Background

Before Phase 6 mainnet announcement, ALL contract ownership must transfer from the
single deployer key (Ledger Nano per D-11) to the Safe 2-of-3 multisig (D-10).

After promotion, any sensitive operation (pause, ownership transfer, proxy upgrade, cap changes)
requires 2 of 3 hardware-wallet signatures from:
- Signer 1: Operator's Ledger Nano X/S Plus (also the Phase 0-5 deployer key)
- Signer 2: Trusted human #2 — different HW wallet brand from Signer 1 (e.g., Trezor)
- Signer 3: Trusted human #3 — different HW wallet brand from Signer 1

The 2-of-3 structure means even if the deployer Ledger is compromised, no unilateral
action is possible — Pitfall 6 is closed.

**Pre-condition:** Safe 2-of-3 already deployed on Arbitrum One via:
```bash
pnpm deploy:safe:mainnet  # scripts/deploy-safe.ts --network arbitrum-one --execute --signer-source ledger
```

---

## 2. Pre-Conditions Checklist

Before starting the promotion:

- [ ] All 6 contracts deployed on Arbitrum One (Phase 1-5 completion gate)
- [ ] Safe 2-of-3 deployed: `packages/contracts/deployments/safe-arbitrum-one.json` exists
- [ ] All 3 signers have verified access to their hardware wallets
- [ ] Signers 2 and 3 are available for `acceptOwnership()` calls (Ownable2Step per CLAUDE.md)
- [ ] Deployer key Ledger Nano is connected and unlocked
- [ ] At least 0.05 ETH on deployer key for gas
- [ ] Telegram P0 channel notifications are live (to alert on unexpected owner changes)
- [ ] `docs/runbooks/env-diff-ritual.md` env diff has been run and signed off

```bash
# Load Safe address
SAFE_ADDRESS=$(cat packages/contracts/deployments/safe-arbitrum-one.json | jq -r .safeAddress)
echo "Target Safe: $SAFE_ADDRESS"

# Verify owners + threshold
cast call $SAFE_ADDRESS "getOwners()(address[])" --rpc-url $RPC_URL_ARBITRUM_ONE
cast call $SAFE_ADDRESS "getThreshold()(uint256)" --rpc-url $RPC_URL_ARBITRUM_ONE
# Expected: 3 owner addresses, threshold = 2
```

---

## 3. Contract Ownership Transfer Order

Transfer in this order (dependencies flow CallRegistry → others):

| Order | Contract | Variable | Notes |
|-------|----------|----------|-------|
| 1 | CallRegistry | `CALL_REGISTRY_ADDRESS` | Primary market contract |
| 2 | FollowFadeMarket | `FOLLOW_FADE_MARKET_ADDRESS` | Depends on CallRegistry |
| 3 | ChallengeEscrow | `CHALLENGE_ESCROW_ADDRESS` | Depends on FollowFadeMarket |
| 4 | SettlementManager | `SETTLEMENT_MANAGER_ADDRESS` | Depends on CallRegistry |
| 5 | ProfileRegistry | `PROFILE_REGISTRY_ADDRESS` | Independent; holds user rep |
| 6 | StylusScoreEngine (proxy admin) | `STYLUS_PROXY_ADMIN_ADDRESS` | Proxy admin — last (most sensitive) |

---

## 4. Transfer Procedure (Per Contract)

Repeat for each contract in the order above:

### Step 4a: Propose `transferOwnership` from deployer Ledger

```bash
export CONTRACT_ADDRESS=<contract-address>

# Step 1: Deployer proposes ownership transfer (Ownable2Step — Signer 2 must acceptOwnership)
cast send $CONTRACT_ADDRESS \
  "transferOwnership(address)" \
  $SAFE_ADDRESS \
  --rpc-url $RPC_URL_ARBITRUM_ONE \
  --ledger \
  --mnemonic-derivation-path "m/44'/60'/0'/0/0"

# Expected output:
# Transaction hash: 0x...
# Receipt: status 1 (success)

# Verify pendingOwner is now the Safe
cast call $CONTRACT_ADDRESS "pendingOwner()(address)" --rpc-url $RPC_URL_ARBITRUM_ONE
# Should return: $SAFE_ADDRESS
```

### Step 4b: Safe signs + submits `acceptOwnership`

At least 2 of 3 Safe signers must co-sign `acceptOwnership()`:

**Via Safe UI (recommended for Phase 6):**
1. Go to app.safe.global → Import Safe at `$SAFE_ADDRESS` on Arbitrum One
2. New Transaction → Contract Interaction → `$CONTRACT_ADDRESS`
3. Function: `acceptOwnership()` (no args)
4. Sign with Signer 1 (Ledger)
5. Share transaction hash with Signer 2/3 to co-sign
6. Execute after 2 signatures collected

**Via cast (alternative):**
```bash
# Signer 2 or 3 calls acceptOwnership via the Safe
# Use Safe SDK or Safe UI for multisig coordination
```

### Step 4c: Verify ownership transferred

```bash
cast call $CONTRACT_ADDRESS "owner()(address)" --rpc-url $RPC_URL_ARBITRUM_ONE
# Must return: $SAFE_ADDRESS

echo "PASS: $CONTRACT_ADDRESS owner is now Safe multisig"
```

---

## 5. Post-Promotion Verification

After all 6 contracts are transferred:

```bash
# Quick verification loop
for CONTRACT_VAR in CALL_REGISTRY_ADDRESS FOLLOW_FADE_MARKET_ADDRESS CHALLENGE_ESCROW_ADDRESS SETTLEMENT_MANAGER_ADDRESS PROFILE_REGISTRY_ADDRESS; do
  CONTRACT_ADDR=${!CONTRACT_VAR}
  OWNER=$(cast call $CONTRACT_ADDR "owner()(address)" --rpc-url $RPC_URL_ARBITRUM_ONE)
  if [ "$OWNER" = "$SAFE_ADDRESS" ]; then
    echo "PASS: $CONTRACT_VAR → $SAFE_ADDRESS"
  else
    echo "FAIL: $CONTRACT_VAR owner is $OWNER (expected $SAFE_ADDRESS)"
  fi
done

# Check no deployer-only code paths remain
grep -r "deployer-only" .planning/ && echo "WARNING: deployer-only references found" || echo "PASS: no deployer-only references"
```

---

## 6. Failure Modes

| Failure | Symptom | Resolution |
|---------|---------|------------|
| Contract uses Ownable v5 single-step | `acceptOwnership()` not found | Halt + escalate — this is a contract bug (Phase 1+ must fix) |
| Signer 2/3 unavailable | Cannot reach 2-of-3 threshold | Reschedule; deployer key still owns until promotion complete |
| Safe UI down | Cannot submit via web | Use Safe SDK CLI or cast with raw calldata |
| Gas spike | Transaction reverts OOG | Retry with higher gas limit (`--gas-limit 500000`) |

---

## 7. Document the Promotion

```bash
# Record promotion in git (public commitment)
cat > docs/incidents/$(date +%Y-%m-%d)-multisig-promotion.md << 'EOF'
# Multisig Promotion — $(date +%Y-%m-%d)

## Safe Address
$SAFE_ADDRESS

## Signers
- Signer 1: $SAFE_SIGNER_1 (Ledger Nano X/S Plus)
- Signer 2: $SAFE_SIGNER_2
- Signer 3: $SAFE_SIGNER_3

## Contracts Transferred
- [ ] CallRegistry: txHash=
- [ ] FollowFadeMarket: txHash=
- [ ] ChallengeEscrow: txHash=
- [ ] SettlementManager: txHash=
- [ ] ProfileRegistry: txHash=
- [ ] StylusScoreEngine proxy admin: txHash=

## Verified
All contracts: cast call <contract> "owner()(address)" returns Safe address
EOF

git add docs/incidents/ && git commit -m "docs: record Phase 6 multisig promotion"
```
