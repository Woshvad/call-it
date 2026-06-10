# Deferred items — quick-260610-vab

Out-of-scope discoveries logged during execution (NOT fixed here per scope boundary).

## 1. grep-guards.yml is silently broken — `rg: command not found`

Discovered 2026-06-10 while triaging the phase-1-gates dispatch run. The separate
`Grep Guards` workflow (`.github/workflows/grep-guards.yml`) shows green on every
run, but its log reveals every `rg`-based check actually fails to execute:

```
/home/runner/work/_temp/....sh: line 2: rg: command not found
PASS: No USDC.e address in Solidity files.
```

The `if rg ...; then fail` pattern treats "rg missing" (exit 127) the same as
"no match found" — so all three USDC.e checks and the 2-address allowlist check
in that workflow are no-ops. ripgrep is NOT preinstalled on current
`ubuntu-latest` runners (or not on PATH for the default shell).

Evidence: run 27308922117 (branch ci/quick-260610-vab-playwright-gate), job
"Guard — USDC.e bridged address must not appear outside fixture file".

**Fix needed (future task):** install ripgrep (`sudo apt-get install -y ripgrep`)
as a first step, or port the checks to plain `grep` like phase-1-gates does,
AND make the shell fail loudly on missing binaries (`command -v rg || exit 1`).
Note: when fixing, the rg allowlists will also need the same negative-test
fixture exclusions that quick-260610-vab added to phase-1-gates
(packages/shared/test/usdc.test.ts, packages/contracts/src/constants/USDC.sol,
packages/contracts/test/USDC.t.sol) — those files legitimately reference the
bridged address and WILL trip a working rg check.
