---
phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
slug: settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
status: verified
threats_open: 0
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

**SECURED — all 50 mitigations CLOSED (0 BLOCKERS).** Re-audit 2026-06-02 (Wave A/B gap
closure). The 3 previously-OPEN threats (T-04-02-03, T-04-04-01, T-04-04-02) are now CLOSED:
the on-chain relayer-attestation verification rail (`submitAttestation` + EIP-712 +
`ECDSA.recover` + per-type expected-signer registry) IS NOW IMPLEMENTED and verified in source
and by passing Foundry + Vitest tests. The earlier 47 CLOSED threats were re-confirmed present
(no regression observed). The Pyth demo spine remains fully implemented and unaffected.

**Re-audit method (independence):** verified in source, not by implementer claim. Read
`SettlementManager.sol`, `ISettlementManager.sol`, `SettlementAttestationTest.sol`, and the
relayer byte-contract `oracle-attestation.ts`; ran the test suites and report real counts below.

**Key correction vs prior register:** the prior register assumed a hardcoded `chainId=42161`
domain. The implemented rail uses OZ `EIP712("CallIt-Oracle","1")`, which binds the REAL
`block.chainid` + `address(this)` into the domain separator — this is CORRECT and STRONGER
than a hardcoded constant (a hardcoded 42161 would have failed `ECDSA.recover` on Sepolia /
chainId 421614). Cross-chain/cross-contract replay protection is therefore genuinely enforced.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| External → `settle()` | Permissionless; any caller. Idempotency guard is primary defense | callId, Pyth VAA bytes, acceptedChallengeIds |
| Relayer → `submitAttestation()` | KMS-signed EIP-712, `ECDSA.recover` per-type signer — **ENFORCED on-chain** (`SettlementManager.sol:543-617`); domain binds `block.chainid` + `address(this)` | attestation bytes + signature — invalid sig / wrong signer / wrong domain / cross-type all revert `InvalidAttestation()` |
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
| T-04-02-03 | Spoofing | Fake relayer attestation | mitigate | `submitAttestation` (`SettlementManager.sol:543`) decodes `(callId,oracleType,outcome,priceDelta,timestamp)`, binds payload callId to param (`:558`), rejects non-definitive outcome (`:561-564`) and Pyth/out-of-range type (`:568-571`), calls `_checkAttestationSignature` → `ECDSA.recover(_hashTypedDataV4(structHash), sig)` vs `attestationSigner[oracleType]` (`:615-616`); writes `_attestedOutcome`/`_attestedPriceDelta`/`_attestationReady` (`:580-582`); reverts `InvalidAttestation()` on mismatch. Declared in `ISettlementManager.sol:218`. Tests `testAttestationWrongSignerReverts`, `testAttestationHappyPathSettles`, `testAttestationCallIdMismatchReverts`, `testAttestationPendingOutcomeReverts` GREEN (12/12). | closed |
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
| T-04-04-01 | Spoofing | Compromised per-type KMS key blast-radius | mitigate | On-chain per-type signer check NOW present: `attestationSigner` is `mapping(uint8 oracleType => address)` (`SettlementManager.sol:156`), owner-set via `setAttestationSigner` (`:633-637`), and `_checkAttestationSignature` requires `signer == attestationSigner[oracleType]` (`:616`) — a compromised type-key cannot forge another type's attestation. `_checkAdapterBinding` (`:589-593`) additionally ties `oracleType` to the call's configured `adapterMap` entry. Off-chain key separation (`kms-signer.ts` 5 keys) now backed by on-chain enforcement. Test `testAttestationCrossTypeReverts` GREEN. | closed |
| T-04-04-02 | Repudiation | Cross-chain / cross-domain EIP-712 replay | mitigate | Contract inherits OZ `EIP712("CallIt-Oracle","1")` (`SettlementManager.sol:63,176`); `_checkAttestationSignature` recovers over `_hashTypedDataV4(structHash)` (`:615`), whose domain separator binds the REAL `block.chainid` + `address(this)` (STRONGER than the prior register's assumed hardcoded 42161 — that would have broken on Sepolia/421614). An attestation signed for another chain or contract recovers a different address and reverts `InvalidAttestation()`. Relayer byte-contract `oracle-attestation.ts` passes the deployment chainId (never hardcoded). Tests `testAttestationReplayWrongDomainReverts` (Foundry) + "real viem signature recovers to signer" (Vitest) GREEN. | closed |
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

## Gap-Closure Record (Wave A/B) — 3 BLOCKERS now CLOSED

Re-audit 2026-06-02 verified the on-chain relayer-attestation verification rail is now present.
All 3 previously-OPEN threats are CLOSED. Evidence verified independently in source + tests
(not by implementer claim).

| Threat ID | Category | What was missing (prior audit) | What is now present (this re-audit) |
|-----------|----------|--------------------------------|-------------------------------------|
| T-04-02-03 | Spoofing | No `submitAttestation`, no `ECDSA` import, no EIP712 base, no signer registry; `_attestedOutcome`/`_attestationReady` never written | `submitAttestation` (`SettlementManager.sol:543-585`) + `_checkAttestationSignature` (`:597-617`) `ECDSA.recover(_hashTypedDataV4(structHash), sig)` vs `attestationSigner[oracleType]`; writes `_attestedOutcome`/`_attestationReady`/`_attestedPriceDelta` (`:580-582`); declared in `ISettlementManager.sol:218`; `InvalidAttestation()` now used on every failure branch |
| T-04-04-01 | Spoofing | No on-chain per-type signer check; off-chain key separation had no on-chain guarantee | `attestationSigner` per-type registry (`:156`), owner-set (`:633-637`), enforced `signer == attestationSigner[oracleType]` (`:616`); `_checkAdapterBinding` (`:589-593`) binds `oracleType` to the call's `adapterMap` entry — one compromised type-key cannot forge another type |
| T-04-04-02 | Repudiation | Contract never recovered/checked the signature; no on-chain chainId/contract binding | OZ `EIP712("CallIt-Oracle","1")` inherited (`:63,176`); domain separator binds real `block.chainid` + `address(this)`; wrong-domain signature recovers a different address → revert. STRONGER than the prior register's assumed hardcoded 42161 (which would have failed on Sepolia/421614) |

### The mis-settle correctness fix (safety of the rail)

The prior `_dispatchOracle` fall-through to `(CallerLost, 0)` for unattested non-Pyth calls is
**GONE**. `_dispatchOracle` (`SettlementManager.sol:240-261`) now: routes Pyth to `_settlePyth`;
for non-Pyth, if `_attestationReady[callId]` returns the attested outcome (`:252-253`), else
emits `SettlementDelayed("attestation-pending")` and returns `(Pending, 0)` (`:259-260`).
`settle()` returns without state change on `Pending` (`:223-225`). A missing attestation now
DEFERS (safe) instead of mis-settling. Regression guard `testUnattestedNonPythDefers` GREEN.

### Test evidence (real counts — run this re-audit, 2026-06-02)

- `forge test --match-path test/SettlementAttestationTest.sol` → **12 passed, 0 failed, 0 skipped.**
  Covers: happy-path CallerWon + CallerLost; wrong-signer reject; wrong-domain/replay reject;
  cross-type reject; pending-outcome reject; callId-mismatch reject; Pyth-type reject; owner guard;
  invalid-type guard; event emission; and `testUnattestedNonPythDefers` (defer regression guard).
- `forge test --match-contract SettlementManager` → **13 passed, 0 failed** (unit). The 1 reported
  failure is `SettlementManagerForkTest::setUp()` aborting on missing env var `ARB_ONE_RPC_URL`
  (no mainnet RPC in this sandbox) — an environment-config issue, NOT a code defect, and outside
  the scope of these 3 threats.
- `pnpm --filter @call-it/relayer test --run oracle-attestation` → **12 passed, 0 failed.** Pins the
  relayer byte-contract to the contract: identical typehash field list, domain `CallIt-Oracle`/`1`,
  ABI decode tuple, and a real-viem-signature-recovers-to-signer test (off-chain mirror of on-chain
  `ECDSA.recover`). Asserts chainId is the deployment chain (`421614`), never a hardcoded `42161`.

### Scope confirmed unaffected (no regression observed)

- Pyth path (`_settlePyth` `:681-718`): confidence gate `conf*200<=price` (`:702`), ETH fee pre-pay
  (`:687-693`), price-vs-target compare (`:709-717`) — unchanged, tests GREEN.
- Dispute custody, fee math, CEI, idempotency, duel validation, USDC gate, no-delegatecall — the 47
  prior-CLOSED threats re-confirmed; no regression seen while reading.

### Residual operational follow-ups (NOT blockers; functional, not spoofing/replay)

Per the re-audit scope note, these are FUNCTIONAL completeness items that cause a revert/defer
(safe), never a forged or mis-settled outcome — they do NOT re-open T-04-02-03/04-04-01/04-04-02:

1. Owner must call `setAttestationSigner(oracleType, kmsAddress)` for each non-Pyth oracle type
   before that path can settle (until set, `attestationSigner[type]==address(0)` → all attestations
   for that type revert `InvalidAttestation()` — safe-closed, not forgeable).
2. `adapterMap` must be configured in the deploy script and the 6 non-Pyth adapters rewired onto
   `oracle-attestation.ts` (tracked separately as relayer functional work). An unconfigured map
   causes `_dispatchOracle` to DEFER (`Pending`), never a mis-settle.
3. Sepolia 48h staging gate (CLAUDE.md) should include at least one non-Pyth attestation-path
   end-to-end run before mainnet.

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
| AR-04-01 | T-04-06-06 | RPC-metrics oracle adapter reuses the `defillama` GCP KMS key (no dedicated `GCP_KEY_VERSION_RPC_METRICS`). **Verified SOUND (re-audit 2026-06-02):** cross-type replay between DefiLlama and RpcMetrics is now prevented ON-CHAIN by the unified attestation rail — the signed `OracleAttestation` struct binds `oracleType` (DefiLlama=2 vs RpcMetrics=3), the contract enforces `signer == attestationSigner[oracleType]` (`SettlementManager.sol:616`) AND `_checkAdapterBinding` ties `oracleType` to the call's configured `adapterMap` entry (`:589-593`). A DefiLlama-signed payload cannot be replayed as an RpcMetrics attestation even though the KMS key is shared, because the `oracleType` field is part of the signed digest and is re-validated against the call's adapter. (NOTE: the prior per-adapter `name='CallIt-RpcMetrics'` distinct-domain mechanism is superseded by the single `CallIt-Oracle` domain + per-type signer + adapter-binding in `oracle-attestation.ts`; the protection holds and is now on-chain-enforced rather than relying on off-chain domain naming.) Blast radius if `defillama` key compromised = DefiLlama + RpcMetrics attestations only; NFT-TWAP, CEX, Snapshot/Tally signers remain isolated. Operational overhead of separate KMS key versions is disproportionate to Phase 4 risk (Sepolia staging, $5,000 TVL cap). Phase 6 pre-mainnet review re-assesses. Documented in `docs/adr/SAFETY-57-oauth-permission-scoping.md`. | ADR SAFETY-57 (Phase 1.5 owner) | 2026-06-02 |
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
| 2026-06-02 (re-audit, VERIFY-MITIGATIONS) | 50 | 50 | 0 | gsd-security-auditor (Opus 4.8 1M) — Wave A/B gap closure verified in source + tests; T-04-02-03, T-04-04-01, T-04-04-02 CLOSED |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log (AR-04-01, AR-04-02)
- [x] `threats_open: 0` confirmed — **MET (re-audit 2026-06-02: T-04-02-03, T-04-04-01, T-04-04-02 CLOSED)**
- [x] `status: verified` set in frontmatter

**Approval:** SECURED. All 50 declared mitigations verified present in code. The on-chain
relayer-attestation verification rail (`submitAttestation` + EIP-712 + `ECDSA.recover` +
per-type signer registry + adapter-binding + defer-on-missing-attestation) is implemented and
GREEN across Foundry (12/12 attestation + 13/13 SettlementManager unit) and Vitest (12/12
relayer byte-contract). Phase may ship non-Pyth settlement once `setAttestationSigner` is set
per oracle type and `adapterMap` is configured (operational steps; both fail safe-closed/defer).
