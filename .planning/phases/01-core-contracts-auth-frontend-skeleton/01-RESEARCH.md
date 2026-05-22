# Phase 1: Core contracts + auth + frontend skeleton — Research

**Researched:** 2026-05-22
**Domain:** Solidity contracts (CallRegistry, ProfileRegistry) + Next.js App Router + Privy embedded wallets + Alchemy Account Abstraction (ERC-4337/7677) + Circle USDC Paymaster (EIP-2612) + Fly Postgres address book + neobrutalist design system (`packages/ui`) + subgraph-primary feed with 800ms fallback race
**Confidence:** HIGH on Solidity 0.8.30 + OZ 5.6.1 + Privy 3.27 + Alchemy aa-sdk + Circle Paymaster patterns (each verified against official docs and existing Phase 0 work); MEDIUM on (a) Circle Paymaster Arbitrum address `0x6C973eBe80dCD8660841D4356bf15c32460271C9` — Arbitrum docs + Circle blog cross-confirm but require Wave 0 re-verification against current docs since the contract may have been re-deployed since publication; (b) ERC-7677 vs Alchemy's `alchemy_requestGasAndPaymasterAndData` custom RPC — the spec is fluid in 2026 and the Alchemy aa-sdk uses BOTH; (c) the exact AST tool to use for the Privy provider-order test (ts-morph and ast-grep both work; recommended ts-morph for in-process Vitest)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Paymaster (ERC-4337) vendor + gating**
- **D-01:** AA vendor is **Alchemy AA**. Same vendor as the NFT API + RPC plan — single billing line, one dashboard, one outage surface. First-class Privy integration. Bundler + paymaster + RPC under one key.
- **D-02:** 5-tx server-side cap is enforced by a **relayer ERC-7677 policy endpoint** at `POST /paymaster/policy`. Vendor calls it on every sponsorship request with userOp + Privy userId; relayer reads the Phase 0 Upstash counter (OPS-13), increments only on confirmed inclusion, returns sign-or-deny. Vendor-agnostic chokepoint. Pitfall 14 demands OUR layer, not the vendor's.
- **D-03:** **One userOp = one tx unit.** Batched calls inside a single userOp (approve + createCall) count as one.
- **D-04:** **Post-cap mechanic uses Circle's USDC Paymaster on Arbitrum** (EIP-2612 permit-based). From tx 6 onward, users pay gas in USDC via the Circle paymaster — no relayer involvement, no custom accounting, **no ETH ever required**.
- **D-05:** **Per-tx EIP-2612 permit signature embedded in the userOp** for tx 6+ (not a one-time blanket permit). Privy hides it as an in-flow modal.
- **D-06: SPEC DEVIATION — AUTH-27 + AUTH-29 are amended.** REQUIREMENTS.md must be updated post-Phase-1 verification to reflect post-cap USDC-gas reality.

**Address book + 24h cooldown storage**
- **D-07:** **Fly Postgres** as the canonical app DB starting Phase 1. Region `iad`, Fly private network, $5–15/mo. Creds in GCP Secret Manager. Daily `pg_dump` to GCS via cron.
- **D-08:** **Address book storage:** `address_book` rows of `(privy_user_id, address, added_at, label, removed_at NULL)` — never delete, only soft-remove.
- **D-09:** **24h cooldown chokepoint = relayer pre-tx hook.** Every withdrawal-touching userOp flow goes through a relayer endpoint that signs/co-signs after a Postgres lookup. Returns 403 if `now < added_at + 24h`.
- **D-10:** **AUTH-32 (new-auth-method 24h cooldown) enforced in the same chokepoint.** Separate `auth_methods` table `(privy_user_id, auth_type, linked_at)`. Privy webhook (preferred) or session-bootstrap polling populates rows.

**Handle namespace strategy**
- **D-11:** **Display-priority only — no uniqueness enforced onchain.** ProfileRegistry stores a `displayHandle` per user with no claim system.
- **D-12:** **Profile URL is canonical `/profile/[address]`.**
- **D-13:** **ENS reverse-record resolution is server-side on profile read with a 24h Redis cache** keyed by address. Relayer queries Mainnet ENS (not Arbitrum). Frontend fetches via `/api/profile/[address]`.
- **D-14:** **ProfileRegistry is non-upgradeable** per spec §10.8. Owner-only `setSettlementManager` / `setRelayer` rotation handles role updates.

**Design system delivery + boundary**
- **D-15:** **New `packages/ui` workspace** consumed by `apps/web` now and by Phase 8 Mini Apps later. Promotes Button, Card, Tag, Slider, Toast, Skeleton (6 variants), CornerBrackets, Stamp, Receipt (multi-mode), ConvictionBar.
- **D-16:** **Tailwind + class-variance-authority (CVA)** for variant mapping. Layer Radix primitives (Dialog, Popover, Tooltip, Slider) where they earn their place; build the rest natively. Reject shadcn/ui.
- **D-17:** **Corner brackets via CSS `::before`/`::after`** with borders. Zero asset load.
- **D-18:** **Loading skeletons are static gray blocks (no shimmer).** `#27272A` (`brand-border`) blocks. 6 variants.
- **D-19:** **Toast component is 3-status stacking with countdown drain** (success/info/error).

**New Call form architecture**
- **D-20:** **react-hook-form + `@hookform/resolvers/zod`** for the form state. Zod schemas in `packages/shared/src/validation/call-gates.ts` shared with the relayer preflight.
- **D-21:** **Shared `<Receipt mode='preview'|'live'|'settled'>` component** in `packages/ui`.
- **D-22:** **Duplicate-hash pre-check: debounced 400ms client call to `/api/calls/dup-check`.**
- **D-23:** **ProfileRegistry `settledCalls(user)` read via wagmi `useReadContract` on `/new` mount, cached in session.**

**Feed data source from day one**
- **D-24:** **Subgraph (Sepolia Studio endpoint) as primary + polled-events worker as automatic fallback.** 800ms race timer.
- **D-25:** **Cursor pagination, recency desc.** 20-per-page; cursor is `(createdAt, callId)`.
- **D-26:** **Redis 10s TTL cache on the first page only** (the `cursor=null` recency request).
- **D-27:** **Studio API key is held by the relayer only.** Frontend hits a relayer proxy `/api/feed`.

**Pre-flight server-side validation surface**
- **D-28:** **Full pre-flight endpoint at `POST /api/calls/preflight`.** Runs ALL gates before signing.
- **D-29:** **Anti-drift: shared Zod schemas + Foundry↔Vitest parity test.** CI guard fails on divergence.
- **D-30:** **Paymaster sponsorship is decoupled from preflight.**
- **D-31:** **Failed-preflight UX is inline field-level errors via the RHF Zod resolver.**

### Claude's Discretion
- **D-32:** **Onboarding state persistence** — `onboarding_state(privy_user_id PK, current_step int, handle_set_at, socials_step_completed_at, followgraph_optin_at, tagline_committed_at)`.
- **D-33:** **Wallet connectors on `/signin`:** wagmi MetaMask + WalletConnect + CoinbaseWallet built-in connectors. Rabby via MetaMask connector's `window.ethereum` sniff. Order: Connect Wallet > Google > Twitter.
- **D-34:** **Coinbase Onramp** uses hosted-flow popup (NOT redirect). Direct USDC transfer alternative shown side-by-side.
- **D-35:** **Feed empty state copy:** "No calls yet. Be the first to go on record." + primary `[+ NEW CALL]` button.
- **D-36:** **Wagmi v2 chain config** hardcoded to `[arbitrum, arbitrumSepolia]`.

### Deferred Ideas (OUT OF SCOPE)
- Social linking onchain → Phase 1.5
- FollowFadeMarket contract + Follow/Fade/Exit UX → Phase 2
- ChallengeEscrow + Duel page → Phase 3
- SettlementManager + Oracle adapters + Settled Receipt → Phase 4
- Stylus rep engine → Phase 5
- Multisig promotion → Phase 6 HARD GATE
- "From your X / Farcaster" feed sections → Phase 1.5
- OG card variants 1–4 → Phase 7 (only Phase 0 Fallback is live)
- Decentralized Network subgraph publish → Phase 7
- `/[handle]` sugar route → Phase 7
- ProfileRegistry rep storage schema deep-dive → Phase 4 / Phase 5
- Form analytics on `/new` abandonment → defer
- Sign-in screen brand animation → defer
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | Sign in via Privy 3 paths → same authenticated session | Privy 3.27 PrivyProvider with `loginMethods: ['wallet','google','twitter']`; provider order test (Pitfall 13) |
| AUTH-02 | Connect Wallet supports MetaMask/Rabby/WalletConnect/Coinbase Wallet via SIWE | wagmi v2 built-in connectors + `loginWithSiwe` flow; Rabby via window.ethereum sniff (D-33) |
| AUTH-03/04 | Google/Twitter OAuth path auto-creates Privy embedded wallet | `embeddedWallets.createOnLogin: 'users-without-wallets'` in Privy config |
| AUTH-04 | Twitter path AUTO pre-links handle | Privy 3.x exposes `linkedAccounts[].twitter.username` automatically; ProfileRegistry `displayHandle` write happens server-side from relayer after first session (deferred onchain link → Phase 1.5; pre-fill stays local) |
| AUTH-05 | Single React provider tree | `apps/web/app/providers.tsx` with `'use client'` line 1 |
| AUTH-08 | Skip social linking, return later via Settings | Skeleton route stub; full impl → Phase 1.5 |
| AUTH-11 | Handle resolution priority ENS→Twitter→Farcaster→0x | Server-side ENS resolution (D-13); fallback chain on `/api/profile/[address]` |
| AUTH-19/20/21 | 4-screen onboarding with pre-fill + commitment line | `apps/web/app/onboarding/[step]/page.tsx`; Postgres `onboarding_state` row pattern (D-32) |
| AUTH-22 | Privy custody disclosure card | Static component in `packages/ui`, rendered on Screen 1 + Profile Settings |
| AUTH-23 | Wallet export from Profile → Settings | `usePrivy().exportWallet()` API |
| AUTH-24 | Export prompt at ≥$50 USDC | Read balance via `useBalance({ token: USDC_ARB_NATIVE })`; trigger toast |
| AUTH-25 | Coinbase Onramp funding flow | Hosted popup via `https://pay.coinbase.com/buy/select-asset` (D-34) |
| AUTH-26 | Direct USDC transfer detected | Listen for `Transfer` events to user's address via subgraph or viem polling |
| AUTH-27 | First 5 tx sponsored by Alchemy paymaster (DEVIATION — see D-06; spec says ETH after, we use Circle Paymaster) | Relayer policy at `POST /paymaster/policy` calls ERC-7677 `pm_getPaymasterStubData` + `pm_getPaymasterData` |
| AUTH-28 | 5-tx cap enforced **server-side** at gating layer | Upstash counter `paymaster:user:{privyUserId}:count`, incremented only on confirmed userOp inclusion |
| AUTH-29 | 6th tx routed to USDC-gas (DEVIATION) | Circle Paymaster on Arbitrum at `0x6C973eBe80dCD8660841D4356bf15c32460271C9` with per-tx EIP-2612 permit |
| AUTH-30 | SIWE re-sign on external withdrawal | Relayer pre-tx hook returns "sign this SIWE message" challenge before co-signing |
| AUTH-31/32 | Address book + 24h cooldown | Fly Postgres `address_book` + `auth_methods`; relayer hook returns 403 on cooldown violation |
| AUTH-33 | In-app + email notification on new auth-link | Toast (in-app) + Privy webhook → email via Resend (deferred — toast only in Phase 1) |
| AUTH-34 | Auth-method removal requires existing-method re-auth | Privy unlink flow (requires re-auth); server-side check before deleting `auth_methods` row |
| AUTH-35 | Edit preferred display handle | ProfileRegistry `setDisplayHandle(string)` callable by user directly (not relayer) |
| AUTH-36/37/38 | Sign-in screen 3 CTAs + disclaimer + custody microcopy | `apps/web/app/signin/page.tsx` |
| AUTH-39/40/41 | ProfileRegistry setter rotation (`setSettlementManager`, `setRelayer`); user can `unlink*` directly | Owner-only setters with `Ownable2Step`; `unlink*` callable by `msg.sender == owner of displayHandle` (no relayer) |
| AUTH-42 | Handle `bytes(handle).length > 50` reverts `HandleTooLong` | Solidity check + Zod schema mirror |
| AUTH-43 | Social-linking gas sponsored | Deferred to 1.5 implementation; Phase 1 ships the contract setters only |
| AUTH-44 | Wallet address NEVER on shareable receipts | Component contract: `<Receipt>` does not render `address` even in preview/live/settled modes |
| CALL-01..03 | Price target / Spread/vs / Event call types | Solidity enum `MarketType` + `EventSubtype`; CallRegistry struct + 3 mode-conditional sub-form components |
| CALL-04/05 | On-chain metric list + 8 CEX list | Stored as allowlisted constants in `packages/shared/src/constants/oracle-targets.ts` (no contract storage) |
| CALL-06/07 | Coin + NFT allowlists (25 + 6) | `packages/shared/src/constants/allowlists.ts` + Solidity mapping `allowlistedAssets[symbol] = feedId`; `allowlistedNftCollections[address] = bool` |
| CALL-08/09 | Pyth/Alchemy verification | Wave-0 task: ID re-verification script. Pyth IDs in `packages/shared/src/constants/pyth-feed-ids.ts` (Phase 0 already shipped) |
| CALL-10/11/12 | Owner-only `addAsset` / `addNFTCollection` setters | `Ownable2Step` modifier |
| CALL-13 | `AssetNotAllowlisted` revert | Solidity mapping lookup → revert custom error |
| CALL-14/15/16 | Resolution Criteria optional vs required (≥50 chars) per event subtype | Zod conditional schema + Solidity `CriteriaRequired(marketType, subtype)` |
| CALL-17 | Criteria hashed onchain, not stored as bytes | `criteriaHash = keccak256(bytes(criteria))` stored only; raw text pinned to Pinata IPFS in Phase 7 (Phase 1 ships hash only) |
| CALL-18 | Criteria advisory in disputes (Phase 4) | No Phase 1 work; documented |
| CALL-19 | "VERIFIED CRITERIA" badge at ≥50 chars | Frontend-derived from `criteriaHash != bytes32(0)` + length check at compose time |
| CALL-20/21 | $5 min / $100 max stake | Solidity constants `MIN_STAKE = 5e6`, `MAX_STAKE = 100e6` |
| CALL-22/23/24 | Duplicate hash = `keccak256(market_type, subject, metric, target_value, deadline_day_utc)` with `deadline_day_utc = (deadline / 86400) * 86400` | Solidity helper + identical Zod-derived TS hash function (anti-drift parity test — D-29) |
| CALL-25/26 | `DuplicateCall(existingCallId)` revert + inline UI | Pre-empted by `/api/calls/dup-check` 400ms debounce (D-22) |
| CALL-27 | Settled calls clear duplicate hash | Phase 4 settlement; Phase 1 leaves `activeDuplicateHashes` mapping writable from settlement manager via setter |
| CALL-28..31 | Conviction slider 1-100 + ≥85 floor for <10 settled callers (cap to 84) + UI warning | Solidity auto-caps in `createCall` (NOT revert), emits `ConvictionCapped(caller, requested, applied)`; UI reads `settledCalls(user)` via wagmi useReadContract |
| CALL-32/33 | `ExpiryNotInFuture` + `CategoryInvalid` reverts | Solidity custom errors |
| CALL-34 | TVL cap aggregate | Phase 1 `currentTvl` reads CallRegistry's own pool balance only; canonical aggregator across FollowFadeMarket+ChallengeEscrow lands in Phase 6 (Pitfall 3 noted) |
| CALL-35/36 | USDC allowance + balance pre-checks | `IERC20.allowance` + `balanceOf` in `createCall`; preflight mirrors |
| CALL-37 | `safeTransferFrom` pulls stake + $10 fee | OZ SafeERC20 |
| CALL-38/39/40 | Fee split + virtual fade seed | `$5 to treasury, $5 to virtual fade (accounting only, total $7 incl. $2 base)`; Phase 2 wires real FollowFadeMarket pool; Phase 1 stores `virtualFadeSeed` on Call struct |
| CALL-41 | Fade win + only virtual liquidity → entire follow pool to treasury | Phase 4 settlement; Phase 1 leaves the field |
| CALL-42..56 | New Call page form + preview + 2-step publish modal | RHF + Zod + `<Receipt mode='preview'>` (D-20/21/22/52/53) |
| CALL-57..61 | Quote-call composer (`/new?quote=[parentCallId]`) | Same form with parent context card; `parent_call_id` field on Call struct |
| CALL-62/63 | Category enum (Majors / DeFi / Other) | Solidity enum + frontend mapping per §7.5 rules |
| CALL-64/65/66 | `openToChallenges` flag + OPEN badge + feed filter | Bool on Call struct; advanced settings toggle (default ON) |
| CALL-67 | `getCallsByUser(user, offset, limit)` paginated view | Mapping `userCalls[user] = uint256[]` + view function |
| CALL-68 | `computeDuplicateHash(...)` + `computeCallerExitPenalty(callId)` helpers | Public view fns on CallRegistry; `computeCallerExitPenalty` returns 0 in Phase 1 (Phase 2 implements decay) |
| CALL-69/70 | `CallCreated` + `CallQuoted` events | Solidity events |
| REP-01/02 | New user begins at 100 rep, floor at 0 | ProfileRegistry constructor or first-touch initialization sets `globalRep = 100` |
| REP-17 | Profile struct shape | Solidity struct with `globalRep` + `categoryRep[3]` + `callerRep` + `challengerRep` + `streak` + `totalCalls` + `settledCalls` + `wins` + `losses` + `lastActiveAt` + `displayHandle` + `socialIdentity` |
| REP-18 | `settledCalls` count read by createCall | `profileRegistry.settledCalls(user)` view |
| REP-28/29 | NFT calls → Majors category; Spread/vs default category rules | Pure mapping in frontend + contract |
| SAFETY-01 | $100 max stake hardcoded | Constant `MAX_STAKE_PER_CALL = 100 * 1e6` |
| SAFETY-04..11 | whenNotPaused / Checks-Effects-Interactions / no delegatecall / ReentrancyGuard / pause()/unpause() owner-only / withdraw works while paused | OZ `Pausable` + `ReentrancyGuard` + `Ownable2Step`; pause modifier on `createCall` only (settle/exit are Phase 2-4) |
| SAFETY-14 | ReentrancyGuard wraps USDC transfer paths | `nonReentrant` modifier on `createCall` |
| SAFETY-18 | CallRegistry + ProfileRegistry NOT upgradable | No proxy; pure deploy |
| UI-01..05 | Feed / New Call / Profile / Sign-in pages | 4 page routes in `apps/web/app/` |
| UI-08 | Profile page shell with avatar + handle + verified + TOP X% + counts | `<ProfileHeader>` component with Overview tab stub (full Overview → Phase 7) |
| UI-10 | Profile Settings: handle + connect/disconnect socials + export wallet | Settings sub-page |
| UI-24/25 | Sign-in + Onboarding pages with locked design | `apps/web/app/signin/page.tsx`, `apps/web/app/onboarding/[step]/page.tsx` |
| UI-29..37 | Loading skeleton 6 variants + toast 3-status | `packages/ui/src/skeleton/*` + `packages/ui/src/toast/*` |
| UI-38..47 | Color palette + typography + spacing + neobrutalist treatment + corner brackets + button shadow language + heavier letter spacing + asymmetric layouts | `packages/ui/tailwind.preset.ts` consumed by `apps/web` |
| UI-51 | Conviction slider fill interpolates muted → accent | Radix Slider primitive + CSS custom property `--fill-color` driven by value |
| UI-53 | Feed cards stagger enter | CSS animation with `animation-delay: calc(60ms * var(--index))` |
| UI-55 | Page transitions: horizontal slide for tabs, vertical slide-up for modals | Next.js parallel routes for tabs; Radix Dialog for modals |
| UI-56 | Real-time UI: 5s polling at hackathon | wagmi `useReadContract` with `query.refetchInterval: 5000`; subgraph poll at 5s for active call card |
</phase_requirements>

