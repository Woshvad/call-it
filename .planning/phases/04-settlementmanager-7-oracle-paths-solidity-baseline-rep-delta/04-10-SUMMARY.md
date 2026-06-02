---
phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
plan: "10"
subsystem: contracts
tags: [solidity, eip712, ecdsa, settlement, oracle, attestation, security]

requires:
  - phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
    provides: SettlementManager.sol with attestation state stubs; ISettlementManager with InvalidAttestation error

provides:
  - EIP-712 relayer-attestation rail on SettlementManager (submitAttestation + setAttestationSigner)
  - Per-oracle-type KMS signer registry (SAFETY-57 / T-04-04-01 blast-radius limit)
  - _dispatchOracle bug fix: unattested non-Pyth calls now defer (Pending) instead of mis-settling as CallerLost
  - Full Foundry test suite: 12 tests covering happy path, spoof, replay, cross-type, pending, callId-mismatch, defer

affects:
  - relayer (must call submitAttestation before settle() for all 6 non-Pyth oracle paths)
  - 04-SECURITY.md gap closure (submitAttestation was listed as built but never implemented)
  - SettlementManagerForkTest (fork tests validate the full on-chain path)

tech-stack:
  added:
    - "@openzeppelin/contracts/utils/cryptography/EIP712.sol (already in OZ 5.6.1 dep)"
    - "@openzeppelin/contracts/utils/cryptography/ECDSA.sol (already in OZ 5.6.1 dep)"
  patterns:
    - "EIP-712 domain: name='CallIt-Oracle', version='1', block.chainid, address(this) — no hardcoded chainId"
    - "Per-oracle-type KMS key separation via attestationSigner[oracleType] mapping"
    - "Checks-Effects-Interactions maintained: all validation before any state writes"
    - "Stack-too-deep avoidance: decode + validate split into _checkAdapterBinding + _checkAttestationSignature helpers"
    - "Regression guard test pattern: testUnattestedNonPythDefers verifies the exact mis-settle bug is fixed"

key-files:
  created:
    - packages/contracts/test/SettlementAttestationTest.sol
  modified:
    - packages/contracts/src/SettlementManager.sol
    - packages/contracts/src/interfaces/ISettlementManager.sol

key-decisions:
  - "EIP712 added to inheritance chain (not a separate library call) so _hashTypedDataV4 is available directly — cleaner than manual domain separator computation"
  - "submitAttestation split into main function + _checkAdapterBinding + _checkAttestationSignature to avoid Solidity stack-too-deep (5 decoded vars + ICallRegistry.Call + OracleAdapter + signer + structHash exceeded stack limit)"
  - "attestationSigner mapping is public for relayer ABI introspection and off-chain tooling; no getter needed"
  - "ISettlementManager LOCKED banner treated as additive-only constraint — new events + function sigs appended without modifying existing declarations (downstream plans unaffected)"
  - "timestamp field in OracleAttestation struct is authenticated purely by the ECDSA signature — no replay window enforced on-chain (anti-replay is the relayer's responsibility via nonce; adding an on-chain staleness check would break the defer pattern where the same attestation is re-used after a retry)"

requirements-completed: []

duration: 7min
completed: 2026-06-02
---

# Phase 4 Plan 10: SettlementManager Relayer-Attestation Rail (Gap Closure) Summary

**EIP-712 signed-outcome attestation rail for all 6 non-Pyth oracle paths, fixing the mis-settle-as-CallerLost security blocker from 04-SECURITY.md**

## Performance

- **Duration:** 7 min
- **Started:** 2026-06-02T01:15:28Z
- **Completed:** 2026-06-02T01:22:19Z
- **Tasks:** 1 (atomic implementation)
- **Files modified:** 3

## Accomplishments

- Wired EIP712 + ECDSA into SettlementManager inheritance chain with domain "CallIt-Oracle" / "1" / block.chainid / address(this)
- Implemented `submitAttestation(uint256 callId, bytes attestationData, bytes signature)` with full security validation: callId binding, outcome guard (no Pending), oracleType range guard (no Pyth), adapter-binding check, ECDSA recovery against per-type KMS signer
- Implemented `setAttestationSigner(uint8 oracleType, address signer)` with onlyOwner + range check + AttestationSignerSet event
- Fixed the `_dispatchOracle` mis-settle bug: unattested non-Pyth calls now return `(Pending, 0)` + emit `SettlementDelayed("attestation-pending")` instead of defaulting to `(CallerLost, 0)`
- Wired `_attestedPriceDelta` through to `CallSettled` priceDelta (was hardcoded 0 for all non-Pyth paths)
- Updated `ISettlementManager` additively: two new events + two new function declarations (LOCKED banner respected — no existing declarations modified)
- 12 Foundry tests pass including the regression guard for the bug fix (`testUnattestedNonPythDefers`)
- All 173 non-fork tests pass

