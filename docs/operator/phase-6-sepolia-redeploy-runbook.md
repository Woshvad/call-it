# Phase 6 — Sepolia Cluster Redeploy (owner-key recovery)

**Why:** the current Sepolia cluster is owned by `0xF4ee6195`, whose private key is not
recoverable (it was almost certainly the deleted `packages/contracts/.env` from the
2026-06-04 deploy). This redeploys the full cluster signed by the **treasury key
`0xDa8c5726`** — which you DO control (it's `DEPLOYER_PRIVATE_KEY` in the root `.env` and
also `SOAK_WALLET_0`). After this, `owner()` of all 5 contracts == `0xDa8c5726`, every
owner-gated item unblocks, and the key is safely backed up (no repeat of the loss).

**Sepolia only.** Mainnet uses the SAME `DeployPhase6` script — but on mainnet the deploy
key must be a hardware wallet you back up, with an immediate `owner()` check (Phase 10).

> `DeployPhase6.s.sol` is fully self-contained: it deploys a fresh `ProfileRegistry`
> (with `globalRep`), CR/FFM/CE/SM, wires every cross-ref, both rep-writers,
> `setStylusScoreEngine`, 8× `setAdapterMap`, 6× `setAttestationSigner` (from KMS env),
> and 24 coins + 6 NFTs via `addAsset`, with post-deploy assertions. The only manual
> post-step is funding the new SM with 0.05 ETH.

---

## Step 1 — Create `packages/contracts/.env`

Foundry auto-loads `.env` from the foundry root (`packages/contracts/`). Create it with
the 7 vars below. **Fill `DEPLOYER_PRIVATE_KEY` with your treasury key** (the same value as
`DEPLOYER_PRIVATE_KEY` in the **root** `.env` — it derives `0xDa8c5726`). The 4 KMS
addresses are prefilled (they're the relayer's GCP-KMS signer addresses, carried over
unchanged from the live SM). Keep a backup of this key this time.

```dotenv
# packages/contracts/.env   (gitignored — do NOT commit)
DEPLOYER_PRIVATE_KEY=<your treasury key — same as root .env, derives 0xDa8c5726>
TREASURY_ADDRESS=0xDa8c5726f596E8dae99e6dDEBa8AEa1c8bE9A4a5
ARBITRUM_SEPOLIA_RPC_URL=<your Alchemy Arbitrum Sepolia RPC URL>
KMS_ADDRESS_NFT_TWAP=0x1333F8Ab1Ccdac57B7D5E39E30d558fC569bdEA9
KMS_ADDRESS_DEFILLAMA=0x299e9E875dEEDBabB65bE7F3Fe86172416D4B203
KMS_ADDRESS_SNAPSHOT_TALLY=0x6437477DA7f2D23d1b2C623d407D465C019A0d89
KMS_ADDRESS_CEX=0xe3b415A00e45Ff9214fa43E7Cb4984F9dc137131
```

---

## Step 2 — Fund the treasury for gas

The deploy is ~57 txs + a 0.05 ETH SM funding. Current balance ~0.17 ETH; top up to
**≥0.3 ETH** to be safe (Arbitrum Sepolia faucet → `0xDa8c5726f596E8dae99e6dDEBa8AEa1c8bE9A4a5`).

```powershell
cast balance 0xDa8c5726f596E8dae99e6dDEBa8AEa1c8bE9A4a5 --rpc-url $env:RPC | cast to-unit - ether
```

---

## Step 3 — Dry-run (no broadcast)

Run from `packages/contracts`. **Must hit Sepolia (chainId 421614)** — `resolveUsdc()`
reverts on Foundry's default 31337.

```powershell
cd packages\contracts
forge script script/DeployPhase6.s.sol:DeployPhase6 `
  --rpc-url $env:ARBITRUM_SEPOLIA_RPC_URL --sig "run()"
