/**
 * Protocol and external contract addresses.
 *
 * Pyth oracle addresses are pinned and verified.
 * Protocol contract addresses (CallRegistry, etc.) start as null and are
 * populated by Phase 1+ when contracts are deployed.
 *
 * Source: CLAUDE.md "Pinned Addresses (Arbitrum One Mainnet)"
 * Requirement: OPS-21, SAFETY-13
 */

import { ARBITRUM_MAINNET_CHAIN_ID, ARBITRUM_SEPOLIA_CHAIN_ID } from './networks.js';

// ---------------------------------------------------------------------------
// Circle USDC Paymaster (D-04 — post-cap USDC gas, Phase 1)
// ---------------------------------------------------------------------------

/**
 * Circle USDC Paymaster address on Arbitrum One (mainnet).
 *
 * Verified 2026-05-22 against:
 *   - https://docs.arbitrum.io/for-devs/third-party-docs/Circle/usdc-paymaster-quickstart
 *   - https://www.circle.com/blog/how-to-integrate-circle-paymaster-to-enable-users-to-pay-gas-fees-with-their-usdc-balance
 * Both sources confirm this address. Confidence: HIGH.
 *
 * Threat: T-01-01 — wrong address strands tx 6+ Circle USDC permit signatures
 */
export const CIRCLE_PAYMASTER_ARBITRUM_ONE =
  '0x6C973eBe80dCD8660841D4356bf15c32460271C9' as const;

/**
 * Circle USDC Paymaster on Arbitrum Sepolia (testnet).
 * Used for Sepolia staging end-to-end paymaster handoff tests.
 *
 * Verified 2026-05-22 against the same Arbitrum docs + Circle blog as the
 * mainnet address above. Confidence: HIGH.
 */
export const CIRCLE_PAYMASTER_ARBITRUM_SEPOLIA =
  '0x31BE08D380A21fc740883c0BC434FcFc88740b58' as const;

// ---------------------------------------------------------------------------
// Pyth oracle addresses
// ---------------------------------------------------------------------------

/**
 * Pyth price feed contract on Arbitrum One (mainnet).
 * Source: https://docs.pyth.network/price-feeds/contract-addresses/evm
 */
export const PYTH_ARBITRUM_ONE = '0xff1a0f4744e8582DF1aE09D5611b887B6a12925C' as const;

/**
 * Pyth price feed contract on Arbitrum Sepolia (staging).
 * Source: https://docs.pyth.network/price-feeds/contract-addresses/evm
 */
export const PYTH_ARBITRUM_SEPOLIA = '0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DAF' as const;

/**
 * Circle's official USDC on Arbitrum Sepolia (testnet). Chain ID 421614, 6 decimals
 * (same parity as mainnet native USDC). ADR-0001 hybrid money-path.
 * TS mirror of USDC_ARB_SEPOLIA in packages/contracts/src/constants/USDC.sol.
 * The Phase-6 Sepolia cluster's resolveUsdc() resolves to this on chainid 421614 —
 * verified on-chain 2026-06-04: cr/ffm/ce/sm.usdc() all return this address.
 */
export const USDC_ARB_SEPOLIA = '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d' as const;

// ---------------------------------------------------------------------------
// Protocol contract addresses (populated by Phase 1+)
// ---------------------------------------------------------------------------

type AddressRecord = Record<
  typeof ARBITRUM_MAINNET_CHAIN_ID | typeof ARBITRUM_SEPOLIA_CHAIN_ID,
  string | null
>;

// ---------------------------------------------------------------------------
// Phase 1 deployed contract addresses
// Populated after running: packages/contracts/script/DeployPhase1.s.sol
// ---------------------------------------------------------------------------

