# Phase 1: Core contracts + auth + frontend skeleton - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-22
**Phase:** 01-core-contracts-auth-frontend-skeleton
**Areas discussed:** Paymaster (ERC-4337) vendor + gating, Address book + 24h cooldown storage, Handle namespace strategy, Design system delivery + boundary, New Call form architecture, Feed data source from day one, Pre-flight server-side validation surface

---

## Paymaster (ERC-4337) vendor + gating

### Q1: Which AA vendor handles Privy smart-wallet sponsorship for the 5 free tx?

| Option | Description | Selected |
|--------|-------------|----------|
| Alchemy AA | Already in the stack for NFT API + RPC. One vendor surface = one billing line, dashboard, outage. Privy + Alchemy AA is a first-class integration. Bundler + paymaster + RPC under one key. Lowest operational complexity. | ✓ |
| Pimlico | Strongest AA-only specialization; widely used; transparent per-userOp pricing. Adds a new vendor. Best if a future use case needs advanced paymaster policies. | |
| ZeroDev | Kernel account + UltraRelay. Strongest UX features (session keys, batched tx). Heavier abstraction. Overkill for the v1 critical path. | |
| Biconomy | Modular V3 SDK. Enterprise-leaning. Less common with Privy. | |

**User's choice:** Alchemy AA
**Notes:** Single-vendor consolidation with NFT API and RPC.

### Q2: How is the 5-tx server-side cap enforced (AUTH-28, Pitfall 14)?

| Option | Description | Selected |
|--------|-------------|----------|
| Relayer ERC-7677 policy endpoint | Vendor calls our /paymaster/policy with userOp + Privy userId; relayer checks Upstash counter, returns sign-or-deny. Auditable, vendor-agnostic, single chokepoint. | ✓ |
| Vendor-managed policy (sponsorshipPolicyId) | Configure per-user policy in vendor dashboard via vendor SDK; relayer only fires on cap-approach alert. Less code; vendor drift risk. | |
| Hybrid — vendor cap as safety net + relayer policy as truth | Vendor cap = 6, relayer = truth at 5. Defense-in-depth, marginal extra cost. | |

**User's choice:** Relayer ERC-7677 policy endpoint
**Notes:** Vendor-agnostic chokepoint preferred over vendor coupling.

### Q3: What counts as 'a transaction' against the 5-tx budget?

| Option | Description | Selected |
|--------|-------------|----------|
| One userOp | Each ERC-4337 userOp consumes 1 unit. Simple, matches ERC-7677 firing. Batched approve+createCall = 1 tx. Most generous. | ✓ |
| One business action | Define enum (CREATE_CALL, FOLLOW, etc); count action. Semantically meaningful, couples to UI flow. | |
| One state-mutating contract call | Count internal calls (approve, createCall) separately. Most restrictive. | |

**User's choice:** One userOp
**Notes:** Most generous to users, matches ERC-7677 semantics.

### Q4: When budget hits 0 — what does the relayer return + what's the UX?

| Option | Description | Selected |
|--------|-------------|----------|
| Deny policy + 'fund your wallet' route | ERC-7677 returns empty paymasterAndData; UI catches in wagmi error and routes to AUTH-29 fund flow. | |
| Deny policy + structured 402 to frontend bridge endpoint | Frontend pings /paymaster/eligibility BEFORE submitting; returns 402 + remaining count. | |
| Soft-cap warning at 4, hard deny at 5 | On the 5th sponsored tx, return policy + warning field; UI toasts. | |
| (free-text response) | how about we deduct it as usdt or usdc but pay it on our end | ✓ |

**User's choice:** Free-text: pay gas via USDC deduction, we cover ETH on our end
**Notes:** User proposed a spec deviation from AUTH-27/29 ("user-provided ETH"). Interpreted as Circle's USDC Paymaster on Arbitrum (already noted in CLAUDE.md sources). Locked via follow-up Q5/Q6.

### Q5: Confirm the post-cap mechanic for tx 6+ (overrides AUTH-27/29):

