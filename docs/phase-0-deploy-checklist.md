# Phase 0 Pre-Tag Deploy Checklist

**Purpose:** Before running `git tag phase-0-complete-v0.0.1 && git push --tags`, the operator
MUST walk through each of the 8 hosted-resource verification items below. The `phase-0-gate.yml`
CI workflow is the mechanical gate; this checklist is the human gate for items that no CI script
can verify (GCP IAM, Telegram permissions, Ledger hardware, calendar event IDs, etc.).

**Instructions:**
1. For each item, run the CLI commands or visit the URLs listed.
2. Tick each checkbox `[x]` in this file as you confirm each item.
3. Sign at the bottom with your name, date, and current commit SHA.
4. Only after all boxes are ticked and the signature is in place may you push the tag.

---

## Item 1: GCP Projects + 5 KMS Keys Per Project (D-09, D-06, D-07)

**Purpose:** Confirm the two GCP projects exist, each has 5 KMS keys on the `attestations`
keyring in `us-east1`, and the relayer service account has the correct IAM roles on both.

**Commands to run:**

```bash
# --- Sepolia project ---
gcloud kms keys list \
  --keyring=attestations \
  --location=us-east1 \
  --project=call-it-sepolia

# Expected: nft-twap, defillama, cex, snapshot-tally, oauth-proof

gcloud kms keys versions list \
  --key=nft-twap \
  --keyring=attestations \
  --location=us-east1 \
  --project=call-it-sepolia
# Per key: at least one ENABLED version with algorithm: EC_SIGN_SECP256K1_SHA256

gcloud projects get-iam-policy call-it-sepolia \
  --flatten="bindings[].members" \
  --filter="bindings.members:relayer-runtime@call-it-sepolia.iam.gserviceaccount.com" \
  --format="table(bindings.role)"
# Expected roles: roles/cloudkms.signer, roles/secretmanager.secretAccessor

# --- Mainnet project (repeat) ---
gcloud kms keys list \
  --keyring=attestations \
  --location=us-east1 \
  --project=call-it-mainnet
```

**Checkboxes:**

- [ ] `call-it-sepolia` project exists; 5 KMS keys present: nft-twap, defillama, cex, snapshot-tally, oauth-proof
- [ ] `call-it-mainnet` project exists; same 5 KMS keys present
- [ ] Each KMS key in both projects has ≥1 ENABLED version with `EC_SIGN_SECP256K1_SHA256` + `SOFTWARE` protection level (Pitfall B)
- [ ] `relayer-runtime@call-it-sepolia.iam.gserviceaccount.com` has `roles/cloudkms.signer` on `call-it-sepolia`
- [ ] `relayer-runtime@call-it-sepolia.iam.gserviceaccount.com` has `roles/secretmanager.secretAccessor` on `call-it-sepolia`
- [ ] `relayer-runtime@call-it-mainnet.iam.gserviceaccount.com` has equivalent roles on `call-it-mainnet`
- [ ] WIF (Workload Identity Federation) provider is configured for `call-it-sepolia`; `GCP_WORKLOAD_IDENTITY_PROVIDER` secret is set in GitHub
- [ ] `GCP_SERVICE_ACCOUNT_SEPOLIA` and `GCP_SERVICE_ACCOUNT_MAINNET` GitHub Secrets are set
- [ ] `FLY_API_TOKEN` GitHub Secret is set (Fly.io deploy scope)
- [ ] `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_SEPOLIA`, `VERCEL_PROJECT_ID_MAINNET` GitHub Secrets are set

---

## Item 2: Telegram Bot Permissions (Open Question 5, Pitfall D)

**Purpose:** Confirm the Telegram bot exists and can SEND alerts to the P0 and P1 chats, and
that the synthetic-alert CI is wired to verify delivery via the relayer's send-confirmation.
P0 alerts are delivered to a private DM; a bot cannot read its own outgoing messages, so the
end-to-end check is a direct `sendMessage` smoke test plus the relayer's HTTP 200 +
echoed-nonce confirmation — NOT `getUpdates` polling.

**Commands to run:**

