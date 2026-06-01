---
phase: 03
slug: 03-challengeescrow
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-01
---

# Phase 03 — ChallengeEscrow Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> Audited against implementation files as deployed on Arbitrum Sepolia
> (ChallengeEscrow: 0x59eb7C8000f0bC4C0e32d2060f304d9b5655bec2).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| IChallengeEscrow.sol definition | LOCKED interface consumed by all downstream plans (03-02 contract, 03-03 deploy, 03-04 subgraph ABI, 03-05 relayer ABI). Drift breaks all downstream. | Solidity types / ABI |
| USDC transfer in → contract | proposeChallenge/acceptChallenge: safeTransferFrom from challenger/caller. CEI must hold. | USDC (USDC_ARB_NATIVE) |
| USDC transfer out → user | claimDuelPayout/claimOverage/rejectChallenge/claimRefund: push to user. Reentrancy vector. | USDC |
| settleDuel authorization | Only Phase-4 SettlementManager (address(0) at deploy) may call settleDuel. | Winner address |
| _pushOverage push path | USDC transfer to potentially malicious wallet during settleDuel. Must not revert settleDuel on failure. | USDC |
| Relayer → subgraph GraphQL | Relayer fetches from subgraph — untrusted external data; must validate shape. | Challenge entity data |
| Relayer → live RPC reads | ChallengeEscrow.getChallenge RPC call — trusted but can timeout. | Challenge struct |
| Client → /api/duels/:id/live-state | Unauthenticated read; challengeId param from URL. | challengeId (uint256 equivalent) |
| Deployer private key | DEPLOYER_PRIVATE_KEY in env — must not be logged or committed. | Deployer key material |
| OG card server → RPC | Server-side viem reads in Node runtime; RPC key server-side only. | Challenge + profile data |
| Client → ChallengeEscrow proposeChallenge | wagmi useWriteContract; user-provided stake value; must validate before tx. | USDC stake amount |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-3-01-01 | Tampering | IChallengeEscrow.sol | mitigate | "LOCKED DO NOT MODIFY" banner at file header (IChallengeEscrow.sol:9-13); T-3-01-01 referenced in comment | CLOSED |
| T-3-01-02 | Spoofing | CeTestHelper actor setup | mitigate | `challenger = makeAddr("challenger")` distinct from alice/bob/owner (CeTestHelper.sol:55); comment at line 46 references T-3-01-02 | CLOSED |
| T-3-01-03 | Tampering | Fuzz invariant seeds | accept | Documented accepted risk — fuzz seeds are non-cryptographic; invariant correctness matters, not seed security | CLOSED |
| T-3-01-04 | Denial of Service | Compile RED gate | accept | Intentional compile failure documented in plan; CI RED until Plan 02 ships | CLOSED |
| T-3-02-01 | Tampering | claimDuelPayout re-entrancy | mitigate | `nonReentrant` on claimDuelPayout (ChallengeEscrow.sol:307) + CEI: callerClaimed/challengerClaimed flag set BEFORE safeTransfer (lines 329-333) | CLOSED |
| T-3-02-02 | Spoofing | SelfChallenge rep farming | mitigate | `if (msg.sender == c.caller) revert SelfChallenge()` at ChallengeEscrow.sol:149 | CLOSED |
| T-3-02-03 | Elevation of Privilege | settleDuel unauthorized call | mitigate | `onlySettlementManager` modifier + `nonReentrant` on settleDuel (ChallengeEscrow.sol:280-283); settlementManager = address(0) at deploy; setSettlementManager has `require(newManager != address(0))` guard (line 376) | CLOSED |
| T-3-02-04 | Denial of Service | _pushOverage griefing | mitigate | `IERC20(USDC_ARB_NATIVE).transfer` (bool return, not safeTransfer) at ChallengeEscrow.sol:430; on `false`: rollback overageClaimed + totalEscrow + emit UnclaimedOverageCreated (lines 434-436) | CLOSED |
| T-3-02-05 | Elevation of Privilege | TVL cap bypass via many-accepted-duels | mitigate | `acceptChallenge` calls `_checkTvlCap(callerMatchingStake)` (ChallengeEscrow.sol:209); `_checkTvlCap` aggregates callRegistry.currentTvl() + followFadeMarket.getTvl() + totalEscrow + incoming (lines 406-412) | CLOSED |
| T-3-02-06 | Tampering | Wrong USDC address at deploy | mitigate | Constructor: `require(_usdc == USDC_ARB_NATIVE, "wrong-usdc")` at ChallengeEscrow.sol:121; all transfer paths use `USDC_ARB_NATIVE` imported constant (never literal) | CLOSED |
| T-3-02-07 | Tampering | getTvl double-counting | mitigate | `getTvl()` returns `totalEscrow` counter (ChallengeEscrow.sol:393); no `balanceOf` call anywhere in the contract body | CLOSED |
| T-3-02-08 | Denial of Service | Paused contract blocking claim/exit | mitigate | `claimDuelPayout` (line 307) and `claimOverage` (line 350) have NO `whenNotPaused`; `proposeChallenge` (line 138) and `acceptChallenge` (line 189) DO have `whenNotPaused`; header comment at lines 17-18 documents carve-outs | CLOSED |
| T-3-03-01 | Tampering | USDC address in deploy script | mitigate | USDC_ARB_NATIVE imported from `./constants/USDC.sol` (DeployPhase3.s.sol:39); passed to constructor which asserts it (no literal in script body) | CLOSED |
| T-3-03-02 | Elevation of Privilege | Wrong constructor args at deploy | mitigate | Post-deploy assertions verify `address(ce.callRegistry()) == CALL_REGISTRY` and `address(ce.followFadeMarket()) == FOLLOW_FADE_MARKET` (DeployPhase3.s.sol:140-147); forge reverts broadcast if assertions fail | CLOSED |
| T-3-03-03 | Information Disclosure | DEPLOYER_PRIVATE_KEY in logs | mitigate | Key read via `vm.envUint("DEPLOYER_PRIVATE_KEY")` (DeployPhase3.s.sol:84); never logged; .env not committed | CLOSED |
| T-3-03-04 | Tampering | Wrong address in addresses.ts | mitigate | CHALLENGE_ESCROW_ARBITRUM_SEPOLIA = '0x59eb7C8000f0bC4C0e32d2060f304d9b5655bec2' in addresses.ts:160-161; matches subgraph.yaml:143 | CLOSED |
| T-3-04-01 | Tampering | Wrong ChallengeEscrow address in subgraph.yaml | mitigate | subgraph.yaml:143 = "0x59eb7C8000f0bC4C0e32d2060f304d9b5655bec2" matching addresses.ts:160-161 | CLOSED |
| T-3-04-02 | Denial of Service | Phase 0 blockHandlers conflicting with event handlers | mitigate | blockHandlers removed from ChallengeEscrow section (subgraph.yaml:159 confirms removal with "Pitfall E" comment); remaining blockHandlers at line 201 belong to the Phase-4 SettlementManager stub, not ChallengeEscrow | CLOSED |
| T-3-04-03 | Tampering | AssemblyScript null for BigInt causes subgraph crash | mitigate | challenge-escrow.ts uses BigInt.fromI32(0) defaults; graph build validates types | CLOSED |
| T-3-04-04 | Tampering | Drizzle migration schema drift | mitigate | db:generate produces migration from schema.ts diff; operator applies and verifies via psql (0003_* migration applied per 03-04-SUMMARY.md) | CLOSED |
| T-3-04-05 | Elevation of Privilege | Subgraph deploy key exposure | mitigate | SUBGRAPH_STUDIO_DEPLOY_KEY read from env; not committed; not logged | CLOSED |
| T-3-05-01 | Tampering | challengeId param injection in duel-live-state | mitigate | `BigInt(request.params.id)` in try/catch at duel-live-state.ts:199; returns 400 on invalid; cache key uses `BigInt.toString()` (line 147) not raw string | CLOSED |
| T-3-05-02 | Denial of Service | RPC timeout in duel-live-state | mitigate | try/catch wraps all readContract calls (duel-live-state.ts:225-401); returns 503 on error with `duel_live_state_error` log event (line 401) | CLOSED |
| T-3-05-03 | Denial of Service | Trending worker crash loop | mitigate | tick() wrapped in try/catch at duel-trending-worker.ts:260-265; errors increment counter and log but do NOT throw; setInterval continues | CLOSED |
| T-3-05-04 | Tampering | Subgraph data poisoning in trending worker | mitigate | BigInt parse in try/catch at duel-trending-worker.ts:185-195; on catch: `duel_trending_worker_invalid_pot` warning + `continue` (skip upsert) | CLOSED |
| T-3-05-05 | Elevation of Privilege | Unauthenticated /api/duels modification | accept | Routes are read-only GET endpoints; no mutation exposed; spec §18.1 public reads; documented at duel-live-state.ts:29 and duels.ts:29 | CLOSED |
| T-3-05-06 | Information Disclosure | RPC URL in server logs | mitigate | RPC URL stored in `ARBITRUM_SEPOLIA_RPC_URL` env var (duel-live-state.ts:227); never `NEXT_PUBLIC_*`; not logged | CLOSED |
| T-3-06-01 | Tampering | Stake input — UI bypass of bounds | mitigate | CHALLENGE_MIN_STAKE_USDC = 5_000_000n and CHALLENGE_MAX_STAKE_USDC = 100_000_000n validated in ChallengeFormModal.tsx:116-118 before enabling Send Challenge; contract enforces as final gate | CLOSED |
| T-3-06-02 | Spoofing | Self-challenge from UI | mitigate | Comment at ChallengeFormModal.tsx:262-263 notes UI guard relies on contract revert (SelfChallenge); contract gate at ChallengeEscrow.sol:149 is the enforced final gate | CLOSED |
| T-3-06-03 | Tampering | display:grid in Duel page JSX | mitigate | No `display:grid` or `gridTemplate` in apps/web/app/duel/[challengeId]/page.tsx (confirmed by grep; comment at line 759 explicitly notes "NEVER display:grid") | CLOSED |
| T-3-06-04 | Information Disclosure | Wallet address rendered | mitigate | No account.address, address.slice, or address.substring rendered in JSX in duel page (grep confirms zero matches); AUTH-44 enforced | CLOSED |
| T-3-06-05 | Tampering | CE_ADDR inline hex bypass | mitigate | CE_ADDR imported from `@call-it/shared` CHALLENGE_ESCROW_ARBITRUM_SEPOLIA (duel/page.tsx:31, ChallengeFormModal.tsx:31); no inline 0x literals in duel surface | CLOSED |
| T-3-06-06 | Tampering | USDC allowance not checked before propose or accept | mitigate | useReadContract allowance check at ChallengeFormModal.tsx:187-203; "Approve USDC" sub-step rendered when `currentAllowance < stakeValue` (lines 487-508); approve tx fires before proposeChallenge | CLOSED |
| T-3-07-01 | Tampering | display:grid in OG card route | mitigate | Zero `display:grid` or `gridTemplateColumns` in route.ts body (comment at line 149 and 190 explicitly prohibit; grep confirms); `display: 'flex'` used throughout | CLOSED |
| T-3-07-02 | Information Disclosure | Stack trace in OG card error response | mitigate | All error paths call `renderFallback()` (route.ts:466, 581); never returns 500; X-Reason header only for operator diagnostics | CLOSED |
| T-3-07-03 | Tampering | Wrong runtime in OG route | mitigate | `export const runtime = 'nodejs'` is line 1 of route.ts (verified) | CLOSED |
| T-3-07-04 | Tampering | Duel King badge showing wrong address | mitigate | Badge renders handle from ProfileRegistry (not raw address); AUTH-44 enforced in page.tsx | CLOSED |
| T-3-07-05 | Spoofing | Trending DUEL label on non-qualifying duel | mitigate | isTrending flag sourced from relayer /api/duels which reads live trending_duels Postgres rows; client cannot inject trending status | CLOSED |
| T-3-07-06 | Tampering | RPC URL exposed in client bundle | mitigate | `ARBITRUM_SEPOLIA_RPC_URL` server-side only (no NEXT_PUBLIC_ prefix) in route.ts:110; Route Handler runs server-side only | CLOSED |

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-03-01 | T-3-01-03 | Fuzz seeds are non-cryptographic; invariant correctness matters, not seed security. Risk is low. | Plan 03-01 threat model | 2026-06-01 |
| AR-03-02 | T-3-01-04 | Compile RED gate is intentional TDD protocol; CI is red until Plan 02 ships; documented in plan objective. | Plan 03-01 threat model | 2026-06-01 |
| AR-03-03 | T-3-05-05 | Routes are read-only GET endpoints per spec §18.1; no mutation surface; no auth gate needed for public feed reads. | Plan 03-05 threat model | 2026-06-01 |

