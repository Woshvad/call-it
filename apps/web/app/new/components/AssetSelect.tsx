'use client';

import { PYTH_FEED_IDS } from '@call-it/shared';

/**
 * AssetSelect — reusable 24-asset grouped `.brutal-select` dropdown (CALL-06).
 *
 * Single source of asset entry for ALL THREE composer sub-forms (Price Target,
 * Spread vs, Event). The option VALUE is the plain ticker string ('BTC') —
 * preflight `resolveAssetToFeedId`, the dup-check canonicalization, and the
 * receipt preview consume the symbol unchanged downstream.
 *
 * Catalog binding: `symbols` is typed `readonly AssetSymbol[]` where
 * `AssetSymbol = keyof typeof PYTH_FEED_IDS` — adding/removing a feed in
 * packages/shared/src/constants/pyth-feed-ids.ts without updating the groups
 * is a COMPILE error here, and tests/asset-select.test.ts guards set equality
 * at runtime (24/24, no dupes, nothing extra).
 *
 * Note: the optgroup labels are display-only grouping. They do NOT write the
 * separate `category` form field (a user control in AdvancedSettings.tsx).
 *
 * Requirement: CALL-06, UI-02
 */

type AssetSymbol = keyof typeof PYTH_FEED_IDS;

export const ASSET_GROUPS: ReadonlyArray<{
  label: string;
  symbols: readonly AssetSymbol[];
}> = [
  { label: 'Majors', symbols: ['BTC', 'ETH', 'SOL', 'UNI', 'LINK', 'AAVE', 'SKY', 'DOGE'] },
  { label: 'L2s', symbols: ['ARB', 'OP', 'POL', 'MNT'] },
  { label: 'DeFi', symbols: ['GMX', 'PENDLE', 'RDNT', 'ONDO'] },
  { label: 'Restaking & LSTs', symbols: ['EIGEN', 'ETHFI', 'EZETH'] },
  { label: 'Memes', symbols: ['PEPE', 'WIF', 'BONK'] },
  { label: 'AI & RWA', symbols: ['RENDER', 'FET'] },
] as const;

interface AssetSelectProps {
  id: string;
  value: string | undefined;
  onChange: (symbol: string) => void;
  onBlur?: () => void;
  hasError?: boolean;
  placeholder?: string;
}

export function AssetSelect({
  id,
  value,
  onChange,
  onBlur,
  hasError,
  placeholder = 'Select asset',
}: AssetSelectProps) {
  return (
    <select
      id={id}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className="brutal-select mono"
      style={hasError ? { borderColor: 'var(--accent-loss)' } : undefined}
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {ASSET_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.symbols.map((sym) => (
            <option key={sym} value={sym}>
              {sym}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
