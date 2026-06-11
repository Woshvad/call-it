---
id: quick-260611-5mh-02
phase: quick-260611-5mh
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/lib/wagmi.ts
  - apps/web/lib/chain.ts (new)
  - apps/web/hooks/useUsdcBalance.ts
  - apps/web/hooks/useCirclePaymaster.ts
  - apps/web/app/components/ChallengeFormModal.tsx
  - apps/web/app/duel/[challengeId]/page.tsx (USDC allowance read callsite ONLY ~line 417)
  - apps/web/app/call/[id]/page.tsx (read-hook callsites ~482 + ~1143 and FollowFadeModal balance prop ONLY)
  - apps/web/app/new/hooks/useSettledCalls.ts
  - apps/web/app/new/components/PriceTargetFields.tsx
  - apps/web/app/new/page.tsx
  - apps/web/app/new/components/PublishConfirmModal.tsx
  - packages/ui/src/compound/FollowFadeModal.tsx
  - packages/shared/src/validation/call-gates.ts (ONLY if a targetValue bound assumes 1e6 scale)
  - apps/web + packages/ui colocated tests (new/updated)
autonomous: true
must_haves:
  truths:
    - "Header balance chip shows the wallet's REAL Sepolia USDC balance — zero requests to arb-mainnet.g.alchemy.com from page loads (RC1)"
    - "Every client-side wagmi read hook passes explicit chainId: ACTIVE_CHAIN_ID and chain-correct addresses (no hook silently defaults to Arbitrum mainnet)"
    - "Composer: entering $4,200 produces on-chain targetValue 420000000000 (1e8 scale) and the preview renders $4,200 — not the current 100x-wrong 1e6 conversion (RC3)"
    - "New-call form default targetValue is an empty required input (placeholder), never the '0.000001' prefill"
    - "FollowFadeModal blocks confirm with 'Insufficient USDC balance — you need $X.XX more' when stake exceeds balance, and never renders minShares > expectedShares"
    - "FOLLOW/FADE/CHALLENGE are disabled (with inert reason text) on expired or non-Live calls; modals cannot open"
    - "Publish flow discloses the $10.00 creation fee and the stake+fee total"
    - "Circle paymaster permit typed-data domain uses ACTIVE_CHAIN_ID, not hardcoded arbitrum.id"
  artifacts:
    - path: "apps/web/lib/chain.ts"
      provides: "ACTIVE_CHAIN (arbitrumSepolia), ACTIVE_CHAIN_ID, per-chain selected contract addresses (USDC, CALL_REGISTRY, FOLLOW_FADE_MARKET, CHALLENGE_ESCROW, PROFILE_REGISTRY)"
      exports: ["ACTIVE_CHAIN", "ACTIVE_CHAIN_ID"]
  key_links:
    - from: "apps/web/lib/wagmi.ts"
      to: "[arbitrumSepolia, arbitrum] chain order"
      via: "createConfig chains array — first chain is the wagmi default"
    - from: "apps/web/hooks/useUsdcBalance.ts"
      to: "apps/web/lib/chain.ts"
      via: "chainId + Sepolia USDC token address"
      pattern: "ACTIVE_CHAIN_ID"
    - from: "apps/web/app/new/components/PriceTargetFields.tsx"
      to: "1e8 canonical target scale (SettlementManager.sol:714)"
      via: "display ÷1e8 + onChange ×1e8"
---

<objective>
Fix web chain correctness and money math: stop every read hook from defaulting to Arbitrum MAINNET (the 0.00-balance-chip / false "insufficient USDC" bug), fix the composer's 100x-wrong target scale (1e6 vs the canonical 1e8), add the missing insufficient-balance gate to FollowFadeModal, gate actions on expired calls, and disclose the $10 creation fee.