```bash
# Confirm bot exists and is correctly configured
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"
# Expected: { ok: true, result: { id: <botId>, username: "call_it_alerts_bot" (or similar) } }

# Confirm bot can SEND to the P0 chat (direct sendMessage smoke test)
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${TELEGRAM_CHAT_ID_P0}" \
  -d "text=Phase 0 smoke test — P0 send check"
# Expected: { ok: true, result: { message_id: <id>, ... } } — Telegram accepted the send

# Confirm bot can SEND to the P1 chat
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${TELEGRAM_CHAT_ID_P1}" \
  -d "text=Phase 0 smoke test — P1 send check"
```

**Manual steps:**
- Confirm the `TELEGRAM_CHAT_ID_P0` and `TELEGRAM_CHAT_ID_P1` values match the chats the
  operator expects to receive alerts (the P0 DM and the P1 chat).
- Confirm the synthetic-alert CI Secrets are set so the daily `synthetic-alert.yml` cron can
  verify the relayer's send-confirmation: `gh secret set RELAYER_URL` and
  `gh secret set RELAYER_INTERNAL_HMAC` (Telegram credentials live only in the relayer).

**Checkboxes:**

- [ ] `getMe` returns bot exists and is active
- [ ] `sendMessage` to `TELEGRAM_CHAT_ID_P0` returns `{ ok: true }` (P0 send smoke test passes)
- [ ] `sendMessage` to `TELEGRAM_CHAT_ID_P1` returns `{ ok: true }` (P1 send smoke test passes)
- [ ] `RELAYER_URL` GitHub Secret is set (points at the deployed relayer)
- [ ] `RELAYER_INTERNAL_HMAC` GitHub Secret is set (matches `RELAYER_INTERNAL_HMAC_SECRET` in the relayer env)

---

## Item 3: 5 Better Stack Dashboards (OPS-06, D-17, Pitfall G)

**Purpose:** Confirm all 5 operational dashboards exist, each has ≥1 synthetic data point
(proof the dashboard-bootstrapping cron reached Better Stack), and all dashboards are set
to Private access (operator + co-signers only per D-17).

**Steps:**
1. Log in to Better Stack → Dashboards section
2. Verify 5 dashboards by exact name:
   - Total TVL
   - Calls/Hour
   - Settlement Latency
   - Dispute Rate
   - Failed Tx Rate

**Seed dashboards if not yet populated:**
```bash
pnpm tsx scripts/fire-synthetic-alert.ts \
  --event rep_fallback \
  --wait-seconds 60 \
  --seed-dashboards
```
This emits 5 synthetic Pino log lines to the BETTERSTACK_SOURCE_TOKEN source, which
populates the dashboard with at least one data point per dimension.

**Checkboxes:**

- [ ] Dashboard "Total TVL" exists in Better Stack
- [ ] Dashboard "Total TVL" has ≥1 data point visible (not empty chart)
- [ ] Dashboard "Calls/Hour" exists and has ≥1 data point
- [ ] Dashboard "Settlement Latency" exists and has ≥1 data point
- [ ] Dashboard "Dispute Rate" exists and has ≥1 data point
- [ ] Dashboard "Failed Tx Rate" exists and has ≥1 data point
- [ ] All 5 dashboards are set to "Private" access (D-17 compliance)
- [ ] Better Stack "Sources" shows at least one source receiving Pino structured logs from the relayer
- [ ] `BETTERSTACK_SOURCE_TOKEN` is set in GCP Secret Manager as `call-it-sepolia/BETTERSTACK_SOURCE_TOKEN`
- [ ] Alert routing is confirmed: synthetic `rep_fallback` event triggers a Pino log at the correct level that appears in the Failed Tx Rate dashboard
- [ ] Dashboard sharing URL (if generated) is restricted to specific email invitees only

---

## Item 4: Safe 2-of-3 Is Real on Arbiscan Sepolia (SAFETY-58)

**Purpose:** Confirm the Safe multisig is deployed on Arbitrum Sepolia with the correct
3 owners and threshold 2. The `safe-sepolia.json` manifest must match on-chain reality.

**Steps:**
```bash
# Read the deployed Safe address from the manifest
cat packages/contracts/deployments/safe-sepolia.json
# Note the safeAddress value

# Visit Arbiscan Sepolia
open "https://sepolia.arbiscan.io/address/${SAFE_ADDRESS}"

# Or verify via cast (Foundry)
cast call ${SAFE_ADDRESS} "getOwners()" --rpc-url https://sepolia-rollup.arbitrum.io/rpc
cast call ${SAFE_ADDRESS} "getThreshold()" --rpc-url https://sepolia-rollup.arbitrum.io/rpc
```

