---
phase: quick-260612-a6v
plan: 260612-a6v
slug: homepage-hero-replace
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/public/brand/callit-mark.png
  - apps/web/app/calls/page.tsx
  - apps/web/app/signin/page.tsx
  - apps/web/app/components/HowItWorksModal.tsx
  - apps/web/tests/signin.spec.ts
  - apps/web/tests/how-it-works-modal.test.ts
  - apps/web/tests/landing-hero.test.ts
autonomous: true
requirements: [QUICK-260612-A6V]
must_haves:
  truths:
    - "A first-time (logged-out) visitor to any gated route lands on /signin (D-12 middleware bounce — middleware.ts NOT modified) which now renders the acid hero design from 'call it homepage/CALL IT Hero.dc.html' verbatim: #D4F500 frame (padding 14px), #0A0A0A rounded-28px panel, 3 atmosphere layers (glass columns + top glow + ci-bloom bottom bloom), glass nav, ci-pulse badge ('Stake smarter · Call it public'), clamp(64px, 8.6vw, 124px) Archivo Black 'BE RIGHT / IN PUBLIC.' headline, sub copy, 2 CTAs, and the 3 staggered glass demo cards veda / jaxon.eth / degen_oracle (user request 2026-06-12: 'replace it with exactly what is in that folder')"
    - "Nav center glass pill container carries a SINGLE 'How it works' pill (the design's Market/Leaderboard/Dashboard pills are REMOVED per the user) styled like the design's active pill; clicking it opens the EXISTING HowItWorksModal, whose 'MAKE YOUR FIRST CALL ▸' onPrimaryCta closes the modal and opens the signin modal (user: 'should be replaced with a how it works text')"
    - "Nav 'Sign In →' cream pill AND hero 'MAKE YOUR FIRST CALL →' cream CTA both open the signup/signin modal hosting the EXISTING Privy rail — PrivyErrorBoundary (data-testid='privy-error-fallback'), dynamic ssr:false SignInButtons (D-33 order — SignInButtons.tsx is NEVER modified), CustodyTooltip (AUTH-38 'custodied by Privy' copy, role='tooltip'), and the AUTH-37 disclaimer (data-testid='disclaimer', href='/terms', 'Terms &amp; Conditions') all copied through VERBATIM (user: 'when they click make your first call, it should prompt them to signup')"
    - "The signin modal wrapper is ALWAYS-MOUNTED in the DOM — display-toggled (`display: signinOpen ? 'flex' : 'none'` + `aria-hidden={!signinOpen}`), NEVER conditionally rendered around SignInButtons — so the privy-token cookie-write/self-heal effect (SignInButtons.tsx:114-153) mounts on page load: already-authenticated visitors still bounce off /signin and expired-cookie returning sessions still self-heal"
    - "'See Live Calls' glass CTA is a Link to /calls — a NEW public route re-exporting the tape (app/page.tsx default export); it is public because middleware's existing '/call' PUBLIC_PREFIX matches '/calls' via startsWith — ZERO middleware change (user: 'when they click live calls it should take them to see current live calls')"
    - "The logo renders via next/image from a STATIC IMPORT of apps/web/public/brand/callit-mark.png (served from /_next/static/media/*, excluded by the middleware matcher) — never a raw /brand/ URL, which the matcher would 307-bounce to /signin for logged-out visitors"
    - "The page works at 375px (Phase 9 mandate): nav wraps, CTA row wraps, the 3 demo cards stack vertically center-card-first with rotations zeroed — all via page-local ci-prefixed classes + media queries in one local <style> element; desktop ≥861px renders the staggered/rotated design EXACTLY; the 3 demo cards are STATIC decorative marketing art on a logged-out surface (D-07 does not apply — documented in the file header)"
    - "Test pins migrate honestly (D-15): signin.spec.ts Tier 1 updates clamp → 'clamp(64px, 8.6vw, 124px)' and 'LIVE NOW' → 'Stake smarter'; Tier 2 gains a modal-open step + signin-modal-buttons scoping; how-it-works-modal.test.ts lockstep re-anchors to modal-as-single-canon; NEW landing-hero.test.ts pins the user removals, CTA wiring, the always-mounted invariant, asset honesty, the /calls route + middleware '/call' dependency, and the ci-pulse/ci-bloom keyframes — every migrated pin comments quick-260612-a6v + user homepage replacement 2026-06-12"
    - "Gates: `pnpm --filter @call-it/web build` exit 0 AND `pnpm --filter @call-it/web exec vitest run` ALL green (366 baseline may drift — all-green is the gate, not the count); ONE atomic commit staging exactly the 7 explicit paths; NO push; 'call it homepage/' is READ-ONLY reference and never staged"
  artifacts:
    - path: "apps/web/app/signin/page.tsx"
      provides: "The acid hero landing — full design-canon rewrite hosting the untouched Privy rail in an always-mounted modal"
      min_lines: 350
      contains: "signinOpen"
    - path: "apps/web/app/calls/page.tsx"
      provides: "Public live-calls route — header-commented re-export of the tape"
      contains: "from '../page'"
    - path: "apps/web/public/brand/callit-mark.png"
      provides: "Logo mark copied from the design folder uploads"
    - path: "apps/web/tests/landing-hero.test.ts"
      provides: "Source-assert pins: nav removals, CTA wiring, always-mounted SignInButtons invariant, static-import asset honesty, /calls + middleware '/call' dependency, keyframes, demo-card fidelity"
      contains: "ci-bloom"
    - path: "apps/web/tests/signin.spec.ts"
      provides: "Updated Tier 1 pins (8.6vw clamp, Stake smarter) + Tier 2 modal-open steps with signin-modal-buttons scoping"
      contains: "clamp(64px, 8.6vw, 124px)"
    - path: "apps/web/tests/how-it-works-modal.test.ts"
      provides: "Copy-canon lockstep re-anchored: modal = single canon; signin pins the HowItWorksModal mount + 'How it works' trigger"
      contains: "HowItWorksModal"
  key_links:
    - from: "apps/web/app/signin/page.tsx"
      to: "apps/web/app/signin/SignInButtons.tsx"
      via: "dynamic ssr:false import inside the always-mounted modal"
      pattern: "dynamic\\(\\(\\) => import\\('./SignInButtons'\\)"
    - from: "apps/web/app/signin/page.tsx"
      to: "apps/web/app/components/HowItWorksModal.tsx"
      via: "named import + JSX mount; onPrimaryCta chains into setSigninOpen(true)"
      pattern: "HowItWorksModal"
    - from: "apps/web/app/signin/page.tsx"
      to: "/calls"
      via: "Link on the See Live Calls glass CTA"
      pattern: "href=\"/calls\""
    - from: "apps/web/app/calls/page.tsx"
      to: "apps/web/app/page.tsx"
      via: "default re-export"
      pattern: "export \\{ default \\} from '../page'"
    - from: "apps/web/middleware.ts"
      to: "/calls"
      via: "existing '/call' PUBLIC_PREFIX startsWith match (NOT modified — mirror-read by landing-hero.test.ts)"
      pattern: "'/call'"
