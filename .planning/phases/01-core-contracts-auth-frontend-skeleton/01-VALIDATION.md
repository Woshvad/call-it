---
phase: 1
slug: core-contracts-auth-frontend-skeleton
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-22
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Detailed test matrix lives in `01-RESEARCH.md` § Validation Architecture (line 1509+) — this doc is the executable contract.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Solidity** | Foundry (`forge test`) — pinned in `packages/contracts/foundry.toml` |
| **Frontend unit** | Vitest 3 — `apps/web/vitest.config.ts` + `packages/ui/vitest.config.ts` |
| **Frontend e2e** | Playwright `^1.48.0` — `apps/web/playwright.config.ts` |
| **Relayer unit** | Vitest 3 — `apps/relayer/vitest.config.ts` |
| **Quick run command** | `pnpm turbo run test --filter=<changed-package>` |
| **Full suite command** | `pnpm turbo run test && pnpm --filter @call-it/web exec playwright test` |
| **Phase gate** | full suite + 1000-run Foundry fuzz + parity diff + provider-order AST + grep guards |
| **Estimated runtime** | ~30s quick / ~3-5min full / ~10min phase gate |

---

## Sampling Rate

- **After every task commit:** `pnpm turbo run test --filter=<changed-package>` (Foundry + Vitest unit only; <30s)
- **After every plan wave:** `pnpm turbo run test && pnpm --filter @call-it/web exec playwright test` (~3–5 min)
- **Before `/gsd-verify-work`:** Full suite must be green AND parity diff green AND AST test green AND grep guards green
- **Max feedback latency:** 30s per task; 5min per wave

---

## Per-Task Verification Map

> Detailed Req-ID → command map lives in `01-RESEARCH.md` § Validation Architecture. Planner populates this section per task during Step 8.

| Plan Area | Requirement Class | Test Type | Automated Command |
|-----------|------------------|-----------|-------------------|
| CallRegistry contract gates | CALL-20..36, CALL-67..70, SAFETY-04..14 | Foundry unit + fuzz | `forge test --match-contract CallRegistry` |
| Contract↔preflight parity (D-29) | CALL-22..36 | Foundry + Vitest parity diff | `pnpm run parity:diff` |
| ProfileRegistry | REP-01/02/17/18/28/29, AUTH-39..43 | Foundry unit | `forge test --match-contract ProfileRegistry` |
| Privy provider order (Pitfall 13) | AUTH-05 | Vitest AST + Playwright | `pnpm vitest run apps/web/tests/privy-provider-order.ast.test.ts` |
| Privy 3-path sign-in | AUTH-01..04, AUTH-08, AUTH-11 | Playwright e2e | `pnpm playwright test tests/signin.spec.ts` |
| 4-screen onboarding | AUTH-19..21, AUTH-44 | Playwright e2e | `pnpm playwright test tests/onboarding.spec.ts` |
| Wallet export prompt ≥$50 | AUTH-22..24 | Playwright e2e (mock USDC) | `pnpm playwright test tests/wallet-export-prompt.spec.ts` |
| Paymaster 5-tx cap + Circle USDC handoff | AUTH-26..30 | Vitest relayer + Playwright e2e | `pnpm --filter @call-it/relayer vitest run paymaster-policy.test.ts && pnpm playwright test tests/paymaster-cap-handoff.spec.ts` |
| Address book + 24h cooldown | AUTH-31..38 | Vitest relayer integration | `pnpm --filter @call-it/relayer vitest run address-book.test.ts withdraw-authorize.test.ts` |
| New Call form + duplicate-hash debounce | CALL-37..48 | Vitest + Playwright | `pnpm playwright test tests/new-call-publish.spec.ts` |
| Feed shell + 800ms race | UI-08, CALL-58..66 | Vitest relayer | `pnpm --filter @call-it/relayer vitest run feed.test.ts` |
| Profile shell + ENS server-side | UI-10, AUTH-33..35, REP-17/18 | Vitest relayer + Playwright | `pnpm --filter @call-it/relayer vitest run ens-resolver.test.ts` |
| `packages/ui` primitives (Skeleton 6 variants, Toast 3-status, CornerBrackets, Receipt mode='preview') | UI-29..43 | Vitest snapshot | `pnpm --filter @call-it/ui vitest run` |
| 4-page visual smoke | UI-01..05, UI-24/25, UI-29..47, UI-51..56 | Playwright visual | `pnpm playwright test tests/visual-smoke.spec.ts tests/design-system-snap.spec.ts` |
| Receipt never shows wallet address | AUTH-44, UI-46/47 | Vitest snapshot | `pnpm vitest run packages/ui/__tests__/receipt-no-address.test.tsx` |
| `display: grid` lint rule (Pitfall 15 — Phase 7 Satori OG re-use) | UI-30..37 (Receipt) | ESLint custom rule | `pnpm --filter @call-it/ui lint` |
| USDC.e paste defense (Pitfall 1) | SAFETY-01..09 | Foundry + CI grep | `forge test --match-test test_usdc_hardcoded && pnpm run grep-guards` |
| Reentrancy / CEI (SAFETY-09/10/14) | SAFETY-04..11/14/18 | Foundry with malicious callback | `forge test --match-contract CallRegistrySafety` |

*Status legend: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky — planner sets per task.*

---

## Wave 0 Requirements

Test files that MUST exist before any feature wave merges (stubs OK, but the file path must be in the tree):

