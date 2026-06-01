---
adr: 0001
title: Sepolia staging-USDC strategy (unblock the 48h staging gate)
status: proposed (decision recorded; contract changes deferred to Phase 6 + security review)
date: 2026-06-01
owner: TBD (Phase 6 — mainnet promotion gate)
affects: [packages/contracts/src/constants/USDC.sol, all contract constructors, packages/shared/src/constants/addresses.ts, deploy scripts, CI grep guard, staging/seeding plan]
supersedes: none
---

# ADR 0001 — Sepolia staging-USDC strategy

## Context

The project hardcodes USDC to the Arbitrum **One** (mainnet) native address
`0xaf88d065e77c8cC2239327C5EDb3A432268e5831` in `packages/contracts/src/constants/USDC.sol`,
used in every transfer path and enforced by a CI grep guard (D-04 / SAFETY-13 — "single
USDC source of truth, unfakeable receipts"). This is a **LOCKED safety invariant**.

**Problem (verified 2026-06-01):** that address has **no contract code on Arbitrum Sepolia**
(`cast code 0xaf88d065… --rpc-url <sepolia>` → `0x`). Contracts deploy fine on Sepolia
(constructors only assert the address *equals the constant*, not that code exists), but every
`safeTransferFrom`/`safeTransfer` stake path **reverts** on Sepolia. Therefore CallRegistry
create-with-fee, FollowFadeMarket follow/fade, and ChallengeEscrow propose/accept/settle
**cannot be exercised end-to-end on the live testnet**.

This blocks the spec's mandated **"≥48h Arbitrum Sepolia staging gate with seeded
calls/follows/settles/exits/challenges/disputes before mainnet deploy"** (CLAUDE.md). As
configured, that gate is **unsatisfiable** for any money path.

This was surfaced during Phase 3 verify-work (after ChallengeEscrow was deployed to Sepolia
at `0x59eb7C8000f0bC4C0e32d2060f304d9b5655bec2`). It is **not Phase 3-specific** — it affects
all money contracts (Phase 1/2/3) and the project-wide staging plan.

## Verified facts

| Fact | Evidence |
|---|---|
| Mandated USDC `0xaf88d065…e5831` has NO code on Arbitrum Sepolia | `cast code` → `0x` |
| Circle ships an **official** Arbitrum Sepolia USDC at `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` | `cast code` → 3599-char bytecode; `symbol()`="USDC"; `decimals()`=6 |
| Sepolia contracts already deployed with the dead mainnet USDC baked in (immutable) | Phase 2 CR/FFM/PR + Phase 3 ChallengeEscrow constructors set USDC = constant |

The Circle Sepolia USDC is **6-decimals (matches mainnet)** and **faucetable** (Circle faucet),
so it gives high parity with mainnet USDC behavior.

## Options

### (a) Custom mock ERC-20 on Sepolia + chain-scoped override — REJECTED
Deploy a mintable 6-dp mock; point contracts at it on Sepolia. **Rejected**: strictly
dominated by (b) — Circle's official Sepolia USDC already exists (faucetable, real Circle
token, nothing to deploy/maintain, better parity). A bespoke mock adds a maintained artifact
and worse fidelity for zero benefit.

### (b) Use Circle's official Arbitrum Sepolia USDC + chain-scoped resolution
Point the contracts at `0x75faf114…AA4d` on Sepolia (and canonical native USDC on mainnet),
via a **deploy-time, chainid-asserted** USDC selection. Requires a contract change + a full
Sepolia redeploy of all 4 money contracts + a CI-guard update + a security review.

**Tradeoffs**
- ➕ True **live public Sepolia** money flows (external testers can fund via Circle faucet); satisfies the literal "live Sepolia gate"; real Circle token = good parity.
- ➖ Touches the LOCKED USDC invariant — must be designed so mainnet remains unfakeable (chainid-gated; see "Safe design" below).
- ➖ Requires redeploying Phase 1/2/3 contracts on Sepolia (invalidates current Sepolia addresses incl. ChallengeEscrow `0x59eb7C80…`) + re-wiring addresses.ts/subgraph.yaml/relayer.
- ➖ CI grep guard must move from "exactly one address" to "an allowlist of {mainnet canonical, Circle Sepolia}" without permitting arbitrary addresses.

### (c) Fork-test the money-path gate against a mainnet fork — RECOMMENDED (primary)
Run the end-to-end money-path validation against an **Arbitrum One mainnet fork**
(`anvil --fork-url $ARBITRUM_ONE_RPC` / Foundry `--fork-url`), where real USDC, Pyth, and all
infra exist. Seed the full flow (create → follow/fade → propose/accept duel → settle → exit →
dispute) using fork cheats (`deal`/impersonate) to fund test wallets with real USDC.

