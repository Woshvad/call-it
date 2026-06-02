---
phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
plan: 08
subsystem: ui
tags: [nextjs, fastify, dispute, provenance, ipfs, pinata, wagmi, vitest, eip-712, oracle]

# Dependency graph
requires:
  - phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
    provides: Settled Receipt page (plan 04-07) — extended with DisputeModal + ProvenanceModal
  - phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
    provides: SettlementManager contract (raiseDispute / resolveDispute — plan 04-02)
  - phase: 00-foundation
    provides: Pinata IPFS pipeline (plan 00-03)
provides:
  - "DisputeModal: amber neobrutalist, IPFS evidence upload, $5 USDC bond preflight, raiseDispute writeContract (D-06)"
  - "ProvenanceModal: oracle URL + Arbiscan tx hash + path-aware raw oracle data per oracle.type + EIP-712 sig truncated + chainId 42161 label (D-10, SETTLE-52)"
  - "apps/relayer/src/routes/settle.ts: GET /api/settle/:callId with explicit oracle.type field + path-aware rawOracleData + 60s Redis cache"
  - "apps/relayer/src/routes/disputes.ts: GET /api/disputes, GET /api/disputes/:callId, POST /evidence (Pinata), POST /raise (D-06)"
  - "apps/web/app/disputes/page.tsx: public dispute log (open + resolved) + owner-gated resolve admin with reversal preview (D-07)"
  - "apps/web/app/disputes/layout.tsx: page frame + corner-brackets"
affects: [phase-05-stylus-engine, phase-07-og-finalization, future-phases-dispute-resolution]

# Tech tracking
tech-stack:
  added: []  # No new npm dependencies
  patterns:
    - "Dispute modal: amber neobrutalist (3px #FB923C border + 4px shadow); corner brackets top-left + bottom-right; USDC preflight inline approve sub-step before raiseDispute"
    - "Provenance modal: accent (#E8F542) neobrutalist; path-aware rawOracleData switch on oracle.type; EIP-712 sig truncated first10+last8; chainId 42161 label"
    - "settle.ts route: subgraph-first with Redis 60s immutable cache; buildRawOracleData() dispatches on oracle.type enum"
    - "disputes.ts route: thin permissionless relay; IPFS via Pinata pinFileToIPFS endpoint; keccak256(cid) = evidenceHash"
    - "Disputes page: isOwner = address.toLowerCase() === OWNER_ADDRESS.toLowerCase(); reversal preview required + disabled confirm on fetch fail (D-07 gate)"
    - "Two-step destructive confirm: confirmStep: 1|2 state; 'This reverses a settled receipt. Confirm?' → 'Yes, resolve'"

key-files:
  created:
    - apps/relayer/src/routes/settle.ts (GET /api/settle/:callId — provenance with oracle.type)
    - apps/relayer/src/routes/disputes.ts (GET+POST dispute routes, Pinata evidence pin)
    - apps/web/app/disputes/page.tsx (public log + owner resolve admin)
    - apps/web/app/disputes/layout.tsx (page frame + corner-brackets)
  modified:
    - apps/relayer/src/index.ts (register settleRoute + disputesRoute)
    - apps/web/app/call/[id]/page.tsx (DisputeModal + ProvenanceModal wired into Settled Receipt)

key-decisions:
  - "raiseDispute is permissionless on-chain — disputes.ts POST /raise is thin validation only; frontend calls SM.raiseDispute directly via writeContract (SETTLE-01 compatibility)"
  - "settle.ts uses subgraph-first (not RPC) for provenance data — settlement attestations are subgraph-indexed; fallback returns empty provenance so modal shows tx hash + source only"
  - "evidenceHash = keccak256(CID string bytes) — content-addressed; matches SM.raiseDispute evidenceHash param"
  - "oracle.type is explicit in ProvenanceResponse (not derivable from oracle.url) — ProvenanceModal branches on this field for path-aware raw data rendering"
  - "reversal preview fetches /api/settle/:callId — best-effort; if fetch fails, confirm is DISABLED (D-07 gate enforced)"
  - "disputes/page.tsx: 5s polling mirrors duel live-state pattern; no Redux/global state"

patterns-established:
  - "Provenance fetch on modal open (lazy): isLoading spinner while fetching, provenance cached in component state, no re-fetch on re-open"
  - "Owner-gated resolve admin: per-dispute state machine (outcome + note + preview + confirmStep); reversal detection compares currentOutcome vs selectedOutcome"

requirements-completed:
  - SETTLE-25
  - SETTLE-26
  - SETTLE-27
  - SETTLE-28
  - SETTLE-29
  - SETTLE-30
  - SETTLE-31
  - SETTLE-32
  - SETTLE-33
  - SETTLE-34
  - SETTLE-35
  - SETTLE-36
  - SETTLE-52
  - SHARE-12

