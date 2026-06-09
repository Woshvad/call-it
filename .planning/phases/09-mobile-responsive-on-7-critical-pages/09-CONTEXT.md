# Phase 9: Mobile responsive on 7 critical pages - Context

**Gathered:** 2026-06-09
**Status:** Ready for planning

<domain>
## Phase Boundary

A 375px-breakpoint **responsive retrofit** of the 7 critical pages so a viewer arriving from a Twitter/Farcaster share lands on a usable mobile receipt, plus a "Best viewed on desktop" banner on the 3 non-critical pages.

**In scope — make responsive (single-column, full-width buttons, no horizontal scroll, 44px touch targets):**
1. Feed — `apps/web/app/page.tsx` (§15.1)
2. Live Receipt — `apps/web/app/call/[id]/page.tsx` live branch (§15.3)
3. Settled Receipt — `apps/web/app/call/[id]/page.tsx` settled branch (§15.7) — **#1 share-landing priority**
4. Profile — `apps/web/app/profile/[address]/page.tsx` (§15.4)
5. Leaderboard — `apps/web/app/leaderboard/page.tsx` (§15.6)
6. Sign-in — `apps/web/app/signin/page.tsx` (§15.8)
7. Onboarding — `apps/web/app/onboarding/{handle,socials,follow-graph,fund,tagline}/page.tsx` (§15.9, multi-screen flow)

**In scope — desktop-only banner only (NOT made responsive, per v1 scope cut):**
- Duel — `apps/web/app/duel/[challengeId]/page.tsx` (§15.5)
- New Call — `apps/web/app/new/page.tsx` (§15.2)
- Quote composer (§15.10) — ⚠ no standalone page found in the route tree; the quote flow appears to live as the quote-calls column/modal on the Live Receipt. Researcher/planner MUST verify what surface "Quote composer" maps to before applying a banner.

**Out of scope:** a responsive pass on the 3 non-critical pages themselves (deferred to v1.1+ per PROJECT.md); any new product capability; in-Warpcast tap-to-transact (Phase 10, D-01 from Phase 8).

</domain>

<decisions>
## Implementation Decisions

### Responsive Mechanism
- **D-01:** Add responsiveness via a **`useIsMobile()` client hook + conditional inline style objects** (`isMobile ? mobileStyle : desktopStyle`). Chosen because the entire frontend is styled with inline `style={{}}` objects — inline styles cannot carry `@media` rules, and external CSS cannot override inline styles without `!important`. The hook slots into the existing pattern with zero specificity fights. (Rejected: `@media` in `globals.css` — needs `!important` everywhere; full Tailwind migration — large rewrite of 2000+-line files with desktop-regression risk.)
- **D-02:** **Mobile-first first paint.** The hook defaults to `isMobile = true` so SSR/first paint renders the mobile layout and only widens to desktop on the client when the viewport is large. Rationale: the share-visitor (almost always on a phone) sees the correct layout instantly; desktop users absorb one quiet reflow on load. This directly serves the SC3 share-landing priority.
- **D-03:** **44×44px touch targets enforced at the mobile breakpoint only** (`isMobile`). Desktop keeps its current dense neobrutalist density (filter chips/tabs at ~4×10px padding stay as-is on desktop).
- **D-04:** **Reach = the 7 pages PLUS the modals/shared components they render at 375px.** A 480–560px modal overflows a phone, and the Follow/Fade flow on a shared receipt is core to the mobile experience. In scope: Follow/Fade/CallerExit/PositionExit modals, `ChallengeFormModal`, dispute/provenance modals, and `@call-it/ui` pieces (`CallCard`, `Receipt`, `ProfileHeader`) where a critical page shows them.

