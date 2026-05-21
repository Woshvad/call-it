# Pitfalls Research — Call It

**Domain:** Onchain social prediction product on Arbitrum One (hackathon + mainnet v1) — risk register for a real-money product with a 48h Sepolia gate and a live mainnet target
**Researched:** 2026-05-21
**Confidence:** HIGH on contract-level pitfalls (Solidity practice well-documented in 2026; Arbitrum + Pyth + Stylus audited bodies of work exist); HIGH on Polymarket/UMA oracle-incident class (March 2025 Ukraine mineral-deal attack is well-documented and directly analogous to the §13.5 governance path); MEDIUM on Privy OAuth-takeover patterns (no specific 2025/2026 disclosed CVE found — must reason from generic OAuth + embedded-wallet pattern); MEDIUM on US regulatory pressure (CFTC is actively rulemaking in 2026 — explicit verdict varies state-by-state)
**Method:** Read STACK.md, FEATURES.md, ARCHITECTURE.md in full before writing. Cross-referenced pitfalls against the locked spec §§ and the existing sibling tables (e.g. FEATURES.md's "What breaks the loop" table, ARCHITECTURE.md's §5 trust-boundary inventory). Where a sibling already covered a pitfall, this document references and extends rather than duplicates. Validated against 2026 incident data via WebSearch (Polymarket UMA, Stylus DoS bounty, CFTC rulemaking, Farcaster Frames → Mini Apps rename).

This is **not** a spec critique — the spec is locked. This is a **risk register** mapping known failure modes to spec mitigations (or GAPs where the spec is silent). The roadmap can use this to allocate phase-time to the highest-risk areas.

---

## TL;DR — Top 12 Critical-Path Pitfalls (Ranked)

| # | Pitfall | Severity | Likelihood | Spec mitigated? | One-liner |
|---|---|---|---|---|---|
| 1 | **Solidity `^0.8.24` floats into the IR storage-clearing bug range (0.8.28–0.8.33)** | CRITICAL | HIGH | PARTIAL (§10.5 pins `^0.8.24`, STACK.md flagged) | Lock to `=0.8.30` in `foundry.toml`. If left as `^0.8.24`, `forge build` on a fresh machine in Aug 2026 picks `0.8.33` and silently corrupts storage. |
| 2 | **Pyth feed IDs rotate between research date (2026-05-21) and deploy day** | CRITICAL | MEDIUM | PARTIAL (App.A.1 mandates pre-deploy verification but no automation) | A wrong bytes32 in `addAsset` settles every BTC call to garbage. Build an automated Hermes-vs-on-chain ID diff to gate deploy. |
| 3 | **Relayer signer key compromise = forge NFT TWAPs, DefiLlama TVL, CEX listings, Snapshot results, AND mint VERIFIED · X badges** | CRITICAL | MEDIUM | PARTIAL (§13.x notes "bounded by $5K TVL cap" but a single key signs across all attestation surfaces — ARCHITECTURE.md §5 calls this the biggest trust boundary) | GAP: spec is silent on relayer key rotation cadence, HSM/KMS storage, or per-attestation-type key separation. Recommend separate keys per attestation type + KMS storage before mainnet. |
| 4 | **Stylus contract expires (365-day reactivation) silently during v1 lifetime** | HIGH | HIGH (certain at 12 months) | NO — spec mentions transparent proxy but does not mandate reactivation cadence | An expired Stylus contract becomes uncallable — settlement falls to the §11.6 try/catch baseline indefinitely with no operator alert. Add a 30-day-pre-expiry Telegram alert. |
| 5 | **Owner-resolved dispute path is a UMA-style governance attack surface, just centralized** | HIGH | MEDIUM | PARTIAL (§13.8 caps at 3 counter-claims; v1 is owner-resolved) | The March 2025 Polymarket/UMA Ukraine-mineral-deal attack settled wrongly through legitimate governance process. Call It's owner = single key = same surface, lower velocity. Mitigation: documented public dispute-decision log + multisig promotion before TVL > $5K. |
| 6 | **Privy embedded wallet OAuth-account-takeover at moment of withdrawal** | HIGH | MEDIUM | PARTIAL (App.A.1 mandates SIWE re-sign at withdrawal + 24h new-auth-link cooldown) | The 24h cooldown only protects the *new* link path; it does not protect against an attacker who controls the ORIGINAL OAuth (e.g. Google account takeover). GAP: spec has no withdrawal-velocity throttle or large-withdrawal 2FA. |
| 7 | **Paymaster $50/day cap exhausted in first hour of hackathon judging by genuine demand (not attack)** | HIGH | HIGH | PARTIAL (§10.7 caps + 80% Telegram alert) | A successful demo hits the cap; users see "fund your wallet to continue" mid-judging. Pre-pay an elevated demo-day cap; document in operator runbook. |
| 8 | **OG image CDN cache cold at moment of share — fallback card serves "A Call Was Made" instead of outcome** | HIGH | HIGH | PARTIAL (§16.6 fallback exists, §15.7 200px QA gate) | Twitter Card Validator caches forever per-URL; a stale Live card persists post-settlement until cache busts. GAP: spec is silent on cache-busting strategy (?v= param? unique-per-state URL?). |
| 9 | **Wash-trade own call via sybil-fade to defeat cold-start 25% adjustment** | MEDIUM | MEDIUM | OBSERVABILITY-ONLY (FEATURES.md identified gap) | Already documented; cross-reference here. Not a v1 mainnet blocker, but the relayer analytics flag is a P2 in REQUIREMENTS.md. |
| 10 | **`forceSettle` outcome chosen wrong by owner under time pressure** | HIGH | MEDIUM | PARTIAL (§12.4 logs loudly via dual event emission) | Owner has 7d cooldown to think but the actual decision is unilateral. GAP: no formal owner-decision template / public commitment log. |
| 11 | **CEX scraper breaks silently when an exchange redesigns announcement page** | HIGH | HIGH (certain across 8 exchanges in 6 months) | PARTIAL (§13.6 modular scrapers; dispute window catches it) | Each scraper is one CSS-selector change from broken; per-scraper smoke test on a known-listed token weekly. |
| 12 | **Twitter Card Validator caches a stale OG card before mainnet announce — preview broken on launch day** | HIGH | MEDIUM | PARTIAL (§19.11 includes Twitter Card Validator check) | The validator caches per-URL globally. Smoke-test with a DIFFERENT URL pre-announce; clear/re-validate the canonical URL only at announce moment. |

---

## Pitfall Catalogue by Dimension

### 1. Smart-Contract Security (Solidity + Stylus/Rust)

