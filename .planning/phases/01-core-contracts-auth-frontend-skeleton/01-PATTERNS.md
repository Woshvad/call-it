# Phase 1: Core contracts + auth + frontend skeleton — Pattern Map

**Mapped:** 2026-05-22
**Files analyzed:** 62
**Analogs found:** 54 / 62 (8 no-analog — flagged below)

This document maps each Phase 1 file (created or modified) to the closest Phase 0 analog already in the repo, with concrete code excerpts the planner copies into per-plan actions. Where no analog exists, the file is listed under **No Analog Found** and the planner should consult RESEARCH.md Patterns 1–13 instead.

---

## File Classification

### Contracts — `packages/contracts/src/`

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/CallRegistry.sol` | model+controller (Solidity) | CRUD + state machine | `src/constants/USDC.sol` (header/pragma convention) + RESEARCH Pattern 6/7 | role-match (no contract analog in P0) |
| `src/ProfileRegistry.sol` | model (Solidity) | CRUD | `src/constants/USDC.sol` (header convention) + RESEARCH Pattern 8 | partial (no contract analog in P0) |
| `src/interfaces/ICallRegistry.sol` | interface | — | RESEARCH Pattern 6 signatures | no analog |
| `src/interfaces/IProfileRegistry.sol` | interface | — | RESEARCH Pattern 8 signatures | no analog |
| `src/libraries/DuplicateHashLib.sol` | library (Solidity, pure) | transform | `src/constants/USDC.sol` (file structure only) | partial |
| `script/DeployPhase1.s.sol` | deploy script | one-shot | (none in P0) | no analog |

### Contracts — `packages/contracts/test/`

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `test/CallRegistry.t.sol` | test (Foundry) | request-response | `test/USDC.t.sol` | role-match |
| `test/CallRegistryGates.t.sol` | test (matrix fuzz) | batch | `test/USDC.t.sol` (Test base) | role-match |
| `test/CallRegistryParity.t.sol` | test (fixture-driven) | batch | `test/USDC.t.sol` | role-match |
| `test/CallRegistrySafety.t.sol` | test (CEI/reentrancy/pause invariants) | request-response | `test/USDC.t.sol` | role-match |
| `test/ProfileRegistry.t.sol` | test | request-response | `test/USDC.t.sol` | role-match |
| `test/mocks/MockUSDC.sol` | mock (Solidity) | CRUD | `src/constants/USDC.sol` (header) | partial |
| `test/fixtures/gate-matrix.json` | fixture (JSON) | data | (none in P0) | no analog |

### Frontend — `apps/web/`

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/layout.tsx` (extend) | layout | wraps provider tree | existing `app/layout.tsx` (Phase 0) | exact (modify-in-place) |
| `app/Providers.tsx` | provider component (`'use client'`) | composition | `app/layout.tsx` (P0 RootLayout) + RESEARCH Pattern 1 | role-match |
| `app/page.tsx` (extend) | page (feed shell) | request-response | existing `app/page.tsx` (P0 placeholder) | exact (rewrite) |
| `app/signin/page.tsx` | page | request-response | `app/page.tsx` (P0) | role-match |
| `app/new/page.tsx` | page (form) | request-response | RESEARCH Pattern 10 | no P0 analog |
| `app/profile/[address]/page.tsx` | dynamic route page | request-response | `app/api/og/[callId]/route.ts` (dynamic param resolution) | partial |
| `app/onboarding/layout.tsx` + 4 step pages | nested layout + step pages | request-response | `app/layout.tsx` | role-match |
| `app/api/onboarding/route.ts` (if proxied locally) | API route | request-response | `app/api/og/fallback/route.ts` | role-match |
| `lib/wagmi.ts` (== `lib/wagmi-config.ts`) | config module | — | RESEARCH Pattern 3 | no P0 analog (lib/ uses og-fonts.ts, og-fallback-render.ts) |
| `lib/privy-config.ts` | config module | — | RESEARCH Pattern 2 | no P0 analog |
| `lib/aa-config.ts` | config module | — | RESEARCH Pattern 4 | no P0 analog |
| `lib/relayer-client.ts` | client wrapper | request-response | `apps/web/lib/og-fallback-render.ts` (file structure) | partial |
| `tests/privy-provider-order.ast.test.ts` | unit test (ts-morph) | static analysis | `apps/web/tests/og-unit.test.ts` | role-match |
| `tests/signin.spec.ts` | e2e test (Playwright) | request-response | `apps/web/tests/og-fallback.spec.ts` | exact |
| `tests/onboarding.spec.ts` | e2e test (Playwright) | request-response | `apps/web/tests/og-fallback.spec.ts` | exact |
| `tests/new-call-publish.spec.ts` | e2e test | request-response | `apps/web/tests/og-fallback.spec.ts` | exact |
| `tests/paymaster-cap-handoff.spec.ts` | e2e test | request-response | `apps/web/tests/og-fallback-routing.spec.ts` | exact |
| `tests/wallet-export-prompt.spec.ts` | e2e test | request-response | `apps/web/tests/og-fallback.spec.ts` | exact |
| `tests/visual-smoke.spec.ts` | e2e visual test | snapshot | `apps/web/tests/og-fallback.spec.ts` (PNG byte comparison Test 1) | exact |
| `tests/design-system-snap.spec.ts` | e2e visual test | snapshot | `apps/web/tests/og-fallback.spec.ts` | exact |

### Design system — `packages/ui/` (NEW workspace)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `package.json` | workspace manifest | — | `packages/shared/package.json` | exact (mirror structure) |
| `tsconfig.json` | TS config | — | `packages/shared/tsconfig.json` (via @call-it/config) | exact |
| `tailwind.preset.ts` | Tailwind preset | — | `apps/web/tailwind.config.ts` | role-match (preset extracts the existing palette) |
| `src/primitives/Button.tsx` | primitive component (CVA) | composition | RESEARCH "Common Operation 3" | no P0 analog |
| `src/primitives/Card.tsx` | primitive component | composition | OG `cornerBracket()` (style-object pattern only) | partial |
| `src/primitives/Tag.tsx` | primitive component | composition | (none) | no analog |
| `src/primitives/Toast.tsx` + `ToastProvider.tsx` | provider+primitive | event-driven | RESEARCH Pattern 1 (provider shape) | no P0 analog |
| `src/primitives/Skeleton.tsx` (6 variants) | primitive component | composition | OG `cornerBracket()` style-object pattern | partial |
| `src/primitives/CornerBrackets.tsx` | primitive component (CSS pseudo) | — | `apps/web/lib/og-fallback-render.ts` lines 70-87 (`cornerBracket()`) | **exact** — same visual element |
| `src/primitives/Stamp.tsx` | primitive (framer-motion) | event-driven | (none in P0) | no analog |
| `src/compound/Receipt.tsx` (multi-mode) | compound component | composition | `apps/web/lib/og-fallback-render.ts` (`buildCard()`) | **role-match — Phase 7 will reuse Receipt as the OG body** |
| `src/compound/ConvictionBar.tsx` | compound (Radix Slider) | event-driven | (none) | no analog |
| `__tests__/receipt-no-address.test.tsx` | unit test | static analysis | `apps/web/tests/og-unit.test.ts` (static source assertion pattern) | exact |
| `__tests__/cva-variants.test.tsx` | unit test | request-response | `apps/web/tests/og-unit.test.ts` | role-match |
| `.eslintrc.cjs` (no `display: grid` in `<Receipt>`) | lint config | — | `packages/config/eslint/no-display-grid.js` + `packages/config/eslint/base.js` | **exact — same rule, scoped to packages/ui/src/compound/Receipt.tsx** |

