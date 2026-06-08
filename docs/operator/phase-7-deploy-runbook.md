# Phase 7 Deploy Runbook — Sepolia recovery cluster share-loop go-live

**Plan:** 07-06 (operator-gated) · **Cluster:** Arbitrum Sepolia (owner-key-recovery, owner = treasury `0xDa8c5726f596E8dae99e6dDEBa8AEa1c8bE9A4a5`)
**Status:** CI-safe code shipped (Plan 07-06 Task 1). The steps below are the **human-action gate** — they require operator credentials this automated session cannot supply.

> **Scope guard (D-01):** This runbook publishes the subgraph to the existing **Sepolia Studio** ONLY. There is **NO Decentralized-Network publish** and **NO `api.callitapp.xyz` cutover** — both are **Phase 10** (they need mainnet contracts). Do not run a DN publish here.

> **What this unblocks:** the parked Phase-4 UAT-1/2/3 (visual page render), the live PITFALLS share-loop checks (Twitter Card Validator, og:image server-render, incognito public-receipt, auto-post cache-warm), and dogfooding the new Profile / Leaderboard / Quote pages.

---

## Canonical references

- Cluster addresses (on-chain owner-verified 2026-06-07): PR `0xF66C0AFEf03b43338FC5aE282e45C0Cf6A3c4820` · CR `0xc79bB19dBCA44D8b467b9f7bbb191b56e9fb3CB0` · FFM `0x188Db2970A46D1541EB712A2302e4a9F67740d82` · CE `0xC738dBcDBC3aCDCF7E25EB9B7E15bB3911aFf5e6` · SM `0x2E26eEb3b4CC9FA49B543846ea2E01B7600897e7`
- Current Studio subgraph: `call-it-sepolia` **v0.8.0** → publish **v0.9.0** here (adds `Call.statement`, Plan 07-02).
- Relayer: Fly app `call-it-relayer-sepolia` (LIVE). Relayer Postgres: see `fly proxy` notes below.
- `docs/phase-0-deploy-checklist.md` — Vercel `call-it-web-sepolia` + `NEXT_PUBLIC_OG_BASE_URL` deploy notes.

## Operator secrets required (none committed)

| Secret | Used in | Notes |
|--------|---------|-------|
| `SUBGRAPH_STUDIO_DEPLOY_KEY` | Step 1 (subgraph publish) | Studio deploy key; NEVER in `NEXT_PUBLIC_*` (T-07-06-02 / D-27). |
| Relayer Postgres credentials (`POSTGRES_URL` / `DATABASE_URL`) | Step 2 (migrations) | Via `fly proxy` tunnel to the Sepolia relayer DB. |
| Vercel account + project access | Step 3 (web deploy) | `call-it-web-sepolia` project. |
| Fly access (`fly` CLI authed) | Step 4 (CORS secret) | `fly secrets set ... -a call-it-relayer-sepolia`. |

---

## Step 1 — Publish subgraph v0.9.0 to Sepolia Studio (D-01, OPS-04)

```bash
# Build the v0.9.0 artifact (codegen + build; from Plan 07-02 — adds Call.statement)
pnpm --filter @call-it/subgraph build

# Authenticate the Studio deploy key (one-time per shell)
graph auth --studio "$SUBGRAPH_STUDIO_DEPLOY_KEY"

# Publish v0.9.0 to the EXISTING Sepolia Studio subgraph (NO Decentralized Network)
graph deploy --node https://api.studio.thegraph.com/deploy/ call-it-sepolia --version-label v0.9.0
```

Then bump the query URL in the repo (commit on master, NOT in this gated session):

```ts
// packages/shared/src/constants/addresses.ts
export const SUBGRAPH_URL_SEPOLIA =
  'https://api.studio.thegraph.com/query/1754389/call-it-sepolia/v0.9.0' as const;
```

**AUTHORITATIVE coverage run (OPS-04 — must exit 0):**

```bash
# All ~20 events index + CallCreated <30s sync-lag. Provide the live v0.9.0 endpoint
# and a freshly-seeded callId (from your seed run on the recovery cluster).
node packages/subgraph/scripts/verify-event-coverage.ts \
  --endpoint https://api.studio.thegraph.com/query/1754389/call-it-sepolia/v0.9.0 \
  --seeded-call-id <FRESH_CALL_ID>
```

- The script prints a coverage table and **exits 0** only when every core event is indexed and CallCreated for `<FRESH_CALL_ID>` appears within 30s.
- Rare paths (Dispute / ForceSettle / Challenge*) print a non-fatal `WARN` if your seed run didn't exercise them — that is expected; the core money/rep paths (CallCreated, CallSettled, Followed, Faded, CallerExited, RepCalculated, ProfileUpdated) are hard-fail.
- **Keep the Phase-0 polled-events fallback LIVE** during the post-publish sync gap.

