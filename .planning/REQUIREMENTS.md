# Requirements: Call It

**Defined:** 2026-05-21
**Core Value:** Every call is permanent, public, and tied to identity. The receipt — created, settled, and shared — must be unfakeable, undeletable, and visually unmistakable.
**Source:** `CALL_IT_SPEC1.md` v1.0 (3,088 lines) — locked spec, no redesign.

---

## v1 Requirements

Requirements for the v1 mainnet release. Each line is an atomic, testable behavior pinned to the spec section that locks it. REQ-IDs use the schema:

- **AUTH** — Identity, sign-in, Privy embedded wallets, OAuth, wallet export, ENS/handle, address book, custody disclosure, paymaster, SIWE re-sign
- **CALL** — Call creation, call types, allowlist, anti-spam gates, conviction, two-step publish, live preview, Resolution Criteria
- **SOCIAL** — Follow / Fade (AMM), Challenge (1v1), Quote-call, position exits, slippage, activity feed, Duel King, trending duel
- **REP** — Reputation system (global + 3 categories + caller + challenger), confidence × contrarian math, high-conviction asymmetry, cold-start, ProfileRegistry, Stylus scoring + Solidity baseline
- **SETTLE** — SettlementManager, oracle adapters (Pyth, Alchemy NFT TWAP, DefiLlama, RPC, Snapshot/Tally, CEX scrapers), dispute window, owner resolution, idempotency, atomicity, SLA, force-settle, signed-relayer attestation
- **SAFETY** — Mainnet safety caps, emergency pause, ReentrancyGuard, hardcoded USDC, Solidity pin, Pyth confidence gating, paymaster caps, Sepolia staging, post-deploy smoke test
- **UI** — 10 pages, shared loading skeleton, shared error toast, neobrutalist treatment, stamp animation, mobile responsive
- **SHARE** — Off-chain OG service (5 card variants), outcome word variants, readability QA gate, Twitter Card Validator, auto-post, follow-graph feeds
- **OPS** — The Graph subgraph, structured logging, metrics dashboard, Telegram alerts, runbooks, KMS, custody disclosure

---

### Authentication & Identity (AUTH)

- [ ] **AUTH-01**: User can sign in via Privy through three paths leading to the same authenticated session — Connect Wallet (SIWE), Sign in with Google (OAuth), Sign in with Twitter (OAuth) (§9.1, §15.8)
- [ ] **AUTH-02**: Connect Wallet path supports MetaMask, Rabby, WalletConnect, and Coinbase Wallet; user signs an EIP-4361 SIWE message; no embedded wallet is created for this path (§9.1, §15.8)
- [ ] **AUTH-03**: Google OAuth path auto-creates a Privy embedded wallet keyed to the Google account; user never sees a seed phrase (§9.1, §9.2)
- [ ] **AUTH-04**: Twitter OAuth path auto-creates a Privy embedded wallet AND pre-links the Twitter handle automatically (no separate Connect Twitter step) (§9.1, §9.2)
- [ ] **AUTH-05**: Privy is integrated as a single React provider (`PrivyProvider` + `usePrivy()`) wrapping the app (§9.2)
- [ ] **AUTH-06**: After sign-in, user can optionally link Twitter via OAuth → ProfileRegistry.linkTwitter (relayer-mediated) (§9.3, §11.5, §12.5)
- [ ] **AUTH-07**: After sign-in, user can optionally link Farcaster via Farcaster Auth Kit → ProfileRegistry.linkFarcaster (relayer-mediated) (§9.3, §11.5, §12.5)
- [ ] **AUTH-08**: User can skip social linking and return to it later via Profile → Settings (§9.3, §15.4)
- [ ] **AUTH-09**: VERIFIED · X / VERIFIED · FC / VERIFIED · X · FC badges render next to the handle on profile, feed cards, receipts, duel page, leaderboard rows (§9.4, §15.1, §15.3, §15.4, §15.6, §15.7)
- [ ] **AUTH-10**: Connected social verification has zero mechanical effect — no rep boost, no stake-limit unlock, no fee discount, no payout effect (§9.5)
- [ ] **AUTH-11**: Handle resolution priority is ENS → Twitter → Farcaster → truncated 0x address, with user-overridable preferred display handle in profile settings (§9.6)
- [ ] **AUTH-12**: Users can unlink socials via Profile → Settings — removes badge and handle reference, does not delete onchain history (§9.7, §12.5)
- [ ] **AUTH-13**: ProfileRegistry stores `SocialIdentity` per user (twitterHandle, farcasterHandle, twitterProofHash, farcasterProofHash, twitterLinkedAt, farcasterLinkedAt) capped at 50 bytes per handle (§9.8, §12.5, App.A.1)
- [ ] **AUTH-14**: Twitter follow-graph integration queries X API and cross-references against `ProfileRegistry.SocialIdentity.twitterHandle` to power the "From your X" feed (§9.9)
- [ ] **AUTH-15**: "From your X" feed section shows up to 10 calls, ordered by recency, includes active calls + active duels, excludes settled calls, refreshes when feed opens with 1-hour graph cache (§9.9, §15.1)
- [ ] **AUTH-16**: First-time onboarding shows explicit Twitter follow-graph opt-in screen with "Yes, show me" / "No thanks"; declined state never shows the section (§9.9, §15.9 Screen 3)
- [ ] **AUTH-17**: Twitter follow-graph data is held server-side only, never written onchain; visible only to the viewer themselves; cleared on disconnect (§9.9)
- [ ] **AUTH-18**: Farcaster follow-graph mirrors the Twitter mechanic via Farcaster Hub API → "From your Farcaster" feed section; both can appear simultaneously with collapse toggles (§9.9, §15.1)
- [ ] **AUTH-19**: Onboarding flow runs automatically on first sign-in across 4 screens: Handle, Connect Socials, Follow-graph opt-in (conditional), Tagline commitment (§15.9)
- [ ] **AUTH-20**: Onboarding Screen 1 pre-fills handle from ENS (Wallet path) or Twitter handle (Twitter path); default placeholder "you.eth" otherwise (§15.9 Screen 1)
- [ ] **AUTH-21**: Onboarding Screen 4 displays the commitment line "EVERY CALL IS PERMANENT. WINS AND LOSSES. WE DON'T SUGAR-COAT." (§15.9 Screen 4)
- [ ] **AUTH-22**: Privy custody disclosure card appears during onboarding: "Your wallet is custodied by Privy until you export it. We recommend exporting once you hold more than $50 in this wallet." (§10.6, §15.8)
- [ ] **AUTH-23**: Wallet export to self-custody is available from Profile → Settings (one-way operation; Privy MPC recovery + paymaster + multi-auth-linking benefits are lost after export) (§9.2, §10.6, §15.4)
- [ ] **AUTH-24**: In-app prompt fires recommending wallet export when embedded wallet balance reaches ≥ $50 USDC (§10.6, App.A.1)
- [ ] **AUTH-25**: Coinbase Onramp integration funds the embedded wallet with USDC for OAuth users (§19 Phase 1, §19.11)
- [ ] **AUTH-26**: Direct USDC transfer from an external wallet to the internal Privy wallet is detected and reflected in balance (§19 Phase 1, §19.11)
- [ ] **AUTH-27**: Paymaster sponsors exactly the first 5 transactions per user; 6th transaction onward pays gas in USDC via Circle USDC Paymaster on Arbitrum (EIP-2612 permit per tx) — no ETH required. (§10.7, App.A.1; amended by Phase 1 D-06 spec deviation)
- [ ] **AUTH-28**: Paymaster per-account 5-tx cap is enforced server-side at the paymaster gating layer, not just contract-side (§10.7)
- [ ] **AUTH-29**: When the per-account 5-tx sponsorship cap is exhausted, the frontend automatically routes subsequent userOps through Circle USDC Paymaster (CIRCLE_PAYMASTER_ARBITRUM_ONE) with a per-tx EIP-2612 permit signed by the user's Privy embedded wallet; UI surfaces the USDC gas mode Tag (§10.7; amended by Phase 1 D-06 spec deviation)
- [ ] **AUTH-30**: SIWE re-sign is required when authorizing withdrawals to a saved external-address destination (App.A.1, §10.6)
- [ ] **AUTH-31**: Address book stores saved external withdrawal addresses with `addedAt` timestamp (§19 Phase 1.5, App.A.1)
- [ ] **AUTH-32**: Newly-added auth method must wait 24h before it can authorize a withdrawal (`now > addedAt + 24h`) (§19 Phase 1.5, App.A.1)
- [ ] **AUTH-33**: In-app + email (where available) notification fires when a new auth method is linked (App.A.1)
- [ ] **AUTH-34**: Auth-method removal flow requires existing-method re-auth (§19 Phase 1.5)
- [ ] **AUTH-35**: User can edit their preferred display handle from Profile → Settings, overriding the §9.6 priority (§15.4)
- [ ] **AUTH-36**: Sign-in screen renders three CTAs vertically — Connect Wallet (primary, accent yellow-green fill), Sign in with Google, Sign in with Twitter (§15.8)
- [ ] **AUTH-37**: Sign-in screen displays the brand disclaimer: "By signing in you agree that your calls become permanent public record. No edits. No deletes. Wins and losses both count." (§15.8)
- [ ] **AUTH-38**: Sign-in screen shows OAuth custody microcopy on hover/pre-select: "OAuth wallets are custodied by Privy until you export. You can export at any time from Settings." (§15.8, §10.6)
- [ ] **AUTH-39**: ProfileRegistry write access for `updateAfterSettlement` is restricted to a single authorized SettlementManager rotated by owner via `setSettlementManager`; prior manager loses write access in the same block (§12.5)
- [ ] **AUTH-40**: ProfileRegistry write access for `linkTwitter` / `linkFarcaster` is restricted to a single authorized relayer rotated by owner via `setRelayer` (§12.5)
- [ ] **AUTH-41**: `unlinkTwitter` / `unlinkFarcaster` are callable by the user directly (no relayer required) (§12.5)
- [ ] **AUTH-42**: ProfileRegistry handle strings revert `HandleTooLong` if `bytes(handle).length > 50` (`MAX_HANDLE_LENGTH`) (§12.5, App.A.1)
- [ ] **AUTH-43**: Social-linking gas is sponsored by the protocol via relayer pattern (§9.8)
- [ ] **AUTH-44**: User wallet address is NEVER shown on shareable receipts — handle + rep + outcome only (§15.7, App.A.1)

### Call Creation & Anti-Spam (CALL)