Purpose: Users currently see $0.00 while holding $20 USDC on Sepolia, get wrongly blocked from challenges, and would create a $42.00 target when typing $4,200. These are correctness bugs with real-money consequences.
Output: Chain-pinned read hooks, 1e8-correct composer, balance/expiry/fee gates. Zero file overlap with PLAN-01 (relayer) — runs in parallel.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
</execution_context>

<context>
@apps/web/lib/wagmi.ts
@apps/web/hooks/useUsdcBalance.ts
@apps/web/hooks/useCirclePaymaster.ts
@apps/web/app/new/components/PriceTargetFields.tsx
@apps/web/app/new/page.tsx
@apps/web/app/new/components/PublishConfirmModal.tsx
@packages/ui/src/compound/FollowFadeModal.tsx
@packages/shared/src/constants/addresses.ts
@packages/shared/src/constants/usdc.ts
@packages/shared/src/validation/call-gates.ts
</context>

## Verified Root Causes (from live investigation 2026-06-11 — TRUST THESE, do not re-derive)

**RC1 WRONG DEFAULT CHAIN:** `apps/web/lib/wagmi.ts:37` `chains: [arbitrum, arbitrumSepolia]` — wagmi hooks WITHOUT explicit chainId default to FIRST chain = Arbitrum MAINNET. Confirmed live: ~90/122 page requests were POSTs to arb-mainnet.g.alchemy.com; header balance chip shows 0.00 while the wallet holds $20 USDC on Sepolia; challenge modal wrongly blocks "Insufficient USDC balance — you need $5.00 more". `NEXT_PUBLIC_ARBITRUM_RPC_URL` is unset → `http(undefined)` → viem falls back to chain default RPC.

**RC3 COMPOSER TARGET SCALE 100x WRONG:** `packages/contracts/src/SettlementManager.sol:714` comment — "targetValue stored in same units as Pyth price (8-decimal form, expo=-8)" → canonical scale is **1e8**. But `apps/web/app/new/components/PriceTargetFields.tsx:56,61` converts dollars ×1e6/÷1e6, `apps/web/app/new/page.tsx:188` preview ÷1e6, and default `targetValue:1n` at `new/page.tsx:133` renders "0.000001". A user entering $4,200 would create a $42.00 target on-chain.

**Known chain-correct reference:** the real on-chain call #14 has targetValue=100000000000000 (1e14 raw = $1,000,000 at 1e8).

## Global Constraints (binding)

- **D-36:** ONLY arbitrum + arbitrumSepolia in the wagmi config — the order swap is compliant; adding/removing chains is NOT.
- **D-15:** never weaken tests to pass — update expectations only where behavior intentionally changed, with honest reasoning in the SUMMARY.
- **D-07:** degrade-to-hidden (absent data hidden, never zeros/fakes).
- **D-27:** subgraph Studio key stays server-side; no subgraph URLs into client code.
- **DO NOT TOUCH:** packages/contracts (deployed), packages/subgraph mappings, settlement worker Redis config, OG fonts.
- **Stake fields stay 1e6** (USDC micro-units — already correct). Only the TARGET value scale changes to 1e8.
- **Ownership boundary with PLAN-03 (wave 2):** in `apps/web/app/call/[id]/page.tsx` touch ONLY the read-hook callsites (~482 USDC allowance, ~1143 the 8 FFM pool reads) plus passing the balance prop into FollowFadeModal, and the FOLLOW/FADE/CHALLENGE button-gating logic (B6). In `apps/web/app/duel/[challengeId]/page.tsx` touch ONLY the USDC allowance read (~417). PLAN-03 owns all other presentation in those files.
- Direct master commit, atomic, ONE commit for this whole plan: `fix(quick-260611-5mh): web Sepolia chain correctness + 1e8 target scale + balance/expiry/fee gates`. ALWAYS check `git status` for the `packages/contracts/lib/openzeppelin-contracts` submodule and NEVER stage it.
- pnpm on Windows via Git Bash (use the Bash tool for pnpm).

