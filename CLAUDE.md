<!-- GSD:project-start source:PROJECT.md -->
## Project

**Call It**

Call It is a social prediction product for crypto-native users who want to build a public, permanent, verifiable reputation for being right. Users stake USDC on calls (price targets, relative performance, future events), receive a permanent onchain receipt, and other users can follow, fade, challenge (1v1), or quote-call them. Settled calls produce shareable "CALLED IT" / "LOUD AND WRONG" / "CONTRARIAN HIT" receipts. The product is **person-first** — every call is a public commitment tied to a named reputation, filling the gap between accountability-free Crypto Twitter and anonymous-position Polymarket.

**Core Value:** **Every call is permanent, public, and tied to identity.** If everything else fails, the receipt — created, settled, and shared — must be unfakeable, undeletable, and visually unmistakable. That is the entire product.

### Constraints

- **Network:** Arbitrum mainnet — hardcoded; not multi-chain in v1
- **Currency:** USDC on Arbitrum — hardcoded address in every transfer path
- **Tech stack — contracts:** Solidity `^0.8.24` (pinned, not `0.8+`) + Rust/Stylus for the reputation scoring engine behind a transparent proxy
- **Tech stack — frontend:** Next.js (App Router) + React + Privy for auth/embedded wallets + wagmi/viem for chain interactions + Tailwind for styling
- **Tech stack — backend:** Node.js + Fastify, deployed on Railway or Fly.io. Hosts the relayer (oracle queries, signed submissions, CEX scrapers, OG image generation via Satori or @vercel/og)
- **Indexer:** The Graph subgraph from day 1 as the primary event source; cron-polled events as fallback during subgraph deploy
- **Safety caps:** $100 max stake per call, $5,000 TVL cap initial (owner-raisable up to $100K), $5 min stake, $1 min follow/fade position
- **Settlement fees:** 1.0% protocol + 0.4% creator (Model B for exited callers) + 0.3% LP = 1.7% total extraction at settlement; $10 USDC flat market creation fee
- **Pyth confidence:** ≤ 0.5% of price (`confidence × 200 <= price`); 30 retries × 60s before dispute window
- **Settlement SLA:** 24h 30m maximum for normal flow; `forceSettle` escape hatch unlocks at expiry + 7 days
- **Audit-ready patterns:** Checks-Effects-Interactions, ReentrancyGuard on USDC transfer paths, no `delegatecall` to user-controlled addresses, hardcoded USDC address gate
- **Sepolia staging gate:** ≥48h on Arbitrum Sepolia with seeded calls/follows/settles/exits/challenges/disputes before mainnet deploy — non-optional
- **Post-deploy smoke test:** 20-minute checklist per §19.11 mandatory before public announcement
- **Stylus build cutoff:** 48 hours before demo — if Rust + Stylus path not working, swap to Solidity baseline in same proxy slot; pitch "Stylus in production roadmap"
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## TL;DR — One-line Verdicts
| Spec choice | Verdict | One-line reason |
|---|---|---|
| Arbitrum One mainnet | **Validates** | Still the right L2 for sub-cent fees + Stylus + 250ms blocks. |
| Solidity `^0.8.24` | **Validates with caveat** | Pin `0.8.30` instead. Avoid `0.8.28–0.8.33` IR storage-clearing bug (fixed in `0.8.34`). |
| Rust / Stylus reputation engine | **Validates** | Stylus SDK is at `0.10.7` (May 2026); production-ready, with active OZ ecosystem support. Keep the 48h fallback. |
| Privy (auth + embedded wallets) | **Validates** | `@privy-io/react-auth@3.27.0` is current; `@privy-io/wagmi@^1.x` is required for wagmi v2. |
| wagmi + viem | **Validates** | `wagmi@2.18.0`+ / `viem@2.50.4`+ — fully App-Router-compatible. |
| Next.js App Router | **Validates** | `next@16.2.6`. Use Node runtime for OG (not edge) — Vercel's 2026 recommendation. |
| Node.js + Fastify on Railway/Fly.io | **Validates** | `fastify@5.6.1`. Right call vs Vercel functions for the 30-min Pyth retry loop and CEX scrapers. |
| Satori / @vercel/og | **Validates** | `@vercel/og@0.11.1`. Stay on Node runtime; edge runtime has resvg-wasm bundling pain. |
| The Graph subgraph | **Validates with re-direction** | Hosted Service was sunset June 12, 2024. Use Subgraph Studio → publish to Decentralized Network on Arbitrum. `graph-cli@0.98.1`. |
| Pyth Network | **Validates** — all 25 spec'd feeds confirmed | Contract `0xff1a0f4744e8582DF1aE09D5611b887B6a12925C` on Arbitrum One. |
| Native USDC on Arbitrum | **Validates** | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` — **not** the bridged USDC.e. ERC-2612 permit supported. |
| Alchemy NFT API (replaces Reservoir) | **Validates** | Right call; Reservoir's NFT API is gone. Verify each of the 6 collections via `getFloorPrice` before deploy. |
| DefiLlama API | **Validates** | Free tier, no auth, base URL `https://api.llama.fi`; yields at `https://yields.llama.fi`. |
| Snapshot + Tally for governance | **Validates** | `@snapshot-labs/snapshot.js@0.14.21`; Tally via Tally GraphQL API (no official npm SDK — query the GraphQL endpoint directly). |
| Transparent proxy for StylusScoreEngine | **Validates with note** | Spec is correct for v1 (single owner, want admin separated from logic). UUPS is what OZ Stylus actually ships in `openzeppelin-stylus@0.3.0` though, so the build will likely use UUPS in practice unless a custom transparent proxy is written. Either is acceptable; flag for executor. |
## Recommended Stack — Pinned Versions
### Smart Contracts (Solidity)
| Technology | Version | Purpose | Why |
|---|---|---|---|
| **Solidity compiler** | `0.8.30` (pin exact, not `^0.8.24`) | Source language for CallRegistry, FollowFadeMarket, ChallengeEscrow, SettlementManager, ProfileRegistry | `0.8.30` is the current Pectra-aware release with `evm-version: prague` default. **Avoid `0.8.28–0.8.33`** — high-severity IR pipeline bug clears wrong storage/transient slots, fixed in `0.8.34`. The spec pins `^0.8.24` which floats into that danger zone if not constrained. Recommend `=0.8.30` (pre-bug) **or** `=0.8.34+` (bug fixed). |
| **OpenZeppelin Contracts** | `5.6.1` | ReentrancyGuard, Ownable2Step, ERC1967Proxy, TransparentUpgradeableProxy, IERC20, SafeERC20 | v5 is the post-2023 modernized line. Min Solidity 0.8.20 — compatible. Ownable2Step over Ownable for the single-owner-key sensitivity. |
| **OpenZeppelin Contracts-Upgradeable** | `5.6.1` | Only required if a Solidity-implementation is deployed behind a proxy. Not needed for the bulk of v1 contracts (they are non-upgradeable per §10.8). | Use only for the **Solidity-baseline fallback** that goes into the StylusScoreEngine proxy slot at the 48-hour cutoff. |
| **Foundry** | nightly (last stable: `v1.x`, May 2026) | Build, test, fuzz, deploy | Forge/Cast/Anvil. Use `forge-std ≥1.9.5` if pairing with `openzeppelin-foundry-upgrades`. |
| **openzeppelin-foundry-upgrades** | latest | Deployment + upgrade safety validation | Optional but recommended for the StylusScoreEngine proxy admin flow. Catches storage-layout collisions before they cost real money. |
| **Hardhat** | `2.x` (peer with Foundry via `@nomicfoundation/hardhat-foundry`) | Optional — script-heavy deploy workflows | Skip unless the team prefers JS-side scripting. Foundry alone is sufficient. |
### Smart Contracts (Rust / Stylus)
| Technology | Version | Purpose | Why |
|---|---|---|---|
| **stylus-sdk** | `0.10.7` (May 19, 2026) | The StylusScoreEngine Rust implementation | The current SDK with stable workspace support, type-safe cross-contract calls via `#[public]` traits, and auto reentrancy cache flushing. Released ahead of the project so this is the right baseline. |
| **cargo-stylus** | `0.6.3` (Aug 20, 2025) | CLI: build, check, deploy, activate, verify | Standard install: `cargo install --force cargo-stylus` then `rustup target add wasm32-unknown-unknown`. |
| **openzeppelin-stylus** | `0.3.0` (Sep 10, 2025) — **alpha line tracking 0.4.x** for UUPS proxy | Stylus-side primitives — UUPSUpgradeable, ERC1967Proxy, ERC20 helpers | Pinned by exact-equals `=0.3.0` in spec context. The crate is on the alpha side for some primitives — flag for the executor. UUPS is the **only** proxy pattern OZ has shipped natively in Stylus form so far; a transparent proxy would require either (a) Solidity proxy in front of Stylus implementation (workable, this is what most teams do), or (b) custom Rust. **Recommendation:** keep the spec's transparent-proxy pattern but **front it with a Solidity `TransparentUpgradeableProxy`** pointing at the Stylus implementation. This is the path of least resistance and matches the spec's intent without forcing a custom Rust proxy. |
| **Motsu** | latest (OZ Stylus testing framework) | Unit testing Stylus contracts in Rust without a fork | Use alongside `cargo stylus check` for end-to-end fast feedback. |
| **arbos-foundry** (optional) | Feb 2026 release | Native Stylus integration testing in Foundry | iosiro's fork lets `arbos-forge test` execute Stylus WASM natively — no network fork needed. Worth evaluating if Solidity↔Stylus cross-contract testing becomes a bottleneck. |
| **Rust toolchain** | `stable` + `wasm32-unknown-unknown` target | Compiling Stylus contracts to WASM | Stable Rust is sufficient; no nightly required. |
### Frontend (Next.js + React + Privy + wagmi)
| Technology | Version | Purpose | Why |
|---|---|---|---|
| **Next.js** | `16.2.6` (App Router) | Frontend framework + SSR + OG image hosting | App Router is the current default. Pages-router examples in the wild are stale — ignore them. Use the `app/Providers.tsx` pattern with `'use client'` at the top of the provider tree (required for Privy/wagmi context providers). |
| **React** | `19.x` | Component library | Comes bundled with Next.js 16; nothing special. |
| **@privy-io/react-auth** | `3.27.0` (May 20, 2026) | Auth, embedded wallets, OAuth (Google/Twitter), multi-auth linking, paymaster wiring, wallet export | Current line; v3 introduced multi-HD-embedded-wallet support, `useLinkWithSiws`, and removed deprecated v2 fields. **Critical:** the v3 migration is non-trivial if any older tutorial is followed — use the official 3.x docs only. |
| **@privy-io/wagmi** | `1.32.5` | Wagmi v2 connector for Privy embedded wallets | **Not** `@privy-io/wagmi-connector` (that one is v1-only — deprecated for this project). Import `createConfig` and `WagmiProvider` from `@privy-io/wagmi`, **not** from `wagmi` directly. The provider order is fixed: `<PrivyProvider><QueryClientProvider><WagmiProvider>{children}</WagmiProvider></QueryClientProvider></PrivyProvider>`. |
| **@privy-io/server-auth** | latest | Server-side OAuth proof verification for the relayer that posts ProfileRegistry social-link updates | Required because the spec's §9.8 linking flow has a server validating the OAuth proof before submitting onchain. |
| **wagmi** | `2.18.0` (latest as of May 2026: `2.18.x`) | React hooks for wallet interaction | v2 is the current line. v1 examples are stale. Hooks: `useAccount`, `useReadContract`, `useWriteContract`, `useWaitForTransactionReceipt`. |
| **viem** | `2.50.4` (May 19, 2026) | Low-level Ethereum client | Replaces ethers.js for new projects. Faster, tree-shakable, TypeScript-first. Pair with wagmi v2. |
| **@tanstack/react-query** | `5.100.11` | Required peer dep for wagmi v2 | Wagmi v2 mandates v5+ of react-query. |
| **siwe** | `3.0.0` | SIWE message construction & verification | For the Connect-Wallet path. Privy handles SIWE flow if you use `loginWithSiwe`, but a custom flow may want this lib directly. |
| **Tailwind CSS** | `3.4+` | Styling (per spec §14.6 neobrutalist treatment) | Standard. Pair with the spec's color tokens (`#09090E`, `#E8F542`, etc.) in `tailwind.config.ts`. |
| **@farcaster/auth-kit** | `0.8.2` | Sign In With Farcaster for the optional Farcaster-link path (§9.3, §9.4) | The AuthKitProvider needs an OP-mainnet RPC URL, a `domain`, and a `siweUri`. Wrap below PrivyProvider. |
| **@farcaster/auth-client** | latest | Framework-agnostic fallback (server-side use in the relayer) | For the server-side Farcaster proof verification, mirror of @privy-io/server-auth's role for Twitter. |
### Backend (Node.js + Fastify Relayer + OG service)
| Technology | Version | Purpose | Why |
|---|---|---|---|
| **Node.js** | `22.x LTS` (or `24.x` current if all deps support) | Backend runtime | Both LTS lines support `@vercel/og@0.11.1`, `fastify@5.6.1`, and the Stylus SDK toolchain. |
| **Fastify** | `5.6.1` | HTTP server framework | Right call vs Express (faster, better TypeScript, schema validation). |
| **TypeScript** | `5.6+` | Type safety across frontend + backend | Standard. |
| **@vercel/og** | `0.11.1` (May 18, 2026) | OG image rendering (§16 — Live, Settled, Duel Settled, Caller Exited, Fallback variants) | Wraps `satori@0.26.0` + `resvg-wasm`. Use the **Node runtime, not edge** — Vercel's official 2026 recommendation; edge has `resvg-wasm` bundling pain that hasn't been solved cleanly outside Next.js's built-in `next/og` adapter. |
| **satori** | `0.26.0` | The HTML→SVG renderer underneath @vercel/og | Direct use only if doing custom SVG pipeline. Supports `display: flex` only — **`display: grid` does not work**. Plan all 5 card variants as flexbox. |
| **alchemy-sdk** | `3.6.5` | NFT API (`getFloorPrice`, `getNFTSales`) + indexed token data | The successor source after Reservoir's October 2025 sunset. Free-tier rate limit is 330 req/sec on v2 endpoints — sufficient for the spec's 5-minute polling interval. |
| **@pythnetwork/pyth-sdk-solidity** | `4.3.1` | Solidity-side `IPyth` interface + price decoding | Use `getPriceNoOlderThan(priceId, 60)` per spec §13.1. |
| **@pythnetwork/hermes-client** | `3.1.0` | Off-chain fetch of Pyth price-update VAAs to push on-chain at settlement time | Required for Pyth's pull-oracle model — the relayer fetches an update VAA from Hermes, then calls `updatePriceFeeds()` on the on-chain Pyth contract before reading. |
| **ethers** | `6.16.0` (use sparingly) | Alternative to viem for backend if a lib's existing tooling demands ethers | Prefer viem for new server code; ethers only for legacy library compat. |
| **viem (server-side)** | `2.50.4` | Backend chain reads/writes from the relayer | Same lib as frontend — single dependency surface. Use `createWalletClient` with a private key from env for relayer signing. |
| **@snapshot-labs/snapshot.js** | `0.14.21` | Read Snapshot proposal state for §13.5 | Lightweight, well-maintained. |
| **Tally GraphQL** | direct fetch via `fetch()` or `graphql-request` | Read Tally proposal state for §13.5 | No official Tally SDK on npm. Endpoint: `https://api.tally.xyz/query`. API key required (free tier sufficient). |
| **playwright** or **puppeteer** | latest | CEX listing-page scraping for §13.6 | Pick one. Playwright preferred for 2026 (better Chromium stability). Run headless. **Per-exchange scrapers must be modular** — exchange announcement page structures change without warning; isolate selectors per exchange. |
| **pino** | `9.x` | Structured logging | Pairs with Fastify natively. Required for the spec's structured-logging mandate. |
| **bullmq** | latest | Job queue for the 30-min Pyth retry loop, NFT TWAP polling, CEX scrapers | Redis-backed. The 30-retry × 60s Pyth pattern fits naturally as a delayed-job queue. |
| **redis** (server, not lib) | `7.x` | bullmq backing store + cache for DefiLlama responses | Cheap on Railway/Fly.io. |
### Indexing (The Graph)
| Technology | Version | Purpose | Why |
|---|---|---|---|
| **The Graph — Subgraph Studio** (dev) → **Decentralized Network** on Arbitrum (production) | n/a | Indexed event source for the frontend feed, leaderboard, profile pages, "From your X" cross-references | **The Graph Hosted Service was sunset on June 12, 2024.** All new subgraphs deploy to Studio, then publish to the Decentralized Network. Free tier: 100,000 queries/month; then $4 per 100K queries (some sources say $2 — verify on the pricing page at deploy time). |
| **@graphprotocol/graph-cli** | `0.98.1` (May 18, 2026) | Local dev: `graph init`, `graph codegen`, `graph build`, `graph deploy` | Standard. |
| **@graphprotocol/graph-ts** | `0.38.2` | AssemblyScript types & helpers for the subgraph mappings | Pinned by graph-cli compatibility. |
| **AssemblyScript** | as pinned by graph-cli | Mapping language | Still the standard; no production alternative in 2026. Quirks: no `null` for value types, no closures, limited string ops. Plan mapping logic to be flat. |
### Deployment / Infrastructure
| Technology | Purpose | Notes |
|---|---|---|
| **Railway** or **Fly.io** | Relayer + OG service host | Either works. Fly.io has stronger global-region story; Railway is simpler to operate. Both can host the long-running 30-min Pyth retry loop and CEX scrapers (Vercel functions cannot). |
| **Vercel** | Frontend host | Standard for Next.js. Use the Node runtime for the OG endpoint, not edge. |
| **Cloudflare CDN** or **Vercel Edge Cache** | OG image cache | Per §16, cards are cached on CDN with state-change invalidation. Either works. |
| **Alchemy** | Arbitrum RPC + NFT API + (optional) ERC-4337 bundler + paymaster | One vendor for chain reads, NFT data, and account abstraction. Convenient. Free tier sufficient for hackathon scale. |
| **Telegram Bot API** | Operator alerting per §10.7 paymaster 80%-cap alert + settlement-stuck alerts | Lightweight, free. |
| **Pyth Hermes** | Off-chain Pyth update VAA endpoint | Free, public. |
| **Etherscan / Arbiscan** | Contract verification + manual debugging | Get an Arbiscan API key for `forge verify-contract`. Free. |
## Pinned Addresses (Arbitrum One Mainnet)
| Contract | Address | Source |
|---|---|---|
| **Native USDC** (Circle) | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | Arbiscan token page; Circle blog post; Arbitrum docs |
| **Bridged USDC.e** (DO NOT USE) | `0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8` | Listed for negative-test only |
| **Pyth Price Feed Contract** | `0xff1a0f4744e8582DF1aE09D5611b887B6a12925C` | Pyth docs/contract-addresses/evm |
| **Pyth on Arbitrum Sepolia** | `0x4374e5a8b9C22271E9EB878A2AA31DE97DF15DAF` | Pyth docs |
## Pyth Feed Catalogue — Verified Against Hermes API (2026-05-21)
| Coin | Symbol | Feed ID (bytes32, no 0x prefix) | Notes |
|---|---|---|---|
| BTC | Crypto.BTC/USD | `e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43` | Standard |
| ETH | Crypto.ETH/USD | `ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace` | Standard |
| SOL | Crypto.SOL/USD | `ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` | Standard |
| ARB | Crypto.ARB/USD | `3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5` | Standard |
| OP | Crypto.OP/USD | `385f64d993f7b77d8182ed5003d97c60aa3361f3cecfe711544d2d59165e9bdf` | Standard |
| POL | Crypto.POL/USD | `ffd11c5a1cfd42f80afb2df4d9f264c15f956d68153335374ec10722edd70472` | "Polygon Ecosystem Token" — POL replaced MATIC in 2024. **Use POL feed, not MATIC.** Hermes returns no MATIC/USD feed. Update the spec's reference. |
| MATIC | (none) | — | **Deprecated by Polygon Labs in 2024.** Map to POL above. |
| MNT | Crypto.MNT/USD | `4e3037c822d852d79af3ac80e35eb420ee3b870dca49f9344a38ef4773fb0585` | Mantle |
| UNI | Crypto.UNI/USD | (verify before deploy) | Standard major — Pyth has it; ID not re-fetched here |
| LINK | Crypto.LINK/USD | (verify before deploy) | Standard major |
| AAVE | Crypto.AAVE/USD | (verify before deploy) | Standard major |
| MKR | Crypto.MKR/USD | (verify before deploy) | Standard major |
| EIGEN | Crypto.EIGEN/USD | `c65db025687356496e8653d0d6608eec64ce2d96e2e28c530e574f0e4f712380` | EigenLayer |
| ETHFI | Crypto.ETHFI/USD | `b27578a9654246cb0a2950842b92330e9ace141c52b63829cc72d5c45a5a595a` | Ether.fi |
| ezETH | Crypto.EZETH/USD | `06c217a791f5c4f988b36629af4cb88fad827b2485400a358f3b02886b54de92` | Renzo Restaked ETH |
| PEPE | Crypto.PEPE/USD | `d69731a2e74ac1ce884fc3890f7ee324b6deb66147055249568869ed700882e4` | Note: Hermes also returns `Crypto.KPEPE/USD` (×1000 scaled) — use the unscaled `PEPE/USD` |
| WIF | Crypto.WIF/USD | `4ca4beeca86f0d164160323817a4e42b10010a724c2217c6ee41b54cd4cc61fc` | Dogwifhat |
| BONK | Crypto.BONK/USD | `72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419` | Note: Hermes also returns `Crypto.KBONK/USD` — use unscaled |
| DOGE | Crypto.DOGE/USD | (verify before deploy) | Standard major-meme |
| GMX | Crypto.GMX/USD | `b962539d0fcb272a494d65ea56f94851c2bcf8823935da05bd628916e2e9edbf` | |
| PENDLE | Crypto.PENDLE/USD | `9a4df90b25497f66b1afb012467e316e801ca3d839456db028892fe8c70c8016` | |
| RDNT | Crypto.RDNT/USD | `c8cf45412be4268bef8f76a8b0d60971c6e57ab57919083b8e9f12ba72adeeb6` | Radiant |
| RNDR / RENDER | Crypto.RENDER/USD | `3d4a2bd9535be6ce8059d75eadeba507b043257321aa544717c56fa19b49e35d` | **Renamed.** "RNDR" was the old ticker; Pyth lists it as **RENDER/USD**. No RNDR/USD feed. Update spec references. |
| FET | Crypto.FET/USD | `7da003ada32eabbac855af3d22fcf0fe692cc589f0cfd5ced63cf0bdcc742efe` | Now labeled "Artificial Superintelligence Alliance" post-merger |
| ONDO | Crypto.ONDO/USD | `d40472610abe56d36d065a0cf889fc8f1dd9f3b7f2a478231a5fc6df07ea5ce3` | |
## Installation
# ─── Contracts (Solidity + Stylus) ─────────────────────────────────────
# Foundry
# Stylus
# Solidity deps (in contracts/ root, after `forge init`)
# Stylus deps (in Cargo.toml of the StylusScoreEngine crate)
# stylus-sdk = "=0.10.7"
# openzeppelin-stylus = "=0.3.0"   # for UUPS/ERC1967 if used
# ─── Frontend (Next.js + Privy + wagmi) ────────────────────────────────
# ─── Backend (Fastify relayer + OG service) ────────────────────────────
# ─── Subgraph (development) ────────────────────────────────────────────
# in subgraph/ root
# package.json: "@graphprotocol/graph-ts": "0.38.2"
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|---|---|---|
| **Solidity 0.8.30** | 0.8.34+ (post-IR-bug fix) | If post-2026-Feb features needed; v1 doesn't need them. |
| **Stylus** for StylusScoreEngine | Pure Solidity baseline | The fallback path. Spec already plans for it at the 48h cutoff. |
| **OZ TransparentUpgradeableProxy** in front of Stylus impl | OZ `UUPSUpgradeable` Stylus crate directly | UUPS is gas-cheaper but puts upgrade logic in the implementation (Rust) — riskier for v1. Transparent is safer for single-owner-key v1; UUPS is correct for v1.1 multisig. |
| **Privy** | Dynamic, Magic, Web3Auth (MetaMask Embedded), Turnkey | Privy is the spec-locked choice. Dynamic is the closest 2026 alternative with similar OAuth+wagmi UX; Turnkey is the closest non-custodial alternative (MPC + policy engine), at the cost of more setup. Don't switch — Privy's free tier + ergonomics match the hackathon timeline. |
| **wagmi v2 + viem** | ethers.js v6 only | wagmi+viem is the modern standard for React+TS. Only use ethers if a specific dep demands it server-side. |
| **The Graph Decentralized Network** | Self-hosted Graph Node, Goldsky, SubQuery, Envio | Goldsky has a faster onboarding but the spec locks The Graph from day 1 (§3060). Envio is faster to sync but newer and untested for the long tail of historical queries the leaderboard needs. Stay with The Graph. |
| **Pyth** | Chainlink Data Feeds, RedStone, API3 | Chainlink lacks per-asset push freshness and confidence intervals. RedStone has confidence intervals but smaller Arbitrum integration history. Pyth is the right call for this product. |
| **Alchemy NFT API** | OpenSea API (rate-limited & key-required), NFTPort (also degraded), self-indexed via subgraph | Self-indexing NFT sales onchain would be cleaner but is a multi-day effort. Stay with Alchemy + signed-relayer TWAP. |
| **DefiLlama free API** | DefiLlama Pro ($300/mo) | If hitting rate limits or needing private endpoints. v1 will not. |
| **Tally GraphQL direct** | tally.xyz embed widget | Direct GraphQL is the only fit for the SettlementManager's deadline-snapshot read. |
| **@vercel/og (Node runtime)** | Native canvas + sharp | Faster wall-clock but worse DX. @vercel/og is right for v1. |
| **Fastify** | Express, Hono, Elysia | Fastify has the best schema-validation + plugin ecosystem for the spec's CEX-scraper / signed-attestation / paymaster-gating layers. |
| **Railway / Fly.io** | AWS ECS / GCP Cloud Run / DigitalOcean Apps | Railway/Fly.io are right for hackathon speed. Move to ECS if scale demands. |
| **Foundry** | Hardhat alone | Foundry's Rust+Solidity fuzzing + native Stylus testing (via arbos-foundry) is the better fit. Hardhat-foundry plugin available if both. |
## What NOT to Use
| Avoid | Why | Use Instead |
|---|---|---|
| **Reservoir API** | Sunset on October 15, 2025. Company pivoted to "Relay Protocol" (cross-chain trading). The NFT API endpoint no longer exists. | Alchemy NFT API + relayer-computed TWAP (spec is already corrected on this) |
| **Bridged USDC.e** (`0xFF970A61...DB5CC8`) | Wrong USDC. Not redeemable 1:1 with Circle, no CCTP support, no permit guarantees. | Native USDC at `0xaf88d065...e5831` |
| **Solidity 0.8.28 – 0.8.33 (with IR pipeline)** | High-severity storage/transient-storage clearing bug. Fixed in 0.8.34. Affects only the IR pipeline but Foundry compiles with IR by default in modern configs. | Pin to `=0.8.30` (pre-bug, sufficient for spec features) or `=0.8.34+` (bug fixed) |
| **`@privy-io/wagmi-connector`** (the old package) | wagmi v1 only. wagmi v2 incompatibility. | `@privy-io/wagmi` (note: no `-connector` suffix) |
| **The Graph Hosted Service** | Sunset June 12, 2024. URL `api.thegraph.com/subgraphs/name/...` returns errors. | Subgraph Studio → Decentralized Network |
| **Hardhat alone for Stylus** | Hardhat has no native Stylus support. Stylus is a Rust+WASM target. | Foundry (or arbos-foundry) for tests; cargo-stylus for Stylus deploy |
| **Vercel Functions for the relayer** | The Pyth 30-retry × 60s loop is a 30-minute job. Vercel functions max ~5-15 min on the hobby/pro tiers. CEX scrapers want long-lived workers. | Railway/Fly.io (already spec'd) |
| **Edge runtime for OG images** | `resvg-wasm` bundling issues outside Next.js's built-in `next/og` adapter; Vercel itself recommends Node runtime in 2026. | Node runtime on the OG endpoint |
| **`display: grid` in OG card templates** | Satori does not support CSS Grid. Layouts will silently fall back / misrender. | Pure flexbox; spec the 5 card variants accordingly |
| **MATIC/USD price feed** | Polygon migrated to POL in 2024; MATIC feed deprecated/removed. | POL/USD feed (`ffd11c5a...`) |
| **RNDR/USD price feed** | Pyth renamed to RENDER post-token-migration. RNDR symbol returns empty. | RENDER/USD feed (`3d4a2bd9...`) |
| **OAuth scope `users.read` only** for Twitter via Privy | Insufficient for the §9.9 follow-graph query. | Request `follows.read` via Privy custom scopes + budget for X API Basic tier |
| **`delegatecall` to user-controlled addresses anywhere** | Per spec §10.5; mentioned here for emphasis. | Static-allowlist any delegatecall target if absolutely needed |
## Stack Patterns by Variant
- Swap StylusScoreEngine for a Solidity implementation in the same `TransparentUpgradeableProxy` slot
- Reuse `openzeppelin-stylus@0.3.0` → drop in favor of `@openzeppelin/contracts-upgradeable@5.6.1`
- Pitch becomes "Stylus in production roadmap" (per spec §11.6 build-time fallback)
- Frontend reads CallRegistry/FollowFadeMarket events directly via viem's `getLogs` polling at 5s interval
- Aggregate client-side; ignore historical-leaderboard queries until subgraph is live
- Cache aggregations in localStorage with 60s TTL
- Per spec §13.1, 30 retries × 60s already covers
- If a specific feed (e.g. ezETH) is consistently wide: tighten the allowlist for v1 launch, or switch that coin to direct-RPC-Curve-pool TWAP (last-resort, not v1)
- Cache the follow-graph at 24h instead of 1h
- Pre-warm the cache lazily — only fetch when a user first opens the feed in a session
- Document the degraded freshness in §9.9 user copy
## Version Compatibility Matrix
| Package A | Compatible With | Notes |
|---|---|---|
| `wagmi@2.18.x` | `viem@2.x`, `@tanstack/react-query@5.x` | v2 requires both as peer deps |
| `@privy-io/react-auth@3.27.x` | `react@^18 \|\| ^19`, `@privy-io/wagmi@1.32.x` | v3 is post-2.0 breaking-change line; do not mix with v2 examples |
| `@privy-io/wagmi@1.32.x` | `wagmi@2.18.x`, `@privy-io/react-auth@3.x` | NOT `@privy-io/wagmi-connector` (legacy v1) |
| `@vercel/og@0.11.1` | `next@14+`, Node 18+ | satori@0.26.0 bundled internally |
| `stylus-sdk@0.10.7` | `cargo-stylus@0.6.3+`, Rust stable, `openzeppelin-stylus@0.3.0` (alpha-ish) | v0.10 introduced workspace + type-safe cross-contract |
| `openzeppelin-stylus@0.3.0` | `stylus-sdk@0.10.x` | Pin with `=0.3.0` (alpha line — exact pin required) |
| `solidity@0.8.30` | `@openzeppelin/contracts@5.6.1` (min 0.8.20) | Avoid 0.8.28–0.8.33 IR bug range |
| `@pythnetwork/pyth-sdk-solidity@4.3.1` | `solidity@^0.8.0` | The IPyth interface |
| `@graphprotocol/graph-cli@0.98.1` | `@graphprotocol/graph-ts@0.38.2` | Stay paired |
## Sources
- [Stylus SDK 0.10 release blog (March 2026)](https://blog.arbitrum.foundation/structuring-multi-contract-stylus-projects-without-pain/) — HIGH confidence
- [Stylus SDK GitHub releases page](https://github.com/OffchainLabs/stylus-sdk-rs/releases) (via WebFetch — confirmed 0.10.7 / May 19, 2026) — HIGH
- [cargo-stylus GitHub releases](https://github.com/OffchainLabs/cargo-stylus/releases) (confirmed 0.6.3 / Aug 20, 2025) — HIGH
- [OpenZeppelin Stylus UUPS Proxy docs](https://docs.openzeppelin.com/contracts-stylus/uups-proxy) — HIGH
- [OpenZeppelin / rust-contracts-stylus](https://github.com/OpenZeppelin/rust-contracts-stylus) (openzeppelin-stylus crate 0.3.0 / Sep 10, 2025) — HIGH
- [Privy docs — wagmi integration](https://docs.privy.io/wallets/connectors/ethereum/integrations/wagmi) — HIGH
- [Privy docs — smart wallets overview](https://docs.privy.io/wallets/using-wallets/evm-smart-wallets/overview) — HIGH
- [Privy 3.0 migration guide](https://docs.privy.io/basics/react/advanced/migrating-to-3.0) — HIGH
- [Privy release changelog](https://docs.privy.io/reference/sdk/react-auth/changelog) — HIGH
- npm registry — direct version queries (`@privy-io/react-auth@3.27.0`, `@privy-io/wagmi@1.32.5`, `wagmi@2.18.0`, `viem@2.50.4`, `@tanstack/react-query@5.100.11`, `@vercel/og@0.11.1`, `satori@0.26.0`, `@graphprotocol/graph-cli@0.98.1`, `next@16.2.6`, `fastify@5.6.1`, `@openzeppelin/contracts@5.6.1`, `@pythnetwork/pyth-sdk-solidity@4.3.1`, `@pythnetwork/hermes-client@3.1.0`, `alchemy-sdk@3.6.5`, `@farcaster/auth-kit@0.8.2`, `@snapshot-labs/snapshot.js@0.14.21`, `ethers@6.16.0`, `siwe@3.0.0`) — HIGH
- [Pyth Network EVM contract addresses](https://docs.pyth.network/price-feeds/contract-addresses/evm) — HIGH (Arbitrum One: `0xff1a0f4744e8582DF1aE09D5611b887B6a12925C`)
- [Pyth Hermes API — feed catalog](https://hermes.pyth.network/v2/price_feeds) — HIGH (each of EIGEN, ETHFI, EZETH, ONDO, PEPE, BONK, WIF, RENDER, FET, GMX, PENDLE, RDNT, POL, MNT verified on 2026-05-21)
- [Pyth getPriceNoOlderThan reference](https://api-reference.pyth.network/price-feeds/evm/getPriceNoOlderThan) — HIGH
- [Native USDC on Arbitrum (Arbiscan)](https://arbiscan.io/address/0xaf88d065e77c8cC2239327C5EDb3A432268e5831) — HIGH
- [USDC on Arbitrum docs](https://docs.arbitrum.io/arbitrum-bridge/usdc-arbitrum-one) — HIGH
- [Circle Paymaster + EIP-2612 docs](https://docs.arbitrum.io/for-devs/third-party-docs/Circle/usdc-paymaster-quickstart) — HIGH
- [The Graph Hosted Service sunset](https://thegraph.com/blog/sunsetting-hosted-service/) — HIGH
- [Subgraph Studio pricing](https://thegraph.com/studio-pricing/) — HIGH
- [Subgraph Studio billing docs](https://thegraph.com/docs/en/subgraphs/billing/) — HIGH
- [Alchemy getFloorPrice reference](https://docs.alchemy.com/reference/getfloorprice) — HIGH
- [Alchemy getNFTSales reference](https://www.alchemy.com/docs/reference/nft-api-endpoints/nft-api-endpoints/nft-api-v-2-methods-older-version/get-nft-sales) — HIGH (Ethereum mainnet only for floors)
- [DefiLlama API docs](https://api-docs.defillama.com/) — HIGH (no auth, base URLs: `api.llama.fi`, `yields.llama.fi`, `coins.llama.fi`)
- [Solidity 0.8.30 release announcement](https://www.soliditylang.org/blog/2025/05/07/solidity-0.8.30-release-announcement/) — HIGH
- [Solidity 0.8.34 release announcement (IR bug fix)](https://www.soliditylang.org/blog/2026/02/18/solidity-0.8.34-release-announcement/) — HIGH
- [OpenZeppelin Contracts 5.0 announcement](https://www.openzeppelin.com/news/introducing-openzeppelin-contracts-5.0) — HIGH
- [arbos-foundry announcement (iosiro, Feb 2026)](https://www.iosiro.com/blog/introducing-arbos-foundry-native-stylus-testing-with-foundry) — MEDIUM (newer tool, real but unproven at scale)
- [Vercel OG edge-vs-node guidance](https://github.com/vercel/next.js/discussions/60003) and [@vercel/og runtime docs](https://vercel.com/docs/og-image-generation) — HIGH (Node runtime preferred in 2026)
- [@farcaster/auth-kit docs](https://docs.farcaster.xyz/auth-kit/introduction) — HIGH
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