---

## Step 2 — Apply BOTH relayer DB migrations to the Sepolia relayer Postgres

The two new workers read these at runtime. Apply **both** or the workers degrade/crash:

- **`call_statement`** enrichment column/table — migration **0006** (Plan 07-02, the `marketLine` source).
- **`posted_receipts`** dedup table — migration **0007** (Plan 07-04, the auto-post worker reads it; generated but NOT yet applied to the remote DB).

```bash
# Open a tunnel to the Sepolia relayer Postgres (Fly). Adjust local port if 5433 is busy.
fly proxy 5433:5432 -a <relayer-postgres-app>

# In a second shell, point the relayer migrator at the tunnel and apply:
export POSTGRES_URL="postgres://<user>:<pass>@127.0.0.1:5433/<db>"
pnpm --filter @call-it/relayer db:migrate
```

**Confirm both exist on the remote DB:**

```bash
psql "$POSTGRES_URL" -c "\d posted_receipts"   # expect: call_id PK
psql "$POSTGRES_URL" -c "\d call_statement"     # expect: call_id PK, statement text, created_at
```

> Without `posted_receipts` (0007) the auto-post worker's dedup read fails at runtime (the worker is never-throw, so it degrades — but it cannot record posted state). Without `call_statement` (0006) the `marketLine` enrichment is empty and the OG falls back to the subgraph templated mirror.

---

## Step 3 — Deploy `apps/web` to Vercel (`call-it-web-sepolia`) — NEXT_PUBLIC_* BEFORE build (Pitfall 5)

**CRITICAL (Pitfall 5 / T-07-06-03):** `NEXT_PUBLIC_*` are baked at **build time**. Set them in the Vercel project **before** triggering the build, else a wrong subgraph/relayer URL ships silently.

Set in the Vercel `call-it-web-sepolia` project env (Production):

| Var | Value |
|-----|-------|
| `NEXT_PUBLIC_OG_BASE_URL` | the Vercel deployment origin (D-12) — e.g. `https://call-it-web-sepolia.vercel.app` |
| `NEXT_PUBLIC_RELAYER_URL` / `NEXT_PUBLIC_RELAYER_BASE_URL` | `https://call-it-relayer-sepolia.fly.dev` |
| `NEXT_PUBLIC_SUBGRAPH_URL` | the **v0.9.0** Studio query URL (Step 1) |

Then deploy:

```bash
# From repo root, with the Vercel project linked:
vercel --prod
# (or push to the production branch wired to call-it-web-sepolia)
```

Record the deployed origin: `__________________________________`

---

## Step 4 — Add the Vercel origin to the Fly relayer CORS allowlist (env-only, D-04)

The relayer CORS allowlist is **env-driven** (`apps/relayer/src/index.ts` — `NEXT_PUBLIC_OG_BASE_URL` + `CORS_ALLOWED_ORIGINS`). No code change.

```bash
# Either set CORS_ALLOWED_ORIGINS or NEXT_PUBLIC_OG_BASE_URL to the exact Vercel origin:
fly secrets set CORS_ALLOWED_ORIGINS="<vercel-origin>" -a call-it-relayer-sepolia
# (fly secrets set restarts the app automatically; if not, `fly apps restart call-it-relayer-sepolia`)
```

Confirm the auto-post posture (D-02): `X_API_WRITE_TOKEN` stays **UNSET** (auto-post degrades to a no-op) and `AUTO_POST_ENABLED` is default-ON. Optionally set `AUTO_POST_DELAY_MS` to a short post-settle delay (Pitfall-18).

---

## Step 5 — Post-deploy CORS preflight smoke (T-07-06-01)

```bash
# The OPTIONS preflight from the Vercel origin must echo that EXACT origin, NOT '*'.
curl -i -X OPTIONS https://call-it-relayer-sepolia.fly.dev/api/feed \
  -H "Origin: <vercel-origin>" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization,content-type"
```

Expect `Access-Control-Allow-Origin: <vercel-origin>` (the exact origin, **not** `*`).

Then, in an **incognito** window (no Privy session), load and confirm hydration with NO CORS error in the console (unblocks Phase-4 UAT-1/2/3):

- [ ] `/call/<id>` (receipt) — loads 200, `/api/calls/:id/live-state` hydrates
- [ ] `/leaderboard` — loads 200, `/api/feed` (or leaderboard read) hydrates
- [ ] `/profile/<address>` — loads 200, profile read hydrates

---

## Step 6 — Twitter Card Validator checklist (SHARE-13, D-08 — operator checklist, NOT CI)

