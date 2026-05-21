// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;

// PragmaProbe — exists only so `forge build` has at least one contract to compile,
// thereby exercising the solc_version = "0.8.30" pin in foundry.toml.
//
// Without this file, `forge build` would succeed even if foundry.toml had an incorrect
// solc_version (nothing to compile → nothing to check). The CI grep guard for pragma
// pins catches floating `^0.8.x` in source, but this probe ensures the build step
// actually invokes the Solidity compiler and can reject wrong versions.
//
// See Pattern 1 in .planning/phases/00-foundation/00-RESEARCH.md

/// @dev Empty sentinel contract. Has no business logic. Do not inherit from this.
contract PragmaProbe {
// Intentionally empty — this contract's sole purpose is to trigger compilation
// with the pinned solc version so the pragma pin is exercised at build time.
}