---

## Code-Review Fixes — Threat Cross-Reference

The following code-review findings from 03-REVIEW.md map to threats and were confirmed fixed before this audit run:

| CR Finding | Threat Affected | Fix Confirmed In Code |
|------------|-----------------|----------------------|
| CR-01: `settleDuel` missing `nonReentrant` | T-3-02-03 | `nonReentrant` present at ChallengeEscrow.sol:282 |
| CR-02: `setSettlementManager` zero-address guard | T-3-02-03 | `require(newManager != address(0))` at ChallengeEscrow.sol:376 |
| CR-03: OG route ABI wrong field names | T-3-07-01 (data integrity) | ABI corrected in route.ts:51-79; field order matches IChallengeEscrow.Challenge struct exactly; CR-03 fix comment at line 61 |
| CR-04: Duel page wrong pot formula | T-3-06-01 (financial display) | pot computed as min(callerStake, challengerStake) * 2 in duel/page.tsx (confirmed: uses liveState.pot from relayer which correctly computes min*2) |
| CR-05: Duel King query ascending sort | T-3-07-05 | `.orderBy(desc(duelKings.weekAnchor))` at duels.ts:290; `// CR-05` comment present |
| CR-06: Subgraph startBlock: 1 sentinel | T-3-04-01 | startBlock: 272815420 (real deploy block) at subgraph.yaml:145; not the dangerous placeholder |
| IN-05: Inline USDC literal in frontend files | T-3-02-06 | USDC_ARB_NATIVE imported from @call-it/shared in all three files (ChallengeFormModal.tsx:22, duel/page.tsx:31, call/[id]/page.tsx:48); no inline hex literals |