| Option | Description | Selected |
|--------|-------------|----------|
| Circle USDC Paymaster on Arbitrum | Native EIP-2612 permit. User signs permit so Circle's paymaster pulls USDC for gas. No relayer involvement. Already supported. | ✓ |
| Our paymaster keeps sponsoring + we charge USDC fee per tx | Relayer signs paymasterAndData past tx 5; separately debit user's USDC. Custom accounting (price oracle, reconciliation). | |
| Hybrid — our paymaster for special flows + Circle USDC for general | Protocol-sponsored actions (e.g., AUTH-43 social-linking gas) stay on our paymaster; rest on Circle. | |

**User's choice:** Circle USDC Paymaster on Arbitrum
**Notes:** AUTH-27/29 spec deviation locked. REQUIREMENTS.md must be updated post-Phase 1.

### Q6: Where does Circle USDC paymaster's permit flow surface in Phase 1?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-tx permit signature on each tx 6+ | One Privy-prompted permit per tx, embedded in userOp. Native, no allowance state. | ✓ |
| One-time blanket permit during onboarding fund step | Max-allowance permit once; subsequent USDC-gas txs silent. 'Paymaster can pull arbitrary USDC' custody disclosure ask. | |
| Permit prompt only when user first crosses the cap, then session-bounded | First post-cap tx prompts permit good for ~24h. | |

**User's choice:** Per-tx EIP-2612 permit
**Notes:** No allowance state to track, no surprise drains.

---

## Address book + 24h cooldown storage

### Q1: Where do saved withdrawal addresses live (AUTH-31)?

| Option | Description | Selected |
|--------|-------------|----------|
| Postgres on Fly | Tiny Fly Postgres alongside the relayer ($5-15/mo). Becomes the primary app DB. | ✓ |
| Upstash Redis (already provisioned) | Use existing Phase 0 D-03 Redis. Free tier eviction risk for durable user data. | |
| ProfileRegistry onchain | ~50k gas per address; paymaster eats cost; 24h check still server-side per Pitfall 20 = duplicated state. | |
| Privy user metadata (custom claims) | 1KB cap per user; no atomic ops; Privy outage = no address book. | |

**User's choice:** Fly Postgres
**Notes:** Becomes the canonical app DB for all future phases.

### Q2: Where is the 24h cooldown check enforced (Pitfall 20)?

| Option | Description | Selected |
|--------|-------------|----------|
| Relayer pre-tx hook on every withdraw userOp | Pre-tx hook queries Postgres for addedAt, returns 403 if under cooldown. Pitfall 20 mandate. | ✓ |
| Frontend pre-check (relayer-backed) + post-hoc audit | Frontend calls /addressbook/canWithdraw before constructing userOp; relayer audits post-fact. Bypassable. | |
| Postgres trigger + relayer audit | DB trigger blocks under-cooldown insert; relayer reads-through trigger. Overkill at this scale. | |

**User's choice:** Relayer pre-tx hook
**Notes:** Single chokepoint matches paymaster gating pattern.

### Q3: Postgres provisioning specifics:

| Option | Description | Selected |
|--------|-------------|----------|
| Fly Postgres | Same region (iad), Wireguard private network, pg_dump daily to GCS. Canonical app DB. | ✓ |
| Neon serverless Postgres | Branchable Postgres. New vendor; better for Phase 6 Sepolia branching. | |
| Supabase Postgres | Heavyweight; we already have Privy for auth. | |

**User's choice:** Fly Postgres
**Notes:** —

### Q4: Same-network policy across the address book API — also enforce 'new auth method 24h cooldown' (AUTH-32) here?

| Option | Description | Selected |
|--------|-------------|----------|
| Same Postgres, separate auth_methods table | Track (privy_user_id, auth_type, linked_at) via Privy webhook. Withdrawal hook checks BOTH cooldowns. Single chokepoint. | ✓ |
| Skip AUTH-32 cooldown in Phase 1 (defer to Phase 2) | Ship address-book cooldown only. Pitfall 20 / AUTH-32 deferred. Not recommended. | |
| Privy-side enforcement only | Lean on Privy's linkedAccount.firstVerifiedAt claim. Couples to Privy's claim contract. | |

**User's choice:** Same Postgres, separate auth_methods table
**Notes:** Pitfall 20 fully closed in single chokepoint.

---

## Handle namespace strategy

### Q1: Should handle be uniquely claimed in ProfileRegistry?

