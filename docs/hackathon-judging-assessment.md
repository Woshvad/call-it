# Call It — Hackathon Judging Assessment

**Date:** 2026-06-09 · **Re-scored:** 2026-06-12
**Build state assessed (re-score):** Phases 4–9 + 09.2 (full prototype-design UI rebuild) shipped. Relayer redeployed 2026-06-10 — settlement live end-to-end with true outcome words. Phase 09.1 SHELVED 2026-06-12: its substance landed via quick tasks (CONTRARIAN HIT wiring, feed pools/odds, 7-bug demo sweep incl. share-loop integrity). Mainnet (Phases 10/10.5) on hold.

Judging criteria: Innovation · Technical implementation · Use of Arbitrum technology · Potential impact · Presentation quality · Novelty (bonus).

---

## Scorecard at a glance (re-scored 2026-06-12)

| Criterion | How well we fit | Δ | One-line verdict |
|---|---|---|---|
| **Use of Arbitrum technology** | ★★★★★ Excellent | — | Stylus reputation engine in production is the single best card we hold |
| **Technical implementation** | ★★★★★ Excellent | — | Deep, real, multi-contract + oracle + relayer + indexer stack — now with the integrity guards demo-proven |
| **Presentation quality** | ★★★★★ De-risked | ▲ from ★★★★☆ AT RISK | All three blockers closed: real outcome words live, CONTRARIAN HIT renderable, share loop unforgeable |
| **Novelty** (bonus) | ★★★★☆ Strong | — | Stylus + permanent reputation receipts is a fresh combination |
| **Innovation** | ★★★☆☆ Good, contested | — | Framing fix still NOT done — this is now the cheapest remaining lever |
| **Potential impact** | ★★★☆☆ Moderate | — | Real thesis, but speculative + adoption/regulatory unknowns |

**Headline (updated):** The at-risk criterion is fixed — the live deploy now shows real "CALLED IT" / "LOUD AND WRONG" receipts, the tape has genuine settled history through call #15, and the share loop can no longer be forged. What remains between here and the best possible judging outcome is **pitch work, not build work**: the innovation reframe (open on accountability, not "prediction market") and making the Stylus engine visible in the demo.

### What closed since 2026-06-09 (evidence)

1. **Relayer redeployed (2026-06-10) + settlement verified live (2026-06-12):** every Pyth call through #15 settled with real outcomes on the deployed feed — the "PENDING RESULT" hero-moment breaker is gone.
2. **CONTRARIAN HIT unblocked:** `fadeRealShare` wired from the subgraph (`f3ecc53`); the most novel of the three signature receipts can render.
3. **09.2 design adoption:** the entire UI rebuilt to the neobrutalist prototype canon — the product now *looks* like the receipt everywhere, raising the presentation ceiling further.
4. **Demo-prep bug sweep (`0a8690c`, 2026-06-12):** share-loop integrity hardened — forgeable `?handle=` OG identity removed (server-resolved), fabricated exit-slash replaced with the real on-chain penalty, quote-shares carry the real handle + correct receipt URL, onboarding handles persist, dispute admin and duel accept fixed.
5. **Trivially-true call guard:** composer + relayer preflight block guaranteed-win rep-farming calls — protects the credibility of the reputation product itself.
6. **Feed credibility:** live cards show real on-chain pools/odds; settled cards resolve registered handles (person-first identity on the tape).

### Residual risks (small, listed honestly)

