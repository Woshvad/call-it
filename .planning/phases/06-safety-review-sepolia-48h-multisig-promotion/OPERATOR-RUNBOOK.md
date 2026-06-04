# Phase 6 — Operator Runbook (the 3 live gates)

These steps require live RPC, your deployer key, funded wallets, a Ledger, and ~48h of soak time.
They are **operator actions** — run them yourself; Claude will not broadcast value-bearing or mainnet
transactions on your behalf. After each gate, paste the outputs back and Claude wires up the rest
(`addresses.ts`, `subgraph.yaml`, SUMMARYs, ROADMAP, continuation).

CI-safe code is already built + green on `master` (forge 222/0/2). DeployPhase6.s.sol, the safety
matrix, the SAFETY-42 drill, soak-seeder.ts, and the multisig scripts are all in place.

---

## Env status (from your `.env`)

**Already set:** `ARBITRUM_SEPOLIA_RPC_URL`, `ARBITRUM_ONE_RPC_URL`, `DEPLOYER_PRIVATE_KEY`,
`TREASURY_ADDRESS`, `ALCHEMY_API_KEY`, `ARBISCAN_SEPOLIA_API_KEY`, `SUBGRAPH_STUDIO_DEPLOY_KEY`,
`TELEGRAM_BOT_TOKEN`/`CHAT_ID`, GCP-KMS (`GCP_KEYRING_ID`, `GCP_KEY_VERSION_*`).

**You must ADD before the relevant gate:**
- Gate 1 (relayer go-live): the **KMS signer addresses** (derive from the GCP KMS key versions, or read
  them from `05.1-OPERATOR-HANDOFF.md` if recorded there) — needed for `setAttestationSigner`.
- Gate 2: `SOAK_WALLET_0..SOAK_WALLET_9` (run `cast wallet new` ×10; fund each ~20 USDC at faucet.circle.com).
- Gate 3: `SAFE_SIGNER_1/2/3` (your Ledger address + 2 backups). Install `tsx` (`pnpm add -D tsx`) if you
  use the scripts instead of the Safe UI.

Load env into your shell first: `set -a; source .env; set +a`

---

## GATE 1 — 06-02 Task 2: Sepolia broadcast + relayer go-live

> **STATUS 2026-06-04 — DONE except the relayer.** Cluster broadcast + verified, addresses.ts/subgraph.yaml retargeted, subgraph v0.6.0 published (commits 733059b, 02249fa). New cluster: CR `0x015758Cb…BB54` / FFM `0x3129a7E3…25cAA` / CE `0xD2688514…6487` / SM `0x998CC092…38c7D4`. The KMS signers were wired by the deploy. **Only step 5a (relayer env-retarget + restart) remains.** The commands below are the original plan; skip what's already done.

```bash
set -a; source .env; set +a
cd packages/contracts

# 1. Pre-flight: deployer >= 0.1 ETH on Sepolia
cast balance $(cast wallet address --private-key $DEPLOYER_PRIVATE_KEY) --rpc-url $ARBITRUM_SEPOLIA_RPC_URL

# 2. Dry-run (no --broadcast) — resolveUsdc() needs chainid 421614, so the RPC must be Sepolia
forge script script/DeployPhase6.s.sol:DeployPhase6 --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --sig "run()"

# 3. Broadcast
forge script script/DeployPhase6.s.sol:DeployPhase6 \
  --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast
# → copy the 4 new addresses (CR v4, FFM v4, CE v3, SM v5) + deploy block(s) from DEPLOYMENT SUMMARY

# 4. Verify the USDC gate actually took (must return Circle Sepolia USDC)
cast call <NEW_SM> "usdc()(address)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL   # 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d
cast call <NEW_CE> "usdc()(address)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL   # same
cast call 0xAfe239a3606b89Ef65DbBcDb1b87a920052c359E "settlementManager()(address)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL  # == NEW_SM
# Decimals parity (ADR-0001 review item, deferred from 06-01):
cast call 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d "decimals()(uint8)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL  # == 6
```

**Then →** paste me the 4 addresses + deploy block. I'll update `addresses.ts` (+ `USDC_ARB_SEPOLIA`)
and `subgraph.yaml`, commit, and write 06-02-SUMMARY.md.

**Relayer go-live (platform access — Railway/Fly + Graph Studio + GCP KMS):**
```bash
# 5b. Re-grant the 4 KMS signers on the NEW SM (oracleType 1..6 per 05.1-OPERATOR-HANDOFF)
cast send <NEW_SM> "setAttestationSigner(uint8,address)" 1 <KMS_NFT_TWAP_ADDR> --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY
# ... repeat for DEFILLAMA, SNAPSHOT_TALLY, CEX (see 06-02 plan Step 5b)
# 5a. Update relayer env (CALL_REGISTRY_ADDRESS/FFM_ADDRESS/CE_ADDRESS/SM_ADDRESS=NEW_*, USDC_ADDRESS=0x75faf114...)
# 5c. node apps/relayer/.../backfill-criteria.ts    5d. restart relayer    5e. curl <relayer>/health -> ok
# Subgraph: cd packages/subgraph && graph build && graph deploy --studio call-it-sepolia
```
**Resume signal:** `cluster-live` + the 4 addresses + block.

