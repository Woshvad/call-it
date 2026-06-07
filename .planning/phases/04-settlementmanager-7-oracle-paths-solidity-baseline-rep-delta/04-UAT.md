---
status: partial
phase: 04-settlementmanager-7-oracle-paths-solidity-baseline-rep-delta
source: [04-HUMAN-UAT.md, evidence/phase-6-soak/EVIDENCE-LOG.md §4]
started: 2026-06-07T17:40:00Z
updated: 2026-06-07T18:05:00Z
note: >
  Live re-run of the 5 Phase-4 deferred UAT items against the Phase 6 owner-key-recovery
  cluster (2026-06-06), driven locally (next dev :3100 pointed at recovery cluster + Sepolia
  RPC + subgraph v0.8.0 + Fly relayer). Retargets the stale addresses in 04-HUMAN-UAT.md.
  3 real bugs found and fixed (see ## Gaps); OG variants (UAT-4/5) verified GREEN after fixes;
  receipt-page render of UAT-1/2/3 blocked locally by relayer CORS (localhost origin) — needs
  the deployed web app or a local relayer to finish the visual halves.
---

## Current Test

[paused — UAT-4/5 PASS (after fixes); UAT-1/2/3 page-render needs deployed web app or local relayer (CORS)]

## Cluster under test (Arbitrum Sepolia, recovery redeploy 2026-06-06)

- SettlementManager 0x2E26eEb3…97e7 (owner=treasury 0xDa8c5726 ✓ cast) · CallRegistry 0xc79bB19d…3CB0
- FollowFadeMarket 0x188Db297…0d82 · ProfileRegistry 0xF66C0AFE…4820 · Subgraph call-it-sepolia v0.8.0
- Relayer call-it-relayer-sepolia.fly.dev (/health ok) · Web NOT deployed (verified locally via next dev :3100)

## Tests

### 1. Live settlement E2E (Pyth demo spine)
expected: Stake a call, wait for settlement, verify payout (claimPayout tx); call → Settled.
result: partial
note: |
  ON-CHAIN VERIFIED (cast): calls #1,#2,#8,#9,#10,#11 settled CallerWon, 0 failed
  (settle-*.jsonl; #1 tx 0xa2c32f26…); globalRep persists (=76 after caller-exit penalty).
  Settled Receipt PAGE now reachable publicly (HTTP 200, was 307→/signin — see Gap 3 fix),
  but client data render blocked locally by relayer CORS (localhost not allowlisted).
  Visual page confirmation needs the deployed web app or a local relayer.

### 2. Dispute flow E2E
expected: DisputeModal raise + $5 bond → /disputes log → reversal shown in UI after owner resolve.
result: partial
note: |
  ON-CHAIN VERIFIED (cast): SM.disputes(1) = disputer treasury, bond $5 (5e6), resolved=true;
  raise 0x6bb72713… + resolve 0x353f03b7… (SAFETY-27). Reversal is REAL and reflected: #1's
  outcome was flipped to CallerLost, and the settled OG card now renders "LOUD AND WRONG"
  accordingly. UI flow (modal + /disputes page + reversal-in-UI) needs deployed app + wallet.

### 3. Provenance modal content (D-10)
expected: "view oracle proof ↗" → ProvenanceModal with Pyth price+confidence+publishTime, settle tx link, EIP-712 sig.
result: blocked
blocked_by: web-render
reason: "ProvenanceModal needs the rendered receipt page (CORS-blocked locally) + a click; not exercisable without the deployed web app or a local relayer."

### 4. OG card 200px readability QA (SHARE-12 / UI-18)
expected: Settled + Caller-Exited OG cards legible (outcome word, key figures) at ~200px width.
result: pass
note: |
  VERIFIED by rendering the real cards locally (after fixing Gap 1 + Gap 2):
  /og/1 → "LOUD AND WRONG" (red 88px), /og/12 → "CALLER EXITED" (amber 88px),
  /og/1?as=fader → "FADED CORRECTLY" + FADER WIN lozenge. Outcome words are oversized,
  high-contrast on #09090E → legible at a 200px social-thumbnail scale. Stat values show
  the documented Phase-7 stubs ("—"; caller-exited rep shows hardcoded -35 vs actual -24).

### 5. Live OG render for settled / exited calls
expected: GET /og/[callId] returns non-fallback card with X-Variant settled (or caller-exited); ?as=fader → FADED CORRECTLY.
result: pass
note: |
  VERIFIED locally after fixes: /og/1 → 200 X-Variant: settled; /og/12 → 200 X-Variant:
  caller-exited; /og/1?as=fader → 200 (FADED CORRECTLY). Before fixes these 500'd (Gap 1)
  and #12 mis-rendered as "settled" (Gap 2). Live #13 → 200 X-Variant: live (control).

### 6. On-chain wiring confirmation (cast)
expected: SM owner = treasury; CR/FFM settlementManager() = SM.
result: passed
note: "Re-verified on recovery cluster 2026-06-07: SM.owner()=0xDa8c5726 (cast)."

## Summary

total: 6
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 1
partial: 2

## Gaps

- truth: "Settled & CallerExited OG cards render (SHARE-05/06/08); the receipt is the product's core value"
  status: fixed
  reason: "Both cards 500'd with satori 'Cannot read properties of undefined (reading trim)'. Root cause: buildSettledCard/buildCallerExitedCard set `borderRight: ...:undefined` on the last stats cell; satori throws on an explicit undefined style value, and the error fires during response piping so it escapes the handler try/catch (even the SHARE-10 fallback can't catch it). Never caught earlier because these cards were never rendered against real settled data (Phase-4 UAT was env-deferred)."
  severity: blocker
  test: 4,5
  artifacts:
    - path: "apps/web/app/og/[callId]/route.ts"
      issue: "borderRight: i < arr.length-1 ? '1px solid #2E2E42' : undefined (two call sites)"
  fix: "Omit the property via conditional spread `...(cond ? {borderRight:'…'} : {})`. Applied + verified: settled/exited/fader all render 200."

- truth: "OG route renders the correct variant per CallStatus (CallerExited → variant 4)"
  status: fixed
  reason: "Route assumed CallStatus ordinals 1=Disputed,2=CallerExited,3=Settled, but ICallRegistry.sol is Live=0,Settled=1,Disputed=2,CallerExited=3. Effect: a real caller-exited call (#12, status=3) rendered the SETTLED card and the 'CALLER EXITED' variant-4 (SHARE-08) NEVER displayed; a Disputed call would mis-render as caller-exited."
  severity: major
  test: 5
  artifacts:
    - path: "apps/web/app/og/[callId]/route.ts"
      issue: "isOnChainSettled = statusNum===3||===1; isOnChainCallerExited = statusNum===2"
  fix: "Corrected to isOnChainSettled = statusNum===1||===2 (Settled|Disputed); isOnChainCallerExited = statusNum===3. Verified: #12 now → X-Variant: caller-exited."

- truth: "A shared receipt URL works for unauthenticated users (spec §18.1; PITFALLS share-loop)"
  status: fixed
  reason: "middleware.ts PUBLIC_PREFIXES allowed /og but not /call — so an unauthenticated visitor opening a shared receipt was 307-redirected to /signin, breaking the share→loop-back funnel and the product's permanent-public-receipt promise. /profile, /duel, /leaderboard had the same gap."
  severity: major
  test: 1
  artifacts:
    - path: "apps/web/middleware.ts"
      issue: "PUBLIC_PREFIXES missing public read surfaces"
  fix: "Added /call, /duel, /profile, /leaderboard to PUBLIC_PREFIXES (action pages /new,/settings,/onboarding stay gated). Verified: /call/1 now returns HTTP 200 (was 307→/signin)."

- truth: "UAT-1/2/3 visual page confirmation (Settled Receipt, DisputeModal, ProvenanceModal)"
  status: blocked
  reason: "Web frontend not deployed; local next dev can render OG (server routes) but the receipt PAGE's client fetches to the Fly relayer are CORS-blocked from localhost. Needs the deployed web app (relayer allowlists the Vercel origin) or a full local relayer (Postgres/Redis/KMS)."
  severity: major
  test: 1,2,3
  artifacts: []
  missing:
    - "Deploy apps/web to Vercel (call-it-web-sepolia) on the recovery cluster, OR run the relayer locally, then re-run the visual halves of UAT-1/2/3 + interactive dispute/provenance with a funded wallet."
