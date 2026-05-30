/**
 * Pyth Network price feed IDs for all 24 allowlisted assets in Call It v1.
 *
 * All values are 0x-prefixed 64-hex-char bytes32 strings (66 chars total).
 * Source: CLAUDE.md "Pyth Feed Catalogue — Verified Against Hermes API (2026-05-21)"
 * Verification: https://hermes.pyth.network/v2/price_feeds
 *
 * NAMING NOTES:
 * - POL replaces MATIC (Polygon deprecated MATIC in 2024) — see CLAUDE.md
 * - RENDER replaces RNDR (renamed post-token-migration) — see CLAUDE.md
 * - KPEPE and KBONK are NOT exported (use unscaled PEPE/BONK per CLAUDE.md)
 *
 * Formerly-unverified feeds resolved 2026-05-30 against Hermes:
 * - UNI, LINK, AAVE, DOGE now verified (real IDs below)
 * - MKR removed: Pyth delisted MKR/USD after the MakerDAO->Sky rebrand (2024);
 *   replaced by SKY/USD (PYTH_SKY_USD). SKY is a distinct token/price scale.
 *
 * Requirement: OPS-21, OPS-23
 */

// ---------------------------------------------------------------------------
// Majors (all verified 2026-05-21)
// ---------------------------------------------------------------------------

export const PYTH_BTC_USD =
  '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43' as const;

export const PYTH_ETH_USD =
  '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace' as const;

export const PYTH_SOL_USD =
  '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d' as const;

/** UNI/USD — verified 2026-05-30 via Hermes */
export const PYTH_UNI_USD =
  '0x78d185a741d07edb3412b09008b7c5cfb9bbbd7d568bf00ba737b456ba171501' as const;

/** LINK/USD — verified 2026-05-30 via Hermes */
export const PYTH_LINK_USD =
  '0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221' as const;

/** AAVE/USD — verified 2026-05-30 via Hermes */
export const PYTH_AAVE_USD =
  '0x2b9ab1e972a281585084148ba1389800799bd4be63b957507db1349314e47445' as const;

/**
 * SKY/USD — verified 2026-05-30 via Hermes.
 * Replaces MKR/USD: Pyth delisted MKR after the MakerDAO->Sky rebrand (2024).
 * SKY is a distinct token at a distinct price scale (NOT a 1:1 MKR substitute).
 */
export const PYTH_SKY_USD =
  '0xa483243eed64ca27a1f6e26385b7d1e0d07e9fe264bb6903efb3efc4689d3fe7' as const;

/** DOGE/USD — verified 2026-05-30 via Hermes */
export const PYTH_DOGE_USD =
  '0xdcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c' as const;

// ---------------------------------------------------------------------------
// L2s (all verified 2026-05-21)
// ---------------------------------------------------------------------------

export const PYTH_ARB_USD =
  '0x3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5' as const;

export const PYTH_OP_USD =
  '0x385f64d993f7b77d8182ed5003d97c60aa3361f3cecfe711544d2d59165e9bdf' as const;

// POL replaces MATIC (deprecated 2024) — see CLAUDE.md
export const PYTH_POL_USD =
  '0xffd11c5a1cfd42f80afb2df4d9f264c15f956d68153335374ec10722edd70472' as const;

export const PYTH_MNT_USD =
  '0x4e3037c822d852d79af3ac80e35eb420ee3b870dca49f9344a38ef4773fb0585' as const;

// ---------------------------------------------------------------------------
// DeFi Blue Chips (all verified 2026-05-21)
// ---------------------------------------------------------------------------

export const PYTH_GMX_USD =
  '0xb962539d0fcb272a494d65ea56f94851c2bcf8823935da05bd628916e2e9edbf' as const;

export const PYTH_PENDLE_USD =
  '0x9a4df90b25497f66b1afb012467e316e801ca3d839456db028892fe8c70c8016' as const;

export const PYTH_RDNT_USD =
  '0xc8cf45412be4268bef8f76a8b0d60971c6e57ab57919083b8e9f12ba72adeeb6' as const;

export const PYTH_ONDO_USD =
  '0xd40472610abe56d36d065a0cf889fc8f1dd9f3b7f2a478231a5fc6df07ea5ce3' as const;