/**
 * CallRegistry on Arbitrum Sepolia — v2 (Phase 2 redeploy).
 *
 * DEPLOYED 2026-05-30 via DeployPhase2.s.sol (OZ 5.6.1, solc 0.8.30).
 * Deploy block: 272458669. Deployer/owner/treasury: 0xDa8c5726f596E8dae99e6dDEBa8AEa1c8bE9A4a5.
 * Supersedes the Phase 1 v1 address (0xC61deC55ED916f97006FC1B01695Ee9297a8867C).
 *
 * Post-deploy verification (on-chain, all green):
 *   followFadeMarket()  -> FFM address                                 ✓
 *   profileRegistry()   -> ProfileRegistry v2                          ✓
 *   treasury()          -> 0xDa8c...A4a5                               ✓
 *   tvlCap()            -> 5000000000                                  ✓
 *   currentTvl()        -> 0                                           ✓
 *
 * Threat: T-01-16 -- wrong address pinned in frontend silently routes txs to wrong contract.
 */
export const CALL_REGISTRY_ARBITRUM_SEPOLIA =
  '0xb864308D7214f98d60C5811F451fa96a49619150' as const; // Phase 6 SETTLE-BLOCKER redeploy 2026-06-04 (block 273884588); fresh-PR cluster (globalRep fix); supersedes 0x015758CbBc9A97b98Cf3BBf30381fFAc3F00BB54

/**
 * ProfileRegistry on Arbitrum Sepolia — Phase 6 REDEPLOY (settle-blocker fix).
 * Deployed 2026-06-04 via DeployPhase6.s.sol. Deploy block: 273884585.
 * Owner: 0xDa8c5726f596E8dae99e6dDEBa8AEa1c8bE9A4a5.
 *
 * Supersedes the preserved Phase-2 PR (0xAfe239a3606b89Ef65DbBcDb1b87a920052c359E),
 * which predated the globalRep(address) getter that SettlementManager.settle()
 * staticcalls — so every settle() reverted with no data (the Sepolia soak blocker).
 * This fresh deploy carries globalRep(); verified on-chain PR.globalRep(0)=0 (no revert).
 */
export const PROFILE_REGISTRY_ARBITRUM_SEPOLIA =
  '0xE82308B350013fA0dcc11fEF10B3F0bf684EFd14' as const; // Phase 6 settle-blocker redeploy (block 273884585); supersedes 0xAfe239a3606b89Ef65DbBcDb1b87a920052c359E

/**
 * FollowFadeMarket v2 on Arbitrum Sepolia (Phase 4 redeploy).
 *
 * DEPLOYED 2026-06-01 via DeployPhase4.s.sol. Deploy block: 272912507.
 * v2 adds applySettlement + real claimPayout (Phase 4 settlement wiring).
 * Supersedes the Phase 2 v1 address (0x12aafa5a70c3aD8Bd3a52252744f9F7Aa073E362).
 * Constructor: (CallRegistry v2, ProfileRegistry v2, treasury 0xDa8c...A4a5).
 *
 * Post-deploy verification (on-chain, all green):
 *   callRegistry()     -> CallRegistry v2                              ✓
 *   profileRegistry()  -> ProfileRegistry v2                          ✓
 *   treasury()         -> 0xDa8c...A4a5                               ✓
 *   settlementManager() -> SettlementManager (Phase 4 wire)           ✓
 *
 * Threat: T-02-04-01 — wrong/zero address routes all FFM reads/writes to nowhere.
 */
export const FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA =
  '0xBDaD3F1E608452fea36a7861cDd8BBb73D9D10c1' as const; // Phase 6 SETTLE-BLOCKER redeploy 2026-06-04 (block 273884592); fresh-PR cluster (globalRep fix); supersedes 0x3129a7E3A9D52Fd40E18b8581d1A6D4c22E25cAA

/**
 * FollowFadeMarket on Arbitrum One (mainnet).
 * NOT YET DEPLOYED. Phase 7.5 mainnet deploy after the Sepolia staging gate.
 */
export const FOLLOW_FADE_MARKET_ARBITRUM_ONE =
  '0x0000000000000000000000000000000000000000' as const;