### Solidity
- [ ] `packages/contracts/test/CallRegistry.t.sol` — happy path + per-gate units
- [ ] `packages/contracts/test/CallRegistryGates.t.sol` — fuzz matrix of all gate combinations (Gate 6.1 / 6.2 / 6.3)
- [ ] `packages/contracts/test/CallRegistryParity.t.sol` — reads `gate-matrix.json` fixture
- [ ] `packages/contracts/test/CallRegistrySafety.t.sol` — reentrancy + CEI + pause carve-out
- [ ] `packages/contracts/test/ProfileRegistry.t.sol` — handle / socials / settledCalls views
- [ ] `packages/contracts/test/fixtures/gate-matrix.json` — shared parity fixture
- [ ] `packages/contracts/test/mocks/MockUSDC.sol` — for SafeERC20 tests

### Frontend
- [ ] `apps/web/tests/privy-provider-order.ast.test.ts` — Vitest + ts-morph (Pitfall 13)
- [ ] `apps/web/tests/signin.spec.ts` — Playwright, 3 sign-in paths
- [ ] `apps/web/tests/onboarding.spec.ts` — Playwright, 4 screens + resume
- [ ] `apps/web/tests/new-call-publish.spec.ts` — Playwright, full publish flow with mock contracts
- [ ] `apps/web/tests/paymaster-cap-handoff.spec.ts` — Playwright, 5th → 6th tx UX (Circle USDC handoff)
- [ ] `apps/web/tests/wallet-export-prompt.spec.ts` — Playwright with $50 USDC trigger
- [ ] `apps/web/tests/visual-smoke.spec.ts` — visual snap of 4 pages
- [ ] `apps/web/tests/design-system-snap.spec.ts` — visual snap of `packages/ui` primitives

### Shared
- [ ] `packages/shared/__tests__/call-gates-parity.test.ts` — Vitest reads same fixture as Foundry parity
- [ ] `packages/shared/__tests__/duplicate-hash-parity.test.ts` — TS hash matches Solidity (UTC-day boundary)

### Relayer
- [ ] `apps/relayer/__tests__/paymaster-policy.test.ts` — Vitest unit with ioredis-mock + Upstash counter
- [ ] `apps/relayer/__tests__/address-book.test.ts` — Vitest with test Postgres (testcontainers or fly remote DB)
- [ ] `apps/relayer/__tests__/withdraw-authorize.test.ts` — 24h cooldown bypass attempt
- [ ] `apps/relayer/__tests__/feed.test.ts` — 800ms race with subgraph mock + Redis 10s cache
- [ ] `apps/relayer/__tests__/ens-resolver.test.ts` — viem mock + 24h cache + negative caching
- [ ] `apps/relayer/__tests__/onboarding.test.ts` — state row pattern + resume

### Design system / lint
- [ ] `packages/ui/__tests__/receipt-no-address.test.tsx` — wallet address never rendered
- [ ] `packages/ui/__tests__/cva-variants.test.tsx` — Button, Card, Tag, Toast, Skeleton variants
- [ ] `packages/ui/.eslintrc.cjs` — custom rule: no `display: grid` in `<Receipt>` and descendants

### CI / parity
- [ ] `scripts/parity-diff.ts` — runs Foundry parity output + Vitest parity output and diffs
- [ ] `.github/workflows/phase-1-gates.yml` — wires parity diff + AST + grep guards into CI matrix

*(Test framework infrastructure baselined in Phase 0 — Vitest, Playwright, Foundry, GitHub Actions all configured. Phase 1 adds files only, no framework changes.)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Privy outage → Connect Wallet fallback shows | Pitfall 16 / AUTH-04 | Cannot reliably mock Privy outage in CI | DevTools network → block `*.privy.io` → reload `/signin` → assert Connect Wallet CTA still functional |
| Privy custody disclosure card copy + ≥$50 USDC export prompt visual | AUTH-22..24, UI-25 | Visual judgement on neobrutalist treatment | Run `/signin → Google` path → assert disclosure renders pre-onboarding; fund test wallet to $51 → assert export prompt fires |
| Coinbase Onramp hosted-flow popup (NOT redirect) keeps onboarding session | AUTH-25, D-34 | Onramp third-party SDK is hard to mock | Fresh sign-in via Twitter path → reach fund step → click Onramp → assert popup, NOT same-tab redirect; complete sandbox flow; assert onboarding state intact |
| Tape feed empty state copy + first-load skeleton | UI-08, D-35 | Visual + tone-register judgement | Empty Sepolia DB → load `/` → assert "No calls yet. Be the first to go on record." + `[+ NEW CALL]` CTA + 6-variant skeleton |
| Neobrutalist visual treatment across 4 pages | UI-38..47, UI-51..56 | Pixelmatch tolerances on first-pass need human signoff | Playwright snapshots reviewed by user before snapshot baseline locks |
| Circle USDC Paymaster mainnet behavior (Sepolia equivalent uncertain per RESEARCH.md MEDIUM confidence) | AUTH-29..30, D-04..D-06 | Cannot fully smoke-test on Sepolia if no Sepolia paymaster | §19.11 mainnet smoke checklist run; document any Sepolia gap |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (see Wave 0 Requirements above)
- [ ] No watch-mode flags in CI commands
- [ ] Feedback latency < 30s for task-commit sampling
- [ ] `nyquist_compliant: true` set in frontmatter (flip when planner finalizes per-task map)

**Approval:** pending
