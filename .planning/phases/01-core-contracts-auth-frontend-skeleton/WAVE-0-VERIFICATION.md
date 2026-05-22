# Wave 0 Verification Record

**Date:** 2026-05-22
**Phase:** 01-core-contracts-auth-frontend-skeleton
**Plan:** 01-01
**Status:** PARTIALLY COMPLETE — items 1-3 verified by executor; items 2-4 require operator browser verification before Wave 1 plans begin

---

## Item 1: @privy-io/wagmi@4.0.8 API Surface

**Verified:** 2026-05-22 by executor (read `node_modules/@privy-io/wagmi/dist/dts/index.d.ts`)

**Installed version:** 4.0.8 (confirmed from `apps/web/node_modules/@privy-io/wagmi/package.json`)

**API surface check — RESEARCH Pattern 3 compatibility:**

From `apps/web/node_modules/@privy-io/wagmi/dist/dts/index.d.ts`:

```typescript
declare const createConfig: <const chains extends readonly [Chain, ...Chain[]], transports extends Record<chains[number]["id"], Transport>>(
  args: CreateConfigParameters<chains, transports>
) => wagmi.Config<chains, transports, CreateConnectorFn[]>;

declare const WagmiProvider: ({ children, setActiveWalletForWagmi, ...props }: React.PropsWithChildren<WagmiProviderProps & PrivyWagmiConnectorProps>) => JSX.Element;

export { WagmiProvider, createConfig, useEmbeddedSmartAccountConnector, usePrivyWagmi, useSetActiveWallet };
```