> ⚠️ **`cards-dev.twitter.com/validator` was shut down by X in 2022 — it no longer exists.** Validate the modern equivalent instead: (a) `curl <url>` and confirm the `<head>` emits `twitter:card content="summary_large_image"` + an absolute `og:image`/`twitter:image`, (b) `curl` that image URL → expect `200 image/png`, and (c) paste the URL into an X post composer (or opengraph.xyz) for the human visual preview. The table's "twitter card preview" column = the step-(c) browser check.

Confirm the card preview + image render for each of the **5 variant receipt URLs**. Record pass/fail:

| Variant | Receipt URL | card meta wired | og:image renders | preview (browser) | Pass/Fail |
|---------|-------------|-----------------|------------------|-------------------|-----------|
| Live | `<vercel-origin>/call/<live-id>` | ✅ verified 2026-06-08 (curl) | ✅ 200 image/png | ☐ | |
| Settled | `<vercel-origin>/call/<settled-id>` | ✅ same `/call/[id]` layout | ☐ (needs seeded settled call) | ☐ | |
| DuelSettled | `<vercel-origin>/duel/<challenge-id>` | ✅ **FIXED 2026-06-08** (commit `57a402c`) — was missing entirely | ✅ `/og/duel/<id>` 200 image/png | ☐ | |
| CallerExited | `<vercel-origin>/call/<exited-id>` | ✅ same `/call/[id]` layout | ☐ (needs seeded exited call) | ☐ | |
| Fallback | `<vercel-origin>/call/<unknown-id>` (catch-all → fallback) | ✅ verified 2026-06-08 (curl) | ✅ 200 image/png | ☐ | |

> **DuelSettled gap found + fixed during this residual (quick task `260608-ep8`).** The `/duel/[challengeId]` route was a `'use client'` page with no metadata layout, so it emitted only Next's default `twitter:card=summary` with NO `og:image` — a duel link pasted into X showed a tiny imageless card. Added `apps/web/app/duel/[challengeId]/layout.tsx` (server component, mirrors `/call/[id]/layout.tsx`) emitting `summary_large_image` → `/og/duel/<id>?v=<statusOrdinal>`. **Redeploy required** before the DuelSettled row can be confirmed live.

> The `?v={statusVersion}` cache-buster on the receipt meta (T-07-06-04) ensures Twitter's crawler fetches the current variant. If a stale card shows, bump statusVersion (a status transition) and re-validate. (Duel cache-buster: the relayer duel endpoint returns a status *label*, mapped to an ordinal Proposed=0…Settled=4 in the duel layout.)

---

## Outputs to record (paste back into this runbook + the SUMMARY when done)

- Deployed Vercel origin: `https://call-it-web-sepolia.vercel.app` ✅ deployed 2026-06-08 (matches baked `NEXT_PUBLIC_OG_BASE_URL`). Vercel monorepo config: Root Directory = `apps/web` + `apps/web/vercel.json` (pnpm install/build at workspace root) + root `.vercelignore`. Smoke: `/` →307→`/signin`→200, `/feed` 200, `/leaderboard` 200, fallback OG `/og/fallback` → 200 image/png 40KB, subgraph `_meta` block 275026674 `hasIndexingErrors:false`, relayer `/api/feed` 200 JSON.
- v0.9.0 Studio query endpoint: `https://api.studio.thegraph.com/query/1754389/call-it-sepolia/v0.9.0` ✅ published 2026-06-08 (build `QmYrrSgVxrpgg3Bgc7P1e2ZjdGNSjW3fhExcsieVPgcimJ`); `SUBGRAPH_URL_SEPOLIA` bumped in commit `1b0f9ff`
- Coverage script result (exit code + table): ✅ **PASSED 2026-06-08** (exit 0). `verify-event-coverage.ts --endpoint <v0.9.0> --seeded-call-id 14`: all core fail-on-empty events OK; 8 rare paths empty (non-fatal); **OPS-04 sync-lag probe: CallCreated id=14 indexed in 265ms (< 30000ms budget)**.
- Migration confirmation (`\d posted_receipts` + `\d call_statement`): ✅ both applied to remote Sepolia DB `call_it_relayer_sepolia` 2026-06-08 via `db:migrate` (0006 + 0007); verified `call_statement(call_id PK, statement text, created_at)` + `posted_receipts(call_id PK, posted_at)` exist. Applied over a `fly proxy 5499:5432 -a call-it-pg-sepolia` tunnel. NOTE: relayer reads the DB via `DATABASE_URL`; drizzle-kit reads `POSTGRES_URL`.
- CORS OPTIONS preflight `Access-Control-Allow-Origin` value: ✅ `https://call-it-web-sepolia.vercel.app` (exact origin, NOT `*`) — 204 preflight, methods `GET, POST, PATCH, OPTIONS`, `vary: Origin`. Set via `fly secrets set CORS_ALLOWED_ORIGINS=… -a call-it-relayer-sepolia` 2026-06-08 (machine restarted healthy). Incognito hydration spot-check (visual) still operator-pending but CORS+200s confirmed by curl.
- Twitter Card Validator results (5/5): 🟢 **CARD META CONFIRMED LIVE 2026-06-08; only browser visual preview remains.** Curl ground-truth from `call-it-web-sepolia.vercel.app` AFTER the green GitHub auto-deploy (`a5357bc`): `/call/[id]` AND `/duel/1` both emit `summary_large_image` + absolute `og:image`; all OG images return 200 image/png (`/og/1` 49KB, `/og/duel/1` 39KB, `/og/fallback` 41KB). **DuelSettled meta was missing — fixed (quick `260608-ep8`, `57a402c`) and now live.** `cards-dev.twitter.com/validator` is dead (X shut it down 2022) — used X post-composer / opengraph.xyz instead. **✅ BROWSER VISUAL PREVIEW CONFIRMED BY OPERATOR 2026-06-08** (large-image cards render correctly for /call + /duel). Twitter-card residual is now CLOSED except for seeded-content rendering (Settled/Exited/DuelSettled *rendered images* show pre-settle/placeholder state until a settled call/duel is seeded — folds into the residual-2 seed run).