- [ ] **CALL-01**: User can create a Price Target call — directional call on a single asset hitting a specific price by a deadline (§4.1)
- [ ] **CALL-02**: User can create a Spread/vs call across 5 metrics — Price (default), Market cap, Volume rank (7d), TVL rank, Fees rank (7d) (§4.2)
- [ ] **CALL-03**: User can create an Event/Binary call across 7 subtypes — TVL milestone, Volume/Fees comparison, On-chain metric thresholds, CEX listing, Token launch, Governance outcomes, Protocol/chain milestones (§4.3.1–4.3.7)
- [ ] **CALL-04**: Event/Binary On-chain metric subtype supports the locked metric list: active addresses (24h/7d), holders count, gas burned (24h), validator count, supply APR, borrow APR, staking APR, liquidation events > $X (24h/7d) (§4.3.3)
- [ ] **CALL-05**: Event/Binary CEX listing subtype supports 8 exchanges — Binance, Coinbase, OKX, Bybit, Kraken, Bitget, KuCoin, Upbit (§4.3.4)
- [ ] **CALL-06**: Coin allowlist enforces the locked 25 tickers across Majors / L2s / DeFi blue chips / Restaking & LSTs / Memes / Arbitrum ecosystem / AI & RWA (BASE removed; MATIC published as POL on Pyth) (§4.4, App.A.1)
- [ ] **CALL-07**: NFT allowlist enforces the 6 collections — CryptoPunks, BAYC, Pudgy Penguins, Milady, Azuki, DeGods (§4.4)
- [ ] **CALL-08**: Pre-deployment Pyth feed verification is completed for every allowlisted coin against `docs.pyth.network/price-feeds`; flagged tickers MNT, ETHFI, ezETH, RDNT, MATIC/POL verified explicitly (§4.4, App.A.1)
- [ ] **CALL-09**: NFT allowlist coverage is verified against Alchemy NFT API (`getFloorPrice` per contract address) before launch (§4.4, §13.2)
- [ ] **CALL-10**: Owner-only `addAsset(symbol, feedId)` extends the coin allowlist (§4.4)
- [ ] **CALL-11**: Owner-only `addNFTCollection(contractAddress)` extends the NFT allowlist (§4.4)
- [ ] **CALL-12**: New NFT additions require confirmed Alchemy coverage + ≥24 sales/day average over the prior 30 days + explicit `addNFTCollection` call (§13.2)
- [ ] **CALL-13**: `createCall` reverts `AssetNotAllowlisted` for any non-allowlisted assetA or assetB (§4.4, §12.1)
- [ ] **CALL-14**: Resolution Criteria field is optional for Price target, Spread/vs, TVL milestone, Volume/Fees, On-chain metric (§4.7)
- [ ] **CALL-15**: Resolution Criteria field is required (≥50 characters) for CEX listing, Token launch, Governance, Protocol milestone (§4.7)
- [ ] **CALL-16**: `createCall` reverts `CriteriaRequired(marketType, subtype)` when criteriaHash is zero for event subtypes 3-6 (§4.7, §12.1)
- [ ] **CALL-17**: Resolution Criteria is hashed onchain at publish and cannot be edited (§4.7)
- [ ] **CALL-18**: Resolution Criteria is advisory in disputes; structured fields (Subject, Metric, Target, Deadline) take precedence (§4.7)
- [ ] **CALL-19**: Calls with criteria ≥50 chars earn a "VERIFIED CRITERIA" badge on call cards, receipt page, and shareable receipt cards — no mechanical effect (§4.7)
- [ ] **CALL-20**: Minimum stake per call is $5 USDC, hardcoded as `MIN_STAKE = 5 * 1e6`; createCall reverts `StakeBelowMinimum` for lower (Gate 6.1, §6.1, §8.4, §12.1)
- [ ] **CALL-21**: Maximum stake per call is $100 USDC, hardcoded as `MAX_STAKE = 100 * 1e6`; createCall reverts `StakeAboveMaximum` for higher (§8.4, §10.1, §12.1)
- [ ] **CALL-22**: Duplicate hash is computed at call creation as `keccak256(market_type, subject, metric, target_value, deadline_day_utc)` (§6.2, §12.1)
- [ ] **CALL-23**: `deadline_day_utc` is computed as `(deadline_timestamp / 86400) * 86400` — UTC, floor, 86,400-second day (§6.2, App.A.1)
- [ ] **CALL-24**: Duplicate hash deliberately excludes caller, conviction, stake, and reasoning — two different users cannot publish the same call simultaneously (§6.2)
- [ ] **CALL-25**: `createCall` reverts `DuplicateCall(existingCallId)` when `activeDuplicateHashes[duplicateHash] != 0` (Gate 6.2, §12.1)
- [ ] **CALL-26**: Frontend catches `DuplicateCall` error and shows an inline "A nearly identical call already exists — quote it instead?" message with a link to the existing call (§6.2)
- [ ] **CALL-27**: Settled calls clear their duplicate hash, allowing a new call with the same parameters (§6.2, §12.4 step 12)
- [ ] **CALL-28**: Conviction slider exposes integer values 1–100 (§6.3, §15.2)
- [ ] **CALL-29**: Calls with conviction ≥85% require `settledCalls ≥ 10` per `ProfileRegistry`; if `settledCalls < 10`, contract auto-caps conviction to 84 and emits `ConvictionCapped(caller, requested, applied)` — NO revert (Gate 6.3, §6.3, §12.1)
- [ ] **CALL-30**: UI shows "⚡ High conviction · 2× payout if correct · 2× penalty if wrong" amber callout when slider crosses ≥85% (§15.2, §17.2)
- [ ] **CALL-31**: UI shows the high-conviction floor warning when caller has <10 settled calls and conviction ≥85%: "⚡ High conviction unlocks after 10 settled calls. You have N. Your call will publish at 84% — the highest available to you." (§6.3, §15.2)
- [ ] **CALL-32**: `createCall` enforces `expiry > block.timestamp` and reverts `ExpiryNotInFuture` otherwise (§12.1)
- [ ] **CALL-33**: `createCall` enforces `category < CATEGORY_COUNT` (= 3) and reverts `CategoryInvalid` otherwise (§7.5, §12.1)
- [ ] **CALL-34**: `createCall` enforces TVL cap aggregate — `currentTvl + stake + CREATION_FEE_TO_VIRTUAL <= tvlCap` — reverts `TvlCapReached(requested, available)` (§10.2, §12.1)
- [ ] **CALL-35**: `createCall` pre-checks `USDC.allowance(caller, contract) >= stake + CREATION_FEE` and reverts `InsufficientUsdcAllowance(needed, actual)` (§12.1)
- [ ] **CALL-36**: `createCall` pre-checks `USDC.balanceOf(caller) >= stake + CREATION_FEE` and reverts `InsufficientUsdcBalance(needed, actual)` (§12.1)
- [ ] **CALL-37**: `createCall` pulls `stake + $10 creation fee` via `safeTransferFrom` and reverts `UsdcTransferFailed` on failure (§12.1, §8.5)
- [ ] **CALL-38**: $5 of the creation fee routes to treasury; $5 routes to virtual fade liquidity (added to $2 base seed = $7 total virtual fade) (§8.5, §12.1)
- [ ] **CALL-39**: Caller's stake auto-enters the follow pool at call creation; $7 virtual fade liquidity (accounting only) is seeded on the opposite side (§8.2, §8.5)
- [ ] **CALL-40**: Virtual fade liquidity is accounting-only — never transferred, never paid out, dissolves at settlement (§8.2)
- [ ] **CALL-41**: When fade wins and only virtual fade liquidity exists, the entire follow pool transfers to the protocol treasury (§8.2)
- [ ] **CALL-42**: New Call page (`/new`) renders the form left and live receipt preview right (§15.2)
- [ ] **CALL-43**: Mode-specific form fields render dynamically per market type (Price target / Spread/vs / Event binary subtypes) with 200ms crossfade on subtype switch (§15.2)
- [ ] **CALL-44**: Event/binary and Spread/vs modes show a plain-language preview block ("your call reads as…") with the auto-generated sentence and resolution source pill (§15.2)
- [ ] **CALL-45**: Price target / Spread vs deadlines use a slider for 1–90 days; Event/binary deadlines use a dropdown (End of week / month / quarter / 7d / 14d / 30d / 90d / Custom) (§15.2)
- [ ] **CALL-46**: Frontend displays the rounded UTC day next to the chosen deadline so duplicate-detection day-boundary surprises are visible (§6.2, App.A.1)
- [ ] **CALL-47**: Stake input offers quick-stake buttons $5 / $25 / $50 / $100, capped at $100 per call (§15.2)
- [ ] **CALL-48**: Inline validation shows red border and "Minimum stake is $5 USDC" if user enters <$5 (§15.2)
- [ ] **CALL-49**: Inline duplicate detection shows amber "⚠ A nearly identical call is already live. Quote it instead →" block above the conviction slider when fields hash to an existing call (§15.2, §6.2)
- [ ] **CALL-50**: Reasoning field is optional at all stake levels (§6.4, §15.2)
- [ ] **CALL-51**: Advanced Settings disclosure exposes three toggles: "Allow followers to ride the call" (default ON), "Open to 1v1 challenges" (default ON), "Auto-post receipt to socials on settle" (default ON) (§15.2)
- [ ] **CALL-52**: Two-step publish flow: clicking "Publish call · stake $XX" opens a confirmation modal with full-size receipt preview + breakdown table (stake, conviction, payout, penalty, rep impact, $10 fee) before the wallet transaction triggers (§15.2)
- [ ] **CALL-53**: Confirmation modal exposes "Cancel" (returns to form with state preserved) and "Confirm — go on record" (filled accent yellow-green) buttons (§15.2)
- [ ] **CALL-54**: Live receipt preview right panel shows handle, rep, accuracy, streak, call statement with target highlighted, conviction bar, POTENTIAL OUTCOME panel that updates live, and visibly doubles payout/penalty at ≥85% conviction (§15.2)
- [ ] **CALL-55**: Live receipt preview shows the "VERIFIED CRITERIA" badge preview when the textarea reaches ≥50 characters (§4.7, §15.2)
- [ ] **CALL-56**: Publish button is disabled when criteria is required and field has <50 characters (§4.7, §15.2)
- [ ] **CALL-57**: Quote-call composer (`/new?quote=[parentCallId]`) renders parent context card + YOUR THESIS textarea ABOVE the market-type segmented buttons (§15.10, §5.4)
- [ ] **CALL-58**: Quote-call YOUR THESIS textarea has a 500-char soft limit with a countdown counter (§15.10)
- [ ] **CALL-59**: Quote-call placeholder copy varies based on whether the quoter's call direction agrees or disagrees with the parent (§15.10)
- [ ] **CALL-60**: Quote-call submission sets `parent_call_id = [parentCallId]` on the new call; quote does NOT affect parent's pool or settlement (§5.4, §15.10)
- [ ] **CALL-61**: Quote-call confirmation surfaces line above Publish: "Your call is independent of the call you're quoting." (§15.10)
- [ ] **CALL-62**: Category assignment maps each call to exactly one of Majors / DeFi / Other per the §7.5 rules (BTC/ETH/SOL/NFTs → Majors; allowlisted alt-coins + DeFi event calls → DeFi; memes/CEX/token launches/protocol milestones → Other) (§7.5)
- [ ] **CALL-63**: Category enum is append-only — new categories may be added in v2 without renumbering (§7.5, App.A.1)
- [ ] **CALL-64**: `createCall` stores the `openToChallenges` flag from the Advanced Settings toggle (§5.3, §12.1)
- [ ] **CALL-65**: Calls with `openToChallenges == true` render a ⚔ OPEN badge on their card in the feed (§5.3, §15.1)
- [ ] **CALL-66**: Feed exposes a filter to show only challengeable calls (§5.3)
- [ ] **CALL-67**: `getCallsByUser(user, offset, limit)` paginated view is built into the v1 interface (§12.1, App.A.1)
- [ ] **CALL-68**: `computeDuplicateHash(...)` and `computeCallerExitPenalty(callId)` helpers are exposed for frontend pre-check and display (§12.1)
- [ ] **CALL-69**: `CallCreated(id, caller, marketType, stake)` event is emitted on every successful createCall (§12.1)
- [ ] **CALL-70**: `CallQuoted(parentId, quoteId)` event is emitted when a quote call is created (§12.1)

### Social Actions (SOCIAL)

