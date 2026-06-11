/**
 * useFeedMarketData — batched, chainId-pinned, fetch-once on-chain reads for
 * the home-feed live cards (quick-260611-u1l).
 *
 * CU discipline (Alchemy burn lesson, commit 065729c): ONE multicall batch per
 * data type per feed page, staleTime-only freshness (30s reserves / 60s
 * handles), ZERO refetchInterval — the call page owns live 5s precision; the
 * feed is a browse surface.
 *
 * RC1 (chain-pinning): every contract entry pins `chainId: ACTIVE_CHAIN_ID` —
 * unpinned useReadContracts defaults to the first chain in the wagmi config.
 *
 * D-07 degradation contract: a missing Map entry means the consuming card
 * HIDES the dependent block (odds/pools or the on-chain handle tier) — absent
 * data is never fabricated. Failed/partial reads and empty-string handles are
 * dropped from the Maps.
 */

'use client';

import { useMemo } from 'react';
import { useReadContracts } from 'wagmi';
import {
  FOLLOW_FADE_MARKET_ADDRESS,
  PROFILE_REGISTRY_ADDRESS,
  ACTIVE_CHAIN_ID,
} from '@/lib/chain';
import { followFadeMarketAbi, profileRegistryAbi } from '@/lib/abis';

/**
 * Real FollowFadeMarket reserves for a page of call ids — TWO reads per id
 * (followReserve + fadeReserve) in one batched multicall. An entry exists in
 * the returned Map ONLY when BOTH reads succeeded (D-07: partial data → the
 * card degrades to conviction-only).
 */
export function useFeedReserves(callIds: string[]): Map<string, { follow: bigint; fade: bigint }> {
  // Stable key from the SORTED inputs so a new array identity per render
  // never rebuilds the contracts array (refetch-loop guard).
  const key = [...callIds].sort().join(',');

  const { contracts, validIds } = useMemo(() => {
    const ids = key === '' ? [] : key.split(',');
    const validIds: string[] = [];
    const contracts: {
      address: `0x${string}`;
      chainId: typeof ACTIVE_CHAIN_ID;
      abi: typeof followFadeMarketAbi;
      functionName: 'followReserve' | 'fadeReserve';
      args: readonly [bigint];
    }[] = [];
    for (const id of ids) {
      let arg: bigint;
      try {
        arg = BigInt(id);
      } catch {
        continue; // non-numeric id — skip; contracts/validIds stay in lockstep
      }
      validIds.push(id);
      contracts.push({
        address: FOLLOW_FADE_MARKET_ADDRESS,
        chainId: ACTIVE_CHAIN_ID,
        abi: followFadeMarketAbi,
        functionName: 'followReserve',
        args: [arg] as const,
      });
      contracts.push({
        address: FOLLOW_FADE_MARKET_ADDRESS,
        chainId: ACTIVE_CHAIN_ID,
        abi: followFadeMarketAbi,
        functionName: 'fadeReserve',
        args: [arg] as const,
      });
    }
    return { contracts, validIds };
  }, [key]);

  const { data } = useReadContracts({
    contracts,
    query: { enabled: validIds.length > 0, staleTime: 30_000 },
  });

  return useMemo(() => {
    const map = new Map<string, { follow: bigint; fade: bigint }>();
    if (!data) return map;
    validIds.forEach((id, i) => {
      const followRead = data[2 * i];
      const fadeRead = data[2 * i + 1];
      if (followRead?.status === 'success' && fadeRead?.status === 'success') {
        map.set(id, {
          follow: followRead.result as bigint,
          fade: fadeRead.result as bigint,
        });
      }
    });
    return map;
  }, [data, validIds]);
}

/**
 * On-chain ProfileRegistry.displayHandle fallback tier (AUTH-44) for a page of
 * caller addresses — deduped to unique lowercased addresses, one read each.
 * Empty-string results (unset handle) and failed reads are DROPPED so the card
 * falls through to the truncated-address tier.
 */
export function useFeedHandles(callers: string[]): Map<string, string> {
  const key = [...new Set(callers.map((c) => c.toLowerCase()))].sort().join(',');

  const unique = useMemo(() => (key === '' ? [] : key.split(',')), [key]);

  const contracts = useMemo(
    () =>
      unique.map((addr) => ({
        address: PROFILE_REGISTRY_ADDRESS,
        chainId: ACTIVE_CHAIN_ID,
        abi: profileRegistryAbi,
        functionName: 'displayHandle' as const,
        args: [addr as `0x${string}`] as const,
      })),
    [unique],
  );

  const { data } = useReadContracts({
    contracts,
    query: { enabled: unique.length > 0, staleTime: 60_000 },
  });

  return useMemo(() => {
    const map = new Map<string, string>();
    if (!data) return map;
    unique.forEach((addr, i) => {
      const read = data[i];
      if (read?.status === 'success' && typeof read.result === 'string' && read.result !== '') {
        map.set(addr, read.result);
      }
    });
    return map;
  }, [data, unique]);
}
