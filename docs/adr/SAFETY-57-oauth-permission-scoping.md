---
adr: SAFETY-57
title: Per-Auth-Method Permission Scoping (v1 Limitation)
status: Accepted (v1 limitation; Phase 1.5 extension planned)
date: 2026-06-02
owner: Phase 1.5 — social-linking + follow-graph wire-up
affects:
  - apps/relayer/src/routes/auth.ts
  - apps/web/app/api/auth/ (Privy OAuth integration)
  - apps/web/app/components/ (social-link UI)
  - packages/contracts/src/ProfileRegistry.sol (§9.8 link proof)
supersedes: none
related:
  - SAFETY-58 (KMS key blast-radius, see note below)
  - ADR-0001 (Sepolia staging-USDC strategy)
---

# SAFETY-57: Per-Auth-Method Permission Scoping (v1 Limitation)

## Status

**Accepted — v1 limitation.** This ADR documents a known scope restriction in
the Phase 4 implementation and records the planned resolution in Phase 1.5.

No code changes are required as a result of this ADR. The risk is in the
*absence* of a feature (follows.read OAuth scope), not in a code defect.

## Context

The product spec (CALL_IT_SPEC1.md §9.8 / §9.9) calls for two distinct
social-linking surfaces:

1. **VERIFIED badge** — Twitter/X handle linked to the user's on-chain profile
   via OAuth proof submitted to ProfileRegistry. This proves the user controls
   the Twitter account and shows a VERIFIED badge on their profile page.
   Required OAuth scope: `tweet.read users.read` (read-only identity proof).

2. **"From your X" feed section** — Filters the user's call feed to show only
   calls made by people they follow on Twitter. This requires reading the
   user's Twitter follow graph.
   Required OAuth scope: **`follows.read`** (follow-graph read) in addition to
   `users.read`.

The VERIFIED badge and "From your X" feed section are **separate features**
with different OAuth scope requirements. Only the VERIFIED badge uses an
OAuth token in v1.

## v1 Limitation

**`follows.read` is NOT provisioned in Phase 4.**

The "From your X" feed section is a **Phase 1.5 feature** (see CLAUDE.md §9.9,
REQUIREMENTS.md social-linking section). Phase 4 delivers only:

- On-chain ProfileRegistry linking seams (`setTwitterHandle`, `setFarcasterFid`)
- The VERIFIED badge UI on profile pages
- OAuth proof submission to the relayer (relayer validates + submits on-chain)

The OAuth tokens obtained via Privy for the VERIFIED badge use the minimum
required scopes: **`tweet.read users.read`** (no write scopes, no DM access,
no follow-graph read).

Until Phase 1.5 ships, the "From your X" feed section does not render — it is
a known stub behind a feature flag.

## Security Implications

### What IS present in v1

- OAuth proof validated server-side by the relayer before any on-chain write
  (mitigates replay: the relayer checks the proof's target address matches the
  requesting wallet, and the sig is single-use).
- Privy manages the OAuth token lifecycle (token refresh, revocation) — the
  relayer never stores raw OAuth tokens.
- Scope is read-only identity (`tweet.read users.read`) — no posting capability,
  no DM access, no follower manipulation.
- Each OAuth proof is chain-ID bound in the EIP-712 domain (SETTLE-17 KMS
  pattern) — a proof for Sepolia cannot be replayed on mainnet.

### What is ABSENT in v1 (acceptable)

- `follows.read` is absent — the follow-graph feed is not rendered; no
  follow-graph data is fetched or stored. The absence of this scope is the
  intended v1 state.
- Per-auth-method scope isolation (binding each OAuth method to exactly its
  minimum scope set, enforced at Privy config level) is not yet formally
  audited. This is the v1 limitation this ADR accepts.

### Phase 1.5 resolution

Phase 1.5 will:

1. Add `follows.read` to the Privy custom scopes config for the Twitter
   link path **only** — not to the base auth path.
2. Implement the follow-graph cache worker in the relayer (24h TTL, per
   §9.9 degraded freshness documented in CLAUDE.md "Alternatives Considered").
