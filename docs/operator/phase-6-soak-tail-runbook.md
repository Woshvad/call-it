# Phase 6 Soak-Tail Operator Runbook

Copy-paste command sheet for the **operator-gated** Phase-6 items that need the
contract-owner key. Everything here targets **Arbitrum Sepolia** (mainnet multisig
promotion is Phase 10). Nothing in this file contains secrets — fill the `<...>`
placeholders from your own secure store; never paste a private key into a shared log.

> Generated 2026-06-06 alongside the soak-tail cleanups (commits `a53b170` / `865d33a` /
> `23dfac7` / `4808825`). Addresses below are the canonical Phase-6 cluster, verified
> against `packages/shared/src/constants/addresses.ts`.

## 0. Shared context

```
# Canonical Arbitrum Sepolia cluster (all 5 owned by 0xF4ee6195)
CR  (CallRegistry)       0xb864308D7214f98d60C5811F451fa96a49619150
FFM (FollowFadeMarket)   0xBDaD3F1E608452fea36a7861cDd8BBb73D9D10c1
CE  (ChallengeEscrow)    0x2E11fD3E03acE074D855661Bc4320bddbE897714
SM  (SettlementManager)  0x9235003d9C9F38539a41d9798c32C72e7615428A
PR  (ProfileRegistry)    0xE82308B350013fA0dcc11fEF10B3F0bf684EFd14

# Owner of ALL 5 contracts (every onlyOwner op below is signed by THIS key)
OWNER  0xF4ee61950B63cCA5C82f1146484d018Ac95Bd0F2

# Stylus rep engine (SAFETY-42)
STYLUS_PROXY        0xe7e15980C40db52BFC6dcaBb21B3d90edFB27c14   # normal engine (restore target)
REVERTING_ENGINE    0x8492faD7eF45a213E498daaA88986f97Fb22b6e1   # drill fixture (reverts on compute)
PROXY_ADMIN         0xAeA5a279DDF1625490c5F4284eF0D735BB56044a

USDC (Circle Sepolia) 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d
```

Set these in your shell first (the owner key stays only in your shell history / secret store):

```bash
export RPC=<ARBITRUM_SEPOLIA_RPC_URL>
export OWNER_KEY=<private key for 0xF4ee61950B63cCA5C82f1146484d018Ac95Bd0F2>
export SM=0x9235003d9C9F38539a41d9798c32C72e7615428A
```

---

## A. SAFETY-27 — finish the dispute resolution (1 command)

Call **#8** is already `Disputed` (the `raiseDispute` landed this session). This finalizes it
with a `CallerLost` reversal. `resolveDispute(uint256,uint8)` is `onlyOwner` (SettlementManager.sol:489);
outcomes are `CallerWon=1`, `CallerLost=2`, `Pending=0` is rejected (SettlementManager.sol:540).

```bash
cast send $SM "resolveDispute(uint256,uint8)" 8 2 \
  --private-key $OWNER_KEY --rpc-url $RPC
```

