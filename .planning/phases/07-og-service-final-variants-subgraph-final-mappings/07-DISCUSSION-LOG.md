# Phase 7: OG service final variants + Subgraph final mappings - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-07
**Phase:** 7-og-service-final-variants-subgraph-final-mappings
**Areas discussed:** Subgraph publish timing, Auto-post-to-X, Market-statement source, Web deploy

---

## Subgraph publish (SC3)

| Option | Description | Selected |
|--------|-------------|----------|
| Defer DN publish to Phase 10 | Keep Sepolia Studio v0.8.0; finalize mappings in Phase 7; defer paid Decentralized-Network publish to the mainnet deploy | ✓ |
| Publish DN now | Spend GRT + publish to DN in Phase 7 regardless (would index nonexistent mainnet contracts) | |
| Finalize mappings only | Complete/verify mappings on Sepolia Studio + keep polled fallback; DN publish is purely Phase-10 | (folded into selected) |

**User's choice:** Defer DN publish to Phase 10.
**Notes:** Decentralized Network is Arbitrum-mainnet-only and mainnet contracts don't exist until Phase 10 — no value paying GRT now. Phase 7 still finalizes + verifies the full event-mapping set on Sepolia Studio and keeps the polled-events fallback live.

---

## Auto-post-to-X / Farcaster (SC2)

| Option | Description | Selected |
|--------|-------------|----------|
| Build mechanism, gate on keys | Build cache-warm verify + post construction + Farcaster cast URL; X write degrades to no-op without keys; activates when keys land | ✓ |
| Defer auto-post entirely | Ship manual share-intent links only | |
| Build + test with real keys | Provision X API write keys now and test E2E | |

**User's choice:** Build mechanism, gate on keys.
**Notes:** Mirrors the Phase-1.5 feed degrade-to-empty pattern. X API write keys aren't provisioned. Planner reconciles the SC2 default-ON with the Pitfall-18 dispute-safety decision in the Phase-4 runbook.

---

## Market-statement source (SC1)

| Option | Description | Selected |
|--------|-------------|----------|
| Subgraph entity field | Read the human-readable statement from a subgraph Call entity field (replaces "Call #N") | ✓ |
| IPFS criteria doc | Resolve from the IPFS criteria doc by criteriaHash (adds IPFS fetch to hot path) | |
| Relayer-cached lookup | Relayer serves statement via API the OG route + page call | |

**User's choice:** Subgraph entity field.
**Notes:** Single source, fast reads, fits the SC3 mapping finalization. P&L/rep/final/target stubs also wired from settlement events via the same subgraph reads.

---

## Web deploy (SC4/SC5)

| Option | Description | Selected |
|--------|-------------|----------|
| Deploy Sepolia web in Phase 7 | Deploy apps/web to Vercel (call-it-web-sepolia) on the recovery cluster; unblocks UAT-1/2/3 + frontend PITFALLS + dogfooding | ✓ |
| Build only, deploy at mainnet | Build pages but no public Sepolia deploy; verify locally; UAT stays parked | |

**User's choice:** Deploy Sepolia web in Phase 7.
**Notes:** Constraint found 2026-06-07 — the Fly relayer CORS-blocks localhost/non-allowlisted origins; the deploy must add the Vercel origin to the relayer CORS allowlist or receipt/profile pages won't hydrate. Mainnet domain cutover stays in Phase 10.

## Claude's Discretion

- Subgraph Call entity field name/shape for the statement.
- Custom eslint grid-lint rule implementation.
- 200px visual-regression harness (reuse installed Playwright).
- Profile/Leaderboard/Quote component structure (reuse @call-it/ui).

## Deferred Ideas

- Decentralized-Network subgraph publish → Phase 10.
- Mainnet OG domain cutover (api.callitapp.xyz) → Phase 10.
- X API write-key provisioning → when budgeted.
- Farcaster Mini App frame actions → Phase 8.
- Mobile responsive (375px) → Phase 9.