/**
 * CallRegistry on Arbitrum One (mainnet).
 * NOT YET DEPLOYED. Phase 7.5 mainnet deploy after >=48h Sepolia staging gate.
 * Spec: §19.11 mandatory post-deploy smoke test required before public announcement.
 */
export const CALL_REGISTRY_ARBITRUM_ONE =
  '0x0000000000000000000000000000000000000000' as const;

/**
 * ProfileRegistry on Arbitrum One (mainnet).
 * NOT YET DEPLOYED. Phase 7.5 mainnet deploy alongside CallRegistry.
 */
export const PROFILE_REGISTRY_ARBITRUM_ONE =
  '0x0000000000000000000000000000000000000000' as const;

/**
 * ChallengeEscrow on Arbitrum Sepolia (Phase 3 deploy).
 *
 * DEPLOYED 2026-06-01 via DeployPhase3.s.sol. Deploy block: 272815420.
 * Tx: 0x507d8e265338c87ee8e80281bc496b1fd6b7dff26e2b5fd3de8554183da48748.
 * Constructor: (CallRegistry v2, FollowFadeMarket, USDC native, treasury, tvlCap=5_000_000_000).
 *
 * Post-deploy verification (on-chain, all green):
 *   tvlCap()            -> 5000000000                                 ✓
 *   getTvl()            -> 0                                          ✓
 *   settlementManager() -> 0x0 (D-01 deploy-at-zero; Phase 4 rotates) ✓
 *   callRegistry()      -> CallRegistry v2                            ✓
 *   followFadeMarket()  -> FollowFadeMarket                          ✓
 *
 * Threat: T-03-03-01 — wrong/zero address routes all duel reads/writes to nowhere.
 */
export const CHALLENGE_ESCROW_ARBITRUM_SEPOLIA =
  '0x2E11fD3E03acE074D855661Bc4320bddbE897714' as const; // Phase 6 SETTLE-BLOCKER redeploy 2026-06-04 (block 273884596); fresh-PR cluster (globalRep fix); supersedes 0xD2688514f95D94a1f426506C921928D188036487

/**
 * ChallengeEscrow on Arbitrum One (mainnet).
 * NOT YET DEPLOYED. Phase 7.5 mainnet deploy after the Sepolia staging gate.
 */
export const CHALLENGE_ESCROW_ARBITRUM_ONE =
  '0x0000000000000000000000000000000000000000' as const;

/**
 * SettlementManager on Arbitrum Sepolia (Phase 4 deploy).
 *
 * DEPLOYED 2026-06-01 via DeployPhase4.s.sol. Deploy block: 272912513.
 * Funded with 0.05 ETH for Pyth VAA fees at deploy time (PYTH_ETH_BUDGET; see deviation note).
 *
 * Constructor: (CallRegistry, FollowFadeMarket v2, ChallengeEscrow, ProfileRegistry,
 *               USDC_ARB_NATIVE, treasury, PYTH_ARBITRUM_SEPOLIA).
 *
 * Post-deploy verification (on-chain, all green — 12/12 assertions passed):
 *   sm.callRegistry()              -> CallRegistry v2                    ✓
 *   sm.followFadeMarket()          -> FollowFadeMarket v2                ✓
 *   CR.settlementManager()         -> this address                       ✓
 *   FFM v2.settlementManager()     -> this address                       ✓
 *   CE.settlementManager()         -> this address                       ✓
 *   PR.settlementManager()         -> this address                       ✓
 *   PR.authorizedRepWriters(this)  -> true                               ✓
 *   SM ETH balance                 -> 0.05 ETH                          ✓
 *
 * Threat: T-04-03-01 — wrong address wired prevents settlement; post-deploy assertions mitigate.
 */