// ---------------------------------------------------------------------------
// Restaking & LSTs (all verified 2026-05-21)
// ---------------------------------------------------------------------------

export const PYTH_EIGEN_USD =
  '0xc65db025687356496e8653d0d6608eec64ce2d96e2e28c530e574f0e4f712380' as const;

export const PYTH_ETHFI_USD =
  '0xb27578a9654246cb0a2950842b92330e9ace141c52b63829cc72d5c45a5a595a' as const;

/** ezETH (Renzo Restaked ETH) — verified 2026-05-21 */
export const PYTH_EZETH_USD =
  '0x06c217a791f5c4f988b36629af4cb88fad827b2485400a358f3b02886b54de92' as const;

// ---------------------------------------------------------------------------
// Memes (all verified 2026-05-21)
// Note: KPEPE and KBONK are NOT exported — use unscaled PEPE/BONK per CLAUDE.md
// ---------------------------------------------------------------------------

export const PYTH_PEPE_USD =
  '0xd69731a2e74ac1ce884fc3890f7ee324b6deb66147055249568869ed700882e4' as const;

export const PYTH_WIF_USD =
  '0x4ca4beeca86f0d164160323817a4e42b10010a724c2217c6ee41b54cd4cc61fc' as const;

export const PYTH_BONK_USD =
  '0x72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419' as const;

// ---------------------------------------------------------------------------
// AI & RWA (all verified 2026-05-21)
// ---------------------------------------------------------------------------

// RENDER replaces RNDR (renamed post-token-migration) — see CLAUDE.md
export const PYTH_RENDER_USD =
  '0x3d4a2bd9535be6ce8059d75eadeba507b043257321aa544717c56fa19b49e35d' as const;

/** FET/USD (Artificial Superintelligence Alliance post-merger) — verified 2026-05-21 */
export const PYTH_FET_USD =
  '0x7da003ada32eabbac855af3d22fcf0fe692cc589f0cfd5ced63cf0bdcc742efe' as const;

// ---------------------------------------------------------------------------
// All verified feed IDs (for iteration / validation)
// ---------------------------------------------------------------------------

/**
 * All 24 Pyth feed IDs, keyed by ticker symbol. All verified against Hermes.
 * (UNI/LINK/AAVE/DOGE verified 2026-05-30; MKR replaced by SKY.)
 *
 * Run: `pnpm verify-versions` to check registry drift.
 */
export const PYTH_FEED_IDS = {
  // Majors
  BTC: PYTH_BTC_USD,
  ETH: PYTH_ETH_USD,
  SOL: PYTH_SOL_USD,
  UNI: PYTH_UNI_USD,
  LINK: PYTH_LINK_USD,
  AAVE: PYTH_AAVE_USD,
  SKY: PYTH_SKY_USD, // replaces MKR (Pyth delisted MKR/USD after Maker->Sky rebrand)
  DOGE: PYTH_DOGE_USD,
  // L2s
  ARB: PYTH_ARB_USD,
  OP: PYTH_OP_USD,
  POL: PYTH_POL_USD, // POL replaces MATIC (deprecated 2024) — see CLAUDE.md
  MNT: PYTH_MNT_USD,
  // DeFi
  GMX: PYTH_GMX_USD,
  PENDLE: PYTH_PENDLE_USD,
  RDNT: PYTH_RDNT_USD,
  ONDO: PYTH_ONDO_USD,
  // Restaking & LSTs
  EIGEN: PYTH_EIGEN_USD,
  ETHFI: PYTH_ETHFI_USD,
  EZETH: PYTH_EZETH_USD,
  // Memes
  PEPE: PYTH_PEPE_USD,
  WIF: PYTH_WIF_USD,
  BONK: PYTH_BONK_USD,
  // AI & RWA
  RENDER: PYTH_RENDER_USD, // RENDER replaces RNDR — see CLAUDE.md
  FET: PYTH_FET_USD,
} as const;

/**
 * Feed IDs that require verification before mainnet deployment.
 * Empty as of 2026-05-30 — all formerly-unverified feeds are resolved
 * (UNI/LINK/AAVE/DOGE verified; MKR delisted by Pyth, replaced by SKY).
 */
export const PYTH_FEED_IDS_TODO_VERIFY = [] as const;
