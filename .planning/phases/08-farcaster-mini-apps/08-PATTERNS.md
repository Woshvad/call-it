# Phase 8: Farcaster Mini Apps - Pattern Map

**Mapped:** 2026-06-08
**Files analyzed:** 9 (3 new code, 3 modified, 2 new static assets, 1 reuse-unchanged group)
**Analogs found:** 6 / 6 (all code files have a strong in-repo analog)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| **NEW** `apps/web/app/.well-known/farcaster.json/route.ts` | route handler | request-response (static JSON) | `apps/web/app/og/[callId]/route.ts` | role-match (route handler, JSON vs image body) |
| **NEW** `apps/web/app/api/frame/tx/[callId]/route.ts` | route handler | request-response (reads relayer + builds calldata) | `apps/web/app/og/[callId]/route.ts` (RPC/relayer read + viem) + `layout.tsx` (live-state fetch) | exact (same tier, same sources) |
| **MODIFIED** `apps/web/app/call/[id]/layout.tsx` | config (SSR metadata) | request-response | itself — extend existing `generateMetadata` return | exact (self-extension) |
| **MODIFIED** `apps/web/middleware.ts` | middleware | request-response | itself — `PUBLIC_PREFIXES` array | exact (self-extension) |
| **MODIFIED (reuse)** `apps/web/lib/share-text.ts` + `packages/shared/src/share/share-text.ts` | utility | transform (pure builder) | itself — `warpcastComposeUrl` | exact (no signature change expected; possible 1-line host update, Open Q3) |
| **MODIFIED (verify-only)** `apps/relayer/src/workers/auto-post-worker.ts` | worker | event-driven | itself — `makeProcessCall` | exact (embed rides receiptUrl; no payload change) |
| **NEW asset** `apps/web/public/icon.png` (1024×1024, no alpha) | static asset | file-I/O | (none — `public/` has no PNGs yet) | no analog |
| **NEW asset** `apps/web/public/splash.png` (200×200) | static asset | file-I/O | (none) | no analog |
| **REUSE UNCHANGED** `apps/web/app/og/[callId]/route.ts`, `/og/duel/[challengeId]/route.ts`, `lib/abis/*`, `addresses.ts` | — | — | — | locked Phase-7 assets |

> Routing note (RESEARCH Pitfall 5): verify the dotted folder segment `farcaster.json` builds to the literal path `/.well-known/farcaster.json`; if the bundler rejects it, fall back to `app/api/farcaster-manifest/route.ts` + a `next.config` rewrite.

---

## Pattern Assignments

### `apps/web/app/.well-known/farcaster.json/route.ts` (NEW — route handler)

**Analog:** `apps/web/app/og/[callId]/route.ts`

**Runtime + handler skeleton to replicate** (analog lines 26, 722–726, 941):
```ts
export const runtime = 'nodejs';   // analog line 26 — CRITICAL, NOT 'edge'
// analog GET handler shape + the Cache-Control header it sets at line 941:
//   resp.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
```

**Env base-URL pattern to replicate** (RESEARCH Runtime State Inventory — source from env, never hardcode origin):
```ts
const base = process.env.NEXT_PUBLIC_OG_BASE_URL ?? '';
return Response.json({
  // accountAssociation OMITTED on Sepolia (D-05 — added Phase 10)
  miniapp: { version: '1', name: 'Call It', homeUrl: base,
    iconUrl: `${base}/icon.png`, splashImageUrl: `${base}/splash.png`,
    splashBackgroundColor: '#09090E' },
});
```
**Replicate:** `export const runtime = 'nodejs'`, the env-derived base URL, public/no-auth.
**Differs:** body is static JSON (`Response.json`), not an `ImageResponse`; no viem reads; no route params.

---

### `apps/web/app/api/frame/tx/[callId]/route.ts` (NEW — route handler, status-aware tx wire)

**Analog (status read):** `apps/web/app/call/[id]/layout.tsx` `fetchCallMeta` (lines 27–55)
**Analog (calldata build + ABI/address imports):** `apps/web/app/og/[callId]/route.ts` (lines 35–41, 763–768)

**Relayer live-state read pattern to replicate** (layout.tsx lines 31–44):
```ts
const relayerUrl =
  process.env['RELAYER_URL'] ?? process.env['NEXT_PUBLIC_RELAYER_URL'] ?? '';
const res = await fetch(`${relayerUrl}/api/calls/${callId}/live-state`, {
  next: { revalidate: 4 },   // RESEARCH: 4s for status-aware buttons (layout uses 60)
});
const data = (await res.json()) as { status?: string };
// settled = status ∈ {'Settled','Disputed','CallerExited'} → D-06 triplet
//   else → D-02 live triplet ['Follow','Fade','Challenge']
```

