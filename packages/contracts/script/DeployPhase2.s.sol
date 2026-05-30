// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack -- Pinned Versions"
// Spec: CALL_IT_SPEC1.md §11.1, §11.2, §11.5, §19.11
// Requirement: SOCIAL-09, SOCIAL-21, D-01..D-06, SAFETY-18
//
// DEPLOYMENT SAFETY CHECKLIST (§19.11):
// 1. DEPLOYER_PRIVATE_KEY must be set (hardware-wallet-derived for mainnet; test key for Sepolia)
//    NEVER commit this key -- it must be in environment only
// 2. TREASURY_ADDRESS must be set -- separate EOA or Safe, NEVER address(this)
// 3. Verify foundry.toml has [rpc_endpoints.arbitrum_sepolia] = "${ARBITRUM_SEPOLIA_RPC_URL}"
// 4. Run dry-sim: forge script script/DeployPhase2.s.sol:DeployPhase2 --rpc-url arbitrum_sepolia
// 5. If sim passes, broadcast:
//    forge script script/DeployPhase2.s.sol:DeployPhase2 \
//      --rpc-url arbitrum_sepolia --broadcast \
//      --verify --etherscan-api-key $ARBISCAN_SEPOLIA_API_KEY
// 6. Record ALL THREE addresses in packages/shared/src/constants/addresses.ts
// 7. Record ALL THREE addresses + startBlock in packages/subgraph/subgraph.yaml
// 8. Verify on Arbiscan-Sepolia: https://sepolia.arbiscan.io/address/<addr>
//
// POST-DEPLOY VERIFICATION (§19.11):
// cast call <CallRegistry v2> "followFadeMarket()(address)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> FollowFadeMarket address
// cast call <CallRegistry v2> "tvlCap()(uint256)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> 5000000000
// cast call <ProfileRegistry v2> "authorizedRepWriters(address)(bool)" <FFM_ADDR> \
//   --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> true
// cast call <CallRegistry v2> "currentTvl()(uint256)" --rpc-url $ARBITRUM_SEPOLIA_RPC_URL
//   -> 0

import { Script } from "forge-std/Script.sol";
import { console } from "forge-std/console.sol";
import { ProfileRegistry } from "../src/ProfileRegistry.sol";
import { CallRegistry } from "../src/CallRegistry.sol";
import { FollowFadeMarket } from "../src/FollowFadeMarket.sol";
import { IProfileRegistry } from "../src/interfaces/IProfileRegistry.sol";