- **OG cards still wear the old (Syne/Space Grotesk) design** while the app is Archivo/brutal — a shared preview doesn't match the site brand. Cosmetic; full OG redesign was consciously shelved with 09.1.
- **Live social dormant** (X API + Neynar keys unprovisioned) — only matters if the demo script includes the social feed; cost decision unchanged.
- **Five seeded Event calls (#3–#7) show amber "AWAITING SETTLEMENT"** until the scheduled forceSettle on 2026-06-13 clears them.
- **No live X/Farcaster share proof has been run yet** — recommended dry-run before the demo: share one settled receipt on each and eyeball the timeline cards.
- **Event-type calls remain creatable but unsettleable** (non-Pyth rail not live) — keep the demo script on price calls, or gate the composer if judges will free-play.

---

## 1. Use of Arbitrum technology — ★★★★★ (our standout)

**Why we fit extremely well:** We're not a generic EVM dApp that "happens to deploy on Arbitrum." We run a **Rust/Stylus reputation scoring engine, compiled to WASM, deployed and *activated* behind a proxy on Arbitrum Sepolia** (Phase 5, 7/7 plans, verifier passed). Stylus is Arbitrum's flagship differentiating technology, and most hackathon entries either don't touch it or have a toy contract. We have a real one in the critical path, plus:

- Built natively for Arbitrum One economics (sub-cent fees enable $1–$5 micro-positions on follow/fade — the product literally doesn't work on L1).
- **Native USDC** on Arbitrum (correct address, not bridged USDC.e — a detail judges who know the chain will notice).
- Pyth pull-oracle on Arbitrum for settlement.

**What to work on:** This is a presentation gap, not a build gap. Judges won't know the engine is Stylus unless you **show it explicitly** — a slide with the Arbiscan-verified Stylus contract, the Rust source, and a one-liner on why Stylus (gas-efficient reputation math that would be expensive in Solidity). Make it Slide 2.

**Risk:** If the Stylus engine isn't visibly doing something in the demo (a reputation score visibly updating after a settle), it reads as "deployed but decorative." Wire at least one visible rep-delta into the demo flow.

## 2. Technical implementation — ★★★★★ (deepest, most defensible)

**Why we fit very well:** The system is genuinely substantial and integrated, not a single-contract toy:

- **5 Solidity contracts** (CallRegistry, FollowFadeMarket, ChallengeEscrow, SettlementManager, ProfileRegistry) + the Stylus engine, with immutable cross-refs handled correctly.
- **Pyth integration** with confidence-interval gating (≤0.5%), a 30×60s retry loop, and a dispute window + `forceSettle` escape hatch — real oracle engineering, not a hardcoded price.
- **Relayer** (Fastify) with **KMS/HSM-backed signing**, off-chain Pyth VAA fetching, CEX scrapers, OG image generation.
- **The Graph subgraph** as primary event source.
- **Security discipline**: CEI, ReentrancyGuard, Ownable2Step, hardcoded USDC gate, a real USDC transfer-routing vulnerability found and fixed in review, ~222 passing forge tests, code reviews per phase, a 48h Sepolia soak gate.

This is the criterion where we'd beat almost any weekend build. It's the substance behind the pitch.

**What to work on:**
1. **Don't drown judges in it.** Pick 3 hero technical points (Stylus engine, Pyth confidence-gated settlement, fade/challenge mechanics) and go deep on those.
2. **The depth is invisible in a UI demo.** Have an architecture diagram ready so judges believe the iceberg under the receipt.

## 3. Novelty — ★★★★☆ (bonus criterion, real bonus available)

**Why we fit:** The combination is fresh — a Stylus-powered, person-first reputation layer where the permanent "CALLED IT" / "LOUD AND WRONG" / "CONTRARIAN HIT" receipt **is** the product, plus social primitives (fade, 1v1 challenge, quote-call) that don't exist as a bundle anywhere I know of. "Reputation receipts as identity" is a genuinely novel framing.

**What to work on:** Novelty is judged on what's demonstrably different. Lean the pitch on the **mechanics no one else has** — especially **fade** (stake against a named person's call) and **challenge** (1v1 reputation duels). Those are more novel than "predict a price."

## 4. Innovation — ★★★☆☆ (strong framing, crowded category)

**Why it's contested:** Prediction markets are not new (Polymarket, Augur, Myriad). A skeptical judge will pattern-match "another prediction market" in the first 10 seconds. Our innovation is **not the prediction primitive — it's the person-first reputation framing**: the gap between accountability-free Crypto Twitter and anonymous Polymarket positions.

**What to work on — the most important positioning fix:**

- **Open with the problem, not the product.** "Crypto Twitter has a billion opinions and zero accountability. Polymarket has accountability but zero identity. We're the layer where being right builds a permanent, public name." If the first sentence is "it's a prediction market," we lose the innovation points.
- Emphasize **permanence + identity** (the receipt is unfakeable, undeletable, tied to a named rep) as the innovation, since that's what's not in the existing players.

**Honest take:** This is the criterion where we're most exposed. We win it on framing, lose it on category. The build doesn't need to change — the story does.

## 5. Presentation quality — ★★★★★ as of 2026-06-12 (was ★★★★☆ AT RISK — section below kept as written on 2026-06-09 for the record; all three blockers listed are now closed, see the re-score block at the top)

**Why the ceiling is high:** The shareable OG receipt is the best demo asset in the whole product — visually unmistakable, neobrutalist, instantly screenshot-able. Mobile responsive is done (Phase 9, 7 pages at 375px, operator-verified). Farcaster Mini App gives a native, in-feed distribution surface most projects won't have.

**Why it's at risk — and this is the #1 thing to fix before any demo:**

- **The deployed Fly relayer is stale.** `/api/calls/:id/live-state` returns no `outcome`/`repDelta`/`fadeRealShare`/`marketLine`, so a settled receipt (e.g. `/call/14`) shows the neutral **"PENDING RESULT" + "Call #N"** placeholder instead of the literal **"LOUD AND WRONG"** + real market line. This breaks the single most important demo moment — the payoff shot of the entire pitch. (Currently on HOLD to protect the soak; the fix is the deferred relayer redeploy.)
- **CONTRARIAN HIT OG card is unrenderable** until `fadeRealShare` is wired from the subgraph (route.ts hardcodes 0).
- **Live social feed is dormant** — "From your X" + auto-post need X API + Neynar keys provisioned.

These three are precisely the Phase 9.1 pillars. The judgment call to HOLD the relayer directly trades against this criterion — at some point before the demo, the relayer redeploy has to happen, or the hero receipt stays neutral.

**Bottom line:** highest-variance criterion. If 09.1 lands, this jumps to ★★★★★. If we demo on the current stale relayer, a judge sees "PENDING RESULT" on what we call a settled receipt and it looks broken.

## 6. Potential impact — ★★★☆☆ (real thesis, speculative)

**Why we fit:** "A composable reputation layer for crypto opinions" is a legitimate primitive — onchain, permanent rep that other apps could read is genuinely useful infrastructure. The accountability problem is real and large.

**Honest weaknesses to acknowledge (judges respect candor):**

- **Network-effect dependency:** person-first only works with people. Cold-start is hard.
- **Deliberate scale caps:** $100 max stake / $5K TVL are correct for safety but cap the "impact" story — frame them as responsible launch posture, not a ceiling.
- **Regulatory ambiguity** around staking on outcomes — unaddressed, and a sharp judge may ask.

**What to work on:** Give one crisp impact sentence and a believable wedge: "Start with the 100 loudest crypto callers; their receipts become the distribution." Don't over-claim TAM.

---

## What this means — prioritized

**Fits well, leave alone (just present it loudly):** Arbitrum/Stylus, technical depth, novelty of mechanics. These are won; the only work is making them visible in the pitch.

**Needs work before demo — in priority order (updated 2026-06-12):**

1. ~~**Relayer redeploy.**~~ ✅ DONE 2026-06-10 — settled receipts show the true outcome word + market line on the live deploy.
2. ~~**CONTRARIAN HIT card (`fadeRealShare` wiring).**~~ ✅ DONE (`f3ecc53`) — renderable; demo-script note: a *real* contrarian receipt needs a CallerLost settle with winning faders in the data — seed one if the script calls for it.
3. **Pitch reframe** (no code): open on the accountability problem + permanence/identity, not "prediction market." NOW THE #1 ITEM — cheapest, highest-impact innovation/presentation win, still not done.
4. **Make Stylus visible in the demo** (no code): Slide 2 = Arbiscan-verified Stylus contract + Rust source + a rep-delta visibly updating after a settle. Still not done.
5. **Live share dry-run:** post one settled receipt link to X and Farcaster, eyeball the timeline cards. 10 minutes, de-risks the share story.
6. **Live social keys.** Real cost decision (X API ~$100–200/mo) — only worth it if the social feed is in the demo script.

**Doesn't fit / drop from the pitch:** nothing is a total miss, but don't lead with "potential impact" — it's our softest criterion. Mention it briefly with an honest wedge and pivot back to the receipt + Stylus.

**The reassuring part:** the work that's hardest to do (the Stylus engine, the contract system, the security) is done, and the work that's left (09.1 hardening + framing) is comparatively cheap and already scoped. We're strong where it's hard to fake and weak where it's easy to fix.
