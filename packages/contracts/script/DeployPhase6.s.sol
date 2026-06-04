// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack -- Pinned Versions"
// Spec: CALL_IT_SPEC1.md §12.4 -- SettlementManager setAdapterMap + setAttestationSigner
// Requirement: SAFETY-02, SAFETY-03, SAFETY-21,
//              SETTLE-06, SETTLE-DUAL-GOV, SETTLE-13, SETTLE-14, SETTLE-15,
//              SETTLE-18, SETTLE-19, SETTLE-21, SETTLE-22, SETTLE-23
//
// DEPLOYMENT SAFETY CHECKLIST (§19.11):
// 1. DEPLOYER_PRIVATE_KEY must be set (hardware-wallet-derived for mainnet; test key for Sepolia)
//    NEVER commit this key -- it must be in environment only
// 2. TREASURY_ADDRESS must be set -- same EOA/Safe as Phase 2/3/4/5.1
// 3. All 4 KMS env vars must be set -- NEVER hardcode or commit these addresses
//    KMS_ADDRESS_NFT_TWAP      -- GCP KMS key for NftTwap oracle attestations (OracleAdapter.NftTwap=1)
//    KMS_ADDRESS_DEFILLAMA     -- GCP KMS key for DefiLlama + RpcMetrics (shared key per AR-04-01)
//    KMS_ADDRESS_SNAPSHOT_TALLY -- GCP KMS key for Snapshot + Tally (shared key per AR-04-01)
//    KMS_ADDRESS_CEX           -- GCP KMS key for CexScraper attestations (OracleAdapter.CexScraper=6)
// 4. Verify foundry.toml has [rpc_endpoints.arbitrum_sepolia] = "${ARBITRUM_SEPOLIA_RPC_URL}"
// 5. Run dry-sim (no --broadcast):
//    cd packages/contracts
//    forge script script/DeployPhase6.s.sol:DeployPhase6 \
//      --rpc-url $ARBITRUM_SEPOLIA_RPC_URL \
//      --private-key $DEPLOYER_PRIVATE_KEY \
//      --sig "run()"
//    NOTE: resolveUsdc() requires chainid 421614 (Sepolia) or 42161 (mainnet).
//    The dry-run MUST use --rpc-url pointing at Sepolia (not local Anvil chainid 31337).
// 6. If sim passes, broadcast:
//    forge script script/DeployPhase6.s.sol:DeployPhase6 \
//      --rpc-url $ARBITRUM_SEPOLIA_RPC_URL \
//      --private-key $DEPLOYER_PRIVATE_KEY \
//      --broadcast \
//      --sig "run()"
// 7. Record new addresses from DEPLOYMENT SUMMARY console output.
//    Update packages/shared/src/constants/addresses.ts:
//    USDC_ARB_SEPOLIA (0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d)
//    CALL_REGISTRY_ARBITRUM_SEPOLIA = <new CR address>
//    FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA = <new FFM address>
//    CHALLENGE_ESCROW_ARBITRUM_SEPOLIA = <new CE address>
//    SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA = <new SM address>
// 8. Update packages/subgraph/subgraph.yaml:
//    CallRegistry address + startBlock (from console output)
//    FollowFadeMarket address + startBlock
//    ChallengeEscrow address + startBlock
//    SettlementManager address + startBlock
// 9. Rebuild and redeploy subgraph to Studio:
//    cd packages/subgraph && pnpm run build && pnpm run deploy:sepolia
// 10. Update relayer env vars (retargeted 05.1-OPERATOR-HANDOFF 5-step checklist):
//     CALL_REGISTRY_ADDRESS=<new CR>
//     FFM_ADDRESS=<new FFM>
//     CE_ADDRESS=<new CE>
//     SM_ADDRESS=<new SM>
//     USDC_ADDRESS=0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d
// 11. Re-grant KMS signers on new SM (cast send newSM "setAttestationSigner(uint8,address)" ...)
// 12. Run backfill-criteria.ts against new SM address.
// 13. Restart relayer workers (settlement-watcher, oracle adapters)
//
// WHY REDEPLOY (Phase 6 -- ADR-0001 hybrid money-path):
//   Phase 05.1 SM/CE used the hardcoded mainnet USDC address (Arbitrum One, circle canonical).
//   The Sepolia cluster must use Circle's official Sepolia USDC (0x75faf114...) so
//   the >=48h soak bot can execute real USDC transfers. resolveUsdc() is the
//   chainid-gated selector: chainid 42161 -> mainnet USDC (SAFETY-13 invariant PRESERVED),
//   chainid 421614 -> USDC_ARB_SEPOLIA. Mainnet branch is FIRST --
//   the SAFETY-13 unfakeable-USDC invariant is unconditional.
//   Both CR and FFM now call resolveUsdc() internally (they took no _usdc arg before);
//   CE + SM take _usdc as a constructor arg and assert _usdc == resolveUsdc().
//
// POST-DEPLOY VERIFICATION (§19.11 -- cast call commands):
// cast call <NEW_SM> "usdc()(address)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d (Circle Sepolia USDC)
// cast call <NEW_CE> "usdc()(address)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d (Circle Sepolia USDC)
// cast call 0xAfe239a3606b89Ef65DbBcDb1b87a920052c359E "settlementManager()(address)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> <NEW_SM>
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
// cast call <NEW_CR> "settlementManager()(address)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> <NEW_SM>

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
// Phase 6 CHANGE: import USDC_ARB_SEPOLIA + the chainid-gated resolver.
// The hardcoded mainnet constant is intentionally excluded here -- resolveUsdc() covers both chains.
import { USDC_ARB_SEPOLIA, resolveUsdc } from "../src/constants/USDC.sol";