## Task Commits

1. **Gap closure: EIP-712 attestation rail + bug fix + tests** - `661130b` (feat)
2. **Plan metadata** - (this commit)

## Files Created/Modified

- `packages/contracts/src/SettlementManager.sol` - EIP712 import/inheritance, ORACLE_ATTESTATION_TYPEHASH, _attestedPriceDelta, attestationSigner mapping, submitAttestation(), setAttestationSigner(), fixed _dispatchOracle, helper functions _checkAdapterBinding and _checkAttestationSignature
- `packages/contracts/src/interfaces/ISettlementManager.sol` - AttestationSubmitted event, AttestationSignerSet event, submitAttestation() decl, setAttestationSigner() decl (all additive)
- `packages/contracts/test/SettlementAttestationTest.sol` - 12 Foundry tests: happy path CallerWon, happy path CallerLost, wrong signer, wrong domain replay, cross-type, pending outcome, callId mismatch, unattested-defer (regression guard), owner guard, invalid type, event emission, Pyth-type gate

## Decisions Made

- EIP-712 inheritance preferred over manual domain separator — `_hashTypedDataV4` is cleaner and block.chainid is automatically included, preventing cross-chain replay without hardcoding
- Stack-too-deep avoidance: `submitAttestation` splits validation into `_checkAdapterBinding` (reads ICallRegistry.Call + adapterMap) and `_checkAttestationSignature` (ECDSA + structHash); the 5-field payload decode + call fetch + OracleAdapter + signer + structHash exceeded Solidity's stack limit when inline
- `attestationSigner` is `public` for off-chain tooling introspection — relayer startup checks can read it directly
- No on-chain timestamp staleness check: the ECDSA signature authenticates the timestamp; adding a staleness window would break the retry pattern where the relayer submits the same attestation after an earlier defer

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stack-too-deep in submitAttestation**
- **Found during:** First compile attempt
- **Issue:** `submitAttestation` with 5 decoded locals + ICallRegistry.Call + OracleAdapter + signer + structHash exceeded Solidity's stack slot limit in the non-IR pipeline (via_ir=false is mandated by foundry.toml per 0.8.30 safety policy)
- **Fix:** Extracted `_checkAdapterBinding(callId, oracleType)` and `_checkAttestationSignature(callId, oracleType, outcome, priceDelta, timestamp, signature)` as separate `internal view` functions, reducing the main function's stack frame to 5 locals
- **Files modified:** packages/contracts/src/SettlementManager.sol
- **Verification:** `forge build` succeeds; all tests pass
- **Committed in:** 661130b

---

**Total deviations:** 1 auto-fixed (1 Rule 1 compiler bug)
**Impact on plan:** Purely mechanical refactor. Security properties, function signatures, and test coverage are identical to the spec. No scope change.

## Issues Encountered

None beyond the stack-too-deep deviation above, which was resolved immediately.

## Known Stubs

None — all attestation paths are fully wired.

## Threat Flags

No new network endpoints, auth paths, or schema changes introduced beyond what was specified in the gap-closure design. The `submitAttestation` function is permissionless (anyone can submit a valid signed attestation), which is intentional — the ECDSA check enforces authenticity; permissioning the caller would not add security and would complicate the relayer retry pattern.

## Self-Check

- [x] `packages/contracts/src/SettlementManager.sol` exists and compiles
- [x] `packages/contracts/src/interfaces/ISettlementManager.sol` exists and has new events/functions
- [x] `packages/contracts/test/SettlementAttestationTest.sol` exists with 12 tests
- [x] `forge build` succeeds (no errors, only pre-existing lint warnings)
- [x] `forge test --match-contract SettlementAttestationTest`: 12/12 PASS
- [x] `forge test --no-match-contract ForkTest`: 173/173 PASS, 0 failed

## Self-Check: PASSED

## Next Phase Readiness

- The on-chain attestation rail is complete. The relayer (wave 2) must be updated to call `submitAttestation` before `settle()` for each of the 6 non-Pyth oracle paths (NftTwap, DefiLlama, RpcMetrics, Snapshot, Tally, CexScraper)
- Owner must call `setAttestationSigner(oracleType, kmsAddress)` for each oracle type before mainnet deploy
- The Sepolia staging gate (48h run per CLAUDE.md) should include attestation-path end-to-end tests using at least one non-Pyth oracle type

---
*Phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta*
*Completed: 2026-06-02*