3. Wire the "From your X" feed section in the frontend.
4. Formally document the per-auth-method scope binding in PRIVY_OAUTH_SCOPES.md.
5. Request an X API Basic tier subscription (~$100–200/mo, per CLAUDE.md
   budget note) — required because follow-graph reads require X API v2 Basic
   tier, not the free tier.

Until Phase 1.5 ships, the "From your X" feed stub should display a
"Coming soon" placeholder rather than an empty list (avoids user confusion).

## X API Tier Requirement

The `follows.read` scope requires **X API v2 Basic tier** ($100–200/month as
of 2026-06). The free tier (`tweet.read users.read`) is sufficient for the v1
VERIFIED badge and proof-of-identity use case.

Pre-deploy budget approval for Phase 1.5 should include the X API Basic tier
cost alongside Pinata, Redis, and Better Stack (documented in STATE.md
"Blockers/Concerns").

## Farcaster Permission Scoping

Farcaster sign-in uses Sign In with Farcaster (SIWF via `@farcaster/auth-kit`).
The scope is implicit — SIWF grants only the signed-in FID (Farcaster ID) and
verifies control of the custody address. No follow-graph permission is required
for the VERIFIED badge.

Follow-graph reads on Farcaster (for a "From your Farcaster" feed) would use
the Neynar API with FID-scoped queries — this is also deferred to Phase 1.5.

## Related: RPC Metrics KMS Key Blast-Radius Note (SAFETY-58)

During Phase 4 Plan 04-06 implementation, an implementation deviation was
made: the **RPC metrics oracle adapter** (`rpc-metrics-adapter.ts`) reuses
the existing `defillama` GCP KMS key rather than having a dedicated
`GCP_KEY_VERSION_RPC_METRICS` key.

**Rationale:** Both DefiLlama and RPC metrics produce numeric off-chain
attestations (price-level data, TVL metrics, liquidation counts). Their EIP-712
domains differ (different `name` field in the typed-data struct), which prevents
cross-type replay between a DefiLlama TVL attestation and an RPC metrics
attestation. The domain separation is the primary replay protection.

**Risk:** If the `defillama` KMS key is compromised, an attacker can forge
both DefiLlama attestations AND RPC metrics attestations. A dedicated key per
adapter would contain the blast radius to one attestation type.

**Accepted for v1** — the operational overhead of managing 7+ separate KMS key
versions for 7 oracle adapter types is disproportionate to the Phase 4 risk
surface (Sepolia staging, limited TVL cap $5,000). Phase 6 (multisig + mainnet
promotion gate) is the right time to enforce per-adapter key isolation.

**Follow-up:** Phase 6 pre-mainnet security review must assess whether per-adapter
KMS key isolation is required before mainnet deploy, or whether domain separation
is sufficient. See ROADMAP.md Phase 6 entry criteria.

## Decision

Accept the v1 limitation. Document it here. Add "From your X" follow-graph feed
as a Phase 1.5 requirement. Do not request `follows.read` OAuth scope until Phase
1.5 is planned and the X API Basic tier is budgeted.

## Consequences

| Consequence | Impact |
|-------------|--------|
| "From your X" feed section absent in v1 | Low — product functions without it; VERIFIED badge still ships |
| `follows.read` scope not requested in v1 | Positive — least-privilege OAuth; no follow-graph data exposure |
| X API Basic tier cost deferred | Positive for v1 budget; cost appears in Phase 1.5 planning |
| Phase 1.5 must update Privy custom scopes | Medium — known scope; Privy config change only |
| RPC metrics shares defillama KMS key | Medium risk — domain separation provides replay protection; Phase 6 re-assesses |

## References

- CALL_IT_SPEC1.md §9.8 (Twitter OAuth proof submission), §9.9 (follow graph feed)
- CLAUDE.md — "OAuth scope `users.read` only for Twitter via Privy" (What NOT to Use)
- CLAUDE.md — "Cache the follow-graph at 24h instead of 1h" (Alternatives Considered)
- REQUIREMENTS.md — SAFETY-57
- X API v2 documentation — follows.read scope requires Basic tier
- Privy custom OAuth scopes documentation — `@privy-io/react-auth@3.27.x`
