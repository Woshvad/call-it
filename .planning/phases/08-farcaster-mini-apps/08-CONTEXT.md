# Phase 8: Farcaster Mini Apps - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Layer a **Farcaster Mini App** (formerly Frames v2) distribution surface on top of Phase 7's share loop, on **testnet** (Arbitrum Sepolia recovery cluster). The receipt page server-renders Mini App embed meta (`fc:miniapp` primary + legacy `fc:frame` compat) and a `/.well-known/farcaster.json` manifest pointing at a Frame server endpoint, so a Farcaster client (Warpcast) renders the existing Phase-7 OG card and shows **context-aware** Follow / Fade / Challenge / Quote action buttons that drive the same Phase 1.5 / Phase 2 / Phase 3 contract paths via the Frame transaction protocol — without forcing the user out of Warpcast. Delivers **SHARE-19**.

**This is the "if time permits" final distribution phase.** Per the project's consistent testnet-now / mainnet-Phase-10 split, Phase 8 builds the **full mechanism** (Frame endpoint + transaction construction + manifest + embed + auto-post wiring) on Sepolia. The pieces that require live mainnet infrastructure — the actual in-Warpcast tap-to-transact verification, the signed account-association for the production domain, and Mini App catalog submission — are explicitly deferred to **Phase 10** (mainnet deploy). This mirrors Phase 7's D-02 ("build full mechanism, gate the live-infra part") and D-04 (Sepolia Vercel origin now, `api.callitapp.xyz` cutover in Phase 10).

**Out of scope (own phases):** new contract logic (all Follow/Fade/Challenge/Quote contracts already exist, Phases 1.5/2/3); mobile-responsive web pages (Phase 9); mainnet anything (Phase 10).
</domain>

<decisions>
## Implementation Decisions

