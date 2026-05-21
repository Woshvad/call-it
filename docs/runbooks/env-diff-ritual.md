# Env Diff Ritual (Pitfall 5 mitigation; Phase 6 mandatory)

**Requirement:** Pitfall 5 (Sepolia/mainnet env drift), Pitfall E, T-00-03  
**When:** MANDATORY before every Fly.io mainnet deploy from Phase 6 onward  
**Severity:** HIGH — env drift causes silent failures at mainnet launch

---

## 1. Why

Sepolia↔mainnet environment drift is the highest-likelihood deploy-day footgun.
Classic failure modes:
- **Pitfall 5:** Mainnet deploy uses Sepolia RPC URL — relayer writes to testnet
- **Pitfall E:** Sepolia USDC address (`0x75faf114...`) leaked into mainnet Fly secrets
- **T-00-03:** Subgraph URL pointing to `call-it-sepolia` Studio endpoint in mainnet relayer

The env diff ritual catches these before they cause loss of funds or data corruption.

---

## 2. Procedure

Run before every mainnet Fly.io deploy from Phase 6 onward:

### Step 2a: Dump current Fly secrets for both environments

```bash
# Sepolia relayer secrets
flyctl secrets list --app call-it-relayer-sepolia \
  --json > /tmp/secrets-sepolia.json

# Mainnet relayer secrets  
flyctl secrets list --app call-it-relayer-mainnet \
  --json > /tmp/secrets-mainnet.json

# Note: flyctl secrets list returns key NAMES only, not values.
# This is intentional — we compare key inventory, not secret values.
```

### Step 2b: Run env diff comparison

```bash
# Extract key names for each environment
jq -r '.[].Name' /tmp/secrets-sepolia.json | sort > /tmp/keys-sepolia.txt
jq -r '.[].Name' /tmp/secrets-mainnet.json | sort > /tmp/keys-mainnet.txt

# Find unexpected differences
diff /tmp/keys-sepolia.txt /tmp/keys-mainnet.txt

# Expected differences (these are whitelisted):
WHITELISTED_DIFFS=(
  "ALCHEMY_RPC_URL_MAINNET"       # vs ALCHEMY_RPC_URL_SEPOLIA
  "ALCHEMY_RPC_URL_SEPOLIA"
  "SUBGRAPH_URL"                  # different Studio endpoints
  "SAFE_ADDRESS"                  # Sepolia vs mainnet Safe
  "CHAIN_ID"                      # 421614 vs 42161
)

# Any diff NOT in the whitelist = HALT and review
```

### Step 2c: Check Vercel environment (frontend)

```bash
# Compare Vercel env vars for both environments
vercel env pull --environment=preview > /tmp/vercel-sepolia.env  2>/dev/null
vercel env pull --environment=production > /tmp/vercel-mainnet.env 2>/dev/null

# Check for Sepolia artifacts in production env
grep -i "sepolia\|421614\|testnet" /tmp/vercel-mainnet.env && echo "WARNING: Sepolia ref in mainnet Vercel env" || echo "PASS: no Sepolia refs in mainnet Vercel env"
```

### Step 2d: Check GCP Secret Manager

```bash
# List secrets in both projects (if separate GCP projects per network)
gcloud secrets list --project $GCP_PROJECT_SEPOLIA | grep -v NAME > /tmp/gcp-secrets-sepolia.txt
gcloud secrets list --project $GCP_PROJECT_MAINNET | grep -v NAME > /tmp/gcp-secrets-mainnet.txt

diff /tmp/gcp-secrets-sepolia.txt /tmp/gcp-secrets-mainnet.txt
```

### Step 2e: Check built artifacts for Sepolia references

```bash
# Build artifacts should contain NO Sepolia chain ID or RPC references
grep -r "arbitrum-sepolia\|421614" apps/web/.next apps/relayer/dist 2>/dev/null \
  && echo "FAIL: Sepolia refs found in build artifacts" \
  && exit 1 \
  || echo "PASS: no Sepolia refs in built artifacts"
```

### Step 2f: Check Subgraph deploy key

```bash
# Ensure the subgraph URL in mainnet relayer points to the mainnet Studio endpoint
SUBGRAPH_URL=$(flyctl secrets get SUBGRAPH_URL --app call-it-relayer-mainnet 2>/dev/null)
echo $SUBGRAPH_URL | grep "arbitrum-sepolia" \
  && echo "FAIL: Sepolia subgraph URL in mainnet relayer" \
  && exit 1 \
  || echo "PASS: subgraph URL looks like mainnet"
```

---

## 3. Manual Review and Sign-Off

**Both the operator AND at least one co-signer must review and sign off before proceeding:**

```bash
# Create sign-off record
cat > docs/incidents/$(date +%Y-%m-%d)-env-diff-signoff.md << 'EOF'
# Env Diff Sign-Off — $(date +%Y-%m-%d)

## Fly Secrets
- [ ] No unexpected diffs between Sepolia and mainnet secrets
- [ ] Whitelisted diffs: RPC_URL, SUBGRAPH_URL, SAFE_ADDRESS, CHAIN_ID

## Vercel Env
- [ ] No Sepolia refs in production Vercel env

## GCP Secret Manager
- [ ] Mainnet project secrets inventory matches expected

## Build Artifacts
- [ ] No Sepolia refs in next build output
- [ ] No Sepolia refs in relayer dist output

## Sign-off
- Operator: $OPERATOR_HANDLE (@$(date +%Y-%m-%dT%H:%M:%SZ))
- Co-signer: (name + Telegram handle)
EOF
```

Telegram confirmation: both signers reply to the P0 channel: `✅ env diff signed off for $(date +%Y-%m-%d) deploy`.

---

## 4. Automated Check (Phase 6+ CI)

**Note: `scripts/env-diff.ts` ships in Phase 6.** This runbook documents the procedure
so Phase 6 has a concrete spec to implement against.

The script will implement:
- `pnpm tsx scripts/env-diff.ts --source sepolia --target arbitrum-one`
- Produces SET-DIFFERENCE of secrets across Fly, Vercel, GCP
- Whitelist-based: expected differences are not flagged
- Unexpected differences halt the deploy with a non-zero exit code

---

## 5. Failure Modes and Recovery

| Failure | Action |
|---------|--------|
| Unexpected secret in mainnet but not Sepolia | Review the secret; if safe, add to whitelist; if accidental, `flyctl secrets unset <KEY>` |
| Sepolia RPC URL in mainnet relayer | `flyctl secrets set ALCHEMY_RPC_URL_MAINNET=<mainnet-url> --app call-it-relayer-mainnet` |
| Sepolia subgraph URL in mainnet relayer | Update `SUBGRAPH_URL` to point to mainnet Decentralized Network endpoint |
| Sepolia chain ID in Vercel production | `vercel env rm NEXT_PUBLIC_CHAIN_ID production` then re-add with `42161` |
