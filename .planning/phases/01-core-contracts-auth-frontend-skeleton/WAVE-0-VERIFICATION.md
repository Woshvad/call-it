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

**Status: REQUIRES OPERATOR VERIFICATION**

RESEARCH Open Question 1: does the Alchemy bundler use standard ERC-7677 `pm_getPaymasterStubData` OR `alchemy_requestGasAndPaymasterAndData` when a gas policy with callback URL is enabled?

**Operator task:** Open https://www.alchemy.com/docs/wallets/reference/aa-sdk/core/functions/erc7677Middleware and the gas-policy dashboard. Check which RPC method fires when a gas policy is enabled with a policy URL.

**Background (from RESEARCH):** The Alchemy aa-sdk uses BOTH methods depending on configuration. ERC-7677 is the standard; `alchemy_requestGasAndPaymasterAndData` is Alchemy's custom extension. Plan 07's `/paymaster/policy` route shape depends on which method the bundler actually calls when a gas policy is configured pointing at our relayer endpoint.

Update this file with:
- Which method is used: ERC-7677 (`pm_getPaymasterStubData` / `pm_getPaymasterData`) OR Alchemy custom
- The exact request/response shape if Alchemy custom
- "Plan 07 UNBLOCKED" or "Plan 07 requires schema update" based on the finding

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