- Vercel GitHub auto-deploy (NEW 2026-06-08): now wired + green. **KEY GOTCHA:** the CLI deploys worked only because they uploaded a locally-prebuilt `packages/shared/dist`; the git auto-deploy does a clean checkout where `dist` (gitignored) is absent, so the build failed with `Module not found: Can't resolve '@call-it/shared'`. Fixed in quick `260608-kqh` (`588a629`): `apps/web/vercel.json` buildCommand now `cd ../.. && pnpm --filter @call-it/shared build && pnpm --filter @call-it/web build` (build the shared workspace dep before web). Vercel project config that makes git-deploy work: Root Directory=`apps/web`, reads `apps/web/vercel.json`, Production Branch=`master`.
- 200px outcome-word baselines (SC1) + authoritative `verify-event-coverage.ts` (OPS-04 live): ✅ **DONE 2026-06-08 — true 5/5.** Seed: `seed-loss-call.ts` (quick `260608-lwe`/`260608-kqh`-fix `77e32ad`) created call **#14** (PriceTarget, target $1M 8-dp → guaranteed CallerLost), settled via `settle-pyth-calls.ts 14` → `CallerLost`. Baseline sources (committed `596a779`): CALLED IT=`/og/2`, CONTRARIAN HIT=`/og/9`, COLD CALL=`/og/11`, LOUD AND WRONG=`/og/14`, FADED CORRECTLY=`/og/14?as=fader`. 5 baseline PNGs generated against the deployed endpoint (`OG_200PX_BASELINES=1 --update-snapshots`); all 5 words legible at 200px (eyeballed). OPS-04 coverage PASSED (call 14 indexed 265ms).
  - **CONTRARIAN HIT — NOW DELIVERED (quick `260608-n31`, `f3ecc53`):** wired `fadeRealShare` from subgraph Positions into `getSettledFields` + the OG route (was hardcoded `0`). `/og/9` (call 9: fade $2/follow $1 = 0.667 real fade, repDelta +10) now renders CONTRARIAN HIT live. No longer a deferral.
  - **Subgraph repoint (2026-06-08, `4fc4cea`):** the Studio dev query node dropped the `v0.9.0` version label ("deployment does not exist") while Studio showed "deployed". Re-published the same build under **v0.9.1** and made the web read `SUBGRAPH_URL_SEPOLIA` authoritatively (NOT the stale baked `NEXT_PUBLIC_SUBGRAPH_URL` env). `SUBGRAPH_URL_SEPOLIA` bumped to v0.9.1. (Durable DN endpoint is still Phase 10 — this dev-endpoint churn is exactly what DN publish fixes.)
- Incognito hydration spot-check (residual 6c): ⏳ **OPERATOR-PENDING** (browser) — open `/call/14`, `/leaderboard`, and `/profile/0xDa8c5726f596E8dae99e6dDEBa8AEa1c8bE9A4a5` (profile route needs an `[address]`; bare `/profile` is 404 by design) in an incognito window; confirm they render without hydration errors. Closes the parked Phase-4 UAT-1/2/3. Automated proxy already confirmed `/call/14` + `/leaderboard` return 200 with no hydration-error markers; CORS + 200s curl-confirmed.

---

## Deferred to Phase 10 (do NOT do here)

- Decentralized-Network subgraph publish (~3,000 GRT) — needs mainnet contracts.
- `api.callitapp.xyz` OG domain cutover — Sepolia uses the Vercel origin via `NEXT_PUBLIC_OG_BASE_URL`.
- `X_API_WRITE_TOKEN` provisioning — activates auto-post with zero code change (D-02), when budgeted.