**ABI + address import pattern to replicate** (og route lines 35–39):
```ts
import { FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA, CHALLENGE_ESCROW_ARBITRUM_SEPOLIA } from '@call-it/shared';
import { followFadeMarketAbi } from '@/lib/abis/FollowFadeMarket';
```
> Verified exports exist: `FollowFadeMarket.ts` has `follow(callId,amountIn,minSharesOut)` (lines 14–22) and `fade(...)` (25–33) with empty outputs; `addresses.ts` exports `FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA` (line 128) + `CHALLENGE_ESCROW_ARBITRUM_SEPOLIA` (line 169). The `proposeChallenge(callId uint256, stake uint96)→uint256` ABI slice already exists inline as `CE_ABI` in `ChallengeFormModal.tsx` lines 39–50 — promote to `lib/abis/ChallengeEscrow.ts` or inline-copy.

**Calldata build (viem `encodeFunctionData`) — the new logic** (RESEARCH Pattern 3 / Code Examples):
```ts
import { encodeFunctionData } from 'viem';
const data = encodeFunctionData({ abi: followFadeMarketAbi, functionName: 'follow',
  args: [BigInt(callId), 1_000_000n, 0n] });   // $1 min (D-07)
return Response.json({
  chainId: 'eip155:421614',                     // Arbitrum Sepolia (mainnet eip155:42161 = Phase 10)
  method: 'eth_sendTransaction',
  params: { abi: followFadeMarketAbi, to: FOLLOW_FADE_MARKET_ARBITRUM_SEPOLIA, data, value: '0' },
});
```
**Replicate:** `runtime='nodejs'`, relayer-fetch fail-safe pattern (try/catch → default 'Live'), ABI/address imports.
**Differs:** returns the eth_sendTransaction wire JSON (new shape); selects button set by status. **Open Qs:** settled `Follow` (off-chain follow-graph — no contract fn) and `Quote` (`createCall`, ~$15, 12 params) route to the deep-link, NOT one-tap (D-06a). USDC-allowance gotcha (RESEARCH Pitfall 3) — single tx can't approve+act.

---

### `apps/web/app/call/[id]/layout.tsx` (MODIFIED — add embed meta)

**Analog:** itself — the existing `generateMetadata` return (lines 72–94).

**Exact insertion point** — the current return already builds `ogImageUrl` (line 70) and returns `openGraph`/`twitter`. Add a sibling `other` key:
```ts
const ogImageUrl = `/og/${id}?v=${statusVersion}`;   // EXISTING line 70 — reuse same statusVersion (Pitfall 4)
// ... existing return { title, description, openGraph:{...}, twitter:{...} }
// ADD inside the returned object:
  other: {
    'fc:miniapp': JSON.stringify(miniappEmbed),   // action.type: 'launch_miniapp'
    'fc:frame': JSON.stringify(frameEmbed),       // compat — only diff is action.type: 'launch_frame'
  },
```
where `miniappEmbed` uses `imageUrl` built from the **same `statusVersion`** already fetched at line 60 (Pitfall 4 — avoid stale card) and `splashImageUrl: ${base}/splash.png` (must be 200×200).
**Replicate:** `Metadata.other` is the App-Router-native escape hatch matching the existing `openGraph`/`twitter` blocks; reuse `statusVersion` from `fetchCallMeta`.
**Differs:** emit BOTH `fc:miniapp` and `fc:frame` (D-03). Embed image is the unchanged `/og/:id?v=sv` (1200×630 = 3:2 ✓).

---

### `apps/web/middleware.ts` (MODIFIED — public carve-out)

**Analog:** itself — `PUBLIC_PREFIXES` (lines 50–70) consumed by `isPublicRoute` (lines 72–74).

**Exact current array (insertion target):**
```ts
const PUBLIC_PREFIXES = [
  '/signin', '/og', '/api', '/_next', '/favicon.ico', '/fonts',
  '/call', '/duel', '/profile', '/leaderboard', '/dev',
];
```
**Change:** add `'/.well-known'`. `/api/frame/*` is already covered by the existing `'/api'` prefix (verify, no change). Without `'/.well-known'`, a logged-out Farcaster crawler is bounced to `/signin` and the manifest 302s (RESEARCH Pitfall 2).
**Replicate:** the existing `startsWith`-prefix model.
**Differs:** one new prefix string.

---

### `apps/web/lib/share-text.ts` + `packages/shared/src/share/share-text.ts` (MODIFIED / reuse)

**Analog:** itself — `warpcastComposeUrl` (shared, lines 33–35).
```ts
export function warpcastComposeUrl(receiptUrl: string, text: string): string {
  return `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(receiptUrl)}`;
}
```
**Replicate:** keep the **purity contract** (no env, no network, no secrets — header comment lines 13–22). The web `lib/share-text.ts` is a pure re-export (do not add logic there).
**Differs:** the `[ASSUMED]` flag on the compose host (Open Q3 — possible `warpcast.com`→`farcaster.xyz` migration). If confirmed migrated, it is a **one-line change** to this builder + its test. No signature change.

---

### `apps/relayer/src/workers/auto-post-worker.ts` (MODIFIED / verify-only)

