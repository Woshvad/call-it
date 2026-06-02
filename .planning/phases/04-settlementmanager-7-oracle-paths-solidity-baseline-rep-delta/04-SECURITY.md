---
phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
slug: settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
status: draft
threats_open: 3
asvs_level: 1
created: 2026-06-02
---

# Phase 4 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Mode: VERIFY-MITIGATIONS. Register built from the 9 PLAN `<threat_model>` STRIDE tables
> + SUMMARY `## Threat Surface Scan` sections. Each declared mitigation verified in source
> (file:line) or by passing Forge/Vitest test. Implementation files are READ-ONLY.

**Config:** asvs_level L1 · block_on: high · register_authored_at_plan_time = TRUE
**Deploy target:** Arbitrum Sepolia (live) — SettlementManager `0xAc37a0e4A3e575EF21684c28a5b820dB44654595`, FFM v2 `0x185e43526c0acd88AC236197e3Ee7629ebd601CA`

---

## Verdict

**OPEN_THREATS — 3 BLOCKERS.** 47 of 50 declared mitigations verified present in code (CLOSED).
3 threats OPEN: the on-chain relayer-attestation verification rail (`submitAttestation` +
`ECDSA.recover` + per-type expected-signer registry) declared in PLAN 04-02 / 04-04 **does not
exist** in `SettlementManager.sol`. This breaks the spoofing/replay mitigations for all 6
non-Pyth oracle paths (NFT-TWAP, DefiLlama, RpcMetrics, Snapshot, Tally, CEX). The Pyth demo
spine is fully implemented and verified on-chain and is NOT affected.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| External → `settle()` | Permissionless; any caller. Idempotency guard is primary defense | callId, Pyth VAA bytes, acceptedChallengeIds |
| Relayer → `submitAttestation()` | **DECLARED** KMS-signed EIP-712, ecrecover per-type signer | attestation bytes + signature — **boundary NOT enforced on-chain (see OPEN T-04-02-03)** |
| FFM USDC → SettlementManager | `applySettlement` gated by `onlySettlementManager` | fee amounts (protocol/creator/LP) |
| USDC → `claimPayout` winners | Pull-pattern; CEI enforced; nonReentrant | pro-rata payout |
| Caller-supplied `acceptedChallengeIds` → `settle()` | On-chain `ce.getChallenge()` validation: callId match + Accepted status | challenge IDs (untrusted input) |
| Subgraph → relayer `acceptedChallengeIds` | Subgraph indexes accepted-challenge events; contract is authority | challenge IDs |
| User → `raiseDispute()` | $5 USDC bond required; permissionless | callId, IPFS evidenceHash, bond |
| Owner wallet → `resolveDispute()` | Client `isOwner` gate + on-chain `onlyOwner` | finalOutcome |
| Connected wallet → per-viewer outcome word | Client-side address compare; D-09 auth guard | wallet address (never rendered) |
| External APIs (Hermes/DefiLlama/Alchemy/Snapshot/Tally/CEX) → relayer | Public/unauth endpoints; off-chain KMS-signed | numeric metrics, governance state, HTML |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-04-01-01 | Tampering | SettlementManagerTest invariantFeeSplit | mitigate | `invariantFeeSplit` asserts fees==1.7%±2 wei — `SettlementManagerTest.sol:365`; suite GREEN | closed |
| T-04-01-02 | Tampering | FfmSettlementTest testClaimPayoutCEI | mitigate | `claimed=true` (FFM `:609`) BEFORE `safeTransfer` (`:616`); FfmSettlementTest 4/4 GREEN | closed |
| T-04-01-03 | Repudiation | SettlementDisputeTest testDisputeReversal | mitigate | `resolveDispute` USDC redistribution `SettlementManager.sol:464-505`; SettlementDisputeTest 5/5 GREEN | closed |
| T-04-01-04 | Tampering | defillama-adapter chainId binding | mitigate | EIP-712 domain `chainId:42161n` `defillama-adapter.ts:272,377`; verifyingContract bound `:378` | closed |
| T-04-01-05 | Tampering | cex-binance Innovation Zone | mitigate | Per-exchange `EXCLUSION_PATTERNS` in scrapers; cex-binance test GREEN; fixture present | closed |
| T-04-01-06 | Tampering | testDuelInvalidChallengeId | mitigate | `_settleDuels` reverts on callId mismatch/non-Accepted `SettlementManager.sol:302-303`; testDuelInvalidChallengeId GREEN | closed |
| T-04-02-01 | Tampering | settle() double-invocation | mitigate | Step 1 idempotency: status!=Live/CallerExited→revert AlreadySettled `SettlementManager.sol:194-197`; testSettleIdempotency GREEN | closed |
| T-04-02-02 | Tampering | claimPayout reentrancy | mitigate | `nonReentrant` (FFM `:568`) + CEI claimed→transfer (`:609`<`:616`); testClaimPayoutCEI GREEN | closed |
| **T-04-02-03** | **Spoofing** | **Fake relayer attestation** | **mitigate** | **DECLARED: submitAttestation + ECDSA.recover + per-type expected-signer registry + EIP-712 verify. ABSENT — no submitAttestation fn, no ECDSA import, no signer registry, `_attestationReady` never written in `SettlementManager.sol`. See OPEN.** | **OPEN** |
| T-04-02-04 | Repudiation | forceSettle silent use | mitigate | `FORCE_SETTLE_COOLDOWN=7 days` `:67`; cooldown check `:371`; dual-event emit `:397-398`; testForceSettleCooldown+Events GREEN | closed |
| T-04-02-05 | Tampering | Empty-pool virtual seed payout | mitigate | CALL-41: `fadeReal==0`→entire followReserve to treasury `FollowFadeMarket.sol:529-540`; testEmptyPoolToTreasury GREEN | closed |
| T-04-02-06 | Elevation | delegatecall to user-controlled addr | mitigate | Non-upgradeable; grep `delegatecall` over `packages/contracts/src/` = 0 matches; SAFETY-57 note `SettlementManager.sol:17-19` | closed |
| T-04-02-07 | Tampering | Sybil fade CONTRARIAN HIT manufacture | mitigate | Cold-start 25% scaling `SettlementManager.sol:277-279`; fader must commit real USDC; testColdStartScale GREEN | closed |
| T-04-02-08 | Tampering | Fee extraction rounding underflow | mitigate | FFM uses `Math.mulDiv` in payout/share paths; fee bps via `*/10_000`; invariantFeeSplit (±2 wei) + invariantPoolConservation GREEN | closed |
| T-04-02-09 | Tampering | Fake challengeId injected in duel array | mitigate | `ce.getChallenge()`: `ch.callId!=callId`→revert, `ch.status!=Accepted`→revert `SettlementManager.sol:298-303`; testDuelInvalidChallengeId GREEN | closed |
| T-04-03-01 | Tampering | Wrong SettlementManager address wired | mitigate | Post-deploy assertions in `DeployPhase4.s.sol`; Sepolia addrs populated non-zero `addresses.ts:117,189` | closed |
| T-04-03-02 | DoS | SettlementManager ETH balance low | mitigate | 0.1 ETH funded at deploy; `receive() payable` `SettlementManager.sol:177`; OPS-15 top-up runbook | closed |
| T-04-03-03 | Repudiation | forceSettle without public commitment | mitigate | OPS-15 mandates 24h public commitment on /disputes/; `/disputes/page.tsx:388` shows deadline | closed |
| T-04-03-04 | Repudiation | Stylus reactivation missed | mitigate | OPS-16 runbook + T-30d/15d/7d/1d Telegram alerts; 48h cutoff command documented | closed |
| T-04-03-05 | Info Disclosure | subgraph.yaml missing eventHandlers | mitigate | 7-handler grep gate; `settlement-manager.ts` exports 7 handlers (lines 109/137/163/197/227/249/294) | closed |
| **T-04-04-01** | **Spoofing** | **Compromised defillama key (per-type separation)** | **mitigate** | **Off-chain key separation present (`kms-signer.ts:43-48` 5 keys). On-chain enforcement ABSENT — no ecrecover/signer registry consumes the attestation. Blast-radius control is moot without on-chain verification. See OPEN.** | **OPEN** |
| **T-04-04-02** | **Repudiation** | **Cross-chain EIP-712 replay** | **mitigate** | **Off-chain domain chainId=42161n + verifyingContract present. DECLARED "on-chain ecrecover verifies" — ABSENT in `SettlementManager.sol`. No on-chain replay/chainId enforcement exists. See OPEN.** | **OPEN** |
| T-04-04-03 | DoS | SettlementManager ETH exhausted | mitigate | `pyth-adapter.ts` getBalance check + `eth_balance_low` alert before settle; OPS-15 | closed |
| T-04-04-04 | DoS | Pyth Hermes unavailable | mitigate | 30×60s retry in `settlement-watcher.ts`; exhaustion→dispute; Telegram alert | closed |
| T-04-04-05 | Info Disclosure | KMS private key exposure | mitigate | `gcpKmsAccount` — key never leaves GCP KMS; remote `asymmetricSign` only `kms-signer.ts:101-140` | closed |
| T-04-04-06 | Tampering | Forged acceptedChallengeIds from subgraph | mitigate | On-chain `ce.getChallenge()` validation `SettlementManager.sol:298-303`; subgraph is untrusted input | closed |
| T-04-05-01 | Info Disclosure | Subgraph caches wrong outcome | mitigate | handleCallSettled + handleCallForceSettled both update Call.outcome; idempotent entity updates | closed |
| T-04-05-02 | Tampering | Subgraph Phase-0 block handler active | mitigate | No `handleBlock`/`block_handler` in `settlement-manager.ts`; 7 event handlers only | closed |
| T-04-05-03 | Repudiation | RepCalculatedFallback not indexed | mitigate | `handleRepCalculatedFallback` `settlement-manager.ts:294` creates queryable entity | closed |
| T-04-05-04 | Tampering | Dispute status set via wrong path | mitigate | `call.status='Disputed'` set ONLY at `settlement-manager.ts:152` (handleDisputeRaised); CallRegistry has no markDisputed (grep=0 in SM) | closed |
| T-04-06-01 | Tampering | CEX scraper false positive (Innovation Zone) | mitigate | Per-exchange `EXCLUSION_PATTERNS` in-file + multi-signal confirm; weekly CI `cex-synthetic-ci.yml` | closed |
| T-04-06-02 | Tampering | NFT TWAP <12 obs inflating price | mitigate | `nft-twap-adapter.ts` observationCount<12 → ambiguous backstop | closed |
| T-04-06-03 | Spoofing | Compromised 'cex' key forges listings | mitigate | Per-type key isolation; `cex` key distinct from `snapshot-tally` `kms-signer.ts:43-48` | closed |
| T-04-06-04 | DoS | Playwright Chromium unavailable | mitigate | Scraper returns ambiguous on launch failure → dispute window backstop | closed |
| T-04-06-05 | Tampering | Tally API key missing → silent miss | mitigate | `tally-adapter.ts` logs warning if TALLY_API_KEY absent; returns ambiguous | closed |
| T-04-06-06 | Spoofing | Compromised defillama key forges RpcMetrics | accept | rpc-metrics shares defillama key; distinct domain `CallIt-RpcMetrics` `rpc-metrics-adapter.ts:311` (vs CallIt-DefiLlama) prevents cross-type replay; documented in SAFETY-57 ADR. Accepted-risk AR-04-01 | closed |
| T-04-06-07 | Tampering | Forgeable AAVE_V3_POOL from call params | mitigate | `AAVE_V3_POOL_ARBITRUM_ONE` imported from `@call-it/shared`, never from call params `rpc-metrics-adapter.ts` | closed |
| T-04-07-01 | Info Disclosure | Wallet address rendered in OG card | mitigate | AUTH-44: @handle only; oracleTxHash via modal not page `call/[id]/page.tsx:1362`; no raw address render | closed |
| T-04-07-02 | Tampering | display:grid in Satori OG routes | mitigate | grep `display:grid`/`gridTemplate` over `app/{call,og,disputes}` = 0 matches | closed |
| T-04-07-03 | Tampering | CONTRARIAN HIT wrong purple color | mitigate | `outcome-word.ts` explicit `#E8F542`; `A855F7` absent (SUMMARY 07 grep) | closed |
| T-04-07-04 | Tampering | Duel OG winner-hardcoded as caller | mitigate | `callerIsWinner = winner.toLowerCase()===caller.toLowerCase()` in `og/duel/[challengeId]/route.ts` | closed |
| T-04-07-05 | Tampering | Unauthenticated viewer sees FADED CORRECTLY | mitigate | `viewerIsWinningFader` guarded `authenticated && userAddress && CallerLost && fadePosition` `call/[id]/page.tsx:1046-1055` | closed |
| T-04-08-01 | Elevation | Non-owner calls resolveDispute | mitigate | On-chain `onlyOwner` `SettlementManager.sol:464`; client `isOwner` gate `disputes/page.tsx:170-173` | closed |
| T-04-08-02 | Repudiation | Owner resolves without preview | mitigate | Reversal preview required; "Preview unavailable — cannot resolve safely" disables confirm `disputes/page.tsx:467` | closed |
| T-04-08-03 | DoS | Dispute spam | mitigate | $5 USDC bond `DISPUTE_BOND=5e6` `SettlementManager.sol:76`; MAX_COUNTER_CLAIMS=3 `:70,445` | closed |
| T-04-08-04 | Repudiation | forceSettle without 24h commitment | mitigate | "Owner will resolve by {deadline}" public `disputes/page.tsx:388`; Telegram dispute alert | closed |
| T-04-08-05 | Info Disclosure | Wallet address in dispute UI | mitigate | AUTH-44 enforced; @handle only across dispute surfaces | closed |
| T-04-09-01 | Tampering | CEX scraper selector drift | mitigate | Weekly CI cron `cex-synthetic-ci.yml` runs 8 testWithFixture; per-exchange isolation | closed |
| T-04-09-02 | Info Disclosure | follows.read OAuth scope too broad | accept | v1 limitation: follows.read NOT provisioned; `tweet.read users.read` only; documented in SAFETY-57 ADR. Accepted-risk AR-04-02 | closed |
| T-04-09-03 | Tampering | addresses.ts stale after mainnet deploy | mitigate | ARBITRUM_ONE addrs zeroed placeholders; Phase 7.5 updates; prevents accidental mainnet calls | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Open Threats (BLOCKERS)