---

<objective>
Replace the homepage first-time visitors see (user request 2026-06-12, verbatim intent): the logged-out landing — which is /signin under the D-12 middleware bounce — is rewritten to the single-viewport acid hero in `call it homepage/CALL IT Hero.dc.html`, EXACTLY as designed, with exactly three user-mandated deltas: (1) the Market/Leaderboard/Dashboard nav pills become one "How it works" pill (opens the existing HowItWorksModal); (2) "See Live Calls" navigates to the live tape (new public /calls route); (3) "MAKE YOUR FIRST CALL →" (and "Sign In →") prompt signup via an always-mounted modal hosting the EXISTING, untouched Privy auth rail.

Purpose: the user does not like the current homepage; the new hero is the approved design canon.
Output: rewritten signin/page.tsx, new app/calls/page.tsx, copied logo asset, comment-only HowItWorksModal canon re-anchor, migrated test pins (signin.spec.ts, how-it-works-modal.test.ts), new landing-hero.test.ts. Single atomic commit, 7 staged paths, no push (orchestrator pushes).

All decisions are MADE (orchestrator-verified 2026-06-12) — do not re-litigate the target file, the modal architecture, the /calls re-export, the static-import asset path, page-local fonts/colors, or the test relocations.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
READ-ONLY design canon (NEVER staged): `call it homepage/CALL IT Hero.dc.html` — copy every gradient/border/shadow/blur/spacing value VERBATIM from it. The logo asset is `call it homepage/uploads/1781243145765.png`.

@apps/web/app/signin/page.tsx                    # CURRENT page — donor for the verbatim carry-overs: PrivyErrorBoundary (lines 39-68), CustodyTooltip (73-112), SignInButtons dynamic import (118-136), AUTH-37 disclaimer JSX (284-301). Everything else is deleted.
@apps/web/app/signin/SignInButtons.tsx           # NEVER MODIFIED. The cookie-write/self-heal effect at 114-153 is WHY the modal must be always-mounted. Props: { CustodyTooltip: React.ComponentType<{children}> }.
@apps/web/app/components/HowItWorksModal.tsx     # Reused as-is (props { open, onClose, onPrimaryCta }); ONLY its copy-canon comments change (Task 3).
@apps/web/middleware.ts                          # NOT MODIFIED. '/call' PUBLIC_PREFIX (line 71) makes /calls public via startsWith. Matcher (line 205) excludes only _next/static|_next/image|favicon.ico|public/ — raw /brand/ URLs WOULD bounce; static import serves from /_next/static/media/* which is excluded.
@apps/web/app/layout.tsx                         # NOT MODIFIED. Loads Archivo 700/800/900 (--font-archivo), Inter, JBM (--font-jetbrains-mono). Archivo Black is NOT loaded — page-local next/font load required.
@apps/web/app/components/AppShell.tsx            # NOT MODIFIED. fullBleed only for /signin + /onboarding/* (line 47) — /calls intentionally renders the tape INSIDE the app chrome (signed-out-safe: auth-aware CTAs, public /call/:id links).
@apps/web/app/page.tsx                           # NOT MODIFIED. The tape — default export `HomePage` (line 149), 'use client'. /calls re-exports it.
@apps/web/tests/signin.spec.ts                   # Tier 1 source pins (update 2 pins in the D-12/D-07 test) + Tier 2 browser tests (insert modal-open step, scope D-33 ordering).
@apps/web/tests/how-it-works-modal.test.ts       # Lockstep describe (lines 55-72) re-anchors; page.tsx (tape) describes at 74-94 UNTOUCHED.
@apps/web/tests/presentation-sweep.test.ts       # Source-assert convention donor for landing-hero.test.ts: read() helper (readFileSync + join(process.cwd(), ...)), node env, vitest globals:false (explicit imports).
@apps/web/vitest.config.ts                       # include tests/**/*.test.ts, node env. '@' alias mirrors tsconfig (@/* -> apps/web root, COVERS /public).
</context>