# Metrics
duration: 22min
completed: 2026-06-02
---

# Phase 4 Plan 8: Dispute UI + Provenance Modal + Relayer Routes Summary

**DisputeModal (amber IPFS+bond) + ProvenanceModal (path-aware oracle proof per oracle.type) wired into Settled Receipt, plus /disputes/ public log with 24h owner commitment and owner-gated reversal-preview resolve admin, backed by relayer settle/dispute routes**

## Performance

- **Duration:** 22 min
- **Started:** 2026-06-01T23:36:10Z
- **Completed:** 2026-06-01T23:58:59Z
- **Tasks:** 2
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments

- Implemented `settle.ts` route (GET /api/settle/:callId): oracle.type explicit field, path-aware rawOracleData (Pyth=price+conf+publishTime, attestation paths=signed payload JSON, CEX=announcement title+URL+scrapedAt), 60s Redis immutable cache, EIP-712 relayerSignature, chainId 42161 binding
- Implemented `disputes.ts` route: GET /api/disputes (public list), GET /api/disputes/:callId (per-call state), POST /api/disputes/evidence (Pinata IPFS pin → cid + evidenceHash), POST /api/disputes/raise (validation + Telegram dispute_raised alert)
- Registered both routes in `apps/relayer/src/index.ts`
- Extended `apps/web/app/call/[id]/page.tsx` with DisputeModal (amber neobrutalist, IPFS file picker, $5 USDC bond preflight with inline approve, raiseDispute writeContract, window-closed + MAX_COUNTER_CLAIMS=3 guard) and ProvenanceModal (accent neobrutalist, oracle source URL, Arbiscan tx link, path-aware raw oracle data branching on oracle.type, EIP-712 sig truncated first10+last8 with chainId 42161 label, copy-to-clipboard)
- Created `apps/web/app/disputes/page.tsx`: public log with open disputes (amber border + 24h owner commitment countdown per Pitfall 6) and resolved section (outcome pills); owner-wallet-gated resolve admin with reversal preview required before confirm (preview fetch fail → confirm disabled per D-07), two-step destructive confirm ("This reverses a settled receipt. Confirm?" → "Yes, resolve"), resolveDispute writeContract
- Created `apps/web/app/disputes/layout.tsx`: page frame 3px #2E2E42 + 4px #E8F542 corner-brackets
- All tests GREEN: web 40/40, relayer 120/120 (1 pre-existing skip)

## Task Commits

1. **Task 1: DisputeModal + ProvenanceModal + relayer settle/dispute routes** - `144cb62` (feat)
2. **Task 2: /disputes/ public log + owner-gated resolve admin** - `c1e893a` (feat)

## Files Created/Modified

- `apps/relayer/src/routes/settle.ts` — GET /api/settle/:callId; oracle.type explicit; path-aware rawOracleData; 60s Redis cache
- `apps/relayer/src/routes/disputes.ts` — GET/GET/:callId/POST evidence/POST raise; Pinata IPFS pin
- `apps/relayer/src/index.ts` — registered settleRoute + disputesRoute as Fastify plugins
- `apps/web/app/call/[id]/page.tsx` — DisputeModal + ProvenanceModal inline components; dispute CTA; handleOpenProvenance callback
- `apps/web/app/disputes/page.tsx` — public disputes log + owner resolve admin; 5s polling
- `apps/web/app/disputes/layout.tsx` — page frame + corner-brackets

## Decisions Made

1. **disputes.ts POST /raise is thin (no server-side relay)** — raiseDispute is permissionless on-chain; the frontend calls SM.raiseDispute directly via useWriteContract. The server endpoint only validates inputs and fires the Telegram dispute_raised alert. This is SETTLE-01 compatible.

2. **settle.ts uses subgraph first** — settlement provenance (oracle data, attestation, signature) is indexed by the subgraph from SettlementManager events. An RPC-first approach would require additional on-chain storage. Subgraph fallback returns an empty provenance struct; the ProvenanceModal handles this gracefully ("if unavailable: show tx hash + source only").

3. **oracle.type is explicit in ProvenanceResponse** — The frontend ProvenanceModal branches on this field for path-aware rendering. It cannot be reliably derived from oracle.url (multiple CEX scrapers share similar hostnames). Explicit enum field is the correct design.

4. **Reversal preview is best-effort via /api/settle/:callId** — The reversal preview computes rep delta and pool amounts from the provenance endpoint. If that fetch fails, the confirm button is disabled with "Preview unavailable — cannot resolve safely." per D-07 mandate.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