export const SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA =
  '0x9235003d9C9F38539a41d9798c32C72e7615428A' as const; // Phase 6 SETTLE-BLOCKER redeploy 2026-06-04 (block 273884600); fresh-PR cluster (globalRep fix); supersedes 0x998CC092E69f4D2bebb0852eF69CC1F04038c7D4

/**
 * SettlementManager on Arbitrum One (mainnet).
 * NOT YET DEPLOYED. Phase 7.5 mainnet deploy after the >=48h Sepolia staging gate.
 */
export const SETTLEMENT_MANAGER_ARBITRUM_ONE =
  '0x0000000000000000000000000000000000000000' as const;

// ---------------------------------------------------------------------------
// Legacy address record structure (retained for backward compatibility)
// ---------------------------------------------------------------------------

/**
 * CallRegistry contract addresses — populated in Phase 1.
 * @deprecated Use CALL_REGISTRY_ARBITRUM_SEPOLIA / CALL_REGISTRY_ARBITRUM_ONE directly.
 */
export const CALL_REGISTRY_ADDRESSES: AddressRecord = {
  [ARBITRUM_MAINNET_CHAIN_ID]: CALL_REGISTRY_ARBITRUM_ONE,
  [ARBITRUM_SEPOLIA_CHAIN_ID]: CALL_REGISTRY_ARBITRUM_SEPOLIA,
};

/**
 * ProfileRegistry contract addresses — populated in Phase 1.
 * @deprecated Use PROFILE_REGISTRY_ARBITRUM_SEPOLIA / PROFILE_REGISTRY_ARBITRUM_ONE directly.
 */
export const PROFILE_REGISTRY_ADDRESSES: AddressRecord = {
  [ARBITRUM_MAINNET_CHAIN_ID]: PROFILE_REGISTRY_ARBITRUM_ONE,
  [ARBITRUM_SEPOLIA_CHAIN_ID]: PROFILE_REGISTRY_ARBITRUM_SEPOLIA,
};

/**
 * FollowFadeMarket contract addresses — populated in Phase 2.
 * Sepolia entry is the live deployed address (02-04, 2026-05-30).
 */
export const FOLLOW_FADE_MARKET_ADDRESSES: AddressRecord = {
  [ARBITRUM_MAINNET_CHAIN_ID]: FOLLOW_FADE_MARKET_ARBITRUM_ONE,
  [ARBITRUM_SEPOLIA_CHAIN_ID]: FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA,
};

/**
 * ChallengeEscrow contract addresses — Sepolia pending the 03-03 deploy.
 */
export const CHALLENGE_ESCROW_ADDRESSES: AddressRecord = {
  [ARBITRUM_MAINNET_CHAIN_ID]: CHALLENGE_ESCROW_ARBITRUM_ONE,
  [ARBITRUM_SEPOLIA_CHAIN_ID]: CHALLENGE_ESCROW_ARBITRUM_SEPOLIA,
};

/**
 * SettlementManager contract addresses — populated in Phase 4.
 * Sepolia entry is a placeholder until DeployPhase4.s.sol is broadcast.
 * Update SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA above after deploy, then this record auto-updates.
 */
export const SETTLEMENT_MANAGER_ADDRESSES: AddressRecord = {
  [ARBITRUM_MAINNET_CHAIN_ID]: SETTLEMENT_MANAGER_ARBITRUM_ONE,
  [ARBITRUM_SEPOLIA_CHAIN_ID]: SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA,
};

// ---------------------------------------------------------------------------
// Aave V3 Pool address (used by rpc-metrics-adapter — pinned, never from call params W11)
// ---------------------------------------------------------------------------

/**
 * Aave V3 Pool on Arbitrum One (mainnet).
 *
 * Used by rpc-metrics-adapter to query liquidation events via viem getLogs.
 * MUST be sourced from this pinned constant — never from call parameters.
 * (W11 fix: if from call params, attacker can point to any contract they control.)
 *
 * Source: https://docs.aave.com/developers/deployed-contracts/v3-mainnet/arbitrum
 */