| Threat ID | Category | Mitigation Expected | Reality in Code |
|-----------|----------|---------------------|-----------------|
| T-04-02-03 | Spoofing | `submitAttestation(callId, attestationData, signature)` performing `ECDSA.recover(_hashTypedDataV4(hash), sig) == expectedSignerForType`, with an owner-registered per-attestation-type expected-signer registry and EIP-712 domain (chainId=42161, verifyingContract) — per PLAN 04-02 Task 2 behavior block | `SettlementManager.sol` has NO `submitAttestation` function, NO `ECDSA` import, NO `_hashTypedDataV4`/EIP712 base, NO expected-signer registry. The `_attestedOutcome`/`_attestationReady` mappings (`:138-139`) are declared `private` and are NEVER written anywhere. `ISettlementManager.sol` does not declare `submitAttestation`. `error InvalidAttestation()` is declared (`:139`) but never used. |
| T-04-04-01 | Spoofing | On-chain verification that limits a compromised per-type KMS key's blast radius (the contract must actually check the signer per attestation type) | Off-chain key separation exists (`kms-signer.ts` 5 keys). On-chain there is nothing that verifies any attestation signer, so per-type isolation provides no on-chain guarantee for this phase. |
| T-04-04-02 | Repudiation | "EIP-712 domain chainId=42161n + verifyingContract; attestation from one chain rejected on another" enforced **on-chain via ecrecover** | The off-chain signer binds chainId+verifyingContract, but `SettlementManager.sol` never recovers or checks the signature, so cross-chain replay protection is not enforced on-chain. |