- [x] **SOCIAL-01**: User can Follow any live call by depositing USDC into the FollowFadeMarket follow pool, receiving FOLLOW shares priced by the constant-product AMM `follow_shares × fade_shares = k` (§5.1, §8.1, §12.2)
- [x] **SOCIAL-02**: User can Fade any live call by depositing USDC into the fade pool, receiving FADE shares (§5.2, §8.1, §12.2)
- [x] **SOCIAL-03**: Minimum follow/fade position is $1 USDC (`MIN_POSITION = 1 * 1e6`); reverts `PositionBelowMinimum` (§8.4, §12.2, App.A.1)
- [x] **SOCIAL-04**: Maximum follow/fade position per user per call is $100 USDC (`MAX_POSITION`), enforced cumulatively across additive deposits; reverts `PositionAboveMaximum` (§8.4, §12.2, App.A.1)
- [x] **SOCIAL-05**: `follow` / `fade` require slippage protection — `minSharesOut` parameter; reverts `SlippageExceeded(expected, actual)` if AMM mints fewer shares (§12.2, App.A.1)
- [x] **SOCIAL-06**: Frontend computes expected shares + 1% tolerance and passes through as `minSharesOut` on every follow/fade transaction (§19 Phase 2, §12.2)
- [x] **SOCIAL-07**: Post-expiry deposit gate — `follow`/`fade` revert `CallPastExpiry(expiry, now)` when `block.timestamp >= call.expiry` (§12.2, App.A.1)
- [x] **SOCIAL-08**: `follow`/`fade` accept deposits when call status is Live OR CallerExited (CallerExited markets stay open per §8.7.2) (§12.2)
- [x] **SOCIAL-09**: TVL cap is aggregated across all pools and contracts; `follow`/`fade` revert `TvlCapReached` when over (§10.2, §12.2)
- [x] **SOCIAL-10**: `follow`/`fade` record `positionEntryTime[callId][user][side] = block.timestamp` and reset the timestamp to the latest deposit when a user adds to an existing position (§12.2)
- [x] **SOCIAL-11**: AMM penalty injection adds slashed USDC directly to the receiving pool reserve so `k` grows and existing shares appreciate pro-rata — no phantom shares minted (§11.2, §12.1 step 7, §12.2 step 7)
- [x] **SOCIAL-12**: Followers and faders can exit their position after a 4-hour cooldown (`POSITION_EXIT_COOLDOWN = 4 hours`); `exitPosition` reverts `ExitCooldownActive(unlocksAt)` during cooldown (§8.7.1, §12.2)
- [x] **SOCIAL-13**: Follower/fader exit slashes a flat 10% (`POSITION_EXIT_PENALTY_PCT = 10`); user receives 90% of stake back, shares burned (§8.7.1, §12.2)
- [x] **SOCIAL-14**: Follower/fader exit slash distribution is 50% to opposite pool / 40% to same-side pool / 10% to protocol treasury (§8.7.1, §12.2)
- [x] **SOCIAL-15**: `exitPosition` continues to function while contract is paused (carve-out per §10.3) (§12.2, §10.3)
- [x] **SOCIAL-16**: `exitPosition` on an already-settled call reverts `CallNotLive` and UI surfaces "Use Claim Payout instead" (§12.2)
- [x] **SOCIAL-17**: Caller cannot exit during the first 24 hours (`CALLER_EXIT_LOCK_DURATION = 24 hours`); `callerExit` reverts `CallerExitLocked(unlocksAt)` during lock (§8.7.2, §12.1)
- [x] **SOCIAL-18**: After 24h, caller exit penalty follows `15% + (35% × time_remaining_ratio)` with floor of 15% even at last-minute (§8.7.2, §12.1)
- [x] **SOCIAL-19**: Caller exit slash distribution is 50% to follow pool / 40% to fade pool / 10% to protocol treasury (§8.7.2, §12.1)
- [x] **SOCIAL-20**: Caller exit snapshots `callerVolumeAtExit = followPool + fadePool` for Model B creator fee calculation (§8.8, §12.1)
- [x] **SOCIAL-21**: Caller exit sets `call.status = CallerExited` (single source of truth — no redundant boolean) and `call.callerExitedAt = now` (§12.1)
- [x] **SOCIAL-22**: Caller exit emits `CallerExited(callId, caller, timeElapsed, penaltyPaid, stakeReturned, reputationDelta)` event for public broadcast (§8.7.3, §12.1)
- [ ] **SOCIAL-23**: Caller exit triggers a public broadcast entry in the global feed: "⚠ [caller] exited their own call · '[statement]' · [time] in · -$X slashed" (§8.7.3, §15.3)
- [ ] **SOCIAL-24**: Caller exit fires notification to every current follower and fader on the call (§8.7.3)
- [ ] **SOCIAL-25**: Receipt page displays a permanent "CALLER EXITED" amber banner in the header from exit onward (§8.7.3, §15.3)
- [x] **SOCIAL-26**: Caller exit applies reputation slash via ProfileRegistry — decay curve `-45 rep day 1 → -10 rep floor` (§8.7.3, §12.1)
- [x] **SOCIAL-27**: Exited callers receive NO additional reputation change at eventual settlement — they are removed from the call's rep accounting (§8.7.3, §12.4)
- [x] **SOCIAL-28**: There is no separate "cancel the call" mechanic — only callerExit after lock + normal settlement (§8.7.4)
- [ ] **SOCIAL-29**: User can Challenge a call via `proposeChallenge(callId, stake)`; reverts `CallerNotOpenToChallenges` when caller toggled off (§5.3, §12.3)
- [ ] **SOCIAL-30**: Challenge form pre-fills challenger's stake to match the caller's stake exactly; challenger can override (§5.3, §15.5)
- [ ] **SOCIAL-31**: Asymmetric duels are allowed — pot is `min(callerStake, challengerStake) × 2` plus overage returned to whichever side overcommitted at settlement (§5.3, §12.3)
- [ ] **SOCIAL-32**: `proposeChallenge` reverts `SelfChallenge` when `msg.sender == call.caller` (no rep farming, no Duel King gaming via puppet wallets) (§12.3, App.A.1)
- [ ] **SOCIAL-33**: `proposeChallenge` reverts `CallNotChallengeable` if call.status != Live OR `block.timestamp >= call.expiry` (§12.3)
- [ ] **SOCIAL-34**: Caller has 24h to accept (`CHALLENGE_ACCEPTANCE_WINDOW`); `acceptChallenge` reverts `AcceptanceWindowExpired` after; `claimRefund` returns challenger stake after timeout (§5.3, §12.3)
- [ ] **SOCIAL-35**: Caller can `rejectChallenge` during the window to refund challenger immediately (§12.3)
- [ ] **SOCIAL-36**: Challenge stakes are escrowed in ChallengeEscrow; on settlement, winner takes the entire pot minus 1% protocol fee (§5.3, §8.9, §12.3)
- [ ] **SOCIAL-37**: Challenge settlement applies ~1.5× the standard rep movement to both parties (§5.3, §12.4)
- [ ] **SOCIAL-38**: `claimDuelPayout` is idempotent — reverts `AlreadyClaimed` on second attempt (§12.3)
- [ ] **SOCIAL-39**: `claimDuelPayout` reverts `NotDuelWinner` for non-winner (§12.3)
- [ ] **SOCIAL-40**: Trending Duel auto-promotion — duels with combined pot ≥ $500 USDC OR ≥50 "Riding" backers are pinned to top of global feed for 4 hours with "TRENDING DUEL" label (§5.3, §15.1)
- [ ] **SOCIAL-41**: Duel King badge displays on the single user with the highest 7-day duel win streak; refreshed weekly; visible on profile, leaderboard row, feed call cards, receipt cards (§5.3)
- [ ] **SOCIAL-42**: Duels tab in feed shows Active duels (sorted by pot descending), Trending duels pinned, Recently settled duels (last 7 days); filter chips All / Active / Just settled / High-stakes / Trending (§5.3, §15.1)
- [ ] **SOCIAL-43**: User can Quote-call any live call via `/new?quote=[parentCallId]`; quote is stored on CallRegistry with `parent_call_id` reference and renders as a threaded reply (§5.4, §15.10)
- [ ] **SOCIAL-44**: Receipt page Live state shows a live activity feed (left column) with real-time follow/fade entries — avatar, handle, VERIFIED · X badge, amount, relative time, label "updating" with live pulse indicator (§15.3)
- [ ] **SOCIAL-45**: Receipt page Live state shows quote-calls section (right column) with FADING/FOLLOWING tag per quote based on direction (§15.3, §5.4)
- [ ] **SOCIAL-46**: `claimPayout` requires settlement (`CallNotSettled`), enforces idempotency via `claimed[callId][user]` (`AlreadyClaimed`), reverts `NoPayoutAvailable` for users with no winning shares (§12.2)
- [ ] **SOCIAL-47**: `claimPayout` follows Checks-Effects-Interactions — marks claimed BEFORE transfer (§12.2)
- [ ] **SOCIAL-48**: `Followed`, `Faded`, `PayoutClaimed`, `PositionExited`, `ChallengeProposed`, `ChallengeAccepted`, `ChallengeRejected`, `ChallengeRefunded`, `ChallengeSettled` events fire on each action (§12.2, §12.3)
- [ ] **SOCIAL-49**: Receipt page exposes caller-only "Exit your call · current penalty: [X%]" link after 24h lock; clicking opens confirmation modal with penalty math, return amount, rep impact, public broadcast warning (§15.3, §8.7.2)
- [ ] **SOCIAL-50**: Receipt page exposes position-holder "Exit your position · 10% penalty" link after 4h cooldown; clicking opens confirmation modal with math + confirm button (§15.3, §8.7.1)
- [ ] **SOCIAL-51**: Duel-settled share card uses two-avatar layout with winner highlighted and loser dimmed to 40% opacity (§5.3, §16.4)

### Reputation System (REP)

- [ ] **REP-01**: Every new user begins at 100 reputation (§7.1, §12.5)
- [ ] **REP-02**: Reputation can never go below 0 — losses cap at the floor (§7.2)
- [ ] **REP-03**: Winning call reputation gain = `base_gain × confidence_multiplier × contrarian_multiplier` (suggested base 10) (§7.3)
- [ ] **REP-04**: Confidence multiplier scales ~0.5 at 50% conviction to ~2.0 at 100% conviction (linear or curved) (§7.3)
- [ ] **REP-05**: Contrarian multiplier scales by market consensus at call creation — ≥2.0× when ~85% disagreed, ~0.7 when ~80% agreed (§7.3)
- [ ] **REP-06**: Losing call reputation cost = `base_loss × confidence_multiplier` (no contrarian multiplier on losses) (§7.3)
- [ ] **REP-07**: Calls at conviction ≥85% apply a 2× multiplier on both payout and penalty (§7.4)
- [ ] **REP-08**: Reputation system ships with exactly 3 categories — Majors, DeFi, Other (down from 8) (§7.5, App.A.1)
- [ ] **REP-09**: Each call affects exactly one category sub-score plus the global score (§7.5)
- [ ] **REP-10**: Profile exposes Layer 3 action-type scores — caller score (own published calls) + challenger score (1v1 duels) — stored separately because skill profiles differ (§7.5, §12.5)
- [ ] **REP-11**: Following and fading do NOT affect reputation — only making calls moves rep (§7.6, §12.4)
- [ ] **REP-12**: All scores freeze on inactivity — no decay, no reset (§7.7)
- [ ] **REP-13**: There is NO reputation-based gating in v1 — $100 max stake and $5K TVL cap apply equally to all users regardless of rep (§7.8)
- [ ] **REP-14**: Cold-start adjustment: if a correct call has zero real fade activity (excluding $7 virtual seed), caller's rep `delta` is scaled to 25% before applying (§8.3, §12.4)
- [ ] **REP-15**: Cold-start adjustment does NOT apply to losses — being wrong is wrong regardless of opposition (§8.3)
- [ ] **REP-16**: "Real fader" threshold is any non-zero real USDC in the fade pool (App.A.1)
- [ ] **REP-17**: Profile struct stores `globalRep`, `categoryRep[CATEGORY_COUNT]`, `callerRep`, `challengerRep`, `streak`, `totalCalls`, `settledCalls`, `wins`, `losses`, `lastActiveAt` (§12.5)
- [ ] **REP-18**: `settledCalls` count is read by `createCall` to enforce the §6.3 high-conviction floor (§6.3, §12.5)
- [ ] **REP-19**: StylusScoreEngine exposes Rust `compute_rep_change(currentRep, conviction, consensusPct, isWinner, baseValue) -> i32` callable via Stylus cross-contract invocation (§11.6, §12.6)
- [ ] **REP-20**: StylusScoreEngine handles confidence multiplier, contrarian multiplier (winners only), high-conviction 2× asymmetry at conviction ≥85, and floor clamping at 0 (§12.6)
- [ ] **REP-21**: StylusScoreEngine is deployed behind a minimal transparent proxy with deployer-key admin; upgrades require pause → upgrade → unpause (§10.8, §11.6)
- [ ] **REP-22**: SettlementManager wraps the Stylus call in try/catch; on Stylus revert, falls back to a Solidity baseline `_solidityBaselineRepDelta(...)` at lower fidelity (linear confidence scaling, fixed contrarian multiplier 1.0, no high-conviction asymmetry) (§11.6, §12.4)
- [ ] **REP-23**: On runtime fallback path, settlement still completes and `RepCalculatedFallback(callId, user, baselineDelta, lowLevelError)` event fires for operator investigation (§11.6, §12.4)
- [ ] **REP-24**: Build-time fallback: if Rust + Stylus path is not working by 48 hours before demo, swap to Solidity baseline implementation in the same proxy slot at full fidelity (§11.6, App.A.1)
- [ ] **REP-25**: `RepCalculated(callId, user, currentRep, conviction, consensusPct, isWinner, baseValue, delta)` event is emitted with full inputs for debuggability (§12.4, App.A.1)
- [ ] **REP-26**: SettlementManager calls `profileRegistry.updateAfterSettlement(user, category, isCaller, isWinner, repDelta)` for each settled caller (§12.4, §12.5)
- [ ] **REP-27**: Duel settlement applies rep deltas to BOTH caller and challenger at ~1.5× the standard rep movement (§5.3, §12.4)
- [ ] **REP-28**: NFT calls map to the Majors category for reputation purposes (§7.5, §13.2)
- [ ] **REP-29**: Spread/vs calls default to the DeFi or Majors category per the §7.5 assignment rules (§7.5)

### Settlement & Oracles (SETTLE)