export const AAVE_V3_POOL_ARBITRUM_ONE =
  '0x794a61358D6845594F94dc1DB02A252b5b4814aD' as const;

// ---------------------------------------------------------------------------
// Subgraph URLs (The Graph — Subgraph Studio)
// ---------------------------------------------------------------------------

/**
 * Subgraph Studio query URL for the call-it-sepolia deployment (Arbitrum Sepolia).
 *
 * Phase 4 redeploy (v0.4.0, 2026-06-01): adds SettlementManager handlers —
 * CallSettled, DisputeRaised, DisputeResolved, CallForceSettled, SettlementDelayed,
 * RepCalculated, RepCalculatedFallback; also adds Phase 3 ChallengeEscrow handlers
 * (supersedes v0.3.0). Indexes SettlementManager at
 * 0xAc37a0e4A3e575EF21684c28a5b820dB44654595 (startBlock: 272912513) and
 * FollowFadeMarket v2 at 0x185e43526c0acd88AC236197e3Ee7629ebd601CA.
 *
 * Studio user id: 1754389. Version label: v0.4.0.
 * Studio dashboard: https://thegraph.com/studio/subgraph/call-it-sepolia
 * hasIndexingErrors: false (verified 2026-06-01).
 *
 * Note: this is the version-pinned endpoint emitted by the deploy. Republishing a
 * new version label will mint a new URL — update this constant on each redeploy.
 * Also update RELAYER_SUBGRAPH_URL in apps/relayer/.env and .env.production.
 *
 * Requirement: D-27 (Studio key held by relayer only — frontend hits /api/feed proxy)
 * Threat: T-01-67 — schema drift between Phase 0 stubs and Phase 1 real events (closed)
 *
 * Post-deploy on-chain assertions (Phase 4 — all passed):
 *   sm.callRegistry()              -> CallRegistry v2                    ✓
 *   sm.followFadeMarket()          -> FollowFadeMarket v2                ✓
 *   CR.settlementManager()         -> 0xAc37a0e4A3e575EF21684c28a5b820dB44654595 ✓
 *   FFM v2.settlementManager()     -> 0xAc37a0e4A3e575EF21684c28a5b820dB44654595 ✓
 *   CE.settlementManager()         -> 0xAc37a0e4A3e575EF21684c28a5b820dB44654595 ✓
 *   PR.settlementManager()         -> 0xAc37a0e4A3e575EF21684c28a5b820dB44654595 ✓
 *   PR.authorizedRepWriters(sm)    -> true                               ✓
 */
export const SUBGRAPH_URL_SEPOLIA =
  'https://api.studio.thegraph.com/query/1754389/call-it-sepolia/v0.6.0' as const; // Phase 6: indexes the redeployed cluster (CR 0x015758Cb / FFM 0x3129a7E3 / CE 0xD2688514 / SM 0x998CC092), published 2026-06-04

/**
 * Subgraph Decentralized Network URL (Arbitrum One mainnet).
 * Published from Studio in Phase 7 (out of scope for Phase 1).
 * See: 01-CONTEXT.md "Out of scope: Decentralized Network subgraph publish (→ Phase 7)"
 */
export const SUBGRAPH_URL_MAINNET: string | null = null;

// ---------------------------------------------------------------------------
// Phase 5 — StylusScoreEngine proxy + supporting contracts (Arbitrum Sepolia)
// Deployed via DeployPhase5Stylus.s.sol (Plan 05-06 operator deploy).
// All values are placeholders; FILL AFTER DEPLOY.
// ---------------------------------------------------------------------------