### Mobile Navigation
- **D-05:** **Add a hamburger drawer** (mobile only) on the left of `GlobalNav`. The app has no left sidebar today — `GlobalNav` is just the wordmark + notification bell — so this both satisfies UI-49 literally and fills a real gap (no global mobile navigation exists). Desktop nav is unchanged.
- **D-06:** Drawer contains **auth-aware destinations**: Feed, Leaderboard, Profile, New Call, Sign in / Sign out (New Call + Profile gated to authenticated, matching the feed's existing auth-aware CTA). The **notification bell stays pinned in the top bar** on mobile (glanceable unread-count surface). Drawer = navigation; top bar = identity + alerts.
- **D-07:** The hamburger **stays active on the 3 desktop-only-banner pages**. This is how a mobile user navigates away or signs out → directly satisfies SC2 ("banner does not block return navigation or sign-out").

### Desktop-Only Banner
- **D-08:** **Warn but allow use.** On Duel/New Call (and the resolved Quote surface), at mobile width show the banner at the top with the (non-responsive) page still rendering and interactive below it. Non-blocking, honest, satisfies SC2. The user may hit the known non-responsive layout — that is the accepted v1 behavior.
- **D-09:** Banner is **dismissible for the session**. Copy: "Best viewed on desktop" (spec wording) + short subtext, with an `[×]` to dismiss. Neobrutalist styling (accent border, hard offset shadow). No extra CTA needed — the hamburger drawer already provides exit/sign-out.

### Validation & Verification Gate
- **D-10:** **Hybrid validation.** (a) Automated **Playwright responsive specs** at 375px + 390px (iPhone) assert the mechanical criteria — no horizontal scroll, single-column, ≥44px touch targets, outcome-word legibility — as a repeatable gate (Playwright is already in the stack). (b) An **operator human-verify checkpoint on a real iPhone (Safari) + Android (Chrome)** signs off the SC3 share→receipt landing flow.
- **D-11:** **BOTH are hard gates** — the Playwright suite AND the operator real-device sign-off must pass before Phase 9 is marked complete. *(User diverged from the recommended "operator check deferrable" option: they want a genuine real-device sign-off, not a deferral. Phase completion is intentionally coupled to operator device availability.)*

### Claude's Discretion
- Exact `isMobile` threshold — use a single breakpoint (`< 768px` ⇒ mobile) unless research surfaces a reason to add a tablet tier; tablet falls into the desktop bucket.
- Per-page layout restructuring details (how each page's two-column `flexDirection: 'row'` blocks stack, where full-width buttons apply).
- Reuse the existing `NotificationInbox` slide-over/overlay pattern for the drawer; close on link-tap / backdrop / Esc.
- One shared `<DesktopOnlyBanner>` component reused across the banner pages, rendered only when `isMobile`, pushing content (not overlaying).
- Hook implementation detail (e.g., `matchMedia` + `useSyncExternalStore` vs `useState`/resize listener) — pick the SSR-safe option that honors the mobile-first default (D-02).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Spec
- `CALL_IT_SPEC1.md` (repo root) §15.1/§15.3/§15.4/§15.6/§15.7/§15.8/§15.9 — the 7 critical page layouts; §15.2/§15.5/§15.10 — the 3 non-critical pages; §14.6 — locked neobrutalist treatment; §19 Phase 9 — build-order intent.
- `.planning/REQUIREMENTS.md` — UI-48 (375px breakpoint on 7 critical pages), UI-49 (single-column / full-width buttons / sidebar→hamburger), UI-50 (desktop-only banner on non-critical pages).
- `.planning/ROADMAP.md` — Phase 9 goal + 3 success criteria (share-landing landing experience is the stated priority).

### Design system
- `packages/ui/tailwind.preset.ts` — design tokens (colors `#E8F542` etc., font stack, border widths) — preserve on mobile.
- `apps/web/app/globals.css` — the single stylesheet; already uses `@media` (reduced-motion). Hosts keyframes/helpers CSS can't express inline.

### Integration surfaces (see code_context)
- `apps/web/app/components/GlobalNav.tsx`, `apps/web/app/layout.tsx`, `apps/web/app/components/NotificationInbox.tsx`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`NotificationInbox.tsx`** — establishes a slide-over overlay (backdrop + panel, auto-action on open) → reuse this pattern for the hamburger drawer.
- **`globals.css`** — already carries `@media (prefers-reduced-motion)`; the correct home for any keyframes/helpers the hook approach still needs in CSS.
- **Per-page `COLORS` token objects** + `packages/ui` primitives + `tailwind.preset.ts` — the locked neobrutalist palette/typography to preserve at the mobile breakpoint.
- **Playwright** is already in the stack (`signin.spec.ts`, CEX scrapers) → responsive viewport specs fit the existing test infra with no new dependency.

### Established Patterns
- **Inline `style={{}}` objects everywhere** + a per-page `COLORS` const; **zero** Tailwind utility classes and **zero** existing responsive variants (`sm:`/`md:`/`lg:`) in `apps/web/app`. This is the single most important constraint — it is why D-01 chose the JS hook over CSS/Tailwind.
- Pages are `'use client'`; root `layout.tsx` is `export const dynamic = 'force-dynamic'` with client-only providers → SSR paints the client tree once, which is why D-02's mobile-first default matters.
- Fixed-width containers: Feed `maxWidth: 680px` (already narrow — mostly works, but `DuelRowCard` has two `minWidth: 120px` cells that can overflow 375px); Receipt/Duel `maxWidth: 1024px` with `flexDirection: 'row'` two-column blocks that must stack; modals `maxWidth: 480–560px`.
- `display: grid` is avoided project-wide (Pitfall 15 — Satori OG cards). In-page grid is technically fine but breaks convention; flexbox stacking is the house style.

### Integration Points
- **`GlobalNav.tsx`** — add the hamburger + drawer here (mobile only); keep `NotificationBell` in the bar.
- **`layout.tsx`** — mounts `GlobalNav` + `ClientProviders`; global wrapper for the hook/provider if needed.
- **The 7 critical page files** (+ 5 onboarding subroutes) — primary edit surface.
- **Modals** rendered by critical pages: Follow/Fade/CallerExit/PositionExit (on `call/[id]`), `ChallengeFormModal`, dispute/provenance modals — in scope per D-04.
- **Banner pages:** `duel/[challengeId]/page.tsx`, `new/page.tsx`, and the to-be-confirmed Quote composer surface.

</code_context>

<specifics>
## Specific Ideas

- The **Settled Receipt is the #1 priority page** — it is what a Twitter/Farcaster visitor lands on. Mobile-first first paint (D-02) exists specifically for this visitor.
- **Preserve the neobrutalist register on mobile** — no softening into a generic SaaS look (the "no slop" filter from §14.6 still applies). Borders, hard offset shadows, accent color, type stack all carry over.
- SC3's "outcome word legible" maps to the existing 200px-readability concern from Phase 7 — the CALLED IT / LOUD AND WRONG / CONTRARIAN HIT / COLD CALL / FADED CORRECTLY hero must stay legible at 375px.

</specifics>

<deferred>
## Deferred Ideas

- **Full responsive pass on the 3 non-critical pages** (Duel, Quote composer, New Call) — explicitly cut from v1 (PROJECT.md "Out of Scope"); v1.1+. Phase 9 ships only the desktop-only banner for them.
- **Tablet-specific (768–1024px) layout tier** — not required by the spec; collapses into the desktop bucket for v1 unless research argues otherwise.
- **Migrating the inline-style architecture to Tailwind** — considered and rejected for this phase (regression risk); could be revisited as tech-debt cleanup later.

</deferred>

---

*Phase: 9-mobile-responsive-on-7-critical-pages*
*Context gathered: 2026-06-09*
