---
title: Operator Onboarding & Resume Guide
created: 2026-05-25
project: Call It
purpose: External-service signup sequence + chat-resume context for the operator
---

# Where you left off

## Phase 01 status (as of 2026-05-25)

Phase 1 (Core contracts + auth + frontend skeleton) is **execution-complete**:

- **10/10 plans landed** across 7 waves (~45 commits on master).
- **257+ tests pass** (93 shared parity + 53 ui + 111 relayer + 80 Foundry).
- Verifier returned `human_needed` — code is complete; remaining work is operator-bound.
- `STATE.md` is `verifying`. ROADMAP shows Phase 1 plan-count = 10/10 but phase promotion is held by UAT.
- All 11 Phase 1 pitfalls closed. Schema drift gate clean.

## UAT status (`.planning/phases/01-core-contracts-auth-frontend-skeleton/01-UAT.md`)

| Gap | Description | Status |
|---|---|---|
| 1 | CallRegistry + ProfileRegistry Sepolia deploy | ❌ Open — needs funded deployer key |
| 2 | Twitter OAuth round-trip | ❌ Open — needs real Privy App ID |
| 3 | Coinbase Onramp popup | ❌ Open — needs Coinbase Cloud credentials |
| 4 | Paymaster 5→6 e2e | ❌ Open — needs Alchemy AA + Sepolia deploy |
| 5 | Circle Paymaster mainnet address | ✅ **Resolved** (2026-05-22 — verified via web; bonus: Sepolia paymaster `0x31BE08D380...` also populated) |
| 6 | Visual snapshot baselines | 🟡 Partial — 2 of 9 baselines generated; 3 production bugs fixed along the way (`_dev`→`dev` route, middleware allowlist, prop-shape mismatches) |

**Op-setup #2 (Alchemy paymaster RPC choice):** ✅ Resolved — Plan 07's ERC-7677 endpoint is correct. Integration plan documented in `WAVE-0-VERIFICATION.md` Item 4.

## Decision: proceed without Sepolia for now

Per CLAUDE.md, Sepolia is a **hard-locked Phase 6 gate** (≥48h staging before mainnet, non-optional). For Phase 1 closure specifically, only Gaps 1 and 4 require Sepolia.

**Agreed path forward:** defer Sepolia setup until Phase 4 (oracle integrations genuinely benefit from a live testnet) or later. Move next into Phase 1.5 (social linking, no contracts) or Phase 2 (FollowFadeMarket, develop on local anvil). UAT Gaps 1 and 4 stay open and roll into the Phase 6 promotion gate.

## What "Call It" is (one-paragraph reminder)

Person-first onchain social prediction product on Arbitrum mainnet. Users stake USDC on calls (price targets, spread/vs, future events) tied to a named handle — not an anonymous wallet position. Calls produce unfakeable shareable receipts (CALLED IT / LOUD AND WRONG / CONTRARIAN HIT). Sits between Crypto Twitter (no accountability) and Polymarket (no personal reputation). Privy embedded wallets, Alchemy AA paymaster (first 5 tx sponsored, then Circle USDC paymaster), Solidity contracts pinned at `=0.8.30`, Rust/Stylus reputation engine behind a transparent proxy.

---

# Operator-Onboarding Sequence (12 steps)

Priority groups:
- **Priority 1 (Steps 1–4)** — Phase 1 UAT closure. Closes Gaps 1, 2, 3, 4.
- **Priority 2 (Steps 5–8)** — Hosting + infrastructure.
- **Priority 3 (Steps 9–12)** — Auxiliary services.

Recommended order: **1 → 2 → 5 → 6 → 7 → 4 → 3 → 8 → 10 → 11 → 9 → 12**.

For each step: signup link, what value to copy, where it lands. Reply with values to Claude as you collect them — one step at a time is fine. Claude wires the value into the right file (or GCP Secret Manager / Fly secret / Vercel env), verifies the build still passes, and confirms before moving on.

---

## Priority 1 — Phase 1 UAT closure

### Step 1 — Privy App (closes UAT Gap 2)

1. https://dashboard.privy.io → sign in with Google/GitHub.
2. **Create new app** → name `Call It (dev)`. (Later create a separate `Call It (prod)` app.)
3. **Settings → Basics** — copy:
   - **App ID** → `NEXT_PUBLIC_PRIVY_APP_ID`
   - **App Secret** → `PRIVY_APP_SECRET`
