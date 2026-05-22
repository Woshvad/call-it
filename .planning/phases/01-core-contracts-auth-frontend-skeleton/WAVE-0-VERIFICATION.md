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

**Status: REQUIRES OPERATOR VERIFICATION**

RESEARCH recorded MEDIUM-confidence address: `0x6C973eBe80dCD8660841D4356bf15c32460271C9`

**Operator task:** Open https://docs.arbitrum.io/for-devs/third-party-docs/Circle/usdc-paymaster-quickstart in a browser. Copy the documented Arbitrum One paymaster address verbatim.

- If the address matches `0x6C973eBe80dCD8660841D4356bf15c32460271C9` → update this file with: "Confirmed at YYYY-MM-DD"
- If the address differs → update `packages/shared/src/constants/addresses.ts` to add `CIRCLE_PAYMASTER_ARBITRUM_ONE = <new_addr>` and update `NEXT_PUBLIC_CIRCLE_PAYMASTER_ADDRESS` default value, then update this file.

**Placeholder in source:** `packages/shared/src/constants/addresses.ts` has `CIRCLE_PAYMASTER_ARBITRUM_ONE` commented with the RESEARCH value — DO NOT treat this as verified until the browser check is done.

---

## Item 3: Sepolia Circle USDC Paymaster

**Status: REQUIRES OPERATOR VERIFICATION**

RESEARCH noted: "no Sepolia paymaster documented — likely mainnet-only".

**Operator task:** On the same Arbitrum docs page (Item 2), search for "Sepolia" or "testnet paymaster". Also check https://www.circle.com/blog/how-to-integrate-circle-paymaster-to-enable-users-to-pay-gas-fees-with-their-usdc-balance

**Current plan (from RESEARCH):** If no Sepolia paymaster exists:
- Sepolia staging uses Alchemy sponsorship for ALL tx (no Circle paymaster on Sepolia)
- Circle USDC handoff is verified only on the §19.11 mainnet smoke test
- Plan 07 implements Circle USDC handoff mainnet-only

Update this file with the result.

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
