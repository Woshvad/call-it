// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin -- never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Recommended Stack -- Pinned Versions"

import { TransparentUpgradeableProxy } from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

/// @title StatelessTransparentProxy
/// @notice A TransparentUpgradeableProxy variant that permits deployment with EMPTY
///         initializer data. The StylusScoreEngine implementation is provably
///         stateless (no storage fields, no initialize()), so there is nothing to
///         initialize at construction time.
///
/// @dev    OpenZeppelin 5.6.0+ added a guard to ERC1967Proxy: the constructor reverts
///         with ERC1967ProxyUninitialized() when `_data` is empty, UNLESS
///         `_unsafeAllowUninitialized()` is overridden to return true. That override is
///         the OZ-documented escape hatch for deliberately-stateless implementations,
///         which is exactly this engine. The standard man-in-the-middle concern that
///         motivates the guard does not apply: the implementation has no constructor
///         logic to front-run and holds no storage.
///
///         OZ 5.x note: TransparentUpgradeableProxy AUTO-CREATES its own ProxyAdmin
///         (owned by `initialOwner`) inside the constructor. The admin address is found
///         in the ERC-1967 admin slot of the deployed proxy; do NOT pass a pre-deployed
///         ProxyAdmin here (that was the OZ 4.x pattern).
///
///         Requirement: REP-19, REP-21, REP-24, OPS-16 (48h-cutoff proxy upgrade target).
contract StatelessTransparentProxy is TransparentUpgradeableProxy {
    /// @param logic_        the (Stylus WASM) implementation address
    /// @param initialOwner_ owner of the auto-created ProxyAdmin (deployer in Phase 5;
    ///                      promoted to multisig in Phase 6 per SAFETY-20)
    constructor(address logic_, address initialOwner_)
        TransparentUpgradeableProxy(logic_, initialOwner_, "")
    {}

    /// @dev Permit empty-init-data construction for the stateless engine.
    ///      Called by the ERC1967Proxy base constructor; Solidity dispatches virtual
    ///      calls to this most-derived override even during base construction.
    function _unsafeAllowUninitialized() internal pure override returns (bool) {
        return true;
    }
}