**Analog:** itself — `makeProcessCall` → `receiptUrl` + `warpcastComposeUrl` (lines 248–258).
```ts
const receiptUrl = `${base}/call/${callId}`;                       // line 252
const text = buildShareText({ outcomeWord, handle, statement: undefined });
const warpcastUrl = warpcastComposeUrl(receiptUrl, text);          // line 258
```
**Replicate / confirm:** the embed rides `receiptUrl` automatically once the receipt HTML carries the `fc:miniapp`/`fc:frame` meta (Pattern 1) — **no payload/embeds change needed** (RESEARCH Pattern 4). The cache-warm sequence (`runCacheWarm`, lines 155–232) already bumps `status_version` and re-warms the card before posting, so the embed image is fresh at post time (mitigates Pitfall 4).
**Differs:** nothing structural required. Existing test `auto-post-worker.test.ts` asserts `warpcastUrl` — extend if desired.

---

## Shared Patterns

### Route-handler conventions (Pitfall 6 / repo mandate)
**Source:** `apps/web/app/og/[callId]/route.ts` lines 26, 941
**Apply to:** both new route handlers (`farcaster.json`, `frame/tx`)
```ts
export const runtime = 'nodejs';                                              // never 'edge'
resp.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
```

### Fail-safe relayer status read
**Source:** `apps/web/app/call/[id]/layout.tsx` lines 27–55 (try/catch → null), RESEARCH Code Examples (default 'Live')
**Apply to:** `frame/tx` route status detection
```ts
const relayerUrl = process.env['RELAYER_URL'] ?? process.env['NEXT_PUBLIC_RELAYER_URL'] ?? '';
// fetch /api/calls/:id/live-state; on !ok or throw → default status 'Live' (live triplet)
```

### Env-derived origin (never hardcode)
**Source:** RESEARCH Runtime State Inventory; OG route uses `NEXT_PUBLIC_BRAND_FOOTER` env (line 737)
**Apply to:** manifest `homeUrl`/`iconUrl`/`splashImageUrl`, embed `url`/`imageUrl` — all from `NEXT_PUBLIC_OG_BASE_URL` so Phase-10 domain cutover re-points automatically.

### Calldata encoding
**Source:** viem `encodeFunctionData` against const-typed ABIs (`lib/abis/FollowFadeMarket.ts`, `CE_ABI` in `ChallengeFormModal.tsx:39–50`)
**Apply to:** all three constructible one-tap actions (Live Follow/Fade, Challenge). Chain id `eip155:421614` (Sepolia).

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `apps/web/public/icon.png` (1024×1024 PNG, no alpha) | static asset | file-I/O | `apps/web/public/` has no PNG assets yet; manifest/embed will 404 without it (Wave-0 task) |
| `apps/web/public/splash.png` (200×200) | static asset | file-I/O | same — Wave-0 asset |

> No code analog exists for the **modern Mini App SPA** path (`@farcaster/miniapp-sdk` / `-wagmi-connector`) — that path is deferred to Phase 10 and is not part of the testable Sepolia deliverable (RESEARCH Standard Stack recommendation: ship SHARE-19 with zero new npm deps).

## Metadata

**Analog search scope:** `apps/web/app/{og,call}`, `apps/web/lib`, `apps/web/middleware.ts`, `apps/relayer/src/workers`, `packages/shared/src/{share,constants}`, `apps/web/lib/abis`
**Files scanned (read in full or targeted):** layout.tsx, og/[callId]/route.ts, middleware.ts, share-text.ts (web + shared), auto-post-worker.ts, abis/index.ts, FollowFadeMarket.ts (grep), ChallengeFormModal.tsx (grep + slice), addresses.ts (grep)
**Pattern extraction date:** 2026-06-08

## PATTERN MAPPING COMPLETE

**Phase:** 08 - farcaster-mini-apps
**Files classified:** 9
**Analogs found:** 6 / 6 (code files); 2 static assets have no analog (expected)

### Coverage
- Files with exact analog: 5 (layout, middleware, share-text, auto-post-worker, frame/tx)
- Files with role-match analog: 1 (farcaster.json manifest route)
- Files with no analog: 2 (icon.png, splash.png static assets — Wave 0)

### Key Patterns Identified
- All new route handlers copy the OG route's `export const runtime = 'nodejs'` + `Cache-Control: public, max-age=60, stale-while-revalidate=300`; public via middleware carve-out.
- Status-aware button selection reuses `layout.tsx`'s fail-safe relayer `/api/calls/:id/live-state` fetch (try/catch → default 'Live'); calldata built with viem `encodeFunctionData` against existing const-typed ABIs + `@call-it/shared` Sepolia addresses — zero new ABIs/deps.
- Embed meta is additive: a new `Metadata.other` key beside the existing `openGraph`/`twitter` blocks, reusing the same `statusVersion` already fetched (Pitfall 4); the auto-post embed rides the unchanged `warpcastComposeUrl(receiptUrl, …)` with no payload change.

### File Created
`.planning/phases/08-farcaster-mini-apps/08-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can reference analog files + line-exact excerpts directly in PLAN.md actions.
