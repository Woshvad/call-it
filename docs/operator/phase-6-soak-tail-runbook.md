# Phase 6 Soak-Tail Operator Runbook

Copy-paste command sheet for the **operator-gated** Phase-6 items. Everything here targets
**Arbitrum Sepolia** (mainnet multisig promotion is Phase 10). Nothing in this file contains
secrets — fill the `<...>` placeholders from your own secure store; never paste a private key
into a shared log.

> Updated 2026-06-06 for the **owner-key-recovery redeploy** (block 274393587). The owner of
> all 5 contracts is now the **treasury `0xDa8c5726`** (== `SOAK_WALLET_0`) — a key you control —
> after the previous cluster's `0xF4ee6195` owner key was lost. Addresses below match
> `packages/shared/src/constants/addresses.ts`. Run these only AFTER the relayer rebuild +
> subgraph republish + re-seed (see `phase-6-sepolia-redeploy-runbook.md` steps 8-9).

## 0. Shared context

```
# Canonical Arbitrum Sepolia cluster — owner-key-recovery redeploy 2026-06-06 (all 5 owned by treasury)
CR  (CallRegistry)       0xc79bB19dBCA44D8b467b9f7bbb191b56e9fb3CB0
FFM (FollowFadeMarket)   0x188Db2970A46D1541EB712A2302e4a9F67740d82
CE  (ChallengeEscrow)    0xC738dBcDBC3aCDCF7E25EB9B7E15bB3911aFf5e6
SM  (SettlementManager)  0x2E26eEb3b4CC9FA49B543846ea2E01B7600897e7
PR  (ProfileRegistry)    0xF66C0AFEf03b43338FC5aE282e45C0Cf6A3c4820

# Owner of ALL 5 contracts (every onlyOwner op below is signed by THIS key)
# == treasury == SOAK_WALLET_0 == DEPLOYER_PRIVATE_KEY in root .env (a key you HOLD)
OWNER  0xDa8c5726f596E8dae99e6dDEBa8AEa1c8bE9A4a5

# Stylus rep engine (SAFETY-42) — Phase 5 contracts, NOT redeployed
STYLUS_PROXY        0xe7e15980C40db52BFC6dcaBb21B3d90edFB27c14   # normal engine (restore target)
REVERTING_ENGINE    0x8492faD7eF45a213E498daaA88986f97Fb22b6e1   # drill fixture (reverts on compute)
PROXY_ADMIN         0xAeA5a279DDF1625490c5F4284eF0D735BB56044a

USDC (Circle Sepolia) 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d
```

Set these in your shell first (PowerShell shown; the owner key is your treasury key from root `.env`):

```powershell
$env:RPC       = "<ARBITRUM_SEPOLIA_RPC_URL>"
$env:OWNER_KEY = "<treasury key = root .env DEPLOYER_PRIVATE_KEY, derives 0xDa8c5726>"
$env:SM        = "0x2E26eEb3b4CC9FA49B543846ea2E01B7600897e7"
$env:CR        = "0xc79bB19dBCA44D8b467b9f7bbb191b56e9fb3CB0"
# sanity: both must show 0xDa8c5726...
cast call $env:SM "owner()(address)" --rpc-url $env:RPC
cast wallet address --private-key $env:OWNER_KEY
```

---

## A. SAFETY-27 — dispute raise + owner resolve (fresh cluster)

The new cluster starts empty, so there is no pre-existing dispute — run a full cycle on a
**settled** call from your re-seed. Easiest path is the seeder's standalone Phase F (it does
`raiseDispute` from a funded disputer, then `resolveDispute` from the owner):

```powershell
cd apps\relayer
$env:SOAK_PHASES = "F"
$env:SOAK_DISPUTE_CALL_ID = "<a SETTLED callId from your re-seed>"
$env:SOAK_OWNER_PRIVATE_KEY = $env:OWNER_KEY   # treasury = owner now
npx tsx src/scripts/soak-seeder.ts
cd ..\..
```

Or do it manually with `cast` (raise from any funded wallet, resolve from the owner). Outcomes:
`CallerWon=1`, `CallerLost=2`, `Pending=0` rejected (SettlementManager.sol:540); `resolveDispute`
and `raiseDispute` are at SM:489 / SM:566.

```powershell
cast send $env:SM "raiseDispute(uint256,bytes32)" <CALLID> 0x0000000000000000000000000000000000000000000000000000000000000001 --private-key <funded wallet key> --rpc-url $env:RPC
cast send $env:SM "resolveDispute(uint256,uint8)" <CALLID> 2 --private-key $env:OWNER_KEY --rpc-url $env:RPC
```

✅ **SAFETY-27** = raise (call → `Disputed`) + owner resolve (reversal) both land.

---

## B. SAFETY-42 — Stylus destruction drill (engine swap + fallback)

Point the SM at the reverting engine, settle a call (rep delta reverts → SM falls back +
emits `RepCalculatedFallback` + fires the `rep_fallback` Telegram alert), then restore.
**Relayer must be up** to capture the alert. `setStylusScoreEngine(address)` is `onlyOwner` (SM:647).

