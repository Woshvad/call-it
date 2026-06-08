# Phase 8: Farcaster Mini Apps - Research

**Researched:** 2026-06-08
**Domain:** Farcaster Mini App (formerly Frames v2) distribution surface — embed meta tags, `/.well-known/farcaster.json` manifest, transaction protocol — layered on the Phase-7 share loop, on Arbitrum Sepolia testnet.
**Confidence:** HIGH on the live Farcaster spec (pinned against official docs 2026-06-08); HIGH on the codebase grounding; the single most important architectural finding (transaction model) is locked with two cross-verified sources.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Build the full Frame transaction mechanism now on Sepolia; verify live tap-to-transact on mainnet (Phase 10). Phase 8 is code-complete on testnet; the live Warpcast-transaction proof is the Phase-10 gate. Do NOT block Phase 8 verification on broadcasting a Sepolia tx through production Warpcast.
- **D-02:** The Frame's action buttons are context-aware on the call's status (the Frame endpoint reads call status before rendering buttons):
  - **Live-call cast** → `Follow` + `Fade` are real FollowFadeMarket staked positions (Phase 2); `Challenge` proposes a 1v1 via ChallengeEscrow (Phase 3).
  - **Settled-receipt cast** → `Follow` = social-follow the caller's profile (ProfileRegistry, Phase 1.5); `Challenge` = 1v1 (ChallengeEscrow, Phase 3); `Quote` = quote-call the settled receipt (CallRegistry).
- **D-03:** Target the current Mini App embed (`fc:miniapp` meta + Mini App SDK) as primary, and ALSO emit the legacy `fc:frame` meta tag for backward compatibility. Pin the exact current spec at plan time (done below).
- **D-04:** Wire the Frame embed into the existing Phase-7 auto-post-on-settle path AND add a manual "share as Frame" affordance on the receipt page; defer Mini App catalog/directory submission to mainnet (Phase 10).
- **D-05:** Serve the full `/.well-known/farcaster.json` manifest now on Sepolia; defer the signed `accountAssociation` to the mainnet domain (Phase 10).
- **D-06:** Settled-cast button triplet = `Follow-person` · `Challenge` · `Quote` (`Fade` dropped — market closed once settled).
- **D-07:** In-frame Live Follow/Fade default to the minimum stake ($1 min follow / min fade) as a one-tap transaction. Larger stakes route through the "Open in Call It" deep-link.

### Claude's Discretion
- Exact Farcaster spec details (`fc:miniapp` vs `fc:frame` field names, embed JSON schema, manifest schema, transaction-response wire format) — pinned against live spec below.
- Frame server endpoint location/structure — reuse Next.js App Router route handlers under `apps/web` (`export const runtime = 'nodejs'`, public/no-auth per middleware carve-out).
- Call-status detection in the Frame endpoint — read from relayer `/api/calls/:id/live-state` (`status`/`statusVersion`/`marketLine`) and/or subgraph.
- Transaction-data construction — reuse existing ABIs + `addresses.ts`; do not introduce new ABIs.
- OG card reuse — render existing Phase-7 OG card variants unchanged in the embed `imageUrl`.

### Deferred Ideas (OUT OF SCOPE)
- Live in-Warpcast tap-to-transact verification → Phase 10 (mainnet). [[D-01]]
- Signed `accountAssociation` for the production domain → Phase 10. [[D-05]]
- Mini App catalog / directory submission → Phase 10. [[D-04]]
- Frame text-input for custom stake amount → future (chose one-tap min-stake; larger via deep-link). [[D-07]]
- Mobile-responsive (375px) web pages → Phase 9.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SHARE-19 | Receipt page server-renders Farcaster Mini App embed meta + manifest; Frame buttons drive Follow/Fade/Challenge/Quote against existing contract paths via the transaction protocol; rendering matches Twitter OG variants; auto-post lands the cast and the Mini App is discoverable. | Embed meta + manifest schemas pinned (§ Standard Stack / Architecture). Transaction model resolved (§ Architecture Pattern 3). Button-to-contract map built from real ABIs (§ Architectural Responsibility Map). Auto-post wiring located (`apps/relayer/src/workers/auto-post-worker.ts` + `index.ts:328-352`). Testnet-validatable parts vs Phase-10 gates separated (§ Validation Architecture). |
</phase_requirements>

## Summary

Phase 8 adds three server-rendered surfaces on top of the existing Phase-7 receipt + OG + auto-post machinery: (1) `fc:miniapp` + legacy `fc:frame` embed meta tags injected via `generateMetadata` in `apps/web/app/call/[id]/layout.tsx`; (2) a `/.well-known/farcaster.json` manifest route; (3) a transaction surface that lets a Follow/Fade/Challenge/Quote button initiate the corresponding on-chain tx against the already-deployed Sepolia contracts. The OG card variants from Phase 7 are reused unchanged as the embed `imageUrl` (criterion 3 is already satisfied by reuse). Almost all of this is server-side plumbing; the app owns exactly one new visual control ("Share as Frame", per the UI-SPEC).

**The single most consequential finding is the transaction model.** The Farcaster ecosystem now has TWO incompatible transaction paths: (a) the **legacy Frame `tx` action** — a button POSTs a signature packet to a server endpoint, which returns a `{chainId, method:"eth_sendTransaction", params:{abi,to,data,value}}` JSON wire response; and (b) the **current Mini App SDK** — a full SPA loaded in-frame that talks to the wallet directly via `@farcaster/miniapp-wagmi-connector` / `sdk.wallet.getEthereumProvider()`, with NO server tx-response. D-03 names the Mini App embed as primary AND legacy `fc:frame` as compat. Because the legacy `fc:frame` (button + `tx` action + server endpoint) is the only path that has a well-defined *server-side* transaction-response wire format — and the only path that can be unit-tested without a live in-Warpcast SPA session — **the testable Phase-8 deliverable is the legacy Frame `tx` endpoint** (a Next.js route returning the eth_sendTransaction wire format), shipped alongside the modern `fc:miniapp` launch embed. The modern in-frame SDK SPA path is the production UX but its tap-to-transact is exactly the Phase-10 live gate D-01 defers.

**Second consequential finding: Arbitrum *Sepolia* (eip155:421614) is NOT in the Farcaster-supported chainList; Arbitrum One (eip155:42161) IS.** This is direct evidence that the live in-Warpcast tap-to-transact genuinely cannot be exercised on testnet — production Warpcast will not broadcast a 421614 transaction. This independently validates D-01: build the wire mechanism now, gate the live proof to mainnet.

**Third finding: two of the four button actions have NO matching on-chain function in the existing ABIs.** Settled-cast `Follow = social-follow the caller's profile` is an **off-chain follow-graph** operation (relayer `/api/social/*`, Postgres `follow_graph` + Redis), NOT a ProfileRegistry contract call — `ProfileRegistry.ts` has no follow function. And `Quote` (`createCall` with `parentCallId`) requires a full market-parameter payload, which is NOT a one-tap fixed-calldata transaction. These two need explicit planner decisions (documented in Open Questions) — they cannot be silently treated as "reuse the existing ABI for a one-tap tx."