<tasks>

<task type="auto">
  <name>Task 1: Copy the logo asset + create the public /calls tape route</name>
  <files>apps/web/public/brand/callit-mark.png, apps/web/app/calls/page.tsx</files>
  <action>
1. Copy the logo asset (Git Bash, quote the spaces):
   `mkdir -p "apps/web/public/brand" && cp "call it homepage/uploads/1781243145765.png" "apps/web/public/brand/callit-mark.png"` from the repo root. Copy ONLY this one file — never touch or stage anything else under `call it homepage/`.

2. Create NEW FILE `apps/web/app/calls/page.tsx` containing a header comment block plus a single re-export line: `export { default } from '../page';`

   The header comment must document (cite quick-260612-a6v + user request 2026-06-12):
   - WHY this route exists: `/` is auth-gated by middleware (signed-out → /signin) and must STAY gated so first-time visitors land on the new acid-hero landing; the landing's "See Live Calls" CTA needs a logged-out-reachable view of the live tape.
   - WHY it is public with ZERO middleware change: middleware.ts PUBLIC_PREFIXES carries '/call' (the public receipt prefix) and isPublicRoute() matches via startsWith — '/calls'.startsWith('/call') === true. This is a load-bearing dependency: if '/call' is ever renamed/removed, /calls silently re-gates (landing-hero.test.ts mirror-reads the prefix to flag this).
   - The tape renders signed-out-safe (relayer-backed feed, auth-aware NEW CALL handler, public /call/:id links) and intentionally renders INSIDE the AppShell chrome (fullBleed is /signin + /onboarding/* only).
  </action>
  <verify>
    <automated>cd "apps/web" && test -f public/brand/callit-mark.png && cmp -s public/brand/callit-mark.png "../../call it homepage/uploads/1781243145765.png" && grep -c "export { default } from '../page'" app/calls/page.tsx</automated>
  </verify>
  <done>callit-mark.png byte-identical to the design upload; app/calls/page.tsx exists with the documented re-export; nothing else created or modified.</done>
</task>

<task type="auto">
  <name>Task 2: Rewrite apps/web/app/signin/page.tsx to the acid hero design</name>
  <files>apps/web/app/signin/page.tsx</files>
  <action>
RE-READ `apps/web/app/signin/page.tsx`, `apps/web/app/signin/SignInButtons.tsx`, and the design file `call it homepage/CALL IT Hero.dc.html` IMMEDIATELY BEFORE EDITING — a parallel session shares this tree; line references below are 2026-06-12 snapshots, not guarantees.

REWRITE the page ('use client' stays). This is a full-file replacement; preserve VERBATIM only the four donor blocks listed in CARRY-OVERS.

── FILE HEADER COMMENT ──
Replace the current header with: the logged-out landing is now the acid hero from `call it homepage/CALL IT Hero.dc.html` (user request 2026-06-12, quick-260612-a6v — "replace it with exactly what is in that folder"). Document: (a) D-12 unchanged — middleware bounces unauthenticated visits here; AppShell renders /signin full-bleed; (b) the three user deltas (How it works pill replaces Market/Leaderboard/Dashboard; See Live Calls → /calls; MAKE YOUR FIRST CALL → signup modal); (c) the three demo call cards (veda / jaxon.eth / degen_oracle) are STATIC decorative marketing art on a logged-out surface — D-07 does not apply (they are not app data surfaces); (d) the ALWAYS-MOUNTED signin-modal invariant (see MODAL below); (e) the static-import logo rationale (middleware matcher excludes only _next/static|_next/image|favicon.ico — a raw /brand/ URL would 307-bounce logged-out visitors; static imports serve from /_next/static/media/* which IS excluded); (f) preserved requirement pins: AUTH-37, AUTH-38, T-09.2-35 (privy-error-fallback), D-33 (SignInButtons untouched).

── MODULE-SCOPE SETUP ──
- Imports: `React, { Component, useEffect, useState }` from 'react'; `dynamic` from 'next/dynamic'; `Link` from 'next/link'; `Image` from 'next/image'; `Archivo, Archivo_Black` from 'next/font/google'; `{ HowItWorksModal }` from '../components/HowItWorksModal'; static asset `import callitMark from '@/public/brand/callit-mark.png';` (the '@' alias maps to the apps/web root and covers /public — confirmed in tsconfig). DROP the useIsMobile import (CSS media queries replace it).
- Fonts (page-local, layout.tsx untouched): `const archivoBlack = Archivo_Black({ weight: '400', subsets: ['latin'] });` and `const archivo = Archivo({ weight: ['500', '600', '700', '800'], subsets: ['latin'] });` at module scope. Apply `archivo.className` on the page root; apply `style={{ fontFamily: archivoBlack.style.fontFamily }}` on Archivo Black elements (wordmark, h1, avatar letters). JetBrains Mono: reuse the existing `var(--font-jetbrains-mono)` for all mono text.
- Colors stay page-local literals: #D4F500, #0A0A0A, #F5F0E6, #FF4D6D, #B387FF, #9A9A90, #6E6E66. Do NOT add tokens to globals.css; do NOT substitute var(--accent-win) (#E8F542 ≠ #D4F500).

── CARRY-OVERS (copy from the CURRENT page.tsx BYTE-FOR-BYTE — signin.spec.ts Tier 1 pins their strings in this file's source) ──
1. `PrivyErrorBoundary` class component incl. `data-testid="privy-error-fallback"` (current lines 39-68).
2. `CustodyTooltip` function incl. `role="tooltip"` and the "custodied by Privy until you export. You can export at any time from Settings." copy (current lines 73-112) — keep its var(--*) styles verbatim even though the page idiom changed.
3. The `SignInButtons` dynamic import with ssr:false + the 3-element loading skeleton (current lines 118-136).
4. The AUTH-37 disclaimer paragraph: `data-testid="disclaimer"`, copy "By signing in, you&apos;re agreeing to our" + `<Link href="/terms">` "Terms &amp; Conditions" + "." — copy + testid + href verbatim; ONLY restyle colors to fit the dark glass panel (body text #9A9A90, link #D4F500 underline).

── STATE (lock these names — landing-hero.test.ts pins them) ──
`const [signinOpen, setSigninOpen] = useState(false);` and `const [howOpen, setHowOpen] = useState(false);` plus one Escape useEffect gated on `signinOpen` (window keydown, `e.key === 'Escape'` → `setSigninOpen(false)`, cleanup on unmount). HowItWorksModal carries its own Escape listener — do not duplicate for it.

── STYLING RULE (load-bearing — get this right) ──
Inline `style={{}}` beats stylesheet selectors, so ANY element with a :hover effect or a media-query override must get ALL of its overridable properties from a `ci-`-prefixed class declared in the page-local `<style>` element (a plain `<style>{`...`}</style>` with a template literal child — NOT styled-jsx). Elements with no hover/responsive behavior may use inline styles copied from the design. Class-prefix everything `ci-` to avoid colliding with globals.css.

── COMPONENT TREE (top → bottom; copy all values from the design file verbatim) ──
PAGE ROOT div — className includes `archivo.className`; min-height 100vh, background #D4F500, padding 14px.
  INNER PANEL div — position relative, overflow hidden, background #0A0A0A, border-radius 28px, min-height calc(100vh - 28px), display flex, flex-direction column, align-items stretch.
    ATMOSPHERE (3 absolute pointer-events-none divs, design lines 26-28): (1) inset-0 repeating-linear-gradient(90deg, rgba(255,255,255,0.025) 0-1px, transparent 1px-120px); (2) top radial acid glow — left 50%, top -340px, translateX(-50%), 1100x700, radial-gradient ellipse rgba(212,245,0,0.13)→0.05@40%→transparent@70%; (3) bottom acid bloom — left 50%, bottom -420px, translateX(-50%), 1500x900, `animation: ci-bloom 6s ease-in-out infinite`, radial-gradient rgba(212,245,0,0.30)→0.12@35%→0.04@55%→transparent@72%.
    NAV div (`ci-nav` class for the wrap behavior) — relative z-5, flex, align-items center, justify-content space-between, padding 22px 36px, gap 24px:
      Left (flex 1, gap 12): `<Image src={callitMark} alt="CALL IT mark" width={34} height={34} style={{ objectFit: 'contain' }} />` + "CALL IT" span (Archivo Black 19px, letter-spacing 0.02em, #FFFFFF).
      Center glass pill container (radius 999px, padding 5px, rgba(255,255,255,0.05) bg, 1px rgba(255,255,255,0.10) border, backdrop-filter blur(14px) + -webkit-): ONE `<button>` "How it works" — the design's ACTIVE pill recipe (padding 8px 18px, radius 999px, rgba(212,245,0,0.14) bg, 1px rgba(212,245,0,0.35) border, #D4F500, 13px weight 700, letter-spacing 0.02em, cursor pointer) — onClick `() => setHowOpen(true)`. The design's Market/Leaderboard/Dashboard pills are NOT rendered (user removal — the new test pins their absence).
      Right (flex 1, justify-content flex-end): `<button className="ci-signin-btn">Sign In →</button>` — cream pill (#F5F0E6 bg, #0A0A0A text, radius 999px, padding 11px 22px, Archivo 800 13px uppercase letter-spacing 0.04em, no border, cursor pointer); `:hover` → background #FFFFFF + transform translateY(-1px) (class-based). onClick `() => setSigninOpen(true)`.
    HERO div — relative z-4, flex column, align-items center, text-align center, padding 64px 32px 0 (class `ci-hero` for the mobile padding override):
      Pulse badge (glass pill: flex, gap 9px, padding 8px 18px, radius 999px, rgba(212,245,0,0.07) bg, 1px rgba(212,245,0,0.25) border, blur(10px)): 7px circle span #D4F500 with `animation: ci-pulse 2s ease-in-out infinite` + text span (var(--font-jetbrains-mono), 11px, 500, letter-spacing 0.14em, #D4F500, uppercase) "Stake smarter · Call it public".
      h1 — margin 30px 0 0, Archivo Black, font-size clamp(64px, 8.6vw, 124px), line-height 0.92, letter-spacing -0.025em, #FFFFFF: `BE RIGHT<br />` then `<span style={{ color: '#D4F500' }}>IN PUBLIC.</span>`. (Tier 1 pins: 'BE RIGHT', 'IN PUBLIC.', the exact clamp string.)
      Sub p — margin 28px 0 0, max-width 520px, 19px, line-height 1.55, weight 500, #9A9A90: "A reputation market for crypto calls. Stake on what you believe. Get a receipt that lasts forever."
      CTA row (class `ci-cta-row`: flex, align-items center, gap 14px, margin-top 36px; mobile: flex-wrap + justify-content center):
        `<button className="ci-cta-primary">MAKE YOUR FIRST CALL →</button>` — cream pill (#F5F0E6, #0A0A0A, radius 999px, padding 17px 32px, Archivo 800 14px uppercase letter-spacing 0.05em, no border, cursor pointer); :hover background #FFFFFF + translateY(-2px). onClick `() => setSigninOpen(true)`.
        `<Link href="/calls" className="ci-cta-secondary">See Live Calls</Link>` — glass pill (rgba(255,255,255,0.03) bg, #FFFFFF text, 1px rgba(255,255,255,0.22) border, radius 999px, padding 16px 30px, blur(10px), Archivo 700 14px uppercase letter-spacing 0.05em, text-decoration none, display block); :hover border-color rgba(212,245,0,0.6) + color #D4F500 + background rgba(212,245,0,0.06).
    CARDS row (class `ci-cards`: relative z-4, flex, justify-content center, align-items flex-start, gap 0, margin-top 74px, padding 0 24px) — three NON-INTERACTIVE divs (no links, design lines 71-131; copy gradients/borders/shadows/blurs/typography VERBATIM; JSX-escape the `>` in the jaxon statement). Card positioning (transform, margins, width, z-index) and hover transforms live in classes `ci-card-left` / `ci-card-center` / `ci-card-right`; static visuals may stay inline:
      LEFT `ci-card-left` (veda): transform translateY(26px) rotate(-2.5deg), margin-right -26px, z-1, width 340px, padding 22px 24px, radius 18px, linear-gradient(160deg, rgba(212,245,0,0.07), rgba(255,255,255,0.04) 45%, rgba(255,255,255,0.015)), 1px rgba(255,255,255,0.13) border, blur(18px), box-shadow inset 0 1px 0 rgba(255,255,255,0.14) + 0 24px 60px rgba(0,0,0,0.55), transition transform 0.25s ease; :hover translateY(16px) rotate(-2deg) scale(1.02). Content: 28px #FF4D6D avatar square "V" (Archivo Black 13px #0A0A0A, radius 8px) · "veda" 14px 700 white · "1h ago" mono 11px #6E6E66 · "92% CONV" chip (4px 9px, radius 6, rgba(212,245,0,0.14) bg, 1px rgba(212,245,0,0.4) border, mono 10px 700 ls 0.08em #D4F500) · statement "ETH reclaims $4,200 by Friday close. Mark it." (16px 700 white, margin 16px 0 0) · "$1000 stake · 490 positions" (mono 11px #6E6E66) · split bar 79%/21% (7px tall, gap 3px, acid bar width 79% with 0 0 12px rgba(212,245,0,0.45) glow, #FF4D6D remainder, radius 99px) + mono legend 79% acid / "/" #6E6E66 / 21% #FF4D6D.
      CENTER `ci-card-center` (jaxon.eth, raised): transform translateY(-18px), z-3, width 390px, padding 26px 28px, radius 20px, linear-gradient(160deg, rgba(212,245,0,0.11), rgba(255,255,255,0.05) 45%, rgba(255,255,255,0.02)), 1px rgba(212,245,0,0.30) acid-tinted border, blur(22px), box-shadow inset 0 1px 0 rgba(255,255,255,0.18) + 0 0 50px rgba(212,245,0,0.10) + 0 32px 80px rgba(0,0,0,0.6); :hover translateY(-26px) scale(1.01). Content: 30px #D4F500 avatar "J" (radius 9px) · "jaxon.eth" 15px 700 · "12m ago" · glowing "78% CONV" chip (5px 10px, rgba(212,245,0,0.18) bg, 1px rgba(212,245,0,0.5) border, mono 11px, box-shadow 0 0 18px rgba(212,245,0,0.18)) · statement "ARB outperforms OP by {'>'}5% over the next 7 days." (18px 700, margin 18px 0 0) · "$250 stake · 209 positions" · split bar 68%/32% (8px tall, glow 0 0 14px rgba(212,245,0,0.5)).
      RIGHT `ci-card-right` (degen_oracle): mirror of LEFT with rotate(2.5deg), margin-left -26px; :hover translateY(16px) rotate(2deg) scale(1.02). Content: 28px #B387FF avatar "O" · "degen_oracle" · "3h ago" · "64% CONV" chip · "Pendle TVL crosses $9B by month end." · "$420 stake · 132 positions" · split bar 69%/31%.
    BOTTOM SPACER div — relative z-4, flex justify-content center, padding 58px 24px 36px, margin-top auto, EMPTY (comment: the design's bottom microcopy div is empty; keep the spacer so the bloom composition matches; the design's block-counter script is unused — NOT ported).
  AFTER the inner panel, still inside the page root:
    `<HowItWorksModal open={howOpen} onClose={() => setHowOpen(false)} onPrimaryCta={() => { setHowOpen(false); setSigninOpen(true); }} />` — the modal's MAKE YOUR FIRST CALL ▸ becomes the signup prompt (user-requested behavior).
    SIGNIN MODAL — CRITICAL INVARIANT, comment it in the JSX: SignInButtons carries the privy-token cookie-write effect (SignInButtons.tsx:114-153) that (a) redirects already-authenticated visitors off /signin and (b) self-heals returning users whose localStorage session is live but whose cookie expired. It MUST mount on page load. Therefore the wrapper is ALWAYS in the DOM — `display: signinOpen ? 'flex' : 'none'` + `aria-hidden={!signinOpen}` on the fixed overlay — NEVER `{signinOpen && ...}` around SignInButtons (display:none does not block React mount/effects; conditional rendering does).
      Overlay div: position fixed, inset 0, z-index 200, rgba(0,0,0,0.8) bg + backdrop-filter blur, align-items center, justify-content center, padding ~40px 20px; onClick backdrop-close via `e.target === e.currentTarget` → setSigninOpen(false).
      Panel div `data-testid="signin-modal"` (Tier 2 scoping hook): dark glass matching the hero idiom — #0A0A0A (or near) bg, 1px rgba(255,255,255,0.13) border, border-radius 20px, padding ~32px, width min(92vw, 420px), backdrop blur, inset highlight shadow like the cards (inset 0 1px 0 rgba(255,255,255,0.14) + a deep drop shadow); onClick stopPropagation. Content top→bottom:
        ✕ close button top-right — transparent, no border, rgba(255,255,255,0.55) color, min 44x44 hit target, `aria-label="Close"`, onClick setSigninOpen(false).
        Heading "SIGN IN TO CALL IT" (Archivo Black, ~20-22px, #FFFFFF) + one-line sub (13px #9A9A90, e.g. "Wallet, Google, or X — your call, on the record.").
        Buttons wrapper div `data-testid="signin-modal-buttons"` (flex column, gap 1rem): `<PrivyErrorBoundary><SignInButtons CustodyTooltip={CustodyTooltip} /></PrivyErrorBoundary>`.
        The AUTH-37 disclaimer paragraph (carry-over #4).
    LOCAL `<style>` element (template literal child): `@keyframes ci-pulse` (0%,100% opacity 1; 50% opacity 0.25) and `@keyframes ci-bloom` (0%,100% opacity 0.85; 50% opacity 1); the ci- classes above incl. all :hover rules; and `@media (max-width: 860px)`: `.ci-nav` flex-wrap wrap + tighter padding (logo row + pills row); `.ci-hero` padding ~48px 16px 0; `.ci-cta-row` flex-wrap wrap + justify-content center; `.ci-cards` flex-direction column + align-items center + gap 18px + margin-top 48px; `.ci-card-left/.ci-card-center/.ci-card-right` transform none, margin 0, width 100%, max-width 390px; `.ci-card-center` order -1 (center card FIRST). The h1 clamp floors at 64px — verify "BE RIGHT" fits 375px at line-height 0.92 (it does); only if real overflow appears is a 48px floor acceptable, prefer the design value.

── DELETIONS (nothing else survives) ──
The LIVE NOW strip, LP_HERO_HEADLINE const + old hero block (clamp(64px, 10vw, 132px)), the inline SignInButtons section + "no waitlist" microcopy line, HOW_IT_WORKS array + three-step section (canon moves to HowItWorksModal — Task 3), DIFFERENTIATORS, FEES table, risk callout, footer, useIsMobile usage. The new page is the single-viewport hero only.
  </action>
  <verify>
    <automated>cd "apps/web" && grep -c "clamp(64px, 8.6vw, 124px)" app/signin/page.tsx && grep -c "Stake smarter" app/signin/page.tsx && grep -c "data-testid=\"signin-modal\"" app/signin/page.tsx && grep -c "aria-hidden={!signinOpen}" app/signin/page.tsx && grep -c "href=\"/calls\"" app/signin/page.tsx && grep -c "callit-mark" app/signin/page.tsx && grep -c "privy-error-fallback" app/signin/page.tsx && grep -c "custodied by Privy" app/signin/page.tsx && grep -c "data-testid=\"disclaimer\"" app/signin/page.tsx && ! grep -E "\{signinOpen &&" app/signin/page.tsx && ! grep -c ">Leaderboard<" app/signin/page.tsx</automated>
  </verify>
  <done>signin/page.tsx is the acid hero: design-verbatim values, How it works pill (no Market/Leaderboard/Dashboard), always-mounted display-toggled signin modal hosting the four verbatim carry-overs, See Live Calls → /calls Link, static-import logo, page-local fonts/keyframes/hover/media queries, all Tier 1 pin strings present in source.</done>
</task>

<task type="auto">
  <name>Task 3: Re-anchor HowItWorksModal copy-canon comments (comment-only edit)</name>
  <files>apps/web/app/components/HowItWorksModal.tsx</files>
  <action>
RE-READ the file first (parallel-session drift). COMMENT-ONLY edit — zero changes to code, JSX, or any string literal (how-it-works-modal.test.ts pins STEP bodies, 'Three steps. One receipt.', a11y attributes, the CTA label; all must stay byte-identical).

Update the two copy-canon comment blocks:
1. File header (lines ~1-17): the signin page no longer renders the three-step section — this modal is now the SINGLE copy canon for the how-it-works steps, and the landing (apps/web/app/signin/page.tsx) MOUNTS this modal from its "How it works" nav pill. Cite quick-260612-a6v + user request 2026-06-12 (homepage replaced with the acid hero). Keep the D-13 chrome provenance note and the static-content note as-is.
2. The STEPS array comment (lines ~29-30, "Copy canon: apps/web/app/signin/page.tsx HOW_IT_WORKS array — byte-identical duplicate..."): re-anchor — STEPS is now the canonical source (the signin HOW_IT_WORKS duplicate was deleted in quick-260612-a6v); the lockstep test now guards this file alone plus the landing's mount/trigger linkage.
  </action>
  <verify>
    <automated>cd "apps/web" && grep -c "quick-260612-a6v" app/components/HowItWorksModal.tsx && grep -c "Three steps. One receipt." app/components/HowItWorksModal.tsx && grep -c "GO ON RECORD" app/components/HowItWorksModal.tsx && git diff --unified=0 -- app/components/HowItWorksModal.tsx | grep -E "^[+-]" | grep -vE "^[+-]{3}" | grep -vE "^[+-]\s*(/?\*|//)" | wc -l | grep -q "^0$"</automated>
  </verify>
  <done>Both canon comments cite quick-260612-a6v and describe the modal as single canon; git diff shows ONLY comment-line changes; every pinned string untouched.</done>
</task>

<task type="auto">
  <name>Task 4: Migrate test pins, add landing-hero.test.ts, run gates, commit atomically</name>
  <files>apps/web/tests/signin.spec.ts, apps/web/tests/how-it-works-modal.test.ts, apps/web/tests/landing-hero.test.ts</files>
  <action>
RE-READ each test file immediately before editing. Every migrated/changed pin gets a comment citing quick-260612-a6v + user homepage replacement 2026-06-12 (D-15 honest relocation — never silently weaken a pin).

A. `apps/web/tests/signin.spec.ts`:
   - 'D-12/D-07: Landing hero' Tier 1 test: change `expect(source).toContain('clamp(64px, 10vw, 132px)')` → `'clamp(64px, 8.6vw, 124px)'` and `toContain('LIVE NOW')` → `toContain('Stake smarter')` (the new pulse-badge copy). KEEP 'BE RIGHT', 'IN PUBLIC.', the not-8,442 / not-$284K assertions, and 'privy-error-fallback' (all still true). Update the test's narrative comment: canon is now `call it homepage/CALL IT Hero.dc.html` (acid hero), the LIVE NOW strip is gone, demo cards are decorative.
   - AUTH-37 + AUTH-38 Tier 1 tests: UNCHANGED (disclaimer + custody copy stay in page.tsx source inside the modal).
   - Tier 2 (all 6 browser tests, skipped without a real Privy ID but must stay correct): after each `page.goto('/signin')` (and its waitForLoadState where present), INSERT the modal-open step `await page.getByRole('button', { name: /sign in/i }).first().click();` with a comment (the Privy rail now lives inside the always-mounted signin modal; the nav "Sign In →" button is first in DOM order — the modal's own auth buttons are aria-hidden/display:none until opened). In 'renders 3 buttons in D-33 order', scope the query to the modal buttons wrapper so nav/CTA/✕ buttons don't pollute order indexes: `const buttons = page.getByTestId('signin-modal-buttons').getByRole('button');` (testid added in Task 2), keeping the texts[0..2] assertions.

B. `apps/web/tests/how-it-works-modal.test.ts`:
   - Replace ONLY the lockstep describe (lines ~55-72). New describe comment: the landing no longer duplicates the step bodies (quick-260612-a6v); the modal IS the single canon — guard the modal verbatim + the landing's mount linkage that replaced the duplicated copy. Two its, keeping the STEP_BODIES const:
     (i) 'modal carries all 3 step bodies verbatim (single canon)' — each STEP_BODIES entry `toContain` in the modal source only.
     (ii) 'signin landing mounts the modal and carries the How it works trigger' — signin source `toContain('HowItWorksModal')` and `toContain('How it works')`.
   - All other describes UNTOUCHED (they pin the modal file + the tape's app/page.tsx trigger — both unchanged).

C. NEW `apps/web/tests/landing-hero.test.ts` — source-assert vitest, presentation-sweep convention: explicit `import { describe, it, expect } from 'vitest'` (globals:false), `readFileSync`/`existsSync` + `join(process.cwd(), ...)` read() helper, node env. Header comment: pins for the quick-260612-a6v homepage replacement (user request 2026-06-12). Describes/assertions:
   1. user-removal pins: signin page source does NOT contain `>Market<`, `>Leaderboard<`, `>Dashboard<`; DOES contain `How it works`.
   2. CTA wiring: contains `MAKE YOUR FIRST CALL`; contains `See Live Calls` AND `href="/calls"`; contains `Sign In` trigger.
   3. cookie-self-heal invariant (comment WHY: SignInButtons' privy-token cookie-write effect must mount on page load — redirects authed visitors off /signin and self-heals expired cookies): contains `display: signinOpen`; contains `aria-hidden={!signinOpen}`; does NOT match `/\{signinOpen && [\s\S]{0,80}SignInButtons/` (regex guard against conditional rendering); contains `dynamic(() => import('./SignInButtons')`.
   4. asset honesty: contains `callit-mark` (static import) and does NOT contain `src="/brand/` (comment: raw public URLs bounce through the middleware matcher for logged-out visitors).
   5. demo-card design fidelity (decorative, documented): contains `jaxon.eth`, `degen_oracle`, `veda`.
   6. /calls route: `app/calls/page.tsx` exists (existsSync) and contains `from '../page'`; middleware.ts source contains `'/call'` (comment: this startsWith prefix is what makes /calls public with zero middleware change — if the prefix is ever renamed, this test flags the dependency).
   7. keyframes present: signin page source contains `ci-pulse` AND `ci-bloom`.

D. GATES (run from the repo root, Git Bash):
   1. `pnpm --filter @call-it/web build` → exit 0.
   2. `pnpm --filter @call-it/web exec vitest run` → ALL green (366 baseline + the new file; a parallel session shares this tree so counts may drift — all-green is the gate, not the exact count).
   3. Playwright is NOT run locally (CI signin-smoke runs Tier 1 only; Tier 1 is plain readFileSync logic). Eyeball-verify every Tier 1 pin against the rewritten page source: grep each pinned string ('BE RIGHT', 'IN PUBLIC.', 'clamp(64px, 8.6vw, 124px)', 'Stake smarter', 'agreeing to our', 'Terms &amp; Conditions', 'href="/terms"', 'data-testid="disclaimer"', 'custodied by Privy', 'export at any time from', 'role="tooltip"', 'data-testid="privy-error-fallback"') and confirm 8,442/$284K are absent.
   4. The visual-smoke signin.png Playwright baseline is now invalidated — do NOT run or update visual snapshots (box-gated by PLAYWRIGHT_BASE_URL; snapshot dirs are never staged). Record as an operator follow-up in the SUMMARY.

E. COMMIT — single atomic, ONLY after both gates pass. Stage EXACTLY these 7 paths (explicit `git add` per path; NEVER `git add -A` / `git add .` / `-u`):
   `apps/web/app/signin/page.tsx`, `apps/web/app/calls/page.tsx`, `apps/web/public/brand/callit-mark.png`, `apps/web/app/components/HowItWorksModal.tsx`, `apps/web/tests/signin.spec.ts`, `apps/web/tests/how-it-works-modal.test.ts`, `apps/web/tests/landing-hero.test.ts`.
   Before committing, run `git status --short` and confirm nothing from `call it homepage/`, `call it frontend/`, packages/contracts/lib/openzeppelin-contracts, docs/, evidence/, .claude/, .planning/config.json, .gitignore files, soak scripts, visual snapshots, or any parallel-session WIP is staged.
   Message: `feat(quick-260612-a6v): homepage replaced with the acid hero design — glass nav (How it works modal), signup modal on the existing Privy rail, public /calls tape for See Live Calls`
   NO push (orchestrator pushes).
  </action>
  <verify>
    <automated>cd "/c/Users/woshv/Desktop/Call it" && pnpm --filter @call-it/web build && pnpm --filter @call-it/web exec vitest run</automated>
  </verify>
  <done>Both gates green; signin.spec.ts Tier 1 pins match the rewritten source (grep-verified); how-it-works lockstep re-anchored; landing-hero.test.ts passing; one atomic commit on master with exactly 7 staged paths; nothing pushed.</done>
</task>

</tasks>

<verification>
- `pnpm --filter @call-it/web build` exit 0 (typedRoutes accepts the new /calls route; static PNG import resolves via the '@' alias).
- `pnpm --filter @call-it/web exec vitest run` ALL green — including the updated how-it-works-modal.test.ts and the new landing-hero.test.ts.
- Tier 1 of signin.spec.ts grep-verified against the new page source (Playwright not executed locally).
- `git show --stat HEAD` lists exactly the 7 planned paths; `git status` shows `call it homepage/` and all other untracked WIP untouched.
- Manual spot-checks encoded as source pins: no Market/Leaderboard/Dashboard nav strings; `display: signinOpen` toggle (never conditional render around SignInButtons); `href="/calls"`; `callit-mark` static import; ci-pulse/ci-bloom keyframes; middleware.ts unchanged (`git diff HEAD -- apps/web/middleware.ts` empty).
</verification>

<success_criteria>
- Logged-out visit to / bounces to /signin which renders the acid hero design exactly (design-file-verbatim values), with the three user deltas and nothing else changed.
- "How it works" pill opens HowItWorksModal; its CTA chains into the signup modal. "MAKE YOUR FIRST CALL →" and "Sign In →" open the signup modal hosting the untouched Privy rail. "See Live Calls" navigates to the public /calls tape.
- Already-authenticated visitors still bounce off /signin (always-mounted SignInButtons effect) — the invariant is regression-guarded by landing-hero.test.ts.
- 375px renders cleanly (stacked center-first cards, wrapped nav/CTAs); ≥861px renders the staggered design exactly.
- All gates green; single atomic commit; no push; SUMMARY.md written.
</success_criteria>

<output>
Create `.planning/quick/260612-a6v-homepage-hero-replace/SUMMARY.md` when done (template: @$HOME/.claude/gsd-core/templates/summary.md). Record the operator follow-up: the Playwright visual-smoke signin.png baseline is invalidated by the redesign — regenerate on the box with PLAYWRIGHT_BASE_URL when convenient (snapshots never staged from this task).
</output>