**Tradeoffs**
- ➕ **Zero contract changes**; does NOT touch the locked USDC invariant or require a redeploy.
- ➕ **Highest money-path fidelity** — real mainnet USDC + real Pyth feeds + the exact bytecode that ships to mainnet.
- ➕ Fast to stand up; runs in CI; deterministic + repeatable.
- ➖ Not a *persistent public* testnet — external humans can't poke it for 48h. It's a CI/local fork.
- ➖ Reinterprets "Sepolia staging gate" as "mainnet-fork staging gate" for the money paths (a documentation/spec deviation to ratify).

## Decision (recommended)

**Hybrid, invariant-preserving:**

1. **Money-path gate → option (c), mainnet-fork.** Validate all money flows
   (calls/follows/settles/exits/challenges/disputes) against an Arbitrum One fork with real
   USDC + Pyth. This is the substance of the 48h gate and needs **no contract changes**.
2. **Keep the live Sepolia deployment for the NON-money integration surface** — frontend
   wiring, subgraph indexing, relayer endpoints/workers, OG cards, auth, notifications. These
   already work on Sepolia today (contract *reads* + all off-chain infra); only USDC
   *transfers* revert, which the fork gate covers.
3. **Option (b) is the opt-in upgrade** *iff* live public Sepolia money flows are required
   (public demo / external testers). Implement in **Phase 6** behind a **security review**,
   using the chainid-gated design below. **Do NOT** weaken the mainnet guard.
4. **Reject (a)** entirely.

Rationale: the hardcoded-mainnet-USDC invariant is core to the product's "unfakeable receipt"
guarantee. (c) achieves full money-path validation **without touching it**. (b) is only worth
its blast radius (locked-invariant change + 4-contract redeploy + guard change + audit) if a
*persistent public* Sepolia money environment is a hard requirement — which the gate's intent
(catch integration bugs pre-mainnet) does not strictly need.

## Safe design for (b) — if/when adopted in Phase 6

Keep mainnet unfakeable; allow Circle's token only on Sepolia, asserted at deploy time:

- `USDC.sol`: add `USDC_ARB_SEPOLIA = 0x75faf114…AA4d` alongside the canonical
  `USDC_ARB_NATIVE`. Provide `resolveUsdc()` that returns the canonical address on
  `block.chainid == 42161` and the Sepolia address on `421614`, reverting on any other chain.
- Each money contract's constructor: instead of `require(_usdc == USDC_ARB_NATIVE)`, use
  `require(_usdc == resolveUsdc())` — so on **mainnet only the canonical address passes**, on
  Sepolia only Circle's USDC passes, nothing else anywhere.
- **CI grep guard:** change from "exactly the one mainnet literal" to "the two allowlisted
  literals only" (mainnet canonical + Circle Sepolia) — still forbids arbitrary addresses;
  the unfakeable-mainnet property is preserved (mainnet chainid gate).
- `addresses.ts`: add `USDC_ARB_SEPOLIA` constant (documented as Circle testnet USDC).
- Deploy scripts: pass the Sepolia USDC on Sepolia broadcasts; redeploy CR/FFM/PR/ChallengeEscrow;
  re-wire addresses.ts + subgraph.yaml startBlocks + relayer env.
- Security review checklist: confirm no code path lets a non-canonical USDC reach mainnet;
  confirm decimals parity (both 6); confirm the chainid gate cannot be bypassed.

## Implementation status (this task)

**Recorded, not yet implemented.** No contracts were changed and nothing was redeployed —
that is intentional. Options (b) and (c) both belong to Phase 6 / staging planning, and (b)
mutates a LOCKED invariant + requires a redeploy + security review, which must not happen
without explicit sign-off. This ADR + the verified Circle-Sepolia-USDC fact is the deliverable;
the chosen path can be executed on approval.

## Consequences / follow-ups

- Until adopted, the **48h live-Sepolia money-flow gate cannot pass** — flag in Phase 6 entry criteria.
- If (c): add a Foundry mainnet-fork seeding suite (create/follow/fade/duel/settle/exit/dispute) and document the gate as fork-satisfied for money paths + live-Sepolia for integration.
- If (b): schedule the contract change + Sepolia redeploy + CI-guard update + security review; note it invalidates the current Sepolia addresses (incl. ChallengeEscrow `0x59eb7C80…`).
- Either way: update CLAUDE.md's "Sepolia staging gate" constraint to reflect the ratified approach.
