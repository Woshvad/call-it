# Relayer KMS Key Rotation Runbook

**Requirement:** OPS-25, D-07, D-08  
**Frequency:** Quarterly cadence OR on compromise suspicion OR on operator hire/exit  
**Severity:** HIGH — compromised attestation key can produce falsified oracle data

---

## 1. When to Rotate

- **Quarterly cadence:** Every 3 months as standard hygiene
- **On compromise suspicion:** Immediately if any attestation key may be exposed
- **On operator hire/exit:** Rotate all keys held by the departing operator
- **On audit finding:** If a security audit identifies key material exposure

**Key inventory (5 AttestationType keys per D-07):**

| Key Name | GCP KMS Key | Purpose |
|----------|------------|---------|
| `nft-twap` | `attestations/nft-twap` | NFT floor price TWAP signatures |
| `defillama` | `attestations/defillama` | DefiLlama TVL oracle signatures |
| `cex` | `attestations/cex` | CEX listing event signatures |
| `snapshot-tally` | `attestations/snapshot-tally` | Governance proposal state signatures |
| `oauth-proof` | `attestations/oauth-proof` | OAuth social link proof signatures |

---

## 2. Key Rotation Procedure

**CRITICAL:** KMS rotation is ADDITIVE, never REPLACE. The old key version remains available
for verifying prior attestations. New signings go to the new version. This preserves the
integrity of all historical attestations already stored in the contracts.

### Step 2a: Create new key version in GCP KMS

```bash
# Repeat for each key being rotated
export KEY_NAME=nft-twap  # replace with target key
export GCP_PROJECT=call-it-xyz
export GCP_LOCATION=us-east1
export GCP_KEYRING=attestations

gcloud kms keys versions create \
  --key $KEY_NAME \
  --location $GCP_LOCATION \
  --keyring $GCP_KEYRING \
  --project $GCP_PROJECT

# Note the new version number (e.g., 2)
gcloud kms keys versions list \
  --key $KEY_NAME \
  --location $GCP_LOCATION \
  --keyring $GCP_KEYRING \
  --project $GCP_PROJECT
```

### Step 2b: Update GCP Secret Manager

```bash
# Update the key version secret
export NEW_VERSION=2  # from step 2a
gcloud secrets versions add GCP_KEY_VERSION_NFT_TWAP \
  --data-file=- \
  --project $GCP_PROJECT <<< "$NEW_VERSION"
```

### Step 2c: Update Fly.io relayer secrets

```bash
# Update on both Sepolia and mainnet relayers
flyctl secrets set \
  GCP_KEY_VERSION_NFT_TWAP=$NEW_VERSION \
  --app call-it-relayer-sepolia

flyctl secrets set \
  GCP_KEY_VERSION_NFT_TWAP=$NEW_VERSION \
  --app call-it-relayer-mainnet
```

### Step 2d: Verify new key version produces consistent address

The relayer's `verifyKmsAddress()` runs at boot and confirms the key version produces
the same Ethereum address as expected. **This is REQUIRED** — if the new key version
produces a different address, new attestations would be signed by a different key,
invalidating the on-chain verification:

```bash
# After relayer restart, check boot logs
flyctl logs --app call-it-relayer-mainnet | grep kms_address_verified
# Expected: { event: 'kms_address_verified', keyId: 'nft-twap', success: true }
```

If `success: false`, the new key version's address doesn't match the on-chain expected address.
**STOP** — do not proceed. The on-chain expected address for each attestation type is stored in
the `SettlementManager` or `ProfileRegistry` contracts. Rotation cannot change the on-chain address
without a contract upgrade (Phase 4+ operation requiring multisig).

### Step 2e: Remove old key version from primary signing (optional)

The old key version stays ENABLED for historical attestation verification but should be
set to non-primary to prevent accidental re-use:

```bash
# Disable old version from signing (key stays for verification)
# Note: GCP KMS does NOT support "demote primary" directly.
# Instead, ensure ONLY the new version is referenced in relayer env.
# The old version remains queryable for historical signature verification.
```

---

## 3. Verify Rotation Complete

```bash
# 1. Relayer uses new key version
flyctl logs --app call-it-relayer-mainnet | grep kms_sign | head -5
# Should show: { event: 'kms_sign', keyId: 'nft-twap', keyVersion: '2', ... }

# 2. Telegram P0 channel shows no rep_fallback alerts
# (rep_fallback fires when rep scoring fails — key rotation should not trigger it)

# 3. Smoke test an attestation flow
# TODO Phase 4: add attestation smoke test to this runbook
```

---

## 4. Incident Response for Rep Calculation Failure

## #manual-rep-compensation

If `RepCalculatedFallback` fires (rep engine fell back to Solidity baseline due to
Stylus failure, oracle failure, or KMS signing failure), manual reputation compensation
may be required for affected users.

**Trigger:** `rep_fallback` P0 alert in Telegram with `{ callId, affectedUsers, fallbackReason }`

### Compensation procedure:

1. **Identify affected users:**
   ```graphql
   # Query subgraph for affected (callId, user) pairs
   {
     repCalculatedFallbacks(where: { call: "<callId>" }) {
       id
       user
       expectedRep
       actualRep
       timestamp
     }
   }
   ```

2. **Calculate expected rep delta:**
   Use the spec §12.6 reputation algorithm:
   ```bash
   # expectedRepDelta = f(stake, conviction, outcome, followers, timeHeld)
   # The Solidity baseline produces a simplified score; the Stylus engine produces the full score
   # Difference = fullScore - simplifiedScore = compensation amount
   ```

3. **Apply compensation via ProfileRegistry emergency function:**
   ```bash
   # Owner-only path (deployer in Phase 0-5; multisig in Phase 6+):
   cast send $PROFILE_REGISTRY_ADDRESS \
     "emergencySetRep(address,uint256)" \
     $AFFECTED_USER \
     $NEW_REP_VALUE \
     --rpc-url $RPC_URL_ARBITRUM_ONE \
     --ledger
   ```

4. **Document the compensation:**
   ```bash
   # Create public accountability log
   mkdir -p docs/disputes
   cat > docs/disputes/$(date +%Y-%m-%d)-rep-fallback-<callId>.md << 'EOF'
   # Rep Fallback Compensation — $(date +%Y-%m-%d)

   Call ID: <callId>
   Fallback reason: <reason>
   Affected users: <list>

   Compensation applied:
   - User <address>: repDelta = +<N> (from <old> to <new>)
   - tx: 0x...

   Root cause: <description>
   Fix: <description>
   EOF
   git add docs/disputes/ && git commit -m "docs: rep fallback compensation $(date +%Y-%m-%d)"
   ```

5. **Post-incident:**
   - Confirm Stylus reactivated (or Solidity baseline promoted)
   - Confirm `rep_fallback` alerts stopped
   - Update runbook with lessons learned