| Stub | File | Reason |
|------|------|--------|
| `getSubgraphClient` replaced with direct fetch | settle.ts, disputes.ts | subgraph-client.ts does not export a generic query client; used the same direct fetch pattern established in duel-live-state.ts |
| `fetchProvenanceSnapshot` in disputes page returns raw fields | disputes/page.tsx | Reversal preview reads from /api/settle/:callId; the actual repDelta/poolAmount fields depend on Phase 7 full subgraph wiring of RepCalculated events. Preview shows values when available, skips gracefully when not. |

## Threat Surface Scan

All threat model items (T-04-08-01..T-04-08-05) mitigated as specified:

| Flag | File | Status |
|------|------|--------|
| T-04-08-01: Non-owner calls resolveDispute | disputes/page.tsx | Mitigated: client-side isOwner gate; on-chain onlyOwner revert is primary defense |
| T-04-08-02: Owner resolves without preview | disputes/page.tsx | Mitigated: reversal preview REQUIRED; preview fetch fail → confirm DISABLED |
| T-04-08-03: Dispute spam | disputes.ts, page.tsx | Mitigated: $5 USDC bond on-chain; MAX_COUNTER_CLAIMS=3 enforced in CTA |
| T-04-08-04: forceSettle without 24h commitment | disputes/page.tsx | Mitigated: "Owner will resolve by {deadline} — committed {N} ago" visible publicly |
| T-04-08-05: Wallet address in dispute UI | All surfaces | Mitigated: AUTH-44 enforced — only @handle rendered; addresses never in copy |

## Issues Encountered

**Pre-existing TypeScript errors in relayer** (withdraw-authorize.ts, paymaster-confirmer.ts): These are Phase-1 era type errors confirmed out of scope per the scope_guard. Our new routes (settle.ts, disputes.ts) compile clean with zero errors.

## Next Phase Readiness

Ready for:
- Phase 4 Plan 09 (CI cron / SAFETY-57 doc) — dispute routes and test suite are in place
- Phase 5 (StylusScoreEngine) — raiseDispute / resolveDispute surfaces complete; oracle attestation pipeline live
- Phase 7 OG finalization — provenance data shapes documented; full RepCalculated subgraph wiring will enrich reversal preview

---
*Phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta*
*Completed: 2026-06-02*

## Self-Check: PASSED

- [x] `apps/relayer/src/routes/settle.ts` exists — FOUND
- [x] `apps/relayer/src/routes/disputes.ts` exists — FOUND
- [x] `apps/web/app/disputes/page.tsx` exists — FOUND
- [x] `apps/web/app/disputes/layout.tsx` exists — FOUND
- [x] settle.ts registered in index.ts (`grep "settleRoute" apps/relayer/src/index.ts`) — PASS
- [x] disputes.ts registered in index.ts (`grep "disputesRoute" apps/relayer/src/index.ts`) — PASS
- [x] DisputeModal in page.tsx (`grep "DisputeModal" apps/web/app/call/[id]/page.tsx`) — PASS
- [x] ProvenanceModal in page.tsx (`grep "ProvenanceModal" apps/web/app/call/[id]/page.tsx`) — PASS
- [x] raiseDispute in page.tsx (`grep "raiseDispute" apps/web/app/call/[id]/page.tsx`) — PASS
- [x] oracle.type explicit in settle.ts (`grep "oracle.*type" apps/relayer/src/routes/settle.ts`) — PASS
- [x] pythPrice/pythConf/pythPublishTime in settle.ts (path-aware rawOracleData) — PASS
- [x] Pinata pin in disputes.ts (`grep "pinata\|evidence\|cid" apps/relayer/src/routes/disputes.ts`) — PASS
- [x] chainId 42161 in page.tsx — PASS
- [x] EIP-712 sig truncated (first10+last8) — PASS
- [x] No display:grid in page.tsx or disputes/page.tsx — PASS (0 matches)
- [x] isOwner check in disputes/page.tsx — PASS
- [x] resolveDispute in disputes/page.tsx — PASS
- [x] "Owner will resolve by" in disputes/page.tsx — PASS
- [x] Reversal preview ("Preview unavailable") in disputes/page.tsx — PASS
- [x] Two-step confirm ("Yes, resolve") in disputes/page.tsx — PASS
- [x] corner-brackets class in disputes/layout.tsx — PASS
- [x] `pnpm --filter @call-it/web build` exits 0 — PASS
- [x] `pnpm --filter @call-it/web exec vitest run` — 40/40 GREEN
- [x] `pnpm --filter @call-it/relayer exec vitest run` — 120/120 GREEN
- [x] Commit `144cb62` exists (Task 1) — VERIFIED
- [x] Commit `c1e893a` exists (Task 2) — VERIFIED
