# Phase 7: OG service final variants + Subgraph final mappings - Context

**Gathered:** 2026-06-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Finalize the share loop on **testnet** (recovery cluster, Arbitrum Sepolia): wire all 5 OG card variants to real data (no stubs), add the CI grid-lint + 200px readability QA + Twitter Card Validator gates, finalize + verify the subgraph event mappings, build the auto-post-to-X/Farcaster mechanism (gated), build the Profile Overview / Leaderboard / Quote Composer pages, and **deploy the Sepolia web app** so receipts/profiles render publicly. Closes critical-path steps 6/8/9/10.

**Mainnet-gated items are explicitly deferred to Phase 10** (see Deferred): the paid Decentralized-Network subgraph publish and the `api.callitapp.xyz` domain cutover both require live mainnet contracts, which don't exist until Phase 10. Phase 6 soak runs in parallel; Phase 7 builds/deploys against the Sepolia recovery cluster and does **not** depend on Phase 6 being formally closed.
</domain>

<decisions>
## Implementation Decisions

### Subgraph publish (SC3)
- **D-01:** **Defer the Decentralized-Network publish to Phase 10.** Phase 7 finalizes + verifies ALL event mappings (the ~20 events in SC3: CallCreated, CallSettled, CallQuoted, ConvictionCapped, CallerExited, Followed, Faded, PayoutClaimed, PositionExited, Challenge{Proposed,Accepted,Rejected,Refunded,Settled}, Dispute{Raised,Resolved}, CallForceSettled, RepCalculated, RepCalculatedFallback, SettlementDelayed, ProfileUpdated, SocialLinked, SocialUnlinked) on the existing **Sepolia Studio** subgraph (`call-it-sepolia` v0.8.0), and keeps the Phase-0 polled-events fallback live. The ~3,000 GRT (~$100-300) DN publish is a Phase-10 mainnet task — no point indexing nonexistent mainnet contracts.

### Auto-post-to-X / Farcaster (SC2)
- **D-02:** **Build the full mechanism, gate the write on key presence.** Build cache-warm verification (hit `?v={statusVersion}` to force regen → HEAD 200 + correct ETag before posting; on failure delay ≤30s then retry — Pitfall 8) + post-text construction + Farcaster cast-URL construction. The actual X write **degrades to a no-op when X API write keys are absent** (mirrors the Phase-1.5 feed degrade-to-empty pattern, see [[phase1.5-complete-verified]]) and activates with no code change once keys land. Default-ON per SC2 (Advanced Settings toggle), but the planner must reconcile with the Pitfall-18 dispute-safety decision recorded in the Phase-4 settlement runbook (claim-delay / auto-post interaction).

### OG card / receipt real-data wiring (SC1)
- **D-03:** **Market statement comes from a subgraph Call entity field.** Add a human-readable market-statement field to the subgraph `Call` entity (populated from `CallCreated` data / criteria during the SC3 mapping finalization) and wire the OG route + receipt page to read it — replacing the current `Call #N` stub. The remaining OG stubs (P&L / REP CHANGE / FINAL / TARGET, currently `—`) are wired from the SettlementManager settlement events via the same subgraph reads. Keeps the OG route single-source (no IPFS fetch on the hot path).

### Web deploy (SC4/SC5, unblocks parked UAT)
- **D-04:** **Deploy `apps/web` to Vercel (`call-it-web-sepolia`) on the recovery cluster in Phase 7.** This unblocks the parked Phase-4 UAT-1/2/3 (Settled Receipt / DisputeModal / ProvenanceModal), the live frontend PITFALLS checks (Twitter Card Validator, `og:image` server-render, incognito public-receipt, auto-post cache-warm), and dogfooding the new Profile/Leaderboard/Quote pages. **CONSTRAINT (found 2026-06-07):** the Fly relayer CORS-blocks cross-origin requests from non-allowlisted origins — the receipt/profile pages fetch the relayer client-side (`/api/feed`, `/api/calls/:id/live-state`), so the deploy MUST add the Vercel origin to the relayer's CORS allowlist or those pages won't hydrate. Mainnet domain cutover (`api.callitapp.xyz`) stays in Phase 10.