### Shared — `packages/shared/src/`

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/validation/call-gates.ts` | Zod schemas | transform | `packages/shared/src/schemas/env-config.ts` | **exact — same Zod superRefine pattern** |
| `src/types/call.ts` | type module | — | `packages/shared/src/constants/networks.ts` (type+const pattern) | exact |
| `src/hashing/duplicate-hash.ts` | utility (pure fn) | transform | `packages/shared/src/constants/usdc.ts` (single source of truth pattern) | role-match |
| `__tests__/call-gates-parity.test.ts` | unit test | batch | `packages/shared/test/usdc.test.ts` | exact |
| `__tests__/duplicate-hash-parity.test.ts` | unit test | batch | `packages/shared/test/usdc.test.ts` | exact |

### Relayer — `apps/relayer/src/`

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/routes/paymaster-policy.ts` | Fastify route | request-response (JSON-RPC) | `apps/relayer/src/routes/admin-paymaster.ts` | **exact** (same Fastify+Zod+Redis pattern) |
| `src/routes/calls-preflight.ts` | Fastify route | request-response | `apps/relayer/src/routes/admin-paymaster.ts` | exact |
| `src/routes/calls-dup-check.ts` | Fastify route | request-response | `apps/relayer/src/routes/admin-paymaster.ts` | exact |
| `src/routes/feed.ts` | Fastify route | request-response (race) | `apps/relayer/src/routes/admin-paymaster.ts` + Pattern 11 | exact (frame) |
| `src/routes/profile.ts` | Fastify route | request-response (cached) | `apps/relayer/src/routes/admin-paymaster.ts` | exact (frame) |
| `src/routes/address-book.ts` | Fastify route | CRUD | `apps/relayer/src/routes/admin-paymaster.ts` | exact |
| `src/routes/withdraw-authorize.ts` | Fastify route | request-response | `apps/relayer/src/routes/admin-paymaster.ts` + `iam-auth.ts` | exact |
| `src/routes/privy-webhook.ts` | Fastify route | event-driven (webhook) | `apps/relayer/src/routes/internal-test-alert.ts` (HMAC-gated POST) | **exact** |
| `src/routes/onboarding.ts` | Fastify route | CRUD | `apps/relayer/src/routes/admin-paymaster.ts` | exact |
| `src/db/schema.ts` (Drizzle) | DB schema | — | `packages/shared/src/schemas/env-config.ts` (Zod definitions) | partial (no Drizzle in P0) |
| `src/db/client.ts` | DB client singleton | — | `apps/relayer/src/lib/redis.ts` (`getRedis()` memo pattern) | **exact — same singleton pattern** |
| `drizzle.config.ts` | Drizzle config | — | `apps/web/playwright.config.ts` (defineConfig pattern) | partial |
| `src/lib/ens-resolver.ts` | utility (viem client + cache) | request-response | `apps/relayer/src/lib/redis.ts` (singleton+TTL pattern) + Pattern 12 | role-match |
| `src/lib/upstash-counter.ts` (paymaster cap atomic) | utility | transform | `apps/relayer/src/workers/paymaster-counter.ts` | **exact — same atomic INCRBY pattern** |
| `__tests__/paymaster-policy.test.ts` | unit test | request-response | `apps/relayer/test/paymaster-admin.test.ts` | **exact** |
| `__tests__/address-book.test.ts` | unit test | CRUD | `apps/relayer/test/paymaster-admin.test.ts` | exact |
| `__tests__/withdraw-authorize.test.ts` | unit test | request-response | `apps/relayer/test/paymaster-admin.test.ts` | exact |
| `__tests__/feed.test.ts` | unit test | request-response | `apps/relayer/test/paymaster-admin.test.ts` | exact |
| `__tests__/ens-resolver.test.ts` | unit test | request-response | `apps/relayer/test/paymaster-counter.test.ts` | exact |
| `__tests__/onboarding.test.ts` | unit test | CRUD | `apps/relayer/test/paymaster-admin.test.ts` | exact |

### CI / scripts

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `scripts/parity-diff.ts` | CLI script | batch | (none) | no analog |
| `.github/workflows/phase-1-gates.yml` | GH Actions workflow | one-shot CI | `.github/workflows/contracts-test.yml` + `.github/workflows/phase-0-gate.yml` | **exact** |

---

## Pattern Assignments

### 1. `src/CallRegistry.sol` (Solidity contract, CRUD + state machine)

**Analog (header conventions only):** `packages/contracts/src/constants/USDC.sol`

**Header / pragma pattern** (USDC.sol lines 1-19):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
//                ^^^^^^^ EXACT pin — never ^0.8.x. CI grep guard fails build otherwise.
// Source: CLAUDE.md "Pinned Addresses (Arbitrum One Mainnet)"
// Spec: CALL_IT_SPEC1.md §10.5 — USDC mandate; hardcoded address contract
// Requirement: SAFETY-13, OPS-22
```

**Apply to:** Every new `.sol` file (CallRegistry, ProfileRegistry, interfaces, library, mock). Always begin with the exact pragma pin, then a 3-block comment header citing CLAUDE.md / spec section / REQ-ID.

**USDC import pattern** (USDC.sol consumer pattern):
```solidity
// Always import USDC_ARB_NATIVE — never inline the literal in any other .sol file.
import { USDC_ARB_NATIVE } from "./constants/USDC.sol";
// then:
IERC20(USDC_ARB_NATIVE).safeTransferFrom(msg.sender, address(this), incoming);
```

**Core contract pattern (full layout):** See RESEARCH.md Pattern 6 (lines 657-770) and Pattern 7 (lines 775-868).

**OpenZeppelin import block** (target pattern, derived from RESEARCH Pattern 6):
```solidity
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable2Step, Ownable } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
```
Remapping already wired in `packages/contracts/remappings.txt`: `@openzeppelin/=lib/openzeppelin-contracts/`.

**Storage-packing convention:** See RESEARCH Pattern 6 (`Call` struct slot layout). `address caller (20B) + uint96 stake (12B)` = 1 slot; pack subsequent uint64/uint8 into slot 2.

**Gate sequence convention** (revert-with-custom-error pattern, Pattern 7 lines 790-835):
```solidity
if (stake < MIN_STAKE) revert StakeBelowMinimum();
if (stake > MAX_STAKE) revert StakeAboveMaximum();
// ... checks first, then effects, then interactions (CEI)
```

**Spec-deviation comment convention** (USDC.sol line 12 — apply to PaymasterCap fields):
```solidity
// WARNING: AUTH-27 / AUTH-29 are amended per Phase 1 D-06 (Circle USDC Paymaster).
// See REQUIREMENTS.md AUTH-27 for the active requirement text.
```

---

### 2. `src/ProfileRegistry.sol` (Solidity contract, CRUD)

**Analog:** `packages/contracts/src/constants/USDC.sol` (header conventions) + RESEARCH Pattern 8 (full storage layout).

**Owner-rotation pattern** (RESEARCH Pattern 8 lines 928-936):
```solidity
function setSettlementManager(address newManager) external onlyOwner {
    settlementManager = newManager;
    emit SettlementManagerSet(newManager);
}

function setRelayer(address newRelayer) external onlyOwner {
    relayer = newRelayer;
    emit RelayerSet(newRelayer);
}
```

**Lazy-init pattern** (RESEARCH Pattern 8 lines 972-977):
```solidity
function _initIfNeeded(address user) internal {
    if (!profileExists[user]) {
        _profiles[user].globalRep = 100;  // REP-01 baseline
        profileExists[user] = true;
    }
}
```

**Phase 4/5 reserved storage fields:** keep `Profile` struct shape stable; **never reorder existing fields**. Add new fields after `challengerRep`. This is a non-upgradeable contract per D-14 — schema change = ProfileRegistryV2 + dual-read.

---

### 3. `src/libraries/DuplicateHashLib.sol` (Solidity library, pure transform)

**Analog:** `src/constants/USDC.sol` for file structure only.

**Library shape (derived from RESEARCH §1167 Anti-Pattern note + Pattern 7 line 819):**
```solidity
library DuplicateHashLib {
    /// @notice UTC-day floor (Pitfall 12 — never use raw timestamp)
    function dayBucketUtc(uint64 ts) internal pure returns (uint64) {
        return uint64((ts / 86400) * 86400);
    }

    /// @notice Compute the duplicate-hash bucket. MUST match the TS mirror in
    /// packages/shared/src/hashing/duplicate-hash.ts (CI parity test enforces).
    function compute(
        uint8 marketType,
        uint256 assetA,
        uint256 metric,
        uint256 targetValue,
        uint64 deadlineDay
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(marketType, assetA, metric, targetValue, deadlineDay));
    }
}
```

The TS mirror (`packages/shared/src/hashing/duplicate-hash.ts`) must produce identical bytes32 output for the same inputs — the **duplicate-hash-parity.test.ts** asserts this via viem's `encodeAbiParameters` + `keccak256`.

---

### 4. `test/CallRegistry.t.sol`, `test/ProfileRegistry.t.sol`, `test/CallRegistryGates.t.sol`, `test/CallRegistryParity.t.sol`, `test/CallRegistrySafety.t.sol`

**Analog:** `packages/contracts/test/USDC.t.sol`

**Test file header pattern** (USDC.t.sol lines 1-15):
```solidity
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;

import {Test} from "forge-std/Test.sol";
import {USDC_ARB_NATIVE} from "../src/constants/USDC.sol";