---

## Summary

Phase 1 lands the receipt loop's first half — sign-in through publish — at contract + UI level. The contract surface is two contracts (CallRegistry, ProfileRegistry) compiled under Solidity `=0.8.30` with OZ 5.6.1; ProfileRegistry is the dependency for CallRegistry's high-conviction floor gate (§6.3). The frontend lands four pages (`/`, `/new`, `/profile/[address]`, `/signin`) + onboarding flow inside the locked Privy provider tree, with a brand-new `packages/ui` workspace shipping Button, Card, Tag, Toast (3-status with countdown drain), Skeleton (6 static-gray variants), CornerBrackets (CSS `::before`/`::after`), and the shared `<Receipt mode='preview'|'live'|'settled'>` primitive that Phases 2/4/7 will reuse. The relayer extends with seven new routes — `/paymaster/policy` (ERC-7677), `/addressbook/*`, `/api/calls/preflight`, `/api/calls/dup-check`, `/api/profile/[address]`, `/api/feed`, `/api/onboarding/state` — backed by Fly Postgres (3 tables) and Upstash Redis (counter + 10s feed cache + 24h ENS cache).

**Primary recommendation:** Sequence the phase so the contracts ship Wave 0 (foundation for every other wave's tests), the relayer routes ship Wave 1 (foundation for frontend), `packages/ui` ships Wave 2 (consumed by all four pages), and the four pages + onboarding ship Wave 3. The anti-drift parity test (D-29) and the Privy provider-order AST test (Pitfall 13) are first-class CI gates added in Wave 0 — they fail the build on divergence and are the Phase 1 analog of the Phase 0 grep guards.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `createCall` validation + state writes | Contracts (CallRegistry) | Shared Zod schema mirror | Onchain is the authoritative gate; preflight is a UX defense layer that must agree (D-29) |
| Reputation read (`settledCalls`) | Contracts (ProfileRegistry) | wagmi `useReadContract` | Source of truth for the §6.3 high-conviction floor |
| Privy session + embedded wallet | Frontend (Privy 3.27) | `@privy-io/wagmi@4.0.8` connector | Auth + custody live entirely in Privy; wagmi reads via the Privy connector |
| ERC-4337 userOp construction + signing | Frontend (Alchemy aa-sdk) | Privy embedded wallet as signer | aa-sdk wraps the userOp lifecycle; Privy provides the raw `signMessage` underneath |
| 5-tx cap enforcement | API/Backend (relayer `POST /paymaster/policy`) | Upstash counter | ERC-7677 standard endpoints — Alchemy bundler calls back to OUR endpoint to decide sponsorship (Pitfall 14) |
| Circle USDC Paymaster gas accept (tx 6+) | Onchain (Circle paymaster contract) | Frontend (per-tx EIP-2612 permit signer) | No relayer; per-tx permit signed by user, paymaster pulls USDC for gas |
| Address book + 24h cooldown | API/Backend (Fly Postgres + relayer pre-tx hook) | Privy webhook for `auth.linked` | Server-side chokepoint, NOT client (Pitfall 20) |
| ENS reverse-record resolution | API/Backend (relayer via Mainnet RPC + Redis 24h cache) | viem `getEnsName` | Server saves Mainnet RPC traffic; client never queries ENS directly |
| New Call form state | Frontend (react-hook-form + zod resolver) | Shared `packages/shared/src/validation/call-gates.ts` schemas | Same schemas drive RHF + relayer preflight + contract parity test |
| Duplicate-hash pre-check | Frontend (debounced 400ms) | Relayer `/api/calls/dup-check` calling CallRegistry view | Hash computed twice (frontend echo + onchain authority) |
| Feed | API/Backend (relayer `/api/feed`) | Subgraph (primary) + polled-events worker (fallback) | 800ms race; Studio key never reaches the frontend bundle (D-27) |
| Profile page resolution | API/Backend (relayer `/api/profile/[address]`) | viem ENS + ProfileRegistry read | Server-rendered handle priority chain |
| Design system primitives | `packages/ui` workspace | `apps/web` consumer | Reused by Phase 8 Mini Apps; reject shadcn/ui per D-16 |
| Receipt component | `packages/ui` (`<Receipt mode>`) | Phase 7 OG variants reuse the same primitive (flexbox-only — Pitfall 15) | Single source for preview/live/settled visuals |
| Toast + Skeleton + CornerBrackets | `packages/ui` | All `apps/web` pages | Static design primitives; CSS-only animations |

---

## Standard Stack

### Core (locked by CLAUDE.md Technology Stack section + Phase 0 deviations)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `solc` | `=0.8.30` exact | CallRegistry, ProfileRegistry contracts | Pre-bug per STACK.md; Phase 0 grep guard enforces (avoid 0.8.28–0.8.33 IR bug) |
| `@openzeppelin/contracts` | `5.6.1` | ReentrancyGuard, Ownable2Step, SafeERC20, Pausable | v5 modernized line; Phase 0 already installed |
| Foundry | nightly (last stable v1.x) | Build, test, fuzz | `forge fuzz` for AMM math + gate matrix |
| `@privy-io/react-auth` | `3.27.0` | Auth + embedded wallets + OAuth | Pinned in `apps/web/package.json` already |
| `@privy-io/wagmi` | `4.0.8` (NOT 1.32.5 per Phase 0 P01 deviation logged in STATE.md) | wagmi v2 connector for Privy embedded wallets | **Critical: STATE.md notes the v1.32.5 from CLAUDE.md does not exist on npm; 4.0.8 is the actual installed version. All planning must honor this.** |
| `@privy-io/server-auth` | latest (verify Wave 0) | Server-side OAuth proof verification | Required for `auth.linked` webhook validation |
| `wagmi` | `2.18.0` | React hooks for wallet | `useAccount`, `useReadContract`, `useWriteContract`, `useWaitForTransactionReceipt` |
| `viem` | `2.50.4` | Low-level Ethereum client | Frontend + relayer; ENS via `getEnsName` on Mainnet client |
| `@tanstack/react-query` | `5.100.11` | wagmi v2 peer dep | Required |
| `siwe` | `3.0.0` | EIP-4361 message construction | Connect Wallet path verification |
| `@farcaster/auth-kit` | `0.8.2` | Farcaster sign-in skeleton (full impl → 1.5) | Wrap BELOW PrivyProvider per ARCHITECTURE.md |
| `Next.js` | `16.2.6` | App Router | `app/providers.tsx` with `'use client'` line 1 |
| `Tailwind CSS` | `3.4+` | Styling | Shared preset in `packages/ui/tailwind.preset.ts` |
| `class-variance-authority` | `^0.7.x` (verify Wave 0; current major as of 2026) | CVA variant mapping for `packages/ui` components | Type-safe variant API; pairs natively with Tailwind [CITED: cva.style/docs] |
| `@radix-ui/react-dialog` `@radix-ui/react-popover` `@radix-ui/react-tooltip` `@radix-ui/react-slider` | latest (1.x lines, verify Wave 0) | A11y primitives | Radix where it earns its place (D-16); slider is critical for conviction control |
| `react-hook-form` | `^7.60.0` (verify Wave 0) | Form state | Re-render optimization for conviction slider + debounced duplicate-hash field |
| `@hookform/resolvers` | `^5.2.2` | Zod resolver | Standard adapter [VERIFIED: npmjs.com/package/@hookform/resolvers, last published 2025] |
| `zod` | `^3.24.0` (already installed in relayer; Phase 1 makes it shared) | Schema validation | Shared between RHF and relayer preflight |

### Phase 1 NEW dependencies (NOT yet in `apps/web` or `apps/relayer`)

| Library | Version | Purpose | Where |
|---------|---------|---------|-------|
| `@account-kit/infra` | latest `4.x` (verify Wave 0) | Alchemy aa-sdk middleware: `alchemyGasAndPaymasterAndDataMiddleware`, `erc7677Middleware` | `apps/web` (userOp construction client-side) |
| `@account-kit/smart-contracts` | latest | LightAccount or ModularAccountV2 factory for Privy users without smart wallets | `apps/web` |
| `permissionless` | latest `0.2.x` (verify Wave 0) | Optional viem-native AA helpers if aa-sdk doesn't cover Privy-as-signer cleanly | `apps/web` fallback |
| `drizzle-orm` | latest `0.36+` | Postgres ORM for relayer | `apps/relayer` |
| `drizzle-kit` | latest `0.30+` | Migration tooling | `apps/relayer` dev |
| `pg` | latest `8.13+` | Postgres node driver | `apps/relayer` runtime |
| `class-variance-authority` | `^0.7.x` | Variant mapping | `packages/ui` |
| `clsx` | `^2.1.x` | className composition helper | `packages/ui` (paired with CVA) |
| `tailwind-merge` | `^2.x` | dedup conflicting Tailwind classes | `packages/ui` |
| `@radix-ui/react-dialog` `@radix-ui/react-popover` `@radix-ui/react-tooltip` `@radix-ui/react-slider` | latest | A11y primitives | `packages/ui` |
| `framer-motion` | latest (consider scope-limit — only used for D-17 stamp + UI-45/UI-55 transitions) | Spring animations for outcome stamp, page transitions | `packages/ui` — restrict imports to specific components, avoid global use |
| `ts-morph` | latest (`24.x`) | AST parsing for Privy provider-order test | `apps/web` dev only |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `drizzle-orm` + `drizzle-kit` | `node-pg-migrate` + raw `pg` | Drizzle wins on TS-first ergonomics + auto-generated migrations from schema definitions; node-pg-migrate is more "raw SQL" — fine for this phase's small surface (3 tables) but more boilerplate. Decision: **drizzle-orm + drizzle-kit** (D-32 onboarding state row pattern reads naturally as a Drizzle schema; existing `zod` integration via `drizzle-zod`). |
| `@account-kit/infra` (Alchemy aa-sdk) | `permissionless` (viem-native) | aa-sdk has first-class Alchemy paymaster + ERC-7677 middleware; permissionless is more vendor-neutral but requires custom wiring. Decision: **aa-sdk primary, permissionless as fallback** if aa-sdk doesn't accept Privy embedded wallet as raw signer cleanly. |
| Radix UI primitives | Headless UI, Ariakit | Radix is the locked choice per D-16; CVA pattern + Radix Dialog/Popover/Slider is the shadcn-without-shadcn route. |
| `framer-motion` | CSS-only with `prefers-reduced-motion` + tasteful keyframes | CSS handles 80% of UI-45/UI-53/UI-55 cleanly; framer-motion only for outcome stamp (UI-45 — scale 1.2→1.0 overshoot is awkward in pure CSS keyframes). Decision: **CSS-only for skeletons/toasts/page-transitions; framer-motion ONLY for `<Stamp>` and the live-pulse indicator on toasts.** |
| `ts-morph` for AST test | `ast-grep` (Rust, faster) or `recast` | ts-morph runs in-process under Vitest, gives full TS type access, simplest to author the test in. ast-grep is faster for repo-wide scans but needs YAML/JSON rules; recast is mid-level. Decision: **ts-morph** for the Privy provider-order test (single file, simplest tool wins). |
| Browser-side ENS resolution | Server-side ENS w/ 24h Redis cache (D-13) | Server-side saves Mainnet RPC traffic + dodges flaky public-RPC failures + allows pre-rendering. Decision: **server-side, locked by D-13.** |
| `node-pg-migrate` for migrations | `drizzle-kit` | See above; drizzle picked. |

**Installation:**
```bash
# packages/ui (new)
cd packages/ui
pnpm init  # name @call-it/ui
pnpm add class-variance-authority clsx tailwind-merge
pnpm add @radix-ui/react-dialog @radix-ui/react-popover @radix-ui/react-tooltip @radix-ui/react-slider
pnpm add framer-motion  # restrict imports per ESLint rule below
pnpm add -D tailwindcss postcss autoprefixer typescript

# apps/web (additions)
cd apps/web
pnpm add @account-kit/infra @account-kit/smart-contracts permissionless
pnpm add react-hook-form @hookform/resolvers zod
pnpm add @call-it/ui@workspace:*
pnpm add -D ts-morph

# apps/relayer (additions)
cd apps/relayer
pnpm add drizzle-orm pg
pnpm add -D drizzle-kit @types/pg
pnpm add @privy-io/server-auth  # verify version Wave 0
```

**Version verification:** Wave 0 task list includes `npm view <package> version` for each Phase-1-NEW dependency above to lock exact versions in `packages/config/versions.lock`.

---

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────── User browser ─────────────────────────┐
│                                                                │
│  [Sign-in 3 paths]   [Onboarding 4 screens]   [Pages: / /new  │
│         │                    │                  /profile/[a]  │
│         ▼                    ▼                  /signin]      │
│  PrivyProvider → QueryClientProvider → WagmiProvider          │
│                  (provider order = AST-test-locked)           │
│         │                                                     │
│  ┌──────┴────────┐                                            │
│  │ Privy session │                                            │
│  │ + embedded    │── signMessage ──► Alchemy aa-sdk           │
│  │ wallet        │                   builds userOp            │
│  └───────────────┘                   ▲                        │
│                                      │                        │
└──────────────────────────────────────┼────────────────────────┘
                                       │ ERC-7677 RPC
                       ┌───────────────┼───────────────┐
                       ▼               ▼               ▼
              ┌────────────────┐ ┌────────────┐ ┌───────────────┐
              │ Alchemy        │ │ Alchemy    │ │ Relayer        │
              │ bundler        │ │ paymaster  │ │ (Fastify)      │
              │ (eth_sendUO)   │ │            │ │ (Fly.io iad)   │
              └────────┬───────┘ └─────┬──────┘ └───┬───────────┘
                       │               │ tx 6+      │
                       │       Circle USDC          │
                       │       Paymaster            │
                       │       (per-tx permit)      │
                       │                            │
                       ▼                            ▼
              ┌────────────────────────────────────────────┐
              │  Arbitrum One / Sepolia                    │
              │  ┌──────────────┐  ┌────────────────────┐  │
              │  │ CallRegistry │◄─┤ ProfileRegistry    │  │
              │  │ (createCall, │  │ (settledCalls,     │  │
              │  │  events,     │  │  displayHandle,    │  │
              │  │  TVL gate)   │  │  socialIdentity,   │  │
              │  └──────┬───────┘  │  setSettlement/    │  │
              │         │          │  setRelayer)       │  │
              │         │          └────────────────────┘  │
              │         │ USDC.safeTransferFrom            │
              │         ▼                                  │
              │  ┌──────────────┐                          │
              │  │ USDC_ARB_    │                          │
              │  │ NATIVE       │                          │
              │  └──────────────┘                          │
              └────────────────────────────────────────────┘
                       │
                       │ events
                       ▼
              ┌──────────────────────────────────────────────┐
              │ Subgraph (Sepolia Studio) — primary feed src │
              │ Polled-events worker — 800ms fallback        │
              └────────────────┬─────────────────────────────┘
                               │ relayer-side
                               ▼
              ┌──────────────────────────────────────────────┐
              │ Relayer routes (Fastify):                    │
              │  POST /paymaster/policy (ERC-7677)           │
              │  POST /api/calls/preflight                   │
              │  POST /api/calls/dup-check                   │
              │  GET  /api/feed                              │
              │  GET  /api/profile/[address]                 │
              │  GET  /addressbook                           │
              │  POST /addressbook                           │
              │  DELETE /addressbook/[id]                    │
              │  POST /api/withdraw/authorize (24h hook)     │
              │  POST /api/privy/webhook (auth.linked)       │
              │  GET  /api/onboarding/state                  │
              │  POST /api/onboarding/advance                │
              └─────┬─────────────────┬──────────────────────┘
                    │                 │
                    ▼                 ▼
              ┌──────────────┐ ┌──────────────────────────────┐
              │ Fly Postgres │ │ Upstash Redis                 │
              │ (iad)        │ │  paymaster:user:{id}:count    │
              │  address_    │ │  ens:{address}  (24h TTL)     │
              │  book        │ │  feed:firstpage (10s TTL)     │
              │  auth_methods│ │  dup-check:{hash}  (60s TTL)  │
              │  onboarding_ │ └──────────────────────────────┘
              │  state       │
              └──────────────┘
```

### Recommended Project Structure

```
packages/
├── contracts/
│   ├── src/
│   │   ├── CallRegistry.sol               # NEW Phase 1
│   │   ├── ProfileRegistry.sol            # NEW Phase 1
│   │   ├── constants/USDC.sol             # Phase 0 (existing)
│   │   ├── interfaces/
│   │   │   ├── ICallRegistry.sol          # NEW
│   │   │   └── IProfileRegistry.sol       # NEW
│   │   └── libraries/
│   │       └── DuplicateHashLib.sol       # NEW — shared hash function
│   ├── test/
│   │   ├── CallRegistry.t.sol             # unit
│   │   ├── ProfileRegistry.t.sol          # unit
│   │   ├── CallRegistryGates.t.sol        # anti-spam matrix fuzz
│   │   ├── CallRegistryParity.t.sol       # contract↔preflight parity fixture
│   │   ├── fixtures/
│   │   │   └── gate-matrix.json           # SHARED with Vitest parity test
│   │   └── invariants/
│   │       └── DuplicateHash.invariant.t.sol
│   └── script/
│       └── DeployPhase1.s.sol             # deploys CallRegistry + ProfileRegistry
├── shared/                                # extend Phase 0 package
│   ├── src/
│   │   ├── constants/ (existing)
│   │   ├── schemas/
│   │   │   ├── env-config.ts (existing — extend)
│   │   │   └── call-gates.ts              # NEW — Zod schemas for createCall
│   │   ├── hashing/
│   │   │   └── duplicate-hash.ts          # NEW — TS mirror of DuplicateHashLib
│   │   └── types/
│   │       └── call.ts                    # MarketType, EventSubtype, etc.
├── ui/                                    # NEW WORKSPACE Phase 1
│   ├── src/
│   │   ├── primitives/
│   │   │   ├── Button.tsx                 # CVA variant mapping
│   │   │   ├── Card.tsx
│   │   │   ├── Tag.tsx
│   │   │   ├── CornerBrackets.tsx         # CSS ::before/::after
│   │   │   ├── Stamp.tsx                  # framer-motion outcome reveal
│   │   │   ├── Toast.tsx                  # 3-status + countdown drain
│   │   │   ├── ToastProvider.tsx
│   │   │   └── Skeleton.tsx               # base + 6 variants
│   │   ├── compound/
│   │   │   ├── Receipt.tsx                # mode='preview'|'live'|'settled'
│   │   │   ├── CallCard.tsx
│   │   │   ├── ConvictionBar.tsx
│   │   │   ├── ProfileHeader.tsx
│   │   │   └── LeaderboardRow.tsx         # stub for Phase 7
│   │   ├── hooks/
│   │   │   └── useToast.ts
│   │   └── tokens/
│   │       ├── colors.ts
│   │       ├── typography.ts
│   │       └── spacing.ts
│   ├── tailwind.preset.ts                 # consumed by apps/web
│   └── package.json                       # @call-it/ui
└── subgraph/ (existing — extend mappings)
    └── src/
        ├── call-registry.ts               # NEW — CallCreated, CallQuoted, ConvictionCapped, CallerExited stubs
        └── profile-registry.ts            # NEW — ProfileUpdated, SocialLinked, SocialUnlinked stubs

apps/
├── web/
│   ├── app/
│   │   ├── providers.tsx                  # NEW — PrivyProvider > QueryClientProvider > WagmiProvider (line 1: 'use client')
│   │   ├── layout.tsx                     # extend — import Providers
│   │   ├── page.tsx                       # feed
│   │   ├── new/page.tsx                   # NEW — call form
│   │   ├── profile/[address]/page.tsx     # NEW — profile shell
│   │   ├── signin/page.tsx                # NEW
│   │   ├── onboarding/
│   │   │   ├── layout.tsx                 # NEW — step indicator
│   │   │   ├── handle/page.tsx
│   │   │   ├── socials/page.tsx
│   │   │   ├── follow-graph/page.tsx
│   │   │   └── tagline/page.tsx
│   │   ├── api/
│   │   │   ├── og/fallback/route.ts       # Phase 0 (existing)
│   │   │   └── (nothing else — relayer-proxied via fetch)
│   ├── lib/
│   │   ├── privy-config.ts                # NEW — loginMethods + supportedChains
│   │   ├── wagmi-config.ts                # NEW — chains: [arbitrum, arbitrumSepolia]
│   │   ├── aa-config.ts                   # NEW — Alchemy bundler + erc7677Middleware
│   │   └── relayer-client.ts              # NEW — typed fetch wrapper to relayer
│   └── tests/
│       ├── privy-provider-order.ast.test.ts   # NEW — ts-morph parse providers.tsx
│       ├── signin.spec.ts                     # Playwright e2e
│       ├── onboarding.spec.ts                 # Playwright
│       └── new-call-publish.spec.ts           # Playwright happy path
└── relayer/
    ├── src/
    │   ├── routes/
    │   │   ├── paymaster-policy.ts        # NEW — ERC-7677 endpoint
    │   │   ├── address-book.ts            # NEW
    │   │   ├── withdraw-authorize.ts      # NEW — 24h cooldown hook
    │   │   ├── calls/
    │   │   │   ├── preflight.ts           # NEW
    │   │   │   └── dup-check.ts           # NEW
    │   │   ├── feed.ts                    # NEW — subgraph + 800ms race
    │   │   ├── profile.ts                 # NEW — ENS resolution
    │   │   ├── onboarding.ts              # NEW
    │   │   └── privy-webhook.ts           # NEW — auth.linked handler
    │   ├── db/
    │   │   ├── schema.ts                  # drizzle schema for 3 tables
    │   │   ├── client.ts                  # drizzle PG client
    │   │   └── migrations/
    │   │       ├── 0001_address_book.sql
    │   │       ├── 0002_auth_methods.sql
    │   │       └── 0003_onboarding_state.sql
    │   ├── lib/
    │   │   ├── ens-resolver.ts            # viem mainnet client + Redis cache
    │   │   ├── subgraph-client.ts         # extend existing
    │   │   └── polled-events-fallback.ts  # extend Phase 0 worker
    │   └── workers/ (existing — extend)
```

### Pattern 1: Privy Provider Tree (Pitfall 13 — AST-locked)

**What:** Mandatory order `<PrivyProvider><QueryClientProvider><WagmiProvider>{children}</WagmiProvider></QueryClientProvider></PrivyProvider>`. Wrong order = embedded wallets silently invisible to `useAccount()`.

**When to use:** Every page in `apps/web` lives under this tree.

**Example:**
```tsx
// apps/web/app/providers.tsx
// PROVIDER ORDER LOAD-BEARING — see PITFALLS.md Pitfall 13.
// Any PR touching this file must pass apps/web/tests/privy-provider-order.ast.test.ts
'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { WagmiProvider } from '@privy-io/wagmi';  // NOT from 'wagmi'
import { wagmiConfig } from '@/lib/wagmi-config';
import { privyAppId, privyConfig } from '@/lib/privy-config';

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider appId={privyAppId} config={privyConfig}>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
```
**Source:** [Privy docs — wagmi integration](https://docs.privy.io/wallets/connectors/ethereum/integrations/wagmi)

### Pattern 2: Privy Config — 3 Login Methods + Embedded Wallet

```ts
// apps/web/lib/privy-config.ts
import { arbitrum, arbitrumSepolia } from 'viem/chains';
import type { PrivyClientConfig } from '@privy-io/react-auth';

export const privyConfig: PrivyClientConfig = {
  loginMethods: ['wallet', 'google', 'twitter'],
  appearance: { theme: 'dark', accentColor: '#E8F542' },
  embeddedWallets: {
    createOnLogin: 'users-without-wallets',  // Google/Twitter paths get a wallet auto-created
    requireUserPasswordOnCreate: false,
  },
  supportedChains: [arbitrum, arbitrumSepolia],
  defaultChain: process.env.NEXT_PUBLIC_NETWORK === 'mainnet' ? arbitrum : arbitrumSepolia,
};
```
**Source:** [Privy 3.0 migration guide](https://docs.privy.io/basics/react/advanced/migrating-to-3.0) [CITED]

### Pattern 3: wagmi Config from `@privy-io/wagmi`

```ts
// apps/web/lib/wagmi-config.ts
import { createConfig } from '@privy-io/wagmi';  // NOT 'wagmi'
import { http } from 'viem';
import { arbitrum, arbitrumSepolia } from 'viem/chains';

export const wagmiConfig = createConfig({
  chains: [arbitrum, arbitrumSepolia],  // D-36 lock
  transports: {
    [arbitrum.id]: http(process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL!),
    [arbitrumSepolia.id]: http(process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL!),
  },
});
```
Note: `@privy-io/wagmi` `createConfig` automatically sets `reconnectOnMount: false` and wires the Privy connector.

### Pattern 4: ERC-7677 Paymaster Policy Endpoint (D-02, Pitfall 14)

**Spec:** [ERC-7677 EIP](https://eips.ethereum.org/EIPS/eip-7677) defines `pm_getPaymasterStubData` and `pm_getPaymasterData` JSON-RPC methods that ERC-4337 paymaster services expose. The bundler calls these on every userOp.

**Our enforcement:** Alchemy's paymaster lets us register an ERC-7677-compatible callback URL on our gas policy. The Alchemy bundler hits our `/paymaster/policy` endpoint with the userOp + a custom context object (which includes the Privy `userId`). We return sign-or-deny based on the Upstash counter.

**Server-side flow:**
```ts
// apps/relayer/src/routes/paymaster-policy.ts
import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const PolicyRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.enum(['pm_getPaymasterStubData', 'pm_getPaymasterData']),
  params: z.tuple([
    z.object({  // unsigned userOp
      sender: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
      nonce: z.string(),
      callData: z.string(),
      // ... entryPoint v0.7 fields
    }),
    z.string(),  // entryPoint address
    z.string(),  // chain id (hex)
    z.object({   // context — includes Privy userId
      privyUserId: z.string(),
      txHashAtSubmit: z.string().optional(),
    }),
  ]),
});

