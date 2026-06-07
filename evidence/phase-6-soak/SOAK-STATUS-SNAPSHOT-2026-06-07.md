# Phase 6 Soak — Status Snapshot (2026-06-07)

Point-in-time snapshot generated 2026-06-07 from on-chain reads + relayer health + evidence
JSONL. Source of truth for the gate remains `EVIDENCE-LOG.md`; this file is the operator's
"where do we stand / what's left" sheet. All targets are **Arbitrum Sepolia**.

---

## 0. Headline

- **Code/logic: done & verified.** The settle blocker (Phase-2 ProfileRegistry lacked
  `globalRep()`) is fixed; settle works end-to-end (5 Pyth calls → "CALLED IT", rep persists).
- **Cluster ownership: RECOVERED.** The 2026-06-06 redeploy moved all 5 contracts to the
  **treasury key `0xDa8c5726` (held by the operator)**. The earlier blocker — "SAFETY-27
  resolve / SAFETY-42 need the lost `0xF4ee6195` key" — is gone, and **both were then RUN AND
  PROVEN** on the recovery cluster (verified on-chain 2026-06-07).
- **On the recovery cluster, SAFETY-22/23/24/25/26/27/42 are ALL green** (SAFETY-25 caller-exit
  proven 2026-06-07 call #12; SAFETY-26 challenge cycle proven 2026-06-07 call #13). What remains
  is wall-clock (48h soak), one time-gated variant (Pyth-wide SAFETY-28), manual UAT, and the
  operator-only multisig rehearsal — **not code.**

## 1. Canonical cluster (owner-key-recovery redeploy 2026-06-06, block 274393587)

| Contract | Address | owner() verified 2026-06-07 |
|---|---|---|
| CallRegistry (CR) | `0xc79bB19dBCA44D8b467b9f7bbb191b56e9fb3CB0` | `0xDa8c5726…A4a5` ✅ |
| FollowFadeMarket (FFM) | `0x188Db2970A46D1541EB712A2302e4a9F67740d82` | `0xDa8c5726…A4a5` ✅ |
| ChallengeEscrow (CE) | `0xC738dBcDBC3aCDCF7E25EB9B7E15bB3911aFf5e6` | `0xDa8c5726…A4a5` ✅ |
| SettlementManager (SM) | `0x2E26eEb3b4CC9FA49B543846ea2E01B7600897e7` | `0xDa8c5726…A4a5` ✅ |
| ProfileRegistry (PR) | `0xF66C0AFEf03b43338FC5aE282e45C0Cf6A3c4820` | `0xDa8c5726…A4a5` ✅ |

**Owner of all 5 = treasury `0xDa8c5726f596E8dae99e6dDEBa8AEa1c8bE9A4a5`** = `SOAK_WALLET_0`
= root `.env` `DEPLOYER_PRIVATE_KEY` (a key the operator holds).

Stylus (Phase 5, not redeployed): proxy `0xe7e15980C40db52BFC6dcaBb21B3d90edFB27c14` (normal),
reverting drill fixture `0x8492faD7eF45a213E498daaA88986f97Fb22b6e1`, ProxyAdmin
`0xAeA5a279DDF1625490c5F4284eF0D735BB56044a`. USDC (Circle Sepolia)
`0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`. Subgraph: `call-it-sepolia` v0.8.0 (indexes this cluster).

Superseded (do not use): old lost-owner-key cluster CR `0xb864308D…` / SM `0x9235003d…` (owner `0xF4ee6195`, key lost).

## 2. Live state (on-chain reads 2026-06-07, block 274798778)

| Probe | Value | Note |
|---|---|---|
| `SM.stylusScoreEngine()` | `0xe7e15980…` | normal engine wired (no drill fixture) — healthy |
| `PR.globalRep(treasury)` | `100` | settle rep-writes landing & persisting |
| `CR.currentTvl()` | `60000000` ($60) | active soak stakes |
| `CR.tvlCap()` | `5000000000` ($5,000) | cap intact |
| treasury ETH | `0.2727 ETH` | enough for owner-signed ops |
| treasury USDC | `12.12 USDC` | |
| SM ETH | `0.05 ETH` | Pyth VAA fee budget |
| relayer `/health` | `{"status":"ok", version:"dev"}` | up @ 2026-06-07T15:39Z |
| last seeded call | #12 @ block 274416848 | ≈ 26h ago — **soak clock not continuous** |

## 3. Gate status (SAFETY-21–28)

| Item | Status | What's left |
|---|---|---|
| SAFETY-21 — ≥48h continuous soak | ⬜ NOT MET | Relayer is up, but no instrumented continuous 48h window. Last activity ~26h ago. **Action: keep relayer up + run periodic activity for a recorded 48h; log start/end.** |
| SAFETY-22 — ≥10 calls all types | ✅ | Re-proven on recovery cluster 2026-06-06 (calls 1–12). |
| SAFETY-23 — ≥30 follow/fade | ✅ | Re-proven 2026-06-06 (15 follow + 15 fade, calls 1–10). |
| SAFETY-24 — ≥3 settles/type, rep verified | ✅ | Re-proven 2026-06-06: calls 1,2,8,9,10,11 settled outcome=CallerWon; 3–7 attestation-pending (Event path); 0 failed. `globalRep` persists. |
| SAFETY-25 — caller-exit | ✅ PROVEN | 2026-06-07: `callerExit(12)` from treasury, tx `0xc5dc9a04…`, `CallerExited` event emitted, $3.55 USDC returned, rep −24 (globalRep 100→76 verified). |
| SAFETY-26 — full challenge cycle | ✅ PROVEN | 2026-06-07 on the recovery cluster: call #13 (caller wallet[0], openToChallenges), challenge #1 propose tx `0xdb1f6dd9…` + accept tx `0x1b7b9de8…`; ChallengeAccepted event + CE escrow $10 verified. |
| SAFETY-27 — dispute raise + owner-resolve | ✅ PROVEN | 2026-06-06 on the recovery cluster: raise tx `0x6bb72713…` + resolve tx `0x353f03b7…` on call #1; verified `SM.disputes(1).resolved=true` (disputer treasury, $5 bond). |
| SAFETY-28 — Pyth confidence-wide retry | ⬜ PENDING | Needs a settle reaching `_settlePyth` with wide confidence (30×60s relayer retry). Time/market-gated. |
| SAFETY-42 — Stylus destruction drill | ✅ PROVEN | 2026-06-06 on the recovery cluster: wired reverting engine (tx `0xcbe13904…`) → settled call #11 via fallback (tx `0x7a3cb02b…`, `RepCalculatedFallback`) → restored normal engine (tx `0x07215588…`); verified `stylusScoreEngine()=0xe7e15980` on-chain. |

Section 2 safety matrix (SAFETY-29–43): 41/41 forge tests green (2026-06-04). Section 4 (5
Phase-4 deferred UAT items) still blank — manual operator UI verification. synthetic-alert cron
still failing daily (needs 4 GH Actions secrets — they live only on GCP/Fly, not GitHub).

## 4. Operator command checklist (copy-paste; fill `<...>` from your own store)

Full detail in `docs/operator/phase-6-soak-tail-runbook.md`. Shared setup (PowerShell):

```powershell
$env:RPC       = "<ARBITRUM_SEPOLIA_RPC_URL>"
$env:OWNER_KEY = "<treasury key = root .env DEPLOYER_PRIVATE_KEY, derives 0xDa8c5726>"
$env:SM        = "0x2E26eEb3b4CC9FA49B543846ea2E01B7600897e7"
$env:CR        = "0xc79bB19dBCA44D8b467b9f7bbb191b56e9fb3CB0"
# sanity — BOTH must print 0xDa8c5726... before spending gas:
cast call $env:SM "owner()(address)" --rpc-url $env:RPC
cast wallet address --private-key $env:OWNER_KEY
```

**SAFETY-27 (dispute raise + resolve) — ✅ ALREADY PROVEN 2026-06-06 (call #1). Below is for reference / re-proving only:**
```powershell
cd apps\relayer
$env:SOAK_PHASES = "F"
$env:SOAK_DISPUTE_CALL_ID = "<a SETTLED callId, e.g. 8>"
$env:SOAK_OWNER_PRIVATE_KEY = $env:OWNER_KEY
npx tsx src/scripts/soak-seeder.ts
cd ..\..
# (or manual: raiseDispute(<id>,0x..01) from any funded wallet, then resolveDispute(<id>,2) from $OWNER_KEY)
```

**SAFETY-42 (destruction drill) — ✅ ALREADY PROVEN 2026-06-06 (call #11; engine restored). Below is for reference / re-proving only — RESTORE engine after!:**
```powershell
# seed a short-expiry settle-able call if needed (wait ~2 min for expiry):
cd apps\relayer; $env:SOAK_PHASES="A"; $env:SOAK_CALL_EXPIRY_SECONDS="120"; npx tsx src/scripts/soak-seeder.ts; cd ..\..
cast send $env:SM "setStylusScoreEngine(address)" 0x8492faD7eF45a213E498daaA88986f97Fb22b6e1 --private-key $env:OWNER_KEY --rpc-url $env:RPC
cast send $env:SM "settle(uint256,bytes[],uint256[])" <CALLID> "[]" "[]" --private-key $env:OWNER_KEY --rpc-url $env:RPC   # watch for RepCalculatedFallback + rep_fallback Telegram alert
cast send $env:SM "setStylusScoreEngine(address)" 0xe7e15980C40db52BFC6dcaBb21B3d90edFB27c14 --private-key $env:OWNER_KEY --rpc-url $env:RPC   # RESTORE — do not skip
cast call $env:SM "stylusScoreEngine()(address)" --rpc-url $env:RPC   # confirm 0xe7e15980...
```

**SAFETY-25 (caller-exit) — ✅ ALREADY PROVEN 2026-06-07 (call #12, tx `0xc5dc9a04…`, globalRep 100→76). Reference command:**
```powershell
cast send $env:FFM "callerExit(uint256)" <CALLID_LIVE_>24h> --private-key <that wallet's key> --rpc-url $env:RPC
# expect CallerExited event (NOT CallerExitLocked / 0x27404ae3)
```

**SAFETY-21 (48h clock):** keep the Fly relayer up and run light periodic seeding; record the
continuous start + end timestamps. No key beyond the seeder wallets.

**synthetic-alert cron:** set 4 GH Actions secrets — `RELAYER_URL`
(`https://call-it-relayer-sepolia.fly.dev`), `RELAYER_INTERNAL_HMAC`, `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_CHAT_ID_P0` — from the GCP/Fly secret store.

## 5. Discrepancies this snapshot corrects

- `STATE.md` and `EVIDENCE-LOG.md` (pre-2026-06-07) describe the **old lost-owner-key cluster**
  (`0xb864308D…` / owner `0xF4ee6195`) as canonical, and list SAFETY-27-resolve / SAFETY-42 as
  blocked on that lost key. **Both are stale.** `addresses.ts`, the soak-tail runbook, and
  on-chain reads all confirm the recovery cluster with owner = treasury. EVIDENCE-LOG header +
  affected rows updated alongside this snapshot.