### Post-research decisions (resolved 2026-06-07 from 07-RESEARCH.md open questions)
- **D-05 (Statement source, Q1):** **Relayer-authoritative + subgraph templated mirror.** The relayer stores the human-readable prose (add a `statement` column to its per-call criteria table); the OG route + receipt read it via the relayer `/api/calls/:id/live-state` `marketLine` (the receipt layout already reads this — IN-03). The subgraph `Call.statement` field holds a **templated fallback** derived in-mapping from numerics (`marketType` + asset + `targetValue`) for feed/queryability and as a safe default so OG/receipt never crash when enrichment hasn't run. Authoritative prose = relayer; subgraph field = indexed templated mirror. Reconciles D-03 + "no IPFS on hot path" with the AssemblyScript constraint (mappings can't read the relayer DB).
- **D-06 (Leaderboard data, Q3):** **All-time live + 7d/30d documented limitation.** Sort `Profile.globalRep` from the subgraph at read time for the All-time leaderboard (no new worker infra). The 7d/30d toggles ship wired but backed by All-time data with a documented v1 limitation. A windowed-aggregation relayer worker is deferred (not Phase 7 scope).
- **D-07 (Auto-post trigger, Q2):** **Build full mechanism, default-ON, reconcile against the Phase-4 runbook.** The planner MUST locate the Phase-4 settlement-runbook claim-delay / Pitfall-18 decision and make the auto-post trigger consistent with it. Mechanism + Pitfall-8 cache-warm gate ship now; the X write still degrades to a no-op when write keys are absent (D-02). If the runbook is silent on the claim-window interaction, default-ON fires after cache-warm verification succeeds.
- **D-08 (Twitter Card Validator, Q4):** SHARE-13 pre-flight is a **post-deploy operator checklist** (5 variant receipt URLs run through `cards-dev.twitter.com/validator`), NOT a CI gate — it needs a public URL and isn't cleanly scriptable.

### Claude's Discretion
- Exact subgraph `Call` entity field name/shape for the market statement (D-05: prefer a distinct `statement` field over repurposing `reasoning`).
- The custom eslint rule implementation that rejects `display: grid` in OG sources (SC1, Pitfall 15) — flexbox-only is already followed in code; this adds the enforcement gate.
- 200px visual-regression harness (Playwright is already installed in `apps/web`; reuse it).
- Profile/Leaderboard/Quote component structure (reuse `@call-it/ui` primitives).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec + roadmap
- `CALL_IT_SPEC1.md` §16 (5 OG card variants), §15.4 (Profile), §15.6 (Leaderboard), §15.7 (Settled Receipt), §15.10 (Quote Composer), §18.1 (public-by-default receipt)
- `.planning/ROADMAP.md` → Phase 7 detail (SC1–SC5) + Phase 10 (mainnet deploy, where DN publish + domain cutover land)
- `.planning/REQUIREMENTS.md` → OPS-04, SHARE-01/02/03/13/14/15/16/17/18/20/21, UI-09/12/13/26/27/28
- `.planning/research/PITFALLS.md` → Pitfall 8 (cache-warm auto-post), Pitfall 15 (Satori no grid)