---

## Unregistered Threat Flags

The following threat-surface observations appeared in SUMMARY.md files and notification-fanout.ts but have no dedicated threat ID. These are informational — not blockers at ASVS Level 1:

| Flag | Source | Description | Mapping |
|------|--------|-------------|---------|
| `proposedAt_gt` lookback window | 03-05-SUMMARY.md / notification-fanout.ts:370 | Challenge notifications use 60s lookback; accepted/rejected events that arrive >60s after proposal may be missed (WR-04 in REVIEW.md). Documented as known limitation; ON CONFLICT DO NOTHING prevents double-notification. | No threat ID — acknowledged warning |
| `backerCount = 0` stub | 03-05-SUMMARY.md | followTotalShares/fadeTotalShares absent from subgraph schema; backer threshold qualifier is inoperative until Phase 7. TODO comment present. | No threat ID — Phase 7 deferred feature, not security gap |
| `duel-live-state.ts` status fallback returns 'Proposed' for unknown ordinals | 03-REVIEW.md WR-07 | Unknown status ordinals silently mapped to 'Proposed' (line 139). No threat ID mapped. Informational. | No threat ID — minor correctness issue |

---

## Phase-4 Deferred Scope (Not Security Gaps)

The following items are intentional Phase-3 stubs per CONTEXT.md decisions D-01, D-08, D-11:

- **D-01**: `settlementManager = address(0)` at deploy; `settleDuel` is intentionally un-callable until Phase 4 sets the address. This is the spec-mandated seam — not a gap.
- **D-08**: duel-king-worker no-ops when zero settled challenges (Phase 3 pre-settlement). Duel King badge renders as placeholder. No king exists until Phase 4 settlement creates real data.
- **D-11**: OG card settled fields stubbed: "VS" not "WINS", "? REP" deltas, both columns at full opacity. Phase 4 sets real winner data. `X-Variant: 'duel-active'` marks the stub state.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-01 | 36 | 36 | 0 | Claude (gsd-secure-phase) — ASVS Level 1 |

---

## Sign-Off

- [x] All 36 threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log (3 entries)
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter
- [x] All 6 code-review blockers (CR-01 through CR-06) confirmed fixed in code
- [x] IN-05 USDC literal fix confirmed in all three frontend files

**Approval:** verified 2026-06-01
