# Phase 2: FollowFadeMarket - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-29
**Phase:** 2-FollowFadeMarket
**Areas discussed:** Stake custody & integration, Live Receipt liveness, Slippage & exit UX, Exit notifications, Rep-slash path, Quote-call direction

---

## Stake custody & integration

### Q: How should the caller's stake (the follow-pool seed) be custodied between CallRegistry and FollowFadeMarket?

| Option | Description | Selected |
|--------|-------------|----------|
| Redeploy CallRegistry w/ market hook | createCall forwards stake into FollowFadeMarket + inits pool; single USDC custodian; simplest Phase 4 settlement; Sepolia-only so cheap | ✓ |
| Keep CallRegistry, read its state | FollowFadeMarket holds only deposits + reads CallRegistry; SettlementManager reconciles cross-contract USDC at settlement | |
| You decide | Claude's discretion | |

**User's choice:** Redeploy CallRegistry w/ market hook
**Notes:** §10.8 blesses pause+redeploy; money-handling contract benefits from single-custodian clarity.

### Q: When should the $5K TVL cap be aggregated across contracts?

| Option | Description | Selected |
|--------|-------------|----------|
| Aggregate now (2 of 3 contracts) | follow/fade enforce cap against CallRegistry.currentTvl + FollowFadeMarket pools; Phase 6 adds ChallengeEscrow | ✓ |
| Local-only, defer to Phase 6 | Cap only FollowFadeMarket pools now; full aggregation in Phase 6 | |
| You decide | Claude's discretion | |

**User's choice:** Aggregate now (2 of 3 contracts)
**Notes:** A real-money cap shouldn't have a gap where combined TVL silently exceeds $5K.

### Q: How wide should the CallRegistry redeploy's cross-contract authorization surface be?

| Option | Description | Selected |
|--------|-------------|----------|
| Phase-4-ready surface (one redeploy) | setFollowFadeMarket + setSettlementManager setters, stake-forwarding, guarded markCallerExited/markSettled; Phase 4 plugs in | ✓ |
| Minimal Phase-2 only | Add only Phase 2 needs; redeploy again in Phase 4 | |
| You decide | Claude's discretion | |

**User's choice:** Phase-4-ready surface (one redeploy)
**Notes:** Mainnet contract (Phase 7.5) ships final this way anyway; avoid a second Sepolia redeploy.

---

## Live Receipt liveness

### Q: How should the live numeric state (follow%/fade% bar, share price, position) be read and kept fresh?

| Option | Description | Selected |
|--------|-------------|----------|
| Contract reads + poll + optimistic | wagmi useReadContract, ~5s poll + on-focus, optimistic on own action; fresh reserves feed minSharesOut | ✓ |
| Subgraph-polled (reuse Phase 1) | Everything via subgraph feed pattern; ~30s lag makes bar laggy + risks slippage reverts | |
| SSE/WebSocket push | Truly real-time but adds persistent-connection infra; overkill for $5K cap | |

**User's choice:** Contract reads + poll + optimistic

### Q: How should the activity feed be sourced?

| Option | Description | Selected |
|--------|-------------|----------|
| Subgraph events, polled | Followed/Faded/CallerExited/PositionExited via relayer reusing D-24 800ms race + fallback | ✓ |
| Direct contract logs (viem getLogs) | Freshest but re-implements pagination/dedup + adds RPC load | |
| You decide | Claude's discretion | |

**User's choice:** Subgraph events, polled

### Q: When should the Live OG card cache-bust via og:image?v={statusVersion}?

| Option | Description | Selected |
|--------|-------------|----------|
| Status change + throttled activity | Always bump on status transitions + throttled bump on activity (~once per few min) | ✓ |
| Every follow/fade | Freshest social card, many more OG regenerations + CDN invalidations | |
| Status change only | Fewest regenerations, but stale follow%/fade% bar while active | |

**User's choice:** Status change + throttled activity

---

## Slippage & exit UX

### Q: When follow/fade reverts with SlippageExceeded, what should the UI do?

| Option | Description | Selected |
|--------|-------------|----------|
| Refresh + explicit retry | Re-read reserves, show updated expected shares, one-tap retry; no silent override | ✓ |
| Silent auto-retry once | Re-read + resubmit once; can surprise on fast-moving price | |
| Hard fail + manual restart | Reset form, user re-initiates; most friction | |