<tasks>

<task type="auto">
  <name>Task 1: Chain order swap + ACTIVE_CHAIN module (B1, B2)</name>
  <files>apps/web/lib/wagmi.ts, apps/web/lib/chain.ts (new), any tests/CI guards asserting the chain-order literal</files>
  <action>
    **B1 — apps/web/lib/wagmi.ts:** reorder chains to `[arbitrumSepolia, arbitrum]` (D-36 means ONLY these two chains — an order swap is compliant). Update the adjacent comment honestly (it currently justifies the mainnet-first order). Grep the repo for tests/CI guards asserting the literal order (search for D-36 / OPS-21 mentions and for the literal `[arbitrum, arbitrumSepolia]`) and update expectations honestly where the behavior intentionally changed (D-15 — explain in SUMMARY). Keep BOTH transports; tolerate unset `NEXT_PUBLIC_ARBITRUM_RPC_URL` (currently `http(undefined)` falls back to the chain default RPC — that fallback behavior may remain, just must not be the DEFAULT chain anymore).

    **B2 — create apps/web/lib/chain.ts:** export `ACTIVE_CHAIN` (arbitrumSepolia from viem/chains), `ACTIVE_CHAIN_ID` (`Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 421614`), and per-chain SELECTED contract addresses (USDC, CALL_REGISTRY, FOLLOW_FADE_MARKET, CHALLENGE_ESCROW, PROFILE_REGISTRY) sourced from packages/shared constants (`packages/shared/src/constants/addresses.ts`, `packages/shared/src/constants/usdc.ts`). USDC for 421614 = `USDC_ARB_SEPOLIA` `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` — NOT mainnet `USDC_ARB_NATIVE` `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`. This module is the single import point Task 2 sweeps everything onto.
  </action>
  <verify>
    <automated>cd "/c/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/shared build && pnpm --filter @call-it/web build && pnpm --filter @call-it/web exec vitest run</automated>
  </verify>
  <done>wagmi config is [arbitrumSepolia, arbitrum] with an honest comment; chain.ts exports ACTIVE_CHAIN/ACTIVE_CHAIN_ID/selected addresses with Sepolia USDC for 421614; any order-asserting tests updated honestly; build + tests green.</done>
</task>

<task type="auto">
  <name>Task 2: Sweep every client-side read hook to explicit chainId + chain-correct addresses (B3)</name>
  <files>apps/web/hooks/useUsdcBalance.ts, apps/web/app/components/ChallengeFormModal.tsx, apps/web/app/duel/[challengeId]/page.tsx, apps/web/app/call/[id]/page.tsx, apps/web/app/new/hooks/useSettledCalls.ts, apps/web/hooks/useCirclePaymaster.ts, any other files found by the repo-wide grep</files>
  <action>
    Sweep EVERY client-side read hook to pass explicit `chainId: ACTIVE_CHAIN_ID` and chain-correct token/contract addresses from `apps/web/lib/chain.ts`. Known callsites (verified by live investigation):

    - `apps/web/hooks/useUsdcBalance.ts:51` — useBalance currently uses the MAINNET USDC token + no chainId. THIS is the 0.00-chip bug. Switch to the Sepolia-selected USDC address + chainId.
    - `apps/web/app/components/ChallengeFormModal.tsx:194,202` — allowance + balanceOf use hardcoded mainnet USDC_ADDR. Switch to chain.ts addresses + chainId. (This fixes the false "Insufficient USDC balance — you need $5.00 more" block.)
    - `apps/web/app/duel/[challengeId]/page.tsx:417` — USDC allowance read ONLY. Do NOT touch anything else on the duel page — PLAN-03 owns its presentation.
    - `apps/web/app/call/[id]/page.tsx:482` (USDC allowance) + `:1143` (the 8 FFM pool reads) — touch ONLY these hook callsites in this file; PLAN-03 owns the rest.
    - `apps/web/app/new/hooks/useSettledCalls.ts:48` — add chainId.
    - `apps/web/hooks/useCirclePaymaster.ts:80` AND its permit typed-data domain (~line 108) which hardcodes `arbitrum.id` — must be `ACTIVE_CHAIN_ID`. This is a LATENT PERMIT-SIGNATURE BUG on Sepolia (wrong domain chainId = invalid signature).

    Then grep the WHOLE of apps/web for any other `useReadContract`/`useReadContracts`/`useBalance` without an explicit `chainId` and fix consistently with the same pattern. Add/adjust tests where hooks have coverage (assert chainId + Sepolia USDC address present in hook args where test infrastructure supports it).
  </action>
  <verify>
    <automated>cd "/c/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/web build && pnpm --filter @call-it/web exec vitest run && (! grep -rn "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" apps/web/hooks apps/web/app --include="*.tsx" --include="*.ts" | grep -v "chain.ts" | grep -v test | grep -v "\.md")</automated>
  </verify>
  <done>Every useBalance/useReadContract/useReadContracts in apps/web carries explicit chainId: ACTIVE_CHAIN_ID; no client hook references the mainnet USDC address outside chain.ts's per-chain mapping; paymaster permit domain uses ACTIVE_CHAIN_ID; build + tests green.</done>