/// @title USDC constant test
/// @notice Asserts that the USDC_ARB_NATIVE constant equals the canonical native USDC
///         address on Arbitrum One and is NOT the bridged USDC.e address.
///
///         If these tests fail, USDC transfer paths in the product will route funds
///         to the wrong address (SAFETY-13, OPS-22, T-00-01).
///
///         Source: CLAUDE.md "Pinned Addresses (Arbitrum One Mainnet)"
///         Spec:   CALL_IT_SPEC1.md §10.5
contract USDCConstantTest is Test {
```

**Apply to all Phase 1 .t.sol files:**
- Same `pragma solidity =0.8.30;` exact pin
- Same `import {Test} from "forge-std/Test.sol";` (remapping pre-wired)
- NatSpec block citing the source spec section + REQ-IDs being verified
- Contract name = `<Subject>Test`
- Test fns named `test_<thing_under_test>_<assertion>` (snake_case for selectors)

**Assertion patterns** (USDC.t.sol lines 27-41):
```solidity
function test_USDC_ARB_NATIVE_matches_native_address() public pure {
    assertEq(USDC_ARB_NATIVE, EXPECTED_NATIVE_USDC,
        "USDC_ARB_NATIVE must equal 0xaf88d065e77c8cC2239327C5EDb3A432268e5831 (native USDC on Arbitrum One)");
}

function test_USDC_ARB_NATIVE_is_not_bridged() public pure {
    assertTrue(USDC_ARB_NATIVE != BRIDGED_USDC_E_DO_NOT_USE,
        "USDC_ARB_NATIVE must not equal 0xFF970A61...DB5CC8 (bridged USDC.e - not redeemable 1:1 with Circle)");
}
```

**For CallRegistryParity.t.sol specifically** (RESEARCH Pattern 9 — fixture-driven parity test):
- Load `test/fixtures/gate-matrix.json` via `vm.readFile()` + `vm.parseJson()`
- Loop through cases, call `createCall(...)`, assert expected revert selector OR expected event via `vm.expectRevert(bytes4)` / `vm.expectEmit()`
- Co-runs with Vitest parity test in `packages/shared/__tests__/call-gates-parity.test.ts`; CI `scripts/parity-diff.ts` cross-checks.

**For CallRegistrySafety.t.sol:** Pause carve-out (§10.3), ReentrancyGuard exercise, CEI ordering — use `vm.expectRevert("EnforcedPause()")` (OZ Pausable selector).

---

### 5. `apps/web/app/Providers.tsx` (provider tree — Pitfall 13 critical)

**Analog:** RESEARCH Pattern 1 (lines 492-517) — verbatim shape required.

**Layout integration analog:** `apps/web/app/layout.tsx` (Phase 0).

**Critical excerpt to copy verbatim** (RESEARCH lines 493-517):
```tsx
// apps/web/app/Providers.tsx
// PROVIDER ORDER LOAD-BEARING — see PITFALLS.md Pitfall 13.
// Any PR touching this file must pass apps/web/tests/privy-provider-order.ast.test.ts
'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { WagmiProvider } from '@privy-io/wagmi';  // NOT from 'wagmi'
import { wagmiConfig } from '@/lib/wagmi';
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

**Then modify** `apps/web/app/layout.tsx` to import + wrap `<Providers>{children}</Providers>` inside `<body>`. Preserve the existing inline-style baseline (current P0 file uses `style={{ backgroundColor: '#09090E', ... }}` — keep until tailwind classes replace it in this same phase).

**Note on Privy wagmi package version:** Phase 0 already installed `@privy-io/wagmi@4.0.8` (per `apps/web/package.json` line 20) — newer than RESEARCH's `1.32.5` callout. Verify imports against the 4.x API surface (`createConfig` and `WagmiProvider` exports still exist; `useConnectorClient` may differ). CONTEXT.md `<canonical_refs>` flags this drift explicitly.

---

### 6. `apps/web/lib/wagmi.ts` + `lib/privy-config.ts` + `lib/aa-config.ts`

**Analog:** RESEARCH Patterns 2, 3, 4 — no Phase 0 analog (lib/ contains only OG modules).

**wagmi config pattern** (RESEARCH Pattern 3 lines 542-555):
```ts
// apps/web/lib/wagmi.ts
import { createConfig } from '@privy-io/wagmi';  // NOT 'wagmi'
import { http } from 'viem';
import { arbitrum, arbitrumSepolia } from 'viem/chains';

export const wagmiConfig = createConfig({
  chains: [arbitrum, arbitrumSepolia],  // D-36 lock — only these two
  transports: {
    [arbitrum.id]: http(process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL!),
    [arbitrumSepolia.id]: http(process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL!),
  },
});
```

**Privy config pattern** (RESEARCH Pattern 2 lines 522-536):
```ts
// apps/web/lib/privy-config.ts
import { arbitrum, arbitrumSepolia } from 'viem/chains';
import type { PrivyClientConfig } from '@privy-io/react-auth';

export const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;

export const privyConfig: PrivyClientConfig = {
  loginMethods: ['wallet', 'google', 'twitter'],
  appearance: { theme: 'dark', accentColor: '#E8F542' },
  embeddedWallets: {
    createOnLogin: 'users-without-wallets',
    requireUserPasswordOnCreate: false,
  },
  supportedChains: [arbitrum, arbitrumSepolia],
  defaultChain: process.env.NEXT_PUBLIC_NETWORK === 'mainnet' ? arbitrum : arbitrumSepolia,
};
```

**Source-of-truth dependency** (apply to all three lib/ configs): Read network/chain values from `@call-it/shared`'s exported constants where applicable (`ARBITRUM_MAINNET_CHAIN_ID`, `ARBITRUM_SEPOLIA_CHAIN_ID`) — see `packages/shared/src/constants/networks.ts` lines 16-23.

---

### 7. `apps/web/tests/privy-provider-order.ast.test.ts`

**Analog:** `apps/web/tests/og-unit.test.ts` — same static-source-assertion pattern.

**Imports + Vitest shape** (og-unit.test.ts lines 14-21):
```ts
import { describe, it, expect } from 'vitest';

describe('OG fallback route — static assertions', () => {
  it('route.ts exports runtime = nodejs', async () => {
    const { runtime } = await import('../app/api/og/fallback/route.js');
    expect(runtime).toBe('nodejs');
  });
```

**For Phase 1's AST test (RESEARCH Pattern 13 lines 1128-1155):**
```ts
import { Project, SyntaxKind } from 'ts-morph';
import { describe, it, expect } from 'vitest';
import path from 'path';

describe('Privy provider order (Pitfall 13)', () => {
  it('Providers.tsx wraps in order: PrivyProvider > QueryClientProvider > WagmiProvider', () => {
    const project = new Project({ tsConfigFilePath: path.resolve(__dirname, '..', 'tsconfig.json') });
    const file = project.getSourceFileOrThrow(path.resolve(__dirname, '..', 'app', 'Providers.tsx'));
    const jsx = file.getDescendantsOfKind(SyntaxKind.JsxElement);
    const outermost = jsx[0];
    expect(outermost.getOpeningElement().getTagNameNode().getText()).toBe('PrivyProvider');
    // ... assert nested order
    const wagmiImport = file.getImportDeclaration(d =>
      d.getNamedImports().some(n => n.getName() === 'WagmiProvider')
    );
    expect(wagmiImport?.getModuleSpecifierValue()).toBe('@privy-io/wagmi');  // NOT 'wagmi'
  });
});
```

**Static source assertion fallback** (og-unit.test.ts lines 60-68 — pattern to copy for D-12-style file-content checks across new files):
```ts
const { readFileSync } = await import('node:fs');
const { join } = await import('node:path');
const source = readFileSync(join(process.cwd(), 'app/Providers.tsx'), 'utf-8');
expect(source).toContain("'use client'");
expect(source).not.toContain("from 'wagmi'");  // must be from '@privy-io/wagmi'
```

---

### 8. `apps/web/tests/*.spec.ts` (Playwright e2e — signin, onboarding, new-call-publish, paymaster-cap-handoff, wallet-export-prompt, visual-smoke, design-system-snap)

**Analog:** `apps/web/tests/og-fallback.spec.ts` + `og-fallback-routing.spec.ts`

**Playwright describe + request pattern** (og-fallback.spec.ts lines 24-41):
```ts
import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

test.describe('SHARE-09: Fallback OG card route', () => {
  test('Test 1: returns 200 image/png at 1200x630', async ({ request, baseURL }) => {
    const response = await request.get(`${baseURL}/api/og/fallback?handle=veda`);
    expect(response.status()).toBe(200);
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('image/png');
    const buffer = await response.body();
    expect(buffer.length).toBeGreaterThan(1000);
  });
```

**Playwright config (already in place):** `apps/web/playwright.config.ts`
- `webServer.command = 'pnpm dev'` auto-starts Next.js
- `testMatch: ['**/*.spec.ts']` — new spec files auto-discovered
- `baseURL` from `PLAYWRIGHT_BASE_URL` env or `http://localhost:3000`

**Add per Phase 1:** New `tests/*.spec.ts` files follow the same describe structure. For visual snapshots (`visual-smoke.spec.ts`, `design-system-snap.spec.ts`), use Playwright's `toHaveScreenshot()` matcher; for paymaster-cap-handoff and wallet-export-prompt, mock Privy + Alchemy at the network layer using `page.route()`.

**Test script wiring (package.json):** Mirror the existing P0 script pattern (apps/web/package.json lines 12-15):
```json
"test:e2e:signin": "playwright test tests/signin.spec.ts",
"test:e2e:onboarding": "playwright test tests/onboarding.spec.ts",
// ... one script per new spec
```

---

### 9. `packages/ui/package.json` + `tsconfig.json` + `tailwind.preset.ts`

**Analog (package.json):** `packages/shared/package.json` — workspace manifest pattern.

**Verbatim mirror (packages/shared/package.json lines 1-24):**
```json
{
  "name": "@call-it/ui",
  "version": "0.0.1",
  "private": true,
  "description": "Shared design-system primitives + compound components for Call It (consumed by apps/web + Phase 8 Mini Apps)",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc --build",
    "test": "vitest run",
    "lint": "eslint src/"
  },
  "dependencies": {
    "@call-it/shared": "workspace:*",
    "class-variance-authority": "^0.7.0",
    "framer-motion": "^11.0.0"
    // peerDeps: react/react-dom 19 from apps/web
  },
  "devDependencies": {
    "@call-it/config": "workspace:*",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  }
}
```

**Workspace dependency pattern:** `"@call-it/shared": "workspace:*"` — same as `apps/web/package.json` line 17.

**Tailwind preset analog:** `apps/web/tailwind.config.ts` (Phase 0 colors + fonts) — extract the `theme.extend.colors` block (lines 26-46) into a preset that both `apps/web` and `packages/ui` consume:
```ts
// packages/ui/tailwind.preset.ts
import type { Config } from 'tailwindcss';
export default {
  theme: {
    extend: {
      colors: {
        'brand-bg': '#09090E',
        'brand-accent': '#E8F542',
        'brand-text': '#FFFFFF',
        'brand-muted': '#A1A1AA',
        'brand-border': '#27272A',
        'brand-surface': '#18181B',
        'outcome-win': '#22C55E',
        'outcome-loss': '#EF4444',
        'outcome-contrarian': '#A855F7',
      },
      fontFamily: {
        display: ['Syne', 'system-ui', 'sans-serif'],
        body: ['Space Grotesk', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      borderWidth: { '3': '3px', '4': '4px' },
    },
  },
} satisfies Partial<Config>;
```
Then `apps/web/tailwind.config.ts` is reduced to `{ presets: [uiPreset], content: [...] }`.

---

### 10. `packages/ui/src/primitives/CornerBrackets.tsx`

**Analog (exact — same visual element, different render target):** `apps/web/lib/og-fallback-render.ts` lines 67-87 — the `cornerBracket()` Satori helper.

**Source excerpt** (og-fallback-render.ts lines 70-87):
```tsx
type CornerPos = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

function cornerBracket(pos: CornerPos): ReactElement {
  const yellow = '#E8F542';
  const base = {
    position: 'absolute' as const,
    width: 24,
    height: 24,
    display: 'flex' as const,
  };

  const styles: Record<CornerPos, Record<string, unknown>> = {
    topLeft:     { ...base, top: 16, left: 16,   borderTop: `4px solid ${yellow}`, borderLeft:  `4px solid ${yellow}` },
    topRight:    { ...base, top: 16, right: 16,  borderTop: `4px solid ${yellow}`, borderRight: `4px solid ${yellow}` },
    bottomLeft:  { ...base, bottom: 16, left: 16,  borderBottom: `4px solid ${yellow}`, borderLeft:  `4px solid ${yellow}` },
    bottomRight: { ...base, bottom: 16, right: 16, borderBottom: `4px solid ${yellow}`, borderRight: `4px solid ${yellow}` },
  };

  return h('div', { key: pos, style: styles[pos] });
}
```

**Phase 1 reinterpretation (D-17):** Re-implement the same visual element as a React component using **CSS `::before`/`::after` pseudo-elements** (Tailwind `before:` / `after:`) so the parent absorbs the brackets:
```tsx
// packages/ui/src/primitives/CornerBrackets.tsx
// Visual parity with apps/web/lib/og-fallback-render.ts cornerBracket().
// Phase 7 OG cards still use the Satori variant; web UI uses this CSS variant.
export function CornerBrackets({ size = 24, thickness = 4 }: Props) {
  return (
    <>
      <span aria-hidden className="absolute top-4 left-4 size-6 border-t-4 border-l-4 border-brand-accent" />
      <span aria-hidden className="absolute top-4 right-4 size-6 border-t-4 border-r-4 border-brand-accent" />
      <span aria-hidden className="absolute bottom-4 left-4 size-6 border-b-4 border-l-4 border-brand-accent" />
      <span aria-hidden className="absolute bottom-4 right-4 size-6 border-b-4 border-r-4 border-brand-accent" />
    </>
  );
}
```
The parent must be `position: relative` (Tailwind `relative`).

---

### 11. `packages/ui/src/compound/Receipt.tsx` (multi-mode: preview/live/settled)

**Analog (role-match + Phase-7 dependency):** `apps/web/lib/og-fallback-render.ts` — `buildCard()` (lines 93-189).

**Critical constraint copy-from-analog** (og-fallback-render.ts line 101):
```tsx
display: 'flex',               // PITFALL 15: flexbox only — Satori does not support display: grid
```

**Apply to Receipt.tsx:** **Every** layout primitive inside `<Receipt>` and its children MUST be flexbox. No `display: grid`, no `grid-cols-*` Tailwind classes anywhere in `packages/ui/src/compound/Receipt.tsx` or files it imports. The `.eslintrc.cjs` rule (next pattern) enforces this at lint time.

**Footer brand env-var pattern** (og-fallback-render.ts lines 46-48):
```tsx
// D-12: footer brand constructed from env-var; domain literal is FORBIDDEN
const footerBrand =
  options.footerBrand ??
  (process.env['NEXT_PUBLIC_BRAND_FOOTER'] ?? '[BRAND] · Be right in public.');
```
Apply identically to Receipt — never hardcode brand/domain.

**Phase-7 reuse note:** When Phase 7 rebuilds the OG Live/Settled/DuelSettled variants with Satori, they will import `<Receipt mode="..."/>` from `@call-it/ui` and render it via `@vercel/og`. Build Receipt now as a pure-flexbox React tree that survives Satori's constrained CSS subset.

---

### 12. `packages/ui/.eslintrc.cjs` (custom rule: no `display: grid` in `<Receipt>`)

**Analog (exact — same rule, broader scope):** `packages/config/eslint/no-display-grid.js` + `packages/config/eslint/base.js`

**Rule source** (no-display-grid.js lines 34-79 — copy verbatim, change the file glob):
```js
// packages/config/eslint/no-display-grid.js — REUSE AS-IS; do not duplicate the rule body.
const noDisplayGrid = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow display: grid (Satori limitation, Pitfall 15).' },
    messages: { noDisplayGrid: 'Satori does not support display: grid. Use display: flex.' },
    schema: [],
  },
  create(context) {
    function checkObjectExpression(node) {
      for (const prop of node.properties) {
        if (prop.type !== 'Property') continue;
        const keyName = prop.key.type === 'Identifier' ? prop.key.name : null;
        if (keyName !== 'display') continue;
        const val = prop.value;
        if (val.type === 'Literal' && val.value === 'grid') {
          context.report({ node: prop, messageId: 'noDisplayGrid' });
        }
      }
    }
    return {
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'style') return;
        // ... see full rule at packages/config/eslint/no-display-grid.js
      },
    };
  },
};
```

**Scoping convention** (base.js lines 42-55 — copy and rewrite the glob for the Phase 1 scope):
```js
// packages/config/eslint/base.js — current Phase 0 scope is OG only.
// Phase 1 extension: add a new files block for packages/ui/src/compound/Receipt.tsx and children.
{
  files: ['packages/ui/src/compound/Receipt.tsx', 'packages/ui/src/compound/Receipt/**/*.{ts,tsx}'],
  plugins: { 'call-it': { rules: { 'no-display-grid': noDisplayGrid } } },
  rules: { 'call-it/no-display-grid': 'error' },
},
```

**Phase 1 deliverable:** Extend `packages/config/eslint/base.js` to add the new files glob — do **not** duplicate the rule module. `packages/ui/.eslintrc.cjs` simply imports the base config (mirroring future `apps/web/eslint.config.js`).

**Test for the rule** (`packages/ui/__tests__/receipt-no-address.test.tsx` — static source assertion):
Use the same static-source pattern as `apps/web/tests/og-unit.test.ts` lines 77-89:
```ts
import { readFileSync } from 'node:fs';
const source = readFileSync('packages/ui/src/compound/Receipt.tsx', 'utf-8');
expect(source).not.toContain("display: 'grid'");
expect(source).not.toContain('display: "grid"');
expect(source).not.toMatch(/className=["'][^"']*grid-cols/);  // Tailwind grid utility check
```

---

### 13. `packages/shared/src/validation/call-gates.ts` (Zod schemas for createCall)

**Analog (exact — same Zod superRefine pattern):** `packages/shared/src/schemas/env-config.ts`

**Verbatim Zod pattern** (env-config.ts lines 19-71):
```ts
import { z } from 'zod';

export const EnvConfigSchema = z
  .object({
    NEXT_PUBLIC_NETWORK: z.enum(['mainnet', 'sepolia']),
    NEXT_PUBLIC_CHAIN_ID: z.string(),
    // ... other fields
  })
  .superRefine((data, ctx) => {
    if (data.NEXT_PUBLIC_NETWORK === 'mainnet') {
      if (data.NEXT_PUBLIC_CHAIN_ID !== '42161') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['NEXT_PUBLIC_CHAIN_ID'],
          message: 'NEXT_PUBLIC_NETWORK=mainnet requires NEXT_PUBLIC_CHAIN_ID=42161 ...',
        });
      }
      // ... more cross-field refinements
    }
  });

export type EnvConfig = z.infer<typeof EnvConfigSchema>;
```

**Apply to call-gates.ts (RESEARCH "Common Operation 4" lines 1384-1432):** Build a `createCallSchema` that mirrors the `createCall` gate sequence in the Solidity contract one-to-one. Each Solidity revert maps to a `ctx.addIssue` with `path: [<form_field>]` and `code: z.ZodIssueCode.custom`. The fixture file (`packages/contracts/test/fixtures/gate-matrix.json`) is the cross-checked source-of-truth — both this schema AND `CallRegistryParity.t.sol` consume it.

**Export shape per RESEARCH Pattern 10 line 1015:**
```ts
import { createCallSchema, type CreateCallInput } from '@call-it/shared/schemas/call-gates';
```
Hence: `export const createCallSchema = z.object({...}).superRefine(...)` + `export type CreateCallInput = z.infer<typeof createCallSchema>`.

**Barrel re-export** in `packages/shared/src/index.ts` (currently lines 11-20 — add):
```ts
export * from './validation/call-gates.js';
export * from './hashing/duplicate-hash.js';
export * from './types/call.js';
```

---

### 14. `packages/shared/src/types/call.ts` (asset encoding + enums)

**Analog:** `packages/shared/src/constants/networks.ts` — same type + const + record pattern.

**Pattern** (networks.ts lines 28-53):
```ts
export type NetworkName = 'mainnet' | 'sepolia';

export type NetworkRecord = {
  name: NetworkName;
  chainId: typeof ARBITRUM_MAINNET_CHAIN_ID | typeof ARBITRUM_SEPOLIA_CHAIN_ID;
  rpcEnvVar: string;
};

export const NETWORKS: Record<NetworkName, NetworkRecord> = {
  mainnet: { name: 'mainnet', chainId: ARBITRUM_MAINNET_CHAIN_ID, rpcEnvVar: 'ALCHEMY_RPC_URL_MAINNET' },
  sepolia: { name: 'sepolia', chainId: ARBITRUM_SEPOLIA_CHAIN_ID, rpcEnvVar: 'ALCHEMY_RPC_URL_SEPOLIA' },
};
```

**Apply to call.ts:**
```ts
export const MARKET_TYPES = ['priceTarget', 'spreadVs', 'event'] as const;
export type MarketType = typeof MARKET_TYPES[number];

export const EVENT_SUBTYPES = ['none', 'tvlMilestone', 'volumeFees', 'onchainMetric', 'cexListing', 'tokenLaunch', 'governance', 'protocolMilestone'] as const;
export type EventSubtype = typeof EVENT_SUBTYPES[number];

// Numeric mapping that matches the Solidity enum order in CallRegistry.sol
export const MARKET_TYPE_TO_UINT: Record<MarketType, number> = { priceTarget: 0, spreadVs: 1, event: 2 };
// ... mirrored in the .sol enum
```

---

### 15. `packages/shared/src/hashing/duplicate-hash.ts` (TS mirror of DuplicateHashLib)

**Analog:** `packages/shared/src/constants/usdc.ts` — single-source-of-truth pattern (file-level documentation + cross-language coupling note).

**File header convention** (usdc.ts lines 1-11):
```ts
/**
 * USDC constants — single source of truth for the Call It monorepo.
 *
 * IMPORTANT: This is the ONLY legal location for USDC_E_BRIDGED_DO_NOT_USE.
 * The CI grep guard (usdc-paste in grep-guards.yml) rejects the 0xFF970A61 address
 * ANYWHERE except this file. See CLAUDE.md "What NOT to Use" for context.
 *
 * Source: CLAUDE.md "Pinned Addresses (Arbitrum One Mainnet)"
 * Spec: CALL_IT_SPEC1.md §10.5 — USDC mandate; hardcoded address contract
 * Requirement: SAFETY-13, OPS-22
 */
```

**Apply to duplicate-hash.ts:**
```ts
/**
 * Duplicate-hash bucket computation — TS mirror of DuplicateHashLib.sol.
 *
 * COUPLING: This function MUST produce the same bytes32 output as
 * packages/contracts/src/libraries/DuplicateHashLib.sol compute() for identical
 * inputs. The CI parity test (`packages/shared/__tests__/duplicate-hash-parity.test.ts`)
 * cross-checks via viem encodeAbiParameters + keccak256.
 *
 * Source: RESEARCH Pattern 7 line 819 + Pitfall 12
 * Spec: CALL_IT_SPEC1.md §11.1 (CallRegistry duplicate-hash gate)
 */
import { encodeAbiParameters, keccak256 } from 'viem';

export function dayBucketUtc(unixSeconds: bigint): bigint {
  return (unixSeconds / 86400n) * 86400n;  // Pitfall 12 — floor to UTC day
}

export function computeDuplicateHash(input: {
  marketType: number;
  assetA: bigint;
  metric: bigint;
  targetValue: bigint;
  deadlineDay: bigint;
}): `0x${string}` {
  return keccak256(encodeAbiParameters(
    [{ type: 'uint8' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint64' }],
    [input.marketType, input.assetA, input.metric, input.targetValue, input.deadlineDay]
  ));
}
```

---

### 16. `packages/shared/__tests__/call-gates-parity.test.ts` + `duplicate-hash-parity.test.ts`

**Analog (exact):** `packages/shared/test/usdc.test.ts`

**Vitest shape** (usdc.test.ts lines 1-25):
```ts
import { describe, it, expect } from 'vitest';
import { USDC_ARB_NATIVE, USDC_DECIMALS, USDC_E_BRIDGED_DO_NOT_USE } from '../src/constants/usdc.js';

describe('USDC constants', () => {
  it('USDC_ARB_NATIVE is exactly the canonical native USDC address on Arbitrum One', () => {
    expect(USDC_ARB_NATIVE).toBe('0xaf88d065e77c8cC2239327C5EDb3A432268e5831');
  });
});
```

**Apply to call-gates-parity.test.ts (per D-29):**
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCallSchema } from '../src/validation/call-gates.js';