### Shared root cause & blast radius

All 3 OPEN threats stem from one missing component: **the on-chain relayer-attestation verification rail for the 6 non-Pyth oracle paths was never implemented.** Consequences:

1. The relayer's `submitDefiLlamaAttestation` / `submitNftFloor` call `walletClient.writeContract({ functionName: 'submitAttestation', ... })` against the SettlementManager address (`defillama-adapter.ts:432-437`, `nft-twap-adapter.ts:365-388`). Since the contract has no such function/selector, these on-chain calls would **revert**.
2. Because `_attestationReady[callId]` is never set, `_dispatchOracle` (`SettlementManager.sol:234-241`) falls through to `return (CallerLost, 0)` for **every** non-Pyth call. Non-Pyth markets cannot settle to a correct outcome on-chain.
3. The declared spoofing/replay defenses (T-04-02-03, T-04-04-01, T-04-04-02) are not present where the threat model places them (on-chain).

### Scope NOT affected (verified working)

- **Pyth path** (the demo spine, D-01): fully implemented and verified on-chain — confidence gate `confidence*200<=price` (`SettlementManager.sol:579`), ETH fee pre-pay (`:564-570`), price-vs-target compare (`:584-594`). All Foundry tests GREEN.
- **Dispute custody, fee math, CEI, idempotency, duel validation, USDC gate, no-delegatecall** — all CLOSED with passing tests.