/// @title DeployPhase6
/// @notice Redeploys the full cluster (CR v4 + FFM v4 + CE v3 + SM v5) on Arbitrum Sepolia
///         with Circle Sepolia USDC baked in via resolveUsdc() (ADR-0001 hybrid money-path).
///         Closes the Phase-05.1 gap where CE/SM used the hardcoded mainnet address even on Sepolia --
///         the >=48h soak bot could not make real USDC transfers against the old cluster.
///
///         Phase-6 diff from Phase 5.1 (MINIMAL):
///           - Import: resolveUsdc() + USDC_ARB_SEPOLIA from USDC.sol (replaces prior hardcoded import)
///           - ChallengeEscrow: resolveUsdc() constructor arg (was hardcoded mainnet in Phase 5.1)
///           - SettlementManager: resolveUsdc() constructor arg (was hardcoded mainnet in Phase 5.1)
///           - Post-deploy: sm.usdc() + ce.usdc() == resolveUsdc() assertions (USDC gate)
///           - Post-deploy: PR.settlementManager() == new SM assertion
///           - PR.setSettlementManager(newSM) call to re-wire the mutable cross-ref
///           - All version comments updated to "Phase 6"
///
///         Redeployed as a CONSISTENT CLUSTER (FFM/CE immutably reference CallRegistry):
///           CallRegistry v4, FollowFadeMarket v4, ChallengeEscrow v3, SettlementManager v5
///         NOT redeployed (settable refs / unaffected):
///           ProfileRegistry:          0xAfe239a3606b89Ef65DbBcDb1b87a920052c359E (Phase 2)
///           StylusScoreEngine proxy:  0xe7e15980C40db52BFC6dcaBb21B3d90edFB27c14 (Phase 5)
///           ProxyAdmin:               0xAeA5a279DDF1625490c5F4284eF0D735BB56044a (Phase 5)
///
///         Sepolia chainId: 421614
///         Mainnet deploy: Phase 7.5 (after >=48h Sepolia staging gate).
contract DeployPhase6 is Script {
    // ─── Phase 2/5 deployed addresses (Arbitrum Sepolia, UNCHANGED) ──────────
    // Source: packages/shared/src/constants/addresses.ts (populated 2026-05-30..2026-06-02)
    // Verified on Arbiscan Sepolia after each phase deploy.
    // NOTE: CR/FFM/CE/SM from Phase 05.1 are superseded by this redeploy.
    // Only PR, Stylus proxy, and ProxyAdmin are preserved unchanged.

    /// @notice ProfileRegistry v2 on Arbitrum Sepolia.
    ///         Deployed via DeployPhase2.s.sol at block 272458667.
    ///         NOT redeployed in Phase 6 -- setSettlementManager() rotates the SM pointer.
    address public constant PROFILE_REGISTRY = 0xAfe239a3606b89Ef65DbBcDb1b87a920052c359E;

    /// @notice StylusScoreEngine proxy on Arbitrum Sepolia.
    ///         Deployed via DeployPhase5Stylus.s.sol (Phase 5 Plan 06).
    ///         NOT redeployed -- only setStylusScoreEngine() is called to rotate.
    address public constant STYLUS_SCORE_ENGINE_PROXY = 0xe7e15980C40db52BFC6dcaBb21B3d90edFB27c14;

    /// @notice ProxyAdmin for StylusScoreEngine on Arbitrum Sepolia.
    ///         Deployed alongside STYLUS_SCORE_ENGINE_PROXY (Phase 5).
    ///         NOT redeployed in Phase 6.
    address public constant PROXY_ADMIN = 0xAeA5a279DDF1625490c5F4284eF0D735BB56044a;

    // ─── Oracle address ──────────────────────────────────────────────────────────

    /// @notice Pyth price feed contract on Arbitrum Sepolia.
    ///         Source: https://docs.pyth.network/price-feeds/contract-addresses/evm
    ///         Source: CLAUDE.md "Pinned Addresses"
    address public constant PYTH_ARBITRUM_SEPOLIA = 0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DAF;

    // ─── Deployment parameters ───────────────────────────────────────────────────

    /// @notice Initial TVL cap for the new CallRegistry.
    ///         $5,000 USDC (USDC has 6 decimals -- 5_000e6).
    ///         Matches Phase 2 deploy value; owner can raise to $100K post-deploy (CALL-34).
    uint256 public constant TVL_CAP = 5_000_000_000;

    /// @notice ETH funded into SettlementManager for Pyth update fees (Pitfall 4).
    ///         0.05 ETH initial budget. OPS-15 covers top-up when < 0.01 ETH.
    uint256 public constant PYTH_ETH_BUDGET = 0.05 ether;

    // ─── Asset allowlist constants (CALL-13) — Phase 6 wiring-gap FIX ─────────────
    // DeployPhase6 originally deployed CallRegistry with an EMPTY asset allowlist (no
    // addAsset calls) → every createCall reverted AssetNotAllowlisted. Re-populated
    // from DeployPhase2 (verified Pyth feed IDs, CLAUDE.md catalogue). Feed IDs are
    // chain-agnostic (same on Sepolia + mainnet).
    bytes32 constant FEED_BTC    = 0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43;
    bytes32 constant FEED_ETH    = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace;
    bytes32 constant FEED_SOL    = 0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d;
    bytes32 constant FEED_ARB    = 0x3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5;
    bytes32 constant FEED_OP     = 0x385f64d993f7b77d8182ed5003d97c60aa3361f3cecfe711544d2d59165e9bdf;
    bytes32 constant FEED_POL    = 0xffd11c5a1cfd42f80afb2df4d9f264c15f956d68153335374ec10722edd70472;
    bytes32 constant FEED_MNT    = 0x4e3037c822d852d79af3ac80e35eb420ee3b870dca49f9344a38ef4773fb0585;
    bytes32 constant FEED_UNI    = 0x78d185a741d07edb3412b09008b7c5cfb9bbbd7d568bf00ba737b456ba171501;
    bytes32 constant FEED_LINK   = 0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221;
    bytes32 constant FEED_AAVE   = 0x2b9ab1e972a281585084148ba1389800799bd4be63b957507db1349314e47445;
    bytes32 constant FEED_SKY    = 0xa483243eed64ca27a1f6e26385b7d1e0d07e9fe264bb6903efb3efc4689d3fe7;
    bytes32 constant FEED_EIGEN  = 0xc65db025687356496e8653d0d6608eec64ce2d96e2e28c530e574f0e4f712380;
    bytes32 constant FEED_ETHFI  = 0xb27578a9654246cb0a2950842b92330e9ace141c52b63829cc72d5c45a5a595a;
    bytes32 constant FEED_EZETH  = 0x06c217a791f5c4f988b36629af4cb88fad827b2485400a358f3b02886b54de92;
    bytes32 constant FEED_PEPE   = 0xd69731a2e74ac1ce884fc3890f7ee324b6deb66147055249568869ed700882e4;
    bytes32 constant FEED_WIF    = 0x4ca4beeca86f0d164160323817a4e42b10010a724c2217c6ee41b54cd4cc61fc;
    bytes32 constant FEED_BONK   = 0x72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419;
    bytes32 constant FEED_DOGE   = 0xdcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c;
    bytes32 constant FEED_GMX    = 0xb962539d0fcb272a494d65ea56f94851c2bcf8823935da05bd628916e2e9edbf;
    bytes32 constant FEED_PENDLE = 0x9a4df90b25497f66b1afb012467e316e801ca3d839456db028892fe8c70c8016;
    bytes32 constant FEED_RDNT   = 0xc8cf45412be4268bef8f76a8b0d60971c6e57ab57919083b8e9f12ba72adeeb6;
    bytes32 constant FEED_RENDER = 0x3d4a2bd9535be6ce8059d75eadeba507b043257321aa544717c56fa19b49e35d;
    bytes32 constant FEED_FET    = 0x7da003ada32eabbac855af3d22fcf0fe692cc589f0cfd5ced63cf0bdcc742efe;
    bytes32 constant FEED_ONDO   = 0xd40472610abe56d36d065a0cf889fc8f1dd9f3b7f2a478231a5fc6df07ea5ce3;

    address constant NFT_CRYPTOPUNKS     = 0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB;
    address constant NFT_BAYC            = 0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D;
    address constant NFT_PUDGY_PENGUINS  = 0xBd3531dA5CF5857e7CfAA92426877b022e612cf8;
    address constant NFT_MILADY          = 0x5Af0D9827E0c53E4799BB226655A1de152A425a5;
    address constant NFT_AZUKI           = 0xED5AF388653567Af2F388E6224dC7C4b3241C544;
    address constant NFT_DEGODS          = 0x8821BeE2ba0dF28761AffF119D66390D594CD280;

    function run() external {
        // Load deployer key from environment.
        // For Sepolia: set DEPLOYER_PRIVATE_KEY to a funded Sepolia test key.
        // For mainnet: use hardware-wallet key (Phase 7.5).
        // NEVER hardcode or commit this key.
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        // Treasury must be a separate EOA or Safe -- NEVER address(this).
        // Use the same treasury as Phase 2/3/4/5.1 (0xDa8c...A4a5).
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

        // ─── 1. Deploy CallRegistry v4 ─────────────────────────────────────────
        // Reason for redeploy: full-cluster consistency required when redeploying
        // CE/SM (which have immutable CR refs). CR itself calls resolveUsdc()
        // internally (no _usdc constructor arg); the redeploy gives us a fresh
        // address so FFM/CE/SM can reference the new CR immutably.
        // Constructor: (IProfileRegistry _profileRegistry, uint256 _tvlCap)
        CallRegistry cr = new CallRegistry(
            IProfileRegistry(PROFILE_REGISTRY),
            TVL_CAP
        );
        console.log("CallRegistry v4 deployed at:", address(cr));

        // ─── 1b. Redeploy FollowFadeMarket v4 (Phase 6 cluster fix) ────────────
        // FFM.callRegistry is IMMUTABLE: the old FFM is permanently bound to the old
        // CallRegistry, so a CR redeploy REQUIRES a fresh FFM bound to the new CR.
        // Constructor: (callRegistry, profileRegistry, treasury)
        // NOTE: FFM resolves USDC internally via resolveUsdc() -- no _usdc arg.
        FollowFadeMarket ffm = new FollowFadeMarket(
            address(cr),
            PROFILE_REGISTRY,
            treasuryAddress
        );
        console.log("FollowFadeMarket v4 deployed at:", address(ffm));

        // ─── 1c. Redeploy ChallengeEscrow v3 (Phase 6 USDC gate) ──────────────
        // CE.callRegistry AND CE.followFadeMarket are both IMMUTABLE: the old CE is
        // bound to the old CR + old FFM, so it must be rebuilt against the new pair.
        // Constructor: (callRegistry, followFadeMarket, usdc, treasury, tvlCap)
        //
        // Phase 6 KEY CHANGE: resolveUsdc() instead of the hardcoded mainnet address.
        // On Sepolia broadcast (chainid 421614): resolveUsdc() == USDC_ARB_SEPOLIA
        //   (0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d -- Circle testnet USDC)
        // On mainnet broadcast (chainid 42161, Phase 7): resolveUsdc() == Circle mainnet USDC
        //   (0xaf88d065e77c8cC2239327C5EDb3A432268e5831 -- native USDC; SAFETY-13)
        // CE constructor asserts _usdc == resolveUsdc() -- reverts if wrong chain.
        ChallengeEscrow ce = new ChallengeEscrow(
            address(cr),
            address(ffm),
            resolveUsdc(),       // Phase 6 KEY CHANGE: was hardcoded mainnet addr in Phase 5.1
            treasuryAddress,
            TVL_CAP
        );
        console.log("ChallengeEscrow v3 deployed at:", address(ce));

        // ─── 2. Deploy SettlementManager v5 (Phase 6) ─────────────────────────
        // Reason for redeploy: full cluster consistency + USDC gate.
        // Constructor: (callRegistry, followFadeMarket, challengeEscrow, profileRegistry,
        //               usdc, treasury, pyth)
        //
        // Phase 6 KEY CHANGE: resolveUsdc() instead of the hardcoded mainnet address.
        // SM constructor asserts _usdc == resolveUsdc() -- reverts if wrong chain.
        // USDC MANDATE: addresses exported from ./constants/USDC.sol (no inline literals).
        SettlementManager sm = new SettlementManager(
            address(cr),
            address(ffm),
            address(ce),
            PROFILE_REGISTRY,
            resolveUsdc(),       // Phase 6 KEY CHANGE: was hardcoded mainnet addr in Phase 5.1
            treasuryAddress,
            PYTH_ARBITRUM_SEPOLIA
        );
        console.log("SettlementManager v5 deployed at:", address(sm));

        // ─── 3. Wire setSettlementManager on all 4 downstream contracts ────────
        // Each contract's setSettlementManager() is onlyOwner (deployer key in Phase 6).
        // Phase 6 multisig promotion (Plan 04) rotates ownership to the 2-of-3 Safe.

        // 3a. CallRegistry v4 -- wire the new FFM (createCall.initPool depends on it!) + new SM
        cr.setFollowFadeMarket(address(ffm));
        console.log("CallRegistry v4.setFollowFadeMarket -> FFM:", address(ffm));
        ICallRegistry(address(cr)).setSettlementManager(address(sm));
        console.log("CallRegistry v4.setSettlementManager -> SM:", address(sm));

        // 3b. FollowFadeMarket v4 (fresh) -- wire SM
        ffm.setSettlementManager(address(sm));
        console.log("FollowFadeMarket v4.setSettlementManager -> SM:", address(sm));

        // 3c. ChallengeEscrow v3 (fresh) -- wire SM
        ce.setSettlementManager(address(sm));
        console.log("ChallengeEscrow v3.setSettlementManager -> SM:", address(sm));

        // 3d. ProfileRegistry -- rotate SM pointer (was Phase 05.1 SM, now Phase 6 SM)
        // Phase 6 addition: PR.setSettlementManager is called inside vm.startBroadcast()
        // so the deployer (still owner of PR) re-wires the mutable cross-ref.
        // This is required before the soak bot can trigger rep delta writes.
        IProfileRegistry(PROFILE_REGISTRY).setSettlementManager(address(sm));
        console.log("ProfileRegistry.setSettlementManager -> SM:", address(sm));

        // ─── 4. Authorize new SettlementManager as rep writer ──────────────────
        // SM calls pr.applyRepDelta + pr.updateAfterSettlement -- both require authorization.
        // Per spec §12.5 + Phase-2 D-04.
        IProfileRegistry(PROFILE_REGISTRY).setAuthorizedRepWriter(address(sm), true);
        console.log("ProfileRegistry.setAuthorizedRepWriter(SM, true) -> authorized");

        // 4b. Authorize the new FollowFadeMarket as rep writer (Phase 6 wiring-gap FIX).
        // FFM.initPool calls profileRegistry.applyRepDelta on every createCall; without
        // this, createCall reverts NotAuthorizedWriter. DeployPhase6 originally authorized
        // only the SM (above), never the freshly-redeployed FFM.
        IProfileRegistry(PROFILE_REGISTRY).setAuthorizedRepWriter(address(ffm), true);
        console.log("ProfileRegistry.setAuthorizedRepWriter(FFM, true) -> authorized");

        // ─── 5. Wire StylusScoreEngine proxy into new SM ───────────────────────
        // Phase 5 deployed the Stylus engine at STYLUS_SCORE_ENGINE_PROXY.
        // The new SM starts with stylusScoreEngine=address(0); wire it here.
        sm.setStylusScoreEngine(STYLUS_SCORE_ENGINE_PROXY);
        console.log("SettlementManager v5.setStylusScoreEngine ->", STYLUS_SCORE_ENGINE_PROXY);

        // ─── 6. Fund SettlementManager with ETH for Pyth fees ─────────────────
        // Pyth pull-oracle requires ETH to pay for VAA update fees (Pitfall 4).
        // Initial budget: 0.05 ETH. Relayer monitors; OPS-15 covers top-up.
        payable(address(sm)).transfer(PYTH_ETH_BUDGET);
        console.log("Funded SettlementManager v5 with 0.05 ETH for Pyth update fees");

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

        // ─── 9. Re-populate asset allowlist (CALL-13) — Phase 6 wiring-gap FIX ──
        // Without these, the freshly-deployed CallRegistry rejects EVERY createCall
        // (AssetNotAllowlisted). Mirrors DeployPhase2 step 7a/7b: 24 coins + 6 NFTs.
        cr.addAsset("BTC",    FEED_BTC);
        cr.addAsset("ETH",    FEED_ETH);
        cr.addAsset("SOL",    FEED_SOL);
        cr.addAsset("ARB",    FEED_ARB);
        cr.addAsset("OP",     FEED_OP);
        cr.addAsset("POL",    FEED_POL);
        cr.addAsset("MNT",    FEED_MNT);
        cr.addAsset("UNI",    FEED_UNI);
        cr.addAsset("LINK",   FEED_LINK);
        cr.addAsset("AAVE",   FEED_AAVE);
        cr.addAsset("SKY",    FEED_SKY);
        cr.addAsset("EIGEN",  FEED_EIGEN);
        cr.addAsset("ETHFI",  FEED_ETHFI);
        cr.addAsset("EZETH",  FEED_EZETH);
        cr.addAsset("PEPE",   FEED_PEPE);
        cr.addAsset("WIF",    FEED_WIF);
        cr.addAsset("BONK",   FEED_BONK);
        cr.addAsset("DOGE",   FEED_DOGE);
        cr.addAsset("GMX",    FEED_GMX);
        cr.addAsset("PENDLE", FEED_PENDLE);
        cr.addAsset("RDNT",   FEED_RDNT);
        cr.addAsset("RENDER", FEED_RENDER);
        cr.addAsset("FET",    FEED_FET);
        cr.addAsset("ONDO",   FEED_ONDO);
        cr.addNFTCollection(NFT_CRYPTOPUNKS,    "PUNK");
        cr.addNFTCollection(NFT_BAYC,           "BAYC");
        cr.addNFTCollection(NFT_PUDGY_PENGUINS, "PENGU");
        cr.addNFTCollection(NFT_MILADY,         "MILADY");
        cr.addNFTCollection(NFT_AZUKI,          "AZUKI");
        cr.addNFTCollection(NFT_DEGODS,         "DEGODS");
        console.log("addAsset: 24 coins + 6 NFT collections allowlisted");

        vm.stopBroadcast();

        // ─── Post-deploy assertions ──────────────────────────────────────────────
        // Run AFTER vm.stopBroadcast() -- view calls cost no gas.
        // If any require fails, the script exits non-zero and deployment is flagged.

        // --- Wiring assertions ---

        require(
            address(sm.callRegistry()) == address(cr),
            "DeployPhase6: sm.callRegistry() mismatch"
        );

        require(
            address(sm.followFadeMarket()) == address(ffm),
            "DeployPhase6: sm.followFadeMarket() mismatch"
        );

        require(
            address(sm.challengeEscrow()) == address(ce),
            "DeployPhase6: sm.challengeEscrow() mismatch"
        );

        // Cluster consistency: fresh FFM/CE immutably bound to the
        // NEW CR, and CR wired to the new FFM (createCall.initPool depends on it).
        require(
            address(ffm.callRegistry()) == address(cr),
            "DeployPhase6: ffm.callRegistry() != new CR"
        );
        require(
            address(ce.callRegistry()) == address(cr),
            "DeployPhase6: ce.callRegistry() != new CR"
        );
        require(
            address(ce.followFadeMarket()) == address(ffm),
            "DeployPhase6: ce.followFadeMarket() != new FFM"
        );
        require(
            cr.followFadeMarket() == address(ffm),
            "DeployPhase6: cr.followFadeMarket() != new FFM"
        );

        // --- Wiring-gap FIX assertions (Phase 6): rep-writers + asset allowlist ---
        require(
            ProfileRegistry(PROFILE_REGISTRY).authorizedRepWriters(address(ffm)),
            "DeployPhase6: FFM not authorized as rep writer"
        );
        require(
            ProfileRegistry(PROFILE_REGISTRY).authorizedRepWriters(address(sm)),
            "DeployPhase6: SM not authorized as rep writer"
        );
        require(
            cr.allowlistedFeedKeys(FEED_ETH) && cr.allowlistedFeedKeys(FEED_BTC),
            "DeployPhase6: asset allowlist not populated"
        );

        // The Phase-6 SM calls ProfileRegistry.globalRep(address) during settle()
        // (SettlementManager._computeRepDelta, OUTSIDE the Stylus try/catch). A PR
        // that predates that getter makes EVERY settle revert with no data — exactly
        // the Sepolia soak blocker (the preserved Phase-2 PR lacked globalRep). Assert
        // the SM<->PR coupling so a stale/incompatible PR fails the deploy loudly.
        (bool prHasGlobalRep, ) =
            PROFILE_REGISTRY.staticcall(abi.encodeWithSignature("globalRep(address)", address(0)));
        require(
            prHasGlobalRep,
            "DeployPhase6: ProfileRegistry lacks globalRep() -- SM.settle would revert; redeploy PR from current source"
        );

        require(
            address(sm.profileRegistry()) == PROFILE_REGISTRY,
            "DeployPhase6: sm.profileRegistry() mismatch"
        );

        require(
            sm.treasury() == treasuryAddress,
            "DeployPhase6: sm.treasury() mismatch"
        );

        require(
            address(sm.pyth()) == PYTH_ARBITRUM_SEPOLIA,
            "DeployPhase6: sm.pyth() mismatch"
        );

        require(
            cr.settlementManager() == address(sm),
            "DeployPhase6: CR.settlementManager() mismatch"
        );

        require(
            ffm.settlementManager() == address(sm),
            "DeployPhase6: FFM.settlementManager() mismatch"
        );

        require(
            ce.settlementManager() == address(sm),
            "DeployPhase6: CE.settlementManager() mismatch"
        );

        require(
            ProfileRegistry(PROFILE_REGISTRY).settlementManager() == address(sm),
            "DeployPhase6: PR.settlementManager() mismatch"
        );

        require(
            ProfileRegistry(PROFILE_REGISTRY).authorizedRepWriters(address(sm)),
            "DeployPhase6: PR.authorizedRepWriters(SM) != true"
        );

        require(
            address(sm).balance >= PYTH_ETH_BUDGET,
            "DeployPhase6: SM ETH balance < 0.05 ether"
        );

        // --- Phase 6 USDC gate assertions (ADR-0001) ---
        // Confirm that both CE and SM received the correct chain-resolved USDC address.
        // On Sepolia: resolveUsdc() == 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d
        // On mainnet: resolveUsdc() == 0xaf88d065e77c8cC2239327C5EDb3A432268e5831
        // Any mismatch here means the chain is wrong or the USDC constant is wrong.

        require(
            address(sm.usdc()) == resolveUsdc(),
            "DeployPhase6: sm.usdc() != resolveUsdc() -- USDC gate failure"
        );

        require(
            address(ce.usdc()) == resolveUsdc(),
            "DeployPhase6: ce.usdc() != resolveUsdc() -- USDC gate failure"
        );

        // --- Phase 6: ProfileRegistry SM pointer assertion ---
        // Confirms that PR.setSettlementManager(newSM) executed correctly above.
        // The soak bot's rep-delta writes depend on this pointer being current.
        require(
            ProfileRegistry(PROFILE_REGISTRY).settlementManager() == address(sm),
            "DeployPhase6: PR.settlementManager() != new SM -- setSettlementManager call failed"
        );

        // --- adapterMap assertions (SETTLE-06, SETTLE-DUAL-GOV) ---

        require(
            uint8(sm.adapterMap(
                uint8(ICallRegistry.MarketType.Event),
                uint8(ICallRegistry.EventSubtype.TvlMilestone)
            )) == 2,
            "DeployPhase6: adapterMap[Event][TvlMilestone] != DefiLlama(2)"
        );

        require(
            uint8(sm.adapterMap(
                uint8(ICallRegistry.MarketType.Event),
                uint8(ICallRegistry.EventSubtype.VolumeFees)
            )) == 2,
            "DeployPhase6: adapterMap[Event][VolumeFees] != DefiLlama(2)"
        );

        require(
            uint8(sm.adapterMap(
                uint8(ICallRegistry.MarketType.Event),
                uint8(ICallRegistry.EventSubtype.OnchainMetric)
            )) == 3,
            "DeployPhase6: adapterMap[Event][OnchainMetric] != RpcMetrics(3)"
        );

        require(
            uint8(sm.adapterMap(
                uint8(ICallRegistry.MarketType.Event),
                uint8(ICallRegistry.EventSubtype.CexListing)
            )) == 6,
            "DeployPhase6: adapterMap[Event][CexListing] != CexScraper(6)"
        );

        require(
            uint8(sm.adapterMap(
                uint8(ICallRegistry.MarketType.Event),
                uint8(ICallRegistry.EventSubtype.TokenLaunch)
            )) == 6,
            "DeployPhase6: adapterMap[Event][TokenLaunch] != CexScraper(6)"
        );

        require(
            uint8(sm.adapterMap(
                uint8(ICallRegistry.MarketType.Event),
                uint8(ICallRegistry.EventSubtype.Governance_Snapshot)
            )) == 4,
            "DeployPhase6: adapterMap[Event][Governance_Snapshot] != Snapshot(4)"
        );

        require(
            uint8(sm.adapterMap(
                uint8(ICallRegistry.MarketType.Event),
                uint8(ICallRegistry.EventSubtype.Governance_Tally)
            )) == 5,
            "DeployPhase6: adapterMap[Event][Governance_Tally] != Tally(5)"
        );

        require(
            uint8(sm.adapterMap(
                uint8(ICallRegistry.MarketType.Event),
                uint8(ICallRegistry.EventSubtype.ProtocolMilestone)
            )) == 2,
            "DeployPhase6: adapterMap[Event][ProtocolMilestone] != DefiLlama(2)"
        );

        // Assert Pyth path is unaffected (adapterMap[PriceTarget][None] = Pyth=0 is DEFAULT)
        require(
            uint8(sm.adapterMap(
                uint8(ICallRegistry.MarketType.PriceTarget),
                uint8(ICallRegistry.EventSubtype.None)
            )) == 0,
            "DeployPhase6: adapterMap[PriceTarget][None] != Pyth(0) -- Pyth spine corrupted"
        );

        // --- attestationSigner assertions (T-05.1-02-01) ---

        require(
            sm.attestationSigner(uint8(ISettlementManager.OracleAdapter.NftTwap)) != address(0),
            "DeployPhase6: attestationSigner[NftTwap(1)] == address(0) -- KMS_ADDRESS_NFT_TWAP unset"
        );

        require(
            sm.attestationSigner(uint8(ISettlementManager.OracleAdapter.DefiLlama)) != address(0),
            "DeployPhase6: attestationSigner[DefiLlama(2)] == address(0) -- KMS_ADDRESS_DEFILLAMA unset"
        );

        require(
            sm.attestationSigner(uint8(ISettlementManager.OracleAdapter.RpcMetrics)) != address(0),
            "DeployPhase6: attestationSigner[RpcMetrics(3)] == address(0) -- KMS_ADDRESS_DEFILLAMA unset"
        );

        require(
            sm.attestationSigner(uint8(ISettlementManager.OracleAdapter.Snapshot)) != address(0),
            "DeployPhase6: attestationSigner[Snapshot(4)] == address(0) -- KMS_ADDRESS_SNAPSHOT_TALLY unset"
        );

        require(
            sm.attestationSigner(uint8(ISettlementManager.OracleAdapter.Tally)) != address(0),
            "DeployPhase6: attestationSigner[Tally(5)] == address(0) -- KMS_ADDRESS_SNAPSHOT_TALLY unset"
        );

        require(
            sm.attestationSigner(uint8(ISettlementManager.OracleAdapter.CexScraper)) != address(0),
            "DeployPhase6: attestationSigner[CexScraper(6)] == address(0) -- KMS_ADDRESS_CEX unset"
        );

        // ─── Deployment Summary ──────────────────────────────────────────────────
        console.log("---");
        console.log("DEPLOYMENT SUMMARY (Arbitrum Sepolia -- Phase 6)");
        console.log("CallRegistry v4:     ", address(cr));
        console.log("FollowFadeMarket v4: ", address(ffm));
        console.log("ChallengeEscrow v3:  ", address(ce));
        console.log("SettlementManager v5:", address(sm));
        console.log("---");
        console.log("PHASE 6 USDC GATE:");
        console.log("  resolveUsdc() (on this chain) ->", resolveUsdc());
        console.log("  sm.usdc()  ->", sm.usdc());
        console.log("  ce.usdc()  ->", ce.usdc());
        console.log("  (Both must equal the circle address for this chain)");
        console.log("---");
        console.log("POST-DEPLOY ASSERTIONS: ALL PASSED");
        console.log("  sm.callRegistry()              -> CR v4 address              [OK]");
        console.log("  sm.followFadeMarket()          -> FFM v4 address             [OK]");
        console.log("  sm.challengeEscrow()           -> CE v3 address              [OK]");
        console.log("  sm.profileRegistry()           -> PROFILE_REGISTRY           [OK]");
        console.log("  CR.settlementManager()         -> SM v5 address              [OK]");
        console.log("  FFM.settlementManager()        -> SM v5 address              [OK]");
        console.log("  CE.settlementManager()         -> SM v5 address              [OK]");
        console.log("  PR.settlementManager()         -> SM v5 address              [OK]");
        console.log("  PR.authorizedRepWriters(SM)    -> true                       [OK]");
        console.log("  SM ETH balance                 -> 0.05 ether                [OK]");
        console.log("  sm.usdc()                      -> resolveUsdc()              [OK]  Phase 6 USDC gate");
        console.log("  ce.usdc()                      -> resolveUsdc()              [OK]  Phase 6 USDC gate");
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
        console.log("   USDC_ARB_SEPOLIA = 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d");
        console.log("   CALL_REGISTRY_ARBITRUM_SEPOLIA =", address(cr));
        console.log("   FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA =", address(ffm));
        console.log("   CHALLENGE_ESCROW_ARBITRUM_SEPOLIA =", address(ce));
        console.log("   SETTLEMENT_MANAGER_ARBITRUM_SEPOLIA =", address(sm));
        console.log("   Add comment: 'Phase 6 cluster redeploy 2026-06-XX (block N); supersedes Phase 05.1 address.'");
        console.log("2. Update packages/subgraph/subgraph.yaml (all 4 datasources):");
        console.log("   CallRegistry address =", address(cr));
        console.log("   FollowFadeMarket address =", address(ffm));
        console.log("   ChallengeEscrow address =", address(ce));
        console.log("   SettlementManager address =", address(sm));
        console.log("   startBlock = <block numbers from Arbiscan Sepolia deploy txs>");
        console.log("3. Rebuild and redeploy subgraph to Studio:");
        console.log("   cd packages/subgraph && pnpm run build && pnpm run deploy:sepolia");
        console.log("4. Update relayer env vars (retargeted 05.1-OPERATOR-HANDOFF checklist):");
        console.log("   CALL_REGISTRY_ADDRESS =", address(cr));
        console.log("   FFM_ADDRESS =", address(ffm));
        console.log("   CE_ADDRESS =", address(ce));
        console.log("   SM_ADDRESS =", address(sm));
        console.log("   USDC_ADDRESS = 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d");
        console.log("5. Re-grant KMS signers on new SM:");
        console.log("   cast send", address(sm), "\"setAttestationSigner(uint8,address)\" 1 $KMS_ADDRESS_NFT_TWAP --rpc-url $ARBITRUM_SEPOLIA_RPC_URL --private-key $DEPLOYER_PRIVATE_KEY");
        console.log("   cast send", address(sm), "\"setAttestationSigner(uint8,address)\" 2 $KMS_ADDRESS_DEFILLAMA ...");
        console.log("   cast send", address(sm), "\"setAttestationSigner(uint8,address)\" 3 $KMS_ADDRESS_DEFILLAMA ...");
        console.log("   cast send", address(sm), "\"setAttestationSigner(uint8,address)\" 4 $KMS_ADDRESS_SNAPSHOT_TALLY ...");
        console.log("   cast send", address(sm), "\"setAttestationSigner(uint8,address)\" 5 $KMS_ADDRESS_SNAPSHOT_TALLY ...");
        console.log("   cast send", address(sm), "\"setAttestationSigner(uint8,address)\" 6 $KMS_ADDRESS_CEX ...");
        console.log("6. Run backfill-criteria.ts against new SM address:");
        console.log("   node apps/relayer/src/scripts/backfill-criteria.ts");
        console.log("7. Restart relayer workers (settlement-watcher, oracle adapters)");
        console.log("8. Verify relayer is live:");
        console.log("   curl https://call-it-relayer-sepolia/health  # expect 200 {status:ok}");
        console.log("---");
        console.log("OPERATOR VERIFICATION (cast commands):");
        console.log("  cast call", address(sm), "\"usdc()(address)\" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL");
        console.log("  # -> 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d (Circle Sepolia USDC)");
        console.log("  cast call", address(ce), "\"usdc()(address)\" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL");
        console.log("  # -> 0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d (Circle Sepolia USDC)");
        console.log("  cast call", PROFILE_REGISTRY, "\"settlementManager()(address)\" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL");
        console.log("  # ->", address(sm), "(new SM v5)");
        console.log("  cast call", address(sm), "\"adapterMap(uint8,uint8)(uint8)\" 2 1 --rpc-url $ARBITRUM_SEPOLIA_RPC_URL");
        console.log("  # -> 2 (DefiLlama), NOT 0 (Pyth) -- non-Pyth rail live");
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
        console.log("  cast call", address(cr), "\"settlementManager()(address)\" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL");
        console.log("  # -> new SM v5 address");
        console.log("---");
    }
}