### This-session work feeding Phase 7
- `apps/web/app/og/[callId]/route.ts` — Live/Settled/CallerExited builders (2 bugs fixed `fd79a74`; `Call #N` + `—` stubs remain for D-03)
- `apps/web/app/og/duel/[challengeId]/route.ts` — DuelSettled variant 3 (settled-field stubs)
- `apps/web/app/api/og/fallback/route.ts` + `apps/web/app/og/fallback` — Fallback variant (Phase 0, working)
- `apps/web/middleware.ts` — receipt public-by-default carve-out (SC5, fixed `fd79a74`)
- `apps/web/lib/outcome-word.ts`, `apps/web/lib/og-fonts.ts`, `apps/web/lib/og-fallback-render.ts` — reuse
- `.planning/phases/04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta/04-UAT.md` — parked UAT-1/2/3 (unblocked by D-04)
- `evidence/phase-6-soak/EVIDENCE-LOG.md` §3 "Share Loop" — the frontend PITFALLS items Phase 7 closes

### Subgraph + deploy
- `packages/shared/src/constants/addresses.ts` → `SUBGRAPH_URL_SEPOLIA` (v0.8.0), `NEXT_PUBLIC_OG_BASE_URL` seam (D-12)
- subgraph mappings: `follow-fade-market.ts`, `challenge-escrow.ts`, SettlementManager handlers (SC3 finalization target)
- `docs/phase-0-deploy-checklist.md` — Vercel `call-it-web-sepolia` + `NEXT_PUBLIC_OG_BASE_URL` deploy notes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- OG card builders (`buildLiveCard` / `buildSettledCard` / `buildCallerExitedCard`) + corner-bracket/font/fallback helpers — built; need real-data wiring (D-03), not rebuilds.
- `getOutcomeWordResult` (outcome-word.ts) — locked §14.1 colors + D-08/D-09 logic; reuse for cards + receipt.
- `@call-it/ui` primitives (Card/Tag/Stamp/ConvictionBar/Receipt/ProfileHeader) — for Profile/Leaderboard/Quote pages.
- `/api` relayer-proxy pattern (D-27: Studio key relayer-only, frontend hits `/api/feed`) — for new page data.
- Playwright installed in `apps/web` (existing og-fallback specs) — for the 200px visual-regression gate.

### Established Patterns
- OG routes: `export const runtime = 'nodejs'`, flexbox-only, `renderFallback` on any error (SHARE-10), `Cache-Control: max-age=60, stale-while-revalidate=300`, `X-Variant` header.
- Receipt/profile/duel/leaderboard now public via `middleware.ts` PUBLIC_PREFIXES (this session).

### Integration Points
- OG route + receipt page ↔ subgraph `Call` entity (new statement field, D-03).
- Receipt/profile pages ↔ Fly relayer (CORS allowlist for the Vercel origin, D-04 constraint).
- Auto-post worker ↔ OG cache-warm endpoint + X/Farcaster (D-02).
</code_context>

<specifics>
## Specific Ideas

- The share loop is the product's core value — the Settled receipt (CALLED IT / LOUD AND WRONG / CONTRARIAN HIT / COLD CALL / FADED CORRECTLY) must be visually unmistakable and legible at a 200px social thumbnail. The outcome-word render is already verified legible at 200px this session; SC1 formalizes it as a gate.
- Deploying the Sepolia web app is the linchpin: it simultaneously closes the parked UAT, the live PITFALLS share-loop checks, and lets the new pages be dogfooded.
</specifics>

<deferred>
## Deferred Ideas

- **Decentralized-Network subgraph publish** (~3,000 GRT / $100-300) → **Phase 10** (needs mainnet contracts). [[D-01]]
- **Mainnet OG domain cutover** (`api.callitapp.xyz`) → **Phase 10** (Sepolia uses the Vercel preview origin via `NEXT_PUBLIC_OG_BASE_URL`).
- **X API write-key provisioning** (activates auto-post) → when budgeted; mechanism ships gated in Phase 7 (D-02).
- **Farcaster Mini App frame actions** (Follow/Fade/Challenge from a cast) → **Phase 8**.
- **Mobile responsive (375px) on the 7 critical pages** → **Phase 9**.

</deferred>

---

*Phase: 7-og-service-final-variants-subgraph-final-mappings*
*Context gathered: 2026-06-07*