### Required action

Implement on-chain `submitAttestation` in `SettlementManager.sol` (and declare it in `ISettlementManager.sol`) with: EIP712 domain (name per attestation type or a single domain with a type discriminator, chainId=42161, verifyingContract=address(this)), `ECDSA.recover`, an owner-settable per-type expected-signer registry, set `_attestedOutcome`/`_attestationReady`, and revert `InvalidAttestation()` on mismatch. Add a Foundry test (e.g. `testAttestationSpoofRejected`, `testAttestationCrossChainReplayRejected`). Then re-run `/gsd-secure-phase`.

**Deployment guidance:** Until fixed, only Pyth-adapter markets are safe to settle on Sepolia. Do NOT route any non-Pyth (NFT-TWAP/DefiLlama/RpcMetrics/Snapshot/Tally/CEX) market to production settlement — they will either revert on `submitAttestation` or mis-settle to CallerLost. If non-Pyth demo is required before the fix, gate it behind explicit operator awareness.

---

## Unregistered Flags

None. All `threat_flag:` entries in the SUMMARY `## Threat Surface Scan` sections map to
declared threat IDs:
- 04-02 (new-contract-entry-point, usdc-custody, eth-custody) → T-04-02-01..09
- 04-03 (deploy-script-eth-transfer) → T-04-03-01/02
- 04-04 (external-api ×2, eth-balance) → T-04-04-03/04
- 04-06 (external-api ×3, headless-browser) → T-04-06-02/04/05
- 04-07, 04-08 → T-04-07-*, T-04-08-* (all mapped)
- 04-09 → "No new threat surface introduced"

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-04-01 | T-04-06-06 | RPC-metrics oracle adapter reuses the `defillama` GCP KMS key (no dedicated `GCP_KEY_VERSION_RPC_METRICS`). **Verified SOUND:** `rpc-metrics-adapter.ts:311` uses a DISTINCT EIP-712 domain `name='CallIt-RpcMetrics'` (vs `CallIt-DefiLlama`) despite the shared signing key (`:292`), which prevents cross-type replay between the two attestation types. Blast radius if `defillama` key compromised = DefiLlama + RpcMetrics attestations only; NFT-TWAP, CEX, Snapshot/Tally keys remain isolated. Operational overhead of 7 separate KMS key versions is disproportionate to Phase 4 risk (Sepolia staging, $5,000 TVL cap). Phase 6 pre-mainnet review re-assesses. Documented in `docs/adr/SAFETY-57-oauth-permission-scoping.md` (SAFETY-58 section). *NOTE: the cross-type-replay protection this AR relies on only becomes operative once the on-chain `submitAttestation` verification is implemented (see OPEN T-04-02-03); today the entire attestation rail is un-verified on-chain.* | ADR SAFETY-57 (Phase 1.5 owner) | 2026-06-02 |
| AR-04-02 | T-04-09-02 | `follows.read` OAuth scope NOT provisioned in Phase 4 — least-privilege `tweet.read users.read` only; "From your X" follow-graph feed is a Phase 1.5 feature behind a flag; no follow-graph data fetched or stored; no write/DM scopes ever granted; each OAuth proof chain-ID bound. The risk is the ABSENCE of a feature, not a code defect. Documented in `docs/adr/SAFETY-57-oauth-permission-scoping.md`. | ADR SAFETY-57 (Phase 1.5 owner) | 2026-06-02 |

