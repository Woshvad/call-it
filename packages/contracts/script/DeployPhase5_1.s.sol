// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack -- Pinned Versions"
// Spec: CALL_IT_SPEC1.md §12.4 -- SettlementManager setAdapterMap + setAttestationSigner
// Requirement: SETTLE-06, SETTLE-DUAL-GOV, SETTLE-13, SETTLE-14, SETTLE-15,
//              SETTLE-18, SETTLE-19, SETTLE-21, SETTLE-22, SETTLE-23
//
// DEPLOYMENT SAFETY CHECKLIST (§19.11):
// 1. DEPLOYER_PRIVATE_KEY must be set (hardware-wallet-derived for mainnet; test key for Sepolia)
//    NEVER commit this key -- it must be in environment only
// 2. TREASURY_ADDRESS must be set -- same EOA/Safe as Phase 2/3/4
// 3. All 4 KMS env vars must be set -- NEVER hardcode or commit these addresses
//    KMS_ADDRESS_NFT_TWAP      -- GCP KMS key for NftTwap oracle attestations (OracleAdapter.NftTwap=1)
//    KMS_ADDRESS_DEFILLAMA     -- GCP KMS key for DefiLlama + RpcMetrics (shared key per AR-04-01)
//    KMS_ADDRESS_SNAPSHOT_TALLY -- GCP KMS key for Snapshot + Tally (shared key per AR-04-01)
//    KMS_ADDRESS_CEX           -- GCP KMS key for CexScraper attestations (OracleAdapter.CexScraper=6)
// 4. Verify foundry.toml has [rpc_endpoints.arbitrum_sepolia] = "${ARBITRUM_SEPOLIA_RPC_URL}"
// 5. Run dry-sim:
//    cd packages/contracts
//    forge script script/DeployPhase5_1.s.sol:DeployPhase5_1 \
//      --rpc-url $ARBITRUM_SEPOLIA_RPC_URL \
//      --private-key $DEPLOYER_PRIVATE_KEY \
//      --sig "run()"
// 6. If sim passes, broadcast:
//    forge script script/DeployPhase5_1.s.sol:DeployPhase5_1 \
//      --rpc-url $ARBITRUM_SEPOLIA_RPC_URL \
//      --private-key $DEPLOYER_PRIVATE_KEY \
//      --broadcast \
//      --sig "run()"
// 7. Record NEW CR address in packages/shared/src/constants/addresses.ts:
//    CALL_REGISTRY_ARBITRUM_SEPOLIA = <new CR address>
// 8. Record NEW SM address in packages/shared/src/constants/addresses.ts:
//    SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA = <new SM address>
// 9. Update packages/subgraph/subgraph.yaml:
//    CallRegistry address + startBlock (from console output below)
//    SettlementManager address + startBlock
// 10. Rebuild and redeploy subgraph to Studio:
//     cd packages/subgraph && pnpm run build && pnpm run deploy:sepolia
// 11. Update relayer .env: SETTLEMENT_MANAGER_ADDRESS=<new SM address>
// 12. Restart relayer workers (settlement-watcher, oracle adapters)
//
// WHY REDEPLOY (Gap B.1 -- Phase 05.1):
//   Phase 4 SM has adapterMap[*][*]==Pyth(0) for ALL slots (never called setAdapterMap at deploy).
//   This blocks every non-Pyth submitAttestation via _checkAdapterBinding.
//   Phase 05.1 Plan 01 added Governance_Snapshot=6 + Governance_Tally=7 to ICallRegistry.EventSubtype
//   (Option A enum split). Both CR and SM must be redeployed to use the updated interface.
//
// POST-DEPLOY VERIFICATION (§19.11 -- cast call commands):
// cast call <NEW_SM> "adapterMap(uint8,uint8)(uint8)" 2 6 --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> 4 (Snapshot)
// cast call <NEW_SM> "adapterMap(uint8,uint8)(uint8)" 2 7 --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> 5 (Tally)
// cast call <NEW_SM> "adapterMap(uint8,uint8)(uint8)" 2 1 --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> 2 (DefiLlama), NOT 0 (Pyth)
// cast call <NEW_SM> "adapterMap(uint8,uint8)(uint8)" 0 0 --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> 0 (Pyth) -- unaffected
// cast call <NEW_SM> "attestationSigner(uint8)(address)" 1 --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> KMS_ADDRESS_NFT_TWAP, NOT address(0)
// cast call <NEW_SM> "attestationSigner(uint8)(address)" 2 --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> KMS_ADDRESS_DEFILLAMA, NOT address(0)
// cast call <NEW_SM> "callRegistry()(address)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> <NEW_CR>

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { CallRegistry } from "../src/CallRegistry.sol";
import { ChallengeEscrow } from "../src/ChallengeEscrow.sol";
import { FollowFadeMarket } from "../src/FollowFadeMarket.sol";
import { ProfileRegistry } from "../src/ProfileRegistry.sol";
import { SettlementManager } from "../src/SettlementManager.sol";
import { ICallRegistry } from "../src/interfaces/ICallRegistry.sol";
import { IChallengeEscrow } from "../src/interfaces/IChallengeEscrow.sol";
import { IProfileRegistry } from "../src/interfaces/IProfileRegistry.sol";
import { ISettlementManager } from "../src/interfaces/ISettlementManager.sol";
import { USDC_ARB_NATIVE } from "../src/constants/USDC.sol";