const matrix = JSON.parse(readFileSync(
  join(__dirname, '../../contracts/test/fixtures/gate-matrix.json'), 'utf-8'
)) as Array<{ name: string; input: Record<string, unknown>; expected: { type: 'revert' | 'pass' | 'event'; selector?: string; name?: string } }>;

describe('createCall gate-matrix parity (D-29)', () => {
  for (const tc of matrix) {
    it(`case: ${tc.name}`, () => {
      const result = createCallSchema.safeParse(tc.input);
      if (tc.expected.type === 'revert') {
        expect(result.success).toBe(false);
        // Map Solidity revert selector to a Zod error code agreed in the fixture
      } else {
        expect(result.success).toBe(true);
      }
    });
  }
});
```

---

### 17. `apps/relayer/src/routes/paymaster-policy.ts`

**Analog (exact — same Fastify+Zod+Redis pattern):** `apps/relayer/src/routes/admin-paymaster.ts`

**Route plugin shape** (admin-paymaster.ts lines 23-65):
```ts
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { iamAuthPreHandler } from '../lib/iam-auth.js';
import { getRedis } from '../lib/redis.js';
import { getLogger } from '../lib/logger.js';

interface PaymasterCapBody { newCapUsdc6: string; }

export async function paymasterAdminRoute(
  app: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> {
  app.patch<{ Body: PaymasterCapBody }>(
    '/admin/paymaster-cap',
    {
      preHandler: iamAuthPreHandler,
      schema: {
        body: {
          type: 'object',
          required: ['newCapUsdc6'],
          properties: { newCapUsdc6: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const { newCapUsdc6 } = request.body;
      // ... business logic
      getLogger().info({ event: 'paymaster_cap_updated', newCapUsdc6 }, 'Paymaster cap updated by operator');
      return reply.status(200).send({ success: true, newCapUsdc6 });
    },
  );
}
```

**Apply to paymaster-policy.ts** (RESEARCH Pattern 4 lines 566-623):
```ts
// apps/relayer/src/routes/paymaster-policy.ts
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { getRedis } from '../lib/redis.js';
import { getLogger } from '../lib/logger.js';

const PolicyRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.enum(['pm_getPaymasterStubData', 'pm_getPaymasterData']),
  params: z.tuple([
    z.object({ sender: z.string().regex(/^0x[a-fA-F0-9]{40}$/), nonce: z.string(), callData: z.string() }),
    z.string(),  // entryPoint
    z.string(),  // chain id (hex)
    z.object({ privyUserId: z.string() }),
  ]),
});

export async function paymasterPolicyRoute(app: FastifyInstance, _opts: FastifyPluginOptions) {
  app.post('/paymaster/policy', async (req, reply) => {
    const parsed = PolicyRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: 'invalid' });
    const { privyUserId } = parsed.data.params[3];
    const count = await getRedis().get(`paymaster:user:${privyUserId}:count`);
    const currentCount = count ? parseInt(count, 10) : 0;
    if (currentCount >= 5) {
      return reply.send({ jsonrpc: '2.0', id: parsed.data.id, error: { code: -32000, message: 'sponsorship-cap-exceeded' } });
    }
    // ... build paymaster signature; DO NOT increment counter here (see D-02 — confirmed-inclusion only)
  });
}
```

**Auth note:** No `iamAuthPreHandler` for `/paymaster/policy` — this endpoint is hit by Alchemy's bundler, not an operator. Authenticate via shared HMAC or vendor-provided signing token instead (Pitfall 14). Use the **same** `internal-test-alert.ts` HMAC pattern for the secret-validation step — see #19 below.

**Register in `apps/relayer/src/index.ts`** (lines 71-75 — extend the existing block):
```ts
await app.register(healthRoute);
await app.register(internalTestAlertRoute);
await app.register(paymasterAdminRoute);
await app.register(allowlistAdminRoute);
// Phase 1 additions:
await app.register(paymasterPolicyRoute);
await app.register(addressBookRoute);
await app.register(withdrawAuthorizeRoute);
await app.register(callsPreflightRoute);
await app.register(callsDupCheckRoute);
await app.register(feedRoute);
await app.register(profileRoute);
await app.register(privyWebhookRoute);
await app.register(onboardingRoute);
```

---

### 18. `apps/relayer/src/routes/{calls-preflight, calls-dup-check, feed, profile, address-book, withdraw-authorize, onboarding}.ts`

**Analog (exact):** `apps/relayer/src/routes/admin-paymaster.ts` (route plugin shape) + `apps/relayer/src/routes/health.ts` (anonymous route shape) — pick per endpoint.

**For routes that need IAM auth (withdraw-authorize is operator-facing; address-book write is user-session-gated via privy JWT):**
- Operator-gated routes → use `preHandler: iamAuthPreHandler` (admin-paymaster.ts line 30).
- Privy-session-gated routes → write a new `privySessionPreHandler` in `apps/relayer/src/lib/privy-auth.ts` modelled on `iam-auth.ts` (lines 27-62): verify Privy JWT via `@privy-io/server-auth` and attach `req.privyUserId`.

**For feed.ts — the 800ms race** (RESEARCH Pattern 11 lines 1054-1091):
```ts
export async function feedRoute(app: FastifyInstance) {
  app.get('/api/feed', async (req, reply) => {
    const cursor = (req.query as any).cursor;
    if (!cursor) {
      const cached = await getRedis().get('feed:firstpage');
      if (cached) return reply.send(JSON.parse(cached));
    }
    const racedResult = await Promise.race([
      querySubgraph(cursor).then(r => ({ source: 'subgraph', data: r })),
      new Promise(resolve => setTimeout(async () => resolve({ source: 'fallback', data: await queryPolledEventsWorker(cursor) }), 800)),
    ]);
    if (racedResult.source === 'fallback') {
      app.log.warn({ event: 'feed_fallback_engaged', cursor }, 'subgraph slow, used polled-events worker');
    }
    if (!cursor) await getRedis().set('feed:firstpage', JSON.stringify(racedResult.data), 'EX', 10);
    return reply.send(racedResult.data);
  });
}
```

**Logging convention** (used throughout admin-paymaster.ts line 53):
```ts
getLogger().info({ event: 'paymaster_cap_updated', newCapUsdc6 }, 'Paymaster cap updated by operator');
```
**Apply universally:** `getLogger().info({ event: '<snake_case_event_name>', ...payload }, '<human_message>')`. Event names enter the Better Stack ingestion grep guards; the structured `event` field is mandatory.

---

### 19. `apps/relayer/src/routes/privy-webhook.ts`

**Analog (exact):** `apps/relayer/src/routes/internal-test-alert.ts` — HMAC-gated POST receiver.

**Source pattern** (internal-test-alert.ts lines 17-34):
```ts
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';