export const paymasterPolicyRoute: FastifyPluginAsync = async (app) => {
  app.post('/paymaster/policy', async (req, reply) => {
    const parsed = PolicyRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid' });

    const { privyUserId } = parsed.data.params[3];
    const count = await app.redis.get(`paymaster:user:${privyUserId}:count`);
    const currentCount = count ? parseInt(count, 10) : 0;

    if (currentCount >= 5) {
      // Deny — frontend should route to Circle USDC Paymaster (D-04/05)
      return reply.send({ jsonrpc: '2.0', id: parsed.data.id, error: { code: -32000, message: 'sponsorship-cap-exceeded' } });
    }

    // Build paymaster signature
    const paymasterData = await app.paymasterSigner.signPaymasterData(parsed.data.params[0]);

    // DO NOT increment counter here — only on confirmed inclusion (D-02)
    // The relayer subscribes to UserOperationEvent and increments then; see workers/paymaster-confirmer.ts

    return reply.send({
      jsonrpc: '2.0',
      id: parsed.data.id,
      result: {
        paymaster: process.env.ALCHEMY_PAYMASTER_ADDRESS!,
        paymasterData,
        paymasterVerificationGasLimit: '0x10000',
        paymasterPostOpGasLimit: '0x10000',
      },
    });
  });
};
```
**Source:** [Alchemy erc7677Middleware](https://www.alchemy.com/docs/wallets/reference/aa-sdk/core/functions/erc7677Middleware) + [ERC-7677 spec](https://eips.ethereum.org/EIPS/eip-7677) [CITED]

**Increment-on-confirmation worker:**
```ts
// apps/relayer/src/workers/paymaster-confirmer.ts
// Subscribe to UserOperationEvent on Alchemy bundler via eth_subscribe.
// When a userOp is confirmed AND its paymaster is ours AND status==success OR status==reverted,
// look up the (sender → privyUserId) mapping and increment paymaster:user:{privyUserId}:count.
// "Reverted but included" still counts per Alchemy/Stackup convention.
```
**Note:** Even reverted-but-included userOps consume sponsorship per ERC-4337 economics — bundler still pays gas. Count them. Confirm decision: **yes, count reverts** (operator pays gas regardless).

### Pattern 5: Circle USDC Paymaster — Per-tx EIP-2612 Permit (D-04/D-05)

**Contract:** Circle Paymaster on Arbitrum at **`0x6C973eBe80dCD8660841D4356bf15c32460271C9`** [CITED: Arbitrum docs Circle Paymaster quickstart — Wave 0 must re-verify; address sourced from web search and may be a v0.7 deployment with a separate v0.8 deployment for current EntryPoint] [ASSUMED]

**Flow per userOp:**
1. Frontend builds `userOp.callData = createCall(...)` as normal.
2. Frontend computes the deadline for the permit (typically `now + 5min`).
3. Frontend reads `USDC.nonces(userAddress)` via viem.
4. Frontend builds an EIP-2612 permit payload `{ owner, spender: <paymasterAddress>, value: <maxPermitAmount>, nonce, deadline }` and signs via Privy embedded wallet's `signTypedData`.
5. Frontend embeds the permit signature in `userOp.paymasterAndData` formatted per Circle's encoding (see Circle's [paymaster-aa-sdk-middleware](https://github.com/ksmith-circle/circle-paymaster-aa-sdk-middleware) for the exact encoding).
6. Bundler calls Circle's paymaster contract; paymaster `permit()`s USDC from user to itself; deducts gas cost in USDC; settles.

**Replay/expired deadline behavior:** EIP-2612 nonces are sequential; replay impossible. Expired deadline reverts at paymaster validation (userOp not included). Frontend MUST display the in-flow modal "Pay gas in USDC: $X.XX (one signature)" before signing.

**`maxPermitAmount`:** Set to estimated `gasCostInUsdc + 20%` headroom; over-permit is safe because permit is per-tx (not blanket). Wave 0 question: estimate Arbitrum gas cost in USDC (typically <$0.05).

**Source:** [Circle Paymaster Arbitrum quickstart](https://docs.arbitrum.io/for-devs/third-party-docs/Circle/usdc-paymaster-quickstart) [CITED] + [Circle Paymaster announcement blog](https://www.circle.com/blog/how-to-integrate-circle-paymaster-to-enable-users-to-pay-gas-fees-with-their-usdc-balance) [CITED]

### Pattern 6: CallRegistry Contract Layout (storage-optimized)

Storage layout MUST pack to minimize gas. Phase 4's rep storage extension is deferred — Phase 1 leaves room.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { USDC_ARB_NATIVE } from "./constants/USDC.sol";
import { IProfileRegistry } from "./interfaces/IProfileRegistry.sol";
import { DuplicateHashLib } from "./libraries/DuplicateHashLib.sol";

contract CallRegistry is Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ─── Constants (compile-time, no storage) ───
    uint96 public constant MIN_STAKE = 5e6;     // $5 USDC
    uint96 public constant MAX_STAKE = 100e6;   // $100 USDC
    uint96 public constant CREATION_FEE = 10e6; // $10 USDC
    uint96 public constant TREASURY_PORTION = 5e6;
    uint96 public constant VIRTUAL_FADE_PORTION = 5e6;
    uint96 public constant BASE_VIRTUAL_FADE = 2e6;
    uint8  public constant CONVICTION_FLOOR_MIN_CALLS = 10;
    uint8  public constant HIGH_CONVICTION_THRESHOLD = 85;
    uint8  public constant HIGH_CONVICTION_AUTOCAP = 84;
    uint8  public constant CATEGORY_COUNT = 3;

    // ─── Storage (slot-packed where possible) ───
    enum MarketType { PriceTarget, SpreadVs, Event }
    enum EventSubtype { None, TvlMilestone, VolumeFees, OnchainMetric, CexListing, TokenLaunch, Governance, ProtocolMilestone }
    enum CallStatus { Live, Settled, Disputed, CallerExited }
    enum Category { Majors, DeFi, Other }

    struct Call {
        // slot 1: 32 bytes
        address caller;          // 20 bytes
        uint96 stake;            // 12 bytes — $100 fits in uint96
        // slot 2
        uint96 virtualFadeSeed;  // 12 bytes
        uint64 createdAt;        // 8 bytes
        uint64 expiry;           // 8 bytes
        MarketType marketType;   // 1 byte
        EventSubtype eventSubtype; // 1 byte
        Category category;       // 1 byte
        CallStatus status;       // 1 byte
        uint8 conviction;        // 1 byte (1-100)
        bool openToChallenges;   // 1 byte
        // slot 3+
        bytes32 duplicateHash;
        bytes32 criteriaHash;    // bytes32(0) if no criteria
        // packed external refs
        uint256 assetA;          // could be address(uint160) for NFT, or feed-key for coin (encoded)
        uint256 assetB;          // 0 for single-asset
        uint256 targetValue;
        uint256 parentCallId;    // 0 for non-quote
    }

    Call[] internal _calls;  // _calls[0] is unused; callId starts at 1
    mapping(bytes32 => uint256) public activeDuplicateHashes; // hash → callId (0 if none)
    mapping(address => uint256[]) internal _userCalls;        // for CALL-67 pagination
    mapping(string => bytes32) public allowlistedAssets;      // symbol → Pyth feed ID
    mapping(address => bool) public allowlistedNftCollections;

    IProfileRegistry public immutable profileRegistry;
    address public settlementManager; // settable in Phase 4; can be address(0) initially
    uint256 public currentTvl;
    uint256 public tvlCap;
    uint256 public constant MAX_ALLOWED_CAP = 100_000e6;

    // ─── Events ───
    event CallCreated(uint256 indexed id, address indexed caller, MarketType marketType, uint96 stake);
    event CallQuoted(uint256 indexed parentId, uint256 indexed quoteId);
    event ConvictionCapped(address indexed caller, uint8 requested, uint8 applied);
    event AssetAllowlisted(string symbol, bytes32 feedId);
    event NftCollectionAllowlisted(address collection);
    event TvlCapSet(uint256 newCap);
    event SettlementManagerSet(address newManager);

    // ─── Custom errors ───
    error StakeBelowMinimum();
    error StakeAboveMaximum();
    error ExpiryNotInFuture();
    error CategoryInvalid();
    error AssetNotAllowlisted();
    error CriteriaRequired(MarketType marketType, EventSubtype subtype);
    error DuplicateCall(uint256 existingCallId);
    error TvlCapReached(uint256 requested, uint256 available);
    error InsufficientUsdcAllowance(uint256 needed, uint256 actual);
    error InsufficientUsdcBalance(uint256 needed, uint256 actual);
    error UsdcTransferFailed();
    error HandleTooLong();
    error CapTooHigh();
    error NotSettlementManager();

    constructor(IProfileRegistry _profileRegistry, uint256 _tvlCap) Ownable(msg.sender) {
        profileRegistry = _profileRegistry;
        require(_tvlCap <= MAX_ALLOWED_CAP, "cap-too-high");
        tvlCap = _tvlCap;
        _calls.push(); // burn callId 0
    }

    // ─── Main entry ───
    function createCall(/* args */) external nonReentrant whenNotPaused returns (uint256 callId) {
        // ... gate sequence (see Pattern 7)
    }
}
```