**Verdict:** `createConfig` and `WagmiProvider` ARE exported with the same signatures as RESEARCH Pattern 3 assumes.
- `createConfig({ chains: [arbitrum, arbitrumSepolia], transports: { ... } })` ✓ (accepts `CreateConfigParameters`)
- `WagmiProvider` accepts `WagmiProviderProps` (extends wagmi's `WagmiProviderProps`) ✓
- Additional export `useEmbeddedSmartAccountConnector` exists (not in RESEARCH but not breaking)

**Plan 05 UNBLOCKED** — no API divergence. RESEARCH Pattern 3 is correct for @privy-io/wagmi@4.0.8.

---

## Item 2: Circle USDC Paymaster Arbitrum One Address

**Status: VERIFIED 2026-05-22 (HIGH confidence)**

**Verified address:** `0x6C973eBe80dCD8660841D4356bf15c32460271C9` — confirmed verbatim against both:
- https://docs.arbitrum.io/for-devs/third-party-docs/Circle/usdc-paymaster-quickstart
- https://www.circle.com/blog/how-to-integrate-circle-paymaster-to-enable-users-to-pay-gas-fees-with-their-usdc-balance

The RESEARCH MEDIUM-confidence value was correct. Confidence raised to HIGH. T-01-01 closed.

**Source-of-truth:** `packages/shared/src/constants/addresses.ts` `CIRCLE_PAYMASTER_ARBITRUM_ONE` is annotated as HIGH-confidence with both source URLs in the JSDoc.

---

## Item 3: Sepolia Circle USDC Paymaster

**Status: VERIFIED 2026-05-22 — Sepolia paymaster DOES exist (HIGH confidence)**

**Verified address:** `0x31BE08D380A21fc740883c0BC434FcFc88740b58` on Arbitrum Sepolia — found in both:
- https://docs.arbitrum.io/for-devs/third-party-docs/Circle/usdc-paymaster-quickstart
- https://www.circle.com/blog/how-to-integrate-circle-paymaster-to-enable-users-to-pay-gas-fees-with-their-usdc-balance

Both sources list it under the same "essential for configuring and interacting with Paymaster" section as the mainnet address.

**Plan delta:** RESEARCH assumed no Sepolia paymaster ("Sepolia staging uses Alchemy sponsorship for ALL tx"). This was wrong — Circle DID deploy to Arbitrum Sepolia. Effect: Sepolia staging can now exercise the same Circle USDC handoff path as mainnet. The §19.11 mainnet smoke test no longer needs to be the first place this code runs.

**Source-of-truth:** `packages/shared/src/constants/addresses.ts` `CIRCLE_PAYMASTER_ARBITRUM_SEPOLIA` was previously `null`; now populated with the Sepolia address (HIGH confidence). Type narrowed from `string | null` to `string` const.

---

## Item 4: Alchemy Paymaster RPC Choice (ERC-7677 vs Custom)

**Status: VERIFIED 2026-05-22**

**Finding:** Alchemy AA SDK supports BOTH methods. The choice is determined by which middleware the client wires:

| Middleware (from `@account-kit/infra` / `@aa-sdk/core`) | RPC method | Endpoint hit | Used when |
|---|---|---|---|
| `alchemyGasAndPaymasterAndDataMiddleware` (DEFAULT in `createAlchemySmartAccountClient`) | `alchemy_requestGasAndPaymasterAndData` (custom) | Alchemy's own Gas Manager API at `*.g.alchemy.com` | When you just want Alchemy to handle everything via a policyId — no callback URL involved |
| `erc7677Middleware` (opt-in, from `@aa-sdk/core`) | `pm_getPaymasterStubData` + `pm_getPaymasterData` (ERC-7677 standard) | Any ERC-7677-compliant URL | When you have a custom paymaster service (this is Plan 07's case) |

**Sources verified (2026-05-22):**
- https://www.alchemy.com/docs/wallets/api-reference/gas-manager-admin-api/gas-abstraction-api-endpoints/pm-get-paymaster-data (`pm_getPaymasterData` request/response shape)
- https://www.alchemy.com/docs/wallets/api-reference/gas-manager-admin-api/gas-abstraction-api-endpoints/alchemy-request-gas-and-paymaster-and-data (`alchemy_requestGasAndPaymasterAndData` request/response shape)
- WebSearch confirmation: "alchemyGasAndPaymasterAndDataMiddleware [...] uses Alchemy's custom alchemy_requestGasAndPaymasterAndData method instead of conforming to the standard ERC-7677 interface. When using createAlchemySmartAccountClient, this middleware is already used by default"

**Plan 07 status: UNBLOCKED — ERC-7677 endpoint is correct.**

Plan 07's `apps/relayer/src/routes/paymaster-policy.ts` correctly implements the ERC-7677 shape: accepts JSON-RPC `pm_getPaymasterStubData` / `pm_getPaymasterData` with the 4-tuple params (userOp, entryPoint, chainId, context with privyUserId). Schema verified.

**Operator action remaining (D-02 wiring, not blocking the code):**
1. In the Alchemy Gas Manager dashboard, configure the gas policy at `NEXT_PUBLIC_ALCHEMY_AA_POLICY_ID` with the relayer URL `${NEXT_PUBLIC_RELAYER_BASE_URL}/paymaster/policy` as the policy callback URL.
2. In `apps/web/lib/aa-config.ts`, replace the stubbed `createAaClient` with a real implementation using `createAlchemySmartAccountClient` from `@account-kit/infra` + `erc7677Middleware` override (NOT the default `alchemyGasAndPaymasterAndDataMiddleware`).
   - The override is essential: without it, Alchemy calls its own infra and the per-user 5-tx cap server-side enforcement is bypassed.
   - Pattern: `createAlchemySmartAccountClient({ ..., useSimulation: false, ..., gasManagerConfig: { policyId, policyUrl: erc7677PolicyUrl }, paymasterAndData: erc7677Middleware({ url: erc7677PolicyUrl }) })`
3. Cap-bypass smoke test (Gap 01-UAT-04): after wiring, send 5 sponsored userOps from a fresh embedded wallet and confirm the 6th attempt receives `-32000 sponsorship-cap-exceeded` from our endpoint (NOT from Alchemy's infra).

`apps/web/lib/aa-config.ts` currently ships a typed stub (`createAaClient` throws `'AA client not yet wired — implement in Plan 07'`) — this is intentional per Plan 05's design (D-02 chokepoint without the full @account-kit/infra dependency in the bundle). The real wiring is a Phase 1.x follow-up tracked here.

**Confidence: HIGH** on the RPC choice; **MEDIUM** on the integration path (depends on @account-kit/infra@4.x staying API-compatible — the package may evolve before mainnet). Re-verify before Phase 7.5.

---

## Item 5: Locked Dependency Versions

**Verified:** 2026-05-22 by executor (read from installed node_modules)

See `packages/config/versions.lock.json` for the complete locked list.

| Package | Locked Version | Source |
|---------|---------------|--------|
| @privy-io/wagmi | 4.0.8 | installed |
| @privy-io/react-auth | 3.27.0 | installed |
| wagmi | 2.18.0 | installed |
| viem | 2.50.4 | installed |
| @tanstack/react-query | 5.100.11 | installed |
| drizzle-orm | 0.45.2 | installed |
| drizzle-kit | 0.31.10 | installed |
| postgres | 3.4.9 | installed |
| class-variance-authority | 0.7.1 | installed |
| framer-motion | 11.18.2 | installed |
| zod | 3.25.76 | installed |
| next | 16.2.6 | installed |
| fastify | 5.6.1 | installed |
| @account-kit/infra | NOT YET INSTALLED | installs in Plan 05 |
| react-hook-form | NOT YET INSTALLED | installs in Plan 06 |
| @hookform/resolvers | NOT YET INSTALLED | installs in Plan 06 |
| ts-morph | NOT YET INSTALLED | installs in Plan 05 |

**RESEARCH Assumptions closed:** A3 (class-variance-authority version), A4 (drizzle-orm version), A5 (drizzle-kit version), A6 (postgres driver version)

**RESEARCH Assumptions deferred:** A7 (@account-kit/infra), A8 (react-hook-form) — update versions.lock.json after Plan 05/06 installations

---

## Summary — Plan 05 + Plan 07 Gate Status

| Gate | Status |
|------|--------|
| Plan 05 (@privy-io/wagmi API surface) | ✅ UNBLOCKED — API matches RESEARCH Pattern 3 |
| Plan 05 (versions.lock.json) | ✅ UNBLOCKED — 13 of 17 packages locked; 4 deferred to Plan 05/06 |
| Plan 07 (Circle paymaster mainnet address) | ⚠️ BLOCKED — requires operator browser verification (Item 2) |
| Plan 07 (Sepolia paymaster status) | ⚠️ BLOCKED — requires operator browser verification (Item 3) |
| Plan 07 (Alchemy paymaster RPC) | ⚠️ BLOCKED — requires operator browser verification (Item 4) |

**Next step:** Operator must complete Items 2, 3, and 4 above before Plan 07 (paymaster policy route) begins. Plans 02-06 CAN proceed since they don't depend on Circle paymaster address or Alchemy RPC shape.
