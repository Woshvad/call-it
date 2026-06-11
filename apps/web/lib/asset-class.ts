/**
 * asset-class — presentation-layer asset-class grouping for the home-feed
 * filter chip row (quick-260611-t7h).
 *
 * Groups over the REAL `assetSymbol` enrichment on FeedItem
 * (lib/relayer-client.ts — resolved Pyth ticker for assetA), NOT the 3-value
 * on-chain Category enum (majors/defi/other — packages/shared/src/types/call.ts).
 *
 * The prototype's NFTS and MACRO chips are CUT per D-08: no NFT-floor or
 * macro call types exist in v1 data, so those chips could never match — a
 * chip that can never match is a dead control.
 *
 * Symbols sourced from the project's Pyth feed catalogue (CLAUDE.md).
 */

export const ASSET_CLASS_CHIPS = [
  'All',
  'Majors',
  'DeFi',
  'L2s',
  'Memecoins',
  'Arbitrum Eco',
  'Restaking',
] as const;

export type AssetClassChip = (typeof ASSET_CLASS_CHIPS)[number];

// Per-chip membership sets. This is MEMBERSHIP, not a partition — ARB is
// intentionally in BOTH 'L2s' and 'Arbitrum Eco'.
const CHIP_MEMBERS: Record<string, ReadonlySet<string>> = {
  Majors: new Set(['BTC', 'ETH', 'SOL']),
  DeFi: new Set(['UNI', 'LINK', 'AAVE', 'SKY', 'ONDO']),
  L2s: new Set(['ARB', 'OP', 'POL', 'MNT']),
  Memecoins: new Set(['PEPE', 'WIF', 'BONK', 'DOGE']),
  'Arbitrum Eco': new Set(['ARB', 'GMX', 'RDNT', 'PENDLE']),
  Restaking: new Set(['EIGEN', 'ETHFI', 'EZETH']),
};

/**
 * Does `assetSymbol` belong to `chip`'s asset class?
 *
 * - 'All' matches everything — including calls with no symbol (event calls).
 * - A missing/unmapped symbol (event calls, FET, future listings) matches NO
 *   non-All chip; an unknown chip name matches nothing. Case-insensitive.
 */
export function assetMatchesChip(assetSymbol: string | undefined, chip: string): boolean {
  if (chip === 'All') return true;
  if (!assetSymbol) return false;
  const members = CHIP_MEMBERS[chip];
  if (!members) return false;
  return members.has(assetSymbol.toUpperCase());
}