---

## GATE 2 — 06-05: ≥48h soak (after Gate 1)

1. `cast wallet new` ×10 → set `SOAK_WALLET_0..9`; fund each ~20 USDC at faucet.circle.com.
2. `node apps/relayer/src/scripts/soak-seeder.ts` (needs the Phase-6 addresses live from Gate 1). Record start ts + the `evidence-*.jsonl` path.
3. **Mid-soak SAFETY-42 destruction drill** (ProxyAdmin owner is still the deployer until Gate 3, so the deployer key works):
   ```bash
   set -a; source .env; set +a
   RPC=$ARBITRUM_SEPOLIA_RPC_URL
   PROXY=0xe7e15980C40db52BFC6dcaBb21B3d90edFB27c14   # StylusScoreEngine proxy
   ADMIN=0xAeA5a279DDF1625490c5F4284eF0D735BB56044a   # ProxyAdmin (owner = deployer)
   REVERT=0x8492faD7eF45a213E498daaA88986f97Fb22b6e1  # RevertingStylusEngine (drill fixture)
   STYLUS=0xdbe23df8ff832e09f2d8f52c3ec8a32b3d714755  # real Stylus WASM impl (restore target)
   SLOT=0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc   # EIP-1967 impl slot

   # (a) upgrade proxy -> reverting fixture (3-arg OZ-5 form only)
   cast send $ADMIN "upgradeAndCall(address,address,bytes)" $PROXY $REVERT 0x --private-key $DEPLOYER_PRIVATE_KEY --rpc-url $RPC
   cast storage $PROXY $SLOT --rpc-url $RPC          # lower 20 bytes == $REVERT
   # (b) let the relayer settle a live soak call; on Arbiscan confirm the settle tx emits
   #     RepCalculatedFallback(...) + a Telegram "stylus_fallback" alert, and the call still
   #     reaches Settled (Solidity baseline applied). Record the settle tx hash.
   # (c) restore the real Stylus engine
   cast send $ADMIN "upgradeAndCall(address,address,bytes)" $PROXY $STYLUS 0x --private-key $DEPLOYER_PRIVATE_KEY --rpc-url $RPC
   cast storage $PROXY $SLOT --rpc-url $RPC          # lower 20 bytes == $STYLUS again
   ```
   Record the upgrade tx, the settle tx (with `RepCalculatedFallback`), and the restore tx for the evidence log.
4. **Manual UAT (human eyes, no automation):** settled-call payout, dispute flow, Provenance modal (D-10), OG 200px readability, settled-OG `X-Variant`. Screenshot each.
5. Pre-deploy rituals + the 38-item PITFALLS checklist.

**Then →** paste me the start/end timestamps, drill tx hashes, and any failures. I'll help compile `EVIDENCE-LOG.md`.
**Resume signals:** `soak-complete`, then `evidence-log-verified`.

---

## GATE 3 — 06-06 Task 2: multisig promotion (after Gate 2)

**Recommended:** deploy the Safe via the official **Safe UI (https://app.safe.global)** with your Ledger —
standard, audited, hardware-native. (Alternative: the migrated `deploy-safe.ts` once it's on protocol-kit v7.)

1. Deploy a **2-of-3 Safe on Arbitrum Sepolia** (owners = your 3 signer addresses, threshold 2). Record `SAFE_ARBITRUM_SEPOLIA`.
2. **Update the placeholder addresses** in `TransferOwnershipToSafe.s.sol` to the real Phase-6 cluster addresses from Gate 1, then:
   `forge script script/TransferOwnershipToSafe.s.sol --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --broadcast` (sets pendingOwner on the 5 Ownable2Step; ProxyAdmin transfers immediately).
3. Safe executes `acceptOwnership()` on the 5 contracts (rehearse-ownership.ts, or via Safe UI batch). Verify `owner()==Safe` on all 6 surfaces.
4. Prove Safe-gated `pause()`/`unpause()` and `ProxyAdmin.upgradeAndCall` via the Safe UI.
5. Deploy the **production Safe on Arbitrum One** (Safe UI + Ledger). Record `SAFE_ARBITRUM_ONE`.

**Then →** paste me both Safe addresses + the 6 `owner()` results. I'll update `addresses.ts`, write 06-06-SUMMARY.md, run verification, and `phase.complete 06`.
**Resume signal:** `multisig-promoted`.

---

## What only you can do vs. what Claude does after

| You (live/keys/Ledger/time) | Claude (after you paste outputs) |
|---|---|
| Broadcasts, cast sends, faucet funding, Ledger signing, Safe UI, 48h wait, manual UAT | addresses.ts + subgraph.yaml edits, SUMMARYs, ROADMAP/STATE, verification, `phase.complete`, EVIDENCE-LOG drafting |
