// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: @pythnetwork/pyth-sdk-solidity@4.3.1 / IPyth.sol
// Spec: CALL_IT_SPEC1.md ss13.1 -- Pyth pull-oracle interface
// Requirement: SETTLE-07, SETTLE-08
//
// Minimal IPyth interface for SettlementManager.
// Full SDK: @pythnetwork/pyth-sdk-solidity@4.3.1
// Pyth contract on Arbitrum One:  0xff1a0f4744e8582DF1aE09D5611b887B6a12925C
// Pyth contract on Arbitrum Sepolia: 0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DAF

/// @title IPyth
/// @notice Minimal Pyth pull-oracle interface for SettlementManager.
interface IPyth {
    struct Price {
        int64   price;        // price in $expo form; expo is -8 for most feeds
        uint64  conf;         // confidence interval, same units as price
        int32   expo;         // exponent; price_usd = price * 10^expo
        uint256 publishTime;  // unix timestamp of price publication
    }

    /// @notice Get the fee required to update the given price feeds.
    function getUpdateFee(bytes[] calldata updateData) external view returns (uint256 feeAmount);

    /// @notice Update the on-chain price feeds with the given VAA update data.
    ///         Requires msg.value >= feeAmount returned by getUpdateFee().
    function updatePriceFeeds(bytes[] calldata updateData) external payable;

    /// @notice Get the price of a price feed no older than `age` seconds.
    ///         Reverts if the price is older than `age` seconds.
    function getPriceNoOlderThan(bytes32 id, uint256 age) external view returns (Price memory price);

    /// @notice Get the price of a price feed without freshness check.
    function getPriceUnsafe(bytes32 id) external view returns (Price memory price);
}