**User's choice:** Refresh + explicit retry

### Q: How much friction in the exit confirmation modals?

| Option | Description | Selected |
|--------|-------------|----------|
| Caller: type-to-confirm; Position: 1-click | Friction matched to consequence (irreversible/public/rep-slash vs routine 10%) | ✓ |
| Both single confirm + math | Faster, lower friction; treats both exits the same | |
| Both type-to-confirm | Max friction; heavy for routine position exit | |

**User's choice:** Caller: type-to-confirm; Position: 1-click

### Q: Should the caller-exit modal surface the time-decay context?

| Option | Description | Selected |
|--------|-------------|----------|
| Show current % + floor + 'decreases over time' | "Exit now: X% · drops toward 15% as expiry nears"; nudges holding | ✓ |
| Show current % only | Just current penalty + return; hides that waiting is cheaper | |
| You decide | Claude's discretion | |

**User's choice:** Show current % + floor + 'decreases over time'

---

## Exit notifications

### Q: How should SOCIAL-24's per-user notification be delivered?

| Option | Description | Selected |
|--------|-------------|----------|
| Persisted in-app inbox (poll, no push) | notifications table + relayer fan-out + bell/inbox on next visit; minimal infra | |
| Full real-time notification center | Above + unread badges, live polling, mark-all-read, richer inbox | ✓ |
| Feed broadcast only (defer per-user) | SOCIAL-23 + SOCIAL-25 only; under-delivers SOCIAL-24 | |

**User's choice:** Full real-time notification center
**Notes:** User chose the richer surface over the minimal recommendation. Captured as polled (no push/SSE) per the liveness decisions — "real-time" = frequent polling + unread badges + mark-read, not new push infra.

### Q: Should the notifications schema be generic or caller-exit-specific?

| Option | Description | Selected |
|--------|-------------|----------|
| Generic, reusable schema | event_type column; Phase 3/4 reuse the same table + inbox | ✓ |
| Caller-exit-specific | Only what SOCIAL-24 needs; generalize later | |
| You decide | Claude's discretion | |

**User's choice:** Generic, reusable schema

---

## Rep-slash path

### Q: How should the caller-exit rep slash reach ProfileRegistry (which only authorizes SettlementManager)?

| Option | Description | Selected |
|--------|-------------|----------|
| Redeploy ProfileRegistry w/ authorized-writer set | Generic authorizedRepWriters mapping; FollowFadeMarket writes slash directly; SettlementManager joins later | ✓ |
| Route through SettlementManager later | Defer rep application to Phase 4; under-delivers SOCIAL-26 in Phase 2 | |
| You decide | Claude's discretion | |

**User's choice:** Redeploy ProfileRegistry w/ authorized-writer set
**Notes:** Consistent with the Phase-4-ready redeploy-once theme; ProfileRegistry redeploy happens alongside the CallRegistry redeploy.

---

## Quote-call direction

### Q: How is a quote-call's FADING/FOLLOWING direction determined?

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit stance at quote time | Quoter declares Following/Fading in composer; stored off-chain keyed to CallQuoted; CallRegistry stays lean | ✓ |
| Infer from quoter's follow/fade position | Tag = side taken on parent; breaks if quoter has no position | |
| Infer from quote thesis vs parent | Compare directions; fragile across market types | |

**User's choice:** Explicit stance at quote time

---

## Claude's Discretion

- Pool/share storage shape, AMM rounding/precision, share decimals (within §11.2 + §12.2).
- Exact decay-curve shape for caller-exit rep slash (linear vs curved, -45 → -10).
- Notification inbox UI placement + polling interval + unread-count semantics.
- Subgraph schema extension details for FollowFadeMarket events.
- Relayer endpoint shapes (live-state proxy, notification fan-out worker).

## Deferred Ideas

- ChallengeEscrow TVL aggregation + 3-contract boundary fuzz → Phase 6.
- Trending Duel / Duel King / Duels tab / duel-settled card → Phase 3.
- claimPayout end-to-end → Phase 4 (requires settlement).
- Settled Receipt + Settled/CallerExited OG variants → Phase 4 / Phase 7.
- Model B creator-fee application → Phase 4 (snapshot captured in Phase 2).
- Push/email notifications + SSE/WebSocket upgrade → v1.1.
- "From your X/Farcaster" feed sections + VERIFIED badges → Phase 1.5 (parallel).