**Checkboxes:**

- [ ] `packages/contracts/deployments/safe-sepolia.json` exists and has a non-null `safeAddress`
- [ ] `https://sepolia.arbiscan.io/address/${safeAddress}` shows a contract (not an EOA)
- [ ] `getOwners()` returns exactly 3 addresses matching the 3 signers in `safe-sepolia.json`
- [ ] `getThreshold()` returns 2

---

## Item 5: Stylus Reactivation Calendar Events (D-13, Pitfall C)

**Purpose:** Confirm Google Calendar has 4 events seeded at T-30d, T-15d, T-7d, T-1d
before the Stylus deployment placeholder date, and that the event IDs in
`packages/shared/src/constants/stylus-calendar.json` match the Calendar events.

**Steps:**
```bash
# Dry-run to check what dates would be created (no API call)
pnpm tsx scripts/seed-calendar.ts --dry-run

# If events are not yet seeded (GOOGLE_CALENDAR_OAUTH_TOKEN required):
pnpm tsx scripts/seed-calendar.ts --setup   # One-time OAuth flow
pnpm tsx scripts/seed-calendar.ts            # Creates 4 events

# Verify event IDs in JSON
cat packages/shared/src/constants/stylus-calendar.json
```

**Manual steps:**
- Open Google Calendar in browser
- Confirm 4 events exist with titles containing "Stylus Reactivation" at the T-30/15/7/1 dates
- Click each event; confirm description links `docs/runbooks/stylus-reactivation.md`

**Checkboxes:**

- [ ] 4 Google Calendar events exist at T-30d, T-15d, T-7d, T-1d before placeholder Stylus deploy date
- [ ] Each event description links `docs/runbooks/stylus-reactivation.md`
- [ ] `packages/shared/src/constants/stylus-calendar.json` has 4 non-null `event_t*` IDs
- [ ] (Deferred if GOOGLE_CALENDAR_OAUTH_TOKEN not yet provisioned — mark deferred with explanation)

---

## Item 6: GCP Secret Structure Matches Env-Config Schema (D-08, Pitfall 5)

**Purpose:** Confirm all ~12 expected secrets exist in GCP Secret Manager for both projects,
and that mainnet secrets do NOT accidentally contain Sepolia RPC URLs.

**Commands:**
```bash
# List all secrets in both projects
gcloud secrets list --project=call-it-sepolia --format="table(name)"
gcloud secrets list --project=call-it-mainnet --format="table(name)"

# Verify mainnet RPC URL does NOT contain 'sepolia' (Pitfall 5 IAM-layered defense)
gcloud secrets versions access latest \
  --secret=RPC_URL_ARBITRUM_MAINNET \
  --project=call-it-mainnet | grep -i sepolia && echo "FAIL: sepolia in mainnet RPC" || echo "PASS: mainnet RPC is clean"
```

**Expected secrets in each project:**
`PRIVY_APP_SECRET`, `ALCHEMY_API_KEY`, `RPC_URL_ARBITRUM_SEPOLIA`, `RPC_URL_ARBITRUM_MAINNET`,
`PINATA_JWT`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID_P0`, `TELEGRAM_CHAT_ID_P1`,
`BETTERSTACK_SOURCE_TOKEN`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`,
`RELAYER_INTERNAL_HMAC`

And KMS version strings:
`GCP_KEY_VERSION_NFT_TWAP`, `GCP_KEY_VERSION_DEFILLAMA`, `GCP_KEY_VERSION_CEX`,
`GCP_KEY_VERSION_SNAPSHOT_TALLY`, `GCP_KEY_VERSION_OAUTH_PROOF`

**Checkboxes:**

- [ ] All ~12 application secrets exist in `call-it-sepolia`
- [ ] All ~12 application secrets exist in `call-it-mainnet`
- [ ] All 5 KMS version-string secrets exist in both projects
- [ ] `RPC_URL_ARBITRUM_MAINNET` in `call-it-mainnet` does NOT contain the substring "sepolia" (Pitfall 5 defense)
- [ ] `RELAYER_INTERNAL_HMAC` value in `call-it-sepolia` differs from `call-it-mainnet` (per-network isolation)

---