/**
 * StylusScoreEngine proxy on Arbitrum Sepolia (Phase 5 deploy).
 *
 * FILL AFTER DEPLOY (Phase 5 Plan 06): replace zero address with output of
 * DeployPhase5Stylus.s.sol "StylusScoreEngine proxy:" console.log line.
 *
 * Architecture: TransparentUpgradeableProxy (OZ 5.6.1) -> StylusScoreEngine WASM
 * (cargo-stylus 0.6.3). SettlementManager.setStylusScoreEngine() points at this address.
 * 48h cutoff: upgrade proxy to SolidityScoreEngine via CutoffFallback.s.sol (OPS-16).
 *
 * Post-deploy verification:
 *   sm.stylusScoreEngine()       -> this address                       ✓
 *   proxy.compute_rep_change(100, 50, 50, true, 10)  -> non-zero int32  ✓
 *
 * Threat: T-05-04-02 -- wrong SM address wired prevented by post-deploy require() assertion.
 */
export const STYLUS_SCORE_ENGINE_PROXY_ARBITRUM_SEPOLIA =
  '0xe7e15980C40db52BFC6dcaBb21B3d90edFB27c14' as const; // Phase 5 Plan 06 deploy (2026-06-02); Stylus WASM impl behind proxy = 0xdbe23df8ff832e09f2d8f52c3ec8a32b3d714755

/**
 * ProxyAdmin on Arbitrum Sepolia (Phase 5 deploy).
 *
 * FILL AFTER DEPLOY (Phase 5 Plan 06): replace zero address with output of
 * DeployPhase5Stylus.s.sol "ProxyAdmin:" console.log line.
 *
 * Owner = deployer EOA in Phase 5. Phase 6 promotes to multisig (SAFETY-20).
 * Use this address to run CutoffFallback.s.sol (PROXY_ADMIN_ADDR constant).
 *
 * Post-deploy verification:
 *   proxyAdmin.owner()           -> deployer address                   ✓
 */
export const PROXY_ADMIN_ARBITRUM_SEPOLIA =
  '0xAeA5a279DDF1625490c5F4284eF0D735BB56044a' as const; // Phase 5 Plan 06 deploy (2026-06-02); auto-created by OZ 5.x proxy, owner = deployer

/**
 * SolidityScoreEngine on Arbitrum Sepolia (Phase 5 deploy).
 *
 * FILL AFTER DEPLOY (Phase 5 Plan 06): replace zero address with output of
 * DeployPhase5Stylus.s.sol "SolidityScoreEngine:" console.log line.
 *
 * 48h-cutoff fallback contract. Implements IStylusScoreEngine with the same
 * math as SettlementManager._solidityBaselineRepDelta (REP-24 parity).
 * Use this address as SOLIDITY_BASELINE_ADDR in CutoffFallback.s.sol (OPS-16).
 *
 * Post-deploy verification:
 *   solidityEngine.compute_rep_change(0, 50, 0, true, 10)  -> 10          ✓
 */
export const SOLIDITY_SCORE_ENGINE_ARBITRUM_SEPOLIA =
  '0xfD2E6270f915797B1524e13a88BC73960e1D04e5' as const; // Phase 5 Plan 06 deploy (2026-06-02); 48h-cutoff fallback

/**
 * RevertingStylusEngine on Arbitrum Sepolia (Phase 5 deploy).
 *
 * FILL AFTER DEPLOY (Phase 5 Plan 06): replace zero address with output of
 * DeployPhase5Stylus.s.sol "RevertingStylusEngine:" console.log line.
 *
 * Phase 6 SAFETY-42 drill fixture. Intentionally reverts on compute_rep_change.
 * Used to verify SettlementManager try/catch fallback fires RepCalculatedFallback event.
 * Wire this address via setStylusScoreEngine() in Phase 6 drill, then restore proxy.
 *
 * Post-deploy verification:
 *   revertingEngine.compute_rep_change(...)  -> reverts                  ✓
 */
export const REVERTING_STYLUS_ENGINE_ARBITRUM_SEPOLIA =
  '0x8492faD7eF45a213E498daaA88986f97Fb22b6e1' as const; // Phase 5 Plan 06 deploy (2026-06-02); Phase 6 SAFETY-42 drill fixture