4. **Login methods** — enable: Wallet, Google, Twitter, Email (optional). Twitter requires a Twitter Developer App's Client ID/Secret (separate signup at developer.twitter.com — Privy's docs walk through it).
5. **User management → Embedded wallets** — set Create on login = **Off-curve** (Ethereum), Show creation flow = **Yes for OAuth users**.
6. **Webhooks** → **Add endpoint** → URL `https://<your-fly-app>.fly.dev/api/privy/webhook` (you'll fill the Fly URL in after Step 5). Subscribe to `auth.linked`. Copy the **Signing secret** (Svix `whsec_...`) → `PRIVY_WEBHOOK_SECRET`.

**Send Claude:** App ID, App Secret, Webhook Secret.

### Step 2 — Alchemy (closes UAT Gaps 1 and 4)

1. https://dashboard.alchemy.com → sign up.
2. **Create new app** — Network: **Arbitrum Sepolia**, name `Call It Sepolia`. Copy the API Key → forms `NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL = https://arb-sepolia.g.alchemy.com/v2/<api-key>`.
3. Second app — Network: **Arbitrum One**, name `Call It Mainnet`. Copy API Key → forms `NEXT_PUBLIC_ARBITRUM_RPC_URL`.
4. Third app — Network: **Ethereum** (mainnet), name `Call It ENS`. Copy API Key → forms `ENS_MAINNET_RPC_URL`.
5. **Gas Manager** in sidebar → **Create policy**:
   - Network: Arbitrum Sepolia
   - Sponsorship type: Sponsor all (dev) or Sponsor for specific senders (prod)
   - Daily limit: $10 USD (Phase 0 cap)
   - **Advanced → Policy endpoint URL:** `https://<your-fly-app>.fly.dev/paymaster/policy` ← routes Alchemy's bundler through our server-side cap enforcer (D-02)
6. Copy the **Policy ID** → `NEXT_PUBLIC_ALCHEMY_AA_POLICY_ID`.

**Send Claude:** Sepolia API key, Mainnet API key, Ethereum (ENS) API key, Gas Manager Policy ID.

### Step 3 — Arbitrum Sepolia deployer wallet (closes UAT Gap 1)

1. Generate a **fresh** EOA (do NOT reuse a personal wallet):
   - MetaMask → Create account → Account 2 → reveal private key, OR
   - Foundry: `cast wallet new` → prints Address + Private Key.
2. Fund with ~0.5 Sepolia ETH:
   - https://faucet.quicknode.com/arbitrum/sepolia (best, no Twitter required)
   - https://www.alchemy.com/faucets/arbitrum-sepolia (uses your Alchemy account)
3. (Recommended) Fund with ~10 Sepolia USDC: https://faucet.circle.com → select Arbitrum Sepolia + USDC → paste address.

**Send Claude:** the deployer address (public). You run the `forge script` deploy locally — Claude gives you the exact command. The private key never leaves your machine.

**Security note:** This key only ever holds testnet ETH/USDC. Mainnet deployer key is a separate, hardware-wallet key generated in Phase 6.

### Step 4 — Coinbase Onramp (closes UAT Gap 3)

1. https://portal.cdp.coinbase.com → sign up (Coinbase Developer Platform).
2. **Create project** → name `Call It`.
3. **Onramp → App configuration**:
   - Destination networks: ✅ Arbitrum One, ✅ Arbitrum Sepolia
   - Destination assets: ✅ USDC only
   - Allowed origins: `http://localhost:3000`, `http://localhost:3001`, your Vercel preview + prod URLs (add after Step 8)
4. Copy:
   - **App ID** → `NEXT_PUBLIC_COINBASE_APP_ID`
   - **Onramp API Key** (public client key, NOT server secret) → `NEXT_PUBLIC_COINBASE_ONRAMP_API_KEY`

**Send Claude:** App ID, Onramp API Key.

---

## Priority 2 — Hosting + infrastructure

### Step 5 — Fly.io (relayer host + Postgres)

1. Install Fly CLI (PowerShell as admin): `iwr https://fly.io/install.ps1 -useb | iex`
2. `fly auth signup` (or `fly auth login`).
3. Add payment method (free tier covers ~$5/mo).
4. From `apps/relayer/`: `fly launch --copy-config --no-deploy`. Prompts:
   - App name: `call-it-relayer` (note for Privy webhook + Alchemy policy URL)
   - Region: `iad` (per Phase 0 D-01)
   - Postgres: **Yes, create** → Development tier
5. `fly postgres attach call-it-pg --app call-it-relayer` if not auto-attached. Copy the printed `DATABASE_URL` → `POSTGRES_URL`.

**Send Claude:** Fly app name, public Fly URL (`https://<app>.fly.dev`), `POSTGRES_URL`.

### Step 6 — Upstash Redis (paymaster counter, BullMQ backing store)

1. https://console.upstash.com → sign up.
2. **Create database** → Type: **Regional**, Region: `us-east-1` (matches Fly iad), Name: `call-it-relayer`, TLS: **Enabled**.
3. Copy from database details:
   - `UPSTASH_REDIS_REST_URL` (e.g. `https://xxx.upstash.io`)
   - `UPSTASH_REDIS_REST_TOKEN` (long base64-ish string)

**Send Claude:** both values.

### Step 7 — GCP Secret Manager (canonical secret store)

1. https://console.cloud.google.com → create project `call-it-sepolia` (later also `call-it-mainnet`).
2. Enable Secret Manager API: https://console.cloud.google.com/apis/library/secretmanager.googleapis.com
3. Keep both projects strictly separate (Phase 0 D-09 per-network IAM isolation).
4. Add secrets via CLI as we collect them:
   ```powershell
   gcloud config set project call-it-sepolia
   gcloud secrets create PRIVY_APP_SECRET --replication-policy=automatic
   echo -n "<value>" | gcloud secrets versions add PRIVY_APP_SECRET --data-file=-
   ```
5. Fly relayer reads these via GitHub Actions OIDC federation — `.github/workflows/deploy-relayer.yml` is already wired (Phase 0).

**Send Claude:** GCP project ID (e.g. `call-it-sepolia-123456`). Claude provides the exact `gcloud` command per secret.

### Step 8 — Vercel (frontend host)

1. https://vercel.com → sign in with GitHub.
2. **Add new → Project** → import `Call-it` repo.
3. **Root Directory:** `apps/web`. **Framework Preset:** Next.js.
4. **Environment Variables:** add every `NEXT_PUBLIC_*` from Steps 1–7 (Claude provides the full list).
5. Deploy. Copy the production URL → goes into `NEXT_PUBLIC_OG_BASE_URL` and Coinbase Onramp Allowed Origins.

**Send Claude:** Vercel production URL after first deploy.

---

## Priority 3 — Auxiliary

### Step 9 — Better Stack (production logging) — *optional*

Free tier from Phase 0. https://betterstack.com → create source → copy `BETTERSTACK_SOURCE_TOKEN`. Skip if you don't need production logging yet.

### Step 10 — Telegram bot (Phase 0 alerts)

1. Telegram → search `@BotFather` → `/newbot` → follow prompts. Copy **bot token**.
2. Create two private channels:
   - `call-it-alerts-p0` (paged, mute OFF)
   - `call-it-alerts-p1` (digest, mute ON)
3. Add the bot as admin to both channels.
4. Get each chat ID: send any message in the channel, then visit `https://api.telegram.org/bot<TOKEN>/getUpdates` → find `chat.id` (negative number).

**Send Claude:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID_P0`, `TELEGRAM_CHAT_ID_P1`.

### Step 11 — The Graph Studio (subgraph) — *defer until Sepolia deploy*

After Step 3's Sepolia deploy completes. https://thegraph.com/studio → connect wallet → create subgraph `call-it`. Copy the **Deploy Key**. Claude wires the deploy command when you reach this step.

### Step 12 — Pinata (IPFS) — *Phase 7+, skip for Phase 1*

---

# How to resume with Claude

When you come back, open the project in Claude Code and say one of these:

1. **"Resume Phase 1 operator onboarding — I have values for Step N"** then paste them. Claude wires them and verifies.
2. **"Move to Phase 1.5"** (or **"Move to Phase 2"**). Claude reads this file + `STATE.md` + `01-UAT.md` to pick up context, then starts `/gsd-execute-phase 1.5` or `2`.
3. **"What's the current Phase 01 UAT status?"** Claude reads `01-UAT.md` and tells you what's still open.

## What Claude needs from you per step (paste-back template)

```
Step 1 (Privy):
  NEXT_PUBLIC_PRIVY_APP_ID=
  PRIVY_APP_SECRET=
  PRIVY_WEBHOOK_SECRET=

Step 2 (Alchemy):
  Sepolia API key=
  Mainnet API key=
  Ethereum (ENS) API key=
  Gas Manager Policy ID=

Step 3 (Sepolia deployer):
  Deployer address (public)=
  (private key stays on your machine — do NOT paste it)

Step 4 (Coinbase):
  NEXT_PUBLIC_COINBASE_APP_ID=
  NEXT_PUBLIC_COINBASE_ONRAMP_API_KEY=

Step 5 (Fly):
  Fly app name=
  Public Fly URL=
  POSTGRES_URL=

Step 6 (Upstash):
  UPSTASH_REDIS_REST_URL=
  UPSTASH_REDIS_REST_TOKEN=

Step 7 (GCP):
  GCP project ID (sepolia)=
  GCP project ID (mainnet, later)=

Step 8 (Vercel):
  Vercel production URL=

Step 10 (Telegram):
  TELEGRAM_BOT_TOKEN=
  TELEGRAM_CHAT_ID_P0=
  TELEGRAM_CHAT_ID_P1=
```

## What's the quickest start?

If you want minimum-viable to unblock the most things, do **Steps 1, 2, 5** first (Privy + Alchemy + Fly). That gives you:
- Local web app running with real auth
- Sepolia RPC for any local-fork testing
- A real Fly URL so Privy webhook + Alchemy policy callback are usable
