/**
 * call-created-log.ts — pure helpers for the composer's direct-EOA publish
 * path (quick-260611-co5). No 'use client', no React — mirrors the
 * testability pattern of app/new/lib/preflight-body.ts so the logic is
 * unit-testable in node-environment vitest with real viem decodes.
 */

import {
  decodeEventLog,
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
} from 'viem';
import { callRegistryAbi } from '@/lib/abis';

/**
 * Structural log shape — fits both viem `Log` and raw receipt logs.
 */
export interface ReceiptLogLike {
  readonly address: `0x${string}`;
  readonly data: `0x${string}`;
  readonly topics: readonly `0x${string}`[];
}

/**
 * Extract the new callId from a createCall receipt's logs.
 *
 * Scans for a CallCreated event emitted by the CallRegistry contract
 * (address compare is case-insensitive). Returns the indexed `id` as a
 * bigint, or null if no matching log decodes — never throws on garbage logs.
 */
export function extractCallIdFromLogs(
  logs: readonly ReceiptLogLike[],
  callRegistryAddress: `0x${string}`,
): bigint | null {
  const registry = callRegistryAddress.toLowerCase();

  for (const log of logs) {
    if (log.address.toLowerCase() !== registry) continue;
    try {
      const decoded = decodeEventLog({
        abi: callRegistryAbi,
        data: log.data,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      if (decoded.eventName === 'CallCreated') {
        return decoded.args.id as bigint;
      }
    } catch {
      // Not a decodable CallRegistry event — skip and keep scanning.
      continue;
    }
  }

  return null;
}

/**
 * Extract a decoded custom-error name (e.g. 'AssetNotAllowlisted',
 * 'DuplicateCall', 'TvlCapReached') from a viem write/estimate error.
 * Returns null when the error is not a contract revert with a known name.
 */
export function extractRevertErrorName(err: unknown): string | null {
  if (!(err instanceof BaseError)) return null;
  const revertError = err.walk(
    (e) => e instanceof ContractFunctionRevertedError,
  );
  if (revertError instanceof ContractFunctionRevertedError) {
    return revertError.data?.errorName ?? null;
  }
  return null;
}

/**
 * True when the error chain contains a viem UserRejectedRequestError —
 * i.e. the user dismissed/rejected the signature request in their wallet.
 */
export function isUserRejection(err: unknown): boolean {
  if (!(err instanceof BaseError)) return false;
  return (
    err.walk((e) => e instanceof UserRejectedRequestError) instanceof
    UserRejectedRequestError
  );
}