### Scope vs. testnet reality
- **D-01:** **Build the full Frame transaction mechanism now on Sepolia; verify live tap-to-transact on mainnet (Phase 10).** Phase 8 ships the complete Frame server endpoint, transaction-data construction, manifest, and embed meta against the Sepolia recovery cluster. The actual in-Warpcast tap-to-transact verification (which depends on production Warpcast + a chain Warpcast will broadcast to) is a **Phase-10 mainnet task** — do not block Phase 8 verification on broadcasting a Sepolia transaction through production Warpcast (an external dependency we don't control). Directly mirrors Phase 7 D-02. The phase is **code-complete** on testnet; the live Warpcast-transaction proof is the Phase-10 gate.

### Button semantics — context-aware by call status
- **D-02:** **The Frame's action buttons are context-aware on the call's status** (the Frame endpoint reads call status before rendering buttons):
  - **Live-call cast** → `Follow` and `Fade` are real **FollowFadeMarket** staked positions (Phase 2); `Challenge` proposes a 1v1 via **ChallengeEscrow** (Phase 3).
  - **Settled-receipt cast** (the auto-posted variant) → `Follow` = **social-follow the caller's profile** (ProfileRegistry, Phase 1.5); `Challenge` = 1v1 (ChallengeEscrow, Phase 3); `Quote` = quote-call the settled receipt. (See D-06 for the settled triplet rationale — `Fade` is dropped on settled because the market is closed.)
- **D-06:** **Settled-cast button triplet = `Follow-person` · `Challenge` · `Quote`** (all three are real onchain actions, keeping the settled Frame fully interactive). `Quote` uses the existing quote-call path (CallRegistry). This replaces `Fade`, which is meaningless once a call has settled.
- **D-07:** **In-frame Live Follow/Fade default to the minimum stake** ($1 min follow / min fade per the safety caps) as a one-tap transaction. Users wanting a larger stake use the **"Open in Call It"** deep-link to the call page. Keeps the Frame within the one-tap Frame-transaction-protocol constraint and avoids unreliable cross-client amount-input UX.

### Embed / manifest format
- **D-03:** **Target the current Mini App embed (`fc:miniapp` meta + Mini App SDK) as primary, and also emit the legacy `fc:frame` meta tag for backward compatibility.** The ROADMAP goal notes Frames v2 was renamed to Mini Apps with a 3-month deprecation and that `fc:frame` still works for compat — so emit both. The researcher MUST pin the **exact current Farcaster Mini App spec** (embed JSON shape, manifest fields, transaction-response format) at plan time, since the spec is actively moving.
- **D-05:** **Serve the full `/.well-known/farcaster.json` manifest now on Sepolia; defer the signed account-association to the mainnet domain (Phase 10).** The manifest body (frame config, button metadata, embed/home URLs) is generated and served this phase so receipts render as Frames on testnet. The **signed account-association block** (which binds the manifest to a domain via a Farcaster custody-key signature) is deferred to the stable production domain in Phase 10 — signing it for the throwaway Vercel preview origin would only be re-signed at mainnet anyway. Consistent with D-04's domain cutover.

### Discoverability + auto-post wiring
- **D-04:** **Wire the Frame embed into the existing Phase-7 auto-post-on-settle path AND add a manual "share as Frame" affordance on the receipt page; defer Mini App catalog/directory submission to mainnet (Phase 10).** Auto-posted settled casts automatically carry the Frame embed (reusing the Phase-7 `warpcastComposeUrl` + auto-post worker), and the receipt page gains an explicit "share as Frame" control. Formal Mini App **catalog/directory** submission needs the stable production domain and is a Phase-10 task.

### Claude's Discretion
- **Exact Farcaster spec details** — `fc:miniapp` vs `fc:frame` field names, embed JSON schema, manifest schema, and the Frame transaction-response wire format. Pin against the **live spec at plan time** (researcher), not from memory — the spec is mid-deprecation.
- **Frame server endpoint location/structure** — reuse Next.js App Router route handlers under `apps/web` (e.g., `app/api/frame/...` and `app/.well-known/farcaster.json/route.ts`), `export const runtime = 'nodejs'`, public (no auth) per the middleware carve-out.
- **Call-status detection in the Frame endpoint** — read from the relayer `/api/calls/:id/live-state` (already exposes `status` / `statusVersion` / `marketLine`) and/or the subgraph `Call` entity; reuse the same source the receipt layout already uses.
- **Transaction-data construction** — reuse the existing ABIs (`apps/web/lib/abis/{FollowFadeMarket,ChallengeEscrow,ProfileRegistry,CallRegistry}.ts`) and addresses from `packages/shared/src/constants/addresses.ts`; do not introduce new ABIs.
- **OG card reuse** — render the existing Phase-7 OG card variants (Settled / DuelSettled / CallerExited) unchanged in the embed `imageUrl` (criterion 3 visual continuity is already locked).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec + roadmap + requirements
- `.planning/ROADMAP.md` → Phase 8 detail (SC1–SC3, the `fc:frame`→Mini App rename + 3-month deprecation note) **and** Phase 10 (mainnet deploy — where live Warpcast-tx verification, signed account-association, and catalog submission land)
- `.planning/REQUIREMENTS.md` → **SHARE-19** (Phase 8 target), plus the completed context it builds on: SHARE-14 (receipt server-renders OG meta), SHARE-18 (Farcaster cast-URL construction), SHARE-20 (off-chain OG receipts referenced by hash, not NFTs), SHARE-21 (public-by-default receipt)
- `CALL_IT_SPEC1.md` §18.3 (Farcaster Frames / cast distribution), §18.1–18.2 (public receipt + OG receipt model), §16 (5 OG card variants), §15.x (Follow / Fade / Challenge / Quote flows)

### Phase 7 foundation (the share loop Phase 8 extends)
- `.planning/phases/07-og-service-final-variants-subgraph-final-mappings/07-CONTEXT.md` → D-02 (auto-post mechanism + `warpcastComposeUrl`, build-full/gate-live pattern), D-03 (OG card real-data wiring), D-04 (Sepolia Vercel deploy + `NEXT_PUBLIC_OG_BASE_URL`, mainnet domain = Phase 10)
- `.planning/research/PITFALLS.md` → Pitfall 8 (cache-warm before posting), Pitfall 15 (Satori = flexbox only, no `display: grid` in OG sources)

### Existing web code to extend / reuse (full paths)
- `apps/web/app/call/[id]/layout.tsx` — `generateMetadata` server-renders the OG/Twitter meta; **this is where `fc:miniapp` / `fc:frame` embed meta tags are added** (via Next.js `Metadata.other`)
- `apps/web/app/call/[id]/page.tsx` — existing wagmi `useWriteContract` Follow/Fade/Challenge flows (the in-app analog the Frame transactions must match)
- `apps/web/app/components/ChallengeFormModal.tsx` — existing 1v1 challenge flow (ChallengeEscrow)
- `apps/web/app/duel/[challengeId]/layout.tsx` + `page.tsx` — duel receipt + its own OG meta (DuelSettled variant; mirror the embed work here if duel casts are in scope)
- `apps/web/lib/share-text.ts` → re-exports `warpcastComposeUrl` / `buildShareText` from `@call-it/shared` (`packages/shared/src/share/share-text.ts`) — SHARE-18 cast-URL construction to reuse for auto-post + manual share-as-Frame
- `apps/web/app/og/[callId]/route.ts` + `apps/web/app/og/duel/[challengeId]/route.ts` — OG card builders (reuse as the embed image, unchanged)
- `apps/web/lib/abis/{FollowFadeMarket,ChallengeEscrow,ProfileRegistry,CallRegistry}.ts` + `apps/web/lib/abis/index.ts` — ABIs for Frame transaction-data construction
- `packages/shared/src/constants/addresses.ts` — Sepolia contract addresses (CallRegistry v2, FollowFadeMarket v2, ChallengeEscrow, ProfileRegistry v2) + `NEXT_PUBLIC_OG_BASE_URL` / `SUBGRAPH_URL_SEPOLIA` seams
- `apps/web/middleware.ts` — public-by-default `PUBLIC_PREFIXES` carve-out; **the new `/.well-known/farcaster.json` + Frame endpoints must be publicly reachable (no auth)**
- Relayer auto-post worker (Phase 07-04, in `apps/relayer` / the relayer service) — the auto-post-on-settle path the Frame embed wires into (researcher locates the exact module)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **OG card variants** (`buildSettledCard` / `buildCallerExitedCard` / DuelSettled) — render unchanged as the Frame embed image (criterion 3).
- **`warpcastComposeUrl`** (`@call-it/shared`) — SHARE-18 cast-URL builder; reuse for both auto-post and the manual "share as Frame" affordance.
- **`generateMetadata` in `call/[id]/layout.tsx`** — server-side meta injection point; extend with embed meta via `Metadata.other`.
- **Existing wagmi write flows** in `call/[id]/page.tsx` + `ChallengeFormModal.tsx` — the canonical in-app Follow/Fade/Challenge/Quote transactions the Frame tx-data must reproduce.
- **ABIs + addresses** already centralized (`lib/abis/*`, `packages/shared/.../addresses.ts`) — no new contract surface needed.
- **Relayer `/api/calls/:id/live-state`** — already returns `status` / `statusVersion` / `marketLine`; the Frame endpoint reads it for context-aware button selection (D-02).

### Established Patterns
- App Router route handlers: `export const runtime = 'nodejs'`, render-fallback on error, `Cache-Control: max-age=60, stale-while-revalidate=300`.
- Public receipt/profile/duel pages already carved out in `middleware.ts` — extend `PUBLIC_PREFIXES` for the manifest + Frame endpoints.
- "Build full mechanism, degrade/gate the live-infra part" (Phase 7 D-02) — the governing pattern for D-01 / D-05.

### Integration Points
- Receipt `layout.tsx` `generateMetadata` ↔ new embed meta (`fc:miniapp` + `fc:frame`).
- New `/.well-known/farcaster.json` route ↔ manifest (body now, signed association at Phase 10).
- New Frame transaction endpoint ↔ FollowFadeMarket / ChallengeEscrow / ProfileRegistry / CallRegistry (via existing ABIs + Sepolia addresses).
- Frame endpoint ↔ relayer `/api/calls/:id/live-state` (call-status detection for D-02).
- Frame embed ↔ Phase-7 auto-post worker + receipt-page share affordance (D-04).
- `middleware.ts` ↔ manifest + Frame endpoints (must be public/no-auth).
</code_context>

<specifics>
## Specific Ideas

- The Frame is a **distribution multiplier on the core value**: a settled "CALLED IT / LOUD AND WRONG / CONTRARIAN HIT" receipt that isn't just *viewable* in Warpcast but *actionable* — follow the caller, challenge them 1v1, or quote-call them without leaving the feed. **Person-first:** the buttons convert a viral receipt into reputation-graph actions, which is exactly the product's "every call is tied to a named reputation" thesis.
- Context-awareness (D-02) is the crux: Live casts monetize the open follow/fade market; settled casts (the ones that go viral) drive person-level reputation actions. One Frame endpoint, two button sets, status-detected.
</specifics>

<deferred>
## Deferred Ideas

- **Live in-Warpcast tap-to-transact verification** → **Phase 10** (mainnet — needs production Warpcast + a chain it will broadcast to). [[D-01]]
- **Signed account-association for the production domain** in `/.well-known/farcaster.json` → **Phase 10** (stable `api.callitapp.xyz` / production web domain). [[D-05]]
- **Mini App catalog / directory submission** (formal discoverability) → **Phase 10** (needs production domain). [[D-04]]
- **Frame text-input for custom stake amount** → future (chose one-tap min-stake; larger stakes via deep-link). [[D-07]]
- **Mobile-responsive (375px) web pages** → **Phase 9** (carried from Phase 7 deferred).

</deferred>

---

*Phase: 8-farcaster-mini-apps*
*Context gathered: 2026-06-08*