/// @title DeployPhase2
/// @notice Deploys ProfileRegistry v2, CallRegistry v2, and FollowFadeMarket to Arbitrum Sepolia.
///
///         Deploy order (D-01/D-04):
///         1. ProfileRegistry v2 (no constructor args; authorizedRepWriters mapping)
///         2. CallRegistry v2 (IProfileRegistry + tvlCap=$5,000)
///         3. FollowFadeMarket (ICallRegistry, IProfileRegistry, TREASURY_ADDRESS)
///         4. callRegistry.setFollowFadeMarket(address(followFadeMarket))
///         5. callRegistry.setTvlCap(5_000e6) — explicit re-set for new contract
///         6. Re-populate asset allowlist: 25 coins + 6 NFT collections
///         7. profileRegistry.setAuthorizedRepWriter(address(followFadeMarket), true)
///         8. callRegistry.setTreasury(TREASURY_ADDRESS) — wire treasury for fee routing
///         9. Post-deploy assertions
///
///         Sepolia chainId: 421614
///         Mainnet deploy: Phase 7.5 (after Sepolia staging gate >= 48h).
contract DeployPhase2 is Script {
    /// @notice Initial TVL cap: $5,000 USDC (per spec §10.1).
    ///         Owner can raise up to $100,000 (CallRegistry.MAX_ALLOWED_CAP).
    uint256 public constant INITIAL_TVL_CAP = 5_000_000_000; // $5,000 USDC with 6 decimals

    // ─── Pyth Feed IDs (verified 2026-05-21 per CLAUDE.md) ─────────────────────
    // Source: CLAUDE.md "Pyth Feed Catalogue -- Verified Against Hermes API (2026-05-21)"
    // All pinned feed IDs are taken verbatim from CLAUDE.md verified catalogue.
    // Source of truth for TS side: packages/shared/src/constants/pyth-feed-ids.ts
    //
    // RESOLVED 2026-05-30: UNI, LINK, AAVE, DOGE verified against Hermes; MKR
    // removed (Pyth delisted MKR/USD after the MakerDAO->Sky rebrand) and
    // replaced by SKY/USD. No bytes32(0) placeholders remain in the allowlist.

    // Fully pinned in CLAUDE.md (verified 2026-05-21):
    bytes32 constant FEED_BTC    = 0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43;
    bytes32 constant FEED_ETH    = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace;
    bytes32 constant FEED_SOL    = 0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d;
    bytes32 constant FEED_ARB    = 0x3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5;
    bytes32 constant FEED_OP     = 0x385f64d993f7b77d8182ed5003d97c60aa3361f3cecfe711544d2d59165e9bdf;
    bytes32 constant FEED_POL    = 0xffd11c5a1cfd42f80afb2df4d9f264c15f956d68153335374ec10722edd70472; // MATIC deprecated; use POL
    bytes32 constant FEED_MNT    = 0x4e3037c822d852d79af3ac80e35eb420ee3b870dca49f9344a38ef4773fb0585;
    bytes32 constant FEED_EIGEN  = 0xc65db025687356496e8653d0d6608eec64ce2d96e2e28c530e574f0e4f712380;
    bytes32 constant FEED_ETHFI  = 0xb27578a9654246cb0a2950842b92330e9ace141c52b63829cc72d5c45a5a595a;
    bytes32 constant FEED_EZETH  = 0x06c217a791f5c4f988b36629af4cb88fad827b2485400a358f3b02886b54de92;
    bytes32 constant FEED_PEPE   = 0xd69731a2e74ac1ce884fc3890f7ee324b6deb66147055249568869ed700882e4;
    bytes32 constant FEED_WIF    = 0x4ca4beeca86f0d164160323817a4e42b10010a724c2217c6ee41b54cd4cc61fc;
    bytes32 constant FEED_BONK   = 0x72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419;
    bytes32 constant FEED_GMX    = 0xb962539d0fcb272a494d65ea56f94851c2bcf8823935da05bd628916e2e9edbf;
    bytes32 constant FEED_PENDLE = 0x9a4df90b25497f66b1afb012467e316e801ca3d839456db028892fe8c70c8016;
    bytes32 constant FEED_RDNT   = 0xc8cf45412be4268bef8f76a8b0d60971c6e57ab57919083b8e9f12ba72adeeb6;
    bytes32 constant FEED_RENDER = 0x3d4a2bd9535be6ce8059d75eadeba507b043257321aa544717c56fa19b49e35d; // RNDR renamed to RENDER
    bytes32 constant FEED_FET    = 0x7da003ada32eabbac855af3d22fcf0fe692cc589f0cfd5ced63cf0bdcc742efe;
    bytes32 constant FEED_ONDO   = 0xd40472610abe56d36d065a0cf889fc8f1dd9f3b7f2a478231a5fc6df07ea5ce3;

    // Verified against Hermes 2026-05-30 (https://hermes.pyth.network/v2/price_feeds).
    // Mirror of packages/shared/src/constants/pyth-feed-ids.ts.
    bytes32 constant FEED_UNI    = 0x78d185a741d07edb3412b09008b7c5cfb9bbbd7d568bf00ba737b456ba171501;
    bytes32 constant FEED_LINK   = 0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221;
    bytes32 constant FEED_AAVE   = 0x2b9ab1e972a281585084148ba1389800799bd4be63b957507db1349314e47445;
    bytes32 constant FEED_DOGE   = 0xdcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c;
    // MKR/USD delisted from Pyth (MakerDAO -> Sky rebrand). Replaced by SKY/USD.
    bytes32 constant FEED_SKY    = 0xa483243eed64ca27a1f6e26385b7d1e0d07e9fe264bb6903efb3efc4689d3fe7;

    // ─── NFT Collection Addresses (Ethereum Mainnet) ────────────────────────────
    // Source: CALL_IT_SPEC1.md §4.4 + §13.2 + REQUIREMENTS.md CALL-07
    // Verified: standard blue-chip Ethereum NFT contract addresses.
    // Note: For Sepolia testing purposes these mainnet addresses are registered in
    //       the allowlist. Actual NFT floor settlement is relayer-computed via
    //       Alchemy getFloorPrice, which uses the mainnet contract address.
    //       These addresses encode as uint256 in Call.assetA for NFT market types.

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
        // Set TREASURY_ADDRESS in your .env before running this script.
        address treasuryAddress = vm.envAddress("TREASURY_ADDRESS");

        vm.startBroadcast(deployerKey);

        // ─── Step 1: Deploy ProfileRegistry v2 ─────────────────────────────────
        // No constructor args; Ownable sets owner = deployer.
        // v2 adds authorizedRepWriters mapping for FollowFadeMarket rep slash (D-04).
        ProfileRegistry profileRegistry = new ProfileRegistry();
        console.log("ProfileRegistry (v2) deployed at:", address(profileRegistry));

        // ─── Step 2: Deploy CallRegistry v2 ────────────────────────────────────
        // Points at new ProfileRegistry v2.
        // v2 adds setFollowFadeMarket, markCallerExited, stake forwarding to FFM.
        CallRegistry callRegistry = new CallRegistry(
            IProfileRegistry(address(profileRegistry)),
            INITIAL_TVL_CAP
        );
        console.log("CallRegistry (v2) deployed at:", address(callRegistry));

        // ─── Step 3: Deploy FollowFadeMarket ───────────────────────────────────
        // Constructor: (ICallRegistry, IProfileRegistry, treasury)
        // Treasury MUST NOT be address(this) -- TVL accounting invariant.
        FollowFadeMarket followFadeMarket = new FollowFadeMarket(
            address(callRegistry),
            address(profileRegistry),
            treasuryAddress
        );
        console.log("FollowFadeMarket deployed at:", address(followFadeMarket));

        // ─── Step 4: Wire FollowFadeMarket into CallRegistry ───────────────────
        // Required for: stake forwarding, markCallerExited authorization (D-01/D-02).
        callRegistry.setFollowFadeMarket(address(followFadeMarket));

        // ─── Step 5: Wire treasury into CallRegistry ───────────────────────────
        // Required for creation fee routing (D-01: full $10 creation fee to treasury).
        callRegistry.setTreasury(treasuryAddress);

        // ─── Step 6: Re-set TVL cap (explicit for new contract) ────────────────
        // Already set in constructor but explicit re-set per spec §10.1.
        // Note: constructor sets it; this is a redundant but explicit operator signal.
        callRegistry.setTvlCap(INITIAL_TVL_CAP);

        // ─── Step 7a: Re-populate coin asset allowlist (25 coins) ──────────────
        // Source: CLAUDE.md "Pyth Feed Catalogue -- Verified Against Hermes API (2026-05-21)"
        // All 25 spec'd Pyth feeds verified on 2026-05-21.
        callRegistry.addAsset("BTC",    FEED_BTC);
        callRegistry.addAsset("ETH",    FEED_ETH);
        callRegistry.addAsset("SOL",    FEED_SOL);
        callRegistry.addAsset("ARB",    FEED_ARB);
        callRegistry.addAsset("OP",     FEED_OP);
        callRegistry.addAsset("POL",    FEED_POL);    // Note: MATIC deprecated; use POL per CLAUDE.md
        callRegistry.addAsset("MNT",    FEED_MNT);
        callRegistry.addAsset("UNI",    FEED_UNI);
        callRegistry.addAsset("LINK",   FEED_LINK);
        callRegistry.addAsset("AAVE",   FEED_AAVE);
        callRegistry.addAsset("SKY",    FEED_SKY);  // replaces MKR (Pyth delisted MKR/USD)
        callRegistry.addAsset("EIGEN",  FEED_EIGEN);
        callRegistry.addAsset("ETHFI",  FEED_ETHFI);
        callRegistry.addAsset("EZETH",  FEED_EZETH);
        callRegistry.addAsset("PEPE",   FEED_PEPE);
        callRegistry.addAsset("WIF",    FEED_WIF);
        callRegistry.addAsset("BONK",   FEED_BONK);
        callRegistry.addAsset("DOGE",   FEED_DOGE);
        callRegistry.addAsset("GMX",    FEED_GMX);
        callRegistry.addAsset("PENDLE", FEED_PENDLE);
        callRegistry.addAsset("RDNT",   FEED_RDNT);
        callRegistry.addAsset("RENDER", FEED_RENDER); // Note: RNDR renamed to RENDER per CLAUDE.md
        callRegistry.addAsset("FET",    FEED_FET);
        callRegistry.addAsset("ONDO",   FEED_ONDO);

        // ─── Step 7b: Re-populate NFT collection allowlist (6 collections) ──────
        // Source: CALL_IT_SPEC1.md §4.4, REQUIREMENTS.md CALL-07
        // All 6 spec'd blue-chip Ethereum NFT collections.
        callRegistry.addNFTCollection(NFT_CRYPTOPUNKS,    "PUNK");
        callRegistry.addNFTCollection(NFT_BAYC,           "BAYC");
        callRegistry.addNFTCollection(NFT_PUDGY_PENGUINS, "PENGU");
        callRegistry.addNFTCollection(NFT_MILADY,         "MILADY");
        callRegistry.addNFTCollection(NFT_AZUKI,          "AZUKI");
        callRegistry.addNFTCollection(NFT_DEGODS,         "DEGODS");

        // ─── Step 8: Authorize FollowFadeMarket as rep writer ──────────────────
        // Required for caller-exit rep slash (D-04/D-05 SOCIAL-26).
        // SettlementManager will be added in Phase 4 via a second setAuthorizedRepWriter call.
        profileRegistry.setAuthorizedRepWriter(address(followFadeMarket), true);

        vm.stopBroadcast();

        // ─── Step 9: Post-deploy assertions ────────────────────────────────────
        // These run AFTER vm.stopBroadcast() to avoid charging gas for view calls.

        // Assert FollowFadeMarket wired correctly in CallRegistry
        require(
            callRegistry.followFadeMarket() == address(followFadeMarket),
            "DeployPhase2: followFadeMarket address mismatch"
        );

        // Assert FollowFadeMarket authorized as rep writer in ProfileRegistry
        require(
            profileRegistry.authorizedRepWriters(address(followFadeMarket)) == true,
            "DeployPhase2: FollowFadeMarket not authorized as rep writer"
        );

        // Assert TVL cap set correctly
        require(
            callRegistry.tvlCap() == INITIAL_TVL_CAP,
            "DeployPhase2: tvlCap mismatch"
        );

        // Assert zero TVL at deploy
        require(
            callRegistry.currentTvl() == 0,
            "DeployPhase2: currentTvl should be 0 post-deploy"
        );

        // Assert ProfileRegistry reference wired correctly in CallRegistry
        require(
            address(callRegistry.profileRegistry()) == address(profileRegistry),
            "DeployPhase2: profileRegistry reference mismatch"
        );

        // Assert FollowFadeMarket points to correct CallRegistry and ProfileRegistry
        require(
            address(followFadeMarket.callRegistry()) == address(callRegistry),
            "DeployPhase2: FollowFadeMarket.callRegistry mismatch"
        );
        require(
            address(followFadeMarket.profileRegistry()) == address(profileRegistry),
            "DeployPhase2: FollowFadeMarket.profileRegistry mismatch"
        );

        // Assert treasury wired in both contracts
        require(
            callRegistry.treasury() == treasuryAddress,
            "DeployPhase2: callRegistry.treasury mismatch"
        );
        require(
            followFadeMarket.treasury() == treasuryAddress,
            "DeployPhase2: followFadeMarket.treasury mismatch"
        );

        // ─── Deployment Summary ─────────────────────────────────────────────────
        console.log("---");
        console.log("DEPLOYMENT SUMMARY (Arbitrum Sepolia)");
        console.log("ProfileRegistry (v2):", address(profileRegistry));
        console.log("CallRegistry (v2):   ", address(callRegistry));
        console.log("FollowFadeMarket:    ", address(followFadeMarket));
        console.log("---");
        console.log("REQUIRED NEXT STEPS:");
        console.log("1. Update packages/shared/src/constants/addresses.ts:");
        console.log("   PROFILE_REGISTRY_ARBITRUM_SEPOLIA =", address(profileRegistry));
        console.log("   CALL_REGISTRY_ARBITRUM_SEPOLIA    =", address(callRegistry));
        console.log("   FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA =", address(followFadeMarket));
        console.log("2. Update packages/subgraph/subgraph.yaml:");
        console.log("   ProfileRegistry address + startBlock");
        console.log("   CallRegistry address + startBlock");
        console.log("   FollowFadeMarket address + startBlock");
        console.log("3. Run post-deploy verification (see header checklist)");
        console.log("---");
    }
}
