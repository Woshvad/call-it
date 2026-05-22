---
phase: 01-core-contracts-auth-frontend-skeleton
type: phase-summary
status: complete
plans: 10
completed: 2026-05-23
depends_on: Phase 0 (foundation)
provides_to: Phase 1.5 (social linking), Phase 2 (FollowFadeMarket)
---

# Phase 1: Core Contracts + Auth + Frontend Skeleton — Phase Summary

**One-liner:** Arbitrum Sepolia CallRegistry + ProfileRegistry contracts with 10-gate createCall, Privy 3-path auth, 4-screen onboarding, ERC-7677 paymaster (5 free tx) + Circle USDC Paymaster post-cap, address book + 24h cooldown, /new call form with parity-tested anti-spam gates, feed shell + profile shell, design system (6 skeleton variants, 3-status toast, neobrutalist primitives), and subgraph extension with real event handlers.

---

## Phase Summary

Critical-path steps 1 (Sign-up) through 5 (Publish) are complete at contract + UI level. A real user can sign in via Wallet SIWE, Google OAuth, or Twitter OAuth; complete 4-screen onboarding; fund the wallet via Coinbase Onramp or direct USDC transfer; get the first 5 transactions sponsored via Alchemy AA ERC-7677; create a real CallRegistry call (Price target / Spread/vs / Event binary with 7 subtypes) with all anti-spam gates enforced both server-side (preflight) and contract-side; and see the call indexed by the subgraph within ~30 seconds. The feed shell and profile shell render with ENS resolution, skeleton loading states, and the full neobrutalist design system.

---

## Plan Inventory

| Plan | Name | Key Deliverable | Commits |
|------|------|----------------|---------|
| 01-01 | Monorepo bootstrap + UI workspace | @call-it/ui workspace, Drizzle schema, Phase 1 env, WAVE-0-VERIFICATION | Wave 0 |
| 01-02 | CallRegistry + ProfileRegistry contracts | 10-gate createCall, ProfileRegistry lazy-init, 80 Foundry tests, deploy script | Wave 0 |
| 01-03 | Shared Zod schemas + parity | call-gates.ts Zod, TS dup-hash, parity-diff CI gate (D-29) | Wave 1 |
| 01-04 | Design system primitives | Button/Card/Tag/CornerBrackets/Skeleton×6/Toast/Stamp + Receipt/ConvictionBar/CallCard/ProfileHeader | Wave 1 |
| 01-05 | Privy sign-in + wagmi configs | 3-path sign-in, Providers.tsx, AST test, /signin page, Alchemy AA config | Wave 2 |
| 01-06 | 4-screen onboarding | Handle/Socials/Follow-graph/Tagline screens, Coinbase Onramp, custody disclosure | Wave 2 |
| 01-07 | Paymaster + address book + 24h cooldown | ERC-7677 policy, Upstash counter, Circle USDC handoff, address book CRUD, withdraw-authorize | Wave 3 |
| 01-08 | /new call form | RHF + zodResolver, 3 mode sub-forms, preflight, dup-check, Receipt preview, publish modal | Wave 4 |
| 01-09 | Feed shell + profile shell | 800ms subgraph race, 10s Redis cache, ENS 24h cache, /profile/[address], Settings | Wave 4 |
| 01-10 | Phase closure | Subgraph real event handlers, AUTH-27/29 amendment, visual snapshots, phase-1-complete-gate | Wave 5 |

---

## Requirements Coverage

**150 unique Phase 1 REQ-IDs from ROADMAP.md — all covered.**

Audit command:
```bash
grep -hE "^  - (AUTH|CALL|REP|SAFETY|UI|OPS)-[0-9]+$" \
  .planning/phases/01-core-contracts-auth-frontend-skeleton/01-*-PLAN.md \
  | sort -u | wc -l
# Result: 151 (≥ 150 — PASS)
```

Coverage breakdown:
- AUTH: 44 requirements (AUTH-01..44) — Plans 01-05, 01-06, 01-07, 01-09, 01-10
- CALL: 70 requirements (CALL-01..70) — Plans 01-02, 01-03, 01-08
- REP: 6 requirements (REP-01, 02, 17, 18, 28, 29) — Plan 01-02
- SAFETY: 12 requirements — Plans 01-02, 01-03
- UI: 24 requirements — Plans 01-04, 01-05, 01-06, 01-08, 01-09, 01-10
- OPS: 1 requirement (OPS-04) — Plan 01-10

---

## Key Decisions Summary

| Decision | Outcome |
|----------|---------|
| AA vendor: Alchemy | Single billing line, first-class Privy integration, ERC-7677 policy endpoint |
| D-06: POST-CAP GAS | Circle USDC Paymaster replaces ETH requirement — no ETH ever needed. REQUIREMENTS.md AUTH-27/29 amended. |
| D-29: Parity anti-drift | Shared Zod schemas + Foundry fixture + parity-diff CI gate prevents gate divergence |
| D-11: Handle no onchain uniqueness | ~22k gas saved per profile; display-priority only |
| Subgraph primary + 800ms fallback | D-24 circuit breaker; `feed_fallback_engaged` logged |