**Storage notes:**
- `Call.caller + stake` packs into one 32-byte slot (20+12). Saves 1 SSTORE on every create.
- `virtualFadeSeed + createdAt + expiry + marketType + eventSubtype + category + status + conviction + openToChallenges` packs into 31 bytes — one slot.
- `_calls[0]` is burned so a `0` callId in `activeDuplicateHashes` means "no duplicate."
- `_userCalls[user]` array enables CALL-67 paginated reads at cost of O(1) push on create.
- `currentTvl` is local to CallRegistry. Phase 6 aggregator reads `getTvl()` view across all three contracts (Pitfall 3 — known limitation; CallRegistry's check is a partial view of TVL until Phase 6).

### Pattern 7: Gate Sequence in `createCall` (CALL-13..36 + CALL-69)

```solidity
function createCall(
    MarketType marketType,
    EventSubtype eventSubtype,
    Category category,
    uint256 assetA,
    uint256 assetB,
    uint256 targetValue,
    uint64 expiry,
    uint96 stake,
    uint8 conviction,
    bytes32 criteriaHash,
    bool openToChallenges,
    uint256 parentCallId
) external nonReentrant whenNotPaused returns (uint256 callId) {
    // Gate 6.1 — stake bounds
    if (stake < MIN_STAKE) revert StakeBelowMinimum();
    if (stake > MAX_STAKE) revert StakeAboveMaximum();

    // CALL-32 expiry future
    if (expiry <= block.timestamp) revert ExpiryNotInFuture();

    // CALL-33 category valid
    if (uint8(category) >= CATEGORY_COUNT) revert CategoryInvalid();

    // CALL-13 allowlist (symbol/contract — encoded into assetA/assetB)
    _assertAllowlisted(marketType, assetA, assetB);

    // CALL-15/16 — criteria required for event subtypes 3..6
    if (_criteriaRequired(marketType, eventSubtype) && criteriaHash == bytes32(0)) {
        revert CriteriaRequired(marketType, eventSubtype);
    }

    // Gate 6.3 — high-conviction floor auto-cap (NO revert)
    uint8 appliedConviction = conviction;
    if (conviction >= HIGH_CONVICTION_THRESHOLD) {
        uint256 settled = profileRegistry.settledCalls(msg.sender);
        if (settled < CONVICTION_FLOOR_MIN_CALLS) {
            appliedConviction = HIGH_CONVICTION_AUTOCAP;
            emit ConvictionCapped(msg.sender, conviction, appliedConviction);
        }
    }

    // Gate 6.2 — duplicate hash
    uint64 deadlineDay = DuplicateHashLib.dayBucketUtc(expiry);
    bytes32 dupHash = DuplicateHashLib.compute(
        marketType, assetA, /*metric placeholder*/ uint256(eventSubtype), targetValue, deadlineDay
    );
    uint256 existing = activeDuplicateHashes[dupHash];
    if (existing != 0) revert DuplicateCall(existing);

    // CALL-34 — TVL cap aggregate (local; Phase 6 extends)
    uint256 incoming = stake + CREATION_FEE;
    if (currentTvl + incoming > tvlCap) revert TvlCapReached(incoming, tvlCap - currentTvl);

    // CALL-35/36 — USDC pre-checks (mirror the SafeERC20 revert with explicit errors)
    uint256 allowance = IERC20(USDC_ARB_NATIVE).allowance(msg.sender, address(this));
    if (allowance < incoming) revert InsufficientUsdcAllowance(incoming, allowance);
    uint256 balance = IERC20(USDC_ARB_NATIVE).balanceOf(msg.sender);
    if (balance < incoming) revert InsufficientUsdcBalance(incoming, balance);

    // CALL-37 — Checks-Effects-Interactions: effects FIRST
    callId = _calls.length;
    _calls.push(Call({
        caller: msg.sender,
        stake: stake,
        virtualFadeSeed: BASE_VIRTUAL_FADE + VIRTUAL_FADE_PORTION,  // $7
        createdAt: uint64(block.timestamp),
        expiry: expiry,
        marketType: marketType,
        eventSubtype: eventSubtype,
        category: category,
        status: CallStatus.Live,
        conviction: appliedConviction,
        openToChallenges: openToChallenges,
        duplicateHash: dupHash,
        criteriaHash: criteriaHash,
        assetA: assetA,
        assetB: assetB,
        targetValue: targetValue,
        parentCallId: parentCallId
    }));
    activeDuplicateHashes[dupHash] = callId;
    _userCalls[msg.sender].push(callId);
    currentTvl += incoming;

    // Interactions LAST
    IERC20(USDC_ARB_NATIVE).safeTransferFrom(msg.sender, address(this), incoming);
    // CALL-38 — fee split implemented in Phase 2 when FollowFadeMarket exists.
    // Phase 1 holds entire incoming amount in CallRegistry; settlement Phase 4 distributes.

    emit CallCreated(callId, msg.sender, marketType, stake);
    if (parentCallId != 0) emit CallQuoted(parentCallId, callId);
}
```

**Spec parity with Zod:** Every revert above corresponds to a Zod refine in `packages/shared/src/validation/call-gates.ts`. The parity fixture (`gate-matrix.json`) is a list of `{ inputs, expected_revert | expected_pass }` cases. The Foundry test posts each case to the contract; the Vitest test posts each to the Zod schema; they MUST agree (D-29).

### Pattern 8: ProfileRegistry — Storage Shape Reserved for Phase 4 Extension

```solidity
contract ProfileRegistry is Ownable2Step {
    struct Profile {
        // slot 1
        uint128 globalRep;          // 16 bytes — well above the 0..uint32 actual range; gives Phase 4/5 headroom
        uint64 lastActiveAt;
        uint32 totalCalls;
        uint16 settledCalls;        // up to 65k settled calls per user — sufficient for v1
        // slot 2
        uint32 wins;
        uint32 losses;
        uint32 streak;
        uint32 categoryRep_Majors;
        uint32 categoryRep_DeFi;
        uint32 categoryRep_Other;
        uint32 callerRep;
        uint32 challengerRep;
        // Phase 4/5 will add fields after challengerRep; never reorder existing.
    }

    struct SocialIdentity {
        bytes32 twitterProofHash;
        bytes32 farcasterProofHash;
        uint64 twitterLinkedAt;
        uint64 farcasterLinkedAt;
        string twitterHandle;   // ≤50 bytes enforced
        string farcasterHandle; // ≤50 bytes enforced
    }

    uint8 public constant MAX_HANDLE_LENGTH = 50;

    mapping(address => Profile) internal _profiles;
    mapping(address => string) public displayHandle;
    mapping(address => SocialIdentity) internal _socials;
    mapping(address => bool) public profileExists;

    address public settlementManager;
    address public relayer;

    event ProfileUpdated(address indexed user, uint32 totalCalls, uint16 settledCalls);
    event HandleSet(address indexed user, string handle);
    event SettlementManagerSet(address newManager);
    event RelayerSet(address newRelayer);
    event SocialLinked(address indexed user, uint8 kind, string handle, bytes32 proofHash);
    event SocialUnlinked(address indexed user, uint8 kind);

    error HandleTooLong();
    error NotSettlementManager();
    error NotRelayer();
    error NotSelf();

    constructor() Ownable(msg.sender) {}

    function setSettlementManager(address newManager) external onlyOwner {
        settlementManager = newManager;
        emit SettlementManagerSet(newManager);
    }

    function setRelayer(address newRelayer) external onlyOwner {
        relayer = newRelayer;
        emit RelayerSet(newRelayer);
    }

    function setDisplayHandle(string calldata handle) external {
        if (bytes(handle).length > MAX_HANDLE_LENGTH) revert HandleTooLong();
        _initIfNeeded(msg.sender);
        displayHandle[msg.sender] = handle;
        emit HandleSet(msg.sender, handle);
    }

    function settledCalls(address user) external view returns (uint16) {
        return _profiles[user].settledCalls;
    }

    function updateAfterSettlement(/* args */) external {
        if (msg.sender != settlementManager) revert NotSettlementManager();
        // Phase 4 implementation; Phase 1 leaves the function callable with revert if no manager set.
    }

    function linkTwitter(address user, string calldata handle, bytes32 proofHash) external {
        if (msg.sender != relayer) revert NotRelayer();
        // Phase 1.5 implementation; Phase 1 leaves the function callable.
        _socials[user].twitterHandle = handle;
        _socials[user].twitterProofHash = proofHash;
        _socials[user].twitterLinkedAt = uint64(block.timestamp);
        emit SocialLinked(user, 0, handle, proofHash);
    }

    function unlinkTwitter() external {
        // AUTH-41: callable by user directly
        delete _socials[msg.sender].twitterHandle;
        delete _socials[msg.sender].twitterProofHash;
        emit SocialUnlinked(msg.sender, 0);
    }

    // ... same pattern for Farcaster

    function _initIfNeeded(address user) internal {
        if (!profileExists[user]) {
            _profiles[user].globalRep = 100;  // REP-01
            profileExists[user] = true;
        }
    }
}
```

**Why this shape:**
- `globalRep` as `uint128` is far larger than needed today (Phase 5 Stylus `i32` math returns), but gives headroom and packs naturally with `lastActiveAt + totalCalls + settledCalls`.
- All `Profile` fields are reserved at deploy; Phase 4 just writes them. **No struct extension needed in Phase 4** — keep this layout stable.
- `_initIfNeeded` lazily initializes on first action; saves a setup call per user.

### Pattern 9: Anti-Drift Parity Test (D-29)

**Fixture file** at `packages/contracts/test/fixtures/gate-matrix.json`:
```json
[
  {
    "name": "stake-below-minimum",
    "input": { "stake": "4000000", "conviction": 50, "marketType": 0, "expiry": "deadlineFuture", "category": 0, "criteriaHash": "0x00..." },
    "expected": { "type": "revert", "selector": "StakeBelowMinimum()" }
  },
  {
    "name": "high-conviction-cap-for-new-caller",
    "input": { "stake": "10000000", "conviction": 90, "callerSettled": 5, /*...*/ },
    "expected": { "type": "event", "name": "ConvictionCapped", "args": { "requested": 90, "applied": 84 } }
  }
  // ... ~30-50 cases covering every gate × edge
]
```

**Foundry test** loads the fixture, calls `createCall`, asserts revert selector or event. **Vitest parity test** loads the same fixture, runs each `input` through the Zod schema in `packages/shared/src/validation/call-gates.ts`, asserts the Zod error code matches.

**CI guard:** A GitHub Action runs both, then runs a `diff` script that fails if the parity matrix wasn't fully covered or if any case passed one but failed the other.

### Pattern 10: New Call Form — RHF + Zod + Mode-Conditional Sub-Forms

```tsx
// apps/web/app/new/page.tsx (excerpt)
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createCallSchema, type CreateCallInput } from '@call-it/shared/schemas/call-gates';
import { Receipt } from '@call-it/ui';
import { useDebouncedDupCheck } from '@/lib/use-dup-check';

export default function NewCallPage() {
  const form = useForm<CreateCallInput>({
    resolver: zodResolver(createCallSchema),
    mode: 'onChange',  // for inline errors per D-31
    defaultValues: { /* ... */ },
  });

  const formValues = form.watch();
  const dupCheck = useDebouncedDupCheck(formValues, 400);  // D-22

  // Mode-conditional sub-form
  const marketType = form.watch('marketType');

  return (
    <div className="grid-disabled flex">  {/* NO display:grid — Pitfall 15 — flex layout */}
      <form onSubmit={form.handleSubmit(onSubmit)} className="form-left flex-1">
        {/* shared fields: marketType, deadline, stake, conviction */}
        {marketType === 'priceTarget' && <PriceTargetFields form={form} />}
        {marketType === 'spreadVs' && <SpreadVsFields form={form} />}
        {marketType === 'event' && <EventFields form={form} subtype={form.watch('eventSubtype')} />}
        {dupCheck.match && <DuplicateWarning existingCallId={dupCheck.match} />}
      </form>
      <aside className="preview-right flex-1">
        <Receipt mode="preview" data={formValues} />
      </aside>
    </div>
  );
}
```

**Source:** [@hookform/resolvers docs](https://github.com/react-hook-form/resolvers) [CITED]

### Pattern 11: Feed — 800ms Race Pattern (D-24)

```ts
// apps/relayer/src/routes/feed.ts
app.get('/api/feed', async (req, reply) => {
  const cursor = req.query.cursor;
  const cacheKey = `feed:firstpage`;

  // D-26: Redis 10s TTL on first page only
  if (!cursor) {
    const cached = await app.redis.get(cacheKey);
    if (cached) return reply.send(JSON.parse(cached));
  }

  const subgraphPromise = querySubgraph(cursor);
  const fallbackPromise = queryPolledEventsWorker(cursor);

  const racedResult = await Promise.race([
    subgraphPromise.then(r => ({ source: 'subgraph', data: r })),
    new Promise<{ source: 'fallback'; data: unknown }>((resolve) =>
      setTimeout(async () => resolve({ source: 'fallback', data: await fallbackPromise }), 800)
    ),
  ]);

  if (racedResult.source === 'fallback') {
    app.log.warn({ event: 'feed_fallback_engaged', cursor }, 'subgraph slow, used polled-events worker');
  }

  // Also check subgraph block-number lag
  const meta = (racedResult.source === 'subgraph') && (racedResult.data as any)._meta;
  if (meta && meta.block && meta.block.number < (await getCurrentBlock()) - 50) {
    app.log.warn({ event: 'feed_subgraph_lag', lagBlocks: 50 + }, 'subgraph behind by >50 blocks');
    // fall through to fallback
    racedResult.data = await fallbackPromise;
    racedResult.source = 'fallback';
  }

  if (!cursor) await app.redis.set(cacheKey, JSON.stringify(racedResult.data), 'EX', 10);

  return reply.send(racedResult.data);
});
```

### Pattern 12: ENS Reverse-Record Resolution with 24h Redis Cache (D-13)

```ts
// apps/relayer/src/lib/ens-resolver.ts
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http(process.env.ENS_MAINNET_RPC_URL!),  // separate from Arbitrum RPC
});

export async function resolveEns(address: `0x${string}`, redis: Redis): Promise<string | null> {
  const cacheKey = `ens:${address.toLowerCase()}`;
  const cached = await redis.get(cacheKey);
  if (cached !== null) {
    // Negative-cache hit: "::null::" sentinel means "we tried and there was no ENS name"
    return cached === '::null::' ? null : cached;
  }

  try {
    const name = await mainnetClient.getEnsName({ address });
    await redis.set(cacheKey, name ?? '::null::', 'EX', 86400);  // 24h
    return name;
  } catch (err) {
    // On RPC failure, return null but don't cache (let it retry next request)
    return null;
  }
}
```

### Pattern 13: Privy Provider-Order AST Test (Pitfall 13)

```ts
// apps/web/tests/privy-provider-order.ast.test.ts
import { Project, SyntaxKind } from 'ts-morph';
import { describe, it, expect } from 'vitest';
import path from 'path';

describe('Privy provider order (Pitfall 13)', () => {
  it('providers.tsx wraps in order: PrivyProvider > QueryClientProvider > WagmiProvider', () => {
    const project = new Project({ tsConfigFilePath: path.resolve(__dirname, '..', 'tsconfig.json') });
    const file = project.getSourceFileOrThrow(path.resolve(__dirname, '..', 'app', 'providers.tsx'));

    const jsx = file.getDescendantsOfKind(SyntaxKind.JsxElement);
    const outermost = jsx[0];
    expect(outermost.getOpeningElement().getTagNameNode().getText()).toBe('PrivyProvider');

    const queryClient = outermost.getChildrenOfKind(SyntaxKind.JsxElement)[0];
    expect(queryClient.getOpeningElement().getTagNameNode().getText()).toBe('QueryClientProvider');

    const wagmi = queryClient.getChildrenOfKind(SyntaxKind.JsxElement)[0];
    expect(wagmi.getOpeningElement().getTagNameNode().getText()).toBe('WagmiProvider');

    // Verify WagmiProvider is imported from @privy-io/wagmi NOT from wagmi
    const wagmiImport = file.getImportDeclaration(d =>
      d.getNamedImports().some(n => n.getName() === 'WagmiProvider')
    );
    expect(wagmiImport?.getModuleSpecifierValue()).toBe('@privy-io/wagmi');
  });
});
```
**Source:** [ts-morph docs](https://ts-morph.com/) [CITED]

### Anti-Patterns to Avoid

- **Importing `WagmiProvider` from `wagmi`** instead of `@privy-io/wagmi` — embedded wallets silently fail. AST test catches this (Pitfall 13).
- **Using `display: grid`** anywhere that might render under Satori (Phase 7 OG). Even though Phase 7 is later, `<Receipt>` is the shared component — flexbox-only from day one (Pitfall 15). Add an ESLint custom rule to `packages/ui` rejecting `gridTemplate*` / `display: grid` in `<Receipt>` and its children.
- **Storing `criteria` text onchain** instead of `criteriaHash` — gas explodes; IPFS pinning of raw text deferred to Phase 7.
- **Incrementing paymaster counter at policy-decision time** instead of confirmed-inclusion time — would over-count failed userOps.
- **Hardcoding USDC.e address** (`0xFF970A61...DB5CC8`) anywhere — Phase 0 grep guard catches; reinforce in code review.
- **Frontend client-side enforcement** of address-book 24h cooldown — must be server-side (Pitfall 20).
- **Reading ENS in client browser via Privy embedded wallet's RPC** — Privy's RPC is Arbitrum, ENS is on Mainnet. Server-side resolution via dedicated Mainnet RPC URL.
- **Pre-computing duplicate hash with non-floored deadline** — Pitfall 12; always floor to UTC day.
- **Calling `setSettlementManager(addr)` in deploy script without `addr = address(0)` Phase 1 initial state** — Phase 4 sets the real manager; Phase 1 should leave it zero or set to a known placeholder.
- **`shadcn/ui`** import — explicitly rejected by D-16.
- **Animation libraries beyond framer-motion for `<Stamp>`** — CSS keyframes suffice for skeletons, toasts, and page transitions.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OAuth + embedded wallet onboarding | Custom OAuth flow + key management | Privy 3.27 | Multi-auth linking + paymaster wiring + key export — Privy handles all of it |
| EIP-4337 userOp construction | Custom userOp encoding | `@account-kit/infra` (Alchemy aa-sdk) | aa-sdk handles EntryPoint v0.7 + bundler RPCs + ERC-7677 middleware |
| Per-tx USDC gas payment | Custom USDC paymaster | **Circle USDC Paymaster contract** at `0x6C973eBe80dCD8660841D4356bf15c32460271C9` | Already audited; EIP-2612 permit standard; zero custom contract code |
| Multi-step form state | Custom form state hook | `react-hook-form` + `@hookform/resolvers/zod` | Re-render optimization + Zod refinement chain — battle-tested |
| AMM/swap math | Roll our own | OZ + Phase 2 `FollowFadeMarket` (NOT this phase) | Phase 2 implementation; Phase 1 stops at stake + virtual seed |
| ERC-20 transfers with reentrancy guard | Custom transfer wrapper | OZ `SafeERC20.safeTransferFrom` + `ReentrancyGuard` | Standard pattern; CEI enforced |
| Pausable | Roll our own | OZ `Pausable` | `whenNotPaused` modifier; carve-out for `claim*`/`exit*` (Phase 2+) |
| Ownable with 2-step transfer | Custom owner pattern | OZ `Ownable2Step` | Pending owner pattern blocks "transfer to zero" mistakes |
| Postgres migrations | Hand-written SQL files only | `drizzle-orm` + `drizzle-kit` | Auto-generates migrations from schema; TS-first; pairs with Zod via `drizzle-zod` |
| ENS reverse-record resolution | Custom ENS contract calls | `viem.getEnsName({ address })` | Handles wildcard + ENSIP-10 + name validation |
| Component variants (e.g., Button size + intent) | Custom prop-to-class mapping | CVA (`class-variance-authority`) | Type-safe variant API; declarative |
| Dialog/Popover/Tooltip/Slider a11y | Custom modal + keyboard handling | Radix primitives | A11y + focus management for free |
| AST diffing for provider order | Regex match on `providers.tsx` | `ts-morph` Project + JSX descendants | Robust to whitespace, comments, comment-out-and-back-in refactors |
| Permit signature generation | Custom EIP-712 typed-data builder | viem's `signTypedData` + Circle's permit struct from their docs | EIP-2612 is standard but error-prone to encode by hand |
| Toast queue management | Custom array state hook | Radix `Toast` primitive composed with CVA + framer-motion countdown | Stacking + auto-dismiss + entrance/exit handled |
| Subgraph polling fallback | New polling library | Phase 0's existing `polled-events-fallback.ts` worker | Extend, don't replace |

**Key insight:** Phase 1 is dominated by integration glue work. The pattern of "import a well-tested library and configure it" is correct in every row above. The temptation to roll our own is highest on `<Receipt>` (intentional — design system primitive) and the parity test (intentional — anti-drift gate). Everywhere else, lean on libraries.

---

## Runtime State Inventory

**Phase 1 is a greenfield contract + new tables phase, not a rename/migration. Section minimal:**

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None to migrate — Phase 0 left Postgres unprovisioned | Wave 0 task: provision Fly Postgres in iad, run initial migration |
| Live service config | Phase 0 deployed: Alchemy bundler API key in GCP Secret Manager (sepolia + mainnet projects). Need new keys: Privy app secret, Alchemy AA paymaster policy ID, Postgres URL, ENS Mainnet RPC URL | Wave 0: add 4 secrets to each GCP project per D-09; update Fly deploy workflow to fetch them |
| OS-registered state | None — no OS-level scheduled tasks beyond Phase 0 Telegram synthetic-alert cron and Stylus reactivation reminders | None |
| Secrets / env vars | New required envs for `apps/web`: `NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_ALCHEMY_AA_POLICY_ID`, `NEXT_PUBLIC_CALL_REGISTRY_ADDRESS`, `NEXT_PUBLIC_PROFILE_REGISTRY_ADDRESS`, `NEXT_PUBLIC_RELAYER_BASE_URL`, `NEXT_PUBLIC_CIRCLE_PAYMASTER_ADDRESS`. New for `apps/relayer`: `POSTGRES_URL`, `ENS_MAINNET_RPC_URL`, `PRIVY_APP_SECRET`, `PRIVY_WEBHOOK_SECRET`, `ALCHEMY_PAYMASTER_ADDRESS`, `SUBGRAPH_STUDIO_API_KEY` (already exists). Update `packages/shared/src/schemas/env-config.ts` Zod schema and the CI env grep guard | Wave 0 task |
| Build artifacts | None — fresh contracts compile under Foundry; `out/` directory regenerates | Wave 0: run `forge clean && forge build` to baseline |

**Nothing else found.** Phase 0 verification (`.planning/phases/00-foundation/VERIFICATION.md`) confirmed clean hosted-resources state.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Fly Postgres | D-07 address book + auth_methods + onboarding_state | Not yet provisioned | — | Wave 0 task — `fly postgres create --region iad --name call-it-pg` |
| Alchemy AA API key | D-01 paymaster, bundler, AA RPC | Phase 0 provisioned Alchemy NFT API; AA dashboard key needs separate enablement | — | Wave 0 task — enable Alchemy AA app on the same account |
| Circle Paymaster on Arbitrum | D-04 post-cap USDC gas | Live mainnet at `0x6C973eBe80dCD8660841D4356bf15c32460271C9`; Sepolia equivalent TBD | — | Wave 0 task: verify mainnet address against current Arbitrum docs; locate Sepolia address |
| ENS Mainnet RPC | D-13 server-side ENS resolution | Need separate provider key (Alchemy Ethereum mainnet, or public RPC) | — | Alchemy Ethereum mainnet free-tier suffices for 24h-cached reads |
| Privy app secret + webhook secret | Server-side OAuth proof verification + `auth.linked` webhook | Phase 0 has dashboard account; secrets generated and need GCP Secret Manager storage | — | Wave 0 task |
| Foundry | Contract build + test + fuzz | Phase 0 installed | — | — |
| pnpm + turborepo | Monorepo build | Phase 0 installed (pnpm 11.0.8, turbo 2.5) | — | — |
| Subgraph Studio API key | Feed primary source | Phase 0 deployed schema to Sepolia | exists | Polled-events worker fallback |
| Upstash Redis | Paymaster counter + ENS cache + feed cache + dup-check cache | Phase 0 provisioned | — | — |
| GCP KMS + Secret Manager | Per-network IAM separation | Phase 0 provisioned (`call-it-sepolia`, `call-it-mainnet`) | — | — |

**Missing dependencies with no fallback:** Fly Postgres provisioning is blocking — must happen Wave 0. Alchemy AA dashboard enablement is blocking — must happen Wave 0.
**Missing dependencies with fallback:** ENS Mainnet RPC can start on a free Alchemy plan; rate limits sufficient for 24h-cached resolution.

---

## Common Pitfalls

### Pitfall 1 (project-wide): USDC hardcoded address gate in every transfer path
**What goes wrong:** A new contract in Phase 1 hardcodes USDC.e instead of importing `USDC_ARB_NATIVE`.
**How to avoid:** Every USDC use in `CallRegistry.sol` MUST `import { USDC_ARB_NATIVE } from "./constants/USDC.sol"`. Phase 0 grep guard checks the bridged address absence in source files. Add explicit Foundry test: `assert(IERC20(USDC_ARB_NATIVE).balanceOf(...) == ...)` using the constant, no literal.
**Warning signs:** CI grep guard fires.
**Files that enforce this in Phase 1:** `packages/contracts/test/CallRegistry.t.sol` reads back `USDC_ARB_NATIVE` constant; `.github/workflows/grep-guards.yml` runs on every PR.

### Pitfall 12: Duplicate-hash UTC-day boundary surprises
**What goes wrong:** User in PST picks "today 11:32 PM PT" which is next-day-UTC; collides unexpectedly.
**How to avoid:** Deadline composer in `<NewCallForm>` MUST show two labels: `Your time: {localISO}` + `Hash bucket: {utcDayStart}`. CALL-46 mandates this. Add Playwright test that fills a deadline near UTC boundary and asserts the second label is visible.
**Files that enforce:** `apps/web/app/new/components/DeadlinePicker.tsx`; `apps/web/tests/new-call-publish.spec.ts`.

### Pitfall 13: Privy provider order reordered by refactor
**What goes wrong:** A refactor adds AuthKitProvider above WagmiProvider; embedded wallets vanish silently for Google/Twitter users.
**How to avoid:** AST regression test in Wave 0 (Pattern 13 above). Playwright sign-in test (`signin.spec.ts`) covers the runtime check by completing Google sign-in and asserting `useAccount().address` resolves.
**Files that enforce:** `apps/web/tests/privy-provider-order.ast.test.ts`; `apps/web/tests/signin.spec.ts`.

### Pitfall 14: Per-user 5-tx cap enforced server-side, not vendor-side
**What goes wrong:** Build relies on Alchemy's gas-policy spend rules to enforce per-account count; vendor changes terms or count tracking drifts.
**How to avoid:** Implement the policy in OUR `/paymaster/policy` endpoint (Pattern 4). Counter in Upstash Redis; increment on confirmed inclusion via UserOperationEvent watcher.
**Files that enforce:** `apps/relayer/src/routes/paymaster-policy.ts`; `apps/relayer/src/workers/paymaster-confirmer.ts`; Vitest unit test with `ioredis-mock`.

### Pitfall 15: `display: grid` in Receipt component (Phase 7 OG via Satori)
**What goes wrong:** Developer reaches for grid in a 2-column comparison; Satori silently misrenders in Phase 7.
**How to avoid:** ESLint custom rule in `packages/ui` rejecting `display: grid` and `grid-template-*` in `<Receipt>` and its sub-components. Build all flexbox now.
**Files that enforce:** `packages/ui/.eslintrc.cjs` custom rule; `packages/ui/src/compound/Receipt.tsx` has comment "FLEXBOX ONLY — see PITFALLS.md Pitfall 15."

### Pitfall 16: Privy outage → Connect Wallet fallback UX
**What goes wrong:** Privy is down, OAuth users locked out, no obvious recovery path.
**How to avoid:** Sign-in screen ALWAYS shows Connect Wallet as the primary CTA above Google/Twitter. Operator runbook: during outage, surface a banner "Privy service issues — Connect Wallet to continue." Document in `docs/runbooks/privy-outage.md`.
**Files that enforce:** `apps/web/app/signin/page.tsx` (button order matters — Connect Wallet first); runbook file.

### Pitfall 20: 24h new-auth-link cooldown server-side in relayer
**What goes wrong:** Cooldown checked client-side only; attacker bypasses via direct contract call.
**How to avoid:** All withdrawals (Phase 1 has no withdrawal — Phase 2+; but `setDisplayHandle` and any "sensitive" relayer call) go through `POST /api/withdraw/authorize` which checks `auth_methods.linked_at` against now.
**Files that enforce:** `apps/relayer/src/routes/withdraw-authorize.ts`; Vitest test `withdraw-authorize.test.ts` posts a direct-bypass attempt and asserts 403.

### Pitfall A (NEW for Phase 1): Conviction floor enum drift
**What goes wrong:** Contract's `HIGH_CONVICTION_THRESHOLD` is 85 but the frontend's `<ConvictionWarning>` uses 80 (hardcoded). User crosses 85, sees no warning, gets surprise cap.
**How to avoid:** Move conviction thresholds to `packages/shared/src/constants/conviction.ts` consumed by both Solidity (via codegen or hardcoded mirror with a parity assertion) and TS. Include in the gate matrix fixture.

### Pitfall B (NEW for Phase 1): Onboarding state row drift on resume
**What goes wrong:** User closes browser at Screen 2, returns later, frontend reads `current_step = 2` but the database has `current_step = 3` (because the previous session crashed mid-write). User sees Screen 3 but the Screen 2 data is missing.
**How to avoid:** `onboarding_state` writes are transactional: a Screen N+1 write only happens after Screen N's data is committed. Use `ON CONFLICT (privy_user_id) DO UPDATE SET ...` patterns.

### Pitfall C (NEW for Phase 1): Subgraph schema drift between Phase 0 stub and Phase 1 real events
**What goes wrong:** Phase 0 deployed event signatures with placeholder field names; Phase 1's real Solidity events have different field names (e.g., `id` vs `callId`); subgraph mapping fails to ingest events.
**How to avoid:** Wave 0 task: compare `subgraph.yaml` + `schema.graphql` against the new Solidity event signatures in `CallRegistry` / `ProfileRegistry`. Regenerate ABI files via `forge inspect` after contract changes. Add CI step to diff subgraph mappings against contract ABIs.

### Pitfall D (NEW for Phase 1): Address book RACE — Privy webhook lag vs first withdrawal
**What goes wrong:** User links new auth method, Privy webhook is delayed 30s, user immediately attempts a withdrawal — relayer hasn't yet recorded the new `auth_methods` row, returns 200 (not 403), enabling bypass.
**How to avoid:** Belt-and-suspenders — on every relayer authorize request, also query Privy's session API (`@privy-io/server-auth.getUser(userId)`) for current linkedAccounts; if a linkedAccount's `linkedAt` is <24h ago AND there's no `auth_methods` row, INSERT it now and reject the withdrawal.

---

## Code Examples

### Common Operation 1: viem reading `settledCalls` via wagmi (D-23)
```tsx
// apps/web/app/new/hooks/useSettledCalls.ts
import { useReadContract } from 'wagmi';
import { profileRegistryAbi } from '@/lib/abis';

export function useSettledCalls(user: `0x${string}` | undefined) {
  const { data, isLoading } = useReadContract({
    address: process.env.NEXT_PUBLIC_PROFILE_REGISTRY_ADDRESS as `0x${string}`,
    abi: profileRegistryAbi,
    functionName: 'settledCalls',
    args: user ? [user] : undefined,
    query: { enabled: !!user, staleTime: Infinity },  // cached for session
  });
  return { settledCalls: data as number | undefined, isLoading };
}
```
Source: [wagmi useReadContract docs](https://wagmi.sh/react/api/hooks/useReadContract) [CITED]

### Common Operation 2: drizzle schema for address_book
```ts
// apps/relayer/src/db/schema.ts
import { pgTable, varchar, timestamp, integer, serial, text } from 'drizzle-orm/pg-core';

export const addressBook = pgTable('address_book', {
  id: serial('id').primaryKey(),
  privyUserId: varchar('privy_user_id', { length: 128 }).notNull(),
  address: varchar('address', { length: 42 }).notNull(),  // 0x + 40
  label: text('label'),
  addedAt: timestamp('added_at').defaultNow().notNull(),
  removedAt: timestamp('removed_at'),  // soft delete
});

export const authMethods = pgTable('auth_methods', {
  id: serial('id').primaryKey(),
  privyUserId: varchar('privy_user_id', { length: 128 }).notNull(),
  authType: varchar('auth_type', { length: 32 }).notNull(),  // 'google' | 'twitter' | 'wallet'
  linkedAt: timestamp('linked_at').defaultNow().notNull(),
});

export const onboardingState = pgTable('onboarding_state', {
  privyUserId: varchar('privy_user_id', { length: 128 }).primaryKey(),
  currentStep: integer('current_step').default(1).notNull(),
  handleSetAt: timestamp('handle_set_at'),
  socialsStepCompletedAt: timestamp('socials_step_completed_at'),
  followgraphOptinAt: timestamp('followgraph_optin_at'),
  taglineCommittedAt: timestamp('tagline_committed_at'),
});
```
Source: [Drizzle ORM postgres docs](https://orm.drizzle.team/docs/get-started/postgresql-new) [CITED]

### Common Operation 3: CVA button variant
```tsx
// packages/ui/src/primitives/Button.tsx
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn';

const button = cva(
  [
    'font-display font-medium',
    'border-2 border-white',
    'transition-all duration-100',
    'shadow-[4px_4px_0_0_#000]',
    'hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[5px_5px_0_0_#000]',
    'active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0_0_#000]',
  ],
  {
    variants: {
      intent: {
        primary: 'bg-accent text-black border-black',
        secondary: 'bg-transparent text-white border-white',
        danger: 'bg-loss text-white border-black',
      },
      size: {
        sm: 'px-3 py-1 text-sm',
        md: 'px-4 py-2 text-base',
        lg: 'px-6 py-3 text-lg',
      },
    },
    defaultVariants: { intent: 'primary', size: 'md' },
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {}

export function Button({ intent, size, className, ...rest }: ButtonProps) {
  return <button {...rest} className={cn(button({ intent, size }), className)} />;
}
```
Source: [CVA docs](https://cva.style/docs) [CITED]

### Common Operation 4: Shared Zod schema for createCall
```ts
// packages/shared/src/schemas/call-gates.ts
import { z } from 'zod';

export const MIN_STAKE = 5_000_000n;
export const MAX_STAKE = 100_000_000n;
export const HIGH_CONVICTION_THRESHOLD = 85;
export const CONVICTION_AUTOCAP = 84;
export const CONVICTION_FLOOR_MIN_CALLS = 10;

export const stakeSchema = z.bigint().min(MIN_STAKE, { message: 'Minimum stake is $5 USDC' })
  .max(MAX_STAKE, { message: 'Maximum stake is $100 USDC' });

export const convictionSchema = z.number().int().min(1).max(100);

export const createCallSchema = z.object({
  marketType: z.enum(['priceTarget', 'spreadVs', 'event']),
  eventSubtype: z.enum(['none','tvlMilestone','volumeFees','onchainMetric','cexListing','tokenLaunch','governance','protocolMilestone']),
  category: z.enum(['majors', 'defi', 'other']),
  assetA: z.string(),  // refined per market type
  assetB: z.string().optional(),
  targetValue: z.bigint().positive(),
  expiry: z.bigint().refine(v => v > BigInt(Math.floor(Date.now() / 1000)), {
    message: 'Deadline must be in the future',
  }),
  stake: stakeSchema,
  conviction: convictionSchema,
  criteriaText: z.string().optional(),
  openToChallenges: z.boolean(),
  parentCallId: z.bigint().optional(),
}).superRefine((data, ctx) => {
  if (
    data.marketType === 'event' &&
    ['cexListing','tokenLaunch','governance','protocolMilestone'].includes(data.eventSubtype) &&
    (!data.criteriaText || data.criteriaText.length < 50)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['criteriaText'],
      message: 'Resolution Criteria is required (≥50 characters) for this event type',
    });
  }
});

export type CreateCallInput = z.infer<typeof createCallSchema>;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@privy-io/wagmi-connector` | `@privy-io/wagmi` (no `-connector` suffix) | wagmi v2 migration (2024) | Already absorbed in Phase 0 |
| Custom EIP-4337 userOp encoding | aa-sdk middleware (`@account-kit/infra`) | Alchemy aa-sdk v4 (2025) | Standard for new projects |
| Hand-rolled paymaster sponsorship logic | ERC-7677 standard endpoints (`pm_getPaymasterStubData`, `pm_getPaymasterData`) | April 2024 EIP publication; broad adoption 2025-2026 | Vendor-agnostic; bundlers call our endpoint |
| User pays ETH for gas | Circle USDC Paymaster (EIP-2612 permit) | Circle launch 2024; mainstream 2025 | No ETH required ever (D-04 deviation) |
| node-pg-migrate + raw `pg` | drizzle-orm + drizzle-kit | 2024-2026 industry shift | TypeScript-first; auto-generated migrations |
| The Graph Hosted Service | Subgraph Studio → Decentralized Network | June 12 2024 sunset | Phase 0 already using Studio |
| `@vercel/og` on edge runtime | `@vercel/og` on Node runtime | Vercel 2026 recommendation | Phase 0 already on Node |

**Deprecated/outdated:**
- `@privy-io/wagmi-connector` — legacy v1 path.
- Pages Router examples from <2024 tutorials.
- Privy v2 docs — must use v3 migration guide only.
- USDC.e — bridged version; not the canonical USDC anymore.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Circle USDC Paymaster address on Arbitrum mainnet is `0x6C973eBe80dCD8660841D4356bf15c32460271C9` | Pattern 5 + Environment Availability | If wrong / deprecated, post-cap UX breaks. Wave 0 task: re-fetch from Arbitrum docs at deploy time. |
| A2 | Alchemy aa-sdk's `alchemyGasAndPaymasterAndDataMiddleware` works with Privy embedded wallet as the underlying signer | Pattern 4 | If Privy's signer interface doesn't compose cleanly, fall back to `permissionless` viem-native AA helpers (covered in Alternatives Considered) |
| A3 | `class-variance-authority` major version is `^0.7.x` in May 2026 | Standard Stack | Low risk; CVA is API-stable. Wave 0 `npm view` verification covers. |
| A4 | `react-hook-form ^7.60.0` + `@hookform/resolvers ^5.2.2` are the current versions | Standard Stack | Low risk; both packages release patches without breaking changes |
| A5 | `drizzle-orm` and `drizzle-kit` versions `0.36+` / `0.30+` are stable for Postgres on Node 22 | Standard Stack | Drizzle is fast-moving; verify in Wave 0 |
| A6 | `@account-kit/infra` is at major version 4 in May 2026 | Standard Stack | aa-sdk is fast-moving; Wave 0 `npm view` task |
| A7 | The `pm_getPaymasterStubData` + `pm_getPaymasterData` RPC schema matches the EIP-7677 publication and Alchemy's implementation | Pattern 4 | EIP-7677 is broadly adopted but Alchemy also exposes `alchemy_requestGasAndPaymasterAndData` as a custom path. Wave 0 task: verify with Alchemy's current docs which path the bundler invokes. |
| A8 | Privy 3.27 exposes `embeddedWallets.createOnLogin: 'users-without-wallets'` for OAuth paths | Pattern 2 | Low risk; this is the documented v3 API. Verify against [Privy 3.x docs](https://docs.privy.io/basics/react/advanced/migrating-to-3.0) at impl. |
| A9 | Increment-on-confirmed-inclusion model: even reverted-but-included userOps count toward the 5-tx cap (operator pays gas) | Pattern 4 | Could be reversed if "reverts should be re-counted as zero" is the desired UX; user-facing decision. Default: count reverts. |
| A10 | Privy webhook payload for `auth.linked` includes `userId + authType + linkedAt` | Pitfall D | Verify webhook schema in Wave 0 against `@privy-io/server-auth` types. |
| A11 | Foundry fuzz default profile is sufficient for the gate matrix (`forge fuzz`); 1000-run `ci` profile is the gate | Pattern 9 | Phase 0 already established the `ci` Foundry profile per `foundry.toml`. |
| A12 | `framer-motion` is the right choice for `<Stamp>` (UI-45). Alternative: pure CSS keyframes with `cubic-bezier(.34,1.56,.64,1)` for overshoot. | Standard Stack | Low risk; framer-motion is import-controlled. |

**If any A-numbered claim is wrong at planning time, the planner must surface it to the user in `/gsd-discuss-phase` before locking the plan.**

---

## Open Questions

1. **Which Alchemy endpoint does the bundler call for paymaster — standard ERC-7677 or `alchemy_requestGasAndPaymasterAndData`?**
   - What we know: Both exist; aa-sdk has both `erc7677Middleware` and `alchemyGasAndPaymasterAndDataMiddleware`.
   - What's unclear: Whether enabling a gas policy with a callback URL on Alchemy's dashboard routes to ERC-7677 or to their custom RPC.
   - Recommendation: Wave 0 task — read Alchemy gas policy dashboard, identify the exact RPC the bundler calls, build `/paymaster/policy` to match. Prefer ERC-7677 if both supported.

2. **Sepolia equivalent of Circle USDC Paymaster — does one exist?**
   - What we know: Mainnet address is `0x6C973eBe80dCD8660841D4356bf15c32460271C9`.
   - What's unclear: Whether Circle has a Sepolia paymaster for staging tests, or whether the Sepolia stage uses Alchemy paymaster only for all transactions.
   - Recommendation: Wave 0 task — verify with Arbitrum + Circle docs. If no Sepolia paymaster, document that AUTH-29 USDC-gas path is "tested on mainnet smoke test only" per the §19.11 checklist.

3. **Does the Solidity `Call` struct's `assetA: uint256` encoding support both NFT collection addresses (cast `uint160`) and Pyth feed lookups (string-as-bytes32) cleanly?**
   - What we know: `uint256` is a flexible container; both representations fit.
   - What's unclear: Whether encoding via `bytes32(stringSymbol)` for coins vs `uint256(uint160(nftAddress))` for NFTs makes downstream subgraph mappings ugly.
   - Recommendation: Lock the encoding in `packages/shared/src/types/call.ts` and the matching Solidity struct comment. Pattern: `bytes32(string) << 96` for coin keys; `uint256(uint160(addr))` for NFTs. Subgraph mappings switch on `marketType` to decode.

4. **Where does the relayer's `paymasterSigner` live?**
   - What we know: GCP KMS holds 5 attestation keys (Phase 0 D-07). Paymaster signing is a 6th type.
   - What's unclear: Whether to add a 6th KMS key or to use a generic signing key.
   - Recommendation: **Add a 6th KMS key labeled `paymaster-policy-signer`**. Per-type separation principle (Phase 0 D-07) extends naturally.

5. **Does `@privy-io/wagmi@4.0.8` (the actual installed version, NOT CLAUDE.md's 1.32.5) expose the same `createConfig` API as the documented 1.32.5?**
   - What we know: Phase 0 P01 noted the deviation in STATE.md.
   - What's unclear: Whether v4 introduced breaking changes from v1.
   - Recommendation: Wave 0 task — read `node_modules/@privy-io/wagmi/dist/*.d.ts` for the exact API. Update Pattern 3 if necessary. **The version deviation must be re-litigated with the user if v4 API differs materially.**

6. **The Foundry+Vitest parity test — how does CI fail loudly on divergence?**
   - What we know: D-29 mandates the test; the matrix lives in `gate-matrix.json`.
   - What's unclear: Whether to use a single GH Action that runs both and `diff`s their outputs, or two separate jobs with a third "comparator" job.
   - Recommendation: Single Action with sequential steps — (1) `forge test --match-contract CallRegistryParity` writes JSON output; (2) `vitest run packages/shared/__tests__/call-gates-parity.test.ts` writes JSON output; (3) `node scripts/parity-diff.ts` compares. Fail on any mismatch.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Solidity tests | Foundry (`forge test`) — already installed |
| Frontend unit | Vitest 3 — already installed in `apps/web` |
| Frontend e2e | Playwright `^1.48.0` — already installed |
| Relayer unit | Vitest 3 — already installed |
| Config files | `foundry.toml`, `apps/web/vitest.config.ts`, `apps/web/playwright.config.ts`, `apps/relayer/vitest.config.ts` |
| Quick run command | `pnpm turbo run test` (runs all unit + Foundry) |
| Full suite command | `pnpm turbo run test && pnpm --filter @call-it/web exec playwright test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CALL-20/21 | Min $5 / Max $100 stake | Foundry unit | `forge test --match-test test_stake_bounds` | ❌ Wave 0 |
| CALL-22/23/24 | Duplicate hash UTC-day rounding | Foundry unit + Vitest parity | `forge test --match-test test_duplicate_hash && pnpm vitest run packages/shared/__tests__/duplicate-hash-parity.test.ts` | ❌ Wave 0 |
| CALL-25/26 | Duplicate revert | Foundry + Playwright (inline UI) | `forge test --match-test test_duplicate_revert && pnpm playwright test tests/new-call-publish.spec.ts` | ❌ Wave 0 |
| CALL-29..31 | Conviction auto-cap < 10 settled | Foundry unit | `forge test --match-test test_conviction_floor` | ❌ Wave 0 |
| CALL-32..36 | Expiry future / Category / Allowlist / USDC pre-checks | Foundry unit | `forge test --match-contract CallRegistryGates` | ❌ Wave 0 |
| CALL-37 | safeTransferFrom pulls stake + fee | Foundry integration with MockUSDC | `forge test --match-test test_creation_pulls_usdc` | ❌ Wave 0 |
| CALL-67 | `getCallsByUser` paginated view | Foundry unit | `forge test --match-test test_getCallsByUser_pagination` | ❌ Wave 0 |
| CALL-68 | `computeDuplicateHash` view exposed | Foundry unit | `forge test --match-test test_computeDuplicateHash_helper` | ❌ Wave 0 |
| CALL-69/70 | `CallCreated` + `CallQuoted` events | Foundry event assertion | `forge test --match-test test_emits_call_created` | ❌ Wave 0 |
| REP-01 | New user starts at 100 rep | Foundry unit | `forge test --match-test test_initial_rep_100` | ❌ Wave 0 |
| REP-17/18 | Profile struct shape + `settledCalls` view | Foundry unit | `forge test --match-test test_profile_struct` | ❌ Wave 0 |
| AUTH-01 | Privy 3-path sign-in | Playwright e2e | `pnpm playwright test tests/signin.spec.ts` | ❌ Wave 0 |
| AUTH-05 | Provider order locked | Vitest AST + Playwright | `pnpm vitest run tests/privy-provider-order.ast.test.ts && pnpm playwright test tests/signin.spec.ts` | ❌ Wave 0 |
| AUTH-19..21 | 4-screen onboarding | Playwright e2e | `pnpm playwright test tests/onboarding.spec.ts` | ❌ Wave 0 |
| AUTH-23/24 | Wallet export + $50 prompt | Playwright e2e with USDC mock | `pnpm playwright test tests/wallet-export-prompt.spec.ts` | ❌ Wave 0 |
| AUTH-27/28 | First 5 tx sponsored, 6th uses Circle USDC | Vitest relayer + Playwright e2e | `pnpm --filter @call-it/relayer vitest run paymaster-policy.test.ts && pnpm playwright test tests/paymaster-cap-handoff.spec.ts` | ❌ Wave 0 |
| AUTH-31/32 | Address book + 24h cooldown server-side | Vitest relayer integration | `pnpm --filter @call-it/relayer vitest run address-book.test.ts withdraw-authorize.test.ts` | ❌ Wave 0 |
| AUTH-42 | HandleTooLong revert | Foundry unit | `forge test --match-test test_handle_too_long` | ❌ Wave 0 |
| AUTH-44 | Receipt never shows wallet address | Vitest snapshot test | `pnpm vitest run packages/ui/__tests__/receipt-no-address.test.tsx` | ❌ Wave 0 |
| SAFETY-04..11/14 | whenNotPaused / CEI / nonReentrant | Foundry unit + reentrancy test with malicious callback | `forge test --match-contract CallRegistrySafety` | ❌ Wave 0 |
| SAFETY-01 | Max stake hardcoded | Foundry | `forge test --match-test test_max_stake_hardcoded` | ❌ Wave 0 |
| UI-01..05/08/10 | 4 pages render | Playwright visual smoke | `pnpm playwright test tests/visual-smoke.spec.ts` | ❌ Wave 0 |
| UI-24/25 | Sign-in + Onboarding visual | Playwright visual | (above) | ❌ Wave 0 |
| UI-29..37 | Skeleton 6 variants + Toast 3-status | Vitest snapshot + Playwright | `pnpm --filter @call-it/ui vitest run` | ❌ Wave 0 |
| UI-38..47 | Color palette / typography / neobrutalist treatment | Visual regression (Playwright + pixelmatch) | `pnpm playwright test tests/design-system-snap.spec.ts` | ❌ Wave 0 |
| **D-29** | Foundry↔Vitest parity test | CI guard | `pnpm run parity:diff` (new script) | ❌ Wave 0 |
| **Pitfall 13** | Privy provider order AST | Vitest | `pnpm vitest run apps/web/tests/privy-provider-order.ast.test.ts` | ❌ Wave 0 |
| **Pitfall 15** | `display: grid` lint rule in `<Receipt>` | ESLint | `pnpm --filter @call-it/ui lint` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm turbo run test --filter=<changed-package>` (Foundry + Vitest unit only; <30s)
- **Per wave merge:** `pnpm turbo run test && pnpm --filter @call-it/web exec playwright test` (full suite; ~3-5min)
- **Phase gate (before `/gsd-verify-work`):** Full suite green + 1000-run Foundry fuzz green + parity diff green + provider-order AST green + grep guards green

### Wave 0 Gaps
- [ ] `packages/contracts/test/CallRegistry.t.sol` — unit tests for createCall happy path + each gate
- [ ] `packages/contracts/test/CallRegistryGates.t.sol` — fuzz matrix of all gate combinations
- [ ] `packages/contracts/test/CallRegistryParity.t.sol` — reads `gate-matrix.json` fixture
- [ ] `packages/contracts/test/ProfileRegistry.t.sol` — unit
- [ ] `packages/contracts/test/fixtures/gate-matrix.json` — shared parity fixture
- [ ] `packages/contracts/test/mocks/MockUSDC.sol` — for SafeERC20 tests
- [ ] `packages/shared/__tests__/call-gates-parity.test.ts` — Vitest reads same fixture
- [ ] `packages/shared/__tests__/duplicate-hash-parity.test.ts` — TS hash function matches Solidity
- [ ] `apps/web/tests/privy-provider-order.ast.test.ts` — Vitest + ts-morph
- [ ] `apps/web/tests/signin.spec.ts` — Playwright, 3 sign-in paths
- [ ] `apps/web/tests/onboarding.spec.ts` — Playwright, 4 screens + resume
- [ ] `apps/web/tests/new-call-publish.spec.ts` — Playwright, full publish flow with mock contracts
- [ ] `apps/web/tests/paymaster-cap-handoff.spec.ts` — Playwright, 5th → 6th tx UX
- [ ] `apps/web/tests/visual-smoke.spec.ts` — visual snap of 4 pages
- [ ] `apps/web/tests/design-system-snap.spec.ts` — visual snap of `packages/ui` primitives
- [ ] `apps/relayer/__tests__/paymaster-policy.test.ts` — Vitest unit with ioredis-mock
- [ ] `apps/relayer/__tests__/address-book.test.ts` — Vitest with test Postgres (testcontainers or fly remote)
- [ ] `apps/relayer/__tests__/withdraw-authorize.test.ts` — Vitest, 24h cooldown bypass test
- [ ] `apps/relayer/__tests__/feed.test.ts` — Vitest, 800ms race with subgraph mock
- [ ] `apps/relayer/__tests__/ens-resolver.test.ts` — Vitest with viem mock
- [ ] `apps/relayer/__tests__/onboarding.test.ts` — Vitest, state row pattern
- [ ] `packages/ui/__tests__/receipt-no-address.test.tsx` — Vitest snapshot, ensures wallet address never rendered
- [ ] `packages/ui/__tests__/cva-variants.test.tsx` — Vitest snapshot for Button, Card, Tag variants
- [ ] `packages/ui/.eslintrc.cjs` custom rule: no `display: grid` in `<Receipt>` + descendants
- [ ] `scripts/parity-diff.ts` — runs both parity outputs and diffs them
- [ ] CI workflow: `.github/workflows/phase-1-gates.yml` adds the parity diff + AST tests to the build matrix

*(Test infrastructure baselined in Phase 0 — Vitest, Playwright, Foundry, GitHub Actions all configured. Phase 1 adds files only, no framework changes.)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Privy (OAuth + SIWE) + relayer-side `@privy-io/server-auth` proof verification on all webhook-derived data |
| V3 Session Management | yes | Privy session tokens (HTTP-only cookies via Privy SDK); relayer never trusts client claims — re-fetches user state from Privy API per request |
| V4 Access Control | yes | Solidity `Ownable2Step` for owner-only setters; relayer middleware verifies Privy session before any state-modifying API call; address book authorization gated by `auth_methods.linked_at + 24h` |
| V5 Input Validation | yes | Zod schemas on every relayer endpoint; Solidity custom errors + explicit bounds checks (CALL-32, CALL-33, AUTH-42, etc.) |
| V6 Cryptography | yes | Standard libraries only: viem `signTypedData` (EIP-712), OZ `ECDSA.recover` if needed, Privy MPC for embedded wallets, GCP KMS for relayer signing keys. NEVER hand-roll. |
| V7 Error Handling | yes | Custom errors in Solidity; structured Pino logs in relayer; no raw stack traces to client |
| V8 Data Protection | yes | Postgres encrypted at rest (Fly default); secrets only in GCP Secret Manager; user PII (handles, Twitter usernames) public-by-design per spec §18.1 |
| V9 Communication | yes | TLS everywhere; Fly private network for relayer↔Postgres; ENS RPC over HTTPS |
| V10 Malicious Code | yes | npm audit in CI; package-lock checked in; no `delegatecall` to user addresses (SAFETY-11) |
| V13 API Security | yes | Rate-limit relayer endpoints (Fastify rate limit plugin — extend Phase 0); CORS allowlist `apps/web` origin only |
| V14 Configuration | yes | Phase 0 D-09 per-network GCP project separation; CI grep guards (Phase 0) |

### Known Threat Patterns for Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| USDC.e paste on a transfer path | Tampering | Single source of truth + CI grep guard (Phase 0); cross-tier verification in `createCall` flow |
| Reentrancy on `safeTransferFrom` callback | Tampering / Elevation | OZ `ReentrancyGuard` + CEI ordering (SAFETY-09/10/14) |
| Self-fade rep farming | Repudiation / Spoofing | Observability flag in relayer (Pitfall 11); contract-level gate deferred to v1.1 |
| Privy provider order regression | DoS (silent — embedded wallets vanish) | AST test (Pitfall 13) |
| 24h cooldown bypass via direct contract call | Elevation | Server-side enforcement in relayer pre-tx hook (Pitfall 20) |
| Paymaster cap exhaustion sybil drain | DoS | Per-user 5-tx cap (Pitfall 14) + global daily cap fallback (Phase 0 OPS-13) |
| Duplicate-hash UTC boundary confusion | (informational, not security) | UI surfaces UTC day (CALL-46) + pre-check via debounce (D-22) |
| Conviction floor bypass | Elevation | Onchain check via `profileRegistry.settledCalls` (CALL-29) — cannot be bypassed |
| `setSettlementManager` / `setRelayer` rotation hijack | Elevation | `Ownable2Step` 2-step transfer; multisig promotion → Phase 6 (Pitfall 6) |
| Direct USDC transfer detection spoof | Spoofing | Listen for `Transfer(_, user, _)` events from `USDC_ARB_NATIVE` only (constant address gate) |
| Privy webhook spoof | Spoofing | Verify webhook signature with `PRIVY_WEBHOOK_SECRET` per Privy docs |
| ENS spoofing via wrong reverse-record provider | Spoofing | Dedicated Mainnet RPC URL (not Arbitrum) — separate from any other key; cache-poisoning blocked by 24h TTL |
| Subgraph Studio API key leak in frontend bundle | Information disclosure | Server-only key; frontend hits relayer proxy (D-27) |
| `claimPayout` (Phase 2+) cross-call positionEntryTime aliasing | Tampering | Phase 6 fuzz invariant (Pitfall 9); Phase 1 doesn't ship claim yet |

---

## Sources

### Primary (HIGH confidence)
- Phase 0 RESEARCH.md + STACK.md + PITFALLS.md + ARCHITECTURE.md — internal canonical
- CLAUDE.md Technology Stack section — internal canonical (pinned versions, addresses, Pyth feeds)
- `.planning/phases/01-core-contracts-auth-frontend-skeleton/01-CONTEXT.md` — 36 locked decisions
- `.planning/REQUIREMENTS.md` — 158 REQ IDs scoped to Phase 1
- [Privy docs — wagmi integration](https://docs.privy.io/wallets/connectors/ethereum/integrations/wagmi) — provider order
- [Privy 3.0 migration guide](https://docs.privy.io/basics/react/advanced/migrating-to-3.0) — v3 API
- [ERC-7677 Paymaster Web Service Capability](https://eips.ethereum.org/EIPS/eip-7677) — policy endpoint spec
- [Alchemy erc7677Middleware](https://www.alchemy.com/docs/wallets/reference/aa-sdk/core/functions/erc7677Middleware) — aa-sdk wiring
- [Alchemy gas policy docs](https://www.alchemy.com/docs/wallets) — gas policy callback URL
- [Circle Paymaster Arbitrum quickstart](https://docs.arbitrum.io/for-devs/third-party-docs/Circle/usdc-paymaster-quickstart) — Pattern 5
- [Circle Paymaster blog](https://www.circle.com/blog/how-to-integrate-circle-paymaster-to-enable-users-to-pay-gas-fees-with-their-usdc-balance) — overview
- [Solidity 0.8.30 release announcement](https://www.soliditylang.org/blog/2025/05/07/solidity-0.8.30-release-announcement/) — pinned version
- [OZ Contracts 5.6.1 npm registry](https://www.npmjs.com/package/@openzeppelin/contracts) — version verification
- [CVA docs](https://cva.style/docs) — variant API
- [Radix UI docs](https://www.radix-ui.com/primitives) — Dialog/Popover/Tooltip/Slider
- [react-hook-form](https://react-hook-form.com/) + [@hookform/resolvers](https://github.com/react-hook-form/resolvers) — form state
- [Drizzle ORM Postgres docs](https://orm.drizzle.team/docs/get-started/postgresql-new) — migrations
- [viem getEnsName](https://viem.sh/docs/ens/actions/getEnsName) — ENS resolution
- [ts-morph docs](https://ts-morph.com/) — AST test
- npm registry direct queries for version verification (Wave 0)

### Secondary (MEDIUM confidence)
- Web search results on Circle USDC Paymaster Arbitrum address [`0x6C973eBe80dCD8660841D4356bf15c32460271C9`] — needs Wave 0 re-verification
- Web search for `@account-kit/infra` 2026 version status — verify Wave 0
- ksmith-circle/circle-paymaster-aa-sdk-middleware (GitHub) — reference for permit encoding

### Tertiary (LOW confidence)
- None — every Pattern above traces to either CLAUDE.md, Phase 0 internal, or an HIGH/MEDIUM source.

---

## Project Constraints (from CLAUDE.md)

Honored verbatim in this research:
- **Network:** Arbitrum One mainnet hardcoded; Sepolia for staging only
- **Currency:** USDC native at `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` — never `0xFF970A61...DB5CC8`
- **Solidity:** `=0.8.30` exact (pin not `^`), avoid 0.8.28–0.8.33 IR bug
- **OZ:** `@openzeppelin/contracts@5.6.1`, `Ownable2Step` for single-owner-key sensitivity
- **Tech stack contracts:** Solidity for CallRegistry + ProfileRegistry (Phase 5 adds Stylus for scoring only)
- **Tech stack frontend:** Next.js App Router 16.2.6 + React 19 + Privy 3.27.0 + `@privy-io/wagmi@4.0.8` (NOT 1.32.5 per Phase 0 P01 deviation) + wagmi 2.18.0 + viem 2.50.4 + Tailwind 3.4+
- **Tech stack backend:** Fastify 5.6.1 + Pino 9 + BullMQ + Upstash Redis + Fly Postgres (NEW Phase 1)
- **Safety caps:** $100 max stake, $5 min, $5K TVL cap, $5K → $100K max owner-raisable
- **Settlement fees:** Phase 4 (deferred); Phase 1 ships $10 creation fee + $5 treasury + $5 virtual fade split logic only
- **Audit-ready patterns:** CEI + ReentrancyGuard + hardcoded USDC + no delegatecall to user addresses
- **Sepolia staging gate:** ≥48h before mainnet (Phase 6 gate; Phase 1 ships Sepolia builds)
- **GSD workflow enforcement:** Phase 1 work goes through `/gsd-execute-phase`
- **No emojis in code or commits** unless explicitly requested

---

## Metadata

**Confidence breakdown:**
- Solidity contract shape + gate sequence: **HIGH** — verified against Phase 0 work + OZ docs + spec sections
- Privy 3.x + provider order: **HIGH** — verified against Privy docs + Phase 0 install
- Alchemy aa-sdk + ERC-7677 wiring: **MEDIUM** — aa-sdk has both standard and custom RPC paths; Wave 0 must pin which one Alchemy uses for our policy
- Circle USDC Paymaster: **MEDIUM** — mainnet address `0x6C973eBe80dCD8660841D4356bf15c32460271C9` from web search; Wave 0 re-verifies; Sepolia address unknown
- `packages/ui` design system: **HIGH** — CVA + Radix + Tailwind is industry-standard
- Drizzle ORM for Postgres: **HIGH** — current standard
- Anti-drift parity test pattern: **HIGH** — shared-fixture matrix is a well-known anti-corruption pattern
- ENS server-side resolution: **HIGH** — viem mainnet client + Redis cache is standard
- Feed 800ms race: **HIGH** — pattern locked in Phase 0 + D-24

**Research date:** 2026-05-22
**Valid until:** 2026-06-21 (30 days; refresh if any external API changes detected, especially Alchemy aa-sdk + Circle Paymaster + Privy 3.x releases)

## RESEARCH COMPLETE

Researched all 13 areas the planner needs: (1) CallRegistry + ProfileRegistry Solidity layout under 0.8.30 + OZ 5.6.1 with the full gate sequence (CALL-13..36), packed storage that reserves Phase 4 rep fields without future struct extension, custom errors per spec; (2) Privy 3.27 provider tree with the locked PrivyProvider > QueryClientProvider > WagmiProvider order plus the ts-morph AST regression test for Pitfall 13; (3) Alchemy aa-sdk + ERC-7677 `/paymaster/policy` endpoint with Upstash counter incremented only on confirmed UserOperationEvent inclusion (Pitfall 14); (4) Circle USDC Paymaster on Arbitrum (`0x6C973eBe80dCD8660841D4356bf15c32460271C9` — Wave 0 to re-verify) with per-tx EIP-2612 permit signed by Privy embedded wallet; (5) Fly Postgres + drizzle-orm schema for address_book + auth_methods + onboarding_state, with the relayer pre-tx hook that returns 403 on 24h cooldown violation (Pitfall 20); (6) react-hook-form + zod resolver with 3 mode-conditional sub-forms, debounced 400ms duplicate-hash pre-check, and the shared `<Receipt mode>` live preview; (7) Feed with 800ms subgraph→polled-events race + 10s Redis cache on first page + cursor pagination; (8) `packages/ui` workspace using Tailwind preset + CVA + Radix where it earns its place, 6 static-gray skeleton variants (no shimmer), 3-status toast with countdown drain, CSS `::before`/`::after` corner brackets; (9) viem server-side ENS via mainnet RPC + Redis 24h TTL with negative-result caching; (10) Anti-drift Foundry↔Vitest parity test pattern with shared `gate-matrix.json` fixture and CI diff gate; (11) Anti-spam gate implementation including the auto-cap-to-84 conviction logic and UTC-day duplicate-hash floor; (12) full Validation Architecture mapping every REQ ID to a test file with quick + full + gate commands; (13) Pitfalls re-check showing every named pitfall (1, 12, 13, 14, 15, 16, 20) is enforced by a concrete file or CI guard plus 4 NEW Phase-1-specific pitfalls (conviction enum drift, onboarding row drift, subgraph ABI drift, Privy webhook race).

**Planner must know:**
- **Circle USDC Paymaster address re-verification is a Wave 0 task** — Sepolia equivalent may not exist
- **`@privy-io/wagmi` is installed at 4.0.8** (NOT the 1.32.5 stated in CLAUDE.md per the Phase 0 P01 deviation in STATE.md). Pattern 3 reflects this; any v4-vs-v1 API differences need re-litigation if they surface
- **D-29 anti-drift parity test is the Phase 1 invariant guard** analogous to Phase 0's grep guards — both Solidity and Zod must agree on every gate matrix case or the build fails
- **`<Receipt mode>` ships with flexbox-only constraint from day one** (Phase 7 OG via Satori re-uses this exact component — Pitfall 15)
- **Phase 1 ships ProfileRegistry storage shape locked for Phase 4 extension** — adding fields without struct-reorder pain
- **Onboarding state row pattern (D-32) + Privy webhook race (Pitfall D, new)** require belt-and-suspenders fallback querying `@privy-io/server-auth.getUser()` on every authorize request, not just relying on the webhook
- **The phase has ~158 REQ IDs across AUTH (44), CALL (70), REP (6), SAFETY (12), UI (28+) categories** — the planner should structure the plan into 4 waves (Wave 0 contracts + infra; Wave 1 relayer + design system; Wave 2 sign-in + onboarding + new-call form; Wave 3 feed + profile + integration) with the parity test, provider-order AST, grep guards, ESLint custom rule, and full Playwright suite as the Phase Gate

[ERC-7677: Paymaster Web Service Capability](https://eips.ethereum.org/EIPS/eip-7677)
[Alchemy erc7677Middleware](https://www.alchemy.com/docs/wallets/reference/aa-sdk/core/functions/erc7677Middleware)
[Circle Paymaster Arbitrum quickstart](https://docs.arbitrum.io/for-devs/third-party-docs/Circle/usdc-paymaster-quickstart)
[Privy 3.0 migration guide](https://docs.privy.io/basics/react/advanced/migrating-to-3.0)
[Privy wagmi integration](https://docs.privy.io/wallets/connectors/ethereum/integrations/wagmi)
[Drizzle ORM Postgres docs](https://orm.drizzle.team/docs/get-started/postgresql-new)
[CVA docs](https://cva.style/docs)
[ts-morph docs](https://ts-morph.com/)
[@hookform/resolvers](https://www.npmjs.com/package/@hookform/resolvers)