interface TestAlertBody { event: AlertEvent; nonce: string; timestamp: number; }

export async function internalTestAlertRoute(app: FastifyInstance, _opts: FastifyPluginOptions) {
  app.post<{ Body: TestAlertBody }>('/internal/test-alert', async (request, reply) => {
    return syntheticEventHandler(request, reply);
  });
}
```

**Apply to privy-webhook.ts:**
- Verify Privy's webhook signature (HMAC-SHA256 over body + timestamp window, like `synthetic-event-handler.ts`).
- On `auth.linked` event → insert row into `auth_methods (privy_user_id, auth_type, linked_at)` (D-10 + Pitfall D).
- On webhook lag, **never fall back to polling silently** — log `privy_webhook_lag` event and trigger session-bootstrap polling (Pitfall D).

---

### 20. `apps/relayer/src/db/schema.ts` + `db/client.ts` + `drizzle.config.ts`

**Analog (db/client.ts):** `apps/relayer/src/lib/redis.ts` — singleton+memoization pattern.

**Singleton pattern** (redis.ts lines 17-56):
```ts
let _redis: Redis | undefined;
export function getRedis(): Redis {
  if (_redis) return _redis;
  // ... build connection from env
  _redis = new Redis(redisUrl, { maxRetriesPerRequest: 3, enableReadyCheck: true });
  _redis.on('error', (err) => getLogger().warn({ event: 'redis_error', err: err.message }, 'Redis connection error'));
  return _redis;
}
export async function _resetRedisForTesting(): Promise<void> {
  if (_redis) { await _redis.quit().catch(() => undefined); _redis = undefined; }
}
```

**Apply to db/client.ts:**
```ts
// apps/relayer/src/db/client.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getLogger } from '../lib/logger.js';
import * as schema from './schema.js';