```powershell
# need a settle-able (expired, unsettled) call — seed one if needed:
cd apps\relayer; $env:SOAK_PHASES="A"; $env:SOAK_CALL_EXPIRY_SECONDS="120"; npx tsx src/scripts/soak-seeder.ts; cd ..\..
# (wait ~2 min for expiry, then clear: Remove-Item Env:\SOAK_PHASES, Env:\SOAK_CALL_EXPIRY_SECONDS)

# 1) wire the reverting engine
cast send $env:SM "setStylusScoreEngine(address)" 0x8492faD7eF45a213E498daaA88986f97Fb22b6e1 --private-key $env:OWNER_KEY --rpc-url $env:RPC
# 2) settle the expired call (fallback fires)
cast send $env:SM "settle(uint256,bytes[],uint256[])" <CALLID> "[]" "[]" --private-key $env:OWNER_KEY --rpc-url $env:RPC
#    -> watch for RepCalculatedFallback event + rep_fallback Telegram alert
# 3) RESTORE the real engine (do NOT skip)
cast send $env:SM "setStylusScoreEngine(address)" 0xe7e15980C40db52BFC6dcaBb21B3d90edFB27c14 --private-key $env:OWNER_KEY --rpc-url $env:RPC
# 4) confirm
cast call $env:SM "stylusScoreEngine()(address)" --rpc-url $env:RPC   # -> 0xe7e15980...
```

Record the fallback tx hash + alert screenshot in `evidence/phase-6-soak/EVIDENCE-LOG.md`.

---

## C. 06-06 — Sepolia multisig promotion rehearsal

Transfers all 5 contracts + ProxyAdmin to a 2-of-3 Safe, then proves Safe-gated `pause` +
`upgrade`. **Sepolia rehearsal only.** The transfer script's addresses are the new cluster
(no source edit needed). `deploy-safe.ts` is protocol-kit-v7 but not runtime-tested — `--dry-run` first.

```powershell
# 1) Safe owners (3 hardware-wallet addresses) + deploy
$env:SAFE_SIGNER_1="<owner 1>"; $env:SAFE_SIGNER_2="<owner 2>"; $env:SAFE_SIGNER_3="<owner 3>"
pnpm tsx scripts/deploy-safe.ts --network sepolia --dry-run  --signer-source env
pnpm tsx scripts/deploy-safe.ts --network sepolia --execute  --signer-source env
$env:SAFE_ADDRESS = "<SAFE_ADDRESS from --execute>"

# 2) set pendingOwner=Safe (x5) + transfer ProxyAdmin. DEPLOYER_PRIVATE_KEY MUST be the owner
#    key (treasury 0xDa8c5726) — transferOwnership is onlyOwner. Run from packages/contracts.
cd packages\contracts
$env:DEPLOYER_PRIVATE_KEY = $env:OWNER_KEY
forge script script/TransferOwnershipToSafe.s.sol:TransferOwnershipToSafe --rpc-url $env:RPC --broadcast
cd ..\..

# 3) Safe accepts ownership (2-of-3 batch)
$env:SIGNER_1_PRIVATE_KEY="<safe signer 1>"; $env:SIGNER_2_PRIVATE_KEY="<safe signer 2>"; $env:RPC_URL_ARBITRUM_SEPOLIA=$env:RPC
pnpm tsx scripts/rehearse-ownership.ts --network sepolia

# 4) prove Safe-gated pause via the Safe UI (app.safe.global), then verify:
cast call $env:CR "paused()(bool)" --rpc-url $env:RPC   # -> true after pause, false after unpause
```

After it, add the `SAFE_ARBITRUM_SEPOLIA` constant to `addresses.ts`.

---

## Footguns

- **Owner = treasury = `SOAK_WALLET_0` now.** After the 2026-06-06 recovery redeploy, every
  `onlyOwner` op (resolveDispute, setStylusScoreEngine, transferOwnership, pause, addAsset,
  setTvlCap) is signed by `0xDa8c5726` — the treasury key you hold (root `.env`
  `DEPLOYER_PRIVATE_KEY`). The old `0xF4ee6195` owner key was lost; that cluster is dead.
- **Step 0's two checks must both print `0xDa8c5726`** before you spend gas.
- **Always restore the Stylus engine** after SAFETY-42 (B.3) — a wired reverting engine
  degrades every settlement to the Solidity baseline.
- **Sepolia only.** `--signer-source env` is forbidden on `--network arbitrum-one`; the mainnet
  transfer needs all 6 constants in `TransferOwnershipToSafe.s.sol` updated to mainnet (GATE 2),
  Phase 10. On mainnet, the deploy key = the owner — use a hardware wallet + back it up (this
  whole episode is why).
- **Time-gated, no key needed:** SAFETY-21 (48h soak, relayer up), SAFETY-25 (wait 24h after a
  call's creation, then `callerExit`), SAFETY-28 (Pyth confidence-wide variant).