## Item 7: Pinata Account Provisioned + Smoke-Test Pin (D-20)

**Purpose:** Confirm Pinata (IPFS pinning service) account is provisioned, a JWT API token
is stored in GCP Secret Manager as `PINATA_JWT` in BOTH projects, and a one-time smoke pin
confirms the JWT is valid. Per D-20: NO application-level pinning ships in Phase 0 —
receipt-hash pinning + asset pinning land in Phase 7. Phase 0's deliverable is the account
+ JWT + smoke pin only.

**Commands:**
```bash
# Retrieve the JWT from GCP Secret Manager (sepolia project)
PINATA_JWT=$(gcloud secrets versions access latest \
  --secret=PINATA_JWT \
  --project=call-it-sepolia)

# Smoke-test pin: pin the README.md as a test file
curl -X POST \
  -H "Authorization: Bearer $PINATA_JWT" \
  -F "file=@README.md" \
  "https://api.pinata.cloud/pinning/pinFileToIPFS"
# Expected: HTTP 200 with { "IpfsHash": "Qm..." }

# Confirm mainnet JWT also works (same smoke-pin command with mainnet project)
PINATA_JWT_MAINNET=$(gcloud secrets versions access latest \
  --secret=PINATA_JWT \
  --project=call-it-mainnet)
```

**Checkboxes:**

- [ ] Pinata account created (free tier sufficient for Phase 0 smoke pin)
- [ ] `PINATA_JWT` stored in `call-it-sepolia` GCP Secret Manager; smoke pin returns HTTP 200 with a CID
- [ ] `PINATA_JWT` stored in `call-it-mainnet` GCP Secret Manager

---

## Item 8: Default Fly + Vercel Domains Accepted; No Real Domain (D-05)

**Purpose:** Per D-05, the production domain (e.g., callitapp.xyz) is explicitly deferred to
Phase 7. Phase 0–6 all use Fly and Vercel default domains via env vars. Confirm no hardcoded
domain literals exist in the codebase, and the operator has NOT registered the production domain.

**Commands:**
```bash
# Confirm ZERO occurrences of the eventual production domain in the codebase
rg --hidden --no-ignore \
  --type ts \
  --glob '!**/node_modules/**' \
  --glob '!**/.next/**' \
  --glob '!**/dist/**' \
  --glob '!**/.turbo/**' \
  "callitapp\.xyz" .
# Expected: zero matches

# Confirm all env-constructed URLs use env vars, not hardcoded domains
# (manual code review of apps/web/app/ and apps/relayer/src/ for any hardcoded .fly.dev or .vercel.app)
```

**Expected Phase 0 URLs (default domains only):**
- Web Sepolia: `call-it-web-sepolia.vercel.app`
- Web Mainnet: `call-it-web-mainnet.vercel.app`
- Relayer Sepolia: `call-it-relayer-sepolia.fly.dev`
- Relayer Mainnet: `call-it-relayer-mainnet.fly.dev`

**Checkboxes:**

- [ ] `rg "callitapp\.xyz"` returns zero matches across the codebase
- [ ] Operator confirms they have NOT registered the production domain (D-05 deferral)
- [ ] `NEXT_PUBLIC_OG_BASE_URL` in Vercel project settings (call-it-web-sepolia) is set to `https://call-it-web-sepolia.vercel.app` (no hardcoded domain)
- [ ] `RELAYER_URL` consumed by smoke test comes from env var (not hardcoded in any source file)

---

## Sign-Off

After walking ALL 8 items above and ticking all checkboxes, sign here:

```
Signed: <operator name>
Date:   <YYYY-MM-DD>
Commit: <git rev-parse HEAD output>
Status: All 8 checklist items verified. Phase 0 is clear to tag.
```

**To tag:**
```bash
git tag phase-0-complete-v0.0.1
git push --tags
# Then watch: https://github.com/<owner>/<repo>/actions/workflows/phase-0-gate.yml
```

The `phase-0-gate.yml` workflow will run all 6 smoke test steps and create a GitHub release
with the results JSON if all steps pass. Phase 1 is unblocked when the release is green.

---

*This checklist is the Phase 0 human gate. The CI gate (`phase-0-gate.yml`) is the mechanical gate.
Both must be satisfied before Phase 1 begins. See docs/operator/README.md for related runbooks.*
