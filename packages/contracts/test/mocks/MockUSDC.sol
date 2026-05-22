// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack -- Pinned Versions"
// Spec: CALL_IT_SPEC1.md §10.5 -- USDC mandate (test mock only)
// Requirement: SAFETY-14 (reentrancy test mock), CALL-35/36 (USDC allowance/balance tests)

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { CallRegistry } from "../../src/CallRegistry.sol";
import { ICallRegistry } from "../../src/interfaces/ICallRegistry.sol";

/// @title MockUSDC
/// @notice Simple ERC-20 mock with 6 decimals for testing.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) { return 6; }

    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

/// @title MaliciousReentrantUSDC
/// @notice ERC-20 mock whose transferFrom re-enters CallRegistry.createCall.
///         Used in SAFETY-14 test to assert ReentrancyGuard prevents re-entrance.
///
///         DESIGN NOTE: All re-entrant call parameters are stored as state variables
///         set via setTarget(). When vm.etch is used to deploy at USDC_ADDR, we must
///         also copy the relevant storage via vm.store. The SAFER approach is to use
///         this contract via copyStorage or to deploy directly with create2 at USDC_ADDR.
///         In practice, the test uses vm.etch + then directly sets state via storage writes.
contract MaliciousReentrantUSDC is ERC20 {
    address public target;

    // Re-entrant call params stored in contract storage (not constructor -- avoids etch issue)
    uint256 public reentrantAssetA;
    uint64  public reentrantExpiry;
    uint96  public reentrantStake;

    bool public triggered = false;

    constructor() ERC20("Malicious USDC", "mUSDC") {}

    function decimals() public pure override returns (uint8) { return 6; }

    function mint(address to, uint256 amount) external { _mint(to, amount); }

    function setTarget(
        address _target,
        uint256 assetA,
        uint64 expiry,
        uint96 stake
    ) external {
        target = _target;
        reentrantAssetA = assetA;
        reentrantExpiry = expiry;
        reentrantStake = stake;
    }

    /// @notice Override transferFrom to attempt re-entry into CallRegistry.createCall.
    ///         On first call: attempts re-entrance (should revert with ReentrancyGuardReentrantCall).
    ///         On subsequent calls: normal ERC20 behavior.
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public override returns (bool) {
        if (!triggered && target != address(0)) {
            triggered = true;
            // Attempt re-entrance -- blocked by ReentrancyGuard
            CallRegistry(target).createCall(
                ICallRegistry.MarketType.PriceTarget,
                ICallRegistry.EventSubtype.None,
                ICallRegistry.Category.Majors,
                reentrantAssetA, 0, 3000e6,
                reentrantExpiry,
                reentrantStake, 50, bytes32(0), true, 0
            );
        }
        return super.transferFrom(from, to, amount);
    }
}

/// @title CEICheckUSDC
/// @notice ERC-20 mock that asserts CallRegistry has written state BEFORE the token transfer.
///         During transferFrom, reads CallRegistry.currentTvl.
///         If CEI is correct, currentTvl should be > 0 (effects were written before interaction).
contract CEICheckUSDC is ERC20 {
    address public registry;
    uint256 public tvlAtTransfer;

    constructor() ERC20("CEI Check USDC", "cUSDC") {}

    function decimals() public pure override returns (uint8) { return 6; }

    function mint(address to, uint256 amount) external { _mint(to, amount); }

    function setRegistry(address _registry) external { registry = _registry; }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public override returns (bool) {
        if (registry != address(0)) {
            (bool ok, bytes memory data) = registry.staticcall(
                abi.encodeWithSignature("currentTvl()")
            );
            if (ok && data.length >= 32) {
                tvlAtTransfer = abi.decode(data, (uint256));
            }
        }
        return super.transferFrom(from, to, amount);
    }
}