*Accepted risks do not resurface in future audit runs.*

---

## Informational Observations (non-blocking)

| Item | Detail |
|------|--------|
| Inline native-USDC literal in relayer route | `apps/relayer/src/routes/calls-preflight.ts:262` contains the literal `0xaf88d065...` rather than importing `USDC_ARB_NATIVE`. Pre-existing Phase-1 file, not modified in Phase 4, not a contract money-path, and not covered by any Phase 4 threat. The security-critical USDC gate (contract constructor `require(_usdc == USDC_ARB_NATIVE)` `SettlementManager.sol:164`) is single-source and enforced. Recommend a follow-up hygiene fix to import the shared constant. |
| `resolveDispute` reversal redistributes bonds, not pool USDC | `SettlementManager.sol:486-502` refunds/forfeits dispute bonds and calls `updateOutcomeForDispute` (try/catch seam) but does not itself move follow/fade pool USDC between reserves on reversal; `claimPayout` reads the (post-resolution) outcome. T-04-01-03 reversal test is GREEN against the implemented behavior. Confirm this matches the intended SETTLE-34/35 "unclaimed funds only" semantics in a future review (consistent with SUMMARY 08 known-stub note). Not a declared-mitigation gap. |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-02 | 50 | 47 | 3 | gsd-security-auditor (Opus 4.8) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log (AR-04-01, AR-04-02)
- [ ] `threats_open: 0` confirmed — **NOT MET (3 open: T-04-02-03, T-04-04-01, T-04-04-02)**
- [ ] `status: verified` set in frontmatter — **blocked on open threats**

**Approval:** pending — 3 BLOCKERS must be resolved (on-chain `submitAttestation` attestation
verification rail) or formally accepted as risk before this phase ships non-Pyth settlement.