let _db: ReturnType<typeof drizzle> | undefined;

export function getDb() {
  if (_db) return _db;
  const url = process.env.POSTGRES_URL!;
  const client = postgres(url, { max: 10, idle_timeout: 20 });
  _db = drizzle(client, { schema });
  return _db;
}
export async function _resetDbForTesting(): Promise<void> {
  // mirror redis.ts pattern
}
```

**For db/schema.ts:** Drizzle table definitions for `address_book`, `auth_methods`, `onboarding_state` per D-08 / D-10 / D-32. RESEARCH "Common Operation 2" lines 1312-1342 provides a template.

**For drizzle.config.ts:** Mirror `apps/web/playwright.config.ts` defineConfig pattern (lines 14-40).

---

### 21. `apps/relayer/src/lib/upstash-counter.ts` (paymaster cap atomic counter)

**Analog (exact — same atomic INCRBY + EXPIRE pattern):** `apps/relayer/src/workers/paymaster-counter.ts`

**Critical pattern excerpt** (paymaster-counter.ts lines 51-72):
```ts
export async function incrementPaymasterSpend(amountUsdc6: bigint): Promise<bigint> {
  const redis = getRedis();
  const key = getDailyKey();

  // INCRBY is atomic — safe for concurrent relayer processes
  const newValue = await redis.incrby(key, amountUsdc6.toString());

  // Set TTL to 25h on first increment; subsequent calls extend if needed
  const currentTtl = await redis.ttl(key);
  if (currentTtl < 0 || currentTtl > COUNTER_TTL_SECONDS) {
    await redis.expire(key, COUNTER_TTL_SECONDS);
  }

  getLogger().info(
    { event: 'paymaster_spend_increment', amountUsdc6: amountUsdc6.toString(), total: newValue },
    'Paymaster spend incremented',
  );
  return BigInt(newValue);
}
```

**Idempotent alert lock** (paymaster-counter.ts lines 113-117):
```ts
const acquired = await redis.set(lockKey, '1', 'EX', ALERT_LOCK_TTL_SECONDS, 'NX');
if (acquired === 'OK') {
  // first crossing today, fire the alert
}
```

**Apply to upstash-counter.ts:** Same INCRBY + EXPIRE pattern, scoped to `paymaster:user:${privyUserId}:count` keys (per-user 5-tx cap, not daily). The 5-tx cap is **lifetime per user**, not daily — so no TTL needed on the per-user key. RESEARCH lines 596-599 + Pattern 4 inclusion-confirmation worker.

---

### 22. `apps/relayer/src/lib/ens-resolver.ts`

**Analog:** `apps/relayer/src/lib/redis.ts` (singleton + cache pattern) + RESEARCH Pattern 12 (verbatim shape).

**Pattern 12 excerpt** (RESEARCH lines 1097-1122):
```ts
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
    return cached === '::null::' ? null : cached;
  }
  try {
    const name = await mainnetClient.getEnsName({ address });
    await redis.set(cacheKey, name ?? '::null::', 'EX', 86400);  // 24h
    return name;
  } catch (err) {
    return null;  // don't cache on RPC failure
  }
}
```

**Apply with redis pattern:** Pull the `redis` instance via `getRedis()` from `apps/relayer/src/lib/redis.ts` (not parameter injection) for production; keep the parameter form for test injection.

---

### 23. `apps/relayer/__tests__/*.test.ts`

**Analog (exact):** `apps/relayer/test/paymaster-admin.test.ts`

**Vitest + Fastify inject + ioredis-mock pattern** (paymaster-admin.test.ts lines 8-89):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    verifyIdToken: vi.fn().mockImplementation(({ idToken }) => {
      if (idToken === 'valid-iam-token') {
        return Promise.resolve({ getPayload: () => ({ sub: 'test-sa@project.iam.gserviceaccount.com' }) });
      }
      return Promise.reject(new Error('Invalid token'));
    }),
  })),
}));

vi.mock('../src/lib/redis.js', () => {
  const RedisMock = require('ioredis-mock');
  const redisMock = new RedisMock();
  return {
    getRedis: () => redisMock,
    pingWithBullMQCompat: vi.fn().mockResolvedValue({ ok: true, failures: [] }),
  };
});

import Fastify from 'fastify';
import { paymasterAdminRoute } from '../src/routes/admin-paymaster.js';

async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(paymasterAdminRoute);
  return app;
}

describe('PATCH /admin/paymaster-cap', () => {
  let app: Awaited<ReturnType<typeof buildTestApp>>;
  beforeEach(async () => {
    app = await buildTestApp();
    const redis = getRedis();
    await (redis as unknown as { flushall(): Promise<string> }).flushall();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/admin/paymaster-cap',
      payload: { newCapUsdc6: '100000000' },
    });
    expect(response.statusCode).toBe(401);
  });
});
```

**Apply to all Phase 1 relayer tests:**
- `vi.mock('google-auth-library', ...)` for routes using `iamAuthPreHandler`
- `vi.mock('../src/lib/redis.js', ...)` for Redis-touching code → ioredis-mock
- `vi.mock('../src/workers/alerts.js', ...)` (per `health.test.ts` lines 51-54) for routes that emit alerts
- `app.inject({ method, url, headers, payload })` for in-process HTTP (no port binding)
- `flushall()` in `beforeEach` for redis isolation between tests

**For db tests (no P0 analog):** Use `pg-mem` or a per-test Postgres docker container; mock the `getDb()` singleton via `vi.mock` identical to the redis mock.

---

### 24. `.github/workflows/phase-1-gates.yml`

**Analog (exact):** `.github/workflows/contracts-test.yml` + `.github/workflows/phase-0-gate.yml`

**Path-filtered trigger pattern** (contracts-test.yml lines 8-16):
```yaml
on:
  push:
    paths:
      - 'packages/contracts/**'
      - '.github/workflows/contracts-test.yml'
  pull_request:
    paths:
      - 'packages/contracts/**'
      - '.github/workflows/contracts-test.yml'

permissions:
  contents: read
```

**Multi-job structure** (contracts-test.yml lines 22-83): one job per pillar (foundry-test, stylus-check, etc.). Apply to Phase 1: separate jobs for `foundry-tests`, `parity-diff` (the D-29 cross-checker), `provider-order-ast-test`, `playwright-smoke`, `relayer-unit-tests`.

**Tag-gated final gate pattern** (phase-0-gate.yml lines 26-37): use `git tag phase-1-complete-*` as the deploy gate.

**Foundry test invocation** (contracts-test.yml lines 32-50):
```yaml
- name: Install Foundry
  uses: foundry-rs/foundry-toolchain@v1

- name: Build contracts
  working-directory: packages/contracts
  run: forge build

- name: Run Foundry tests
  working-directory: packages/contracts
  run: forge test -vv

- name: Verify solc_version pin in foundry.toml
  working-directory: packages/contracts
  run: |
    if ! grep -q 'solc_version = "0.8.30"' foundry.toml; then
      echo "::error::foundry.toml solc_version pin missing or incorrect."
      exit 1
    fi
```

**Apply to phase-1-gates.yml — new parity-diff job:**
```yaml
parity-diff:
  name: Guard — Solidity ↔ Zod call-gates parity (D-29)
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
      with: { submodules: recursive }
    - uses: foundry-rs/foundry-toolchain@v1
    - uses: pnpm/action-setup@v4
      with: { version: 9 }
    - uses: actions/setup-node@v4
      with: { node-version: '22', cache: 'pnpm' }
    - run: pnpm install --frozen-lockfile
    - name: Run Solidity parity test
      working-directory: packages/contracts
      run: forge test --match-contract CallRegistryParityTest -vv
    - name: Run Vitest parity test
      run: pnpm --filter @call-it/shared test -- duplicate-hash-parity.test.ts call-gates-parity.test.ts
    - name: Run parity-diff script
      run: pnpm tsx scripts/parity-diff.ts
```

---

### 25. `scripts/parity-diff.ts`

**No P0 analog** — this is a new cross-checker. Frame on `apps/web/lib/og-fallback-render.ts` for module-level "single source of truth" awareness and `apps/relayer/src/workers/synthetic-event-handler.ts` for the script-style invocation surface.

The script:
1. Reads `packages/contracts/test/fixtures/gate-matrix.json` (source-of-truth)
2. Runs the Foundry test output + Vitest output (both produce JSON reports)
3. Compares per-case: did the Solidity revert selector AND the Zod issue path agree?
4. Exits non-zero on any disagreement; prints a diff table to stderr

---

## Shared Patterns

### Pattern A — Solidity file header (apply to every new `.sol` file)
**Source:** `packages/contracts/src/constants/USDC.sol` lines 1-19

```solidity
// SPDX-License-Identifier: MIT
pragma solidity =0.8.30;
// Source: CLAUDE.md "<section>"
// Spec:   CALL_IT_SPEC1.md §<x.y>
// Requirement: <REQ-ID>, <REQ-ID>
```
- Exact pragma pin `=0.8.30` (CI grep guard fails otherwise — see `.github/workflows/grep-guards.yml` lines 78-108)
- Comment block citing source, spec, REQ-ID

### Pattern B — Solidity USDC consumption (apply to every contract touching USDC)
**Source:** `packages/contracts/src/constants/USDC.sol` lines 17-19

```solidity
import { USDC_ARB_NATIVE } from "./constants/USDC.sol";
// Never inline 0xaf88d065... — always import. The grep guard does not enforce
// this directly, but the parity test fixture and code review do.
```

### Pattern C — Relayer Fastify route plugin (apply to every new route)
**Source:** `apps/relayer/src/routes/admin-paymaster.ts` lines 23-65

```ts
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getRedis } from '../lib/redis.js';
import { getLogger } from '../lib/logger.js';

export async function <name>Route(app: FastifyInstance, _opts: FastifyPluginOptions): Promise<void> {
  app.<method><{ Body: ... }>(
    '<path>',
    { preHandler: <auth>, schema: { body: { ... } } },
    async (request, reply) => {
      // 1. Validate (Zod or Fastify schema)
      // 2. Business logic
      // 3. Structured Pino log: { event: '<snake_case>', ...payload }
      // 4. Reply
    },
  );
}
```

### Pattern D — Vitest mock for Redis-touching code (apply to every relayer test)
**Source:** `apps/relayer/test/paymaster-admin.test.ts` lines 21-30

```ts
vi.mock('../src/lib/redis.js', () => {
  const RedisMock = require('ioredis-mock');
  const redisMock = new RedisMock();
  return {
    getRedis: () => redisMock,
    pingWithBullMQCompat: vi.fn().mockResolvedValue({ ok: true, failures: [] }),
  };
});
```

### Pattern E — Static-source assertion (apply to all anti-drift / Pitfall tests)
**Source:** `apps/web/tests/og-unit.test.ts` lines 60-89 + `packages/shared/test/usdc.test.ts`

```ts
const { readFileSync } = await import('node:fs');
const { join } = await import('node:path');
const source = readFileSync(join(process.cwd(), '<relative/path>'), 'utf-8');
expect(source).not.toContain("display: 'grid'");          // Pitfall 15
expect(source).not.toContain("from 'wagmi'");             // Pitfall 13 — must be '@privy-io/wagmi'
expect(source).not.toContain('callitapp.xyz');            // D-12 — env-var brand only
```

### Pattern F — Zod superRefine cross-field validation (apply to call-gates.ts)
**Source:** `packages/shared/src/schemas/env-config.ts` lines 19-71

```ts
z.object({ /* fields */ })
  .superRefine((data, ctx) => {
    if (<cross-field-condition>) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['<field>'],
        message: '<error message that maps to the contract revert>',
      });
    }
  });