| Option | Description | Selected |
|--------|-------------|----------|
| Display-priority only — no uniqueness | ProfileRegistry stores displayHandle with no uniqueness check. §9.6 priority + AUTH-35 override. Minimal contract complexity. | ✓ |
| Unique-claim onchain | handleToUser mapping + HandleTaken revert. ~22k gas per profile. Conflicts with ENS pre-fill. | |
| Hybrid: ENS-verified handles unique, freeform not | More complex contract logic, edge cases galore. | |

**User's choice:** Display-priority only
**Notes:** Matches spec §9.6 wording (priority resolution, not claim).

### Q2: Profile route URL format:

| Option | Description | Selected |
|--------|-------------|----------|
| /profile/[address] only | Wallet address canonical; handles are display sugar. Aligns with §15.4. | ✓ |
| /profile/[address] canonical + /[handle] sugar redirect | Twitter-style /handle redirects to /profile/[address]. Defer to Phase 7. | |
| /profile/[handle-or-address] union | Sniffs param. Handle ambiguity problem without URL discipline. | |

**User's choice:** /profile/[address] only
**Notes:** —

### Q3: Where does ENS reverse-record resolution happen for the display handle?

| Option | Description | Selected |
|--------|-------------|----------|
| Server-side on profile read + 24h cache | Relayer queries Mainnet ENS reverse resolver; caches in Redis. Saves client RPC traffic. | ✓ |
| Frontend via wagmi useEnsName on render | Each render queries client RPC. Adds Mainnet RPC dep to frontend bundle. | |
| On-write to ProfileRegistry (snapshot at signup) | Stale if user changes ENS. 'Mute the user' problem. | |

**User's choice:** Server-side + 24h Redis cache
**Notes:** —

### Q4: ProfileRegistry contract — upgradeable in Phase 1?

| Option | Description | Selected |
|--------|-------------|----------|
| Non-upgradeable per spec §10.8 | All v1 contracts non-upgradeable except StylusScoreEngine. Owner-only setter rotation. | ✓ |
| Behind UUPS proxy (single-owner key) | Adds upgradeability. Conflicts with §10.8. | |

**User's choice:** Non-upgradeable per spec §10.8
**Notes:** —

---

## Design system delivery + boundary

### Q1: Where do the locked neobrutalist primitives live?

| Option | Description | Selected |
|--------|-------------|----------|
| New packages/ui workspace | Shared package consumed by web now and Phase 8 Mini Apps later. | ✓ |
| Inline apps/web/components/ only | Refactor cost later when Phase 8 Frames need same primitives. | |
| shadcn/ui themed for neobrutalist | shadcn defaults fight neobrutalist treatment; 'no slop' filter. | |
| Headless (Radix) + custom styling, in packages/ui | Best A11y; pair with option 1. | |

**User's choice:** New packages/ui workspace
**Notes:** Layered with Radix where it earns its place per D-16.

### Q2: Styling layer for the primitives:

| Option | Description | Selected |
|--------|-------------|----------|
| Tailwind + CVA for variants | Tailwind already configured; CVA maps prop combos to class strings. | ✓ |
| Tailwind + tailwind-variants | Slot-based compound variants. Another dep. | |
| Vanilla-extract zero-runtime CSS | Most performant; build complexity, learning curve. Overkill. | |

**User's choice:** Tailwind + CVA
**Notes:** —

### Q3: How are the 4px corner brackets implemented?

| Option | Description | Selected |
|--------|-------------|----------|
| Pure CSS via ::before/::after with borders | Zero asset load, scales to any size, themeable via currentColor. | ✓ |
| Inline SVG component | Cleaner code; tiny perf cost. Easier to animate. | |
| Background-image PNG/SVG sprites | Worst — fixed sizes, asset fetch, no theme adapt. | |

**User's choice:** CSS ::before/::after
**Notes:** —

### Q4: Loading skeleton (6 variants) — shimmer or static?

| Option | Description | Selected |
|--------|-------------|----------|
| Static gray blocks | Neobrutalist treatment is harsh + intentional; shimmer is SaaS-dashboard tell. | ✓ |
| Subtle shimmer at 60% opacity | Standard convention; contradicts tone register. | |
| No skeleton — hard cut from spinner to content | Single global spinner. Worse perceived perf. | |

**User's choice:** Static gray blocks
**Notes:** Matches 'no slop' filter from PROJECT.md tone.

---

## New Call form architecture

### Q1: Form state library for the New Call flow:

| Option | Description | Selected |
|--------|-------------|----------|
| react-hook-form + Zod resolver | RHF handles re-render optimization; Zod validates anti-spam gates locally and shares schema with relayer preflight. | ✓ |
| Controlled state + Zod (no form lib) | Pure useState + Zod.parse on submit. Gets gnarly. | |
| TanStack Form | Tighter TS inference. Smaller community. Risk gain marginal. | |
| Conform.js (server-action-first) | Doesn't fit — submits to wagmi writeContract userOp. | |

**User's choice:** react-hook-form + Zod resolver
**Notes:** Shares schema with relayer preflight per D-29.

### Q2: Live receipt preview — shared component with the actual Live Receipt page (§15.3)?

| Option | Description | Selected |
|--------|-------------|----------|
| Shared <Receipt mode='preview'|'live'|'settled' /> component | One Receipt primitive with mode prop. Pays back across Phases 2/4/7. | ✓ |
| Separate <ReceiptPreview /> in /new + <Receipt /> in /call/[id] | Two components; drifts over time. | |
| Render the actual Receipt with stubbed live-data props | Implicit; duck-typing. Marginal vs option 1. | |

**User's choice:** Shared <Receipt mode>
**Notes:** Underwrites the receipt-loop story across remaining phases.

### Q3: Duplicate-hash pre-check timing in the form (CALL-49):

| Option | Description | Selected |
|--------|-------------|----------|
| Debounced (400ms) client call to relayer | Debounced POST to /api/calls/dup-check. Pre-empts onchain revert. | ✓ |
| Onchain view via wagmi useReadContract on debounce | RPC traffic per keystroke. Wastes Alchemy quota. | |
| Submit-time only — catch the contract revert | UX miss — wallet popup then error. | |

**User's choice:** Debounced 400ms to relayer
**Notes:** —

### Q4: Conviction high-conviction floor messaging (CALL-31) — read settledCalls count from where?

| Option | Description | Selected |
|--------|-------------|----------|
| ProfileRegistry view via wagmi useReadContract, cached on mount | Authoritative — contract is source of truth. Cheap. | ✓ |
| Relayer /api/profile/[address] aggregate | Saves a separate RPC if page renders other profile data. | |
| Subgraph query | Stale up to 30s; CALL-31 must be accurate. | |

**User's choice:** ProfileRegistry view via wagmi, cached on mount
**Notes:** —

---

## Feed data source from day one

### Q1: Where does the Phase 1 feed read its calls from?

| Option | Description | Selected |
|--------|-------------|----------|
| Sepolia Subgraph Studio endpoint via relayer proxy | Phase 0 P03 already deployed. Studio API key hidden from frontend. | |
| Polled-events fallback directly (also Phase 0) | Rebuilds aggregation work; subgraph dead weight. | |
| Subgraph as primary + polled-events as automatic fallback | Most resilient; more code. Best for long tail. | ✓ |

**User's choice:** Subgraph primary + polled-events automatic fallback
**Notes:** Per-request circuit breaker — chose resilience even though Phase 1 doesn't strictly need it.

### Q2: Feed pagination + ordering on day one (§15.1):

| Option | Description | Selected |
|--------|-------------|----------|
| Recency desc + cursor pagination | Simple, scrolls forever. Future ranking is additive. | ✓ |
| Recency desc + offset pagination | Easier page jumps. Subgraph offset slow at scale. | |
| Two tabs from day one — Recency + 'From your X' | 'From your X' is Phase 1.5. Ship cleanly with one tab. | |

**User's choice:** Recency desc + cursor pagination
**Notes:** —

### Q3: Circuit breaker logic for subgraph → polled-events automatic fallback:

| Option | Description | Selected |
|--------|-------------|----------|
| Per-request: subgraph timeout 800ms triggers fallback | Races against 800ms timer; logs feed_fallback_engaged. No global state drift. | ✓ |
| Health-checker process toggles primary every 30s | Stale-flag failure mode. Worse latency floor. | |
| Manual switch via env var only | Eats real downtime during a subgraph hiccup. | |

**User's choice:** Per-request 800ms timeout
**Notes:** —

### Q4: Feed cache layer in relayer:

| Option | Description | Selected |
|--------|-------------|----------|
| Redis 10s TTL on the recency-cursor=null page only | First page is hot path. Saves subgraph quota on the page everyone hits. | ✓ |
| No cache — always go to subgraph | Could burn quota if traffic spikes. | |
| Vercel edge cache via Next route revalidation tag | CDN-level. Less flexibility for invalidation on createCall. | |

**User's choice:** Redis 10s TTL on first page
**Notes:** —

---

## Pre-flight server-side validation surface

### Q1: How thick is the relayer's pre-flight validation for createCall?

| Option | Description | Selected |
|--------|-------------|----------|
| Full pre-check | Single /api/calls/preflight runs ALL gates. Returns field-mapped errors. Drift = test failure. | ✓ |
| Thin pre-check — dup-hash + paymaster only | Less surface; more wallet-popup-then-error failures. | |
| Pre-check + post-tx sim | eth_call simulation against latest block. Simulation can drift. | |

**User's choice:** Full pre-check
**Notes:** —

### Q2: How is preflight kept in sync with the contract (anti-drift)?

| Option | Description | Selected |
|--------|-------------|----------|
| Shared Zod schemas + a 'contract↔preflight' parity test | Foundry matrix vs Vitest matrix; CI guard fails if diverge. | ✓ |
| Re-derive from contract ABI types only | Hand-written validation logic; drift at test time. | |
| Don't worry about drift — contract is the only truth | Acknowledges UX cost. | |

**User's choice:** Shared Zod schemas + parity test
**Notes:** Becomes the Phase 1 anti-drift CI gate.

### Q3: Does preflight also gate the userOp — i.e., relayer refuses to even sponsor paymaster if preflight fails?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — preflight pass is required for paymaster sponsorship | ERC-7677 endpoint runs preflight as part of policy decision. Closes 'user burns 5 sponsored tx on failing ones'. | |
| No — paymaster sponsors anything within the 5-tx budget | Separation of concerns: paymaster decides on identity, preflight on operation. Simpler. | ✓ |

**User's choice:** No — paymaster and preflight are decoupled
**Notes:** Preflight is the UX defense at the form layer; wallet won't open if preflight failed.

### Q4: Failed-preflight UX in the form:

| Option | Description | Selected |
|--------|-------------|----------|
| Inline field-level errors via the RHF Zod resolver | Single error pattern across all gates. Matches CALL-26/48 wording. | ✓ |
| Top-of-form banner + first-field focus | Worse for multiple simultaneous errors. | |
| Toast + leave form state untouched | Loses contract↔UI tight coupling. | |

**User's choice:** Inline field-level errors via RHF Zod resolver
**Notes:** —

---

## Claude's Discretion

The following decisions were made by Claude on the user's behalf and recorded in CONTEXT.md (D-32..D-36):

- **D-32:** Onboarding state persistence via Postgres `onboarding_state` row keyed by privy_user_id; resume on session bootstrap.
- **D-33:** Sign-in wallet connectors = wagmi built-in MetaMask + WalletConnect + CoinbaseWallet; Rabby detected via window.ethereum sniff; no RainbowKit; spec §15.8 button order.
- **D-34:** Coinbase Onramp via hosted-flow popup (not redirect) inside the AUTH-25 fund step; direct USDC transfer shown side-by-side with copyable deposit address.
- **D-35:** Feed empty state copy per spec §15.1: "No calls yet. Be the first to go on record." with primary [+ NEW CALL] button; static gray skeleton on first load.
- **D-36:** Wagmi v2 chain config hardcoded to Arbitrum One + Arbitrum Sepolia only; Phase 0 grep guard catches any drift.

## Deferred Ideas

- ProfileRegistry rep storage schema deep-dive (Phase 4/5 when rep math lands)
- `/[handle]` sugar route (Phase 7 with domain change)
- "From your X / Farcaster" feed sections (Phase 1.5)
- Trending Duel auto-promotion + Duels tab (Phase 3)
- Per-event-type Telegram channels for Phase 1 events (v1.1 polish)
- Mainnet ENS resolver cache hit-rate dashboard (Phase 1.x when justified)
- Privy export wallet inline tutorial (v1.1 polish)
- Form analytics on /new abandonment (when product traffic justifies)
- Subgraph 100K-query-tier auto-upgrade alert (Phase 7 Decentralized Network publish)
- Sign-in screen brand animation / hero treatment (post-MVP polish)