**Primary recommendation:** Ship (1) embed meta via `Metadata.other` in `call/[id]/layout.tsx`; (2) a `/.well-known/farcaster.json` route under `apps/web` with the manifest body but NO `accountAssociation` (D-05); (3) a legacy-Frame `tx` server endpoint (`app/api/frame/tx/[callId]/route.ts`, `runtime='nodejs'`, public) that selects buttons by call status (relayer `/live-state`) and returns the eth_sendTransaction wire format with `chainId:"eip155:421614"` for the two **directly-constructible one-tap** actions — Live `Follow`/`Fade` (FollowFadeMarket) and `Challenge` (ChallengeEscrow). Route the two non-constructible actions (settled social-`Follow`, `Quote`) to the `Open in Call It` deep-link for v1 (Open Questions Q1/Q2 ask the planner/user to confirm). Extend the auto-post worker only to point the cast embed at the receipt URL (the embed travels automatically — see Pattern 4).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `fc:miniapp` / `fc:frame` embed meta | Frontend Server (SSR) | — | Injected in `generateMetadata` (`call/[id]/layout.tsx`), server-rendered into HTML `<head>`. Same tier as the existing OG/Twitter meta. |
| `/.well-known/farcaster.json` manifest | Frontend Server (route handler) | — | Static-ish JSON served by a Next.js App Router route (`runtime='nodejs'`, public). No `accountAssociation` on Sepolia (D-05). |
| Frame `tx` endpoint (legacy wire) | Frontend Server (route handler) | API/Relayer (status read) | Returns eth_sendTransaction wire JSON. Reads call status from relayer `/live-state` to select the button set (D-02). Constructs calldata from existing ABIs + Sepolia addresses. |
| Button → on-chain tx (Live Follow/Fade/Challenge) | API / Backend (contracts) | Frontend Server (calldata build) | FollowFadeMarket.follow/fade, ChallengeEscrow.proposeChallenge already deployed; the route only builds calldata + the wallet (via Warpcast) broadcasts. |
| Settled `Follow` (social) | API / Relayer (off-chain follow-graph) | — | **NOT a contract call.** `follow_graph` Postgres table via relayer `/api/social/*`. No on-chain ProfileRegistry follow function exists. See Open Q1. |
| `Quote` | API / Backend (CallRegistry.createCall) | Frontend Server (deep-link) | `createCall` with `parentCallId` — needs full market params, not one-tap. Route to deep-link. See Open Q2. |
| Embed image (OG card) | CDN / Static (cached OG route) | Frontend Server (OG builder) | Reuse `/og/[callId]` and `/og/duel/[challengeId]` UNCHANGED (locked Phase 7). |
| Auto-post cast embed | API / Relayer (auto-post worker) | Frontend Server (receipt meta) | The embed rides the receipt URL already passed to `warpcastComposeUrl`; no payload change needed (Pattern 4). |
| "Share as Frame" control | Browser / Client (receipt page) | — | One new outline button in the existing action row (UI-SPEC). Opens the Warpcast compose intent. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.2.6 (pinned, CLAUDE.md) | App Router route handlers for manifest + Frame `tx` endpoint; `generateMetadata` for embed meta | Already the project framework; `Metadata.other` is the idiomatic way to emit arbitrary `<meta name=...>` tags. |
| `@vercel/og` | 0.11.1 (pinned, CLAUDE.md) | Embed image — REUSE existing `/og/[callId]` route unchanged | OG card variants are locked Phase-7 assets; embed `imageUrl` points at them. No new OG code. |
| viem | 2.50.4 (pinned, CLAUDE.md) | `encodeFunctionData` for building the Frame `tx` calldata server-side; status reads if not via relayer | Already in the repo for both web and relayer chain interactions. Server-side calldata build needs `encodeFunctionData(abi, fn, args)`. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@farcaster/miniapp-sdk` | 0.3.0 `[ASSUMED]` | Modern Mini App SPA runtime — `sdk.actions.ready()`, `sdk.actions.composeCast()`, `sdk.wallet.getEthereumProvider()` | ONLY if the plan builds the modern in-frame SPA launch page (the production UX). NOT required for the legacy `fc:frame` `tx` endpoint, which is pure server-side JSON. Gate behind a `checkpoint:human-verify` before install (slopcheck could not run — see audit). |
| `@farcaster/miniapp-wagmi-connector` | 2.0.0 `[ASSUMED]` | wagmi connector so the in-frame SPA uses the Warpcast-injected wallet | ONLY for the modern SPA launch page. The repo already has a wagmi/Privy provider tree; this would be an additional connector inside the mini-app surface. Gate behind checkpoint. |

> **Recommendation:** For the *testable Sepolia deliverable*, you can ship SHARE-19 with **zero new npm dependencies** — the legacy `fc:frame` embed + `tx` endpoint are plain meta tags and a JSON route using viem (already present). The two `@farcaster/*` packages are only needed if the plan also stands up the modern in-frame SPA (whose live tap-to-transact is the Phase-10 gate anyway). Prefer the no-dependency path for the code-complete-on-testnet scope; defer the SPA + its packages to Phase 10 unless the planner explicitly scopes the SPA shell now.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Legacy `fc:frame` `tx` endpoint (server JSON) | Modern Mini App SPA + `miniapp-wagmi-connector` | The modern SPA is the better production UX, but its transaction is an in-frame wallet call with no server-testable wire format — it can only be proven live in Warpcast (Phase-10 gate, eip155:42161). The legacy endpoint is unit-testable now. Ship both meta tags; build the testable server path now. |
| Reading status from relayer `/live-state` | Subgraph `Call` entity | `/live-state` is the SAME source `layout.tsx` already uses; it returns `status`/`statusVersion`/`marketLine`/`caller`/`stake`/`conviction` with a 4s Redis cache. Prefer it for consistency. Subgraph is a fallback. |
| `Metadata.other` for embed meta | Raw `<meta>` in a custom `<head>` | `Metadata.other` is the App-Router-native escape hatch and matches the existing `openGraph`/`twitter` pattern in `layout.tsx`. Use it. |

**Installation (only if building the modern SPA — otherwise NONE):**
```bash
# [ASSUMED] — gate each behind checkpoint:human-verify (slopcheck unavailable at research time)
npm install @farcaster/miniapp-sdk@0.3.0 @farcaster/miniapp-wagmi-connector@2.0.0
```

**Version verification (npm registry, 2026-06-08):**
- `@farcaster/miniapp-sdk` → `0.3.0` [VERIFIED: npm registry existence; name discovered via WebSearch so tagged ASSUMED per provenance rule]
- `@farcaster/miniapp-wagmi-connector` → `2.0.0` [VERIFIED: npm registry existence; ASSUMED provenance]
- `@farcaster/frame-sdk` (legacy) → `0.2.0` (exists; not needed for the server `tx` path)
- `@farcaster/auth-kit` → `0.8.2` (matches CLAUDE.md pin; used only for SIWF, not this phase)

## Package Legitimacy Audit

> slopcheck could NOT be installed/run at research time (sandbox denied the `pip install slopcheck` + execution as an undeclared external package). Per the graceful-degradation protocol, both `@farcaster/*` packages below are tagged `[ASSUMED]` and the planner MUST gate each install behind a `checkpoint:human-verify` task. Registry existence was confirmed directly via `npm view`, but registry existence alone does not confer VERIFIED status.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@farcaster/miniapp-sdk` | npm | est. >6 mo (post-rename line) | high (official Farcaster) | github.com/farcasterxyz/miniapps | unavailable | `[ASSUMED]` — planner adds checkpoint before install. Only needed for the modern SPA path. |
| `@farcaster/miniapp-wagmi-connector` | npm | est. >6 mo | high (official Farcaster) | github.com/farcasterxyz/miniapps | unavailable | `[ASSUMED]` — planner adds checkpoint before install. Only needed for the modern SPA path. |

**Packages removed due to slopcheck [SLOP] verdict:** none (slopcheck did not run).
**Packages flagged as suspicious [SUS]:** none. Both are first-party `@farcaster/*` scoped packages from the official org repo — low hallucination risk, but still ASSUMED until checkpoint-verified.

> **Strongly preferred:** ship the testable scope with **no new packages** (legacy `fc:frame` embed + server `tx` JSON route, using viem already in-repo). This sidesteps the audit entirely for Phase 8 and keeps the new packages with their natural Phase-10 SPA work.

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────────────┐
                         │  Farcaster client (Warpcast)                │
                         │  renders cast → reads HTML <head> meta      │
                         └───────────────┬─────────────────────────────┘
                                         │ GET /call/:id  (public, no-auth)
                                         ▼
   ┌───────────────────────────────────────────────────────────────────────┐
   │ apps/web (Next.js, Vercel — Sepolia origin)                            │
   │                                                                        │
   │  call/[id]/layout.tsx  generateMetadata()                              │
   │    ├─ existing openGraph/twitter meta (Phase 7)                        │
   │    └─ NEW Metadata.other:                                              │
   │         fc:miniapp = {version,imageUrl:/og/:id?v=sv, button.action}    │
   │         fc:frame   = same JSON, action.type=launch_frame (compat)      │
   │                                                                        │
   │  app/.well-known/farcaster.json/route.ts  (NEW, public, nodejs)        │
   │    └─ { miniapp:{version,name,homeUrl,iconUrl,...} }  (NO acctAssoc)   │
   │                                                                        │
   │  app/api/frame/tx/[callId]/route.ts  (NEW, public, nodejs)             │
   │    POST signature-packet ──► read status ──► select buttons (D-02)     │
   │      │                          │                                      │
   │      │                          └─ GET relayer /api/calls/:id/live-state│
   │      │                             → status / marketLine / caller      │
   │      └─ build eth_sendTransaction wire JSON:                           │
   │           { chainId:"eip155:421614", method:"eth_sendTransaction",     │
   │             params:{ to, data(=encodeFunctionData), value, abi } }     │
   │                                                                        │
   │  /og/[callId]?v=sv   (REUSED UNCHANGED — embed imageUrl)               │
   │  middleware.ts  PUBLIC_PREFIXES += '/.well-known','/api/frame'         │
   └───────────────┬───────────────────────────────────────────────────────┘
                   │ button calldata routes to ↓ (Warpcast broadcasts on mainnet=Phase10)
                   ▼
   ┌───────────────────────────────────────────────────────────────────────┐
   │ Arbitrum Sepolia contracts (already deployed, addresses.ts)            │
   │   FollowFadeMarket.follow/fade(callId, $1, minSharesOut)  ← Live       │
   │   ChallengeEscrow.proposeChallenge(callId, stake)         ← Live+Settled│
   │   CallRegistry.createCall(...parentCallId)  ← Quote (NOT one-tap → deep-link) │
   │   [social Follow = off-chain follow_graph, NOT a contract] ← deep-link │
   └───────────────────────────────────────────────────────────────────────┘

   Auto-post (relayer): workers/auto-post-worker.ts already builds
     warpcastComposeUrl(receiptUrl, text); embed rides receiptUrl automatically.
```

### Recommended Project Structure (new files only)
```
apps/web/app/
├── .well-known/
│   └── farcaster.json/
│       └── route.ts          # NEW — manifest body, no accountAssociation (D-05)
├── api/frame/tx/[callId]/
│   └── route.ts              # NEW — legacy Frame tx wire endpoint (status-aware, D-02)
└── call/[id]/
    └── layout.tsx            # EXTEND — add Metadata.other embed meta (fc:miniapp + fc:frame)

apps/web/lib/
├── abis/ChallengeEscrow.ts   # NEW (optional) — promote the inline CE_ABI slice from
│                             #   ChallengeFormModal.tsx into a shared ABI file, OR reuse inline
└── farcaster-embed.ts        # NEW (optional) — pure builder: (callId, imageUrl, baseUrl) → embed JSON

apps/web/app/call/[id]/page.tsx   # EXTEND — add "SHARE AS FRAME →" outline control (UI-SPEC)
```

### Pattern 1: Embed meta via `Metadata.other` (server-rendered, D-03)
**What:** Emit `fc:miniapp` (primary) and `fc:frame` (compat) `<meta>` tags whose `content` is a stringified embed JSON. The image is the existing OG route (`/og/:id?v={statusVersion}`).
**When to use:** In `generateMetadata` in `call/[id]/layout.tsx`, alongside the existing `openGraph`/`twitter` blocks.
**Example (literal target output — verified against the live spec):**
```ts
// Source: https://miniapps.farcaster.xyz/docs/guides/sharing (checked 2026-06-08)
//         https://miniapps.farcaster.xyz/docs/specification (checked 2026-06-08)
// In generateMetadata's returned Metadata object:
const base = process.env.NEXT_PUBLIC_OG_BASE_URL ?? '';          // Sepolia Vercel origin (D-04)
const imageUrl = `${base}/og/${id}?v=${statusVersion}`;           // REUSE OG card (3:2 → 1200×630 ✓)
const launchUrl = `${base}/call/${id}`;                           // page the mini app launches to

const miniappEmbed = {
  version: '1',
  imageUrl,
  button: {
    title: 'View on Call It',                                     // ≤32 chars
    action: {
      type: 'launch_miniapp',                                     // fc:miniapp variant
      url: launchUrl,
      name: 'Call It',
      splashImageUrl: `${base}/splash.png`,                       // must be 200×200px
      splashBackgroundColor: '#09090E',                           // brand-bg
    },
  },
};
const frameEmbed = { ...miniappEmbed, button: { ...miniappEmbed.button,
  action: { ...miniappEmbed.button.action, type: 'launch_frame' } } }; // ONLY diff: action.type

return {
  /* ...existing title/description/openGraph/twitter... */
  other: {
    'fc:miniapp': JSON.stringify(miniappEmbed),
    'fc:frame': JSON.stringify(frameEmbed),
  },
};
```
Produces:
```html
<meta name="fc:miniapp" content='{"version":"1","imageUrl":".../og/42?v=3","button":{"title":"View on Call It","action":{"type":"launch_miniapp","url":".../call/42","name":"Call It","splashImageUrl":".../splash.png","splashBackgroundColor":"#09090E"}}}'/>
<meta name="fc:frame" content='{"version":"1",...,"action":{"type":"launch_frame",...}}'/>
```
**Embed image constraints (verified):** 3:2 aspect ratio, min 600×400, max 3000×2000, <10MB, URL ≤1024 chars. The existing OG card is 1200×630 = exactly 3:2 ✓ [CITED: miniapps.farcaster.xyz/docs/guides/sharing, 2026-06-08].

### Pattern 2: Manifest route, body-only (D-05)
**What:** A public `app/.well-known/farcaster.json/route.ts` returning the `miniapp` config object. OMIT `accountAssociation` on Sepolia.
**When to use:** Always for this phase. `accountAssociation` is added in Phase 10 against the stable mainnet domain.
**Confirmed:** the cast **embed renders in the feed without a signed `accountAssociation`** — `accountAssociation` gates `addMiniApp`/discoverability/notifications, NOT feed embed rendering [CITED: miniapps.farcaster.xyz/docs/specification, 2026-06-08]. So the unsigned Sepolia manifest is sufficient for SC1 (cast renders OG card + launch button).
**Example:**
```ts
// Source: https://miniapps.farcaster.xyz/docs/specification (checked 2026-06-08)
export const runtime = 'nodejs';
export async function GET() {
  const base = process.env.NEXT_PUBLIC_OG_BASE_URL ?? '';
  return Response.json({
    // accountAssociation: OMITTED on Sepolia (D-05 — added Phase 10 against mainnet domain)
    miniapp: {
      version: '1',                                   // required, must be "1"
      name: 'Call It',                                // required, ≤32 chars
      homeUrl: base,                                  // required, ≤1024
      iconUrl: `${base}/icon.png`,                    // required, 1024×1024 PNG no alpha
      splashImageUrl: `${base}/splash.png`,           // optional, 200×200
      splashBackgroundColor: '#09090E',               // optional
      // imageUrl/buttonTitle are DEPRECATED top-level manifest fields — embed carries them
      // webhookUrl: only if notifications are added (Phase 10)
    },
  });
}
```
**Required manifest fields (verified):** `version`, `name`, `homeUrl`, `iconUrl`. Note `imageUrl`/`buttonTitle` are now **deprecated** top-level manifest fields (the embed meta carries them instead). `iconUrl` must be 1024×1024 PNG, no alpha; `splashImageUrl` 200×200 [CITED: miniapps.farcaster.xyz/docs/specification, 2026-06-08].

> **Next.js routing note:** the directory `app/.well-known/farcaster.json/route.ts` serves the exact path `/.well-known/farcaster.json`. Confirm the literal folder name `farcaster.json` (with the dot) is accepted; if the build tool rejects the dotted segment, the fallback is a `app/api/farcaster-manifest/route.ts` + a `next.config` rewrite from `/.well-known/farcaster.json`. Verify at plan time.

### Pattern 3: Frame `tx` endpoint — the transaction wire (legacy, the TESTABLE path)
**What:** A public POST route that receives the Frame signature packet (incl. the connected wallet address), reads call status to pick the button action (D-02), and returns the eth_sendTransaction wire JSON. Calldata is built server-side with viem `encodeFunctionData`.
**When to use:** This is the server-side, unit-testable transaction surface for SHARE-19 / SC2 on testnet.
**Wire format (cross-verified — two sources):**
```ts
// Source: framesjs.org/reference/core/transaction + Base docs cookbook/transactions
//         (Frame tx action wire format, checked 2026-06-08)
// type EthSendTransactionAction = {
//   chainId: string;                       // CAIP-2 — "eip155:421614" for Arbitrum Sepolia
//   method: 'eth_sendTransaction';
//   attribution?: boolean;
//   params: { abi: Abi | []; to: string; value?: string; data?: string };
// }
import { encodeFunctionData, parseUnits } from 'viem';
import { followFadeMarketAbi } from '@/lib/abis';
import { FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA } from '@call-it/shared';

