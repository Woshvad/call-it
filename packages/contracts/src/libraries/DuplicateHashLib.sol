// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Pinned Addresses (Arbitrum One Mainnet)" — compiler version mandate
// Spec: CALL_IT_SPEC1.md §12.1 — DuplicateHashLib helper for Gate 6.2
// Requirement: CALL-22/23/24 — duplicate call detection with UTC-day boundary
//
// PITFALL-12 WARNING: UTC-day bucket floors must use (ts / 86400) * 86400
// to avoid same-day calls being treated as different days at midnight.
// See .planning/phases/01-core-contracts-auth-frontend-skeleton/01-RESEARCH.md Pitfall 12
//
// PLAN 03 TS MIRROR COUPLING:
// The pure functions in this library MUST produce bit-identical output to
// packages/shared/src/hashing/duplicate-hash.ts (Plan 03).
// The gate-matrix.json parity fixture locks this contract.
// Any change to the encoding scheme here MUST be mirrored in the TS implementation.

/// @title DuplicateHashLib
/// @notice Pure helper functions for Gate 6.2 (duplicate call detection).
///         `dayBucketUtc` floors a UNIX timestamp to the start of its UTC day.
///         `compute` produces the bytes32 key used in `activeDuplicateHashes`.
///
///         The TS counterpart in packages/shared/src/hashing/duplicate-hash.ts must
///         produce identical output for any given input (validated by Plan 03 parity test).
///
/// @dev Encoding: abi.encode(marketType, assetA, metric, targetValue, deadlineDay)
///      where deadlineDay = dayBucketUtc(expiry).
///      We use abi.encode (padded) not abi.encodePacked to avoid hash collisions.
library DuplicateHashLib {
    /// @notice Floor a UNIX timestamp to the start of its UTC day (midnight UTC).
    /// @param ts UNIX timestamp in seconds
    /// @return The timestamp floored to UTC midnight of the same day
    /// @dev Example: ts=86399 → 0, ts=86400 → 86400, ts=172799 → 86400
    ///      This is the CALL-22/23/24 UTC-day boundary boundary guard.
    function dayBucketUtc(uint64 ts) internal pure returns (uint64) {
        return uint64((ts / 86400) * 86400);
    }

    /// @notice Compute the duplicate-hash key for a call.
    /// @param marketType  Encoded MarketType enum value (0=PriceTarget, 1=SpreadVs, 2=Event)
    /// @param assetA      Primary asset identifier (Pyth feed key or NFT collection address)
    /// @param metric      Metric identifier — for Price Target this is 0; for Event this is
    ///                    the EventSubtype cast to uint256
    /// @param targetValue The call's target value (price target or 0 for events)
    /// @param deadlineDay The UTC-day-floored expiry timestamp (output of dayBucketUtc)
    /// @return dupHash    bytes32 key for activeDuplicateHashes mapping
    ///
    /// @dev TS mirror: viem keccak256(encodeAbiParameters(
    ///        [uint8, uint256, uint256, uint256, uint64],
    ///        [marketType, assetA, metric, targetValue, deadlineDay]
    ///      ))
    function compute(
        uint8 marketType,
        uint256 assetA,
        uint256 metric,
        uint256 targetValue,
        uint64 deadlineDay
    ) internal pure returns (bytes32 dupHash) {
        dupHash = keccak256(abi.encode(marketType, assetA, metric, targetValue, deadlineDay));
    }
}