</task>

<task type="auto">
  <name>Task 3: Composer target scale 1e8 + creation-fee disclosure (B4, B7)</name>
  <files>apps/web/app/new/components/PriceTargetFields.tsx, apps/web/app/new/page.tsx, apps/web/app/new/components/PublishConfirmModal.tsx, packages/shared/src/validation/call-gates.ts (only if needed), colocated tests</files>
  <action>
    **B4 — target scale (canonical 1e8 per SettlementManager.sol:714):**
    - `apps/web/app/new/components/PriceTargetFields.tsx:56,61` — display ÷1e8 + onChange ×1e8 (replacing the current ×1e6/÷1e6).
    - `apps/web/app/new/page.tsx:188` — preview ÷1e8.
    - Default `targetValue` at `new/page.tsx:133` (currently `1n`, renders "0.000001") → `undefined`: empty input with placeholder + required-field validation — NO numeric prefill.
    - Check `packages/shared/src/validation/call-gates.ts` for any targetValue bound assuming 1e6 scale and align honestly (e.g. min/max target bounds — convert them to 1e8 semantics, do not delete them).
    - Check the preflight request path (whatever posts to the relayer calls-preflight) uses the SAME raw 1e8 value — no double conversion.
    - Stake fields stay 1e6 (USDC micro — already correct). Do not touch stake math.
    - Update tests: $4,200 input → 420000000000n on-chain value; round-trip display; empty default validation.

    **B7 — fee disclosure:** `CREATION_FEE` lives at `packages/shared/src/validation/call-gates.ts:47` (`10_000_000n` = $10 USDC). Add a "Creation fee $10.00 USDC" line + a total (stake + fee) row in the `apps/web/app/new/components/PublishConfirmModal.tsx` summary (~lines 110-137), AND a small persistent note near the stake input on /new: "+ $10.00 creation fee at publish". Import the constant — do not hardcode 10.
  </action>
  <verify>
    <automated>cd "/c/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/shared build && pnpm --filter @call-it/web build && pnpm --filter @call-it/shared exec vitest run && pnpm --filter @call-it/web exec vitest run</automated>
  </verify>
  <done>$4,200 entry produces 420000000000 raw target (1e8); preview and display round-trip at 1e8; default is an empty required input; any 1e6-assuming shared validation bound honestly migrated; publish modal shows fee line + stake+fee total and /new shows the persistent fee note; tests green.</done>
</task>