// Live Follow at $1 min (D-07): MIN_POSITION_USDC = 1_000_000n (6-dec) — see fees.ts
const data = encodeFunctionData({
  abi: followFadeMarketAbi,
  functionName: 'follow',
  args: [BigInt(callId), 1_000_000n, 0n],   // (callId, amountIn=$1, minSharesOut=0)
});
return Response.json({
  chainId: 'eip155:421614',                 // Arbitrum Sepolia — see chain note below
  method: 'eth_sendTransaction',
  params: { abi: followFadeMarketAbi, to: FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA, data, value: '0' },
});
```
**CAIP-2 chainId:** Arbitrum Sepolia = `eip155:421614`; Arbitrum One (mainnet, Phase 10) = `eip155:42161` [CITED: CAIP-2 / chainId 421614 is the canonical Arbitrum Sepolia id].
**CRITICAL chain-support caveat:** Arbitrum **Sepolia (eip155:421614) is NOT in the Farcaster client's supported chainList**; only **Arbitrum One (eip155:42161)** is [CITED: github.com/farcasterxyz/miniapps discussion + Mini Apps on Arbitrum guide, 2026-06-08]. Production Warpcast will therefore refuse to broadcast a 421614 tx. This is exactly why D-01 defers the *live tap* to Phase 10 — the endpoint can be **built and asserted well-formed now**, but a real broadcast only works on eip155:42161 at mainnet.
**USDC approval gotcha (carry forward from in-app flows):** `follow`/`fade`/`proposeChallenge` all `transferFrom` USDC, so they require a prior `USDC.approve(spender, amount)`. The in-app flows do a two-step approve→action (see `ChallengeFormModal.tsx:246-278`, `page.tsx:1212-1224`). A single Frame `tx` button returns ONE transaction; it cannot do approve+action atomically. Plan must decide: (a) one-tap assumes allowance already set (route to deep-link if not), (b) use ERC-2612 `permit` if the contracts support it (CLAUDE.md notes native USDC supports ERC-2612), or (c) make the first Frame tap the approve and a follow-up the action. Document in the plan — this is a real one-tap blocker, not theoretical.

### Pattern 4: Auto-post embed travels automatically (D-04)
**What:** The Phase-7 auto-post worker already constructs `warpcastComposeUrl(receiptUrl, text)` with `embeds[]=receiptUrl`. Once the receipt URL's HTML carries the `fc:miniapp`/`fc:frame` meta (Pattern 1), Warpcast renders the embed from that URL automatically — **no change to the cast body or embeds array is required**.
**Exact location:** `apps/relayer/src/workers/auto-post-worker.ts` → `makeProcessCall()` → builds `const warpcastUrl = warpcastComposeUrl(receiptUrl, text)` at line ~258 (`receiptUrl = ${base}/call/${callId}`). Started in `apps/relayer/src/index.ts:337` (`startAutoPostWorker({...ogBaseUrl...})`).
**What (if anything) to extend:** Nothing structural is required for the embed to ride along — it's a property of the receipt URL. The only optional change is if the plan wants the worker to *post via the Mini App SDK `composeCast`* instead of just constructing the intent URL; that is a relayer-side automation and is NOT needed for SHARE-19 (the auto-post already lands the cast URL; the embed is in the page). Keep the worker's `warpcastComposeUrl` purity contract intact (`packages/shared/src/share/share-text.ts` — pure, no env/network).
**Manual "Share as Frame" affordance (UI-SPEC):** the receipt page adds one outline control `SHARE AS FRAME →` that opens `warpcastComposeUrl(receiptUrl, buildShareText(...))` in a new tab. Same builders, reused. Omit the control if the URL can't be constructed (no dead button).

### Anti-Patterns to Avoid
- **Treating settled `Follow` as a contract call.** There is no on-chain social-follow. It is the off-chain follow-graph (relayer). Either route it to the deep-link or call the relayer follow endpoint from the launched mini app (Open Q1).
- **Treating `Quote` as one-tap calldata.** `createCall` needs 12 market params + a `$10` market-creation fee + a `$5` min stake (per CLAUDE.md + Phase-7 memory note: "createCall needs $15"). Not a one-tap fixed-calldata tx. Route to deep-link (Open Q2).
- **Emitting only `fc:miniapp`.** D-03 requires the legacy `fc:frame` in parallel for compat. Emit BOTH; the only field that differs is `action.type` (`launch_miniapp` vs `launch_frame`).
- **Using `display:grid` anywhere in the (reused) OG cards.** Satori is flexbox-only (Pitfall 15). N/A here because OG cards are reused unchanged, but do not "improve" them.
- **Forgetting the middleware carve-out.** `/.well-known/farcaster.json` and `/api/frame/*` MUST be public. `/api` is already in `PUBLIC_PREFIXES`, but `/.well-known` is NOT — add it (see Pitfall 2).
- **Edge runtime on the Frame/manifest routes.** Use `export const runtime = 'nodejs'` (CLAUDE.md mandate; matches every existing route handler).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Embed image | New Frame-specific OG renderer | Existing `/og/[callId]` + `/og/duel/[challengeId]` (1200×630 = 3:2) | Locked Phase-7 assets; criterion 3 (visual continuity) is satisfied by reuse. |
| Share text + cast URL | New builder | `buildShareText` + `warpcastComposeUrl` from `@call-it/shared` | Pure, tested, single-source (07-01). The auto-post worker and Share button already use them. |
| Call-status read | New RPC client in the Frame route | relayer `/api/calls/:id/live-state` | Same source `layout.tsx` uses; 4s Redis cache; returns `status`/`marketLine`/`caller`/`stake`/`conviction`. |
| Calldata encoding | Hand-built hex | viem `encodeFunctionData(abi, fn, args)` | Type-safe against the existing `const`-typed ABIs. |
| ChallengeEscrow ABI | Re-derive | The `CE_ABI` slice already in `ChallengeFormModal.tsx:38-50` (`proposeChallenge(callId, stake)`) | Already correct; optionally promote to `lib/abis/ChallengeEscrow.ts`. |
| Embed JSON validation | Guesswork | Farcaster's Mini App embed tool / debugger + a local schema assertion test | Validates the meta tag shape without a live cast (see Validation Architecture). |

**Key insight:** Phase 8 is almost entirely *composition* of existing Phase-1.5/2/3/7 assets behind three new server surfaces. The only genuinely new logic is (a) the embed JSON shape, (b) the manifest body, and (c) the status→button→calldata mapping in the `tx` route. Everything else is reuse.

## Runtime State Inventory

This is not a rename/refactor phase, but Phase 8 adds origin-bound and chain-bound config that future phases (especially Phase 10's domain + mainnet cutover) must update. Recorded for the planner.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no datastore keys embed a Phase-8-specific string. | None. |
| Live service config | The `fc:miniapp`/`fc:frame` embed `url`/`imageUrl`/`homeUrl` and the manifest `homeUrl`/`iconUrl` all derive from `NEXT_PUBLIC_OG_BASE_URL` (Sepolia Vercel origin). On the Phase-10 domain cutover (`api.callitapp.xyz` / prod web domain, D-04), every one of these re-points automatically IF sourced from the env var — so source them from `NEXT_PUBLIC_OG_BASE_URL`, never hardcoded. | Code: read base URL from env (no hardcoded origin). Phase-10: set the env var to the prod domain + add `accountAssociation` signed for that domain. |
| OS-registered state | None. | None. |
| Secrets/env vars | `NEXT_PUBLIC_OG_BASE_URL` (exists, Phase 7). No new secret needed on testnet — `accountAssociation` (a signed block, Phase 10) is the only future secret-like artifact and is explicitly deferred (D-05). | None this phase. Phase 10: generate + store the signed `accountAssociation`. |
| Build artifacts | The manifest references `/icon.png` (1024×1024 PNG, no alpha) and `/splash.png` (200×200) as static assets. These do not exist yet in `apps/web/public`. | Add `apps/web/public/icon.png` (1024×1024 PNG no alpha) + `apps/web/public/splash.png` (200×200) as Wave-0 assets, or the manifest/embed will 404 those URLs. |

**The canonical question:** After the code ships, what runtime config still points at Sepolia/the preview origin? Answer: the embed/manifest URLs and the `eip155:421614` chainId — all correctly Sepolia-bound now, all flipping to the prod domain + `eip155:42161` at Phase 10. None is a hidden cache; all are env/constant-driven.

## Common Pitfalls

### Pitfall 1: The two transaction models are not interchangeable
**What goes wrong:** Building a modern Mini App SPA but expecting a legacy Frame `tx` server POST, or vice-versa. They have different entry points (meta `action.type`), different transaction surfaces (server JSON vs in-frame SDK), and different testability.
**Why it happens:** Both are called "Frames"/"Mini Apps" and both use `fc:frame`/`fc:miniapp`. The 3-month rename blurred them.
**How to avoid:** Decide explicitly. For the testable Sepolia deliverable, use the **legacy `fc:frame` `tx` endpoint** (server JSON, eip155:421614, unit-testable). Emit `fc:miniapp` in parallel for forward-compat, with `action.type:launch_miniapp` pointing at the receipt page. Defer the modern in-frame SPA tap-to-transact to Phase 10.
**Warning signs:** A plan task that says "the button calls `sendTransaction`" but also "the server returns the tx params" — that's conflating the two.

### Pitfall 2: `/.well-known` is NOT in the middleware allowlist
**What goes wrong:** `middleware.ts` `PUBLIC_PREFIXES` has `/api`, `/og`, `/call`, etc. — but NOT `/.well-known`. The matcher `'/((?!_next/static|_next/image|favicon.ico|public/).*)'` runs middleware on `/.well-known/farcaster.json`, so without the prefix a logged-out Farcaster crawler gets bounced to `/signin` and the manifest 302s.
**Why it happens:** The manifest is a new top-level path not covered by existing prefixes.
**How to avoid:** Add `'/.well-known'` to `PUBLIC_PREFIXES` (`apps/web/middleware.ts:50-70`). `/api/frame/*` is already covered by the `'/api'` prefix — verify, but no change needed there.
**Warning signs:** `curl https://<origin>/.well-known/farcaster.json` returns a 307/302 to `/signin` instead of JSON.

### Pitfall 3: One-tap tx requires a pre-existing USDC allowance
**What goes wrong:** A Frame `Follow`/`Fade`/`Challenge` button returns ONE `eth_sendTransaction`, but the contract `transferFrom`s USDC, which reverts unless `USDC.approve` was already called. The in-app flow is two-step; a single Frame tap can't do both.
**Why it happens:** ERC-20 allowance model + the single-transaction Frame button.
**How to avoid:** Per Pattern 3 — pick one: assume-allowance + deep-link fallback, ERC-2612 `permit` (native USDC supports it per CLAUDE.md), or first-tap-approves. Decide in the plan.
**Warning signs:** Tx simulates fine in isolation but reverts with `InsufficientUsdcAllowance` (a real CallRegistry error type, see `CallRegistry.ts:74-79`).

### Pitfall 4: Stale OG embed image on a status transition
**What goes wrong:** The embed `imageUrl` is `/og/:id?v={statusVersion}`. If the embed meta is rendered with a stale `statusVersion`, the cast shows the wrong card (e.g. Live card on a settled receipt).
**Why it happens:** `generateMetadata` fetches `live-state` with `next:{revalidate:60}`; the embed must use the SAME `statusVersion` the OG image does.
**How to avoid:** Build the embed `imageUrl` from the same `statusVersion` already fetched in `generateMetadata` (it's right there — `meta.statusVersion`). The Phase-7 auto-post worker also runs the cache-warm sequence before posting (`auto-post-worker.ts` runCacheWarm) — that already bumps `status_version` and re-warms the card, so the embed at post time is fresh.
**Warning signs:** Cast shows "LIVE" badge on a settled receipt, or a 404/fallback card.

### Pitfall 5: Dotted route segment `farcaster.json`
**What goes wrong:** Some bundlers mishandle a literal `farcaster.json` directory segment in App Router.
**Why it happens:** The dot in the folder name.
**How to avoid:** Verify `app/.well-known/farcaster.json/route.ts` serves `/.well-known/farcaster.json` in the actual build; if not, use a `next.config` rewrite to a dot-free route. Test with a real `curl` in CI.

## Code Examples

### Status-aware button selection (D-02) in the Frame `tx` route
```ts
// Source: relayer /api/calls/:id/live-state (apps/relayer/src/routes/live-state.ts)
//         status labels: 'Live' | 'Settled' | 'Disputed' | 'CallerExited'
async function selectButtons(callId: string) {
  const base = process.env.RELAYER_URL ?? process.env.NEXT_PUBLIC_RELAYER_URL ?? '';
  const res = await fetch(`${base}/api/calls/${callId}/live-state`, { next: { revalidate: 4 } });
  const s = res.ok ? (await res.json()).status as string : 'Live';
  const settled = s === 'Settled' || s === 'Disputed' || s === 'CallerExited';
  return settled
    ? ['Follow', 'Challenge', 'Quote']     // D-06 settled triplet (Fade dropped)
    : ['Follow', 'Fade', 'Challenge'];     // D-02 live triplet
}
```

### The three constructible one-tap calldata builders
```ts
// Source: apps/web/lib/abis/FollowFadeMarket.ts (follow/fade), ChallengeFormModal.tsx (CE_ABI)
// MIN_POSITION_USDC = 1_000_000n ($1, 6-dec) — packages/shared/src/constants/fees.ts
import { encodeFunctionData } from 'viem';
import { followFadeMarketAbi } from '@/lib/abis';

// Live Follow / Fade — one-tap min stake (D-07)
const followData = encodeFunctionData({ abi: followFadeMarketAbi, functionName: 'follow', args: [id, 1_000_000n, 0n] });
const fadeData   = encodeFunctionData({ abi: followFadeMarketAbi, functionName: 'fade',   args: [id, 1_000_000n, 0n] });

// Challenge — proposeChallenge(callId, stake). Stake = caller's matching stake (SOCIAL-30);
// for one-tap default to the caller's stake from live-state, or MIN_STAKE_USDC = 5_000_000n.
const challengeData = encodeFunctionData({
  abi: [{ type:'function', name:'proposeChallenge',
          inputs:[{name:'callId',type:'uint256'},{name:'stake',type:'uint96'}],
          outputs:[{name:'challengeId',type:'uint256'}], stateMutability:'nonpayable' }] as const,
  functionName: 'proposeChallenge', args: [id, 5_000_000n],
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Frames v1 (image + buttons, server-driven, `fc:frame:*` granular meta) | Frames v2 → renamed **Mini Apps** (full SPA in-frame, single `fc:miniapp` JSON meta) | rename announced with 3-month `fc:frame` deprecation (per ROADMAP); `fc:frame` still works | Emit `fc:miniapp` primary + `fc:frame` compat (D-03). The granular `fc:frame:button:N:*` v1 meta is legacy; the JSON-embed form is current. |
| Legacy Frame `tx` server endpoint (POST → eth_sendTransaction JSON) | Mini App SDK `sdk.wallet.getEthereumProvider()` → in-frame `sendTransaction` | Mini App SDK line (`@farcaster/miniapp-sdk@0.3.0`, `@farcaster/miniapp-wagmi-connector@2.0.0`) | The legacy server endpoint is the testable path; the SDK path is the production UX (Phase-10 live gate). |
| `imageUrl`/`buttonTitle` in manifest top-level | DEPRECATED — embed meta carries them | current spec | Manifest only needs `version`/`name`/`homeUrl`/`iconUrl`; don't rely on deprecated top-level image fields. |
| `warpcast.com/~/compose` | `warpcast.com`→`farcaster.xyz` domain migration in progress; `composeCast` SDK action for in-app | ongoing 2026 | The pure `warpcastComposeUrl` builder (07-RESEARCH A3) is already tagged `[ASSUMED]` "verify against current docs" — see Open Q3. |

**Deprecated/outdated:**
- Top-level manifest `imageUrl`/`buttonTitle` — moved into the embed meta.
- Frames v1 granular `fc:frame:button:N:action` meta — superseded by the JSON embed (legacy clients still parse it).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@farcaster/miniapp-sdk@0.3.0` and `@farcaster/miniapp-wagmi-connector@2.0.0` are the correct packages for the modern SPA path. | Standard Stack / Audit | Name discovered via WebSearch; registry-confirmed but ASSUMED per provenance. Only needed if the SPA is scoped now (it need not be). Planner gates install behind checkpoint. |
| A2 | The `warpcastComposeUrl` shape (`warpcast.com/~/compose?text=&embeds[]=`) still lands a cast and carries the embed in mid-2026. | Pattern 4 / SOTA | Inherited `[ASSUMED]` from 07-RESEARCH A3. If the domain migrated to `farcaster.xyz/~/compose`, the auto-post intent URL needs updating (one-line change in `share-text.ts`). See Open Q3. |
| A3 | The legacy Frame `tx` wire format (`{chainId,method,params:{abi,to,data,value}}`) is still accepted by current Warpcast for casts that also carry `fc:miniapp`. | Pattern 3 | Cross-verified via frames.js + Base docs, but the legacy path is mid-deprecation. If dropped, the only testable transaction surface becomes the in-frame SDK (Phase-10-only), and Phase 8's SC2 testnet assertion narrows to "calldata is well-formed" (still satisfiable via a pure unit test). |
| A4 | Settled `Follow` (social) has no on-chain function and is the off-chain follow-graph. | Resp. Map / Open Q1 | Verified against `ProfileRegistry.ts` (no follow fn) + `social-link.ts` (`follow_graph` table). Low risk; it's a codebase fact. The risk is in how the plan routes the button, not in the finding. |
| A5 | Splash/icon static assets can be added to `apps/web/public`. | Runtime State Inventory | Standard Next.js public-asset behavior; low risk. If missing, manifest URLs 404 (caught in validation). |

## Open Questions

1. **Settled-cast `Follow` (D-06) maps to an off-chain follow-graph, not a contract — how does a Frame tap execute it?**
   - What we know: There is no on-chain social-follow. The follow-graph lives in the relayer (`follow_graph` Postgres + Redis, written by `/api/social/*`, Privy/SIWF-gated). A Frame `tx` button can only return an `eth_sendTransaction` — it cannot call a relayer REST endpoint.
   - What's unclear: Whether settled `Follow` should (a) deep-link to `Open in Call It` for v1 (simplest, satisfies "interactive" loosely), (b) be implemented only in the modern in-frame SPA (which CAN call the relayer follow API with the user's session — but that's the Phase-10 SPA), or (c) be out of scope until a profile-level on-chain follow exists.
   - Recommendation: **For Phase 8 testnet, route settled `Follow` to the `Open in Call It` deep-link** (the UI-SPEC already defines that affordance). Flag (b) as the Phase-10 SPA enhancement. Ask the user to confirm at discuss-phase. This keeps the settled triplet's `Challenge` (real one-tap tx) and `Quote` honest while not faking an on-chain follow.

2. **`Quote` is `createCall(...parentCallId)` — it needs full market params + ~$15 (createCall fee + min stake). Can it be one-tap?**
   - What we know: `createCall` takes 12 args (marketType, assets, target, expiry, stake, conviction, criteriaHash, parentCallId, ...) and (per Phase-7 memory) needs $5 stake + $10 market-creation fee. That is not fixed one-tap calldata.
   - What's unclear: Whether `Quote` should deep-link to a pre-filled new-call form (`/new?parent=:id`) or be dropped from the testnet Frame.
   - Recommendation: **Route `Quote` to the `Open in Call It` deep-link** (a pre-filled quote-call form on the receipt/new-call page). Do not attempt one-tap. Confirm with user.

3. **Has the Warpcast compose-intent URL migrated to `farcaster.xyz`?**
   - What we know: A `warpcast.com`→`farcaster.xyz` migration is underway; `warpcastComposeUrl` is already `[ASSUMED]`-tagged in `share-text.ts`.
   - What's unclear: The exact current canonical compose-intent host/path in mid-2026.
   - Recommendation: Verify the live compose URL at plan/execute time; if changed, it's a one-line update to the pure builder in `packages/shared/src/share/share-text.ts` (and the test). Low effort, low risk.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Next.js App Router route handlers | manifest + Frame `tx` routes | ✓ | 16.2.6 (repo) | — |
| viem `encodeFunctionData` | Frame `tx` calldata | ✓ | 2.50.4 (repo) | — |
| Existing OG routes | embed image | ✓ | Phase 7 | — |
| relayer `/api/calls/:id/live-state` | status-aware buttons | ✓ | Phase 2/CR-04 | subgraph `Call` |
| `@call-it/shared` share builders | manual share-as-frame | ✓ | Phase 7 | — |
| Deployed Sepolia contracts (CR/FFM/CE) | tx calldata targets | ✓ | addresses.ts (Phase 6 recovery cluster) | — |
| `@farcaster/miniapp-sdk` / `-wagmi-connector` | modern in-frame SPA ONLY | ✗ (not installed) | 0.3.0 / 2.0.0 `[ASSUMED]` | Not needed for the testable legacy path; deferable to Phase 10 |
| Production Warpcast on a supported chain | live tap-to-transact | ✗ (Sepolia not in chainList) | — | NONE on testnet — correctly Phase-10 gate (D-01) |
| `icon.png` (1024×1024) + `splash.png` (200×200) static assets | manifest/embed image URLs | ✗ (not in public/) | — | Add as Wave-0 assets |

**Missing dependencies with no fallback:**
- Live in-Warpcast tap-to-transact on Arbitrum Sepolia — impossible (421614 not in supported chainList). Correctly deferred to Phase 10 (mainnet, eip155:42161). This is the SC2 live proof D-01 gates.

**Missing dependencies with fallback:**
- `@farcaster/*` SPA packages — not needed for the testable legacy `fc:frame` path; defer to Phase 10.
- `icon.png`/`splash.png` — add to `apps/web/public` in Wave 0.

## Validation Architecture

> Nyquist validation is enabled (`workflow.nyquist_validation` not false in config). Phase 8 is highly validatable on testnet via schema/HTML assertions, with exactly ONE genuinely-deferred live gate.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (repo standard for web/relayer unit tests) + `forge` for contracts (not relevant here) |
| Config file | `apps/web/vitest.config.*` (confirm at Wave 0) |
| Quick run command | `pnpm --filter @call-it/web test` (per-file: `vitest run <path>`) |
| Full suite command | `pnpm -r test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SHARE-19 (SC1a) | Receipt HTML head contains `fc:miniapp` + `fc:frame` meta with valid embed JSON (version, imageUrl, button.action.type) | unit (render `generateMetadata` → assert `other` keys + JSON.parse shape) | `vitest run apps/web/.../layout.embed.test.ts` | ❌ Wave 0 |
| SHARE-19 (SC1b) | `GET /.well-known/farcaster.json` returns 200 + `miniapp` config with required fields (version="1", name, homeUrl, iconUrl), NO `accountAssociation` | unit (invoke route GET, assert schema) | `vitest run apps/web/.../farcaster-manifest.test.ts` | ❌ Wave 0 |
| SHARE-19 (SC1c) | Manifest + Frame routes are public (not bounced by middleware) | unit (middleware `isPublicRoute('/.well-known/farcaster.json')` === true) | `vitest run apps/web/middleware.test.ts` | ❌ Wave 0 |
| SHARE-19 (SC2) | Frame `tx` endpoint returns well-formed `{chainId:"eip155:421614", method:"eth_sendTransaction", params:{abi,to,data}}` for a known callId, with status-correct button set (D-02) | unit (POST mock packet, assert wire shape + `decodeFunctionData(data)` === expected fn+args) | `vitest run apps/web/.../frame-tx.test.ts` | ❌ Wave 0 |
| SHARE-19 (SC2) | One-tap Follow/Fade calldata encodes `(callId, 1_000_000n, 0n)` (min $1, D-07) | unit (encode→decode round-trip) | same file | ❌ Wave 0 |
| SHARE-19 (SC3) | Embed `imageUrl` resolves to the existing OG route at the current `statusVersion` (1200×630 = 3:2) | unit (assert imageUrl === `/og/:id?v=sv`) + existing OG tests | `vitest run apps/web/.../layout.embed.test.ts` | partial (OG tests exist) |
| SHARE-19 (SC3) | Auto-post worker's `warpcastUrl` carries the receipt URL (embed rides automatically) | unit (existing auto-post worker test asserts `warpcastUrl`) | `vitest run apps/relayer/.../auto-post-worker.test.ts` | ✅ exists (extend) |
| SHARE-19 (manifest validity) | Embed/manifest validate against the Farcaster Mini App embed debugger schema | manual/tool (Farcaster embed validator) — optional, supplements the schema unit test | n/a (manual) | n/a |

### Sampling Rate
- **Per task commit:** `pnpm --filter @call-it/web test` (web unit tests; <30s).
- **Per wave merge:** `pnpm -r test` (web + relayer).
- **Phase gate:** Full suite green; plus a `curl` smoke against the deployed Sepolia origin: `/.well-known/farcaster.json` returns 200 JSON, `/call/:id` HTML contains both meta tags, `POST /api/frame/tx/:id` returns the wire JSON.

### Wave 0 Gaps
- [ ] `apps/web/app/call/[id]/layout.embed.test.ts` — covers SC1a/SC3 (embed meta shape + imageUrl)
- [ ] `apps/web/app/.well-known/farcaster.json/route.test.ts` — covers SC1b (manifest schema, no accountAssociation)
- [ ] `apps/web/app/api/frame/tx/[callId]/route.test.ts` — covers SC2 (wire format + status-aware buttons + calldata round-trip)
- [ ] `apps/web/middleware.test.ts` (or extend existing) — covers SC1c (`/.well-known` public)
- [ ] `apps/web/public/icon.png` (1024×1024 PNG no alpha) + `apps/web/public/splash.png` (200×200) — Wave-0 static assets
- [ ] Extend `apps/relayer/src/workers/__tests__/auto-post-worker.test.ts` — assert the receipt URL carries the embed (no payload change)

### What genuinely CANNOT be validated on testnet (correctly Phase-10)
- **The live in-Warpcast tap-to-broadcast (SC2 live proof).** Arbitrum Sepolia (421614) is not in Warpcast's supported chainList, so a real broadcast cannot occur on testnet. This is exactly D-01's deferral. Phase 8 proves the wire format is well-formed; Phase 10 proves the live tap on eip155:42161.
- **`addMiniApp` / catalog discoverability + notifications.** Require a signed `accountAssociation` on the stable production domain (D-05/D-04) — Phase 10.

## Security Domain

> `security_enforcement` not explicitly false → included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Frame/manifest routes are intentionally public (read + tx-construction). The wallet auth happens in the Farcaster client; the tx is signed by the user's wallet, not the server. |
| V3 Session Management | no | Stateless routes; no session created. |
| V4 Access Control | yes | Manifest + `/api/frame/*` MUST be public (middleware carve-out). The `tx` endpoint must NOT trust the POST body's claimed wallet address for anything beyond display — it returns calldata; the user's wallet signs. Never embed a server-side signer. |
| V5 Input Validation | yes | Validate `callId` (numeric, > 0) in the Frame `tx` route exactly like the OG route does (`BigInt(callIdStr)`, reject 0). Reject out-of-range. The signature-packet body is untrusted. |
| V6 Cryptography | no | No new crypto. `accountAssociation` (the only signed artifact) is deferred to Phase 10; do not hand-roll its signing — use the official Farcaster manifest-signing tool. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Frame `tx` route returns calldata to a wrong/attacker contract | Tampering | `to` MUST come from `@call-it/shared` pinned Sepolia addresses (never from request params) — mirror the W11 rule already used elsewhere (`addresses.ts`). |
| Malicious `callId` (overflow / 0 / non-numeric) in tx or manifest route | Tampering/DoS | Parse with `BigInt`, reject 0 and non-numeric (same guard as `/og/[callId]/route.ts:739-750`). |
| Untrusted statement/handle rendered into embed/cast | XSS / injection | `buildShareText` already URL-encodes; embed JSON is `JSON.stringify`-escaped in the meta `content`. Do not concatenate raw user strings into the meta tag. |
| One-tap tx with wrong amount drains more than $1 | Tampering | Hardcode `MIN_POSITION_USDC` (1_000_000n) for one-tap; never read the amount from the Frame POST body. Larger stakes go through the deep-link, not the Frame. |
| Public manifest leaks internal config | Information Disclosure | Manifest is public by design and contains only display config (name, URLs, colors). No secrets. `accountAssociation` (Phase 10) is a domain proof, not a secret to hide. |
| Server-side signer in the tx route | Elevation of Privilege | NEVER. The route returns calldata only; the user's Warpcast wallet signs and broadcasts. No private key in `apps/web`. |

## Sources

### Primary (HIGH confidence)
- https://miniapps.farcaster.xyz/docs/guides/sharing — embed meta tag names (`fc:miniapp` + `fc:frame`), embed JSON schema, image constraints (3:2, 600×400–3000×2000, <10MB) — checked 2026-06-08
- https://miniapps.farcaster.xyz/docs/specification — manifest required/optional fields, `accountAssociation` purpose (NOT required for feed embed render), deprecated top-level `imageUrl`/`buttonTitle`, supported-chains delegation — checked 2026-06-08
- https://miniapps.farcaster.xyz/docs/guides/wallets — Mini App SDK transaction model (`sdk.wallet.getEthereumProvider()`, `@farcaster/miniapp-wagmi-connector`) — checked 2026-06-08
- https://miniapps.farcaster.xyz/docs/sdk/actions/compose-cast — `composeCast` SDK action signature — checked 2026-06-08
- Codebase (this repo): `apps/web/app/call/[id]/layout.tsx`, `middleware.ts`, `apps/web/app/og/[callId]/route.ts`, `apps/web/lib/abis/{FollowFadeMarket,CallRegistry,ProfileRegistry}.ts`, `apps/web/app/components/ChallengeFormModal.tsx`, `apps/relayer/src/workers/auto-post-worker.ts`, `apps/relayer/src/routes/live-state.ts`, `apps/relayer/src/routes/social-link.ts`, `apps/relayer/src/index.ts`, `packages/shared/src/share/share-text.ts`, `packages/shared/src/constants/{addresses,fees,usdc}.ts` — read 2026-06-08
- npm registry (`npm view`): `@farcaster/miniapp-sdk@0.3.0`, `@farcaster/miniapp-wagmi-connector@2.0.0`, `@farcaster/frame-sdk@0.2.0`, `@farcaster/auth-kit@0.8.2` — 2026-06-08

### Secondary (MEDIUM confidence)
- https://framesjs.org/reference/core/transaction + https://docs.base.org/cookbook/use-case-guides/transactions — legacy Frame `tx` action wire format (`{chainId, method:'eth_sendTransaction', params:{abi,to,value,data}}`) — checked 2026-06-08
- github.com/farcasterxyz/miniapps discussion #240 + "Building Farcaster Mini Apps on Arbitrum" (Paragraph) + miniapps.farcaster.xyz/docs/sdk/detecting-capabilities — supported chains include Arbitrum One (eip155:42161); Arbitrum Sepolia (421614) NOT in the supported chainList — checked 2026-06-08

### Tertiary (LOW confidence)
- WebSearch on Warpcast compose-intent URL `farcaster.xyz` migration — inconclusive on the exact current host; flagged as Open Q3 (already `[ASSUMED]` in `share-text.ts`).

## Metadata

**Confidence breakdown:**
- Embed/manifest spec: HIGH — pinned against official miniapps.farcaster.xyz docs with literal examples, 2026-06-08.
- Transaction model: HIGH — the two-model distinction and the legacy wire format are cross-verified (frames.js + Base docs); the chainList exclusion of Sepolia is independently sourced and aligns with D-01.
- Button→contract mapping: HIGH — built directly from the repo's real ABIs; the two no-on-chain-path findings (social Follow, Quote) are codebase facts.
- Auto-post wiring: HIGH — exact file/function/line located.
- Package versions (`@farcaster/*`): MEDIUM — registry-confirmed but ASSUMED provenance (WebSearch-discovered); slopcheck unavailable; planner gates installs. Not needed for the testable scope.

**Research date:** 2026-06-08
**Valid until:** 2026-06-22 (7 days — the Mini App spec is mid-deprecation/migration and fast-moving; re-verify the embed/tx/compose-URL specifics at plan time per D-03).

## RESEARCH COMPLETE

**Phase:** 8 - farcaster-mini-apps
**Confidence:** HIGH

### Key Findings
- **Two incompatible transaction models exist.** The testable Sepolia deliverable is the **legacy `fc:frame` `tx` server endpoint** (returns `{chainId:"eip155:421614", method:"eth_sendTransaction", params:{abi,to,data}}` JSON, unit-testable). The modern Mini App SDK (`@farcaster/miniapp-*`, in-frame `sendTransaction`) is the production UX whose live tap is the Phase-10 gate. Emit `fc:miniapp` + `fc:frame` (D-03) — only `action.type` differs.
- **Arbitrum Sepolia (eip155:421614) is NOT in Warpcast's supported chainList; Arbitrum One (eip155:42161) is.** This is direct evidence that live tap-to-transact cannot occur on testnet — validating D-01's deferral. Build the wire now, prove the live tap on mainnet.
- **Two of four button actions have no one-tap on-chain path:** settled `Follow` (social) is an **off-chain follow-graph** op (no ProfileRegistry follow fn exists), and `Quote` (`createCall` + parentCallId) needs full market params + ~$15. Both should route to the `Open in Call It` deep-link for v1 (Open Q1/Q2 — confirm with user).
- **Unsigned Sepolia manifest is sufficient for SC1:** the feed embed renders WITHOUT a signed `accountAssociation` (which only gates `addMiniApp`/discoverability/notifications) — confirming D-05's deferral is safe for cast rendering.
- **The embed rides the existing auto-post automatically** (`auto-post-worker.ts` already builds `warpcastComposeUrl(receiptUrl,...)`; the embed is a property of the receipt URL's HTML — no payload change). Two middleware/asset gotchas: add `/.well-known` to `PUBLIC_PREFIXES`, and add `icon.png`/`splash.png` static assets.

### File Created
`.planning/phases/08-farcaster-mini-apps/08-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Spec pinned against official docs; zero new deps for the testable path; viem already present |
| Architecture | HIGH | Transaction model cross-verified; button→contract map from real ABIs; auto-post wiring located by line |
| Pitfalls | HIGH | USDC-allowance one-tap blocker, middleware carve-out, dotted route, stale OG version — all grounded in repo facts |

### Open Questions
1. Settled `Follow` (social) has no on-chain path → recommend deep-link for v1; confirm with user (or Phase-10 SPA calls relayer follow API).
2. `Quote` (createCall+parentCallId) is not one-tap (~$15, 12 params) → recommend deep-link; confirm with user.
3. Warpcast compose-intent URL may have migrated to `farcaster.xyz` → one-line fix in `share-text.ts` if so; verify at plan time.

### Ready for Planning
Research complete. The planner can scope SHARE-19 as: embed meta (Pattern 1) + manifest body (Pattern 2, no accountAssociation) + legacy Frame `tx` endpoint for the two constructible one-tap actions (Pattern 3) + deep-link routing for the two non-constructible actions + auto-post/share-as-Frame reuse (Pattern 4), with the live tap-to-transact correctly gated to Phase 10. Resolve Open Q1/Q2 at discuss-phase before locking the settled-triplet behavior.