```
Expect it to simulate cleanly and print the 5 would-be addresses + the post-deploy
assertions passing (globalRep tripwire, rep-writers, asset allowlist).

---

## Step 4 — Broadcast (the real deploy)

```powershell
forge script script/DeployPhase6.s.sol:DeployPhase6 `
  --rpc-url $env:ARBITRUM_SEPOLIA_RPC_URL --sig "run()" --broadcast
cd ..\..
```
Record the **5 new addresses** from the console (PR, CR, FFM, CE, SM). They're also in
`packages/contracts/broadcast/DeployPhase6.s.sol/421614/run-latest.json`.

---

## Step 5 — Fund the new SettlementManager (Pyth fees)

```powershell
cast send <NEW_SM> --value 0.05ether --private-key <treasury key> --rpc-url $env:RPC
```

---

## Step 6 — Verify ownership + wiring (read-only)

```powershell
cast call <NEW_SM> "owner()(address)"            --rpc-url $env:RPC   # -> 0xDa8c5726... (YOU)
cast call <NEW_PR> "globalRep(address)(int256)" 0x0000000000000000000000000000000000000000 --rpc-url $env:RPC   # -> 0 (no revert = settle works)
cast call <NEW_SM> "attestationSigner(uint8)(address)" 1 --rpc-url $env:RPC   # -> 0x1333F8Ab... (KMS wired)
```
`owner() == 0xDa8c5726` is the whole point — confirm it before going further.

---

## Step 7 — Address propagation (hand back to Claude)

Tell me "redeploy broadcast, new addresses are in run-latest.json" and I'll read the
broadcast artifact and update everything code-side in atomic commits:
- `packages/shared/src/constants/addresses.ts` (5 cluster exports)
- `packages/subgraph/subgraph.yaml` (5 datasource `address` + `startBlock`)
- `packages/contracts/script/TransferOwnershipToSafe.s.sol` (5 constants)
- `scripts/rehearse-ownership.ts` (5 `DEFAULT_SEPOLIA_ADDRESSES`)
- `docs/operator/phase-6-soak-tail-runbook.md` (the cluster + owner = `0xDa8c5726`)

> These supersede today's "canonical cluster" values — the redeploy produces a NEW cluster.

---

## Step 8 — Redeploy the indexer + relayer (operator)

```powershell
# Subgraph (after addresses.ts/subgraph.yaml are updated):
cd packages\subgraph
pnpm exec graph auth <STUDIO_DEPLOY_KEY>
pnpm exec graph deploy --node https://api.studio.thegraph.com/deploy/ call-it-sepolia --version-label v0.8.0
cd ..\..
# Relayer (reads contract addresses baked into the image — a REBUILD is required):
flyctl deploy --remote-only -a call-it-relayer-sepolia --config apps/relayer/fly.toml --dockerfile apps/relayer/Dockerfile
# then bump NEXT_PUBLIC_SUBGRAPH_URL fly secret to v0.8.0 + restart
```

---

## Step 9 — Re-seed + settle (re-prove SAFETY-22/23/24)

```powershell
cd apps\relayer
$env:SOAK_CALL_EXPIRY_SECONDS = "120"
npx tsx src/scripts/soak-seeder.ts            # 10 calls all types + 30 follow/fade
# wait ~2 min for expiry, then:
npx tsx src/scripts/settle-pyth-calls.ts      # settle -> "CALLED IT" receipts
cd ..\..
```

---

## Step 10 — Owner-gated items now work (owner = you)

With `owner() == 0xDa8c5726`, follow `docs/operator/phase-6-soak-tail-runbook.md`
(re-propagated with the new addresses) for SAFETY-27, SAFETY-42, and the 06-06 multisig
rehearsal — using your treasury key as the owner key everywhere it says `0xF4ee6195`.

---

## Footguns
- **Keep the deploy key backed up.** It's the treasury key (already in root `.env` +
  `SOAK_WALLET_0`), so it's safe — but do NOT delete `packages/contracts/.env` and lose
  track again. The lost `0xF4ee6195` key was exactly this mistake last time.
- **Verify `owner()` immediately (Step 6).** If it's not `0xDa8c5726`, the wrong key signed
  the broadcast — stop and fix before propagating addresses.
- **Mainnet:** same script, but a hardware-wallet deploy key + immediate `owner()` check are
  mandatory (Phase 10). Never deploy mainnet with a raw key in a `.env`.