- [ ] **SETTLE-01**: `settle(callId)` is permissionless — anyone can call (relayer rotation handles gas incentives) (§12.4)
- [ ] **SETTLE-02**: `settle` is idempotent — second call when status != Live reverts `AlreadySettled(callId)` cleanly (§12.4, App.A.1)
- [ ] **SETTLE-03**: `settle` reverts `CallNotExpired(expiry, now)` when called before expiry (§12.4)
- [ ] **SETTLE-04**: `settle` reverts `Paused` under emergency pause — new outcomes cannot be written while paused (§10.3, §12.4)
- [ ] **SETTLE-05**: All 14 steps of `settle` execute atomically — any revert rolls back the entire transaction (§12.4)
- [ ] **SETTLE-06**: SettlementManager dispatches to the correct oracle adapter based on `call.marketType` and `call.eventSubtype` (§12.4)
- [ ] **SETTLE-07**: Pyth feed reads use `PythUpgradable.getPriceNoOlderThan(priceId, 60)` — 60-second freshness window (avoids single-block MEV) (§13.1)
- [ ] **SETTLE-08**: Pyth confidence threshold is locked at `confidence × 200 <= price` — confidence interval ≤ 0.5% of price (§13.1, App.A.1)
- [ ] **SETTLE-09**: On Pyth confidence wide read, settlement emits `SettlementDelayed(callId, "PYTH_CONFIDENCE_WIDE", retryAfter=60s)` and returns early (no full revert) (§12.4 step 5, §13.1)
- [ ] **SETTLE-10**: Relayer retries Pyth read every 60 seconds for up to 30 attempts (30-minute window) (§13.1, App.A.1)
- [ ] **SETTLE-11**: After 30 failed retries, settlement falls into the standard 24h dispute window with reason "oracle data ambiguous" (§13.1, §13.7)
- [ ] **SETTLE-12**: Spread/vs reads load both `assetA` and `assetB` Pyth feeds within the same block; either failing confidence treats the spread as ambiguous (§13.1)
- [ ] **SETTLE-13**: NFT floor calls use Alchemy NFT API via off-chain relayer that polls `getNFTSales` + `getFloorPrice` at 5-minute intervals (§13.2)
- [ ] **SETTLE-14**: Relayer computes 24-hour TWAP floor price off-chain from raw sales/listings data (§13.2)
- [ ] **SETTLE-15**: Relayer signs the TWAP and submits via `submitNftFloor(callId, twapPriceWei, observationCount, evidenceHash)` to SettlementManager (§13.2)
- [ ] **SETTLE-16**: NFT TWAP reads with fewer than 12 observations in the 24h window are treated as ambiguous and routed to the dispute window (§13.2, App.A.1)
- [ ] **SETTLE-17**: TWAP signing key is held in the same multisig as the rest of the relayer authority (§13.2, §10.7)
- [ ] **SETTLE-18**: DefiLlama integration covers protocol TVL, chain TVL, 7d/30d volume, 7d/30d fees, 7d revenue, supply APR, borrow APR, staking APR via off-chain relayer that signs data points and submits onchain (§13.3)
- [ ] **SETTLE-19**: Direct RPC queries serve On-chain Metric subtype (active addresses, gas burned, validator count) and Liquidation events via relayer (§13.4)
- [ ] **SETTLE-20**: For event-driven On-chain resolutions (e.g., liquidation > $50M in window), relayer watches the relevant contract events and triggers settlement as soon as a qualifying event occurs (§13.4)
- [ ] **SETTLE-21**: Snapshot oracle reads off-chain proposal state via Snapshot API at the deadline (§13.5)
- [ ] **SETTLE-22**: Tally oracle reads on-chain governance proposal state directly via governance contract interface (§13.5)
- [ ] **SETTLE-23**: CEX listing scrapers monitor announcement pages of all 8 exchanges (Binance, Coinbase, OKX, Bybit, Kraken, Bitget, KuCoin, Upbit); relayer submits signed proof on-chain when a matching listing is detected (§13.6)
- [ ] **SETTLE-24**: All non-Pyth relayer-signed reads use a single retry at +5 minutes; if both fail, treated as ambiguous (§13.7)
- [ ] **SETTLE-25**: After ambiguous-data detection, a 24-hour dispute window opens (`DISPUTE_WINDOW = 24 hours`); any user can submit a counter-claim with a $5 USDC bond and evidence (§13.7, §13.8, §12.4)
- [ ] **SETTLE-26**: Dispute bond is exactly $5 USDC per submission (§8.10, §13.8, §12.4)
- [ ] **SETTLE-27**: If disputer wins (counter-claim accepted), bond is returned + $2 USDC reward from treasury (§8.10, §13.8, §12.4)
- [ ] **SETTLE-28**: If disputer loses, bond is forfeited to protocol treasury (§8.10, §13.8)
- [ ] **SETTLE-29**: A single call can have at most 3 counter-claims (`MAX_COUNTER_CLAIMS = 3`); reverts `CounterClaimLimitReached(limit)` (§13.8, §12.4)
- [ ] **SETTLE-30**: `raiseDispute` reverts `DisputeWindowClosed(closedAt)` after the 24h window (§12.4)
- [ ] **SETTLE-31**: First dispute against a Settled call transitions status to Disputed (§12.4)
- [ ] **SETTLE-32**: `DisputeRaised(callId, challenger, evidenceHash)` event is emitted; evidence is off-chain content-addressed (e.g., IPFS) (§12.4)
- [ ] **SETTLE-33**: `resolveDispute(callId, finalOutcome)` is owner-only in v1 (`NotOwner` revert) (§13.7, §12.4)
- [ ] **SETTLE-34**: If `finalOutcome != call.outcome`, dispute resolution reverses settlement — reverses rep deltas and re-distributes pool USDC from old-winner to new-winner (§12.4)
- [ ] **SETTLE-35**: Post-claim disputes are not honored in v1 — the 24h window is shorter than typical claim activity to keep this rare (§12.4)
- [ ] **SETTLE-36**: `DisputeResolved(callId, finalOutcome, resolver)` event is emitted on resolution (§12.4)
- [ ] **SETTLE-37**: Worst-case settlement SLA: 24h 30m maximum from `call.expiry` to final Settled state under normal flow (Pyth retries + dispute window) (§13.1, §13.7, App.A.1)
- [ ] **SETTLE-38**: SLA copy surfaced on the receipt page: "Settles within 24h after [expiry]" so users do not panic on ambiguous-read delay (§13.7)
- [ ] **SETTLE-39**: `forceSettle(callId, outcome)` escape hatch is owner-only and gated by `FORCE_SETTLE_COOLDOWN = 7 days` from `call.expiry`; reverts `ForceSettleCooldownActive(unlocksAt)` (§12.4, App.A.1)
- [ ] **SETTLE-40**: `forceSettle` emits BOTH `CallForceSettled(callId, outcome, owner)` AND `CallSettled(callId, outcome, 0)` for loud audit trail (§12.4)
- [ ] **SETTLE-41**: Settlement step 7 updates caller rep via StylusScoreEngine wrapped in try/catch with Solidity baseline fallback (§12.4, §11.6)
- [ ] **SETTLE-42**: If caller has exited per §8.7.3, settlement skips rep update for that caller entirely (§12.4 step 7, §8.7.3)
- [ ] **SETTLE-43**: Settlement step 8 (duels): challenger outcome = inverse of caller outcome; both parties' rep deltas applied at ~1.5× standard movement; ChallengeEscrow status set to Settled with `winner` populated (§12.4, §5.3)
- [ ] **SETTLE-44**: Settlement step 9 (followers/faders): NO per-user rep updates (per §7.6); only mark call as Settled and unlock pull-pattern `claimPayout()`; keeps `settle()` gas O(1) regardless of participant count (§12.4, §7.6)
- [ ] **SETTLE-45**: Settlement step 10: cold-start adjustment scales caller's delta to 25% before applying if real fade pool was zero (§12.4 step 10, §8.3)
- [ ] **SETTLE-46**: Settlement step 11: pay protocol fee (1%), creator fee (0.4% × volume-at-exit per Model B or full volume), route LP fee (0.3%) into the winning pool reserve (§8.6, §12.4)
- [ ] **SETTLE-47**: Settlement step 12: clear `activeDuplicateHashes[duplicateHash] = 0` so same call parameters can be reused (§12.4, §6.2)
- [ ] **SETTLE-48**: Settlement step 14: emit `CallSettled(callId, outcome, priceDelta)` (§12.4, §12.1)
- [ ] **SETTLE-49**: Total settlement extraction is 1.7% — 1.0% protocol + 0.4% creator + 0.3% LP (§8.6, §8.11)
- [ ] **SETTLE-50**: Creator fee follows Model B for exited callers — `0.4% × callerVolumeAtExit` snapshot, not full settled volume (§8.8, §12.4)
- [ ] **SETTLE-51**: Challenge settlement charges 1% protocol fee on the total pot; no creator fee, no LP fee (§8.9, §12.3)
- [ ] **SETTLE-52**: Settlement provenance is exposed on the settled receipt — line "SETTLED FROM [oracle URL] at [timestamp] UTC · view oracle proof ↗" with modal showing tx hash, raw data, signed relayer attestation (§15.7)

### Mainnet Safety (SAFETY)

- [ ] **SAFETY-01**: `MAX_STAKE_PER_CALL = 100 * 1e6` ($100 USDC) is a hardcoded constant; any deposit attempt exceeding reverts (§10.1, §12.1)
- [ ] **SAFETY-02**: TVL cap is set to `5_000 * 1e6` ($5,000 USDC) at launch; aggregated across all contracts holding funds (§10.2, §12.1)
- [ ] **SAFETY-03**: `setTvlCap(newCap)` is owner-only and capped by `MAX_ALLOWED_CAP = 100_000 * 1e6` ($100K hardcoded upper bound); owner cannot raise above this (§10.2, App.A.1)
- [ ] **SAFETY-04**: Every state-changing function on every contract is wrapped in a `whenNotPaused` modifier (§10.3)
- [ ] **SAFETY-05**: `pause()` and `unpause()` are owner-only (§10.3, §10.4)
- [ ] **SAFETY-06**: Withdraw and claim functions are NOT paused — even when system is frozen, users can always exit positions and pull funds out (§10.3)
- [ ] **SAFETY-07**: Deployer wallet can `pause`, `unpause`, `setTvlCap`, and emergency-withdraw stuck tokens (only to a multisig, never directly to deployer) (§10.4)
- [ ] **SAFETY-08**: Deployer cannot modify call outcomes, reputation scores, stake balances, or fee structure (§10.4)
- [ ] **SAFETY-09**: All contracts use Checks-Effects-Interactions pattern (§10.5)
- [ ] **SAFETY-10**: All external calls happen at the end of functions (§10.5)
- [ ] **SAFETY-11**: No `delegatecall` to user-controlled addresses anywhere (§10.5)
- [x] **SAFETY-12**: Solidity version is pinned to `^0.8.24` exactly (not `0.8+`) — locks checked arithmetic, transient storage, stable ABI (§10.5, App.A.1)
- [x] **SAFETY-13**: USDC address is hardcoded at deploy — every transfer path enforces `require(token == USDC_ARB)`; blocks fee-on-transfer, rebasing, and callback tokens (§10.5, App.A.1)
- [ ] **SAFETY-14**: ReentrancyGuard wraps all functions that handle USDC transfers (§10.5)
- [x] **SAFETY-15**: Paymaster global daily cap is $50/day at hackathon launch; auto-disables for the rest of the UTC day when reached and routes users to "fund your wallet to continue" flow (§10.7)
- [x] **SAFETY-16**: Daily cap is owner-tunable via `setPaymasterDailyCap(uint256)` on the off-chain relayer config (operational, not a contract function) (§10.7)
- [x] **SAFETY-17**: Telegram alert fires when daily paymaster spend hits 80% of cap (§10.7, App.A.1)
- [ ] **SAFETY-18**: CallRegistry, FollowFadeMarket, ChallengeEscrow, SettlementManager, ProfileRegistry are NOT upgradable in v1 — pause + redeploy is the rollback policy (§10.8, App.A.1)
- [ ] **SAFETY-19**: StylusScoreEngine is the ONLY upgradable contract via minimal transparent proxy; upgrade sequence is pause → upgrade → unpause (no silent mid-call rule changes) (§10.8)
- [ ] **SAFETY-20**: Proxy admin key rotates to a multisig before any v1.1 promotion or before TVL exceeds $5K (§10.8)
- [ ] **SAFETY-21**: Sepolia staging gate requires ≥48 hours of operation with seeded data before any mainnet deploy — non-optional (§19.10, App.A.1)
- [ ] **SAFETY-22**: Sepolia staging requires ≥10 seeded calls covering each call type (Price target, Spread/vs, ≥3 event subtypes) (§19.10)
- [ ] **SAFETY-23**: Sepolia staging requires ≥30 follow/fade positions across seeded calls (§19.10)
- [ ] **SAFETY-24**: Sepolia staging requires ≥3 settled calls per call type — verify outcome words, payouts, rep updates (§19.10)
- [ ] **SAFETY-25**: Sepolia staging requires ≥1 caller-exit triggered with broadcast verified (§19.10)
- [ ] **SAFETY-26**: Sepolia staging requires ≥1 challenge proposed-and-accepted cycle settled (§19.10)
- [ ] **SAFETY-27**: Sepolia staging requires ≥1 dispute raised and resolved via owner path (§19.10)
- [ ] **SAFETY-28**: Sepolia staging requires Pyth confidence retry exercised manually with `SettlementDelayed` flow verified (§19.10)
- [ ] **SAFETY-29**: All Phase 6 safety tests must pass on Sepolia before mainnet (§19.10, §19 Phase 6)
- [ ] **SAFETY-30**: Phase 6 verifies emergency pause buttons work on every state-changing function (§19 Phase 6)
- [ ] **SAFETY-31**: Phase 6 verifies TVL cap boundary — $4,999 OK, $5,001 reverts (§19 Phase 6)
- [ ] **SAFETY-32**: Phase 6 verifies max stake — $100 OK, $101 reverts (§19 Phase 6)
- [ ] **SAFETY-33**: Phase 6 verifies min position — $1 OK, $0.99 reverts (§19 Phase 6)
- [ ] **SAFETY-34**: Phase 6 verifies all withdraw/claim paths work while paused (§19 Phase 6, §10.3)
- [ ] **SAFETY-35**: Phase 6 verifies caller-exit 24h lock — 24h cannot exit, 24h+1s can exit, penalty math correct at all decay points (§19 Phase 6)
- [ ] **SAFETY-36**: Phase 6 verifies follower/fader position-exit 4h cooldown and 10% slash math (§19 Phase 6)
- [ ] **SAFETY-37**: Phase 6 verifies duplicate-hash detection for UTC-day-boundary edge cases (§19 Phase 6, §6.2)
- [ ] **SAFETY-38**: Phase 6 verifies slippage `minSharesOut` reverts when AMM moves between quote and execution (§19 Phase 6)
- [ ] **SAFETY-39**: Phase 6 verifies settlement idempotency — calling `settle` twice reverts cleanly (§19 Phase 6)
- [ ] **SAFETY-40**: Phase 6 verifies self-challenge gate — caller cannot challenge themselves (§19 Phase 6)
- [ ] **SAFETY-41**: Phase 6 verifies reentrancy guard with a USDC mock callback attempt — must revert (§19 Phase 6)
- [ ] **SAFETY-42**: Phase 6 verifies Stylus runtime fallback — deploy a deliberately reverting Stylus contract, verify Solidity baseline runs and `RepCalculatedFallback` fires (§19 Phase 6)
- [ ] **SAFETY-43**: Phase 6 verifies owner-only functions — non-owner cannot pause, setTvlCap, setSettlementManager, setRelayer, forceSettle, resolveDispute (§19 Phase 6)
- [ ] **SAFETY-44**: Post-deploy smoke test checklist (§19.11) is mandatory before public announcement — 20 minutes estimated (§19.11, App.A.1)
- [ ] **SAFETY-45**: Smoke test verifies `pause()` and `unpause()` execute from owner wallet and `paused()` view reflects state (§19.11)
- [ ] **SAFETY-46**: Smoke test attempts deposit while paused (reverts `Paused`) and withdrawal while paused (succeeds per §10.3 carve-out) (§19.11)
- [ ] **SAFETY-47**: Smoke test confirms `setTvlCap` and TVL boundary deposit at $4,901 + $99 succeeds; next $1 reverts `TvlCapReached` (§19.11)
- [ ] **SAFETY-48**: Smoke test runs min-stake ($4 reverts, $5 succeeds) and max-stake ($101 reverts, $100 succeeds) tests (§19.11)
- [ ] **SAFETY-49**: Smoke test exercises all 5 oracle adapters with synthetic test calls (Pyth/BTC, DefiLlama TVL, Snapshot/Tally proposal, CEX scrape, Alchemy CryptoPunks floor) (§19.11)
- [ ] **SAFETY-50**: Smoke test confirms OG image renders all 5 outcome words at 200px viewport thumbnail size (§19.11, §15.7)
- [ ] **SAFETY-51**: Smoke test completes all 3 sign-in paths to first authenticated session (§19.11)
- [ ] **SAFETY-52**: Smoke test completes funding flow via Coinbase Onramp AND direct USDC transfer (§19.11)
- [ ] **SAFETY-53**: Smoke test confirms first sponsored transaction succeeds via paymaster and counter increments (§19.11)
- [ ] **SAFETY-54**: Smoke test confirms receipt-link share works on Twitter (passes Twitter Card Validator) (§19.11)
- [ ] **SAFETY-55**: Smoke test confirms `forceSettle` is NOT callable within cooldown window (reverts `ForceSettleCooldownActive`) (§19.11)
- [ ] **SAFETY-56**: If any smoke test item fails, contracts are paused immediately and no public announcement is made (§19.11)
- [ ] **SAFETY-57**: Per-auth-method permission scoping — OAuth methods can view/sign but require 2nd factor for withdrawals over a threshold is a documented v1 limitation (App.A.1)
- [x] **SAFETY-58**: Single owner key controls pause / setTvlCap / forceSettle / proxy admin / resolveDispute in v1; documented promotion to multisig before v1.1 or before TVL exceeds $5K (§10.4, §10.8)