Verify (call #8 outcome flips, dispute closed):

```bash
# CallRegistry stores the final outcome; expect CallerLost (2)
cast call 0xb864308D7214f98d60C5811F451fa96a49619150 "calls(uint256)" 8 --rpc-url $RPC
```

This closes **SAFETY-27** (raise + resolve both proven).

---

## B. SAFETY-42 — Stylus destruction drill (engine swap + fallback)

Proves `SettlementManager`'s try/catch fallback fires when the rep engine reverts:
point the SM at the reverting engine, settle a call (the rep delta computation reverts,
SM falls back to the Solidity baseline and emits the fallback event + fires the
`rep_fallback` Telegram alert), then restore the real engine.

**Pre-req:** the relayer must be up (to capture the alert), and you need a settle-able
(expired, unsettled) call. Seed a short-expiry one if needed:

```bash
# from apps/relayer — one fresh ~2-min-expiry call, then wait for expiry
cd apps/relayer
SOAK_PHASES=A SOAK_CALL_EXPIRY_SECONDS=120 npx tsx src/scripts/soak-seeder.ts
cd ../..
```

`setStylusScoreEngine(address)` is `onlyOwner` (SettlementManager.sol:647).

```bash
# 1) wire the reverting engine
cast send $SM "setStylusScoreEngine(address)" 0x8492faD7eF45a213E498daaA88986f97Fb22b6e1 \
  --private-key $OWNER_KEY --rpc-url $RPC

# 2) settle the expired call (rep compute reverts -> SM fallback fires)
#    use settle-pyth-calls.ts for a Pyth call, or cast settle directly for an event call:
cast send $SM "settle(uint256,bytes[],uint256[])" <CALL_ID> "[]" "[]" \
  --private-key $OWNER_KEY --rpc-url $RPC
#    -> watch for the RepCalculatedFallback event + the rep_fallback Telegram alert

# 3) RESTORE the real Stylus engine (do NOT skip)
cast send $SM "setStylusScoreEngine(address)" 0xe7e15980C40db52BFC6dcaBb21B3d90edFB27c14 \
  --private-key $OWNER_KEY --rpc-url $RPC

# 4) confirm restored
cast call $SM "stylusScoreEngine()(address)" --rpc-url $RPC   # -> 0xe7e15980...
```

> Note: confirm the getter name `stylusScoreEngine()` against SettlementManager.sol if step 4
> reverts (the setter is `setStylusScoreEngine`; the public var should expose the same name).
> Record the fallback tx hash + alert screenshot in `evidence/phase-6-soak/EVIDENCE-LOG.md`.

---

## C. 06-06 — Sepolia multisig promotion rehearsal

Transfers ownership of all 5 contracts + ProxyAdmin to a 2-of-3 Safe, then proves
Safe-gated `pause` + `upgrade`. **Sepolia rehearsal only** — production Arbitrum One
transfer is Phase 10.

> `deploy-safe.ts` was migrated to Safe protocol-kit v7 but is **not** runtime-tested —
> always `--dry-run` first. The `TransferOwnershipToSafe.s.sol` address constants are now
> the canonical cluster (refreshed in `4808825`), so **no source edit is needed**.

```bash
# 1) Predict the Safe address (no broadcast)
pnpm tsx scripts/deploy-safe.ts --network sepolia --dry-run --signer-source env

# 2) Deploy the Safe (Sepolia; env signer source is allowed on Sepolia, forbidden on mainnet)
pnpm tsx scripts/deploy-safe.ts --network sepolia --execute --signer-source env
#    -> note the SAFE_ADDRESS it prints

export SAFE_ADDRESS=<address from step 2>

# 3) Set pendingOwner = Safe on all 5 (Ownable2Step) + transfer ProxyAdmin (immediate).
#    DEPLOYER_PRIVATE_KEY here MUST be the current owner key (0xF4ee6195), NOT a soak wallet —
#    transferOwnership is onlyOwner. Run from packages/contracts.
cd packages/contracts
DEPLOYER_PRIVATE_KEY=$OWNER_KEY SAFE_ADDRESS=$SAFE_ADDRESS \
  forge script script/TransferOwnershipToSafe.s.sol:TransferOwnershipToSafe \
  --rpc-url $RPC --broadcast
cd ../..
#    -> post-broadcast require()s assert pendingOwner==Safe (x5) and ProxyAdmin.owner()==Safe

# 4) Safe executes acceptOwnership() on the 5 Ownable2Step contracts (2-of-3 batch).
#    SIGNER_1/2_PRIVATE_KEY are two of the three Safe co-signers.
SAFE_ADDRESS=$SAFE_ADDRESS \
  SIGNER_1_PRIVATE_KEY=<safe signer 1> SIGNER_2_PRIVATE_KEY=<safe signer 2> \
  RPC_URL_ARBITRUM_SEPOLIA=$RPC \
  pnpm tsx scripts/rehearse-ownership.ts --network sepolia
#    -> verifies owner()==Safe for all 5

# 5) Prove Safe-gated ops via the Safe UI (app.safe.global):
#    a) Propose pause() on CR -> 2nd signer confirms -> execute
cast call 0xb864308D7214f98d60C5811F451fa96a49619150 "paused()(bool)" --rpc-url $RPC   # -> true
#    b) Propose unpause() -> execute
cast call 0xb864308D7214f98d60C5811F451fa96a49619150 "paused()(bool)" --rpc-url $RPC   # -> false
#    c) Propose ProxyAdmin.upgradeAndCall(proxy, baseline, "") -> execute -> verify impl slot -> restore
```

This signals **multisig-promoted** for the Sepolia rehearsal. After it, update
`addresses.ts` with the `SAFE_ARBITRUM_SEPOLIA` constant.

---

## Footguns

- **Owner ≠ deployer.** Every `onlyOwner` op (resolveDispute, setStylusScoreEngine,
  transferOwnership, pause, setTvlCap, addAsset) is signed by **`0xF4ee6195`**, not any
  `SOAK_WALLET` and not treasury `0xDa8c5726`.
- **Always restore the Stylus engine** after SAFETY-42 (step B.3) — leaving the reverting
  engine wired degrades every settlement to the Solidity baseline.
- **Sepolia only.** `--signer-source env` is forbidden on `--network arbitrum-one`; the
  mainnet transfer requires updating all 6 constants in `TransferOwnershipToSafe.s.sol`
  (GATE 2) and is deferred to Phase 10.
- **Time-gated, no key needed:** SAFETY-21 (48h continuous soak, relayer up),
  SAFETY-25 (wait 24h after a call's creation, then `callerExit`), SAFETY-28 (Pyth
  confidence-wide variant).
