---
phase: 02-followfademarket
plan: 04
subsystem: contracts-deploy
status: complete
completed: 2026-05-30
tags: [foundry, deploy, arbitrum-sepolia, addresses, subgraph, abi]

requires:
  - phase: 02-followfademarket
    provides: FollowFadeMarket + CallRegistry v2 + ProfileRegistry v2 (plans 02-02/02-03)

provides:
  - DeployPhase2.s.sol — 9-step deploy script (deployed to Arbitrum Sepolia)
  - FollowFadeMarket.json ABI (packages/subgraph/abis/)
  - Live Sepolia v2 addresses in packages/shared/src/constants/addresses.ts
  - subgraph.yaml pointed at the 3 deployed v2 addresses + startBlocks

affects: [02-06-subgraph-publish, 02-07-relayer, 02-08-ui, 02-09-og]

key-files:
  created:
    - packages/contracts/script/DeployPhase2.s.sol
    - packages/subgraph/abis/FollowFadeMarket.json
  modified:
    - packages/shared/src/constants/addresses.ts
    - packages/subgraph/subgraph.yaml

key-decisions:
  - "Deployed from 0xDa8c5726f596E8dae99e6dDEBa8AEa1c8bE9A4a5 (also owner + treasury)."
  - "MKR delisted by Pyth (MakerDAO->Sky rebrand) -> SKY/USD registered instead; confirmed live on-chain (allowlistedAssets('SKY') == 0xa483243e...d3fe7)."
  - "Phase 2 redeploys the full stack: CallRegistry + ProfileRegistry move to v2 addresses; Phase 1 v1 addresses superseded."
---

# 02-04 — Deploy script + ABI export + Sepolia deployment

## What shipped

The vertical slice that turned the 3 compiled Phase 2 contracts into a live
Arbitrum Sepolia deployment, with addresses wired into the shared constants and
the subgraph manifest.

**Task 1 — DeployPhase2.s.sol + ABI export** (committed `8855c15`, feed IDs `1e9b135`):
9-step script (deploy ProfileRegistry v2 -> CallRegistry v2 -> FollowFadeMarket ->
setFollowFadeMarket -> setTreasury -> setTvlCap -> addAsset x24 + addNFTCollection x6 ->
setAuthorizedRepWriter(FFM) -> 9 post-deploy require() assertions). `FollowFadeMarket.json`
ABI exported to packages/subgraph/abis/.

**Task 2 — live deploy (operator)** — executed 2026-05-30 on Arbitrum Sepolia (chain 421614).
37 transactions, all status=1, 0 failures. The script's 9 on-chain assertions passed
(exit 0, "ONCHAIN EXECUTION COMPLETE & SUCCESSFUL").

## Deployed addresses (Arbitrum Sepolia, chain 421614)

| Contract | Address | Deploy block |
|----------|---------|--------------|
| ProfileRegistry v2 | `0xAfe239a3606b89Ef65DbBcDb1b87a920052c359E` | 272458667 |
| CallRegistry v2 | `0x7DAd732764abfC935aD5bf8e5CFF9BEA7B2C234D` | 272458669 |
| FollowFadeMarket | `0x12aafa5a70c3aD8Bd3a52252744f9F7Aa073E362` | 272458674 |

Deployer / owner / treasury: `0xDa8c5726f596E8dae99e6dDEBa8AEa1c8bE9A4a5`.
Canonical broadcast record: `packages/contracts/broadcast/DeployPhase2.s.sol/421614/run-latest.json`.

## Post-deploy verification (independent on-chain reads, all green)

```
CR.profileRegistry()          -> ProfileRegistry v2     ✓
CR.followFadeMarket()         -> FollowFadeMarket        ✓
CR.treasury()                 -> 0xDa8c...A4a5           ✓
CR.tvlCap()                   -> 5000000000              ✓
CR.currentTvl()               -> 0                       ✓
FFM.callRegistry()            -> CallRegistry v2         ✓
FFM.profileRegistry()         -> ProfileRegistry v2      ✓
PR.authorizedRepWriters(FFM)  -> true                    ✓
allowlistedAssets("BTC")      -> 0xe62df6c8...415b43     ✓
allowlistedAssets("ETH")      -> 0xff61491a...fd0ace     ✓
allowlistedAssets("SKY")      -> 0xa483243e...d3fe7      ✓ (MKR->SKY swap live)
```

## Config wired

- `packages/shared/src/constants/addresses.ts` — the 3 Sepolia constants updated to the
  v2 deployed addresses (placeholder zero removed). Shared package `tsc` build passes.
- `packages/subgraph/subgraph.yaml` — CallRegistry / ProfileRegistry / FollowFadeMarket
  data sources set to the deployed addresses + their startBlocks.

## Notes / deviations

- `--verify` was dropped from the broadcast (Arbiscan API key not provisioned); contracts
  can be Arbiscan-verified later with `forge verify-contract`. Non-blocking.
- Deploy ran from the local `.env` (DEPLOYER_PRIVATE_KEY + TREASURY_ADDRESS +
  ARBITRUM_SEPOLIA_RPC_URL). Secrets never committed; `.env*` and `.env*.bak*` git-ignored.
- The subgraph is NOW pointed at real addresses but NOT yet published to Studio — that is
  plan 02-06's remaining live step (`graph deploy --studio`).

## Self-Check: PASSED
- [x] 3 contracts deployed to Arbitrum Sepolia (37 txs, 0 failures)
- [x] All 9 on-chain deploy assertions passed + independently re-verified
- [x] addresses.ts updated to v2 (no zero placeholders); shared build green
- [x] subgraph.yaml updated to deployed addresses + startBlocks
- [x] FollowFadeMarket ABI present in subgraph/abis/