/// @title DeployPhase5_1
/// @notice Redeploys CallRegistry (Option A enum split -- new address required) and
///         SettlementManager on Arbitrum Sepolia. Calls setAdapterMap for all 8
///         (marketType, eventSubtype) pairs and setAttestationSigner for all 6
///         non-Pyth oracle types. Closes Gap B.1 -- non-Pyth submitAttestation path.
///
///         Redeployed as a CONSISTENT CLUSTER (FFM/CE immutably reference CallRegistry,
///         so redeploying CR forces redeploying FFM + CE + SM together):
///           CallRegistry, FollowFadeMarket, ChallengeEscrow, SettlementManager
///         NOT redeployed (settable refs / unaffected):
///           ProfileRegistry:  0xAfe239a3606b89Ef65DbBcDb1b87a920052c359E (Phase 2)
///           StylusScoreEngine proxy: 0xe7e15980C40db52BFC6dcaBb21B3d90edFB27c14 (Phase 5)
///
///         Sepolia chainId: 421614
///         Mainnet deploy: Phase 7.5 (after >=48h Sepolia staging gate).
contract DeployPhase5_1 is Script {
    // ─── Phase 2/3/4/5 deployed addresses (Arbitrum Sepolia, UNCHANGED) ──────────
    // Source: packages/shared/src/constants/addresses.ts (populated 2026-05-30..2026-06-02)
    // Verified on Arbiscan Sepolia after each phase deploy.

    /// @notice ChallengeEscrow on Arbitrum Sepolia.
    ///         Deployed via DeployPhase3.s.sol at block 272815420.
    ///         NOT redeployed in Phase 5.1.
    address public constant CHALLENGE_ESCROW = 0x59eb7C8000f0bC4C0e32d2060f304d9b5655bec2;

    /// @notice ProfileRegistry v2 on Arbitrum Sepolia.
    ///         Deployed via DeployPhase2.s.sol at block 272458667.
    ///         NOT redeployed in Phase 5.1.
    address public constant PROFILE_REGISTRY = 0xAfe239a3606b89Ef65DbBcDb1b87a920052c359E;

    /// @notice FollowFadeMarket v2 on Arbitrum Sepolia.
    ///         Deployed via DeployPhase4.s.sol at block 272912507.
    ///         NOT redeployed in Phase 5.1 -- only setSettlementManager() is called to rotate.
    address public constant FOLLOW_FADE_MARKET = 0x185e43526c0acd88AC236197e3Ee7629ebd601CA;

    // ─── Oracle address ──────────────────────────────────────────────────────────

    /// @notice Pyth price feed contract on Arbitrum Sepolia.
    ///         Source: https://docs.pyth.network/price-feeds/contract-addresses/evm
    ///         Source: CLAUDE.md "Pinned Addresses"
    address public constant PYTH_ARBITRUM_SEPOLIA = 0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DAF;

    /// @notice StylusScoreEngine proxy on Arbitrum Sepolia.
    ///         Deployed via DeployPhase5Stylus.s.sol (Phase 5 Plan 06).
    ///         NOT redeployed -- only setStylusScoreEngine() is called to rotate.
    address public constant STYLUS_SCORE_ENGINE_PROXY = 0xe7e15980C40db52BFC6dcaBb21B3d90edFB27c14;

    // ─── Deployment parameters ───────────────────────────────────────────────────

    /// @notice Initial TVL cap for the new CallRegistry.
    ///         $5,000 USDC (USDC has 6 decimals -- 5_000e6).
    ///         Matches Phase 2 deploy value; owner can raise to $100K post-deploy (CALL-34).
    uint256 public constant TVL_CAP = 5_000_000_000;

    /// @notice ETH funded into SettlementManager for Pyth update fees (Pitfall 4).
    ///         0.05 ETH initial budget. OPS-15 covers top-up when < 0.01 ETH.
    uint256 public constant PYTH_ETH_BUDGET = 0.05 ether;

    function run() external {
        // Load deployer key from environment.
        // For Sepolia: set DEPLOYER_PRIVATE_KEY to a funded Sepolia test key.
        // For mainnet: use hardware-wallet key (Phase 7.5).
        // NEVER hardcode or commit this key.
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        // Treasury must be a separate EOA or Safe -- NEVER address(this).
        // Use the same treasury as Phase 2/3/4 (0xDa8c...A4a5).
        // Set TREASURY_ADDRESS in your .env before running this script.
        address treasuryAddress = vm.envAddress("TREASURY_ADDRESS");

        // KMS signer addresses -- NEVER hardcode; always from env (vm.envAddress).
        // These are the GCP KMS EOA addresses whose private keys sign attestations.
        // An unset KMS env var means vm.envAddress returns address(0); the post-deploy
        // attestationSigner assertions below will catch any missing/wrong address.
        address kmsNftTwap       = vm.envAddress("KMS_ADDRESS_NFT_TWAP");
        address kmsDefiLlama     = vm.envAddress("KMS_ADDRESS_DEFILLAMA");
        address kmsSnapshotTally = vm.envAddress("KMS_ADDRESS_SNAPSHOT_TALLY");
        address kmsCex           = vm.envAddress("KMS_ADDRESS_CEX");

        vm.startBroadcast(deployerKey);

        // ─── 1. Deploy CallRegistry v3 ─────────────────────────────────────────
        // Reason for redeploy: ICallRegistry.EventSubtype enum updated in Phase 05.1
        // Plan 01 (Option A: Governance_Snapshot=6, Governance_Tally=7, ProtocolMilestone=8).
        // CallRegistry embeds the compiled interface -- new bytecode requires new address.
        // Constructor: (IProfileRegistry _profileRegistry, uint256 _tvlCap)
        CallRegistry cr = new CallRegistry(
            IProfileRegistry(PROFILE_REGISTRY),
            TVL_CAP
        );
        console.log("CallRegistry v3 deployed at:", address(cr));

        // ─── 1b. Redeploy FollowFadeMarket (Phase 05.1 cluster fix) ────────────
        // FFM.callRegistry is IMMUTABLE: the old FFM is permanently bound to the old
        // CallRegistry, so a CR redeploy REQUIRES a fresh FFM bound to the new CR.
        // Constructor: (callRegistry, profileRegistry, treasury)
        FollowFadeMarket ffm = new FollowFadeMarket(
            address(cr),
            PROFILE_REGISTRY,
            treasuryAddress
        );
        console.log("FollowFadeMarket v3 deployed at:", address(ffm));

        // ─── 1c. Redeploy ChallengeEscrow (Phase 05.1 cluster fix) ─────────────
        // CE.callRegistry AND CE.followFadeMarket are both IMMUTABLE: the old CE is
        // bound to the old CR + old FFM, so it must be rebuilt against the new pair.
        // Constructor: (callRegistry, followFadeMarket, usdc, treasury, tvlCap)
        ChallengeEscrow ce = new ChallengeEscrow(
            address(cr),
            address(ffm),
            USDC_ARB_NATIVE,
            treasuryAddress,
            TVL_CAP
        );
        console.log("ChallengeEscrow v2 deployed at:", address(ce));

        // ─── 2. Deploy SettlementManager (Phase 5.1) ───────────────────────────
        // Reason for redeploy: non-upgradeable + needs setAdapterMap/setAttestationSigner
        // calls at deploy time. Phase 4 SM had all adapterMap slots at Pyth(0) default.
        // Constructor: (callRegistry, followFadeMarket, challengeEscrow, profileRegistry,
        //               USDC_ARB_NATIVE, treasury, pythSepolia)
        // USDC MANDATE: USDC_ARB_NATIVE imported from ./constants/USDC.sol (no inline address).
        SettlementManager sm = new SettlementManager(
            address(cr),
            address(ffm),
            address(ce),
            PROFILE_REGISTRY,
            USDC_ARB_NATIVE,
            treasuryAddress,
            PYTH_ARBITRUM_SEPOLIA
        );
        console.log("SettlementManager deployed at:", address(sm));

        // ─── 3. Wire setSettlementManager on all 4 downstream contracts ────────
        // Each contract's setSettlementManager() is onlyOwner (deployer key in Phase 5.1).
        // Phase 6 multisig promotion rotates ownership.

        // 3a. CallRegistry -- wire the new FFM (createCall.initPool depends on it!) + new SM
        cr.setFollowFadeMarket(address(ffm));
        console.log("CallRegistry v3.setFollowFadeMarket -> FFM:", address(ffm));
        ICallRegistry(address(cr)).setSettlementManager(address(sm));
        console.log("CallRegistry v3.setSettlementManager -> SM:", address(sm));

        // 3b. FollowFadeMarket v3 (fresh) -- wire SM
        ffm.setSettlementManager(address(sm));
        console.log("FollowFadeMarket v3.setSettlementManager -> SM:", address(sm));

        // 3c. ChallengeEscrow v2 (fresh) -- wire SM
        ce.setSettlementManager(address(sm));
        console.log("ChallengeEscrow v2.setSettlementManager -> SM:", address(sm));

        // 3d. ProfileRegistry -- rotate SM pointer (was Phase 4 SM, now Phase 5.1 SM)
        IProfileRegistry(PROFILE_REGISTRY).setSettlementManager(address(sm));
        console.log("ProfileRegistry.setSettlementManager -> SM:", address(sm));

        // ─── 4. Authorize new SettlementManager as rep writer ──────────────────
        // SM calls pr.applyRepDelta + pr.updateAfterSettlement -- both require authorization.
        // Per spec §12.5 + Phase-2 D-04.
        IProfileRegistry(PROFILE_REGISTRY).setAuthorizedRepWriter(address(sm), true);
        console.log("ProfileRegistry.setAuthorizedRepWriter(SM, true) -> authorized");

        // ─── 5. Wire StylusScoreEngine proxy into new SM ───────────────────────
        // Phase 5 deployed the Stylus engine at STYLUS_SCORE_ENGINE_PROXY.
        // The new SM starts with stylusScoreEngine=address(0); wire it here.
        sm.setStylusScoreEngine(STYLUS_SCORE_ENGINE_PROXY);
        console.log("SettlementManager.setStylusScoreEngine ->", STYLUS_SCORE_ENGINE_PROXY);

        // ─── 6. Fund SettlementManager with ETH for Pyth fees ─────────────────
        // Pyth pull-oracle requires ETH to pay for VAA update fees (Pitfall 4).
        // Initial budget: 0.05 ETH. Relayer monitors; OPS-15 covers top-up.
        payable(address(sm)).transfer(PYTH_ETH_BUDGET);
        console.log("Funded SettlementManager with 0.05 ETH for Pyth update fees");

        // ─── 7. setAdapterMap -- ALL 8 pairs in one broadcast block ─────────────
        // CRITICAL: All 8 setAdapterMap calls are inside a single vm.startBroadcast()
        // block (Pitfall 4 / T-05.1-02-02). Atomicity at the broadcast level means all
        // calls go in the same forked mempool batch. Do NOT split across separate txs.
        //
        // adapterMap[Event=2][subtype] routing table:
        //   TvlMilestone=1    -> DefiLlama(2):   TVL threshold data from DefiLlama API
        //   VolumeFees=2      -> DefiLlama(2):   Volume/fees data from DefiLlama API
        //   OnchainMetric=3   -> RpcMetrics(3):  On-chain metrics via viem getLogs
        //   CexListing=4      -> CexScraper(6):  CEX listing events via Playwright
        //   TokenLaunch=5     -> CexScraper(6):  Token launch events via Playwright
        //   Governance_Snapshot=6 -> Snapshot(4): Snapshot.org proposal state (SETTLE-DUAL-GOV)
        //   Governance_Tally=7    -> Tally(5):    On-chain governance via Tally (SETTLE-DUAL-GOV)
        //   ProtocolMilestone=8   -> DefiLlama(2): TVL/fees milestones (design note: §4.3.7)
        //
        // adapterMap[PriceTarget=0][None=0] = Pyth(0) remains the DEFAULT (unset = 0).
        // NFT calls use PriceTarget+None; the relayer watcher distinguishes Pyth feedId
        // vs NFT contract address to route NftTwap (settlement-watcher.ts:486-515).
        // No separate adapterMap slot needed for NftTwap.

        sm.setAdapterMap(
            uint8(ICallRegistry.MarketType.Event),
            uint8(ICallRegistry.EventSubtype.TvlMilestone),
            ISettlementManager.OracleAdapter.DefiLlama
        ); // Event(2), TvlMilestone(1) -> DefiLlama(2)

        sm.setAdapterMap(
            uint8(ICallRegistry.MarketType.Event),
            uint8(ICallRegistry.EventSubtype.VolumeFees),
            ISettlementManager.OracleAdapter.DefiLlama
        ); // Event(2), VolumeFees(2) -> DefiLlama(2)

        sm.setAdapterMap(
            uint8(ICallRegistry.MarketType.Event),
            uint8(ICallRegistry.EventSubtype.OnchainMetric),
            ISettlementManager.OracleAdapter.RpcMetrics
        ); // Event(2), OnchainMetric(3) -> RpcMetrics(3)

        sm.setAdapterMap(
            uint8(ICallRegistry.MarketType.Event),
            uint8(ICallRegistry.EventSubtype.CexListing),
            ISettlementManager.OracleAdapter.CexScraper
        ); // Event(2), CexListing(4) -> CexScraper(6)

        sm.setAdapterMap(
            uint8(ICallRegistry.MarketType.Event),
            uint8(ICallRegistry.EventSubtype.TokenLaunch),
            ISettlementManager.OracleAdapter.CexScraper
        ); // Event(2), TokenLaunch(5) -> CexScraper(6)

        sm.setAdapterMap(
            uint8(ICallRegistry.MarketType.Event),
            uint8(ICallRegistry.EventSubtype.Governance_Snapshot),
            ISettlementManager.OracleAdapter.Snapshot
        ); // Event(2), Governance_Snapshot(6) -> Snapshot(4)  [SETTLE-DUAL-GOV]

        sm.setAdapterMap(
            uint8(ICallRegistry.MarketType.Event),
            uint8(ICallRegistry.EventSubtype.Governance_Tally),
            ISettlementManager.OracleAdapter.Tally
        ); // Event(2), Governance_Tally(7) -> Tally(5)  [SETTLE-DUAL-GOV]

        sm.setAdapterMap(
            uint8(ICallRegistry.MarketType.Event),
            uint8(ICallRegistry.EventSubtype.ProtocolMilestone),
            ISettlementManager.OracleAdapter.DefiLlama
        ); // Event(2), ProtocolMilestone(8) -> DefiLlama(2)  [design note: plan §4.3.7]

        console.log("setAdapterMap: all 8 pairs configured");

        // ─── 8. setAttestationSigner -- ALL 6 non-Pyth oracle types ────────────
        // Each oracle type has an independent KMS key (SAFETY-57 / T-04-04-01).
        // Pyth(0) is excluded -- Pyth uses on-chain VAA verification, not ECDSA attestation.
        // RpcMetrics(3) shares the DefiLlama key per AR-04-01 decision (both produce
        //   numeric off-chain attestations; different oracle type prevents cross-type replay).
        // Tally(5) shares the SnapshotTally key per AR-04-01.

        sm.setAttestationSigner(
            uint8(ISettlementManager.OracleAdapter.NftTwap),     // 1
            kmsNftTwap
        );
        console.log("setAttestationSigner: NftTwap(1) ->", kmsNftTwap);

        sm.setAttestationSigner(
            uint8(ISettlementManager.OracleAdapter.DefiLlama),   // 2
            kmsDefiLlama
        );
        console.log("setAttestationSigner: DefiLlama(2) ->", kmsDefiLlama);

        sm.setAttestationSigner(
            uint8(ISettlementManager.OracleAdapter.RpcMetrics),  // 3
            kmsDefiLlama  // shared key per AR-04-01
        );
        console.log("setAttestationSigner: RpcMetrics(3) -> kmsDefiLlama (shared per AR-04-01)");

        sm.setAttestationSigner(
            uint8(ISettlementManager.OracleAdapter.Snapshot),    // 4
            kmsSnapshotTally
        );
        console.log("setAttestationSigner: Snapshot(4) ->", kmsSnapshotTally);

        sm.setAttestationSigner(
            uint8(ISettlementManager.OracleAdapter.Tally),       // 5
            kmsSnapshotTally  // shared key per AR-04-01
        );
        console.log("setAttestationSigner: Tally(5) -> kmsSnapshotTally (shared per AR-04-01)");

        sm.setAttestationSigner(
            uint8(ISettlementManager.OracleAdapter.CexScraper),  // 6
            kmsCex
        );
        console.log("setAttestationSigner: CexScraper(6) ->", kmsCex);

        vm.stopBroadcast();

        // ─── Post-deploy assertions ──────────────────────────────────────────────
        // Run AFTER vm.stopBroadcast() -- view calls cost no gas.
        // If any require fails, the script exits non-zero and deployment is flagged.

        // --- Wiring assertions ---

        require(
            address(sm.callRegistry()) == address(cr),
            "DeployPhase5_1: sm.callRegistry() mismatch"
        );

        require(
            address(sm.followFadeMarket()) == address(ffm),
            "DeployPhase5_1: sm.followFadeMarket() mismatch"
        );

        require(
            address(sm.challengeEscrow()) == address(ce),
            "DeployPhase5_1: sm.challengeEscrow() mismatch"
        );

        // Cluster consistency (Phase 05.1 fix): fresh FFM/CE immutably bound to the
        // NEW CR, and CR wired to the new FFM (createCall.initPool depends on it).
        require(
            address(ffm.callRegistry()) == address(cr),
            "DeployPhase5_1: ffm.callRegistry() != new CR"
        );
        require(
            address(ce.callRegistry()) == address(cr),
            "DeployPhase5_1: ce.callRegistry() != new CR"
        );
        require(
            address(ce.followFadeMarket()) == address(ffm),
            "DeployPhase5_1: ce.followFadeMarket() != new FFM"
        );
        require(
            cr.followFadeMarket() == address(ffm),
            "DeployPhase5_1: cr.followFadeMarket() != new FFM"
        );

        require(
            address(sm.profileRegistry()) == PROFILE_REGISTRY,
            "DeployPhase5_1: sm.profileRegistry() mismatch"
        );

        require(
            sm.treasury() == treasuryAddress,
            "DeployPhase5_1: sm.treasury() mismatch"
        );

        require(
            address(sm.pyth()) == PYTH_ARBITRUM_SEPOLIA,
            "DeployPhase5_1: sm.pyth() mismatch"
        );

        require(
            cr.settlementManager() == address(sm),
            "DeployPhase5_1: CR.settlementManager() mismatch"
        );

        require(
            ffm.settlementManager() == address(sm),
            "DeployPhase5_1: FFM.settlementManager() mismatch"
        );

        require(
            ce.settlementManager() == address(sm),
            "DeployPhase5_1: CE.settlementManager() mismatch"
        );

        require(
            ProfileRegistry(PROFILE_REGISTRY).settlementManager() == address(sm),
            "DeployPhase5_1: PR.settlementManager() mismatch"
        );

        require(
            ProfileRegistry(PROFILE_REGISTRY).authorizedRepWriters(address(sm)),
            "DeployPhase5_1: PR.authorizedRepWriters(SM) != true"
        );

        require(
            address(sm).balance >= PYTH_ETH_BUDGET,
            "DeployPhase5_1: SM ETH balance < 0.05 ether"
        );

        // --- adapterMap assertions (SETTLE-06, SETTLE-DUAL-GOV) ---

        require(
            uint8(sm.adapterMap(
                uint8(ICallRegistry.MarketType.Event),
                uint8(ICallRegistry.EventSubtype.TvlMilestone)
            )) == 2,
            "DeployPhase5_1: adapterMap[Event][TvlMilestone] != DefiLlama(2)"
        );

        require(
            uint8(sm.adapterMap(
                uint8(ICallRegistry.MarketType.Event),
                uint8(ICallRegistry.EventSubtype.VolumeFees)
            )) == 2,
            "DeployPhase5_1: adapterMap[Event][VolumeFees] != DefiLlama(2)"
        );

        require(
            uint8(sm.adapterMap(
                uint8(ICallRegistry.MarketType.Event),
                uint8(ICallRegistry.EventSubtype.OnchainMetric)
            )) == 3,
            "DeployPhase5_1: adapterMap[Event][OnchainMetric] != RpcMetrics(3)"
        );

        require(
            uint8(sm.adapterMap(
                uint8(ICallRegistry.MarketType.Event),
                uint8(ICallRegistry.EventSubtype.CexListing)
            )) == 6,
            "DeployPhase5_1: adapterMap[Event][CexListing] != CexScraper(6)"
        );

        require(
            uint8(sm.adapterMap(
                uint8(ICallRegistry.MarketType.Event),
                uint8(ICallRegistry.EventSubtype.TokenLaunch)
            )) == 6,
            "DeployPhase5_1: adapterMap[Event][TokenLaunch] != CexScraper(6)"
        );

        require(
            uint8(sm.adapterMap(
                uint8(ICallRegistry.MarketType.Event),
                uint8(ICallRegistry.EventSubtype.Governance_Snapshot)
            )) == 4,
            "DeployPhase5_1: adapterMap[Event][Governance_Snapshot] != Snapshot(4)"
        );

        require(
            uint8(sm.adapterMap(
                uint8(ICallRegistry.MarketType.Event),
                uint8(ICallRegistry.EventSubtype.Governance_Tally)
            )) == 5,
            "DeployPhase5_1: adapterMap[Event][Governance_Tally] != Tally(5)"
        );

        require(
            uint8(sm.adapterMap(
                uint8(ICallRegistry.MarketType.Event),
                uint8(ICallRegistry.EventSubtype.ProtocolMilestone)
            )) == 2,
            "DeployPhase5_1: adapterMap[Event][ProtocolMilestone] != DefiLlama(2)"
        );

        // Assert Pyth path is unaffected (adapterMap[PriceTarget][None] = Pyth=0 is DEFAULT)
        require(
            uint8(sm.adapterMap(
                uint8(ICallRegistry.MarketType.PriceTarget),
                uint8(ICallRegistry.EventSubtype.None)
            )) == 0,
            "DeployPhase5_1: adapterMap[PriceTarget][None] != Pyth(0) -- Pyth spine corrupted"
        );

        // --- attestationSigner assertions (T-05.1-02-01) ---

        require(
            sm.attestationSigner(uint8(ISettlementManager.OracleAdapter.NftTwap)) != address(0),
            "DeployPhase5_1: attestationSigner[NftTwap(1)] == address(0) -- KMS_ADDRESS_NFT_TWAP unset"
        );

        require(
            sm.attestationSigner(uint8(ISettlementManager.OracleAdapter.DefiLlama)) != address(0),
            "DeployPhase5_1: attestationSigner[DefiLlama(2)] == address(0) -- KMS_ADDRESS_DEFILLAMA unset"
        );

        require(
            sm.attestationSigner(uint8(ISettlementManager.OracleAdapter.RpcMetrics)) != address(0),
            "DeployPhase5_1: attestationSigner[RpcMetrics(3)] == address(0) -- KMS_ADDRESS_DEFILLAMA unset"
        );

        require(
            sm.attestationSigner(uint8(ISettlementManager.OracleAdapter.Snapshot)) != address(0),
            "DeployPhase5_1: attestationSigner[Snapshot(4)] == address(0) -- KMS_ADDRESS_SNAPSHOT_TALLY unset"
        );

        require(
            sm.attestationSigner(uint8(ISettlementManager.OracleAdapter.Tally)) != address(0),
            "DeployPhase5_1: attestationSigner[Tally(5)] == address(0) -- KMS_ADDRESS_SNAPSHOT_TALLY unset"
        );

        require(
            sm.attestationSigner(uint8(ISettlementManager.OracleAdapter.CexScraper)) != address(0),
            "DeployPhase5_1: attestationSigner[CexScraper(6)] == address(0) -- KMS_ADDRESS_CEX unset"
        );

        // ─── Deployment Summary ──────────────────────────────────────────────────
        console.log("---");
        console.log("DEPLOYMENT SUMMARY (Arbitrum Sepolia -- Phase 5.1)");
        console.log("CallRegistry v3:     ", address(cr));
        console.log("FollowFadeMarket v3: ", address(ffm));
        console.log("ChallengeEscrow v2:  ", address(ce));
        console.log("SettlementManager:   ", address(sm));
        console.log("---");
        console.log("POST-DEPLOY ASSERTIONS: ALL PASSED");
        console.log("  sm.callRegistry()              -> CR v3 address              [OK]");
        console.log("  sm.followFadeMarket()          -> FOLLOW_FADE_MARKET         [OK]");
        console.log("  sm.challengeEscrow()           -> CHALLENGE_ESCROW           [OK]");
        console.log("  sm.profileRegistry()           -> PROFILE_REGISTRY           [OK]");
        console.log("  CR.settlementManager()         -> SM address                 [OK]");
        console.log("  FFM.settlementManager()        -> SM address                 [OK]");
        console.log("  CE.settlementManager()         -> SM address                 [OK]");
        console.log("  PR.settlementManager()         -> SM address                 [OK]");
        console.log("  PR.authorizedRepWriters(SM)    -> true                       [OK]");
        console.log("  SM ETH balance                 -> 0.05 ether                [OK]");
        console.log("  adapterMap[Event][TvlMilestone]      == DefiLlama(2)         [OK]");
        console.log("  adapterMap[Event][VolumeFees]        == DefiLlama(2)         [OK]");
        console.log("  adapterMap[Event][OnchainMetric]     == RpcMetrics(3)        [OK]");
        console.log("  adapterMap[Event][CexListing]        == CexScraper(6)        [OK]");
        console.log("  adapterMap[Event][TokenLaunch]       == CexScraper(6)        [OK]");
        console.log("  adapterMap[Event][Governance_Snapshot] == Snapshot(4)        [OK]");
        console.log("  adapterMap[Event][Governance_Tally]    == Tally(5)           [OK]");
        console.log("  adapterMap[Event][ProtocolMilestone]   == DefiLlama(2)       [OK]");
        console.log("  adapterMap[PriceTarget][None]          == Pyth(0) (unchanged)[OK]");
        console.log("  attestationSigner[NftTwap(1)]          != address(0)         [OK]");
        console.log("  attestationSigner[DefiLlama(2)]        != address(0)         [OK]");
        console.log("  attestationSigner[RpcMetrics(3)]       != address(0)         [OK]");
        console.log("  attestationSigner[Snapshot(4)]         != address(0)         [OK]");
        console.log("  attestationSigner[Tally(5)]            != address(0)         [OK]");
        console.log("  attestationSigner[CexScraper(6)]       != address(0)         [OK]");
        console.log("---");
        console.log("REQUIRED NEXT STEPS:");
        console.log("1. Update packages/shared/src/constants/addresses.ts:");
        console.log("   CALL_REGISTRY_ARBITRUM_SEPOLIA =", address(cr));
        console.log("   FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA =", address(ffm));
        console.log("   CHALLENGE_ESCROW_ARBITRUM_SEPOLIA =", address(ce));
        console.log("   SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA =", address(sm));
        console.log("2. Update packages/subgraph/subgraph.yaml (all 4 datasources):");
        console.log("   CallRegistry address =", address(cr));
        console.log("   FollowFadeMarket address =", address(ffm));
        console.log("   ChallengeEscrow address =", address(ce));
        console.log("   SettlementManager address =", address(sm));
        console.log("   startBlock = <block numbers printed above>");
        console.log("3. Rebuild and redeploy subgraph to Studio:");
        console.log("   cd packages/subgraph && pnpm run build && pnpm run deploy:sepolia");
        console.log("4. Update relayer .env:");
        console.log("   SETTLEMENT_MANAGER_ADDRESS =", address(sm));
        console.log("   CALL_REGISTRY_ADDRESS =", address(cr));
        console.log("5. Restart relayer workers (settlement-watcher, oracle adapters)");
        console.log("---");
        console.log("OPERATOR VERIFICATION (cast commands -- replace <NEW_SM> and <NEW_CR>):");
        console.log("  cast call", address(sm), "\"adapterMap(uint8,uint8)(uint8)\" 2 1 --rpc-url $ARBITRUM_SEPOLIA_RPC_URL");
        console.log("  # -> 2 (DefiLlama), NOT 0 (Pyth) -- non-Pyth rail now live");
        console.log("  cast call", address(sm), "\"adapterMap(uint8,uint8)(uint8)\" 2 6 --rpc-url $ARBITRUM_SEPOLIA_RPC_URL");
        console.log("  # -> 4 (Snapshot)  [SETTLE-DUAL-GOV]");
        console.log("  cast call", address(sm), "\"adapterMap(uint8,uint8)(uint8)\" 2 7 --rpc-url $ARBITRUM_SEPOLIA_RPC_URL");
        console.log("  # -> 5 (Tally)     [SETTLE-DUAL-GOV]");
        console.log("  cast call", address(sm), "\"adapterMap(uint8,uint8)(uint8)\" 0 0 --rpc-url $ARBITRUM_SEPOLIA_RPC_URL");
        console.log("  # -> 0 (Pyth) -- Pyth spine unaffected");
        console.log("  cast call", address(sm), "\"attestationSigner(uint8)(address)\" 1 --rpc-url $ARBITRUM_SEPOLIA_RPC_URL");
        console.log("  # -> KMS_ADDRESS_NFT_TWAP, NOT address(0)");
        console.log("  cast call", address(sm), "\"attestationSigner(uint8)(address)\" 2 --rpc-url $ARBITRUM_SEPOLIA_RPC_URL");
        console.log("  # -> KMS_ADDRESS_DEFILLAMA, NOT address(0)");
        console.log("  cast call", address(sm), "\"attestationSigner(uint8)(address)\" 3 --rpc-url $ARBITRUM_SEPOLIA_RPC_URL");
        console.log("  # -> KMS_ADDRESS_DEFILLAMA (shared), NOT address(0)");
        console.log("  cast call", address(sm), "\"attestationSigner(uint8)(address)\" 4 --rpc-url $ARBITRUM_SEPOLIA_RPC_URL");
        console.log("  # -> KMS_ADDRESS_SNAPSHOT_TALLY, NOT address(0)");
        console.log("  cast call", address(sm), "\"attestationSigner(uint8)(address)\" 5 --rpc-url $ARBITRUM_SEPOLIA_RPC_URL");
        console.log("  # -> KMS_ADDRESS_SNAPSHOT_TALLY (shared), NOT address(0)");
        console.log("  cast call", address(sm), "\"attestationSigner(uint8)(address)\" 6 --rpc-url $ARBITRUM_SEPOLIA_RPC_URL");
        console.log("  # -> KMS_ADDRESS_CEX, NOT address(0)");
        console.log("  cast call", address(cr), "\"settlementManager()(address)\" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL");
        console.log("  # -> new SM address");
        console.log("---");
    }
}
