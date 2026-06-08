# Phase 8: Farcaster Mini Apps - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-08
**Phase:** 8-farcaster-mini-apps
**Areas discussed:** Scope vs. testnet reality, Button semantics on a settled receipt, Embed format + manifest association, Discoverability + auto-post wiring

---

## Scope vs. testnet reality

| Option | Description | Selected |
|--------|-------------|----------|
| Build full, verify on mainnet (P10) | Build complete Frame tx endpoint + tx construction + manifest + embed now on Sepolia; defer live in-Warpcast tap-to-transact to mainnet (Phase 10). Mirrors Phase 7 D-02. | ✓ |
| Embed + deep-link only now | Ship embed + manifest + 'Open in Call It' deep-link only; full in-frame tx becomes a later phase. | |
| Full + attempt live Sepolia now | Build full in-frame tx AND try live Warpcast verification on Sepolia this phase (risk: Warpcast may not broadcast Sepolia tx). | |

**User's choice:** Build full, verify on mainnet (P10) → **D-01**
**Notes:** Consistent with the whole milestone's testnet-now / mainnet-Phase-10 structure and Phase 7's "build full mechanism, gate the live-infra part" pattern. Phase 8 is code-complete on testnet; live Warpcast-transaction proof is the Phase-10 gate.

---

## Button semantics on a settled receipt

| Option | Description | Selected |
|--------|-------------|----------|
| Act on the caller (person-first) | Follow=social-follow profile (1.5); Challenge=1v1 (3); Fade=deep-link to caller's latest live call. Always person-centric. | |
| Context-aware by call status | Live cast → Follow/Fade = FollowFadeMarket positions (2) + Challenge (3); Settled cast → Follow-person + Challenge + Quote. | ✓ |
| Frame targets Live casts | Action buttons are a Live-call feature (market Follow/Fade); settled card stays read-only with just an 'Open' button. | |

**User's choice:** Context-aware by call status → **D-02**
**Notes:** Most faithful to both criterion 1 (settled receipt render) and criterion 2 (real market tx paths). One Frame endpoint, two button sets, status-detected from the relayer live-state.

---

## Embed format + manifest association

### Format
| Option | Description | Selected |
|--------|-------------|----------|
| New Mini App embed + fc:frame compat | `fc:miniapp` + Mini App SDK primary, legacy `fc:frame` meta for backward compat. | ✓ |
| Legacy fc:frame v2 only | Only legacy `fc:frame` v2 button format. | |
| Let research decide the split | Defer primary/fallback to the researcher's read of the live spec. | |

**User's choice:** New Mini App embed + fc:frame compat → **D-03**
**Notes:** Forward-looking, matches the ROADMAP's rename + 3-month deprecation note. Researcher pins exact current spec at plan time.

### Manifest account association
| Option | Description | Selected |
|--------|-------------|----------|
| Serve manifest now, sign association at mainnet (P10) | Serve full `farcaster.json` on Sepolia now; defer signed account-association to the stable mainnet domain (Phase 10). | ✓ |
| Sign for the Sepolia Vercel origin now | Produce a real signed association for the Vercel preview origin (throwaway signature, re-signed at mainnet). | |

**User's choice:** Serve manifest now, sign association at mainnet (P10) → **D-05**
**Notes:** Signing for the throwaway preview origin would only be re-signed at mainnet anyway; consistent with D-04 domain cutover.

---

## Discoverability + auto-post wiring

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-post wiring + manual share; catalog deferred | Wire Frame embed into auto-post-on-settle path AND add a manual 'share as Frame' affordance; defer catalog submission to mainnet (Phase 10). | ✓ |
| Auto-post wiring only | Just ensure auto-posted settled casts carry the Frame embed. | |
| Manifest + embed only, no distribution work | Ship manifest + embed meta only; don't touch auto-post or add affordances. | |

**User's choice:** Auto-post wiring + manual share; catalog deferred → **D-04**
**Notes:** Best distribution coverage for a testnet phase; formal Mini App catalog/directory submission needs the production domain (Phase 10).

---

## Settled-cast button set (follow-up to D-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Follow-person · Challenge · Quote | All three real onchain actions; keeps settled Frame fully interactive. | ✓ |
| Follow-person · Challenge · Open in app | Third slot is navigation, not a transaction. | |
| Follow-person · Challenge only (2 buttons) | Drop the third action on settled casts. | |

**User's choice:** Follow-person · Challenge · Quote → **D-06**
**Notes:** `Fade` is meaningless on a settled call (market closed); `Quote` (CallRegistry quote-call) replaces it.

---

## Live stake UX (follow-up to D-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Default to min stake, in-frame tap = min position | One-tap min position ($1 follow / min fade); larger stakes via 'Open in Call It'. | ✓ |
| Frame text-input for amount | Frame text-input for a custom USDC amount before the tx button. | |
| Live Follow/Fade always deep-links out | No in-frame staking; Follow/Fade deep-link to the call page. | |

**User's choice:** Default to min stake, in-frame tap = min position → **D-07**
**Notes:** Keeps the Frame one-tap and within the Frame-transaction-protocol constraint; avoids unreliable cross-client amount-input UX.

---

## Claude's Discretion

- Exact Farcaster Mini App spec details (`fc:miniapp` vs `fc:frame` fields, embed/manifest JSON schema, tx-response wire format) — pinned against the live spec at plan time.
- Frame server endpoint location/structure (Next.js App Router route handlers, `runtime = 'nodejs'`, public/no-auth).
- Call-status detection source (relayer `/api/calls/:id/live-state` and/or subgraph `Call`).
- Transaction-data construction reuses existing ABIs + Sepolia addresses (no new ABIs).
- OG card variants rendered unchanged in the embed image.

## Deferred Ideas

- Live in-Warpcast tap-to-transact verification → Phase 10 (mainnet).
- Signed account-association for the production domain → Phase 10.
- Mini App catalog / directory submission → Phase 10.
- Frame text-input for custom stake amount → future.
- Mobile-responsive (375px) web pages → Phase 9.