### UI Pages & Shared Components (UI)

- [ ] **UI-01**: The Tape feed page (`/`) renders price ticker strip (28px scrolling marquee), main nav header, left sidebar (nav + YOUR REP card), main column with tabs (Live calls / Settled / Following / Duels), filter, new call CTA, feed (§15.1)
- [ ] **UI-02**: Feed sections render in order: TOP CONVICTION pinned card → "From your X" → "From your Farcaster" → Live calls global stream (§15.1)
- [ ] **UI-03**: Call card structure follows the canonical layout — avatar + handle + rep score dot + VERIFIED badges + ⚔ OPEN + DUEL KING + countdown; call statement 28-32px; tag row (category + asset + stake); single conviction bar; action row (Follow filled / Fade outline / Challenge text+icon / Quote icon-only); top-right expand icon (§15.1)
- [ ] **UI-04**: Quote button shows NO quote count — quote is the lightest action (§15.1)
- [ ] **UI-05**: New Call page (`/new`) shows "Go on record." title, "Every field shapes the receipt — and the receipt is permanent." subtitle, Drafts·N button top right, split layout (form left + live preview right) (§15.2)
- [ ] **UI-06**: Live Receipt page (`/call/[id]`) renders sticky caller header, THE CALL hero, 4-stat row (Current Spread + progress bar / Time Left / Stake / Conviction), market positioning bar, 3 action buttons (Follow filled / Fade outline / Challenge orange outline), REASONING block, optional RESOLUTION CRITERIA collapsible block (§15.3)
- [ ] **UI-07**: Live Receipt CALLER EXITED variant renders amber banner "⚠ CALLER EXITED · veda exited this call [X] ago · $XX slashed", dims call statement, keeps market positioning bar live, retains action buttons for non-caller participants (§15.3, §8.7.3)
- [ ] **UI-08**: Profile page (`/profile/[address]`) renders top header (avatar + handle + verified badges + TOP X% GLOBAL + wallet address + joined date + counts), Connect socials card (own profile, conditional), Global Reputation hero card, Overview/Calls/Duels tabs (§15.4)
- [ ] **UI-09**: Profile Overview tab renders 5-stat row (Accuracy with benchmark / Calibration / ROI / Contrarian hits / Streak), CATEGORY REPUTATION grid (3 equal-width cards with strongest highlighted), recent calls list with filter chips, most followed by list, notable receipts trophy cards (§15.4)
- [ ] **UI-10**: Profile Settings exposes edit display handle, connect/disconnect Twitter, connect/disconnect Farcaster, export embedded wallet (§15.4)
- [ ] **UI-11**: Duel page (`/duel/[id]`) renders "THE MARKET" hero block (asset pair in massive type, question line, 3-stat row: live spread / pot / settles in), two-column duel card (CALLER left yellow-green / VS divider / CHALLENGER right orange) with parallel stat rows, MARKET CONSENSUS bar, Riding sections both sides, "Side with [caller]" / "Side with [challenger]" bottom CTAs (§15.5)
- [ ] **UI-12**: Leaderboard page (`/leaderboard`) renders "The Tape · Top of book" title, 7d/30d/All-time toggle, #1 Hero card with massive faded "01" watermark, category filter chips (All / Majors / DeFi / Other in v1), leaderboard table with podium treatment for ranks 02/03 (§15.6)
- [ ] **UI-13**: Leaderboard table columns: # / CALLER (avatar + handle + call count) / REP / ACC / BEST category / Δ 7D sparkline; viewer's own row gets `#1A1A24` background + yellow left border accent (§15.6)
- [ ] **UI-14**: Settled Receipt page (`/call/[id]` when status == Settled or Disputed) renders 3px page frame with 4px accent corner brackets, sticky caller header (NO wallet address per §15.7), Watch + Share + "Preview share card" button group (§15.7)
- [ ] **UI-15**: Settled Receipt call statement is Syne 48px with target value in accent yellow-green; subline "settled [N] ago · settles automatically from [oracle link]" (§15.7)
- [ ] **UI-16**: Settled Receipt outcome block is the visual hero — Syne 96px outcome word, 3px-bordered with matching hard offset shadow on `#111118` background, "by [caller] · ±X rep" subline (§15.7)
- [ ] **UI-17**: Outcome word variants render with locked colors — `CALLED IT` green `#4ADE80` / `LOUD AND WRONG` red `#F87171` / `CONTRARIAN HIT` accent `#E8F542` + CONTRARIAN lozenge / `COLD CALL` muted slate `#94A3B8` / `FADED CORRECTLY` accent + FADER WIN lozenge (§15.7, §16.3)
- [ ] **UI-18**: Outcome word readability gate — visible at 200px viewport width; if unreadable, design fails QA (§15.7, §16.3)
- [ ] **UI-19**: Settled Receipt stat row renders FINAL VALUE / TARGET / CONVICTION / P&L cells with 2px subtle border and visible internal dividers; P&L color is green positive / red negative / muted zero (§15.7)
- [ ] **UI-20**: Settled Receipt action row exposes "[ SHARE THE RECEIPT → ]" (filled accent, 3px black border, hard shadow) and "[ VIEW ALL CALLS BY veda ]" (outline 2px, no shadow); full-width stacked on mobile, side-by-side desktop (§15.7)
- [ ] **UI-21**: Settled Receipt FINAL POSITIONS block renders with 4px accent corner brackets, two-column followers/faders list sorted by P&L descending, capped at 20 rows per side with "view all" link (§15.7)
- [ ] **UI-22**: Settled Receipt Caller-Exited variant renders amber banner above outcome block with 3px `#FB923C` border and hard offset shadow; caller's handle in subline at 40% opacity (§15.7)
- [ ] **UI-23**: Settled Receipt Disputed variant replaces outcome block with "PENDING DISPUTE" amber-styled block; body explains who filed, when, evidence link, owner-review state, 24h SLA reminder (§15.7)
- [ ] **UI-24**: Sign-in screen (`/signin`) renders 3px `#2E2E42` frame border, 4px accent corner brackets at all 4 viewport corners, centered max-width 480px column, CALL IT wordmark (Syne 64px accent), tagline "Be right in public." (Space Grotesk 24px muted) (§15.8)
- [ ] **UI-25**: Onboarding flow (`/onboarding`) runs 4 screens (Handle / Connect Socials skippable / Follow-graph opt-in conditional / Tagline commitment) with STEP N OF 4 indicator and 3-screen square progress at top (§15.9)
- [ ] **UI-26**: Quote Call Composer (`/new?quote=[parentCallId]`) renders parent context card above the standard form with QUOTING label, parent caller info, parent statement italic Syne 20px, stake/conviction/follow/fade row, "settles in / view original" link; no corner brackets on parent card (§15.10)
- [ ] **UI-27**: Quote Composer renders YOUR THESIS textarea ABOVE the market-type segmented buttons (forces articulation before composition) (§15.10)
- [ ] **UI-28**: Quote Composer success screen shows thread preview + Share button (parent + quote as separate stacked OG cards in v1 thread) (§15.10)
- [ ] **UI-29**: Shared Loading Skeleton component supports 6 variants: `<CallCardSkeleton />`, `<ReceiptHeroSkeleton />`, `<ProfileHeaderSkeleton />`, `<LeaderboardRowSkeleton />`, `<DuelCardSkeleton />`, `<StatRowSkeleton />` (§15A.1)
- [ ] **UI-30**: Loading skeleton blocks use `#1A1A24` fill matching tertiary background, same outer dimensions and 2px `#1E1E2E` border as rendered card (no layout shift on load) (§15A.1)
- [ ] **UI-31**: Loading skeleton animation is subtle horizontal shimmer `#1A1A24 → #1E1E2E → #1A1A24` over 1500ms loop with very low contrast — no pulse, no spin, no corner brackets (§15A.1)
- [ ] **UI-32**: Shared Error/Status Toast component renders fixed top-right, stacks vertically with 8px gap, 3px solid border in status color (red `#F87171` / amber `#FB923C` / green `#4ADE80`), hard offset shadow, no rounding, 4px corner brackets at top-left + bottom-right (§15A.2)
- [ ] **UI-33**: Toast auto-dismiss timing: success 4s, warning 8s, error-without-actions 8s, error-with-actions does NOT auto-dismiss (§15A.2)
- [ ] **UI-34**: Toast countdown indicator is a 1px line along bottom edge draining left-to-right (§15A.2)
- [ ] **UI-35**: Toast stacking max 3 visible at once; additional toasts queue; identical title+body within 2s shows count badge ("×2", "×3") on original (§15A.2)
- [ ] **UI-36**: Toast entry slides in from right `translateX(100%) → 0` over 200ms ease-out; exit fades `opacity 1 → 0` over 150ms (§15A.2)
- [ ] **UI-37**: Toast status mapping: Success → call published / position exited / payout claimed; Warning → settlement delayed / caller exited; Error → tx reverts / USDC issues / network errors (§15A.2)
- [ ] **UI-38**: Color palette is locked — primary bg `#09090E`, secondary `#111118`, tertiary `#1A1A24`, quaternary `#13131D`, subtle border `#1E1E2E`, active border `#2E2E42`, accent `#E8F542`, win `#4ADE80`, loss `#F87171`, neutral `#94A3B8`, challenge orange `#FB923C` (§14.1)
- [ ] **UI-39**: Typography stack is locked — Syne (display), Space Grotesk (UI/body, Inter fallback), JetBrains Mono (addresses/data) with hierarchy: Display 64-96px / Headline 28-40px / Subhead 18-22px / Body 14-16px / Label 11-12px tracked-out / Data 13px monospace (§14.2)
- [ ] **UI-40**: Spacing base unit is 4px, card padding 20-24px, section spacing 48-64px, max content width 1120px (§14.3)
- [ ] **UI-41**: Neobrutalist treatment applies: 2-3px borders, hard offset shadows (`4px 4px 0 [color]`, never blurred), 0-2px corner radius max, 4px corner brackets on weight-carrying blocks (§14.6)
- [ ] **UI-42**: Corner brackets are 4px stroke in accent yellow-green `#E8F542` on data-significant blocks, `#2E2E42` on secondary; placed at top-left + bottom-right; absence of brackets signals secondary content (§14.6)
- [ ] **UI-43**: Buttons follow shadow language: idle = flat, hover = `4px 4px 0` offset, active/click = `2px 2px 0` (button "presses down") (§14.6)
- [ ] **UI-44**: Outcome blocks (settled receipts/duels) have a 3-4px border in the outcome color and a permanent hard offset shadow that "stamps in" on reveal (§14.6, §17.2)
- [ ] **UI-45**: Stamp animation on outcome reveal — scale `1.2 → 1.0` with overshoot to `0.98 → 1.0`, plus shadow expands from `0 0 0 transparent` to `4px 4px 0 [color]`, total 300ms ease-out; rep delta number counts up with green/red pulse (§15.7, §17.2)
- [ ] **UI-46**: Body labels use heavier letter-spacing in neobrutalist contexts (`0.12em` instead of `0.08em`); headlines never lighter than Space Grotesk weight 500 (§14.6)
- [ ] **UI-47**: Layouts default to asymmetric where the design permits (settled receipt, sign-in, leaderboard #1 hero) — symmetric layouts feel default (§14.6)
- [ ] **UI-48**: Mobile responsive treatment applies a 375px breakpoint to 7 critical pages — Feed (§15.1), Receipt Live (§15.3), Profile (§15.4), Settled Receipt (§15.7), Sign-in (§15.8), Onboarding (§15.9), Leaderboard (§15.6) (§19 Phase 9)
- [ ] **UI-49**: Mobile pattern is single-column layouts, full-width action buttons, left sidebar collapsed behind hamburger (§19 Phase 9)
- [ ] **UI-50**: Non-critical pages (Duel §15.5, Quote composer §15.10, New Call §15.2) get desktop-only banner "Best viewed on desktop" in v1 (§19 Phase 9)
- [ ] **UI-51**: Conviction slider fill color interpolates muted → accent as conviction rises; number ticks in real time (§17.2)
- [ ] **UI-52**: Follow/Fade button press compresses to `scale: 0.97` then springs back; count increments with number flip (§17.2)
- [ ] **UI-53**: Feed cards enter staggered — `translateY: 8px → 0` + `opacity: 0 → 1`, 60ms stagger between cards (§17.2)
- [ ] **UI-54**: Live odds bar slides smoothly as new positions come in — never jumps (§17.2)
- [ ] **UI-55**: Page transitions use horizontal slide for tab switches, vertical slide-up for modals — no fade-to-black (§17.2)
- [ ] **UI-56**: Real-time UI updates use 5-second polling at hackathon launch (WebSocket migration is v1.1) (App.A.1)

### Off-chain Receipt Card & Share (SHARE)

- [ ] **SHARE-01**: Off-chain OG image service generates 1200×630px PNG cards via Node.js using Satori or `@vercel/og` (§16.1, §18.2)
- [ ] **SHARE-02**: OG service is hosted at `api.callitapp.xyz/og/[callId]` (§19 Phase 7)
- [ ] **SHARE-03**: OG images are cached on CDN and regenerated when call state changes — new follow/fade activity or settlement (§16.1, §19 Phase 7)
- [ ] **SHARE-04**: Live State Card (variant 1) — Call It wordmark top-left + Arbitrum logo top-right + center call statement + "by [caller] · X% conviction · stake $XXX" + follow%/fade% progress bar + time-left countdown + corner bracket motif (§16.2)
- [ ] **SHARE-05**: Settled State Card (variant 2) — Call It wordmark + Arbitrum logo + center outcome word as visual hero (Syne display) + original call statement below + P&L / Rep change / Final / Conviction stats row + caller avatar + handle + current global rep + corner brackets (§16.3)
- [ ] **SHARE-06**: Outcome word color mapping on cards matches §15.7 — CALLED IT green, LOUD AND WRONG red, CONTRARIAN HIT accent, COLD CALL muted, FADED CORRECTLY accent (§16.3)
- [ ] **SHARE-07**: Duel Settled Card (variant 3) — two-column hero with winner avatar (~180px) + winner handle + WINS in Syne next to winner's column; loser avatar dimmed to 40%; pot ("Pot: $X,XXX · winner takes all"); rep deltas paired; market + target small text; Call It + Arbitrum branding bottom corners (§16.4)
- [ ] **SHARE-08**: Caller Exited Card (variant 4) — "CALLER EXITED" massive amber `#FB923C` hero + caller avatar dimmed + original call statement + stats row (time before exit / stake slashed / reputation impact) + note "Call continues for followers and faders. Settles at [expiry]." + corner brackets; auto-generates on `CallerExited` event (§16.5)
- [x] **SHARE-09**: Fallback Card (variant 5) "A CALL WAS MADE" — 3px accent border + 4px accent corner brackets all 4 corners + `#09090E` bg + CALL IT wordmark Syne 48px + asymmetric hero "A CALL WAS MADE" Syne 64px + "by @[handle]" + "The receipt is being prepared. Tap to view live." + footer (§16.6)
- [x] **SHARE-10**: Fallback Card serves when real receipt URL returns 404 (cache not warm) OR settled image hasn't regenerated OR OG service is fully down; CDN cache 60 seconds (§16.6)
- [x] **SHARE-11**: Fallback Card renders in <100ms using stripped template that pulls only `[handle]` from URL (§16.6)
- [ ] **SHARE-12**: 200px-viewport thumbnail readability QA gate runs on every outcome word variant before mainnet announce (§15.7, §16.3, §19.11)
- [ ] **SHARE-13**: Receipt OG cards must pass the Twitter Card Validator (`cards-dev.twitter.com/validator`) smoke test before mainnet announcement (§19.11)
- [ ] **SHARE-14**: Receipt page server-renders OpenGraph meta tags referencing the OG card URL (§18.2, §19 Phase 7)
- [ ] **SHARE-15**: Share button on receipt page generates Twitter intent URL (verified to pass Twitter Card Validator) (§15.7, §19.11)
- [ ] **SHARE-16**: Auto-post receipt to socials on settle is default ON per Advanced Settings toggle (§15.2, §16)
- [ ] **SHARE-17**: Auto-post never modifies user's X account beyond posting — read-only graph access elsewhere (§9.9)
- [ ] **SHARE-18**: Farcaster cast URL construction is supported parallel to Twitter intent (§18.3, §16)
- [ ] **SHARE-19**: Farcaster Frames are added in Phase 8 as the final phase if time permits — Frame buttons enable Follow / Fade / Challenge from a Farcaster post; OpenGraph meta tags + Frame server endpoint (§18.3, §19 Phase 8)
- [ ] **SHARE-20**: Receipts are off-chain OG images referenced onchain by hash for verification — NOT NFTs in v1 (§18.2)
- [ ] **SHARE-21**: Receipt page loads without auth (public-by-default per §18.1); sign-in CTA prominent for unauthenticated viewers (§18.1)

### Operations & Observability (OPS)

- [x] **OPS-01**: The Graph subgraph is the primary indexed event source from day 1 on the Decentralized Network (§19, App.A.1)
- [x] **OPS-02**: Polled-events fallback runs during subgraph deploy gaps (hackathon backup) (§19, App.A.1)
- [x] **OPS-03**: Subgraph indexes `CallCreated`, `CallSettled`, `CallQuoted`, `ConvictionCapped`, `CallerExited`, `Followed`, `Faded`, `PayoutClaimed`, `PositionExited`, `ChallengeProposed`, `ChallengeAccepted`, `ChallengeRejected`, `ChallengeRefunded`, `ChallengeSettled`, `DisputeRaised`, `DisputeResolved`, `CallForceSettled`, `RepCalculated`, `RepCalculatedFallback`, `SettlementDelayed`, `ProfileUpdated`, `SocialLinked`, `SocialUnlinked` events (§12.1–12.5)
- [ ] **OPS-04**: Subgraph indexes CallCreated within ~30s of emission (§19 Phase 6 share-loop dependency)
- [x] **OPS-05**: Structured relayer logging (Pino or equivalent) emits one line per oracle query, settlement submission, and dispute (§19.10, App.A.1)
- [x] **OPS-06**: Metrics dashboard exposes Total TVL, calls/hour, settlement latency, dispute rate, failed-tx rate at minimum (App.A.1)
- [x] **OPS-07**: Telegram bot alerts on failed `settle()` invocation (App.A.1)
- [x] **OPS-08**: Telegram bot alerts on `pause()` invocation (App.A.1)
- [x] **OPS-09**: Telegram bot alerts on dispute raised (App.A.1)
- [x] **OPS-10**: Telegram bot alerts when paymaster daily spend hits 80% of cap (§10.7)
- [x] **OPS-11**: Telegram bot alerts when TVL approaches the cap (App.A.1)
- [x] **OPS-12**: Telegram bot alerts on `RepCalculatedFallback` firing (Stylus revert investigation trigger) (§11.6)
- [x] **OPS-13**: Telegram bot alerts on `CallForceSettled` invocation (loud manual override) (§12.4)
- [x] **OPS-14**: Telegram bot alerts when settlement is stuck >25 min (approaching SLA breach) (§13.7)
- [ ] **OPS-15**: Settlement-stuck runbook documents `forceSettle` invocation criteria after 7-day cooldown from expiry (§10.7, §12.4)
- [ ] **OPS-16**: Stylus reactivation runbook documents the 365-day cycle (Stylus contracts require periodic reactivation) (§10.8 implicit, §11.6)
- [x] **OPS-17**: Per-exchange CEX scraper resilience — each of 8 scrapers (Binance, Coinbase, OKX, Bybit, Kraken, Bitget, KuCoin, Upbit) operates independently and reports its own health (§13.6)
- [x] **OPS-18**: NFT TWAP operator runbook includes a sanity-check script that re-computes TWAP from on-chain transfer logs and flags mismatches (§13.2)
- [x] **OPS-19**: Relayer signing keys are held in a KMS / secret manager (App.A.1, §13.2)
- [x] **OPS-20**: Demo seed plan funds 10-15 calls across both Privy and external wallets for realism (App.A.1, §18.4)
- [x] **OPS-21**: Network is Arbitrum Mainnet hardcoded; not multi-chain in v1 (§10.5)
- [x] **OPS-22**: Currency is USDC on Arbitrum — hardcoded address in every transfer path (§10.5)
- [x] **OPS-23**: Frontend stack: Next.js (App Router) + React + Privy + wagmi/viem + Tailwind (project constraint, §9.2)
- [x] **OPS-24**: Backend stack: Node.js + Fastify on Railway or Fly.io; hosts the relayer (oracle queries, signed submissions, CEX scrapers, OG image generation) (project constraint)
- [x] **OPS-25**: Owner is informed of `RepCalculatedFallback` and can manually compensate the user offline if Stylus revert caused calculation distortion (§11.6)
- [x] **OPS-26**: Sponsored campaigns (protocol-sponsored seasons) — owner-controlled allowlist additions; sponsor wallets are subject to all anti-spam gates (§18.4, §4.4)

---

## v2 Requirements

Deferred to v1.1 / v2. Tracked but not in current roadmap. Same REQ-ID schema; no checkbox.

### Notifications

- **NOTIF-01** (v2): Notification system with delivery — bell icon in header is rendered in v1 but triggers no notifications (§20.1, v1.1)
- **NOTIF-02** (v2): Notification triggers — settled call, challenge proposed, challenge accepted, caller exited on followed call, dispute opened, paymaster cap hit (§20.1, v1.1)
- **NOTIF-03** (v2): Notification delivery surfaces — in-app dropdown, email digest, Telegram, Farcaster cast (§20.1, v1.1)
- **NOTIF-04** (v2): Watch / Notify delivery — Watch button on receipt page creates in-app subscription only in v1; full delivery wires up alongside §20.1 (§20.3, v1.1)
- **NOTIF-05** (v2): Notification preferences UI in Profile → Settings (§15.4 noted as post-MVP)

### Search

- **SEARCH-01** (v2): Search UI surface — leaderboard + feed are v1 discovery; search bar in header has no defined behavior or results UI in v1 (§20.2, v1.1)

### Reputation Gating

- **REP-V2-01** (v2): Reputation-gated per-call stake limits (higher rep → higher per-call ceiling) — $100 cap applies to everyone in v1 (§7.8)

### Disputes

- **DISP-V2-01** (v2): Decentralized dispute resolution (Kleros integration or token-weighted vote) — owner-resolved in v1 (§13.7, post-hackathon)
- **DISP-V2-02** (v2): Dispute reviewer UI — disputes in v1 are owner-resolved via direct contract call; reviewer UI moves alongside §20.1 notification system (§20.4)

### Curated Groups

- **LEAGUE-V2-01** (v2): Leagues / curated groups (e.g., "Arbitrum DeFi Season") — public-by-default in v1 (§18.1, v1.1+)

### NFT Receipts

- **NFT-V2-01** (v2): Reputation NFTs / NFT-minted receipts — receipts are off-chain OG images in v1, not NFTs (§18.2)

### Real-time

- **RT-V2-01** (v2): WebSocket real-time UI updates — 5-second polling at v1 launch (App.A.1)

### Anti-Sybil

- **SYBIL-V2-01** (v2): CAPTCHA on sign-up — deferred to v1.1 pending real abuse signal; daily paymaster cap is primary defense in v1 (§10.7)

### Withdrawal Auth

- **AUTH-V2-01** (v2): Per-auth-method 2FA for large withdrawals — documented limitation in v1 at $100/call cap (App.A.1)

### Expanded Categories

- **REP-V2-02** (v2): Reputation category expansion beyond 3 (Memecoins, Layer 2s, Restaking, etc.) — append to enum without renumbering (§7.5)

### Mobile Responsive (non-critical pages)

- **UI-V2-01** (v2): Mobile responsive treatment for Duel, Quote composer, New Call — desktop-only banner in v1 (§19 Phase 9)

### Frames

- **FRAME-V2-01** (v2): Farcaster Frames thread image rendering for Quote calls — v1 ships parent + quote as separate stacked OG cards in a Twitter thread (§15.10)

---

## Out of Scope

Explicitly excluded. Documented to prevent scope creep. Pulled from spec §4.5 (deferred event types), §4.6 (cut entirely), and additional anti-features.

| Feature | Reason | Spec Section |
|---------|--------|--------------|
| Macro / regulatory events (SEC ETF approvals, Fed rate decisions, political outcomes) | Needs dedicated human-curated oracle team; v2 — Polymarket/Kalshi have moats here that Call It cannot match without 10-person oracle team | §4.5 |
| Multi-condition compound calls ("BTC > $100k AND ETH > $5k") | Needs composite resolution logic; v2 | §4.5 |
| Range / band predictions ("ETH stays between $3,500 and $4,200 all month") | Needs path-dependent settlement that v1 oracle stack cannot guarantee; v2 | §4.5 |
| First-to-X / race events ("Berachain mainnet launches before Monad") | Needs tracking of two events against each other; v2 | §4.5 |
| NFT mint outcomes ("X collection sells out in first 24h") | Needs mint-specific oracle integration; v2 | §4.5 |
| Social engagement events (tweet likes, follower counts, cast recasts) | Trivially manipulable via botting; fundamentally incompatible with credibility-based product — cut entirely | §4.6 |
| Personal / interpersonal predictions ("@person subtweets @other_person this month") | Subjective and unverifiable — cut entirely | §4.6 |
| Engagement / ratings events on Farcaster casts | Same manipulation surface as Twitter; bots are cheaper on Farcaster — cut entirely | §4.6 (extension) |
| Notification delivery system | v1.1 — bell icon rendered, no delivery; auto-post-to-X is v1 substitute | §20.1 |
| Search UI surface | v1.1 — leaderboard + feed are v1 discovery surfaces | §20.2 |
| Watch / Notify delivery | v1.1 — Watch button creates in-app subscription only | §20.3 |
| Reputation-gated stake limits | v1 has no gating; the $100 cap applies to everyone regardless of rep | §7.8 |
| Leagues / curated groups | Public-by-default in v1; v1.1+ | §18.1 |
| Decentralized dispute resolution (Kleros / token vote) | Owner-resolved in v1; post-hackathon | §13.7 |
| Reputation NFTs / NFT receipts | Receipts are off-chain OG images in v1, not NFTs | §18.2 |
| Mobile responsive pass for non-critical pages (Duel, Quote composer, New Call) | Desktop-only banner in v1; 7 critical pages get responsive treatment | §19 Phase 9 |
| MetaMask backup path beyond Privy (separate non-Privy auth flow) | Privy is the single auth provider; SIWE Connect Wallet covers EOA | §9.1, App.A.1 |
| WebSocket real-time UI updates | 5-second polling at hackathon launch; WebSocket is v1.1 | App.A.1 |
| CAPTCHA on sign-up | Daily paymaster cap is the primary defense at hackathon scale; v1.1 if abuse appears | §10.7 |
| Per-auth-method 2FA for large withdrawals | Documented limitation in v1 at $100/call cap | App.A.1 |
| Cancellation mechanic for published calls | Intentionally absent — publishing is a commitment; only callerExit after 24h lock | §8.7.4 |
| Rate limiting per caller (daily caps on call creation) | Deliberately not gated in v1; the three §6 gates suffice | §6.4 |
| Minimum movement threshold (target distance from current) | The AMM handles this — trivial calls earn minimal rewards | §6.4 |
| Mandatory reasoning field | Optional at all stake levels — some calls don't need explanation | §6.4 |
| Category quotas on caller activity | Global vs category sub-score reveals edge naturally | §6.4 |
| BASE coin on the allowlist | No spot token exists; no Pyth feed; removed | §4.4 |
| Reservoir NFT API integration | Reservoir sunset their NFT API October 15, 2025; replaced by Alchemy NFT API | §13.2 |
| Mid-call position tradeability (secondary market) | Positions are not tradeable mid-call — exits possible only via penalty-slashed cooldown path | App.A |
| Bonding curve pricing model | Rejected in favor of parimutuel AMM to avoid growth-speculation distortion of probability signal | App.A |
| Quote count badge on Quote button | Quote is the lightest action — no count surfaced | §15.1 |
| Per-call FollowFadeMarket proxy contracts | Rejected; single contract with sub-state keyed by callId locked per §11.2 | §11.2, App.A.1 |
| Upgradability on CallRegistry / FollowFadeMarket / ChallengeEscrow / SettlementManager / ProfileRegistry | NOT upgradable in v1; pause + redeploy is rollback policy | §10.8, App.A.1 |
| Address on shareable receipt | Internal Privy address never surfaced for share moments — handle + rep + outcome only | §15.7, App.A.1 |
| Multi-chain deployment | Arbitrum Mainnet hardcoded in v1; not multi-chain | Project constraint |
| Multiple ERC20 settlement assets | USDC address hardcoded in every transfer path; adding another requires explicit code change + audit | §10.5 |

---

## Traceability

Which phases cover which requirements. Updated during roadmap creation by the roadmapper — initially all entries are `Phase: TBD | Status: Pending`.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| AUTH-05 | Phase 1 | Pending |
| AUTH-06 | Phase 1.5 | Pending |
| AUTH-07 | Phase 1.5 | Pending |
| AUTH-08 | Phase 1 | Pending |
| AUTH-09 | Phase 1.5 | Pending |
| AUTH-10 | Phase 1.5 | Pending |
| AUTH-11 | Phase 1 | Pending |
| AUTH-12 | Phase 1.5 | Pending |
| AUTH-13 | Phase 1.5 | Pending |
| AUTH-14 | Phase 1.5 | Pending |
| AUTH-15 | Phase 1.5 | Pending |
| AUTH-16 | Phase 1.5 | Pending |
| AUTH-17 | Phase 1.5 | Pending |
| AUTH-18 | Phase 1.5 | Pending |
| AUTH-19 | Phase 1 | Pending |
| AUTH-20 | Phase 1 | Pending |
| AUTH-21 | Phase 1 | Pending |
| AUTH-22 | Phase 1 | Pending |
| AUTH-23 | Phase 1 | Pending |
| AUTH-24 | Phase 1 | Pending |
| AUTH-25 | Phase 1 | Pending |
| AUTH-26 | Phase 1 | Pending |
| AUTH-27 | Phase 1 | Pending |
| AUTH-28 | Phase 1 | Pending |
| AUTH-29 | Phase 1 | Pending |
| AUTH-30 | Phase 1 | Pending |
| AUTH-31 | Phase 1 | Pending |
| AUTH-32 | Phase 1 | Pending |
| AUTH-33 | Phase 1 | Pending |
| AUTH-34 | Phase 1 | Pending |
| AUTH-35 | Phase 1 | Pending |
| AUTH-36 | Phase 1 | Pending |
| AUTH-37 | Phase 1 | Pending |
| AUTH-38 | Phase 1 | Pending |
| AUTH-39 | Phase 1 | Pending |
| AUTH-40 | Phase 1 | Pending |
| AUTH-41 | Phase 1 | Pending |
| AUTH-42 | Phase 1 | Pending |
| AUTH-43 | Phase 1 | Pending |
| AUTH-44 | Phase 1 | Pending |
| CALL-01 | Phase 1 | Pending |
| CALL-02 | Phase 1 | Pending |
| CALL-03 | Phase 1 | Pending |
| CALL-04 | Phase 1 | Pending |
| CALL-05 | Phase 1 | Pending |
| CALL-06 | Phase 1 | Pending |
| CALL-07 | Phase 1 | Pending |
| CALL-08 | Phase 1 | Pending |
| CALL-09 | Phase 1 | Pending |
| CALL-10 | Phase 1 | Pending |
| CALL-11 | Phase 1 | Pending |
| CALL-12 | Phase 1 | Pending |
| CALL-13 | Phase 1 | Pending |
| CALL-14 | Phase 1 | Pending |
| CALL-15 | Phase 1 | Pending |
| CALL-16 | Phase 1 | Pending |
| CALL-17 | Phase 1 | Pending |
| CALL-18 | Phase 1 | Pending |
| CALL-19 | Phase 1 | Pending |
| CALL-20 | Phase 1 | Pending |
| CALL-21 | Phase 1 | Pending |
| CALL-22 | Phase 1 | Pending |
| CALL-23 | Phase 1 | Pending |
| CALL-24 | Phase 1 | Pending |
| CALL-25 | Phase 1 | Pending |
| CALL-26 | Phase 1 | Pending |
| CALL-27 | Phase 1 | Pending |
| CALL-28 | Phase 1 | Pending |
| CALL-29 | Phase 1 | Pending |
| CALL-30 | Phase 1 | Pending |
| CALL-31 | Phase 1 | Pending |
| CALL-32 | Phase 1 | Pending |
| CALL-33 | Phase 1 | Pending |
| CALL-34 | Phase 1 | Pending |
| CALL-35 | Phase 1 | Pending |
| CALL-36 | Phase 1 | Pending |
| CALL-37 | Phase 1 | Pending |
| CALL-38 | Phase 1 | Pending |
| CALL-39 | Phase 1 | Pending |
| CALL-40 | Phase 1 | Pending |
| CALL-41 | Phase 1 | Pending |
| CALL-42 | Phase 1 | Pending |
| CALL-43 | Phase 1 | Pending |
| CALL-44 | Phase 1 | Pending |
| CALL-45 | Phase 1 | Pending |
| CALL-46 | Phase 1 | Pending |
| CALL-47 | Phase 1 | Pending |
| CALL-48 | Phase 1 | Pending |
| CALL-49 | Phase 1 | Pending |
| CALL-50 | Phase 1 | Pending |
| CALL-51 | Phase 1 | Pending |
| CALL-52 | Phase 1 | Pending |
| CALL-53 | Phase 1 | Pending |
| CALL-54 | Phase 1 | Pending |
| CALL-55 | Phase 1 | Pending |
| CALL-56 | Phase 1 | Pending |
| CALL-57 | Phase 1 | Pending |
| CALL-58 | Phase 1 | Pending |
| CALL-59 | Phase 1 | Pending |
| CALL-60 | Phase 1 | Pending |
| CALL-61 | Phase 1 | Pending |
| CALL-62 | Phase 1 | Pending |
| CALL-63 | Phase 1 | Pending |
| CALL-64 | Phase 1 | Pending |
| CALL-65 | Phase 1 | Pending |
| CALL-66 | Phase 1 | Pending |
| CALL-67 | Phase 1 | Pending |
| CALL-68 | Phase 1 | Pending |
| CALL-69 | Phase 1 | Pending |
| CALL-70 | Phase 1 | Pending |
| SOCIAL-01 | Phase 2 | Complete |
| SOCIAL-02 | Phase 2 | Complete |
| SOCIAL-03 | Phase 2 | Complete |
| SOCIAL-04 | Phase 2 | Complete |
| SOCIAL-05 | Phase 2 | Complete |
| SOCIAL-06 | Phase 2 | Complete |
| SOCIAL-07 | Phase 2 | Complete |
| SOCIAL-08 | Phase 2 | Complete |
| SOCIAL-09 | Phase 2 | Complete |
| SOCIAL-10 | Phase 2 | Complete |
| SOCIAL-11 | Phase 2 | Complete |
| SOCIAL-12 | Phase 2 | Complete |
| SOCIAL-13 | Phase 2 | Complete |
| SOCIAL-14 | Phase 2 | Complete |
| SOCIAL-15 | Phase 2 | Complete |
| SOCIAL-16 | Phase 2 | Complete |
| SOCIAL-17 | Phase 2 | Complete |
| SOCIAL-18 | Phase 2 | Complete |
| SOCIAL-19 | Phase 2 | Complete |
| SOCIAL-20 | Phase 2 | Complete |
| SOCIAL-21 | Phase 2 | Complete |
| SOCIAL-22 | Phase 2 | Complete |
| SOCIAL-23 | Phase 2 | Pending |
| SOCIAL-24 | Phase 2 | Pending |
| SOCIAL-25 | Phase 2 | Pending |
| SOCIAL-26 | Phase 2 | Complete |
| SOCIAL-27 | Phase 2 | Complete |
| SOCIAL-28 | Phase 2 | Complete |
| SOCIAL-29 | Phase 3 | Pending |
| SOCIAL-30 | Phase 3 | Pending |
| SOCIAL-31 | Phase 3 | Pending |
| SOCIAL-32 | Phase 3 | Pending |
| SOCIAL-33 | Phase 3 | Pending |
| SOCIAL-34 | Phase 3 | Pending |
| SOCIAL-35 | Phase 3 | Pending |
| SOCIAL-36 | Phase 3 | Pending |
| SOCIAL-37 | Phase 3 | Pending |
| SOCIAL-38 | Phase 3 | Pending |
| SOCIAL-39 | Phase 3 | Pending |
| SOCIAL-40 | Phase 3 | Pending |
| SOCIAL-41 | Phase 3 | Pending |
| SOCIAL-42 | Phase 3 | Pending |
| SOCIAL-43 | Phase 2 | Pending |
| SOCIAL-44 | Phase 2 | Pending |
| SOCIAL-45 | Phase 2 | Pending |
| SOCIAL-46 | Phase 3 | Pending |
| SOCIAL-47 | Phase 3 | Pending |
| SOCIAL-48 | Phase 3 | Pending |
| SOCIAL-49 | Phase 3 | Pending |
| SOCIAL-50 | Phase 3 | Pending |
| SOCIAL-51 | Phase 3 | Pending |
| REP-01 | Phase 1 | Pending |
| REP-02 | Phase 1 | Pending |
| REP-03 | Phase 4 | Pending |
| REP-04 | Phase 4 | Pending |
| REP-05 | Phase 4 | Pending |
| REP-06 | Phase 4 | Pending |
| REP-07 | Phase 4 | Pending |
| REP-08 | Phase 4 | Pending |
| REP-09 | Phase 4 | Pending |
| REP-10 | Phase 4 | Pending |
| REP-11 | Phase 4 | Pending |
| REP-12 | Phase 4 | Pending |
| REP-13 | Phase 4 | Pending |
| REP-14 | Phase 4 | Pending |
| REP-15 | Phase 4 | Pending |
| REP-16 | Phase 4 | Pending |
| REP-17 | Phase 1 | Pending |
| REP-18 | Phase 1 | Pending |
| REP-19 | Phase 5 | Pending |
| REP-20 | Phase 5 | Pending |
| REP-21 | Phase 5 | Pending |
| REP-22 | Phase 4 | Pending |
| REP-23 | Phase 4 | Pending |
| REP-24 | Phase 5 | Pending |
| REP-25 | Phase 4 | Pending |
| REP-26 | Phase 4 | Pending |
| REP-27 | Phase 4 | Pending |
| REP-28 | Phase 1 | Pending |
| REP-29 | Phase 1 | Pending |
| SETTLE-01 | Phase 4 | Pending |
| SETTLE-02 | Phase 4 | Pending |
| SETTLE-03 | Phase 4 | Pending |
| SETTLE-04 | Phase 4 | Pending |
| SETTLE-05 | Phase 4 | Pending |
| SETTLE-06 | Phase 4 | Pending |
| SETTLE-07 | Phase 4 | Pending |
| SETTLE-08 | Phase 4 | Pending |
| SETTLE-09 | Phase 4 | Pending |
| SETTLE-10 | Phase 4 | Pending |
| SETTLE-11 | Phase 4 | Pending |
| SETTLE-12 | Phase 4 | Pending |
| SETTLE-13 | Phase 4 | Pending |
| SETTLE-14 | Phase 4 | Pending |
| SETTLE-15 | Phase 4 | Pending |
| SETTLE-16 | Phase 4 | Pending |
| SETTLE-17 | Phase 4 | Pending |
| SETTLE-18 | Phase 4 | Pending |
| SETTLE-19 | Phase 4 | Pending |
| SETTLE-20 | Phase 4 | Pending |
| SETTLE-21 | Phase 4 | Pending |
| SETTLE-22 | Phase 4 | Pending |
| SETTLE-23 | Phase 4 | Pending |
| SETTLE-24 | Phase 4 | Pending |
| SETTLE-25 | Phase 4 | Pending |
| SETTLE-26 | Phase 4 | Pending |
| SETTLE-27 | Phase 4 | Pending |
| SETTLE-28 | Phase 4 | Pending |
| SETTLE-29 | Phase 4 | Pending |
| SETTLE-30 | Phase 4 | Pending |
| SETTLE-31 | Phase 4 | Pending |
| SETTLE-32 | Phase 4 | Pending |
| SETTLE-33 | Phase 4 | Pending |
| SETTLE-34 | Phase 4 | Pending |
| SETTLE-35 | Phase 4 | Pending |
| SETTLE-36 | Phase 4 | Pending |
| SETTLE-37 | Phase 4 | Pending |
| SETTLE-38 | Phase 4 | Pending |
| SETTLE-39 | Phase 4 | Pending |
| SETTLE-40 | Phase 4 | Pending |
| SETTLE-41 | Phase 4 | Pending |
| SETTLE-42 | Phase 4 | Pending |
| SETTLE-43 | Phase 4 | Pending |
| SETTLE-44 | Phase 4 | Pending |
| SETTLE-45 | Phase 4 | Pending |
| SETTLE-46 | Phase 4 | Pending |
| SETTLE-47 | Phase 4 | Pending |
| SETTLE-48 | Phase 4 | Pending |
| SETTLE-49 | Phase 4 | Pending |
| SETTLE-50 | Phase 4 | Pending |
| SETTLE-51 | Phase 4 | Pending |
| SETTLE-52 | Phase 4 | Pending |
| SAFETY-01 | Phase 1 | Pending |
| SAFETY-02 | Phase 6 | Pending |
| SAFETY-03 | Phase 6 | Pending |
| SAFETY-04 | Phase 1 | Pending |
| SAFETY-05 | Phase 1 | Pending |
| SAFETY-06 | Phase 1 | Pending |
| SAFETY-07 | Phase 1 | Pending |
| SAFETY-08 | Phase 1 | Pending |
| SAFETY-09 | Phase 1 | Pending |
| SAFETY-10 | Phase 1 | Pending |
| SAFETY-11 | Phase 1 | Pending |
| SAFETY-12 | Phase 0 | Complete |
| SAFETY-13 | Phase 0 | Complete |
| SAFETY-14 | Phase 1 | Pending |
| SAFETY-15 | Phase 0 | Complete |
| SAFETY-16 | Phase 0 | Complete |
| SAFETY-17 | Phase 0 | Complete |
| SAFETY-18 | Phase 1 | Pending |
| SAFETY-19 | Phase 6 | Pending |
| SAFETY-20 | Phase 6 | Pending |
| SAFETY-21 | Phase 6 | Pending |
| SAFETY-22 | Phase 6 | Pending |
| SAFETY-23 | Phase 6 | Pending |
| SAFETY-24 | Phase 6 | Pending |
| SAFETY-25 | Phase 6 | Pending |
| SAFETY-26 | Phase 6 | Pending |
| SAFETY-27 | Phase 6 | Pending |
| SAFETY-28 | Phase 6 | Pending |
| SAFETY-29 | Phase 6 | Pending |
| SAFETY-30 | Phase 6 | Pending |
| SAFETY-31 | Phase 6 | Pending |
| SAFETY-32 | Phase 6 | Pending |
| SAFETY-33 | Phase 6 | Pending |
| SAFETY-34 | Phase 6 | Pending |
| SAFETY-35 | Phase 6 | Pending |
| SAFETY-36 | Phase 6 | Pending |
| SAFETY-37 | Phase 6 | Pending |
| SAFETY-38 | Phase 6 | Pending |
| SAFETY-39 | Phase 6 | Pending |
| SAFETY-40 | Phase 6 | Pending |
| SAFETY-41 | Phase 6 | Pending |
| SAFETY-42 | Phase 6 | Pending |
| SAFETY-43 | Phase 6 | Pending |
| SAFETY-44 | Phase 7.5 | Pending |
| SAFETY-45 | Phase 7.5 | Pending |
| SAFETY-46 | Phase 7.5 | Pending |
| SAFETY-47 | Phase 7.5 | Pending |
| SAFETY-48 | Phase 7.5 | Pending |
| SAFETY-49 | Phase 7.5 | Pending |
| SAFETY-50 | Phase 7.5 | Pending |
| SAFETY-51 | Phase 7.5 | Pending |
| SAFETY-52 | Phase 7.5 | Pending |
| SAFETY-53 | Phase 7.5 | Pending |
| SAFETY-54 | Phase 7.5 | Pending |
| SAFETY-55 | Phase 7.5 | Pending |
| SAFETY-56 | Phase 7.5 | Pending |
| SAFETY-57 | Phase 4 | Pending |
| SAFETY-58 | Phase 0 | Complete |
| UI-01 | Phase 1 | Pending |
| UI-02 | Phase 1 | Pending |
| UI-03 | Phase 1 | Pending |
| UI-04 | Phase 1 | Pending |
| UI-05 | Phase 1 | Pending |
| UI-06 | Phase 2 | Pending |
| UI-07 | Phase 2 | Pending |
| UI-08 | Phase 1 | Pending |
| UI-09 | Phase 7 | Pending |
| UI-10 | Phase 1 | Pending |
| UI-11 | Phase 3 | Pending |
| UI-12 | Phase 7 | Pending |
| UI-13 | Phase 7 | Pending |
| UI-14 | Phase 4 | Pending |
| UI-15 | Phase 4 | Pending |
| UI-16 | Phase 4 | Pending |
| UI-17 | Phase 4 | Pending |
| UI-18 | Phase 4 | Pending |
| UI-19 | Phase 4 | Pending |
| UI-20 | Phase 4 | Pending |
| UI-21 | Phase 4 | Pending |
| UI-22 | Phase 4 | Pending |
| UI-23 | Phase 4 | Pending |
| UI-24 | Phase 1 | Pending |
| UI-25 | Phase 1 | Pending |
| UI-26 | Phase 7 | Pending |
| UI-27 | Phase 7 | Pending |
| UI-28 | Phase 7 | Pending |
| UI-29 | Phase 1 | Pending |
| UI-30 | Phase 1 | Pending |
| UI-31 | Phase 1 | Pending |
| UI-32 | Phase 1 | Pending |
| UI-33 | Phase 1 | Pending |
| UI-34 | Phase 1 | Pending |
| UI-35 | Phase 1 | Pending |
| UI-36 | Phase 1 | Pending |
| UI-37 | Phase 1 | Pending |
| UI-38 | Phase 1 | Pending |
| UI-39 | Phase 1 | Pending |
| UI-40 | Phase 1 | Pending |
| UI-41 | Phase 1 | Pending |
| UI-42 | Phase 1 | Pending |
| UI-43 | Phase 1 | Pending |
| UI-44 | Phase 4 | Pending |
| UI-45 | Phase 4 | Pending |
| UI-46 | Phase 1 | Pending |
| UI-47 | Phase 1 | Pending |
| UI-48 | Phase 9 | Pending |
| UI-49 | Phase 9 | Pending |
| UI-50 | Phase 9 | Pending |
| UI-51 | Phase 1 | Pending |
| UI-52 | Phase 4 | Pending |
| UI-53 | Phase 1 | Pending |
| UI-54 | Phase 4 | Pending |
| UI-55 | Phase 1 | Pending |
| UI-56 | Phase 1 | Pending |
| SHARE-01 | Phase 7 | Pending |
| SHARE-02 | Phase 7 | Pending |
| SHARE-03 | Phase 7 | Pending |
| SHARE-04 | Phase 2 | Pending |
| SHARE-05 | Phase 4 | Pending |
| SHARE-06 | Phase 4 | Pending |
| SHARE-07 | Phase 3 | Pending |
| SHARE-08 | Phase 4 | Pending |
| SHARE-09 | Phase 0 | Complete |
| SHARE-10 | Phase 0 | Complete |
| SHARE-11 | Phase 0 | Complete |
| SHARE-12 | Phase 4 | Pending |
| SHARE-13 | Phase 7 | Pending |
| SHARE-14 | Phase 7 | Pending |
| SHARE-15 | Phase 7 | Pending |
| SHARE-16 | Phase 7 | Pending |
| SHARE-17 | Phase 7 | Pending |
| SHARE-18 | Phase 7 | Pending |
| SHARE-19 | Phase 8 | Pending |
| SHARE-20 | Phase 7 | Pending |
| SHARE-21 | Phase 7 | Pending |
| OPS-01 | Phase 0 | Complete |
| OPS-02 | Phase 0 | Complete |
| OPS-03 | Phase 0 | Complete |
| OPS-04 | Phase 7 | Pending |
| OPS-05 | Phase 0 | Complete |
| OPS-06 | Phase 0 | Complete |
| OPS-07 | Phase 0 | Complete |
| OPS-08 | Phase 0 | Complete |
| OPS-09 | Phase 0 | Complete |
| OPS-10 | Phase 0 | Complete |
| OPS-11 | Phase 0 | Complete |
| OPS-12 | Phase 0 | Complete |
| OPS-13 | Phase 0 | Complete |
| OPS-14 | Phase 0 | Complete |
| OPS-15 | Phase 4 | Pending |
| OPS-16 | Phase 4 | Pending |
| OPS-17 | Phase 0 | Complete |
| OPS-18 | Phase 0 | Complete |
| OPS-19 | Phase 0 | Complete |
| OPS-20 | Phase 0 | Complete |
| OPS-21 | Phase 0 | Complete |
| OPS-22 | Phase 0 | Complete |
| OPS-23 | Phase 0 | Complete |
| OPS-24 | Phase 0 | Complete |
| OPS-25 | Phase 0 | Complete |
| OPS-26 | Phase 0 | Complete |


**Coverage:**
- v1 requirements: 407 total — AUTH 44 · CALL 70 · SOCIAL 51 · REP 29 · SETTLE 52 · SAFETY 58 · UI 56 · SHARE 21 · OPS 26
- Mapped to phases: 407 / 407 (100%)
- Unmapped: 0
- Per-phase distribution: Phase 0 = 32 · Phase 1 = 150 · Phase 1.5 = 11 · Phase 2 = 34 · Phase 3 = 22 · Phase 4 = 92 · Phase 5 = 4 · Phase 6 = 27 · Phase 7 = 18 · Phase 7.5 = 13 · Phase 8 = 1 · Phase 9 = 3
- v2 deferred: 17
- Out of Scope: 35 entries

---

*Requirements extracted from CALL_IT_SPEC1.md v1.0 (3,088 lines) on 2026-05-21*
*Locked spec — REQ-IDs are translation, not redesign*