| Pitfall | Severity | Likelihood | Why it happens | Spec mitigation | Recommended action |
|---|---|---|---|---|---|
| **Solidity 0.8.28–0.8.33 IR storage-clearing bug** | CRITICAL | HIGH | Spec pins `^0.8.24` which floats forward; Foundry default config has IR enabled. The 0.8.34 fix is post-Feb-2026. | §10.5 pin language; STACK.md already flagged. | **Pin `solc = "0.8.30"` in `foundry.toml`** and lock pragmas to `pragma solidity =0.8.30;` (exact). Verify pragma in every contract pre-deploy. |
| **Reentrancy on USDC `safeTransferFrom` paths during settlement fee fan-out (treasury, creator, LP pool)** | CRITICAL | LOW | `settle()` step 11 transfers to multiple addresses — if any is a contract with `tokensReceived` hook, reentrancy is possible without guards. | §10.5 mandates `ReentrancyGuard`; CEI pattern. | Verify `nonReentrant` modifier on `settle`, `claimPayout`, `callerExit`, `exitPosition`, `claimRefund`, `claimDuelPayout`, `acceptChallenge`, `raiseDispute`. Sepolia test with USDC mock that calls back into the contract. |
| **USDC fee-on-transfer surprise** | LOW | LOW | Native USDC on Arbitrum is fee-on-transfer-free as of 2026, but the code should still verify post-transfer balance delta for defense in depth. | Spec hardcodes USDC at `0xaf88d065...` (STACK.md verified) | Add `require(post - pre == amount, UsdcTransferShort)` on the first `safeTransferFrom` in `createCall` as a runtime canary. Cheap, defensive, catches the day Circle ever changes the contract. |
| **Force-fed ETH via `selfdestruct` corrupts contract ETH balance accounting** | LOW | LOW | No spec contract holds ETH state; Pyth update VAA fee passes ETH transiently. | Implicit — no ETH balance reads. | Confirm no contract uses `address(this).balance` for accounting. The Pyth ETH fee is a pass-through in the same tx — safe. |
| **Signature replay across chainId** (relayer attestations) | HIGH | MEDIUM | Relayer signs NFT TWAPs / DefiLlama / CEX / Snapshot results. Without EIP-712 domain separator including `chainId`, a Sepolia signature could replay on mainnet. | Spec is silent on attestation signing format. | **GAP.** Use EIP-712 with `name`, `version`, `chainId`, `verifyingContract` in the domain — for every relayer-signed payload. Sepolia and mainnet must produce non-replayable signatures. Add to `SettlementManager` storage. |
| **EIP-2612 permit replay / signature malleability** | LOW | LOW | Spec doesn't currently use permit; STACK.md notes permit is supported by native USDC. | N/A in v1. | If permit-flow added in v1.1 (Circle Paymaster), enforce nonce + deadline. Not a v1 concern. |
| **Integer overflow/underflow in fee math** | MEDIUM | LOW | Solidity 0.8.x has checked arithmetic by default. Rounding-down in `mulDiv` can drift fee totals. | §8.6 fixed-point split (1.0% / 0.4% / 0.3%); pinned by `1e6` USDC decimals. | Use OZ `Math.mulDiv` with rounding direction explicit. Add invariant test: `protocolFee + creatorFee + lpFee + winnerPayout == fadePool + followPool + virtualFadeSeed` for every settled call. |
| **Rounding bias in AMM share calc creates "free shares" at edge** | MEDIUM | LOW | Constant-product `(stake * pool) / (pool + stake)` rounds down; at $1 deposit into a $7-virtual pool, sharesMinted may round to 0. | §11.2 single-contract sub-state; §12.2 `minSharesOut`. | Add Foundry fuzz: deposit $1 → $100 across pool sizes $7 → $5K, assert `sharesMinted > 0` always. If 0 is possible, bump `MIN_POSITION` or change rounding to `mulDivUp` for share computation. |
| **Virtual fade seed corruption — re-initialized on second `createCall` collision** | HIGH | LOW | `virtualFadeSeed[callId]` set at create. If `nextCallId` collides (shouldn't, but verify), seed corrupts. | §11.2 keyed by callId; §12.1 step 16 stores by call.id. | Sepolia boundary test: create 1000 calls in tight loop, assert `nextCallId` strictly monotonic. Static analysis: confirm no path mutates `nextCallId` outside `createCall`. |
| **Paymaster drain via per-account 5-tx limit bypass** | HIGH | MEDIUM | Counter is server-side per-Privy-DID; an attacker creating N Privy DIDs from N OAuth providers (Google + Twitter + Wallet) on same browser may not be deduplicated. | §10.7 5-tx cap per account; $50/day global. | **Verify Privy-side `subjectId` collision behavior** — same OAuth account through 2 paths should produce same `subjectId`. If not, add IP+device-fingerprint heuristic to relayer paymaster gating layer. |
| **Stylus activation expiry — 365 days from deploy** | HIGH | HIGH (certain at 12mo) | Stylus contracts must be reactivated via `cargo stylus` or ArbWasm precompile every 365 days. Silent expiry → contract uncallable. | §10.8 transparent proxy is correct; §11.6 runtime fallback catches it but with degraded scoring. | **GAP.** Add a `stylusDeployedAt` timestamp env var to relayer; alert at 335d, 350d, 360d, 365d. Operator runbook addition: "Reactivate Stylus quarterly out of caution." |
| **Stylus storage-layout collision with Solidity proxy slots** | CRITICAL | LOW | Stylus uses EIP-1967 standard slots if using OZ Stylus UUPS. Mixing UUPS (Rust) with Solidity TransparentProxy front-end is the recommended path per STACK.md but layout collision possible. | STACK.md recommends Solidity TransparentProxy in front of stateless Stylus impl. Stylus impl is stateless per ARCHITECTURE.md §2.6. | Stateless impl makes this safe — but verify by deploying both Stylus and Solidity-baseline implementations and rotating via `upgradeTo` on Sepolia. Assert no storage observed via `cast storage`. |
| **Stylus revert leaks gas in `try/catch` to denial of service** | MEDIUM | LOW | Each Stylus revert burns gas up to the forwarded gas budget. If relayer pays gas for settle, repeated reverts on heavy calls drain relayer ETH. | §11.6 fallback is at the proxy level — caught quickly. | Cap forwarded gas in the Stylus call: `engine.compute_rep_change{gas: 500_000}(...)`. Document in SettlementManager comments. |
| **OZ Stylus crate `0.3.0` alpha-line API changes between Sepolia and mainnet** | MEDIUM | MEDIUM | STACK.md flagged `openzeppelin-stylus` is alpha. Locking with `=0.3.0` prevents cargo surprises but does NOT prevent the proxy admin from being changed if upstream releases a breaking re-deploy. | STACK.md mandates exact pin `=0.3.0`. | **Reproducible build via `cargo --locked` + commit `Cargo.lock`**. Add CI check: build hash on mainnet deploy candidate must match Sepolia-deployed hash. |
| **Cross-contract call ABI mismatch between Stylus Rust trait and Solidity SettlementManager** | HIGH | MEDIUM | Stylus type-safe cross-contract calls via `#[public]` traits; Solidity calls into Stylus via standard ABI. Field-order or signature mismatch silently encodes wrong data. | STACK.md flagged this; spec is silent. | **GAP.** Add a Foundry test that calls Stylus through the proxy with all input combinations from the spec's rep formula (`currentRep`, `conviction`, `consensusPct`, `isWinner`, `baseValue`) and asserts output matches the Solidity baseline within tolerance. Block deploy on parity test failure. |
| **No upgradability on CallRegistry/FollowFadeMarket/ChallengeEscrow/SettlementManager/ProfileRegistry** | MEDIUM | LOW | Spec §10.8 is intentional — pause + redeploy is the v1 rollback. At $5K TVL, this is acceptable. | §10.8 explicit. | Document the redeploy migration playbook BEFORE mainnet (not after a bug). Pre-deploy: write the "we found a bug in FollowFadeMarket" script that pauses + reads all positions out + redeploys + helps users re-claim. |
| **Owner key compromise → pause + setTvlCap + force-settle + proxy admin all gone** | CRITICAL | LOW | PROJECT.md acknowledges single-owner-key blast radius. Spec promises multisig before v1.1 / >$5K TVL. | §10.8 + PROJECT.md operational model. | Multisig promotion has to be calendar-pinned. **Suggest: Safe (Arbitrum) deployment + ownership transfer in Phase 6 (safety review), NOT post-v1.1.** Cost is ~$50, gain is removing the single-key risk on day-one mainnet. |
| **`block.timestamp` vs Arbitrum sequencer time drift** | LOW | LOW | Arbitrum returns L2 sequencer time, not L1 time. The 250ms block + sequencer-set time means `block.timestamp` can jump backwards in rare reorgs (≤1 block at sequencer reset). | All timing gates use `block.timestamp` (callerExit 24h, position 4h, dispute 24h, force-settle 7d). | The spec's tolerances (24h, 7d) are wide enough to absorb ≤1s sequencer drift. Document in operator runbook: "Do not use block.timestamp for sub-second precision; expiry math is rounded to UTC day for duplicates and minute for cooldowns." Not a code change. |
| **`delegatecall` accidentally introduced via OZ proxy abstractions in a future PR** | HIGH | LOW | Spec §10.5 prohibits user-controlled delegatecall. OZ TransparentUpgradeableProxy uses delegatecall to a *contract-controlled* implementation — safe. | §10.5 explicit. | Add static-analysis CI check (slither + custom rule) that fails the build if `delegatecall` appears outside the proxy contracts. |

### 2. Oracle Pitfalls

| Pitfall | Severity | Likelihood | Why it happens | Spec mitigation | Recommended action |
|---|---|---|---|---|---|
| **Pyth feed ID wrong at deploy (rotated, deprecated, or copy-pasted)** | CRITICAL | MEDIUM | Pyth occasionally rotates IDs during feed upgrades (STACK.md flagged for POL/RENDER renames). Wrong ID = silent settlement against unrelated asset. | App.A.1 mandates pre-deploy verification per asset. | **AUTOMATE.** Pre-deploy script: for each (symbol, feedId) in CallRegistry's allowlist, fetch `hermes.pyth.network/v2/price_feeds?asset_type=crypto&query=<symbol>` and assert exact ID match. Fail deploy on mismatch. Add to §19.10 Sepolia gate checklist. |
| **Pyth confidence interval consistently wide on a long-tail allowlist coin (ezETH, RDNT)** | HIGH | MEDIUM | The 0.5% confidence threshold (§13.1) is calibrated for majors. Long-tail tokens may persistently exceed it, hitting 30-retry + 24h dispute window for every settlement. | §13.1 retry policy + STACK.md notes the long-tail risk. | Pre-launch: query Hermes 1-week confidence/price ratios for every allowlist asset. Any asset >0.3% median should be flagged in spec or removed from v1 allowlist. Operator runbook: monitor `SettlementDelayed` event counts per asset. |
| **Pyth update-VAA frontrunning** | LOW | LOW | Hermes-pulled VAA is included in the same multicall as `settle()` per ARCHITECTURE.md §3.3. Frontrunner can't substitute a different VAA without invalid signature. | Multicall atomicity. | Verify multicall pattern in SettlementManager. Sepolia test: try to sandwich a settle tx; confirm VAA verification fails. |
| **Pyth update-VAA cost (ETH fee) drains relayer at scale** | MEDIUM | MEDIUM | Each settle pays ~$0.01 ETH to Pyth. At 1000 settles/day, that's $10/day in addition to gas. | STACK.md notes ETH fee budget. | Operator runbook: monitor relayer ETH balance separately from USDC balance. Telegram alert at <0.01 ETH (≈ 100 settles capacity). Pre-deposit 0.5 ETH for hackathon. |
| **Pyth Hermes endpoint rate-limited or down** | HIGH | MEDIUM | STACK.md flagged Hermes is rate-limited under load. Single point of failure. | §13.1 retry policy buffers this. | Operator runbook addition: keep a backup Pyth Lazer / paid Hermes endpoint configured in relayer env; one config flip switches sources. |
| **NFT TWAP manipulation via wash-trade on Ethereum mainnet (OpenSea/LooksRare)** | HIGH | MEDIUM | Alchemy NFT API floor includes wash-trade listings. The 24h TWAP with ≥12 observations softens but does not eliminate. Cheap wash-trade on illiquid mid-tier collections could swing TWAP 5-15%. | §13.2 ≥12 observation gate; relayer sanity-check script. | Add wash-trade detection to relayer TWAP: drop any listing/sale from a wallet that has bought-and-sold the same token within 24h. Document in §13.2. Boundary test: simulate 5 wash trades, verify exclusion. |
| **Alchemy `getFloorPrice` returns stale cached value (5-min Alchemy cache)** | MEDIUM | LOW | Alchemy caches floor prices 5 min server-side. Spec polls 5 min — sometimes reads same value twice. | §13.2 observation count gates. | Acceptable. Document that "12 observations" may be ≤12 unique values; spec language is correct as written. |
| **DefiLlama API single-point-of-failure (free tier, no SLA)** | HIGH | MEDIUM | All TVL/Volume/Fees/APR calls depend on DefiLlama. DefiLlama outage = all DeFi-event-subtype calls stuck until 24h dispute window or force-settle. | §13.3 retry pattern (1 + 5min); §13.7 dispute window catches. | Operator runbook: cache DefiLlama responses 1h in Redis with `staleIfError` semantics. Alert on >2h since last successful fetch per endpoint. |
| **Snapshot proposal definition ambiguity (e.g. proposal text changes between expiry & resolution)** | MEDIUM | LOW | Snapshot proposals are off-chain mutable in some cases. Call references proposal ID; if proposal author edits text, resolution intent shifts. | §4.7 Resolution Criteria is advisory; structured fields win. | Document in operator runbook for owner dispute resolution: "Snapshot proposal text MUST be screenshotted at call publish time and stored in IPFS criteriaHash." Already implied by §4.7 but make it explicit ops. |
| **Tally GraphQL response diverges from direct RPC governor read** | MEDIUM | LOW | ARCHITECTURE.md §2.7 notes Tally can be read via GraphQL OR direct RPC. Different sources may report differently during a re-org. | §13.5 supports both. | Prefer direct RPC (no signature needed; cheaper trust). Use GraphQL only for proposal metadata, not state. Code: settlement reads governor contract `state(proposalId)` directly. |
| **CEX scraper structural-HTML changes (8 exchanges = 8 surfaces of failure)** | HIGH | HIGH (certain in 6mo) | Exchange announcement pages are HTML, not API. Each redesign breaks selectors. | §13.6 modular per-exchange; dispute window catches it. | **CRITICAL ops:** weekly synthetic test per exchange — scrape a known recent listing announcement; assert detected. CI cron job; alert on miss. **Maintain a spare token for each exchange** that has been listed but not added to Call It allowlist for synthetic testing. |
| **CEX scraper false-positive on similar-token announcement** ("Binance lists ABCX" matched by call "Binance lists ABC") | HIGH | MEDIUM | String matching is brittle. ABCX vs ABC, or "lists" vs "delists." | §4.4 allowlist precision; §13.6 evidence hash captures URL. | Require exact ticker match (case-insensitive but bounded by `^`/`$` anchors). Require keyword whitelist (`will be listed`, `is now trading`, `goes live`) + blacklist (`delisting`, `removed`, `suspended`). Sepolia test: feed scraper a fake similar-ticker announcement; assert NO match. |
| **forceSettle escape hatch abused for owner profit** | HIGH | LOW | Owner can `forceSettle(callId, outcome)` after 7d cooldown. If owner holds a position on a call, they have economic incentive to choose favorable outcome. | §12.4 emits both `CallForceSettled` AND `CallSettled` for loud audit trail. | **GAP.** Spec is silent on owner-conflict-of-interest. Recommend: owner self-exclusion — `require(call.caller != owner)` in `forceSettle`; owner cannot hold follow/fade positions on a force-settled call. Add public commitment: "owner will not participate in markets." Pin via on-chain `bannedFromMarkets[address]` mapping. |
| **forceSettle used before genuine retry exhaustion** | MEDIUM | LOW | Owner under time pressure may use forceSettle before 30-retry Pyth window completes for a call that hits the 7d cooldown right at the edge. | §12.4 7d cooldown; loud event emission. | Operator runbook: forceSettle decision matrix — only when (a) retry count >= 30, AND (b) dispute window expired without resolution, AND (c) ≥48h of public attempt to resolve. Owner posts public commitment 24h before forceSettle. |
| **Owner-resolved dispute = Polymarket/UMA-class governance attack surface (centralized variant)** | HIGH | MEDIUM | The March 2025 UMA Ukraine-mineral-deal incident: a single large UMA holder voted a wrong outcome through legitimate process. Call It v1 has the same structural vulnerability with the owner as the "voter" — lower velocity, higher accountability. | §13.7 owner-resolved in v1; multisig promotion before v1.1. | Public dispute-decision log (markdown in `/disputes/`); commit publicly within 24h of every owner resolution with reasoning. Multisig promotion is the structural fix; documentation is the v1 interim. |
| **NFT TWAP < 12 observations on a holiday weekend** | MEDIUM | MEDIUM | Blue-chip NFT volume drops on quiet days. CryptoPunks at 5am UTC Christmas may have <12 sales in 24h. | §13.2 routes to dispute window. | Acceptable behavior. Document in user-facing copy on the receipt: "NFT call may take up to 24h 30m to settle on low-liquidity days." |
| **Spread/vs call with both Pyth feeds — one wide, one tight** | MEDIUM | LOW | §13.1 spec: "If either fails confidence, treat the spread settlement as ambiguous." Correct semantics. | §13.1. | Verify in unit test: feed A 0.4% confidence, feed B 0.6% confidence → reverts `OracleDataAmbiguous`. |
| **Settlement attempts continue against a Pyth-deprecated feed indefinitely** | HIGH | MEDIUM | If Pyth deprecates an asset (e.g. POL/MATIC pattern), `getPriceNoOlderThan` will revert. 30 retries × 60s exhausts, then 24h dispute, then forceSettle. Same code path, but takes 7+ days. | §12.4 forceSettle at 7d covers eventually. | Operator runbook: subscribe to Pyth's feed-deprecation announcements (Twitter, Discord). Pre-empt by `removeAsset` on CallRegistry before deprecation date, preventing new calls; let in-flight calls run to forceSettle. |

### 3. Operational / Production Pitfalls

| Pitfall | Severity | Likelihood | Why it happens | Spec mitigation | Recommended action |
|---|---|---|---|---|---|
| **Single-owner-key compromise = total protocol seizure** | CRITICAL | LOW | PROJECT.md acknowledges; spec §10.8 promises multisig before v1.1. | §10.8. | **Move multisig to Phase 6 from v1.1.** Estimated effort 4h (Safe deployment + ownership transfer + test). Removes single-point-of-failure on day-one mainnet. |
| **Paymaster $50/day cap hit during demo / launch** | HIGH | HIGH | A successful product launch consumes faster than the cap. Each Privy OAuth signup uses 5 tx ≈ $0.50 paymaster spend → cap = ~100 new users/day. | §10.7 cap + Telegram alert. | Pre-launch: stage paymaster cap = $200/day for demo day + launch week. Document tune-down to $50 after week 1. Operator runbook addition. |
| **Privy embedded wallet OAuth-takeover at withdrawal moment** | HIGH | MEDIUM | Attacker compromises user's Google/Twitter account; logs into Privy; withdraws to attacker-controlled address. App.A.1 24h new-auth-link cooldown does NOT protect this path (original auth method, not new). | App.A.1: SIWE re-sign at withdrawal, 24h cooldown for new links. | **GAP.** Spec has no withdrawal-velocity throttle or large-withdrawal email-confirmation step. Add: address-book entry requires email + Telegram confirmation; withdrawals > $50 require 24h delay + email confirmation; settings → "withdrawal cool-down enabled" default ON. |
| **Privy v3 SDK breaking changes between dev and deploy** | MEDIUM | LOW | STACK.md notes v3 is post-2.0 breaking line. Privy ships breaking changes. Cargo of v3.27.0 → v3.28.0 in 48h before demo could break flow. | STACK.md pins `@privy-io/react-auth@3.27.0`. | Lock to exact version in `package.json`. Run `pnpm install --frozen-lockfile` in CI. Pre-demo: re-run full sign-in smoke test 48h before demo. |
| **Coinbase Onramp KYC handoff dead-end** | HIGH | MEDIUM | User clicks "fund with card" → Coinbase Onramp asks for KYC. If user doesn't complete (or country is blocked), they bounce. No fallback path in spec. | §19 Phase 1 includes Onramp; FEATURES.md notes direct USDC transfer as alternative. | UI fallback: if Onramp errors or returns to app without funding, show direct-USDC-transfer instructions (QR code + address) with prominence. Sepolia test the failure path. |
| **X API tier suddenly more expensive mid-build (Twitter has changed pricing twice since 2023)** | HIGH | HIGH | Twitter/X pricing has been volatile. Basic tier could double mid-hackathon. | STACK.md flagged X API cost. | Budget X API as variable cost. Architectural note: "From your X" feature is degradable — cache 1h → 24h → disable. Document in operator runbook. |
| **Mainnet USDC drift (CCTP routing, bridge unwind)** | LOW | LOW | Native USDC `0xaf88d065...` is stable; Circle has no announced deprecation. CCTP risk is for cross-chain; v1 is single-chain. | Spec hardcodes USDC; STACK.md verified. | No action. Document the hardcoded address as a sentinel that any future CCTP integration must respect. |
| **Sepolia → mainnet promotion env-var misconfig** (RPC URL points to Sepolia from mainnet UI) | CRITICAL | MEDIUM | Common mistake. Frontend deploys, but `NEXT_PUBLIC_CHAIN_ID=11155111` left in env → mainnet UI shows Sepolia state. Users sign Sepolia tx thinking it's mainnet. | §19.11 smoke test includes pause + balance checks. | **Add chain-mismatch banner.** Frontend reads `window.ethereum.chainId` and `process.env.NEXT_PUBLIC_CHAIN_ID`; if mismatch, red banner blocks UI. Also: deploy preview previews use Sepolia; main domain forces mainnet. |
| **Settlement stuck >25min — operator response time during off-hours** | HIGH | MEDIUM | §13.1 SLA: 30 minutes max retry. After 25min, operator should investigate. Solo operator may be asleep / unavailable. | §10.7 paymaster alert; spec implies settlement-stuck alert. | Operator runbook addition: 24/7 Telegram on-call (single person v1 = accept the lag); document expected response time at 1h instead of 25min for v1; surface in user-facing receipt page copy ("settles within 24h"). |
| **Dispute window flooding (3 counter-claims used by spammer to delay)** | MEDIUM | LOW | Per §13.8, 3 counter-claims max per call. Spammer files 3 garbage disputes ($15 total cost) to delay any single call's resolution. | §13.8 $5 bond + $2 reward for legitimate disputes. | Acceptable at v1 scale. The economics ($15 to delay a $100-cap call by 24h) are uneconomical. Document in operator runbook. Re-evaluate at v1.1 with reputation-gated dispute filing. |
| **Subgraph indexer downtime → feed empty for users** | HIGH | MEDIUM | The Graph Decentralized Network has indexers; individual indexer downtime is masked by query routing. Total subgraph deploy gap (48-72h post-publish) is real per STACK.md. | App.A.1: polled events fallback. | Operator runbook: confirm polled-events fallback is ACTIVE for first 48h after each subgraph version publish. Smoke test: kill subgraph API key, verify feed renders from polled events within 5s. |
| **Subgraph version migration breaks frontend queries silently** | HIGH | MEDIUM | New subgraph deploy with renamed fields → frontend GraphQL queries return null without error. | Implicit in The Graph workflow. | Use The Graph's "deploy then publish" pattern — preview on Studio for 24h, frontend test against preview endpoint, then publish. Add to §19.11 smoke test: query each subgraph entity at least once post-publish. |
| **Relayer Redis disk full → BullMQ jobs lost** | MEDIUM | MEDIUM | bullmq stores jobs in Redis. Free-tier Redis on Railway has 30MB ceiling. 1000 delayed Pyth retries each with payload may approach. | Implicit; spec mentions bullmq + redis. | Operator runbook: weekly Redis size check + alert at 80%. Use Redis 7 streams + persistence; budget Redis cluster $5/mo for production. |
| **Relayer process crash mid-attestation submission** (NFT TWAP signed but tx not submitted) | MEDIUM | MEDIUM | Crash between sign and submit means signed evidence is lost; retry would re-sign and submit fine. Idempotency at SettlementManager catches. | Implicit. | Make relayer idempotent: store `(callId, attestationType) → txHash` in Redis; on restart, query chain for existing tx before re-signing. Sepolia test: kill relayer during a settle; restart; assert no duplicate tx. |
| **Twitter auto-post fails silently for user (token expired, scope changed)** | MEDIUM | MEDIUM | Spec §15.2 advanced settings: auto-post default ON. If user's Twitter OAuth token expired, auto-post fails silently — user thinks they shared. | §15.2 implicit. | Show in-app toast on auto-post failure: "Auto-post failed — share manually?" with one-click manual share. Privy refresh-token flow. |
| **Demo seed wallets mixed with real-user wallets in feed** | LOW | MEDIUM | App.A.1: 10-15 demo seed calls pre-funded. If they're still LIVE at mainnet launch, they pollute the feed. | App.A.1 documents seed plan; no mainnet vs seed separation. | Operator runbook: tag seed wallets in subgraph; filter from public feed unless explicitly requested. Or settle all seed calls before mainnet announce. |

### 4. Build-Process Pitfalls

| Pitfall | Severity | Likelihood | Why it happens | Spec mitigation | Recommended action |
|---|---|---|---|---|---|
| **48h Stylus cutoff slips silently** (Rust path "almost works" past T-48h) | HIGH | HIGH | Founder/Engineer optimism bias. "Almost working" Stylus path absorbs more time than the Solidity baseline rewrite would. | §11.6 explicit 48h cutoff. | **HARD CUTOFF DISCIPLINE.** Calendar block T-48h: stop-or-switch decision is binary. Operator runbook: pre-write the `upgradeTo(solidityBaseline)` script BEFORE cutoff so the swap is mechanical at the deadline. Pre-stage the Solidity baseline in Phase 4 — not Phase 5. |
| **Rust + Solidity dual-implementation drift** | HIGH | HIGH | Two implementations of the same scoring formula. Updates to one not mirrored. | §11.6 try/catch fallback acknowledges drift acceptable. | Property-based fuzz test in Foundry: for every input (currentRep, conviction, consensusPct, isWinner, baseValue), assert `abs(stylusResult - solidityBaselineResult) <= tolerance`. Run on every PR. Solidity baseline IS a degraded variant per spec but tolerance must be documented. |
| **`^0.8.24` in pragma lets IR-bug versions in** | CRITICAL | HIGH | Cross-reference pitfall #1. | STACK.md flagged. | Lock to `pragma solidity =0.8.30;` exact in every file. CI lint to detect `^` in pragmas. |
| **Foundry vs Hardhat tooling mismatch** | LOW | LOW | Spec uses Foundry; STACK.md mentions Hardhat as optional. Two tools = two ways to deploy. | STACK.md says skip Hardhat unless needed. | Single-tool discipline: Foundry only. Document in README. |
| **Privy v3 migration gotchas — provider order matters** | HIGH | MEDIUM | STACK.md: PrivyProvider → QueryClientProvider → WagmiProvider order is load-bearing. Devs paste examples from v2 docs (provider order different). Embedded wallets won't appear in `useAccount()`. | STACK.md called out. | Inline comment in `app/providers.tsx`: "DO NOT CHANGE THIS ORDER — see STACK.md." Link to Privy v3 docs. CI check: file hash of providers.tsx in deploy comparison. |
| **wagmi v2 / @privy-io/wagmi version mismatch** | HIGH | MEDIUM | wagmi peer dep is `^2.x`. `@privy-io/wagmi@1.32.x` requires wagmi v2. Subtle peer-dep warnings during install ignored. | STACK.md pinned versions. | `pnpm install --frozen-lockfile` in CI. Use pnpm's strict peer-dep mode. CI fails on missing peers. |
| **OG card edge-runtime trap (Satori CSS Grid bug)** | HIGH | MEDIUM | Satori does NOT support `display: grid`. Falls back silently or renders wrong. | STACK.md flagged. | Inline comment in each card template: "FLEXBOX ONLY — Satori does not support grid." Add CSS lint rule for `display: grid` in OG card template directory. |
| **Next.js 16 server-component traps (PrivyProvider below `'use client'`)** | HIGH | HIGH | PrivyProvider is React Context — server components reject it. | STACK.md explicit. | `app/providers.tsx` first line `'use client';`. Document. Run smoke test on every PR that touches providers. |
| **Turborepo cache invalidation on monorepo deps changes** | MEDIUM | MEDIUM | Turbo caches by file hash. A change to `packages/contracts/Cargo.lock` may not invalidate frontend builds depending on the ABI. | Implicit. | Configure `turbo.json` `dependsOn: ["^build"]` with `outputs` and `inputs` listing ABI files. Document in monorepo README. |
| **pnpm v10 peerDependency strictness rejects valid configs** | MEDIUM | MEDIUM | pnpm 10 enforces peerDependency stricter than 9. A working `package.json` may fail install. | Implicit. | Pin pnpm to `10.x` in `packageManager` field. `.npmrc` with `auto-install-peers=true` AND `strict-peer-dependencies=false` for known-safe-conflict cases (document each). |
| **env-var leakage in turbo's pruned outputs** | HIGH | MEDIUM | Turbo prune for Docker builds may include `.env.local` in the pruned tarball. Private keys leak to Docker image. | Implicit. | `.dockerignore` and `.turboignore` include `.env*`. CI lint: scan built image for `PRIVATE_KEY` or `RELAYER_KEY` strings. Use cloud secret manager (Railway/Fly secrets) instead of `.env` for production. |
| **Foundry compiler version vs deploy environment mismatch** | HIGH | LOW | Local dev on solc 0.8.30; CI on 0.8.25 (Foundry pinned). | `foundry.toml` `solc = "0.8.30"` exact. | Add `solc-select` or commit `solc` binary version in CI. Verify on PR: `forge --version && solc --version`. |
| **CI doesn't run Sepolia integration tests** | HIGH | HIGH | Unit tests pass; Sepolia deploy fails on `forge create` because gas-estimation breaks. | §19.10 Sepolia gate but not in CI. | CI step: deploy to Anvil-forked-Sepolia weekly. Smoke test full happy path. Free-tier Alchemy RPC suffices. |
| **Static analysis (slither, mythril) not in CI** | HIGH | MEDIUM | Audit-readiness per §10.5 implies static analysis but spec doesn't mandate CI. | §10.5 audit-ready patterns. | Add slither + mythril to CI. Fail on HIGH/CRITICAL findings. Allow MEDIUM with comment justification. |
| **Subgraph build vs contract ABI drift** | HIGH | HIGH | Subgraph mapping uses event signatures from ABI. ABI changes → mapping breaks silently (event filter no longer matches). | Implicit. | Generate subgraph mapping types from contract ABI in CI (`graph codegen`). Run on every PR. CI fails if subgraph schema doesn't match contract events. |

### 5. Distribution / GTM Pitfalls

| Pitfall | Severity | Likelihood | Why it happens | Spec mitigation | Recommended action |
|---|---|---|---|---|---|
| **Twitter Card Validator caches forever per-URL** | HIGH | HIGH | Twitter caches OG metadata indefinitely (until manual re-scrape via Card Validator UI). First-share with broken card persists. | §19.11 smoke test. | Pre-launch: pre-warm Card Validator for canonical URL pattern (`/call/[id]`) by submitting test ID. Frontend: `og:url` includes hash of state to force re-scrape on settle (`?v=settled-{settledAt}`). Document in operator runbook. |
| **Farcaster Mini Apps spec churn (Frames v2 → Mini Apps rename)** | LOW | LOW | Per 2026 docs, Frames v2 rebranded to Mini Apps with 3-month deprecation notice. No breaking changes per Farcaster team. | §18.3 Frames Phase 8 (deferred). | Use `fc:frame` meta tag for compat. Track Farcaster announcements channel. Acceptable in v1. |
| **OG card preview cache-busting strategy** | HIGH | HIGH | Stale Live card persists post-settlement on Twitter, Discord, FB. | §16.6 fallback + state-change invalidation per ARCHITECTURE.md §2.7. | **GAP.** Spec describes CDN invalidation; doesn't describe Twitter/FB re-scrape. Two-layer: (1) CDN invalidation on state change, (2) `og:image` URL includes `?v={statusVersion}` parameter so social validators see new URL. |
| **Share-link Open Graph defaults wrong** (no `og:type=article`, missing `twitter:card=summary_large_image`) | HIGH | MEDIUM | Default Next.js metadata doesn't include all required OG fields. | §15.3 server-rendered meta. | Hardcoded meta block per receipt template. Smoke test with multiple validators (Twitter Card Validator, FB Sharing Debugger, LinkedIn Post Inspector) in §19.11. |
| **"From your X" cold-start when X API is rate-limited** | HIGH | MEDIUM | X API Basic tier has per-endpoint limits. First-time fetch of 1000+ followees may hit rate limit. | §9.9 1h cache; STACK.md degradation strategy. | Lazy: only fetch on user feed open. Background-fill subsequent users' caches at off-peak. Surface "Loading your network..." spinner with timeout fallback to global feed. |
| **Sponsored-campaign tax/regulatory exposure** | MEDIUM | LOW | §18.4 protocol-sponsored campaigns. Awarding USDC to winners may trigger 1099 / income reporting in US. | §18.4 mentions but not legal. | **GAP.** Recommend: ToS includes "winnings may be subject to local tax reporting; you are responsible." Operator runbook: do not exceed $600/year per winner without W-9 collection. Document for legal review before launch. |
| **US-jurisdiction prediction market regulatory pressure (CFTC, state-level)** | HIGH | MEDIUM | 2026 CFTC actively rulemaking on prediction markets (Polymarket banned in some US states pre-2025; Arizona criminal info vs Kalshi March 2026; CFTC suing Wisconsin). Call It is identity-tied USDC prediction = squarely in scope. | **SPEC IS SILENT.** | **GAP.** Spec has no jurisdiction-blocking, geo-IP, or ToS-acceptance flow. Recommend: (a) geo-IP block US visitors at frontend layer with bypass for VPN-detected (best-effort), (b) ToS click-through that includes "not for US persons in barred states," (c) document the regulatory position publicly. Acknowledge Call It is in a regulatory grey zone; document the call/decision. v1.1: full legal review. |
| **Twitter platform changes (handle changes, API deprecations)** | MEDIUM | MEDIUM | X has rebranded once; handles can change. Stored `twitterHandle` in ProfileRegistry becomes stale. | §9.4 verification proof at link-time. | Re-verify Twitter linking periodically (90d). Stale handle still shows badge but with re-verify CTA. Surface to user. |
| **Farcaster network split / Warpcast deprecation** | LOW | LOW | Farcaster is small; Warpcast is the dominant client. Single-client risk. | §9.3, §18.3 implies Farcaster optional. | Acceptable v1 risk. Document fallback: Farcaster linking optional; Twitter is primary social proof. |
| **Sponsored campaign winners cluster from sybil pools (paying real users)** | MEDIUM | MEDIUM | $1K sponsored prize attracts coordinated farming. | §18.4 unspecified gating. | Tie sponsored campaigns to reputation threshold (e.g. "must have settled ≥5 calls before participating"). Operator config. Add to v1.1 spec gap list. |
| **Receipt URL guessable (`/call/[id]` is sequential int)** | LOW | LOW | Sequential IDs enable enumeration. Not a privacy issue (calls are public) but vector for scraping. | §11.1 uses `nextCallId` counter. | Acceptable for v1. Optionally add slug (`/call/{id}-{title-slug}`) for SEO. |

### 6. Identity / Reputation Pitfalls

(Cross-reference: FEATURES.md "Reputation Farming Attack Surface" already covered the primary attack matrix. This section adds only NEW failure modes not covered there.)

| Pitfall | Severity | Likelihood | Why it happens | Spec mitigation | Recommended action |
|---|---|---|---|---|---|
| **Wash-trade own call via sybil-fade to defeat cold-start** | MEDIUM | MEDIUM | See FEATURES.md §"Reputation Farming Attack Surface". | Observability-only in v1; P2 dashboard item. | Cross-reference — no new action. |
| **Cold-start gaming via low-conviction calls to build settled-count toward high-conviction unlock** | LOW | MEDIUM | High-conviction floor requires 10 settled calls (§6.3). Sybil grinds 10 obvious low-stake calls. | Cold-start 25% rep adjustment + min $5 stake. | Acceptable economic cost (~$50 + 10 settlements). Document in metric watchlist: "% of high-conviction-eligible accounts that reached 10 settled via low-conviction trivial calls." |
| **Duel King badge farming via puppet wallets** | MEDIUM | MEDIUM | FEATURES.md mentions self-challenge ban; opens room for two-wallet pair where one always loses to feed the other's streak. | §12.3 self-challenge ban; both parties move rep ~1.5×. | Already addressed in FEATURES.md. Add metric: Duel King badge holders with abnormal opponent-overlap (>30% repeat opponent over 7d streak) → flag. |
| **Reputation laundering through account sale** | MEDIUM | LOW | OAuth-linked account sold to highest bidder; buyer inherits rep. | App.A.1 24h cooldown on new auth link + SIWE re-sign at withdrawal. | Sufficient for v1 ($100/call cap limits damage). Document: handle-change pattern (within 7d of any rep milestone) is a flag in ops dashboard. |
| **Coordinated contrarian groups** (5 callers all fade a market, 1 wins) | LOW | LOW | Contrarian multiplier rewards "lonely winners." If 5 fade, contrarian effect dilutes — designed-as. | §7.3 contrarian formula. | Sufficient by formula design. |
| **OAuth account-takeover at withdrawal moment** (extension of pitfall #6) | HIGH | MEDIUM | See pitfall #6 in TL;DR. Privy itself is not the weak link — the user's underlying OAuth provider is. | App.A.1 partial coverage. | **GAP.** See Operational #3. Add: large-withdrawal email confirmation; address-book entry requires email + Telegram dual-factor; daily withdrawal cap. |
| **Multi-auth-link race conditions** (link Twitter + immediately try to withdraw) | MEDIUM | LOW | If 24h cooldown enforcement is client-side or weak server-side, race window. | App.A.1 24h cooldown documented. | Enforce in relayer signed-message verification: `now < linkedAt + 24h` is a hard reject on withdrawal signing. Server is source of truth, never trust client. Unit test the race. |
| **Anonymous Twitter handle linking to anonymous wallet — undermines identity-first thesis** | LOW | LOW | Spec is identity-first but Twitter handle can be anonymous (`@cryptopepe_42`). The "person-first" promise weakens when the person is anon. | §9.4 VERIFIED badge is provenance, not real-name. | Acceptable. Distinguishes from Polymarket's full anonymity by binding *some* persistent identity. Document in product copy. |
| **VERIFIED · X badge displayed for a deleted/suspended Twitter account** | MEDIUM | LOW | Twitter suspends; badge still shows in Call It UI. | §9.4 verification at link-time. | 90d re-verify (see GTM pitfall above). On 90d re-verify failure, downgrade badge to "PENDING RE-VERIFY." |
| **Profile handle squatting** (early users register famous handles before owners join) | MEDIUM | MEDIUM | Spec ties handle to first-claimer; no real-world claim arbitration. | §9.4 verification proof prevents impersonation. | Acceptable in v1 with VERIFIED · X badge as authoritative signal. Operator runbook: reserved-handle list for top 100 CT accounts pre-launch. |

### 7. Hackathon-Specific Pitfalls (Demo Day Failure Modes)

| Pitfall | Severity | Likelihood | Why it happens | Spec mitigation | Recommended action |
|---|---|---|---|---|---|
| **Stylus contract reverts in front of judges** | CRITICAL | MEDIUM | Stylus is alpha-ish per STACK.md. Demo-time spike, ABI mismatch, gas-budget overshoot — any could revert. | §11.6 runtime fallback to Solidity baseline. | Test the fallback explicitly in §19.11 smoke test (already partial). Demo-day: rehearse the explanation if fallback fires ("graceful degradation — that's the production safety pattern"). |
| **Settlement stuck during demo because Pyth confidence wide on a meme coin** | HIGH | MEDIUM | Demo calls on PEPE / WIF / BONK during demo hour — meme volatility may trigger 0.5% confidence threshold. | §13.1 retry policy. | Demo seed plan (App.A.1): pre-select demo calls on BTC/ETH/SOL only. Avoid memes during demo. Pre-settle 1-2 high-conviction wins before demo as anchors. |
| **OG card 404 because cache cold** | HIGH | MEDIUM | First share of demo call = cache miss. Fallback card serves "A Call Was Made" instead of branded variant. | §16.6 fallback. | Pre-warm OG cache for all 10-15 demo seed calls + all 5 variants at demo start. Add to demo runbook. |
| **Gas-payment failure because paymaster cap hit during high-traffic demo** | CRITICAL | HIGH | $50/day cap = ~100 sponsored signups. A successful demo with judges browsing live + tweeting it = could exhaust. | §10.7. | Elevate cap to $300 for demo day (operator runbook). |
| **RPC rate-limit during demo screencast** | HIGH | MEDIUM | Alchemy free-tier 330 req/sec across all UI viewers. Live demo with 50 simultaneous browsers may hit. | Implicit Alchemy tier. | Pre-warm: ensure paid tier or upgrade for demo week. Cache aggressively (5s polling per ARCHITECTURE.md). |
| **Subgraph behind — feed empty at demo** | HIGH | MEDIUM | Subgraph indexer slow under demo-time event burst. | App.A.1 polled-events fallback. | Verify fallback ACTIVE 24h before demo. Smoke test by stopping subgraph queries; confirm polled mode renders. |
| **Demo wallet runs out of test USDC mid-demo** | MEDIUM | MEDIUM | Demo seeds need funding; if not pre-funded sufficiently, mid-demo failure. | App.A.1 demo seed plan. | Pre-fund 2× expected demo spend across 5 demo wallets. Operator demo runbook line item. |
| **Mainnet promotion bug (env-var) at demo deploy** | CRITICAL | MEDIUM | Demo day = high-stress = deploy mistakes. | §19.11 smoke test 20min. | Run §19.11 SEPARATELY from demo: deploy 24h before demo, smoke test, run for 24h. Demo uses the warm deploy. |
| **Stylus build broke on a CI re-build** | HIGH | MEDIUM | A `cargo update` overnight before demo pulls a breaking transitive dep. | Implicit. | `cargo --locked` in CI. Lock files committed. No `cargo update` in 72h pre-demo. |
| **Live demo of caller exit — animation glitches** | MEDIUM | LOW | §17.2 stamp animation depends on browser rendering — may judder on judge's screen. | §17.2. | Test on demo machine + projector. Have video backup of caller exit broadcast. |
| **Twitter Card Validator stale on demo URL** | HIGH | MEDIUM | Pre-demo testing scrapes the share URL with a Live card. Demo: settle, share — Twitter shows old Live card cached forever. | §19.11. | Demo runbook: only use share URLs for calls created in the same session (no pre-cache). Or: change URL parameter per settlement state (`?v=settled-{ts}`). |
| **Cold-start: empty leaderboard, empty feed** | HIGH | HIGH | Mainnet day 1 has no real activity. App looks dead. | §18.4 sponsored campaigns. App.A.1 demo seed plan. | Pre-seed 50+ calls across diverse states (live, settled, exited, dueled) BEFORE mainnet announce. Document seed wallet identities transparently. |
| **"Live activity feed" empty on every receipt page at launch** | MEDIUM | HIGH | New product, low traffic. Activity feed empty per call. | §15.3. | Pre-seed: every seed call has 1-3 seed follows/fades. Use friends-and-family $$ to seed. Document in launch runbook. |

---

## Critical Path Risk Map

Overlay of FEATURES.md's 9-step receipt/share loop with deepened failure modes per step. Cross-reference FEATURES.md "What breaks the loop" table — this extends and replaces with more depth.

| Step | Loop action | Failure modes (extended) | Severity if break | Spec mitigation depth |
|------|-------------|--------------------------|-------------------|----------------------|
| **1. Sign-up** | Privy OAuth + embedded wallet | (a) Privy v3 breaking change (build pitfall #5), (b) Google/Twitter OAuth API outage, (c) Privy itself outage, (d) Privy provider order misconfig (build pitfall #5), (e) OAuth account-takeover at signup (no email verification gate yet) | HIGH | Three sign-in paths mitigate (a)(b)(c); STACK.md mitigates (d); GAP for (e). |
| **2. Fund** | Coinbase Onramp OR direct USDC | (a) Onramp KYC dead-end (ops pitfall #5), (b) user copies wrong network address, (c) USDC.e accidentally sent (wrong USDC), (d) wallet shows wrong chain (env-var pitfall #8) | HIGH | Direct USDC fallback for (a); QR code + address copy with chain label for (b); STACK.md "what not to use" for (c); chain-mismatch banner needed for (d). |
| **3. Paymaster** | Gas sponsored for first 5 tx | (a) Daily cap hit (ops pitfall #2), (b) per-account 5-tx exhausted unexpectedly (paymaster bypass attack), (c) paymaster signer key compromised, (d) Alchemy AA bundler outage | CRITICAL | §10.7 caps + alerts mitigate (a); careful counter for (b); GAP for (c) key rotation; AA bundler is single point of failure — flag as v1.1 fix. |
| **4. Compose call** | Form validates, allowlist, conviction, criteria | (a) Allowlist drift (asset removed mid-session), (b) Pyth feed deprecated (oracle pitfall #19), (c) duplicate hash collision at UTC midnight, (d) conviction slider precision (84 vs 85 boundary), (e) IPFS upload fails for reasoning text | MEDIUM | All present in §12.1; (e) needs fallback (store on-chain if IPFS fails — costs gas but safer). |
| **5. Publish call** | `CallRegistry.createCall` succeeds | (a) USDC allowance insufficient (in-app guidance), (b) TVL cap reached, (c) stake limit, (d) min-stake floor, (e) gas estimation off due to slow RPC, (f) tx pending too long, user retries → double-publish | HIGH | §12.1 covers (a)-(d); (e) needs retry UX; (f) needs idempotency at UI level (debounce; show pending state). |
| **6. Live receipt renders** | `/call/[id]` loads + OG card | (a) Subgraph behind (ops pitfall #11), (b) polled-events fallback slow on Alchemy throttle (hack pitfall #5), (c) OG service cold-start latency, (d) IPFS gateway down for reasoning fetch, (e) live activity feed empty looks broken (hack pitfall #13) | HIGH | App.A.1 fallback for (a)(b); §16.6 for (c); IPFS Pinata + fallback gateway for (d); pre-seed activity for (e). |
| **7. Settlement** | Oracle resolves, rep updates | (a) Pyth confidence wide (oracle #2), (b) NFT TWAP <12 obs (oracle #16), (c) DefiLlama outage (oracle #8), (d) Stylus revert at runtime (build #2), (e) Relayer process down at expiry, (f) Force-settle wrong outcome (oracle #13), (g) Owner-resolved dispute conflict-of-interest (oracle #15) | CRITICAL | §13.1 retry + dispute path + force-settle; §11.6 try/catch fallback for (d); GAP for (e) — need warm-standby relayer or permissionless settle UI button; GAP for (f)(g). |
| **8. Settled receipt renders** | Same URL flips to Settled state | (a) OG card not regenerated (cache invalidation race), (b) Twitter Card Validator caches Live forever (GTM #1), (c) outcome word fails 200px-viewport readability (§15.7 QA), (d) stamp animation broken on first-paint | HIGH | §16.6 fallback for (a); GAP for (b) cache-busting strategy; §15.7 explicit QA gate for (c); (d) needs server-render fallback for screencap. |
| **9. Share to X / Farcaster** | Share button + auto-post | (a) Twitter OAuth token expired (ops #15), (b) auto-post default-on but user revoked Twitter perms, (c) Farcaster mini-app spec churn (GTM #2), (d) share URL has tracking parameters that break OG meta | HIGH | (a)(b) need failure toast + manual share fallback; (c) low-risk per Farcaster team's deprecation policy; (d) audit share URL builder, strip params. |
| **10. New user loops back** | Click receipt → sign-up | (a) Receipt page requires auth (regression risk), (b) sign-in CTA invisible to unauthenticated viewer, (c) signed-out state of receipt page broken | HIGH | §18.1 public-by-default. Test the signed-out state in §19.11 smoke test. |

---

## Spec Gaps Identified

Honest list of pitfalls where the spec has **no current mitigation**. Each gets a recommendation. Where the spec is genuinely solid, gaps are NOT invented.

### CRITICAL Gaps (block mainnet promotion without fix)

1. **Relayer signer key storage, rotation, and per-attestation-type separation.** ARCHITECTURE.md §5 identifies relayer as biggest trust boundary; spec §10.7/§13.x says "bounded by TVL cap" but never specifies HSM/KMS storage, rotation cadence, or one-key-per-attestation-type. **Recommendation:** AWS KMS (or Fly.io secret store) for relayer key; rotate every 90d; separate keys for (NFT TWAP, DefiLlama, CEX, Snapshot, ProfileRegistry social linking) so one compromise doesn't authorize all surfaces.

2. **Owner conflict-of-interest in `forceSettle`.** Spec §12.4 lets owner choose outcome unilaterally after 7d. No on-chain prohibition on owner holding positions on force-settled calls. **Recommendation:** `bannedFromMarkets[address]` mapping that includes `owner` by default; `forceSettle` requires `bannedFromMarkets[call.caller] || msg.sender == owner` (owner cannot force-settle their own call); operator public commitment.

3. **EIP-712 domain separator for relayer attestations.** Spec §13.2-§13.6 describes relayer signing but doesn't specify chainId-bound EIP-712 format. **Recommendation:** all relayer-signed payloads use EIP-712 with `chainId` in domain. Sepolia signatures CANNOT replay on mainnet.

4. **Solidity pragma `^0.8.24` floats into IR bug range.** STACK.md flagged. **Recommendation:** Pin `=0.8.30` in `foundry.toml` AND in every contract pragma. CI lint to reject `^` in pragmas.

### HIGH Gaps (need operator runbook entry or v1.1 fix)

5. **Stylus 365-day reactivation cadence.** Spec §10.8 covers proxy but doesn't mandate reactivation alerting. **Recommendation:** Telegram alerts at T-30d, T-15d, T-7d, T-1d before expiry. Operator runbook entry.

6. **OG card cache-busting on settlement.** §16.6 mentions fallback but not cross-platform cache invalidation. **Recommendation:** `og:image` URL includes `?v={statusVersion}` (e.g. `?v=settled-{settledAt}`). Twitter/FB/Discord see new URL post-settlement, re-fetch.

7. **Large-withdrawal velocity controls.** App.A.1 covers 24h cooldown for new auth links and SIWE re-sign, but no daily withdrawal cap or large-withdrawal email confirmation. **Recommendation:** v1: opt-in withdrawal-cooldown setting (default ON for OAuth wallets); v1.1: hardcoded daily withdrawal cap with email confirmation override.

8. **US-jurisdiction regulatory exposure.** Spec is silent on CFTC / state-level prediction-market regulation. Per 2026 CFTC rulemaking + Arizona criminal info vs Kalshi + Wisconsin lawsuit + Polymarket state cease-and-desists, this is real risk. **Recommendation:** ToS click-through ("not for US persons in barred states"); geo-IP block (best-effort, bypassable); document the regulatory position publicly; full legal review in v1.1.

9. **CEX scraper synthetic monitoring.** §13.6 modular scrapers + dispute window — but no proactive scraper-health check. **Recommendation:** weekly CI job: scrape a known recent listing announcement per exchange; assert detected; alert on miss.

10. **Pyth feed verification automation at deploy.** App.A.1 mandates verification but no automated tooling. **Recommendation:** Pre-deploy script in CI: for each allowlist asset, fetch Hermes and assert exact feedId match. Fail deploy.

11. **Solidity-baseline vs Stylus parity testing.** §11.6 acknowledges Solidity baseline is degraded; no test ensures they don't diverge catastrophically. **Recommendation:** Foundry property fuzz: for every input range, assert `abs(stylusResult - solidityBaselineResult) < tolerance`. Document acceptable tolerance.

12. **Auto-post-to-X failure UX.** §15.2 advanced settings default-on auto-post; silent failure on revoked OAuth. **Recommendation:** failure toast + one-click manual share fallback.

13. **Chain-mismatch banner on frontend.** Common Sepolia/mainnet env-var bug; spec is silent. **Recommendation:** Red blocking banner if `window.ethereum.chainId !== process.env.NEXT_PUBLIC_CHAIN_ID`.

14. **Multisig promotion timing.** Spec says "before v1.1 / >$5K TVL." **Recommendation:** Move to Phase 6 (safety review), not v1.1. 4h effort. Removes day-one single-key risk.

### MEDIUM Gaps (document, not blocking)

15. **Subgraph version migration safety.** New deploys can break frontend queries silently. **Recommendation:** Deploy-then-publish pattern; frontend tests against preview before publish.

16. **Reserved-handle list for top 100 CT accounts.** Squatting risk for famous handles. **Recommendation:** Pre-launch operator list; reject claims; allow real owner to claim via VERIFIED · X.

17. **Demo wallet vs production wallet separation in feed.** Seed calls pollute public feed. **Recommendation:** Tag seed wallets in subgraph schema; filter from default feed view.

18. **Per-user paymaster `subjectId` collision verification.** Privy may issue different `subjectId` for the same human via different OAuth paths. **Recommendation:** Verify Privy-side behavior; fall back to IP + device-fingerprint heuristic if collision detected.

### Where Spec is Solid (no gap)

- **CEI pattern + ReentrancyGuard on USDC paths** (§10.5) — explicit and correct.
- **Settlement atomicity** (§12.4 14 steps) — locked and rigorous.
- **Idempotency of `settle`, `claimPayout`, `acceptChallenge`** (§12.x) — explicit.
- **Force-settle 7d cooldown + dual event emission** (§12.4) — appropriately loud.
- **TVL cap + per-call stake cap + emergency pause carve-out** (§10.1-§10.3) — production-grade.
- **Sepolia staging gate ≥48h** (§19.10) — non-optional, appropriately rigorous.
- **20-min post-deploy smoke test checklist** (§19.11) — comprehensive.
- **Three sign-in paths as redundancy** (§9.1) — correct architectural choice.
- **24h dispute window + $5 bond + max 3 counter-claims** (§13.8) — bounded spam attack surface.
- **High-conviction floor + cold-start adjustment + duplicate hash + min stake** (§6.1-§6.3) — four-gate defense is genuinely strong.

---

## Pre-Mainnet Checklist Adds (extends §19.10 + §19.11)

### Additions to §19.10 Sepolia Staging Gate

- [ ] Solidity pragma audit: every contract pinned to `=0.8.30` exact; no `^` anywhere.
- [ ] Reproducible build hash: contract bytecode hash matches across 3 fresh CI builds.
- [ ] Static analysis (slither + mythril) passes; HIGH/CRITICAL findings resolved or justified.
- [ ] Pyth feed ID automated verification: every (symbol, feedId) in allowlist matches Hermes API at moment of script run.
- [ ] EIP-712 domain separator verified on all relayer-signed payloads; Sepolia-signed message rejected by mainnet contract (negative test).
- [ ] Relayer signer keys stored in KMS/secret manager (NOT in env files); key rotation procedure documented.
- [ ] Stylus reactivation date logged; calendar alert configured for 30d/15d/7d/1d pre-expiry.
- [ ] Multisig deployed and owner role transferred (don't wait for v1.1).
- [ ] Owner self-exclusion mapping deployed (`bannedFromMarkets[owner] = true`).
- [ ] Stylus ↔ Solidity baseline parity fuzz test passes within tolerance for 10K random inputs.
- [ ] CEX scrapers tested against known recent listing announcement (one synthetic test per of 8 exchanges).
- [ ] Subgraph deploys to Studio; preview endpoint tested; published to Decentralized Network; first 1000 events indexed; polled-events fallback verified active for 48h.
- [ ] OG card cache-busting URL pattern verified: Live URL ≠ Settled URL (different `?v=` parameter).
- [ ] Chain-mismatch banner verified: switch wallet to Sepolia while frontend points to mainnet → banner appears, UI blocked.
- [ ] Privy v3 sign-in regression test: all 3 paths complete in <60s on staging.
- [ ] ToS click-through screen functional; geo-IP block enforced for barred states (best-effort).

### Additions to §19.11 Post-Deploy Smoke Test

- [ ] Verify chain ID = 42161 (Arbitrum One) on frontend; chain-mismatch banner not showing.
- [ ] Verify hardcoded USDC address = `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` via cast call to contracts.
- [ ] Verify Pyth contract address = `0xff1a0f4744e8582DF1aE09D5611b887B6a12925C`.
- [ ] Verify relayer signer address matches expected; key rotation procedure dry-run.
- [ ] Owner self-exclusion: confirm `bannedFromMarkets[owner] == true`.
- [ ] Multisig owner: confirm `owner()` returns Safe address, not EOA.
- [ ] First synthetic Pyth update VAA pull + push succeeds (BTC/USD); cost recorded.
- [ ] Pre-warm OG cache for canonical test URL: GET `api.callitapp.xyz/og/test` returns 200 with branded card.
- [ ] Twitter Card Validator: paste test URL; verify Settled card renders; verify cache-busting parameter respected.
- [ ] FB Sharing Debugger: paste test URL; verify card renders.
- [ ] Synthetic CEX scraper test: feed known recent listing announcement; verify detected.
- [ ] Subgraph query: confirm at least 1 event indexed; latency < 60s from on-chain emission.
- [ ] Alert wiring: trigger a synthetic `SettlementDelayed` event; confirm Telegram alert fires.
- [ ] Paymaster cap elevated to $300/day for launch week (operator runbook); cap auto-reverts to $50 after 7d.
- [ ] First settle on a test BTC call completes within 5min; outcome word renders correctly at 200px on share preview.

---

## Operator Runbook Adds (extends §10.7 / §12.4 implied runbooks)

### Settlement Stuck

- **Trigger:** `SettlementDelayed` retry count > 5 (alert), > 25 (escalate), > 30 (24h dispute window opened).
- **Action at >5 retries:** check Pyth Hermes status page; check confidence intervals on Pyth UI; if asset-wide issue, accept retry; if specific to call, screenshot for dispute evidence.
- **Action at >30 retries:** dispute window opens. Notify caller via in-app. Prepare oracle-source-evidence package for self-disputing if obviously stuck.
- **Action at expiry + 7d:** `forceSettle` decision. **Mandatory:** 24h public commitment (Twitter + Discord) of intended outcome before invoking; cite oracle evidence; cite owner-exclusion check passes; invoke with mainnet sign-off.

### Paymaster Cap

- **Trigger:** Telegram alert at 80% of daily cap.
- **Action at 80%:** verify legitimate demand (not attack); if legitimate, raise cap via `setPaymasterDailyCap`; if abuse, set cap to $0 immediately and investigate.
- **Action at 100%:** UI auto-routes new users to "fund your wallet" flow; verify message renders correctly. Operator decides whether to raise cap or accept the cliff.
- **Demo day variant:** elevate cap to $300/day 24h pre-demo; revert 24h post-demo.

### Dispute Spam (3-counter-claim cap hit)

- **Trigger:** `DisputeRaised` event count for single callId > 3.
- **Action:** dispute window auto-closes per §13.8. Owner resolves the third dispute (final). Document decision in `/disputes/{callId}.md` with reasoning + on-chain tx hash.

### Force-Settle Decision

- **Trigger:** call has been Live > expiry + 7d AND dispute window expired without owner resolution.
- **Pre-decision checklist:**
  - [ ] Pyth retry count exhausted (>30).
  - [ ] Dispute window expired (>24h since first auto-resolution attempt).
  - [ ] Public commitment posted 24h prior (Twitter + Discord) with intended outcome + evidence.
  - [ ] Owner-exclusion: confirm owner has no follow/fade position on the call (`getPosition(callId, owner) == 0` on both sides).
  - [ ] Oracle evidence package archived (Pyth screenshots, DefiLlama snapshots, etc.).
- **Action:** invoke `forceSettle(callId, outcome)`. Verify both `CallForceSettled` and `CallSettled` emitted. Post public confirmation with tx hash.
- **Post-action:** add to `/forced-settlements.md` log with reasoning, evidence, decision.

### Relayer Key Compromise (suspected)

- **Trigger:** unauthorized signed attestation submitted, unexpected social linking, unusual NFT TWAP value.
- **Action:**
  - [ ] `pause()` immediately.
  - [ ] Rotate relayer key via `setRelayer(newAddress)` on ProfileRegistry + SettlementManager.
  - [ ] Audit submitted attestations in past 7d for anomalies.
  - [ ] `unpause()` only after new key deployed across all backend services.
- **Post-incident:** public post-mortem within 72h.

### Stylus Reactivation

- **Trigger:** T-30d before expiry (alert), T-7d (escalate), T-1d (mandatory action).
- **Action:** `cargo stylus activate --address <stylus-impl>` on mainnet. Verify on Arbiscan that activation succeeded. Update `stylusDeployedAt` env var to new timestamp.

### Subgraph Migration

- **Trigger:** new subgraph version ready to publish.
- **Action:**
  - [ ] Deploy to Studio; let it sync to current block.
  - [ ] Configure frontend to query Studio endpoint via feature flag.
  - [ ] Run §19.11 read-path smoke tests against Studio endpoint.
  - [ ] Publish to Decentralized Network.
  - [ ] Activate polled-events fallback for 48h.
  - [ ] Cut over frontend to Decentralized Network endpoint.
  - [ ] Deactivate polled-events fallback after 72h confirmation.

---

## Confidence Assessment

| Area | Confidence | Why |
|------|-----------|-----|
| **Solidity-side pitfalls** | HIGH | Well-documented 2026 attack landscape; spec §10.5 already aligns with audit-ready patterns; gaps are mechanical (pragma pin, EIP-712). |
| **Stylus-side pitfalls** | MEDIUM | Stylus is younger; iosiro Stylus DoS bounty (Sep 2024) shows real attack surface exists; expiry behavior is documented but operator runbook needed; alpha-line OZ crate adds risk. |
| **Oracle pitfalls** | HIGH | Polymarket/UMA March 2025 incident is the canonical attack; Pyth confidence behavior well-documented; NFT TWAP wash-trade is a known DeFi attack class. |
| **Privy + OAuth pitfalls** | MEDIUM | No specific 2025/2026 Privy CVE found in WebSearch (Privy was acquired by Stripe in June 2025); reasoning from generic OAuth + embedded-wallet pattern. Real but not catastrophic at $100/call cap. |
| **Regulatory pitfalls** | MEDIUM | CFTC actively rulemaking in 2026; state-level enforcement active (Arizona vs Kalshi, NJ injunction, Wisconsin); Call It's position is ambiguous (identity-tied but not KYC'd, USDC but on Arbitrum). HONEST about uncertainty here. |
| **Build/CI pitfalls** | HIGH | Standard Next.js + Foundry + Stylus pipeline; failure modes are well-trodden; STACK.md already pinned versions. |
| **Hackathon-demo pitfalls** | HIGH | Standard demo-day failure modes; mitigations are operational (pre-warming, elevated caps). |

---

## Open Questions for Downstream Research

These are gaps this research could not resolve. Phase research must address:

1. **Privy-specific `subjectId` collision behavior** — do same-OAuth-account paths produce same DID? Test in Phase 1.
2. **Real-world Pyth confidence behavior on each long-tail allowlist asset** — pull 1-week confidence histograms in Phase 4 to validate 0.5% threshold per asset.
3. **Stylus on mainnet vs Sepolia gas-cost parity** — STACK.md notes Stylus is "marginally cheaper" for simple math; verify before pitching judges.
4. **CFTC final rule timing** — public comment period closed April 2026; final rule could land mid-build. Monitor `cftc.gov`.
5. **Arbitrum sequencer time stability** — is L2 time monotonic in all known scenarios? Verify in Phase 6 boundary testing.
6. **The Graph Decentralized Network query latency under load** — STACK.md mentions 100K queries/month free. Verify p99 latency for feed queries under demo-day load.
7. **Twitter Card Validator + Discord embed cache TTL behavior** — empirically verify the cache-busting strategy works pre-launch.
8. **Privy paymaster signer key rotation procedure** — Privy documentation on this is sparse. Privy support ticket in Phase 1.
9. **DefiLlama "Standard" rate limits in practice** — STACK.md says generous; verify under settle-cron load.
10. **OZ Stylus crate alpha-line API stability between research date and demo** — re-check `openzeppelin-stylus` releases pre-Phase 5.

---

## Sources

- [Polymarket UMA governance attack — Ukraine mineral deal (March 2025)](https://www.theblock.co/post/348171/polymarket-says-governance-attack-by-uma-whale-to-hijack-a-bets-resolution-is-unprecedented) — HIGH (direct analog to §13.7 owner-resolved dispute risk)
- [Polymarket Oracle Manipulation analysis (Orochi Network, 2025)](https://orochi.network/blog/oracle-manipulation-in-polymarket-2025) — HIGH (incident class taxonomy)
- [Arbitrum Stylus Invalid Import DoS — iosiro $80K bounty (Sep 2024)](https://iosiro.com/blog/arbitrum-stylus-invalid-import-denial-of-service) — HIGH (confirms Stylus attack surface is real and rated High by Arbitrum Foundation)
- [Arbitrum Stylus Trail of Bits Security Assessment (June 2024)](https://docs.arbitrum.io/assets/files/2024_06_10_trail_of_bits_security_audit_stylus-f2f68cbe59f5ac1c085292f6811c8ac9.pdf) — HIGH (Stylus production audit baseline)
- [CFTC plans new rules for prediction markets (Bloomberg, Jan 2026)](https://www.bloomberg.com/news/articles/2026-01-29/cftc-to-craft-new-rules-for-prediction-markets-chairman-says) — HIGH (regulatory landscape baseline)
- [Norton Rose Fulbright — Prediction markets at a crossroads (2026)](https://www.nortonrosefulbright.com/en-us/knowledge/publications/ad8a494a/prediction-markets-at-a-crossroads-preemption-enforcement-and-rulemaking) — HIGH (legal analysis)
- [Pyth Network Best Practices](https://docs.pyth.network/price-feeds/best-practices) — HIGH (confidence interval handling guidance)
- [Privy 2026 Review — embedded wallet UX, auth flows, risks](https://cryptoadventure.com/privy-review-2026-embedded-wallet-ux-authentication-flows-and-risks/) — MEDIUM (general Privy risk overview)
- [Privy Security docs](https://docs.privy.io/guide/security/) — HIGH (Privy's own threat model)
- [Farcaster Frames v2 → Mini Apps rename (official docs)](https://docs.farcaster.xyz/reference/frames-redirect) — HIGH (deprecation policy: 3-month notice, no breaking changes)
- [Solidity 0.8.34 release announcement (IR bug fix)](https://www.soliditylang.org/blog/2026/02/18/solidity-0.8.34-release-announcement/) — HIGH (cross-reference STACK.md)
- [Arbitrum Stylus reactivation (gentle introduction)](https://docs.arbitrum.io/stylus/gentle-introduction) — HIGH (365-day reactivation requirement)
- [Smart Contract Security Audit Checklist (47 vulnerabilities, 2026)](https://medium.com/@marcellusv2/the-complete-smart-contract-security-audit-checklist-47-vulnerabilities-i-check-before-any-c565848b6465) — MEDIUM (general security checklist; cross-reference but not authoritative)
- [Sibling research: `STACK.md`](./STACK.md) — version-pinned stack and tooling pitfalls
- [Sibling research: `FEATURES.md`](./FEATURES.md) — reputation farming attack matrix, critical path
- [Sibling research: `ARCHITECTURE.md`](./ARCHITECTURE.md) — trust boundary inventory, data flows, component owners

---

*Pitfalls research for: Call It — onchain social prediction product on Arbitrum One*
*Researched: 2026-05-21*
*Spec source: `CALL_IT_SPEC1.md` v1.0 (3,088 lines, locked)*
*Sibling research: STACK.md, FEATURES.md, ARCHITECTURE.md*