```

### Pattern G — Redis singleton + memo (apply to db/client.ts)
**Source:** `apps/relayer/src/lib/redis.ts` lines 17-56

```ts
let _client: T | undefined;
export function getClient(): T {
  if (_client) return _client;
  _client = buildClient(env);
  _client.on('error', (err) => getLogger().warn({ event: '<svc>_error', err: err.message }, '...'));
  return _client;
}
export async function _resetClientForTesting(): Promise<void> { /* mirror redis.ts */ }
```

### Pattern H — Workspace `package.json` shape (apply to packages/ui/package.json)
**Source:** `packages/shared/package.json`

- `"name": "@call-it/<workspace>"`, `"version": "0.0.1"`, `"private": true`
- `"main"`/`"types"`/`"exports"` pointing at `./src/index.ts` (no build step before consumption)
- `"@call-it/config": "workspace:*"` devDep for shared tsconfig/eslint
- `"@call-it/shared": "workspace:*"` dep where needed
- Scripts: `build` = `tsc --build`, `test` = `vitest run`, `lint` = `<configured>`

### Pattern I — ESLint flat config + scoped custom rule (apply to packages/ui/.eslintrc)
**Source:** `packages/config/eslint/base.js` lines 42-55 + `packages/config/eslint/no-display-grid.js`

Reuse the existing rule module — do **not** copy the rule logic. Extend the `files` glob in `packages/config/eslint/base.js` to add `packages/ui/src/compound/Receipt.tsx` and children.

### Pattern J — GitHub Actions job + path filter (apply to phase-1-gates.yml)
**Source:** `.github/workflows/contracts-test.yml` lines 8-50

- `on.push.paths` + `on.pull_request.paths` for scope
- `permissions: { contents: read }`
- `working-directory:` per job
- `foundry-rs/foundry-toolchain@v1` for Solidity
- `pnpm/action-setup@v4` + `actions/setup-node@v4` (cache: 'pnpm') for TS

---

## No Analog Found

These files have no close Phase 0 match. The planner should:
1. Use the cited RESEARCH.md Pattern as the authoritative shape.
2. Consult the CLAUDE.md "Technology Stack" section for library API surface.
3. Cite the deviation explicitly in the per-plan IMPLEMENTATION.md (so the executor doesn't search the repo expecting a precedent).

| File | Role | Why no analog | Use Instead |
|------|------|---------------|-------------|
| `packages/contracts/script/DeployPhase1.s.sol` | Foundry deploy script | First real deploy script in the repo | Forge book "Deployment scripts" + RESEARCH Pattern 6 constructor args |
| `apps/web/app/new/page.tsx` | New Call form page | First multi-step form in the repo | RESEARCH Pattern 10 (RHF + zodResolver) — full skeleton |
| `apps/web/lib/aa-config.ts` | Alchemy AA bundler config | First ERC-4337 wiring | RESEARCH Pattern 4 + Alchemy `@account-kit/infra` docs |
| `apps/web/lib/relayer-client.ts` | Typed fetch wrapper | First app-layer relayer client | Build on top of native `fetch`; mirror types from `@call-it/shared` |
| `packages/ui/src/primitives/Stamp.tsx` | framer-motion outcome reveal | First framer-motion usage | framer-motion `animate-presence` docs |
| `packages/ui/src/primitives/Tag.tsx` | Tag primitive | First standalone tag/chip | CVA "Common Operation 3" lines 1344-1382 |
| `packages/ui/src/compound/ConvictionBar.tsx` | Radix Slider compound | First Radix integration | Radix Slider docs + neobrutalist styling tokens from tailwind preset |
| `packages/contracts/test/fixtures/gate-matrix.json` | JSON fixture | First contract↔TS fixture | RESEARCH Pattern 9 lines 988-1003 — concrete schema |

---

## Metadata

**Analog search scope:**
- `packages/contracts/src/` (1 contract: USDC.sol) — 2 files scanned
- `packages/contracts/test/` (1 test: USDC.t.sol) — 1 file scanned
- `packages/shared/src/` (constants/, schemas/) — 6 files scanned
- `packages/shared/test/` — 3 files scanned
- `packages/subgraph/src/` — 5 stub mappings scanned
- `packages/config/` (eslint, prettier, tsconfig) — 3 config files scanned
- `apps/web/app/` (layout, page, api/og routes) — 5 files scanned
- `apps/web/lib/` (og-fonts, og-fallback-render) — 2 files scanned
- `apps/web/tests/` (og-fallback specs, og-unit) — 4 files scanned
- `apps/relayer/src/routes/` (health, admin-paymaster, admin-allowlist, internal-test-alert) — 4 files scanned
- `apps/relayer/src/lib/` (redis, logger, iam-auth, secret-manager, kms-signer, telegram, der-to-viem-hex) — 7 files scanned
- `apps/relayer/src/workers/` (paymaster-counter, alerts, polled-events-fallback, synthetic-event-handler, cex-heartbeat, stylus-deactivation-watcher) — 6 files scanned
- `apps/relayer/test/` — 12 files scanned
- `.github/workflows/` — 8 workflows scanned

**Total files scanned:** 62

**Pattern extraction date:** 2026-05-22

**Note on `packages/og-fallback` workspace:** The Phase 0 CONTEXT hint referenced `packages/og-fallback` as an analog template, but Phase 0 actually shipped OG inside `apps/web/app/api/og/` + `apps/web/lib/` (no standalone workspace). For `packages/ui` workspace structure, use `packages/shared` (Pattern H) as the analog instead.

---

## PATTERN MAPPING COMPLETE