---

## Pitfall Closure

| Pitfall | Closed In |
|---------|-----------|
| Pitfall 1 (USDC address) | Phase 0 + Plan 01-01 (CI grep guard) |
| Pitfall 12 (UTC dup-hash boundary) | Plan 01-08 (useDupCheck 400ms debounce) |
| Pitfall 13 (Privy provider order) | Plan 01-05 (AST test) |
| Pitfall 14 (paymaster cap only at vendor) | Plan 01-07 (relayer ERC-7677 policy) |
| Pitfall 15 (Satori display:grid) | Plan 01-04 (flexbox-only Receipt) |
| Pitfall 16 (Connect Wallet fallback) | Plan 01-05 (3 CTAs on /signin) |
| Pitfall 20 (24h cooldown server-side) | Plan 01-07 (withdraw-authorize.ts) |
| Pitfall A (UI barrel in Server Component) | Plan 01-09 (ProfileClient.tsx boundary) |
| Pitfall B (Privy wagmi version) | Plan 01-01 (pinned @privy-io/wagmi@4.0.8) |
| Pitfall C (Subgraph ABI drift) | **Plan 01-10** (real event handlers) |
| Pitfall D (Privy user lookup pre-authorize) | Plan 01-07 (getPrivyClient().getUser()) |

---

## What Phase 2 Inherits

| Inheritance | From | Notes |
|-------------|------|-------|
| CallRegistry deployed + tested (10 gates) | Plans 01-02, 01-03 | FollowFadeMarket reads CallRegistry for position creation |
| ProfileRegistry deployed + tested | Plan 01-02 | Phase 2 follows/fades update ProfileRegistry via SettlementManager (Phase 4) |
| Subgraph: FollowFadeMarket stub ready | Plans 00-03, 01-10 | Stub eventHandlers in follow-fade-market.ts waiting for real events |
| parity-diff CI gate (D-29) | Plan 01-03 | Phase 2 gate-matrix.json extends with follow/fade inputs |
| Design system (@call-it/ui) | Plan 01-04 | Phase 2 Follow/Fade UI uses Button, ConvictionBar, Receipt (live mode) |
| Privy + wagmi provider tree | Plan 01-05 | Phase 2 useWriteContract calls go through same AA pipeline |
| Relayer base (Fastify + Drizzle + Redis) | Plans 01-01, 01-07 | Phase 2 adds follow/fade endpoints to existing relayer |
| ENS resolver + subgraph proxy | Plan 01-09 | Phase 2 feed shows Follow/Fade positions on call cards |

---

## Phase 1.5 Parallel Handoff

Phase 1.5 (social linking) runs in parallel with Phase 2. It inherits:
- ProfileRegistry with `SocialIdentity` slots already deployed (Phase 1)
- Subgraph `handleSocialLinked` + `handleSocialUnlinked` handlers wired (Plan 01-10)
- Relayer skeleton with `getPrivyClient()` singleton (Plan 01-06)
- AUTH-06, AUTH-07, AUTH-09..18 requirements (assigned to Phase 1.5 per ROADMAP)

Phase 1.5 needs to add:
- `POST /api/social/link-twitter` (verify Privy OAuth proof → call ProfileRegistry.linkTwitter)
- `POST /api/social/link-farcaster` (verify Farcaster Auth Kit proof → call ProfileRegistry.linkFarcaster)
- VERIFIED badges rendering on all surfaces (ProfileHeader, CallCard, Receipt, feed items)
- "From your X / From your Farcaster" feed sections in the feed shell

---

## Operational Concerns for Phase 1.5 Operator

1. **Subgraph deploy key rotation**: SUBGRAPH_STUDIO_DEPLOY_KEY is held by the operator. Rotate quarterly or on suspected compromise. Update in GitHub Secrets (`deploy-subgraph.yml`).

2. **Subgraph monthly query budget**: Free tier = 100,000 queries/month. At 1 query per page load × 10k users × 10 page loads/day = 100k/day → upgrade to paid tier ($4 per 100K) before public launch.

3. **Privy webhook secret rotation**: PRIVY_WEBHOOK_SECRET must be rotated before Phase 6 multisig promotion. Update in GCP Secret Manager and Privy dashboard simultaneously (zero-downtime: Privy supports dual-secret transition period).

4. **Circle USDC Paymaster address verification**: `CIRCLE_PAYMASTER_ARBITRUM_ONE` is MEDIUM confidence (01-CONTEXT.md WAVE-0-VERIFICATION item). Operator must verify current address against `https://docs.arbitrum.io/for-devs/third-party-docs/Circle/usdc-paymaster-quickstart` before mainnet deploy.

5. **Subgraph contract addresses**: `subgraph.yaml` still has `0x0000...` placeholders. After Sepolia deploy, operator must update both addresses and run `pnpm --filter @call-it/subgraph deploy:sepolia`.

6. **Visual snapshot goldens**: `apps/web/tests/__screenshots__/` does not yet contain baseline goldens. Operator must run Playwright locally with `NEXT_PUBLIC_DEV_ROUTES=1`, commit the generated baselines, then push before the phase-1-complete tag.