<task type="auto">
  <name>Task 4: FollowFadeModal balance gate + shares coherence (B5) + expiry gating (B6)</name>
  <files>packages/ui/src/compound/FollowFadeModal.tsx, apps/web/app/call/[id]/page.tsx (FollowFadeModal usage site + button gating only), colocated tests</files>
  <action>
    **B5 — packages/ui/src/compound/FollowFadeModal.tsx:**
    - Add a `userBalance?: bigint` prop + an insufficient-balance gate mirroring the ChallengeFormModal UX: message "Insufficient USDC balance — you need $X.XX more" and the confirm button disabled. When `userBalance` is undefined (not passed), the gate is inactive (degrade gracefully — D-07).
    - Pass the REAL balance from the call page (`useUsdcBalance`, now Sepolia-correct after Task 2) at the FollowFadeModal usage site in `apps/web/app/call/[id]/page.tsx`.
    - Fix the "Expected shares 0.0000 / Min shares 0.0099" incoherence: when expectedShares rounds to 0 at 4dp, show more precision or "<0.0001"; and NEVER render minShares > expectedShares — make both displays derive from the same computation consistently.

    **B6 — expiry gating on apps/web/app/call/[id]/page.tsx:** FOLLOW (~line 2187), FADE (~2207), CHALLENGE (~2287) buttons — disable when expired (`callData.expiry <= now` in SECONDS — mind ms-vs-s units) OR status not Live; render small inert reason text ("call expired — awaiting settlement"). Modals must NOT open on expired calls (guard the open handlers, not just the button disabled attribute).

    Note: this plan only GATES these buttons; PLAN-03 (wave 2) restyles statuses and owns the rest of this page — keep the edits minimal and surgical so the wave-2 merge is clean.

    Tests (packages/ui): balance gate renders message + disables confirm at deficit; no gate when prop absent; shares display coherence (expectedShares < 0.0001 case; minShares never exceeds displayed expectedShares).
  </action>
  <verify>
    <automated>cd "/c/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/ui build && pnpm --filter @call-it/web build && pnpm --filter @call-it/ui exec vitest run && pnpm --filter @call-it/web exec vitest run</automated>
  </verify>
  <done>FollowFadeModal gates on real balance with the exact UX copy and disabled confirm; shares display never contradicts itself; expired/non-Live calls show disabled FOLLOW/FADE/CHALLENGE with inert reason text and modals cannot open; ui + web builds and tests green.</done>
</task>

</tasks>

<verification>
- Full build chain: `pnpm --filter @call-it/shared build && pnpm --filter @call-it/ui build && pnpm --filter @call-it/web build`.
- All three vitest suites pass (shared, ui, web) — no weakened tests (D-15); any intentionally changed expectations explained in SUMMARY.
- Grep gate: no `useBalance`/`useReadContract`/`useReadContracts` call in apps/web without `chainId`; mainnet USDC address appears only inside chain.ts's per-chain map (and shared constants).
- D-36 intact: wagmi config contains exactly arbitrum + arbitrumSepolia, Sepolia first.
</verification>

<success_criteria>
- Page loads produce zero arb-mainnet.g.alchemy.com reads from default-chain fallthrough; balance chip and challenge modal read Sepolia.
- Composer is 1e8-correct end to end (input → preview → submitted raw value), default empty.
- Balance gate, expiry gate, fee disclosure all live.
- ONE atomic commit: `fix(quick-260611-5mh): web Sepolia chain correctness + 1e8 target scale + balance/expiry/fee gates` — submodule `packages/contracts/lib/openzeppelin-contracts` NOT staged.
</success_criteria>

<output>
Create `.planning/quick/260611-5mh-fix-all-site-review-findings/SUMMARY-02.md` when done. MUST note: exact lines touched in apps/web/app/call/[id]/page.tsx and apps/web/app/duel/[challengeId]/page.tsx (so PLAN-03's executor knows the wave-2 baseline), any tests whose expectations changed and why, and whether call-gates.ts needed the 1e8 alignment.
</output>
